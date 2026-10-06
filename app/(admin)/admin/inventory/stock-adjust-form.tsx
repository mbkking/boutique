"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustStockAction,
  receiveStockAction,
  updateStockThresholdAction,
} from "@/lib/actions/admin/inventory";
import { Button } from "@/components/ui/button";

interface StockAdjustFormProps {
  variantId: string;
  productName: string;
  currentQuantity: number;
  currentThreshold: number;
}

/**
 * Ajustement du stock d'une variante.
 *
 * Le motif est obligatoire : le cahier des charges impose qu'aucun ajustement
 * ne soit tracé sans justification. L'action serveur refuse toute valeur
 * négative et journalise l'opération avec son auteur.
 */
export function StockAdjustForm({
  variantId,
  productName,
  currentQuantity,
  currentThreshold,
}: StockAdjustFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(String(currentQuantity));
  const [reason, setReason] = useState("");
  const [threshold, setThreshold] = useState(String(currentThreshold));
  const [mode, setMode] = useState<"ajustement" | "entree">("ajustement");

  const reasonIsValid = reason.trim().length >= 3;
  const parsedQuantity = Number.parseInt(quantity, 10);

  function run(
    label: string,
    action: () => Promise<{ success: boolean; error?: string }>
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
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-green-700">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["ajustement", "entree"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              mode === value ? "bg-primary text-white" : "bg-white text-gray-700"
            }`}
          >
            {value === "ajustement" ? "Ajuster à" : "Recevoir"}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (mode === "entree") {
            const added = Number.parseInt(quantity, 10);
            if (!Number.isFinite(added) || added < 1) {
              setError("Saisissez une quantité reçue d'au moins 1.");
              return;
            }
            run("Entrée enregistrée.", () =>
              receiveStockAction({ variantId, quantity: added, reason: reason.trim() })
            );
            return;
          }

          if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
            setError("Le stock ne peut pas être négatif.");
            return;
          }

          run("Stock ajusté.", () =>
            adjustStockAction({ variantId, newQuantity: parsedQuantity, reason: reason.trim() })
          );
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`qty-${variantId}`} className="text-xs font-medium text-gray-700">
            {mode === "ajustement" ? "Nouveau stock" : "Quantité reçue"}
          </label>
          <input
            id={`qty-${variantId}`}
            type="number"
            min={mode === "entree" ? 1 : 0}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="h-9 w-28 rounded-lg border border-gray-300 bg-white px-2 text-sm"
          />
        </div>

        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor={`reason-${variantId}`} className="text-xs font-medium text-gray-700">
            Motif (obligatoire)
          </label>
          <input
            id={`reason-${variantId}`}
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ex. : inventaire annuel, casse, retour client"
            className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
          />
        </div>

        <Button
          type="submit"
          size="sm"
          disabled={isPending || !reasonIsValid}
          isLoading={isPending}
          loadingLabel="Enregistrement"
        >
          Appliquer
        </Button>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number.parseInt(threshold, 10);
          if (!Number.isFinite(value) || value < 0) {
            setError("Le seuil ne peut pas être négatif.");
            return;
          }
          run("Seuil mis à jour.", () =>
            updateStockThresholdAction({ variantId, lowStockThreshold: value })
          );
        }}
        className="flex flex-wrap items-end gap-3 border-t border-gray-200 pt-3"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`threshold-${variantId}`} className="text-xs font-medium text-gray-700">
            Seuil d&apos;alerte
          </label>
          <input
            id={`threshold-${variantId}`}
            type="number"
            min={0}
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            className="h-9 w-24 rounded-lg border border-gray-300 bg-white px-2 text-sm"
          />
        </div>

        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={isPending}
          isLoading={isPending}
          loadingLabel="Mise à jour"
        >
          Mettre à jour le seuil
        </Button>
      </form>

      <p className="text-xs text-gray-400">
        {`${productName} — stock actuel : ${currentQuantity}`}
      </p>
    </div>
  );
}