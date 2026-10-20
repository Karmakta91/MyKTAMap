/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// IMAGE-LAYER-CALIBRATION-PICKER.JS — Modale de calage 2 ancres
// =========================
// Écran partagé, 2 mini-cartes Leaflet : à GAUCHE le calque source (CRS.Simple sur ses dimensions naturelles), à
// DROITE le plan principal (CRS.Simple sur planWidth / planHeight).
// Étapes : A sur la source (marqueur rouge) → A' sur le plan → B sur la source (bleu) → B' sur le plan → aperçu
// calé sur la mini-carte droite + Valider / ↺ / ❌.
// API : window.ImageLayerCalibrationPicker.open({
//   sourceUrl: "...",           // image du calque
//   planUrl:   "...",           // plan principal (mini-carte droite)
//   planWidth: 4000, planHeight: 4000,
//   existing:  {calibration}    // optionnel, préremplit les ancres
// }) → Promise<{ sourceA, targetA, sourceB, targetB } | null> (null = annulé)
// Dépend de : L, L.imageOverlay.rotated (lib/leaflet-imageoverlay-rotated.js), window.ImageLayerCalibration,
// window.convertCoord.

(function() {
  "use strict";

  let _active     = false;
  let _resolveFn  = null;
  let _rejectFn   = null;
  let _state      = null;  // { step, sourceA, targetA, sourceB, targetB, sourceW, sourceH }
  let _miniLeft   = null;  // L.map (image source)
  let _miniRight  = null;  // L.map (plan principal)
  let _markersLeft  = [];
  let _markersRight = [];
  let _previewOverlay = null;
  let _overlayEl  = null;

  // ── Construction de l'UI ──────────
  function _buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "kta-imglayer-calib-overlay";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-imglayer-calib-boite" style="max-width:1100px; width:95vw; height:auto; max-height:92vh; display:flex; flex-direction:column;">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + window.I18n.t("imgcal.titre") + '</span>' +
          '<button class="kta-panneau-close" type="button" id="kta-ilc-close" aria-label="' + window.I18n.t("imgcal.close") + '">&times;</button>' +
        '</div>' +
        '<div class="kta-imglayer-calib-step" id="kta-ilc-step" style="padding:10px 16px; background:rgba(140,180,255,0.08); border-bottom:1px solid rgba(140,180,255,0.2); color:var(--kta-texte-2); font-size:13px;">' +
          window.I18n.t("imgcal.init") +
        '</div>' +
        '<div class="kta-imglayer-calib-split" style="display:flex; gap:0; flex:1; min-height:400px; max-height:60vh;">' +
          '<div class="kta-imglayer-calib-pane kta-imglayer-calib-left" style="flex:1; display:flex; flex-direction:column; border-right:1px solid rgba(255,255,255,0.1);">' +
            '<div class="kta-imglayer-calib-pane-titre" style="padding:8px 12px; background:rgba(255,255,255,0.05); font-size:12px; color:var(--kta-texte-3); text-align:center;">' + window.I18n.t("imgcal.pane.source") + '</div>' +
            '<div id="kta-ilc-mini-left" style="flex:1; background:var(--kta-fond);"></div>' +
          '</div>' +
          '<div class="kta-imglayer-calib-pane kta-imglayer-calib-right" style="flex:1; display:flex; flex-direction:column;">' +
            '<div class="kta-imglayer-calib-pane-titre" style="padding:8px 12px; background:rgba(255,255,255,0.05); font-size:12px; color:var(--kta-texte-3); text-align:center;">' + window.I18n.t("imgcal.pane.target") + '</div>' +
            '<div id="kta-ilc-mini-right" style="flex:1; background:var(--kta-fond);"></div>' +
          '</div>' +
        '</div>' +
        '<div class="kta-readme-modal-footer" style="display:flex; gap:10px; justify-content:flex-end; padding:12px 16px;">' +
          '<button class="kta-btn kta-btn-ghost" type="button" id="kta-ilc-restart">' + window.I18n.t("imgcal.btn.restart") + '</button>' +
          '<button class="kta-btn kta-btn-ghost" type="button" id="kta-ilc-cancel">' + window.I18n.t("imgcal.btn.cancel") + '</button>' +
          '<button class="kta-btn kta-btn-primary" type="button" id="kta-ilc-validate" disabled>' + window.I18n.t("imgcal.btn.validate") + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    overlay.querySelector("#kta-ilc-close").addEventListener("click", _onCancel);
    overlay.querySelector("#kta-ilc-cancel").addEventListener("click", _onCancel);
    overlay.querySelector("#kta-ilc-restart").addEventListener("click", _onRestart);
    overlay.querySelector("#kta-ilc-validate").addEventListener("click", _onValidate);
    return overlay;
  }

  function _setStepText(html, validateOk) {
    if (!_overlayEl) return;
    const stepEl = _overlayEl.querySelector("#kta-ilc-step");
    if (stepEl) stepEl.innerHTML = html;
    const valBtn = _overlayEl.querySelector("#kta-ilc-validate");
    if (valBtn) valBtn.disabled = !validateOk;
  }

  // ── Mini-cartes ──────────
  function _initMiniMap(divId, imageUrl, imageW, imageH, onClick) {
    const bounds = [[0, 0], [imageH, imageW]];
    const minZoom = -4, maxZoom = 2;
    const map = L.map(divId, {
      crs: L.CRS.Simple,
      minZoom: minZoom,
      maxZoom: maxZoom,
      zoomControl: true,
      attributionControl: false
    });
    L.imageOverlay(imageUrl, bounds).addTo(map);
    map.fitBounds(bounds);
    // Clic → pixels (x, y) : lat = imageH - y → y = imageH - lat ; lng = x.
    map.on("click", function(e) {
      const x = e.latlng.lng;
      const y = imageH - e.latlng.lat;
      onClick(x, y, e.latlng);
    });
    return map;
  }

  function _addMarker(map, x, y, imageH, label, color) {
    const lat = imageH - y;
    const lng = x;
    const icon = L.divIcon({
      className: "kta-ilc-marker",
      html: '<span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; background:' + color + '; color:#fff; font-weight:800; border-radius:50%; box-shadow:0 0 0 3px rgba(255,255,255,0.4), 0 2px 6px rgba(0,0,0,0.5); font-size:14px;">' + label + '</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    return L.marker([lat, lng], { icon: icon, interactive: false }).addTo(map);
  }

  function _clearMarkersAndPreview() {
    _markersLeft.forEach(function(m)  { try { _miniLeft.removeLayer(m);  } catch(e) {} });
    _markersRight.forEach(function(m) { try { _miniRight.removeLayer(m); } catch(e) {} });
    _markersLeft = [];
    _markersRight = [];
    if (_previewOverlay) {
      try { _miniRight.removeLayer(_previewOverlay); } catch(e) {}
      _previewOverlay = null;
    }
  }

  // ── Déroulé ──────────
  function _refreshStep() {
    const s = _state;
    if (s.step === 1) {
      _setStepText(window.I18n.t("imgcal.step1"), false);
    } else if (s.step === 2) {
      _setStepText(window.I18n.t("imgcal.step2"), false);
    } else if (s.step === 3) {
      _setStepText(window.I18n.t("imgcal.step3"), false);
    } else if (s.step === 4) {
      _setStepText(window.I18n.t("imgcal.step4"), false);
    } else if (s.step === 5) {
      _renderPreview();
      _setStepText(window.I18n.t("imgcal.preview"), true);
    }
  }

  function _onLeftClick(x, y) {
    const s = _state;
    if (s.step === 1) {
      s.sourceA = { sx: x, sy: y };
      _markersLeft.push(_addMarker(_miniLeft, x, y, s.sourceH, "A", "#ff5555"));
      s.step = 2;
      _refreshStep();
    } else if (s.step === 3) {
      s.sourceB = { sx: x, sy: y };
      _markersLeft.push(_addMarker(_miniLeft, x, y, s.sourceH, "B", "#5599ff"));
      s.step = 4;
      _refreshStep();
    }
  }

  function _onRightClick(x, y) {
    const s = _state;
    if (s.step === 2) {
      s.targetA = { x: x, y: y };
      _markersRight.push(_addMarker(_miniRight, x, y, s.planH, "A", "#ff5555"));
      s.step = 3;
      _refreshStep();
    } else if (s.step === 4) {
      s.targetB = { x: x, y: y };
      _markersRight.push(_addMarker(_miniRight, x, y, s.planH, "B", "#5599ff"));
      s.step = 5;
      _refreshStep();
    }
  }

  function _renderPreview() {
    const s = _state;
    if (!window.ImageLayerCalibration || !L.imageOverlay.rotated) {
      _setStepText(window.I18n.t("imgcal.warn.noPlugin"), true);
      return;
    }
    const calib = {
      sourceA: s.sourceA, targetA: s.targetA,
      sourceB: s.sourceB, targetB: s.targetB
    };
    const corners = window.ImageLayerCalibration.compute3CornersFromAnchors(calib, s.sourceW, s.sourceH);
    if (!corners) {
      _setStepText(window.I18n.t("imgcal.warn.collinear"), false);
      return;
    }
    // Latlng dans le repère de la mini-carte droite.
    function _toMiniRightLatLng(latlngFromConvertCoord) {
      // window.convertCoord(x, y) = [imageHeight - y, x], avec l'imageHeight GLOBAL : dans le générateur, planH peut
      // différer (point de vigilance pour l'aperçu).
      return latlngFromConvertCoord;
    }
    if (_previewOverlay) {
      try { _miniRight.removeLayer(_previewOverlay); } catch(e) {}
      _previewOverlay = null;
    }
    _previewOverlay = L.imageOverlay.rotated(
      s.sourceUrl,
      _toMiniRightLatLng(corners.tl),
      _toMiniRightLatLng(corners.tr),
      _toMiniRightLatLng(corners.bl),
      { opacity: 0.55, interactive: false }
    ).addTo(_miniRight);
  }

  // ── Actions ──────────
  function _onValidate() {
    if (_state.step < 5) return;
    const calib = {
      sourceA: _state.sourceA, targetA: _state.targetA,
      sourceB: _state.sourceB, targetB: _state.targetB
    };
    const resolve = _resolveFn;
    _cleanup();
    if (resolve) resolve(calib);
  }
  function _onRestart() {
    _state.step = 1;
    _state.sourceA = null; _state.targetA = null;
    _state.sourceB = null; _state.targetB = null;
    _clearMarkersAndPreview();
    _refreshStep();
  }
  function _onCancel() {
    const resolve = _resolveFn;
    _cleanup();
    if (resolve) resolve(null);
  }

  function _cleanup() {
    _active = false;
    _clearMarkersAndPreview();
    if (_miniLeft)  { try { _miniLeft.remove();  } catch(e) {} _miniLeft  = null; }
    if (_miniRight) { try { _miniRight.remove(); } catch(e) {} _miniRight = null; }
    if (_overlayEl && _overlayEl.parentNode) {
      try { _overlayEl.parentNode.removeChild(_overlayEl); } catch(e) {}
    }
    _overlayEl = null;
    _state = null;
    _resolveFn = null;
    _rejectFn  = null;
  }

  // ── API publique ──────────
  function open(opts) {
    return new Promise(function(resolve, reject) {
      if (_active) return reject(new Error(window.I18n.t("imgcal.err.alreadyActive")));
      if (!opts || !opts.sourceUrl || !opts.planUrl || !opts.planWidth || !opts.planHeight) {
        return reject(new Error("opts requis : sourceUrl, planUrl, planWidth, planHeight"));
      }
      if (typeof L === "undefined" || !L.imageOverlay || !L.imageOverlay.rotated) {
        return reject(new Error("Leaflet ou plugin Rotated indisponible"));
      }
      if (!window.ImageLayerCalibration) {
        return reject(new Error("Module ImageLayerCalibration indisponible"));
      }
      _active = true;
      _resolveFn = resolve;
      _rejectFn  = reject;

      // Dimensions de la source d'abord, puis la modale.
      window.ImageLayerCalibration.loadImageDimensions(opts.sourceUrl)
        .then(function(dims) {
          _state = {
            step: 1,
            sourceUrl: opts.sourceUrl,
            sourceW: dims.width, sourceH: dims.height,
            planW: opts.planWidth, planH: opts.planHeight,
            sourceA: null, targetA: null,
            sourceB: null, targetB: null
          };
          _overlayEl = _buildOverlay();
          // Mini-cartes initialisées dans un timeout (DOM prêt).
          setTimeout(function() {
            _miniLeft  = _initMiniMap("kta-ilc-mini-left",  opts.sourceUrl, dims.width,  dims.height,  _onLeftClick);
            _miniRight = _initMiniMap("kta-ilc-mini-right", opts.planUrl,  opts.planWidth, opts.planHeight, _onRightClick);
          // Préremplissage si une calibration existe.
            if (opts.existing && opts.existing.sourceA && opts.existing.targetA
                && opts.existing.sourceB && opts.existing.targetB) {
              _state.sourceA = opts.existing.sourceA;
              _state.targetA = opts.existing.targetA;
              _state.sourceB = opts.existing.sourceB;
              _state.targetB = opts.existing.targetB;
              _markersLeft.push(_addMarker(_miniLeft,  _state.sourceA.sx, _state.sourceA.sy, dims.height, "A", "#ff5555"));
              _markersRight.push(_addMarker(_miniRight, _state.targetA.x,  _state.targetA.y,  opts.planHeight, "A", "#ff5555"));
              _markersLeft.push(_addMarker(_miniLeft,  _state.sourceB.sx, _state.sourceB.sy, dims.height, "B", "#5599ff"));
              _markersRight.push(_addMarker(_miniRight, _state.targetB.x,  _state.targetB.y,  opts.planHeight, "B", "#5599ff"));
              _state.step = 5;
            }
            _refreshStep();
          }, 50);
        })
        .catch(function(e) {
          _cleanup();
          reject(e);
        });
    });
  }

  window.ImageLayerCalibrationPicker = { open: open };
  console.log("[ImageLayerCalibrationPicker] Module chargé (v1.38.0).");
})();
