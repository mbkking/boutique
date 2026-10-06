import type { Metadata } from "next";
import Link from "next/link";
import { Package, Search as SearchIcon } from "lucide-react";
import { listProducts, type ProductSort } from "@/lib/data/products";
import { listCategories } from "@/lib/data/categories";
import { safeQuery, toList } from "@/lib/data/safe";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, ProductFilters } from "@/app/_components/product-filters";
import { ProductCardGrid } from "@/components/product/product-card";

const PAGE_SIZE = 24;


/**
 * Rendue à la demande : la disponibilité des articles et des frais de livraison
 * doivent toujours refléter la base au moment de la visite.
 */
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Rechercher un produit",
  description:
    "Recherchez un produit dans le catalogue de la boutique en ligne à Niamey : meubles, vêtements, chaussures, parfums et accessoires.",
  alternates: { canonical: "/search" },
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
): string | undefined {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function readPositiveInteger(
  params: Record<string, string | string[] | undefined>,
  key: string
): number | undefined {
  const raw = readParam(params, key);
  if (!raw || !/^\d{1,6}$/.test(raw)) return undefined;
  const value = Number.parseInt(raw, 10);
  return value >= 0 ? value : undefined;
}

function readPrice(
  params: Record<string, string | string[] | undefined>,
  key: string
): number | undefined {
  const raw = readParam(params, key);
  if (!raw || !/^\d{1,7}$/.test(raw)) return undefined;
  return Number.parseInt(raw, 10);
}

function readSort(
  params: Record<string, string | string[] | undefined>
): ProductSort | undefined {
  const raw = readParam(params, "tri");
  if (raw === "recent" || raw === "price_asc" || raw === "price_desc" || raw === "name_asc") {
    return raw;
  }
  return undefined;
}

/** Termes proposés quand la recherche ne renvoie rien : issus du catalogue réel. */
async function loadFallbackSuggestions(): Promise<string[]> {
  const suggestions: string[] = [];
  const outcome = await safeQuery("search.suggestions", (supabase) =>
    supabase
      .from("products")
      .select("name")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(60)
  );

  for (const row of toList(outcome)) {
    if (typeof row.name !== "string") continue;
    // On retient le premier mot significatif : c'est ce que l'utilisateur
    // est le plus susceptible de retaper.
    const word = row.name
      .split(/\s+/)
      .find((token) => token.length >= 4)
      ?.replace(/[^\p{L}\p{N}-]/gu, "")
      .toLowerCase();

    if (word && word.length >= 4 && !suggestions.includes(word)) {
      suggestions.push(word);
    }
    if (suggestions.length >= 5) break;
  }

  return suggestions;
}

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const query = await searchParams;

  const term = readParam(query, "q")?.trim() ?? "";
  const categorySlug = readParam(query, "categorie");
  const minPrice = readPrice(query, "min");
  const maxPrice = readPrice(query, "max");
  const sort = readSort(query);
  const inStockOnly = readParam(query, "stock") === "1";
  const page = Math.max(readPositiveInteger(query, "page") ?? 1, 1);

  const hasQuery = term.length > 0;

  const [products, categories] = await Promise.all([
    hasQuery
      ? listProducts({
          search: term,
          categorySlug,
          minPrice,
          maxPrice,
          inStockOnly,
          sort,
          limit: PAGE_SIZE + 1,
          offset: (page - 1) * PAGE_SIZE,
        })
      : Promise.resolve([]),
    listCategories(),
  ]);

  const hasNextPage = products.length > PAGE_SIZE;
  const visibleProducts = products.slice(0, PAGE_SIZE);

  // Suggestions issues du catalogue, uniquement affichées quand la recherche
  // a échoué : proposer des termes inexistants en base serait trompeur.
  const suggestions = hasQuery && visibleProducts.length === 0
    ? await loadFallbackSuggestions()
    : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3" data-aos="fade-up">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Recherche</h1>
        <p aria-live="polite" className="text-sm text-text-muted">
          {hasQuery
            ? `${products.length} résultat${
                products.length > 1 ? "s" : ""
              } pour « ${term} ».`
            : "Saisissez un mot-clé pour trouver un produit."}
        </p>
      </header>

      <ProductFilters
        actionPath="/search"
        categories={categories.map((category) => ({
          slug: category.slug,
          name: category.name,
        }))}
        search={term}
        categorySlug={categorySlug}
        minPrice={readParam(query, "min")}
        maxPrice={readParam(query, "max")}
        inStockOnly={inStockOnly}
        sort={sort}
        submitLabel="Rechercher"
      />

      {hasQuery && visibleProducts.length > 0 ? (
        <>
          <ProductCardGrid products={visibleProducts} />

          <Pagination
            actionPath="/search"
            currentPage={page}
            totalPages={hasNextPage ? page + 1 : page}
            params={{
              ...(term ? { q: term } : {}),
              ...(categorySlug ? { categorie: categorySlug } : {}),
              ...(readParam(query, "min") ? { min: readParam(query, "min") ?? "" } : {}),
              ...(readParam(query, "max") ? { max: readParam(query, "max") ?? "" } : {}),
              ...(inStockOnly ? { stock: "1" } : {}),
              ...(sort ? { tri: sort } : {}),
            }}
          />
        </>
      ) : hasQuery ? (
        <EmptyState
          icon={<SearchIcon aria-hidden="true" className="size-6" />}
          title={`Aucun résultat pour « ${term} »`}
          description="Vérifiez l'orthographe, essayez un mot plus général ou retirez certains filtres."
        >
          <div className="mt-2 flex flex-col gap-3">
            {suggestions.length > 0 ? (
              <>
                <p className="text-sm font-medium text-text">
                  Essayez plutôt :
                </p>
                <ul className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <Link
                        href={`/search?q=${encodeURIComponent(suggestion)}`}
                        className="tap-target inline-flex items-center rounded-full border border-border px-4 py-1.5 text-sm text-text hover:bg-surface-alt"
                      >
                        {suggestion}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <Link href="/categories" className="text-sm text-primary hover:underline">
              Parcourir toutes les catégories
            </Link>
          </div>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <SearchIcon className="size-6" />
              </span>
              <p className="text-base font-semibold text-text">
                Que recherchez-vous ?
              </p>
              <p className="max-w-md text-sm text-text-muted">
                Indiquez un nom de produit, une matière ou une marque. Par exemple
                « chaussures », « fauteuil » ou « parfum ».
              </p>
            </CardContent>
          </Card>

          {categories.length > 0 ? (
            <section aria-labelledby="titre-recherche-categories" className="space-y-3">
              <h2 id="titre-recherche-categories" className="text-lg font-semibold text-text">
                Ou explorez par catégorie
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {categories.slice(0, 8).map((category) => (
                  <li key={category.id}>
                    <Link
                      href={`/categories/${category.slug}`}
                      className="tap-target flex h-full items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-text hover:bg-surface-alt"
                    >
                      <Package aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      <span className="truncate">{category.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div>
            <Link href="/categories">
              <Button variant="primary" size="lg">
                Voir tout le catalogue
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}