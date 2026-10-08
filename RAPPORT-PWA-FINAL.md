# Rapport de recette — PWA Boutique (Client · Admin · Livreur)

**Date :** 8 octobre 2026
**Branche :** `master` — dernier commit `5d96f7a`
**Déploiement :** Vercel, 3 projets racine liés au même dépôt (un push = 3 builds)

---

## 1. PWA — trois applications

### Boutique Client
| Critère | Résultat |
|---|---|
| Manifest dynamique par hôte | ✅ `ISF NAF-CHOPOP — vente en ligne à Niamey`, `start_url=/`, standalone, 3 icônes |
| Service worker + offline fallback | ✅ `sw.js` actif, page offline « Vous êtes hors ligne… » servie |
| Installable (192/512, apple-icon, favicon) | ✅ |
| Responsive 360/768/1920 (aucun scroll horizontal) | ✅ |
| Zéro erreur console | ✅ |

### Administration
| Critère | Résultat |
|---|---|
| Manifest dynamique par hôte | ✅ `Administration — ISF NAF-CHOPOP`, `start_url=/admin`, standalone |
| Service worker + offline fallback | ✅ |
| Sidebar RBAC complète (14 sections) | ✅ |
| Zéro erreur console | ✅ |

### Espace Livreur
| Critère | Résultat |
|---|---|
| Manifest dynamique par hôte | ✅ `Espace livreur — ISF NAF-CHOPOP`, `start_url=/driver`, standalone |
| Service worker + offline fallback | ✅ |
| Dashboard (Livraisons / Historique / Missions) | ✅ |
| Zéro erreur console | ✅ |

## 2. Authentification

| Test | Résultat |
|---|---|
| Client : login prod `qa.prod.…@exemple.ne` | ✅ redirigé vers `/compte` |
| Client : logout prod | ✅ retour `→ /` |
| Admin : login `admin.test@exemple.ne` | ✅ `→ /admin`, sidebar affichée, rôle « Administrateur » |
| Admin : logout + re-protection `/admin` | ✅ logout `→ /connexion`, accès refusé après déconnexion |
| Livreur : login `bassirouyahayamoubarak20@gmail.com` | ✅ `→ /driver`, espace affiché |
| Livreur : logout (profil) + re-protection `/driver` | ✅ flush + `→ /connexion` |
| Anonyme bloqué sur `/admin` et `/driver` | ✅ redirection `→ /connexion?returnTo=…` |
| Bouton Google sur l'inscription | ✅ **retiré** (réactivable plus tard) — attendu 0, vérifié 0 en prod |

## 3. Tests automatisés

| Suite | Résultat |
|---|---|
| `scripts/smoke-local-proxy.mjs` (E2E local, session réelle) | ✅ 19/19 TOUS OK |
| `scripts/pwa-prod-test.mjs` (36 assertions PWA prod, 3 apps) | ✅ CAMPAGNE PWA PROD : TOUS OK |
| `scripts/check-auth-prod.mjs` (auth admin + livreur prod, rejouable) | ✅ 15/15 TOUS OK |
| `scripts/check-google-btn.mjs` | ✅ bouton Google : 0 |
| `npm run test:run` (vitest) | ✅ 12/12 |
| `npm run typecheck` | ✅ 0 erreur |
| `npm run lint` | ✅ 0 erreur (10 warnings préexistants) |
| `npm run build` | ✅ OK (`ƒ /manifest.webmanifest`) |

## 4. Sécurité

| Contrôle | Résultat |
|---|---|
| En-têtes (3 domaines) | ✅ `Strict-Transport-Security` 2 ans, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` |
| Cookies de session | ✅ `Secure`, `SameSite=Lax`, cookie panier `httpOnly` |
| RBAC / gardes de page côté serveur | ✅ layout AdminProtection (`guardPage`) avant tout rendu |
| Isolation Client / Admin / Livreur | ✅ un espace ne sert pas les routes des autres |
| Comptes de test | `admin.test@exemple.ne` (admin), `qa.prod.1791481349445@exemple.ne` (client), livreur gmail — bootstrap dans `provision-test-accounts.mjs` |
| Secrets | ✅ jamais committés (`.env*`, `scripts/audit-results/*`, `admin-auth.json`) |

## 5. URL de production

- Boutique Client : **https://boutique-client-two.vercel.app**
- Administration : **https://boutique-admin-niger.vercel.app**
- Espace Livreur : **https://livreur-nu.vercel.app**

## 6. Problèmes restants

| Sévérité | Problème | Statut |
|---|---|---|
| P0 | Aucun | — |
| P1 | Aucun | — |
| P2 | Manifest exporté dynamiquement en fonction du `Host` : fonctionne sur les 3 domaines Vercel, mais un déploiement depuis `apps/*` n'est pas supporté (option B retenue) | → documenté |
| P2 | Test E2E : flux login → redirection doit attendre ~15 s (navigation client Next.js + PNA) ; `waitForURL` est sujet à course | → contourné (`waitForTimeout`), à fiabiliser |
| P3 | Push Web Notification : non activé (pas de VAPID renseigné) | → volontaire, hors périmètre |
| P3 | 10 warnings ESLint préexistants, aucune erreur | → à assainir si souhaité |
| — | Bouton Google de l'inscription retiré, réactivation voulue plus tard | → action utilisateur (credentials OAuth Supabase + `enabled`) |

## 7. Décisions

- Le manifest devient dynamique **par hôte** (`app/manifest.ts`) : chaque domaine reçoit le bon nom / `start_url` / action.
- Le smoke login adopte `waitForTimeout(15000)` au lieu de `waitForURL` : le login réussit en ~3-5 s (cookie ~3 s, `/compte` ~5 s) mais la course de navigation déjouait `waitForURL`.

---

**Conclusion : la cible demandée est atteinte — les 3 applications sont déployées, installables, sécurisées et testées en production.**