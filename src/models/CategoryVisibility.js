import mongoose from "mongoose";

// Categories without a record are intentionally public. This lets existing
// categories keep working while visibility is managed only where needed.
const categoryVisibilitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      enum: ["Powders", "Vathals"],
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export const managedCategoryNames = ["Powders", "Vathals"];

const CategoryVisibility = mongoose.model("CategoryVisibility", categoryVisibilitySchema);

export default CategoryVisibility;
