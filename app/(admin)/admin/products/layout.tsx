import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

/** Garde de la section « Produits » (réservée au catalogue). */
export default async function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardPage([PERMISSIONS.PRODUCT_READ]);
  return <>{children}</>;
}