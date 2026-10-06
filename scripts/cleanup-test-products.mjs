import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env={};
for(const l of readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");}
const s=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const {data}=await s.from("products").select("id").like("slug","test-stock-%");
for(const p of data??[]){
  await s.from("inventory_movements").delete().eq("reference_id", p.id);
  await s.from("product_images").delete().eq("product_id", p.id);
  await s.from("product_variants").delete().eq("product_id", p.id);
  await s.from("products").delete().eq("id", p.id);
}
console.log("nettoyage:", (data??[]).length, "produit(s) de test supprime(s)");
process.exit(0);
