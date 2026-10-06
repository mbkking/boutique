"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deletePromotionAction,
  togglePromotionAction,
} from "@/lib/actions/admin/promotions";
import { Button } from "@/components/ui/button";

export function PromotionRowActions({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "L'opération a Échou�.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => run(() => togglePromotionAction(id, !isActive))}
      >
        {isActive ? "Désactiver" : "Activer"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          if (window.confirm("Supprimer définitivement cette promotion ?")) {
            run(() => deletePromotionAction(id));
          }
        }}
      >
        Supprimer
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
