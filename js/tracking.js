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
  // récupère l’icône après initMapFromConfig
  const iconeTracker = window.iconeTrack;

  let latlng = convertCoord(position.x, position.y);

  markerPosition = L.marker(latlng, {
    icon: iconeTracker
  }).addTo(window.map);

  polyline = L.polyline([], { weight: 3 }).addTo(window.map);

  window.map.setView(latlng, 0);

  window.map.on('click', function(e) {
    if (!window.modeRecalage) return;

    let lat = e.latlng.lat;
    let lng = e.latlng.lng;

    let x = lng;
    let y = APP_CONFIG.imageHeight - lat;

    position.x = x;
    position.y = y;

    updateMap();
    console.log("Recalé en :", x, y);

    if (polyline) {
      polyline.setLatLngs([]);
    }

    stepCount = 0;
  });
}

// =========================
// COLLISION
// =========================
function estAccessible(x, y) {
  if (!window.collisionCtx || !window.collisionCanvas) return true;

  if (x < 0 || y < 0 || x >= window.collisionCanvas.width || y >= window.collisionCanvas.height) {
    return false;
  }

  let rayon = 2;
  let ok = 0;
  let total = 0;

  for (let dx = -rayon; dx <= rayon; dx++) {
    for (let dy = -rayon; dy <= rayon; dy++) {
      total++;

      let px = Math.round(x + dx);
      let py = Math.round(y + dy);

      if (px < 0 || py < 0 || px >= window.collisionCanvas.width || py >= window.collisionCanvas.height) {
        continue;
      }

      let pixel = window.collisionCtx.getImageData(px, py, 1, 1).data;

      let r = pixel[0];
      let g = pixel[1];
      let b = pixel[2];

      if (!(r > 200 && g < 50 && b < 50)) {
        ok++;
      }
    }
  }

  return (ok / total) > 0.7;
}

// =========================
// ORIENTATION
// =========================
function initOrientation() {
  window.addEventListener("deviceorientation", function(event) {
    if (event.alpha !== null) {
      direction = event.alpha;
    }
  });
}

// =========================
// MOUVEMENT
// =========================
function initMotion() {
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

    if (APP_CONFIG.motionDebug) {
      console.log("Magnitude:", magnitude.toFixed(2));
    }

    if (
      magnitude > APP_CONFIG.stepThreshold &&
      (now - lastStepTime) > APP_CONFIG.stepCooldown
    ) {
      stepCount++;

      if (APP_CONFIG.motionDebug) {
        console.log("👣 Pas détecté :", stepCount);
      }

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

  let newX = position.x + distance * Math.cos(rad);
  let newY = position.y + distance * Math.sin(rad);

  if (estAccessible(newX, newY)) {
    position.x = newX;
    position.y = newY;
  } else {
    console.log("Collision !");
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
  console.log("Tracking ON");
}

function stopTracking() {
  tracking = false;
  console.log("Tracking OFF");
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