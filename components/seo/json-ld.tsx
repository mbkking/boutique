import { buildGraph } from "@/lib/domain/jsonld";

/**
 * Rendu des données structurées JSON-LD.
 *
 * L'échappement est le point critique : une description de produit contenant
 * `<` ou `&` — ou un guillemet droit — casserait le `<script>` et permettrait
 * d'injecter du balisage arbitraire dans la page. Remplacer `<` par son
 * échappement JSON suffit à rendre le contenu inerte, tout en laissant le
 * lecteur de JSON-LD recevoir exactement la chaîne voulue.
 */

interface JsonLdProps {
  /** Un nœud unique, ou plusieurs nœuds réunis dans un `@graph`. */
  data: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>;
}

/**
 * Sérialise pour un `<script type="application/ld+json">`.
 *
 * `&` est échappé en premier : sans cet ordre, les `&` introduits par le
 * remplacement de `<` seraient eux-mêmes ré-échappés, et le lecteur JSON-LD
 * recevrait la séquence littérale au lieu du caractère.
 */
function serialize(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}

export function JsonLd({ data }: JsonLdProps) {
  const value: Record<string, unknown> = Array.isArray(data)
    ? buildGraph(data as ReadonlyArray<Record<string, unknown>>)
    : (data as Record<string, unknown>);

  return (
    <script
      type="application/ld+json"
      // Le contenu vient de `serialize()` : aucun caractère ne peut fermer le
      // script ni être interprété comme du balisage.
      dangerouslySetInnerHTML={{ __html: serialize(value) }}
    />
  );
}