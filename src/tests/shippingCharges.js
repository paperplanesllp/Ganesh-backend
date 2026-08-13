import assert from "node:assert/strict";
import { calculateShippingCharge } from "../utils/shipping.js";

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
  assert.equal(calculateShippingCharge(state), expected, `${state} should cost ₹${expected}`);
}

assert.equal(calculateShippingCharge("  kErAlA  "), 60, "State matching should ignore case and surrounding whitespace");
assert.equal(calculateShippingCharge("Not a state"), null, "Unknown locations must not receive a default charge");

const products = [
  { price: 180, quantity: 2 },
  { price: 240, quantity: 1 },
];
const subtotal = products.reduce((sum, item) => sum + item.price * item.quantity, 0);
const shippingCharge = calculateShippingCharge("Kerala");

assert.equal(subtotal, 600);
assert.equal(shippingCharge, 60);
assert.equal(subtotal + shippingCharge, 660, "Shipping must be added once for a multi-product order");

console.log("Shipping charge tests passed.");
