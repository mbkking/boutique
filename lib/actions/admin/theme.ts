"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS, logAuditEntry } from "@/lib/services/audit";
import { logger } from "@/lib/observability/logger";
import {
  ALLOWED_EXTENSIONS,
  MAX_IMAGE_BYTES,
  sniffImage,
} from "@/lib/services/images";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import {
  ADMIN_THEME_KEYS,
  DEFAULT_ADMIN_THEME,
  adminThemeSchema,
  adminThemeStorageKey,
  type AdminTheme,
} from "@/lib/theme/admin-theme";

/**
 * Apparence du back-office : lecture, écriture, reset et fichiers.
 *
 * Le thème vit dans `app_settings` (aucune table supplémentaire). L'écriture
 * exige le droit `settings:write`, vérifié côté serveur : un client ou un
 * livreur ne peut pas y accéder, quel que soit l'affichage des boutons.
 *
 * Les images (logo, fond) sont envoyées dans le bucket `product-images`,
 * déjà protégé par les politiques Storage existantes, sous le préfixe
 * `branding/admin/`. Le nom du fichier est reconstruit côté serveur.
 */

const BUCKET = "product-images";

function toRows(theme: AdminTheme, updatedAt: string) {
  return ADMIN_THEME_KEYS.map((field) => ({
    key: adminThemeStorageKey(field),
    value: String(theme[field]),
    updated_at: updatedAt,
  }));
}

/** Enregistre le thème complet. */
export async function saveAdminThemeAction(payload: unknown): Promise<ActionResult<AdminTheme>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = adminThemeSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const theme = parsed.data;
  const supabase = await createAdminClient();

  const { error } = await supabase
    .from("app_settings")
    .upsert(toRows(theme, new Date().toISOString()), { onConflict: "key" });

  if (error) {
    logger.warn("adminTheme: ecriture refusee", { error: error.message });
    return failure("L'apparence n'a pas pu etre enregistree.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entity_type: "app_settings",
    entity_id: "admin_theme",
    // Les cles seulement : une URL de fond n'a pas sa place dans un journal.
    after: { keys: ADMIN_THEME_KEYS },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin", "layout");

  return success(theme);
}

/** Restaure l'apparence par defaut, sans toucher aux autres reglages. */
export async function resetAdminThemeAction(): Promise<ActionResult<AdminTheme>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("app_settings")
    .upsert(toRows(DEFAULT_ADMIN_THEME, new Date().toISOString()), { onConflict: "key" });

  if (error) {
    logger.warn("adminTheme: reset refuse", { error: error.message });
    return failure("L'apparence par defaut n'a pas pu etre restauree.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entity_type: "app_settings",
    entity_id: "admin_theme_reset",
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin", "layout");

  return success(DEFAULT_ADMIN_THEME);
}

const uploadSchema = z.object({
  kind: z.enum(["logo", "background"]),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"], {
    error: "Format d'image non accepte (JPEG, PNG ou WebP).",
  }),
  // La taille maximale est contrôlée côté serveur : une valeur négative ou
  // démesurée ne doit jamais atteindre le contrôle d'octets.
  size: z.number().int().positive(),
  content: z.string().min(1),
});

/** Televerse le logo ou l'image de fond du back-office. */
export async function uploadAdminThemeAssetAction(
  payload: unknown
): Promise<ActionResult<{ url: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = uploadSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const { kind, fileName, mimeType, size, content } = parsed.data;
  const extension = ALLOWED_EXTENSIONS.find((allowed) =>
    fileName.toLowerCase().endsWith(allowed)
  );
  if (!extension) return failure("Extension de fichier non autorisee.");

  let buffer: Buffer;
  try {
    buffer = Buffer.from(content, "base64");
  } catch {
    return failure("Contenu illisible.");
  }

  if (buffer.byteLength === 0) return failure("Fichier vide.");
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return failure("Fichier trop volumineux (5 Mo maximum).");
  }

  // Le type declare par le navigateur ne prouve rien : on verifie les octets.
  const sniffed = sniffImage(new Uint8Array(buffer));
  if (!sniffed || sniffed !== mimeType) {
    return failure("Le contenu du fichier ne correspond pas au type annonce.");
  }

  const supabase = await createAdminClient();
  const path = `branding/admin/${kind}-${randomUUID().replace(/-/g, "").slice(0, 12)}${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: sniffed,
    upsert: false,
  });

  if (error) {
    logger.warn("adminTheme: upload refuse", { kind, error: error.message });
    return failure("L'image n'a pas pu etre envoyee.");
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entity_type: "app_settings",
    entity_id: `admin_theme_${kind}`,
    after: { uploaded: true },
  });

  return success({ url: publicData.publicUrl });
}