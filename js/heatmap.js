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
  let _overlayUrl  = null;  // 🐛 v1.21.3 (P0-4) : ObjectURL du dernier overlay (à revoke)

  // Defaults
  const DEFAULT_RADIUS_PX = 40;     // rayon du gradient radial
  const DEFAULT_INTENSITY = 1.0;    // multiplicateur global
  // 🐛 v1.21.3 (audit P0-5) : seuil au-delà duquel _renderCanvas refuse de
  // dessiner (warning OOMGuard à la place). Empêche les heatmaps avec
  // millions de blobs qui bloquent le main thread >10s → ANR / kill OS.
  // 50000 segments × ~10 samples/segment = 500k blobs canvas — déjà long
  // mais survivable. Au-delà = abort avec message clair pour l'user.
  const MAX_SEGMENTS = 50000;

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

    // Downscale pour perf : on travaille sur un canvas avec un cap qui
    // s'adapte à la mémoire device.
    // 🐛 v1.21.3 (audit P0-4) : avant cap fixe 2048×2048 = 16 Mo RGBA →
    // +clone getImageData = 32 Mo → +toDataURL PNG ~10 Mo → pic transitoire
    // ~40 Mo. iPhone PWA budget ~500 Mo → OOM sur plans ≥5000 px. On baisse
    // à 1024 sur device low-mem (deviceMemory < 6 Go ou heuristique mobile).
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

    // Cleanup éventuel — overlay précédent + ObjectURL associé.
    if (_overlay) {
      try { window.map.removeLayer(_overlay); } catch(e) {}
      _overlay = null;
    }
    if (_overlayUrl) {
      try { URL.revokeObjectURL(_overlayUrl); } catch(e) {}
      _overlayUrl = null;
    }

    // 🐛 v1.21.3 (audit P0-4) : on remplace toDataURL → toBlob +
    // URL.createObjectURL. Avant : toDataURL encode synchrone en base64 PNG
    // (~10 Mo de string pour un canvas 2048²) puis Leaflet redécode dans
    // un <img> → pic transitoire ~40 Mo. Avec toBlob, le PNG reste binaire
    // en mémoire (1 seul payload, pas de doublon base64) et l'<img> stream
    // directement depuis l'ObjectURL. Économie typique : ~10 Mo par render.
    canvas.toBlob(function(blob) {
      if (!blob) {
        // Safari iOS peut retourner null sur canvas trop gros (silencieux)
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

  // 🆕 v1.21.3 (KARMA "rajoute le filtre par LVL dans Heatmap si M-LVL actif") :
  // helper qui détermine si un item (point/road/zone/structure) passe le filtre
  // niveau. `levelSet` est un Set<number> | null (null = pas de filtre).
  // Gestion spéciale jonctions interniveau : visible si fromLevel OU toLevel
  // dans le set (cohérent avec le pattern `passeFiltreNiveau` de road.js).
  function _passeFiltreLevel(item, levelSet) {
    if (!levelSet) return true;  // null = pas de filtre
    if (!item) return false;
    // Jonction interniveau
    if (item.type === "jonction") {
      return levelSet.has(item.fromLevel || 0) || levelSet.has(item.toLevel || 0);
    }
    // Item standard
    return levelSet.has(item.level || 0);
  }

  // Helper : itère sur une liste d'items {points:[{x,y}]} ou points uniques {x,y}.
  // 🆕 v1.21.3 : 4e arg `levelSet` filtre par niveau (skip items hors set).
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
    // 🆕 v1.21.3 : levelSet pour filtrage M-LVL. null = pas de filtre (M-LVL
    // off OU user n'a pas restreint). Si présent, ne contient QUE les niveaux
    // cochés par l'user dans la modale heatmap.
    const levelSet = (opts.levels instanceof Set) ? opts.levels : null;

    // 🚶 Tracker timeline — chaîne ordonnée par t. On découpe la timeline
    // en sous-séquences contiguës (= sans recalage / sans gap >5min). À
    // l'intérieur d'une sous-séquence, chaque paire consécutive forme un
    // segment marché.
    //
    //   - "start" : début d'une session, n'est PAS relié au point précédent.
    //   - "recalage" : téléport (recalage manuel sur point) → coupe la chaîne.
    //   - dt > 5min : pause longue → coupe la chaîne (pas de marche continue).
    //   - 🆕 v1.21.3 : level pas dans levelSet → skip entry + casse la chaîne
    //     (équivalent à un saut de niveau, on ne relie pas par un segment).
    if (opts.srcTracker && typeof window.getTrackingTimeline === "function") {
      const timeline = window.getTrackingTimeline() || [];
      const MAX_GAP_MS = 5 * 60 * 1000;  // 5 min
      let prev = null;
      timeline.forEach(function(p) {
        if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
        // Filtre niveau (si actif). Le tracker timeline n'a pas de `type`
        // jonction, donc on teste directement `p.level`.
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
          // Point d'ancrage isolé (début/recalage) — on l'affiche quand même
          // comme un blob, c'est sémantiquement "tu es passé là".
          segs.push({ a: { x: p.x, y: p.y }, b: null });
        }
        prev = p;
      });
    }

    // ✏️ Editor points — points isolés (POIs). Filtre level par point.
    if (opts.srcEditor && typeof window.getEditorPoints === "function") {
      (window.getEditorPoints() || []).forEach(function(p) {
        if (typeof p.x !== "number" || typeof p.y !== "number") return;
        if (!_passeFiltreLevel(p, levelSet)) return;
        segs.push({ a: { x: p.x, y: p.y }, b: null });
      });
    }

    // 🛣️ Tracés session — chaque road est une polyline OUVERTE
    if (opts.srcRoads && typeof window.getRoads === "function") {
      _pushShapesAsSegs(segs, window.getRoads() || [], false, levelSet);
    }

    // ⬛ Zones session — polygones FERMÉS (segment de fermeture last→first)
    if (opts.srcZones && typeof window.getZones === "function") {
      _pushShapesAsSegs(segs, window.getZones() || [], true, levelSet);
    }

    // 🏛️ Structures — mix : piliers (point unique), murs/fronts (polylines)
    if (opts.srcStructures && typeof window.getStructures === "function") {
      _pushShapesAsSegs(segs, window.getStructures() || [], false, levelSet);
    }

    // 📊 Data layers — 4 sous-types filtrables INDÉPENDAMMENT (KARMA "rajoute
    // la possibilité de filter les calque de donnée"). Les 4 registres sont
    // peuplés AU CHARGEMENT du layer dans utils.js > ajouterPointsDepuisJSON,
    // indépendamment du toggle de visibilité — donc inclus même si le data
    // layer est actuellement masqué ("visible ou non").
    //
    // Rétrocompat : l'ancien `opts.srcDataLayers` (1 master toggle) est encore
    // accepté → seed les 4 sous-flags à `true` si non explicitement set. Permet
    // aux _lastOpts d'avant v1.21.2-dl-filter de continuer à fonctionner.
    const _legacyDL = (opts.srcDataLayers === true)
                      && (opts.srcDataPoints     === undefined)
                      && (opts.srcDataRoads      === undefined)
                      && (opts.srcDataZones      === undefined)
                      && (opts.srcDataStructures === undefined);
    const _dlP = _legacyDL ? true : !!opts.srcDataPoints;
    const _dlR = _legacyDL ? true : !!opts.srcDataRoads;
    const _dlZ = _legacyDL ? true : !!opts.srcDataZones;
    const _dlS = _legacyDL ? true : !!opts.srcDataStructures;

    // 📍 Points isolés (markers L.marker en latlng → re-flip vers plan)
    // 🐛 v1.21.2 fix NaN : `window._ktaDataMarkers` est un FLAT array de
    // L.marker (cf. utils.js), pas un objet layerId → markers.
    // 🆕 v1.21.3 : filtre niveau via marker._ktaLevel (cf utils.js > ajouterPointsDepuisJSON).
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
    // 🛣️ Tracés data layer (entry.points en coords plan {x,y}, polylines OUVERTES)
    // 🆕 v1.21.3 : entry.level (cf utils.js) + jonctions (entry.fromLevel/toLevel)
    if (_dlR && Array.isArray(window._ktaDataPolylines)) {
      window._ktaDataPolylines.forEach(function(entry) {
        // Skip les entries "circleMarker d'extrémité jonction" (pas de points)
        if (!entry || !Array.isArray(entry.points)) return;
        if (!_passeFiltreLevel(entry, levelSet)) return;
        _pushPolylineSegs(segs, entry.points, false);
      });
    }
    // ⬛ Zones data layer (polygones FERMÉS)
    if (_dlZ && Array.isArray(window._ktaDataPolygons)) {
      window._ktaDataPolygons.forEach(function(entry) {
        if (!entry || !Array.isArray(entry.points)) return;
        if (!_passeFiltreLevel(entry, levelSet)) return;
        _pushPolylineSegs(segs, entry.points, true);
      });
    }
    // 🏛️ Structures data layer : mix polylines (front-1/2) + polygones
    // (pilier-1/2/mur). Détection via type — cf STRUCTURE_STYLES_DATA
    // utils.js > .isPolyline.
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
    // 🐛 v1.21.3 (audit P0-5) : garde-fou anti-ANR — au-delà de MAX_SEGMENTS,
    // le pipeline canvas génère plusieurs millions de blobs et bloque le
    // main thread >10s. Abort propre avec warning explicite plutôt que kill OS.
    if (segs.length > MAX_SEGMENTS) {
      console.warn("[Heatmap] Refus de rendre " + segs.length + " segments (max " + MAX_SEGMENTS + ")");
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(
          "🔥 Trop d'éléments pour la heatmap (" + segs.length + " > " + MAX_SEGMENTS +
          "). Décoche des sources pour réduire la charge.",
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
    // 🐛 v1.21.3 (audit P0-4) : revoke l'ObjectURL pour libérer le Blob PNG
    // (sans ça, le Blob reste pinné en mémoire tant que le tab vit).
    if (_overlayUrl) {
      try { URL.revokeObjectURL(_overlayUrl); } catch(e) {}
      _overlayUrl = null;
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
    const nDataMarkers = Array.isArray(window._ktaDataMarkers) ? window._ktaDataMarkers.length : 0;
    // 🆕 v1.21.2 (KARMA "rajoute la possibilité de filter les calque de donnée") :
    // 4 compteurs séparés pour cocher/décocher indépendamment points / tracés /
    // zones / structures côté data layer. _ktaDataPolylines peut contenir
    // des "circleMarker d'extrémité jonction" sans `.points` → on les exclut.
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

    // Default values (reprend les opts précédentes si dispo)
    const o = _lastOpts || {};
    const radius    = o.radius    || DEFAULT_RADIUS_PX;
    const intensity = o.intensity || DEFAULT_INTENSITY;
    const srcTracker     = (o.srcTracker     !== undefined) ? o.srcTracker     : (nTracker > 0);
    const srcEditor      = (o.srcEditor      !== undefined) ? o.srcEditor      : (nEditor  > 0);
    const srcRoads       = (o.srcRoads       !== undefined) ? o.srcRoads       : (nRoads   > 0);
    const srcZones       = (o.srcZones       !== undefined) ? o.srcZones       : (nZones   > 0);
    const srcStructures  = (o.srcStructures  !== undefined) ? o.srcStructures  : (nStruct  > 0);
    // 4 sous-flags data layer. Rétrocompat : si _lastOpts a l'ancien
    // srcDataLayers=true (1 master), seed les 4 à true.
    const _legacyDL = (o.srcDataLayers === true)
                      && (o.srcDataPoints     === undefined)
                      && (o.srcDataRoads      === undefined)
                      && (o.srcDataZones      === undefined)
                      && (o.srcDataStructures === undefined);
    const srcDataPoints     = (o.srcDataPoints     !== undefined) ? o.srcDataPoints     : (_legacyDL || nDataMarkers  > 0);
    const srcDataRoads      = (o.srcDataRoads      !== undefined) ? o.srcDataRoads      : (_legacyDL || dlRoads.n     > 0);
    const srcDataZones      = (o.srcDataZones      !== undefined) ? o.srcDataZones      : (_legacyDL || dlZones.n     > 0);
    const srcDataStructures = (o.srcDataStructures !== undefined) ? o.srcDataStructures : (_legacyDL || dlStructs.n   > 0);

    // 🆕 v1.21.3 (KARMA "rajoute le filtre par LVL dans Heatmap si M-LVL actif") :
    // détection M-LVL + construction de la liste des niveaux disponibles.
    // - `availableLevels` : tous les niveaux du plan (cf APP_CONFIG, default [-2..2])
    // - `visibleLevels`   : niveaux actuellement visibles sur la carte (modale Niveaux)
    // - Default des checkboxes : niveaux visibles courants (si dispo dans _lastOpts,
    //   on les reprend pour conserver le choix de l'user entre 2 ouvertures).
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
      // Reprend les niveaux cochés au précédent run si présents, sinon visibles courants
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
            '<div class="kta-heatmap-section-titre">🗺️ Session courante</div>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-tracker"' + (srcTracker && nTracker > 0 ? " checked" : "") + (nTracker === 0 ? " disabled" : "") + '>' +
              '<span>🚶 Tracker (timeline)</span>' +
              '<span class="kta-heatmap-cb-count">' + nTracker + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-editor"' + (srcEditor && nEditor > 0 ? " checked" : "") + (nEditor === 0 ? " disabled" : "") + '>' +
              '<span>✏️ Points ajoutés</span>' +
              '<span class="kta-heatmap-cb-count">' + nEditor + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-roads"' + (srcRoads && nRoads > 0 ? " checked" : "") + (nRoads === 0 ? " disabled" : "") + '>' +
              '<span>🛣️ Tracés</span>' +
              '<span class="kta-heatmap-cb-count">' + nRoads + ' tracé' + (nRoads > 1 ? "s" : "") + ' / ' + nRoadsPts + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-zones"' + (srcZones && nZones > 0 ? " checked" : "") + (nZones === 0 ? " disabled" : "") + '>' +
              '<span>⬛ Zones</span>' +
              '<span class="kta-heatmap-cb-count">' + nZones + ' zone' + (nZones > 1 ? "s" : "") + ' / ' + nZonesPts + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-struct"' + (srcStructures && nStruct > 0 ? " checked" : "") + (nStruct === 0 ? " disabled" : "") + '>' +
              '<span>🏛️ Structures</span>' +
              '<span class="kta-heatmap-cb-count">' + nStruct + ' / ' + nStructPts + ' pts</span>' +
            '</label>' +
          '</div>' +

          '<div class="kta-heatmap-section">' +
            '<div class="kta-heatmap-section-titre" style="display:flex; align-items:center; gap:8px;">' +
              '<span>📊 Calques de données <span style="font-size:10px; color:#8892a4; font-weight:400; text-transform:none; letter-spacing:0;">(visibles ou non)</span></span>' +
              '<button type="button" id="kta-hm-dl-toggleall" style="margin-left:auto; background:transparent; border:1px solid rgba(255,138,92,0.4); color:#ff8a5c; padding:2px 8px; font-size:10px; border-radius:4px; cursor:pointer; text-transform:none; letter-spacing:0; font-weight:600;" title="Tout cocher / décocher les 4 sources data layer">⇅ Tout</button>' +
            '</div>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-data-points"' + (srcDataPoints && nDataMarkers > 0 ? " checked" : "") + (nDataMarkers === 0 ? " disabled" : "") + '>' +
              '<span>📍 Points</span>' +
              '<span class="kta-heatmap-cb-count">' + nDataMarkers + ' pt' + (nDataMarkers > 1 ? "s" : "") + '</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-data-roads"' + (srcDataRoads && dlRoads.n > 0 ? " checked" : "") + (dlRoads.n === 0 ? " disabled" : "") + '>' +
              '<span>🛣️ Tracés</span>' +
              '<span class="kta-heatmap-cb-count">' + dlRoads.n + ' tracé' + (dlRoads.n > 1 ? "s" : "") + ' / ' + dlRoads.pts + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-data-zones"' + (srcDataZones && dlZones.n > 0 ? " checked" : "") + (dlZones.n === 0 ? " disabled" : "") + '>' +
              '<span>⬛ Zones</span>' +
              '<span class="kta-heatmap-cb-count">' + dlZones.n + ' zone' + (dlZones.n > 1 ? "s" : "") + ' / ' + dlZones.pts + ' pts</span>' +
            '</label>' +
            '<label class="kta-heatmap-cb-row">' +
              '<input type="checkbox" id="kta-hm-src-data-struct"' + (srcDataStructures && dlStructs.n > 0 ? " checked" : "") + (dlStructs.n === 0 ? " disabled" : "") + '>' +
              '<span>🏛️ Structures</span>' +
              '<span class="kta-heatmap-cb-count">' + dlStructs.n + ' / ' + dlStructs.pts + ' pts</span>' +
            '</label>' +
          '</div>' +

          // 🆕 v1.21.3 (KARMA "rajoute le filtre par LVL dans Heatmap si M-LVL actif") :
          // section "Niveaux" rendue UNIQUEMENT si multiLevel actif. Cases
          // pré-cochées sur les niveaux actuellement visibles (cohérent avec
          // la modale "Niveaux" globale de l'app).
          (_isMultiLevel ?
            '<div class="kta-heatmap-section">' +
              '<div class="kta-heatmap-section-titre" style="display:flex; align-items:center; gap:8px;">' +
                '<span>🏗️ Niveaux à inclure</span>' +
                '<button type="button" id="kta-hm-lvl-toggleall" style="margin-left:auto; background:transparent; border:1px solid rgba(255,138,92,0.4); color:#ff8a5c; padding:2px 8px; font-size:10px; border-radius:4px; cursor:pointer; text-transform:none; letter-spacing:0; font-weight:600;" title="Tout cocher / décocher les niveaux">⇅ Tout</button>' +
              '</div>' +
              '<div class="kta-heatmap-levels-row" style="display:flex; flex-wrap:wrap; gap:6px 10px; padding:4px 0;">' +
                _availableLevels.map(function(lvl) {
                  const isChecked = _defaultLevelsSet && _defaultLevelsSet.has(lvl);
                  const lblTxt = (lvl === 0) ? "RDC" : (lvl > 0 ? "+" + lvl : String(lvl));
                  return '<label class="kta-heatmap-level-chip" style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(244,197,66,0.06); border:1px solid rgba(244,197,66,0.20); border-radius:14px; cursor:pointer; font-size:12px;">' +
                           '<input type="checkbox" data-level="' + lvl + '" class="kta-hm-lvl-cb"' + (isChecked ? " checked" : "") + '>' +
                           '<span>Niv ' + lblTxt + '</span>' +
                         '</label>';
                }).join("") +
              '</div>' +
              '<p style="font-size:11px; color:#8892a4; font-style:italic; margin:6px 0 0; line-height:1.4;">' +
                'Filtre cumulé avec les sources ci-dessus. Une jonction interniveau est incluse si AU MOINS un de ses 2 niveaux est coché.' +
              '</p>' +
            '</div>'
            : '') +

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

    // 🆕 v1.21.2 : bouton "⇅ Tout" toggle global des 4 sous-cases data layer.
    // Si au moins une case est cochée → tout décocher. Sinon → tout cocher
    // (en respectant les disabled = on ne force pas une case sans données).
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

    // 🆕 v1.21.3 : bouton "⇅ Tout" toggle des niveaux (M-LVL). Même pattern
    // que le toggle data layers ci-dessus.
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
      // 🆕 v1.21.2 : sources session (roads/zones/structures) + 4 sous-flags
      // data layer indépendants (points/tracés/zones/structures). Les .checked
      // sont guardés via `?.` car la checkbox peut être disabled / absente
      // si la catégorie est vide (cf. rendu conditionnel ci-dessus).
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
      // 🆕 v1.21.3 : si M-LVL actif, lit les checkboxes niveau et construit
      // un Set passé au collecteur. Si l'user a tout décoché, on envoie un
      // Set vide → aucun niveau → heatmap vide (toast warning naturel).
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
