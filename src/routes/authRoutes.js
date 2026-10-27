import express from "express";
import {
  getMe,
  login,
  logout,
  refresh,
  register,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authLimiter, refreshLimiter } from "../middleware/rateLimitMiddleware.js";
import validateRequest from "../middleware/validateRequest.js";
import { validateLoginPayload, validateRegisterPayload } from "../utils/validators.js";

const router = express.Router();

router.post("/register", authLimiter, validateRequest(validateRegisterPayload, 400), register);
router.post("/login", authLimiter, validateRequest(validateLoginPayload, 400), login);
router.post("/refresh", refreshLimiter, refresh);
router.get("/me", protect, getMe);
router.post("/logout", logout);

export default router;
