"use client";

import {
  chooseImageOutput,
  isWithinBudget,
  mayHaveAlpha,
  MIME_EXTENSION,
  nextQuality,
  OUTPUT_PREFERENCE,
  rejectionReason,
  renameToExtension,
  START_QUALITY,
  targetEdge,
  type EncodedCandidate,
  type OutputMimeType,
} from "@/lib/domain/image-compression";

/**
 * Compression d'image côté navigateur.
 *
 * Les photographies de smartphone dépassent couramment la limite de 5 Mo du
 * serveur. Sans compression, l'administrateur voit un refus sec ; avec, le
 * fichier part sur un réseau mobile.
 *
 * La compression reste dans le navigateur : le serveur reçoit déjà un fichier
 * allégé et sa validation (taille, type réel détecté, extension) reste
 * identique. Elle n'est jamais une porte de sortie côté serveur.
 */

export interface PreparedImage {
  file: File;
  fileName: string;
  mimeType: string;
  /** Poids du fichier d'origine, avant compression. */
  originalBytes: number;
  /** Poids du fichier réellement envoyé. */
  finalBytes: number;
  width: number;
  height: number;
  compressed: boolean;
}

export class ImagePreparationError extends Error {}

/** Formats d'entrée acceptés, alignés sur la validation serveur. */
const INPUT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

/** Un encodage produit, conservé avec ses octets pour éviter un ré-encodage. */
interface Encoding {
  candidate: EncodedCandidate;
  blob: Blob;
}

/**
 * Décode l'image en tenant compte de l'orientation EXIF.
 *
 * Sans `imageOrientation: "from-image"`, une photo prise en portrait arrive
 * couchée sur le canvas et le visuel produit serait tourné.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Repli ci-dessous : certains navigateurs ignorent cette option.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new ImagePreparationError("Image illisible."));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function dimensionsOf(
  source: ImageBitmap | HTMLImageElement
): { width: number; height: number } {
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  return { width, height };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: OutputMimeType,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") {
      resolve(null);
      return;
    }
    canvas.toBlob(resolve, mimeType, quality);
  });
}

/**
 * Rend la source dans un canvas aux dimensions cibles.
 *
 * `flatten` décide du fond. Il ne doit être vrai que pour le JPEG : un canvas
 * non peint est transparent, et un JPEG ne sait pas encoder l'alpha — il
 * remplacerait les zones transparentes par du noir. Remplir le fond même pour
 * le WebP détruirait la transparence d'origine pour rien, puisque le WebP la
 * restitue fidèlement.
 */
function drawToCanvas(
  source: ImageBitmap | HTMLImageElement,
  edge: { width: number; height: number },
  flatten: boolean
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = edge.width;
  canvas.height = edge.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new ImagePreparationError("Compression indisponible sur cet appareil.");
  }

  if (flatten) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, edge.width, edge.height);
  }

  context.drawImage(source as CanvasImageSource, 0, 0, edge.width, edge.height);

  return canvas;
}

/**
 * Prépare un fichier pour l'envoi : redimensionnement, encodage et renommage
 * cohérent avec le format produit.
 *
 * Ne dégrade jamais : si aucun encodage n'est plus léger que l'original, le
 * fichier d'origine est renvoyé tel quel, avec son nom et son type d'origine.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  if (!INPUT_MIME_TYPES.has(file.type)) {
    throw new ImagePreparationError("Format non accepté : JPEG, PNG, WebP ou AVIF.");
  }

  const decoded = await decode(file);
  const source = dimensionsOf(decoded);

  if (!source.width || !source.height) {
    throw new ImagePreparationError("Image illisible ou dimensions nulles.");
  }

  const edge = targetEdge(source.width, source.height);
  const encodings: Encoding[] = [];

  // Une source qui peut porter de l'alpha interdit le JPEG : le passage
  // repeindrait le fond. Le WebP reste alors le seul format essayé.
  const keepsAlpha = mayHaveAlpha(file.type);

  try {
    // Les formats réellement encodables : une source transparente exclut le
    // JPEG. Le canvas n'est construit que pour eux, pour ne pas peindre un
    // fond blanc qui ne servirait à rien.
    const encodable = OUTPUT_PREFERENCE.filter(
      (mimeType) => !(keepsAlpha && mimeType === "image/jpeg"),
    );

    for (const mimeType of encodable) {
      // Un canvas par format : le fond blanc du JPEG ne doit pas contaminer
      // l'encodage WebP, qui se fait sur un canvas transparent.
      const canvas = drawToCanvas(decoded, edge, mimeType === "image/jpeg");

      let quality: number | null = START_QUALITY;

      while (quality !== null) {
        const blob = await canvasToBlob(canvas, mimeType, quality);
        if (!blob) break;

        // Un navigateur qui ne sait pas encoder le format demandé renvoie
        // silencieusement un PNG. Retenir ce blob ferait announces du WebP
        // alors que le serveur recevrait autre chose : on l'écarte.
        if (blob.type === mimeType) {
          encodings.push({
            candidate: {
              bytes: blob.size,
              mimeType,
              extension: MIME_EXTENSION[mimeType],
            },
            blob,
          });

          // Cible atteinte : inutile de dégrader davantage ce format.
          if (isWithinBudget(blob.size)) break;
        }

        quality = nextQuality(quality);
      }
    }
  } finally {
    // `ImageBitmap` doit être fermé pour libérer la mémoire du décodage ;
    // un `HTMLImageElement` n'a pas cette méthode.
    if ("close" in decoded && typeof decoded.close === "function") {
      decoded.close();
    }
  }

  const decision = chooseImageOutput({
    originalBytes: file.size,
    candidates: encodings.map((encoding) => encoding.candidate),
    sourceMimeType: file.type,
  });

  if (decision.kind === "keep-original") {
    const refusal = rejectionReason(file.size);
    if (refusal) throw new ImagePreparationError(refusal);

    return {
      file,
      fileName: file.name,
      mimeType: file.type,
      originalBytes: file.size,
      finalBytes: file.size,
      width: source.width,
      height: source.height,
      compressed: false,
    };
  }

  // Les octets sont ceux déjà mesurés : aucun ré-encodage, donc le poids
  // annoncé est exactement celui qui part au serveur.
  const chosen = encodings.find(
    (encoding) => encoding.candidate === decision.candidate
  );

  if (!chosen) {
    throw new ImagePreparationError("Compression impossible sur cet appareil.");
  }

  const { candidate, blob } = chosen;

  const refusal = rejectionReason(blob.size);
  if (refusal) throw new ImagePreparationError(refusal);

  // Le nom doit porter l'extension du format réellement envoyé, sinon la
  // vérification extension / type réel du serveur refuse le fichier.
  const fileName = renameToExtension(file.name, candidate.extension);

  return {
    file: new File([blob], fileName, {
      type: candidate.mimeType,
      lastModified: Date.now(),
    }),
    fileName,
    mimeType: candidate.mimeType,
    originalBytes: file.size,
    finalBytes: blob.size,
    width: edge.width,
    height: edge.height,
    compressed: true,
  };
}