import CategoryVisibility, { managedCategoryNames } from "../models/CategoryVisibility.js";

export async function getHiddenCategoryNames() {
  return CategoryVisibility.distinct("name", { isVisible: false });
}

export async function isCategoryVisible(category) {
  const setting = await CategoryVisibility.findOne({ name: category }).select("isVisible").lean();
  return setting?.isVisible !== false;
}

export async function getManagedCategoryVisibility() {
  const settings = await CategoryVisibility.find({ name: { $in: managedCategoryNames } }).lean();
  const visibilityByName = new Map(settings.map((setting) => [setting.name, setting.isVisible]));

  return managedCategoryNames.map((name) => ({ name, isVisible: visibilityByName.get(name) !== false }));
}
