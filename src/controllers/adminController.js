import mongoose from "mongoose";
import Order, { orderStatuses } from "../models/Order.js";
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import CategoryVisibility, { managedCategoryNames } from "../models/CategoryVisibility.js";
import { getManagedCategoryVisibility } from "../utils/categoryVisibility.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

function pagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function pageResponse(items, total, page, limit) {
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } };
}

function serializeAdminOrder(order) {
  return {
    id: order._id.toString(),
    user: order.user,
    customerSnapshot: order.customerSnapshot,
    customerName: order.customerName,
    email: order.email,
    phone: order.phone,
    shippingAddress: order.shippingAddress,
    products: order.products,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    totalAmount: order.totalAmount,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    paymentMethod: "phonepe",
    orderStatus: order.orderStatus,
    phonepe: order.phonepe,
    paidAt: order.paidAt,
    failedAt: order.failedAt,
    failureReason: order.failureReason,
    notes: order.notes,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export const getDashboard = asyncHandler(async (req, res) => {
  const [
    totalProducts,
    activeProducts,
    outOfStockProducts,
    totalCustomers,
    totalOrders,
    pendingReviews,
  ] = await Promise.all([
    Product.countDocuments({}),
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ inStock: false }),
    User.countDocuments({ role: "customer" }),
    Order.countDocuments({}),
    Review.countDocuments({ status: "pending" }),
  ]);

  res.status(200).json({
    success: true,
    dashboard: {
      totalProducts,
      activeProducts,
      outOfStockProducts,
      totalCustomers,
      totalOrders,
      pendingReviews,
    },
  });
});

export const getCategoryVisibility = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, categories: await getManagedCategoryVisibility() });
});

export const updateCategoryVisibility = asyncHandler(async (req, res) => {
  const name = req.params.name;
  if (!managedCategoryNames.includes(name) || typeof req.body.isVisible !== "boolean") {
    throw new ApiError(422, "Invalid category visibility update");
  }

  const category = await CategoryVisibility.findOneAndUpdate(
    { name },
    { isVisible: req.body.isVisible },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  res.status(200).json({ success: true, message: `${name} visibility updated`, category: { name: category.name, isVisible: category.isVisible } });
});

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  if (["customer", "admin"].includes(req.query.role)) filter.role = req.query.role;
  if (req.query.isActive === "true" || req.query.isActive === "false") {
    filter.isActive = req.query.isActive === "true";
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  const result = pageResponse(users.map((user) => user.toSafeObject()), total, page, limit);
  res.status(200).json({ success: true, users: result.items, pagination: result.pagination });
});

export const getUser = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.userId)) throw new ApiError(404, "User not found");
  const user = await User.findById(req.params.userId);
  if (!user) throw new ApiError(404, "User not found");
  res.status(200).json({ success: true, user: user.toSafeObject() });
});

export const listOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  if (req.query.status === "pending-dispatch") {
    filter.paymentStatus = "paid";
    filter.orderStatus = "confirmed";
  } else if (orderStatuses.includes(req.query.status)) {
    filter.orderStatus = req.query.status;
  }
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(filter),
  ]);
  const result = pageResponse(orders.map(serializeAdminOrder), total, page, limit);
  res.status(200).json({ success: true, orders: result.items, pagination: result.pagination });
});

export const getOrder = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.orderId)) throw new ApiError(404, "Order not found");
  const order = await Order.findById(req.params.orderId).lean();
  if (!order) throw new ApiError(404, "Order not found");
  res.status(200).json({ success: true, order: serializeAdminOrder(order) });
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.orderId)) throw new ApiError(404, "Order not found");
  if (!orderStatuses.includes(req.body.status)) {
    throw new ApiError(422, "Invalid order status", { status: `Use one of: ${orderStatuses.join(", ")}` });
  }
  const order = await Order.findByIdAndUpdate(
    req.params.orderId,
    { orderStatus: req.body.status },
    { new: true, runValidators: true },
  ).lean();
  if (!order) throw new ApiError(404, "Order not found");
  res.status(200).json({ success: true, message: "Order status updated", order: serializeAdminOrder(order) });
});

export const listAdminProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const [products, total] = await Promise.all([
    Product.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments({}),
  ]);
  const result = pageResponse(products, total, page, limit);
  res.status(200).json({ success: true, products: result.items, pagination: result.pagination });
});

export const listReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = {};
  if (["pending", "approved", "rejected"].includes(req.query.status)) filter.status = req.query.status;
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({ path: "user", select: "fullName" })
      .populate({ path: "product", select: "name" })
      .lean(),
    Review.countDocuments(filter),
  ]);
  const items = reviews.map((review) => ({
    id: review._id.toString(),
    customer: review.user?.fullName || "Customer",
    product: review.product?.name || "Product",
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    status: review.status,
    reportCount: review.reportedBy?.length || 0,
    createdAt: review.createdAt,
  }));
  const result = pageResponse(items, total, page, limit);
  res.status(200).json({ success: true, reviews: result.items, pagination: result.pagination });
});

export const updateReviewStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.reviewId)) throw new ApiError(404, "Review not found");
  if (!["approved", "rejected"].includes(req.body.status)) {
    throw new ApiError(422, "Invalid review status");
  }
  const review = await Review.findByIdAndUpdate(
    req.params.reviewId,
    { status: req.body.status },
    { new: true, runValidators: true },
  );
  if (!review) throw new ApiError(404, "Review not found");
  res.status(200).json({
    success: true,
    message: "Review status updated",
    review: { id: review._id.toString(), status: review.status },
  });
});

export const deleteReview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.reviewId)) throw new ApiError(404, "Review not found");
  const review = await Review.findByIdAndDelete(req.params.reviewId);
  if (!review) throw new ApiError(404, "Review not found");
  res.status(200).json({ success: true, message: "Review deleted" });
});
