import express from "express";
import {
  createAddress,
  deleteAddress,
  getAddresses,
  getCurrentProfile,
  updateAddress,
  updateCurrentProfile,
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/me", getCurrentProfile);
router.patch("/me", updateCurrentProfile);
router.get("/me/addresses", getAddresses);
router.post("/me/addresses", createAddress);
router.patch("/me/addresses/:addressId", updateAddress);
router.delete("/me/addresses/:addressId", deleteAddress);

export default router;
