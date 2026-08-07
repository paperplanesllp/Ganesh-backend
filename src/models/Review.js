import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating must be at most 5"],
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: [120, "Review title must be 120 characters or less"],
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      minlength: [20, "Review description must contain at least 20 characters"],
      maxlength: [2000, "Review description must be 2000 characters or less"],
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (values) => Array.isArray(values) && values.length <= 5,
        message: "A review can have at most 5 images",
      },
    },
    verifiedPurchase: {
      type: Boolean,
      default: false,
    },
    helpfulUsers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    reportedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

reviewSchema.index({ user: 1, order: 1, product: 1 }, { unique: true });

const Review = mongoose.model("Review", reviewSchema);

export default Review;
