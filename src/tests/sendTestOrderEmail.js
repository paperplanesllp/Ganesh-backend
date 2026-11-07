// Sends the order emails for one existing order, without changing the order.
// Usage: npm run test:email -- <order-id or customer email>
// The customer email goes to the order's email address and the store email to
// STORE_EMAIL, so use an order you placed yourself.
import "dotenv/config";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import { getEmailConfig, sendOrderEmails } from "../services/emailService.js";

const lookup = String(process.argv[2] || "").trim();
if (!lookup) {
  console.error("Usage: npm run test:email -- <order-id or customer email>");
  process.exit(1);
}

const config = getEmailConfig();
if (!config.configured) {
  console.error("Email is not configured. Missing:", config.missing.join(", "));
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  const filter = mongoose.isValidObjectId(lookup) ? { _id: lookup } : { email: lookup.toLowerCase() };
  const order = await Order.findOne(filter).sort({ createdAt: -1 });
  if (!order) {
    console.error("No order found for", lookup);
    process.exitCode = 1;
  } else {
    console.log(`Sending emails for order ${order._id} to ${order.email} and ${config.storeEmails.join(", ")} via ${config.provider}...`);
    const result = await sendOrderEmails(order, { sendKey: `test-${Date.now()}` });
    console.log(JSON.stringify(result, null, 2));
    if (!result.customer?.sent || !result.store?.sent) process.exitCode = 1;
  }
} finally {
  await mongoose.disconnect();
}
