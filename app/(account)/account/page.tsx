import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, Package, ShoppingBag, User } from "lucide-react";
import { getSessionEmail, getSessionProfile } from "@/lib/supabase/session";
import {
  getCustomerByProfileId,
  getCustomerStats,
  listAddressesForCustomer,
} from "@/lib/data/account";
import {
  countOrdersByFilter,
  IN_PROGRESS_STATUSES,
  listOrderSummariesForCustomer,
  type OrderSummary,
} from "@/lib/data/orders";
import { formatPrice } from "@/lib/services/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/ui/status-badge";
import { SignInForm } from "@/app/_components/sign-in-form";
import { SignOutButton } from "@/app/_components/sign-out-button";
import { AccountSubnav } from "@/app/(account)/account/subnav";
import type { UserRole } from "@/types";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Mon compte",
  description:
    "Retrouvez vos commandes, vos informations et vos adresses de livraison enregistrées.",
  alternates: { canonical: "/account" },
  robots: { index: false, follow: false },
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrateur",
  order_operator: "Opérateur de commandes",
  stock_manager: "Gestionnaire de stock",
  driver: "Livreur",
  customer: "Client",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

/** Une ligne d'historique : numéro, date, statuts, montant, nombre d'articles. */
function OrderRow({ order }: { order: OrderSummary }) {
  return (
    <Card className="transition-all duration-200 hover:shadow-card-hover">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
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
            {`Passée le ${formatDate(order.created_at)} · ${
              order.items_quantity > 0
                ? `${order.items_quantity} article${
                    order.items_quantity > 1 ? "s" : ""
                  }`
                : "Aucun article"
            }`}
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
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-alt p-4">
      <span className="text-2xl font-bold text-text">{value}</span>
      <span className="text-sm font-medium text-text">{label}</span>
      {hint ? <span className="text-xs text-text-muted">{hint}</span> : null}
    </div>
  );
}

export default async function AccountPage() {
  const profile = await getSessionProfile();

  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-text sm:text-3xl">Mon compte</h1>
          <p className="text-sm text-text-muted">
            Connectez-vous pour retrouver vos commandes et vos adresses de livraison.
          </p>
        </header>

        <div className="bg-hero-pattern rounded-2xl border border-border p-6 sm:p-8">
          <SignInForm />
        </div>
      </div>
    );
  }

  const customer = await getCustomerByProfileId(profile.id);

  if (!customer) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text sm:text-3xl">Mon compte</h1>
            <p className="text-sm text-text-muted">
              {`${profile.full_name} · ${profile.phone}`}
            </p>
          </div>
          <SignOutButton />
        </div>

        <EmptyState
          icon={<User aria-hidden="true" className="size-6" />}
          title="Aucune fiche client associée"
          description="Votre compte n'est pas encore rattaché à une fiche client. Nos équipes finalisent la création de votre fiche : en attendant, vous pouvez commander sans compte et nous vous confirmerons par téléphone."
          actionLabel="Découvrir le catalogue"
          actionHref="/categories"
        />
      </div>
    );
  }

  const [orders, addresses, stats, counts, email] = await Promise.all([
    listOrderSummariesForCustomer(customer.id),
    listAddressesForCustomer(customer.id),
    getCustomerStats(customer.id),
    countOrdersByFilter(customer.id),
    getSessionEmail(),
  ]);

  const inProgressOrders = orders.filter((order) =>
    IN_PROGRESS_STATUSES.includes(order.status)
  );
  const deliveredOrders = orders.filter((order) => order.status === "DELIVERED");
  const closedOrders = orders.filter(
    (order) => order.status === "CANCELLED" || order.status === "RETURNED"
  );
  const defaultAddress = addresses.find((address) => address.is_default) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text sm:text-3xl">Mon compte</h1>
          <p className="text-sm text-text-muted">
            {`${profile.full_name} · ${
              ROLE_LABELS[profile.role] ?? profile.role
            }`}
          </p>
        </div>
        <SignOutButton />
      </div>

      <AccountSubnav current="/account" />

      {/* Informations personnelles */}
      <Card>
        <CardHeader>
          <CardTitle>Mes informations</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">Nom complet</dt>
              <dd className="text-sm font-medium text-text">{customer.full_name}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Adresse e-mail</dt>
              <dd className="text-sm font-medium text-text">
                {email ?? "Non renseignée"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Téléphone</dt>
              <dd className="text-sm font-medium text-text">{customer.phone}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">Client depuis</dt>
              <dd className="text-sm font-medium text-text">
                {formatDate(customer.created_at)}
              </dd>
            </div>
            {defaultAddress ? (
              <div className="sm:col-span-2">
                <dt className="text-sm text-text-muted">
                  Adresse de livraison par défaut
                </dt>
                <dd className="text-sm font-medium text-text">
                  {`${defaultAddress.quarter}${
                    defaultAddress.sector ? `, ${defaultAddress.sector}` : ""
                  } — ${defaultAddress.city}`}
                  {defaultAddress.landmark
                    ? ` · Repère : ${defaultAddress.landmark}`
                    : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {/* Résumé du compte — données réelles des commandes du client */}
      <section aria-labelledby="titre-resume" className="space-y-4">
        <h2 id="titre-resume" className="text-lg font-semibold text-text">
          Résumé de mon compte
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Commandes totales" value={counts.all} />
          <StatTile label="Commandes en cours" value={counts.in_progress} />
          <StatTile
            label="Commandes livrées"
            value={counts.delivered}
            hint="Livraisons terminées"
          />
          <StatTile
            label="Commandes annulées"
            value={counts.cancelled + counts.returned}
            hint={counts.returned > 0 ? `dont ${counts.returned} retournée(s)` : undefined}
          />
        </div>
        <p className="text-sm text-text-muted">
          {`Montant total commandé : ${formatPrice(stats.totalSpent)}${
            stats.lastOrderAt ? ` · Dernière commande le ${formatDate(stats.lastOrderAt)}` : ""
          }`}
        </p>
      </section>

      {/* Commandes en cours */}
      <section aria-labelledby="titre-en-cours" className="space-y-4">
        <h2 id="titre-en-cours" className="text-lg font-semibold text-text">
          Commandes en cours
        </h2>
        {inProgressOrders.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {inProgressOrders.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-border bg-surface-alt p-4 text-sm text-text-muted">
            Aucune commande en cours pour le moment.
          </p>
        )}
      </section>

      {/* Commandes terminées */}
      <section aria-labelledby="titre-terminees" className="space-y-4">
        <h2 id="titre-terminees" className="text-lg font-semibold text-text">
          Commandes terminées
        </h2>
        {deliveredOrders.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {deliveredOrders.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} />
              </li>
            ))}
          </ul>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag aria-hidden="true" className="size-6" />}
            title="Aucune commande pour le moment"
            description="Vos commandes apparaîtront ici dès votre premier achat, avec leur statut de livraison et leurs totaux."
            actionLabel="Commencer une commande"
            actionHref="/categories"
          />
        ) : (
          <p className="rounded-xl border border-border bg-surface-alt p-4 text-sm text-text-muted">
            Aucune commande livrée pour le moment.
          </p>
        )}
      </section>

      {/* Commandes annulées / retournées */}
      {closedOrders.length > 0 ? (
        <section aria-labelledby="titre-annulees" className="space-y-4">
          <h2 id="titre-annulees" className="text-lg font-semibold text-text">
            Commandes annulées ou retournées
          </h2>
          <ul className="flex flex-col gap-3">
            {closedOrders.map((order) => (
              <li key={order.id}>
                <OrderRow order={order} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Adresses enregistrées */}
      <section aria-labelledby="titre-adresses" className="space-y-4">
        <h2 id="titre-adresses" className="text-lg font-semibold text-text">
          Mes adresses
        </h2>

        {addresses.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {addresses.map((address) => (
              <li key={address.id}>
                <Card className="h-full">
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-text">
                        {`${address.quarter}${
                          address.sector ? `, ${address.sector}` : ""
                        }`}
                      </h3>
                      {address.is_default ? (
                        <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary">
                          Par défaut
                        </span>
                      ) : null}
                    </div>

                    <address className="flex flex-col gap-1 text-sm not-italic text-text-muted">
                      <span className="flex items-start gap-2">
                        <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        <span>
                          {address.quarter} — {address.city}
                        </span>
                      </span>
                      <span>{address.landmark}</span>
                      {address.instructions ? <span>{address.instructions}</span> : null}
                      <span className="text-xs">{`Code : ${address.address_code}`}</span>
                    </address>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<MapPin aria-hidden="true" className="size-6" />}
            title="Aucune adresse enregistrée"
            description="Saisissez votre adresse de livraison lors de votre prochaine commande pour gagner du temps."
            actionLabel="Voir le catalogue"
            actionHref="/categories"
          />
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-text-muted">
        <Package aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Besoin d&apos;aide ? Liez-vous à notre équipe par téléphone : nous
          répondons du lundi au samedi.
        </span>
      </p>
    </div>
  );
}
