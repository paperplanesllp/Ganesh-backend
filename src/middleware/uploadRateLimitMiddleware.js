import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const productUploadSignatureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?._id || "anonymous"}:${ipKeyGenerator(req.ip)}`,
  message: {
    success: false,
    message: "Too many image upload requests. Please try again later.",
  },
});
