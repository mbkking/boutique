export type UserRole = "admin" | "order_operator" | "stock_manager" | "driver" | "customer";

export type OrderStatus =
  | "PENDING_CONFIRMATION"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_DELIVERY"
  | "ASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "ARRIVED"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "RETURNED"
  | "CANCELLED";

export type PaymentMethod = "COD" | "MOBILE_MONEY" | "CARD" | "OTHER";

export type PaymentStatus =
  | "COD_PENDING"
  | "COD_COLLECTED"
  | "COD_PARTIAL"
  | "COD_FAILED"
  | "REFUNDED";

export type DeliveryStatus =
  | "PENDING_ASSIGNMENT"
  | "ASSIGNED"
  | "ACCEPTED"
  | "IN_PREPARATION"
  | "OUT_FOR_DELIVERY"
  | "ARRIVED"
  | "DELIVERED"
  | "FAILED"
  // Reprise après un échec : le livreur réessaie à une nouvelle date.
  | "RESCHEDULED"
  | "RETURNED";

export type DeliveryFailureReason =
  | "CUSTOMER_ABSENT"
  | "PHONE_UNREACHABLE"
  | "ADDRESS_INACCURATE"
  | "CUSTOMER_REFUSED"
  | "PRODUCT_UNAVAILABLE"
  | "OTHER";

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  profile_id: string | null;
  full_name: string;
  phone: string;
  total_orders: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  customer_id: string;
  city: string;
  quarter: string;
  sector: string | null;
  landmark: string;
  instructions: string | null;
  latitude: number | null;
  longitude: number | null;
  address_code: string;
  is_default: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  sku: string;
  price: number;
  compare_at_price: number | null;
  stock_on_hand: number;
  stock_reserved: number;
  low_stock_threshold: number;
  is_active: boolean;
  is_featured: boolean;
  is_new?: boolean | null;
  is_popular?: boolean | null;
  weight_kg: number | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  attributes: Record<string, string>;
  price: number;
  compare_at_price: number | null;
  stock_on_hand: number;
  stock_reserved: number;
  low_stock_threshold: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface InventoryMovement {
  id: string;
  variant_id: string;
  type: "IN" | "OUT" | "ADJUSTMENT" | "RESERVATION" | "RELEASE";
  quantity: number;
  reason: string;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Cart {
  id: string;
  customer_id: string | null;
  session_id: string;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  variant_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  total: number;
  currency: string;
  address_snapshot: AddressSnapshot;
  notes: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddressSnapshot {
  city: string;
  quarter: string;
  sector: string | null;
  landmark: string;
  instructions: string | null;
  latitude: number | null;
  longitude: number | null;
  address_code: string;
  full_name: string;
  phone: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  variant_id: string;
  product_name: string;
  sku: string;
  variant_attributes: Record<string, string>;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  status: OrderStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  city: string;
  quarters: string[];
  fee: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Delivery {
  id: string;
  order_id: string;
  driver_id: string | null;
  zone_id: string | null;
  status: DeliveryStatus;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  failure_reason: DeliveryFailureReason | null;
  failure_notes: string | null;
  proof_type: "SIGNATURE" | "PHOTO" | "CONFIRMATION" | null;
  proof_url: string | null;
  /** Nombre de tentatives effectuées, plafonné par la politique de reprise. */
  attempt_count: number;
  rescheduled_at: string | null;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryEvent {
  id: string;
  delivery_id: string;
  status: DeliveryStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CashCollection {
  id: string;
  delivery_id: string;
  expected_amount: number;
  collected_amount: number;
  method: PaymentMethod;
  discrepancy_reason: string | null;
  collected_at: string;
  created_at: string;
}

export interface Promotion {
  id: string;
  name: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  min_order_amount: number | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  actor_role: UserRole | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  ip_hash: string | null;
  created_at: string;
}

export interface AppSetting {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string | null;
  order_id: string | null;
  type: string;
  title: string;
  body: string;
  channel: "WEB" | "SMS" | "WHATSAPP" | "PUSH";
  status: "PENDING" | "SENT" | "FAILED";
  sent_at: string | null;
  created_at: string;
}

/** Type de remise d'un code promo. */
export type CouponDiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

export interface Coupon {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  starts_at: string;
  expires_at: string | null;
max_uses: number | null;
  used_count: number;
  /** Quota accordé à un même client, identifié par son téléphone. */
  max_uses_per_user: number | null;
  is_active: boolean;
  applies_to_category_id: string | null;
  applies_to_product_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** Motif de refus d'un code promo, communiqué au client en français. */
export type CouponRejectionReason =
  | "CODE_INCONNU"
  | "CODE_DESACTIVE"
  | "CODE_NON_ENCORE_VALIDE"
  | "CODE_EXPIRE"
| "CODE_EPUISE"
  | "CODE_LIMITE_PAR_UTILISATEUR"
  | "MINIMUM_NON_ATTEINT"
  | "CODE_HORS_PORTEE"
  | "REMISE_NULLE";

/**
 * Traduction d'un motif de refus renvoyé par `create_order`
 * (`COUPON_INVALID:<motif>`), pour éviter qu'un motif ne soit affiché brut.
 */
const CREATE_ORDER_COUPON_MESSAGES: Record<CouponRejectionReason, string> = {
  CODE_INCONNU: "Ce code promo n'existe pas.",
  CODE_DESACTIVE: "Ce code promo n'est plus actif.",
  CODE_NON_ENCORE_VALIDE: "Ce code promo n'est pas encore valable.",
  CODE_EXPIRE: "Ce code promo est expiré.",
  CODE_EPUISE: "Ce code promo a atteint sa limite d'utilisation.",
  CODE_LIMITE_PAR_UTILISATEUR:
    "Ce code promo a déjà été utilisé le nombre de fois autorisé pour vous.",
  MINIMUM_NON_ATTEINT:
    "Le montant minimum de commande n'est pas atteint pour ce code.",
  CODE_HORS_PORTEE:
    "Ce code promo ne s'applique à aucun article de votre commande.",
  REMISE_NULLE: "Ce code ne réduit pas le montant de votre commande.",
};

export function couponRejectionMessage(
  reason: CouponRejectionReason
): string {
  return (
    CREATE_ORDER_COUPON_MESSAGES[reason] ??
    CREATE_ORDER_COUPON_MESSAGES.CODE_INCONNU
  );
}

export interface CouponValidation {
  valid: boolean;
  /** Code normalisé, à inscrire sur la commande. */
  code: string | null;
  /** Identifiant du coupon validé, pour l'incrément d'usage en transaction. */
  couponId: string | null;
  /** Remise en XOF, calculée par la base. */
  discount: number;
  /** Raison du refus, à traduire côté interface. */
  reason: CouponRejectionReason | null;
}

/** Rôle décrit par la table `roles`. */
export interface RoleDefinition {
  id: string;
  key: UserRole;
  name: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

/** Preuve de livraison : photo ou note de fin de tournée. */
export interface DeliveryProof {
  /** Type de preuve : photo du client, du produit, ou note. */
  type: "photo" | "note" | "signature" | null;
  url: string | null;
  /** Nombre de tentatives de livraison effectuées. */
  attemptCount: number;
  nextAttemptAt: string | null;
  rescheduledAt: string | null;
}


