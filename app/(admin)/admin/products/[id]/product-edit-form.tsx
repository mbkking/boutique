"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProductAction } from "@/lib/actions/admin/catalog";
import { sanitizeSlug } from "@/lib/data/sanitize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProductEditFormProps {
  product: {
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
  };
  categories: Array<{ id: string; name: string }>;
  /**
   * Stock de la variante unique, ou `null` si le produit en a plusieurs.
   *
   * Un produit multi-variantes n'a pas de stock global : le champ est alors
   * masqué, car le serveur refuserait une valeur et l'administrateur verrait
   * un total qui n'est pas le sien.
   */
  singleVariantStock: number | null;
  variantCount: number;
}

/**
 * Édition d'un produit.
 *
 * Le prix est un champ sensible : chaque enregistrement est journalisé avec la
 * valeur précédente, ce qui permet de reconstituer l'historique d'un tarif.
 */
export function ProductEditForm({
  product,
  categories,
  singleVariantStock,
  variantCount,
}: ProductEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [slug, setSlug] = useState(product.slug);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modifier le produit</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            setMessage(null);

            const form = new FormData(event.currentTarget);
            const compareAt = String(form.get("compareAtPrice") ?? "").trim();
            const weight = String(form.get("weightKg") ?? "").trim();
            const seoTitle = String(form.get("seoTitle") ?? "").trim();
            const seoDescription = String(form.get("seoDescription") ?? "").trim();

            startTransition(async () => {
              // Le stock n'est envoyé que pour un produit à une variante :
              // au-delà, chaque variante porte son propre stock et l'agrégat
              // affiché ici n'est que la somme — l'envoyer écraserait l'une
              // d'elles, et le serveur le refuse de toute façon.
              const patch: Record<string, unknown> = {
                id: product.id,
                name: String(form.get("name") ?? ""),
                slug,
                sku: String(form.get("sku") ?? ""),
                // Une fiche sans catégorie est valide : une sélection vide doit retirer la
  // catégorie, pas être renvoyée comme un identifiant mal formé.
  categoryId: String(form.get("categoryId") ?? "") || null,
                description: String(form.get("description") ?? ""),
                price: Number.parseInt(String(form.get("price") ?? "0"), 10),
                compareAtPrice: compareAt === "" ? null : Number.parseInt(compareAt, 10),
                isActive: form.get("isActive") === "on",
                isFeatured: form.get("isFeatured") === "on",
                lowStockThreshold: Number.parseInt(
                  String(form.get("lowStockThreshold") ?? "5"),
                  10
                ),
                weightKg: weight === "" ? null : Number.parseFloat(weight),
                seoTitle: seoTitle === "" ? null : seoTitle,
                seoDescription: seoDescription === "" ? null : seoDescription,
              };

              if (variantCount <= 1) {
                patch.stockOnHand = Number.parseInt(
                  String(form.get("stockOnHand") ?? "0"),
                  10
                );
              }

              const result = await updateProductAction(patch);

              if (!result.success) {
                setError(result.error);
                return;
              }

              setMessage("Produit enregistré.");
              router.refresh();
            });
          }}
          className="flex flex-col gap-4"
        >
          {error ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {message ? (
            <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {message}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nom" name="name" required defaultValue={product.name} />

            <Input
              label="Slug (URL)"
              name="slug"
              required
              value={slug}
              onChange={(event) => setSlug(sanitizeSlug(event.target.value))}
            />

            <Input label="SKU" name="sku" required defaultValue={product.sku} />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="categoryId" className="text-sm font-medium text-gray-700">
                Catégorie
              </label>
              <select
                id="categoryId"
                name="categoryId"
                required
                defaultValue={product.categoryId ?? ""}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Prix de vente (XOF)"
              name="price"
              type="number"
              min={0}
              required
              defaultValue={product.price}
            />

            <Input
              label="Ancien prix (facultatif)"
              name="compareAtPrice"
              type="number"
              min={0}
              defaultValue={product.compareAtPrice ?? ""}
              hint="Doit être supérieur au prix de vente."
            />

            <Input
              label="Seuil d'alerte"
              name="lowStockThreshold"
              type="number"
              min={0}
              defaultValue={product.lowStockThreshold}
              hint="Libellé d'alerte, commun à toutes les variantes."
            />

            {singleVariantStock !== null ? (
              <Input
                label="Stock disponible"
                name="stockOnHand"
                type="number"
                min={0}
                defaultValue={singleVariantStock}
                required
                hint={
                  variantCount === 0
                    ? "Aucune variante : la saisie en crée une, avec ce stock."
                    : "Enregistré sur la variante unique du produit."
                }
              />
            ) : null}

            <Input
              label="Poids (kg, facultatif)"
              name="weightKg"
              type="number"
              step="0.01"
              min={0}
              defaultValue={product.weightKg ?? ""}
            />
          </div>

          {singleVariantStock === null ? (
            <p className="text-xs text-text-muted">
              {`Ce produit possède ${variantCount} variantes : le stock se règle sur chacune d'elles dans le tableau des variantes ci-dessous.`}
            </p>
          ) : null}

          <Textarea
            label="Description"
            name="description"
            rows={6}
            required
            defaultValue={product.description}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Titre SEO (facultatif)"
              name="seoTitle"
              defaultValue={product.seoTitle ?? ""}
            />
            <Input
              label="Méta-description SEO (facultatif)"
              name="seoDescription"
              defaultValue={product.seoDescription ?? ""}
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={product.isActive}
                className="size-4"
              />
              Actif
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="isFeatured"
                defaultChecked={product.isFeatured}
                className="size-4"
              />
              Mis en avant
            </label>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isPending}
            loadingLabel="Enregistrement"
            disabled={isPending}
            className="w-fit"
          >
            Enregistrer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}