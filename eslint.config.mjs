import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefacts de génération : rapport de couverture et plateforme mobile.
    "coverage/**",
    "capacitor/android/**",
    "capacitor/ios/**",
    // Applications générées (`apps/*`) : chacune possède sa propre configuration
    // ESLint et l'analyse la source qu'elle expose. La source du dépôt reste à
    // la racine, c'est elle que cette configuration analyse.
    "apps/**",
  ]),
]);

export default eslintConfig;
