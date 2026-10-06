/**
 * Isolation des sessions par application.
 *
 * Problème réel : les cookies sont partagés par **hôte**, pas par port. Les
 * trois applications tournant sur `localhost` (ports 3000/3002/3003), un cookie
 * de session écrit par l'admin écrasait celui du livreur : les deux espaces ne
 * pouvaient pas être connectés en même temps.
 *
 * Solution : chaque application donne à ses cookies de session un nom qui lui
 * est propre (`...-auth-token-client`, `...-auth-token-admin`,
 * `...-auth-token-driver`). Le nom est lu dans la variable
 * `NEXT_PUBLIC_SESSION_SCOPE`, définie par le fichier `.env.local` de chaque
 * application.
 *
 * La valeur reste dérivée de l'URL du projet Supabase : deux applications
 * partageant le même projet utilisent le même préfixe, seul le suffixe de
 * portée change. Aucun secret n'est impliqué : seul le nom du cookie change.
 */

import { PUBLIC_CONFIG } from "@app-config/env";

export type SessionScope = "client" | "admin" | "driver";

/** Portée utilisée quand la variable d'environnement est absente. */
const DEFAULT_SCOPE: SessionScope = "client";

function isScope(value: string | undefined): value is SessionScope {
  return value === "client" || value === "admin" || value === "driver";
}

/** Portée de session de l'application courante. */
export function currentSessionScope(): SessionScope {
  const raw = process.env.NEXT_PUBLIC_SESSION_SCOPE ?? PUBLIC_CONFIG.sessionScope;
  return isScope(raw) ? raw : DEFAULT_SCOPE;
}

/**
 * Préfixe officiel des cookies de session Supabase.
 *
 * Il vaut `sb-<référence du projet>-auth-token`. On le reconstruit à partir de
 * l'URL du projet pour rester compatible avec les noms par défaut.
 */
export function supabaseCookieBase(url?: string): string {
  try {
    const host = new URL(url ?? PUBLIC_CONFIG.supabaseUrl).hostname.split(".")[0];
    return `sb-${host}-auth-token`;
  } catch {
    // URL absente ou invalide : le nom exact importe peu, l'isolation reste
    // assurée par le suffixe.
    return "sb-project-auth-token";
  }
}

/**
 * Nom du cookie de session pour une portée donnée.
 *
 * Exemple : `sb-abcdefghijkl-auth-token-admin`.
 */
export function sessionCookieName(
  scope: SessionScope = currentSessionScope(),
  url?: string
): string {
  return `${supabaseCookieBase(url ?? process.env.NEXT_PUBLIC_SUPABASE_URL)}-${scope}`;
}

/**
 * Options communes aux cookies de session.
 *
 * `sameSite=lax` et `secure` seulement en HTTPS : en local, `secure` True
 * empêcherait le cookie d'être envoyé sur `http://localhost`.
 */
export function sessionCookieOptions(): {
  name: string;
  path: string;
  sameSite: "lax";
  secure: boolean;
  httpOnly: boolean;
} {
  return {
    name: sessionCookieName(),
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  };
}