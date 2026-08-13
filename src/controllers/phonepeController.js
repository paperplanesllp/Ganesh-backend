import mongoose from "mongoose";
import Order from "../models/Order.js";
import { createPendingCheckoutOrder } from "../services/checkoutService.js";
import { applyPhonePeResult } from "../services/orderPaymentService.js";
import { getPhonePeOrderStatus, initiatePhonePePayment, validatePhonePeCallback } from "../services/phonepeService.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getPhonePeClient, isPhonePeConfigured } from "../config/phonepe.js";

function frontendUrl() {
  return String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

const checkoutCallbackTypes = new Set([
  "PG_ORDER_COMPLETED",
  "PG_ORDER_FAILED",
  "CHECKOUT_ORDER_COMPLETED",
  "CHECKOUT_ORDER_FAILED",
]);

export function getPhonePeConfiguration(req, res) {
  res.status(200).json({ success: true, enabled: isPhonePeConfigured() });
}

export const createPhonePePayment = asyncHandler(async (req, res) => {
  getPhonePeClient();
  const order = await createPendingCheckoutOrder(req.body, req.user, "phonepe");
  order.phonepe = { merchantOrderId: `GP-${order._id.toString()}`, amount: order.amountInPaise, state: "PENDING" };
  await order.save();

  try {
    const response = await initiatePhonePePayment({
      merchantOrderId: order.phonepe.merchantOrderId,
      amount: order.amountInPaise,
      redirectUrl: `${frontendUrl()}/payment/phonepe/status?orderId=${order._id.toString()}`,
    });
    order.phonepe.phonepeOrderId = response.orderId || "";
    order.phonepe.state = response.state || "PENDING";
    await order.save();
    return res.status(201).json({ success: true, orderId: order._id.toString(), redirectUrl: response.redirectUrl });
  } catch (error) {
    if (error instanceof ApiError) {
      await Order.deleteOne({ _id: order._id, paymentStatus: "pending" });
      throw error;
    }
    order.failureReason = "Unable to initiate PhonePe payment";
    await order.save();
    throw new ApiError(502, "Unable to create PhonePe payment. Please try again.");
  }
});

export const getPhonePeStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.orderId)) throw new ApiError(400, "Invalid order ID");
  const order = await Order.findOne({ _id: req.params.orderId, user: req.user.id });
  if (!order || order.paymentMethod !== "phonepe") throw new ApiError(404, "PhonePe order not found");
  if (!order.phonepe?.merchantOrderId) throw new ApiError(409, "PhonePe payment has not been initiated");

  let response;
  try {
    response = await getPhonePeOrderStatus(order.phonepe.merchantOrderId);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "Unable to confirm PhonePe payment status. Please try again.");
  }
  if (response.merchantOrderId && response.merchantOrderId !== order.phonepe.merchantOrderId) throw new ApiError(502, "PhonePe returned an invalid order reference");
  if (process.env.PHONEPE_MERCHANT_ID && response.merchantId && response.merchantId !== process.env.PHONEPE_MERCHANT_ID) throw new ApiError(502, "PhonePe returned an invalid merchant reference");
  if (Number.isFinite(response.amount) && response.amount !== order.amountInPaise) throw new ApiError(502, "PhonePe returned an invalid order amount");
  const updated = await applyPhonePeResult(order, response);
  res.status(200).json({
    success: true,
    orderId: updated._id.toString(),
    paymentStatus: updated.paymentStatus,
    state: updated.phonepe?.state || "PENDING",
    subtotal: updated.subtotal,
    deliveryCharge: updated.deliveryCharge,
    totalAmount: updated.totalAmount,
  });
});

export const handlePhonePeWebhook = asyncHandler(async (req, res) => {
  const authorization = req.headers.authorization || "";
  const rawBody = typeof req.body === "string" ? req.body : "";
  let callback;
  try {
    callback = validatePhonePeCallback(authorization, rawBody);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return res.status(401).json({ success: false, message: "Invalid webhook authentication" });
  }
  if (!checkoutCallbackTypes.has(String(callback?.type || ""))) {
    return res.status(200).json({ received: true, ignored: true });
  }
  const payload = callback?.payload;
  const merchantOrderId = payload?.merchantOrderId;
  if (!merchantOrderId) return res.status(200).json({ received: true, ignored: true });
  const order = await Order.findOne({ "phonepe.merchantOrderId": merchantOrderId, paymentMethod: "phonepe" });
  if (!order) return res.status(200).json({ received: true, ignored: true });
  if (process.env.PHONEPE_MERCHANT_ID && payload.merchantId && payload.merchantId !== process.env.PHONEPE_MERCHANT_ID) return res.status(400).json({ success: false, message: "Invalid webhook merchant reference" });
  if (Number.isFinite(payload.amount) && payload.amount !== order.amountInPaise) return res.status(400).json({ success: false, message: "Invalid webhook order amount" });
  await applyPhonePeResult(order, payload);
  return res.status(200).json({ received: true });
});
