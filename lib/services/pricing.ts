import type { DeliveryZone, Promotion } from "@/types";

export function calculateLineTotal(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

export function calculateSubtotal(
  items: Array<{ unit_price: number; quantity: number }>
): number {
  return items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
}

export function calculateDiscount(
  subtotal: number,
  promotions: Promotion[]
): number {
  let totalDiscount = 0;
  for (const promo of promotions) {
    if (!promo.is_active) continue;
    if (promo.min_order_amount !== null && subtotal < promo.min_order_amount) {
      continue;
    }
    if (promo.type === "PERCENTAGE") {
      totalDiscount += Math.round((subtotal * promo.value) / 100);
    } else {
      totalDiscount += promo.value;
    }
  }
  return Math.min(totalDiscount, subtotal);
}

export function calculateTotal(
  subtotal: number,
  deliveryFee: number,
  discount: number
): number {
  return Math.max(0, subtotal - discount + deliveryFee);
}

export function getDeliveryFee(
  quarter: string,
  zones: DeliveryZone[]
): number {
  const normalizedQuarter = quarter.trim().toLowerCase();
  for (const zone of zones) {
    if (!zone.is_active) continue;
    const match = zone.quarters.find(
      (q) => q.trim().toLowerCase() === normalizedQuarter
    );
    if (match) return zone.fee;
  }
  return 0;
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";
}
