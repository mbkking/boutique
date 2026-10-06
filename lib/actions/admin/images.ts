"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";
import { safeQuery, toList } from "@/lib/data/safe";
import { AUDIT_ACTIONS, logAuditEntry } from "@/lib/services/audit";
import { logger } from "@/lib/observability/logger";
import {
  ALLOWED_EXTENSIONS,
  MAX_IMAGE_BYTES,
  MAX_PRODUCT_IMAGES,
  buildSafeObjectName,
  sniffImage,
  toStoragePath,
} from "@/lib/services/images";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";

/**
 * Téléversement des visuels produit (§47).
 *
 * Règle non négociable : **le nom de fichier fourni par le navigateur n'est
 * jamais utilisé tel quel**. Il peut contenir `../`, des caractères nuls, ou
 * une extension trompeuse. Le nom réel est reconstruit côté serveur à partir
 * de l'identifiant du produit et d'un aléa.
 *
 * La validation porte sur trois axes : le type MIME déclaré **et** vérifié,
 * la taille, et l'extension. Les trois sont contrôlés — le MIME seul est
 * déclaré par le client et ne prouve rien.
 */

const BUCKET = "product-images";

/** Types réellement acceptés. La liste est aussi appliquée par le bucket. */
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

// Nombre de visuels par produit : 1 à 3 (constante dans lib/services/images).
// La limite est contrôlée ici, pas seulement dans le formulaire : c'est le
// serveur qui reçoit l'envoi, et une boucle qui l'appelle ne doit pas pouvoir
// dépasser le plafond en contournant l'interface.

/** Charge utile d'un téléversement : contenu en base64, jamais un multipart. */
const uploadSchema = z.object({
  productId: z.string().uuid("Produit invalide"),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME, {
    error: "Format d'image non accepté (JPEG, PNG, WebP ou AVIF).",
  }),
  size: z.number().int().positive(),
  /** Contenu encodé en base64. Évite un multipart côté serveur action. */
  content: z.string().min(1),
  altText: z.string().trim().max(160).optional().nullable(),
  isPrimary: z.boolean().default(false),
});

/**
 * Type MIME attendu par l'action, dérivé du schéma.
 *
 * L'interface d'envoi de visuel doit produire une valeur de ce type : la
 * compression choisit un format de sortie, et le serveur compare l'extension
 * au type réellement détecté dans les octets.
 */
export type UploadMimeType = z.infer<typeof uploadSchema>["mimeType"];

const reorderSchema = z.object({
  productId: z.string().uuid("Produit invalide"),
  /** Ordre d'affichage : identifiants d'images, du premier au dernier. */
  imageIds: z.array(z.string().uuid()).max(MAX_PRODUCT_IMAGES),
});

const replaceSchema = z.object({
  imageId: z.string().uuid("Image invalide"),
  productId: z.string().uuid("Produit invalide"),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME, {
    error: "Format d'image non accepté (JPEG, PNG, WebP ou AVIF).",
  }),
  size: z.number().int().positive(),
  content: z.string().min(1),
});

/** Contenu décodé et re-étiqueté d'après ses propres octets. */
type DecodedImage = {
  bytes: Uint8Array;
  mimeType: UploadMimeType;
  extension: string;
};

/**
 * Décode un envoi base64 et déduit le format des octets.
 *
 * Partagé par l'ajout et le remplacement : les deux doivent refuser exactement
 * les mêmes fichiers, sinon « remplacer » devient une porte de contournement.
 */
function decodeUpload(input: {
  size: number;
  content: string;
}): DecodedImage | { error: string } {
  if (input.size > MAX_IMAGE_BYTES) {
    return {
      error: `Image trop lourde (${(input.size / 1024 / 1024).toFixed(1)} Mo). Maximum accepté : 5 Mo.`,
    };
  }

  let bytes: Uint8Array;
  try {
    const binary = atob(input.content);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return { error: "Le fichier envoyé n'a pas pu être lu." };
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { error: "Image trop lourde (maximum 5 Mo)." };
  }

  const detected = sniffImage(bytes);
  if (!detected || !ALLOWED_MIME.includes(detected as UploadMimeType)) {
    return {
      error:
        "Ce fichier n'est pas une image valide. Formats acceptés : JPEG, PNG, WebP, AVIF.",
    };
  }

  const extension =
    ALLOWED_EXTENSIONS.find((ext) =>
      detected === "image/jpeg"
        ? ext === ".jpg" || ext === ".jpeg"
        : ext === `.${detected.split("/")[1]}`
    ) ?? ".jpg";

  return { bytes, mimeType: detected as UploadMimeType, extension };
}

async function getAdminClient(): Promise<SupabaseAdminClient | null> {
  try {
    return await createAdminClient();
  } catch {
    return null;
  }
}


/**
 * Téléverse un visuel produit.
 *
 * Le contenu est décodé puis **ré-étiqueté** : le type retenu est celui des
 * octets, pas celui annoncé. Un fichier `.png` contenant un JPEG est enregistré
 * sous son vrai type.
 */
export async function uploadProductImageAction(
  payload: unknown
): Promise<ActionResult<{ imageId: string; url: string; path: string }>> {
  const auth = await requirePermission(PERMISSIONS.PRODUCT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = uploadSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const input = parsed.data;

  const objectName = buildSafeObjectName(input.productId, input.fileName);
  if (!objectName) {
    return failure("Extension de fichier non acceptée.");
  }

  // Décodage : un contenu invalide est rejeté avant d'atteindre le stockage.
  const decoded = decodeUpload(input);
  if ("error" in decoded) return failure(decoded.error);

  const finalName = objectName.replace(/\.[a-z0-9]+$/i, decoded.extension);
  const path = `${input.productId}/${finalName}`;

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le stockage est momentanément indisponible.");

  // Le plafond est vérifié **avant** l'envoi : `upload()` suivi d'un refus
  // laisserait un fichier orphelin dans le bucket, impossible à voir depuis
  // l'interface.
  const existingOutcome = await safeQuery("images.existing", (client) =>
    client.from("product_images").select("id, is_primary").eq("product_id", input.productId)
  );
  const existing = toList(existingOutcome);

  if (existing.length >= MAX_PRODUCT_IMAGES) {
    return failure(
      `Ce produit possède déjà ${MAX_PRODUCT_IMAGES} images. Supprimez-en une avant d'en ajouter.`
    );
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, decoded.bytes, { contentType: decoded.mimeType, upsert: false });

  if (uploadError) {
    logger.warn("images: téléversement refusé", { error: uploadError.message });
    return failure("L'image n'a pas pu être enregistrée.");
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = publicData.publicUrl;

  // Un premier visuel devient automatiquement le principal : une fiche produit
  // sans image principale affiche un placeholder.
  const makePrimary = input.isPrimary || existing.length === 0;

  if (makePrimary) {
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", input.productId)
      .eq("is_primary", true);
  }

  const nextOrder = existing.length;

  const { data: inserted, error: insertError } = await supabase
    .from("product_images")
    .insert({
      product_id: input.productId,
      url,
      alt_text: input.altText ?? null,
      sort_order: nextOrder,
      is_primary: makePrimary,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // L'image est partie dans le stockage mais pas en base : on la retire pour
    // ne pas laisser de fichier orphelin.
    await supabase.storage.from(BUCKET).remove([path]);
    return failure("L'image n'a pas pu être enregistrée.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "product",
    entity_id: input.productId,
    after: { image_uploaded: true, is_primary: makePrimary },
  });

  revalidatePath(`/admin/products/${input.productId}`, "page");
  return success({ imageId: inserted.id, url, path });
}

/**
 * Remplace le fichier d'un visuel existant.
 *
 * La ligne `product_images` est conservée : son identifiant, son rang et son
 * statut principal ne changent pas, seule l'URL pointe vers le nouveau
 * fichier. Sans cela, remplacer la photo principale la ferait passer en
 * deuxième position, et il faudrait tout réordonner à la main.
 */
export async function replaceProductImageAction(
  payload: unknown
): Promise<ActionResult<{ imageId: string; url: string }>> {
  const auth = await requirePermission(PERMISSIONS.PRODUCT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = replaceSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const input = parsed.data;

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le stockage est momentanément indisponible.");

  const lookup = await safeQuery("images.replace.lookup", (client) =>
    client
      .from("product_images")
      .select("id, url")
      .eq("id", input.imageId)
      .eq("product_id", input.productId)
      .limit(1)
  );

  const image = toList(lookup)[0] as { id: string; url: string } | undefined;
  if (!image) return failure("Image introuvable.");

  const objectName = buildSafeObjectName(input.productId, input.fileName);
  if (!objectName) return failure("Extension de fichier non acceptée.");

  const decoded = decodeUpload(input);
  if ("error" in decoded) return failure(decoded.error);

  const finalName = objectName.replace(/\.[a-z0-9]+$/i, decoded.extension);
  const path = `${input.productId}/${finalName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, decoded.bytes, { contentType: decoded.mimeType, upsert: false });

  if (uploadError) {
    logger.warn("images: remplacement refusé", { error: uploadError.message });
    return failure("L'image n'a pas pu être enregistrée.");
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { error: updateError } = await supabase
    .from("product_images")
    .update({ url })
    .eq("id", input.imageId);

  if (updateError) {
    // La base garde l'ancienne URL : le nouveau fichier devient orphelin, on
    // le retire.
    await supabase.storage.from(BUCKET).remove([path]);
    return failure("L'image n'a pas pu être remplacée.");
  }

  // L'ancien fichier part après l'écriture : dans l'ordre inverse, la ligne
  // pointe toujours vers un fichier qui existe.
  const oldPath = toStoragePath(image.url);
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(BUCKET).remove([oldPath]);
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "product",
    entity_id: input.productId,
    after: { image_replaced: true },
  });

  revalidatePath(`/admin/products/${input.productId}`, "page");
  return success({ imageId: input.imageId, url });
}

const deleteSchema = z.object({
  imageId: z.string().uuid("Image invalide"),
  productId: z.string().uuid("Produit invalide"),
});

/** Supprime un visuel, en base et dans le stockage. */
export async function deleteProductImageAction(
  payload: unknown
): Promise<ActionResult<{ imageId: string }>> {
  const auth = await requirePermission(PERMISSIONS.PRODUCT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = deleteSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le stockage est momentanément indisponible.");

  const lookup = await safeQuery("images.lookup", (client) =>
    client
      .from("product_images")
      .select("id, url, is_primary")
      .eq("id", parsed.data.imageId)
      .eq("product_id", parsed.data.productId)
      .limit(1)
  );

  const image = toList(lookup)[0] as
    | { id: string; url: string; is_primary: boolean }
    | undefined;

  if (!image) return failure("Image introuvable.");

  const { error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", parsed.data.imageId);

  if (error) return failure("L'image n'a pas pu être supprimée.");

  // La ligne en base étant supprimée, le fichier ne sert plus à rien.
  const path = toStoragePath(image.url);
  if (path) {
    await supabase.storage.from(BUCKET).remove([path]);
  }

  // Le visuel principal supprimé désigne le suivant, sinon la fiche affiche
  // un placeholder alors que d'autres images existent.
  if (image.is_primary) {
    const remaining = await safeQuery("images.remaining", (client) =>
      client
        .from("product_images")
        .select("id")
        .eq("product_id", parsed.data.productId)
        .order("sort_order", { ascending: true })
        .limit(1)
    );
    const next = toList(remaining)[0];
    if (next && typeof next.id === "string") {
      await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", next.id);
    }
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "product",
    entity_id: parsed.data.productId,
    after: { image_deleted: true },
  });

  revalidatePath(`/admin/products/${parsed.data.productId}`, "page");
  return success({ imageId: parsed.data.imageId });
}

/** Réordonne les visuels et désigne celui qui est principal. */
export async function reorderProductImagesAction(
  payload: unknown
): Promise<ActionResult<{ productId: string }>> {
  const auth = await requirePermission(PERMISSIONS.PRODUCT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = reorderSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le service catalogue est momentanément indisponible.");

  const { imageIds } = parsed.data;

  // Tous les identifiants doivent appartenir au produit : on ne réordonne pas
  // les visuels d'un autre produit par accident.
  const owned = await safeQuery("images.owned", (client) =>
    client.from("product_images").select("id").eq("product_id", parsed.data.productId)
  );
  const ownedIds = new Set(
    toList(owned)
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string")
  );

  for (const id of imageIds) {
    if (!ownedIds.has(id)) return failure("Un visuel fourni n'appartient pas à ce produit.");
  }

  for (const [index, id] of imageIds.entries()) {
    await supabase
      .from("product_images")
      .update({ sort_order: index, is_primary: index === 0 })
      .eq("id", id)
      .eq("product_id", parsed.data.productId);
  }

  revalidatePath(`/admin/products/${parsed.data.productId}`, "page");
  return success({ productId: parsed.data.productId });
}

// ============================================================
// Visuels de catégorie
// ============================================================
// Une catégorie n'a pas de table `category_images` : elle porte une seule
// colonne `image_url`. On réutilise délibérément le même bucket et les mêmes
// helpers que les visuels produit — un second stockage créerait deux règles de
// validation, deux chemins de suppression et deux insieme de politiques RLS.

const CATEGORY_PREFIX = "categories";

const categoryImageSchema = z.object({
  categoryId: z.string().uuid("Catégorie invalide"),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME, {
    error: "Format d'image non accepté (JPEG, PNG, WebP ou AVIF).",
  }),
  size: z.number().int().positive(),
  content: z.string().min(1),
});

/** Décode le base64 et vérifie les octets, comme pour un visuel produit. */
async function decodeVerifiedImage(
  content: string,
  declaredSize: number,
  declaredName: string
): Promise<
  | { ok: true; bytes: Uint8Array; extension: string; mime: (typeof ALLOWED_MIME)[number] }
  | { ok: false; error: string }
> {
  if (declaredSize > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Image trop lourde (${(declaredSize / 1024 / 1024).toFixed(1)} Mo). Maximum accepté : 5 Mo.`,
    };
  }

  const objectName = buildSafeObjectName("categorie", declaredName);
  if (!objectName) return { ok: false, error: "Extension de fichier non acceptée." };

  let bytes: Uint8Array;
  try {
    const binary = atob(content);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return { ok: false, error: "Le fichier envoyé n'a pas pu être lu." };
  }

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image trop lourde (maximum 5 Mo)." };
  }

  const detected = sniffImage(bytes);
  if (!detected) {
    return {
      ok: false,
      error: "Ce fichier n'est pas une image valide. Formats acceptés : JPEG, PNG, WebP, AVIF.",
    };
  }

  const extension =
    ALLOWED_EXTENSIONS.find((ext) =>
      detected === "image/jpeg"
        ? ext === ".jpg" || ext === ".jpeg"
        : ext === `.${detected.split("/")[1]}`
    ) ?? ".jpg";

  return {
    ok: true,
    bytes,
    extension,
    mime: detected as (typeof ALLOWED_MIME)[number],
  };
}

/**
 * Enregistre (ou remplace) le visuel d'une catégorie.
 *
 * Le remplacement supprime l'ancien fichier : sans cela, chaque changement
 * d'image laisserait un objet orphelin dans le bucket, hors base et donc
 * invisible de l'écran d'administration.
 */
export async function uploadCategoryImageAction(
  payload: unknown
): Promise<ActionResult<{ url: string; path: string }>> {
  const auth = await requirePermission(PERMISSIONS.CATEGORY_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = categoryImageSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const input = parsed.data;

  const decoded = await decodeVerifiedImage(input.content, input.size, input.fileName);
  if (!decoded.ok) return failure(decoded.error);

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le stockage est momentanément indisponible.");

  const current = await safeQuery("categoryImage.current", (client) =>
    client.from("categories").select("image_url").eq("id", input.categoryId).limit(1)
  );
  const row = toList(current)[0] as { image_url?: string | null } | undefined;
  if (!row) return failure("Catégorie introuvable.");

  const previousUrl = typeof row.image_url === "string" ? row.image_url : null;

  // Le nom est reconstruit côté serveur : `input.categoryId` garantit le
  // dossier, la partie libre est un aléa.
  const objectName = buildSafeObjectName(input.categoryId, input.fileName);
  if (!objectName) return failure("Extension de fichier non acceptée.");

  const path = `${CATEGORY_PREFIX}/${input.categoryId}/${objectName.replace(
    /\.[a-z0-9]+$/i,
    decoded.extension
  )}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, decoded.bytes, { contentType: decoded.mime, upsert: false });

  if (uploadError) {
    logger.warn("categoryImage: téléversement refusé", { error: uploadError.message });
    return failure("L'image n'a pas pu être enregistrée.");
  }

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { error: updateError } = await supabase
    .from("categories")
    .update({ image_url: url, updated_at: new Date().toISOString() })
    .eq("id", input.categoryId);

  if (updateError) {
    // Le fichier est en place mais la catégorie ne le référence pas : on
    // retire l'objet pour ne pas laisser de visuel orphelin.
    await supabase.storage.from(BUCKET).remove([path]);
    return failure("L'image n'a pas pu être enregistrée.");
  }

  if (previousUrl && previousUrl !== url) {
    const previousPath = toStoragePath(previousUrl);
    if (previousPath) await supabase.storage.from(BUCKET).remove([previousPath]);
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "category",
    entity_id: input.categoryId,
    after: { image_replaced: Boolean(previousUrl), image_url: url },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  return success({ url, path });
}

/** Retire le visuel d'une catégorie, en base et dans le bucket. */
export async function deleteCategoryImageAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.CATEGORY_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = z.object({ categoryId: z.string().uuid("Catégorie invalide") }).safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le stockage est momentanément indisponible.");

  const current = await safeQuery("categoryImage.lookup", (client) =>
    client.from("categories").select("image_url").eq("id", parsed.data.categoryId).limit(1)
  );
  const row = toList(current)[0] as { image_url?: string | null } | undefined;
  if (!row) return failure("Catégorie introuvable.");

  const previousUrl = typeof row.image_url === "string" ? row.image_url : null;
  if (!previousUrl) return success({ id: parsed.data.categoryId });

  const { error } = await supabase
    .from("categories")
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.categoryId);

  if (error) return failure("L'image n'a pas pu être supprimée.");

  const path = toStoragePath(previousUrl);
  if (path) await supabase.storage.from(BUCKET).remove([path]);

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "category",
    entity_id: parsed.data.categoryId,
    after: { image_deleted: true },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  return success({ id: parsed.data.categoryId });
}

/**
 * Supprime les fichiers de stockage d'un produit supprimé.
 *
 * Utilisé par `deleteProductAction` : les lignes `product_images` partent avec
 * le produit (ON DELETE CASCADE), mais les objets du bucket, eux, survivraient.
 */
export async function removeProductImageFiles(urls: string[]): Promise<void> {
  if (urls.length === 0) return;

  const supabase = await getAdminClient();
  if (!supabase) return;

  const paths = urls
    .map((url) => toStoragePath(url))
    .filter((path): path is string => typeof path === "string");

  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
}

/**
 * Supprime le fichier du visuel d'une catégorie supprimée.
 *
 * La ligne `categories.image_url` disparaît avec la catégorie ; l'objet du
 * bucket resterait sinon hors base, invisible et jamais nettoyé.
 */
export async function removeCategoryImageFile(url: string): Promise<void> {
  await removeProductImageFiles([url]);
}
