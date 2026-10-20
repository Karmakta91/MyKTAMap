/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// osmHomePreview.js — widget « Vue OSM » de l'accueil : les plans géoréférencés sur OpenStreetMap.
// =====================================================================
// Mini-carte du HOME (plein écran au ⛶, Échap pour réduire), sans charger le plan en mode carte. Un plan
// principal (liste déroulante) + d'autres empilés (modale « Plans & filtres » : ordre, opacité, filtres).
// Expose : window.OsmHomePreview = { mount, refresh, selectPlan, openFullScreen }.
// Données : plans de PlanRegistry, géoréf par KmzExport.getCalibration puis registre (p.georef) ; contenu
// (POI, tracés, zones, structures, tuiles) lu dans le ZIP, ou en HTTP pour un plan serveur, via
// _loadPlanDataForPreview, isolé de window.PLAN_CONFIG, mis en cache RAM par plan.
// 🩸 PLAN_CONFIG est VIDE au HOME : un géoréf seulement embarqué n'est connu qu'après un premier chargement
// du plan (main.js > _propagerGeorefVersKmzExport le dépose dans le registre).
// 🩸 La légende personnalisée se relit PAR PLAN (slot de session, puis customLegend du plan-config) :
// l'état live de LegendCustomization est vide ou celui d'un autre plan au HOME. Exception documentée à
// check-style-canon (palette propre, pas de ktaResolveStyle).
// ⚠️ _isOptedIn doit rester identique à OsmView.isOptedIn (osmView.js) ; défaut actif annoncé par bandeau.
// 🔒 Pas d'opt-in → colonne masquée ; incognito → widget bloqué : aucun appel sortant dans les deux cas.
// Garde-fous : scripts/check-osm-defaut.js, check-osm-pile.js, check-osm-etiquettes.js, check-icon-catalog.js ·
// Doc : docs/architecture/vue-osm.md.

(function() {
  "use strict";

  const LS_OPT_IN_KEY = "myktamap_osm_view_opt_in";
  const LS_LAST_SEL_KEY = "myktamap_osm_home_last_selected_plan";
  const OSM_TILE_URL  = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const OSM_ATTR      = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';
  const OSM_MAX_ZOOM  = 19;

  let _mapInstance   = null;  // mini-carte
  let _markerLayer   = null;  // markers du géoréf + ligne
  let _dataLayer     = null;  // parent des sous-couches par catégorie
  let _poiSubLayer       = null;
  let _roadsSubLayer     = null;
  let _zonesSubLayer     = null;
  let _structSubLayer    = null;
  // bascules par catégorie (ON par défaut)
  let _showTiles       = true;
  let _showPoi         = true;
  let _showRoads       = true;
  let _showZones       = true;
  let _showStructures  = true;
  // Liaisons inter-plans : OFF par défaut, ce n'est pas du contenu mais un OUTIL DE DIAGNOSTIC — un grand
  // écart entre les deux bouts d'un portail (même lieu physique) signale un géoréférencement à revoir.
  let _showPortails    = false;
  let _portailsLayer   = null;  // reconstruit à chaque rendu
  let _selectedPlanId = null;
  let _isFullscreen  = false; // overlay plein écran
  let _fsEscapeHandler = null; // pour le nettoyage
  let _lastFitGeoref = null;  // géoréf du plan courant, pour recadrer au resize
  let _miniFitDone   = false; // cadré avec une taille de conteneur réelle (> 0)
  // Cache RAM planId → { config, dataLayers, tilesOverview? } : pas de ré-extraction du ZIP pendant la
  // session HOME (rien en localStorage).
  const _planDataCache = {};
  let _tilesLayer     = null;   // tuiles du plan projetées
  let _planOpacity    = 0.5;    // opacité du plan principal (50 % : compromis lecture OSM + plan)

  // ── Multi-plans ──────────
  // Le plan SÉLECTIONNÉ reste le principal (fitBounds, opacité). Les autres plans géoréférencés s'ajoutent
  // par le panneau 🗂️. RAM seulement : la composition est un geste de session.
  //   _stackOrder   : planIds dans l'ordre d'affichage, index 0 = AU-DESSUS (principal compris).
  //   _extraLayers  : planId → { tiles, data, poi, roads, zones, struct } (plans non principaux).
  //   _extraOpacity : planId → 0..1 (le principal garde _planOpacity).
  // ⚠️ Les blob URLs des tuiles vivent dans _planDataCache, jamais révoquées tant que la page vit : retirer
  // puis rajouter un plan est gratuit.
  let _stackOrder   = [];
  let _extraLayers  = {};
  let _extraOpacity = {};

  // 🩸 RÈGLE UNIQUE de promotion d'un principal dans la pile, partagée par selectPlan et _renderWidget
  // (re-mount au retour HOME) — sinon l'ancien principal reste en fantôme, sans groupe extra, et ✕ le refuse.
  //   - nouveau absent de la pile → il PREND LA PLACE de l'ancien (ou passe au-dessus s'il n'y en avait pas) ;
  //   - nouveau déjà dans la pile → l'ancien principal en SORT.
  // Pure (n'agit que sur `pile`) : exécutée par scripts/check-osm-pile.js.
  function _remplacerPrincipalDansPile(pile, prev, next) {
    if (!next) return pile;
    if (pile.indexOf(next) === -1) {
      const iPrev = (prev && prev !== next) ? pile.indexOf(prev) : -1;
      if (iPrev !== -1) pile[iPrev] = next;
      else pile.unshift(next);
    } else if (prev && prev !== next) {
      const iPrev = pile.indexOf(prev);
      if (iPrev !== -1) pile.splice(iPrev, 1);
    }
    return pile;
  }
  let _warnedMulti  = false;   // avertissement « > 3 plans » (une fois par session)

  // Visibilités PAR PLAN (tuiles + 4 catégories) ; effective = bascule GLOBALE du bandeau ET chip du plan.
  // Clé = planId, principal compris.
  let _planVis = {};
  function _visDe(id) {
    if (!id) return { tiles: true, poi: true, roads: true, zones: true, struct: true };
    if (!_planVis[id]) _planVis[id] = { tiles: true, poi: true, roads: true, zones: true, struct: true };
    return _planVis[id];
  }

  // Repli aligné sur structures.js > STRUCTURE_STYLES, allégé pour la mini-carte (weight, fillOpacity).
  const STRUCT_STYLES_HOME = {
    "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.70, weight: 1, isPolyline: false },
    "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.70, weight: 1, isPolyline: false },
    "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.70, weight: 1, isPolyline: false },
    "front-1":  { color: "#f4c542", weight: 4, opacity: 0.95, isPolyline: true },
    "front-2":  { color: "#ff9933", weight: 4, opacity: 0.95, isPolyline: true }
  };
  // Couleurs natives des tracés par type (repli aligné sur road.js / utils.js).
  const ROAD_STYLES_DATA_HOME = {
    "principal":  "#00ff00",
    "secondaire": "#b000ff",
    "chemin":     "#ffff00",
    "jonction":   "#ff4ecb",  // rose (pointillé sur la carte principale, plein ici)
    "itinerary":  "#00d4ff"   // = ITI_COLOR d'osmView.js
  };
  // Zones par type (repli aligné sur zones.js > ZONE_STYLES). Cascade : couleur explicite > override de
  // légende du plan > type built-in > custom > gris.
  const ZONE_STYLES_DATA_HOME = {
    "eau":          { stroke: "#0066aa", fill: "#3aa9e8" },
    "remblais":     { stroke: "#3a3a44", fill: "#5a5a68" },
    "effondrement": { stroke: "#cc0000", fill: "#ff3333" },
    "inaccessible": { stroke: "#5a0a0a", fill: "#b8743c" }
  };
  // ── Overrides de légende PAR PLAN ──────────
  // 🩸 Pas de ktaResolveStyle ici (contrairement à osmView) : le canon applique l'état LIVE de
  // LegendCustomization, VIDE au HOME après un boot froid (le cas normal) ou celui du DERNIER plan chargé
  // (faux pour les autres plans de la pile). Source correcte par plan : son slot de session
  // (KtaSessionStore.lire(id) → payload.customLegend, auto-sauvé ~1,5 s en mode plan), puis le customLegend
  // du plan-config (ZIP). Cache RAM par planId, invalidé au mount() (le retour HOME reprend les modifs).
  let _legendeParPlan = {};

  function _legendeDe(planId) {
    if (!planId) return null;
    if (Object.prototype.hasOwnProperty.call(_legendeParPlan, planId)) return _legendeParPlan[planId];
    let sess = null;
    try {
      const p = (window.SessionPersist && typeof window.SessionPersist.getSaved === "function")
        ? window.SessionPersist.getSaved(planId) : null;
      if (p && p.customLegend) sess = p.customLegend;
    } catch(e) {}
    let plan = null;
    const cache = _planDataCache[planId];
    const cfg   = cache && cache.config;
    // même double lecture que legendCustomization.loadPlanState : plan.customLegend, sinon racine
    if (cfg) plan = (cfg.plan && cfg.plan.customLegend) || cfg.customLegend || null;
    const out = (sess || plan) ? { session: sess || {}, plan: plan || {} } : null;
    _legendeParPlan[planId] = out;
    return out;
  }

  // Couleur d'override d'un type built-in pour UN plan ; quoi = "colors" | "borders".
  function _couleurOverrideDe(planId, categorie, type, quoi) {
    const lg = _legendeDe(planId);
    if (!lg || !type) return null;
    const k = categorie + "." + type;
    const s = lg.session[quoi];
    if (s && typeof s[k] === "string" && s[k]) return s[k];
    const p = lg.plan[quoi];
    if (p && typeof p[k] === "string" && p[k]) return p[k];
    return null;
  }

  // Entrée custom (cust-…) pour UN plan (session > plan).
  function _entreeCustomDe(planId, type) {
    const lg = _legendeDe(planId);
    if (!lg || !type) return null;
    function chercher(arr) {
      if (!Array.isArray(arr)) return null;
      for (const e of arr) { if (e && e.id === type) return e; }
      return null;
    }
    return chercher(lg.session.customEntries) || chercher(lg.plan.customEntries);
  }

  function _resolveRoadColorHome(r, planId) {
    if (r && typeof r.color === "string" && r.color) return r.color;
    const ov = r && _couleurOverrideDe(planId, "traces", r.type, "colors");
    if (ov) return ov;
    if (r && r.type && ROAD_STYLES_DATA_HOME[r.type]) return ROAD_STYLES_DATA_HOME[r.type];
    const ce = r && _entreeCustomDe(planId, r.type);
    if (ce && (!ce.category || ce.category === "traces") && ce.lineColor) return ce.lineColor;
    // dernier recours : état live (plan chargé dont le slot n'est pas encore écrit)
    if (r && r.type && window.LegendCustomization
        && typeof window.LegendCustomization.findCustomEntry === "function") {
      try {
        const e = window.LegendCustomization.findCustomEntry(r.type);
        if (e && e.category === "traces" && e.lineColor) return e.lineColor;
      } catch(_) {}
    }
    return "#8892a4";
  }
  // Style d'une structure, types CUSTOM compris.
  // 🩸 Pas de `STRUCT_STYLES_HOME[s.type] || …["mur"]` seul : un `cust-…` n'y est pas et toutes les
  // structures personnalisées tomberaient sur « mur » (une couleur pour tous les niveaux, un POLYGONE même
  // pour un front). La forme vient de `entry.geometry`, le champ lu par structures.js > _isPolylineType.
  function _styleStructHome(s, planId) {
    const base = STRUCT_STYLES_HOME[s.type];
    if (base) return Object.assign({}, base);
    const ce = _entreeCustomDe(planId, s.type);
    if (ce && (!ce.category || ce.category === "structures")) {
      const ligne = (ce.geometry === "polyline");
      const gabarit = Object.assign({}, STRUCT_STYLES_HOME[ligne ? "front-1" : "mur"]);
      const c = ce.lineColor || ce.borderColor || ce.fillColor;
      if (ligne) { if (c) gabarit.color = c; }
      else {
        if (ce.fillColor)   gabarit.fillColor = ce.fillColor;
        if (ce.borderColor) gabarit.color     = ce.borderColor;
        else if (c)         gabarit.color     = c;
      }
      gabarit.isPolyline = ligne;
      return gabarit;
    }
    // type inconnu et absent de la légende : repli « mur »
    return Object.assign({}, STRUCT_STYLES_HOME["mur"]);
  }

  function _resolveZoneColorsHome(z, planId) {
    if (z && (z.color || z.fillColor)) {
      return {
        stroke: z.color     || z.fillColor || "#8892a4",
        fill:   z.fillColor || z.color     || "#8892a4"
      };
    }
    // override par plan : remplissage choisi, bordure explicite ou assombrie (même relation que le canon)
    const fillOv   = z && _couleurOverrideDe(planId, "zones", z.type, "colors");
    const borderOv = z && _couleurOverrideDe(planId, "zones", z.type, "borders");
    if (fillOv || borderOv) {
      const base = (z && z.type && ZONE_STYLES_DATA_HOME[z.type]) || null;
      const fill = fillOv || (base ? base.fill : (borderOv || "#8892a4"));
      let stroke = borderOv;
      if (!stroke) {
        if (fillOv && typeof window.ktaAssombrir === "function") stroke = window.ktaAssombrir(fillOv, 0.62);
        else stroke = base ? base.stroke : fill;
      }
      return { stroke: stroke, fill: fill };
    }
    if (z && z.type && ZONE_STYLES_DATA_HOME[z.type]) return ZONE_STYLES_DATA_HOME[z.type];
    const ce = z && _entreeCustomDe(planId, z.type);
    if (ce && (!ce.category || ce.category === "zones")) {
      return {
        stroke: ce.borderColor || ce.lineColor || ce.fillColor || "#8892a4",
        fill:   ce.fillColor   || ce.lineColor || "#8892a4"
      };
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
  // Filet de secours seulement : la référence est `window._ktaBuiltinIconUrls` (map.js > TAGS_BUILTIN),
  // exposée dès le chargement du script, donc lisible au HOME. Cette copie ne sert que sans map.js.
  // 🩸 Une copie dérive (un point portail tombait sur le rond de secours) : scripts/check-icon-catalog.js
  // (pré-commit bloquant) confronte les deux.
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
    danger:   "icon/danger.png", plaque: "icon/plaque.png",
    portail:  "icon/portail.png",
    entree_plan: 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
        '<circle cx="25" cy="25" r="23" fill="#f4c542" stroke="#1a1f2e" stroke-width="2.5"/>' +
        '<rect x="17" y="13" width="16" height="26" fill="#1a1f2e" rx="1"/>' +
        '<rect x="19" y="15" width="12" height="22" fill="#f4c542" rx="0.5"/>' +
        '<circle cx="28.5" cy="26" r="1.5" fill="#1a1f2e"/>' +
      '</svg>'
    )
  };
  // blob URLs des icônes de POI
  let _iconBlobUrls = [];
  // filtre par tag : null = tout ; Set non vide = seulement ces tags
  let _homeTagFilter = null;
  // Filtre par niveau : même convention que le filtre par tag (`null` ou Set vide = tout). Sans lui, un relevé
  // à plusieurs niveaux les dessine tous les uns sur les autres et devient illisible.
  let _homeLevelFilter = null;

  // sans `level` = niveau 0 (convention de l'app, cf road.js ; un plan mono-niveau n'écrit pas ce champ)
  function _niveauDe(o) { return (o && typeof o.level === "number") ? o.level : 0; }
  function _passeNiveau(o) {
    if (!_homeLevelFilter || _homeLevelFilter.size === 0) return true;
    return _homeLevelFilter.has(_niveauDe(o));
  }
  // « 📍 Moi » : un fix ponctuel, rien stocké
  let _myGpsMarkerHome         = null;
  let _myGpsAccuracyCircleHome = null;

  // ── Opt-in et état ──────────
  // ⚠️ MÊME RÈGLE que OsmView.isOptedIn (osmView.js), et elle doit le rester : "0" = refus → OFF ; absent ou
  // "1" → ON (scripts/check-osm-defaut.js exécute les deux).
  function _isOptedIn() {
    try { return localStorage.getItem(LS_OPT_IN_KEY) !== "0"; } catch(e) { return false; }
  }

  // 🩸 « Actif parce que jamais refusé » n'est PAS « actif parce que choisi » : tant que la clé est absente,
  // on l'annonce (un fond de carte servi par un tiers apparaît sans avoir été demandé).
  function _estActifParDefaut() {
    try { return localStorage.getItem(LS_OPT_IN_KEY) === null; } catch(e) { return false; }
  }
  // l'opt-in s'écrit via OsmView.setOptedIn (Configuration HOME)
  function _isOnline() {
    return (typeof navigator === "undefined") || navigator.onLine !== false;
  }

  // Cache OSM hors ligne : « au moins une tuile en cache quelque part » (synchrone). Au mount(), décide si le
  // widget est bloqué hors ligne (cache vide partout) ou monté, selectPlan() arbitrant plan par plan.
  // Rafraîchi en async par getStats() : boot, après chaque cache, événement.
  let _anyCachePresent = false;
  async function _refreshAnyCachePresent() {
    try {
      if (!window.OsmTilesCache) { _anyCachePresent = false; return; }
      const s = await window.OsmTilesCache.getStats();
      const before = _anyCachePresent;
      _anyCachePresent = (s.count > 0);
      // de « rien » à « quelque chose » hors ligne : re-mount pour rendre le widget accessible
      if (!before && _anyCachePresent && !_isOnline()) {
        refresh();
      }
    } catch(e) {}
  }

  // Bbox approximative d'un plan d'après ses 2 points calibrés (pour hasCacheForBbox).
  function _bboxFromGeoref(georef) {
    try {
      if (!_isValidGeoref(georef)) return null;
      return L.latLngBounds(
        [georef.pointA.lat, georef.pointA.lng],
        [georef.pointB.lat, georef.pointB.lng]
      );
    } catch(e) { return null; }
  }
  // 🔒 Comme la modale OsmView : en incognito, aucune tuile OSM.
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

  // ── Liste des plans géoréférencés ──────────
  // Array<{ id, name, georef, tags }> des plans à calibration GPS valide, du plus récemment ouvert au plus ancien.
  function _listGeorefPlans() {
    if (!window.PlanRegistry || typeof window.PlanRegistry.getAll !== "function") return [];
    if (!window.KmzExport   || typeof window.KmzExport.getCalibration !== "function") return [];
    const all = window.PlanRegistry.getAll() || [];
    const out = [];
    for (const p of all) {
      if (!p || !p.id) continue;
      // 🩸 DEUX SOURCES, comme osmView.js : le localStorage (saisie de l'utilisateur) prime ; le registre porte le
      // géoréf embarqué, déposé au chargement (main.js > _propagerGeorefVersKmzExport). Sans ce second recours,
      // un plan importé du SIG — calé par construction — manquerait à la liste.
      const g = window.KmzExport.getCalibration(p.id) || p.georef;
      if (_isValidGeoref(g)) {
        // `tags` : les étiquettes de plan du registre (ajout à la pile par étiquette)
        out.push({ id: p.id, name: (window.PlanRegistry.displayName ? window.PlanRegistry.displayName(p) : (p.name || p.id)), georef: g, lastOpened: p.lastOpened || 0,
                   tags: Array.isArray(p.tags) ? p.tags : [] });
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

  // ── Colonne masquée sans opt-in ──────────
  // Aucune trace du widget tant qu'OSM n'est pas autorisé (hors-ligne d'abord) ; la colonne revient au
  // refresh après l'opt-in.
  function _setOsmColumnVisible(visible) {
    const col = document.querySelector(".loader-col-osm");
    const grid = document.querySelector(".loader-grid");
    if (col) col.style.display = visible ? "" : "none";
    // `.kta-no-osm` repasse le grid PC en 2 colonnes (pas de trou)
    if (grid) {
      if (visible) grid.classList.remove("kta-no-osm");
      else grid.classList.add("kta-no-osm");
    }
  }

  // ── Rendus des cas particuliers ──────────
  function _renderOptInNeeded(container) {
    // colonne entièrement masquée (pas de placeholder) ; on active OSM par ⚙️ Configuration
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

  // 🔒 Incognito : bloqué, aucune trace d'un plan géoréférencé chargé.
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

  // 🩸 « Aucun plan géoréférencé » peut être FAUX : `p.georef` du registre n'est écrit qu'au CHARGEMENT du plan
  // (main.js > _propagerGeorefVersKmzExport). Un plan jamais ouvert peut être calé dans son plan-config et
  // rester invisible ici.
  // ⚠️ On ne va PAS lire les plans pour le savoir (ouvrir chaque ZIP, ou une requête par plan serveur, au
  // chargement de l'accueil). On dit ce qu'on sait, en trois messages :
  //   A. bibliothèque vide              → « commence par charger un plan »
  //   B. des plans, aucun jamais ouvert → « ouvre-les une fois »
  //   C. des plans ouverts, aucun calé  → message d'origine + le compte des plans jamais ouverts (calibration
  //      inconnue, pas absente)
  function _renderNoGeorefPlans(container) {
    const tous = (window.PlanRegistry && typeof window.PlanRegistry.getAll === "function")
      ? (window.PlanRegistry.getAll() || []) : [];
    const jamaisOuverts = tous.filter(function(p) { return p && !p.lastOpened; }).length;

    let cle = "nogeoref", extra = "";
    if (tous.length === 0)                 cle = "noplan";
    else if (jamaisOuverts === tous.length) cle = "jamaisouvert";
    else if (jamaisOuverts > 0) {
      extra = '<br><br>' + window.I18n.t("osm_home.nogeoref.reste", { n: jamaisOuverts });
    }

    container.innerHTML =
      '<div class="kta-osm-home-empty">' +
        '<div style="font-size:32px;">' + (cle === "nogeoref" ? "📍" : "📂") + '</div>' +
        '<div><strong>' + window.I18n.t("osm_home." + cle + ".title") + '</strong></div>' +
        '<div style="max-width:300px; font-size:12px; line-height:1.6;">' +
          window.I18n.t("osm_home." + cle + ".body") + extra +
        '</div>' +
      '</div>';
  }

  // ── Widget complet (carte) ──────────
  // Remet la pile à un seul plan, celui qu'on vient de quitter. Séparée de `mount` pour être exécutable par
  // le garde-fou ; rend la pile obtenue.
  function _reinitialiserPileAuRetour(planId) {
    _stackOrder.slice().forEach(function(id) {
      if (id === planId) return;
      const g = _extraLayers[id];
      if (g) {
        try {
          if (_mapInstance) {
            if (_mapInstance.hasLayer(g.tiles)) _mapInstance.removeLayer(g.tiles);
            if (_mapInstance.hasLayer(g.data))  _mapInstance.removeLayer(g.data);
          }
          g.tiles.clearLayers(); g.data.clearLayers();
        } catch(e) {}
        delete _extraLayers[id];
      }
      try { _retirerHiRes(id); } catch(e) {}
    });
    _stackOrder.length = 0;
    _stackOrder.push(planId);
    return _stackOrder;
  }

  function _renderWidget(container, plans, selectedId) {
    const sel = plans.find(function(p) { return p.id === selectedId; }) || plans[0];
    const _prevPrimary = _selectedPlanId;
    _selectedPlanId = sel.id;
    // 🩸 Ce chemin ne passe pas par selectPlan : le principal doit entrer dans _stackOrder (sinon ni curseur
    // d'opacité ni tags dans la modale), et l'ANCIEN principal en sortir (sinon fantôme inamovible) — même
    // règle que selectPlan.
    _remplacerPrincipalDansPile(_stackOrder, _prevPrimary, sel.id);

    // bandeau (liste + ⛶) + mini-carte + pied
    let optionsHtml = "";
    for (const p of plans) {
      const selected = (p.id === sel.id) ? " selected" : "";
      optionsHtml +=
        '<option value="' + _escapeHtml(p.id) + '"' + selected + '>' +
          _escapeHtml(p.name) +
        '</option>';
    }

    container.innerHTML =
      '<div class="kta-osm-home-bandeau">' +
        '<select id="ktaOsmHomePlanSelect" title="' + _escapeHtml(window.I18n.t("osm_home.select.title")) + '">' +
          optionsHtml +
        '</select>' +
        // « 📍 Moi » : un fix ponctuel, rien stocké
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeMyGpsBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_home.gps.btnTitle")) + '" ' +
                'style="background: rgba(0,212,255,0.12); border-color: rgba(0,212,255,0.4); color: #00d4ff;">' +
          '📍' +
        '</button>' +
        // cache hors ligne (partagé avec la modale Vue OSM et le Mode Secours, store IDB myktamap_osm_tiles)
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeCacheBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_home.cache.btnTitle")) + '" ' +
                'style="background: rgba(166,215,133,0.10); border-color: rgba(166,215,133,0.35); color: #a6d785;">' +
          '💾' +
        '</button>' +
        // Multi-plans (priorités, opacités, filtres par plan) : dans une MODALE, rien sur la carte.
        // Mesure : en vue OSM elle ne dépend d'AUCUN calibrage (les coordonnées sont déjà des lat/lng), donc plus
        // fiable qu'en mode plan où une échelle fausse fausse tout.
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeMesureBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_mes.btnTitle")) + '">' +
          '📏' +
        '</button>' +
        // relevé des coordonnées GPS de surface d'un point ; à côté de la mesure (même famille, même `click`)
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeCoordBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm.coords.btnTitle")) + '">' +
          '🎯' +
        '</button>' +
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeFiltersBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_mode.filters.btnTitle")) + '" ' +
                'style="background: rgba(244,197,66,0.10); border-color: rgba(244,197,66,0.4); color: var(--kta-accent-texte);">' +
          '≡' +
        '</button>' +
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeFullBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_home.fullscreen.enterTitle")) + '">' +
          '⛶' +
        '</button>' +
      '</div>' +
      // Recherche PROPRE au mode OSM (plein écran seulement, CSS .kta-osm-home-fullscreen-active). 100 % LOCALE :
      // les plans géoréférencés et leurs POI (cache RAM) — aucune recherche d'adresse, aucune requête réseau.
      '<div class="kta-osm-home-search" id="ktaOsmHomeSearch">' +
        '<input type="search" id="ktaOsmHomeSearchInput" ' +
               'placeholder="' + _escapeHtml(window.I18n.t("osm_mode.search.placeholder")) + '" autocomplete="off">' +
        '<div class="kta-osm-home-search-results" id="ktaOsmHomeSearchResults" style="display:none;"></div>' +
      '</div>' +

      // opacité par plan, filtres globaux et tags vivent dans la modale « 🎚️ Plans & filtres »
      '<div class="kta-osm-home-map" id="ktaOsmHomeMap"></div>' +
      '<div class="kta-osm-home-footer">' +
        window.I18n.t("osm_home.footer.tiles") + ' ' +
        // stats du cache hors ligne
        '<span id="ktaOsmHomeCacheStats" title="' + _escapeHtml(window.I18n.t("osm_home.cache.statsTitle")) + '">📦 …</span>' +
      '</div>';

    const dropdown = container.querySelector("#ktaOsmHomePlanSelect");
    if (dropdown) {
      dropdown.addEventListener("change", function(e) {
        selectPlan(e.target.value);
      });
    }
    const fullBtn = container.querySelector("#ktaOsmHomeFullBtn");
    if (fullBtn) {
      fullBtn.addEventListener("click", openFullScreen);
    }
    _bindOsmSearch(container);
    // La barre de recherche reste où le HTML la crée (pleine largeur entre bandeau et carte). Purge défensive
    // d'un exemplaire accroché au head (hors container, il survit aux re-rendus du widget).
    (function _purgerRechercheDuHead() {
      const head = document.querySelector("#ktaOsmHomeBox .loader-section-head");
      const ancien = head && head.querySelector("#ktaOsmHomeSearch");
      if (ancien) ancien.remove();
    })();
    // panneau multi-plans
    const filtresBtn = container.querySelector("#ktaOsmHomeFiltersBtn");
    if (filtresBtn) {
      filtresBtn.addEventListener("click", _ouvrirModalFiltresOsm);
    }
    // chaque outil se démonte seul au second clic (`activer` appelle `desactiver`)
    const coordBtn = container.querySelector("#ktaOsmHomeCoordBtn");
    if (coordBtn) {
      coordBtn.addEventListener("click", function () {
        if (window.OsmCoords) window.OsmCoords.activer(_mapInstance);
      });
    }
    const mesureBtn = container.querySelector("#ktaOsmHomeMesureBtn");
    if (mesureBtn) {
      mesureBtn.addEventListener("click", function () {
        if (window.OsmMesure) window.OsmMesure.activer(_mapInstance);
      });
    }
    const myGpsBtn = container.querySelector("#ktaOsmHomeMyGpsBtn");
    if (myGpsBtn) {
      myGpsBtn.addEventListener("click", _showMyGpsPositionHome);
    }
    const cacheBtn = container.querySelector("#ktaOsmHomeCacheBtn");
    if (cacheBtn) {
      cacheBtn.addEventListener("click", _runCacheTilesHome);
    }
    _refreshCacheStatsHome();

    // mini-carte initialisée en différé (le DOM se peint d'abord)
    setTimeout(function() { _initMiniMap(sel.georef); }, 50);

    _saveLastSelected(sel.id);
  }

  // ── Mini-carte Leaflet ──────────
  function _initMiniMap(georef) {
    const mapDiv = document.getElementById("ktaOsmHomeMap");
    if (!mapDiv) return;
    if (typeof L === "undefined") {
      console.warn("[OsmHomePreview] Leaflet indisponible, abandon init mini-map");
      return;
    }
    // refresh : nettoyage de l'ancienne instance
    if (_mapInstance) {
      _retirerToutHiRes(); // URLs hi-res éphémères : révoquées ici
      try { _mapInstance.remove(); } catch(e) {}
      _mapInstance = null;
      _panesParPlan = {};   // les panes appartiennent à la carte détruite
      _markerLayer = null;
      // Les plans AJOUTÉS (« + ») appartenaient à la carte détruite : on les sort de la pile plutôt que de lister
      // des fantômes. Le principal est reposé par _renderWidget ; les opacités restent dans _extraOpacity.
      Object.keys(_extraLayers).forEach(function(id) {
        delete _extraLayers[id];
        const iX = _stackOrder.indexOf(id);
        if (iX !== -1) _stackOrder.splice(iX, 1);
      });
      _dataLayer   = null;
      _tilesLayer  = null;
      _poiSubLayer = null;
      _roadsSubLayer = null;
      _zonesSubLayer = null;
      _structSubLayer = null;
      // marker GPS : sa carte est détruite
      _myGpsMarkerHome = null;
      _myGpsAccuracyCircleHome = null;
      // ⚠️ PAS de révocation des blob URLs : elles vivent dans _planDataCache et resservent au re-mount.
    }

    _mapInstance = L.map(mapDiv, {
      worldCopyJump: false,
      attributionControl: false, // mention compacte dans le pied du widget
      zoomControl: false,   // boutons +/− selon le réglage (ktaBoutonsZoom)
      preferCanvas: true
    }).setView([46.5, 2.5], 5);
    if (typeof window.ktaBoutonsZoom === "function") window.ktaBoutonsZoom(_mapInstance);

    L.tileLayer(OSM_TILE_URL, {
      maxZoom: OSM_MAX_ZOOM,
      attribution: OSM_ATTR,
      crossOrigin: true
    }).addTo(_mapInstance);

    _markerLayer = L.featureGroup().addTo(_mapInstance);
    _tilesLayer  = L.layerGroup().addTo(_mapInstance); // en premier = sous les données
    _dataLayer   = L.layerGroup().addTo(_mapInstance);
    // tuiles hi-res au zoom (débounce, cf section Tuiles hi-res)
    _mapInstance.on("zoomend moveend", _onCarteBougeHiRes);
    // largeur des fronts au zoom, comme en mode plan
    _mapInstance.on("zoomend", _majLargeurFrontsHome);
    _renderGeorefMarkers(georef);
    // 🩸 Leaflet mesure le conteneur AVANT que le DOM du HOME soit stable (rendu progressif ; sur mobile PWA à
    // froid, dimensions stables après 0,5 à 1,5 s) : tuiles OSM jamais chargées. Trois filets redondants :
    //   1. requestAnimationFrame après le prochain paint ;
    //   2. ResizeObserver sur le conteneur (déconnecté après 3 invalidations ou 5 s) ;
    //   3. timeouts de 100, 500 et 1500 ms si l'observer ne se déclenche pas.
    function _safeInvalidate() {
      if (!_mapInstance) return;
      // tant que le 1er cadrage n'a pas réussi, on retente le fit ; ensuite simple invalidateSize (on ne
      // reprend pas un déplacement de l'utilisateur)
      if (!_miniFitDone) { _fitToCurrentGeoref(); }
      else { try { _mapInstance.invalidateSize(); } catch(e) {} }
    }
    requestAnimationFrame(_safeInvalidate);
    setTimeout(_safeInvalidate, 100);
    setTimeout(_safeInvalidate, 500);
    setTimeout(_safeInvalidate, 1500);
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
      // filet : déconnexion après 5 s
      setTimeout(function() { try { ro.disconnect(); } catch(_) {} }, 5000);
    }
    // Extraction partielle async du contenu du plan ; ZIP inaccessible → le widget reste utilisable sans calques.
    if (_selectedPlanId) {
      _loadPlanDataForPreview(_selectedPlanId).then(function(data) {
        if (!data) return;
        // tuiles V2 EN PREMIER (sous les calques)
        if (data.tilesOverview) _renderTilesOnMiniMap(data.tilesOverview, georef);
        _renderDataLayersOnMiniMap(data, georef);
        _majLargeurFrontsHome();
        // tags de la modale ≡ (no-op si fermée)
        _renderModalTags();
        _renderModalNiveaux();
        _appliquerOrdre();   // renormalise les zIndex de la pile
        _appliquerVisibilites();
      });
    }
  }

  function _renderGeorefMarkers(georef) {
    if (!_mapInstance || !_isValidGeoref(georef)) return;
    if (_markerLayer) _markerLayer.clearLayers();

    // Pas de marqueurs A / B du géoréf à l'écran (décision produit) ; _markerLayer reste, vide, pour les
    // appelants éventuels.

    // nouveau plan : mémorise le géoréf et force un recadrage propre
    _lastFitGeoref = georef;
    _miniFitDone   = false;
    _fitToCurrentGeoref();
  }

  // 🩸 Cadrage : invalidateSize PUIS fitBounds, et seulement si le conteneur a une taille réelle (> 0). Un
  // fitBounds sur un conteneur de taille 0 calcule zoom et centre faux et aucune tuile de la bonne zone
  // n'est demandée. Pas de taille → _miniFitDone reste false et les filets de _initMiniMap retentent.
  // Une fois cadré, plus de re-fit (on ne reprend pas un pan / zoom de l'utilisateur).
  function _fitToCurrentGeoref() {
    if (!_mapInstance) return;
    try { _mapInstance.invalidateSize(false); } catch(e) {}
    if (!_isValidGeoref(_lastFitGeoref)) return;
    let sz = null;
    try { sz = _mapInstance.getSize(); } catch(e) {}
    if (!sz || sz.x <= 0 || sz.y <= 0) return; // conteneur pas encore dimensionné
    try {
      const bounds = L.latLngBounds([
        L.latLng(_lastFitGeoref.pointA.lat, _lastFitGeoref.pointA.lng),
        L.latLng(_lastFitGeoref.pointB.lat, _lastFitGeoref.pointB.lng)
      ]);
      if (bounds && bounds.isValid()) {
        _mapInstance.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
        _miniFitDone = true;
      }
    } catch(e) {
      console.warn("[OsmHomePreview] fitBounds échec :", e);
    }
  }

  // ── Extraction partielle du ZIP (POI, tracés, zones, structures) ──────────

  // File du ZIP : handle FS Access (Chrome / Edge PC) ou blob IDB (mobile, Firefox, Safari) ; null sinon
  // (plan serveur sans copie locale, blob purgé, permission refusée).
  async function _getPlanZipFile(planId) {
    if (!window.PlanRegistry) return null;
    try {
      const meta = await window.PlanRegistry.getHandle(planId);
      if (meta && meta.handle && typeof meta.handle.getFile === "function") {
        const ok = await window.PlanRegistry.ensureHandlePermission(meta.handle);
        if (ok) return await meta.handle.getFile();
      }
    } catch(e) {
      console.warn("[OsmHomePreview] FS handle échec :", e);
    }
    try {
      const blob = await window.PlanRegistry.getBlob(planId);
      if (blob) return blob;
    } catch(e) {
      console.warn("[OsmHomePreview] IDB blob échec :", e);
    }
    return null;
  }

  // Plan SERVEUR pour l'aperçu : même sortie `{ config, dataLayers, tilesOverview, iconUrls }` que la branche
  // ZIP, mais en HTTP (un plan serveur n'a ni handle ni blob). Chemins via `resolveServerPaths`, comme au
  // chargement réel, sinon aperçu et mode plan divergent sur les mêmes fichiers.
  // 🩸 Tuiles demandées à la racine SONDÉE (tiling.js > ktaResoudreRacineTuiles) : jamais devinée.
  async function _loadPlanDataServeur(plan) {
    const dir = String((plan && plan.path) || "").replace(/\/+$/, "");
    if (!dir) return null;
    let config;
    try {
      const r = await fetch(dir + "/plan-config.json");
      if (!r.ok) { console.warn("[OsmHomePreview] plan-config serveur HTTP " + r.status); return null; }
      config = await r.json();
    } catch (e) {
      console.warn("[OsmHomePreview] plan-config serveur illisible :", e && e.message);
      return null;
    }
    if (typeof window.resolveServerPaths === "function") config = window.resolveServerPaths(config, dir);
    config._baseDir = dir;

    // ── calques de données ──
    const dataLayers = [];
    for (const layerCfg of (Array.isArray(config.dataLayers) ? config.dataLayers : [])) {
      if (!layerCfg || !layerCfg.file) continue;
      try {
        const rr = await fetch(layerCfg.file);
        if (!rr.ok) { console.warn("[OsmHomePreview] calque HTTP " + rr.status + " :", layerCfg.file); continue; }
        const json = await rr.json();
        // mêmes clés que la branche ZIP (cf normaliserPoints) : `data` (embarqué), `editorPoints` (export de session)
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
      } catch (e) {
        console.warn("[OsmHomePreview] calque serveur échec :", layerCfg.file, e && e.message);
      }
    }

    // ── aperçu tuilé V2 ──
    let tilesOverview = null;
    if (config.plan && config.plan.tiledV2 === true && config.tiling) {
      try {
        const racine = (typeof window.ktaResoudreRacineTuiles === "function")
          ? await window.ktaResoudreRacineTuiles(config)
          : null;
        if (racine) {
          const planW = config.plan.imageWidth  || 1;
          const planH = config.plan.imageHeight || 1;
          const z     = _chooseTileLevelForHome(config.tiling, planW, planH);
          const scale = Math.pow(2, -z);
          const tileSize = config.tiling.tileSize || 512;
          const cols = Math.ceil(Math.ceil(planW / scale) / tileSize);
          const rows = Math.ceil(Math.ceil(planH / scale) / tileSize);
          const ext  = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(config.tiling) : "jpg";
          const tiles = [];
          // URL HTTP directe, pas de blob : rien à révoquer, le Service Worker les met en cache
          for (let col = 0; col < cols; col++) {
            for (let k = 1; k <= rows; k++) {
              tiles.push({ col: col, k: k, url: racine + "/z" + z + "/x" + col + "_y" + (-k) + "." + ext });
            }
          }
          tilesOverview = { tiles: tiles, planW: planW, planH: planH, z: z, scale: scale, tileSize: tileSize };
        }
      } catch (e) {
        console.warn("[OsmHomePreview] aperçu tuilé serveur échec :", e && e.message);
      }
    }

    // ── icônes : déjà des URLs après resolveServerPaths (config.js > resoudreIconesPlanServeur) ──
    const iconUrls = {};
    if (config.icons) {
      Object.keys(config.icons).forEach(function (tag) {
        const u = config.icons[tag];
        if (typeof u === "string" && u) iconUrls[tag] = u;
      });
    }

    console.log("[OsmHomePreview] plan serveur chargé en HTTP :", plan.id,
                "— " + dataLayers.length + " calque(s)" + (tilesOverview ? ", aperçu tuilé" : ""));
    return { config: config, dataLayers: dataLayers, tilesOverview: tilesOverview, iconUrls: iconUrls };
  }

  async function _loadPlanDataForPreview(planId) {
    if (_planDataCache[planId]) return _planDataCache[planId];

    // Plan SERVEUR : lecture HTTP (ce module n'a pas d'autre chemin pour lui).
    const _plan = (window.PlanRegistry && typeof window.PlanRegistry.findById === "function")
      ? window.PlanRegistry.findById(planId) : null;
    if (_plan && _plan.type === "server" && !_plan.zip) {   // plan ZIP : sa copie gardée (plus bas)
      const dataSrv = await _loadPlanDataServeur(_plan);
      if (dataSrv) _planDataCache[planId] = dataSrv;
      return dataSrv;
    }

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
      // 2. le JSON de chaque dataLayer
      const dataLayers = [];
      if (config.dataLayers && Array.isArray(config.dataLayers)) {
        for (const layerCfg of config.dataLayers) {
          if (!layerCfg || !layerCfg.file) continue;
          // chemin absolu ou relatif à data/ : on essaie les deux
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
            // ⚠️ Les POI sont sous `data` (embarqué, createConf.js) ou `editorPoints` (export de session,
            // sessionExporter) — cf utils.js > normaliserPoints ; `points` gardé en repli pour un plan tiers.
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
      // tuiles V2 d'aperçu (z = minNativeZoom) si le plan est tuilé ; blob URLs suivies. Plan V1 : rien.
      let tilesOverview = null;
      try {
        tilesOverview = await _extractV2TilesOverview(zip, config);
      } catch(e) {
        console.warn("[OsmHomePreview] tiles overview extraction échec :", e);
      }
      // icônes des POI (config.icons + catalogue built-in)
      let iconUrls = {};
      try {
        iconUrls = await _extractIcons(zip, config);
      } catch(e) {
        console.warn("[OsmHomePreview] icons extraction échec :", e);
      }
      // handle JSZip GARDÉ en cache pour les tuiles hi-res : loadAsync est paresseux (répertoire central seul,
      // le File reste une référence), coût RAM négligeable, pas de re-parse à chaque niveau.
      const result = { config: config, dataLayers: dataLayers, tilesOverview: tilesOverview, iconUrls: iconUrls, zip: zip };
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

  // Icônes des POI : config.icons (tag → fichier, du Générateur), puis le catalogue built-in.
  // ⚠️ Les chemins "icon/…" ou "lib/leaflet/…" sont des URLs de l'APPLI (servies et mises en cache par le
  // SW), pas des fichiers du ZIP : le Générateur n'y met que les icônes personnalisées. Donc : chemin présent
  // dans le ZIP → blob URL ; sinon URL relative telle quelle (comme getIconUrlForPoint).
  async function _extractIcons(zip, config) {
    const iconUrls = {};
    let nFromZip = 0, nFromApp = 0;
    async function _resolveIcon(tag, path) {
      if (!path) return;
      // 1. icône personnalisée dans le ZIP
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
      // 2. sinon URL relative de l'appli (servie par le SW)
      iconUrls[tag] = path.replace(/^\.\//, "");
      nFromApp++;
    }
    // 1. config.icons (prioritaire)
    if (config && config.icons && typeof config.icons === "object") {
      for (const tag in config.icons) {
        await _resolveIcon(tag, config.icons[tag]);
      }
    }
    // 2. catalogue built-in : `window._ktaBuiltinIconUrls` (map.js), copie locale en repli seulement
    const CATALOGUE = window._ktaBuiltinIconUrls || TAGS_BUILTIN_HOME;
    for (const tag in CATALOGUE) {
      if (iconUrls[tag]) continue;
      await _resolveIcon(tag, CATALOGUE[tag]);
    }
    // 3. repli : marker Leaflet (POI sans tag)
    if (!iconUrls.default) {
      iconUrls.default = "lib/leaflet/images/marker-icon.png";
    }
    console.log("[OsmHomePreview] Icons résolus : " + Object.keys(iconUrls).length + " tag(s) (" + nFromZip + " depuis ZIP custom · " + nFromApp + " depuis URLs app)");
    return iconUrls;
  }

  // Projection plan → OSM par le géoréf, comme osmView.js > _buildProjection.
  function _buildProjection(georef) {
    if (!georef || !window.KmzExport || typeof window.KmzExport.buildTransform !== "function") return null;
    let t;
    try {
      t = window.KmzExport.buildTransformCalib(georef);   // pointC optionnel propagé (affine)
    } catch(e) { console.warn("[OsmHomePreview] buildTransform échec :", e); return null; }
    return {
      planToLatLng: function(x, y) {
        const g = window.KmzExport.planToGps(t, x, y);
        return g ? L.latLng(g.lat, g.lng) : null;
      }
    };
  }

  // Points {x, y} → latlngs (invalides sautés).
  function _projectPoints(points, proj) {
    const out = [];
    for (const p of points) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") continue;
      const ll = proj.planToLatLng(p.x, p.y);
      if (ll) out.push(ll);
    }
    return out;
  }

  // ── Travail de session en Vue OSM ──────────
  // Une carte qui n'affiche pas ce que la recherche trouve (collectPointsForPlan lit la session) est
  // indéfendable : la session du plan s'ajoute comme calque virtuel.
  // 🩸 Lue AU RENDU, pas à l'extraction : `_planDataCache` n'est jamais invalidé ; y ranger la session la
  // figerait au premier affichage (édition en mode plan, retour HOME, état d'avant). Coût : un getItem + un
  // JSON.parse par plan affiché.
  let _showSession = true;   // ON par défaut : c'est le travail en cours de l'utilisateur

  // Calque VIRTUEL bâti sur le slot de session du plan (null si vide) : mêmes 4 familles, mêmes champs.
  function _calqueSession(planId) {
    if (!_showSession || !planId) return null;
    if (!window.SessionPersist || typeof window.SessionPersist.getSaved !== "function") return null;
    let p = null;
    try { p = window.SessionPersist.getSaved(planId); } catch(e) { return null; }
    if (!p) return null;
    const pts  = Array.isArray(p.editorPoints) ? p.editorPoints : [];
    const rds  = Array.isArray(p.roads)        ? p.roads        : [];
    const zns  = Array.isArray(p.zones)        ? p.zones        : [];
    const strs = Array.isArray(p.structures)   ? p.structures   : [];
    if (!pts.length && !rds.length && !zns.length && !strs.length) return null;
    return { name: window.I18n.t("osm_home.session.calque"), visible: true, estSession: true,
             points: pts, roads: rds, zones: zns, structures: strs };
  }

  // 🩸 LA liste des calques d'un plan = ZIP + session. Le rendu, les chips de tags et l'index de recherche
  // passent TOUS par ici : en oublier un masquerait un point dès qu'un filtre est posé, sans explication.
  function _tousCalques(data, planId) {
    const base = (data && Array.isArray(data.dataLayers)) ? data.dataLayers : [];
    const s = _calqueSession(planId);
    return s ? base.concat([s]) : base;
  }

  // 🩸 Même loi de largeur des fronts qu'en mode plan et que la modale OSM, en pixels par mètre
  // (structures.js) : le widget empile plusieurs plans et s'ouvre très dézoomé, une largeur fixe fusionne
  // tout. Résolution Web Mercator (latitude + zoom) ; `options.weight` muté en place puis une repeinture
  // NON CLIPPÉE. Pas de setStyle (plusieurs relevés de milliers d'objets).
  function _majLargeurFrontsHome() {
    if (!_mapInstance || typeof window.ktaPxParMetreOsm !== "function") return;
    const w = (typeof window.ktaLargeurFrontPourPxParMetre === "function")
      ? window.ktaLargeurFrontPourPxParMetre(window.ktaPxParMetreOsm(_mapInstance))
      : null;
    if (!w) return;
    const wTrace = Math.max(1, Math.round(w * 0.6 * 10) / 10);
    const appliquer = function (grp, largeur) {
      if (!grp || typeof grp.eachLayer !== "function") return;
      grp.eachLayer(function (lay) {
        // les surfaces gardent leur trait : un pilier se lit à son remplissage
        if (!lay || !lay.options || lay.options.fill === true) return;
        lay.options.weight = largeur;
      });
    };
    // le principal ET chaque plan empilé (sinon les autres restent en aplat)
    appliquer(_dataLayer, w);
    Object.keys(_extraLayers || {}).forEach(function (id) {
      const g = _extraLayers[id];
      if (!g) return;
      appliquer(g.struct, w);
      appliquer(g.roads, wTrace);
    });
    try {
      const r = _mapInstance._renderer;
      if (r && typeof r._redraw === "function") { r._redrawBounds = null; r._redraw(); }
    } catch (e) {}
  }

  function _renderDataLayersOnMiniMap(data, georef, cible, planIdPourPane) {
    // Sans `cible` : groupes du MODULE (plan principal, clear inclus). Avec `cible` ({data, poi, roads, zones,
    // struct}) : groupes d'un plan AJOUTÉ de la pile ; ceux du module ne sont pas touchés.
    if (!_mapInstance) return;
    let dataL, poiL, roadsL, zonesL, structL;
    if (cible) {
      dataL = cible.data; poiL = cible.poi; roadsL = cible.roads;
      zonesL = cible.zones; structL = cible.struct;
      if (!dataL || !poiL || !roadsL || !zonesL || !structL) return;
    } else {
      if (!_dataLayer)      _dataLayer      = L.layerGroup().addTo(_mapInstance);
      if (!_poiSubLayer)    _poiSubLayer    = L.layerGroup();
      if (!_roadsSubLayer)  _roadsSubLayer  = L.layerGroup();
      if (!_zonesSubLayer)  _zonesSubLayer  = L.layerGroup();
      if (!_structSubLayer) _structSubLayer = L.layerGroup();
      dataL = _dataLayer; poiL = _poiSubLayer; roadsL = _roadsSubLayer;
      zonesL = _zonesSubLayer; structL = _structSubLayer;
    }
    poiL.clearLayers();
    roadsL.clearLayers();
    zonesL.clearLayers();
    structL.clearLayers();
    if (!data || !Array.isArray(data.dataLayers)) return;
    // ⚠️ pane du plan : markers via `pane`, chemins SVG via un `renderer` dédié (un L.Path ignore `pane`)
    const planIdFx = planIdPourPane || _selectedPlanId; // overrides par plan
    const paneCtx = _panePour(planIdFx);
    const optsPane = paneCtx ? { pane: paneCtx.nom } : {};
    const optsRendu = paneCtx ? { renderer: paneCtx.renderer } : {};
    const proj = _buildProjection(georef);
    if (!proj) { console.warn("[OsmHomePreview] proj indisponible, skip data render"); return; }

    let nPoi = 0, nRoad = 0, nZone = 0, nStruct = 0;
    let nPoiWithIcon = 0, nPoiFallback = 0; // diagnostic des icônes
    const unmatchedTags = {}; // tag → nombre, tags sans icône
    // icônes du plan (tag → blob URL)
    const iconUrls = data.iconUrls || {};
    // cache des L.icon
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

    for (const layer of _tousCalques(data, planIdPourPane || _selectedPlanId)) {
      // 🩸 Les calques `visible: false` du plan-config ne sont PAS sautés : c'est un défaut d'affichage du mode
      // plan (⊞ Calques), et la Vue OSM n'a pas de bascule par calque — les sauter les rendrait inaccessibles.
      // Ici décident les filtres (catégories globales et par plan, tags).

      // POI : icônes natives, popup, filtres
      const isMultiLevel = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel);
      for (const p of layer.points) {
        if (typeof p.x !== "number" || typeof p.y !== "number") continue;
        const ll = proj.planToLatLng(p.x, p.y);
        if (!ll) continue;
        const tag  = (Array.isArray(p.tags) && p.tags[0]) || "default";
        // filtres niveau et tag
        if (!_passeNiveau(p)) continue;
        if (_homeTagFilter && _homeTagFilter.size > 0 && !_homeTagFilter.has(tag)) continue;
        const icon = _getOrBuildIcon(tag) || _getOrBuildIcon("default");
        // popup : nom, description, puis tag en petit (et niveau en multi-niveau)
        const nom  = p.nom || p.label || p.name || window.I18n.t("osm_home.poi.noName");
        const lvl  = (typeof p.level === "number") ? p.level : 0;
        const lvlSfx = isMultiLevel ? window.I18n.t("osm_home.poi.levelSuffix", { lvl: lvl }) : '';
        const desc = (p.description || "").trim();
        const popupHtml =
          '<div style="font-size:13px; min-width:140px; max-width:260px;">' +
            '<b>' + _escapeHtml(nom) + '</b><br>' +
            '<span style="color:var(--kta-texte-2); font-size:12px;">' +
              (desc ? _escapeHtml(desc) : _escapeHtml(tag)) + lvlSfx +
            '</span>' +
            (desc ? '<br><span style="color:var(--kta-texte-3); font-size:10.5px; opacity:0.75;">🏷️ ' + _escapeHtml(tag) + '</span>' : '') +
            // le point de session est NOMMÉ comme tel : la Vue OSM montre l'état enregistré
            (layer.estSession
              ? '<br><span style="color:var(--kta-accent-texte); font-size:10.5px;">📝 ' +
                _escapeHtml(window.I18n.t("osm_home.session.badge")) + '</span>'
              : '') +
          '</div>';
        let marker;
        if (icon) {
          marker = L.marker(ll, Object.assign({ icon: icon, interactive: true }, optsPane));
          nPoiWithIcon++;
        } else {
          marker = L.circleMarker(ll, Object.assign({
            radius: 4, color: "#fff", weight: 1,
            fillColor: "#f4c542", fillOpacity: 0.85, interactive: true
          }, optsRendu));
          nPoiFallback++;
          unmatchedTags[tag] = (unmatchedTags[tag] || 0) + 1;
        }
        // autoPan + marges : la popup tient dans la mini-carte
        marker.bindPopup(popupHtml, {
          closeButton: true,
          autoClose: true,
          autoPan: true,
          autoPanPaddingTopLeft: L.point(20, 60),
          autoPanPaddingBottomRight: L.point(20, 20),
          maxWidth: 240,
          className: "kta-osm-popup"
        });
        marker.addTo(poiL);
        nPoi++;
      }

      // tracés : couleur explicite > override du plan > type built-in > custom > gris (_resolveRoadColorHome)
      for (const r of layer.roads) {
        if (!_passeNiveau(r)) continue;
        if (!Array.isArray(r.points) || r.points.length < 2) continue;
        if (r.type === "itinerary") continue;
        const lls = _projectPoints(r.points, proj);
        if (lls.length < 2) continue;
        const color = _resolveRoadColorHome(r, planIdFx);
        L.polyline(lls, Object.assign({
          color: color, weight: 3, opacity: 0.85, interactive: false
        }, optsRendu)).addTo(roadsL);
        nRoad++;
      }

      // zones : même cascade (_resolveZoneColorsHome)
      for (const z of layer.zones) {
        if (!_passeNiveau(z)) continue;
        if (!Array.isArray(z.points) || z.points.length < 3) continue;
        const lls = _projectPoints(z.points, proj);
        if (lls.length < 3) continue;
        const cols = _resolveZoneColorsHome(z, planIdFx);
        L.polygon(lls, Object.assign({
          color: cols.stroke, fillColor: cols.fill,
          fillOpacity: (typeof z.fillOpacity === "number") ? z.fillOpacity * 0.7 : 0.25,
          weight: 1.5, opacity: 0.85, interactive: false
        }, optsRendu)).addTo(zonesL);
        nZone++;
      }

      // structures : polyline (fronts) ou polygone
      for (const s of layer.structures) {
        if (!_passeNiveau(s)) continue;
        if (!Array.isArray(s.points)) continue;
        const style = _styleStructHome(s, planIdFx);
        // couleurs d'override DU PLAN par-dessus la variante HOME (weight / fillOpacity allégés) : fronts = trait,
        // piliers / murs = remplissage + bordure
        const fillOvS   = _couleurOverrideDe(planIdFx, "structures", s.type, "colors");
        const borderOvS = _couleurOverrideDe(planIdFx, "structures", s.type, "borders");
        if (style.isPolyline) {
          if (fillOvS) style.color = fillOvS;
        } else {
          if (fillOvS)   style.fillColor = fillOvS;
          if (borderOvS) style.color     = borderOvS;
        }
        const polyline = style.isPolyline;
        const minPts = polyline ? 2 : 3;
        if (s.points.length < minPts) continue;
        const lls = _projectPoints(s.points, proj);
        if (lls.length < minPts) continue;
        if (polyline) {
          L.polyline(lls, Object.assign({ color: style.color, weight: style.weight, opacity: style.opacity, interactive: false }, optsRendu)).addTo(structL);
        } else {
          L.polygon(lls, Object.assign({
            color: style.color, fillColor: style.fillColor,
            fillOpacity: style.fillOpacity, weight: style.weight, opacity: 1, interactive: false
          }, optsRendu)).addTo(structL);
        }
        nStruct++;
      }
    }
    // sous-couches selon les bascules
    if (_showPoi)        dataL.addLayer(poiL);
    if (_showRoads)      dataL.addLayer(roadsL);
    if (_showZones)      dataL.addLayer(zonesL);
    if (_showStructures) dataL.addLayer(structL);
    console.log("[OsmHomePreview] Data render :", nPoi, "POI ·", nRoad, "roads ·", nZone, "zones ·", nStruct, "struct");
    // diagnostic des icônes : matchées / repli, tags sans icône
    if (nPoi > 0) {
      console.log("[OsmHomePreview] POI icônes : " + nPoiWithIcon + " avec icône · " + nPoiFallback + " fallback cercle");
      const unmatched = Object.keys(unmatchedTags);
      if (unmatched.length > 0) {
        const sorted = unmatched.sort(function(a, b) { return unmatchedTags[b] - unmatchedTags[a]; });
        const top    = sorted.slice(0, 10).map(function(t) { return t + "(" + unmatchedTags[t] + ")"; });
        console.log("[OsmHomePreview] ⚠️ Tags POI sans icône : " + top.join(" · ") + (sorted.length > 10 ? " (+" + (sorted.length - 10) + ")" : ""));
      }
    }
  }

  // bascule par catégorie (add / removeLayer du sous-groupe)
  function _montrer(parent, layer, on) {
    if (!parent || !layer) return;
    if (on) { if (!parent.hasLayer(layer)) parent.addLayer(layer); }
    else    { if  (parent.hasLayer(layer)) parent.removeLayer(layer); }
  }

  // APPLICATEUR UNIQUE : visibilité effective = bascule GLOBALE (bandeau) ET chip PAR PLAN (panneau 🗂️).
  // Appelé par les bascules, les chips, et après chaque rendu.
  function _appliquerVisibilites() {
    if (!_mapInstance) return;
    const vP = _visDe(_selectedPlanId);
    if (_tilesLayer) _montrer(_mapInstance, _tilesLayer, _showTiles && vP.tiles);
    if (_dataLayer) {
      _montrer(_dataLayer, _poiSubLayer,    _showPoi        && vP.poi);
      _montrer(_dataLayer, _roadsSubLayer,  _showRoads      && vP.roads);
      _montrer(_dataLayer, _zonesSubLayer,  _showZones      && vP.zones);
      _montrer(_dataLayer, _structSubLayer, _showStructures && vP.struct);
    }
    _chaqueExtra(function(g, id) {
      const v = _visDe(id);
      _montrer(_mapInstance, g.tiles, _showTiles && v.tiles);
      _montrer(g.data, g.poi,    _showPoi        && v.poi);
      _montrer(g.data, g.roads,  _showRoads      && v.roads);
      _montrer(g.data, g.zones,  _showZones      && v.zones);
      _montrer(g.data, g.struct, _showStructures && v.struct);
    });
    // les groupes hi-res suivent les tuiles
    Object.keys(_hiRes).forEach(function(id) {
      const h = _hiRes[id];
      if (h && h.groupe) _montrer(_mapInstance, h.groupe, _showTiles && _visDe(id).tiles);
    });
  }

  function _toggleTiles(visible)      { _showTiles      = !!visible; _appliquerVisibilites(); }
  function _togglePoi(visible)        { _showPoi        = !!visible; _appliquerVisibilites(); }
  function _toggleRoads(visible)      { _showRoads      = !!visible; _appliquerVisibilites(); }
  function _toggleZones(visible)      { _showZones      = !!visible; _appliquerVisibilites(); }
  function _toggleStructures(visible) { _showStructures = !!visible; _appliquerVisibilites(); }
  function _togglePortails(visible)   { _showPortails   = !!visible; _renderPortails(); }
  // Bascule du travail de session : re-rendu COMPLET (_reRenderDataTous), le calque session traverse le
  // rendu, les chips de tags et l'index de recherche.
  function _toggleSession(visible) {
    _showSession = !!visible;
    _reRenderDataTous();
    _renderModalTags();   // les tags de session entrent ou sortent des chips
    _renderModalNiveaux();
  }

  // ── Liaisons inter-plans sur OSM (contrôle du calage) ──────────
  // Les deux bouts d'un portail désignent le MÊME lieu vu de deux plans : projetés chacun par son géoréf, ils
  // devraient se superposer. L'écart mesure directement la qualité du calage.
  // ⚠️ Les DEUX plans doivent être affichés ET géoréférencés, sinon la liaison est sautée (aucune position
  // inventée). Pas de seuil de couleur (décision produit) : 20 m, c'est énorme ou négligeable selon le réseau ;
  // on affiche le chiffre.
  function _plansAffichesAvecGeoref() {
    const out = {};
    const georefs = {};
    _listGeorefPlans().forEach(function(p) { georefs[p.id] = p.georef; });
    if (_selectedPlanId && georefs[_selectedPlanId]) out[_selectedPlanId] = georefs[_selectedPlanId];
    Object.keys(_extraLayers).forEach(function(id) {
      if (georefs[id]) out[id] = georefs[id];
    });
    return out;
  }

  function _renderPortails() {
    if (!_mapInstance) return;
    if (_portailsLayer) {
      try { _mapInstance.removeLayer(_portailsLayer); } catch(e) {}
      _portailsLayer = null;
    }
    if (!_showPortails) return;
    if (!window.InterPlanLinks || typeof window.InterPlanLinks.getAllLinks !== "function") return;

    let liens = [];
    try { liens = window.InterPlanLinks.getAllLinks() || []; } catch(e) { return; }
    if (!liens.length) return;

    const affiches = _plansAffichesAvecGeoref();
    const projections = {};
    Object.keys(affiches).forEach(function(id) { projections[id] = _buildProjection(affiches[id]); });

    const grp = L.layerGroup();
    let tracees = 0;
    liens.forEach(function(lk) {
      if (!lk || !lk.a || !lk.b) return;
      const pa = projections[lk.a.planId], pb = projections[lk.b.planId];
      if (!pa || !pb) return;   // un des deux plans n'est pas affiché / géoréférencé
      const la = pa.planToLatLng(Number(lk.a.x) || 0, Number(lk.a.y) || 0);
      const lb = pb.planToLatLng(Number(lk.b.x) || 0, Number(lk.b.y) || 0);
      if (!la || !lb) return;

      const ecartM = Math.round(la.distanceTo(lb));
      L.polyline([la, lb], {
        color: "#f4c542", weight: 2, opacity: 0.9, dashArray: "6,5",
        interactive: true
      }).bindPopup(
        '<div style="font-size:13px;line-height:1.5;">' +
          '<strong>🌀 ' + _escapeHtml(lk.a.nom || lk.a.pointId || "?") + '</strong> ↔ ' +
          '<strong>' + _escapeHtml(lk.b.nom || lk.b.pointId || "?") + '</strong><br>' +
          _escapeHtml(window.I18n.t("osm_home.portails.ecart")) + ' : <strong>' +
          (window.formatDistance ? window.formatDistance(ecartM, 0) : (ecartM + " m")) + '</strong>' +
        '</div>'
      ).addTo(grp);

      // les deux bouts : on voit LEQUEL est décalé
      [la, lb].forEach(function(pt) {
        L.circleMarker(pt, {
          radius: 4, color: "#f4c542", weight: 2, fillColor: "#1a1f2e", fillOpacity: 1
        }).addTo(grp);
      });
      tracees++;
    });

    if (tracees) {
      _portailsLayer = grp;
      grp.addTo(_mapInstance);
    }
    console.log("[OsmHomePreview] portails tracés : " + tracees + "/" + liens.length +
                " (les autres ont au moins un plan non affiché ou non géoréférencé)");
  }

  // Liste de contrôle du calage : deux portails bien calés se superposent (polyligne de longueur nulle), le
  // calque ne montre rien dans le cas nominal. La liste donne le compte mesuré, du PIRE au meilleur.
  // ⚠️ L'écart vient de InterPlanLinks.ecartCalage (fonction UNIQUE, jamais recopiée).
  function _renderPortailsQualite() {
    const cont = document.getElementById("ktaOsmPortailsQualite");
    if (!cont) return;
    if (!_showPortails) { cont.innerHTML = ""; return; }
    if (!window.InterPlanLinks || typeof window.InterPlanLinks.ecartCalage !== "function") {
      cont.innerHTML = ""; return;
    }

    let liens = [];
    try { liens = window.InterPlanLinks.getAllLinks() || []; } catch(e) { liens = []; }
    const affiches = _plansAffichesAvecGeoref();

    // mesurables = les deux plans affichés dans la pile et géoréférencés (les autres : 🌀 Mes liaisons)
    const mesures = [];
    liens.forEach(function(lk) {
      if (!lk || !lk.a || !lk.b) return;
      if (!affiches[lk.a.planId] || !affiches[lk.b.planId]) return;
      const m = window.InterPlanLinks.ecartCalage(lk);
      if (m === null || !isFinite(m)) return;
      mesures.push({ lk: lk, m: m });
    });
    if (!mesures.length) {
      cont.innerHTML = '<p class="kta-osm-qualite-vide">' +
        _escapeHtml(window.I18n.t("osm_home.portails.qualiteVide")) + '</p>';
      return;
    }
    mesures.sort(function(a, b) { return b.m - a.m; });   // le pire en tête

    const fmt = function(m) {
      return window.formatDistance ? window.formatDistance(m, 0) : (Math.round(m) + " m");
    };
    cont.innerHTML =
      '<div class="kta-osm-qualite-titre">📐 ' +
        _escapeHtml(window.I18n.t("osm_home.portails.qualiteTitre", { n: mesures.length })) +
      '</div>' +
      mesures.map(function(e, i) {
        return '<button type="button" class="kta-osm-qualite-ligne" data-q="' + i + '">' +
                 '<span class="kta-osm-qualite-noms">' +
                   _escapeHtml(e.lk.a.pointNom || e.lk.a.nom || e.lk.a.pointId || "?") + ' ⇄ ' +
                   _escapeHtml(e.lk.b.pointNom || e.lk.b.nom || e.lk.b.pointId || "?") +
                 '</span>' +
                 '<span class="kta-osm-qualite-val">' + _escapeHtml(fmt(e.m)) + '</span>' +
               '</button>';
      }).join("");

    // clic → fitBounds sur les DEUX bouts (centrer sur le milieu d'un gros écart les laisserait hors champ)
    cont.querySelectorAll("[data-q]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const e = mesures[parseInt(btn.getAttribute("data-q"), 10)];
        if (!e || !_mapInstance) return;
        const pa = _buildProjection(affiches[e.lk.a.planId]);
        const pb = _buildProjection(affiches[e.lk.b.planId]);
        if (!pa || !pb) return;
        const la = pa.planToLatLng(Number(e.lk.a.x) || 0, Number(e.lk.a.y) || 0);
        const lb = pb.planToLatLng(Number(e.lk.b.x) || 0, Number(e.lk.b.y) || 0);
        if (!la || !lb) return;
        try { _mapInstance.fitBounds(L.latLngBounds([la, lb]), { padding: [80, 80], maxZoom: 19 }); }
        catch(err) { /* bornes dégénérées (écart nul) : Leaflet gère, on ignore */ }
      });
    });
  }

  // Bbox GPS du plan sélectionné (4 coins projetés), pour le garde « GPS hors champ » du bouton 📍.
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

  // « 📍 Moi » : un fix par clic, rien stocké, permission demandée au clic ; garde incognito comme OsmView.
  function _showMyGpsPositionHome() {
    if (!_mapInstance) return;
    if (_isIncognitoOn()) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("osm_home.gps.incognitoToast"), "warn");
      } else { window.ktaAlerte(window.I18n.t("osm_home.gps.incognitoAlert")); }
      return;
    }
    if (!navigator.geolocation) {
      window.ktaAlerte(window.I18n.t("osm_home.gps.unavailable"), { type: "erreur" });
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
        // 🔒 fix à plus de 50 % au-delà de la bbox du plan sélectionné : refusé
        const bbox = _getPlanGpsBboxHome();
        if (bbox) {
          const padded = bbox.pad(0.5);
          if (!padded.contains([lat, lng])) {
            const center = bbox.getCenter();
            const distKm = _haversineKmHome(lat, lng, center.lat, center.lng);
            const msg = window.I18n.t("osm_home.gps.outOfBounds", { km: distKm.toFixed(1) });
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(msg, "warn");
            } else { window.ktaAlerte(msg); }
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
            '<span style="font-size:11.5px; color:var(--kta-texte-3);">' +
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
        window.ktaAlerte(msg, { type: "erreur" });
        if (btn && originalHtml != null) { btn.disabled = false; btn.innerHTML = originalHtml; }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  // Niveaux réellement présents dans un plan, toutes familles confondues : un chip de niveau vide ferait
  // croire à un bug d'affichage.
  function _collectNiveaux(data, planId) {
    const set = new Set();
    _tousCalques(data, planId).forEach(function (layer) {
      ["points", "roads", "zones", "structures"].forEach(function (fam) {
        (layer[fam] || []).forEach(function (o) { set.add(_niveauDe(o)); });
      });
    });
    return set;
  }

  function _collectAvailableTags(data, planId) {
    const counts = {};
    if (!data) return counts;
    for (const layer of _tousCalques(data, planId)) {
      if (!Array.isArray(layer.points)) continue;
      for (const p of layer.points) {
        const tag = (Array.isArray(p.tags) && p.tags[0]) || "default";
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }


  function _chooseTileLevelForHome(tiling, planW, planH) {
    const MAX_TILES_HOME = 80;
    const tileSize = tiling.tileSize || 512;
    for (let z = tiling.maxNativeZoom; z >= tiling.minNativeZoom; z--) {
      const scale = Math.pow(2, -z);
      const cols = Math.ceil(Math.ceil(planW / scale) / tileSize);
      const rows = Math.ceil(Math.ceil(planH / scale) / tileSize);
      if (cols * rows <= MAX_TILES_HOME) return z;
    }
    return tiling.minNativeZoom; // filet
  }

  // Tuiles V2 du niveau adaptatif (_chooseTileLevelForHome) en blob URLs ; plan V1 : rien.
  async function _extractV2TilesOverview(zip, config) {
    if (!config.plan || config.plan.tiledV2 !== true || !config.tiling) return null;
    const planW    = config.plan.imageWidth  || 1;
    const planH    = config.plan.imageHeight || 1;
    const z        = _chooseTileLevelForHome(config.tiling, planW, planH);
    const scale    = Math.pow(2, -z);
    const tileSize = config.tiling.tileSize || 512;
    const lvlW = Math.ceil(planW / scale);
    const lvlH = Math.ceil(planH / scale);
    const cols = Math.ceil(lvlW / tileSize);
    const rows = Math.ceil(lvlH / tileSize);

    const tiles = [];
    // 🩸 PAS de révocation : les blob URLs de la vue d'ensemble vivent avec _planDataCache (re-ajout d'un plan
    // gratuit). Révoquer au chargement d'un plan B tuerait les URLs du plan A encore AFFICHÉ. Le cache borne
    // déjà l'extraction à une fois par plan. Les tuiles HI-RES, elles, sont révoquées à chaque swap.
    // Extension d'après le manifest (webp/png = alpha, jpg = ancien).
    const _tileExt = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(config.tiling) : "jpg";
    for (let col = 0; col < cols; col++) {
      for (let k = 1; k <= rows; k++) {
        const path  = "data/tiles/z" + z + "/x" + col + "_y" + (-k) + "." + _tileExt;
        const entry = zip.file(path);
        if (!entry) {
          console.warn("[OsmHomePreview] tuile absente :", path);
          continue;
        }
        try {
          const blob = await entry.async("blob");
          const url  = URL.createObjectURL(blob);
          tiles.push({ col: col, k: k, url: url });
        } catch(e) {
          console.warn("[OsmHomePreview] tuile extract échec :", path, e);
        }
      }
    }
    return { tiles: tiles, planW: planW, planH: planH, z: z, scale: scale, tileSize: tileSize };
  }

  // Tuiles V2 d'UN plan dans le groupe fourni, avec SON opacité et SON zIndex de pile (principal et plans
  // ajoutés), comme osmView.js (flip Y de CRS.Simple : k = 1 = tuile la plus basse, au sud).
  // 🩸 Opacité sur un SOUS-CALQUE du pane du plan, pas tuile par tuile : la vue d'ensemble et les tuiles
  // hi-res se superposent par construction (50 % + 50 % ≈ 75 %, rectangle plus sombre). Tuiles opaques,
  // opacité sur le sous-calque, sous les tracés du plan (même pane, renderer SVG).
  function _paneTuiles(paneNom, op) {
    if (!_mapInstance || !paneNom) return null;
    const nom = paneNom + "_tuiles";
    let pane = _mapInstance.getPane(nom);
    if (!pane) {
      const parent = _mapInstance.getPane(paneNom);
      if (!parent) return null;
      pane = _mapInstance.createPane(nom, parent);
      // 🩸 Pas de z-index NÉGATIF : Safari iOS repeint ce sous-calque derrière le fond OSM pendant que la carte
      // bouge. Premier enfant (sous les tracés par l'ordre du DOM) + couche de composition propre
      // (translateZ + will-change), le remède au clignotement d'un calque semi-transparent.
      parent.insertBefore(pane, parent.firstChild);
      pane.style.transform = "translateZ(0)";
      pane.style.willChange = "opacity";
    }
    if (op != null) pane.style.opacity = String(op);
    return nom;
  }
  // Opacité des tuiles d'un plan, posée sur son sous-calque ; false = pas de sous-calque.
  function _opaciteTuilesPlan(planId, op) {
    const e = _panesParPlan[planId];
    if (!e || e.map !== _mapInstance) return false;
    return !!_paneTuiles(e.nom, op);
  }

  function _renderTilesInto(groupe, tilesData, georef, opacite, zIndex, paneNom) {
    if (!_mapInstance || !groupe) return;
    groupe.clearLayers();
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

    const pTuiles = _paneTuiles(paneNom, opacite);
    let rendered = 0;
    for (const t of tilesData.tiles) {
      // bounds pixel dans le plan source ; CRS.Simple : k = 1 = tuile la plus basse → flip Y
      const pxLeft   = t.col * tileSize * scale;
      const pxRight  = (t.col + 1) * tileSize * scale;
      const pxTop    = planH - t.k * tileSize * scale;
      const pxBottom = planH - (t.k - 1) * tileSize * scale;

      const tl = proj.planToLatLng(pxLeft,  pxTop);
      const tr = proj.planToLatLng(pxRight, pxTop);
      const bl = proj.planToLatLng(pxLeft,  pxBottom);
      if (!tl || !tr || !bl) continue;

      try {
        const overlay = L.imageOverlay.rotated(t.url, tl, tr, bl, Object.assign({
          interactive: false,
          opacity: pTuiles ? 1 : opacite,
          zIndex: zIndex
        }, pTuiles ? { pane: pTuiles } : (paneNom ? { pane: paneNom } : {})));
        // masque le remplissage noir des tuiles de bord
        if (window.ktaRognerTuile) window.ktaRognerTuile(overlay, window.ktaRemplissageTuile(tilesData.planW, planH, tileSize, scale, t.col, t.k));
        overlay.addTo(groupe);
        rendered++;
      } catch(e) {
        console.warn("[OsmHomePreview] tile overlay :", e);
      }
    }
    console.log("[OsmHomePreview] Tiles V2 : " + rendered + " tuile(s) rendues à z=" + tilesData.z + " (scale x" + scale + ", zIndex " + zIndex + ")");
  }

  function _renderTilesOnMiniMap(tilesData, georef) {
    if (!_mapInstance) return;
    if (!_tilesLayer) _tilesLayer = L.layerGroup().addTo(_mapInstance);
    const pn = _panePour(_selectedPlanId);
    _renderTilesInto(_tilesLayer, tilesData, georef, _planOpacity,
                     _zIndexPour(_selectedPlanId), pn ? pn.nom : null);
  }

  // Opacité des tuiles du plan principal ; les calques gardent leur fillOpacity.
  function _setPlanOpacity(opacity) {
    _planOpacity = Math.max(0, Math.min(1, opacity));
    _appliquerOpaciteHiRes(_selectedPlanId, _planOpacity);
    if (_opaciteTuilesPlan(_selectedPlanId, _planOpacity)) return;   // sous-calque : tuiles opaques
    if (!_tilesLayer) return;
    _tilesLayer.eachLayer(function(l) {
      try {
        if (typeof l.setOpacity === "function") l.setOpacity(_planOpacity);
        else if (l._image) l._image.style.opacity = String(_planOpacity);
      } catch(e) {}
    });
  }

  // ── Tuiles hi-res au zoom ──────────
  // La vue d'ensemble (≤ 80 tuiles) reste le socle ; sur un gros plan elle est floue de près. Au
  // zoomend / moveend (débounce 300 ms), pour chaque plan V2 visible : niveau adapté à la taille ÉCRAN du
  // plan, extraction (ZIP gardé en cache) des seules tuiles qui coupent la vue (60 par plan, sinon un cran de
  // moins), posées AU-DESSUS du socle (même pane, zIndex + 1 : pas de trou pendant le chargement). Pan à
  // niveau constant : delta (tuiles communes gardées, sorties révoquées). Zoom où le socle suffit → groupe
  // retiré, URLs révoquées. Version frugale de osmView.js > _renderLevel.
  const HIRES_BUDGET_TUILES = 60;   // par plan, ~15 Mo décodés en 512 px
  const HIRES_DEBOUNCE_MS   = 300;
  let _hiRes      = {};    // planId → { z, tuiles: {"col_k": {url, overlay}}, groupe }
  let _hiResTimer = null;
  let _hiResBusy  = false; // extraction en cours : on replanifie au lieu d'empiler
  let _hiResRedo  = false;

  function _opaciteDe(planId) {
    return planId === _selectedPlanId ? _planOpacity
         : (_extraOpacity[planId] != null ? _extraOpacity[planId] : 0.5);
  }

  function _retirerHiRes(planId) {
    const h = _hiRes[planId];
    if (!h) return;
    try { if (_mapInstance && h.groupe) _mapInstance.removeLayer(h.groupe); } catch(e) {}
    Object.keys(h.tuiles).forEach(function(cle) {
      try { URL.revokeObjectURL(h.tuiles[cle].url); } catch(e) {}
    });
    delete _hiRes[planId];
  }

  function _retirerToutHiRes() {
    Object.keys(_hiRes).forEach(_retirerHiRes);
    if (_hiResTimer) { clearTimeout(_hiResTimer); _hiResTimer = null; }
  }

  function _onCarteBougeHiRes() {
    if (_hiResTimer) clearTimeout(_hiResTimer);
    _hiResTimer = setTimeout(function() {
      _hiResTimer = null;
      _majTuilesHiRes();
    }, HIRES_DEBOUNCE_MS);
  }

  // Tuiles du niveau z qui coupent la vue (bounds GPS avec marge). k = 1 = tuile la plus basse ; tuiles de
  // bord PLEINES (padding au-dessus du plan) : pas de clamp.
  function _tuilesVisiblesPour(z, scale, planW, planH, tileSize, proj, vue) {
    const lvlW = Math.ceil(planW / scale), lvlH = Math.ceil(planH / scale);
    const cols = Math.ceil(lvlW / tileSize), rows = Math.ceil(lvlH / tileSize);
    const out = [];
    for (let col = 0; col < cols; col++) {
      for (let k = 1; k <= rows; k++) {
        const pxLeft   = col * tileSize * scale;
        const pxRight  = (col + 1) * tileSize * scale;
        const pxTop    = planH - k * tileSize * scale;
        const pxBottom = planH - (k - 1) * tileSize * scale;
        const tl = proj.planToLatLng(pxLeft,  pxTop);
        const tr = proj.planToLatLng(pxRight, pxTop);
        const bl = proj.planToLatLng(pxLeft,  pxBottom);
        const br = proj.planToLatLng(pxRight, pxBottom);
        if (!tl || !tr || !bl || !br) continue;
        if (vue.intersects(L.latLngBounds([tl, tr, bl, br]))) out.push({ col: col, k: k });
      }
    }
    return out;
  }

  async function _majTuilesHiRes() {
    if (!_mapInstance) return;
    if (_hiResBusy) { _hiResRedo = true; return; }
    _hiResBusy = true;
    try {
      const georefs = {};
      _listGeorefPlans().forEach(function(p) { georefs[p.id] = p.georef; });
      const ids = _stackOrder.slice();
      if (_selectedPlanId && ids.indexOf(_selectedPlanId) === -1) ids.push(_selectedPlanId);
      const vus = {};
      for (const id of ids) {
        if (!id || vus[id]) continue;
        vus[id] = true;
        try { await _majHiResPlan(id, georefs[id]); }
        catch(e) { console.warn("[OsmHomePreview] hi-res échec plan " + id + " :", e); }
      }
      // plans sortis de la pile depuis le dernier passage : purge
      Object.keys(_hiRes).forEach(function(id) { if (!vus[id]) _retirerHiRes(id); });
    } finally {
      _hiResBusy = false;
      if (_hiResRedo) { _hiResRedo = false; _onCarteBougeHiRes(); }
    }
  }

  async function _majHiResPlan(planId, georef) {
    const data = _planDataCache[planId];
    const tv   = data && data.tilesOverview;
    if (!tv || !data.zip || !data.config || !data.config.tiling || !georef) { _retirerHiRes(planId); return; }
    if (!(_showTiles && _visDe(planId).tiles)) { _retirerHiRes(planId); return; }
    const proj = _buildProjection(georef);
    if (!proj) { _retirerHiRes(planId); return; }

    const tiling   = data.config.tiling;
    const planW    = tv.planW, planH = tv.planH;
    const tileSize = tv.tileSize;

    // taille ÉCRAN du plan : distance en px entre ses coins bas projetés
    const bg = proj.planToLatLng(0, planH), bd = proj.planToLatLng(planW, planH);
    if (!bg || !bd) { _retirerHiRes(planId); return; }
    const pG = _mapInstance.latLngToContainerPoint(bg);
    const pD = _mapInstance.latLngToContainerPoint(bd);
    const ecranW = Math.hypot(pD.x - pG.x, pD.y - pG.y);

    // socle déjà net (≥ 1 px de tuile par px écran) : pas de hi-res
    if (planW / Math.pow(2, -tv.z) >= ecranW) { _retirerHiRes(planId); return; }

    // niveau idéal = le plus GROSSIER qui couvre la largeur écran
    let zCible = tiling.maxNativeZoom;
    for (let z = tv.z + 1; z <= tiling.maxNativeZoom; z++) {
      if (planW / Math.pow(2, -z) >= ecranW) { zCible = z; break; }
    }

    // budget dépassé dans la vue : un cran de moins
    const vue = _mapInstance.getBounds().pad(0.15);
    let choix = null;
    for (let z = zCible; z > tv.z; z--) {
      const scale = Math.pow(2, -z);
      const t = _tuilesVisiblesPour(z, scale, planW, planH, tileSize, proj, vue);
      if (t.length === 0) break;                      // plan hors de la vue
      if (t.length <= HIRES_BUDGET_TUILES) { choix = { z: z, scale: scale, tuiles: t }; break; }
    }
    if (!choix) { _retirerHiRes(planId); return; }

    // delta : même niveau → tuiles communes réutilisées
    const h        = _hiRes[planId];
    const memeZ    = !!(h && h.z === choix.z);
    if (h && !memeZ) _retirerHiRes(planId);           // changement de niveau : purge
    const ancien   = memeZ ? h.tuiles : {};
    const groupe   = (memeZ && h.groupe) ? h.groupe : L.layerGroup();
    if (!_mapInstance.hasLayer(groupe)) groupe.addTo(_mapInstance);

    const pn   = _panePour(planId);
    const op   = _opaciteDe(planId);
    const zIdx = _zIndexPour(planId) + 1;
    const pT   = pn ? _paneTuiles(pn.nom, op) : null;   // même sous-calque que la vue d'ensemble
    const ext  = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(tiling) : "jpg";
    const nouvelles = {};
    // 🩸 carte détruite / recréée pendant un await (refresh du widget) : abandon SANS poser d'état, sinon une
    // entrée _hiRes orpheline garderait des URLs jamais révoquées
    const carte = _mapInstance;

    for (const t of choix.tuiles) {
      if (_mapInstance !== carte) break;
      const cle = t.col + "_" + t.k;
      if (ancien[cle]) { nouvelles[cle] = ancien[cle]; delete ancien[cle]; continue; }
      const entry = data.zip.file("data/tiles/z" + choix.z + "/x" + t.col + "_y" + (-t.k) + "." + ext);
      if (!entry) continue;
      let url = null;
      try { url = URL.createObjectURL(await entry.async("blob")); } catch(e) { continue; }
      const pxLeft   = t.col * tileSize * choix.scale;
      const pxRight  = (t.col + 1) * tileSize * choix.scale;
      const pxTop    = planH - t.k * tileSize * choix.scale;
      const pxBottom = planH - (t.k - 1) * tileSize * choix.scale;
      const tl = proj.planToLatLng(pxLeft,  pxTop);
      const tr = proj.planToLatLng(pxRight, pxTop);
      const bl = proj.planToLatLng(pxLeft,  pxBottom);
      if (!tl || !tr || !bl) { try { URL.revokeObjectURL(url); } catch(e) {} continue; }
      try {
        const ov = L.imageOverlay.rotated(url, tl, tr, bl, Object.assign(
          { interactive: false, opacity: pT ? 1 : op, zIndex: zIdx }, pT ? { pane: pT } : (pn ? { pane: pn.nom } : {})));
        if (window.ktaRognerTuile) window.ktaRognerTuile(ov, window.ktaRemplissageTuile(planW, planH, tileSize, choix.scale, t.col, t.k));
        ov.addTo(groupe);
        nouvelles[cle] = { url: url, overlay: ov };
      } catch(e) {
        try { URL.revokeObjectURL(url); } catch(e2) {}
      }
    }
    if (_mapInstance !== carte) {
      Object.keys(nouvelles).forEach(function(cle) {
        try { URL.revokeObjectURL(nouvelles[cle].url); } catch(e) {}
      });
      return;
    }
    // tuiles sorties de la vue (même niveau) : overlay retiré, URL révoquée
    Object.keys(ancien).forEach(function(cle) {
      try { groupe.removeLayer(ancien[cle].overlay); } catch(e) {}
      try { URL.revokeObjectURL(ancien[cle].url); } catch(e) {}
    });
    _hiRes[planId] = { z: choix.z, tuiles: nouvelles, groupe: groupe };
    console.log("[OsmHomePreview] Hi-res " + planId + " : z=" + choix.z +
      ", " + Object.keys(nouvelles).length + " tuile(s) viewport");
  }

  function _appliquerOpaciteHiRes(planId, op) {
    if (_opaciteTuilesPlan(planId, op)) return;   // sous-calque : tuiles opaques
    const h = _hiRes[planId];
    if (!h || !h.groupe) return;
    h.groupe.eachLayer(function(l) {
      try {
        if (typeof l.setOpacity === "function") l.setOpacity(op);
        else if (l._image) l._image.style.opacity = String(op);
      } catch(e) {}
    });
  }

  // ── Plein écran en place ──────────
  // ⛶ n'ouvre PAS la modale OsmView : la mini-carte passe en overlay plein écran (classe CSS sur
  // #ktaOsmHomeBox), l'utilisateur reste sur le HOME.
  // ── Pile multi-plans ──────────
  // Plusieurs relevés voisins sur la même carte, avec ordre et opacité PAR PLAN ; le plan de la liste reste
  // le principal, les autres s'ajoutent par le panneau 🗂️ (plein écran).
  // 🩸 UN PANE LEAFLET PAR PLAN (zIndex sur le pane), TOUT le contenu du plan dedans : les zIndex
  // d'imageOverlay n'ordonnent que les images (les tracés SVG partagent un renderer dans l'overlayPane), et
  // l'image du plan A cacherait les tracés du plan B. Dans un pane, le SVG vient après les tuiles : les tracés
  // d'un plan restent au-dessus de sa propre image.
  let _panesParPlan = {};   // planId → { nom, pane, renderer, map }

  function _panePour(planId) {
    if (!_mapInstance || !planId) return null;
    let e = _panesParPlan[planId];
    if (e && e.map === _mapInstance) {
      e.pane.style.zIndex = String(_zIndexPour(planId));
      return e;
    }
    const nom = "ktaOsmPlan_" + String(planId).replace(/[^a-zA-Z0-9_-]/g, "_");
    let pane = _mapInstance.getPane(nom);
    if (!pane) pane = _mapInstance.createPane(nom);
    pane.style.zIndex = String(_zIndexPour(planId));
    e = { nom: nom, pane: pane, renderer: L.svg({ pane: nom }), map: _mapInstance };
    _panesParPlan[planId] = e;
    return e;
  }

  function _chaqueExtra(fn) {
    Object.keys(_extraLayers).forEach(function(id) {
      const g = _extraLayers[id];
      if (g) fn(g, id);
    });
  }

  // zIndex de pile : index 0 = AU-DESSUS ; base 200 (au-dessus du fond OSM), pas de 5.
  function _zIndexPour(planId) {
    const i = _stackOrder.indexOf(planId);
    if (i === -1) return 200;
    return 200 + (_stackOrder.length - 1 - i) * 5;
  }

  function _appliquerOrdre() {
    _stackOrder.forEach(function(id) {
      // l'ordre vit sur le PANE du plan (images ET vecteurs)
      const e = _panesParPlan[id];
      if (e && e.pane) e.pane.style.zIndex = String(_zIndexPour(id));
    });
  }

  function _avertirMultiSiBesoin() {
    // pas de plafond dur (décision produit) : avertissement au-delà de 3 plans, une fois par session
    if (_warnedMulti || _stackOrder.length <= 3) return;
    _warnedMulti = true;
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(
        window.I18n.t("osm_mode.warn.multi", { n: _stackOrder.length }), "warn");
    }
  }

  // Ajout d'un plan en deux temps : MONTAGE (synchrone : pile + layerGroups) puis CHARGEMENT (async, cher :
  // extraction du ZIP).
  // 🩸 L'ajout par étiquette peut en demander vingt d'un coup : vingt _ajouterPlanOsm = vingt re-rendus du
  // panneau et vingt extractions EN PARALLÈLE sur une frame. Découpé : le lot monte tout, rend UNE fois, puis
  // charge EN SÉRIE (la carte se remplit au lieu de figer l'onglet).
  function _monterPlanOsm(planId) {
    if (!planId || planId === _selectedPlanId || _extraLayers[planId]) return null;
    const plans = _listGeorefPlans();
    const p = plans.find(function(x) { return x.id === planId; });
    if (!p) return null;

    if (_stackOrder.indexOf(planId) === -1) _stackOrder.unshift(planId); // nouveau = au-dessus
    const g = {
      tiles:  L.layerGroup(),
      data:   L.layerGroup().addTo(_mapInstance),
      poi:    L.layerGroup(),
      roads:  L.layerGroup(),
      zones:  L.layerGroup(),
      struct: L.layerGroup()
    };
    if (_showTiles) g.tiles.addTo(_mapInstance);
    _extraLayers[planId] = g;
    if (!(planId in _extraOpacity)) _extraOpacity[planId] = 0.5;
    return { p: p, g: g };
  }

  function _chargerDataPlanOsm(planId, p, g) {
    return _loadPlanDataForPreview(planId).then(function(data) {
      // 🩸 retiré (ou devenu principal) pendant l'extraction ? abandon
      if (!_extraLayers[planId] || _extraLayers[planId] !== g) return;
      if (!data) return;
      if (data.tilesOverview) {
        const pn = _panePour(planId);
        _renderTilesInto(g.tiles, data.tilesOverview, p.georef,
                         _extraOpacity[planId], _zIndexPour(planId), pn ? pn.nom : null);
      }
      _renderDataLayersOnMiniMap(data, p.georef, g, planId);
      _majLargeurFrontsHome();
      _appliquerOrdre();
      _appliquerVisibilites();
      _renderModalTags();   // les tags du plan ajouté arrivent dès son extraction
      _renderModalNiveaux();
    });
  }

  function _ajouterPlanOsm(planId) {
    const m = _monterPlanOsm(planId);
    if (!m) return;
    _avertirMultiSiBesoin();
    _renderMultiPanel();
    _renderPortails();   // la pile a changé : les liaisons traçables aussi
    _chargerDataPlanOsm(planId, m.p, m.g);
  }

  // Démontage SANS re-rendu (le lot par étiquette n'en veut qu'un) ; _retirerPlanOsm reste le chemin unitaire.
  function _demonterPlanOsm(planId) {
    const g = _extraLayers[planId];
    if (!g) {
      // 🩸 une ligne FANTÔME (dans la pile sans groupe : ex-principal d'un re-mount, groupe mort) reste RETIRABLE ;
      // le principal courant ne se retire pas (pas de ✕ sur sa ligne)
      const iF = _stackOrder.indexOf(planId);
      if (iF === -1 || planId === _selectedPlanId) return false;
      _stackOrder.splice(iF, 1);
      return true;
    }
    try {
      if (_mapInstance) {
        if (_mapInstance.hasLayer(g.tiles)) _mapInstance.removeLayer(g.tiles);
        if (_mapInstance.hasLayer(g.data))  _mapInstance.removeLayer(g.data);
      }
      g.tiles.clearLayers(); g.data.clearLayers();
    } catch(e) {}
    delete _extraLayers[planId];
    const i = _stackOrder.indexOf(planId);
    if (i !== -1) _stackOrder.splice(i, 1);
    _retirerHiRes(planId); // les hi-res sont éphémères
    // pas de révocation des blob URLs de la vue d'ensemble : elles vivent dans _planDataCache
    return true;
  }

  function _retirerPlanOsm(planId) {
    // 🩸 UN CLIC SUR ✕ FAIT TOUJOURS DISPARAÎTRE LA LIGNE : le retrait de la pile est VÉRIFIÉ après coup
    // (quel que soit le chemin de _demonterPlanOsm), et le re-rendu a lieu même si un rendu annexe (ordre,
    // portails, tags, niveaux) jette.
    const principal = (planId === _selectedPlanId);
    try { _demonterPlanOsm(planId); } catch(e) { console.warn("[OsmHomePreview] démontage " + planId + " :", e); }
    if (!principal) {
      const i = _stackOrder.indexOf(planId);
      if (i !== -1) _stackOrder.splice(i, 1);   // ceinture : la ligne s'en va
    }
    [_appliquerOrdre, _renderMultiPanel, _renderPortails, _renderModalTags, _renderModalNiveaux]
      .forEach(function(fn) {
        try { fn(); } catch(e) { console.warn("[OsmHomePreview] re-rendu après retrait :", e); }
      });
  }

  // ── Ajouter à la pile par étiquette de plan ──────────
  // Afficher d'un coup tous les plans portant une étiquette (`plan.tags` du registre).
  // ⚠️ À ne pas confondre avec « 🏷️ Filtrer par tag » juste au-dessus, qui filtre les POI DANS les plans
  // affichés ; ici on choisit QUELS plans sont affichés (d'où l'intitulé « étiquette de plan »).
  // 🩸 Regroupement INSENSIBLE À LA CASSE : PlanRegistry.setTags dédoublonne par plan, pas entre plans ;
  // « Secteur » et « SECTEUR » donneraient deux chips, chacun avec la moitié des plans.
  function _etiquettesDesPlans() {
    const parTag = {};   // clé en minuscules → { libelle, ids: [] }
    _listGeorefPlans().forEach(function (p) {
      (Array.isArray(p.tags) ? p.tags : []).forEach(function (t) {
        const brut = String(t == null ? "" : t).trim();
        if (!brut) return;
        const cle = brut.toLowerCase();
        if (!parTag[cle]) parTag[cle] = { libelle: brut, ids: [] };
        if (parTag[cle].ids.indexOf(p.id) < 0) parTag[cle].ids.push(p.id);
      });
    });
    return parTag;
  }

  function _renderMultiTags() {
    const cont = document.getElementById("ktaOsmMultiTags");
    const sect = document.getElementById("ktaOsmMultiTagsSect");
    if (!cont) return;
    const parTag = _etiquettesDesPlans();
    // une étiquette d'UN seul plan n'apporte rien (le sélecteur le fait déjà) et noierait les autres
    const cles = Object.keys(parTag)
      .filter(function (c) { return parTag[c].ids.length >= 2; })
      .sort(function (a, b) {
        return parTag[b].ids.length - parTag[a].ids.length || a.localeCompare(b);
      });
    if (!cles.length) { cont.innerHTML = ""; if (sect) sect.style.display = "none"; return; }
    if (sect) sect.style.display = "";
    cont.innerHTML = cles.map(function (c) {
      const e = parTag[c];
      const dans = e.ids.filter(function (id) { return _stackOrder.indexOf(id) >= 0; }).length;
      const tous = (dans === e.ids.length);
      const cle18n = tous ? "osm_mode.multi.tagRetirerTitle" : "osm_mode.multi.tagAjouterTitle";
      return '<button type="button" class="kta-osm-home-tag-chip' + (tous ? " active" : "") + '"' +
             ' data-ptag="' + _escapeHtml(c) + '"' +
             ' title="' + _escapeHtml(window.I18n.t(cle18n, { n: e.ids.length })) + '">' +
             _escapeHtml(e.libelle) + ' <span>' + dans + '/' + e.ids.length + '</span></button>';
    }).join("");
    cont.querySelectorAll("[data-ptag]").forEach(function (b) {
      b.addEventListener("click", function () {
        _basculerEtiquettePlans(b.getAttribute("data-ptag"));
      });
    });
  }

  // Un clic AJOUTE ce qui manque tant qu'un plan de l'étiquette est absent, sinon RETIRE le lot (sans retrait
  // groupé, défaire vingt plans coûterait vingt ✕).
  function _basculerEtiquettePlans(cle) {
    const e = _etiquettesDesPlans()[cle];
    if (!e) return;
    const absents = e.ids.filter(function (id) { return _stackOrder.indexOf(id) < 0; });
    if (absents.length) _ajouterPlansOsm(absents, e.libelle);
    else _retirerPlansOsm(e.ids);
  }

  // Tous les plans géoréférencés d'un dossier pas encore affichés (même chemin que le lot par étiquette).
  function _ajouterDossierOsm(dossierId) {
    const PR = window.PlanRegistry;
    if (!PR || typeof PR.planFolderId !== "function") return;
    const f = PR.findFolder ? PR.findFolder(dossierId) : null;
    const ids = _listGeorefPlans().filter(function(p) {
      const e = PR.findById ? PR.findById(p.id) : null;
      return e && PR.planFolderId(e) === dossierId && _stackOrder.indexOf(p.id) === -1;
    }).map(function(p) { return p.id; });
    if (ids.length) _ajouterPlansOsm(ids, f ? f.name : "", "osm_mode.multi.folderConfirm");
  }

  async function _ajouterPlansOsm(ids, libelle, cleConfirm) {
    // ⚠️ On DEMANDE AVANT, avec le compte : sans plafond dur, _avertirMultiSiBesoin prévient après coup, trop
    // tard pour renoncer à un lot. Même seuil que cet avertissement (3).
    const total = _stackOrder.length + ids.length;
    if (ids.length >= 2 && total > 3) {
      const ok = await window.ktaConfirm(window.I18n.t(cleConfirm || "osm_mode.multi.tagConfirm",
        { n: ids.length, tag: window.ktaEsc(libelle || ""), total: total }));
      if (!ok) return;
    }
    const montes = [];
    ids.forEach(function (id) {
      const m = _monterPlanOsm(id);
      if (m) montes.push({ id: id, p: m.p, g: m.g });
    });
    if (!montes.length) return;
    _avertirMultiSiBesoin();
    _renderMultiPanel();
    _renderPortails();
    // EN SÉRIE : chaque chargement extrait un ZIP ; en parallèle, vingt extractions figent l'onglet
    let chaine = Promise.resolve();
    montes.forEach(function (m) {
      chaine = chaine.then(function () { return _chargerDataPlanOsm(m.id, m.p, m.g); })
                     .catch(function (e) {
                       console.warn("[OsmHome] chargement du plan " + m.id + " échoué :", e);
                     });
    });
  }

  function _retirerPlansOsm(ids) {
    // le PRINCIPAL ne se retire pas (pas de ✕, et _renderMultiPanel le remettrait dans la pile) : le chip
    // repasse à « 1/N », ce qui est vrai
    let n = 0;
    ids.forEach(function (id) {
      if (id === _selectedPlanId) return;
      if (_demonterPlanOsm(id)) n++;
    });
    if (!n) return;
    _appliquerOrdre();
    _renderMultiPanel();
    _renderPortails();
    _renderModalTags();
    _renderModalNiveaux();
  }

  // sens : -1 = monter (vers le dessus), +1 = descendre
  function _deplacerPlan(planId, sens) {
    const i = _stackOrder.indexOf(planId);
    const j = i + sens;
    if (i === -1 || j < 0 || j >= _stackOrder.length) return;
    _stackOrder[i] = _stackOrder[j];
    _stackOrder[j] = planId;
    _appliquerOrdre();
    _renderMultiPanel();
  }

  function _setOpaciteExtra(planId, v) {
    _extraOpacity[planId] = Math.max(0, Math.min(1, v));
    _appliquerOpaciteHiRes(planId, _extraOpacity[planId]);
    if (_opaciteTuilesPlan(planId, _extraOpacity[planId])) return;   // sous-calque : tuiles opaques
    const g = _extraLayers[planId];
    if (!g) return;
    g.tiles.eachLayer(function(l) {
      try {
        if (typeof l.setOpacity === "function") l.setOpacity(_extraOpacity[planId]);
        else if (l._image) l._image.style.opacity = String(_extraOpacity[planId]);
      } catch(e) {}
    });
  }

  // Modale « Plans & filtres OSM » (rien de flottant sur la carte), sur le modèle de ≡ Filtres du mode plan.
  // _renderMultiPanel() cible ses ids (garde d'existence en place).
  const OSM_FILTERS_MODAL_ID = "kta-osm-filters-modal";

  function _fermerModalFiltresOsm() {
    const m = document.getElementById(OSM_FILTERS_MODAL_ID);
    if (m) m.remove();
    document.removeEventListener("keydown", _escFiltresOsm, true);
  }
  function _escFiltresOsm(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      // capture + stopPropagation : Échap ne referme pas AUSSI le mode OSM (handler plein écran en bulle)
      e.stopPropagation();
      _fermerModalFiltresOsm();
    }
  }

  function _ouvrirModalFiltresOsm() {
    _fermerModalFiltresOsm();
    const overlay = document.createElement("div");
    overlay.id = OSM_FILTERS_MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.style.zIndex = "100001";   // au-dessus du widget plein écran
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-osm-filters-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">🎚️ ' + _escapeHtml(window.I18n.t("osm_mode.filters.title")) + '</span>' +
          '<button class="kta-readme-modal-close" id="kta-osm-filters-close" type="button" aria-label="✕">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p class="kta-osm-filters-hint">' + _escapeHtml(window.I18n.t("osm_mode.filters.hint")) + '</p>' +
          '<div class="kta-osm-filters-sect">' + _escapeHtml(window.I18n.t("osm_mode.filters.global")) + '</div>' +
          '<div class="kta-osm-multi-cats kta-osm-filters-globaux" id="ktaOsmFiltersGlobaux"></div>' +
          // « qualité du calage », rempli quand le chip 🌀 est actif (_renderPortailsQualite)
          '<div class="kta-osm-qualite" id="ktaOsmPortailsQualite"></div>' +
          // chips de niveau : masqués sur un plan mono-niveau (« niveau 0 » seul n'apprend rien)
          '<div class="kta-osm-filters-sect" id="ktaOsmFiltersNivSect" style="display:none;">' +
            _escapeHtml(window.I18n.t("osm_home.niveaux.titre")) + '</div>' +
          '<div class="kta-osm-home-tagchips" id="ktaOsmFiltersNiveaux"></div>' +
          '<div class="kta-osm-filters-sect">' + _escapeHtml(window.I18n.t("osm_mode.filters.tags")) + '</div>' +
          '<div class="kta-osm-home-tagchips kta-osm-filters-tags" id="ktaOsmFiltersTags"></div>' +
          '<div class="kta-osm-filters-sect">' + _escapeHtml(window.I18n.t("osm_mode.filters.plans")) + '</div>' +
          // ajout par étiquette de plan : masqué tant qu'aucune étiquette ne porte au moins deux plans
          '<div class="kta-osm-filters-sect" id="ktaOsmMultiTagsSect" style="display:none;">' +
            _escapeHtml(window.I18n.t("osm_mode.multi.tagsTitre")) + '</div>' +
          '<div class="kta-osm-home-tagchips" id="ktaOsmMultiTags"></div>' +
          '<select id="ktaOsmMultiAdd" class="kta-osm-filters-add"></select>' +
          '<div id="ktaOsmMultiRows"></div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-osm-filters-close").addEventListener("click", _fermerModalFiltresOsm);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) _fermerModalFiltresOsm(); });
    document.addEventListener("keydown", _escFiltresOsm, true);

    const multiAdd = overlay.querySelector("#ktaOsmMultiAdd");
    if (multiAdd) {
      multiAdd.addEventListener("change", function() {
        const v = multiAdd.value;
        multiAdd.value = "";
        if (!v) return;
        if (v.indexOf("dossier:") === 0) { _ajouterDossierOsm(v.slice(8)); return; }
        _ajouterPlanOsm(v);
      });
    }
    _renderModalGlobaux();
    _renderModalTags();
    _renderModalNiveaux();
    _renderMultiPanel();
  }

  // catalogue des 5 catégories (chips globaux ET par plan)
  const _CATS = [
    ["tiles",  "🖼️", "osm_home.toggle.plan.label"],
    ["poi",    "📍", "osm_home.toggle.poi.label"],
    ["roads",  "🛣️", "osm_home.toggle.roads.label"],
    ["zones",  "🌐", "osm_home.toggle.zones.label"],
    ["struct", "🏛️", "osm_home.toggle.struct.label"]
  ];

  // chips GLOBAUX de la modale
  function _renderModalGlobaux() {
    const cont = document.getElementById("ktaOsmFiltersGlobaux");
    if (!cont) return;
    const etats = { tiles: _showTiles, poi: _showPoi, roads: _showRoads,
                    zones: _showZones, struct: _showStructures };
    const setters = { tiles: _toggleTiles, poi: _togglePoi, roads: _toggleRoads,
                      zones: _toggleZones, struct: _toggleStructures };
    cont.innerHTML = _CATS.map(function(c) {
      return '<button type="button" class="kta-osm-multi-cat kta-osm-cat-libelle' +
             (etats[c[0]] ? " active" : "") + '" data-gcat="' + c[0] + '">' +
             c[1] + ' <span>' + _escapeHtml(window.I18n.t(c[2])) + '</span></button>';
    }).join("");
    // chip PORTAILS hors `_CATS` : ce catalogue alimente aussi les filtres PAR PLAN, or un portail appartient à
    // DEUX plans. Affiché seulement s'il existe au moins une liaison.
    let nbLiens = 0;
    try {
      nbLiens = (window.InterPlanLinks && typeof window.InterPlanLinks.getAllLinks === "function")
        ? (window.InterPlanLinks.getAllLinks() || []).length : 0;
    } catch(e) { nbLiens = 0; }
    if (nbLiens > 0) {
      cont.innerHTML += '<button type="button" class="kta-osm-multi-cat kta-osm-cat-libelle' +
        (_showPortails ? " active" : "") + '" data-gportails="1" ' +
        'title="' + _escapeHtml(window.I18n.t("osm_home.portails.hint")) + '">🌀 <span>' +
        _escapeHtml(window.I18n.t("osm_home.portails.label")) + '</span></button>';
    }
    // chip SESSION hors `_CATS` aussi : une ORIGINE de données, transversale aux catégories
    cont.innerHTML += '<button type="button" class="kta-osm-multi-cat kta-osm-cat-libelle' +
      (_showSession ? " active" : "") + '" data-gsession="1" ' +
      'title="' + _escapeHtml(window.I18n.t("osm_home.session.hint")) + '">📝 <span>' +
      _escapeHtml(window.I18n.t("osm_home.session.label")) + '</span></button>';

    cont.querySelectorAll("[data-gcat]").forEach(function(b) {
      b.addEventListener("click", function() {
        const cat = b.getAttribute("data-gcat");
        const nouveau = !({ tiles: _showTiles, poi: _showPoi, roads: _showRoads,
                            zones: _showZones, struct: _showStructures }[cat]);
        setters[cat](nouveau);
        b.classList.toggle("active", nouveau);
      });
    });
    const bp = cont.querySelector("[data-gportails]");
    if (bp) bp.addEventListener("click", function() {
      _togglePortails(!_showPortails);
      bp.classList.toggle("active", _showPortails);
      _renderPortailsQualite();
    });
    const bs = cont.querySelector("[data-gsession]");
    if (bs) bs.addEventListener("click", function() {
      _toggleSession(!_showSession);
      bs.classList.toggle("active", _showSession);
    });
    _renderPortailsQualite();
  }

  // Chips de niveau agrégés sur TOUTE la pile (comme les tags), triés du haut vers le bas (+1, puis -1, -2…) :
  // l'ordre physique vu du dessus.
  function _renderModalNiveaux() {
    const cont = document.getElementById("ktaOsmFiltersNiveaux");
    const sect = document.getElementById("ktaOsmFiltersNivSect");
    if (!cont) return;
    const tous = new Set();
    _stackOrder.forEach(function(id) {
      const data = _planDataCache[id];
      if (data) _collectNiveaux(data, id).forEach(function(n) { tous.add(n); });
    });
    const niveaux = Array.from(tous).sort(function(a, b) { return b - a; });
    if (niveaux.length < 2) {
      cont.innerHTML = "";
      if (sect) sect.style.display = "none";
      return;
    }
    if (sect) sect.style.display = "";
    const tousActifs = !_homeLevelFilter || _homeLevelFilter.size === 0;
    cont.innerHTML =
      '<button type="button" class="kta-osm-home-tag-chip' + (tousActifs ? " active" : "") +
        '" data-nivall="1">' + _escapeHtml(window.I18n.t("osm_home.niveaux.tous")) + '</button>' +
      niveaux.map(function(n) {
        const on = tousActifs || _homeLevelFilter.has(n);
        return '<button type="button" class="kta-osm-home-tag-chip' + (on ? " active" : "") +
               '" data-niv="' + n + '">' + (n > 0 ? "+" + n : n) + '</button>';
      }).join("");

    cont.querySelectorAll("[data-niv]").forEach(function(b) {
      b.addEventListener("click", function() {
        const n = parseInt(b.getAttribute("data-niv"), 10);
        // premier clic depuis « tout » : on ISOLE le niveau cliqué (en retirer un sur sept ne changerait presque rien)
        if (!_homeLevelFilter || _homeLevelFilter.size === 0) {
          _homeLevelFilter = new Set([n]);
        } else if (_homeLevelFilter.has(n)) {
          _homeLevelFilter.delete(n);
          if (_homeLevelFilter.size === 0) _homeLevelFilter = null;   // plus rien de coché = tout
        } else {
          _homeLevelFilter.add(n);
        }
        _renderModalNiveaux();
        _reRenderDataTous();
      });
    });
    const ball = cont.querySelector("[data-nivall]");
    if (ball) ball.addEventListener("click", function() {
      _homeLevelFilter = null;
      _renderModalNiveaux();
      _reRenderDataTous();
    });
  }

  function _renderModalTags() {
    const cont = document.getElementById("ktaOsmFiltersTags");
    if (!cont) return;
    const counts = {};
    _stackOrder.forEach(function(id) {
      const data = _planDataCache[id];
      if (!data) return;
      const c = _collectAvailableTags(data, id);
      Object.keys(c).forEach(function(t) { counts[t] = (counts[t] || 0) + c[t]; });
    });
    const tags = Object.keys(counts).sort(function(a, b) { return counts[b] - counts[a]; });
    if (tags.length === 0) { cont.innerHTML = ""; return; }
    const isAllActive = !_homeTagFilter || _homeTagFilter.size === 0;
    let html = '<button class="kta-osm-home-tag-chip' + (isAllActive ? " active" : "") +
               '" data-mtag="__all__">' + _escapeHtml(window.I18n.t("osm_home.tagchip.all")) + '</button>';
    tags.forEach(function(t) {
      const active = isAllActive || (_homeTagFilter && _homeTagFilter.has(t));
      html += '<button class="kta-osm-home-tag-chip' + (active ? " active" : "") +
              '" data-mtag="' + _escapeHtml(t) + '" title="' +
              _escapeHtml(window.I18n.t("osm_home.tagchip.count", { count: counts[t] })) + '">' +
              _escapeHtml(t) + '</button>';
    });
    cont.innerHTML = html;
    cont.querySelectorAll("[data-mtag]").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const tag = btn.getAttribute("data-mtag");
        if (tag === "__all__") {
          _homeTagFilter = null;
        } else {
          if (!_homeTagFilter) _homeTagFilter = new Set();
          if (_homeTagFilter.has(tag)) _homeTagFilter.delete(tag);
          else _homeTagFilter.add(tag);
          if (_homeTagFilter.size === 0) _homeTagFilter = null;
        }
        _reRenderDataTous();
        _renderModalTags();
        _renderModalNiveaux();
      });
    });
  }

  // Re-rend les DONNÉES de toute la pile (filtre modifié) ; les tuiles ne bougent pas.
  function _reRenderDataTous() {
    const plans = _listGeorefPlans();
    const principal = plans.find(function(p) { return p.id === _selectedPlanId; });
    const dataP = _selectedPlanId ? _planDataCache[_selectedPlanId] : null;
    if (principal && dataP) _renderDataLayersOnMiniMap(dataP, principal.georef);
    _majLargeurFrontsHome();
    _chaqueExtra(function(g, id) {
      const p = plans.find(function(x) { return x.id === id; });
      const data = _planDataCache[id];
      if (p && data) _renderDataLayersOnMiniMap(data, p.georef, g, id);
    });
    _appliquerVisibilites();
  }

  // Panneau 🗂️, reconstruit à chaque changement de pile ; lignes dans l'ordre de _stackOrder (haut = dessus).
  function _renderMultiPanel() {
    const rows = document.getElementById("ktaOsmMultiRows");
    const addSel = document.getElementById("ktaOsmMultiAdd");
    if (!rows || !addSel) return;
    // 🩸 ceinture : le principal DOIT être dans la pile ; rattrape tout chemin qui poserait _selectedPlanId sans
    // passer par selectPlan
    if (_selectedPlanId && _stackOrder.indexOf(_selectedPlanId) === -1) {
      _stackOrder.unshift(_selectedPlanId);
    }
    const plans = _listGeorefPlans();
    const nomDe = function(id) {
      const p = plans.find(function(x) { return x.id === id; });
      return p ? p.name : id;
    };

    rows.innerHTML = _stackOrder.map(function(id, i) {
      const principal = (id === _selectedPlanId);
      const op = principal ? _planOpacity : (_extraOpacity[id] != null ? _extraOpacity[id] : 0.5);
      return '<div class="kta-osm-multi-row" data-id="' + _escapeHtml(id) + '">' +
        '<span class="kta-osm-multi-ordre">' +
          '<button type="button" class="kta-osm-multi-btn" data-up="' + _escapeHtml(id) + '"' +
            (i === 0 ? ' disabled' : '') + ' title="' + _escapeHtml(window.I18n.t("osm_mode.multi.upTitle")) + '">▲</button>' +
          '<button type="button" class="kta-osm-multi-btn" data-down="' + _escapeHtml(id) + '"' +
            (i === _stackOrder.length - 1 ? ' disabled' : '') + ' title="' + _escapeHtml(window.I18n.t("osm_mode.multi.downTitle")) + '">▼</button>' +
        '</span>' +
        '<span class="kta-osm-multi-nom"' + (principal ? ' title="' + _escapeHtml(window.I18n.t("osm_mode.multi.primaryTitle")) + '"' : '') + '>' +
          (principal ? "◉ " : "") + _escapeHtml(nomDe(id)) + '</span>' +
        '<input type="range" class="kta-osm-multi-op" data-op="' + _escapeHtml(id) + '" ' +
          'min="0" max="100" value="' + Math.round(op * 100) + '" ' +
          'title="' + _escapeHtml(window.I18n.t("osm_mode.multi.opacityTitle")) + '">' +
        (principal ? '<span class="kta-osm-multi-btn kta-osm-multi-vide"></span>'
                   : '<button type="button" class="kta-osm-multi-btn kta-osm-multi-x" data-x="' + _escapeHtml(id) + '" ' +
                     'title="' + _escapeHtml(window.I18n.t("osm_mode.multi.removeTitle")) + '">✕</button>') +
        // chips PAR PLAN : visibilité effective = bascule globale ET chip du plan
        '<div class="kta-osm-multi-cats">' +
          _CATS.map(function(c) {
            const v = _visDe(id);
            return '<button type="button" class="kta-osm-multi-cat kta-osm-cat-libelle' + (v[c[0]] ? " active" : "") + '" ' +
                   'data-cat="' + c[0] + '" data-plan="' + _escapeHtml(id) + '">' +
                   c[1] + ' <span>' + _escapeHtml(window.I18n.t(c[2])) + '</span></button>';
          }).join("") +
        '</div>' +
      '</div>';
    }).join("");

    // sélecteur d'ajout : plans géoréférencés restants
    const restants = plans.filter(function(p) { return _stackOrder.indexOf(p.id) === -1; });
    const opt = function(p) { return '<option value="' + _escapeHtml(p.id) + '">' + _escapeHtml(p.name) + '</option>'; };
    // rangés par DOSSIER de « Mes plans » (même règle que la liste), « ajouter tout le dossier » en tête d'un
    // dossier de 2 plans ou plus
    const PR = window.PlanRegistry;
    const dossiers = (PR && typeof PR.getFolders === "function") ? PR.getFolders() : [];
    let corps;
    if (!dossiers.length || typeof PR.planFolderId !== "function") {
      corps = restants.map(opt).join("");
    } else {
      const dossierDe = function(p) { const e = PR.findById ? PR.findById(p.id) : null; return e ? PR.planFolderId(e) : null; };
      const groupes = dossiers.map(function(f) { return { f: f, plans: restants.filter(function(p) { return dossierDe(p) === f.id; }) }; });
      const ranges = {}; groupes.forEach(function(g) { g.plans.forEach(function(p) { ranges[p.id] = true; }); });
      const autres = restants.filter(function(p) { return !ranges[p.id]; });
      corps = groupes.filter(function(g) { return g.plans.length; }).map(function(g) {
        return '<optgroup label="📁 ' + _escapeHtml(g.f.name) + '">' +
          (g.plans.length >= 2 ? '<option value="dossier:' + _escapeHtml(g.f.id) + '">' +
            _escapeHtml(window.I18n.t("osm_mode.multi.addFolder", { n: g.plans.length })) + '</option>' : "") +
          g.plans.map(opt).join("") + '</optgroup>';
      }).join("") + (autres.length ? '<optgroup label="' + _escapeHtml(window.I18n.t("home.plans.folders.unfiled")) + '">' +
        autres.map(opt).join("") + '</optgroup>' : "");
    }
    addSel.innerHTML = '<option value="">' + _escapeHtml(window.I18n.t("osm_mode.multi.add")) + '</option>' + corps;
    addSel.style.display = restants.length ? "" : "none";

    // lignes reconstruites → rebranchées à chaque rendu
    rows.querySelectorAll("[data-up]").forEach(function(b) {
      b.addEventListener("click", function() { _deplacerPlan(b.getAttribute("data-up"), -1); });
    });
    rows.querySelectorAll("[data-down]").forEach(function(b) {
      b.addEventListener("click", function() { _deplacerPlan(b.getAttribute("data-down"), +1); });
    });
    rows.querySelectorAll("[data-x]").forEach(function(b) {
      b.addEventListener("click", function() { _retirerPlanOsm(b.getAttribute("data-x")); });
    });
    rows.querySelectorAll(".kta-osm-multi-cat").forEach(function(b) {
      b.addEventListener("click", function() {
        const id = b.getAttribute("data-plan");
        const cat = b.getAttribute("data-cat");
        const v = _visDe(id);
        v[cat] = !v[cat];
        b.classList.toggle("active", v[cat]);
        _appliquerVisibilites();
      });
    });
    // chips d'étiquette (« 3/12 ») : tout ce qui modifie la pile passe par ici, un seul point de rendu
    _renderMultiTags();

    rows.querySelectorAll("[data-op]").forEach(function(r) {
      r.addEventListener("input", function() {
        const id = r.getAttribute("data-op");
        const v = parseInt(r.value, 10) / 100;
        if (id === _selectedPlanId) {
          _setPlanOpacity(v);
        } else {
          _setOpaciteExtra(id, v);
        }
      });
    });
  }

  // ── Recherche du mode OSM ──────────
  // 🔒 STRICTEMENT LOCALE (décision produit : pas de sortie internet) : ① les plans de la liste OSM (géoréférencés
  // seulement) ② leurs POI, lus via _loadPlanDataForPreview (cache RAM). PAS de recherche d'adresse (Nominatim
  // = nouvelle surface réseau).
  // Index construit à la PREMIÈRE saisie (extraire N ZIP au mount ralentirait le boot du HOME).
  let _searchIndex = null;      // [{type:"plan"|"poi", planId, planName, georef, nom, x, y, tags}]
  // 🩸 Pendant l'extraction, un 2e appel reçoit LA promesse en vol : une résolution immédiate à null relançait
  // le rendu en boucle de microtâches (UI gelée sur « Lecture des plans… »).
  let _searchIndexPromise = null;

  function _construireIndexRecherche() {
    if (_searchIndex) return Promise.resolve(_searchIndex);
    if (_searchIndexPromise) return _searchIndexPromise;
    const plans = _listGeorefPlans();
    const index = [];
    plans.forEach(function(p) {
      index.push({ type: "plan", planId: p.id, planName: p.name, georef: p.georef });
    });
    // extraction séquentielle (N JSZip simultanés = pic RAM mobile) ; les passages suivants sont gratuits (cache)
    let chaine = Promise.resolve();
    plans.forEach(function(p) {
      chaine = chaine.then(function() {
        return _loadPlanDataForPreview(p.id).then(function(data) {
          if (!data) return;
          _tousCalques(data, p.id).forEach(function(layer) {
            (layer.points || []).forEach(function(pt) {
              if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
              index.push({
                type: "poi", planId: p.id, planName: p.name, georef: p.georef,
                nom: pt.nom || pt.id || "", x: pt.x, y: pt.y,
                tags: Array.isArray(pt.tags) ? pt.tags.join(" ") : ""
              });
            });
          });
        }).catch(function() {});
      });
    });
    _searchIndexPromise = chaine.then(function() {
      _searchIndex = index;
      _searchIndexPromise = null;
      return index;
    });
    return _searchIndexPromise;
  }

  // 🩸 un POI se projette par le géoréf de SON plan, jamais celui du plan sélectionné
  function _poiVersLatLng(entry) {
    try {
      if (!window.KmzExport || typeof window.KmzExport.buildTransform !== "function") return null;
      const g = entry.georef;
      const t = window.KmzExport.buildTransformCalib(g);   // pointC optionnel propagé (affine)
      const gps = window.KmzExport.planToGps(t, entry.x, entry.y);
      return gps ? L.latLng(gps.lat, gps.lng) : null;
    } catch(e) { return null; }
  }

  let _searchFlashMarker = null;

  function _allerAuResultat(entry) {
    const resEl = document.getElementById("ktaOsmHomeSearchResults");
    if (resEl) resEl.style.display = "none";
    // le résultat bascule d'abord la vue sur SON plan
    if (entry.planId !== _selectedPlanId) selectPlan(entry.planId);
    if (entry.type === "plan") return;   // sélection = fitBounds déjà fait
    const ll = _poiVersLatLng(entry);
    if (!ll) return;
    // la carte peut être en (re)création après selectPlan : essais bornés
    let essais = 0;
    (function _volerVers() {
      if (!_mapInstance) {
        if (++essais < 12) setTimeout(_volerVers, 250);
        return;
      }
      try {
        _mapInstance.flyTo(ll, Math.max(_mapInstance.getZoom(), 17), { duration: 0.6 });
        if (_searchFlashMarker) { try { _mapInstance.removeLayer(_searchFlashMarker); } catch(e) {} }
        _searchFlashMarker = L.circleMarker(ll, {
          radius: 11, color: "#f4c542", weight: 3, fillColor: "#f4c542", fillOpacity: 0.25
        }).addTo(_mapInstance);
        if (entry.nom) _searchFlashMarker.bindPopup(_escapeHtml(entry.nom)).openPopup();
      } catch(e) {}
    })();
  }

  function _bindOsmSearch(container) {
    const input = container.querySelector("#ktaOsmHomeSearchInput");
    const resEl = container.querySelector("#ktaOsmHomeSearchResults");
    if (!input || !resEl) return;

    // la liste de résultats épouse la barre (même gauche, même largeur, collée dessous) : position fixed sur le
    // rect de l'input à chaque affichage, min 320 px, bornée au viewport
    function _positionnerResultats() {
      try {
        const r = input.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const largeur = Math.min(Math.max(r.width, 320), vw - 16);
        let gauche = r.left;
        if (gauche + largeur > vw - 8) gauche = vw - 8 - largeur;   // clamp droite
        if (gauche < 8) gauche = 8;                                  // clamp gauche
        resEl.style.top   = Math.round(r.bottom + 6) + "px";
        resEl.style.left  = Math.round(gauche) + "px";
        resEl.style.width = Math.round(largeur) + "px";
      } catch(e) {}
    }

    function _rendre(q) {
      if (!q) { resEl.style.display = "none"; resEl.innerHTML = ""; return; }
      if (!_searchIndex) {
        _positionnerResultats();
        resEl.style.display = "block";
        resEl.innerHTML = '<div class="kta-osm-search-empty">' +
          _escapeHtml(window.I18n.t("osm_mode.search.scanning")) + '</div>';
        _construireIndexRecherche().then(function() { _rendre(String(input.value || "").toLowerCase().trim()); });
        return;
      }
      const matches = _searchIndex.filter(function(e) {
        if (e.type === "plan") return e.planName.toLowerCase().indexOf(q) !== -1;
        return (e.nom && e.nom.toLowerCase().indexOf(q) !== -1)
            || (e.tags && e.tags.toLowerCase().indexOf(q) !== -1);
      }).slice(0, 30);
      if (matches.length === 0) {
        _positionnerResultats();
        resEl.style.display = "block";
        resEl.innerHTML = '<div class="kta-osm-search-empty">' +
          _escapeHtml(window.I18n.t("osm_mode.search.noResult")) + '</div>';
        return;
      }
      _positionnerResultats();
        resEl.style.display = "block";
      resEl.innerHTML = matches.map(function(e, i) {
        return '<button type="button" class="kta-osm-search-row" data-i="' + i + '">' +
                 (e.type === "plan"
                   ? '🗺️ <b>' + _escapeHtml(e.planName) + '</b>'
                   : '📍 ' + _escapeHtml(e.nom || "?") +
                     ' <span class="kta-osm-search-badge">' + _escapeHtml(e.planName) + '</span>') +
               '</button>';
      }).join("");
      resEl.querySelectorAll(".kta-osm-search-row").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const e = matches[parseInt(btn.getAttribute("data-i"), 10)];
          if (e) _allerAuResultat(e);
        });
      });
    }

    let _debounce = null;
    input.addEventListener("input", function() {
      if (_debounce) clearTimeout(_debounce);
      _debounce = setTimeout(function() {
        _rendre(String(input.value || "").toLowerCase().trim());
      }, 180);
    });
    input.addEventListener("keydown", function(e) {
      if (e.key === "Escape") { resEl.style.display = "none"; input.blur(); e.stopPropagation(); }
    });
  }

  // ⚠️ Avertissement perf du mode OSM (décision produit) : UNE FOIS à la première ouverture (persisté en LS) ;
  // le seuil « > 3 plans » passe par la même fonction.
  const _WARN_LS_KEY = "myktamap_osm_mode_warn_v1";
  function _avertirPerfModeOsm() {
    try {
      if (localStorage.getItem(_WARN_LS_KEY)) return;
      localStorage.setItem(_WARN_LS_KEY, "1");
    } catch(e) {}
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(window.I18n.t("osm_mode.warn.perf"), "warn");
    }
  }

  function openFullScreen() {
    _isFullscreen = !_isFullscreen;
    const box = document.getElementById("ktaOsmHomeBox");
    if (!box) return;
    if (_isFullscreen) {
      _avertirPerfModeOsm();   // une fois, à la première ouverture du mode
      box.classList.add("kta-osm-home-fullscreen-active");
      document.body.classList.add("kta-osm-home-fs-lock");
      // Échap pour réduire
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
    // icône du bouton (⛶ ↔ ✕)
    const btn = document.getElementById("ktaOsmHomeFullBtn");
    if (btn) {
      btn.textContent = _isFullscreen ? "✕" : "⛶";
      btn.title = _isFullscreen
        ? window.I18n.t("osm_home.fullscreen.exitTitle")
        : window.I18n.t("osm_home.fullscreen.enterTitle");
    }
    // invalidateSize après la transition du DOM, sinon les tuiles ne couvrent que l'ancienne zone
    setTimeout(function() {
      if (_mapInstance) try { _mapInstance.invalidateSize(); } catch(e) {}
    }, 100);
  }

  // ── API publique ──────────
  function mount(preferId) {
    // `preferId` : plan à afficher d'abord (celui qu'on vient de quitter, passé par afficherLoader).
    // 🩸 On EXIGE une chaîne : `Promise.resolve(ready).then(mount)` passe la valeur résolue en 1er argument.
    if (typeof preferId !== "string" || !preferId) preferId = null;
    const container = document.getElementById("ktaOsmHomeContent");
    if (!container) return; // pas au HOME : sortie silencieuse

    // ⚠️ Au retour d'un plan, la pile repart de zéro avec ce seul plan. `preferId` n'est renseigné que par
    // main.js > refresh(planId) au retour à l'accueil.
    // 🩸 Règle posée au POINT D'ENTRÉE, pas dans _initMiniMap : les chemins qui ne recréent pas la carte
    // (hors ligne sans cache, incognito, pas de #ktaOsmHomeMap) garderaient des plans aux couches mortes.
    // Les groupes de couches sont démontés au passage ; `_extraOpacity` est conservé (survit à un re-ajout).
    if (preferId) _reinitialiserPileAuRetour(preferId);

    // cache des légendes par plan invalidé : un retour HOME après des modifs de couleur relit les slots
    _legendeParPlan = {};

    // la colonne d'abord (un mount précédent a pu la masquer)
    _setOsmColumnVisible(true);

    // Cas 1 : pas d'opt-in → colonne masquée.
    // 🩸 Le SEUL chemin sans bandeau, voulu : rien où l'afficher, rien à annoncer — le refus est respecté en
    // silence.
    if (!_isOptedIn()) {
      _renderOptInNeeded(container);
      return;
    }
    // Cas 1bis : incognito → message dédié, tout est bloqué
    if (_isIncognitoOn()) {
      _renderIncognito(container);
      _afficherBandeauDefaut(container);
      return;
    }
    // Cas 2 : hors ligne → message SEULEMENT si aucun cache OSM n'existe ; sinon le widget se monte et
    // selectPlan() arbitre plan par plan.
    if (!_isOnline()) {
      // rafraîchissement async ; si le cache existe, _refreshAnyCachePresent appelle refresh()
      _refreshAnyCachePresent();
      if (!_anyCachePresent) {
        _renderOffline(container);
        _afficherBandeauDefaut(container);
        return;
      }
    }
    // Cas 3 : aucun plan géoréférencé → message
    const plans = _listGeorefPlans();
    if (plans.length === 0) {
      _renderNoGeorefPlans(container);
      _afficherBandeauDefaut(container);
      return;
    }
    // Cas 4 : widget complet. Plan initial : celui qu'on vient de quitter s'il est géoréférencé, sinon le
    // dernier sélectionné, sinon le premier de la liste (le plus récemment ouvert).
    let initialId = (preferId && plans.find(function(p) { return p.id === preferId; }))
      ? preferId : _getLastSelectedFromLs();
    if (!initialId || !plans.find(function(p) { return p.id === initialId; })) {
      initialId = plans[0].id;
    }
    // le plan quitté devient la sélection COURANTE pour les re-montages suivants (langue, cache…)
    if (preferId && initialId === preferId) _saveLastSelected(preferId);
    _renderWidget(container, plans, initialId);
    _afficherBandeauDefaut(container);
  }

  // Annonce du défaut, tant que la clé d'opt-in est ABSENTE : « J'ai compris » écrit "1" (accord EXPLICITE,
  // bandeau disparu). Refuser = ⚙️ Configuration, écrit "0", que plus rien ne réécrase.
  // ⚠️ NOTIFICATION, pas consentement préalable : les premières tuiles sont déjà demandées quand elle
  // s'affiche (assumé, et écrit dans l'audit réseau). Aucune donnée du plan ne part, seulement des
  // coordonnées de tuiles.
  function _afficherBandeauDefaut(container) {
    if (!_estActifParDefaut() || !container) return;
    if (container.querySelector(".kta-osm-defaut-info")) return;
    const t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k) { return k; };
    const el = document.createElement("div");
    el.className = "kta-osm-defaut-info";
    el.innerHTML =
      '<span class="kta-osm-defaut-txt"></span>' +
      '<button type="button" class="kta-osm-defaut-ok"></button>';
    // 🔒 textContent, jamais innerHTML, pour ce qui vient du dictionnaire
    el.querySelector(".kta-osm-defaut-txt").textContent = t("osm_home.defautOn.corps");
    el.querySelector(".kta-osm-defaut-ok").textContent  = t("osm_home.defautOn.ok");
    el.querySelector(".kta-osm-defaut-ok").addEventListener("click", function() {
      if (window.OsmView && typeof window.OsmView.setOptedIn === "function") {
        window.OsmView.setOptedIn(true);   // l'implicite devient explicite
      }
      el.remove();
    });
    container.insertBefore(el, container.firstChild);
  }

  function refresh(preferId) { mount(preferId); }

  function selectPlan(planId) {
    if (!planId) return;
    // Le plan sélectionné devient le PRINCIPAL : s'il était AJOUTÉ, ses groupes extra sont retirés (ses
    // couches renaissent dans les groupes du module) ; l'ancien principal est REMPLACÉ à la même position.
    const _prevPrimary = _selectedPlanId;
    if (planId !== _prevPrimary && _extraLayers[planId]) _retirerPlanOsm(planId);
    _selectedPlanId = planId;
    // la liste déroulante suit la sélection (recherche, selectPlan programmatique)
    const _dd = document.getElementById("ktaOsmHomePlanSelect");
    if (_dd && _dd.value !== planId) _dd.value = planId;
    const plans = _listGeorefPlans();
    const sel = plans.find(function(p) { return p.id === planId; });
    if (!sel) return;
    _remplacerPrincipalDansPile(_stackOrder, _prevPrimary, planId);   // règle unique
    _renderMultiPanel();
    _renderPortails();   // la pile a changé : les liaisons traçables aussi
    _saveLastSelected(planId);
    _renderGeorefMarkers(sel.georef);
    // hors ligne : overlay « plan non mis en cache » si ce plan n'a pas de tuiles (sinon le SW les sert)
    _maybeShowNotCachedOverlay(planId, sel.georef);
    _loadPlanDataForPreview(planId).then(function(data) {
      // 🩸 autre plan sélectionné pendant l'extraction : pas de rendu (le nouveau fait le sien)
      if (planId !== _selectedPlanId) return;
      if (!data) return;
      // tuiles V2 EN PREMIER (sous les calques)
      if (data.tilesOverview) _renderTilesOnMiniMap(data.tilesOverview, sel.georef);
      _renderDataLayersOnMiniMap(data, sel.georef);
      // tags de la modale (no-op si fermée)
      _renderModalTags();
      _renderModalNiveaux();
      _appliquerOrdre();
      _appliquerVisibilites();
    });
  }

  function _escapeHtml(s) { return window.ktaEsc(s); }

  // ── Boot ──────────
  // 🩸 Montage après I18n.init() (async, fetch des dicos) : au DOMContentLoaded seul, les libellés
  // sortiraient en clés brutes (osm_home.toggle.*).
  function _mountWhenI18nReady() {
    var ready = (window.I18n && typeof window.I18n.init === "function") ? window.I18n.init() : Promise.resolve();
    Promise.resolve(ready).then(mount).catch(function() { mount(); });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _mountWhenI18nReady);
  } else {
    setTimeout(_mountWhenI18nReady, 100); // laisse PlanRegistry s'initialiser
  }
  // re-rendu au changement de langue
  if (window.I18n && typeof window.I18n.onChange === "function") {
    window.I18n.onChange(function() { try { mount(); } catch(e) {} });
  }

  // ── Overlay « ce plan n'est pas en cache hors ligne » ──────────
  // Plan sélectionné hors ligne sans tuiles dans le store global : message clair + action suggérée.

  async function _maybeShowNotCachedOverlay(planId, georef) {
    _clearNotCachedOverlay();
    if (_isOnline()) return; // en ligne : rendu normal
    if (!window.OsmTilesCache) return;
    const bbox = _bboxFromGeoref(georef);
    if (!bbox) return;
    try {
      // sans 2e argument : scan des zooms 10 à 18 (pas seulement 14)
      const has = await window.OsmTilesCache.hasCacheForBbox(bbox);
      // 🩸 autre plan sélectionné pendant la lecture IDB : abandon
      if (planId !== _selectedPlanId) return;
      if (has) return; // plan en cache : rendu normal
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
        "color:var(--kta-texte); display:flex; flex-direction:column; align-items:center; " +
        "justify-content:center; text-align:center; padding:20px; z-index:500; " +
        "border-radius:6px; gap:8px;";
      ov.innerHTML =
        '<div style="font-size:32px;">📴</div>' +
        '<div style="font-weight:600; color:var(--kta-accent-texte);">' + window.I18n.t("osm_home.notcached.title") + '</div>' +
        '<div style="font-size:12.5px; color:var(--kta-texte-2); max-width:280px; line-height:1.4;">' +
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

  // ── Cache OSM hors ligne (bouton 💾 du widget) ──────────
  // Délégué à OsmTilesCache. Store IDB GLOBAL (myktamap_osm_tiles, z/x/y) partagé avec la modale Vue OSM et le
  // Mode Secours : aucune duplication.

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
      // la gate hors ligne de la modale Vue OSM est prévenue
      try {
        if (window.OsmView && typeof window.OsmView.recheckOfflineCache === "function") {
          window.OsmView.recheckOfflineCache();
        }
      } catch(e) {}
      // flag globale + plan courant (retire l'overlay si le plan vient d'être mis en cache)
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
    // repli : barre injectée dans le widget
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

  window.addEventListener("kta:osmOptInChange", refresh);

  // _anyCachePresent initialisée au boot, après OsmTilesCache.init() ; cache + hors ligne → refresh() auto
  setTimeout(function() {
    if (window.OsmTilesCache && typeof window.OsmTilesCache.init === "function") {
      window.OsmTilesCache.init().then(_refreshAnyCachePresent);
    }
  }, 1500);

  window.OsmHomePreview = {
    mount:          mount,
    refresh:        refresh,
    selectPlan:     selectPlan,
    openFullScreen: openFullScreen
  };

  console.log("[OsmHomePreview] Module chargé (v1.40.16).");
})();
