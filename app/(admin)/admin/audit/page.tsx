import Link from "next/link";
import { ScrollText } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listAdminAudit } from "@/lib/data/admin/catalog";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = {
  title: "Audit",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  ORDER_CREATED: "Commande créée",
  ORDER_CONFIRMED: "Commande confirmée",
  ORDER_CANCELLED: "Commande annulée",
  ORDER_STATUS_CHANGED: "Statut de commande modifié",
  PRODUCT_CREATED: "Produit créé",
  PRODUCT_UPDATED: "Produit modifié",
  STOCK_ADJUSTED: "Stock ajusté",
  STOCK_RECEIVED: "Entrée de stock",
  STOCK_THRESHOLD_UPDATED: "Seuil de stock modifié",
  DELIVERY_ASSIGNED: "Livraison affectée",
  CASH_COLLECTED: "Encaissement enregistré",
};

const ENTITY_TYPES = [
  { value: "tous", label: "Toutes les entités" },
  { value: "order", label: "Commandes" },
  { value: "product", label: "Produits" },
  { value: "product_variant", label: "Variantes" },
  { value: "category", label: "Catégories" },
];

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

/** Rendu d'un objet JSON, borné pour rester lisible. */
function renderJson(value: Record<string, unknown> | null): string {
  if (!value) return "—";
  const entries = Object.entries(value).slice(0, 6);
  if (entries.length === 0) return "—";
  return entries.map(([key, val]) => `${key}: ${String(val)}`).join(", ");
}

/**
 * Journal d'audit.
 *
 * Réservé à l'administrateur : il révèle qui a fait quoi, y compris sur des
 * données clients. Aucun secret ni mot de passe n'y figure — seules les
 * modifications de métier sont journalisées.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  await guardPage([PERMISSIONS.AUDIT_READ]);

  const entityType = typeof params.entite === "string" ? params.entite : "tous";
  const entries = await listAdminAudit({ entityType, limit: 150 });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Journal d&apos;audit</h1>
        <p className="text-sm text-gray-500">
          {`${entries.length} entrée(s) — les opérations sensibles y sont consignées avec leur auteur et leur horodatage.`}
        </p>
      </header>

      <Card>
        <CardContent>
          <form method="get" action="/admin/audit" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="entite" className="text-sm font-medium text-gray-700">
                Entité
              </label>
              <select
                id="entite"
                name="entite"
                defaultValue={entityType}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                {ENTITY_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary-dark"
            >
              Filtrer
            </button>

            <Link
              href="/admin/audit"
              className="inline-flex h-10 items-center px-3 text-sm text-gray-600 hover:underline"
            >
              Réinitialiser
            </Link>
          </form>
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <EmptyState
          icon={<ScrollText aria-hidden="true" className="size-6" />}
          title="Aucune entrée"
          description="Aucune opération n'a encore été journalisée pour ce filtre."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Card>
                <CardContent className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>

                  <span className="text-xs text-gray-600">
                    {`${entry.actorName ?? "Système"} — rôle : ${
                      entry.actorRole ?? "—"
                    } — ${entry.entityType}`}
                  </span>

                  {entry.before ? (
                    <span className="text-xs text-gray-500">
                      {`Avant : ${renderJson(entry.before)}`}
                    </span>
                  ) : null}
                  {entry.after ? (
                    <span className="text-xs text-gray-500">
                      {`Après : ${renderJson(entry.after)}`}
                    </span>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}