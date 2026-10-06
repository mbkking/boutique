import "server-only";

import { safeQuery, toList, toSingle } from "@/lib/data/safe";
import { getAvailableStock, getProductStock } from "@/lib/services/inventory";
import { normalizeCategoryQuery } from "@/lib/data/categories";
import type {
  AuditLog,
  Category,
  Customer,
  DeliveryStatus,
  Profile,
  UserRole,
} from "@/types";

/**
 * Lectures d'administration.
 *
 * Toutes les listes sont paginées et filtrées côté serveur : charger un
 * catalogue entier pour le réduire en mémoire est à la fois lent et contraire
 * au principe de faible consommation de données.
 */

// ============================================================
// Produits
// ============================================================

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  stockOnHand: number;
  stockReserved: number;
  /** Stock réellement vendable, après réservations. */
  available: number;
  /** En dessous de ce seuil disponible, le produit est signalé en alerte. */
  lowStockThreshold: number;
  variantCount: number;
  isActive: boolean;
  isFeatured: boolean;
  categoryName: string | null;
  categorySlug: string | null;
  updatedAt: string;
  /** Visuels du produit, l'image principale en premier. */
  images: AdminProductImage[];
}

/** Un visuel de produit tel qu'affiché dans la liste d'administration. */
export interface AdminProductImage {
  id: string;
  url: string;
  altText: string | null;
  isPrimary: boolean;
}

const PRODUCT_SELECT = `
  id,
  name,
  slug,
  sku,
  price,
  compare_at_price,
  stock_on_hand,
  stock_reserved,
  low_stock_threshold,
  is_active,
  is_featured,
  updated_at,
  categories (id, name, slug),
  product_variants (id, stock_on_hand, stock_reserved, is_active),
  product_images (id, url, alt_text, is_primary, sort_order)
`;

// NOTE : l'imbrication `parent:categories(...)` ci-dessous ne porte VOLONTAIREMENT
// aucun hint de contrainte (`!..._fkey`). `categories` ne se référence qu'elle-même
// via `parent_id`, la relation n'est donc pas ambiguë — et le nom de contrainte
// supposé précédemment (`categories_parent_id_fkey`) n'existe pas dans ce projet :
// PostgREST échouait alors sur TOUTE la requête et l'admin affichait « 0 catégorie ».


interface ProductRow {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  compare_at_price: number | null;
  stock_on_hand: number;
  stock_reserved: number;
  low_stock_threshold: number;
  is_active: boolean;
  is_featured: boolean;
  updated_at: string;
  categories: { id: string; name: string; slug: string } | null;
  product_variants: Array<{
    id: string;
    stock_on_hand: number;
    stock_reserved: number;
    is_active: boolean;
  }> | null;
  product_images: Array<{
    id: string;
    url: string;
    alt_text: string | null;
    is_primary: boolean | null;
    sort_order: number | null;
  }> | null;
}

function toProductRow(row: ProductRow): AdminProductRow {
  // Même agrégat que la boutique : la liste d'administration annonce le stock
  // que le serveur acceptera réellement à la vente. Sans cela, un produit dont
  // les variantes sont actives mais épuisées s'affiche « en stock » ici et
  // « rupture » en boutique.
  const stock = getProductStock(row.product_variants ?? []);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    price: row.price,
    compareAtPrice: row.compare_at_price,
    stockOnHand: stock.stock_on_hand,
    stockReserved: stock.stock_reserved,
    available: getAvailableStock(stock),
    lowStockThreshold: row.low_stock_threshold,
    variantCount: row.product_variants?.length ?? 0,
    isActive: row.is_active,
    isFeatured: row.is_featured,
    categoryName: row.categories?.name ?? null,
    categorySlug: row.categories?.slug ?? null,
    updatedAt: row.updated_at,
    images: [...(row.product_images ?? [])]
      .sort((a, b) => {
        // Image principale d'abord, puis ordre d'affichage croissant.
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
      .map((image) => ({
        id: image.id,
        url: image.url,
        altText: image.alt_text ?? null,
        isPrimary: Boolean(image.is_primary),
      })),
  };
}

export async function listAdminProducts(filters: {
  search?: string;
  categorySlug?: string;
  /** "actifs" | "inactifs" | "tous" */
  status?: string;
  /** "rupture" | "alerte" | "tous" */
  stock?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ rows: AdminProductRow[]; totalCount: number; page: number; totalPages: number }> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(filters.pageSize ?? 25)), 100);

  const search = normalizeCategoryQuery(filters.search ?? "");

  const outcome = await safeQuery("adminProducts.list", (supabase) => {
    let builder = supabase
      .from("products")
      .select(PRODUCT_SELECT, { count: "exact" })
      .order("updated_at", { ascending: false });

    if (filters.status === "actifs") builder = builder.eq("is_active", true);
    if (filters.status === "inactifs") builder = builder.eq("is_active", false);

    if (filters.categorySlug) {
      builder = builder.eq("categories.slug", filters.categorySlug);
    }

    if (search !== "") {
      // La saisie est déjà dépourvue de caractères spéciaux.
      builder = builder.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const from = (page - 1) * pageSize;
    return builder.range(from, from + pageSize - 1);
  });

  let rows = (toList(outcome) as unknown as ProductRow[]).map(toProductRow);

  // Le filtre de stock porte sur le stock *disponible* : il dépend des
  // réservations, ce qu'un `.eq()` en base ne peut pas exprimer seul.
  if (filters.stock === "rupture") rows = rows.filter((row) => row.available <= 0);
  // Seuil propre au produit : un seuil unique codé en dur ici signalait en
  // rouge des produits qui ne sont pas réellement en alerte.
  if (filters.stock === "alerte") {
    rows = rows.filter((row) => row.available > 0 && row.available <= row.lowStockThreshold);
  }

  const totalCount = outcome.count ?? rows.length;

  return { rows, totalCount, page, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) };
}

export interface AdminVariantRow {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  attributes: Record<string, string> | null;
  price: number;
  compareAtPrice: number | null;
  stockOnHand: number;
  stockReserved: number;
  available: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export async function listAdminVariants(productId?: string): Promise<AdminVariantRow[]> {
  const outcome = await safeQuery("adminVariants.list", (supabase) => {
    let builder = supabase
      .from("product_variants")
      .select(
        `
        id, product_id, sku, attributes, price, compare_at_price,
        stock_on_hand, stock_reserved, low_stock_threshold, is_active,
        products (id, name)
      `
      )
      .order("sku", { ascending: true })
      .limit(500);

    if (productId) builder = builder.eq("product_id", productId);

    return builder;
  });

  return toList(outcome).map((row) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const productRow = product as { id?: string; name?: string } | undefined;

    const available = getAvailableStock({
      stock_on_hand: Number(row.stock_on_hand ?? 0),
      stock_reserved: Number(row.stock_reserved ?? 0),
    });

    return {
      id: String(row.id),
      productId: String(row.product_id),
      productName: productRow?.name ?? "",
      sku: typeof row.sku === "string" ? row.sku : "",
      attributes:
        row.attributes && typeof row.attributes === "object"
          ? (row.attributes as Record<string, string>)
          : null,
      price: Number(row.price ?? 0),
      compareAtPrice:
        typeof row.compare_at_price === "number" ? row.compare_at_price : null,
      stockOnHand: Number(row.stock_on_hand ?? 0),
      stockReserved: Number(row.stock_reserved ?? 0),
      available,
      lowStockThreshold: Number(row.low_stock_threshold ?? 5),
      isActive: Boolean(row.is_active),
    };
  });
}

// ============================================================
// Catégories
// ============================================================

export interface AdminCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Visuel de catégorie, stocké dans le bucket `product-images`. */
  imageUrl: string | null;
  parentId: string | null;
  parentName: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export async function listAdminCategories(): Promise<AdminCategoryRow[]> {
  const outcome = await safeQuery("adminCategories.list", (supabase) =>
    supabase
      .from("categories")
      .select(
        `
        id, name, slug, description, parent_id, sort_order, is_active, image_url,
        parent:categories(id, name),
        products (id)
      `
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(500)
  );

  return toList(outcome).map((row) => {
    const parent = Array.isArray(row.parent) ? row.parent[0] : row.parent;
    const parentRow = parent as { id?: string; name?: string } | undefined;
    const products = Array.isArray(row.products) ? row.products : [];

    return {
      id: String(row.id),
      name: typeof row.name === "string" ? row.name : "",
      slug: typeof row.slug === "string" ? row.slug : "",
      description:
        typeof row.description === "string" ? row.description : null,
      imageUrl: typeof row.image_url === "string" ? row.image_url : null,
      parentId: typeof row.parent_id === "string" ? row.parent_id : null,
      parentName: parentRow?.name ?? null,
      sortOrder: Number(row.sort_order ?? 0),
      isActive: Boolean(row.is_active),
      productCount: products.length,
    };
  });
}

// ============================================================
// Stock
// ============================================================

export interface AdminStockRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  attributes: Record<string, string> | null;
  stockOnHand: number;
  stockReserved: number;
  available: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export async function listAdminStock(filters: {
  search?: string;
  /** "alerte" | "rupture" | "tous" */
  state?: string;
} = {}): Promise<AdminStockRow[]> {
  const variants = await listAdminVariants();
  const search = normalizeCategoryQuery(filters.search ?? "");

  return variants
    .filter((variant) => {
      if (search === "") return true;
      return (
        normalizeCategoryQuery(variant.productName).includes(search) ||
        normalizeCategoryQuery(variant.sku).includes(search)
      );
    })
    .filter((variant) => {
      if (filters.state === "rupture") return variant.available <= 0;
      if (filters.state === "alerte") {
        return variant.available > 0 && variant.available <= variant.lowStockThreshold;
      }
      return true;
    })
    .map((variant) => ({
      variantId: variant.id,
      productId: variant.productId,
      productName: variant.productName,
      sku: variant.sku,
      attributes: variant.attributes,
      stockOnHand: variant.stockOnHand,
      stockReserved: variant.stockReserved,
      available: variant.available,
      lowStockThreshold: variant.lowStockThreshold,
      isActive: variant.isActive,
    }));
}

export interface AdminStockMovement {
  id: string;
  variantSku: string;
  productName: string;
  type: string;
  quantity: number;
  reason: string;
  actorName: string | null;
  referenceId: string | null;
  createdAt: string;
}

export async function listAdminStockMovements(limit = 60): Promise<AdminStockMovement[]> {
  const outcome = await safeQuery("adminStock.movements", (supabase) =>
    supabase
      .from("inventory_movements")
      .select(
        `
        id, variant_id, type, quantity, reason, reference_id, created_at,
        product_variants (id, sku, products (id, name)),
        profiles (id, full_name)
      `
      )
      .order("created_at", { ascending: false })
      .limit(limit)
  );

  return toList(outcome).map((row) => {
    const variant = Array.isArray(row.product_variants)
      ? row.product_variants[0]
      : row.product_variants;
    const variantRow = variant as
      | { sku?: string; products?: { name?: string } | { name?: string }[] }
      | undefined;
    const products = Array.isArray(variantRow?.products)
      ? variantRow?.products[0]
      : variantRow?.products;
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const profileRow = profile as { full_name?: string } | undefined;

    return {
      id: String(row.id),
      variantSku: variantRow?.sku ?? "",
      productName: products?.name ?? "",
      type: typeof row.type === "string" ? row.type : "",
      quantity: Number(row.quantity ?? 0),
      reason: typeof row.reason === "string" ? row.reason : "",
      actorName: profileRow?.full_name ?? null,
      referenceId:
        typeof row.reference_id === "string" ? row.reference_id : null,
      createdAt: String(row.created_at),
    };
  });
}

// ============================================================
// Livraisons (vue administration)
// ============================================================

export interface AdminDeliveryRow {
  id: string;
  orderId: string;
  orderNumber: string;
  status: DeliveryStatus;
  driverId: string | null;
  driverName: string | null;
  zoneName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  quarter: string | null;
  total: number;
  assignedAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
}

export async function listAdminDeliveries(filters: {
  status?: string;
  driverId?: string;
  search?: string;
} = {}): Promise<AdminDeliveryRow[]> {
  const outcome = await safeQuery("adminDeliveries.list", (supabase) => {
    let builder = supabase
      .from("deliveries")
      .select(
        `
        id, order_id, status, driver_id, assigned_at, delivered_at, failure_reason,
        orders (id, order_number, total, address_snapshot),
        profiles (id, full_name),
        delivery_zones (id, name)
      `
      )
      .order("assigned_at", { ascending: false, nullsFirst: false })
      .limit(200);

    if (filters.status && filters.status !== "tous") {
      builder = builder.eq("status", filters.status as DeliveryStatus);
    }
    if (filters.driverId) builder = builder.eq("driver_id", filters.driverId);

    return builder;
  });

  const search = normalizeCategoryQuery(filters.search ?? "");

  return toList(outcome)
    .map((row) => {
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      const orderRow = order as
        | {
            id?: string;
            order_number?: string;
            total?: number;
            address_snapshot?: { full_name?: string; phone?: string; quarter?: string };
          }
        | undefined;
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const profileRow = profile as { full_name?: string } | undefined;
      const zone = Array.isArray(row.delivery_zones)
        ? row.delivery_zones[0]
        : row.delivery_zones;
      const zoneRow = zone as { name?: string } | undefined;

      return {
        id: String(row.id),
        orderId: orderRow?.id ?? "",
        orderNumber: orderRow?.order_number ?? "",
        status: row.status as DeliveryStatus,
        driverId: typeof row.driver_id === "string" ? row.driver_id : null,
        driverName: profileRow?.full_name ?? null,
        zoneName: zoneRow?.name ?? null,
        customerName: orderRow?.address_snapshot?.full_name ?? null,
        customerPhone: orderRow?.address_snapshot?.phone ?? null,
        quarter: orderRow?.address_snapshot?.quarter ?? null,
        total: Number(orderRow?.total ?? 0),
        assignedAt: typeof row.assigned_at === "string" ? row.assigned_at : null,
        deliveredAt: typeof row.delivered_at === "string" ? row.delivered_at : null,
        failureReason:
          typeof row.failure_reason === "string" ? row.failure_reason : null,
      };
    })
    .filter((row) => {
      if (search === "") return true;
      return (
        normalizeCategoryQuery(row.orderNumber).includes(search) ||
        normalizeCategoryQuery(row.customerName ?? "").includes(search)
      );
    });
}

// ============================================================
// Livreurs
// ============================================================

export interface AdminDriverRow {
  id: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  activeMissions: number;
  completedMissions: number;
  lastActivityAt: string | null;
}

export async function listAdminDrivers(): Promise<AdminDriverRow[]> {
  const profilesOutcome = await safeQuery("adminDrivers.profiles", (supabase) =>
    supabase
      .from("profiles")
      .select("id, full_name, phone, is_active, created_at")
      .eq("role", "driver")
      .order("full_name", { ascending: true })
      .limit(200)
  );

  const drivers = toList(profilesOutcome)
    .filter((row) => typeof row.id === "string")
    .map((row) => String(row.id));

  if (drivers.length === 0) return [];

  const deliveriesOutcome = await safeQuery("adminDrivers.deliveries", (supabase) =>
    supabase
      .from("deliveries")
      .select("driver_id, status, assigned_at, delivered_at")
      .in("driver_id", drivers)
      .limit(2000)
  );

  const active = new Map<string, number>();
  const completed = new Map<string, number>();
  const lastActivity = new Map<string, string>();

  for (const row of toList(deliveriesOutcome)) {
    const id = typeof row.driver_id === "string" ? row.driver_id : null;
    if (!id) continue;

    const status = String(row.status);
    if (["DELIVERED", "RETURNED"].includes(status)) {
      completed.set(id, (completed.get(id) ?? 0) + 1);
    } else {
      active.set(id, (active.get(id) ?? 0) + 1);
    }

    const stamp =
      typeof row.delivered_at === "string"
        ? row.delivered_at
        : typeof row.assigned_at === "string"
          ? row.assigned_at
          : null;

    if (stamp && (!lastActivity.get(id) || stamp > lastActivity.get(id)!)) {
      lastActivity.set(id, stamp);
    }
  }

  return toList(profilesOutcome)
    .filter((row) => typeof row.id === "string")
    .map((row) => {
      const id = String(row.id);
      return {
        id,
        fullName: typeof row.full_name === "string" ? row.full_name : "",
        phone: typeof row.phone === "string" ? row.phone : "",
        isActive: Boolean(row.is_active),
        createdAt: String(row.created_at),
        activeMissions: active.get(id) ?? 0,
        completedMissions: completed.get(id) ?? 0,
        lastActivityAt: lastActivity.get(id) ?? null,
      };
    });
}

// ============================================================
// Clients
// ============================================================

export interface AdminCustomerRow {
  id: string;
  fullName: string;
  phone: string;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export async function listAdminCustomers(filters: { search?: string } = {}): Promise<AdminCustomerRow[]> {
  const customersOutcome = await safeQuery("adminCustomers.list", (supabase) =>
    supabase
      .from("customers")
      .select("id, full_name, phone, created_at")
      .order("created_at", { ascending: false })
      .limit(300)
  );

  const customers = toList(customersOutcome).filter((row) => typeof row.id === "string");
  if (customers.length === 0) return [];

  const ids = customers.map((row) => String(row.id));

  const ordersOutcome = await safeQuery("adminCustomers.orders", (supabase) =>
    supabase
      .from("orders")
      .select("customer_id, total, created_at, status")
      .in("customer_id", ids)
      .limit(5000)
  );

  const count = new Map<string, number>();
  const spent = new Map<string, number>();
  const last = new Map<string, string>();

  for (const row of toList(ordersOutcome)) {
    const id = typeof row.customer_id === "string" ? row.customer_id : null;
    if (!id) continue;

    if (row.status === "CANCELLED") continue;

    count.set(id, (count.get(id) ?? 0) + 1);
    spent.set(id, (spent.get(id) ?? 0) + Number(row.total ?? 0));

    const stamp = typeof row.created_at === "string" ? row.created_at : null;
    if (stamp && (!last.get(id) || stamp > last.get(id)!)) last.set(id, stamp);
  }

  const search = normalizeCategoryQuery(filters.search ?? "");

  return customers
    .map((row) => {
      const id = String(row.id);
      return {
        id,
        fullName: typeof row.full_name === "string" ? row.full_name : "",
        phone: typeof row.phone === "string" ? row.phone : "",
        createdAt: String(row.created_at),
        orderCount: count.get(id) ?? 0,
        totalSpent: spent.get(id) ?? 0,
        lastOrderAt: last.get(id) ?? null,
      };
    })
    .filter((row) => {
      if (search === "") return true;
      return (
        normalizeCategoryQuery(row.fullName).includes(search) ||
        normalizeCategoryQuery(row.phone).includes(search)
      );
    });
}

// ============================================================
// Utilisateurs et rôles
// ============================================================

export interface AdminUserRow {
  id: string;
  fullName: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const outcome = await safeQuery("adminUsers.list", (supabase) =>
    supabase
      .from("profiles")
      .select("id, full_name, phone, role, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(300)
  );

  return toList(outcome)
    .filter((row) => typeof row.id === "string")
    .map((row) => ({
      id: String(row.id),
      fullName: typeof row.full_name === "string" ? row.full_name : "",
      phone: typeof row.phone === "string" ? row.phone : "",
      role: row.role as UserRole,
      isActive: Boolean(row.is_active),
      createdAt: String(row.created_at),
    }));
}

// ============================================================
// Audit
// ============================================================

export interface AdminAuditRow {
  id: string;
  actorName: string | null;
  actorRole: UserRole | null;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export async function listAdminAudit(filters: {
  action?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
} = {}): Promise<AdminAuditRow[]> {
  const outcome = await safeQuery("adminAudit.list", (supabase) => {
    let builder = supabase
      .from("audit_logs")
      .select(
        `
        id, actor_id, actor_role, action, entity_type, entity_id,
        before_json, after_json, created_at,
        profiles (id, full_name)
      `
      )
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(filters.limit ?? 100, 1), 300));

    if (filters.action && filters.action !== "toutes") {
      builder = builder.eq("action", filters.action);
    }
    if (filters.entityType && filters.entityType !== "tous") {
      builder = builder.eq("entity_type", filters.entityType);
    }
    if (filters.entityId) builder = builder.eq("entity_id", filters.entityId);

    return builder;
  });

  return toList(outcome).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const profileRow = profile as { full_name?: string } | undefined;

    return {
      id: String(row.id),
      actorName: profileRow?.full_name ?? null,
      actorRole: (row.actor_role as UserRole) ?? null,
      action: typeof row.action === "string" ? row.action : "",
      entityType: typeof row.entity_type === "string" ? row.entity_type : "",
      entityId: typeof row.entity_id === "string" ? row.entity_id : "",
      before:
        row.before_json && typeof row.before_json === "object"
          ? (row.before_json as Record<string, unknown>)
          : null,
      after:
        row.after_json && typeof row.after_json === "object"
          ? (row.after_json as Record<string, unknown>)
          : null,
      createdAt: String(row.created_at),
    };
  });
}

export type { Category, Customer, Profile, AuditLog };
export { toSingle };