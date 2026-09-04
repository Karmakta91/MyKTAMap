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
//       VIDE en HOME (aucun plan chargé). Le géoréf embarqué dans le
//       plan-config.json ne peut donc pas être lu ici.
//
//       🩸 v1.82.0 — CE MANQUE ÉTAIT ÉRIGÉ EN « LIMITATION ACCEPTABLE » :
//       l'utilisateur devait avoir saisi sa géoréf au moins une fois en mode
//       plan. C'était défendable tant que la géoréf se saisissait à la main.
//       L'import SIG produit désormais des plans calés PAR CONSTRUCTION, que
//       personne n'a de raison de ressaisir — et ils étaient précisément ceux
//       qui manquaient à cette liste (signalé par KARMA).
//       Le géoréf du plan est donc déposé dans le REGISTRE à son chargement
//       (main.js), seul endroit que le HOME lit déjà, et `_listGeorefPlans`
//       s'en sert en second recours. `osmView.js` lisait ses deux sources
//       depuis la v1.39.2 ; le widget du HOME n'avait jamais suivi.
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
  // 🌀 v1.81.0 (dette D5) — liaisons inter-plans dessinées sur le fond OSM.
  // OFF par défaut, contrairement aux 5 autres catégories : ce n'est pas un
  // calque de contenu mais un OUTIL DE DIAGNOSTIC. L'arbitrage du 01/08 a
  // enterré la traversée (le mode OSM n'a ni position courante ni « plan où tu
  // es ») ; ce qui reste utile, c'est de VOIR l'écart entre les deux bouts d'un
  // portail — deux points censés être au même endroit physique. Un écart
  // important = un géoréférencement à revoir sur l'un des deux plans.
  let _showPortails    = false;
  let _portailsLayer   = null;  // L.layerGroup, reconstruit à chaque rendu
  let _selectedPlanId = null;
  let _isFullscreen  = false; // v1.40.2 — état overlay plein-viewport
  let _fsEscapeHandler = null; // ref pour cleanup au close()
  // 🐛 v1.46.4 — Cadrage robuste de la mini-carte (cf _fitToCurrentGeoref).
  let _lastFitGeoref = null;  // georef du plan courant, pour re-fit auto au resize
  let _miniFitDone   = false; // true une fois cadré avec une taille de conteneur réelle (>0)
  // 🆕 v1.40.4 — Cache RAM : planId → { config, dataLayers, tilesOverview? }
  // Évite ré-extraction du ZIP si user re-sélectionne un plan déjà vu pendant
  // la session HOME. Cache cleared au unload page (RAM-only, pas de LS).
  const _planDataCache = {};
  let _tilesLayer     = null;   // L.layerGroup pour les tuiles plan projetées
  let _planOpacity    = 0.5;    // 🆕 v1.40.6 / v1.42.4 — opacité plan (slider bandeau). KARMA : default 50% (meilleur compromis lecture OSM + plan, cohérent avec modale plan).

  // ═══ 🗂️ v1.71.0 — MULTI-PLANS (lot 2, topo KARMA : « croisement de données
  // OSM », cas Paris 13e + 14e + galeries techniques ensemble) ═══
  // Le plan SÉLECTIONNÉ (dropdown) reste le « principal » (fitBounds, slider
  // d'opacité du bandeau). Les autres plans géoréférencés peuvent être AJOUTÉS
  // par-dessus/dessous via le panneau 🗂️ du mode OSM.
  //   _stackOrder   : planIds dans l'ordre d'affichage — index 0 = AU-DESSUS
  //                   (même ordre que le panneau). Contient AUSSI le principal.
  //   _extraLayers  : planId → { tiles, data, poi, roads, zones, struct }
  //                   (groupes Leaflet des plans NON principaux).
  //   _extraOpacity : planId → 0..1 (le principal garde _planOpacity).
  // RAM-only (pas de persistance LS) : la composition est un geste de session.
  // ⚠️ Les blob URLs des tuiles vivent dans _planDataCache et ne sont JAMAIS
  // révoquées tant que la page vit → un plan retiré puis re-ajouté est gratuit.
  let _stackOrder   = [];
  let _extraLayers  = {};
  let _extraOpacity = {};
  let _warnedMulti  = false;   // avertissement « > 3 plans » (1× par session)

  // 🗂️ v1.71.0 (retour KARMA) — visibilités PAR PLAN (tuiles + 4 catégories).
  // Visibilité effective = toggle GLOBAL du bandeau ET chip du plan. Vaut
  // aussi pour le principal (clé = planId, comme les extras).
  let _planVis = {};
  function _visDe(id) {
    if (!id) return { tiles: true, poi: true, roads: true, zones: true, struct: true };
    if (!_planVis[id]) _planVis[id] = { tiles: true, poi: true, roads: true, zones: true, struct: true };
    return _planVis[id];
  }

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
  // ═══════════════════════════════════════════════════════════
  // 🎨 v1.77.0 — OVERRIDES DE LÉGENDE PAR PLAN (bug KARMA « galerie
  // principale reste verte en OSM », puis « OSM PLAN OK mais pas OSM HOME »)
  // ═══════════════════════════════════════════════════════════
  // Pourquoi PAS ktaResolveStyle ici (contrairement à osmView) : le canon
  // applique l'état LIVE de LegendCustomization, qui au HOME est soit VIDE
  // (boot froid — le cas NORMAL : on est au HOME avant de charger un plan),
  // soit celui du DERNIER plan chargé (faux pour les autres plans de la
  // pile). La source correcte PAR PLAN : son slot SessionPersist
  // (localStorage myktamap_session_v1_<id> → payload.customLegend, auto-savé
  // ~1,5 s en mode plan) puis le customLegend du plan-config (ZIP, niveau
  // auteur). Cache RAM par planId, invalidé au mount() (retour HOME =
  // re-mount → les modifs faites en mode plan sont reprises).
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
    // Même double-lecture que legendCustomization.loadPlanState (v1.76.1) :
    // les producteurs écrivent plan.customLegend, rétro-compat racine.
    if (cfg) plan = (cfg.plan && cfg.plan.customLegend) || cfg.customLegend || null;
    const out = (sess || plan) ? { session: sess || {}, plan: plan || {} } : null;
    _legendeParPlan[planId] = out;
    return out;
  }

  // Couleur override d'un type built-in pour UN plan. quoi = "colors"|"borders".
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
    // Dernier recours : état live (couvre le plan couramment chargé même si
    // son slot n'a pas encore été écrit par l'auto-save).
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
  // 🏛️ v1.82.0 — STYLE D'UNE STRUCTURE, types CUSTOM compris.
  //
  // 🩸 Le bug corrigé ici : le rendu faisait
  //     STRUCT_STYLES_HOME[s.type] || STRUCT_STYLES_HOME["mur"]
  // Un type custom (`cust-…`) n'est évidemment pas dans cette table locale —
  // TOUTES les structures personnalisées retombaient donc sur le style « mur » :
  // même couleur pour tous les niveaux, et forme de POLYGONE même pour un front
  // de taille. Les tracés et les zones, eux, consultaient déjà la légende
  // custom : les structures étaient les seules oubliées. Signalé par KARMA sur
  // un plan importé où chaque niveau avait pourtant sa couleur.
  //
  // La forme vient de `entry.geometry` — même champ que celui lu par
  // `structures.js > _isPolylineType`. Une seule source, pas d'heuristique.
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
    // Type inconnu ET absent de la légende : on garde le repli historique.
    return Object.assign({}, STRUCT_STYLES_HOME["mur"]);
  }

  function _resolveZoneColorsHome(z, planId) {
    if (z && (z.color || z.fillColor)) {
      return {
        stroke: z.color     || z.fillColor || "#8892a4",
        fill:   z.fillColor || z.color     || "#8892a4"
      };
    }
    // 🎨 v1.77.0 — override par plan : remplissage choisi, bordure explicite
    // ou dérivée par assombrissement (même relation que le canon).
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
  // 🔁 v1.81.0 — FILET DE SECOURS, PLUS LA SOURCE. Le catalogue de référence
  // est `window._ktaBuiltinIconUrls` (map.js > TAGS_BUILTIN), désormais exposé
  // dès le chargement du script — donc lisible ici, sur un HOME où aucun plan
  // n'est encore ouvert. Cette copie ne sert que si map.js n'a pas été chargé.
  // 🩸 Elle a dérivé DEUX FOIS pendant qu'elle faisait autorité : `entree_plan`
  // (v1.41.0) et `portail` (v1.59.0) n'y sont jamais arrivés, et un point
  // portail s'affichait en Vue OSM comme un petit rond jaune au lieu de son
  // icône vortex. Le commentaire qui disait « sync ici » n'a rien empêché :
  // `scripts/check-icon-catalog.js` (pré-commit bloquant) confronte les deux.
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
    // 🔁 v1.81.0 — les 2 tags qui manquaient. Ils sont la RAISON de ce fix :
    // absents ici, un point portail / entrée de plan tombait sur le
    // circleMarker de secours en Vue OSM. Tenus alignés par
    // `scripts/check-icon-catalog.js`.
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
  // 🆕 v1.40.13 — Tracker des blob URLs créés pour les icônes POI
  let _iconBlobUrls = [];
  // 🆕 v1.40.17 — Filtre par tag : null = pas de filtre (tout affiché),
  // Set<string> non-vide = ne montre que les POI dont le tag est dans le Set
  let _homeTagFilter = null;
  // 🏔️ v1.82.0 — FILTRE PAR ÉTAGE (signalé par KARMA : « la gestion des
  // niveaux est mal gérée, le cas de Citon est un exemple flagrant »).
  // Il n'y en avait AUCUN : `level` ne servait que dans le popup d'un POI, et
  // tous les niveaux étaient dessinés les uns sur les autres. Sur un relevé à
  // sept niveaux dont un topo historique de 16 747 objets, la carte devenait
  // illisible — le niveau du dessus masquant tout le reste.
  // Même convention que le filtre par tag : `null` ou Set vide = tout afficher
  // (aucun plan mono-niveau n'est impacté).
  let _homeLevelFilter = null;

  // Un objet sans `level` est considéré au niveau 0 : c'est la convention de
  // l'app (cf. road.js), et un plan mono-niveau n'écrit pas ce champ.
  function _niveauDe(o) { return (o && typeof o.level === "number") ? o.level : 0; }
  function _passeNiveau(o) {
    if (!_homeLevelFilter || _homeLevelFilter.size === 0) return true;
    return _homeLevelFilter.has(_niveauDe(o));
  }
  // 🆕 v1.40.18 — Marker "📍 Moi" (GPS device, 1 fix ponctuel, 0 stockage)
  let _myGpsMarkerHome         = null;
  let _myGpsAccuracyCircleHome = null;

  // =========================
  // HELPERS — Opt-in & state
  // =========================
  function _isOptedIn() {
    try { return localStorage.getItem(LS_OPT_IN_KEY) === "1"; } catch(e) { return false; }
  }
  // 🧹 v1.77.0 (audit code mort) : _setOptedIn supprimé — jamais appelé,
  // l'opt-in réel s'écrit via OsmView.setOptedIn (Configuration HOME).
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
      // 🩸 v1.82.0 — DEUX SOURCES, comme `osmView.js` depuis la v1.39.2.
      // Le localStorage porte la saisie de l'utilisateur et garde donc la
      // priorité ; le registre porte le géoréf embarqué dans le plan, déposé
      // à son chargement (cf. main.js > _propagerGeorefVersKmzExport). Sans
      // ce second recours, un plan importé du SIG — calé par construction —
      // n'apparaissait pas dans cette liste.
      const g = window.KmzExport.getCalibration(p.id) || p.georef;
      if (_isValidGeoref(g)) {
        // 🏷️ v1.84.0 — `tags` transporte les ÉTIQUETTES DE PLAN du registre
        // (v1.78.0). Elles ne servaient nulle part ici : la pile ne savait
        // ajouter qu’un plan à la fois, par son nom.
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
    // 🐛 v1.72.2 (KARMA) — CAUSE RACINE de « pas d'opacité pour le 1er plan »
    // et « tags du principal invisibles » : ce chemin initial ne passe PAS par
    // selectPlan → le principal n'entrait jamais dans _stackOrder → pas de
    // ligne ◉ dans la modale (donc pas de curseur), et _renderModalTags
    // (qui agrège sur la pile) ne voyait pas ses tags.
    if (_stackOrder.indexOf(sel.id) === -1) _stackOrder.unshift(sel.id);

    // HTML structure : bandeau (dropdown + ⛶) + mini-map + footer
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
        // 🎚️ v1.71.0 (retour KARMA « un icône Filtre → modale dédiée, comme en
        // mode plan ») : toute la gestion multi-plans (priorités, opacités,
        // filtres par plan) vit dans une MODALE — zéro emprise sur la carte.
        // 📏 v1.83.0 — mesurer ici (demande KARMA). Une mesure faite en vue OSM
        // ne dépend d'AUCUN calibrage : les coordonnées sont déjà des lat/lng.
        // Elle est donc structurellement plus fiable qu'en mode plan, où une
        // échelle fausse a donné 480 m pour 1 644 réels sur un relevé importé.
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeMesureBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_mes.btnTitle")) + '">' +
          '📏' +
        '</button>' +
        // 🎯 v1.85.0 — relever les coordonnees GPS de SURFACE d un point.
        // Range a cote de la mesure : meme famille (des outils de lecture de
        // la carte), et les deux arment le meme evenement `click`.
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeCoordBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm.coords.btnTitle")) + '">' +
          '🎯' +
        '</button>' +
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeFiltersBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_mode.filters.btnTitle")) + '" ' +
                'style="background: rgba(244,197,66,0.10); border-color: rgba(244,197,66,0.4); color: #f4c542;">' +
          '≡' +
        '</button>' +
        '<button class="kta-osm-home-fullscreen" id="ktaOsmHomeFullBtn" type="button" ' +
                'title="' + _escapeHtml(window.I18n.t("osm_home.fullscreen.enterTitle")) + '">' +
          '⛶' +
        '</button>' +
      '</div>' +
      // 🔎 v1.70.0 — MODE OSM lot 1 (topo KARMA 30/07, décisions 1:local 2:b 3:a) :
      // recherche PROPRE à la vue OSM, visible UNIQUEMENT en mode OSM (fullscreen,
      // CSS .kta-osm-home-fullscreen-active). Périmètre 100 % LOCAL : les plans
      // géoréférencés de la liste + leurs POI (via _loadPlanDataForPreview, cache
      // RAM) — AUCUNE recherche d'adresse, zéro requête réseau nouvelle.
      '<div class="kta-osm-home-search" id="ktaOsmHomeSearch">' +
        '<input type="search" id="ktaOsmHomeSearchInput" ' +
               'placeholder="' + _escapeHtml(window.I18n.t("osm_mode.search.placeholder")) + '" autocomplete="off">' +
        '<div class="kta-osm-home-search-results" id="ktaOsmHomeSearchResults" style="display:none;"></div>' +
      '</div>' +

      // 🧹 v1.71.0 (retour KARMA « on a la main dans la modale ≡ ») : le
      // wrapper collapsible (opacité + toggles + chips tags) est SUPPRIMÉ du
      // widget — opacité PAR PLAN, filtres globaux et tags vivent dans la
      // modale « 🎚️ Plans & filtres ». La carte gagne la hauteur libérée.
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
    // 🔎 v1.70.0 — Recherche du mode OSM (bindings)
    _bindOsmSearch(container);
    // 🔎 v1.78.0 (retour KARMA « fait passer à la ligne, même logique que le
    // filtre de la liste de plans ») — la barre NE monte PLUS dans la ligne
    // de titre (v1.71.0 annulée par volonté de cohérence) : elle reste là où
    // le HTML la crée, en ligne PLEINE LARGEUR entre le bandeau et la carte.
    // Visibilité inchangée (mode réduit ET plein écran). Purge défensive d'un
    // exemplaire encore accroché au head par une version précédente (le head
    // est HORS container, il survit aux re-renders du widget).
    (function _purgerRechercheDuHead() {
      const head = document.querySelector("#ktaOsmHomeBox .loader-section-head");
      const ancien = head && head.querySelector("#ktaOsmHomeSearch");
      if (ancien) ancien.remove();
    })();
    // 🗂️ v1.71.0 — Panneau multi-plans : bind du sélecteur d'ajout + 1er render
    const filtresBtn = container.querySelector("#ktaOsmHomeFiltersBtn");
    if (filtresBtn) {
      filtresBtn.addEventListener("click", _ouvrirModalFiltresOsm);
    }
    // 📏 v1.83.0 — bascule de l'outil de mesure. Le module se démonte de
    // lui-même au second clic (`activer` appelle `desactiver` s'il est actif).
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

    // 🧹 v1.71.0 : binds du wrapper collapsible retirés avec lui (🔼, slider
    // d'opacité bandeau, 5 checkboxes) — équivalents dans la modale ≡.
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
      _retirerToutHiRes(); // 🔍 v1.77.0 — URLs hi-res éphémères, à révoquer ici
      try { _mapInstance.remove(); } catch(e) {}
      _mapInstance = null;
      _panesParPlan = {};   // v1.72.2 : les panes appartiennent à la carte détruite
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
    // 🔍 v1.77.0 — tuiles hi-res au zoom (débounce, cf bloc TUILES HI-RES)
    _mapInstance.on("zoomend moveend", _onCarteBougeHiRes);
    // 📏 v1.83.0 — la largeur des fronts suit le zoom, comme en mode plan.
    _mapInstance.on("zoomend", _majLargeurFrontsHome);
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
      if (!_mapInstance) return;
      // 🐛 v1.46.4 — tant que le 1er cadrage n'a pas réussi (conteneur enfin
      // dimensionné), on ré-essaie le fit ; une fois fait, simple invalidateSize
      // (pas de re-cadrage → ne clobbe pas un déplacement utilisateur).
      if (!_miniFitDone) { _fitToCurrentGeoref(); }
      else { try { _mapInstance.invalidateSize(); } catch(e) {} }
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
        _majLargeurFrontsHome();
        // 🎚️ v1.71.0 : les tags vivent dans la modale ≡ (guard si fermée)
        _renderModalTags();
        _renderModalNiveaux();
        _appliquerOrdre();   // 🗂️ v1.71.0 — renormalise les zIndex de la pile
        _appliquerVisibilites();
      });
    }
  }

  function _renderGeorefMarkers(georef) {
    if (!_mapInstance || !_isValidGeoref(georef)) return;
    if (_markerLayer) _markerLayer.clearLayers();

    // 🆕 v1.40.24 — KARMA : « en OSM on a a l'affichage le calibrage point A
    // point B en pointillé, je ne veux pas le voir a l'écran ». On supprime
    // les 2 circle markers visuels + la polyline pointillée jaune qui
    // chargeaient inutilement la mini-carte (les vraies data POI/Roads/Zones/
    // Structures + tuiles V2 sont déjà rendues depuis v1.40.4-6). Le
    // _markerLayer existe encore (= layerGroup vide) pour ne pas casser
    // d'autres call-sites éventuels.

    // 🐛 v1.46.4 — nouveau plan (ou 1er rendu) → mémorise le georef + force un
    // re-cadrage propre (invalidateSize avant fitBounds via _fitToCurrentGeoref).
    _lastFitGeoref = georef;
    _miniFitDone   = false;
    _fitToCurrentGeoref();
  }

  // 🐛 v1.46.4 — Cadrage robuste de la mini-carte (fix « les tuiles d'un plan ne
  // se chargent qu'après avoir ouvert le fullscreen »). Cause racine : le
  // fitBounds s'exécutait JUSTE après L.map(), avant que le conteneur
  // #ktaOsmHomeMap ait sa taille (layout CSS pas stabilisé au boot) → Leaflet
  // calculait zoom/center avec une taille 0 → tuiles jamais demandées pour la
  // bonne zone. Les invalidateSize (raf/timeouts/ResizeObserver) arrivaient trop
  // tard ET ne ré-exécutaient pas fitBounds → la vue restait fausse jusqu'à ce
  // qu'un reflow (fullscreen) force enfin un recalcul.
  // Fix : invalidateSize PUIS fitBounds, et UNIQUEMENT si le conteneur a une
  // taille réelle (>0). Sinon on n'a rien cadré (_miniFitDone reste false) → les
  // timeouts + ResizeObserver de _initMiniMap ré-essaient jusqu'à réussite. Une
  // fois cadré, on ne re-fit plus (ne pas clobber un pan/zoom utilisateur).
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
      // 🔍 v1.77.0 — le handle JSZip est GARDÉ dans le cache pour les tuiles
      // hi-res au zoom : loadAsync est lazy (central directory seul, le
      // File/Blob sous-jacent est une référence) → coût RAM négligeable,
      // et on évite de re-parser le ZIP à chaque changement de niveau.
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
    // 2. Catalogue built-in (fallback non-overridé). SOURCE UNIQUE =
    //    `window._ktaBuiltinIconUrls` (map.js) ; la copie locale ne prend le
    //    relais que si map.js n'est pas là. Voir le bandeau de TAGS_BUILTIN_HOME.
    const CATALOGUE = window._ktaBuiltinIconUrls || TAGS_BUILTIN_HOME;
    for (const tag in CATALOGUE) {
      if (iconUrls[tag]) continue; // déjà overridé par config.icons
      await _resolveIcon(tag, CATALOGUE[tag]);
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
      t = window.KmzExport.buildTransformCalib(georef);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
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
  // =========================
  // 📝 v1.81.0 — TRAVAIL DE SESSION EN VUE OSM
  // =========================
  // KARMA, 03/09 : « je ne vois pas mes points en OSM HOME » — ils étaient
  // créés EN SESSION. La Vue OSM ne lisait que le ZIP (plan-config +
  // dataLayers), donc tout le travail non exporté restait invisible. Le pire :
  // la recherche cross-plan, elle, les trouvait déjà (`collectPointsForPlan`
  // lit la session). Une carte qui n'affiche pas ce que la recherche trouve
  // est indéfendable côté utilisateur.
  //
  // 🩸 POURQUOI LA LECTURE EST FAITE AU RENDU ET NON À L'EXTRACTION :
  // `_planDataCache` n'est JAMAIS invalidé (il vit toute la durée de la page).
  // Ranger la session dedans la figerait au premier affichage — on édite en
  // mode plan, on revient au HOME, on voit l'état d'avant. Ici c'est un
  // `getItem` + un `JSON.parse` par plan affiché : négligeable devant
  // l'extraction ZIP, et toujours frais.
  let _showSession = true;   // ON par défaut : c'est le travail en cours de
                             // l'utilisateur, le masquer par défaut le ferait
                             // chercher exactement comme aujourd'hui.

  // Calque VIRTUEL bâti sur le slot de session du plan. `null` si rien.
  // Le payload de SessionPersist porte déjà les 4 familles que la Vue OSM
  // sait rendre, aux mêmes noms de champs — aucune conversion.
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

  // LA liste de calques d'un plan = ceux du ZIP + celui de la session.
  // Les 3 consommateurs de `dataLayers` passent par ici : le rendu, les chips
  // de filtre par tag et l'index de recherche. En oublier un donnerait un
  // point affiché dont le tag manque aux chips — donc masqué dès qu'un filtre
  // est posé, sans que rien ne l'explique.
  function _tousCalques(data, planId) {
    const base = (data && Array.isArray(data.dataLayers)) ? data.dataLayers : [];
    const s = _calqueSession(planId);
    return s ? base.concat([s]) : base;
  }

  // 📏 v1.83.0 — MÊME LOI QUE LE MODE PLAN ET QUE LA MODALE OSM.
  //
  // Le widget HOME empile PLUSIEURS plans et s'ouvre très dézoomé : c'est
  // l'endroit où des traits de largeur fixe fusionnent le plus vite. Sa table
  // de styles « light » posait 4 px pour un front — réglé à la main, donc juste
  // à un seul zoom.
  //
  // La loi est formulée en pixels par mètre (structures.js) : la Vue OSM n'a
  // pas d'échelle de plan, mais elle sait sa résolution Web Mercator, laquelle
  // dépend de la LATITUDE autant que du zoom.
  //
  // On mute `options.weight` en place — le renderer canvas le relit à chaque
  // frame — puis une repeinture NON CLIPPÉE. Aucun `setStyle` : le widget peut
  // porter plusieurs relevés de plusieurs milliers d'objets.
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
        // Les surfaces gardent leur trait : un pilier se lit à son
        // remplissage, pas à l'épaisseur de son contour.
        if (!lay || !lay.options || lay.options.fill === true) return;
        lay.options.weight = largeur;
      });
    };
    // Le plan principal ET chaque plan empilé : le widget est multi-plans,
    // n'en traiter qu'un laisserait les autres en aplat.
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
    // 🗂️ v1.71.0 — PARAMÉTRÉ : sans `cible`, rend dans les groupes MODULE du
    // plan principal (comportement historique, clear inclus). Avec `cible`
    // ({data, poi, roads, zones, struct}), rend dans les groupes d'un plan
    // AJOUTÉ de la pile multi-plans — les groupes module ne sont pas touchés.
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
    // v1.72.2 — pane du plan : markers via `pane`, chemins SVG via `renderer`
    // dédié au pane (un L.Path ignore `pane`, seul son renderer compte).
    const planIdFx = planIdPourPane || _selectedPlanId; // 🎨 v1.77.0 — overrides par plan
    const paneCtx = _panePour(planIdFx);
    const optsPane = paneCtx ? { pane: paneCtx.nom } : {};
    const optsRendu = paneCtx ? { renderer: paneCtx.renderer } : {};
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

    for (const layer of _tousCalques(data, planIdPourPane || _selectedPlanId)) {
      // 🐛 v1.73.1 (KARMA « un datalayer généré invisible n'est pas affichable
      // en Vue OSM ») : on ne skippe PLUS les calques `visible: false` du
      // plan-config. Cette visibilité est un DÉFAUT D'AFFICHAGE du mode plan
      // (retoggables via ⊞ Calques) — or la Vue OSM n'a aucun toggle par
      // calque : les sauter les rendait INACCESSIBLES, tracés compris. Ici
      // l'affichage est gouverné par les filtres existants (chips catégories
      // globales + par plan, filtre tags). `layer.visible` reste parsé si un
      // jour on veut des toggles par calque dans la modale ≡.

      // POI → poiL (v1.40.13 icônes natives + 🆕 v1.40.17 popup + filtre tag)
      const isMultiLevel = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel);
      for (const p of layer.points) {
        if (typeof p.x !== "number" || typeof p.y !== "number") continue;
        const ll = proj.planToLatLng(p.x, p.y);
        if (!ll) continue;
        const tag  = (Array.isArray(p.tags) && p.tags[0]) || "default";
        // 🆕 v1.40.17 — Filtre par tag (skip si tag pas dans le Set actif)
        if (!_passeNiveau(p)) continue;
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
            // 📝 v1.81.0 — dire d'où vient le point. La Vue OSM montre l'état
            // ENREGISTRÉ des plans ; y mêler du travail non exporté sans le
            // nommer créerait une confusion pire que son absence.
            (layer.estSession
              ? '<br><span style="color:#f4c542; font-size:10.5px;">📝 ' +
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
        marker.addTo(poiL);
        nPoi++;
      }

      // Roads → roadsL (🆕 v1.40.37 : cascade couleur complète via
      // _resolveRoadColorHome — explicit r.color > built-in type > custom
      // legend > fallback gris. KARMA : « la couleur des routes... doit
      // persister ». Inclut les types custom (cust-*) définis dans
      // LegendCustomization, à l'identique de la map principale.)
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

      // Zones → zonesL (🆕 v1.40.37 : idem cascade couleur via
      // _resolveZoneColorsHome — couleurs natives ZONE_STYLES respectées
      // et custom legend persistée.)
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

      // Structures → structL (adaptatif polyline/polygon)
      for (const s of layer.structures) {
        if (!_passeNiveau(s)) continue;
        if (!Array.isArray(s.points)) continue;
        const style = _styleStructHome(s, planIdFx);
        // 🎨 v1.77.0 — couleurs overridées PAR PLAN par-dessus la variante
        // HOME locale (qui ne garde que weight/fillOpacity allégés). Fronts
        // (polyline) : le trait ; piliers/murs : remplissage + bordure.
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
    // Add sub-layers selon les toggles utilisateur
    if (_showPoi)        dataL.addLayer(poiL);
    if (_showRoads)      dataL.addLayer(roadsL);
    if (_showZones)      dataL.addLayer(zonesL);
    if (_showStructures) dataL.addLayer(structL);
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
  function _montrer(parent, layer, on) {
    if (!parent || !layer) return;
    if (on) { if (!parent.hasLayer(layer)) parent.addLayer(layer); }
    else    { if  (parent.hasLayer(layer)) parent.removeLayer(layer); }
  }

  // 🗂️ v1.71.0 (retour KARMA « je veux qu'on puisse filtrer comme on fait
  // déjà ») — APPLICATEUR UNIQUE : visibilité effective d'une couche =
  // toggle GLOBAL (bandeau) ET chip PAR PLAN (panneau 🗂️). Appelé par les
  // toggles globaux, les chips, et après chaque rendu.
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
    // 🔍 v1.77.0 — les groupes hi-res suivent le même régime que les tuiles.
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
  // 📝 v1.81.0 — bascule du travail de session. Un `_reRenderDataTous()` complet
  // est nécessaire : le calque session traverse le rendu, les chips de tag et
  // l'index de recherche.
  function _toggleSession(visible) {
    _showSession = !!visible;
    _reRenderDataTous();
    _renderModalTags();   // les tags de session entrent ou sortent des chips
    _renderModalNiveaux();
  }

  // =========================
  // 🌀 LIAISONS INTER-PLANS SUR OSM (dette D5, v1.81.0)
  // =========================
  // À quoi ça sert : les deux bouts d'un portail désignent LE MÊME endroit
  // physique, vu depuis deux plans. Projetés sur OSM via le géoréf de leur plan
  // respectif, ils devraient donc se superposer. L'écart qui apparaît est une
  // mesure directe de la qualité du calage — et c'est le seul endroit de l'app
  // où on peut le VOIR, puisqu'il faut deux géoréfs pour le révéler.
  //
  // Contrainte non négociable : les DEUX plans doivent être affichés ET
  // géoréférencés. Sans le géoréf du plan d'en face, un des bouts n'est pas
  // plaçable — on saute la liaison au lieu d'inventer une position.
  //
  // Pas de seuil de couleur volontairement : 20 m d'écart, c'est énorme sur une
  // petite carrière et négligeable sur un réseau de 5 km. On affiche le chiffre,
  // l'utilisateur juge avec son échelle en tête.
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
      if (!pa || !pb) return;   // au moins un des deux plans n'est pas affiché/géoréf
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

      // Les deux bouts, pour voir LEQUEL est décalé (et pas seulement de combien).
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

  // 📐 v1.81.0 (D5) — CONTRÔLE QUALITÉ DU CALAGE (arbitrage KARMA du 03/09)
  //
  // Pourquoi une LISTE et pas seulement le calque : deux portails bien calés
  // se superposent, donc la polyligne est de longueur nulle et le calque ne
  // montre RIEN dans le cas nominal. Un outil dont le cas nominal est
  // invisible se lit mal — l'utilisateur ne sait pas s'il fonctionne. La
  // liste, elle, répond directement à « mes géoréfs sont-ils bons ? » : elle
  // affiche le compte mesuré et classe du PIRE au meilleur, donc ce qui
  // mérite un recalage est en première ligne.
  //
  // L'écart vient de `InterPlanLinks.ecartCalage` — fonction UNIQUE, jamais
  // recopiée ici (leçon du bug des icônes portail du 02/09).
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

    // Mesurables = les deux plans AFFICHÉS dans la pile et géoréférencés.
    // On ne liste pas les autres : un écart qu'on ne peut pas montrer sur la
    // carte devant soi n'aide personne — il se lit dans 🌀 Mes liaisons.
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

    // Clic → on cadre les DEUX bouts. `fitBounds` plutôt qu'un centrage sur le
    // milieu : avec un gros écart, se poser au milieu laisse les deux bouts
    // hors champ — exactement les deux choses qu'on voulait voir.
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
  // Niveaux réellement présents dans un plan, toutes familles confondues.
  // Sert à ne proposer que des chips qui montrent quelque chose : un niveau
  // vide dans la liste ferait croire à un bug d'affichage quand on le coche.
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

  // Rendu de la ligne de chips tag (filtre par tag) dans le bandeau.
  // Click → toggle in/out du Set _homeTagFilter + re-render data layers.
  // 🧹 v1.71.0 : _renderTagChips (chips tags du widget) SUPPRIMÉE — le
  // conteneur #ktaOsmHomeTagChips n'existe plus, les tags vivent dans la
  // modale ≡ (_renderModalTags, agrégés sur toute la pile).

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
    // ⚠️ v1.77.0 (réparation du fix code-mort du 09/08) — PAS de révocation
    // ici : les blob URLs baseline vivent avec _planDataCache (design v1.71.0,
    // « un plan retiré puis re-ajouté est gratuit »). La révocation ajoutée
    // par l'audit cassait le multi-plans : charger un plan B révoquait les
    // URLs du plan A encore AFFICHÉ, et le cache de A gardait des URLs mortes
    // pour toute la session. Le cache borne déjà l'extraction à 1×/plan — il
    // n'y avait pas de fuite. Les tuiles HI-RES (zoom), elles, sont éphémères
    // et révoquées à chaque swap (cf bloc TUILES HI-RES plus bas).
    // 🫥 v1.62.0 : extension d'après le manifest (webp/png = alpha, jpg = legacy)
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

  // Render des tuiles V2 sur la mini-carte via L.imageOverlay.rotated.
  // Pattern identique à osmView.js > _renderTilesV2OnOsm — convention CRS.Simple
  // pour le flip Y (k=1 = tuile la plus basse = sud).
  // 🗂️ v1.71.0 — Cœur PARAMÉTRÉ (multi-plans) : rend les tuiles d'UN plan dans
  // le groupe fourni, avec SON opacité et SON zIndex de pile. Le wrapper
  // historique (plan principal) et les plans ajoutés passent tous par ici.
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
        const overlay = L.imageOverlay.rotated(t.url, tl, tr, bl, Object.assign({
          interactive: false,
          opacity: opacite,
          zIndex: zIndex
        }, paneNom ? { pane: paneNom } : {}));
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

  // Met à jour l'opacité des tuiles plan (slider bandeau).
  // N'affecte pas les data layers (qui ont leur propre fillOpacity native).
  function _setPlanOpacity(opacity) {
    _planOpacity = Math.max(0, Math.min(1, opacity));
    _appliquerOpaciteHiRes(_selectedPlanId, _planOpacity); // 🔍 v1.77.0
    if (!_tilesLayer) return;
    _tilesLayer.eachLayer(function(l) {
      try {
        if (typeof l.setOpacity === "function") l.setOpacity(_planOpacity);
        else if (l._image) l._image.style.opacity = String(_planOpacity);
      } catch(e) {}
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 🔍 v1.77.0 — TUILES HI-RES AU ZOOM (bug KARMA « un plan X est très flou
  // si je zoome dans le widget HOME, alors qu'il est lisible en OSM plan »)
  // ═══════════════════════════════════════════════════════════
  // Le baseline (≤80 tuiles, _chooseTileLevelForHome) reste le socle affiché
  // en permanence — sur un gros plan c'est un niveau très réduit, d'où le
  // flou. Au zoomend/moveend (débounce 300 ms) : pour chaque plan V2 visible,
  // on calcule le niveau adapté à la taille ÉCRAN du plan, on extrait du ZIP
  // (gardé lazy dans _planDataCache) les seules tuiles de ce niveau qui
  // intersectent le viewport (budget 60/plan, sinon on redescend d'un cran),
  // rendues AU-DESSUS du baseline (même pane, zIndex+1 → pas de trou pendant
  // le chargement). Au pan à niveau constant : delta (tuiles communes
  // réutilisées, sorties révoquées). Retour à un zoom où le baseline suffit
  // → groupe retiré + URLs révoquées. Miroir frugal de osmView.js > zoomend
  // → _renderLevel, qui explique l'écart de netteté constaté par KARMA.
  const HIRES_BUDGET_TUILES = 60;   // par plan — ~15 Mo décodés à 512px
  const HIRES_DEBOUNCE_MS   = 300;
  let _hiRes      = {};    // planId → { z, tuiles: {"col_k": {url, overlay}}, groupe }
  let _hiResTimer = null;
  let _hiResBusy  = false; // extraction async en cours → on re-planifie au lieu d'empiler
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

  // Tuiles du niveau z qui intersectent la vue (bounds GPS avec marge).
  // Même convention que _renderTilesInto : k=1 = tuile la plus basse (sud),
  // tuiles de bord PLEINES (padding au-dessus du plan) → pas de clamp.
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
      // Plans sortis de la pile depuis le dernier passage → purge
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

    // Taille ÉCRAN du plan : distance px entre ses coins bas projetés.
    const bg = proj.planToLatLng(0, planH), bd = proj.planToLatLng(planW, planH);
    if (!bg || !bd) { _retirerHiRes(planId); return; }
    const pG = _mapInstance.latLngToContainerPoint(bg);
    const pD = _mapInstance.latLngToContainerPoint(bd);
    const ecranW = Math.hypot(pD.x - pG.x, pD.y - pG.y);

    // Baseline déjà net (≥ 1 px de tuile par px écran) → pas de hi-res.
    if (planW / Math.pow(2, -tv.z) >= ecranW) { _retirerHiRes(planId); return; }

    // Niveau idéal = le plus GROSSIER qui couvre la largeur écran.
    let zCible = tiling.maxNativeZoom;
    for (let z = tv.z + 1; z <= tiling.maxNativeZoom; z++) {
      if (planW / Math.pow(2, -z) >= ecranW) { zCible = z; break; }
    }

    // Budget : si trop de tuiles dans la vue, on redescend d'un cran.
    const vue = _mapInstance.getBounds().pad(0.15);
    let choix = null;
    for (let z = zCible; z > tv.z; z--) {
      const scale = Math.pow(2, -z);
      const t = _tuilesVisiblesPour(z, scale, planW, planH, tileSize, proj, vue);
      if (t.length === 0) break;                      // plan hors viewport
      if (t.length <= HIRES_BUDGET_TUILES) { choix = { z: z, scale: scale, tuiles: t }; break; }
    }
    if (!choix) { _retirerHiRes(planId); return; }

    // Delta vs état courant : même niveau → réutiliser les tuiles communes.
    const h        = _hiRes[planId];
    const memeZ    = !!(h && h.z === choix.z);
    if (h && !memeZ) _retirerHiRes(planId);           // swap de niveau → purge
    const ancien   = memeZ ? h.tuiles : {};
    const groupe   = (memeZ && h.groupe) ? h.groupe : L.layerGroup();
    if (!_mapInstance.hasLayer(groupe)) groupe.addTo(_mapInstance);

    const pn   = _panePour(planId);
    const op   = _opaciteDe(planId);
    const zIdx = _zIndexPour(planId) + 1;
    const ext  = (typeof window.ktaTileExt === "function") ? window.ktaTileExt(tiling) : "jpg";
    const nouvelles = {};
    // Garde anti-race : si la carte est détruite/recréée pendant un await
    // (refresh widget), on abandonne SANS poser l'état — sinon on recréerait
    // une entrée _hiRes orpheline avec des URLs jamais révoquées.
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
          { interactive: false, opacity: op, zIndex: zIdx }, pn ? { pane: pn.nom } : {}));
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
    // Tuiles sorties du viewport (même niveau) : overlay retiré + URL révoquée.
    Object.keys(ancien).forEach(function(cle) {
      try { groupe.removeLayer(ancien[cle].overlay); } catch(e) {}
      try { URL.revokeObjectURL(ancien[cle].url); } catch(e) {}
    });
    _hiRes[planId] = { z: choix.z, tuiles: nouvelles, groupe: groupe };
    console.log("[OsmHomePreview] Hi-res " + planId + " : z=" + choix.z +
      ", " + Object.keys(nouvelles).length + " tuile(s) viewport");
  }

  function _appliquerOpaciteHiRes(planId, op) {
    const h = _hiRes[planId];
    if (!h || !h.groupe) return;
    h.groupe.eachLayer(function(l) {
      try {
        if (typeof l.setOpacity === "function") l.setOpacity(op);
        else if (l._image) l._image.style.opacity = String(op);
      } catch(e) {}
    });
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
  // ═══════════════════════════════════════════════════════════
  // 🗂️ v1.71.0 — PILE MULTI-PLANS (lot 2 : croisement de données OSM)
  // ═══════════════════════════════════════════════════════════
  // Cas d'usage KARMA : Paris 13e + 14e + galeries techniques de tout Paris
  // sur la même carte, avec ordre d'affichage et opacité PAR PLAN.
  // Le plan sélectionné (dropdown) reste le « principal » ; les autres sont
  // ajoutés via le panneau 🗂️ (fullscreen uniquement, comme la recherche).

  // 🐛 v1.72.2 (KARMA « une image du plan A cache les tracés du plan B ») —
  // les zIndex d'imageOverlay n'ordonnent QUE les images : tous les tracés
  // SVG partagent un renderer unique dans l'overlayPane, hors de portée.
  // Fix structurel : UN PANE LEAFLET PAR PLAN (zIndex posé sur le pane),
  // et TOUT le contenu du plan (tuiles + tracés + POI) rendu dedans →
  // l'ordre de pile devient global, vecteurs compris. Dans un pane, le SVG
  // est ajouté APRÈS les tuiles → les tracés d'un plan restent au-dessus de
  // sa propre image.
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

  // zIndex de pile : index 0 = AU-DESSUS. Base 200 (au-dessus du fond OSM),
  // pas de 5 par niveau.
  function _zIndexPour(planId) {
    const i = _stackOrder.indexOf(planId);
    if (i === -1) return 200;
    return 200 + (_stackOrder.length - 1 - i) * 5;
  }

  function _appliquerOrdre() {
    _stackOrder.forEach(function(id) {
      // v1.72.2 : l'ordre vit sur le PANE du plan (images ET vecteurs).
      const e = _panesParPlan[id];
      if (e && e.pane) e.pane.style.zIndex = String(_zIndexPour(id));
    });
  }

  function _avertirMultiSiBesoin() {
    // Décision KARMA 2:b — pas de cap dur : avertissement quand la pile
    // DÉPASSE 3 plans, 1× par session.
    if (_warnedMulti || _stackOrder.length <= 3) return;
    _warnedMulti = true;
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
      window.OOMGuard.showToast(
        window.I18n.t("osm_mode.warn.multi", { n: _stackOrder.length }), "warn");
    }
  }

  // 🗂️ v1.84.0 — L'AJOUT D'UN PLAN EST COUPÉ EN DEUX : le MONTAGE (synchrone,
  // bon marché : on pousse dans la pile et on crée les layerGroups) et le
  // CHARGEMENT DE SA DONNÉE (asynchrone, cher : extraction du ZIP).
  //
  // 🩸 POURQUOI : l'ajout par étiquette peut en demander vingt d'un coup.
  // Appeler vingt fois `_ajouterPlanOsm` déclencherait vingt re-rendus du
  // panneau ET vingt extractions de ZIP EN PARALLÈLE — exactement la charge
  // que `_avertirMultiSiBesoin` existe pour signaler, mais concentrée sur une
  // seule frame. Découpé, un lot monte tout d'un coup, rend UNE fois, puis
  // charge les données EN SÉRIE : la carte se remplit progressivement au lieu
  // de figer l'onglet.
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
      // Garde anti-race : retiré (ou devenu principal) pendant l'extraction ?
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
      _renderModalTags();   // 🐛 v1.72.2 : les tags du plan ajouté arrivent DÈS son extraction
      _renderModalNiveaux();
    });
  }

  function _ajouterPlanOsm(planId) {
    const m = _monterPlanOsm(planId);
    if (!m) return;
    _avertirMultiSiBesoin();
    _renderMultiPanel();
    _renderPortails();   // 🌀 D5 : la pile a changé → les liaisons traçables aussi
    _chargerDataPlanOsm(planId, m.p, m.g);
  }

  // Démontage SANS re-rendu : le lot (retrait par étiquette) en enlève
  // plusieurs et ne veut rendre qu'une fois. `_retirerPlanOsm` reste le
  // chemin unitaire et garde son comportement d'origine.
  function _demonterPlanOsm(planId) {
    const g = _extraLayers[planId];
    if (!g) return false;
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
    _retirerHiRes(planId); // 🔍 v1.77.0 — les hi-res, elles, sont éphémères
    // Pas de revoke des blob URLs BASELINE : elles vivent dans _planDataCache
    // (re-ajout gratuit) et peuvent servir au plan principal.
    return true;
  }

  function _retirerPlanOsm(planId) {
    if (!_demonterPlanOsm(planId)) return;
    _appliquerOrdre();
    _renderMultiPanel();
    _renderPortails();   // 🌀 D5 : la pile a changé → les liaisons traçables aussi
    _renderModalTags();   // 🐛 v1.72.2 : retirer un plan retire aussi ses tags
    _renderModalNiveaux();
  }

  // ═══════════════════════════════════════════════════════════
  // 🏷️ v1.84.0 — AJOUTER LA PILE PAR ÉTIQUETTE DE PLAN
  // ═══════════════════════════════════════════════════════════
  // LE BESOIN (KARMA, 04/09) : un atlas départemental découpé produit des
  // DIZAINES de plans du même secteur — « je veux voir d'un coup tous les
  // plans étiquetés GIRONDE ». Les deux moitiés existaient depuis longtemps
  // sans se parler : `plan.tags` (registre, v1.78.0, saisi depuis la
  // bibliothèque) et la pile multi-plans (v1.71.0), dont le seul chemin
  // d'ajout était un `<select>` UN PLAN À LA FOIS.
  //
  // ⚠️ NE PAS CONFONDRE avec la section « 🏷️ Filtrer par tag » juste au-dessus :
  // celle-là filtre les POI *à l'intérieur* des plans affichés. Ici on choisit
  // QUELS PLANS sont affichés. Deux notions homonymes dans la même modale —
  // d'où un intitulé qui dit explicitement « étiquette de plan ».
  //
  // 🔠 Regroupement INSENSIBLE À LA CASSE : `PlanRegistry.setTags` dédoublonne
  // par plan, pas entre plans. « Gironde » sur l'un et « GIRONDE » sur l'autre
  // afficherait deux chips pour ce que l'utilisateur tient pour une seule
  // étiquette — et chacune ne montrerait que la moitié de ses plans.
  function _etiquettesDesPlans() {
    const parTag = {};   // clé minuscule → { libelle, ids: [] }
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
    // Une étiquette qui ne porte QU'UN plan n'apprend rien ici : le sélecteur
    // juste en dessous fait déjà ce travail, et vingt chips à un plan
    // noieraient les deux qui servent.
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

  // Un clic fait l'un OU l'autre selon ce qui manque : tant qu'un plan de
  // l'étiquette n'est pas là, le chip AJOUTE ce qui manque ; quand ils y sont
  // tous, il les RETIRE. Sans le retrait groupé, afficher vingt plans se
  // défait en vingt clics sur des ✕ — ce n'est pas du confort, c'est ce qui
  // rend la fonction utilisable deux fois de suite.
  function _basculerEtiquettePlans(cle) {
    const e = _etiquettesDesPlans()[cle];
    if (!e) return;
    const absents = e.ids.filter(function (id) { return _stackOrder.indexOf(id) < 0; });
    if (absents.length) _ajouterPlansOsm(absents, e.libelle);
    else _retirerPlansOsm(e.ids);
  }

  function _ajouterPlansOsm(ids, libelle) {
    // ⚠️ ON DEMANDE AVANT, avec le compte. La pile n'a pas de cap dur
    // (arbitrage KARMA 2:b) et `_avertirMultiSiBesoin` prévient APRÈS coup —
    // sur un lot, « après coup » veut dire une fois les vingt plans montés,
    // donc trop tard pour renoncer. Le seuil de la confirmation est CELUI DE
    // L'AVERTISSEMENT EXISTANT (3), pas un nombre inventé ici.
    const total = _stackOrder.length + ids.length;
    if (ids.length >= 2 && total > 3) {
      const ok = window.confirm(window.I18n.t("osm_mode.multi.tagConfirm",
        { n: ids.length, tag: libelle || "", total: total }));
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
    // EN SÉRIE, jamais en parallèle : chaque chargement extrait un ZIP.
    // Vingt extractions lancées ensemble figent l'onglet ; enchaînées, la
    // carte se remplit plan par plan et reste manipulable.
    montes.reduce(function (chaine, m) {
      return chaine.then(function () { return _chargerDataPlanOsm(m.id, m.p, m.g); })
                   .catch(function (e) {
                     console.warn("[OsmHome] chargement du plan " + m.id + " échoué :", e);
                   });
    }, Promise.resolve());
  }

  function _retirerPlansOsm(ids) {
    // Le plan PRINCIPAL ne se retire pas : il n'a même pas de ✕ dans le
    // panneau, et `_renderMultiPanel` le remettrait dans la pile au rendu
    // suivant (ceinture v1.72.2). Le chip repasse alors à « 1/N », ce qui est
    // la vérité : il reste ce plan-là.
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
    _appliquerOpaciteHiRes(planId, _extraOpacity[planId]); // 🔍 v1.77.0
    const g = _extraLayers[planId];
    if (!g) return;
    g.tiles.eachLayer(function(l) {
      try {
        if (typeof l.setOpacity === "function") l.setOpacity(_extraOpacity[planId]);
        else if (l._image) l._image.style.opacity = String(_extraOpacity[planId]);
      } catch(e) {}
    });
  }

  // 🎚️ v1.71.0 (retour KARMA) — MODALE « Plans & filtres OSM » : remplace le
  // panneau flottant (qui empiétait sur la carte). Même pattern que la modale
  // ≡ Filtres du mode plan. Contenu vivant : _renderMultiPanel() cible les ids
  // à l'intérieur de la modale (garde d'existence déjà en place).
  const OSM_FILTERS_MODAL_ID = "kta-osm-filters-modal";

  function _fermerModalFiltresOsm() {
    const m = document.getElementById(OSM_FILTERS_MODAL_ID);
    if (m) m.remove();
    document.removeEventListener("keydown", _escFiltresOsm, true);
  }
  function _escFiltresOsm(e) {
    if (e.key === "Escape" || e.key === "Esc") {
      // capture + stopPropagation : ne pas laisser l'Escape refermer AUSSI le
      // mode OSM (handler fullscreen en phase bulle sur document).
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
    overlay.style.zIndex = "100001";   // au-dessus du widget fullscreen
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
          // 📐 v1.81.0 (D5) — bloc « qualité du calage », rempli seulement
          // quand le chip 🌀 est actif (cf. _renderPortailsQualite).
          '<div class="kta-osm-qualite" id="ktaOsmPortailsQualite"></div>' +
          // 🏔️ v1.82.0 — chips d'ÉTAGE. Vide et masqué sur un plan
          // mono-niveau : afficher « niveau 0 » tout seul n'apprendrait rien.
          '<div class="kta-osm-filters-sect" id="ktaOsmFiltersNivSect" style="display:none;">' +
            _escapeHtml(window.I18n.t("osm_home.niveaux.titre")) + '</div>' +
          '<div class="kta-osm-home-tagchips" id="ktaOsmFiltersNiveaux"></div>' +
          '<div class="kta-osm-filters-sect">' + _escapeHtml(window.I18n.t("osm_mode.filters.tags")) + '</div>' +
          '<div class="kta-osm-home-tagchips kta-osm-filters-tags" id="ktaOsmFiltersTags"></div>' +
          '<div class="kta-osm-filters-sect">' + _escapeHtml(window.I18n.t("osm_mode.filters.plans")) + '</div>' +
          // 🏷️ v1.84.0 — ajout par ÉTIQUETTE DE PLAN. Masqué tant qu’aucune
          // étiquette ne porte au moins deux plans (cf. `_renderMultiTags`).
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
        if (multiAdd.value) { _ajouterPlanOsm(multiAdd.value); multiAdd.value = ""; }
      });
    }
    _renderModalGlobaux();
    _renderModalTags();
    _renderModalNiveaux();
    _renderMultiPanel();
  }

  // Catalogue partagé des 5 catégories (chips globaux ET par plan).
  const _CATS = [
    ["tiles",  "🖼️", "osm_home.toggle.plan.label"],
    ["poi",    "📍", "osm_home.toggle.poi.label"],
    ["roads",  "🛣️", "osm_home.toggle.roads.label"],
    ["zones",  "🌐", "osm_home.toggle.zones.label"],
    ["struct", "🏛️", "osm_home.toggle.struct.label"]
  ];

  // 🎚️ v1.71.0 (retour KARMA) — chips GLOBAUX de la modale (ex-checkboxes du
  // bandeau, supprimées avec le wrapper collapsible).
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
    // 🌀 v1.81.0 (D5) — chip PORTAILS ajouté ICI et non dans `_CATS` : ce
    // catalogue alimente aussi les filtres PAR PLAN, or un portail appartient à
    // DEUX plans — le filtrer depuis la ligne d'un seul n'aurait pas de sens.
    // Il n'apparaît que s'il existe au moins une liaison, sinon c'est un bouton
    // qui ne peut rien montrer.
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
    // 📝 v1.81.0 — chip SESSION, hors `_CATS` lui aussi : le travail de
    // session n'est pas une catégorie d'objets mais une ORIGINE de données,
    // transversale aux POI, tracés, zones et structures.
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

  // 🏷️ v1.71.0 (retour KARMA « on doit aussi pouvoir filtrer au tag ») — chips
  // tags dans la modale, agrégés sur TOUTE la pile (plus seulement le principal).
  // 🏔️ v1.82.0 — chips de niveau, agrégés sur TOUTE la pile (comme les tags).
  // Tri décroissant : +1 (l'historique, s'il est là) en tête, puis -1, -2…
  // C'est l'ordre physique vu du dessus, celui qu'attend quelqu'un qui pense
  // en niveaux.
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
    // Un seul niveau = rien à filtrer.
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
        // Premier clic depuis « tout » : on ISOLE le niveau cliqué plutôt que de
        // le retirer. Sur sept niveaux superposés, c'est le geste attendu — et
        // retirer un seul niveau sur sept ne changerait quasiment rien à l'écran.
        if (!_homeLevelFilter || _homeLevelFilter.size === 0) {
          _homeLevelFilter = new Set([n]);
        } else if (_homeLevelFilter.has(n)) {
          _homeLevelFilter.delete(n);
          if (_homeLevelFilter.size === 0) _homeLevelFilter = null;   // plus rien coché = tout
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

  // Re-render de la DATA de TOUTE la pile (filtre tag modifié). Les tuiles ne
  // bougent pas (le filtre tag ne concerne que les POI).
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

  // Panneau 🗂️ — reconstruit à chaque changement de pile. Lignes dans l'ordre
  // de _stackOrder (haut de liste = au-dessus sur la carte).
  function _renderMultiPanel() {
    const rows = document.getElementById("ktaOsmMultiRows");
    const addSel = document.getElementById("ktaOsmMultiAdd");
    if (!rows || !addSel) return;
    // Ceinture v1.72.2 : le principal DOIT être dans la pile (cf bug du rendu
    // initial) — tout futur chemin qui poserait _selectedPlanId sans passer
    // par selectPlan est rattrapé ici.
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
        // 🗂️ v1.71.0 (retour KARMA) — chips de filtrage PAR PLAN. Visibilité
        // effective = case globale du bandeau ET chip du plan.
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

    // Sélecteur d'ajout : plans georef restants
    const restants = plans.filter(function(p) { return _stackOrder.indexOf(p.id) === -1; });
    addSel.innerHTML = '<option value="">' + _escapeHtml(window.I18n.t("osm_mode.multi.add")) + '</option>' +
      restants.map(function(p) {
        return '<option value="' + _escapeHtml(p.id) + '">' + _escapeHtml(p.name) + '</option>';
      }).join("");
    addSel.style.display = restants.length ? "" : "none";

    // Bindings (rows reconstruits → rebind à chaque render, listeners courts)
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
    // 🏷️ v1.84.0 — les chips d’étiquette suivent l’état de la pile (« 3/12 »)
    // : tout ce qui la modifie passe par ici, donc un seul point de rendu.
    _renderMultiTags();

    rows.querySelectorAll("[data-op]").forEach(function(r) {
      r.addEventListener("input", function() {
        const id = r.getAttribute("data-op");
        const v = parseInt(r.value, 10) / 100;
        if (id === _selectedPlanId) {
          _setPlanOpacity(v);   // (le slider bandeau n'existe plus — modale seule)
        } else {
          _setOpaciteExtra(id, v);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 🔎 v1.70.0 — RECHERCHE DU MODE OSM (topo KARMA 30/07, décision 1)
  // ═══════════════════════════════════════════════════════════
  // Périmètre STRICTEMENT LOCAL (décision explicite : « pas de sortie
  // internet ») : ① les PLANS de la liste OSM (géoréférencés uniquement —
  // les autres sont invisibles ici par construction) ② leurs POI, lus sans
  // charger le plan via _loadPlanDataForPreview (cache RAM `_planDataCache`).
  // PAS de recherche d'adresse (Nominatim = nouvelle surface réseau,
  // écartée ; réétudiable en option opt-in séparée).
  //
  // Index construit PARESSEUSEMENT à la première saisie (extraire N ZIP au
  // mount du widget ralentirait le boot HOME pour un usage incertain).
  let _searchIndex = null;      // [{type:"plan"|"poi", planId, planName, georef, nom, x, y, tags}]
  // 🐛 v1.72.1 (KARMA « elle se bloque ») : pendant l'extraction, un 2e appel
  // recevait `Promise.resolve(null)` IMMÉDIAT → _rendre re-tournait → nouvel
  // appel → résolution immédiate → boucle de microtasks, UI gelée sur
  // « Lecture des plans… ». Fix : retourner LA promesse en vol.
  let _searchIndexPromise = null;

  function _construireIndexRecherche() {
    if (_searchIndex) return Promise.resolve(_searchIndex);
    if (_searchIndexPromise) return _searchIndexPromise;
    const plans = _listGeorefPlans();
    const index = [];
    plans.forEach(function(p) {
      index.push({ type: "plan", planId: p.id, planName: p.name, georef: p.georef });
    });
    // Extraction séquentielle (pas Promise.all : N JSZip simultanés = pic RAM
    // mobile ; le cache _planDataCache rend les passages suivants gratuits).
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

  // Projette un POI en latlng via le georef de SON plan (chaque plan a sa
  // propre calibration — jamais celle du plan sélectionné).
  function _poiVersLatLng(entry) {
    try {
      if (!window.KmzExport || typeof window.KmzExport.buildTransform !== "function") return null;
      const g = entry.georef;
      const t = window.KmzExport.buildTransformCalib(g);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
      const gps = window.KmzExport.planToGps(t, entry.x, entry.y);
      return gps ? L.latLng(gps.lat, gps.lng) : null;
    } catch(e) { return null; }
  }

  let _searchFlashMarker = null;

  function _allerAuResultat(entry) {
    const resEl = document.getElementById("ktaOsmHomeSearchResults");
    if (resEl) resEl.style.display = "none";
    // Le résultat bascule d'abord la vue sur SON plan (mono-plan en lot 1 —
    // le multi-plans du lot 2 réutilisera ce même pipeline).
    if (entry.planId !== _selectedPlanId) selectPlan(entry.planId);
    if (entry.type === "plan") return;   // sélection = fitBounds déjà fait
    const ll = _poiVersLatLng(entry);
    if (!ll) return;
    // La carte peut être en cours de (re)création après selectPlan → retries
    // bornés, même pattern que les invalidateSize en cascade du module.
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

    // 🐛 v1.72.1 (spec finale KARMA) — le dropdown ÉPOUSE la barre : même
    // gauche, même largeur, collé dessous. position:fixed + rect de l'input
    // à chaque affichage ; largeur élargie (min 320px) et clampée au viewport
    // si la barre est très étroite.
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

  // ⚠️ v1.70.0 — Avertissement perf du mode OSM (décision KARMA 2:b) :
  // UNE FOIS à la première ouverture du mode (persisté LS). Le second volet
  // (« > 3 plans affichés ») s'activera au lot 2 multi-plans via cette même
  // fonction (seuil passé en argument).
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
      _avertirPerfModeOsm();   // 🔔 v1.70.0 — 1× à la première ouverture du mode
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

    // 🎨 v1.77.0 — cache des overrides de légende par plan invalidé à chaque
    // mount : un retour au HOME après des modifs de couleur en mode plan
    // relit les slots SessionPersist (auto-savés ~1,5 s).
    _legendeParPlan = {};

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
    // 🗂️ v1.71.0 — pile multi-plans : le plan sélectionné devient le PRINCIPAL.
    // S'il était un plan AJOUTÉ, on retire d'abord ses groupes extra (ses
    // couches vont renaître dans les groupes module) ; l'ancien principal est
    // REMPLACÉ dans la pile à la même position (comportement historique : ses
    // couches sont écrasées par le rendu du nouveau).
    const _prevPrimary = _selectedPlanId;
    if (planId !== _prevPrimary && _extraLayers[planId]) _retirerPlanOsm(planId);
    _selectedPlanId = planId;
    // 🐛 v1.71.0 (KARMA) — synchroniser le DROPDOWN du bandeau : la recherche
    // (et tout selectPlan programmatique) changeait le plan affiché mais le
    // <select> gardait l'ancien nom — sa valeur n'était posée qu'au render
    // initial du widget.
    const _dd = document.getElementById("ktaOsmHomePlanSelect");
    if (_dd && _dd.value !== planId) _dd.value = planId;
    const plans = _listGeorefPlans();
    const sel = plans.find(function(p) { return p.id === planId; });
    if (!sel) return;
    if (_stackOrder.indexOf(planId) === -1) {
      const iPrev = _prevPrimary ? _stackOrder.indexOf(_prevPrimary) : -1;
      if (iPrev !== -1) _stackOrder[iPrev] = planId;
      else _stackOrder.unshift(planId);
    } else if (_prevPrimary && _prevPrimary !== planId) {
      const iPrev = _stackOrder.indexOf(_prevPrimary);
      if (iPrev !== -1) _stackOrder.splice(iPrev, 1);
    }
    _renderMultiPanel();
    _renderPortails();   // 🌀 D5 : la pile a changé → les liaisons traçables aussi
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
      // 🎚️ v1.71.0 : tags en modale (guard si fermée) + parité pile
      _renderModalTags();
      _renderModalNiveaux();
      _appliquerOrdre();
      _appliquerVisibilites();
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
  // 🌍 v1.46.0 — Le widget rend ses toggles/labels via window.I18n.t(). Comme
  // I18n.init() est ASYNC (fetch des dicos), un mount au DOMContentLoaded peut
  // s'exécuter AVANT que les dicos soient chargés → labels en clés brutes
  // (osm_home.toggle.*). On attend donc I18n.init() avant le 1er mount.
  function _mountWhenI18nReady() {
    var ready = (window.I18n && typeof window.I18n.init === "function") ? window.I18n.init() : Promise.resolve();
    Promise.resolve(ready).then(mount).catch(function() { mount(); });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _mountWhenI18nReady);
  } else {
    setTimeout(_mountWhenI18nReady, 100); // léger délai pour laisser PlanRegistry s'initialiser
  }
  // 🌍 v1.46.0 — Re-render au changement de langue (labels reconstruits via I18n.t).
  if (window.I18n && typeof window.I18n.onChange === "function") {
    window.I18n.onChange(function() { try { mount(); } catch(e) {} });
  }

  // ============================================================
  // 🆕 v1.43.15 — Toggle "Réduire les contrôles" du widget Home
  // 🧹 v1.71.0 : helpers du bouton 🔼 « réduire les contrôles » SUPPRIMÉS
  // avec le wrapper collapsible (la clé LS myktamap_osm_home_controls_collapsed
  // n'est plus lue — résidu inoffensif chez les users existants).

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
