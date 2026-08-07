import mongoose from "mongoose";
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import ApiError from "../utils/ApiError.js";
import { normalizeEmail, normalizePhone } from "../utils/validators.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const indianPinCodeRegex = /^\d{6}$/;

function cleanString(value, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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
  if (Object.keys(errors).length) throw new ApiError(422, "Invalid checkout details", errors);
  return { customerName, email, phone, shippingAddress, notes: cleanString(body.notes, 500) };
}

function validateCartItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new ApiError(422, "Cart is empty", { cart: "Add at least one product before checkout" });
  if (items.length > 50) throw new ApiError(422, "Cart has too many items");
  return items.map((item, index) => {
    const productId = cleanString(item.productId || item._id || item.id, 80);
    const variantId = cleanString(item.variantId || item.selectedVariantId || item.variant?._id || item.variant?.id, 80);
    const quantity = Number(item.quantity);
    if (!mongoose.isValidObjectId(productId) || !mongoose.isValidObjectId(variantId) || !Number.isInteger(quantity) || quantity < 1) {
      throw new ApiError(422, "Invalid cart item", { [`items.${index}`]: "Product, variant, or quantity is invalid" });
    }
    return { productId, variantId, quantity };
  });
}

async function buildOrderProducts(cartItems) {
  const products = await Product.find({ _id: { $in: [...new Set(cartItems.map((item) => item.productId))] }, isActive: true });
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));
  let deliveryCharge = 0;
  const orderedProducts = cartItems.map((item, index) => {
    const product = productMap.get(item.productId);
    if (!product) throw new ApiError(404, "Product not found", { [`items.${index}.productId`]: "Product was not found" });
    const variant = product.variants.id(item.variantId);
    if (!variant || variant.isActive === false) throw new ApiError(422, "Invalid selected weight", { [`items.${index}.variantId`]: "Selected weight is not available" });
    const stock = Math.max(0, Math.floor(Number(variant.stock) || 0));
    if (item.quantity > stock) throw new ApiError(422, "Insufficient stock", { [`items.${index}.quantity`]: `Only ${stock} item(s) available` });
    const itemPrice = Number(variant.price);
    if (!Number.isFinite(itemPrice) || itemPrice < 1) throw new ApiError(422, "Invalid product price");
    const productDeliveryCharge = product.delivery?.type === "fixed" ? Math.max(0, Number(product.delivery.charge) || 0) : 0;
    deliveryCharge = Math.max(deliveryCharge, productDeliveryCharge);
    return { product: product._id, productName: product.name, slug: product.slug, image: product.image, variantId: variant._id, variantLabel: variant.label, grams: variant.grams, quantity: item.quantity, itemPrice, itemTotal: itemPrice * item.quantity };
  });
  return { orderedProducts, deliveryCharge };
}

export async function createPendingCheckoutOrder(body, user, paymentMethod) {
  const cartItems = validateCartItems(body.items || body.cartItems);
  const checkoutDetails = validateCustomerAndShipping(body);
  const { orderedProducts, deliveryCharge } = await buildOrderProducts(cartItems);
  const subtotal = orderedProducts.reduce((sum, item) => sum + item.itemTotal, 0);
  const totalAmount = subtotal + deliveryCharge;
  const amountInPaise = Math.round(totalAmount * 100);
  if (!Number.isInteger(amountInPaise) || amountInPaise < 100) throw new ApiError(422, "Invalid order amount");
  return new Order({
    user: user.id,
    customerSnapshot: { name: user.fullName, email: user.email, mobile: user.phone },
    ...checkoutDetails,
    products: orderedProducts,
    currency: "INR",
    subtotal,
    deliveryCharge,
    totalAmount,
    amountInPaise,
    paymentMethod,
    paymentStatus: "pending",
    orderStatus: "pending",
  });
}
