import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || (port === 465)).toLowerCase() === "true";

  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.warn("[email] SMTP is not fully configured; order emails will be skipped.");
    return null;
  }

  transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return transporter;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatINR(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function formatOrderDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short",
    timeZone: process.env.EMAIL_TIME_ZONE || "Asia/Kolkata",
  }).format(date ? new Date(date) : new Date());
}

function buildOrderDetails(order) {
  const orderId = String(order._id);
  const customerName = order.customerSnapshot?.name || order.customerName || "Customer";
  const customerEmail = String(order.customerSnapshot?.email || order.email || "").trim();
  const products = Array.isArray(order.products) ? order.products : [];
  const orderDate = formatOrderDate(order.createdAt);
  const totalAmount = formatINR(order.totalAmount);

  const rowsHtml = products.map((item) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee;">${escapeHtml(item.productName)}${item.variantLabel ? ` (${escapeHtml(item.variantLabel)})` : ""}</td>
      <td style="padding:10px;text-align:center;border-bottom:1px solid #eee;">${Number(item.quantity) || 0}</td>
      <td style="padding:10px;text-align:right;border-bottom:1px solid #eee;">${formatINR(item.itemTotal)}</td>
    </tr>`).join("");

  const rowsText = products.map((item) =>
    `- ${item.productName}${item.variantLabel ? ` (${item.variantLabel})` : ""} | Qty: ${item.quantity} | ${formatINR(item.itemTotal)}`
  ).join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#252525;line-height:1.6;max-width:680px;margin:0 auto;">
      <div style="background:#276749;color:#fff;padding:22px 24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:24px;">Ganesh Pickles</h1>
        <p style="margin:6px 0 0;">Order details</p>
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
        <p><strong>Order ID:</strong> ${escapeHtml(orderId)}<br>
        <strong>Customer:</strong> ${escapeHtml(customerName)}<br>
        <strong>Customer email:</strong> ${escapeHtml(customerEmail || "Not available")}<br>
        <strong>Customer phone:</strong> ${escapeHtml(order.phone || order.customerSnapshot?.mobile || "Not available")}<br>
        <strong>Order date:</strong> ${escapeHtml(orderDate)}</p>
        <h2 style="font-size:18px;margin-top:24px;">Ordered products</h2>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f7faf7;"><th style="padding:10px;text-align:left;">Product</th><th style="padding:10px;text-align:center;">Qty</th><th style="padding:10px;text-align:right;">Amount</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div style="margin-top:18px;text-align:right;">
          <p style="margin:6px 0;">Subtotal: ${formatINR(order.subtotal)}</p>
          <p style="margin:6px 0;">Delivery charge: ${formatINR(order.deliveryCharge)}</p>
          <p style="font-size:18px;font-weight:bold;margin:10px 0;">Total: ${totalAmount}</p>
        </div>
      </div>
    </div>`;

  const text = [
    `Order ID: ${orderId}`,
    `Customer: ${customerName}`,
    `Customer email: ${customerEmail || "Not available"}`,
    `Customer phone: ${order.phone || order.customerSnapshot?.mobile || "Not available"}`,
    `Order date: ${orderDate}`,
    "",
    "Ordered products:",
    rowsText || "Order items",
    "",
    `Subtotal: ${formatINR(order.subtotal)}`,
    `Delivery charge: ${formatINR(order.deliveryCharge)}`,
    `Total amount: ${totalAmount}`,
  ].join("\n");

  return { orderId, customerName, customerEmail, orderDate, totalAmount, html, text };
}

/**
 * Sends customer confirmation and store-owner notification independently.
 * Email failures are logged and returned; they never throw into the payment flow.
 */
export async function sendOrderConfirmationEmail(order) {
  const orderId = String(order?._id || "");
  const result = { customerSent: false, storeSent: false };

  try {
    const mailer = getTransporter();
    if (!mailer) return { ...result, reason: "smtp_not_configured" };

    const details = buildOrderDetails(order);
    const from = process.env.MAIL_FROM?.trim() || process.env.SMTP_USER.trim();

    if (details.customerEmail) {
      try {
        await mailer.sendMail({
          from,
          to: details.customerEmail,
          subject: `Order confirmation - Ganesh Pickles #${details.orderId}`,
          text: [
            `Hello ${details.customerName},`,
            "",
            "Thank you for shopping with Ganesh Pickles.",
            "Your payment has been confirmed and your order is confirmed.",
            "",
            details.text,
            "",
            "Thank you for choosing Ganesh Pickles!",
          ].join("\n"),
          html: details.html.replace(
            "<p style=\"margin:6px 0 0;\">Order details</p>",
            "<p style=\"margin:6px 0 0;\">Order confirmation</p>"
          ).replace(
            "<div style=\"padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;\">",
            `<div style="padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;"><p>Hello ${escapeHtml(details.customerName)},</p><p>Thank you for shopping with Ganesh Pickles. Your payment has been confirmed and your order is confirmed.</p>`
          ) + "<p>Thank you for choosing Ganesh Pickles!</p>",
        });
        result.customerSent = true;
        console.info("[email] Customer order confirmation sent.", { orderId });
      } catch (error) {
        console.error("[email] Failed to send customer confirmation.", {
          orderId, message: error?.message || "Unknown email error", code: error?.code,
        });
      }
    } else {
      console.warn("[email] Order has no customer email; customer confirmation skipped.", { orderId });
    }

    const storeEmail = String(process.env.STORE_EMAIL || "").trim();
    if (storeEmail) {
      try {
        await mailer.sendMail({
          from,
          to: storeEmail,
          subject: `New paid order - Ganesh Pickles #${details.orderId}`,
          text: `A new order has been paid and confirmed on Ganesh Pickles.\n\n${details.text}`,
          html: `<p>A new order has been paid and confirmed on Ganesh Pickles.</p>${details.html}`,
        });
        result.storeSent = true;
        console.info("[email] Store order notification sent.", { orderId });
      } catch (error) {
        console.error("[email] Failed to send store notification.", {
          orderId, message: error?.message || "Unknown email error", code: error?.code,
        });
      }
    } else {
      console.warn("[email] STORE_EMAIL is not configured; store notification skipped.", { orderId });
    }

    return result;
  } catch (error) {
    // Do not let email preparation/configuration errors affect a successful order.
    console.error("[email] Could not prepare order emails.", {
      orderId, message: error?.message || "Unknown email error", code: error?.code,
    });
    return { ...result, reason: "email_preparation_failed" };
  }
}
