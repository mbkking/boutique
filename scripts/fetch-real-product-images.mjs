/**
 * Photos réelles de produit, sourcées dans des catégories Wikimedia Commons
 * précises (et non par recherche plein texte, trop bruitée).
 *
 * Chaque visuel est filtré par mots-clés : une photo qui ne parle pas du
 * produit est jetée plutôt que publiée.
 *
 * Usage :
 *   node scripts/fetch-real-product-images.mjs
 *   node scripts/fetch-real-product-images.mjs --par-produit=5 --reset
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
const BUCKET = "product-images";
const USER_AGENT = "BoutiqueCatalogue/1.0 (import photos catalogue)";

const args = process.argv.slice(2);
const targetCount = Number((args.find((a) => a.startsWith("--par-produit=")) ?? "").split("=")[1] ?? 5);
const reset = args.includes("--reset");

/**
 * Catégories Commons + mots-clés obligatoires et interdits.
 * `positive` vide = pas de filtre (catégorie déjà précise).
 */
const SOURCES = {
  armoire: {
    categories: [
      "Category:Wardrobes (furniture)",
      "Category:Armoires",
      "Category:Clothes wardrobes",
    ],
    positive: ["armoire", "wardrobe", "closet", "cabinet"],
    negative: ["boat", "ship", "kitchen cabinet", "curiosity"],
  },
  tasse: {
    categories: ["Category:Cups (drinkware)", "Category:Tea cups"],
    positive: ["cup", "tasse", "mug"],
    negative: ["cupcake", "measuring", "trophy", "world cup", "chess"],
  },
  jean: {
    categories: ["Category:Jeans", "Category:Denim clothing"],
    positive: ["jean", "denim"],
    negative: ["washing", "machine"],
  },
  chemise: {
    categories: ["Category:Shirts", "Category:Checkered shirts"],
    positive: ["shirt", "chemise", "plaid", "checkered", "checked", "blouse"],
    negative: [
      "bra", "advertisement", "1904", "folded", "silk tie", "poster",
      "illustration", "painting", "person wearing", "man wearing", "woman wearing",
    ],
  },
  sneakers: {
    categories: ["Category:Sneakers", "Category:Sports shoes"],
    positive: ["sneaker", "shoe", "basket", "trainer", "shoes"],
    negative: ["skateboard", "sandal", "boot", "skate"],
  },
  "sac à main": {
    categories: ["Category:Handbags", "Category:Handbags (fashion)"],
    positive: ["handbag", "purse", "sac à main", "sac a main", "bag"],
    negative: ["sack", "bagpipe", "garbage", "shopping bag", "plastic"],
  },
  "eau de parfum": {
    categories: ["Category:Perfume bottles", "Category:Perfume"],
    positive: ["perfume", "parfum", "flacon", "cologne", "toilette"],
    negative: ["advertisement", "patent drawing", "poster", "label"],
  },
  "savon noir": {
    categories: ["Category:Black soap", "Category:Soap bars"],
    positive: ["soap", "savon", "seife"],
    negative: ["festival", "musical", "sex in the shower", "shower"],
  },
  "beurre de karité": {
    categories: ["Category:Shea butter", "Category:Body butter"],
    positive: ["shea", "karite", "karité", "butter", "beurre"],
    negative: ["tree", "vitellaria", "plant", "noten", "museum", "collnectie", "workshop"],
  },
  ceinture: {
    categories: ["Category:Belts (clothing)", "Category:Belt buckles"],
    positive: ["belt", "ceinture"],
    negative: ["conveyor", "beltway", "seat belt", "roundhouse", "compass"],
  },
  enceinte: {
    categories: ["Category:Bluetooth speakers", "Category:Portable speakers"],
    positive: ["speaker", "enceinte", "soundbar", "boombox"],
    negative: ["church", "tower", "horn", "loudspeaker horn", "temple"],
  },
  miroir: {
    categories: ["Category:Round mirrors", "Category:Mirrors"],
    positive: ["mirror", "miroir"],
    negative: [
      "telescope", "traffic", "microscope", "eyeglass", "solar", "divination",
      "bicycle", "rearview", "obscura", "1870", "bartolozzi", "ornate",
    ],
  },
  chaise: {
    categories: ["Category:Folding chairs", "Category:Kitchen chairs", "Category:Chairs"],
    positive: ["chair", "chaise", "folding", "seat"],
    negative: ["church", "temple", "steam", "wheelchair", "chairman", "sedan", "geograph", "canal", "worship"],
  },
  table: {
    categories: ["Category:Dining tables", "Category:Wooden tables"],
    positive: ["dining table", "table"],
    negative: ["periodic", "truth", "train", "operating table", "periodic table"],
  },
};

function sourceFor(name) {
  const lowered = name.toLowerCase();
  for (const [key, config] of Object.entries(SOURCES)) {
    if (lowered.includes(key)) return config;
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listCategoryImages(category, limit = 60) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "categorymembers",
    gcmtitle: category,
    gcmtype: "file",
    gcmlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1600",
  }).toString();

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Commons ${response.status} (${category})`);

  const json = await response.json();
  const pages = json?.query?.pages ?? {};

  return Object.values(pages)
    .map((page) => {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) return null;
      const meta = info.extmetadata ?? {};
      return {
        title: String(page.title ?? "").replace(/^File:/, ""),
        thumburl: info.thumburl,
        license: meta.LicenseShortName?.value ?? "voir la source",
      };
    })
    .filter(Boolean);
}

function isRelevant(candidate, config) {
  const title = candidate.title.toLowerCase();
  if (!/\.(jpe?g|png)$/i.test(title)) return false;
  if (/\.(svg|gif|tif|webp)$/i.test(title)) return false;
  if (config.positive.length && !config.positive.some((word) => title.includes(word))) {
    return false;
  }
  if (config.negative.some((word) => title.includes(word))) return false;
  return true;
}

async function download(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (response.status === 429) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    throw new Error(`téléchargement ${response.status}`);
  }
  throw new Error("téléchargement refusé (429 persistants)");
}

async function toWebp(buffer) {
  return sharp(buffer)
    .resize(1200, 900, { fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}

const { data: products, error } = await supabase
  .from("products")
  .select("id, name")
  .order("created_at", { ascending: true });

if (error) throw error;

if (reset) {
  const { data: stale } = await supabase
    .from("product_images")
    .select("id, url")
    .like("url", "%/photos/%");

  for (const image of stale ?? []) {
    await supabase.from("product_images").delete().eq("id", image.id);
  }
  console.log(`Suppression de ${(stale ?? []).length} photo(s) précédente(s).`);
}

const { data: currentImages } = await supabase
  .from("product_images")
  .select("product_id, url, sort_order, is_primary");

const grouped = new Map();
for (const image of currentImages ?? []) {
  const list = grouped.get(image.product_id) ?? [];
  list.push(image);
  grouped.set(image.product_id, list);
}

let totalAdded = 0;
let skipped = 0;

for (const product of products) {
  if (product.name.startsWith("Produit Test")) {
    skipped += 1;
    continue;
  }

  const config = sourceFor(product.name);
  if (!config) {
    console.log(`${product.name} : aucune source définie, ignoré.`);
    skipped += 1;
    continue;
  }

  const existing = grouped.get(product.id) ?? [];
  const remaining = targetCount - existing.length;

  if (remaining <= 0) {
    console.log(`${product.name} : déjà ${existing.length} photo(s).`);
    continue;
  }

  const picked = [];
  const seenTitles = new Set();

  for (const category of config.categories) {
    if (picked.length >= remaining) break;
    let members = [];
    try {
      members = await listCategoryImages(category);
      await sleep(400);
    } catch (error) {
      console.warn(`  ${category} : ${error.message}`);
      continue;
    }

    for (const member of members) {
      if (picked.length >= remaining) break;
      if (seenTitles.has(member.title)) continue;
      const candidate = { ...member, ...config };
      if (!isRelevant(candidate, config)) continue;
      seenTitles.add(member.title);
      picked.push(member);
    }
  }

  let added = 0;

  for (const [index, member] of picked.entries()) {
    try {
      const webp = await toWebp(await download(member.thumburl));
      await sleep(1500);
      const path = `photos/${product.id.slice(0, 8)}/${randomUUID().slice(0, 8)}.webp`;

      const upload = await supabase.storage
        .from(BUCKET)
        .upload(path, webp, { contentType: "image/webp", upsert: true });

      if (upload.error) throw new Error(upload.error.message);

      const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const insert = await supabase.from("product_images").insert({
        product_id: product.id,
        url: publicData.publicUrl,
        alt_text: `${product.name} — ${member.title.replace(/\.[a-z]+$/i, "")}`,
        sort_order: index + existing.length,
        is_primary: existing.length === 0 && index === 0,
      });

      if (insert.error) throw new Error(insert.error.message);

      added += 1;
      totalAdded += 1;
      console.log(`  + ${product.name} — ${member.title} (${member.license})`);
    } catch (error) {
      console.warn(`  ignoré (${member.title}) : ${error.message}`);
    }
  }

  console.log(`${product.name} : +${added} photo(s), ${existing.length + added} au total.`);
}

console.log(`\nTotal : ${totalAdded} photo(s) ajoutée(s), ${skipped} produit(s) ignoré(s).`);