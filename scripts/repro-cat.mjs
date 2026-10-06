import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env={};
for(const l of readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");}
const s=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const {data:p}=await s.from("products").select("name,slug,category:categories(slug)").eq("slug","test-stock-1791202069318").single();
const cat=Array.isArray(p.category)?p.category[0]:p.category;
console.log(cat.slug, p.name);
process.exit(0);
