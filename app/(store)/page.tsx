import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  MapPin,
  Package,
  Truck,
  Wallet,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  listFeaturedProducts,
  listPopularProducts,
  listProducts,
  type ProductWithRelations,
} from "@/lib/data/products";
import { listCategoryTree } from "@/lib/data/categories";
import { listActiveDeliveryZones } from "@/lib/data/delivery-zones";
import { getSettings } from "@/lib/data/admin/settings";
import { FALLBACK_SITE_NAME, getSiteName } from "@/lib/data/site";
import { formatPrice } from "@/lib/services/pricing";
import { buildBreadcrumbList, buildOrganization } from "@/lib/domain/jsonld";
import { JsonLd } from "@/components/seo/json-ld";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProductCardGrid } from "@/components/product/product-card";
import { CategoryCarousel } from "@/components/store/category-carousel";

export const revalidate = 0;

const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

const CONTACT_PHONE = process.env.NEXT_PUBLIC_CONTACT_PHONE?.trim() ?? "";

export async function generateMetadata(): Promise<Metadata> {
  const siteName = await getSiteName();
  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: `${siteName} — Achat en ligne à Niamey, paiement à la livraison` },
    description:
      "Achetez en ligne à Niamey : meubles, vêtements, chaussures, parfums et accessoires. Paiement à la livraison, livraison dans les principaux quartiers de Niamey.",
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "fr_NE",
      siteName,
      url: SITE_URL,
      title: `${siteName} — Achat en ligne à Niamey`,
      description:
        "Paiement à la livraison et livraison dans les principaux quartiers de Niamey.",
    },
  };
}

const VALUE_PROPS = [
  {
    id: "payment",
    icon: Wallet,
    title: "Paiement à la livraison",
    description:
      "Vous ne payez qu'une fois votre commande reçue, en espèces, directement au livreur.",
  },
  {
    id: "delivery",
    icon: Truck,
    title: "Livraison à Niamey",
    description:
      "Nos livreurs interviennent dans les principaux quartiers de Niamey. Les frais dépendent de votre zone.",
  },
  {
    id: "phone",
    icon: Phone,
    title: "Commande par téléphone",
    description:
      "Pas à l'aise avec le web ? Passez commande par téléphone, nous prenons note de tout.",
  },
  {
    id: "stock",
    icon: ShieldCheck,
    title: "Stock disponible",
    description:
      "Vérifiez la disponibilité en temps réel avant de commander.",
  },
];

function ProductSection({
  title,
  description,
  products,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  products: ProductWithRelations[];
  href: string;
  linkLabel: string;
}) {
  return (
    <section aria-labelledby={`section-${href.replace(/\W/g, "")}`} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id={`section-${href.replace(/\W/g, "")}`}
            className="text-xl font-bold text-text sm:text-2xl"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        </div>
        {products.length > 0 ? (
          <Link href={href}>
            <Button variant="outline" size="md">
              {linkLabel}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          </Link>
        ) : null}
      </div>

      {products.length > 0 ? (
        <ProductCardGrid products={products} />
      ) : (
        <EmptyState
          icon={<Package aria-hidden="true" className="size-6" />}
          title="Aucun produit dans cette sélection pour le moment"
          description="Nous préparons de nouveaux arrivages. Revenez bientôt ou parcourez nos catégories."
          actionLabel="Voir toutes les catégories"
          actionHref="/categories"
        />
      )}
    </section>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [categoryTree, featured, settings, deliveryZones, cheapest] =
    await Promise.all([
      listCategoryTree(),
      listFeaturedProducts(8),
      getSettings(),
      listActiveDeliveryZones(),
      // Prix le plus bas du catalogue : affiché tel quel dans le hero.
      listProducts({ sort: "price_asc", limit: 1 }),
    ]);
  const minPrice = cheapest[0]?.price ?? null;
  // Les produits déjà en avant ne doivent pas réapparaître dans la section
  // « Les plus demandés » : l'exclusion est faite dans la requête SQL.
  const popular = await listPopularProducts(
    8,
    featured.map((product) => product.id)
  );

  // Message de refus du middleware (tentative d'accès à un espace interdit).
  const query = (await searchParams) ?? {};
  const erreurParam = query.erreur;
  const erreurMessage =
    typeof erreurParam === "string"
      ? erreurParam
      : Array.isArray(erreurParam)
        ? erreurParam[0]
        : undefined;

  const organizationJsonLd = buildOrganization({
    name: settings.company_name || FALLBACK_SITE_NAME,
    url: SITE_URL,
    logoUrl: `${SITE_URL}/images/logo.jpeg`,
    telephone: settings.company_phone || CONTACT_PHONE || null,
    email: settings.company_email || null,
    address: {
      streetAddress: settings.company_address || null,
      addressLocality: "Niamey",
      addressCountry: "NE",
    },
  });

  const homeBreadcrumbJsonLd = buildBreadcrumbList(
    [{ name: "Accueil", href: "/" }],
    SITE_URL
  );

  return (
    <div className="flex flex-col gap-16">
      <JsonLd data={[organizationJsonLd, homeBreadcrumbJsonLd]} />

      {erreurMessage ? (
        <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6">
          <Alert variant="warning" title="Accès refusé">
            {erreurMessage}
          </Alert>
        </div>
      ) : null}

      {/* HERO */}
      <section
        className="relative overflow-hidden bg-gradient-to-br from-primary-dark via-primary to-primary-light"
        aria-labelledby="hero-title"
      >
        {/* Ambiances décoratives (or + teal) — purement visuelles. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-secondary/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-24 size-80 rounded-full bg-primary-light/40 blur-3xl"
        />
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            {/* Contenu */}
            <div className="flex flex-col gap-6">
              <p
                className="inline-flex w-fit items-center gap-2 rounded-full border border-secondary/30 bg-secondary/15 px-4 py-1.5 text-sm font-semibold text-secondary-light"
                data-aos="fade-up"
              >
                <Sparkles aria-hidden="true" className="size-4 text-secondary" />
                Boutique en ligne — Niamey
              </p>
              <h1
                id="hero-title"
                className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl"
                data-aos="fade-up"
                data-aos-delay="100"
              >
                Achetez chez vous,{" "}
                <span className="text-secondary-light">payez à la livraison</span>
              </h1>
              <p
                className="max-w-xl text-base leading-relaxed text-primary-100 sm:text-lg"
                data-aos="fade-up"
                data-aos-delay="200"
              >
                Meubles, vêtements, chaussures, parfums et accessoires sélectionnés
                pour la vie quotidienne. Livraison dans les principaux quartiers de
                Niamey.
              </p>
              <div
                className="flex flex-wrap gap-3"
                data-aos="fade-up"
                data-aos-delay="300"
              >
                <Link
                  href="/categories"
                  className="tap-target inline-flex items-center justify-center gap-2 rounded-lg bg-secondary px-6 py-3 text-base font-semibold text-primary-dark shadow-lg transition-all hover:bg-secondary-light focus-visible:focus-ring"
                >
                  Découvrir le catalogue
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                {CONTACT_PHONE ? (
                  <Link
                    href={`tel:${CONTACT_PHONE}`}
                    className="tap-target inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/10 px-6 py-3 text-base font-medium text-white transition-all hover:bg-white/20 focus-visible:focus-ring"
                  >
                    <Phone aria-hidden="true" className="mr-2 size-4" />
                    Commander par téléphone
                  </Link>
                ) : (
                  <Link
                    href="/search?q="
                    className="tap-target inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/10 px-6 py-3 text-base font-medium text-white transition-all hover:bg-white/20 focus-visible:focus-ring"
                  >
                    Rechercher un produit
                  </Link>
                )}
              </div>
            </div>

            {/* Visuel */}
            <div
              className="relative hidden lg:block"
              data-aos="fade-left"
              data-aos-delay="200"
            >
              <div className="relative mx-auto aspect-square max-w-md">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-secondary/25 to-transparent" />
                <div className="absolute inset-4 flex items-center justify-center rounded-2xl border border-white/15 bg-white/10">
                  <Package className="size-32 text-secondary/60" />
                </div>
                {minPrice !== null ? (
                  <div className="absolute -bottom-4 -right-4 rounded-2xl border border-border bg-surface p-4 shadow-lg">
                    <p className="text-xs font-medium text-text-muted">
                      À partir de
                    </p>
                    <p className="text-lg font-bold text-primary">
                      {formatPrice(minPrice)}
                    </p>
                  </div>
                ) : null}
                <div className="absolute -left-4 -top-4 rounded-2xl border border-border bg-surface p-4 shadow-lg">
                  <p className="text-xs font-medium text-text-muted">Livraison</p>
                  <p className="text-lg font-bold text-success">24-48h</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CATÉGORIES */}
      <section
        aria-labelledby="titre-categories"
        className="mx-auto w-full max-w-7xl px-4 sm:px-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div data-aos="fade-up">
            <h2 id="titre-categories" className="text-xl font-bold text-text sm:text-2xl">
              Nos catégories
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Choisissez une famille pour affiner votre recherche.
            </p>
          </div>
          <Link href="/categories" data-aos="fade-up" data-aos-delay="100">
            <Button variant="outline" size="md">
              Toutes les catégories
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          </Link>
        </div>

        {categoryTree.length > 0 ? (
          <CategoryCarousel categories={categoryTree} />
        ) : (
          <EmptyState
            className="mt-6"
            icon={<Package aria-hidden="true" className="size-6" />}
            title="Catégories indisponibles"
            description="Le catalogue ne peut pas être chargé pour le moment. Merci de réessayer dans quelques instants."
          />
        )}
      </section>

      {/* Sélection de la boutique */}
      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <ProductSection
          title="Sélection de la boutique"
          description="Les produits mis en avant par notre équipe."
          products={featured}
          href="/categories"
          linkLabel="Voir tout le catalogue"
        />
      </section>

      {/* ZONES DE LIVRAISON — données réelles de `delivery_zones` */}
      <section className="bg-primary" aria-labelledby="titre-zones">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="flex flex-col items-center gap-2 text-center" data-aos="fade-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-secondary/15 px-4 py-1.5 text-sm font-semibold text-secondary-light">
              <Truck aria-hidden="true" className="size-4" />
              Livraison à Niamey
            </p>
            <h2 id="titre-zones" className="text-2xl font-bold text-white sm:text-3xl">
              Zones desservies à Niamey
            </h2>
            <p className="max-w-2xl text-sm text-primary-100 sm:text-base">
              Les frais de livraison sont calculés selon votre zone et affichés
              avant la validation de votre commande.
            </p>
          </div>

          {deliveryZones.length > 0 ? (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {deliveryZones.map((zone, index) => (
                <li
                  key={zone.id}
                  className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-secondary/40"
                  data-aos="fade-up"
                  data-aos-delay={index * 50}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold text-white">{zone.name}</h3>
                    <span className="text-sm font-bold text-secondary-light">
                      {formatPrice(zone.fee)}
                    </span>
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {zone.quarters.map((quarter) => (
                      <li
                        key={quarter}
                        className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-primary-100"
                      >
                        {quarter}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-center text-sm text-primary-100">
              Les zones de livraison sont en cours de configuration. Contactez-nous
              pour confirmer la livraison dans votre quartier.
            </p>
          )}

          <p className="mt-6 text-center text-sm text-primary-100">
            Votre quartier n&apos;apparaît pas ? Contactez-nous : nous confirmons la
            livraison avant votre commande.
          </p>
        </div>
      </section>

      {/* Populaires / Nouveautés */}
      <section className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <ProductSection
          title="Les plus demandés"
          description="Les produits récemment ajoutés et disponibles en stock."
          products={popular}
          href="/search?q="
          linkLabel="Rechercher un produit"
        />
      </section>

      {/* Pourquoi commander chez nous ? */}
      <section
        aria-labelledby="titre-atouts"
        className="border-t border-border bg-surface-alt"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
          <h2
            id="titre-atouts"
            className="text-center text-xl font-bold text-text sm:text-2xl"
            data-aos="fade-up"
          >
            Pourquoi commander chez nous ?
          </h2>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VALUE_PROPS.map((prop, index) => (
              <li
                key={prop.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
                data-aos="fade-up"
                data-aos-delay={index * 100}
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-secondary/15 text-secondary-dark">
                  <prop.icon aria-hidden="true" className="size-6" />
                </div>
                <h3 className="text-base font-semibold text-text">{prop.title}</h3>
                <p className="text-sm leading-relaxed text-text-muted">{prop.description}</p>
              </li>
            ))}
          </ul>

          <p
            className="mt-8 flex items-start gap-2 text-sm text-text-muted"
            data-aos="fade-up"
          >
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Livraison à Niamey et communes voisines. Les frais de port sont affichés
              avant la validation de votre commande, selon votre quartier.
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
