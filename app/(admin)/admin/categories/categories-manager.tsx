"use client";

import { useState } from "react";
import Image from "next/image";
import { FolderTree, ImageOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CategoryForm,
  type EditableCategory,
} from "@/app/(admin)/admin/categories/category-form";
import { CategoryRowActions } from "@/app/(admin)/admin/categories/category-row-actions";

export interface CategoryTreeRow extends EditableCategory {
  parentName: string | null;
  productCount: number;
}

/**
 * Arborescence des catégories, avec création et modification.
 *
 * Le composant est client parce que la page doit savoir quelle ligne est en
 * cours d'édition : le formulaire est unique et bascule entre les deux modes.
 * Le serveur ne fournit que les données, déjà filtrées par ses permissions.
 */
export function CategoriesManager({
  categories,
  canWrite,
}: {
  categories: CategoryTreeRow[];
  canWrite: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const roots = categories.filter((category) => category.parentId === null);
  const childrenOf = (parentId: string) =>
    categories.filter((category) => category.parentId === parentId);

  const edited = editingId
    ? categories.find((category) => category.id === editingId) ?? null
    : null;

  const parentOptions = categories.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}

      {canWrite ? (
        <CategoryForm
          // Le formulaire est remonté en tête de liste pendant une édition,
          // pour que les champs modifiés restent visibles sans défiler.
          categories={parentOptions}
          category={edited}
          key={edited?.id ?? "create"}
          onFeedback={setFeedback}
          onCancelEdit={() => setEditingId(null)}
        />
      ) : null}

      {categories.length === 0 ? (
        <EmptyState
          icon={<FolderTree aria-hidden="true" className="size-6" />}
          title="Aucune catégorie"
          description="Créez une première catégorie pour structurer le catalogue."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {roots.map((root) => {
            const children = childrenOf(root.id);

            return (
              <li key={root.id}>
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        {root.imageUrl ? (
                          // `relative` est indispensable : `<Image fill />` se
                          // positionne sur le premier ancêtre positionné. Sans
                          // lui, l'image s'étire sur toute la page et intercepte
                          // les clics de la liste.
                          <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
                            <Image
                              src={root.imageUrl}
                              alt=""
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-alt">
                            <ImageOff aria-hidden="true" className="size-4 text-text-muted" />
                          </div>
                        )}

                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                              {root.name}
                            </span>
                            {!root.isActive ? (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                                inactive
                              </span>
                            ) : null}
                          </div>
                          <span className="text-xs text-gray-500">
                            {`/${root.slug} · ordre ${root.sortOrder} · ${root.productCount} produit(s)`}
                          </span>
                          {root.description ? (
                            <span className="text-xs text-gray-600">{root.description}</span>
                          ) : null}
                        </div>
                      </div>

                      <CategoryRowActions
                        categoryId={root.id}
                        categoryName={root.name}
                        productCount={root.productCount}
                        childCount={children.length}
                        canWrite={canWrite}
                        onEdit={() => setEditingId(root.id)}
                      />
                    </div>

                    {children.length > 0 ? (
                      <ul className="flex flex-col gap-2 border-t border-gray-100 pt-3">
                        {children.map((child) => (
                          <li
                            key={child.id}
                            className="flex flex-wrap items-start justify-between gap-2"
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              {child.imageUrl ? (
                                <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-border">
                                  <Image
                                    src={child.imageUrl}
                                    alt=""
                                    fill
                                    sizes="56px"
                                    className="object-cover"
                                  />
                                </div>
                              ) : null}

                              <div className="flex min-w-0 flex-col">
                                <span className="text-sm text-gray-700">{child.name}</span>
                                <span className="text-xs text-gray-500">
                                  {`/${child.slug} · ${child.productCount} produit(s)${
                                    child.isActive ? "" : " · inactive"
                                  }`}
                                </span>
                              </div>
                            </div>

                            <CategoryRowActions
                              categoryId={child.id}
                              categoryName={child.name}
                              productCount={child.productCount}
                              childCount={0}
                              canWrite={canWrite}
                              onEdit={() => setEditingId(child.id)}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}