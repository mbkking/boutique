import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, Package } from "lucide-react";
import { getCategoryBySlug, listCategories } from "@/lib/data/categories";
import { listProducts, type ProductSort } from "@/lib/data/products";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, ProductFilters } from "@/app/_components/product-filters";
import { ProductCardGrid } from "@/components/product/product-card";
import { getAvailableStock } from "@/lib/services/inventory";


/**
 * Rendue à la demande : le catalogue évolue en permanence et une coupure de la
 * base ne doit jamais figer une page vide dans le cache de build.
 */
export const revalidate = 0;

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

const PAGE_SIZE = 24;

/** Un niveau d'un paramètre d'URL, déjà nettoyé par le routeur. */
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
  if (
    raw === "recent" ||
    raw === "price_asc" ||
    raw === "price_desc" ||
    raw === "name_asc"
  ) {
    return raw;
  }
  return undefined;
}

function buildPageUrl(slug: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/categories/${slug}?${query}` : `/categories/${slug}`;
}

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return { title: "Catégorie introuvable" };
  }

  const description =
    category.description ??
    `Découvrez nos produits ${category.name} disponibles à la vente à Niamey. Paiement à la livraison.`;

  return {
    metadataBase: new URL(SITE_URL),
    title: category.name,
    description,
    alternates: { canonical: `/categories/${category.slug}` },
    openGraph: {
      type: "website",
      locale: "fr_NE",
      title: `${category.name} | ISF NAF-CHOPOP`,
      description,
      url: `${SITE_URL}/categories/${category.slug}`,
      ...(category.image_url ? { images: [{ url: category.image_url }] } : {}),
    },
  };
}

/**
 * La liste des catégories est laissée dynamique (`[]`) :
 * une catégorie peut être créée ou modifiée à tout moment et l'indexation ne
 * doit jamais servir une page périmée.
 */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  return [];
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const category = await getCategoryBySlug(slug);

  // `getCategoryBySlug` retourne `null` à la fois pour un slug inconnu et pour
  // une base injoignable. Dans les deux cas on affiche une page « introuvable »
  // plutôt qu'une erreur : le visiteur peut toujours revenir au catalogue.
  if (!category) notFound();

  const page = Math.max(readPositiveInteger(query, "page") ?? 1, 1);
  const minPrice = readPrice(query, "min");
  const maxPrice = readPrice(query, "max");
  const sort = readSort(query);
  const search = readParam(query, "q");
  const inStockOnly = readParam(query, "stock") === "1";

  const offset = (page - 1) * PAGE_SIZE;

  // On demande une ligne de plus que la taille de page : c'est le moyen le plus
  // simple de savoir s'il existe une page suivante, sans requête de comptage.
  const [fetchedProducts, categories] = await Promise.all([
    listProducts({
      categorySlug: category.slug,
      search,
      minPrice,
      maxPrice,
      inStockOnly,
      sort,
      limit: PAGE_SIZE + 1,
      offset,
    }),
    listCategories(),
  ]);

  // Page au-delà du contenu : on renvoie vers la page précédente, qui contient
  // forcément des résultats.
  if (fetchedProducts.length === 0 && page > 1) {
    redirect(
      buildPageUrl(category.slug, {
        ...(search ? { q: search } : {}),
        ...(minPrice !== undefined ? { min: String(minPrice) } : {}),
        ...(maxPrice !== undefined ? { max: String(maxPrice) } : {}),
        ...(inStockOnly ? { stock: "1" } : {}),
        ...(sort ? { tri: sort } : {}),
        page: String(page - 1),
      })
    );
  }

  const hasNextPage = fetchedProducts.length > PAGE_SIZE;
  const products = fetchedProducts.slice(0, PAGE_SIZE);

  const inStockCount = products.filter((product) =>
    Boolean(
      getAvailableStock({
        stock_on_hand: product.stock_on_hand,
        stock_reserved: product.stock_reserved,
      })
    )
  ).length;

  const hasFilters = Boolean(search || minPrice !== undefined || maxPrice !== undefined || inStockOnly);

  const categoryOptions = categories.map((entry) => ({
    slug: entry.slug,
    name: entry.name,
  }));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <Link
        href="/categories"
        className="inline-flex w-fit items-center gap-1 text-sm text-text-muted hover:text-text"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Retour aux catégories
      </Link>

      {/* Fil d'Ariane */}
      <nav aria-label="Fil d'Ariane">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-text-muted">
          <li>
            <Link href="/" className="hover:text-primary">
              Accueil
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-4" />
          <li>
            <Link href="/categories" className="hover:text-primary">
              Catégories
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-4" />
          <li aria-current="page" className="font-medium text-text">
            {category.name}
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-3" data-aos="fade-up">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">{category.name}</h1>
        {category.description ? (
          <p className="max-w-3xl text-sm text-text-muted">{category.description}</p>
        ) : null}
        <p aria-live="polite" className="text-sm text-text-muted">
          {products.length > 0
            ? `${products.length} produit${products.length > 1 ? "s" : ""} affiché${
                products.length > 1 ? "s" : ""
              } — dont ${inStockCount} en stock.`
            : "Aucun produit pour le moment."}
        </p>
      </header>

      {/* Sous-catégories */}
      {category.children.length > 0 ? (
        <nav aria-label={`Sous-catégories de ${category.name}`}>
          <ul className="flex flex-wrap gap-2">
            {category.children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/categories/${child.slug}`}
                  className="tap-target inline-flex items-center rounded-full border border-border px-4 py-1.5 text-sm text-text hover:bg-surface-alt"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {/* Filtres */}
      <ProductFilters
        actionPath={`/categories/${category.slug}`}
        categories={categoryOptions}
        search={search}
        categorySlug={undefined}
        minPrice={readParam(query, "min")}
        maxPrice={readParam(query, "max")}
        inStockOnly={inStockOnly}
        sort={sort}
        showCategorySelect
      />

      {/* Résultats */}
      {products.length > 0 ? (
        <ProductCardGrid products={products} />
      ) : (
        <EmptyState
          icon={<Package aria-hidden="true" className="size-6" />}
          title={
            hasFilters
              ? "Aucun produit ne correspond à ces critères"
              : "Cette catégorie est vide pour le moment"
          }
          description={
            hasFilters
              ? "Essayez d'élargir votre recherche : modifiez le prix, retirez le filtre « en stock » ou changez de catégorie."
              : "Nous préparons de nouveaux arrivages dans cette catégorie. Revenez bientôt ou parcourez les autres catégories."
          }
          actionLabel={hasFilters ? "Réinitialiser les filtres" : "Voir toutes les catégories"}
          actionHref={
            hasFilters ? `/categories/${category.slug}` : "/categories"
          }
        />
      )}

      <Pagination
        actionPath={`/categories/${category.slug}`}
        currentPage={page}
        totalPages={hasNextPage ? page + 1 : page}
        params={{
          ...(search ? { q: search } : {}),
          ...(readParam(query, "min") ? { min: readParam(query, "min") ?? "" } : {}),
          ...(readParam(query, "max") ? { max: readParam(query, "max") ?? "" } : {}),
          ...(inStockOnly ? { stock: "1" } : {}),
          ...(sort ? { tri: sort } : {}),
        }}
      />
    </div>
  );
}