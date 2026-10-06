/**
 * Démarre les trois applications en parallèle (client, admin, livreur).
 *
 * Usage : npm run dev:all
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const APPS = [
  { name: "client", port: 3000 },
  { name: "admin", port: 3002 },
  { name: "driver", port: 3003 },
];

const children = [];

for (const app of APPS) {
  const child = spawn(
    process.execPath,
    [join(ROOT, "scripts", "run-app.mjs"), app.name, String(app.port)],
    { cwd: ROOT, stdio: "inherit", env: process.env }
  );

  child.on("exit", (code) => {
    console.log(`[${app.name}] arrêté (code ${code ?? 0}).`);
  });

  children.push(child);
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);