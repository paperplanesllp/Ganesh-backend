import express from "express";
import { createPhonePePayment, getPhonePeConfiguration, getPhonePeStatus } from "../controllers/phonepeController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.get("/config", getPhonePeConfiguration);
router.post("/create", protect, createPhonePePayment);
router.get("/status/:orderId", protect, getPhonePeStatus);
export default router;
