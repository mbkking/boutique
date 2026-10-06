import "server-only";

import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import type {
  AuditLog,
  Delivery,
  Order,
  OrderItem,
  OrderStatusHistory,
} from "@/types";

/** Détail complet d'une commande, pour l'écran d'administration. */

export interface AdminOrderDetail {
  order: Order;
  items: OrderItem[];
  history: OrderStatusHistory[];
  delivery: Delivery | null;
  driverName: string | null;
  zoneName: string | null;
  /** Encaissements enregistrés pour cette livraison. */
  collections: Array<{
    id: string;
    expectedAmount: number;
    collectedAmount: number;
    method: string;
    discrepancyReason: string | null;
    collectedAt: string | null;
  }>;
  /** Entrées d'audit portant sur cette commande. */
  audit: AuditLog[];
  /** Écart entre le montant attendu et le montant encaissé. */
    outstanding: number;
}

const ORDER_SELECT = `
  id,
  order_number,
  customer_id,
  status,
  payment_method,
  payment_status,
  subtotal,
  delivery_fee,
  discount,
  total,
  currency,
  address_snapshot,
  notes,
  created_at,
  updated_at
`;

const ITEM_SELECT = `
  id,
  order_id,
  variant_id,
  product_name,
  sku,
  variant_attributes,
  unit_price,
  quantity,
  line_total
`;

const HISTORY_SELECT = `id, order_id, status, notes, created_by, created_at`;

const DELIVERY_SELECT = `id, order_id, driver_id, zone_id, status, assigned_at, picked_up_at, delivered_at, failure_reason, failure_notes`;

const COLLECTION_SELECT = `
  id,
  delivery_id,
  expected_amount,
  collected_amount,
  method,
  discrepancy_reason,
  collected_at
`;

const AUDIT_SELECT = `
  id,
  actor_id,
  actor_role,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
  created_at
`;

/**
 * Commande complète avec ses lignes, son historique, sa livraison, ses
 * encaissements et son audit.
 *
 * Les prix affichés proviennent des **snapshots** de `order_items` : si le
 * catalogue change le lendemain, l'historique reste identique.
 */
export async function getAdminOrderDetail(orderId: string): Promise<AdminOrderDetail | null> {
  if (!orderId) return null;

  const orderOutcome = await safeQuery("adminOrder.detail", (supabase) =>
    supabase.from("orders").select(ORDER_SELECT).eq("id", orderId).limit(1)
  );

  const order = toSingle(orderOutcome) as Order | null;
  if (!order) return null;

  const [itemsOutcome, historyOutcome, deliveryOutcome] = await Promise.all([
    safeQuery("adminOrder.items", (supabase) =>
      supabase
        .from("order_items")
        .select(ITEM_SELECT)
        .eq("order_id", order.id)
        .order("product_name", { ascending: true })
    ),
    safeQuery("adminOrder.history", (supabase) =>
      supabase
        .from("order_status_history")
        .select(HISTORY_SELECT)
        .eq("order_id", order.id)
        .order("created_at", { ascending: true })
    ),
    safeQuery("adminOrder.delivery", (supabase) =>
      supabase
        .from("deliveries")
        .select(DELIVERY_SELECT)
        .eq("order_id", order.id)
        .limit(1)
    ),
  ]);

  const delivery = toSingle(deliveryOutcome) as Delivery | null;

  const [collectionsOutcome, auditOutcome] = await Promise.all([
    safeQuery("adminOrder.collections", async (supabase) => {
      if (!delivery) return supabase.from("cash_collections").select(COLLECTION_SELECT).limit(0);
      return supabase
        .from("cash_collections")
        .select(COLLECTION_SELECT)
        .eq("delivery_id", delivery.id)
        .order("collected_at", { ascending: true });
    }),
    safeQuery("adminOrder.audit", (supabase) =>
      supabase
        .from("audit_logs")
        .select(AUDIT_SELECT)
        .eq("entity_type", "order")
        .eq("entity_id", order.id)
        .order("created_at", { ascending: false })
        .limit(50)
    ),
  ]);

  // Noms du livreur et de la zone, résolus seulement s'il y a une livraison.
  let driverName: string | null = null;
  let zoneName: string | null = null;

  if (delivery) {
    const [driverOutcome, zoneOutcome] = await Promise.all([
      delivery.driver_id
        ? safeQuery("adminOrder.driver", (supabase) =>
            supabase.from("profiles").select("full_name").eq("id", delivery.driver_id).limit(1)
          )
        : Promise.resolve({ data: [], error: null, count: null }),
      delivery.zone_id
        ? safeQuery("adminOrder.zone", (supabase) =>
            supabase.from("delivery_zones").select("name").eq("id", delivery.zone_id).limit(1)
          )
        : Promise.resolve({ data: [], error: null, count: null }),
    ]);

    const driverRow = toSingle(driverOutcome);
    const zoneRow = toSingle(zoneOutcome);

    driverName = typeof driverRow?.full_name === "string" ? driverRow.full_name : null;
    zoneName = typeof zoneRow?.name === "string" ? zoneRow.name : null;
  }

  const collections = toList(collectionsOutcome)
    .filter((row) => row && typeof row.id === "string")
    .map((row) => ({
      id: String(row.id),
      expectedAmount: typeof row.expected_amount === "number" ? row.expected_amount : 0,
      collectedAmount:
        typeof row.collected_amount === "number" ? row.collected_amount : 0,
      method: typeof row.method === "string" ? row.method : "COD",
      discrepancyReason:
        typeof row.discrepancy_reason === "string" ? row.discrepancy_reason : null,
      collectedAt: typeof row.collected_at === "string" ? row.collected_at : null,
    }));

  const collected = collections.reduce((sum, entry) => sum + entry.collectedAmount, 0);

  return {
    order,
    items: toList(itemsOutcome) as OrderItem[],
    history: toList(historyOutcome) as OrderStatusHistory[],
    delivery,
    driverName,
    zoneName,
    collections,
    audit: toList(auditOutcome) as AuditLog[],
    outstanding: Math.max(0, order.total - collected),
  };
}