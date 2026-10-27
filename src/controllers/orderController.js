import mongoose from "mongoose";
import Order from "../models/Order.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

function serializeOrder(order) {
  return {
    id: order._id.toString(),
    orderId: order._id.toString(),
    customerName: order.customerName,
    email: order.email,
    phone: order.phone,
    shippingAddress: order.shippingAddress,
    products: order.products,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    totalAmount: order.totalAmount,
    currency: order.currency,
    paymentMethod: "phonepe",
    phonepe: order.phonepe,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
  };
}

export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.status(200).json({
    success: true,
    orders: orders.map(serializeOrder),
  });
});

export const getMyOrderById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid order ID");
  }

  const order = await Order.findOne({ _id: req.params.id, user: req.user.id }).lean();

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  res.status(200).json({
    success: true,
    order: serializeOrder(order),
  });
});
