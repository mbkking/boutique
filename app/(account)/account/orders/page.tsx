import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { getSessionProfile } from "@/lib/supabase/session";
import { getCustomerByProfileId } from "@/lib/data/account";
import { getOrdersForCustomer, countOrdersByFilter, parseOrderFilter, type OrderFilter } from "@/lib/data/orders";
import { formatPrice } from "@/lib/services/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";
import { AccountSubnav } from "@/app/(account)/account/subnav";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Mes commandes",
  description: "Retrouvez l'historique et le statut de livraison de vos commandes.",
  robots: { index: false, follow: false },
};

/** Rendue à la demande : le statut d'une commande évolue en continu. */
export const revalidate = 0;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

const FILTER_LABELS: Record<OrderFilter, string> = {
  all: "Toutes",
  in_progress: "En cours",
  delivered: "Livrées",
  cancelled: "Annulées",
  returned: "Retournées",
};

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const filter = parseOrderFilter(query.filtre);

  const profile = await getSessionProfile();
  // Pas de session : la page connexion de l'espace client prend le relais.
  if (!profile) redirect("/account");

  const customer = await getCustomerByProfileId(profile.id);
  if (!customer) redirect("/account");

  const [orders, counts] = await Promise.all([
    getOrdersForCustomer(customer.id, filter),
    countOrdersByFilter(customer.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-text sm:text-3xl">Mes commandes</h1>
        <p className="text-sm text-text-muted">
          {`${counts.all} commande${counts.all > 1 ? "s" : ""} au total, dont ${counts.in_progress} en cours.`}
        </p>
      </header>

      <AccountSubnav />

      <nav aria-label="Filtrer mes commandes">
        <ul className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABELS) as OrderFilter[]).map((key) => (
            <li key={key}>
              <Link
                href={key === "all" ? "/account/orders" : `/account/orders?filtre=${key}`}
                aria-current={filter === key ? "page" : undefined}
                className={cn(
                  "tap-target inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm",
                  filter === key
                    ? "border-primary bg-primary text-white"
                    : "border-border text-text hover:bg-surface-alt"
                )}
              >
                {FILTER_LABELS[key]}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs",
                    filter === key ? "bg-white/20" : "bg-surface-alt text-text-muted"
                  )}
                >
                  {counts[key]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {orders.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/account/orders/${order.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        {order.order_number}
                      </Link>
                      <OrderStatusBadge status={order.status} />
                      <PaymentStatusBadge status={order.payment_status} />
                    </div>
                    <p className="text-xs text-text-muted">
                      {`Passée le ${formatDate(order.created_at)}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-text">
                      {formatPrice(order.total)}
                    </span>
                    <Link href={`/account/orders/${order.id}`}>
                      <Button variant="outline" size="sm">
                        Détails
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<ShoppingBag aria-hidden="true" className="size-6" />}
          title={
            filter === "all"
              ? "Aucune commande pour le moment"
              : `Aucune commande ${FILTER_LABELS[filter].toLowerCase()}`
          }
          description={
            filter === "all"
              ? "Vos commandes apparaîtront ici dès votre premier achat, avec leur statut de livraison et leurs totaux."
              : "Changez de filtre pour voir vos autres commandes."
          }
          actionLabel={filter === "all" ? "Commencer une commande" : "Voir toutes mes commandes"}
          actionHref={filter === "all" ? "/categories" : "/account/orders"}
        />
      )}
    </div>
  );
}