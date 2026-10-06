import Link from "next/link";
import { Package, Search } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { listAdminStock, listAdminStockMovements } from "@/lib/data/admin/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StockAdjustForm } from "@/app/(admin)/admin/inventory/stock-adjust-form";

export const metadata = {
  title: "Stock",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const MOVEMENT_LABELS: Record<string, string> = {
  IN: "Entrée",
  OUT: "Sortie",
  ADJUSTMENT: "Ajustement",
  RESERVATION: "Réservation",
  RELEASE: "Libération",
};

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

/**
 * Gestion du stock.
 *
 * Le stock affiché est le stock **disponible** : le stock brut moins les
 * réservations issues des commandes en cours. Le stock ne peut jamais être
 * négatif — c'est vérifié par contrainte en base et par `adjustStockAction`,
 * qui refuse toute valeur négative.
 */
export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const profile = await guardPage([PERMISSIONS.INVENTORY_READ]);

  const filters = {
    search: readParam(params, "q"),
    state: readParam(params, "etat") || "tous",
  };

  const [rows, movements] = await Promise.all([
    listAdminStock(filters),
    listAdminStockMovements(40),
  ]);

  const canAdjust = can(profile.role, PERMISSIONS.INVENTORY_ADJUST);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Stock</h1>
        <p className="text-sm text-gray-500">
          {`${rows.length} variante(s) affichée(s). Le stock disponible exclut les réservations.`}
        </p>
      </header>

      <Card>
        <CardContent>
          <form method="get" action="/admin/inventory" className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="q" className="text-sm font-medium text-gray-700">
                Rechercher
              </label>
              <input
                id="q"
                type="search"
                name="q"
                defaultValue={filters.search}
                placeholder="Produit ou SKU"
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="etat" className="text-sm font-medium text-gray-700">
                État
              </label>
              <select
                id="etat"
                name="etat"
                defaultValue={filters.state}
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

            <Link
              href="/admin/inventory"
              className="inline-flex h-10 items-center px-3 text-sm text-gray-600 hover:underline"
            >
              Réinitialiser
            </Link>
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Package aria-hidden="true" className="size-6" />}
          title="Aucune variante"
          description="Aucune variante ne correspond à ces critères."
          actionLabel="Réinitialiser les filtres"
          actionHref="/admin/inventory"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const tone =
              row.available <= 0
                ? "bg-red-100 text-red-700"
                : row.available <= row.lowStockThreshold
                  ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700";

            const attributes = row.attributes
              ? Object.entries(row.attributes)
                  .filter(([, value]) => Boolean(value))
                  .map(([key, value]) => `${key} : ${value}`)
                  .join(" · ")
              : "";

            return (
              <li key={row.variantId}>
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <Link
                          href={`/admin/products/${row.productId}`}
                          className="text-sm font-bold text-primary hover:underline"
                        >
                          {row.productName}
                        </Link>
                        <span className="text-xs text-gray-500">
                          {attributes ? `${row.sku} · ${attributes}` : row.sku}
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
                            {`${row.available} disponible(s)`}
                          </span>
                          <span className="text-xs text-gray-500">
                            {`${row.stockOnHand} en stock · ${row.stockReserved} réservé · seuil ${row.lowStockThreshold}`}
                          </span>
                          {!row.isActive ? (
                            <span className="text-xs text-gray-400">variante inactive</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {canAdjust ? (
                      <StockAdjustForm
                        variantId={row.variantId}
                        productName={row.productName}
                        currentQuantity={row.stockOnHand}
                        currentThreshold={row.lowStockThreshold}
                      />
                    ) : (
                      <p className="text-xs text-gray-400">
                        Consultation seule : votre rôle ne permet pas d&apos;ajuster le stock.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Historique des mouvements */}
      <Card>
        <CardHeader>
          <CardTitle>Derniers mouvements</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun mouvement enregistré.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {movements.map((movement) => (
                <li key={movement.id} className="flex flex-col gap-0.5 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {`${MOVEMENT_LABELS[movement.type] ?? movement.type} · ${movement.productName || movement.variantSku}`}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        movement.type === "OUT" || movement.type === "RELEASE"
                          ? "text-red-600"
                          : movement.type === "IN" || movement.type === "ADJUSTMENT"
                            ? "text-green-700"
                            : "text-gray-500"
                      }`}
                    >
                      {`${movement.quantity > 0 ? "+" : ""}${movement.quantity}`}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {[
                      movement.reason,
                      movement.actorName ? `par ${movement.actorName}` : null,
                      new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(movement.createdAt)),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400">
        Chaque ajustement exige un motif et est journalisé. Le stock ne peut jamais
        devenir négatif.
      </p>
    </div>
  );
}