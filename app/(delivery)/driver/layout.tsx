import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { DriverShell } from "@/components/layout/driver-shell";

/**
 * Layout serveur de l'espace livreur.
 *
 * La vérification des droits s'exécute sur le serveur avant tout rendu : aucune
 * donnée de tournée n'est envoyée à un visiteur non autorisé.
 * Rendue à la demande, car elle dépend de la session.
 */
export const dynamic = "force-dynamic";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Un livreur n'accède qu'à ses missions : `DELIVERY_READ_ALL` n'est pas
  // requis, ce qui garantit qu'il ne peut pas lister les commandes de
  // l'entreprise même en tapant l'URL directement.
  const profile = await guardPage([
    PERMISSIONS.DELIVERY_READ_OWN,
    PERMISSIONS.DELIVERY_READ_ALL,
  ]);

  return (
    <DriverShell fullName={profile.full_name} phone={profile.phone} stats={null}>
      {children}
    </DriverShell>
  );
}