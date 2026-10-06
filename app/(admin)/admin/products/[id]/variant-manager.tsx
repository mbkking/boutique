"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createVariantAction } from "@/lib/actions/admin/catalog";
import { formatPrice } from "@/lib/services/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VariantManagerProps {
  productId: string;
  variants: Array<{
    id: string;
    sku: string;
    attributes: Record<string, string> | null;
    price: number;
    compareAtPrice: number | null;
    stockOnHand: number;
    stockReserved: number;
    available: number;
    lowStockThreshold: number;
    isActive: boolean;
  }>;
  canWrite: boolean;
}

/**
 * Variantes d'un produit.
 *
 * Une variante encode un attribut exploitable — taille, couleur, parfum, modèle —
 * ou une combinaison. Le serveur refuse deux variantes de même combinaison et un
 * SKU déjà pris : une incohérence de stock par attribut est alors impossible.
 */
export function VariantManager({ productId, variants, canWrite }: VariantManagerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{`Variantes (${variants.length})`}</CardTitle>
      </CardHeader>
      <CardContent>
        {variants.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucune variante. Un produit sans variante est vendu en lot unique.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {variants.map((variant) => {
              const attributes = variant.attributes
                ? Object.entries(variant.attributes)
                    .filter(([, value]) => Boolean(value))
                    .map(([key, value]) => `${key} : ${value}`)
                    .join(" · ")
                : "Lot unique";

              const tone =
                variant.available <= 0
                  ? "bg-red-100 text-red-700"
                  : variant.available <= variant.lowStockThreshold
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700";

              return (
                <li
                  key={variant.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium text-gray-900">{attributes}</span>
                    <span className="text-xs text-gray-500">
                      {`${variant.sku} · ${formatPrice(variant.price)} · seuil ${variant.lowStockThreshold}`}
                    </span>
                  </div>

                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
                    {`${variant.available} dispo · ${variant.stockReserved} réservé`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {canWrite ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}

            {!isOpen ? (
              <Button variant="outline" onClick={() => setIsOpen(true)} className="w-fit">
                <Plus aria-hidden="true" className="size-4" />
                Ajouter une variante
              </Button>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setError(null);

                  const form = new FormData(event.currentTarget);

                  // Les attributs libres sont saisis « clé : valeur », un par
                  // ligne : le formulaire reste simple sans plague de champs.
                  const attributeLines = String(form.get("attributes") ?? "")
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean);

                  const attributes: Record<string, string> = {};
                  for (const line of attributeLines) {
                    const separator = line.indexOf(":");
                    if (separator <= 0) continue;
                    attributes[line.slice(0, separator).trim()] = line
                      .slice(separator + 1)
                      .trim();
                  }

                  startTransition(async () => {
                    const result = await createVariantAction({
                      productId,
                      sku: String(form.get("sku") ?? ""),
                      attributes,
                      price: Number.parseInt(String(form.get("price") ?? "0"), 10),
                      compareAtPrice: null,
                      stockOnHand: Number.parseInt(String(form.get("stockOnHand") ?? "0"), 10),
                      lowStockThreshold: Number.parseInt(
                        String(form.get("lowStockThreshold") ?? "5"),
                        10
                      ),
                    });

                    if (!result.success) {
                      setError(result.error);
                      return;
                    }

                    setIsOpen(false);
                    router.refresh();
                  });
                }}
                className="flex flex-col gap-3"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input label="SKU" name="sku" required />
                  <Input
                    label="Prix (XOF)"
                    name="price"
                    type="number"
                    min={0}
                    required
                  />
                  <Input
                    label="Stock initial"
                    name="stockOnHand"
                    type="number"
                    min={0}
                    defaultValue={0}
                  />
                </div>

                <Input
                  label="Seuil d'alerte"
                  name="lowStockThreshold"
                  type="number"
                  min={0}
                  defaultValue={5}
                />

                <Input
                  label="Attributs (un par ligne)"
                  name="attributes"
                  placeholder={"Taille : M\nCouleur : Noir"}
                  hint="Format « clé : valeur ». Une seule ligne = variante sans attribut."
                />

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    isLoading={isPending}
                    loadingLabel="Création"
                    disabled={isPending}
                  >
                    Créer la variante
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>
                    Annuler
                  </Button>
                </div>
              </form>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}