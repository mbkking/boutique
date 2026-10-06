"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteCategoryAction } from "@/lib/actions/admin/catalog";
import { Button } from "@/components/ui/button";

interface CategoryRowActionsProps {
  categoryId: string;
  categoryName: string;
  productCount: number;
  childCount: number;
  canWrite: boolean;
  /** Ouvre le formulaire de la page en mode édition. */
  onEdit: () => void;
}

/**
 * Modification et suppression d'une catégorie.
 *
 * La suppression est bloquée côté serveur si la catégorie contient des produits
 * ou des sous-catégories. Le compte est affiché ici pour que la raison du
 * refus soit visible avant le clic, et l'action propose alors la désactivation.
 */
export function CategoryRowActions({
  categoryId,
  categoryName,
  productCount,
  childCount,
  canWrite,
  onEdit,
}: CategoryRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  function handleDelete() {
    setError(null);

    startTransition(async () => {
      const result = await deleteCategoryAction({ id: categoryId });

      if (!result.success) {
        setError(result.error);
        setIsConfirming(false);
        return;
      }

      setIsConfirming(false);
      router.refresh();
    });
  }

  if (!canWrite) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {error ? (
        <p role="alert" className="max-w-72 text-right text-xs text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={onEdit}
        >
          <Pencil aria-hidden="true" className="size-3.5" />
          Modifier
        </Button>

        {isConfirming ? (
          <span className="flex flex-wrap items-center gap-1 rounded-lg bg-red-50 px-2 py-1">
            <span className="text-xs text-red-700">
              {`Supprimer « ${categoryName} » ?`}
            </span>
            <Button
              variant="danger"
              size="sm"
              disabled={isPending}
              isLoading={isPending}
              onClick={handleDelete}
            >
              Supprimer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setIsConfirming(false)}
            >
              Annuler
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-700"
            disabled={isPending}
            onClick={() => {
              setError(null);
              setIsConfirming(true);
            }}
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
            Supprimer
          </Button>
        )}
      </div>

      {productCount > 0 || childCount > 0 ? (
        <p className="text-right text-xs text-text-muted">
          {productCount > 0
            ? `${productCount} produit(s) : désactivez la catégorie plutôt que de la supprimer.`
            : `${childCount} sous-catégorie(s) : supprimez-les d'abord.`}
        </p>
      ) : null}
    </div>
  );
}