import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  MapPin,
  Package,
  Truck,
  Wallet,
  Heart,
  ShieldCheck,
} from "lucide-react";
import { getProductBySlug, listRelatedProducts } from "@/lib/data/products";
import { getAvailableStock } from "@/lib/services/inventory";
import { formatPrice } from "@/lib/services/pricing";
import { buildBreadcrumbList, buildProduct } from "@/lib/domain/jsonld";
import { JsonLd } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";
import { ProductCardGrid } from "@/components/product/product-card";
import { PurchasePanel } from "@/app/(store)/products/[slug]/purchase-panel";
import { ShareButton } from "@/components/store/share-button";

export const revalidate = 0;

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return { title: "Produit introuvable" };
  }

  const title = product.seo_title || product.name;
  const description =
    product.seo_description ||
    product.description.slice(0, 160) ||
    `Achetez ${product.name} à Niamey. Paiement à la livraison.`;
  const imageUrl = product.images[0]?.url ?? null;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: "website",
      locale: "fr_NE",
      title: `${title} | ISF NAF-CHOPOP`,
      description,
      url: `${SITE_URL}/products/${product.slug}`,
      ...(imageUrl ? { images: [{ url: imageUrl, alt: product.name }] } : {}),
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) notFound();

  const related = await listRelatedProducts(product.category_id, 4, product.id);
  const available = getAvailableStock({
    stock_on_hand: product.stock_on_hand,
    stock_reserved: product.stock_reserved,
  });

  const breadcrumb = [
    { name: "Accueil", href: "/" },
    { name: "Catégories", href: "/categories" },
    ...(product.category
      ? [
          {
            name: product.category.name,
            href: `/categories/${product.category.slug}`,
          },
        ]
      : []),
    { name: product.name, href: `/products/${product.slug}` },
  ];

  const productJsonLd = buildProduct({
    name: product.name,
    description:
      product.seo_description || product.description || product.name,
    imagePath: product.images[0]?.url ?? null,
    siteUrl: SITE_URL,
    path: `/products/${product.slug}`,
    price: product.price,
    compareAtPrice: product.compare_at_price,
    availability: available > 0 ? "in_stock" : "out_of_stock",
    sku: product.sku,
  });

  const breadcrumbJsonLd = buildBreadcrumbList(breadcrumb, SITE_URL);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6">
      <JsonLd data={[productJsonLd, breadcrumbJsonLd]} />

      {/* Fil d'Ariane */}
      <nav aria-label="Fil d'Ariane">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-text-muted">
          <li>
            <Link href="/" className="hover:text-primary">
              Accueil
            </Link>
          </li>
          <ChevronRight aria-hidden="true" className="size-4" />
          <li>
            <Link href="/categories" className="hover:text-primary">
              Catégories
            </Link>
          </li>
          {product.category ? (
            <>
              <ChevronRight aria-hidden="true" className="size-4" />
              <li>
                <Link
                  href={`/categories/${product.category.slug}`}
                  className="hover:text-primary"
                >
                  {product.category.name}
                </Link>
              </li>
            </>
          ) : null}
          <ChevronRight aria-hidden="true" className="size-4" />
          <li aria-current="page" className="font-medium text-text">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Galerie */}
        <div className="flex flex-col gap-4" data-aos="fade-right">
          <div className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-surface-alt shadow-card">
            {product.images[0] ? (
              <Image
                src={product.images[0].url}
                alt={product.images[0].alt_text || product.name}
                fill
                priority
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-alt to-surface-warm text-text-muted/40"
              >
                <Package className="size-16" />
                <span className="text-sm font-medium">ISF NAF-CHOPOP</span>
              </span>
            )}

            {/* Badges sur l'image */}
            <div className="absolute left-3 top-3 flex flex-col gap-2">
              {product.is_new ? (
                <Badge variant="info" className="shadow-sm">
                  Nouveau
                </Badge>
              ) : null}
              {product.compare_at_price && product.compare_at_price > product.price ? (
                <Badge variant="danger" className="shadow-sm">
                  Promotion
                </Badge>
              ) : null}
            </div>

            {/* Bouton favori */}
            <button
              type="button"
              aria-label="Ajouter aux favoris"
              className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-surface/90 text-text-muted shadow-sm backdrop-blur-sm transition-all hover:text-danger"
            >
              <Heart className="size-5" />
            </button>
          </div>

          {/* Thumbnails */}
          {product.images.length > 1 ? (
            <ul className="grid grid-cols-5 gap-2">
              {product.images.slice(0, 5).map((image) => (
                <li key={image.id}>
                  <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-surface-alt transition-all hover:border-primary-light">
                    <Image
                      src={image.url}
                      alt={image.alt_text || product.name}
                      fill
                      sizes="120px"
                      className="object-cover"
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Informations et achat */}
        <div className="flex flex-col gap-6" data-aos="fade-left">
          <div className="flex flex-col gap-3">
            {product.category && (
              <Link
                href={`/categories/${product.category.slug}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {product.category.name}
              </Link>
            )}
            <h1 className="text-2xl font-bold leading-tight text-text sm:text-3xl">
              {product.name}
            </h1>

            {product.is_featured ? (
              <div>
                <Badge variant="info">Produit mis en avant</Badge>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Price
                amount={product.price}
                compareAtPrice={product.compare_at_price}
                size="lg"
              />
              {product.compare_at_price &&
              product.compare_at_price > product.price ? (
                <Badge variant="danger">Promotion</Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-text-muted">
                Prix en francs CFA (XOF). Le montant est confirmé par téléphone avant
                toute expédition.
              </p>
              <ShareButton
                title={product.name}
                text={`${product.name} — ${formatPrice(product.price)}, paiement à la livraison à Niamey.`}
                url={`${SITE_URL}/products/${product.slug}`}
                variant="ghost"
              />
            </div>
          </div>

          <PurchasePanel
            productId={product.id}
            productName={product.name}
            slug={product.slug}
            availableStock={available}
            lowStockThreshold={product.low_stock_threshold}
            variants={product.variants.map((variant) => ({
              id: variant.id,
              sku: variant.sku,
              attributes: variant.attributes,
              price: variant.price,
              compareAtPrice: variant.compare_at_price,
              availableStock: getAvailableStock({
                stock_on_hand: variant.stock_on_hand,
                stock_reserved: variant.stock_reserved,
              }),
            }))}
            imageUrl={product.images[0]?.url ?? null}
          />

          {/* Réassurance */}
          <ul className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-alt/50 p-5">
            <li className="flex items-start gap-3 text-sm text-text-muted">
              <Wallet aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Paiement à la livraison : vous réglez en espèces au livreur, après
                réception de votre commande.
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm text-text-muted">
              <Truck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Livraison dans les principaux quartiers de Niamey. Les frais de port sont
                calculés selon votre quartier avant la validation.
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm text-text-muted">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Nous vous appelons pour confirmer la disponibilité et préciser un
                repère précis dans votre quartier.
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm text-text-muted">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                Produit vérifié et garanti. En cas de problème, nous trouvons une
                solution ensemble.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Description */}
      <section aria-labelledby="titre-description" className="space-y-4">
        <h2 id="titre-description" className="text-lg font-semibold text-text">
          Description
        </h2>
        <Card>
          <CardContent className="space-y-3">
            {product.description
              .split(/\n{2,}/)
              .filter((paragraph) => paragraph.trim().length > 0)
              .map((paragraph, index) => (
                <p key={index} className="text-sm leading-relaxed text-text-muted">
                  {paragraph.trim()}
                </p>
              ))}
          </CardContent>
        </Card>
      </section>

      {/* Informations techniques */}
      {product.weight_kg || product.sku ? (
        <section aria-labelledby="titre-infos" className="space-y-4">
          <h2 id="titre-infos" className="text-lg font-semibold text-text">
            Informations
          </h2>
          <Card>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <p className="text-sm text-text-muted">
                <span className="font-medium text-text">Référence : </span>
                {product.sku}
              </p>
              {product.weight_kg ? (
                <p className="text-sm text-text-muted">
                  <span className="font-medium text-text">Poids : </span>
                  {`${product.weight_kg} kg`}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {/* Produits associés */}
      {related.length > 0 ? (
        <section aria-labelledby="titre-associes" className="space-y-6">
          <h2 id="titre-associes" className="text-lg font-semibold text-text">
            Produits associés
          </h2>
          <ProductCardGrid products={related} />
        </section>
      ) : (
        <EmptyState
          icon={<Package aria-hidden="true" className="size-6" />}
          title="Aucun produit associé"
          description="Il n'y a pas encore d'autres articles dans cette catégorie."
          actionLabel="Voir la catégorie"
          actionHref={product.category ? `/categories/${product.category.slug}` : "/categories"}
        />
      )}

      <p className="text-xs text-text-muted">
        Prix affiché : {formatPrice(product.price)}. Frais de livraison calculés à
        l&apos;étape de la commande.
      </p>
    </div>
  );
}
