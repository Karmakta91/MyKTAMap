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

    updateMap();
    console.log("[Tracking] Recalé en :", x, y);

    if (polyline) polyline.setLatLngs([]);
    stepCount = 0;
  });
}

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

function getHeading(alpha, beta, gamma) {
  const a = alpha * Math.PI / 180;
  const b = beta  * Math.PI / 180;
  const g = gamma * Math.PI / 180;

  // vecteur "nez" du tel dans le repère monde
  const x = Math.sin(a) * Math.cos(b)
          + Math.cos(a) * Math.sin(g) * Math.sin(b)
          - Math.cos(a) * Math.cos(g) * Math.sin(b);
  const y = Math.cos(a) * Math.cos(b)
          - Math.sin(a) * Math.sin(g) * Math.sin(b)
          + Math.sin(a) * Math.cos(g) * Math.sin(b);

  let heading = Math.atan2(x, y) * 180 / Math.PI;
  if (heading < 0) heading += 360;
  return heading;
}

// Garde-fous : sur plan switch, requestPermission peut être rappelé et
// re-déclencher initOrientation/initMotion. Sans ces flags, on accumulait
// les listeners window à chaque appel → fuite mémoire + double traitement
// de chaque événement deviceorientation/devicemotion.
let _orientationListenerAttached = false;
let _motionListenerAttached      = false;

function initOrientation() {
  if (_orientationListenerAttached) return;
  _orientationListenerAttached = true;
  window.addEventListener("deviceorientation", function(event) {
    if (event.alpha !== null
        && event.beta  !== null
        && event.gamma !== null) {

      direction = getHeading(
        event.alpha,
        event.beta,
        event.gamma
      );
    }
  });
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
  console.log("[Tracking] ON");
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
window.getTrackingPosition = function() {
  // Position courante du tracker (en coords plan)
  return { x: position.x, y: position.y };
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
window.recalerTrackerSurPoint = function(x, y) {
  if (typeof x !== "number" || typeof y !== "number") return;
  position.x = x;
  position.y = y;
  if (polyline) polyline.setLatLngs([]);
  stepCount = 0;
  updateMap();
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