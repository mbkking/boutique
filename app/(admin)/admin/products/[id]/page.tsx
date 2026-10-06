import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { guardPage } from "@/lib/auth/guard";
import { PERMISSIONS, can } from "@/lib/auth/permissions";
import { getAdminProductDetail } from "@/lib/data/admin/product-detail";
import { listAdminCategories } from "@/lib/data/admin/catalog";
import { formatPrice } from "@/lib/services/pricing";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductEditForm } from "@/app/(admin)/admin/products/[id]/product-edit-form";
import { VariantManager } from "@/app/(admin)/admin/products/[id]/variant-manager";
import { ProductImageManager } from "@/app/(admin)/admin/products/[id]/product-image-manager";

export const metadata = {
  title: "Modifier le produit",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface AdminProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProductPage({ params }: AdminProductPageProps) {
  const { id } = await params;
  const profile = await guardPage([PERMISSIONS.PRODUCT_READ]);

  const [product, categories] = await Promise.all([
    getAdminProductDetail(id),
    listAdminCategories(),
  ]);

  if (!product) notFound();

  const canWrite = can(profile.role, PERMISSIONS.PRODUCT_WRITE);
  const canWriteVariants = can(profile.role, PERMISSIONS.VARIANT_WRITE);

  // Le stock n'est éditable ici que pour un produit à une variante. Au-delà,
  // le total affiché serait la somme de plusieurs stocks : le saisir écraserait
  // une variante au hasard, alors que chacune a son propre réglage.
  const variantCount = product.variants.length;
  const singleVariantStock =
    variantCount === 1 ? product.variants[0].stockOnHand : variantCount === 0 ? 0 : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/products"
        className="inline-flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Retour aux produits
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
        <p className="text-sm text-gray-500">
          {[
            product.sku,
            `/${product.slug}`,
            product.categoryName ?? "Sans catégorie",
            product.isActive ? "actif" : "archivé",
          ].join(" · ")}
        </p>
      </header>

      {canWrite ? (
        <ProductEditForm
          product={product}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
          }))}
          singleVariantStock={singleVariantStock}
          variantCount={variantCount}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm text-gray-700">{product.description}</p>
            <p className="mt-3 text-lg font-bold text-gray-900">
              {formatPrice(product.price)}
            </p>
          </CardContent>
        </Card>
      )}

      {canWrite ? (
        <ProductImageManager productId={product.id} initialImages={product.images} />
      ) : null}

      <VariantManager
        productId={product.id}
        variants={product.variants}
        canWrite={canWriteVariants}
      />
    </div>
  );
}