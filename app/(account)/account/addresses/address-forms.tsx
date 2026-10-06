"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { phoneSchema } from "@/lib/validations/schemas";
import { createAddressAction, deleteAddressAction } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Formulaire d'enregistrement d'une adresse de livraison.
 *
 * Le quartier saisi est vérifié côté serveur : il doit appartenir à une zone
 * desservie, sinon les frais de livraison ne peuvent pas être calculés.
 */
export function AddressForm({ quarters }: { quarters: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const payload = {
      city: String(form.get("city") ?? ""),
      quarter: String(form.get("quarter") ?? ""),
      landmark: String(form.get("landmark") ?? ""),
      sector: String(form.get("sector") ?? "") || null,
      instructions: String(form.get("instructions") ?? "") || null,
      isDefault: form.get("isDefault") === "on",
    };

    startTransition(async () => {
      const result = await createAddressAction(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
      event.currentTarget.reset();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajouter une adresse</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Input label="Ville" name="city" defaultValue="Niamey" required />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="quarter" className="text-sm font-medium text-text">
              Quartier
            </label>
            <select
              id="quarter"
              name="quarter"
              required
              defaultValue=""
              className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text"
            >
              <option value="">Sélectionnez votre quartier</option>
              {quarters.map((quarter) => (
                <option key={quarter} value={quarter}>
                  {quarter}
                </option>
              ))}
            </select>
            {fieldErrors.quarter ? (
              <p role="alert" className="text-xs text-danger">
                {fieldErrors.quarter}
              </p>
            ) : null}
          </div>

          <Input label="Secteur (facultatif)" name="sector" />

          <Input
            label="Point de repère"
            name="landmark"
            hint="Ex. face pharmacie, après le carrefour"
            required
          />

          <Textarea
            label="Instructions de livraison (facultatif)"
            name="instructions"
            rows={2}
          />

          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              name="isDefault"
              className="size-4 rounded border-border"
            />
            Utiliser comme adresse par défaut
          </label>

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <Button type="submit" isLoading={isPending} loadingLabel="Enregistrement" disabled={isPending}>
            Enregistrer l&apos;adresse
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** Bouton de suppression d'une adresse, avec confirmation. */
export function DeleteAddressButton({ addressId }: { addressId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!window.confirm("Supprimer définitivement cette adresse ?")) return;
    setError(null);

    startTransition(async () => {
      const result = await deleteAddressAction({ addressId });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        isLoading={isPending}
        disabled={isPending}
        aria-label="Supprimer cette adresse"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Supprimer
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Garde l'export de `phoneSchema` utilisé par les formulaires du compte. */
export { phoneSchema };