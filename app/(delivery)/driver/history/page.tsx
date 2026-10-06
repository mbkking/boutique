import { redirect } from "next/navigation";
import Link from "next/link";
import { History } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/session";
import { listDriverMissions } from "@/lib/data/driver";
import { EmptyState } from "@/components/ui/empty-state";
import { MissionCard } from "@/app/(delivery)/driver/missions/mission-card";

export const metadata = {
  title: "Mon historique",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Livraisons terminées : livrées ou retournées. */
export default async function DriverHistoryPage() {
  const auth = await getAuthenticatedUser();
  if (!auth.authenticated) redirect("/account");

  const missions = await listDriverMissions(auth.profile.id, "done");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">Mon historique</h1>
        <p className="text-sm text-gray-500">
          {missions.length === 0
            ? "Aucune livraison terminée pour le moment."
            : `${missions.length} livraison${missions.length > 1 ? "s" : ""} terminée${
                missions.length > 1 ? "s" : ""
              }.`}
        </p>
      </header>

      {missions.length === 0 ? (
        <EmptyState
          icon={<History aria-hidden="true" className="size-6" />}
          title="Aucune livraison terminée"
          description="Vos livraisons livrées ou retournées apparaîtront ici."
          actionLabel="Voir mes missions en cours"
          actionHref="/driver/deliveries"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {missions.map((mission) => (
            <MissionCard key={mission.id} mission={mission} />
          ))}
        </ul>
      )}

      <Link href="/driver/deliveries" className="text-sm text-primary hover:underline">
        Retour à mes missions en cours
      </Link>
    </div>
  );
}