import type { UserRole } from "@/types";

/**
 * Matrice RBAC de l'application.
 *
 * Source unique de vérité : les layouts, la navigation et les server actions
 * interrogent tous ce module. Un droit affiché dans l'interface est donc
 * nécessairement le même droit vérifié côté serveur — impossible d'exposer un
 * bouton qu'une action refuse ensuite.
 *
 * Le visiteur non connecté n'a aucun droit : il ne dépend d'aucun rôle en base.
 */

/** Les droits vérifiables de l'application. */
export const PERMISSIONS = {
  // Commandes
  ORDER_READ: "order:read",
  ORDER_CONFIRM: "order:confirm",
  ORDER_PREPARE: "order:prepare",
  ORDER_CANCEL: "order:cancel",
  ORDER_ASSIGN_DELIVERY: "order:assign_delivery",

  // Stock
  INVENTORY_READ: "inventory:read",
  INVENTORY_ADJUST: "inventory:adjust",

  // Catalogue
  PRODUCT_READ: "product:read",
  PRODUCT_WRITE: "product:write",
  CATEGORY_WRITE: "category:write",
  VARIANT_WRITE: "variant:write",

  // Clients
  CUSTOMER_READ: "customer:read",
  CUSTOMER_WRITE: "customer:write",

  // Utilisateurs et paramètres (réservés à l'administrateur)
  USER_READ: "user:read",
  USER_WRITE: "user:write",
  SETTINGS_READ: "settings:read",
  SETTINGS_WRITE: "settings:write",
  AUDIT_READ: "audit:read",
  EXPORT_RUN: "export:run",

  // Livraisons
  DELIVERY_READ_ALL: "delivery:read_all",
  DELIVERY_READ_OWN: "delivery:read_own",
  DELIVERY_UPDATE_STATUS: "delivery:update_status",
  DELIVERY_COLLECT_CASH: "delivery:collect_cash",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS);

/**
 * Droits par rôle.
 *
 * - `admin` : accès complet.
 * - `order_operator` : cycle de vie des commandes et affectation des livraisons,
 *   consultation des clients. Aucun accès au stock, au catalogue ni aux
 *   paramètres.
 * - `stock_manager` : catalogue, variantes et stocks. Aucune lecture des
 *   commandes : le cahier des charges ne lui accorde que la consultation des
 *   stocks, les ajustements, les mouvements, les seuils et les alertes.
 * - `driver` : uniquement ses propres missions de livraison.
 * - `customer` : aucun droit interne ; ses accès passent par les policies RLS
 *   qui le limitent à ses propres lignes.
 */
const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: ALL_PERMISSIONS,
  order_operator: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_CONFIRM,
    PERMISSIONS.ORDER_PREPARE,
    PERMISSIONS.ORDER_CANCEL,
    PERMISSIONS.ORDER_ASSIGN_DELIVERY,
    PERMISSIONS.DELIVERY_READ_ALL,
    PERMISSIONS.CUSTOMER_READ,
  ],
  stock_manager: [
    PERMISSIONS.PRODUCT_READ,
    PERMISSIONS.PRODUCT_WRITE,
    PERMISSIONS.CATEGORY_WRITE,
    PERMISSIONS.VARIANT_WRITE,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_ADJUST,
  ],
  driver: [
    PERMISSIONS.DELIVERY_READ_OWN,
    PERMISSIONS.DELIVERY_UPDATE_STATUS,
    PERMISSIONS.DELIVERY_COLLECT_CASH,
  ],
  customer: [],
};

/** Droits effectifs d'un rôle. Inconnu ou absent : aucun droit. */
export function permissionsFor(role: UserRole | null | undefined): readonly Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Le rôle possède-t-il ce droit ? */
export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

/** Le rôle possède-t-il au moins un de ces droits ? */
export function canAny(
  role: UserRole | null | undefined,
  permissions: readonly Permission[]
): boolean {
  const granted = permissionsFor(role);
  return permissions.some((permission) => granted.includes(permission));
}

/** Le rôle possède-t-il tous ces droits ? */
export function canAll(
  role: UserRole | null | undefined,
  permissions: readonly Permission[]
): boolean {
  const granted = permissionsFor(role);
  return permissions.every((permission) => granted.includes(permission));
}

/** Tous les droits sauf ceux listés. Utile pour les blocs de réglages. */
export function without(
  role: UserRole | null | undefined,
  ...excluded: readonly Permission[]
): readonly Permission[] {
  const granted = permissionsFor(role);
  return granted.filter(
    (permission) => !excluded.includes(permission)
  );
}