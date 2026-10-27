import express from "express";
import { getMyOrderById, getMyOrders } from "../controllers/orderController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/my", protect, getMyOrders);
router.get("/my/:id", protect, getMyOrderById);
router.get("/me", protect, getMyOrders);
router.get("/me/:id", protect, getMyOrderById);

export default router;
