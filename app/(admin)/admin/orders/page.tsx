import Link from "next/link";
import { Download, Search } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import {
  listAdminOrders,
  listAdminOrderFilterOptions,
  type AdminOrderFilters,
} from "@/lib/data/admin/orders";
import { formatPrice } from "@/lib/services/pricing";
import { getPaymentStatusLabel } from "@/lib/services/orders";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { OrderRowActions } from "@/app/(admin)/admin/orders/order-row-actions";
import type { OrderStatus, PaymentStatus } from "@/types";

export const metadata = {
  title: "Commandes",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

/** Onglets de statut, avec regroupements métier. */
const STATUS_TABS: Array<{ key: string; label: string; statuses: OrderStatus[] }> = [
  { key: "toutes", label: "Toutes", statuses: [] },
  {
    key: "a-confirmer",
    label: "À confirmer",
    statuses: ["PENDING_CONFIRMATION"],
  },
  {
    key: "confirmees",
    label: "Confirmées",
    statuses: ["CONFIRMED"],
  },
  {
    key: "en-preparation",
    label: "En préparation",
    statuses: ["PREPARING", "READY_FOR_DELIVERY"],
  },
  {
    key: "en-livraison",
    label: "En livraison",
    statuses: ["ASSIGNED", "OUT_FOR_DELIVERY", "ARRIVED"],
  },
  { key: "livrees", label: "Livrées", statuses: ["DELIVERED"] },
  {
    key: "annulees",
    label: "Annulées",
    statuses: ["CANCELLED", "RETURNED", "DELIVERY_FAILED"],
  },
];

const PAYMENT_TABS: Array<{ key: string; label: string; statuses: PaymentStatus[] }> = [
  { key: "tous", label: "Tous les paiements", statuses: [] },
  { key: "en-attente", label: "En attente", statuses: ["COD_PENDING"] },
  { key: "encaisse", label: "Encaissé", statuses: ["COD_COLLECTED"] },
  { key: "partiel", label: "Partiel", statuses: ["COD_PARTIAL"] },
  { key: "echec", label: "Échec", statuses: ["COD_FAILED"] },
];

const PERIOD_OPTIONS = [
  { value: "", label: "Toutes les périodes" },
  { value: "today", label: "Aujourd'hui" },
  { value: "week", label: "7 derniers jours" },
  { value: "month", label: "30 derniers jours" },
];

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function readAmount(params: SearchParams, key: string): number | undefined {
  const raw = readParam(params, key);
  if (!/^\d{1,9}$/.test(raw)) return undefined;
  return Number.parseInt(raw, 10);
}

function readPage(params: SearchParams): number {
  const raw = readParam(params, "page");
  if (!/^\d{1,4}$/.test(raw)) return 1;
  return Math.max(1, Number.parseInt(raw, 10));
}

/** Construit une URL en conservant les filtres courants. */
function buildUrl(params: SearchParams, overrides: Record<string, string>): string {
  const next = new URLSearchParams();
  const merged: Record<string, string> = {};
  for (const key of ["filtre", "periode", "zone", "livreur", "paiement", "min", "max", "q"]) {
    const value = readParam(params, key);
    if (value) merged[key] = value;
  }

  for (const [key, value] of Object.entries({ ...merged, ...overrides })) {
    if (value) next.set(key, value);
  }

  const query = next.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const profile = await guardPage([PERMISSIONS.ORDER_READ]);

  const activeTab = readParam(params, "filtre");
  const activePayment = readParam(params, "paiement");

  const statusTab =
    STATUS_TABS.find((tab) => tab.key === activeTab) ?? STATUS_TABS[0];
  const paymentTab =
    PAYMENT_TABS.find((tab) => tab.key === activePayment) ?? PAYMENT_TABS[0];

  const filters: AdminOrderFilters = {
    statuses: statusTab.statuses,
    paymentStatuses: paymentTab.statuses,
    period: readParam(params, "periode"),
    zoneSlug: readParam(params, "zone"),
    driverId: readParam(params, "livreur"),
    search: readParam(params, "q"),
    minTotal: readAmount(params, "min"),
    maxTotal: readAmount(params, "max"),
    page: readPage(params),
    pageSize: PAGE_SIZE,
  };

  const [result, options] = await Promise.all([
    listAdminOrders(filters),
    listAdminOrderFilterOptions(),
  ]);

  const role = profile.role;
  const permissions = {
    confirm: can(role, PERMISSIONS.ORDER_CONFIRM),
    prepare: can(role, PERMISSIONS.ORDER_PREPARE),
    cancel: can(role, PERMISSIONS.ORDER_CANCEL),
    assign: can(role, PERMISSIONS.ORDER_ASSIGN_DELIVERY),
  };

return (
    <div className="flex flex-col gap-6">
      {/* Nouvelle commande ou changement de statut : l'écran se met à jour. */}
      <RealtimeRefresh bindings={[{ table: "orders" }, { table: "deliveries" }]} />

      <header>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commandes</h1>
          <p className="text-sm text-gray-500">
            {`${result.totalCount} commande${result.totalCount > 1 ? "s" : ""} correspondant aux filtres — page ${result.page} sur ${result.totalPages}.`}
          </p>
        </div>

        {/*
          L'export est réservé à l'administrateur : il porte sur l'ensemble des
          commandes, données clients comprises.
        */}
        {can(role, PERMISSIONS.EXPORT_RUN) ? (
          <Link
            href={`/api/admin/orders/export?${new URLSearchParams(
              Object.entries({
                filtre: activeTab,
                periode: filters.period ?? "",
                zone: filters.zoneSlug ?? "",
                livreur: filters.driverId ?? "",
                paiement: activePayment,
              }).filter(([, value]) => value)
            ).toString()}`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download aria-hidden="true" className="size-4" />
            Exporter
          </Link>
        ) : null}
      </header>

      {/* Onglets de statut */}
      <nav aria-label="Filtrer par statut">
        <ul className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <li key={tab.key}>
              <Link
                href={buildUrl(params, { filtre: tab.key === "toutes" ? "" : tab.key, page: "" })}
                aria-current={tab.key === statusTab.key ? "page" : undefined}
                className={`tap-target inline-flex items-center rounded-full border px-4 py-1.5 text-sm ${
                  tab.key === statusTab.key
                    ? "border-primary bg-primary text-white"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Filtres */}
      <Card>
        <CardContent>
          <form method="get" action="/admin/orders" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="filtre" value={activeTab} />
            <input type="hidden" name="paiement" value={activePayment} />

            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="q" className="text-sm font-medium text-gray-700">
                Rechercher
              </label>
              <input
                id="q"
                type="search"
                name="q"
                defaultValue={filters.search}
                placeholder="Nom, téléphone, n° de commande"
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="periode" className="text-sm font-medium text-gray-700">
                Période
              </label>
              <select
                id="periode"
                name="periode"
                defaultValue={filters.period}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="zone" className="text-sm font-medium text-gray-700">
                Zone
              </label>
              <select
                id="zone"
                name="zone"
                defaultValue={filters.zoneSlug}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">Toutes les zones</option>
                {options.zones.map((zone) => (
                  <option key={zone.id} value={zone.slug}>
                    {zone.name}
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
                {options.drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="paiement" className="text-sm font-medium text-gray-700">
                Paiement
              </label>
              <select
                id="paiement"
                name="paiement"
                defaultValue={activePayment}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                {PAYMENT_TABS.map((tab) => (
                  <option key={tab.key} value={tab.key}>
                    {tab.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="min" className="text-sm font-medium text-gray-700">
                Montant min
              </label>
              <input
                id="min"
                type="number"
                name="min"
                min={0}
                defaultValue={filters.minTotal}
                className="h-10 w-28 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="max" className="text-sm font-medium text-gray-700">
                Montant max
              </label>
              <input
                id="max"
                type="number"
                name="max"
                min={0}
                defaultValue={filters.maxTotal}
                className="h-10 w-28 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <Search aria-hidden="true" className="size-4" />
              Filtrer
            </button>

            <Link
              href="/admin/orders"
              className="inline-flex h-10 items-center px-3 text-sm text-gray-600 hover:underline"
            >
              Réinitialiser
            </Link>
          </form>
        </CardContent>
      </Card>

      {/* Résultats */}
      {result.rows.length === 0 ? (
        <EmptyState
          icon={<Search aria-hidden="true" className="size-6" />}
          title="Aucune commande"
          description="Aucune commande ne correspond à ces filtres. Élargissez la période ou réinitialisez les filtres."
          actionLabel="Réinitialiser les filtres"
          actionHref="/admin/orders"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {result.rows.map((order) => (
            <li key={order.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="text-sm font-bold text-primary hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <OrderStatusBadge status={order.status} />
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </div>

                      <span className="text-sm text-gray-700">
                        {order.customerName ?? "Client invité"}
                        {order.customerPhone ? ` · ${order.customerPhone}` : ""}
                      </span>

                      <span className="text-xs text-gray-500">
                        {[
                          new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(order.createdAt)),
                          order.quarter,
                          order.zoneName ? `zone ${order.zoneName}` : null,
                          order.driverName ? `livreur ${order.driverName}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>

                      {order.deliveryStatus ? (
                        <span className="text-xs text-gray-500">
                          {`Livraison : ${order.deliveryStatus}`}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-lg font-bold text-gray-900">
                        {formatPrice(order.total)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {getPaymentStatusLabel(order.paymentStatus)}
                      </span>
                    </div>
                  </div>

                  <OrderRowActions
                    orderId={order.id}
                    status={order.status}
                    deliveryId={order.deliveryId}
                    deliveryStatus={order.deliveryStatus}
                    drivers={options.drivers}
                    zones={options.zones}
                    canConfirm={permissions.confirm}
                    canPrepare={permissions.prepare}
                    canCancel={permissions.cancel}
                    canAssign={permissions.assign}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        buildHref={(page) =>
          buildUrl(params, { page: page > 1 ? String(page) : "" })
        }
        label="Pagination des commandes"
      />
    </div>
  );
}
