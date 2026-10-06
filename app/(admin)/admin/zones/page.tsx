import { MapPin } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { listAllDeliveryZones } from "@/lib/data/delivery-zones";
import { ZoneManager } from "./zone-manager";
import { EmptyState } from "@/components/ui/empty-state";
import type { DeliveryZone } from "@/types";

export const metadata = {
  title: "Zones de livraison",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Zones de livraison et frais associés.
 *
 * Le calcul des frais est centralisé dans `lib/services/pricing.ts`
 * (`getDeliveryFee`) et relu par le serveur à la création de commande : cette
 * page n'affiche donc qu'un aperçu de la règle, elle n'en est pas la source.
 */
export default async function AdminZonesPage() {
  const profile = await guardPage([PERMISSIONS.SETTINGS_READ]);
  const zones: DeliveryZone[] = await listAllDeliveryZones();
  const canWrite = can(profile.role, PERMISSIONS.SETTINGS_WRITE);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Zones de livraison</h1>
        <p className="text-sm text-gray-500">
          {`${zones.length} zone(s) configurée(s). Les frais sont appliqués par le serveur à la création de commande.`}
        </p>
      </header>

      {zones.length === 0 ? (
        canWrite ? (
          <ZoneManager zones={zones} canWrite={canWrite} />
        ) : (
          <EmptyState
            icon={<MapPin aria-hidden="true" className="size-6" />}
            title="Aucune zone"
            description="Sans zone de livraison, aucune commande ne peut être validée : les frais sont indéterminés."
          />
        )
      ) : (
        <ZoneManager zones={zones} canWrite={canWrite} />
      )}

      <p className="text-xs text-gray-400">
        Les frais affichés ici sont ceux appliqués par le serveur. Le client ne peut ni
        les choisir ni les modifier : ils sont recalculés à chaque commande.
      </p>
    </div>
  );
}