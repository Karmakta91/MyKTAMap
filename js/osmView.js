/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// osmView.js — modale « Vue OSM » : le plan projeté sur OpenStreetMap par son géoréférencement.
// =====================================================================
// Seconde carte Leaflet EPSG:3857 ; la carte principale (L.CRS.Simple) n'est pas touchée. Chaque tuile V2
// du niveau choisi : 3 coins plan (flip Y) → KmzExport.planToGps → L.imageOverlay.rotated(url, tl, tr, bl).
// Superpose POI, tracker, tracés, itinéraire, zones, structures, couche Mode Secours, filtres tag / niveau.
// Expose : window.OsmView = { open, close, isAvailable, isOptedIn, setOptedIn, getPlanGpsBbox,
// recheckOfflineCache }.
// Prérequis : géoréf (plan-config ou Réglages), plan V2 tuilé, OSM autorisé, en ligne ou tuiles en cache.
// 🩸 Plans V2 tuilés SEULEMENT : l'image complète en imageOverlay sature le GPU mobile (OOM silencieux).
// 🩸 Niveau adaptatif + culling : au plus MAX_TILES_BASELINE tuiles au boot, puis delta de zoom OSM = delta
// de niveau plan (doublement par cran partagé), tuile créée seulement si elle coupe la vue élargie.
// 🩸 Les URLs de tuiles (RUNTIME_ASSETS) sont partagées avec la carte principale : jamais révoquées ici.
// 🔒 Aucun appel sortant hors modale ouverte + OSM autorisé ; incognito → bouton désactivé.
// ⚠️ isOptedIn est dupliqué dans osmHomePreview.js : les deux doivent rester identiques.
// ⚠️ Palette propre (exception à check-style-canon) mais les couleurs passent par ktaResolveStyle : les
// types `cust-…` et les couleurs choisies dans la légende s'appliquent.
// Garde-fous : scripts/check-osm-defaut.js, check-osm-outils.js, check-osm-pile.js, check-osm-etiquettes.js ·
// Doc : docs/architecture/vue-osm.md.

(function() {
  "use strict";

  const LS_OPT_IN_KEY = "myktamap_osm_view_opt_in";
  const OSM_TILE_URL  = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const OSM_ATTR      = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const OSM_MAX_ZOOM  = 19;
  // budgets du niveau adaptatif et du culling
  const MAX_TILES_BASELINE = 20;   // budget RAM mobile ~20 Mo décodé au boot
  const VIEWPORT_PADDING   = 0.1;  // 10 % de marge : pré-charge les bords (pas de flash au pan)

  let _modalEl   = null;
  let _osmMap    = null;
  let _planLayer = null;       // L.featureGroup contenant les overlays rendus
  let _opacity   = 0.5;        // 50 % : meilleur compromis lecture OSM + plan
  let _planBbox        = null; // bbox des 4 coins du plan (fixe après init)
  let _proj            = null; // mémo de _buildProjection() pour les handlers zoom / move
  let _baselineOsmZoom = null; // zoom OSM où le plan tient au fit (calculé une fois)
  let _baseLevel       = null; // niveau plan heuristique à la baseline
  let _currentLevel    = null; // niveau plan actuellement affiché
  let _rendusLances    = 0;    // jeton de _renderLevel : seul le DERNIER rendu lancé pose ses tuiles
  const PANE_TUILES    = "ktaOsmTuiles";
  let _tilesByPath     = {};   // path → { overlay, tl, tr, bl } (cull rapide)
  let _moveEndHandler  = null; // pour le nettoyage au close()
  let _poiLayer   = null;
  let _planTilesVisible = true; // tuiles V2 du plan
  let _poiVisible = true;
  // filtre tag LOCAL à la modale (en plus du FilterPanel) : null = aucun, Set = ces tags seulement
  let _osmLocalTagFilter = null;
  // « 📍 Moi » : un fix GPS ponctuel à la demande, rien stocké, pas de watch continu
  let _myGpsMarker         = null; // L.circleMarker au point GPS
  let _myGpsAccuracyCircle = null; // L.circle d'incertitude si accuracy dépasse le seuil
  let _trackerLayer     = null;
  let _trackerTrace     = null; // L.polyline (timeline)
  let _trackerMarker    = null; // L.marker (dernière position + flèche cap)
  let _trackerVisible   = true;
  let _trackerPollTimer = null; // mise à jour live (1 s)
  let _roadLayer    = null;
  let _itiLayer     = null;
  let _roadVisible  = true;
  let _itiVisible   = true;
  // ⚠️ Repli aligné sur road.js > ROAD_TYPES.itinerary : à synchroniser s'il change.
  const ITI_COLOR     = "#00d4ff";
  const ITI_WEIGHT    = 5;       // 7 sur la carte principale, allégé pour OSM
  const ITI_DASHARRAY = "10 6";  // pointillé : distingue l'itinéraire des tracés
  let _zoneLayer    = null;
  let _structLayer  = null;
  let _zoneVisible  = true;
  let _structVisible = true;
  let _visibleLevels = null;    // Set<number> ; null = repli sur activeLevel
  // Couche Mode Secours : zones d'intervention et itinéraires par équipe (SecoursMode.PALETTE), affichée
  // d'office si un scénario est actif à l'ouverture ; bascule dans le bandeau.
  let _secoursLayer   = null;
  let _secoursVisible = true;
  // styles alignés sur secoursMode.js > renderOverlay
  const SECOURS_ITI_WEIGHT       = 4;
  const SECOURS_ITI_DASHARRAY    = "8 4";   // pointillé : itinéraire d'équipe ≠ itinéraire global
  const SECOURS_ZONE_FILL_OPAC   = 0.18;    // semi-transparent : ne masque pas les POI
  const SECOURS_ZONE_STROKE_OPAC = 0.85;

  // ⚠️ Repli si le canon (ktaResolveStyle) est absent : copie de road.js > ROAD_STYLES et zones.js >
  // ZONE_STYLES, qui ne sont pas exposés sur window. À synchroniser s'ils changent.
  const ROAD_STYLES_OSM = {
    "principal":  "#00ff00",
    "secondaire": "#b000ff",
    "chemin":     "#ffff00",
    "jonction":   "#ff4ecb",  // magenta (pointillé sur la carte principale, plein ici)
    "itinerary":  "#00d4ff"   // = ITI_COLOR
  };
  // zone : { stroke, fill } → color + fillColor du L.polygon
  const ZONE_STYLES_OSM = {
    "eau":          { stroke: "#0066aa", fill: "#3aa9e8" },
    "remblais":     { stroke: "#3a3a44", fill: "#5a5a68" },
    "effondrement": { stroke: "#cc0000", fill: "#ff3333" },
    "inaccessible": { stroke: "#5a0a0a", fill: "#b8743c" } // motif SVG impossible → aplat orange
  };

  // ⚠️ Repli aligné sur structures.js > STRUCTURE_STYLES (à synchroniser). Fronts allégés (10 → 6 px, la
  // vue OSM couvre plus large) ; piliers et murs : contour noir + remplissage de la masse.
  const STRUCTURE_STYLES_OSM = {
    "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.85, weight: 2, isPolyline: false },
    "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.85, weight: 2, isPolyline: false },
    "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.85, weight: 2, isPolyline: false },
    "front-1":  { color: "#f4c542", weight: 6, opacity: 1, isPolyline: true },
    "front-2":  { color: "#ff9933", weight: 6, opacity: 1, isPolyline: true }
  };

  // ── Config / opt-in ──────────
  // Défaut ACTIF (décision produit). 🩸 La clé est TRI-ÉTAT : "1" → ON · "0" → REFUSÉ, OFF, et on ne repasse
  // JAMAIS par-dessus un refus · absente → ON.
  // 🔒 Actif par défaut, le widget OSM du HOME contacte tile.openstreetmap.org AU CHARGEMENT, sans clic, dès
  // qu'un plan est géoréférencé. Restent prioritaires : incognito, hors-ligne réel, aucun plan géoréf. Un
  // bandeau ponctuel l'annonce (osmHomePreview.js).
  // 🩸 Ce lecteur et celui d'osmHomePreview.js doivent rester IDENTIQUES (sinon widget sans bouton, ou
  // l'inverse) : scripts/check-osm-defaut.js exécute les deux.
  function isOptedIn() {
    try { return localStorage.getItem(LS_OPT_IN_KEY) !== "0"; } catch(e) { return false; }
  }
  function setOptedIn(value) {
    try { localStorage.setItem(LS_OPT_IN_KEY, value ? "1" : "0"); } catch(e) {}
    try { window.dispatchEvent(new CustomEvent("kta:osmOptInChange", { detail: { optedIn: !!value } })); } catch(e) {}
  }

  // Géoréf effectif, même format {pointA, pointB: {x, y, lat, lng}} :
  //   1. PLAN_CONFIG.plan.georef (embarqué par le Générateur)
  //   2. KmzExport.getCalibration(planId) (saisi dans Réglages : le cas le plus courant)
  function _getEffectiveGeoref() {
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
  // Hors ligne (navigator.onLine false) : pas de tuiles OSM, pas de bouton. Le polling 2 s de
  // refonteInterface.js voit le retour en ligne.
  function _isOnline() {
    return (typeof navigator === "undefined") || navigator.onLine !== false;
  }

  // Cache OSM hors ligne (js/osmTilesCache.js). _planHasCachedTiles : des tuiles existent pour la bbox du plan
  // (échantillon) ; lue en SYNCHRONE par _isOnlineOrCached() (polling 2 s de refonteInterface).
  // _recheckCachedForCurrentPlan la rafraîchit en async : changement de plan, après cacheVisibleTiles, au boot.
  let _planHasCachedTiles = false;
  let _recheckInFlight = false; // pas de rechecks concurrents (polling 2 s)
  async function _recheckCachedForCurrentPlan() {
    if (_recheckInFlight) return;
    _recheckInFlight = true;
    const before = _planHasCachedTiles;
    try {
      if (!window.OsmTilesCache) { _planHasCachedTiles = false; }
      else {
        const bbox = _getPlanGpsBbox();
        if (!bbox) {
          // ⚠️ bbox null (plan pas encore chargé) : on GARDE la dernière valeur, sinon le bouton disparaît à tort
          // pendant un changement de plan ou un rechargement hors ligne.
        } else {
          // aucun zoom imposé : OsmTilesCache scanne 10→18 et répond dès qu'une tuile du centre est en cache
          // (pas de faux négatif si le cache a été fait à un autre zoom)
          _planHasCachedTiles = await window.OsmTilesCache.hasCacheForBbox(bbox);
        }
      }
    } catch(e) {
      // erreur : on garde la dernière valeur
    } finally {
      _recheckInFlight = false;
    }
    // flag changée : `kta:osmOptInChange` fait rafraîchir le bouton 🌍 tout de suite (refonteInterface.js)
    if (before !== _planHasCachedTiles) {
      try {
        window.dispatchEvent(new CustomEvent("kta:osmOptInChange", {
          detail: { reason: "cacheStateChanged", hasCachedTiles: _planHasCachedTiles }
        }));
      } catch(e) {}
    }
  }
  // en ligne OU tuiles en cache : Vue OSM ouvrable hors ligne (sortie terrain, Mode Secours)
  function _isOnlineOrCached() {
    return _isOnline() || _planHasCachedTiles;
  }
  // Plan V2 tuilé ? (Vue OSM réservée à ces plans, cf en-tête)
  function _isV2Plan() {
    const pc = window.PLAN_CONFIG;
    return !!(pc && pc.plan && pc.plan.tiledV2 === true && pc.tiling
              && Number.isFinite(pc.tiling.minNativeZoom)
              && Number.isFinite(pc.tiling.tileSize));
  }

  function isAvailable() {
    // Hors ligne avec cache OSM pour la bbox du plan : ouverture autorisée ; l'incognito reste bloquant.
    // 🩸 Rafraîchit la flag en arrière-plan à CHAQUE appel (polling 2 s) : le recheck du boot peut tirer
    // avant PLAN_CONFIG (bbox null) et la flag resterait fausse. Async : rejet capté par le .catch.
    if (window.OsmTilesCache) _recheckCachedForCurrentPlan().catch(function() {});
    return _hasGeoref() && isOptedIn() && !_isIncognitoOn() && _isOnlineOrCached();
  }

  // ── Projection : pixels plan → latlng GPS ──────────
  // { transform, planToLatLng(x, y) → L.latLng } ou null.
  function _buildProjection() {
    const g = _getEffectiveGeoref();
    if (!g) return null;
    if (typeof window.KmzExport !== "object" || typeof window.KmzExport.buildTransform !== "function") return null;
    let t;
    try {
      t = window.KmzExport.buildTransformCalib(g);   // pointC optionnel propagé (affine)
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

  // ── POI sur OSM ──────────

  // Filtre tags du FilterPanel : state.tags null → tout visible, sinon appartenance.
  function _isTagAllowed(p) {
    const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
    // filtre local de la modale, en ET avec le FilterPanel
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


  // 🩸 Même loi de largeur des fronts qu'en mode plan, en PIXELS PAR MÈTRE (structures.js) : la résolution
  // Web Mercator dépend de la LATITUDE autant que du zoom (un front de 1,5 m : 1 px vu de haut, 7 px de près).
  // Même technique : `options.weight` muté en place (le renderer canvas le relit à chaque frame), puis UNE
  // repeinture non clippée. Pas de setStyle, intenable à ce volume.
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
        // les surfaces gardent leur trait : un pilier se lit à son remplissage
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
    // ⚠️ `_redrawBounds` d'abord, sinon `_draw` clippe sur une demande en attente et ne repeint qu'un
    // rectangle (gotchas.md).
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

  // POI session + data layers, format unifié { x, y, nom, tags, level, description, _source, _ref }.
  // ⚠️ `description` doit être copiée : la popup de _renderPoi la lit (sinon repli sur le tag).
  function _collectVisiblePoi() {
    const out = [];
    // 1. session
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
    // 2. data layers
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

  // Icône d'un POI en 26×26 (32 sur la carte principale : la vue OSM couvre plus large), agrandie ou réduite
  // au zoom par _majTailleIconesOsm si le réglage 📐 est actif. null → icône Leaflet.
  function _buildPoiIcon(p) {
    let iconUrl = null;
    try {
      if (typeof window.getIconUrlForPoint === "function") {
        iconUrl = window.getIconUrlForPoint(p);
      }
    } catch(e) {}
    if (!iconUrl) return null;
    return window.ktaIconeOsm(iconUrl, 26, (Array.isArray(p.tags) && p.tags[0]) || "default");
  }

  // Réglage 📐 (map.js > ktaEchelleMarqueurs, même loi qu'en mode plan) relu à chaque zoom. Variable posée sur
  // le CONTENEUR : celle du body appartient au mode plan, resté dessous.
  function _majTailleIconesOsm() {
    if (!_osmMap || !_proj) return;
    const s = window.ktaReglageTailleIcones()
      ? window.ktaEchelleMarqueurs(window.ktaPxEcranParPxPlanOsm(_osmMap, _proj), window.KTA_ECHELLE_PLANCHER_OSM)
      : 1;
    const el = _osmMap.getContainer();
    // 🩸 Écrire seulement si la valeur change : une écriture recalcule le style de tous les marqueurs.
    const v = String(s);
    if (el.style.getPropertyValue("--kta-marker-scale") !== v) el.style.setProperty("--kta-marker-scale", v);
  }
  // Réglage basculé pendant que la Vue est ouverte : la forme de l'icône change (map.js > ktaIconeOsm), re-rendu.
  window.addEventListener("kta:tailleIconesChange", function () {
    if (!_osmMap || !_proj) return;
    if (_poiVisible) _renderPoi();
    _majTailleIconesOsm();
  });

  // Rend tous les POI (vide d'abord). Au boot de la modale et quand « 📍 POI » se rallume.
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
        // popup : la description d'abord, le tag en repli
        const tag  = (p.tags && p.tags[0]) || "default";
        const lvl  = (window.APP_CONFIG && window.APP_CONFIG.multiLevel)
                       ? window.I18n.t("osm.poi.popup.levelSuffix", { level: p.level })
                       : "";
        const desc = (p.description || "").trim();
        const html =
          '<div style="font-size:13px; min-width:140px; max-width:260px;">' +
            '<b>' + _escapeHtml(p.nom || window.I18n.t("osm.poi.popup.noName")) + '</b><br>' +
            '<span style="color:var(--kta-texte-2); font-size:12px;">' +
              (desc ? _escapeHtml(desc) : _escapeHtml(tag)) + lvl +
            '</span>' +
            (desc ? '<br><span style="color:var(--kta-texte-3); font-size:10.5px; opacity:0.75;">🏷️ ' + _escapeHtml(tag) + '</span>' : '') +
          '</div>';
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
    // chips de tags rafraîchis : ils dépendent du plan et des niveaux affichés
    _renderOsmTagChips();
  }

  // Tous les tags des POI du plan, TOUS niveaux (sinon les chips perdent les tags des autres niveaux).
  // 🩸 Même source que le rendu (_collectVisiblePoi) : tout tag listé correspond à des markers rendables.
  function _enumerateOsmTags() {
    const counts = {};
    if (typeof window.getEditorPoints === "function") {
      const session = window.getEditorPoints() || [];
      for (const p of session) {
        if (!p || typeof p.x !== "number") continue;
        const t = (Array.isArray(p.tags) && p.tags[0]) || "default";
        counts[t] = (counts[t] || 0) + 1;
      }
    }
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

  // chips de tags (filtre local) dans le bandeau
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
               'color:' + (isAllActive ? "var(--kta-accent-texte)" : "var(--kta-texte-3)") + ';">' + _escapeHtml(window.I18n.t("osm.tags.all")) + '</button>';
    for (const t of tags) {
      const active = isAllActive || (_osmLocalTagFilter && _osmLocalTagFilter.has(t));
      html += '<button type="button" data-tag="' + _escapeHtml(t) + '" title="' + _escapeHtml(window.I18n.t("osm.tags.poiCount", { count: counts[t] })) + '" ' +
              'style="font-size:11px; padding:2px 8px; border-radius:10px; cursor:pointer; ' +
              'border:1px solid ' + (active ? "rgba(244,197,66,0.6)" : "rgba(140,180,255,0.3)") + '; ' +
              'background:' + (active ? "rgba(244,197,66,0.2)" : "rgba(255,255,255,0.03)") + '; ' +
              'color:' + (active ? "var(--kta-accent-texte)" : "var(--kta-texte-3)") + ';">' + _escapeHtml(t) + '</button>';
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

  // Bbox GPS du plan (4 coins projetés), pour le garde « GPS hors champ » du bouton 📍. null si incalculable.
  function _getPlanGpsBbox() {
    // _proj absent (Vue OSM jamais ouverte) : projection construite à la volée (_buildProjection est pur),
    // pour le briefing PDF du Mode Secours.
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

  // distance haversine (km) pour le message
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

  // « 📍 Moi » : un fix navigator.geolocation par clic, rien stocké ; permission demandée au clic.
  // Incognito activé en cours de session → bloqué ici. Hors ligne ne bloque PAS (le GPS marche en avion).
  function _showMyGpsPositionOsm() {
    if (!_osmMap) return;
    if (_isIncognitoOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("osm.gps.incognito.toast"), "warn");
      } else { window.ktaAlerte(window.I18n.t("osm.gps.incognito.alert")); }
      return;
    }
    if (!navigator.geolocation) {
      window.ktaAlerte(window.I18n.t("osm.gps.unavailable"), { type: "erreur" });
      return;
    }
    const btn = document.getElementById("kta-osm-mygps");
    const originalHtml = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳"; }
    navigator.geolocation.getCurrentPosition(
      function(pos) {
        // 🩸 modale fermée pendant l'attente du fix : ne pas toucher une carte détruite par close()
        if (!_modalEl || !_osmMap) {
          console.log("[OsmView] geoloc callback : modale fermée avant fix, skip");
          return;
        }
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy || 0;
        // 🔒 fix à plus de 50 % au-delà de la bbox du plan : marker REFUSÉ (pas de position à des km du plan)
        const bbox = _getPlanGpsBbox();
        if (bbox) {
          const padded = bbox.pad(0.5); // +50% chaque côté = marge généreuse
          if (!padded.contains([lat, lng])) {
            const center = bbox.getCenter();
            const distKm = _haversineKm(lat, lng, center.lat, center.lng);
            const msg = window.I18n.t("osm.gps.outOfBounds", { dist: distKm.toFixed(1) });
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(msg, "warn");
            } else { window.ktaAlerte(msg); }
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
        // cercle de précision d'abord (sous le marker)
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
            '<span style="font-size:11.5px; color:var(--kta-texte-3);">' +
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
        window.ktaAlerte(msg, { type: "erreur" });
        if (btn && originalHtml != null) { btn.disabled = false; btn.innerHTML = originalHtml; }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  // Bascule de la couche POI ; rendue à la volée si la modale s'est ouverte POI masqués.
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

  function _escapeHtml(s) { return window.ktaEsc(s); }

  // ── Tracker sur OSM ──────────

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

  // Sous-échantillonnage 1 sur N au-delà de maxN (anti-lag mobile) ; garde toujours le dernier point.
  function _subsampleTimeline(points, maxN) {
    if (!Array.isArray(points) || points.length <= maxN) return points || [];
    const step = Math.ceil(points.length / maxN);
    const out = [];
    for (let i = 0; i < points.length; i += step) out.push(points[i]);
    const last = points[points.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  }

  // Cap (degrés horaires depuis le nord plan) sur les 2 derniers points, null si trop peu de mouvement.
  // Coords plan : y = 0 en haut = nord → atan2(dx, -dy) : 0° N, 90° E, 180° S, 270° O.
  function _computeTrackerHeading(timeline) {
    if (!Array.isArray(timeline) || timeline.length < 2) return null;
    const a = timeline[timeline.length - 2];
    const b = timeline[timeline.length - 1];
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx * dx + dy * dy < 0.01) return null; // < 0,1 px : cap pas fiable
    return Math.atan2(dx, -dy) * 180 / Math.PI;
  }

  // divIcon du tracker : cercle coloré + flèche de cap (rotation CSS inline sur l'enfant).
  function _buildTrackerIcon(color, heading) {
    let html =
      '<div style="background:' + color + '; width:14px; height:14px; border-radius:50%;' +
      ' border:2px solid #fff; box-shadow:0 0 6px rgba(0,0,0,0.5); position:relative;">'; // couleur-inline-ok : marqueur de carte, liseré blanc sur tout fond de carte
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

  // Rendu idempotent : setLatLngs / setLatLng / setIcon sur les objets existants, pas de recréation.
  function _renderTracker() {
    if (!_proj || !_osmMap) return;
    if (!_trackerLayer) _trackerLayer = L.layerGroup().addTo(_osmMap);

    const timeline = _getTrackerTimeline();
    if (timeline.length === 0) {
      // pas de timeline (jamais démarré ou remis à zéro) : nettoyage
      if (_trackerTrace)  { try { _trackerTrace.remove();  } catch(e) {} _trackerTrace  = null; }
      if (_trackerMarker) { try { _trackerMarker.remove(); } catch(e) {} _trackerMarker = null; }
      return;
    }

    const points = _subsampleTimeline(timeline, 5000);

    const latlngs = [];
    for (const p of points) {
      const ll = _proj.planToLatLng(p.x, p.y);
      if (ll) latlngs.push(ll);
    }
    if (latlngs.length === 0) return;

    const color   = _getTrackerColor();
    const heading = _computeTrackerHeading(timeline);
    const last    = latlngs[latlngs.length - 1];

    if (!_trackerTrace) {
      _trackerTrace = L.polyline(latlngs, {
        color: color,
        weight: 4,
        opacity: 0.85,
        interactive: false
      }).addTo(_trackerLayer);
    } else {
      _trackerTrace.setLatLngs(latlngs);
      // couleur changée pendant que la modale est ouverte
      if (_trackerTrace.options.color !== color) _trackerTrace.setStyle({ color: color });
    }

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

  // Bascule de la couche tracker (rendue à la volée si besoin).
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

  // Polling 1 s tant que la modale est ouverte ; no-op si le tracker ne tourne pas.
  function _startTrackerPolling() {
    if (_trackerPollTimer) return;
    _trackerPollTimer = setInterval(function() {
      if (!_trackerVisible || !_osmMap) return;
      if (!_isTrackerActif()) return;
      _renderTracker();
    }, 1000);
  }

  function _stopTrackerPolling() {
    if (_trackerPollTimer) { clearInterval(_trackerPollTimer); _trackerPollTimer = null; }
  }

  // Centre sur la dernière position du tracker : sous le zoom 16, saute au zoom 17 ; sinon simple panTo.
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

  // ── Tracés + itinéraire sur OSM ──────────

  // Filtre roadTypes du FilterPanel (null = aucun). "itinerary" est rendu à part (_itiLayer).
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

  // niveau de la route entière (road.level), via _isLevelAllowed
  function _isRoadLevelAllowed(road) {
    return _isLevelAllowed(road);
  }

  // Tracés session + embarqués, sans "itinerary", filtrés par type et niveau.
  function _collectVisibleRoads() {
    const out = [];
    const session = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    const emb     = (typeof window.getAllEmbeddedRoads === "function") ? (window.getAllEmbeddedRoads() || []) : [];
    function _push(road) {
      if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
      if (road.type === "itinerary") return;
      if (!_isRoadTypeAllowed(road) || !_isRoadLevelAllowed(road)) return;
      out.push(road);
    }
    session.forEach(_push);
    emb.forEach(_push);
    return out;
  }

  // L'itinéraire actif (un seul par session, interfaceItineraire.js).
  function _collectActiveItinerary() {
    const session = (typeof window.getRoads === "function") ? (window.getRoads() || []) : [];
    return session.find(function(r) { return r && r.type === "itinerary" && Array.isArray(r.points) && r.points.length >= 2; }) || null;
  }

  // Points plan → latlngs ; un point qui échoue est sauté, la polyline reste continue.
  function _projectRoadPoints(road) {
    const latlngs = [];
    for (const p of road.points) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      const ll = _proj.planToLatLng(p.x, p.y);
      if (ll) latlngs.push(ll);
    }
    return latlngs;
  }

  // Couleur d'un tracé : road.color explicite → canon (ktaResolveStyle, override de légende compris) →
  // ROAD_STYLES_OSM → gris de repli. Même comportement que road.js > _resolveRoadStyle.
  function _resolveRoadColor(road) {
    if (road && typeof road.color === "string" && road.color) return road.color;
    // 🩸 Le CANON avant la table locale : sinon la couleur choisie dans la légende pour un type built-in est
    // court-circuitée. Défauts identiques : rien ne change sans override.
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
    return "#8892a4"; // gris de repli
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

  // Itinéraire actif : une polyline cyan pointillée plus épaisse ; aucun → couche vide.
  function _renderItinerary() {
    if (!_proj || !_osmMap) return;
    if (!_itiLayer) _itiLayer = L.layerGroup().addTo(_osmMap);
    _itiLayer.clearLayers();

    const iti = _collectActiveItinerary();
    if (!iti) {
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

  // ── Zones + structures sur OSM ──────────

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
      if (!z || !Array.isArray(z.points) || z.points.length < 3) return; // polygone : ≥ 3 points
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

  // Points {x, y} → latlngs (tracés, zones, structures).
  function _projectPoints(points) {
    const out = [];
    for (const p of points) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      const ll = _proj.planToLatLng(p.x, p.y);
      if (ll) out.push(ll);
    }
    return out;
  }

  // Couleurs d'une zone (stroke + fill), même cascade que _resolveRoadColor.
  function _resolveZoneColors(z) {
    if (z && (z.color || z.fillColor)) {
      return {
        stroke: z.color     || z.fillColor || "#8892a4",
        fill:   z.fillColor || z.color     || "#8892a4"
      };
    }
    // canon d'abord (override de légende)
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
                            : function(t) { return /^front/.test(String(t || "")); }; // repli regex
    let added = 0, skipped = 0;
    for (const s of structs) {
      const latlngs = _projectPoints(s.points);
      const polyline = isPolylineType(s.type);
      const minPts = polyline ? 2 : 3;
      if (latlngs.length < minPts) { skipped++; continue; }
      const style = Object.assign({}, STRUCTURE_STYLES_OSM[s.type] || STRUCTURE_STYLES_OSM["mur"]);
      // couleurs du canon par-dessus la variante OSM (qui n'apporte que weight / opacity allégés)
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
            // 🩸 même classe qu'en mode plan : sans elle la largeur des fronts n'est pas recalculée au zoom et des
            // milliers de fronts deviennent un aplat de loin
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
      // première largeur dès que les structures existent (sinon seulement au premier zoom)
      _majLargeurFrontsOsm();
    } else if (_structLayer && _osmMap.hasLayer(_structLayer)) {
      _osmMap.removeLayer(_structLayer);
    }
  }

  // ── Couche Mode Secours ──────────
  // Zones d'intervention, itinéraires suggérés et entrées / sorties par équipe (SecoursMode.PALETTE, comme
  // l'overlay de la carte principale). Filtre de niveau point par point (_isLevelAllowed). No-op sans
  // SecoursMode, sans scénario courant ou scénario vide.
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

    // 🩸 PALETTE = tableau d'OBJETS [{hex, nom}] : passer l'objet à Leaflet donne "[object Object]". On extrait
    // .hex, avec repli sur une palette de chaînes.
    const SECOURS_FALLBACK_HEX = ["#ff4444", "#4488ff", "#44cc44", "#ffcc00", "#ff4ecb", "#00d4ff", "#ff8c00", "#9d44ff", "#8b5a2b", "#404040"];
    const palette = (Array.isArray(SM.PALETTE) && SM.PALETTE.length > 0) ? SM.PALETTE : SECOURS_FALLBACK_HEX;
    function _resolveEquipeColor(couleurIdx) {
      const entry = palette[(couleurIdx || 0) % palette.length];
      if (!entry) return SECOURS_FALLBACK_HEX[0];
      // deux formats : { hex } (PALETTE) ou "#…" (palette de repli)
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && typeof entry.hex === "string") return entry.hex;
      return SECOURS_FALLBACK_HEX[0];
    }

    let nZones = 0, nIti = 0, nMarkers = 0;
    for (const g of scenario.groupes) {
      if (!g || typeof g !== "object") continue;
      const color = _resolveEquipeColor(g.couleurIdx);
      const nomEquipe = g.nom || window.I18n.t("osm.secours.noTeamName");

      // zone d'intervention (zoneType polygon)
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

      // itinéraire suggéré de l'équipe (pointillé, couleur de l'équipe)
      if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
        // 🩸 L'itinéraire porte le VRAI niveau de chaque point : filtrer puis relier tirerait un trait droit à
        // travers la surface entre la descente et la remontée. On découpe en TRONÇONS continus de niveaux visibles.
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

      // entrée (●) et sortie (▲) si présentes et de niveau visible
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
            // triangle vers le haut = sortie (vers la surface)
            L.marker(ll, {
              icon: L.divIcon({
                className: "kta-osm-secours-sortie-icon",
                html: '<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid ' + color + ';filter:drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff);"></div>', // couleur-inline-ok : marqueur de carte
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

  // Un scénario Mode Secours est-il courant ? (bascule affichée + rendu d'office à l'ouverture)
  function _hasActiveSecoursScenario() {
    try {
      return !!(window.SecoursMode
        && typeof window.SecoursMode.getCurrentScenarioId === "function"
        && window.SecoursMode.getCurrentScenarioId());
    } catch(e) { return false; }
  }

  // ── Multi-niveau ──────────

  // _visibleLevels à l'ouverture : null hors multi-niveau ; sinon les niveaux affichés, cochables en chips.
  function _initVisibleLevels() {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.multiLevel) { _visibleLevels = null; return; }
    // 🩸 La modale suit ce que la carte montre : elle reprend `visibleLevels` (choix de l'utilisateur, option
    // « tous les niveaux au lancement »), sinon le reste du relevé disparaîtrait en passant en Vue OSM. Repli
    // sur le niveau actif.
    _visibleLevels = new Set();
    const vis = Array.isArray(cfg.visibleLevels) ? cfg.visibleLevels : null;
    if (vis && vis.length) {
      vis.forEach(function (n) { if (Number.isFinite(n)) _visibleLevels.add(n); });
    }
    if (_visibleLevels.size === 0 && Number.isFinite(cfg.activeLevel)) {
      _visibleLevels.add(cfg.activeLevel);
    }
  }

  // Bascule d'un niveau + re-rendu. Tout décoché = Set vide, aucun niveau (pas de repli automatique sur
  // activeLevel : plus prévisible).
  function _toggleLevel(level) {
    if (!_visibleLevels) _visibleLevels = new Set();
    if (_visibleLevels.has(level)) _visibleLevels.delete(level);
    else _visibleLevels.add(level);
    _refreshLevelFilteredLayers();
  }

  // Re-rend les couches dépendantes du niveau (POI, tracés, itinéraire, zones, structures, Secours). Le
  // tracker est exclu : sa timeline garde tout son historique.
  function _refreshLevelFilteredLayers() {
    if (_poiVisible)    _renderPoi();
    if (_roadVisible)   _renderRoads();
    if (_itiVisible)    _renderItinerary();
    if (_zoneVisible)   _renderZones();
    if (_structVisible) _renderStructures();
    // un re-rendu recrée les couches : la largeur des fronts se repose ici, pas au prochain zoom
    _majLargeurFrontsOsm();
    if (_secoursVisible && _hasActiveSecoursScenario()) _renderSecoursLayer();
  }

  // ── « Réduire les contrôles » (carte plein écran) ──────────
  // Sur mobile le bandeau prend ~60 % de l'écran. État persisté en localStorage.
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
    // ⚠️ invalidateSize après le resize du DOM, sinon tuiles mal chargées et coords pixel fausses
    if (_osmMap && typeof _osmMap.invalidateSize === "function") {
      setTimeout(function() { try { _osmMap.invalidateSize(); } catch(e) {} }, 80);
    }
  }

  // ── Construction de la modale ──────────
  function _buildModal() {
    const overlay = document.createElement("div");
    overlay.id = "kta-osm-view-overlay";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:1800px; width:96vw; height:92vh; display:flex; flex-direction:column;">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + window.I18n.t("osm.modal.title") + '</span>' +
          '<div style="display:flex; gap:6px; align-items:center;">' +
            // « Réduire les contrôles » (persisté)
            '<button class="kta-panneau-close" type="button" id="kta-osm-toggle-controls" aria-label="' + _escapeHtml(window.I18n.t("osm.controls.collapse")) + '" title="' + _escapeHtml(window.I18n.t("osm.controls.collapse")) + '" style="font-size:14px; padding:4px 10px;">🔼</button>' +
            '<button class="kta-panneau-close" type="button" id="kta-osm-close" aria-label="' + _escapeHtml(window.I18n.t("osm.modal.close")) + '">&times;</button>' +
          '</div>' +
        '</div>' +
        // Enveloppe repliable des 3 bandeaux ; #kta-osm-map prend la place libérée (flex: 1 1 auto).
        '<div id="kta-osm-controls-wrapper">' +
        // flex-wrap + row-gap : avec ~10 bascules le bandeau passe à la ligne au lieu de déborder hors de la modale
        '<div style="display:flex; flex-wrap:wrap; gap:10px; row-gap:6px; align-items:center; padding:8px 14px; background:rgba(140,180,255,0.06); border-bottom:1px solid rgba(140,180,255,0.18); font-size:12.5px; color:var(--kta-texte-2);">' +
          '<span>' + window.I18n.t("osm.opacity.label") + '</span>' +
          '<input type="range" id="kta-osm-opacity" min="0" max="100" value="' + Math.round(_opacity * 100) + '" style="flex:1 1 auto; max-width:240px;">' +
          '<span id="kta-osm-opacity-val" style="width:38px; text-align:right;">' + Math.round(_opacity * 100) + '%</span>' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-center" style="font-size:12px; padding:5px 10px;">' + window.I18n.t("osm.btn.centerPlan") + '</button>' +
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-center-tracker" style="font-size:12px; padding:5px 10px;" title="' + _escapeHtml(window.I18n.t("osm.btn.centerTracker.title")) + '">' + window.I18n.t("osm.btn.centerTracker") + '</button>' +
          // « 📍 Moi » : un fix ponctuel ; désactivé si incognito à la construction
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-mygps" style="font-size:12px; padding:5px 10px;"' +
            (_isIncognitoOn() ? ' disabled' : '') +
            ' title="' +
              _escapeHtml(_isIncognitoOn() ? window.I18n.t("osm.btn.mygps.title.incognito")
                : window.I18n.t("osm.btn.mygps.title.default")) +
            '">' + window.I18n.t("osm.btn.mygps") + '</button>' +
          // mesure (la même que dans la Vue OSM du HOME)
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-mesure" ' +
            'style="font-size:12px; padding:5px 10px;" title="' +
            _escapeHtml(window.I18n.t("osm_mes.btnTitle")) + '">📏</button>' +
          // relevé des coordonnées GPS de surface d'un point : la carte est géographique, `e.latlng` suffit
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-coords" ' +
            'style="font-size:12px; padding:5px 10px;" title="' +
            _escapeHtml(window.I18n.t("osm.coords.btnTitle")) + '">🎯</button>' +
          // « Cacher pour hors ligne » : tuiles visibles + zoom ±1 en IDB. Cache GLOBAL (myktamap_osm_tiles, z/x/y)
          // partagé avec la Vue OSM du HOME et le Mode Secours.
          '<button type="button" class="kta-btn kta-btn-ghost" id="kta-osm-cache-btn" style="font-size:12px; padding:5px 10px;" title="' + _escapeHtml(window.I18n.t("osm.cache.btn.title")) + '">' + window.I18n.t("osm.cache.btn") + '</button>' +
          '<span id="kta-osm-cache-stats" style="color:var(--kta-texte-3); font-size:11.5px;" title="' + _escapeHtml(window.I18n.t("osm.cache.stats.title")) + '">' + window.I18n.t("osm.cache.stats.loading") + '</span>' +
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
          // bascule Mode Secours : seulement si un scénario est actif
          (_hasActiveSecoursScenario()
            ? '<label style="display:inline-flex; align-items:center; gap:5px; font-size:12px; cursor:pointer; user-select:none; padding:2px 6px; background:rgba(255,80,80,0.15); border-radius:4px;" title="' + _escapeHtml(window.I18n.t("osm.toggle.secours.title")) + '">' +
                '<input type="checkbox" id="kta-osm-secours-toggle" ' + (_secoursVisible ? "checked" : "") + ' style="margin:0;">' +
                window.I18n.t("osm.toggle.secours") +
              '</label>'
            : '') +
          '<span style="flex:1 1 auto;"></span>' +
        '</div>' +
        // 2e ligne : chips de niveaux (plan multi-niveau seulement)
        '<div id="kta-osm-levels-bar" style="display:none; gap:8px; align-items:center; padding:6px 14px; background:rgba(244,197,66,0.04); border-bottom:1px solid rgba(244,197,66,0.18); font-size:12px; color:var(--kta-texte-2); flex-wrap:wrap;">' +
          '<span>' + window.I18n.t("osm.levels.label") + '</span>' +
          '<span id="kta-osm-levels-chips" style="display:inline-flex; gap:6px; flex-wrap:wrap;"></span>' +
          '<span style="color:var(--kta-texte-3); font-size:11px; margin-left:auto;">' + window.I18n.t("osm.levels.hint") + '</span>' +
        '</div>' +
        // 3e ligne : chips de tags (filtre local)
        '<div id="kta-osm-tags-bar" style="display:none; gap:8px; align-items:center; padding:6px 14px; background:rgba(140,180,255,0.04); border-bottom:1px solid rgba(140,180,255,0.16); font-size:12px; color:var(--kta-texte-2); flex-wrap:wrap;">' +
          '<span title="' + _escapeHtml(window.I18n.t("osm.tags.label.title")) + '">' + window.I18n.t("osm.tags.label") + '</span>' +
          '<span id="kta-osm-tags-chips" style="display:inline-flex; gap:5px; flex-wrap:wrap;"></span>' +
          '<span style="color:var(--kta-texte-3); font-size:11px; margin-left:auto;">' + window.I18n.t("osm.tags.hint") + '</span>' +
        '</div>' +
        // fin de l'enveloppe repliable
        '</div>' +
        '<div id="kta-osm-map" style="flex:1 1 auto; background:var(--kta-fond);"></div>' +
      '</div>';
    document.documentElement.appendChild(overlay);
    overlay.querySelector("#kta-osm-close").addEventListener("click", close);
    const toggleCtrlBtn = overlay.querySelector("#kta-osm-toggle-controls");
    if (toggleCtrlBtn) {
      toggleCtrlBtn.addEventListener("click", function() {
        _applyControlsCollapsed(!_getControlsCollapsed());
      });
      // état appliqué avant le montage de la carte : pas de saut visuel, Leaflet prend la bonne taille
      _applyControlsCollapsed(_getControlsCollapsed());
    }
    overlay.querySelector("#kta-osm-opacity").addEventListener("input", function(e) {
      _opacity = (parseInt(e.target.value, 10) || 0) / 100;
      document.getElementById("kta-osm-opacity-val").textContent = Math.round(_opacity * 100) + "%";
      _applyOpacity();
    });
    overlay.querySelector("#kta-osm-center").addEventListener("click", _centerOnPlan);
    const cacheBtn = overlay.querySelector("#kta-osm-cache-btn");
    if (cacheBtn) {
      cacheBtn.addEventListener("click", function() { _runCacheOsmTiles(cacheBtn); });
    }
    _refreshOsmCacheStats();
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
    const mygpsBtn = overlay.querySelector("#kta-osm-mygps");
    if (mygpsBtn) {
      mygpsBtn.addEventListener("click", _showMyGpsPositionOsm);
    }
    // mesure et relevé de coordonnées : chaque module bascule seul au second clic
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
    const secoursCb = overlay.querySelector("#kta-osm-secours-toggle");
    if (secoursCb) {
      secoursCb.addEventListener("change", function(e) {
        _toggleSecoursVisible(!!e.target.checked);
      });
    }
    return overlay;
  }

  // Chips de niveaux (plan multi-niveau), cochées selon _visibleLevels. Appelé après l'init des niveaux.
  function _renderLevelsBar() {
    const bar  = document.getElementById("kta-osm-levels-bar");
    const cont = document.getElementById("kta-osm-levels-chips");
    if (!bar || !cont) return;
    const cfg = window.APP_CONFIG || {};
    if (!cfg.multiLevel) { bar.style.display = "none"; return; }
    const levels = Array.isArray(cfg.availableLevels) ? cfg.availableLevels.slice() : [];
    if (levels.length === 0) {
      // sans availableLevels exposé : {0, activeLevel}
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
        (checked ? "var(--kta-accent)" : "rgba(255,255,255,0.18)") + ";" +
        " background:" + (checked ? "var(--kta-accent)" : "rgba(255,255,255,0.04)") + ";" +
        " color:" + (checked ? "#1a1f2e" : "var(--kta-texte-2)") + ";" +
        " transition:background 0.15s, border-color 0.15s, color 0.15s;";
      chip.addEventListener("click", function() {
        const l = parseInt(chip.dataset.level, 10);
        _toggleLevel(l);
        _renderLevelsBar();
      });
      cont.appendChild(chip);
    }
  }

  function _applyOpacity() {
    if (!_planLayer) return;
    const pane = _osmMap && _osmMap.getPane(PANE_TUILES);
    if (pane) { pane.style.opacity = String(_opacity); return; }   // tuiles opaques : le pane porte l'opacité
    _planLayer.eachLayer(function(l) {
      try {
        if (l.setOpacity) l.setOpacity(_opacity);
        else if (l._image) l._image.style.opacity = String(_opacity);
      } catch(e) {}
    });
  }

  // ── Cache OSM hors ligne (bouton « 💾 ») ──────────
  // Délégué à js/osmTilesCache.js. Cache IDB GLOBAL : profite aussi à la Vue OSM du HOME et au Mode Secours.

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
        span.style.color = "var(--kta-ok)"; // vert = cache présent
      } else {
        span.textContent = window.I18n.t("osm.cache.stats.empty");
        span.style.color = "var(--kta-texte-3)";
      }
    } catch(e) {
      span.textContent = window.I18n.t("osm.cache.stats.error");
    }
  }

  async function _runCacheOsmTiles(btn) {
    if (!window.OsmTilesCache || !_osmMap) return;
    if (!btn) btn = document.getElementById("kta-osm-cache-btn");
    const oldLabel = btn ? btn.textContent : "";
    // télécharger exige le réseau
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
      // la flag hors ligne aussi : la modale s'ouvre maintenant sans réseau
      await _recheckCachedForCurrentPlan();
    }
  }

  // Toast dans l'overlay de la modale (elle peut passer au-dessus des toasts globaux).
  function _toast(msg, durationMs) {
    durationMs = durationMs || 3500;
    // même réglage que le goulot central : un toast contextuel est une info
    if (window.OOMGuard && typeof window.OOMGuard.toastAutorise === "function" && !window.OOMGuard.toastAutorise("info")) return;
    // ⚠️ l'overlay s'appelle kta-osm-view-overlay ; sans lui, repli sur showToast
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
        "background:rgba(20,25,40,0.95); color:#e8eaf0; padding:10px 16px;" + // couleur-inline-ok : toast sur la carte, fond sombre fixe dans les deux thèmes
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
    // _planBbox (4 coins, fixe) et non _planLayer.getBounds() : le culling peut vider une partie du layer
    if (!_osmMap || !_planBbox) return;
    try {
      if (_planBbox.isValid && _planBbox.isValid()) {
        _osmMap.fitBounds(_planBbox, { padding: [40, 40] });
      }
    } catch(e) { console.warn("[OsmView] center :", e); }
  }

  // Bascule des tuiles du plan (_planLayer porte tous les imageOverlay de _renderLevel).
  function _togglePlanTilesVisible(visible) {
    _planTilesVisible = !!visible;
    if (!_osmMap || !_planLayer) return;
    if (_planTilesVisible) {
      if (!_osmMap.hasLayer(_planLayer)) _osmMap.addLayer(_planLayer);
    } else {
      if (_osmMap.hasLayer(_planLayer)) _osmMap.removeLayer(_planLayer);
    }
  }

  // ── Niveau adaptatif + viewport culling ──────────

  // Bbox latlng des 4 coins du plan (fitBounds initial, _baselineOsmZoom).
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

  // Baseline : niveau le plus zoomé dont le nombre total de tuiles tient sous MAX_TILES_BASELINE (boot sûr ;
  // un petit plan tient à la qualité max).
  function _choisirNiveauBaseline(tiling, planW, planH) {
    for (let z = tiling.maxNativeZoom; z >= tiling.minNativeZoom; z--) {
      const scale = Math.pow(2, -z);
      const cols = Math.ceil(Math.ceil(planW / scale) / tiling.tileSize);
      const rows = Math.ceil(Math.ceil(planH / scale) / tiling.tileSize);
      if (cols * rows <= MAX_TILES_BASELINE) return z;
    }
    return tiling.minNativeZoom;
  }

  // Zoom OSM → niveau plan : un cran de l'un = un cran de l'autre (les deux doublent). Borné aux niveaux générés.
  function _targetLevelForZoom(osmZoom, tiling) {
    if (_baselineOsmZoom == null || _baseLevel == null) return _baseLevel;
    const delta = Math.round(osmZoom - _baselineOsmZoom);
    const z = _baseLevel + delta;
    return Math.max(tiling.minNativeZoom, Math.min(tiling.maxNativeZoom, z));
  }

  // Intersection AABB tuile (3 coins, 4e déduit) / vue en latlng.
  function _tileIntersectsBounds(tl, tr, bl, mapBounds) {
    // 4e coin du parallélogramme : br = tr + (bl - tl)
    const br = L.latLng(tr.lat + bl.lat - tl.lat, tr.lng + bl.lng - tl.lng);
    const tileBbox = L.latLngBounds([tl, tr, bl, br]);
    return mapBounds.intersects(tileBbox);
  }

  // 🩸 Une tuile se retire de _planLayer, pas seulement de la carte : overlay.remove() la laissait dans le
  // groupe (et ne faisait rien case 🖼️ Plan décochée) ; recocher Plan reposait alors toutes les tuiles déjà
  // vues, tous niveaux superposés. Garde-fou : scripts/smoke/checkup-osm-empilement.js.
  function _retirerTuile(overlay) {
    try {
      if (_planLayer) _planLayer.removeLayer(overlay);
      else overlay.remove();
    } catch(e) {}
  }

  // Retire tous les overlays (changement de niveau, close).
  function _cleanupAllTiles() {
    for (const path in _tilesByPath) _retirerTuile(_tilesByPath[path].overlay);
    _tilesByPath = {};
  }

  // Retire les tuiles sorties de la vue (pan sans changement de niveau).
  function _cullInvisibleTiles(mapBounds) {
    let culled = 0;
    for (const path in _tilesByPath) {
      const t = _tilesByPath[path];
      if (!_tileIntersectsBounds(t.tl, t.tr, t.bl, mapBounds)) {
        _retirerTuile(t.overlay);
        delete _tilesByPath[path];
        culled++;
      }
    }
    return culled;
  }

  // Rendu d'un niveau avec culling : nouveau niveau → tout est nettoyé puis rendu ; même niveau → seules
  // les tuiles visibles manquantes sont ajoutées.
  async function _renderLevel(z) {
    if (!_proj || !_osmMap) return;
    const tiling = window.PLAN_CONFIG && window.PLAN_CONFIG.tiling;
    const planW  = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.imageWidth;
    const planH  = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.imageHeight;
    if (!tiling || !planW || !planH) return;

    // 🩸 Course entre deux rendus : pendant l'attente de l'extraction (phase 2), un autre cran de zoom lance
    // un second rendu ; le premier reprendrait et poserait ses tuiles PAR-DESSUS (deux niveaux à l'écran).
    // Chaque rendu prend un jeton : après l'attente, seul le dernier lancé pose ses tuiles.
    const jeton = ++_rendusLances;
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

    // phase 1 : tuiles visibles à ajouter
    const aAjouter = [];
    const aExtraire = [];
    // extension d'après le manifest (webp/png = alpha, jpg = ancien)
    const _tileExt = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(tiling) : "jpg";
    for (let col = 0; col < cols; col++) {
      for (let k = 1; k <= rows; k++) {
        const path = "data/tiles/z" + z + "/x" + col + "_y" + (-k) + "." + _tileExt;
        if (_tilesByPath[path]) continue;

        const pxLeft   = col * tileSize * scale;
        const pxRight  = (col + 1) * tileSize * scale;
        const pxTop    = planH - k * tileSize * scale;       // flip Y de CRS.Simple
        const pxBottom = planH - (k - 1) * tileSize * scale;

        const tl = _proj.planToLatLng(pxLeft,  pxTop);
        const tr = _proj.planToLatLng(pxRight, pxTop);
        const bl = _proj.planToLatLng(pxLeft,  pxBottom);
        if (!tl || !tr || !bl) continue;

        if (!_tileIntersectsBounds(tl, tr, bl, mapBounds)) continue;

        aAjouter.push({ path, tl, tr, bl, col, k });

        // asset évincé par le LRU : extraction paresseuse (phase 2)
        const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[path];
        if (asset && !asset.file && asset._zipPath
            && typeof window._extractLazyAsset === "function") {
          aExtraire.push(path);
        }
      }
    }

    // phase 2 : extraction async des tuiles paresseuses
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

    // rendu dépassé pendant l'attente : on ne pose rien
    if (jeton !== _rendusLances || z !== _currentLevel || !_osmMap) return;

    // phase 3 : overlays créés et enregistrés dans _tilesByPath
    let added = 0;
    const aPane = !!_osmMap.getPane(PANE_TUILES);
    for (const t of aAjouter) {
      if (_tilesByPath[t.path]) continue;   // posée entre-temps : jamais deux overlays pour une tuile
      const url = _resolveTileUrl(t.path);
      if (!url) continue;
      try {
        const overlay = L.imageOverlay.rotated(url, t.tl, t.tr, t.bl,
          aPane ? { interactive: false, pane: PANE_TUILES } : { interactive: false });
        // masque le remplissage noir des tuiles de bord (« petits carrés » autour d'un plan opaque)
        if (window.ktaRognerTuile) window.ktaRognerTuile(overlay, window.ktaRemplissageTuile(planW, planH, tileSize, scale, t.col, t.k));
        overlay.addTo(_planLayer);
        if (!aPane && overlay.setOpacity) overlay.setOpacity(_opacity);   // sans pane : opacité par tuile
        _tilesByPath[t.path] = { overlay: overlay, tl: t.tl, tr: t.tr, bl: t.bl };
        added++;
      } catch(e) {
        console.warn("[OsmView] tile overlay :", t.path, e);
      }
    }

    // phase 4 : cull des tuiles sorties de la vue (même niveau)
    const culled = switching ? 0 : _cullInvisibleTiles(mapBounds);

    if (added > 0 || culled > 0 || switching) {
      console.log("[OsmView] z=" + z + " (scale x" + scale + ") : +" + added + " ajoutée(s), -" + culled + " cullée(s), total " + Object.keys(_tilesByPath).length + " tuile(s)");
    }
  }

  // zoomend / moveend : niveau cible réévalué, rendu ou cull (Leaflet émet une fois par cran).
  function _onMoveEnd() {
    if (!_osmMap) return;
    // largeur des fronts AVANT le retour anticipé : un plan non tuilé en a le même besoin
    _majLargeurFrontsOsm();
    const tiling = window.PLAN_CONFIG && window.PLAN_CONFIG.tiling;
    if (!tiling) return;
    const targetZ = _targetLevelForZoom(_osmMap.getZoom(), tiling);
    _renderLevel(targetZ);
  }

  // ── Carte + couches ──────────
  async function _renderMap() {
    const mapDiv = document.getElementById("kta-osm-map");
    if (!mapDiv) return;
    _osmMap = L.map(mapDiv, {
      worldCopyJump: false,
      attributionControl: true,
      zoomControl: false,   // boutons +/− selon le réglage (ktaBoutonsZoom)
      // preferCanvas : tracés, itinéraire et trace du tracker sur un seul canvas (des milliers de polylines sans
      // alourdir le DOM), comme map.js. Les imageOverlay (tuiles) restent en DOM.
      preferCanvas: true
    }).setView([46.5, 2.5], 6);
    if (typeof window.ktaBoutonsZoom === "function") window.ktaBoutonsZoom(_osmMap);
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

    // ⚠️ featureGroup, pas layerGroup : seul featureGroup a getBounds() (_centerOnPlan en dépend)
    // case 🖼️ Plan décochée à la fermeture : encore décochée à la réouverture, les tuiles doivent suivre
    _planLayer = L.featureGroup();
    if (_planTilesVisible) _planLayer.addTo(_osmMap);
    // 🩸 Opacité sur le PANE, pas sur chaque tuile : deux tuiles qui se chevauchent (transition de niveau,
    // liseré d'un pixel) s'additionneraient (50 % + 50 % ≈ 75 %, zone plus sombre). Tuiles opaques dans un
    // pane dédié, sous les tracés (canvas, 400).
    const paneTuiles = _osmMap.createPane(PANE_TUILES);
    paneTuiles.style.zIndex = "350";
    paneTuiles.style.opacity = String(_opacity);

    // open() a déjà filtré sur _isV2Plan() ; config changée pendant l'ouverture → log et sortie sans crash
    if (!_isV2Plan()) {
      console.warn("[OsmView] _renderMap : plan non V2 détecté à l'init render — abort safe.");
      _showErrorBanner(window.I18n.t("osm.error.notV2"));
      return;
    }

    const tiling = window.PLAN_CONFIG.tiling;
    const planW  = window.PLAN_CONFIG.plan.imageWidth  || 1;
    const planH  = window.PLAN_CONFIG.plan.imageHeight || 1;
    _proj = proj;  // mémo pour les handlers zoom / move

    // 1) bbox latlng du plan (4 coins)
    _planBbox = _computePlanBbox(proj, planW, planH);
    if (!_planBbox || !_planBbox.isValid()) {
      _showErrorBanner(window.I18n.t("osm.error.noBbox"));
      return;
    }

    // 2) niveau baseline
    _baseLevel       = _choisirNiveauBaseline(tiling, planW, planH);
    _baselineOsmZoom = _osmMap.getBoundsZoom(_planBbox);
    console.log("[OsmView] Baseline : zoom OSM=" + _baselineOsmZoom + " ↔ niveau plan z=" + _baseLevel + " (range [" + tiling.minNativeZoom + ".." + tiling.maxNativeZoom + "])");

    // 3) fitBounds AVANT le premier rendu : sinon getBounds() vaut la vue par défaut et le culling rejette
    // toutes les tuiles
    _osmMap.fitBounds(_planBbox, { padding: [40, 40] });

    // 4) rendu initial au niveau baseline
    await _renderLevel(_baseLevel);

    // 5) handler zoom / pan : changement de niveau + cull
    _moveEndHandler = _onMoveEnd;
    _osmMap.on("zoomend moveend", _moveEndHandler);
    // taille des icônes : aussi pendant l'animation (« zoom »), comme en mode plan
    _osmMap.on("zoom zoomend", _majTailleIconesOsm);
    _majTailleIconesOsm();

    // 🩸 L'init des niveaux PRÉCÈDE tout rendu dépendant du niveau : _visibleLevels est un état du module qui
    // survit entre deux ouvertures ; initialisé après les POI et tracés, il les filtrait avec le choix de la
    // modale précédente (niveau actif absent à l'ouverture). Garde-fou : scripts/check-osm-outils.js.
    _initVisibleLevels();

    // 🏷️ ancre:osm-rendu-poi
    // 6) POI session + data layers
    if (_poiVisible) _renderPoi();

    // 7) tracker (trace + position live)
    if (_trackerVisible) {
      _renderTracker();
      _startTrackerPolling();
    }

    // 8) tracés + itinéraire
    if (_roadVisible) _renderRoads();
    if (_itiVisible)  _renderItinerary();

    // 9) barre des niveaux, zones + structures
    _renderLevelsBar();
    if (_zoneVisible)   _renderZones();
    if (_structVisible) _renderStructures();
    // un re-rendu recrée les couches : la largeur des fronts se repose ici
    _majLargeurFrontsOsm();

    // 10) couche Mode Secours d'office si un scénario est actif à l'ouverture
    if (_secoursVisible && _hasActiveSecoursScenario()) {
      _renderSecoursLayer();
    }

    _applyOpacity();
  }

  // URL d'une tuile V2 : asset avec File sans blob URL → créée à la volée ; déjà extraite par tiling.js →
  // réutilisée ; tuile manquante → null.
  // ⚠️ asset.url est PARTAGÉ avec la carte principale (tiling.js) : jamais révoqué à la fermeture.
  // 🩸 Plan servi en HTTP (la prod) : RUNTIME_ASSETS est VIDE (il ne contient que les plans importés en ZIP).
  // Sans le repli serveur (ktaRacineTuilesServeur, partagé avec planOffline), POI et tracés flottent sur
  // OSM sans le plan, et rien ne le signale.
  function _racineTuilesServeur() {
    try {
      return (typeof window.ktaRacineTuilesServeur === "function")
        ? window.ktaRacineTuilesServeur(window.PLAN_CONFIG) : null;
    } catch(e) { return null; }
  }
  function _resolveTileUrl(path) {
    const asset = window.RUNTIME_ASSETS && window.RUNTIME_ASSETS[path];
    if (!asset) {
      // `path` = "data/tiles/z<N>/x<col>_y<-k>.<ext>" : la racine serveur remplace le préfixe "data/tiles"
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
      '<div style="display:flex; align-items:center; justify-content:center; height:100%; padding:20px; color:var(--kta-avert); text-align:center; font-size:14px;">' +
        msg +
      '</div>';
  }

  // ── API publique ──────────
  async function open() {
    if (typeof L === "undefined" || !L.imageOverlay || !L.imageOverlay.rotated) {
      window.ktaAlerte(window.I18n.t("osm.open.leafletMissing"), { type: "erreur" });
      return;
    }
    if (!_hasGeoref()) {
      window.ktaAlerte(window.I18n.t("osm.open.noGeoref"));
      return;
    }
    // 🩸 Plans tuilés seulement (crash GPU mobile, cf en-tête) ; sinon alerte qui explique comment tuiler.
    if (!_isV2Plan()) {
      window.ktaAlerte(window.I18n.t("osm.open.notV2"));
      return;
    }
    if (_isIncognitoOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("osm.open.incognito.toast"), "warn");
      } else { window.ktaAlerte(window.I18n.t("osm.open.incognito.alert")); }
      return;
    }
    // Hors ligne avec cache OSM du plan : ouverture en mode dégradé (le Service Worker sert les tuiles depuis
    // IndexedDB). ⚠️ Recheck immédiat (await) avant de bloquer : la flag peut dater du boot (PLAN_CONFIG pas
    // prêt) ; au clic, le plan est chargé et la bbox résolvable.
    if (!_isOnline()) {
      try { await _recheckCachedForCurrentPlan(); } catch(e) {}
      if (!_planHasCachedTiles) {
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(window.I18n.t("osm.open.offlineNoCache.toast"), "warn");
        } else { window.ktaAlerte(window.I18n.t("osm.open.offlineNoCache.alert")); }
        return;
      }
    }
    if (!isOptedIn()) {
      const yes = await window.ktaConfirm(window.I18n.t("osm.open.optInConfirm"));
      if (!yes) return;
      setOptedIn(true);
    }
    // Ping fiable avant d'ouvrir : navigator.onLine a des faux négatifs (Wi-Fi connecté, FAI en panne).
    // Fetch HTTPS de /ping.html (même origine, 5 s) ; KO → toast et abandon (pas de modale aux tuiles vides).
    // Cache OSM du plan présent → pas de ping (le SW sert depuis IDB ; en mode avion le ping échouerait à tort).
    if (_planHasCachedTiles) {
      if (_modalEl) close();
      _modalEl = _buildModal();
      setTimeout(_renderMap, 50);
      return;
    }
    _pingThenOpen();
  }

  function _pingThenOpen() {
    // overlay d'attente pendant le ping (5 s max)
    const waitOverlay = document.createElement("div");
    waitOverlay.className = "kta-modal-overlay";
    waitOverlay.style.cssText = "z-index:100050;";
    waitOverlay.innerHTML =
      '<div class="kta-modal" style="max-width:340px;">' +
        '<div class="kta-modal-icon" style="font-size:32px;">⏳</div>' +
        '<div class="kta-modal-titre">' + window.I18n.t("osm.ping.title") + '</div>' +
        '<div class="kta-modal-texte" style="font-size:13px; color:var(--kta-texte-3);">' + window.I18n.t("osm.ping.text") + '</div>' +
      '</div>';
    document.documentElement.appendChild(waitOverlay);

    const pingFn = (typeof window._pingInternet === "function") ? window._pingInternet : null;
    const pingPromise = pingFn
      ? pingFn()
      : Promise.resolve(navigator.onLine !== false);  // repli si le helper n'est pas chargé

    // ⚠️ .finally() retire l'overlay d'attente sur TOUS les chemins de sortie, exceptions comprises.
    pingPromise.then(function(online) {
      if (!online) {
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(window.I18n.t("osm.ping.noInternet"), "warn");
        } else {
          window.ktaAlerte(window.I18n.t("osm.ping.noInternet"));
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
    // Rendre la main au mode plan : la variable de largeur est partagée, la laisser au zoom OSM donnerait au
    // plan une largeur qui n'est pas la sienne.
    try {
      if (typeof window.majLargeurFronts === "function") window.majLargeurFronts();
      else document.documentElement.style.removeProperty("--kta-front-w");
    } catch (e) {}
    if (_osmMap && _moveEndHandler) {
      try { _osmMap.off("zoomend moveend", _moveEndHandler); } catch(e) {}
    }
    _moveEndHandler = null;
    // ⚠️ PAS de révocation des asset.url : partagés avec tiling.js (carte principale)
    _tilesByPath = {};
    _planBbox        = null;
    _proj            = null;
    _baselineOsmZoom = null;
    _baseLevel       = null;
    _currentLevel    = null;

    if (_poiLayer) {
      try { _poiLayer.clearLayers(); } catch(e) {}
      _poiLayer = null;
    }

    _stopTrackerPolling();
    if (_trackerLayer) {
      try { _trackerLayer.clearLayers(); } catch(e) {}
      _trackerLayer = null;
    }
    _trackerTrace  = null;
    _trackerMarker = null;

    if (_roadLayer) { try { _roadLayer.clearLayers(); } catch(e) {} _roadLayer = null; }
    if (_itiLayer)  { try { _itiLayer.clearLayers();  } catch(e) {} _itiLayer  = null; }

    if (_zoneLayer)   { try { _zoneLayer.clearLayers();   } catch(e) {} _zoneLayer   = null; }
    if (_structLayer) { try { _structLayer.clearLayers(); } catch(e) {} _structLayer = null; }
    if (_secoursLayer) { try { _secoursLayer.clearLayers(); } catch(e) {} _secoursLayer = null; }
    _visibleLevels = null;
    // filtre tag local remis à zéro (pas persistant entre ouvertures)
    _osmLocalTagFilter = null;
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
    // bbox GPS du plan (L.LatLngBounds | null) pour le briefing PDF du Mode Secours
    getPlanGpsBbox: _getPlanGpsBbox,
    // rafraîchit _planHasCachedTiles (lue par isAvailable) : main.js au boot, osmHomePreview après cache,
    // secoursMode au besoin
    recheckOfflineCache: _recheckCachedForCurrentPlan
  };

  // Recheck du cache différé : OsmTilesCache et PLAN_CONFIG doivent être prêts (~1 s après le boot).
  setTimeout(function() {
    if (window.OsmTilesCache && typeof window.OsmTilesCache.init === "function") {
      window.OsmTilesCache.init().then(_recheckCachedForCurrentPlan);
    }
  }, 1500);

  console.log("[OsmView] Module chargé (v1.43.0).");
})();
