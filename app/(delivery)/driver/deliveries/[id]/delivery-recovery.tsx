"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, RotateCcw, CalendarClock, X, Loader2 } from "lucide-react";
import {
  attachDeliveryProofAction,
  removeDeliveryProofAction,
  rescheduleDeliveryAction,
  returnDeliveryAction,
} from "@/lib/actions/driver-delivery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ImagePreparationError,
  prepareImageForUpload,
} from "@/lib/images/compress";

interface DeliveryRecoveryProps {
  deliveryId: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  proofType: string | null;
  proofUrl: string | null;
}

/** Nombre maximal de reprises avant retour obligatoire. */
const MAX_ATTEMPTS = 3;

/** Plafond de la preuve de livraison, aligné sur la validation serveur. */
const MAX_PROOF_BYTES = 4 * 1024 * 1024;

/** Lecture d'un fichier en URL de données, pour l'aperçu local. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("La photo n'a pas pu être lue."));
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

/**
 * Reprise d'une livraison, preuve et retour.
 *
 * Trois décisions possibles après un échec :
 * - photographier le colis remis et solder la livraison ;
 * - reprogrammer une nouvelle tentative ;
 * - retourner la marchandise au dépôt.
 *
 * La photo est prise par l'appareil quand le navigateur l'autorise ; sinon un
 * sélecteur de fichier prend le relais. Le refus de permission n'est pas bloquant.
 */
export function DeliveryRecovery({
  deliveryId,
  status,
  attemptCount,
  proofType,
  proofUrl,
}: DeliveryRecoveryProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [photo, setPhoto] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
const [isPreparing, setIsPreparing] = useState(false);
  const [note, setNote] = useState("");

  const [panel, setPanel] = useState<"none" | "proof" | "reschedule" | "return">("none");
  const [nextAttemptAt, setNextAttemptAt] = useState("");
  const [reason, setReason] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptCount);
  const canReschedule = status === "FAILED" && attemptsLeft > 0;
  const canReturn = status !== "DELIVERED" && status !== "RETURNED";

  function run(
    label: string,
    action: () => Promise<{ success: boolean; error?: string }>,
    after?: () => void
  ) {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "L'opération a échoué.");
        return;
      }
      setMessage(label);
      if (after) after();
      router.refresh();
    });
  }

  /** Convertit un fichier en base64 et met à jour l'aperçu. */
  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    if (!file) return;

    setIsPreparing(true);

    try {
      // La compression précède le contrôle de taille : une photo de smartphone
      // dépasse presque toujours la limite, et un refus sec serait inutile.
      const prepared = await prepareImageForUpload(file);

      if (prepared.finalBytes > MAX_PROOF_BYTES) {
        setError("Photo trop lourde même après compression (maximum 4 Mo).");
        return;
      }

      const dataUrl = await readAsDataUrl(prepared.file);
      // Seule la partie base64 est transmise : l'URL locale ne sert qu'à
      // l'aperçu et ne doit jamais partir vers le serveur.
      setPhoto(dataUrl.includes(",") ? dataUrl.split(",")[1] : "");
      setPhotoPreview(dataUrl);
    } catch (cause) {
      setError(
        cause instanceof ImagePreparationError
          ? cause.message
          : "La photo n'a pas pu être lue."
      );
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      ) : null}

      {proofUrl ? (
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-500">Preuve enregistrée</p>
          <a
            href={proofUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block overflow-hidden rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proofUrl}
              alt="Preuve de livraison"
              className="h-40 w-full object-cover"
            />
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-red-600"
            disabled={isPending}
            onClick={() =>
              run("Preuve supprimée.", () => removeDeliveryProofAction({ delivery_id: deliveryId }))
            }
          >
            Supprimer la preuve
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant={panel === "proof" ? "ghost" : "outline"}
            onClick={() => setPanel(panel === "proof" ? "none" : "proof")}
            className="w-full"
          >
            <Camera aria-hidden="true" className="size-4" />
            {proofType ? "Modifier la preuve" : "Ajouter une preuve"}
          </Button>

          {panel === "proof" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label
                htmlFor="proof-photo"
                className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center"
              >
                <Camera aria-hidden="true" className="size-6 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">
                  Photographier le colis
                </span>
                <span className="text-xs text-gray-500">
                  La caméra s&apos;ouvre si elle est disponible, sinon choisissez un fichier.
                </span>
                {isPreparing ? (
                  <span className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                    Compression en cours…
                  </span>
                ) : null}
                <input
                  id="proof-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  disabled={isPreparing}
                  className="sr-only"
                  onChange={handlePhotoChange}
                />
              </label>

              {photoPreview ? (
                <div className="relative overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoPreview}
                    alt="Aperçu de la preuve"
                    className="h-40 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null);
                      setPhotoPreview(null);
                    }}
                    aria-label="Retirer la photo sélectionnée"
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : null}

              <Textarea
                label="Commentaire (facultatif)"
                name="proof_note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ex. : remis au gardien, portail bleu"
              />

              <Button
                variant="primary"
                isLoading={isPending}
                loadingLabel="Enregistrement"
                disabled={isPending}
                onClick={() =>
                  run(
                    "Preuve enregistrée.",
                    () =>
                      attachDeliveryProofAction({
                        delivery_id: deliveryId,
                        proof_type: "photo",
                        content: photo ?? undefined,
                        note: note.trim() === "" ? null : note,
                      }),
                    () => {
                      setPanel("none");
                      setPhoto(null);
                      setPhotoPreview(null);
                      setNote("");
                    }
                  )
                }
              >
                Enregistrer la preuve
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {/* Reprise après échec */}
      {canReschedule ? (
        <div className="flex flex-col gap-2">
          <Button
            variant={panel === "reschedule" ? "ghost" : "outline"}
            onClick={() => setPanel(panel === "reschedule" ? "none" : "reschedule")}
            className="w-full"
          >
            <CalendarClock aria-hidden="true" className="size-4" />
            {`Reprogrammer (${attemptsLeft} tentative${attemptsLeft > 1 ? "s" : ""} restante${attemptsLeft > 1 ? "s" : ""})`}
          </Button>

          {panel === "reschedule" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Input
                label="Nouvelle date et heure"
                name="next_attempt_at"
                type="datetime-local"
                value={nextAttemptAt}
                onChange={(event) => setNextAttemptAt(event.target.value)}
                required
              />

              <Textarea
                label="Motif (obligatoire)"
                name="reschedule_reason"
                rows={2}
                value={rescheduleReason}
                onChange={(event) => setRescheduleReason(event.target.value)}
                placeholder="Ex. : client absent, nouvelle tentative le lendemain"
                required
              />

              <Button
                variant="primary"
                isLoading={isPending}
                loadingLabel="Programmation"
                disabled={isPending || nextAttemptAt === "" || rescheduleReason.trim().length < 3}
                onClick={() =>
                  run(
                    "Livraison reprogrammée.",
                    () =>
                      rescheduleDeliveryAction({
                        delivery_id: deliveryId,
                        next_attempt_at: new Date(nextAttemptAt).toISOString(),
                        reason: rescheduleReason.trim(),
                      }),
                    () => {
                      setPanel("none");
                      setNextAttemptAt("");
                      setRescheduleReason("");
                    }
                  )
                }
              >
                Confirmer la reprogrammation
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Retour au dépôt */}
      {canReturn ? (
        <div className="flex flex-col gap-2">
          <Button
            variant={panel === "return" ? "ghost" : "outline"}
            onClick={() => setPanel(panel === "return" ? "none" : "return")}
            className="w-full text-red-700"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Retourner au dépôt
          </Button>

          {panel === "return" ? (
            <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-gray-700">
                Le retour clôt la livraison : la commande passe en
                « retournée » et la marchandise revient au dépôt. Cette action
                est définitive.
              </p>

              <Textarea
                label="Motif du retour (obligatoire)"
                name="return_reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex. : client refuse le colis, adresse incorrecte"
                required
              />

              <Button
                variant="danger"
                isLoading={isPending}
                loadingLabel="Retour"
                disabled={isPending || reason.trim().length < 3}
                onClick={() => {
                  if (!window.confirm("Confirmer le retour de cette livraison au dépôt ?")) return;

                  run(
                    "Livraison retournée au dépôt.",
                    () =>
                      returnDeliveryAction({
                        delivery_id: deliveryId,
                        reason: reason.trim(),
                        confirm: true,
                      }),
                    () => {
                      setPanel("none");
                      setReason("");
                    }
                  );
                }}
              >
                Confirmer le retour
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}