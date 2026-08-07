import "dotenv/config";
import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./config/db.js";

const requiredEnv = ["MONGODB_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
const port = process.env.PORT || 5000;
let server;

function validateEnvironment() {
  const missing = requiredEnv.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function startServer() {
  try {
    validateEnvironment();
    await connectDB();

    server = app.listen(port, () => {
      console.log(`Ganesh Pickles API listening on port ${port}`);
    });
  } catch (error) {
    console.error(error.message || "Server startup failed");
    process.exit(1);
  }
}

function shutdown(exitCode = 0) {
  const closeDatabase = async () => {
    await mongoose.connection.close(false);
    process.exit(exitCode);
  };

  if (server) {
    server.close(() => {
      closeDatabase().catch(() => process.exit(1));
    });
    return;
  }

  closeDatabase().catch(() => process.exit(1));
}

process.on("unhandledRejection", (reason) => {
  console.error(reason?.message || "Unhandled promise rejection");
  shutdown(1);
});

process.on("uncaughtException", (error) => {
  console.error(error?.message || "Uncaught exception");
  shutdown(1);
});

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

startServer();
