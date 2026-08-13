export const SOUTH_INDIA_STATES = [
  "Kerala",
  "Tamil Nadu",
  "Karnataka",
  "Andhra Pradesh",
  "Telangana",
  "Puducherry",
];

export const INDIAN_STATES_AND_UTS = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam",
  "Bihar", "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

function normalizeState(value) {
  return String(value || "").trim().toLocaleLowerCase("en-IN");
}

const canonicalStates = new Map(INDIAN_STATES_AND_UTS.map((state) => [normalizeState(state), state]));
const southIndiaStateKeys = new Set(SOUTH_INDIA_STATES.map(normalizeState));

export function getCanonicalIndianState(value) {
  return canonicalStates.get(normalizeState(value)) || "";
}

export function calculateShippingCharge(state) {
  const canonicalState = getCanonicalIndianState(state);
  if (!canonicalState) return null;
  return southIndiaStateKeys.has(normalizeState(canonicalState)) ? 60 : 90;
}
