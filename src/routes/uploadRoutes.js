import express from "express";
import { createProductUploadSignature, deleteProductImage } from "../controllers/uploadController.js";
import { protect, requireRole } from "../middleware/authMiddleware.js";
import { productUploadSignatureLimiter } from "../middleware/uploadRateLimitMiddleware.js";

const router = express.Router();

router.post("/product-signature", protect, requireRole("admin"), productUploadSignatureLimiter, createProductUploadSignature);
router.delete("/product-image", protect, requireRole("admin"), deleteProductImage);

export default router;
