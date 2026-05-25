/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// 🚫 MODULE DÉSACTIVÉ depuis v1.12.0
// =========================
// Décision KARMA (V2 release) : "on désactive ce module, on garde de côté
// le code". L'utilité n'était pas claire dans le contexte cataphile actuel
// — le tracker est session-only RAM, donc pas de cumul long terme qui
// rendrait la heatmap vraiment utile. Les points POI restent visualisables
// directement via les icônes natives, plus précis qu'un gradient diffus.
//
// Le code reste valide et testé, prêt à être réactivé si le besoin
// émerge (par exemple : tracker multi-session persisté, ou plan très
// dense en points où une heatmap aiderait à voir la distribution).
//
// Pour RÉACTIVER :
//   1. Décommenter <script src="js/heatmap.js"> dans index.html
//   2. Restaurer "./js/heatmap.js" dans sw.js > ASSETS_TO_CACHE
//   3. Restaurer le bouton 🔥 dans interface.js groupe Tracker (bloc /* ... */)
//   4. Restaurer le reset dans main.js > _libererRessourcesPlanPrecedent
//
// =========================
// 🔥 HEATMAP — V2.4 (v1.11.4) [INACTIF]
// =========================
// Overlay canvas rouge/jaune/vert/bleu qui visualise la densité de points
// (tracker timeline, editor points, data layers points) sur le plan.
//
// Algorithme :
//   1. Canvas Leaflet ImageOverlay aux dimensions du plan
//   2. Pour chaque point source, dessine un gradient radial gaussien
//      en mode additive blending → cumul d'intensité par pixel
//   3. Colormap : valeurs faibles transparent → bleu → vert → jaune → rouge
//
// API publique :
//   window.MyKTAMapHeatmap = {
//     ouvrirModale()       - ouvre la modale config sources + radius + intensité
//     afficher(opts)       - dessine l'overlay (clean + redraw)
//     effacer()            - retire l'overlay et purge le canvas
//     isVisible()          - bool
//   };
// =========================

(function() {
  "use strict";

  let _modal       = null;
  let _overlay     = null;  // L.imageOverlay
  let _canvas      = null;  // canvas standalone
  let _lastOpts    = null;  // pour le redraw au zoom

  // Defaults
  const DEFAULT_RADIUS_PX = 40;     // rayon du gradient radial
  const DEFAULT_INTENSITY = 1.0;    // multiplicateur global

  // ============================================================
  // STYLES INJECTÉS
  // ============================================================
  function _injecterStyles() {
    if (document.getElementById("kta-heatmap-styles")) return;
    const s = document.createElement("style");
    s.id = "kta-heatmap-styles";
    s.textContent = `
      .kta-heatmap-modal-boite {
        max-width: 520px !important;
        height: auto !important;
        max-height: 88vh !important;
      }
      .kta-heatmap-section {
        margin-bottom: 14px;
        background: rgba(255, 100, 50, 0.04);
        border: 1px solid rgba(255, 100, 50, 0.18);
        border-radius: 6px;
        padding: 12px 14px;
      }
      .kta-heatmap-section-titre {
        font-size: 12px;
        color: #ff8a5c;
        font-weight: 700;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .kta-heatmap-cb-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 0;
        font-size: 13px;
        color: #e8eaf0;
        cursor: pointer;
      }
      .kta-heatmap-cb-row input[type="checkbox"] {
        width: 16px; height: 16px;
        cursor: pointer;
        accent-color: #ff8a5c;
      }
      .kta-heatmap-cb-count {
        margin-left: auto;
        color: #8892a4;
        font-size: 12px;
      }
      .kta-heatmap-slider-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 5px 0;
      }
      .kta-heatmap-slider-label {
        font-size: 12px;
        color: #c8d0e0;
        min-width: 80px;
      }
      .kta-heatmap-slider {
        flex: 1;
        accent-color: #ff8a5c;
      }
      .kta-heatmap-slider-val {
        min-width: 50px;
        text-align: right;
        font-family: ui-monospace, monospace;
        font-size: 12px;
        color: #ff8a5c;
        font-weight: 600;
      }
      .kta-heatmap-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 14px;
      }
    `;
    document.head.appendChild(s);
  }

  // ============================================================
  // COLORMAP — Heat (rouge → jaune → vert → bleu → transparent)
  // ============================================================
  // Valeur normalisée 0-1 → couleur RGBA
  function _colorAt(value) {
    if (value <= 0) return [0, 0, 0, 0];
    const v = Math.min(1, value);
    // Gradient inversé : bleu → vert → jaune → rouge (chaleur croissante)
    // Stops à 0.2 / 0.5 / 0.8 / 1.0
    let r, g, b, a;
    if (v < 0.2) {
      // Transparent → bleu vif
      const t = v / 0.2;
      r = 30 * t; g = 80 * t; b = 200 * t; a = 0.5 * t;
    } else if (v < 0.5) {
      // Bleu → vert
      const t = (v - 0.2) / 0.3;
      r = 30 + (50 - 30) * t;
      g = 80 + (220 - 80) * t;
      b = 200 - (200 - 80) * t;
      a = 0.5 + 0.2 * t;
    } else if (v < 0.8) {
      // Vert → jaune
      const t = (v - 0.5) / 0.3;
      r = 50 + (250 - 50) * t;
      g = 220;
      b = 80 - 80 * t;
      a = 0.7 + 0.15 * t;
    } else {
      // Jaune → rouge
      const t = (v - 0.8) / 0.2;
      r = 250;
      g = 220 - (220 - 50) * t;
      b = 0;
      a = 0.85 + 0.1 * t;
    }
    return [Math.round(r), Math.round(g), Math.round(b), Math.min(1, a)];
  }

  // ============================================================
  // RENDU CANVAS
  // ============================================================
  // 🆕 v1.21.2 (KARMA "je trouve les zone afficher par heatmap tres aléatoire") :
  // refonte du rendu pour donner du sens à la heatmap.
  //
  // Avant : on dessinait UN blob gaussien par point ET la normalisation
  // s'arrêtait au plafond `alpha = intensity * 0.4` (= 0.4 par blob, max 1.0).
  // Si l'user avait peu de points dispersés → toute la heatmap stagnait dans
  // le bleu/vert pâle, jamais de rouge → "joli mais random".
  //
  // Après :
  // 1. Le collecteur passe désormais des SEGMENTS (paire de points + flag
  //    closed pour les polygones zones) — les points isolés deviennent
  //    `[{x,y,x,y}]` (segment dégénéré). On itère ces segments avec
  //    interpolation : pour tracé/tracker/zone, plein de petites
  //    contributions le long de la ligne → vraie traînée visible.
  // 2. Après le pass additive, on cherche le MAX d'intensité atteint et
  //    on RE-NORMALISE pour que le pixel le plus dense = rouge (1.0),
  //    le moins dense visible = bleu (≈0.05). Plus de "joli stagne en vert".
  function _renderCanvas(segments, opts) {
    const pc = window.PLAN_CONFIG;
    if (!pc || !pc.plan) return null;
    const imgW = pc.plan.imageWidth  || 1000;
    const imgH = pc.plan.imageHeight || 1000;

    // Downscale pour perf : on travaille sur un canvas qui ne dépasse pas
    // 2048×2048 max, puis Leaflet l'étire à la taille du plan via bounds.
    const MAX_DIM = 2048;
    const scale = Math.min(1, MAX_DIM / Math.max(imgW, imgH));
    const W = Math.round(imgW * scale);
    const H = Math.round(imgH * scale);

    const canvas = document.createElement("canvas");
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const radius    = (opts.radius || DEFAULT_RADIUS_PX) * scale;
    const intensity = opts.intensity || DEFAULT_INTENSITY;
    // Pas d'échantillonnage le long d'un segment : assez fin pour que les
    // blobs se chevauchent (1 sample tous les radius/3 px) → traînée lisse.
    // Cap inférieur à 2px pour ne pas exploser le nombre de blobs sur des
    // segments très longs avec petit rayon.
    const sampleStep = Math.max(2, radius * 0.33);

    ctx.globalCompositeOperation = "lighter";

    // Helper : dessine 1 blob gaussien à (px, py) [coords canvas]
    const alphaCenter = Math.min(1, intensity * 0.18);  // un peu plus doux qu'avant pour profiter de la re-normalisation
    function _drawBlob(px, py) {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0,   "rgba(255, 255, 255, " + alphaCenter + ")");
      grad.addColorStop(0.5, "rgba(255, 255, 255, " + (alphaCenter * 0.5) + ")");
      grad.addColorStop(1,   "rgba(255, 255, 255, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }

    // Helper : convertit un point plan {x, y} en coords canvas [px, py].
    // 🐛 v1.21.2-fix (KARMA "il me met des zone ou il n'y a rien") : retire
    // le flip Y bogué. Le canvas est overlay sur Leaflet avec bounds
    // [[0,0], [imgH, imgW]], donc canvas pixel (0,0) est rendu à Leaflet
    // (lat=imgH, lng=0) = haut du plan. Pour qu'un blob au canvas cy=py*scale
    // tombe à Leaflet lat=imgH-py (= position du plan point (x,y) via
    // convertCoord = [imgH-y, x]), il faut NE PAS appliquer le flip ici.
    // L'ancien `(imgH - p.y) * scale` rendait la heatmap miroir verticalement,
    // bug masqué tant que les blobs étaient isolés mais flagrant après le
    // passage aux traînées continues (segments interpolés v1.21.2).
    function _toCanvas(p) {
      return [p.x * scale, p.y * scale];
    }

    // 1. Pass additive — pour chaque segment [a, b] on dessine plusieurs
    //    blobs régulièrement espacés entre a et b. Si a === b (point isolé),
    //    on dessine 1 seul blob.
    (segments || []).forEach(function(seg) {
      if (!seg || !seg.a) return;
      const [ax, ay] = _toCanvas(seg.a);
      // Cas point isolé : a === b ou pas de b
      if (!seg.b || (seg.a.x === seg.b.x && seg.a.y === seg.b.y)) {
        _drawBlob(ax, ay);
        return;
      }
      const [bx, by] = _toCanvas(seg.b);
      const dx = bx - ax, dy = by - ay;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist <= sampleStep) {
        _drawBlob(ax, ay);
        _drawBlob(bx, by);
        return;
      }
      const n = Math.max(2, Math.ceil(dist / sampleStep));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        _drawBlob(ax + dx * t, ay + dy * t);
      }
    });

    // 2. Trouve le max d'intensité atteint dans le canvas. C'est notre
    //    pivot pour la re-normalisation — sans ça, sur des données
    //    sparse on resterait dans le bleu pâle (cf bug KARMA).
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;
    let maxAlpha = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > maxAlpha) maxAlpha = data[i];
    }
    if (maxAlpha <= 0) return canvas;  // canvas vide

    // 3. Applique le colormap avec normalisation : v_norm = alpha / maxAlpha
    //    → le pixel le plus dense = 1.0 = rouge, le moins dense ≈ 0 = bleu/transparent.
    const invMax = 1 / maxAlpha;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 3) {  // seuil cut-off (≈1% du max possible)
        data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 0;
        continue;
      }
      const v = a * invMax;  // 0..1 normalisé
      const c = _colorAt(v);
      data[i]     = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = Math.round(c[3] * 255);
    }
    ctx.putImageData(imgData, 0, 0);

    return canvas;
  }

  // ============================================================
  // OVERLAY LEAFLET
  // ============================================================
  function _placerOverlay(canvas) {
    if (!window.map || !window.L) return;
    const pc = window.PLAN_CONFIG;
    if (!pc || !pc.plan) return;
    const imgW = pc.plan.imageWidth  || 1000;
    const imgH = pc.plan.imageHeight || 1000;

    // Cleanup éventuel
    if (_overlay) {
      try { window.map.removeLayer(_overlay); } catch(e) {}
      _overlay = null;
    }

    const dataUrl = canvas.toDataURL("image/png");
    _overlay = L.imageOverlay(dataUrl, [[0, 0], [imgH, imgW]], {
      opacity:     0.7,
      interactive: false,
      pane:        "overlayPane"
    }).addTo(window.map);
    _canvas = canvas;
  }

  // ============================================================
  // COLLECTE DES SEGMENTS SOURCES
  // ============================================================
  // 🆕 v1.21.2 (KARMA pertinence) : le collecteur retourne des SEGMENTS
  // [{a:{x,y}, b:{x,y}}] et non plus des points. Le rendu interpole le
  // long de chaque segment pour produire de vraies traînées continues
  // (vs scatter de blobs aux vertices). Un point isolé est représenté
  // par un segment dégénéré `{a:pt, b:null}` (rendu = 1 seul blob).
  //
  // Trois familles d'inputs :
  //   • Trail : suite de points conceptuellement reliée (tracker timeline,
  //             tracé road, polygone zone fermé, polyline structure)
  //             → émet (n-1) segments + segment de fermeture si polygon.
  //   • Point isolé : marker data layer, editor point, pilier structure
  //             → émet 1 segment dégénéré.

  // Helper : segmente une polyline {points:[{x,y}]}, polygone fermé si `closed`.
  function _pushPolylineSegs(segs, pts, closed) {
    if (!Array.isArray(pts) || pts.length === 0) return;
    if (pts.length === 1) {
      segs.push({ a: { x: pts[0].x, y: pts[0].y }, b: null });
      return;
    }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (typeof a.x !== "number" || typeof a.y !== "number") continue;
      if (typeof b.x !== "number" || typeof b.y !== "number") continue;
      segs.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
    }
    if (closed && pts.length >= 3) {
      const first = pts[0], last = pts[pts.length - 1];
      segs.push({ a: { x: last.x, y: last.y }, b: { x: first.x, y: first.y } });
    }
  }

  // Helper : itère sur une liste d'items {points:[{x,y}]} ou points uniques {x,y}.
  function _pushShapesAsSegs(segs, items, closed) {
    if (!Array.isArray(items)) return;
    items.forEach(function(it) {
      if (!it) return;
      if (Array.isArray(it.points) && it.points.length > 0) {
        _pushPolylineSegs(segs, it.points, !!closed);
      } else if (typeof it.x === "number" && typeof it.y === "number") {
        segs.push({ a: { x: it.x, y: it.y }, b: null });
      }
    });
  }

  function _collecterSegments(opts) {
    const segs = [];

    // 🚶 Tracker timeline — chaîne ordonnée par t. On découpe la timeline
    // en sous-séquences contiguës (= sans recalage / sans gap >5min). À
    // l'intérieur d'une sous-séquence, chaque paire consécutive forme un
    // segment marché.
    //
    //   - "start" : début d'une session, n'est PAS relié au point précédent.
    //   - "recalage" : téléport (recalage manuel sur point) → coupe la chaîne.
    //   - dt > 5min : pause longue → coupe la chaîne (pas de marche continue).
    if (opts.srcTracker && typeof window.getTrackingTimeline === "function") {
      const timeline = window.getTrackingTimeline() || [];
      const MAX_GAP_MS = 5 * 60 * 1000;  // 5 min
      let prev = null;
      timeline.forEach(function(p) {
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
        const isBreak = (p.type === "start") || (p.type === "recalage")
                        || (prev && typeof p.t === "number" && typeof prev.t === "number"
                            && (p.t - prev.t) > MAX_GAP_MS);
        if (prev && !isBreak) {
          segs.push({ a: { x: prev.x, y: prev.y }, b: { x: p.x, y: p.y } });
        } else {
          // Point d'ancrage isolé (début/recalage) — on l'affiche quand même
          // comme un blob, c'est sémantiquement "tu es passé là".
          segs.push({ a: { x: p.x, y: p.y }, b: null });
        }
        prev = p;
      });
    }

    // ✏️ Editor points — points isolés (POIs)
    if (opts.srcEditor && typeof window.getEditorPoints === "function") {
      (window.getEditorPoints() || []).forEach(function(p) {
        if (typeof p.x === "number" && typeof p.y === "number") {
          segs.push({ a: { x: p.x, y: p.y }, b: null });
        }
      });
    }

    // 🛣️ Tracés session — chaque road est une polyline OUVERTE
    if (opts.srcRoads && typeof window.getRoads === "function") {
      _pushShapesAsSegs(segs, window.getRoads() || [], false);
    }

    // ⬛ Zones session — polygones FERMÉS (segment de fermeture last→first)
    if (opts.srcZones && typeof window.getZones === "function") {
      _pushShapesAsSegs(segs, window.getZones() || [], true);
    }

    // 🏛️ Structures — mix : piliers (point unique), murs/fronts (polylines)
    if (opts.srcStructures && typeof window.getStructures === "function") {
      _pushShapesAsSegs(segs, window.getStructures() || [], false);
    }

    // 📊 Data layers — points isolés
    // 🐛 v1.21.2 fix NaN : `window._ktaDataMarkers` est un FLAT array de
    // L.marker (cf. utils.js). L'ancienne lecture `Object.keys()[k].length`
    // donnait NaN car .length sur un marker = undefined.
    if (opts.srcDataLayers && Array.isArray(window._ktaDataMarkers)) {
      const pc = window.PLAN_CONFIG;
      const imgH = (pc && pc.plan && pc.plan.imageHeight) || 0;
      window._ktaDataMarkers.forEach(function(m) {
        if (m && typeof m.getLatLng === "function") {
          const ll = m.getLatLng();
          if (ll) segs.push({ a: { x: ll.lng, y: imgH - ll.lat }, b: null });
        }
      });
    }

    return segs;
  }

  // Compteur sync de vertices pour l'affichage des badges de la modale.
  function _countVertices(items) {
    if (!Array.isArray(items)) return 0;
    let n = 0;
    items.forEach(function(it) {
      if (!it) return;
      if (Array.isArray(it.points)) n += it.points.length;
      else if (typeof it.x === "number" && typeof it.y === "number") n += 1;
    });
    return n;
  }

  // ============================================================
  // API PUBLIQUE
  // ============================================================
  function afficher(opts) {
    opts = opts || {};
    _lastOpts = opts;
    const segs = _collecterSegments(opts);
    if (segs.length === 0) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("🔥 Aucune donnée pour la heatmap. Active une source (tracker, points, tracés, calques).", "warn");
      }
      effacer();
      return;
    }
    const canvas = _renderCanvas(segs, opts);
    if (!canvas) return;
    _placerOverlay(canvas);
    if (window.OOMGuard && window.OOMGuard.showToast) {
      // Compteur informatif : nb de segments + nb d'éléments "linéaires"
      let nLines = 0, nDots = 0;
      segs.forEach(function(s) { if (s.b) nLines++; else nDots++; });
      const parts = [];
      if (nLines > 0) parts.push(nLines + " segment" + (nLines > 1 ? "s" : ""));
      if (nDots  > 0) parts.push(nDots  + " point" + (nDots  > 1 ? "s" : ""));
      window.OOMGuard.showToast("🔥 Heatmap : " + parts.join(" + ") + " (normalisé sur le pixel le plus chaud).", "info");
    }
  }

  function effacer() {
    if (_overlay) {
      try { window.map.removeLayer(_overlay); } catch(e) {}
      _overlay = null;
    }
    _canvas = null;
    _lastOpts = null;
  }

  function isVisible() { return !!_overlay; }

  // ============================================================
  // MODALE UI
  // ============================================================
  function ouvrirModale() {
    _injecterStyles();
    if (_modal) { _modal.remove(); _modal = null; }

    // Compteurs live pour aider l'user à voir ce qu'il va activer
    const nTracker = (typeof window.getTrackingTimeline === "function") ? window.getTrackingTimeline().length : 0;
    const nEditor  = (typeof window.getEditorPoints === "function") ? (window.getEditorPoints() || []).length : 0;
    // 🆕 v1.21.2 (KARMA "rajoute aussi road session, zone, structure") :
    // tracés / zones / structures session. On compte les vertices car c'est
    // ce qui sera réellement utilisé par la heatmap (un tracé long crée plus
    // de chaleur qu'un tracé court — sémantique "densité de présence").
    const roadsArr  = (typeof window.getRoads      === "function") ? (window.getRoads()      || []) : [];
    const zonesArr  = (typeof window.getZones      === "function") ? (window.getZones()      || []) : [];
    const structArr = (typeof window.getStructures === "function") ? (window.getStructures() || []) : [];
    const nRoads      = roadsArr.length;
    const nRoadsPts   = _countVertices(roadsArr);
    const nZones      = zonesArr.length;
    const nZonesPts   = _countVertices(zonesArr);
    const nStruct     = structArr.length;
    const nStructPts  = _countVertices(structArr);
    // 🐛 v1.21.2 fix NaN : _ktaDataMarkers est un FLAT array de L.marker
    // (cf. utils.js). Avant : Object.keys + index → NaN car .length sur un
    // marker unique.
    const nDataLayers = Array.isArray(window._ktaDataMarkers) ? window._ktaDataMarkers.length : 0;

    // Default values (reprend les opts précédentes si dispo)
    const o = _lastOpts || {};
    const radius    = o.radius    || DEFAULT_RADIUS_PX;
    const intensity = o.intensity || DEFAULT_INTENSITY;
    const srcTracker     = (o.srcTracker     !== undefined) ? o.srcTracker     : (nTracker > 0);
    const srcEditor      = (o.srcEditor      !== undefined) ? o.srcEditor      : (nEditor  > 0);
    const srcRoads       = (o.srcRoads       !== undefined) ? o.srcRoads       : (nRoads   > 0);
    const srcZones       = (o.srcZones       !== undefined) ? o.srcZones       : (nZones   > 0);
    const srcStructures  = (o.srcStructures  !== undefined) ? o.srcStructures  : (nStruct  > 0);
    const srcDataLayers  = (o.srcDataLayers  !== undefined) ? o.srcDataLayers  : (nDataLayers > 0);

    const modal = document.createElement("div");
    modal.id = "kta-heatmap-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-heatmap-modal-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">🔥 Heatmap — densité visuelle</span>' +
          '<button class="kta-panneau-close" id="kta-heatmap-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" style="padding:14px 16px;">' +
          '<p style="font-size:13px; color:#c8d0e0; margin-top:0; line-height:1.4;">' +
            'Affiche où la <strong>densité d\'éléments</strong> est la plus forte. Les tracés et tracker sont interpolés ' +
            'le long de leurs segments (vraies traînées continues, pas des points isolés). ' +
            '<span style="color:#ff8a5c;">Le pixel le plus dense = rouge</span>, le moins dense = bleu — ' +
            'la coloration s\'auto-adapte aux données sélectionnées.' +
          '</p>' +

          '<div class="kta-heatmap-section">' +
            '<div class="kta-heatmap-section-titre">📦 Sources à inclure</div>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-tracker"' + (srcTracker && nTracker > 0 ? " checked" : "") + (nTracker === 0 ? " disabled" : "") + '>' +
              '<span>🚶 Tracker (timeline)</span>' +
              '<span class="kta-heatmap-cb-count">' + nTracker + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-editor"' + (srcEditor && nEditor > 0 ? " checked" : "") + (nEditor === 0 ? " disabled" : "") + '>' +
              '<span>✏️ Points ajoutés (session)</span>' +
              '<span class="kta-heatmap-cb-count">' + nEditor + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-roads"' + (srcRoads && nRoads > 0 ? " checked" : "") + (nRoads === 0 ? " disabled" : "") + '>' +
              '<span>🛣️ Tracés (session)</span>' +
              '<span class="kta-heatmap-cb-count">' + nRoads + ' tracé' + (nRoads > 1 ? "s" : "") + ' / ' + nRoadsPts + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-zones"' + (srcZones && nZones > 0 ? " checked" : "") + (nZones === 0 ? " disabled" : "") + '>' +
              '<span>⬛ Zones (session)</span>' +
              '<span class="kta-heatmap-cb-count">' + nZones + ' zone' + (nZones > 1 ? "s" : "") + ' / ' + nZonesPts + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-struct"' + (srcStructures && nStruct > 0 ? " checked" : "") + (nStruct === 0 ? " disabled" : "") + '>' +
              '<span>🏛️ Structures (session)</span>' +
              '<span class="kta-heatmap-cb-count">' + nStruct + ' / ' + nStructPts + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-data"' + (srcDataLayers && nDataLayers > 0 ? " checked" : "") + (nDataLayers === 0 ? " disabled" : "") + '>' +
              '<span>📊 Calques de données</span>' +
              '<span class="kta-heatmap-cb-count">' + nDataLayers + ' pts</span>' +
            '</label>' +
          '</div>' +

          '<div class="kta-heatmap-section">' +
            '<div class="kta-heatmap-section-titre">🎨 Paramètres visuels</div>' +
            '<div class="kta-heatmap-slider-row">' +
              '<span class="kta-heatmap-slider-label">Rayon (px)</span>' +
              '<input type="range" class="kta-heatmap-slider" id="kta-hm-radius" min="10" max="120" step="5" value="' + radius + '">' +
              '<span class="kta-heatmap-slider-val" id="kta-hm-radius-val">' + radius + '</span>' +
            '</div>' +
            '<div class="kta-heatmap-slider-row">' +
              '<span class="kta-heatmap-slider-label">Intensité</span>' +
              '<input type="range" class="kta-heatmap-slider" id="kta-hm-intensity" min="0.2" max="3" step="0.1" value="' + intensity + '">' +
              '<span class="kta-heatmap-slider-val" id="kta-hm-intensity-val">' + intensity.toFixed(1) + 'x</span>' +
            '</div>' +
          '</div>' +

          '<div class="kta-heatmap-actions">' +
            '<button class="kta-btn kta-btn-ghost" id="kta-hm-effacer" type="button">❌ Effacer</button>' +
            '<button class="kta-btn kta-btn-primary" id="kta-hm-appliquer" type="button">🔥 Appliquer</button>' +
          '</div>' +

        '</div>' +
      '</div>';

    document.documentElement.appendChild(modal);
    _modal = modal;

    function _close() { try { modal.remove(); } catch(e) {} _modal = null; document.removeEventListener("keydown", _onKey); }
    function _onKey(e) { if (e.key === "Escape") _close(); }
    document.addEventListener("keydown", _onKey);
    document.getElementById("kta-heatmap-close").addEventListener("click", _close);
    modal.addEventListener("click", function(e) { if (e.target === modal) _close(); });

    // Sliders live update
    const rEl = document.getElementById("kta-hm-radius");
    const iEl = document.getElementById("kta-hm-intensity");
    rEl.addEventListener("input", function() { document.getElementById("kta-hm-radius-val").textContent = rEl.value; });
    iEl.addEventListener("input", function() { document.getElementById("kta-hm-intensity-val").textContent = parseFloat(iEl.value).toFixed(1) + "x"; });

    document.getElementById("kta-hm-effacer").addEventListener("click", function() {
      effacer();
      _close();
    });

    document.getElementById("kta-hm-appliquer").addEventListener("click", function() {
      // 🆕 v1.21.2 : nouvelles sources roads/zones/structures. Les .checked
      // sont guardés via `?.` car la checkbox peut être disabled / absente
      // si la catégorie est vide (cf. rendu conditionnel ci-dessus).
      const opts = {
        srcTracker:    !!document.getElementById("kta-hm-src-tracker")?.checked,
        srcEditor:     !!document.getElementById("kta-hm-src-editor")?.checked,
        srcRoads:      !!document.getElementById("kta-hm-src-roads")?.checked,
        srcZones:      !!document.getElementById("kta-hm-src-zones")?.checked,
        srcStructures: !!document.getElementById("kta-hm-src-struct")?.checked,
        srcDataLayers: !!document.getElementById("kta-hm-src-data")?.checked,
        radius:        parseInt(rEl.value, 10),
        intensity:     parseFloat(iEl.value)
      };
      afficher(opts);
      _close();
    });
  }

  // ============================================================
  // API GLOBALE
  // ============================================================
  window.MyKTAMapHeatmap = {
    ouvrirModale: ouvrirModale,
    afficher:     afficher,
    effacer:      effacer,
    isVisible:    isVisible
  };

  console.log("[Heatmap] Module chargé.");
})();
