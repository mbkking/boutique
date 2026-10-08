import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Banknote, MapPin, Package, Phone } from "lucide-react";
import { RealtimeRefresh } from "@/components/realtime/realtime-refresh";
import { getAuthenticatedUser } from "@/lib/supabase/session";
import { getDriverMission } from "@/lib/data/driver";
import { getDeliveryStatusLabel } from "@/lib/services/orders";
import { formatPrice } from "@/lib/services/pricing";
import { formatPhoneForDisplay, buildTelLink } from "@/lib/platform/native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryStatusBadge } from "@/components/ui/status-badge";
import { MissionActions } from "@/app/(delivery)/driver/deliveries/[id]/mission-actions";
import { DeliveryRecovery } from "@/app/(delivery)/driver/deliveries/[id]/delivery-recovery";

export const metadata = {
  title: "Détail de la mission",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface MissionPageProps {
  params: Promise<{ id: string }>;
}

/** Libellé lisible des attributs de variante. */
function describeAttributes(attributes: Record<string, string> | null): string {
  if (!attributes) return "";
  return Object.entries(attributes)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key} : ${value}`)
    .join(" · ");
}

/**
 * Détail d'une mission de livraison.
 *
 * La requête filtre sur `driver_id` : un identifiant deviné ne donne accès à
 * aucune livraison qui n'est pas la sienne. Le contenu est volontairement
 * limité au strict nécessaire pour exécuter la livraison.
 */
export default async function DriverMissionPage({ params }: MissionPageProps) {
  const { id } = await params;

  const auth = await getAuthenticatedUser();
  if (!auth.authenticated) redirect("/account");

  const isAdmin = auth.profile.role === "admin";
  const mission = await getDriverMission(auth.profile.id, id, isAdmin);

  // Une mission qui n'appartient pas au livreur est traitée comme inexistante :
  // on ne confirme pas l'existence d'une livraison qui ne le concerne pas.
  if (!mission) notFound();

  const address = mission.address;

  return (
    <div className="flex flex-col gap-5">
      {/* Changement de statut (par le livreur ou l'administration) : la
          mission affichée suit l'événement sans rechargement. */}
      <RealtimeRefresh
        bindings={[
          { table: "deliveries", filter: `id=eq.${mission.id}` },
          { table: "delivery_events", filter: `delivery_id=eq.${mission.id}` },
        ]}
      />

      <Link
        href="/driver/deliveries"
        className="inline-flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Retour à mes missions
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">{mission.orderNumber}</h1>
          <DeliveryStatusBadge status={mission.status} />
        </div>
        <p className="text-sm text-gray-500">
          {getDeliveryStatusLabel(mission.status)}
        </p>
      </header>

      {/* Client et accès rapide */}
      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-base font-medium text-gray-900">{address.full_name}</p>

          <a
            href={buildTelLink(address.phone)}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-green-700 hover:underline"
          >
            <Phone aria-hidden="true" className="size-4" />
            {formatPhoneForDisplay(address.phone)}
          </a>
        </CardContent>
      </Card>

      {/* Adresse locale : ni code postal ni format occidental. */}
      <Card>
        <CardHeader>
          <CardTitle>Adresse de livraison</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-gray-700">
          <p className="flex items-start gap-2">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {address.quarter}
              {address.sector ? `, ${address.sector}` : ""} — {address.city}
            </span>
          </p>
          <p className="pl-6 font-medium text-gray-900">{address.landmark}</p>
          {address.instructions ? (
            <p className="pl-6 text-gray-600">{address.instructions}</p>
          ) : null}
          {mission.hasCoordinates ? (
            <p className="pl-6 text-xs text-gray-500">Coordonnées GPS disponibles.</p>
          ) : null}
          {mission.notes ? (
            <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              {`Note du client : ${mission.notes}`}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Montant à encaisser */}
      <Card>
        <CardHeader>
          <CardTitle>Montant à encaisser</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Banknote aria-hidden="true" className="size-5 text-green-600" />
            {formatPrice(mission.amountDue)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Paiement à la livraison, en espèces.
          </p>
        </CardContent>
      </Card>

      {/* Contenu à livrer */}
      <Card>
        <CardHeader>
          <CardTitle>{`Contenu à livrer (${mission.itemCount} article${mission.itemCount > 1 ? "s" : ""})`}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {mission.items.map((item, index) => {
              const attributes = describeAttributes(item.variantAttributes);
              return (
                <li
                  key={`${item.productName}-${index}`}
                  className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-gray-900">{item.productName}</span>
                    {attributes ? (
                      <span className="text-xs text-gray-500">{attributes}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-medium text-gray-900">
                    {`× ${item.quantity}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Actions de la mission */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package aria-hidden="true" className="size-4" />
            Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <MissionActions
            deliveryId={mission.id}
            status={mission.status}
            customerName={address.full_name}
            customerPhone={address.phone}
            amountDue={mission.amountDue}
            landmark={address.landmark}
            hasCoordinates={mission.hasCoordinates}
            latitude={mission.latitude}
            longitude={mission.longitude}
          />

          {/*
            Reprise, preuve et retour ne concernent que les livraisons non
            terminées : une livraison effectuée ou déjà retournée n'a plus rien à
            décider sur le terrain.
          */}
          {mission.status !== "DELIVERED" && mission.status !== "RETURNED" ? (
            <div className="border-t border-gray-100 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">
                En cas d&apos;échec
              </h3>
              <DeliveryRecovery
                deliveryId={mission.id}
                status={mission.status}
                attemptCount={mission.attemptCount}
                maxAttempts={3}
                proofType={mission.proofType}
                proofUrl={mission.proofUrl}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
