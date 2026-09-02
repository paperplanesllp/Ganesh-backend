import { createHash } from "crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import { createPendingCheckoutOrder } from "../services/checkoutService.js";
import { applyPhonePeResult, applyPhonePeWebhookResult } from "../services/orderPaymentService.js";
import { getPhonePeOrderStatus, initiatePhonePePayment, validatePhonePeCallback } from "../services/phonepeService.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getPhonePeClient, getPhonePeConfigurationStatus } from "../config/phonepe.js";

function phonePeRedirectBaseUrl() {
  const configuredFrontendUrl = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");

  let url;
  try {
    url = new URL(configuredFrontendUrl);
  } catch {
    throw new ApiError(503, "PhonePe payment is currently unavailable.");
  }

  // PhonePe must return to a publicly reachable HTTPS URL. Do not silently use
  // a localhost fallback in a deployed service, as PhonePe rejects that URL.
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new ApiError(503, "PhonePe payment is currently unavailable.");
  }

  return `${url.toString().replace(/\/$/, "")}/payment/phonepe/status`;
}

const checkoutCallbackTypes = new Set([
  "PG_ORDER_COMPLETED",
  "PG_ORDER_FAILED",
  "CHECKOUT_ORDER_COMPLETED",
  "CHECKOUT_ORDER_FAILED",
]);

function safePhonePeErrorDetails(error) {
  const details = error?.response?.data ?? error?.data ?? error?.details ?? error?.error;
  if (details === undefined || details === null) return undefined;

  const redact = (value, key = "") => {
    if (/secret|authorization|token|password|jwt/i.test(key)) return "[REDACTED]";
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => redact(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).slice(0, 30).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
    }
    return typeof value === "string" ? value.slice(0, 1000) : value;
  };

  return redact(details);
}

function logPhonePeError(operation, error, merchantOrderId) {
  console.error(`[PhonePe] ${operation} failed`, {
    merchantOrderId,
    name: error?.name,
    type: error?.type,
    httpStatusCode: error?.httpStatusCode ?? error?.statusCode ?? error?.status ?? error?.response?.status,
    code: error?.code || error?.response?.data?.code,
    message: error?.message,
    details: safePhonePeErrorDetails(error),
  });
}

function phonePeApiError(error, fallbackMessage) {
  if (error instanceof ApiError) return error;

  const statusCode = Number(error?.httpStatusCode ?? error?.statusCode ?? error?.status ?? error?.response?.status);
  // PhonePe's 4xx responses are request/authentication errors, not gateway
  // failures. Preserve their status and safe message for the caller.
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
    return new ApiError(statusCode, error?.message || fallbackMessage);
  }

  return new ApiError(502, fallbackMessage);
}

export function getPhonePeConfiguration(req, res) {
  const {
    configured,
    paymentConfigured,
    enabled,
    environment,
    environmentValid,
    clientIdPresent,
    clientSecretPresent,
    clientVersionPresent,
    clientVersionValid,
    webhookConfigured,
  } = getPhonePeConfigurationStatus();
  res.set("Cache-Control", "no-store");
  res.status(200).json({
    success: true,
    configured,
    paymentConfigured,
    enabled,
    environment,
    environmentValid,
    clientIdPresent,
    clientSecretPresent,
    clientVersionPresent,
    clientVersionValid,
    webhookConfigured,
  });
}

export const createPhonePePayment = asyncHandler(async (req, res) => {
  const configuration = getPhonePeConfigurationStatus();
  console.log("[PhonePe] Initiating payment", {
    environment: configuration.environment,
    clientIdPresent: configuration.clientIdPresent,
    clientSecretPresent: configuration.clientSecretPresent,
    clientVersionPresent: configuration.clientVersionPresent,
    paymentConfigured: configuration.paymentConfigured,
  });
  getPhonePeClient();
  const redirectBaseUrl = phonePeRedirectBaseUrl();
  const order = await createPendingCheckoutOrder(req.body, req.user, "phonepe");
  order.phonepe = { merchantOrderId: `GP-${order._id.toString()}`, amount: order.amountInPaise, state: "PENDING" };
  await order.save();

  try {
    const response = await initiatePhonePePayment({
      merchantOrderId: order.phonepe.merchantOrderId,
      amount: order.amountInPaise,
      redirectUrl: `${redirectBaseUrl}?orderId=${encodeURIComponent(order._id.toString())}`,
    });
    order.phonepe.phonepeOrderId = response.orderId || "";
    order.phonepe.state = response.state || "PENDING";
    if (!response.redirectUrl) throw new Error("PhonePe response did not include a redirect URL");
    await order.save();
    console.log("[PhonePe] Payment initialization successful", { redirectUrlPresent: true });
    return res.status(201).json({ success: true, orderId: order._id.toString(), redirectUrl: response.redirectUrl });
  } catch (error) {
    logPhonePeError("Payment initialization", error, order.phonepe.merchantOrderId);
    order.paymentStatus = "failed";
    order.failedAt = new Date();
    order.failureReason = "Unable to initiate PhonePe payment";
    await order.save();
    throw phonePeApiError(error, "Unable to start PhonePe payment. Please try again.");
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
    logPhonePeError("Payment status check", error, order.phonepe.merchantOrderId);
    throw phonePeApiError(error, "Unable to confirm PhonePe payment status. Please try again.");
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
  if (!authorization) return res.status(401).json({ success: false, message: "Invalid webhook authentication" });
  if (!rawBody) return res.status(400).json({ success: false, message: "Invalid webhook body" });

  let callback;
  try {
    callback = validatePhonePeCallback(authorization, rawBody);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof SyntaxError) return res.status(400).json({ success: false, message: "Invalid webhook body" });
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
  const eventKey = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const { processed } = await applyPhonePeWebhookResult(order, payload, eventKey);
  return res.status(200).json({ received: true, duplicate: !processed });
});
