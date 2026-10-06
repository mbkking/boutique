"use client";

import { useSyncExternalStore } from "react";
import {
  getSpaceFromHost,
  isSpaceEnforced,
  type Space,
} from "@/lib/auth/space";

export interface ClientSpace {
  space: Space;
  /** Séparation stricte active (port/sous-domaine dédié) ? */
  enforced: boolean;
}

const subscribe = () => () => {};

/** `window.location.host` ne bouge pas pendant la vie de la page. */
let cachedHost: string | null = null;
let cachedValue: ClientSpace | null = null;

function readHost(): ClientSpace | null {
  const host = window.location.host;
  if (cachedHost !== host) {
    cachedHost = host;
    cachedValue = {
      space: getSpaceFromHost(host),
      enforced: isSpaceEnforced(host),
    };
  }
  // Référence stable : React comparerait sinon deux objets distincts à
  // chaque lecture et bouclerait sur un nouveau rendu.
  return cachedValue;
}

function readServer(): ClientSpace | null {
  return null;
}

/**
 * Espace courant côté navigateur (`null` avant hydratation).
 *
 * Le HTML serveur et le premier rendu client sont identiques dans tous les
 * cas : l'espace n'est connu qu'après montage, donc aucun écart
 * d'hydratation n'est possible. Utilisé pour masquer le chrome public
 * (header/footer boutique) dans les espaces admin/livreur.
 */
export function useSpace(): ClientSpace | null {
  return useSyncExternalStore(subscribe, readHost, readServer);
}
