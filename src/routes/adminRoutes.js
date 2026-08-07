import express from "express";
import {
  getOrder,
  getDashboard,
  getUser,
  deleteReview,
  listAdminProducts,
  listOrders,
  listReviews,
  listUsers,
  updateOrderStatus,
  updateReviewStatus,
} from "../controllers/adminController.js";
import { protect, requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect, requireRole("admin"));
router.get("/dashboard", getDashboard);
router.get("/products", listAdminProducts);
router.get("/users", listUsers);
router.get("/users/:userId", getUser);
router.get("/orders", listOrders);
router.get("/orders/:orderId", getOrder);
router.patch("/orders/:orderId/status", updateOrderStatus);
router.get("/reviews", listReviews);
router.patch("/reviews/:reviewId/status", updateReviewStatus);
router.delete("/reviews/:reviewId", deleteReview);

export default router;
