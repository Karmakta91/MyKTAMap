/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.is-underground.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// SERVICE WORKER — MyKtaMAP
// =========================
// Liste des assets cachés pour utilisation offline.
// NE PAS cacher README.md ni CLAUDE.md (réservés aux développeurs).
// NE PAS cacher version.json (toujours fetched en réseau via cache-bust ?_=).
// NE PAS cacher alert.json (idem — diffusion d'alertes publiques en temps réel).
// Cacher README_USER.md (utilisé par le modal Documentation in-app).
// Cacher AI_CONTEXT.md (squelette enrichi pour la modale 🤖 Aide IA — éditable).
// Cacher LICENSE (visible offline si l'utilisateur veut consulter la licence).
// =========================

const CACHE_NAME = "myktamap-cache-v152";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",

  // Doc utilisateur (consommée par le modal Documentation)
  "./README_USER.md",
  // Squelette enrichi pour la fonctionnalité 🤖 Aide IA (modale Téléchargement contexte IA)
  "./AI_CONTEXT.md",
  // Licence (consultable offline si l'utilisateur veut verifier les conditions d'usage)
  "./LICENSE",

  // CSS
  "./css/style.css",

  // JS principaux
  // Copyright + watermark + détection DevTools — chargé EN PREMIER dans index.html
  "./js/copyright.js",
  "./js/debug.js",
  "./js/perfUltra.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/measure.js",
  "./js/tiling.js",
  "./js/map.js",
  "./js/tracking.js",
  "./js/editor.js",
  "./js/road.js",
  "./js/zones.js",
  "./js/exporter.js",
  "./js/sessionExporter.js",
  "./js/tableEditor.js",
  "./js/searchPoints.js",
  "./js/createConf.js",
  "./js/planRegistry.js",
  "./js/sessionPersist.js",
  "./js/oomGuard.js",
  "./js/pathfinder.js",
  "./js/updateChecker.js",
  "./js/alertChecker.js",
  "./js/lostMode.js",
  "./js/compass.js",
  "./js/interface.js",
  "./js/main.js",

  // Librairies
  "./lib/jszip.min.js",
  "./lib/leaflet/leaflet.css",
  "./lib/leaflet/leaflet.js",
  "./lib/leaflet/leaflet-src.js",
  "./lib/leaflet/leaflet-src.esm.js",

  // Images Leaflet
  "./lib/leaflet/images/layers.png",
  "./lib/leaflet/images/layers-2x.png",
  "./lib/leaflet/images/marker-icon.png",
  "./lib/leaflet/images/marker-icon-2x.png",
  "./lib/leaflet/images/marker-shadow.png",

  // Données JSON
  "./data/index.json",
  "./data/test1/editor.json",
  "./data/test1/carriere.json",
  "./data/test1/puits.json",
  "./data/test1/chemin.json",
  "./data/test1/plan-config.json",
  "./data/test1/zone.json",
  "./data/test1/TestMAP.png",
  "./data/test1/collision.png",
  "./data/test2/editor.json",
  "./data/test2/carriere.json",
  "./data/test2/puits.json",
  "./data/test2/chemin.json",
  "./data/test2/plan-config.json",
  "./data/test2/zone.json",
  "./data/test2/TestMAP.png",
  "./data/test2/collision.png",

  // Icônes app / points
  "./icon/mkm-full.png",
  "./icon/karma.png",
  "./icon/mkm.png",
  "./icon/mkm-192.png",
  "./icon/mkm-512.png",
  "./icon/marker-icon.png",
  "./icon/vehicule.png",
  "./icon/pc.png",
  "./icon/pb.png",
  "./icon/pa.png",
  "./icon/pe.png",
  "./icon/house.png",
  "./icon/info.png",
  "./icon/passage.png",
  "./icon/ps.png",
  "./icon/elec.png",
  "./icon/epure.png",
  "./icon/chatiere.png",
  "./icon/danger.png",
  "./icon/iconetrack.png",
  "./icon/peo.png",
  "./icon/pef.png",
  "./icon/eso.png",
  "./icon/esf.png",
  "./icon/cao.png",
  "./icon/caf.png",
  "./icon/plaque.png",
];

// =========================
// INSTALL
// =========================

self.addEventListener("install", (event) => {
  console.log("[SW] Installation");

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
          console.log("[SW] Caché :", asset);
        } catch (err) {
          console.warn("[SW] Non caché :", asset, err);
        }
      }
    })
  );

  self.skipWaiting();
});

// =========================
// ACTIVATE
// =========================

self.addEventListener("activate", (event) => {
  console.log("[SW] Activation");

  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log("[SW] Suppression ancien cache :", key);
            return caches.delete(key);
          })
      );
    })
  );

  self.clients.claim();
});

// =========================
// FETCH
// =========================

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type === "opaque"
          ) {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

          return networkResponse;
        })
        .catch(() => {
          if (event.request.destination === "document") {
            return caches.match("./index.html");
          }
        });
    })
  );
});