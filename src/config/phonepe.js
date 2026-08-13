import { Env, StandardCheckoutClient } from "@phonepe-pg/pg-sdk-node";
import ApiError from "../utils/ApiError.js";

let client;
let clientKey = "";

export function getPhonePeConfigurationStatus({ webhook = false } = {}) {
  const environment = String(process.env.PHONEPE_ENV || "SANDBOX").trim().toUpperCase();
  const clientIdPresent = Boolean(String(process.env.PHONEPE_CLIENT_ID || "").trim());
  const clientSecretPresent = Boolean(String(process.env.PHONEPE_CLIENT_SECRET || "").trim());
  const version = Number(String(process.env.PHONEPE_CLIENT_VERSION || "").trim());
  const clientVersionValid = Number.isInteger(version) && version > 0;
  const environmentValid = ["SANDBOX", "PRODUCTION"].includes(environment);
  const webhookUsernamePresent = Boolean(String(process.env.PHONEPE_WEBHOOK_USERNAME || "").trim());
  const webhookPasswordPresent = Boolean(String(process.env.PHONEPE_WEBHOOK_PASSWORD || "").trim());
  const webhookConfigured = webhookUsernamePresent && webhookPasswordPresent;
  const paymentConfigured = clientIdPresent
    && clientSecretPresent
    && clientVersionValid
    && environmentValid;

  return {
    configured: paymentConfigured && (!webhook || webhookConfigured),
    paymentConfigured,
    environment,
    environmentValid,
    clientIdPresent,
    clientSecretPresent,
    clientVersionPresent: Boolean(String(process.env.PHONEPE_CLIENT_VERSION || "").trim()),
    clientVersionValid,
    webhookConfigured,
  };
}

export function isPhonePeConfigured({ webhook = false } = {}) {
  return getPhonePeConfigurationStatus({ webhook }).configured;
}

export function getPhonePeClient({ webhook = false } = {}) {
  if (!isPhonePeConfigured({ webhook })) throw new ApiError(503, "PhonePe payment is currently unavailable.");
  const clientId = String(process.env.PHONEPE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PHONEPE_CLIENT_SECRET || "").trim();
  const version = Number(String(process.env.PHONEPE_CLIENT_VERSION || "").trim());
  if (!Number.isInteger(version) || version < 1) throw new ApiError(503, "PhonePe payment is currently unavailable.");
  const environment = String(process.env.PHONEPE_ENV || "SANDBOX").trim().toUpperCase() === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX;
  const key = `${clientId}:${clientSecret}:${version}:${environment}`;
  if (!client || clientKey !== key) {
    client = StandardCheckoutClient.getInstance(clientId, clientSecret, version, environment);
    clientKey = key;
  }
  return client;
}

export function getPhonePeWebhookCredentials() {
  getPhonePeClient({ webhook: true });
  return {
    username: String(process.env.PHONEPE_WEBHOOK_USERNAME || "").trim(),
    password: String(process.env.PHONEPE_WEBHOOK_PASSWORD || "").trim(),
  };
}
