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
//   - Si "Mode hors-ligne strict" activé → bouton désactivé visuellement +
//     toast d'erreur.
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
  let _opacity   = 1.0;        // 0..1
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
  function isOptedIn() {
    try { return localStorage.getItem(LS_OPT_IN_KEY) === "1"; } catch(e) { return false; }
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
  function _isStrictOfflineOn() {
    try {
      return !!(window.NetworkAudit && typeof window.NetworkAudit.isStrictOfflineEnabled === "function"
                && window.NetworkAudit.isStrictOfflineEnabled());
    } catch(e) { return false; }
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
  // 🆕 v1.39.10 — Détecte si le plan courant est en mode V2 tuilé.
  // Vue OSM réservée aux plans V2 pour éviter le crash mobile (cf. header doc).
  function _isV2Plan() {
    const pc = window.PLAN_CONFIG;
    return !!(pc && pc.plan && pc.plan.tiledV2 === true && pc.tiling
              && Number.isFinite(pc.tiling.minNativeZoom)
              && Number.isFinite(pc.tiling.tileSize));
  }

  function isAvailable() {
    return _hasGeoref() && isOptedIn() && !_isStrictOfflineOn() && !_isIncognitoOn() && _isOnline();
  }

  // =========================
  // PROJECTION : pixels plan → latlng GPS
  // =========================
  // Retourne un objet { transform, planToLatLng(x, y) → L.latLng } ou null.
  function _buildProjection() {
    const g = _getEffectiveGeoref();
    if (!g) return null;
    if (typeof window.KmzExport !== "object" || typeof window.KmzExport.buildTransform !== "function") return null;
    const pA = g.pointA, pB = g.pointB;
    let t;
    try {
      t = window.KmzExport.buildTransform(
        { x: pA.x, y: pA.y }, { x: pB.x, y: pB.y },
        { lat: pA.lat, lng: pA.lng }, { lat: pB.lat, lng: pB.lng }
      );
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
  function _project3Corners(proj, sourceUrl, layerConfig) {
    const planW = (window.APP_CONFIG && window.APP_CONFIG.imageWidth)  || 1;
    const planH = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 1;
    let tlPx, trPx, blPx;
    if (layerConfig && layerConfig.calibration
        && window.ImageLayerCalibration
        && typeof window.ImageLayerCalibration.compute3CornersFromAnchorsPx === "function") {
      // Layer calibré : on a besoin des dims natives de l'image source
      // (sourceW, sourceH). On les récupère via une img preload async.
      return new Promise(function(resolve) {
        const img = new Image();
        img.onload = function() {
          const corners = window.ImageLayerCalibration.compute3CornersFromAnchorsPx(
            layerConfig.calibration, img.naturalWidth, img.naturalHeight
          );
          if (!corners) return resolve(null);
          const tl = proj.planToLatLng(corners.tl.x, corners.tl.y);
          const tr = proj.planToLatLng(corners.tr.x, corners.tr.y);
          const bl = proj.planToLatLng(corners.bl.x, corners.bl.y);
          if (!tl || !tr || !bl) return resolve(null);
          resolve({ tl: tl, tr: tr, bl: bl });
        };
        img.onerror = function() { resolve(null); };
        img.src = sourceUrl;
      });
    }
    // Layer non calibré (ou baseImage) : on utilise les coins du plan
    tlPx = { x: 0,     y: 0 };
    trPx = { x: planW, y: 0 };
    blPx = { x: 0,     y: planH };
    const tl = proj.planToLatLng(tlPx.x, tlPx.y);
    const tr = proj.planToLatLng(trPx.x, trPx.y);
    const bl = proj.planToLatLng(blPx.x, blPx.y);
    if (!tl || !tr || !bl) return Promise.resolve(null);
    return Promise.resolve({ tl: tl, tr: tr, bl: bl });
  }

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

  // 🆕 v1.39.16 — Cascade unifiée level (POI/Roads/Zones/Structures).
  //   1. Si plan non multi-LVL → tout passe
  //   2. Si _visibleLevels = Set non-vide → check membership
  //   3. Sinon → fallback APP_CONFIG.activeLevel (mode mono historique v1.39.12)
  // Sémantique items sans level : level = 0 (cohérent §51.4 Heatmap).
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
  // Format unifié : { x, y, nom, tags, level, _source }
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
                       ? (" · niveau " + p.level)
                       : "";
        const desc = (p.description || "").trim();
        const html =
          '<div style="font-size:13px; min-width:140px; max-width:260px;">' +
            '<b>' + _escapeHtml(p.nom || "(sans nom)") + '</b><br>' +
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

  // 🆕 v1.40.17 — Énumération de TOUS les tags présents dans les POI du plan
  // (sans filtre local — sinon on n'a plus accès aux tags désactivés).
  // Respecte tout de même le filtre level + FilterPanel global.
  function _enumerateOsmTags() {
    const counts = {};
    const cfg = window.APP_CONFIG || {};
    // Session
    if (typeof window.getEditorPoints === "function") {
      const session = window.getEditorPoints() || [];
      for (const p of session) {
        if (!p || typeof p.x !== "number") continue;
        if (!_isLevelAllowed(p)) continue;
        const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    // Data layers
    const reg = window.PlanRegistry;
    const planId = reg && typeof reg.getActivePlanId === "function" ? reg.getActivePlanId() : null;
    const dl = window._dataLayersByPlan && planId ? window._dataLayersByPlan[planId] : null;
    if (Array.isArray(dl)) {
      for (const layer of dl) {
        if (!Array.isArray(layer.points)) continue;
        for (const p of layer.points) {
          if (!p || typeof p.x !== "number") continue;
          if (!_isLevelAllowed(p)) continue;
          const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
          counts[t] = (counts[t] || 0) + 1;
        }
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
    let html = '<button type="button" data-tag="__all__" title="Afficher tous les tags" ' +
               'style="font-size:11px; padding:2px 8px; border-radius:10px; cursor:pointer; ' +
               'border:1px solid ' + (isAllActive ? "rgba(244,197,66,0.6)" : "rgba(140,180,255,0.3)") + '; ' +
               'background:' + (isAllActive ? "rgba(244,197,66,0.2)" : "rgba(255,255,255,0.03)") + '; ' +
               'color:' + (isAllActive ? "#f4c542" : "#8892a4") + ';">Tout</button>';
    for (const t of tags) {
      const active = isAllActive || (_osmLocalTagFilter && _osmLocalTagFilter.has(t));
      html += '<button type="button" data-tag="' + _escapeHtml(t) + '" title="' + counts[t] + ' POI" ' +
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
    if (!_proj || typeof _proj.planToLatLng !== "function") return null;
    const cfg = window.APP_CONFIG || {};
    const w = cfg.imageWidth, h = cfg.imageHeight;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    const corners = [
      _proj.planToLatLng(0, 0),
      _proj.planToLatLng(w, 0),
      _proj.planToLatLng(w, h),
      _proj.planToLatLng(0, h)
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
  // 🆕 v1.40.19 — Garde runtime strict offline / incognito : si l'user a activé
  // ces modes PENDANT la session (la modale était déjà ouverte), on bloque ici.
  // Note : navigator.onLine===false ne bloque PAS le GPS (le GPS marche en avion).
  function _showMyGpsPositionOsm() {
    if (!_osmMap) return;
    if (_isStrictOfflineOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("🛡️ Mode hors-ligne strict actif — GPS désactivé par cohérence.", "warn");
      } else { alert("Mode hors-ligne strict actif — bouton GPS désactivé."); }
      return;
    }
    if (_isIncognitoOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("🕶️ Mode incognito actif — GPS désactivé.", "warn");
      } else { alert("Mode incognito actif — bouton GPS désactivé."); }
      return;
    }
    if (!navigator.geolocation) {
      alert("Géolocalisation non disponible sur ce navigateur.");
      return;
    }
    const btn = document.getElementById("kta-osm-mygps");
    const originalHtml = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳"; }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
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
            const msg = "📍 Position GPS hors du champ de ce plan (~" + distKm.toFixed(1) +
                        " km du centre). Marker non affiché — vérifie que tu es bien sur le bon plan ou ailleurs.";
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
            '<b>📍 Ta position GPS</b><br>' +
            '<span style="font-size:11.5px; color:#8892a4;">' +
              lat.toFixed(5) + ", " + lng.toFixed(5) + '<br>' +
              "Précision : ±" + Math.round(acc) + " m" +
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
        let msg = "Impossible d'obtenir ta position GPS.";
        if (err.code === 1) msg = "Permission GPS refusée. Autorise la géolocalisation dans ton navigateur.";
        else if (err.code === 2) msg = "Position GPS indisponible (capteur ou réseau).";
        else if (err.code === 3) msg = "Délai dépassé pour obtenir la position GPS.";
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
  function _renderRoads() {
    if (!_proj || !_osmMap) return;
    if (!_roadLayer) _roadLayer = L.layerGroup().addTo(_osmMap);
    _roadLayer.clearLayers();

    const roads = _collectVisibleRoads();
    let added = 0, skipped = 0;
    for (const road of roads) {
      const latlngs = _projectRoadPoints(road);
      if (latlngs.length < 2) { skipped++; continue; }
      const color = road.color || "#8892a4"; // fallback gris muet charte
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

  function _renderZones() {
    if (!_proj || !_osmMap) return;
    if (!_zoneLayer) _zoneLayer = L.layerGroup().addTo(_osmMap);
    _zoneLayer.clearLayers();
    const zones = _collectVisibleZones();
    let added = 0, skipped = 0;
    for (const z of zones) {
      const latlngs = _projectPoints(z.points);
      if (latlngs.length < 3) { skipped++; continue; }
      const stroke = z.color     || "#8892a4";
      const fill   = z.fillColor || z.color || stroke;
      try {
        L.polygon(latlngs, {
          color:       stroke,
          fillColor:   fill,
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
      const style = STRUCTURE_STYLES_OSM[s.type] || STRUCTURE_STYLES_OSM["mur"];
      try {
        if (polyline) {
          L.polyline(latlngs, {
            color:   style.color,
            weight:  style.weight,
            opacity: style.opacity || 1,
            interactive: false
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
    } else if (_structLayer && _osmMap.hasLayer(_structLayer)) {
      _osmMap.removeLayer(_structLayer);
    }
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
    const active = cfg.activeLevel;
    _visibleLevels = new Set();
    if (Number.isFinite(active)) _visibleLevels.add(active);
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
  function _refreshLevelFilteredLayers() {
    if (_poiVisible)    _renderPoi();
    if (_roadVisible)   _renderRoads();
    if (_itiVisible)    _renderItinerary();
    if (_zoneVisible)   _renderZones();
    if (_structVisible) _renderStructures();
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
          '<span class="kta-readme-modal-titre">🌍 Vue OSM — plan sur OpenStreetMap</span>' +
          '<button class="kta-panneau-close" type="button" id="kta-osm-close" aria-label="Fermer">&times;</button>' +
        '</div>' +
        '<div style="display:flex; gap:10px; align-items:center; padding:8px 14px; background:rgba(140,180,255,0.06); border-bottom:1px solid rgba(140,180,255,0.18); font-size:12.5px; color:#c8d0e0;">' +
          '<span>🎚️ Opacité plan :</span>' +
          '<input type="range" id="kta-osm-opacity" min="0" max="100" value="100" style="flex:1 1 auto; max-width:240px;">' +
          '<span id="kta-osm-opacity-val" style="width:38px; text-align:right;">100%</span>' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-center" style="font-size:12px; padding:5px 10px;">🎯 Plan</button>' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-center-tracker" style="font-size:12px; padding:5px 10px;" title="Centrer sur la position du tracker">📡 Tracker</button>' +
          // 🆕 v1.40.18 — Bouton "Ma position GPS" (1 fix ponctuel, 0 stockage, 0 réseau)
          // 🆕 v1.40.19 — Disabled visuel si strict offline OU incognito au moment du build
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-mygps" style="font-size:12px; padding:5px 10px;"' +
            (_isStrictOfflineOn() || _isIncognitoOn() ? ' disabled' : '') +
            ' title="' +
              (_isStrictOfflineOn() ? "Désactivé : Mode hors-ligne strict actif"
                : _isIncognitoOn() ? "Désactivé : Mode incognito actif"
                : "Demander un fix GPS ponctuel (permission OS requise, aucune donnée envoyée ou stockée)") +
            '">📍 Moi</button>' +
          // 🆕 v1.40.12 — Toggle "🖼️ Plan" (masquer/afficher tuiles plan)
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;" title="Afficher / masquer l\'image du plan">' +
            '<input type="checkbox" id="kta-osm-plan-toggle" ' + (_planTilesVisible ? "checked" : "") + ' style="margin:0;">' +
            '🖼️ Plan' +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-poi-toggle" ' + (_poiVisible ? "checked" : "") + ' style="margin:0;">' +
            '📍 POI' +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-tracker-toggle" ' + (_trackerVisible ? "checked" : "") + ' style="margin:0;">' +
            '📡 Tracé' +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-road-toggle" ' + (_roadVisible ? "checked" : "") + ' style="margin:0;">' +
            '🛣️ Routes' +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-iti-toggle" ' + (_itiVisible ? "checked" : "") + ' style="margin:0;">' +
            '🧭 Iti' +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-zone-toggle" ' + (_zoneVisible ? "checked" : "") + ' style="margin:0;">' +
            '🌐 Zones' +
          '</label>' +
          '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none;">' +
            '<input type="checkbox" id="kta-osm-struct-toggle" ' + (_structVisible ? "checked" : "") + ' style="margin:0;">' +
            '🏗️ Struct' +
          '</label>' +
          '<span style="flex:1 1 auto;"></span>' +
          '<span style="color:#8892a4; font-size:11.5px;">🔒 Tiles : tile.openstreetmap.org (HTTPS)</span>' +
        '</div>' +
        // 🆕 v1.39.16 — Ligne 2 du bandeau : chips multi-LVL (visible
        // uniquement si plan multi-niveau actif, masqué autrement)
        '<div id="kta-osm-levels-bar" style="display:none; gap:8px; align-items:center; padding:6px 14px; background:rgba(244,197,66,0.04); border-bottom:1px solid rgba(244,197,66,0.18); font-size:12px; color:#c8d0e0; flex-wrap:wrap;">' +
          '<span>🏗️ Niveaux affichés :</span>' +
          '<span id="kta-osm-levels-chips" style="display:inline-flex; gap:6px; flex-wrap:wrap;"></span>' +
          '<span style="color:#8892a4; font-size:11px; margin-left:auto;">Click pour basculer · plusieurs niveaux possible</span>' +
        '</div>' +
        // 🆕 v1.40.17 — Ligne 3 du bandeau : chips filtre tag (Filter par tag local OSM)
        '<div id="kta-osm-tags-bar" style="display:none; gap:8px; align-items:center; padding:6px 14px; background:rgba(140,180,255,0.04); border-bottom:1px solid rgba(140,180,255,0.16); font-size:12px; color:#c8d0e0; flex-wrap:wrap;">' +
          '<span title="Filtrer les POI par tag (clic = toggle, vide = tout)">🏷️ Tags :</span>' +
          '<span id="kta-osm-tags-chips" style="display:inline-flex; gap:5px; flex-wrap:wrap;"></span>' +
          '<span style="color:#8892a4; font-size:11px; margin-left:auto;">Click pour basculer · vide = tout afficher</span>' +
        '</div>' +
        '<div id="kta-osm-map" style="flex:1 1 auto; background:#0a0d18;"></div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    overlay.querySelector("#kta-osm-close").addEventListener("click", close);
    overlay.querySelector("#kta-osm-opacity").addEventListener("input", function(e) {
      _opacity = (parseInt(e.target.value, 10) || 0) / 100;
      document.getElementById("kta-osm-opacity-val").textContent = Math.round(_opacity * 100) + "%";
      _applyOpacity();
    });
    overlay.querySelector("#kta-osm-center").addEventListener("click", _centerOnPlan);
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
      chip.textContent = "N" + lvl;
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
    for (let col = 0; col < cols; col++) {
      for (let k = 1; k <= rows; k++) {
        const path = "data/tiles/z" + z + "/x" + col + "_y" + (-k) + ".jpg";
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
      _showErrorBanner("⚠️ Calibration GPS du plan invalide ou indisponible.");
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
      _showErrorBanner("⚠️ Plan non tuilé V2 — Vue OSM indisponible.");
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
      _showErrorBanner("⚠️ Impossible de calculer la zone GPS du plan.");
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

    // 9) 🆕 v1.39.16 — Multi-LVL init + Step 3b : zones + structures
    _initVisibleLevels();
    _renderLevelsBar();
    if (_zoneVisible)   _renderZones();
    if (_structVisible) _renderStructures();

    _applyOpacity();
  }

  // Résout l'URL d'une tuile V2. Si l'asset existe avec un File mais sans
  // blob URL encore créée → la crée à la volée. Si lazy + déjà extrait par
  // tiling.js → réutilise l'URL existante. Retourne null si tuile manquante.
  // ⚠️ asset.url est PARTAGÉ avec la map principale (tiling.js) — NE PAS
  // revoke à la fermeture de la modale OSM (casserait la map principale).
  function _resolveTileUrl(path) {
    if (!window.RUNTIME_ASSETS) return null;
    const asset = window.RUNTIME_ASSETS[path];
    if (!asset) return null;
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
  function open() {
    if (typeof L === "undefined" || !L.imageOverlay || !L.imageOverlay.rotated) {
      alert("Leaflet ou plugin Rotated indisponible — Vue OSM impossible.");
      return;
    }
    if (!_hasGeoref()) {
      alert("Ce plan n'a pas de calibration GPS (georef).\nAjoute-en une via le générateur avancé → section 🌐 Géoréférencement GPS.");
      return;
    }
    // 🆕 v1.39.10 — Gate V2 : Vue OSM réservée aux plans tuilés pour éviter
    // le crash mobile (cf. header doc § CRASH MOBILE). Alert pédagogique
    // pour expliquer comment activer.
    if (!_isV2Plan()) {
      alert(
        "🧱 Vue OSM réservée aux plans V2 tuilés\n\n" +
        "Ton plan est en mode V1 (image complète, non tuilée). " +
        "L'afficher dans une seconde carte OSM pourrait crasher sur mobile (saturation mémoire GPU).\n\n" +
        "Comment activer la Vue OSM ?\n" +
        "→ Ouvre 🏗️ Générateur → mode Modifier → coche 🧱 \"Convertir en V2 tuile\" → régénère ton plan."
      );
      return;
    }
    if (_isStrictOfflineOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("⚠️ Mode hors-ligne strict actif — Vue OSM désactivée.", "warn");
      } else { alert("Mode hors-ligne strict actif — Vue OSM désactivée."); }
      return;
    }
    if (_isIncognitoOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("🥸 Mode incognito — Vue OSM désactivée (appel sortant interdit).", "warn");
      } else { alert("Mode incognito — Vue OSM désactivée."); }
      return;
    }
    if (!_isOnline()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("📴 Hors-ligne détecté — Vue OSM indisponible (tiles OSM réseau requises).", "warn");
      } else { alert("Hors-ligne — Vue OSM nécessite Internet pour charger les tiles OSM."); }
      return;
    }
    if (!isOptedIn()) {
      const yes = confirm(
        "🌍 Vue OSM\n\n" +
        "Cette action contacte tile.openstreetmap.org pour afficher la surface (réseau routier, bâtiments…) sous ton plan calibré GPS.\n\n" +
        "Active l'autorisation OSM ?\n" +
        "(Tu peux la révoquer à tout moment depuis ⚙️ Configuration home.)"
      );
      if (!yes) return;
      setOptedIn(true);
    }
    // 🆕 v1.39.5 — Ping fiable AVANT ouverture modale (pattern aligné sur
    // la mise à jour douce). navigator.onLine est rapide mais false-negative
    // possible (Wi-Fi connecté mais ISP down). Le ping fait un vrai fetch
    // HTTPS vers /ping.html same-origin avec timeout 5s → resultat fiable.
    // Si KO → toast + abort (évite d'ouvrir une modale OSM avec tiles vides).
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
        '<div class="kta-modal-titre">Vérification de la connexion…</div>' +
        '<div class="kta-modal-texte" style="font-size:13px; color:#8892a4;">Test du serveur (jusqu\'à 5 s) avant d\'ouvrir la Vue OSM.</div>' +
      '</div>';
    document.documentElement.appendChild(waitOverlay);

    const pingFn = (typeof window._pingInternet === "function") ? window._pingInternet : null;
    const pingPromise = pingFn
      ? pingFn()
      : Promise.resolve(navigator.onLine !== false);  // fallback si helper pas chargé

    pingPromise.then(function(online) {
      try { waitOverlay.remove(); } catch(e) {}
      if (!online) {
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast("📴 Internet ne répond pas — Vue OSM impossible. Vérifie ta connexion.", "warn");
        } else {
          alert("Internet ne répond pas — Vue OSM impossible. Vérifie ta connexion.");
        }
        return;
      }
      if (_modalEl) close();
      _modalEl = _buildModal();
      setTimeout(_renderMap, 50);
    }).catch(function(e) {
      try { waitOverlay.remove(); } catch(_) {}
      console.warn("[OsmView] ping failed :", e);
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("⚠️ Échec vérification réseau — Vue OSM annulée.", "warn");
      }
    });
  }

  function close() {
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
    setOptedIn: setOptedIn
  };

  console.log("[OsmView] Module chargé (v1.39.16).");
})();
