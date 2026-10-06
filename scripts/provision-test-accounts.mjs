/**
 * Provisionne des comptes de test (ADMIN, DRIVER, CUSTOMER) via l'API
 * d'administration Supabase.
 *
 * Usage :
 *   node scripts/provision-test-accounts.mjs \
 *     --admin-email=admin.test@exemple.ne --admin-password='...' \
 *     --driver-email=livreur.test@exemple.ne --driver-password='...' \
 *     [--customer-email=client.test@exemple.ne --customer-password='...']
 *
 * Règles :
 * - AUCUN mot de passe n'est écrit dans ce fichier ni dans Git : ils
 *   arrivent par arguments, jamais commités.
 * - Le rôle est appliqué côté serveur avec la clé service_role, jamais
 *   depuis le navigateur.
 * - Réservé au développement : ne jamais exécuter contre la production.
 *
 * Variables d'environnement requises (via .env.local chargé à la main) :
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(file, "utf8");
      for (const line of content.split("\n")) {
        const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (match && !process.env[match[1]]) {
          process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
        }
      }
      break;
    } catch {
      // Fichier absent : on continue avec l'environnement existant.
    }
  }
}

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Variables manquantes : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const accounts = [
  {
    role: "admin",
    email: argValue("admin-email"),
    password: argValue("admin-password"),
    full_name: "Admin Test",
    phone: "+22790000001",
  },
  {
    role: "driver",
    email: argValue("driver-email"),
    password: argValue("driver-password"),
    full_name: "Livreur Test",
    phone: "+22790000002",
  },
  {
    role: "customer",
    email: argValue("customer-email"),
    password: argValue("customer-password"),
    full_name: "Client Test",
    phone: "+22790000003",
  },
].filter((a) => a.email && a.password);

if (accounts.length === 0) {
  console.error("Aucun compte à créer : renseignez au moins --admin-email et --admin-password.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;

for (const account of accounts) {
  // 1. Création (ou récupération si l'e-mail existe déjà).
  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.full_name, phone: account.phone },
    });

  let userId = created?.user?.id ?? null;

  if (createError) {
    const detail = (createError.message ?? "").toLowerCase();
    const duplicate =
      detail.includes("already been registered") ||
      detail.includes("already registered") ||
      detail.includes("already exists");
    if (!duplicate) {
      console.error(`[${account.role}] création impossible :`, createError.message);
      failures += 1;
      continue;
    }
    // Compte existant : on le retrouve pour appliquer le rôle.
    const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listError) {
      console.error(`[${account.role}] recherche impossible :`, listError.message);
      failures += 1;
      continue;
    }
    const existing = (listed?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === account.email.toLowerCase()
    );
    if (!existing) {
      console.error(`[${account.role}] compte existant introuvable.`);
      failures += 1;
      continue;
    }
    userId = existing.id;
    // Le mot de passe fourni est (ré)appliqué au compte existant.
    const { error: pwError } = await supabase.auth.admin.updateUserById(userId, {
      password: account.password,
      email_confirm: true,
    });
    if (pwError) {
      console.error(`[${account.role}] mot de passe non appliqué :`, pwError.message);
      failures += 1;
      continue;
    }
  }

  // 2. Rôle appliqué côté serveur (le trigger a créé un profil `customer`).
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
    console.error(`[${account.role}] rôle non appliqué :`, roleError.message);
    failures += 1;
    continue;
  }

  console.log(`[${account.role}] OK : ${account.email}`);
}

process.exit(failures > 0 ? 1 : 0);
