import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env={};
for(const l of readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");}
const s=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const {data:b}=await s.storage.listBuckets();
console.log("BUCKETS :");
for(const x of b??[]) console.log("  "+x.id+" public="+x.public+" limite="+x.file_size_limit+" mimes="+JSON.stringify(x.allowed_mime_types));
const {data:files}=await s.storage.from("product-images").list("", {limit:20});
console.log("\nFichiers racine product-images :", files?.length??0);
for(const f of (files??[]).slice(0,10)) console.log("  "+f.name);
const {data:pi}=await s.from("product_images").select("id,product_id,url,is_primary,sort_order").limit(10);
console.log("\nproduct_images :", pi?.length??0);
for(const i of pi??[]) console.log("  "+(i.is_primary?"PRIM ":"     ")+i.url.slice(0,95));
process.exit(0);
