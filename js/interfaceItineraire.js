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
// 🪧 GUIDAGE (27/09/2026) — ce que l'itinéraire garde du calcul
// =========================
// Le pathfinder rend désormais `raccords` (trajet à vol d'oiseau entre chaque
// étape et son tracé) et `carrefours` (croisements posés sur le trajet). Ils
// sont recopiés sur la road : les consignes (js/itiGuidage.js) et le
// pointillé du raccord (road.js) les lisent, y compris après un rechargement.
// Les TROIS créations d'itinéraire de ce fichier passent par ici.
function _champsGuidage(result) {
  return {
    raccords:   Array.isArray(result && result.raccords)   ? result.raccords   : [],
    carrefours: Array.isArray(result && result.carrefours) ? result.carrefours : []
  };
}

// Décision KARMA : un plan sans aucun tracé → on AVERTIT au lancement ; le
// calcul échouerait sur un message technique et le guidage n'aurait rien à dire.
function _itiAucunTrace() {
  return !!(window.Pathfinder && typeof window.Pathfinder.aDesTraces === "function" &&
            !window.Pathfinder.aDesTraces());
}

// Décision KARMA : raccord à vol d'oiseau de plus de 50 m → on avertit sans bloquer.
function _texteAlerteRaccord(road) {
  if (!window.ItiGuidage) return "";
  return window.ItiGuidage.texteAlerteRaccord(window.ItiGuidage.alerteRaccord(road));
}

// =========================
// 🆕 v1.46.4 — OVERLAY DE CALCUL D'ITINÉRAIRE
// =========================
// Sur un réseau de tracés DENSE, le Dijkstra prend 1-3 s. On affiche un loader
// chartré (spinner du chargement de plan + message) le temps du pathfinding,
// pour que l'user ne croie pas que rien ne s'est passé / que ça a bugué.
// Plein écran → marche pour la modale ET le popup « itinéraire jusqu'ici ».
//
// ⚠️ CŒUR DU FIX : `computeRoute` est `async` mais le Dijkstra dedans est
// SYNCHRONE → il bloque le thread. Sans yield-to-paint, ni l'overlay ni le
// label « Calcul en cours… » du bouton ne seraient peints avant le blocage
// (c'est pour ça que l'user voyait « rien »). `_withItiComputeLoader` affiche
// l'overlay PUIS attend une frame (rAF + setTimeout 0) pour laisser le
// navigateur peindre, AVANT de lancer le calcul.
function _showItiComputeOverlay() {
  let ov = document.getElementById("kta-iti-compute-overlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "kta-iti-compute-overlay";
    ov.className = "kta-iti-compute-overlay";
    const _t = (window.I18n && window.I18n.t) ? window.I18n.t : function(k){ return k; };
    ov.innerHTML =
      '<div class="kta-load-spinner"></div>' +
      '<div class="kta-iti-compute-msg">' + _t("iti.compute.loading") + '</div>';
    document.documentElement.appendChild(ov);
  }
  ov.style.display = "flex";
  return ov;
}
function _hideItiComputeOverlay() {
  const ov = document.getElementById("kta-iti-compute-overlay");
  if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
}
async function _withItiComputeLoader(fn) {
  _showItiComputeOverlay();
  // yield-to-paint : rAF programme avant le prochain paint, setTimeout 0 reprend
  // après → garantit ≥1 frame peinte avant de bloquer le thread.
  await new Promise(function(r) { requestAnimationFrame(function() { setTimeout(r, 0); }); });
  try {
    return await fn();
  } finally {
    _hideItiComputeOverlay();
  }
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
// `opts.origine` {x, y} (13/09/2026) : origine imposée par l'appelant — la
// Sortie d'urgence passe celle de SON calcul, sinon on re-testait le tracker.
// Règle « instant T » (décision KARMA, audit ergonomie B1) : suivi actif OU
// position confirmée → on part de la position du tracker sans question ;
// jamais confirmée (= encore le départ du plan) → picker partagé « Où es-tu ? »
// qui recale le tracker, puis on revient ici avec l'origine.
window.itineraireYAller = function(x, y, nom, opts) {
  if (typeof x !== "number" || typeof y !== "number") return;
  opts = opts || {};
  const origineForcee = (opts.origine && typeof opts.origine.x === "number"
                         && typeof opts.origine.y === "number") ? opts.origine : null;
  if (!origineForcee) {
    const etat = (typeof window.getTrackingPositionEtat === "function")
      ? window.getTrackingPositionEtat() : null;
    if (etat && !etat.suiviActif && !etat.confirmee &&
        typeof window.ktaDemanderPositionCarte === "function") {
      window.ktaDemanderPositionCarte(function(p) {
        window.itineraireYAller(x, y, nom, { origine: p });
      }, { icone: "🧭", texte: window.I18n.t("iti.pick.ouEsTu") });
      return;
    }
  }

  const pos = origineForcee || ((typeof window.getTrackingPosition === "function")
    ? window.getTrackingPosition()
    : null);
  if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
    alert(window.I18n.t("iti.err.trackerPos"));
    return;
  }
  if (!window.Pathfinder) {
    alert(window.I18n.t("iti.err.pathfinder"));
    return;
  }
  if (_itiAucunTrace()) {
    alert(window.I18n.t("guid.aucunTrace"));
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
      const result = await _withItiComputeLoader(function() {
        return window.Pathfinder.computeRoute(waypoints, {
          avoidPoints: avoidPrefs.points || [],
          avoidTags:   avoidPrefs.tags   || [],
          avoidZones:  avoidPrefs.zones  || [],
          // 🆕 v1.82.0 — la seule contrainte DURE du moteur suit la case de la modale.
          respecterInaccessibles: avoidPrefs.respecterInaccessibles !== false,
          avoidRadius: avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS
        });
      });

      // Cree la road itineraire (sans flag _preview : on enregistre direct)
      const newRoad = Object.assign({
        type:      "itinerary",
        points:    result.path,
        waypoints: waypoints
      }, _champsGuidage(result));
      // 🪧 Guidage lot 4 (décisions A/C/G) : un itinéraire de SORTIE
      // D'URGENCE est marqué — bandeau sans croix, affiché même réglé sur
      // « Jamais », et « Recalculer » y vise la sortie la plus proche.
      if (opts.urgence) newRoad.urgence = true;

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

      const alerteRaccord = _texteAlerteRaccord(newRoad);
      if (alerteRaccord) _toastIti("⚠️ " + alerteRaccord, "warn");

    } catch(err) {
      alert(window.I18n.t("iti.err.compute", { err: (err.message || err) }));
    }
  }

  // Check si itineraire actif → confirm
  // 🪧 Sauf en sortie d'urgence : l'utilisateur vient de toucher « Tracer »
  // vers une sortie — une question de plus à ce moment-là est de trop.
  const existing = (window.getRoads ? window.getRoads() : [])
    .find(function(r) { return r.type === "itinerary"; });
  if (existing && !opts.urgence) {
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
  // 🪧 Décision KARMA K (27/09/2026) : le trajet à vol d'oiseau jusqu'au
  // tracé fait partie du chemin — il était ignoré. Un itinéraire d'avant ce
  // lot n'a pas de `raccords` : il garde sa distance d'origine.
  if (window.ItiGuidage) totalPx += window.ItiGuidage.longueurRaccordsPx(road);
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
    // 🆕 v1.61.0 : les étapes validées (done) ne comptent plus dans les pauses
    const nbWp  = Array.isArray(itineraryRoad.waypoints)
      ? itineraryRoad.waypoints.filter(function(w) { return !w.done; }).length : 2;
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
// Handler à RÉFÉRENCE STABLE (cf _itineraryMapClick) : on/off idempotents.

// 🆕 v1.34.27 — Expose les waypoints de l'iti actif en lecture seule pour que
// tracking.js puisse détecter quand l'user arrive à proximité (vibration
// haptique de proximité 100px, cf tracking.js _checkWaypointProximity).
// Retourne une COPIE pour empêcher la mutation côté caller.
// 🆕 v1.61.0 : filtre les étapes validées (done) ET le point 0 tracker —
// vibrer « waypoint atteint » sur sa propre origine ou sur une étape déjà
// validée est du bruit (et chaque replanification crée une nouvelle origine).
window.getItineraireWaypoints = function() {
  return _itineraryWaypoints.filter(function(w) {
    return !w.done && w.source !== "tracker";
  });
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
  // 🆕 v1.61.0 : étape validée (« je suis ici » dessus) → ✓ vert au lieu du numéro
  const done = !!p.done;
  const icon = L.divIcon({
    className: "kta-itinerary-waypoint" + (done ? " kta-iti-wp-done" : ""),
    html: '<div class="kta-iti-num">' + (done ? "✓" : num) + '</div>',
    iconSize:  [28, 28],
    iconAnchor: [14, 14]
  });
  // 🐛 v1.73.0 (KARMA « un point de passage fait au clic ne peut pas être
  // validé ») : un waypoint-POI se valide via la popup du POI sous-jacent,
  // mais un waypoint posé AU CLIC n'a AUCUN objet cliquable — son marker
  // numéroté était interactive:false. Ce false reste VOULU pour les
  // waypoints-POI (le clic doit traverser vers la popup du POI dessous) :
  // le marker ne devient cliquable QUE pour source "click" non validée,
  // avec une mini-popup « Je suis ici » qui emprunte EXACTEMENT le chemin
  // POI (recalerTrackerSurPoint → _notifierRecalage("point") → coords
  // exactes → validation d'étape + replanification).
  const cliquable = !done && p.source === "click";
  const m = L.marker(convertCoord(p.x, p.y), { icon: icon, interactive: cliquable })
              .addTo(_itineraryMarkerLayer);
  if (cliquable) {
    m.bindPopup(
      '<div class="kta-popup-point"><b>' + window.I18n.t("iti.wp.popupEtape", { n: num }) + '</b>' +
        '<div class="kta-popup-actions">' +
          '<button class="kta-popup-btn kta-popup-btn-here" type="button" ' +
            'onclick="window.recalerTrackerSurPoint(' + p.x + ',' + p.y + '); return false;" ' +
            'title="' + window.I18n.t("poi.iAmHere") + '">' +
            window.I18n.t("iti.wp.jeSuisIci") +
          '</button>' +
        '</div></div>');
  }
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

// 🚨 Q12 (audit ergonomie 13/09/2026) : après un rechargement, sessionPersist
// restaurait le tracé cyan mais PAS les étapes ① ② ③ ni les ✓ des étapes
// validées — elles ne revenaient qu'en rouvrant la modale. Reconstruit les
// waypoints en RAM depuis la road « itinerary » restaurée (les flags `done`
// sont persistés) et redessine les marqueurs. Appelé par sessionPersist.js
// en fin de phase 2. Rend faux s'il n'y a rien à redessiner.
window.itineraireRedessinerDepuisRoad = function() {
  const road = (window.getRoads ? (window.getRoads() || []) : [])
    .find(function(r) { return r && r.type === "itinerary" && !r._preview && Array.isArray(r.waypoints) && r.waypoints.length >= 2; });
  if (!road) return false;
  _itineraryWaypoints = road.waypoints.map(function(w) { return Object.assign({}, w); });
  if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
  _itineraryWaypoints.forEach(function(p, i) { _ajouterWaypointVisuel(p, i + 1); });
  try { _majLabelDistanceItineraire(); } catch(e) {}
  return true;
};

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
    // 🆕 v1.61.0 : étape validée → ligne rayée + ✓ (elle reste listée pour
    // montrer la progression, exclue du calcul)
    const done = !!p.done;
    return '<div class="kta-iti-wp-row' + (done ? " kta-iti-wp-row-done" : "") + '">' +
             '<span class="kta-iti-wp-num">' + (done ? "✓" : (i + 1)) + '</span>' +
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

// 🐛 fix double-input : handler à RÉFÉRENCE STABLE (toujours la même fonction).
// L'itinéraire est le seul mode qui bind/unbind le clic carte à chaque
// activation — avec une closure recréée à chaque fois, un cycle interrompu
// (rebuild de modale, plan switch…) pouvait laisser un 1er handler bindé et un
// 2e s'ajouter → 1 clic = 2 waypoints (même coordonnée). Réf stable + off-avant-on
// = binding idempotent (exactement 1 handler, quoi qu'il arrive).
function _itineraryMapClick(e) {
  // Coords plan (cf. convention du projet : convertCoord inverse y)
  const x = e.latlng.lng;
  const y = APP_CONFIG.imageHeight - e.latlng.lat;
  _itineraryWaypoints.push({ x: x, y: y, source: "click" });
  // v1.73.0 : passer l'objet POUSSÉ (avec source) — sinon le marker frais
  // n'est pas cliquable avant le premier _redessinerWaypoints.
  _ajouterWaypointVisuel(_itineraryWaypoints[_itineraryWaypoints.length - 1], _itineraryWaypoints.length);
  _rafraichirListeWaypointsModale();
  _majPanneauFloaterCount();
}

function _activerModeClicCarte() {
  if (_itineraryClickActive) return;
  _itineraryClickActive = true;
  if (window.map) {
    window.map.off("click", _itineraryMapClick);  // défensif : 0 avant +1
    window.map.on("click", _itineraryMapClick);
  }
}

function _desactiverModeClicCarte() {
  if (!_itineraryClickActive) return;
  _itineraryClickActive = false;
  if (window.map) window.map.off("click", _itineraryMapClick);
}

function _viderItineraire() {
  _itineraryWaypoints = [];
  if (_itineraryMarkerLayer) {
    _itineraryMarkerLayer.clearLayers();
  }
}

// Supprime l'itinéraire tracé (road + étapes + libellé de distance). Partagé par
// « ❌ Effacer l'itinéraire » (modale) et « 🗑️ Supprimer l'itinéraire » de la
// question de recalcul (01/10/2026).
function _effacerItineraireActif() {
  const roadsNow = (window.getRoads ? window.getRoads() : []).filter(function(r) { return r.type !== "itinerary"; });
  if (window.setRoads) window.setRoads(roadsNow);
  _viderItineraire();
  _majLabelDistanceItineraire();
  // Le bandeau de guidage ne se recalcule qu'à son battement d'1 s : sans ce
  // rafraîchissement, l'ancienne consigne (« Rejoindre le tracé », « Hors
  // itinéraire ? ») réapparaissait un instant à la fermeture de la fenêtre.
  if (window.ItiGuidage && typeof window.ItiGuidage.rafraichir === "function") {
    try { window.ItiGuidage.rafraichir(); } catch (e) {}
  }
  // Itinéraire inter-plans : la suite prévue sur les autres plans part avec lui.
  if (window.InterPlanRoute && typeof window.InterPlanRoute.abandonnerSuite === "function") {
    window.InterPlanRoute.abandonnerSuite();
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
// 🆕 v1.61.0 — REPLANIFICATION AU RECALAGE + VALIDATION D'ÉTAPES
// =========================
// Scénario KARMA (sortie multi-étapes en carrière) : le tracker dérive ou le
// téléphone est verrouillé → l'user recale souvent sa position. À chaque
// recalage (clic carte, « 📍 Je suis ici », arrivée portail — hook
// window._onTrackerRecale émis par tracking.js), l'itinéraire actif est
// REPLANIFIÉ : ma position devient le point 0, étapes restantes dans l'ordre
// planifié (reco 3:a).
// Si le recalage « Je suis ici » tombe sur les coords EXACTES (arrondies)
// d'une étape non validée, c'est une VALIDATION DE PASSAGE — dans n'importe
// quel ordre (l'user ne suit pas forcément l'ordre proposé) : étape flaggée
// done (persistée dans road.waypoints → survit au reload), exclue du calcul,
// marker passé en ✓ vert (reco 4:a). Dernière étape validée → toast
// « terminé » + effacement du tracé itinéraire (le tracé tracker reste,
// reco 5:a). Clic carte = jamais une validation (coords approximatives par
// nature) : simple replanification.
// Débounce 500 ms : recalages rapprochés → un seul Dijkstra.
let _replanTimer = null;

function _roadItineraireActive() {
  if (!window.getRoads) return null;
  return window.getRoads().find(function(r) { return r.type === "itinerary" && !r._preview; }) || null;
}

function _toastIti(msg, type) {
  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(msg, type || "info");
  }
}

// ✂️ 01/10/2026 (KARMA 3:a / 4:a) — « Je suis ici » sur un point qui est SUR
// l'itinéraire (≤ COUPE_SEUIL_M du trajet) : on n'a rien à recalculer, on
// COUPE ce qui est derrière. Le Dijkstra (et sa question) ne sert plus qu'au
// point hors trajet. Guidage actif ou non : la coupe dépend de l'itinéraire.
// Même tolérance que le guidage pour « tu es sur le trajet » (itiGuidage
// > _seuils, sans navigation intelligente) — un seuil en pixels changerait
// de sens d'un plan à l'autre selon sa résolution.
const COUPE_SEUIL_M = 8;

function _cumulsTrajet(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return c;
}
function _projSegment(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  const x = a.x + t * dx, y = a.y + t * dy;
  return { t: t, x: x, y: y, d: Math.hypot(p.x - x, p.y - y) };
}
// PREMIER passage du trajet à moins de `seuil` (le plus proche dans ce
// passage) : sur un aller-retour vers un cul-de-sac, le premier « Je suis
// ici » coupe l'aller, le suivant le retour.
function _premierPassage(pts, cum, p, seuil) {
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const q = _projSegment(pts[i], pts[i + 1], p);
    if (q.d <= seuil) {
      if (!best || q.d < best.d) best = Object.assign(q, { i: i, s: cum[i] + q.t * (cum[i + 1] - cum[i]) });
    } else if (best) {
      break;
    }
  }
  return best;
}
// Point du trajet le plus proche de `p` parmi ceux situés au-delà de `sMin`.
function _projApres(pts, cum, p, sMin) {
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (cum[i + 1] < sMin) continue;
    const q = _projSegment(pts[i], pts[i + 1], p);
    const s = Math.max(sMin, cum[i] + q.t * (cum[i + 1] - cum[i]));
    if (!best || q.d < best.d) best = { d: q.d, s: s };
  }
  return best;
}

// Rend true si l'itinéraire a été coupé (rien d'autre à faire), false si le
// point n'est pas sur le trajet (→ replanification habituelle).
function _couperDerriere(road, x, y) {
  const pts = road.points;
  if (!Array.isArray(pts) || pts.length < 2) return false;
  // 🚨 Parcours d'une équipe de secours : ses étapes (wid) ne se valident que
  // par le scénario (`secoursMode > _majRoadSuivi` les y recale à chaque
  // mutation). Une étape cochée ici serait décochée aussitôt, trajet déjà coupé
  // derrière — et un recalcul y renverrait l'équipe. Comportement inchangé.
  if (road.secours) return false;
  const e = (window.APP_CONFIG && Number(window.APP_CONFIG.scale) > 0) ? Number(window.APP_CONFIG.scale) : 1;
  const cum = _cumulsTrajet(pts);
  const coupe = _premierPassage(pts, cum, { x: x, y: y }, COUPE_SEUIL_M * e);
  if (!coupe) return false;

  const a = pts[coupe.i], b = pts[coupe.i + 1];
  const lvl = (a.level === b.level) ? a.level : (coupe.t < 0.5 ? a.level : b.level);
  const tete = { x: coupe.x, y: coupe.y, level: (lvl === undefined) ? null : lvl };
  const points = [tete].concat(pts.slice(coupe.i + 1).map(function(p) { return Object.assign({}, p); }));

  // Étapes et raccords dépassés : projetés DANS L'ORDRE du trajet (chacun
  // au-delà du précédent), sinon une étape du retour d'un aller-retour serait
  // prise pour une étape de l'aller.
  const etapes = road.waypoints.filter(function(w) { return w.source !== "tracker"; })
                               .map(function(w) { return Object.assign({}, w); });
  let sPrec = 0;
  etapes.forEach(function(w) {
    if (w.done) return;
    const pr = _projApres(pts, cum, w, sPrec);
    if (!pr) return;
    sPrec = pr.s;
    if (pr.s < coupe.s - 0.5 * e) w.done = true;
  });
  sPrec = 0;
  const raccords = (Array.isArray(road.raccords) ? road.raccords : []).filter(function(r) {
    if (!r || r.role === "depart" || !r.vers) return false;   // on part d'un point DU trajet
    const pr = _projApres(pts, cum, r.vers, sPrec);
    if (!pr) return false;
    sPrec = pr.s;
    return pr.s >= coupe.s - 0.5 * e;
  });
  const cumN = _cumulsTrajet(points);
  const carrefours = (Array.isArray(road.carrefours) ? road.carrefours : []).filter(function(c) {
    const pr = _projApres(points, cumN, c, 0);
    return pr && pr.d <= 3;
  });

  const origin = {
    x: x, y: y, source: "tracker",
    label: window.I18n.t("iti.wp.currentPos", { x: Math.round(x), y: Math.round(y) })
  };
  const newRoad = {
    type: "itinerary", points: points,
    waypoints: [origin].concat(etapes),
    raccords: raccords, carrefours: carrefours
  };
  if (road.urgence) newRoad.urgence = true;
  if (road.secours) newRoad.secours = road.secours;
  if (road.suite) newRoad.suite = road.suite;   // inter-plans : la suite après le portail

  const restantes = etapes.filter(function(w) { return !w.done; }).length;
  const filtered = (window.getRoads ? window.getRoads() : []).filter(function(r) { return r.type !== "itinerary"; });
  filtered.push(newRoad);
  if (window.setRoads) window.setRoads(filtered);
  _itineraryWaypoints = newRoad.waypoints.map(function(w) { return Object.assign({}, w); });
  _redessinerWaypoints();
  _majLabelDistanceItineraire();
  // Dernière étape dépassée : c'est la clôture (toast « terminé » + effacement).
  if (restantes === 0) { _replanifierDepuis(x, y); return true; }
  const resteM = _distanceItineraireMeters(newRoad);
  _toastIti(window.I18n.t("iti.coupe.toast", {
    dist: (typeof window.formatDistance === "function") ? window.formatDistance(resteM, 0) : Math.round(resteM) + " m"
  }), "info");
  console.log("[Itineraire] Coupé derrière (" + Math.round(x) + "," + Math.round(y) + ") — reste " +
              Math.round(resteM) + " m, " + restantes + " étape(s)");
  return true;
}

window._onTrackerRecale = function(x, y, source, opts) {
  const road = _roadItineraireActive();
  if (!road || !Array.isArray(road.waypoints) || road.waypoints.length === 0) return;

  // Validation d'étape : uniquement au recalage "point" (coords exactes).
  if (source === "point") {
    const etape = road.waypoints.find(function(w) {
      return !w.done && w.source !== "tracker" &&
             Math.round(w.x) === Math.round(x) && Math.round(w.y) === Math.round(y);
    });
    if (etape) {
      etape.done = true;   // mutation directe : reprise par le rebuild + persistée
      const restantes = road.waypoints.filter(function(w) { return !w.done && w.source !== "tracker"; }).length;
      if (restantes > 0) {
        _toastIti(window.I18n.t("iti.replan.stepDone", {
          n: road.waypoints.indexOf(etape) + 1, rest: restantes
        }), "info");
        if (window.kta_vibrate) window.kta_vibrate.medium();
      }
      // restantes === 0 → le toast « terminé » est géré par _replanifierDepuis
    }
  }

  // Mode Secours (30/09) : recalage sur une étape du parcours qu'on vient de valider
  // (`sansReplan`) — on est SUR le parcours prévu : l'étape est cochée ci-dessus, pas
  // de proposition de recalcul à chaque étape.
  if (opts && opts.sansReplan) return;
  // ✂️ Point SUR le trajet : on coupe derrière, sans Dijkstra ni question. Pas
  // quand la dernière étape vient d'être validée : c'est la clôture, plus bas.
  const resteAvant = road.waypoints.filter(function(w) { return !w.done && w.source !== "tracker"; }).length;
  if (source === "point" && resteAvant > 0) {
    try {
      if (_couperDerriere(road, x, y)) {
        if (_replanTimer) { clearTimeout(_replanTimer); _replanTimer = null; }
        return;
      }
    } catch (err) {
      console.warn("[Itineraire] coupe impossible, replanification habituelle :", err);
    }
  }
  if (_replanTimer) clearTimeout(_replanTimer);
  _replanTimer = setTimeout(function() {
    _replanTimer = null;
    // 🆕 v1.76.2 (demande KARMA) — DEMANDER avant de recalculer : sur les
    // grands plans, le Dijkstra peut prendre plusieurs dizaines de secondes,
    // parfois pour rien (simple recalage sans besoin de nouvel itinéraire).
    // Sûr ici : ce hook n'est déclenché QUE par un geste utilisateur (clic
    // en mode recalage, « 📍 Je suis ici », portail) — jamais par le tracker
    // automatique. EXCEPTION : dernière étape tout juste validée (restantes
    // = 0) → replan direct, c'est la CLÔTURE de l'itinéraire (toast
    // « terminé » + effacement du tracé, quasi instantané) — la soumettre à
    // confirmation laisserait un itinéraire fini ouvert pour toujours.
    const roadNow = _roadItineraireActive();
    const restantes = roadNow && Array.isArray(roadNow.waypoints)
      ? roadNow.waypoints.filter(function(w) { return !w.done && w.source !== "tracker"; }).length
      : 0;
    if (restantes > 0) {
      // Confirm CHARTÉ (ktaConfirm, utils.js) — retour KARMA : le confirm()
      // natif jurait avec la charte graphique. Repli natif si utils absent.
      const demander = (typeof window.ktaConfirm === "function")
        ? window.ktaConfirm(window.I18n.t("iti.replan.confirm"), {
            titre: window.I18n.t("iti.replan.confirmTitre"),
            okLabel: window.I18n.t("iti.replan.confirmOk"),
            cancelLabel: window.I18n.t("iti.replan.confirmNon"),
            // 🗑️ 01/10/2026 (KARMA) — 3e choix : on n'en veut plus du tout.
            autre: { label: window.I18n.t("iti.replan.confirmSupprimer"), valeur: "supprimer" }
          })
        : Promise.resolve(confirm(window.I18n.t("iti.replan.confirm")));
      demander.then(function(ok) {
        if (ok === "supprimer") {
          _effacerItineraireActif();
          _toastIti(window.I18n.t("iti.replan.supprime"), "info");
          return;
        }
        if (!ok) { _toastIti(window.I18n.t("iti.replan.skipped"), "info"); return; }
        _replanifierDepuis(x, y);
      });
      return;
    }
    _replanifierDepuis(x, y);
  }, 500);
};

// 🪧 Guidage (lot 2, décision D) — « Recalculer d'ici » du bandeau. Geste
// explicite de l'utilisateur : pas de confirmation en plus.
// 🧭 Mode Secours (B1, 30/09/2026) : active un itinéraire DÉJÀ calculé (le parcours
// d'une équipe) comme l'itinéraire de l'app — bandeau de guidage, feuille de route,
// écran XL et replanification le prennent tel quel. `opts.confirmer` : demande avant
// de remplacer un itinéraire en cours (même fenêtre que le calcul classique).
window.itineraireActiverRoad = function(newRoad, opts) {
  opts = opts || {};
  if (!newRoad || newRoad.type !== "itinerary" || !Array.isArray(newRoad.points) || newRoad.points.length < 2) return;
  const activer = function() {
    const filtered = (window.getRoads ? window.getRoads() : []).filter(function(r) { return r.type !== "itinerary"; });
    filtered.push(newRoad);
    if (window.setRoads) window.setRoads(filtered);
    _itineraryWaypoints = (newRoad.waypoints || []).map(function(w) { return Object.assign({}, w); });
    _redessinerWaypoints();
    _majLabelDistanceItineraire();
    const alerteRaccord = _texteAlerteRaccord(newRoad);
    if (alerteRaccord) _toastIti("⚠️ " + alerteRaccord, "warn");
    if (typeof opts.onDone === "function") opts.onDone();
  };
  const existing = (window.getRoads ? window.getRoads() : []).find(function(r) { return r.type === "itinerary"; });
  if (existing && opts.confirmer) _confirmRemplacerItineraire(activer);
  else activer();
};

window.itineraireReplanifierDepuis = function(px, py) {
  if (typeof px !== "number" || typeof py !== "number") return;
  _replanifierDepuis(px, py);
};

async function _replanifierDepuis(px, py) {
  const road = _roadItineraireActive();
  if (!road || !Array.isArray(road.waypoints)) return;
  const etapes    = road.waypoints.filter(function(w) { return w.source !== "tracker"; });
  const restantes = etapes.filter(function(w) { return !w.done; });

  // Toutes les étapes validées → itinéraire terminé. On efface le tracé
  // itinéraire (le tracé TRACKER, lui, reste à l'écran).
  if (restantes.length === 0) {
    if (window.setRoads) {
      window.setRoads((window.getRoads ? window.getRoads() : [])
        .filter(function(r) { return r.type !== "itinerary"; }));
    }
    _viderItineraire();
    _rafraichirListeWaypointsModale();
    _majLabelDistanceItineraire();
    _toastIti(window.I18n.t("iti.replan.finished"), "info");
    if (window.kta_vibrate) window.kta_vibrate.medium();
    return;
  }

  const origin = {
    x: px, y: py, source: "tracker",
    label: window.I18n.t("iti.wp.currentPos", { x: Math.round(px), y: Math.round(py) })
  };
  try {
    const avoidPrefs = _getItiAvoidPrefs();
    // 🧭 Parcours d'une équipe de secours : on garde SES évitements (les zones des
    // autres équipes), pas les préférences de l'itinéraire classique (B1, 30/09/2026).
    const sec = road.secours || null;
    const result = await _withItiComputeLoader(function() {
      return window.Pathfinder.computeRoute([origin].concat(restantes), {
        avoidPoints: sec ? (sec.avoidPoints || []) : (avoidPrefs.points || []),
        avoidTags:   sec ? [] : (avoidPrefs.tags   || []),
        avoidZones:  sec ? [] : (avoidPrefs.zones  || []),
        // 🆕 v1.82.0 — la seule contrainte DURE du moteur suit la case de la modale.
        respecterInaccessibles: avoidPrefs.respecterInaccessibles !== false,
        avoidRadius: sec ? (sec.avoidRadius || 30) : (avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS)
      });
    });
    // road.waypoints conserve TOUTES les étapes (validées incluses, avec leur
    // flag done) → progression visible + persistance session gratuite. Seul
    // l'ancien point 0 tracker est remplacé par la position recalée.
    const newRoad = Object.assign({
      type:      "itinerary",
      points:    result.path,
      waypoints: [origin].concat(etapes.map(function(w) { return Object.assign({}, w); }))
    }, _champsGuidage(result));
    // 🪧 Une sortie d'urgence replanifiée reste une sortie d'urgence.
    if (road.urgence) newRoad.urgence = true;
    if (road.secours) newRoad.secours = road.secours;   // reste le parcours de l'équipe
    if (road.suite) newRoad.suite = road.suite;         // inter-plans : la suite après le portail
    const filtered = (window.getRoads ? window.getRoads() : [])
      .filter(function(r) { return r.type !== "itinerary"; });
    filtered.push(newRoad);
    if (window.setRoads) window.setRoads(filtered);
    _itineraryWaypoints = newRoad.waypoints.map(function(w) { return Object.assign({}, w); });
    _redessinerWaypoints();
    _majLabelDistanceItineraire();
    console.log("[Itineraire] Replanifié depuis (" + Math.round(px) + "," + Math.round(py) + ") — " +
                restantes.length + " étape(s) restante(s)");
    const alerteRaccord = _texteAlerteRaccord(newRoad);
    if (alerteRaccord) _toastIti("⚠️ " + alerteRaccord, "warn");
  } catch(err) {
    // Pas de chemin depuis la nouvelle position (réseau non connecté, etc.) :
    // on GARDE l'ancien tracé tel quel, on informe sans bloquer.
    const msg = (err && err.i18nKey && window.I18n)
      ? window.I18n.t(err.i18nKey, err.i18nParams || {})
      : (err && err.message) || String(err);
    _toastIti(window.I18n.t("iti.replan.err", { err: msg }), "warn");
  }
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
    if (!raw) return { points: [], tags: [], zones: [], radius: ITI_AVOID_DEFAULT_RADIUS,
                       respecterInaccessibles: true };
    const obj = JSON.parse(raw);
    return {
      points: Array.isArray(obj.points) ? obj.points : [],
      tags:   Array.isArray(obj.tags)   ? obj.tags   : [],
      zones:  Array.isArray(obj.zones)  ? obj.zones  : [],   // 🆕 v1.48.0 : ids dérivés des zones à éviter
      radius: Number.isFinite(obj.radius) ? obj.radius : ITI_AVOID_DEFAULT_RADIUS,
      // 🆕 v1.82.0 — seule contrainte DURE du moteur, desormais debrayable.
      // `!== false` : une pref enregistree avant cette version n'a pas le
      // champ, et doit garder le comportement historique (= respecter).
      respecterInaccessibles: obj.respecterInaccessibles !== false
    };
  } catch(e) {
    return { points: [], tags: [], zones: [], radius: ITI_AVOID_DEFAULT_RADIUS,
             respecterInaccessibles: true };
  }
}

function _setItiAvoidPrefs(prefs) {
  try {
    localStorage.setItem(_itiAvoidLsKey(), JSON.stringify(prefs));
  } catch(e) {}
}

// 🆕 v1.48.0 — Rendu des TYPES de zones à éviter (1 checkbox par type, comme
// les autres filtres). Source : window.getAvoidableZoneTypes() (pathfinder :
// types distincts des zones session + embarquées, sauf "inaccessible", label
// résolu legend/custom). Coché = type présent dans prefs.zones. Persiste à
// chaque toggle. Contrainte SOUPLE côté pathfinder (relâchée si aucun chemin).
function _rafraichirListeAvoidZones() {
  const el = document.getElementById("kta-iti-avoid-zones-list");
  if (!el) return;
  // 1 entrée par TYPE de zone (comme les autres filtres), pas par instance.
  // prefs.zones contient des TYPES ; cocher un type = éviter toutes ses zones.
  const types = (typeof window.getAvoidableZoneTypes === "function") ? window.getAvoidableZoneTypes() : [];
  if (!types.length) {
    el.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">' + window.I18n.t("iti.avoid.zonesEmpty") + '</p>';
    return;
  }
  const prefs = _getItiAvoidPrefs();
  function _esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  el.innerHTML = types.map(function(z) {
    const checked = prefs.zones.indexOf(z.type) >= 0;
    const cnt = ' <span style="opacity:.6; font-size:11px;">(' + z.count + ')</span>';
    return '<label class="kta-iti-avoid-zone-row">' +
             '<input type="checkbox" class="kta-iti-avoid-zone-cb" data-ztype="' + _esc(z.type) + '"' + (checked ? ' checked' : '') + '> ' +
             '<span>' + _esc(z.label) + cnt + '</span>' +
           '</label>';
  }).join("");
  el.querySelectorAll(".kta-iti-avoid-zone-cb").forEach(function(cb) {
    cb.addEventListener("change", function() {
      const zt = cb.getAttribute("data-ztype");
      const prefs2 = _getItiAvoidPrefs();
      const i = prefs2.zones.indexOf(zt);
      if (cb.checked && i < 0) prefs2.zones.push(zt);
      else if (!cb.checked && i >= 0) prefs2.zones.splice(i, 1);
      _setItiAvoidPrefs(prefs2);
    });
  });
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

        // === Zones inaccessibles (🆕 v1.82.0) ===
        // Placée AVANT les évitements souples : c'est la contrainte la plus
        // forte, et la seule que le moteur ne relâche jamais de lui-même.
        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.inacc.title") + '</div>' +
          '<label class="kta-iti-avoid-zone-row">' +
            '<input type="checkbox" id="kta-iti-respect-inacc"' +
              (prefs.respecterInaccessibles === false ? '' : ' checked') + '>' +
            '<span>' + window.I18n.t("iti.inacc.label") + '</span>' +
          '</label>' +
          '<p class="kta-iti-help" style="margin:2px 0 0; font-size:11.5px;">' +
            window.I18n.t("iti.inacc.help") +
          '</p>' +
        '</div>' +

        // === Zones à éviter (🆕 v1.48.0) ===
        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.avoid.zonesTitle") + '</div>' +
          '<p class="kta-iti-help" style="margin:2px 0 6px; font-size:11.5px;">' +
            window.I18n.t("iti.avoid.zonesHelp") +
          '</p>' +
          '<div id="kta-iti-avoid-zones-list" class="kta-iti-avoid-zones-list"></div>' +
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
  // 🆕 v1.82.0 — persiste immédiatement, comme les autres réglages de la
  // section : la modale peut être fermée par le calcul lui-même.
  const inaccCb = document.getElementById("kta-iti-respect-inacc");
  if (inaccCb) {
    inaccCb.addEventListener("change", function () {
      const p = _getItiAvoidPrefs();
      p.respecterInaccessibles = !!inaccCb.checked;
      _setItiAvoidPrefs(p);
    });
  }

  const resetBtn = document.getElementById("kta-iti-avoid-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", function() {
      if (!confirm(window.I18n.t("iti.avoid.resetConfirm"))) return;
      // Le reset rend le comportement SÛR, pas le dernier choix : la case
      // revient cochée comme le reste revient à vide.
      _setItiAvoidPrefs({ points: [], tags: [], zones: [], radius: ITI_AVOID_DEFAULT_RADIUS,
                          respecterInaccessibles: true });
      const cbI = document.getElementById("kta-iti-respect-inacc");
      if (cbI) cbI.checked = true;
      _rafraichirListeAvoidPoints();
      _rafraichirChipsAvoidTags();
      _rafraichirListeAvoidZones();
      if (radiusInput) radiusInput.value = String(ITI_AVOID_DEFAULT_RADIUS);
    });
  }

  // Premier rendu des chips + liste
  _rafraichirListeAvoidPoints();
  _rafraichirChipsAvoidTags();
  _rafraichirListeAvoidZones();
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
    // 🆕 v1.61.0 : étapes validées exclues du compte de pauses
    const nbWpAct       = Array.isArray(existingItinerary.waypoints)
      ? existingItinerary.waypoints.filter(function(w) { return !w.done; }).length : 2;
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
        // 📉 v1.83.0 — accès au profil en long. Le chemin est DÉJÀ là :
        // `existingItinerary.points` porte le niveau de chaque point depuis
        // que `computeRoute` cesse de le jeter. Aucune plomberie en plus.
        '<button id="kta-iti-profil" class="kta-btn kta-btn-ghost kta-btn-small" type="button"' +
          ' style="width:100%; margin-top:6px;">📉 ' + window.I18n.t("prof.profil.btn") + '</button>' +
        // 🪧 Feuille de route (guidage, lot 1) — toutes les consignes, sans tracker.
        (window.ItiGuidage
          ? '<button id="kta-iti-feuille" class="kta-btn kta-btn-ghost kta-btn-small" type="button"' +
              ' style="width:100%; margin-top:6px;">🪧 ' + window.I18n.t("guid.feuille.btn") + '</button>'
          : '') +
      '</div>';
  }
  if (!window._itiFeuilleBound) {
    window._itiFeuilleBound = true;
    document.addEventListener("click", function (e) {
      const b = e.target && e.target.closest && e.target.closest("#kta-iti-feuille");
      if (!b || !window.ItiGuidage) return;
      const iti = ((window.getRoads && window.getRoads()) || [])
        .find(function (r) { return r && r.type === "itinerary"; });
      if (iti) window.ItiGuidage.ouvrirFeuilleDeRoute(iti);
    });
  }
  // Délégation plutôt qu'un listener direct : ce bloc est réécrit à chaque
  // rafraîchissement du panneau, un `addEventListener` posé sur le bouton
  // partirait avec lui au premier recalcul.
  if (!window._itiProfilBound) {
    window._itiProfilBound = true;
    document.addEventListener("click", function (e) {
      const b = e.target && e.target.closest && e.target.closest("#kta-iti-profil");
      if (!b || !window.ProfondeurNiveaux) return;
      const roads = (window.getRoads && window.getRoads()) || [];
      const iti = roads.find(function (r) { return r && r.type === "itinerary"; });
      if (iti && Array.isArray(iti.points)) window.ProfondeurNiveaux.ouvrirProfil(iti.points);
    });
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
      // 🆕 v1.60.0 (A6 1:c) — destination sur un AUTRE plan : ouvre la
      // recherche multi-plans en mode sélection → itinéraire via portail
      // (InterPlanRoute). Affiché seulement si les modules sont chargés.
      ((window.CrossPlanSearch && window.InterPlanRoute)
        ? '<button id="kta-iti-crossplan" class="kta-btn kta-btn-ghost" type="button" style="width:100%; margin-top:8px;">🌐 ' +
            window.I18n.t("ipr.btn.fromItiModal") + '</button>'
        : '') +
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
      modal.remove();
      _effacerItineraireActif();
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

  // 🆕 v1.60.0 (A6) — Destination sur un autre plan : recherche multi-plans
  // en mode sélection. Point du plan COURANT sélectionné → simple waypoint
  // (flux classique) ; point DISTANT → itinéraire via portail (InterPlanRoute,
  // la modale itinéraire est fermée — le résumé par étapes prend le relais).
  const btnCross = document.getElementById("kta-iti-crossplan");
  if (btnCross) {
    btnCross.addEventListener("click", function() {
      window.CrossPlanSearch.ouvrir("", { onSelect: function(plan, pt) {
        const label = pt.nom || pt.id || (pt.x + "," + pt.y);
        if (plan.id === (window._currentLoadedPlanId || null)) {
          window.itineraireAjouterWaypoint(pt.x, pt.y, label);
          return;
        }
        // 🌀 v1.64.0 (KARMA « plusieurs points de passage sur le plan A avant
        // le portail ») : les étapes déjà posées dans la modale (non validées,
        // hors origine tracker) deviennent des points de passage OBLIGATOIRES
        // du leg A, dans l'ordre planifié, AVANT le portail.
        const viaA = _itineraryWaypoints
          .filter(function(w) { return !w.done && w.source !== "tracker"; })
          .map(function(w) { return { x: w.x, y: w.y, label: w.label || "" }; });
        fermer();   // fermeture propre de la modale (helper local, cf ci-dessous)
        window.InterPlanRoute.computeEtAfficher({
          planId: plan.id, planName: plan.name || plan.id,
          x: pt.x, y: pt.y, level: pt.level,
          tag: (Array.isArray(pt.tags) && pt.tags[0]) || undefined,
          label: label
        }, { viaWaypoints: viaA });
      }});
    });
  }

  // Calculer (handler async depuis v169 : computeRoute peut await SearchPoints
  // si avoidTags non vide — l'await passe immediatement si pas d'avoidTags)
  document.getElementById("kta-iti-compute").addEventListener("click", async function() {
    const btn   = this;
    const errEl = document.getElementById("kta-iti-error");
    const resEl = document.getElementById("kta-iti-result");
    errEl.style.display = "none";
    resEl.style.display = "none";

    // 🆕 v1.61.0 : les étapes validées (done) restent listées mais sont
    // EXCLUES du calcul — sinon « Recalculer » re-router par des étapes
    // déjà visitées.
    const wpsCalc = _itineraryWaypoints.filter(function(w) { return !w.done; });
    if (wpsCalc.length < 2) {
      errEl.textContent = window.I18n.t("iti.err.min2");
      errEl.style.display = "block";
      return;
    }

    if (!window.Pathfinder) {
      errEl.textContent = window.I18n.t("iti.err.pathfinder");
      errEl.style.display = "block";
      return;
    }
    if (_itiAucunTrace()) {
      errEl.textContent = window.I18n.t("guid.aucunTrace");
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
      const result = await _withItiComputeLoader(function() {
        return window.Pathfinder.computeRoute(wpsCalc, {
          avoidPoints: avoidPrefs.points || [],
          avoidTags:   avoidPrefs.tags   || [],
          avoidZones:  avoidPrefs.zones  || [],
          // 🆕 v1.82.0 — la seule contrainte DURE du moteur suit la case de la modale.
          respecterInaccessibles: avoidPrefs.respecterInaccessibles !== false,
          avoidRadius: avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS
        });
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
      // 🪧 raccords à vol d'oiseau compris (décision K) — même total que le libellé.
      const raccordsPx = window.ItiGuidage ? window.ItiGuidage.longueurRaccordsPx(result) : 0;
      const distM = (result.totalDistance + raccordsPx) / scale;

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

      const tempsCalcMin = _tempsItineraireMinutes(distM, wpsCalc.length);
      const alerteRaccord = _texteAlerteRaccord(result);
      const raccordHtml = alerteRaccord
        ? '<div class="kta-iti-result-row kta-guid-alerte">⚠️ ' + _escapeHtml(alerteRaccord) + '</div>'
        : '';
      resEl.innerHTML =
        fallbackHtml +
        raccordHtml +
        '<div class="kta-iti-result-row"><strong>' + window.I18n.t("iti.result.distance") + '</strong> ' + window.formatDistance(distM, 1) + '</div>' +
        '<div class="kta-iti-result-row"><strong>' + window.I18n.t("iti.result.time") + '</strong> ' + _formatTempsMinutes(tempsCalcMin) + '</div>' +
        '<div class="kta-iti-result-row"><strong>' + window.I18n.t("iti.result.segmentsCrossed") + '</strong> ' + result.segmentCount + '</div>' +
        (window.ItiGuidage
          ? '<button id="kta-iti-feuille-preview" class="kta-btn kta-btn-ghost kta-btn-small" type="button"' +
              ' style="width:100%; margin-top:6px;">🪧 ' + window.I18n.t("guid.feuille.btn") + '</button>'
          : '') +
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
      const previewRoad = Object.assign({
        type:      "itinerary",
        points:    result.path,
        waypoints: _itineraryWaypoints.map(function(w) { return Object.assign({}, w); }),
        _preview:  true
      }, _champsGuidage(result));
      const currentRoads = window.getRoads ? window.getRoads() : [];
      const filtered = currentRoads.filter(function(r) { return r.type !== "itinerary"; });
      filtered.push(previewRoad);
      if (window.setRoads) window.setRoads(filtered);
      _majLabelDistanceItineraire();

      const btnFeuille = document.getElementById("kta-iti-feuille-preview");
      if (btnFeuille) btnFeuille.addEventListener("click", function() {
        window.ItiGuidage.ouvrirFeuilleDeRoute(previewRoad);
      });

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
      // 🌍 i18n : erreurs Pathfinder portent err.i18nKey (+ err.i18nParams),
      // localisées ici au rendu. Fallback : err.message FR brut.
      errEl.textContent = (err && err.i18nKey && window.I18n)
        ? window.I18n.t(err.i18nKey, err.i18nParams || {})
        : (err.message || String(err));
      errEl.style.display = "block";
    } finally {
      // 🆕 v1.43.26 (Pattern D) — Restore bouton dans tous les chemins de sortie
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
};
