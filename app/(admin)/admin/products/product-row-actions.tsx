"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Archive, Copy, Pencil, Trash2 } from "lucide-react";
import {
  archiveProductAction,
  deleteProductAction,
  duplicateProductAction,
} from "@/lib/actions/admin/catalog";
import { Button } from "@/components/ui/button";

interface ProductRowActionsProps {
  productId: string;
  productName: string;
  isActive: boolean;
  canWrite: boolean;
}

/**
 * Actions d'un produit : duplication, modification, archivage, suppression.
 *
 * La suppression n'est offered que pour un produit sans historique : dès qu'une
 * commande, un panier ou un mouvement de stock le référence, l'action serveur
 * refuse et renvoie vers l'archivage, qui retire l'article de la vente sans
 * effacer la trace. L'archivage est donc toujours disponible en secours.
 */
export function ProductRowActions({
  productId,
  productName,
  isActive,
  canWrite,
}: ProductRowActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // La suppression est irréversible : on n'affiche la confirmation qu'après un
  // clic explicite, pour ne pas confondre « Supprimer » et « Archiver ».
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  function run(
    label: string,
    action: () => Promise<{ success: boolean; error?: string }>
  ) {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        setError(result.error ?? "L'opération a échoué.");
        return;
      }
      setMessage(label);
      setIsConfirmingDelete(false);
      router.refresh();
    });
  }

  function handleDelete() {
    run("Produit supprimé.", () => deleteProductAction({ id: productId }));
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
        <Link
          href={`/admin/products/${productId}`}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Pencil aria-hidden="true" className="size-3.5" />
          Modifier
        </Link>

        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          isLoading={isPending}
          onClick={() => run("Produit dupliqué.", () => duplicateProductAction({ id: productId }))}
        >
          <Copy aria-hidden="true" className="size-4" />
          Dupliquer
        </Button>

        {isActive ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-amber-700"
            disabled={isPending}
            isLoading={isPending}
            onClick={() => run("Produit archivé.", () => archiveProductAction({ id: productId }))}
          >
            <Archive aria-hidden="true" className="size-4" />
            Archiver
          </Button>
        ) : null}

        {isConfirmingDelete ? (
          <span className="flex flex-wrap items-center gap-1 rounded-lg bg-red-50 px-2 py-1">
            <span className="text-xs text-red-700">
              {`Supprimer « ${productName} » définitivement ?`}
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
              onClick={() => setIsConfirmingDelete(false)}
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
              setMessage(null);
              setIsConfirmingDelete(true);
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Supprimer
          </Button>
        )}
      </div>
    </div>
  );
}