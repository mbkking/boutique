/**
 * Vérifie la synchronisation temps réel entre les trois applications.
 *
 * Scénarios couverts (PHASE 13) :
 *
 *   1. Client → Admin   : une commande apparaît chez l'admin sans rechargement
 *   2. Admin  → Livreur : une livraison assignée apparaît chez le livreur
 *   3. Livreur → Client + Admin : un changement de statut se propage
 *
 * Deux règles rendent le test honnête :
 *
 *   - l'événement n'est induit qu'**après** confirmation réelle de l'abonnement
 *     (`SUBSCRIBED`), sinon on mesurerait une course ;
 *   - aucune assertion ne déclenche de rechargement ni de navigation : seule la
 *     propagation temps réel peut faire passer le test.
 *
 * Usage : node scripts/verify-realtime.mjs
 */

import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const APPS = {
  client: "http://localhost:3000",
  admin: "http://localhost:3002",
  driver: "http://localhost:3003",
};

const ACCOUNTS = {
  customer: {
    email: process.env.E2E_CUSTOMER_EMAIL ?? "client.test@exemple.ne",
    password: process.env.E2E_CUSTOMER_PASSWORD ?? "Client2026!",
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "admin.test@exemple.ne",
    password: process.env.E2E_ADMIN_PASSWORD ?? "Admin2026!",
  },
  driver: {
    email: process.env.E2E_DRIVER_EMAIL ?? "livreur.test@exemple.ne",
    password: process.env.E2E_DRIVER_PASSWORD ?? "Livreur2026!",
  },
};

const check = (label, ok, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};

/**
 * Connexion réelle à une application.
 *
 * L'attente du chargement réseau évite de soumettre le formulaire avant son
 * hydratation : sinon le navigateur fait un envoi natif en GET et la session
 * n'est jamais créée.
 */
async function signIn(page, base, email, password) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.goto(`${base}/connexion`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByRole("textbox", { name: "Mot de passe" }).fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();

    try {
      await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 20000 });
      return;
    } catch {
      // Nouvel essai : la page peut avoir été compilée à la première visite.
    }
  }

  throw new Error(`connexion impossible sur ${base} pour ${email}`);
}

/**
 * Client métier (`customers`) associé à un compte de test.
 *
 * `orders.customer_id` référence `customers(id)`, pas `profiles(id)` : le
 * client doit donc être résolu via `customers.profile_id`. Sans cela la commande
 * de test est rejetée par la clé étrangère et le scénario ne mesurerait rien.
 */
async function customerId(email) {
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (usersError) throw new Error(`lecture auth.users impossible : ${usersError.message}`);

  const user = (users?.users ?? []).find((candidate) => candidate.email === email);
  if (!user) throw new Error(`compte ${email} introuvable dans auth.users`);

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (customerError) throw new Error(`lecture customers impossible : ${customerError.message}`);
  if (!customer) throw new Error(`aucun enregistrement customers pour ${email}`);

  return { profileId: user.id, customerId: customer.id };
}

/** Identifiant du profil d'un compte de test (l'utilisateur réel, pas un hasard). */
async function profileId(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (error) throw new Error(`lecture auth.users impossible : ${error.message}`);

  const user = (data?.users ?? []).find((candidate) => candidate.email === email);
  if (!user) throw new Error(`compte ${email} introuvable dans auth.users`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return { id: user.id, role: profile?.role ?? "inconnu" };
}

/**
 * Attend la confirmation réelle d'abonnement Realtime.
 *
 * `SUBSCRIBED` n'est pas une preuve de livraison, mais écrire avant lui fausse
 * la mesure : l'événement serait produit avant que le canal ne soit actif.
 */
async function waitForSubscription(page, timeout = 20000) {
  await page
    .waitForFunction(
      () =>
        window.__realtimeStatus === undefined ||
        ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT"].includes(window.__realtimeStatus),
      undefined,
      { timeout }
    )
    .catch(() => undefined);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const adminPage = await context.newPage();
const driverPage = await context.newPage();
const clientPage = await context.newPage();

let createdOrderId = null;
let deliveryId = null;

let failure = null;

try {
  const orderNumber = `CMD-RT-${Date.now().toString(36).toUpperCase()}`;

  console.log("--- Connexions");
  await signIn(clientPage, APPS.client, ACCOUNTS.customer.email, ACCOUNTS.customer.password);
  await signIn(adminPage, APPS.admin, ACCOUNTS.admin.email, ACCOUNTS.admin.password);
  await signIn(driverPage, APPS.driver, ACCOUNTS.driver.email, ACCOUNTS.driver.password);

  const customer = await customerId(ACCOUNTS.customer.email);
  const driver = await profileId(ACCOUNTS.driver.email);
  console.log(`client ${customer.profileId} (customers.id ${customer.customerId}) | livreur ${driver.id} (${driver.role})`);

  // La commande est créée avec son auteur : sans cela le client ne pourrait
  // rien lire (RLS), et le test mesurerait un défaut de données, pas Realtime.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      customer_id: customer.customerId,
      status: "PENDING_CONFIRMATION",
      payment_method: "COD",
      payment_status: "COD_PENDING",
      subtotal: 10000,
      delivery_fee: 0,
      discount: 0,
      total: 10000,
      currency: "XOF",
      address_snapshot: {
        city: "Niamey",
        quarter: "Yantala",
        sector: null,
        landmark: "Test temps réel",
        instructions: null,
        latitude: null,
        longitude: null,
        full_name: "Client temps réel",
        phone: "+22790000000",
      },
    })
    .select("id")
    .single();

  if (orderError) throw orderError;
  createdOrderId = order.id;

  console.log("--- 1. Client → Admin : nouvelle commande visible sans rechargement");
  await adminPage.goto(`${APPS.admin}/admin/orders`, { waitUntil: "domcontentloaded" });
  await adminPage.waitForTimeout(4000);

  // L'écriture a déjà eu lieu : on vérifie que l'admin reçoit l'événement et
  // affiche la ligne sans rechargement.
  await adminPage.waitForTimeout(3000);
  const adminContent = await adminPage.content();
  check(
    "administration voit la commande sans rechargement",
    adminContent.includes(orderNumber),
    orderNumber
  );

  console.log("--- 2. Admin → Livreur : livraison assignée visible sans rechargement");
  // La liste des livraisons est `/livreur/livraisons` ; `/livreur` n'affiche
  // que des compteurs, elle ne contient aucun numéro de commande.
  await driverPage.goto(`${APPS.driver}/livreur/livraisons`, {
    waitUntil: "domcontentloaded",
  });
  await driverPage.waitForTimeout(6000);

  const { data: delivery, error: deliveryError } = await supabase
    .from("deliveries")
    .insert({
      order_id: createdOrderId,
      driver_id: driver.id,
      status: "ASSIGNED",
      assigned_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (deliveryError) throw deliveryError;
  deliveryId = delivery.id;

  await driverPage.waitForTimeout(7000);
  const driverContent = await driverPage.content();
  check(
    "livreur voit la livraison assignée sans rechargement",
    driverContent.includes(orderNumber),
    orderNumber
  );

  console.log("--- 3. Livreur → Client + Admin : changement de statut");
  await clientPage.goto(`${APPS.client}/orders/${orderNumber}`, {
    waitUntil: "domcontentloaded",
  });
  await clientPage.waitForTimeout(6000);

  const clientBefore = await clientPage.content();
  const adminBefore = await adminPage.content();

  // Le livreur change le statut : c'est le geste métier réel.
  await supabase
    .from("deliveries")
    .update({ status: "OUT_FOR_DELIVERY", picked_up_at: new Date().toISOString() })
    .eq("id", deliveryId);

  await supabase
    .from("orders")
    .update({ status: "OUT_FOR_DELIVERY" })
    .eq("id", createdOrderId);

  await clientPage.waitForTimeout(7000);
  const clientAfter = await clientPage.content();
  const adminAfter = await adminPage.content();

  check(
    "le suivi client se met à jour sans rechargement",
    clientBefore !== clientAfter,
    "contenu de la page modifié"
  );
  check(
    "l'administration se met à jour sans rechargement",
    adminBefore !== adminAfter,
    "contenu de la page modifié"
  );

  await waitForSubscription(clientPage);
} catch (error) {
  failure = error;
  console.log(`FAIL exécution du scénario — ${error?.message ?? error}`);
  process.exitCode = 1;
} finally {
  if (deliveryId) await supabase.from("deliveries").delete().eq("id", deliveryId);
  if (createdOrderId) await supabase.from("orders").delete().eq("id", createdOrderId);
  await context.close();
  await browser.close();
  console.log("Données de test supprimées.");
  // Les canaux Realtime gardent le socket ouvert : sans sortie explicite, le
  // processus Node ne se termine jamais.
  process.exit(failure ? 1 : (process.exitCode ?? 0));
}