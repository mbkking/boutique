"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** Rendu de la cellule. Absent, la valeur brute est affichée. */
  render?: (row: T) => ReactNode;
  /** Rend la colonne triable ; à n'utiliser que sur un critère déjà chargé. */
  sortable?: boolean;
  /** Valeur comparée lors du tri. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
}

export interface DataTableProps<T> {
  columns: ReadonlyArray<DataTableColumn<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyLabel?: string;
  caption?: string;
  className?: string;
}

/**
 * Tableau de données.
 *
 * Pensé pour le back-office sur téléphone : sous 640 px, chaque ligne devient
 * une carte empilée, libellé au-dessus de la valeur. Un tableau à colonnes
 * fixes serait illisible sur un écran étroit — et le cahier des charges
 * interdit explicitement les tableaux inutilisables sur mobile.
 *
 * `role="table"` explicite sur mobile : la sémantique de tableau disparaît quand
 * la mise en page change ; on la rétablit pour que les lecteurs d'écran
 * annoncent encore les en-têtes de colonne.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyLabel,
  caption,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [ascending, setAscending] = useState(true);

  const sortedRows = useMemo(() => {
    const column = columns.find((entry) => entry.key === sortKey);
    if (!column?.sortValue) return rows;

    const getValue = column.sortValue;
    return [...rows].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);

      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), "fr", { numeric: true });

      return ascending ? comparison : -comparison;
    });
  }, [columns, rows, sortKey, ascending]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setAscending((current) => !current);
      return;
    }
    setSortKey(key);
    setAscending(true);
  }

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">{emptyLabel}</p>;
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table role="table" className="w-full border-collapse text-sm">
        {caption ? (
          <caption className="sr-only">{caption}</caption>
        ) : null}

        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-border">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  sortKey === column.key
                    ? ascending
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className={cn(
                  "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted",
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center",
                  column.className
                )}
              >
                {column.sortable && column.sortValue ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className="inline-flex items-center gap-1 hover:text-text"
                  >
                    {column.header}
                    {sortKey === column.key ? (
                      ascending ? (
                        <ChevronUp aria-hidden="true" className="size-3.5" />
                      ) : (
                        <ChevronDown aria-hidden="true" className="size-3.5" />
                      )
                    ) : null}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sortedRows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border",
                onRowClick && "cursor-pointer hover:bg-surface-alt"
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn("px-3 py-2.5 align-middle", column.className)}
                >
                  {/*
                    Sur mobile, chaque cellule porte son libellé de colonne :
                    sans cela, une valeur isolée n'a plus de sens.
                  */}
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-wide text-text-muted sm:hidden">
                    {column.header}
                  </span>
                  <span
                    className={cn(
                      "block sm:table-cell",
                      column.align === "right" && "sm:text-right"
                    )}
                  >
                    {column.render
                      ? column.render(row)
                      : String((row as Record<string, unknown>)[column.key] ?? "")}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}