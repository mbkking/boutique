import "server-only";

import { logger } from "@/lib/observability/logger";
import type { OrderStatus } from "@/types";

/**
 * Service de notifications abstrait (§45).
 *
 * Le métier ne connaît **aucun fournisseur**. Chaque canal est un `NotificationChannel`
 * implémenté derrière une interface unique ; ajouter SMS ou WhatsApp consiste à
 * écrire un canal et à l'enregistrer — sans toucher une seule action métier.
 *
 * Règle : une notification ne doit jamais faire échouer l'opération qui l'a
 * déclenchée. Un client ne perd pas sa commande parce qu'une notification n'a
 * pas pu être envoyée.
 */

export type NotificationChannel = "WEB" | "PUSH" | "SMS" | "WHATSAPP";

export const NOTIFICATION_EVENTS = {
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_CONFIRMED: "ORDER_CONFIRMED",
  ORDER_PREPARING: "ORDER_PREPARING",
  ORDER_ASSIGNED: "ORDER_ASSIGNED",
  DELIVERY_OUT_FOR_DELIVERY: "DELIVERY_OUT_FOR_DELIVERY",
  DELIVERY_ARRIVED: "DELIVERY_ARRIVED",
  ORDER_DELIVERED: "ORDER_DELIVERED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
  ORDER_RETURNED: "ORDER_RETURNED",
  NEW_ORDER_ADMIN: "NEW_ORDER_ADMIN",
  LOW_STOCK: "LOW_STOCK",
} as const;

export type NotificationEvent = keyof typeof NOTIFICATION_EVENTS;

export interface NotificationMessage {
  event: NotificationEvent;
  title: string;
  body: string;
  /** Destinataire interne, si connu. */
  userId?: string | null;
  orderId?: string | null;
  /** Destinataire externe, pour les canaux hors ligne. */
  phone?: string | null;
}

export interface NotificationChannelResult {
  channel: NotificationChannel;
  /** `sent` = remis au fournisseur, `queued` = écrit en base, `skipped` = refusée. */
  status: "sent" | "queued" | "skipped";
  reason?: string;
}

/**
 * Contrat d'un canal de diffusion.
 * Implémentations actuelles : base interne et web push.
 * SMS et WhatsApp sont déclarés mais indisponibles (voir `UnavailableChannel`).
 */
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  isAvailable(): boolean;
  dispatch(message: NotificationMessage): Promise<NotificationChannelResult>;
}

/** Adaptateur de base de données interne. Toujours disponible. */
class InternalChannel implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = "WEB";

  isAvailable(): boolean {
    return true;
  }

  async dispatch(message: NotificationMessage): Promise<NotificationChannelResult> {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createAdminClient();

    const { error } = await supabase.from("notifications").insert({
      user_id: message.userId ?? null,
      order_id: message.orderId ?? null,
      type: message.event,
      title: message.title,
      body: message.body,
      channel: this.channel,
      status: "PENDING",
    });

    if (error) {
      logger.warn("notification: écriture interne impossible", { error: error.message });
      return { channel: this.channel, status: "skipped", reason: error.message };
    }

    return { channel: this.channel, status: "queued" };
  }
}

/**
 * Web push.
 *
 * La table d'abonnement et la clé VAPID ne sont pas configurées : le canal se
 * déclare donc indisponible plutôt que de laisser croire à des notifications
 * qui ne partiraient jamais.
 */
class PushChannel implements NotificationChannelAdapter {
  readonly channel: NotificationChannel = "PUSH";

  isAvailable(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  }

  async dispatch(): Promise<NotificationChannelResult> {
    return {
      channel: this.channel,
      status: "skipped",
      reason: "Push non configuré",
    };
  }
}

/**
 * SMS et WhatsApp : abstraction prête, aucune intégration factuelle.
 *
 * Aucun numéro n'est transmis à un service externe tant qu'aucun fournisseur
 * n'est configuré — c'est une décision de vie privée autant qu'une question de
 * disponibilité.
 */
class UnavailableChannel implements NotificationChannelAdapter {
  constructor(
    readonly channel: NotificationChannel,
    private readonly reason: string
  ) {}

  isAvailable(): boolean {
    return false;
  }

  async dispatch(): Promise<NotificationChannelResult> {
    return { channel: this.channel, status: "skipped", reason: this.reason };
  }
}

const registry: readonly NotificationChannelAdapter[] = [
  new InternalChannel(),
  new PushChannel(),
  new UnavailableChannel("SMS", "Aucun fournisseur SMS configuré"),
  new UnavailableChannel("WHATSAPP", "Aucun fournisseur WhatsApp configuré"),
];

/** Canaux effectivement opérationnels. */
export function listAvailableChannels(): readonly NotificationChannel[] {
  return registry.filter((adapter) => adapter.isAvailable()).map((a) => a.channel);
}

/**
 * Diffuse un message sur tous les canaux disponibles.
 * N'échoue jamais : un refus de canal est journalisé, pas propagé.
 */
export async function dispatchNotification(
  message: NotificationMessage
): Promise<NotificationChannelResult[]> {
  const results: NotificationChannelResult[] = [];

  for (const adapter of registry) {
    if (!adapter.isAvailable()) {
      results.push({
        channel: adapter.channel,
        status: "skipped",
        reason: "canal non configuré",
      });
      continue;
    }

    try {
      results.push(await adapter.dispatch(message));
    } catch (error) {
      logger.error("notification: échec de diffusion", {
        channel: adapter.channel,
        event: message.event,
        error,
      });
      results.push({ channel: adapter.channel, status: "skipped", reason: "erreur" });
    }
  }

  return results;
}

// ============================================================
// Messages métier
// ============================================================

const STATUS_MESSAGES: Record<OrderStatus, { title: string; body: string }> = {
  PENDING_CONFIRMATION: {
    title: "Commande reçue",
    body: "Votre commande est enregistrée. Nous vous appelons pour la confirmer.",
  },
  CONFIRMED: {
    title: "Commande confirmée",
    body: "Votre commande a été confirmée par notre équipe.",
  },
  PREPARING: {
    title: "Commande en préparation",
    body: "Votre commande est en cours de préparation.",
  },
  READY_FOR_DELIVERY: {
    title: "Commande prête",
    body: "Votre commande est prête et sera confiée à un livreur.",
  },
  ASSIGNED: {
    title: "Livreur affecté",
    body: "Un livreur a été affecté à votre commande.",
  },
  OUT_FOR_DELIVERY: {
    title: "Commande en route",
    body: "Votre commande est en cours de livraison.",
  },
  ARRIVED: {
    title: "Livreur arrivé",
    body: "Votre livreur est arrivé à votre adresse.",
  },
  DELIVERED: {
    title: "Commande livrée",
    body: "Votre commande a été livrée. Merci de votre confiance.",
  },
  DELIVERY_FAILED: {
    title: "Livraison non aboutie",
    body: "La livraison n'a pas abouti. Notre équipe vous recontacte.",
  },
  RETURNED: {
    title: "Commande retournée",
    body: "Votre commande a été retournée à notre dépôt.",
  },
  CANCELLED: {
    title: "Commande annulée",
    body: "Votre commande a été annulée.",
  },
};

/**
 * Correspondence explicite entre un statut de commande et l'événement
 * notifié. Le mapping est écrit à la main plutôt que déduit du nom : il rend
 * visible qu'un statut (`PENDING_CONFIRMATION`) n'a volontairement pas
 * d'événement propre, et empêche qu'un statut ajouté plus tard reçoive
 * silencieusement le message d'un autre.
 */
const STATUS_TO_EVENT: Partial<Record<OrderStatus, NotificationEvent>> = {
  CONFIRMED: "ORDER_CONFIRMED",
  PREPARING: "ORDER_PREPARING",
  READY_FOR_DELIVERY: "ORDER_ASSIGNED",
  ASSIGNED: "ORDER_ASSIGNED",
  OUT_FOR_DELIVERY: "DELIVERY_OUT_FOR_DELIVERY",
  ARRIVED: "DELIVERY_ARRIVED",
  DELIVERED: "ORDER_DELIVERED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
  RETURNED: "ORDER_RETURNED",
};

/**
 * Résout l'identifiant de profil d'un client.
 *
 * `notifications.user_id` référence `profiles(id)`, mais une commande porte
 * `customer_id`, qui référence `customers(id)` : passer l'un pour l'autre
 * viole la clé étrangère. `customers.profile_id` est nullable (commande
 * invité), d'où un `null` possible — la colonne l'accepte.
 */
async function resolveCustomerProfileId(
  customerId: string | null | undefined
): Promise<string | null> {
  if (!customerId) return null;

  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("customers")
      .select("profile_id")
      .eq("id", customerId)
      .maybeSingle();

    if (error) {
      logger.warn("notification: profil client introuvable", { error: error.message });
      return null;
    }
    return data?.profile_id ?? null;
  } catch (error) {
    logger.warn("notification: résolution du profil client impossible", { error });
    return null;
  }
}

/** Notification client liée à un changement de statut de commande. */
export async function notifyOrderStatusChange(input: {
  status: OrderStatus;
  orderId: string;
  orderNumber: string;
  /** `orders.customer_id` (customers.id), pas un identifiant de profil. */
  customerId?: string | null;
  phone?: string | null;
}): Promise<void> {
  const event = STATUS_TO_EVENT[input.status];
  const content = STATUS_MESSAGES[input.status];

  if (!event || !content) {
    // `PENDING_CONFIRMATION` et `CANCELLED` ne concernent pas le suivi client :
    // leur message est envoyé par un autre chemin.
    logger.debug("notification: statut sans événement client", { status: input.status });
    return;
  }

  const profileId = await resolveCustomerProfileId(input.customerId);

  await dispatchNotification({
    event,
    orderId: input.orderId,
    userId: profileId,
    phone: input.phone ?? null,
    title: content.title,
    body: content.body,
  });
}

/**
 * Identifiants de profil des rôles qui traitent les commandes.
 *
 * Une notification interne doit atterrir dans une boîte précise : un `user_id`
 * `null` ne serait rattaché à personne et resterait invisible. On éclate donc
 * l'envoi sur chaque administrateur/opérateur actif.
 */
async function listStaffProfileIds(): Promise<string[]> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .in("role", ["admin", "order_operator"])
      .eq("is_active", true);

    if (error) {
      logger.warn("notification: listage des destinataires internes impossible", {
        error: error.message,
      });
      return [];
    }

    return (data ?? []).map((row) => row.id);
  } catch (error) {
    logger.warn("notification: listage des destinataires internes impossible", { error });
    return [];
  }
}

/** Notification interne destinée aux rôles qui traitent les commandes. */
export async function notifyNewOrder(
  orderId: string,
  orderNumber: string,
  amount: number
): Promise<void> {
  const title = "Nouvelle commande";
  const body = `Commande ${orderNumber} — ${amount.toLocaleString("fr-FR")} XOF, à confirmer.`;

  const staff = await listStaffProfileIds();

  // Aucun administrateur actif : on écrit tout de même une trace interne, mais
  // sans destinataire — utile aux journaux, jamais affichée à un client.
  if (staff.length === 0) {
    await dispatchNotification({ event: "NEW_ORDER_ADMIN", orderId, title, body });
    return;
  }

  await Promise.all(
    staff.map((userId) =>
      dispatchNotification({ event: "NEW_ORDER_ADMIN", orderId, userId, title, body })
    )
  );
}

/** Notification du livreur auquel une livraison vient d'être affectée. */
export async function notifyDriverAssigned(input: {
  driverId: string;
  orderId: string;
  orderNumber: string;
}): Promise<void> {
  await dispatchNotification({
    event: "ORDER_ASSIGNED",
    orderId: input.orderId,
    userId: input.driverId,
    title: "Nouvelle livraison",
    body: `Commande ${input.orderNumber} vous a été affectée.`,
  });
}

/** Alerte de stock aux rôles qui gèrent le catalogue. */
export async function notifyLowStock(
  productName: string,
  available: number
): Promise<void> {
  await dispatchNotification({
    event: "LOW_STOCK",
    title: "Stock faible",
    body: `« ${productName} » : ${available} unité(s) restante(s).`,
  });
}