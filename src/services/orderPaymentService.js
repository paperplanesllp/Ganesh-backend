import Order from "../models/Order.js";

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

  if (status === "paid") {
    await Order.updateOne(
      { _id: order._id, paymentStatus: { $ne: "paid" } },
      { $set: { ...common, paymentStatus: "paid", orderStatus: "confirmed", paidAt: new Date(), failedAt: null } },
    );

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

  return Order.findById(order._id);
}
