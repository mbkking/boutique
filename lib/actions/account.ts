"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { phoneSchema, addressSchema } from "@/lib/validations/schemas";
import { createAdminClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/session";
import { safeQuery, toSingle } from "@/lib/data/safe";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import type { Customer } from "@/types";

const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(120, "Le nom ne peut pas dépasser 120 caractères"),
  phone: phoneSchema,
});

const addressInputSchema = addressSchema.extend({
  isDefault: z.boolean().default(false),
});

/**
 * Résout la fiche client du profil connecté.
 *
 * Un client peut commander sans compte : la fiche n'existe pas toujours. Dans
 * ce cas, les mutations créent la fiche à la première écriture plutôt que
 * d'échouer, ce qui évite un compte bloqué.
 */
async function resolveCustomer(
  profileId: string,
  fullName: string,
  phone: string
): Promise<{ customer: Customer | null; client: Awaited<ReturnType<typeof createAdminClient>> | null }> {
  const client = await createAdminClient();

  const existing = await safeQuery("account.customer", (c) =>
    c.from("customers").select("*").eq("profile_id", profileId).limit(1)
  );

  const found = toSingle(existing) as Customer | null;
  if (found) return { customer: found, client };

  const created = await client
    .from("customers")
    .insert({ profile_id: profileId, full_name: fullName, phone })
    .select("*")
    .single();

  if (created.error) {
    console.warn("[account] création de la fiche client impossible :", created.error.message);
    return { customer: null, client };
  }

  return { customer: created.data as Customer, client };
}

/** Met à jour le nom et le téléphone du client connecté. */
export async function updateProfileAction(
  payload: unknown
): Promise<ActionResult<{ fullName: string }>> {
  const profile = await getSessionProfile();
  if (!profile) return failure("Vous devez être connecté pour modifier votre profil.");

  const parsed = profileSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const { customer, client } = await resolveCustomer(
    profile.id,
    parsed.data.fullName,
    parsed.data.phone
  );

  if (!client) return failure("Le service est momentanément indisponible.");

  if (!customer) {
    return failure("Votre fiche client n'a pas pu être créée. Réessayez dans un instant.");
  }

  const { error } = await client
    .from("customers")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq("id", customer.id);

  if (error) {
    console.warn("[account] mise à jour du profil impossible :", error.message);
    return failure("Vos informations n'ont pas pu être enregistrées.");
  }

  // Le profil porte aussi le nom : les deux tables doivent rester cohérentes.
  await client
    .from("profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone })
    .eq("id", profile.id);

  revalidatePath("/account", "layout");
  return success({ fullName: parsed.data.fullName });
}

/** Enregistre une adresse de livraison. */
export async function createAddressAction(
  payload: unknown
): Promise<ActionResult<{ addressId: string }>> {
  const profile = await getSessionProfile();
  if (!profile) return failure("Vous devez être connecté pour gérer vos adresses.");

  const parsed = addressInputSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const { customer, client } = await resolveCustomer(profile.id, profile.full_name, profile.phone);
  if (!client) return failure("Le service est momentanément indisponible.");
  if (!customer) return failure("Votre fiche client est introuvable.");

  const input = parsed.data;

  // Une seule adresse par défaut : on dérive l'ancienne avant d'appliquer.
  if (input.isDefault) {
    await client.from("addresses").update({ is_default: false }).eq("customer_id", customer.id);
  }

  const { data, error } = await client
    .from("addresses")
    .insert({
      customer_id: customer.id,
      city: input.city,
      quarter: input.quarter,
      sector: input.sector ?? null,
      landmark: input.landmark,
      instructions: input.instructions ?? null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      address_code: buildAddressCode(input.quarter),
      is_default: input.isDefault,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[account] création de l'adresse impossible :", error.message);
    return failure("L'adresse n'a pas pu être enregistrée.");
  }

  revalidatePath("/account", "layout");
  return success({ addressId: data.id });
}

const deleteAddressSchema = z.object({
  addressId: z.string().uuid("Adresse invalide"),
});

/**
 * Supprime une adresse.
 *
 * Le contrôle de propriété est fait en base sur `customer_id` : une adresse
 * appartenant à un autre client n'est jamais touchée, même avec un identifiant
 * deviné.
 */
export async function deleteAddressAction(
  payload: unknown
): Promise<ActionResult<{ addressId: string }>> {
  const profile = await getSessionProfile();
  if (!profile) return failure("Vous devez être connecté pour gérer vos adresses.");

  const parsed = deleteAddressSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const client = await createAdminClient();

  const existing = await safeQuery("account.address", (c) =>
    c
      .from("addresses")
      .select("id, customers!inner(id)")
      .eq("id", parsed.data.addressId)
      .eq("customers.profile_id", profile.id)
      .limit(1)
  );

  if (!toSingle(existing)) {
    return failure("Cette adresse est introuvable ou ne vous appartient pas.");
  }

  const { error } = await client.from("addresses").delete().eq("id", parsed.data.addressId);

  if (error) {
    console.warn("[account] suppression de l'adresse impossible :", error.message);
    return failure("L'adresse n'a pas pu être supprimée.");
  }

  revalidatePath("/account", "layout");
  return success({ addressId: parsed.data.addressId });
}

/**
 * Code d'adresse court, lisible et communicable par téléphone.
 * Le même format est utilisé par le checkout invité.
 */
function buildAddressCode(quarter: string): string {
  const letters = quarter
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");

  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return `NE-${letters}-${suffix}`;
}