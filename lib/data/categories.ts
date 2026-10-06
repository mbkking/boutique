import "server-only";

import { safeQuery, sanitizeSlug, toList, toSingle } from "@/lib/data/safe";
import type { Category } from "@/types";

/** Catégorie de premier niveau accompagnée de ses sous-catégories. */
export interface CategoryWithChildren extends Category {
  children: Category[];
}

const CATEGORY_SELECT = `
  id,
  parent_id,
  name,
  slug,
  description,
  image_url,
  sort_order,
  is_active,
  created_at,
  updated_at
`;

// `categories` ne référence qu'elle-même (parent_id), la relation imbriquée
// n'est donc pas ambiguë et ne nécessite pas de nom de contrainte explicite.
const CATEGORY_TREE_SELECT = `
  ${CATEGORY_SELECT},
  children:categories(${CATEGORY_SELECT})
`;

function toCategory(row: Category): Category {
  return row;
}

function toCategoryWithChildren(row: Category & { children?: Category[] | null }): CategoryWithChildren {
  return {
    ...row,
    children: Array.isArray(row.children) ? row.children.map(toCategory) : [],
  };
}

/**
 * Toutes les catégories actives, à plat, triées pour l'affichage.
 * Les sous-catégories sont incluses : l'appelant peut reconstruire l'arbre.
 */
export async function listCategories(): Promise<Category[]> {
  const outcome = await safeQuery("categories.list", (supabase) =>
    supabase
      .from("categories")
      .select(CATEGORY_SELECT)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
  );

  return toList(outcome).map(toCategory);
}

/** Catégories de premier niveau avec leurs sous-catégories (page « Catégories »). */
export async function listCategoryTree(): Promise<CategoryWithChildren[]> {
  const outcome = await safeQuery("categories.tree", (supabase) =>
    supabase
      .from("categories")
      .select(CATEGORY_TREE_SELECT)
      .eq("is_active", true)
      .is("parent_id", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
  );

  return toList(outcome).map(toCategoryWithChildren);
}

/**
 * Une catégorie active par son slug, avec ses sous-catégories directes.
 * Retourne `null` si le slug est inconnu : l'appelant déclenche `notFound()`.
 */
export async function getCategoryBySlug(
  slug: string
): Promise<CategoryWithChildren | null> {
  const safeSlug = sanitizeSlug(slug);
  if (safeSlug === "") return null;

  const outcome = await safeQuery("categories.bySlug", (supabase) =>
    supabase
      .from("categories")
      .select(CATEGORY_TREE_SELECT)
      .eq("slug", safeSlug)
      .eq("is_active", true)
      .limit(1)
  );

  const row = toSingle(outcome);
  return row ? toCategoryWithChildren(row) : null;
}

/** Slugs de catégories actives, utilisés par le sitemap. */
export async function listCategorySlugs(limit = 500): Promise<string[]> {
  const outcome = await safeQuery("categories.slugs", (supabase) =>
    supabase.from("categories").select("slug").eq("is_active", true).limit(limit)
  );

  return toList(outcome)
    .map((row) => row.slug)
    .filter((slug): slug is string => typeof slug === "string" && slug.length > 0);
}
/**
 * Minuscules sans accent : rend la recherche de catégorie tolérante aux
 * variantes typographiques (Meubles / meubles, Parfums / parfums).
 */
export function normalizeCategoryQuery(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .slice(0, 60);
}