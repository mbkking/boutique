import "server-only";

import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import type { AddressSnapshot, Delivery, DeliveryStatus, Order } from "@/types";

/**
 * Couche de données de l'espace livreur.
 *
 * Règle absolue : un livreur ne voit **que ses propres livraisons**. Le filtre
 * `driver_id` est appliqué dans chaque requête, jamais en JavaScript après coup :
 * une erreur de filtrage côté client ne pourrait pas exposer les commandes d'un
 * autre livreur.
 */

export interface DriverMission {
  id: string;
  orderId: string;
  orderNumber: string;
  status: DeliveryStatus;
  /** Instantané d'adresse de la commande : stable même si le client le modifie. */
  address: AddressSnapshot;
  /** Montant restant à encaisser, en XOF. */
  amountDue: number;
  total: number;
  paymentStatus: Order["payment_status"];
  createdAt: string;
  assignedAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  failureNotes: string | null;
  /** Nombre d'articles à livrer, pour la carte de mission. */
  itemCount: number;
  /** Nombre de tentatives de livraison déjà effectuées. */
  attemptCount: number;
  /** Preuve déjà enregistrée, si la livraison est documentée. */
  proofType: Delivery["proof_type"];
  proofUrl: Delivery["proof_url"];
  /** Latitude/longitude de l'adresse, si connues. */
  latitude: number | null;
  longitude: number | null;
}

export interface DriverMissionItem {
  productName: string;
  variantAttributes: Record<string, string> | null;
  quantity: number;
}

export interface DriverMissionDetail extends DriverMission {
  items: DriverMissionItem[];
  notes: string | null;
  /** CoordonnéesGPS exploitables pour la navigation. */
  hasCoordinates: boolean;
}

export interface DriverDashboard {
  todayCount: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  /** Montant attendu pour les livraisons non terminées. */
  expectedAmount: number;
  /** Montant déjà encaissé, visible si le livreur y est autorisé. */
  collectedAmount: number;
  /** Commandes terminées aujourd'hui. */
  deliveredToday: number;
}

const MISSION_SELECT = `
  id,
  order_id,
  status,
  proof_type,
  proof_url,
  attempt_count,
  assigned_at,
  delivered_at,
  failure_reason,
  failure_notes,
  orders (
    id,
    order_number,
    total,
    payment_status,
    created_at,
    address_snapshot
  )
`;

interface MissionRow {
  id: string;
  order_id: string;
  status: DeliveryStatus;
  assigned_at: string | null;
  delivered_at: string | null;
  failure_reason: string | null;
  failure_notes: string | null;
  proof_type: Delivery["proof_type"];
  proof_url: string | null;
  attempt_count: number;
  orders: {
    id: string;
    order_number: string;
    total: number;
    payment_status: Order["payment_status"];
    created_at: string;
    address_snapshot: AddressSnapshot;
  } | null;
}

function toMission(row: MissionRow, itemCount: number): DriverMission | null {
  const order = row.orders;
  if (!order) return null;

  const address = order.address_snapshot;

  return {
    id: row.id,
    orderId: order.id,
    orderNumber: order.order_number,
    status: row.status,
    address,
    amountDue: order.total,
    total: order.total,
    paymentStatus: order.payment_status,
    createdAt: order.created_at,
    assignedAt: row.assigned_at,
    deliveredAt: row.delivered_at,
    failureReason: row.failure_reason,
    failureNotes: row.failure_notes,
    itemCount,
    attemptCount: row.attempt_count ?? 0,
    proofType: row.proof_type ?? null,
    proofUrl: row.proof_url ?? null,
    latitude: address.latitude ?? null,
    longitude: address.longitude ?? null,
  };
}

/** Statuts pour lesquels la livraison n'est pas terminée. */
const OPEN_STATUSES: DeliveryStatus[] = [
  "ASSIGNED",
  "ACCEPTED",
  "IN_PREPARATION",
  "OUT_FOR_DELIVERY",
  "ARRIVED",
  "FAILED",
];

/**
 * Missions du livreur, filtrées par catégorie.
 * Un administrateur qui ouvre l'espace livreur voit toutes les livraisons ;
 * un livreur ne voit que les siennes, par construction de la requête.
 */
export async function listDriverMissions(
  driverId: string,
  scope: "open" | "done" | "all" = "open"
): Promise<DriverMission[]> {
  if (!driverId) return [];

  const outcome = await safeQuery("driver.missions", (supabase) => {
    let builder = supabase
      .from("deliveries")
      .select(MISSION_SELECT)
      .eq("driver_id", driverId)
      .order("assigned_at", { ascending: true, nullsFirst: false });

    if (scope === "open") builder = builder.in("status", OPEN_STATUSES);
    if (scope === "done") {
      builder = builder.in("status", ["DELIVERED", "RETURNED"]);
    }

    return builder.limit(200);
  });

  const rows = toList(outcome) as unknown as MissionRow[];

  // Le nombre d'articles vient d'une seconde lecture : l'inclure dans la même
  // requête multiplierait les lignes et fausserait les totaux.
  const counts = await countItems(rows.map((row) => row.order_id));

  return rows
    .map((row) => toMission(row, counts.get(row.order_id) ?? 0))
    .filter((mission): mission is DriverMission => mission !== null);
}

/** Compte les articles par commande, en une seule requête. */
async function countItems(orderIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (orderIds.length === 0) return counts;

  const outcome = await safeQuery("driver.itemCounts", (supabase) =>
    supabase
      .from("order_items")
      .select("order_id, quantity")
      .in("order_id", orderIds)
  );

  for (const row of toList(outcome)) {
    const orderId = row.order_id;
    const quantity = row.quantity;
    if (typeof orderId !== "string" || typeof quantity !== "number") continue;
    counts.set(orderId, (counts.get(orderId) ?? 0) + quantity);
  }

  return counts;
}

/**
 * Détail d'une mission.
 * Le filtre `driver_id` est appliqué : un identifiant deviné ne donne accès à
 * aucune livraison qui n'est pas la sienne.
 */
export async function getDriverMission(
  driverId: string,
  deliveryId: string,
  isAdmin = false
): Promise<DriverMissionDetail | null> {
  if (!driverId || !deliveryId) return null;

  const outcome = await safeQuery("driver.mission", (supabase) => {
    let builder = supabase
      .from("deliveries")
      .select(MISSION_SELECT)
      .eq("id", deliveryId);

    if (!isAdmin) builder = builder.eq("driver_id", driverId);

    return builder.limit(1);
  });

  const row = toSingle(outcome) as unknown as MissionRow | null;
  if (!row?.orders) return null;

  const counts = await countItems([row.order_id]);
  const mission = toMission(row, counts.get(row.order_id) ?? 0);
  if (!mission) return null;

  const itemsOutcome = await safeQuery("driver.missionItems", (supabase) =>
    supabase
      .from("order_items")
      .select("product_name, variant_attributes, quantity")
      .eq("order_id", row.order_id)
      .order("product_name", { ascending: true })
  );

  const notesOutcome = await safeQuery("driver.missionOrder", (supabase) =>
    supabase.from("orders").select("notes").eq("id", row.order_id).limit(1)
  );

  const orderRow = toSingle(notesOutcome);

  const items: DriverMissionItem[] = toList(itemsOutcome)
    .filter((item) => typeof item.product_name === "string")
    .map((item) => ({
      productName: String(item.product_name),
      variantAttributes:
        item.variant_attributes && typeof item.variant_attributes === "object"
          ? (item.variant_attributes as Record<string, string>)
          : null,
      quantity: typeof item.quantity === "number" ? item.quantity : 1,
    }));

  return {
    ...mission,
    items,
    notes: typeof orderRow?.notes === "string" ? orderRow.notes : null,
    hasCoordinates:
      mission.latitude !== null &&
      mission.longitude !== null &&
      Number.isFinite(mission.latitude) &&
      Number.isFinite(mission.longitude),
  };
}

/**
 * Agrégats du tableau de bord.
 *
 * Les montants sont additionnés côté serveur : le livreur ne peut pas les
 * modifier, et le total « à encaisser » est toujours relu depuis les commandes.
 */
export async function getDriverDashboard(
  driverId: string,
  isAdmin = false
): Promise<DriverDashboard> {
  const empty: DriverDashboard = {
    todayCount: 0,
    pendingCount: 0,
    inProgressCount: 0,
    completedCount: 0,
    expectedAmount: 0,
    collectedAmount: 0,
    deliveredToday: 0,
  };

  if (!driverId) return empty;

  const missions = await listDriverMissions(driverId, "all");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dayStartIso = startOfDay.toISOString();

  for (const mission of missions) {
    const isToday =
      mission.assignedAt !== null
        ? mission.assignedAt >= dayStartIso
        : mission.createdAt >= dayStartIso;

    if (isToday) empty.todayCount += 1;

    switch (mission.status) {
      case "DELIVERED":
        empty.completedCount += 1;
        if (mission.deliveredAt && mission.deliveredAt >= dayStartIso) {
          empty.deliveredToday += 1;
        }
        break;
      case "RETURNED":
        empty.completedCount += 1;
        break;
      case "ASSIGNED":
      case "ACCEPTED":
        empty.pendingCount += 1;
        empty.expectedAmount += mission.amountDue;
        break;
      default:
        // En préparation, en route, arrivé ou échec : la livraison est en cours.
        empty.inProgressCount += 1;
        if (mission.paymentStatus === "COD_PENDING") {
          empty.expectedAmount += mission.amountDue;
        }
        break;
    }
  }

  empty.collectedAmount = await sumCollectedCash(driverId, isAdmin);

  return empty;
}

/** Somme des encaissements enregistrés, lus depuis la table dédiée. */
async function sumCollectedCash(driverId: string, isAdmin: boolean): Promise<number> {
  const outcome = await safeQuery("driver.collectedCash", (supabase) => {
    let builder = supabase
      .from("cash_collections")
      .select("collected_amount, deliveries!inner(driver_id)");

    if (!isAdmin) builder = builder.eq("deliveries.driver_id", driverId);

    return builder.limit(1000);
  });

  let total = 0;
  for (const row of toList(outcome)) {
    if (typeof row.collected_amount === "number") total += row.collected_amount;
  }

  return total;
}