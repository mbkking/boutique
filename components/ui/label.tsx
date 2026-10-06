"use client";

/**
 * Étiquette de champ de formulaire.
 *
 * Doit toujours être fournie pour l'accessibilité.
 * Le composant génère un `id` associé si besoin.
 */
export function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  const id = htmlFor;
  return (
    <label htmlFor={id} className="text-sm font-medium text-text">
      {children}
    </label>
  );
}