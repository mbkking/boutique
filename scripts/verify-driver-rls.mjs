/**
 * Vérification des RLS avec de **vrais** jetons d'utilisateur.
 *
 * Règle de mesure : le comportement observé est toujours celui du rôle
 * `authenticated` (clé anonyme + JWT obtenu par `signInWithPassword`), jamais
 * celui de `service_role`. La clé de service n'est utilisée que pour **préparer
 * les données de test** (créer des commandes, des livraisons, un second
 * livreur), ce qui n'a aucune incidence sur les politiques évaluées ensuite.
 *
 * Cas vérifiés :
 *   A. le livreur A lit sa propre livraison
 *   B. le livreur A lit-il la commande de sa livraison ?
 *   C. le livreur A ne lit PAS la commande d'un autre livreur
 *   D. le livreur A ne lit PAS une commande non assignée
 *   E. un client ne voit pas les commandes d'un autre client
 *   F. l'administration conserve ses accès
 *
 * Usage : node scripts/verify-driver-rls.mjs
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Préparation des données uniquement.
const service = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY);

/** Compte de test observée comme un vrai utilisateur authentifié. */
async function asUser(email, password) {
  const client = createClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) throw new Error(`connexion ${email} impossible : ${error.message}`);
  if (data.user?.aud !== "authenticated") {
    throw new Error(`${email} : le jeton n'est pas de rôle authenticated`);
  }

  return { client, userId: data.user.id, role: data.user.role };
}

const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok });
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const stamp = Date.now().toString(36).toUpperCase();
const created = { users: [], orders: [], deliveries: [] };
let failure = null;

async function createOrder(label, customerId) {
  const { data, error } = await service
    .from("orders")
    .insert({
      order_number: `CMD-RLS-${label}-${stamp}`,
      customer_id: customerId,
      status: "CONFIRMED",
      payment_method: "COD",
      payment_status: "COD_PENDING",
      subtotal: 5000,
      delivery_fee: 0,
      discount: 0,
      total: 5000,
      currency: "XOF",
      address_snapshot: {
        city: "Niamey",
        quarter: "Yantala",
        landmark: null,
        instructions: null,
        full_name: "Client RLS",
        phone: "+22790000000",
      },
    })
    .select("id, order_number")
    .single();

  if (error) throw error;
  created.orders.push(data.id);
  return data;
}

async function assignDelivery(orderId, driverId) {
  const { data, error } = await service
    .from("deliveries")
    .insert({ order_id: orderId, driver_id: driverId, status: "ASSIGNED" })
    .select("id")
    .single();

  if (error) throw error;
  created.deliveries.push(data.id);
  return data;
}

/** Compte éphémère : sert de « Driver B » et de « client B ». */
async function createTemporaryAccount(email, role, phone) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "Tmp2026!",
    email_confirm: true,
    user_metadata: { full_name: role === "driver" ? "Livreur B" : "Client B" },
  });

  if (error) throw new Error(`création ${email} : ${error.message}`);
  created.users.push(data.user.id);

  // Le projet crée automatiquement un profil à l'inscription : on le met à jour
  // au lieu de l'insérer, sinon la clé primaire est déjà prise.
  const { data: existing } = await service
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (existing) {
    const { error: profileError } = await service
      .from("profiles")
      .update({
        role,
        full_name: role === "driver" ? "Livreur B" : "Client B",
        phone,
      })
      .eq("id", data.user.id);

    if (profileError) throw new Error(`profil ${email} : ${profileError.message}`);
  } else {
    const { error: profileError } = await service.from("profiles").insert({
      id: data.user.id,
      full_name: role === "driver" ? "Livreur B" : "Client B",
      phone,
      role,
    });

    if (profileError) throw new Error(`profil ${email} : ${profileError.message}`);
  }

  let customerId = null;

  if (role === "customer") {
    const { data: customer, error: customerError } = await service
      .from("customers")
      .insert({ profile_id: data.user.id, full_name: "Client B", phone })
      .select("id")
      .single();

    if (customerError) throw new Error(`customers ${email} : ${customerError.message}`);
    customerId = customer.id;
  }

  return { id: data.user.id, customerId };
}

try {
  const driverA = await asUser("livreur.test@exemple.ne", "Livreur2026!");
  const admin = await asUser("admin.test@exemple.ne", "Admin2026!");
  const clientA = await asUser("client.test@exemple.ne", "Client2026!");

  const driverB = await createTemporaryAccount(
    `livreur-b.${Date.now()}@exemple.ne`,
    "driver",
    "+22790009901"
  );
  const clientB = await createTemporaryAccount(
    `client-b.${Date.now()}@exemple.ne`,
    "customer",
    "+22790009902"
  );

  const { data: customerARow } = await service
    .from("customers")
    .select("id")
    .eq("profile_id", clientA.userId)
    .single();

  const orderA = await createOrder("A", customerARow.id);
  const deliveryA = await assignDelivery(orderA.id, driverA.userId);

  const orderB = await createOrder("B", clientB.customerId);
  await assignDelivery(orderB.id, driverB.id);

  const orderC = await createOrder("C", customerARow.id); // aucune livraison
  const orderD = await createOrder("D", clientB.customerId);

  console.log("--- A. Le livreur A lit sa propre livraison");
  const a = await driverA.client
    .from("deliveries")
    .select("id")
    .eq("id", deliveryA.id);
  check("A. livreur A voit sa livraison", a.data?.length === 1, `erreur: ${a.error?.message ?? "-"}`);

  console.log("--- B. Le livreur A lit la commande de sa livraison");
  const b = await driverA.client.from("orders").select("id").eq("id", orderA.id);
  check(
    "B. livreur A voit la commande de sa livraison",
    b.data?.length === 1,
    b.data?.length === 1
      ? "policy orders_select_driver requise"
      : "aucune policy : la lecture directe par le livreur est actuellement refusée"
  );

  console.log("--- C. Le livreur A ne lit pas la commande du livreur B");
  const c = await driverA.client.from("orders").select("id").eq("id", orderB.id);
  check("C. livreur A ne voit PAS la commande du livreur B", c.data?.length === 0);

  console.log("--- D. Le livreur A ne lit pas une commande non assignée");
  const d = await driverA.client.from("orders").select("id").eq("id", orderC.id);
  check("D. livreur A ne voit PAS une commande non assignée", d.data?.length === 0);

  console.log("--- E. Un client ne voit pas les commandes d'un autre client");
  const e1 = await clientA.client.from("orders").select("id").eq("id", orderD.id);
  check("E1. client A ne voit PAS la commande du client B", e1.data?.length === 0);

  const e2 = await clientA.client.from("orders").select("id").eq("id", orderC.id);
  check("E2. client A voit SA commande", e2.data?.length === 1);

  const e3 = await driverA.client
    .from("orders")
    .select("id")
    .in("id", [orderC.id, orderA.id, orderB.id]);
  check(
    "E3. le livreur ne reçoit que ses commandes",
    (e3.data?.length ?? 0) <= 1,
    `${e3.data?.length ?? 0} commande(s) visible(s)`
  );

  console.log("--- F. L'administration conserve ses accès");
  const f = await admin.client
    .from("orders")
    .select("id")
    .in("id", [orderA.id, orderB.id, orderC.id, orderD.id]);
  check("F1. admin voit les quatre commandes", f.data?.length === 4, `${f.data?.length ?? 0}/4`);

  console.log("--- G. Aucune escalade d'écriture");
  const write = await driverA.client
    .from("orders")
    .update({ status: "DELIVERED" })
    .eq("id", orderA.id)
    .select("id");

  check(
    "G. le livreur ne peut pas modifier une commande",
    !write.data || write.data.length === 0,
    write.error ? `refusé par RLS : ${write.error.message}` : "aucune ligne touchée"
  );

  console.log("");
  const failed = results.filter((result) => !result.ok).length;
  console.log(`${results.length - failed}/${results.length} vérifications passées.`);
  if (failed > 0) process.exitCode = 1;
} catch (error) {
  failure = error;
  console.log(`FAIL exécution — ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  for (const deliveryId of created.deliveries) {
    await service.from("deliveries").delete().eq("id", deliveryId);
  }
  for (const orderId of created.orders) {
    await service.from("order_items").delete().eq("order_id", orderId);
    await service.from("orders").delete().eq("id", orderId);
  }
  for (const userId of created.users) {
    await service.from("profiles").delete().eq("id", userId);
    await service.auth.admin.deleteUser(userId);
  }

  console.log("Données de test supprimées.");
  process.exit(failure ? 1 : (process.exitCode ?? 0));
}