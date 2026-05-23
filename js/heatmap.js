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
  function _renderCanvas(points, opts) {
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

    // 1. Build intensity field (somme des gradients gaussiens)
    const radius = (opts.radius || DEFAULT_RADIUS_PX) * scale;
    const intensity = opts.intensity || DEFAULT_INTENSITY;

    // Pour la perf, on dessine des cercles avec gradient radial directement
    // sur le canvas en mode 'lighter' (additive). Plus simple que de gérer
    // un ImageData pixel-par-pixel et tout aussi efficace pour < 5000 points.
    ctx.globalCompositeOperation = "lighter";
    points.forEach(function(p) {
      const px = p.x * scale;
      const py = (imgH - p.y) * scale;  // flip Y pour Leaflet CRS.Simple
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
      const alpha = Math.min(1, intensity * 0.4);  // alpha center
      grad.addColorStop(0,   "rgba(255, 255, 255, " + alpha + ")");
      grad.addColorStop(0.5, "rgba(255, 255, 255, " + (alpha * 0.5) + ")");
      grad.addColorStop(1,   "rgba(255, 255, 255, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    });

    // 2. Apply colormap : lit l'intensité du canvas et remplace par la couleur heat
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i + 3] / 255;  // alpha = intensité (mode lighter)
      if (v <= 0.02) {
        data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 0;
        continue;
      }
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
  // COLLECTE DES POINTS SOURCES
  // ============================================================
  function _collecterPoints(opts) {
    const pts = [];

    // Tracker timeline (points pdr/recalage/start)
    if (opts.srcTracker && typeof window.getTrackingTimeline === "function") {
      const timeline = window.getTrackingTimeline();
      timeline.forEach(function(p) {
        if (typeof p.x === "number" && typeof p.y === "number") {
          pts.push({ x: p.x, y: p.y });
        }
      });
    }

    // Editor points session
    if (opts.srcEditor && typeof window.getEditorPoints === "function") {
      (window.getEditorPoints() || []).forEach(function(p) {
        if (typeof p.x === "number" && typeof p.y === "number") {
          pts.push({ x: p.x, y: p.y });
        }
      });
    }

    // Data layer points (puits, vehicules, etc.) — TOUS les data layers du plan
    if (opts.srcDataLayers) {
      const pc = window.PLAN_CONFIG;
      if (pc && Array.isArray(pc.dataLayers)) {
        // Lecture synchrone via les cached points si possible. Sinon fetch async.
        // Pour l'instant, on use le cache _ktaDataMarkers si dispo (markers Leaflet
        // qui ont leur latlng) → reconvert en coords plan.
        if (window._ktaDataMarkers) {
          Object.keys(window._ktaDataMarkers).forEach(function(layerId) {
            const markers = window._ktaDataMarkers[layerId] || [];
            markers.forEach(function(m) {
              if (m && m.getLatLng) {
                const ll = m.getLatLng();
                const imgH = pc.plan.imageHeight;
                pts.push({ x: ll.lng, y: imgH - ll.lat });
              }
            });
          });
        }
      }
    }

    return pts;
  }

  // ============================================================
  // API PUBLIQUE
  // ============================================================
  function afficher(opts) {
    opts = opts || {};
    _lastOpts = opts;
    const pts = _collecterPoints(opts);
    if (pts.length === 0) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("🔥 Aucun point pour la heatmap. Active une source (tracker, points, calques).", "warn");
      }
      effacer();
      return;
    }
    const canvas = _renderCanvas(pts, opts);
    if (!canvas) return;
    _placerOverlay(canvas);
    if (window.OOMGuard && window.OOMGuard.showToast) {
      window.OOMGuard.showToast("🔥 Heatmap : " + pts.length + " points dessinés.", "info");
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
    let nDataLayers = 0;
    if (window._ktaDataMarkers) {
      Object.keys(window._ktaDataMarkers).forEach(function(k) {
        nDataLayers += (window._ktaDataMarkers[k] || []).length;
      });
    }

    // Default values (reprend les opts précédentes si dispo)
    const o = _lastOpts || {};
    const radius    = o.radius    || DEFAULT_RADIUS_PX;
    const intensity = o.intensity || DEFAULT_INTENSITY;
    const srcTracker     = (o.srcTracker     !== undefined) ? o.srcTracker     : (nTracker > 0);
    const srcEditor      = (o.srcEditor      !== undefined) ? o.srcEditor      : (nEditor  > 0);
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
          '<p style="font-size:13px; color:#c8d0e0; margin-top:0;">' +
            'Visualise les zones les plus denses (parcours tracker, points ajoutés, calques de données).' +
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
      const opts = {
        srcTracker:    document.getElementById("kta-hm-src-tracker").checked,
        srcEditor:     document.getElementById("kta-hm-src-editor").checked,
        srcDataLayers: document.getElementById("kta-hm-src-data").checked,
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
