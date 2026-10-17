/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// NORTH-PICKER.JS — calibrage du Nord en 2 clics
// =========================
// Pour un plan dont le haut n'est PAS le Nord vrai. Depuis Réglages (« 🧭 Calibrer (2 clics) ») : 1er clic =
// SUD, 2e clic = NORD, flèche pointillée Sud→Nord avec « N », puis Valider / Recommencer / Annuler. Valider
// calcule l'angle horaire entre le haut du plan et Sud→Nord.
// ⚠️ CRS.Simple : convertCoord(x,y) = [imageHeight - y, x] → lat croît vers le HAUT, lng vers la DROITE ;
// angle = atan2(dlng, dlat), normalisé [0, 360[. Sud→Nord < 20 px → rejet (angle imprécis), on redemande.
// Un seul picker à la fois, carte principale seulement (_isMapReady()).
// Expose : openNorthCalibrationPicker() → Promise<number|null> (null = annulé ; rejet si la carte n'est pas prête).
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

  // Distance min Sud–Nord (unités latlng = px plan en CRS.Simple) : en dessous, angle trop bruité.
  const MIN_DIST_PX = 20;

  function _isMapReady() {
    return window.map && typeof window.map.on === "function";
  }

  function _hexCol(c) { return c; /* placeholder pour facilité de thèmage */ }

  // → [0, 360[ ou null si trop proche.
  function _computeAngleDeg() {
    if (!_pickedSouth || !_pickedNorth) return null;
    const dlat = _pickedNorth.lat - _pickedSouth.lat;
    const dlng = _pickedNorth.lng - _pickedSouth.lng;
    const distPx = Math.sqrt(dlat * dlat + dlng * dlng);
    if (distPx < MIN_DIST_PX) return null;
    // 0° = haut du plan (dlat > 0), 90° = droite (dlng > 0), sens horaire.
    let deg = Math.atan2(dlng, dlat) * 180 / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }

  // ── Overlay (instructions + boutons) ──
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

  // ── Flèche d'aperçu (polyline + marqueur N) ──
  function _drawArrow() {
    _removeArrow();
    if (!_pickedSouth || !_pickedNorth || !window.map || !window.L) return;
    _arrowLayer = window.L.polyline(
      [[_pickedSouth.lat, _pickedSouth.lng], [_pickedNorth.lat, _pickedNorth.lng]],
      { color: _hexCol("#f4c542"), weight: 4, dashArray: "10,8", opacity: 0.9 }
    ).addTo(window.map);
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

  // ── Clic carte ──
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
        // Trop proche du Sud : on redemande le 2e clic.
        _pickedNorth = null;
        _setStep(window.I18n.t("north.step.tooClose"), false);
        return;
      }
      _drawArrow();
      _setStep(window.I18n.t("north.step.northOk", { deg: deg.toFixed(1) }), true);
    }
  }

  // ── Actions ──
  // 🩸 Capturer _resolveFn AVANT _cleanup() (qui le remet à null) : sinon la promesse n'est jamais résolue et
  // la modale Réglages cachée par l'appelant reste cachée, utilisateur bloqué.
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

  // ── API publique ──
  function openNorthCalibrationPicker() {
    return new Promise(function(resolve, reject) {
      if (_active) {
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
