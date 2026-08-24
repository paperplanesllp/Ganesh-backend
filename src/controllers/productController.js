import mongoose from "mongoose";
import crypto from "node:crypto";
import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import cloudinary, { getCloudinaryConfig } from "../config/cloudinary.js";
import Product, { spiceLevels } from "../models/Product.js";
import { getHiddenCategoryNames, getManagedCategoryVisibility, isCategoryVisible } from "../utils/categoryVisibility.js";
import { createUniqueSlug } from "../utils/createSlug.js";
import { applyMediaCompatibility, getCloudinaryPublicIds } from "../utils/mediaHelpers.js";

const allowedSorts = new Set(["featured", "popularity", "price-asc", "price-desc", "rating", "name-asc", "name-desc", "newest", "updated", "stock-asc"]);
const MAX_PRODUCT_IMAGES = 5;

function uploadBufferToCloudinary(file) {
  const config = getCloudinaryConfig();
  const publicId = `product-${Date.now()}-${crypto.randomUUID()}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: config.folder,
        public_id: publicId,
        resource_type: "image",
        unique_filename: false,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result?.secure_url || !result?.public_id) {
          reject(new ApiError(502, "Cloudinary image upload failed. Please try again."));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(file.buffer);
  });
}

async function destroyCloudinaryImages(publicIds, message) {
  if (publicIds.length === 0) return;
  try {
    getCloudinaryConfig();
    await Promise.all(publicIds.map((publicId) => cloudinary.uploader.destroy(publicId, { resource_type: "image" })));
  } catch {
    throw new ApiError(502, message);
  }
}

async function uploadProductFiles(files = [], existingMedia = [], productName = "", metadata = []) {
  if (existingMedia.length + files.length > MAX_PRODUCT_IMAGES) {
    throw new ApiError(422, `A product can contain up to ${MAX_PRODUCT_IMAGES} images.`);
  }

  const uploaded = [];
  try {
    for (const file of files) {
      const image = await uploadBufferToCloudinary(file);
      const details = metadata[uploaded.length] || {};
      uploaded.push({
        ...image,
        alt: typeof details.alt === "string" ? details.alt.trim().slice(0, 160) : productName,
        isPrimary: details.isPrimary === true || (existingMedia.length === 0 && uploaded.length === 0),
        sortOrder: existingMedia.length + uploaded.length,
      });
    }
    return uploaded;
  } catch (error) {
    await Promise.allSettled(uploaded.map((item) => cloudinary.uploader.destroy(item.publicId, { resource_type: "image" })));
    throw error;
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBoolean(value) {
  if (value === undefined) return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return null;
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function sanitizePublicProduct(product) {
  const copy = applyMediaCompatibility({ ...product });
  delete copy.__v;
  delete copy.id;
  delete copy.isActive;
  copy.variants = (copy.variants || [])
    .filter((variant) => variant.isActive !== false)
    .map((variant) => {
      const cleanVariant = { ...variant };
      delete cleanVariant.sku;
      delete cleanVariant.isActive;
      delete cleanVariant.id;
      return cleanVariant;
    });
  return copy;
}

async function cleanupRemovedCloudinaryImages(previousMedia = [], nextMedia = []) {
  const previousPublicIds = new Set(getCloudinaryPublicIds(previousMedia));
  const nextPublicIds = new Set(getCloudinaryPublicIds(nextMedia));
  const removedPublicIds = [...previousPublicIds].filter((publicId) => !nextPublicIds.has(publicId));

  const results = await Promise.allSettled(
    removedPublicIds.map(async (publicId) => {
      const stillReferenced = await Product.exists({ "media.publicId": publicId });
      if (stillReferenced) return;

      getCloudinaryConfig();
      await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    }),
  );

  if (results.some((result) => result.status === "rejected")) {
    throw new ApiError(502, "Product was updated, but one or more removed images could not be deleted from Cloudinary.");
  }
}

function sortStage(sort) {
  if (sort === "popularity") return { bestseller: -1, reviewCount: -1, rating: -1, createdAt: -1 };
  if (sort === "price-asc") return { startingPrice: 1, name: 1 };
  if (sort === "price-desc") return { startingPrice: -1, name: 1 };
  if (sort === "rating") return { rating: -1, reviewCount: -1, name: 1 };
  if (sort === "name-asc") return { name: 1 };
  if (sort === "name-desc") return { name: -1 };
  if (sort === "updated") return { updatedAt: -1 };
  if (sort === "stock-asc") return { totalStock: 1, name: 1 };
  if (sort === "newest") return { createdAt: -1 };
  return { featured: -1, bestseller: -1, createdAt: -1 };
}

function computedStages({ publicProduct = true } = {}) {
  return [
    {
      $addFields: {
        activeVariants: {
          $filter: {
            input: "$variants",
            as: "variant",
            cond: { $eq: ["$$variant.isActive", true] },
          },
        },
      },
    },
    {
      $addFields: {
        stockedActiveVariants: {
          $filter: {
            input: "$activeVariants",
            as: "variant",
            cond: { $gt: ["$$variant.stock", 0] },
          },
        },
        totalStock: { $sum: "$activeVariants.stock" },
      },
    },
    {
      $addFields: {
        startingPrice: {
          $ifNull: [
            { $min: "$stockedActiveVariants.price" },
            { $ifNull: [{ $min: "$activeVariants.price" }, 0] },
          ],
        },
        inStock: { $gt: ["$totalStock", 0] },
      },
    },
    {
      $project: {
        activeVariants: 0,
        stockedActiveVariants: 0,
        __v: 0,
        ...(publicProduct ? { isActive: 0, "variants.sku": 0, "variants.isActive": 0 } : {}),
      },
    },
  ];
}

async function buildPublicMatch(query) {
  const match = { isActive: true };
  const andConditions = [];

  const hiddenCategories = await getHiddenCategoryNames();
  if (hiddenCategories.length > 0) {
    andConditions.push({
      $nor: hiddenCategories.map((category) => ({ category: new RegExp(`^${escapeRegex(category)}$`, "i") })),
    });
  }

  if (query.search) {
    const safe = escapeRegex(query.search.trim());
    if (safe) {
      const regex = new RegExp(safe, "i");
      match.$or = [
        { name: regex },
        { shortDescription: regex },
        { flavour: regex },
        { category: regex },
      ];
    }
  }

  if (query.category) match.category = new RegExp(`^${escapeRegex(query.category)}$`, "i");
  if (query.flavour) match.flavour = new RegExp(`^${escapeRegex(query.flavour)}$`, "i");
  if (query.spiceLevel) {
    if (!spiceLevels.includes(query.spiceLevel)) throw new ApiError(422, "Invalid product filters", { spiceLevel: "Unknown spice level" });
    match.spiceLevel = query.spiceLevel;
  }

  ["featured", "bestseller", "newArrival"].forEach((field) => {
    const parsed = parseBoolean(query[field]);
    if (parsed === null) throw new ApiError(422, "Invalid product filters", { [field]: `${field} must be true or false` });
    if (parsed !== undefined) match[field] = parsed;
  });

  const inStock = parseBoolean(query.inStock);
  if (inStock === null) throw new ApiError(422, "Invalid product filters", { inStock: "inStock must be true or false" });
  if (inStock === true) andConditions.push({ variants: { $elemMatch: { isActive: true, stock: { $gt: 0 } } } });

  const priceFilter = { isActive: true };
  if (query.minPrice !== undefined) {
    const minPrice = Number(query.minPrice);
    if (!Number.isFinite(minPrice) || minPrice < 0) throw new ApiError(422, "Invalid product filters", { minPrice: "Minimum price must be zero or greater" });
    priceFilter.price = { ...(priceFilter.price || {}), $gte: minPrice };
  }

  if (query.maxPrice !== undefined) {
    const maxPrice = Number(query.maxPrice);
    if (!Number.isFinite(maxPrice) || maxPrice < 0) throw new ApiError(422, "Invalid product filters", { maxPrice: "Maximum price must be zero or greater" });
    priceFilter.price = { ...(priceFilter.price || {}), $lte: maxPrice };
  }

  if (priceFilter.price?.$gte !== undefined && priceFilter.price?.$lte !== undefined && priceFilter.price.$gte > priceFilter.price.$lte) {
    throw new ApiError(422, "Invalid product filters", { minPrice: "Minimum price cannot exceed maximum price" });
  }

  if (priceFilter.price) andConditions.push({ variants: { $elemMatch: priceFilter } });
  if (andConditions.length > 0) match.$and = andConditions;

  return match;
}

async function getFilterOptions() {
  const [hiddenCategories, categories, flavours] = await Promise.all([
    getHiddenCategoryNames(),
    Product.distinct("category", { isActive: true }),
    Product.distinct("flavour", { isActive: true }),
  ]);
  const hidden = new Set(hiddenCategories.map((category) => category.toLowerCase()));

  return {
    categories: categories.filter((category) => !hidden.has(category.toLowerCase())).sort((a, b) => a.localeCompare(b)),
    flavours: flavours.sort((a, b) => a.localeCompare(b)),
    spiceLevels,
  };
}

async function assertUniqueSkus(variants, excludeProductId = null) {
  const skus = variants.map((variant) => variant.sku);
  const query = {
    "variants.sku": { $in: skus },
    ...(excludeProductId ? { _id: { $ne: excludeProductId } } : {}),
  };
  const existing = await Product.findOne(query).select("_id variants.sku");

  if (existing) {
    throw new ApiError(409, "A product variant with this SKU already exists");
  }
}

export const getProducts = asyncHandler(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1, 100000);
  const limit = parsePositiveInt(req.query.limit, 12, 50);
  const sort = allowedSorts.has(req.query.sort) ? req.query.sort : "featured";
  const match = await buildPublicMatch(req.query);
  const skip = (page - 1) * limit;

  const pipeline = [
    { $match: match },
    ...computedStages(),
    { $sort: sortStage(sort) },
    {
      $facet: {
        products: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    },
  ];

  const [result] = await Product.aggregate(pipeline);
  const totalProducts = result?.total?.[0]?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalProducts / limit));

  res.status(200).json({
    success: true,
    products: (result?.products || []).map(sanitizePublicProduct),
    pagination: {
      page,
      limit,
      totalProducts,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    filters: await getFilterOptions(),
  });
});

export const getPublicCategoryVisibility = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    categories: await getManagedCategoryVisibility(),
  });
});

async function getProductCollection(req, res, filter, defaultLimit = 8, maxLimit = 12) {
  const limit = parsePositiveInt(req.query.limit, defaultLimit, maxLimit);
  const hiddenCategories = await getHiddenCategoryNames();
  const products = await Product.find({
    isActive: true,
    ...filter,
    ...(hiddenCategories.length > 0 ? { category: { $not: { $in: hiddenCategories.map((category) => new RegExp(`^${escapeRegex(category)}$`, "i")) } } } : {}),
  })
    .sort({ featured: -1, bestseller: -1, reviewCount: -1, createdAt: -1 })
    .limit(limit);

  res.status(200).json({
    success: true,
    products: products.map((product) => product.toPublicObject()),
  });
}

export const getFeaturedProducts = asyncHandler((req, res) => getProductCollection(req, res, { featured: true }, 8, 12));
export const getBestsellerProducts = asyncHandler((req, res) => getProductCollection(req, res, { bestseller: true }, 8, 12));
export const getNewArrivalProducts = asyncHandler((req, res) => getProductCollection(req, res, { newArrival: true }, 8, 12));

export const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true });
  if (!product || !(await isCategoryVisible(product.category))) throw new ApiError(404, "Product not found");

  res.status(200).json({
    success: true,
    product: product.toPublicObject(),
  });
});

export const getProductById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid product ID");

  const product = await Product.findOne({ _id: req.params.id, isActive: true });
  if (!product || !(await isCategoryVisible(product.category))) throw new ApiError(404, "Product not found");

  res.status(200).json({
    success: true,
    product: product.toPublicObject(),
  });
});

export const getAdminProducts = asyncHandler(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 1, 100000);
  const limit = parsePositiveInt(req.query.limit, 20, 50);
  const sort = allowedSorts.has(req.query.sort) ? req.query.sort : "newest";
  const match = {};
  const andConditions = [];

  if (req.query.search) {
    const regex = new RegExp(escapeRegex(req.query.search), "i");
    match.$or = [{ name: regex }, { slug: regex }, { category: regex }, { flavour: regex }, { "variants.sku": regex }];
  }

  if (req.query.status) {
    if (req.query.status === "active") match.isActive = true;
    else if (req.query.status === "inactive") match.isActive = false;
    else if (req.query.status === "in-stock") andConditions.push({ variants: { $elemMatch: { isActive: true, stock: { $gt: 0 } } } });
    else if (req.query.status === "out-of-stock") andConditions.push({ $or: [{ variants: { $not: { $elemMatch: { isActive: true, stock: { $gt: 0 } } } } }] });
    else throw new ApiError(422, "Invalid admin product filters", { status: "Unknown status filter" });
  }

  if (req.query.category) match.category = new RegExp(`^${escapeRegex(req.query.category)}$`, "i");

  ["featured", "bestseller", "newArrival"].forEach((field) => {
    const parsed = parseBoolean(req.query[field]);
    if (parsed === null) throw new ApiError(422, "Invalid admin product filters", { [field]: `${field} must be true or false` });
    if (parsed !== undefined) match[field] = parsed;
  });

  const inStock = parseBoolean(req.query.inStock);
  if (inStock === null) throw new ApiError(422, "Invalid admin product filters", { inStock: "inStock must be true or false" });
  if (inStock === true) andConditions.push({ variants: { $elemMatch: { isActive: true, stock: { $gt: 0 } } } });
  if (inStock === false) andConditions.push({ variants: { $not: { $elemMatch: { isActive: true, stock: { $gt: 0 } } } } });

  if (andConditions.length > 0) match.$and = andConditions;

  const [result] = await Product.aggregate([
    { $match: match },
    ...computedStages({ publicProduct: false }),
    { $sort: sortStage(sort) },
    {
      $facet: {
        products: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    },
  ]);
  const products = result?.products || [];
  const totalProducts = result?.total?.[0]?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalProducts / limit));

  res.status(200).json({
    success: true,
    products: products.map(applyMediaCompatibility),
    pagination: {
      page,
      limit,
      totalProducts,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  });
});

export const getAdminProductById = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid product ID");

  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, "Product not found");

  res.status(200).json({
    success: true,
    product: product.toAdminObject(),
  });
});

export const createProduct = asyncHandler(async (req, res) => {
  const data = { ...req.validatedBody };
  delete data.updateSlug;
  await assertUniqueSkus(data.variants);

  data.slug = data.slug || (await createUniqueSlug(Product, data.name));
  if (!data.slug) throw new ApiError(422, "Product validation failed", { slug: "Product slug is invalid" });

  const uploaded = await uploadProductFiles(req.files, data.media || [], data.name, req.uploadMetadata);
  if (uploaded.length) {
    const retained = uploaded.some((item) => item.isPrimary)
      ? (data.media || []).map((item) => ({ ...item, isPrimary: false }))
      : (data.media || []);
    data.media = [...retained, ...uploaded];
  }

  let product;
  try {
    product = await Product.create(data);
  } catch (error) {
    await Promise.allSettled(uploaded.map((item) => cloudinary.uploader.destroy(item.publicId, { resource_type: "image" })));
    throw error;
  }

  res.status(201).json({
    success: true,
    message: "Product created successfully",
    product: product.toAdminObject(),
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid product ID");

  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, "Product not found");

  const data = { ...req.validatedBody };
  const updateSlug = data.updateSlug;
  delete data.updateSlug;

  if (data.variants) await assertUniqueSkus(data.variants, product._id);

  if (updateSlug && data.name) {
    data.slug = await createUniqueSlug(Product, data.name, product._id);
  } else if (!data.slug) {
    delete data.slug;
  }

  const previousMedia = product.media ? product.media.map((item) => item.toObject?.() || item) : [];

  const retainedMedia = data.media === undefined ? previousMedia : data.media;
  const uploaded = await uploadProductFiles(req.files, retainedMedia, data.name || product.name, req.uploadMetadata);
  if (uploaded.length) {
    const retained = uploaded.some((item) => item.isPrimary)
      ? retainedMedia.map((item) => ({ ...(item.toObject?.() || item), isPrimary: false }))
      : retainedMedia;
    data.media = [...retained, ...uploaded];
  }

  try {
    Object.assign(product, data);
    await product.save();
  } catch (error) {
    await Promise.allSettled(uploaded.map((item) => cloudinary.uploader.destroy(item.publicId, { resource_type: "image" })));
    throw error;
  }
  await cleanupRemovedCloudinaryImages(previousMedia, product.media || []);

  res.status(200).json({
    success: true,
    message: "Product updated successfully",
    product: product.toAdminObject(),
  });
});

export const updateProductStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid product ID");

  const product = await Product.findByIdAndUpdate(req.params.id, req.validatedBody, {
    new: true,
    runValidators: true,
  });

  if (!product) throw new ApiError(404, "Product not found");

  res.status(200).json({
    success: true,
    message: "Product status updated successfully",
    product: product.toAdminObject(),
  });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, "Invalid product ID");

  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, "Product not found");

  const publicIds = getCloudinaryPublicIds(product.media || []);
  await destroyCloudinaryImages(publicIds, "Product images could not be deleted from Cloudinary. The product was not deleted.");
  await product.deleteOne();

  res.status(200).json({
    success: true,
    message: "Product and its images deleted successfully",
  });
});
