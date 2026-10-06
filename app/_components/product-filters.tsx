import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pagination as SharedPagination } from "@/components/ui/pagination";
import type { ProductSort } from "@/lib/data/products";

export interface FilterCategoryOption {
  slug: string;
  name: string;
}

export interface ProductFiltersProps {
  /** Catégories proposées dans le sélecteur. */
  categories?: FilterCategoryOption[];
  /** URL d'action du formulaire (conservée en cas de soumission). */
  actionPath: string;
  search?: string;
  categorySlug?: string;
  minPrice?: string;
  maxPrice?: string;
  inStockOnly?: boolean;
  sort?: string;
  /** Le sélecteur de catégorie est masqué sur une page déjà catégorisée. */
  showCategorySelect?: boolean;
  /** Libellé du bouton, « Filtrer » ou « Rechercher ». */
  submitLabel?: string;
}

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "recent", label: "Plus récents" },
  { value: "price_asc", label: "Prix croissant" },
  { value: "price_desc", label: "Prix décroissant" },
  { value: "name_asc", label: "Nom (A → Z)" },
];

function isProductSort(value: string | undefined): value is ProductSort {
  return (
    value === "recent" ||
    value === "price_asc" ||
    value === "price_desc" ||
    value === "name_asc"
  );
}

function isNonNegativeInteger(value: string): boolean {
  return /^\d{1,7}$/.test(value);
}

/**
 * Barre de filtres du catalogue.
 *
 * Elle repose sur un formulaire `GET` : les filtres vivent dans l'URL, ce qui les
 * rend partageables, compatibles avec le « précédent/suivant » du navigateur et
 * fonctionnables même si le JavaScript n'est pas encore chargé.
 */
export function ProductFilters({
  categories = [],
  actionPath,
  search,
  categorySlug,
  minPrice,
  maxPrice,
  inStockOnly = false,
  sort,
  showCategorySelect = true,
  submitLabel = "Filtrer",
}: ProductFiltersProps) {
  return (
    <form
      action={actionPath}
      method="get"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-text">
        <SlidersHorizontal aria-hidden="true" className="size-4 text-primary" />
        <h2>Filtrer les produits</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="Rechercher"
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Nom du produit…"
          hint="Exemple :-chaussures"
        />

        {showCategorySelect && categories.length > 0 ? (
          <Select label="Catégorie" name="categorie" defaultValue={categorySlug ?? ""}>
            <option value="">Toutes les catégories</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          label="Trier par"
          name="tri"
          defaultValue={isProductSort(sort) ? sort : "recent"}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Prix min."
            type="number"
            inputMode="numeric"
            name="min"
            min={0}
            step={500}
            defaultValue={isNonNegativeInteger(minPrice ?? "") ? minPrice : ""}
            placeholder="0"
          />
          <Input
            label="Prix max."
            type="number"
            inputMode="numeric"
            name="max"
            min={0}
            step={500}
            defaultValue={isNonNegativeInteger(maxPrice ?? "") ? maxPrice : ""}
            placeholder="250000"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            name="stock"
            value="1"
            defaultChecked={inStockOnly}
            className="size-4 rounded border-border text-primary focus-visible:focus-ring"
          />
          Uniquement les produits en stock
        </label>

        <div className="flex gap-2">
          {categorySlug || search || minPrice || maxPrice || inStockOnly || sort ? (
            <Link href={actionPath}>
              <Button variant="ghost" size="md">
                Réinitialiser
              </Button>
            </Link>
          ) : null}
          <Button type="submit" variant="primary" size="md">
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

export interface StorePaginationProps {
  actionPath: string;
  currentPage: number;
  totalPages: number;
  /** Paramètres de recherche à conserver dans chaque lien. */
  params: Record<string, string>;
}

/**
 * Pagination catalogue.
 *
 * Délègue au composant du design system et ne garde que la construction des
 * URL : la mise en forme des contrôles n'a pas à être réinventée à chaque
 * appelant.
 */
export function Pagination({
  actionPath,
  currentPage,
  totalPages,
  params,
}: StorePaginationProps) {
  const buildHref = (page: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set("page", String(page));
    return `${actionPath}?${search.toString()}`;
  };

  return (
    <SharedPagination
      currentPage={currentPage}
      totalPages={totalPages}
      buildHref={buildHref}
      label="Pagination des produits"
    />
  );
}