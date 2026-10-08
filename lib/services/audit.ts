import type { SupabaseAdminClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export interface AuditEntry {
  actor_id: string | null;
  actor_role: UserRole | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip_hash?: string | null;
}

/**
 * Journalise une action métier sensible (RM-07).
 * N'échoue jamais : une erreur d'audit ne doit pas annuler l'opération métier,
 * mais elle est remontée sur la console pour alerte.
 */
export async function logAuditEntry(
  supabase: SupabaseAdminClient,
  entry: AuditEntry
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: entry.actor_id,
    actor_role: entry.actor_role,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    before_json: entry.before ?? null,
    after_json: entry.after ?? null,
    ip_hash: entry.ip_hash ?? null,
  });

  if (error) {
    console.error("[audit] échec journalisation", {
      action: entry.action,
      entity: entry.entity_type,
      error: error.message,
    });
  }
}

export const AUDIT_ACTIONS = {
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_CONFIRMED: "ORDER_CONFIRMED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_STATUS_CHANGED: "ORDER_STATUS_CHANGED",
  PRODUCT_CREATED: "PRODUCT_CREATED",
  PRODUCT_UPDATED: "PRODUCT_UPDATED",
  STOCK_ADJUSTED: "STOCK_ADJUSTED",
  STOCK_RECEIVED: "STOCK_RECEIVED",
  STOCK_THRESHOLD_UPDATED: "STOCK_THRESHOLD_UPDATED",
  DELIVERY_ASSIGNED: "DELIVERY_ASSIGNED",
  DELIVERY_RESCHEDULED: "DELIVERY_RESCHEDULED",
  DELIVERY_RETURNED: "DELIVERY_RETURNED",
  DELIVERY_PROOF_ADDED: "DELIVERY_PROOF_ADDED",
  CASH_COLLECTED: "CASH_COLLECTED",
  COUPON_CREATED: "COUPON_CREATED",
  COUPON_UPDATED: "COUPON_UPDATED",
  /** Activation/désactivation d'un code promo. */
  COUPON_STATUS_CHANGED: "COUPON_STATUS_CHANGED",
  /** Suppression définitive d'un code promo jamais utilisé. */
  COUPON_DELETED: "COUPON_DELETED",
  SETTINGS_UPDATED: "SETTINGS_UPDATED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  DRIVER_INVITED: "DRIVER_INVITED",
  /** Extraction en masse de coordonnées clients (RM-07). */
  ORDERS_EXPORTED: "ORDERS_EXPORTED",
  /** Suppression refusée car l'entité possède un historique ou des dépendances. */
  DELETE_REFUSED: "DELETE_REFUSED",
} as const;
