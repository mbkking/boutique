import Link from "next/link";
import { Search, Users } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { listAdminCustomers } from "@/lib/data/admin/catalog";
import { formatPrice } from "@/lib/services/pricing";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPhoneForDisplay } from "@/lib/platform/native";

export const metadata = {
  title: "Clients",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

/**
 * Liste des clients.
 *
 * Principe de minimisation : cette vue n'affiche que ce qui sert à servir une
 * commande — identité, téléphone, volume d'achat. Les adresses ne sont visibles
 * que sur la fiche d'une commande, jamais dans une liste.
 */
export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const profile = await guardPage([PERMISSIONS.CUSTOMER_READ]);

  const search = readParam(params, "q");
  const customers = await listAdminCustomers({ search });
  // Référence figée pour ce rendu : évite un résultat instable entre deux
  // Évaluations du composant (règle de pureté React).
  const referenceTime = Date.parse(new Date().toISOString());

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <p className="text-sm text-gray-500">
          {`${customers.length} client(s) affichÃ©(s).`}
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-gray-500">Clients</span>
              <span className="text-xl font-bold text-gray-900">{customers.length}</span>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-gray-500">Nouveaux (30 jours)</span>
              <span className="text-xl font-bold text-gray-900">
                {
                  customers.filter(
                    (c) => referenceTime - Date.parse(c.createdAt) < 30 * 24 * 60 * 60 * 1000
                  ).length
                }
              </span>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-gray-500">Avec commande</span>
              <span className="text-xl font-bold text-gray-900">
                {customers.filter((c) => c.orderCount > 0).length}
              </span>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-gray-500">CA gÃ©nÃ©rÃ©</span>
              <span className="text-xl font-bold text-gray-900">
                {formatPrice(customers.reduce((sum, c) => sum + c.totalSpent, 0))}
              </span>
            </CardContent>
          </Card>
        </li>
      </ul>

      <Card>
        <CardContent>
          <form method="get" action="/admin/customers" className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="q" className="text-sm font-medium text-gray-700">
                Rechercher
              </label>
              <input
                id="q"
                type="search"
                name="q"
                defaultValue={search}
                placeholder="Nom ou téléphone"
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <Search aria-hidden="true" className="size-4" />
              Rechercher
            </button>

            <Link
              href="/admin/customers"
              className="inline-flex h-10 items-center px-3 text-sm text-gray-600 hover:underline"
            >
              Réinitialiser
            </Link>
          </form>
        </CardContent>
      </Card>

      {customers.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden="true" className="size-6" />}
          title="Aucun client"
          description={
            search === ""
              ? "Aucun client n'a encore commandé avec un compte."
              : `Aucun client ne correspond à « ${search} ».`
          }
          actionLabel="Réinitialiser la recherche"
          actionHref="/admin/customers"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-semibold text-gray-900">
                      {customer.fullName}
                    </span>
                    <a
                      href={`tel:${customer.phone.replace(/[^\d+]/g, "")}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {formatPhoneForDisplay(customer.phone)}
                    </a>
                    <span className="text-xs text-gray-500">
                      {`Client depuis le ${formatDate(customer.createdAt)}${
                        customer.lastOrderAt
                          ? ` · dernière commande le ${formatDate(customer.lastOrderAt)}`
                          : ""
                      }`}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <span className="block text-lg font-bold text-gray-900">
                        {customer.orderCount}
                      </span>
                      <span className="text-xs text-gray-500">commandes</span>
                    </div>
                    <div>
                      <span className="block text-lg font-bold text-gray-900">
                        {formatPrice(customer.totalSpent)}
                      </span>
                      <span className="text-xs text-gray-500">total dépensé</span>
                    </div>
                    {can(profile.role, PERMISSIONS.CUSTOMER_READ) ? (
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Fiche
                      </Link>
                    ) : null}
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