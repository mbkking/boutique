"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/server";
import { logAuditEntry, AUDIT_ACTIONS } from "@/lib/services/audit";
import { logger } from "@/lib/observability/logger";
import {
  ALLOWED_EXTENSIONS,
  MAX_IMAGE_BYTES,
  sniffImage,
} from "@/lib/services/images";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";

/**
 * Visuel institutionnel (logo, favicon) du site.
 *
 * Stocké dans le même bucket public `product-images`, sous le préfixe
 * `branding/`, mais avec un nom rég�n�ré côt� serveur - jamais le nom du
 * navigateur. Les octets sont vérifiés (magic numbers) comme pour les
 * images produit.
 */

const BUCKET = "product-images";

const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"], {
    error: "Format d'image non accepté (JPEG, PNG, WebP ou AVIF).",
  }),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES),
  content: z.string().min(1),
});

export async function uploadBrandingImageAction(
  payload: unknown
): Promise<ActionResult<{ url: string }>> {
  const auth = await requirePermission(PERMISSIONS.SETTINGS_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = uploadSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const lower = parsed.data.fileName.toLowerCase();
  const extension = ALLOWED_EXTENSIONS.find((ext) => lower.endsWith(ext));
  if (!extension) return failure("Extension de fichier non autorisée.");

  let buffer: Buffer;
  try {
    buffer = Buffer.from(parsed.data.content, "base64");
  } catch {
    return failure("Contenu illisible.");
  }
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
    return failure("Fichier vide ou trop volumineux (5 Mo maximum).");
  }

  const sniffed = sniffImage(new Uint8Array(buffer));
  if (!sniffed || sniffed !== parsed.data.mimeType) {
    return failure("Le contenu ne correspond pas au type déclaré.");
  }

  const supabase = await createAdminClient();
  const path = `branding/${randomUUID().replace(/-/g, "").slice(0, 16)}${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: sniffed,
    upsert: false,
  });
  if (error) {
    logger.warn("branding: upload refusé", { error: error.message });
    return failure("L'image n'a pas pu être envoyée.");
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entity_type: "site_branding",
    entity_id: path,
    after: { kind: "upload" },
  });

  revalidatePath("/");
  return success({ url: publicData.publicUrl });
}
