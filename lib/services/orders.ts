import type { DeliveryStatus, OrderStatus, PaymentStatus } from "@/types";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_CONFIRMATION: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_DELIVERY: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["ARRIVED"],
  ARRIVED: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERED: ["RETURNED"],
  DELIVERY_FAILED: ["RETURNED", "OUT_FOR_DELIVERY"],
  RETURNED: [],
  CANCELLED: [],
};

export function canTransitionTo(
  currentStatus: OrderStatus,
  newStatus: OrderStatus
): boolean {
  const allowed = VALID_TRANSITIONS[currentStatus];
  return allowed.includes(newStatus);
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_CONFIRMATION: "En attente de confirmation",
  CONFIRMED: "Confirmée",
  PREPARING: "En préparation",
  READY_FOR_DELIVERY: "Prête pour livraison",
  ASSIGNED: "Assignée",
  OUT_FOR_DELIVERY: "En cours de livraison",
  ARRIVED: "Arrivé",
  DELIVERED: "Livrée",
  DELIVERY_FAILED: "Livraison échouée",
  RETURNED: "Retournée",
  CANCELLED: "Annulée",
};

export function getOrderStatusLabel(status: OrderStatus): string {
  return STATUS_LABELS[status] ?? status;
}

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING_ASSIGNMENT: "En attente d'affectation",
  ASSIGNED: "Affectée à un livreur",
  ACCEPTED: "Acceptée par le livreur",
  IN_PREPARATION: "En préparation",
  OUT_FOR_DELIVERY: "En cours de livraison",
  ARRIVED: "Arrivée chez le client",
  DELIVERED: "Livrée",
  FAILED: "Livraison échouée",
  RESCHEDULED: "Reprogrammée",
  RETURNED: "Retournée",
};

export function getDeliveryStatusLabel(status: DeliveryStatus): string {
  return DELIVERY_STATUS_LABELS[status] ?? status;
}

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  COD_PENDING: "Paiement à la livraison en attente",
  COD_COLLECTED: "Paiement à la livraison encaissé",
  COD_PARTIAL: "Paiement à la livraison partiel",
  COD_FAILED: "Paiement à la livraison échoué",
  REFUNDED: "Remboursé",
};

export function getPaymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

/**
 * Format du numéro de commande : `CMD-AAAA-000000`.
 *
 * La génération elle-même est désormais faite par la séquence PostgreSQL
 * (`generate_order_number()`, migration 004), qui garantit l'unicité sous
 * concurrence. Un tirage aléatoire en JavaScript exposait à des collisions,
 * d'où une boucle de réessai qui masquait la panne.
 *
 * Cette fonction ne sert qu'à valider le format des numéros saisis dans
 * l'écran de suivi de commande.
 */
const ORDER_NUMBER_PATTERN = /^CMD-\d{4}-\d{6}$/;

export function isValidOrderNumber(value: string): boolean {
  return ORDER_NUMBER_PATTERN.test(value.trim().toUpperCase());
}
