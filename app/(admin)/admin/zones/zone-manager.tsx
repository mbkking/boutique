"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  createZoneAction,
  deleteZoneAction,
  setZoneActiveAction,
  updateZoneAction,
} from "@/lib/actions/admin/delivery-zones";
import { formatQuartersForInput, MAX_ZONE_FEE } from "@/lib/domain/delivery-zones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/services/pricing";
import type { DeliveryZone } from "@/types";

export interface ZoneManagerProps {
  zones: DeliveryZone[];
  canWrite: boolean;
}

/** Ligne en cours d'édition ; `id` absent = création. */
interface ZoneDraft {
  id?: string;
  name: string;
  city: string;
  quarters: string;
  fee: string;
  isActive: boolean;
}

const EMPTY_DRAFT: ZoneDraft = {
  name: "",
  city: "Niamey",
  quarters: "",
  fee: "",
  isActive: true,
};

/**
 * Gestion des zones de livraison.
 *
 * Les frais sont saisis en FCFA entiers, sans décimale : c'est la devise la
 * plus petite et cela évite toute question d'arrondi. Le champ refuse
 * explicitement les décimales plutôt que de les tronquer en silence — un frais
 * de 1000,5 affiché à 1000 est un écart que personne ne s'explique.
 *
 * Une zone sans quartier rattaché ne peut pas servir : c'est signalé dans la
 * liste, parce qu'une zone activée mais vide laisse des quartiers de Niamey
 * hors de toute tarification.
 */
export function ZoneManager({ zones, canWrite }: ZoneManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<ZoneDraft | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<DeliveryZone | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>, message: string) {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await action();

      if (!result.success) {
        setError(result.error ?? "L'operation n'a pas pu aboutir.");
        return;
      }

      setNotice(message);
      setDraft(null);
      setPendingDeletion(null);
      router.refresh();
    });
  }

  function toDraft(zone: DeliveryZone): ZoneDraft {
    return {
      id: zone.id,
      name: zone.name,
      city: zone.city,
      quarters: formatQuartersForInput(zone.quarters),
      fee: String(zone.fee),
      isActive: zone.is_active,
    };
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {canWrite ? (
        <div>
          <Button
            type="button"
            variant="primary"
            onClick={() => setDraft({ ...EMPTY_DRAFT })}
          >
            <Plus aria-hidden="true" className="size-4" />
            Ajouter une zone
          </Button>
        </div>
      ) : null}

      <ul className="flex flex-col gap-3">
        {zones.map((zone) => {
          const quarters = Array.isArray(zone.quarters) ? zone.quarters : [];

          return (
            <li key={zone.id}>
              <Card>
                <CardContent className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">{zone.name}</span>
                      <Badge variant={zone.is_active ? "success" : "neutral"}>
                        {zone.is_active ? "active" : "inactive"}
                      </Badge>
                      {quarters.length === 0 ? <Badge variant="warning">sans quartier</Badge> : null}
                    </div>

                    <span className="text-xs text-gray-500">{zone.city}</span>

                    {quarters.length > 0 ? (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {quarters.map((quarter) => (
                          <li
                            key={quarter}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                          >
                            {quarter}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-amber-700">
                        Aucun quartier rattaché : cette zone ne peut pas servir.
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="text-lg font-bold text-gray-900">
                      {zone.fee === 0 ? "Offerte" : formatPrice(zone.fee)}
                    </span>
                    <span className="text-xs text-gray-500">frais de livraison</span>

                    {canWrite ? (
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () =>
                                setZoneActiveAction({
                                  id: zone.id,
                                  is_active: !zone.is_active,
                                }),
                              zone.is_active ? "Zone désactivée." : "Zone activée."
                            )
                          }
                        >
                          {zone.is_active ? "Désactiver" : "Activer"}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setDraft(toDraft(zone))}
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                          <span className="sr-only">{`Modifier la zone ${zone.name}`}</span>
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setPendingDeletion(zone)}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                          <span className="sr-only">{`Supprimer la zone ${zone.name}`}</span>
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Modifier la zone" : "Nouvelle zone"}
        description={
          draft?.id
            ? "Les frais s'appliquent aux prochaines commandes."
            : "Une zone active sans quartier rattaché ne peut pas servir."
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Annuler
            </Button>
            <Button
              type="submit"
              form="zone-form"
              variant="primary"
              isLoading={isPending}
              loadingLabel="Enregistrement"
              disabled={isPending}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        {draft ? (
          <form
            id="zone-form"
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();

              run(
                () =>
                  draft.id
                    ? updateZoneAction({
                        id: draft.id,
                        name: draft.name,
                        city: draft.city,
                        quarters_input: draft.quarters,
                        fee_input: draft.fee,
                        is_active: draft.isActive,
                      })
                    : createZoneAction({
                        name: draft.name,
                        city: draft.city,
                        quarters_input: draft.quarters,
                        fee_input: draft.fee,
                        is_active: draft.isActive,
                      }),
                draft.id ? "Zone modifiée." : "Zone créée."
              );
            }}
          >
            <Input
              id="zone-name"
              label="Nom de la zone"
              required
              maxLength={80}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />

            <Input
              id="zone-city"
              label="Ville"
              required
              maxLength={80}
              value={draft.city}
              onChange={(event) => setDraft({ ...draft, city: event.target.value })}
            />

            <Textarea
              id="zone-quarters"
              label="Quartiers desservis"
              hint="Séparés par des virgules, des points-virgules ou des retours à la ligne."
              rows={4}
              value={draft.quarters}
              onChange={(event) => setDraft({ ...draft, quarters: event.target.value })}
            />

            <Input
              id="zone-fee"
              label="Frais de livraison (FCFA)"
              hint={`Montant entier, sans décimale. Maximum ${MAX_ZONE_FEE.toLocaleString("fr-FR")} FCFA. 0 signifie « offerte ».`}
              required
              inputMode="numeric"
              pattern="\d*"
              placeholder="1000"
              value={draft.fee}
              onChange={(event) => setDraft({ ...draft, fee: event.target.value })}
            />

            <Checkbox
              id="zone-active"
              label="Zone active"
              checked={draft.isActive}
              onChange={(event) =>
                setDraft({ ...draft, isActive: event.target.checked })
              }
            />
          </form>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={pendingDeletion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
        title="Supprimer cette zone ?"
        description={
          pendingDeletion
            ? `« ${pendingDeletion.name} » sera retirée de la liste des zones actives.`
            : undefined
        }
        variant="danger"
        confirmLabel="Supprimer"
        isPending={isPending}
        onConfirm={() => {
          if (!pendingDeletion) return;

          return run(
            () => deleteZoneAction({ id: pendingDeletion.id }),
            "Zone supprimée."
          );
        }}
      >
        <p className="text-sm text-gray-600">
          Une zone déjà utilisée par une livraison ne peut pas être supprimée :
          désactivez-la plutôt, ce qui conserve l&apos;historique des commandes livrées.
        </p>
      </ConfirmDialog>
    </div>
  );
}