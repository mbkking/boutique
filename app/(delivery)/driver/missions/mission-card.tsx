import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import type { DriverMission } from "@/lib/data/driver";
import { formatPrice } from "@/lib/services/pricing";
import { formatPhoneForDisplay } from "@/lib/platform/native";
import { DeliveryStatusBadge } from "@/components/ui/status-badge";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/**
 * Carte de mission.
 *
 * Contenu volontairement minimal mais suffisant pourexecuter la livraison :
 * qui, où, quoi, combien. Le téléphone est cliquable directement depuis la
 * liste — c'est l'action la plus fréquente en tournée.
 */
export function MissionCard({ mission }: { mission: DriverMission }) {
  const address = mission.address;

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-bold text-gray-900">{mission.orderNumber}</span>
          <span className="truncate text-sm text-gray-700">{address.full_name}</span>
        </div>
        <DeliveryStatusBadge status={mission.status} />
      </div>

      <dl className="mt-3 flex flex-col gap-1.5 text-sm text-gray-600">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            {address.quarter}
          </dt>
          <dd className="shrink-0">{formatDateTime(mission.assignedAt ?? mission.createdAt)}</dd>
        </div>

        <div className="flex items-center justify-between gap-3">
          <dt className="truncate pl-6 text-xs text-gray-500">{address.landmark}</dt>
          <dd className="shrink-0 text-xs text-gray-500">
            {`${mission.itemCount} article${mission.itemCount > 1 ? "s" : ""}`}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">Montant à encaisser</span>
          <span className="text-lg font-bold text-gray-900">
            {formatPrice(mission.amountDue)}
          </span>
        </div>

        <Link href={`/driver/deliveries/${mission.id}`}>
          <span className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
            Ouvrir
            <ChevronRight aria-hidden="true" className="size-4" />
          </span>
        </Link>
      </div>

      <p className="sr-only">
        {`Téléphone du client : ${formatPhoneForDisplay(address.phone)}`}
      </p>
    </li>
  );
}