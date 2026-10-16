/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// MAP.JS — unifié serveur + import navigateur
// =========================

let map, bounds, collisionCanvas, collisionCtx;

// 🐛 v1.77.0 — Handler CAPTURE du mode « clic carte » (cf. bloc v1.28.0 dans
// initMapFromConfig). Fonction NOMMÉE de portée module : c'est ce qui rend le
// removeEventListener possible (une closure anonyme re-créée à chaque
// chargement de plan ne peut jamais être détachée — c'était le bug des
// « 6 points d'un coup »). Elle lit la variable module `map`, qui pointe
// toujours sur la carte courante — rien à capturer.
function _ktaPickCaptureClick(domEvt) {
  if (!(window._modeClicCarteActif && window._modeClicCarteActif())) return;
  if (domEvt.target && domEvt.target.closest &&
      domEvt.target.closest(".leaflet-control")) return;  // garder zoom & co
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
// CATALOGUE DES TAGS BUILT-IN — SOURCE UNIQUE (v1.81.0)
// =========================
// 🩸 Pourquoi cette table est AU TOP-LEVEL et exposée immédiatement :
// elle vivait à l'intérieur de `creerIcones()`, donc `window._ktaBuiltinIconUrls`
// n'existait qu'APRÈS le chargement d'un plan. Le HOME, lui, s'affiche AVANT :
// `js/osmHomePreview.js` ne pouvait pas la lire et en gardait une COPIE locale
// (`TAGS_BUILTIN_HOME`) — copie qui a dérivé deux fois sans que rien ne le
// signale : `entree_plan` (v1.41.0, pourtant conçu POUR la Vue OSM) et
// `portail` (v1.59.0) manquaient. Résultat : en Vue OSM, un point portail
// tombait sur le `circleMarker` de secours — un petit rond jaune à la place de
// l'icône vortex. Le module le signalait… en `console.log`, noyé.
// Un commentaire « sync ici » n'a rien empêché : `scripts/check-icon-catalog.js`
// (pré-commit bloquant) confronte désormais les deux tables.


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
  plaque:   "icon/plaque.png",
  // 🆕 v1.59.0 — Tag « portail » (liaisons inter-plan) : icône vortex dédiée.
  // Choix UTILISATEUR : un point lié peut garder n'importe quel tag (aucun
  // marquage visuel), ou prendre ce tag pour signaler visuellement le
  // portail (l'ex-badge 🌀 overlay auto a été retiré en v1.59.0).
  portail:  "icon/portail.png",
  // 🆕 v1.41.0 D — Tag spécial "Point d'entrée du plan" (Vue OSM × Mode Secours).
  //    Icône inline SVG vectorielle (porte stylisée jaune charte) → pas besoin
  //    de fichier PNG. KARMA peut remplacer par "icon/entree.png" + ajouter au
  //    sw.js ASSETS_TO_CACHE plus tard si besoin d'un design custom.
  entree_plan: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
      '<circle cx="25" cy="25" r="23" fill="#f4c542" stroke="#1a1f2e" stroke-width="2.5"/>' +
      '<rect x="17" y="13" width="16" height="26" fill="#1a1f2e" rx="1"/>' +
      '<rect x="19" y="15" width="12" height="22" fill="#f4c542" rx="0.5"/>' +
      '<circle cx="28.5" cy="26" r="1.5" fill="#1a1f2e"/>' +
    '</svg>'
  )
};

// Exposée DÈS LE CHARGEMENT du script (et non plus depuis `creerIcones`) :
// c'est ce qui permet au HOME — affiché avant tout plan — de résoudre les
// icônes built-in sans en garder une copie.
window._ktaBuiltinIconUrls = TAGS_BUILTIN;

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
  function _mkIcon(url, w, h, ax, ay, tag) {
    if (!url) return makeDefaultIcon();
    let ic;
    if (_useScaled) {
      ic = L.divIcon({
        // L'<img> enfant reçoit le transform: scale(...) CSS (cf style.css)
        // 🎨 26/09/2026 (audit icônes, étage 1) — `data-kta-tag` sert au REPLI
        // (cf `_installerRepliIcones` plus bas) : le filet posé en v1.76.0 ne
        // couvrait que ≡ Légende, alors que la carte, les filtres, les favoris
        // et la recherche lisent la même cascade et peuvent donc hériter du même
        // chemin mort. Mesuré sur un plan réel : seule la légende s'en sortait.
        html:       '<img src="' + url + '" alt=""' +
                    (tag ? ' data-kta-tag="' + String(tag).replace(/"/g, "&quot;") + '"' : "") +
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

  // 🎨 26/09/2026 — REPLI D'UNE ICÔNE MORTE, pour toute la carte.
  // Délégation en phase de CAPTURE sur le document : l'événement `error` d'une
  // <img> ne bulle pas, et les marqueurs sont créés/détruits en permanence par
  // Leaflet — un listener par image serait à la fois coûteux et fragile. Une
  // seule tentative par image (`dataset.ktaReplied`), sinon une boucle si le
  // repli échoue aussi. Même logique que `interfaceLegende.js`, un seul endroit
  // de plus à maintenir, et tous les consommateurs de `_iconMap` couverts.
  // ⚠️ Ne couvre pas le mode `scaledMarkers: false` (L.icon natif, pas de
  // `data-kta-tag` possible) : c'est un réglage de secours mémoire, et le vrai
  // correctif est en amont (`config.js`, `createConf.js`).
  // ⚠️ Drapeau GLOBAL, pas local : `creerIcones` est rappelée à chaque plan
  // chargé, une garde locale aurait donc posé un listener par plan — la fuite
  // exacte qu'on vient de fermer ailleurs (v1.97.6).
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
      // Pas de repli connu pour ce tag (icône personnalisée d'un plan, type
      // custom) : on ne remplace PAS par l'icône par défaut — un marqueur qui
      // change de sens serait pire qu'un marqueur discret. Même choix que
      // ≡ Légende depuis la v1.76.0.
      img.dataset.ktaReplied = "1";
      img.style.opacity = "0.3";
    }, true);
  }

  function makeDefaultIcon() {
    if (useLeafletDefault) {
      // Icône native Leaflet (pin bleu classique). Pas de scale (anchor
      // bas-centre incompatible avec scale around center).
      return new L.Icon.Default();
    }
    return _mkIcon(iconConfig.default, 50, 50, 25, 25);
  }

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
    window._iconMap[tag] = _mkIcon(url, 50, 50, 25, 25, tag);
  });
  Object.keys(TAGS_BUILTIN).forEach(function(tag) {
    if (!window._iconMap[tag]) {
      window._iconMap[tag] = _mkIcon(TAGS_BUILTIN[tag], 50, 50, 25, 25, tag);
    }
  });
  _installerRepliIcones();
  // 🐛 v1.76.0 — URLs built-in exposées comme FILET DE SECOURS. Un plan peut
  // déclarer un de ces tags dans son plan-config.json > icons avec un chemin
  // mort ; comme PLAN_CONFIG.icons est lu EN PREMIER par toute la cascade,
  // l'URL cassée gagnait sur l'icône intégrée (ex. la porte SVG inline
  // d'entree_plan) et la légende affichait une image morte. Les consommateurs
  // (≡ Légende) se replient sur cette table quand leur <img> échoue.
  // 🔁 v1.81.0 : l'affectation est REMONTÉE au top-level (cf. le bandeau
  // « CATALOGUE DES TAGS BUILT-IN » en tête de fichier). Ici, elle n'aurait
  // lieu qu'au chargement d'un plan — or le HOME s'affiche AVANT, et c'est
  // lui qui en avait besoin.

  // Garantir que "default" est toujours présent dans _iconMap
  if (!window._iconMap.default) {
    window._iconMap.default = iconeDefault;
  }

  // 🐛 v1.76.0 (F10) — ICÔNES CUSTOM DE LA LÉGENDE.
  // Une entrée custom de catégorie `icones` s'affichait dans ≡ Légende et dans
  // la légende du PNG… et c'était tout : aucun point ne pouvait la porter, car
  // son id n'existait pas dans `_iconMap` et l'éditeur de point ne la
  // proposait pas. Une pure décoration qui promettait sans tenir.
  // On l'enregistre ici comme n'importe quel tag (id `cust-…` → icône), et on
  // RÉ-enregistre à chaque changement de légende : une icône créée pendant la
  // session doit être utilisable immédiatement, pas au prochain plan.
  // `_iconMap` étant LE résolveur unique (règle du projet), tout le reste —
  // choisirIcone, getIconUrlForPoint, exports — suit sans modification.
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
    // Garde anti-doublon : creerIcones est rejouée à chaque plan switch, le
    // listener ne doit être posé qu'une fois (même pattern que interface.js).
    window._ktaCustomIconSubBound = true;
    window.LegendCustomization.onCustomEntriesChange(function() {
      _enregistrerIconesCustom();
    });
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
  // « Mobile » = écran étroit OU appareil tactile (window.ktaAppareilTactile) :
  // un téléphone en paysage (844 px) gardait sinon le plancher PC.
  const _etroit = !!(window.matchMedia && window.matchMedia("(max-width: 768px)").matches);
  const _isMobile = _etroit || !!(window.ktaAppareilTactile && window.ktaAppareilTactile());
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
    _minZoom = -4;   // petit plan : même plancher sur mobile et sur PC
  }
  console.log("[Map] Plan", _maxImgDim, "px → minZoom", _minZoom,
              "(mobile:", _isMobile, ", mobileZoomLimit:", _mobileLimit + ")");

  // 🚀 PerfUltra : si "animOff" actif, désactivation des animations Leaflet
  // (zoom progressif, fade, marker zoom). Lecture UNIQUEMENT à l'init de la
  // map → un changement du toggle nécessite reload pour effet (warning UI).
  const _animOff = (window.PerfUltra && window.PerfUltra.get("animOff"));

  // Renderer canvas par défaut, débordant de 50 % autour de l'écran (Leaflet :
  // 10 %) — décision KARMA 10/10/2026 : au grand glissé, les tracés ne se
  // coupent plus au bord. Le mode « plan orienté » l'élargit encore si besoin
  // (`mapBearing.js`, Math.max avec la valeur d'origine). UN seul renderer :
  // passé en option ET posé en `map._renderer`, que d'autres modules lisent.
  const _rendererVecteurs = L.canvas({ padding: 0.5 });

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
    renderer:     _rendererVecteurs,
    // Animations désactivées si PerfUltra.animOff (mode performance ULTRA) :
    // pan/zoom instantanés au lieu d'animés → gain perceptible sur gros plans.
    zoomAnimation:        !_animOff,
    fadeAnimation:        !_animOff,
    markerZoomAnimation:  !_animOff,
    zoomControl:          false   // boutons +/− selon le réglage (ktaBoutonsZoom)
  });
  map._renderer = _rendererVecteurs;
  if (typeof window.ktaBoutonsZoom === "function") window.ktaBoutonsZoom(map);
  // Fond sous le plan (réglage par plan, ou conseillé par le plan) — 07/10/2026.
  if (typeof window.ktaAppliquerFondPlan === "function") window.ktaAppliquerFondPlan();
  if (_animOff) console.log("[Map] 🚀 Animations Leaflet désactivées (PerfUltra.animOff)");
  map.setMaxBounds(_maxBounds);
  map.setMinZoom(_minZoom);
  map.setMaxZoom(2);

  window.map    = map;
  window.bounds = bounds;

  // 🧭 v1.97.0 — Mode « plan orienté » (la carte tourne pendant le tracking).
  // La carte est REMPLACÉE à chaque plan chargé : le pane de rotation et les
  // hooks se reposent donc ici, et la garde vit sur l'instance (jamais sur
  // `window`, cf scripts/check-map-listeners.js). Sans mode actif, `attachTo`
  // ne fait que poser un listener qui ne coûte rien tant que l'angle est nul.
  if (window.MapBearing) {
    try {
      window.MapBearing.reset();          // repart droit sur le nouveau plan
      window.MapBearing.attachTo(map);
    } catch(e) { console.warn("[Map] MapBearing :", e); }
  }

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

  // 🐛 v1.28.0 : en mode « clic carte » actif (picker de position : géoréf /
  // départ tracker / itinéraire / évitement / KMZ), un clic SUR un élément
  // interactif (marqueur, tracé, zone…) était « mangé » par cet élément → il
  // n'atteignait pas le handler map.on("click") du picker (« le clic ne prend
  // pas »). On intercepte donc le clic en phase CAPTURE sur le conteneur, AVANT
  // les layers : on stoppe la propagation (ni popup ni interaction layer) puis
  // on re-émet un click MAP à la bonne position → le picker le reçoit, où qu'on
  // ait cliqué. On n'intercepte QUE le click (pas le mousedown) → le pan reste
  // intact. Les contrôles Leaflet (zoom…) et les floaters (hors conteneur) sont
  // épargnés. Sans mode actif : pass-through immédiat.
  //
  // 🐛 v1.77.0 (KARMA « 6 points d'un coup, puis 11, 16… » en itinéraire) —
  // ce listener était ANONYME et le div #map est PERSISTANT (index.html,
  // cleanupExistingMap ne vide que innerHTML) : chaque chargement de plan en
  // EMPILAIT un de plus, chacun ré-émettant map.fire("click") sur la map
  // COURANTE (variable module) → un clic devenait N clics, N = nb de plans
  // chargés depuis le F5 (ses « +5 » = 5 chargements). Même principe que le
  // fix 67ef865 de juin (couche Leaflet), appliqué ici à la couche DOM :
  // référence STABLE + retrait-avant-ajout = binding idempotent. Défense en
  // profondeur : stopImmediatePropagation (aucun doublon résiduel possible
  // sur le même nœud).
  map.getContainer().removeEventListener("click", _ktaPickCaptureClick, true);
  map.getContainer().addEventListener("click", _ktaPickCaptureClick, true);
  // true = phase capture (avant les handlers des layers)

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
    const lvl = Number.isInteger(layerConfig.level) ? layerConfig.level : 0;
    const niveauVisible = !_mlActif || _visibles.indexOf(lvl) >= 0;
    const layerId = layerConfig.id || layerConfig.label;

    // 🆕 v1.38.0 — Cascade calibration : LS prefs-plan > plan-config > null.
    // Si calibration présente ET le plugin Rotated chargé → on rend l'image en
    // parallélogramme via 3 coins calculés à partir des 2 ancres saisies par
    // l'user. Sinon → fallback bounds plan principal (= comportement v1.37.x).
    // Le chargement est ASYNC le temps de récupérer les dimensions naturelles
    // de l'image source — léger délai d'apparition acceptable.
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
        // 🆕 v1.21.5 (FilterPanel) : id ajouté pour permettre le match
        // par identifiant stable (le label peut contenir des espaces / accents).
        id:      layerId,
        overlay: overlay,
        label:   layerConfig.label,
        level:   lvl
      });
    }

    if (calib && hasRotated) {
      // Chargement async des dims de l'image source pour calculer les 3 coins
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

  // 🆕 v1.21.5 (KARMA "refonte filtre Leaflet") : on remplace le L.control.layers
  // natif par notre propre bouton ≡ qui ouvre la modale FilterPanel unifiée
  // (Images + Data + M-LVL + Tags + Types Road/Zone/Struct). On expose les
  // overlays globalement pour que FilterPanel puisse les toggler.
  // ANCIEN : L.control.layers(null, overlays).addTo(map);

  // Collision
  await initCollisionMap(config.plan.collisionImage);

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
