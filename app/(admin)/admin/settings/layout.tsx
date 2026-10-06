import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Garde de la section « Paramètres ».
 *
 * Réservée à l'administrateur : utilisateurs, rôles, zones, frais, promotions,
 * audit et configuration y sont regroupés.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await guardPage([PERMISSIONS.SETTINGS_READ]);
  return <>{children}</>;
}