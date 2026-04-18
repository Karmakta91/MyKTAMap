const cacheName = "site-test-cache-v1";
const assetsToCache = [
  "/index.html",
  "/css/style.css",
  "/js/map.js",
  "/js/utils.js",
  "/js/main.js",
  "/js/sw.js",
  "/jstracking.js",
  "/js/measure.js",
  "/js/editor.js",
  "/js/interface.js",
  "/js/config.js",

  // Données JSON

  "/data/cataphile.json",
  "/data/vehicule.json",
  "/data/puit.json",
  "/data/carry.json",
  "/data/plan-config.json",

  // Images
  "/data/TestMAP.png",
  "/data/TestMAP_LEGENDE.png",
  "/icon/vehicule.png",
  "/icon/pc.png",
  "/icon/pb.png",
  "/icon/pa.png",
  "/icon/pe.png",
  "/icon/house.png",
  "/icon/info.png",
  "/icon/passage.png",
  "/icon/ps.png",
  "/icon/elec.png",
  "/icon/epure.png",
  "/icon/marker-icon.png",

  // Librairie Leaflet
  "/lib/leaflet/leaflet.css",
  "/lib/leaflet/leaflet.js",
  "/lib/leaflet/leaflet-src.js",
  "/lib/leaflet/leaflet-src.esm.js",

  // Images Leaflet
  "/lib/leaflet/images/layers.png",
  "/lib/leaflet/images/layers-2x.png",
  "/lib/leaflet/images/marker-icon.png",
  "/lib/leaflet/images/marker-icon-2x.png",
  "/lib/leaflet/images/marker-shadow.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(assetsToCache))
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedRes) => cachedRes || fetch(event.request))
  );
});
