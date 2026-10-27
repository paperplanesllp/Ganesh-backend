import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import User from "../models/User.js";
import { verifyAccessToken } from "../services/tokenService.js";

export const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new ApiError(401, "Authentication required");
  }

  const payload = verifyAccessToken(token);

  if (!mongoose.isValidObjectId(payload.sub)) {
    throw new ApiError(401, "Authentication required");
  }

  const user = await User.findOne({ _id: payload.sub, isActive: true });

  if (!user) {
    throw new ApiError(401, "Authentication required");
  }

  req.user = user.toSafeObject();
  next();
});

export const optionalProtect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (!token) {
    return next();
  }

  if (scheme !== "Bearer") {
    throw new ApiError(401, "Authentication required");
  }

  const payload = verifyAccessToken(token);

  if (!mongoose.isValidObjectId(payload.sub)) {
    throw new ApiError(401, "Authentication required");
  }

  const user = await User.findOne({ _id: payload.sub, isActive: true });

  if (!user) {
    throw new ApiError(401, "Authentication required");
  }

  req.user = user.toSafeObject();
  return next();
});

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }

  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, "Admin access required"));
  }

  return next();
};
