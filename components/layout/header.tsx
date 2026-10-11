"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  House,
  LayoutGrid,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Search,
  ShoppingBag,
  ShoppingCart,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/cart/cart-provider";
import { NotificationBell } from "@/components/notifications/notification-bell";
import {
  getHeaderRoleAction,
  signOutAction,
  type HeaderRole,
} from "@/lib/actions/auth";
import { useSpace } from "@/lib/auth/use-space";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Accueil", icon: House },
  { href: "/categories", label: "Catégories", icon: LayoutGrid },
  { href: "/search", label: "Recherche", icon: Search },
  { href: "/cart", label: "Panier", icon: ShoppingCart },
  { href: "/compte", label: "Compte", icon: User },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header({
  siteName = "ISF NAF-CHOPOP",
  logoUrl,
}: {
  siteName?: string;
  logoUrl?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { totalItems, openCart, isHydrated } = useCart();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [cartBump, setCartBump] = useState(false);
  // `null` tant que le rôle n'est pas connu : le HTML serveur et le premier
  // rendu client sont alors strictement identiques (aucun écart
  // d'hydratation), puis la navigation s'ajuste au rôle réel.
  const [account, setAccount] = useState<HeaderRole | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const drawerId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const prevItemsRef = useRef(totalItems);

  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setIsMenuOpen(false);
  }

  useEffect(() => {
    if (!isMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        toggleRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow!;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 8);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Rôle après hydratation uniquement : aucun impact sur le HTML serveur.
  useEffect(() => {
    let cancelled = false;
    void getHeaderRoleAction().then((result) => {
      if (!cancelled) setAccount(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isHydrated && totalItems !== prevItemsRef.current && totalItems > prevItemsRef.current) {
      setCartBump(true);
      const timer = setTimeout(() => setCartBump(false), 300);
      prevItemsRef.current = totalItems;
      return () => clearTimeout(timer);
    }
    prevItemsRef.current = totalItems;
  }, [totalItems, isHydrated]);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOutAction();
      setAccount({ loggedIn: false, role: null });
      setIsMenuOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  // Espace courant (connu après montage uniquement). Quand la séparation
  // stricte est active et que l'espace n'est pas la boutique, l'en-tête
  // public ne se rend pas : chaque espace possède son propre chrome
  // (AdminShell / DriverShell).
  const spaceInfo = useSpace();
  if (
    spaceInfo &&
    spaceInfo.enforced &&
    (spaceInfo.space === "admin" || spaceInfo.space === "driver")
  ) {
    return null;
  }

  // Boutique publique : AUCUN lien d'espace staff, quel que soit le rôle.
  // Connecté → « Mon compte » (+ commandes/adresses pour un client) et
  // déconnexion. Non connecté → uniquement « Se connecter » (la page de
  // connexion propose elle-même « Créer un compte »).
  const isCustomer = account?.role === "customer";

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      router.push("/search");
      return;
    }
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  const navLinkClasses = (active: boolean) =>
    cn(
      "tap-target inline-flex items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all duration-200 focus-visible:focus-ring",
      active
        ? "bg-primary-50 text-primary"
        : "text-text-muted hover:bg-surface-alt hover:text-text"
    );

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-30 border-b bg-surface/95 backdrop-blur-md transition-all duration-300",
          isScrolled
            ? "border-border shadow-sm"
            : "border-transparent"
        )}
      >
        <div className="mx-auto flex max-w-7xl flex-col">
          {/* Ligne 1 : Logo + Recherche + Panier */}
          <div className="flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={isMenuOpen}
            aria-controls={drawerId}
            aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setIsMenuOpen((open) => !open)}
            className="flex shrink-0 items-center justify-center rounded-lg p-2 text-text hover:bg-surface-alt focus-visible:focus-ring md:hidden"
          >
            {isMenuOpen ? (
              <X aria-hidden="true" className="size-5" />
            ) : (
              <Menu aria-hidden="true" className="size-5" />
            )}
          </button>

          <Link
            href="/"
            aria-label={`${siteName} — accueil`}
            className="min-w-0 flex-1 rounded-lg text-base font-bold tracking-tight text-primary focus-visible:focus-ring sm:flex-none sm:text-lg"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Image
                src={logoUrl || "/images/logo.jpeg"}
                alt=""
                width={40}
                height={40}
                priority
                className="h-10 w-10 shrink-0 rounded-lg object-cover"
              />
              <span className="truncate">{siteName}</span>
            </span>
          </Link>

          <form
            role="search"
            onSubmit={handleSearchSubmit}
            className="hidden min-w-0 flex-1 sm:block"
          >
            <label htmlFor="recherche-en-tete" className="sr-only">
              Rechercher un produit
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-light"
              />
              <input
                id="recherche-en-tete"
                type="search"
                name="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un produit…"
                enterKeyHint="search"
                className="tap-target w-full rounded-xl border border-border bg-surface-alt/80 py-2.5 pl-10 pr-4 text-sm text-text placeholder:text-text-light transition-all duration-200 focus:border-primary-light focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary-light/20"
              />
            </div>
          </form>

          <Link
            href="/search"
            aria-label="Rechercher un produit"
            className="flex shrink-0 items-center justify-center rounded-lg p-2 text-text hover:bg-surface-alt focus-visible:focus-ring sm:hidden"
          >
            <Search aria-hidden="true" className="size-5" />
          </Link>

          {isCustomer ? (
            <NotificationBell
              variant="store"
              listHref="/account/orders"
              detailBase="/account/orders/"
            />
          ) : null}

          <button
            type="button"
            onClick={openCart}
            aria-label={
              isHydrated && totalItems > 0
                ? `Ouvrir le panier, ${totalItems} article${totalItems > 1 ? "s" : ""}`
                : "Ouvrir le panier, vide"
            }
            className="relative flex shrink-0 items-center justify-center rounded-lg p-2 text-text transition-colors hover:bg-surface-alt focus-visible:focus-ring"
          >
            <ShoppingCart aria-hidden="true" className="size-5" />
            {isHydrated && totalItems > 0 ? (
              <span
                className={cn(
                  "absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-surface",
                  cartBump && "badge-bounce"
                )}
              >
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            ) : null}
          </button>
        </div>

        {/* Ligne 2 : Navigation desktop */}
        <nav
          aria-label="Navigation principale"
          className="hidden border-t border-border-light md:block"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 sm:px-6">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  isActivePath(pathname, item.href) ? "page" : undefined
                }
                className={navLinkClasses(isActivePath(pathname, item.href))}
              >
                <item.icon aria-hidden="true" className="size-4" />
                {item.label}
              </Link>
            ))}

            {account && !account.loggedIn ? (
              <Link href="/connexion" className={navLinkClasses(isActivePath(pathname, "/connexion"))}>
                <LogIn aria-hidden="true" className="size-4" />
                Se connecter
              </Link>
            ) : null}

            {account && account.loggedIn ? (
              <>
                <Link
                  href="/compte"
                  aria-current={isActivePath(pathname, "/compte") || isActivePath(pathname, "/account") ? "page" : undefined}
                  className={navLinkClasses(isActivePath(pathname, "/compte") || isActivePath(pathname, "/account"))}
                >
                  <User aria-hidden="true" className="size-4" />
                  Mon compte
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="tap-target inline-flex items-center gap-2 rounded-lg px-3 text-sm font-medium text-text-muted transition-all duration-200 hover:bg-surface-alt hover:text-text focus-visible:focus-ring disabled:opacity-60"
                >
                  <LogOut aria-hidden="true" className="size-4" />
                  {isSigningOut ? "Déconnexion…" : "Se déconnecter"}
                </button>
              </>
            ) : null}
          </div>
        </nav>
      </div>
      </header>

      {/*
        Tiroir mobile et barre de navigation basse volontairement HORS du
        <header> : `backdrop-blur-md` (backdrop-filter) établit un containing
        block pour les descendants `position: fixed`, ce qui plaçait autrement
        ces deux surfaces en haut de l'écran, par-dessus le logo et le
        compteur du panier.
      */}
      {/* Tiroir mobile */}
      <div
        id={drawerId}
        inert={!isMenuOpen}
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          isMenuOpen ? "" : "pointer-events-none"
        )}
      >
        <div
          aria-hidden="true"
          onClick={() => setIsMenuOpen(false)}
          className={cn(
            "absolute inset-0 bg-text/40 transition-opacity duration-200",
            isMenuOpen ? "opacity-100" : "opacity-0"
          )}
        />

        <nav
          aria-label="Menu principal"
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col gap-1 border-r border-border bg-surface p-4 transition-transform duration-200",
            isMenuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-base font-bold text-primary">
              <Image
                src={logoUrl || "/images/logo.jpeg"}
                alt=""
                width={32}
                height={32}
                className="h-8 w-8 rounded-lg object-cover"
              />
              {siteName}
            </span>
            <button
              type="button"
              aria-label="Fermer le menu"
              onClick={() => {
                setIsMenuOpen(false);
                toggleRef.current?.focus();
              }}
              className="tap-target flex items-center justify-center rounded-lg p-2 text-text-muted hover:bg-surface-alt focus-visible:focus-ring"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <form role="search" onSubmit={handleSearchSubmit} className="mb-2">
            <label htmlFor="recherche-menu" className="sr-only">
              Rechercher un produit
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-light"
              />
              <input
                id="recherche-menu"
                type="search"
                name="q"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un produit…"
                enterKeyHint="search"
                className="tap-target w-full rounded-xl border border-border bg-surface-alt py-2.5 pl-10 pr-3 text-sm text-text placeholder:text-text-light focus-visible:focus-ring"
              />
            </div>
          </form>

          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={
                    isActivePath(pathname, item.href) ? "page" : undefined
                  }
                  onClick={() => setIsMenuOpen(false)}
                  className={navLinkClasses(isActivePath(pathname, item.href))}
                >
                  <item.icon aria-hidden="true" className="size-4" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          {account ? (
            <div className="mt-2 flex flex-col gap-1 border-t border-border-light pt-2">
              {!account.loggedIn ? (
                <Link
                  href="/connexion"
                  onClick={() => setIsMenuOpen(false)}
                  className={navLinkClasses(isActivePath(pathname, "/connexion"))}
                >
                  <LogIn aria-hidden="true" className="size-4" />
                  Se connecter
                </Link>
              ) : (
                <>
                  <Link
                    href="/compte"
                    onClick={() => setIsMenuOpen(false)}
                    aria-current={isActivePath(pathname, "/compte") || isActivePath(pathname, "/account") ? "page" : undefined}
                    className={navLinkClasses(isActivePath(pathname, "/compte") || isActivePath(pathname, "/account"))}
                  >
                    <User aria-hidden="true" className="size-4" />
                    Mon compte
                  </Link>
                  {isCustomer ? (
                    <>
                      <Link
                        href="/account/orders"
                        onClick={() => setIsMenuOpen(false)}
                        className={navLinkClasses(isActivePath(pathname, "/account/orders"))}
                      >
                        <ShoppingBag aria-hidden="true" className="size-4" />
                        Mes commandes
                      </Link>
                      <Link
                        href="/account/addresses"
                        onClick={() => setIsMenuOpen(false)}
                        className={navLinkClasses(isActivePath(pathname, "/account/addresses"))}
                      >
                        <MapPin aria-hidden="true" className="size-4" />
                        Mes adresses
                      </Link>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isSigningOut}
                    className="tap-target inline-flex items-center gap-2 rounded-lg px-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-alt hover:text-text focus-visible:focus-ring disabled:opacity-60"
                  >
                    <LogOut aria-hidden="true" className="size-4" />
                    {isSigningOut ? "Déconnexion…" : "Se déconnecter"}
                  </button>
                </>
              )}
            </div>
          ) : null}

          <p className="mt-auto pt-4 text-xs text-text-muted">
            Paiement à la livraison uniquement. Livraison à Niamey et quartiers.
          </p>
        </nav>
      </div>

      {/* Barre de navigation basse (mobile) */}
      <nav
        aria-label="Navigation rapide"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-medium transition-colors focus-visible:focus-ring",
                    active ? "text-primary" : "text-text-muted"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "relative flex items-center justify-center rounded-full px-3 py-0.5 transition-colors",
                      active && "bg-primary-50"
                    )}
                  >
                    <item.icon className="size-5" />
                    {item.href === "/cart" && isHydrated && totalItems > 0 ? (
                      <span className="absolute -right-1 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-surface">
                        {totalItems > 99 ? "99+" : totalItems}
                      </span>
                    ) : null}
                  </span>
                  {item.label}
                  {item.href === "/cart" && isHydrated && totalItems > 0 ? (
                    <span className="sr-only">
                      {`${totalItems} article${totalItems > 1 ? "s" : ""}`}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
