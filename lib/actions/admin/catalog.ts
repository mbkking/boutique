"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guard";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";
import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import { removeCategoryImageFile, removeProductImageFiles } from "@/lib/actions/admin/images";
import { AUDIT_ACTIONS, logAuditEntry } from "@/lib/services/audit";
import { sanitizeSlug } from "@/lib/data/sanitize";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";
import type { UserRole } from "@/types";

/**
 * Écritures d'administration sur le catalogue.
 *
 * Chaque action :
 * - vérifie le droit requis **côté serveur** ;
 * - valide la charge utile avec Zod ;
 * - contrôle l'unicité des slugs et SKU ;
 * - journalise l'opération (section 25 : prix et produit doivent être tracés).
 */

const SLUG_PATTERN = /^[a-z0-9-]+$/;

const productWriteSchema = z.object({
  name: z.string().trim().min(3, "Le nom doit contenir au moins 3 caractères").max(200),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .regex(SLUG_PATTERN, "Le slug ne peut contenir que des minuscules, chiffres et tirets"),
  sku: z.string().trim().min(3, "Le SKU doit contenir au moins 3 caractères").max(64),
  // La catégorie est obligatoire à la création (le formulaire la marque
  // `required` et son `noValidate` empêche le navigateur de bloquer l'envoi) :
  // le message doit donc nommer le champ à remplir, pas parler d'identifiant.
  categoryId: z.string().uuid("Choisissez une catégorie."),
  description: z.string().trim().min(10, "La description doit contenir au moins 10 caractères"),
  shortDescription: z.string().trim().max(300).optional().nullable(),
  price: z.number().int().min(0, "Le prix ne peut pas être négatif"),
  compareAtPrice: z.number().int().min(0).optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  /**
   * Stock initial du produit.
   *
* Il est porté par la variante par défaut créée dans la même opération :
 * `product_variants` est la source de vérité du stock vendable, le panier
 * et la commande n'acceptant qu'une `variant_id`.
   */
  stockOnHand: z.number().int().min(0, "Le stock ne peut pas être négatif").default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  weightKg: z.number().min(0).max(10000).optional().nullable(),
  seoTitle: z.string().trim().max(200).optional().nullable(),
  seoDescription: z.string().trim().max(320).optional().nullable(),
});

const productPatchSchema = productWriteSchema.partial().extend({
  id: z.string().uuid("Produit invalide"),
  // Une fiche peut n'avoir aucune catégorie : la retirer est une modification
  // légitime, pas un identifiant mal formé.
  categoryId: z.string().uuid("Choisissez une catégorie.").nullable(),
});

const variantWriteSchema = z.object({
  productId: z.string().uuid("Produit invalide"),
  sku: z.string().trim().min(3).max(64),
  attributes: z.record(z.string(), z.string()).default({}),
  price: z.number().int().min(0, "Le prix ne peut pas être négatif"),
  compareAtPrice: z.number().int().min(0).optional().nullable(),
  stockOnHand: z.number().int().min(0, "Le stock ne peut pas être négatif"),
  lowStockThreshold: z.number().int().min(0).default(5),
});

const variantPatchSchema = variantWriteSchema.partial().extend({
  id: z.string().uuid("Variante invalide"),
});

const categoryWriteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(SLUG_PATTERN, "Le slug ne peut contenir que des minuscules, chiffres et tirets"),
  parentId: z.string().uuid("Catégorie parente invalide").optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().trim().url("L'URL de l'image est invalide").optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  seoTitle: z.string().trim().max(200).optional().nullable(),
  seoDescription: z.string().trim().max(320).optional().nullable(),
});

const categoryPatchSchema = categoryWriteSchema.partial().extend({
  id: z.string().uuid("Catégorie invalide"),
});

async function getAdminClient(): Promise<SupabaseAdminClient | null> {
  try {
    return await createAdminClient();
  } catch {
    return null;
  }
}

/** Slug dérivé du nom si l'utilisateur n'en fournit pas. */
function deriveSlug(name: string): string {
  const slug = sanitizeSlug(name);
  return slug === "" ? "produit" : slug;
}

/**
 * Vérifie qu'un parent existe et n'est pas soi-même descendant.
 * Empêche de créer une boucle dans la hiérarchie des catégories.
 */
async function wouldCreateLoop(
  supabase: SupabaseAdminClient,
  categoryId: string,
  parentId: string
): Promise<boolean> {
  if (categoryId === parentId) return true;

  let cursor: string | null = parentId;
  const seen = new Set<string>();

  // Remonte la chaîne des parents ; une profondeur excessive signale une boucle.
  while (cursor !== null) {
    if (cursor === categoryId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    if (seen.size > 20) return true;

    const outcome = await safeQuery("categories.parent", (client) =>
      client.from("categories").select("parent_id").eq("id", cursor).limit(1)
    );
    const row = toSingle(outcome);

    if (!row) return false;
    cursor = typeof row.parent_id === "string" ? row.parent_id : null;
  }

  return false;
}

async function slugExists(
  supabase: SupabaseAdminClient,
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const outcome = await safeQuery("catalog.slugExists", (client) => {
    let builder = client.from("products").select("id").eq("slug", slug).limit(1);
    // `neq` et non `eq` : l'exclusion porte sur les *autres* produits. Avec
    // `eq`, réenregistrer un produit sans changer son slug le trouvait
    // « déjà utilisé » — sa propre ligne — et la modification était refusée.
    if (excludeId) builder = builder.neq("id", excludeId);
    return builder;
  });

  return toSingle(outcome) !== null;
}

async function skuExists(
  supabase: SupabaseAdminClient,
  table: "products" | "product_variants",
  sku: string,
  excludeId?: string
): Promise<boolean> {
  const outcome = await safeQuery("catalog.skuExists", (client) => {
    let builder = client.from(table).select("id").eq("sku", sku).limit(1);
    // Même raison que pour le slug : la ligne à exclure est celle en cours
    // d'enregistrement, pas celle à rejeter.
    if (excludeId) builder = builder.neq("id", excludeId);
    return builder;
  });

  return toSingle(outcome) !== null;
}

/**
 * SKU de la variante par défaut d'un produit.
 *
 * `product_variants.sku` est UNIQUE au global : un SKU de variante ne peut
 * donc pas réutiliser tel quel le SKU du produit si une variante porte déjà
 * ce nom. Le suffixe `-STD` suit la convention du catalogue existant ; un
 * compteur est ajouté en cas de collision.
 *
 * Seule la table `product_variants` est interrogée. `products.sku` est unique
 * sur une autre table : une valeur y est sans effet sur la contrainte de la
 * variante, et la copier ici confondrait deux espaces de noms distincts.
 */
async function deriveDefaultVariantSku(
  supabase: SupabaseAdminClient,
  productSku: string
): Promise<string> {
  const base = `${productSku}-STD`;

  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    if (await skuExists(supabase, "product_variants", candidate)) continue;
    return candidate;
  }

  // Situation exceptionnelle : on suffixe plutôt que d'échouer, le catalogue
  // doit rester créable.
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Crée la variante qui porte le stock d'un produit.
 *
 * Le panier, la commande et `adjustStock` travaillent tous sur une
 * `variant_id`. Un produit sans variante est donc invendable : la créer est
 * ce qui rend le produit achetable immédiatement après sa création.
 */
async function createDefaultVariant(
  supabase: SupabaseAdminClient,
  input: {
    productId: string;
    productSku: string;
    price: number;
    compareAtPrice: number | null;
    stockOnHand: number;
    lowStockThreshold: number;
    isActive: boolean;
  },
  actor: { id: string; role: UserRole }
): Promise<ActionResult<{ id: string; sku: string }>> {
  const sku = await deriveDefaultVariantSku(supabase, input.productSku);

  const { data, error } = await supabase
    .from("product_variants")
    .insert({
      product_id: input.productId,
      sku,
      // Pas d'attribut : ce n'est pas un choix du client (taille, couleur),
      // c'est la variante unique produite par la création du produit.
      attributes: {},
      price: input.price,
      compare_at_price: input.compareAtPrice,
      stock_on_hand: input.stockOnHand,
      stock_reserved: 0,
      low_stock_threshold: input.lowStockThreshold,
      is_active: input.isActive,
    })
    .select("id, sku")
    .single();

  if (error || !data) {
    console.warn("[admin/products] variante par défaut impossible :", error?.message);
    return failure("Le produit a été créé mais sa variante par défaut a échoué.");
  }

  await logAuditEntry(supabase, {
    actor_id: actor.id,
    actor_role: actor.role,
    action: AUDIT_ACTIONS.PRODUCT_CREATED,
    entity_type: "product_variant",
    entity_id: data.id,
    after: { productId: input.productId, sku: data.sku, stockOnHand: input.stockOnHand },
  });

  return success({ id: data.id, sku: data.sku });
}

// ============================================================
// Produits
// ============================================================

export async function createProductAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.PRODUCT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = productWriteSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  const input = parsed.data;
  const slug = input.slug === "" ? deriveSlug(input.name) : input.slug;

  if (await slugExists(supabase, slug)) {
    return failure(`Le slug « ${slug} » est déjà utilisé par un autre produit.`);
  }
  if (await skuExists(supabase, "products", input.sku)) {
    return failure(`Le SKU « ${input.sku} » est déjà utilisé.`);
  }

  // L'ancien prix doit être supérieur au prix, sinon la « promotion » est absurde.
  if (input.compareAtPrice !== null && input.compareAtPrice !== undefined) {
    if (input.compareAtPrice <= input.price) {
      return failure("L'ancien prix doit être supérieur au prix de vente.");
    }
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name,
      slug,
      sku: input.sku,
      category_id: input.categoryId,
      description: input.description,
      price: input.price,
      compare_at_price: input.compareAtPrice ?? null,
      is_active: input.isActive,
      is_featured: input.isFeatured,
      // Volontairement absent : la colonne est un agrégat dérivé des variantes
      // (migration 026). La variante ci-dessous la remplit via le trigger.
      low_stock_threshold: input.lowStockThreshold,
      weight_kg: input.weightKg ?? null,
      seo_title: input.seoTitle ?? null,
      seo_description: input.seoDescription ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[admin/products] création impossible :", error?.message);
    return failure("Le produit n'a pas pu être créé.");
  }

  // La variante porte le stock : sans elle le produit est invendable, car le
  // panier et la commande exigent une `variant_id`.
  const variant = await createDefaultVariant(
    supabase,
    {
      productId: data.id,
      productSku: input.sku,
      price: input.price,
      compareAtPrice: input.compareAtPrice ?? null,
      stockOnHand: input.stockOnHand,
      lowStockThreshold: input.lowStockThreshold,
      isActive: input.isActive,
    },
    auth.profile
  );

  if (!variant.success) return variant;

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_CREATED,
    entity_type: "product",
    entity_id: data.id,
    after: {
      name: input.name,
      price: input.price,
      sku: input.sku,
      stockOnHand: input.stockOnHand,
      defaultVariantSku: variant.sku,
    },
  });

  // Le stock initial est un mouvement d'inventaire à part entière : sans cette
  // trace, l'historique du stock commence sans origine et les écarts ne
  // peuvent plus être expliqués. Il porte désormais l'identifiant de la
  // variante, comme tous les autres mouvements.
  if (input.stockOnHand > 0) {
    await supabase.from("inventory_movements").insert({
      variant_id: variant.id,
      type: "IN",
      quantity: input.stockOnHand,
      reason: "Stock initial à la création du produit",
      reference_id: data.id,
      created_by: auth.profile.id,
    });
  }

  revalidatePath("/admin/products");
  return success({ id: data.id });
}

export async function updateProductAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.PRODUCT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = productPatchSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  const { id, ...input } = parsed.data;

  if (input.slug !== undefined && (await slugExists(supabase, input.slug, id))) {
    return failure(`Le slug « ${input.slug} » est déjà utilisé.`);
  }
  if (input.sku !== undefined && (await skuExists(supabase, "products", input.sku, id))) {
    return failure(`Le SKU « ${input.sku} » est déjà utilisé.`);
  }

  // Un prix « soldé » doit rester supérieur au prix de vente.
  if (input.compareAtPrice !== undefined && input.compareAtPrice !== null) {
    const currentOutcome = await safeQuery("adminProducts.current", (client) =>
      client.from("products").select("price").eq("id", id).limit(1)
    );
    const current = toSingle(currentOutcome);
    const price = input.price ?? Number(current?.price ?? 0);

    if (input.compareAtPrice <= price) {
      return failure("L'ancien prix doit être supérieur au prix de vente.");
    }
  }

  // `stockOnHand` n'est volontairement pas dans ce `mapping` : le stock
  // appartient aux variantes. Il est traité séparément, ci-dessous, pour ne
  // jamais écrire une valeur qui divergerait de la source de vérité.
  const patch: Record<string, unknown> = {};
  const mapping: Record<string, string> = {
    name: "name",
    slug: "slug",
    sku: "sku",
    categoryId: "category_id",
    description: "description",
    price: "price",
    compareAtPrice: "compare_at_price",
    isActive: "is_active",
    isFeatured: "is_featured",
    lowStockThreshold: "low_stock_threshold",
    weightKg: "weight_kg",
    seoTitle: "seo_title",
    seoDescription: "seo_description",
  };

  for (const [key, column] of Object.entries(mapping)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) patch[column] = value;
  }

  patch.updated_at = new Date().toISOString();

  // ------------------------------------------------------------------
  // Stock : routage vers la ou les variantes
  // ------------------------------------------------------------------
  // Le formulaire expose un champ unique. Il n'a de sens que pour un produit
  // à une seule variante : sinon une valeur globale écraserait des stocks
  // indépendants (taille 39 et taille 42 n'ont pas le même stock réel).
  if (input.stockOnHand !== undefined || input.lowStockThreshold !== undefined) {
    const stockOutcome = await safeQuery("adminProducts.variants", (client) =>
      client
        .from("product_variants")
        .select("id, sku, stock_on_hand, low_stock_threshold")
        .eq("product_id", id)
        .limit(50)
    );
    const variantRows = toList(stockOutcome) as Array<{
      id: string;
      sku: string;
      stock_on_hand: number;
      low_stock_threshold: number;
    }>;

    if (input.stockOnHand !== undefined && variantRows.length > 1) {
      // Le seuil, lui, reste au produit : c'est un libellé d'alerte, pas un
      // stock. Seul le stock physique est propre à chaque variante.
      return failure(
        "Ce produit possède plusieurs variantes : ajustez le stock de chacune depuis la fiche produit."
      );
    }

    if (variantRows.length === 0 && input.stockOnHand !== undefined) {
      // Produit sans variante (donnée antérieure à la migration 026) : la
      // variante par défaut est créée pour le rendre vendable.
      const currentOutcome = await safeQuery("adminProducts.forDefaultVariant", (client) =>
        client
          .from("products")
          .select("sku, price, compare_at_price, is_active")
          .eq("id", id)
          .limit(1)
      );
      const current = toSingle(currentOutcome);
      if (!current) return failure("Produit introuvable.");

      const created = await createDefaultVariant(
        supabase,
        {
          productId: id,
          productSku: String(current.sku),
          price: Number(current.price ?? input.price ?? 0),
          compareAtPrice: (current.compare_at_price as number | null) ?? null,
          stockOnHand: input.stockOnHand,
          lowStockThreshold: input.lowStockThreshold ?? 5,
          isActive: Boolean(current.is_active),
        },
        auth.profile
      );
      if (!created.success) return created;
    } else if (variantRows.length === 1) {
      const variantPatch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.stockOnHand !== undefined) variantPatch.stock_on_hand = input.stockOnHand;
      if (input.lowStockThreshold !== undefined) {
        variantPatch.low_stock_threshold = input.lowStockThreshold;
      }

      const variantError = await supabase
        .from("product_variants")
        .update(variantPatch)
        .eq("id", variantRows[0].id);
      if (variantError.error) {
        console.warn("[admin/products] stock de variante impossible :", variantError.error.message);
        return failure("Le stock n'a pas pu être enregistré.");
      }

      // Le même mouvement que `adjustStock` : la fiche produit et l'écran
      // d'inventaire écrivent sur la même source, donc l'historique doit
      // rester continu. Sans cette ligne, un stock saisi depuis la fiche
      // disparaît de `inventory_movements`.
      if (input.stockOnHand !== undefined) {
        const delta = input.stockOnHand - Number(variantRows[0].stock_on_hand);
        if (delta !== 0) {
          await supabase.from("inventory_movements").insert({
            variant_id: variantRows[0].id,
            type: delta >= 0 ? "IN" : "ADJUSTMENT",
            quantity: delta,
            reason: "Ajustement depuis la fiche produit",
            reference_id: id,
            created_by: auth.profile.id,
          });
        }
      }
    }
  }

  const beforeOutcome = await safeQuery("adminProducts.before", (client) =>
    client.from("products").select("name, price, sku, is_active").eq("id", id).limit(1)
  );
  const before = toSingle(beforeOutcome) as Record<string, unknown> | null;

  const { error } = await supabase.from("products").update(patch).eq("id", id);

  if (error) {
    console.warn("[admin/products] mise à jour impossible :", error.message);
    return failure("Le produit n'a pas pu être enregistré.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "product",
    entity_id: id,
    before,
    after: patch,
  });

  revalidatePath("/admin/products");
  revalidatePath("/admin/products/[id]", "page");
  return success({ id });
}

/** Archive un produit : il disparaît du catalogue sans être supprimé. */
export async function archiveProductAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.PRODUCT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = z.object({ id: z.string().uuid("Produit invalide") }).safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  const { error } = await supabase
    .from("products")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id);

  if (error) {
    console.warn("[admin/products] archivage impossible :", error.message);
    return failure("Le produit n'a pas pu être archivé.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "product",
    entity_id: parsed.data.id,
    after: { is_active: false },
  });

  revalidatePath("/admin/products");
  return success({ id: parsed.data.id });
}

/**
 * Suppression physique d'un produit, reserved aux produits qui n'ont jamais
 * été vendus.
 *
 * L'historique des commandes ne doit jamais disparaitre : `order_items` et
 * `cart_items` referencent les variantes sans `ON DELETE CASCADE`, et
 * `inventory_movements` documente chaque entree et sortie de stock. Un produit
 * qui a produit ne peut donc etre supprime, seulement archive. C'est
 * intentionnellement plus restrictif qu'une suppression « si vide » : une
 * fiche creee par erreur et jamais vendue, mais approvisionnee, contient deja
 * des mouvements qu'on ne peut pas jeter sans trace.
 */
export async function deleteProductAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.PRODUCT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = z.object({ id: z.string().uuid("Produit invalide") }).safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  const productId = parsed.data.id;

  const productOutcome = await safeQuery("deleteProduct.product", (client) =>
    client.from("products").select("id, name, sku").eq("id", productId).limit(1)
  );
  const product = toSingle(productOutcome) as { id?: string; name?: string; sku?: string } | null;
  if (!product) return failure("Produit introuvable.");

  const variantsOutcome = await safeQuery("deleteProduct.variants", (client) =>
    client.from("product_variants").select("id").eq("product_id", productId)
  );
  const variantIds = toList(variantsOutcome)
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");

  if (variantIds.length > 0) {
    const [ordersOutcome, cartOutcome, movementsOutcome] = await Promise.all([
      safeQuery("deleteProduct.orderItems", (client) =>
        client.from("order_items").select("id").in("variant_id", variantIds).limit(1)
      ),
      safeQuery("deleteProduct.cartItems", (client) =>
        client.from("cart_items").select("id").in("variant_id", variantIds).limit(1)
      ),
      safeQuery("deleteProduct.movements", (client) =>
        client.from("inventory_movements").select("id").in("variant_id", variantIds).limit(1)
      ),
    ]);

    if (toList(ordersOutcome).length > 0) {
      await logAuditEntry(supabase, {
        actor_id: auth.profile.id,
        actor_role: auth.profile.role,
        action: AUDIT_ACTIONS.DELETE_REFUSED,
        entity_type: "product",
        entity_id: productId,
        after: { reason: "order_history" },
      });
      return failure(
        "Suppression impossible : ce produit a été commandé, son historique fait partie des commandes. Archivez-le plutôt que de le supprimer."
      );
    }
    if (toList(movementsOutcome).length > 0) {
      await logAuditEntry(supabase, {
        actor_id: auth.profile.id,
        actor_role: auth.profile.role,
        action: AUDIT_ACTIONS.DELETE_REFUSED,
        entity_type: "product",
        entity_id: productId,
        after: { reason: "stock_movements" },
      });
      return failure(
        "Suppression impossible : ce produit possède un historique de mouvements de stock. Archivez-le plutôt que de le supprimer."
      );
    }
    if (toList(cartOutcome).length > 0) {
      await logAuditEntry(supabase, {
        actor_id: auth.profile.id,
        actor_role: auth.profile.role,
        action: AUDIT_ACTIONS.DELETE_REFUSED,
        entity_type: "product",
        entity_id: productId,
        after: { reason: "active_carts" },
      });
      return failure(
        "Suppression impossible : ce produit est encore dans le panier d'un client. Archivez-le plutôt que de le supprimer."
      );
    }
  }

  // Les visuels sont lus avant la suppression : les lignes `product_images`
  // partent en cascade, les fichiers du bucket, non.
  const imagesOutcome = await safeQuery("deleteProduct.images", (client) =>
    client.from("product_images").select("url").eq("product_id", productId)
  );
  const imageUrls = toList(imagesOutcome)
    .map((row) => row.url)
    .filter((url): url is string => typeof url === "string");

  const { error } = await supabase.from("products").delete().eq("id", productId);

  if (error) {
    console.warn("[admin/products] suppression impossible :", error.message);
    return failure("Le produit n'a pas pu être supprimé.");
  }

  // `product_variants` et `product_images` partent en cascade avec le produit.
  await removeProductImageFiles(imageUrls);

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "product",
    entity_id: productId,
    after: {
      deleted: true,
      name: product.name ?? null,
      sku: product.sku ?? null,
      removedImages: imageUrls.length,
    },
  });

  revalidatePath("/admin/products");
  return success({ id: productId });
}

/** Duplique un produit, avec un nouveau slug et un nouveau SKU. */
export async function duplicateProductAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.PRODUCT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = z.object({ id: z.string().uuid("Produit invalide") }).safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  const sourceOutcome = await safeQuery("adminProducts.duplicate", (client) =>
    client.from("products").select("*").eq("id", parsed.data.id).limit(1)
  );
  const source = toSingle(sourceOutcome) as Record<string, unknown> | null;

  if (!source) return failure("Produit introuvable.");

  const baseSlug = deriveSlug(`${String(source.name ?? "produit")}-copie`);
  let slug = baseSlug;
  for (let attempt = 2; attempt < 30 && (await slugExists(supabase, slug)); attempt += 1) {
    slug = `${baseSlug}-${attempt}`;
  }

  // Insertion par colonnes explicites : reprendre la ligne entière
  // (`...source`) recopierait `id`, `created_at` et l'agrégat de stock.
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: `${String(source.name ?? "Produit")} (copie)`,
      slug,
      sku: `${String(source.sku ?? "SKU")}-COPIE`,
      category_id: (source.category_id as string | null) ?? null,
      description: String(source.description ?? ""),
      price: Number(source.price ?? 0),
      compare_at_price: (source.compare_at_price as number | null) ?? null,
      low_stock_threshold: Number(source.low_stock_threshold ?? 5),
      is_active: false,
      is_featured: false,
      weight_kg: (source.weight_kg as number | null) ?? null,
      seo_title: (source.seo_title as string | null) ?? null,
      seo_description: (source.seo_description as string | null) ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[admin/products] duplication impossible :", error?.message);
    return failure("Le produit n'a pas pu être dupliqué.");
  }

  // Les variantes sont recopiées avec un stock nul : la copie est un produit
  // à préparer, pas une seconde quantité physique du stock existant.
  // Elles sont recopiées malgré tout — un produit sans variante est
  // invendable, et la copie doit pouvoir être mise en vente telle quelle.
  const sourceVariantsOutcome = await safeQuery("adminProducts.duplicateVariants", (client) =>
    client
      .from("product_variants")
      .select("sku, attributes, price, compare_at_price, low_stock_threshold, is_active")
      .eq("product_id", parsed.data.id)
      .limit(50)
  );
  const sourceVariants = toList(sourceVariantsOutcome) as Array<{
    sku: string;
    attributes: unknown;
    price: number;
    compare_at_price: number | null;
    low_stock_threshold: number;
    is_active: boolean;
  }>;

  let copiedVariants = 0;

  if (sourceVariants.length > 0) {
    const rows: Array<Record<string, unknown>> = [];

    for (const variant of sourceVariants) {
      const attributes =
        variant.attributes && typeof variant.attributes === "object"
          ? (variant.attributes as Record<string, string>)
          : {};

      rows.push({
        product_id: data.id,
        sku: await deriveDefaultVariantSku(supabase, String(variant.sku)),
        attributes,
        price: Number(variant.price ?? source.price ?? 0),
        compare_at_price: variant.compare_at_price ?? null,
        stock_on_hand: 0,
        stock_reserved: 0,
        low_stock_threshold: Number(variant.low_stock_threshold ?? source.low_stock_threshold ?? 5),
        is_active: variant.is_active,
      });
    }

    const insertedVariants = await supabase.from("product_variants").insert(rows);
    if (insertedVariants.error) {
      console.warn(
        "[admin/products] duplication des variantes impossible :",
        insertedVariants.error.message
      );
      return failure("Le produit a été dupliqué mais ses variantes n'ont pas pu l'être.");
    }
    copiedVariants = rows.length;
  } else {
    // Produit source sans variante : la copie reçoit sa variante par défaut,
    // à stock nul, pour être vendable dès qu'on l'approvisionne.
    const created = await createDefaultVariant(
      supabase,
      {
        productId: data.id,
        productSku: `${String(source.sku ?? "SKU")}-COPIE`,
        price: Number(source.price ?? 0),
        compareAtPrice: (source.compare_at_price as number | null) ?? null,
        stockOnHand: 0,
        lowStockThreshold: Number(source.low_stock_threshold ?? 5),
        isActive: false,
      },
      auth.profile
    );
    if (!created.success) return created;
    copiedVariants = 1;
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_CREATED,
    entity_type: "product",
    entity_id: data.id,
    after: { duplicatedFrom: parsed.data.id, copiedVariants, stockOnHand: 0 },
  });

  revalidatePath("/admin/products");
  return success({ id: data.id });
}

// ============================================================
// Variantes
// ============================================================

/**
 * Unicité fonctionnelle d'une combinaison d'attributs.
 * Deux variantes « M / Noir » sur le même produit interdiraient de savoir
 * laquelle est réellement en stock.
 */
async function attributesAlreadyExist(
  supabase: SupabaseAdminClient,
  productId: string,
  attributes: Record<string, string>,
  excludeId?: string
): Promise<boolean> {
  const outcome = await safeQuery("variants.sameAttributes", (client) => {
    let builder = client
      .from("product_variants")
      .select("id")
      .eq("product_id", productId)
      .limit(200);

    // La variante en cours d'édition ne peut pas être en conflit avec
    // elle-même : sans cette exclusion, réenregistrer ses attributs inchangés
    // était refusé comme « doublon ».
    if (excludeId) builder = builder.neq("id", excludeId);

    return builder;
  });

  const existing = toList(outcome) as Array<{ id: string; attributes?: unknown }>;
  const signature = JSON.stringify(normaliseAttributes(attributes));

  return existing.some(
    (row) => JSON.stringify(normaliseAttributes((row.attributes ?? {}) as Record<string, string>)) === signature
  );
}

/** Normalise les attributs pour une comparaison stable (ordre et casse). */
function normaliseAttributes(attributes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([, value]) => String(value ?? "").trim() !== "")
      .map(([key, value]) => [key.trim().toLowerCase(), String(value).trim().toLowerCase()])
      .sort(([a], [b]) => a.localeCompare(b))
  );
}

export async function createVariantAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.VARIANT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = variantWriteSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  const input = parsed.data;

  if (await skuExists(supabase, "product_variants", input.sku)) {
    return failure(`Le SKU « ${input.sku} » est déjà utilisé par une autre variante.`);
  }

  if (await attributesAlreadyExist(supabase, input.productId, input.attributes)) {
    return failure("Une variante possède déjà cette combinaison d'attributs.");
  }

  const { data, error } = await supabase
    .from("product_variants")
    .insert({
      product_id: input.productId,
      sku: input.sku,
      attributes: input.attributes,
      price: input.price,
      compare_at_price: input.compareAtPrice ?? null,
      stock_on_hand: input.stockOnHand,
      stock_reserved: 0,
      low_stock_threshold: input.lowStockThreshold,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[admin/variants] création impossible :", error?.message);
    return failure("La variante n'a pas pu être créée.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "product_variant",
    entity_id: data.id,
    after: { productId: input.productId, sku: input.sku, price: input.price },
  });

  revalidatePath("/admin/products/[id]", "page");
  return success({ id: data.id });
}

export async function updateVariantAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.VARIANT_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = variantPatchSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  const { id, ...input } = parsed.data;

  if (input.sku !== undefined && (await skuExists(supabase, "product_variants", input.sku, id))) {
    return failure(`Le SKU « ${input.sku} » est déjà utilisé.`);
  }

  if (input.attributes !== undefined) {
    const currentOutcome = await safeQuery("variants.current", (client) =>
      client.from("product_variants").select("product_id").eq("id", id).limit(1)
    );
    const current = toSingle(currentOutcome);
    const productId = String(current?.product_id ?? "");

    if (productId && (await attributesAlreadyExist(supabase, productId, input.attributes, id))) {
      return failure("Une autre variante possède déjà cette combinaison d'attributs.");
    }
  }

  const patch: Record<string, unknown> = {};
  const mapping: Record<string, string> = {
    sku: "sku",
    attributes: "attributes",
    price: "price",
    compareAtPrice: "compare_at_price",
    lowStockThreshold: "low_stock_threshold",
  };

  for (const [key, column] of Object.entries(mapping)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) patch[column] = value;
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from("product_variants").update(patch).eq("id", id);

  if (error) {
    console.warn("[admin/variants] mise à jour impossible :", error.message);
    return failure("La variante n'a pas pu être enregistrée.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "product_variant",
    entity_id: id,
    after: patch,
  });

  revalidatePath("/admin/products/[id]", "page");
  return success({ id });
}

// ============================================================
// Catégories
// ============================================================

export async function createCategoryAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.CATEGORY_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = categoryWriteSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  const input = parsed.data;

  const existingOutcome = await safeQuery("categories.duplicateSlug", (client) =>
    client.from("categories").select("id").eq("slug", input.slug).limit(1)
  );
  if (toSingle(existingOutcome)) {
    return failure(`Le slug « ${input.slug} » est déjà utilisé.`);
  }

  if (input.parentId) {
    const parentOutcome = await safeQuery("categories.parentExists", (client) =>
      client.from("categories").select("id").eq("id", input.parentId).limit(1)
    );
    if (!toSingle(parentOutcome)) {
      return failure("La catégorie parente n'existe pas.");
    }
  }

  const { data, error } = await supabase
    .from("categories")
    .insert({
      name: input.name,
      slug: input.slug,
      parent_id: input.parentId ?? null,
      description: input.description ?? null,
      image_url: input.imageUrl ?? null,
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[admin/categories] création impossible :", error?.message);
    return failure("La catégorie n'a pas pu être créée.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "category",
    entity_id: data.id,
    after: { name: input.name, slug: input.slug },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  return success({ id: data.id });
}

export async function updateCategoryAction(payload: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.CATEGORY_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = categoryPatchSchema.safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  const { id, ...input } = parsed.data;

  if (input.slug !== undefined) {
    const existingOutcome = await safeQuery("categories.duplicateSlugPatch", (client) =>
      client.from("categories").select("id").eq("slug", input.slug).neq("id", id).limit(1)
    );
    if (toSingle(existingOutcome)) {
      return failure(`Le slug « ${input.slug} » est déjà utilisé.`);
    }
  }

  // Une catégorie ne peut pas être son propre parent, ni avoir un descendant.
  if (input.parentId !== undefined && input.parentId !== null) {
    if (await wouldCreateLoop(supabase, id, input.parentId)) {
      return failure(
        "Cette catégorie ne peut pas être placée sous elle-même ou l'un de ses descendants."
      );
    }
  }

  const patch: Record<string, unknown> = {};
  const mapping: Record<string, string> = {
    name: "name",
    slug: "slug",
    parentId: "parent_id",
    description: "description",
    imageUrl: "image_url",
    sortOrder: "sort_order",
    isActive: "is_active",
  };

  for (const [key, column] of Object.entries(mapping)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) patch[column] = value;
  }

  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from("categories").update(patch).eq("id", id);

  if (error) {
    console.warn("[admin/categories] mise à jour impossible :", error.message);
    return failure("La catégorie n'a pas pu être enregistrée.");
  }

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "category",
    entity_id: id,
    after: patch,
  });

  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  return success({ id });
}

export async function deleteCategoryAction(
  payload: unknown
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission(PERMISSIONS.CATEGORY_WRITE);
  if (!auth.authenticated) return failure(auth.reason);

  const parsed = z.object({ id: z.string().uuid("Catégorie invalide") }).safeParse(payload);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le catalogue est momentanément indisponible.");

  // Supprimer une catégorie contenant des produits laisserait des produits
  // sans catégorie : on refuse, et on propose la désactivation.
  const productsOutcome = await safeQuery("categories.hasProducts", (client) =>
    client.from("products").select("id").eq("category_id", parsed.data.id).limit(1)
  );

  if (toSingle(productsOutcome)) {
    await logAuditEntry(supabase, {
      actor_id: auth.profile.id,
      actor_role: auth.profile.role,
      action: AUDIT_ACTIONS.DELETE_REFUSED,
      entity_type: "category",
      entity_id: parsed.data.id,
      after: { reason: "products_present" },
    });
    return failure(
      "Suppression impossible : cette catégorie contient encore des produits. Désactivez-la plutôt que de la supprimer."
    );
  }

  const childrenOutcome = await safeQuery("categories.hasChildren", (client) =>
    client.from("categories").select("id").eq("parent_id", parsed.data.id).limit(1)
  );

  if (toSingle(childrenOutcome)) {
    await logAuditEntry(supabase, {
      actor_id: auth.profile.id,
      actor_role: auth.profile.role,
      action: AUDIT_ACTIONS.DELETE_REFUSED,
      entity_type: "category",
      entity_id: parsed.data.id,
      after: { reason: "child_categories" },
    });
    return failure("Suppression impossible : cette catégorie possède des sous-catégories. Supprimez-les d'abord.");
  }

  // Le visuel est lu avant la suppression : la ligne disparaît, pas le fichier.
  const detailOutcome = await safeQuery("categories.detail", (client) =>
    client.from("categories").select("name, image_url").eq("id", parsed.data.id).limit(1)
  );
  const detail = toSingle(detailOutcome) as
    | { name?: string; image_url?: string | null }
    | null;
  const imageUrl = typeof detail?.image_url === "string" ? detail.image_url : null;

  const { error } = await supabase.from("categories").delete().eq("id", parsed.data.id);

  if (error) {
    console.warn("[admin/categories] suppression impossible :", error.message);
    return failure("La catégorie n'a pas pu être supprimée.");
  }

  if (imageUrl) await removeCategoryImageFile(imageUrl);

  await logAuditEntry(supabase, {
    actor_id: auth.profile.id,
    actor_role: auth.profile.role,
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    entity_type: "category",
    entity_id: parsed.data.id,
    after: { deleted: true, name: detail?.name ?? null },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/categories");
  return success({ id: parsed.data.id });
}