import Link from "next/link";
import Image from "next/image";
import { Package, Search, Plus, Star } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { listAdminProducts } from "@/lib/data/admin/catalog";
import { listAdminCategories } from "@/lib/data/admin/catalog";
import { formatPrice } from "@/lib/services/pricing";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { ProductRowActions } from "@/app/(admin)/admin/products/product-row-actions";

export const metadata = {
  title: "Produits",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

/** Affiche l'état de stock de façon exploitable par l'équipe. */
function stockTone(available: number, threshold: number): { label: string; className: string } {
  if (available <= 0) return { label: "Rupture", className: "bg-red-100 text-red-700" };
  if (available <= threshold) return { label: "Faible", className: "bg-amber-100 text-amber-700" };
  return { label: "Disponible", className: "bg-green-100 text-green-700" };
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const profile = await guardPage([PERMISSIONS.PRODUCT_READ]);

  const filters = {
    search: readParam(params, "q"),
    categorySlug: readParam(params, "categorie"),
    status: readParam(params, "statut") || "tous",
    stock: readParam(params, "stock") || "tous",
    page: Math.max(1, Number.parseInt(readParam(params, "page") || "1", 10) || 1),
    pageSize: PAGE_SIZE,
  };

  const [result, categories] = await Promise.all([
    listAdminProducts(filters),
    listAdminCategories(),
  ]);

  const canWrite = can(profile.role, PERMISSIONS.PRODUCT_WRITE);

  // La confirmation vient de l'URL : on la borne, un paramètre arbitraire
  // ne doit pas remplir la page.
  const created = (readParam(params, "created") ?? "").slice(0, 300);

  const buildUrl = (overrides: Record<string, string>): string => {
    const next = new URLSearchParams();
    const merged: Record<string, string> = {
      q: filters.search,
      categorie: filters.categorySlug,
      statut: filters.status === "tous" ? "" : filters.status,
      stock: filters.stock === "tous" ? "" : filters.stock,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/admin/products?${query}` : "/admin/products";
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Confirmation de création, relayée par l'URL depuis `/new` : le
          formulaire se démonte en redirigeant, son état local ne survivrait
          pas. */}
      {created ? (
        <Alert variant={created.startsWith("Produit créé.") ? "success" : "warning"}>
          {created}
        </Alert>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produits</h1>
          <p className="text-sm text-gray-500">
            {`${result.totalCount} produit${result.totalCount > 1 ? "s" : ""} — page ${result.page} sur ${result.totalPages}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite ? (
            <Link href="/admin/products/new" className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-dark">
              <Plus aria-hidden="true" className="size-4" />
              Nouveau produit
            </Link>
          ) : null}
        </div>
      </header>

      {/* Filtres */}
      <Card>
        <CardContent>
          <form method="get" action="/admin/products" className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="q" className="text-sm font-medium text-gray-700">
                Rechercher
              </label>
              <input
                id="q"
                type="search"
                name="q"
                defaultValue={filters.search}
                placeholder="Nom ou SKU"
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="categorie" className="text-sm font-medium text-gray-700">
                Catégorie
              </label>
              <select
                id="categorie"
                name="categorie"
                defaultValue={filters.categorySlug}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">Toutes</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="statut" className="text-sm font-medium text-gray-700">
                Statut
              </label>
              <select
                id="statut"
                name="statut"
                defaultValue={filters.status}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="tous">Tous</option>
                <option value="actifs">Actifs</option>
                <option value="inactifs">Archivés</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="stock" className="text-sm font-medium text-gray-700">
                Stock
              </label>
              <select
                id="stock"
                name="stock"
                defaultValue={filters.stock}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="tous">Tous</option>
                <option value="alerte">Sous le seuil</option>
                <option value="rupture">En rupture</option>
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <Search aria-hidden="true" className="size-4" />
              Filtrer
            </button>

            <Link href="/admin/products" className="inline-flex h-10 items-center px-3 text-sm text-gray-600 hover:underline">
              Réinitialiser
            </Link>
          </form>
        </CardContent>
      </Card>

      {/* La création a sa propre page : garder le formulaire ici le faisait
          apparaître sous la liste, et la page `/new` affichait un second
          formulaire concurrent. */}
      {result.rows.length === 0 ? (
        <EmptyState
          icon={<Package aria-hidden="true" className="size-6" />}
          title="Aucun produit"
          description="Aucun produit ne correspond à ces filtres."
          actionLabel="Réinitialiser les filtres"
          actionHref="/admin/products"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {result.rows.map((product) => {
            const tone = stockTone(product.available, product.lowStockThreshold);

            return (
              <li key={product.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-col lg:flex-row items-start justify-between gap-3">
                      {/* Image & infos essentielles */}
                      <div className="flex flex-col lg:flex-row items-start gap-2">
                        {/* Image miniature avec badge principal */}
                        {product.images && product.images.length > 0 ? (
                          <div className="relative w-16 h-12 shrink-0 rounded-lg overflow-hidden bg-surface-alt">
                            <Image
                              src={product.images[0].url}
                              alt={product.images[0].altText || product.name}
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                            {product.images[0].isPrimary ? (
                              <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                                <Star aria-hidden="true" className="size-3" />
                                Principale
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="w-16 h-12 rounded-lg border border-border bg-surface-alt flex items-center justify-center">
                            <Package aria-hidden="true" className="size-5 text-text-muted" />
                          </div>
                        )}

                        {/* Infos produit */}
                        <div>
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {product.name}
                          </Link>
                          {product.isFeatured ? (
                            <Badge variant="info" className="mt-0.5">
                              Mis en avant
                            </Badge>
                          ) : null}
                          {!product.isActive ? (
                            <Badge variant="neutral" className="mt-0.5">
                              Archivé
                            </Badge>
                          ) : null}
                        </div>
                      </div>

                      {/* Détails (droite sur desktop, dessous sur mobile) */}
                      <div className="w-full lg:w-0lg:flex lg:flex-col lg:items-center lg:gap-2">
                        <span className="text-xs text-gray-500">
                          {product.sku}
                        </span>

                        <span className="text-xs text-gray-500 block lg:block">
                          {product.categoryName ?? "Sans catégorie"}
                        </span>

                        <span className="text-xs text-gray-500">
                          {product.variantCount} variante(s)
                        </span>
                      </div>
                    </div>

                    {/* Prix + stock */}
                    <div className="flex flex-col lg:flex-row items-center gap-2">
                      <span className="text-lg font-bold text-gray-900">
                        {formatPrice(product.price)}
                      </span>
                      {product.compareAtPrice ? (
                        <span className="text-xs text-gray-400 line-through">
                          {formatPrice(product.compareAtPrice)}
                        </span>
                      ) : null}
                    </div>

                    {/* Stock + état */}
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone.className}`}
                      >
                        {`${tone.label} — ${product.available} disponible(s)`}
                      </span>
                      {product.stockReserved > 0 ? (
                        <span className="text-xs text-gray-500">
                          {`${product.stockReserved} réservé(s)`}
                        </span>
                      ) : null}
                    </div>

                    {/* Actions contextuelles */}
                    <div className="mt-2 flex flex-col lg:flex-row gap-1">
                      {canWrite ? (
                        <ProductRowActions
                          productId={product.id}
                          productName={product.name}
                          isActive={product.isActive}
                          canWrite={canWrite}
                        />
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        buildHref={(page) => buildUrl({ page: String(page) })}
        label="Pagination des produits"
      />
    </div>
  );
}
