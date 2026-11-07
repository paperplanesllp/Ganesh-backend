import mongoose from "mongoose";
import Order from "../models/Order.js";
import { isEmailConfigured, sendOrderEmails } from "./emailService.js";

// How long one send attempt may hold the order before another process may retry it.
const LOCK_MS = 2 * 60 * 1000;
export const MAX_EMAIL_ATTEMPTS = 6;
// Wait before attempt N+1 (index = attempts already made).
const RETRY_DELAYS_MS = [0, 5, 15, 60, 3 * 60, 6 * 60].map((minutes) => minutes * 60 * 1000);
// Orders older than this are not retried automatically (use the admin "Resend emails" button).
const RETRY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const WORKER_INTERVAL_MS = 5 * 60 * 1000;

const pendingEmailFilter = {
  $or: [
    { "notifications.customerEmailSentAt": null },
    { "notifications.storeEmailSentAt": null },
  ],
};

function unlockedFilter(now) {
  return {
    $or: [
      { "notifications.lockedUntil": null },
      { "notifications.lockedUntil": { $lte: now } },
    ],
  };
}

/** Fields to $set in the same update that marks an order as paid. */
export function notificationQueueFields(now = new Date()) {
  return {
    "notifications.queuedAt": now,
    "notifications.attempts": 0,
    "notifications.lockedUntil": null,
  };
}

/**
 * Claims the order, sends whichever order emails are still missing and records
 * the result. Safe to call from several places at once: only one caller wins
 * the claim. Never throws.
 */
export async function processOrderNotifications(orderId) {
  try {
    if (!isEmailConfigured()) return { skipped: "email_not_configured" };

    const now = new Date();
    const order = await Order.findOneAndUpdate(
      {
        _id: orderId,
        paymentStatus: "paid",
        "notifications.queuedAt": { $ne: null },
        "notifications.attempts": { $lt: MAX_EMAIL_ATTEMPTS },
        $and: [pendingEmailFilter, unlockedFilter(now)],
      },
      {
        $set: {
          "notifications.lockedUntil": new Date(now.getTime() + LOCK_MS),
          "notifications.lastAttemptAt": now,
        },
        $inc: { "notifications.attempts": 1 },
      },
      { new: true },
    );
    if (!order) return { skipped: "nothing_to_send" };

    const notifications = order.notifications || {};
    const result = await sendOrderEmails(order, {
      customer: !notifications.customerEmailSentAt,
      store: !notifications.storeEmailSentAt,
      sendKey: String(notifications.resendCount || 0),
    });

    const sentAt = new Date();
    const errors = [];
    const update = { "notifications.lockedUntil": null };
    if (result.customer?.sent) update["notifications.customerEmailSentAt"] = sentAt;
    else if (result.customer?.error) errors.push(`Customer: ${result.customer.error}`);
    if (result.store?.sent) update["notifications.storeEmailSentAt"] = sentAt;
    else if (result.store?.error) errors.push(`Store: ${result.store.error}`);
    if (!result.configured) errors.push("Email is not configured");
    update["notifications.lastError"] = errors.join(" | ").slice(0, 500);

    await Order.updateOne({ _id: order._id }, { $set: update });
    return { attempted: true, result };
  } catch (error) {
    console.error("[email] Order notification processing failed.", {
      orderId: String(orderId), message: error?.message || "Unknown error",
    });
    return { failed: true };
  }
}

/** Starts sending in the background; the caller does not wait for email. */
export function queueOrderNotifications(orderId) {
  processOrderNotifications(orderId).catch(() => {});
}

/** Admin action: send order emails again. target = "customer" | "store" | "both" | "missing". */
export async function resendOrderNotifications(orderId, target = "missing") {
  const now = new Date();
  const set = {
    "notifications.attempts": 0,
    "notifications.lastError": "",
  };
  if (target === "customer" || target === "both") set["notifications.customerEmailSentAt"] = null;
  if (target === "store" || target === "both") set["notifications.storeEmailSentAt"] = null;

  const existing = await Order.findOne({ _id: orderId }).select("paymentStatus notifications").lean();
  if (!existing) return { updated: false, reason: "not_found" };
  if (existing.paymentStatus !== "paid") return { updated: false, reason: "not_paid" };
  set["notifications.queuedAt"] = existing.notifications?.queuedAt || now;

  const update = await Order.updateOne(
    { _id: orderId, paymentStatus: "paid", ...unlockedFilter(now) },
    {
      $set: set,
      // A new key makes Resend send again instead of treating it as a duplicate.
      $inc: { "notifications.resendCount": 1 },
    },
  );
  if (update.modifiedCount !== 1) return { updated: false, reason: "sending" };

  const outcome = await processOrderNotifications(orderId);
  return { updated: true, outcome };
}

let workerTimer = null;
let workerRunning = false;

async function runRetryPass() {
  if (workerRunning || mongoose.connection.readyState !== 1 || !isEmailConfigured()) return;
  workerRunning = true;
  try {
    const now = new Date();
    const candidates = await Order.find({
      paymentStatus: "paid",
      "notifications.queuedAt": { $gte: new Date(now.getTime() - RETRY_WINDOW_MS) },
      "notifications.attempts": { $lt: MAX_EMAIL_ATTEMPTS },
      $and: [pendingEmailFilter, unlockedFilter(now)],
    })
      .sort({ "notifications.queuedAt": 1 })
      .limit(25)
      .select("_id notifications")
      .lean();

    const due = candidates.filter((order) => {
      const attempts = order.notifications?.attempts || 0;
      const last = order.notifications?.lastAttemptAt ? new Date(order.notifications.lastAttemptAt).getTime() : 0;
      return now.getTime() - last >= (RETRY_DELAYS_MS[attempts] ?? RETRY_DELAYS_MS.at(-1));
    });

    for (const order of due.slice(0, 10)) {
      await processOrderNotifications(order._id);
    }
  } catch (error) {
    console.error("[email] Retry pass failed.", { message: error?.message || "Unknown error" });
  } finally {
    workerRunning = false;
  }
}

/** Retries order emails that failed or were interrupted (for example by a restart). */
export function startOrderNotificationWorker() {
  if (workerTimer) return;
  workerTimer = setInterval(runRetryPass, WORKER_INTERVAL_MS);
  workerTimer.unref();
  setTimeout(runRetryPass, 15 * 1000).unref();
}

export function stopOrderNotificationWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}
