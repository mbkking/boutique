import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Package,
  ShoppingBag,
  Truck,
  Users,
  XCircle,
} from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getAdminDashboardStats,
  getAdminDailySeries,
  getAdminVisitsStats,
  listRecentOrders,
  listStockAlerts,
} from "@/lib/data/admin/dashboard";
import { listAdminAudit } from "@/lib/data/admin/catalog";
import { BarChart } from "@/components/admin/bar-chart";
import { formatPrice } from "@/lib/services/pricing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { ShareButton } from "@/components/store/share-button";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";

export const metadata = {
  title: "Tableau de bord",
  robots: { index: false, follow: false },
};

/** Rendue à la demande : les indicateurs reflètent l'activité du moment. */
export const dynamic = "force-dynamic";

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

interface Kpi {
  label: string;
  value: string;
  icon: typeof Package;
  tone: string;
  href: string;
}

/**
 * Tableau de bord d'administration.
 *
 * Tous les indicateurs proviennent d'agrégats calculés en base (migration 005).
 * Aucun chiffre n'est estimé ni codé en dur : si l'agrégat est indisponible, il
 * vaut zéro et l'écran le reflète plutôt que d'afficher une valeur inventée.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawPeriod = typeof params.periode === "string" ? params.periode : "7";
  const periodDays = rawPeriod === "30" ? 30 : rawPeriod === "90" ? 90 : 7;

  // Un droit suffit �� consulter le tableau de bord ; chaque indicateur affichǸ
  // est ensuite filtrǸ selon les droits du ré�le.
  const profile = await guardPage([
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.PRODUCT_READ,
  ]);

  const [stats, recentOrders, stockAlerts, dailySeries, visitsStats, recentActivity] =
    await Promise.all([
      getAdminDashboardStats(),
      listRecentOrders(8),
      listStockAlerts(6),
      getAdminDailySeries(periodDays),
      getAdminVisitsStats(),
      listAdminAudit({ limit: 8 }),
    ]);

  const seriesLabels = dailySeries.map((point) =>
    new Date(point.day).toLocaleDateString("fr-FR", {
      month: periodDays > 7 ? "2-digit" : undefined,
      weekday: periodDays > 7 ? undefined : "short",
      day: periodDays > 7 ? "2-digit" : undefined,
    })
  );
  const activityLabels: Record<string, string> = {
    ORDER_CREATED: "Nouvelle commande",
    ORDER_CONFIRMED: "Commande confirmée",
    ORDER_CANCELLED: "Commande annulée",
    ORDER_STATUS_CHANGED: "Statut de commande modifié",
    PRODUCT_CREATED: "Produit cré�",
    PRODUCT_UPDATED: "Produit modifié",
    STOCK_ADJUSTED: "Stock ajusté",
    STOCK_RECEIVED: "Réception de stock",
    STOCK_THRESHOLD_UPDATED: "Seuil de stock modifié",
    DELIVERY_ASSIGNED: "Livraison assignée",
    DELIVERY_RESCHEDULED: "Livraison reportée",
    DELIVERY_RETURNED: "Livraison retournée",
    CASH_COLLECTED: "Encaissement enregistré",
    COUPON_CREATED: "Code promo cré�",
    COUPON_UPDATED: "Code promo modifié",
    SETTINGS_UPDATED: "Paramètres modifiés",
    USER_ROLE_CHANGED: "Rôle utilisateur modifié",
    DRIVER_INVITED: "Livreur invité",
    ORDERS_EXPORTED: "Export de commandes",
  };

  const kpis: Kpi[] = [
    {
      label: "Commandes du jour",
      value: String(stats.ordersToday),
      icon: ShoppingBag,
      tone: "bg-primary-50 text-primary-light",
      href: "/admin/orders",
    },
    {
      label: "À confirmer",
      value: String(stats.ordersToConfirm),
      icon: ClipboardList,
      tone: "bg-amber-50 text-amber-700",
      href: "/admin/orders?filtre=a-confirmer",
    },
    {
      label: "En préparation",
      value: String(stats.ordersPreparing),
      icon: Package,
      tone: "bg-indigo-50 text-indigo-700",
      href: "/admin/orders?filtre=en-preparation",
    },
    {
      label: "Livraisons en cours",
      value: String(stats.deliveriesInProgress),
      icon: Truck,
      tone: "bg-green-50 text-green-700",
      href: "/admin/deliveries",
    },
    {
      label: "Livraisons échouées",
      value: String(stats.deliveriesFailed),
      icon: XCircle,
      tone: "bg-red-50 text-red-700",
      href: "/admin/deliveries",
    },
    {
      label: "Terminées aujourd'hui",
      value: String(stats.ordersCompletedToday),
      icon: CheckCircle2,
      tone: "bg-gray-100 text-gray-700",
      href: "/admin/orders?filtre=livrees",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/*
        Le tableau de bord est un compteur : il n'a de valeur que s'il se
        recalcule. L'événement ne sert que de signal, la vérité reste la
        requête serveur relue après réception.
      */}
      <RealtimeRefresh bindings={[{ table: "orders" }, { table: "deliveries" }]} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-sm text-gray-500">
            {`Activité en direct — ${stats.ordersToday} commande${
              stats.ordersToday > 1 ? "s" : ""
            } aujourd'hui.`}
          </p>
        </div>

        <ShareButton
          title="Tableau de bord"
          text={`${stats.ordersToday} commande(s) aujourd'hui, chiffre d'affaires : ${formatPrice(
            stats.revenueToday
          )}.`}
          variant="outline"
        />
      </div>

      <div className="flex gap-2 text-sm">
        {[7, 30, 90].map((days) => (
          <Link
            key={days}
            href={`/admin?periode=${days}`}
            className={`rounded-full px-3 py-1 ${
              periodDays === days
                ? "bg-primary text-surface"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {`${days} jours`}
          </Link>
        ))}
      </div>

      {/* Indicateurs */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <li key={kpi.label}>
            <Link href={kpi.href} className="block h-full">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-2 p-4">
                  <span
                    aria-hidden="true"
                    className={`flex size-9 items-center justify-center rounded-lg ${kpi.tone}`}
                  >
                    <kpi.icon className="size-4" />
                  </span>
                  <span className="text-2xl font-bold text-gray-900">{kpi.value}</span>
                  <span className="text-xs text-gray-500">{kpi.label}</span>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {/* Montants */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <Banknote aria-hidden="true" className="size-3.5" />
              Chiffre d&apos;affaires du jour
            </span>
            <span className="text-xl font-bold text-gray-900">
              {formatPrice(stats.revenueToday)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <CheckCircle2 aria-hidden="true" className="size-3.5 text-success" />
              Montant encaissé
            </span>
            <span className="text-xl font-bold text-gray-900">
              {formatPrice(stats.amountCollected)}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="flex items-center gap-2 text-xs text-gray-500">
              <AlertTriangle aria-hidden="true" className="size-3.5 text-warning" />
              Reste à encaisser
            </span>
            <span className="text-xl font-bold text-gray-900">
              {formatPrice(stats.amountExpected)}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span>{`${stats.productsTotal} produits au catalogue`}</span>
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1">
          <Users aria-hidden="true" className="size-3.5" />
          {`${stats.customersTotal} clients`}
        </span>
        <span aria-hidden="true">·</span>
        <span>{`${stats.deliveriesToday} livraison(s) affectée(s) aujourd'hui`}</span>
        {stats.ordersCancelledToday > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-red-600">
              {`${stats.ordersCancelledToday} annulation(s) aujourd'hui`}
            </span>
          </>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-gray-500">Visites aujourd&apos;hui</span>
            <span className="text-xl font-bold text-gray-900">{visitsStats.visitsToday}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-gray-500">Visites (7 jours)</span>
            <span className="text-xl font-bold text-gray-900">{visitsStats.visitsWeek}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-gray-500">Visiteurs uniques (7 jours)</span>
            <span className="text-xl font-bold text-gray-900">{visitsStats.uniqueSessionsWeek}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-gray-500">Visites ce mois</span>
            <span className="text-xl font-bold text-gray-900">{visitsStats.visitsMonth}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <BarChart
              title={`Chiffre d'affaires des ${periodDays} derniers jours`}
              points={dailySeries.map((point, index) => ({
                label: seriesLabels[index] ?? "",
                value: point.revenue,
              }))}
              formatValue={(value) => formatPrice(value)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <BarChart
              title={`Commandes des ${periodDays} derniers jours`}
              points={dailySeries.map((point, index) => ({
                label: seriesLabels[index] ?? "",
                value: point.orders,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <BarChart
              title="Livraisons terminées"
              points={dailySeries.map((point, index) => ({
                label: seriesLabels[index] ?? "",
                value: point.deliveriesCompleted,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <BarChart
              title="Visites du site"
              points={dailySeries.map((point, index) => ({
                label: seriesLabels[index] ?? "",
                value: point.visits,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activité récente</CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune activité enregistrée.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {recentActivity.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-gray-900">
                    {activityLabels[entry.action] ?? entry.action}
                    {entry.actorName ? ` — ${entry.actorName}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Dernières commandes */}
        <Card>
          <CardHeader>
            <CardTitle>Dernières commandes</CardTitle>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag aria-hidden="true" className="size-6" />}
                title="Aucune commande"
                description="Les commandes reçues apparaîtront ici."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-gray-100">
                {recentOrders.map((order) => (
                  <li
                    key={order.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          {order.orderNumber}
                        </span>
                        <OrderStatusBadge status={order.status} />
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </div>
                      <span className="truncate text-xs text-gray-500">
                        {[
                          order.customerName,
                          order.quarter,
                          formatDateTime(order.createdAt),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-bold text-gray-900">
                        {formatPrice(order.total)}
                      </span>
                      <Link href={`/admin/orders/${order.id}`}>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                          Ouvrir
                          <ArrowRight aria-hidden="true" className="size-3.5" />
                        </span>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Alertes stock */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle aria-hidden="true" className="size-4 text-warning" />
              Alertes de stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.variantsOutOfStock === 0 && stockAlerts.length === 0 ? (
              <EmptyState
                icon={<Package aria-hidden="true" className="size-6" />}
                title="Aucune alerte"
                description="Tous les articles actifs sont au-dessus de leur seuil de réapprovisionnement."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {stats.variantsOutOfStock > 0 ? (
                  <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    {`${stats.variantsOutOfStock} variante(s) épuisée(s)${
                      stats.productsOutOfStock > 0
                        ? ` — ${stats.productsOutOfStock} produit(s) totalement en rupture.`
                        : "."
                    }`}
                  </p>
                ) : null}

                {stockAlerts.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-gray-100">
                    {stockAlerts.map((alert) => (
                      <li
                        key={alert.variantId}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium text-gray-900">
                            {alert.productName}
                          </span>
                          <span className="text-xs text-gray-500">{alert.sku}</span>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            alert.available <= 0
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {alert.available <= 0
                            ? "Épuisé"
                            : `${alert.available} restant(s)`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <Link href="/admin/inventory" className="w-fit">
                  <Button variant="outline" size="sm">
                    Gérer le stock
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-gray-400">
        {`Consulté par ${profile.full_name} — les indicateurs reflètent la base au moment de l'affichage.`}
      </p>
    </div>
  );
}
