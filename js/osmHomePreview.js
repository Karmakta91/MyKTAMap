/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// OSM-HOME-PREVIEW.JS — Mini Vue OSM dans la HOME (v1.40.17 — Step 4)
// =========================
// Bouquet final de la roadmap Vue OSM (Step 1-4) : widget de prévisualisation
// embarqué directement dans la HOME, entre "📚 Mes plans" et "📦 Ajouter un
// plan". Permet de voir où le plan georef sélectionné se situe dans le monde
// réel SANS le charger en map mode complet (= pas de bascule d'écran).
//
// MODE LÉGER (v1.40.0)
//   Pour éviter d'ouvrir le ZIP au boot HOME (coûteux RAM mobile), on
//   utilise UNIQUEMENT les données déjà disponibles SANS extraction ZIP :
//     - Liste des plans : `PlanRegistry.getAll()` (en mémoire)
//     - Georef de chaque plan : `KmzExport.getCalibration(planId)` (LS session)
//       Note : pas de fallback `PLAN_CONFIG.plan.georef` car PLAN_CONFIG est
//       VIDE en HOME (aucun plan chargé). Donc les plans qui ont leur georef
//       UNIQUEMENT dans le plan-config.json embedded (et JAMAIS saisie via
//       Réglages map mode) ne seront pas listés ici. Limitation acceptable :
//       l'user qui veut utiliser le widget HOME doit avoir saisi sa georef
//       au moins 1 fois via Réglages map mode → propagée automatiquement
//       en LS par `_propagerGeorefVersKmzExport` au prochain load du plan.
//
// CONTENU AFFICHÉ
//   v1.40.0 : Tile layer OSM + markers pointA/pointB georef + ligne d'échelle
//   v1.40.4 : 🆕 + data layers embedded (POI + Roads + Zones + Structures)
//     extraits via JSZip à la sélection du plan dans le dropdown. Cache RAM
//     par planId pour éviter ré-extraction (LRU léger).
//
//   Helper `_loadPlanDataForPreview(planId)` :
//     - Récupère le ZIP via PlanRegistry.getHandle() (FS Access) OU
//       PlanRegistry.getBlob() (IDB fallback mobile/Safari)
//     - JSZip.loadAsync (lazy : ne décompresse PAS toutes les tuiles, juste
//       la liste centrale du ZIP)
//     - Extrait `plan-config.json` → parse pour avoir `dataLayers[].file`
//     - Pour chaque dataLayer : extract son JSON + parse (POI / Roads / Zones / Structures)
//     - Retourne `{ config, dataLayers: [...] }` ISOLATED (pas de side
//       effects sur window.PLAN_CONFIG ou autre)
//
//   Helper `_renderDataLayersOnMiniMap(data, georef)` :
//     - Construit la projection plan→OSM via georef (KmzExport.buildTransform)
//     - POI : `L.circleMarker` colorés (pas d'icônes images pour éviter
//       extraction supplémentaire, perf > cohérence visuelle stricte sur HOME)
//     - Roads : `L.polyline` avec `road.color` natif
//     - Zones : `L.polygon` avec `zone.color` + `fillColor`
//     - Structures : adaptatif polyline (fronts) ou polygon (mur/pilier)
//
// BOUTON ⛶ FULL-SCREEN
//   🆕 v1.40.2 — Refonte sémantique : ⛶ NE BASCULE PLUS en map mode.
//   Click → agrandit la mini-carte HOME en overlay plein-viewport
//   (position fixed inset:0). L'user reste sur la HOME, juste le widget
//   prend tout l'écran. Bouton devient ✕ pour réduire. Escape key aussi.
//   Avantage : flow ultra-simple, marche dans tous les cas, pas de hook
//   fragile sur kta:planConfigReady ou simulation clic plan row.
//   (v1.40.0/1 essayaient une bascule map mode + auto-open modale OsmView
//    via sessionStorage flag, mais les sélecteurs HTML data-plan-id étaient
//    faux + l'event planConfigReady n'est pas fiable → ne marchait pas.)
//
// OPT-IN OSM
//   Si le toggle "🌐 Autoriser OSM" n'est pas coché côté Configuration
//   home → affichage d'un placeholder avec bouton "Autoriser OSM" qui
//   l'active à la volée (LS `myktamap_osm_view_opt_in`). Pas d'appel
//   sortant tant que pas opt-in.
//
// CAS AUCUN PLAN GEOREF
//   Si la liste des plans georef est vide → message pédagogique avec
//   instructions pour saisir la calibration via Réglages map mode ou
//   Générateur.
//
// API
//   window.OsmHomePreview = {
//     mount()         → monte le widget dans #ktaOsmHomeContent (auto-call DOMContentLoaded)
//     refresh()       → recharge la liste des plans + re-render
//     selectPlan(id)  → bascule le plan affiché (= change le marker)
//     openFullScreen()→ déclenche le flow full-screen sur le plan courant
//   }
// =========================

(function() {
  "use strict";

  const LS_OPT_IN_KEY = "myktamap_osm_view_opt_in";
  const LS_LAST_SEL_KEY = "myktamap_osm_home_last_selected_plan";
  const OSM_TILE_URL  = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const OSM_ATTR      = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
  const OSM_MAX_ZOOM  = 19;

  let _mapInstance   = null;  // L.map instance (mini-carte)
  let _markerLayer   = null;  // L.layerGroup (markers georef + ligne)
  let _dataLayer     = null;  // v1.40.4 — L.layerGroup parent (catégories sous-layers)
  // 🆕 v1.40.12 — Sub-layers par catégorie pour toggles individuels
  let _poiSubLayer       = null;
  let _roadsSubLayer     = null;
  let _zonesSubLayer     = null;
  let _structSubLayer    = null;
  // 🆕 v1.40.12 — État des toggles par catégorie (default ON)
  let _showTiles       = true;
  let _showPoi         = true;
  let _showRoads       = true;
  let _showZones       = true;
  let _showStructures  = true;
  let _selectedPlanId = null;
  let _isFullscreen  = false; // v1.40.2 — état overlay plein-viewport
  let _fsEscapeHandler = null; // ref pour cleanup au close()
  // 🆕 v1.40.4 — Cache RAM : planId → { config, dataLayers, tilesOverview? }
  // Évite ré-extraction du ZIP si user re-sélectionne un plan déjà vu pendant
  // la session HOME. Cache cleared au unload page (RAM-only, pas de LS).
  const _planDataCache = {};
  // 🆕 v1.40.6 — Tracking des blob URLs créés pour les tuiles V2 overview.
  // Revoke au close() pour libérer la RAM (sinon fuite à chaque sélection
  // d'un nouveau plan = bloat RAM).
  let _tilesBlobUrls  = [];
  let _tilesLayer     = null;   // L.layerGroup pour les tuiles plan projetées
  let _planOpacity    = 0.5;    // 🆕 v1.40.6 / v1.42.4 — opacité plan (slider bandeau). KARMA : default 50% (meilleur compromis lecture OSM + plan, cohérent avec modale plan).

  // Style structures aligné sur structures.js > STRUCTURE_STYLES (cf §3b OSM modal).
  // Variant LIGHT pour la mini-carte HOME (weight/fillOpacity allégés).
  const STRUCT_STYLES_HOME = {
    "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.70, weight: 1, isPolyline: false },
    "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.70, weight: 1, isPolyline: false },
    "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.70, weight: 1, isPolyline: false },
    "front-1":  { color: "#f4c542", weight: 4, opacity: 0.95, isPolyline: true },
    "front-2":  { color: "#ff9933", weight: 4, opacity: 0.95, isPolyline: true }
  };
  // 🆕 v1.40.13 — Couleurs roads natives (aligné sur utils.js > ROAD_STYLES_DATA).
  // KARMA "récupéré la bonne couleur serait le top" → on prend les vraies
  // couleurs natives selon le type (principal=vert, secondaire=violet, etc.)
  // au lieu du fallback gris #8892a4 v1.40.4.
  const ROAD_STYLES_DATA_HOME = {
    "principal":  "#00ff00",  // vert
    "secondaire": "#b000ff",  // violet
    "chemin":     "#ffff00",  // jaune
    "jonction":   "#ff4ecb",  // rose (dashed sur map principale, simplifié ici)
    "itinerary":  "#00d4ff"   // cyan (cohérence avec ITI_COLOR osmView.js)
  };
  // 🆕 v1.40.37 — Mapping zones par type (aligné sur zones.js > ZONE_STYLES).
  // KARMA : « fait en sorte que la couleur des routes, zone, ... persiste »
  // Cascade : z.color/fillColor explicite > built-in type > custom legend > fallback gris.
  const ZONE_STYLES_DATA_HOME = {
    "eau":          { stroke: "#0066aa", fill: "#3aa9e8" },
    "remblais":     { stroke: "#3a3a44", fill: "#5a5a68" },
    "effondrement": { stroke: "#cc0000", fill: "#ff3333" },
    "inaccessible": { stroke: "#5a0a0a", fill: "#b8743c" }
  };
  // Helper résolution couleur road (cascade complète)
  function _resolveRoadColorHome(r) {
    if (r && typeof r.color === "string" && r.color) return r.color;
    if (r && r.type && ROAD_STYLES_DATA_HOME[r.type]) return ROAD_STYLES_DATA_HOME[r.type];
    if (r && r.type && window.LegendCustomization
        && typeof window.LegendCustomization.findCustomEntry === "function") {
      try {
        const e = window.LegendCustomization.findCustomEntry(r.type);
        if (e && e.category === "traces" && e.lineColor) return e.lineColor;
      } catch(_) {}
    }
    return "#8892a4";
  }
  // Helper résolution couleurs zone (stroke + fill, cascade complète)
  function _resolveZoneColorsHome(z) {
    if (z && (z.color || z.fillColor)) {
      return {
        stroke: z.color     || z.fillColor || "#8892a4",
        fill:   z.fillColor || z.color     || "#8892a4"
      };
    }
    if (z && z.type && ZONE_STYLES_DATA_HOME[z.type]) return ZONE_STYLES_DATA_HOME[z.type];
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
  // 🆕 v1.40.13 — Tags built-in (aligné sur map.js > TAGS_BUILTIN). Utilisé
  // pour extraire les icônes par défaut du ZIP si le plan-config n'override pas.
  // Cohérence stricte avec map.js — si TAGS_BUILTIN change là-bas, sync ici.
  const TAGS_BUILTIN_HOME = {
    salle:    "icon/house.png",
    pa:       "icon/pa.png", pc: "icon/pc.png", pb: "icon/pb.png",
    pe:       "icon/pe.png", ps: "icon/ps.png",
    peo:      "icon/peo.png", pef: "icon/pef.png",
    eso:      "icon/eso.png", esf: "icon/esf.png",
    cao:      "icon/cao.png", caf: "icon/caf.png",
    vehicule: "icon/vehicule.png",
    elec:     "icon/elec.png", epure: "icon/epure.png",
    info:     "icon/info.png",
    chatiere: "icon/chatiere.png", passage: "icon/passage.png",
    danger:   "icon/danger.png", plaque: "icon/plaque.png"
  };
  // 🆕 v1.40.13 — Tracker des blob URLs créés pour les icônes POI
  let _iconBlobUrls = [];
  // 🆕 v1.40.17 — Filtre par tag : null = pas de filtre (tout affiché),
  // Set<string> non-vide = ne montre que les POI dont le tag est dans le Set
  let _homeTagFilter = null;
  // 🆕 v1.40.18 — Marker "📍 Moi" (GPS device, 1 fix ponctuel, 0 stockage)
  let _myGpsMarkerHome         = null;
  let _myGpsAccuracyCircleHome = null;

  // =========================
  // HELPERS — Opt-in & state
  // =========================
  function _isOptedIn() {
    try { return localStorage.getItem(LS_OPT_IN_KEY) === "1"; } catch(e) { return false; }
  }
  function _setOptedIn(value) {
    try { localStorage.setItem(LS_OPT_IN_KEY, value ? "1" : "0"); } catch(e) {}
    try { window.dispatchEvent(new CustomEvent("kta:osmOptInChange", { detail: { optedIn: !!value } })); } catch(e) {}
  }
  function _isOnline() {
    return (typeof navigator === "undefined") || navigator.onLine !== false;
  }

  // 🆕 v1.43.3 — Cache OSM offline : flag sync « il existe au moins une
  // tuile cachée globalement ». Sert au mount() pour décider si on bloque
  // tout le widget offline (= cache vide partout) OU si on monte normalement
  // et laisse selectPlan() arbitrer plan par plan.
  // Refresh async via getStats() au boot + après chaque cache + via event.
  let _anyCachePresent = false;
  async function _refreshAnyCachePresent() {
    try {
      if (!window.OsmTilesCache) { _anyCachePresent = false; return; }
      const s = await window.OsmTilesCache.getStats();
      const before = _anyCachePresent;
      _anyCachePresent = (s.count > 0);
      // Si on passe de "rien" à "quelque chose" et qu'on est offline,
      // remount le widget pour qu'il devienne accessible.
      if (!before && _anyCachePresent && !_isOnline()) {
        refresh();
      }
    } catch(e) {}
  }

  // 🆕 v1.43.3 — Helper bbox approximative d'un plan georef à partir des
  // 2 points calibrés A↔B. Utilisé par hasCacheForBbox pour décider si
  // un plan donné a des tuiles cachées.
  function _bboxFromGeoref(georef) {
    try {
      if (!_isValidGeoref(georef)) return null;
      return L.latLngBounds(
        [georef.pointA.lat, georef.pointA.lng],
        [georef.pointB.lat, georef.pointB.lng]
      );
    } catch(e) { return null; }
  }
  // 🆕 v1.40.19 — Parité gating modale OsmView : strict offline + incognito.
  // Le widget HOME avait un trou (v1.40.0-18) : il chargeait quand même les
  // tuiles OSM en mode hors-ligne strict ou en incognito. On ferme.
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
  function _getLastSelectedFromLs() {
    try { return localStorage.getItem(LS_LAST_SEL_KEY) || null; } catch(e) { return null; }
  }
  function _saveLastSelected(planId) {
    try {
      if (planId) localStorage.setItem(LS_LAST_SEL_KEY, planId);
      else        localStorage.removeItem(LS_LAST_SEL_KEY);
    } catch(e) {}
  }

  // =========================
  // HELPERS — Liste plans georef
  // =========================
  // Retourne un Array<{ id, name, georef }> des plans qui ont une calibration
  // GPS valide via KmzExport.getCalibration. Tri : lastOpened desc.
  function _listGeorefPlans() {
    if (!window.PlanRegistry || typeof window.PlanRegistry.getAll !== "function") return [];
    if (!window.KmzExport   || typeof window.KmzExport.getCalibration !== "function") return [];
    const all = window.PlanRegistry.getAll() || [];
    const out = [];
    for (const p of all) {
      if (!p || !p.id) continue;
      const g = window.KmzExport.getCalibration(p.id);
      if (_isValidGeoref(g)) {
        out.push({ id: p.id, name: p.name || p.id, georef: g, lastOpened: p.lastOpened || 0 });
      }
    }
    out.sort(function(a, b) { return (b.lastOpened || 0) - (a.lastOpened || 0); });
    return out;
  }

  function _isValidGeoref(g) {
    return !!(g && g.pointA && g.pointB
      && Number.isFinite(g.pointA.lat) && Number.isFinite(g.pointA.lng)
      && Number.isFinite(g.pointB.lat) && Number.isFinite(g.pointB.lng));
  }

  // =========================
  // 🆕 v1.40.1 — Masquage colonne entière si pas opt-in
  // =========================
  // KARMA "si on a pas cocher le OSM dans la config, on affiche pas ce
  // panel OSM en home" → choix B validé. Cohérent philo offline-first :
  // aucune trace du widget tant que pas autorisé.
  // Au refresh (opt-in ON via Configuration) → la colonne réapparaît
  // automatiquement.
  function _setOsmColumnVisible(visible) {
    const col = document.querySelector(".loader-col-osm");
    const grid = document.querySelector(".loader-grid");
    if (col) col.style.display = visible ? "" : "none";
    // Toggle `.kta-no-osm` sur le grid pour rebasculer en 2 cols PC
    // (sinon on aurait un trou visuel à la place de la colonne masquée).
    if (grid) {
      if (visible) grid.classList.remove("kta-no-osm");
      else grid.classList.add("kta-no-osm");
    }
  }

  // =========================
  // RENDU UI — Cas spéciaux
  // =========================
  function _renderOptInNeeded(container) {
    // 🆕 v1.40.1 — Masquage complet de la colonne (au lieu d'un placeholder)
    // → la colonne disparaît, le grid PC retombe sur 2 cols comme avant
    // v1.40.0. L'user qui veut activer la Vue OSM passe par ⚙️ Configuration
    // (point d'entrée unique, déjà existant depuis v1.39.0).
    _setOsmColumnVisible(false);
  }

  function _renderOffline(container) {
    container.innerHTML =
      '<div class="kta-osm-home-empty">' +
        '<div style="font-size:32px;">📴</div>' +
        '<div><strong>' + window.I18n.t("osm_home.offline.title") + '</strong></div>' +
        '<div style="max-width:280px; font-size:12px;">' +
          window.I18n.t("osm_home.offline.body") +
        '</div>' +
      '</div>';
  }

  // 🆕 v1.40.19 — Cas Mode hors-ligne strict (NetworkAudit) : on bloque le
  // widget HOME complètement, parité comportement modale OsmView.
  function _renderStrictOffline(container) {
    container.innerHTML =
      '<div class="kta-osm-home-empty">' +
        '<div style="font-size:32px;">🛡️</div>' +
        '<div><strong>' + window.I18n.t("osm_home.strict.title") + '</strong></div>' +
        '<div style="max-width:300px; font-size:12px; line-height:1.6;">' +
          window.I18n.t("osm_home.strict.body") +
        '</div>' +
      '</div>';
  }

  // 🆕 v1.40.19 — Cas Mode incognito : on bloque pour ne pas laisser de trace
  // de plan georef chargé (philosophie incognito = pas de leak metadata).
  function _renderIncognito(container) {
    container.innerHTML =
      '<div class="kta-osm-home-empty">' +
        '<div style="font-size:32px;">🕶️</div>' +
        '<div><strong>' + window.I18n.t("osm_home.incognito.title") + '</strong></div>' +
        '<div style="max-width:300px; font-size:12px; line-height:1.6;">' +
          window.I18n.t("osm_home.incognito.body") +
        '</div>' +
      '</div>';
  }

  function _renderNoGeorefPlans(container) {
    container.innerHTML =
      '<div class="kta-osm-home-empty">' +
        '<div style="font-size:32px;">📍</div>' +
        '<div><strong>' + window.I18n.t("osm_home.nogeoref.title") + '</strong></div>' +
        '<div style="max-width:300px; font-size:12px; line-height:1.6;">' +
          window.I18n.t("osm_home.nogeoref.body") +
        '</div>' +
      '</div>';
  }

  // =========================
  // RENDU UI — Widget complet (carte)
  // =========================
  function _renderWidget(container, plans, selectedId) {
    const sel = plans.find(function(p) { return p.id === selectedId; }) || plans[0];
    _selectedPlanId = sel.id;

    // HTML structure : bandeau (dropdown + ⛶) + mini-map + footer
    let optionsHtml = "";
    for (const p of plans) {
      const selected = (p.id === sel.id) ? " selected" : "";
      optionsHtml +=
        '<option value="' + _escapeHtml(p.id) + '"' + selected + '>' +
          _escapeHtml(p.name) +
        '</option>';
    }

    // 🆕 v1.40.12 — Mini-helper pour générer un toggle compact
    function _renderToggle(id, emoji, label, checked, title) {
      return '<label class="kta-osm-home-toggle" title="' + title + '">' +
               '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' +
               '<span>' + emoji + ' ' + label + '</span>' +
             '</label>';
    }
    container.innerHTML =
      '<div class="kta-osm-home-bandeau">' +
        '<select id="ktaOsmHomePlanSelect" title="' + _escapeHtml(window.I18n.t("osm_home.select.title")) + '">' +
          optionsHtml +
        '</select>' +
        // 🆕 v1.40.18 — Bouton "Ma position GPS" (1 fix ponctuel, 0 stockage)
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeMyGpsBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_home.gps.btnTitle")) + '" ' +
                'style="background: rgba(0,212,255,0.12); border-color: rgba(0,212,255,0.4); color: #00d4ff;">' +
          '📍' +
        '</button>' +
        // 🆕 v1.43.0 — Bouton "Cacher tuiles offline" (cache partagé avec
        // Vue OSM modale + Mode Secours, store IDB unique myktamap_osm_tiles).
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeCacheBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_home.cache.btnTitle")) + '" ' +
                'style="background: rgba(166,215,133,0.10); border-color: rgba(166,215,133,0.35); color: #a6d785;">' +
          '💾' +
        '</button>' +
        // 🆕 v1.43.15 — Toggle "Réduire les contrôles" (= carte plein écran).
        // Cache opacity + toggles catégorie + tagrow. Persiste en localStorage.
        // Très utile sur mobile et en mode fullscreen où le bandeau prend
        // beaucoup de place.
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeToggleControlsBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_home.controls.collapseTitle")) + '" ' +
                'style="background: rgba(140,180,255,0.10); border-color: rgba(140,180,255,0.35); color: #8cb4ff;">' +
          '🔼' +
        '</button>' +
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeFullBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_home.fullscreen.enterTitle")) + '">' +
          '⛶' +
        '</button>' +
      '</div>' +
      // 🆕 v1.43.15 — Wrapper collapsible : opacity + toggles + tagrow.
      // Cache par le bouton 🔼. La carte (.kta-osm-home-map) reste toujours
      // visible et prend automatiquement la place via son flex:1 1 auto.
      '<div id="ktaOsmHomeCollapsible">' +
        // v1.40.6 — Slider opacité plan (cohérent avec OsmView modale)
        '<div class="kta-osm-home-opacityrow" style="display:flex; align-items:center; gap:6px; padding:4px 8px; font-size:11px; color:#c8d0e0; border-bottom:1px solid rgba(140,180,255,0.10);" title="' + _escapeHtml(window.I18n.t("osm_home.opacity.title")) + '">' +
          '<span style="opacity:0.7;">' + window.I18n.t("osm_home.opacity.label") + '</span>' +
          '<input type="range" id="ktaOsmHomeOpacity" min="0" max="100" value="' + Math.round(_planOpacity * 100) + '" style="flex:1 1 auto; max-width:240px; margin:0;">' +
        '</div>' +
        // 🆕 v1.40.12 — Toggles catégorie (filtres)
        '<div class="kta-osm-home-toggles">' +
          _renderToggle("ktaOsmHomeShowTiles",  "🖼️", window.I18n.t("osm_home.toggle.plan.label"),   _showTiles,      window.I18n.t("osm_home.toggle.plan.title")) +
          _renderToggle("ktaOsmHomeShowPoi",    "📍", window.I18n.t("osm_home.toggle.poi.label"),    _showPoi,        window.I18n.t("osm_home.toggle.poi.title")) +
          _renderToggle("ktaOsmHomeShowRoads",  "🛣️", window.I18n.t("osm_home.toggle.roads.label"), _showRoads,      window.I18n.t("osm_home.toggle.roads.title")) +
          _renderToggle("ktaOsmHomeShowZones",  "🌐", window.I18n.t("osm_home.toggle.zones.label"),  _showZones,      window.I18n.t("osm_home.toggle.zones.title")) +
          _renderToggle("ktaOsmHomeShowStruct", "🏗️", window.I18n.t("osm_home.toggle.struct.label"), _showStructures, window.I18n.t("osm_home.toggle.struct.title")) +
        '</div>' +
        // 🆕 v1.40.17 — Filtre par tag (chips)
        '<div class="kta-osm-home-tagrow">' +
          '<span class="kta-osm-home-tagrow-label" title="' + _escapeHtml(window.I18n.t("osm_home.tagfilter.title")) + '">🏷️</span>' +
          '<div class="kta-osm-home-tagchips" id="ktaOsmHomeTagChips"></div>' +
        '</div>' +
      '</div>' +
      '<div class="kta-osm-home-map" id="ktaOsmHomeMap"></div>' +
      '<div class="kta-osm-home-footer">' +
        window.I18n.t("osm_home.footer.tiles") + ' ' +
        // 🆕 v1.43.0 — Stats cache OSM offline (refresh dynamique)
        '<span id="ktaOsmHomeCacheStats" title="' + _escapeHtml(window.I18n.t("osm_home.cache.statsTitle")) + '">📦 …</span>' +
      '</div>';

    // Bind dropdown
    const dropdown = container.querySelector("#ktaOsmHomePlanSelect");
    if (dropdown) {
      dropdown.addEventListener("change", function(e) {
        selectPlan(e.target.value);
      });
    }
    // Bind full-screen button
    const fullBtn = container.querySelector("#ktaOsmHomeFullBtn");
    if (fullBtn) {
      fullBtn.addEventListener("click", openFullScreen);
    }
    // 🆕 v1.40.18 — Bouton "Ma position GPS"
    const myGpsBtn = container.querySelector("#ktaOsmHomeMyGpsBtn");
    if (myGpsBtn) {
      myGpsBtn.addEventListener("click", _showMyGpsPositionHome);
    }
    // 🆕 v1.43.0 — Bouton "Cacher tuiles offline" + refresh stats
    const cacheBtn = container.querySelector("#ktaOsmHomeCacheBtn");
    if (cacheBtn) {
      cacheBtn.addEventListener("click", _runCacheTilesHome);
    }
    _refreshCacheStatsHome();

    // 🆕 v1.43.15 — Toggle "Réduire les contrôles" du widget Home
    const toggleCtrlBtn = container.querySelector("#ktaOsmHomeToggleControlsBtn");
    if (toggleCtrlBtn) {
      toggleCtrlBtn.addEventListener("click", function() {
        _applyHomeControlsCollapsed(!_getHomeControlsCollapsed());
      });
      // Apply état initial immédiatement (avant mount carte Leaflet)
      _applyHomeControlsCollapsed(_getHomeControlsCollapsed());
    }
    // v1.40.6 — Slider opacité tuiles plan
    const opacitySlider = container.querySelector("#ktaOsmHomeOpacity");
    if (opacitySlider) {
      opacitySlider.addEventListener("input", function(e) {
        const v = (parseInt(e.target.value, 10) || 0) / 100;
        _setPlanOpacity(v);
      });
    }
    // 🆕 v1.40.12 — Bind toggles catégorie
    function _bindToggle(id, fn) {
      const el = container.querySelector("#" + id);
      if (el) el.addEventListener("change", function(e) { fn(!!e.target.checked); });
    }
    _bindToggle("ktaOsmHomeShowTiles",  _toggleTiles);
    _bindToggle("ktaOsmHomeShowPoi",    _togglePoi);
    _bindToggle("ktaOsmHomeShowRoads",  _toggleRoads);
    _bindToggle("ktaOsmHomeShowZones",  _toggleZones);
    _bindToggle("ktaOsmHomeShowStruct", _toggleStructures);

    // Init mini-carte Leaflet (différée pour laisser le DOM se peindre)
    setTimeout(function() { _initMiniMap(sel.georef); }, 50);

    // Persiste la sélection
    _saveLastSelected(sel.id);
  }

  // =========================
  // RENDU LEAFLET — Mini-carte
  // =========================
  function _initMiniMap(georef) {
    const mapDiv = document.getElementById("ktaOsmHomeMap");
    if (!mapDiv) return;
    if (typeof L === "undefined") {
      console.warn("[OsmHomePreview] Leaflet indisponible, abandon init mini-map");
      return;
    }
    // Cleanup ancienne instance si refresh
    if (_mapInstance) {
      try { _mapInstance.remove(); } catch(e) {}
      _mapInstance = null;
      _markerLayer = null;
      _dataLayer   = null; // v1.40.4
      _tilesLayer  = null; // v1.40.6
      // 🆕 v1.40.12 — Reset sub-layers (parent _dataLayer recréé au render)
      _poiSubLayer = null;
      _roadsSubLayer = null;
      _zonesSubLayer = null;
      _structSubLayer = null;
      // 🆕 v1.40.18 — Reset marker GPS au refresh (instance map détruite)
      _myGpsMarkerHome = null;
      _myGpsAccuracyCircleHome = null;
      // ⚠️ NE PAS revoke les blob URLs ici : elles sont dans _planDataCache
      // et seront réutilisées si on re-mount le widget (perf). Revoke
      // uniquement au unload page (auto).
    }

    _mapInstance = L.map(mapDiv, {
      worldCopyJump: false,
      attributionControl: false, // mention compacte via footer custom
      zoomControl: true,
      preferCanvas: true
    }).setView([46.5, 2.5], 5);

    L.tileLayer(OSM_TILE_URL, {
      maxZoom: OSM_MAX_ZOOM,
      attribution: OSM_ATTR,
      crossOrigin: true
    }).addTo(_mapInstance);

    _markerLayer = L.featureGroup().addTo(_mapInstance);
    _tilesLayer  = L.layerGroup().addTo(_mapInstance); // 🆕 v1.40.6 (en premier = en dessous des data)
    _dataLayer   = L.layerGroup().addTo(_mapInstance); // 🆕 v1.40.4 (au dessus des tuiles)
    _renderGeorefMarkers(georef);
    // 🐛 v1.40.40-41 — KARMA : « les tuiles OSM ne se chargent pas au boot ».
    // Cause racine : Leaflet calcule la taille du container AVANT que le DOM
    // soit stable (HOME se rend progressivement, container `#ktaOsmHomeMap`
    // pas encore dimensionné). v1.40.40 avait ajouté raf + setTimeout 250ms,
    // suffisant sur PC mais PAS sur mobile (DOM lent, CSS différé, PWA cold
    // cache → dimensions stables seulement après 500ms-1.5s).
    //
    // v1.40.41 — Mobile fix : combine 3 stratégies redondantes
    //   1. requestAnimationFrame : tentative immédiate après le prochain paint
    //   2. ResizeObserver : invalide CHAQUE fois que le container change de
    //      dimensions (la vraie solution sémantique). Auto-disconnect après
    //      3 invalidations ou 5 sec (évite leak Observer).
    //   3. Multi-timeouts safety net : 100ms, 500ms, 1500ms — couvre tous les
    //      cas où le ResizeObserver ne se déclenche pas (déjà stable mais
    //      Leaflet avait raté son calcul initial à l'instanciation).
    function _safeInvalidate() {
      if (_mapInstance) { try { _mapInstance.invalidateSize(); } catch(e) {} }
    }
    requestAnimationFrame(_safeInvalidate);
    setTimeout(_safeInvalidate, 100);
    setTimeout(_safeInvalidate, 500);
    setTimeout(_safeInvalidate, 1500);
    // ResizeObserver : réagit aux vrais changements de dimensions du container.
    // Sémantiquement la solution la plus propre (vs polling aveugle).
    if (typeof ResizeObserver !== "undefined") {
      let nInvalidations = 0;
      const ro = new ResizeObserver(function() {
        _safeInvalidate();
        nInvalidations++;
        if (nInvalidations >= 3) {
          try { ro.disconnect(); } catch(_) {}
        }
      });
      try { ro.observe(mapDiv); } catch(_) {}
      // Safety cleanup après 5 sec si l'observer continue de trigger.
      setTimeout(function() { try { ro.disconnect(); } catch(_) {} }, 5000);
    }
    // 🆕 v1.40.4 — Lance l'extraction ZIP partielle async pour les data
    // embedded (POI/Roads/Zones/Structures). Si le ZIP est inaccessible
    // (plan serveur, blob purgé…), le widget reste OK avec juste les
    // markers georef (= comportement v1.40.0-3).
    if (_selectedPlanId) {
      _loadPlanDataForPreview(_selectedPlanId).then(function(data) {
        if (!data) return;
        // 🆕 v1.40.6 — Render tuiles V2 EN PREMIER (sous les data layers)
        if (data.tilesOverview) _renderTilesOnMiniMap(data.tilesOverview, georef);
        _renderDataLayersOnMiniMap(data, georef);
        // 🆕 v1.40.17 — Render chips tags (filtre)
        _renderTagChips(data);
      });
    }
  }

  function _renderGeorefMarkers(georef) {
    if (!_mapInstance || !_isValidGeoref(georef)) return;
    if (_markerLayer) _markerLayer.clearLayers();

    const llA = L.latLng(georef.pointA.lat, georef.pointA.lng);
    const llB = L.latLng(georef.pointB.lat, georef.pointB.lng);

    // 🆕 v1.40.24 — KARMA : « en OSM on a a l'affichage le calibrage point A
    // point B en pointillé, je ne veux pas le voir a l'écran ». On supprime
    // les 2 circle markers visuels + la polyline pointillée jaune qui
    // chargeaient inutilement la mini-carte (les vraies data POI/Roads/Zones/
    // Structures + tuiles V2 sont déjà rendues depuis v1.40.4-6). Le
    // _markerLayer existe encore (= layerGroup vide) pour ne pas casser
    // d'autres call-sites éventuels.

    // FitBounds direct sur [A, B] (calcul indépendant du rendu visuel)
    try {
      const bounds = L.latLngBounds([llA, llB]);
      if (bounds && bounds.isValid()) {
        _mapInstance.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      }
    } catch(e) {
      console.warn("[OsmHomePreview] fitBounds échec :", e);
    }
  }

  // =========================
  // 🆕 v1.40.4 — EXTRACTION ZIP PARTIELLE (POI + Roads + Zones + Structures)
  // =========================

  // Récupère le File du ZIP d'un plan via FS handle (Chrome/Edge desktop)
  // OU IDB blob (mobile/Firefox/Safari). Retourne null si pas dispo (plan
  // serveur sans cache local, blob purgé, permission refusée…).
  async function _getPlanZipFile(planId) {
    if (!window.PlanRegistry) return null;
    // 1. Tentative FS Access handle
    try {
      const meta = await window.PlanRegistry.getHandle(planId);
      if (meta && meta.handle && typeof meta.handle.getFile === "function") {
        const ok = await window.PlanRegistry.ensureHandlePermission(meta.handle);
        if (ok) return await meta.handle.getFile();
      }
    } catch(e) {
      console.warn("[OsmHomePreview] FS handle échec :", e);
    }
    // 2. Fallback IDB blob
    try {
      const blob = await window.PlanRegistry.getBlob(planId);
      if (blob) return blob;
    } catch(e) {
      console.warn("[OsmHomePreview] IDB blob échec :", e);
    }
    return null;
  }

  // Extraction partielle ZIP : plan-config.json + chaque dataLayer JSON.
  // Cache RAM par planId. Returns null si extraction impossible.
  async function _loadPlanDataForPreview(planId) {
    if (_planDataCache[planId]) return _planDataCache[planId];
    if (typeof window.JSZip === "undefined") {
      console.warn("[OsmHomePreview] JSZip indisponible, abandon data extraction");
      return null;
    }
    const file = await _getPlanZipFile(planId);
    if (!file) {
      console.log("[OsmHomePreview] ZIP non récupérable pour planId=" + planId + " (FS handle absent + IDB blob purgé)");
      return null;
    }
    try {
      const tDebut = Date.now();
      const zip = await window.JSZip.loadAsync(file);
      // 1. plan-config.json
      const cfgEntry = zip.file("plan-config.json");
      if (!cfgEntry) { console.warn("[OsmHomePreview] plan-config.json absent"); return null; }
      const cfgText = await cfgEntry.async("string");
      const config  = JSON.parse(cfgText);
      // 2. Pour chaque dataLayer : extract son JSON
      const dataLayers = [];
      if (config.dataLayers && Array.isArray(config.dataLayers)) {
        for (const layerCfg of config.dataLayers) {
          if (!layerCfg || !layerCfg.file) continue;
          // Le chemin peut être absolu ou relatif à data/, on essaie les 2
          const entry = zip.file(layerCfg.file)
                     || zip.file("data/" + layerCfg.file)
                     || zip.file(layerCfg.file.replace(/^\.?\//, ""));
          if (!entry) {
            console.warn("[OsmHomePreview] dataLayer file absent :", layerCfg.file);
            continue;
          }
          try {
            const txt  = await entry.async("string");
            const json = JSON.parse(txt);
            // 🐛 v1.40.5 — Le format réel des data layer JSON utilise les
            // clés `data` ou `editorPoints` pour les POI (cf
            // utils.js > normaliserPoints). v1.40.4 lisait `json.points`
            // qui n'existait pas → 0 POI à chaque render. Cause racine :
            // mauvaise hypothèse sur le format JSON.
            //   - json.data         → format embedded standard (createConf.js)
            //   - json.editorPoints → format mkmsession export (sessionExporter)
            // Fallback `json.points` gardé par sécurité au cas où un plan
            // 3rd party l'utiliserait.
            const poiArray = Array.isArray(json.data)         ? json.data
                           : Array.isArray(json.editorPoints) ? json.editorPoints
                           : Array.isArray(json.points)       ? json.points
                           : [];
            dataLayers.push({
              name:       layerCfg.label || layerCfg.id || layerCfg.file,
              visible:    layerCfg.visible !== false,
              points:     poiArray,
              roads:      Array.isArray(json.roads)      ? json.roads      : [],
              zones:      Array.isArray(json.zones)      ? json.zones      : [],
              structures: Array.isArray(json.structures) ? json.structures : []
            });
          } catch(e) {
            console.warn("[OsmHomePreview] dataLayer parse échec :", layerCfg.file, e);
          }
        }
      }
      // 🆕 v1.40.6 — Extraction des tuiles V2 overview (z=minNativeZoom)
      // si le plan est tuilé. Crée des blob URLs trackés pour cleanup.
      // Skip silencieux si plan V1 (pas de tiledV2 dans le config).
      let tilesOverview = null;
      try {
        tilesOverview = await _extractV2TilesOverview(zip, config);
      } catch(e) {
        console.warn("[OsmHomePreview] tiles overview extraction échec :", e);
      }
      // 🆕 v1.40.13 — Extraction des icônes POI (config.icons + TAGS_BUILTIN_HOME)
      let iconUrls = {};
      try {
        iconUrls = await _extractIcons(zip, config);
      } catch(e) {
        console.warn("[OsmHomePreview] icons extraction échec :", e);
      }
      const result = { config: config, dataLayers: dataLayers, tilesOverview: tilesOverview, iconUrls: iconUrls };
      _planDataCache[planId] = result;
      console.log("[OsmHomePreview] Plan data extrait (" + (Date.now() - tDebut) + " ms) — " +
        dataLayers.length + " dataLayer(s) parsés" +
        (tilesOverview ? " + " + tilesOverview.tiles.length + " tuile(s) V2" : " (plan V1, pas de tuiles)") +
        " pour planId=" + planId);
      return result;
    } catch(e) {
      console.warn("[OsmHomePreview] _loadPlanDataForPreview échec :", e);
      return null;
    }
  }

  // 🆕 v1.40.13 — Extraction des icônes POI du ZIP.
  // Source 1 : config.icons (mapping tag → fichier dans le ZIP, défini par
  //            le user via le générateur)
  // Source 2 : TAGS_BUILTIN_HOME (fallback pour les tags standard cataphile
  //            non-overridés dans config.icons, mais dont le fichier
  //            icon/<tag>.png est probablement présent dans le ZIP)
  // Cache RAM via blob URLs trackés dans _iconBlobUrls.
  // 🆕 v1.40.16 — Approche hybride suite diag KARMA v1.40.15 :
  //
  // Diagnostic v1.40.14/15 a montré que les chemins type "lib/leaflet/..."
  // et "icon/house.png" sont des URLs relatives vers les **icônes de l'app**
  // (servies par le serveur web), PAS des fichiers stockés dans le ZIP.
  // Le générateur n'inclut dans le ZIP que les icônes **custom** uploadées
  // par l'user (`iconFolder.file(name, ...)` cf createConf.js:2770).
  //
  // Stratégie v1.40.16 :
  //   1. Si le chemin existe dans le ZIP → extract blob URL (custom user)
  //   2. Sinon → utiliser le path tel quel comme URL relative (le browser
  //      le résoudra vers `<origin>/<path>` qui est servi par le SW
  //      MyKTAMap = icône app cachée)
  //
  // Avantages :
  //   - Plus besoin d'inclure les icônes builtin dans chaque ZIP
  //   - Cohérence stricte avec getIconUrlForPoint (utils.js:38) qui retourne
  //     aussi des URLs relatives
  //   - Cache SW déjà actif sur ces URLs → load instantané
  async function _extractIcons(zip, config) {
    const iconUrls = {};
    let nFromZip = 0, nFromApp = 0;
    async function _resolveIcon(tag, path) {
      if (!path) return;
      // 1. Tentative extraction ZIP (icône custom user)
      let entry = zip.file(path) || zip.file(path.replace(/^\.?\//, ""));
      if (!entry && path.includes("/")) {
        const filename = path.split("/").pop();
        entry = zip.file("icon/" + filename);
      }
      if (entry) {
        try {
          const blob = await entry.async("blob");
          const url  = URL.createObjectURL(blob);
          iconUrls[tag] = url;
          _iconBlobUrls.push(url);
          nFromZip++;
          return;
        } catch(e) { /* fall through to URL relative */ }
      }
      // 2. Fallback URL relative app : le browser résoudra vers <origin>/<path>
      // (= icône MyKTAMap servie via SW, cachée donc instant)
      iconUrls[tag] = path.replace(/^\.\//, "");
      nFromApp++;
    }
    // 1. config.icons (priorité, peut overrider les builtins)
    if (config && config.icons && typeof config.icons === "object") {
      for (const tag in config.icons) {
        await _resolveIcon(tag, config.icons[tag]);
      }
    }
    // 2. TAGS_BUILTIN_HOME (fallback non-overridé)
    for (const tag in TAGS_BUILTIN_HOME) {
      if (iconUrls[tag]) continue; // déjà overridé par config.icons
      await _resolveIcon(tag, TAGS_BUILTIN_HOME[tag]);
    }
    // 3. Default fallback Leaflet marker (au cas où POI sans tag)
    if (!iconUrls.default) {
      iconUrls.default = "lib/leaflet/images/marker-icon.png";
    }
    console.log("[OsmHomePreview] Icons résolus : " + Object.keys(iconUrls).length + " tag(s) (" + nFromZip + " depuis ZIP custom · " + nFromApp + " depuis URLs app)");
    return iconUrls;
  }

  // Construit la projection plan→OSM via georef (KmzExport.buildTransform).
  // Pattern identique à osmView.js > _buildProjection.
  function _buildProjection(georef) {
    if (!georef || !window.KmzExport || typeof window.KmzExport.buildTransform !== "function") return null;
    const pA = georef.pointA, pB = georef.pointB;
    let t;
    try {
      t = window.KmzExport.buildTransform(
        { x: pA.x, y: pA.y }, { x: pB.x, y: pB.y },
        { lat: pA.lat, lng: pA.lng }, { lat: pB.lat, lng: pB.lng }
      );
    } catch(e) { console.warn("[OsmHomePreview] buildTransform échec :", e); return null; }
    return {
      planToLatLng: function(x, y) {
        const g = window.KmzExport.planToGps(t, x, y);
        return g ? L.latLng(g.lat, g.lng) : null;
      }
    };
  }

  // Projette un array de points {x,y} en latlngs OSM (skip silencieux les invalides).
  function _projectPoints(points, proj) {
    const out = [];
    for (const p of points) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      const ll = proj.planToLatLng(p.x, p.y);
      if (ll) out.push(ll);
    }
    return out;
  }

  // Rendu des data layers embedded sur la mini-carte HOME.
  // POI → L.circleMarker (perf > cohérence visuelle stricte, pas d'icônes images)
  // Roads → L.polyline avec road.color
  // Zones → L.polygon avec zone.color + fillColor
  // Structures → polyline (fronts) ou polygon (mur/pilier)
  // 🔧 v1.40.12 — Refactor : chaque catégorie va dans son propre sub-layerGroup
  // pour permettre les toggles individuels via add/removeLayer. Pattern aligné
  // sur osmView.js modale (5 layers indépendants par catégorie).
  function _renderDataLayersOnMiniMap(data, georef) {
    if (!_mapInstance) return;
    if (!_dataLayer)      _dataLayer      = L.layerGroup().addTo(_mapInstance);
    if (!_poiSubLayer)    _poiSubLayer    = L.layerGroup();
    if (!_roadsSubLayer)  _roadsSubLayer  = L.layerGroup();
    if (!_zonesSubLayer)  _zonesSubLayer  = L.layerGroup();
    if (!_structSubLayer) _structSubLayer = L.layerGroup();
    _poiSubLayer.clearLayers();
    _roadsSubLayer.clearLayers();
    _zonesSubLayer.clearLayers();
    _structSubLayer.clearLayers();
    if (!data || !Array.isArray(data.dataLayers)) return;
    const proj = _buildProjection(georef);
    if (!proj) { console.warn("[OsmHomePreview] proj indisponible, skip data render"); return; }

    let nPoi = 0, nRoad = 0, nZone = 0, nStruct = 0;
    let nPoiWithIcon = 0, nPoiFallback = 0; // 🆕 v1.40.14 — diagnostic match icônes
    const unmatchedTags = {}; // tag → count, pour identifier les tags sans icône
    // v1.40.13 — Map des icônes du plan (tag → blob URL)
    const iconUrls = data.iconUrls || {};
    // Cache des L.icon Leaflet pour éviter de recréer le même objet à chaque POI
    const iconCache = {};
    function _getOrBuildIcon(tag) {
      if (iconCache[tag]) return iconCache[tag];
      const url = iconUrls[tag];
      if (!url) return null;
      iconCache[tag] = L.icon({
        iconUrl:    url,
        iconSize:   [24, 24],
        iconAnchor: [12, 12]
      });
      return iconCache[tag];
    }

    for (const layer of data.dataLayers) {
      if (!layer.visible) continue;

      // POI → _poiSubLayer (v1.40.13 icônes natives + 🆕 v1.40.17 popup + filtre tag)
      const isMultiLevel = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel);
      for (const p of layer.points) {
        if (typeof p.x !== "number" || typeof p.y !== "number") continue;
        const ll = proj.planToLatLng(p.x, p.y);
        if (!ll) continue;
        const tag  = (Array.isArray(p.tags) && p.tags[0]) || "default";
        // 🆕 v1.40.17 — Filtre par tag (skip si tag pas dans le Set actif)
        if (_homeTagFilter && _homeTagFilter.size > 0 && !_homeTagFilter.has(tag)) continue;
        const icon = _getOrBuildIcon(tag) || _getOrBuildIcon("default");
        // 🆕 v1.40.17 — Popup info : nom + tag + niveau (si M-LVL)
        // 🆕 v1.40.25 — Description prééminente (au lieu du tag en ligne 2),
        // tag réduit en petit subtle en dessous pour debug. Cohérent modale.
        const nom  = p.nom || p.label || p.name || window.I18n.t("osm_home.poi.noName");
        const lvl  = (typeof p.level === "number") ? p.level : 0;
        const lvlSfx = isMultiLevel ? window.I18n.t("osm_home.poi.levelSuffix", { lvl: lvl }) : '';
        const desc = (p.description || "").trim();
        const popupHtml =
          '<div style="font-size:13px; min-width:140px; max-width:260px;">' +
            '<b>' + _escapeHtml(nom) + '</b><br>' +
            '<span style="color:#c8d0e0; font-size:12px;">' +
              (desc ? _escapeHtml(desc) : _escapeHtml(tag)) + lvlSfx +
            '</span>' +
            (desc ? '<br><span style="color:#8892a4; font-size:10.5px; opacity:0.75;">🏷️ ' + _escapeHtml(tag) + '</span>' : '') +
          '</div>';
        let marker;
        if (icon) {
          marker = L.marker(ll, { icon: icon, interactive: true });
          nPoiWithIcon++;
        } else {
          marker = L.circleMarker(ll, {
            radius: 4, color: "#fff", weight: 1,
            fillColor: "#f4c542", fillOpacity: 0.85, interactive: true
          });
          nPoiFallback++;
          unmatchedTags[tag] = (unmatchedTags[tag] || 0) + 1;
        }
        // 🆕 v1.40.22 — autoPan + paddings : Leaflet déplace la map pour que
        // la popup tienne dans la mini-carte (sinon clippée sur petit widget HOME).
        // className "kta-osm-popup" pour appliquer le style charte dark.
        marker.bindPopup(popupHtml, {
          closeButton: true,
          autoClose: true,
          autoPan: true,
          autoPanPaddingTopLeft: L.point(20, 60),
          autoPanPaddingBottomRight: L.point(20, 20),
          maxWidth: 240,
          className: "kta-osm-popup"
        });
        marker.addTo(_poiSubLayer);
        nPoi++;
      }

      // Roads → _roadsSubLayer (🆕 v1.40.37 : cascade couleur complète via
      // _resolveRoadColorHome — explicit r.color > built-in type > custom
      // legend > fallback gris. KARMA : « la couleur des routes... doit
      // persister ». Inclut les types custom (cust-*) définis dans
      // LegendCustomization, à l'identique de la map principale.)
      for (const r of layer.roads) {
        if (!Array.isArray(r.points) || r.points.length < 2) continue;
        if (r.type === "itinerary") continue;
        const lls = _projectPoints(r.points, proj);
        if (lls.length < 2) continue;
        const color = _resolveRoadColorHome(r);
        L.polyline(lls, {
          color: color, weight: 3, opacity: 0.85, interactive: false
        }).addTo(_roadsSubLayer);
        nRoad++;
      }

      // Zones → _zonesSubLayer (🆕 v1.40.37 : idem cascade couleur via
      // _resolveZoneColorsHome — couleurs natives ZONE_STYLES respectées
      // et custom legend persistée.)
      for (const z of layer.zones) {
        if (!Array.isArray(z.points) || z.points.length < 3) continue;
        const lls = _projectPoints(z.points, proj);
        if (lls.length < 3) continue;
        const cols = _resolveZoneColorsHome(z);
        L.polygon(lls, {
          color: cols.stroke, fillColor: cols.fill,
          fillOpacity: (typeof z.fillOpacity === "number") ? z.fillOpacity * 0.7 : 0.25,
          weight: 1.5, opacity: 0.85, interactive: false
        }).addTo(_zonesSubLayer);
        nZone++;
      }

      // Structures → _structSubLayer (adaptatif polyline/polygon)
      for (const s of layer.structures) {
        if (!Array.isArray(s.points)) continue;
        const style = STRUCT_STYLES_HOME[s.type] || STRUCT_STYLES_HOME["mur"];
        const polyline = style.isPolyline;
        const minPts = polyline ? 2 : 3;
        if (s.points.length < minPts) continue;
        const lls = _projectPoints(s.points, proj);
        if (lls.length < minPts) continue;
        if (polyline) {
          L.polyline(lls, { color: style.color, weight: style.weight, opacity: style.opacity, interactive: false }).addTo(_structSubLayer);
        } else {
          L.polygon(lls, {
            color: style.color, fillColor: style.fillColor,
            fillOpacity: style.fillOpacity, weight: style.weight, opacity: 1, interactive: false
          }).addTo(_structSubLayer);
        }
        nStruct++;
      }
    }
    // Add sub-layers selon les toggles utilisateur
    if (_showPoi)        _dataLayer.addLayer(_poiSubLayer);
    if (_showRoads)      _dataLayer.addLayer(_roadsSubLayer);
    if (_showZones)      _dataLayer.addLayer(_zonesSubLayer);
    if (_showStructures) _dataLayer.addLayer(_structSubLayer);
    console.log("[OsmHomePreview] Data render :", nPoi, "POI ·", nRoad, "roads ·", nZone, "zones ·", nStruct, "struct");
    // 🆕 v1.40.14 — Diagnostic icônes : combien matchent vs fallback + top tags non-matchés
    if (nPoi > 0) {
      console.log("[OsmHomePreview] POI icônes : " + nPoiWithIcon + " avec icône · " + nPoiFallback + " fallback cercle");
      const unmatched = Object.keys(unmatchedTags);
      if (unmatched.length > 0) {
        const sorted = unmatched.sort(function(a, b) { return unmatchedTags[b] - unmatchedTags[a]; });
        const top    = sorted.slice(0, 10).map(function(t) { return t + "(" + unmatchedTags[t] + ")"; });
        // 🆕 v1.40.15 — console.log au lieu de console.warn (idem extract)
        console.log("[OsmHomePreview] ⚠️ Tags POI sans icône : " + top.join(" · ") + (sorted.length > 10 ? " (+" + (sorted.length - 10) + ")" : ""));
      }
    }
  }

  // 🆕 v1.40.12 — Toggles par catégorie (add/removeLayer du sub-group)
  function _toggleTiles(visible) {
    _showTiles = !!visible;
    if (!_tilesLayer || !_mapInstance) return;
    if (_showTiles)  { if (!_mapInstance.hasLayer(_tilesLayer)) _mapInstance.addLayer(_tilesLayer); }
    else             { if  (_mapInstance.hasLayer(_tilesLayer)) _mapInstance.removeLayer(_tilesLayer); }
  }
  function _togglePoi(visible) {
    _showPoi = !!visible;
    if (!_poiSubLayer || !_dataLayer) return;
    if (_showPoi) { if (!_dataLayer.hasLayer(_poiSubLayer)) _dataLayer.addLayer(_poiSubLayer); }
    else          { if  (_dataLayer.hasLayer(_poiSubLayer)) _dataLayer.removeLayer(_poiSubLayer); }
  }
  function _toggleRoads(visible) {
    _showRoads = !!visible;
    if (!_roadsSubLayer || !_dataLayer) return;
    if (_showRoads) { if (!_dataLayer.hasLayer(_roadsSubLayer)) _dataLayer.addLayer(_roadsSubLayer); }
    else            { if  (_dataLayer.hasLayer(_roadsSubLayer)) _dataLayer.removeLayer(_roadsSubLayer); }
  }
  function _toggleZones(visible) {
    _showZones = !!visible;
    if (!_zonesSubLayer || !_dataLayer) return;
    if (_showZones) { if (!_dataLayer.hasLayer(_zonesSubLayer)) _dataLayer.addLayer(_zonesSubLayer); }
    else            { if  (_dataLayer.hasLayer(_zonesSubLayer)) _dataLayer.removeLayer(_zonesSubLayer); }
  }
  function _toggleStructures(visible) {
    _showStructures = !!visible;
    if (!_structSubLayer || !_dataLayer) return;
    if (_showStructures) { if (!_dataLayer.hasLayer(_structSubLayer)) _dataLayer.addLayer(_structSubLayer); }
    else                 { if  (_dataLayer.hasLayer(_structSubLayer)) _dataLayer.removeLayer(_structSubLayer); }
  }

  // 🆕 v1.40.21 — Bbox GPS du plan sélectionné (4 coins projetés via la georef).
  // Utilisée pour le garde-fou "GPS hors champ du plan" du bouton 📍 widget HOME.
  function _getPlanGpsBboxHome() {
    if (!_selectedPlanId) return null;
    const data = _planDataCache[_selectedPlanId];
    if (!data || !data.config || !data.config.plan) return null;
    const w = data.config.plan.imageWidth, h = data.config.plan.imageHeight;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    const plans = _listGeorefPlans();
    const sel = plans.find(function(p) { return p.id === _selectedPlanId; });
    if (!sel || !sel.georef) return null;
    const proj = _buildProjection(sel.georef);
    if (!proj) return null;
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

  function _haversineKmHome(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = function(d) { return d * Math.PI / 180; };
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // 🆕 v1.40.18 — Fix GPS ponctuel sur le widget HOME (1 clic = 1 fix).
  // Browser API native, 0 stockage, 0 réseau, permission OS demandée à la demande.
  // 🆕 v1.40.19 — Garde runtime strict offline / incognito (parité OsmView).
  function _showMyGpsPositionHome() {
    if (!_mapInstance) return;
    if (_isStrictOfflineOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("osm_home.gps.strictToast"), "warn");
      } else { alert(window.I18n.t("osm_home.gps.strictAlert")); }
      return;
    }
    if (_isIncognitoOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("osm_home.gps.incognitoToast"), "warn");
      } else { alert(window.I18n.t("osm_home.gps.incognitoAlert")); }
      return;
    }
    if (!navigator.geolocation) {
      alert(window.I18n.t("osm_home.gps.unavailable"));
      return;
    }
    const btn = document.getElementById("ktaOsmHomeMyGpsBtn");
    const originalHtml = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳"; }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 0;
        // 🆕 v1.40.21 — Garde-fou "hors champ du plan" : refus si fix GPS très
        // loin du plan sélectionné (>50% au-delà de la bbox plan). UX + privacy.
        const bbox = _getPlanGpsBboxHome();
        if (bbox) {
          const padded = bbox.pad(0.5);
          if (!padded.contains([lat, lng])) {
            const center = bbox.getCenter();
            const distKm = _haversineKmHome(lat, lng, center.lat, center.lng);
            const msg = window.I18n.t("osm_home.gps.outOfBounds", { km: distKm.toFixed(1) });
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(msg, "warn");
            } else { alert(msg); }
            console.log("[OsmHomePreview] GPS rejeté : hors bbox plan (",
                        lat.toFixed(5), ",", lng.toFixed(5),
                        "→ distance centre", distKm.toFixed(2), "km)");
            if (btn && originalHtml != null) { btn.disabled = false; btn.innerHTML = originalHtml; }
            return;
          }
        }
        try {
          if (_myGpsMarkerHome && _mapInstance.hasLayer(_myGpsMarkerHome)) _mapInstance.removeLayer(_myGpsMarkerHome);
        } catch(e) {}
        try {
          if (_myGpsAccuracyCircleHome && _mapInstance.hasLayer(_myGpsAccuracyCircleHome)) _mapInstance.removeLayer(_myGpsAccuracyCircleHome);
        } catch(e) {}
        if (acc > 20) {
          _myGpsAccuracyCircleHome = L.circle([lat, lng], {
            radius: acc, color: "#00d4ff", weight: 1,
            fillColor: "#00d4ff", fillOpacity: 0.10, interactive: false
          }).addTo(_mapInstance);
        }
        _myGpsMarkerHome = L.circleMarker([lat, lng], {
          radius: 7, color: "#ffffff", weight: 2,
          fillColor: "#00d4ff", fillOpacity: 0.95
        }).addTo(_mapInstance);
        _myGpsMarkerHome.bindPopup(
          '<div style="font-size:13px; min-width:140px;">' +
            '<b>' + window.I18n.t("osm_home.gps.popupTitle") + '</b><br>' +
            '<span style="font-size:11.5px; color:#8892a4;">' +
              lat.toFixed(5) + ", " + lng.toFixed(5) + '<br>' +
              window.I18n.t("osm_home.gps.accuracy", { acc: Math.round(acc) }) +
            '</span>' +
          '</div>',
          { closeButton: true, autoClose: true }
        ).openPopup();
        const targetZoom = Math.max(_mapInstance.getZoom(), 17);
        _mapInstance.setView([lat, lng], targetZoom);
        if (btn && originalHtml != null) { btn.disabled = false; btn.innerHTML = originalHtml; }
        console.log("[OsmHomePreview] GPS fix :", lat.toFixed(5), lng.toFixed(5), "±" + Math.round(acc) + "m");
      },
      function(err) {
        console.warn("[OsmHomePreview] GPS err :", err);
        let msg = window.I18n.t("osm_home.gps.errGeneric");
        if (err.code === 1) msg = window.I18n.t("osm_home.gps.errPermission");
        else if (err.code === 2) msg = window.I18n.t("osm_home.gps.errUnavailable");
        else if (err.code === 3) msg = window.I18n.t("osm_home.gps.errTimeout");
        alert(msg);
        if (btn && originalHtml != null) { btn.disabled = false; btn.innerHTML = originalHtml; }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  // 🆕 v1.40.17 — Énumération des tags présents dans les data layers
  // (avec compteur de POI par tag pour tri par fréquence).
  function _collectAvailableTags(data) {
    const counts = {};
    if (!data || !Array.isArray(data.dataLayers)) return counts;
    for (const layer of data.dataLayers) {
      if (!Array.isArray(layer.points)) continue;
      for (const p of layer.points) {
        const tag = (Array.isArray(p.tags) && p.tags[0]) || "default";
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }

  // Rendu de la ligne de chips tag (filtre par tag) dans le bandeau.
  // Click → toggle in/out du Set _homeTagFilter + re-render data layers.
  function _renderTagChips(data) {
    const cont = document.getElementById("ktaOsmHomeTagChips");
    if (!cont) return;
    const counts = _collectAvailableTags(data);
    const tags   = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
    if (tags.length === 0) {
      cont.parentNode.style.display = "none";
      return;
    }
    cont.parentNode.style.display = "";
    const isAllActive = !_homeTagFilter || _homeTagFilter.size === 0;
    let html = '<button class="kta-osm-home-tag-chip' + (isAllActive ? " active" : "") + '" data-tag="__all__" title="' + _escapeHtml(window.I18n.t("osm_home.tagchip.allTitle")) + '">' + _escapeHtml(window.I18n.t("osm_home.tagchip.all")) + '</button>';
    for (const t of tags) {
      const active = isAllActive || (_homeTagFilter && _homeTagFilter.has(t));
      html += '<button class="kta-osm-home-tag-chip' + (active ? " active" : "") + '" data-tag="' + _escapeHtml(t) + '" title="' + _escapeHtml(window.I18n.t("osm_home.tagchip.count", { count: counts[t] })) + '">' + _escapeHtml(t) + '</button>';
    }
    cont.innerHTML = html;
    // Bind clicks
    const buttons = cont.querySelectorAll(".kta-osm-home-tag-chip");
    buttons.forEach(function(btn) {
      btn.addEventListener("click", function() {
        const tag = btn.dataset.tag;
        if (tag === "__all__") {
          _homeTagFilter = null; // reset
        } else {
          if (!_homeTagFilter) _homeTagFilter = new Set();
          if (_homeTagFilter.has(tag)) _homeTagFilter.delete(tag);
          else _homeTagFilter.add(tag);
          if (_homeTagFilter.size === 0) _homeTagFilter = null;
        }
        // Re-render avec le nouveau filtre + re-render chips pour refléter l'état
        const planData = _selectedPlanId ? _planDataCache[_selectedPlanId] : null;
        if (planData) {
          const plans = _listGeorefPlans();
          const sel = plans.find(function(p) { return p.id === _selectedPlanId; });
          if (sel) {
            _renderDataLayersOnMiniMap(planData, sel.georef);
            _renderTagChips(planData);
          }
        }
      });
    });
  }

  // =========================
  // 🆕 v1.40.6 — TUILES V2 OVERVIEW (image plan sur OSM)
  // =========================

  // 🆕 v1.40.7 / 🔧 v1.40.10 — Heuristique de choix du niveau de tuiles.
  // Choisit le niveau le PLUS zoomé (= meilleure résolution) tel que le nombre
  // total de tuiles tient sous MAX_TILES_HOME.
  //
  // KARMA v1.40.6 : "trop flou" → v1.40.7 bump MAX=12 (z=-1 Catacombes ×4).
  // KARMA v1.40.10 : "augmente / comme map" → MAX=40 (Catacombes z=0 natif).
  // KARMA v1.40.11 : "plans très grosse dimension 16K bcp trop dégradé,
  //   augmenter vraiment" → MAX=80. Permet aux plans 16K de monter à z=-2
  //   (8×8=64 tuiles ≤ 80) au lieu de fallback z=-3 (4×4=16 tuiles flou).
  //   Soit ×2 résolution sur les très gros plans.
  //
  // Compromis RAM : 80 tuiles × ~1 MB décodé = ~80 MB max. Toujours sous
  // budget mobile (~500 MB iPhone PWA) car widget HOME isolé. Pour la
  // plupart des plans (Catacombes 4K, plans typiques cataphiles ≤ 8K), on
  // reste à 40-50 tuiles soit ~50 MB.
  //
  // Tableau récap par taille plan avec MAX=80 :
  //   4K  (4000×2251)  : z=0   (8×5  = 40 tuiles) → résolution native ✅
  //   8K  (8000×4500)  : z=-1  (8×5  = 40 tuiles) → scale ×2
  //   12K (12000×8000) : z=-1  (12×8 = 96 trop) → z=-2 (6×4 = 24)
  //   16K (16000×16000): z=-2  (8×8  = 64 tuiles) → scale ×4 (au lieu de
  //                      z=-3 scale ×8 en v1.40.10) ← FIX KARMA
  //
  // Plans EXTRÊMES (32K+) : fallback minNativeZoom si dépasse MAX_TILES
  // même au niveau le plus dézoomé. Flou résiduel accepté pour ces cas.
  function _chooseTileLevelForHome(tiling, planW, planH) {
    const MAX_TILES_HOME = 80;
    const tileSize = tiling.tileSize || 512;
    for (let z = tiling.maxNativeZoom; z >= tiling.minNativeZoom; z--) {
      const scale = Math.pow(2, -z);
      const cols = Math.ceil(Math.ceil(planW / scale) / tileSize);
      const rows = Math.ceil(Math.ceil(planH / scale) / tileSize);
      if (cols * rows <= MAX_TILES_HOME) return z;
    }
    return tiling.minNativeZoom; // fallback safety
  }

  // Extrait les tuiles V2 du niveau adaptatif (cf _chooseTileLevelForHome).
  // Skip silencieux si plan V1 (pas de tiledV2). Crée des blob URLs trackés
  // pour cleanup au close(). Format identique à osmView.js > _renderTilesV2OnOsm.
  async function _extractV2TilesOverview(zip, config) {
    if (!config.plan || config.plan.tiledV2 !== true || !config.tiling) return null;
    const planW    = config.plan.imageWidth  || 1;
    const planH    = config.plan.imageHeight || 1;
    // 🆕 v1.40.7 — Niveau adaptatif (au lieu de minNativeZoom fixe v1.40.6)
    const z        = _chooseTileLevelForHome(config.tiling, planW, planH);
    const scale    = Math.pow(2, -z);
    const tileSize = config.tiling.tileSize || 512;
    const lvlW = Math.ceil(planW / scale);
    const lvlH = Math.ceil(planH / scale);
    const cols = Math.ceil(lvlW / tileSize);
    const rows = Math.ceil(lvlH / tileSize);

    const tiles = [];
    for (let col = 0; col < cols; col++) {
      for (let k = 1; k <= rows; k++) {
        const path  = "data/tiles/z" + z + "/x" + col + "_y" + (-k) + ".jpg";
        const entry = zip.file(path);
        if (!entry) {
          console.warn("[OsmHomePreview] tuile absente :", path);
          continue;
        }
        try {
          const blob = await entry.async("blob");
          const url  = URL.createObjectURL(blob);
          _tilesBlobUrls.push(url); // tracker pour cleanup
          tiles.push({ col: col, k: k, url: url });
        } catch(e) {
          console.warn("[OsmHomePreview] tuile extract échec :", path, e);
        }
      }
    }
    return { tiles: tiles, planW: planW, planH: planH, z: z, scale: scale, tileSize: tileSize };
  }

  // Render des tuiles V2 sur la mini-carte via L.imageOverlay.rotated.
  // Pattern identique à osmView.js > _renderTilesV2OnOsm — convention CRS.Simple
  // pour le flip Y (k=1 = tuile la plus basse = sud).
  function _renderTilesOnMiniMap(tilesData, georef) {
    if (!_mapInstance) return;
    if (!_tilesLayer) _tilesLayer = L.layerGroup().addTo(_mapInstance);
    _tilesLayer.clearLayers();
    if (!tilesData || !Array.isArray(tilesData.tiles) || tilesData.tiles.length === 0) return;
    if (!L.imageOverlay || !L.imageOverlay.rotated) {
      console.warn("[OsmHomePreview] L.imageOverlay.rotated indisponible (lib pas chargée)");
      return;
    }
    const proj = _buildProjection(georef);
    if (!proj) return;

    const planH    = tilesData.planH;
    const scale    = tilesData.scale;
    const tileSize = tilesData.tileSize;

    let rendered = 0;
    for (const t of tilesData.tiles) {
      // Bounds pixel dans le plan source (top-left origin pour Y)
      // Convention CRS.Simple : k=1 = tuile la plus basse → flip Y :
      const pxLeft   = t.col * tileSize * scale;
      const pxRight  = (t.col + 1) * tileSize * scale;
      const pxTop    = planH - t.k * tileSize * scale;
      const pxBottom = planH - (t.k - 1) * tileSize * scale;

      const tl = proj.planToLatLng(pxLeft,  pxTop);
      const tr = proj.planToLatLng(pxRight, pxTop);
      const bl = proj.planToLatLng(pxLeft,  pxBottom);
      if (!tl || !tr || !bl) continue;

      try {
        const overlay = L.imageOverlay.rotated(t.url, tl, tr, bl, {
          interactive: false,
          opacity: _planOpacity
        });
        overlay.addTo(_tilesLayer);
        rendered++;
      } catch(e) {
        console.warn("[OsmHomePreview] tile overlay :", e);
      }
    }
    console.log("[OsmHomePreview] Tiles V2 : " + rendered + " tuile(s) rendues à z=" + tilesData.z + " (scale x" + scale + ")");
  }

  // Met à jour l'opacité des tuiles plan (slider bandeau).
  // N'affecte pas les data layers (qui ont leur propre fillOpacity native).
  function _setPlanOpacity(opacity) {
    _planOpacity = Math.max(0, Math.min(1, opacity));
    if (!_tilesLayer) return;
    _tilesLayer.eachLayer(function(l) {
      try {
        if (typeof l.setOpacity === "function") l.setOpacity(_planOpacity);
        else if (l._image) l._image.style.opacity = String(_planOpacity);
      } catch(e) {}
    });
  }

  // Cleanup blob URLs des tuiles (libère la RAM).
  // Appelé au close() ET avant chaque nouvelle extraction si plan changé.
  function _revokeTilesBlobUrls() {
    for (const url of _tilesBlobUrls) {
      try { URL.revokeObjectURL(url); } catch(e) {}
    }
    _tilesBlobUrls = [];
  }

  // =========================
  // 🆕 v1.40.2 — TOGGLE PLEIN ÉCRAN INLINE
  // =========================
  // Refonte sémantique : ⛶ N'OUVRE PLUS la modale OsmView (= ne bascule
  // pas en map mode). À la place : agrandit la mini-carte HOME en overlay
  // plein-viewport via toggle de classe CSS sur #ktaOsmHomeBox.
  // Avantages : flow simple, marche dans tous les cas, pas de hook fragile.
  //
  // L'ancien flow (sessionStorage + simulation clic + auto-open) est retiré
  // car les sélecteurs HTML étaient faux (data-plan-id n'existe pas, le
  // HTML utilise data-id, et la classe est .plan-row-load pas .plan-row-load-btn).
  function openFullScreen() {
    _isFullscreen = !_isFullscreen;
    const box = document.getElementById("ktaOsmHomeBox");
    if (!box) return;
    if (_isFullscreen) {
      box.classList.add("kta-osm-home-fullscreen-active");
      document.body.classList.add("kta-osm-home-fs-lock");
      // Escape pour réduire
      _fsEscapeHandler = function(e) {
        if (e.key === "Escape" || e.key === "Esc") {
          if (_isFullscreen) openFullScreen();
        }
      };
      document.addEventListener("keydown", _fsEscapeHandler);
    } else {
      box.classList.remove("kta-osm-home-fullscreen-active");
      document.body.classList.remove("kta-osm-home-fs-lock");
      if (_fsEscapeHandler) {
        document.removeEventListener("keydown", _fsEscapeHandler);
        _fsEscapeHandler = null;
      }
    }
    // Update icône bouton (⛶ ↔ ✕)
    const btn = document.getElementById("ktaOsmHomeFullBtn");
    if (btn) {
      btn.textContent = _isFullscreen ? "✕" : "⛶";
      btn.title = _isFullscreen
        ? window.I18n.t("osm_home.fullscreen.exitTitle")
        : window.I18n.t("osm_home.fullscreen.enterTitle");
    }
    // Leaflet : recalc size après que le DOM ait appliqué la transition
    // (sinon les tuiles ne couvrent que l'ancienne zone visible).
    setTimeout(function() {
      if (_mapInstance) try { _mapInstance.invalidateSize(); } catch(e) {}
    }, 100);
  }

  // =========================
  // API PUBLIQUE
  // =========================
  function mount() {
    const container = document.getElementById("ktaOsmHomeContent");
    if (!container) return; // pas en HOME, abort silencieux

    // 🆕 v1.40.1 — Avant tout : restore la colonne (au cas où un mount
    // précédent l'aurait masquée et qu'on rebascule en opt-in ON).
    _setOsmColumnVisible(true);

    // Cas 1 : pas opt-in OSM → masque la colonne (cf _setOsmColumnVisible)
    if (!_isOptedIn()) {
      _renderOptInNeeded(container);
      return;
    }
    // 🆕 v1.40.19 — Cas 1bis : strict offline → message dédié, bloque tout
    if (_isStrictOfflineOn()) {
      _renderStrictOffline(container);
      return;
    }
    // 🆕 v1.40.19 — Cas 1ter : incognito → idem (pas de leak metadata plan)
    if (_isIncognitoOn()) {
      _renderIncognito(container);
      return;
    }
    // Cas 2 : hors-ligne → message UNIQUEMENT si aucun cache OSM n'existe
    // pour aucun plan (v1.43.3). Si au moins 1 tuile cachée → on laisse le
    // widget se monter, selectPlan() arbitrera plan par plan (overlay
    // dédié pour les plans non cachés).
    if (!_isOnline()) {
      // Refresh async la flag _anyCachePresent (fire-and-forget — si elle
      // devient true, _refreshAnyCachePresent appelle refresh() qui re-monte
      // le widget automatiquement).
      _refreshAnyCachePresent();
      if (!_anyCachePresent) {
        _renderOffline(container);
        return;
      }
    }
    // Cas 3 : aucun plan georef → message pédagogique
    const plans = _listGeorefPlans();
    if (plans.length === 0) {
      _renderNoGeorefPlans(container);
      return;
    }
    // Cas 4 : widget complet — choix initial = lastSelected OU lastOpened
    let initialId = _getLastSelectedFromLs();
    if (!initialId || !plans.find(function(p) { return p.id === initialId; })) {
      // Fallback : 1er plan (= lastOpened car liste triée desc)
      initialId = plans[0].id;
    }
    _renderWidget(container, plans, initialId);
  }

  function refresh() { mount(); }

  function selectPlan(planId) {
    if (!planId) return;
    _selectedPlanId = planId;
    const plans = _listGeorefPlans();
    const sel = plans.find(function(p) { return p.id === planId; });
    if (!sel) return;
    _saveLastSelected(planId);
    _renderGeorefMarkers(sel.georef);
    // 🆕 v1.43.3 — Si offline, vérifier si ce plan a des tuiles cachées.
    // Si non → overlay « ce plan n'est pas caché offline ». Si oui → render
    // normal (les tuiles seront servies par le SW depuis IDB).
    _maybeShowNotCachedOverlay(planId, sel.georef);
    // 🆕 v1.40.4 — Charge les data du nouveau plan + render
    _loadPlanDataForPreview(planId).then(function(data) {
      // Garde anti-race : si l'user a re-sélectionné un autre plan pendant
      // l'extraction (async), on skip le render (le nouveau triggera son
      // propre rendu via cette même fonction).
      if (planId !== _selectedPlanId) return;
      if (!data) return;
      // 🆕 v1.40.6 — Render tuiles V2 EN PREMIER (sous les data layers)
      if (data.tilesOverview) _renderTilesOnMiniMap(data.tilesOverview, sel.georef);
      _renderDataLayersOnMiniMap(data, sel.georef);
      // 🆕 v1.40.17 — Render chips tags après changement de plan
      _renderTagChips(data);
    });
  }

  function _escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // =========================
  // BOOT
  // =========================
  // Auto-mount au DOMContentLoaded + écoute changements opt-in pour refresh.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    setTimeout(mount, 100); // léger délai pour laisser PlanRegistry s'initialiser
  }

  // ============================================================
  // 🆕 v1.43.15 — Toggle "Réduire les contrôles" du widget Home
  // ============================================================
  // Cache opacity slider + toggles catégorie + tagrow pour avoir la carte
  // en plein écran. État persisté en localStorage (clé séparée de la
  // modale OSM car contexte UX différent : ici on est dans le widget Home
  // qui peut être en mode mini OU en mode fullscreen).
  const LS_HOME_COLLAPSED_KEY = "myktamap_osm_home_controls_collapsed";

  function _getHomeControlsCollapsed() {
    try { return localStorage.getItem(LS_HOME_COLLAPSED_KEY) === "1"; }
    catch(e) { return false; }
  }

  function _applyHomeControlsCollapsed(collapsed) {
    try { localStorage.setItem(LS_HOME_COLLAPSED_KEY, collapsed ? "1" : "0"); } catch(e) {}
    const wrapper = document.getElementById("ktaOsmHomeCollapsible");
    const btn     = document.getElementById("ktaOsmHomeToggleControlsBtn");
    if (wrapper) wrapper.style.display = collapsed ? "none" : "";
    if (btn) {
      btn.textContent = collapsed ? "🔽" : "🔼";
      btn.title = collapsed
        ? window.I18n.t("osm_home.controls.expandTitle")
        : window.I18n.t("osm_home.controls.collapseTitle");
    }
    // Leaflet doit recalculer la taille du conteneur sinon les tuiles
    // se chargent mal et les coords pixel sont fausses au switch.
    if (_mapInstance && typeof _mapInstance.invalidateSize === "function") {
      setTimeout(function() { try { _mapInstance.invalidateSize(); } catch(e) {} }, 80);
    }
  }

  // ============================================================
  // 🆕 v1.43.3 — Overlay "ce plan n'est pas caché offline"
  // ============================================================
  // Affiché par-dessus la mini-carte quand l'user sélectionne un plan
  // qui n'a pas (encore) de tuiles cachées dans le store global, alors
  // qu'on est offline. UX : message clair + suggestion d'action.

  async function _maybeShowNotCachedOverlay(planId, georef) {
    _clearNotCachedOverlay();
    if (_isOnline()) return; // online → render normal, pas d'overlay
    if (!window.OsmTilesCache) return;
    const bbox = _bboxFromGeoref(georef);
    if (!bbox) return;
    try {
      // 🐛 v1.43.6 — Mode any-zoom (omission du 2e arg) : scan 10→18 au lieu
      // de tester uniquement zoom 14 (qui ratait les caches faits à d'autres
      // zooms par l'user).
      const has = await window.OsmTilesCache.hasCacheForBbox(bbox);
      // Garde anti-race : l'user a peut-être sélectionné un autre plan
      // pendant le lookup IDB.
      if (planId !== _selectedPlanId) return;
      if (has) return; // plan caché → render normal
      _showNotCachedOverlay();
    } catch(e) {}
  }

  function _showNotCachedOverlay() {
    const mapDiv = document.getElementById("ktaOsmHomeMap");
    if (!mapDiv) return;
    let ov = mapDiv.querySelector(".kta-osm-home-notcached");
    if (!ov) {
      ov = document.createElement("div");
      ov.className = "kta-osm-home-notcached";
      ov.style.cssText =
        "position:absolute; inset:0; background:rgba(10,13,24,0.92); " +
        "color:#e8eaf0; display:flex; flex-direction:column; align-items:center; " +
        "justify-content:center; text-align:center; padding:20px; z-index:500; " +
        "border-radius:6px; gap:8px;";
      ov.innerHTML =
        '<div style="font-size:32px;">📴</div>' +
        '<div style="font-weight:600; color:#f4c542;">' + window.I18n.t("osm_home.notcached.title") + '</div>' +
        '<div style="font-size:12.5px; color:#c8d0e0; max-width:280px; line-height:1.4;">' +
          window.I18n.t("osm_home.notcached.body") +
        '</div>';
      mapDiv.style.position = "relative";
      mapDiv.appendChild(ov);
    }
    ov.style.display = "flex";
  }

  function _clearNotCachedOverlay() {
    const mapDiv = document.getElementById("ktaOsmHomeMap");
    if (!mapDiv) return;
    const ov = mapDiv.querySelector(".kta-osm-home-notcached");
    if (ov) ov.style.display = "none";
  }

  // ============================================================
  // 🆕 v1.43.0 — OSM TILES CACHE OFFLINE (widget Home)
  // ============================================================
  // Bouton 💾 du bandeau widget Home → délègue à OsmTilesCache.
  // Cache GLOBAL partagé avec Vue OSM modale + Mode Secours
  // (même store IDB myktamap_osm_tiles, indexé par z/x/y → aucune
  // duplication même si l'user clic 💾 depuis 3 contextes différents).

  async function _refreshCacheStatsHome() {
    const span = document.getElementById("ktaOsmHomeCacheStats");
    if (!span || !window.OsmTilesCache) return;
    try {
      const s = await window.OsmTilesCache.getStats();
      if (s.count > 0) {
        span.textContent = window.I18n.t("osm_home.cache.statsCount", { count: s.count, size: window.OsmTilesCache.formatBytes(s.sizeBytes) });
        span.style.color = "#a6d785";
      } else {
        span.textContent = window.I18n.t("osm_home.cache.statsEmpty");
        span.style.opacity = "0.7";
      }
    } catch(e) {
      span.textContent = "📦 ?";
    }
  }

  async function _runCacheTilesHome() {
    if (!window.OsmTilesCache || !_mapInstance) return;
    const btn = document.getElementById("ktaOsmHomeCacheBtn");
    if (!navigator.onLine) {
      _showHomeToast(window.I18n.t("osm_home.cache.noConnection"), 3500);
      return;
    }
    const oldHtml = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳"; }
    try {
      const result = await window.OsmTilesCache.cacheVisibleTiles(_mapInstance, {
        onProgress: function(done, total) {
          if (btn) btn.innerHTML = "⏳" + done + "/" + total;
        }
      });
      let msg = window.I18n.t("osm_home.cache.cached", { cached: result.cached });
      if (result.skipped) msg += window.I18n.t("osm_home.cache.skipped", { skipped: result.skipped });
      if (result.failed)  msg += window.I18n.t("osm_home.cache.failed", { failed: result.failed });
      if (result.capped)  msg += window.I18n.t("osm_home.cache.capped");
      _showHomeToast(msg, 4500);
    } catch(e) {
      _showHomeToast(window.I18n.t("osm_home.cache.error", { err: (e.message || e) }), 4000);
    } finally {
      if (btn && oldHtml != null) { btn.disabled = false; btn.innerHTML = oldHtml; }
      await _refreshCacheStatsHome();
      // Notifie Vue OSM modale (gate offline) que le cache a changé
      try {
        if (window.OsmView && typeof window.OsmView.recheckOfflineCache === "function") {
          window.OsmView.recheckOfflineCache();
        }
      } catch(e) {}
      // 🆕 v1.43.3 — Refresh flag global + plan courant (= clear overlay
      // si plan vient juste d'être caché)
      _refreshAnyCachePresent();
      if (_selectedPlanId) {
        const plans = _listGeorefPlans();
        const cur = plans.find(function(p) { return p.id === _selectedPlanId; });
        if (cur) _maybeShowNotCachedOverlay(_selectedPlanId, cur.georef);
      }
    }
  }

  function _showHomeToast(msg, durationMs) {
    durationMs = durationMs || 3500;
    if (window.OOMGuard && window.OOMGuard.showToast) {
      window.OOMGuard.showToast(msg, "info");
      return;
    }
    // Fallback : inject bar dans le widget
    const container = document.querySelector(".kta-osm-home-map");
    if (!container) { console.log(msg); return; }
    let bar = container.querySelector(".kta-osm-home-toast");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "kta-osm-home-toast";
      bar.style.cssText =
        "position:absolute; left:50%; bottom:8px; transform:translateX(-50%);" +
        "background:rgba(20,25,40,0.95); color:#e8eaf0; padding:8px 14px;" +
        "border-radius:6px; font-size:12px; z-index:1000; max-width:90%;" +
        "border:1px solid rgba(140,180,255,0.25); text-align:center;";
      container.style.position = "relative";
      container.appendChild(bar);
    }
    bar.textContent = msg;
    bar.style.display = "block";
    clearTimeout(bar._t);
    bar._t = setTimeout(function() { if (bar) bar.style.display = "none"; }, durationMs);
  }

  // Listen opt-in changes pour refresh widget
  window.addEventListener("kta:osmOptInChange", refresh);

  // 🆕 v1.43.3 — Init flag _anyCachePresent au boot (différé pour laisser
  // OsmTilesCache.init() terminer). Si cache existant + offline → le
  // _refreshAnyCachePresent() déclenchera refresh() automatiquement.
  setTimeout(function() {
    if (window.OsmTilesCache && typeof window.OsmTilesCache.init === "function") {
      window.OsmTilesCache.init().then(_refreshAnyCachePresent);
    }
  }, 1500);
  // 🆕 v1.40.2 — Plus de hook auto-open (l'ancien flow basé sur sessionStorage
  // + simulation clic plan row + kta:planConfigReady ne marchait pas — sélecteurs
  // HTML faux). Le ⛶ déclenche maintenant openFullScreen() en local.

  window.OsmHomePreview = {
    mount:          mount,
    refresh:        refresh,
    selectPlan:     selectPlan,
    openFullScreen: openFullScreen
  };

  console.log("[OsmHomePreview] Module chargé (v1.40.16).");
})();
