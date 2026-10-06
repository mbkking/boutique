"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  MapPin,
  Navigation,
  Package,
  Phone,
  Truck,
  XCircle,
} from "lucide-react";
import { collectCashAction, updateDeliveryStatusAction } from "@/lib/actions/driver";
import { buildNavigationUrl, buildTelLink, formatPhoneForDisplay } from "@/lib/platform/native";
import { formatPrice } from "@/lib/services/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FAILURE_REASONS } from "@/lib/validations/schemas";
import type { DeliveryFailureReason, DeliveryStatus } from "@/types";

const FAILURE_LABELS: Record<DeliveryFailureReason, string> = {
  CUSTOMER_ABSENT: "Client absent",
  PHONE_UNREACHABLE: "Téléphone injoignable",
  ADDRESS_INACCURATE: "Adresse imprécise",
  CUSTOMER_REFUSED: "Client a refusé la livraison",
  PRODUCT_UNAVAILABLE: "Produit indisponible",
  OTHER: "Autre motif",
};

interface MissionActionsProps {
  deliveryId: string;
  status: DeliveryStatus;
  customerName: string;
  customerPhone: string;
  /** Montant exact dû, relu par le serveur à l'enregistrement. */
  amountDue: number;
  landmark: string;
  hasCoordinates: boolean;
  latitude: number | null;
  longitude: number | null;
}

type Panel = "none" | "deliver" | "fail";

/**
 * Actions d'une mission de livraison.
 *
 * Le montant et le motif d'échec sont **revérifiés côté serveur** : ce composant
 * n'envoie qu'une intention, jamais une vérité. Un livreur ne peut donc pas
 * valider un montant arbitraire ni un motif vide.
 */
export function MissionActions({
  deliveryId,
  status,
  customerName,
  customerPhone,
  amountDue,
  landmark,
  hasCoordinates,
  latitude,
  longitude,
}: MissionActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("none");

  /**
   * Clé d'idempotence de l'encaissement : exigée par `collectCashAction`.
   * Générée une fois par mission ; un double-clic ou un rejeu réseau rejoue le
   * même enregistrement (unicité en base, migration 006) au lieu d'en créer un
   * second.
   */
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const [collectedAmount, setCollectedAmount] = useState(String(amountDue));
  const [method, setMethod] = useState("COD");
  const [discrepancy, setDiscrepancy] = useState("");

  const [failureReason, setFailureReason] = useState<DeliveryFailureReason>("CUSTOMER_ABSENT");
  const [failureNotes, setFailureNotes] = useState("");

  /**
   * Itinéraire : coordonnéesGPS si l'adresse en contient, sinon recherche sur
   * le repère. Dans les deux cas c'est une URL web — le système ouvre
   * l'application de cartographie si elle existe, le navigateur sinon.
   */
  const navigation = buildNavigationUrl({
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
    label: `${landmark}, Niamey, Niger`,
  });

  function advance(target: DeliveryStatus, notes?: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateDeliveryStatusAction({
        delivery_id: deliveryId,
        status: target,
        notes: notes ?? null,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.refresh();
    });
  }

  function submitDelivery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number.parseInt(collectedAmount, 10);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError("Saisissez un montant valide en francs CFA.");
      return;
    }

    if (parsedAmount < amountDue && discrepancy.trim().length === 0) {
      setError("Précisez la raison de l'écart si le montant encaissé est inférieur.");
      return;
    }

    startTransition(async () => {
      // Le statut passe d'abord : la livraison est effectuée, l'encaissement
      // est ensuite enregistré séparément. Les deux sont vérifiés par le serveur.
      const statusResult = await updateDeliveryStatusAction({
        delivery_id: deliveryId,
        status: "DELIVERED",
        notes: "Livraison effectuée.",
      });

      if (!statusResult.success) {
        setError(statusResult.error);
        return;
      }

      const collectResult = await collectCashAction({
        delivery_id: deliveryId,
        expected_amount: amountDue,
        collected_amount: parsedAmount,
        method: method as "COD",
        discrepancy_reason: discrepancy.trim() === "" ? null : discrepancy.trim(),
        idempotency_key: idempotencyKeyRef.current,
      });

      if (!collectResult.success) {
        // La livraison est déjà enregistrée : on ne revient pas en arrière,
        // on signale que l'encaissement reste à saisir.
        setError(
          `${collectResult.error} La livraison est enregistrée, mais l'encaissement reste à confirmer.`
        );
        setPanel("deliver");
        router.refresh();
        return;
      }

      setPanel("none");
      router.refresh();
    });
  }

  function submitFailure(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Un motif « Autre » sans précision ne serait pas exploitable côté support.
    if (failureReason === "OTHER" && failureNotes.trim().length === 0) {
      setError("Précisez la raison lorsque le motif est « Autre ».");
      return;
    }

    startTransition(async () => {
      const result = await updateDeliveryStatusAction({
        delivery_id: deliveryId,
        status: "FAILED",
        notes: failureNotes.trim() === "" ? null : failureNotes.trim(),
        failure_reason: failureReason,
        failure_notes: failureNotes.trim() === "" ? null : failureNotes.trim(),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setPanel("none");
      router.refresh();
    });
  }

  const isFinished = status === "DELIVERED" || status === "RETURNED";

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {isFinished ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Cette livraison est terminée. Aucune autre action n&apos;est possible.
        </div>
      ) : (
        <>
          {/* Accès rapide : appel et navigation, hors état. */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={buildTelLink(customerPhone)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-600 bg-white px-4 py-3 text-sm font-medium text-green-700"
            >
              <Phone aria-hidden="true" className="size-4" />
              Appeler
              <span className="sr-only">{customerName}</span>
            </a>

            {navigation ? (
              <a
                href={navigation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary bg-white px-4 py-3 text-sm font-medium text-primary-light"
              >
                <Navigation aria-hidden="true" className="size-4" />
                Naviguer
              </a>
            ) : null}
          </div>

          <p className="text-xs text-gray-500">
            {hasCoordinates
              ? "Itinéraire calculé sur les coordonnées de l'adresse."
              : "Itinéraire calculé à partir de l'adresse et du point de repère."}
          </p>

          {/* Progression de la mission. */}
          <div className="flex flex-col gap-2">
            {status === "ASSIGNED" || status === "ACCEPTED" ? (
              <Button
                variant="primary"
                size="lg"
                disabled={isPending}
                isLoading={isPending}
                loadingLabel="Mise à jour"
                onClick={() => advance("ACCEPTED", "Mission acceptée par le livreur.")}
                className="w-full"
              >
                <CheckCircle2 aria-hidden="true" className="size-4" />
                Accepter la mission
              </Button>
            ) : null}

            {status === "ACCEPTED" ? (
              <Button
                variant="primary"
                size="lg"
                disabled={isPending}
                isLoading={isPending}
                loadingLabel="Mise à jour"
                onClick={() => advance("IN_PREPARATION", "Marchandise prise en charge.")}
                className="w-full"
              >
                <Package aria-hidden="true" className="size-4" />
                Prendre en charge
              </Button>
            ) : null}

            {status === "IN_PREPARATION" ? (
              <Button
                variant="primary"
                size="lg"
                disabled={isPending}
                isLoading={isPending}
                loadingLabel="Mise à jour"
                onClick={() => advance("OUT_FOR_DELIVERY", "En route vers le client.")}
                className="w-full"
              >
                <Truck aria-hidden="true" className="size-4" />
                Je suis en route
              </Button>
            ) : null}

            {status === "OUT_FOR_DELIVERY" ? (
              <Button
                variant="primary"
                size="lg"
                disabled={isPending}
                isLoading={isPending}
                loadingLabel="Mise à jour"
                onClick={() => advance("ARRIVED", "Arrivé chez le client.")}
                className="w-full"
              >
                <MapPin aria-hidden="true" className="size-4" />
                Je suis arrivé
              </Button>
            ) : null}

            {(status === "ARRIVED" || status === "FAILED") &&
            panel !== "deliver" ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => setPanel("deliver")}
                className="w-full"
              >
                <Banknote aria-hidden="true" className="size-4" />
                Confirmer la livraison
              </Button>
            ) : null}

            {panel !== "deliver" ? (
              <Button
                variant="outline"
                size="md"
                onClick={() => setPanel("fail")}
                className="w-full"
              >
                <XCircle aria-hidden="true" className="size-4" />
                Signaler un échec
              </Button>
            ) : null}
          </div>

          {/* Encaissement : montant réel + méthode + écart justifié. */}
          {panel === "deliver" ? (
            <form
              onSubmit={submitDelivery}
              className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 p-4"
            >
              <p className="text-sm font-semibold text-gray-900">
                {`Montant attendu : ${formatPrice(amountDue)}`}
              </p>

              <Input
                label="Montant encaissé (XOF)"
                name="collected_amount"
                type="number"
                inputMode="numeric"
                min={0}
                value={collectedAmount}
                onChange={(event) => setCollectedAmount(event.target.value)}
                required
              />

              <Select
                label="Méthode d'encaissement"
                name="method"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {/*
                  Seul l'encaisement en espèces est réel au MVP. Les autres
                  moyens ne sont pas proposés : ils ne le sont pas encore.
                */}
                <option value="COD">Espèces</option>
              </Select>

              <Textarea
                label="Commentaire (facultatif)"
                name="comment"
                rows={2}
                value={discrepancy}
                onChange={(event) => setDiscrepancy(event.target.value)}
                hint="Obligatoire si le montant encaissé est inférieur au montant attendu."
              />

              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isPending}
                  loadingLabel="Enregistrement"
                  disabled={isPending}
                  className="flex-1"
                >
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  Valider
                </Button>
                <Button type="button" variant="ghost" size="lg" onClick={() => setPanel("none")}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : null}

          {/* Échec : motif obligatoire, commentaire obligatoire si « Autre ». */}
          {panel === "fail" ? (
            <form
              onSubmit={submitFailure}
              className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
            >
              <Select
                label="Motif de l'échec"
                name="failure_reason"
                value={failureReason}
                onChange={(event) =>
                  setFailureReason(event.target.value as DeliveryFailureReason)
                }
                required
              >
                {FAILURE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {FAILURE_LABELS[reason]}
                  </option>
                ))}
              </Select>

              <Textarea
                label={failureReason === "OTHER" ? "Précisez le motif" : "Commentaire (facultatif)"}
                name="failure_notes"
                rows={3}
                required={failureReason === "OTHER"}
                value={failureNotes}
                onChange={(event) => setFailureNotes(event.target.value)}
              />

              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="danger"
                  size="lg"
                  isLoading={isPending}
                  loadingLabel="Enregistrement"
                  disabled={isPending}
                  className="flex-1"
                >
                  {"Signaler l'échec"}
                </Button>
                <Button type="button" variant="ghost" size="lg" onClick={() => setPanel("none")}>
                  Annuler
                </Button>
              </div>
            </form>
          ) : null}
        </>
      )}

      <p className="text-xs text-gray-500">
        {`Client : ${customerName} · ${formatPhoneForDisplay(customerPhone)}`}
      </p>
    </div>
  );
}