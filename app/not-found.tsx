import Link from "next/link";
import { Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Page 404 — proposée quand une ressource (produit, catégorie, commande)
 * n'existe pas. Le rendu reste entièrement en français et propose des sorties.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">
        Erreur 404
      </p>

      <h1 className="text-3xl font-bold text-text sm:text-4xl">
        Cette page est introuvable
      </h1>

      <p className="text-base text-text-muted">
        La page que vous cherchez n&apos;existe pas, a été déplacée ou le lien est
        incomplet. Vérifiez l&apos;adresse, ou revenez au catalogue pour poursuivre
        vos achats.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/">
          <Button variant="primary" size="lg">
            <Home aria-hidden="true" className="size-4" />
            Retour à l&apos;accueil
          </Button>
        </Link>

        <Link href="/search">
          <Button variant="outline" size="lg">
            <Search aria-hidden="true" className="size-4" />
            Rechercher un produit
          </Button>
        </Link>
      </div>
    </div>
  );
}