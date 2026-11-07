// Order emails are sent through an email provider's HTTPS API (Resend or Brevo).
// Render's free plan blocks outbound SMTP ports, so SMTP/Nodemailer is not used.

const REQUEST_TIMEOUT_MS = 10000;
const SUPPORTED_PROVIDERS = ["resend", "brevo"];
const simpleEmailRegex = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

let missingConfigWarned = false;

function cleanHeaderText(value = "") {
  // Names and subjects end up in email headers: keep them on one line.
  return String(value).replace(/[\r\n]+/g, " ").replace(/[<>"]/g, "").trim();
}

function parseEmailList(value = "") {
  return String(value)
    .split(",")
    .map((email) => email.trim())
    .filter((email) => simpleEmailRegex.test(email));
}

export function getEmailConfig() {
  const provider = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const apiKey = String(
    provider === "brevo" ? process.env.BREVO_API_KEY || "" : process.env.RESEND_API_KEY || "",
  ).trim();
  const fromEmail = String(process.env.MAIL_FROM_EMAIL || "").trim();
  const fromName = cleanHeaderText(process.env.MAIL_FROM_NAME || "Ganesh Pickles") || "Ganesh Pickles";
  const storeEmails = parseEmailList(process.env.STORE_EMAIL);
  const replyTo = parseEmailList(process.env.MAIL_REPLY_TO)[0] || storeEmails[0] || "";

  const missing = [];
  if (!SUPPORTED_PROVIDERS.includes(provider)) missing.push("EMAIL_PROVIDER (resend or brevo)");
  if (!apiKey) missing.push(provider === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY");
  if (!simpleEmailRegex.test(fromEmail)) missing.push("MAIL_FROM_EMAIL");
  if (storeEmails.length === 0) missing.push("STORE_EMAIL");

  return { provider, apiKey, fromEmail, fromName, storeEmails, replyTo, missing, configured: missing.length === 0 };
}

export function isEmailConfigured() {
  const config = getEmailConfig();
  if (!config.configured && !missingConfigWarned) {
    missingConfigWarned = true;
    console.warn("[email] Email is not fully configured; order emails will wait until it is.", { missing: config.missing });
  }
  if (config.configured) missingConfigWarned = false;
  return config.configured;
}

async function postJson(providerName, url, headers, body) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? "request timed out" : error?.message || "network error";
    throw new Error(`${providerName}: ${reason}`);
  }

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail = data?.message || data?.error || raw.slice(0, 200) || "no details";
    const error = new Error(`${providerName} ${response.status}: ${detail}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function sendWithResend(config, message) {
  let data;
  try {
    data = await postJson(
      "Resend",
      "https://api.resend.com/emails",
      {
        Authorization: `Bearer ${config.apiKey}`,
        ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey.slice(0, 256) } : {}),
      },
      {
        from: `${config.fromName} <${config.fromEmail}>`,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: [message.replyTo] } : {}),
      },
    );
  } catch (error) {
    // 409 = this idempotency key was already used: an earlier attempt (for
    // example one that timed out on our side) already sent this email.
    if (error?.status === 409) {
      console.warn("[email] Resend reports this email was already sent; not sending again.");
      return "already-sent";
    }
    throw error;
  }
  return data?.id || "";
}

async function sendWithBrevo(config, message) {
  const data = await postJson(
    "Brevo",
    "https://api.brevo.com/v3/smtp/email",
    { "api-key": config.apiKey },
    {
      sender: { name: config.fromName, email: config.fromEmail },
      to: message.to.map((email) => ({ email })),
      subject: message.subject,
      htmlContent: message.html,
      textContent: message.text,
      ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
    },
  );
  return data?.messageId || "";
}

async function sendEmail(config, message) {
  return config.provider === "brevo" ? sendWithBrevo(config, message) : sendWithResend(config, message);
}

// ---------- Email content ----------

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

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium", timeStyle: "short",
    timeZone: process.env.EMAIL_TIME_ZONE || "Asia/Kolkata",
  }).format(date ? new Date(date) : new Date());
}

function frontendUrl(path = "") {
  const base = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  return /^https:\/\//.test(base) ? `${base}${path}` : "";
}

function buildOrderDetails(order) {
  const orderId = String(order._id);
  const shortId = orderId.slice(-8).toUpperCase();
  const address = order.shippingAddress || {};
  const addressLines = [
    address.addressLine1,
    address.addressLine2,
    address.landmark ? `Landmark: ${address.landmark}` : "",
    [address.city, address.district].filter(Boolean).join(", "),
    [address.state, address.pincode].filter(Boolean).join(" - "),
  ].filter(Boolean);
  const products = (Array.isArray(order.products) ? order.products : []).map((item) => ({
    name: `${item.productName || "Product"}${item.variantLabel ? ` (${item.variantLabel})` : ""}`,
    quantity: Number(item.quantity) || 0,
    itemPrice: item.itemPrice,
    itemTotal: item.itemTotal,
  }));

  return {
    orderId,
    shortId,
    customerName: order.customerName || order.customerSnapshot?.name || "Customer",
    customerEmail: String(order.email || order.customerSnapshot?.email || "").trim(),
    accountEmail: String(order.customerSnapshot?.email || "").trim(),
    phone: order.phone || order.customerSnapshot?.mobile || "",
    addressLines,
    notes: String(order.notes || "").trim(),
    products,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge,
    totalAmount: order.totalAmount,
    orderDate: formatDate(order.paidAt || order.createdAt),
    transactionId: order.phonepe?.transactionId || "",
    paymentMode: order.phonepe?.paymentMode || "",
  };
}

function productsTableHtml(details) {
  const rows = details.products.map((item) => `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #eee;">${escapeHtml(item.name)}</td>
            <td style="padding:10px;text-align:center;border-bottom:1px solid #eee;">${item.quantity}</td>
            <td style="padding:10px;text-align:right;border-bottom:1px solid #eee;">${formatINR(item.itemTotal)}</td>
          </tr>`).join("");

  return `
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead><tr style="background:#f7faf7;">
            <th style="padding:10px;text-align:left;">Product</th>
            <th style="padding:10px;text-align:center;">Qty</th>
            <th style="padding:10px;text-align:right;">Amount</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <table style="width:100%;margin-top:12px;font-size:14px;">
          <tr><td style="text-align:right;padding:3px 10px;">Subtotal</td><td style="text-align:right;width:120px;padding:3px 10px;">${formatINR(details.subtotal)}</td></tr>
          <tr><td style="text-align:right;padding:3px 10px;">Delivery charge</td><td style="text-align:right;padding:3px 10px;">${formatINR(details.deliveryCharge)}</td></tr>
          <tr><td style="text-align:right;padding:6px 10px;font-size:16px;font-weight:bold;">Total paid</td><td style="text-align:right;padding:6px 10px;font-size:16px;font-weight:bold;">${formatINR(details.totalAmount)}</td></tr>
        </table>`;
}

function productsText(details) {
  return [
    ...details.products.map((item) => `- ${item.name} x ${item.quantity}: ${formatINR(item.itemTotal)}`),
    "",
    `Subtotal: ${formatINR(details.subtotal)}`,
    `Delivery charge: ${formatINR(details.deliveryCharge)}`,
    `Total paid: ${formatINR(details.totalAmount)}`,
  ].join("\n");
}

function layoutHtml(heading, bodyHtml) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:16px;background:#f5f5f4;">
  <div style="font-family:Arial,sans-serif;color:#252525;line-height:1.6;max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#276749;color:#fff;padding:20px 24px;">
      <h1 style="margin:0;font-size:22px;">Ganesh Pickles</h1>
      <p style="margin:4px 0 0;">${escapeHtml(heading)}</p>
    </div>
    <div style="padding:24px;">${bodyHtml}
    </div>
  </div>
</body></html>`;
}

function addressHtml(details) {
  return details.addressLines.map(escapeHtml).join("<br>") || "Not available";
}

function buildCustomerEmail(details, replyTo) {
  const ordersUrl = frontendUrl("/account/orders");
  const html = layoutHtml("Order confirmation", `
        <p>Hello ${escapeHtml(details.customerName)},</p>
        <p>Thank you for your order. We have received your payment and your order is confirmed. We will let you know when it is dispatched.</p>
        <p style="margin:16px 0;"><strong>Order ID:</strong> #${escapeHtml(details.shortId)}<br>
        <strong>Order date:</strong> ${escapeHtml(details.orderDate)}</p>
        <h2 style="font-size:17px;margin:20px 0 8px;">Your order</h2>
        ${productsTableHtml(details)}
        <h2 style="font-size:17px;margin:20px 0 8px;">Delivery address</h2>
        <p style="margin:0;">${escapeHtml(details.customerName)}<br>${addressHtml(details)}<br>Phone: ${escapeHtml(details.phone)}</p>
        ${details.notes ? `<p style="margin:12px 0 0;"><strong>Your note:</strong> ${escapeHtml(details.notes)}</p>` : ""}
        ${ordersUrl ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(ordersUrl)}" style="color:#276749;font-weight:bold;">View your orders</a></p>` : ""}
        <p style="margin:20px 0 0;">${replyTo ? "Questions? Just reply to this email." : ""} Thank you for choosing Ganesh Pickles!</p>`);

  const text = [
    `Hello ${details.customerName},`,
    "",
    "Thank you for your order. We have received your payment and your order is confirmed. We will let you know when it is dispatched.",
    "",
    `Order ID: #${details.shortId}`,
    `Order date: ${details.orderDate}`,
    "",
    "Your order:",
    productsText(details),
    "",
    "Delivery address:",
    details.customerName,
    ...details.addressLines,
    `Phone: ${details.phone}`,
    ...(details.notes ? ["", `Your note: ${details.notes}`] : []),
    ...(ordersUrl ? ["", `View your orders: ${ordersUrl}`] : []),
    "",
    `${replyTo ? "Questions? Just reply to this email. " : ""}Thank you for choosing Ganesh Pickles!`,
  ].join("\n");

  return {
    subject: cleanHeaderText(`Order confirmed - Ganesh Pickles #${details.shortId}`),
    html,
    text,
  };
}

function buildStoreEmail(details) {
  const adminUrl = frontendUrl("/admin/orders");
  const accountEmailLine = details.accountEmail && details.accountEmail !== details.customerEmail
    ? details.accountEmail
    : "";
  const html = layoutHtml("New paid order", `
        <p style="margin:0 0 16px;font-size:16px;"><strong>New order #${escapeHtml(details.shortId)}</strong> - ${formatINR(details.totalAmount)} paid</p>
        <h2 style="font-size:17px;margin:0 0 8px;">Customer</h2>
        <p style="margin:0;">${escapeHtml(details.customerName)}<br>
        Email: ${escapeHtml(details.customerEmail || "Not available")}<br>
        ${accountEmailLine ? `Account email: ${escapeHtml(accountEmailLine)}<br>` : ""}
        Phone: ${escapeHtml(details.phone || "Not available")}</p>
        <h2 style="font-size:17px;margin:20px 0 8px;">Ship to</h2>
        <p style="margin:0;">${addressHtml(details)}</p>
        ${details.notes ? `<p style="margin:12px 0 0;padding:10px;background:#fef9c3;border-radius:6px;"><strong>Customer note:</strong> ${escapeHtml(details.notes)}</p>` : ""}
        <h2 style="font-size:17px;margin:20px 0 8px;">Products</h2>
        ${productsTableHtml(details)}
        <p style="margin:20px 0 0;font-size:13px;color:#555;">Order ID: ${escapeHtml(details.orderId)}<br>
        Paid at: ${escapeHtml(details.orderDate)}<br>
        ${details.transactionId ? `PhonePe transaction ID: ${escapeHtml(details.transactionId)}<br>` : ""}
        ${details.paymentMode ? `Payment mode: ${escapeHtml(details.paymentMode)}` : ""}</p>
        ${adminUrl ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(adminUrl)}" style="color:#276749;font-weight:bold;">Open admin orders</a></p>` : ""}`);

  const text = [
    `New order #${details.shortId} - ${formatINR(details.totalAmount)} paid`,
    "",
    "Customer:",
    details.customerName,
    `Email: ${details.customerEmail || "Not available"}`,
    ...(accountEmailLine ? [`Account email: ${accountEmailLine}`] : []),
    `Phone: ${details.phone || "Not available"}`,
    "",
    "Ship to:",
    ...details.addressLines,
    ...(details.notes ? ["", `Customer note: ${details.notes}`] : []),
    "",
    "Products:",
    productsText(details),
    "",
    `Order ID: ${details.orderId}`,
    `Paid at: ${details.orderDate}`,
    ...(details.transactionId ? [`PhonePe transaction ID: ${details.transactionId}`] : []),
    ...(details.paymentMode ? [`Payment mode: ${details.paymentMode}`] : []),
    ...(adminUrl ? ["", `Admin orders: ${adminUrl}`] : []),
  ].join("\n");

  return {
    subject: cleanHeaderText(`New order #${details.shortId} - ${formatINR(details.totalAmount)} - ${details.customerName}`),
    html,
    text,
  };
}

/**
 * Sends the requested order emails. Never throws.
 * @param {object} order Mongoose order document or plain object.
 * @param {{ customer?: boolean, store?: boolean, sendKey?: string }} options
 * @returns {Promise<{ configured: boolean, customer: {sent:boolean,error?:string}|null, store: {sent:boolean,error?:string}|null }>}
 */
export async function sendOrderEmails(order, { customer = true, store = true, sendKey = "0" } = {}) {
  const result = { configured: false, customer: null, store: null };
  const orderId = String(order?._id || "");

  try {
    const config = getEmailConfig();
    if (!config.configured) return result;
    result.configured = true;

    const details = buildOrderDetails(order);

    if (customer) {
      if (!simpleEmailRegex.test(details.customerEmail)) {
        result.customer = { sent: false, error: "Order has no valid customer email" };
      } else {
        try {
          const message = buildCustomerEmail(details, config.replyTo);
          await sendEmail(config, {
            ...message,
            to: [details.customerEmail],
            replyTo: config.replyTo,
            idempotencyKey: `order-${orderId}-customer-${sendKey}`,
          });
          result.customer = { sent: true };
          console.info("[email] Customer order confirmation sent.", { orderId });
        } catch (error) {
          result.customer = { sent: false, error: error?.message || "Unknown email error" };
          console.error("[email] Customer order confirmation failed.", { orderId, message: result.customer.error });
        }
      }
    }

    if (store) {
      try {
        const message = buildStoreEmail(details);
        await sendEmail(config, {
          ...message,
          to: config.storeEmails,
          replyTo: simpleEmailRegex.test(details.customerEmail) ? details.customerEmail : "",
          idempotencyKey: `order-${orderId}-store-${sendKey}`,
        });
        result.store = { sent: true };
        console.info("[email] Store order notification sent.", { orderId });
      } catch (error) {
        result.store = { sent: false, error: error?.message || "Unknown email error" };
        console.error("[email] Store order notification failed.", { orderId, message: result.store.error });
      }
    }
  } catch (error) {
    console.error("[email] Could not prepare order emails.", { orderId, message: error?.message || "Unknown error" });
    if (customer && !result.customer) result.customer = { sent: false, error: "Could not prepare email" };
    if (store && !result.store) result.store = { sent: false, error: "Could not prepare email" };
  }

  return result;
}
