import { Env, StandardCheckoutClient } from "@phonepe-pg/pg-sdk-node";
import ApiError from "../utils/ApiError.js";

let client;
let clientKey = "";

export function getPhonePeConfigurationStatus({ webhook = false } = {}) {
  const enabled = String(process.env.PHONEPE_ENABLED || "").trim().toLowerCase() === "true";
  const environment = String(process.env.PHONEPE_ENV || "SANDBOX").trim().toUpperCase();
  const clientIdPresent = Boolean(String(process.env.PHONEPE_CLIENT_ID || "").trim());
  const clientSecretPresent = Boolean(String(process.env.PHONEPE_CLIENT_SECRET || "").trim());
  const version = Number(String(process.env.PHONEPE_CLIENT_VERSION || "").trim());
  const clientVersionValid = Number.isInteger(version) && version > 0;
  const environmentValid = ["SANDBOX", "PRODUCTION"].includes(environment);
  const webhookUsernamePresent = Boolean(String(process.env.PHONEPE_WEBHOOK_USERNAME || "").trim());
  const webhookPasswordPresent = Boolean(String(process.env.PHONEPE_WEBHOOK_PASSWORD || "").trim());
  const webhookConfigured = webhookUsernamePresent && webhookPasswordPresent;

  return {
    configured: enabled
      && clientIdPresent
      && clientSecretPresent
      && clientVersionValid
      && environmentValid
      && (!webhook || webhookConfigured),
    enabled,
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
  if (!isPhonePeConfigured({ webhook })) throw new ApiError(503, "PhonePe payment gateway is not configured yet.");
  const version = Number(process.env.PHONEPE_CLIENT_VERSION);
  if (!Number.isInteger(version) || version < 1) throw new ApiError(503, "PhonePe payment gateway is not configured yet.");
  const environment = String(process.env.PHONEPE_ENV || "SANDBOX").trim().toUpperCase() === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX;
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
