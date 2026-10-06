import "server-only";

import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import type { Order, OrderItem, OrderStatusHistory } from "@/types";

/** Commande enrichie des lignes et de l'historique de statuts (suivi client). */
export interface OrderWithDetails {
  order: Order;
  items: OrderItem[];
  history: OrderStatusHistory[];
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
  idempotency_key,
  created_at,
  updated_at
`;

const ORDER_ITEM_SELECT = `
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

const ORDER_HISTORY_SELECT = `
  id,
  order_id,
  status,
  notes,
  created_by,
  created_at
`;

/** Normalise un numéro de commande : seuls `A-Z`, `0-9` et `-` sont acceptés. */
export function sanitizeOrderNumber(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
}

/**
 * Récupère une commande par son numéro, avec ses lignes et son historique.
 *
 * Le numéro de commande sert de secret d'accès pour le suivi invité :
 * aucune authentification n'est requise. Retourne `null` si la commande est
 * inconnue, ce qui évite de distinguer « inexistante » d'une erreur technique.
 */
export async function getOrderByNumber(orderNumber: string): Promise<OrderWithDetails | null> {
  const safeNumber = sanitizeOrderNumber(orderNumber);
  if (safeNumber === "") return null;

  const outcome = await safeQuery("orders.byNumber", (supabase) =>
    supabase.from("orders").select(ORDER_SELECT).eq("order_number", safeNumber).limit(1)
  );

  const row = toSingle(outcome);
  if (!row) return null;

  const order = row as Order;

  const [itemsOutcome, historyOutcome] = await Promise.all([
    safeQuery("orders.items", (supabase) =>
      supabase
        .from("order_items")
        .select(ORDER_ITEM_SELECT)
        .eq("order_id", order.id)
        .order("product_name", { ascending: true })
    ),
    safeQuery("orders.history", (supabase) =>
      supabase
        .from("order_status_history")
        .select(ORDER_HISTORY_SELECT)
        .eq("order_id", order.id)
        .order("created_at", { ascending: true })
    ),
  ]);

  return {
    order,
    items: toList(itemsOutcome) as OrderItem[],
    history: toList(historyOutcome) as OrderStatusHistory[],
  };
}

/** Historique des commandes d'un client connecté, de la plus récente à la plus ancienne. */
/** Filtres d'affichage du dossier « Mes commandes ». */
export type OrderFilter =
  | "all"
  | "in_progress"
  | "delivered"
  | "cancelled"
  | "returned";

/**
 * Statuts considérés comme « en cours » : la commande n'est ni terminée, ni
 * annulée. Le regroupement évite au client de traduire des statuts techniques.
 */
export const IN_PROGRESS_STATUSES: readonly Order["status"][] = [
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_DELIVERY",
  "ASSIGNED",
  "OUT_FOR_DELIVERY",
  "ARRIVED",
  "DELIVERY_FAILED",
];

const FILTER_STATUSES: Record<OrderFilter, readonly Order["status"][] | null> = {
  all: null,
  in_progress: IN_PROGRESS_STATUSES,
  delivered: ["DELIVERED"],
  cancelled: ["CANCELLED"],
  returned: ["RETURNED"],
};

/** Convertit une valeur d'URL en filtre valide. */
export function parseOrderFilter(raw: string | string[] | undefined): OrderFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "in_progress" ||
    value === "delivered" ||
    value === "cancelled" ||
    value === "returned"
    ? value
    : "all";
}

export async function getOrdersForCustomer(
  customerId: string,
  filter: OrderFilter = "all"
): Promise<Order[]> {
  if (typeof customerId !== "string" || customerId.length === 0) return [];

  const statuses = FILTER_STATUSES[filter];

  const outcome = await safeQuery("orders.forCustomer", (supabase) => {
    let builder = supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (statuses) builder = builder.in("status", [...statuses]);

    return builder;
  });

  return toList(outcome) as Order[];
}

/** Commande du dossier client, enrichie du nombre d'articles et de quantités. */
export interface OrderSummary extends Order {
  /** Nombre de lignes d'articles distinctes. */
  items_count: number;
  /** Somme des quantités (2 produits × 3 = 6). */
  items_quantity: number;
}

/**
 * Historique de commandes du client avec le nombre d'articles, en une seule
 * requête (agrégat `order_items` embarqué). RLS s'applique : le client ne voit
 * que ses propres commandes et leurs lignes.
 */
export async function listOrderSummariesForCustomer(
  customerId: string
): Promise<OrderSummary[]> {
  if (typeof customerId !== "string" || customerId.length === 0) return [];

  const outcome = await safeQuery("orders.summariesForCustomer", (supabase) =>
    supabase
      .from("orders")
      .select(`${ORDER_SELECT}, order_items(quantity)`)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(50)
  );

  return toList(outcome).map((row) => {
    const items = Array.isArray(row.order_items)
      ? (row.order_items as Array<{ quantity: number | null }>)
      : [];
    return {
      ...(row as unknown as Order),
      items_count: items.length,
      items_quantity: items.reduce(
        (sum, item) => sum + (typeof item.quantity === "number" ? item.quantity : 0),
        0
      ),
    };
  });
}

/**
 * Compte les commandes par filtre.
 * Permet d'afficher le nombre sur chaque onglet sans requêter cinq fois.
 */
export async function countOrdersByFilter(
  customerId: string
): Promise<Record<OrderFilter, number>> {
  const empty: Record<OrderFilter, number> = {
    all: 0,
    in_progress: 0,
    delivered: 0,
    cancelled: 0,
    returned: 0,
  };

  if (typeof customerId !== "string" || customerId.length === 0) return empty;

  const outcome = await safeQuery("orders.countsForCustomer", (supabase) =>
    supabase
      .from("orders")
      .select("status")
      .eq("customer_id", customerId)
      .limit(1000)
  );

  for (const row of toList(outcome)) {
    const status = row.status as Order["status"];
    empty.all += 1;
    if (IN_PROGRESS_STATUSES.includes(status)) empty.in_progress += 1;
    if (status === "DELIVERED") empty.delivered += 1;
    if (status === "CANCELLED") empty.cancelled += 1;
    if (status === "RETURNED") empty.returned += 1;
  }

  return empty;
}

/**
 * Retrouve une commande à partir de sa clé d'idempotence.
 * Utilisé par `createOrderAction` pour ne jamais créer deux commandes
 * lorsqu'une requête est rejouée après une coupure réseau.
 */
export async function getOrderByIdempotencyKey(
  idempotencyKey: string
): Promise<Order | null> {
  if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) return null;

  const outcome = await safeQuery("orders.byIdempotencyKey", (supabase) =>
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("idempotency_key", idempotencyKey)
      .limit(1)
  );

  const row = toSingle(outcome);
  return row ? (row as Order) : null;
}

/**
 * Récupère une commande d'un client connecté avec ses lignes et son historique.
 *
 * Le contrôle d'accès est fait en base : la commande doit appartenir au client
 * connecté. Connaître un identifiant d'une commande tierce ne permet donc pas
 * d'en lire le contenu.
 */
export async function getOrderDetailsForCustomer(
  orderId: string,
  customerId: string
): Promise<OrderWithDetails | null> {
  if (!orderId || !customerId) return null;

  const outcome = await safeQuery("orders.detailsForCustomer", (supabase) =>
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("id", orderId)
      .eq("customer_id", customerId)
      .limit(1)
  );

  const row = toSingle(outcome);
  if (!row) return null;

  const order = row as Order;

  const [itemsOutcome, historyOutcome] = await Promise.all([
    safeQuery("orders.detailsItems", (supabase) =>
      supabase
        .from("order_items")
        .select(ORDER_ITEM_SELECT)
        .eq("order_id", order.id)
        .order("product_name", { ascending: true })
    ),
    safeQuery("orders.detailsHistory", (supabase) =>
      supabase
        .from("order_status_history")
        .select(ORDER_HISTORY_SELECT)
        .eq("order_id", order.id)
        .order("created_at", { ascending: true })
    ),
  ]);

  return {
    order,
    items: toList(itemsOutcome) as OrderItem[],
    history: toList(historyOutcome) as OrderStatusHistory[],
  };
}

/**
 * Recherche une commande appartenant à un client connecté.
 * Renforce le contrôle d'accès côté serveur sur la page de suivi.
 */
export async function getOrderForCustomer(
  orderNumber: string,
  customerId: string
): Promise<Order | null> {
  const safeNumber = sanitizeOrderNumber(orderNumber);
  if (safeNumber === "" || !customerId) return null;

  const outcome = await safeQuery("orders.forCustomerByNumber", (supabase) =>
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("order_number", safeNumber)
      .eq("customer_id", customerId)
      .limit(1)
  );

  const row = toSingle(outcome);
  return row ? (row as Order) : null;
}