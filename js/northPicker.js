/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// NORTH-PICKER.JS — Calibration Nord 2 clics (v1.37.0)
// =========================
// Picker WYSIWYG pour calibrer l'offset Nord d'un plan dont le haut n'est PAS
// le Nord vrai (photo aérienne au cadrage arbitraire, plan cataphile sans
// rosace alignée). Workflow :
//   1. Modale Réglages map mode > "🧭 Calibrer (2 clics)"
//   2. La modale Réglages se ferme, on bascule en mode picker (overlay
//      d'instruction + click handler sur la map Leaflet).
//   3. 1er clic = pointer le SUD du plan (= côté vers lequel pointe le bas
//      d'une boussole tenue à plat à cet endroit du plan).
//   4. 2e clic = pointer le NORD du plan.
//   5. Flèche pointillée Sud→Nord tracée sur la map (Leaflet polyline +
//      marqueur "N" à l'extrémité). Bouton Valider / Recommencer / Annuler.
//   6. Au Valider, calcul de l'angle CW entre l'axe "haut du plan" et le
//      vecteur Sud→Nord (= direction du Nord vrai dans le repère plan).
//   7. Promesse résolue avec la valeur en degrés [0, 360[, ou null si annulé.
//
// MATH
//   - Leaflet CRS.Simple : convertCoord(x,y) = [imageHeight - y_plan, x_plan].
//     → en latlng, lat croît vers le HAUT du plan, lng croît vers la DROITE.
//   - Angle CW depuis "haut plan" = atan2(dlng, dlat) (radians, sens trigo
//     inversé pour avoir CW). Converti en degrés et normalisé [0, 360[.
//   - Sanity check : distance Sud→Nord < 20 px latlng → rejet (clics trop
//     proches, angle imprécis). Toast erreur + redemande.
//
// LIMITES
//   - Picker actif uniquement sur la map principale (pas en Mode Itinéraire
//     ou Secours en cours). Vérification _isMapReady() au lancement.
//   - 1 picker à la fois (guard `_active`).
// =========================

(function() {
  "use strict";

  let _active        = false;
  let _resolveFn     = null;
  let _rejectFn      = null;
  let _pickedSouth   = null;   // {lat, lng}
  let _pickedNorth   = null;   // {lat, lng}
  let _arrowLayer    = null;   // L.Polyline
  let _arrowHeadMrk  = null;   // L.Marker (N badge)
  let _instrEl       = null;   // overlay HTML d'instruction
  let _mapClickToken = null;   // référence handler pour off()

  // Distance min entre Sud et Nord (en unités latlng = px plan en CRS.Simple).
  // Sous ce seuil l'angle est trop bruité → on rejette.
  const MIN_DIST_PX = 20;

  function _isMapReady() {
    return window.map && typeof window.map.on === "function";
  }

  function _hexCol(c) { return c; /* placeholder pour facilité de thèmage */ }

  // Calcul de l'angle CW depuis "haut du plan" jusqu'au vecteur Sud→Nord.
  // Retour : nombre [0, 360[ ou null si distance trop faible.
  function _computeAngleDeg() {
    if (!_pickedSouth || !_pickedNorth) return null;
    const dlat = _pickedNorth.lat - _pickedSouth.lat;
    const dlng = _pickedNorth.lng - _pickedSouth.lng;
    const distPx = Math.sqrt(dlat * dlat + dlng * dlng);
    if (distPx < MIN_DIST_PX) return null;
    // atan2(dlng, dlat) → 0° = vers le haut plan (dlat > 0), 90° = vers la
    // droite plan (dlng > 0, sens CW). Convertit puis normalise.
    let deg = Math.atan2(dlng, dlat) * 180 / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  // =========================
  // UI OVERLAY (instructions + boutons)
  // =========================
  function _ensureInstrEl() {
    if (_instrEl) return _instrEl;
    _instrEl = document.createElement("div");
    _instrEl.id = "kta-north-picker-overlay";
    _instrEl.className = "kta-north-picker-overlay";
    _instrEl.innerHTML =
      '<div class="kta-north-picker-card">' +
        '<div class="kta-north-picker-title">' + window.I18n.t("north.titre") + '</div>' +
        '<div class="kta-north-picker-step" id="kta-np-step">' + window.I18n.t("north.step.south") + '</div>' +
        '<div class="kta-north-picker-actions">' +
          '<button type="button" class="kta-btn" id="kta-np-validate" disabled>' + window.I18n.t("north.btn.validate") + '</button>' +
          '<button type="button" class="kta-btn" id="kta-np-restart">' + window.I18n.t("north.btn.restart") + '</button>' +
          '<button type="button" class="kta-btn" id="kta-np-cancel">' + window.I18n.t("north.btn.cancel") + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(_instrEl);

    _instrEl.querySelector("#kta-np-validate").addEventListener("click", _onValidate);
    _instrEl.querySelector("#kta-np-restart").addEventListener("click", _onRestart);
    _instrEl.querySelector("#kta-np-cancel").addEventListener("click", _onCancel);
    return _instrEl;
  }

  function _showInstr() {
    _ensureInstrEl();
    _instrEl.style.display = "block";
  }
  function _hideInstr() {
    if (_instrEl) _instrEl.style.display = "none";
  }
  function _setStep(html, validateOk) {
    if (!_instrEl) return;
    const step = _instrEl.querySelector("#kta-np-step");
    if (step) step.innerHTML = html;
    const v = _instrEl.querySelector("#kta-np-validate");
    if (v) v.disabled = !validateOk;
  }

  // =========================
  // FLÈCHE PREVIEW (Leaflet polyline + marqueur N)
  // =========================
  function _drawArrow() {
    _removeArrow();
    if (!_pickedSouth || !_pickedNorth || !window.map || !window.L) return;
    _arrowLayer = window.L.polyline(
      [[_pickedSouth.lat, _pickedSouth.lng], [_pickedNorth.lat, _pickedNorth.lng]],
      { color: _hexCol("#f4c542"), weight: 4, dashArray: "10,8", opacity: 0.9 }
    ).addTo(window.map);
    // Petit marqueur "N" au bout (extrémité Nord)
    const nIcon = window.L.divIcon({
      className: "kta-north-picker-n-icon",
      html: '<span>N</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    _arrowHeadMrk = window.L.marker(
      [_pickedNorth.lat, _pickedNorth.lng],
      { icon: nIcon, interactive: false, keyboard: false }
    ).addTo(window.map);
  }
  function _removeArrow() {
    if (_arrowLayer)   { try { window.map.removeLayer(_arrowLayer);   } catch(e) {} _arrowLayer = null;   }
    if (_arrowHeadMrk) { try { window.map.removeLayer(_arrowHeadMrk); } catch(e) {} _arrowHeadMrk = null; }
  }

  // =========================
  // CLICK HANDLER MAP
  // =========================
  function _onMapClick(e) {
    if (!_active) return;
    if (!_pickedSouth) {
      _pickedSouth = { lat: e.latlng.lat, lng: e.latlng.lng };
      _setStep(window.I18n.t("north.step.southOk"), false);
      return;
    }
    if (!_pickedNorth) {
      _pickedNorth = { lat: e.latlng.lat, lng: e.latlng.lng };
      const deg = _computeAngleDeg();
      if (deg == null) {
        // Trop proche du Sud — invalider et redemander le 2e clic
        _pickedNorth = null;
        _setStep(window.I18n.t("north.step.tooClose"), false);
        return;
      }
      _drawArrow();
      _setStep(window.I18n.t("north.step.northOk", { deg: deg.toFixed(1) }), true);
    }
  }

  // =========================
  // ACTIONS UI
  // =========================
  // 🐛 v1.37.0 hotfix — Capturer _resolveFn AVANT _cleanup() (qui le nullifie).
  // Sinon la promesse n'est JAMAIS résolue → le .then() du caller ne s'exécute
  // pas → la modale Réglages cachée par le caller reste cachée pour toujours,
  // l'user est bloqué sur le picker. (KARMA "il se rouvre pas après les deux
  // cliques".)
  function _onValidate() {
    const deg = _computeAngleDeg();
    if (deg == null) return;  // sécurité (bouton déjà désactivé sinon)
    const resolve = _resolveFn;
    _cleanup();
    if (resolve) resolve(deg);
  }
  function _onRestart() {
    _pickedSouth = null;
    _pickedNorth = null;
    _removeArrow();
    _setStep(window.I18n.t("north.step.south"), false);
  }
  function _onCancel() {
    const resolve = _resolveFn;
    _cleanup();
    if (resolve) resolve(null);
  }

  function _cleanup() {
    _active = false;
    _removeArrow();
    _hideInstr();
    if (window.map && _mapClickToken) {
      try { window.map.off("click", _onMapClick); } catch(e) {}
    }
    _mapClickToken = null;
    _pickedSouth = null;
    _pickedNorth = null;
    _resolveFn = null;
    _rejectFn  = null;
  }

  // =========================
  // API PUBLIQUE
  // =========================
  // openNorthCalibrationPicker() : Promise<number|null>
  // Résolu avec l'angle [0, 360[ au Valider, ou null si Annulé.
  // Rejet seulement si la map n'est pas prête (cas dégradé : on n'est pas en
  // mode carte).
  function openNorthCalibrationPicker() {
    return new Promise(function(resolve, reject) {
      if (_active) {
        // Un autre picker tourne déjà — refuse
        return reject(new Error(window.I18n.t("north.err.alreadyActive")));
      }
      if (!_isMapReady()) {
        return reject(new Error(window.I18n.t("north.err.mapUnavailable")));
      }
      _resolveFn = resolve;
      _rejectFn  = reject;
      _active = true;
      _pickedSouth = null;
      _pickedNorth = null;
      _showInstr();
      _setStep(window.I18n.t("north.step.south"), false);
      _mapClickToken = true;
      window.map.on("click", _onMapClick);
    });
  }

  window.openNorthCalibrationPicker = openNorthCalibrationPicker;
})();
