import "server-only";

import {
  safeQuery,
  toList,
  toSingle,
} from "@/lib/data/safe";
import { buildSearchTermGroups, sanitizeSlug } from "@/lib/data/sanitize";
import { getProductStock } from "@/lib/services/inventory";
import type { Category, Product, ProductImage, ProductVariant } from "@/types";

/** Produit accompagné des relations nécessaires à l'affichage public. */
export interface ProductWithRelations extends Product {
  category: Category | null;
  images: ProductImage[];
  variants: ProductVariant[];
}

export type ProductSort = "recent" | "price_asc" | "price_desc" | "name_asc";

export interface ListProductsParams {
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: ProductSort;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

const PRODUCT_SELECT = `
  id,
  category_id,
  name,
  slug,
  description,
  sku,
  price,
  compare_at_price,
  stock_on_hand,
  stock_reserved,
  low_stock_threshold,
  is_active,
  is_featured,
  weight_kg,
  seo_title,
  seo_description,
  created_at,
  updated_at,
  category:categories(id, parent_id, name, slug, description, image_url, sort_order, is_active, created_at, updated_at),
  images:product_images(id, product_id, url, alt_text, sort_order, is_primary, created_at),
  variants:product_variants(id, product_id, sku, attributes, price, compare_at_price, stock_on_hand, stock_reserved, low_stock_threshold, is_active, created_at, updated_at)
`;

type RawProductRow = Product & {
  category?: Category | Category[] | null;
  images?: ProductImage[] | null;
  variants?: ProductVariant[] | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
  return value ?? null;
}

function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
}

function sortVariants(variants: ProductVariant[]): ProductVariant[] {
  return [...variants].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    return a.price - b.price;
  });
}

function toProduct(row: RawProductRow): ProductWithRelations {
  const variants = sortVariants(Array.isArray(row.variants) ? row.variants : []);

  // `product_variants` est la source de vérité du stock vendable : le panier,
  // la commande et les ajustements n'écrivent que là. `products.stock_on_hand`
  // n'en est qu'un agrégat SQL ; on le recalcule ici pour que la carte, la
  // fiche et la recherche affichent la même valeur que ce que le serveur
  // acceptera réellement à la vente.
  const stock = getProductStock(variants);

  return {
    ...row,
    stock_on_hand: stock.stock_on_hand,
    stock_reserved: stock.stock_reserved,
    category: firstOrNull(row.category),
    images: sortImages(Array.isArray(row.images) ? row.images : []),
    variants,
  };
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function clampOffset(offset: number | undefined): number {
  if (!offset || !Number.isFinite(offset) || offset <= 0) return 0;
  return Math.floor(offset);
}

function isValidPrice(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function orderColumnFor(sort: ProductSort | undefined): string {
  switch (sort) {
    case "price_asc":
    case "price_desc":
      return "price";
    case "name_asc":
      return "name";
    case "recent":
    default:
      return "created_at";
  }
}

function isAscending(sort: ProductSort | undefined): boolean {
  return sort === "price_asc" || sort === "name_asc";
}

/**
 * Catalogue public paginé et filtré.
 *
 * La saisie utilisateur n'est jamais concaténée dans une chaîne de requête :
 * elle est nettoyée puis passée comme valeur liée par le client Supabase.
 * Ne lève jamais : retourne `[]` si la base est injoignante ou vide.
 */
export async function listProducts({
  categorySlug,
  search,
  minPrice,
  maxPrice,
  inStockOnly,
  sort,
  limit,
  offset,
}: ListProductsParams = {}): Promise<ProductWithRelations[]> {
  const safeSlug = categorySlug ? sanitizeSlug(categorySlug) : "";

  if (categorySlug && safeSlug === "") return [];

  let categoryId: string | null = null;

  if (safeSlug) {
    const category = await safeQuery(
      "categories.resolve",
      (supabase) =>
        supabase
          .from("categories")
          .select("id")
          .eq("slug", safeSlug)
          .eq("is_active", true)
          .limit(1)
    );
    const row = toSingle(category);
    if (!row) return [];
    categoryId = row.id;
  }

  const searchGroups = buildSearchTermGroups(search);

  const outcome = await safeQuery("products.list", (supabase) => {
    let builder = supabase.from("products").select(PRODUCT_SELECT).eq("is_active", true);

    if (categoryId) builder = builder.eq("category_id", categoryId);
    if (isValidPrice(minPrice)) builder = builder.gte("price", Math.floor(minPrice));
    if (isValidPrice(maxPrice)) builder = builder.lte("price", Math.floor(maxPrice));
    // Le stock vendable appartient aux variantes. Le filtre porte sur
    // `variants.stock_on_hand` et non sur l'agrégat du produit, sinon un
    // produit dont toutes les variantes sont épuisées resterait listé.
    if (inStockOnly) {
      builder = builder.gt("variants.stock_on_hand", 0).eq("variants.is_active", true);
    }

    // Un `.or()` par mot : PostgREST combine les `.or()` successifs par un ET,
    // ce qui impose que tous les mots saisis soient présents. Les variantes
    // d'un même mot sont en revanche dans un seul `.or()`, donc en OU entre
    // elles : « main » matche « main », « Main » comme « MAIN ».
    for (const variants of searchGroups) {
      const condition = variants
        .flatMap((variant) => [
          `name.ilike.%${variant}%`,
          `description.ilike.%${variant}%`,
        ])
        .join(",");
      builder = builder.or(condition);
    }

    const from = clampOffset(offset);
    return builder
      .order(orderColumnFor(sort), { ascending: isAscending(sort) })
      .range(from, from + clampLimit(limit) - 1);
  });

  return toList(outcome).map(toProduct);
}

/** Détaille un produit actif par son slug, avec catégorie, images et variantes. */
export async function getProductBySlug(
  slug: string
): Promise<ProductWithRelations | null> {
  const safeSlug = sanitizeSlug(slug);
  if (safeSlug === "") return null;

  const outcome = await safeQuery("products.bySlug", (supabase) =>
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("slug", safeSlug)
      .eq("is_active", true)
      .limit(1)
  );

  const row = toSingle(outcome);
  return row ? toProduct(row) : null;
}

/** Produits mis en avant par la boutique (page d'accueil). */
export async function listFeaturedProducts(
  limit = 8
): Promise<ProductWithRelations[]> {
  const outcome = await safeQuery("products.featured", (supabase) =>
    supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .range(0, clampLimit(limit) - 1)
  );

  return toList(outcome).map(toProduct);
}

/**
 * Produits « populaires ».
 *
 * Faute de table de ventes, la popularité est approchée par la fraîcheur des
 * publications parmi les produits en stock. Le tri pourra être remplacé par un
 * agrégat sur `order_items` sans changer la signature de cette fonction.
 *
 * @param excludeIds Produits déjà affichés ailleurs sur la page (les produits
 *   en avant). L'exclusion se fait dans la requête SQL : un produit ne peut
 *   donc pas apparaître dans deux sections de l'accueil.
 */
export async function listPopularProducts(
  limit = 8,
  excludeIds: readonly string[] = []
): Promise<ProductWithRelations[]> {
  const ids = excludeIds.filter((id) => typeof id === "string" && id.length > 0);

  const outcome = await safeQuery("products.popular", (supabase) => {
    let builder = supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      // Idem `inStockOnly` : la disponibilité se lit sur les variantes.
      .gt("variants.stock_on_hand", 0)
      .eq("variants.is_active", true);

    if (ids.length > 0) {
      builder = builder.not(
        "id",
        "in",
        `(${ids.map((id) => `"${id}"`).join(",")})`
      );
    }

    return builder
      .order("created_at", { ascending: false })
      .range(0, clampLimit(limit) - 1);
  });

  return toList(outcome).map(toProduct);
}

/**
 * Produits de la même catégorie, pour la section « Produits associés ».
 *
 * @param categoryId Catégorie de référence. Une catégorie nulle ou vide
 *   renvoie une liste vide : on n'affiche jamais de produits aléatoires.
 * @param excludeId Produit à exclure (le produit affiché lui-même).
 */
export async function listRelatedProducts(
  categoryId: string | null | undefined,
  limit = 4,
  excludeId?: string
): Promise<ProductWithRelations[]> {
  if (typeof categoryId !== "string" || categoryId.length === 0) return [];

  const outcome = await safeQuery("products.related", (supabase) => {
    let query = supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("is_active", true)
      .eq("category_id", categoryId)
      .order("created_at", { ascending: false });

    // Le produit consulté ne doit jamais apparaître parmi ses propres
    // suggestions.
    if (excludeId) query = query.neq("id", excludeId);

    // On demande une ligne de plus pour compenser l'exclusion éventuelle.
    return query.range(0, clampLimit(limit));
  });

  return toList(outcome).slice(0, clampLimit(limit)).map(toProduct);
}

/** Slugs produits publics, utilisés par le sitemap. `[]` si la base est injoignable. */
export async function listProductSlugs(limit = 5000): Promise<string[]> {
  const outcome = await safeQuery("products.slugs", (supabase) =>
    supabase.from("products").select("slug").eq("is_active", true).limit(limit)
  );

  return toList(outcome)
    .map((row) => row.slug)
    .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
}