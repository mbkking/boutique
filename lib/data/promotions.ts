import "server-only";

import { safeQuery, toList } from "@/lib/data/safe";
import type { Promotion } from "@/types";

const PROMOTION_SELECT = `
  id,
  name,
  type,
  value,
  min_order_amount,
  starts_at,
  ends_at,
  is_active,
  created_at,
  updated_at
`;

/**
 * Promotions applicables à l'instant présent.
 *
 * Le filtre de dates est appliqué en base (bornes incluses) pour ne jamais
 * appliquer une promotion hors de sa période de validité. Le montant minimum
 * d'achat reste ensuite évalué par le service de tarification.
 */
export async function listActivePromotions(): Promise<Promotion[]> {
  const now = new Date().toISOString();

  const outcome = await safeQuery("promotions.active", (supabase) =>
    supabase
      .from("promotions")
      .select(PROMOTION_SELECT)
      .eq("is_active", true)
      .lte("starts_at", now)
      .gte("ends_at", now)
      .order("value", { ascending: false })
  );

  return toList(outcome).map((promotion) => ({
    ...promotion,
    starts_at: new Date(promotion.starts_at).toISOString(),
    ends_at: new Date(promotion.ends_at).toISOString(),
  }));
}