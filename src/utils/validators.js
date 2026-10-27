const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const indianMobileRegex = /^[6-9]\d{9}$/;

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizePhone(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";

  let digits = String(value).replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }

  return digits;
}

export function validateRegisterPayload(body = {}) {
  const errors = {};
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone ?? body.mobile ?? body.mobileNumber);
  const password = typeof body.password === "string" ? body.password : "";

  if (!fullName) {
    errors.fullName = "Full name is required";
  } else if (fullName.length < 2) {
    errors.fullName = "Full name must be at least 2 characters";
  } else if (fullName.length > 80) {
    errors.fullName = "Full name must be 80 characters or less";
  }

  if (!email) {
    errors.email = "Email is required";
  } else if (!emailRegex.test(email)) {
    errors.email = "Enter a valid email address";
  }

  if (!phone) {
    errors.phone = "Phone number is required";
  } else if (!indianMobileRegex.test(phone)) {
    errors.phone = "Enter a valid 10-digit Indian mobile number";
  }

  if (!password) {
    errors.password = "Password is required";
  } else if (password.length < 8) {
    errors.password = "Password must contain at least eight characters";
  } else if (password.length > 128) {
    errors.password = "Password must be 128 characters or less";
  } else if (!/[A-Z]/.test(password)) {
    errors.password = "Password must contain at least one uppercase letter";
  } else if (!/[a-z]/.test(password)) {
    errors.password = "Password must contain at least one lowercase letter";
  } else if (!/\d/.test(password)) {
    errors.password = "Password must contain at least one number";
  } else if (!/[^A-Za-z0-9]/.test(password)) {
    errors.password = "Password must contain at least one special character";
  }

  return {
    errors,
    values: {
      fullName,
      email,
      phone,
      password,
    },
  };
}

export function validateLoginPayload(body = {}) {
  const errors = {};
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!email) {
    errors.email = "Email is required";
  } else if (!emailRegex.test(email)) {
    errors.email = "Enter a valid email address";
  }

  if (!password) {
    errors.password = "Password is required";
  }

  return {
    errors,
    values: {
      email,
      password,
    },
  };
}
