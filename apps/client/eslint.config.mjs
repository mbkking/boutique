import baseConfig from "../../eslint.config.mjs";

/**
 * Lint de l'application `client`. La configuration racine s'applique telle
 * quelle : les règles sont celles du dépôt, pas une variante par application.
 */
export default [...baseConfig, { ignores: ["**/.next/**", "**/node_modules/**"] }];
