import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listAdminOrders } from "@/lib/data/admin/orders";
import { listActiveDeliveryZones } from "@/lib/data/delivery-zones";
import { getOrderStatusLabel, getPaymentStatusLabel } from "@/lib/services/orders";
import { toCsv } from "@/lib/domain/csv";
import { AUDIT_ACTIONS, logAuditEntry } from "@/lib/services/audit";
import { createAdminClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types";

/**
 * Export CSV des commandes.
 *
 * Réservé à l'administrateur : l'export porte sur l'ensemble des commandes et
 * inclut des coordonnées client. Le rôle est vérifié côté serveur, pas par un
 * simple masquage du bouton dans l'interface.
 *
 * L'export est borné : sans pagination explicite, il ne porte que sur les
 * commandes correspondant aux filtres fournis, dans la limite de 5 000 lignes.
 */

export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 5000;

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string {
  const value = params[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

/** Statuts reconnus dans le paramètre `filtre`. */
const TAB_STATUSES: Record<string, OrderStatus[]> = {
  "a-confirmer": ["PENDING_CONFIRMATION"],
  confirmees: ["CONFIRMED"],
  "en-preparation": ["PREPARING", "READY_FOR_DELIVERY"],
  "en-livraison": ["ASSIGNED", "OUT_FOR_DELIVERY", "ARRIVED"],
  livrees: ["DELIVERED"],
  annulees: ["CANCELLED", "RETURNED", "DELIVERY_FAILED"],
};

const PAYMENT_STATUSES: Record<string, string[]> = {
  "en-attente": ["COD_PENDING"],
  encaisse: ["COD_COLLECTED"],
  partiel: ["COD_PARTIAL"],
  echec: ["COD_FAILED"],
};

/**
 * Échappement CSV conforme à RFC 4180, avec neutralisation des formules.
 * Implémenté et testé dans `lib/domain/csv` : c'est une frontière de sécurité.
 */

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requirePermission(PERMISSIONS.EXPORT_RUN);
  if (!auth.authenticated) {
    // 403 uniforme : session absente ou rôle insuffisant. Distinguer les deux
    // cas révélerait à un tiers quelles sessions existent.
    return NextResponse.json({ error: auth.reason }, { status: 403 });
  }

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);

  const tab = readParam(params, "filtre");
  const paymentTab = readParam(params, "paiement");

  const result = await listAdminOrders({
    statuses: TAB_STATUSES[tab],
    paymentStatuses: PAYMENT_STATUSES[paymentTab] as never,
    period: readParam(params, "periode"),
    zoneSlug: readParam(params, "zone"),
    driverId: readParam(params, "livreur"),
    search: readParam(params, "q"),
    page: 1,
    pageSize: MAX_EXPORT_ROWS,
  });

  const zones = await listActiveDeliveryZones();

  const header = [
    "Numéro de commande",
    "Date",
    "Client",
    "Téléphone",
    "Quartier",
    "Ville",
    "Zone",
    "Livreur",
    "Montant (XOF)",
    "Statut",
    "Paiement",
  ];

  const body = result.rows.map((order) => [
    order.orderNumber,
    new Date(order.createdAt).toISOString(),
    order.customerName,
    order.customerPhone,
    order.quarter,
    order.city,
    order.zoneName ?? (zones.length > 0 ? "Zone inconnue" : ""),
    order.driverName,
    order.total,
    getOrderStatusLabel(order.status),
    getPaymentStatusLabel(order.paymentStatus),
  ]);

  // La dernière ligne indique si l'export a été tronqué : sans cela, un
  // administrateur pourrait croire avoir exporté la totalité des commandes.
  const truncated =
    result.totalCount > result.rows.length
      ? [["", "", "", "", "", "", "", "", "", "", `EXPORT TRONQUÉ : ${
          result.totalCount - result.rows.length
        } ligne(s) non incluse(s) sur ${MAX_EXPORT_ROWS} maximum.`]]
      : [];

  const csv = toCsv([header, ...body, ...truncated]);

  // L'export est une extraction en masse de coordonnées clients : il doit
  // laisser une trace nominative, avec les filtres et le volume réellement
  // produits. Sans cette trace, un administrateur legitimement connecté
  // pourrait extraire l'ensemble du fichier client sans que rien ne le
  // distingue d'un usage normal dans le journal.
  await logAuditEntry(await createAdminClient(), {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.ORDERS_EXPORTED,
    entity_type: "order",
    entity_id: "export",
    after: {
      filtre: tab || "toutes",
      paiement: paymentTab || "tous",
      periode: readParam(params, "periode") || "toute",
      zone: readParam(params, "zone") || "toutes",
      livreur: readParam(params, "livreur") || "tous",
      recherche: readParam(params, "q") || null,
      lignes_exportees: body.length,
      total_correspondant: result.totalCount,
      tronque: result.totalCount > body.length,
    },
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commandes-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}