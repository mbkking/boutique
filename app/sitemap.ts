import type { MetadataRoute } from "next";
import { listCategorySlugs } from "@/lib/data/categories";
import { listProductSlugs } from "@/lib/data/products";

const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
);

export const revalidate = 3600;

/**
 * Plan du site.
 *
 * Les pages dynamiques (recherche, panier, checkout, compte, suivi d'une
 * commande) sont exclues : elles n'ont pas de valeur de référencement.
 * Une base injoignante produit un sitemap réduit à la page d'accueil plutôt
 * qu'une erreur.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/categories`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/search`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  const [categorySlugs, productSlugs] = await Promise.all([
    listCategorySlugs(),
    listProductSlugs(),
  ]);

  const categoryEntries: MetadataRoute.Sitemap = categorySlugs.map((slug) => ({
    url: `${SITE_URL}/categories/${slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const productEntries: MetadataRoute.Sitemap = productSlugs.map((slug) => ({
    url: `${SITE_URL}/products/${slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...categoryEntries, ...productEntries];
}