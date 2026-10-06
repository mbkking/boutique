"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPromotionAction } from "@/lib/actions/admin/promotions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Création d'une promotion. Les montants restent en FCFA entiers. */
export function PromotionForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      type: String(form.get("type") ?? "PERCENTAGE"),
      value: Number.parseInt(String(form.get("value") ?? "0"), 10),
      minOrderAmount: form.get("minOrderAmount")
        ? Number.parseInt(String(form.get("minOrderAmount")), 10)
        : null,
      startsAt: String(form.get("startsAt") ?? ""),
      endsAt: String(form.get("endsAt") ?? ""),
      isActive: form.get("isActive") === "on",
    };

    startTransition(async () => {
      const result = await createPromotionAction(payload);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSaved(true);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nouvelle promotion</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          {error ? <Alert variant="danger">{error}</Alert> : null}
          {saved ? <Alert variant="success">Promotion créee.</Alert> : null}

          <Input id="promo_name" name="name" label="Nom" required />
          <div className="flex flex-col gap-1">
            <label htmlFor="promo_type" className="text-sm font-medium text-text">
              Type
            </label>
            <select
              id="promo_type"
              name="type"
              className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text"
              defaultValue="PERCENTAGE"
            >
              <option value="PERCENTAGE">Pourcentage</option>
              <option value="FIXED_AMOUNT">Montant fixe (FCFA)</option>
            </select>
          </div>

          <Input id="promo_value" name="value" label="Valeur" type="number" min={0} required />
          <Input
            id="promo_min"
            name="minOrderAmount"
            label="Montant minimum de commande (FCFA)"
            type="number"
            min={0}
          />
          <Input id="promo_start" name="startsAt" label="Début" type="datetime-local" required />
          <Input id="promo_end" name="endsAt" label="Fin" type="datetime-local" required />

          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" name="isActive" defaultChecked />
            Active immédiatement
          </label>

          <div className="sm:col-span-2">
            <Button type="submit" isLoading={isPending} loadingLabel="Création">
              Créer la promotion
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
