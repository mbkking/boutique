/**
 * Génère une image de démonstration par produit sans image, l'uploade dans
 * Supabase Storage et crée la ligne `product_images` correspondante.
 *
 * Usage : node scripts/seed-product-images.mjs
 * Idempotent : un produit qui possède déjà une image est ignoré.
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

const PALETTES = [
  ["#1e2a2d", "#35565c"],
  ["#22333a", "#c6a15b"],
  ["#2b3a42", "#7fb2a5"],
  ["#1f2c24", "#a8c08a"],
  ["#332a2a", "#d9b978"],
];

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function buildSvg(name, palette) {
  const [dark, light] = palette;
  const [first, second] = name.split(/\s+/).filter(Boolean);
  const title = escapeXml(first ?? name);
  const subtitle = escapeXml(second ?? "Boutique en ligne");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${dark}"/>
        <stop offset="100%" stop-color="${light}"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <circle cx="980" cy="140" r="260" fill="#ffffff" opacity="0.06"/>
    <circle cx="200" cy="780" r="180" fill="#ffffff" opacity="0.05"/>
    <text x="600" y="480" font-family="Segoe UI, Arial, sans-serif" font-size="220" font-weight="700" fill="#ffffff" opacity="0.85" text-anchor="middle">${escapeXml(initials(name))}</text>
    <text x="600" y="590" font-family="Segoe UI, Arial, sans-serif" font-size="46" fill="#ffffff" text-anchor="middle">${title}</text>
    <text x="600" y="650" font-family="Segoe UI, Arial, sans-serif" font-size="32" fill="#ffffff" opacity="0.8" text-anchor="middle">${subtitle}</text>
    <text x="600" y="800" font-family="Segoe UI, Arial, sans-serif" font-size="24" fill="#ffffff" opacity="0.6" text-anchor="middle">Image de démonstration</text>
  </svg>`;
}

const { data: products, error } = await supabase
  .from("products")
  .select("id, name")
  .order("created_at", { ascending: true });

if (error) throw error;

const { data: existing } = await supabase.from("product_images").select("product_id");
const already = new Set((existing ?? []).map((row) => row.product_id));

let created = 0;

for (const [index, product] of products.entries()) {
  if (already.has(product.id)) continue;

  const palette = PALETTES[index % PALETTES.length];
  const buffer = await sharp(Buffer.from(buildSvg(product.name, palette)))
    .webp({ quality: 82 })
    .toBuffer();

  const path = `demo/${product.id.slice(0, 8)}-${randomUUID().slice(0, 8)}.webp`;
  const upload = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "image/webp", upsert: true });

  if (upload.error) {
    console.error("échec upload", product.name, upload.error.message);
    continue;
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const insert = await supabase.from("product_images").insert({
    product_id: product.id,
    url: publicData.publicUrl,
    alt_text: product.name,
    is_primary: true,
    sort_order: 0,
  });

  if (insert.error) {
    console.error("échec insertion", product.name, insert.error.message);
    continue;
  }

  created += 1;
  console.log("image créée :", product.name);
}

console.log(`Terminé. ${created} image(s) créée(s) sur ${products.length} produit(s).`);