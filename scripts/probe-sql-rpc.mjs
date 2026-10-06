import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env={};
for(const l of readFileSync(".env.local","utf8").split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m)env[m[1]]=m[2].trim().replace(/^["']|["']$/g,"");}
const s=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
for(const fn of ["exec_sql","execute_sql","run_sql","sql","query"]){
  const {error}=await s.rpc(fn,{sql:"SELECT 1"});
  console.log(fn.padEnd(14), error? ("ABSENT ("+error.code+")") : "DISPONIBLE");
}
process.exit(0);
