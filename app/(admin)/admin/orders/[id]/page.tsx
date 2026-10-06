import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  History,
  MapPin,
  Package,
  ScrollText,
  Truck,
  User,
} from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { getAdminOrderDetail } from "@/lib/data/admin/order-detail";
import { listAdminOrderFilterOptions } from "@/lib/data/admin/orders";
import { formatPrice } from "@/lib/services/pricing";
import { getOrderStatusLabel, getPaymentStatusLabel } from "@/lib/services/orders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { OrderRowActions } from "@/app/(admin)/admin/orders/order-row-actions";

export const metadata = {
  title: "Détail de la commande",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: "Commande créée",
  ORDER_CONFIRMED: "Commande confirmée",
  ORDER_CANCELLED: "Commande annulée",
  ORDER_STATUS_CHANGED: "Statut modifié",
  DELIVERY_ASSIGNED: "Livraison affectée",
  CASH_COLLECTED: "Encaissement enregistré",
};

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Détail d'une commande en administration.
 *
 * Aucun élément de cet écran n'est modifiable directement : toute action passe
 * par une server action qui revalide le rôle, l'état de la commande et journalise
 * l'opération. L'historique est en lecture seule — il ne peut pas être réécrit
 * silencieusement.
 */
export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;
  const profile = await guardPage([PERMISSIONS.ORDER_READ]);

  const [detail, options] = await Promise.all([
    getAdminOrderDetail(id),
    listAdminOrderFilterOptions(),
  ]);

  if (!detail) notFound();

  const { order, items, history, delivery, collections, audit } = detail;
  const address = order.address_snapshot;
  const role = profile.role;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/orders"
        className="inline-flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Retour aux commandes
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{order.order_number}</h1>
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.payment_status} />
          </div>
          <p className="text-sm text-gray-500">
            {`Reçue le ${formatDateTime(order.created_at)} — mise à jour le ${formatDateTime(
              order.updated_at
            )}`}
          </p>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-2xl font-bold text-gray-900">
            {formatPrice(order.total)}
          </span>
          <span className="text-xs text-gray-500">
            {getPaymentStatusLabel(order.payment_status)}
          </span>
        </div>
      </header>

      {/* Actions contextuelles */}
      <Card>
        <CardContent>
          <OrderRowActions
            orderId={order.id}
            status={order.status}
            deliveryId={delivery?.id ?? null}
            deliveryStatus={delivery?.status ?? null}
            drivers={options.drivers}
            zones={options.zones}
            canConfirm={can(role, PERMISSIONS.ORDER_CONFIRM)}
            canPrepare={can(role, PERMISSIONS.ORDER_PREPARE)}
            canCancel={can(role, PERMISSIONS.ORDER_CANCEL)}
            canAssign={can(role, PERMISSIONS.ORDER_ASSIGN_DELIVERY)}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Client */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User aria-hidden="true" className="size-4" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p className="font-medium text-gray-900">{address.full_name}</p>
            {address.phone ? (
              <a
                href={`tel:${address.phone.replace(/[^\d+]/g, "")}`}
                className="font-medium text-primary hover:underline"
              >
                {address.phone}
              </a>
            ) : null}
            {order.customer_id ? (
              <Link
                href={`/admin/customers/${order.customer_id}`}
                className="text-sm text-primary hover:underline"
              >
                Voir la fiche client
              </Link>
            ) : (
              <p className="text-xs text-gray-500">Commande passée sans compte.</p>
            )}
          </CardContent>
        </Card>

        {/* Adresse */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin aria-hidden="true" className="size-4" />
              Adresse de livraison
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-gray-700">
            <p>
              {address.quarter}
              {address.sector ? `, ${address.sector}` : ""} — {address.city}
            </p>
            <p className="font-medium text-gray-900">{address.landmark}</p>
            {address.instructions ? <p>{address.instructions}</p> : null}
            <p className="text-xs text-gray-500">{`Code : ${address.address_code}`}</p>
            {order.notes ? (
              <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                {`Note du client : ${order.notes}`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Lignes et montants — snapshots figés */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package aria-hidden="true" className="size-4" />
            Articles commandés
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y divide-gray-100">
            {items.map((item) => {
              const attributes =
                item.variant_attributes && typeof item.variant_attributes === "object"
                  ? Object.entries(item.variant_attributes as Record<string, string>)
                      .filter(([, value]) => Boolean(value))
                      .map(([key, value]) => `${key} : ${value}`)
                      .join(" · ")
                  : "";

              return (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-gray-900">
                      {item.product_name}
                    </span>
                    {attributes ? (
                      <span className="text-xs text-gray-500">{attributes}</span>
                    ) : null}
                    <span className="text-xs text-gray-500">{`SKU ${item.sku}`}</span>
                    <span className="text-xs text-gray-500">
                      {`${formatPrice(item.unit_price)} × ${item.quantity}`}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-gray-900">
                    {formatPrice(item.line_total)}
                  </span>
                </li>
              );
            })}
          </ul>

          <dl className="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Sous-total</dt>
              <dd className="text-gray-900">{formatPrice(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Livraison</dt>
              <dd className="text-gray-900">
                {order.delivery_fee === 0 ? "Offerte" : formatPrice(order.delivery_fee)}
              </dd>
            </div>
            {order.discount > 0 ? (
              <div className="flex justify-between">
                <dt className="text-gray-500">Remise</dt>
                <dd className="text-green-700">-{formatPrice(order.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold">
              <dt className="text-gray-900">Total</dt>
              <dd className="text-gray-900">{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Livraison et encaissement */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck aria-hidden="true" className="size-4" />
              Livraison
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!delivery ? (
              <EmptyState
                icon={<Truck aria-hidden="true" className="size-6" />}
                title="Aucune livraison"
                description="Cette commande n'a pas encore de livraison. Affectez un livreur pour la lancer."
              />
            ) : (
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Statut</dt>
                  <dd className="font-medium text-gray-900">{delivery.status}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Livreur</dt>
                  <dd className="text-gray-900">{detail.driverName ?? "Non affecté"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Zone</dt>
                  <dd className="text-gray-900">{detail.zoneName ?? "Non définie"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Affectée le</dt>
                  <dd className="text-gray-900">{formatDateTime(delivery.assigned_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Livrée le</dt>
                  <dd className="text-gray-900">{formatDateTime(delivery.delivered_at)}</dd>
                </div>
                {delivery.failure_reason ? (
                  <div className="mt-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                    {`Échec : ${delivery.failure_reason}${
                      delivery.failure_notes ? ` — ${delivery.failure_notes}` : ""
                    }`}
                  </div>
                ) : null}
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote aria-hidden="true" className="size-4" />
              Encaissement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Montant attendu</dt>
                <dd className="font-medium text-gray-900">
                  {formatPrice(order.total)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Reste à encaisser</dt>
                <dd
                  className={`font-bold ${
                    detail.outstanding > 0 ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {formatPrice(detail.outstanding)}
                </dd>
              </div>
            </dl>

            {collections.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 text-sm">
                {collections.map((entry) => (
                  <li key={entry.id} className="flex flex-col">
                    <span className="flex justify-between">
                      <span className="text-gray-700">
                        {`${formatPrice(entry.collectedAmount)} (espèces)`}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDateTime(entry.collectedAt)}
                      </span>
                    </span>
                    {entry.discrepancyReason ? (
                      <span className="text-xs text-amber-700">
                        {`Écart : ${entry.discrepancyReason}`}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-gray-500">
                Aucun encaissement enregistré pour l&apos;instant.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline — lecture seule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History aria-hidden="true" className="size-4" />
            Historique
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun changement de statut enregistré.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5 border-l-2 border-gray-200 pl-3">
                  <span className="text-sm font-medium text-gray-900">
                    {getOrderStatusLabel(entry.status)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDateTime(entry.created_at)}
                  </span>
                  {entry.notes ? (
                    <span className="text-xs text-gray-600">{entry.notes}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs text-gray-400">
            L&apos;historique ne peut pas être modifié : il est écrit à chaque transition
            d&apos;état.
          </p>
        </CardContent>
      </Card>

      {/* Audit */}
      {can(role, PERMISSIONS.AUDIT_READ) && audit.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollText aria-hidden="true" className="size-4" />
              Journal d&apos;audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-gray-100">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5 py-2.5">
                  <span className="text-sm font-medium text-gray-900">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </span>
                  <span className="text-xs text-gray-500">
                    {`${entry.actor_role ?? "système"} — ${formatDateTime(entry.created_at)}`}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}