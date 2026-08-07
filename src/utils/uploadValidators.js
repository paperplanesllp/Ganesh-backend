import ApiError from "./ApiError.js";

export const ALLOWED_PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateProductSignatureRequest(body = {}) {
  const fileName = safeTrim(body.fileName);
  const fileType = safeTrim(body.fileType).toLowerCase();
  const fileSize = Number(body.fileSize);
  const errors = {};

  if (!fileName) errors.fileName = "File name is required";
  if (!ALLOWED_PRODUCT_IMAGE_TYPES.has(fileType)) errors.fileType = "Choose a JPEG, PNG or WebP image.";
  if (!Number.isFinite(fileSize) || fileSize <= 0) errors.fileSize = "File size is invalid";
  else if (fileSize > MAX_PRODUCT_IMAGE_BYTES) errors.fileSize = "Each image must be smaller than 5 MB.";

  if (Object.keys(errors).length > 0) {
    throw new ApiError(422, "Image validation failed", errors);
  }

  return { fileName, fileType, fileSize };
}

export function validateProductPublicId(publicId, folder) {
  const value = safeTrim(publicId);
  const normalizedFolder = safeTrim(folder).replace(/\/+$/g, "");

  if (!value) throw new ApiError(422, "Image public ID is required");
  if (!normalizedFolder || !value.startsWith(`${normalizedFolder}/`)) {
    throw new ApiError(422, "Image public ID is not allowed");
  }
  if (value.includes("..") || value.includes("\\") || /[<>:"|?*]/.test(value)) {
    throw new ApiError(422, "Image public ID is not allowed");
  }
  if (value.length > 180) throw new ApiError(422, "Image public ID is too long");

  return value;
}
