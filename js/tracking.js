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

// 🧭 Nav Intelligente (C3) : index du segment de tracé sur lequel la position
// est actuellement calée (-1 = aucun / off-network). Sert à la « stickiness »
// du map-matching (préférer rester sur le segment courant). Réinitialisé à -1
// à chaque recalage / (re)démarrage du tracking.
let _navSegIdx = -1;

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

// 📍 POSITION CONFIRMÉE (audit ergonomie 13/09/2026, décision KARMA « à
// l'instant T »). `position` vaut le DÉPART DU PLAN tant que l'utilisateur n'a
// rien confirmé : rien ne distinguait « je suis ici » de « valeur par défaut »,
// et Sortie d'urgence / « Y aller » calculaient depuis l'entrée du plan en la
// présentant comme SA position. Le drapeau passe à vrai sur tout recalage
// (clic carte, « 📍 Je suis ici », arrivée de portail, picker « Où es-tu ? »)
// et retombe à faux au chargement d'un plan et au reset de position. Une
// session restaurée le remet à vrai si sa timeline contient un recalage. La
// date suit chaque pas appliqué : « il y a N min » = depuis le dernier
// mouvement connu, pas depuis le dernier recalage. Lu par
// getTrackingPositionEtat() ; les consommateurs : sortieUrgence.js,
// interfaceItineraire.js (itineraireYAller), emergencyMode.js.
let _positionConfirmee   = false;
let _positionConfirmeeTs = null;
function _marquerPositionConfirmee(ts) {
  _positionConfirmee   = true;
  _positionConfirmeeTs = (typeof ts === "number") ? ts : Date.now();
}

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
  _positionConfirmee   = false;   // 📍 nouveau plan → rien de confirmé
  _positionConfirmeeTs = null;

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
    _marquerPositionConfirmee();   // 📍 l'utilisateur vient de se situer
    _navSegIdx = -1;  // 🧭 nav : recalage manuel → re-snapping neuf

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
    // `src: "click"` — ce recalage-ci n'alimente JAMAIS la distance estimée :
    // un clic carte libre corrige le plus souvent une position fausse, il ne
    // raconte pas un trajet (décision KARMA 16/08 : seul « 📍 Je suis ici »
    // sur un point compte).
    _pushTimelinePoint("recalage", { src: "click" });

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
    // 🆕 v1.61.0 : replanification d'itinéraire au recalage clic carte
    _notifierRecalage(x, y, "click");
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
  // 🧭 v1.37.0 : passe par _getPlanRelHeading() qui ajoute en plus l'offset
  // Nord du plan calibré (default 0 si plan Nord-haut = rétrocompat stricte).
  // Sur plan avec Nord décalé, l'icône pointe alors dans la bonne direction
  // RELATIVE AU PLAN (= où l'user va vu de dessus sur la carte).
  const heading = _getPlanRelHeading();

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
  // 🚨 Q16 (audit 13/09/2026) : « ma position a disparu » — le marqueur passait
  // en opacité 0 sans un mot quand son étage était décoché dans ≡ Filtres. On
  // le dit, une fois par bascule visible → masqué.
  if (!visible && !_trackerMasqueParNiveau && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(window.I18n.t("tracker.toast.masqueNiveau", { lvl: trackerLevel }), "warn");
  }
  _trackerMasqueParNiveau = !visible;
}
let _trackerMasqueParNiveau = false;

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
//
// 🧭 v1.37.0 — Ce heading reste en REPÈRE MONDE (= Nord vrai). Il est utilisé
// par la boussole physique (compass.js) qui DOIT toujours pointer vers le
// vrai Nord magnétique, peu importe l'orientation du plan. Pour le repère
// PLAN (icône tracker sur la map, vecteur déplacement raster), utiliser
// _getPlanRelHeading() qui ajoute l'offset Nord du plan calibré.
function _getCorrectedHeading() {
  if (typeof direction !== "number" || isNaN(direction)) return 0;
  return ((direction + _screenAngle) % 360 + 360) % 360;
}

// 🧭 v1.37.0 — Heading projeté dans le REPÈRE PLAN. Ajoute l'offset Nord
// calibré (per-plan) au heading monde. Default 0 → strictement identique
// à _getCorrectedHeading() (rétrocompat plans v1.36.x).
//   - offset = 0   : plan orienté Nord-haut (cas standard)
//   - offset = 90  : Nord vrai pointe vers la DROITE du plan
//                    → user marchant au Nord doit voir son icône tracker
//                      pointer vers la DROITE du plan, soit rotation 90°
// Utilisé par :
//   - _applyRotationToTrackerMarker (rotation icône tracker dans la map)
//   - _avancerRaster (vecteur de déplacement pas-à-pas)
//   - roadGraph (heading map-matching côté repère plan)
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

  // 🧭 v1.37.0 — Re-render à chaud de l'icône tracker quand l'user calibre
  // le Nord (modifie northOffsetDeg). Le tracker peut être à l'arrêt : sans
  // ça l'icône resterait orientée selon l'ancien offset jusqu'au prochain
  // event device. _applyRotationToTrackerMarker lit _getCorrectedHeading()
  // qui prend déjà en compte le nouvel offset → suffit de re-render.
  window.addEventListener("kta:northOffsetChange", function() {
    try { _applyRotationToTrackerMarker(); } catch(e) {}
  });
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
// 🧭 Nav Intelligente C2 — DISPATCHER. Appelé à chaque pas détecté.
//   • smartNav OFF (ou pas de réseau de tracés prêt) → _avancerRaster() =
//     comportement HISTORIQUE strictement inchangé (PDR + raster collision).
//   • smartNav ON + réseau prêt → _avancerSurGraphe() = map-matching.
// Réversible : le toggle smartNav (⚙️ Configuration, défaut OFF) bascule.
// ⚠️ C2 = plomberie : _avancerSurGraphe() délègue encore au raster (le
// map-matching réel arrive en C3). Donc comportement identique pour l'instant.
function avancer() {
  if (APP_CONFIG.smartNav === true &&
      window.RoadGraph && typeof window.RoadGraph.matchPosition === "function") {
    _avancerSurGraphe();
  } else {
    _avancerRaster();
  }
}

// Comportement HISTORIQUE : dead-reckoning piéton (PDR) pur, contraint par le
// raster de collision (estAccessible). = « GPS Intelligent OFF ». Inchangé.
function _avancerRaster() {
  const scale = APP_CONFIG.scale;
  const pasMetre = APP_CONFIG.stepLength;

  // on garde ton comportement actuel
  let distance = pasMetre * scale;

  // 🐛 Fix orientation écran : le DÉPLACEMENT doit suivre le cap VISUEL
  // (_getCorrectedHeading = direction brute + angle écran), exactement comme la
  // rotation de l'icône (cf _applyRotationToTrackerMarker). Avant on utilisait
  // `direction` brut → en PAYSAGE l'icône pointait bien mais le pas partait de
  // travers (décalé de l'angle écran). Invisible en portrait (_screenAngle=0).
  // 🧭 v1.37.0 : _getPlanRelHeading ajoute aussi l'offset Nord du plan
  // calibré → le vecteur déplacement reste cohérent avec l'icône tracker
  // sur les plans pas-Nord-haut.
  let rad = _getPlanRelHeading() * Math.PI / 180;

  let newX = position.x + distance * Math.sin(rad);
  let newY = position.y - distance * Math.cos(rad);

  // 🆕 v1.11.3 V2.3 : capture du résultat collision pour pouvoir datater
  // SEULEMENT si le pas a été appliqué (sinon doublon dans la timeline).
  const _stepApplied = estAccessible(newX, newY);
  if (_stepApplied) {
    position.x = newX;
    position.y = newY;
    if (_positionConfirmee) _positionConfirmeeTs = Date.now();   // 📍 dernier mouvement connu
  } else {
    console.log("[Tracking] Collision !");
  }

  updateMap();

  // Datage du point PDR (uniquement si pas n'a pas été bloqué)
  if (_stepApplied) {
    _pushTimelinePoint("pdr");
  }
}

// 🧭 Nav Intelligente C3 : map-matching. On calcule la position brute PDR
// (identique au raster), puis on la CALE sur le réseau de tracés via RoadGraph.
//   • ON network  → position = projection sur la galerie (dérive latérale
//     annulée), on mémorise le segment courant pour la stickiness.
//   • OFF network → repli HYBRIDE sur le PDR raster habituel (collision). Comme
//     position n'a pas été modifiée, _avancerRaster() recalcule la MÊME brute.
function _avancerSurGraphe() {
  // 1) PDR brut (même calcul que _avancerRaster).
  const scale      = APP_CONFIG.scale;
  const distance   = APP_CONFIG.stepLength * scale;
  // 🧭 v1.37.0 : cap dans le repère PLAN (= avec offset Nord calibré).
  // Cohérent avec _avancerRaster ET avec le matching RoadGraph qui travaille
  // déjà en coord plan.
  const headingDeg = _getPlanRelHeading();
  const rad        = headingDeg * Math.PI / 180;
  const rawX = position.x + distance * Math.sin(rad);
  const rawY = position.y - distance * Math.cos(rad);

  // 2) Map-matching sur le réseau (le cap départage les branches aux croisements).
  const m = window.RoadGraph.matchPosition(rawX, rawY, _navSegIdx, headingDeg);

  if (m && m.onNetwork) {
    position.x = m.matched.x;
    position.y = m.matched.y;
    _navSegIdx = m.segIdx;
    _basculerNiveauSiTraversee(m);   // 🏗️ C6 v1.74.0
    updateMap();
    _pushTimelinePoint("pdr");
  } else {
    // OFF network : repli raster (recalcule la même brute + collision + timeline).
    _navSegIdx = -1;
    _avancerRaster();
  }
}

// 🏗️ C6 v1.74.0 — BASCULE AUTO DU NIVEAU AU FRANCHISSEMENT D'UNE JONCTION.
// Le map-matching rouvre tous les niveaux tant que le segment précédent est
// "transit" (cf. roadGraph > _levelEligible règle 4). Donc dès qu'on atterrit
// sur un segment de niveau NUMÉRIQUE différent de l'actif, c'est qu'on vient
// de sortir d'un puits / escalier : on suit.
//
// Pourquoi une bascule AUTO et pas une confirmation : en navigation on a les
// mains prises et la lampe dans l'autre — une modale bloquante est ingérable.
// Le risque résiduel (un point créé juste après hériterait du mauvais niveau
// via editor.js) est fortement réduit depuis v1.74.0 : `ktaSetActiveLevel`
// fait désormais une UNION sur visibleLevels, donc la bascule ne fait plus
// DISPARAÎTRE l'étage quitté — rien ne se perd à l'écran, et l'user voit le
// toast + la pastille changer. Retour manuel = 1 tap sur le chip de niveau.
//
// ⚠️ Ne se déclenche QUE si `multiLevel` est actif sur ce plan ET si smartNav
// est ON (cette fonction n'est appelée que depuis _avancerSurGraphe).
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

// 🆕 v1.61.0 — Hook de recalage (replanification d'itinéraire).
// Émis à CHAQUE recalage de position : clic carte (mode recalage), bouton
// « 📍 Je suis ici » d'une popup point, arrivée de portail (interPlanLinks
// passe par recalerTrackerSurPoint). Consommé par interfaceItineraire.js
// (window._onTrackerRecale) pour replanifier l'itinéraire actif depuis la
// nouvelle position et valider les étapes. source : "click" | "point".
function _notifierRecalage(x, y, source) {
  if (typeof window._onTrackerRecale === "function") {
    try { window._onTrackerRecale(x, y, source); }
    catch(e) { console.warn("[Tracking] hook recalage échoué :", e); }
  }
  // 🌀 v1.64.0 : 2e consommateur — « je suis ici » sur le point-portail de
  // sortie re-propose la traversée (interPlanRoute._currentPortalOut)
  if (window.InterPlanRoute && typeof window.InterPlanRoute.onTrackerRecale === "function") {
    try { window.InterPlanRoute.onTrackerRecale(x, y, source); }
    catch(e) { console.warn("[Tracking] hook recalage portail échoué :", e); }
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
    // 🆕 v1.28.0 : le tracé peut être MULTI-SEGMENT (historique restauré/cumulé,
    // cf _rebuildTrailFromTimeline). addLatLng() ajoute au PREMIER anneau par
    // défaut → on cible explicitement le DERNIER segment pour prolonger le tracé
    // courant. Mono-segment (tracé frais) → addLatLng simple.
    const rings = polyline.getLatLngs();
    if (rings.length > 0 && Array.isArray(rings[0])) {
      polyline.addLatLng(latlng, rings[rings.length - 1]);
    } else {
      polyline.addLatLng(latlng);
    }
  }

  // 🆕 v1.34.27 — Détection proximité waypoint iti (100px) → vibration
  // medium quand l'user atteint un waypoint actif de l'itinéraire. Pas
  // d'effet si pas d'iti ou pref vibration OFF.
  _checkWaypointProximity();
}

// =========================
// CONTROLES
// =========================
// 🆕 v1.11.3 V2.3 : timeline timestamps. Array module-scope qui datage chaque
// point du parcours tracker (Date.now + delta + type pdr/recalage/start +
// niveau MLVL).
// 🆕 v1.21.2 : la timeline est désormais persistée via SessionPersist /
// SessionBackups (le commentaire "RAM only" précédent est obsolète depuis
// cette release — la timeline survit aux reloads).
// 🐛 v1.21.3 (audit P0-2/3) : cap dur + décimation FIFO. Sans cap, une
// session 6h en cavité atteint ~150k entries × 120 bytes = ~18 Mo RAM,
// sérialisé toutes les 1.5s en localStorage (cap navigateur 5-10 Mo)
// → QuotaExceededError → session non sauvée pendant des heures.
// On garde toujours les ancres importantes (start + recalage) qui marquent
// les ruptures de chaîne lisibles par la heatmap / replay ; on décime
// uniquement les `pdr` les plus anciens.
const MAX_TIMELINE_ENTRIES = 20000;   // cap dur (~2.4 Mo, ~30 min de PDR dense)
const TIMELINE_TRIM_TO     = 18000;   // après dépassement, on trim à ce niveau
let _trackingTimeline = [];
let _trackingStartTs  = null;

// Helper interne : trim FIFO de la timeline en préservant les ancres
// (`start` + `recalage`). Appelé quand on dépasse MAX_TIMELINE_ENTRIES.
function _decimateTimeline() {
  if (_trackingTimeline.length <= MAX_TIMELINE_ENTRIES) return;
  // Partition : on garde TOUTES les ancres (start/recalage) + les PDR les
  // plus récents. Si même en enlevant tous les PDR on dépasse le cap, on
  // garde les ancres + récents en FIFO classique.
  const anchors = [];
  const pdrs    = [];
  _trackingTimeline.forEach(function(e) {
    if (e.type === "start" || e.type === "recalage") anchors.push(e);
    else pdrs.push(e);
  });
  const budgetForPdr = Math.max(0, TIMELINE_TRIM_TO - anchors.length);
  // Garde les `budgetForPdr` PDR les plus RÉCENTS (slice depuis la fin)
  const keptPdrs = pdrs.length > budgetForPdr ? pdrs.slice(pdrs.length - budgetForPdr) : pdrs;
  // Re-merge en respectant l'ordre temporel (par .t)
  const merged = anchors.concat(keptPdrs).sort(function(a, b) { return a.t - b.t; });
  _trackingTimeline = merged;
  console.log("[Tracking] Timeline décimée à", _trackingTimeline.length, "entries (cap", MAX_TIMELINE_ENTRIES, ")");
  // 🐛 v1.34.15 (Pack RAM #2) — Synchronise le polyline visible avec la
  // timeline décimée. Sans ce rebuild, le polyline continuait d'accumuler
  // toutes les positions via addLatLng() (cf updateMap l719) même après
  // décimation de _trackingTimeline → fuite RAM linéaire (chaque pas =
  // 1 LatLng object × ~32 bytes + 1 SVG path command). Sur session 6h
  // dense (1 pas / 600ms = 36k pas), c'était 36k LatLng × 32 = ~1.2 Mo
  // garde indéfiniment dans le polyline._latlngs. Maintenant : à chaque
  // décimation, on reconstruit le polyline depuis la timeline (multi-segment
  // via _rebuildTrailFromTimeline, cohérent avec les ancres recalage/start).
  _rebuildTrailFromTimeline();
}

// Helper interne : push une entrée timeline avec timestamp + type.
// Lit position.x, position.y au moment de l'appel (= snapshot atomique).
// `extra` (optionnel) enrichit l'entrée : `src` ("point" = « 📍 Je suis ici »,
// "click" = clic carte en mode recalage) et `tp` (téléportation : arrivée de
// portail — jamais une distance parcourue). Rend l'entrée poussée, ou null si
// la position n'était pas exploitable.
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
  // Multi-niveau : on tag aussi le niveau du tracker au moment du point
  if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
    entry.level = typeof trackerLevel === "number" ? trackerLevel : (window.APP_CONFIG.activeLevel || 0);
  }
  _trackingTimeline.push(entry);
  // Cap dur : décime si on dépasse. Coût amorti O(N) mais déclenché 1×
  // tous les ~2000 push (= ~2000 secondes de marche) → négligeable.
  if (_trackingTimeline.length > MAX_TIMELINE_ENTRIES) {
    _decimateTimeline();
  }
  return entry;
}

function startTracking() {
  tracking = true;
  _navSegIdx = -1;  // 🧭 nav : repart d'un snapping neuf à chaque démarrage
  // 🧭 Nav Intelligente : pré-construit le graphe réseau HORS du chemin chaud
  // (l'enrichissement des croisements est O(N²) → évite un hitch au 1er pas).
  // Sans effet si smartNav OFF, pas de réseau, ou RoadGraph absent.
  if (APP_CONFIG.smartNav === true && window.RoadGraph &&
      typeof window.RoadGraph.getGraph === "function") {
    try { window.RoadGraph.getGraph(); } catch(e) {}
  }
  // 🆕 v1.28.0 : on NE WIPE PLUS la timeline au Play — elle est désormais
  // CUMULATIVE (le tracé doit survivre au reload ET aux cycles Play/Stop ;
  // c'est aussi l'intention v1.21.2 « heatmap multi-sessions »). On marque la
  // reprise par une ancre "start" (= rupture de segment au rendu, comme un
  // recalage) au point courant. _trackingStartTs n'est (ré)initialisé que s'il
  // n'y a pas d'origine connue (vrai démarrage). Pour repartir d'un tracé
  // VIERGE, l'utilisateur dispose du reset position / « effacer l'historique ».
  if (_trackingStartTs == null) _trackingStartTs = Date.now();
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
  _navSegIdx = -1;  // 🧭 nav : oublie le segment courant à l'arrêt
  // 🧭 v158 : reset rotation a 0° (icone pointe Nord = pose neutre).
  _resetRotationTrackerMarker();
  console.log("[Tracking] OFF");
}

// =========================
// PERMISSION IOS
// =========================
// 🚨 B2 (audit ergonomie 13/09/2026) : rend TOUJOURS une Promise<boolean>.
// Avant, seule la branche « granted » existait — ni refus, ni catch — et
// l'appelant démarrait le suivi sans attendre : sur iOS, refuser la demande
// laissait la pastille ON et zéro pas à jamais, sans un mot. L'appelant
// (interface.js > _doStart, compass.js > show) attend le résultat et
// n'affiche « actif » que sur `true`.
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

// =========================
// RESET POSITION
// =========================
function resetTrackingPosition() {
  position.x = APP_CONFIG.startX;
  position.y = APP_CONFIG.startY;
  _positionConfirmee   = false;   // 📍 retour au départ du plan = plus rien de confirmé
  _positionConfirmeeTs = null;
  _navSegIdx = -1;  // 🧭 nav : re-snapping neuf après reset de position
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
  //
  // 🧭 v1.37.0 — Reste en REPÈRE MONDE (Nord vrai). À utiliser pour la
  // boussole physique (compass.js) qui doit toujours pointer le Nord
  // magnétique réel. Pour le repère PLAN (mini-map mode urgence, tracker
  // icône principale), utiliser window.getPlanRelHeading.
  return _getCorrectedHeading();
};

// 🧭 v1.37.0 — Heading projeté dans le REPÈRE PLAN (= corrected + offset Nord
// calibré per-plan). Exposé pour les modules qui veulent rendre la rotation
// d'un marker ou la direction de marche dans le repère du plan (mode urgence
// emergencyMode.js, mini-cartes, exports). Default = identique à
// getCurrentHeading() si northOffsetDeg = 0 (= rétrocompat stricte).
window.getPlanRelHeading = function() {
  return _getPlanRelHeading();
};

window.getTrackingPosition = function() {
  // Position courante du tracker (en coords plan)
  return { x: position.x, y: position.y };
};

// 📍 État de la position : est-elle CONFIRMÉE par l'utilisateur (recalage) ou
// vaut-elle encore le départ du plan ? `ts` = dernier mouvement connu (ms).
// Règle « instant T » (KARMA 13/09/2026) : suiviActif OU confirmee → on part
// de là sans question ; sinon c'est le SEUL cas où l'on demande « Où es-tu ? ».
window.getTrackingPositionEtat = function() {
  return { confirmee: _positionConfirmee, ts: _positionConfirmeeTs, suiviActif: tracking === true };
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

// ═══════════════════════════════════════════════════════════════════════
// 📏 DISTANCE ESTIMÉE ENTRE ANCRES (demande KARMA — 16/08/2026)
// ═══════════════════════════════════════════════════════════════════════
// LE MANQUE : `getTrackingDistanceM` ci-dessus ne mesure QUE le podomètre —
// tout segment touchant un recalage est sauté (un recalage PEUT être une
// téléportation, l'exclusion est saine). Conséquence : une sortie menée au
// « 📍 Je suis ici » de point en point, sans PDR, valait 0 m, et le Carnet
// la jetait sous ses seuils.
//
// LA RÈGLE — on comble le trou UNIQUEMENT quand le podomètre n'a rien vu :
//   ancre A ──(aucun pas PDR)──→ ancre C   →  A→C est estimée
//   ancre A ──(des pas PDR)────→ ancre C   →  on ne touche à rien (le
//                                             podomètre fait foi, jamais de
//                                             double comptage)
//
// LA MESURE (décision KARMA « hybride ») : longueur du CHEMIN RÉEL sur le
// réseau de galeries (Pathfinder → Dijkstra). À vol d'oiseau, 40 m dans un
// labyrinthe peuvent valoir 300 m réels — l'estimation serait un mensonge
// systématiquement optimiste. Repli vol d'oiseau si un bout n'accroche pas
// le réseau (Dijkstra sans chemin).
//
// JAMAIS CUMULÉ : le clic carte libre (`src: "click"` — c'est le plus souvent
// une CORRECTION de position, pas un déplacement) et l'arrivée de portail
// (`tp` — saut entre deux plans).
//
// OÙ VIT LA VALEUR : sur l'ancre elle-même (`estM` + `estSrc`). Donc elle
// voyage avec la timeline persistée, survit au rechargement du plan, et la
// décimation ne peut pas la perdre (`_decimateTimeline` conserve TOUTES les
// ancres, seuls les PDR sont sacrifiés).
//
// ⚠️ Volontairement SÉPARÉE de `getTrackingDistanceM` : mesuré et estimé ne
// se valent pas, et 4 modules consomment déjà la distance mesurée. Le total
// s'obtient par `getTrackingDistanceTotaleM()`, qui sait dire ce qu'il doit
// à l'estimation.

// Un chemin réseau plus long que N× le vol d'oiseau trahit un artefact de
// graphe (détour par une galerie mal reliée), pas un labyrinthe. On garde
// alors le vol d'oiseau : sous-estimer est moins grave qu'inventer 2 km.
const EST_RATIO_MAX = 30;

function _scaleOuUn() {
  const s = (window.APP_CONFIG && window.APP_CONFIG.scale) || 1;
  return (isFinite(s) && s > 0) ? s : 1;
}

// Budget de l'affinage réseau : `Pathfinder` reconstruit ENTIÈREMENT son graphe
// à chaque appel (`_buildGraph` + enrichissement des croisements en O(N²), aucun
// cache — pathfinder.js:773). Au-delà de ce volume de sommets, on garde le vol
// d'oiseau plutôt que de figer l'app.
const MAX_PTS_AFFINAGE = 20000;

// ⚡ CHEMIN CHAUD — appelé au clic « 📍 Je suis ici ». AUCUN calcul de réseau
// ici : la première version lançait un Dijkstra par clic, et comme la
// replanification d'itinéraire en lance un second juste après, chaque « Je suis
// ici » coûtait DEUX reconstructions de graphe (retour terrain KARMA 17/08 :
// « c'est long, et ensuite le recalcul est tout aussi long »). Le vol d'oiseau
// est posé tout de suite ; `affinerEstimationsTracker` repasse dessus plus tard,
// hors du geste.
function _estimerSegmentDepuisAncre(entry) {
  if (!entry || entry.tp) return;
  const i = _trackingTimeline.indexOf(entry);
  if (i <= 0) return;
  const prev = _trackingTimeline[i - 1];
  // Le point précédent n'est pas une ancre → des pas PDR ont été enregistrés
  // entre les deux, le podomètre a déjà mesuré ce tronçon.
  if (!prev || (prev.type !== "recalage" && prev.type !== "start")) return;

  const volPx = Math.hypot(entry.x - prev.x, entry.y - prev.y);
  if (!(volPx > 0)) return;
  entry.estM   = volPx / _scaleOuUn();
  entry.estSrc = "vol";
}

// 🐢 CHEMIN FROID — repasse les tronçons « vol d'oiseau » en distance RÉELLE sur
// le réseau. Appelé à l'archivage d'une sortie (journal.js), jamais au clic.
//
// `roads` est FOURNI par l'appelant (`computeRouteOnRoads`, v1.60.0) et non lu
// depuis l'état courant : l'affinage tourne pendant/après un changement de plan,
// et lire `getRoads()` à ce moment calculerait sur le plan SUIVANT.
//
// Un seul appel par « run » d'ancres consécutives : `computeRouteOnRoads` accepte
// une chaîne de waypoints et ne construit son graphe QU'UNE fois pour toute la
// chaîne. Une sortie de navigation pure = 1 run = 1 seule construction.
//
// ⚠️ La distance réseau du run est répartie sur ses tronçons **au prorata de
// leur vol d'oiseau** : `computeRouteOnRoads` ne rend qu'un total. La SOMME est
// donc exacte (c'est elle qui compte pour le carnet), le détail par ancre est
// une approximation assumée.
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
  // `force` : demande EXPLICITE de l'utilisateur (bouton « Affiner le tracé »).
  // Le budget protège l'archivage automatique, qui doit rester invisible ; il
  // n'a pas à interdire un calcul que l'user réclame en connaissance de cause —
  // et c'est justement sur les gros plans qu'il en a le plus besoin.
  const plafond = Number(opts.maxPts) || MAX_PTS_AFFINAGE;
  if (nbPts > plafond && !opts.force) {
    console.log("[Tracking] Affinage réseau ignoré : " + nbPts + " sommets (> " + plafond +
                ") — vol d'oiseau conservé.");
    bilan.skipped = "trop-gros";
    bilan.nbPts   = nbPts;
    return Promise.resolve(bilan);
  }

  // Regroupe les ancres comblées consécutives (indices adjacents dans la timeline).
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
      // Bouts hors réseau, aucun chemin : le vol d'oiseau reste, c'est voulu.
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
    // La GÉOMÉTRIE du chemin était calculée puis jetée : on la garde pour
    // reconstruire le tracé de la sortie (`res.path` = [{x, y}, …]).
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

// Tracé RECONSTRUIT : la timeline, dans laquelle chaque tronçon comblé est
// remplacé par le chemin réseau qui vient d'être calculé.
//
// ⚠️ C'EST UNE HYPOTHÈSE, PAS UNE MESURE. Entre deux « 📍 Je suis ici », le
// Dijkstra prend le chemin le plus court : un détour, une diverticule explorée
// puis abandonnée, un demi-tour n'y figureront jamais. D'où la règle posée avec
// KARMA le 17/08 : ce tracé vit dans le CARNET (fiche de sortie) et nulle part
// ailleurs — ni exports GPX/KMZ, ni heatmap, ni replay, qui doivent continuer à
// ne montrer que du mesuré. Le tracé brut (`track`) n'est jamais écrasé.
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
      // Un run qui commence avant la fenêtre est inclus entièrement : le
      // tronçon a bien été parcouru pendant la sortie, le couper au milieu
      // dessinerait un saut.
      run.path.forEach(function(p) { pousser(p.x, p.y); });
      i = run.fin;
      continue;
    }
    if (seuil && Number(e.t) < seuil) continue;
    pousser(e.x, e.y, e.level);
  }
  return out.length >= 2 ? out : null;
}

// Combien de tronçons attendent encore un affinage (source « vol d'oiseau ») ?
// Sert à griser le bouton « Affiner le tracé » quand il n'y a rien à faire.
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

// Distance exploitable de la sortie : mesurée au podomètre + estimée entre
// les « 📍 Je suis ici ». C'est celle que lisent le Carnet et les stats.
window.getTrackingDistanceTotaleM = function() {
  return window.getTrackingDistanceM() + window.getTrackingDistanceEstimeeM();
};

// Nombre de « 📍 Je suis ici » validés — hors clics carte et téléportations.
// Signal de TERRAIN sans ambiguïté : l'user affirme être physiquement passé
// par un point précis (cf. journal.js > _classer).
window.getTrackingValidations = function() {
  let n = 0;
  for (let i = 0; i < _trackingTimeline.length; i++) {
    const e = _trackingTimeline[i];
    if (e && e.type === "recalage" && e.src === "point" && !e.tp) n++;
  }
  return n;
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
  // 🐛 v1.21.3 (audit P0-3) : applique le cap au restore. Un payload
  // corrompu / multi-session cumulé / Backup ancien pouvait injecter 50k+
  // entries → OOM en cascade au boot. _decimateTimeline préserve les
  // ancres start/recalage et trim les PDR les plus anciens.
  if (_trackingTimeline.length > MAX_TIMELINE_ENTRIES) {
    console.warn("[Tracking] Restore timeline trop grande :", _trackingTimeline.length, "→ décimation");
    _decimateTimeline();
  }
  // 🆕 v1.28.0 (KARMA "garder le tracé du tracker au reload") : reconstruit le
  // tracé VISIBLE + replace le marqueur depuis la timeline restaurée. Appelé
  // ici (restore SessionPersist) qui tourne APRÈS initTracking (cf main.js) →
  // polyline + markerPosition existent.
  _rebuildTrailFromTimeline();
  // 🆕 v1.49.0 (Lot B) — recentre la vue sur la DERNIÈRE position connue
  // (« ma position actuelle ») au restore/import d'une timeline. Sans ça, la
  // vue restait sur initPosition (startX/Y, fixée par initTracking l.62) alors
  // que le marker venait d'être replacé ailleurs par _rebuildTrailFromTimeline
  // → incohérence signalée KARMA. Fallback implicite : timeline vide →
  // _rebuildTrailFromTimeline ne touche pas position et on ne recentre pas
  // (la vue reste sur initPosition, comportement voulu).
  if (_trackingTimeline.length > 0 && window.map && typeof convertCoord === "function") {
    try { window.map.setView(convertCoord(position.x, position.y), window.map.getZoom()); } catch(e) {}
  }
};

// 🆕 v1.28.0 : reconstruit TOUT le tracé visible + repositionne le marqueur
// d'après la timeline restaurée. On redessine l'historique COMPLET en segments
// MULTIPLES, coupés à chaque ancre "recalage"/"start" (= rupture/téléportation)
// pour ne PAS tracer de ligne fantôme entre deux segments. Le marqueur reprend
// au dernier point connu.
// 🐛 fix : la version initiale ne reconstruisait que le dernier segment (depuis
// la dernière ancre) → « on perd tout le tracé historique ». Désormais : tout.
function _rebuildTrailFromTimeline() {
  if (!_trackingTimeline || _trackingTimeline.length === 0) return;
  const segments = [];
  let cur = [];
  for (let i = 0; i < _trackingTimeline.length; i++) {
    const e = _trackingTimeline[i];
    if (e.type === "recalage" || e.type === "start") {
      // Rupture : on clôt le segment courant (s'il a ≥ 2 points = une ligne) et
      // on en démarre un nouveau À PARTIR de l'ancre (pas de ligne de
      // téléportation entre l'ancien et le nouveau segment).
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
  // 📍 Une timeline qui contient un recalage prouve que l'utilisateur s'est
  // situé au moins une fois : la position restaurée est « confirmée », datée
  // du dernier point connu (l'écart s'affiche : « il y a N min »).
  if (_trackingTimeline.some(function(e) { return e && e.type === "recalage"; })) {
    _marquerPositionConfirmee(typeof last.t === "number" ? last.t : Date.now());
  }
  try {
    // Leaflet accepte un tableau de tableaux de latlngs = polyline multi-segment.
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

// Recale la position du tracker sur des coords plan precises (typiquement
// utilise depuis le bouton "📍 Je suis ici" d'une popup point — voir
// utils.js > buildPointPopupHtml + interface.js wire-up).
// Equivalent du mode recalage clic-carte mais avec coords exactes du point
// existant (plus precis qu'un clic approximatif). Reset le tracé en cours
// (polyline) et le compteur de pas, comme le mode recalage classique.
// `opts.teleport` (v16/08/2026) : l'appelant sait que le déplacement n'a PAS
// été parcouru — c'est le cas de l'arrivée de portail (interPlanLinks), qui
// emprunte ce même chemin. L'ancre est alors marquée `tp` et n'entre jamais
// dans la distance estimée. La source reste "point" pour ne rien changer aux
// consommateurs existants du hook (validation d'étape d'itinéraire comprise).
window.recalerTrackerSurPoint = function(x, y, level, opts) {
  if (typeof x !== "number" || typeof y !== "number") return;
  position.x = x;
  position.y = y;
  _marquerPositionConfirmee();   // 📍 « Je suis ici » / portail / picker « Où es-tu ? »
  _navSegIdx = -1;  // 🧭 nav : recalage sur point → re-snapping neuf
  if (polyline) polyline.setLatLngs([]);
  stepCount = 0;

  // 🆕 v1.11.3 V2.3 : log timeline du recalage sur point existant
  const _ancre = _pushTimelinePoint(
    "recalage",
    (opts && opts.teleport) ? { src: "point", tp: 1 } : { src: "point" }
  );
  // 📏 Comble la distance depuis l'ancre précédente si le podomètre n'a rien
  // vu entre les deux (async : le chemin réseau arrive après, cf. la section
  // « DISTANCE ESTIMÉE ENTRE ANCRES »).
  if (_ancre) { try { _estimerSegmentDepuisAncre(_ancre); } catch(e) {} }
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
  // 🆕 v1.34.27 — Vibration haptique discrète pour confirmer le recalage.
  // L'user vient de toucher "📍 Je suis ici" → feedback tactile = "OK, j'ai
  // compris". Echec silencieux si pref OFF ou iOS Safari (cf utils.js).
  if (window.kta_vibrate) window.kta_vibrate.light();
  // 🆕 v1.61.0 : replanification d'itinéraire + validation d'étape (coords
  // exactes d'un point → peut matcher une étape de l'itinéraire actif)
  _notifierRecalage(x, y, "point");
};

// 🆕 v1.34.27 — Détection de proximité aux waypoints de l'itinéraire actif.
// Appelée à chaque updateMap() (= à chaque pas / recalage / restore).
// Hystérésis : vibre UNE FOIS quand on entre dans le rayon 100px d'un waypoint.
// Si l'user sort à >200px puis y revient, vibre à nouveau. Empêche la
// vibration en continu si on stagne près d'un waypoint.
// Pas d'effet si pas d'iti actif, pas de support vibration, ou pref OFF
// (gardes dans kta_vibrate).
const _vibratedNearWaypoints = new Set();  // clés "x_y" des waypoints déjà signalés

function _checkWaypointProximity() {
  if (typeof position.x !== "number" || typeof position.y !== "number") return;
  if (!window.kta_vibrate || typeof window.getItineraireWaypoints !== "function") return;
  const wps = window.getItineraireWaypoints();
  if (!wps || wps.length === 0) {
    // Plus d'iti actif → reset les waypoints signalés pour que le prochain
    // iti puisse re-déclencher.
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
      // Hystérésis : on est sorti du rayon → on peut re-vibrer à la prochaine entrée
      _vibratedNearWaypoints.delete(key);
    }
  });
}