"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/server";
import { logAuditEntry, AUDIT_ACTIONS } from "@/lib/services/audit";
import { logger } from "@/lib/observability/logger";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";

/**
 * Gestion des comptes par un administrateur : création, rôle et activation.
 *
 * Le rôle n'est jamais pris côté client : on valide le profil courant côté
 * serveur avant chaque écriture, puis on journalise.
 */

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "order_operator", "stock_manager", "driver", "customer"]),
});

/**
 * Rôles attribuables par un administrateur.
 *
 * La liste est fermée et reprise de la matrice RBAC du projet : aucun rôle
 * inventé, et `customer` reste le seul rôle qui reçoit une fiche client.
 */
const ASSIGNABLE_ROLES = [
  { value: "admin", label: "Administrateur" },
  { value: "order_operator", label: "Opérateur de commandes" },
  { value: "stock_manager", label: "Gestionnaire de stock" },
  { value: "driver", label: "Livreur" },
  { value: "customer", label: "Client" },
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]["value"];

const createUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(120, "Le nom ne peut pas dépasser 120 caractères"),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(254),
  phone: z
    .string()
    .trim()
    .min(6, "Le téléphone est requis")
    .max(30)
    .regex(/^[+0-9 ().-]+$/, "Téléphone invalide"),
  role: z.enum(["admin", "order_operator", "stock_manager", "driver", "customer"]),
});

/**
 * Mot de passe provisoire.
 *
 * Il est affiché **une seule fois** à l'administrateur, qui le transmet à la
 * personne concernée. Il n'est jamais stocké en clair ni journalisé : c'est la
 * seule façon de créer un compte utilisable sans dépendre de la configuration
 * e-mail du projet (SMTP peut être absent, ce qui bloque les invitations).
 */
function generateTemporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const random = Array.from({ length: 12 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
  return `Ns${random}!7`;
}

/** Crée un compte et lui attribue le rôle choisi. Réservé aux administrateurs. */
export async function createUserAction(payload: unknown): Promise<
  ActionResult<{ email: string; role: AssignableRole; temporaryPassword: string }>
> {
  const auth = await requirePermission(PERMISSIONS.USER_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = createUserSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const { fullName, email, phone, role } = parsed.data;
  const supabase = await createAdminClient();
  const temporaryPassword = generateTemporaryPassword();

  const created = await supabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });

  if (created.error || !created.data.user) {
    const detail = (created.error?.message ?? "").toLowerCase();
    const isDuplicate =
      detail.includes("already been registered") ||
      detail.includes("already registered") ||
      detail.includes("user already exists");

    logger.warn("users: creation refusee", { error: created.error?.message });

    if (isDuplicate) {
      return failure("Un compte existe déjà avec cette adresse e-mail.");
    }

    return failure(
      detail.includes("rate limit") || detail.includes("too many")
        ? "Trop de créations consécutives. Réessayez dans quelques minutes."
        : "Le compte n'a pas pu être créé."
    );
  }

  const userId = created.data.user.id;

  // Le rôle n'est appliqué qu'après création réussie, et jamais à partir d'une
  // valeur transmise par le navigateur sans validation.
  const profile = await supabase
    .from("profiles")
    .update({ role, phone, full_name: fullName, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (profile.error) {
    logger.error("users: role non applique apres creation", {
      user_id: userId,
      error: profile.error.message,
    });
    return failure(
      "Le compte a été créé mais le rôle n'a pas pu être appliqué. Corrigez le rôle depuis la liste des utilisateurs."
    );
  }

  // Un client doit exister dans `customers` pour être rattaché à ses commandes :
  // sans cette fiche, ses commandes seraient invisibles dans son espace.
  if (role === "customer") {
    const alreadyLinked = await supabase
      .from("customers")
      .select("id")
      .eq("profile_id", userId)
      .limit(1);

    if (alreadyLinked.error === null && alreadyLinked.data?.length === 0) {
      const byPhone = await supabase
        .from("customers")
        .select("id")
        .eq("phone", phone)
        .limit(1);

      if (byPhone.data && byPhone.data.length > 0) {
        await supabase
          .from("customers")
          .update({ profile_id: userId })
          .eq("id", byPhone.data[0].id);
      } else {
        const customer = await supabase
          .from("customers")
          .insert({ profile_id: userId, full_name: fullName, phone })
          .select("id")
          .single();

        if (customer.error) {
          logger.warn("users: fiche client non creee", { error: customer.error.message });
        }
      }
    }
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: "user.created",
    entity_type: "profiles",
    entity_id: userId,
    // Jamais le mot de passe, et l'e-mail n'apparaît que comme confirmation.
    after: { role, created: true },
  });

  revalidatePath("/admin/users");
  return success({ email, role, temporaryPassword });
}

export async function setUserRoleAction(payload: unknown): Promise<ActionResult<object>> {
  const auth = await requirePermission(PERMISSIONS.USER_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = roleSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  if (parsed.data.userId === auth.profile.id && parsed.data.role !== "admin") {
    return failure("Vous ne pouvez pas retirer votre propre réle administrateur.");
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.userId);

  if (error) {
    logger.warn("users: réle refusé", { error: error.message });
    return failure("Le réle n'a pas pu être modifié.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entity_type: "profiles",
    entity_id: parsed.data.userId,
    after: { role: parsed.data.role },
  });

  revalidatePath("/admin/users");
  return success({});
}

const activeSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export async function setUserActiveAction(payload: unknown): Promise<ActionResult<object>> {
  const auth = await requirePermission(PERMISSIONS.USER_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = activeSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  if (parsed.data.userId === auth.profile.id && !parsed.data.isActive) {
    return failure("Vous ne pouvez pas désactiver votre propre compte.");
  }

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: parsed.data.isActive, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.userId);

  if (error) {
    logger.warn("users: activation refusée", { error: error.message });
    return failure("Le statut n'a pas pu être modifié.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entity_type: "profiles",
    entity_id: parsed.data.userId,
    after: { is_active: parsed.data.isActive },
  });

  revalidatePath("/admin/users");
  return success({});
}
