import "server-only";

import { safeQuery, toList } from "@/lib/data/safe";
import type { OrderStatus, PaymentStatus } from "@/types";

/**
 * Données du tableau de bord d'administration.
 *
 * Aucune valeur n'est inventée ni estimée : chaque indicateur provient d'un
 * agrégat calculé en base par les fonctions de la migration 005. Si l'agrégat
 * est indisponible, on renvoie des zéros — jamais un chiffre plausible mais
 * faux.
 */

export interface AdminDashboardStats {
  ordersToday: number;
  /** Commandes en attente de confirmation par l'équipe. */
  ordersToConfirm: number;
  /** Commandes confirmées mais non encore affectées. */
  ordersPending: number;
  /** En préparation ou prêtes pour livraison. */
  ordersPreparing: number;
  /** Assignées, en route ou arrivées. */
  ordersOutForDelivery: number;
  ordersCompletedToday: number;
  ordersCancelledToday: number;
  deliveriesInProgress: number;
  deliveriesFailed: number;
  deliveriesToday: number;
  /** Somme réellement encaissée (table `cash_collections`). */
  amountCollected: number;
  /** Reste à encaisser sur les commandes non soldées. */
  amountExpected: number;
  /** Chiffre d'affaires du jour, hors commandes annulées. */
  revenueToday: number;
  customersTotal: number;
  productsTotal: number;
  /** Variantes sous le seuil d'alerte. */
  variantsLowStock: number;
  /** Variantes totalement épuisées. */
  variantsOutOfStock: number;
  /** Produits dont toutes les variantes sont épuisées. */
  productsOutOfStock: number;
}

export interface AdminRecentOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  total: number;
  createdAt: string;
  customerName: string | null;
  customerPhone: string | null;
  quarter: string | null;
}

export interface AdminStockAlert {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  stockOnHand: number;
  stockReserved: number;
  /** Stock réellement vendable, après réservations. */
  available: number;
  lowStockThreshold: number;
}

function emptyStats(): AdminDashboardStats {
  return {
    ordersToday: 0,
    ordersToConfirm: 0,
    ordersPending: 0,
    ordersPreparing: 0,
    ordersOutForDelivery: 0,
    ordersCompletedToday: 0,
    ordersCancelledToday: 0,
    deliveriesInProgress: 0,
    deliveriesFailed: 0,
    deliveriesToday: 0,
    amountCollected: 0,
    amountExpected: 0,
    revenueToday: 0,
    customersTotal: 0,
    productsTotal: 0,
    variantsLowStock: 0,
    variantsOutOfStock: 0,
    productsOutOfStock: 0,
  };
}

/** Convertit un `numeric` PostgreSQL (souvent une chaîne) en nombre. */
function toAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Convertit un `bigint` PostgreSQL (souvent une chaîne) en entier. */
function toCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Agrégats du tableau de bord.
 * Une seule requête SQL, exécutée côté base.
 */
export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const outcome = await safeQuery("admin.dashboardStats", (supabase) =>
    supabase.rpc("admin_dashboard_stats")
  );

  const row = outcome.data?.[0];
  if (!row) return emptyStats();

  return {
    ordersToday: toCount(row.orders_today),
    ordersToConfirm: toCount(row.orders_to_confirm),
    ordersPending: toCount(row.orders_pending),
    ordersPreparing: toCount(row.orders_preparing),
    ordersOutForDelivery: toCount(row.orders_out_for_delivery),
    ordersCompletedToday: toCount(row.orders_completed_today),
    ordersCancelledToday: toCount(row.orders_cancelled_today),
    deliveriesInProgress: toCount(row.deliveries_in_progress),
    deliveriesFailed: toCount(row.deliveries_failed),
    deliveriesToday: toCount(row.deliveries_today),
    amountCollected: toAmount(row.amount_collected),
    amountExpected: toAmount(row.amount_expected),
    revenueToday: toAmount(row.revenue_today),
    customersTotal: toCount(row.customers_total),
    productsTotal: toCount(row.products_total),
    variantsLowStock: toCount(row.variants_low_stock),
    variantsOutOfStock: toCount(row.variants_out_of_stock),
    productsOutOfStock: toCount(row.products_out_of_stock),
  };
}

const RECENT_ORDER_FIELDS = `
  id,
  order_number,
  status,
  payment_status,
  payment_method,
  total,
  created_at,
  customer_name,
  customer_phone,
  quarter
`;

interface RecentOrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  total: number;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  quarter: string | null;
}

/** Dernières commandes, pour la liste du tableau de bord. */
export async function listRecentOrders(limit = 10): Promise<AdminRecentOrder[]> {
  const outcome = await safeQuery("admin.recentOrders", (supabase) =>
    supabase.rpc("admin_recent_orders", { p_limit: limit })
  );

  return toList(outcome)
    .map((row) => toRecentOrder(row as RecentOrderRow))
    .filter((order): order is AdminRecentOrder => order !== null);
}

function toRecentOrder(row: RecentOrderRow): AdminRecentOrder | null {
  if (!row || typeof row.id !== "string" || typeof row.order_number !== "string") {
    return null;
  }

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    total: typeof row.total === "number" ? row.total : 0,
    createdAt: row.created_at,
    customerName: row.customer_name ?? null,
    customerPhone: row.customer_phone ?? null,
    quarter: row.quarter ?? null,
  };
}

interface StockAlertRow {
  variant_id: string;
  sku: string;
  product_id: string;
  product_name: string;
  stock_on_hand: number | string;
  stock_reserved: number | string;
  available: number | string;
  low_stock_threshold: number | string;
}

/** Alertes de stock : variantes au seuil ou épuisées. */
export async function listStockAlerts(limit = 20): Promise<AdminStockAlert[]> {
  const outcome = await safeQuery("admin.stockAlerts", (supabase) =>
    supabase.rpc("admin_stock_alerts", { p_limit: limit })
  );

  return toList(outcome)
    .filter((row): row is StockAlertRow => Boolean(row) && typeof row === "object")
    .filter((row) => typeof row.variant_id === "string")
    .map((row) => ({
      variantId: row.variant_id,
      sku: typeof row.sku === "string" ? row.sku : "",
      productId: typeof row.product_id === "string" ? row.product_id : "",
      productName: typeof row.product_name === "string" ? row.product_name : "",
      stockOnHand: toCount(row.stock_on_hand),
      stockReserved: toCount(row.stock_reserved),
      available: toCount(row.available),
      lowStockThreshold: toCount(row.low_stock_threshold),
    }));
}

export { RECENT_ORDER_FIELDS };

// ============================================================
// Séries temporelles (graphiques) et visites
// ============================================================

export interface DailySeriesPoint {
  day: string;
  orders: number;
  revenue: number;
  deliveriesCompleted: number;
  newCustomers: number;
  visits: number;
}

/** Série quotidienne agrégée en base (migration 020). */
export async function getAdminDailySeries(days = 7): Promise<DailySeriesPoint[]> {
  const outcome = await safeQuery("admin.dailySeries", (supabase) =>
    supabase.rpc("admin_daily_series", { p_days: days })
  );

  return toList(outcome).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      day: typeof r.day === "string" ? r.day : String(r.day ?? ""),
      orders: toCount(r.orders),
      revenue: toAmount(r.revenue),
      deliveriesCompleted: toCount(r.deliveries_completed),
      newCustomers: toCount(r.new_customers),
      visits: toCount(r.visits),
    };
  });
}

export interface AdminVisitsStats {
  visitsToday: number;
  visitsWeek: number;
  visitsMonth: number;
  uniqueSessionsToday: number;
  uniqueSessionsWeek: number;
}

export async function getAdminVisitsStats(): Promise<AdminVisitsStats> {
  const outcome = await safeQuery("admin.visitsStats", (supabase) =>
    supabase.rpc("admin_visits_stats")
  );

  const row = outcome.data?.[0] as Record<string, unknown> | undefined;
  if (!row) {
    return {
      visitsToday: 0,
      visitsWeek: 0,
      visitsMonth: 0,
      uniqueSessionsToday: 0,
      uniqueSessionsWeek: 0,
    };
  }

  return {
    visitsToday: toCount(row.visits_today),
    visitsWeek: toCount(row.visits_week),
    visitsMonth: toCount(row.visits_month),
    uniqueSessionsToday: toCount(row.unique_sessions_today),
    uniqueSessionsWeek: toCount(row.unique_sessions_week),
  };
}