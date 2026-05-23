/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// SERVICE WORKER — MyKtaMAP
// =========================
// Liste des assets cachés pour utilisation offline.
//
// 📁 Organisation depuis v1.8.0 : toute la documentation (sauf README.md
//    qui reste à la racine pour GitHub) est dans le sous-dossier docs/.
//
// NE PAS cacher README.md à la racine (réservé aux développeurs / GitHub).
// NE PAS cacher docs/CLAUDE.md (réservé aux agents IA / développeurs).
// NE PAS cacher version.json (toujours fetched en réseau via cache-bust ?_=).
// NE PAS cacher alert.json (idem — diffusion d'alertes publiques en temps réel).
// NE PAS cacher ping.html (depuis v1.9.3 — ping santé serveur, doit toujours
//   hit le serveur en live via cache-bust ?_= sinon false positive si serveur
//   down après un succès précédent).
// NE PAS cacher docs/nginx-csp-config.conf (fichier serveur, ne sert qu'à l'auteur).
// Cacher docs/README_USER.md (utilisé par le modal Documentation in-app).
// Cacher docs/AI_CONTEXT.md (squelette enrichi pour la modale 🤖 Aide IA — éditable).
// Cacher LICENSE (visible offline si l'utilisateur veut consulter la licence).
// Cacher docs/NETWORK_AUDIT.html + .md (page de transparence audit, ouverte
//   depuis ⚙️ Configuration → 🔒 Confidentialité → 📖).
// =========================

// 🎨 v1.9.x — Refonte UI officialisée depuis v1.9.1 (mergée sur main).
// v1.9.2 (22/05/2026) : consolidation des 17 fixes post-v1.9.1
// (loader fullscreen PC, modales agrandies, tracker rotation
// continue, splash KARMA animé + crédits Dijkstra, etc.).
const CACHE_NAME = "myktamap-cache-v1.14.20-hotfix8-kmz-types";

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",

  // Doc utilisateur (consommée par le modal Documentation)
  "./docs/README_USER.md",
  // Squelette enrichi pour la fonctionnalité 🤖 Aide IA (modale Téléchargement contexte IA)
  "./docs/AI_CONTEXT.md",
  // Licence (consultable offline si l'utilisateur veut verifier les conditions d'usage)
  "./LICENSE",
  // 🆕 v1.8.0 : page de transparence détaillée pour l'audit réseau, en 2
  // versions :
  //   - .html : page HTML formatée (style cohérent charte) ouverte depuis le
  //     bouton "Doc complète" de la modale audit. C'est CELLE que les
  //     utilisateurs voient. Cachée car servie en mode "document" → si on
  //     servait du .md brut, le SW fallback `caches.match(index.html)`
  //     pourrait servir le splash à la place en cas d'échec/non-cache.
  //   - .md : version source markdown, gardée pour audit de code (GitHub
  //     web view, lecture par IA, etc.). Pas exposée directement à l'UI mais
  //     cachée par cohérence.
  "./docs/NETWORK_AUDIT.html",
  "./docs/NETWORK_AUDIT.md",

  // CSS
  "./css/style.css",

  // JS principaux
  // Copyright + watermark + détection DevTools — chargé EN PREMIER dans index.html
  "./js/copyright.js",
  // 🆕 v1.13.0 : ThemeManager — toggle thème clair/sombre limité mode carte
  "./js/themeManager.js",
  "./js/networkAudit.js",
  "./js/debug.js",
  "./js/perfUltra.js",
  // 🎨 Refonte UI v1 (branche Refonte_interface). Module no-op si flag
  // localStorage["myktamap_refonte_v1"] absent. Cachée pour que le toggle
  // marche aussi en mode offline.
  "./js/refonteInterface.js",
  "./js/unlockGate.js",
  // 🆕 v1.9.4 : code d'accès local optionnel (PIN/biométrie). Indispensable
  // offline (la gate s'affiche au boot avant tout fetch réseau, donc le
  // module DOIT être en cache).
  "./js/pinLock.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/measure.js",
  "./js/tiling.js",
  "./js/map.js",
  "./js/tracking.js",
  "./js/editor.js",
  "./js/road.js",
  "./js/zones.js",
  // 🆕 v1.9.3-A1.a : module structures (piliers 1ère/2e masse + murs).
  // Doit être caché pour fonctionner offline comme le reste.
  "./js/structures.js",
  // 🆕 v1.9.3-B1 : module photos (backend IndexedDB + compression).
  // Self-contained, exposé via window.MyKTAMapPhotos. Doit être caché
  // pour que l'attachement photo fonctionne offline.
  "./js/photos.js",
  // 🆕 v1.9.3-B1c : viewer photo plein écran (pinch-zoom + pan + swipe).
  // Self-contained, exposé via window.MyKTAMapPhotoViewer. Caché pour
  // visionnage offline des photos déjà attachées aux POI.
  "./js/photoViewer.js",
  // 🆕 v1.11.0 : Undo/Redo global (snapshot RAM + raccourcis clavier).
  // Doit être caché pour fonctionner offline (l'historique est lui-même
  // en RAM, mais le module JS doit être disponible offline pour réagir
  // aux Ctrl+Z / Ctrl+Y).
  "./js/historyManager.js",
  // 🆕 v1.11.1 V2 : BatteryGuard (indicateur batterie + warnings).
  // Module léger, no-op gracieux si Battery API indispo (Safari iOS).
  "./js/batteryGuard.js",
  // 🆕 v1.11.3 V2.3 : TrackerReplay (modale replay timeline tracker + export CSV).
  "./js/trackerReplay.js",
  // 🚫 v1.11.4 V2.4 : Heatmap — DÉSACTIVÉ depuis v1.12.0 (cf. commentaire
  // dans index.html). Le fichier reste dans le repo mais pas chargé ni caché.
  // Pour réactiver : décommenter le <script> dans index.html + restaurer
  // "./js/heatmap.js" ci-dessous + restaurer le bouton 🔥 dans interface.js.
  // "./js/heatmap.js",
  "./js/exporter.js",
  // 🆕 v1.10.3 : module Export PDF imprimable (jsPDF + canvas exporter).
  // Doit être caché pour fonctionner offline.
  "./js/pdfExport.js",
  "./js/sessionExporter.js",
  "./js/kmzExport.js",
  "./js/kmzImport.js",
  // 🆕 v1.14.0 : GPX import + export (réutilise calibrage KMZ)
  "./js/gpxIO.js",
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
  // 🆕 v1.10.1 : Mode urgence (panique) — module léger, indispensable
  // offline (l'user peut être en sous-sol sans réseau quand il en a besoin).
  "./js/emergencyMode.js",
  "./js/compass.js",
  "./js/interface.js",
  "./js/main.js",

  // Librairies
  "./lib/jszip.min.js",
  // 🆕 v1.10.3 : jsPDF UMD pour l'export PDF imprimable.
  "./lib/jspdf.umd.min.js",
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
  // 🆕 v1.9.3-A1.a : fichier structure.json (vide par défaut pour les
  // plans de test livrés avec l'app — KARMA peut y dessiner ses piliers).
  "./data/test1/structure.json",
  "./data/test1/TestMAP.png",
  "./data/test1/collision.png",
  "./data/test2/editor.json",
  "./data/test2/carriere.json",
  "./data/test2/puits.json",
  "./data/test2/chemin.json",
  "./data/test2/plan-config.json",
  "./data/test2/zone.json",
  "./data/test2/structure.json",
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
  "./icon/compass.png",
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
          // 🆕 v1.9.2-cache-fix (KARMA "déployé via FTP mais je vois
          // toujours v1.8.1") : `cache.add(url)` utilise le HTTP cache
          // du navigateur par défaut. Si le navigateur avait un
          // Cache-Control valide sur l'ancien fichier, il sert sa copie
          // locale au lieu de fetch le nouveau FTP-déployé → le SW met
          // l'ANCIENNE version dans son cache au bump CACHE_NAME.
          //
          // Fix : `cache: 'reload'` force le bypass du HTTP cache navigateur
          // → fetch direct depuis le serveur → on récupère TOUJOURS la
          // version la plus récente déployée en FTP, indépendamment de
          // ce que le navigateur a en cache HTTP.
          await cache.add(new Request(asset, { cache: "reload" }));
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