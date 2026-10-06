import type { Metadata } from "next";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  MapPin,
  PackageSearch,
  Truck,
  Wallet,
} from "lucide-react";
import { getOrderByNumber } from "@/lib/data/orders";
import { getOrderStatusLabel } from "@/lib/services/orders";
import { formatPrice } from "@/lib/services/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/ui/status-badge";

interface OrderTrackingPageProps {
  params: Promise<{ id: string }>;
}


/**
 * Rendue à la demande : la disponibilité des articles et des frais de livraison
 * doivent toujours refléter la base au moment de la visite.
 */
export const revalidate = 0;

export async function generateMetadata({
  params,
}: OrderTrackingPageProps): Promise<Metadata> {
  const { id } = await params;
  const details = await getOrderByNumber(decodeURIComponent(id));

  if (!details) {
    return {
      title: "Suivi de commande",
      description: "Suivez l'avancement de votre commande.",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Suivi de la commande ${details.order.order_number}`,
    description: `État de la commande ${details.order.order_number} : ${getOrderStatusLabel(
      details.order.status
    )}.`,
    // Le suivi est privé : il ne doit jamais apparaître dans un moteur de
    // recherche, même si le numéro de commande devinait être deviné.
    robots: { index: false, follow: false },
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

/**
 * Suivi d'une commande par son numéro.
 *
 * Le numéro de commande est le seul moyen d'accès : aucune authentification
 * n'est requise, ce qui permet à un client invité de suivre sa commande.
 */
export default async function OrderTrackingPage({ params }: OrderTrackingPageProps) {
  const { id } = await params;
  const orderNumber = decodeURIComponent(id);
  const details = await getOrderByNumber(orderNumber);

  // Numéro inconnu : on affiche la page 404 plutôt que de révéler si une
  // commande existe ou si la base est momentanément injoignable.
  if (!details) notFound();

  const { order, items, history } = details;
  const address = order.address_snapshot;
  const isCancelled = order.status === "CANCELLED";
  const isDelivered = order.status === "DELIVERED";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      {/* Le client voit l'avancement de sa commande sans recharger la page. */}
      <RealtimeRefresh
        bindings={[
          { table: "orders", filter: `id=eq.${order.id}` },
          { table: "deliveries" },
        ]}
      />

      <nav aria-label="Fil d'Ariane">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-text-muted">
          <li>
            <Link href="/" className="hover:text-primary">
              Accueil
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-4" />
          <li aria-current="page" className="font-medium text-text">
            Suivi de commande
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-3">
        <p className="text-sm text-text-muted">Commande</p>
        <h1 className="text-2xl font-bold text-text sm:text-3xl">{order.order_number}</h1>
        <p className="text-sm text-text-muted">
          {`Passée le ${formatDate(order.created_at)}`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.payment_status} />
        </div>
      </header>

      {isDelivered ? (
        <div className="flex items-start gap-3 rounded-xl border border-success bg-success/5 p-4">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          <p className="text-sm text-text">
            Votre commande a été livrée. Merci de votre confiance ! Si un article ne
            vous convient pas, contactez-nous dans les meilleurs délais.
          </p>
        </div>
      ) : isCancelled ? (
        <div className="flex items-start gap-3 rounded-xl border border-danger bg-danger/5 p-4">
          <PackageSearch aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
          <p className="text-sm text-text">
            Cette commande a été annulée. Si vous ne savez pas pourquoi, appelez-nous :
            nous vous expliquerons et la relancerons si vous le souhaitez.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-alt p-4">
          <Truck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm text-text-muted">
            Votre commande est en cours de traitement. Nous vous appelons pour
            confirmer la disponibilité des articles et convenir du créneau de
            livraison.
          </p>
        </div>
      )}

      {/* Avancement */}
      <section aria-labelledby="titre-avancement">
        <Card>
          <CardHeader>
            <CardTitle id="titre-avancement">Avancement de la commande</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-text-muted">
                L&apos;historique de cette commande n&apos;est pas encore disponible.
              </p>
            ) : (
              <ol className="flex flex-col gap-0">
                {[...history].reverse().map((entry, index) => {
                  const isLast = index === 0;
                  return (
                    <li key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span
                          aria-hidden="true"
                          className={
                            isLast
                              ? "mt-1 size-3 shrink-0 rounded-full bg-primary ring-4 ring-primary/20"
                              : "mt-1 size-3 shrink-0 rounded-full bg-border"
                          }
                        />
                        {index < history.length - 1 ? (
                          <span aria-hidden="true" className="w-px flex-1 bg-border" />
                        ) : null}
                      </div>

                      <div className="flex-1 pb-5">
                        <p className="text-sm font-medium text-text">
                          {getOrderStatusLabel(entry.status)}
                          {isLast ? (
                            <span className="ml-2 text-xs font-normal text-text-muted">
                              étape en cours
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatDate(entry.created_at)}
                        </p>
                        {entry.notes ? (
                          <p className="mt-1 text-xs text-text-muted">{entry.notes}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Articles */}
      <section aria-labelledby="titre-articles">
        <Card>
          <CardHeader>
            <CardTitle id="titre-articles">Articles commandés</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {items.map((item) => {
                const attributes = Object.entries(item.variant_attributes ?? {});
                return (
                  <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="flex min-w-0 flex-col">
                      <p className="text-sm font-medium text-text">{item.product_name}</p>
                      {attributes.length > 0 ? (
                        <p className="text-xs text-text-muted">
                          {attributes.map(([key, value]) => `${key} : ${value}`).join(", ")}
                        </p>
                      ) : null}
                      <p className="text-xs text-text-muted">
                        {`${item.quantity} × ${formatPrice(item.unit_price)}`}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-text">
                      {formatPrice(item.line_total)}
                    </p>
                  </li>
                );
              })}
            </ul>

            <dl className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-text-muted">Sous-total</dt>
                <dd className="font-medium text-text">{formatPrice(order.subtotal)}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt className="text-text-muted">Frais de livraison</dt>
                <dd className="font-medium text-text">
                  {order.delivery_fee === 0
                    ? "Offerts"
                    : formatPrice(order.delivery_fee)}
                </dd>
              </div>
              {order.discount > 0 ? (
                <div className="flex items-baseline justify-between">
                  <dt className="text-text-muted">Remise</dt>
                  <dd className="font-medium text-success">
                    {`-${formatPrice(order.discount)}`}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between border-t border-border pt-2">
                <dt className="font-semibold text-text">Total</dt>
                <dd className="text-lg font-bold text-text">{formatPrice(order.total)}</dd>
              </div>
              <p className="text-xs text-text-muted">Montant en {order.currency}.</p>
            </dl>

            <p className="mt-4 flex items-start gap-2 rounded-lg bg-surface-alt p-3 text-xs text-text-muted">
              <Wallet aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                Paiement à la livraison en espèces. Le montant de{" "}
                {formatPrice(order.total)} est à régler au livreur lors de la
                remise du colis.
              </span>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Adresse */}
      <section aria-labelledby="titre-adresse">
        <Card>
          <CardHeader>
            <CardTitle id="titre-adresse">Adresse de livraison</CardTitle>
          </CardHeader>
          <CardContent>
            <address className="flex flex-col gap-1 text-sm not-italic text-text">
              <span className="font-medium">{address.full_name}</span>
              <span>{address.phone}</span>
              <span className="flex items-start gap-2">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  {address.quarter}
                  {address.sector ? `, ${address.sector}` : ""} — {address.city}
                </span>
              </span>
              <span>{address.landmark}</span>
              {address.instructions ? (
                <span className="text-text-muted">{address.instructions}</span>
              ) : null}
              {address.address_code ? (
                <span className="text-xs text-text-muted">
                  {`Code de livraison : ${address.address_code}`}
                </span>
              ) : null}
            </address>

            {order.notes ? (
              <p className="mt-4 rounded-lg bg-surface-alt p-3 text-sm text-text-muted">
                {`Votre message : ${order.notes}`}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/categories">
          <Button variant="primary" size="lg">
            Continuer mes achats
          </Button>
        </Link>
        <Link href="/">
          <Button variant="outline" size="lg">
            Retour à l&apos;accueil
          </Button>
        </Link>
      </div>
    </div>
  );
}
