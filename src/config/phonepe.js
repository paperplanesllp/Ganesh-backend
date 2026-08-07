import { Env, StandardCheckoutClient } from "@phonepe-pg/pg-sdk-node";
import ApiError from "../utils/ApiError.js";

let client;
let clientKey = "";

export function isPhonePeConfigured({ webhook = false } = {}) {
  const environment = String(process.env.PHONEPE_ENV || "SANDBOX").toUpperCase();
  const version = Number(process.env.PHONEPE_CLIENT_VERSION);
  const base = process.env.PHONEPE_ENABLED === "true"
    && process.env.PHONEPE_MERCHANT_ID
    && process.env.PHONEPE_CLIENT_ID
    && process.env.PHONEPE_CLIENT_SECRET
    && Number.isInteger(version)
    && version > 0
    && ["SANDBOX", "PRODUCTION"].includes(environment);
  return Boolean(base && (!webhook || (process.env.PHONEPE_WEBHOOK_USERNAME && process.env.PHONEPE_WEBHOOK_PASSWORD)));
}

export function getPhonePeClient({ webhook = false } = {}) {
  if (!isPhonePeConfigured({ webhook })) throw new ApiError(503, "PhonePe payment gateway is not configured yet.");
  const version = Number(process.env.PHONEPE_CLIENT_VERSION);
  if (!Number.isInteger(version) || version < 1) throw new ApiError(503, "PhonePe payment gateway is not configured yet.");
  const environment = String(process.env.PHONEPE_ENV || "SANDBOX").toUpperCase() === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX;
  const key = `${process.env.PHONEPE_CLIENT_ID}:${process.env.PHONEPE_CLIENT_SECRET}:${version}:${environment}`;
  if (!client || clientKey !== key) {
    client = StandardCheckoutClient.getInstance(process.env.PHONEPE_CLIENT_ID, process.env.PHONEPE_CLIENT_SECRET, version, environment);
    clientKey = key;
  }
  return client;
}

export function getPhonePeWebhookCredentials() {
  getPhonePeClient({ webhook: true });
  return { username: process.env.PHONEPE_WEBHOOK_USERNAME, password: process.env.PHONEPE_WEBHOOK_PASSWORD };
}
