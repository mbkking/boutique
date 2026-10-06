import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { AdminShell } from "@/components/layout/admin-shell";
import { getAdminTheme } from "@/lib/data/admin/theme";

/**
 * Layout serveur de l'espace d'administration.
 *
 * La vérification des droits s'exécute sur le serveur avant tout rendu : aucune
 * donnée du back-office n'est envoyée à un visiteur non autorisé.
 *
 * Le thème (ADMIN → Paramètres → Apparence) est lu ici et transmis à la
 * coquille, qui publie les variables CSS. Un thème indisponible ne bloque
 * jamais l'affichage : `getAdminTheme` renvoie le thème par défaut.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Un droit suffit pour entrer dans l'espace d'administration ; chaque page
  // affine ensuite ses propres droits via `guardPage`.
  const profile = await guardPage([
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.SETTINGS_READ,
  ]);

  const theme = await getAdminTheme();

  return (
    <AdminShell fullName={profile.full_name} role={profile.role} theme={theme}>
      {children}
    </AdminShell>
  );
}