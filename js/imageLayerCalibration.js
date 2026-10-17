/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// IMAGE-LAYER-CALIBRATION.JS — Calage d'un calque image par 2 ancres
// =========================
// Similitude 2D (rotation + échelle + translation, sans cisaillement), rendue par le plugin
// Leaflet.ImageOverlay.Rotated (lib/) en parallélogramme sur 3 coins (le 4e est déduit).
// Format : { sourceA: { sx, sy } (pixel du calque), targetA: { x, y } (pixel du plan principal), sourceB, targetB }
// Cascade : 1. pref par plan `myktamap_plan_prefs_<planId>.imageLayerCalibrations[layerId]` (surcharge locale) ;
//           2. plan-config.json > imageLayers[i].calibration (durable) ; 3. absent → bornes du plan principal.
// Maths : ds = S2 - S1, dt = T2 - T1 ; θ = angle(dt) - angle(ds), k = |dt| / |ds|, t = T1 - k·R(θ)·S1.
//   Matrice [a c e ; b d f] avec a = d = k·cos θ, b = k·sin θ, c = -b. Coin C : (a·cx + c·cy + e, b·cx + d·cy + f).
//   Coins source (0,0), (W,0), (0,H) → topleft, topright, bottomleft pour le plugin.
// ⚠️ Pixel → latlng en CRS.Simple : convertCoord(x, y) = [imageHeight - y, x] (y vers le BAS en pixels, lat vers
// le HAUT).
// API : window.ImageLayerCalibration = {
//   compute3CornersFromAnchors(calibration, sourceW, sourceH) → {tl, tr, bl} (latlng) ; …Px → en pixels plan
//   drawCalibratedImageLayer(ctx, img, calibration, planW, planH) → bool (exports canvas)
//   getCalibration(layerId) (cascade), setSessionCalibration(layerId, c), resetSessionCalibration(layerId),
//   loadImageDimensions(url) → Promise<{width, height}>
// }

(function() {
  "use strict";

  // ── Maths : compute3CornersFromAnchors ──────────
  // 3 latlng (topleft, topright, bottomleft) pour L.imageOverlay.rotated ; sourceW / sourceH = dimensions naturelles
  // du calque. null si calibration invalide (ancres identiques ou colinéaires).
  function compute3CornersFromAnchors(calibration, sourceW, sourceH) {
    if (!calibration) return null;
    if (!Number.isFinite(sourceW) || !Number.isFinite(sourceH) || sourceW <= 0 || sourceH <= 0) return null;
    const sA = calibration.sourceA, tA = calibration.targetA;
    const sB = calibration.sourceB, tB = calibration.targetB;
    if (!sA || !tA || !sB || !tB) return null;
    const sdx = sB.sx - sA.sx, sdy = sB.sy - sA.sy;
    const tdx = tB.x  - tA.x,  tdy = tB.y  - tA.y;
    const sLen2 = sdx*sdx + sdy*sdy;
    const tLen2 = tdx*tdx + tdy*tdy;
    if (sLen2 < 4 || tLen2 < 4) return null;  // ancres trop proches < 2px

    // M = k·R(θ) (similitude directe : a = d, c = -b) avec M·(sdx, sdy) = (tdx, tdy) :
    //   a = (sdx·tdx + sdy·tdy) / sLen2,  b = (sdx·tdy - sdy·tdx) / sLen2   (sLen2 = sdx² + sdy²)
    const a = (sdx*tdx + sdy*tdy) / sLen2;
    const b = (sdx*tdy - sdy*tdx) / sLen2;
    const c = -b;
    const d = a;
    // Translation pour que sA → tA : tA = M·sA + (e, f)
    const e = tA.x - (a*sA.sx + c*sA.sy);
    const f = tA.y - (b*sA.sx + d*sA.sy);

    // 3 coins source dans le plan principal (pixels).
    function _xform(cx, cy) {
      return { x: a*cx + c*cy + e, y: b*cx + d*cy + f };
    }
    const tlSrc = _xform(0,        0);          // top-left  source
    const trSrc = _xform(sourceW,  0);          // top-right source
    const blSrc = _xform(0,        sourceH);    // bot-left  source

    // Pixels plan → latlng par window.convertCoord (imageHeight n'est pas connu ici) ; repli [-y, x], faux mais
    // visible.
    const conv = (typeof window.convertCoord === "function")
      ? window.convertCoord
      : function(x, y) { return [-y, x]; };
    return {
      tl: conv(tlSrc.x, tlSrc.y),
      tr: conv(trSrc.x, trSrc.y),
      bl: conv(blSrc.x, blSrc.y)
    };
  }

  // ── Maths bis : compute3CornersFromAnchorsPx ──────────
  // Mêmes calculs, coins rendus en PIXELS PLAN (exports canvas) ; null si calibration invalide.
  function compute3CornersFromAnchorsPx(calibration, sourceW, sourceH) {
    if (!calibration) return null;
    if (!Number.isFinite(sourceW) || !Number.isFinite(sourceH) || sourceW <= 0 || sourceH <= 0) return null;
    const sA = calibration.sourceA, tA = calibration.targetA;
    const sB = calibration.sourceB, tB = calibration.targetB;
    if (!sA || !tA || !sB || !tB) return null;
    const sdx = sB.sx - sA.sx, sdy = sB.sy - sA.sy;
    const tdx = tB.x  - tA.x,  tdy = tB.y  - tA.y;
    const sLen2 = sdx*sdx + sdy*sdy;
    const tLen2 = tdx*tdx + tdy*tdy;
    if (sLen2 < 4 || tLen2 < 4) return null;
    const a = (sdx*tdx + sdy*tdy) / sLen2;
    const b = (sdx*tdy - sdy*tdx) / sLen2;
    const c = -b, d = a;
    const e = tA.x - (a*sA.sx + c*sA.sy);
    const f = tA.y - (b*sA.sx + d*sA.sy);
    function _xform(cx, cy) {
      return { x: a*cx + c*cy + e, y: b*cx + d*cy + f };
    }
    return {
      tl: _xform(0,        0),
      tr: _xform(sourceW,  0),
      bl: _xform(0,        sourceH)
    };
  }

  // ── Canvas : drawCalibratedImageLayer ──────────
  // Dessine le calque calé sur un canvas (utils.js > telechargerPlan, exporter.js > _genererCanvasExport, miniature PDF
  // du Mode Secours) au lieu de l'étirer sur W×H. Rend false si calibration invalide ou dimensions indisponibles :
  // l'appelant fait alors son drawImage classique.
  function drawCalibratedImageLayer(ctx, img, calibration, planW, planH) {
    if (!ctx || !img || !calibration) return false;
    const sourceW = img.naturalWidth  || img.width  || 0;
    const sourceH = img.naturalHeight || img.height || 0;
    if (sourceW <= 0 || sourceH <= 0) return false;
    const corners = compute3CornersFromAnchorsPx(calibration, sourceW, sourceH);
    if (!corners) return false;
    // Matrice affine canvas : rectangle source (0,0)-(sourceW,0)-(0,sourceH) → parallélogramme (tl, tr, bl).
    const a = (corners.tr.x - corners.tl.x) / sourceW;
    const b = (corners.tr.y - corners.tl.y) / sourceW;
    const c = (corners.bl.x - corners.tl.x) / sourceH;
    const d = (corners.bl.y - corners.tl.y) / sourceH;
    const e = corners.tl.x;
    const f = corners.tl.y;
    ctx.save();
    try {
      ctx.transform(a, b, c, d, e, f);
      ctx.drawImage(img, 0, 0);
    } catch(err) {
      ctx.restore();
      console.warn("[ImageLayerCalibration] drawCalibratedImageLayer failed:", err);
      return false;
    }
    ctx.restore();
    return true;
  }

  // ── Cascade : getCalibration ──────────
  // 1. pref par plan (surcharge locale) ; 2. plan-config.json ; 3. null (bornes du plan principal).
  function getCalibration(layerId) {
    if (!layerId) return null;
    try {
      const pid = window._currentLoadedPlanId || "default";
      const raw = localStorage.getItem("myktamap_plan_prefs_" + pid);
      if (raw) {
        const prefs = JSON.parse(raw);
        if (prefs && prefs.imageLayerCalibrations && prefs.imageLayerCalibrations[layerId]) {
          return prefs.imageLayerCalibrations[layerId];
        }
      }
    } catch(e) { /* swallow */ }
    if (window.PLAN_CONFIG && Array.isArray(window.PLAN_CONFIG.imageLayers)) {
      const found = window.PLAN_CONFIG.imageLayers.find(function(l) {
        return l && (l.id === layerId || l.label === layerId);
      });
      if (found && found.calibration) return found.calibration;
    }
    return null;
  }

  // ── Setter : setSessionCalibration ──────────
  function setSessionCalibration(layerId, calibration) {
    if (!layerId) return;
    try {
      const pid = window._currentLoadedPlanId || "default";
      const key = "myktamap_plan_prefs_" + pid;
      const raw = localStorage.getItem(key);
      const prefs = raw ? JSON.parse(raw) : {};
      if (!prefs.imageLayerCalibrations) prefs.imageLayerCalibrations = {};
      prefs.imageLayerCalibrations[layerId] = calibration;
      localStorage.setItem(key, JSON.stringify(prefs));
    } catch(e) {
      console.warn("[ImageLayerCalibration] setSessionCalibration failed:", e);
    }
    // Rafraîchissement à chaud.
    try {
      window.dispatchEvent(new CustomEvent("kta:imgLayerCalibChange", {
        detail: { layerId: layerId, calibration: calibration }
      }));
    } catch(e) {}
  }

  function resetSessionCalibration(layerId) {
    if (!layerId) return;
    try {
      const pid = window._currentLoadedPlanId || "default";
      const key = "myktamap_plan_prefs_" + pid;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs && prefs.imageLayerCalibrations && (layerId in prefs.imageLayerCalibrations)) {
        delete prefs.imageLayerCalibrations[layerId];
        localStorage.setItem(key, JSON.stringify(prefs));
      }
    } catch(e) {
      console.warn("[ImageLayerCalibration] resetSessionCalibration failed:", e);
    }
    try {
      window.dispatchEvent(new CustomEvent("kta:imgLayerCalibChange", {
        detail: { layerId: layerId, calibration: null }
      }));
    } catch(e) {}
  }

  // ── loadImageDimensions ──────────
  // Promise<{width, height}> : dimensions naturelles de l'image (pour le picker).
  function loadImageDimensions(url) {
    return new Promise(function(resolve, reject) {
      if (!url) { reject(new Error("URL manquante")); return; }
      const img = new Image();
      img.onload = function() {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = function() {
        reject(new Error("Échec chargement image : " + url));
      };
      img.src = url;
    });
  }

  // ── API publique ──────────
  window.ImageLayerCalibration = {
    compute3CornersFromAnchors:   compute3CornersFromAnchors,
    compute3CornersFromAnchorsPx: compute3CornersFromAnchorsPx,
    drawCalibratedImageLayer:     drawCalibratedImageLayer,
    getCalibration:               getCalibration,
    setSessionCalibration:        setSessionCalibration,
    resetSessionCalibration:      resetSessionCalibration,
    loadImageDimensions:          loadImageDimensions
  };

  console.log("[ImageLayerCalibration] Module chargé (v1.38.0).");
})();
