"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import {
  uploadProductImageAction,
  replaceProductImageAction,
  deleteProductImageAction,
  reorderProductImagesAction,
  type UploadMimeType,
} from "@/lib/actions/admin/images";
import { MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES } from "@/lib/services/images";
import {
  ImagePreparationError,
  prepareImageForUpload,
} from "@/lib/images/compress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

/** Taille maximale alignee sur la validation serveur. */
const MAX_BYTES = MAX_IMAGE_BYTES;

const ACCEPTED = ".jpg,.jpeg,.png,.webp,.avif";

export interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
}

export interface ProductImageManagerProps {
  productId: string;
  initialImages: ProductImage[];
}

/** Convertit un fichier en base64, l'action attendant du JSON et non un formulaire. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Conversion du fichier impossible."));
        return;
      }
      // On retire le préfixe `data:` ; seule la charge utile est transmise.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Gestion des visuels produit.
 *
 * L'image principale est la premiere de la liste : c'est elle qui apparait sur
 * la carte catalogue et sert de repli dans les resultats de recherche. La
 * position est donc une donnee metier, pas une preference d'affichage.
 */
export function ProductImageManager({
  productId,
  initialImages,
}: ProductImageManagerProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ProductImage[]>(initialImages);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPreparing, setIsPreparing] = useState(false);
  // Un seul input pour l'ajout et le remplacement : `null` ajoute, un
  // identifiant remplace le visuel visé.
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  function refresh(next: ProductImage[]) {
    setImages(next);
    router.refresh();
  }

  function openFilePicker(targetId: string | null) {
    setReplaceTargetId(targetId);
    fileInputRef.current?.click();
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Vider l'input permet de renvoyer deux fois le meme fichier.
    event.target.value = "";
    if (!file) return;

    const targetId = replaceTargetId;
    setReplaceTargetId(null);

    setError(null);
    setIsPreparing(true);

    try {
      // Compression avant contrôle de taille : une photo de smartphone
      // dépasse presque toujours 5 Mo, et un refus sec serait inutile.
      const prepared = await prepareImageForUpload(file);

      if (prepared.finalBytes > MAX_BYTES) {
        setError("Image trop lourde : 5 Mo maximum.");
        return;
      }

      const content = await toBase64(prepared.file);
      const filePayload = {
        // Le nom et le type suivent le format réellement envoyé : le serveur
        // refuse une extension incohérente avec le contenu détecté.
        fileName: prepared.fileName,
        mimeType: prepared.mimeType as UploadMimeType,
        size: prepared.finalBytes,
        content,
      };

      if (targetId) {
        const replaced = await replaceProductImageAction({
          productId,
          imageId: targetId,
          ...filePayload,
        });

        if (!replaced.success) {
          setError(replaced.error);
          return;
        }

        // Seul l'URL change : le rang et le statut principal sont conservés.
        refresh(
          images.map((image) =>
            image.id === targetId ? { ...image, url: replaced.url } : image
          )
        );
        return;
      }

      const result = await uploadProductImageAction({
        productId,
        ...filePayload,
        altText: null,
        isPrimary: images.length === 0,
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      refresh([
        ...images,
        {
          id: result.imageId,
          url: result.url,
          altText: null,
          sortOrder: images.length,
        },
      ]);
    } catch (cause) {
      // Le détail technique aide l'administrateur (et le support) au lieu
      // d'un message générique qui ne dit pas quoi réessayer.
      setError(
        cause instanceof ImagePreparationError
          ? cause.message
          : `Lecture du fichier impossible (${cause instanceof Error && cause.message ? cause.message : "erreur inconnue"}).`
      );
    } finally {
      setIsPreparing(false);
    }
  }

  function handleDelete(imageId: string) {
    startTransition(async () => {
      setError(null);
      const result = await deleteProductImageAction({ productId, imageId });

      if (!result.success) {
        setError(result.error);
        return;
      }
      refresh(images.filter((image) => image.id !== imageId));
    });
  }

  function handleMove(imageId: string, direction: -1 | 1) {
    const index = images.findIndex((image) => image.id === imageId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= images.length) return;

    const reordered = [...images];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

    setImages(reordered.map((image, sortOrder) => ({ ...image, sortOrder })));
    setError(null);

    startTransition(async () => {
      const result = await reorderProductImagesAction({
        productId,
        imageIds: reordered.map((image) => image.id),
      });

      if (!result.success) {
        setError(result.error);
        refresh(images);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visuels</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error ? <Alert variant="danger">{error}</Alert> : null}

        {images.length === 0 ? (
          <p className="text-sm text-text-muted">
            Aucune image. Le produit s&apos;affichera avec une icone.
          </p>
        ) : (
          <ul
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
            data-testid="product-images"
          >
            {images.map((image, index) => (
              <li
                key={image.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-2"
              >
                <div className="relative aspect-square overflow-hidden rounded bg-surface-alt">
                  <Image
                    src={image.url}
                    alt={image.altText || `Visuel ${index + 1}`}
                    fill
                    sizes="(min-width: 640px) 12vw, 45vw"
                    className="object-cover"
                  />

                  {index === 0 ? (
                    <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                      <Star aria-hidden="true" className="size-3" />
                      Principale
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remonter l'image ${index + 1}`}
                    disabled={index === 0 || isPending}
                    onClick={() => handleMove(image.id, -1)}
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Descendre l'image ${index + 1}`}
                    disabled={index === images.length - 1 || isPending}
                    onClick={() => handleMove(image.id, 1)}
                  >
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remplacer l'image ${index + 1}`}
                    disabled={isPending || isPreparing}
                    onClick={() => openFilePicker(image.id)}
                  >
                    <RefreshCw aria-hidden="true" className="size-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Supprimer l'image ${index + 1}`}
                    disabled={isPending}
                    onClick={() => handleDelete(image.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-4 text-danger" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div>
          <input
            ref={fileInputRef}
            id={`image-upload-${productId}`}
            type="file"
            accept={ACCEPTED}
            onChange={handleUpload}
            disabled={isPreparing || isPending}
            className="sr-only"
          />

          <Button
            type="button"
            variant="outline"
            isLoading={isPending || isPreparing}
            disabled={images.length >= MAX_PRODUCT_IMAGES}
            onClick={() => openFilePicker(null)}
          >
            {!isPending && !isPreparing ? (
              <Upload aria-hidden="true" className="size-4" />
            ) : null}
            {isPreparing ? "Compression en cours" : "Ajouter une image"}
          </Button>

          <p className="mt-2 text-xs text-text-muted">
            {images.length >= MAX_PRODUCT_IMAGES
              ? `Trois visuels au maximum : retirez-en un pour en ajouter un autre.`
              : `JPEG, PNG, WebP ou AVIF, 5 Mo maximum (${images.length}/${MAX_PRODUCT_IMAGES}). Les photos trop lourdes sont automatiquement allégées avant l'envoi. La premiere image est la principale.`}
          </p>
        </div>

        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Enregistrement en cours
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}