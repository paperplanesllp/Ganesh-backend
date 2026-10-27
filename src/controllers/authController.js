import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import User from "../models/User.js";
import {
  REFRESH_COOKIE_NAME,
  clearRefreshTokenCookie,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  setRefreshTokenCookie,
  verifyRefreshToken,
} from "../services/tokenService.js";

const duplicateAccountMessage = "An account with these details already exists";
const invalidLoginMessage = "Invalid email or password.";

function assertTokenEnvironment() {
  const missing = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"].filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new ApiError(500, "Authentication service is not configured");
  }
}

function logRegistrationException(error) {
  if (process.env.NODE_ENV === "production" || error instanceof ApiError) return;

  console.error("[auth:register]", {
    name: error?.name,
    message: error?.message,
    code: error?.code,
  });
}

function issueTokensForUser(user, res) {
  assertTokenEnvironment();

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  user.refreshTokenHash = hashToken(refreshToken);
  setRefreshTokenCookie(res, refreshToken);

  return accessToken;
}

export const register = asyncHandler(async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.validatedBody;

    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    }).select("email phone");

    if (existingUser) {
      const errors = {};
      if (existingUser.email === email) errors.email = "Email is already registered";
      if (existingUser.phone === phone) errors.phone = "Mobile number is already registered";
      throw new ApiError(409, duplicateAccountMessage, errors);
    }

    const user = new User({
      fullName,
      email,
      phone,
      password,
      role: "customer",
    });

    const accessToken = issueTokensForUser(user, res);
    await user.save();

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      accessToken,
      user: user.toSafeObject(),
    });
  } catch (error) {
    logRegistrationException(error);
    throw error;
  }
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.validatedBody;

  const user = await User.findOne({ email }).select("+password +refreshTokenHash");

  if (!user || !user.isActive) {
    throw new ApiError(401, invalidLoginMessage);
  }

  const passwordMatches = await user.comparePassword(password);

  if (!passwordMatches) {
    throw new ApiError(401, invalidLoginMessage);
  }

  const accessToken = issueTokensForUser(user, res);
  user.lastLoginAt = new Date();
  await user.save();

  res.status(200).json({
    success: true,
    message: "Login successful",
    accessToken,
    user: user.toSafeObject(),
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

  console.info("[auth:refresh]", {
    cookiePresent: Boolean(refreshToken),
    refreshSecretConfigured: Boolean(process.env.JWT_REFRESH_SECRET),
  });

  if (!refreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    console.warn("[auth:refresh]", {
      cookiePresent: true,
      verificationFailed: true,
      reason: error?.name || "TokenVerificationError",
    });
    clearRefreshTokenCookie(res);
    throw error;
  }

  if (payload.tokenType !== "refresh") {
    throw new ApiError(401, "Invalid token");
  }

  if (!mongoose.isValidObjectId(payload.sub)) {
    throw new ApiError(401, "Invalid token");
  }

  const user = await User.findOne({ _id: payload.sub, isActive: true }).select("+refreshTokenHash");

  if (!user || !user.refreshTokenHash) {
    throw new ApiError(401, "Invalid token");
  }

  if (hashToken(refreshToken) !== user.refreshTokenHash) {
    user.refreshTokenHash = null;
    await user.save();
    clearRefreshTokenCookie(res);
    throw new ApiError(401, "Invalid token");
  }

  const accessToken = issueTokensForUser(user, res);
  await user.save();

  res.status(200).json({
    success: true,
    accessToken,
  });
});

export const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      if (payload?.sub && mongoose.isValidObjectId(payload.sub)) {
        await User.findByIdAndUpdate(payload.sub, { refreshTokenHash: null });
      }
    } catch {
      // Logout should still succeed when the refresh token is expired or invalid.
    }
  }

  clearRefreshTokenCookie(res);

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});
