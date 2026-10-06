/**
 * Assainissement des entrées utilisateur.
 *
 * Ce module est volontairement dépourvu de toute dépendance serveur : il est
 * importé aussi bien par des Server Components que par des composants clients,
 * afin que la validation perçue à la saisie soit exactement la même que celle
 * appliquée par la couche serveur.
 *
 * Règle absolue : ces fonctions nettoient, elles n'autorisent pas. La décision
 * d'accepter une valeur appartient toujours au serveur.
 */
const MAX_SEARCH_WORDS = 6;

/**
 * Nettoie une saisie utilisateur destinée à un filtre `ilike`.
 *
 * Seuls les lettres (accents inclus), les chiffres, les espaces et les tirets
 * sont conservés ; tout caractère de contrôle SQL (`'`, `"`, `,`, `(`, `)`, `%`,
 * `_`, `\`, `;`, `--`) est eliminated. Le résultat est toujours transmis comme
 * paramètre lié par le client Supabase, jamais concaténé dans une requête SQL.
 */
export function sanitizeSearchTerm(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Transforme une saisie en une liste de motifs `ilike` prêts à l'emploi.
 *
 * Un mot par motif, afin que les filtres restent compatibles avec la syntaxe
 * `or("col.op.valeur", ...)` de PostgREST (les espaces et séparateurs y sont
 * interdits). Retourne `[]` si la saisie ne contient aucun terme exploitable.
 */
export function buildLikePatterns(raw: string | undefined | null): string[] {
  if (!raw) return [];

  const words = sanitizeSearchTerm(raw)
    .split(" ")
    .filter((word) => word.length > 0);

  return words.slice(0, MAX_SEARCH_WORDS).map((word) => `%${word}%`);
}

/**
 * Variantes de recherche, regroupées par mot.
 *
 * `ilike` est sensible aux accents en PostgreSQL : sans ce traitement,
 * « sac a main » ne trouverait pas « sac à main », ni « deau » pas « d'eau ».
 * Chaque mot produit donc un groupe de variantes (accentuée, non accentuée,
 * sans apostrophe) ; tous les mots doivent correspondre, mais n'importe quelle
 * variante d'un mot donné suffit.
 *
 * Exemple pour « sac a main » :
 * `[["sac"], ["a"], ["main"]]`
 */
export function buildSearchTermGroups(
  raw: string | undefined | null
): string[][] {
  if (!raw) return [];

  const words = sanitizeSearchTerm(raw)
    .split(" ")
    .filter((word) => word.length > 0)
    .slice(0, MAX_SEARCH_WORDS);

  const groups: string[][] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    const stripped = lower
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['’]/g, "");

    const variants = new Set<string>([lower]);
    if (stripped) variants.add(stripped);
    // Une saisie « d'eau » se décompose aussi en « d » et « eau » : on retient
    // la forme la plus longue pour ne pas élargir inutilement la requête.
    if (stripped !== lower && stripped.length >= lower.length - 1) {
      variants.add(stripped);
    }

    groups.push([...variants]);
  }

  return groups;
}

/**
 * Ne conserve que les caractères autorisés dans un slug, pour un filtre `eq`.
 *
 * Les séparateurs (espaces, underscores, séparateurs de dossier) deviennent des
 * tirets : sans cela, « Sac à main » produirait le slug `sacmain`, moins lisible
 * et moins favorable au référencement qu'un `sac-a-main`.
 */
export function sanitizeSlug(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    // Espaces et séparateurs → tirets.
    .replace(/[\s_/\\]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    // Tirets répétés ou en bord de chaîne.
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}
