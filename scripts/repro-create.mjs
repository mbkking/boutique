import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env={};
for(const l of readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");}
const s=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const {data:cat}=await s.from("categories").select("id,name").limit(1);
const stamp=Date.now();
const slug="test-stock-"+stamp;
const {data,error}=await s.from("products").insert({
  category_id: cat[0].id, name:"TEST STOCK 20 seuil 5", slug, description:"Reproduction du bug stock",
  sku:"TEST-STOCK-"+stamp, price:10000, stock_on_hand:20, low_stock_threshold:5,
  is_active:true, is_featured:false
}).select("id,slug,name,stock_on_hand,low_stock_threshold").single();
if(error){console.log("ERR",error.message);process.exit(1);}
console.log(JSON.stringify(data));
process.exit(0);
