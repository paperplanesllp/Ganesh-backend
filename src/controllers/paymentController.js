import crypto from "crypto";
import mongoose from "mongoose";
import { getRazorpayInstance, getRazorpayKeyId, getRazorpayKeySecret, getRazorpayWebhookSecret } from "../config/razorpay.js";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import WebhookEvent from "../models/WebhookEvent.js";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { normalizeEmail, normalizePhone } from "../utils/validators.js";
import { createPendingCheckoutOrder } from "../services/checkoutService.js";

const currency = "INR";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const indianPinCodeRegex = /^\d{6}$/;

function cleanString(value, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function timingSafeCompare(left, right) {
  const leftBuffer = Buffer.from(left || "", "utf8");
  const rightBuffer = Buffer.from(right || "", "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createHmacSignature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function createRawBodyFingerprint(rawBody) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

function logWebhook({ eventType, eventId, razorpayOrderId, succeeded, note = "" }) {
  if (process.env.NODE_ENV === "production") return;

  console.log(
    `[razorpay:webhook] event=${eventType || "unknown"} eventId=${eventId || "missing"} order=${razorpayOrderId || "missing"} success=${Boolean(succeeded)}${note ? ` note=${note}` : ""}`,
  );
}

function extractWebhookData(event, rawBody, headerEventId) {
  const eventType = cleanString(event?.event, 80);
  const payment = event?.payload?.payment?.entity || null;
  const orderEntity = event?.payload?.order?.entity || null;
  const razorpayOrderId = cleanString(payment?.order_id || orderEntity?.id, 80);
  const razorpayPaymentId = cleanString(payment?.id || orderEntity?.payment_id, 80);
  const failureReason = cleanString(
    payment?.error_description || payment?.error_reason || payment?.error_code || "Payment failed",
    180,
  );
  const eventId = cleanString(headerEventId, 160) || `missing:${createRawBodyFingerprint(rawBody)}`;

  return {
    eventId,
    eventType,
    payment,
    orderEntity,
    razorpayOrderId,
    razorpayPaymentId,
    failureReason,
  };
}

async function reserveWebhookEvent({ eventId, eventType, razorpayOrderId, razorpayPaymentId }) {
  const existing = await WebhookEvent.findOne({ eventId });

  if (existing?.status === "processed" || existing?.status === "skipped" || existing?.status === "processing") {
    return { duplicate: true, eventLog: existing };
  }

  if (existing) {
    existing.eventType = eventType;
    existing.razorpayOrderId = razorpayOrderId;
    existing.razorpayPaymentId = razorpayPaymentId;
    existing.status = "processing";
    await existing.save();
    return { duplicate: false, eventLog: existing };
  }

  try {
    const eventLog = await WebhookEvent.create({
      eventId,
      eventType,
      razorpayOrderId,
      razorpayPaymentId,
      status: "processing",
    });

    return { duplicate: false, eventLog };
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const duplicateEvent = await WebhookEvent.findOne({ eventId });
    return { duplicate: true, eventLog: duplicateEvent };
  }
}

async function markWebhookEvent(eventLog, status) {
  if (!eventLog) return;

  eventLog.status = status;
  eventLog.processedAt = status === "processed" || status === "skipped" ? new Date() : null;
  await eventLog.save();
}

function applyPaidWebhook(order, razorpayPaymentId, eventId) {
  if (order.paymentStatus === "paid") {
    if (eventId && !order.webhookEvents.includes(eventId)) order.webhookEvents.push(eventId);
    return;
  }

  order.razorpayPaymentId = razorpayPaymentId || order.razorpayPaymentId;
  order.paymentStatus = "paid";
  order.orderStatus = "confirmed";
  order.paidAt = order.paidAt || new Date();
  order.failureReason = "";
  if (eventId && !order.webhookEvents.includes(eventId)) order.webhookEvents.push(eventId);
}

function applyFailedWebhook(order, razorpayPaymentId, failureReason, eventId) {
  if (order.paymentStatus === "paid") {
    if (eventId && !order.webhookEvents.includes(eventId)) order.webhookEvents.push(eventId);
    return;
  }

  order.razorpayPaymentId = razorpayPaymentId || order.razorpayPaymentId;
  order.paymentStatus = "failed";
  order.failedAt = order.failedAt || new Date();
  order.failureReason = failureReason;
  if (eventId && !order.webhookEvents.includes(eventId)) order.webhookEvents.push(eventId);
}

function validateCustomerAndShipping(body = {}) {
  const shipping = body.shipping || body.shippingAddress || {};
  const customerName = cleanString(body.customerName || body.fullName || shipping.fullName, 80);
  const email = normalizeEmail(body.email || shipping.email);
  const phone = normalizePhone(body.phone || shipping.phone);

  const shippingAddress = {
    addressLine1: cleanString(shipping.addressLine1, 180),
    addressLine2: cleanString(shipping.addressLine2, 180),
    landmark: cleanString(shipping.landmark, 120),
    city: cleanString(shipping.city, 80),
    district: cleanString(shipping.district, 80),
    state: cleanString(shipping.state, 80),
    pincode: cleanString(shipping.pincode, 6),
  };

  const errors = {};
  if (!customerName) errors.fullName = "Full name is required";
  if (!emailRegex.test(email)) errors.email = "Enter a valid email address";
  if (!/^[6-9]\d{9}$/.test(phone)) errors.phone = "Enter a valid Indian mobile number";
  if (!shippingAddress.addressLine1) errors.addressLine1 = "Address line 1 is required";
  if (!shippingAddress.city) errors.city = "City is required";
  if (!shippingAddress.district) errors.district = "District is required";
  if (!shippingAddress.state) errors.state = "State is required";
  if (!indianPinCodeRegex.test(shippingAddress.pincode)) errors.pincode = "Enter a valid PIN code";

  if (Object.keys(errors).length > 0) {
    throw new ApiError(422, "Invalid checkout details", errors);
  }

  return {
    customerName,
    email,
    phone,
    shippingAddress,
    notes: cleanString(body.notes, 500),
  };
}

function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(422, "Cart is empty", { cart: "Add at least one product before checkout" });
  }

  if (items.length > 50) {
    throw new ApiError(422, "Cart has too many items", { cart: "Please reduce the number of cart items" });
  }

  return items.map((item, index) => {
    const productId = cleanString(item.productId || item._id || item.id, 80);
    const variantId = cleanString(item.variantId || item.selectedVariantId || item.variant?._id || item.variant?.id, 80);
    const quantity = Number(item.quantity);

    const itemErrors = {};
    if (!mongoose.isValidObjectId(productId)) itemErrors.productId = "Invalid product ID";
    if (!mongoose.isValidObjectId(variantId)) itemErrors.variantId = "Invalid selected weight";
    if (!Number.isInteger(quantity) || quantity < 1) itemErrors.quantity = "Quantity must be at least 1";

    if (Object.keys(itemErrors).length > 0) {
      throw new ApiError(422, "Invalid cart item", { [`items.${index}`]: itemErrors });
    }

    return {
      productId,
      variantId,
      quantity,
    };
  });
}

async function buildOrderProducts(cartItems) {
  const productIds = [...new Set(cartItems.map((item) => item.productId))];
  const products = await Product.find({ _id: { $in: productIds }, isActive: true });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  let deliveryCharge = 0;
  const orderedProducts = cartItems.map((item, index) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new ApiError(404, "Product not found", { [`items.${index}.productId`]: "Product was not found" });
    }

    const variant = product.variants.id(item.variantId);
    if (!variant || variant.isActive === false) {
      throw new ApiError(422, "Invalid selected weight", { [`items.${index}.variantId`]: "Selected weight is not available" });
    }

    const stock = Math.max(0, Math.floor(Number(variant.stock) || 0));
    if (stock < 1 || item.quantity > stock) {
      throw new ApiError(422, "Insufficient stock", { [`items.${index}.quantity`]: `Only ${stock} item(s) available` });
    }

    const itemPrice = Number(variant.price);
    if (!Number.isFinite(itemPrice) || itemPrice < 1) {
      throw new ApiError(422, "Invalid product price", { [`items.${index}.variantId`]: "Selected weight price is invalid" });
    }

    const productDeliveryCharge = product.delivery?.type === "fixed"
      ? Math.max(0, Number(product.delivery.charge) || 0)
      : 0;
    deliveryCharge = Math.max(deliveryCharge, productDeliveryCharge);

    return {
      product: product._id,
      productName: product.name,
      slug: product.slug,
      image: product.image,
      variantId: variant._id,
      variantLabel: variant.label,
      grams: variant.grams,
      quantity: item.quantity,
      itemPrice,
      itemTotal: itemPrice * item.quantity,
    };
  });

  return { orderedProducts, deliveryCharge };
}

export const createPaymentOrder = asyncHandler(async (req, res) => {
  const order = await createPendingCheckoutOrder(req.body, req.user, "razorpay");
  const { amountInPaise } = order;

  let razorpayOrder;
  try {
    razorpayOrder = await getRazorpayInstance().orders.create({
      amount: amountInPaise,
      currency,
      receipt: order._id.toString(),
      notes: {
        internalOrderId: order._id.toString(),
      },
    });
  } catch {
    throw new ApiError(502, "Unable to create secure payment order. Please try again.");
  }

  order.razorpayOrderId = razorpayOrder.id;
  await order.save();

  res.status(201).json({
    success: true,
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    keyId: getRazorpayKeyId(),
    internalOrderId: order._id.toString(),
  });
});

export const verifyPayment = asyncHandler(async (req, res) => {
  const razorpayOrderId = cleanString(req.body.razorpay_order_id, 80);
  const razorpayPaymentId = cleanString(req.body.razorpay_payment_id, 80);
  const razorpaySignature = cleanString(req.body.razorpay_signature, 180);
  const internalOrderId = cleanString(req.body.internalOrderId, 80);

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !mongoose.isValidObjectId(internalOrderId)) {
    throw new ApiError(422, "Missing payment verification details");
  }

  const order = await Order.findById(internalOrderId);
  if (!order || order.razorpayOrderId !== razorpayOrderId) {
    throw new ApiError(404, "Payment order not found");
  }

  if (!order.user || order.user.toString() !== req.user.id) {
    throw new ApiError(403, "Access denied");
  }

  if (order.paymentStatus === "paid") {
    if (order.razorpayPaymentId === razorpayPaymentId) {
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        orderId: order._id.toString(),
        paymentId: order.razorpayPaymentId,
      });
    }

    throw new ApiError(409, "This order has already been paid");
  }

  const duplicatePayment = await Order.findOne({
    _id: { $ne: order._id },
    razorpayPaymentId,
  });

  if (duplicatePayment) {
    throw new ApiError(409, "This payment was already processed");
  }

  const expectedSignature = createHmacSignature(`${order.razorpayOrderId}|${razorpayPaymentId}`, getRazorpayKeySecret());

  if (!timingSafeCompare(expectedSignature, razorpaySignature)) {
    order.paymentStatus = "failed";
    order.failedAt = new Date();
    await order.save();
    throw new ApiError(400, "Payment verification failed");
  }

  order.razorpayPaymentId = razorpayPaymentId;
  order.razorpaySignature = razorpaySignature;
  order.paymentStatus = "paid";
  order.orderStatus = "confirmed";
  order.paidAt = new Date();
  await order.save();

  res.status(200).json({
    success: true,
    message: "Payment verified successfully",
    orderId: order._id.toString(),
    paymentId: order.razorpayPaymentId,
  });
});

export const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const expectedSignature = createHmacSignature(rawBody, getRazorpayWebhookSecret());

  if (!signature || !timingSafeCompare(expectedSignature, signature)) {
    return res.status(400).json({
      success: false,
      message: "Invalid webhook signature",
    });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new ApiError(400, "Invalid webhook payload");
  }

  const {
    eventId,
    eventType,
    razorpayOrderId,
    razorpayPaymentId,
    failureReason,
  } = extractWebhookData(event, rawBody, req.headers["x-razorpay-event-id"]);

  if (!["order.paid", "payment.captured", "payment.failed"].includes(eventType)) {
    logWebhook({ eventType, eventId, razorpayOrderId, succeeded: true, note: "ignored_event" });
    return res.status(200).json({ received: true });
  }

  const { duplicate, eventLog } = await reserveWebhookEvent({
    eventId,
    eventType,
    razorpayOrderId,
    razorpayPaymentId,
  });

  if (duplicate) {
    logWebhook({ eventType, eventId, razorpayOrderId, succeeded: true, note: "duplicate" });
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    if (!razorpayOrderId) {
      await markWebhookEvent(eventLog, "skipped");
      logWebhook({ eventType, eventId, razorpayOrderId, succeeded: true, note: "missing_order_id" });
      return res.status(200).json({ received: true });
    }

    const order = await Order.findOne({ razorpayOrderId });
    if (!order) {
      await markWebhookEvent(eventLog, "skipped");
      logWebhook({ eventType, eventId, razorpayOrderId, succeeded: true, note: "order_not_found" });
      return res.status(200).json({ received: true });
    }

    if (eventType === "order.paid" || eventType === "payment.captured") {
      applyPaidWebhook(order, razorpayPaymentId, eventId);
    }

    if (eventType === "payment.failed") {
      applyFailedWebhook(order, razorpayPaymentId, failureReason, eventId);
    }

    await order.save();
    await markWebhookEvent(eventLog, "processed");
    logWebhook({ eventType, eventId, razorpayOrderId, succeeded: true });
  } catch (error) {
    await markWebhookEvent(eventLog, "failed");
    logWebhook({ eventType, eventId, razorpayOrderId, succeeded: false, note: "processing_failed" });
    throw error;
  }

  res.status(200).json({ received: true });
});
