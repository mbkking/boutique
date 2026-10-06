"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, Trash2 } from "lucide-react";
import { deleteCouponAction, toggleCouponStatusAction } from "@/lib/actions/admin/coupons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface CouponRowActionsProps {
  couponId: string;
  code: string;
  isActive: boolean;
  canWrite: boolean;
}

/**
 * Actions d'un code promo.
 *
 * Activation/désactivation est le geste du quotidien (code fuité, campagne
 * terminée) et reste sans confirmation. La suppression est irréversible et
 * passe par un `ConfirmDialog` — elle échoue en plus si le code a déjà servi,
 * auquel cas la désactivation reste possible.
 */
export function CouponRowActions({
  couponId,
  code,
  isActive,
  canWrite,
}: CouponRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(label: string, action: () => Promise<{ success: boolean; error?: string }>) {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "L'opération a échoué.");
        return;
      }
      setMessage(label);
      setIsDeleteOpen(false);
      router.refresh();
    });
  }

  if (!canWrite) {
    return <p className="text-xs text-gray-400">Lecture seule.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
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
        <Button
          variant={isActive ? "outline" : "primary"}
          size="sm"
          disabled={isPending}
          isLoading={isPending}
          onClick={() =>
            run(
              isActive ? `Code ${code} désactivé.` : `Code ${code} activé.`,
              () => toggleCouponStatusAction({ id: couponId, isActive: !isActive })
            )
          }
        >
          <Power aria-hidden="true" className="size-4" />
          {isActive ? "Désactiver" : "Activer"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="text-red-700"
          disabled={isPending}
          onClick={() => setIsDeleteOpen(true)}
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Supprimer
        </Button>
      </div>

      <ConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title={`Supprimer le code ${code} ?`}
        description="Cette action est définitive. Un code qui a déjà été utilisé doit être désactivé, jamais supprimé : l'historique des commandes doit rester lisible."
        confirmLabel="Supprimer"
        variant="danger"
        isPending={isPending}
        onConfirm={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await deleteCouponAction({ id: couponId });
            if (!result.success) {
              setError(result.error ?? "La suppression a échoué.");
              return;
            }
            setMessage(`Code ${code} supprimé.`);
            setIsDeleteOpen(false);
            router.refresh();
          });
        }}
      />
    </div>
  );
}
