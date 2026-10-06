"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Durée avant disparition ; 0 désactive la fermeture automatique. */
  duration: number;
}

interface ToastContextValue {
  toasts: readonly Toast[];
  push: (message: string, variant?: ToastVariant, duration?: number) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-primary-100 bg-primary-50 text-primary-dark",
};

const VARIANT_ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const DEFAULT_DURATION = 4000;

/**
 * File de notifications éphémères.
 *
 * Utilisée pour confirmer une action (« stock mis à jour ») sans faire sauter
 * la page : un message de succès qui décale la mise en page est déroutant.
 *
 * `role="status"` avec `aria-live="polite"` : l'information est annoncée sans
 * interrompre la tâche en cours.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant = "info", duration = DEFAULT_DURATION) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, message, variant, duration }]);

      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, push, dismiss }),
    [toasts, push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {toasts.map((toast) => {
        const Icon = VARIANT_ICONS[toast.variant];

        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3 shadow-lg",
              VARIANT_STYLES[toast.variant]
            )}
          >
            <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />

            <p className="flex-1 text-sm">{toast.message}</p>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Fermer la notification"
              className="-m-1 shrink-0 rounded p-1 opacity-70 hover:opacity-100"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Accès aux notifications.
 *
 * Un composant utilis hors du fournisseur ne doit pas planter : il renvoie un
 * contexte neutre et l'application continue de fonctionner.
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (context) return context;

  return { toasts: [], push: () => {}, dismiss: () => {} };
}