// =========================
// SERVICE WORKER — MyKtaMAP
// =========================

const CACHE_NAME = "myktamap-cache-v2";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",

  // CSS
  "./css/style.css",

  // JS principaux
  "./js/debug.js",
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
  "./data/editor.json",
  "./data/carriere.json",
  "./data/puits.json",
  "./data/chemin.json",
  "./data/plan-config.json",
  "./data/zone.json",
  "./data/TestMAP.png",
  "./data/collision.png",

  // Icônes app / points
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
  "./icon/iconetrack.png"
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