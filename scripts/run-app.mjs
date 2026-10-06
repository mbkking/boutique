/**
 * Lance une application (`client`, `admin`, `driver`) avec le binaire Next
 * installé à la racine du dépôt.
 *
 * Chaque application a son propre dossier : c'est ce qui évite le verrouillage
 * de `next dev` qui interdisait plusieurs serveurs sur un même répertoire.
 *
 * Usage :
 *   node scripts/run-app.mjs client 3000          # développement
 *   node scripts/run-app.mjs admin 3002 build     # build de production
 *   node scripts/run-app.mjs driver 3003 start    # serveur de production
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const [, , appName, portArg, command = "dev"] = process.argv;

const APPS = {
  client: { port: 3000, label: "Boutique client" },
  admin: { port: 3002, label: "Administration" },
  driver: { port: 3003, label: "Espace livreur" },
};

const app = APPS[appName];

if (!app) {
  console.error(
    `Application inconnue : ${appName}. Valeurs acceptées : ${Object.keys(APPS).join(", ")}.`
  );
  process.exit(1);
}

const port = portArg ?? String(app.port);
const appDir = join(ROOT, "apps", appName);

if (!existsSync(appDir)) {
  console.error(
    `Dossier d'application manquant : ${appDir}. Lancez « node scripts/generate-apps.mjs ».`
  );
  process.exit(1);
}

const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");

// `-p` n'a de sens qu'en développement ou au démarrage ; un build ne prend
// pas de port.
const args =
  command === "build"
    ? [nextBin, "build"]
    : [nextBin, command, "-p", port];

console.log(`[${appName}] ${app.label} — ${command} sur le port ${port}`);

const child = spawn(process.execPath, args, {
  cwd: appDir,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));