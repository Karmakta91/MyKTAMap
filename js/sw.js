const cacheName = "site-test-cache-v1";
const assetsToCache = [
  "/index.html",
  "/css/style.css",
  "/js/sw.js",
  "js/config.js",
  "js/utils.js",
  "js/measure.js",
  "js/tiling.js",
  "js/map.js",
  "js/tracking.js",
  "js/editor.js",
  "js/road.js",
  "js/zones.js",
  "js/exporter.js",
  "js/sessionExporter.js",
  "js/tableEditor.js",
  "js/searchPoints.js",
  "js/createConf.js",
  "js/interface.js",
  "js/main.js",
  "/README.MD",
  "/README_USER.MD",


  
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
