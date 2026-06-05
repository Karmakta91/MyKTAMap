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
const CACHE_NAME = "myktamap-cache-v1.36.1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",

  // Doc utilisateur (consommée par le modal Documentation)
  // 🆕 v1.29.3 — Toutes les docs lues par l'app (modale Documentation,
  // Aide IA, Audit) regroupées sous docs/applications/. À la racine :
  // README.md (GitHub) + CLAUDE.md (agents IA). Le reste dans docs/.
  "./docs/applications/README_USER.md",
  "./docs/applications/README_USER.en.md",
  // 🆕 v1.36.1 : guide installation Docker pas-à-pas (FR + EN). Consultable
  // offline pour l'user qui veut self-host mais n'a jamais utilisé Docker.
  // Cf section "🐳 Self-host avec Docker" du README_USER qui linke ces docs.
  "./docs/applications/DOCKER_INSTALL.md",
  "./docs/applications/DOCKER_INSTALL.en.md",
  // Squelette enrichi pour la fonctionnalité 🤖 Aide IA (modale Téléchargement contexte IA)
  "./docs/applications/AI_CONTEXT.md",
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
  "./docs/applications/NETWORK_AUDIT.html",
  "./docs/applications/NETWORK_AUDIT.md",

  // CSS
  "./css/style.css",
  // 🆕 v1.31.4 (P2 progressive lazy CSS) — feuille CSS dédiée Mode Secours,
  // chargée à la demande au boot du module secoursMode.js via _loadCssOnce.
  // ~2750 lignes extraites de style.css principal (allègement parse boot).
  "./css/style-secours.css",
  // 🆕 v1.31.5 (P2 step 2) — 3 chunks lazy supplémentaires extraits du style.css :
  //   - style-meminspector.css : modale 📊 Inspecteur + section Crash Reports
  //   - style-stats-globales.css : modale 📈 Stats globales du plan
  //   - style-filtres.css : modale Filtres unifiée ≡
  // Chargés au boot de leur module consumer respectif via _loadCssOnce.
  "./css/style-meminspector.css",
  "./css/style-stats-globales.css",
  "./css/style-filtres.css",

  // JS principaux
  // Copyright + watermark + détection DevTools — chargé EN PREMIER dans index.html
  "./js/copyright.js",
  // 🕵️ v1.31.8 F2 : Incognito Mode — shim Storage + IDB en in-memory si
  // ?incognito=1. Chargé SYNC juste après copyright pour intercepter avant
  // tout autre module. Mode normal : pose juste window.IncognitoMode = {...}.
  "./js/incognitoMode.js",
  // 🆕 v1.28.2 : détecteur de licence pro via présence de /Licence-pro.json.
  // 100% transparent côté community (fichier absent → 404 silencieux → mode
  // community par défaut). Module sans effet visible si pas de Licence-pro.json.
  "./js/proLicense.js",
  // 🆕 v1.13.0 : ThemeManager — toggle thème clair/sombre limité mode carte
  "./js/themeManager.js",
  "./js/networkAudit.js",
  // 🆕 v1.20.0 : CrashReports — archive auto des kills mémoire (IDB myktamap_crashes)
  "./js/crashReports.js",
  // 🆕 v1.19.0 : MemInspector — topo lisible mémoire (localStorage, IDB, cache, runtime, crashes)
  "./js/memInspector.js",
  // 🆕 v1.20.0 : StatsGlobales — modale stats agrégées plan complet (session + embedded)
  "./js/statsGlobales.js",
  // 🆕 v1.20.0 : Tutorial — onboarding cards premier-lancement (8 cards)
  "./js/tutorial.js",
  // 🆕 v1.20.0 : UserProfile — mini profil utilisateur (surnom + photo) en IDB dédiée (myktamap_profile)
  "./js/userProfile.js",
  // 🆕 v1.20.0 : ProfileExportImport — profil utilisateur complet (remplace l'ancien export liste plans)
  "./js/profileExportImport.js",
  // 🆕 v1.21.0 (U4) : Raccourcis clavier globaux (E M Z S T L B R)
  "./js/shortcuts.js",
  // 🆕 v1.21.0 (U1) : Mode présentation (touche F, cache UI sauf carte+zoom+boussole)
  "./js/presentationMode.js",
  // 🆕 v1.21.1+ : Wake Lock API — toggle "Garder l'écran allumé" dans Réglages
  "./js/wakeLock.js",
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
  // 🔥 v1.21.2 : Heatmap RÉACTIVÉE — la timeline tracker GPS est maintenant
  // persistée dans SessionPersist + SessionBackups, donc la heatmap peut
  // enfin agréger des trajectoires multi-sessions (= cas d'usage qui
  // justifiait son existence initiale, validé maintenant que la persistance
  // est en place).
  "./js/heatmap.js",
  // 🆕 v1.16.0 step 2 : module de personnalisation de la légende (cascade
  // session > plan > default). Doit être caché pour fonctionner offline.
  "./js/legendCustomization.js",
  // 🆕 v1.16.0 step 3 : module Favoris (points POI par plan)
  "./js/favoris.js",
  // 🆕 v1.16.0 step 4 : module SessionBackups (10 snapshots FIFO en IDB)
  "./js/sessionBackups.js",
  "./js/exporter.js",
  // 🆕 v1.10.3 : module Export PDF imprimable (jsPDF + canvas exporter).
  // Doit être caché pour fonctionner offline.
  "./js/pdfExport.js",
  "./js/sessionExporter.js",
  // 🆕 v1.33.0 D1 : SessionReport — rapport post-mission PDF/JSON/Texte
  "./js/sessionReport.js",
  // 🆕 v1.34.0 E1 : VoiceCommand — commandes vocales push-to-talk Web Speech API
  "./js/voiceCommand.js",
  "./js/voiceTts.js",
  // 🆕 v1.35.0 : SortieUrgence — Mode Sortie d'urgence (POIs sortie + pathfinder)
  "./js/sortieUrgence.js",
  // 🆕 v1.34.30 : mdParser — parser MD inline minimaliste (utilisé par modeHistoire)
  "./js/mdParser.js",
  "./js/modeHistoire.js",
  "./js/kmzExport.js",
  "./js/kmzImport.js",
  // 🆕 v1.14.0 : GPX import + export (réutilise calibrage KMZ)
  "./js/gpxIO.js",
  // 🆕 v1.15.0 : GPX → ZIP MyKTAMap (canvas vierge auto-calibré)
  "./js/gpxImport.js",
  "./js/tableEditor.js",
  "./js/searchPoints.js",
  "./js/createConf.js",
  "./js/planRegistry.js",
  "./js/sessionPersist.js",
  "./js/oomGuard.js",
  "./js/pathfinder.js",
  "./js/roadGraph.js",
  "./js/updateChecker.js",
  "./js/alertChecker.js",
  "./js/lostMode.js",
  // 🆕 v1.10.1 : Mode urgence (panique) — module léger, indispensable
  // offline (l'user peut être en sous-sol sans réseau quand il en a besoin).
  "./js/emergencyMode.js",
  "./js/compass.js",
  "./js/interface.js",
  // 🆕 v1.31.0 (P3 Lot 1) : Module extrait de interface.js — modales
  // alertes publiques + sélecteur multi-alertes + modale update dispo
  "./js/interfaceAlerts.js",
  // 🆕 v1.31.0 (P3 Lot 2) : Module extrait de interface.js — panneau
  // Distance totale des tracés (filtres + surlignage magenta)
  "./js/interfaceDistanceTotale.js",
  // 🆕 v1.31.0 (P3 Lot 3) : Module extrait de interface.js — modale
  // Légende plein écran (4 sections + cascade LegendCustomization)
  "./js/interfaceLegende.js",
  // 🆕 v1.31.0 (P3 Lot 4) : Module extrait de interface.js — modales
  // documentation (README + Aide intégrée + Aide IA téléchargement)
  "./js/interfaceDocs.js",
  // 🆕 v1.31.0 (P3 Lot 5) : Module extrait de interface.js — export
  // session JSON + import (JSON/GPX/KMZ) + modale de choix d'import
  "./js/interfaceImportExport.js",
  // 🆕 v1.31.0 (P3 Lot 6) : Module extrait de interface.js — modale
  // Itinéraire + POPUP POI + LABEL DISTANCE + Presets + Évitements
  "./js/interfaceItineraire.js",
  // 🆕 v1.31.0 (P3 Lot 7) : Module extrait de interface.js — calibrage
  // échelle + reset complet + mise à jour douce + helpers ping
  "./js/interfaceMaintenance.js",
  // 🆕 v1.31.0 (P3 Lot 9 — DERNIER LOT) : Module extrait de interface.js
  // — modale Réglages + sections Perf ULTRA + M-LVL + Géoref + helpers
  "./js/interfaceConfig.js",
  // 🆕 v1.21.5 : FilterPanel (modale unifiée Filtres ≡)
  "./js/filterPanel.js",
  // 🆕 v1.31.4 (P2 progressive lazy CSS) : helper window._loadCssOnce(href, id).
  // Chargé AVANT secoursMode.js dans index.html (consommateur).
  "./js/cssLazy.js",
  // 🆕 v1.22.0 : Mode Secours (assignment équipes de recherche)
  "./js/secoursMode.js",
  // 🆕 v1.24.0 Phase 3 : Store IDB dédié photos Mode Secours (vue Live)
  "./js/secoursPhotos.js",
  // ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — entry retirée
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
          // 🐛 v1.21.3 (audit P0-7) : enregistre l'URL absolue de l'asset
          // dans le set "intouchable" pour que la LRU eviction ne supprime
          // jamais l'app shell.
          const absUrl = _cacheKeyOf(asset);
          if (absUrl) _staticAssetUrls.add(absUrl);
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

  // 🐛 v1.21.3 (audit P0-7) : si le SW redémarre (mais que le cache existe
  // déjà installé via une session précédente), on doit re-populer
  // _staticAssetUrls avant le 1er fetch. Sinon la LRU eviction au prochain
  // appel à _scheduleEviction pourrait considérer les statics comme évinçables.
  ASSETS_TO_CACHE.forEach((asset) => {
    const absUrl = _cacheKeyOf(asset);
    if (absUrl) _staticAssetUrls.add(absUrl);
  });

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
// MESSAGE (hotfix21)
// =========================
// Handler de messages client → SW. Permet au client de :
//   1. Récupérer le CACHE_NAME courant (via MessageChannel) — utilisé par
//      mettreAJourCodeSeul() pour ne PAS purger le cache qu'on vient juste
//      de remplir au cours de reg.update(). Avant hotfix21, la soft update
//      téléchargeait ~100 assets via install puis les supprimait juste
//      après, forçant un re-download au reload = double latence inutile.
//   2. Déclencher skipWaiting explicitement si une nouvelle version attend.
//      Notre install fait déjà self.skipWaiting() mais on garde le handler
//      pour future flexibilité (rollout staged, etc.).
//
// Pattern MessageChannel : le client crée un channel, envoie port2 au SW,
// le SW répond via event.ports[0] (= port2). Garantit que la réponse
// arrive au bon client même si plusieurs onglets ouverts.
self.addEventListener("message", (event) => {
  // 🆕 v1.25.4 audit sécu point C — Defense-in-depth : reject les messages
  // d'une origine différente. Standard SW garantit déjà l'isolation par
  // origine (un SW ne reçoit que les postMessage de clients dans son scope),
  // mais on ajoute le check explicite par paranoia/lecture audit. Coût zéro,
  // protège contre une éventuelle régression du browser ou un bug futur où
  // un mécanisme indirect (BroadcastChannel mal scopé, etc.) ferait passer
  // un message cross-origin.
  if (event.origin && event.origin !== self.origin) {
    console.warn("[SW] message reject : origine étrangère " + event.origin);
    return;
  }

  const data = event.data || {};
  if (data.type === "GET_CACHE_NAME") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: "CACHE_NAME", name: CACHE_NAME });
    }
    return;
  }
  if (data.type === "SKIP_WAITING") {
    // No-op pratique aujourd'hui car install fait déjà skipWaiting(),
    // mais permet un déclenchement explicite si jamais on retirait
    // skipWaiting() de install (rollout progressif futur).
    self.skipWaiting();
    return;
  }
});

// =========================
// FETCH
// =========================

// 🐛 v1.21.3 (audit P0-7) : LRU cap pour le cache dynamique. Avant : chaque
// requête réseau était ajoutée au cache sans limite, donc en consultant 20
// plans différents le cache pouvait grossir de plusieurs centaines de Mo,
// déclenchant la purge OS qui détruit aussi les assets app critiques (cycle
// CacheStorage+IDB atomique). Maintenant : on cap à MAX_DYNAMIC_ENTRIES en
// excluant les URLs précachées au install (qui doivent rester intouchables).
const MAX_DYNAMIC_ENTRIES = 800;  // ~120 Mo si tiles ~150 KB en moyenne
const _staticAssetUrls = new Set(); // populé au install ci-dessous

// Helper : normalise un URL ou request en une clé de comparaison
function _cacheKeyOf(reqOrUrl) {
  try {
    if (typeof reqOrUrl === "string") return new URL(reqOrUrl, self.location.origin).href;
    if (reqOrUrl && reqOrUrl.url) return reqOrUrl.url;
  } catch(e) {}
  return null;
}

// LRU debounced : déclenché après un cache.put, en async. Au lieu de tourner
// à chaque requête, on planifie 1× toutes les 30s max via un flag.
let _evictionScheduled = false;
function _scheduleEviction() {
  if (_evictionScheduled) return;
  _evictionScheduled = true;
  // setTimeout n'est pas dispo dans tous les SW (workers limitent les timers)
  // mais Chrome/Safari modernes supportent. Fallback : run direct.
  const _run = () => {
    _evictionScheduled = false;
    caches.open(CACHE_NAME).then((cache) => cache.keys().then((reqs) => {
      // Filtre : ne touche qu'aux entrées DYNAMIQUES (pas précachées au install).
      const dynamic = reqs.filter((r) => !_staticAssetUrls.has(_cacheKeyOf(r)));
      if (dynamic.length <= MAX_DYNAMIC_ENTRIES) return;
      // FIFO : delete les plus anciens (en début d'array = insertion plus
      // ancienne, c'est la sémantique Cache API standard).
      const toEvict = dynamic.length - MAX_DYNAMIC_ENTRIES + 50;  // +50 = buffer pour éviter le yo-yo
      const slice = dynamic.slice(0, toEvict);
      return Promise.all(slice.map((r) => cache.delete(r))).then(() => {
        console.log("[SW] LRU eviction :", slice.length, "entrées (cache dynamique cap " + MAX_DYNAMIC_ENTRIES + ")");
      });
    })).catch((e) => console.warn("[SW] LRU eviction erreur :", e));
  };
  // Délai pour debounce (évite N evictions consécutives sur burst de fetch)
  try { setTimeout(_run, 30000); } catch(e) { _run(); }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // 🐛 v1.34.8 — Ignore les schemes non-http(s) (chrome-extension://,
  // moz-extension://, safari-web-extension://, etc.). Les extensions
  // installées par l'user (adblocker, password manager, etc.) peuvent
  // émettre des fetch vers leurs propres ressources via la page MyKTAMap.
  // Le SW intercepte ces requêtes, mais le Cache API REFUSE les schemes
  // ≠ http/https → TypeError "Failed to execute 'put' on 'Cache': Request
  // scheme 'chrome-extension' is unsupported" (cf sw.js l527 ancien).
  // Bénin (l'extension reçoit sa réponse réseau normale) mais pollue la
  // console avec un error répété → confusion avec un vrai bug.
  // Fix : early-return sans event.respondWith → le SW n'intervient pas,
  // le navigateur résout la requête directement.
  const reqProtocol = (event.request.url || "").split(":")[0];
  if (reqProtocol !== "http" && reqProtocol !== "https") return;

  // 🆘 hotfix20 — Bypass cache TOTAL pour /killsw.html (page de reset
  // d'urgence). Si on cachait cette page, le SW coincé servirait
  // l'ancienne version qui ne ferait pas le bon kill switch. Toujours
  // récupérer la dernière version depuis le serveur, JAMAIS cacher.
  // Le `network-only + no-store` garantit qu'elle est toujours fraîche
  // même si le SW est zombie ailleurs.
  const reqUrl = event.request.url || "";
  if (/\/killsw\.html(\?|$)/.test(reqUrl)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => new Response("<!doctype html><h1>killsw.html indispo offline</h1>", {
          status: 503,
          headers: { "Content-Type": "text/html" }
        }))
    );
    return;
  }

  // 🏷️ v1.28.2 — Bypass cache TOTAL pour /Licence-pro.json (signal
  // d'instance pro). Doit être TOUJOURS fetched live depuis le serveur :
  //  - Sur community (myktamap.fr) : 404 attendu → mode community
  //  - Sur instance pro : 200 attendu → mode pro activé côté client
  //  - Si un déployeur retire le fichier, le mode pro doit s'éteindre
  //    instantanément au prochain check (pas de cache LRU qui le maintient).
  // Le `cache: "no-store"` force la requête vers le réseau, le `catch` retourne
  // un 404 explicite si offline (= revient en mode community gracieusement).
  if (/\/Licence-pro\.json(\?|$)/.test(reqUrl)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => new Response("", {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }))
    );
    return;
  }

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
            // 🐛 v1.21.3 (P0-7) : planifie une eviction LRU si on a dépassé le cap.
            _scheduleEviction();
          });

          return networkResponse;
        })
        .catch(() => {
          // 🆕 v1.31.6-fix1 (hotfix offline robustesse) — le .catch() doit
          // TOUJOURS retourner une Response valide.
          //
          // Pour les navigations document (HTML), on essaie PLUSIEURS clés
          // de cache car index.html peut être stocké sous différentes URL
          // selon comment il a été demandé à l'install :
          //   - "./" → résolu à <origin>/
          //   - "./index.html" → résolu à <origin>/index.html
          //   - et leurs variantes absolues
          // L'install met les DEUX (cf ASSETS_TO_CACHE), mais en cas de
          // bug install partiel (un seul des deux cachés), on tente
          // chaque clé jusqu'à trouver. Sinon page d'erreur claire avec
          // bouton recovery vers killsw.html.
          //
          // Pour les assets non-document (CSS/JS/img/json/…) → 504
          // explicite. Côté consumer, le browser traite ça comme un fetch
          // échoué normal — c'est ce qu'attend le link.onerror de
          // _loadCssOnce (fallback dégradé) et les fetch métier .catch().
          if (event.request.destination === "document") {
            return caches.match("./index.html")
              .then((r) => r || caches.match("./"))
              .then((r) => r || caches.match("/index.html"))
              .then((r) => r || caches.match("/"))
              .then((r) => r || new Response(
                "<!doctype html><html lang=fr><head><meta charset=utf-8>" +
                "<title>MyKTAMap — Hors-ligne</title>" +
                "<style>body{font-family:system-ui,sans-serif;background:#0a0d18;color:#e8eaf0;padding:24px;line-height:1.6;max-width:640px;margin:0 auto}" +
                "h1{color:#f4c542}code{background:#1a1f2e;padding:2px 6px;border-radius:4px;color:#8cb4ff}" +
                "a{color:#8cb4ff;text-decoration:underline}a:hover{color:#f4c542}" +
                "button{background:#f4c542;color:#1a1f2e;border:0;padding:10px 20px;border-radius:6px;font-weight:700;cursor:pointer;margin-top:16px}</style></head><body>" +
                "<h1>⚠️ Hors-ligne</h1>" +
                "<p>L'application n'a pas pu se charger en mode hors-ligne. Le Service Worker n'a pas trouvé <code>index.html</code> dans son cache local.</p>" +
                "<p><strong>Solutions :</strong></p>" +
                "<ol>" +
                "<li>Reconnecte-toi à Internet puis rafraîchis la page (F5 ou Ctrl+R).</li>" +
                "<li>Si le problème persiste, va sur <a href='/killsw.html'>/killsw.html</a> pour réinitialiser le Service Worker (tes données locales sont conservées).</li>" +
                "</ol>" +
                "<button onclick='location.reload()'>↻ Recharger la page</button>" +
                "</body></html>",
                { status: 504, headers: { "Content-Type": "text/html; charset=utf-8" } }
              ));
          }
          return new Response("", {
            status: 504,
            statusText: "Offline (asset not cached)"
          });
        });
    })
  );
});