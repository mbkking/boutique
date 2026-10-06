import { Truck } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { listAdminDrivers } from "@/lib/data/admin/catalog";
import { DriverInviteForm } from "./driver-invite-form";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPhoneForDisplay } from "@/lib/platform/native";

export const metadata = {
  title: "Livreurs",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

/**
 * Suivi et invitation des livreurs.
 *
 * L'invitation passe par l'API d'administration Supabase : elle n'est pas
 * réalisable depuis le navigateur, donc elle est exposée ici sous forme de
 * formulaire relié à une action serveur. Le changement de rôle d'un compte
 * existant reste dans la gestion des utilisateurs.
 */
export default async function AdminDriversPage() {
  const profile = await guardPage([PERMISSIONS.DELIVERY_READ_ALL]);
  const canWrite = can(profile.role, PERMISSIONS.USER_WRITE);

  const drivers = await listAdminDrivers();

  const active = drivers.filter((driver) => driver.isActive);
  const inactive = drivers.filter((driver) => !driver.isActive);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Livreurs</h1>
        <p className="text-sm text-gray-500">
          {`${active.length} livreur(s) actif(s) sur ${drivers.length} �?" ${drivers.reduce(
            (sum, driver) => sum + driver.activeMissions,
            0
          )} mission(s) en cours.`}
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <li>
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-gray-500">Livreurs</span>
              <span className="text-xl font-bold text-gray-900">{drivers.length}</span>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-gray-500">Actifs</span>
              <span className="text-xl font-bold text-gray-900">{active.length}</span>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-gray-500">Missions en cours</span>
              <span className="text-xl font-bold text-gray-900">
                {drivers.reduce((sum, driver) => sum + driver.activeMissions, 0)}
              </span>
            </CardContent>
          </Card>
        </li>
        <li>
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-gray-500">Terminées</span>
              <span className="text-xl font-bold text-gray-900">
                {drivers.reduce((sum, driver) => sum + driver.completedMissions, 0)}
              </span>
            </CardContent>
          </Card>
        </li>
      </ul>

      {drivers.length === 0 ? (
        <EmptyState
          icon={<Truck aria-hidden="true" className="size-6" />}
          title="Aucun livreur"
          description="Aucun compte livreur n'existe. Invitez le premier livreur ci-dessous."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="livreurs-actifs" className="flex flex-col gap-3">
            <h2 id="livreurs-actifs" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {`Actifs (${active.length})`}
            </h2>

            {active.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun livreur actif.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {active.map((driver) => (
                  <li key={driver.id}>
                    <Card>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="text-sm font-semibold text-gray-900">
                            {driver.fullName}
                          </span>
                          <a
                            href={`tel:${driver.phone.replace(/[^\d+]/g, "")}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {formatPhoneForDisplay(driver.phone)}
                          </a>
                          <span className="text-xs text-gray-500">
                            {`Inscrit le ${formatDateTime(driver.createdAt)} · dernière activité ${formatDateTime(
                              driver.lastActivityAt
                            )}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <span className="block text-lg font-bold text-gray-900">
                              {driver.activeMissions}
                            </span>
                            <span className="text-xs text-gray-500">en cours</span>
                          </div>
                          <div>
                            <span className="block text-lg font-bold text-gray-900">
                              {driver.completedMissions}
                            </span>
                            <span className="text-xs text-gray-500">terminées</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {inactive.length > 0 ? (
            <section aria-labelledby="livreurs-inactifs" className="flex flex-col gap-3">
              <h2
                id="livreurs-inactifs"
                className="text-sm font-semibold uppercase tracking-wide text-gray-500"
              >
                {`Désactivés (${inactive.length})`}
              </h2>
              <ul className="flex flex-col gap-2">
                {inactive.map((driver) => (
                  <li
                    key={driver.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm"
                  >
                    <span className="text-gray-700">{driver.fullName}</span>
                    <span className="text-xs text-gray-500">{driver.completedMissions} livraison(s)</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <DriverInviteForm canWrite={canWrite} />

      <p className="text-xs text-gray-400">
        L&apos;invitation se fait depuis cette page. Le changement de rôle d&apos;un compte existant
        reste dans la gestion des utilisateurs : un rôle ne peut jamais être attribué
        depuis le navigateur.
      </p>
    </div>
  );
}