import assert from "node:assert/strict";
import { calculateShippingCharge, calculateTotalCartWeightKg } from "../utils/shipping.js";

const cases = [
  ["Kerala", 60],
  ["Tamil Nadu", 60],
  ["Karnataka", 60],
  ["Telangana", 60],
  ["Andhra Pradesh", 60],
  ["Puducherry", 60],
  ["Maharashtra", 90],
  ["Delhi", 90],
  ["Gujarat", 90],
  ["West Bengal", 90],
];

for (const [state, expected] of cases) {
  assert.equal(calculateShippingCharge(state, 0.5), expected, `${state} should cost ₹${expected} for 500g`);
}

assert.equal(calculateShippingCharge("  kErAlA  ", 0.5), 60, "State matching should ignore case and surrounding whitespace");
assert.equal(calculateShippingCharge("Not a state", 0.5), null, "Unknown locations must not receive a default charge");

const weightCases = [
  [0.5, 60, 90],
  [1, 60, 90],
  [1.5, 120, 180],
  [2, 120, 180],
  [2.5, 180, 270],
];

for (const [weightKg, southCharge, northCharge] of weightCases) {
  assert.equal(calculateShippingCharge("Kerala", weightKg), southCharge, `${weightKg}kg South India charge`);
  assert.equal(calculateShippingCharge("Delhi", weightKg), northCharge, `${weightKg}kg North India charge`);
}

const products = [
  { price: 180, grams: 500, quantity: 2 },
  { price: 240, grams: 1000, quantity: 1 },
];
const subtotal = products.reduce((sum, item) => sum + item.price * item.quantity, 0);
const totalWeightKg = calculateTotalCartWeightKg(products);
const shippingCharge = calculateShippingCharge("Kerala", totalWeightKg);

assert.equal(subtotal, 600);
assert.equal(totalWeightKg, 2);
assert.equal(shippingCharge, 120);
assert.equal(subtotal + shippingCharge, 720, "Shipping must use combined cart weight and be added once");

console.log("Shipping charge tests passed.");
