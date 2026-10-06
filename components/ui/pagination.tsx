import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Construit le lien d'une page. Chaque appelant garde la maîtrise de ses paramètres d'URL. */
  buildHref: (page: number) => string;
  /** Étiquette du groupe de navigation, unique par page. */
  label?: string;
  /** Affiche une fenêtre de numéros de page en plus de précédent/suivant. */
  showNumbers?: boolean;
  className?: string;
}

/**
 * Numérotation des pages.
 *
 * Fenêtre glissante : première page, dernière page, et un voisinage de la page
 * courante. Sur une liste de 400 pages, afficher tous les numéros produit une
 * barre inutilisable sur téléphone.
 *
 * Les numéros sont des liens, pas des boutons : ils restent ouvrables dans un
 * nouvel onglet et fonctionnent sans JavaScript.
 */
function pageWindow(currentPage: number, totalPages: number): Array<number | "gap"> {
  const pages = new Set<number>([1, totalPages]);

  for (let offset = -1; offset <= 1; offset += 1) {
    const page = currentPage + offset;
    if (page >= 1 && page <= totalPages) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "gap"> = [];
  let previous = 0;

  for (const page of sorted) {
    if (previous && page - previous > 1) result.push("gap");
    result.push(page);
    previous = page;
  }

  return result;
}

export function Pagination({
  currentPage,
  totalPages,
  buildHref,
  label = "Pagination",
  showNumbers = false,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const controlClass =
    "tap-target inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors";

  return (
    <nav
      aria-label={label}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className
      )}
    >
      {/*
        Un lien désactivé reste un lien : il conserve sa place dans la barre et
        son libellé, ce qui évite que la mise en page saute d'une page à
        l'autre. `aria-disabled` le sort de la navigation pour le lecteur
        d'écran, et `pointer-events-none` le neutralise à la souris.
      */}
      {hasPrevious ? (
        <Link
          href={buildHref(currentPage - 1)}
          rel="prev"
          className={cn(controlClass, "text-text hover:bg-surface-alt")}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          <span>Précédent</span>
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className={cn(controlClass, "text-text-muted opacity-50")}
        >
          <ChevronLeft className="size-4" />
          <span>Précédent</span>
        </span>
      )}

      <p aria-live="polite" className="text-sm text-text-muted">
        Page {currentPage} sur {totalPages}
      </p>

      {hasNext ? (
        <Link
          href={buildHref(currentPage + 1)}
          rel="next"
          className={cn(controlClass, "text-text hover:bg-surface-alt")}
        >
          <span>Suivant</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span
          aria-hidden="true"
          className={cn(controlClass, "text-text-muted opacity-50")}
        >
          <span>Suivant</span>
          <ChevronRight className="size-4" />
        </span>
      )}

      {showNumbers ? (
        <ul className="flex w-full items-center justify-center gap-1">
          {pageWindow(currentPage, totalPages).map((page, index) =>
            page === "gap" ? (
              <li
                key={`gap-${index}`}
                aria-hidden="true"
                className="px-1 text-sm text-text-muted"
              >
                …
              </li>
            ) : (
              <li key={page}>
                <Link
                  href={buildHref(page)}
                  aria-current={page === currentPage ? "page" : undefined}
                  aria-label={`Page ${page}`}
                  className={cn(
                    "tap-target inline-flex size-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                    page === currentPage
                      ? "border-primary bg-primary text-white"
                      : "border-border text-text hover:bg-surface-alt"
                  )}
                >
                  {page}
                </Link>
              </li>
            )
          )}
        </ul>
      ) : null}
    </nav>
  );
}