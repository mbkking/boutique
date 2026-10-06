"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Truck,
  LayoutDashboard,
  MapPin,
  User,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/app/_components/sign-out-button";

export interface DriverShellProps {
  fullName: string;
  phone: string;
  /**
   * Statistiques de tournée. Absentes tant qu'aucune lecture réelle des
   * livraisons n'est branchée : on n'affiche jamais de chiffre codé en dur.
   */
  stats: { active: number; total: number } | null;
  /**
   * Racine de l'espace affiché : `/driver` (historique) ou `/livreur`
   * (canonique). La navigation interne suit cette racine pour rester dans
   * l'espace courant.
   */
  basePath?: string;
  children: React.ReactNode;
}

/**
 * Coquille visuelle de l'espace livreur.
 *
 * Composant client séparé du layout serveur afin que la vérification de rôle
 * (`requireRole`) s'exécute sur le serveur, avant tout rendu.
 */
export function DriverShell({
  fullName,
  phone,
  stats,
  basePath = "/driver",
  children,
}: DriverShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // L'espace historique `/driver` conserve ses segments anglais
  // (`deliveries`, `history`) ; l'espace canonique `/livreur` utilise le
  // français. La navigation suit l'espace courant pour ne jamais mener à 404.
  const missionsHref = basePath === "/livreur" ? "/livreur/livraisons" : "/driver/deliveries";
  const historyHref = basePath === "/livreur" ? "/livreur/historique" : "/driver/history";

  const navigation = [
    { name: "Tableau de bord", href: basePath, icon: LayoutDashboard },
    { name: "Mes livraisons", href: missionsHref, icon: Truck },
    { name: "Historique", href: historyHref, icon: MapPin },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
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
          <Link href={basePath} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-600 flex items-center justify-center">
              <Truck className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">Espace Livreur</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-500 hover:text-gray-700"
            aria-label="Fermer le menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {stats ? (
          <div className="px-4 py-4 border-b border-gray-200">
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-xs font-medium text-green-600 uppercase">
                Livraisons du jour
              </p>
              <p className="text-2xl font-bold text-green-700 mt-1">{stats.active}</p>
              <p className="text-xs text-green-600 mt-1">{stats.total} total</p>
            </div>
          </div>
        ) : null}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== basePath && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-green-50 text-green-700"
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
            <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-green-700 font-medium text-sm">
                {fullName.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {fullName}
              </p>
              <p className="text-xs text-gray-500">{phone}</p>
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
              <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-green-700 font-medium text-xs">
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
                  <p className="text-xs text-gray-500">Livreur</p>
                </div>
                <Link
                  href="/livreur/profil"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <User className="h-4 w-4" />
                  Mon profil
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