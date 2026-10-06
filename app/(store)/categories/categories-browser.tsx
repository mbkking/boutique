import Link from "next/link";
import { Package } from "lucide-react";
import type { CategoryWithChildren } from "@/lib/data/categories";
import { normalizeCategoryQuery } from "@/lib/data/categories";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type CategorySort = "name_asc" | "name_desc" | "products_first";

interface CategoriesBrowserProps {
  tree: CategoryWithChildren[];
  totalCount: number;
  query: string;
  sort: CategorySort;
}

/**
 * Navigateur de catégories : recherche par nom et ordre configurable.
 *
 * Server Component : le filtrage et le tri sont appliqués côté serveur, à
 * partir des paramètres d'URL. Aucun JavaScript n'est nécessaire pour
 * fonctionner, et les résultats sont partageables par lien.
 */
export function CategoriesBrowser({
  tree,
  totalCount,
  query,
  sort,
}: CategoriesBrowserProps) {
  const normalisedQuery = normalizeCategoryQuery(query);

  // Le filtre porte sur le nom de la catégorie et celui de ses sous-catégories :
  // chercher « chaussures » doit aussi remonter la catégorie « Mode » qui
  // contient une sous-catégorie « Chaussures ».
  const filteredTree =
    normalisedQuery === ""
      ? tree
      : tree
          .map((category) => {
            const selfMatches = normaliseForMatch(category.name).includes(normalisedQuery);
            const children = selfMatches
              ? category.children
              : category.children.filter((child) =>
                  normaliseForMatch(child.name).includes(normalisedQuery)
                );

            if (!selfMatches && children.length === 0) return null;
            return { ...category, children };
          })
          .filter((category): category is CategoryWithChildren => category !== null);

  const sortedTree = [...filteredTree].sort((a, b) => {
    if (sort === "products_first") {
      return b.children.length - a.children.length;
    }
    const direction = sort === "name_desc" ? -1 : 1;
    return direction * a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });

  return (
    <>
      <form
        role="search"
        method="get"
        action="/categories"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="cat-q" className="text-sm font-medium text-text">
            Rechercher une catégorie
          </label>
          <input
            id="cat-q"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Meubles, chaussures, parfums…"
            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cat-tri" className="text-sm font-medium text-text">
            Trier
          </label>
          <select
            id="cat-tri"
            name="tri"
            defaultValue={sort}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text"
          >
            <option value="name_asc">Nom (A → Z)</option>
            <option value="name_desc">Nom (Z → A)</option>
            <option value="products_first">Les plus fournies</option>
          </select>
        </div>

        <Button type="submit" size="md">
          Filtrer
        </Button>

        {query !== "" || sort !== "name_asc" ? (
          <Link href="/categories" className="pb-3 text-sm text-primary hover:underline">
            Réinitialiser
          </Link>
        ) : null}
      </form>

      <p aria-live="polite" className="text-sm text-text-muted">
        {sortedTree.length === 0
          ? `Aucune catégorie ne correspond à « ${query} ».`
          : `${sortedTree.length} catégorie${sortedTree.length > 1 ? "s" : ""} affichée${
              sortedTree.length > 1 ? "s" : ""
            }${query === "" ? ` sur ${totalCount}` : ""}.`}
      </p>

      {sortedTree.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedTree.map((category) => (
            <li key={category.id}>
              <Card className="flex h-full flex-col">
                <CardContent className="flex flex-1 flex-col gap-2">
                  <h2 className="text-base font-semibold text-text">
                    <Link href={`/categories/${category.slug}`} className="hover:text-primary">
                      {category.name}
                    </Link>
                  </h2>

                  {category.description ? (
                    <p className="line-clamp-3 text-sm text-text-muted">
                      {category.description}
                    </p>
                  ) : null}

                  {category.children.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {category.children.map((child) => (
                        <li key={child.id}>
                          <Link
                            href={`/categories/${child.slug}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {child.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-auto pt-2">
                    <Link
                      href={`/categories/${category.slug}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Voir les produits
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Package aria-hidden="true" className="size-6" />}
          title={query === "" ? "Aucune catégorie disponible" : "Aucun résultat"}
          description={
            query === ""
              ? "Le catalogue est en cours de mise en ligne. Revenez bientôt pour découvrir nos produits."
              : `Aucune catégorie ne correspond à « ${query} ». Essayez un terme plus général ou parcourez la liste complète.`
          }
          actionLabel={query === "" ? "Retour à l'accueil" : "Voir toutes les catégories"}
          actionHref={query === "" ? "/" : "/categories"}
        />
      )}
    </>
  );
}

/** Minuscules sans accent, pour comparer des noms saisis librement. */
function normaliseForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}