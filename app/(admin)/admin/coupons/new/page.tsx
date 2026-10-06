import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listCouponScopeOptions } from "@/lib/services/coupons";
import { CouponForm } from "@/app/(admin)/admin/coupons/coupon-form";

export const metadata = {
  title: "Nouveau coupon",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewCouponPage() {
  // Écriture exigée : la lecture seule est couverte par le layout de section.
  await guardPage([PERMISSIONS.SETTINGS_WRITE]);

  const options = await listCouponScopeOptions();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/coupons"
        className="inline-flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Retour aux coupons
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-gray-900">Nouveau code promo</h1>
        <p className="text-sm text-gray-500">
          La remise sera calculée en base à chaque commande, jamais depuis ce
          formulaire.
        </p>
      </header>

      <CouponForm
        mode="create"
        categories={options.categories}
        products={options.products}
      />
    </div>
  );
}
