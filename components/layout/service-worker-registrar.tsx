"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker de l'application hors ligne.
 *
 * L'enregistrement ne se fait qu'en production : en développement, un cache
 * servi à tort masque les modifications en cours.
 *
 * `next dev` sert le dossier `public/` en direct ; le fichier `/sw.js` n'est
 * donc pas versionné par le build et doit être explicitement exclu du
 * préchargement de Next pour éviter un avertissement de cache.
 *
 * Les mises à jour ne s'imposent jamais : le nouveau worker attend, et son
 * installation n'est déclenchée qu'après accord explicite de la personne.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Hors production, aucun service worker ne doit contrôler la page : un
    // worker installé par une visite précédente (build de production sur le
    // même `localhost:3000`) servirait sinon de vieux JS/CSS et masquerait
    // les modifications en cours — voire renverrait des 503 synthétiques
    // quand le serveur de dev redémarre. On le désinstalle donc, ainsi que
    // ses caches statiques.
    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        try {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((registration) => registration.unregister())
          );
          if ("caches" in window) {
            const names = await caches.keys();
            await Promise.all(
              names
                .filter((name) => name.startsWith("static-"))
                .map((name) => caches.delete(name))
            );
          }
        } catch {
          // Nettoyage opportuniste : un échec ne doit jamais gêner la page.
        }
      })();
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Le service worker n'appelle plus `skipWaiting()` de lui-même : une
        // nouvelle version reste en attente pour ne pas remplacer
        // l'application pendant une commande en cours. Son activation est
        // donc proposée, et jamais imposée.
        if (registration.waiting) {
          showUpdatePrompt(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            // `controller` est absent si aucun service worker ne contrôlait
            // encore la page : c'est la première installation, pas une mise à
            // jour, et rien n'est à proposer.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              showUpdatePrompt(installing);
            }
          });
        });
      } catch (error) {
        // Une PWA non disponible ne doit jamais empêcher la navigation :
        // le site reste pleinement utilisable sans service worker.
        console.warn("[pwa] enregistrement du service worker impossible :", error);
      }
    };

    const showUpdatePrompt = (worker: ServiceWorker) => {
      if (!window.confirm(
        "Une nouvelle version d'ISF NAF-CHOPOP est disponible.\n\n" +
          "Voulez-vous l'installer maintenant ? La page va se recharger."
      )) {
        return;
      }

      // Le message active la version en attente ; `controllerchange` recharge
      // une seule fois, après que le nouveau worker contrôle la page.
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      worker.postMessage({ type: "SKIP_WAITING" });
    };

    // L'enregistrement après `load` évite de concurrencer le chargement initial.
    if (document.readyState === "complete") {
      void register();
      return;
    }

    window.addEventListener("load", () => void register(), { once: true });
  }, []);

  return null;
}