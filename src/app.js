import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { handlePhonePeWebhook } from "./controllers/phonepeController.js";
import orderRoutes from "./routes/orderRoutes.js";
import phonepeRoutes from "./routes/phonepeRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { errorHandler, notFound } from "./middleware/errorMiddleware.js";

const app = express();
app.set("trust proxy", 1);

const defaultAllowedOrigins = [
  "https://www.ganeshpickles.com",
  "https://ganeshpickles.com",
  "http://localhost:5173",
  "http://localhost:3000",
];
const configuredAllowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
]
  .filter(Boolean)
  .map((origin) => origin.trim().replace(/\/$/, ""));
const allowedOrigins = new Set([...defaultAllowedOrigins, ...configuredAllowedOrigins]);
const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ""))) {
      return callback(null, true);
    }

    console.warn("[cors:rejected-origin]", { origin });
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: allowedMethods,
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

app.use(helmet());
app.use(cors(corsOptions));
app.post("/api/payments/phonepe/webhook", express.text({ type: "application/json", limit: "100kb" }), handlePhonePeWebhook);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Ganesh Pickles API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments/phonepe", phonepeRoutes);
app.use("/api/products", productRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/users", userRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
