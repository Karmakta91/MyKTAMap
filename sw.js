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
const CACHE_NAME = "myktamap-cache-v1.68.1";
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
  // 🆕 v1.56.0 : Conditions d'utilisation + avertissement légal (textes de loi
  // intégraux : arrêté du 2 novembre 1955 + réponse Sénat n° 03710). Consultable
  // offline. Cf js/legalGate.js (mirror des textes) + lien Documentation.
  "./docs/applications/CGU.md",

  // 🌍 v1.45.0 : dicos i18n multi-langue (lus par js/langManager.js via fetch).
  // fr.json = langue de référence + fallback obligatoire ; en.json = anglais.
  // Précachés ici pour un fonctionnement offline instantané dès le 1er install.
  // Pour ajouter une langue : déposer lang/<code>.json + l'ajouter ici.
  "./lang/fr.json",
  "./lang/en.json",
  "./lang/es.json",
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
  // 🌍 v1.45.0 : I18n — helper multi-langue (window.I18n). Chargé tôt dans
  // index.html (après copyright). Précharge lang/fr.json + langue active.
  "./js/langManager.js",
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
  // 🔀 Consolidation : modales du home extraites du <script> inline
  // d'index.html (déplacement pur) — journal/doc réseau + gestion SW
  "./js/loaderNetAudit.js",
  "./js/loaderSwModals.js",
  // 🆕 v1.20.0 : CrashReports — archive auto des kills mémoire (IDB myktamap_crashes)
  "./js/crashReports.js",
  // 🆕 v1.19.0 : MemInspector — topo lisible mémoire (localStorage, IDB, cache, runtime, crashes)
  "./js/memInspector.js",
  "./js/modalLifecycle.js",
  // 🆕 v1.43.12 : SwInspector — inspecteur cache Service Worker (diff attendus vs présents)
  "./js/swInspector.js",
  // 🆕 v1.20.0 : StatsGlobales — modale stats agrégées plan complet (session + embedded)
  "./js/statsGlobales.js",
  // 🆕 v1.20.0 : Tutorial — onboarding cards premier-lancement (8 cards)
  "./js/tutorial.js",
  // 🆕 v1.20.0 : UserProfile — mini profil utilisateur (surnom + photo) en IDB dédiée (myktamap_profile)
  "./js/userProfile.js",
  // 🆕 v1.52.0 : gamification du profil (rangs / badges)
  "./js/profileGamification.js",
  // 🆕 v1.53.0 : hauts faits / succès du profil
  "./js/profileAchievements.js",
  // 🆕 v1.20.0 : ProfileExportImport — profil utilisateur complet (remplace l'ancien export liste plans)
  "./js/profileExportImport.js",
  // 🆕 v1.21.0 (U4) : Raccourcis clavier globaux (E M Z S T L B R)
  "./js/shortcuts.js",
  // 🆕 v1.51.0 : Cheatsheet des raccourcis (touche ?)
  "./js/shortcutsCheatsheet.js",
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
  // 🆕 v1.38.0 — Helpers calage image layers (cascade per-plan, math 2 ancres → 3 coins)
  "./js/imageLayerCalibration.js",
  // 🆕 v1.38.0 — UI Picker calage image layers (modale split-screen 2 minimaps)
  "./js/imageLayerCalibrationPicker.js",
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
  // 🆕 v1.39.0 — Vue OSM (plan au-dessus OpenStreetMap)
  "./js/osmView.js",
  "./js/osmHomePreview.js",
  "./js/kmzImport.js",
  // 🆕 v1.14.0 : GPX import + export (réutilise calibrage KMZ)
  "./js/gpxIO.js",
  // 🆕 v1.15.0 : GPX → ZIP MyKTAMap (canvas vierge auto-calibré)
  "./js/gpxImport.js",
  "./js/tableEditor.js",
  "./js/searchPoints.js",
  "./js/createConf.js",
  "./js/planRegistry.js",
  "./js/planDenylist.js",
  "./js/osmTilesCache.js",
  "./js/sessionPersist.js",
  "./js/oomGuard.js",
  "./js/computeLoader.js",
  "./js/legalGate.js",
  "./js/firstRunFlow.js",
  "./js/interPlanLinks.js",
  "./js/crossPlanSearch.js",
  "./js/interPlanRoute.js",
  "./js/planNetwork.js",
  "./js/homeLoader.js",
  "./js/homeProfile.js",
  "./js/homeConfig.js",
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
  // 🧭 v1.37.0 : Picker calibration Nord 2 clics (chargé avant interfaceConfig)
  "./js/northPicker.js",
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
  // 🆕 v1.42.5 : html2canvas pour capture du rendu Leaflet OSM (PDF Briefing pompiers).
  "./lib/html2canvas.min.js",
  "./lib/leaflet/leaflet.css",
  "./lib/leaflet/leaflet.js",
  // 🗑️ v1.43.25 — Retiré du cache PWA : leaflet-src.js + leaflet-src.esm.js
  // (~500 KB chacun = 1 MB total). Versions non-minifiées pour debug, JAMAIS
  // chargées en runtime par index.html (qui charge uniquement leaflet.js
  // minifié + leaflet.css + leaflet-imageoverlay-rotated.js). Fichiers
  // toujours présents sur le serveur si besoin debug manuel. Gain : install
  // plus rapide (~10s gagnés sur 4G) → moins de risque d'interruption.
  // 🆕 v1.38.0 — Plugin Leaflet.ImageOverlay.Rotated (vendored)
  "./lib/leaflet-imageoverlay-rotated.js",

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
  "./icon/compass-180.png",
  "./icon/compass-192.png",
  "./icon/compass-512.png",
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
  "./icon/portail.png",
  "./icon/compass.png",
  "./icon/compass.svg",
];

// =========================
// INSTALL
// =========================

// 🛡️ v1.43.5 — App shell CRITIQUE (cache d'abord, avec retry x3). Si l'install
// est interrompue (reload user, perte réseau brève, navigateur kill SW pour
// quota), au moins ces assets seront en cache → fallback document offline du
// fetch handler trouvera index.html. Le reste de ASSETS_TO_CACHE continue
// best-effort après ce bloc.
// Note : on garde tout ASSETS_TO_CACHE dans la boucle normale ensuite — le
// pré-cache critique est un SUR-ENSEMBLE mais avec retry. Aucune perte.
const CRITICAL_APP_SHELL = [
  "./index.html",
  "./",
  "./css/style.css",
  "./js/copyright.js",
  // 🌍 v1.45.0 : I18n + dico fallback. langManager.js est AWAIT-é au boot (main.js) et
  // fr.json est le fallback universel → tous deux critiques pour un boot offline
  // correct (sinon I18n.t retournerait les clés brutes au 1er install hors ligne).
  "./js/langManager.js",
  "./lang/fr.json",
  "./js/main.js",
  "./manifest.json",
  // 🆕 v1.43.10 — Docs consultables offline (KARMA "page audit n'a pas
  // été caché") : pages ouvertes depuis les modales in-app qui doivent
  // être disponibles sans réseau. Sans retry+self-heal, un fetch d'install
  // raté (FTP en cours de déploiement, réseau lent) laisse l'asset absent.
  "./docs/applications/NETWORK_AUDIT.html",
  "./docs/applications/README_USER.md",
  "./docs/applications/README_USER.en.md",
  "./docs/applications/AI_CONTEXT.md"
];

async function _cacheWithRetry(cache, asset, attempts) {
  attempts = attempts || 3;
  let lastResult = null;
  for (let i = 0; i < attempts; i++) {
    // 🆕 v1.43.22 — Utilise _cacheAddDiag (au lieu de cache.add direct)
    // pour catégoriser précisément l'erreur (404 vs réseau vs quota...).
    // Le log IDB est rempli automatiquement par _cacheAddDiag.
    const result = await _cacheAddDiag(cache, asset, "critical");
    if (result.ok) return true;
    lastResult = result;
    // Backoff léger pour laisser le réseau respirer (200ms, 500ms)
    if (i < attempts - 1) {
      await new Promise(function(r) { setTimeout(r, 200 * (i + 1)); });
    }
  }
  console.warn("[SW] CRITIQUE non caché après", attempts, "essais :", asset,
               "type=" + (lastResult && lastResult.type),
               "status=" + (lastResult && lastResult.status));
  return false;
}

self.addEventListener("install", (event) => {
  console.log("[SW] Installation");

  event.waitUntil(
    // 🆕 v1.43.22 — Vide le log des échecs précédents avant de commencer.
    // Sinon les anciennes erreurs (déjà résolues par un FTP postérieur)
    // continueraient d'apparaître dans l'Inspecteur SW.
    _clearInstallFailures().catch(function(){}).then(function() {
      return caches.open(CACHE_NAME);
    }).then(async (cache) => {
      // ⚡ Phase 1 — App shell critique (retry x3). Garantit qu'index.html est
      // cached même si l'install est interrompue après cette phase.
      console.log("[SW] Phase 1 — App shell critique...");
      for (const asset of CRITICAL_APP_SHELL) {
        const ok = await _cacheWithRetry(cache, asset, 3);
        if (ok) console.log("[SW] ✅ Critique caché :", asset);
      }
      console.log("[SW] Phase 1 OK. Phase 2 — reste assets (batchs parallèles)...");

      // 🆕 v1.43.25 — Phase 2 PARALLÉLISÉE en batchs de 10 (KARMA "le SW
      // arrive pas à tout récupérer", typiquement leaflet + icônes).
      // Avant : `for-of await` séquentiel sur ~150 assets = 30-60s sur 4G
      // → fenêtre d'interruption énorme (Safari iOS kill SW, reload user,
      // throttling Chrome Android background). Maintenant : Promise.allSettled
      // par batch de 10 → install ~5-10× plus rapide → fenêtre minuscule.
      // BATCH_SIZE = 10 : compromis raisonnable. Trop bas = trop séquentiel ;
      // trop haut (50+) = risque DDoS sur serveur dev nginx peu puissant.
      // HTTP/2 multiplexing géré nativement par le navigateur — pas besoin
      // de keepalive manuel.
      // `_cacheAddDiag` catch toutes ses propres exceptions et alimente le
      // log IDB d'install — on n'a pas besoin de wrapper try/catch ici.
      const BATCH_SIZE = 10;
      const phase2Assets = ASSETS_TO_CACHE.filter(function(a) {
        return CRITICAL_APP_SHELL.indexOf(a) === -1;
      });
      for (let i = 0; i < phase2Assets.length; i += BATCH_SIZE) {
        const batch = phase2Assets.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(function(asset) { return _cacheAddDiag(cache, asset, "phase2"); })
        );
        results.forEach(function(r, idx) {
          const asset = batch[idx];
          if (r.status === "fulfilled" && r.value && r.value.ok) {
            console.log("[SW] Caché :", asset);
          } else if (r.status === "fulfilled") {
            console.warn("[SW] Non caché :", asset,
                         "type=" + (r.value && r.value.type),
                         "status=" + (r.value && r.value.status || "-"));
          } else {
            // Cas rarissime : exception non-catchée par _cacheAddDiag
            console.warn("[SW] Non caché (exception batch) :", asset, r.reason);
          }
        });
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
    }).then(async function() {
      // 🛡️ v1.43.5 — Self-heal app shell. Si l'install a été interrompue
      // (reload user pendant le pré-cache, navigateur a kill le SW pour
      // quota, etc.), CRITICAL_APP_SHELL peut être absent. À l'activate,
      // on vérifie et re-cache au besoin. Sans ça : page d'erreur
      // "index.html non enregistré" persistante après update du SW.
      try {
        const cache = await caches.open(CACHE_NAME);
        for (const asset of CRITICAL_APP_SHELL) {
          const cached = await cache.match(asset);
          if (!cached) {
            console.warn("[SW] Self-heal : " + asset + " absent du cache, re-fetch...");
            try {
              await _cacheWithRetry(cache, asset, 3);
              console.log("[SW] Self-heal OK :", asset);
            } catch (e) {
              console.error("[SW] Self-heal ÉCHEC :", asset, e);
            }
          }
        }
      } catch (e) {
        console.warn("[SW] Self-heal activate erreur :", e);
      }
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
  // 🆕 v1.43.12 — Inspecteur Service Worker (cf js/swInspector.js).
  // Retourne la liste des assets attendus + critiques pour permettre
  // au client de comparer avec ce qui est vraiment en cache.
  if (data.type === "GET_EXPECTED_ASSETS") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        type:      "EXPECTED_ASSETS",
        cacheName: CACHE_NAME,
        assets:    ASSETS_TO_CACHE.slice(),
        critical:  CRITICAL_APP_SHELL.slice()
      });
    }
    return;
  }
  // 🆕 v1.43.12 — Force re-fetch des assets manquants. Le client passe
  // la liste à re-cacher (typiquement le diff calculé par SwInspector),
  // on tente cache.add avec retry x3 pour chaque, on retourne le rapport.
  if (data.type === "REFETCH_MISSING_ASSETS") {
    const assets = Array.isArray(data.assets) ? data.assets : [];
    caches.open(CACHE_NAME).then(async function(cache) {
      // 🆕 v1.43.25 — Paralléliser aussi le refetch user (clic bouton
      // "Récupérer manquants" ou auto-heal). Même logique batch=10 que
      // l'install phase 2 — gain de vitesse identique. Retry x3 conservé
      // par asset, mais les 10 assets du batch retentent en parallèle.
      const BATCH_SIZE = 10;
      const results = [];
      for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        const batch = assets.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(batch.map(async function(asset) {
          let ok = false;
          let lastResult = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            const r = await _cacheAddDiag(cache, asset, "refetch");
            if (r.ok) { ok = true; break; }
            lastResult = r;
            if (attempt < 2) await new Promise(function(r2) { setTimeout(r2, 200 * (attempt + 1)); });
          }
          return {
            asset:  asset,
            ok:     ok,
            error:  ok ? null : (lastResult && lastResult.type) || "unknown",
            status: ok ? null : (lastResult && lastResult.status) || 0
          };
        }));
        batchResults.forEach(function(br, idx) {
          if (br.status === "fulfilled") {
            results.push(br.value);
          } else {
            results.push({ asset: batch[idx], ok: false, error: "exception", status: 0 });
          }
        });
      }
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: "REFETCH_DONE", results: results });
      }
    }).catch(function(e) {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: "REFETCH_DONE", error: String(e.message || e), results: [] });
      }
    });
    return;
  }
  // 🆕 v1.43.22 — Inspecteur SW V2 : renvoie l'historique des échecs
  // d'install (stockés dans IDB myktamap_sw_install_log). Permet au
  // client d'afficher non seulement QUELS assets manquent (déjà connu
  // via diff ASSETS_TO_CACHE vs cache), mais POURQUOI (404 = FTP partiel,
  // 5xx = serveur en erreur, network = offline, quota = IDB plein, etc.).
  if (data.type === "GET_INSTALL_FAILURES") {
    _getInstallFailures().then(function(failures) {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ type: "INSTALL_FAILURES", failures: failures });
      }
    });
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

// 🆕 v1.43.0 — Helper IDB lookup pour OSM tiles cache (cf js/osmTilesCache.js).
// Doit être appelé depuis le fetch handler. Retourne Promise<Blob | null>.
// IDB ouvert à chaque appel (overhead minime — IDB est rapide pour lookup
// par primary key). Pas de cache mémoire pour éviter divergence avec
// l'IDB modifié côté app.
function _osmTilesCacheLookup(z, x, y) {
  return new Promise(function(resolve) {
    if (!self.indexedDB) { resolve(null); return; }
    let req;
    try { req = self.indexedDB.open("myktamap_osm_tiles", 1); }
    catch(e) { resolve(null); return; }
    req.onerror = function() { resolve(null); };
    req.onsuccess = function() {
      const db = req.result;
      if (!db.objectStoreNames.contains("tiles")) { resolve(null); return; }
      try {
        const tx  = db.transaction("tiles", "readonly");
        const st  = tx.objectStore("tiles");
        const get = st.get(z + "/" + x + "/" + y);
        get.onsuccess = function() {
          const rec = get.result;
          resolve(rec && rec.blob ? rec.blob : null);
        };
        get.onerror = function() { resolve(null); };
      } catch(e) { resolve(null); }
    };
    // Pas d'upgradeneeded ici : si la DB n'existe pas encore (= jamais
    // d'écriture côté app), on retourne juste null (miss).
  });
}

// =========================
// 🆕 v1.43.22 — INSTALL LOG DB (SwInspector V2)
// =========================
// IDB store pour tracer les échecs d'install (FTP partiel = 404 serveur,
// coupure réseau, quota dépassé, etc.). Permet à l'Inspecteur SW d'afficher
// non seulement QUELS assets manquent, mais POURQUOI (404/5xx/network/quota/
// parse/unknown). Vidé au début de chaque install pour ne pas accumuler
// d'anciens échecs résolus.
const INSTALL_LOG_DB = "myktamap_sw_install_log";
const INSTALL_LOG_VER = 1;
const INSTALL_LOG_STORE = "install_failures";

function _openInstallLogDB() {
  return new Promise(function(resolve, reject) {
    if (!self.indexedDB) { reject(new Error("IDB indispo")); return; }
    let req;
    try { req = self.indexedDB.open(INSTALL_LOG_DB, INSTALL_LOG_VER); }
    catch(e) { reject(e); return; }
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(INSTALL_LOG_STORE)) {
        db.createObjectStore(INSTALL_LOG_STORE, { keyPath: "asset" });
      }
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror   = function() { reject(req.error); };
  });
}

function _logInstallFailure(failure) {
  return new Promise(function(resolve) {
    _openInstallLogDB().then(function(db) {
      try {
        const tx = db.transaction(INSTALL_LOG_STORE, "readwrite");
        tx.objectStore(INSTALL_LOG_STORE).put({
          asset:     failure.asset,
          type:      failure.type     || "unknown",
          status:    failure.status   || 0,
          message:   failure.message  || "",
          timestamp: new Date().toISOString(),
          phase:     failure.phase    || "unknown"
        });
        tx.oncomplete = function() { resolve(true); };
        tx.onerror    = function() { resolve(false); };
      } catch(e) { resolve(false); }
    }).catch(function() { resolve(false); });
  });
}

function _clearInstallFailures() {
  return new Promise(function(resolve) {
    _openInstallLogDB().then(function(db) {
      try {
        const tx = db.transaction(INSTALL_LOG_STORE, "readwrite");
        tx.objectStore(INSTALL_LOG_STORE).clear();
        tx.oncomplete = function() { resolve(true); };
        tx.onerror    = function() { resolve(false); };
      } catch(e) { resolve(false); }
    }).catch(function() { resolve(false); });
  });
}

function _getInstallFailures() {
  return new Promise(function(resolve) {
    _openInstallLogDB().then(function(db) {
      try {
        const tx  = db.transaction(INSTALL_LOG_STORE, "readonly");
        const req = tx.objectStore(INSTALL_LOG_STORE).getAll();
        req.onsuccess = function() { resolve(req.result || []); };
        req.onerror   = function() { resolve([]); };
      } catch(e) { resolve([]); }
    }).catch(function() { resolve([]); });
  });
}

// =========================
// 🆕 v1.43.22 — CACHE ADD AVEC DIAGNOSTIC
// =========================
// Remplace cache.add() (opaque) par un fetch + analyse explicite de la
// réponse + cache.put. Permet de catégoriser précisément l'erreur :
//   - "404"      : fichier absent du serveur (= bug FTP partiel)
//   - "5xx"      : serveur en erreur transitoire (502/503/504...)
//   - "4xx"      : autre erreur HTTP cliente (403, etc.)
//   - "network"  : TypeError fetch = offline / DNS / CORS
//   - "quota"    : IDB plein (QuotaExceededError sur cache.put)
//   - "parse"    : réponse mal formée
//   - "unknown"  : reste
async function _cacheAddDiag(cache, asset, phase) {
  let resp = null;
  // Étape 1 : fetch
  try {
    resp = await fetch(new Request(asset, { cache: "reload" }));
  } catch (err) {
    const type = (err && err.name === "TypeError") ? "network" : "unknown";
    await _logInstallFailure({
      asset:   asset,
      type:    type,
      status:  0,
      message: (err && err.message) || String(err),
      phase:   phase
    });
    return { ok: false, type: type, message: (err && err.message) || String(err) };
  }
  // Étape 2 : analyse status HTTP
  if (!resp || !resp.ok) {
    const status = resp ? resp.status : 0;
    const type   = status === 404 ? "404"
                : (status >= 500 && status <= 599) ? "5xx"
                : (status >= 400 && status <= 499) ? "4xx"
                : "unknown";
    await _logInstallFailure({
      asset:   asset,
      type:    type,
      status:  status,
      message: resp ? (resp.statusText || "") : "no response",
      phase:   phase
    });
    return { ok: false, type: type, status: status };
  }
  // Étape 3 : cache.put
  try {
    await cache.put(asset, resp);
    const absUrl = _cacheKeyOf(asset);
    if (absUrl) _staticAssetUrls.add(absUrl);
    return { ok: true };
  } catch (err) {
    const type = (err && err.name === "QuotaExceededError") ? "quota"
              : (err && err.name === "SyntaxError")        ? "parse"
              : "unknown";
    await _logInstallFailure({
      asset:   asset,
      type:    type,
      status:  resp.status || 0,
      message: (err && err.message) || String(err),
      phase:   phase
    });
    return { ok: false, type: type, message: (err && err.message) || String(err) };
  }
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

  // 🗺️ v1.43.0 — OSM TILES CACHE OFFLINE — Intercept des requêtes vers
  // tile.openstreetmap.org pour servir depuis IndexedDB si l'user a
  // pré-caché les tuiles via le bouton « 💾 Cacher pour offline » de
  // Vue OSM (modale + Home widget). Permet d'utiliser Vue OSM en mode
  // hors-réseau (= sortie terrain Mode Secours cellular faible/coupé).
  // Architecture :
  //   1. Match URL `*://*.tile.openstreetmap.org/{z}/{x}/{y}.png`
  //   2. Lookup IDB store "myktamap_osm_tiles/tiles" (key="z/x/y")
  //   3. Hit → return new Response(blob, {200, content-type:image/png})
  //   4. Miss → fetch réseau (= comportement normal)
  // Privacy : tout local, jamais transmis. Pattern cohérent avec
  // Licence-pro.json et denylist.json (bypass conditionnel).
  if (/(?:^https?:)?\/\/(?:[a-z]+\.)?tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/.test(reqUrl)) {
    const m = reqUrl.match(/(\d+)\/(\d+)\/(\d+)\.png/);
    if (m) {
      const z = m[1], x = m[2], y = m[3];
      event.respondWith(
        _osmTilesCacheLookup(z, x, y).then(function(blob) {
          if (blob) {
            return new Response(blob, {
              status: 200,
              headers: { "Content-Type": "image/png", "X-OSM-Cache": "hit" }
            });
          }
          // Miss : fetch réseau normal (peut échouer si offline → tile vide)
          return fetch(event.request, { mode: "cors", credentials: "omit" });
        }).catch(function() {
          // Fail-safe : tentative réseau ultime
          return fetch(event.request, { mode: "cors", credentials: "omit" })
            .catch(function() {
              // Vraiment offline + pas en cache → réponse vide pour ne pas casser
              return new Response("", { status: 504 });
            });
        })
      );
      return;
    }
  }

  // 🛡️ v1.42.0 — Bypass cache TOTAL pour /denylist.json (kill-switch
  // anti-fuite des plans qui ont leaké publiquement). Doit toujours être
  // fetched live pour propager les updates sans devoir bump le CACHE_NAME.
  //  - 404 attendu si aucune denylist publiée → aucun blocage actif
  //  - 200 attendu si denylist publiée → check client-side au prochain load
  // Le cache 24h côté client (localStorage) gère le mode offline.
  // Pattern identique à Licence-pro.json — fichier de control serveur.
  if (/\/denylist\.json(\?|$)/.test(reqUrl)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => new Response('{"version":1,"deny":[]}', {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }))
    );
    return;
  }

  // 🛡️ v1.43.11 — STRATEGIE NETWORK-FIRST POUR LES DOCS (Fix B audit impartial)
  // Bug observé (KARMA "audit pas à jour après bump") : les docs HTML/MD
  // changent à chaque release MAIS notre cache-first les sert "stale" tant
  // que CACHE_NAME ne change pas et que l'asset est piégé dans le cache.
  // Plus grave : déploiement FTP non-atomique → pendant install, l'asset
  // peut être en cours d'upload (fichier tronqué) → 3 retries `_cacheWithRetry`
  // (0.7s) échouent → asset absent → fallback réseau ultérieur peut récupérer
  // une version partielle et la cacher → version invalide piégée pour toujours.
  //
  // Fix : pour /docs/applications/*.html et *.md (= modale Documentation +
  // Audit + README + AI Context), on fait du network-first avec timeout 3s
  // et fallback cache. Garantit la fraîcheur en online (cas standard) +
  // résilience offline (= cache valide servi seulement si réseau échoue).
  // Le cache.put silencieux maintient le cache à jour pour l'usage offline.
  if (/\/docs\/applications\/.*\.(html|md)(\?|$)/.test(reqUrl)) {
    event.respondWith((async function() {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkPromise = fetch(event.request, { cache: "no-store" });
        const timeoutPromise = new Promise(function(_, reject) {
          setTimeout(function() { reject(new Error("network timeout")); }, 3000);
        });
        const networkResp = await Promise.race([networkPromise, timeoutPromise]);
        if (networkResp && networkResp.ok) {
          // Met à jour le cache silencieusement (best-effort)
          try { cache.put(event.request, networkResp.clone()); } catch(e) {}
          return networkResp;
        }
        // 304 / autres → fallback cache
        throw new Error("non-ok status " + (networkResp && networkResp.status));
      } catch (e) {
        // Réseau KO ou timeout → fallback cache (peut être stale mais utilisable)
        const cachedResp = await cache.match(event.request);
        if (cachedResp) return cachedResp;
        // Pas en cache + offline → réponse explicite (mieux que 504 vide)
        return new Response(
          "Document indisponible hors-ligne. Reconnecte-toi pour le consulter.",
          { status: 504, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  // 🌍 v1.46.6 — STRATEGIE NETWORK-FIRST POUR LES DICOS i18n (lang/*.json)
  // Même classe de bug que les docs (v1.43.11) : les dicos de traduction
  // changent à chaque vague i18n, mais le cache-first les sert « stale » tant
  // que CACHE_NAME ne bump pas ET que le SW se réinstalle. Symptôme vécu (KARMA)
  // : clés PIN ajoutées en v1.46.2 (`pin.setup.changeBtn`…) affichées humanisées
  // (« Change Btn ») parce que le `fr.json` précaché datait d'avant. Aggravé par
  // un SW zombie qui ne se met jamais à jour → traduction périmée INDÉFINIMENT.
  //
  // Fix : network-first + timeout 2.5s + fallback cache. Online → dico TOUJOURS
  // frais (nouvelles clés visibles dès le déploiement, sans dépendre du bump
  // CACHE_NAME ni de l'état du SW). Offline / réseau lent → fallback cache
  // précaché (boot offline préservé ; `fr.json` reste le fallback universel).
  // langManager fetch les dicos au boot → reçoit la version réseau fraîche →
  // plus jamais de clé humanisée affichée à l'user dès qu'il est en ligne.
  if (/\/lang\/[a-z-]+\.json(\?|$)/.test(reqUrl)) {
    event.respondWith((async function() {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkPromise = fetch(event.request, { cache: "no-store" });
        const timeoutPromise = new Promise(function(_, reject) {
          setTimeout(function() { reject(new Error("network timeout")); }, 2500);
        });
        const networkResp = await Promise.race([networkPromise, timeoutPromise]);
        if (networkResp && networkResp.ok) {
          // Met à jour le cache silencieusement (best-effort) pour l'offline.
          try { cache.put(event.request, networkResp.clone()); } catch(e) {}
          return networkResp;
        }
        throw new Error("non-ok status " + (networkResp && networkResp.status));
      } catch (e) {
        // Réseau KO/timeout → fallback cache. `ignoreSearch:true` car langManager
        // ajoute désormais `?v=<build>` à l'URL (cache-buster) → il faut matcher
        // l'entrée PRÉCACHÉE (sans query) pour un boot offline.
        const cachedResp = await cache.match(event.request, { ignoreSearch: true });
        if (cachedResp) return cachedResp;
        // Pas en cache + offline → dico vide en 200 (JAMAIS rejeter : sinon
        // langManager._loadDict throw et I18n.init plante au boot). Dégrade
        // proprement vers le fallback FR puis la clé humanisée.
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    })());
    return;
  }

  event.respondWith(
    // 🛡️ v1.43.11 — Fix A audit impartial : on scope `caches.match()` au
    // CACHE_NAME courant uniquement. Le `caches.match()` global cherche
    // dans TOUS les caches existants — y compris d'anciens caches pas
    // encore supprimés par l'activate (qui est async). Sans ce scope,
    // le SW peut servir une entrée d'un ancien cache v1.43.x après bump.
    caches.open(CACHE_NAME).then(function(c) { return c.match(event.request); }).then((cachedResponse) => {
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
            // 🛡️ v1.43.11 — Fix A audit impartial : on scope tous les
            // caches.match() au CACHE_NAME courant pour éviter de servir
            // une entrée d'un ancien cache pas encore supprimé.
            return caches.open(CACHE_NAME).then(function(c) {
              return c.match("./index.html")
                .then((r) => r || c.match("./"))
                .then((r) => r || c.match("/index.html"))
                .then((r) => r || c.match("/"));
            })
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