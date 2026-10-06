import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const { data, error } = await supabase
  .from("app_settings")
  .select("key, value")
  .like("key", "admin_theme_%")
  .order("key");

if (error) {
  console.error(error.message);
  process.exit(1);
}

for (const row of data ?? []) {
  const value = row.value.length > 60 ? `${row.value.slice(0, 60)}…` : row.value;
  console.log(row.key.replace("admin_theme_", "").padEnd(30), value);
}