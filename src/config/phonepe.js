import { Env, StandardCheckoutClient } from "@phonepe-pg/pg-sdk-node";
import ApiError from "../utils/ApiError.js";

let client;
let clientKey = "";

function normalizedEnvironmentValue() {
  return normalizedCredential("PHONEPE_ENV").toUpperCase();
}

function normalizedCredential(name) {
  const value = String(process.env[name] || "").trim();
  const quote = value[0];
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.at(-1) === quote) {
    return value.slice(1, -1).trim();
  }
  return value;
}

export function getPhonePeConfigurationStatus({ webhook = false } = {}) {
  const environment = normalizedEnvironmentValue();
  const enabled = normalizedCredential("PHONEPE_ENABLED").toLowerCase() === "true";
  const clientIdPresent = Boolean(normalizedCredential("PHONEPE_CLIENT_ID"));
  const clientSecretPresent = Boolean(normalizedCredential("PHONEPE_CLIENT_SECRET"));
  const versionValue = normalizedCredential("PHONEPE_CLIENT_VERSION");
  const clientVersion = versionValue ? Number(versionValue) : undefined;
  const version = Number(versionValue);
  const clientVersionValid = Number.isInteger(version) && version > 0;
  const environmentValid = ["SANDBOX", "PRODUCTION"].includes(environment);
  const webhookUsernamePresent = Boolean(String(process.env.PHONEPE_WEBHOOK_USERNAME || "").trim());
  const webhookPasswordPresent = Boolean(String(process.env.PHONEPE_WEBHOOK_PASSWORD || "").trim());
  const webhookConfigured = webhookUsernamePresent && webhookPasswordPresent;
  const paymentConfigured = enabled
    && clientIdPresent
    && clientSecretPresent
    && clientVersionValid
    && environmentValid;

  return {
    configured: paymentConfigured && (!webhook || webhookConfigured),
    paymentConfigured,
    enabled,
    environment,
    environmentValid,
    clientIdPresent,
    clientSecretPresent,
    clientVersion: Number.isInteger(clientVersion) && clientVersion > 0 ? clientVersion : undefined,
    clientVersionPresent: Boolean(versionValue),
    clientVersionValid,
    webhookConfigured,
  };
}

export function isPhonePeConfigured({ webhook = false } = {}) {
  return getPhonePeConfigurationStatus({ webhook }).configured;
}

export function getPhonePeClient({ webhook = false } = {}) {
  if (!isPhonePeConfigured({ webhook })) throw new ApiError(503, "PhonePe payment is currently unavailable.");

  const clientId = normalizedCredential("PHONEPE_CLIENT_ID");
  const clientSecret = normalizedCredential("PHONEPE_CLIENT_SECRET");
  const version = Number(normalizedCredential("PHONEPE_CLIENT_VERSION"));
  if (!Number.isInteger(version) || version < 1) throw new ApiError(503, "PhonePe payment is currently unavailable.");

  const environmentName = normalizedEnvironmentValue();
  const environment = environmentName === "SANDBOX"
    ? Env.SANDBOX
    : environmentName === "PRODUCTION"
      ? Env.PRODUCTION
      : (() => {
        throw new ApiError(503, "PhonePe payment is currently unavailable.");
      })();

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
