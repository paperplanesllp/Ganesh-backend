import express from "express";
import {
  createReview,
  getReviews,
  getReviewsByProduct,
  markReviewHelpful,
  reportReview,
} from "../controllers/reviewController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getReviews);
router.get("/product/:productId", getReviewsByProduct);
router.post("/", protect, createReview);
router.patch("/:reviewId/helpful", protect, markReviewHelpful);
router.post("/:reviewId/report", protect, reportReview);

export default router;
