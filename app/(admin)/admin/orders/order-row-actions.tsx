"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Package, Truck, XCircle } from "lucide-react";
import {
  assignDeliveryAction,
  cancelOrderAction,
  confirmOrderAction,
  markReadyForDeliveryAction,
  prepareOrderAction,
} from "@/lib/actions/admin/orders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { DeliveryStatus, OrderStatus } from "@/types";

export interface OrderRowActionsProps {
  orderId: string;
  status: OrderStatus;
  deliveryId: string | null;
  deliveryStatus: DeliveryStatus | null;
  /** Livreurs disponibles pour l'affectation. */
  drivers: Array<{ id: string; name: string }>;
  zones: Array<{ id: string; name: string }>;
  /** Droits de l'opérateur ; chaque action est de nouveau vérifiée côté serveur. */
  canConfirm: boolean;
  canPrepare: boolean;
  canCancel: boolean;
  canAssign: boolean;
}

type Panel = "none" | "cancel" | "assign";

/**
 * Actions d'une ligne de commande.
 *
 * Règle absolue : ces boutons sont un confort d'interface, jamais une
 * autorisation. Chaque action revérifie le rôle et le statut côté serveur, et
 * journalise l'opération. Masquer un bouton ici n'a pas vocation à protéger :
 * c'est le serveur qui refuse.
 */
export function OrderRowActions({
  orderId,
  status,
  deliveryId,
  deliveryStatus,
  drivers,
  zones,
  canConfirm,
  canPrepare,
  canCancel,
  canAssign,
}: OrderRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("none");

  const [cancelReason, setCancelReason] = useState("");
  const [driverId, setDriverId] = useState("");
  const [zoneId, setZoneId] = useState("");

  function run(
    label: string,
    action: () => Promise<{ success: boolean; error?: string }>
  ) {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await action();

      if (!result.success) {
        setError(result.error ?? "L'opération a échoué.");
        return;
      }

      setSuccess(label);
      setPanel("none");
      router.refresh();
    });
  }

  const isClosed =
    status === "CANCELLED" || status === "DELIVERED" || status === "RETURNED";

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="rounded-lg bg-green-50 p-2 text-xs text-green-700">
          {success}
        </p>
      ) : null}

      {isClosed ? (
        <p className="text-xs text-gray-500">Commande close : aucune action possible.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {canConfirm && status === "PENDING_CONFIRMATION" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              isLoading={isPending}
              onClick={() =>
                run("Commande confirmée.", () =>
                  confirmOrderAction({ orderId, notes: null })
                )
              }
            >
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Confirmer
            </Button>
          ) : null}

          {canPrepare && status === "CONFIRMED" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              isLoading={isPending}
              onClick={() =>
                run("Commande en préparation.", () =>
                  prepareOrderAction({ orderId, notes: null })
                )
              }
            >
              <Package aria-hidden="true" className="size-4" />
              Préparer
            </Button>
          ) : null}

          {canPrepare && status === "PREPARING" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              isLoading={isPending}
              onClick={() =>
                run("Commande prête pour livraison.", () =>
                  markReadyForDeliveryAction({ orderId, notes: null })
                )
              }
            >
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Prête pour livraison
            </Button>
          ) : null}

          {canAssign &&
          (status === "READY_FOR_DELIVERY" || status === "ASSIGNED") ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => setPanel(panel === "assign" ? "none" : "assign")}
            >
              <Truck aria-hidden="true" className="size-4" />
              {deliveryId ? "Réaffecter" : "Affecter"}
            </Button>
          ) : null}

          {canCancel ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setPanel(panel === "cancel" ? "none" : "cancel")}
              className="text-red-600"
            >
              <XCircle aria-hidden="true" className="size-4" />
              Annuler
            </Button>
          ) : null}
        </div>
      )}

      {/* Affectation : motif non requis, mais la sélection du livreur l'est. */}
      {panel === "assign" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-primary-100 bg-primary-50 p-3">
          <Select
            label="Livreur"
            name="driver_id"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
            required
          >
            <option value="">Sélectionnez un livreur</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </Select>

          <Select
            label="Zone de livraison (facultatif)"
            name="zone_id"
            value={zoneId}
            onChange={(event) => setZoneId(event.target.value)}
          >
            <option value="">Déduire automatiquement</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </Select>

          <Button
            variant="primary"
            size="sm"
            disabled={isPending || driverId === ""}
            isLoading={isPending}
            loadingLabel="Affectation"
            onClick={() =>
              run("Livreur affecté.", () =>
                assignDeliveryAction({
                  orderId,
                  driverId,
                  zoneId: zoneId === "" ? null : zoneId,
                  notes: null,
                })
              )
            }
          >
            Confirmer l&apos;affectation
          </Button>
        </div>
      ) : null}

      {/* Annulation : motif obligatoire, sinon l'annulation n'est pas traçable. */}
      {panel === "cancel" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <Input
            label="Motif d'annulation"
            name="cancel_reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            hint="Obligatoire : il est conservé dans l'historique de la commande."
            required
          />

          <Button
            variant="danger"
            size="sm"
            disabled={isPending || cancelReason.trim().length < 3}
            isLoading={isPending}
            loadingLabel="Annulation"
            onClick={() =>
              run("Commande annulée.", () =>
                cancelOrderAction({ orderId, reason: cancelReason.trim(), notes: null })
              )
            }
          >
            Confirmer l&apos;annulation
          </Button>
        </div>
      ) : null}

      {deliveryStatus ? (
        <span className="text-xs text-gray-500">{`Livraison : ${deliveryStatus}`}</span>
      ) : null}
    </div>
  );
}