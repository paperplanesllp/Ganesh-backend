import assert from "node:assert/strict";
import fs from "node:fs/promises";
import mongoose from "mongoose";

const testDatabaseName = `ganesh-pickles-auth-test-${Date.now()}`;
const mongoUri = process.env.AUTH_TEST_MONGODB_URI || `mongodb://127.0.0.1:27017/${testDatabaseName}`;

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = mongoUri;
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.JWT_ACCESS_SECRET = "integration-access-secret-with-sufficient-length";
process.env.JWT_REFRESH_SECRET = "integration-refresh-secret-with-sufficient-length";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";

const [{ default: app }, { default: User }, { default: Order }] = await Promise.all([
  import("../app.js"),
  import("../models/User.js"),
  import("../models/Order.js"),
]);

let server;
let baseUrl;

async function request(path, { method = "GET", token = "", cookie = "", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  return { response, data, cookie: response.headers.get("set-cookie") || "" };
}

async function register(fullName, email, phone, password, extra = {}) {
  return request("/api/auth/register", {
    method: "POST",
    body: { fullName, email, phone, password, ...extra },
  });
}

async function login(email, password) {
  return request("/api/auth/login", { method: "POST", body: { email, password } });
}

function orderData(user, suffix) {
  const productId = new mongoose.Types.ObjectId();
  const variantId = new mongoose.Types.ObjectId();
  return {
    user: user._id,
    customerSnapshot: { name: user.fullName, email: user.email, mobile: user.phone },
    customerName: user.fullName,
    email: user.email,
    phone: user.phone,
    shippingAddress: {
      addressLine1: `${suffix} Test Street`,
      city: "Palakkad",
      district: "Palakkad",
      state: "Kerala",
      pincode: "678001",
    },
    products: [{
      product: productId,
      productName: `${suffix} Pickle`,
      slug: `${suffix.toLowerCase()}-pickle`,
      variantId,
      variantLabel: "100 g",
      grams: 100,
      quantity: 1,
      itemPrice: 100,
      itemTotal: 100,
    }],
    subtotal: 100,
    deliveryCharge: 0,
    totalAmount: 100,
    amountInPaise: 10000,
  };
}

try {
  await mongoose.connect(mongoUri);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const password = "StrongPassword@123";
  const customerARegister = await register("Customer A", "a@example.com", "9876543210", password, { role: "admin" });
  const customerBRegister = await register("Customer B", "b@example.com", "9876543211", password);
  assert.equal(customerARegister.response.status, 201);
  assert.equal(customerBRegister.response.status, 201);
  assert.equal(customerARegister.data.user.role, "customer", "public signup must ignore admin role");
  assert.notEqual(customerARegister.data.user._id, customerBRegister.data.user._id);

  assert.equal((await register("Duplicate", "a@example.com", "9876543212", password)).response.status, 409);
  assert.equal((await register("Duplicate", "different@example.com", "9876543210", password)).response.status, 409);
  const invalidLogin = await login("a@example.com", "WrongPassword@123");
  assert.equal(invalidLogin.response.status, 401);
  assert.equal(invalidLogin.cookie, "", "invalid login must not issue a refresh cookie");

  const adminAccounts = [
    ["Admin A", "admin-a@example.com", "9876543220"],
    ["Admin B", "admin-b@example.com", "9876543221"],
    ["Admin C", "admin-c@example.com", "9876543222"],
  ];
  await User.create(adminAccounts.map(([fullName, email, phone]) => ({
    fullName, email, phone, password, role: "admin",
  })));

  const customerA = await User.findOne({ email: "a@example.com" });
  const customerB = await User.findOne({ email: "b@example.com" });
  const [orderA, orderB] = await Order.create([orderData(customerA, "A"), orderData(customerB, "B")]);

  const loginA = await login("a@example.com", password);
  assert.equal(loginA.response.status, 200);
  const meA = await request("/api/users/me", { token: loginA.data.accessToken });
  assert.equal(meA.data.user.email, "a@example.com");
  const addressA = await request("/api/users/me/addresses", {
    method: "POST",
    token: loginA.data.accessToken,
    body: {
      label: "Home", fullName: "Customer A", phone: "9876543210",
      addressLine1: "A Private Address", city: "Palakkad", district: "Palakkad",
      state: "Kerala", pincode: "678001", isDefault: true,
    },
  });
  assert.equal(addressA.response.status, 201);
  assert.equal((await request(`/api/orders/me/${orderA._id}`, { token: loginA.data.accessToken })).response.status, 200);
  assert.equal((await request(`/api/orders/me/${orderB._id}`, { token: loginA.data.accessToken })).response.status, 404);
  assert.equal((await request("/api/admin/products", { token: loginA.data.accessToken })).response.status, 403);
  assert.equal((await request("/api/admin/dashboard", { token: loginA.data.accessToken })).response.status, 403);

  const loginB = await login("b@example.com", password);
  const meB = await request("/api/users/me", { token: loginB.data.accessToken });
  assert.equal(meB.data.user.email, "b@example.com");
  assert.deepEqual(meB.data.user.addresses, []);
  assert.equal((await request(`/api/users/me/addresses/${addressA.data.address._id}`, {
    method: "PATCH",
    token: loginB.data.accessToken,
    body: addressA.data.address,
  })).response.status, 404);
  assert.equal((await request("/api/orders/me", { token: loginB.data.accessToken })).data.orders.length, 1);

  customerA.isActive = false;
  await customerA.save();
  assert.equal((await login("a@example.com", password)).response.status, 401);

  const adminLogins = [];
  for (const [, email] of adminAccounts) {
    const adminLogin = await login(email, password);
    assert.equal(adminLogin.response.status, 200);
    assert.equal(adminLogin.data.user.role, "admin");
    assert.equal((await request("/api/admin/products", { token: adminLogin.data.accessToken })).response.status, 200);
    assert.equal((await request("/api/admin/dashboard", { token: adminLogin.data.accessToken })).response.status, 200);
    adminLogins.push(adminLogin);
  }

  const [adminLogin] = adminLogins;
  const allOrders = await request("/api/admin/orders", { token: adminLogin.data.accessToken });
  assert.equal(allOrders.response.status, 200);
  assert.equal(allOrders.data.orders.length, 2);
  const refreshCookie = adminLogin.cookie.split(";")[0];
  const refreshed = await request("/api/auth/refresh", { method: "POST", cookie: refreshCookie });
  assert.equal(refreshed.response.status, 200);
  assert.ok(refreshed.data.accessToken);
  const restoredAdmin = await request("/api/auth/me", { token: refreshed.data.accessToken });
  assert.equal(restoredAdmin.response.status, 200);
  assert.equal(restoredAdmin.data.user.role, "admin");

  const adminRouteSource = await fs.readFile(
    new URL("../../../frontend/src/components/admin/AdminRoute.jsx", import.meta.url),
    "utf8",
  );
  assert.match(adminRouteSource, /user\?\.role !== 'admin'/);
  assert.doesNotMatch(adminRouteSource, /USE_MOCK_DATA/);
  const appSource = await fs.readFile(
    new URL("../../../frontend/src/App.jsx", import.meta.url),
    "utf8",
  );
  const navbarSource = await fs.readFile(
    new URL("../../../frontend/src/components/common/Navbar.jsx", import.meta.url),
    "utf8",
  );
  assert.match(appSource, /path="\/admin\/dashboard"/);
  assert.match(navbarSource, /to="\/admin\/dashboard"/);

  console.log("PASS: multi-user authentication, ownership, admin isolation, refresh, duplicates, and inactive login");
} finally {
  if (mongoose.connection.readyState) {
    if (mongoose.connection.name === testDatabaseName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (server) await new Promise((resolve) => server.close(resolve));
}
