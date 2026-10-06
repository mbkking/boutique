import "server-only";

import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import type { Address, Customer } from "@/types";

const CUSTOMER_SELECT = `
  id,
  profile_id,
  full_name,
  phone,
  total_orders,
  total_spent,
  created_at,
  updated_at
`;

const ADDRESS_SELECT = `
  id,
  customer_id,
  city,
  quarter,
  sector,
  landmark,
  instructions,
  latitude,
  longitude,
  address_code,
  is_default,
  created_at
`;

/**
 * Client associ� au profil connect�.
 *
 * La fiche `customers` est cr��e/recup�r�e par la fonction
 * `ensure_customer` (migration 022) : elle existe d�s la connexion, m��me si
 * le client n'a jamais modifi� son profil, et elle adopte les commandes
 * pass��es sans compte (m��me t��l�phone). Sans cela, une commande en cours �tait
 * �crite avec `customer_id = NULL` et restait invisible dans « Mon compte ».
 */
export async function getCustomerByProfileId(
  profileId: string
): Promise<Customer | null> {
  if (!profileId) return null;

  const ensured = await safeQuery("customers.ensure", (supabase) =>
    supabase.rpc("ensure_customer", { p_profile_id: profileId })
  );

  const ensuredId =
    typeof ensured.data === "string" ? ensured.data : null;

  if (ensuredId) {
    // Le rapprochement des commandes orphelines est fait par la fonction
    // serveur (r��serv��e au r�le de service) : on l'active une fois par
    // session c�t� serveur.
    await adoptOrphanOrders(ensuredId);
  }

  const outcome = await safeQuery("customers.byProfile", (supabase) =>
    supabase
      .from("customers")
      .select(CUSTOMER_SELECT)
      .eq("profile_id", profileId)
      .limit(1)
  );

  const row = toSingle(outcome);
  return row ? (row as Customer) : null;
}

/** Appel unique par identifiant client, pour ne pas r�p�ter l'adoption. */
const adoptionsInFlight = new Map<string, Promise<void>>();

function adoptOrphanOrders(customerId: string): Promise<void> {
  const running = adoptionsInFlight.get(customerId);
  if (running) return running;

  const task = (async () => {
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const supabase = await createAdminClient();
      await supabase.rpc("adopt_orphan_orders", { p_customer_id: customerId });
    } catch {
      // L'adoption est un confort : son �chec ne doit pas masquer la fiche
      // client, qui reste lisible juste apr��s.
    } finally {
      adoptionsInFlight.delete(customerId);
    }
  })();

  adoptionsInFlight.set(customerId, task);
  return task;
}

/** Adresses enregistrées d'un client, adresse par défaut en premier. */
export async function listAddressesForCustomer(
  customerId: string
): Promise<Address[]> {
  if (!customerId) return [];

  const outcome = await safeQuery("addresses.forCustomer", (supabase) =>
    supabase
      .from("addresses")
      .select(ADDRESS_SELECT)
      .eq("customer_id", customerId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
  );

  return toList(outcome) as Address[];
}

/** Totaux recapitalisés pour le tableau de bord client. */
export interface CustomerStats {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

/** Statistiques de commande agrégées côté serveur pour la page compte. */
export async function getCustomerStats(customerId: string): Promise<CustomerStats> {
  const empty: CustomerStats = { orderCount: 0, totalSpent: 0, lastOrderAt: null };
  if (!customerId) return empty;

  const outcome = await safeQuery("orders.customerStats", (supabase) =>
    supabase
      .from("orders")
      .select("total, created_at")
      .eq("customer_id", customerId)
      .neq("status", "CANCELLED")
  );

  const rows = toList(outcome);
  if (rows.length === 0) return empty;

  let totalSpent = 0;
  let lastOrderAt: string | null = null;

  for (const row of rows) {
    totalSpent += typeof row.total === "number" ? row.total : 0;
    if (typeof row.created_at === "string" && (lastOrderAt === null || row.created_at > lastOrderAt)) {
      lastOrderAt = row.created_at;
    }
  }

  return { orderCount: rows.length, totalSpent, lastOrderAt };
}