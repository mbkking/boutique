"use server";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { logAuditEntry } from "@/lib/services/audit";
import { createAdminClient } from "@/lib/supabase/server";
import {
  failure,
  firstZodMessage,
  success,
  type ActionResult,
} from "@/lib/actions/types";
import { logger } from "@/lib/observability/logger";
import { z } from "zod";
import {
  MAX_QUARTERS_PER_ZONE,
  MAX_ZONE_FEE,
  parseQuartersInput,
} from "@/lib/domain/delivery-zones";

/**
 * Création, modification et suppression des zones de livraison.
 *
 * Les frais sont saisis en FCFA, sans décimale : le montant est un entier de
 * la devise la plus petite. Le service de tarification relit ces frais au
 * moment de la commande ; le navigateur n'a aucun pouvoir sur eux.
 *
 * Chaque écriture est auditée avec son avant/après : une modification de frais
 * change directement le montant que paient les clients, la trace doit donc
 * permettre de remonter à qui et depuis quand.
 */

/**
 * Saisie d'une zone.
 *
 * Les quartiers arrivent en un seul texte depuis un `<textarea>` ; ils sont
 * éclatés par `parseQuartersInput` avant validation, et le schéma ne voit donc
 * qu'un tableau propre.
 */
const zoneFormSchema = z.object({
  name: z.string().trim().min(2, "Le nom de la zone est requis").max(80),
  city: z.string().trim().min(1, "La ville est requise").max(80).default("Niamey"),
  quarters_input: z.string().max(4000).default(""),
  fee_input: z
    .string()
    .trim()
    .regex(/^\d{1,7}$/, "Saisissez un montant entier en FCFA, sans décimale ni séparateur"),
  is_active: z.boolean().default(true),
});

interface ZoneFormValues {
  name: string;
  city: string;
  quarters: string[];
  fee: number;
  is_active: boolean;
}

/** Une zone sérialisée vers la base : `Record<string, unknown>` l'exige. */
type ZoneRow = Record<string, unknown> & ZoneFormValues;

/**
 * Valide une saisie de zone et renvoie des valeurs propres.
 *
 * La transformation est faite ici plutôt que dans le schéma parce que la
 * conversion du texte en nombre doit être refusée quand elle n'est pas
 * entière : `z.coerce.number()` aurait accepté `"12.50"` puis l'aurait tronqué
 * en silence, ce qui change le prix affiché au client.
 */
function parseZoneForm(
  payload: unknown
): { ok: true; value: ZoneFormValues } | { ok: false; error: string } {
  const parsed = zoneFormSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error.issues) };

  const quarters = parseQuartersInput(parsed.data.quarters_input);
  const fee = Number.parseInt(parsed.data.fee_input, 10);

  if (!Number.isSafeInteger(fee) || fee < 0 || fee > MAX_ZONE_FEE) {
    return { ok: false, error: "Le montant des frais est hors bornes." };
  }

  // La borne est contrôlée après découpage, pas sur la chaîne : une saisie de
  // 4000 caractères peut ne produire qu'un seul quartier, et inversement une
  // liste courte en caractères peut en produire beaucoup.
  if (quarters.length === 0) {
    return { ok: false, error: "Indiquez au moins un quartier." };
  }

  if (quarters.length > MAX_QUARTERS_PER_ZONE) {
    return {
      ok: false,
      error: `Une zone ne peut pas regrouper plus de ${MAX_QUARTERS_PER_ZONE} quartiers.`,
    };
  }

  return {
    ok: true,
    value: {
      name: parsed.data.name,
      city: parsed.data.city,
      quarters,
      fee,
      is_active: parsed.data.is_active,
    },
  };
}

export async function createZoneAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const form = parseZoneForm(payload);
  if (!form.ok) return failure(form.error);

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("delivery_zones")
    .insert({ ...form.value, quarters: form.value.quarters })
    .select("id")
    .single();

  if (error || !data) {
    logger.warn("zones: creation refusee", { error: error?.message });
    return failure("La zone n'a pas pu etre creee.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: "delivery_zone.create",
    entity_type: "delivery_zones",
    entity_id: data.id,
    after: form.value as ZoneRow,
  });

  return success({ id: data.id });
}

export async function updateZoneAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const id = z.string().uuid("Zone invalide").safeParse(
    (payload as { id?: unknown })?.id
  );
  if (!id.success) return failure(firstZodMessage(id.error.issues));

  const form = parseZoneForm(payload);
  if (!form.ok) return failure(form.error);

  const supabase = await createAdminClient();

  // Etat precedent, pour que le journal d'audit dise ce que la modification a
  // reellement change. Sans cet aller-retour, une trace d'audit qui ne montre
  // que le nouvel etat ne permet pas de reconstituer le montant ancien.
  const { data: previous } = await supabase
    .from("delivery_zones")
    .select("name, city, quarters, fee, is_active")
    .eq("id", id.data)
    .maybeSingle();

  const { error } = await supabase
    .from("delivery_zones")
    .update({ ...form.value, updated_at: new Date().toISOString() })
    .eq("id", id.data);

  if (error) {
    logger.warn("zones: modification refusee", { error: error.message });
    return failure("La zone n'a pas pu etre modifiee.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: "delivery_zone.update",
    entity_type: "delivery_zones",
    entity_id: id.data,
    before: previous as ZoneRow | null,
    after: form.value as ZoneRow,
  });

  return success({ id: id.data });
}

/**
 * Supprime une zone.
 *
 * Refuse la suppression d'une zone qui porte encore des livraisons : la
 * colonne `deliveries.zone_id` référence cette zone, et la supprimer laisserait
 * des livraisons orphelines dont les frais de livraison ne seraient plus
 * rattachables à rien. L'alternative — activation/désactivation — préserve
 * l'historique, ce qui est le bon réflexe sur des commandes passées.
 */
export async function deleteZoneAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const id = z.string().uuid("Zone invalide").safeParse(
    (payload as { id?: unknown })?.id
  );
  if (!id.success) return failure(firstZodMessage(id.error.issues));

  const supabase = await createAdminClient();

  const { count, error: countError } = await supabase
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .eq("zone_id", id.data);

  if (countError) {
    logger.warn("zones: comptage des livraisons refuse", {
      error: countError.message,
    });
    return failure("Impossible de verifier l'utilisation de cette zone.");
  }

  if ((count ?? 0) > 0) {
    return failure(
      "Cette zone porte des livraisons existantes. Desactivez-la plutot que de la supprimer, pour conserver l'historique."
    );
  }

  const { error } = await supabase.from("delivery_zones").delete().eq("id", id.data);

  if (error) {
    logger.warn("zones: suppression refusee", { error: error.message });
    return failure("La zone n'a pas pu etre supprimee.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: "delivery_zone.delete",
    entity_type: "delivery_zones",
    entity_id: id.data,
    before: null,
  });

  return success({ id: id.data });
}

/**
 * Active ou desactive une zone.
 *
 * Un simple interrupteur : c'est l'operation la plus frequente, et elle ne doit
 * pas obliger a rouvrir un formulaire pour un changement de deux caracteres.
 */
export async function setZoneActiveAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = z
    .object({ id: z.string().uuid("Zone invalide"), is_active: z.boolean() })
    .safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await createAdminClient();

  const { data: previous } = await supabase
    .from("delivery_zones")
    .select("is_active")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const { error } = await supabase
    .from("delivery_zones")
    .update({ is_active: parsed.data.is_active, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id);

  if (error) {
    logger.warn("zones: bascule refusee", { error: error.message });
    return failure("La zone n'a pas pu etre modifiee.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: parsed.data.is_active ? "delivery_zone.enable" : "delivery_zone.disable",
    entity_type: "delivery_zones",
    entity_id: parsed.data.id,
    before: previous ?? null,
    after: { is_active: parsed.data.is_active },
  });

  return success({ id: parsed.data.id });
}
