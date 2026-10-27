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

export function calculateTotalCartWeightKg(items = []) {
  const totalWeightGrams = items.reduce((total, item) => {
    const grams = Number(item?.grams);
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(grams) || grams <= 0 || !Number.isInteger(quantity) || quantity <= 0) return total;
    return total + grams * quantity;
  }, 0);

  return totalWeightGrams / 1000;
}

export function calculateShippingCharge(state, totalWeightKg) {
  const canonicalState = getCanonicalIndianState(state);
  if (!canonicalState) return null;
  const weight = Number(totalWeightKg);
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const chargeableKg = Math.ceil(weight);
  const ratePerKg = southIndiaStateKeys.has(normalizeState(canonicalState)) ? 60 : 90;
  return chargeableKg * ratePerKg;
}
