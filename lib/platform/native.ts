/**
 * Intégrations natives de l'espace livreur.
 *
 * Deux principes :
 * - on n'assume **jamais** qu'une application est installée ;
 * - chaque action propose un repli qui fonctionne sans elle.
 *
 * Concrètement : un lien `tel:` ouvre le dialer système sur tous les téléphones ;
 * une URL de cartographie ouvre le navigateur, qui basculera vers l'application
 * si elle existe, sinon affichera le plan web.
 */

/** Construit un lien d'appel vers le client. */
export function buildTelLink(phone: string): string {
  // `tel:` n'accepte que certains caractères : on ne conserve ni espaces,
  // ni séparateurs, pour éviter un lien inerte.
  const cleaned = phone.replace(/[^\d+]/g, "");
  return `tel:${cleaned}`;
}

/** Numéro affichable, formaté par paires pour la lecture. */
export function formatPhoneForDisplay(phone: string): string {
  const national = phone.replace(/^\+?227/, "").replace(/^00227/, "").trim();

  // On ne formate que les numéros n unrellement de 8 chiffres ; tout autre
  // format est renvoyé tel quel plutôt que tronqué.
  if (!/^\d{8}$/.test(national)) return phone;

  return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

export interface NavigationOptions {
  latitude: number | null;
  longitude: number | null;
  /** Nom du lieu ou repère, utilisé comme libellé de destination. */
  label?: string;
}

/**
 * URL vers un planExternal.
 *
 * Sans coordonnées exploitables, on ne renvoie pas de lien : afficher un bouton
 * « Naviguer » qui mène nulle part est pire que de ne pas l'afficher. On
 * propose alors un lien de recherche textuel sur le nom du quartier, qui
 * fonctionne partout.
 */
export function buildNavigationUrl(
  options: NavigationOptions
): { url: string; kind: "coordinates" | "search" } | null {
  const { latitude, longitude, label } = options;

  if (hasUsableCoordinates(latitude, longitude)) {
    // Google Maps fonctionne sur le web et dans l'application : un seul lien,
    // ouvert dans le navigateur, bascule vers l'app si elle est installée.
    const query = label ? `&query=${encodeURIComponent(label)}` : "";
    return {
      url: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}${query}`,
      kind: "coordinates",
    };
  }

  if (label && label.trim() !== "") {
    return {
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`,
      kind: "search",
    };
  }

  return null;
}

/** Vérifie que des coordonnées sont réellement exploitables. */
export function hasUsableCoordinates(
  latitude: number | null,
  longitude: number | null
): boolean {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}