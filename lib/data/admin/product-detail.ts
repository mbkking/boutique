import "server-only";

import { safeQuery, toSingle } from "@/lib/data/safe";
import { getAvailableStock } from "@/lib/services/inventory";
import type { Category } from "@/types";

export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  isActive: boolean;
  isFeatured: boolean;
  lowStockThreshold: number;
  weightKg: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryId: string | null;
  categoryName: string | null;
  /** Visuels, dans leur ordre d'affichage. La première image est la principale. */
  images: Array<{
    id: string;
    url: string;
    altText: string | null;
    sortOrder: number;
  }>;
  variants: Array<{
    id: string;
    sku: string;
    attributes: Record<string, string> | null;
    price: number;
    compareAtPrice: number | null;
    stockOnHand: number;
    stockReserved: number;
    available: number;
    lowStockThreshold: number;
    isActive: boolean;
  }>;
}

/** Produit complet avec ses variantes, pour l'écran d'édition. */
export async function getAdminProductDetail(
  productId: string
): Promise<AdminProductDetail | null> {
  if (!productId) return null;

  const outcome = await safeQuery("adminProduct.detail", (supabase) =>
    supabase
      .from("products")
      .select(
        `
        id, name, slug, sku, description, price, compare_at_price,
        is_active, is_featured, low_stock_threshold, weight_kg,
        seo_title, seo_description, category_id,
        categories (id, name),
        product_images (
          id, url, alt_text, sort_order, is_primary
        ),
        product_variants (
          id, sku, attributes, price, compare_at_price,
          stock_on_hand, stock_reserved, low_stock_threshold, is_active
        )
      `
      )
      .eq("id", productId)
      .limit(1)
  );

  const row = toSingle(outcome) as Record<string, unknown> | null;
  if (!row) return null;

  const category = Array.isArray(row.categories) ? row.categories[0] : row.categories;
  const categoryRow = category as Category | undefined;

  const variantsRaw = Array.isArray(row.product_variants) ? row.product_variants : [];

  // `sort_order` pilote l'ordre d'affichage : on ne se fie pas à l'ordre
  // renvoyé par la base, qui n'est pas garanti sans clause de tri explicite.
  const imagesRaw = (Array.isArray(row.product_images) ? row.product_images : [])
    .slice()
    .sort((a, b) => Number((a as Record<string, unknown>).sort_order ?? 0) - Number((b as Record<string, unknown>).sort_order ?? 0));

  return {
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : "",
    slug: typeof row.slug === "string" ? row.slug : "",
    sku: typeof row.sku === "string" ? row.sku : "",
    description: typeof row.description === "string" ? row.description : "",
    price: Number(row.price ?? 0),
    compareAtPrice:
      typeof row.compare_at_price === "number" ? row.compare_at_price : null,
    isActive: Boolean(row.is_active),
    isFeatured: Boolean(row.is_featured),
    lowStockThreshold: Number(row.low_stock_threshold ?? 5),
    weightKg: typeof row.weight_kg === "number" ? row.weight_kg : null,
    seoTitle: typeof row.seo_title === "string" ? row.seo_title : null,
    seoDescription: typeof row.seo_description === "string" ? row.seo_description : null,
    categoryId: typeof row.category_id === "string" ? row.category_id : null,
    categoryName: categoryRow?.name ?? null,
    images: imagesRaw.map((entry) => {
      const image = entry as Record<string, unknown>;

      return {
        id: String(image.id),
        url: typeof image.url === "string" ? image.url : "",
        altText: typeof image.alt_text === "string" ? image.alt_text : null,
        sortOrder: Number(image.sort_order ?? 0),
      };
    }),
    variants: variantsRaw.map((entry) => {
      const variant = entry as Record<string, unknown>;

      return {
        id: String(variant.id),
        sku: typeof variant.sku === "string" ? variant.sku : "",
        attributes:
          variant.attributes && typeof variant.attributes === "object"
            ? (variant.attributes as Record<string, string>)
            : null,
        price: Number(variant.price ?? 0),
        compareAtPrice:
          typeof variant.compare_at_price === "number" ? variant.compare_at_price : null,
        stockOnHand: Number(variant.stock_on_hand ?? 0),
        stockReserved: Number(variant.stock_reserved ?? 0),
        available: getAvailableStock({
          stock_on_hand: Number(variant.stock_on_hand ?? 0),
          stock_reserved: Number(variant.stock_reserved ?? 0),
        }),
        lowStockThreshold: Number(variant.low_stock_threshold ?? 5),
        isActive: Boolean(variant.is_active),
      };
    }),
  };
}