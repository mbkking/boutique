import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env={};
for(const l of readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");}
const s=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const {data:v,error}=await s.from("product_variants").select("id,product_id,sku,stock_on_hand,stock_reserved,is_active,products(name,stock_on_hand,stock_reserved,is_active,low_stock_threshold)");
if(error){console.log("ERR",error.message);process.exit(0);}
console.log("VARIANTE".padEnd(26),"v_onh v_res v_act |","prod_onh prod_res seuil  PRODUIT");
for(const x of v??[]){const p=Array.isArray(x.products)?x.products[0]:x.products;
console.log(String(x.sku).slice(0,25).padEnd(26), String(x.stock_on_hand).padStart(5), String(x.stock_reserved).padStart(5), String(x.is_active).padStart(5)," |",
 String(p?.stock_on_hand).padStart(8), String(p?.stock_reserved).padStart(8), String(p?.low_stock_threshold).padStart(5), " ", String(p?.name).slice(0,28));}
process.exit(0);
