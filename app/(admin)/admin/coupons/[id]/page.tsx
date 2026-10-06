import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ticket } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  couponStatusLabel,
  getCouponById,
  listCouponScopeOptions,
  listCouponUsage,
} from "@/lib/services/coupons";
import { formatPrice } from "@/lib/services/pricing";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CouponForm } from "@/app/(admin)/admin/coupons/coupon-form";

export const metadata = {
  title: "Modifier le coupon",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

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

export default async function AdminCouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Écriture exigée : la lecture seule est couverte par le layout de section.
  await guardPage([PERMISSIONS.SETTINGS_WRITE]);

  const [coupon, options] = await Promise.all([
    getCouponById(id),
    listCouponScopeOptions(),
  ]);

  if (!coupon) notFound();

  const status = couponStatusLabel(coupon);
  const usage = await listCouponUsage(coupon.id);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/coupons"
        className="inline-flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Retour aux coupons
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{coupon.code}</h1>
          <Badge variant={TONE_VARIANT[status.tone] ?? "neutral"}>{status.label}</Badge>
          <Badge variant="info">
            {coupon.discount_type === "PERCENTAGE"
              ? `${coupon.discount_value} %`
              : formatPrice(coupon.discount_value)}
          </Badge>
        </div>

        <p className="text-sm text-gray-500">
          {[
            coupon.description,
            `créé le ${formatDate(coupon.created_at)}`,
            `${coupon.used_count} utilisation(s)${
              coupon.max_uses !== null ? ` / ${coupon.max_uses}` : ""
            }`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <CouponForm
        mode="edit"
        categories={options.categories}
        products={options.products}
        initial={{
          id: coupon.id,
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discount_type,
          discountValue: coupon.discount_value,
          minOrderAmount: coupon.min_order_amount,
          maxDiscountAmount: coupon.max_discount_amount,
          startsAt: coupon.starts_at,
          expiresAt: coupon.expires_at,
          maxUses: coupon.max_uses,
          maxUsesPerUser: coupon.max_uses_per_user,
          isActive: coupon.is_active,
          scopeType: coupon.applies_to_product_id
            ? "product"
            : coupon.applies_to_category_id
              ? "category"
              : "all",
          appliesToCategoryId: coupon.applies_to_category_id,
          appliesToProductId: coupon.applies_to_product_id,
        }}
      />

      <section aria-labelledby="coupon-usage" className="flex flex-col gap-3">
        <h2 id="coupon-usage" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {`Utilisations (${usage.total})`}
        </h2>

        {usage.entries.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-2 text-sm text-gray-500">
              <Ticket aria-hidden="true" className="size-4" />
              Ce code n&apos;a encore servi à aucune commande.
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {usage.entries.map((entry) => (
              <li key={entry.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-gray-700">
                      {entry.order_id ? (
                        <a
                          href={`/admin/orders/${entry.order_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          Voir la commande
                        </a>
                      ) : (
                        "Commande inconnue"
                      )}
                    </span>
                    <span className="text-xs text-gray-500">
                      {[entry.user_key ?? "identité inconnue", formatDate(entry.created_at)].join(" · ")}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {`-${formatPrice(entry.discount)}`}
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
