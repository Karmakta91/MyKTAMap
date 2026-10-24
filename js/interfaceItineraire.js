/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE ITINÉRAIRE — UI du pathfinder, évitements, presets de vitesse
// =========================
// Expose : ouvrirItinerairModal() (modale : recherche, mode clic, étapes, vitesse, pause, évitements,
//   calcul + aperçu) · itineraireYAller / itineraireAjouterWaypoint (boutons des fiches POI) ·
//   get/setItiPauseEnabled, get/setItiPauseMinutes, getItiTempsMinutes (partagés avec le Mode Secours) ·
//   _majLabelDistanceItineraire (libellé bas-gauche, à rappeler après chaque setRoads) ·
//   itineraireRedessinerDepuisRoad, itineraireActiverRoad, getItineraireWaypoints.
// Dépend de : Pathfinder.computeRoute, SearchPoints, getRoads/setRoads, map/convertCoord, formatDistance,
//   APP_CONFIG.scale (px/m), ItiGuidage. Fonctions appelées au runtime : l'ordre de chargement est cosmétique.
// La suppression au clic (tracé/zone/structure) reste dans interface.js.
// Doc : docs/architecture/multilevel-pathfinding.md · docs/architecture/tracking.md §Guidage

// ── Itinéraire : modale, mode clic, rendu du tracé calculé ──────────
function _escapeHtml(s) { return window.ktaEsc(s); }

// ── Guidage : ce que l'itinéraire garde du calcul ──────────
// `raccords` (vol d'oiseau entre une étape et son tracé) et `carrefours` sont recopiés sur la road :
// itiGuidage.js et le pointillé de road.js les lisent, y compris après rechargement.
// Les TROIS créations d'itinéraire de ce fichier passent par ici.
function _champsGuidage(result) {
  return {
    raccords:   Array.isArray(result && result.raccords)   ? result.raccords   : [],
    carrefours: Array.isArray(result && result.carrefours) ? result.carrefours : []
  };
}

// Plan sans aucun tracé → on avertit au lancement : le calcul échouerait sur un message technique
// et le guidage n'aurait rien à dire (décision produit).
function _itiAucunTrace() {
  return !!(window.Pathfinder && typeof window.Pathfinder.aDesTraces === "function" &&
            !window.Pathfinder.aDesTraces());
}

// Raccord à vol d'oiseau > 50 m → on avertit sans bloquer (décision produit).
function _texteAlerteRaccord(road) {
  if (!window.ItiGuidage) return "";
  return window.ItiGuidage.texteAlerteRaccord(window.ItiGuidage.alerteRaccord(road));
}

// ── Overlay de calcul ──────────
// Le Dijkstra prend 1-3 s sur un réseau dense : loader plein écran (modale ET popup « jusqu'ici »).
// 🩸 `computeRoute` est async mais son Dijkstra est SYNCHRONE et bloque le thread : sans attendre une
// frame (rAF + setTimeout 0) après l'affichage, ni l'overlay ni « Calcul en cours… » ne sont peints.
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
  // rAF puis setTimeout 0 : au moins une frame peinte avant de bloquer le thread.
  await new Promise(function(r) { requestAnimationFrame(function() { setTimeout(r, 0); }); });
  try {
    return await fn();
  } finally {
    _hideItiComputeOverlay();
  }
}

// ── Pan + flash (boutons « aller à » des étapes) ──────────
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

// ── Fiche d'un point : « Y aller » / « Ajouter à l'itinéraire » ──────────
// Appelés depuis utils.js > buildPointPopupHtml. Toutes les routes session + embarquées participent.

// Confirme le remplacement de l'itinéraire en place (`actif`). Parcours d'une équipe du Mode Secours
// (road.secours) : la fenêtre le dit — le remplacer arrête son guidage — et met « Garder » en avant.
function _confirmRemplacerItineraire(onConfirm, actif) {
  const existing = document.getElementById("kta-iti-confirm-replace");
  if (existing) existing.remove();
  let equipe = null;
  if (actif && actif.secours) {
    try {
      const sc = window.SecoursMode && typeof window.SecoursMode.get === "function" ? window.SecoursMode.get(actif.secours.scenarioId) : null;
      const g = sc && (sc.groupes || []).find(function(x) { return x.id === actif.secours.equipeId; });
      equipe = (g && g.nom) || "—";
    } catch (e) { equipe = "—"; }
  }
  const T = window.I18n.t;
  const esc = window.ktaEsc;

  const modal = document.createElement("div");
  modal.id = "kta-iti-confirm-replace";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-modal" style="max-width:420px;">' +
      '<div class="kta-modal-icon" style="color:var(--kta-accent-texte);">⚠️</div>' +
      '<div class="kta-modal-titre">' + (equipe !== null ? esc(T("iti.replace.secoursTitre")) : T("iti.replace.titre")) + '</div>' +
      '<div class="kta-modal-texte">' +
        (equipe !== null ? esc(T("iti.replace.secoursTexte", { equipe: equipe })) : T("iti.replace.texte")) +
      '</div>' +
      '<div class="kta-modal-actions">' +
        (equipe !== null
          ? '<button class="kta-btn kta-btn-ghost"   id="kta-iti-confirm-ok"     type="button">' + esc(T("iti.replace.secoursOk")) + '</button>' +
            '<button class="kta-btn kta-btn-primary" id="kta-iti-confirm-cancel" type="button">' + esc(T("iti.replace.secoursGarder")) + '</button>'
          : '<button class="kta-btn kta-btn-ghost"   id="kta-iti-confirm-cancel" type="button">' + T("iti.replace.cancel") + '</button>' +
            '<button class="kta-btn kta-btn-primary" id="kta-iti-confirm-ok"     type="button">' + T("iti.replace.ok") + '</button>') +
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

// « Y aller » : du tracker vers ce point ; confirme si un itinéraire est actif.
// `opts.origine` {x, y} : origine imposée (la Sortie d'urgence passe celle de SON calcul).
// Règle « instant T » (décision produit) : suivi actif OU position confirmée → départ du tracker sans
// question ; jamais confirmée → picker « Où es-tu ? » qui recale le tracker, puis retour ici.
// Options d'évitement : préférences de l'itinéraire, ou contraintes d'une évacuation (Mode Secours,
// options brancard) qui les remplacent entièrement.
function _optsEvitement(avoidPrefs, evC) {
  if (evC) {
    return { avoidPoints: [], avoidTags: [], avoidRadius: 0,
             avoidZones: Array.isArray(evC.avoidZones) ? evC.avoidZones : [],
             respecterInaccessibles: evC.respecterInaccessibles !== false };
  }
  return {
    avoidPoints: avoidPrefs.points || [],
    avoidTags:   avoidPrefs.tags   || [],
    avoidZones:  avoidPrefs.zones  || [],
    // la seule contrainte DURE du moteur suit la case de la modale.
    respecterInaccessibles: avoidPrefs.respecterInaccessibles !== false,
    avoidRadius: avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS,
    corde: avoidPrefs.corde === true
  };
}

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
    window.ktaAlerte(window.I18n.t("iti.err.trackerPos"));
    return;
  }
  if (!window.Pathfinder) {
    window.ktaAlerte(window.I18n.t("iti.err.pathfinder"), { type: "erreur" });
    return;
  }
  if (_itiAucunTrace()) {
    window.ktaAlerte(window.I18n.t("guid.aucunTrace"));
    return;
  }

  const labelPoint = nom ? String(nom) : window.I18n.t("iti.point.coords", { x: Math.round(x), y: Math.round(y) });

  async function _calculer() {
    // Sinon la popup reste affichée derrière le tracé.
    if (window.map) try { window.map.closePopup(); } catch(e) {}

    const waypoints = [
      {
        x: pos.x, y: pos.y, source: "tracker",
        label: window.I18n.t("iti.wp.currentPos", { x: Math.round(pos.x), y: Math.round(pos.y) })
      },
      { x: x, y: y, source: "search", label: labelPoint }
    ];

    try {
      // Préférences d'évitement de la modale réutilisées pour cohérence.
      const avoidPrefs = _getItiAvoidPrefs();
      // Évacuation (Mode Secours) : ses contraintes remplacent les préférences.
      const evC = opts.evacuation && opts.evacuation.contraintes;
      const result = await _withItiComputeLoader(function() {
        return window.Pathfinder.computeRoute(waypoints, _optsEvitement(avoidPrefs, evC));
      });

      const newRoad = Object.assign({
        type:      "itinerary",
        points:    result.path,
        waypoints: waypoints
      }, _champsGuidage(result));
      // Sortie d'urgence marquée : bandeau sans croix, affiché même réglé sur « Jamais »,
      // « Recalculer » vise la sortie la plus proche.
      if (opts.urgence) newRoad.urgence = true;
      if (opts.evacuation) newRoad.evacuation = opts.evacuation;

      const currentRoads = window.getRoads ? window.getRoads() : [];
      const filtered = currentRoads.filter(function(r) { return r.type !== "itinerary"; });
      filtered.push(newRoad);
      if (window.setRoads) window.setRoads(filtered);

      _itineraryWaypoints = waypoints.map(function(w) { return Object.assign({}, w); });
      if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
      _itineraryWaypoints.forEach(function(p, i) {
        _ajouterWaypointVisuel(p, i + 1);
      });
      _majLabelDistanceItineraire();

      _panEtFlashSurPoint({ x: x, y: y });

      const alerteRaccord = _texteAlerteRaccord(newRoad);
      if (alerteRaccord) _toastIti("⚠️ " + alerteRaccord, "warn");

    } catch(err) {
      window.ktaAlerte(window.I18n.t("iti.err.compute", { err: (err.message || err) }), { type: "erreur" });
    }
  }

  // Pas de confirmation en sortie d'urgence : l'utilisateur vient de toucher « Tracer ».
  const existing = (window.getRoads ? window.getRoads() : [])
    .find(function(r) { return r.type === "itinerary"; });
  if (existing && !opts.urgence) {
    _confirmRemplacerItineraire(_calculer, existing);
  } else {
    _calculer();
  }
};

// « ➕ Itinéraire » : ajoute une étape à l'itinéraire existant, ou ouvre la modale pré-remplie.
window.itineraireAjouterWaypoint = function(x, y, nom) {
  if (typeof x !== "number" || typeof y !== "number") return;

  if (window.map) try { window.map.closePopup(); } catch(e) {}

  const labelPoint = nom ? String(nom) : window.I18n.t("iti.point.coords", { x: Math.round(x), y: Math.round(y) });
  const newWaypoint = { x: x, y: y, source: "search", label: labelPoint };

  if (document.getElementById("kta-itinerary-modal")) {
    _itineraryWaypoints.push(newWaypoint);
    _ajouterWaypointVisuel({ x: x, y: y }, _itineraryWaypoints.length);
    _rafraichirListeWaypointsModale();
    _majPanneauFloaterCount();
    return;
  }

  // Modale fermée : on l'ouvre (elle restaure _itineraryWaypoints depuis l'itinéraire actif),
  // puis on pousse l'étape.
  window.ouvrirItinerairModal();
  _itineraryWaypoints.push(newWaypoint);
  _ajouterWaypointVisuel({ x: x, y: y }, _itineraryWaypoints.length);
  _rafraichirListeWaypointsModale();
};


// ── Libellé de distance (bas-gauche, au-dessus du libellé measure) ──────────
let _itiDistanceCtrl = null;

// ── Presets de vitesse ──────────
// Persistés en localStorage. Libellés résolus au rendu (_presetLabel/_presetHint), jamais au load.
const ITI_SPEED_PRESETS = {
  blesse:  { kmh: 2, icon: "🤕" },
  lente:   { kmh: 3, icon: "🐌" },
  normale: { kmh: 5, icon: "🚶" },
  rapide:  { kmh: 7, icon: "🏃" }
};
function _presetLabel(key) { return window.I18n.t("iti.speed." + key + ".label"); }
function _presetHint(key)  { return window.I18n.t("iti.speed." + key + ".hint"); }
const DEFAULT_ITI_SPEED       = "normale";
const ITI_SPEED_STORAGE_KEY   = "myktamap_iti_walking_preset";

// Pause par arrêt intermédiaire configurable (case + minutes, défaut cochée 15 min), en localStorage.
// secoursMode.js > _recalculerItineraireGroupe lit les mêmes réglages.
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
// Partagés avec secoursMode.js : la pause réglée ici vaut aussi pour les durées du Mode Secours.
window.getItiPauseEnabled = _getItiPauseEnabled;
window.getItiPauseMinutes = _getItiPauseMinutes;
// ⚠️ Les setters persistent sans re-rendu : l'appelant recalcule ce qui dépend de la pause.
window.setItiPauseEnabled = _setItiPauseEnabled;
window.setItiPauseMinutes = _setItiPauseMinutes;

function _getItiSpeedPreset() {
  try {
    let stored = localStorage.getItem(ITI_SPEED_STORAGE_KEY);
    // Ancien preset « bourre » renommé « blesse » : réécrit pour garder le réglage.
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
  if (typeof window._majLabelDistanceItineraire === "function") {
    window._majLabelDistanceItineraire();
  }
  return true;
}

function _vitesseMarcheKmh() {
  const preset = _getItiSpeedPreset();
  return ITI_SPEED_PRESETS[preset].kmh;
}

// Temps total estimé en minutes : marche + pauses intermédiaires (si activées).
function _tempsItineraireMinutes(distanceM, nbWaypoints) {
  if (typeof distanceM !== "number" || distanceM <= 0) return 0;
  const tempsMarcheMin = distanceM / (_vitesseMarcheKmh() * 1000 / 60);  // m / (m/min)
  const nbPausesInter  = Math.max(0, (nbWaypoints || 0) - 2);
  const pauseEnabled   = _getItiPauseEnabled();
  const pauseMin       = pauseEnabled ? _getItiPauseMinutes() : 0;
  const tempsPauseMin  = nbPausesInter * pauseMin;
  return tempsMarcheMin + tempsPauseMin;
}
window.getItiTempsMinutes = _tempsItineraireMinutes;

function _formatTempsMinutes(totalMin) {
  if (!totalMin || totalMin < 1) return window.I18n.t("iti.time.lessMin");
  if (totalMin < 60) return window.I18n.t("iti.time.min", { n: Math.round(totalMin) });
  const heures  = Math.floor(totalMin / 60);
  const minutes = Math.round(totalMin - heures * 60);
  return window.I18n.t("iti.time.hourMin", { h: heures, m: (minutes < 10 ? "0" + minutes : minutes) });
}

function _afficherLabelDistanceItineraire(distanceM, nbWaypoints) {
  if (!window.map) return;
  // 🩸 Après un changement de plan, map.remove() détache le contrôle (_map devient null) :
  // il faut le recréer, pas réutiliser l'ancien.
  if (!_itiDistanceCtrl || !_itiDistanceCtrl._map) {
    _itiDistanceCtrl = L.control({ position: "bottomleft" });
    _itiDistanceCtrl.onAdd = function() {
      const div = L.DomUtil.create("div", "leaflet-bar leaflet-control kta-iti-distance");
      div.innerHTML = '<span class="kta-iti-distance-icon">🗺️</span>' + window.I18n.t("iti.label.empty");
      // Clic → modale itinéraire.
      div.style.cursor = "pointer";
      div.title = window.I18n.t("iti.label.openMenu");
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

// Distance d'un tracé itinéraire en mètres (points en px plan, APP_CONFIG.scale en px/m).
function _distanceItineraireMeters(road) {
  if (!road || !Array.isArray(road.points) || road.points.length < 2) return 0;
  let totalPx = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    totalPx += Math.hypot(b.x - a.x, b.y - a.y);
  }
  // Le trajet à vol d'oiseau jusqu'au tracé fait partie du chemin. Un itinéraire sans `raccords`
  // garde sa distance d'origine.
  if (window.ItiGuidage) totalPx += window.ItiGuidage.longueurRaccordsPx(road);
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
  return totalPx / scale;
}

// À appeler après chaque setRoads / save / discard / changement de plan / restauration de session.
function _majLabelDistanceItineraire() {
  if (!window.getRoads || !window.map) return;
  const itineraryRoad = window.getRoads().find(function(r) { return r.type === "itinerary"; });
  if (itineraryRoad) {
    const distM = _distanceItineraireMeters(itineraryRoad);
    // Les étapes validées (done) ne comptent plus dans les pauses.
    const nbWp  = Array.isArray(itineraryRoad.waypoints)
      ? itineraryRoad.waypoints.filter(function(w) { return !w.done; }).length : 2;
    _afficherLabelDistanceItineraire(distM, nbWp);
  } else {
    _masquerLabelDistanceItineraire();
  }
}
window._majLabelDistanceItineraire = _majLabelDistanceItineraire;

let _itineraryWaypoints   = [];
let _itineraryMarkerLayer = null;     // layer Leaflet contenant les markers numérotés
let _itineraryClickActive = false;
// Handler à RÉFÉRENCE STABLE (cf _itineraryMapClick) : on/off idempotents.

// Étapes de l'itinéraire actif pour la vibration de proximité (tracking.js > _checkWaypointProximity).
// Rend une COPIE, sans les étapes validées ni le point 0 tracker (vibrer sur sa propre origine = bruit).
window.getItineraireWaypoints = function() {
  return _itineraryWaypoints.filter(function(w) {
    return !w.done && w.source !== "tracker";
  });
};

function _ajouterWaypointVisuel(p, num) {
  if (!window.map) return;
  // 🩸 Même piège que le libellé : layerGroup détaché par un changement de plan → le recréer,
  // sinon les marqueurs vont sur un calque mort.
  if (!_itineraryMarkerLayer || !_itineraryMarkerLayer._map) {
    _itineraryMarkerLayer = L.layerGroup().addTo(window.map);
  }
  // Étape validée → ✓ vert au lieu du numéro.
  const done = !!p.done;
  const icon = L.divIcon({
    className: "kta-itinerary-waypoint" + (done ? " kta-iti-wp-done" : ""),
    html: '<div class="kta-iti-num">' + (done ? "✓" : num) + '</div>',
    iconSize:  [28, 28],
    iconAnchor: [14, 14]
  });
  // Un waypoint-POI reste interactive:false (le clic doit traverser vers la popup du POI dessous).
  // Une étape posée AU CLIC n'a aucun objet cliquable : son marqueur devient cliquable (non validée
  // seulement) avec une mini-popup « Je suis ici » qui suit EXACTEMENT le chemin POI
  // (recalerTrackerSurPoint → _notifierRecalage("point") → validation + replanification).
  const cliquable = !done && p.source === "click";
  const m = L.marker(convertCoord(p.x, p.y), { icon: icon, interactive: cliquable })
              .addTo(_itineraryMarkerLayer);
  if (cliquable) {
    m.bindPopup(
      '<div class="kta-popup-point"><b>' + window.I18n.t("iti.wp.popupEtape", { n: num }) + '</b>' +
        '<div class="kta-popup-actions">' +
          // Écouteur global des fiches (utils.js > _ktaPopupAction) : pas de onclick inline (CSP).
          '<button class="kta-popup-btn kta-popup-btn-here" type="button" ' +
            'data-kta-act="ici" data-kta-x="' + (Number(p.x) || 0) + '" data-kta-y="' + (Number(p.y) || 0) + '" ' +
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

// Après rechargement, sessionPersist restaure le tracé mais pas les étapes ni leurs ✓ : reconstruit les
// waypoints en RAM depuis la road « itinerary » (flags `done` persistés) et redessine les marqueurs.
// Appelé par sessionPersist.js en fin de phase 2. Rend false s'il n'y a rien à redessiner.
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
    // Sources : "search" (point existant), "tracker", "click" (défaut).
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
    // Étape validée : rayée + ✓, reste listée pour la progression, exclue du calcul.
    const done = !!p.done;
    return '<div class="kta-iti-wp-row' + (done ? " kta-iti-wp-row-done" : "") + '">' +
             '<span class="kta-iti-wp-num">' + (done ? "✓" : (i + 1)) + '</span>' +
             '<span class="kta-iti-wp-icon' + sourceClass + '" title="' + sourceTitle + '">' + sourceIcon + '</span>' +
             '<span class="kta-iti-wp-coord">' + _escapeHtml(label) + '</span>' +
             '<button class="kta-iti-wp-goto"   data-idx="' + i + '" title="' + window.I18n.t("iti.wp.gotoTitle") + '">🎯</button>' +
             '<button class="kta-iti-wp-remove" data-idx="' + i + '" title="' + window.I18n.t("iti.wp.removeTitle") + '">✕</button>' +
           '</div>';
  }).join("");
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
  Array.from(cont.querySelectorAll(".kta-iti-wp-goto")).forEach(function(btn) {
    btn.addEventListener("click", function() {
      const idx = parseInt(btn.dataset.idx, 10);
      if (idx >= 0 && idx < _itineraryWaypoints.length) {
        const p = _itineraryWaypoints[idx];
        // Ferme la modale pour laisser voir la carte.
        const modal = document.getElementById("kta-itinerary-modal");
        if (modal) modal.remove();
        _panEtFlashSurPoint(p);
      }
    });
  });
}

// 🩸 Handler à RÉFÉRENCE STABLE + off-avant-on : avec une closure recréée à chaque activation, un cycle
// interrompu (rebuild de modale, changement de plan) laisse deux handlers → 1 clic = 2 étapes.
function _itineraryMapClick(e) {
  // Coords plan (convertCoord inverse y).
  const x = e.latlng.lng;
  const y = APP_CONFIG.imageHeight - e.latlng.lat;
  _itineraryWaypoints.push({ x: x, y: y, source: "click" });
  // Passer l'objet POUSSÉ (avec source), sinon le marqueur n'est pas cliquable avant le redessin.
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

// Supprime l'itinéraire (road + étapes + libellé). Partagé par « Effacer » (modale) et « Supprimer »
// de la question de recalcul.
function _effacerItineraireActif() {
  const roadsNow = (window.getRoads ? window.getRoads() : []).filter(function(r) { return r.type !== "itinerary"; });
  if (window.setRoads) window.setRoads(roadsNow);
  _viderItineraire();
  _majLabelDistanceItineraire();
  // Le bandeau ne se recalcule qu'à son battement d'1 s : sans ce rafraîchissement, l'ancienne consigne
  // réapparaît un instant à la fermeture.
  if (window.ItiGuidage && typeof window.ItiGuidage.rafraichir === "function") {
    try { window.ItiGuidage.rafraichir(); } catch (e) {}
  }
  // Itinéraire inter-plans : la suite prévue sur les autres plans part avec lui.
  if (window.InterPlanRoute && typeof window.InterPlanRoute.abandonnerSuite === "function") {
    window.InterPlanRoute.abandonnerSuite();
  }
}

// Mini panneau flottant pendant le mode clic (la modale bloquerait la carte) ; « Terminer » la réaffiche.
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

// ── Replanification au recalage + validation d'étapes ──────────
// À chaque recalage (clic carte, « Je suis ici », portail — hook window._onTrackerRecale de tracking.js),
// l'itinéraire actif est REPLANIFIÉ : la position devient le point 0, étapes restantes dans l'ordre prévu.
// « Je suis ici » sur les coords EXACTES d'une étape non validée = VALIDATION, dans n'importe quel ordre :
// flag done (persisté dans road.waypoints), exclue du calcul, ✓ vert. Dernière étape → toast « terminé »
// + effacement du tracé (le tracé tracker reste). Un clic carte ne valide jamais (coords approximatives).
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

// « Je suis ici » sur un point SUR l'itinéraire (≤ COUPE_SEUIL_M du trajet) : rien à recalculer, on COUPE
// ce qui est derrière ; le Dijkstra ne sert qu'au point hors trajet. Même tolérance que le guidage
// (itiGuidage > _seuils) : un seuil en pixels changerait de sens selon la résolution du plan.
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
// PREMIER passage du trajet à moins de `seuil` : sur un aller-retour vers un cul-de-sac, le premier
// « Je suis ici » coupe l'aller, le suivant le retour.
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

// true si l'itinéraire a été coupé, false si le point est hors trajet (→ replanification).
function _couperDerriere(road, x, y) {
  const pts = road.points;
  if (!Array.isArray(pts) || pts.length < 2) return false;
  // 🩸 Parcours d'une équipe de secours : ses étapes ne se valident que par le scénario
  // (secoursMode > _majRoadSuivi les recale à chaque mutation). Les couper ici serait défait aussitôt.
  if (road.secours) return false;
  const e = (window.APP_CONFIG && Number(window.APP_CONFIG.scale) > 0) ? Number(window.APP_CONFIG.scale) : 1;
  const cum = _cumulsTrajet(pts);
  const coupe = _premierPassage(pts, cum, { x: x, y: y }, COUPE_SEUIL_M * e);
  if (!coupe) return false;

  const a = pts[coupe.i], b = pts[coupe.i + 1];
  const lvl = (a.level === b.level) ? a.level : (coupe.t < 0.5 ? a.level : b.level);
  const tete = { x: coupe.x, y: coupe.y, level: (lvl === undefined) ? null : lvl };
  const points = [tete].concat(pts.slice(coupe.i + 1).map(function(p) { return Object.assign({}, p); }));

  // Projetés DANS L'ORDRE du trajet (chacun au-delà du précédent), sinon une étape du retour d'un
  // aller-retour serait prise pour une étape de l'aller.
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
  if (road.evacuation) newRoad.evacuation = road.evacuation;
  if (road.secours) newRoad.secours = road.secours;
  if (road.suite) newRoad.suite = road.suite;   // inter-plans : la suite après le portail

  const restantes = etapes.filter(function(w) { return !w.done; }).length;
  const filtered = (window.getRoads ? window.getRoads() : []).filter(function(r) { return r.type !== "itinerary"; });
  filtered.push(newRoad);
  if (window.setRoads) window.setRoads(filtered);
  _itineraryWaypoints = newRoad.waypoints.map(function(w) { return Object.assign({}, w); });
  _redessinerWaypoints();
  _majLabelDistanceItineraire();
  // Dernière étape dépassée : clôture (toast « terminé » + effacement).
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

  // Validation uniquement au recalage "point" (coords exactes).
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
      // restantes === 0 → toast « terminé » géré par _replanifierDepuis.
    }
  }

  // Mode Secours (`sansReplan`) : on est SUR le parcours prévu, pas de proposition de recalcul.
  if (opts && opts.sansReplan) return;
  // Point SUR le trajet : on coupe derrière, sans Dijkstra ni question — sauf clôture (plus bas).
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
    // On DEMANDE avant de recalculer : sur un grand plan le Dijkstra peut prendre des dizaines de secondes.
    // Sûr : ce hook ne part que d'un geste utilisateur, jamais du tracker automatique.
    // 🩸 Exception : dernière étape validée → replan direct (clôture) ; la soumettre à confirmation
    // laisserait un itinéraire fini ouvert pour toujours.
    const roadNow = _roadItineraireActive();
    const restantes = roadNow && Array.isArray(roadNow.waypoints)
      ? roadNow.waypoints.filter(function(w) { return !w.done && w.source !== "tracker"; }).length
      : 0;
    if (restantes > 0) {
      const demander = window.ktaConfirm(window.I18n.t("iti.replan.confirm"), {
        titre: window.I18n.t("iti.replan.confirmTitre"),
        okLabel: window.I18n.t("iti.replan.confirmOk"),
        cancelLabel: window.I18n.t("iti.replan.confirmNon"),
        autre: { label: window.I18n.t("iti.replan.confirmSupprimer"), valeur: "supprimer" }
      });
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

// « Recalculer d'ici » du bandeau de guidage : geste explicite, pas de confirmation.
// itineraireActiverRoad : active un itinéraire DÉJÀ calculé (parcours d'une équipe du Mode Secours) comme
// celui de l'app — guidage, feuille de route, écran XL et replanification le prennent tel quel.
// `opts.confirmer` : demande avant de remplacer un itinéraire en cours.
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
  if (existing && opts.confirmer) _confirmRemplacerItineraire(activer, existing);
  else activer();
};

window.itineraireReplanifierDepuis = function(px, py) {
  if (typeof px !== "number" || typeof py !== "number") return;
  return _replanifierDepuis(px, py);   // la promesse : un appelant peut attendre le nouveau tracé
};

async function _replanifierDepuis(px, py) {
  const road = _roadItineraireActive();
  if (!road || !Array.isArray(road.waypoints)) return;
  const etapes    = road.waypoints.filter(function(w) { return w.source !== "tracker"; });
  const restantes = etapes.filter(function(w) { return !w.done; });

  // Toutes les étapes validées → terminé : on efface le tracé itinéraire (pas le tracé tracker).
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
    // Parcours d'une équipe : on garde SES évitements (zones des autres équipes), pas les préférences.
    const sec = road.secours || null;
    const evC = road.evacuation && road.evacuation.contraintes;
    // Un parcours de BALAYAGE n'est pas remplacé par un plus court chemin (qui sauterait boucles et
    // culs-de-sac) : on rejoint le circuit plus loin, puis on le suit. Point visé : à partir de la
    // progression (secoursMode > _avancerBalayage), le plus proche, légèrement pénalisé par l'avance.
    if (sec && Array.isArray(sec.balayage) && sec.balayage.length > 1 && !evC) {
      const B = sec.balayage;
      const deb = Number.isInteger(sec.balayageIdx) ? Math.min(sec.balayageIdx, B.length - 1) : 0;
      let k = deb, best = Infinity, cumul = 0;
      for (let i = deb; i < B.length; i++) {
        if (i > deb) cumul += Math.hypot(B[i].x - B[i - 1].x, B[i].y - B[i - 1].y);
        const score = Math.hypot(B[i].x - px, B[i].y - py) + 0.02 * cumul;
        if (score < best) { best = score; k = i; }
      }
      const rj = await _withItiComputeLoader(function() {
        return window.Pathfinder.computeRoute([origin, { x: B[k].x, y: B[k].y, level: B[k].level }],
          { avoidPoints: sec.avoidPoints || [], avoidRadius: sec.avoidRadius || 30 });
      });
      const chemin = rj.path.concat(B.slice(k + 1));
      const graphe = window.Pathfinder.buildNetworkGraph({ includeZones: true });
      const resB = { path: chemin, raccords: rj.raccords || [],
        carrefours: window.Pathfinder.carrefoursSurChemin ? window.Pathfinder.carrefoursSurChemin(graphe, chemin) : [] };
      const roadB = Object.assign({
        type: "itinerary", points: chemin,
        waypoints: [origin].concat(etapes.map(function(w) { return Object.assign({}, w); })),
        secours: Object.assign({}, sec, { balayageIdx: k })
      }, _champsGuidage(resB));
      const autres = (window.getRoads ? window.getRoads() : []).filter(function(r) { return r.type !== "itinerary"; });
      autres.push(roadB);
      if (window.setRoads) window.setRoads(autres);
      _itineraryWaypoints = roadB.waypoints.map(function(w) { return Object.assign({}, w); });
      _redessinerWaypoints();
      _majLabelDistanceItineraire();
      console.log("[Itineraire] Balayage rejoint au point " + k + "/" + B.length);
      return;
    }
    const result = await _withItiComputeLoader(function() {
      if (evC) return window.Pathfinder.computeRoute([origin].concat(restantes), _optsEvitement(avoidPrefs, evC));
      return window.Pathfinder.computeRoute([origin].concat(restantes), {
        avoidPoints: sec ? (sec.avoidPoints || []) : (avoidPrefs.points || []),
        avoidTags:   sec ? [] : (avoidPrefs.tags   || []),
        avoidZones:  sec ? [] : (avoidPrefs.zones  || []),
        // la seule contrainte DURE du moteur suit la case de la modale.
        respecterInaccessibles: avoidPrefs.respecterInaccessibles !== false,
        avoidRadius: sec ? (sec.avoidRadius || 30) : (avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS),
        corde: !sec && avoidPrefs.corde === true
      });
    });
    // road.waypoints garde TOUTES les étapes (validées incluses) ; seul l'ancien point 0 tracker est
    // remplacé par la position recalée.
    const newRoad = Object.assign({
      type:      "itinerary",
      points:    result.path,
      waypoints: [origin].concat(etapes.map(function(w) { return Object.assign({}, w); }))
    }, _champsGuidage(result));
    // Une sortie d'urgence replanifiée reste une sortie d'urgence.
    if (road.urgence) newRoad.urgence = true;
    if (road.evacuation) newRoad.evacuation = road.evacuation;   // garde ses options brancard
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
    // Pas de chemin depuis la nouvelle position : on GARDE l'ancien tracé, on informe sans bloquer.
    const msg = (err && err.i18nKey && window.I18n)
      ? window.I18n.t(err.i18nKey, err.i18nParams || {})
      : (err && err.message) || String(err);
    _toastIti(window.I18n.t("iti.replan.err", { err: msg }), "warn");
  }
}

// ── Évitements : préférences par plan ──────────
// localStorage par planId : { points: [{x,y,label,id?}], tags: [], zones: [], radius, respecterInaccessibles }
// Écrites à chaque modification, restaurées à l'ouverture de la modale.

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
      zones:  Array.isArray(obj.zones)  ? obj.zones  : [],   // ids dérivés des zones à éviter
      radius: Number.isFinite(obj.radius) ? obj.radius : ITI_AVOID_DEFAULT_RADIUS,
      // Seule contrainte DURE du moteur, débrayable. `!== false` : une préférence sans le champ
      // garde le comportement par défaut (respecter).
      respecterInaccessibles: obj.respecterInaccessibles !== false,
      // Puits sans échelon entre niveaux : hors itinéraire sauf équipe équipée (case cochée exprès).
      corde: obj.corde === true
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

// Types de zones à éviter (une case par TYPE, pas par instance) : window.getAvoidableZoneTypes()
// (types des zones session + embarquées, sauf "inaccessible"). Contrainte SOUPLE (relâchée si aucun chemin).
function _rafraichirListeAvoidZones() {
  const el = document.getElementById("kta-iti-avoid-zones-list");
  if (!el) return;
  const types = (typeof window.getAvoidableZoneTypes === "function") ? window.getAvoidableZoneTypes() : [];
  if (!types.length) {
    el.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">' + window.I18n.t("iti.avoid.zonesEmpty") + '</p>';
    return;
  }
  const prefs = _getItiAvoidPrefs();
  // 🔒 Guillemets compris (le type part dans data-ztype="…").
  const _esc = window.ktaEsc;
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

// Tags présents dans le plan, distincts et triés. SearchPoints.getAllPoints est async (en cache ensuite) ;
// retours [{point, source, layerId}] → on lit `.point.tags`.
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
    return Array.from(set).sort(function(a, b) { return String(a).localeCompare(String(b)); });
  } catch(e) { return []; }
}

// Mode clic carte des points d'évitement : état séparé de celui des étapes (sinon conflit).
// Modale cachée + floater orange ; chaque clic ajoute un point (persisté) ; « Terminer » réaffiche la modale.

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

  // Cachée, pas retirée : on garde son DOM pour la réafficher.
  if (mainModal) mainModal.style.display = "none";

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

// Section « Préférences d'évitement » de la modale, repliée (<details>).
function _htmlSectionAvoidItineraire(prefs) {
  const radiusVal = Number.isFinite(prefs.radius) ? prefs.radius : ITI_AVOID_DEFAULT_RADIUS;
  return '' +
    '<div class="kta-iti-section">' +
      '<details class="kta-iti-avoid-details">' +
        '<summary class="kta-iti-section-titre" style="cursor:pointer;">' + window.I18n.t("iti.avoid.title") + '</summary>' +

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
          '<button id="kta-iti-avoid-click-map" class="kta-btn kta-btn-ghost kta-btn-small" type="button" style="margin-bottom:8px;">' + window.I18n.t("iti.avoid.clickMapBtn") + '</button>' +
          '<div id="kta-iti-avoid-points-list" class="kta-iti-avoid-list"></div>' +
        '</div>' +

        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.avoid.tagsTitle") + '</div>' +
          '<div id="kta-iti-avoid-tags-chips" class="kta-iti-avoid-tags-chips"></div>' +
        '</div>' +

        // Inaccessibles AVANT les évitements souples : seule contrainte que le moteur ne relâche jamais.
        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.inacc.title") + '</div>' +
          '<label class="kta-iti-avoid-zone-row">' +
            '<input type="checkbox" id="kta-iti-respect-inacc"' +
              (prefs.respecterInaccessibles === false ? '' : ' checked') + '>' +
            '<span>' + window.I18n.t("iti.inacc.label") + '</span>' +
          '</label>' +
        '</div>' +

        // Plan multi-niveau : les puits sans échelon (jps) ne servent qu'à une équipe équipée.
        ((window.APP_CONFIG && window.APP_CONFIG.multiLevel === true)
          ? '<div class="kta-iti-avoid-group">' +
              '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.corde.title") + '</div>' +
              '<label class="kta-iti-avoid-zone-row">' +
                '<input type="checkbox" id="kta-iti-corde"' + (prefs.corde === true ? ' checked' : '') + '>' +
                '<span>' + window.I18n.t("iti.corde.label") + '</span>' +
              '</label>' +
            '</div>'
          : '') +

        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.avoid.zonesTitle") + '</div>' +
          '<p class="kta-iti-help" style="margin:2px 0 6px; font-size:11.5px;">' +
            window.I18n.t("iti.avoid.zonesHelp") +
          '</p>' +
          '<div id="kta-iti-avoid-zones-list" class="kta-iti-avoid-zones-list"></div>' +
        '</div>' +

        '<div class="kta-iti-avoid-group">' +
          '<div class="kta-iti-avoid-group-titre">' + window.I18n.t("iti.avoid.marginTitle") + '</div>' +
          '<div style="display:flex; align-items:center; gap:8px;">' +
            '<input type="number" id="kta-iti-avoid-radius" class="kta-cfg-input" ' +
              'value="' + radiusVal + '" min="0" max="500" step="10" style="width:90px;">' +
            '<span style="font-size:12px; color:var(--kta-texte-3);">' + window.I18n.t("iti.avoid.marginUnit") + '</span>' +
          '</div>' +
        '</div>' +

        '<button id="kta-iti-avoid-reset" class="kta-btn kta-btn-ghost kta-btn-small" type="button" style="margin-top:6px;">' + window.I18n.t("iti.avoid.reset") + '</button>' +
      '</details>' +
    '</div>';
}

function _rafraichirListeAvoidPoints() {
  const el = document.getElementById("kta-iti-avoid-points-list");
  if (!el) return;
  const prefs = _getItiAvoidPrefs();
  if (prefs.points.length === 0) {
    el.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">' + window.I18n.t("iti.avoid.listEmpty") + '</p>';
    return;
  }
  function _esc(s) { return window.ktaEsc(s); }
  el.innerHTML = prefs.points.map(function(p, idx) {
    return '<div class="kta-iti-avoid-chip">' +
             '<span class="kta-iti-avoid-chip-label">' + _esc(p.label || p.id || ("(" + p.x.toFixed(0) + "," + p.y.toFixed(0) + ")")) + '</span>' +
             '<button class="kta-iti-avoid-chip-remove" data-idx="' + idx + '" type="button" title="' + window.I18n.t("iti.avoid.chipRemove") + '">✕</button>' +
           '</div>';
  }).join("");
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

// Placeholder « Chargement… » pendant l'await des tags (sinon vide visible).
async function _rafraichirChipsAvoidTags() {
  const el = document.getElementById("kta-iti-avoid-tags-chips");
  if (!el) return;
  el.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">' + window.I18n.t("iti.avoid.tagsLoading") + '</p>';
  const prefs = _getItiAvoidPrefs();
  const available = await _itiAvoidGetAvailableTags();
  // La modale a pu être fermée pendant l'await : re-vérifier l'élément.
  const el2 = document.getElementById("kta-iti-avoid-tags-chips");
  if (!el2) return;
  if (available.length === 0) {
    el2.innerHTML = '<p class="kta-iti-help" style="font-style:italic; margin:6px 0;">' + window.I18n.t("iti.avoid.tagsNone") + '</p>';
    return;
  }
  function _esc(s) { return window.ktaEsc(s); }
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

// Appelé après injection du HTML dans la modale.
function _bindAvoidSectionHandlers() {
  // Recherche : SearchPoints.findByQuery (async), retours [{point, source, layerId}], débounce 150 ms.
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
        // L'input a changé entre-temps : la requête suivante remplace celle-ci.
        if (searchInput.value.trim() !== q) return;
        if (results.length === 0) {
          searchRes.innerHTML = '<div class="kta-iti-search-result-empty">' + window.I18n.t("iti.search.noPoint") + '</div>';
          searchRes.style.display = "block";
          return;
        }
        function _esc(s) { return window.ktaEsc(s); }
        searchRes.innerHTML = results.slice(0, 10).map(function(it, i) {
          const p = it.point;
          const label = p.nom || p.id || window.I18n.t("iti.search.unnamed");
          const sub   = p.id  ? p.id : "";
          return '<div class="kta-iti-search-result" data-idx="' + i + '">' +
                   '<strong>' + _esc(label) + '</strong>' +
                   (sub ? ' <span style="color:var(--kta-texte-3);">(' + _esc(sub) + ')</span>' : '') +
                 '</div>';
        }).join("");
        searchRes.style.display = "block";
        searchRes._lastResults = results;
      }, 150);
    });

    // Délégation posée UNE FOIS au build de la modale ; data-idx → `_lastResults`.
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

  const idInput = document.getElementById("kta-iti-avoid-byid-input");
  const idBtn   = document.getElementById("kta-iti-avoid-byid-add");
  if (idInput && idBtn && window.Pathfinder &&
      typeof window.Pathfinder.resolvePointById === "function") {
    function _ajouterParId() {
      const id = idInput.value.trim();
      if (!id) return;
      const resolved = window.Pathfinder.resolvePointById(id);
      if (!resolved) {
        window.ktaAlerte(window.I18n.t("iti.err.idNotFound", { id: id }));
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

  // Mode clic carte : handler séparé (_itiAvoidClickHandler), coexiste avec celui des étapes.
  const clickMapBtn = document.getElementById("kta-iti-avoid-click-map");
  if (clickMapBtn) {
    clickMapBtn.addEventListener("click", function() {
      const mainModal = document.getElementById("kta-itinerary-modal");
      _activerModeClicAvoid(mainModal);
      clickMapBtn.classList.add("kta-actif");
      clickMapBtn.textContent = window.I18n.t("iti.avoid.clickMapActive");
    });
  }

  const radiusInput = document.getElementById("kta-iti-avoid-radius");
  if (radiusInput) {
    radiusInput.addEventListener("change", function() {
      const v = parseInt(radiusInput.value, 10);
      const prefs2 = _getItiAvoidPrefs();
      prefs2.radius = (Number.isFinite(v) && v >= 0) ? v : ITI_AVOID_DEFAULT_RADIUS;
      _setItiAvoidPrefs(prefs2);
    });
  }

  // Persistée immédiatement : la modale peut être fermée par le calcul lui-même.
  const inaccCb = document.getElementById("kta-iti-respect-inacc");
  if (inaccCb) {
    inaccCb.addEventListener("change", function () {
      const p = _getItiAvoidPrefs();
      p.respecterInaccessibles = !!inaccCb.checked;
      _setItiAvoidPrefs(p);
    });
  }
  const cordeCb = document.getElementById("kta-iti-corde");
  if (cordeCb) {
    cordeCb.addEventListener("change", function () {
      const p = _getItiAvoidPrefs();
      p.corde = !!cordeCb.checked;
      _setItiAvoidPrefs(p);
    });
  }

  const resetBtn = document.getElementById("kta-iti-avoid-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", async function() {
      if (!(await window.ktaConfirm(window.I18n.t("iti.avoid.resetConfirm")))) return;
      // Le reset rend le comportement SÛR, pas le dernier choix : la case revient cochée.
      _setItiAvoidPrefs({ points: [], tags: [], zones: [], radius: ITI_AVOID_DEFAULT_RADIUS,
                          respecterInaccessibles: true });
      const cbI = document.getElementById("kta-iti-respect-inacc");
      if (cbI) cbI.checked = true;
      // Sûr = sans corde : les puits sans échelon repartent hors itinéraire.
      const cbC = document.getElementById("kta-iti-corde");
      if (cbC) cbC.checked = false;
      _rafraichirListeAvoidPoints();
      _rafraichirChipsAvoidTags();
      _rafraichirListeAvoidZones();
      if (radiusInput) radiusInput.value = String(ITI_AVOID_DEFAULT_RADIUS);
    });
  }

  _rafraichirListeAvoidPoints();
  _rafraichirChipsAvoidTags();
  _rafraichirListeAvoidZones();
}

function _itiPartageDispo() {
  const X = window.KtaExtensions;
  return !!(X && typeof X.aPrise === "function" && X.aPrise("itineraire"));
}
function _itiPartageLibelle() {
  return window.I18n.t(window.KtaExtensions.itinerairePublie() ? "iti.partage.btnOn" : "iti.partage.btnOff");
}

window.ouvrirItinerairModal = function() {
  const existing = document.getElementById("kta-itinerary-modal");
  if (existing) existing.remove();

  // Itinéraire actif → MODE NAVIGATION : on restaure ses étapes (pas de calcul).
  const existingItinerary = (window.getRoads ? window.getRoads() : [])
    .find(function(r) { return r.type === "itinerary"; });

  const modeNavigation = !!(existingItinerary && Array.isArray(existingItinerary.waypoints) && existingItinerary.waypoints.length >= 2);

  if (modeNavigation) {
    _itineraryWaypoints = existingItinerary.waypoints.map(function(w) { return Object.assign({}, w); });
    if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
    _itineraryWaypoints.forEach(function(p, i) {
      _ajouterWaypointVisuel(p, i + 1);
    });
  } else {
    _viderItineraire();
  }

  const titre = modeNavigation ? window.I18n.t("iti.modal.titreNav") : window.I18n.t("iti.modal.titreCalc");

  // Points de passage : mêmes contrôles d'édition dans les deux modes ; en navigation, une quick-nav
  // (Début/Fin/Tour) au-dessus de la liste.
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

  const computeBtnLabel = modeNavigation ? window.I18n.t("iti.btn.recompute") : window.I18n.t("iti.btn.compute");
  const currentPresetKey = _getItiSpeedPreset();
  const currentPreset    = ITI_SPEED_PRESETS[currentPresetKey];
  let statusActuel = '';
  if (modeNavigation) {
    const distActMeters = _distanceItineraireMeters(existingItinerary);
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
        // Profil en long : `existingItinerary.points` porte déjà le niveau de chaque point.
        '<button id="kta-iti-profil" class="kta-btn kta-btn-ghost kta-btn-small" type="button"' +
          ' style="width:100%; margin-top:6px;">📉 ' + window.I18n.t("prof.profil.btn") + '</button>' +
        (window.ItiGuidage
          ? '<button id="kta-iti-feuille" class="kta-btn kta-btn-ghost kta-btn-small" type="button"' +
              ' style="width:100%; margin-top:6px;">🪧 ' + window.I18n.t("guid.feuille.btn") + '</button>'
          : '') +
        // Installation reliée seulement (prise neutre `itineraire`) : montrer l'itinéraire à l'équipe.
        (_itiPartageDispo()
          ? '<button id="kta-iti-partage" class="kta-btn kta-btn-ghost kta-btn-small" type="button"' +
              ' style="width:100%; margin-top:6px;">' + _itiPartageLibelle() + '</button>'
          : '') +
      '</div>';
  }
  if (!window._itiPartageBound) {
    window._itiPartageBound = true;
    document.addEventListener("click", function (e) {
      const b = e.target && e.target.closest && e.target.closest("#kta-iti-partage");
      if (!b || !_itiPartageDispo()) return;
      b.disabled = true;
      window.KtaExtensions.basculerItineraire().then(function (publie) {
        b.disabled = false;
        b.textContent = _itiPartageLibelle();
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(window.I18n.t(publie ? "iti.partage.toastOn" : "iti.partage.toastOff"), "info");
        }
      });
    });
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
  // Délégation : ce bloc est réécrit à chaque rafraîchissement, un listener direct partirait avec lui.
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
    '</div>';

  // Pause configurable : défaut case cochée + 15 min.
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
    '</div>';

  const sectionAction =
    '<div class="kta-iti-section">' +
      '<div class="kta-iti-section-titre">' + (modeNavigation ? window.I18n.t("iti.action.titreNav") : window.I18n.t("iti.action.titre")) + '</div>' +
      statusActuel +
      '<button id="kta-iti-compute" class="kta-btn kta-btn-primary" type="button" style="width:100%;">' + computeBtnLabel + '</button>' +
      // Destination sur un AUTRE plan : recherche multi-plans en mode sélection → itinéraire via portail.
      ((window.CrossPlanSearch && window.InterPlanRoute)
        ? '<button id="kta-iti-crossplan" class="kta-btn kta-btn-ghost" type="button" style="width:100%; margin-top:8px;">🌐 ' +
            window.I18n.t("ipr.btn.fromItiModal") + '</button>'
        : '') +
      eraseBtn +
      '<div id="kta-iti-result" class="kta-iti-result" style="display:none;"></div>' +
      '<div id="kta-iti-error" class="kta-iti-error" style="display:none;"></div>' +
    '</div>';

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

  // Clic = preset + boutons + temps du bloc navigation (le libellé bas-gauche suit via _setItiSpeedPreset).
  (function bindSpeedSegmented() {
    const wrap = document.getElementById("kta-iti-speed-segmented");
    if (!wrap) return;
    wrap.querySelectorAll(".kta-iti-speed-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        const key = btn.getAttribute("data-speed");
        if (!_setItiSpeedPreset(key)) return;
        wrap.querySelectorAll(".kta-iti-speed-btn").forEach(function(b) {
          b.classList.toggle("kta-iti-speed-active", b === btn);
        });
        _refreshItiTempsInPlace();
      });
    });
  })();

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
      // change ET input : retour en direct pendant la saisie.
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
      // Navigation : un aperçu recalculé pendant la modale est enregistré à la fermeture (intention
      // « j'ai recalculé, je veux le nouveau »).
      const hasPreview = (window.getRoads ? window.getRoads() : []).some(function(r) { return r._preview; });
      if (hasPreview) {
        const roadsNow = (window.getRoads ? window.getRoads() : []).map(function(r) {
          if (r._preview) { const c = Object.assign({}, r); delete c._preview; return c; }
          return r;
        });
        if (window.setRoads) window.setRoads(roadsNow);
      }
      // Les marqueurs numérotés restent visibles hors modale.
    } else {
      // Calcul : on retire l'aperçu et les marqueurs ; enregistrer passe par le bouton 💾.
      _viderItineraire();
      const roadsNow = (window.getRoads ? window.getRoads() : []).filter(function(r) { return !r._preview; });
      if (window.setRoads) window.setRoads(roadsNow);
    }
    modal.remove();
    _majLabelDistanceItineraire();
  }

  document.getElementById("kta-iti-close").addEventListener("click", fermer);
  modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });

  // Navigation : quick-nav + effacer (présents seulement dans ce mode). Le reste du câblage est commun.
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
      if (!existingItinerary || !existingItinerary.points || existingItinerary.points.length < 2) return;
      const latlngs = existingItinerary.points.map(function(p) { return convertCoord(p.x, p.y); });
      const bounds = L.latLngBounds(latlngs);
      modal.remove();
      window.map.fitBounds(bounds, { padding: [40, 40], animate: false });
    });
    document.getElementById("kta-iti-erase").addEventListener("click", async function() {
      if (!(await window.ktaConfirm(window.I18n.t("iti.erase.confirm")))) return;
      modal.remove();
      _effacerItineraireActif();
    });
  }

  // Point existant (autocomplete SearchPoints.findByQuery) : clic → étape avec coords ET nom.
  const searchInput   = document.getElementById("kta-iti-search-input");
  const searchResults = document.getElementById("kta-iti-search-results");
  let _searchTimer = null;

  function _afficherResultatsRecherche(items) {
    if (!items || items.length === 0) {
      searchResults.innerHTML = '<div class="kta-iti-search-empty">' + window.I18n.t("iti.search.noResults") + '</div>';
      searchResults.style.display = "block";
      return;
    }
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

    searchResults._lastLimite = limite;
  }

  // Délégation posée UNE FOIS au build de la modale.
  if (!searchResults._delegateBound) {
    searchResults._delegateBound = true;
    searchResults.addEventListener("click", function(e) {
      const el = e.target && e.target.closest ? e.target.closest(".kta-iti-search-item") : null;
      if (!el || !searchResults.contains(el)) return;
      // Pas de data-idx ici : index calculé parmi les frères.
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
    // Délai : laisser le clic sur un résultat aboutir avant de cacher.
    setTimeout(function() { searchResults.style.display = "none"; }, 200);
  });

  // Mode clic carte : la modale plein écran bloquerait les clics → mini-panneau flottant.
  const btnMode = document.getElementById("kta-iti-mode-click");
  btnMode.addEventListener("click", function() {
    if (_itineraryClickActive) {
      _desactiverModeClicCarte();
      btnMode.textContent = window.I18n.t("iti.btn.modeClickActivate");
      btnMode.classList.remove("kta-actif");
    } else {
      _activerModeClicCarte();
      modal.style.display = "none";
      _afficherPanneauItineraireFlottant(modal);
    }
  });

  // Position du tracker figée au clic (toujours définie : APP_CONFIG.startX/Y au boot).
  const btnTrackerPos = document.getElementById("kta-iti-tracker-pos");
  if (btnTrackerPos) {
    btnTrackerPos.addEventListener("click", function() {
      if (typeof window.getTrackingPosition !== "function") return;
      const pos = window.getTrackingPosition();
      if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number") {
        window.ktaAlerte(window.I18n.t("iti.err.trackerPos"));
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

  document.getElementById("kta-iti-clear").addEventListener("click", function() {
    _itineraryWaypoints = [];
    if (_itineraryMarkerLayer) _itineraryMarkerLayer.clearLayers();
    _rafraichirListeWaypointsModale();
    document.getElementById("kta-iti-result").style.display = "none";
    document.getElementById("kta-iti-error").style.display  = "none";
  });

  // Destination sur un autre plan : point du plan COURANT → simple étape ; point DISTANT → itinéraire
  // via portail (InterPlanRoute ; la modale se ferme, le résumé par étapes prend le relais).
  const btnCross = document.getElementById("kta-iti-crossplan");
  if (btnCross) {
    btnCross.addEventListener("click", function() {
      window.CrossPlanSearch.ouvrir("", { onSelect: function(plan, pt) {
        const label = pt.nom || pt.id || (pt.x + "," + pt.y);
        if (plan.id === (window._currentLoadedPlanId || null)) {
          window.itineraireAjouterWaypoint(pt.x, pt.y, label);
          return;
        }
        // Les étapes déjà posées (non validées, hors origine tracker) deviennent des passages
        // OBLIGATOIRES du leg A, dans l'ordre, AVANT le portail.
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

  document.getElementById("kta-iti-compute").addEventListener("click", async function() {
    const btn   = this;
    const errEl = document.getElementById("kta-iti-error");
    const resEl = document.getElementById("kta-iti-result");
    errEl.style.display = "none";
    resEl.style.display = "none";

    // Étapes validées EXCLUES du calcul, sinon « Recalculer » repasse par des étapes visitées.
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

    // Bouton désactivé pendant le Dijkstra : un double clic lancerait deux calculs sur le même aperçu.
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = window.I18n.t("iti.btn.computing");
    try {
      // Repli 2 passes interne au Pathfinder : on lit result.usedFallback / avoidedThrough pour avertir.
      const avoidPrefs = _getItiAvoidPrefs();
      const result = await _withItiComputeLoader(function() {
        return window.Pathfinder.computeRoute(wpsCalc, {
          avoidPoints: avoidPrefs.points || [],
          avoidTags:   avoidPrefs.tags   || [],
          avoidZones:  avoidPrefs.zones  || [],
          // La seule contrainte DURE du moteur suit la case de la modale.
          respecterInaccessibles: avoidPrefs.respecterInaccessibles !== false,
          avoidRadius: avoidPrefs.radius || ITI_AVOID_DEFAULT_RADIUS,
          // Équipe équipée : les puits sans échelon entre niveaux deviennent praticables.
          corde: avoidPrefs.corde === true
        });
      });
      // 🩸 La modale a pu être fermée pendant l'await : écrire dans resEl détaché puis chercher
      // kta-iti-save → null → crash. resEl est capté AVANT l'await.
      if (!resEl.isConnected) return;
      const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
      // Raccords à vol d'oiseau compris : même total que le libellé.
      const raccordsPx = window.ItiGuidage ? window.ItiGuidage.longueurRaccordsPx(result) : 0;
      const distM = (result.totalDistance + raccordsPx) / scale;

      let fallbackHtml = "";
      if (result.usedFallback && Array.isArray(result.avoidedThrough) && result.avoidedThrough.length > 0) {
        function _esc(s) { return window.ktaEsc(s); }
        const noms = result.avoidedThrough.map(function(ap) {
          return _esc(ap.label || ap.id || window.I18n.t("iti.avoid.pointFallback"));
        }).join(", ");
        fallbackHtml =
          '<div class="kta-iti-result-row kta-iti-avoid-warning" style="color:var(--kta-avert); background:rgba(255,153,51,0.10); border-left:3px solid var(--kta-avert); padding:8px 10px; margin:6px 0; border-radius:4px;">' +
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

      // ⚠️ Un seul itinéraire actif : on retire TOUTES les roads "itinerary" (aperçu ET enregistrées)
      // avant d'ajouter. Les étapes d'origine sont gardées dans `waypoints` (restaurées en navigation).
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
      // Erreurs du Pathfinder : err.i18nKey (+ i18nParams) localisée ici ; repli err.message.
      errEl.textContent = (err && err.i18nKey && window.I18n)
        ? window.I18n.t(err.i18nKey, err.i18nParams || {})
        : (err.message || String(err));
      errEl.style.display = "block";
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
};
