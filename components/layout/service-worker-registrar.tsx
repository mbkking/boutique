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
      // Évite les doublons si on reçoit l'événement plusieurs fois.
      if (document.getElementById("sw-update-toast")) return;

      const style = document.createElement("style");
      style.textContent = `
        #sw-update-toast {
          position: fixed;
          left: 50%;
          bottom: 24px;
          transform: translateX(-50%);
          z-index: 9999;
          background: linear-gradient(135deg, #0f766e, #115e59);
          color: #fff;
          padding: 16px 20px;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.25);
          font-family: system-ui, sans-serif;
          max-width: min(90vw, 420px);
          text-align: center;
        }
        #sw-update-toast h3 { margin: 0 0 6px; font-size: 16px; font-weight: 700; }
        #sw-update-toast p { margin: 0 0 12px; font-size: 13px; opacity: 0.92; }
        #sw-update-toast button {
          background: #f59e0b;
          color: #111;
          border: none;
          padding: 10px 22px;
          border-radius: 9999px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
        }
      `;
      document.head.appendChild(style);

      const toast = document.createElement("div");
      toast.id = "sw-update-toast";
      toast.innerHTML = `
        <h3>✨ Nouvelle version d'ISF NAF-CHOPOP</h3>
        <p>Une nouvelle version de l'application est prête, avec des améliorations et corrections. Mettez-la à jour pour profiter de la meilleure expérience.</p>
        <button id="sw-update-btn" type="button">Mettre à jour maintenant</button>
      `;
      document.body.appendChild(toast);

      document.getElementById("sw-update-btn")?.addEventListener("click", () => {
        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });

        worker.postMessage({ type: "SKIP_WAITING" });
      });
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