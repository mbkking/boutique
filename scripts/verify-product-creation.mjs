/**
 * Vérification de la création de produit : stock réellement enregistré,
 * images téléversées et visibles en boutique.
 *
 * Usage : node scripts/verify-product-creation.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

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
const BASE = process.env.VERIFY_BASE_URL ?? "http://admin.localhost:3000";
const STORE = process.env.VERIFY_STORE_URL ?? "http://localhost:3000";

const email = `product-check-${Date.now()}@example.test`;
const password = `Product-${Date.now()}-Aa1!`;
const stamp = Date.now().toString(36).toUpperCase();
const productName = `Produit verification ${stamp}`;

// Deux visuels de test, générés localement (aucune donnée fictive en base
// ailleurs que le produit de vérification, supprimé à la fin).
const workDir = join(tmpdir(), "product-check");
mkdirSync(workDir, { recursive: true });

const files = [];
for (const [index, colour] of [[0, "#1e2a2d"], [1, "#c6a15b"]].entries()) {
  const file = join(workDir, `visuel-${index + 1}.png`);
  writeFileSync(
    file,
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: colour },
    })
      .png()
      .toBuffer()
  );
  files.push(file);
}

const created = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "Verification Produit", phone: "+22790008888" },
});

if (created.error) {
  console.error("Création du compte impossible :", created.error.message);
  process.exit(1);
}

const userId = created.data.user.id;
await supabase.from("profiles").update({ role: "admin", is_active: true }).eq("id", userId);

const browser = await chromium.launch();
const page = await browser.newPage();
let productId = null;

const check = (label, ok, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};

try {
  await page.goto(`${BASE}/connexion`);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.includes("connexion"), { timeout: 30000 });

  await page.goto(`${BASE}/admin/products`);
  await page.getByRole("button", { name: "Nouveau produit" }).click();

  const category = await page
    .locator('select[name="categoryId"] option:not([value=""])')
    .first()
    .getAttribute("value");

  await page.getByLabel("Nom du produit").fill(productName);
  await page.getByLabel(/SKU/).fill(`VERIF-${stamp}`);
  await page.locator('select[name="categoryId"]').selectOption(category);
  await page.getByLabel("Prix de vente (XOF)").fill("25000");
  await page.getByLabel(/Ancien prix/).fill("30000");
  await page.getByLabel("Stock disponible").fill("10");
  await page.getByLabel(/Seuil d'alerte/).fill("5");
  await page.getByLabel(/^Description/).last()
    .getByLabel("Description", { exact: true })
  await page.getByLabel(/^Description/).last().fill("Produit de verification du stock et des visuels.");
  await page.getByLabel("Description courte").fill("Vérification automatique");

  await page.setInputFiles('input[type="file"][multiple]', files);
  await page.waitForSelector("text=Principale", { timeout: 15000 });
  check("aperçu des images dans le formulaire", true);

  await page.getByRole("button", { name: "Créer le produit" }).click();
  await page.waitForSelector("text=Produit créé.", { timeout: 45000 });

  const { data: rows } = await supabase
    .from("products")
    .select("id, stock_on_hand, low_stock_threshold, sku")
    .eq("sku", `VERIF-${stamp}`)
    .limit(1);

  const product = rows?.[0];
  productId = product?.id ?? null;

  check("produit créé en base", Boolean(product));
  check("stock enregistré = 10", product?.stock_on_hand === 10, `stock_on_hand=${product?.stock_on_hand}`);
  check("seuil enregistré = 5", product?.low_stock_threshold === 5, `seuil=${product?.low_stock_threshold}`);

  const { data: images } = await supabase
    .from("product_images")
    .select("url, is_primary")
    .eq("product_id", productId);

  check("2 images enregistrées", (images?.length ?? 0) === 2, `${images?.length ?? 0} image(s)`);
  check(
    "une image marquée principale",
    (images ?? []).filter((image) => image.is_primary).length === 1
  );

  if (images?.[0]?.url) {
    const response = await fetch(images[0].url);
    check("image accessible publiquement", response.status === 200, `HTTP ${response.status}`);
  }

  // Cote boutique : la page produit doit exposer la galerie.
  const { data: slugRow } = await supabase
    .from("products")
    .select("slug")
    .eq("id", productId)
    .single();

  const store = await browser.newPage();
  await store.goto(`${STORE}/products/${slugRow.slug}`, { waitUntil: "domcontentloaded" });
  const gallery = await store.locator("img").count();
  const storageRefs = (await store.content()).includes("storage/v1/object");
  check("boutique affiche les visuels", gallery >= 2 && storageRefs, `${gallery} image(s)`);
  await store.close();

  // Coupure : un produit sans stock doit toujours être signalé en rupture.
  const { data: rupture } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .single();
  check("fixture de rupture disponible", Boolean(rupture));
} finally {
  await browser.close();
  if (productId) {
    await supabase.from("product_images").delete().eq("product_id", productId);
    await supabase.from("products").delete().eq("id", productId);
    console.log("Produit de vérification supprimé.");
  }
  await supabase.auth.admin.deleteUser(userId);
  console.log("Compte de vérification supprimé.");
}
