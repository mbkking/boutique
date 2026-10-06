import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { listAdminCategories } from "@/lib/data/admin/catalog";
import {
  CategoriesManager,
  type CategoryTreeRow,
} from "@/app/(admin)/admin/categories/categories-manager";

export const metadata = {
  title: "Catégories",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Arborescence des catégories.
 *
 * Les catégories racines d'abord, leurs enfants en dessous : la hiérarchie est
 * plate à un niveau dans l'écran, ce qui suffit à une boutique généraliste et
 * reste lisible. Le serveur refuse toute création de boucle.
 *
 * Seules les données sont préparées ici ; le formulaire et les actions de ligne
 * vivent dans `CategoriesManager`, qui doit savoir quelle ligne est éditée.
 */
export default async function AdminCategoriesPage() {
  const profile = await guardPage([PERMISSIONS.PRODUCT_READ]);

  const categories = await listAdminCategories();
  const canWrite = can(profile.role, PERMISSIONS.CATEGORY_WRITE);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Catégories</h1>
        <p className="text-sm text-gray-500">
          {`${categories.length} catégorie(s). Une catégorie ne peut pas être placée sous elle-même ni sous l'un de ses descendants.`}
        </p>
      </header>

      <CategoriesManager categories={categories as CategoryTreeRow[]} canWrite={canWrite} />
    </div>
  );
}