/**
 * Layout serveur de l'espace client.
 *
 * Toutes les pages `/account/**` exigent une session valide : la garde
 * s'exécute sur le serveur, avant tout rendu, et le contenu n'est jamais
 * envoyé à un visiteur non connecté.
 *
 * Un client peut commander sans compte : l'espace compte est donc facultatif,
 * mais strictement privé.
 *
 * ⚠️ Aucun `redirect()` ici. La route `/account` elle-même sert la page de
 * connexion quand aucune session n'existe ; rediriger `/account` vers
 * `/account` produisait une boucle de rechargement infinie — Next.js émet
 * alors un `<meta http-equiv="refresh">` vers l'URL identique, et le
 * navigateur recharge sans fin. Le contrôle de session reste assuré par
 * chaque page (`getSessionProfile` + `getCustomerByProfileId`), qui
 * rendent l'état approprié au lieu de rediriger.
 */
export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}