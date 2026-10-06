/**
 * Utilitaires purs pour les visuels produit.
 *
 * Isoles de `lib/actions/admin/images.ts` pour deux raisons : un fichier
 * `"use server"` ne peut exporter que des fonctions asynchrones, et ces
 * fonctions sont deterministes — elles meritent d'etre testees sans base de
 * donnees ni session.
 */

/** 5 Mo : au-dela, l'image ne sert pas a un produit et pese le catalogue. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Nombre de visuels par produit : 1 a 3.
 *
 * Vit ici, et pas dans `lib/actions/admin/images.ts`, pour deux raisons : un
 * fichier `"use server"` n'exporte que des fonctions asynchrones — une constante
 * importée depuis un composant client fait echouer le build — et la regle doit
 * etre lisible par l'interface comme par le serveur, sans divergence possible.
 */
export const MAX_PRODUCT_IMAGES = 3;

/** Extensions acceptees, alignees sur les types MIME. */
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"] as const;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

/**
 * Verifie qu'un fichier est reellement une image.
 *
 * Les **octets d'en-tete** (magic numbers) sont controles : un fichier renomme
 * en `.jpg` mais contenant du code ne passe pas cette verification. C'est la
 * seule facon de ne pas se fier au `type` declare par le navigateur, qui est
 * entierement controle par l'appelant.
 */
export function sniffImage(buffer: Uint8Array): ImageMime | null {
  const is = (offset: number, ...bytes: number[]): boolean =>
    bytes.every((byte, index) => buffer[offset + index] === byte);

  if (buffer.length >= 3 && is(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (buffer.length >= 8 && is(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a)) return "image/png";
  if (
    buffer.length >= 12 &&
    is(0, 0x52, 0x49, 0x46, 0x46) &&
    is(8, 0x57, 0x45, 0x42, 0x50)
  ) {
    return "image/webp";
  }
  if (
    buffer.length >= 12 &&
    is(4, 0x66, 0x74, 0x79, 0x70) &&
    is(8, 0x61, 0x76, 0x69, 0x66)
  ) {
    return "image/avif";
  }

  return null;
}

/**
 * Reconstitue un nom de fichier sur.
 *
 * Le nom d'origine est **ecarte** : seule son extension, validee contre une
 * liste blanche, est conservee. Le reste est genere aleatoirement. Un nom
 * fourni par le client ne doit jamais atteindre la cle de stockage.
 */
export function buildSafeObjectName(productId: string, originalName: string): string | null {
  const lower = originalName.toLowerCase();
  const extension = ALLOWED_EXTENSIONS.find((allowed) => lower.endsWith(allowed));

  if (!extension) return null;

  // 12 caracteres aleatoires : deux televersements du meme produit ne peuvent
  // pas produire le meme nom, meme en une milliseconde.
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

  return `${productId.slice(0, 8)}-${random}${extension}`;
}

/** Convertit une URL publique Supabase en chemin de bucket. */
export function toStoragePath(publicUrl: string): string | null {
  const marker = "/storage/v1/object/public/";
  const index = publicUrl.indexOf(marker);
  if (index === -1) return null;

  const remainder = publicUrl.slice(index + marker.length);
  const slash = remainder.indexOf("/");
  if (slash === -1) return null;

  return `${remainder.slice(0, slash)}/${remainder.slice(slash + 1)}`;
}