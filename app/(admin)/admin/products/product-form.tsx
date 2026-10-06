"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { createProductAction } from "@/lib/actions/admin/catalog";
import { uploadProductImageAction, type UploadMimeType } from "@/lib/actions/admin/images";
import {
  ImagePreparationError,
  prepareImageForUpload,
  type PreparedImage,
} from "@/lib/images/compress";
import { sanitizeSlug } from "@/lib/data/sanitize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Emplacements visuels : 1 à 3.
 *
 * Le minimum est une règle de gestion, pas une contrainte technique : la
 * suppression du dernier visuel est autorisée côté serveur, mais la création
 * d'une fiche sans aucune image produit une page de vente vide. Le formulaire
 * de création l'impose donc, la fiche produit affiche l'avertissement.
 */
const MIN_IMAGES = 1;

const ACCEPTED = ".jpg,.jpeg,.png,.webp,.avif";

import { MAX_IMAGE_BYTES, MAX_PRODUCT_IMAGES } from "@/lib/services/images";

interface SelectedImage {
  prepared: PreparedImage;
  preview: string;
}

interface ProductFormProps {
  categories: Array<{ id: string; name: string }>;
  /**
   * Affiche le formulaire dès le rendu au lieu du bouton « Nouveau produit ».
   * Utilisé par la page `/admin/products/new`, qui n'a pas d'autre contenu.
   */
  defaultOpen?: boolean;
}

/** Extrait le contenu base64 d'un fichier, pour l'action serveur. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

/**
 * Création d'un produit : références, prix, stock et visuels.
 *
 * Le stock saisi est envoyé à la création. Il n'est pas écrit sur le produit
 * mais sur la variante par défaut créée dans la même opération : le panier et
 * la commande n'acceptent qu'une `variant_id`, un produit sans variante était
 * donc invendable. Les images sont téléversées juste après : elles réutilisent
 * l'action d'upload existante, qui contrôle le type réel des octets et la
 * taille.
 */
export function ProductForm({ categories, defaultOpen = false }: ProductFormProps) {
  const router = useRouter();
  // `slotInputs` : un input caché par emplacement, pour que « Remplacer »
  // puisse viser un emplacement précis au lieu d'ajouter un nouvel emplacement.
  const slotInputs = useRef<Array<HTMLInputElement | null>>([]);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isPending, startTransition] = useTransition();
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [images, setImages] = useState<SelectedImage[]>([]);

  function handleNameChange(value: string) {
    setName(value);
    // Tant que le slug n'est pas saisi à la main, il suit le nom.
    if (!slugTouched) setSlug(sanitizeSlug(value));
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(sanitizeSlug(value));
  }

  function freeSlot(preview: string) {
    setImages((current) => {
      const stale = current.find((image) => image.preview === preview);
      if (stale) URL.revokeObjectURL(stale.preview);
      return current.filter((image) => image.preview !== preview);
    });
  }

  /**
   * Prépare un fichier puis le place dans `slot`.
   *
   * La compression est faite ici, avant l'envoi : une photo de smartphone
   * dépasse presque toujours la limite de 5 Mo du serveur, et un refus sec
   * serait inutile. L'emplacement visé est respecté : remplacer l'image 2 ne
   * décale pas les suivantes.
   */
  async function prepareIntoSlot(file: File, slot: number) {
    setError(null);
    setIsPreparing(true);

    try {
      const prepared = await prepareImageForUpload(file);

      if (prepared.finalBytes > MAX_IMAGE_BYTES) {
        setError("Image trop lourde : 5 Mo maximum.");
        return;
      }

      const preview = URL.createObjectURL(prepared.file);

      setImages((current) => {
        const stale = current[slot];
        if (stale) URL.revokeObjectURL(stale.preview);

        const next = [...current];
        next[slot] = { prepared, preview };
        return next.filter((image): image is SelectedImage => image !== undefined);
      });
    } catch (cause) {
      setError(
        cause instanceof ImagePreparationError
          ? cause.message
          : `« ${file.name} » : lecture du fichier impossible.`
      );
    } finally {
      setIsPreparing(false);
    }
  }

  function removeImage(index: number) {
    freeSlot(images[index]?.preview ?? "");
  }

  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (index < 0 || index >= images.length || target < 0 || target >= images.length) {
      return;
    }

    setImages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function reset() {
    for (const image of images) URL.revokeObjectURL(image.preview);
    setImages([]);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setError(null);
    setCreated(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreated(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const compareAt = String(form.get("compareAtPrice") ?? "").trim();
    const stock = String(form.get("stockOnHand") ?? "0").trim();
    const threshold = String(form.get("lowStockThreshold") ?? "5").trim();
    const weight = String(form.get("weightKg") ?? "").trim();

    const payload = {
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      sku: String(form.get("sku") ?? ""),
      // La catégorie est obligatoire ici, et le formulaire est `noValidate` :
  // l'absence est renvoyée au serveur, qui la refuse avec un message
  // nommant le champ.
  categoryId: String(form.get("categoryId") ?? ""),
      description: String(form.get("description") ?? ""),
      shortDescription: String(form.get("shortDescription") ?? ""),
      price: Number.parseInt(String(form.get("price") ?? "0"), 10),
      compareAtPrice: compareAt === "" ? null : Number.parseInt(compareAt, 10),
      isActive: form.get("isActive") === "on",
      isFeatured: form.get("isFeatured") === "on",
      stockOnHand: Number.isFinite(Number.parseInt(stock, 10))
        ? Number.parseInt(stock, 10)
        : 0,
      lowStockThreshold: Number.isFinite(Number.parseInt(threshold, 10))
        ? Number.parseInt(threshold, 10)
        : 5,
      weightKg: weight === "" ? undefined : Number.parseFloat(weight) || undefined,
      seoTitle: String(form.get("seoTitle") ?? ""),
      seoDescription: String(form.get("seoDescription") ?? ""),
    };

    if (images.length < MIN_IMAGES) {
      setError(
        "Ajoutez au moins une image : une fiche produit sans visuel n'a pas de page de vente exploitable."
      );
      return;
    }

    const selected = [...images];
    const productName = String(form.get("name") ?? "");

    startTransition(async () => {
      const result = await createProductAction(payload);

      if (!result.success) {
        setError(result.error);
        return;
      }

      // Les visuels partent après la création : ils ont besoin de l'identifiant
      // du produit pour être rangés dans le bon dossier de stockage.
      const failures: string[] = [];

      for (const [index, image] of selected.entries()) {
        const uploaded = await uploadProductImageAction({
          productId: result.id,
          // Le nom et le type suivent le format réellement envoyé : le serveur
          // refuse une extension incohérente avec le contenu détecté.
          fileName: image.prepared.fileName,
          mimeType: image.prepared.mimeType as UploadMimeType,
          size: image.prepared.finalBytes,
          content: await readAsBase64(image.prepared.file),
          altText: productName,
          isPrimary: index === 0,
        });

        if (!uploaded.success) {
          failures.push(`${image.prepared.fileName} : ${uploaded.error}`);
        }
      }

      formElement.reset();
      reset();
      setIsOpen(false);

      const createdMessage =
        failures.length === 0
          ? "Produit créé."
          : `Produit créé, mais ${failures.length} image(s) n'ont pas pu être envoyées : ${failures.join(" ; ")}`;
      setCreated(createdMessage);
      router.refresh();
      // La page dédiée n'a rien d'autre à afficher : on renvoie vers la liste.
      // La confirmation voyage dans l'URL, sinon elle mourrait avec ce
      // composant au moment de la navigation — l'utilisateur ne verrait jamais
      // si ses visuels sont partis.
      if (defaultOpen) {
        router.push(
          `/admin/products?${new URLSearchParams({ created: createdMessage })}`
        );
      }
    });
  }

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-2">
        {created ? (
          <Alert variant={created.startsWith("Produit créé.") ? "success" : "warning"}>
            {created}
          </Alert>
        ) : null}
        <Button variant="primary" onClick={() => setIsOpen(true)} className="w-fit">
          <Plus aria-hidden="true" className="size-4" />
          Nouveau produit
        </Button>
      </div>
    );
  }

  return (
    <Card>
      {/* Pas de titre ici : la page `/admin/products/new` porte déjà le titre
          « Nouveau produit », et le répéter produisait deux niveaux de titre
          identiques pour la même page. */}
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          {error ? <Alert variant="danger">{error}</Alert> : null}

          {/* ---------------- Références ---------------- */}
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold text-gray-900">
              Références
            </legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nom du produit"
                name="name"
                required
                value={name}
                onChange={(event) => handleNameChange(event.target.value)}
              />

              <Input
                label="SKU (référence interne unique)"
                name="sku"
                required
                hint="Exemple : MEU-CHA-001 — doit être unique."
              />

              <Input
                label="Slug (URL)"
                name="slug"
                required
                value={slug}
                onChange={(event) => handleSlugChange(event.target.value)}
                hint="Généré depuis le nom, modifiable."
              />

              <div className="flex flex-col gap-1.5">
                <label htmlFor="categoryId" className="text-sm font-medium text-text">
                  Catégorie
                </label>
                <select
                  id="categoryId"
                  name="categoryId"
                  required
                  defaultValue=""
                  className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                >
                  <option value="">Sélectionnez une catégorie</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>

          {/* ---------------- Prix ---------------- */}
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold text-gray-900">Prix</legend>

            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Prix de vente (XOF)"
                name="price"
                type="number"
                min={0}
                required
              />
              <Input
                label="Ancien prix (facultatif)"
                name="compareAtPrice"
                type="number"
                min={0}
                hint="Doit être supérieur au prix de vente."
              />
              <Input
                label="Poids (kg, facultatif)"
                name="weightKg"
                type="number"
                min={0}
                step="0.01"
              />
            </div>
          </fieldset>

          {/* ---------------- Stock ---------------- */}
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold text-gray-900">Stock</legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Stock disponible"
                name="stockOnHand"
                type="number"
                min={0}
                defaultValue={0}
                required
                hint="Enregistré sur la variante créée avec le produit : c'est cette valeur qui autorise la vente."
              />
              <Input
                label="Seuil d'alerte"
                name="lowStockThreshold"
                type="number"
                min={0}
                defaultValue={5}
                hint="Une alerte apparaît sous cette quantité."
              />
            </div>
          </fieldset>

          {/* ---------------- Visuels ---------------- */}
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold text-gray-900">
              Images ({MIN_IMAGES} à {MAX_PRODUCT_IMAGES})
            </legend>

            {/* Un input par emplacement : « Remplacer » vise une image précise
                au lieu d'ajouter un nouvel emplacement. */}
            {Array.from({ length: MAX_PRODUCT_IMAGES }, (_, slot) => (
              <input
                key={slot}
                ref={(element) => {
                  slotInputs.current[slot] = element;
                }}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void prepareIntoSlot(file, slot);
                }}
              />
            ))}

            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: MAX_PRODUCT_IMAGES }, (_, slot) => {
                const image = images[slot];

                return (
                  <li
                    key={image?.preview ?? `emplacement-${slot}`}
                    className="relative flex h-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-surface-alt"
                  >
                    {image ? (
                      <>
                        {/* Aperçu local : URL d'objet, jamais envoyée au serveur. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.preview}
                          alt={image.prepared.fileName}
                          className="h-full w-full object-cover"
                        />
                        {slot === 0 ? (
                          <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                            Principale
                          </span>
                        ) : null}

                        <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={slot === 0 || isPreparing}
                              onClick={() => moveImage(slot, -1)}
                              aria-label={`Déplacer l'image ${slot + 1} avant`}
                              className="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 disabled:opacity-40"
                            >
                              <ArrowLeft aria-hidden="true" className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={slot === images.length - 1 || isPreparing}
                              onClick={() => moveImage(slot, 1)}
                              aria-label={`Déplacer l'image ${slot + 1} après`}
                              className="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 disabled:opacity-40"
                            >
                              <ArrowRight aria-hidden="true" className="size-3.5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={isPreparing}
                              onClick={() => slotInputs.current[slot]?.click()}
                              aria-label={`Remplacer l'image ${slot + 1}`}
                              className="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 disabled:opacity-40"
                            >
                              <RefreshCw
                                aria-hidden="true"
                                className="size-3.5"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeImage(slot)}
                              aria-label={`Retirer l'image ${slot + 1}`}
                              className="rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                            >
                              <X aria-hidden="true" className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isPreparing}
                        onClick={() => slotInputs.current[slot]?.click()}
                        className="bg-transparent"
                      >
                        <ImagePlus aria-hidden="true" className="size-4" />
                        {slot === images.length ? "Ajouter une image" : "Emplacement libre"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>

            {isPreparing ? (
              <p className="flex items-center gap-2 text-xs text-text-muted">
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                Compression des visuels en cours…
              </p>
            ) : (
              <p className="text-xs text-text-muted">
                JPEG, PNG, WebP ou AVIF — 5 Mo par image, compressées avant envoi. La
                première image devient l&apos;image principale ; utilisez les flèches pour
                changer l&apos;ordre d&apos;affichage.
              </p>
            )}
          </fieldset>

          {/* ---------------- Description ---------------- */}
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold text-gray-900">Description</legend>

            <Textarea
              label="Description courte"
              name="shortDescription"
              rows={2}
              placeholder="Résumé affiché sur la carte catalogue"
            />
            <Textarea
              label="Description"
              name="description"
              rows={5}
              required
              hint="Séparez les paragraphes par une ligne vide."
            />
          </fieldset>

          {/* ---------------- Référencement et options ---------------- */}
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-semibold text-gray-900">
              Référencement et options
            </legend>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Titre SEO (facultatif)"
                name="seoTitle"
                placeholder="Titre pour les moteurs de recherche"
              />
              <Input
                label="Méta-description SEO (facultatif)"
                name="seoDescription"
                placeholder="Description pour les moteurs de recherche"
              />
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm text-text">
                <input type="checkbox" name="isActive" defaultChecked className="size-4" />
                Actif (visible en boutique)
              </label>
              <label className="flex items-center gap-2 text-sm text-text">
                <input type="checkbox" name="isFeatured" className="size-4" />
                Mis en avant
              </label>
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" isLoading={isPending} loadingLabel="Création">
              {isPending ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : null}
              Créer le produit
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                reset();
                setIsOpen(false);
              }}
            >
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
