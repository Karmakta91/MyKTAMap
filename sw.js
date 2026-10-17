/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// SERVICE WORKER — MyKtaMAP
// =========================
// sw.js — précache de l'app pour le hors-ligne et stratégie réseau / cache par type de requête.
// Définit : CACHE_NAME (version servie) · ASSETS_TO_CACHE (précache) · CRITICAL_APP_SHELL (précache avec retry).
// Précaché : l'app shell, lang/*.json, LICENSE et les seules docs lues par l'app, toutes sous
//   docs/applications/ (guides utilisateur, Aide IA, CGU, audit réseau). README.md, CLAUDE.md et le
//   reste de docs/ ne partent pas dans l'app.
// Jamais précachés : version.json, alert.json, ping.html (lus avec un cache-bust `?_=` : servis par le
//   cache, ils figeraient la mise à jour, les alertes et la sonde de santé).
// Réseau seul (handler fetch) : killsw.html, Licence-pro.json, ZIP de plan déclarés par l'index, sondes
//   de fraîcheur, requêtes d'extension ou authentifiées.
// Caches gardés à l'activation : CACHE_NAME, plans hors-ligne (PLAN_CACHE_PREFIX), modules greffés
//   (EXT_CACHE_PREFIX) ; tout autre cache est supprimé.
// Pièges : 🩸 scripts/release/etat-sites.ps1 lit la PREMIÈRE occurrence du nom de cache versionné dans ce
//   fichier : ne jamais le citer au-dessus de CACHE_NAME.
// Garde-fous : scripts/check-icon-catalog.js (précache des icônes), scripts/check-plan-offline.js,
//   scripts/check-html-integrite.js · Doc : docs/architecture/infra-versioning.md
// =========================

// ⚠️ Bumpé avec version.json > version et js/copyright.js > __MKM__.build (skill `release`).
const CACHE_NAME = "myktamap-cache-v2.16.0";

// CACHES DE PLAN HORS-LIGNE (un par plan serveur pré-téléchargé).
// 🩸 POURQUOI UN CACHE À PART, et pas le cache principal :
//   1. le cache principal a un PLAFOND de MAX_DYNAMIC_ENTRIES (800) avec
//      éviction FIFO. Un plan V2 de 20000×12000 fait 1275 tuiles — son SEUL
//      niveau z=0 en fait 960. Il s'évinçait donc lui-même en se chargeant, et
//      hors-ligne on obtenait une carte TROUÉE, pas une erreur ;
//   2. `activate` supprime tout cache dont la clé ≠ CACHE_NAME → à chaque
//      release, un plan « disponible hors-ligne » repartait à zéro.
// Ces caches sont donc EXCLUS des deux mécanismes. Ils sont écrits depuis la
// page (`js/planOffline.js` via l'API Cache), le SW ne fait que les préserver
// et les servir.
const PLAN_CACHE_PREFIX = "myktamap-plan-";
function _estCachePlan(cle) { return typeof cle === "string" && cle.indexOf(PLAN_CACHE_PREFIX) === 0; }
// (chantier 3) — caches des modules greffés : chaque module remplit et
// versionne SON cache « myktamap-ext-<module> » ; l'activation du SW le garde
// (une release community ne doit pas vider le hors-ligne d'un module, et une
// release du module n'impose pas de bumper CACHE_NAME). Jamais dans
// ASSETS_TO_CACHE : sur myktamap.fr, ces caches n'existent pas.
const EXT_CACHE_PREFIX = "myktamap-ext-";
function _estCacheExt(cle) { return typeof cle === "string" && cle.indexOf(EXT_CACHE_PREFIX) === 0; }
// Modules déclarés par `index.json > config.serverConnection.modules` : gardés dans un cache
// DURABLE (préfixe ext, survit aux releases) et préchargés dès que l'index est lu en ligne.
// Sans ça, le 1er lancement hors ligne après une mise à jour = « Installation indisponible »
// (le cache principal, vidé au bump, était le seul à les tenir). Sans modules déclarés
// (myktamap.fr) : ce cache n'existe pas.
const MODULES_EXT_CACHE = EXT_CACHE_PREFIX + "modules";
function _garderModulesDeclares(texteIndex) {
  let mods = [];
  try {
    const cfg = (JSON.parse(texteIndex) || {}).config || {};
    const sc = cfg.serverConnection || {};
    mods = Array.isArray(sc.modules) ? sc.modules : [];
  } catch (e) { return Promise.resolve(); }
  if (!mods.length) return Promise.resolve();   // aucun module déclaré : aucun cache créé
  const urls = mods.filter(function(m) { return typeof m === "string" && m && m.indexOf("://") < 0 && m.indexOf("//") !== 0; })
    .slice(0, 20)
    .map(function(m) { try { return new URL(m, self.registration.scope).href; } catch (e) { return null; } })
    .filter(function(u) { return u && new URL(u).origin === self.location.origin; });
  return caches.open(MODULES_EXT_CACHE).then(function(cache) {
    return cache.keys().then(function(cles) {
      const voulues = new Set(urls);
      const purges = cles.filter(function(r) { return !voulues.has(r.url); }).map(function(r) { return cache.delete(r); });
      const presentes = new Set(cles.map(function(r) { return r.url; }));
      const ajouts = urls.filter(function(u) { return !presentes.has(u); }).map(function(u) {
        return fetch(u, { cache: "no-store" }).then(function(r) { if (r && r.ok) return cache.put(u, r); }).catch(function() {});
      });
      return Promise.all(purges.concat(ajouts));
    });
  }).catch(function() {});
}

const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",

  // Doc utilisateur (consommée par le modal Documentation)
  // Toutes les docs lues par l'app (modale Documentation,
  // Aide IA, Audit) regroupées sous docs/applications/. À la racine :
  // README.md (GitHub) + CLAUDE.md (agents IA). Le reste dans docs/.
  "./docs/applications/README_USER.md",
  "./docs/applications/README_USER.en.md",
  // 🆕 Doc user espagnole (dette D2 du backlog). Précachée comme ses sœurs —
  // sans ça, un hispanophone hors-ligne tomberait sur un fetch en échec et la
  // modale Documentation replierait sur le FR sans rien expliquer.
  "./docs/applications/README_USER.es.md",
  // guide installation Docker pas-à-pas (FR + EN). Consultable
  // offline pour l'user qui veut self-host mais n'a jamais utilisé Docker.
  // Cf section "🐳 Self-host avec Docker" du README_USER qui linke ces docs.
  "./docs/applications/DOCKER_INSTALL.md",
  "./docs/applications/DOCKER_INSTALL.en.md",
  // Squelette enrichi pour la fonctionnalité 🤖 Aide IA (modale Téléchargement contexte IA)
  "./docs/applications/AI_CONTEXT.md",
  // Conditions d'utilisation + avertissement légal (textes de loi
  // intégraux : arrêté du 2 novembre 1955 + réponse Sénat n° 03710). Consultable
  // offline. Cf js/legalGate.js (mirror des textes) + lien Documentation.
  "./docs/applications/CGU.md",

  // dicos i18n multi-langue (lus par js/langManager.js via fetch).
  // fr.json = langue de référence + fallback obligatoire ; en.json = anglais.
  // Précachés ici pour un fonctionnement offline instantané dès le 1er install.
  // Pour ajouter une langue : déposer lang/<code>.json + l'ajouter ici.
  "./lang/fr.json",
  "./lang/en.json",
  "./lang/es.json",
  // Licence (consultable offline si l'utilisateur veut verifier les conditions d'usage)
  "./LICENSE",
  // page de transparence détaillée pour l'audit réseau, en 2
  // versions :
  //   - .html : page HTML formatée (style cohérent charte) ouverte depuis le
  //     bouton "Doc complète" de la modale audit. C'est CELLE que les
  //     utilisateurs voient. Cachée car servie en mode "document" → si on
  //     servait du .md brut, le SW fallback `caches.match(index.html)`
  //     pourrait servir le splash à la place en cas d'échec/non-cache.
  //   - .md : la SOURCE (le .html en est généré par scripts/audit-html.js),
  //     gardée pour audit de code (GitHub web view, lecture par IA, etc.).
  //     Pas exposée directement à l'UI mais cachée par cohérence.
  //   - audit.css + audit-pied.js : feuille et pied (licence community/pro)
  //     des deux pages — sans eux, la page hors ligne s'affiche nue.
  "./docs/applications/NETWORK_AUDIT.html",
  "./docs/applications/NETWORK_AUDIT.md",
  "./docs/applications/NETWORK_AUDIT_HISTORIQUE.html",
  "./docs/applications/NETWORK_AUDIT_HISTORIQUE.md",
  "./docs/applications/audit-pied.js",
  "./docs/applications/audit.css",

  // CSS
  "./css/style.css",
  // (P2 progressive lazy CSS) — feuille CSS dédiée Mode Secours,
  // chargée à la demande au boot du module secoursMode.js via _loadCssOnce.
  // ~2750 lignes extraites de style.css principal (allègement parse boot).
  "./css/style-secours.css",
  // 3 chunks lazy supplémentaires extraits du style.css :
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
  // I18n — helper multi-langue (window.I18n). Chargé tôt dans
  // index.html (après copyright). Précharge lang/fr.json + langue active.
  "./js/langManager.js",
  // F2 : Incognito Mode — shim Storage + IDB en in-memory si
  // ?incognito=1. Chargé SYNC juste après copyright pour intercepter avant
  // tout autre module. Mode normal : pose juste window.IncognitoMode = {...}.
  "./js/incognitoMode.js",
  "./js/sessionStore.js",
  // détecteur de licence pro via présence de /Licence-pro.json.
  // 100% transparent côté community (fichier absent → 404 silencieux → mode
  // community par défaut). Module sans effet visible si pas de Licence-pro.json.
  "./js/proLicense.js",
  // connexion serveur de l'instance (état + pastille), aucune requête.
  "./js/ktaExtensions.js",
  "./js/ktaPresences.js",
  // identifiants stables des objets de carte (uid + updatedAt).
  "./js/ktaUid.js",
  // police manuscrite du splash (sous-ensemble Kalam 700, OFL, ~5 Ko).
  // ThemeManager — toggle thème clair/sombre limité mode carte
  "./js/themeManager.js",
  "./js/networkAudit.js",
  // 🔀 Consolidation : modales du home extraites du <script> inline
  // d'index.html (déplacement pur) — journal/doc réseau + gestion SW
  "./js/loaderNetAudit.js",
  "./js/loaderSwModals.js",
  // CrashReports — archive auto des kills mémoire (IDB myktamap_crashes)
  "./js/crashReports.js",
  // MemInspector — topo lisible mémoire (localStorage, IDB, cache, runtime, crashes)
  "./js/memInspector.js",
  "./js/modalLifecycle.js",
  // SwInspector — inspecteur cache Service Worker (diff attendus vs présents)
  "./js/swInspector.js",
  // StatsGlobales — modale stats agrégées plan complet (session + embedded)
  "./js/statsGlobales.js",
  // Tutorial — onboarding cards premier-lancement (8 cards)
  "./js/tutorial.js",
  // UserProfile — mini profil utilisateur (surnom + photo) en IDB dédiée (myktamap_profile)
  "./js/userProfile.js",
  // gamification du profil (rangs / badges)
  "./js/profileGamification.js",
  // hauts faits / succès du profil
  "./js/profileAchievements.js",
  // ProfileExportImport — profil utilisateur complet (remplace l'ancien export liste plans)
  "./js/profileExportImport.js",
  // (U4) : Raccourcis clavier globaux (E M Z S T L B R)
  "./js/shortcuts.js",
  // Cheatsheet des raccourcis (touche ?)
  "./js/shortcutsCheatsheet.js",
  // (U1) : Mode présentation (touche F, cache UI sauf carte+zoom+boussole)
  "./js/presentationMode.js",
  // Wake Lock API — toggle "Garder l'écran allumé" dans Réglages
  "./js/wakeLock.js",
  "./js/debug.js",
  "./js/devMode.js",
  "./js/perfUltra.js",
  // 🎨 Refonte UI v1 (branche Refonte_interface). Module no-op si flag
  // localStorage["myktamap_refonte_v1"] absent. Cachée pour que le toggle
  // marche aussi en mode offline.
  "./js/refonteInterface.js",
  // config d'instance lue une fois avant les gates.
  "./js/ktaInstance.js",
  "./js/unlockGate.js",
  // code d'accès local optionnel (PIN/biométrie). Indispensable
  // offline (la gate s'affiche au boot avant tout fetch réseau, donc le
  // module DOIT être en cache).
  "./js/pinLock.js",
  "./js/config.js",
  "./js/utils.js",
  "./js/measure.js",
  "./js/tiling.js",
  // Helpers calage image layers (cascade per-plan, math 2 ancres → 3 coins)
  "./js/imageLayerCalibration.js",
  // UI Picker calage image layers (modale split-screen 2 minimaps)
  "./js/imageLayerCalibrationPicker.js",
  "./js/map.js",
  "./js/mapBearing.js",
  "./js/tracking.js",
  "./js/editor.js",
  "./js/road.js",
  "./js/zones.js",
  // module structures (piliers 1ère/2e masse + murs).
  // Doit être caché pour fonctionner offline comme le reste.
  "./js/structures.js",
  // reclassement d'un objet (front de taille → tracé, etc.).
  // Sans lui en cache, le bouton « Convertir » serait mort hors ligne.
  "./js/convertirObjet.js",
  "./js/selectionMulti.js",
  "./js/calqueSession.js",
  // profondeur des niveaux + profil en long.
  "./js/profondeurNiveaux.js",
  // mesure dans la Vue OSM.
  "./js/osmMesure.js",
  "./js/osmCoords.js",
  // module photos (backend IndexedDB + compression).
  // Self-contained, exposé via window.MyKTAMapPhotos. Doit être caché
  // pour que l'attachement photo fonctionne offline.
  "./js/photos.js",
  // viewer photo plein écran (pinch-zoom + pan + swipe).
  // Self-contained, exposé via window.MyKTAMapPhotoViewer. Caché pour
  // visionnage offline des photos déjà attachées aux POI.
  "./js/photoViewer.js",
  // Undo/Redo global (snapshot RAM + raccourcis clavier).
  // Doit être caché pour fonctionner offline (l'historique est lui-même
  // en RAM, mais le module JS doit être disponible offline pour réagir
  // aux Ctrl+Z / Ctrl+Y).
  "./js/historyManager.js",
  // V2 : BatteryGuard (indicateur batterie + warnings).
  // Module léger, no-op gracieux si Battery API indispo (Safari iOS).
  "./js/batteryGuard.js",
  // V2.3 : TrackerReplay (modale replay timeline tracker + export CSV).
  "./js/trackerReplay.js",
  // Heatmap RÉACTIVÉE — la timeline tracker GPS est maintenant
  // persistée dans SessionPersist + SessionBackups, donc la heatmap peut
  // enfin agréger des trajectoires multi-sessions (= cas d'usage qui
  // justifiait son existence initiale, validé maintenant que la persistance
  // est en place).
  "./js/heatmap.js",
  // module de personnalisation de la légende (cascade
  // session > plan > default). Doit être caché pour fonctionner offline.
  "./js/legendCustomization.js",
  "./js/styleResolver.js",
  // module Favoris (points POI par plan)
  "./js/favoris.js",
  // module SessionBackups (10 snapshots FIFO en IDB)
  "./js/sessionBackups.js",
  "./js/exporter.js",
  // module Export PDF imprimable (jsPDF + canvas exporter).
  // Doit être caché pour fonctionner offline.
  "./js/pdfExport.js",
  "./js/sessionExporter.js",
  // D1 : SessionReport — rapport post-mission PDF/JSON/Texte
  "./js/sessionReport.js",
  // E1 : VoiceCommand — commandes vocales push-to-talk Web Speech API
  "./js/voiceCommand.js",
  "./js/voiceTts.js",
  // SortieUrgence — Mode Sortie d'urgence (POIs sortie + pathfinder)
  "./js/sortieUrgence.js",
  // mdParser — parser MD inline minimaliste (utilisé par modeHistoire)
  "./js/mdParser.js",
  "./js/modeHistoire.js",
  "./js/kmzExport.js",
  // Vue OSM (plan au-dessus OpenStreetMap)
  "./js/osmView.js",
  "./js/osmHomePreview.js",
  "./js/kmzImport.js",
  // GPX import + export (réutilise calibrage KMZ)
  "./js/gpxIO.js",
  // GPX → ZIP MyKTAMap (canvas vierge auto-calibré)
  "./js/gpxImport.js",
  "./js/sigImport.js",
  // 🗺️ GeoTIFF : calage embarqué + décodage LZW/Deflate/brut
  "./js/tiffGeoref.js",
  // 📦 Import multiple : N archives ajoutées à la liste sans ouverture
  "./js/importMasse.js",
  "./js/tableEditor.js",
  "./js/searchPoints.js",
  "./js/createConf.js",
  "./js/planRegistry.js",
  "./js/planDenylist.js",
  "./js/osmTilesCache.js",
  "./js/sessionPersist.js",
  "./js/journal.js",
  "./js/journalUi.js",
  "./js/oomGuard.js",
  "./js/computeLoader.js",
  "./js/legalGate.js",
  "./js/firstRunFlow.js",
  "./js/interPlanLinks.js",
  "./js/crossPlanSearch.js",
  "./js/photosGalerie.js",
  "./js/interPlanRoute.js",
  "./js/planNetwork.js",
  // ABSENT jusqu'ici alors qu'index.html le charge : le module
  // qui rend un plan serveur disponible hors-ligne ne l'était pas lui-même.
  // Garde : scripts/check-html-integrite.js §5.
  "./js/planOffline.js",
  "./js/homeLoader.js",
  "./js/homeProfile.js",
  "./js/homeConfig.js",
  "./js/homeDemarrage.js",
  "./js/swRegister.js",
  "./js/pathfinder.js",
  "./js/roadGraph.js",
  "./js/updateChecker.js",
  "./js/alertChecker.js",
  "./js/lostMode.js",
  // Mode urgence (panique) — module léger, indispensable
  // offline (l'user peut être en sous-sol sans réseau quand il en a besoin).
  "./js/emergencyMode.js",
  "./js/compass.js",
  "./js/interface.js",
  // (P3 Lot 1) : Module extrait de interface.js — modales
  // alertes publiques + sélecteur multi-alertes + modale update dispo
  "./js/interfaceAlerts.js",
  // (P3 Lot 2) : Module extrait de interface.js — panneau
  // Distance totale des tracés (filtres + surlignage magenta)
  "./js/interfaceDistanceTotale.js",
  // (P3 Lot 3) : Module extrait de interface.js — modale
  // Légende plein écran (4 sections + cascade LegendCustomization)
  "./js/interfaceLegende.js",
  // (P3 Lot 4) : Module extrait de interface.js — modales
  // documentation (README + Aide intégrée + Aide IA téléchargement)
  "./js/interfaceDocs.js",
  // (P3 Lot 5) : Module extrait de interface.js — export
  // session JSON + import (JSON/GPX/KMZ) + modale de choix d'import
  "./js/interfaceImportExport.js",
  // (P3 Lot 6) : Module extrait de interface.js — modale
  // Itinéraire + POPUP POI + LABEL DISTANCE + Presets + Évitements
  "./js/interfaceItineraire.js",
  // Guidage de l'itinéraire (consignes, feuille de route, bandeau)
  "./js/itiGuidage.js",
  // (P3 Lot 7) : Module extrait de interface.js — calibrage
  // échelle + reset complet + mise à jour douce + helpers ping
  "./js/interfaceMaintenance.js",
  // Picker calibration Nord 2 clics (chargé avant interfaceConfig)
  "./js/northPicker.js",
  // (P3 Lot 9 — DERNIER LOT) : Module extrait de interface.js
  // — modale Réglages + sections Perf ULTRA + M-LVL + Géoref + helpers
  "./js/interfaceConfig.js",
  // FilterPanel (modale unifiée Filtres ≡)
  "./js/filterPanel.js",
  // (P2 progressive lazy CSS) : helper window._loadCssOnce(href, id).
  // Chargé AVANT secoursMode.js dans index.html (consommateur).
  "./js/cssLazy.js",
  // Mode Secours (assignment équipes de recherche)
  "./js/secoursMode.js",
  // (lot C1) : secteurs + parcours de balayage du Mode Secours
  "./js/secoursBalayage.js",
  // Phase 3 : Store IDB dédié photos Mode Secours (vue Live)
  "./js/secoursPhotos.js",
  // ⛔ Phase 4 (QR Share) ROLLBACK hotfix17 — entry retirée
  "./js/main.js",

  // Librairies
  "./lib/jszip.min.js",
  // jsPDF UMD pour l'export PDF imprimable.
  "./lib/jspdf.umd.min.js",
  // html2canvas pour capture du rendu Leaflet OSM (PDF Briefing pompiers).
  "./lib/html2canvas.min.js",
  "./lib/leaflet/leaflet.css",
  "./lib/leaflet/leaflet.js",
  // Retiré du cache PWA : leaflet-src.js + leaflet-src.esm.js
  // (~500 KB chacun = 1 MB total). Versions non-minifiées pour debug, JAMAIS
  // chargées en runtime par index.html (qui charge uniquement leaflet.js
  // minifié + leaflet.css + leaflet-imageoverlay-rotated.js). Fichiers
  // toujours présents sur le serveur si besoin debug manuel. Gain : install
  // plus rapide (~10s gagnés sur 4G) → moins de risque d'interruption.
  // Plugin Leaflet.ImageOverlay.Rotated (vendored)
  "./lib/leaflet-imageoverlay-rotated.js",

  // Images Leaflet
  "./lib/leaflet/images/layers.png",
  "./lib/leaflet/images/layers-2x.png",
  "./lib/leaflet/images/marker-icon.png",
  "./lib/leaflet/images/marker-icon-2x.png",
  "./lib/leaflet/images/marker-shadow.png",

  // Données JSON
  "./data/index.json",
  // 🩸 LE PLAN DE DÉMO N'EST PLUS PRÉ-CACHÉ.
  // Ses 8 fichiers pesaient ~2 Mo (dont 2,0 Mo pour TestMAP.png +
  // collision.png), téléchargés à l'INSTALL par tout le monde — y compris
  // ceux qui ne l'ouvriront jamais.
  // 🍖 Et surtout, être pré-caché le rendait INÉVINÇABLE (cf _staticAssetUrls
  // et l'éviction LRU) : tester le hors-ligne avec lui donnait un faux
  // « ça marche », alors qu'un plan ajouté par l'utilisateur, lui, pouvait
  // s'évincer tout seul.
  // Il se comporte désormais comme n'importe quel plan servi : mis en cache
  // au premier chargement, évinçable, et pré-téléchargeable via 💾
  // Disponibilité hors-ligne. `data/index.json` reste pré-caché — c'est le
  // canal de configuration d'instance, et il est minuscule.

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

// App shell CRITIQUE (cache d'abord, avec retry x3). Si l'install
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
  // I18n + dico fallback. langManager.js est AWAIT-é au boot (main.js) et
  // fr.json est le fallback universel → tous deux critiques pour un boot offline
  // correct (sinon I18n.t retournerait les clés brutes au 1er install hors ligne).
  "./js/langManager.js",
  "./lang/fr.json",
  "./js/main.js",
  "./manifest.json",
  // Docs consultables offline (KARMA "page audit n'a pas
  // été caché") : pages ouvertes depuis les modales in-app qui doivent
  // être disponibles sans réseau. Sans retry+self-heal, un fetch d'install
  // raté (FTP en cours de déploiement, réseau lent) laisse l'asset absent.
  "./docs/applications/NETWORK_AUDIT.html",
  "./docs/applications/NETWORK_AUDIT_HISTORIQUE.html",
  "./docs/applications/audit-pied.js",
  "./docs/applications/audit.css",
  "./docs/applications/README_USER.md",
  "./docs/applications/README_USER.en.md",
  "./docs/applications/README_USER.es.md",
  "./docs/applications/AI_CONTEXT.md"
];

async function _cacheWithRetry(cache, asset, attempts) {
  attempts = attempts || 3;
  let lastResult = null;
  for (let i = 0; i < attempts; i++) {
    // Utilise _cacheAddDiag (au lieu de cache.add direct)
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
    // Vide le log des échecs précédents avant de commencer.
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

      // Phase 2 PARALLÉLISÉE en batchs de 10 (KARMA "le SW
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

  // si le SW redémarre (mais que le cache existe
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
          // les caches de plan hors-ligne SURVIVENT au bump.
          .filter((key) => key !== CACHE_NAME && !_estCachePlan(key) && !_estCacheExt(key))
          .map((key) => {
            console.log("[SW] Suppression ancien cache :", key);
            return caches.delete(key);
          })
      );
    }).then(async function() {
      // Self-heal app shell. Si l'install a été interrompue
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
  // audit sécu point C — Defense-in-depth : reject les messages
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
  // Inspecteur Service Worker (cf js/swInspector.js).
  // Retourne la liste des assets attendus + critiques pour permettre
  // au client de comparer avec ce qui est vraiment en cache.
  // La page vient d'écrire ou de supprimer un cache de plan
  // hors-ligne : on invalide la mémoïsation pour que le prochain miss du cache
  // principal aille bien y regarder (sinon jusqu'à 30 s de décalage).
  if (data.type === "PLAN_CACHE_CHANGED") {
    _planCachesMemo = null;
    _planCachesMemoAt = 0;
    console.log("[SW] Caches de plan : mémo invalidée");
    return;
  }

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
  // Force re-fetch des assets manquants. Le client passe
  // la liste à re-cacher (typiquement le diff calculé par SwInspector),
  // on tente cache.add avec retry x3 pour chaque, on retourne le rapport.
  if (data.type === "REFETCH_MISSING_ASSETS") {
    const assets = Array.isArray(data.assets) ? data.assets : [];
    caches.open(CACHE_NAME).then(async function(cache) {
      // Paralléliser aussi le refetch user (clic bouton
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
  // Inspecteur SW V2 : renvoie l'historique des échecs
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

// LRU cap pour le cache dynamique. Avant : chaque
// requête réseau était ajoutée au cache sans limite, donc en consultant 20
// plans différents le cache pouvait grossir de plusieurs centaines de Mo,
// déclenchant la purge OS qui détruit aussi les assets app critiques (cycle
// CacheStorage+IDB atomique). Maintenant : on cap à MAX_DYNAMIC_ENTRIES en
// excluant les URLs précachées au install (qui doivent rester intouchables).
const MAX_DYNAMIC_ENTRIES = 800;  // cap en ENTRÉES, appliqué aux seules tuiles

// 🩸 L'ÉVICTION DÉTRUISAIT L'ACCÈS HORS-LIGNE DU PLAN QU'ELLE VENAIT
// DE METTRE EN CACHE.
//
// Mesuré sur un relevé tuilé : ouvrir le plan met 1 066 entrées en cache ;
// 30 s plus tard (le debounce ci-dessous) l'éviction FIFO en retire 136 —
// dont `plan-config.json`, les quatre fichiers de données du plan et le
// dictionnaire de langue, parce qu'ils sont arrivés AVANT les tuiles.
// Vérifié dans les deux sens : rechargement hors-ligne AVANT l'éviction → le
// plan s'ouvre, 864/864 tuiles ; APRÈS → il ne s'ouvre plus du tout, alors
// que 750 de ses tuiles sont toujours là, inutiles.
//
// Le cap visait « ~120 Mo si tiles ~150 KB ». Taille réelle mesurée ici :
// 38 Ko par tuile — 800 entrées valent donc ~30 Mo, soit 4× moins que son
// propre objectif, ET moins qu'un seul plan.
//
// L'invariant qui manquait : **on n'évince jamais la clé de lecture d'un
// contenu qu'on garde.** Une tuile perdue se retélécharge ou se remplace par
// l'image de base ; un `plan-config.json` perdu rend tout le reste illisible.
// Seules les tuiles sont donc évincables.
function _estTuile(url) {
  try { return /\/tiles\/z-?\d+\/x\d+_y-?\d+\.[a-z0-9]+$/i.test(new URL(url).pathname); }
  catch (e) { return false; }
}
const _staticAssetUrls = new Set(); // populé au install ci-dessous

// Lookup dans les caches de plan (après miss du cache principal).
// Mémoïsé : `caches.keys()` à chaque requête non cachée serait du gaspillage.
// La page invalide via postMessage PLAN_CACHE_CHANGED après un pré-cache ou
// une suppression ; TTL de secours au cas où le message se perdrait.
let _planCachesMemo = null;
let _planCachesMemoAt = 0;
const PLAN_CACHES_TTL = 30000;
function _listerCachesPlan() {
  const now = Date.now();
  if (_planCachesMemo && (now - _planCachesMemoAt) < PLAN_CACHES_TTL) {
    return Promise.resolve(_planCachesMemo);
  }
  return caches.keys().then(function(keys) {
    _planCachesMemo = keys.filter(_estCachePlan);
    _planCachesMemoAt = Date.now();
    return _planCachesMemo;
  }).catch(function() { return []; });
}
function _matchCachesPlan(request) {
  return _listerCachesPlan().then(function(cles) {
    if (!cles.length) return null;
    return cles.reduce(function(p, cle) {
      return p.then(function(r) {
        return r || caches.open(cle).then(function(c) { return c.match(request); }).catch(function() { return null; });
      });
    }, Promise.resolve(null));
  });
}

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
      // Filtre : entrées DYNAMIQUES (pas précachées au install) ET évinçables.
      // Tout ce qui n'est pas une tuile est une clé de lecture : on n'y touche
      // pas (cf le pavé sur MAX_DYNAMIC_ENTRIES).
      const dynamic = reqs.filter((r) => !_staticAssetUrls.has(_cacheKeyOf(r)) && _estTuile(r.url));
      if (dynamic.length <= MAX_DYNAMIC_ENTRIES) return;
      // FIFO : delete les plus anciens (en début d'array = insertion plus
      // ancienne, c'est la sémantique Cache API standard).
      const toEvict = dynamic.length - MAX_DYNAMIC_ENTRIES + 50;  // +50 = buffer pour éviter le yo-yo
      const slice = dynamic.slice(0, toEvict);
      return Promise.all(slice.map((r) => cache.delete(r))).then(() => {
        console.log("[SW] LRU eviction :", slice.length, "tuile(s) (cap " + MAX_DYNAMIC_ENTRIES +
                    ") — les fichiers de lecture des plans ne sont jamais évincés");
      });
    })).catch((e) => console.warn("[SW] LRU eviction erreur :", e));
  };
  // Délai pour debounce (évite N evictions consécutives sur burst de fetch)
  try { setTimeout(_run, 30000); } catch(e) { _run(); }
}

// Helper IDB lookup pour OSM tiles cache (cf js/osmTilesCache.js).
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
// INSTALL LOG DB (SwInspector V2)
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
// CACHE ADD AVEC DIAGNOSTIC
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

  // Ignore les schemes non-http(s) (chrome-extension://,
  // moz-extension://, safari-web-extension://, etc.). Les extensions
  // installées par l'user (adblocker, password manager, etc.) peuvent
  // émettre des fetch vers leurs propres ressources via la page MyKTAMap.
  // Le SW intercepte ces requêtes, mais le Cache API REFUSE les schemes
  // ≠ http/https → TypeError "Failed to execute 'put' on 'Cache': Request
  // scheme 'chrome-extension' is unsupported".
  // Bénin (l'extension reçoit sa réponse réseau normale) mais pollue la
  // console avec un error répété → confusion avec un vrai bug.
  // Fix : early-return sans event.respondWith → le SW n'intervient pas,
  // le navigateur résout la requête directement.
  const reqProtocol = (event.request.url || "").split(":")[0];
  if (reqProtocol !== "http" && reqProtocol !== "https") return;

  // 🩸 `reqUrl` est declare ICI, en TETE du handler : une branche inseree
  // avant une declaration `const` la lit en zone morte temporelle ->
  // ReferenceError a CHAQUE requete, handler fetch mort, hors-ligne contourne.
  // Toute branche ajoutee plus bas doit pouvoir lire reqUrl sans y penser.
  const reqUrl = event.request.url || "";

  // JAMAIS DE CACHE POUR UNE REQUÊTE D'EXTENSION OU AUTHENTIFIÉE.
  // Une installation peut servir le backend d'un module greffé à la même
  // adresse que l'app : sans cette règle, ses réponses (données de compte,
  // synchro) seraient mises en cache par le SW, servies périmées hors ligne et
  // conservées sur l'appareil. Le garde KtaExtensions.requete marque ses
  // requêtes (en-tête X-Kta-Ext) ; une requête portant Authorization ne se met
  // jamais en cache non plus (sémantique HTTP). On ne répond pas : le réseau
  // seul décide, comme sans SW.
  try {
    const h = event.request.headers;
    if (h && (h.get("X-Kta-Ext") || h.get("Authorization"))) return;
  } catch (e) { /* en-têtes illisibles : on continue normalement */ }

  // PLAN ZIP DÉCLARÉ PAR L'INDEX (`"zip": "data/x.zip"`) : RÉSEAU SEUL.
  // Le hors-ligne d'un tel plan est la copie gardée en IndexedDB (PlanRegistry.saveBlob),
  // pas le cache du SW : sans cette sortie, la branche par défaut rangerait chaque archive
  // (des centaines de Mo) une seconde fois dans CACHE_NAME, et la servirait cache-first —
  // la requête conditionnelle de fraîcheur n'atteindrait jamais le serveur.
  if (/\.zip(\?|$)/i.test(reqUrl)) return;

  // SONDES DE FRAÎCHEUR : RÉSEAU SEUL, JAMAIS DE CACHE.
  // `planOffline.verifierMaj()` envoie des requêtes CONDITIONNELLES sur les
  // fichiers d'un plan pré-téléchargé pour savoir s'ils ont changé côté
  // serveur. 🩸 Sans cette sortie anticipée, la branche par défaut (cache-first)
  // les servirait depuis le cache : la sonde n'atteindrait JAMAIS le serveur et
  // répondrait toujours « rien n'a changé » — exactement le mensonge qu'elle
  // est censée lever.
  // Le marqueur est dans la query : il rend aussi la requête distincte pour le
  // Cache API (pas de collision avec l'entrée réelle). On ne met RIEN en cache
  // ici — sinon chaque vérification polluerait le cache de N entrées jetables,
  // comptées dans le plafond de 800.
  if (/[?&]_ktacheck=1(&|$)/.test(reqUrl)) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return new Response("", { status: 504, statusText: "Sonde impossible (hors-ligne)" });
      })
    );
    return;
  }

  // 🆘 hotfix20 — Bypass cache TOTAL pour /killsw.html (page de reset
  // d'urgence). Si on cachait cette page, le SW coincé servirait
  // l'ancienne version qui ne ferait pas le bon kill switch. Toujours
  // récupérer la dernière version depuis le serveur, JAMAIS cacher.
  // Le `network-only + no-store` garantit qu'elle est toujours fraîche
  // même si le SW est zombie ailleurs.
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

  // Bypass cache TOTAL pour /Licence-pro.json (signal
  // d'instance pro). Doit être TOUJOURS fetched live depuis le serveur :
  //  - Sur community (myktamap.fr) : 404 attendu → mode community
  //  - Sur instance pro : 200 attendu → mode pro activé côté client
  //  - Si un déployeur retire le fichier, le mode pro doit s'éteindre
  //    instantanément au prochain check (pas de cache LRU qui le maintient).
  // Le `cache: "no-store"` force la requête vers le réseau. Hors ligne, le `catch`
  // répond 503 marqué `X-Kta-Hors-Ligne` — PAS 404 : un 404 voulait dire « pas de
  // licence » et effaçait celle de l'appareil (04/10/2026, KARMA hors wifi : gate
  // community au lieu du dernier compte, état « licence requise » au lieu de « injoignable »).
  if (/\/Licence-pro\.json(\?|$)/.test(reqUrl)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .catch(() => new Response("", {
          status: 503,
          headers: { "Content-Type": "application/json", "X-Kta-Hors-Ligne": "1" }
        }))
    );
    return;
  }

  // OSM TILES CACHE OFFLINE — Intercept des requêtes vers
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

  // Bypass cache TOTAL pour /denylist.json (kill-switch
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

  // STRATEGIE NETWORK-FIRST POUR LES DOCS (Fix B audit impartial)
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

  // STRATEGIE NETWORK-FIRST POUR LES DICOS i18n (lang/*.json)
  // 🩸 Les dicos changent souvent, mais le cache-first les sert « stale » tant
  // que CACHE_NAME ne bump pas ET que le SW se réinstalle : des clés récentes
  // s'affichent humanisées (« Change Btn »), et un SW zombie qui ne se met
  // jamais à jour garde la traduction périmée INDÉFINIMENT.
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

  // NETWORK-FIRST POUR data/index.json (mode serveur kiosque).
  // Le fichier est précaché (boot offline) MAIS il est aussi le canal de
  // configuration d'une instance auto-hébergée (plans, flags, sous-titre,
  // liaisons — cf community-server-line.md). En cache-first, un admin qui
  // modifie son index ne propage RIEN avant réinstallation du SW. Pattern
  // identique aux dicos i18n : réseau (no-store, timeout 3s) → maj cache
  // silencieuse → fallback cache si offline/lent.
  if (/\/data\/index\.json(\?|$)/.test(reqUrl)) {
    event.respondWith((async function() {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkPromise = fetch(event.request, { cache: "no-store" });
        const timeoutPromise = new Promise(function(_, reject) {
          setTimeout(function() { reject(new Error("network timeout")); }, 3000);
        });
        const networkResp = await Promise.race([networkPromise, timeoutPromise]);
        if (networkResp && networkResp.ok) {
          try { cache.put(event.request, networkResp.clone()); } catch(e) {}
          try { networkResp.clone().text().then(_garderModulesDeclares).catch(function() {}); } catch(e) {}
          return networkResp;
        }
        throw new Error("non-ok status " + (networkResp && networkResp.status));
      } catch (e) {
        const cachedResp = await cache.match(event.request, { ignoreSearch: true });
        if (cachedResp) return cachedResp;
        // Pas en cache + offline → 404 JSON propre (decouvrirPlansServeur
        // log « absent » et continue — jamais de crash au boot).
        return new Response("", { status: 404, headers: { "Content-Type": "application/json" } });
      }
    })());
    return;
  }

  event.respondWith(
    // Fix A audit impartial : on scope `caches.match()` au
    // CACHE_NAME courant uniquement. Le `caches.match()` global cherche
    // dans TOUS les caches existants — y compris d'anciens caches pas
    // encore supprimés par l'activate (qui est async). Sans ce scope,
    // le SW peut servir une entrée d'un ancien cache après bump.
    caches.open(CACHE_NAME).then(function(c) { return c.match(event.request); })
      // miss du cache principal → on regarde les caches de plan
      // hors-ligne avant de sortir sur le réseau.
      .then(function(r) { return r || _matchCachesPlan(event.request); })
      // Module d'extension déclaré (cache durable, cf _garderModulesDeclares).
      .then(function(r) {
        if (r) return r;
        return caches.has(MODULES_EXT_CACHE).then(function(existe) {
          return existe ? caches.open(MODULES_EXT_CACHE).then(function(c) { return c.match(event.request); }) : null;
        }).catch(function() { return null; });
      })
      .then((cachedResponse) => {
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
            // (P0-7) : planifie une eviction LRU si on a dépassé le cap.
            _scheduleEviction();
          });

          return networkResponse;
        })
        .catch(() => {
          // le .catch() doit
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
            // Fix A audit impartial : on scope tous les
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