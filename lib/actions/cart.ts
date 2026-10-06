"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { cartItemSchema } from "@/lib/validations/schemas";
import { getAvailableStock } from "@/lib/services/inventory";
import { createAdminClient, type SupabaseAdminClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/supabase/session";
import { getCustomerByProfileId } from "@/lib/data/account";
import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import { ActionResult, failure, firstZodMessage, success } from "@/lib/actions/types";

const CART_COOKIE = "boutique_cart_session";
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const MAX_QUANTITY = 99;

interface VariantStockRow {
  id: string;
  stock_on_hand: number;
  stock_reserved: number;
  is_active: boolean;
  products: { id: string; name: string; is_active: boolean } | { id: string; name: string; is_active: boolean }[] | null;
}

const VARIANT_STOCK_SELECT = `
  id,
  stock_on_hand,
  stock_reserved,
  is_active,
  products:products(id, name, is_active)
`;

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
  return value ?? null;
}

/**
 * Identifiant de session panier, stocké dans un cookie.
 * Le cookie est (re)créé ici : il n'est accessible que depuis une server action,
 * ce qui garantit qu'un visiteur non connecté dispose d'un panier stable.
 */
async function getCartSessionId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const existing = cookieStore.get(CART_COOKIE)?.value;
    if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return existing;

    const created = crypto.randomUUID();
    cookieStore.set(CART_COOKIE, created, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CART_COOKIE_MAX_AGE,
    });
    return created;
  } catch {
    return null;
  }
}

async function getAdminClient(): Promise<SupabaseAdminClient | null> {
  try {
    return await createAdminClient();
  } catch {
    return null;
  }
}

async function findOrCreateCart(
  supabase: SupabaseAdminClient,
  sessionId: string,
  customerId: string | null
): Promise<string | null> {
  const existing = await supabase
    .from("carts")
    .select("id")
    .eq("session_id", sessionId)
    .limit(1);

  if (existing.error) {
    console.warn("[cart] lecture du panier impossible :", existing.error.message);
    return null;
  }

  if (existing.data && existing.data.length > 0) return existing.data[0].id;

  const created = await supabase
    .from("carts")
    .insert({ session_id: sessionId, customer_id: customerId })
    .select("id")
    .single();

  if (created.error) {
    console.warn("[cart] création du panier impossible :", created.error.message);
    return null;
  }

  return created.data.id;
}

async function findVariant(
  supabase: SupabaseAdminClient,
  variantId: string
): Promise<VariantStockRow | null> {
  const outcome = await safeQuery("cart.variant", (client) =>
    client
      .from("product_variants")
      .select(VARIANT_STOCK_SELECT)
      .eq("id", variantId)
      .limit(1)
  );

  const row = toSingle(outcome);
  if (!row) return null;
  return { ...row, products: row.products ?? null } as VariantStockRow;
}

/** Quantité déjà présente dans le panier pour cette variante. */
async function findCurrentQuantity(
  supabase: SupabaseAdminClient,
  cartId: string,
  variantId: string
): Promise<number> {
  const outcome = await safeQuery("cart.item", (client) =>
    client
      .from("cart_items")
      .select("quantity")
      .eq("cart_id", cartId)
      .eq("variant_id", variantId)
      .limit(1)
  );

  const row = toSingle(outcome);
  return row && typeof row.quantity === "number" ? row.quantity : 0;
}

/** Ajoute une ligne au panier du visiteur (quantités cumulées côté serveur). */
export async function addToCartAction(input: {
  variant_id: string;
  quantity?: number;
}): Promise<ActionResult<{ quantity: number }>> {
  const parsed = cartItemSchema.safeParse({
    variant_id: input?.variant_id,
    quantity: input?.quantity ?? 1,
  });

  if (!parsed.success) {
    return failure(firstZodMessage(parsed.error.issues));
  }

  const sessionId = await getCartSessionId();
  if (!sessionId) {
    return failure("Votre session a expiré. Rechargez la page puis réessayez.");
  }

  const supabase = await getAdminClient();
  if (!supabase) {
    return failure("Le panier est momentanément indisponible. Merci de réessayer dans un instant.");
  }

  const variant = await findVariant(supabase, parsed.data.variant_id);
  const product = firstRelation(variant?.products ?? null);

  if (!variant || !product || !variant.is_active || !product.is_active) {
    return failure("Ce produit n'est plus disponible.");
  }

  const cartId = await findOrCreateCart(supabase, sessionId, null);
  if (!cartId) return failure("Impossible d'accéder à votre panier. Merci de réessayer.");

  const available = getAvailableStock({
    stock_on_hand: variant.stock_on_hand,
    stock_reserved: variant.stock_reserved,
  });
  const alreadyInCart = await findCurrentQuantity(supabase, cartId, variant.id);
  const wanted = alreadyInCart + parsed.data.quantity;

  if (wanted > available) {
    return failure(
      alreadyInCart > 0
        ? `« ${product.name} » : il ne reste que ${available} unité(s) en stock.`
        : `« ${product.name} » : stock insuffisant, ${available} unité(s) disponible(s).`
    );
  }

  const upserted = await supabase
    .from("cart_items")
    .upsert(
      { cart_id: cartId, variant_id: variant.id, quantity: Math.min(wanted, MAX_QUANTITY) },
      { onConflict: "cart_id,variant_id" }
    );

  if (upserted.error) {
    console.warn("[cart] ajout impossible :", upserted.error.message);
    return failure("Le produit n'a pas pu être ajouté à votre panier.");
  }

  await supabase.from("carts").update({ updated_at: new Date().toISOString() }).eq("id", cartId);

  return success({ quantity: Math.min(wanted, MAX_QUANTITY) });
}

/** Fixe la quantité d'une ligne de panier (0 retire la ligne). */
export async function updateCartItemAction(input: {
  variant_id: string;
  quantity: number;
}): Promise<ActionResult<{ quantity: number }>> {
  const schema = cartItemSchema.extend({
    quantity: z.number().int().min(1).max(MAX_QUANTITY),
  });

  const parsed = schema.safeParse({ variant_id: input?.variant_id, quantity: input?.quantity });
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const sessionId = await getCartSessionId();
  if (!sessionId) return failure("Votre session a expiré. Rechargez la page puis réessayez.");

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le panier est momentanément indisponible.");

  const cart = await safeQuery("cart.bySession", (client) =>
    client.from("carts").select("id").eq("session_id", sessionId).limit(1)
  );
  const cartRow = toSingle(cart);
  if (!cartRow) return failure("Cette ligne n'existe plus dans votre panier.");

  const variant = await findVariant(supabase, parsed.data.variant_id);
  if (!variant) return failure("Ce produit n'est plus disponible.");

  const available = getAvailableStock({
    stock_on_hand: variant.stock_on_hand,
    stock_reserved: variant.stock_reserved,
  });

  if (parsed.data.quantity > available) {
    return failure(
      `Stock insuffisant : il ne reste que ${available} unité(s) de ce produit.`
    );
  }

  const updated = await supabase
    .from("cart_items")
    .update({ quantity: parsed.data.quantity })
    .eq("cart_id", cartRow.id)
    .eq("variant_id", parsed.data.variant_id);

  if (updated.error) {
    console.warn("[cart] mise à jour impossible :", updated.error.message);
    return failure("La quantité n'a pas pu être mise à jour.");
  }

  await supabase.from("carts").update({ updated_at: new Date().toISOString() }).eq("id", cartRow.id);

  return success({ quantity: parsed.data.quantity });
}

/** Retire une ligne du panier du visiteur. */
export async function removeCartItemAction(input: {
  variant_id: string;
}): Promise<ActionResult<Record<never, never>>> {
  const parsed = z.string().uuid("Référence produit invalide").safeParse(input?.variant_id);
  if (!parsed.success) return failure(firstZodMessage(parsed.error.issues));

  const sessionId = await getCartSessionId();
  if (!sessionId) return failure("Votre session a expiré. Rechargez la page puis réessayez.");

  const supabase = await getAdminClient();
  if (!supabase) return failure("Le panier est momentanément indisponible.");

  const cart = await safeQuery("cart.bySession", (client) =>
    client.from("carts").select("id").eq("session_id", sessionId).limit(1)
  );
  const cartRow = toSingle(cart);
  if (!cartRow) return failure("Cette ligne n'existe plus dans votre panier.");

  const removed = await supabase
    .from("cart_items")
    .delete()
    .eq("cart_id", cartRow.id)
    .eq("variant_id", parsed.data);

  if (removed.error) {
    console.warn("[cart] suppression impossible :", removed.error.message);
    return failure("Le produit n'a pas pu être retiré du panier.");
  }

  await supabase.from("carts").update({ updated_at: new Date().toISOString() }).eq("id", cartRow.id);

  return success({});
}

/**
 * Fusionne le panier invité dans le panier du client après connexion.
 *
 * Le `customer_id` transmis par le client n'est jamais utilisé tel quel : il est
 * recalculé à partir de la session, et toute incohérence est rejetée.
 */
export async function mergeGuestCartAction(input?: {
  customer_id?: string | null;
}): Promise<ActionResult<{ mergedItems: number }>> {
  try {
    const profile = await getSessionProfile();
    if (!profile) {
      return failure("Vous devez être connecté pour associer votre panier à votre compte.");
    }

    const supabase = await getAdminClient();
    if (!supabase) return failure("Le panier est momentanément indisponible.");

    const customer = await getCustomerByProfileId(profile.id);
    if (!customer) {
      return failure("Aucune fiche client n'est associée à votre compte.");
    }

    if (input?.customer_id && input.customer_id !== customer.id) {
      return failure("Vous n'êtes pas autorisé à modifier le panier d'un autre client.");
    }

    const sessionId = await getCartSessionId();
    if (!sessionId) return success({ mergedItems: 0 });

    const guestCart = await safeQuery("cart.guest", (client) =>
      client.from("carts").select("id").eq("session_id", sessionId).limit(1)
    );
    const guestRow = toSingle(guestCart);
    if (!guestRow) return success({ mergedItems: 0 });

    const guestItems = await safeQuery("cart.guestItems", (client) =>
      client.from("cart_items").select("variant_id, quantity").eq("cart_id", guestRow.id)
    );
    const items = toList(guestItems);

    if (items.length === 0) {
      await supabase.from("carts").delete().eq("id", guestRow.id);
      return success({ mergedItems: 0 });
    }

    const customerCart = await safeQuery("cart.customer", (client) =>
      client.from("carts").select("id").eq("customer_id", customer.id).limit(1)
    );
    const customerRow = toSingle(customerCart);

    let targetCartId = customerRow?.id ?? null;

    if (!targetCartId) {
      const created = await supabase
        .from("carts")
        .insert({ session_id: sessionId, customer_id: customer.id })
        .select("id")
        .single();

      if (created.error) {
        console.warn("[cart] création du panier client impossible :", created.error.message);
        return failure("Votre panier n'a pas pu être associé à votre compte.");
      }
      targetCartId = created.data.id;
    }

    const existingItems = await safeQuery("cart.customerItems", (client) =>
      client.from("cart_items").select("variant_id, quantity").eq("cart_id", targetCartId)
    );

    const existingQuantities = new Map<string, number>();
    for (const row of toList(existingItems)) {
      if (typeof row.variant_id === "string") {
        existingQuantities.set(row.variant_id, row.quantity);
      }
    }

    for (const item of items) {
      if (typeof item.variant_id !== "string") continue;

      const quantity = Math.min(
        (existingQuantities.get(item.variant_id) ?? 0) + item.quantity,
        MAX_QUANTITY
      );

      await supabase.from("cart_items").upsert(
        { cart_id: targetCartId, variant_id: item.variant_id, quantity },
        { onConflict: "cart_id,variant_id" }
      );
    }

    await supabase.from("carts").delete().eq("id", guestRow.id);
    await supabase
      .from("carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", targetCartId);

    return success({ mergedItems: items.length });
  } catch (error) {
    console.warn("[cart] fusion du panier impossible :", error);
    return failure("Votre panier n'a pas pu être associé à votre compte.");
  }
}

/** Vide le panier du visiteur. */
export async function clearCartAction(): Promise<ActionResult<Record<never, never>>> {
  try {
    const sessionId = await getCartSessionId();
    if (!sessionId) return failure("Votre session a expiré.");

    const supabase = await getAdminClient();
    if (!supabase) return failure("Le panier est momentanément indisponible.");

    const cart = await safeQuery("cart.bySession.clear", (client) =>
      client.from("carts").select("id").eq("session_id", sessionId).limit(1)
    );
    const cartRow = toSingle(cart);
    if (!cartRow) return success({});

    const deleted = await supabase.from("cart_items").delete().eq("cart_id", cartRow.id);
    if (deleted.error) {
      console.warn("[cart] vidage impossible :", deleted.error.message);
      return failure("Votre panier n'a pas pu être vidé.");
    }

    return success({});
  } catch (error) {
    console.warn("[cart] vidage impossible :", error);
    return failure("Votre panier n'a pas pu être vidé.");
  }
}