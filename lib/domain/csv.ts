/**
 * Génération d'exports CSV.
 *
 * Isolé dans le domaine pour être testable : l'échappement CSV est une
 * frontière de sécurité, pas un détail de présentation.
 */

/** Caractères qu'un tableur interprète comme le début d'une formule. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Caractères imposant l'habillage des guillemets (RFC 4180). */
const NEEDS_QUOTES = /[",\n\r;]/;

/**
 * Séquence purement arithmétique : chiffres et séparateurs usuels.
 *
 * Un numéro de téléphone international commence par `+` (format `+227 …`) et un
 * montant peut être négatif. Ni l'un ni l'autre n'est une formule, et les
 * préfixer d'une apostrophe afficherait un caractère parasite devant chaque
 * téléphone du fichier. Sans lettre, un tableur ne peut pas appeler de
 * fonction : il se limite à un calcul arithmétique sans effet de bord.
 */
const ARITHMETIC_ONLY = /^\+?[\d\s().-]+$/;

/**
 * Échappe une cellule pour un export CSV.
 *
 * Deux protections cumulées :
 *
 * 1. **Injection de formule** — une cellule commençant par `=`, `+`, `-` ou `@`
 *    est interprétée comme une formule par Excel, LibreOffice et Google Sheets.
 *    Un client nommé `=cmd|' /C calc'!A1` dans son champ « Nom » exécuterait
 *    donc du code chez l'administrateur qui ouvre l'export. Le préfixe
 *    apostrophe force le type texte.
 * 2. **Respect de la RFC 4180** — guillemets, virgules et retours à la ligne
 *    sont encadrés, les guillemets internes doublés.
 *
 * Le séparateur `;` est également traité : les tableurs configurés en locale
 * française l'utilisent comme séparateur de colonnes.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  // Un nombre ne peut pas être une formule : il est renvoyé tel quel, y
  // compris s'il est négatif (avoir, remboursement).
  if (typeof value === "number") return String(value);

  // Les deux protections sont cumulées et non alternatives : une formule
  // contient presque toujours une virgule (`=HYPERLINK("a","b")`), et
  // l'habillage des guillemets reste nécessaire après neutralisation, faute
  // de quoi la cellule se décomposerait en colonnes supplémentaires.
  let text = value;

  if (FORMULA_LEAD.test(text) && !ARITHMETIC_ONLY.test(text)) {
    text = `'${text}`;
  }

  if (NEEDS_QUOTES.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export type CsvRow = Array<string | number | null | undefined>;

/**
 * Assemble un CSV complet, préfixé du BOM UTF-8.
 *
 * Le BOM est indispensable : sans lui, Excel en locale française affiche les
 * accents et le franc CFA (`FCFA`) de façon illisible.
 */
export function toCsv(rows: CsvRow[]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}