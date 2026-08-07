import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { normalizeEmail, normalizePhone } from "../utils/validators.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const indianMobileRegex = /^[6-9]\d{9}$/;
const indianPinCodeRegex = /^\d{6}$/;

const addressSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      maxlength: [40, "Address label must be 40 characters or less"],
      default: "Home",
    },
    fullName: {
      type: String,
      required: [true, "Recipient name is required"],
      trim: true,
      maxlength: [80, "Recipient name must be 80 characters or less"],
    },
    phone: {
      type: String,
      required: [true, "Recipient phone is required"],
      set: normalizePhone,
      validate: {
        validator: (value) => indianMobileRegex.test(value),
        message: "Enter a valid 10-digit Indian mobile number",
      },
    },
    addressLine1: { type: String, required: true, trim: true, maxlength: 180 },
    addressLine2: { type: String, default: "", trim: true, maxlength: 180 },
    landmark: { type: String, default: "", trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    district: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (value) => indianPinCodeRegex.test(value),
        message: "Enter a valid six-digit PIN code",
      },
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Full name must be at least 2 characters"],
      maxlength: [80, "Full name must be 80 characters or less"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: (value) => emailRegex.test(value),
        message: "Enter a valid email address",
      },
      set: normalizeEmail,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      index: true,
      validate: {
        validator: (value) => indianMobileRegex.test(value),
        message: "Enter a valid 10-digit Indian mobile number",
      },
      set: normalizePhone,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must contain at least eight characters"],
      select: false,
    },
    role: {
      type: String,
      enum: ["customer", "admin"],
      default: "customer",
    },
    addresses: {
      type: [addressSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    refreshTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;
  if (typeof this.password !== "string") return;

  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    _id: this._id.toString(),
    id: this._id.toString(),
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    role: this.role,
    addresses: this.addresses || [],
    isActive: this.isActive,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const User = mongoose.model("User", userSchema);

export default User;
