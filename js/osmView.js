/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// OSM-VIEW.JS — Mode "Vue OSM" (v1.39.16)
// =========================
// Modale plein écran avec une seconde carte Leaflet en EPSG:3857 (Web Mercator)
// qui affiche le plan MyKTAMap PROJETÉ sur OpenStreetMap via la calibration
// GPS (georef) du plan.
//
// PRÉREQUIS
//   1. Le plan doit avoir `PLAN_CONFIG.plan.georef = { pointA, pointB }`
//      (saisi via générateur ou Réglages Géoref). Sans georef → bouton masqué.
//   2. Le plan doit être en mode V2 tuilé (`PLAN_CONFIG.plan.tiledV2 === true`).
//      Sinon → alerte pédagogique + abort. CF section CRASH MOBILE ci-dessous.
//   3. L'user doit avoir activé le toggle "🗺️ Autoriser OSM" dans
//      ⚙️ Configuration home (opt-in, default OFF). Sinon → modale d'invite.
//   4. Connexion Internet active (tiles OSM venant de tile.openstreetmap.org).
//
// 🐛 CRASH MOBILE (fix v1.39.10)
//   Avant v1.39.10, on chargeait l'image complète du plan via
//   `L.imageOverlay.rotated(baseImage, ...)` → sur mobile (iPhone PWA budget
//   ~500 MB), un plan 4000×2251 saturait le GPU (OOM crash silencieux).
//   Depuis v1.39.10, on ne supporte QUE les plans V2 tuilés.
//
// 🏗️ MULTI-LVL OSM (v1.39.16)
//   Permet d'afficher plusieurs niveaux M-LVL en parallèle dans la Vue OSM,
//   sans devoir basculer le niveau actif côté map principale.
//   - State `_visibleLevels` : Set<number>|null. null = respect cascade
//     historique (= APP_CONFIG.activeLevel mono comme v1.39.12-14).
//     Set non-vide = union des niveaux sélectionnés.
//   - Chips levels dans le bandeau (visibles si `APP_CONFIG.multiLevel === true`).
//   - Refresh global `_refreshLevelFilteredLayers()` re-render POI + Roads
//     + Iti + Zones + Structures sur changement (tracker non affecté).
//
// 🌐 ZONES + 🏗️ STRUCTURES SUR OSM (v1.39.16 — Step 3b)
//   - Zones : `getZones()` + `getAllEmbeddedZones()`, rendues en L.polygon
//     avec `zone.color` + `zone.fillColor` natifs.
//   - Structures : `getStructures()` + `getAllEmbeddedStructures()`, rendu
//     adaptatif via `window.isStructurePolylineType(type)` :
//     - "front-1"/"front-2" → L.polyline épaisse (limite d'exploitation)
//     - "mur"/"pilier-1"/"pilier-2" → L.polygon fermé
//   - Constants `STRUCTURE_STYLES_OSM` locales alignées sur
//     `structures.js > STRUCTURE_STYLES` (warning sync si tu modifies là-bas).
//   - Filtres : respect `FilterPanel.zoneTypes` + `FilterPanel.structTypes`
//     + niveaux (`_visibleLevels` ou `activeLevel`).
//
// 🛣️ ROADS + 🧭 ITINÉRAIRE SUR OSM (v1.39.14 — Step 3a)
//   Affiche les roads session (`getRoads()`) + embedded data layers
//   (`getAllEmbeddedRoads()`) + l'itinéraire actif (= road `type === "itinerary"`).
//   - Cohérence : couleur `road.color` native (ROAD_TYPES via road.js)
//   - Itinéraire : layer séparé, style cyan #00d4ff dashed "12 6" weight 7
//     (aligné sur road.js > ROAD_TYPES.itinerary — SI ce style change là-bas,
//      penser à sync ici)
//   - Filtre : respect `FilterPanel.roadTypes` + `APP_CONFIG.activeLevel`
//   - Perf : `preferCanvas: true` sur la map OSM → toutes les polylines sur 1
//     canvas (pas N éléments SVG), supporte des milliers de roads sans lag
//   - Toggles séparés "🛣️" + "🧭" dans le bandeau (default ON les 2)
//   Étape suivante (Step 3b) : zones + structures embedded + session.
//
// 📡 TRACKER SUR LA MAP OSM (v1.39.13 — Step 2)
//   Affiche le tracé timeline (polyline) + la position actuelle (marker + cap)
//   du tracker. Update live via polling 1 s tant que la modale est ouverte
//   ET le tracker actif.
//   - Sources : `window.getTrackingTimeline()` (path historique avec timestamps),
//     `window.getTrackingActif()` (état Play/Stop)
//   - Cohérence : couleur depuis `APP_CONFIG.trackingColor` (fallback charte #8cb4ff)
//   - Perf : sub-sample 1-sur-N si timeline > 5000 points (compromis qualité/RAM)
//   - Cap : calculé depuis les 2 derniers points timeline (atan2 sur dx, -dy)
//   - Toggle "📡 Tracker" dans le bandeau + bouton "📡 Centrer tracker"
//   Étape suivante (Step 3) : roads/zones/structures embedded + session.
//
// 📍 POI SUR LA MAP OSM (v1.39.12 — Step 1)
//   Affiche les POI session (window.getEditorPoints) + data layers
//   (window.getAllEmbeddedPoints) sur la map OSM via leur projection georef.
//   - Cohérence : icônes via `getIconUrlForPoint(p)` (mêmes images que la map principale)
//   - Filtre : respect `window._ktaRuntimeFilters.tags` (FilterPanel actif)
//   - Multi-level : si `APP_CONFIG.multiLevel === true`, ne montre que
//     les POI du niveau `APP_CONFIG.activeLevel` (cohérence map principale)
//   - Popup minimal au click : nom + tag + niveau
//   - Toggle "📍 POI" dans le bandeau (default ON)
//   Étape suivante (Step 2) : tracker position + tracé timeline.
//
// 🔍 NIVEAU ADAPTATIF + VIEWPORT CULLING (v1.39.11)
//   v1.39.10 utilisait z = minNativeZoom (scale x8) → qualité trop basse,
//   user voyait flou. v1.39.11 reproduit le pattern Leaflet TileLayer natif :
//   - Boot : heuristique `_choisirNiveauBaseline` = niveau le plus zoomé tel
//     que cols×rows ≤ MAX_TILES_BASELINE (~20 tuiles, budget ~20 MB décodé).
//   - Au zoomend/moveend : delta OSM zoom → delta niveau plan (l'invariant
//     du doublement par cran est partagé OSM ↔ tiling V2).
//   - Viewport culling : un tile n'est créé/conservé que si son AABB en
//     latlng intersecte `_osmMap.getBounds().pad(0.1)`. Add/remove au cull.
//   - Tracker `_tilesByPath` (path → {overlay, tl, tr, bl}) pour add/remove
//     idempotents et cleanup au close().
//
// PROJECTION
//   - Map principale = L.CRS.Simple (pixels plan) → on garde, pas touchée.
//   - Cette modale = NOUVELLE map Leaflet EPSG:3857 (standard mondial WGS84).
//   - Pour chaque tuile V2 du niveau choisi, on calcule ses 3 coins en pixels
//     plan (avec flip Y CRS.Simple), puis on les projette en latlng GPS via
//     `KmzExport.planToGps(transform, x, y)` → on instancie un
//     `L.imageOverlay.rotated(url, tl, tr, bl)` qui les positionne sur OSM.
//     Le 4e coin est déduit géométriquement par le plugin Rotated.
//   - URL des tuiles : `RUNTIME_ASSETS["data/tiles/z<N>/x<col>_y<-k>.jpg"]`,
//     pattern identique à `tiling.js > _resoudreUrlTuile`. asset.url partagé
//     avec la map principale → PAS de revoke au close() (idempotent).
//
// PRIVACY
//   - Aucun appel sortant tant que la modale n'est pas ouverte ET que le
//     toggle "Autoriser OSM" est activé.
//   - Si "Mode incognito" activé → bouton désactivé + toast.
//
// API
//   window.OsmView = {
//     open()            → ouvre la modale (vérifs préalables)
//     close()           → ferme
//     isAvailable()     → bool : plan a un georef valide + toggle activé
//     isOptedIn()       → bool : toggle "Autoriser OSM" activé
//     setOptedIn(value) → toggle setter (utilisé par interface Configuration)
//   }
// =========================

(function() {
  "use strict";

  const LS_OPT_IN_KEY = "myktamap_osm_view_opt_in";
  const OSM_TILE_URL  = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const OSM_ATTR      = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const OSM_MAX_ZOOM  = 19;
  // 🆕 v1.39.11 — Budgets viewport culling + niveau adaptatif
  const MAX_TILES_BASELINE = 20;   // budget RAM mobile ~20 MB décodé au boot
  const VIEWPORT_PADDING   = 0.1;  // 10% pad pour pré-charger les bords (anti-flash au pan)

  let _modalEl   = null;
  let _osmMap    = null;
  let _planLayer = null;       // L.featureGroup contenant les overlays rendus
  let _opacity   = 0.5;        // 🆕 v1.42.4 — default 50% (KARMA, meilleur compromis lecture OSM + plan)
  // 🆕 v1.39.11 — State niveau adaptatif + culling
  let _planBbox        = null; // L.latLngBounds des 4 coins du plan (immuable post-init)
  let _proj            = null; // résultat de _buildProjection() (mémo pour les handlers zoom/move)
  let _baselineOsmZoom = null; // zoom OSM où le plan tient au fit (calc 1 fois)
  let _baseLevel       = null; // niveau plan heuristique à la baseline
  let _currentLevel    = null; // niveau plan actuellement affiché
  let _tilesByPath     = {};   // path → { overlay, tl, tr, bl } pour cull rapide
  let _moveEndHandler  = null; // ref pour cleanup au close()
  // 🆕 v1.39.12 — Step 1 : POI session + data layers
  let _poiLayer   = null;      // L.layerGroup contenant les markers POI
  let _planTilesVisible = true; // 🆕 v1.40.12 — toggle "🖼️ Plan" tuiles V2
  let _poiVisible = true;      // toggle "📍 POI" dans le bandeau (default ON)
  // 🆕 v1.40.17 — Filtre tag LOCAL à la modale OSM (complète FilterPanel global).
  // null = pas de filtre local, Set<string> non-vide = ne montre que ces tags.
  let _osmLocalTagFilter = null;
  // 🆕 v1.40.18 — Bouton "📍 Moi" (position GPS device) : fix ponctuel à la demande,
  // 0 stockage, 0 watch continu (vs _trackerLayer qui suit la timeline session).
  let _myGpsMarker         = null; // L.circleMarker au point GPS
  let _myGpsAccuracyCircle = null; // L.circle d'incertitude si accuracy > seuil
  // 🆕 v1.39.13 — Step 2 : tracker (position live + tracé)
  let _trackerLayer     = null; // L.layerGroup contenant trace + marker + cap
  let _trackerTrace     = null; // L.polyline (timeline)
  let _trackerMarker    = null; // L.marker (dernière position + flèche cap)
  let _trackerVisible   = true; // toggle "📡 Tracker" (default ON)
  let _trackerPollTimer = null; // setInterval pour update live (1 s)
  // 🆕 v1.39.14 — Step 3a : roads + itinéraire
  let _roadLayer    = null;     // L.layerGroup contenant les polylines roads
  let _itiLayer     = null;     // L.layerGroup contenant la polyline itinéraire
  let _roadVisible  = true;     // toggle "🛣️ Routes" (default ON)
  let _itiVisible   = true;     // toggle "🧭 Iti" (default ON)
  // Style itinéraire aligné sur road.js > ROAD_TYPES.itinerary (v1.0+).
  // ⚠️ Si tu modifies ROAD_TYPES.itinerary là-bas, sync ces 3 constantes ici.
  const ITI_COLOR     = "#00d4ff";
  const ITI_WEIGHT    = 5;       // 7 sur map principale, allégé pour OSM (zone +large)
  const ITI_DASHARRAY = "10 6";  // garde le pattern dashed pour distinguer iti des roads
  // 🆕 v1.39.16 — Step 3b : zones + structures
  let _zoneLayer    = null;     // L.layerGroup polygones zones
  let _structLayer  = null;     // L.layerGroup polylines + polygones structures
  let _zoneVisible  = true;
  let _structVisible = true;
  // 🆕 v1.39.16 — Multi-LVL OSM (null = mono fallback activeLevel)
  let _visibleLevels = null;    // Set<number> ou null
  // 🆕 v1.40.34 (Synergie A v2) — Layer Mode Secours :
  // zones d'intervention équipes + itinéraires suggérés par équipe (couleurs
  // distinctives via SecoursMode.PALETTE). Auto-affiché si scénario Mode
  // Secours actif au moment du open() de la modale Vue OSM. Toggle dans
  // bandeau pour basculer ON/OFF à la volée.
  let _secoursLayer   = null;   // L.layerGroup zones + iti + markers entree/sortie
  let _secoursVisible = true;   // toggle "🚨 Secours"
  // Style alignés sur l'overlay map principale (cf secoursMode.js renderOverlay)
  const SECOURS_ITI_WEIGHT       = 4;
  const SECOURS_ITI_DASHARRAY    = "8 4";   // dashed pour distinguer iti équipe vs iti pathfinder global
  const SECOURS_ZONE_FILL_OPAC   = 0.18;    // semi-transparent pour ne pas masquer les POI
  const SECOURS_ZONE_STROKE_OPAC = 0.85;

  // 🆕 v1.40.37 — Mappings couleurs natifs roads + zones pour résolution
  // "comme sur la map principale". Aligné sur road.js > ROAD_STYLES et
  // zones.js > ZONE_STYLES (v1.0+). ⚠️ Sync requise si ces consts changent.
  // Choix : duplication locale plutôt qu'export global car (a) road.js et
  // zones.js ne les exposent pas sur window, (b) ces couleurs sont stables
  // depuis v1.0, (c) on évite le couplage modulaire fort pour un layer OSM.
  const ROAD_STYLES_OSM = {
    "principal":  "#00ff00",  // vert
    "secondaire": "#b000ff",  // violet
    "chemin":     "#ffff00",  // jaune
    "jonction":   "#ff4ecb",  // magenta (dashed sur map principale, simplifié OSM)
    "itinerary":  "#00d4ff"   // cyan (= ITI_COLOR, défini plus bas)
  };
  // ZONE : { stroke, fill } pour cohérence avec L.polygon (color + fillColor)
  const ZONE_STYLES_OSM = {
    "eau":          { stroke: "#0066aa", fill: "#3aa9e8" },
    "remblais":     { stroke: "#3a3a44", fill: "#5a5a68" },
    "effondrement": { stroke: "#cc0000", fill: "#ff3333" },
    "inaccessible": { stroke: "#5a0a0a", fill: "#b8743c" } // pattern SVG → fallback orange uni
  };

  // Style structures aligné sur structures.js > STRUCTURE_STYLES (v1.9+).
  // ⚠️ Si tu modifies STRUCTURE_STYLES là-bas, sync ce mapping ici.
  // - Fronts allégés (weight 10 → 6) car OSM montre une zone plus large.
  // - Piliers & murs : contour noir + remplissage couleur de la masse.
  const STRUCTURE_STYLES_OSM = {
    "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.85, weight: 2, isPolyline: false },
    "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.85, weight: 2, isPolyline: false },
    "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.85, weight: 2, isPolyline: false },
    "front-1":  { color: "#f4c542", weight: 6, opacity: 1, isPolyline: true },
    "front-2":  { color: "#ff9933", weight: 6, opacity: 1, isPolyline: true }
  };

  // =========================
  // CONFIG / OPT-IN
  // =========================
  // 🌍 v1.90.2 — LE DÉFAUT BASCULE À « ACTIF » (décision KARMA : « dans 99 %
  // des cas ce mode est utilisé »).
  //
  // 🩸 LA CLÉ EST TRI-ÉTAT, ET C'EST TOUT L'INTÉRÊT :
  //   "1"   → activé explicitement          → ON  (inchangé)
  //   "0"   → REFUSÉ explicitement          → OFF (inchangé — on ne repasse
  //           JAMAIS par-dessus un refus, c'est la seule règle non négociable
  //           quand on retourne un défaut qui contacte un tiers)
  //   absent → jamais touché                 → ON  (le changement)
  //
  // ⚠️ CE QUE ÇA CHANGE VRAIMENT : le widget OSM du HOME monte une carte
  // Leaflet dont le fond vient de `tile.openstreetmap.org`. Actif par défaut,
  // l'accueil contacte donc OpenStreetMap AU CHARGEMENT, sans clic — pour qui
  // possède au moins un plan géoréférencé. Restent bloquants et prioritaires :
  // incognito, hors-ligne réel, aucun plan géoréf.
  // Un bandeau ponctuel le dit à l'utilisateur la première fois
  // (osmHomePreview.js) : un défaut qui contacte un tiers s'annonce.
  //
  // 🚨 LES DEUX LECTEURS DOIVENT RESTER IDENTIQUES (ici + osmHomePreview.js) :
  // les faire diverger donnerait un widget affiché sans bouton dans la modale,
  // ou l'inverse. `check-osm-defaut.js` les exécute tous les deux.
  function isOptedIn() {
    try { return localStorage.getItem(LS_OPT_IN_KEY) !== "0"; } catch(e) { return false; }
  }
  function setOptedIn(value) {
    try { localStorage.setItem(LS_OPT_IN_KEY, value ? "1" : "0"); } catch(e) {}
    try { window.dispatchEvent(new CustomEvent("kta:osmOptInChange", { detail: { optedIn: !!value } })); } catch(e) {}
  }

  // 🐛 v1.39.2 (KARMA "je vois pas l'icone") — Cascade lecture georef :
  //   1. PLAN_CONFIG.plan.georef (embarqué dans le ZIP via générateur)
  //   2. KmzExport.getCalibration(planId) (LS session via Réglages map mode)
  // Format identique : {pointA: {x, y, lat, lng}, pointB: {x, y, lat, lng}}.
  // Avant ce fix, on ne lisait QUE la source 1 → les users ayant saisi le
  // georef via Réglages map mode (= la grande majorité, plus simple que
  // de regénérer un ZIP) n'avaient pas le bouton OSM.
  function _getEffectiveGeoref() {
    // Source 1 : embarqué plan-config.json
    if (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.georef) {
      const g = window.PLAN_CONFIG.plan.georef;
      if (g.pointA && g.pointB
          && Number.isFinite(g.pointA.lat) && Number.isFinite(g.pointA.lng)
          && Number.isFinite(g.pointB.lat) && Number.isFinite(g.pointB.lng)
          && Number.isFinite(g.pointA.x)   && Number.isFinite(g.pointA.y)
          && Number.isFinite(g.pointB.x)   && Number.isFinite(g.pointB.y)) {
        return g;
      }
    }
    // Source 2 : LS session via KmzExport.getCalibration
    if (window.KmzExport && typeof window.KmzExport.getCalibration === "function") {
      const planId = window._currentLoadedPlanId || "default";
      const g = window.KmzExport.getCalibration(planId);
      if (g && g.pointA && g.pointB
          && Number.isFinite(g.pointA.lat) && Number.isFinite(g.pointA.lng)
          && Number.isFinite(g.pointB.lat) && Number.isFinite(g.pointB.lng)
          && Number.isFinite(g.pointA.x)   && Number.isFinite(g.pointA.y)
          && Number.isFinite(g.pointB.x)   && Number.isFinite(g.pointB.y)) {
        return g;
      }
    }
    return null;
  }
  function _hasGeoref() {
    return !!_getEffectiveGeoref();
  }
  function _isIncognitoOn() {
    try { return !!(window.IncognitoMode && window.IncognitoMode.isActive && window.IncognitoMode.isActive()); }
    catch(e) { return false; }
  }
  // 🐛 v1.39.4 (KARMA "j'affiche pas le bouton si on a pas internet") —
  // navigator.onLine est mis à false par le navigateur quand il détecte
  // qu'on est offline (Wi-Fi coupé, 4G perdue, mode avion). Sans internet
  // les tiles OSM ne se chargent pas, le bouton n'a aucun sens. Le polling
  // 2s de refonteInterface.js détectera le retour online automatiquement.
  function _isOnline() {
    return (typeof navigator === "undefined") || navigator.onLine !== false;
  }

  // 🆕 v1.43.0 — Cache OSM offline (cf js/osmTilesCache.js).
  // _planHasCachedTiles : boolean cache présent pour la bbox du plan
  //   courant (au moins quelques tuiles échantillonnées). Relaxé en
  //   sync pour _isAvailable() (qui doit rester synchrone car appelé
  //   par refonteInterface en polling 2s).
  // _recheckCachedForCurrentPlan : refresh async la flag, appelé au
  //   changement de plan + post-cacheVisibleTiles + au boot.
  let _planHasCachedTiles = false;
  let _recheckInFlight = false; // évite N rechecks concurrents (polling 2s)
  async function _recheckCachedForCurrentPlan() {
    if (_recheckInFlight) return;
    _recheckInFlight = true;
    const before = _planHasCachedTiles;
    try {
      if (!window.OsmTilesCache) { _planHasCachedTiles = false; }
      else {
        const bbox = _getPlanGpsBbox();
        if (!bbox) {
          // ⚠️ Plan pas encore chargé (bbox null) : on NE remet PAS la flag
          // à false — on garde la dernière valeur connue. Sinon, lors d'un
          // switch de plan ou d'un reload offline, on flusherait à false
          // avant que PLAN_CONFIG ne soit prêt → bouton masqué à tort
          // pendant 1-2 ticks.
        } else {
          // 🐛 v1.43.6 — Mode any-zoom : on ne passe PAS de zoom hardcodé →
          // OsmTilesCache scanne 10→18 et retourne true dès qu'il trouve
          // une tuile cachée au centre du plan. Évite le faux-négatif
          // quand l'user a caché à un zoom ≠ 14 (= cas standard).
          _planHasCachedTiles = await window.OsmTilesCache.hasCacheForBbox(bbox);
        }
      }
    } catch(e) {
      // En cas d'erreur, on garde la dernière valeur (pas de régression UI)
    } finally {
      _recheckInFlight = false;
    }
    // 🆕 v1.43.2 — Si la flag a changé, dispatch event pour que
    // refonteInterface refresh le bouton 🌍 OSM immédiatement (sans
    // attendre le polling 2s). `kta:osmOptInChange` est déjà écouté
    // ligne 299 de refonteInterface.js pour exactement ce flow.
    if (before !== _planHasCachedTiles) {
      try {
        window.dispatchEvent(new CustomEvent("kta:osmOptInChange", {
          detail: { reason: "cacheStateChanged", hasCachedTiles: _planHasCachedTiles }
        }));
      } catch(e) {}
    }
  }
  // Combo online OU cache → permet d'ouvrir Vue OSM offline si on a
  // pré-caché les tuiles du plan (= sortie terrain Mode Secours).
  function _isOnlineOrCached() {
    return _isOnline() || _planHasCachedTiles;
  }
  // 🆕 v1.39.10 — Détecte si le plan courant est en mode V2 tuilé.
  // Vue OSM réservée aux plans V2 pour éviter le crash mobile (cf. header doc).
  function _isV2Plan() {
    const pc = window.PLAN_CONFIG;
    return !!(pc && pc.plan && pc.plan.tiledV2 === true && pc.tiling
              && Number.isFinite(pc.tiling.minNativeZoom)
              && Number.isFinite(pc.tiling.tileSize));
  }

  function isAvailable() {
    // 🆕 v1.43.0 — Si offline mais cache OSM présent pour la bbox du
    // plan, on autorise quand même l'ouverture (mode « cache offline »).
    // L'incognito reste bloquant (= choix volontaire user).
    // Fire-and-forget : à chaque appel (polling 2s refonteInterface) on
    // raffraichit la flag _planHasCachedTiles en arrière-plan → converge
    // en ~1 tick après chargement du plan. Sans ça, la flag reste à false
    // car le setTimeout boot (1500ms) peut tirer avant que PLAN_CONFIG
    // ne soit prêt (bbox null → flag false définitive).
    try {
      if (window.OsmTilesCache) _recheckCachedForCurrentPlan();
    } catch(e) {}
    return _hasGeoref() && isOptedIn() && !_isIncognitoOn() && _isOnlineOrCached();
  }

  // =========================
  // PROJECTION : pixels plan → latlng GPS
  // =========================
  // Retourne un objet { transform, planToLatLng(x, y) → L.latLng } ou null.
  function _buildProjection() {
    const g = _getEffectiveGeoref();
    if (!g) return null;
    if (typeof window.KmzExport !== "object" || typeof window.KmzExport.buildTransform !== "function") return null;
    let t;
    try {
      t = window.KmzExport.buildTransformCalib(g);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
    } catch(err) {
      console.warn("[OsmView] buildTransform failed :", err);
      return null;
    }
    return {
      transform: t,
      planToLatLng: function(x, y) {
        const g = window.KmzExport.planToGps(t, x, y);
        return g ? L.latLng(g.lat, g.lng) : null;
      }
    };
  }

  // =========================
  // PROJECTION D'UN IMAGE LAYER (base ou calque)
  // =========================
  // Retourne { tl, tr, bl } en latlng GPS, ou null en cas d'échec.
  // - Si calibration absente → utilise les 4 coins du plan principal
  //   (0,0)-(W,0)-(0,H). Sinon → 3 coins du parallélogramme calibré.

  // =========================
  // 🆕 v1.39.12 — POI SUR OSM (Step 1)
  // =========================

  // Respecte le filtre tags actif côté FilterPanel (v1.21.5). Sémantique :
  // - state.tags === null → aucun filtre actif → tous visibles
  // - state.tags === Set/Array d'allowed → check membership
  function _isTagAllowed(p) {
    const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
    // 🆕 v1.40.17 — Filtre local modale OSM (prioritaire, AND avec FilterPanel)
    if (_osmLocalTagFilter && _osmLocalTagFilter.size > 0 && !_osmLocalTagFilter.has(t)) {
      return false;
    }
    let state = null;
    try {
      state = (window.FilterPanel && typeof window.FilterPanel.getState === "function")
                ? window.FilterPanel.getState()
                : window._ktaRuntimeFilters || null;
    } catch(e) {}
    if (!state || !state.tags) return true;
    if (state.tags instanceof Set) return state.tags.has(t);
    if (Array.isArray(state.tags)) return state.tags.indexOf(t) >= 0;
    return true;
  }


  // 🩸 v1.83.0 — LA VUE OSM APPLIQUE LA MÊME LOI QUE LE MODE PLAN.
  //
  // En v1.82.0, une première tentative posait une variable CSS que personne
  // ne lit (la Vue OSM est elle aussi en `preferCanvas`) : retirée. Le rendu
  // restait acceptable parce que le repli des types custom tombe sur le
  // gabarit « mur » (weight 2) — un HEUREUX ACCIDENT, consigné au backlog
  // plutôt que corrigé à l'aveugle. KARMA : « en mode OSM c'était pas mal,
  // mais ça reste encore limite ».
  //
  // La loi est maintenant formulée en PIXELS PAR MÈTRE (structures.js), donc
  // utilisable ici : la Vue OSM n'a pas d'échelle de plan, mais elle sait sa
  // résolution Web Mercator — laquelle dépend de la LATITUDE autant que du
  // zoom. Un front de 1,5 m fait 1 px quand la carrière tient dans l'écran,
  // 7 px quand on est dessus. Plus aucun palier réglé à la main.
  //
  // Même technique qu'en mode plan : on mute `options.weight` en place — le
  // renderer canvas le relit à chaque frame — puis on force UNE repeinture
  // non clippée. Aucun `setStyle`, intenable à ce volume.
  function _majLargeurFrontsOsm() {
    if (!_osmMap || !_structLayer) return;
    if (typeof window.ktaPxParMetreOsm !== "function") return;
    const pxm = window.ktaPxParMetreOsm(_osmMap);
    const w = (typeof window.ktaLargeurFrontPourPxParMetre === "function")
      ? window.ktaLargeurFrontPourPxParMetre(pxm) : null;
    if (!w) return;
    const wTrace = (typeof window.ktaLargeurTracePourRatio === "function")
      ? Math.max(1, Math.round(w * 0.6 * 10) / 10) : w;
    try {
      _structLayer.eachLayer(function (lay) {
        // Les surfaces gardent leur trait : un pilier se lit à son
        // remplissage, pas à l'épaisseur de son contour.
        if (!lay || !lay.options || lay.options.fill === true) return;
        lay.options.weight = w;
      });
      if (_roadLayer && typeof _roadLayer.eachLayer === "function") {
        _roadLayer.eachLayer(function (lay) {
          if (!lay || !lay.options || lay.options.fill === true) return;
          lay.options.weight = wTrace;
        });
      }
    } catch (e) { return; }
    // ⚠️ `_redrawBounds` d'abord : sinon `_draw` clippe sur une demande en
    // attente et ne repeint qu'un rectangle (cf. gotchas.md).
    try {
      const r = _osmMap._renderer;
      if (r && typeof r._redraw === "function") { r._redrawBounds = null; r._redraw(); }
    } catch (e) {}
  }

  function _isLevelAllowed(p) {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.multiLevel) return true;
    const lvl = (typeof p.level === "number") ? p.level : 0;
    if (_visibleLevels && _visibleLevels.size > 0) {
      return _visibleLevels.has(lvl);
    }
    const active = cfg.activeLevel;
    if (!Number.isFinite(active)) return true;
    return lvl === active;
  }

  // Agrège les POI session + data layers en un seul tableau.
  // Format unifié : { x, y, nom, tags, level, description, _source, _ref }
  // 🐛 v1.40.40 — KARMA : « en mode HOME on a bien Titre/description/tag,
  // mais pas en mode MAP ». Cause racine : `description` n'était pas copié
  // dans les objets normalisés (oubli depuis v1.39.12 Step 1). Le popup
  // construit en _renderPoi (ligne ~501) lisait `p.description` → undefined
  // → fallback tag, jamais la description. Fix : ajout `description` aux 2
  // push. Le widget HOME (osmHomePreview.js) itère directement sur
  // layer.points sans copie filtrée, donc le bug n'existait pas là.
  function _collectVisiblePoi() {
    const out = [];
    // 1. Session editor
    if (typeof window.getEditorPoints === "function") {
      const session = window.getEditorPoints() || [];
      for (const p of session) {
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
        if (!_isTagAllowed(p) || !_isLevelAllowed(p)) continue;
        out.push({
          x: p.x, y: p.y,
          nom: p.nom || p.label || "",
          tags: Array.isArray(p.tags) ? p.tags : [],
          level: (typeof p.level === "number") ? p.level : 0,
          description: (typeof p.description === "string") ? p.description : "",
          _source: "session",
          _ref: p
        });
      }
    }
    // 2. Data layers (embedded)
    if (typeof window.getAllEmbeddedPoints === "function") {
      const embedded = window.getAllEmbeddedPoints() || [];
      for (const p of embedded) {
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
        if (!_isTagAllowed(p) || !_isLevelAllowed(p)) continue;
        out.push({
          x: p.x, y: p.y,
          nom: p.nom || p.label || "",
          tags: Array.isArray(p.tags) ? p.tags : [],
          level: (typeof p.level === "number") ? p.level : 0,
          description: (typeof p.description === "string") ? p.description : "",
          _source: "data",
          _ref: p
        });
      }
    }
    return out;
  }

  // Construit une L.icon réutilisable pour un POI donné (taille uniforme 26×26
  // pour rester lisible sur OSM, plus petit que sur la map principale 32×32 car
  // l'écran OSM montre une zone géographique plus large).
  // Fallback : si pas d'icône résolue, retourne null → L.marker default.
  function _buildPoiIcon(p) {
    let iconUrl = null;
    try {
      if (typeof window.getIconUrlForPoint === "function") {
        iconUrl = window.getIconUrlForPoint(p);
      }
    } catch(e) {}
    if (!iconUrl) return null;
    return L.icon({
      iconUrl: iconUrl,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
  }

  // Rendu de tous les POI sur _poiLayer. Idempotent : vide d'abord puis re-rend.
  // Appelé au boot de la modale + à chaque toggle "📍 POI" rallumé.
  function _renderPoi() {
    if (!_proj || !_osmMap) return;
    if (!_poiLayer) _poiLayer = L.layerGroup().addTo(_osmMap);
    _poiLayer.clearLayers();

    const list = _collectVisiblePoi();
    let added = 0, skipped = 0;
    for (const p of list) {
      const latlng = _proj.planToLatLng(p.x, p.y);
      if (!latlng) { skipped++; continue; }
      const icon = _buildPoiIcon(p);
      const opts = icon ? { icon: icon, interactive: true } : { interactive: true };
      try {
        const marker = L.marker(latlng, opts);
        // 🆕 v1.40.25 — Popup : description prééminente (KARMA "on affiche le tag
        // et non la description"). Si description vide, fallback tag.
        const tag  = (p.tags && p.tags[0]) || "default";
        const lvl  = (window.APP_CONFIG && window.APP_CONFIG.multiLevel)
                       ? window.I18n.t("osm.poi.popup.levelSuffix", { level: p.level })
                       : "";
        const desc = (p.description || "").trim();
        const html =
          '<div style="font-size:13px; min-width:140px; max-width:260px;">' +
            '<b>' + _escapeHtml(p.nom || window.I18n.t("osm.poi.popup.noName")) + '</b><br>' +
            '<span style="color:#c8d0e0; font-size:12px;">' +
              (desc ? _escapeHtml(desc) : _escapeHtml(tag)) + lvl +
            '</span>' +
            (desc ? '<br><span style="color:#8892a4; font-size:10.5px; opacity:0.75;">🏷️ ' + _escapeHtml(tag) + '</span>' : '') +
          '</div>';
        // 🆕 v1.40.22 — className "kta-osm-popup" pour appliquer style charte dark
        marker.bindPopup(html, {
          closeButton: true,
          autoClose: true,
          autoPan: true,
          maxWidth: 280,
          className: "kta-osm-popup"
        });
        marker.addTo(_poiLayer);
        added++;
      } catch(e) { console.warn("[OsmView] POI :", p.nom, e); }
    }
    console.log("[OsmView] POI : " + added + " marker(s) ajouté(s) (" + skipped + " skip projection invalide, sources : session+data)");
    // 🆕 v1.40.17 — Refresh chips tags après chaque render POI (les tags disponibles
    // dépendent du plan courant et du M-LVL actif).
    _renderOsmTagChips();
  }

  // 🆕 v1.40.17 — Énumération de TOUS les tags présents dans les POI du plan.
  // 🆕 v1.41.3 — Retiré le filtre `_isLevelAllowed` (chips perdaient l'accès
  // aux tags d'autres niveaux M-LVL).
  // 🆕 v1.41.4 — VRAI FIX (KARMA "il en manque toujours plein"). Le registre
  // `window._dataLayersByPlan` utilisé en v1.41.3 N'EXISTE PAS dans l'app
  // (jamais peuplé nulle part) → on ne comptait que `listePoints` (3 tags
  // visibles : pe, epure, vehicule = juste la session). Switch sur le VRAI
  // registre runtime `window._ktaDataMarkers` (chaque marker a `_ktaTags`),
  // utilisé par filterPanel.js depuis v1.21.5. Source unique de vérité.
  function _enumerateOsmTags() {
    const counts = {};
    // Session + POI principaux du plan (getEditorPoints → listePoints).
    if (typeof window.getEditorPoints === "function") {
      const session = window.getEditorPoints() || [];
      for (const p of session) {
        if (!p || typeof p.x !== "number") continue;
        const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    // Data layers embarqués : utilise window.getAllEmbeddedPoints (= même
    // source que _collectVisiblePoi ligne 450 qui rend les markers sur la
    // carte OSM). Cohérence parfaite chips ↔ rendu : tout tag listé dans
    // les chips correspond à des markers réellement rendables.
    if (typeof window.getAllEmbeddedPoints === "function") {
      const embedded = window.getAllEmbeddedPoints() || [];
      for (const p of embedded) {
        if (!p || typeof p.x !== "number") continue;
        const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return counts;
  }

  // 🆕 v1.40.17 — Rendu chips tags (filtre local OSM) dans le bandeau modale.
  function _renderOsmTagChips() {
    const cont = document.getElementById("kta-osm-tags-chips");
    const bar  = document.getElementById("kta-osm-tags-bar");
    if (!cont || !bar) return;
    const counts = _enumerateOsmTags();
    const tags   = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
    if (tags.length === 0) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "flex";
    const isAllActive = !_osmLocalTagFilter || _osmLocalTagFilter.size === 0;
    let html = '<button type="button" data-tag="__all__" title="' + _escapeHtml(window.I18n.t("osm.tags.showAll.title")) + '" ' +
               'style="font-size:11px; padding:2px 8px; border-radius:10px; cursor:pointer; ' +
               'border:1px solid ' + (isAllActive ? "rgba(244,197,66,0.6)" : "rgba(140,180,255,0.3)") + '; ' +
               'background:' + (isAllActive ? "rgba(244,197,66,0.2)" : "rgba(255,255,255,0.03)") + '; ' +
               'color:' + (isAllActive ? "#f4c542" : "#8892a4") + ';">' + _escapeHtml(window.I18n.t("osm.tags.all")) + '</button>';
    for (const t of tags) {
      const active = isAllActive || (_osmLocalTagFilter && _osmLocalTagFilter.has(t));
      html += '<button type="button" data-tag="' + _escapeHtml(t) + '" title="' + _escapeHtml(window.I18n.t("osm.tags.poiCount", { count: counts[t] })) + '" ' +
              'style="font-size:11px; padding:2px 8px; border-radius:10px; cursor:pointer; ' +
              'border:1px solid ' + (active ? "rgba(244,197,66,0.6)" : "rgba(140,180,255,0.3)") + '; ' +
              'background:' + (active ? "rgba(244,197,66,0.2)" : "rgba(255,255,255,0.03)") + '; ' +
              'color:' + (active ? "#f4c542" : "#8892a4") + ';">' + _escapeHtml(t) + '</button>';
    }
    cont.innerHTML = html;
    const buttons = cont.querySelectorAll("button[data-tag]");
    buttons.forEach(function(btn) {
      btn.addEventListener("click", function() {
        const tag = btn.dataset.tag;
        if (tag === "__all__") {
          _osmLocalTagFilter = null;
        } else {
          if (!_osmLocalTagFilter) _osmLocalTagFilter = new Set();
          if (_osmLocalTagFilter.has(tag)) _osmLocalTagFilter.delete(tag);
          else _osmLocalTagFilter.add(tag);
          if (_osmLocalTagFilter.size === 0) _osmLocalTagFilter = null;
        }
        if (_poiVisible) _renderPoi();
        else _renderOsmTagChips();
      });
    });
  }

  // 🆕 v1.40.21 — Calcule la bbox GPS du plan courant (englobante des 4 coins
  // projetés). Utilisée par le garde-fou "GPS hors champ du plan" pour le bouton
  // 📍. Retourne L.LatLngBounds ou null si impossible à calculer.
  function _getPlanGpsBbox() {
    // 🆕 v1.41.2 — Lazy build : si _proj pas initialisé (modale Vue OSM
    // jamais ouverte dans la session), on construit la projection à la
    // volée. _buildProjection() est pur (lit georef + KmzExport), pas
    // d'effet de bord. Permet à Briefing pompiers PDF de calculer la
    // bbox même sans avoir ouvert la Vue OSM avant.
    let proj = _proj;
    if (!proj || typeof proj.planToLatLng !== "function") {
      proj = _buildProjection();
      if (!proj || typeof proj.planToLatLng !== "function") return null;
    }
    const cfg = window.APP_CONFIG || {};
    const w = cfg.imageWidth, h = cfg.imageHeight;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    const corners = [
      proj.planToLatLng(0, 0),
      proj.planToLatLng(w, 0),
      proj.planToLatLng(w, h),
      proj.planToLatLng(0, h)
    ].filter(function(ll) {
      return ll && Number.isFinite(ll.lat) && Number.isFinite(ll.lng);
    });
    if (corners.length < 2) return null;
    try { return L.latLngBounds(corners); } catch(e) { return null; }
  }

  // 🆕 v1.40.21 — Distance Haversine (km) pour message UX.
  function _haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371; // rayon Terre km
    const toRad = function(d) { return d * Math.PI / 180; };
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // 🆕 v1.40.18 — Fix GPS ponctuel + marker sur la map (1 clic = 1 fix).
  // Source : navigator.geolocation (API browser native). 0 réseau, 0 stockage.
  // Permission OS demandée à la demande user (pas au boot).
  // Garde runtime incognito : si l'user est passé en incognito PENDANT la
  // session (la modale était déjà ouverte), on bloque ici.
  // Note : navigator.onLine===false ne bloque PAS le GPS (le GPS marche en avion).
  function _showMyGpsPositionOsm() {
    if (!_osmMap) return;
    if (_isIncognitoOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("osm.gps.incognito.toast"), "warn");
      } else { alert(window.I18n.t("osm.gps.incognito.alert")); }
      return;
    }
    if (!navigator.geolocation) {
      alert(window.I18n.t("osm.gps.unavailable"));
      return;
    }
    const btn = document.getElementById("kta-osm-mygps");
    const originalHtml = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳"; }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        // 🆕 v1.43.26 — Guard : modale fermée pendant l'attente du fix GPS
        // (user a cliqué ✕ ou Escape avant que la geoloc réponde) → on ne
        // touche pas un DOM/state mort. Évite crash sur `_osmMap.setView(...)`
        // si la carte a été destroyed par close().
        if (!_modalEl || !_osmMap) {
          console.log("[OsmView] geoloc callback : modale fermée avant fix, skip");
          return;
        }
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 0;
        // 🆕 v1.40.21 — Garde-fou "hors champ du plan" : si fix GPS très loin
        // du plan georef (>50% au-delà de la bbox plan), on REFUSE d'afficher
        // le marker (UX + privacy : pas de marker à des km du plan supposé).
        const bbox = _getPlanGpsBbox();
        if (bbox) {
          const padded = bbox.pad(0.5); // +50% chaque côté = marge généreuse
          if (!padded.contains([lat, lng])) {
            const center = bbox.getCenter();
            const distKm = _haversineKm(lat, lng, center.lat, center.lng);
            const msg = window.I18n.t("osm.gps.outOfBounds", { dist: distKm.toFixed(1) });
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(msg, "warn");
            } else { alert(msg); }
            console.log("[OsmView] GPS rejeté : hors bbox plan (",
                        lat.toFixed(5), ",", lng.toFixed(5),
                        "→ distance centre", distKm.toFixed(2), "km)");
            if (btn && originalHtml != null) { btn.disabled = false; btn.innerHTML = originalHtml; }
            return;
          }
        }
        try {
          if (_myGpsMarker && _osmMap.hasLayer(_myGpsMarker)) _osmMap.removeLayer(_myGpsMarker);
        } catch(e) {}
        try {
          if (_myGpsAccuracyCircle && _osmMap.hasLayer(_myGpsAccuracyCircle)) _osmMap.removeLayer(_myGpsAccuracyCircle);
        } catch(e) {}
        // Cercle accuracy d'abord (sous le marker)
        if (acc > 20) {
          _myGpsAccuracyCircle = L.circle([lat, lng], {
            radius: acc, color: "#00d4ff", weight: 1,
            fillColor: "#00d4ff", fillOpacity: 0.10, interactive: false
          }).addTo(_osmMap);
        }
        _myGpsMarker = L.circleMarker([lat, lng], {
          radius: 8, color: "#ffffff", weight: 2,
          fillColor: "#00d4ff", fillOpacity: 0.95
        }).addTo(_osmMap);
        _myGpsMarker.bindPopup(
          '<div style="font-size:13px; min-width:140px;">' +
            '<b>' + window.I18n.t("osm.gps.popup.title") + '</b><br>' +
            '<span style="font-size:11.5px; color:#8892a4;">' +
              lat.toFixed(5) + ", " + lng.toFixed(5) + '<br>' +
              window.I18n.t("osm.gps.popup.accuracy", { acc: Math.round(acc) }) +
            '</span>' +
          '</div>',
          { closeButton: true, autoClose: true }
        ).openPopup();
        const targetZoom = Math.max(_osmMap.getZoom(), 17);
        _osmMap.setView([lat, lng], targetZoom);
        if (btn && originalHtml != null) { btn.disabled = false; btn.innerHTML = originalHtml; }
        console.log("[OsmView] GPS fix :", lat.toFixed(5), lng.toFixed(5), "±" + Math.round(acc) + "m");
      },
      function(err) {
        console.warn("[OsmView] GPS err :", err);
        let msg = window.I18n.t("osm.gps.err.generic");
        if (err.code === 1) msg = window.I18n.t("osm.gps.err.permission");
        else if (err.code === 2) msg = window.I18n.t("osm.gps.err.unavailable");
        else if (err.code === 3) msg = window.I18n.t("osm.gps.err.timeout");
        alert(msg);
        if (btn && originalHtml != null) { btn.disabled = false; btn.innerHTML = originalHtml; }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  // Toggle on/off du layer POI. Si _poiLayer n'existe pas encore (cas user
  // ouvre la modale avec _poiVisible=false puis active le toggle) → render à la volée.
  function _togglePoiVisible(visible) {
    _poiVisible = !!visible;
    if (!_osmMap) return;
    if (_poiVisible) {
      if (!_poiLayer) {
        _renderPoi();
      } else if (!_osmMap.hasLayer(_poiLayer)) {
        _osmMap.addLayer(_poiLayer);
      }
    } else if (_poiLayer && _osmMap.hasLayer(_poiLayer)) {
      _osmMap.removeLayer(_poiLayer);
    }
  }

  // Mini-helper d'escape HTML pour les popups (évite XSS sur les noms de POI
  // qui peuvent contenir <, >, & si l'user a saisi des trucs bizarres).
  function _escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // =========================
  // 🆕 v1.39.13 — TRACKER SUR OSM (Step 2)
  // =========================

  function _isTrackerActif() {
    try {
      return !!(typeof window.getTrackingActif === "function" && window.getTrackingActif());
    } catch(e) { return false; }
  }

  function _getTrackerTimeline() {
    try {
      if (typeof window.getTrackingTimeline === "function") {
        return window.getTrackingTimeline() || [];
      }
    } catch(e) {}
    return [];
  }

  function _getTrackerColor() {
    const cfg = window.APP_CONFIG || {};
    return cfg.trackingColor || cfg.trackColor || "#8cb4ff"; // charte interaction
  }

  // Sub-sample 1-sur-N si timeline > maxN (anti-lag polyline mobile).
  // Stratégie simple, garde toujours le dernier point (position courante).
  // RDP aurait été plus malin visuellement mais coûte ~30 lignes — à upgrader
  // en Step 2.1 si retour terrain.
  function _subsampleTimeline(points, maxN) {
    if (!Array.isArray(points) || points.length <= maxN) return points || [];
    const step = Math.ceil(points.length / maxN);
    const out = [];
    for (let i = 0; i < points.length; i += step) out.push(points[i]);
    const last = points[points.length - 1];
    if (out[out.length - 1] !== last) out.push(last); // assure last point inclus
    return out;
  }

  // Calcule un cap (degrés CW depuis le Nord plan) depuis les 2 derniers points
  // de la timeline. Retourne null si pas assez de points ou bougé trop petit.
  // En coords plan : y=0 = haut du plan = nord, donc dy<0 = "vers le nord".
  // Formule : atan2(dx, -dy) → 0°=N, 90°=E, 180°=S, 270°=W.
  function _computeTrackerHeading(timeline) {
    if (!Array.isArray(timeline) || timeline.length < 2) return null;
    const a = timeline[timeline.length - 2];
    const b = timeline[timeline.length - 1];
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx * dx + dy * dy < 0.01) return null; // bougé < 0.1px → cap pas fiable
    return Math.atan2(dx, -dy) * 180 / Math.PI;
  }

  // Construit la divIcon du marker tracker (cercle coloré + flèche cap optionnelle).
  // Note : le heading est appliqué via inline CSS rotate sur la flèche enfant.
  function _buildTrackerIcon(color, heading) {
    let html =
      '<div style="background:' + color + '; width:14px; height:14px; border-radius:50%;' +
      ' border:2px solid #fff; box-shadow:0 0 6px rgba(0,0,0,0.5); position:relative;">';
    if (heading != null) {
      html +=
        '<div class="kta-osm-tracker-arrow" style="position:absolute; top:-13px; left:50%;' +
        ' width:0; height:0; border-left:5px solid transparent; border-right:5px solid transparent;' +
        ' border-bottom:9px solid ' + color + ';' +
        ' transform-origin:50% 22px; transform:translateX(-50%) rotate(' + heading + 'deg);"></div>';
    }
    html += '</div>';
    return L.divIcon({
      className: "kta-osm-tracker-marker",
      html: html,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
  }

  // Rendu / update du tracker (polyline + marker + cap).
  // Idempotent : si déjà rendu, update setLatLngs sur la polyline (pas de recréation)
  // + setLatLng sur le marker + setIcon si heading a changé.
  function _renderTracker() {
    if (!_proj || !_osmMap) return;
    if (!_trackerLayer) _trackerLayer = L.layerGroup().addTo(_osmMap);

    const timeline = _getTrackerTimeline();
    if (timeline.length === 0) {
      // Pas de timeline (jamais démarré OU reset) → cleanup éventuels artefacts
      if (_trackerTrace)  { try { _trackerTrace.remove();  } catch(e) {} _trackerTrace  = null; }
      if (_trackerMarker) { try { _trackerMarker.remove(); } catch(e) {} _trackerMarker = null; }
      return;
    }

    // Sub-sample si timeline trop longue (anti-lag mobile)
    const points = _subsampleTimeline(timeline, 5000);

    // Projection plan → latlng OSM
    const latlngs = [];
    for (const p of points) {
      const ll = _proj.planToLatLng(p.x, p.y);
      if (ll) latlngs.push(ll);
    }
    if (latlngs.length === 0) return;

    const color   = _getTrackerColor();
    const heading = _computeTrackerHeading(timeline);
    const last    = latlngs[latlngs.length - 1];

    // Polyline timeline : create ou update setLatLngs (économe vs recreate)
    if (!_trackerTrace) {
      _trackerTrace = L.polyline(latlngs, {
        color: color,
        weight: 4,
        opacity: 0.85,
        interactive: false
      }).addTo(_trackerLayer);
    } else {
      _trackerTrace.setLatLngs(latlngs);
      // Update couleur si l'user l'a changée pendant la modale ouverte (rare mais possible)
      if (_trackerTrace.options.color !== color) _trackerTrace.setStyle({ color: color });
    }

    // Marker position courante : create ou setLatLng + setIcon (pour update cap)
    if (!_trackerMarker) {
      _trackerMarker = L.marker(last, {
        icon: _buildTrackerIcon(color, heading),
        interactive: false,
        keyboard: false
      }).addTo(_trackerLayer);
    } else {
      _trackerMarker.setLatLng(last);
      _trackerMarker.setIcon(_buildTrackerIcon(color, heading));
    }
  }

  // Toggle on/off du layer tracker. Si pas encore créé + visible → render à la volée.
  function _toggleTrackerVisible(visible) {
    _trackerVisible = !!visible;
    if (!_osmMap) return;
    if (_trackerVisible) {
      if (!_trackerLayer) {
        _renderTracker();
      } else if (!_osmMap.hasLayer(_trackerLayer)) {
        _osmMap.addLayer(_trackerLayer);
      }
      _startTrackerPolling();
    } else {
      if (_trackerLayer && _osmMap.hasLayer(_trackerLayer)) {
        _osmMap.removeLayer(_trackerLayer);
      }
      _stopTrackerPolling();
    }
  }

  // Polling 1 s pour update live tant que la modale est ouverte ET le tracker actif.
  // No-op si tracker pas actif → pas de coût CPU inutile sur sessions où l'user
  // n'a pas démarré le tracker (typique en consultation pure).
  function _startTrackerPolling() {
    if (_trackerPollTimer) return;
    _trackerPollTimer = setInterval(function() {
      if (!_trackerVisible || !_osmMap) return;
      if (!_isTrackerActif()) return; // skip si tracker pas en marche
      _renderTracker();
    }, 1000);
  }

  function _stopTrackerPolling() {
    if (_trackerPollTimer) { clearInterval(_trackerPollTimer); _trackerPollTimer = null; }
  }

  // Centre la map OSM sur la dernière position tracker (utile en navigation).
  // Bump auto au zoom OSM ≥ 16 si on était trop dézoomé (pour bien voir la zone).
  function _centerOnTracker() {
    if (!_osmMap || !_trackerMarker) return;
    try {
      const ll = _trackerMarker.getLatLng();
      if (_osmMap.getZoom() < 16) {
        _osmMap.setView(ll, 17, { animate: true });
      } else {
        _osmMap.panTo(ll, { animate: true });
      }
    } catch(e) { console.warn("[OsmView] center tracker :", e); }
  }

  // =========================
  // 🆕 v1.39.14 — ROADS + ITINÉRAIRE SUR OSM (Step 3a)
  // =========================

  // Check filtre type road actif côté FilterPanel (roadTypes Set/Array, null = pas de filtre).
  // Type "itinerary" est exclu côté roads via _collectVisibleRoads (traité dans _itiLayer dédié).
  function _isRoadTypeAllowed(road) {
    let state = null;
    try {
      state = (window.FilterPanel && typeof window.FilterPanel.getState === "function")
                ? window.FilterPanel.getState()
                : window._ktaRuntimeFilters || null;
    } catch(e) {}
    if (!state || !state.roadTypes) return true;
    const t = road.type || "default";
    if (state.roadTypes instanceof Set) return state.roadTypes.has(t);
    if (Array.isArray(state.roadTypes)) return state.roadTypes.indexOf(t) >= 0;
    return true;
  }

  // 🆕 v1.39.16 — Délègue à _isLevelAllowed unifié (cascade _visibleLevels OU activeLevel).
  // Sémantique road level = niveau de la route entière (champ road.level).
  function _isRoadLevelAllowed(road) {
    return _isLevelAllowed(road);
  }

  // Agrège session + embedded roads, exclut type === "itinerary" (rendu séparé
  // dans _itiLayer), applique filtres tags + niveau.
  function _collectVisibleRoads() {
    const out = [];
    const session = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    const emb     = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : [];
    function _push(road) {
      if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
      if (road.type === "itinerary") return; // rendu dans _itiLayer
      if (!_isRoadTypeAllowed(road) || !_isRoadLevelAllowed(road)) return;
      out.push(road);
    }
    session.forEach(_push);
    emb.forEach(_push);
    return out;
  }

  // Trouve l'itinéraire actif dans les roads session (= calcul Pathfinder en cours).
  // Il n'y en a qu'un seul à la fois par session (cf interfaceItineraire.js).
  function _collectActiveItinerary() {
    const session = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    return session.find(function(r) { return r && r.type === "itinerary" && Array.isArray(r.points) && r.points.length >= 2; }) || null;
  }

  // Projette les points d'une road (pixels plan) en latlngs OSM via _proj.
  // Skip les points invalides (defensive : si proj échoue ponctuellement, on
  // peut perdre 1-2 points mais la polyline reste continue).
  function _projectRoadPoints(road) {
    const latlngs = [];
    for (const p of road.points) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      const ll = _proj.planToLatLng(p.x, p.y);
      if (ll) latlngs.push(ll);
    }
    return latlngs;
  }

  // Rendu des roads (session + embedded, excluant iti).
  // Pattern idempotent : cleanup + re-render au prochain appel.
  // 🆕 v1.40.37 — Résolution couleur road avec cascade :
  //   1. road.color explicite (si data layer/session a un override)
  //   2. ROAD_STYLES_OSM[road.type] (couleur built-in native par type)
  //   3. LegendCustomization custom (type "cust-*" défini par user)
  //   4. fallback gris muet charte
  // Aligné comportementalement sur road.js > _resolveRoadStyle.
  function _resolveRoadColor(road) {
    if (road && typeof road.color === "string" && road.color) return road.color;
    // 🎨 v1.77.0 (bug KARMA « galerie principale reste verte en OSM ») — le
    // CANON d'abord : ktaResolveStyle applique l'override de couleur choisi
    // dans la légende (session > plan > défaut). La table locale passait
    // AVANT et court-circuitait l'override des types built-in. Défauts
    // identiques au canon → zéro changement de rendu sans override.
    if (road && road.type && typeof window.ktaResolveStyle === "function") {
      const s = window.ktaResolveStyle("traces", road.type, { flat: true });
      if (s && s.color) return s.color;
    }
    if (road && road.type && ROAD_STYLES_OSM[road.type]) return ROAD_STYLES_OSM[road.type];
    if (road && road.type && window.LegendCustomization
        && typeof window.LegendCustomization.findCustomEntry === "function") {
      try {
        const e = window.LegendCustomization.findCustomEntry(road.type);
        if (e && e.category === "traces" && e.lineColor) return e.lineColor;
      } catch(_) {}
    }
    return "#8892a4"; // fallback gris muet charte
  }

  function _renderRoads() {
    if (!_proj || !_osmMap) return;
    if (!_roadLayer) _roadLayer = L.layerGroup().addTo(_osmMap);
    _roadLayer.clearLayers();

    const roads = _collectVisibleRoads();
    let added = 0, skipped = 0;
    for (const road of roads) {
      const latlngs = _projectRoadPoints(road);
      if (latlngs.length < 2) { skipped++; continue; }
      const color = _resolveRoadColor(road);
      try {
        L.polyline(latlngs, {
          color: color,
          weight: 3,
          opacity: 0.8,
          interactive: false
        }).addTo(_roadLayer);
        added++;
      } catch(e) { console.warn("[OsmView] road polyline :", road.name || road.id, e); }
    }
    console.log("[OsmView] Roads : " + added + " polyline(s) rendue(s) (" + skipped + " skip <2 pts)");
  }

  // Rendu de l'itinéraire actif (1 polyline, style cyan dashed plus épais).
  // Si pas d'iti actif → cleanup éventuel + abort silencieux.
  function _renderItinerary() {
    if (!_proj || !_osmMap) return;
    if (!_itiLayer) _itiLayer = L.layerGroup().addTo(_osmMap);
    _itiLayer.clearLayers();

    const iti = _collectActiveItinerary();
    if (!iti) {
      // Pas d'iti actif → layer vide, c'est OK (cohérent avec l'absence d'iti
      // sur la map principale).
      return;
    }

    const latlngs = _projectRoadPoints(iti);
    if (latlngs.length < 2) {
      console.warn("[OsmView] Iti : <2 points projetables, render skip");
      return;
    }

    try {
      L.polyline(latlngs, {
        color:     ITI_COLOR,
        weight:    ITI_WEIGHT,
        opacity:   0.95,
        dashArray: ITI_DASHARRAY,
        interactive: false
      }).addTo(_itiLayer);
      console.log("[OsmView] Iti : 1 polyline rendue (" + latlngs.length + " pts)");
    } catch(e) { console.warn("[OsmView] iti polyline :", e); }
  }

  function _toggleRoadVisible(visible) {
    _roadVisible = !!visible;
    if (!_osmMap) return;
    if (_roadVisible) {
      if (!_roadLayer) _renderRoads();
      else if (!_osmMap.hasLayer(_roadLayer)) _osmMap.addLayer(_roadLayer);
    } else {
      if (_roadLayer && _osmMap.hasLayer(_roadLayer)) _osmMap.removeLayer(_roadLayer);
    }
  }

  function _toggleItiVisible(visible) {
    _itiVisible = !!visible;
    if (!_osmMap) return;
    if (_itiVisible) {
      if (!_itiLayer) _renderItinerary();
      else if (!_osmMap.hasLayer(_itiLayer)) _osmMap.addLayer(_itiLayer);
    } else {
      if (_itiLayer && _osmMap.hasLayer(_itiLayer)) _osmMap.removeLayer(_itiLayer);
    }
  }

  // =========================
  // 🆕 v1.39.16 — ZONES + STRUCTURES SUR OSM (Step 3b)
  // =========================

  function _isZoneTypeAllowed(z) {
    let state = null;
    try {
      state = (window.FilterPanel && typeof window.FilterPanel.getState === "function")
                ? window.FilterPanel.getState() : window._ktaRuntimeFilters || null;
    } catch(e) {}
    if (!state || !state.zoneTypes) return true;
    const t = z.type || "default";
    if (state.zoneTypes instanceof Set) return state.zoneTypes.has(t);
    if (Array.isArray(state.zoneTypes)) return state.zoneTypes.indexOf(t) >= 0;
    return true;
  }

  function _isStructTypeAllowed(s) {
    let state = null;
    try {
      state = (window.FilterPanel && typeof window.FilterPanel.getState === "function")
                ? window.FilterPanel.getState() : window._ktaRuntimeFilters || null;
    } catch(e) {}
    if (!state || !state.structTypes) return true;
    const t = s.type || "default";
    if (state.structTypes instanceof Set) return state.structTypes.has(t);
    if (Array.isArray(state.structTypes)) return state.structTypes.indexOf(t) >= 0;
    return true;
  }

  function _collectVisibleZones() {
    const out = [];
    const session = (typeof window.getZones === "function") ? (window.getZones() || []) : [];
    const emb     = (typeof window.getAllEmbeddedZones === "function") ? (window.getAllEmbeddedZones() || []) : [];
    function _push(z) {
      if (!z || !Array.isArray(z.points) || z.points.length < 3) return; // polygon ≥3 pts
      if (!_isZoneTypeAllowed(z) || !_isLevelAllowed(z)) return;
      out.push(z);
    }
    session.forEach(_push); emb.forEach(_push);
    return out;
  }

  function _collectVisibleStructures() {
    const out = [];
    const session = (typeof window.getStructures === "function") ? (window.getStructures() || []) : [];
    const emb     = (typeof window.getAllEmbeddedStructures === "function") ? (window.getAllEmbeddedStructures() || []) : [];
    function _push(s) {
      if (!s || !Array.isArray(s.points) || s.points.length < 2) return;
      if (!_isStructTypeAllowed(s) || !_isLevelAllowed(s)) return;
      out.push(s);
    }
    session.forEach(_push); emb.forEach(_push);
    return out;
  }

  // Projette un tableau de points {x,y} en latlngs OSM via _proj.
  // Mutualisé : utilisé par roads, zones, structures.
  function _projectPoints(points) {
    const out = [];
    for (const p of points) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      const ll = _proj.planToLatLng(p.x, p.y);
      if (ll) out.push(ll);
    }
    return out;
  }

  // 🆕 v1.40.37 — Résolution couleurs zone (stroke + fill) avec cascade
  // identique à _resolveRoadColor (explicit → built-in → custom legend → fallback).
  function _resolveZoneColors(z) {
    if (z && (z.color || z.fillColor)) {
      return {
        stroke: z.color     || z.fillColor || "#8892a4",
        fill:   z.fillColor || z.color     || "#8892a4"
      };
    }
    // 🎨 v1.77.0 — canon d'abord (override légende), cf _resolveRoadColor.
    if (z && z.type && typeof window.ktaResolveStyle === "function") {
      const s = window.ktaResolveStyle("zones", z.type, { flat: true });
      if (s) {
        return {
          stroke: s.color     || s.fillColor || "#8892a4",
          fill:   s.fillColor || s.color     || "#8892a4"
        };
      }
    }
    if (z && z.type && ZONE_STYLES_OSM[z.type]) {
      return ZONE_STYLES_OSM[z.type];
    }
    if (z && z.type && window.LegendCustomization
        && typeof window.LegendCustomization.findCustomEntry === "function") {
      try {
        const e = window.LegendCustomization.findCustomEntry(z.type);
        if (e && e.category === "zones") {
          return {
            stroke: e.lineColor || e.fillColor || "#8892a4",
            fill:   e.fillColor || e.lineColor || "#8892a4"
          };
        }
      } catch(_) {}
    }
    return { stroke: "#8892a4", fill: "#8892a4" };
  }

  function _renderZones() {
    if (!_proj || !_osmMap) return;
    if (!_zoneLayer) _zoneLayer = L.layerGroup().addTo(_osmMap);
    _zoneLayer.clearLayers();
    const zones = _collectVisibleZones();
    let added = 0, skipped = 0;
    for (const z of zones) {
      const latlngs = _projectPoints(z.points);
      if (latlngs.length < 3) { skipped++; continue; }
      const cols = _resolveZoneColors(z);
      try {
        L.polygon(latlngs, {
          color:       cols.stroke,
          fillColor:   cols.fill,
          fillOpacity: (typeof z.fillOpacity === "number") ? z.fillOpacity : 0.30,
          weight:      (typeof z.weight === "number") ? z.weight : 2,
          opacity:     0.9,
          interactive: false
        }).addTo(_zoneLayer);
        added++;
      } catch(e) { console.warn("[OsmView] zone polygon :", z.name || z.id, e); }
    }
    console.log("[OsmView] Zones : " + added + " polygone(s) rendu(s) (" + skipped + " skip <3 pts)");
  }

  function _renderStructures() {
    if (!_proj || !_osmMap) return;
    if (!_structLayer) _structLayer = L.layerGroup().addTo(_osmMap);
    _structLayer.clearLayers();
    const structs = _collectVisibleStructures();
    const isPolylineType = (typeof window.isStructurePolylineType === "function")
                            ? window.isStructurePolylineType
                            : function(t) { return /^front/.test(String(t || "")); }; // fallback regex
    let added = 0, skipped = 0;
    for (const s of structs) {
      const latlngs = _projectPoints(s.points);
      const polyline = isPolylineType(s.type);
      const minPts = polyline ? 2 : 3;
      if (latlngs.length < minPts) { skipped++; continue; }
      const style = Object.assign({}, STRUCTURE_STYLES_OSM[s.type] || STRUCTURE_STYLES_OSM["mur"]);
      // 🎨 v1.77.0 — couleurs du canon (override légende) par-dessus la
      // variante OSM locale (qui ne garde que weight/opacity allégés).
      if (s.type && typeof window.ktaResolveStyle === "function") {
        const cs = window.ktaResolveStyle("structures", s.type, { flat: true });
        if (cs) {
          if (cs.color) style.color = cs.color;
          if (cs.fillColor && !style.isPolyline) style.fillColor = cs.fillColor;
        }
      }
      try {
        if (polyline) {
          L.polyline(latlngs, {
            color:   style.color,
            weight:  style.weight,
            opacity: style.opacity || 1,
            interactive: false,
            // 🔍 v1.82.0 — même classe qu'en mode plan : la largeur du trait
            // est pilotée par la variable CSS `--kta-front-w`, recalculée au
            // zoom. Sans ça, un plan portant des milliers de fronts devient un
            // aplat dès qu'on s'éloigne.
          }).addTo(_structLayer);
        } else {
          L.polygon(latlngs, {
            color:       style.color,
            fillColor:   style.fillColor,
            fillOpacity: style.fillOpacity,
            weight:      style.weight,
            opacity:     1,
            interactive: false
          }).addTo(_structLayer);
        }
        added++;
      } catch(e) { console.warn("[OsmView] structure :", s.type, e); }
    }
    console.log("[OsmView] Structures : " + added + " rendue(s) (" + skipped + " skip <minPts)");
  }

  function _toggleZoneVisible(visible) {
    _zoneVisible = !!visible;
    if (!_osmMap) return;
    if (_zoneVisible) {
      if (!_zoneLayer) _renderZones();
      else if (!_osmMap.hasLayer(_zoneLayer)) _osmMap.addLayer(_zoneLayer);
    } else if (_zoneLayer && _osmMap.hasLayer(_zoneLayer)) {
      _osmMap.removeLayer(_zoneLayer);
    }
  }

  function _toggleStructVisible(visible) {
    _structVisible = !!visible;
    if (!_osmMap) return;
    if (_structVisible) {
      if (!_structLayer) _renderStructures();
      else if (!_osmMap.hasLayer(_structLayer)) _osmMap.addLayer(_structLayer);
      // Première largeur posée dès que les structures existent : sans cet
      // appel, elle n'arriverait qu'au premier geste de zoom.
      _majLargeurFrontsOsm();
    } else if (_structLayer && _osmMap.hasLayer(_structLayer)) {
      _osmMap.removeLayer(_structLayer);
    }
  }

  // =========================
  // 🆕 v1.40.34 (Synergie A v2) — LAYER MODE SECOURS
  // =========================
  // Rend les zones d'intervention par équipe + itinéraires suggérés par
  // équipe + markers entrée/sortie sur la map OSM. Couleurs distinctives
  // via SecoursMode.PALETTE (cohérent avec l'overlay map principale).
  //
  // Respect du filtre M-LVL : chaque point (x, y, level) est vérifié via
  // _isLevelAllowed avant rendu. Pour les polygones zones et polylines iti,
  // on filtre point par point (= comportement cohérent avec les autres
  // helpers _renderRoads / _renderZones).
  //
  // No-op gracieux si :
  // - window.SecoursMode absent (module non chargé)
  // - getCurrentScenarioId retourne null (pas de scénario courant)
  // - Scénario vide (pas de groupes / pas d'itinéraires / pas de zones)
  function _renderSecoursLayer() {
    if (!_proj || !_osmMap) return;
    if (!_secoursLayer) _secoursLayer = L.layerGroup().addTo(_osmMap);
    _secoursLayer.clearLayers();

    const SM = window.SecoursMode;
    if (!SM || typeof SM.getCurrentScenarioId !== "function") return;
    const scenarioId = SM.getCurrentScenarioId();
    if (!scenarioId) return;
    const scenario = (typeof SM.get === "function") ? SM.get(scenarioId) : null;
    if (!scenario || !Array.isArray(scenario.groupes)) return;

    // PALETTE exposée par SecoursMode = tableau d'OBJETS [{hex, nom}, ...]
    // (cf secoursMode.js ligne 132). 🐛 v1.40.36 — Bug v1.40.34 : on passait
    // l'objet entier à Leaflet → "[object Object]" → couleurs cassées sur
    // toutes les équipes sauf la première (artefact). Fix : extraction
    // explicite du champ .hex avec fallback hex string si l'objet est mal
    // formé ou si on retombe sur un palette de fallback simple (strings).
    const SECOURS_FALLBACK_HEX = ["#ff4444", "#4488ff", "#44cc44", "#ffcc00", "#ff4ecb", "#00d4ff", "#ff8c00", "#9d44ff", "#8b5a2b", "#404040"];
    const palette = (Array.isArray(SM.PALETTE) && SM.PALETTE.length > 0) ? SM.PALETTE : SECOURS_FALLBACK_HEX;
    function _resolveEquipeColor(couleurIdx) {
      const entry = palette[(couleurIdx || 0) % palette.length];
      if (!entry) return SECOURS_FALLBACK_HEX[0];
      // Accepte 2 formats : { hex: "#..." } (PALETTE officielle) OU "#..."
      // directement (fallback array de strings ou patch futur éventuel).
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && typeof entry.hex === "string") return entry.hex;
      return SECOURS_FALLBACK_HEX[0];
    }

    let nZones = 0, nIti = 0, nMarkers = 0;
    for (const g of scenario.groupes) {
      if (!g || typeof g !== "object") continue;
      const color = _resolveEquipeColor(g.couleurIdx);
      const nomEquipe = g.nom || window.I18n.t("osm.secours.noTeamName");

      // Zone d'intervention polygone (si zoneType=polygon)
      if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
        const latlngs = g.zonePolygon
          .filter(function(p) { return p && _isLevelAllowed(p); })
          .map(function(p) { return _proj.planToLatLng(p.x, p.y); })
          .filter(Boolean);
        if (latlngs.length >= 3) {
          try {
            L.polygon(latlngs, {
              color:       color,
              weight:      2,
              opacity:     SECOURS_ZONE_STROKE_OPAC,
              fillColor:   color,
              fillOpacity: SECOURS_ZONE_FILL_OPAC,
              interactive: true,
              className:   "kta-osm-secours-zone"
            }).bindTooltip(window.I18n.t("osm.secours.tooltip.zone", { nomEquipe: _escapeHtml(nomEquipe) }),
              { permanent: false, direction: "top" })
              .addTo(_secoursLayer);
            nZones++;
          } catch(e) { console.warn("[OsmView] Secours zone :", nomEquipe, e); }
        }
      }

      // Itinéraire suggéré par équipe (polyline dashed, couleur équipe)
      if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
        // 🩸 29/09/2026 (relecture Secours, R5) — l'itinéraire porte désormais le VRAI
        // niveau de chaque point. Filtrer puis relier les points restants tirait un
        // trait droit à travers la surface entre la descente au −1 et la remontée.
        // On découpe en TRONÇONS continus sur les niveaux visibles (multi-polyligne).
        const troncons = [];
        let courant = [];
        g.itineraireSuggere.forEach(function(p) {
          const ll = (p && _isLevelAllowed(p)) ? _proj.planToLatLng(p.x, p.y) : null;
          if (ll) { courant.push(ll); return; }
          if (courant.length >= 2) troncons.push(courant);
          courant = [];
        });
        if (courant.length >= 2) troncons.push(courant);
        const latlngs = troncons.length === 1 ? troncons[0] : troncons;
        if (troncons.length > 0) {
          try {
            const distFmt = (typeof g.distanceM === "number" && window.formatDistance)
              ? window.formatDistance(g.distanceM, 1)
              : "";
            L.polyline(latlngs, {
              color:       color,
              weight:      SECOURS_ITI_WEIGHT,
              opacity:     0.95,
              dashArray:   SECOURS_ITI_DASHARRAY,
              interactive: true,
              className:   "kta-osm-secours-iti"
            }).bindTooltip(window.I18n.t("osm.secours.tooltip.iti", { nomEquipe: _escapeHtml(nomEquipe) }) + (distFmt ? window.I18n.t("osm.secours.tooltip.itiDist", { dist: distFmt }) : ""),
              { permanent: false, direction: "top" })
              .addTo(_secoursLayer);
            nIti++;
          } catch(e) { console.warn("[OsmView] Secours iti :", nomEquipe, e); }
        }
      }

      // Marker entrée (●) + sortie (▲) si présents et level allowed
      if (g.entree && _isLevelAllowed(g.entree)) {
        const ll = _proj.planToLatLng(g.entree.x, g.entree.y);
        if (ll) {
          try {
            L.circleMarker(ll, {
              radius: 7, color: "#fff", weight: 2,
              fillColor: color, fillOpacity: 0.95, interactive: true
            }).bindTooltip(window.I18n.t("osm.secours.tooltip.entree", { nomEquipe: _escapeHtml(nomEquipe) }),
              { permanent: false, direction: "top" })
              .addTo(_secoursLayer);
            nMarkers++;
          } catch(e) {}
        }
      }
      if (g.sortie && _isLevelAllowed(g.sortie)) {
        const ll = _proj.planToLatLng(g.sortie.x, g.sortie.y);
        if (ll) {
          try {
            // Triangle pointant vers le haut = sortie (analogie "sortir vers la surface")
            L.marker(ll, {
              icon: L.divIcon({
                className: "kta-osm-secours-sortie-icon",
                html: '<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid ' + color + ';filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff);"></div>',
                iconSize:   [16, 14],
                iconAnchor: [8, 14]
              }),
              interactive: true
            }).bindTooltip(window.I18n.t("osm.secours.tooltip.sortie", { nomEquipe: _escapeHtml(nomEquipe) }),
              { permanent: false, direction: "top" })
              .addTo(_secoursLayer);
            nMarkers++;
          } catch(e) {}
        }
      }
    }
    console.log("[OsmView] Secours layer : " + nZones + " zone(s), " + nIti + " iti, " + nMarkers + " marker(s) pour scénario " + scenarioId);
  }

  function _toggleSecoursVisible(visible) {
    _secoursVisible = !!visible;
    if (!_osmMap) return;
    if (_secoursVisible) {
      if (!_secoursLayer) _renderSecoursLayer();
      else if (!_osmMap.hasLayer(_secoursLayer)) _osmMap.addLayer(_secoursLayer);
    } else if (_secoursLayer && _osmMap.hasLayer(_secoursLayer)) {
      _osmMap.removeLayer(_secoursLayer);
    }
  }

  // Détecte si un scénario Mode Secours est courant (= déterminait si on
  // doit afficher le toggle et le rendu auto au open).
  function _hasActiveSecoursScenario() {
    try {
      return !!(window.SecoursMode
        && typeof window.SecoursMode.getCurrentScenarioId === "function"
        && window.SecoursMode.getCurrentScenarioId());
    } catch(e) { return false; }
  }

  // =========================
  // 🆕 v1.39.16 — MULTI-LVL OSM
  // =========================

  // Init _visibleLevels au boot de la modale :
  // - Si pas M-LVL → null (mode mono, helpers ignorent)
  // - Si M-LVL ON et activeLevel défini → Set initialisé à { activeLevel }
  //   (= comportement strictement équivalent à v1.39.12 par défaut)
  // - User peut ensuite cocher d'autres niveaux via les chips
  function _initVisibleLevels() {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.multiLevel) { _visibleLevels = null; return; }
    // 🏗️ v1.82.1 — LA MODALE SUIT CE QUE LA CARTE MONTRE.
    // Elle s'ouvrait sur le SEUL niveau actif, quand la carte du dessous en
    // affichait plusieurs : passer en Vue OSM faisait donc disparaître le
    // reste du relevé, sans que ce soit demandé. On reprend `visibleLevels`,
    // qui porte déjà le choix de l'utilisateur (et l'option « afficher tous
    // les niveaux au lancement »). Repli sur le niveau actif si absent.
    _visibleLevels = new Set();
    const vis = Array.isArray(cfg.visibleLevels) ? cfg.visibleLevels : null;
    if (vis && vis.length) {
      vis.forEach(function (n) { if (Number.isFinite(n)) _visibleLevels.add(n); });
    }
    if (_visibleLevels.size === 0 && Number.isFinite(cfg.activeLevel)) {
      _visibleLevels.add(cfg.activeLevel);
    }
  }

  // Toggle d'un niveau dans _visibleLevels + re-render des layers filtrés.
  // Si le user décoche tout, on garde _visibleLevels comme un Set vide (= aucun
  // niveau visible, layers vides) — choix explicite, plus prévisible qu'un
  // fallback automatique sur l'activeLevel.
  function _toggleLevel(level) {
    if (!_visibleLevels) _visibleLevels = new Set();
    if (_visibleLevels.has(level)) _visibleLevels.delete(level);
    else _visibleLevels.add(level);
    _refreshLevelFilteredLayers();
  }

  // Re-render des 5 layers level-aware. Tracker exclu (sa timeline garde son
  // historique full quel que soit le niveau actif).
  // 🆕 v1.40.34 — Layer Secours aussi level-aware (zones + iti par équipe).
  function _refreshLevelFilteredLayers() {
    if (_poiVisible)    _renderPoi();
    if (_roadVisible)   _renderRoads();
    if (_itiVisible)    _renderItinerary();
    if (_zoneVisible)   _renderZones();
    if (_structVisible) _renderStructures();
    // Un re-rendu recrée les layers : la largeur du gabarit revient, il
    // faut la reposer. Sinon elle ne serait juste qu'au prochain zoom.
    _majLargeurFrontsOsm();
    if (_secoursVisible && _hasActiveSecoursScenario()) _renderSecoursLayer();
  }

  // =========================
  // 🆕 v1.43.14 — TOGGLE "Réduire les contrôles" (carte plein écran)
  // =========================
  // Sur mobile, le bandeau de la modale Vue OSM prend ~60% de l'écran
  // (opacité + actions + 8 toggles + niveaux M-LVL + tags). Le toggle
  // permet de masquer tout ça pour avoir la carte en pleine page. État
  // persisté en localStorage (clé partagée entre PC et mobile).
  const LS_CONTROLS_COLLAPSED_KEY = "myktamap_osm_controls_collapsed";

  function _getControlsCollapsed() {
    try { return localStorage.getItem(LS_CONTROLS_COLLAPSED_KEY) === "1"; }
    catch(e) { return false; }
  }

  function _applyControlsCollapsed(collapsed) {
    try { localStorage.setItem(LS_CONTROLS_COLLAPSED_KEY, collapsed ? "1" : "0"); } catch(e) {}
    const wrapper = document.getElementById("kta-osm-controls-wrapper");
    const btn     = document.getElementById("kta-osm-toggle-controls");
    if (wrapper) wrapper.style.display = collapsed ? "none" : "";
    if (btn) {
      btn.textContent = collapsed ? "🔽" : "🔼";
      btn.title = collapsed
        ? window.I18n.t("osm.controls.show")
        : window.I18n.t("osm.controls.collapse");
      btn.setAttribute("aria-label", btn.title);
    }
    // Leaflet doit recalculer la taille du conteneur après le resize du DOM,
    // sinon les tuiles se chargent mal et les coords pixel sont fausses.
    if (_osmMap && typeof _osmMap.invalidateSize === "function") {
      setTimeout(function() { try { _osmMap.invalidateSize(); } catch(e) {} }, 80);
    }
  }

  // =========================
  // BUILD MODAL UI
  // =========================
  function _buildModal() {
    const overlay = document.createElement("div");
    overlay.id = "kta-osm-view-overlay";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      // 🆕 v1.40.22 — max-width 1200 → 1800 (était trop petit en WQHD 2560px / 4K)
      '<div class="kta-readme-modal-boite" style="max-width:1800px; width:96vw; height:92vh; display:flex; flex-direction:column;">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + window.I18n.t("osm.modal.title") + '</span>' +
          '<div style="display:flex; gap:6px; align-items:center;">' +
            // 🆕 v1.43.14 — Toggle "Réduire contrôles" (carte plein écran).
            // Persisté en localStorage. Utile surtout sur mobile (bandeau
            // prend ~60% de la hauteur sinon → carte minuscule). Sur PC,
            // dispo aussi pour qui veut voir la carte en grand.
            '<button class="kta-panneau-close" type="button" id="kta-osm-toggle-controls" aria-label="' + _escapeHtml(window.I18n.t("osm.controls.collapse")) + '" title="' + _escapeHtml(window.I18n.t("osm.controls.collapse")) + '" style="font-size:14px; padding:4px 10px;">🔼</button>' +
            '<button class="kta-panneau-close" type="button" id="kta-osm-close" aria-label="' + _escapeHtml(window.I18n.t("osm.modal.close")) + '">&times;</button>' +
          '</div>' +
        '</div>' +
        // 🆕 v1.43.14 — Wrapper collapsible pour les 3 bandeaux de contrôles
        // (opacité+actions+toggles, niveaux M-LVL, tags). Le bouton 🔼/🔽
        // toggle son display:none. La div #kta-osm-map en dessous prend
        // automatiquement toute la place via son flex:1 1 auto.
        '<div id="kta-osm-controls-wrapper">' +
        // 🐛 v1.40.39 (KARMA "les filtres sortent de la fenêtre on les voit
        // apparaître un peu en horizontal") : ajout `flex-wrap: wrap` +
        // `row-gap` pour que le bandeau toggles wrap proprement quand il y
        // a beaucoup d'éléments (opacité + ~10 toggles + 🚨 Secours conditionnel).
        // Sans wrap, débordement horizontal masqué hors viewport modale.
        '<div style="display:flex; flex-wrap:wrap; gap:10px; row-gap:6px; align-items:center; padding:8px 14px; background:rgba(140,180,255,0.06); border-bottom:1px solid rgba(140,180,255,0.18); font-size:12.5px; color:#c8d0e0;">' +
          '<span>' + window.I18n.t("osm.opacity.label") + '</span>' +
          '<input type="range" id="kta-osm-opacity" min="0" max="100" value="' + Math.round(_opacity * 100) + '" style="flex:1 1 auto; max-width:240px;">' +
          '<span id="kta-osm-opacity-val" style="width:38px; text-align:right;">' + Math.round(_opacity * 100) + '%</span>' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-center" style="font-size:12px; padding:5px 10px;">' + window.I18n.t("osm.btn.centerPlan") + '</button>' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-center-tracker" style="font-size:12px; padding:5px 10px;" title="' + _escapeHtml(window.I18n.t("osm.btn.centerTracker.title")) + '">' + window.I18n.t("osm.btn.centerTracker") + '</button>' +
          // 🆕 v1.40.18 — Bouton "Ma position GPS" (1 fix ponctuel, 0 stockage, 0 réseau)
          // Disabled visuel si incognito au moment du build
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-mygps" style="font-size:12px; padding:5px 10px;"' +
            (_isIncognitoOn() ? ' disabled' : '') +
            ' title="' +
              _escapeHtml(_isIncognitoOn() ? window.I18n.t("osm.btn.mygps.title.incognito")
                : window.I18n.t("osm.btn.mygps.title.default")) +
            '">' + window.I18n.t("osm.btn.mygps") + '</button>' +
          // 📏 v1.85.0 — la mesure, jusqu'ici reservee a la Vue OSM du HOME.
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-mesure" ' +
            'style="font-size:12px; padding:5px 10px;" title="' +
            _escapeHtml(window.I18n.t("osm_mes.btnTitle")) + '">📏</button>' +
          // 📍 v1.85.0 — relever les coordonnees GPS DE SURFACE d'un point du
          // releve. Trivial ici et penible en mode plan : la carte EST
          // geographique, `e.latlng` est deja la reponse.
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-coords" ' +
            'style="font-size:12px; padding:5px 10px;" title="' +
            _escapeHtml(window.I18n.t("osm.coords.btnTitle")) + '">🎯</button>' +
          // 🆕 v1.43.4 — Bouton "Cacher pour offline" placé juste après 📍 Moi
          // (KARMA : groupé avec les actions, AVANT les toggles d'affichage).
          // Télécharge les tuiles visibles + zoom ±1 dans IDB pour consultation
          // hors-réseau. Cache GLOBAL partagé entre Vue OSM Plan / Home / Mode
          // Secours (store IDB myktamap_osm_tiles, indexé par z/x/y).
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-cache-btn" style="font-size:12px; padding:5px 10px;" title="' + _escapeHtml(window.I18n.t("osm.cache.btn.title")) + '">' + window.I18n.t("osm.cache.btn") + '</button>' +
          '<span id="kta-osm-cache-stats" style="color:#8892a4; font-size:11.5px;" title="' + _escapeHtml(window.I18n.t("osm.cache.stats.title")) + '">' + window.I18n.t("osm.cache.stats.loading") + '</span>' +
          // 🆕 v1.40.12 — Toggle "🖼️ Plan" (masquer/afficher tuiles plan)
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;" title="' + _escapeHtml(window.I18n.t("osm.toggle.plan.title")) + '">' +
            '<input type="checkbox" id="kta-osm-plan-toggle" ' + (_planTilesVisible ? "checked" : "") + ' style="margin:0;">' +
            window.I18n.t("osm.toggle.plan") +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-poi-toggle" ' + (_poiVisible ? "checked" : "") + ' style="margin:0;">' +
            window.I18n.t("osm.toggle.poi") +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-tracker-toggle" ' + (_trackerVisible ? "checked" : "") + ' style="margin:0;">' +
            window.I18n.t("osm.toggle.tracker") +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-road-toggle" ' + (_roadVisible ? "checked" : "") + ' style="margin:0;">' +
            window.I18n.t("osm.toggle.roads") +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-iti-toggle" ' + (_itiVisible ? "checked" : "") + ' style="margin:0;">' +
            window.I18n.t("osm.toggle.iti") +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-zone-toggle" ' + (_zoneVisible ? "checked" : "") + ' style="margin:0;">' +
            window.I18n.t("osm.toggle.zones") +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-struct-toggle" ' + (_structVisible ? "checked" : "") + ' style="margin:0;">' +
            window.I18n.t("osm.toggle.struct") +
          '</label>' +
          // 🆕 v1.40.34 (Synergie A v2) — Toggle Mode Secours, visible UNIQUEMENT
          // si un scénario Mode Secours est actif (sinon masqué pour ne pas
          // polluer le bandeau). Fond rouge léger pour signaler le contexte.
          (_hasActiveSecoursScenario()
            ? '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none; padding:2px 6px; background:rgba(255,80,80,0.15); border-radius:4px;" title="' + _escapeHtml(window.I18n.t("osm.toggle.secours.title")) + '">' +
                '<input type="checkbox" id="kta-osm-secours-toggle" ' + (_secoursVisible ? "checked" : "") + ' style="margin:0;">' +
                window.I18n.t("osm.toggle.secours") +
              '</label>'
            : '') +
          '<span style="flex:1 1 auto;"></span>' +
        '</div>' +
        // 🆕 v1.39.16 — Ligne 2 du bandeau : chips multi-LVL (visible
        // uniquement si plan multi-niveau actif, masqué autrement)
        '<div id="kta-osm-levels-bar" style="display:none; gap:8px; align-items:center; padding:6px 14px; background:rgba(244,197,66,0.04); border-bottom:1px solid rgba(244,197,66,0.18); font-size:12px; color:#c8d0e0; flex-wrap:wrap;">' +
          '<span>' + window.I18n.t("osm.levels.label") + '</span>' +
          '<span id="kta-osm-levels-chips" style="display:inline-flex; gap:6px; flex-wrap:wrap;"></span>' +
          '<span style="color:#8892a4; font-size:11px; margin-left:auto;">' + window.I18n.t("osm.levels.hint") + '</span>' +
        '</div>' +
        // 🆕 v1.40.17 — Ligne 3 du bandeau : chips filtre tag (Filter par tag local OSM)
        '<div id="kta-osm-tags-bar" style="display:none; gap:8px; align-items:center; padding:6px 14px; background:rgba(140,180,255,0.04); border-bottom:1px solid rgba(140,180,255,0.16); font-size:12px; color:#c8d0e0; flex-wrap:wrap;">' +
          '<span title="' + _escapeHtml(window.I18n.t("osm.tags.label.title")) + '">' + window.I18n.t("osm.tags.label") + '</span>' +
          '<span id="kta-osm-tags-chips" style="display:inline-flex; gap:5px; flex-wrap:wrap;"></span>' +
          '<span style="color:#8892a4; font-size:11px; margin-left:auto;">' + window.I18n.t("osm.tags.hint") + '</span>' +
        '</div>' +
        // 🆕 v1.43.14 — Fin du wrapper collapsible (ouvert juste après le header)
        '</div>' +
        '<div id="kta-osm-map" style="flex:1 1 auto; background:#0a0d18;"></div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    overlay.querySelector("#kta-osm-close").addEventListener("click", close);
    // 🆕 v1.43.14 — Toggle "Réduire les contrôles" (= carte plein écran).
    // Sur mobile, les 3 bandeaux de contrôles prennent ~60% de la hauteur ;
    // sans toggle, la carte est riquiqui. État persisté en localStorage
    // pour que l'user n'ait pas à re-cacher à chaque ouverture.
    const toggleCtrlBtn = overlay.querySelector("#kta-osm-toggle-controls");
    if (toggleCtrlBtn) {
      toggleCtrlBtn.addEventListener("click", function() {
        _applyControlsCollapsed(!_getControlsCollapsed());
      });
      // Apply initial state immédiatement (avant que la carte ne soit montée
      // → pas de glitch visuel + Leaflet calculera la bonne taille au mount)
      _applyControlsCollapsed(_getControlsCollapsed());
    }
    overlay.querySelector("#kta-osm-opacity").addEventListener("input", function(e) {
      _opacity = (parseInt(e.target.value, 10) || 0) / 100;
      document.getElementById("kta-osm-opacity-val").textContent = Math.round(_opacity * 100) + "%";
      _applyOpacity();
    });
    overlay.querySelector("#kta-osm-center").addEventListener("click", _centerOnPlan);
    // 🆕 v1.43.0 — Bouton "Cacher pour offline" + refresh des stats
    const cacheBtn = overlay.querySelector("#kta-osm-cache-btn");
    if (cacheBtn) {
      cacheBtn.addEventListener("click", function() { _runCacheOsmTiles(cacheBtn); });
    }
    _refreshOsmCacheStats();
    // 🆕 v1.39.12 — Toggle POI
    // 🆕 v1.40.12 — Toggle "🖼️ Plan" : masquer/afficher les tuiles V2
    const planCb = overlay.querySelector("#kta-osm-plan-toggle");
    if (planCb) {
      planCb.addEventListener("change", function(e) {
        _togglePlanTilesVisible(!!e.target.checked);
      });
    }
    const poiCb = overlay.querySelector("#kta-osm-poi-toggle");
    if (poiCb) {
      poiCb.addEventListener("change", function(e) {
        _togglePoiVisible(!!e.target.checked);
      });
    }
    // 🆕 v1.39.13 — Toggle Tracker + bouton recentrage
    const trackerCb = overlay.querySelector("#kta-osm-tracker-toggle");
    if (trackerCb) {
      trackerCb.addEventListener("change", function(e) {
        _toggleTrackerVisible(!!e.target.checked);
      });
    }
    const trackerBtn = overlay.querySelector("#kta-osm-center-tracker");
    if (trackerBtn) {
      trackerBtn.addEventListener("click", _centerOnTracker);
    }
    // 🆕 v1.40.18 — Bouton GPS ponctuel
    const mygpsBtn = overlay.querySelector("#kta-osm-mygps");
    if (mygpsBtn) {
      mygpsBtn.addEventListener("click", _showMyGpsPositionOsm);
    }
    // 📏 + 📍 v1.85.0 — mesure et releve de coordonnees. Les deux modules
    // basculent d'eux-memes au second clic (`activer` appelle `desactiver`
    // s'il est deja actif), donc rien a garder ici.
    const mesureBtn = overlay.querySelector("#kta-osm-mesure");
    if (mesureBtn) {
      mesureBtn.addEventListener("click", function () {
        if (window.OsmMesure) window.OsmMesure.activer(_osmMap);
      });
    }
    const coordsBtn = overlay.querySelector("#kta-osm-coords");
    if (coordsBtn) {
      coordsBtn.addEventListener("click", function () {
        if (window.OsmCoords) window.OsmCoords.activer(_osmMap);
      });
    }
    // 🆕 v1.39.14 — Toggles Roads + Iti
    const roadCb = overlay.querySelector("#kta-osm-road-toggle");
    if (roadCb) {
      roadCb.addEventListener("change", function(e) {
        _toggleRoadVisible(!!e.target.checked);
      });
    }
    const itiCb = overlay.querySelector("#kta-osm-iti-toggle");
    if (itiCb) {
      itiCb.addEventListener("change", function(e) {
        _toggleItiVisible(!!e.target.checked);
      });
    }
    // 🆕 v1.39.16 — Toggles Zones + Structures
    const zoneCb = overlay.querySelector("#kta-osm-zone-toggle");
    if (zoneCb) {
      zoneCb.addEventListener("change", function(e) {
        _toggleZoneVisible(!!e.target.checked);
      });
    }
    const structCb = overlay.querySelector("#kta-osm-struct-toggle");
    if (structCb) {
      structCb.addEventListener("change", function(e) {
        _toggleStructVisible(!!e.target.checked);
      });
    }
    // 🆕 v1.40.34 (Synergie A v2) — Toggle Mode Secours (visible si scénario actif)
    const secoursCb = overlay.querySelector("#kta-osm-secours-toggle");
    if (secoursCb) {
      secoursCb.addEventListener("change", function(e) {
        _toggleSecoursVisible(!!e.target.checked);
      });
    }
    return overlay;
  }

  // 🆕 v1.39.16 — Construit la barre de chips multi-LVL si plan multi-niveau.
  // Appelé depuis _renderMap après _initVisibleLevels. Chaque chip a un
  // état checked/unchecked synchro avec _visibleLevels.
  function _renderLevelsBar() {
    const bar  = document.getElementById("kta-osm-levels-bar");
    const cont = document.getElementById("kta-osm-levels-chips");
    if (!bar || !cont) return;
    const cfg = window.APP_CONFIG || {};
    if (!cfg.multiLevel) { bar.style.display = "none"; return; }
    const levels = Array.isArray(cfg.availableLevels) ? cfg.availableLevels.slice() : [];
    if (levels.length === 0) {
      // Fallback : si availableLevels pas exposé, on prend {0, activeLevel}.
      // Mieux que rien — l'user verra au moins 1-2 chips.
      const fallback = new Set([0]);
      if (Number.isFinite(cfg.activeLevel)) fallback.add(cfg.activeLevel);
      fallback.forEach(function(l) { levels.push(l); });
    }
    levels.sort(function(a, b) { return a - b; });

    bar.style.display = "flex";
    cont.innerHTML = "";
    for (const lvl of levels) {
      const checked = !!(_visibleLevels && _visibleLevels.has(lvl));
      const chip = document.createElement("button");
      chip.type = "button";
      chip.dataset.level = String(lvl);
      chip.textContent = window.I18n.t("osm.levels.chip", { level: lvl });
      chip.style.cssText =
        "padding:3px 10px; border-radius:12px; cursor:pointer; user-select:none;" +
        " font-size:11.5px; font-weight:600; border:1px solid " +
        (checked ? "#f4c542" : "rgba(255,255,255,0.18)") + ";" +
        " background:" + (checked ? "#f4c542" : "rgba(255,255,255,0.04)") + ";" +
        " color:" + (checked ? "#1a1f2e" : "#c8d0e0") + ";" +
        " transition:background 0.15s, border-color 0.15s, color 0.15s;";
      chip.addEventListener("click", function() {
        const l = parseInt(chip.dataset.level, 10);
        _toggleLevel(l);
        _renderLevelsBar(); // re-render chips pour refléter le nouvel état
      });
      cont.appendChild(chip);
    }
  }

  function _applyOpacity() {
    if (!_planLayer) return;
    _planLayer.eachLayer(function(l) {
      try {
        if (l.setOpacity) l.setOpacity(_opacity);
        else if (l._image) l._image.style.opacity = String(_opacity);
      } catch(e) {}
    });
  }

  // ============================================================
  // 🆕 v1.43.0 — OSM TILES CACHE OFFLINE
  // ============================================================
  // Helpers pour le bouton « 💾 Cacher offline » du bandeau de la modale.
  // Délégué au module js/osmTilesCache.js (API OsmTilesCache). Le cache
  // IDB est GLOBAL (partagé entre Vue OSM Plan / Home / Mode Secours) :
  // les tuiles téléchargées ici bénéficient à tous les contextes OSM.

  async function _refreshOsmCacheStats() {
    const span = document.getElementById("kta-osm-cache-stats");
    if (!span || !window.OsmTilesCache) return;
    try {
      const s = await window.OsmTilesCache.getStats();
      if (s.count > 0) {
        span.textContent = window.I18n.t("osm.cache.stats.present", {
          count: s.count,
          size: window.OsmTilesCache.formatBytes(s.sizeBytes)
        });
        span.style.color = "#a6d785"; // vert léger = cache présent
      } else {
        span.textContent = window.I18n.t("osm.cache.stats.empty");
        span.style.color = "#8892a4";
      }
    } catch(e) {
      span.textContent = window.I18n.t("osm.cache.stats.error");
    }
  }

  async function _runCacheOsmTiles(btn) {
    if (!window.OsmTilesCache || !_osmMap) return;
    if (!btn) btn = document.getElementById("kta-osm-cache-btn");
    const oldLabel = btn ? btn.textContent : "";
    // Garde : pas dispo hors-ligne (= besoin du réseau pour télécharger)
    if (!_isOnline()) {
      _toast(window.I18n.t("osm.cache.run.noNetwork"), 4000);
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⏳ 0/?";
    }
    try {
      const result = await window.OsmTilesCache.cacheVisibleTiles(_osmMap, {
        onProgress: function(done, total) {
          if (btn) btn.textContent = "⏳ " + done + "/" + total;
        }
      });
      let msg = window.I18n.t("osm.cache.run.done", { cached: result.cached });
      if (result.skipped) msg += window.I18n.t("osm.cache.run.skipped", { skipped: result.skipped });
      if (result.failed)  msg += window.I18n.t("osm.cache.run.failed", { failed: result.failed });
      if (result.capped)  msg += window.I18n.t("osm.cache.run.capped");
      _toast(msg, 5000);
    } catch(e) {
      _toast(window.I18n.t("osm.cache.run.error", { err: (e.message || e) }), 4000);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldLabel || window.I18n.t("osm.cache.btn");
      }
      await _refreshOsmCacheStats();
      // Refresh aussi la flag offline (cache permet maintenant ouverture sans réseau)
      await _recheckCachedForCurrentPlan();
    }
  }

  // Toast minimaliste (modale Vue OSM peut être au-dessus des toasts globaux ;
  // on injecte une petite barre dans l'overlay osm-modal directement).
  function _toast(msg, durationMs) {
    durationMs = durationMs || 3500;
    // 🔕 même réglage que le goulot central : un toast contextuel est une info
    if (window.OOMGuard && typeof window.OOMGuard.toastAutorise === "function" && !window.OOMGuard.toastAutorise("info")) return;
    // 🐛 v1.77.0 (audit code mort → bug latent n°2) — ce toast visait
    // "kta-osm-modal", un id qui n'a JAMAIS existé (le vrai overlay est
    // kta-osm-view-overlay) : le toast contextuel de la modale OSM n'a
    // jamais fonctionné, repli silencieux sur showToast. Ressuscité.
    const overlay = document.getElementById("kta-osm-view-overlay");
    if (!overlay) {
      try { if (window.showToast) window.showToast(msg); } catch(e) {}
      return;
    }
    let bar = overlay.querySelector("#kta-osm-toast");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "kta-osm-toast";
      bar.style.cssText =
        "position:absolute; left:50%; bottom:24px; transform:translateX(-50%);" +
        "background:rgba(20,25,40,0.95); color:#e8eaf0; padding:10px 16px;" +
        "border-radius:8px; font-size:13px; box-shadow:0 4px 14px rgba(0,0,0,0.4);" +
        "border:1px solid rgba(140,180,255,0.25); z-index:99999; max-width:90%;" +
        "text-align:center; line-height:1.4;";
      overlay.appendChild(bar);
    }
    bar.textContent = msg;
    bar.style.display = "block";
    clearTimeout(bar._t);
    bar._t = setTimeout(function() { if (bar) bar.style.display = "none"; }, durationMs);
  }

  function _centerOnPlan() {
    // 🆕 v1.39.11 — Utilise _planBbox (4 coins du plan, immuable) au lieu de
    // _planLayer.getBounds() — _planLayer peut être partiellement vide
    // à cause du viewport culling.
    if (!_osmMap || !_planBbox) return;
    try {
      if (_planBbox.isValid && _planBbox.isValid()) {
        _osmMap.fitBounds(_planBbox, { padding: [40, 40] });
      }
    } catch(e) { console.warn("[OsmView] center :", e); }
  }

  // 🆕 v1.40.12 — Toggle visibilité des tuiles plan (image principale).
  // Add/removeLayer sur _planLayer qui contient TOUS les imageOverlay rotated
  // créés par _renderLevel. État conservé dans _planTilesVisible.
  function _togglePlanTilesVisible(visible) {
    _planTilesVisible = !!visible;
    if (!_osmMap || !_planLayer) return;
    if (_planTilesVisible) {
      if (!_osmMap.hasLayer(_planLayer)) _osmMap.addLayer(_planLayer);
    } else {
      if (_osmMap.hasLayer(_planLayer)) _osmMap.removeLayer(_planLayer);
    }
  }

  // =========================
  // 🆕 v1.39.11 — NIVEAU ADAPTATIF + VIEWPORT CULLING
  // =========================

  // Calcule la bbox latlng des 4 coins du plan via la projection georef.
  // Utilisé pour fitBounds initial + calcul _baselineOsmZoom.
  function _computePlanBbox(proj, planW, planH) {
    const corners = [
      proj.planToLatLng(0,     0),
      proj.planToLatLng(planW, 0),
      proj.planToLatLng(0,     planH),
      proj.planToLatLng(planW, planH)
    ].filter(Boolean);
    if (corners.length < 4) return null;
    return L.latLngBounds(corners);
  }

  // Heuristique de baseline : niveau le plus zoomé tel que le nb total de tuiles
  // tient sous MAX_TILES_BASELINE. Garantit un boot safe même sur petits plans
  // (qui peuvent tenir en quelques tuiles à z=0 natif = qualité max).
  function _choisirNiveauBaseline(tiling, planW, planH) {
    for (let z = tiling.maxNativeZoom; z >= tiling.minNativeZoom; z--) {
      const scale = Math.pow(2, -z);
      const cols = Math.ceil(Math.ceil(planW / scale) / tiling.tileSize);
      const rows = Math.ceil(Math.ceil(planH / scale) / tiling.tileSize);
      if (cols * rows <= MAX_TILES_BASELINE) return z;
    }
    return tiling.minNativeZoom;
  }

  // Mapping zoom OSM → niveau plan : invariant du doublement partagé.
  // Chaque cran de zoom OSM = un cran de niveau plan (les 2 doublent par cran).
  // Clamp dans [minNativeZoom, maxNativeZoom] pour rester dans les tuiles générées.
  function _targetLevelForZoom(osmZoom, tiling) {
    if (_baselineOsmZoom == null || _baseLevel == null) return _baseLevel;
    const delta = Math.round(osmZoom - _baselineOsmZoom);
    const z = _baseLevel + delta;
    return Math.max(tiling.minNativeZoom, Math.min(tiling.maxNativeZoom, z));
  }

  // Check intersection AABB entre une tuile (3 coins, 4e déduit par parallélogramme)
  // et un viewport en latlng. Padding 10% pour pré-charger les bordures.
  function _tileIntersectsBounds(tl, tr, bl, mapBounds) {
    // 4e coin déduit géométriquement : br = tr + (bl - tl)
    const br = L.latLng(tr.lat + bl.lat - tl.lat, tr.lng + bl.lng - tl.lng);
    const tileBbox = L.latLngBounds([tl, tr, bl, br]);
    return mapBounds.intersects(tileBbox);
  }

  // Cleanup tous les overlays affichés (utilisé au swap de niveau et au close).
  function _cleanupAllTiles() {
    for (const path in _tilesByPath) {
      try { _tilesByPath[path].overlay.remove(); } catch(e) {}
    }
    _tilesByPath = {};
  }

  // Cull les tuiles qui ne sont plus dans le viewport (au pan sans changement de niveau).
  function _cullInvisibleTiles(mapBounds) {
    let culled = 0;
    for (const path in _tilesByPath) {
      const t = _tilesByPath[path];
      if (!_tileIntersectsBounds(t.tl, t.tr, t.bl, mapBounds)) {
        try { t.overlay.remove(); } catch(e) {}
        delete _tilesByPath[path];
        culled++;
      }
    }
    return culled;
  }

  // Rendu d'un niveau avec viewport culling.
  // - Si z !== _currentLevel : cleanup intégral de _tilesByPath puis render nouveau niveau
  // - Sinon : add uniquement les tuiles visibles pas encore dans _tilesByPath
  async function _renderLevel(z) {
    if (!_proj || !_osmMap) return;
    const tiling = window.PLAN_CONFIG && window.PLAN_CONFIG.tiling;
    const planW  = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.imageWidth;
    const planH  = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.imageHeight;
    if (!tiling || !planW || !planH) return;

    const switching = (z !== _currentLevel);
    if (switching) {
      _cleanupAllTiles();
      _currentLevel = z;
    }

    const scale    = Math.pow(2, -z);
    const tileSize = tiling.tileSize;
    const cols     = Math.ceil(Math.ceil(planW / scale) / tileSize);
    const rows     = Math.ceil(Math.ceil(planH / scale) / tileSize);

    const mapBounds = _osmMap.getBounds().pad(VIEWPORT_PADDING);

    // Phase 1 : identifier les tuiles visibles à ajouter (pas déjà dans _tilesByPath)
    const aAjouter = [];
    const aExtraire = [];
    // 🫥 v1.62.0 : extension d'après le manifest (webp/png = alpha, jpg = legacy)
    const _tileExt = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(tiling) : "jpg";
    for (let col = 0; col < cols; col++) {
      for (let k = 1; k <= rows; k++) {
        const path = "data/tiles/z" + z + "/x" + col + "_y" + (-k) + "." + _tileExt;
        if (_tilesByPath[path]) continue; // déjà rendue

        const pxLeft   = col * tileSize * scale;
        const pxRight  = (col + 1) * tileSize * scale;
        const pxTop    = planH - k * tileSize * scale;       // CRS.Simple flip Y
        const pxBottom = planH - (k - 1) * tileSize * scale;

        const tl = _proj.planToLatLng(pxLeft,  pxTop);
        const tr = _proj.planToLatLng(pxRight, pxTop);
        const bl = _proj.planToLatLng(pxLeft,  pxBottom);
        if (!tl || !tr || !bl) continue;

        if (!_tileIntersectsBounds(tl, tr, bl, mapBounds)) continue;

        aAjouter.push({ path, tl, tr, bl });

        // Pre-extract lazy si l'asset a été évincé par le LRU Phase 2
        const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[path];
        if (asset && !asset.file && asset._zipPath
            && typeof window._extractLazyAsset === "function") {
          aExtraire.push(path);
        }
      }
    }

    // Phase 2 : pre-extract async des tuiles lazy (cf Pack RAM Phase 2 v1.34.11)
    if (aExtraire.length > 0) {
      const tDebut = Date.now();
      await Promise.all(aExtraire.map(function(p) {
        return window._extractLazyAsset(p).catch(function(e) {
          console.warn("[OsmView] _extractLazyAsset failed for", p, e);
          return null;
        });
      }));
      console.log("[OsmView] Lazy : " + aExtraire.length + " tuile(s) extraite(s) pour z=" + z + " en " + (Date.now() - tDebut) + " ms");
    }

    // Phase 3 : créer les overlays (add to _planLayer + tracker dans _tilesByPath)
    let added = 0;
    for (const t of aAjouter) {
      const url = _resolveTileUrl(t.path);
      if (!url) continue;
      try {
        const overlay = L.imageOverlay.rotated(url, t.tl, t.tr, t.bl, { interactive: false });
        overlay.addTo(_planLayer);
        if (overlay.setOpacity) overlay.setOpacity(_opacity);
        _tilesByPath[t.path] = { overlay: overlay, tl: t.tl, tr: t.tr, bl: t.bl };
        added++;
      } catch(e) {
        console.warn("[OsmView] tile overlay :", t.path, e);
      }
    }

    // Phase 4 : cull les tuiles devenues invisibles (même niveau, pan)
    const culled = switching ? 0 : _cullInvisibleTiles(mapBounds);

    if (added > 0 || culled > 0 || switching) {
      console.log("[OsmView] z=" + z + " (scale x" + scale + ") : +" + added + " ajoutée(s), -" + culled + " cullée(s), total " + Object.keys(_tilesByPath).length + " tuile(s)");
    }
  }

  // Handler zoomend/moveend : re-évalue le niveau cible + déclenche render/cull.
  // Throttle implicite via Leaflet (events firés une fois par cran de zoom/pan).
  function _onMoveEnd() {
    if (!_osmMap) return;
    // 📏 v1.83.0 — la largeur des fronts suit le zoom. AVANT le retour
    // anticipé ci-dessous : il ne concerne que le tuilage, et un plan non
    // tuilé a exactement le même besoin.
    _majLargeurFrontsOsm();
    const tiling = window.PLAN_CONFIG && window.PLAN_CONFIG.tiling;
    if (!tiling) return;
    const targetZ = _targetLevelForZoom(_osmMap.getZoom(), tiling);
    // _renderLevel gère le switch interne (cleanup si new level, cull si same)
    _renderLevel(targetZ);
  }

  // =========================
  // BUILD MAP + LAYERS
  // =========================
  async function _renderMap() {
    const mapDiv = document.getElementById("kta-osm-map");
    if (!mapDiv) return;
    _osmMap = L.map(mapDiv, {
      worldCopyJump: false,
      attributionControl: true,
      zoomControl: true,
      // 🆕 v1.39.14 — preferCanvas pour rendre toutes les polylines (roads + iti
      // + tracé tracker) sur 1 seul canvas, pas N éléments SVG. Supporte des
      // milliers de polylines sans alourdir le DOM. Cohérent avec map.js
      // principale (cf §13 perf-memory). Les imageOverlay (tuiles) restent DOM.
      preferCanvas: true
    }).setView([46.5, 2.5], 6);
    L.tileLayer(OSM_TILE_URL, {
      maxZoom: OSM_MAX_ZOOM,
      attribution: OSM_ATTR,
      crossOrigin: true
    }).addTo(_osmMap);

    const proj = _buildProjection();
    if (!proj) {
      _showErrorBanner(window.I18n.t("osm.error.invalidGeoref"));
      return;
    }

    // 🐛 v1.39.3 — L.featureGroup au lieu de L.layerGroup : LayerGroup n'a
    // pas de méthode getBounds(), seule FeatureGroup (et sous-classes) l'a.
    // Sans ça, _centerOnPlan crash avec "_planLayer.getBounds is not a function".
    _planLayer = L.featureGroup().addTo(_osmMap);

    // 🆕 v1.39.10 — Rendu V2 tuiles (cf header doc § CRASH MOBILE)
    // open() a déjà gaté sur _isV2Plan() → ici on suppose V2 valide.
    // Si pas V2 (cas dégénéré : config changée pendant l'ouverture), on
    // log et on retourne sans crash.
    if (!_isV2Plan()) {
      console.warn("[OsmView] _renderMap : plan non V2 détecté à l'init render — abort safe.");
      _showErrorBanner(window.I18n.t("osm.error.notV2"));
      return;
    }

    // 🆕 v1.39.11 — Init niveau adaptatif + viewport culling
    const tiling = window.PLAN_CONFIG.tiling;
    const planW  = window.PLAN_CONFIG.plan.imageWidth  || 1;
    const planH  = window.PLAN_CONFIG.plan.imageHeight || 1;
    _proj = proj;  // mémo pour les handlers zoom/move

    // 1) Calcul de la bbox du plan en latlng (4 coins via georef)
    _planBbox = _computePlanBbox(proj, planW, planH);
    if (!_planBbox || !_planBbox.isValid()) {
      _showErrorBanner(window.I18n.t("osm.error.noBbox"));
      return;
    }

    // 2) Heuristique de baseline (niveau le + zoomé tel que ≤ MAX_TILES_BASELINE)
    _baseLevel       = _choisirNiveauBaseline(tiling, planW, planH);
    _baselineOsmZoom = _osmMap.getBoundsZoom(_planBbox);
    console.log("[OsmView] Baseline : zoom OSM=" + _baselineOsmZoom + " ↔ niveau plan z=" + _baseLevel + " (range [" + tiling.minNativeZoom + ".." + tiling.maxNativeZoom + "])");

    // 3) FitBounds AVANT le premier render (pour que _osmMap.getBounds() reflète
    // la vraie zone visible, pas la vue [46.5, 2.5] par défaut). Sinon le
    // viewport culling rejetterait toutes les tuiles au premier render.
    _osmMap.fitBounds(_planBbox, { padding: [40, 40] });

    // 4) Render initial au niveau baseline (avec culling)
    await _renderLevel(_baseLevel);

    // 5) Bind handler zoom/pan pour swap niveau adaptatif + cull dynamique
    _moveEndHandler = _onMoveEnd;
    _osmMap.on("zoomend moveend", _moveEndHandler);

    // 🏗️ v1.90.10 (bug KARMA) — L'INIT DES NIVEAUX DOIT PRÉCÉDER TOUT RENDU
    // LEVEL-AWARE. Symptôme : à l'ouverture, le niveau -1 n'apparaissait pas
    // alors qu'il était actif ; couper puis rallumer le toggle le faisait
    // surgir. Cause : `_initVisibleLevels()` vivait à l'étape 9, APRÈS le rendu
    // des POI (6) et des tracés/itinéraire (8). Ces rendus utilisaient donc le
    // `_visibleLevels` HÉRITÉ de la modale précédente (état module, persistant
    // entre deux ouvertures) : s'il ne contenait pas -1, ses POI et tracés
    // étaient filtrés. Zones et structures, rendues APRÈS l'init, apparaissaient
    // — d'où le « sur certain plan », selon l'historique de la session. On
    // initialise donc AVANT, une fois pour tous les calques.
    _initVisibleLevels();

    // 6) 🆕 v1.39.12 — Step 1 : POI session + data layers
    if (_poiVisible) _renderPoi();

    // 7) 🆕 v1.39.13 — Step 2 : tracker (tracé + position live)
    if (_trackerVisible) {
      _renderTracker();
      _startTrackerPolling();
    }

    // 8) 🆕 v1.39.14 — Step 3a : roads + itinéraire
    if (_roadVisible) _renderRoads();
    if (_itiVisible)  _renderItinerary();

    // 9) 🆕 v1.39.16 — Barre des niveaux + Step 3b : zones + structures
    // (l'init de `_visibleLevels` est remontée AVANT l'étape 6 — cf. v1.90.10.)
    _renderLevelsBar();
    if (_zoneVisible)   _renderZones();
    if (_structVisible) _renderStructures();
    // Un re-rendu recrée les layers : la largeur du gabarit revient, il
    // faut la reposer. Sinon elle ne serait juste qu'au prochain zoom.
    _majLargeurFrontsOsm();

    // 10) 🆕 v1.40.34 (Synergie A v2) — Layer Mode Secours auto-affiché si
    // un scénario est actif au moment de l'ouverture de la modale. Sinon
    // le toggle reste OFF (et caché si pas de scénario).
    if (_secoursVisible && _hasActiveSecoursScenario()) {
      _renderSecoursLayer();
    }

    _applyOpacity();
  }

  // Résout l'URL d'une tuile V2. Si l'asset existe avec un File mais sans
  // blob URL encore créée → la crée à la volée. Si lazy + déjà extrait par
  // tiling.js → réutilise l'URL existante. Retourne null si tuile manquante.
  // ⚠️ asset.url est PARTAGÉ avec la map principale (tiling.js) — NE PAS
  // revoke à la fermeture de la modale OSM (casserait la map principale).
  // 🩸 v1.97.6 — SUR UN PLAN SERVEUR, LE FOND N'ÉTAIT JAMAIS DESSINÉ.
  // `RUNTIME_ASSETS` ne contient que les assets d'un plan importé en ZIP ;
  // servi en HTTP — le modèle de déploiement de la prod — il est VIDE.
  // Mesuré sur un relevé géoréférencé : 0 calque image, 0 requête de tuile,
  // et les POI, tracés et zones qui flottent sur OSM **sans le plan**. Le
  // seul signe était une ligne de log, elle-même masquée hors mode debug.
  // Le repli serveur existe depuis la v1.86.0 (`ktaRacineTuilesServeur`, déjà
  // partagée avec `planOffline`) ; cet écran ne l'avait jamais reçu — comme
  // la minimap d'urgence et le superoverlay KMZ. La résolution des tuiles
  // existait en double : deux consommateurs sur quatre l'avaient ratée.
  function _racineTuilesServeur() {
    try {
      return (typeof window.ktaRacineTuilesServeur === "function")
        ? window.ktaRacineTuilesServeur(window.PLAN_CONFIG) : null;
    } catch(e) { return null; }
  }
  function _resolveTileUrl(path) {
    const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[path];
    if (!asset) {
      // `path` vaut "data/tiles/z<N>/x<col>_y<-k>.<ext>" : la racine serveur
      // remplace son préfixe "data/tiles".
      const racine = _racineTuilesServeur();
      return racine ? (racine + path.replace(/^data\/tiles/, "")) : null;
    }
    if (!asset.url && asset.file) {
      try {
        asset.url = URL.createObjectURL(asset.file);
      } catch(e) {
        console.warn("[OsmView] blob URL création échouée pour", path, e);
      }
    }
    return asset.url || null;
  }

  function _showErrorBanner(msg) {
    const mapDiv = document.getElementById("kta-osm-map");
    if (!mapDiv) return;
    mapDiv.innerHTML =
      '<div style="display:flex; align-items:center; justify-content:center; height:100%; padding:20px; color:#ffb380; text-align:center; font-size:14px;">' +
        msg +
      '</div>';
  }

  // =========================
  // API PUBLIQUE
  // =========================
  async function open() {
    if (typeof L === "undefined" || !L.imageOverlay || !L.imageOverlay.rotated) {
      alert(window.I18n.t("osm.open.leafletMissing"));
      return;
    }
    if (!_hasGeoref()) {
      alert(window.I18n.t("osm.open.noGeoref"));
      return;
    }
    // 🆕 v1.39.10 — Gate V2 : Vue OSM réservée aux plans tuilés pour éviter
    // le crash mobile (cf. header doc § CRASH MOBILE). Alert pédagogique
    // pour expliquer comment activer.
    if (!_isV2Plan()) {
      alert(window.I18n.t("osm.open.notV2"));
      return;
    }
    if (_isIncognitoOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("osm.open.incognito.toast"), "warn");
      } else { alert(window.I18n.t("osm.open.incognito.alert")); }
      return;
    }
    // 🆕 v1.43.0 — Si offline mais cache OSM présent pour le plan, on
    // autorise l'ouverture en mode dégradé (les tuiles sont servies par
    // le Service Worker depuis IndexedDB).
    // ⚠️ Recheck JIT (await) avant de bloquer : la flag _planHasCachedTiles
    // peut être stale au boot si PLAN_CONFIG n'était pas encore prêt quand
    // le setTimeout init a tiré. À ce moment-ci (user clic Vue OSM), le
    // plan est forcément chargé → la bbox est résolvable → check précis.
    if (!_isOnline()) {
      try { await _recheckCachedForCurrentPlan(); } catch(e) {}
      if (!_planHasCachedTiles) {
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(window.I18n.t("osm.open.offlineNoCache.toast"), "warn");
        } else { alert(window.I18n.t("osm.open.offlineNoCache.alert")); }
        return;
      }
    }
    if (!isOptedIn()) {
      const yes = confirm(window.I18n.t("osm.open.optInConfirm"));
      if (!yes) return;
      setOptedIn(true);
    }
    // 🆕 v1.39.5 — Ping fiable AVANT ouverture modale (pattern aligné sur
    // la mise à jour douce). navigator.onLine est rapide mais false-negative
    // possible (Wi-Fi connecté mais ISP down). Le ping fait un vrai fetch
    // HTTPS vers /ping.html same-origin avec timeout 5s → resultat fiable.
    // Si KO → toast + abort (évite d'ouvrir une modale OSM avec tiles vides).
    // 🐛 v1.43.7 — Bypass ping si cache OSM présent pour le plan : le
    // service worker servira les tuiles depuis IDB, on n'a pas besoin de
    // joindre le serveur. Sans ce bypass, le ping échoue en mode avion
    // → user voit « Internet ne répond pas » alors que le cache est là.
    if (_planHasCachedTiles) {
      if (_modalEl) close();
      _modalEl = _buildModal();
      setTimeout(_renderMap, 50);
      return;
    }
    _pingThenOpen();
  }

  function _pingThenOpen() {
    // Overlay d'attente visible pendant le ping (jusqu'à 5s)
    const waitOverlay = document.createElement("div");
    waitOverlay.className = "kta-modal-overlay";
    waitOverlay.style.cssText = "z-index:100050;";
    waitOverlay.innerHTML =
      '<div class="kta-modal" style="max-width:340px;">' +
        '<div class="kta-modal-icon" style="font-size:32px;">⏳</div>' +
        '<div class="kta-modal-titre">' + window.I18n.t("osm.ping.title") + '</div>' +
        '<div class="kta-modal-texte" style="font-size:13px; color:#8892a4;">' + window.I18n.t("osm.ping.text") + '</div>' +
      '</div>';
    document.documentElement.appendChild(waitOverlay);

    const pingFn = (typeof window._pingInternet === "function") ? window._pingInternet : null;
    const pingPromise = pingFn
      ? pingFn()
      : Promise.resolve(navigator.onLine !== false);  // fallback si helper pas chargé

    // 🆕 v1.43.26 — Cleanup waitOverlay centralisé via .finally() (au lieu
    // de duplication then-catch). Garantit que l'overlay disparaît dans
    // TOUS les chemins de sortie, y compris exceptions non-attendues.
    // 🐛 v1.43.27 — Hotfix : le commentaire ci-dessus promettait `.finally()`
    // mais l'implémentation v1.43.26 avait retiré les `waitOverlay.remove()`
    // du then-catch SANS ajouter le `.finally()` correspondant → overlay
    // jamais retiré du DOM. Audit V2 a flaggé. Fix : ajout effectif du
    // `.finally()` qui remove l'overlay quoi qu'il arrive.
    pingPromise.then(function(online) {
      if (!online) {
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(window.I18n.t("osm.ping.noInternet"), "warn");
        } else {
          alert(window.I18n.t("osm.ping.noInternet"));
        }
        return;
      }
      if (_modalEl) close();
      _modalEl = _buildModal();
      setTimeout(_renderMap, 50);
    }).catch(function(e) {
      console.warn("[OsmView] ping failed :", e);
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("osm.ping.checkFailed"), "warn");
      }
    }).finally(function() {
      try {
        if (waitOverlay && waitOverlay.parentNode) {
          waitOverlay.parentNode.removeChild(waitOverlay);
        }
      } catch(_) {}
    });
  }

  function close() {
    // 🔍 Rendre la main au mode plan : la variable de largeur est partagee, et
    // la laisser sur la valeur du zoom OSM donnerait au plan une largeur qui
    // ne correspond pas au sien.
    try {
      if (typeof window.majLargeurFronts === "function") window.majLargeurFronts();
      else document.documentElement.style.removeProperty("--kta-front-w");
    } catch (e) {}
    // 🆕 v1.39.11 — Cleanup state niveau adaptatif + culling
    if (_osmMap && _moveEndHandler) {
      try { _osmMap.off("zoomend moveend", _moveEndHandler); } catch(e) {}
    }
    _moveEndHandler = null;
    // ⚠️ NE PAS revoke asset.url ici — partagé avec tiling.js (map principale)
    _tilesByPath = {};
    _planBbox        = null;
    _proj            = null;
    _baselineOsmZoom = null;
    _baseLevel       = null;
    _currentLevel    = null;

    // 🆕 v1.39.12 — Cleanup POI layer
    if (_poiLayer) {
      try { _poiLayer.clearLayers(); } catch(e) {}
      _poiLayer = null;
    }

    // 🆕 v1.39.13 — Cleanup tracker (polling + layers)
    _stopTrackerPolling();
    if (_trackerLayer) {
      try { _trackerLayer.clearLayers(); } catch(e) {}
      _trackerLayer = null;
    }
    _trackerTrace  = null;
    _trackerMarker = null;

    // 🆕 v1.39.14 — Cleanup roads + iti
    if (_roadLayer) { try { _roadLayer.clearLayers(); } catch(e) {} _roadLayer = null; }
    if (_itiLayer)  { try { _itiLayer.clearLayers();  } catch(e) {} _itiLayer  = null; }

    // 🆕 v1.39.16 — Cleanup zones + structures + reset multi-LVL state
    if (_zoneLayer)   { try { _zoneLayer.clearLayers();   } catch(e) {} _zoneLayer   = null; }
    if (_structLayer) { try { _structLayer.clearLayers(); } catch(e) {} _structLayer = null; }
    // 🆕 v1.40.34 (Synergie A v2) — Cleanup layer Mode Secours
    if (_secoursLayer) { try { _secoursLayer.clearLayers(); } catch(e) {} _secoursLayer = null; }
    _visibleLevels = null;
    // 🆕 v1.40.17 — Reset filtre tag local au close (état non persistant entre ouvertures)
    _osmLocalTagFilter = null;
    // 🆕 v1.40.18 — Cleanup marker GPS + cercle accuracy (RAM only, mais on dispose)
    if (_myGpsMarker)         { try { _myGpsMarker.remove();         } catch(e) {} _myGpsMarker = null; }
    if (_myGpsAccuracyCircle) { try { _myGpsAccuracyCircle.remove(); } catch(e) {} _myGpsAccuracyCircle = null; }

    if (_osmMap) { try { _osmMap.remove(); } catch(e) {} _osmMap = null; }
    _planLayer = null;
    if (_modalEl && _modalEl.parentNode) {
      try { _modalEl.parentNode.removeChild(_modalEl); } catch(e) {}
    }
    _modalEl = null;
  }

  window.OsmView = {
    open: open,
    close: close,
    isAvailable: isAvailable,
    isOptedIn: isOptedIn,
    setOptedIn: setOptedIn,
    // 🆕 v1.41.0 B/C — Helper public pour Briefing pompiers PDF (secoursMode).
    // Retourne L.LatLngBounds | null (plan georef bbox). Nécessite Vue OSM
    // déjà ouverte au moins une fois (sinon _proj non initialisé → null).
    getPlanGpsBbox: _getPlanGpsBbox,
    // 🆕 v1.43.0 — Refresh la flag _planHasCachedTiles (utilisée par
    // isAvailable()) après un changement de plan ou un cacheVisibleTiles.
    // Appelé par : (a) main.js au boot, (b) osmHomePreview après cache,
    // (c) secoursMode si refresh nécessaire.
    recheckOfflineCache: _recheckCachedForCurrentPlan
  };

  // 🆕 v1.43.0 — Init différée du recheck cache : on attend que
  // OsmTilesCache + PLAN_CONFIG soient prêts (boot delay ~1s).
  setTimeout(function() {
    if (window.OsmTilesCache && typeof window.OsmTilesCache.init === "function") {
      window.OsmTilesCache.init().then(_recheckCachedForCurrentPlan);
    }
  }, 1500);

  console.log("[OsmView] Module chargé (v1.43.0).");
})();
