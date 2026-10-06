import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Garde du détail d'une livraison côté livreur.
 *
 * La vérification du rôle s'effectue ici, sur le serveur, avant le rendu. La
 * restriction aux livraisons qui lui sont assignées est appliquée par les
 * policies RLS et par les server actions.
 */
export default async function DriverDeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardPage([PERMISSIONS.DELIVERY_READ_OWN, PERMISSIONS.DELIVERY_READ_ALL]);
  return <>{children}</>;
}