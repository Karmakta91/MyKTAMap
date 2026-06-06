/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// IMAGE-LAYER-CALIBRATION.JS — Calage 2 ancres (v1.38.0)
// =========================
// Calibration des image layers via 2 points de référence (rotation + scale
// + translation = affine 2D sans cisaillement). Utilise le plugin
// Leaflet.ImageOverlay.Rotated (vendored dans lib/) qui rend l'image en
// parallélogramme via 3 coins (le 4e est déduit).
//
// FORMAT DE CALIBRATION
//   {
//     sourceA: { sx, sy },   // pixel dans l'image LAYER (source)
//     targetA: { x, y },     // pixel dans le plan PRINCIPAL (target)
//     sourceB: { sx, sy },
//     targetB: { x, y }
//   }
//
// CASCADE
//   1. Pref per-plan LS `myktamap_plan_prefs_<planId>.imageLayerCalibrations`
//      (objet { layerId: calibration }) — override session per-navigateur
//   2. plan-config.json > imageLayers[i].calibration — durable cross-utilisateurs
//   3. null/absent → fallback bounds plan principal (= comportement v1.37.x)
//
// MATH (compute3CornersFromAnchors)
//   Soit S1=(sx1,sy1), S2=(sx2,sy2) dans le repère source (pixels image layer)
//   Soit T1=(tx1,ty1), T2=(tx2,ty2) dans le repère target (pixels plan principal)
//
//   Vecteur source ds = S2 - S1 = (sdx, sdy)
//   Vecteur target dt = T2 - T1 = (tdx, tdy)
//
//   Pour passer d'un repère à l'autre :
//     - rotation θ = angle(dt) - angle(ds)
//     - scale k = |dt| / |ds|
//     - translation t = T1 - (R(θ) · k · S1)
//
//   Matrice de transform 2D : [a c e]   où a = k·cos(θ), c = -k·sin(θ),
//                             [b d f]         b = k·sin(θ), d =  k·cos(θ)
//                                             e, f = composantes translation
//
//   Pour chaque coin C(cx,cy) de l'image source dans target :
//     Cx' = a·cx + c·cy + e
//     Cy' = b·cx + d·cy + f
//
//   Coins de l'image source : (0,0), (W,0), (0,H), (W,H)
//   On retourne les 3 latlng nécessaires au plugin : topleft, topright, bottomleft.
//
//   ⚠️ Pixel→latlng en CRS.Simple : convertCoord(x, y) = [imageHeight - y, x]
//      (y croît vers le BAS en pixels source, mais lat croît vers le HAUT)
//
// API publique
//   window.ImageLayerCalibration = {
//     compute3CornersFromAnchors(calibration, sourceW, sourceH) → {tl, tr, bl}
//     getCalibration(layerId)           → calibration | null  (cascade)
//     setSessionCalibration(layerId, c) → persiste en LS per-plan
//     resetSessionCalibration(layerId)  → retire l'override session
//     loadImageDimensions(url)          → Promise<{width, height}>
//   }
// =========================

(function() {
  "use strict";

  // =========================
  // MATH — compute3CornersFromAnchors
  // =========================
  // Retourne 3 latlng (topleft, topright, bottomleft) pour L.imageOverlay.rotated.
  // sourceW, sourceH = dimensions naturelles de l'image layer (en pixels source).
  // Retourne null si la calibration est invalide (ancres identiques ou colinéaires).
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

    // Matrice 2x2 R·k déduite des 2 vecteurs :
    //   On veut M·(sdx, sdy) = (tdx, tdy)  AVEC M = k·R(θ) (similitude pure).
    //   M = [a c]   tel que a·sdx + c·sdy = tdx
    //       [b d]         b·sdx + d·sdy = tdy
    //   Et conservation des angles : a=d, c=-b (similitude directe).
    //   => sdx·a - sdy·b = tdx     (eq.1)
    //      sdy·a + sdx·b = tdy     (eq.2)
    //   det = sdx² + sdy² = sLen2
    //   a = (sdx·tdx + sdy·tdy) / sLen2
    //   b = (sdx·tdy - sdy·tdx) / sLen2
    const a = (sdx*tdx + sdy*tdy) / sLen2;
    const b = (sdx*tdy - sdy*tdx) / sLen2;
    const c = -b;
    const d = a;
    // Translation pour que sA → tA : tA = M·sA + (e, f)
    const e = tA.x - (a*sA.sx + c*sA.sy);
    const f = tA.y - (b*sA.sx + d*sA.sy);

    // 3 coins source dans target (pixels plan principal)
    function _xform(cx, cy) {
      return { x: a*cx + c*cy + e, y: b*cx + d*cy + f };
    }
    const tlSrc = _xform(0,        0);          // top-left  source
    const trSrc = _xform(sourceW,  0);          // top-right source
    const blSrc = _xform(0,        sourceH);    // bot-left  source

    // Conversion pixels plan → latlng Leaflet CRS.Simple :
    //   convertCoord(x, y) retourne [imageHeight - y, x] côté window.convertCoord
    //   ATTENTION : on n'a pas accès à imageHeight ici sans APP_CONFIG. On va
    //   donc utiliser window.convertCoord si dispo (= fonction standard du
    //   projet). Sinon fallback : [-y, x] (pas idéal, mais bug visible).
    const conv = (typeof window.convertCoord === "function")
      ? window.convertCoord
      : function(x, y) { return [-y, x]; };
    return {
      tl: conv(tlSrc.x, tlSrc.y),
      tr: conv(trSrc.x, trSrc.y),
      bl: conv(blSrc.x, blSrc.y)
    };
  }

  // =========================
  // MATH BIS — compute3CornersFromAnchorsPx (v1.38.3)
  // =========================
  // Variante de compute3CornersFromAnchors qui retourne les 3 coins en
  // PIXELS PLAN target (au lieu de latlng Leaflet). Pratique pour les
  // exports canvas qui travaillent directement en pixels (pas en latlng).
  // Math strictement identique — on saute juste la conversion finale via
  // window.convertCoord. Retourne null si calibration invalide.
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

  // =========================
  // CANVAS — drawCalibratedImageLayer (v1.38.3)
  // =========================
  // Dessine une image source sur un canvas en respectant la calibration
  // 2 ancres. Utilisé par les exports image (utils.js > telechargerPlan,
  // exporter.js > _genererCanvasExport, Mode Secours PDF miniature) pour
  // que les image layers calibrés apparaissent correctement positionnés/
  // scalés/rotés dans les exports (et pas étirés sur W×H comme avant).
  //
  // Retourne true si rendu calibré effectué, false si fallback nécessaire
  // (calibration invalide / dims source indispo) — le caller doit alors
  // faire le drawImage classique en fallback.
  function drawCalibratedImageLayer(ctx, img, calibration, planW, planH) {
    if (!ctx || !img || !calibration) return false;
    const sourceW = img.naturalWidth  || img.width  || 0;
    const sourceH = img.naturalHeight || img.height || 0;
    if (sourceW <= 0 || sourceH <= 0) return false;
    const corners = compute3CornersFromAnchorsPx(calibration, sourceW, sourceH);
    if (!corners) return false;
    // Calcule la matrice affine canvas qui mappe le rectangle source
    // (0,0)-(sourceW,0)-(0,sourceH) vers le parallélogramme target
    // (tl, tr, bl). Le 4e coin est déduit géométriquement.
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

  // =========================
  // CASCADE — getCalibration
  // =========================
  // Lecture cascade pour un image layer donné :
  //   1. LS prefs-plan > imageLayerCalibrations[layerId]  (override session)
  //   2. plan-config.json > imageLayers[i].calibration    (durable embed)
  //   3. null (= comportement v1.37.x, bounds plan principal)
  function getCalibration(layerId) {
    if (!layerId) return null;
    // 1. Pref per-plan
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
    // 2. plan-config.json (via PLAN_CONFIG)
    if (window.PLAN_CONFIG && Array.isArray(window.PLAN_CONFIG.imageLayers)) {
      const found = window.PLAN_CONFIG.imageLayers.find(function(l) {
        return l && (l.id === layerId || l.label === layerId);
      });
      if (found && found.calibration) return found.calibration;
    }
    return null;
  }

  // =========================
  // SETTER — setSessionCalibration
  // =========================
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
    // Notif visuelle à chaud
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

  // =========================
  // HELPER — loadImageDimensions
  // =========================
  // Promise<{width, height}> — charge l'image pour récupérer ses dims naturelles.
  // Utile pour le picker (pas accessible sans avoir chargé l'image au moins une fois).
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

  // =========================
  // API publique
  // =========================
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
