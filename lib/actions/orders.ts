"use server";

import { z } from "zod";
import { orderCreateSchema } from "@/lib/validations/schemas";
import {
  calculateDiscount,
  calculateSubtotal,
  calculateTotal,
  getDeliveryFee,
} from "@/lib/services/pricing";
import { getOrderStatusLabel } from "@/lib/services/orders";
import { isStockSufficient, getAvailableStock } from "@/lib/services/inventory";
import { AUDIT_ACTIONS, logAuditEntry } from "@/lib/services/audit";
import { notifyNewOrder } from "@/lib/services/notifications";
import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";
import { getOrderByIdempotencyKey, getOrderByNumber } from "@/lib/data/orders";
import { listActiveDeliveryZones } from "@/lib/data/delivery-zones";
import { listActivePromotions } from "@/lib/data/promotions";
import { validateCoupon } from "@/lib/services/coupons";
import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import { isSupportedPaymentMethod } from "@/lib/payments/providers";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import { couponRejectionMessage } from "@/types";
import type { AddressSnapshot, CouponRejectionReason, Order, OrderItem, OrderStatusHistory, ProductVariant } from "@/types";

const SERVICE_UNAVAILABLE =
  "Le service de commande est momentanément indisponible. Merci de réessayer dans un instant.";

const MAX_ITEM_QUANTITY = 99;

const VARIANT_ORDER_SELECT = `
  id,
  product_id,
  sku,
  attributes,
  price,
  compare_at_price,
  stock_on_hand,
  stock_reserved,
  low_stock_threshold,
  is_active,
  created_at,
  updated_at,
  products:products(id, name, slug, is_active)
`;

interface OrderVariantRow extends ProductVariant {
  products: { id: string; name: string; slug: string; is_active: boolean } | null;
}

const orderTrackingInputSchema = z
  .string()
  .trim()
  .min(3, "Saisissez un numéro de commande valide")
  .max(40, "Numéro de commande trop long");

export interface OrderTrackingResult {
  orderNumber: string;
  status: Order["status"];
  statusLabel: string;
  paymentStatus: Order["payment_status"];
  createdAt: string;
  updatedAt: string;
  items: Array<{
    productName: string;
    variantLabel: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  address: AddressSnapshot;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  currency: string;
  notes: string | null;
  timeline: Array<{ status: Order["status"]; label: string; notes: string | null; at: string }>;
}

interface ResolvedLine {
  variant: OrderVariantRow;
  productName: string;
  productSlug: string;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
  return value ?? null;
}

function describeVariant(attributes: Record<string, string>): string | null {
  const entries = Object.entries(attributes ?? {});
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
}

function generateAddressCode(quarter: string): string {
  const prefix = quarter
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");

  const suffix = Math.floor(Math.random() * 46656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");

  return `NEI-${prefix}-${suffix}`;
}

async function getAdminClient(): Promise<SupabaseAdminClient | null> {
  try {
    return await createAdminClient();
  } catch {
    return null;
  }
}

/**
 * Charge les variantes commandées depuis la base et reconstruit les lignes.
 *
 * Les prix et les stocks proviennent TOUJOURS de la base : le client ne peut
 * jamais imposer de montant. Les quantités identiques sont regroupées.
 */
async function resolveLines(
  supabase: SupabaseAdminClient,
  items: Array<{ variant_id: string; quantity: number }>
): Promise<{ lines: ResolvedLine[]; unavailable: string | null }> {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.variant_id, (quantities.get(item.variant_id) ?? 0) + item.quantity);
  }

  const variantIds = [...quantities.keys()];
  const outcome = await safeQuery("orders.variants", (client) =>
    client.from("product_variants").select(VARIANT_ORDER_SELECT).in("id", variantIds)
  );

  const rows = toList(outcome).map((row) => ({
    ...row,
    products: firstRelation(row.products),
  })) as OrderVariantRow[];

  const byId = new Map(rows.map((row) => [row.id, row]));
  const lines: ResolvedLine[] = [];

  for (const [variantId, quantity] of quantities) {
    const variant = byId.get(variantId);
    const product = variant?.products ?? null;

    if (!variant || !product || !variant.is_active || !product.is_active) {
      return { lines: [], unavailable: "Un article de votre commande n'est plus disponible." };
    }

    const safeQuantity = Math.min(Math.max(quantity, 1), MAX_ITEM_QUANTITY);
    const unitPrice = variant.price;

    lines.push({
      variant,
      productName: product.name,
      productSlug: product.slug,
      variantLabel: describeVariant(variant.attributes),
      quantity: safeQuantity,
      unitPrice,
      lineTotal: unitPrice * safeQuantity,
    });
  }

  return { lines, unavailable: null };
}

/** Vérifie le stock disponible de chaque ligne avant toute écriture. */
function checkStock(lines: ResolvedLine[]): string | null {
  for (const line of lines) {
    const sufficient = isStockSufficient(
      {
        stock_on_hand: line.variant.stock_on_hand,
        stock_reserved: line.variant.stock_reserved,
      },
      line.quantity
    );

    if (!sufficient) {
      const available = getAvailableStock({
        stock_on_hand: line.variant.stock_on_hand,
        stock_reserved: line.variant.stock_reserved,
      });
      return `« ${line.productName} » : il ne reste que ${available} unité(s) en stock.`;
    }
  }

  return null;
}


/**
 * Traduit une erreur de la fonction `create_order` en message utilisateur.
 *
 * La fonction signale ses refus par un préfixe stable ; le reste est traité
 * comme une indisponibilité, jamais exposé tel quel au client.
 */
function mapCreateOrderError(rawMessage: string): string {
  if (rawMessage.includes("EMPTY_CART")) {
    return "Votre panier est vide.";
  }
  if (rawMessage.includes("INSUFFICIENT_STOCK")) {
    return "Stock insuffisant pour un article de votre commande. Il ne reste que peu d'unités disponibles.";
  }
  if (rawMessage.includes("INVALID_AMOUNTS")) {
    return "Le calcul du montant total est invalide. Rechargez la page et réessayez.";
  }

  // Refus de coupon (`COUPON_INVALID:CODE_EXPIRE`, `...:CODE_HORS_PORTEE`, …) :
  // le motif est traduit, jamais affiché brut.
  const couponRefusal = /COUPON_INVALID:([A-Z_]+)/.exec(rawMessage);
  if (couponRefusal) {
    return couponRejectionMessage(couponRefusal[1] as CouponRejectionReason);
  }

  console.warn("[orders] création de commande refusée :", rawMessage);
  return "Votre commande n'a pas pu être enregistrée. Merci de réessayer.";
}

/**
 * Crée une commande depuis le panier.
 *
 * Garanties :
 * - validation Zod de la charge utile ;
 * - idempotence stricte (une requête rejouée ne crée jamais de seconde commande) ;
 * - prix, frais de livraison et remises recalculés côté serveur ;
 * - contrôle du stock avant écriture, puis réservation ;
 * - atomicité PostgreSQL : aucun état partiel possible (migration 004).
 */
export async function createOrderAction(
  payload: unknown
): Promise<ActionResult<{ orderNumber: string; orderId: string }>> {
  // Le seul moyen réellement disponible au MVP est le paiement à la livraison.
  // La vérification passe par l'abstraction fournisseurs : ajouter Mobile Money
  // ou la carte consistera à enregistrer un fournisseur, pas à modifier cette
  // action. Voir lib/payments/providers.ts.
  if (
    typeof payload !== "object" ||
    payload === null ||
    !isSupportedPaymentMethod((payload as { payment_method?: unknown }).payment_method)
  ) {
    return failure("Le paiement à la livraison est le seul mode accepté.");
  }

  const parsed = orderCreateSchema.safeParse(payload);

  if (!parsed.success) {
    return failure(firstZodMessage(parsed.error.issues));
  }

  const input = parsed.data;
  const idempotencyKey = input.idempotency_key ?? null;

  const supabase = await getAdminClient();
  if (!supabase) return failure(SERVICE_UNAVAILABLE);

  try {
    // 1. Idempotence : une commande déjà créée pour cette clé est renvoyée telle
    //    quelle. C'est ce qui garantit qu'un rejeu après coupure réseau est sûr.
    if (idempotencyKey) {
      const existing = await getOrderByIdempotencyKey(idempotencyKey);
      if (existing) {
        return success({ orderNumber: existing.order_number, orderId: existing.id });
      }
    }

    // 2. Prix et stocks sont relus en base : aucune valeur du client n'est fiable.
    const { lines, unavailable } = await resolveLines(supabase, input.items);
    if (unavailable) return failure(unavailable);
    if (lines.length === 0) return failure("Votre panier est vide.");

    const stockError = checkStock(lines);
    if (stockError) return failure(stockError);

    // 3. Tarification recalculée entièrement côté serveur.
    const zones = await listActiveDeliveryZones();
    const deliveryFee = getDeliveryFee(input.address.quarter, zones);

    const subtotal = calculateSubtotal(
      lines.map((line) => ({ unit_price: line.unitPrice, quantity: line.quantity }))
    );

    const promotions = await listActivePromotions();
    const discount = calculateDiscount(subtotal, promotions);

    const addressSnapshot: AddressSnapshot = {
      city: input.address.city,
      quarter: input.address.quarter,
      sector: input.address.sector ?? null,
      landmark: input.address.landmark,
      instructions: input.address.instructions ?? null,
      latitude: input.address.latitude ?? null,
      longitude: input.address.longitude ?? null,
      address_code: generateAddressCode(input.address.quarter),
      full_name: input.full_name,
      phone: input.phone,
    };

    // Code promo : le client ne fournit qu'un code, jamais un montant. La remise
    // est calculée par `coupon_is_valid`, en base — y compris la portée
    // catégorie/produit, évaluée sur les lignes relues ici.
    const couponItems = lines.map((line) => ({
      variant_id: line.variant.id,
      line_total: line.lineTotal,
    }));

    const couponCheck = await validateCoupon(
      input.coupon_code ?? "",
      subtotal,
      input.phone,
      couponItems
    );

    if (input.coupon_code && !couponCheck.valid && couponCheck.reason) {
      // Un code explicitement demandé mais refusé est une erreur visible : le
      // client doit savoir pourquoi sa remise n'est pas appliquée.
      return failure(couponCheck.message ?? "Ce code promo n'est pas valide.");
    }

    // La remise du code s'ajoute à celle des promotions automatiques : cumul
    // additif plafonné au sous-total, identique au calcul de `create_order`.
    // Cette valeur ne sert qu'à l'affichage ; la commande enregistrée est
    // recalculée en base et fait foi.
    const totalDiscount = Math.min(
      subtotal,
      discount + (couponCheck.valid ? couponCheck.discount : 0)
    );
    const total = calculateTotal(subtotal, deliveryFee, totalDiscount);

    // 4. Transaction unique en base : commande, lignes, réservation du stock et
    //    historique sont écrits ensemble, ou pas du tout. Aucun rollback
    //    compensatoire n'est nécessaire côté application — c'est PostgreSQL
    //    qui garantit l'atomicité, y compris face à une coupure réseau.
    const itemsPayload = lines.map((line) => ({
      variant_id: line.variant.id,
      product_name: line.productName,
      sku: line.variant.sku,
      variant_attributes: line.variant.attributes ?? {},
      unit_price: line.unitPrice,
      quantity: line.quantity,
      line_total: line.lineTotal,
    }));

    const { data: created, error: createError } = await supabase.rpc("create_order", {
      p_idempotency_key: idempotencyKey,
      p_customer_id: input.customer_id ?? null,
      p_full_name: input.full_name,
      p_phone: input.phone,
      p_address: addressSnapshot,
      p_notes: input.notes ?? null,
      p_items: itemsPayload,
      p_subtotal: subtotal,
      p_delivery_fee: deliveryFee,
      p_discount: totalDiscount, // indicatif uniquement : recalculé en base
      p_coupon_code: couponCheck.valid ? couponCheck.code : null,
      p_coupon_id: couponCheck.valid ? couponCheck.couponId ?? null : null,
      p_currency: "XOF",
    });

    if (createError) {
      return failure(mapCreateOrderError(createError.message));
    }

    const row = Array.isArray(created) ? created[0] : null;
    if (!row || typeof row.order_id !== "string" || typeof row.order_number !== "string") {
      return failure("Votre commande n'a pas pu être enregistrée. Merci de réessayer.");
    }

    const orderId = row.order_id;
    const orderNumber = row.order_number;

    // 5. Traçabilité et notification. Ces écritures sont volontairement hors
    //    transaction : un journal ou une notification manquant ne doit jamais
    //    faire perdre une commande déjà validée.
    await logAuditEntry(supabase, {
      actor_id: null,
      actor_role: "customer",
      action: AUDIT_ACTIONS.ORDER_CREATED,
      entity_type: "order",
      entity_id: orderId,
      before: null,
      after: {
        order_number: orderNumber,
        total,
        currency: "XOF",
        status: "PENDING_CONFIRMATION",
        items_count: lines.length,
      },
    });

    await notifyNewOrder(orderId, orderNumber, total);

    // 6. On ne renvoie que le strict nécessaire au client.
    return success({ orderNumber, orderId });
  } catch (error) {
    console.warn("[orders] création de commande en échec :", error);
    return failure(SERVICE_UNAVAILABLE);
  }
}

/**
 * Suivi d'une commande par son numéro.
 *
 * Aucune authentification n'est requise : le numéro de commande, communiqué au
 * client lors de la commande, joue le rôle de secret d'accès.
 */
export async function getOrderTrackingAction(
  orderNumber: string
): Promise<ActionResult<OrderTrackingResult>> {
  const parsed = orderTrackingInputSchema.safeParse(orderNumber);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const details = await getOrderByNumber(parsed.data);
  if (!details) {
    return failure("Aucune commande ne correspond à ce numéro. Vérifiez et réessayez.");
  }

  const { order, items, history } = details;
  const orderedItems = items as OrderItem[];
  const orderedHistory = history as OrderStatusHistory[];

  return success({
    orderNumber: order.order_number,
    status: order.status,
    statusLabel: getOrderStatusLabel(order.status),
    paymentStatus: order.payment_status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: orderedItems.map((item) => {
      const attributes = Object.entries(item.variant_attributes ?? {});
      return {
        productName: item.product_name,
        variantLabel: attributes.length > 0
          ? attributes.map(([key, value]) => `${key}: ${value}`).join(", ")
          : null,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
      };
    }),
    address: order.address_snapshot,
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee,
    discount: order.discount,
    total: order.total,
    currency: order.currency,
    notes: order.notes,
    timeline: orderedHistory.map((entry) => ({
      status: entry.status,
      label: getOrderStatusLabel(entry.status),
      notes: entry.notes,
      at: entry.created_at,
    })),
  });
}

/** Recherche une commande par son numéro (formulaire de suivi). */
export async function trackOrderAction(
  orderNumber: string
): Promise<ActionResult<{ orderNumber: string }>> {
  const parsed = orderTrackingInputSchema.safeParse(orderNumber);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const outcome = await safeQuery("orders.lookup", (client) =>
    client.from("orders").select("order_number").eq("order_number", parsed.data.trim()).limit(1)
  );

  const row = toSingle(outcome);
  if (!row) return failure("Aucune commande ne correspond à ce numéro. Vérifiez et réessayez.");

  return success({ orderNumber: row.order_number });
}
