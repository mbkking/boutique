"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  Truck,
  Users,
  Settings,
  Menu,
  X,
  ChevronDown,
  Tags,
  MapPin,
  Tag,
  ScrollText,
  Ticket,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { can, canAny, PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { SignOutButton } from "@/app/_components/sign-out-button";
import {
  buildAdminBackgroundStyle,
  buildAdminThemeVariables,
  DEFAULT_ADMIN_THEME,
  type AdminTheme,
} from "@/lib/theme/admin-theme";
import type { UserRole } from "@/types";

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  /** Droits requis pour voir l'entrée. */
  permissions: readonly Permission[];
}

/**
 * Navigation du back-office.
 *
 * Chaque entrée déclare les droits qui la rendent visible. Elle est filtrée par
 * la matrice RBAC, exactement comme le layout imbriqué qui protège la page :
 * l'interface ne peut donc jamais proposer une page que le serveur refuse.
 */
const navigation: readonly NavItem[] = [
  {
    name: "Tableau de bord",
    href: "/admin",
    icon: LayoutDashboard,
    permissions: [PERMISSIONS.ORDER_READ, PERMISSIONS.INVENTORY_READ, PERMISSIONS.PRODUCT_READ],
  },
  { name: "Commandes", href: "/admin/orders", icon: ShoppingCart, permissions: [PERMISSIONS.ORDER_READ] },
  { name: "Produits", href: "/admin/products", icon: Package, permissions: [PERMISSIONS.PRODUCT_READ] },
  { name: "Catégories", href: "/admin/categories", icon: Tags, permissions: [PERMISSIONS.PRODUCT_READ] },
  { name: "Stock", href: "/admin/inventory", icon: Warehouse, permissions: [PERMISSIONS.INVENTORY_READ] },
  { name: "Livraisons", href: "/admin/deliveries", icon: Truck, permissions: [PERMISSIONS.DELIVERY_READ_ALL] },
  { name: "Livreurs", href: "/admin/drivers", icon: Users, permissions: [PERMISSIONS.DELIVERY_READ_ALL] },
  { name: "Clients", href: "/admin/customers", icon: UserRound, permissions: [PERMISSIONS.CUSTOMER_READ] },
  { name: "Zones", href: "/admin/zones", icon: MapPin, permissions: [PERMISSIONS.SETTINGS_READ] },
  { name: "Promotions", href: "/admin/promotions", icon: Tag, permissions: [PERMISSIONS.SETTINGS_READ] },
  { name: "Coupons", href: "/admin/coupons", icon: Ticket, permissions: [PERMISSIONS.SETTINGS_READ] },
  { name: "Utilisateurs", href: "/admin/users", icon: Users, permissions: [PERMISSIONS.USER_READ] },
  { name: "Audit", href: "/admin/audit", icon: ScrollText, permissions: [PERMISSIONS.AUDIT_READ] },
  { name: "Paramètres", href: "/admin/settings", icon: Settings, permissions: [PERMISSIONS.SETTINGS_READ] },
];

const roleLabels: Record<UserRole, string> = {
  admin: "Administrateur",
  order_operator: "Opérateur de commandes",
  stock_manager: "Gestionnaire de stock",
  driver: "Livreur",
  customer: "Client",
};

export interface AdminShellProps {
  fullName: string;
  role: UserRole;
  children: React.ReactNode;
  /**
   * Apparence du back-office. Optionnelle : sans thème, l'interface reste
   * parfaitement utilisable avec l'apparence par défaut.
   */
  theme?: AdminTheme;
}

/**
 * Coquille visuelle du back-office.
 *
 * Composant client séparé du layout serveur afin que la vérification de rôle
 * (`requireRole`) s'exécute sur le serveur, avant tout rendu.
 *
 * Le thème est appliqué ici, une seule fois : les variables CSS sont posées
 * sur la racine, et la couche `.admin-theme` de `globals.css` les reporte sur
 * l'ensemble des pages. Aucune page n'a à connaître les couleurs.
 */
export function AdminShell({
  fullName,
  role,
  children,
  theme = DEFAULT_ADMIN_THEME,
}: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Les variables CSS sont sérialisées par React dans l'attribut `style`.
  const themeStyle = buildAdminThemeVariables(theme) as React.CSSProperties;
  const backgroundStyle = buildAdminBackgroundStyle(theme);

  const filteredNav = navigation.filter((item) =>
    canAny(role, item.permissions)
  );

  // Un utilisateur sans aucun droit sur une entrée ne doit pas y accéder non
  // plus en tapant l'URL : le badgeParamètres n'est rendu que si la section
  // correspondante est réellement accessible.
  const canOpenSettings = can(role, PERMISSIONS.SETTINGS_READ);

  return (
    <div
      className="admin-theme min-h-screen bg-gray-50"
      style={{ ...themeStyle, ...backgroundStyle }}
    >
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200">
          <Link href="/admin" className="flex items-center gap-2">
            <Image
              src={theme.logo_url || "/images/logo.jpeg"}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg object-cover"
            />
            <span className="font-semibold text-gray-900">ISF NAF-CHOPOP Admin</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary-50 text-primary-light"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-primary-light font-medium text-sm">
                {fullName.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {fullName}
              </p>
              <p className="text-xs text-gray-500">
                {roleLabels[role] ?? role}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
            aria-label="Ouvrir le menu"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-1" />

          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              aria-expanded={userMenuOpen}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-primary-light font-medium text-xs">
                  {fullName.charAt(0)}
                </span>
              </div>
              <span className="hidden sm:block font-medium">{fullName}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-lg bg-white border border-gray-200 shadow-lg py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{fullName}</p>
                  <p className="text-xs text-gray-500">{roleLabels[role] ?? role}</p>
                </div>
                <Link
                  href="/admin/settings"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setUserMenuOpen(false)}
                  hidden={!canOpenSettings}
                >
                  <Settings className="h-4 w-4" />
                  Paramètres
                </Link>
                <div className="px-4 py-2">
                  <SignOutButton />
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}