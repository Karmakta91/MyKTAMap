/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// tracking.js — tracker podométrique (podomètre + boussole, sans GPS) : position en coordonnées plan, cap,
// recalage, collision raster, map-matching sur les tracés, timeline du parcours (replay, distance).
// Expose : initTracking, startTracking/stopTracking, getTrackingPositionEtat, resetTrackingTimeline,
//          window._applyLevelFilterToTracker…
// Dépend de : APP_CONFIG (config.js), map.js (convertCoord, iconeTrack), RoadGraph, MapBearing.
// Pièges : 🩸 `direction` est le cap DEVICE brut ; écran → _getCorrectedHeading, repère plan →
//          _getPlanRelHeading (offset Nord du plan). La boussole veut le Nord vrai, l'icône et les pas le plan.
//          🩸 La rotation CSS de l'icône est CUMULÉE hors [0, 360] (sinon saut arrière au passage du Nord).
//          🩸 Le seuil de pas se compare à accelerationIncludingGravity (~9,81 au repos) : jamais < 10.
//          🩸 Listeners window gardés par flag : initOrientation/initMotion peuvent être rappelés.
// Garde-fous : check-tracking-defaults.js, check-position-confirmee.js · Doc : docs/architecture/tracking.md
// =========================

// ── État ──────────────────────
window.modeRecalage = false;
let tracking = false;

let position = {
  x: APP_CONFIG.startX,
  y: APP_CONFIG.startY
};

let direction = 0;

// Nav intelligente : segment de tracé où la position est calée (-1 = hors réseau). Sert à préférer le segment
// courant (stickiness) ; remis à -1 à chaque recalage et (re)démarrage.
let _navSegIdx = -1;

let markerPosition;
let polyline;
let lastStepTime = 0;
let stepCount = 0;

// Niveau du tracker (multi-niveau) : pris sur activeLevel au démarrage et au recalage clic carte, sur le niveau
// du point avec « Je suis ici ». Reste 0 hors multi-niveau.
let trackerLevel = 0;

// 🩸 Position CONFIRMÉE : `position` vaut le DÉPART DU PLAN tant que l'utilisateur ne s'est pas situé. Sans ce
// drapeau, Sortie d'urgence et « Y aller » calculaient depuis l'entrée du plan en la présentant comme SA position.
// Vrai sur tout recalage (clic carte, « Je suis ici », portail, « Où es-tu ? ») et sur une session restaurée dont
// la timeline a un recalage ; faux au chargement d'un plan et au reset. La date suit chaque pas (« il y a N min »
// = dernier mouvement connu). Lu via getTrackingPositionEtat() par sortieUrgence.js, interfaceItineraire.js,
// emergencyMode.js (check-position-confirmee.js).
let _positionConfirmee   = false;
let _positionConfirmeeTs = null;
function _marquerPositionConfirmee(ts) {
  _positionConfirmee   = true;
  _positionConfirmeeTs = (typeof ts === "number") ? ts : Date.now();
}

// ── Init ──────────────────────
function initTracking() {
  // Reset complet : la carte a pu changer (changement de plan).
  position.x = APP_CONFIG.startX;
  position.y = APP_CONFIG.startY;
  stepCount  = 0;
  lastStepTime = 0;
  direction  = 0;
  tracking   = false;
  // 🩸 Le suivi est coupé ici SANS stopTracking() : on prévient quand même la carte orientée, sinon son bouton
  // « Recentrer » (posé dans le body, hors carte) survit au plan quitté.
  if (window.MapBearing) { try { window.MapBearing.onTrackingChange(false); } catch(e) {} }
  window.modeRecalage = false;
  _positionConfirmee   = false;   // nouveau plan → rien de confirmé
  _positionConfirmeeTs = null;

  // Ancien cache collision vidé (dimensions et échelles peuvent différer).
  _collisionData   = null;
  _collisionWidth  = 0;
  _collisionHeight = 0;
  _collisionScaleX = 1;
  _collisionScaleY = 1;

  initCollisionCache();

  const iconeTracker = window.iconeTrack;
  const latlng = convertCoord(position.x, position.y);

  markerPosition = L.marker(latlng, { icon: iconeTracker }).addTo(window.map);
  polyline       = L.polyline([], { weight: 3 }).addTo(window.map);

  // ⚠️ Cadrage d'ouverture NON animé : un zoom animé (fitBounds → 0) finit dans une image suivante et remettrait
  // la carte sur cette cible par-dessus la vue retrouvée (js/vuePlan.js), posée juste après.
  window.map.setView(latlng, 0, { animate: false });

  window.map.on('click', function(e) {
    if (!window.modeRecalage) return;

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    const x = lng;
    const y = APP_CONFIG.imageHeight - lat;

    position.x = x;
    position.y = y;
    _marquerPositionConfirmee();   // l'utilisateur vient de se situer
    _navSegIdx = -1;  // recalage manuel → nouveau calage sur les tracés

    // Recalage clic carte → le tracker passe au niveau actif.
    if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
      trackerLevel = window.APP_CONFIG.activeLevel || 0;
      console.log("[Tracking] Recalé sur niveau :", trackerLevel);
    }

    updateMap();
    _appliquerFiltreNiveauSurTracker();
    console.log("[Tracking] Recalé en :", x, y);

    if (polyline) polyline.setLatLngs([]);
    stepCount = 0;

    // Le tracé visible est vidé, la timeline (replay) garde tout depuis le démarrage.
    // ⚠️ `src: "click"` : un clic carte libre corrige une position fausse, il ne raconte pas un trajet → jamais
    // compté dans la distance estimée (décision produit : seul « Je suis ici » sur un point compte).
    _pushTimelinePoint("recalage", { src: "click" });

    // Le mode recalage se désactive après le clic (retour au tracker normal) : UI via interface.js, et rotation
    // réappliquée tout de suite (sinon icône figée jusqu'au prochain deviceorientation).
    if (window.modeRecalage) {
      window.modeRecalage = false;
      // interface.js > _modesActifs["recalage"].desactiverFn
      if (window._fermerModeRecalage && typeof window._fermerModeRecalage === "function") {
        try { window._fermerModeRecalage(); } catch(e) {}
      }
    }
    if (tracking) {
      _applyRotationToTrackerMarker();
    }
    // Replanification d'itinéraire.
    _notifierRecalage(x, y, "click");
  });
}

// ── Rotation de l'icône du tracker ──────────────────────
// ⚠️ L.divIcon (map.js) : <div class="kta-tracker-divicon"><img class="kta-tracker-img"></div>. Leaflet pose son
// translate3d sur le DIV, on ne tourne QUE l'<img> enfant (tourner l'élément positionné écrase le translate et
// colle l'icône en (0,0)).
// Anti-tremblement (le magnétomètre bruite de ±2-5° téléphone immobile) : lissage exponentiel α = 0.25, puis
// throttle 2°, puis transition CSS 0.3 s. Tout est remis à zéro au stopTracking.

// 🩸 Sentinelle null (pas -999 : le calcul circulaire du delta en ferait une valeur < 2 et bloquerait l'icône).
let _trackerRotationLast      = null;  // dernière valeur lissée (throttle)
let _trackerHeadingSmoothed   = null;  // valeur lissée dans [0, 360[
// 🩸 Valeur CUMULÉE appliquée au CSS, hors [0, 360] possible (-10, 370, 720…) : sinon saut arrière au passage du Nord.
let _trackerRotationUnwrapped = null;

function _applyRotationToTrackerMarker() {
  // Tracking actif seulement : au repos, l'icône pointe le Nord du PNG.
  if (!tracking) return;
  if (!markerPosition) return;

  // Cap en REPÈRE PLAN : orientation écran corrigée (sinon 90° faux en paysage) + offset Nord du plan.
  const heading = _getPlanRelHeading();

  // Mode « plan orienté » : cap transmis AVANT le throttle (qui ne vaut que pour l'icône) ; MapBearing a son propre
  // lissage, plus mou. Icône rotate(+cap) et vue rotate(-cap) → l'icône pointe vers le haut de l'écran : rien à
  // neutraliser.
  if (window.MapBearing) {
    try { window.MapBearing.onHeading(heading); } catch(e) {}
  }

  // 1. Lissage exponentiel (α = 0.25) sur le delta CIRCULAIRE minimum (350° → 10° = +20°, pas -340°).
  if (_trackerHeadingSmoothed === null) {
    _trackerHeadingSmoothed = heading;
  } else {
    let delta = heading - _trackerHeadingSmoothed;
    if (delta > 180)       delta -= 360;
    else if (delta < -180) delta += 360;
    _trackerHeadingSmoothed = (_trackerHeadingSmoothed + delta * 0.25 + 360) % 360;
  }

  // 2. Throttle 2° après lissage (pas de mise à jour DOM à chaque tick), sauté au premier appel.
  if (_trackerRotationLast !== null) {
    let deltaAffich = Math.abs(_trackerHeadingSmoothed - _trackerRotationLast);
    if (deltaAffich > 180) deltaAffich = 360 - deltaAffich;  // wrap pour distance min
    if (deltaAffich < 2) return;
  }
  _trackerRotationLast = _trackerHeadingSmoothed;

  // 3. 🩸 Rotation CUMULÉE : la transition CSS lit rotate() LITTÉRALEMENT (350deg → 10deg anime -340°). La valeur
  // cumulée ne bouge que du delta court : 350 → 370 → 350, l'animation suit le sens physique.
  if (_trackerRotationUnwrapped === null) {
    _trackerRotationUnwrapped = _trackerHeadingSmoothed;
  } else {
    const currentMod = ((_trackerRotationUnwrapped % 360) + 360) % 360;
    let delta = _trackerHeadingSmoothed - currentMod;
    if (delta > 180)       delta -= 360;
    else if (delta < -180) delta += 360;
    _trackerRotationUnwrapped += delta;
  }

  // 4. Application sur l'img ENFANT (getElement rend le DIV positionné par Leaflet).
  const el = markerPosition.getElement && markerPosition.getElement();
  if (!el) return;
  const img = el.querySelector(".kta-tracker-img");
  if (!img) return;
  img.style.transform = "rotate(" + _trackerRotationUnwrapped + "deg)";
}

// Rotation à 0° et lissage vidé (stopTracking) : le prochain Play repart propre.
function _resetRotationTrackerMarker() {
  _trackerRotationLast      = null;
  _trackerHeadingSmoothed   = null;
  _trackerRotationUnwrapped = null;
  if (!markerPosition) return;
  const el = markerPosition.getElement && markerPosition.getElement();
  if (!el) return;
  const img = el.querySelector(".kta-tracker-img");
  if (!img) return;
  img.style.transform = "rotate(0deg)";
}

// Filtre de niveau sur le tracker : masqué (opacité 0, pointer-events none) si trackerLevel n'est pas visible.
// Toujours visible hors multi-niveau.
function _appliquerFiltreNiveauSurTracker() {
  if (!markerPosition) return;
  const multi = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  if (!multi) {
    try { markerPosition.setOpacity(1); } catch(e) {}
    if (markerPosition._icon) markerPosition._icon.style.pointerEvents = "";
    if (polyline)  try { polyline.setStyle({ opacity: 1 }); } catch(e) {}
    return;
  }
  const visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
    ? window.APP_CONFIG.visibleLevels : [0];
  const visible = visibles.indexOf(trackerLevel) >= 0;
  try { markerPosition.setOpacity(visible ? 1 : 0); } catch(e) {}
  if (markerPosition._icon) markerPosition._icon.style.pointerEvents = visible ? "" : "none";
  // Le tracé parcouru suit le niveau du tracker.
  if (polyline) try { polyline.setStyle({ opacity: visible ? 1 : 0 }); } catch(e) {}
  // 🩸 Un tracker masqué par le filtre de niveau ressemble à « ma position a disparu » : on le dit, une fois par
  // bascule visible → masqué.
  if (!visible && !_trackerMasqueParNiveau && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(window.I18n.t("tracker.toast.masqueNiveau", { lvl: trackerLevel }), "warn");
  }
  _trackerMasqueParNiveau = !visible;
}
let _trackerMasqueParNiveau = false;

// Appelé par interface.js > window.appliquerFiltreNiveau().
window._applyLevelFilterToTracker = _appliquerFiltreNiveauSurTracker;

// ── Collision raster ──────────────────────
let _collisionData   = null;
let _collisionWidth  = 0;
let _collisionHeight = 0;
let _collisionScaleX = 1; // ratio coordonnées plan → canvas collision
let _collisionScaleY = 1;

function initCollisionCache() {
  if (!window.collisionCtx || !window.collisionCanvas) return;
  try {
    _collisionWidth  = window.collisionCanvas.width;
    _collisionHeight = window.collisionCanvas.height;
    _collisionData   = window.collisionCtx.getImageData(0, 0, _collisionWidth, _collisionHeight).data;

    // ⚠️ Le canvas de collision peut être réduit (max 4096 px) : ratio coordonnées plan → canvas.
    _collisionScaleX = _collisionWidth  / APP_CONFIG.imageWidth;
    _collisionScaleY = _collisionHeight / APP_CONFIG.imageHeight;

    console.log("[Collision] Cache chargé :", _collisionWidth, "x", _collisionHeight,
                "| Scale:", _collisionScaleX.toFixed(3), "x", _collisionScaleY.toFixed(3));
  } catch(e) {
    console.warn("[Collision] Impossible de lire le canvas :", e);
    _collisionData = null;
  }
}

function estAccessible(x, y) {
  if (!_collisionData) return true;

  const cx = x * _collisionScaleX;
  const cy = y * _collisionScaleY;

  if (cx < 0 || cy < 0 || cx >= _collisionWidth || cy >= _collisionHeight) return false;

  const rayon = 2;
  let ok = 0, total = 0;

  for (let dx = -rayon; dx <= rayon; dx++) {
    for (let dy = -rayon; dy <= rayon; dy++) {
      total++;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px < 0 || py < 0 || px >= _collisionWidth || py >= _collisionHeight) continue;

      const idx = (py * _collisionWidth + px) * 4;
      const r = _collisionData[idx];
      const g = _collisionData[idx + 1];
      const b = _collisionData[idx + 2];
      if (!(r > 200 && g < 50 && b < 50)) ok++;
    }
  }

  return (ok / total) > 0.7;
}

// ── Orientation ──────────────────────
// (alpha, beta, gamma) du DeviceOrientationEvent → cap compas dans [0, 360[ (0 = Nord, 90 = Est, horaire).
// ⚠️ Convention W3C : rotation intrinsèque Z-X'-Y'', R = Rz(α)·Rx(β)·Ry(γ).
//   Axe Y (bord SUPÉRIEUR) en monde : (-sin α cos β, cos α cos β, sin β) — γ n'intervient pas. Pose « boussole »
//   (téléphone à plat, haut vers la marche), privilégiée car documentée.
//   Axe -Z (dos, caméra) : (-(cos α sin γ + sin α sin β cos γ), -(sin α sin γ - cos α sin β cos γ)). Pose
//   verticale (haut vers le ciel, dos vers l'avant).
//   Bascule sur |cos β| > 0.5 (plutôt à plat → Y ; sinon → -Z).
// 🩸 Signe de la composante est : `-sin α cos β`. Avec `+`, Est et Ouest s'inversent (tourner à droite fait tourner
// le tracker à gauche) ; aucun terme en γ dans la projection de Y.
function getHeading(alpha, beta, gamma) {
  const a = alpha * Math.PI / 180;
  const b = beta  * Math.PI / 180;
  const g = gamma * Math.PI / 180;

  const sa = Math.sin(a), ca = Math.cos(a);
  const sb = Math.sin(b), cb = Math.cos(b);
  const sg = Math.sin(g), cg = Math.cos(g);

  let east, north;

  if (Math.abs(cb) > 0.5) {
    // Tél plutôt à plat → projection de l'axe Y device (top edge)
    east  = -sa * cb;
    north =  ca * cb;
  } else {
    // Tél plutôt vertical → projection de l'axe -Z device (dos / caméra)
    east  = -(ca * sg + sa * sb * cg);
    north = -(sa * sg - ca * sb * cg);
  }

  let heading = Math.atan2(east, north) * 180 / Math.PI;
  if (heading < 0) heading += 360;
  return heading;
}

// 🩸 Listeners window gardés par flag : requestPermission peut relancer initOrientation/initMotion au changement de
// plan (sinon listeners accumulés, fuite et double traitement de chaque événement).
let _orientationListenerAttached = false;
let _motionListenerAttached      = false;

// ── Correction du cap selon l'orientation de l'écran ──────────────────────
// 🩸 α/β/γ sont relatifs aux axes du DEVICE : le bord court « haut » n'est le haut visuel qu'en portrait normal
// (sinon Nord faux de ±90° ou 180°). `_screenAngle` (0/90/180/270), tenu par orientationchange et
// screen.orientation.change, corrige à la LECTURE (_getCorrectedHeading) ; `direction` reste le cap DEVICE brut
// (comme webkitCompassHeading).
let _screenAngle = 0;

// Angle de l'écran, convention screen.orientation.angle : 0 portrait · 90 paysage primaire (device tourné 90°
// horaire) · 180 portrait inversé · 270 paysage secondaire.
// ⚠️ iOS Safari < 16.4 : window.orientation (0 / 90 / -90 / 180), convention OPPOSÉE en paysage → (360 - v) % 360.
function _getScreenAngleNormalized() {
  if (screen && screen.orientation && typeof screen.orientation.angle === "number") {
    return ((screen.orientation.angle % 360) + 360) % 360;
  }
  if (typeof window.orientation === "number") {
    const v = ((window.orientation % 360) + 360) % 360;
    if (v === 0 || v === 180) return v;
    return (360 - v) % 360;
  }
  return 0;
}

// Cap visuel = (cap device brut + angle écran) % 360 : écran tourné de θ par l'OS, le haut visuel est le bord du
// device décalé de θ. ⚠️ Reste en REPÈRE MONDE (Nord vrai) : c'est celui de la boussole (compass.js). Pour le repère
// PLAN (icône, pas raster), _getPlanRelHeading().
function _getCorrectedHeading() {
  if (typeof direction !== "number" || isNaN(direction)) return 0;
  return ((direction + _screenAngle) % 360 + 360) % 360;
}

// Cap en REPÈRE PLAN = cap monde + offset Nord du plan (0 → identique à _getCorrectedHeading ; 90 → marcher au
// Nord pointe vers la DROITE du plan). Lu par _applyRotationToTrackerMarker, _avancerRaster et le map-matching.
function _getPlanRelHeading() {
  const base = _getCorrectedHeading();
  let northOffset = 0;
  try {
    if (typeof window.getPlanNorthOffset === "function") {
      northOffset = window.getPlanNorthOffset() || 0;
    }
  } catch(e) {}
  return ((base + northOffset) % 360 + 360) % 360;
}

// _screenAngle synchronisé au boot puis à chaque changement d'orientation, avec re-rendu immédiat de l'icône (sans
// attendre le prochain événement device). Idempotent (flag).
let _screenOrientationListenerAttached = false;
function _initScreenOrientationListener() {
  _screenAngle = _getScreenAngleNormalized();
  if (_screenOrientationListenerAttached) return;
  _screenOrientationListenerAttached = true;

  const _onScreenChange = function() {
    _screenAngle = _getScreenAngleNormalized();
    console.log("[Tracking] Screen orientation → angle :", _screenAngle, "°");
    _applyRotationToTrackerMarker();
  };

  if (screen && screen.orientation && typeof screen.orientation.addEventListener === "function") {
    screen.orientation.addEventListener("change", _onScreenChange);
  }
  // Repli : orientationchange (iOS Safari, vieux Android).
  window.addEventListener("orientationchange", _onScreenChange);

  // Nord recalibré : re-rendu de l'icône tout de suite (sinon ancien offset jusqu'au prochain événement device).
  window.addEventListener("kta:northOffsetChange", function() {
    try { _applyRotationToTrackerMarker(); } catch(e) {}
  });
}

// Log du cap limité à 1/s pendant le tracking (visible en debugMode seulement, debug.js), avec l'angle écran.
let _lastHeadingLog = 0;
function _logHeading(heading, source) {
  if (!tracking) return;
  const now = Date.now();
  if (now - _lastHeadingLog < 1000) return;
  _lastHeadingLog = now;
  const corrected = _getCorrectedHeading();
  console.log(
    "[Tracking] Heading :", heading.toFixed(1), "° (source:", source +
    ", screen:", _screenAngle + "°, visuel:", corrected.toFixed(1) + "°)"
  );
}

function initOrientation() {
  // ⚠️ Listener d'écran AVANT le listener device : _screenAngle est juste dès la 1re lecture du cap.
  _initScreenOrientationListener();

  if (_orientationListenerAttached) return;
  _orientationListenerAttached = true;

  // Handler commun à deviceorientation et deviceorientationabsolute. Priorité : 1) webkitCompassHeading (iOS,
  // compas calibré natif, déjà 0 = N horaire) ; 2) calcul depuis (α, β, γ) par getHeading().
  function _onOrientation(event) {
    if (typeof event.webkitCompassHeading === "number" &&
        !isNaN(event.webkitCompassHeading)) {
      direction = event.webkitCompassHeading;
      _logHeading(direction, "webkitCompassHeading");
      _applyRotationToTrackerMarker();
      return;
    }

    if (event.alpha !== null && event.beta !== null && event.gamma !== null) {
      direction = getHeading(event.alpha, event.beta, event.gamma);
      _logHeading(direction, event.absolute ? "calc-absolute" : "calc-relative");
      _applyRotationToTrackerMarker();
    }
  }

  // 🩸 deviceorientationabsolute quand il existe (Android) : α référencé au Nord. `deviceorientation` peut être
  // relatif à la pose au démarrage (le cap dérive). iOS publie webkitCompassHeading sur deviceorientation.
  if ("ondeviceorientationabsolute" in window) {
    window.addEventListener("deviceorientationabsolute", _onOrientation);
    console.log("[Tracking] Orientation : listener deviceorientationabsolute (true North)");
  } else {
    window.addEventListener("deviceorientation", _onOrientation);
    console.log("[Tracking] Orientation : listener deviceorientation (iOS webkitCompassHeading prioritaire si dispo)");
  }
}

// ── Mouvement (détection de pas) ──────────────────────
function initMotion() {
  if (_motionListenerAttached) return;
  _motionListenerAttached = true;
  window.addEventListener("devicemotion", function(event) {
    if (!tracking) return;
    if (!event.accelerationIncludingGravity) return;

    const acc = event.accelerationIncludingGravity;
    const now = Date.now();

    let magnitude = Math.sqrt(
      acc.x * acc.x +
      acc.y * acc.y +
      acc.z * acc.z
    );

    magnitude = Math.round(magnitude * 10) / 10;

    // 🩸 Log limité à 1/s : devicemotion tire à 50-60 Hz et chasserait du tampon de debug.js (300 entrées) les
    // warn/error utiles en quelques secondes.
    if (!window._lastMagnitudeLog || (now - window._lastMagnitudeLog) >= 1000) {
      window._lastMagnitudeLog = now;
      console.log("[Tracking] Magnitude :", magnitude.toFixed(2));
    }

    // ⚠️ La magnitude inclut la gravité (~9,81 au repos) : un seuil < 10 compte des pas à l'arrêt.
    if (
      magnitude > APP_CONFIG.stepThreshold &&
      (now - lastStepTime) > APP_CONFIG.stepCooldown
    ) {
      stepCount++;
      console.log("[Tracking] 👣 Pas détecté :", stepCount);
      avancer();
      lastStepTime = now;
    }
  });
}

// ── Déplacement ──────────────────────
// À chaque pas : smartNav ON et RoadGraph présent → _avancerSurGraphe (map-matching) ; sinon _avancerRaster.
function avancer() {
  if (APP_CONFIG.smartNav === true &&
      window.RoadGraph && typeof window.RoadGraph.matchPosition === "function") {
    _avancerSurGraphe();
  } else {
    _avancerRaster();
  }
}

// Navigation à l'estime (PDR) pure, contrainte par le raster de collision (estAccessible).
function _avancerRaster() {
  const scale = APP_CONFIG.scale;
  const pasMetre = APP_CONFIG.stepLength;

  let distance = pasMetre * scale;

  // 🩸 Le pas suit le cap en REPÈRE PLAN, comme l'icône : le cap DEVICE brut fait partir le pas de travers en
  // paysage (invisible en portrait), et sans l'offset Nord il diverge de l'icône sur un plan non orienté Nord.
  let rad = _getPlanRelHeading() * Math.PI / 180;

  let newX = position.x + distance * Math.sin(rad);
  let newY = position.y - distance * Math.cos(rad);

  // Point de timeline seulement si le pas est appliqué (sinon doublon).
  const _stepApplied = estAccessible(newX, newY);
  if (_stepApplied) {
    position.x = newX;
    position.y = newY;
    if (_positionConfirmee) _positionConfirmeeTs = Date.now();   // dernier mouvement connu
  } else {
    console.log("[Tracking] Collision !");
  }

  updateMap();

  if (_stepApplied) {
    _pushTimelinePoint("pdr");
  }
}

// Map-matching : position PDR brute (même calcul que le raster), CALÉE sur le réseau de tracés (RoadGraph).
// Sur le réseau → projection sur la galerie (dérive latérale annulée), segment mémorisé. Hors réseau → repli sur
// _avancerRaster, qui recalcule la MÊME position brute (position n'a pas bougé).
function _avancerSurGraphe() {
  const scale      = APP_CONFIG.scale;
  const distance   = APP_CONFIG.stepLength * scale;
  // Cap en repère PLAN, comme _avancerRaster et RoadGraph.
  const headingDeg = _getPlanRelHeading();
  const rad        = headingDeg * Math.PI / 180;
  const rawX = position.x + distance * Math.sin(rad);
  const rawY = position.y - distance * Math.cos(rad);

  // Le cap départage les branches aux croisements.
  const m = window.RoadGraph.matchPosition(rawX, rawY, _navSegIdx, headingDeg);

  if (m && m.onNetwork) {
    position.x = m.matched.x;
    position.y = m.matched.y;
    _navSegIdx = m.segIdx;
    _basculerNiveauSiTraversee(m);
    updateMap();
    _pushTimelinePoint("pdr");
  } else {
    _navSegIdx = -1;
    _avancerRaster();
  }
}

// Bascule AUTO du niveau au franchissement d'une jonction. Le map-matching rouvre tous les niveaux tant que le
// segment précédent est "transit" (roadGraph > _levelEligible) : atterrir sur un niveau NUMÉRIQUE différent de
// l'actif = sortie de puits ou d'escalier.
// Auto plutôt que confirmation (décision produit) : en navigation, mains prises, une modale est ingérable.
// ktaSetActiveLevel fait une UNION sur visibleLevels : l'étage quitté reste affiché, toast + pastille le disent.
// ⚠️ Risque résiduel : un point créé juste après une bascule hérite du nouveau niveau (editor.js) ; retour
// manuel par le contrôle Niveau.
// ⚠️ Seulement en multi-niveau ET smartNav ON (appelée depuis _avancerSurGraphe).
function _basculerNiveauSiTraversee(m) {
  if (!m || !Number.isInteger(m.level)) return;   // "transit" ou null → on traverse encore
  const cfg = window.APP_CONFIG;
  if (!cfg || !cfg.multiLevel) return;
  const actif = Number.isInteger(cfg.activeLevel) ? cfg.activeLevel : 0;
  if (m.level === actif) return;
  if (typeof window.ktaSetActiveLevel !== "function") return;

  window.ktaSetActiveLevel(m.level, { source: "nav-jonction" });
  console.log("[Tracking] Jonction franchie → niveau", m.level);

  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    const t = (window.I18n && typeof window.I18n.t === "function")
      ? window.I18n.t("tracker.nav.niveauAuto", { level: String(m.level) })
      : "🏗️ Niveau " + m.level + " — jonction franchie";
    window.OOMGuard.showToast(t, "info");
  }
}

// Hook émis à CHAQUE recalage (clic carte, « Je suis ici », arrivée de portail via recalerTrackerSurPoint).
// source : "click" | "point". Consommateurs : interfaceItineraire.js (window._onTrackerRecale : replanifie et valide
// les étapes) et InterPlanRoute (re-propose la traversée sur le portail de sortie).
function _notifierRecalage(x, y, source, opts) {
  if (typeof window._onTrackerRecale === "function") {
    try { window._onTrackerRecale(x, y, source, opts); }
    catch(e) { console.warn("[Tracking] hook recalage échoué :", e); }
  }
  if (window.InterPlanRoute && typeof window.InterPlanRoute.onTrackerRecale === "function") {
    try { window.InterPlanRoute.onTrackerRecale(x, y, source); }
    catch(e) { console.warn("[Tracking] hook recalage portail échoué :", e); }
  }
}

// ── Mise à jour de la carte ──────────────────────
function updateMap() {
  if (!markerPosition) return;

  let latlng = convertCoord(position.x, position.y);

  markerPosition.setLatLng(latlng);

  if (polyline) {
    // 🩸 Tracé MULTI-SEGMENT possible (_rebuildTrailFromTimeline) : addLatLng() ajoute au PREMIER anneau par
    // défaut, on cible le DERNIER.
    const rings = polyline.getLatLngs();
    if (rings.length > 0 && Array.isArray(rings[0])) {
      polyline.addLatLng(latlng, rings[rings.length - 1]);
    } else {
      polyline.addLatLng(latlng);
    }
  }

  // Mode « plan orienté » : un pas sert au recentrage ET au gel à l'arrêt (sans pas récent la vue cesse de
  // pivoter, sinon le bruit du magnétomètre la ferait tourner pendant une pause).
  if (window.MapBearing) {
    try { window.MapBearing.onStep(latlng); } catch(e) {}
  }

  // Guidage : chaque pas ou recalage fait avancer le bandeau « dans X m… » (js/itiGuidage.js).
  if (window.ItiGuidage && typeof window.ItiGuidage.onPosition === "function") {
    try { window.ItiGuidage.onPosition(position); } catch(e) {}
  }

  // Waypoint d'itinéraire atteint (100 px) → vibration (si pref ON).
  _checkWaypointProximity();
}

// ── Timeline du parcours et contrôles ──────────────────────
// Timeline datée de chaque point (t, deltaMs, type pdr/recalage/start, niveau en multi-niveau), persistée par
// SessionPersist / SessionBackups : elle survit aux reloads.
// 🩸 Plafond dur + décimation : sans plafond, une session de 6 h dépasse le quota localStorage (sérialisée toutes
// les 1,5 s) → QuotaExceededError et session non sauvée pendant des heures. Les ancres (start, recalage), qui
// marquent les ruptures lues par heatmap et replay, sont TOUJOURS gardées ; seuls les `pdr` anciens sont décimés.
const MAX_TIMELINE_ENTRIES = 20000;   // plafond (~2,4 Mo)
const TIMELINE_TRIM_TO     = 18000;   // taille après décimation
let _trackingTimeline = [];
let _trackingStartTs  = null;

// Garde toutes les ancres + les `pdr` les plus récents dans le budget, puis refusionne par ordre temporel.
function _decimateTimeline() {
  if (_trackingTimeline.length <= MAX_TIMELINE_ENTRIES) return;
  const anchors = [];
  const pdrs    = [];
  _trackingTimeline.forEach(function(e) {
    if (e.type === "start" || e.type === "recalage") anchors.push(e);
    else pdrs.push(e);
  });
  const budgetForPdr = Math.max(0, TIMELINE_TRIM_TO - anchors.length);
  const keptPdrs = pdrs.length > budgetForPdr ? pdrs.slice(pdrs.length - budgetForPdr) : pdrs;
  const merged = anchors.concat(keptPdrs).sort(function(a, b) { return a.t - b.t; });
  _trackingTimeline = merged;
  console.log("[Tracking] Timeline décimée à", _trackingTimeline.length, "entries (cap", MAX_TIMELINE_ENTRIES, ")");
  // 🩸 Polyline reconstruit depuis la timeline décimée : sinon addLatLng (updateMap) continue d'accumuler toutes les
  // positions → fuite linéaire.
  _rebuildTrailFromTimeline();
}

// Pousse une entrée datée à la position courante. ⚠️ `extra` : `src` ("point" = « Je suis ici », "click" = clic
// carte) et `tp` (téléportation : arrivée de portail, jamais une distance parcourue). Rend l'entrée, ou null si la
// position n'est pas exploitable.
function _pushTimelinePoint(type, extra) {
  if (typeof position.x !== "number" || typeof position.y !== "number") return null;
  const now = Date.now();
  if (_trackingStartTs === null) _trackingStartTs = now;
  const entry = {
    x: position.x,
    y: position.y,
    t: now,
    deltaMs: now - _trackingStartTs,
    type: type || "pdr"
  };
  if (extra) Object.assign(entry, extra);
  if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
    entry.level = typeof trackerLevel === "number" ? trackerLevel : (window.APP_CONFIG.activeLevel || 0);
  }
  _trackingTimeline.push(entry);
  // Décimation O(N), déclenchée une fois tous les ~2000 points : coût amorti négligeable.
  if (_trackingTimeline.length > MAX_TIMELINE_ENTRIES) {
    _decimateTimeline();
  }
  return entry;
}

function startTracking() {
  tracking = true;
  _navSegIdx = -1;
  // Graphe du réseau construit HORS du chemin chaud (croisements en O(N²) : sinon à-coup au 1er pas).
  if (APP_CONFIG.smartNav === true && window.RoadGraph &&
      typeof window.RoadGraph.getGraph === "function") {
    try { window.RoadGraph.getGraph(); } catch(e) {}
  }
  // ⚠️ La timeline n'est PAS vidée au Play : elle est CUMULATIVE (survit au reload et aux cycles Play/Stop,
  // heatmap multi-sessions). La reprise est marquée par une ancre "start" (rupture de segment au rendu). Tracé
  // vierge = reset de position / « effacer l'historique ».
  if (_trackingStartTs == null) _trackingStartTs = Date.now();
  _pushTimelinePoint("start");

  // Le tracker démarre sur le niveau actif.
  if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
    trackerLevel = window.APP_CONFIG.activeLevel || 0;
  }
  _appliquerFiltreNiveauSurTracker();
  // Rotation tout de suite si le cap est déjà connu (sinon au prochain deviceorientation).
  _applyRotationToTrackerMarker();
  // Le mode « plan orienté » ne vit QUE pendant le tracking.
  if (window.MapBearing) { try { window.MapBearing.onTrackingChange(true); } catch(e) {} }
  console.log("[Tracking] ON (level:", trackerLevel + ")");
}

function stopTracking() {
  tracking = false;
  _navSegIdx = -1;
  _resetRotationTrackerMarker();
  // La vue revient droite, même si le réglage « plan orienté » reste ON (repris au prochain Play).
  if (window.MapBearing) { try { window.MapBearing.onTrackingChange(false); } catch(e) {} }
  console.log("[Tracking] OFF");
}

// ── Permission capteurs (iOS) ──────────────────────
// ⚠️ Rend TOUJOURS une Promise<boolean>. 🩸 L'appelant (interface.js > _doStart, compass.js > show) attend le
// résultat et n'affiche « actif » que sur `true` : sinon un refus iOS laisse la pastille ON et zéro pas, sans un mot.
function requestPermission() {
  if (typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === 'function') {
    return DeviceMotionEvent.requestPermission().then(function(response) {
      if (response === 'granted') {
        initOrientation();
        initMotion();
        return true;
      }
      console.warn("[Tracking] Permission capteurs refusée :", response);
      return false;
    }).catch(function(err) {
      // Hors geste utilisateur, ou demande déjà tranchée : iOS rejette.
      console.warn("[Tracking] Permission capteurs : demande échouée :", err);
      return false;
    });
  }
  initOrientation();
  initMotion();
  return Promise.resolve(true);
}

// ── Reset de position ──────────────────────
function resetTrackingPosition() {
  position.x = APP_CONFIG.startX;
  position.y = APP_CONFIG.startY;
  _positionConfirmee   = false;   // retour au départ du plan = plus rien de confirmé
  _positionConfirmeeTs = null;
  _navSegIdx = -1;
  stepCount = 0;

  if (polyline) {
    polyline.setLatLngs([]);
  }

  // Timeline remise à zéro (nouveau cycle) ; tracking actif → ancre "start" à la nouvelle origine.
  _trackingTimeline = [];
  _trackingStartTs  = null;
  if (tracking) {
    _trackingStartTs = Date.now();
    _pushTimelinePoint("start");
  }

  updateMap();
  window.map.setView(convertCoord(position.x, position.y), 0);
}

// ── Getters et exports ──────────────────────
function getStepCount() {
  return stepCount;
}

window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.initTracking = initTracking;
window.requestPermission = requestPermission;
window.resetTrackingPosition = resetTrackingPosition;
window.getStepCount = getStepCount;
window.initCollisionCache = initCollisionCache;

// ── Lecture pour les autres modules (boussole, exports, recherche) ──────────────────────
// Cap courant en degrés (0 = N, 90 = E, horaire), corrigé de l'orientation écran. ⚠️ REPÈRE MONDE (Nord vrai) :
// pour la boussole (compass.js). Repère plan (icône, mini-carte d'urgence) : window.getPlanRelHeading. Disponible
// hors tracking dès que requestPermission a attaché les listeners.
window.getCurrentHeading = function() {
  return _getCorrectedHeading();
};

// Cap en REPÈRE PLAN (offset Nord du plan inclus) : emergencyMode.js, mini-cartes, exports.
window.getPlanRelHeading = function() {
  return _getPlanRelHeading();
};

// Position courante en coordonnées plan.
window.getTrackingPosition = function() {
  return { x: position.x, y: position.y };
};

// Position confirmée (recalage) ou encore le départ du plan ? `ts` = dernier mouvement connu (ms).
// Règle (décision produit) : suiviActif OU confirmee → on part de là sans question ; sinon, et seulement sinon,
// on demande « Où es-tu ? ».
window.getTrackingPositionEtat = function() {
  return { confirmee: _positionConfirmee, ts: _positionConfirmeeTs, suiviActif: tracking === true };
};

// État « Play » du tracker (LED ON/OFF de refonteInterface.js > refreshStatusBar).
window.getTrackingActif = function() {
  return tracking === true;
};

window.getTrackerLevel = function() {
  return trackerLevel;
};

// Points (coordonnées plan) du tracé visible.
window.getTrackingPath = function() {
  if (!polyline) return [];
  const latlngs = polyline.getLatLngs();
  if (!latlngs || latlngs.length === 0) return [];
  return latlngs.map(function(ll) {
    return { x: ll.lng, y: APP_CONFIG.imageHeight - ll.lat };
  });
};

// Timeline complète (copie), qui survit aux recalages contrairement au tracé visible.
// ⚠️ Format : [{x, y, t (ms epoch), deltaMs, type: "start"|"pdr"|"recalage", level? (multi-niveau), src?, tp?,
// estM?, estSrc?}]
window.getTrackingTimeline = function() {
  return _trackingTimeline.slice();  // copie défensive
};

window.getTrackingStartTs = function() {
  return _trackingStartTs;
};

// Distance MESURÉE au podomètre (m), d'après la timeline (stats, replay).
window.getTrackingDistanceM = function() {
  if (_trackingTimeline.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < _trackingTimeline.length; i++) {
    const a = _trackingTimeline[i - 1];
    const b = _trackingTimeline[i];
    // Segments touchant une ancre sautés : un recalage peut être une téléportation.
    if (b.type === "recalage" || a.type === "recalage" || a.type === "start") continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) || 1;
  return total / scale;
};

// ── Distance estimée entre ancres ──────────────────────
// Le podomètre seul donne 0 m à une sortie menée de « Je suis ici » en « Je suis ici » (le Carnet la jetterait).
// Règle : un tronçon entre deux ancres est estimé UNIQUEMENT si aucun pas PDR ne s'y trouve (sinon le podomètre
// fait foi, jamais de double comptage).
// Mesure (décision produit) : longueur du chemin RÉEL sur le réseau (Pathfinder) — à vol d'oiseau, 40 m dans un
// labyrinthe peuvent en valoir 300. Repli vol d'oiseau si un bout n'accroche pas le réseau.
// Jamais estimés : le clic carte (`src: "click"`, une correction) et l'arrivée de portail (`tp`).
// La valeur vit sur l'ancre (`estM`, `estSrc`) : la décimation garde toutes les ancres.
// ⚠️ Volontairement SÉPARÉE de getTrackingDistanceM (mesuré ≠ estimé, plusieurs modules lisent le mesuré) ; le
// total est getTrackingDistanceTotaleM().

// Chemin réseau > 30× le vol d'oiseau = artefact de graphe (galerie mal reliée) : on garde le vol d'oiseau,
// sous-estimer est moins grave qu'inventer 2 km.
const EST_RATIO_MAX = 30;

function _scaleOuUn() {
  const s = (window.APP_CONFIG && window.APP_CONFIG.scale) || 1;
  return (isFinite(s) && s > 0) ? s : 1;
}

// 🩸 Budget de l'affinage : Pathfinder reconstruit TOUT son graphe à chaque appel (croisements en O(N²), sans
// cache, pathfinder.js > _buildGraph). Au-delà, vol d'oiseau plutôt que figer l'app.
const MAX_PTS_AFFINAGE = 20000;

// 🩸 Chemin CHAUD (clic « Je suis ici ») : AUCUN calcul de réseau. La replanification d'itinéraire lance déjà son
// Dijkstra juste après ; en lancer un ici double l'attente. Vol d'oiseau tout de suite, affinerEstimationsTracker
// repasse plus tard, hors du geste.
function _estimerSegmentDepuisAncre(entry) {
  if (!entry || entry.tp) return;
  const i = _trackingTimeline.indexOf(entry);
  if (i <= 0) return;
  const prev = _trackingTimeline[i - 1];
  // Précédent pas une ancre → des pas PDR ont mesuré ce tronçon.
  if (!prev || (prev.type !== "recalage" && prev.type !== "start")) return;

  const volPx = Math.hypot(entry.x - prev.x, entry.y - prev.y);
  if (!(volPx > 0)) return;
  entry.estM   = volPx / _scaleOuUn();
  entry.estSrc = "vol";
}

// Chemin FROID : tronçons « vol d'oiseau » repassés en distance RÉELLE sur le réseau, à l'archivage d'une sortie
// (journal.js), jamais au clic.
// 🩸 `roads` est FOURNI par l'appelant : l'affinage tourne pendant/après un changement de plan, getRoads() lirait
// le plan SUIVANT.
// Un appel computeRouteOnRoads par « run » d'ancres consécutives (graphe construit une fois pour la chaîne).
// ⚠️ Il ne rend qu'un total, réparti sur les tronçons au prorata du vol d'oiseau : la SOMME est exacte (celle du
// carnet), le détail par ancre est une approximation assumée.
window.affinerEstimationsTracker = function(roads, opts) {
  opts = opts || {};
  const bilan = { runs: 0, avantM: 0, apresM: 0, skipped: null, trace: null };
  if (!window.Pathfinder || typeof window.Pathfinder.computeRouteOnRoads !== "function") {
    bilan.skipped = "pathfinder-absent";
    return Promise.resolve(bilan);
  }
  if (!Array.isArray(roads) || roads.length === 0) {
    bilan.skipped = "aucune-road";
    return Promise.resolve(bilan);
  }
  let nbPts = 0;
  for (let r = 0; r < roads.length; r++) {
    if (roads[r] && Array.isArray(roads[r].points)) nbPts += roads[r].points.length;
  }
  // `force` (bouton « Affiner le tracé ») : le budget protège l'archivage automatique, pas un calcul demandé en
  // connaissance de cause.
  const plafond = Number(opts.maxPts) || MAX_PTS_AFFINAGE;
  if (nbPts > plafond && !opts.force) {
    console.log("[Tracking] Affinage réseau ignoré : " + nbPts + " sommets (> " + plafond +
                ") — vol d'oiseau conservé.");
    bilan.skipped = "trop-gros";
    bilan.nbPts   = nbPts;
    return Promise.resolve(bilan);
  }

  // Runs = ancres estimées consécutives (indices adjacents).
  const runs = [];
  let courant = null;
  for (let i = 1; i < _trackingTimeline.length; i++) {
    const e = _trackingTimeline[i];
    const aCombler = !!(e && isFinite(e.estM) && e.estM > 0 && e.estSrc === "vol");
    if (aCombler) {
      if (courant && courant.fin === i - 1) courant.fin = i;
      else { courant = { debut: i, fin: i }; runs.push(courant); }
    } else courant = null;
  }
  if (runs.length === 0) return Promise.resolve(bilan);

  const sc = _scaleOuUn();
  runs.forEach(function(run) {
    const ancres = [];
    for (let i = run.debut - 1; i <= run.fin; i++) {
      ancres.push({ x: _trackingTimeline[i].x, y: _trackingTimeline[i].y });
    }
    let sumVolM = 0;
    for (let i = run.debut; i <= run.fin; i++) sumVolM += _trackingTimeline[i].estM;
    if (!(sumVolM > 0)) return;

    let res;
    try {
      res = window.Pathfinder.computeRouteOnRoads(ancres, roads, opts.routeOpts || {});
    } catch (e) {
      // Hors réseau ou sans chemin : le vol d'oiseau reste (voulu).
      if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
        console.log("[Tracking] Affinage impossible sur un run :", e && e.message);
      }
      return;
    }
    if (!res || !isFinite(res.totalDistance) || res.totalDistance <= 0) return;
    const totalM = res.totalDistance / sc;
    if (totalM > sumVolM * EST_RATIO_MAX) {
      console.warn("[Tracking] Chemin réseau anormal (" + Math.round(totalM) + " m pour " +
                   Math.round(sumVolM) + " m à vol d'oiseau) — vol d'oiseau conservé.");
      return;
    }
    const facteur = totalM / sumVolM;
    for (let i = run.debut; i <= run.fin; i++) {
      _trackingTimeline[i].estM   = _trackingTimeline[i].estM * facteur;
      _trackingTimeline[i].estSrc = "reseau";
    }
    // Géométrie gardée (`res.path` = [{x, y}, …]) pour reconstruire le tracé de la sortie.
    if (Array.isArray(res.path) && res.path.length >= 2) run.path = res.path;
    bilan.runs++;
    bilan.avantM += sumVolM;
    bilan.apresM += totalM;
  });

  if (bilan.runs > 0) {
    bilan.trace = _construireTraceAffinee(runs, opts.depuisMs);
    console.log("[Tracking] Affinage réseau : " + bilan.runs + " tronçon(s) — " +
                Math.round(bilan.avantM) + " m → " + Math.round(bilan.apresM) + " m");
  }
  return Promise.resolve(bilan);
};

// Tracé RECONSTRUIT : la timeline, chaque tronçon estimé remplacé par son chemin réseau.
// ⚠️ HYPOTHÈSE, pas mesure (le plus court chemin ignore détours et demi-tours). Il vit dans le CARNET seulement
// (décision produit) : ni exports GPX/KMZ, ni heatmap, ni replay, qui ne montrent que du mesuré. Le tracé brut
// (`track`) n'est jamais écrasé.
function _construireTraceAffinee(runs, depuisMs) {
  const parDebut = {};
  runs.forEach(function(r) { if (r.path) parDebut[r.debut - 1] = r; });
  const seuil = Number(depuisMs) || 0;
  const out = [];
  function pousser(x, y, level) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - x) < 0.01 && Math.abs(last.y - y) < 0.01) return;
    const p = { x: x, y: y };
    if (typeof level === "number") p.level = level;
    out.push(p);
  }
  for (let i = 0; i < _trackingTimeline.length; i++) {
    const e = _trackingTimeline[i];
    if (!e) continue;
    const run = parDebut[i];
    if (run) {
      // Run commencé avant la fenêtre : inclus entier (le couper dessinerait un saut).
      run.path.forEach(function(p) { pousser(p.x, p.y); });
      i = run.fin;
      continue;
    }
    if (seuil && Number(e.t) < seuil) continue;
    pousser(e.x, e.y, e.level);
  }
  return out.length >= 2 ? out : null;
}

// Tronçons encore « vol d'oiseau » (grise le bouton « Affiner le tracé » s'il n'y en a pas).
window.getTrackingTronconsAAffiner = function() {
  let n = 0;
  for (let i = 0; i < _trackingTimeline.length; i++) {
    const e = _trackingTimeline[i];
    if (e && isFinite(e.estM) && e.estM > 0 && e.estSrc === "vol") n++;
  }
  return n;
};

// Somme des tronçons estimés (0 si le podomètre a tout couvert).
window.getTrackingDistanceEstimeeM = function() {
  let total = 0;
  for (let i = 0; i < _trackingTimeline.length; i++) {
    const e = _trackingTimeline[i];
    if (e && isFinite(e.estM) && e.estM > 0) total += e.estM;
  }
  return total;
};

// Distance de la sortie lue par le Carnet et les stats : mesurée + estimée.
window.getTrackingDistanceTotaleM = function() {
  return window.getTrackingDistanceM() + window.getTrackingDistanceEstimeeM();
};

// « Je suis ici » validés (hors clics carte et téléportations) : signal de terrain sans ambiguïté
// (journal.js > _classer).
window.getTrackingValidations = function() {
  let n = 0;
  for (let i = 0; i < _trackingTimeline.length; i++) {
    const e = _trackingTimeline[i];
    if (e && e.type === "recalage" && e.src === "point" && !e.tp) n++;
  }
  return n;
};

// Vide la timeline (changement de plan, effacement de l'historique).
window.resetTrackingTimeline = function() {
  _trackingTimeline = [];
  _trackingStartTs  = null;
};

// Restauration depuis SessionPersist / SessionBackups : la timeline survit aux reloads (heatmap multi-sessions).
// Seules les entrées à x/y/t/type valides sont gardées (payload tiers possible).
// ⚠️ Champs repris : x, y, t, type, deltaMs, level, src (« click » | « point »), tp (téléportation),
// estM/estSrc (distance estimée « vol » | « reseau ») — chacun seulement s'il est valide. Sans eux, les recalages
// sur point, les téléportations et la distance estimée sont sous-comptés après un rechargement.
// Garde-fou : scripts/check-timeline-restore.js.
window.setTrackingTimeline = function(timeline, startTs) {
  if (!Array.isArray(timeline)) return;
  const cleaned = [];
  timeline.forEach(function(e) {
    if (!e || typeof e !== "object") return;
    if (typeof e.x !== "number" || typeof e.y !== "number") return;
    if (typeof e.t !== "number") return;
    if (typeof e.type !== "string") return;
    const out = { x: e.x, y: e.y, t: e.t, type: e.type };
    if (typeof e.deltaMs === "number") out.deltaMs = e.deltaMs;
    if (Number.isInteger(e.level))     out.level   = e.level;
    if (e.src === "point" || e.src === "click") out.src = e.src;
    if (e.tp === 1)                    out.tp      = 1;
    if (typeof e.estM === "number" && Number.isFinite(e.estM) && e.estM >= 0) out.estM = e.estM;
    if (e.estSrc === "vol" || e.estSrc === "reseau") out.estSrc = e.estSrc;
    cleaned.push(out);
  });
  _trackingTimeline = cleaned;
  _trackingStartTs  = (typeof startTs === "number") ? startTs : null;
  // 🩸 Plafond appliqué AU RESTORE aussi : un payload cumulé ou ancien peut injecter 50k+ entrées (OOM au boot).
  if (_trackingTimeline.length > MAX_TIMELINE_ENTRIES) {
    console.warn("[Tracking] Restore timeline trop grande :", _trackingTimeline.length, "→ décimation");
    _decimateTimeline();
  }
  // ⚠️ Tracé visible et marqueur reconstruits : le restore tourne APRÈS initTracking (main.js), polyline et
  // markerPosition existent.
  _rebuildTrailFromTimeline();
  // Vue recentrée sur la dernière position connue (sinon elle reste au départ du plan, loin du marqueur). Timeline
  // vide → rien ne bouge (voulu).
  if (_trackingTimeline.length > 0 && window.map && typeof convertCoord === "function") {
    try { window.map.setView(convertCoord(position.x, position.y), window.map.getZoom()); } catch(e) {}
  }
};

// Reconstruit TOUT le tracé visible (pas seulement le dernier segment) en segments coupés à chaque ancre
// "recalage"/"start" — pas de ligne fantôme de téléportation —, marqueur au dernier point connu.
function _rebuildTrailFromTimeline() {
  if (!_trackingTimeline || _trackingTimeline.length === 0) return;
  const segments = [];
  let cur = [];
  for (let i = 0; i < _trackingTimeline.length; i++) {
    const e = _trackingTimeline[i];
    if (e.type === "recalage" || e.type === "start") {
      // Rupture : segment clos (≥ 2 points), le suivant part DE l'ancre.
      if (cur.length >= 2) segments.push(cur);
      cur = [convertCoord(e.x, e.y)];
    } else {
      cur.push(convertCoord(e.x, e.y));
    }
  }
  if (cur.length >= 2) segments.push(cur);

  const last = _trackingTimeline[_trackingTimeline.length - 1];
  position.x = last.x;
  position.y = last.y;
  // Un recalage dans la timeline prouve que l'utilisateur s'est situé : position confirmée, datée du dernier point.
  if (_trackingTimeline.some(function(e) { return e && e.type === "recalage"; })) {
    _marquerPositionConfirmee(typeof last.t === "number" ? last.t : Date.now());
  }
  try {
    if (polyline) polyline.setLatLngs(segments);
    if (markerPosition) markerPosition.setLatLng(convertCoord(position.x, position.y));
    if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
      console.log("[Tracking] Tracé restauré :", _trackingTimeline.length, "pts /",
                  segments.length, "segment(s)");
    }
  } catch(e) {
    console.warn("[Tracking] Reconstruction tracé échouée :", e);
  }
}

// Recale le tracker sur les coordonnées exactes d'un point (« Je suis ici » de la popup, utils.js >
// buildPointPopupHtml ; arrivée de portail ; picker « Où es-tu ? »). Tracé visible et compteur de pas remis à zéro.
// ⚠️ `opts.teleport` : déplacement NON parcouru (portail) → ancre `tp`, jamais estimée. La source reste "point" pour
// les consommateurs du hook (validation d'étape comprise). `opts.sansReplan` : voir Mode Secours.
window.recalerTrackerSurPoint = function(x, y, level, opts) {
  if (typeof x !== "number" || typeof y !== "number") return;
  position.x = x;
  position.y = y;
  _marquerPositionConfirmee();
  _navSegIdx = -1;
  if (polyline) polyline.setLatLngs([]);
  stepCount = 0;

  const _ancre = _pushTimelinePoint(
    "recalage",
    (opts && opts.teleport) ? { src: "point", tp: 1 } : { src: "point" }
  );
  // Distance depuis l'ancre précédente si le podomètre n'a rien vu entre les deux.
  if (_ancre) { try { _estimerSegmentDepuisAncre(_ancre); } catch(e) {} }
  // Niveau du point s'il en porte un, sinon le niveau actif (le point cliqué est visible).
  if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
    if (Number.isInteger(level)) {
      trackerLevel = level;
    } else {
      trackerLevel = window.APP_CONFIG.activeLevel || 0;
    }
    console.log("[Tracking] Recalé sur point au niveau :", trackerLevel);
  }
  updateMap();
  _appliquerFiltreNiveauSurTracker();
  if (window.modeRecalage) window.modeRecalage = false;
  if (window.map) {
    try {
      const latlng = convertCoord(x, y);
      window.map.setView(latlng, window.map.getZoom(), { animate: true });
    } catch(e) {}
  }
  console.log("[Tracking] Recalé sur point :", x, y);
  // Vibration discrète de confirmation (sans effet si pref OFF ou iOS).
  if (window.kta_vibrate) window.kta_vibrate.light();
  // Replanification + validation d'étape (coordonnées exactes d'un point).
  _notifierRecalage(x, y, "point", opts);   // opts.sansReplan : cf Mode Secours (étape validée)
};

// Proximité des waypoints de l'itinéraire actif, à chaque updateMap(). Hystérésis : vibre UNE fois en entrant à
// 100 px, réarmé au-delà de 200 px (pas de vibration continue en stagnant).
const _vibratedNearWaypoints = new Set();  // clés "x_y" des waypoints déjà signalés

function _checkWaypointProximity() {
  if (typeof position.x !== "number" || typeof position.y !== "number") return;
  if (!window.kta_vibrate || typeof window.getItineraireWaypoints !== "function") return;
  const wps = window.getItineraireWaypoints();
  if (!wps || wps.length === 0) {
    // Plus d'itinéraire : le prochain repart de zéro.
    if (_vibratedNearWaypoints.size > 0) _vibratedNearWaypoints.clear();
    return;
  }
  wps.forEach(function(wp) {
    if (typeof wp.x !== "number" || typeof wp.y !== "number") return;
    const key = wp.x + "_" + wp.y;
    const dx = position.x - wp.x;
    const dy = position.y - wp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 100 && !_vibratedNearWaypoints.has(key)) {
      _vibratedNearWaypoints.add(key);
      window.kta_vibrate.medium();  // 100ms vibration distincte
      if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
        console.log("[Tracking] Vibration : waypoint atteint à", Math.round(dist), "px (wp", wp.x, wp.y, ")");
      }
    } else if (dist > 200 && _vibratedNearWaypoints.has(key)) {
      _vibratedNearWaypoints.delete(key);
    }
  });
}