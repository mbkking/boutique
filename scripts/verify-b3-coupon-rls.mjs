#!/usr/bin/env node
/**
 * Vérification B3 — coupons/promotions ne sont plus publiquement lisibles,
 * et la validation officielle par RPC continue de fonctionner.
 *
 * Usage : node --env-file=.env.local scripts/verify-b3-coupon-rls.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
}

// 1. anon ne peut plus lire coupons
{
  const r = await anon.from("coupons").select("*", { count: "exact", head: true });
  const visible = r.count ?? (r.data ? r.data.length : null);
  check("anon ne peut pas SELECT coupons", r.error !== null || visible === 0, r.error ? r.error.message : `count=${visible}`);
}

// 2. anon ne peut plus lire promotions
{
  const r = await anon.from("promotions").select("*", { count: "exact", head: true });
  const visible = r.count ?? (r.data ? r.data.length : null);
  check("anon ne peut pas SELECT promotions", r.error !== null || visible === 0, r.error ? r.error.message : `count=${visible}`);
}

// 3. code valide toujours validable via le mécanisme officiel (service role RPC)
//    On crée un coupon temporaire, on valide, puis on le supprime.
{
  const ins = await service.from("coupons").insert({
    code: "B3VERIFY",
    discount_type: "PERCENTAGE",
    discount_value: 10,
    is_active: true,
    max_uses: 1,
  }).select("id").single();
  const insError = ins.error;
  if (insError) {
    check("coupon temporaire créé pour le test", false, insError.message);
  } else {
    const r = await service.rpc("coupon_is_valid", { p_code: "B3VERIFY", p_subtotal: 1000, p_user_key: null, p_items: null });
    const row = Array.isArray(r.data) ? r.data[0] : null;
    check("coupon valide accepté via RPC", !r.error && row?.is_valid === true, r.error?.message ?? `discount=${row?.discount}`);
    await service.from("coupons").delete().eq("id", ins.data.id);
  }
}

// 4. code invalide refusé
{
  const r = await service.rpc("coupon_is_valid", { p_code: "CODE_INEXISTANT_XYZ", p_subtotal: 1000, p_user_key: null, p_items: null });
  const row = Array.isArray(r.data) ? r.data[0] : null;
  check("coupon invalide refusé", !r.error && row && row.is_valid === false, r.error?.message ?? `reason=${row?.reason}`);
}

// 5. anon ne peut pas appeler directement la RPC (inchangé)
{
  const r = await anon.rpc("coupon_is_valid", { p_code: "E2EMUTWVBKM", p_subtotal: 1000, p_user_key: null, p_items: null });
  check("anon refuse l'accès direct à la RPC", r.error !== null, r.error?.message ?? "AUCUNE ERREUR (à vérifier)");
}

process.exit(failures ? 1 : 0);
