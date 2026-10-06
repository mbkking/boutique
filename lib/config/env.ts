/**
 * Validation des variables d'environnement (§62).
 *
 * Ce module est volontairement **sans** `server-only` : il est chargé par
 * `next.config.ts`, qui est évalué hors du graphe serveur. Il ne manipule
 * aucune valeur secrète — il vérifie des noms de variables et des formes
 * (préfixe d'une URL, structure d'un jeton) — et ne journalise que des
 * diagnostics.
 *
 * Objectif : échouer **tôt et clairement** plutôt que de laisser une page
 * afficher un état vide faute de configuration. Un secret manquant produit ici
 * un message qui nomme la variable, pas un `fetch failed` en cascade.
 */

export interface EnvIssue {
  variable: string;
  problem: string;
  /** Une variable `NEXT_PUBLIC_*` manquante est bloquante côté client. */
  blocking: boolean;
}

export interface EnvReport {
  ok: boolean;
  issues: EnvIssue[];
}

interface Rule {
  name: string;
  /** Un secret ne doit jamais être exposé au navigateur. */
  secret: boolean;
  required: boolean;
  /** Expression de contrôle de forme, appliquée à la valeur. */
  pattern?: RegExp;
  hint?: string;
}

const RULES: readonly Rule[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    secret: false,
    required: true,
    pattern: /^https:\/\/[a-z0-9-]+\.supabase\.co$/,
    hint: "Format attendu : https://<projet>.supabase.co",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    secret: false,
    required: true,
    pattern: /^eyJ/,
    hint: "Clé anonyme (anon), publiée par le client.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    secret: true,
    required: true,
    pattern: /^eyJ/,
    hint: "Clé service_role — ne doit JAMAIS être exposée au client.",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    secret: false,
    required: true,
    pattern: /^https?:\/\//,
    hint: "URL publique du site, utilisée par les métadonnées et le sitemap.",
  },
  {
    name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    secret: false,
    required: false,
    hint: "Clé publique VAPID : requise pour activer les notifications push.",
  },
  { name: "VAPID_PRIVATE_KEY", secret: true, required: false },
];

function readEnv(name: string): string | undefined {
  // `process.env` est indexé dynamiquement ici : on ne peut pas utiliser une
  // lecture statique, d'où l'accès par variable.
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Examine les variables et signale ce qui manque ou paraît incorrect. */
export function checkEnvironment(): EnvReport {
  const issues: EnvIssue[] = [];

  for (const rule of RULES) {
    const value = readEnv(rule.name);

    if (!value) {
      if (rule.required) {
        issues.push({
          variable: rule.name,
          problem: "variable absente ou vide",
          blocking: true,
        });
      }
      continue;
    }

    // Garde-fou : un secret glissé dans une variable publique est une fuite
    // anticipate. `NEXT_PUBLIC_*` est embarqué dans le bundle servi au client.
    if (!rule.secret && rule.name.startsWith("NEXT_PUBLIC_")) {
      if (/service_role|eyJ.*service_role/i.test(value)) {
        issues.push({
          variable: rule.name,
          problem:
            "semble contenir la clé service_role : une variable NEXT_PUBLIC_* est lue par tous les visiteurs",
          blocking: true,
        });
      }
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      issues.push({
        variable: rule.name,
        problem: rule.hint ? `format inattendu — ${rule.hint}` : "format inattendu",
        blocking: true,
      });
    }
  }

  return { ok: issues.every((issue) => !issue.blocking), issues };
}

/**
 * Message prêt à afficher en développement.
 *
 * Les variables listées sont des **noms**, jamais des valeurs.
 */
export function formatEnvironmentReport(report: EnvReport): string {
  if (report.issues.length === 0) {
    return "Configuration complète.";
  }

  const lines = report.issues.map(
    (issue) => `  - ${issue.variable} : ${issue.problem}`
  );

  return [
    "Configuration incomplète :",
    ...lines,
    "",
    "Copier .env.example vers .env.local puis renseigner ces variables.",
  ].join("\n");
}

/**
 * Vérifie la configuration et journalise le résultat.
 * À appeler une fois au démarrage du serveur, pas à chaque requête.
 */
export function assertEnvironment(): void {
  const report = checkEnvironment();

  if (!report.ok) {
    const message = formatEnvironmentReport(report);
    console.error(`[config] ${message}`);
    // On ne lève pas : en production, une page d'erreur est pire qu'un site
    // dégradé. Les pages gèrent déjà l'absence de base (`safeQuery`).
    return;
  }

  console.log("[config] variables d'environnement valides");
}