import Order from "../models/Order.js";
<<<<<<< HEAD
=======
import { sendOrderConfirmationEmail } from "./emailService.js";
>>>>>>> origin/confirm-mail

export async function applyPhonePeResult(order, response) {
  const { phonePeUpdateFromResponse, mapPhonePeState } = await import("./phonepeService.js");
  const phonepe = phonePeUpdateFromResponse(response);
  const status = mapPhonePeState(phonepe.state);
  const phonepeFields = Object.fromEntries(
    Object.entries(phonepe).map(([key, value]) => [`phonepe.${key}`, value]),
  );
  const common = {
    ...phonepeFields,
    failureReason: status === "failed"
      ? (phonepe.detailedErrorCode || phonepe.errorCode || "Payment failed")
      : "",
  };

<<<<<<< HEAD
  if (status === "paid") {
    await Order.updateOne(
      { _id: order._id, paymentStatus: { $ne: "paid" } },
      { $set: { ...common, paymentStatus: "paid", orderStatus: "confirmed", paidAt: new Date(), failedAt: null } },
    );
=======
  let transitionedToPaid = false;

  if (status === "paid") {
    const transition = await Order.updateOne(
      { _id: order._id, paymentStatus: { $ne: "paid" } },
      { $set: { ...common, paymentStatus: "paid", orderStatus: "confirmed", paidAt: new Date(), failedAt: null } },
    );
    transitionedToPaid = transition.modifiedCount === 1;
>>>>>>> origin/confirm-mail

    // A repeated status check or webhook may enrich PhonePe identifiers, but it
    // must never re-run the paid transition or any future fulfilment side effects.
    await Order.updateOne(
      { _id: order._id, paymentStatus: "paid" },
      { $set: phonepeFields },
    );
  } else if (status === "failed") {
    await Order.updateOne(
      { _id: order._id, paymentStatus: { $ne: "paid" } },
      { $set: { ...common, paymentStatus: "failed", failedAt: order.failedAt || new Date() } },
    );
  } else {
    await Order.updateOne({ _id: order._id, paymentStatus: { $ne: "paid" } }, { $set: { ...common, paymentStatus: "pending" } });
  }

<<<<<<< HEAD
=======
  if (transitionedToPaid) {
    try {
      const paidOrder = await Order.findById(order._id);
      if (paidOrder) await sendOrderConfirmationEmail(paidOrder);
    } catch (emailError) {
      console.error("[email] Could not prepare order confirmation email.", {
        orderId: String(order._id), message: emailError?.message || "Unknown error",
      });
    }
  }

>>>>>>> origin/confirm-mail
  return Order.findById(order._id);
}

export async function applyPhonePeWebhookResult(order, response, eventKey) {
  const { phonePeUpdateFromResponse, mapPhonePeState } = await import("./phonepeService.js");
  const phonepe = phonePeUpdateFromResponse(response);
  const status = mapPhonePeState(phonepe.state);
  const phonepeFields = Object.fromEntries(
    Object.entries(phonepe).map(([key, value]) => [`phonepe.${key}`, value]),
  );
  const filter = {
    _id: order._id,
    paymentStatus: { $ne: "paid" },
    webhookEvents: { $ne: eventKey },
  };
  const update = {
    $set: {
      ...phonepeFields,
      failureReason: status === "failed"
        ? (phonepe.detailedErrorCode || phonepe.errorCode || "Payment failed")
        : "",
      paymentStatus: status,
      ...(status === "paid"
        ? { orderStatus: "confirmed", paidAt: new Date(), failedAt: null }
        : status === "failed"
          ? { failedAt: order.failedAt || new Date() }
          : {}),
    },
    $addToSet: { webhookEvents: eventKey },
  };

  const result = await Order.updateOne(filter, update);
<<<<<<< HEAD
  return { processed: result.modifiedCount === 1 };
=======
  const processed = result.modifiedCount === 1;

  if (processed && status === "paid") {
    try {
      const paidOrder = await Order.findById(order._id);
      if (paidOrder) await sendOrderConfirmationEmail(paidOrder);
    } catch (emailError) {
      console.error("[email] Could not prepare order confirmation email.", {
        orderId: String(order._id), message: emailError?.message || "Unknown error",
      });
    }
  }

  return { processed };
>>>>>>> origin/confirm-mail
}
