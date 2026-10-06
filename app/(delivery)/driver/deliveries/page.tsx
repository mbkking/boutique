import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/session";
import { listDriverMissions } from "@/lib/data/driver";
import { EmptyState } from "@/components/ui/empty-state";
import { MissionCard } from "@/app/(delivery)/driver/missions/mission-card";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";

export const metadata = {
  title: "Mes missions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Liste des missions en cours.
 *
 * Le filtre sur le livreur est appliqué dans la requête (voir
 * `lib/data/driver.ts`) : un livreur ne voit pas les missions d'un collègue,
 * même en modifiant l'URL.
 */
export default async function DriverDeliveriesPage() {
  const auth = await getAuthenticatedUser();
  if (!auth.authenticated) redirect("/account");

  const missions = await listDriverMissions(auth.profile.id, "open");

  const pending = missions.filter(
    (mission) => mission.status === "ASSIGNED" || mission.status === "ACCEPTED"
  );
  const onRoad = missions.filter(
    (mission) =>
      mission.status === "IN_PREPARATION" ||
      mission.status === "OUT_FOR_DELIVERY" ||
      mission.status === "ARRIVED"
  );

  return (
    <div className="flex flex-col gap-6">
      {/*
        Le livreur n'écoute que ses propres livraisons : le filtre porte sur
        `driver_id`, ce qui limite ce qu'il reçoit à ce qu'il a le droit de
        lire.
      */}
      <RealtimeRefresh
        bindings={[{ table: "deliveries", filter: `driver_id=eq.${auth.profile.id}` }]}
      />
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">Mes missions</h1>
        <p className="text-sm text-gray-500">
          {missions.length === 0
            ? "Aucune livraison en cours."
            : `${missions.length} livraison${missions.length > 1 ? "s" : ""} à effectuer.`}
        </p>
      </header>

      {missions.length === 0 ? (
        <EmptyState
          icon={<Package aria-hidden="true" className="size-6" />}
          title="Aucune livraison en cours"
          description="Vos missions apparaîtront ici dès que l'administration vous en affecte une."
          actionLabel="Voir mon historique"
          actionHref="/driver/history"
        />
      ) : (
        <div className="flex flex-col gap-6">
          {pending.length > 0 ? (
            <section aria-labelledby="groupe-attente" className="flex flex-col gap-3">
              <h2 id="groupe-attente" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {`À prendre en charge (${pending.length})`}
              </h2>
              <ul className="flex flex-col gap-3">
                {pending.map((mission) => (
                  <MissionCard key={mission.id} mission={mission} />
                ))}
              </ul>
            </section>
          ) : null}

          {onRoad.length > 0 ? (
            <section aria-labelledby="groupe-route" className="flex flex-col gap-3">
              <h2 id="groupe-route" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {`En cours (${onRoad.length})`}
              </h2>
              <ul className="flex flex-col gap-3">
                {onRoad.map((mission) => (
                  <MissionCard key={mission.id} mission={mission} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}