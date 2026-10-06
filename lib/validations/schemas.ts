import { z } from "zod";
import { normalizeCouponCode } from "@/lib/domain/coupons";

export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(?:(?:\+?227|00227)?\s?\d{8})$/,
    "Numéro de téléphone invalide (format attendu : 90123456 ou +22790123456)"
  )
  .transform((value) => value.replace(/[\s+]/g, "").replace(/^00227/, "+227"));

export const addressSchema = z.object({
  city: z.string().trim().min(1, "La ville est requise"),
  quarter: z.string().trim().min(1, "Le quartier est requis"),
  landmark: z.string().trim().min(1, "Le repère est requis"),
  sector: z.string().trim().optional().nullable(),
  instructions: z.string().trim().optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

export const orderItemInputSchema = z.object({
  variant_id: z.string().uuid("ID variante invalide"),
  quantity: z.number().int().min(1, "La quantité doit être d'au moins 1").max(99),
});

export const orderCreateSchema = z.object({
  customer_id: z.string().uuid("ID client invalide").optional().nullable(),
  full_name: z.string().trim().min(2, "Le nom complet est requis").max(120),
  phone: phoneSchema,
  items: z
    .array(orderItemInputSchema)
    .min(1, "La commande doit contenir au moins un article"),
  address: addressSchema,
  payment_method: z.literal("COD", {
    error: "Le paiement à la livraison est le seul mode accepté",
  }),
  notes: z.string().trim().max(500).optional().nullable(),
  /**
   * Code promo saisi par le client.
   * Seul le code transite : la remise est calculée par `coupon_is_valid`, en
   * base. Un montant de remise envoyé ici serait ignoré.
   */
  coupon_code: z.string().trim().max(24).optional().nullable(),
  idempotency_key: z.string().uuid("Clé d'idempotence invalide").optional(),
});

export const productSchema = z.object({
  name: z.string().trim().min(3, "Le nom doit contenir au moins 3 caractères").max(200),
  description: z.string().trim().min(10, "La description doit contenir au moins 10 caractères"),
  price: z.number().int().positive("Le prix doit être positif"),
  compare_at_price: z.number().int().positive().optional().nullable(),
  category_id: z.string().uuid("Catégorie invalide"),
  sku: z.string().trim().min(3, "Le SKU doit contenir au moins 3 caractères").max(64),
});

export const productVariantSchema = z.object({
  product_id: z.string().uuid("Produit invalide"),
  sku: z.string().trim().min(3).max(64),
  attributes: z.record(z.string(), z.string()).default({}),
  price: z.number().int().positive("Le prix doit être positif"),
  stock_on_hand: z.number().int().min(0, "Le stock ne peut pas être négatif"),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Le slug ne peut contenir que des minuscules, chiffres et tirets"),
  parent_id: z.string().uuid().optional().nullable(),
  description: z.string().trim().optional().nullable(),
});

export const cartItemSchema = orderItemInputSchema;

export const deliveryZoneSchema = z.object({
  name: z.string().trim().min(2, "Le nom de la zone est requis"),
  city: z.string().trim().min(1).default("Niamey"),
  quarters: z.array(z.string().trim().min(1)).default([]),
  fee: z.number().int().min(0, "Les frais ne peuvent pas être négatifs"),
  is_active: z.boolean().default(true),
});

export const promotionSchema = z
  .object({
    name: z.string().trim().min(2, "Le nom de la promotion est requis"),
    type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
    value: z.number().int().positive("La valeur doit être positive"),
    min_order_amount: z.number().int().min(0).optional().nullable(),
    starts_at: z.coerce.date(),
    ends_at: z.coerce.date(),
    is_active: z.boolean().default(true),
  })
  .refine((data) => data.ends_at > data.starts_at, {
    message: "La date de fin doit être postérieure à la date de début",
    path: ["ends_at"],
  });

// ============================================================
// Coupons (codes promo)
// ============================================================

/** Portée d'un code : toute la boutique, une catégorie ou un produit. */
export const couponScopeTypeSchema = z.enum(["all", "category", "product"]);

/**
 * Écriture d'un coupon, pour le formulaire d'administration.
 *
 * `code` est validé **avant** normalisation puis normalisé (majuscules, sans
 * espaces) : deux saisies « bienvenue 10 » et `BIENVENUE10` désignent le même
 * code, et l'unicité est vérifiée en base sur `lower(code)`. Tronquer un code
 * de 25 caractères en ferait silencieusement un autre : le refus est préférable.
 *
 * Les champs facultatifs sont ramenés à `null` : l'insertion ne doit jamais
 * recevoir `undefined`.
 */
export const couponWriteSchema = z
  .object({
    code: z
      .string()
      .trim()
      .refine(
        (value) => {
          const compact = value.toUpperCase().replace(/\s+/g, "");
          return (
            compact.length >= 3 &&
            compact.length <= 24 &&
            /^[A-Z0-9._-]+$/.test(compact)
          );
        },
        {
          message:
            "Le code doit contenir entre 3 et 24 caractères (lettres, chiffres, tirets).",
        }
      )
      .transform((value) => normalizeCouponCode(value)),
    description: z.string().trim().max(300).nullable().optional().transform((value) => value ?? null),
    discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
    discountValue: z
      .number()
      .int("La valeur doit être un nombre entier")
      .min(1, "La valeur doit être au moins 1"),
    minOrderAmount: z
      .number()
      .int()
      .min(0, "Le montant minimum ne peut pas être négatif")
      .default(0),
    maxDiscountAmount: z
      .number()
      .int()
      .min(1, "Le plafond de remise doit être au moins 1")
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    startsAt: z.coerce.date({ error: "La date de début est invalide" }),
    expiresAt: z
      .coerce.date({ error: "La date de fin est invalide" })
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    maxUses: z
      .number()
      .int()
      .min(1, "Le nombre maximal d'utilisations doit être au moins 1")
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    maxUsesPerUser: z
      .number()
      .int()
      .min(1, "Le quota par client doit être au moins 1")
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    isActive: z.boolean().default(true),
    scopeType: couponScopeTypeSchema.default("all"),
    appliesToCategoryId: z
      .string()
      .uuid("Catégorie invalide")
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    appliesToProductId: z
      .string()
      .uuid("Produit invalide")
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  })
  .refine((data) => data.discountType !== "PERCENTAGE" || data.discountValue <= 100, {
    message: "Un pourcentage ne peut pas dépasser 100.",
    path: ["discountValue"],
  })
  .refine(
    (data) => data.expiresAt == null || data.expiresAt > data.startsAt,
    {
      message: "La date de fin doit être postérieure à la date de début",
      path: ["expiresAt"],
    }
  )
  .refine(
    (data) =>
      data.scopeType !== "category" || Boolean(data.appliesToCategoryId),
    {
      message: "Choisissez la catégorie visée par ce code.",
      path: ["appliesToCategoryId"],
    }
  )
  .refine(
    (data) => data.scopeType !== "product" || Boolean(data.appliesToProductId),
    {
      message: "Choisissez le produit visé par ce code.",
      path: ["appliesToProductId"],
    }
  )
  .refine(
    (data) =>
      data.scopeType !== "all" ||
      (!data.appliesToCategoryId && !data.appliesToProductId),
    {
      message:
        "Un code valable partout ne peut pas cibler une catégorie ou un produit.",
      path: ["scopeType"],
    }
  );

export const couponPatchSchema = z
  .object({
    id: z.string().uuid("Coupon invalide"),
    code: z
      .string()
      .trim()
      .refine(
        (value) => {
          const compact = value.toUpperCase().replace(/\s+/g, "");
          return (
            compact.length >= 3 &&
            compact.length <= 24 &&
            /^[A-Z0-9._-]+$/.test(compact)
          );
        },
        {
          message:
            "Le code doit contenir entre 3 et 24 caractères (lettres, chiffres, tirets).",
        }
      )
      .transform((value) => normalizeCouponCode(value))
      .optional(),
    description: z.string().trim().max(300).optional().nullable(),
    discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).optional(),
    discountValue: z.number().int().min(1).optional(),
    minOrderAmount: z.number().int().min(0).optional(),
    maxDiscountAmount: z
      .number()
      .int()
      .min(1, "Le plafond de remise doit être au moins 1")
      .optional()
      .nullable(),
    startsAt: z.coerce.date({ error: "La date de début est invalide" }).optional(),
    expiresAt: z.coerce.date({ error: "La date de fin est invalide" }).nullable().optional(),
    maxUses: z.number().int().min(1).optional().nullable(),
    maxUsesPerUser: z.number().int().min(1).optional().nullable(),
    isActive: z.boolean().optional(),
    scopeType: couponScopeTypeSchema.optional(),
    appliesToCategoryId: z.string().uuid("Catégorie invalide").optional().nullable(),
    appliesToProductId: z.string().uuid("Produit invalide").optional().nullable(),
  })
  .refine((data) => data.discountValue === undefined || data.discountValue <= 100, {
    message: "Un pourcentage ne peut pas dépasser 100.",
    path: ["discountValue"],
  })
  .refine(
    (data) =>
      data.expiresAt == null ||
      data.startsAt == null ||
      data.expiresAt > data.startsAt,
    {
      message: "La date de fin doit être postérieure à la date de début",
      path: ["expiresAt"],
    }
  )
  .refine(
    (data) =>
      data.scopeType !== "category" || Boolean(data.appliesToCategoryId),
    {
      message: "Choisissez la catégorie visée par ce code.",
      path: ["appliesToCategoryId"],
    }
  )
  .refine(
    (data) => data.scopeType !== "product" || Boolean(data.appliesToProductId),
    {
      message: "Choisissez le produit visé par ce code.",
      path: ["appliesToProductId"],
    }
  );

/** Identifiant d'un coupon, pour les actions de consultation et de suppression. */
export const couponIdSchema = z.object({
  id: z.string().uuid("Coupon invalide"),
});

export const cashCollectionSchema = z.object({
  delivery_id: z.string().uuid("Livraison invalide"),
  expected_amount: z.number().int().min(0),
  collected_amount: z.number().int().min(0, "Le montant encaissé ne peut pas être négatif"),
  method: z.enum(["COD", "MOBILE_MONEY", "CARD", "OTHER"]).default("COD"),
  discrepancy_reason: z.string().trim().max(300).optional().nullable(),
});

export const FAILURE_REASONS = [
  "CUSTOMER_ABSENT",
  "PHONE_UNREACHABLE",
  "ADDRESS_INACCURATE",
  "CUSTOMER_REFUSED",
  "PRODUCT_UNAVAILABLE",
  "OTHER",
] as const;

export const driverStatusUpdateSchema = z.object({
  status: z.enum([
    "ACCEPTED",
    "IN_PREPARATION",
    "OUT_FOR_DELIVERY",
    "ARRIVED",
    "DELIVERED",
    "FAILED",
  ]),
  notes: z.string().trim().max(500).optional().nullable(),
  failure_reason: z.enum(FAILURE_REASONS).optional().nullable(),
  failure_notes: z.string().trim().max(500).optional().nullable(),
}).refine(
    (data) => data.status !== "FAILED" || Boolean(data.failure_reason),
    {
      message: "Un motif est obligatoire pour signaler un échec de livraison",
      path: ["failure_reason"],
    }
  )
  .refine(
    // Motif « autre » sans explication, l'historique de la livraison ne
    // raconte rien d'exploitable : le motif existe justement pour être
    //qualifié.
    (data) =>
      data.status !== "FAILED" ||
      data.failure_reason !== "OTHER" ||
      Boolean(data.failure_notes && data.failure_notes.trim().length > 0),
    {
      message:
        "Un commentaire est obligatoire quand le motif est « autre »",
      path: ["failure_notes"],
    }
  );

export type PhoneInput = z.input<typeof phoneSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type OrderCreateInput = z.input<typeof orderCreateSchema>;
export type OrderCreateData = z.output<typeof orderCreateSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type ProductVariantInput = z.infer<typeof productVariantSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type DeliveryZoneInput = z.infer<typeof deliveryZoneSchema>;
export type PromotionInput = z.infer<typeof promotionSchema>;
export type CashCollectionInput = z.infer<typeof cashCollectionSchema>;
export type DriverStatusUpdateInput = z.infer<typeof driverStatusUpdateSchema>;
