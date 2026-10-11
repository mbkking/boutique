/**
 * Route de l'application `client`, ré-exportée depuis le code partagé.
 *
 * Source : `(store)\products\[slug]\opengraph-image.tsx` (dépôt racine).
 *
 * Les exports de configuration (`size`, `contentType`, `alt`, `runtime`) sont
 * déclarés ici car Next les lit statiquement, au niveau du fichier de route.
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Aperçu du produit";

export { default } from "@repo/app/(store)/products/[slug]/opengraph-image";
