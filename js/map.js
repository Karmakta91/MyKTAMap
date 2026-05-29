// =========================
// MAP.JS — unifié serveur + import navigateur
// =========================

let map, bounds, collisionCanvas, collisionCtx;

// Options communes à tous les popups markers — autoPanPadding généreux pour
// éviter les popups clippés par les bords d'écran sur mobile. Combiné au
// buffer maxBounds (cf. initMapFromConfig), Leaflet a la marge de manœuvre
// pour repositionner correctement.
//   autoPanPadding[0]  = padding horizontal (px écran)
//   autoPanPadding[1]  = padding vertical   (px écran)
window.KTA_POPUP_OPTS = {
  autoPan:         true,
  autoPanPadding:  [30, 80],   // 30 px latéraux, 80 px en haut/bas (status bar + sidebar)
  closeButton:     true,
  className:       "kta-marker-popup"
};

// Icônes globales — seules iconeDefault et iconeTrack sont consommées hors map.js
// (cf. utils.js, editor.js, interface.js, tracking.js). Tous les autres tags sont
// résolus via window._iconMap[tag] (cf. cascade getIconUrlForPoint dans utils.js).
let iconeDefault, iconeTrack;

// =========================
// ICÔNES
// =========================
function creerIcones(iconConfig) {
  // v173 défense : iconConfig peut être undefined si le plan-config.json
  // n'a pas de section "icons" (ex: ZIP généré par un outil externe ou
  // par kmzImport sans intégration de la section icons). Sans ce guard,
  // crash TypeError "Cannot read properties of undefined (reading 'track')"
  // au tout début du chargement → écran noir car lancerApplication throw.
  iconConfig = iconConfig || {};

  // URL pour le tracker (toujours iconetrack.png)
  const trackUrl = iconConfig.track || "icon/iconetrack.png";

  // Si pas d'icône default fournie, on utilisera le marker natif Leaflet
  // (pin bleu standard) pour bien différencier des points custom
  const useLeafletDefault = !iconConfig.default;

  // 🔍 v174 : si APP_CONFIG.scaledMarkers === true (default), tous les
  // markers sont créés en L.divIcon (wrapper div + img enfant) au lieu de
  // L.icon natif. Permet d'appliquer une CSS transform: scale() sur l'<img>
  // enfant pour faire varier la taille des icônes selon le zoom (sans
  // casser le translate3d Leaflet appliqué sur le DIV parent).
  // OFF = comportement Leaflet par défaut (icônes taille écran fixe).
  // Reload du plan requis pour changement (lu uniquement ici à l'init).
  const _useScaled = !window.APP_CONFIG || window.APP_CONFIG.scaledMarkers !== false;

  // Helper de création d'icône — choisit L.icon ou L.divIcon selon le mode.
  // Dans les 2 cas on attache `_kta_iconUrl` sur l'objet pour les consumers
  // qui lisaient `options.iconUrl` (utils.js > getIconUrlForPoint,
  // sessionExporter, exporter, etc.). Avec divIcon, options.iconUrl
  // n'existe pas → on doit fallback sur _kta_iconUrl.
  function _mkIcon(url, w, h, ax, ay) {
    if (!url) return makeDefaultIcon();
    let ic;
    if (_useScaled) {
      ic = L.divIcon({
        // L'<img> enfant reçoit le transform: scale(...) CSS (cf style.css)
        html:       '<img src="' + url + '" alt="" class="kta-marker-img" draggable="false">',
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

  function makeDefaultIcon() {
    if (useLeafletDefault) {
      // Icône native Leaflet (pin bleu classique). Pas de scale (anchor
      // bas-centre incompatible avec scale around center).
      return new L.Icon.Default();
    }
    return _mkIcon(iconConfig.default, 50, 50, 25, 25);
  }

  // Helper rétro-compat (gardé pour le code interne — utilise _mkIcon désormais)
  const mk = function(url, w, h, ax, ay) {
    return _mkIcon(url, w, h, ax, ay);
  };

  iconeDefault = makeDefaultIcon();
  // 🧭 v158/v159 : divIcon au lieu de L.icon pour permettre la rotation sans
  // casser le positionnement. Leaflet applique transform: translate3d(...) sur
  // le DIV parent (positionnement geo). On applique transform: rotate(...) sur
  // l'<img> enfant (rotation indépendante). className "kta-tracker-divicon"
  // override le default .leaflet-div-icon (fond blanc + bordure → invisible).
  iconeTrack   = L.divIcon({
    html:       '<img src="' + trackUrl + '" alt="Tracker" class="kta-tracker-img" draggable="false">',
    className:  "kta-tracker-divicon",
    iconSize:   [50, 50],
    iconAnchor: [25, 25]
  });

  // Globaux exposés : iconeDefault sert de fallback ultime (utils.js, editor.js,
  // interface.js) et iconeTrack est consommé par tracking.js. Les ex-globaux
  // par-tag (iconeSalle, iconepa, iconeChatiere, etc.) ont été retirés — la
  // résolution se fait désormais via window._iconMap[tag].
  window.iconeDefault = iconeDefault;
  window.iconeTrack   = iconeTrack;

  // Map dynamique : tag → L.icon ou L.divIcon (selon _useScaled, cf _mkIcon)
  // — supporte tous les tags définis dans plan-config.json
  window._iconMap = {};
  Object.keys(iconConfig).forEach(function(tag) {
    const url = iconConfig[tag];
    if (!url) {
      // Tag défini mais sans URL → icône par défaut
      window._iconMap[tag] = makeDefaultIcon();
      return;
    }
    window._iconMap[tag] = _mkIcon(url, 50, 50, 25, 25);
  });

  // Tags par défaut : si le plan-config ne les déclare pas, on les ajoute quand même
  // (ils seront chargés depuis icon/<tag>.png si le PNG existe, sinon icône par défaut)
  // Permet d'utiliser ces tags sur des plans existants sans modifier leur plan-config.json
  const TAGS_BUILTIN = {
    salle:    "icon/house.png",
    pa:       "icon/pa.png",
    pc:       "icon/pc.png",
    pb:       "icon/pb.png",
    pe:       "icon/pe.png",
    ps:       "icon/ps.png",
    peo:      "icon/peo.png",
    pef:      "icon/pef.png",
    eso:      "icon/eso.png",
    esf:      "icon/esf.png",
    cao:      "icon/cao.png",
    caf:      "icon/caf.png",
    vehicule: "icon/vehicule.png",
    elec:     "icon/elec.png",
    epure:    "icon/epure.png",
    info:     "icon/info.png",
    chatiere: "icon/chatiere.png",
    passage:  "icon/passage.png",
    danger:   "icon/danger.png",
    plaque:   "icon/plaque.png"
  };
  Object.keys(TAGS_BUILTIN).forEach(function(tag) {
    if (!window._iconMap[tag]) {
      window._iconMap[tag] = _mkIcon(TAGS_BUILTIN[tag], 50, 50, 25, 25);
    }
  });

  // Garantir que "default" est toujours présent dans _iconMap
  if (!window._iconMap.default) {
    window._iconMap.default = iconeDefault;
  }

  console.log("[Map] Icônes créées —", Object.keys(window._iconMap).length, "tags |",
              useLeafletDefault ? "default = pin Leaflet natif" : "default = " + iconConfig.default);
}

// =========================
// NETTOYAGE CARTE EXISTANTE
// =========================
function cleanupExistingMap() {
  if (window.map) {
    try { window.map.remove(); } catch(e) {}
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

// =========================
// INITIALISATION CARTE
// =========================
async function initMapFromConfig() {
  const config = window.PLAN_CONFIG;
  if (!config?.plan) throw new Error("PLAN_CONFIG non chargé");

  cleanupExistingMap();
  await new Promise(function(resolve) { requestAnimationFrame(resolve); });

  const mapContainer = document.getElementById("map");
  if (!mapContainer) throw new Error("#map introuvable");

  // Afficher #map maintenant que le loader est masqué
  mapContainer.style.display = "block";
  mapContainer.style.width   = "100%";
  mapContainer.style.height  = "100%";

  // Appliquer APP_CONFIG
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

  // Bornes "réelles" du plan (image)
  bounds = [[0, 0], [config.plan.imageHeight, config.plan.imageWidth]];

  // Bornes "élargies" pour maxBounds : ajout d'un buffer autour du plan,
  // invisible visuellement (juste le body bg sombre) mais qui permet à
  // l'auto-pan de Leaflet de positionner les popups quand un marker est
  // près du bord du plan. Sans ça, viscosity:1.0 bloquait l'auto-pan et
  // les popups sortaient du cadre.
  // Buffer ~ 30% de la dimension la plus petite : assez pour qu'une
  // popup mobile (~250×150 px) tienne même au zoom le plus zoomé.
  const _bufferPx = Math.round(Math.min(config.plan.imageWidth, config.plan.imageHeight) * 0.3);
  const _maxBounds = [
    [-_bufferPx,                          -_bufferPx],
    [config.plan.imageHeight + _bufferPx,  config.plan.imageWidth + _bufferPx]
  ];

  // minZoom dynamique selon la taille de l'image ET la plateforme.
  // Sur MOBILE : on plafonne pour eviter les crashes au dezoom extreme
  // (Leaflet doit traiter l'image entiere en memoire au minZoom — sur un
  // plan 8000+ px le canvas devient enorme et sature la RAM mobile).
  // Sur DESKTOP : la memoire est largement suffisante, on est plus
  // genereux pour permettre une vue d'ensemble confortable, surtout sur
  // les gros plans de carriere ou le user veut prendre du recul.
  //
  //   image < 4000 px de cote     → mobile -4 / desktop -4
  //   image 4000 - 8000 px        → mobile -3 / desktop -4
  //   image > 8000 px             → mobile -2 / desktop -3
  //
  // Mise a jour 10/05/2026 : desktop assoupli (-4/-3 au lieu de -2/-1)
  // sur demande utilisateur. Mobile inchange (calibre anti-crash).
  const _isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  const _maxImgDim = Math.max(config.plan.imageWidth || 0, config.plan.imageHeight || 0);

  // 🛡️ v173 : si PerfUltra.mobileZoomLimit est décoché (par défaut coché),
  // l'utilisateur a explicitement assumé le risque crash mémoire mobile au
  // dézoom extrême → on traite le mobile comme un PC pour le calcul minZoom
  // (gagne 1 ou 2 niveaux de dézoom selon la taille du plan). ⚠️ Reload du
  // plan requis pour que le changement prenne effet (minZoom lu uniquement
  // à l'init de L.map → pas re-évaluable à la volée).
  const _mobileLimit = window.PerfUltra ? window.PerfUltra.get("mobileZoomLimit") : true;
  const _treatAsMobile = _isMobile && _mobileLimit;

  let _minZoom;
  if (_maxImgDim > 8000) {
    _minZoom = _treatAsMobile ? -2 : -3;
  } else if (_maxImgDim > 4000) {
    _minZoom = _treatAsMobile ? -3 : -4;
  } else {
    _minZoom = _treatAsMobile ? -4 : -4;
  }
  console.log("[Map] Plan", _maxImgDim, "px → minZoom", _minZoom,
              "(mobile:", _isMobile, ", mobileZoomLimit:", _mobileLimit + ")");

  // 🚀 PerfUltra : si "animOff" actif, désactivation des animations Leaflet
  // (zoom progressif, fade, marker zoom). Lecture UNIQUEMENT à l'init de la
  // map → un changement du toggle nécessite reload pour effet (warning UI).
  const _animOff = (window.PerfUltra && window.PerfUltra.get("animOff"));

  map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: _minZoom,
    maxBounds: _maxBounds,
    maxBoundsViscosity: 1.0,
    // Rendu canvas pour les overlays vectoriels (polylines routes, polygons zones,
    // circleMarker intersections). Évite la création de N éléments SVG/DOM, gros
    // gain perf sur mobile pour les plans denses. Markers (L.marker) restent en DOM
    // car ils utilisent des icon images — pas affectés par preferCanvas.
    preferCanvas: true,
    // Animations désactivées si PerfUltra.animOff (mode performance ULTRA) :
    // pan/zoom instantanés au lieu d'animés → gain perceptible sur gros plans.
    zoomAnimation:        !_animOff,
    fadeAnimation:        !_animOff,
    markerZoomAnimation:  !_animOff
  });
  if (_animOff) console.log("[Map] 🚀 Animations Leaflet désactivées (PerfUltra.animOff)");
  map.setMaxBounds(_maxBounds);
  map.setMinZoom(_minZoom);
  map.setMaxZoom(2);

  window.map    = map;
  window.bounds = bounds;

  // 🐛 v1.28.0 : pas de popup d'annotation (point / tracé / zone / structure)
  // quand un mode « clic carte » est actif (dessin, mesure, recalage, ou un
  // picker de position : itinéraire / géoréf / départ tracker / évitement /
  // KMZ). Leaflet ouvre la popup au clic sur le layer (bindPopup) ; on la
  // referme aussitôt dans `popupopen` → le clic reste consommé par le mode
  // actif, sans flash perceptible (fermeture synchrone avant le paint).
  map.on("popupopen", function(e) {
    if (window._modeClicCarteActif && window._modeClicCarteActif()) {
      try { map.closePopup(e.popup); } catch(_) {}
    }
  });

  // 🔍 v174 : hook zoom pour adapter la taille visuelle des icônes.
  // Variable CSS --kta-marker-scale appliquée aux <img> des markers divIcon
  // (cf style.css > .kta-marker-img). Clamp min 0.25 (choix 4b validé KARMA)
  // pour qu'au dézoom extrême les icônes restent visibles (~12px).
  // Skip total si toggle scaledMarkers OFF (CSS variable reste à 1).
  if (!window.APP_CONFIG || window.APP_CONFIG.scaledMarkers !== false) {
    const _majMarkerScale = function() {
      // Scale = 2^zoom : zoom 0 (natif) → 1, zoom -1 → 0.5, zoom -2 → 0.25, etc.
      // Clamp min 0.25 (≈ 12px visible) — au-delà l'icône devient un point illisible.
      const z = map.getZoom();
      const raw = Math.pow(2, z);
      const clamped = Math.max(0.25, Math.min(2, raw));  // clamp aussi en haut (zoom > 1 = très zoomé)
      document.body.style.setProperty("--kta-marker-scale", clamped);
    };
    map.on("zoomend", _majMarkerScale);
    map.on("zoom",    _majMarkerScale);  // pendant l'animation pour fluidité
    _majMarkerScale();
  } else {
    // Toggle OFF : on garde la CSS variable à 1 → icônes taille écran fixe
    document.body.style.setProperty("--kta-marker-scale", "1");
  }

  // Récupérer le File source si disponible (mode import)
  const baseAsset = Object.values(window.RUNTIME_ASSETS || {}).find(function(a) {
    return a.url === config.plan.baseImage;
  });
  const baseFile = baseAsset?.file || null;
  const baseSize = baseFile?.size  || null;

  window._baseTiles = await chargerImage(config.plan.baseImage, bounds, map, baseSize, baseFile);

  // Calques données
  const dataLayerGroups = {};
  const overlays = {};

  (config.dataLayers || []).forEach(function(layerConfig) {
    const group = L.layerGroup();
    if (layerConfig.visible) group.addTo(map);
    dataLayerGroups[layerConfig.id] = group;
    // Pour le calque "editor", on FORCE le label "Mes annotations" peu importe
    // ce que dit le plan-config. Ce calque est universel à tous les plans
    // MyKTAMap et regroupe TOUTES les annotations utilisateur (points + roads
    // + zones session). Ainsi les vieux ZIP avec label "Ajouts" affichent
    // automatiquement le nouveau label sans regénération du plan.
    const labelAffiche = (layerConfig.id === "editor") ? "Mes annotations" : layerConfig.label;
    overlays[labelAffiche] = group;
  });

  // ⚠️ Fallback CRITIQUE : si le plan-config n'a pas de calque "editor"
  // (ancien plan genere avant standardisation, ou plan minimal), on en cree
  // un automatiquement. Sans ce fallback, dataLayerGroups.editor serait
  // undefined → window.layerEditor undefined → editor.js et zones.js feraient
  // addTo(window.map) directement (fallback), donc les points/zones de session
  // seraient sur la map directe et echapperaient au toggle "Mes annotations".
  if (!dataLayerGroups.editor) {
    const editorGroup = L.layerGroup();
    editorGroup.addTo(map);  // visible par defaut
    dataLayerGroups.editor = editorGroup;
    overlays["Mes annotations"] = editorGroup;
    console.warn("[Map] Calque 'editor' absent du plan-config — fallback auto-créé");
  }

  // Calques image
  const sortedImageLayers = [...(config.imageLayers || [])].sort(function(a, b) {
    return (a.order || 0) - (b.order || 0);
  });

  // 🏗️ v162 : registre des image layers pour le filtre multi-niveau runtime.
  // Reset au plan switch (cf. main.js > _libererRessourcesPlanPrecedent).
  window._ktaImageOverlays = [];

  // 🏗️ v162 : cohérence avec le filtre multi-niveau au load initial. Si le plan
  // a multiLevel actif ET que le niveau du layer n'est pas dans visibleLevels,
  // on ne l'ajoute PAS à la map (même si layerConfig.visible: true). Cas inverse :
  // si multiLevel = false ou level dans visibles → comportement v161 (layerConfig.visible).
  const _mlActif = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  const _visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
                    ? window.APP_CONFIG.visibleLevels : [0];

  sortedImageLayers.forEach(function(layerConfig) {
    const overlay = L.imageOverlay(layerConfig.file, bounds);
    const lvl = Number.isInteger(layerConfig.level) ? layerConfig.level : 0;
    overlay._ktaLevel = lvl;  // stocke pour le filtre runtime
    const niveauVisible = !_mlActif || _visibles.indexOf(lvl) >= 0;
    if (layerConfig.visible && niveauVisible) overlay.addTo(map);
    overlays[layerConfig.label] = overlay;
    window._ktaImageOverlays.push({
      // 🆕 v1.21.5 (FilterPanel) : id ajouté pour permettre le match
      // par identifiant stable (le label peut contenir des espaces / accents).
      id:      layerConfig.id || layerConfig.label,
      overlay: overlay,
      label:   layerConfig.label,
      level:   lvl
    });
  });

  // 🆕 v1.21.5 (KARMA "refonte filtre Leaflet") : on remplace le L.control.layers
  // natif par notre propre bouton ≡ qui ouvre la modale FilterPanel unifiée
  // (Images + Data + M-LVL + Tags + Types Road/Zone/Struct). On expose les
  // overlays globalement pour que FilterPanel puisse les toggler.
  window._ktaOverlays = overlays;
  // ANCIEN : L.control.layers(null, overlays).addTo(map);

  // Collision
  await initCollisionMap(config.plan.collisionImage);

  window.layerPuits     = dataLayerGroups.puits;
  window.layerVehicule  = dataLayerGroups.vehicule;
  window.layerCataphile = dataLayerGroups.cataphile;
  window.layerCarry     = dataLayerGroups.carry;
  window.dataLayerGroups = dataLayerGroups;
  window.layerEditor    = dataLayerGroups.editor;

  console.log("[Map] Carte initialisée");
}

// 🏗️ v162 : helper global pour appliquer le filtre multi-niveau sur les image
// layers. Appelé par interface.js > appliquerFiltreNiveau() après tout changement
// de visibleLevels (modale Niveaux, changement de niveau actif).
//
// SEMANTIQUE (demande KARMA) : la modale Niveaux fait autorité.
//   - Niveau dans visibleLevels  → on FORCE addLayer (override décochage Leaflet)
//   - Niveau hors visibleLevels  → on FORCE removeLayer (override cochage Leaflet)
//
// Entre 2 changements de niveau, l'user peut toggler le checkbox Leaflet
// librement (la modale ne ré-intervient qu'au prochain changement de visibles).
//
// Skip total si multiLevel = false (retro-compat v161).
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

// =========================
// COLLISION
// =========================
function initCollisionMap(imagePath) {
  const MAX_CANVAS_DIM = 4096;
  return new Promise(function(resolve) {
    if (!imagePath) {
      window.collisionCtx = null;
      window.collisionCanvas = null;
      resolve(); return;
    }
    const img = new Image();
    requestAnimationFrame(function() { img.src = imagePath; });
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
