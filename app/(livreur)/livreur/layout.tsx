import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DriverShell } from "@/components/layout/driver-shell";

/**
 * Layout serveur de l'espace livreur `/livreur`.
 *
 * Même garde que l'espace historique `/driver` : seuls les rôles disposant
 * de `DELIVERY_READ_OWN` (livreur) ou `DELIVERY_READ_ALL` (admin) entrent.
 * La vérification s'exécute sur le serveur avant tout rendu.
 */
export const dynamic = "force-dynamic";

export default async function LivreurLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await guardPage([
    PERMISSIONS.DELIVERY_READ_OWN,
    PERMISSIONS.DELIVERY_READ_ALL,
  ]);

  return (
    <DriverShell
      fullName={profile.full_name}
      phone={profile.phone}
      stats={null}
      basePath="/livreur"
    >
      {children}
    </DriverShell>
  );
}
