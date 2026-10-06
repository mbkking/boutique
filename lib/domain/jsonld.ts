/**
 * Données structurées JSON-LD (schema.org).
 *
 * Volontairement sans dépendance serveur : la construction des objets est pure
 * et testable seule. Le rendu dans la page est fait par `JsonLd`, qui se charge
 * de l'échappement.
 *
 * Un montant en XOF est entier. Schema.org attend une chaîne pour `price` :
 * écrire le nombre ferait perdre la devise et le séparateur décimal n'a pas de
 * sens ici, un franc CFA n'a pas de subdivision en usage.
 */

export const XOF_CURRENCY = "XOF";

/** Rend une URL absolue : JSON-LD n'accepte pas les URL relatives. */
export function absoluteUrl(path: string, siteUrl: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export interface BreadcrumbItem {
  name: string;
  /** Chemin interne, par exemple `/categories/electronique`. */
  href: string;
}

/**
 * Fil d'Ariane.
 *
 * Le dernier élément n'a pas d'URL : il représente la page courante, et lui
 * donner un lien ferait remonter une hiérarchie à un seul niveau.
 */
export function buildBreadcrumbList(
  items: readonly BreadcrumbItem[],
  siteUrl: string
): Record<string, unknown> {
  const list = items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    ...(index === items.length - 1
      ? {}
      : { item: absoluteUrl(item.href, siteUrl) }),
  }));

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: list,
  };
}

export interface OrganizationInput {
  name: string;
  url: string;
  logoUrl?: string | null;
  telephone?: string | null;
  email?: string | null;
  address?: {
    streetAddress?: string | null;
    addressLocality?: string | null;
    addressCountry?: string | null;
    postalCode?: string | null;
  } | null;
  sameAs?: string[];
}

/**
 * Organisation.
 *
 * `addressCountry` est épinglé à `NE` : une boutique serveuse dans ce pays doit
 * le dire explicitement, sinon les moteurs la rattachent à une autre
 * localisation et la sortie hors de Niamey est faussée.
 */
export function buildOrganization(input: OrganizationInput): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": "Organization",
    name: input.name,
    url: input.url,
  };

  if (input.logoUrl) node.logo = input.logoUrl;
  if (input.telephone) node.telephone = input.telephone;
  if (input.email) node.email = input.email;

  if (input.address) {
    const { streetAddress, addressLocality, addressCountry, postalCode } = input.address;
    const hasAny = [streetAddress, addressLocality, addressCountry, postalCode].some(
      (value) => typeof value === "string" && value.trim() !== ""
    );

    if (hasAny) {
      node.address = {
        "@type": "PostalAddress",
        ...(streetAddress ? { streetAddress } : {}),
        addressLocality: addressLocality ?? "Niamey",
        addressCountry: addressCountry ?? "NE",
        ...(postalCode ? { postalCode } : {}),
      };
    }
  }

  if (input.sameAs && input.sameAs.length > 0) node.sameAs = input.sameAs;

  return node;
}

export interface ProductJsonLdInput {
  name: string;
  description: string;
  /** Chemin ou URL de l'image principale. */
  imagePath: string | null;
  siteUrl: string;
  path: string;
  /** Prix en XOF, entier. */
  price: number;
  /** Prix barré, s'il y a promotion. */
  compareAtPrice?: number | null;
  availability: "in_stock" | "out_of_stock" | "preorder";
  sku?: string | null;
  brand?: string | null;
}

/**
 * Produit avec son offre.
 *
 * L'offre est imbriquée dans le produit (`offers`) plutôt que décrite à côté :
 * c'est la forme attendue pour un prix unique, et c'est elle que les moteurs
 * lisent pour afficher le prix et la disponibilité.
 *
 * Une disponibilité est toujours annoncée, même « en stock » : une offre sans
 * `availability` est ignorée par les moteurs, alors qu'une disponibilité
 * explicite est exploitée pour filtrer les résultats.
 */
export function buildProduct(input: ProductJsonLdInput): Record<string, unknown> {
  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    url: absoluteUrl(input.path, input.siteUrl),
  };

  if (input.imagePath) {
    product.image = [absoluteUrl(input.imagePath, input.siteUrl)];
  }

  if (input.sku) product.sku = input.sku;
  if (input.brand) product.brand = { "@type": "Brand", name: input.brand };

  product.offers = {
    "@type": "Offer",
    url: absoluteUrl(input.path, input.siteUrl),
    priceCurrency: XOF_CURRENCY,
    price: String(Math.max(0, Math.trunc(input.price))),
    // Un prix barré n'est publié que s'il est réellement supérieur : annoncer
    // une réduction inexistante ferait écarter la page des résultats enrichis.
    ...(input.compareAtPrice && input.compareAtPrice > input.price
      ? { priceSpecification: { "@type": "UnitPriceSpecification", price: String(input.compareAtPrice) } }
      : {}),
    availability:
      input.availability === "in_stock"
        ? "https://schema.org/InStock"
        : input.availability === "preorder"
          ? "https://schema.org/PreOrder"
          : "https://schema.org/OutOfStock",
  };

  return product;
}

/**
 * Assemble plusieurs nœuds dans un graphe `@graph`.
 *
 * Préféré à plusieurs blocs `<script>` séparés : les moteurs font le lien entre
 * les nœuds par leurs identifiants, et un seul document évite que la
 * désambiguïsation « cette offre est bien celle de ce produit » échoue.
 */
export function buildGraph(
  nodes: ReadonlyArray<Record<string, unknown>>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter((node) => Object.keys(node).length > 0),
  };
}

/** Combine plusieurs valeurs en un tableau, sans entrée vide. */
export function compact(values: ReadonlyArray<unknown>): unknown[] {
  return values.filter(
    (value) => value !== null && value !== undefined && value !== ""
  );
}