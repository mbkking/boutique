import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { listAdminCategories } from "@/lib/data/admin/catalog";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductForm } from "@/app/(admin)/admin/products/product-form";

export const metadata = {
  title: "Nouveau produit",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Création d'un produit.
 *
 * La page ne contient que le formulaire existant, pas une seconde copie :
 * dupliquer les champs dupliquerait aussi les règles de validation, et les
 * deux formulaires divergeraient. Le formulaire garde son propre état et
 * renvoie vers la liste après création, où la confirmation apparaît.
 */
export default async function NewProductPage() {
  const profile = await guardPage([PERMISSIONS.PRODUCT_READ]);

  if (!can(profile.role, PERMISSIONS.PRODUCT_WRITE)) {
    return (
      <EmptyState
        title="Création indisponible"
        description="Votre rôle ne permet pas de créer de produit."
      />
    );
  }

  const categories = await listAdminCategories();

  // Sans catégorie, la création est impossible : la colonne est obligatoire.
  // Le proposer ici évite un aller-retour vers une liste de catégories vide.
  if (categories.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/admin/products"
          className="inline-flex w-fit items-center gap-1 text-sm text-gray-600 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Retour aux produits
        </Link>
        <EmptyState
          title="Aucune catégorie"
          description="Créez d'abord une catégorie : chaque produit doit être rattaché à l'une d'elles."
          actionLabel="Gérer les catégories"
          actionHref="/admin/categories"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/admin/products"
          className="inline-flex w-fit items-center gap-1 text-sm text-gray-600 hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Produits
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nouveau produit</h1>
        <p className="text-sm text-gray-500">
          {`${categories.length} catégorie${categories.length > 1 ? "s" : ""} disponible${
            categories.length > 1 ? "s" : ""
          } — l'image principale et le stock sont enregistrés avec la fiche.`}
        </p>
      </header>

      <ProductForm
        categories={categories.map((category) => ({
          id: category.id,
          name: category.name,
        }))}
        defaultOpen
      />
    </div>
  );
}