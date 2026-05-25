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

    // 🆕 v1.11.3 V2.3 : log timeline du recalage. Le clic carte recalage
    // vide le tracé visible (polyline.setLatLngs([])) mais on garde la
    // timeline historique pour le replay (= cumul depuis le start de
    // tracking, pas effacé par les recalages successifs).
    _pushTimelinePoint("recalage");

    // 🆕 v1.11.3-fix (KARMA "quand on a fini de l'utiliser, on doit
    // repartir sur la boussole") : auto-désactive le mode recalage après
    // le clic. L'user a fait son recalage, on revient au mode tracker
    // normal (icône boussole tourne avec le heading, sidebar 📍 grisée).
    //
    // 2 actions complémentaires :
    //   1. Désactive l'UI sidebar via le helper de interface.js qui sait
    //      retirer la classe .kta-actif du bouton 📍 + remettre l'icône
    //      principale du tracker à 🧭.
    //   2. Réapplique immédiatement la rotation du marker selon le
    //      heading actuel (sinon l'icône reste figée à 0° jusqu'au
    //      prochain event deviceorientation, ce qui peut prendre
    //      plusieurs secondes).
    if (window.modeRecalage) {
      window.modeRecalage = false;
      // Helper exposé par interface.js > _modesActifs["recalage"].desactiverFn
      if (window._fermerModeRecalage && typeof window._fermerModeRecalage === "function") {
        try { window._fermerModeRecalage(); } catch(e) {}
      }
    }
    if (tracking) {
      _applyRotationToTrackerMarker();
    }
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
let _trackerRotationLast      = null;  // derniere valeur smoothed (pour throttle)
let _trackerHeadingSmoothed   = null;  // valeur lissee dans [0, 360] (pour smoothing)
// 🆕 v1.9.2 : valeur CUMULÉE appliquée au CSS — peut être hors [0, 360]
// (ex: -10, 370, 720, -45…). Évite le saut visuel arrière quand le tracker
// franchit la frontière 0/360 (KARMA : "si je vais dans l'autre, l'icone
// saute pour se caler"). Voir le bloc d'application ci-dessous.
let _trackerRotationUnwrapped = null;

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

  // ===== 3. CUMUL ROTATION HORS [0, 360] POUR ANIMATION CSS CONTINUE =====
  // 🆕 v1.9.2 (KARMA bug : "icone saute pour se caler" au franchissement
  // 0/360°).
  //
  // Problème : la CSS transition `transform: rotate(deg)` interprète les
  // valeurs LITTÉRALEMENT. Si on passe de rotate(350deg) à rotate(10deg),
  // le navigateur anime de 350 vers 10 = -340° (saut visuel arrière) au
  // lieu de +20° (chemin court). Idem dans l'autre sens à travers le Nord.
  //
  // Fix : maintenir une valeur cumulée hors [0, 360] (peut être -10, 370,
  // 720, -45, etc.) qui ne bouge QUE du delta court à chaque tick. Le CSS
  // anime alors toujours dans le sens "naturel" = la direction physique
  // réelle du tracker, sans saut.
  //
  // Exemple :
  //   tick 1 : smoothed=350, unwrapped=350    → rotate(350deg)
  //   tick 2 : smoothed=10,  delta court=+20° → unwrapped=370 → rotate(370deg)
  //              le CSS anime 350→370 = +20° (chemin court) ✓
  //   tick 3 : smoothed=350, delta court=-20° → unwrapped=350 → rotate(350deg)
  //              le CSS anime 370→350 = -20° (chemin court) ✓
  if (_trackerRotationUnwrapped === null) {
    _trackerRotationUnwrapped = _trackerHeadingSmoothed;
  } else {
    // Module positif de la valeur cumulée pour calculer le delta vs smoothed
    const currentMod = ((_trackerRotationUnwrapped % 360) + 360) % 360;
    let delta = _trackerHeadingSmoothed - currentMod;
    if (delta > 180)       delta -= 360;
    else if (delta < -180) delta += 360;
    _trackerRotationUnwrapped += delta;
  }

  // ===== 4. APPLY =====
  // getElement retourne le DIV wrapper (translate Leaflet). On cible son img enfant.
  // La transition CSS 0.3s (.kta-tracker-img) lisse visuellement.
  const el = markerPosition.getElement && markerPosition.getElement();
  if (!el) return;
  const img = el.querySelector(".kta-tracker-img");
  if (!img) return;
  img.style.transform = "rotate(" + _trackerRotationUnwrapped + "deg)";
}

// Reset la rotation a 0° (icone pointant Nord = pose neutre). Appele au
// stopTracking(). Vide aussi le smoothing buffer pour repartir propre au
// prochain Play.
function _resetRotationTrackerMarker() {
  _trackerRotationLast      = null;
  _trackerHeadingSmoothed   = null;
  _trackerRotationUnwrapped = null;  // 🆕 v1.9.2 : reset le cumul d'angles
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

    // 🆕 v1.9.3-B-side (KARMA "en actif tracking j'ai un log Magnitude qui
    // log énormément, c'est du flood") :
    // Throttle 1 Hz max. L'event devicemotion fire à ~60 Hz sur iPhone,
    // ~50 Hz sur Android. Sans throttle, debug.js logue à pleine fréquence
    // → spam console + saturation rapide du buffer 300 entries (les warn/
    // error utiles sont chassés en 5s). Maintenant : 1 log/s en debug.
    // Le gating debugMode est toujours fait par debug.js (cf §11 CLAUDE.md),
    // ce throttle s'applique en plus pour limiter la verbosité.
    if (!window._lastMagnitudeLog || (now - window._lastMagnitudeLog) >= 1000) {
      window._lastMagnitudeLog = now;
      console.log("[Tracking] Magnitude :", magnitude.toFixed(2));
    }

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

  // 🆕 v1.11.3 V2.3 : capture du résultat collision pour pouvoir datater
  // SEULEMENT si le pas a été appliqué (sinon doublon dans la timeline).
  const _stepApplied = estAccessible(newX, newY);
  if (_stepApplied) {
    position.x = newX;
    position.y = newY;
  } else {
    console.log("[Tracking] Collision !");
  }

  updateMap();

  // Datage du point PDR (uniquement si pas n'a pas été bloqué)
  if (_stepApplied) {
    _pushTimelinePoint("pdr");
  }
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
// 🆕 v1.11.3 V2.3 : timeline timestamps. Array module-scope qui datage chaque
// point du parcours tracker (Date.now + delta + type pdr/recalage/start +
// niveau MLVL). Persistance RAM only — cohérent avec le tracker marqué
// "expérimental" dans toute la doc. Reset au resetTrackingPosition().
let _trackingTimeline = [];
let _trackingStartTs  = null;

// Helper interne : push une entrée timeline avec timestamp + type.
// Lit position.x, position.y au moment de l'appel (= snapshot atomique).
function _pushTimelinePoint(type) {
  if (typeof position.x !== "number" || typeof position.y !== "number") return;
  const now = Date.now();
  if (_trackingStartTs === null) _trackingStartTs = now;
  const entry = {
    x: position.x,
    y: position.y,
    t: now,
    deltaMs: now - _trackingStartTs,
    type: type || "pdr"
  };
  // Multi-niveau : on tag aussi le niveau du tracker au moment du point
  if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
    entry.level = typeof trackerLevel === "number" ? trackerLevel : (window.APP_CONFIG.activeLevel || 0);
  }
  _trackingTimeline.push(entry);
}

function startTracking() {
  tracking = true;
  // 🆕 v1.11.3 V2.3 : init de la timeline au démarrage. Reset = nouveau
  // cycle de tracking. Push un point initial "start" pour marquer l'origine
  // temporelle.
  _trackingStartTs  = Date.now();
  _trackingTimeline = [];
  _pushTimelinePoint("start");

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

  // 🆕 v1.11.3 V2.3 : reset complet de la timeline (= nouveau cycle).
  // Si tracking actif, on push un "start" pour marquer la nouvelle origine.
  _trackingTimeline = [];
  _trackingStartTs  = null;
  if (tracking) {
    _trackingStartTs = Date.now();
    _pushTimelinePoint("start");
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

// 🆕 v1.9.2 : getter pour l'état "Play" du tracker. Utilisé par
// refonteInterface.js > refreshStatusBar() pour afficher la LED ON/OFF
// du status bar (KARMA feedback : "quand le tracker est actif, le footer
// ne passe pas à ON"). Avant : refonteInterface lisait window.getTrackingActif
// qui n'existait pas → toujours false → toujours OFF rouge même Play actif.
window.getTrackingActif = function() {
  return tracking === true;
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

// 🆕 v1.11.3 V2.3 : exposition de la timeline complète (= path historique
// avec timestamps + types + levels). Différent de getTrackingPath qui ne
// retourne que les coords sans datage. La timeline survit aux recalages
// (le path lui est reset à chaque recalage) → cumul depuis startTracking.
//
// Format : [{x, y, t (ms epoch), deltaMs (depuis start), type, level?}]
//   type ∈ "start" | "pdr" | "recalage"
//   level présent uniquement si APP_CONFIG.multiLevel === true
window.getTrackingTimeline = function() {
  return _trackingTimeline.slice();  // copie défensive
};

window.getTrackingStartTs = function() {
  return _trackingStartTs;
};

// Helper pour calculer la distance totale parcourue d'après la timeline
// (utile pour les stats agrégées + replay).
window.getTrackingDistanceM = function() {
  if (_trackingTimeline.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < _trackingTimeline.length; i++) {
    const a = _trackingTimeline[i - 1];
    const b = _trackingTimeline[i];
    // On skip les segments AVANT/APRÈS un recalage (= téléportation, pas
    // une distance physique parcourue).
    if (b.type === "recalage" || a.type === "recalage" || a.type === "start") continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) || 1;
  return total / scale;
};

// Reset explicite de la timeline (utile pour le bouton "Effacer historique"
// futur). API publique pour les modules consommateurs.
window.resetTrackingTimeline = function() {
  _trackingTimeline = [];
  _trackingStartTs  = null;
};

// 🆕 v1.21.2 (KARMA "on active dans la sauvegarde auto le tracking comme
// ca la fonction [heatmap] devient pertinante") : setter pour restore depuis
// SessionPersist / SessionBackups. Permet à la timeline tracker de survivre
// aux reloads → cumul multi-sessions exploitable par la heatmap.
//
// Filtrage défensif : on n'accepte que les entries qui ont x/y/t/type
// valides, pour ne pas polluer la timeline runtime avec des entries
// corrompues d'un payload tiers.
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
    cleaned.push(out);
  });
  _trackingTimeline = cleaned;
  _trackingStartTs  = (typeof startTs === "number") ? startTs : null;
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

  // 🆕 v1.11.3 V2.3 : log timeline du recalage sur point existant
  _pushTimelinePoint("recalage");
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