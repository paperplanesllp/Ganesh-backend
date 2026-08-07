import mongoose from "mongoose";
import Review from "../models/Review.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";

function serializeReview(review) {
  return {
    id: review._id.toString(),
    user: review.user?.toString?.() || review.user,
    product: review.product?.toString?.() || review.product,
    order: review.order?.toString?.() || review.order,
    rating: review.rating,
    title: review.title,
    comment: review.comment,
    images: review.images || [],
    verifiedPurchase: review.verifiedPurchase,
    helpfulCount: review.helpfulUsers?.length || 0,
    status: review.status,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

function calculateProductAggregate(productId) {
  return Review.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), status: "approved" } },
    {
      $group: {
        _id: "$product",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 },
      },
    },
  ]);
}

async function updateProductReviewMeta(productId) {
  const product = await Product.findById(productId);
  if (!product) return;

  const [aggregate] = await calculateProductAggregate(productId);
  const reviewCount = aggregate?.reviewCount || 0;
  const averageRating = aggregate?.averageRating || 0;

  product.reviewCount = reviewCount;
  product.rating = Number(averageRating.toFixed(1)) || 0;
  await product.save();
}

export const getReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ status: "approved" })
    .sort({ createdAt: -1 })
    .populate({ path: "user", select: "fullName" })
    .populate({ path: "product", select: "name" })
    .lean();

  res.status(200).json({
    success: true,
    reviews: reviews.map((review) => ({
      ...serializeReview(review),
      customerName: review.user?.fullName || "Customer",
      productName: review.product?.name || "Ganesh Pickles",
    })),
  });
});

export const getReviewsByProduct = asyncHandler(async (req, res) => {
  const productId = req.params.productId;

  if (!mongoose.isValidObjectId(productId)) {
    throw new ApiError(400, "Invalid product ID");
  }

  const reviews = await Review.find({ product: productId, status: "approved" })
    .sort({ createdAt: -1 })
    .populate({ path: "user", select: "fullName" })
    .populate({ path: "product", select: "name" })
    .lean();

  res.status(200).json({
    success: true,
    reviews: reviews.map((review) => ({
      ...serializeReview(review),
      customerName: review.user?.fullName || "Customer",
      productName: review.product?.name || "Ganesh Pickles",
    })),
  });
});

export const createReview = asyncHandler(async (req, res) => {
  const { productId, rating, title, comment, images = [] } = req.body;

  if (!mongoose.isValidObjectId(productId)) {
    throw new ApiError(400, "Invalid product ID");
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ApiError(400, "Rating must be between 1 and 5");
  }

  if (!title?.trim()) {
    throw new ApiError(400, "Review title is required");
  }

  if (!comment?.trim() || comment.trim().length < 20) {
    throw new ApiError(400, "Review description must contain at least 20 characters");
  }

  if (images.length > 5) {
    throw new ApiError(400, "A review can have at most 5 images");
  }

  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new ApiError(404, "Product not found");
  }

  const orders = await Order.find({ user: req.user.id, paymentStatus: "paid", orderStatus: "fulfilled" }).lean();
  const hasPurchasedProduct = orders.some((order) =>
    order.products?.some((item) => item.product?.toString() === productId || item.productName === product.name),
  );

  if (!hasPurchasedProduct) {
    throw new ApiError(403, "You can only review products you have ordered and received");
  }

  const existingReview = await Review.findOne({ user: req.user.id, product: productId, order: { $exists: true } }).lean();
  if (existingReview) {
    throw new ApiError(409, "You have already reviewed this product");
  }

  const order = orders.find((entry) =>
    entry.products?.some((item) => item.product?.toString() === productId || item.productName === product.name),
  );

  const review = await Review.create({
    user: req.user.id,
    product: productId,
    order: order?._id,
    rating,
    title: title.trim(),
    comment: comment.trim(),
    images: images.filter(Boolean).slice(0, 5),
    verifiedPurchase: true,
    status: "pending",
  });

  await updateProductReviewMeta(productId);

  res.status(201).json({
    success: true,
    message: "Review submitted successfully and is pending approval.",
    review: serializeReview(review),
  });
});

export const markReviewHelpful = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.reviewId);
  if (!review) {
    throw new ApiError(404, "Review not found");
  }

  const userId = req.user.id;
  if (!review.helpfulUsers.includes(userId)) {
    review.helpfulUsers.push(userId);
    await review.save();
  }

  res.status(200).json({
    success: true,
    message: "Review marked as helpful.",
    helpfulCount: review.helpfulUsers.length,
  });
});

export const reportReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.reviewId);
  if (!review) {
    throw new ApiError(404, "Review not found");
  }

  const userId = req.user.id;
  if (!review.reportedBy.includes(userId)) {
    review.reportedBy.push(userId);
    await review.save();
  }

  res.status(200).json({
    success: true,
    message: "Review reported successfully.",
  });
});
