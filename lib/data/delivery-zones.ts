import "server-only";

import { safeQuery, toList } from "@/lib/data/safe";
import type { DeliveryZone } from "@/types";

const DELIVERY_ZONE_SELECT = `
  id,
  name,
  city,
  quarters,
  fee,
  is_active,
  created_at,
  updated_at
`;

/**
 * Zones de livraison actives, utilisées pour calculer les frais de port.
 *
 * Le tableau `quarters` est normalisé côté base (défaut `'{}'`), mais on
 * reconstruit un tableau ici afin de ne jamais propager `null` au service de
 * tarification.
 */
export async function listActiveDeliveryZones(): Promise<DeliveryZone[]> {
  const outcome = await safeQuery("delivery-zones.list", (supabase) =>
    supabase
      .from("delivery_zones")
      .select(DELIVERY_ZONE_SELECT)
      .eq("is_active", true)
      .order("fee", { ascending: true })
  );

  return toList(outcome).map((zone) => ({
    ...zone,
    quarters: Array.isArray(zone.quarters) ? zone.quarters : [],
  }));
}

/**
 * Toutes les zones, actives ou non.
 *
 * Réservé au back-office : une zone désactivée doit rester listée, sinon
 * l'administrateur ne peut plus jamais la réactiver. Le checkout, lui, ne voit
 * que les zones actives.
 */
export async function listAllDeliveryZones(): Promise<DeliveryZone[]> {
  const outcome = await safeQuery("delivery-zones.listAll", (supabase) =>
    supabase
      .from("delivery_zones")
      .select(DELIVERY_ZONE_SELECT)
      .order("is_active", { ascending: false })
      .order("city", { ascending: true })
      .order("name", { ascending: true })
      .limit(200)
  );

  return toList(outcome).map((zone) => ({
    ...zone,
    quarters: Array.isArray(zone.quarters) ? zone.quarters : [],
  }));
}