/**
 * Comparaison des rôles Supabase sur la réception d'un événement Realtime.
 *
 * Objectif : déterminer précisément quel rôle reçoit réellement l'événement
 * `postgres_changes` sur `orders`.
 *
 *   - `anon`         : aucune session (rôle `anon`)
 *   - `authenticated` : session réelle d'un compte admin (rôle `authenticated`)
 *   - `service_role` : clé de service (contourne les RLS)
 *
 * Un `service_role` qui reçoit ne prouve **rien** pour le navigateur : c'est
 * exactement le piège que ce script sert à éviter.
 *
 * Usage : node scripts/probe-realtime-auth.mjs
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Lit un `.env*` (format `CLE=valeur`). */
function parseEnv(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

const env = parseEnv(readFileSync(".env.local", "utf8"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SUBSCRIBE_TIMEOUT_MS = 10000;
const LISTEN_MS = 12000;

/** Abonne un canal `orders` et attend la confirmation réelle du serveur. */
async function listen(label, client) {
  const received = [];
  const channel = client.channel(`probe-${label}`);

  channel.on(
    "postgres_changes",
    { event: "*", schema: "public", table: "orders" },
    (payload) => {
      received.push(payload.eventType);
    }
  );

  const status = await new Promise((resolve) => {
    let settled = false;

    channel.subscribe((value, error) => {
      if (settled) return;
      if (value === "SUBSCRIBED" || value === "CHANNEL_ERROR" || value === "TIMED_OUT") {
        settled = true;
        resolve(value + (error ? ` (${error.message})` : ""));
      }
    });

    // Un canal qui ne confirme jamais ne doit pas bloquer le diagnostic.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve("AUCUNE CONFIRMATION");
    }, SUBSCRIBE_TIMEOUT_MS);
  });

  return { label, status, received, channel };
}

const service = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);

// --- Rôle `anon` -----------------------------------------------------------
const anon = createClient(url, anonKey);
const anonSub = await listen("anon", anon);

// --- Rôle `authenticated` (session admin réelle) ----------------------------
const admin = createClient(url, anonKey);
const { error: signInError } = await admin.auth.signInWithPassword({
  email: process.env.E2E_ADMIN_EMAIL ?? "admin.test@exemple.ne",
  password: process.env.E2E_ADMIN_PASSWORD ?? "Admin2026!",
});

console.log(`connexion admin : ${signInError ? signInError.message : "ok"}`);
const authSub = signInError ? null : await listen("authenticated", admin);

// --- Rôle `service_role` ----------------------------------------------------
const serviceSub = await listen("service_role", service);

// Le rôle réellement utilisé par le navigateur : le client est authentifié, et
// son canal doit porter le jeton de session.
if (authSub) {
  const { data } = await admin.auth.getSession();
  if (data.session?.access_token) {
    await admin.realtime.setAuth(data.session.access_token);
  }
}

// On n'écrit qu'après les confirmations : un `SUBSCRIBED` trompeur est exclu.
const orderNumber = `CMD-AUTH-${Date.now().toString(36).toUpperCase()}`;
const { error: insertError } = await service.from("orders").insert({
  order_number: orderNumber,
  status: "PENDING_CONFIRMATION",
  payment_method: "COD",
  payment_status: "COD_PENDING",
  subtotal: 1000,
  delivery_fee: 0,
  discount: 0,
  total: 1000,
  address_snapshot: { full_name: "Probe realtime", phone: "+22790000000" },
});

console.log(`insertion de ${orderNumber} : ${insertError ? insertError.message : "ok"}`);

await new Promise((resolve) => setTimeout(resolve, LISTEN_MS));

console.log("");
console.log("rôle            | confirmation canal | événements reçus sur orders");
console.log("-----------------|--------------------|--------------------------");
for (const sub of [anonSub, authSub, serviceSub]) {
  if (!sub) continue;
  console.log(
    `${sub.label.padEnd(15)} | ${sub.status.padEnd(18)} | ${sub.received.join(", ") || "AUCUN"}`
  );
}

const { data: row } = await service
  .from("orders")
  .select("id")
  .eq("order_number", orderNumber)
  .single();

if (row) await service.from("orders").delete().eq("id", row.id);

// Les clients Realtime gardent le socket ouvert : sans sortie explicite, le
// processus Node ne se termine jamais.
process.exit(0);