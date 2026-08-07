import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import { validateRegisterPayload } from "../utils/validators.js";

function readAdminAccounts() {
  if (!process.env.ADMIN_ACCOUNTS_JSON) {
    throw new Error("ADMIN_ACCOUNTS_JSON is required");
  }

  let accounts;
  try {
    accounts = JSON.parse(process.env.ADMIN_ACCOUNTS_JSON);
  } catch {
    throw new Error("ADMIN_ACCOUNTS_JSON must be valid JSON");
  }

  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("ADMIN_ACCOUNTS_JSON must contain at least one admin account");
  }

  return accounts;
}

async function seedAdmins() {
  await connectDB();
  const accounts = readAdminAccounts();

  for (const account of accounts) {
    const { errors, values } = validateRegisterPayload(account);
    if (Object.keys(errors).length) {
      throw new Error(`Invalid admin account ${account?.email || "without email"}: ${JSON.stringify(errors)}`);
    }

    const mobileOwner = await User.findOne({ phone: values.phone });
    if (mobileOwner && mobileOwner.email !== values.email) {
      throw new Error(`Mobile number for ${values.email} belongs to another account`);
    }

    let user = await User.findOne({ email: values.email }).select("+password");
    if (!user) {
      user = new User({ ...values, role: "admin", isActive: true });
    } else {
      user.fullName = values.fullName;
      user.phone = values.phone;
      user.password = values.password;
      user.role = "admin";
      user.isActive = true;
    }

    await user.save();
    console.log(`Admin ready: ${user.email} (${user._id})`);
  }
}

seedAdmins()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close(false);
  });
