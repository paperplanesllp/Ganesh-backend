import mongoose from "mongoose";

const paymentStatuses = ["pending", "paid", "failed", "refunded"];
const orderStatuses = ["pending", "confirmed", "cancelled", "fulfilled"];

const orderedProductSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    variantLabel: {
      type: String,
      required: true,
      trim: true,
    },
    grams: {
      type: Number,
      default: null,
    },
    freeShipping: {
      type: Boolean,
      default: false,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be an integer",
      },
    },
    itemPrice: {
      type: Number,
      required: true,
      min: 1,
    },
    itemTotal: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  {
    _id: false,
  },
);

const shippingAddressSchema = new mongoose.Schema(
  {
    addressLine1: {
      type: String,
      required: true,
      trim: true,
    },
    addressLine2: {
      type: String,
      default: "",
      trim: true,
    },
    landmark: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    customerSnapshot: {
      name: { type: String, default: "", trim: true },
      email: { type: String, default: "", lowercase: true, trim: true },
      mobile: { type: String, default: "", trim: true },
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    products: {
      type: [orderedProductSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "Order must contain at least one product",
      },
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    currency: {
      type: String,
      default: "INR",
      enum: ["INR"],
    },
    subtotal: {
      type: Number,
      required: true,
      min: 1,
    },
    deliveryCharge: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 1,
    },
    amountInPaise: {
      type: Number,
      required: true,
      min: 100,
      validate: {
        validator: Number.isInteger,
        message: "Payment amount must be an integer",
      },
    },
    paymentMethod: {
      type: String,
      enum: ["phonepe"],
      default: "phonepe",
      index: true,
    },
    phonepe: {
      merchantOrderId: { type: String, trim: true },
      phonepeOrderId: { type: String, trim: true, default: "" },
      transactionId: { type: String, trim: true, default: "" },
      paymentMode: { type: String, trim: true, default: "" },
      state: { type: String, trim: true, default: "" },
      amount: { type: Number, min: 0 },
      errorCode: { type: String, trim: true, default: "" },
      detailedErrorCode: { type: String, trim: true, default: "" },
    },
    paymentStatus: {
      type: String,
      enum: paymentStatuses,
      default: "pending",
      index: true,
    },
    orderStatus: {
      type: String,
      enum: orderStatuses,
      default: "pending",
      index: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    failureReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 180,
    },
    webhookEvents: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.index({ "phonepe.merchantOrderId": 1 }, { unique: true, sparse: true });
orderSchema.index({ user: 1, createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);

export { orderStatuses, paymentStatuses };
export default Order;
