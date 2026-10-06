import "server-only";

import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import type { DeliveryStatus, OrderStatus, PaymentStatus, UserRole } from "@/types";

/**
 * Données de la liste d'administration des commandes.
 *
 * Les filtres sont appliqués **dans la requête** : la liste affiche toujours le
 * contenu réellement correspondant, et jamais une page entière filtrée en
 * JavaScript (ce qui exposerait des commandes hors périmètre).
 */

export interface AdminOrderFilters {
  /** Statuts retenus. Vide ou absent = tous. */
  statuses?: readonly OrderStatus[];
  /** « today » | « week » | « month » | période libre ISO. */
  period?: string;
  /** Slug de zone de livraison, appliqué via l'instantané d'adresse. */
  zoneSlug?: string;
  /** Identifiant du livreur : ne liste que ses livraisons. */
  driverId?: string;
  paymentStatuses?: readonly PaymentStatus[];
  minTotal?: number;
  maxTotal?: number;
  /** Recherche libre sur numéro, nom ou téléphone. */
  search?: string;
  /** Restreint à un client donné (fiche client). */
  customerId?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  customerName: string | null;
  customerPhone: string | null;
  quarter: string | null;
  city: string | null;
  /** Zone de livraison déduite de l'instantané d'adresse. */
  zoneId: string | null;
  zoneName: string | null;
  /** Livraison associée, si elle existe. */
  deliveryId: string | null;
  deliveryStatus: DeliveryStatus | null;
  driverId: string | null;
  driverName: string | null;
}

export interface AdminOrderListResult {
  rows: AdminOrderRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const ORDER_FIELDS = `
  id,
  order_number,
  status,
  payment_status,
  payment_method,
  total,
  created_at,
  updated_at,
  address_snapshot,
  deliveries (
    id,
    status,
    driver_id,
    delivery_zones (id, name, slug)
  )
`;

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  total: number;
  created_at: string;
  updated_at: string;
  address_snapshot: {
    full_name?: string;
    phone?: string;
    quarter?: string;
    city?: string;
  } | null;
  deliveries: {
    id: string;
    status: DeliveryStatus;
    driver_id: string | null;
    delivery_zones: { id: string; name: string; slug: string } | null;
  } | null;
}

/** Bornes de dates pour une période nommée. */
function resolvePeriod(
  period: string | undefined
): { from: string | null; to: string | null } {
  if (!period) return { from: null, to: null };

  const now = new Date();

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: null };
  }

  if (period === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: null };
  }

  if (period === "month") {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: null };
  }

  // Période libre : deux dates ISO. Une seule peut être fournie.
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const from = new Date(`${period}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime())) return { from: null, to: null };
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  return { from: null, to: null };
}

function isValidAmount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function toRow(order: OrderRow, driverNames: Map<string, string>): AdminOrderRow {
  const address = order.address_snapshot ?? {};
  const delivery = order.deliveries;

  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    total: typeof order.total === "number" ? order.total : 0,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    customerName: address.full_name ?? null,
    customerPhone: address.phone ?? null,
    quarter: address.quarter ?? null,
    city: address.city ?? null,
    zoneId: delivery?.delivery_zones?.id ?? null,
    zoneName: delivery?.delivery_zones?.name ?? null,
    deliveryId: delivery?.id ?? null,
    deliveryStatus: delivery?.status ?? null,
    driverId: delivery?.driver_id ?? null,
    driverName: delivery?.driver_id ? (driverNames.get(delivery.driver_id) ?? null) : null,
  };
}

/** Noms des livreurs concernés, résolus en une requête. */
async function loadDriverNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return names;

  const outcome = await safeQuery("adminOrders.driverNames", (supabase) =>
    supabase.from("profiles").select("id, full_name").in("id", unique)
  );

  for (const row of toList(outcome)) {
    if (typeof row.id === "string" && typeof row.full_name === "string") {
      names.set(row.id, row.full_name);
    }
  }

  return names;
}

/**
 * Liste filtrée et paginée des commandes.
 * Le comptage total est demandé dans la même requête que les lignes.
 */
export async function listAdminOrders(
  filters: AdminOrderFilters = {}
): Promise<AdminOrderListResult> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(
    Math.max(1, Math.floor(filters.pageSize ?? DEFAULT_PAGE_SIZE)),
    MAX_PAGE_SIZE
  );

  const { from, to } = resolvePeriod(filters.period);

  // Recherche : le numéro de commande et le nom/téléphone de l'instantané
  // d'adresse sont ciblés côté base, sinon une commande située hors de la page
  // courante reste introuvable. Le `or()` combine une colonne simple et deux
  // clés du JSONB.
  const search = (filters.search ?? "").trim();

  const outcome = await safeQuery("adminOrders.list", (supabase) => {
    let builder = supabase
      .from("orders")
      .select(ORDER_FIELDS, { count: "exact" })
      .order("created_at", { ascending: false });

    if (filters.statuses && filters.statuses.length > 0) {
      builder = builder.in("status", [...filters.statuses]);
    }

    if (from) builder = builder.gte("created_at", from);
    if (to) builder = builder.lt("created_at", to);

    if (filters.paymentStatuses && filters.paymentStatuses.length > 0) {
      builder = builder.in("payment_status", [...filters.paymentStatuses]);
    }

    if (isValidAmount(filters.minTotal)) builder = builder.gte("total", filters.minTotal);
    if (isValidAmount(filters.maxTotal)) builder = builder.lte("total", filters.maxTotal);

    if (filters.driverId) {
      builder = builder.eq("deliveries.driver_id", filters.driverId);
    }

    if (filters.zoneSlug) {
      builder = builder.eq("deliveries.delivery_zones.slug", filters.zoneSlug);
    }

    if (filters.customerId) builder = builder.eq("customer_id", filters.customerId);

    if (search) {
      // Les caractères sensibles sont retirés avant d'entrer dans le filtre.
      const safe = search.replace(/[^\p{L}\p{N}\s-]/gu, " ").trim();
      if (safe !== "") {
        builder = builder.or(
          `order_number.ilike.%${safe}%,address_snapshot->>full_name.ilike.%${safe}%,address_snapshot->>phone.ilike.%${safe}%`
        );
      }
    }

    const fromRow = (page - 1) * pageSize;
    return builder.range(fromRow, fromRow + pageSize - 1);
  });

  const rawRows = toList(outcome) as unknown as OrderRow[];
  const driverNames = await loadDriverNames(
    rawRows.map((row) => row.deliveries?.driver_id ?? "").filter(Boolean)
  );

  // Le filtre est intégralement appliqué en base : aucun tri ne doit retirer
  // une ligne qui correspond à la recherche.
  const rows = rawRows.map((row) => toRow(row, driverNames));

  const totalCount = outcome.count ?? rows.length;

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/** Filtres proposés dans l'interface, chargés une fois pour la session. */
export interface AdminOrderFilterOptions {
  drivers: Array<{ id: string; name: string; activeDeliveries: number }>;
  zones: Array<{ id: string; name: string; city: string; slug: string }>;
}

export async function listAdminOrderFilterOptions(): Promise<AdminOrderFilterOptions> {
  const empty: AdminOrderFilterOptions = { drivers: [], zones: [] };

  const [driversOutcome, zonesOutcome] = await Promise.all([
    safeQuery("adminOrders.filterDrivers", (supabase) =>
      supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .eq("role", "driver")
        .order("full_name", { ascending: true })
        .limit(200)
    ),
    safeQuery("adminOrders.filterZones", (supabase) =>
      supabase
        .from("delivery_zones")
        .select("id, name, city, slug, is_active")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(200)
    ),
  ]);

  const drivers = toList(driversOutcome)
    .filter((row) => typeof row.id === "string")
    .map((row) => ({
      id: String(row.id),
      name: typeof row.full_name === "string" ? row.full_name : "Livreur",
      // Indicatif uniquement : le compte exact est calculé par la liste filtrée.
      activeDeliveries: 0,
    }));

  const zones = toList(zonesOutcome)
    .filter((row) => typeof row.slug === "string")
    .map((row) => ({
      id: String(row.id),
      name: typeof row.name === "string" ? row.name : "Zone",
      city: typeof row.city === "string" ? row.city : "Niamey",
      slug: String(row.slug),
    }));

  return drivers.length === 0 && zones.length === 0 ? empty : { drivers, zones };
}

/** Compteurs par statut, pour les onglets de filtre. */
export async function countAdminOrdersByStatus(): Promise<Record<string, number>> {
  const outcome = await safeQuery("adminOrders.statusCounts", (supabase) =>
    supabase.from("orders").select("status").limit(2000)
  );

  const counts: Record<string, number> = {};
  for (const row of toList(outcome)) {
    if (typeof row.status !== "string") continue;
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  return counts;
}

export type AdminUserRole = UserRole;
export { toSingle };