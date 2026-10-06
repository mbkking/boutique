import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Garde de la section « users ».
 *
 * Layout imbriqué : s'execute sur le serveur apres le layout /admin, et
 * protege la page meme si elle est un composant client. Masquer un lien dans la
 * navigation ne suffit pas -- l'URL directe doit aussi etre refusee.
 */
export default async function usersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardPage([PERMISSIONS.USER_READ]);
  return <>{children}</>;
}
