import mongoose from "mongoose";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { normalizeEmail, normalizePhone } from "../utils/validators.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[6-9]\d{9}$/;
const pinCodeRegex = /^\d{6}$/;

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validateProfile(body = {}) {
  const values = {
    fullName: cleanString(body.fullName ?? body.name, 80),
    email: normalizeEmail(body.email),
    phone: normalizePhone(body.phone ?? body.mobile),
  };
  const errors = {};

  if (values.fullName.length < 2) errors.fullName = "Full name must be at least 2 characters";
  if (!emailRegex.test(values.email)) errors.email = "Enter a valid email address";
  if (!phoneRegex.test(values.phone)) errors.phone = "Enter a valid 10-digit Indian mobile number";
  if (Object.keys(errors).length) throw new ApiError(422, "Invalid profile details", errors);

  return values;
}

function validateAddress(body = {}) {
  const values = {
    label: cleanString(body.label, 40) || "Home",
    fullName: cleanString(body.fullName, 80),
    phone: normalizePhone(body.phone),
    addressLine1: cleanString(body.addressLine1, 180),
    addressLine2: cleanString(body.addressLine2, 180),
    landmark: cleanString(body.landmark, 120),
    city: cleanString(body.city, 80),
    district: cleanString(body.district, 80),
    state: cleanString(body.state, 80),
    pincode: cleanString(body.pincode, 6),
    isDefault: body.isDefault === true,
  };
  const errors = {};

  if (!values.fullName) errors.fullName = "Recipient name is required";
  if (!phoneRegex.test(values.phone)) errors.phone = "Enter a valid 10-digit Indian mobile number";
  if (!values.addressLine1) errors.addressLine1 = "Address line 1 is required";
  if (!values.city) errors.city = "City is required";
  if (!values.district) errors.district = "District is required";
  if (!values.state) errors.state = "State is required";
  if (!pinCodeRegex.test(values.pincode)) errors.pincode = "Enter a valid six-digit PIN code";
  if (Object.keys(errors).length) throw new ApiError(422, "Invalid address details", errors);

  return values;
}

async function currentUser(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) throw new ApiError(401, "Authentication required");
  return user;
}

function setOnlyDefault(addresses, defaultId) {
  addresses.forEach((address) => {
    address.isDefault = address._id.toString() === defaultId;
  });
}

export const getCurrentProfile = asyncHandler(async (req, res) => {
  const user = await currentUser(req.user.id);
  res.status(200).json({ success: true, user: user.toSafeObject() });
});

export const updateCurrentProfile = asyncHandler(async (req, res) => {
  const values = validateProfile(req.body);
  const duplicate = await User.findOne({
    _id: { $ne: req.user.id },
    $or: [{ email: values.email }, { phone: values.phone }],
  }).select("email phone");

  if (duplicate) {
    const errors = {};
    if (duplicate.email === values.email) errors.email = "Email is already registered";
    if (duplicate.phone === values.phone) errors.phone = "Mobile number is already registered";
    throw new ApiError(409, "An account with these details already exists", errors);
  }

  const user = await currentUser(req.user.id);
  Object.assign(user, values);
  await user.save();
  res.status(200).json({ success: true, message: "Profile updated", user: user.toSafeObject() });
});

export const getAddresses = asyncHandler(async (req, res) => {
  const user = await currentUser(req.user.id);
  res.status(200).json({ success: true, addresses: user.addresses });
});

export const createAddress = asyncHandler(async (req, res) => {
  const values = validateAddress(req.body);
  const user = await currentUser(req.user.id);
  if (user.addresses.length >= 10) throw new ApiError(409, "A maximum of 10 addresses is allowed");
  if (values.isDefault || user.addresses.length === 0) {
    user.addresses.forEach((address) => { address.isDefault = false; });
    values.isDefault = true;
  }
  user.addresses.push(values);
  await user.save();
  res.status(201).json({ success: true, message: "Address added", address: user.addresses.at(-1) });
});

export const updateAddress = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.addressId)) throw new ApiError(404, "Address not found");
  const values = validateAddress(req.body);
  const user = await currentUser(req.user.id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) throw new ApiError(404, "Address not found");
  Object.assign(address, values);
  if (values.isDefault) setOnlyDefault(user.addresses, address._id.toString());
  await user.save();
  res.status(200).json({ success: true, message: "Address updated", address });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.addressId)) throw new ApiError(404, "Address not found");
  const user = await currentUser(req.user.id);
  const address = user.addresses.id(req.params.addressId);
  if (!address) throw new ApiError(404, "Address not found");
  const wasDefault = address.isDefault;
  address.deleteOne();
  if (wasDefault && user.addresses.length) user.addresses[0].isDefault = true;
  await user.save();
  res.status(200).json({ success: true, message: "Address deleted" });
});
