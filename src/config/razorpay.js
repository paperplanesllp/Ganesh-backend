import Razorpay from "razorpay";
import ApiError from "../utils/ApiError.js";

let razorpayInstance = null;

function getRequiredRazorpayEnv() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new ApiError(503, "Online payment is not configured");
  }

  return { keyId, keySecret };
}

export function getRazorpayKeyId() {
  return getRequiredRazorpayEnv().keyId;
}

export function getRazorpayKeySecret() {
  return getRequiredRazorpayEnv().keySecret;
}

export function getRazorpayInstance() {
  const { keyId, keySecret } = getRequiredRazorpayEnv();

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  return razorpayInstance;
}

export function getRazorpayWebhookSecret() {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new ApiError(503, "Payment webhook is not configured");
  }

  return webhookSecret;
}
