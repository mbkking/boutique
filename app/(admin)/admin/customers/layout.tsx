import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

/** Garde de la section « Clients » (données personnelles). */
export default async function CustomersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardPage([PERMISSIONS.CUSTOMER_READ]);
  return <>{children}</>;
}