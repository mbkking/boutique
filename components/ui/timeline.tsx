import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  /** Horodatage affichable ; l'ordre du tableau définit la chronologie. */
  timestamp?: string | null;
  /** Met en avant la dernière étape. */
  current?: boolean;
}

export interface TimelineProps {
  items: readonly TimelineItem[];
  className?: string;
  emptyLabel?: string;
}

/**
 * Chronologie d'un événement.
 *
 * Le contenu est une liste ordonnée : l'ordre de lecture est garanti par le
 * HTML, ce qui compte pour un lecteur d'écran. La ligne verticale relie les
 * étapes sans information supplémentaire.
 *
 * L'étape courante est signalée par `aria-current="step"` — la couleur seule ne
 * suffirait pas.
 */
export function Timeline({ items, className, emptyLabel }: TimelineProps) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">{emptyLabel ?? "Aucun événement."}</p>;
  }

  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <Fragment key={item.id}>
            <li
              aria-current={item.current ? "step" : undefined}
              className="flex gap-3"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1 size-3 shrink-0 rounded-full ring-4 ring-surface",
                  item.current ? "bg-primary" : "bg-border"
                )}
              />

              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-4">
                <span
                  className={cn(
                    "text-sm",
                    item.current ? "font-semibold text-text" : "font-medium text-text"
                  )}
                >
                  {item.label}
                </span>

                {item.description ? (
                  <span className="text-xs text-text-muted">{item.description}</span>
                ) : null}

                {item.timestamp ? (
                  <time className="text-xs text-text-muted">{item.timestamp}</time>
                ) : null}
              </div>
            </li>

            {!isLast ? (
              <span
                aria-hidden="true"
                className="-ml-[5px] block h-4 w-px shrink-0 bg-border"
              />
            ) : null}
          </Fragment>
        );
      })}
    </ol>
  );
}