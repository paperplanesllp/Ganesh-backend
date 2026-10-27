import { StandardCheckoutPayRequest } from "@phonepe-pg/pg-sdk-node";
import { getPhonePeClient, getPhonePeWebhookCredentials } from "../config/phonepe.js";

export async function initiatePhonePePayment({ merchantOrderId, amount, redirectUrl }) {
  const request = StandardCheckoutPayRequest.builder().merchantOrderId(merchantOrderId).amount(amount).redirectUrl(redirectUrl).build();
  return getPhonePeClient().pay(request);
}

export function getPhonePeOrderStatus(merchantOrderId) {
  return getPhonePeClient().getOrderStatus(merchantOrderId, true);
}

export function validatePhonePeCallback(authorization, rawBody) {
  const { username, password } = getPhonePeWebhookCredentials();
  return getPhonePeClient({ webhook: true }).validateCallback(username, password, authorization, rawBody);
}

function latestPayment(response) {
  if (!Array.isArray(response?.paymentDetails) || response.paymentDetails.length === 0) return null;
  return [...response.paymentDetails].sort((left, right) => Number(right?.timestamp || 0) - Number(left?.timestamp || 0))[0];
}

export function phonePeUpdateFromResponse(response) {
  const payment = latestPayment(response);
  return {
    phonepeOrderId: response?.orderId || "",
    transactionId: payment?.transactionId || "",
    paymentMode: payment?.paymentMode || "",
    state: response?.state || payment?.state || "",
    amount: response?.amount,
    errorCode: response?.errorCode || payment?.errorCode || "",
    detailedErrorCode: response?.detailedErrorCode || payment?.detailedErrorCode || "",
  };
}

export function mapPhonePeState(state) {
  const normalized = String(state || "").toUpperCase();
  if (["COMPLETED", "SUCCESS"].includes(normalized)) return "paid";
  if (["FAILED", "EXPIRED", "CANCELLED"].includes(normalized)) return "failed";
  return "pending";
}
