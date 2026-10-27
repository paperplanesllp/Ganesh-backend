const LEGACY_PRODUCT_IMAGE_PREFIX = "/images/products/";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getCloudinaryHost() {
  const cloudName = trimString(process.env.CLOUDINARY_CLOUD_NAME);
  return cloudName ? `res.cloudinary.com/${cloudName}/` : "";
}

export function isTrustedLocalProductImage(url) {
  return trimString(url).startsWith(LEGACY_PRODUCT_IMAGE_PREFIX);
}

export function isAcceptedCloudinaryUrl(url) {
  const value = trimString(url);
  const host = getCloudinaryHost();
  if (!value || !host) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === "res.cloudinary.com" && parsed.pathname.startsWith(`/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`);
  } catch {
    return false;
  }
}

export function isAcceptedProductImageUrl(url) {
  const value = trimString(url);
  if (!value) return false;
  return isTrustedLocalProductImage(value) || isAcceptedCloudinaryUrl(value);
}

function normalizeSortOrder(media) {
  return media
    .map((item, index) => ({
      ...item,
      sortOrder: Number.isFinite(Number(item.sortOrder)) && Number(item.sortOrder) >= 0 ? Number(item.sortOrder) : index,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index }));
}

export function normalizeMediaItems(input = []) {
  if (!Array.isArray(input)) return [];

  const cleaned = normalizeSortOrder(
    input
      .map((item) => ({
        url: trimString(item?.url),
        publicId: trimString(item?.publicId),
        alt: trimString(item?.alt).slice(0, 160),
        isPrimary: item?.isPrimary === true,
        sortOrder: Number(item?.sortOrder),
      }))
      .filter((item) => item.url),
  );

  if (cleaned.length === 0) return cleaned;

  const primaryIndex = cleaned.findIndex((item) => item.isPrimary);
  return cleaned.map((item, index) => ({
    ...item,
    isPrimary: primaryIndex === -1 ? index === 0 : index === primaryIndex,
  }));
}

export function getProductMediaView(product = {}) {
  const normalizedMedia = normalizeMediaItems(product.media || []);

  if (normalizedMedia.length > 0) {
    const primary = normalizedMedia.find((item) => item.isPrimary) || normalizedMedia[0];
    return {
      primaryImageUrl: primary.url,
      galleryImageUrls: normalizedMedia.map((item) => item.url),
      normalizedMedia,
    };
  }

  const legacyImages = [product.image, ...(product.images || [])].map(trimString).filter(Boolean);
  const uniqueLegacyImages = legacyImages.filter((url, index, values) => values.indexOf(url) === index);

  return {
    primaryImageUrl: uniqueLegacyImages[0] || "",
    galleryImageUrls: uniqueLegacyImages,
    normalizedMedia: [],
  };
}

export function applyMediaCompatibility(productObject = {}) {
  const mediaView = getProductMediaView(productObject);
  if (mediaView.normalizedMedia.length > 0) {
    return {
      ...productObject,
      media: mediaView.normalizedMedia,
      image: mediaView.primaryImageUrl,
      images: mediaView.galleryImageUrls,
    };
  }

  return {
    ...productObject,
    media: [],
    image: mediaView.primaryImageUrl || productObject.image,
    images: mediaView.galleryImageUrls.length ? mediaView.galleryImageUrls : productObject.images || [],
  };
}

export function getCloudinaryPublicIds(media = []) {
  return normalizeMediaItems(media)
    .map((item) => item.publicId)
    .filter(Boolean);
}
