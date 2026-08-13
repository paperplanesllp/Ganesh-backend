import mongoose from "mongoose";
import JsonWebTokenError from "jsonwebtoken/lib/JsonWebTokenError.js";
import TokenExpiredError from "jsonwebtoken/lib/TokenExpiredError.js";
import ApiError from "../utils/ApiError.js";

export const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
};

function buildMongooseValidationErrors(error) {
  return Object.values(error.errors || {}).reduce((acc, item) => {
    acc[item.path] = item.message;
    return acc;
  }, {});
}

function normalizeError(error) {
  if (error instanceof ApiError) return error;

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return new ApiError(400, "Invalid JSON request body");
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return new ApiError(400, "Validation failed", buildMongooseValidationErrors(error));
  }

  if (error?.code === 11000) {
    const duplicateFields = Object.keys(error.keyPattern || error.keyValue || {});
    const errors = duplicateFields.reduce((acc, field) => {
      acc[field] = `${field === "phone" ? "Mobile number" : field} is already registered`;
      return acc;
    }, {});

    return new ApiError(409, "An account with these details already exists", Object.keys(errors).length ? errors : null);
  }

  if (error instanceof mongoose.Error.CastError) {
    return new ApiError(400, "Invalid request identifier");
  }

  if (error instanceof TokenExpiredError) {
    return new ApiError(401, "Token expired");
  }

  if (error instanceof JsonWebTokenError) {
    return new ApiError(401, "Invalid token");
  }

  return new ApiError(500, "Something went wrong");
}

export const errorHandler = (error, req, res, next) => {
  const normalizedError = normalizeError(error);
  const statusCode = normalizedError.statusCode || 500;

  const response = {
    success: false,
    message: normalizedError.message || "Something went wrong",
  };

  if (normalizedError.errors) {
    response.errors = normalizedError.errors;
  }

  // Keep internal details out of the HTTP response, but always record server
  // failures. Production hosts such as Render otherwise only show the 500
  // status, which makes database permission and configuration failures opaque.
  if (statusCode >= 500) {
    console.error("[server:error]", {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      path: req.originalUrl,
      method: req.method,
    });
  }

  res.status(statusCode).json(response);
};
