import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { listCategories, listCategoryTree } from "@/lib/data/categories";
import {
  CategoriesBrowser,
  type CategorySort,
} from "@/app/(store)/categories/categories-browser";


/**
 * Rendue à la demande : le catalogue évolue en permanence et une coupure de la
 * base ne doit jamais figer une page vide dans le cache de build.
 */
export const revalidate = 0;

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Toutes nos catégories",
  description:
    "Parcourez toutes les catégories de la boutique en ligne à Niamey : meubles, vêtements, chaussures, parfums, accessoires et plus encore.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;

  const rawQuery = query.q;
  const search = typeof rawQuery === "string" ? rawQuery : "";

  const rawSort = query.tri;
  const sort: CategorySort =
    rawSort === "name_desc" || rawSort === "products_first" ? rawSort : "name_asc";

  const [tree, flatCategories] = await Promise.all([
    listCategoryTree(),
    listCategories(),
  ]);

  const childCount = tree.reduce((sum, category) => sum + category.children.length, 0);
  const totalCount = tree.length + childCount;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <nav aria-label="Fil d'Ariane">
        <ol className="flex items-center gap-1 text-sm text-text-muted">
          <li>
            <Link href="/" className="hover:text-primary">
              Accueil
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-4" />
          <li aria-current="page" className="font-medium text-text">
            Catégories
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Nos catégories</h1>
        <p className="text-sm text-text-muted">
          {totalCount > 0
            ? `${totalCount} catégorie${totalCount > 1 ? "s" : ""} disponible${
                totalCount > 1 ? "s" : ""
              }. Choisissez une famille pour découvrir nos produits.`
            : "Découvrez nos familles de produits ou recherchez directement."}
        </p>
      </header>

      <CategoriesBrowser tree={tree} totalCount={totalCount} query={search} sort={sort} />

      {flatCategories.length > 0 ? (
        <section aria-labelledby="toutes-categories" className="space-y-3">
          <h2 id="toutes-categories" className="text-lg font-semibold text-text">
            Liste complète
          </h2>
          <ul className="flex flex-wrap gap-2">
            {flatCategories.map((category) => (
              <li key={category.id}>
                <Link
                  href={`/categories/${category.slug}`}
                  className="tap-target inline-flex items-center rounded-full border border-border px-4 py-1.5 text-sm text-text hover:bg-surface-alt"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
