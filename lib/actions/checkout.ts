"use server";

import { revalidatePath } from "next/cache";
import { createOrderAction, getOrderTrackingAction } from "@/lib/actions/orders";
import { isSupportedPaymentMethod } from "@/lib/payments/providers";
import { getSessionProfile } from "@/lib/supabase/session";
import { getCustomerByProfileId } from "@/lib/data/account";
import { createAdminClient } from "@/lib/supabase/server";
import { assessCodRisk } from "@/lib/services/abuse-prevention";
import { guardGuestCheckout } from "@/lib/services/captcha";
import { RATE_LIMITS } from "@/lib/services/rate-limit";
import { validateCoupon } from "@/lib/services/coupons";
import { formatPrice } from "@/lib/services/pricing";
import { logger } from "@/lib/observability/logger";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import { getOrderForCustomer, getOrderByIdempotencyKey } from "@/lib/data/orders";
import type { AddressSnapshot, Order } from "@/types";
import { z } from "zod";

const submitSchema = z.object({
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  quarter: z.string().trim().min(1).max(120),
  landmark: z.string().trim().min(1).max(300),
  sector: z.string().trim().max(120).optional().nullable(),
  instructions: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().min(1).max(120).default("Niamey"),
  notes: z.string().trim().max(500).optional().nullable(),
  payment_method: z.string(),
  coupon_code: z.string().trim().max(24).optional().nullable(),
  idempotency_key: z.string().uuid(),
  /** Piège à miel : champ masqué, doit rester vide. */
  company_website: z.string().optional().nullable(),
  /** Instant d'ouverture du formulaire (`Date.now()` côté navigateur). */
  form_started_at: z.number().int().nonnegative().optional().nullable(),
  /** Jeton anti-robot, si le widget est affiché. */
  captcha_token: z.string().trim().max(2048).optional().nullable(),
});

export interface OrderSubmission {
  orderId: string;
  orderNumber: string;
}

/**
 * Soumission du panier, avec reprise après échec réseau.
 *
 * Le contrat est simple : la clé d'idempotence est fournie par l'appelant et
 * conservée par lui. Si l'appel échoue — coupure réseau, onglet fermé — un
 * nouvel essai avec **la même clé** renvoie la commande déjà créée au lieu
 * d'en créer une seconde.
 *
 * C'est la seule garantie contre la double commande : elle tient dans la base
 * (`orders.idempotency_key`) et non dans l'état du navigateur, qui peut être
 * perdu.
 */
export async function submitOrderAction(
  payload: unknown
): Promise<ActionResult<OrderSubmission>> {
  const parsed = submitSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  if (!isSupportedPaymentMethod(parsed.data.payment_method)) {
    return failure("Le paiement à la livraison est le seul mode accepté.");
  }

  /**
   * Garde anti-robot du checkout invité (§46).
   *
   * Appliquée **avant** toute écriture, et seulement lorsqu'aucun client
   * connecté n'est derrière la requête : une session authentifiée est déjà
   * limitée par son compte, et un client connu ne doit pas être retardé par un
   * test de rythme.
   */
  const session = await getSessionProfile();
  const customer = session ? await getCustomerByProfileId(session.id) : null;

  if (!session) {
    const guard = await guardGuestCheckout({
      honeypot: parsed.data.company_website,
      startedAt: parsed.data.form_started_at ?? 0,
      captchaToken: parsed.data.captcha_token,
      rule: RATE_LIMITS.guestCheckout,
    });

    if (!guard.success) return failure(guard.error, guard.code);
  }

  /**
   * Évaluation anti-abus (§46).
   *
   * Elle ne bloque **jamais** la commande : elle ne fait que recommander une
   * confirmation manuelle à l'administrateur. Refuser une commande sur un
   * indice isolé exclut de bons clients sans contrôle humain possible.
   *
   * Le montant évalué est un ordre de grandeur : le serveur n'a pas encore
   * recalculé les prix à ce stade, et le vrai montant est de toute façon
   * revérifié plus bas. C'est le nombre de commandes et d'échecs qui porte le
   * signal, pas le montant.
   */
  const admin = await createAdminClient();
  const requestedUnits = parsed.data.items.reduce((sum, item) => sum + item.quantity, 0);
  const assessment = await assessCodRisk(admin, {
    subjectId: customer?.id ?? null,
    phone: parsed.data.phone,
    amount: requestedUnits,
  });

  if (assessment.decision === "review") {
    logger.warn("cod: commande à confirmer manuellement", {
      orderIdempotencyKey: parsed.data.idempotency_key,
      signals: assessment.signals.map((signal) => signal.code),
      score: assessment.score,
    });
  }

  const result = await createOrderAction({
    customer_id: customer?.id ?? null,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone,
    items: parsed.data.items,
    address: {
      city: parsed.data.city,
      quarter: parsed.data.quarter,
      landmark: parsed.data.landmark,
      sector: parsed.data.sector ?? null,
      instructions: parsed.data.instructions ?? null,
    },
    payment_method: "COD",
    notes: parsed.data.notes ?? null,
    idempotency_key: parsed.data.idempotency_key,
  });

  if (!result.success) return failure(result.error);

  revalidatePath("/account", "layout");
  return success({ orderId: result.orderId, orderNumber: result.orderNumber });
}

/**
 * Retrouve une commande à partir de sa clé d'idempotence.
 *
 * Sert au rattrapage : après une coupure réseau, le client sait qu'une
 * commande a peut-être été enregistrée et demande son état plutôt que de
 * repartir d'une nouvelle commande.
 */
export async function recoverOrderByIdempotencyKeyAction(
  idempotencyKey: string
): Promise<ActionResult<{ orderId: string; orderNumber: string }>> {
  const parsed = z.string().uuid("Clé d'idempotence invalide").safeParse(idempotencyKey);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const details = await getOrderTrackingActionByKey(parsed.data);
  if (!details) {
    return failure(
      "Aucune commande n'a été enregistrée pour cette tentative. Vous pouvez réessayer sans risque."
    );
  }

  return success({ orderId: details.orderId, orderNumber: details.orderNumber });
}

async function getOrderTrackingActionByKey(
  key: string
): Promise<{ orderId: string; orderNumber: string } | null> {
  const order = await getOrderByIdempotencyKey(key);
  return order ? { orderId: order.id, orderNumber: order.order_number } : null;
}

const lookupSchema = z.string().trim().min(3).max(40);

/**
 * Détail d'une commande pour l'écran de confirmation.
 *
 * L'accès reste encadré : la commande est soit celle du client connecté, soit
 * accessible par son numéro — qui joue le rôle de secret d'accès pour le
 * suivi invité.
 */
export async function getConfirmationOrderAction(
  orderNumber: string
): Promise<ActionResult<{
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  currency: string;
  fullName: string;
  phone: string;
  address: {
    city: string;
    quarter: string;
    sector: string | null;
    landmark: string;
    instructions: string | null;
  };
  createdAt: string;
}>> {
  const parsed = lookupSchema.safeParse(orderNumber);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const session = await getSessionProfile();
  const customer = session ? await getCustomerByProfileId(session.id) : null;

  // Un client connecté ne voit que ses propres commandes ; un visiteur invité
  // utilise le numéro, communiqué à la validation.
  if (customer) {
    const own = await getOrderForCustomer(parsed.data, customer.id);
    if (!own) return failure("Commande introuvable.");
    return success(toConfirmationPayload(own));
  }

  const tracked = await getOrderTrackingAction(parsed.data);
  if (!tracked.success) return failure(tracked.error);

  const order = tracked;
  const address = order.address;

  return success({
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: order.statusLabel,
    paymentStatus: order.paymentStatus,
    paymentMethod: "COD",
    total: order.total,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discount: order.discount,
    currency: order.currency,
    fullName: address.full_name,
    phone: address.phone,
    address: {
      city: address.city,
      quarter: address.quarter,
      sector: address.sector,
      landmark: address.landmark,
      instructions: address.instructions,
    },
    createdAt: order.createdAt,
  });
}
/**
 * Extrait l'instantané d'adresse d'une commande en neutralisant les champs
 * optionnels, afin que l'écran de confirmation travaille sur une forme stable.
 */
function toAddressView(address: AddressSnapshot): {
  city: string;
  quarter: string;
  sector: string | null;
  landmark: string;
  instructions: string | null;
} {
  return {
    city: address.city,
    quarter: address.quarter,
    sector: address.sector ?? null,
    landmark: address.landmark,
    instructions: address.instructions ?? null,
  };
}

function toConfirmationPayload(order: Order) {
  const address = order.address_snapshot;

  return {
    orderNumber: order.order_number,
    status: order.status,
    statusLabel: "",
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    total: order.total,
    subtotal: order.subtotal,
    deliveryFee: order.delivery_fee,
    discount: order.discount,
    currency: order.currency,
    fullName: address.full_name,
    phone: address.phone,
    address: toAddressView(address),
    createdAt: order.created_at,
  };
}

const couponSchema = z.object({
  code: z.string().trim().min(1, "Saisissez un code promo").max(24),
  subtotal: z.number().int().min(0),
  phone: z
    .string()
    .trim()
    .min(8, "Renseignez votre numéro de téléphone")
    .max(20, "Numéro de téléphone invalide")
    .optional(),
  /**
   * Lignes du panier (variante + montant), nécessaires à la portée
   * catégorie/produit. Le montant reste non confiant : il ne sert qu'à
   * l'aperçu, la remise définitive étant recalculée au moment de la commande.
   */
  items: z
    .array(
      z.object({
        variant_id: z.string().uuid("Article invalide"),
        line_total: z.number().int().min(0),
      })
    )
    .min(1, "Votre panier est vide")
    .optional(),
});

/**
 * Vérifie un code promo et renvoie la remise correspondante.
 *
 * Le montant n'est pas une donnée de confiance : c'est le sous-total que le
 * client **affirme**, et il ne sert qu'à anticiper l'affichage. La remise
 * définitive est recalculée par `createOrderAction` au moment de la commande,
 * à partir du sous-total relu en base.
 *
 * Les lignes transmises servent uniquement à évaluer la portée : un code
 * limité à une catégorie ou un produit ne peut pas être prévisualisé sans
 * savoir de quels articles le panier se compose.
 *
 * Le téléphone est transmis pour que la limite par utilisateur soit évaluée dès
 * la saisie du code. S'il manque — le client ne l'a pas encore saisi — le contrôle
 * est reporté sur `create_order`, qui possède toujours le numéro et refuse alors
 * la commande avec un message explicite.
 */
export async function applyCouponAction(
  payload: unknown
): Promise<ActionResult<{ code: string; discount: number; message: string }>> {
  const parsed = couponSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const check = await validateCoupon(
    parsed.data.code,
    parsed.data.subtotal,
    parsed.data.phone,
    parsed.data.items ?? null
  );

  if (!check.valid) {
    return failure(check.message ?? "Ce code promo n'est pas valide.");
  }

  return success({
    code: check.code ?? parsed.data.code.toUpperCase(),
    discount: check.discount,
    message: `Code appliqué : ${formatPrice(check.discount)} de remise.`,
  });
}