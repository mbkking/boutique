"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";
import {
  createCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/admin/catalog";
import {
  deleteCategoryImageAction,
  uploadCategoryImageAction,
  type UploadMimeType,
} from "@/lib/actions/admin/images";
import {
  ImagePreparationError,
  prepareImageForUpload,
  type PreparedImage,
} from "@/lib/images/compress";
import { MAX_IMAGE_BYTES } from "@/lib/services/images";
import { sanitizeSlug } from "@/lib/data/sanitize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACCEPTED = ".jpg,.jpeg,.png,.webp,.avif";

/** Catégorie éditable, telle que renvoyée par `listAdminCategories`. */
export interface EditableCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  imageUrl: string | null;
}

interface CategoryFormProps {
  categories: Array<{ id: string; name: string }>;
  /**
   * Catégorie en cours d'édition. Absente, le formulaire sert à la création.
   */
  category?: EditableCategory | null;
  /** Rend le formulaire visible sans passer par le bouton d'ouverture. */
  defaultOpen?: boolean;
  /** Quitte le mode édition. Ignoré en création. */
  onCancelEdit?: () => void;
  /**
   * Reçoit les confirmations d'écriture.
   *
   * En modification, `onCancelEdit` referme le formulaire et le composant se
   * remonte : un message gardé dans son état local serait perdu avant d'avoir
   * été lu. Le parent, qui survit au remontage, l'affiche à la place.
   */
  onFeedback?: (message: string) => void;
}

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
 * Création et modification d'une catégorie.
 *
 * Un seul formulaire pour les deux opérations : dupliquer les champs
 * dupliquerait aussi les règles (slug unique, boucle de parentage) et les deux
 * copies divergeraient au premier correctif.
 *
 * Le visuel est envoyé après l'écriture de la catégorie, parce que le chemin
 * de stockage contient son identifiant. L'action d'upload met lui-même
 * `image_url` à jour et supprime le fichier précédent.
 */
export function CategoryForm({
  categories,
  category = null,
  defaultOpen = false,
  onCancelEdit,
  onFeedback,
}: CategoryFormProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const isEditing = category !== null;

  const [isOpen, setIsOpen] = useState(defaultOpen || isEditing);
  const [isPending, startTransition] = useTransition();
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(category?.imageUrl ?? null);
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    // Tant que le slug n'est pas saisi à la main, il suit le nom.
    if (!slugTouched) setSlug(sanitizeSlug(value));
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(sanitizeSlug(value));
  }

  function discardPrepared() {
    setPrepared(null);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function announce(message: string) {
    setFeedback(message);
    onFeedback?.(message);
  }

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Vider l'input permet de renvoyer deux fois le même fichier.
    event.target.value = "";
    if (!file) return;

    setError(null);
    setIsPreparing(true);

    try {
      // Compression avant contrôle de taille : une photo de smartphone
      // dépasse presque toujours 5 Mo, et un refus sec serait inutile.
      const next = await prepareImageForUpload(file);

      if (next.finalBytes > MAX_IMAGE_BYTES) {
        setError("Image trop lourde : 5 Mo maximum.");
        return;
      }

      discardPrepared();
      setPrepared(next);
      setPreview(URL.createObjectURL(next.file));
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

  async function sendImage(categoryId: string) {
    if (!prepared) return;

    const uploaded = await uploadCategoryImageAction({
      categoryId,
      // Le nom et le type suivent le format réellement envoyé : le serveur
      // refuse une extension incohérente avec le contenu détecté.
      fileName: prepared.fileName,
      mimeType: prepared.mimeType as UploadMimeType,
      size: prepared.finalBytes,
      content: await readAsBase64(prepared.file),
    });

    if (!uploaded.success) throw new Error(uploaded.error);
    setImageUrl(uploaded.url);
  }

  function resetCreateState() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setImageUrl(null);
    discardPrepared();
  }

  function close() {
    if (isEditing) {
      onCancelEdit?.();
      return;
    }
    setIsOpen(false);
    resetCreateState();
    setError(null);
    setFeedback(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFeedback(null);

    const form = new FormData(event.currentTarget);

    const fields = {
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      parentId: String(form.get("parentId") ?? "") || null,
      description: String(form.get("description") ?? "") || null,
      sortOrder: Number.parseInt(String(form.get("sortOrder") ?? "0"), 10) || 0,
      isActive: form.get("isActive") === "on",
    };

    // En édition, la catégorie ne peut pas être sa propre parente : on la
    // retire de la liste pour que le serveur n'ait rien à rejeter.
    startTransition(async () => {
      try {
        let targetId = category?.id ?? null;

        if (targetId) {
          const result = await updateCategoryAction({ id: targetId, ...fields });
          if (!result.success) {
            setError(result.error);
            return;
          }
        } else {
          const result = await createCategoryAction(fields);
          if (!result.success) {
            setError(result.error);
            return;
          }
          targetId = result.id;
        }

        // Le visuel part après l'écriture : le chemin de stockage contient
        // l'identifiant, inconnu avant.
        if (prepared) await sendImage(targetId);

        if (isEditing) {
          announce("Catégorie modifiée.");
          discardPrepared();
          onCancelEdit?.();
        } else {
          resetCreateState();
          setIsOpen(false);
          announce("Catégorie créée.");
        }

        router.refresh();
      } catch (cause) {
        // La catégorie est enregistrée mais le visuel a échoué : le dire
        // explicitement évite de rejouer la création et de dupliquer la ligne.
        setError(
          cause instanceof Error
            ? `Catégorie enregistrée, mais l'image n'a pas pu être envoyée : ${cause.message}`
            : "Catégorie enregistrée, mais l'image n'a pas pu être envoyée."
        );
      }
    });
  }

  async function removeImage() {
    if (!category) return;

    setError(null);
    discardPrepared();

    startTransition(async () => {
      const result = await deleteCategoryImageAction({ categoryId: category.id });

      if (!result.success) {
        setError(result.error);
        return;
      }

      setImageUrl(null);
      router.refresh();
    });
  }

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-2">
        {feedback && !onFeedback ? <Alert variant="success">{feedback}</Alert> : null}
        <Button variant="primary" onClick={() => setIsOpen(true)} className="w-fit">
          <Plus aria-hidden="true" className="size-4" />
          Nouvelle catégorie
        </Button>
      </div>
    );
  }

  const displayedImage = preview ?? imageUrl;

  // En édition, la catégorie ne peut pas être sa propre parente : on la retire
  // de la liste pour que le serveur n'ait rien à rejeter.
  const parentOptions = categories.filter((option) => option.id !== category?.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEditing ? `Modifier « ${category.name} »` : "Nouvelle catégorie"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {error ? (
            <Alert variant="danger">{error}</Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nom"
              name="name"
              required
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
            />

            <Input
              label="Slug (URL)"
              name="slug"
              required
              value={slug}
              onChange={(event) => handleSlugChange(event.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="parentId" className="text-sm font-medium text-gray-700">
                Catégorie parente
              </label>
              <select
                id="parentId"
                name="parentId"
                defaultValue={category?.parentId ?? ""}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="">Aucune (catégorie principale)</option>
                {parentOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Ordre d'affichage"
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={category?.sortOrder ?? 0}
            />
          </div>

          <Textarea
            label="Description"
            name="description"
            rows={2}
            defaultValue={category?.description ?? ""}
          />

          {/* ---------------- Visuel ---------------- */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-gray-700">Image de catégorie</span>

            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(event) => {
                void handleImageChange(event);
              }}
            />

            {displayedImage ? (
              <div className="flex items-center gap-3">
                <div className="relative h-24 w-32 overflow-hidden rounded-lg border border-border">
                  {/* Aperçu : URL d'objet locale ou visuel déjà enregistré. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={displayedImage}
                    alt={name || "Image de la catégorie"}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPreparing || isPending}
                    onClick={() => fileInput.current?.click()}
                  >
                    Remplacer
                  </Button>
                  {isEditing && imageUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => void removeImage()}
                    >
                      <X aria-hidden="true" className="size-4" />
                      Retirer
                    </Button>
                  ) : null}
                  {prepared ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={discardPrepared}
                    >
                      <X aria-hidden="true" className="size-4" />
                      Annuler le remplacement
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={isPreparing || isPending}
                onClick={() => fileInput.current?.click()}
                className="w-fit"
              >
                {isPreparing ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <ImagePlus aria-hidden="true" className="size-4" />
                )}
                Choisir une image
              </Button>
            )}

            <span className="text-xs text-text-muted">
              JPEG, PNG, WebP ou AVIF — 5 Mo maximum, compressée avant envoi.
            </span>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={category?.isActive ?? true}
              className="size-4"
            />
            Actif (visible dans le catalogue)
          </label>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isPending}
              loadingLabel={isEditing ? "Enregistrement" : "Création"}
              disabled={isPending || isPreparing}
            >
              {isEditing ? "Enregistrer" : "Créer la catégorie"}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={close}>
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}