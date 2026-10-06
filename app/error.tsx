"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Page d'erreur globale (segment `app`).
 *
 * Elle intercepte les erreurs de rendu des pages publiques. Comme les couches
 * de données dégradent déjà leurs échecs, cette page reste le filet de sécurité
 * pour les imprévus (erreur réseau, exception inattendue).
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("Erreur de rendu de la page :", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-danger">
        Une erreur est survenue
      </p>

      <h1 className="text-3xl font-bold text-text sm:text-4xl">
        Nous ne pouvons pas afficher cette page
      </h1>

      <p className="text-base text-text-muted">
        Un problème technique est survenu de notre côté. Vous pouvez réessayer, ou
        revenir à l&apos;accueil si le problème persiste.
      </p>

      {error.digest ? (
        <p className="text-xs text-text-muted">
          Référence technique : <code>{error.digest}</code>
        </p>
      ) : null}

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="lg" onClick={reset}>
          Réessayer
        </Button>
        <Link href="/">
          <Button variant="outline" size="lg">
            Retour à l&apos;accueil
          </Button>
        </Link>
      </div>
    </div>
  );
}