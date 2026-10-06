/**
 * Bootstrap des comptes staff, E2E et internes.
 *
 * Idempotent : un compte existant n'est jamais dupliqué ni supprimé ; seul
 * son mot de passe est réappliqué (opération explicite via ce script).
 *
 * Variables (dans .env.local ou l'environnement, jamais commitées) :
 *   BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD
 *   BOOTSTRAP_ADMIN1_EMAIL / BOOTSTRAP_ADMIN1_PASSWORD
 *   BOOTSTRAP_DRIVER_EMAIL / BOOTSTRAP_DRIVER_PASSWORD
 *   BOOTSTRAP_CUSTOMER_EMAIL / BOOTSTRAP_CUSTOMER_PASSWORD
 *   (repli : E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD, TEST_ADMIN_EMAIL/TEST_ADMIN_PW,
 *    TEST_DRIVER_EMAIL/TEST_DRIVER_PW)
 *
 * Les noms et téléphones viennent des mêmes variables préfixées quand elles
 * existent (`BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PHONE`, …), sinon des
 * valeurs par défaut adaptées au mode.
 *
 * Aucun mot de passe n'est écrit dans ce fichier, ni affiché, ni journalisé :
 * ils ne vivent que dans l'environnement d'exécution.
 *
 * Usage :
 *   npm run bootstrap:admin
 *   npm run bootstrap:e2e-staff
 *   npm run bootstrap:internal
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env.test", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // fichier absent : on continue
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants.");
  process.exit(1);
}

function pick(...names) {
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) return v;
  }
  return "";
}

const args = new Set(process.argv.slice(2));
const wantInternal = args.has("--internal");
const wantAdmin = args.has("--admin") || (args.size === 0 && !wantInternal);
const wantDriver = args.has("--driver") || wantInternal;
const wantCustomer = args.has("--customer");

const accounts = [];

/**
 * Compte interne : tout vient de l'environnement (préfixe `BOOTSTRAP_*`),
 * avec les valeurs de repli du mode E2E pour que les deux modes restent
 * interchangeables sans duplication de configuration.
 */
function internalAccount({ role, label, prefix, fallbacks, defaults }) {
  accounts.push({
    label,
    role,
    email: pick(`${prefix}_EMAIL`, ...fallbacks.map((f) => `${f}_EMAIL`)),
    password: pick(`${prefix}_PASSWORD`, ...fallbacks.map((f) => `${f}_PASSWORD`)),
    full_name: pick(`${prefix}_NAME`) || defaults.full_name,
    phone: pick(`${prefix}_PHONE`) || defaults.phone,
  });
}

if (wantInternal) {
  internalAccount({
    role: "admin",
    label: "ADMIN",
    prefix: "BOOTSTRAP_ADMIN",
    fallbacks: ["E2E_ADMIN", "TEST_ADMIN"],
    defaults: { full_name: "ADMIN", phone: "87026842" },
  });
  internalAccount({
    role: "admin",
    label: "ADMIN1",
    prefix: "BOOTSTRAP_ADMIN1",
    fallbacks: [],
    defaults: { full_name: "ADMIN1", phone: "87026841" },
  });
  internalAccount({
    role: "driver",
    label: "LIVEUR",
    prefix: "BOOTSTRAP_DRIVER",
    fallbacks: ["TEST_DRIVER"],
    defaults: { full_name: "LIVEUR", phone: "87026843" },
  });
}

if (wantAdmin) {
  accounts.push({
    label: "admin",
    role: "admin",
    email: pick("BOOTSTRAP_ADMIN_EMAIL", "E2E_ADMIN_EMAIL", "TEST_ADMIN_EMAIL"),
    password: pick("BOOTSTRAP_ADMIN_PASSWORD", "E2E_ADMIN_PASSWORD", "TEST_ADMIN_PW"),
    full_name: pick("BOOTSTRAP_ADMIN_NAME") || "Admin Test",
    phone: pick("BOOTSTRAP_ADMIN_PHONE") || "+22790000001",
  });
}
if (wantDriver && !wantInternal) {
  accounts.push({
    label: "driver",
    role: "driver",
    email: pick("BOOTSTRAP_DRIVER_EMAIL", "TEST_DRIVER_EMAIL"),
    password: pick("BOOTSTRAP_DRIVER_PASSWORD", "TEST_DRIVER_PW"),
    full_name: pick("BOOTSTRAP_DRIVER_NAME") || "Livreur Test",
    phone: pick("BOOTSTRAP_DRIVER_PHONE") || "+22790000002",
  });
}
if (wantCustomer) {
  accounts.push({
    label: "customer",
    role: "customer",
    email: pick("BOOTSTRAP_CUSTOMER_EMAIL", "TEST_CUSTOMER_EMAIL", "E2E_CUSTOMER_EMAIL"),
    password: pick("BOOTSTRAP_CUSTOMER_PASSWORD", "TEST_CUSTOMER_PW", "E2E_CUSTOMER_PASSWORD"),
    full_name: pick("BOOTSTRAP_CUSTOMER_NAME") || "Client Test",
    phone: pick("BOOTSTRAP_CUSTOMER_PHONE") || "+22790000003",
  });
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
const provisioned = [];
for (const account of accounts) {
  const tag = account.label ?? account.role;
  if (!account.email || !account.password) {
    console.error(`[${tag}] e-mail ou mot de passe manquant : compte ignoré.`);
    failures += 1;
    continue;
  }
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.full_name, phone: account.phone },
  });
  let userId = created?.user?.id ?? null;
  let origin = "créé";

  if (createError) {
    const detail = (createError.message ?? "").toLowerCase();
    if (!/already|registered|exists/.test(detail)) {
      console.error(`[${tag}] création impossible :`, createError.message);
      failures += 1;
      continue;
    }
    // Compte déjà présent : on récupère l'utilisateur Auth existant au lieu
    // d'en créer un second. `listUsers` est paginé par tranche de 1000.
    const target = account.email.toLowerCase();
    let existing = null;
    for (let page = 1; page <= 5 && !existing; page += 1) {
      const { data: listed } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      const users = listed?.users ?? [];
      existing = users.find((u) => (u.email ?? "").toLowerCase() === target) ?? null;
      if (users.length < 1000) break;
    }
    if (!existing) {
      console.error(`[${tag}] compte existant introuvable.`);
      failures += 1;
      continue;
    }
    userId = existing.id;
    origin = "existant";
    const { error: pwError } = await supabase.auth.admin.updateUserById(userId, {
      password: account.password,
      email_confirm: true,
    });
    if (pwError) {
      console.error(`[${tag}] mot de passe non réappliqué :`, pwError.message);
      failures += 1;
      continue;
    }
  }

  const { error: roleError } = await supabase
    .from("profiles")
    .update({
      role: account.role,
      full_name: account.full_name,
      phone: account.phone,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (roleError) {
    console.error(`[${tag}] rôle non appliqué :`, roleError.message);
    failures += 1;
    continue;
  }
  console.log(`[${tag}] ${origin} : ${account.email} (role=${account.role})`);
  provisioned.push({ ...account, userId });
}

/*
 * Vérification post-bootstrap : on relit `profiles` et on contrôle ce qui
 * engage le déploiement — rôle exact, compte actif, identité et téléphone.
 * `profiles` ne porte pas l'e-mail (il reste dans Auth), la relecture se fait
 * donc par identifiant utilisateur.
 *
 * Le mot de passe n'est pas vérifiable ici : il ne doit jamais être comparé
 * ni journalisé. Sa réapplication est déjà confirmée par l'étape ci-dessus.
 */
if (provisioned.length > 0) {
  const { data: profiles, error: readError } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone, is_active")
    .in(
      "id",
      provisioned.map((account) => account.userId)
    );

  if (readError) {
    console.error(`[vérification] lecture des profils impossible : ${readError.message}`);
    failures += 1;
  } else {
    console.log("");
    console.log("Vérification des profils :");
    for (const account of provisioned) {
      const profile = (profiles ?? []).find((row) => row.id === account.userId);
      const problems = [];
      if (!profile) problems.push("profil absent");
      if (profile && profile.role !== account.role) problems.push(`role=${profile.role}`);
      if (profile && profile.is_active !== true) problems.push("inactif");
      if (profile && account.full_name && profile.full_name !== account.full_name) {
        problems.push(`nom=${profile.full_name}`);
      }
      if (profile && account.phone && profile.phone !== account.phone) {
        problems.push(`telephone=${profile.phone}`);
      }
      const line = `[${account.label ?? account.role}] ${account.email} -> ${
        profile
          ? `role=${profile.role} actif=${profile.is_active} nom=${profile.full_name} telephone=${profile.phone}`
          : "PROFIL ABSENT"
      }`;
      if (problems.length > 0) {
        console.error(`${line}  ECART : ${problems.join(", ")}`);
        failures += 1;
      } else {
        console.log(`${line}  OK`);
      }
    }
  }
}

process.exit(failures > 0 ? 1 : 0);
