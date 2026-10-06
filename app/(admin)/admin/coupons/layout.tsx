import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Garde de la section « coupons ».
 *
 * Layout imbriqué : s'exécute sur le serveur après le layout /admin, et
 * protège la page même si elle est un composant client. Masquer un lien dans
 * la navigation ne suffit pas — l'URL directe doit aussi être refusée.
 */
export default async function couponsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardPage([PERMISSIONS.SETTINGS_READ]);
  return <>{children}</>;
}
