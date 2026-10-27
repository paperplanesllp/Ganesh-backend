import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import { products } from "../../../frontend/src/data/products.js";

const UPDATED_BOTTLE_RATE_SLUGS = new Set([
  "tender-mango-pickle",
  "cut-mango",
  "lime-pickle",
  "vadukapully-red",
  "vadukapully-white",
  "mixed-vegetable",
  "garlic-pickle",
  "tomato-pickle",
  "pulyinchi",
  "chilly-pickle",
  "chilly-chutney",
  "ginger-pickle",
  "avakkai-mango",
  "nelikka-pickle",
]);

async function importOriginalProducts() {
  try {
    await connectDB();

    let inserted = 0;
    let existing = 0;
    let imagesUpdated = 0;
    let bottleRatesUpdated = 0;

    for (const sourceProduct of products) {
      const { id, inStock, ...product } = sourceProduct;
      const result = await Product.updateOne(
        { slug: product.slug },
        { $setOnInsert: product },
        { upsert: true, runValidators: true },
      );

      if (result.upsertedCount > 0) inserted += 1;
      else {
        existing += 1;

        const existingProduct = await Product.findOne({ slug: product.slug });
        const bottleVariants = UPDATED_BOTTLE_RATE_SLUGS.has(product.slug)
          ? product.variants.filter((variant) => variant.packageType === "bottle")
          : [];

        if (existingProduct && bottleVariants.length > 0) {
          const mergedVariants = existingProduct.variants.map((variant) => variant.toObject());

          for (const sourceVariant of bottleVariants) {
            const currentVariant = mergedVariants.find(
              (variant) => variant.packageType === "bottle" && variant.grams === sourceVariant.grams,
            );

            if (currentVariant) {
              currentVariant.label = sourceVariant.label;
              currentVariant.price = sourceVariant.price;
              currentVariant.sku = sourceVariant.sku;
              currentVariant.isActive = true;
            } else {
              mergedVariants.push(sourceVariant);
            }
          }

          await Product.updateOne(
            { _id: existingProduct._id },
            { $set: { variants: mergedVariants } },
            { runValidators: true },
          );
          bottleRatesUpdated += bottleVariants.length;
        }

        if (product.image !== "/images/products/mango-pickle.jpg") {
          const imageResult = await Product.updateOne(
            {
              slug: product.slug,
              $and: [
                {
                  $or: [
                    { image: "/images/products/mango-pickle.jpg" },
                    { image: "" },
                    { image: { $exists: false } },
                  ],
                },
                { $or: [{ media: { $exists: false } }, { media: { $size: 0 } }] },
              ],
            },
            { $set: { image: product.image, images: product.images } },
            { runValidators: true },
          );

          imagesUpdated += imageResult.modifiedCount;
        }
      }
    }

    console.log(`Original catalogue ready: ${inserted} inserted, ${existing} already existed, ${bottleRatesUpdated} bottle rates synchronized, ${imagesUpdated} placeholder images updated.`);
  } catch (error) {
    console.error(error.message || "Original product import failed");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close(false).catch(() => {});
  }
}

importOriginalProducts();
