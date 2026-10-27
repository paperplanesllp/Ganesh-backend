import { products } from "../../../frontend/src/data/products.js";

export const productSeedData = products.map(({ id, slug, inStock, ...product }) => product);
