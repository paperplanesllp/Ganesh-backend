import ApiError from "../utils/ApiError.js";
import { validateProductPayload, validateProductStatusPayload } from "../utils/productValidators.js";

function handleValidationResult(req, next, result) {
  const { errors, values } = result;

  if (Object.keys(errors).length > 0) {
    return next(new ApiError(422, "Product validation failed", errors));
  }

  req.validatedBody = values;
  return next();
}

export const validateCreateProduct = (req, res, next) => {
  handleValidationResult(req, next, validateProductPayload(req.body, { hasUploadedFiles: req.files?.length > 0 }));
};

export const validateUpdateProduct = (req, res, next) => {
  handleValidationResult(req, next, validateProductPayload(req.body, { hasUploadedFiles: req.files?.length > 0 }));
};

export const validateProductStatus = (req, res, next) => {
  handleValidationResult(req, next, validateProductStatusPayload(req.body));
};
