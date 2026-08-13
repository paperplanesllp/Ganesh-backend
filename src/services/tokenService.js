import crypto from "crypto";
import jwt from "jsonwebtoken";

export const REFRESH_COOKIE_NAME = "ganesh_refresh_token";

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id || user._id.toString(),
      role: user.role,
    },
    getRequiredEnv("JWT_ACCESS_SECRET"),
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    },
  );
}

export function generateRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id || user._id.toString(),
      tokenType: "refresh",
    },
    getRequiredEnv("JWT_REFRESH_SECRET"),
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
    },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getRequiredEnv("JWT_ACCESS_SECRET"));
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, getRequiredEnv("JWT_REFRESH_SECRET"));
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshCookieOptions() {
  const days = Number.parseInt(process.env.REFRESH_COOKIE_DAYS || "7", 10);
  const maxAgeDays = Number.isFinite(days) && days > 0 ? days : 7;
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    // The production frontend and Render API are cross-site, so browsers
    // require SameSite=None together with Secure for the refresh cookie.
    sameSite: isProduction ? "none" : "lax",
    path: "/api/auth",
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshTokenCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
}

export function clearRefreshTokenCookie(res) {
  const { maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, options);
}
