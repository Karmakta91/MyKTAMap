/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// HEATMAP.JS — Carte de chaleur (densité de présence) en overlay canvas
// =========================
// Module ACTIF (chargé par index.html, précaché par sw.js, consommé par tracking, osmView, secoursMode,
// statsGlobales, interface…). Activable dans les fonctionnalités optionnelles.
// Sources : timeline du tracker, points de session, tracés / zones / structures, calques de données ; filtre
// par niveau en multi-niveau.
// Algorithme : canvas aux dimensions du plan (réduit), blobs gaussiens interpolés le long de SEGMENTS en
// mélange additif, renormalisation sur le max (le plus dense = rouge), colormap bleu → vert → jaune → rouge.
// API : window.MyKTAMapHeatmap = {
//   ouvrirModale()  - modale sources + rayon + intensité
//   afficher(opts)  - dessine l'overlay (efface + redessine)
//   effacer()       - retire l'overlay et purge le canvas
//   isVisible()     - bool
// };

(function() {
  "use strict";

  let _modal       = null;
  let _overlay     = null;  // L.imageOverlay
  let _canvas      = null;  // canvas standalone
  let _lastOpts    = null;  // pour le redraw au zoom
  let _overlayUrl  = null;  // (P0-4) : ObjectURL du dernier overlay (à revoke)

  const DEFAULT_RADIUS_PX = 40;     // rayon du gradient radial
  const DEFAULT_INTENSITY = 1.0;    // multiplicateur global
  // Au-delà, _renderCanvas refuse (avertissement OOMGuard) : des millions de blobs bloqueraient le thread
  // principal > 10 s (ANR, kill OS). 50 000 segments × ~10 échantillons = 500 k blobs, long mais survivable.
  const MAX_SEGMENTS = 50000;

  // ── Styles injectés ──────────
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
        color: var(--kta-texte);
        cursor: pointer;
      }
      .kta-heatmap-cb-row input[type="checkbox"] {
        width: 16px; height: 16px;
        cursor: pointer;
        accent-color: #ff8a5c;
      }
      .kta-heatmap-cb-count {
        margin-left: auto;
        color: var(--kta-texte-3);
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
        color: var(--kta-texte-2);
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

  // ── Colormap ──────────
  // Valeur normalisée 0-1 → RGBA.
  function _colorAt(value) {
    if (value <= 0) return [0, 0, 0, 0];
    const v = Math.min(1, value);
    // Bleu → vert → jaune → rouge (chaleur croissante), paliers à 0.2 / 0.5 / 0.8 / 1.0.
    let r, g, b, a;
    if (v < 0.2) {
      const t = v / 0.2;
      r = 30 * t; g = 80 * t; b = 200 * t; a = 0.5 * t;
    } else if (v < 0.5) {
      const t = (v - 0.2) / 0.3;
      r = 30 + (50 - 30) * t;
      g = 80 + (220 - 80) * t;
      b = 200 - (200 - 80) * t;
      a = 0.5 + 0.2 * t;
    } else if (v < 0.8) {
      const t = (v - 0.5) / 0.3;
      r = 50 + (250 - 50) * t;
      g = 220;
      b = 80 - 80 * t;
      a = 0.7 + 0.15 * t;
    } else {
      const t = (v - 0.8) / 0.2;
      r = 250;
      g = 220 - (220 - 50) * t;
      b = 0;
      a = 0.85 + 0.1 * t;
    }
    return [Math.round(r), Math.round(g), Math.round(b), Math.min(1, a)];
  }

  // ── Rendu canvas ──────────
  // 1. Le collecteur fournit des SEGMENTS (un point isolé = segment dégénéré) ; on interpole des blobs le long
  //    de chacun → vraies traînées pour tracés, tracker et zones.
  // 2. 🩸 Après le passage additif, on RENORMALISE sur le max atteint (pixel le plus dense = rouge, ≈0.05 =
  //    bleu). Sans ça, des points épars stagnent dans le bleu/vert pâle et la carte paraît aléatoire.
  function _renderCanvas(segments, opts) {
    const pc = window.PLAN_CONFIG;
    if (!pc || !pc.plan) return null;
    const imgW = pc.plan.imageWidth  || 1000;
    const imgH = pc.plan.imageHeight || 1000;

    // Canvas réduit, plafond selon la mémoire : 2048² = 16 Mo RGBA, + getImageData + PNG ≈ 40 Mo de pic, de quoi
    // faire tomber une PWA iPhone (~500 Mo). 1024 sur appareil faible (deviceMemory < 6 Go ou mobile).
    const _lowMem = (typeof navigator.deviceMemory === "number" && navigator.deviceMemory < 6)
                    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    const MAX_DIM = _lowMem ? 1024 : 2048;
    const scale = Math.min(1, MAX_DIM / Math.max(imgW, imgH));
    const W = Math.round(imgW * scale);
    const H = Math.round(imgH * scale);

    const canvas = document.createElement("canvas");
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    const radius    = (opts.radius || DEFAULT_RADIUS_PX) * scale;
    const intensity = opts.intensity || DEFAULT_INTENSITY;
    // Pas d'échantillonnage : 1 blob tous les radius/3 px (chevauchement → traînée lisse), au moins 2 px (pas
    // d'explosion sur les longs segments à petit rayon).
    const sampleStep = Math.max(2, radius * 0.33);

    ctx.globalCompositeOperation = "lighter";

    // Un blob gaussien en (px, py), coords canvas.
    const alphaCenter = Math.min(1, intensity * 0.18);  // un peu plus doux qu'avant pour profiter de la re-normalisation
    function _drawBlob(px, py) {
      const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0,   "rgba(255, 255, 255, " + alphaCenter + ")");
      grad.addColorStop(0.5, "rgba(255, 255, 255, " + (alphaCenter * 0.5) + ")");
      grad.addColorStop(1,   "rgba(255, 255, 255, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
    }

    // Point plan {x, y} → coords canvas [px, py].
    // 🩸 PAS de flip Y ici : l'overlay a pour bornes [[0,0], [imgH, imgW]], le pixel canvas (0,0) est rendu en
    // haut du plan (lat = imgH). cy = py × scale tombe donc à lat = imgH - py, comme convertCoord. Un
    // `(imgH - p.y) * scale` rendrait la carte en miroir vertical.
    function _toCanvas(p) {
      return [p.x * scale, p.y * scale];
    }

    // 1. Passage additif : blobs régulièrement espacés de a à b (a === b → un seul blob).
    (segments || []).forEach(function(seg) {
      if (!seg || !seg.a) return;
      const [ax, ay] = _toCanvas(seg.a);
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

    // 2. Max d'intensité atteint : pivot de la renormalisation.
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;
    let maxAlpha = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > maxAlpha) maxAlpha = data[i];
    }
    if (maxAlpha <= 0) return canvas;  // canvas vide

    // 3. Colormap normalisée : v = alpha / maxAlpha.
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

  // ── Overlay Leaflet ──────────
  function _placerOverlay(canvas) {
    if (!window.map || !window.L) return;
    const pc = window.PLAN_CONFIG;
    if (!pc || !pc.plan) return;
    const imgW = pc.plan.imageWidth  || 1000;
    const imgH = pc.plan.imageHeight || 1000;

    // Overlay précédent et son ObjectURL nettoyés.
    if (_overlay) {
      try { window.map.removeLayer(_overlay); } catch(e) {}
      _overlay = null;
    }
    if (_overlayUrl) {
      try { URL.revokeObjectURL(_overlayUrl); } catch(e) {}
      _overlayUrl = null;
    }

    // toBlob + createObjectURL, pas toDataURL : pas de chaîne base64 de ~10 Mo encodée en synchrone puis redécodée
    // (pic ~40 Mo) ; le PNG reste binaire et l'<img> lit l'ObjectURL directement.
    canvas.toBlob(function(blob) {
      if (!blob) {
        // Safari iOS peut rendre null en silence sur un canvas trop gros.
        console.warn("[Heatmap] canvas.toBlob a retourné null — canvas trop gros ?");
        return;
      }
      _overlayUrl = URL.createObjectURL(blob);
      _overlay = L.imageOverlay(_overlayUrl, [[0, 0], [imgH, imgW]], {
        opacity:     0.7,
        interactive: false,
        pane:        "overlayPane"
      }).addTo(window.map);
      _canvas = canvas;
    }, "image/png");
  }

  // ── Collecte des segments sources ──────────
  // Segments [{a:{x,y}, b:{x,y}}] ; point isolé = `{a:pt, b:null}` (un blob).
  //   • Traînée : suite de points reliés (timeline du tracker, tracé, zone, polyline de structure) → n-1
  //     segments + fermeture si polygone.
  //   • Point isolé : marqueur de calque, point de session, pilier → 1 segment dégénéré.

  // Segmente une polyline {points:[{x,y}]} ; polygone fermé si `closed`.
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

  // Filtre de niveau d'un objet. `levelSet` : Set<number> ou null (pas de filtre). Jonction : visible si
  // fromLevel OU toLevel ∈ set (comme road.js > passeFiltreNiveau).
  function _passeFiltreLevel(item, levelSet) {
    if (!levelSet) return true;  // null = pas de filtre
    if (!item) return false;
    if (item.type === "jonction") {
      return levelSet.has(item.fromLevel || 0) || levelSet.has(item.toLevel || 0);
    }
    return levelSet.has(item.level || 0);
  }

  // Objets {points:[{x,y}]} ou points {x,y} → segments ; `levelSet` écarte les objets hors niveau.
  function _pushShapesAsSegs(segs, items, closed, levelSet) {
    if (!Array.isArray(items)) return;
    items.forEach(function(it) {
      if (!it) return;
      if (!_passeFiltreLevel(it, levelSet)) return;
      if (Array.isArray(it.points) && it.points.length > 0) {
        _pushPolylineSegs(segs, it.points, !!closed);
      } else if (typeof it.x === "number" && typeof it.y === "number") {
        segs.push({ a: { x: it.x, y: it.y }, b: null });
      }
    });
  }

  function _collecterSegments(opts) {
    const segs = [];
    // null = pas de filtre (multi-niveau inactif ou non restreint) ; sinon les niveaux cochés dans la modale.
    const levelSet = (opts.levels instanceof Set) ? opts.levels : null;

    // Timeline du tracker, ordonnée par t, découpée en sous-séquences contiguës ; chaque paire consécutive d'une
    // sous-séquence forme un segment marché. La chaîne est coupée par :
    //   - "start" (début de session, non relié au précédent) ;
    //   - "recalage" (téléport manuel sur un point) ;
    //   - dt > 5 min (pause longue) ;
    //   - un niveau hors levelSet (saut de niveau : pas de segment).
    if (opts.srcTracker && typeof window.getTrackingTimeline === "function") {
      const timeline = window.getTrackingTimeline() || [];
      const MAX_GAP_MS = 5 * 60 * 1000;  // 5 min
      let prev = null;
      timeline.forEach(function(p) {
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
        // Filtre de niveau : la timeline n'a pas de type jonction, on teste p.level.
        if (levelSet && !levelSet.has(p.level || 0)) {
          prev = null;  // casse la chaîne
          return;
        }
        const isBreak = (p.type === "start") || (p.type === "recalage")
                        || (prev && typeof p.t === "number" && typeof prev.t === "number"
                            && (p.t - prev.t) > MAX_GAP_MS);
        if (prev && !isBreak) {
          segs.push({ a: { x: prev.x, y: prev.y }, b: { x: p.x, y: p.y } });
        } else {
          // Ancrage isolé (début / recalage) : un blob quand même (« tu es passé là »).
          segs.push({ a: { x: p.x, y: p.y }, b: null });
        }
        prev = p;
      });
    }

    // Points de session (POI), filtre de niveau par point.
    if (opts.srcEditor && typeof window.getEditorPoints === "function") {
      (window.getEditorPoints() || []).forEach(function(p) {
        if (typeof p.x !== "number" || typeof p.y !== "number") return;
        if (!_passeFiltreLevel(p, levelSet)) return;
        segs.push({ a: { x: p.x, y: p.y }, b: null });
      });
    }

    // Tracés de session : polylines OUVERTES.
    if (opts.srcRoads && typeof window.getRoads === "function") {
      _pushShapesAsSegs(segs, window.getRoads() || [], false, levelSet);
    }

    // Zones de session : polygones FERMÉS (segment last → first).
    if (opts.srcZones && typeof window.getZones === "function") {
      _pushShapesAsSegs(segs, window.getZones() || [], true, levelSet);
    }

    // Structures : piliers (point) ou murs / fronts (polylines).
    if (opts.srcStructures && typeof window.getStructures === "function") {
      _pushShapesAsSegs(segs, window.getStructures() || [], false, levelSet);
    }

    // Calques de données : 4 sous-types filtrables indépendamment. Les registres sont remplis AU CHARGEMENT du
    // calque (utils.js > ajouterPointsDepuisJSON), indépendamment de sa visibilité : calque masqué inclus.
    // Ancienne option `opts.srcDataLayers` (interrupteur unique) acceptée : elle coche les 4.
    const _legacyDL = (opts.srcDataLayers === true)
                      && (opts.srcDataPoints     === undefined)
                      && (opts.srcDataRoads      === undefined)
                      && (opts.srcDataZones      === undefined)
                      && (opts.srcDataStructures === undefined);
    const _dlP = _legacyDL ? true : !!opts.srcDataPoints;
    const _dlR = _legacyDL ? true : !!opts.srcDataRoads;
    const _dlZ = _legacyDL ? true : !!opts.srcDataZones;
    const _dlS = _legacyDL ? true : !!opts.srcDataStructures;

    // Points isolés (L.marker en latlng → retournés en coords plan). ⚠️ `window._ktaDataMarkers` est un tableau
    // PLAT de L.marker (cf. utils.js), pas un objet layerId → marqueurs ; niveau via marker._ktaLevel.
    if (_dlP && Array.isArray(window._ktaDataMarkers)) {
      const pc = window.PLAN_CONFIG;
      const imgH = (pc && pc.plan && pc.plan.imageHeight) || 0;
      window._ktaDataMarkers.forEach(function(m) {
        if (m && typeof m.getLatLng === "function") {
          if (levelSet && !levelSet.has(m._ktaLevel || 0)) return;
          const ll = m.getLatLng();
          if (ll) segs.push({ a: { x: ll.lng, y: imgH - ll.lat }, b: null });
        }
      });
    }
    // Tracés de calque (entry.points en coords plan, polylines ouvertes), entry.level + jonctions.
    if (_dlR && Array.isArray(window._ktaDataPolylines)) {
      window._ktaDataPolylines.forEach(function(entry) {
          // Les circleMarker d'extrémité de jonction n'ont pas de points.
        if (!entry || !Array.isArray(entry.points)) return;
        if (!_passeFiltreLevel(entry, levelSet)) return;
        _pushPolylineSegs(segs, entry.points, false);
      });
    }
    // Zones de calque (polygones fermés).
    if (_dlZ && Array.isArray(window._ktaDataPolygons)) {
      window._ktaDataPolygons.forEach(function(entry) {
        if (!entry || !Array.isArray(entry.points)) return;
        if (!_passeFiltreLevel(entry, levelSet)) return;
        _pushPolylineSegs(segs, entry.points, true);
      });
    }
    // Structures de calque : polylines (front-1/2) ou polygones (pilier-1/2, mur), selon le type (cf. utils.js >
    // STRUCTURE_STYLES_DATA.isPolyline).
    if (_dlS && Array.isArray(window._ktaDataStructurePolygons)) {
      window._ktaDataStructurePolygons.forEach(function(entry) {
        if (!entry || !Array.isArray(entry.points)) return;
        if (!_passeFiltreLevel(entry, levelSet)) return;
        const isPolyline = (entry.type === "front-1" || entry.type === "front-2");
        _pushPolylineSegs(segs, entry.points, !isPolyline);
      });
    }

    return segs;
  }

  // Nombre de sommets, pour les badges de la modale.
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

  // ── API publique ──────────
  function afficher(opts) {
    opts = opts || {};
    _lastOpts = opts;
    const segs = _collecterSegments(opts);
    if (segs.length === 0) {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("heatmap.toast.noData"), "warn");
      }
      effacer();
      return;
    }
    // Garde-fou anti-ANR : au-delà de MAX_SEGMENTS, abandon avec un avertissement explicite plutôt qu'un kill OS.
    if (segs.length > MAX_SEGMENTS) {
      console.warn("[Heatmap] Refus de rendre " + segs.length + " segments (max " + MAX_SEGMENTS + ")");
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(
          window.I18n.t("heatmap.toast.tooMany", { count: segs.length, max: MAX_SEGMENTS }),
          "warn"
        );
      }
      effacer();
      return;
    }
    const canvas = _renderCanvas(segs, opts);
    if (!canvas) return;
    _placerOverlay(canvas);
    if (window.OOMGuard && window.OOMGuard.showToast) {
      let nLines = 0, nDots = 0;
      segs.forEach(function(s) { if (s.b) nLines++; else nDots++; });
      const parts = [];
      if (nLines > 0) parts.push(window.I18n.t(nLines > 1 ? "heatmap.toast.segments" : "heatmap.toast.segment", { count: nLines }));
      if (nDots  > 0) parts.push(window.I18n.t(nDots  > 1 ? "heatmap.toast.points"   : "heatmap.toast.point",   { count: nDots }));
      window.OOMGuard.showToast(window.I18n.t("heatmap.toast.info", { parts: parts.join(" + ") }), "info");
    }
  }

  function effacer() {
    if (_overlay) {
      try { window.map.removeLayer(_overlay); } catch(e) {}
      _overlay = null;
    }
    // ObjectURL révoquée, sinon le PNG reste en mémoire tant que l'onglet vit.
    if (_overlayUrl) {
      try { URL.revokeObjectURL(_overlayUrl); } catch(e) {}
      _overlayUrl = null;
    }
    _canvas = null;
    _lastOpts = null;
  }

  function isVisible() { return !!_overlay; }

  // ── Modale ──────────
  function ouvrirModale() {
    _injecterStyles();
    if (_modal) { _modal.remove(); _modal = null; }

    // Compteurs par source.
    const nTracker = (typeof window.getTrackingTimeline === "function") ? window.getTrackingTimeline().length : 0;
    const nEditor  = (typeof window.getEditorPoints === "function") ? (window.getEditorPoints() || []).length : 0;
    // Tracés / zones / structures de session comptés en SOMMETS (ce que la heatmap utilise : un long tracé chauffe
    // plus qu'un court).
    const roadsArr  = (typeof window.getRoads      === "function") ? (window.getRoads()      || []) : [];
    const zonesArr  = (typeof window.getZones      === "function") ? (window.getZones()      || []) : [];
    const structArr = (typeof window.getStructures === "function") ? (window.getStructures() || []) : [];
    const nRoads      = roadsArr.length;
    const nRoadsPts   = _countVertices(roadsArr);
    const nZones      = zonesArr.length;
    const nZonesPts   = _countVertices(zonesArr);
    const nStruct     = structArr.length;
    const nStructPts  = _countVertices(structArr);
    // ⚠️ _ktaDataMarkers est un tableau PLAT de L.marker (cf. utils.js).
    const nDataMarkers = Array.isArray(window._ktaDataMarkers) ? window._ktaDataMarkers.length : 0;
    // 4 compteurs de calque (points / tracés / zones / structures), cochés indépendamment ; les circleMarker
    // d'extrémité de jonction (sans `.points`) sont exclus.
    function _countDataLayerEntries(arr) {
      if (!Array.isArray(arr)) return { n: 0, pts: 0 };
      let n = 0, pts = 0;
      arr.forEach(function(e) {
        if (!e || !Array.isArray(e.points)) return;
        n++;
        pts += e.points.length;
      });
      return { n: n, pts: pts };
    }
    const dlRoads   = _countDataLayerEntries(window._ktaDataPolylines);
    const dlZones   = _countDataLayerEntries(window._ktaDataPolygons);
    const dlStructs = _countDataLayerEntries(window._ktaDataStructurePolygons);

    // Valeurs par défaut : options précédentes si disponibles.
    const o = _lastOpts || {};
    const radius    = o.radius    || DEFAULT_RADIUS_PX;
    const intensity = o.intensity || DEFAULT_INTENSITY;
    const srcTracker     = (o.srcTracker     !== undefined) ? o.srcTracker     : (nTracker > 0);
    const srcEditor      = (o.srcEditor      !== undefined) ? o.srcEditor      : (nEditor  > 0);
    const srcRoads       = (o.srcRoads       !== undefined) ? o.srcRoads       : (nRoads   > 0);
    const srcZones       = (o.srcZones       !== undefined) ? o.srcZones       : (nZones   > 0);
    const srcStructures  = (o.srcStructures  !== undefined) ? o.srcStructures  : (nStruct  > 0);
    // 4 sous-options de calque ; l'ancien `srcDataLayers=true` les coche toutes.
    const _legacyDL = (o.srcDataLayers === true)
                      && (o.srcDataPoints     === undefined)
                      && (o.srcDataRoads      === undefined)
                      && (o.srcDataZones      === undefined)
                      && (o.srcDataStructures === undefined);
    const srcDataPoints     = (o.srcDataPoints     !== undefined) ? o.srcDataPoints     : (_legacyDL || nDataMarkers  > 0);
    const srcDataRoads      = (o.srcDataRoads      !== undefined) ? o.srcDataRoads      : (_legacyDL || dlRoads.n     > 0);
    const srcDataZones      = (o.srcDataZones      !== undefined) ? o.srcDataZones      : (_legacyDL || dlZones.n     > 0);
    const srcDataStructures = (o.srcDataStructures !== undefined) ? o.srcDataStructures : (_legacyDL || dlStructs.n   > 0);

    // Multi-niveau : niveaux disponibles (APP_CONFIG.availableLevels) ; cases cochées = choix précédent, sinon les
    // niveaux visibles sur la carte.
    const _isMultiLevel = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    let _availableLevels = [];
    let _defaultLevelsSet = null;
    if (_isMultiLevel) {
      _availableLevels = Array.isArray(window.APP_CONFIG.availableLevels)
                         ? window.APP_CONFIG.availableLevels.slice().sort(function(a, b) { return a - b; })
                         : [-2, -1, 0, 1, 2];
      const _visibleLevels = Array.isArray(window.APP_CONFIG.visibleLevels)
                             ? window.APP_CONFIG.visibleLevels
                             : [0];
      if (o.levels instanceof Set) {
        _defaultLevelsSet = o.levels;
      } else if (Array.isArray(o.levels)) {
        _defaultLevelsSet = new Set(o.levels);
      } else {
        _defaultLevelsSet = new Set(_visibleLevels);
      }
    }

    const modal = document.createElement("div");
    modal.id = "kta-heatmap-modal";
    modal.className = "kta-readme-modal-overlay";
    modal.style.display = "flex";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-heatmap-modal-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + window.I18n.t("heatmap.modal.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-heatmap-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" style="padding:14px 16px;">' +
          '<p style="font-size:13px; color:var(--kta-texte-2); margin-top:0; line-height:1.4;">' +
            window.I18n.t("heatmap.modal.help") +
          '</p>' +

          '<div class="kta-heatmap-section">' +
            '<div class="kta-heatmap-section-titre">' + window.I18n.t("heatmap.section.session") + '</div>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-tracker"' + (srcTracker && nTracker > 0 ? " checked" : "") + (nTracker === 0 ? " disabled" : "") + '>' +
              '<span>' + window.I18n.t("heatmap.src.tracker") + '</span>' +
              '<span class="kta-heatmap-cb-count">' + window.I18n.t("heatmap.count.pts", { pts: nTracker }) + '</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-editor"' + (srcEditor && nEditor > 0 ? " checked" : "") + (nEditor === 0 ? " disabled" : "") + '>' +
              '<span>' + window.I18n.t("heatmap.src.editor") + '</span>' +
              '<span class="kta-heatmap-cb-count">' + window.I18n.t("heatmap.count.pts", { pts: nEditor }) + '</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-roads"' + (srcRoads && nRoads > 0 ? " checked" : "") + (nRoads === 0 ? " disabled" : "") + '>' +
              '<span>' + window.I18n.t("heatmap.src.roads") + '</span>' +
              '<span class="kta-heatmap-cb-count">' + window.I18n.t(nRoads > 1 ? "heatmap.count.roads.plural" : "heatmap.count.roads.one", { n: nRoads, pts: nRoadsPts }) + '</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-zones"' + (srcZones && nZones > 0 ? " checked" : "") + (nZones === 0 ? " disabled" : "") + '>' +
              '<span>' + window.I18n.t("heatmap.src.zones") + '</span>' +
              '<span class="kta-heatmap-cb-count">' + window.I18n.t(nZones > 1 ? "heatmap.count.zones.plural" : "heatmap.count.zones.one", { n: nZones, pts: nZonesPts }) + '</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-struct"' + (srcStructures && nStruct > 0 ? " checked" : "") + (nStruct === 0 ? " disabled" : "") + '>' +
              '<span>' + window.I18n.t("heatmap.src.structures") + '</span>' +
              '<span class="kta-heatmap-cb-count">' + window.I18n.t("heatmap.count.struct", { n: nStruct, pts: nStructPts }) + '</span>' +
            '</label>' +
          '</div>' +

          '<div class="kta-heatmap-section">' +
            '<div class="kta-heatmap-section-titre" style="display:flex; align-items:center; gap:8px;">' +
              '<span>' + window.I18n.t("heatmap.section.data") + ' <span style="font-size:10px; color:var(--kta-texte-3); font-weight:400; text-transform:none; letter-spacing:0;">' + window.I18n.t("heatmap.section.dataHint") + '</span></span>' +
              '<button type="button" id="kta-hm-dl-toggleall" style="margin-left:auto; background:transparent; border:1px solid rgba(255,138,92,0.4); color:#ff8a5c; padding:2px 8px; font-size:10px; border-radius:4px; cursor:pointer; text-transform:none; letter-spacing:0; font-weight:600;" title="' + window.I18n.t("heatmap.data.toggleAllTitle") + '">' + window.I18n.t("heatmap.toggleAll") + '</button>' +
            '</div>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-data-points"' + (srcDataPoints && nDataMarkers > 0 ? " checked" : "") + (nDataMarkers === 0 ? " disabled" : "") + '>' +
              '<span>' + window.I18n.t("heatmap.src.dataPoints") + '</span>' +
              '<span class="kta-heatmap-cb-count">' + window.I18n.t(nDataMarkers > 1 ? "heatmap.count.points.plural" : "heatmap.count.points.one", { pts: nDataMarkers }) + '</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-data-roads"' + (srcDataRoads && dlRoads.n > 0 ? " checked" : "") + (dlRoads.n === 0 ? " disabled" : "") + '>' +
              '<span>' + window.I18n.t("heatmap.src.dataRoads") + '</span>' +
              '<span class="kta-heatmap-cb-count">' + window.I18n.t(dlRoads.n > 1 ? "heatmap.count.roads.plural" : "heatmap.count.roads.one", { n: dlRoads.n, pts: dlRoads.pts }) + '</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-data-zones"' + (srcDataZones && dlZones.n > 0 ? " checked" : "") + (dlZones.n === 0 ? " disabled" : "") + '>' +
              '<span>' + window.I18n.t("heatmap.src.dataZones") + '</span>' +
              '<span class="kta-heatmap-cb-count">' + window.I18n.t(dlZones.n > 1 ? "heatmap.count.zones.plural" : "heatmap.count.zones.one", { n: dlZones.n, pts: dlZones.pts }) + '</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-data-struct"' + (srcDataStructures && dlStructs.n > 0 ? " checked" : "") + (dlStructs.n === 0 ? " disabled" : "") + '>' +
              '<span>' + window.I18n.t("heatmap.src.dataStructures") + '</span>' +
              '<span class="kta-heatmap-cb-count">' + window.I18n.t("heatmap.count.struct", { n: dlStructs.n, pts: dlStructs.pts }) + '</span>' +
            '</label>' +
          '</div>' +

          // Section « Niveaux » seulement en multi-niveau, pré-cochée sur les niveaux visibles.
          (_isMultiLevel ?
            '<div class="kta-heatmap-section">' +
              '<div class="kta-heatmap-section-titre" style="display:flex; align-items:center; gap:8px;">' +
                '<span>' + window.I18n.t("heatmap.section.levels") + '</span>' +
                '<button type="button" id="kta-hm-lvl-toggleall" style="margin-left:auto; background:transparent; border:1px solid rgba(255,138,92,0.4); color:#ff8a5c; padding:2px 8px; font-size:10px; border-radius:4px; cursor:pointer; text-transform:none; letter-spacing:0; font-weight:600;" title="' + window.I18n.t("heatmap.levels.toggleAllTitle") + '">' + window.I18n.t("heatmap.toggleAll") + '</button>' +
              '</div>' +
              '<div class="kta-heatmap-levels-row" style="display:flex; flex-wrap:wrap; gap:6px 10px; padding:4px 0;">' +
                _availableLevels.map(function(lvl) {
                  const isChecked = _defaultLevelsSet && _defaultLevelsSet.has(lvl);
                  const lblTxt = (lvl === 0) ? window.I18n.t("heatmap.levels.ground") : (lvl > 0 ? "+" + lvl : String(lvl));
                  return '<label class="kta-heatmap-level-chip" style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(244,197,66,0.06); border:1px solid rgba(244,197,66,0.20); border-radius:14px; cursor:pointer; font-size:12px;">' +
                           '<input type="checkbox" data-level="' + lvl + '" class="kta-hm-lvl-cb"' + (isChecked ? " checked" : "") + '>' +
                           '<span>' + window.I18n.t("heatmap.levels.chip", { lvl: lblTxt }) + '</span>' +
                         '</label>';
                }).join("") +
              '</div>' +
            '</div>'
            : '') +

          '<div class="kta-heatmap-section">' +
            '<div class="kta-heatmap-section-titre">' + window.I18n.t("heatmap.section.visual") + '</div>' +
            '<div class="kta-heatmap-slider-row">' +
              '<span class="kta-heatmap-slider-label">' + window.I18n.t("heatmap.param.radius") + '</span>' +
              '<input type="range" class="kta-heatmap-slider" id="kta-hm-radius" min="10" max="120" step="5" value="' + radius + '">' +
              '<span class="kta-heatmap-slider-val" id="kta-hm-radius-val">' + radius + '</span>' +
            '</div>' +
            '<div class="kta-heatmap-slider-row">' +
              '<span class="kta-heatmap-slider-label">' + window.I18n.t("heatmap.param.intensity") + '</span>' +
              '<input type="range" class="kta-heatmap-slider" id="kta-hm-intensity" min="0.2" max="3" step="0.1" value="' + intensity + '">' +
              '<span class="kta-heatmap-slider-val" id="kta-hm-intensity-val">' + intensity.toFixed(1) + 'x</span>' +
            '</div>' +
          '</div>' +

          '<div class="kta-heatmap-actions">' +
            '<button class="kta-btn kta-btn-ghost" id="kta-hm-effacer" type="button">' + window.I18n.t("heatmap.btn.clear") + '</button>' +
            '<button class="kta-btn kta-btn-primary" id="kta-hm-appliquer" type="button">' + window.I18n.t("heatmap.btn.apply") + '</button>' +
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

    const rEl = document.getElementById("kta-hm-radius");
    const iEl = document.getElementById("kta-hm-intensity");
    rEl.addEventListener("input", function() { document.getElementById("kta-hm-radius-val").textContent = rEl.value; });
    iEl.addEventListener("input", function() { document.getElementById("kta-hm-intensity-val").textContent = parseFloat(iEl.value).toFixed(1) + "x"; });

    document.getElementById("kta-hm-effacer").addEventListener("click", function() {
      effacer();
      _close();
    });

    // « ⇅ Tout » des 4 sous-cases de calque : une cochée → tout décocher, sinon tout cocher (sauf les cases
    // désactivées, sans données).
    const _dlAllBtn = document.getElementById("kta-hm-dl-toggleall");
    if (_dlAllBtn) {
      _dlAllBtn.addEventListener("click", function() {
        const ids = ["kta-hm-src-data-points", "kta-hm-src-data-roads",
                     "kta-hm-src-data-zones",  "kta-hm-src-data-struct"];
        const enabled = ids.map(function(id) { return document.getElementById(id); })
                          .filter(function(el) { return el && !el.disabled; });
        if (enabled.length === 0) return;
        const anyChecked = enabled.some(function(el) { return el.checked; });
        enabled.forEach(function(el) { el.checked = !anyChecked; });
      });
    }

    // « ⇅ Tout » des niveaux, même logique.
    const _lvlAllBtn = document.getElementById("kta-hm-lvl-toggleall");
    if (_lvlAllBtn) {
      _lvlAllBtn.addEventListener("click", function() {
        const cbs = Array.from(document.querySelectorAll(".kta-hm-lvl-cb"));
        if (cbs.length === 0) return;
        const anyChecked = cbs.some(function(el) { return el.checked; });
        cbs.forEach(function(el) { el.checked = !anyChecked; });
      });
    }

    document.getElementById("kta-hm-appliquer").addEventListener("click", function() {
      // Sources de session + 4 sous-options de calque. `?.` sur .checked : une case peut être absente ou
      // désactivée (catégorie vide).
      const opts = {
        srcTracker:        !!document.getElementById("kta-hm-src-tracker")?.checked,
        srcEditor:         !!document.getElementById("kta-hm-src-editor")?.checked,
        srcRoads:          !!document.getElementById("kta-hm-src-roads")?.checked,
        srcZones:          !!document.getElementById("kta-hm-src-zones")?.checked,
        srcStructures:     !!document.getElementById("kta-hm-src-struct")?.checked,
        srcDataPoints:     !!document.getElementById("kta-hm-src-data-points")?.checked,
        srcDataRoads:      !!document.getElementById("kta-hm-src-data-roads")?.checked,
        srcDataZones:      !!document.getElementById("kta-hm-src-data-zones")?.checked,
        srcDataStructures: !!document.getElementById("kta-hm-src-data-struct")?.checked,
        radius:            parseInt(rEl.value, 10),
        intensity:         parseFloat(iEl.value)
      };
      // Multi-niveau : Set des niveaux cochés ; tout décoché = Set vide = heatmap vide (avertissement).
      if (_isMultiLevel) {
        const lvlSet = new Set();
        document.querySelectorAll(".kta-hm-lvl-cb").forEach(function(cb) {
          if (cb.checked) {
            const lvl = parseInt(cb.dataset.level, 10);
            if (!isNaN(lvl)) lvlSet.add(lvl);
          }
        });
        opts.levels = lvlSet;
      }
      afficher(opts);
      _close();
    });
  }

  // ── API globale ──────────
  window.MyKTAMapHeatmap = {
    ouvrirModale: ouvrirModale,
    afficher:     afficher,
    effacer:      effacer,
    isVisible:    isVisible
  };

  console.log("[Heatmap] Module chargé.");
})();
