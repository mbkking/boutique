import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env={};
for(const l of readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");}
const s=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const {data}=await s.from("products").select("name,stock_on_hand,stock_reserved,is_active,is_featured,compare_at_price,price,category_id").order("created_at",{ascending:false}).limit(40);
console.log("nom".padEnd(34),"actif feat on_hand cmp price cat");
for(const p of data??[]) console.log(String(p.name).slice(0,33).padEnd(34), String(p.is_active).padEnd(5), String(p.is_featured).padEnd(4), String(p.stock_on_hand).padStart(7), String(p.compare_at_price??"-").padStart(4), String(p.price).padStart(6), p.category_id?"oui":"NON");
const {data:v}=await s.from("product_variants").select("product_id");
const withVariants=new Set((v??[]).map(x=>x.product_id));
console.log("\nproduits AVEC variantes :", (data??[]).filter(p=>withVariants.has(p.id)).length, "/", (data??[]).length);
process.exit(0);
