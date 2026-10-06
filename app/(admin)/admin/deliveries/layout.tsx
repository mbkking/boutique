import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Garde de la section « Livraisons » côté back-office.
 *
 * Exige `DELIVERY_READ_ALL` : un livreur ne peut pas y accéder, il ne voit que
 * ses propres missions via `/driver`.
 */
export default async function DeliveriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardPage([PERMISSIONS.DELIVERY_READ_ALL]);
  return <>{children}</>;
}