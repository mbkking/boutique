import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { getSessionProfile } from "@/lib/supabase/session";
import { getCustomerByProfileId } from "@/lib/data/account";
import { getOrderDetailsForCustomer } from "@/lib/data/orders";
import { formatPrice } from "@/lib/services/pricing";
import { getOrderStatusLabel, getPaymentStatusLabel } from "@/lib/services/orders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = {
  title: "Détail de ma commande",
  robots: { index: false, follow: false },
};

export const revalidate = 0;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

/** Libellé lisible d'un attribut de variante, ex. `{ "Taille": "M" }`. */
function describeAttributes(attributes: Record<string, string> | null): string {
  if (!attributes) return "";
  return Object.entries(attributes)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key} : ${value}`)
    .join(" · ");
}

export default async function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = await getSessionProfile();
  if (!profile) redirect("/account");

  const customer = await getCustomerByProfileId(profile.id);
  if (!customer) redirect("/account");

  const details = await getOrderDetailsForCustomer(id, customer.id);

  // Une commande d'un autre client est traitée comme inexistante : on ne
  // confirme pas l'existence d'une commande qui n'appartient pas au visiteur.
  if (!details) notFound();

  const { order, items, history } = details;
  const address = order.address_snapshot;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Retour à mes commandes
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-text sm:text-3xl">
            {order.order_number}
          </h1>
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.payment_status} />
        </div>
        <p className="text-sm text-text-muted">
          {`Commande passée le ${formatDate(order.created_at)}`}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Articles commandés</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const attributes = describeAttributes(item.variant_attributes as Record<string, string> | null);
              return (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-sm font-medium text-text">{item.product_name}</p>
                    {attributes ? (
                      <p className="text-xs text-text-muted">{attributes}</p>
                    ) : null}
                    <p className="text-xs text-text-muted">
                      {`${formatPrice(item.unit_price)} × ${item.quantity}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-text">
                    {formatPrice(item.line_total)}
                  </span>
                </li>
              );
            })}
          </ul>

          <dl className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex justify-between text-sm">
              <dt className="text-text-muted">Sous-total</dt>
              <dd className="text-text">{formatPrice(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-text-muted">Livraison</dt>
              <dd className="text-text">
                {order.delivery_fee === 0
                  ? "Offerte"
                  : formatPrice(order.delivery_fee)}
              </dd>
            </div>
            {order.discount > 0 ? (
              <div className="flex justify-between text-sm">
                <dt className="text-text-muted">Remise</dt>
                <dd className="text-success">-{formatPrice(order.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt className="text-text">Total</dt>
              <dd className="text-text">{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Adresse de livraison</CardTitle>
          </CardHeader>
          <CardContent>
            <address className="flex flex-col gap-1 text-sm not-italic text-text-muted">
              <span className="flex items-start gap-2">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>
                  {address.quarter} — {address.city}
                </span>
              </span>
              {address.sector ? <span>{address.sector}</span> : null}
              <span>{address.landmark}</span>
              {address.instructions ? <span>{address.instructions}</span> : null}
            </address>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paiement</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm text-text-muted">
            <p>{`Mode : paiement à la livraison`}</p>
            <p>{`Statut : ${getPaymentStatusLabel(order.payment_status)}`}</p>
            <p>{`Total à régler : ${formatPrice(order.total)}`}</p>
          </CardContent>
        </Card>
      </div>

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Suivi</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-text">
                    {getOrderStatusLabel(entry.status)}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatDate(entry.created_at)}
                  </span>
                  {entry.notes ? (
                    <span className="text-xs text-text-muted">{entry.notes}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-end">
        <Link href="/account/orders">
          <Button variant="outline">Toutes mes commandes</Button>
        </Link>
      </div>
    </div>
  );
}