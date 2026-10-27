import express from "express";
import {
  createProduct,
  deleteProduct,
  getAdminProductById,
  getAdminProducts,
  getBestsellerProducts,
  getFeaturedProducts,
  getNewArrivalProducts,
  getProductById,
  getPublicCategoryVisibility,
  getProductBySlug,
  getProducts,
  updateProduct,
  updateProductStatus,
} from "../controllers/productController.js";
import { protect, requireRole } from "../middleware/authMiddleware.js";
import { productImageUpload } from "../middleware/productImageUploadMiddleware.js";
import {
  validateCreateProduct,
  validateProductStatus,
  validateUpdateProduct,
} from "../middleware/productValidationMiddleware.js";

const router = express.Router();

router.get("/featured", getFeaturedProducts);
router.get("/bestsellers", getBestsellerProducts);
router.get("/new-arrivals", getNewArrivalProducts);
router.get("/categories", getPublicCategoryVisibility);
router.get("/admin/all", protect, requireRole("admin"), getAdminProducts);
router.get("/admin/:id", protect, requireRole("admin"), getAdminProductById);
router.get("/slug/:slug", getProductBySlug);

router
  .route("/")
  .get(getProducts)
  .post(protect, requireRole("admin"), productImageUpload, validateCreateProduct, createProduct);

router
  .route("/:id")
  .get(getProductById)
  .put(protect, requireRole("admin"), productImageUpload, validateUpdateProduct, updateProduct)
  .delete(protect, requireRole("admin"), deleteProduct);

router.patch("/:id/status", protect, requireRole("admin"), validateProductStatus, updateProductStatus);

export default router;
