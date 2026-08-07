import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import { products } from "../../../frontend/src/data/products.js";

async function importOriginalProducts() {
  try {
    await connectDB();

    let inserted = 0;
    let existing = 0;
    let imagesUpdated = 0;

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

    console.log(`Original catalogue ready: ${inserted} inserted, ${existing} already existed, ${imagesUpdated} placeholder images updated.`);
  } catch (error) {
    console.error(error.message || "Original product import failed");
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close(false).catch(() => {});
  }
}

importOriginalProducts();
