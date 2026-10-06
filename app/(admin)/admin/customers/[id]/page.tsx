import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Package } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import {
  getCustomerStats,
  listAddressesForCustomer,
} from "@/lib/data/account";
import { listAdminOrders } from "@/lib/data/admin/orders";
import { safeQuery, toSingle } from "@/lib/data/safe";
import { formatPrice } from "@/lib/services/pricing";
import { formatPhoneForDisplay } from "@/lib/platform/native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import type { Customer } from "@/types";

export const metadata = {
  title: "Fiche client",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface CustomerPageProps {
  params: Promise<{ id: string }>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

/**
 * Fiche d'un client.
 *
 * Les adresses sont une donnée sensible : elles ne sont affichées qu'aux rôles
 * qui en ont le droit explicite (`CUSTOMER_READ`), et la liste des commandes est
 * limitée à ce client.
 */
export default async function AdminCustomerPage({ params }: CustomerPageProps) {
  const { id } = await params;
  const profile = await guardPage([PERMISSIONS.CUSTOMER_READ]);

  const outcome = await safeQuery("adminCustomer.detail", (supabase) =>
    supabase.from("customers").select("*").eq("id", id).limit(1)
  );
  const customer = toSingle(outcome) as Customer | null;

  if (!customer) {
    // Client inexistant : on renvoie à la liste plutôt que d'afficher une page vide.
    redirect("/admin/customers");
  }

  const [orders, addresses, stats] = await Promise.all([
    listAdminOrders({ customerId: customer.id, page: 1, pageSize: 20 }),
    listAddressesForCustomer(customer.id),
    getCustomerStats(customer.id),
  ]);

  const canSeeAddresses = can(profile.role, PERMISSIONS.CUSTOMER_READ);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/customers"
        className="inline-flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Retour aux clients
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">{customer.full_name}</h1>
        <p className="text-sm text-gray-500">
          {`${formatPhoneForDisplay(customer.phone)} · client depuis le ${formatDate(
            customer.created_at
          )}`}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Commandes", value: String(stats.orderCount) },
          { label: "Total dépensé", value: formatPrice(stats.totalSpent) },
          { label: "Dernière commande", value: stats.lastOrderAt ? formatDate(stats.lastOrderAt) : "—" },
        ].map((tile) => (
          <Card key={tile.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-gray-500">{tile.label}</span>
              <span className="text-lg font-bold text-gray-900">{tile.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Commandes du client */}
      <Card>
        <CardHeader>
          <CardTitle>Commandes</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.rows.length === 0 ? (
            <EmptyState
              icon={<Package aria-hidden="true" className="size-6" />}
              title="Aucune commande"
              description="Ce client n'a pas encore passé de commande."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-gray-100">
              {orders.rows.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <OrderStatusBadge status={order.status} />
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </div>
                    <span className="text-xs text-gray-500">{formatDate(order.createdAt)}</span>
                  </div>

                  <span className="shrink-0 text-sm font-bold text-gray-900">
                    {formatPrice(order.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Adresses : donnée sensible, behind permission */}
      {canSeeAddresses ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin aria-hidden="true" className="size-4" />
              Adresses enregistrées
            </CardTitle>
          </CardHeader>
          <CardContent>
            {addresses.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune adresse enregistrée.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {addresses.map((address) => (
                  <li
                    key={address.id}
                    className="rounded-lg border border-gray-200 p-3 text-sm"
                  >
                    <p className="font-medium text-gray-900">
                      {`${address.quarter}${address.sector ? `, ${address.sector}` : ""}`}
                    </p>
                    <p className="text-gray-600">
                      {address.landmark} — {address.city}
                    </p>
                    <p className="text-xs text-gray-400">{`Code : ${address.address_code}`}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}