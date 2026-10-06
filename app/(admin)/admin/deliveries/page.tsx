import Link from "next/link";
import { Truck } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listAdminDeliveries, listAdminDrivers } from "@/lib/data/admin/catalog";
import { formatPrice } from "@/lib/services/pricing";
import { getDeliveryStatusLabel } from "@/lib/services/orders";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DeliveryStatusBadge } from "@/components/ui/status-badge";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";

export const metadata = {
  title: "Livraisons",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "tous", label: "Toutes" },
  { value: "ASSIGNED", label: "Affectées" },
  { value: "ACCEPTED", label: "Acceptées" },
  { value: "IN_PREPARATION", label: "En préparation" },
  { value: "OUT_FOR_DELIVERY", label: "En route" },
  { value: "ARRIVED", label: "Arrivées" },
  { value: "DELIVERED", label: "Livrées" },
  { value: "FAILED", label: "Échouées" },
  { value: "RETURNED", label: "Retournées" },
];

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/**
 * Vue administration des livraisons.
 *
 * L'affectation et le changement de livreur se font depuis la fiche commande :
 * ces opérations passent par `assignDeliveryAction`, qui vérifie que le
 * livreur est actif et journalise l'événement.
 */
export default async function AdminDeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  await guardPage([PERMISSIONS.DELIVERY_READ_ALL]);

  const filters = {
    status: readParam(params, "statut") || "tous",
    driverId: readParam(params, "livreur"),
    search: readParam(params, "q"),
  };

  const [deliveries, drivers] = await Promise.all([
    listAdminDeliveries(filters),
    listAdminDrivers(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      {/* L'administration suit toutes les livraisons : elle est autorisée à les lire. */}
      <RealtimeRefresh bindings={[{ table: "deliveries" }]} />
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Livraisons</h1>
        <p className="text-sm text-gray-500">
          {`${deliveries.length} livraison(s) affichée(s).`}
        </p>
      </header>

      <Card>
        <CardContent>
          <form method="get" action="/admin/deliveries" className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="q" className="text-sm font-medium text-gray-700">
                Rechercher
              </label>
              <input
                id="q"
                type="search"
                name="q"
                defaultValue={filters.search}
                placeholder="Commande ou client"
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              />
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
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="livreur" className="text-sm font-medium text-gray-700">
                Livreur
              </label>
              <select
                id="livreur"
                name="livreur"
                defaultValue={filters.driverId}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">Tous les livreurs</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.fullName}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Filtrer
            </button>

            <Link
              href="/admin/deliveries"
              className="inline-flex h-10 items-center px-3 text-sm text-gray-600 hover:underline"
            >
              Réinitialiser
            </Link>
          </form>
        </CardContent>
      </Card>

      {deliveries.length === 0 ? (
        <EmptyState
          icon={<Truck aria-hidden="true" className="size-6" />}
          title="Aucune livraison"
          description="Aucune livraison ne correspond à ces filtres."
          actionLabel="Réinitialiser les filtres"
          actionHref="/admin/deliveries"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {deliveries.map((delivery) => (
            <li key={delivery.id}>
              <Card>
                <CardContent className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/orders/${delivery.orderId}`}
                        className="text-sm font-bold text-primary hover:underline"
                      >
                        {delivery.orderNumber}
                      </Link>
                      <DeliveryStatusBadge status={delivery.status} />
                    </div>

                    <span className="text-sm text-gray-700">
                      {delivery.customerName ?? "Client invité"}
                      {delivery.customerPhone ? ` · ${delivery.customerPhone}` : ""}
                    </span>

                    <span className="text-xs text-gray-500">
                      {[
                        delivery.quarter,
                        delivery.zoneName ? `zone ${delivery.zoneName}` : null,
                        delivery.driverName ? `livreur ${delivery.driverName}` : "non affecté",
                        formatDateTime(delivery.assignedAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>

                    {delivery.failureReason ? (
                      <span className="text-xs text-red-600">
                        {`Échec : ${delivery.failureReason}`}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm font-bold text-gray-900">
                      {formatPrice(delivery.total)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {getDeliveryStatusLabel(delivery.status)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}