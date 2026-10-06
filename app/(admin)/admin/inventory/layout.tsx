import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

/** Garde de la section « Inventaire » (réservée au stock). */
export default async function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardPage([PERMISSIONS.INVENTORY_READ]);
  return <>{children}</>;
}