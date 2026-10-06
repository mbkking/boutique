import Link from "next/link";
import { Plus, Search, Ticket } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { formatPrice } from "@/lib/services/pricing";
import { couponScopeLabel, couponStatusLabel, listCoupons } from "@/lib/services/coupons";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { CouponRowActions } from "@/app/(admin)/admin/coupons/coupon-row-actions";

export const metadata = {
  title: "Coupons",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

const TONE_VARIANT: Record<string, BadgeVariant> = {
  success: "success",
  warning: "warning",
  neutral: "neutral",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Codes promo.
 *
 * La remise affichée ici est la configuration enregistrée : le montant
 * effectivement accordé est toujours recalculé par `coupon_is_valid`, en base,
 * en tenant compte du panier et de la portée.
 */
export default async function AdminCouponsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const profile = await guardPage([PERMISSIONS.SETTINGS_READ]);

  const filters = {
    search: readParam(params, "q"),
    status: readParam(params, "statut") || "tous",
    type: readParam(params, "type") || "tous",
    page: Math.max(1, Number.parseInt(readParam(params, "page") || "1", 10) || 1),
    pageSize: PAGE_SIZE,
  };

  const result = await listCoupons({
    search: filters.search,
    status: filters.status === "tous" ? undefined : filters.status,
    type: filters.type === "tous" ? undefined : filters.type,
    page: filters.page,
    pageSize: filters.pageSize,
  });

  const canWrite = can(profile.role, PERMISSIONS.SETTINGS_WRITE);

  const buildUrl = (overrides: Record<string, string>): string => {
    const next = new URLSearchParams();
    const merged: Record<string, string> = {
      q: filters.search,
      statut: filters.status === "tous" ? "" : filters.status,
      type: filters.type === "tous" ? "" : filters.type,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/admin/coupons?${query}` : "/admin/coupons";
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
          <p className="text-sm text-gray-500">
            {`${result.totalCount} code${result.totalCount > 1 ? "s" : ""} — page ${result.page} sur ${result.totalPages}.`}
          </p>
        </div>

        {canWrite ? (
          <Link
            href="/admin/coupons/new"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
          >
            <Plus aria-hidden="true" className="size-4" />
            Nouveau code
          </Link>
        ) : null}
      </header>

      {/* Filtres */}
      <Card>
        <CardContent>
          <form method="get" action="/admin/coupons" className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <label htmlFor="q" className="text-sm font-medium text-gray-700">
                Rechercher
              </label>
              <input
                id="q"
                type="search"
                name="q"
                defaultValue={filters.search}
                placeholder="Code"
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
                <option value="tous">Tous</option>
                <option value="actifs">Actifs</option>
                <option value="inactifs">Inactifs</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="type" className="text-sm font-medium text-gray-700">
                Type de remise
              </label>
              <select
                id="type"
                name="type"
                defaultValue={filters.type}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="tous">Tous</option>
                <option value="percentage">Pourcentage</option>
                <option value="fixed">Montant fixe</option>
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
            >
              <Search aria-hidden="true" className="size-4" />
              Filtrer
            </button>

            <Link
              href="/admin/coupons"
              className="inline-flex h-10 items-center px-3 text-sm text-gray-600 hover:underline"
            >
              Réinitialiser
            </Link>
          </form>
        </CardContent>
      </Card>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={<Ticket aria-hidden="true" className="size-6" />}
          title="Aucun code promo"
          description="Créez un code pour offrir une remise, limitée à la boutique, à une catégorie ou à un produit."
          actionLabel={canWrite ? "Créer un code" : undefined}
          actionHref={canWrite ? "/admin/coupons/new" : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {result.rows.map((coupon) => {
            const status = couponStatusLabel(coupon);

            return (
              <li key={coupon.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/coupons/${coupon.id}`}
                            className="text-sm font-bold text-primary hover:underline"
                          >
                            {coupon.code}
                          </Link>
                          <Badge variant={TONE_VARIANT[status.tone] ?? "neutral"}>
                            {status.label}
                          </Badge>
                          <Badge variant="info">
                            {couponScopeLabel(coupon, {
                              categoryName: coupon.categories?.name,
                              productName: coupon.products?.name,
                            })}
                          </Badge>
                        </div>

                        {coupon.description ? (
                          <span className="text-xs text-gray-500">{coupon.description}</span>
                        ) : null}

                        <span className="text-xs text-gray-500">
                          {[
                            `Valide du ${formatDate(coupon.starts_at)}`,
                            coupon.expires_at
                              ? `au ${formatDate(coupon.expires_at)}`
                              : "sans date de fin",
                            coupon.min_order_amount > 0
                              ? `minimum ${formatPrice(coupon.min_order_amount)}`
                              : null,
                            `${coupon.used_count} utilisation(s)${
                              coupon.max_uses !== null ? ` / ${coupon.max_uses}` : ""
                            }`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="text-lg font-bold text-gray-900">
                          {coupon.discount_type === "PERCENTAGE"
                            ? `-${coupon.discount_value} %`
                            : `-${formatPrice(coupon.discount_value)}`}
                        </span>
                        <span className="text-xs text-gray-500">
                          {coupon.discount_type === "PERCENTAGE"
                            ? coupon.max_discount_amount
                              ? `plafonné à ${formatPrice(coupon.max_discount_amount)}`
                              : "du montant éligible"
                            : "montant fixe"}
                        </span>
                      </div>
                    </div>

                    <CouponRowActions
                      couponId={coupon.id}
                      code={coupon.code}
                      isActive={coupon.is_active}
                      canWrite={canWrite}
                    />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        buildHref={(page) => buildUrl({ page: String(page) })}
        label="Pagination des coupons"
      />
    </div>
  );
}
