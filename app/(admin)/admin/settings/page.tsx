import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/data/admin/settings";
import { getAdminTheme } from "@/lib/data/admin/theme";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/app/(admin)/admin/settings/settings-form";
import { AdminAppearanceForm } from "@/components/admin/admin-appearance-form";

export const metadata = {
  title: "Paramètres",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const profile = await guardPage([PERMISSIONS.SETTINGS_READ]);

  const [settings, adminTheme] = await Promise.all([getSettings(), getAdminTheme()]);
  const canWrite = can(profile.role, PERMISSIONS.SETTINGS_WRITE);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-sm text-gray-500">
          Apparence du back-office, identité de l&apos;entreprise, paiement et
          règles d&apos;exploitation.
        </p>
      </header>

      {/* Apparence : thème du back-office, entièrement pilotable ici. */}
      <section aria-labelledby="titre-apparence" className="flex flex-col gap-4">
        <div>
          <h2
            id="titre-apparence"
            className="text-xl font-bold text-gray-900"
          >
            Apparence
          </h2>
          <p className="text-sm text-gray-500">
            Logo, arrière-plan, couleurs, cartes et bordures du back-office.
            L&apos;aperçu se met à jour immédiatement ; l&apos;enregistrement est
            explicite.
          </p>
        </div>

        <AdminAppearanceForm initialTheme={adminTheme} canWrite={canWrite} />
      </section>

      <SettingsForm settings={settings} canWrite={canWrite} />

      <Card>
        <CardHeader>
          <CardTitle>Règles appliquées par le serveur</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm text-gray-700">
            <li>Le paiement à la livraison est le seul mode de paiement actif.</li>
            <li>
              Les prix sont relus en base à chaque commande : le montant envoyé
              par le navigateur est ignoré.
            </li>
            <li>
              Les frais de livraison proviennent de la zone du quartier choisi.
            </li>
            <li>
              Le thème du back-office est enregistré dans la table des paramètres
              existante : aucun réglage n&apos;est stocké ailleurs.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}