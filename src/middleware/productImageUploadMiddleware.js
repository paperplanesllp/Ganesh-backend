import path from "node:path";
import multer from "multer";
import ApiError from "../utils/ApiError.js";
import { ALLOWED_PRODUCT_IMAGE_TYPES, MAX_PRODUCT_IMAGE_BYTES } from "../utils/uploadValidators.js";

export const MAX_PRODUCT_IMAGES = 5;
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: MAX_PRODUCT_IMAGES },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_PRODUCT_IMAGE_TYPES.has(file.mimetype) || !allowedExtensions.has(extension)) {
      return callback(new ApiError(422, "Unsupported image format. Use JPG, JPEG, PNG or WEBP."));
    }
    return callback(null, true);
  },
});

function parseProductPayload(req, res, next) {
  if (!req.is("multipart/form-data")) return next();

  if (typeof req.body.product !== "string") {
    return next(new ApiError(400, "Multipart requests must include a JSON product field."));
  }

  try {
    const parsed = JSON.parse(req.body.product);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    req.uploadMetadata = Array.isArray(parsed.uploadMetadata) ? parsed.uploadMetadata.slice(0, MAX_PRODUCT_IMAGES) : [];
    delete parsed.uploadMetadata;
    req.body = parsed;
    return next();
  } catch {
    return next(new ApiError(400, "The product field must contain valid JSON."));
  }
}

function hasValidImageSignature(file) {
  const bytes = file.buffer;
  if (!bytes?.length) return false;
  if (file.mimetype === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  return false;
}

export function productImageUpload(req, res, next) {
  upload.array("images", MAX_PRODUCT_IMAGES)(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") return next(new ApiError(413, "Each image must be 5 MB or smaller."));
      if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
        return next(new ApiError(422, `A product can contain up to ${MAX_PRODUCT_IMAGES} images.`));
      }
      return next(new ApiError(400, "Image upload request is invalid."));
    }
    if (error) return next(error);
    if ((req.files || []).some((file) => !hasValidImageSignature(file))) {
      return next(new ApiError(422, "An uploaded file does not contain a valid JPG, JPEG, PNG or WEBP image."));
    }
    return parseProductPayload(req, res, next);
  });
}
