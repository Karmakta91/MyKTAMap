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

// Log throttle pour ne pas spammer la console (cf debug.js §11) : 1 log/s max
// pendant que le tracking est actif. Visible uniquement en debugMode = true.
let _lastHeadingLog = 0;
function _logHeading(heading, source) {
  if (!tracking) return;  // pas la peine de logger si on ne tracke pas
  const now = Date.now();
  if (now - _lastHeadingLog < 1000) return;
  _lastHeadingLog = now;
  console.log("[Tracking] Heading :", heading.toFixed(1), "° (source:", source + ")");
}

function initOrientation() {
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
      return;
    }

    // 2) Fallback : calcul depuis les angles bruts.
    if (event.alpha !== null && event.beta !== null && event.gamma !== null) {
      direction = getHeading(event.alpha, event.beta, event.gamma);
      _logHeading(direction, event.absolute ? "calc-absolute" : "calc-relative");
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
  console.log("[Tracking] ON (level:", trackerLevel + ")");
}

function stopTracking() {
  tracking = false;
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
  return direction;
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