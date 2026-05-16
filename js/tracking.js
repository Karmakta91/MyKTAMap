// =========================
// ETAT
// =========================
window.modeRecalage = false;
let tracking = false;

let position = {
  x: APP_CONFIG.startX,
  y: APP_CONFIG.startY
};

let direction = 0;

let markerPosition;
let polyline;
let lastStepTime = 0;
let stepCount = 0;

// 🏗️ Multi-niveau (v148) : niveau courant du tracker. Mis a jour :
//   - Au demarrage (startTracking) → snapshot de APP_CONFIG.activeLevel
//   - Au recalage clic carte → snapshot de APP_CONFIG.activeLevel
//   - Au recalage sur point (popup "📍 Je suis ici") → snapshot du level du point
// Si multiLevel = false → reste a 0 sans effet.
let trackerLevel = 0;

// =========================
// INIT
// =========================
function initTracking() {
  // Reset complet — la map a peut-être changé (changement de plan)
  // On re-crée tout depuis zéro avec les nouvelles valeurs APP_CONFIG
  position.x = APP_CONFIG.startX;
  position.y = APP_CONFIG.startY;
  stepCount  = 0;
  lastStepTime = 0;
  direction  = 0;
  tracking   = false;
  window.modeRecalage = false;

  // Vider l'ancien cache collision (les dimensions/scales peuvent différer)
  _collisionData   = null;
  _collisionWidth  = 0;
  _collisionHeight = 0;
  _collisionScaleX = 1;
  _collisionScaleY = 1;

  // Charger le cache collision avec les bonnes dimensions du nouveau plan
  initCollisionCache();

  const iconeTracker = window.iconeTrack;
  const latlng = convertCoord(position.x, position.y);

  markerPosition = L.marker(latlng, { icon: iconeTracker }).addTo(window.map);
  polyline       = L.polyline([], { weight: 3 }).addTo(window.map);

  window.map.setView(latlng, 0);

  window.map.on('click', function(e) {
    if (!window.modeRecalage) return;

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    const x = lng;
    const y = APP_CONFIG.imageHeight - lat;

    position.x = x;
    position.y = y;

    // 🏗️ Multi-niveau (v148) : recalage clic carte → tracker passe au niveau actif
    // ("pouvoir se relocaliser selon le niveau" — request user). Si multiLevel
    // est OFF, trackerLevel reste a 0 sans effet visible.
    if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
      trackerLevel = window.APP_CONFIG.activeLevel || 0;
      console.log("[Tracking] Recalé sur niveau :", trackerLevel);
    }

    updateMap();
    _appliquerFiltreNiveauSurTracker();
    console.log("[Tracking] Recalé en :", x, y);

    if (polyline) polyline.setLatLngs([]);
    stepCount = 0;
  });
}

// 🧭 v158/v159/v160 : rotation de l'icone tracker selon le heading.
//
// IMPLEMENTATION : le marker tracker utilise un L.divIcon (cf. map.js) qui
// produit un DOM <div class="kta-tracker-divicon"><img class="kta-tracker-img"></div>.
// Le DIV recoit le transform: translate3d(...) de Leaflet pour le placement
// geo. L'<img> ENFANT recoit notre transform: rotate(heading deg) - les 2 sont
// independants, pas de conflit. La transition CSS (0.3s) est definie en CSS
// (.kta-tracker-img).
//
// HISTOIRE :
//   v158 - tentative L.icon : rotate ecrasait le translate Leaflet → icone
//          colait au (0,0). Fix v159.
//   v159 - passage en divIcon avec wrapper. Position OK mais tremblement
//          de l'icone : le magnetometre genere du bruit haute frequence
//          (±2-5° meme phone immobile) qui passait le throttle 0.5°.
//   v160 - anti-jitter avec 3 techniques combinees :
//          1. Smoothing exponentiel (alpha=0.25) : lisse les valeurs brutes
//             AVANT de les appliquer. Gere le wrap 0-360° correctement.
//          2. Throttle 2° APRES smoothing : skip DOM update si delta < 2°.
//          3. Transition CSS 0.3s : absorbe visuellement les sauts residuels.
//
// Reset complet (smoothed + last) au stopTracking pour repartir propre.

// 🐛 v161 fix : sentinel null au lieu de -999 (mon wrap-fix circulaire sur
// delta > 180 retournait 360-999 = -639 < 2 → return immediat → icone bloquee).
let _trackerRotationLast    = null;  // derniere valeur appliquee au DOM (null = jamais)
let _trackerHeadingSmoothed = null;  // valeur lissee (exponential smoothing)

function _applyRotationToTrackerMarker() {
  // Uniquement en tracking actif. Au repos / recalage seul, l'icone reste
  // statique pointant Nord (= sa definition de base dans le PNG).
  if (!tracking) return;
  if (!markerPosition) return;

  // v172 : passe par _getCorrectedHeading() pour appliquer l'offset
  // d'orientation écran (landscape, portrait inversé). Sinon en landscape
  // l'icône pointait vers le haut DEVICE au lieu du haut VISUEL → décalage
  // de 90° perçu comme un bug par l'user.
  const heading = _getCorrectedHeading();

  // ===== 1. SMOOTHING EXPONENTIEL =====
  // smoothed = (1 - α) * smoothed_prev + α * heading
  // α = 0.25 : 75% historique + 25% nouvelle valeur = lissage modere.
  // Gestion du wrap 0-360° : si on tourne de 350° vers 10° (via le Nord),
  // le delta brut serait -340° (retour arriere geant) - on prend le delta
  // circulaire minimum (en signed degrees) pour eviter ca.
  if (_trackerHeadingSmoothed === null) {
    _trackerHeadingSmoothed = heading;
  } else {
    let delta = heading - _trackerHeadingSmoothed;
    if (delta > 180)       delta -= 360;
    else if (delta < -180) delta += 360;
    _trackerHeadingSmoothed = (_trackerHeadingSmoothed + delta * 0.25 + 360) % 360;
  }

  // ===== 2. THROTTLE 2° APRES SMOOTHING =====
  // Skip DOM update si delta < 2°. La transition CSS 0.3s + le smoothing
  // suffisent pour absorber les petites variations sans qu'on bouge le DOM
  // a chaque tick. SKIP le throttle au tout premier appel (null sentinel).
  if (_trackerRotationLast !== null) {
    let deltaAffich = Math.abs(_trackerHeadingSmoothed - _trackerRotationLast);
    if (deltaAffich > 180) deltaAffich = 360 - deltaAffich;  // wrap pour distance min
    if (deltaAffich < 2) return;
  }
  _trackerRotationLast = _trackerHeadingSmoothed;

  // ===== 3. APPLY =====
  // getElement retourne le DIV wrapper (translate Leaflet). On cible son img enfant.
  // La transition CSS 0.3s (.kta-tracker-img) lisse visuellement.
  const el = markerPosition.getElement && markerPosition.getElement();
  if (!el) return;
  const img = el.querySelector(".kta-tracker-img");
  if (!img) return;
  img.style.transform = "rotate(" + _trackerHeadingSmoothed + "deg)";
}

// Reset la rotation a 0° (icone pointant Nord = pose neutre). Appele au
// stopTracking(). Vide aussi le smoothing buffer pour repartir propre au
// prochain Play.
function _resetRotationTrackerMarker() {
  _trackerRotationLast    = null;
  _trackerHeadingSmoothed = null;
  if (!markerPosition) return;
  const el = markerPosition.getElement && markerPosition.getElement();
  if (!el) return;
  const img = el.querySelector(".kta-tracker-img");
  if (!img) return;
  img.style.transform = "rotate(0deg)";
}

// 🏗️ Multi-niveau (v148) : applique le filtre visuel sur le marker tracker.
// Cache (opacity 0 + pointer-events none) si trackerLevel n'est pas dans
// visibleLevels. Si multiLevel = false → toujours visible (retro-compat).
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
  // Le polyline (tracé parcouru) suit aussi le tracker level
  if (polyline) try { polyline.setStyle({ opacity: visible ? 1 : 0 }); } catch(e) {}
}

// Expose pour interface.js → window.appliquerFiltreNiveau()
window._applyLevelFilterToTracker = _appliquerFiltreNiveauSurTracker;

// Cache de collision
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

    // Calculer le ratio entre les coordonnées plan (APP_CONFIG) et le canvas collision
    // Le canvas peut être downscalé (max 4096px) par rapport au plan original
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

  // Convertir les coordonnées plan → coordonnées canvas collision
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

// =========================
// ORIENTATION
// =========================

// Convertit (alpha, beta, gamma) du DeviceOrientationEvent en heading compass
// (0=Nord, 90=Est CW, intervalle [0, 360)).
//
// =========================================================================
// CONVENTION W3C DeviceOrientation (corrige le bug de l'ancienne formule)
// =========================================================================
// Rotation intrinsèque Z-X'-Y'' (yaw α, pitch β, roll γ). Matrice de passage
// body→world : R = Rz(α) · Rx(β) · Ry(γ).
//
// Axe Y du device = bord SUPÉRIEUR du tél (top edge).
//   Projection de Y en repère monde : (-sin α cos β, cos α cos β, sin β)
//   → γ N'INTERVIENT PAS car une rotation autour de Y laisse Y invariant.
//   → C'est la pose "boussole" : tél à plat dans la main, top edge dans
//     la direction de marche.
//
// Axe -Z du device = DOS du tél (sortie de l'objectif caméra).
//   Projection en repère monde :
//     (-(cos α sin γ + sin α sin β cos γ),
//      -(sin α sin γ - cos α sin β cos γ))
//   → utile pour la pose "lecture SMS" : tél vertical en main, top vers
//     le ciel, dos vers l'avant.
//
// Le code bascule entre les deux axes selon |cos β| (proxy de la
// verticalité du tél) :
//   - |cos β| > 0.5 (β proche de 0° ou 180°) → tél plutôt plat → axe Y
//   - sinon (β proche de ±90°)               → tél vertical → axe -Z
// La pose "boussole" est privilégiée car c'est celle de la doc utilisateur.
//
// =========================================================================
// BUG DE L'ANCIENNE FORMULE (référence pour mémoire)
// =========================================================================
// L'ancienne formule (cf. git history avant 14/05/2026) avait :
//   - SIGNE INVERSÉ sur la composante east : `+sin α cos β` au lieu de
//     `-sin α cos β` → swap Est↔Ouest pour téléphone à plat.
//   - TERMES SPURIOUS en γ (`cos α sin γ sin β`, etc.) qui ne devraient
//     pas figurer dans la projection de l'axe Y.
//   - PAS DE GESTION de la pose verticale → dégénéré quand β ≈ 90°.
// Conséquence pour l'utilisateur : tourner à droite physiquement faisait
// tourner le tracker à GAUCHE (rotation sens inverse), avancer faisait
// reculer (heading initial à l'opposé) — cf. retour terrain carrière.
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

  // Compass heading : atan2(east, north). 0 = Nord, 90 = Est, sens CW.
  let heading = Math.atan2(east, north) * 180 / Math.PI;
  if (heading < 0) heading += 360;
  return heading;
}

// Garde-fous : sur plan switch, requestPermission peut être rappelé et
// re-déclencher initOrientation/initMotion. Sans ces flags, on accumulait
// les listeners window à chaque appel → fuite mémoire + double traitement
// de chaque événement deviceorientation/devicemotion.
let _orientationListenerAttached = false;
let _motionListenerAttached      = false;

// =========================
// CORRECTION HEADING SELON L'ORIENTATION DE L'ÉCRAN (depuis v172)
// =========================
// Bug rapporté : en mode landscape, la boussole et la rotation de l'icône
// tracker indiquaient un Nord décalé de ±90° (ou 180° en portrait inversé).
//
// Cause : DeviceOrientationEvent renvoie α/β/γ par rapport aux axes
// INTRINSÈQUES du device, pas selon l'orientation visuelle de l'écran.
// L'axe Y du device (bord court "haut") correspond au haut visuel UNIQUEMENT
// en portrait normal. En landscape, le haut visuel est l'ancien bord
// droit/gauche du device → décalage angulaire.
//
// Fix : variable `_screenAngle` (0/90/180/270) mise à jour via event
// `orientationchange` + `screen.orientation.change`. La correction est
// appliquée à la lecture via _getCorrectedHeading() — la variable
// `direction` reste la valeur DEVICE BRUTE (utile pour debug + cohérence
// avec les sources de truth iOS webkitCompassHeading qui sont aussi brutes).
let _screenAngle = 0;

// Lit l'angle de rotation de l'écran (cascade de compat).
// Convention standard `screen.orientation.angle` : 0 / 90 / 180 / 270
//   - 0   : portrait normal (haut visuel = bord court haut device)
//   - 90  : screen tourné 90° anti-horaire par l'OS (= l'user a tourné
//           le device 90° horaire physiquement → landscape-PRIMARY,
//           bord droit du device devient le haut visuel)
//   - 180 : portrait inversé
//   - 270 : landscape-SECONDARY (sens opposé à 90)
//
// iOS Safari < 16.4 : window.orientation (deprecated) avec convention
// OPPOSÉE sur landscape (0 / 90 / -90 / 180). On normalise vers la
// convention standard via (360 - val) % 360 sur les valeurs landscape.
function _getScreenAngleNormalized() {
  // Standard moderne (Chrome, Firefox, Edge, Safari ≥ 16.4)
  if (screen && screen.orientation && typeof screen.orientation.angle === "number") {
    return ((screen.orientation.angle % 360) + 360) % 360;
  }
  // Fallback iOS Safari < 16.4 — convention opposée pour landscape, on
  // inverse en convertissant via (360 - val) % 360 :
  //   0 (portrait)    → 0
  //   90 (LS-left)    → 270
  //   -90 (LS-right)  → 90
  //   180 (inversé)   → 180
  if (typeof window.orientation === "number") {
    const v = ((window.orientation % 360) + 360) % 360;
    if (v === 0 || v === 180) return v;
    return (360 - v) % 360;
  }
  return 0;
}

// Heading visuel = (heading device brut + angle écran) % 360.
// Justification math : si l'écran a été tourné de θ° anti-horaire par l'OS,
// le bord du device qui pointe désormais vers "haut visuel" est l'ancien
// bord droit (pour θ=90), l'ancien bord bas (θ=180), etc. Le heading
// visuel = direction vers laquelle ce bord pointe en monde = direction du
// bord court device "haut" (= heading brut) + offset angulaire de θ.
function _getCorrectedHeading() {
  if (typeof direction !== "number" || isNaN(direction)) return 0;
  return ((direction + _screenAngle) % 360 + 360) % 360;
}

// Sync de _screenAngle au boot du module + listener pour les changements
// d'orientation (l'user tourne son tel pendant l'utilisation). On force
// aussi un re-render de l'icône tracker pour qu'elle se recale instantanément
// sans attendre le prochain event device (= bonne UX terrain).
//
// Idempotent : safe à appeler plusieurs fois (les addEventListener sont
// gardés par le flag `_screenOrientationListenerAttached`).
let _screenOrientationListenerAttached = false;
function _initScreenOrientationListener() {
  // Init la valeur courante (cas boot en landscape, ou re-init après
  // rebuild)
  _screenAngle = _getScreenAngleNormalized();
  if (_screenOrientationListenerAttached) return;
  _screenOrientationListenerAttached = true;

  const _onScreenChange = function() {
    _screenAngle = _getScreenAngleNormalized();
    console.log("[Tracking] Screen orientation → angle :", _screenAngle, "°");
    // Re-render immédiat de l'icône tracker pour ne pas attendre le prochain
    // event device. _applyRotationToTrackerMarker lit _getCorrectedHeading()
    // donc se basera sur la nouvelle correction.
    _applyRotationToTrackerMarker();
  };

  // Standard moderne : screen.orientation.change (Chrome, FF, Edge, Safari ≥ 16.4)
  if (screen && screen.orientation && typeof screen.orientation.addEventListener === "function") {
    screen.orientation.addEventListener("change", _onScreenChange);
  }
  // Fallback universel : event orientationchange sur window (iOS Safari, vieux Android)
  window.addEventListener("orientationchange", _onScreenChange);
}

// Log throttle pour ne pas spammer la console (cf debug.js §11) : 1 log/s max
// pendant que le tracking est actif. Visible uniquement en debugMode = true.
let _lastHeadingLog = 0;
function _logHeading(heading, source) {
  if (!tracking) return;  // pas la peine de logger si on ne tracke pas
  const now = Date.now();
  if (now - _lastHeadingLog < 1000) return;
  _lastHeadingLog = now;
  // v172 : log inclut l'angle écran appliqué pour debug terrain en landscape
  // (heading brut device + offset écran = heading visuel utilisé par boussole/icône).
  const corrected = _getCorrectedHeading();
  console.log(
    "[Tracking] Heading :", heading.toFixed(1), "° (source:", source +
    ", screen:", _screenAngle + "°, visuel:", corrected.toFixed(1) + "°)"
  );
}

function initOrientation() {
  // v172 : attache le listener d'orientation écran AVANT le listener device,
  // pour que _screenAngle soit déjà à jour quand le 1er event device arrive
  // (= correction appliquée dès la 1ère lecture du heading).
  _initScreenOrientationListener();

  if (_orientationListenerAttached) return;
  _orientationListenerAttached = true;

  // Handler unique réutilisé pour deviceorientation ET deviceorientationabsolute.
  // Cascade de priorité pour obtenir le heading le plus fiable possible :
  //   1) iOS  : event.webkitCompassHeading (compass calibré natif, déjà 0=N CW).
  //             N'existe que sur l'event deviceorientation iOS.
  //   2) Tout : calcul depuis (α, β, γ) via getHeading() — formule corrigée.
  function _onOrientation(event) {
    // 1) iOS : compass natif si dispo (plus précis que le calcul, et déjà
    // référencé true North via le magnétomètre calibré du device).
    if (typeof event.webkitCompassHeading === "number" &&
        !isNaN(event.webkitCompassHeading)) {
      direction = event.webkitCompassHeading;
      _logHeading(direction, "webkitCompassHeading");
      _applyRotationToTrackerMarker();  // v158 : oriente l'icone selon le heading
      return;
    }

    // 2) Fallback : calcul depuis les angles bruts.
    if (event.alpha !== null && event.beta !== null && event.gamma !== null) {
      direction = getHeading(event.alpha, event.beta, event.gamma);
      _logHeading(direction, event.absolute ? "calc-absolute" : "calc-relative");
      _applyRotationToTrackerMarker();  // v158 : oriente l'icone selon le heading
    }
  }

  // Android Chrome moderne : `deviceorientationabsolute` donne un α référencé
  // true North magnétique (plus fiable que `deviceorientation` qui peut être
  // relatif à la position de boot du device → dérive du heading sans recalage).
  // Si non supporté (iOS, vieux Android) → fallback sur `deviceorientation`.
  // iOS publie webkitCompassHeading sur deviceorientation, donc on est couvert.
  if ("ondeviceorientationabsolute" in window) {
    window.addEventListener("deviceorientationabsolute", _onOrientation);
    console.log("[Tracking] Orientation : listener deviceorientationabsolute (true North)");
  } else {
    window.addEventListener("deviceorientation", _onOrientation);
    console.log("[Tracking] Orientation : listener deviceorientation (iOS webkitCompassHeading prioritaire si dispo)");
  }
}

// =========================
// MOUVEMENT
// =========================
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

    // Magnitude + détection pas : log gating géré centralement par debug.js
    // (silence en prod, visible en debug). Tag uniformisé.
    console.log("[Tracking] Magnitude :", magnitude.toFixed(2));

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

// =========================
// DEPLACEMENT
// =========================
function avancer() {
  const scale = APP_CONFIG.scale;
  const pasMetre = APP_CONFIG.stepLength;

  // on garde ton comportement actuel
  let distance = pasMetre * scale;

  let rad = direction * Math.PI / 180;

  let newX = position.x + distance * Math.sin(rad);
  let newY = position.y - distance * Math.cos(rad);

  if (estAccessible(newX, newY)) {
    position.x = newX;
    position.y = newY;
  } else {
    console.log("[Tracking] Collision !");
  }

  updateMap();
}

// =========================
// UPDATE MAP
// =========================
function updateMap() {
  if (!markerPosition) return;

  let latlng = convertCoord(position.x, position.y);

  markerPosition.setLatLng(latlng);

  if (polyline) {
    polyline.addLatLng(latlng);
  }
}

// =========================
// CONTROLES
// =========================
function startTracking() {
  tracking = true;
  // 🏗️ Multi-niveau : snapshot du niveau actif au moment du Play. Le tracker
  // est considere comme "demarrant sur ce niveau". Le user peut changer via
  // recalage si necessaire. Sans effet si multiLevel = false.
  if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
    trackerLevel = window.APP_CONFIG.activeLevel || 0;
  }
  _appliquerFiltreNiveauSurTracker();
  // 🧭 v158 : applique immediatement la rotation si direction connue
  // (cas du clic Play apres que l'orientation a deja ete capte au moins une
  // fois). Sinon, l'event suivant deviceorientation s'en chargera.
  _applyRotationToTrackerMarker();
  console.log("[Tracking] ON (level:", trackerLevel + ")");
}

function stopTracking() {
  tracking = false;
  // 🧭 v158 : reset rotation a 0° (icone pointe Nord = pose neutre).
  _resetRotationTrackerMarker();
  console.log("[Tracking] OFF");
}

// =========================
// PERMISSION IOS
// =========================
function requestPermission() {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then(response => {
      if (response === 'granted') {
        initOrientation();
        initMotion();
      }
    });
  } else {
    initOrientation();
    initMotion();
  }
}

// =========================
// RESET POSITION
// =========================
function resetTrackingPosition() {
  position.x = APP_CONFIG.startX;
  position.y = APP_CONFIG.startY;
  stepCount = 0;

  if (polyline) {
    polyline.setLatLngs([]);
  }

  updateMap();
  window.map.setView(convertCoord(position.x, position.y), 0);
}

// =========================
// GETTERS
// =========================
function getStepCount() {
  return stepCount;
}

// =========================
// EXPORT GLOBAL
// =========================
window.startTracking = startTracking;
window.stopTracking = stopTracking;
window.initTracking = initTracking;
window.requestPermission = requestPermission;
window.resetTrackingPosition = resetTrackingPosition;
window.getStepCount = getStepCount;
window.initCollisionCache = initCollisionCache;

// =========================
// EXPORT POUR L'EXPORT PNG ET LA RECHERCHE
// =========================
// Lecture seule du heading courant (degrés, 0=N, 90=E CW). Utilisé par
// le widget boussole (compass.js) pour afficher la direction du Nord en
// temps réel. Toujours dispo, même si le tracking n'est pas démarré (à
// condition que requestPermission ait attaché les listeners orientation).
window.getCurrentHeading = function() {
  // v172 : retourne le heading CORRIGÉ selon l'orientation écran (landscape,
  // portrait inversé). Le widget boussole et l'icône tracker passent par
  // cette fonction, donc ils restent cohérents avec le haut visuel.
  return _getCorrectedHeading();
};

window.getTrackingPosition = function() {
  // Position courante du tracker (en coords plan)
  return { x: position.x, y: position.y };
};

// 🏗️ Multi-niveau : lecture du niveau courant du tracker (utile pour les
// itineraires/recherche aware-niveau en phase 2B).
window.getTrackerLevel = function() {
  return trackerLevel;
};

window.getTrackingPath = function() {
  // Liste des points (coords plan) tracés depuis le démarrage du tracking
  if (!polyline) return [];
  const latlngs = polyline.getLatLngs();
  if (!latlngs || latlngs.length === 0) return [];
  return latlngs.map(function(ll) {
    return { x: ll.lng, y: APP_CONFIG.imageHeight - ll.lat };
  });
};

// Recale la position du tracker sur des coords plan precises (typiquement
// utilise depuis le bouton "📍 Je suis ici" d'une popup point — voir
// utils.js > buildPointPopupHtml + interface.js wire-up).
// Equivalent du mode recalage clic-carte mais avec coords exactes du point
// existant (plus precis qu'un clic approximatif). Reset le tracé en cours
// (polyline) et le compteur de pas, comme le mode recalage classique.
window.recalerTrackerSurPoint = function(x, y, level) {
  if (typeof x !== "number" || typeof y !== "number") return;
  position.x = x;
  position.y = y;
  if (polyline) polyline.setLatLngs([]);
  stepCount = 0;
  // 🏗️ Multi-niveau (v148) : si un level explicite est fourni (depuis la popup
  // d'un point qui porte son level), on l'utilise. Sinon, par defaut on prend
  // le niveau actif (le user a cliqué un point visible donc forcément actif).
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
  // Desactive le mode recalage s'il etait actif (cohérent : on vient de
  // recaler via le bouton, on n'a plus besoin du mode click).
  if (window.modeRecalage) window.modeRecalage = false;
  // Pan la map sur la nouvelle position pour que l'utilisateur voie le
  // marker tracker s'aligner avec le point selectionne.
  if (window.map) {
    try {
      const latlng = convertCoord(x, y);
      window.map.setView(latlng, window.map.getZoom(), { animate: true });
    } catch(e) {}
  }
  console.log("[Tracking] Recalé sur point :", x, y);
};