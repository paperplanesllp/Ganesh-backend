import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Product from "../models/Product.js";
import { createUniqueSlug } from "../utils/createSlug.js";
import { productSeedData } from "./productSeedData.js";

async function seedProducts() {
  try {
    await connectDB();

    await Product.deleteMany({});

    const productsWithSlugs = [];
    for (const product of productSeedData) {
      productsWithSlugs.push({
        ...product,
        slug: await createUniqueSlug(Product, product.name),
      });
    }

    await Product.insertMany(productsWithSlugs);
    console.log(`Seeded ${productsWithSlugs.length} products successfully`);
    await mongoose.connection.close(false);
    process.exit(0);
  } catch (error) {
    console.error(error.message || "Product seeding failed");
    await mongoose.connection.close(false).catch(() => {});
    process.exit(1);
  }
}

seedProducts();
