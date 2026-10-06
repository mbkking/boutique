"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingCart, Trash, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateSubtotal, formatPrice } from "@/lib/services/pricing";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const CART_STORAGE_KEY = "boutique-niger-cart";

export interface CartLine {
  variant_id: string;
  product_id: string;
  name: string;
  slug: string;
  variant_label: string | null;
  unit_price: number;
  quantity: number;
  image_url: string | null;
  max_stock: number;
}

export interface CartContextValue {
  lines: CartLine[];
  isHydrated: boolean;
  totalItems: number;
  subtotal: number;
  isOpen: boolean;
  addItem: (line: CartLine) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  clear: () => void;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Accède au contexte du panier.
 * @throws si utilisé en dehors de `<CartProvider>`.
 */
export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (context === null) {
    throw new Error(
      "useCart doit être utilisé à l'intérieur d'un composant <CartProvider>."
    );
  }
  return context;
}

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

function clampQuantity(quantity: number, maxStock: number): number {
  const safeQuantity = Number.isFinite(quantity) ? Math.floor(quantity) : 1;
  const safeMax = Number.isFinite(maxStock) ? Math.floor(maxStock) : 1;
  return Math.min(Math.max(safeQuantity, 1), Math.max(safeMax, 1));
}

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.variant_id === "string" &&
    typeof candidate.product_id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.slug === "string" &&
    (candidate.variant_label === null ||
      typeof candidate.variant_label === "string") &&
    typeof candidate.unit_price === "number" &&
    Number.isFinite(candidate.unit_price) &&
    typeof candidate.quantity === "number" &&
    Number.isFinite(candidate.quantity) &&
    (candidate.image_url === null || typeof candidate.image_url === "string") &&
    typeof candidate.max_stock === "number" &&
    Number.isFinite(candidate.max_stock)
  );
}

function sanitizeLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CartLine[] = [];

  for (const entry of value) {
    if (!isCartLine(entry)) continue;
    if (seen.has(entry.variant_id)) continue;
    if (entry.max_stock < 1) continue;
    seen.add(entry.variant_id);
    result.push({
      ...entry,
      quantity: clampQuantity(entry.quantity, entry.max_stock),
    });
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/*                                Slide-over UI                               */
/* -------------------------------------------------------------------------- */

function CartDrawer({
  lines,
  totalItems,
  subtotal,
  isOpen,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onClear,
}: {
  lines: CartLine[];
  totalItems: number;
  subtotal: number;
  isOpen: boolean;
  onClose: () => void;
  onUpdateQuantity: (variantId: string, quantity: number) => void;
  onRemoveItem: (variantId: string) => void;
  onClear: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Empêche le défilement de l'arrière-plan quand le panneau est ouvert.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-text/40 transition-opacity",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        inert={!isOpen}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-surface transition-transform duration-200",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="cart-drawer-title" className="text-base font-semibold text-text">
            {`Mon panier (${totalItems})`}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer le panier"
            className="tap-target flex items-center justify-center rounded-lg text-text-muted focus-visible:focus-ring hover:bg-surface-alt"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="flex flex-1 items-center p-4">
            <EmptyState
              className="w-full border-0 bg-transparent py-6"
              icon={<ShoppingCart className="size-6" />}
              title="Votre panier est vide"
              description="Parcourez nos catégories pour trouver vos produits préférés."
              actionLabel="Voir les produits"
              actionHref="/categories"
            />
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-4">
              {lines.map((line) => {
                const atMaxStock = line.quantity >= line.max_stock;
                return (
                  <li key={line.variant_id} className="flex gap-3 py-4">
                    <Link
                      href={`/products/${line.slug}`}
                      onClick={onClose}
                      className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-alt"
                    >
                      {line.image_url ? (
                        <Image
                          src={line.image_url}
                          alt={line.name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex size-full items-center justify-center text-text-muted"
                        >
                          <ShoppingCart className="size-5" />
                        </span>
                      )}
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Link
                        href={`/products/${line.slug}`}
                        onClick={onClose}
                        className="text-sm font-medium text-text hover:text-primary focus-visible:focus-ring"
                      >
                        {line.name}
                      </Link>
                      {line.variant_label ? (
                        <p className="text-xs text-text-muted">{line.variant_label}</p>
                      ) : null}
                      <p className="text-sm font-semibold text-primary">
                        {formatPrice(line.unit_price)}
                      </p>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Diminuer la quantité de ${line.name}`}
                            disabled={line.quantity <= 1}
                            onClick={() =>
                              onUpdateQuantity(line.variant_id, line.quantity - 1)
                            }
                            className="tap-target flex items-center justify-center rounded-lg border border-border text-text focus-visible:focus-ring hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Minus aria-hidden="true" className="size-4" />
                          </button>

                          <span
                            aria-live="polite"
                            className="min-w-8 text-center text-sm font-medium text-text"
                          >
                            <span className="sr-only">Quantité : </span>
                            {line.quantity}
                          </span>

                          <button
                            type="button"
                            aria-label={`Augmenter la quantité de ${line.name}`}
                            disabled={atMaxStock}
                            title={
                              atMaxStock
                                ? `Stock maximum : ${line.max_stock}`
                                : undefined
                            }
                            onClick={() =>
                              onUpdateQuantity(line.variant_id, line.quantity + 1)
                            }
                            className="tap-target flex items-center justify-center rounded-lg border border-border text-text focus-visible:focus-ring hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Plus aria-hidden="true" className="size-4" />
                          </button>
                        </div>

                        <button
                          type="button"
                          aria-label={`Retirer ${line.name} du panier`}
                          onClick={() => onRemoveItem(line.variant_id)}
                          className="tap-target flex items-center justify-center rounded-lg text-danger focus-visible:focus-ring hover:bg-surface-alt"
                        >
                          <Trash aria-hidden="true" className="size-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-border bg-surface px-4 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-text-muted">Sous-total</span>
                <span className="text-lg font-semibold text-text">
                  {formatPrice(subtotal)}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Frais de livraison calculés à l&apos;étape suivante. Paiement à la
                livraison uniquement.
              </p>

              <div className="mt-4 flex flex-col gap-2">
                <Link href="/checkout" onClick={onClose}>
                  <Button variant="primary" size="lg" className="w-full">
                    Commander
                  </Button>
                </Link>
                <div className="flex gap-2">
                  <Link href="/cart" onClick={onClose} className="flex-1">
                    <Button variant="outline" size="md" className="w-full">
                      Voir le panier
                    </Button>
                  </Link>
                  <Button variant="ghost" size="md" onClick={onClear}>
                    Vider
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Provider                                  */
/* -------------------------------------------------------------------------- */

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Hydratation : on part d'un panier vide côté serveur pour éviter tout
  // écart de rendu entre le HTML renvoyé et le premier rendu client.
  // La lecture du stockage local est une synchronisation avec un système
  // externe : le setState est donc légitime ici, une seule fois au montage.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (raw !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLines(sanitizeLines(JSON.parse(raw) as unknown));
      }
    } catch (error) {
      console.error(
        "Impossible de lire le panier enregistré dans le stockage local.",
        error
      );
      window.localStorage.removeItem(CART_STORAGE_KEY);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Persistance : uniquement une fois le panier hydraté, sinon on écraserait
  // les données existantes avec un panier vide.
  useEffect(() => {
    if (!isHydrated) return;
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
    } catch (error) {
      console.error("Impossible d'enregistrer le panier.", error);
    }
  }, [lines, isHydrated]);

  // Fermeture du panneau avec la touche Échap.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const addItem = useCallback((line: CartLine) => {
    setLines((current) => {
      // Article indisponible : on refuse l'ajout plutôt que d'ignorer le stock.
      if (line.max_stock < 1) return current;

      const index = current.findIndex(
        (existing) => existing.variant_id === line.variant_id
      );

      if (index === -1) {
        return [
          ...current,
          { ...line, quantity: clampQuantity(line.quantity, line.max_stock) },
        ];
      }

      const existing = current[index];
      const next = current.slice();
      next[index] = {
        ...line,
        quantity: clampQuantity(
          existing.quantity + line.quantity,
          line.max_stock
        ),
      };
      return next;
    });
  }, []);

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setLines((current) =>
      current.flatMap((line) => {
        if (line.variant_id !== variantId) return [line];
        return [
          { ...line, quantity: clampQuantity(quantity, line.max_stock) },
        ];
      })
    );
  }, []);

  const removeItem = useCallback((variantId: string) => {
    setLines((current) =>
      current.filter((line) => line.variant_id !== variantId)
    );
  }, []);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const totalItems = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines]
  );

  const subtotal = useMemo(
    () => calculateSubtotal(lines),
    [lines]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      isHydrated,
      totalItems,
      subtotal,
      isOpen,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      openCart,
      closeCart,
    }),
    [
      lines,
      isHydrated,
      totalItems,
      subtotal,
      isOpen,
      addItem,
      updateQuantity,
      removeItem,
      clear,
      openCart,
      closeCart,
    ]
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <CartDrawer
        lines={lines}
        totalItems={totalItems}
        subtotal={subtotal}
        isOpen={isOpen}
        onClose={closeCart}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeItem}
        onClear={clear}
      />
    </CartContext.Provider>
  );
}