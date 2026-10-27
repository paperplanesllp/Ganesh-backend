import mongoose from "mongoose";
import { applyMediaCompatibility, isAcceptedProductImageUrl, normalizeMediaItems } from "../utils/mediaHelpers.js";

const spiceLevels = ["Mild", "Medium", "Hot", "Extra Hot"];

const variantSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: [true, "Variant label is required"],
      trim: true,
    },
    packageType: {
      type: String,
      enum: ["pouch", "bottle"],
      default: "pouch",
    },
    image: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: (value) => !value || isAcceptedProductImageUrl(value),
        message: "Variant image must be a trusted Cloudinary URL or local product image path",
      },
    },
    grams: {
      type: Number,
      required: [true, "Variant grams are required"],
      min: [1, "Variant grams must be greater than zero"],
    },
    price: {
      type: Number,
      required: [true, "Variant price is required"],
      min: [1, "Variant price must be greater than zero"],
    },
    originalPrice: {
      type: Number,
      default: null,
      min: [1, "Variant original price must be greater than zero"],
    },
    stock: {
      type: Number,
      required: [true, "Variant stock is required"],
      min: [0, "Variant stock cannot be negative"],
      validate: {
        validator: Number.isInteger,
        message: "Variant stock must be an integer",
      },
    },
    sku: {
      type: String,
      uppercase: true,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    _id: true,
  },
);

const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, "Image URL is required"],
      trim: true,
      validate: {
        validator: isAcceptedProductImageUrl,
        message: "Image URL must be a trusted Cloudinary URL or local product image path",
      },
    },
    publicId: {
      type: String,
      trim: true,
      default: "",
    },
    alt: {
      type: String,
      trim: true,
      maxlength: [160, "Image alt text must be 160 characters or less"],
      default: "",
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      min: [0, "Image sort order cannot be negative"],
      default: 0,
    },
  },
  {
    _id: false,
  },
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      minlength: [2, "Product name must be at least 2 characters"],
      maxlength: [120, "Product name must be 120 characters or less"],
    },
    slug: {
      type: String,
      required: [true, "Product slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    shortDescription: {
      type: String,
      required: [true, "Short description is required"],
      trim: true,
      maxlength: [220, "Short description must be 220 characters or less"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [3000, "Description must be 3000 characters or less"],
    },
    image: {
      type: String,
      required: [true, "Main image is required"],
      trim: true,
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (values) => values.length <= 5,
        message: "A product can have at most 5 images",
      },
    },
    media: {
      type: [mediaSchema],
      default: [],
      validate: {
        validator: (values) => Array.isArray(values) && values.length <= 5,
        message: "A product can contain up to 5 images",
      },
    },
    flavour: {
      type: String,
      required: [true, "Flavour is required"],
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      index: true,
    },
    spiceLevel: {
      type: String,
      required: [true, "Spice level is required"],
      enum: spiceLevels,
    },
    foodType: {
      type: String,
      enum: ["Vegetarian"],
      default: "Vegetarian",
    },
    highlights: {
      type: [String],
      default: [],
    },
    usageSuggestions: {
      type: [String],
      default: [],
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    bestseller: {
      type: Boolean,
      default: false,
      index: true,
    },
    newArrival: {
      type: Boolean,
      default: false,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    freeShipping: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be lower than 0"],
      max: [5, "Rating cannot be higher than 5"],
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: [0, "Review count cannot be negative"],
    },
    variants: {
      type: [variantSchema],
      required: [true, "At least one variant is required"],
      validate: {
        validator: (values) => Array.isArray(values) && values.length > 0,
        message: "At least one variant is required",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

productSchema.index({ name: "text", shortDescription: "text", flavour: "text", category: "text" });
productSchema.index({ "variants.sku": 1 });

productSchema.path("variants").validate(function validateVariantOriginalPrices(variants) {
  return variants.every((variant) => !variant.originalPrice || variant.originalPrice >= variant.price);
}, "Variant original price cannot be lower than price");

productSchema.path("media").validate(function validatePrimaryMedia(media) {
  if (!media || media.length === 0) return true;
  return media.filter((item) => item.isPrimary).length === 1;
}, "Exactly one product image must be primary");

// Mongoose 9 runs document middleware without the legacy callback argument.
// Keeping this synchronous hook also lets validation errors propagate normally.
productSchema.pre("validate", function normalizeMediaBeforeValidate() {
  if (this.media?.length) {
    this.media = normalizeMediaItems(this.media);
    const primary = this.media.find((item) => item.isPrimary) || this.media[0];
    this.image = primary.url;
    this.images = this.media.map((item) => item.url);
  }
});

productSchema.virtual("startingPrice").get(function getStartingPrice() {
  const activeVariants = this.variants?.filter((variant) => variant.isActive) || [];
  const stockedVariants = activeVariants.filter((variant) => variant.stock > 0);
  const candidates = stockedVariants.length > 0 ? stockedVariants : activeVariants;

  if (candidates.length === 0) return 0;

  return Math.min(...candidates.map((variant) => variant.price));
});

productSchema.virtual("totalStock").get(function getTotalStock() {
  return (this.variants || [])
    .filter((variant) => variant.isActive)
    .reduce((total, variant) => total + Math.max(0, variant.stock), 0);
});

productSchema.virtual("inStock").get(function getInStock() {
  return this.totalStock > 0;
});

productSchema.methods.toPublicObject = function toPublicObject() {
  const product = applyMediaCompatibility(this.toObject({ virtuals: true }));
  delete product.__v;
  delete product.id;
  delete product.isActive;

  product.variants = (product.variants || [])
    .filter((variant) => variant.isActive)
    .map((variant) => {
      const { sku, isActive, ...safeVariant } = variant;
      delete safeVariant.id;
      return safeVariant;
    });

  return product;
};

productSchema.methods.toAdminObject = function toAdminObject() {
  const product = applyMediaCompatibility(this.toObject({ virtuals: true }));
  delete product.__v;
  delete product.id;

  product.variants = (product.variants || []).map((variant) => {
    const cleanVariant = { ...variant };
    delete cleanVariant.id;
    return cleanVariant;
  });

  return product;
};

export { spiceLevels };

const Product = mongoose.model("Product", productSchema);

export default Product;
