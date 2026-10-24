/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// MAP.JS — carte Leaflet du plan (CRS.Simple), icônes, calques, collision
// =========================
// Expose : initMapFromConfig, cleanupExistingMap, window.map, iconeDefault / iconeTrack, _iconMap (tag →
//   icône, résolveur unique), _ktaBuiltinIconUrls (= TAGS_BUILTIN, top-level), KTA_POPUP_OPTS,
//   _ktaImageOverlays / _applyLevelFilterToImageLayers (filtre multi-niveau).
// ⚠️ Coordonnées : TOUJOURS convertCoord(x, y) = [imageHeight - y, x].
// Garde-fous : scripts/check-icon-catalog.js, scripts/check-map-listeners.js
// Doc : docs/architecture/rendering-leaflet.md

let map, bounds, collisionCanvas, collisionCtx;

// Handler CAPTURE du mode « clic carte » (cf initMapFromConfig). 🩸 Fonction NOMMÉE de portée module : une
// closure anonyme recréée à chaque chargement de plan ne se détache jamais (un clic = N clics). Elle lit
// la variable module `map`, toujours la carte courante.
function _ktaPickCaptureClick(domEvt) {
  if (!(window._modeClicCarteActif && window._modeClicCarteActif())) return;
  // Garder zoom & co. 🩸 Et la fiche (popup) : un bouton qui ARME un mode (« Repositionner ») le fait pendant la
  // capture de CE clic (document avant #map) ; sans cette exclusion, le même clic devenait la position choisie.
  if (domEvt.target && domEvt.target.closest &&
      domEvt.target.closest(".leaflet-control, .leaflet-popup")) return;
  let latlng;
  try { latlng = map.mouseEventToLatLng(domEvt); } catch(_) { return; }
  domEvt.stopImmediatePropagation();
  domEvt.preventDefault();
  map.fire("click", {
    latlng:         latlng,
    originalEvent:  domEvt,
    containerPoint: map.mouseEventToContainerPoint(domEvt),
    layerPoint:     map.mouseEventToLayerPoint(domEvt)
  });
}

// Options communes des popups : autoPanPadding [horizontal, vertical] (px écran) généreux pour ne pas clipper
// au bord sur mobile ; avec le buffer de maxBounds (initMapFromConfig), Leaflet a la marge de recentrer.
window.KTA_POPUP_OPTS = {
  autoPan:         true,
  autoPanPadding:  [30, 80],   // 30 px latéraux, 80 px en haut/bas (status bar + sidebar)
  closeButton:     true,
  className:       "kta-marker-popup"
};

// Seules iconeDefault et iconeTrack sont consommées hors map.js ; les autres tags passent par
// window._iconMap[tag] (cascade utils.js > getIconUrlForPoint).
let iconeDefault, iconeTrack;

// ── Catalogue des tags built-in — SOURCE UNIQUE ──────────
// 🩸 AU TOP-LEVEL et exposé immédiatement : le HOME (osmHomePreview) s'affiche AVANT tout plan et le lit ;
// une copie locale ailleurs dérive sans bruit (un portail en Vue OSM devenait un rond jaune).
// scripts/check-icon-catalog.js (pré-commit bloquant) confronte les tables.


// Tags ajoutés même si le plan-config ne les déclare pas (icon/<tag>.png s'il existe, sinon défaut) :
// utilisables sur des plans existants sans toucher leur plan-config.json.
const TAGS_BUILTIN = {
  salle:    "icon/house.png",
  pa:       "icon/pa.png",
  pc:       "icon/pc.png",
  pb:       "icon/pb.png",
  pe:       "icon/pe.png",
  ps:       "icon/ps.png",
  psf:      "icon/psf.png",
  peo:      "icon/peo.png",
  pef:      "icon/pef.png",
  eso:      "icon/eso.png",
  esf:      "icon/esf.png",
  cao:      "icon/cao.png",
  caf:      "icon/caf.png",
  jes:      "icon/jes.png",
  jpe:      "icon/jpe.png",
  jps:      "icon/jps.png",
  vehicule: "icon/vehicule.png",
  elec:     "icon/elec.png",
  epure:    "icon/epure.png",
  info:     "icon/info.png",
  chatiere: "icon/chatiere.png",
  passage:  "icon/passage.png",
  danger:   "icon/danger.png",
  plaque:   "icon/plaque.png",
  // « portail » (liaisons inter-plan) : icône vortex. Un point lié garde le tag qu'on veut ; prendre
  // celui-ci signale visuellement le portail (choix de l'utilisateur).
  portail:  "icon/portail.png",
  // « Point d'entrée du plan » (Vue OSM × Mode Secours). Les plans générés avant le PNG portent l'ancien SVG en
  // data-URI : config.js > nettoyerIconesConfig le retire, le catalogue reprend la main.
  entree_plan: "icon/entree_plan.png"
};

// Exposée DÈS LE CHARGEMENT du script : le HOME résout les icônes built-in sans copie.
window._ktaBuiltinIconUrls = TAGS_BUILTIN;
// Icône d'un point sans tag (ou au tag inconnu). Hors catalogue des tags : ce n'est pas un type de POI.
window._ktaIconeDefaut = "icon/default.png";

// ── Taille des icônes au zoom (réglage 📐, APP_CONFIG.scaledMarkers) ──────────
// ⚠️ Une seule loi, mode plan comme cartes OSM : échelle = pixels ÉCRAN par pixel de PLAN, bornée
// [plancher ; 2]. Plancher : 0,25 en mode plan (défaut), KTA_ECHELLE_PLANCHER_OSM sur les cartes OSM.
//   • mode plan (CRS.Simple) : 2^zoom ;
//   • cartes OSM : mesurée à travers le calage (plan → latlng → Web Mercator) — l'icône couvre le même
//     morceau du dessin qu'en mode plan au même grossissement, quelle que soit l'échelle du plan.
// La variable --kta-marker-scale (style.css > .kta-marker-img) vit sur le body en mode plan, sur le conteneur
// de la Vue OSM et sur le pane de chaque plan de la carte de l'accueil : la plus proche gagne.
window.ktaEchelleMarqueurs = function (pxEcranParPxPlan, plancher) {
  if (!Number.isFinite(pxEcranParPxPlan) || pxEcranParPxPlan <= 0) return 1;
  const bas = (Number.isFinite(plancher) && plancher > 0) ? plancher : 0.25;
  return Math.max(bas, Math.min(2, pxEcranParPxPlan));
};
// Plancher des cartes OSM (décision produit) : la vue d'ensemble d'un plan détaillé y est la vue courante, et
// ×0,25 y donnait des icônes de 6 px illisibles. ×0,5 : 13 px en Vue OSM, 12 px à l'accueil au plus petit.
window.KTA_ECHELLE_PLANCHER_OSM = 0.5;

// Défaut ON : `!== false`.
window.ktaReglageTailleIcones = function () {
  return !window.APP_CONFIG || window.APP_CONFIG.scaledMarkers !== false;
};

// Pixels écran par pixel de plan sur une carte Web Mercator, par la projection `proj.planToLatLng` du calage.
// Calage affine : le rapport ne dépend du point choisi que par la latitude, négligeable à l'échelle d'un plan.
window.ktaPxEcranParPxPlanOsm = function (carte, proj) {
  try {
    const z = carte.getZoom();
    const a = proj.planToLatLng(0, 0), b = proj.planToLatLng(100, 0), c = proj.planToLatLng(0, 100);
    if (!a || !b || !c) return null;
    const pa = carte.project(a, z);
    return (pa.distanceTo(carte.project(b, z)) + pa.distanceTo(carte.project(c, z))) / 200;
  } catch (e) { return null; }
};

// Icône d'un POI sur une carte OSM, choisie AU RENDU :
//   • réglage actif : divIcon (div + img), comme creerIcones — le div porte le translate3d de Leaflet, l'img le
//     scale (style.css > .kta-marker-img) ; `data-kta-tag` sert au repli sur le catalogue ;
//   • réglage coupé : L.icon nu, la forme d'avant le réglage. 🩸 Pas de divIcon « à l'échelle 1 » ni de
//     taille en calc() sur l'<img> pour basculer sans re-rendu : mesuré à 1 500 marqueurs, chacun alourdit
//     tous les zooms (+10 à +30 ms) même quand la taille ne change pas.
// Un changement du réglage re-rend donc les marqueurs (événement kta:tailleIconesChange).
window.ktaIconeOsm = function (url, taille, tag) {
  let icone;
  if (window.ktaReglageTailleIcones()) {
    icone = L.divIcon({
      html:       '<img src="' + String(url).replaceAll('"', "&quot;") + '" alt=""' +
                  (tag ? ' data-kta-tag="' + String(tag).replaceAll('"', "&quot;") + '"' : "") +
                  ' class="kta-marker-img" draggable="false">',
      className:  "kta-marker-divicon",
      iconSize:   [taille, taille],
      iconAnchor: [taille / 2, taille / 2]
    });
  } else {
    icone = L.icon({ iconUrl: url, iconSize: [taille, taille], iconAnchor: [taille / 2, taille / 2] });
  }
  icone._kta_iconUrl = url;
  return icone;
};

// Réglage basculé à chaud (homeConfig.js) : chaque carte OSM ouverte re-rend ses POI.
window.ktaMajTailleIconesOsm = function () {
  window.dispatchEvent(new CustomEvent("kta:tailleIconesChange"));
};

// ── Icônes ──────────
function creerIcones(iconConfig) {
  // 🩸 iconConfig peut manquer (plan-config sans section "icons", outil externe) : sans ce garde,
  // TypeError sur 'track' au début du chargement → lancerApplication lève → écran noir.
  iconConfig = iconConfig || {};

  const trackUrl = iconConfig.track || "icon/iconetrack.png";

  // Sans icône default (ou l'ancien pin Leaflet écrit par le Générateur) : l'icône par défaut de l'app.
  const iconeDefautUrl = (iconConfig.default && !/marker-icon\.png$/.test(iconConfig.default))
    ? iconConfig.default : window._ktaIconeDefaut;

  // scaledMarkers (défaut true) : L.divIcon (div + img enfant) au lieu de L.icon, pour un
  // transform: scale() sur l'<img> selon le zoom sans casser le translate3d du DIV. OFF = taille écran fixe.
  // Lu ici seulement : changement = rechargement du plan.
  const _useScaled = !window.APP_CONFIG || window.APP_CONFIG.scaledMarkers !== false;

  // L.icon ou L.divIcon selon le mode ; `_kta_iconUrl` posé dans les deux cas (avec divIcon,
  // options.iconUrl n'existe pas — lu par getIconUrlForPoint, sessionExporter, exporter…).
  function _mkIcon(url, w, h, ax, ay, tag) {
    if (!url) return makeDefaultIcon();
    let ic;
    if (_useScaled) {
      ic = L.divIcon({
        // L'<img> reçoit le scale CSS (cf style.css). `data-kta-tag` sert au REPLI de toute la carte
        // (cf _installerRepliIcones) : carte, filtres, favoris, recherche lisent la même cascade.
        html:       '<img src="' + url + '" alt=""' +
                    (tag ? ' data-kta-tag="' + String(tag).replaceAll('"', "&quot;") + '"' : "") +
                    ' class="kta-marker-img" draggable="false">',
        className:  "kta-marker-divicon",
        iconSize:   [w, h],
        iconAnchor: [ax, ay]
      });
    } else {
      ic = L.icon({ iconUrl: url, iconSize: [w, h], iconAnchor: [ax, ay] });
    }
    ic._kta_iconUrl = url;  // backup pour les consumers (cf commentaire ci-dessus)
    return ic;
  }

  // Repli d'une icône morte pour toute la carte : délégation en CAPTURE sur le document (l'`error` d'une
  // <img> ne bulle pas, et Leaflet crée/détruit les marqueurs sans cesse). Une seule tentative par image
  // (`dataset.ktaReplied`), sinon boucle si le repli échoue aussi.
  // ⚠️ Pas de repli en `scaledMarkers: false` (L.icon natif, pas de data-kta-tag) : réglage de secours
  // mémoire ; le vrai correctif est en amont (config.js, createConf.js).
  // ⚠️ Drapeau GLOBAL : creerIcones est rappelée à chaque plan, une garde locale poserait un listener par plan.
  function _installerRepliIcones() {
    if (window._ktaRepliIconesInstalle) return;
    window._ktaRepliIconesInstalle = true;
    document.addEventListener("error", function(ev) {
      const img = ev.target;
      if (!img || img.tagName !== "IMG" || !img.classList) return;
      if (!img.classList.contains("kta-marker-img")) return;
      if (img.dataset.ktaReplied) return;
      const tag = img.getAttribute("data-kta-tag");
      const repli = tag && window._ktaBuiltinIconUrls && window._ktaBuiltinIconUrls[tag];
      if (repli && img.src !== repli) {
        img.dataset.ktaReplied = "1";
        console.warn("[Map] 🎨 icône « " + tag + " » introuvable — repli sur le catalogue de l'app");
        img.src = repli;
        return;
      }
      // Pas de repli connu (icône personnalisée, type custom) : on ne met PAS l'icône par défaut — un
      // marqueur qui change de sens serait pire qu'un marqueur discret (même choix que ≡ Légende).
      img.dataset.ktaReplied = "1";
      img.style.opacity = "0.3";
    }, true);
  }

  function makeDefaultIcon() {
    return _mkIcon(iconeDefautUrl, 50, 50, 25, 25);
  }

  iconeDefault = makeDefaultIcon();
  // Tracker en divIcon : Leaflet pose translate3d sur le DIV, on tourne l'<img> enfant (rotation
  // indépendante). "kta-tracker-divicon" neutralise le fond blanc + bordure de .leaflet-div-icon.
  iconeTrack   = L.divIcon({
    html:       '<img src="' + trackUrl + '" alt="Tracker" class="kta-tracker-img" draggable="false">',
    className:  "kta-tracker-divicon",
    iconSize:   [50, 50],
    iconAnchor: [25, 25]
  });

  // iconeDefault : repli ultime (utils.js, editor.js, interface.js) ; iconeTrack : tracking.js.
  window.iconeDefault = iconeDefault;
  window.iconeTrack   = iconeTrack;

  // tag → L.icon ou L.divIcon (cf _mkIcon), pour tous les tags du plan-config.
  window._iconMap = {};
  Object.keys(iconConfig).forEach(function(tag) {
    const url = iconConfig[tag];
    if (!url || tag === "default") {
      window._iconMap[tag] = makeDefaultIcon();
      return;
    }
    window._iconMap[tag] = _mkIcon(url, 50, 50, 25, 25, tag);
  });
  Object.keys(TAGS_BUILTIN).forEach(function(tag) {
    if (!window._iconMap[tag]) {
      window._iconMap[tag] = _mkIcon(TAGS_BUILTIN[tag], 50, 50, 25, 25, tag);
    }
  });
  _installerRepliIcones();
  // 🩸 URLs built-in = FILET DE SECOURS : PLAN_CONFIG.icons est lu EN PREMIER par la cascade, un chemin mort
  // y gagnerait sur l'icône intégrée ; les consommateurs se replient sur _ktaBuiltinIconUrls (affecté au
  // top-level, cf catalogue en tête : le HOME en a besoin avant tout plan).

  // "default" toujours présent dans _iconMap.
  if (!window._iconMap.default) {
    window._iconMap.default = iconeDefault;
  }

  // Icônes custom de la légende (catégorie `icones`) enregistrées comme n'importe quel tag (id `cust-…`),
  // et RÉ-enregistrées à chaque changement de légende (utilisables tout de suite). `_iconMap` étant le
  // résolveur unique, choisirIcone, getIconUrlForPoint et les exports suivent.
  function _enregistrerIconesCustom() {
    const LC = window.LegendCustomization;
    if (!LC || typeof LC.listCustomEntries !== "function") return;
    let entries;
    try { entries = LC.listCustomEntries("icones") || []; } catch(e) { return; }
    entries.forEach(function(e) {
      if (e && e.id && e.iconUrl) window._iconMap[e.id] = _mkIcon(e.iconUrl, 50, 50, 25, 25);
    });
  }
  _enregistrerIconesCustom();
  if (window.LegendCustomization &&
      typeof window.LegendCustomization.onCustomEntriesChange === "function" &&
      !window._ktaCustomIconSubBound) {
    // creerIcones est rejouée à chaque changement de plan : listener posé une seule fois.
    window._ktaCustomIconSubBound = true;
    window.LegendCustomization.onCustomEntriesChange(function() {
      _enregistrerIconesCustom();
    });
  }

  console.log("[Map] Icônes créées —", Object.keys(window._iconMap).length, "tags |",
              "default = " + iconeDefautUrl);
}

// ── Nettoyage de la carte existante ──────────
function cleanupExistingMap() {
  if (window.map) {
    // 🩸 Leaflet ne coupe pas la minuterie de fin de zoom animé (`_animateZoom` > setTimeout 250 ms) : démontée en
    // plein zoom, la carte la reçoit sans `_mapPane` et jette `_leaflet_pos` (ouvertures de plan enchaînées).
    // `_animatingZoom` à faux la rend sans effet (`_onZoomTransitionEnd` sort aussitôt).
    // Garde-fou : scripts/smoke/checkup-ouvertures-enchainees.js.
    try { window.map._animatingZoom = false; window.map.remove(); } catch(e) {}
  }
  let mapContainer = document.getElementById("map");
  if (!mapContainer) {
    mapContainer = document.createElement("div");
    mapContainer.id = "map";
    document.body.appendChild(mapContainer);
  }
  mapContainer._leaflet_id = undefined;
  mapContainer.innerHTML   = "";
  mapContainer.style.display = "block";
  window.map = null;
  map        = null;
}

// ── Initialisation de la carte ──────────
async function initMapFromConfig() {
  const config = window.PLAN_CONFIG;
  if (!config?.plan) throw new Error("PLAN_CONFIG non chargé");

  cleanupExistingMap();
  // 🩸 Jamais un requestAnimationFrame nu ici : il peut ne jamais venir (cf utils.js > ktaAttendreImage).
  await window.ktaAttendreImage();

  const mapContainer = document.getElementById("map");
  if (!mapContainer) throw new Error("#map introuvable");

  mapContainer.style.display = "block";
  mapContainer.style.width   = "100%";
  mapContainer.style.height  = "100%";

  Object.assign(APP_CONFIG, {
    imageHeight:   config.plan.imageHeight,
    imageWidth:    config.plan.imageWidth,
    startX:        config.tracking?.startX       ?? 0,
    startY:        config.tracking?.startY       ?? 0,
    scale:         config.tracking?.scale        ?? 1,
    stepLength:    config.tracking?.stepLength   ?? 0.7,
    stepThreshold: config.tracking?.stepThreshold ?? 13,
    stepCooldown:  config.tracking?.stepCooldown  ?? 400
  });

  creerIcones(config.icons);

  // Bornes réelles du plan (image).
  bounds = [[0, 0], [config.plan.imageHeight, config.plan.imageWidth]];

  // maxBounds élargies (~30 % du plus petit côté, invisible) : avec viscosity 1.0, sans marge, l'auto-pan ne
  // peut pas recentrer une popup près du bord (popup mobile ~250×150 px au zoom max).
  const _bufferPx = Math.round(Math.min(config.plan.imageWidth, config.plan.imageHeight) * 0.3);
  const _maxBounds = [
    [-_bufferPx,                          -_bufferPx],
    [config.plan.imageHeight + _bufferPx,  config.plan.imageWidth + _bufferPx]
  ];

  // minZoom selon la taille de l'image ET la plateforme. Mobile plafonné : au minZoom Leaflet traite l'image
  // entière, un plan de 8000+ px sature la RAM. Desktop plus généreux (vue d'ensemble).
  //   < 4000 px → mobile -4 / desktop -4 · 4000-8000 → -3 / -4 · > 8000 → -2 / -3
  // « Mobile » = écran étroit OU appareil tactile (window.ktaAppareilTactile) : un téléphone en paysage
  // (844 px) garderait sinon le plancher PC.
  const _etroit = !!(window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
  const _isMobile = _etroit || !!(window.ktaAppareilTactile && window.ktaAppareilTactile());
  const _maxImgDim = Math.max(config.plan.imageWidth || 0, config.plan.imageHeight || 0);

  // PerfUltra.mobileZoomLimit décoché : l'utilisateur assume le risque mémoire, le mobile est traité comme
  // un PC. ⚠️ Lu à l'init de L.map seulement : changement = rechargement du plan.
  const _mobileLimit = window.PerfUltra ? window.PerfUltra.get("mobileZoomLimit") : true;
  const _treatAsMobile = _isMobile && _mobileLimit;

  let _minZoom;
  if (_maxImgDim > 8000) {
    _minZoom = _treatAsMobile ? -2 : -3;
  } else if (_maxImgDim > 4000) {
    _minZoom = _treatAsMobile ? -3 : -4;
  } else {
    _minZoom = -4;   // petit plan : même plancher sur mobile et sur PC
  }
  console.log("[Map] Plan", _maxImgDim, "px → minZoom", _minZoom,
              "(mobile:", _isMobile, ", mobileZoomLimit:", _mobileLimit + ")");

  // PerfUltra "animOff" : animations Leaflet coupées. Lu à l'init seulement (rechargement requis).
  const _animOff = (window.PerfUltra && window.PerfUltra.get("animOff"));

  // Renderer canvas débordant de 50 % (Leaflet : 10 %) : au grand glissé, les tracés ne se coupent pas au
  // bord (décision produit) ; mapBearing.js l'élargit encore (Math.max). UN seul renderer, passé en option
  // ET posé en `map._renderer` (lu par d'autres modules).
  const _rendererVecteurs = L.canvas({ padding: 0.5 });

  map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: _minZoom,
    maxBounds: _maxBounds,
    maxBoundsViscosity: 1.0,
    // Canvas pour les vecteurs (pas N éléments SVG/DOM, gros gain mobile) ; les L.marker restent en DOM.
    preferCanvas: true,
    renderer:     _rendererVecteurs,
    zoomAnimation:        !_animOff,
    fadeAnimation:        !_animOff,
    markerZoomAnimation:  !_animOff,
    zoomControl:          false   // boutons +/− selon le réglage (ktaBoutonsZoom)
  });
  map._renderer = _rendererVecteurs;
  if (typeof window.ktaBoutonsZoom === "function") window.ktaBoutonsZoom(map);
  // Fond sous le plan (réglage par plan, ou conseillé par le plan).
  if (typeof window.ktaAppliquerFondPlan === "function") window.ktaAppliquerFondPlan();
  if (_animOff) console.log("[Map] 🚀 Animations Leaflet désactivées (PerfUltra.animOff)");
  map.setMaxBounds(_maxBounds);
  map.setMinZoom(_minZoom);
  map.setMaxZoom(2);

  window.map    = map;
  window.bounds = bounds;

  // Mode « plan orienté » : la carte est REMPLACÉE à chaque plan, le pane de rotation et les hooks se
  // reposent ici, garde sur l'instance (jamais sur `window`, cf scripts/check-map-listeners.js). Sans mode
  // actif, `attachTo` ne coûte rien.
  if (window.MapBearing) {
    try {
      window.MapBearing.reset();          // repart droit sur le nouveau plan
      window.MapBearing.attachTo(map);
    } catch(e) { console.warn("[Map] MapBearing :", e); }
  }

  // Pas de popup d'annotation pendant un mode « clic carte » (dessin, mesure, recalage, pickers) : refermée
  // dans `popupopen`, synchrone avant le paint — le clic reste au mode actif, sans flash.
  map.on("popupopen", function(e) {
    if (window._modeClicCarteActif && window._modeClicCarteActif()) {
      try { map.closePopup(e.popup); } catch(_) {}
    }
  });

  // Mode « clic carte » : un clic SUR un élément interactif serait mangé par lui et n'atteindrait pas
  // map.on("click") du picker. Interception en phase CAPTURE sur le conteneur, AVANT les layers : propagation
  // stoppée puis click MAP ré-émis à la bonne position. Seul le click est intercepté (le pan reste intact) ;
  // contrôles Leaflet et floaters (hors conteneur) épargnés ; sans mode actif, pass-through.
  // 🩸 Le div #map est PERSISTANT (cleanupExistingMap ne vide que innerHTML) : un listener anonyme
  // s'EMPILERAIT à chaque plan (un clic = N clics). Référence STABLE + retrait-avant-ajout = idempotent ;
  // stopImmediatePropagation en défense.
  map.getContainer().removeEventListener("click", _ktaPickCaptureClick, true);
  map.getContainer().addEventListener("click", _ktaPickCaptureClick, true);
  // true = phase capture (avant les handlers des layers)

  // Taille visuelle des icônes selon le zoom : --kta-marker-scale sur les <img> divIcon
  // (style.css > .kta-marker-img), loi window.ktaEchelleMarqueurs. Rien si scaledMarkers OFF.
  if (window.ktaReglageTailleIcones()) {
    const _majMarkerScale = function() {
      // 2^zoom = pixels écran par pixel de plan : zoom 0 → 1, -1 → 0.5, -2 → 0.25 (plancher : en dessous,
      // l'icône deviendrait un point illisible).
      document.body.style.setProperty("--kta-marker-scale", window.ktaEchelleMarqueurs(Math.pow(2, map.getZoom())));
    };
    map.on("zoomend", _majMarkerScale);
    map.on("zoom",    _majMarkerScale);  // pendant l'animation pour fluidité
    _majMarkerScale();
  } else {
    document.body.style.setProperty("--kta-marker-scale", "1");
  }

  // File source si disponible (mode import).
  const baseAsset = Object.values(window.RUNTIME_ASSETS || {}).find(function(a) {
    return a.url === config.plan.baseImage;
  });
  const baseFile = baseAsset?.file || null;
  const baseSize = baseFile?.size  || null;

  window._baseTiles = await chargerImage(config.plan.baseImage, bounds, map, baseSize, baseFile);

  // ── Calques de données ──
  const dataLayerGroups = {};
  const overlays = {};

  (config.dataLayers || []).forEach(function(layerConfig) {
    const group = L.layerGroup();
    if (layerConfig.visible) group.addTo(map);
    dataLayerGroups[layerConfig.id] = group;
    // Calque "editor" : libellé « Mes annotations » FORCÉ (calque universel des annotations de session),
    // quel que soit le plan-config.
    const labelAffiche = (layerConfig.id === "editor") ? "Mes annotations" : layerConfig.label;
    overlays[labelAffiche] = group;
  });

  // ⚠️ Calque "editor" créé s'il manque : sinon window.layerEditor undefined → editor.js et zones.js
  // ajouteraient directement à la carte, hors du toggle « Mes annotations ».
  if (!dataLayerGroups.editor) {
    const editorGroup = L.layerGroup();
    editorGroup.addTo(map);  // visible par defaut
    dataLayerGroups.editor = editorGroup;
    overlays["Mes annotations"] = editorGroup;
    console.warn("[Map] Calque 'editor' absent du plan-config — fallback auto-créé");
  }

  // ── Calques image ──
  const sortedImageLayers = [...(config.imageLayers || [])].sort(function(a, b) {
    return (a.order || 0) - (b.order || 0);
  });

  // Registre des calques image pour le filtre multi-niveau ; vidé au changement de plan
  // (main.js > _libererRessourcesPlanPrecedent).
  window._ktaImageOverlays = [];

  // multiLevel actif et niveau hors visibleLevels → pas ajouté, même si layerConfig.visible.
  const _mlActif = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const _visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
                    ? window.APP_CONFIG.visibleLevels : [0];

  sortedImageLayers.forEach(function(layerConfig) {
    const lvl = Number.isInteger(layerConfig.level) ? layerConfig.level : 0;
    const niveauVisible = !_mlActif || _visibles.indexOf(lvl) >= 0;
    const layerId = layerConfig.id || layerConfig.label;

    // Calage : prefs du plan (LS) > plan-config > null. Calage + plugin Rotated → image en parallélogramme
    // (3 coins depuis les 2 ancres) ; sinon bornes du plan. Chargement ASYNC (dimensions naturelles d'abord).
    const calib = (window.ImageLayerCalibration && typeof window.ImageLayerCalibration.getCalibration === "function")
      ? window.ImageLayerCalibration.getCalibration(layerId)
      : null;
    const hasRotated = !!(L.imageOverlay && L.imageOverlay.rotated);

    function _addStandardOverlay() {
      const overlay = L.imageOverlay(layerConfig.file, bounds);
      _registerOverlay(overlay);
    }
    function _addRotatedOverlay(corners) {
      const overlay = L.imageOverlay.rotated(
        layerConfig.file,
        corners.tl, corners.tr, corners.bl,
        { interactive: false }
      );
      overlay._ktaCalibrated = true;
      _registerOverlay(overlay);
    }
    function _registerOverlay(overlay) {
      overlay._ktaLevel = lvl;  // stocke pour le filtre runtime
      if (layerConfig.visible && niveauVisible) overlay.addTo(map);
      overlays[layerConfig.label] = overlay;
      window._ktaImageOverlays.push({
        // id stable pour le FilterPanel (le libellé peut contenir espaces et accents).
        id:      layerId,
        overlay: overlay,
        label:   layerConfig.label,
        level:   lvl
      });
    }

    if (calib && hasRotated) {
      window.ImageLayerCalibration.loadImageDimensions(layerConfig.file)
        .then(function(dims) {
          const corners = window.ImageLayerCalibration.compute3CornersFromAnchors(
            calib, dims.width, dims.height
          );
          if (!corners) {
            console.warn("[Map] Calibration invalide (ancres colinéaires) pour", layerId, "→ fallback bounds plan");
            _addStandardOverlay();
            return;
          }
          _addRotatedOverlay(corners);
        })
        .catch(function(e) {
          console.warn("[Map] Échec chargement dims image layer", layerId, "→ fallback bounds plan :", e);
          _addStandardOverlay();
        });
    } else {
      _addStandardOverlay();
    }
  });

  // Pas de L.control.layers : le bouton ≡ ouvre le FilterPanel unifié, qui togglera les overlays exposés.

  // Collision
  await initCollisionMap(config.plan.collisionImage);

  window.dataLayerGroups = dataLayerGroups;
  window.layerEditor    = dataLayerGroups.editor;

  console.log("[Map] Carte initialisée");
}

// Filtre multi-niveau des calques image, appelé par interface.js > appliquerFiltreNiveau() après chaque
// changement de visibleLevels. La modale Niveaux fait autorité : niveau visible → addLayer forcé, sinon
// removeLayer forcé ; entre deux changements, la case Leaflet reste libre. Rien si multiLevel = false.
window._applyLevelFilterToImageLayers = function() {
  if (!window.APP_CONFIG || window.APP_CONFIG.multiLevel !== true) return;
  if (!window.map || !Array.isArray(window._ktaImageOverlays)) return;
  const visibles = Array.isArray(window.APP_CONFIG.visibleLevels)
                   ? window.APP_CONFIG.visibleLevels : [0];
  window._ktaImageOverlays.forEach(function(entry) {
    const niveauVisible = visibles.indexOf(entry.level) >= 0;
    const onMap = window.map.hasLayer(entry.overlay);
    if (niveauVisible && !onMap) {
      window.map.addLayer(entry.overlay);
    } else if (!niveauVisible && onMap) {
      window.map.removeLayer(entry.overlay);
    }
  });
};

// ── Collision ──────────
function initCollisionMap(imagePath) {
  const MAX_CANVAS_DIM = 4096;
  return new Promise(function(resolve) {
    if (!imagePath) {
      window.collisionCtx = null;
      window.collisionCanvas = null;
      resolve(); return;
    }
    const img = new Image();
    // 🩸 Jamais un requestAnimationFrame nu ici : sans image, la collision ne se chargeait pas et l'ouverture du plan
    // ne finissait jamais (cf utils.js > ktaAttendreImage).
    window.ktaAttendreImage().then(function() { img.src = imagePath; });
    img.onload = function() {
      try {
        let w = img.width, h = img.height;
        if (w > MAX_CANVAS_DIM || h > MAX_CANVAS_DIM) {
          const r = Math.min(MAX_CANVAS_DIM / w, MAX_CANVAS_DIM / h);
          w = Math.round(w * r); h = Math.round(h * r);
        }
        collisionCanvas = document.createElement('canvas');
        collisionCanvas.width  = w;
        collisionCanvas.height = h;
        collisionCtx = collisionCanvas.getContext('2d', { willReadFrequently: true });
        collisionCtx.drawImage(img, 0, 0, w, h);
        img.src = "";
        window.collisionCtx    = collisionCtx;
        window.collisionCanvas = collisionCanvas;
        resolve();
      } catch(err) {
        console.error("[Collision] OOM :", err);
        window.collisionCtx = null;
        window.collisionCanvas = null;
        resolve();
      }
    };
    img.onerror = function() {
      window.collisionCtx = null;
      window.collisionCanvas = null;
      resolve();
    };
  });
}

window.initMapFromConfig = initMapFromConfig;
