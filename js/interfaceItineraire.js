/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE ITINÉRAIRE — Pathfinder UI + Évitements + Presets vitesse
// =========================
// 🆕 v1.31.0 (P3 Lot 6 — découpe interface.js) : module extrait de
// js/interface.js (2 plages : 4913-5105 + 5516-6846 avant extraction)
// pour réduire le volume du fichier principal. Lot 6 + Lot 8 du plan
// initial ont été fusionnés ici car l'itinéraire et les évitements
// partagent des helpers internes (TDZ-safe via deferral runtime).
//
// La SUPPRESSION clic visuel (tracé/zone/structure) reste dans
// interface.js — aucune dep partagée avec ce module.
//
// Aucun changement de comportement runtime. Les 8 fonctions exposées
// via `window.*` sont strictement identiques à v1.30.1.
//
// 📋 API publique principale :
//   - window.ouvrirItinerairModal()
//        Modale principale Itinéraire : input recherche autocomplete,
//        mode clic carte, picker waypoints, presets vitesse (Blessé/Lent/
//        Normal/Rapide), pause configurable, section Évitements (points/
//        tags/zones), calcul Pathfinder + preview + save/discard.
//   - window.itineraireYAller(x, y, nom)
//        Helper utilisé par les popups de points POI — ajoute le point
//        comme waypoint UNIQUE et calcule un itinéraire depuis le tracker.
//   - window.itineraireAjouterWaypoint(x, y, nom)
//        Helper utilisé par les popups de points POI — ajoute le point
//        comme waypoint à l'itinéraire actif (append, recalcule auto).
//   - window.getItiPauseEnabled() / setItiPauseEnabled()
//   - window.getItiPauseMinutes() / setItiPauseMinutes()
//        Persistance localStorage pour la pause entre waypoints.
//   - window.getItiTempsMinutes()
//        Calcule la durée prévue de l'itinéraire actif selon preset
//        vitesse + pauses configurées. Lu par le statusbar refonte v1.
//   - window._majLabelDistanceItineraire()
//        Hook appelé après setRoads pour rafraîchir le label distance
//        en bottom-left (au-dessus du label measure).
//
// 🔌 Dépendances externes (toutes via window.* / global declarations) :
//   - window.Pathfinder.computeRoute       [pathfinder.js]
//   - window.SearchPoints.findByQuery /
//     getAllPoints                          [searchPoints.js]
//   - window.getRoads / setRoads           [interface.js / road.js]
//   - window.map / convertCoord            [map.js / utils.js]
//   - window.formatDistance                [utils.js]
//   - window.APP_CONFIG (scale, etc.)      [config.js]
//   - window._currentPlanIdSafe            [main.js]
//   - window.getEditorPoints + autres registres POI [main.js]
//
// 📍 Ordre de chargement (cf index.html) :
//   - Doit charger APRÈS interface.js (cohérence ordre découpe).
//     L'ordre est cosmétique car les fonctions sont appelées au runtime.

// =========================
// ITINÉRAIRE — modale + mode clic + rendu du tracé calculé
// =========================
function _escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
  });
}

// =========================
// PAN + FLASH (style searchPoints) — pour les boutons "aller à" sur les waypoints
// =========================
let _itiFlashLayer = null;
function _panEtFlashSurPoint(p) {
  if (!window.map || !window.APP_CONFIG) return;
  const latlng = convertCoord(p.x, p.y);
  window.map.setView(latlng, window.map.getZoom(), { animate: false });
  window.map.invalidateSize();

  if (_itiFlashLayer) {
    try { window.map.removeLayer(_itiFlashLayer); } catch(e) {}
    _itiFlashLayer = null;
  }
  _itiFlashLayer = L.circleMarker(latlng, {
    radius:      24,
    color:       "#00d4ff",
    fillColor:   "#00d4ff",
    fillOpacity: 0,
    weight:      3,
    opacity:     0.9,
    interactive: false
  }).addTo(window.map);
  setTimeout(function() {
    if (_itiFlashLayer) {
      try { window.map.removeLayer(_itiFlashLayer); } catch(e) {}
      _itiFlashLayer = null;
    }
  }, 3000);
}

// =========================
// POPUP D'UN POINT — boutons "Y aller" / "Ajouter à l'itinéraire"
// =========================
// Appelees depuis le HTML inline genere par utils.js > buildPointPopupHtml.
// Toutes les routes session + embedded (visibles ou non) participent au calcul
// via le pathfinder qui utilise getAllEmbeddedRoads (cf suite 26).

// Modal charte : confirme remplacement de l'itineraire en cours
function _confirmRemplacerItineraire(onConfirm) {
  const existing = document.getElementById("kta-iti-confirm-replace");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "kta-iti-confirm-replace";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-modal" style="max-width:420px;">' +
      '<div class="kta-modal-icon" style="color:#f4c542;">⚠️</div>' +
      '<div class="kta-modal-titre">' + window.I18n.t("iti.replace.titre") + '</div>' +
      '<div class="kta-modal-texte">' +
        window.I18n.t("iti.replace.texte") +
      '</div>' +
      '<div class="kta-modal-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-iti-confirm-cancel" type="button">' + window.I18n.t("iti.replace.cancel") + '</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-iti-confirm-ok"     type="button">' + window.I18n.t("iti.replace.ok") + '</button>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);

  function _ferme() { modal.remove(); }

  document.getElementById("kta-iti-confirm-cancel").addEventListener("click", _ferme);
  document.getElementById("kta-iti-confirm-ok").addEventListener("click", function() {
    _ferme();
    if (typeof onConfirm === "function") onConfirm();
  });
  modal.addEventListener("click", function(e) { if (e.target === modal) _ferme(); });
}

// "🧭 Y aller" : depuis position tracker → ce point. Calcul direct + trace.
// Si itineraire actif → confirme avant remplacement.
window.itineraireYAller = function(x, y, nom) {
  if (typeof x !== "number" || typeof y !== "number") return;

  const pos = (typeof window.getTrackingPosition === "function")
    ? window.getTrackingPosition()
    : null;
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
    alert(window.I18n.t("iti.err.trackerPos"));
    return;
  }
  if (!window.Pathfinder) {
    alert(window.I18n.t("iti.err.pathfinder"));
    return;
  }

  const labelPoint = nom ? String(nom) : window.I18n.t("iti.point.coords", { x: Math.round(x), y: Math.round(y) });

  async function _calculer() {
    // Ferme la popup Leaflet ouverte (sinon elle reste affichee derriere le tracé)
    if (window.map) try { window.map.closePopup(); } catch(e) {}

    const waypoints = [
      {
        x: pos.x, y: pos.y, source: "tracker",
        label: window.I18n.t("iti.wp.currentPos", { x: Math.round(pos.x), y: Math.round(pos.y) })
      },
      { x: x, y: y, source: "search", label: labelPoint }
    ];

    try {
      // 🚫 v169 : computeRoute est async (await getAllPoints pour avoidTags).
      // Pour les itineraires depuis popup "Itineraire jusqu'ici", on n'a pas
      // d'avoidances configurees → mais on peut les charger depuis localStorage
      // pour cohérence avec la modale itineraire (l'user voudrait probablement
      // les memes preferences).
      const avoidPrefs = _getItiAvoidPrefs();
      const result = await window.Pathfinder.computeRoute(waypoints, {
        avoidPoints: avoidPrefs.points || [],
        avoidTags:   avoidPrefs.tags   || [],
        avoidRadius: avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS
      });

      // Cree la road itineraire (sans flag _preview : on enregistre direct)
      const newRoad = {
        type:      "itinerary",
        points:    result.path,
        waypoints: waypoints
      };

      // Remove ancien itineraire + add le nouveau
      const currentRoads = window.getRoads ? window.getRoads() : [];
      const filtered = currentRoads.filter(function(r) { return r.type !== "itinerary"; });
      filtered.push(newRoad);
      if (window.setRoads) window.setRoads(filtered);

      // Update markers visuels des waypoints + label distance bottomleft
      _itineraryWaypoints = waypoints.map(function(w) { return Object.assign({}, w); });
      if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
      _itineraryWaypoints.forEach(function(p, i) {
        _ajouterWaypointVisuel(p, i + 1);
      });
      _majLabelDistanceItineraire();

      // Pan + flash sur le point d'arrivée pour indiquer ce qui vient d'etre calcule
      _panEtFlashSurPoint({ x: x, y: y });

    } catch(err) {
      alert(window.I18n.t("iti.err.compute", { err: (err.message || err) }));
    }
  }

  // Check si itineraire actif → confirm
  const existing = (window.getRoads ? window.getRoads() : [])
    .find(function(r) { return r.type === "itinerary"; });
  if (existing) {
    _confirmRemplacerItineraire(_calculer);
  } else {
    _calculer();
  }
};

// "➕ Itinéraire" : ajoute le point comme waypoint à un itinéraire existant
// (mode navigation) ou ouvre la modale en mode calcul avec ce waypoint pre-rempli.
window.itineraireAjouterWaypoint = function(x, y, nom) {
  if (typeof x !== "number" || typeof y !== "number") return;

  // Ferme la popup Leaflet
  if (window.map) try { window.map.closePopup(); } catch(e) {}

  const labelPoint = nom ? String(nom) : window.I18n.t("iti.point.coords", { x: Math.round(x), y: Math.round(y) });
  const newWaypoint = { x: x, y: y, source: "search", label: labelPoint };

  // Cas 1 : modale itineraire deja ouverte → ajoute direct a la liste
  if (document.getElementById("kta-itinerary-modal")) {
    _itineraryWaypoints.push(newWaypoint);
    _ajouterWaypointVisuel({ x: x, y: y }, _itineraryWaypoints.length);
    _rafraichirListeWaypointsModale();
    _majPanneauFloaterCount();
    return;
  }

  // Cas 2 : pas de modale ouverte → on ouvre, et on push le waypoint apres
  // ouverture (la modale restore _itineraryWaypoints depuis l'itineraire actif
  // si mode navigation, sinon vide en mode calcul).
  window.ouvrirItinerairModal();
  _itineraryWaypoints.push(newWaypoint);
  _ajouterWaypointVisuel({ x: x, y: y }, _itineraryWaypoints.length);
  _rafraichirListeWaypointsModale();
};


// ==========================================
// 🆕 v1.31.0 P3 Lot 6 — coupure plage 5106-5515 (SUPPRESSION clic)
//      reste dans interface.js — pas de dep partagée avec l'itinéraire
// ==========================================

// =========================
// LABEL DISTANCE ITINÉRAIRE — au-dessus du label measure (bottomleft)
// =========================
let _itiDistanceCtrl = null;

// =========================
// Presets de vitesse de marche pour l'itinéraire
// =========================
// 4 modes choisis par l'utilisateur via segmented control dans la modale
// Itinéraire. Le mode courant est affiché dans le label bottomleft (icône +
// nom) et persisté en localStorage pour conserver le réglage entre sessions.
// 🆕 i18n : label/hint ne vivent plus dans le const (résolus au rendu via
// _presetLabel/_presetHint pour éviter d'appeler I18n.t() au load). Seuls
// kmh (donnée) et icon (cosmétique stable) restent ici.
const ITI_SPEED_PRESETS = {
  blesse:  { kmh: 2, icon: "🤕" },
  lente:   { kmh: 3, icon: "🐌" },
  normale: { kmh: 5, icon: "🚶" },
  rapide:  { kmh: 7, icon: "🏃" }
};
// Résolution i18n au rendu (jamais au load). Clés iti.speed.<key>.label/.hint
function _presetLabel(key) { return window.I18n.t("iti.speed." + key + ".label"); }
function _presetHint(key)  { return window.I18n.t("iti.speed." + key + ".hint"); }
const DEFAULT_ITI_SPEED       = "normale";
const ITI_SPEED_STORAGE_KEY   = "myktamap_iti_walking_preset";

// 🆕 v1.23.0 (KARMA "rajoute dans le modal itineraire un temps de pause
// définissable entre chaque point en minutes") : la pause par arrêt
// intermédiaire est désormais CONFIGURABLE :
//   • Checkbox "Inclure pause entre arrêts" (default ON = comportement v1.22.x)
//   • Input minutes par pause (default 15 min)
// Persistance : localStorage. Le Mode Secours (secoursMode.js > _recalculer-
// ItineraireGroupe) lit les mêmes prefs pour cohérence cross-feature.
const TEMPS_PAUSE_PAR_POINT_MIN_DEFAULT = 15;
const ITI_PAUSE_ENABLED_STORAGE_KEY     = "myktamap_iti_pause_enabled";
const ITI_PAUSE_MINUTES_STORAGE_KEY     = "myktamap_iti_pause_minutes";

function _getItiPauseEnabled() {
  try {
    const v = localStorage.getItem(ITI_PAUSE_ENABLED_STORAGE_KEY);
    if (v === null || v === undefined) return true;   // default ON
    return v === "1" || v === "true";
  } catch(e) { return true; }
}
function _setItiPauseEnabled(enabled) {
  try { localStorage.setItem(ITI_PAUSE_ENABLED_STORAGE_KEY, enabled ? "1" : "0"); } catch(e) {}
}
function _getItiPauseMinutes() {
  try {
    const v = parseFloat(localStorage.getItem(ITI_PAUSE_MINUTES_STORAGE_KEY));
    if (!isFinite(v) || v < 0) return TEMPS_PAUSE_PAR_POINT_MIN_DEFAULT;
    return Math.min(120, v);   // cap dur 2h (anti-doigt qui glisse sur l'input)
  } catch(e) { return TEMPS_PAUSE_PAR_POINT_MIN_DEFAULT; }
}
function _setItiPauseMinutes(min) {
  const v = Math.max(0, Math.min(120, parseFloat(min) || 0));
  try { localStorage.setItem(ITI_PAUSE_MINUTES_STORAGE_KEY, String(v)); } catch(e) {}
}
// Exposé globalement pour que js/secoursMode.js réutilise les mêmes prefs
// (cohérence cross-feature : si l'user change la pause dans itinéraire, ça
// s'applique aussi au calcul des durées Mode Secours).
window.getItiPauseEnabled = _getItiPauseEnabled;
window.getItiPauseMinutes = _getItiPauseMinutes;
// 🆕 v1.23.6 — Setters exposés pour permettre à Mode Secours (et autres
// modules futurs) de modifier la pause depuis leur propre UI. Persistance
// localStorage immédiate via _setItiPauseEnabled/_setItiPauseMinutes.
// Pas de side-effect global au set (pas de re-render auto) — le caller
// est responsable de recalculer ce qui dépend de la pause (durées
// estimées d'itinéraire, durées d'équipes Mode Secours, etc.).
window.setItiPauseEnabled = _setItiPauseEnabled;
window.setItiPauseMinutes = _setItiPauseMinutes;

function _getItiSpeedPreset() {
  try {
    let stored = localStorage.getItem(ITI_SPEED_STORAGE_KEY);
    // 🆕 v1.26.3 — Micro-migration : ancien preset "bourre" renommé "blesse"
    // (professionnalisation). Réécrit la valeur pour garder le réglage user.
    if (stored === "bourre") {
      stored = "blesse";
      try { localStorage.setItem(ITI_SPEED_STORAGE_KEY, stored); } catch(e) {}
    }
    if (stored && ITI_SPEED_PRESETS[stored]) return stored;
  } catch(e) {}
  return DEFAULT_ITI_SPEED;
}

function _setItiSpeedPreset(preset) {
  if (!ITI_SPEED_PRESETS[preset]) return false;
  try { localStorage.setItem(ITI_SPEED_STORAGE_KEY, preset); } catch(e) {}
  // Re-rendu du label bottomleft (la durée change avec la nouvelle vitesse)
  if (typeof window._majLabelDistanceItineraire === "function") {
    window._majLabelDistanceItineraire();
  }
  return true;
}

function _vitesseMarcheKmh() {
  const preset = _getItiSpeedPreset();
  return ITI_SPEED_PRESETS[preset].kmh;
}

// Retourne le temps total estime en minutes : marche + pauses intermediaires.
// 🆕 v1.23.0 : pause configurable via _getItiPauseEnabled + _getItiPauseMinutes
function _tempsItineraireMinutes(distanceM, nbWaypoints) {
  if (typeof distanceM !== "number" || distanceM <= 0) return 0;
  const tempsMarcheMin = distanceM / (_vitesseMarcheKmh() * 1000 / 60);  // m / (m/min)
  const nbPausesInter  = Math.max(0, (nbWaypoints || 0) - 2);
  const pauseEnabled   = _getItiPauseEnabled();
  const pauseMin       = pauseEnabled ? _getItiPauseMinutes() : 0;
  const tempsPauseMin  = nbPausesInter * pauseMin;
  return tempsMarcheMin + tempsPauseMin;
}
// Exposé globalement pour cohérence cross-feature (Mode Secours utilise le même)
window.getItiTempsMinutes = _tempsItineraireMinutes;

// Formate une duree en minutes : "X min" si < 60, "Xh YY" sinon.
function _formatTempsMinutes(totalMin) {
  if (!totalMin || totalMin < 1) return window.I18n.t("iti.time.lessMin");
  if (totalMin < 60) return window.I18n.t("iti.time.min", { n: Math.round(totalMin) });
  const heures  = Math.floor(totalMin / 60);
  const minutes = Math.round(totalMin - heures * 60);
  return window.I18n.t("iti.time.hourMin", { h: heures, m: (minutes < 10 ? "0" + minutes : minutes) });
}

function _afficherLabelDistanceItineraire(distanceM, nbWaypoints) {
  if (!window.map) return;
  // Détection d'un contrôle "détaché" : après un plan switch, map.remove()
  // a été appelé et le contrôle n'est plus rattaché à la map. _itiDistanceCtrl._map
  // devient null/undefined → on doit re-créer le contrôle, pas réutiliser l'ancien.
  if (!_itiDistanceCtrl || !_itiDistanceCtrl._map) {
    _itiDistanceCtrl = L.control({ position: "bottomleft" });
    _itiDistanceCtrl.onAdd = function() {
      const div = L.DomUtil.create("div", "leaflet-bar leaflet-control kta-iti-distance");
      div.innerHTML = '<span class="kta-iti-distance-icon">🗺️</span>' + window.I18n.t("iti.label.empty");
      // Raccourci : clic sur le label → ouvre la modale itineraire (mode
      // navigation ou calcul selon presence d'un itineraire actif).
      div.style.cursor = "pointer";
      div.title = window.I18n.t("iti.label.openMenu");
      // Empecher Leaflet de capturer les events (sinon clic propage a la map)
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(div, "click", function() {
        if (typeof window.ouvrirItinerairModal === "function") {
          window.ouvrirItinerairModal();
        }
      });
      return div;
    };
    _itiDistanceCtrl.addTo(window.map);
  }
  const el = document.querySelector(".kta-iti-distance");
  if (el) {
    el.style.display = "block";
    const presetKey  = _getItiSpeedPreset();
    const preset     = ITI_SPEED_PRESETS[presetKey];
    const tempsMin   = _tempsItineraireMinutes(distanceM, nbWaypoints);
    const distFmt    = window.formatDistance(distanceM, 1);
    const tempsFmt   = _formatTempsMinutes(tempsMin);
    const nbPausesInter = Math.max(0, (nbWaypoints || 0) - 2);
    const presetLabel = _presetLabel(presetKey);
    el.innerHTML =
      '<span class="kta-iti-distance-icon">🗺️</span>' +
      '<span class="kta-iti-distance-val">' + distFmt + '</span>' +
      '<span class="kta-iti-distance-sep">·</span>' +
      '<span class="kta-iti-distance-time">⏱️ ' + tempsFmt + '</span>' +
      '<span class="kta-iti-distance-sep">·</span>' +
      '<span class="kta-iti-distance-speed" title="' +
        window.I18n.t("iti.label.speedTitle", { label: presetLabel, kmh: preset.kmh }) + '">' +
        preset.icon + ' ' + presetLabel +
      '</span>';
    // Tooltip detaille pour la breakdown (vitesse + nb pauses)
    // 🆕 v1.23.0 : pause configurable → lit la valeur dynamique
    const pauseActive = _getItiPauseEnabled();
    const pauseMin    = _getItiPauseMinutes();
    const pausePart   = (nbPausesInter > 0 && pauseActive && pauseMin > 0)
      ? window.I18n.t(nbPausesInter > 1 ? "iti.label.pausesPart" : "iti.label.pausePart",
                      { n: nbPausesInter, min: pauseMin })
      : "";
    el.title = window.I18n.t("iti.label.tooltip", {
      dist:  distFmt,
      time:  tempsFmt,
      label: presetLabel,
      kmh:   preset.kmh,
      pauses: pausePart
    });
  }
}

function _masquerLabelDistanceItineraire() {
  const el = document.querySelector(".kta-iti-distance");
  if (el) el.style.display = "none";
}

// Recalcule la distance d'un tracé itinerary à partir de ses points (en pixels
// plan) et la convertit en mètres via APP_CONFIG.scale (px/m).
function _distanceItineraireMeters(road) {
  if (!road || !Array.isArray(road.points) || road.points.length < 2) return 0;
  let totalPx = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    totalPx += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
  return totalPx / scale;
}

// Met à jour le label de distance en fonction de l'état actuel des roads.
// À appeler après chaque setRoads / save / discard / plan switch / session restore.
function _majLabelDistanceItineraire() {
  if (!window.getRoads || !window.map) return;
  const itineraryRoad = window.getRoads().find(function(r) { return r.type === "itinerary"; });
  if (itineraryRoad) {
    const distM = _distanceItineraireMeters(itineraryRoad);
    const nbWp  = Array.isArray(itineraryRoad.waypoints) ? itineraryRoad.waypoints.length : 2;
    _afficherLabelDistanceItineraire(distM, nbWp);
  } else {
    _masquerLabelDistanceItineraire();
  }
}
// Exposé globalement pour que main.js puisse appeler après lancerApplication
window._majLabelDistanceItineraire = _majLabelDistanceItineraire;

let _itineraryWaypoints   = [];
let _itineraryMarkerLayer = null;     // layer Leaflet contenant les markers numérotés
let _itineraryClickActive = false;
let _itineraryClickHandler = null;

// 🆕 v1.34.27 — Expose les waypoints de l'iti actif en lecture seule pour que
// tracking.js puisse détecter quand l'user arrive à proximité (vibration
// haptique de proximité 100px, cf tracking.js _checkWaypointProximity).
// Retourne une COPIE pour empêcher la mutation côté caller.
window.getItineraireWaypoints = function() {
  return _itineraryWaypoints.slice();
};

function _ajouterWaypointVisuel(p, num) {
  if (!window.map) return;
  // Idem _afficherLabelDistanceItineraire : si l'ancien layerGroup a été détaché
  // par un plan switch (map.remove() précédent), on doit le recréer avant
  // d'ajouter des markers — sinon ils sont attachés à un layer mort qui
  // n'apparaîtra jamais sur la nouvelle map.
  if (!_itineraryMarkerLayer || !_itineraryMarkerLayer._map) {
    _itineraryMarkerLayer = L.layerGroup().addTo(window.map);
  }
  const icon = L.divIcon({
    className: "kta-itinerary-waypoint",
    html: '<div class="kta-iti-num">' + num + '</div>',
    iconSize:  [28, 28],
    iconAnchor: [14, 14]
  });
  const m = L.marker(convertCoord(p.x, p.y), { icon: icon, interactive: false })
              .addTo(_itineraryMarkerLayer);
  return m;
}

function _redessinerWaypoints() {
  if (_itineraryMarkerLayer) {
    _itineraryMarkerLayer.clearLayers();
  }
  _itineraryWaypoints.forEach(function(p, i) {
    _ajouterWaypointVisuel(p, i + 1);
  });
  _rafraichirListeWaypointsModale();
}

function _rafraichirListeWaypointsModale() {
  const cont = document.getElementById("kta-iti-waypoints-list");
  if (!cont) return;
  if (_itineraryWaypoints.length === 0) {
    cont.innerHTML = '<div class="kta-iti-empty">' + window.I18n.t("iti.wp.empty") + '</div>';
    return;
  }
  cont.innerHTML = _itineraryWaypoints.map(function(p, i) {
    const label = p.label || window.I18n.t("iti.wp.coordShort", { x: Math.round(p.x), y: Math.round(p.y) });
    // 3 sources possibles : "search" (point existant), "tracker" (position
    // tracker), "click" (par defaut, clic carte). Icone + title adaptes.
    let sourceIcon, sourceTitle, sourceClass;
    if (p.source === "search") {
      sourceIcon  = "🎯";
      sourceTitle = window.I18n.t("iti.wp.srcSearch");
      sourceClass = "";
    } else if (p.source === "tracker") {
      sourceIcon  = "📍";
      sourceTitle = window.I18n.t("iti.wp.srcTracker");
      sourceClass = " kta-iti-wp-icon-tracker";
    } else {
      sourceIcon  = "📍";
      sourceTitle = window.I18n.t("iti.wp.srcClick");
      sourceClass = "";
    }
    return '<div class="kta-iti-wp-row">' +
             '<span class="kta-iti-wp-num">' + (i + 1) + '</span>' +
             '<span class="kta-iti-wp-icon' + sourceClass + '" title="' + sourceTitle + '">' + sourceIcon + '</span>' +
             '<span class="kta-iti-wp-coord">' + _escapeHtml(label) + '</span>' +
             '<button class="kta-iti-wp-goto"   data-idx="' + i + '" title="' + window.I18n.t("iti.wp.gotoTitle") + '">🎯</button>' +
             '<button class="kta-iti-wp-remove" data-idx="' + i + '" title="' + window.I18n.t("iti.wp.removeTitle") + '">✕</button>' +
           '</div>';
  }).join("");
  // Wire-up des boutons retirer
  Array.from(cont.querySelectorAll(".kta-iti-wp-remove")).forEach(function(btn) {
    btn.addEventListener("click", function() {
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx >= 0 && idx < _itineraryWaypoints.length) {
        _itineraryWaypoints.splice(idx, 1);
        _redessinerWaypoints();
        _majPanneauFloaterCount();
      }
    });
  });
  // Wire-up des boutons "aller à"
  Array.from(cont.querySelectorAll(".kta-iti-wp-goto")).forEach(function(btn) {
    btn.addEventListener("click", function() {
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx >= 0 && idx < _itineraryWaypoints.length) {
        const p = _itineraryWaypoints[idx];
        // Ferme la modale pour laisser voir la map (comportement style search)
        const modal = document.getElementById("kta-itinerary-modal");
        if (modal) modal.remove();
        _panEtFlashSurPoint(p);
      }
    });
  });
}

function _activerModeClicCarte() {
  if (_itineraryClickActive) return;
  _itineraryClickActive = true;
  if (window.map) {
    _itineraryClickHandler = function(e) {
      // Coords plan (cf. convention du projet : convertCoord inverse y)
      const x = e.latlng.lng;
      const y = APP_CONFIG.imageHeight - e.latlng.lat;
      _itineraryWaypoints.push({ x: x, y: y, source: "click" });
      _ajouterWaypointVisuel({ x: x, y: y }, _itineraryWaypoints.length);
      _rafraichirListeWaypointsModale();
      _majPanneauFloaterCount();
    };
    window.map.on("click", _itineraryClickHandler);
  }
}

function _desactiverModeClicCarte() {
  if (!_itineraryClickActive) return;
  _itineraryClickActive = false;
  if (window.map && _itineraryClickHandler) {
    window.map.off("click", _itineraryClickHandler);
  }
  _itineraryClickHandler = null;
}

function _viderItineraire() {
  _itineraryWaypoints = [];
  if (_itineraryMarkerLayer) {
    _itineraryMarkerLayer.clearLayers();
  }
}

// Mini panneau flottant en bas d'écran pendant le mode clic, pour ne pas
// bloquer la carte. Bouton "✓ Terminer" → re-affiche la modale principale.
let _itineraryFloater = null;
function _afficherPanneauItineraireFlottant(mainModal) {
  if (_itineraryFloater) _itineraryFloater.remove();
  const panneau = document.createElement("div");
  panneau.id = "kta-iti-floater";
  panneau.className = "kta-iti-floater";
  panneau.innerHTML =
    '<span class="kta-iti-floater-icon">📍</span>' +
    '<span class="kta-iti-floater-msg">' +
      window.I18n.t("iti.floater.clickMsg", { count: '<strong id="kta-iti-floater-count">' + _itineraryWaypoints.length + '</strong>' }) +
    '</span>' +
    '<button class="kta-btn kta-btn-primary" id="kta-iti-floater-done" type="button">' + window.I18n.t("iti.floater.done") + '</button>';
  document.body.appendChild(panneau);
  _itineraryFloater = panneau;

  document.getElementById("kta-iti-floater-done").addEventListener("click", function() {
    _desactiverModeClicCarte();
    if (_itineraryFloater) { _itineraryFloater.remove(); _itineraryFloater = null; }
    if (mainModal) {
      mainModal.style.display = "";
      _rafraichirListeWaypointsModale();
      const btn = document.getElementById("kta-iti-mode-click");
      if (btn) {
        btn.textContent = window.I18n.t("iti.btn.modeClickActivate");
        btn.classList.remove("kta-actif");
      }
    }
  });
}

function _majPanneauFloaterCount() {
  const el = document.getElementById("kta-iti-floater-count");
  if (el) el.textContent = _itineraryWaypoints.length;
}

// =========================
// 🚫 EVITEMENTS ITINERAIRE — preferences par plan (depuis v169 / Karma_dev)
// =========================
// Stockage localStorage par planId : { points: [{x,y,label,id?}], tags: [], radius: 100 }
// Restauration a l'ouverture de la modale itineraire, ecriture a chaque
// modification (ajout/suppression/changement radius). Reset via bouton dedie.

const ITI_AVOID_LS_PREFIX = "myktamap_route_avoid_";
const ITI_AVOID_DEFAULT_RADIUS = 100;

function _itiAvoidLsKey() {
  const planId = window._currentLoadedPlanId || "default";
  return ITI_AVOID_LS_PREFIX + planId;
}

function _getItiAvoidPrefs() {
  try {
    const raw = localStorage.getItem(_itiAvoidLsKey());
    if (!raw) return { points: [], tags: [], radius: ITI_AVOID_DEFAULT_RADIUS };
    const obj = JSON.parse(raw);
    return {
      points: Array.isArray(obj.points) ? obj.points : [],
      tags:   Array.isArray(obj.tags)   ? obj.tags   : [],
      radius: Number.isFinite(obj.radius) ? obj.radius : ITI_AVOID_DEFAULT_RADIUS
    };
  } catch(e) {
    return { points: [], tags: [], radius: ITI_AVOID_DEFAULT_RADIUS };
  }
}

function _setItiAvoidPrefs(prefs) {
  try {
    localStorage.setItem(_itiAvoidLsKey(), JSON.stringify(prefs));
  } catch(e) {}
}

// Liste des tags presents dans le plan (depuis SearchPoints) pour le dropdown
// "+ Ajouter un tag a eviter". Distincts, tries alphabetiquement.
// ASYNC depuis v169 : SearchPoints.getAllPoints est async (cache fetch). Le
// 1er appel peut prendre 1 frame, les suivants sont en cache. Structure des
// retours : [{point, source, layerId}, ...] — on lit `.point.tags`.
async function _itiAvoidGetAvailableTags() {
  if (typeof window.SearchPoints !== "object" ||
      typeof window.SearchPoints.getAllPoints !== "function") {
    return [];
  }
  try {
    const all = await window.SearchPoints.getAllPoints();
    if (!Array.isArray(all)) return [];
    const set = new Set();
    all.forEach(function(it) {
      const p = it && it.point;
      if (p && Array.isArray(p.tags)) {
        p.tags.forEach(function(t) { if (t) set.add(t); });
      }
    });
    return Array.from(set).sort();
  } catch(e) { return []; }
}

// 🚫 v169 (Karma_dev) : mode clic carte pour ajouter des points d'évitement
// directement en cliquant sur la map. Réutilise le pattern des waypoints mais
// avec un état séparé (sinon conflit avec le mode clic des waypoints).
//
// Flow :
//   1. Click bouton "📍 Cliquer sur la carte" → _activerModeClicAvoid
//   2. Modale cachée + floater orange "Mode clic évitement actif"
//   3. Chaque clic sur la map ajoute aux avoidPoints + persiste localStorage
//   4. Click "✓ Terminer" sur le floater → _desactiverModeClicAvoid + re-affiche modale

let _itiAvoidClickActive  = false;
let _itiAvoidClickHandler = null;
let _itiAvoidFloater      = null;

function _activerModeClicAvoid(mainModal) {
  if (_itiAvoidClickActive) return;
  _itiAvoidClickActive = true;
  if (!window.map) return;

  _itiAvoidClickHandler = function(e) {
    const x = e.latlng.lng;
    const y = APP_CONFIG.imageHeight - e.latlng.lat;
    const prefs = _getItiAvoidPrefs();
    prefs.points.push({
      x:     x,
      y:     y,
      label: window.I18n.t("iti.avoid.clickLabel", { x: Math.round(x), y: Math.round(y) }),
      id:    null
    });
    _setItiAvoidPrefs(prefs);
    _majPanneauFloaterAvoidCount();
  };
  window.map.on("click", _itiAvoidClickHandler);

  // Cache la modale (pas remove → on garde son DOM pour réafficher)
  if (mainModal) mainModal.style.display = "none";

  // Floater orange (couleur thématique avoid) avec compteur live
  if (_itiAvoidFloater) _itiAvoidFloater.remove();
  const panneau = document.createElement("div");
  panneau.id = "kta-iti-avoid-floater";
  panneau.className = "kta-iti-floater kta-iti-avoid-floater";
  panneau.innerHTML =
    '<span class="kta-iti-floater-icon">🚫</span>' +
    '<span class="kta-iti-floater-msg">' +
      window.I18n.t("iti.avoid.floaterMsg", { count: '<strong id="kta-iti-avoid-floater-count">' + _getItiAvoidPrefs().points.length + '</strong>' }) +
    '</span>' +
    '<button class="kta-btn kta-btn-primary" id="kta-iti-avoid-floater-done" type="button">' + window.I18n.t("iti.floater.done") + '</button>';
  document.body.appendChild(panneau);
  _itiAvoidFloater = panneau;

  document.getElementById("kta-iti-avoid-floater-done").addEventListener("click", function() {
    _desactiverModeClicAvoid();
    if (mainModal) {
      mainModal.style.display = "";
      _rafraichirListeAvoidPoints();
      const btn = document.getElementById("kta-iti-avoid-click-map");
      if (btn) {
        btn.textContent = window.I18n.t("iti.avoid.clickMapBtn");
        btn.classList.remove("kta-actif");
      }
    }
  });
}

function _desactiverModeClicAvoid() {
  if (!_itiAvoidClickActive) return;
  _itiAvoidClickActive = false;
  if (window.map && _itiAvoidClickHandler) {
    window.map.off("click", _itiAvoidClickHandler);
  }
  _itiAvoidClickHandler = null;
  if (_itiAvoidFloater) {
    _itiAvoidFloater.remove();
    _itiAvoidFloater = null;
  }
}

function _majPanneauFloaterAvoidCount() {
  const el = document.getElementById("kta-iti-avoid-floater-count");
  if (el) el.textContent = _getItiAvoidPrefs().points.length;
}

// Genere le HTML de la section "🚫 Preferences d'evitement" pour la modale
// itineraire. Replie par defaut via <details> (HTML natif). Composants :
//   - Recherche autocomplete (input + dropdown resultats)
//   - Saisie ID texte + bouton Ajouter
//   - Multi-select des tags (chips cliquables)
//   - Champ marge (px)
//   - Liste des points evites avec ✕
//   - Bouton 🗑️ Reset
function _htmlSectionAvoidItineraire(prefs) {
  const radiusVal = Number.isFinite(prefs.radius) ? prefs.radius : ITI_AVOID_DEFAULT_RADIUS;
  return '' +
    '<div class="kta-iti-section">' +
      '<details class="kta-iti-avoid-details">' +
        '<summary class="kta-iti-section-titre" style="cursor:pointer;">' + window.I18n.t("iti.avoid.title") + '</summary>' +
        '<p class="kta-iti-help">' +
          window.I18n.t("iti.avoid.help") +
        '</p>' +

        // === Points à éviter ===
        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.avoid.pointsTitle") + '</div>' +
          '<div class="kta-iti-avoid-search-wrap">' +
            '<input type="text" id="kta-iti-avoid-search-input" class="kta-cfg-input" ' +
              'placeholder="' + window.I18n.t("iti.avoid.searchPlaceholder") + '" autocomplete="off">' +
            '<div id="kta-iti-avoid-search-results" class="kta-iti-search-results"></div>' +
          '</div>' +
          '<div class="kta-iti-avoid-byid-wrap">' +
            '<input type="text" id="kta-iti-avoid-byid-input" class="kta-cfg-input" ' +
              'placeholder="' + window.I18n.t("iti.avoid.byIdPlaceholder") + '" autocomplete="off" style="flex:1;">' +
            '<button id="kta-iti-avoid-byid-add" class="kta-btn kta-btn-ghost kta-btn-small" type="button">' + window.I18n.t("iti.avoid.byIdAdd") + '</button>' +
          '</div>' +
          // 🚫 v169 (Karma_dev) : bouton mode clic carte — bascule la modale en
          // floater, chaque clic sur la map ajoute un point d'évitement
          '<button id="kta-iti-avoid-click-map" class="kta-btn kta-btn-ghost kta-btn-small" type="button" style="margin-bottom:8px;">' + window.I18n.t("iti.avoid.clickMapBtn") + '</button>' +
          '<div id="kta-iti-avoid-points-list" class="kta-iti-avoid-list"></div>' +
        '</div>' +

        // === Tags à éviter ===
        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.avoid.tagsTitle") + '</div>' +
          '<p class="kta-iti-help" style="margin:2px 0 6px; font-size:11.5px;">' +
            window.I18n.t("iti.avoid.tagsHelp") +
          '</p>' +
          '<div id="kta-iti-avoid-tags-chips" class="kta-iti-avoid-tags-chips"></div>' +
        '</div>' +

        // === Marge ===
        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.avoid.marginTitle") + '</div>' +
          '<div style="display:flex; align-items:center; gap:8px;">' +
            '<input type="number" id="kta-iti-avoid-radius" class="kta-cfg-input" ' +
              'value="' + radiusVal + '" min="0" max="500" step="10" style="width:90px;">' +
            '<span style="font-size:12px; color:#8892a4;">' + window.I18n.t("iti.avoid.marginUnit") + '</span>' +
          '</div>' +
        '</div>' +

        // === Reset ===
        '<button id="kta-iti-avoid-reset" class="kta-btn kta-btn-ghost kta-btn-small" type="button" style="margin-top:6px;">' + window.I18n.t("iti.avoid.reset") + '</button>' +
      '</details>' +
    '</div>';
}

// Re-rendu de la liste des points evites (chips avec ✕). Appelle apres
// chaque ajout/suppression. Lit prefs depuis localStorage.
function _rafraichirListeAvoidPoints() {
  const el = document.getElementById("kta-iti-avoid-points-list");
  if (!el) return;
  const prefs = _getItiAvoidPrefs();
  if (prefs.points.length === 0) {
    el.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">' + window.I18n.t("iti.avoid.listEmpty") + '</p>';
    return;
  }
  function _esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  el.innerHTML = prefs.points.map(function(p, idx) {
    return '<div class="kta-iti-avoid-chip">' +
             '<span class="kta-iti-avoid-chip-label">' + _esc(p.label || p.id || ("(" + p.x.toFixed(0) + "," + p.y.toFixed(0) + ")")) + '</span>' +
             '<button class="kta-iti-avoid-chip-remove" data-idx="' + idx + '" type="button" title="' + window.I18n.t("iti.avoid.chipRemove") + '">✕</button>' +
           '</div>';
  }).join("");
  // Bind retraits
  el.querySelectorAll(".kta-iti-avoid-chip-remove").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const i = parseInt(btn.getAttribute("data-idx"), 10);
      if (!Number.isInteger(i)) return;
      const prefs2 = _getItiAvoidPrefs();
      prefs2.points.splice(i, 1);
      _setItiAvoidPrefs(prefs2);
      _rafraichirListeAvoidPoints();
    });
  });
}

// Re-rendu des chips de tags avec etat actif/inactif selon prefs.tags.
// ASYNC depuis v169 (await _itiAvoidGetAvailableTags). Pendant le chargement,
// on affiche un placeholder "Chargement…" pour ne pas laisser un vide visible.
async function _rafraichirChipsAvoidTags() {
  const el = document.getElementById("kta-iti-avoid-tags-chips");
  if (!el) return;
  el.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">' + window.I18n.t("iti.avoid.tagsLoading") + '</p>';
  const prefs = _getItiAvoidPrefs();
  const available = await _itiAvoidGetAvailableTags();
  // Si l'utilisateur a deja ferme la modale entre temps, le sub-element peut
  // ne plus exister — on re-check.
  const el2 = document.getElementById("kta-iti-avoid-tags-chips");
  if (!el2) return;
  if (available.length === 0) {
    el2.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">' + window.I18n.t("iti.avoid.tagsNone") + '</p>';
    return;
  }
  function _esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  el2.innerHTML = available.map(function(tag) {
    const active = prefs.tags.indexOf(tag) >= 0;
    return '<button class="kta-iti-avoid-tag-chip' + (active ? ' kta-iti-avoid-tag-chip-active' : '') + '" ' +
             'data-tag="' + _esc(tag) + '" type="button">' +
             (active ? '🚫 ' : '') + _esc(tag) +
           '</button>';
  }).join("");
  el2.querySelectorAll(".kta-iti-avoid-tag-chip").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const tag = btn.getAttribute("data-tag");
      const prefs2 = _getItiAvoidPrefs();
      const idx = prefs2.tags.indexOf(tag);
      if (idx >= 0) prefs2.tags.splice(idx, 1);
      else prefs2.tags.push(tag);
      _setItiAvoidPrefs(prefs2);
      _rafraichirChipsAvoidTags();
    });
  });
}

// Setup des handlers de la section evitement (recherche, ajout par ID, radius,
// reset). Appele apres injection du HTML dans la modale itineraire.
function _bindAvoidSectionHandlers() {
  // 1. Recherche autocomplete : reuse SearchPoints.findByQuery (ASYNC).
  // Structure retournee : [{point, source, layerId}, ...] — on lit `.point.*`.
  // Debounce 150ms pour eviter de spam le fetch a chaque keystroke.
  const searchInput = document.getElementById("kta-iti-avoid-search-input");
  const searchRes   = document.getElementById("kta-iti-avoid-search-results");
  if (searchInput && searchRes && window.SearchPoints &&
      typeof window.SearchPoints.findByQuery === "function") {
    let _searchDebounce = null;
    searchInput.addEventListener("input", function() {
      const q = searchInput.value.trim();
      if (_searchDebounce) clearTimeout(_searchDebounce);
      if (!q) { searchRes.innerHTML = ""; searchRes.style.display = "none"; return; }
      _searchDebounce = setTimeout(async function() {
        let results = [];
        try { results = await window.SearchPoints.findByQuery(q) || []; }
        catch(e) { results = []; }
        // Si l'input a change entre temps, on annule (la prochaine query
        // viendra en remplacement)
        if (searchInput.value.trim() !== q) return;
        if (results.length === 0) {
          searchRes.innerHTML = '<div class="kta-iti-search-result-empty">' + window.I18n.t("iti.search.noPoint") + '</div>';
          searchRes.style.display = "block";
          return;
        }
        function _esc(s) {
          return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        searchRes.innerHTML = results.slice(0, 10).map(function(it, i) {
          const p = it.point;
          const label = p.nom || p.id || window.I18n.t("iti.search.unnamed");
          const sub   = p.id  ? p.id : "";
          return '<div class="kta-iti-search-result" data-idx="' + i + '">' +
                   '<strong>' + _esc(label) + '</strong>' +
                   (sub ? ' <span style="color:#8892a4;">(' + _esc(sub) + ')</span>' : '') +
                 '</div>';
        }).join("");
        searchRes.style.display = "block";
        // 🆕 v1.44.0 — Event delegation sur searchRes (conteneur stable) au
        // lieu de N listeners individuels par row (re-créés à chaque keypress).
        // Évite l'accumulation transitoire de closures.
        // On stocke `results` au scope du handler ; chaque row a son data-idx.
        searchRes._lastResults = results;
      }, 150);
    });

    // 🆕 v1.44.0 — Listener délégué attaché UNE FOIS au build de la modale
    // (pas à chaque input). data-idx référence l'index dans `_lastResults`.
    if (!searchRes._delegateBound) {
      searchRes._delegateBound = true;
      searchRes.addEventListener("click", function(e) {
        const row = e.target && e.target.closest ? e.target.closest(".kta-iti-search-result") : null;
        if (!row || !searchRes.contains(row)) return;
        const idx = parseInt(row.getAttribute("data-idx"), 10);
        const results = searchRes._lastResults || [];
        const it = results[idx];
        if (!it || !it.point) return;
        const p = it.point;
        const prefs2 = _getItiAvoidPrefs();
        prefs2.points.push({
          x:     p.x,
          y:     p.y,
          label: p.nom || p.id || ("(" + (p.x ?? 0).toFixed(0) + "," + (p.y ?? 0).toFixed(0) + ")"),
          id:    p.id || null
        });
        _setItiAvoidPrefs(prefs2);
        _rafraichirListeAvoidPoints();
        searchInput.value = "";
        searchRes.innerHTML = "";
        searchRes.style.display = "none";
      });
    }
  }

  // 2. Ajout par ID texte
  const idInput = document.getElementById("kta-iti-avoid-byid-input");
  const idBtn   = document.getElementById("kta-iti-avoid-byid-add");
  if (idInput && idBtn && window.Pathfinder &&
      typeof window.Pathfinder.resolvePointById === "function") {
    function _ajouterParId() {
      const id = idInput.value.trim();
      if (!id) return;
      const resolved = window.Pathfinder.resolvePointById(id);
      if (!resolved) {
        alert(window.I18n.t("iti.err.idNotFound", { id: id }));
        return;
      }
      const prefs2 = _getItiAvoidPrefs();
      prefs2.points.push({
        x:     resolved.x,
        y:     resolved.y,
        label: (resolved.point && (resolved.point.nom || resolved.point.id)) || id,
        id:    (resolved.point && resolved.point.id) || id
      });
      _setItiAvoidPrefs(prefs2);
      _rafraichirListeAvoidPoints();
      idInput.value = "";
    }
    idBtn.addEventListener("click", _ajouterParId);
    idInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") { e.preventDefault(); _ajouterParId(); }
    });
  }

  // 2bis. 🚫 v169 (Karma_dev) : mode clic carte — bascule en floater, chaque
  // clic ajoute un point. Coexiste avec le mode clic waypoints (handlers
  // séparés via _itiAvoidClickHandler) → si l'user active les 2 modes en
  // même temps, c'est OK (clics partagés) mais peu utile en pratique.
  const clickMapBtn = document.getElementById("kta-iti-avoid-click-map");
  if (clickMapBtn) {
    clickMapBtn.addEventListener("click", function() {
      const mainModal = document.getElementById("kta-itinerary-modal");
      _activerModeClicAvoid(mainModal);
      // Indicateur visuel (devient inactif au "✓ Terminer" du floater)
      clickMapBtn.classList.add("kta-actif");
      clickMapBtn.textContent = window.I18n.t("iti.avoid.clickMapActive");
    });
  }

  // 3. Champ radius
  const radiusInput = document.getElementById("kta-iti-avoid-radius");
  if (radiusInput) {
    radiusInput.addEventListener("change", function() {
      const v = parseInt(radiusInput.value, 10);
      const prefs2 = _getItiAvoidPrefs();
      prefs2.radius = (Number.isFinite(v) && v >= 0) ? v : ITI_AVOID_DEFAULT_RADIUS;
      _setItiAvoidPrefs(prefs2);
    });
  }

  // 4. Reset complet
  const resetBtn = document.getElementById("kta-iti-avoid-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function() {
      if (!confirm(window.I18n.t("iti.avoid.resetConfirm"))) return;
      _setItiAvoidPrefs({ points: [], tags: [], radius: ITI_AVOID_DEFAULT_RADIUS });
      _rafraichirListeAvoidPoints();
      _rafraichirChipsAvoidTags();
      if (radiusInput) radiusInput.value = String(ITI_AVOID_DEFAULT_RADIUS);
    });
  }

  // Premier rendu des chips + liste
  _rafraichirListeAvoidPoints();
  _rafraichirChipsAvoidTags();
}

window.ouvrirItinerairModal = function() {
  // Si une modale existe déjà, on la ferme et reset l'état
  const existing = document.getElementById("kta-itinerary-modal");
  if (existing) existing.remove();

  // Détection itinéraire actif : si une road de type "itinerary" existe,
  // on RESTAURE ses waypoints et on bascule en MODE NAVIGATION
  // (pas de calcul, juste les boutons pour aller voir chaque waypoint).
  const existingItinerary = (window.getRoads ? window.getRoads() : [])
    .find(function(r) { return r.type === "itinerary"; });

  const modeNavigation = !!(existingItinerary && Array.isArray(existingItinerary.waypoints) && existingItinerary.waypoints.length >= 2);

  if (modeNavigation) {
    // Restaure les waypoints et leurs markers visuels
    _itineraryWaypoints = existingItinerary.waypoints.map(function(w) { return Object.assign({}, w); });
    if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
    _itineraryWaypoints.forEach(function(p, i) {
      _ajouterWaypointVisuel(p, i + 1);
    });
  } else {
    _viderItineraire();
  }

  const titre = modeNavigation ? window.I18n.t("iti.modal.titreNav") : window.I18n.t("iti.modal.titreCalc");

  // ===== Section "Points de passage" UNIFIEE (mode calcul + mode navigation) =====
  // Les deux modes ont desormais les memes controles d'edition (ajout/suppression
  // de waypoints) → l'utilisateur peut modifier son itineraire actif sans
  // passer par "Recalculer" qui efface tout et recommence.
  // En mode navigation : on ajoute en plus une quick-nav (Debut/Fin/Tour) au-dessus
  // de la liste, pour acceder rapidement aux extremites du tracé.
  const quickNavHtml = modeNavigation
    ? '<div class="kta-iti-quicknav">' +
        '<button id="kta-iti-nav-debut" class="kta-btn kta-btn-primary" type="button">' + window.I18n.t("iti.nav.start") + '</button>' +
        '<button id="kta-iti-nav-fin"   class="kta-btn kta-btn-primary" type="button">' + window.I18n.t("iti.nav.end") + '</button>' +
        '<button id="kta-iti-nav-tour"  class="kta-btn kta-btn-ghost"   type="button">' + window.I18n.t("iti.nav.tour") + '</button>' +
      '</div>'
    : '';

  const helpText = modeNavigation
    ? window.I18n.t("iti.points.helpNav")
    : window.I18n.t("iti.points.helpCalc");

  const sectionPoints =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">' + window.I18n.t("iti.points.titre") + '</div>' +
      '<p class="kta-iti-help">' + helpText + '</p>' +
      quickNavHtml +
      '<div class="kta-iti-mode-toggle">' +
        '<button id="kta-iti-mode-click" class="kta-btn kta-btn-primary" type="button">' + window.I18n.t("iti.btn.modeClick") + '</button>' +
        '<button id="kta-iti-tracker-pos" class="kta-btn kta-btn-ghost" type="button" style="margin-left:8px;" title="' + window.I18n.t("iti.btn.myPosTitle") + '">' + window.I18n.t("iti.btn.myPos") + '</button>' +
        '<button id="kta-iti-clear" class="kta-btn kta-btn-ghost" type="button" style="margin-left:8px;">' + window.I18n.t("iti.btn.clear") + '</button>' +
      '</div>' +
      '<div class="kta-iti-search-wrap">' +
        '<input type="text" id="kta-iti-search-input" class="kta-cfg-input" ' +
          'placeholder="' + window.I18n.t("iti.search.placeholder") + '" autocomplete="off">' +
        '<div id="kta-iti-search-results" class="kta-iti-search-results"></div>' +
      '</div>' +
      '<div id="kta-iti-waypoints-list" class="kta-iti-waypoints-list"></div>' +
    '</div>';

  // ===== Section action UNIFIEE =====
  // Bouton principal "🎯 Calculer" / "🔄 Recalculer" selon presence d'itineraire.
  // Bouton "❌ Effacer" affiche uniquement si itineraire actif.
  // Statut Distance/Tronçons en haut si mode navigation.
  const computeBtnLabel = modeNavigation ? window.I18n.t("iti.btn.recompute") : window.I18n.t("iti.btn.compute");
  const currentPresetKey = _getItiSpeedPreset();
  const currentPreset    = ITI_SPEED_PRESETS[currentPresetKey];
  let statusActuel = '';
  if (modeNavigation) {
    const distActMeters = _distanceItineraireMeters(existingItinerary);
    const nbWpAct       = Array.isArray(existingItinerary.waypoints) ? existingItinerary.waypoints.length : 2;
    const tempsActMin   = _tempsItineraireMinutes(distActMeters, nbWpAct);
    statusActuel =
      '<div class="kta-iti-result" id="kta-iti-status-block" style="display:block; margin-bottom:10px;" ' +
           'data-distm="' + distActMeters + '" data-nbwp="' + nbWpAct + '">' +
        '<div class="kta-iti-result-row"><strong>' + window.I18n.t("iti.result.distance") + '</strong> ' + window.formatDistance(distActMeters, 1) + '</div>' +
        '<div class="kta-iti-result-row"><strong>' + window.I18n.t("iti.result.time") + '</strong> ' +
          '<span id="kta-iti-temps-val">' + _formatTempsMinutes(tempsActMin) + '</span> ' +
          '<span class="kta-iti-temps-speed-hint" id="kta-iti-temps-speed-hint">(' + currentPreset.icon + ' ' + _presetLabel(currentPresetKey) + ')</span>' +
        '</div>' +
        '<div class="kta-iti-result-row"><strong>' + window.I18n.t("iti.result.segments") + '</strong> ' + (existingItinerary.points.length - 1) + '</div>' +
      '</div>';
  }
  const eraseBtn = modeNavigation
    ? '<button id="kta-iti-erase" class="kta-btn kta-btn-danger" type="button" style="width:100%; margin-top:8px;">' + window.I18n.t("iti.btn.erase") + '</button>'
    : '';
  // Segmented control pour la vitesse de marche (4 presets)
  // currentPresetKey est déjà défini plus haut (avant statusActuel)
  let speedButtonsHtml = "";
  Object.keys(ITI_SPEED_PRESETS).forEach(function(key) {
    const p = ITI_SPEED_PRESETS[key];
    const pLabel = _presetLabel(key);
    const active = (key === currentPresetKey);
    speedButtonsHtml +=
      '<button type="button" class="kta-iti-speed-btn' + (active ? " kta-iti-speed-active" : "") + '" ' +
        'data-speed="' + key + '" ' +
        'title="' + window.I18n.t("iti.speed.btnTitle", { label: pLabel, kmh: p.kmh, hint: _presetHint(key) }) + '">' +
        '<span class="kta-iti-speed-icon">' + p.icon + '</span>' +
        '<span class="kta-iti-speed-label">' + pLabel + '</span>' +
        '<span class="kta-iti-speed-kmh">' + window.I18n.t("iti.speed.kmh", { kmh: p.kmh }) + '</span>' +
      '</button>';
  });
  const sectionVitesse =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">' + window.I18n.t("iti.speed.titre") + '</div>' +
      '<div class="kta-iti-speed-segmented" id="kta-iti-speed-segmented">' +
        speedButtonsHtml +
      '</div>' +
      '<p class="kta-iti-speed-hint">' + window.I18n.t("iti.speed.hint") + '</p>' +
    '</div>';

  // 🆕 v1.23.0 (KARMA "rajoute un temps de pause définissable entre chaque
  // point en minutes... avec un par default auto cocher [système actuel]") :
  // section dédiée Pause configurable. Default = case cochée + 15 min (=
  // comportement v1.22.x strictement préservé).
  const pauseEnabled   = _getItiPauseEnabled();
  const pauseMin       = _getItiPauseMinutes();
  const sectionPause =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">' + window.I18n.t("iti.pause.titre") + '</div>' +
      '<label class="kta-iti-pause-row">' +
        '<input type="checkbox" id="kta-iti-pause-cb"' + (pauseEnabled ? " checked" : "") + '>' +
        '<span>' + window.I18n.t("iti.pause.include") + '</span>' +
      '</label>' +
      '<div class="kta-iti-pause-row" id="kta-iti-pause-min-wrap" ' +
           'style="' + (pauseEnabled ? "" : "opacity:0.5; pointer-events:none;") + '">' +
        '<label for="kta-iti-pause-min" style="flex-shrink:0;">' + window.I18n.t("iti.pause.duration") + '</label>' +
        '<input type="number" id="kta-iti-pause-min" min="0" max="120" step="1" ' +
               'value="' + pauseMin + '" style="width:70px;"> ' + window.I18n.t("iti.pause.minUnit") +
      '</div>' +
      '<p class="kta-iti-speed-hint">' + window.I18n.t("iti.pause.hint") + '</p>' +
    '</div>';

  const sectionAction =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">' + (modeNavigation ? window.I18n.t("iti.action.titreNav") : window.I18n.t("iti.action.titre")) + '</div>' +
      statusActuel +
      '<button id="kta-iti-compute" class="kta-btn kta-btn-primary" type="button" style="width:100%;">' + computeBtnLabel + '</button>' +
      eraseBtn +
      '<div id="kta-iti-result" class="kta-iti-result" style="display:none;"></div>' +
      '<div id="kta-iti-error" class="kta-iti-error" style="display:none;"></div>' +
    '</div>';

  // 🚫 v169 (Karma_dev) : section preferences d'evitement (avancees, repliees
  // par defaut via <details> HTML). Lit les prefs depuis localStorage par
  // planId pour restaurer l'etat entre 2 ouvertures de la modale.
  const sectionAvoid = _htmlSectionAvoidItineraire(_getItiAvoidPrefs());

  const modal = document.createElement("div");
  modal.id = "kta-itinerary-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite kta-iti-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">' + titre + '</span>' +
        '<button class="kta-panneau-close" id="kta-iti-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-iti-corps">' +
        sectionPoints +
        sectionAvoid +
        sectionVitesse +
        sectionPause +
        sectionAction +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);
  _rafraichirListeWaypointsModale();
  _bindAvoidSectionHandlers();

  // Bind du segmented control de vitesse — clic = update preset + refresh
  // visuel des boutons + refresh in-place du temps affiché dans le bloc
  // statusActuel (mode navigation) + refresh du label bottom-left (géré par
  // _setItiSpeedPreset).
  (function bindSpeedSegmented() {
    const wrap = document.getElementById("kta-iti-speed-segmented");
    if (!wrap) return;
    wrap.querySelectorAll(".kta-iti-speed-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const key = btn.getAttribute("data-speed");
        if (!_setItiSpeedPreset(key)) return;
        // Toggle visuel des boutons
        wrap.querySelectorAll(".kta-iti-speed-btn").forEach(function(b) {
          b.classList.toggle("kta-iti-speed-active", b === btn);
        });
        _refreshItiTempsInPlace();
      });
    });
  })();

  // 🆕 v1.23.0 — Bind handlers section Pause (checkbox + input minutes)
  (function bindPauseSection() {
    const cb     = document.getElementById("kta-iti-pause-cb");
    const inp    = document.getElementById("kta-iti-pause-min");
    const wrapM  = document.getElementById("kta-iti-pause-min-wrap");
    if (cb) {
      cb.addEventListener("change", function() {
        _setItiPauseEnabled(cb.checked);
        if (wrapM) {
          wrapM.style.opacity = cb.checked ? "" : "0.5";
          wrapM.style.pointerEvents = cb.checked ? "" : "none";
        }
        _refreshItiTempsInPlace();
        if (typeof window._majLabelDistanceItineraire === "function") {
          window._majLabelDistanceItineraire();
        }
      });
    }
    if (inp) {
      // Change ET input (live feedback pendant la saisie au clavier)
      const _onInput = function() {
        const v = parseFloat(inp.value);
        if (isFinite(v) && v >= 0) {
          _setItiPauseMinutes(v);
          _refreshItiTempsInPlace();
          if (typeof window._majLabelDistanceItineraire === "function") {
            window._majLabelDistanceItineraire();
          }
        }
      };
      inp.addEventListener("input", _onInput);
      inp.addEventListener("change", _onInput);
    }
  })();

  // Helper local : refresh le bloc statusActuel (mode navigation) — partagé
  // entre vitesse + pause handlers pour cohérence.
  function _refreshItiTempsInPlace() {
    const statusBlk = document.getElementById("kta-iti-status-block");
    if (!statusBlk) return;
    const distM = parseFloat(statusBlk.dataset.distm) || 0;
    const nbWp  = parseInt(statusBlk.dataset.nbwp, 10) || 2;
    const tMin  = _tempsItineraireMinutes(distM, nbWp);
    const pKey  = _getItiSpeedPreset();
    const p     = ITI_SPEED_PRESETS[pKey];
    const tEl   = document.getElementById("kta-iti-temps-val");
    const hEl   = document.getElementById("kta-iti-temps-speed-hint");
    if (tEl) tEl.textContent = _formatTempsMinutes(tMin);
    if (hEl) hEl.textContent = "(" + p.icon + " " + _presetLabel(pKey) + ")";
  }

  function fermer() {
    _desactiverModeClicCarte();
    if (_itineraryFloater) { _itineraryFloater.remove(); _itineraryFloater = null; }
    if (modeNavigation) {
      // Mode navigation : si un preview existe (l'utilisateur a recalcule
      // pendant cette session de modale), on l'auto-save → l'itineraire
      // utilise la nouvelle version au lieu d'etre perdu. Cohérent avec
      // l'intention "j'ai recalculé donc je veux le nouveau". L'utilisateur
      // peut explicitement annuler via le bouton ❌ Effacer du preview.
      const hasPreview = (window.getRoads ? window.getRoads() : []).some(function(r) { return r._preview; });
      if (hasPreview) {
        const roadsNow = (window.getRoads ? window.getRoads() : []).map(function(r) {
          if (r._preview) { const c = Object.assign({}, r); delete c._preview; return c; }
          return r;
        });
        if (window.setRoads) window.setRoads(roadsNow);
      }
      // On garde les markers numérotés (waypoints visuels) sur la carte pour
      // que l'utilisateur les voie toujours hors modale.
    } else {
      // Mode calcul : on retire le preview éventuel + les markers numérotés
      // (sinon ça encombre la carte). L'utilisateur doit explicitement
      // sauver via le bouton 💾 dans la zone résultat.
      _viderItineraire();
      const roadsNow = (window.getRoads ? window.getRoads() : []).filter(function(r) { return !r._preview; });
      if (window.setRoads) window.setRoads(roadsNow);
    }
    modal.remove();
    _majLabelDistanceItineraire();
  }

  document.getElementById("kta-iti-close").addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  // ===== Mode navigation : wiring des quick-nav + erase =====
  // Ces boutons ne sont presents que si modeNavigation = true (HTML conditionnel
  // plus haut). Le reste du wiring (mode-click, search, tracker-pos, clear,
  // compute) est commun aux 2 modes — pas de return early.
  if (modeNavigation) {
    document.getElementById("kta-iti-nav-debut").addEventListener("click", function() {
      if (_itineraryWaypoints.length === 0) return;
      modal.remove();
      _panEtFlashSurPoint(_itineraryWaypoints[0]);
    });
    document.getElementById("kta-iti-nav-fin").addEventListener("click", function() {
      if (_itineraryWaypoints.length === 0) return;
      modal.remove();
      _panEtFlashSurPoint(_itineraryWaypoints[_itineraryWaypoints.length - 1]);
    });
    document.getElementById("kta-iti-nav-tour").addEventListener("click", function() {
      // fitBounds sur l'ensemble des points du tracé
      if (!existingItinerary || !existingItinerary.points || existingItinerary.points.length < 2) return;
      const latlngs = existingItinerary.points.map(function(p) { return convertCoord(p.x, p.y); });
      const bounds = L.latLngBounds(latlngs);
      modal.remove();
      window.map.fitBounds(bounds, { padding: [40, 40], animate: false });
    });
    document.getElementById("kta-iti-erase").addEventListener("click", function() {
      if (!confirm(window.I18n.t("iti.erase.confirm"))) return;
      const roadsNow = (window.getRoads ? window.getRoads() : []).filter(function(r) { return r.type !== "itinerary"; });
      if (window.setRoads) window.setRoads(roadsNow);
      _viderItineraire();
      modal.remove();
      _majLabelDistanceItineraire();
    });
  }

  // ===== Sélecteur de point existant (autocomplete) =====
  // Recherche sur tous les points du plan (data layers + editor) via l'API
  // window.SearchPoints.findByQuery. Affiche les résultats sous l'input,
  // clic sur un résultat → ajoute un waypoint avec les coords du point ET son nom.
  const searchInput   = document.getElementById("kta-iti-search-input");
  const searchResults = document.getElementById("kta-iti-search-results");
  let _searchTimer = null;

  function _afficherResultatsRecherche(items) {
    if (!items || items.length === 0) {
      searchResults.innerHTML = '<div class="kta-iti-search-empty">' + window.I18n.t("iti.search.noResults") + '</div>';
      searchResults.style.display = "block";
      return;
    }
    // Limite l'affichage aux 10 premiers résultats pour pas saturer le DOM
    const limite = items.slice(0, 10);
    searchResults.innerHTML = limite.map(function(it, idx) {
      const p = it.point;
      const name = p.nom || p.id || window.I18n.t("iti.search.noName");
      const sub = (p.id && p.id !== name) ? p.id + " — " : "";
      const layer = it.layerLabel || it.layerId || "";
      return '<div class="kta-iti-search-item" data-idx="' + idx + '">' +
               '<div class="kta-iti-search-name">' + _escapeHtml(name) + '</div>' +
               '<div class="kta-iti-search-meta">' + _escapeHtml(sub + layer) + '</div>' +
             '</div>';
    }).join("");
    if (items.length > 10) {
      searchResults.innerHTML += '<div class="kta-iti-search-more">' + window.I18n.t("iti.search.more", { count: (items.length - 10) }) + '</div>';
    }
    searchResults.style.display = "block";

    // 🆕 v1.44.0 — Event delegation (cohérence avec ligne ~963 idem).
    // Stocke limite sur le conteneur, dispatch via data-idx.
    searchResults._lastLimite = limite;
  }

  // 🆕 v1.44.0 — Listener délégué attaché UNE FOIS au build de la modale
  // (pas à chaque keypress).
  if (!searchResults._delegateBound) {
    searchResults._delegateBound = true;
    searchResults.addEventListener("click", function(e) {
      const el = e.target && e.target.closest ? e.target.closest(".kta-iti-search-item") : null;
      if (!el || !searchResults.contains(el)) return;
      // Récupère l'index via la position de l'élément dans la liste (les items
      // ne sont pas data-idx-isés ici, on calcule par index parmi les frères).
      const items = Array.from(searchResults.querySelectorAll(".kta-iti-search-item"));
      const idx = items.indexOf(el);
      const limite = searchResults._lastLimite || [];
      const it = limite[idx];
      if (!it) return;
      const p = it.point;
      if (typeof p.x !== "number" || typeof p.y !== "number") return;
      _itineraryWaypoints.push({
        x:      p.x,
        y:      p.y,
        source: "search",
        label:  window.I18n.t("iti.wp.searchLabel", { name: (p.nom || p.id || "?"), layer: (it.layerLabel || it.layerId) })
      });
      _ajouterWaypointVisuel({ x: p.x, y: p.y }, _itineraryWaypoints.length);
      _rafraichirListeWaypointsModale();
      _majPanneauFloaterCount();
      // Reset l'input pour faciliter un autre ajout
      searchInput.value    = "";
      searchResults.style.display = "none";
    });
  }

  searchInput.addEventListener("input", function() {
    clearTimeout(_searchTimer);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      searchResults.style.display = "none";
      return;
    }
    _searchTimer = setTimeout(function() {
      if (window.SearchPoints && typeof window.SearchPoints.findByQuery === "function") {
        window.SearchPoints.findByQuery(query).then(_afficherResultatsRecherche);
      }
    }, 150);
  });
  searchInput.addEventListener("blur", function() {
    // Petit délai pour laisser le clic sur un résultat fonctionner avant de cacher
    setTimeout(function() { searchResults.style.display = "none"; }, 200);
  });

  // Bouton activer / désactiver mode clic carte
  // Quand on active : on cache la modale et affiche un mini-panneau flottant
  // pour que l'utilisateur puisse cliquer sur la carte (la modale plein-écran
  // bloquait les clics).
  const btnMode = document.getElementById("kta-iti-mode-click");
  btnMode.addEventListener("click", function() {
    if (_itineraryClickActive) {
      _desactiverModeClicCarte();
      btnMode.textContent = window.I18n.t("iti.btn.modeClickActivate");
      btnMode.classList.remove("kta-actif");
    } else {
      _activerModeClicCarte();
      // Cacher la modale principale + montrer mini-panneau
      modal.style.display = "none";
      _afficherPanneauItineraireFlottant(modal);
    }
  });

  // 🧭 Ma position tracker — ajoute un waypoint avec la position courante du
  // tracker (snapshot fige au moment du clic, ne bouge plus apres). Position
  // toujours disponible : APP_CONFIG.startX/Y au boot, puis modifiee par
  // recalage manuel ou par les pas du tracker actif.
  const btnTrackerPos = document.getElementById("kta-iti-tracker-pos");
  if (btnTrackerPos) {
    btnTrackerPos.addEventListener("click", function() {
      if (typeof window.getTrackingPosition !== "function") return;
      const pos = window.getTrackingPosition();
      if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
        alert(window.I18n.t("iti.err.trackerPos"));
        return;
      }
      _itineraryWaypoints.push({
        x:      pos.x,
        y:      pos.y,
        source: "tracker",
        label:  window.I18n.t("iti.wp.currentPos", { x: Math.round(pos.x), y: Math.round(pos.y) })
      });
      _ajouterWaypointVisuel({ x: pos.x, y: pos.y }, _itineraryWaypoints.length);
      _rafraichirListeWaypointsModale();
      _majPanneauFloaterCount();
    });
  }

  // Vider
  document.getElementById("kta-iti-clear").addEventListener("click", function() {
    _itineraryWaypoints = [];
    if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
    _rafraichirListeWaypointsModale();
    document.getElementById("kta-iti-result").style.display = "none";
    document.getElementById("kta-iti-error").style.display  = "none";
  });

  // Calculer (handler async depuis v169 : computeRoute peut await SearchPoints
  // si avoidTags non vide — l'await passe immediatement si pas d'avoidTags)
  document.getElementById("kta-iti-compute").addEventListener("click", async function() {
    const btn   = this;
    const errEl = document.getElementById("kta-iti-error");
    const resEl = document.getElementById("kta-iti-result");
    errEl.style.display = "none";
    resEl.style.display = "none";

    if (_itineraryWaypoints.length < 2) {
      errEl.textContent = window.I18n.t("iti.err.min2");
      errEl.style.display = "block";
      return;
    }

    if (!window.Pathfinder) {
      errEl.textContent = window.I18n.t("iti.err.pathfinder");
      errEl.style.display = "block";
      return;
    }

    // 🆕 v1.43.26 (Pattern D) — Disable bouton pendant le pathfinding Dijkstra
    // (peut prendre 1-3 s sur un grand graph). Sans ça, l'user qui double-clique
    // lance 2 calculs concurrents qui se marchent dessus sur le road preview.
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = window.I18n.t("iti.btn.computing");
    try {
      // 🚫 v169 (Karma_dev) : lit les preferences d'evitement depuis localStorage
      // et les passe au Pathfinder. La logique 2-passes (fallback) est interne
      // au Pathfinder — on lit result.usedFallback et result.avoidedThrough pour
      // afficher un message d'avertissement au user le cas echeant.
      const avoidPrefs = _getItiAvoidPrefs();
      const result = await window.Pathfinder.computeRoute(_itineraryWaypoints, {
        avoidPoints: avoidPrefs.points || [],
        avoidTags:   avoidPrefs.tags   || [],
        avoidRadius: avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS
      });
      // 🆕 v1.43.27 (Pattern C) — Guard : la modale peut avoir été fermée pendant
      // l'await computeRoute() (Dijkstra peut prendre 1-3 s sur grand graph). Sans
      // ça, on écrirait dans resEl détaché + on appellerait getElementById sur
      // "kta-iti-save"/"kta-iti-discard" qui retourneraient null → crash sur
      // .addEventListener. On vérifie via resEl qui était récupéré au début du
      // handler (réf captée AVANT l'await).
      if (!resEl.isConnected) return;
      // Conversion px → mètres via APP_CONFIG.scale (px/mètre)
      const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
      const distM = result.totalDistance / scale;

      // Message fallback si certains evitements n'ont pas pu etre respectes
      let fallbackHtml = "";
      if (result.usedFallback && Array.isArray(result.avoidedThrough) && result.avoidedThrough.length > 0) {
        function _esc(s) {
          return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        const noms = result.avoidedThrough.map(function(ap) {
          return _esc(ap.label || ap.id || window.I18n.t("iti.avoid.pointFallback"));
        }).join(", ");
        fallbackHtml =
          '<div class="kta-iti-result-row kta-iti-avoid-warning" style="color:#ff9933; background:rgba(255,153,51,0.10); border-left:3px solid #ff9933; padding:8px 10px; margin:6px 0; border-radius:4px;">' +
            window.I18n.t("iti.avoid.cantAvoid", { names: noms }) +
            '<br><span style="font-size:11.5px;">' + window.I18n.t("iti.avoid.cantAvoidDetail", { radius: (result.avoidRadius || ITI_AVOID_DEFAULT_RADIUS) }) + '</span>' +
          '</div>';
      }

      const tempsCalcMin = _tempsItineraireMinutes(distM, _itineraryWaypoints.length);
      resEl.innerHTML =
        fallbackHtml +
        '<div class="kta-iti-result-row"><strong>' + window.I18n.t("iti.result.distance") + '</strong> ' + window.formatDistance(distM, 1) + '</div>' +
        '<div class="kta-iti-result-row"><strong>' + window.I18n.t("iti.result.time") + '</strong> ' + _formatTempsMinutes(tempsCalcMin) + '</div>' +
        '<div class="kta-iti-result-row"><strong>' + window.I18n.t("iti.result.segmentsCrossed") + '</strong> ' + result.segmentCount + '</div>' +
        '<div class="kta-iti-result-actions">' +
          '<button id="kta-iti-save" class="kta-btn kta-btn-primary" type="button">' + window.I18n.t("iti.btn.save") + '</button>' +
          '<button id="kta-iti-discard" class="kta-btn kta-btn-ghost" type="button" style="margin-left:8px;">' + window.I18n.t("iti.btn.discard") + '</button>' +
        '</div>';
      resEl.style.display = "block";

      // Tracer immédiatement (preview) en utilisant le type "itinerary".
      // ⚠️ Sémantique : un seul itinéraire actif à la fois — on retire TOUTES
      // les roads de type "itinerary" (preview ET déjà enregistrées) avant
      // d'ajouter le nouveau. Recalculer remplace la session précédente.
      // ⚠️ Les waypoints originaux (avec leurs labels/sources) sont stockés sur
      // le road via la propriété `waypoints` → restauration au re-open de la
      // modale (mode navigation).
      const previewRoad = {
        type:      "itinerary",
        points:    result.path,
        waypoints: _itineraryWaypoints.map(function(w) { return Object.assign({}, w); }),
        _preview:  true
      };
      const currentRoads = window.getRoads ? window.getRoads() : [];
      const filtered = currentRoads.filter(function(r) { return r.type !== "itinerary"; });
      filtered.push(previewRoad);
      if (window.setRoads) window.setRoads(filtered);
      _majLabelDistanceItineraire();

      document.getElementById("kta-iti-save").addEventListener("click", function() {
        // Convertit le preview en road persistante (les waypoints sont déjà attachés)
        const roadsNow = (window.getRoads ? window.getRoads() : []).map(function(r) {
          if (r._preview) { const c = Object.assign({}, r); delete c._preview; return c; }
          return r;
        });
        if (window.setRoads) window.setRoads(roadsNow);
        _majLabelDistanceItineraire();
        fermer();
      });
      document.getElementById("kta-iti-discard").addEventListener("click", function() {
        const roadsNow = (window.getRoads ? window.getRoads() : []).filter(function(r) { return !r._preview; });
        if (window.setRoads) window.setRoads(roadsNow);
        _majLabelDistanceItineraire();
        resEl.style.display = "none";
      });

    } catch(err) {
      errEl.textContent = err.message || String(err);
      errEl.style.display = "block";
    } finally {
      // 🆕 v1.43.26 (Pattern D) — Restore bouton dans tous les chemins de sortie
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
};
