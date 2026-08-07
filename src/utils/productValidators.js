import mongoose from "mongoose";
import { spiceLevels } from "../models/Product.js";
import { createSlug } from "./createSlug.js";
import { isAcceptedCloudinaryUrl, isAcceptedProductImageUrl, isTrustedLocalProductImage, normalizeMediaItems } from "./mediaHelpers.js";

const stringArrayFields = ["images", "highlights", "usageSuggestions"];
const booleanFields = ["featured", "bestseller", "newArrival", "isActive"];
const allowedProductFields = new Set([
  "name",
  "slug",
  "shortDescription",
  "description",
  "image",
  "images",
  "media",
  "flavour",
  "category",
  "spiceLevel",
  "foodType",
  "highlights",
  "usageSuggestions",
  "featured",
  "bestseller",
  "newArrival",
  "isActive",
  "rating",
  "reviewCount",
  "variants",
  "updateSlug",
]);

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function addError(errors, field, message) {
  if (!errors[field]) errors[field] = message;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateString(errors, body, values, field, label, { required = true, min = 1, max = 500 } = {}) {
  if (body[field] === undefined && !required) return;
  const value = trimString(body[field]);

  if (!value) {
    if (required) addError(errors, field, `${label} is required`);
    return;
  }

  if (value.length < min) addError(errors, field, `${label} must be at least ${min} characters`);
  if (value.length > max) addError(errors, field, `${label} must be ${max} characters or less`);

  values[field] = value;
}

function validateStringArray(errors, body, values, field, label, maxItems = 12) {
  if (body[field] === undefined) return;
  if (!Array.isArray(body[field])) {
    addError(errors, field, `${label} must be an array`);
    return;
  }

  if (body[field].length > maxItems) {
    addError(errors, field, `${label} can contain at most ${maxItems} items`);
    return;
  }

  const cleaned = [];
  body[field].forEach((item, index) => {
    const value = trimString(item);
    if (!value) {
      addError(errors, `${field}.${index}`, `${label} item cannot be empty`);
    } else if (value.length > 300) {
      addError(errors, `${field}.${index}`, `${label} item is too long`);
    } else {
      cleaned.push(value);
    }
  });

  values[field] = cleaned;
}

function validateLegacyImageUrl(errors, field, value) {
  const url = trimString(value);
  if (!url) return;
  if (!isAcceptedProductImageUrl(url)) {
    addError(errors, field, "Use a trusted /images/products path or a Cloudinary HTTPS URL.");
  }
}

function validateNumber(errors, body, values, field, label, { required = false, min = 0, max = null, integer = false } = {}) {
  if (body[field] === undefined || body[field] === null || body[field] === "") {
    if (required) addError(errors, field, `${label} is required`);
    return;
  }

  const value = Number(body[field]);
  if (!Number.isFinite(value)) {
    addError(errors, field, `${label} must be a valid number`);
    return;
  }

  if (integer && !Number.isInteger(value)) addError(errors, field, `${label} must be an integer`);
  if (value < min) addError(errors, field, `${label} must be at least ${min}`);
  if (max !== null && value > max) addError(errors, field, `${label} must be at most ${max}`);

  values[field] = value;
}

function validateBoolean(errors, body, values, field) {
  if (body[field] === undefined) return;
  if (typeof body[field] !== "boolean") {
    addError(errors, field, `${field} must be true or false`);
    return;
  }
  values[field] = body[field];
}

function validateVariants(errors, body, values, { required }) {
  if (body.variants === undefined) {
    if (required) addError(errors, "variants", "At least one variant is required");
    return;
  }

  if (!Array.isArray(body.variants)) {
    addError(errors, "variants", "Variants must be an array");
    return;
  }

  if (body.variants.length < 1) {
    addError(errors, "variants", "At least one variant is required");
    return;
  }

  if (body.variants.length > 12) {
    addError(errors, "variants", "A product can contain at most 12 variants");
    return;
  }

  const seenSkus = new Set();
  const seenPackSizes = new Set();

  values.variants = body.variants.map((variant, index) => {
    const cleaned = {};
    if (!isObject(variant)) {
      addError(errors, `variants.${index}`, "Variant must be an object");
      return cleaned;
    }

    if (variant._id !== undefined) {
      if (!mongoose.isValidObjectId(variant._id)) {
        addError(errors, `variants.${index}._id`, "Variant ID is invalid");
      } else {
        cleaned._id = variant._id;
      }
    }

    const label = trimString(variant.label);
    if (!label) addError(errors, `variants.${index}.label`, "Variant label is required");
    else if (label.length > 40) addError(errors, `variants.${index}.label`, "Variant label is too long");
    else cleaned.label = label;

    const packageType = variant.packageType === "bottle" ? "bottle" : "pouch";
    cleaned.packageType = packageType;

    const variantImage = trimString(variant.image);
    if (variantImage && !isAcceptedProductImageUrl(variantImage)) {
      addError(errors, `variants.${index}.image`, "Use a trusted product image path or Cloudinary HTTPS URL");
    } else {
      cleaned.image = variantImage;
    }

    const grams = Number(variant.grams);
    if (!Number.isFinite(grams) || grams <= 0) {
      addError(errors, `variants.${index}.grams`, "Variant grams must be greater than zero");
    } else if (seenPackSizes.has(`${packageType}:${grams}`)) {
      addError(errors, `variants.${index}.grams`, "Duplicate package weights are not allowed");
    } else {
      cleaned.grams = grams;
      seenPackSizes.add(`${packageType}:${grams}`);
    }

    const price = Number(variant.price);
    if (!Number.isFinite(price) || price <= 0) {
      addError(errors, `variants.${index}.price`, "Variant price must be greater than zero");
    } else {
      cleaned.price = price;
    }

    if (variant.originalPrice !== undefined && variant.originalPrice !== null && variant.originalPrice !== "") {
      const originalPrice = Number(variant.originalPrice);
      if (!Number.isFinite(originalPrice) || originalPrice <= 0) {
        addError(errors, `variants.${index}.originalPrice`, "Variant original price must be greater than zero");
      } else if (Number.isFinite(price) && originalPrice < price) {
        addError(errors, `variants.${index}.originalPrice`, "Variant original price cannot be lower than price");
      } else {
        cleaned.originalPrice = originalPrice;
      }
    } else {
      cleaned.originalPrice = null;
    }

    const stock = Number(variant.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      addError(errors, `variants.${index}.stock`, "Variant stock must be a non-negative integer");
    } else {
      cleaned.stock = stock;
    }

    const sku = trimString(variant.sku).toUpperCase();
    if (!sku) {
      addError(errors, `variants.${index}.sku`, "Variant SKU is required");
    } else if (sku.length > 60) {
      addError(errors, `variants.${index}.sku`, "Variant SKU is too long");
    } else if (seenSkus.has(sku)) {
      addError(errors, `variants.${index}.sku`, "Duplicate SKUs are not allowed");
    } else {
      cleaned.sku = sku;
      seenSkus.add(sku);
    }

    cleaned.isActive = variant.isActive === undefined ? true : Boolean(variant.isActive);
    return cleaned;
  });
}

function validateMediaPayload(errors, body, values) {
  if (body.media === undefined) return;

  if (!Array.isArray(body.media)) {
    addError(errors, "media", "Media must be an array");
    return;
  }

  if (body.media.length > 5) {
    addError(errors, "media", "A product can contain up to 5 images");
    return;
  }

  const seenUrls = new Set();
  const seenPublicIds = new Set();
  const primaryCount = body.media.filter((item) => item?.isPrimary === true).length;

  if (body.media.length > 0 && primaryCount > 1) {
    addError(errors, "media", "Only one image can be primary");
  }

  const cleaned = body.media.map((item, index) => {
    const mediaItem = {};
    if (!isObject(item)) {
      addError(errors, `media.${index}`, "Media item must be an object");
      return mediaItem;
    }

    const url = trimString(item.url);
    const publicId = trimString(item.publicId);
    const alt = trimString(item.alt);

    if (!url) {
      addError(errors, `media.${index}.url`, "Image URL is required");
    } else if (!isAcceptedProductImageUrl(url)) {
      addError(errors, `media.${index}.url`, "Image URL must be a trusted Cloudinary URL or local product image path");
    } else if (seenUrls.has(url)) {
      addError(errors, `media.${index}.url`, "Duplicate image URLs are not allowed");
    } else {
      mediaItem.url = url;
      seenUrls.add(url);
    }

    if (publicId) {
      const productFolder = (process.env.CLOUDINARY_PRODUCT_FOLDER || "ganesh-pickles/products").replace(/\/+$/g, "");
      if (seenPublicIds.has(publicId)) {
        addError(errors, `media.${index}.publicId`, "Duplicate image public IDs are not allowed");
      } else if (!publicId.startsWith(`${productFolder}/`)) {
        addError(errors, `media.${index}.publicId`, "Image public ID is not allowed");
      } else if (publicId.includes("..") || publicId.includes("\\") || /[<>:"|?*]/.test(publicId)) {
        addError(errors, `media.${index}.publicId`, "Image public ID is not allowed");
      } else {
        mediaItem.publicId = publicId;
        seenPublicIds.add(publicId);
      }
    } else {
      mediaItem.publicId = "";
    }

    if (isAcceptedCloudinaryUrl(url) && !publicId) {
      addError(errors, `media.${index}.publicId`, "Cloudinary images must include a public ID");
    }

    if (publicId && isTrustedLocalProductImage(url)) {
      addError(errors, `media.${index}.publicId`, "Local product images cannot include Cloudinary public IDs");
    }

    if (alt.length > 160) addError(errors, `media.${index}.alt`, "Image alt text must be 160 characters or less");
    mediaItem.alt = alt;
    mediaItem.isPrimary = item.isPrimary === true;
    mediaItem.sortOrder = Number.isFinite(Number(item.sortOrder)) && Number(item.sortOrder) >= 0 ? Number(item.sortOrder) : index;

    return mediaItem;
  });

  values.media = normalizeMediaItems(cleaned);

  if (values.media.length > 0) {
    const primary = values.media.find((item) => item.isPrimary) || values.media[0];
    values.image = primary.url;
    values.images = values.media.map((item) => item.url);
  }
}

export function validateProductPayload(body = {}, { partial = false, hasUploadedFiles = false } = {}) {
  const errors = {};
  const values = {};

  if (!isObject(body)) {
    return {
      errors: { body: "Request body must be an object" },
      values,
    };
  }

  Object.keys(body).forEach((field) => {
    if (!allowedProductFields.has(field)) addError(errors, field, `${field} is not allowed`);
  });

  validateString(errors, body, values, "name", "Product name", { required: !partial, min: 2, max: 120 });

  if (body.slug !== undefined) {
    const slug = createSlug(body.slug);
    if (!slug) addError(errors, "slug", "Product slug is invalid");
    else values.slug = slug;
  }

  validateString(errors, body, values, "shortDescription", "Short description", { required: !partial, max: 220 });
  validateString(errors, body, values, "description", "Description", { required: !partial, max: 3000 });
  validateMediaPayload(errors, body, values);

  if (body.media === undefined) {
    validateString(errors, body, values, "image", "Main image", { required: !partial && !hasUploadedFiles, max: 500 });
    validateLegacyImageUrl(errors, "image", body.image);
  } else if (!values.media?.length && !partial && !hasUploadedFiles) {
    addError(errors, "media", "At least one product image is required");
  }

  validateString(errors, body, values, "flavour", "Flavour", { required: !partial, max: 80 });
  validateString(errors, body, values, "category", "Category", { required: !partial, max: 80 });

  if (body.spiceLevel !== undefined || !partial) {
    const spiceLevel = trimString(body.spiceLevel);
    if (!spiceLevel) addError(errors, "spiceLevel", "Spice level is required");
    else if (!spiceLevels.includes(spiceLevel)) addError(errors, "spiceLevel", "Unknown spice level");
    else values.spiceLevel = spiceLevel;
  }

  if (body.foodType !== undefined) {
    if (body.foodType !== "Vegetarian") addError(errors, "foodType", "Food type must be Vegetarian");
    else values.foodType = "Vegetarian";
  }

  stringArrayFields.forEach((field) => {
    if (field === "images" && body.media !== undefined) return;
    validateStringArray(errors, body, values, field, field, field === "images" ? 5 : 12);
  });

  if (body.media === undefined && values.images) {
    values.images.forEach((image, index) => validateLegacyImageUrl(errors, `images.${index}`, image));
  }

  booleanFields.forEach((field) => validateBoolean(errors, body, values, field));
  validateNumber(errors, body, values, "rating", "Rating", { min: 0, max: 5 });
  validateNumber(errors, body, values, "reviewCount", "Review count", { min: 0, integer: true });
  validateVariants(errors, body, values, { required: !partial });

  values.updateSlug = body.updateSlug === true;

  return { errors, values };
}

export function validateProductStatusPayload(body = {}) {
  const errors = {};
  const values = {};
  const allowed = ["isActive", "featured", "bestseller", "newArrival"];

  if (!isObject(body)) {
    return { errors: { body: "Request body must be an object" }, values };
  }

  Object.keys(body).forEach((field) => {
    if (!allowed.includes(field)) addError(errors, field, `${field} is not allowed`);
  });

  allowed.forEach((field) => validateBoolean(errors, body, values, field));

  if (Object.keys(values).length === 0 && Object.keys(errors).length === 0) {
    addError(errors, "status", "At least one status field is required");
  }

  return { errors, values };
}
