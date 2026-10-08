const CACHE_VERSION = "v2.1.0";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";

/**
 * Ressources préchargées à l'installation.
 * Chaque entrée doit exister réellement : `addAll` échoue en bloc et ferait
 * échouer l'installation entière du service worker.
 */
const STATIC_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // `addAll` est tout-ou-rien : on tolère l'échec d'une ressource isolée
      // pour qu'un asset manquant ne condamne pas l'installation entière.
      await Promise.all(
        STATIC_ASSETS.map(async (asset) => {
          try {
            await cache.add(asset);
          } catch (error) {
            console.warn("[sw] préchargement ignoré :", asset, error);
          }
        })
      );
    })
  );

  // Pas de `skipWaiting()` : une nouvelle version attend la fermeture des
  // onglets. Sans cette prudence, un client en cours de commande verrait
  // l'application changer de version sous ses doigts. L'activation est
  // demandée explicitement par la page (voir `SKIP_WAITING` plus bas).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            // Toutes les anciennes versions sont supprimées, y compris
            // `api-*` : cette version ne met rien de privé en cache.
            .filter((name) => name !== STATIC_CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Seul le GET est intercepté. POST, PUT et DELETE ne sont jamais mis en
  // cache ni rejoués : c'est ce qui garantit qu'une commande ne peut pas être
  // resservie ou dupliquée depuis un cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Hors périmètre : autres origines (Supabase, Stripe, Turnstile).
  if (url.origin !== self.location.origin) return;

  // Aucune donnée privée en cache.
  //
  // Une version précédente mettait en cache toute réponse `GET /api/**` en
  // stratégie « réseau d'abord ». Or la Cache API n'honore pas
  // `Cache-Control: no-store` : l'export d'export des commandes — nom, prénom,
  // téléphone de tous les clients — demeurait dans le navigateur après
  // déconnexion, et pouvait être resservi à la personne suivante sur un poste
  // partagé. La stratégie est donc supprimée : les données applicatives
  // viennent des Server Components, que le service worker n'intercepte pas.
  if (url.pathname.startsWith("/api/")) return;

  // Requêtes du framework : elles transportent l'état de rendu des Server
  // Components et peuvent contenir des données de session. Jamais en cache.
  if (url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/_next/static/")) {
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(handleRequest(request));
});

/**
 * Navigation et ressources de page.
 *
 * La recherche est limitée à `STATIC_CACHE` : sans cette restriction,
 * `caches.match` parcourrait tous les caches, et une réponse.private mise en
 * cache par une version antérieure pourrait encore être servie pour une
 * navigation.
 */
async function handleRequest(request) {
  const cached = await caches.open(STATIC_CACHE).then((cache) => cache.match(request));

  if (cached) return cached;

  try {
    return await fetch(request);
  } catch (error) {
    if (request.mode === "navigate") {
      const offline = await caches.match(OFFLINE_URL);
      // `offline.html` est précaché ; le repli final évite qu'un
      // `respondWith` reçoive `undefined`, ce que le standard refuse.
      if (offline) return offline;
    }

    console.warn("[sw] ressource indisponible :", request.url, error);

    return new Response("", {
      status: 503,
      statusText: "Offline",
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.open(STATIC_CACHE).then((cache) => cache.match(request));
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Une ressource statique absente du cache n'a pas de repli « page
    // hors ligne » : on renvoie une réponse vide plutôt qu'un document HTML
    // dans un contexte non-navigateur.
    console.warn("[sw] ressource statique indisponible :", request.url, error);
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch (error) {
    console.warn("[sw] notification illisible :", error);
    return;
  }

  const options = {
    body: data.body || "Nouvelle notification",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: [100, 50, 100],
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "ISF NAF-CHOPOP", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin
  ).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Réutilise d'abord l'onglet qui affiche déjà la destination : sans
        // cela, le premier onglet trouvé était réquisitionné et l'utilisateur
        // perdait la page qu'il consultait.
        for (const client of clientList) {
          if ("focus" in client && client.url === target) {
            return client.focus();
          }
        }

        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }

        return clients.openWindow(target);
      })
  );
});