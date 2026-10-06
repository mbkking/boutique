/**
 * Décision de compression d'image, indépendante du navigateur.
 *
 * La logique est isolée du canvas pour être testable : les règles de
 * sélection (ne jamais dégrader, ne jamais agrandir, ne jamais convertir à
 * l'aveugle une image transparente) sont le cœur du correctif, pas la
 * mécanique d'encodage.
 */

/** Plafond dur appliqué par la validation serveur. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Cible d'encodage. Volontairement très inférieur au plafond serveur : une
 * photo de smartphone pèse facilement 4 à 6 Mo, et un envoi en 4G depuis Niamey
 * doit rester acceptable. Le visuel catalogue n'a aucun besoin de plus.
 */
export const TARGET_IMAGE_BYTES = 1_200_000;

/** Côté maximal du carré de redimensionnement. */
export const MAX_IMAGE_EDGE = 1600;

/** Qualité JPEG/WebP de départ, diminuée jusqu'à la cible. */
export const START_QUALITY = 0.82;
export const MIN_QUALITY = 0.5;
export const QUALITY_STEP = 0.1;

/** Types acceptés en sortie, alignés sur la validation serveur. */
export const OUTPUT_MIME_TYPES = ["image/webp", "image/jpeg"] as const;

export type OutputMimeType = (typeof OUTPUT_MIME_TYPES)[number];

export interface EncodedCandidate {
  /** Poids en octets de l'encodage. */
  bytes: number;
  mimeType: OutputMimeType;
  extension: string;
}

export type CompressionDecision =
  | { kind: "keep-original"; reason: string }
  | { kind: "use-encoded"; candidate: EncodedCandidate; reason: string; savedBytes: number };

/**
 * Formats tentés dans l'ordre.
 *
 * WebP passe en premier parce qu'il gère la transparence : un logo ou une
 * capture d'écran en PNG ne perd pas son fond transparent, contrairement à un
 * passage en JPEG qui le remplacerait par du noir.
 */
export const OUTPUT_PREFERENCE: ReadonlyArray<OutputMimeType> = ["image/webp", "image/jpeg"];

/**
 * Types qui transportent un canal alpha.
 *
 * Un JPEG ne sait pas les représenter : encoder une image transparente en
 * JPEG revient à repeindre son fond. La liste sert à interdire ce passage
 * plutôt qu'à choisir un format au hasard.
 */
export const TRANSPARENT_MIME_TYPES: ReadonlyArray<string> = [
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];

export const MIME_EXTENSION: Record<OutputMimeType, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/** Le type MIME d'origine peut-il porter de la transparence ? */
export function mayHaveAlpha(sourceMimeType: string): boolean {
  return TRANSPARENT_MIME_TYPES.includes(sourceMimeType.toLowerCase());
}

/**
 * Choisit entre le fichier d'origine et les encodages produits.
 *
 * Règle cardinale : la compression ne doit jamais dégrader le visuel. Si le
 * meilleur encodage pèse autant ou plus que l'original — cas d'un PNG déjà
 * optimisé, ou d'une image compressée deux fois — l'original est renvoyé tel
 * quel avec le type MIME d'origine, ce qui évite aussi une conversion de
 * format inutile.
 *
 * Le second filtre est tout aussi important : une source transparente ne
 * peut pas partir en JPEG. Ce n'est pas une question de poids, mais de
 * fidélité — sans ce filtre, un JPEG plus léger écraserait le WebP et
 * repeindrait le fond transparent.
 */
export function chooseImageOutput(input: {
  originalBytes: number;
  candidates: readonly EncodedCandidate[];
  sourceMimeType?: string;
}): CompressionDecision {
  const keepsAlpha = input.sourceMimeType ? mayHaveAlpha(input.sourceMimeType) : false;

  const usable = input.candidates.filter(
    (candidate) =>
      candidate.bytes > 0 &&
      candidate.bytes < input.originalBytes &&
      // Un JPEG ne sait pas rendre un canal alpha : on l'écarte dès la
      // sélection, pas après coup.
      !(keepsAlpha && candidate.mimeType === "image/jpeg"),
  );

  if (usable.length === 0) {
    return {
      kind: "keep-original",
      reason: "Aucun encodage n'est plus léger que le fichier d'origine.",
    };
  }

  // Le plus léger l'emporte. À poids égal, on respecte l'ordre de préférence
  // (WebP avant JPEG) : évite de ré-encoder inutilement un format déjà bon.
  const rank = (candidate: EncodedCandidate) =>
    OUTPUT_PREFERENCE.indexOf(candidate.mimeType);

  const best = usable.reduce((champion, candidate) => {
    if (candidate.bytes !== champion.bytes) {
      return candidate.bytes < champion.bytes ? candidate : champion;
    }
    return rank(candidate) < rank(champion) ? candidate : champion;
  });

  return {
    kind: "use-encoded",
    candidate: best,
    reason: "Encodage allégé avant envoi.",
    savedBytes: input.originalBytes - best.bytes,
  };
}

/**
 * Prochain niveau de qualité à essayer.
 *
 * Retourne `null` quand la qualité minimale est atteinte : au-delà, réduire
 * encore dégraderait visiblement le visuel pour un gain marginal.
 */
export function nextQuality(current: number): number | null {
  const next = Number((current - QUALITY_STEP).toFixed(2));
  return next < MIN_QUALITY ? null : next;
}

/**
 * Dimension de sortie, sans jamais agrandir.
 *
 * Un visuel de 320 px envoyé depuis mobile reste en 320 px : l'agrandissement
 * coûterait des octets sans rien ajouter à l'affichage.
 */
export function targetEdge(width: number, height: number, maxEdge = MAX_IMAGE_EDGE): {
  width: number;
  height: number;
} {
  const longest = Math.max(width, height);

  if (longest <= maxEdge) return { width, height };

  const ratio = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** L'encodage obtenu tient-il dans le budget visé ? */
export function isWithinBudget(bytes: number, target = TARGET_IMAGE_BYTES): boolean {
  return bytes <= target;
}

/**
 * Le fichier reste-t-il acceptable pour le serveur ?
 *
 * Retourne un message prêt à afficher, ou `null` si le fichier part.
 */
export function rejectionReason(bytes: number): string | null {
  if (bytes > MAX_IMAGE_BYTES) {
    const mb = (bytes / 1024 / 1024).toFixed(1);
    return `Image trop lourde même après compression (${mb} Mo). Maximum : 5 Mo.`;
  }
  return null;
}

/**
 * Remplace l'extension d'un nom de fichier.
 *
 * Le serveur déduit une partie du chemin de stockage de l'extension et
 * vérifie la cohérence type MIME / extension : envoyer un nom `.jpg` avec un
 * contenu WebP serait refusé.
 */
export function renameToExtension(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  return `${base || "image"}.${extension}`;
}