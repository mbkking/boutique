/**
 * Normalisation des saisies de zones de livraison.
 *
 * Volontairement sans dépendance serveur : la même fonction sert à valider dans
 * le navigateur et à valider dans l'action serveur, donc elle est testable
 * seule. Le navigateur améliore le retour immédiat, le serveur fait foi.
 */

/**
 * Séparateurs acceptés pour une liste de quartiers.
 *
 * L'administrateur saisit une zone dans une seule zone de texte : acceptons la
 * virgule, le point-virgule et le retour à la ligne, dans cet ordre d'usage
 * local. N'imposer qu'un seul séparateur produirait des refus sur des
 * saisies par ailleurs parfaitement légitimes.
 */
const SEPARATORS = /[,;\n\r]+/;

/**
 * Clé de comparaison d'un quartier.
 *
 * Minuscules, accents retirés. Un quartier saisi au téléphone est très
 * vraisemblablement orthographié sans accent : « Aeroport » et « Aéroport »
 * désignent le même endroit et doivent partager une seule ligne de frais.
 * Sans cette normalisation, l'administrateur créerait par inadvertance deux
 * zones concurrentes pour le même quartier.
 */
function comparisonKey(quarter: string): string {
  return quarter
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .trim();
}

/**
 * Transforme une saisie texte en tableau de quartiers normalisé.
 *
 * - coupe chaque entrée et retire les espaces résiduels ;
 * - retire les doublons, en conservant l'ordre de saisie, qui correspond à
 *   l'ordre de lecture naturel de la zone ;
 * - ne compare pas la casse ni les accents : "Plateau" et "plateau" désignent
 *   le même quartier, et les garder en double ferait apparaître deux lignes de
 *   frais dans le checkout pour un même quartier.
 */
export function parseQuartersInput(input: string | null | undefined): string[] {
  if (!input) return [];

  const seen = new Set<string>();
  const quarters: string[] = [];

  for (const raw of input.split(SEPARATORS)) {
    const quarter = raw.trim();
    if (quarter === "") continue;

    const key = comparisonKey(quarter);
    if (seen.has(key)) continue;

    seen.add(key);
    quarters.push(quarter);
  }

  return quarters;
}

/**
 * Jointe un tableau de quartiers pour l'afficher dans une zone de texte.
 *
 * L'inverse de `parseQuartersInput`, pour que l'édition d'une zone existante
 * ne reformate pas silencieusement la saisie de l'administrateur.
 */
export function formatQuartersForInput(quarters: readonly string[] | null | undefined): string {
  if (!quarters || quarters.length === 0) return "";
  return quarters.join(", ");
}

/**
 * Bornes de frais acceptables.
 *
 * Le maximum est une garde-fou, pas une règle métier : au-delà, il s'agit
 * presque toujours d'une saisie erronée — un point décimal oublié après avoir
 * tapé le montant, par exemple. Un frais de 250 000 FCFA à Niamey est déjà
 * hors norme.
 */
export const MIN_ZONE_FEE = 0;
export const MAX_ZONE_FEE = 100_000;

/** Nombre de quartiers maximum pour une zone, garde-fou contre la saisie abusive. */
export const MAX_QUARTERS_PER_ZONE = 100;