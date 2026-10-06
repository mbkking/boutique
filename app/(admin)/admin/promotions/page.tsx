import { Tag } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { safeQuery, toList } from "@/lib/data/safe";
import { formatPrice } from "@/lib/services/pricing";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PromotionForm } from "./promotion-form";
import { PromotionRowActions } from "./promotion-row-actions";

export const metadata = {
  title: "Promotions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PromotionRow {
  id: string;
  name: string;
  type: string;
  value: number;
  min_order_amount: number | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

/**
 * Promotions.
 *
 * Le montant de la remise n'est jamais lu depuis le client : `listActivePromotions`
 * filtre sur la fenêtre de dates, et `createOrderAction` recalcule la remise en
 * base. Afficher une promotion ici n'engage rien sur le montant final.
 */
export default async function AdminPromotionsPage() {
  await guardPage([PERMISSIONS.SETTINGS_READ]);

  const outcome = await safeQuery("adminPromotions.list", (supabase) =>
    supabase
      .from("promotions")
      .select(
        "id, name, type, value, min_order_amount, starts_at, ends_at, is_active"
      )
      .order("starts_at", { ascending: false })
      .limit(200)
  );

  const rows = toList(outcome) as unknown as PromotionRow[];

  // L'instant de référence est calculé côté serveur une seule fois ; l'évaluer
  // pendant le rendu rendrait le résultat instable entre deux rendus.
  const referenceTime = Date.parse(new Date().toISOString());

  const active = rows.filter(
    (row) =>
      row.is_active &&
      Date.parse(row.starts_at) <= referenceTime &&
      Date.parse(row.ends_at) >= referenceTime
  );
  const scheduled = rows.filter(
    (row) => row.is_active && Date.parse(row.starts_at) > referenceTime
  );
  const expired = rows.filter((row) => Date.parse(row.ends_at) < referenceTime);

  const renderList = (
    items: PromotionRow[],
    emptyLabel: string
  ) =>
    items.length === 0 ? (
      <p className="text-sm text-gray-500">{emptyLabel}</p>
    ) : (
      <ul className="flex flex-col gap-3">
        {items.map((promotion) => (
          <li key={promotion.id}>
            <Card>
              <CardContent className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-semibold text-gray-900">
                    {promotion.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {`Du ${formatDate(promotion.starts_at)} au ${formatDate(promotion.ends_at)}`}
                  </span>
                  {promotion.min_order_amount ? (
                    <span className="text-xs text-gray-500">
                      {`Minimum de commande : ${formatPrice(promotion.min_order_amount)}`}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="text-lg font-bold text-gray-900">
                    {promotion.type === "PERCENTAGE"
                      ? `-${promotion.value} %`
                      : `-${formatPrice(promotion.value)}`}
                  </span>
                  <span className="text-xs text-gray-500">
                    {promotion.type === "PERCENTAGE" ? "pourcentage" : "montant fixe"}
                  </span>
                  <PromotionRowActions id={promotion.id} isActive={promotion.is_active} />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Promotions</h1>
        <p className="text-sm text-gray-500">
          {`${active.length} active(s), ${scheduled.length} programmée(s), ${expired.length} terminée(s).`}
        </p>
      </header>

      <PromotionForm />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Tag aria-hidden="true" className="size-6" />}
          title="Aucune promotion"
          description="Les promotions permettent de constituer des remises recalculées par le serveur."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="promo-actives" className="flex flex-col gap-3">
            <h2 id="promo-actives" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {`Actives (${active.length})`}
            </h2>
            {renderList(active, "Aucune promotion active.")}
          </section>

          {scheduled.length > 0 ? (
            <section aria-labelledby="promo-programmees" className="flex flex-col gap-3">
              <h2
                id="promo-programmees"
                className="text-sm font-semibold uppercase tracking-wide text-gray-500"
              >
                {`Programmées (${scheduled.length})`}
              </h2>
              {renderList(scheduled, "")}
            </section>
          ) : null}

          {expired.length > 0 ? (
            <section aria-labelledby="promo-terminees" className="flex flex-col gap-3">
              <h2
                id="promo-terminees"
                className="text-sm font-semibold uppercase tracking-wide text-gray-500"
              >
                {`Terminées (${expired.length})`}
              </h2>
              {renderList(expired, "")}
            </section>
          ) : null}
        </div>
      )}

      <p className="text-xs text-gray-400">
        La remise est recalculée côté serveur à chaque commande à partir de cette
        configuration : une valeur envoyée par le navigateur est ignorée.
      </p>
    </div>
  );
}