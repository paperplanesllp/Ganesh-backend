import cloudinary, { getCloudinaryConfig } from "../config/cloudinary.js";
import Product from "../models/Product.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { validateProductPublicId, validateProductSignatureRequest } from "../utils/uploadValidators.js";

export const createProductUploadSignature = asyncHandler(async (req, res) => {
  validateProductSignatureRequest(req.body);

  const config = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureParams = {
    timestamp,
    folder: config.folder,
  };

  if (config.uploadPreset) signatureParams.upload_preset = config.uploadPreset;

  const signature = cloudinary.utils.api_sign_request(signatureParams, config.apiSecret);

  res.status(200).json({
    success: true,
    upload: {
      timestamp,
      signature,
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      folder: config.folder,
      uploadPreset: config.uploadPreset,
    },
  });
});

export const deleteProductImage = asyncHandler(async (req, res) => {
  const config = getCloudinaryConfig();
  const publicId = validateProductPublicId(req.body?.publicId, config.folder);

  const referencedProduct = await Product.findOne({ "media.publicId": publicId }).select("_id");
  if (referencedProduct) {
    throw new ApiError(409, "Remove this image from the product and save the product before deleting it.");
  }

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch {
    throw new ApiError(502, "Image deletion is currently unavailable. Please try again.");
  }

  res.status(200).json({
    success: true,
    message: "Image deleted successfully",
  });
});
