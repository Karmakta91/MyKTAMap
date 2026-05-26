/*!
 * MyKTAMap — Statistiques globales du plan
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// STATSGLOBALES.JS — Modale de stats agrégées du plan (depuis v1.20.0)
// =========================
// Différent de la modale 📊 Détails session (qui couvre la SESSION active,
// = annotations en RAM + photos IDB + backups). Cette modale couvre LE PLAN
// dans son ENSEMBLE : session + data layers embedded.
//
// Sections affichées :
//   📍 Points        : total + breakdown par tag (avec icônes)
//   🛣️ Tracés        : total + distance cumulée par type (auto m/km)
//   ⬛ Zones         : total + surface cumulée par type (auto m²/ha)
//   🏛️ Structures   : total + breakdown par type
//   📸 Photos        : N photos POI attachées (depuis IDB)
//   🌐 Géoréf        : statut + coords si présent
//   🏗️ Multi-niveau : breakdown par niveau (si M-LVL actif)
//
// Use cases :
//   - Évaluer une carrière dans son ensemble avant une sortie
//   - Stats à partager (bouton 📋 Copier le rapport)
//   - Comprendre la composition d'un plan partagé reçu
//
// API : window.StatsGlobales = { ouvrir, fermer, compute, getReportText }
// =========================

(function() {
  "use strict";

  const MODAL_ID = "kta-stats-globales-modal";

  // ───────── HELPERS ─────────
  function _escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function(c) {
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" })[c];
    });
  }

  function _formatDist(m) {
    if (typeof window.formatDistance === "function") return window.formatDistance(m, 1);
    if (m >= 1000) return (m / 1000).toFixed(2) + " km";
    return m.toFixed(1) + " m";
  }

  function _formatSurf(m2) {
    if (typeof window.formatSurface === "function") return window.formatSurface(m2, 1);
    if (m2 >= 10000) return (m2 / 10000).toFixed(2) + " ha";
    if (m2 < 100) return m2.toFixed(1) + " m²";
    return Math.round(m2) + " m²";
  }

  function _polylinePxLength(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
  }

  function _polygonAreaPx(points) {
    if (typeof window.polygonArea === "function") return window.polygonArea(points);
    // Shoelace fallback
    if (!Array.isArray(points) || points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  function _scalePxPerM() {
    return (window.APP_CONFIG && window.APP_CONFIG.scale) || 1;
  }

  // ───────── 🆕 v1.21.0 : CAMEMBERTS SVG INLINE ─────────
  //
  // KARMA : "Camembert pour breakdown par type (Recommandé)".
  // SVG natif (0 dep externe). Coloration via palette charte cohérente
  // avec les rendus carte. Layout : camembert à gauche + légende à droite.
  //
  // Palettes par catégorie alignées sur les rendus Leaflet (cf road.js,
  // zones.js, structures.js) + utils.js pour data layers.

  const _PALETTE_ROADS = {
    principal:  "#00ff00",
    secondaire: "#b000ff",
    chemin:     "#ffff00",
    jonction:   "#ff4ecb",
    itinerary:  "#00d4ff"  // cyan néon iti (au cas où)
  };
  const _PALETTE_ZONES = {
    eau:           "#3aa9e8",
    remblais:      "#5a5a68",
    effondrement:  "#ff3333",
    inaccessible:  "#7a0000"
  };
  const _PALETTE_STRUCTS = {
    "pilier-1": "#f4c542",
    "pilier-2": "#ff9933",
    "mur":      "#1e3a8a",
    "front-1":  "#f4c542",  // même que pilier-1 (alignement charte v1.10.1-hotfix2)
    "front-2":  "#ff9933"   // même que pilier-2
  };
  // Palette générique pour points par tag (10 couleurs cycle via hash djb2)
  const _PALETTE_TAGS = [
    "#f4c542", "#8cb4ff", "#6ee287", "#ff8c8c", "#ff4ecb",
    "#00d4ff", "#a78bfa", "#ffb380", "#34d399", "#c9b88f"
  ];

  // djb2 — déterministe pour qu'un même tag ait toujours la même couleur
  function _djb2Hash(str) {
    let h = 5381;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return Math.abs(h | 0);
  }

  function _colorForKey(category, key) {
    // 🐛 v1.21.4 (KARMA "même couler entre route principal et jonction de
    // niveau") : accepte aussi les alias LegendCustomization ("traces"
    // alias de "roads", "icones" alias de "tags") pour résilience.
    // Avant : ma modale Profil envoyait "traces" → mismatch palette →
    // fallback hash → collision possible principal/jonction (même hash %10).
    if ((category === "roads"  || category === "traces") && _PALETTE_ROADS[key])   return _PALETTE_ROADS[key];
    if (category === "zones"      && _PALETTE_ZONES[key])      return _PALETTE_ZONES[key];
    if (category === "structures" && _PALETTE_STRUCTS[key])    return _PALETTE_STRUCTS[key];
    // Fallback : palette générique cycle via hash
    return _PALETTE_TAGS[_djb2Hash(key) % _PALETTE_TAGS.length];
  }

  // Resolve label via LegendCustomization si dispo (cascade session > plan > default).
  // Cohérent avec le helper _lcLabel de refonteInterface.js (v1.20.0-fix2).
  function _lcLabelStat(category, type, fallback) {
    if (typeof type !== "string" || !type) return fallback || "?";
    // Entrée custom (cust-XYZ) : préfixe ✨
    if (type.indexOf("cust-") === 0) {
      if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
        try {
          const e = window.LegendCustomization.findCustomEntry(type);
          if (e && e.label) return "✨ " + e.label;
        } catch(err) {}
      }
      return fallback || type;
    }
    // Built-in cascade
    if (window.LegendCustomization && typeof window.LegendCustomization.getLabel === "function") {
      try {
        // Mapping category statsGlobales → LC category
        const lcCat = (category === "roads") ? "traces"
                    : (category === "tags")  ? "icones"
                    : category;
        const lbl = window.LegendCustomization.getLabel(lcCat, type);
        if (lbl) return lbl;
      } catch(err) {}
    }
    return fallback || type;
  }

  // 🆕 v1.21.5-fix1 (KARMA "en stat général, on doit toujours prendre la
  // valeur par default") : helper qui retourne le label par défaut UNIQUEMENT
  // (court-circuite la cascade session > plan > default de LegendCustomization).
  // Utilisé dans le rendu camemberts cross-plan home : l'user a pu renommer
  // "principal" → "route de surface" sur le plan A, mais sur la modale Profil
  // home on agrège plusieurs plans → afficher des labels génériques cohérents.
  function _defaultLabelStat(category, type, fallback) {
    if (typeof type !== "string" || !type) return fallback || "?";
    // Entrée custom (cust-XYZ) : préfixe ✨ — même traitement que _lcLabelStat
    // car les customs n'ont JAMAIS de version "default" (ils sont par essence
    // personnalisés). Le préfixe ✨ signale visuellement l'origine.
    if (type.indexOf("cust-") === 0) {
      if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
        try {
          const e = window.LegendCustomization.findCustomEntry(type);
          if (e && e.label) return "✨ " + e.label;
        } catch(err) {}
      }
      return fallback || type;
    }
    // Built-in : on prend STRICTEMENT le DEFAULT_LABELS du module, jamais le
    // session.labels ni le plan.labels.
    if (window.LegendCustomization && typeof window.LegendCustomization.getDefaultLabel === "function") {
      try {
        const lcCat = (category === "roads") ? "traces"
                    : (category === "tags")  ? "icones"
                    : category;
        const lbl = window.LegendCustomization.getDefaultLabel(lcCat, type);
        if (lbl) return lbl;
      } catch(err) {}
    }
    return fallback || type;
  }

  /**
   * Génère un camembert SVG inline + légende textuelle à droite.
   * @param {Object}  data              - {key: count, ...}
   * @param {String}  category          - "roads"|"zones"|"structures"|"tags" (palette + labels)
   * @param {Number}  size              - taille en px (recommandé 160)
   * @param {Boolean} useDefaultLabels  - 🆕 v1.21.5-fix1 : si true, force les labels
   *                                       par défaut (bypass LC cascade). Utile cross-plan.
   * @returns {String} HTML <div> contenant SVG + légende
   */
  function _renderPieChart(data, category, size, useDefaultLabels) {
    size = size || 160;
    const r = size / 2 - 4;        // rayon (avec marge)
    const cx = size / 2;
    const cy = size / 2;
    const keys = Object.keys(data || {});
    if (keys.length === 0) return "";
    const total = keys.reduce(function(s, k) { return s + (data[k] || 0); }, 0);
    if (total === 0) return "";

    // Tri desc par count (le plus gros slice en premier visuellement)
    const sortedKeys = keys.slice().sort(function(a, b) { return (data[b] || 0) - (data[a] || 0); });

    // Cas 1 seul slice : cercle plein (le path SVG arc dégénère à 360°)
    let svgSlices = "";
    if (sortedKeys.length === 1) {
      const k0 = sortedKeys[0];
      const color = _colorForKey(category, k0);
      svgSlices = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>';
    } else {
      let startAngle = -Math.PI / 2;  // démarre en haut (12h)
      sortedKeys.forEach(function(k) {
        const pct = (data[k] || 0) / total;
        const endAngle = startAngle + pct * 2 * Math.PI;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
        const color = _colorForKey(category, k);
        svgSlices += '<path d="M ' + cx.toFixed(2) + ' ' + cy.toFixed(2) +
                     ' L ' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
                     ' A ' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 ' + largeArc + ' 1 ' +
                     x2.toFixed(2) + ' ' + y2.toFixed(2) +
                     ' Z" fill="' + color + '" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>';
        startAngle = endAngle;
      });
    }

    // Légende à droite : swatch + label + count + pct
    // 🆕 v1.21.5-fix1 : si useDefaultLabels === true (cross-plan home),
    // on bypass la cascade LC pour afficher les labels génériques cohérents
    // entre plans (sinon le renommage local d'un plan A polluerait l'agrégat).
    const _labelFn = useDefaultLabels ? _defaultLabelStat : _lcLabelStat;
    let legend = '<div class="kta-stats-glob-pie-legend">';
    sortedKeys.forEach(function(k) {
      const n = data[k] || 0;
      const pct = ((n / total) * 100).toFixed(1);
      const color = _colorForKey(category, k);
      const lbl = _labelFn(category, k, k);
      legend += '<div class="kta-stats-glob-pie-legend-row">' +
                  '<span class="kta-stats-glob-pie-legend-swatch" style="background:' + color + ';"></span>' +
                  '<span class="kta-stats-glob-pie-legend-lbl">' + _escapeHtml(lbl) + '</span>' +
                  '<span class="kta-stats-glob-pie-legend-num">' + n + ' <span class="kta-stats-glob-pie-legend-pct">(' + pct + '%)</span></span>' +
                '</div>';
    });
    legend += '</div>';

    return '<div class="kta-stats-glob-pie-wrap">' +
             '<svg class="kta-stats-glob-pie-svg" viewBox="0 0 ' + size + ' ' + size +
                  '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
               svgSlices +
             '</svg>' +
             legend +
           '</div>';
  }

  // ───────── COLLECTE ─────────

  /**
   * Agrège tout le plan (session + data layers embedded).
   * @returns {Promise<StatsReport>}
   */
  async function compute() {
    const planId   = window._currentLoadedPlanId || null;
    const planConf = window.PLAN_CONFIG || {};
    const planMeta = planConf.plan || {};
    const scale    = _scalePxPerM();

    // Points
    const sessionPts  = (typeof window.getEditorPoints      === "function") ? (window.getEditorPoints()      || []) : [];
    const embeddedPts = (typeof window.getAllEmbeddedPoints === "function") ? (window.getAllEmbeddedPoints() || []) : [];
    const allPoints   = sessionPts.concat(embeddedPts);

    // Tracés (roads)
    const sessionRoads  = (typeof window.getRoads             === "function") ? (window.getRoads()             || []) : [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads  === "function") ? (window.getAllEmbeddedRoads()  || []) : [];
    const allRoads      = sessionRoads.concat(embeddedRoads);

    // Zones
    const sessionZones  = (typeof window.getZones             === "function") ? (window.getZones()             || []) : [];
    const embeddedZones = (typeof window.getAllEmbeddedZones  === "function") ? (window.getAllEmbeddedZones()  || []) : [];
    const allZones      = sessionZones.concat(embeddedZones);

    // Structures
    const sessionStructs  = (typeof window.getStructures            === "function") ? (window.getStructures()            || []) : [];
    const embeddedStructs = (typeof window.getAllEmbeddedStructures === "function") ? (window.getAllEmbeddedStructures() || []) : [];
    const allStructs      = sessionStructs.concat(embeddedStructs);

    // === Aggregations ===

    // Points : breakdown par tag
    const pointsByTag = {};
    allPoints.forEach(function(p) {
      const tag = (Array.isArray(p.tags) && p.tags[0]) ? p.tags[0] : "default";
      pointsByTag[tag] = (pointsByTag[tag] || 0) + 1;
    });

    // Tracés : breakdown par type + distance cumulée
    const roadsByType = {};
    const roadsDistByType = {};   // px
    allRoads.forEach(function(r) {
      if (!r || !Array.isArray(r.points)) return;
      const type = r.type || "?";
      roadsByType[type] = (roadsByType[type] || 0) + 1;
      roadsDistByType[type] = (roadsDistByType[type] || 0) + _polylinePxLength(r.points);
    });
    // Convert px → m
    const roadsDistByTypeM = {};
    Object.keys(roadsDistByType).forEach(function(t) {
      roadsDistByTypeM[t] = scale > 0 ? roadsDistByType[t] / scale : 0;
    });
    const roadsTotalDistM = Object.keys(roadsDistByTypeM).reduce(function(s, t) {
      return s + roadsDistByTypeM[t];
    }, 0);

    // Zones : breakdown par type + surface cumulée
    const zonesByType = {};
    const zonesAreaByType = {};   // px²
    allZones.forEach(function(z) {
      if (!z || !Array.isArray(z.points)) return;
      const type = z.type || "?";
      zonesByType[type] = (zonesByType[type] || 0) + 1;
      zonesAreaByType[type] = (zonesAreaByType[type] || 0) + _polygonAreaPx(z.points);
    });
    const zonesAreaByTypeM2 = {};
    Object.keys(zonesAreaByType).forEach(function(t) {
      zonesAreaByTypeM2[t] = scale > 0 ? zonesAreaByType[t] / (scale * scale) : 0;
    });
    const zonesTotalAreaM2 = Object.keys(zonesAreaByTypeM2).reduce(function(s, t) {
      return s + zonesAreaByTypeM2[t];
    }, 0);

    // Structures : breakdown par type
    const structsByType = {};
    allStructs.forEach(function(s) {
      const type = s.type || "?";
      structsByType[type] = (structsByType[type] || 0) + 1;
    });

    // Multi-niveau breakdown (si actif)
    let multiLevelBreakdown = null;
    if (planMeta.multiLevel === true) {
      multiLevelBreakdown = {};
      function _addLvl(lvl, key) {
        const k = (lvl != null) ? String(lvl) : "0";
        if (!multiLevelBreakdown[k]) multiLevelBreakdown[k] = { points: 0, roads: 0, zones: 0, structures: 0 };
        multiLevelBreakdown[k][key] = (multiLevelBreakdown[k][key] || 0) + 1;
      }
      allPoints.forEach(function(p) { _addLvl(p.level, "points"); });
      allRoads.forEach(function(r) {
        if (r.type === "jonction") {
          // Jonction concerne 2 niveaux — on compte sur le max (cf §26.3 CLAUDE)
          const lvl = Math.max(r.fromLevel || 0, r.toLevel || 0);
          _addLvl(lvl, "roads");
        } else {
          _addLvl(r.level, "roads");
        }
      });
      allZones.forEach(function(z)   { _addLvl(z.level, "zones");      });
      allStructs.forEach(function(s) { _addLvl(s.level, "structures"); });
    }

    // Photos POI (async via IDB)
    let photosCount = 0;
    let photosBytes = 0;
    try {
      if (window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.getAllPhotosForPlan === "function" && planId) {
        const arr = await window.MyKTAMapPhotos.getAllPhotosForPlan(planId);
        if (Array.isArray(arr)) {
          photosCount = arr.length;
          arr.forEach(function(p) { photosBytes += (p.size || 0); });
        }
      }
    } catch(e) { /* silent */ }

    // Géoréférencement
    const georef = planMeta.georef || null;

    return {
      timestamp:    new Date().toISOString(),
      planId:       planId,
      planMeta:     {
        name:       planMeta.name       || "(sans nom)",
        version:    planMeta.version    || "",
        author:     planMeta.author     || "",
        imageW:     planMeta.imageWidth  || null,
        imageH:     planMeta.imageHeight || null,
        multiLevel: planMeta.multiLevel === true,
        tiledV2:    planMeta.tiledV2    === true,
        scale:      scale
      },
      totals: {
        points:     allPoints.length,
        roads:      allRoads.length,
        zones:      allZones.length,
        structures: allStructs.length,
        photos:     photosCount
      },
      session: {
        points:     sessionPts.length,
        roads:      sessionRoads.length,
        zones:      sessionZones.length,
        structures: sessionStructs.length
      },
      embedded: {
        points:     embeddedPts.length,
        roads:      embeddedRoads.length,
        zones:      embeddedZones.length,
        structures: embeddedStructs.length
      },
      pointsByTag:     pointsByTag,
      roadsByType:     roadsByType,
      roadsDistByTypeM:  roadsDistByTypeM,
      roadsTotalDistM:   roadsTotalDistM,
      zonesByType:     zonesByType,
      zonesAreaByTypeM2: zonesAreaByTypeM2,
      zonesTotalAreaM2:  zonesTotalAreaM2,
      structsByType:   structsByType,
      multiLevelBreakdown: multiLevelBreakdown,
      photos: {
        count: photosCount,
        bytes: photosBytes
      },
      georef: georef
    };
  }

  // ───────── RENDER UI ─────────

  function _renderHtml(rep) {
    const t = rep.totals;
    const meta = rep.planMeta;
    let html = "";

    // Header plan
    html += '<div class="kta-stats-glob-header">';
    html += '<div class="kta-stats-glob-plan-name">' + _escapeHtml(meta.name);
    if (meta.version) html += ' <span class="kta-stats-glob-dim">' + _escapeHtml(meta.version) + '</span>';
    html += '</div>';
    if (meta.author) html += '<div class="kta-stats-glob-meta">par ' + _escapeHtml(meta.author) + '</div>';
    html += '<div class="kta-stats-glob-meta">';
    if (meta.imageW && meta.imageH) html += '📐 ' + meta.imageW + ' × ' + meta.imageH + ' px';
    if (meta.scale && meta.scale !== 1) html += ' &middot; ' + meta.scale.toFixed(1) + ' px/m';
    if (meta.multiLevel) html += ' &middot; 🏗️ Multi-niveau';
    if (meta.tiledV2)    html += ' &middot; 🧱 V2 tuilé';
    html += '</div>';
    html += '</div>';

    // Totaux
    html += '<div class="kta-stats-glob-grid">';
    html += _statCard("📍", t.points,     "point" + (t.points     > 1 ? "s" : ""),     rep.session.points,     rep.embedded.points);
    html += _statCard("🛣️", t.roads,      "tracé" + (t.roads      > 1 ? "s" : ""),     rep.session.roads,      rep.embedded.roads);
    html += _statCard("⬛", t.zones,      "zone"  + (t.zones      > 1 ? "s" : ""),     rep.session.zones,      rep.embedded.zones);
    html += _statCard("🏛️", t.structures, "structure" + (t.structures > 1 ? "s" : ""), rep.session.structures, rep.embedded.structures);
    if (t.photos > 0) {
      const sz = rep.photos.bytes > 0 ? (rep.photos.bytes / 1024 / 1024).toFixed(1) + " MB" : "";
      html += '<div class="kta-stats-glob-card"><div class="kta-stats-glob-card-num">' + t.photos + '</div>' +
              '<div class="kta-stats-glob-card-label">📸 photo' + (t.photos > 1 ? "s" : "") + '</div>' +
              (sz ? '<div class="kta-stats-glob-card-sub">' + sz + '</div>' : '') +
              '</div>';
    }
    html += '</div>';

    // Points par tag — 🆕 v1.21.0 : camembert SVG inline + légende
    if (t.points > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">📍 Points par tag</div>';
      html += _renderPieChart(rep.pointsByTag, "tags", 160);
      html += '</div>';
    }

    // Tracés par type + distance — 🆕 v1.21.0 : camembert SVG inline (count) +
    // liste détaillée avec distance cumulée par type (l'info distance reste utile,
    // pas représentable par le camembert qui ne montre que le count).
    if (t.roads > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🛣️ Tracés ' +
              '<span class="kta-stats-glob-total">' + _formatDist(rep.roadsTotalDistM) + ' cumulés</span></div>';
      html += _renderPieChart(rep.roadsByType, "roads", 160);
      html += '<div class="kta-stats-glob-list kta-stats-glob-list-compact">';
      const sortedTypes = Object.keys(rep.roadsByType).sort(function(a, b) {
        return rep.roadsByType[b] - rep.roadsByType[a];
      });
      sortedTypes.forEach(function(type) {
        const n = rep.roadsByType[type];
        const d = rep.roadsDistByTypeM[type] || 0;
        html += '<div class="kta-stats-glob-row">' +
                  '<span class="kta-stats-glob-row-lbl">' + _escapeHtml(_lcLabelStat("roads", type, type)) + '</span>' +
                  '<span class="kta-stats-glob-row-num">' + n + ' &middot; ' + _formatDist(d) + '</span>' +
                '</div>';
      });
      html += '</div></div>';
    }

    // Zones par type + surface — idem : camembert + liste détaillée
    if (t.zones > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">⬛ Zones ' +
              '<span class="kta-stats-glob-total">' + _formatSurf(rep.zonesTotalAreaM2) + ' cumulés</span></div>';
      html += _renderPieChart(rep.zonesByType, "zones", 160);
      html += '<div class="kta-stats-glob-list kta-stats-glob-list-compact">';
      Object.keys(rep.zonesByType).sort(function(a, b) {
        return rep.zonesByType[b] - rep.zonesByType[a];
      }).forEach(function(type) {
        const n = rep.zonesByType[type];
        const s = rep.zonesAreaByTypeM2[type] || 0;
        html += '<div class="kta-stats-glob-row">' +
                  '<span class="kta-stats-glob-row-lbl">' + _escapeHtml(_lcLabelStat("zones", type, type)) + '</span>' +
                  '<span class="kta-stats-glob-row-num">' + n + ' &middot; ' + _formatSurf(s) + '</span>' +
                '</div>';
      });
      html += '</div></div>';
    }

    // Structures par type — camembert seul (pas d'info distance/surface cumulée
    // distincte par type ici, déjà couverte par la liste de la modale Détails session)
    if (t.structures > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🏛️ Structures</div>';
      html += _renderPieChart(rep.structsByType, "structures", 160);
      html += '</div>';
    }

    // Multi-niveau
    if (rep.multiLevelBreakdown) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🏗️ Breakdown par niveau</div>';
      html += '<div class="kta-stats-glob-list">';
      const lvlKeys = Object.keys(rep.multiLevelBreakdown).sort(function(a, b) {
        return parseInt(a, 10) - parseInt(b, 10);
      });
      lvlKeys.forEach(function(k) {
        const b = rep.multiLevelBreakdown[k];
        const total = b.points + b.roads + b.zones + b.structures;
        if (total === 0) return;
        const parts = [];
        if (b.points     > 0) parts.push('📍 ' + b.points);
        if (b.roads      > 0) parts.push('🛣️ ' + b.roads);
        if (b.zones      > 0) parts.push('⬛ ' + b.zones);
        if (b.structures > 0) parts.push('🏛️ ' + b.structures);
        html += '<div class="kta-stats-glob-row">' +
                  '<span class="kta-stats-glob-row-lbl">Niveau ' + _escapeHtml(k) + '</span>' +
                  '<span class="kta-stats-glob-row-num">' + parts.join(' &middot; ') + '</span>' +
                '</div>';
      });
      html += '</div></div>';
    }

    // Géoréférencement
    if (rep.georef && rep.georef.pointA && rep.georef.pointB) {
      const a = rep.georef.pointA;
      const b = rep.georef.pointB;
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🌐 Géoréférencement</div>';
      html += '<div class="kta-stats-glob-list">';
      html += '<div class="kta-stats-glob-row"><span class="kta-stats-glob-row-lbl">Point A</span>' +
                '<span class="kta-stats-glob-row-num">px (' + a.x + ', ' + a.y + ') &harr; (' + a.lat + ', ' + a.lng + ')</span></div>';
      html += '<div class="kta-stats-glob-row"><span class="kta-stats-glob-row-lbl">Point B</span>' +
                '<span class="kta-stats-glob-row-num">px (' + b.x + ', ' + b.y + ') &harr; (' + b.lat + ', ' + b.lng + ')</span></div>';
      html += '</div></div>';
    }

    return html;
  }

  function _statCard(emoji, num, label, sessionN, embeddedN) {
    let sub = "";
    if (sessionN > 0 && embeddedN > 0) {
      sub = '<div class="kta-stats-glob-card-sub">' + sessionN + ' session · ' + embeddedN + ' embed</div>';
    } else if (sessionN > 0) {
      sub = '<div class="kta-stats-glob-card-sub">' + sessionN + ' session</div>';
    } else if (embeddedN > 0) {
      sub = '<div class="kta-stats-glob-card-sub">' + embeddedN + ' embed</div>';
    }
    return '<div class="kta-stats-glob-card">' +
             '<div class="kta-stats-glob-card-num">' + num + '</div>' +
             '<div class="kta-stats-glob-card-label">' + emoji + ' ' + label + '</div>' +
             sub +
           '</div>';
  }

  // ───────── REPORT TEXT (pour bouton Copier) ─────────
  function getReportText(rep) {
    if (!rep) return "";
    const t = rep.totals;
    const meta = rep.planMeta;
    const lines = [];
    lines.push("=========================================");
    lines.push("MyKTAMap — Statistiques globales du plan");
    lines.push("=========================================");
    lines.push("📦 Plan        : " + meta.name + " " + meta.version);
    if (meta.author) lines.push("👤 Auteur       : " + meta.author);
    if (meta.imageW && meta.imageH) lines.push("📐 Dimensions   : " + meta.imageW + " × " + meta.imageH + " px");
    if (meta.scale && meta.scale !== 1) lines.push("📏 Échelle      : " + meta.scale.toFixed(1) + " px/m");
    if (meta.multiLevel) lines.push("🏗️  Multi-niveau : ON");
    if (meta.tiledV2)    lines.push("🧱 V2 tuilé     : ON");
    lines.push("📅 Capturé le   : " + new Date(rep.timestamp).toLocaleString("fr-FR"));
    lines.push("");

    lines.push("📊 TOTAUX (session + embedded)");
    lines.push("─────────────────────────────────────────");
    lines.push("📍 Points      : " + t.points + "  (" + rep.session.points + " session + " + rep.embedded.points + " embed)");
    lines.push("🛣️  Tracés      : " + t.roads  + "  (" + rep.session.roads  + " session + " + rep.embedded.roads  + " embed)  → " + _formatDist(rep.roadsTotalDistM));
    lines.push("⬛ Zones       : " + t.zones  + "  (" + rep.session.zones  + " session + " + rep.embedded.zones  + " embed)  → " + _formatSurf(rep.zonesTotalAreaM2));
    lines.push("🏛️  Structures  : " + t.structures + "  (" + rep.session.structures + " session + " + rep.embedded.structures + " embed)");
    lines.push("📸 Photos POI  : " + t.photos);
    lines.push("");

    if (t.points > 0) {
      lines.push("📍 POINTS PAR TAG");
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.pointsByTag).sort(function(a, b) {
        return rep.pointsByTag[b] - rep.pointsByTag[a];
      }).forEach(function(tag) {
        lines.push("  " + (rep.pointsByTag[tag] + "").padStart(5, " ") + "  " + tag);
      });
      lines.push("");
    }

    if (t.roads > 0) {
      lines.push("🛣️  TRACÉS PAR TYPE (n · distance)");
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.roadsByType).sort().forEach(function(type) {
        lines.push("  " + type.padEnd(14, " ") + "  " + (rep.roadsByType[type] + "").padStart(4, " ") +
                   "  " + _formatDist(rep.roadsDistByTypeM[type] || 0));
      });
      lines.push("");
    }

    if (t.zones > 0) {
      lines.push("⬛ ZONES PAR TYPE (n · surface)");
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.zonesByType).sort().forEach(function(type) {
        lines.push("  " + type.padEnd(14, " ") + "  " + (rep.zonesByType[type] + "").padStart(4, " ") +
                   "  " + _formatSurf(rep.zonesAreaByTypeM2[type] || 0));
      });
      lines.push("");
    }

    if (t.structures > 0) {
      lines.push("🏛️  STRUCTURES PAR TYPE");
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.structsByType).sort().forEach(function(type) {
        lines.push("  " + type.padEnd(14, " ") + "  " + rep.structsByType[type]);
      });
      lines.push("");
    }

    if (rep.multiLevelBreakdown) {
      lines.push("🏗️  BREAKDOWN PAR NIVEAU");
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.multiLevelBreakdown).sort(function(a, b) {
        return parseInt(a, 10) - parseInt(b, 10);
      }).forEach(function(k) {
        const b = rep.multiLevelBreakdown[k];
        lines.push("  Niveau " + k + " : 📍" + b.points + " 🛣️" + b.roads +
                   " ⬛" + b.zones + " 🏛️" + b.structures);
      });
      lines.push("");
    }

    lines.push("=========================================");
    return lines.join("\n");
  }

  // ───────── MODALE ─────────
  let _lastReport = null;

  async function _refreshAndRender() {
    const corps = document.getElementById("kta-stats-glob-corps");
    if (!corps) return;
    corps.innerHTML = '<div class="kta-stats-glob-loading">⏳ Calcul en cours…</div>';
    try {
      _lastReport = await compute();
      corps.innerHTML = _renderHtml(_lastReport);
    } catch(e) {
      corps.innerHTML = '<div class="kta-mem-warn">❌ Erreur : ' + _escapeHtml(e.message || e) + '</div>';
    }
  }

  function ouvrir() {
    fermer();
    const overlay = document.createElement("div");
    overlay.id        = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-stats-glob-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📊 Statistiques du plan</span>' +
          '<button type="button" class="kta-panneau-close" id="kta-stats-glob-close" aria-label="Fermer">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" id="kta-stats-glob-corps">' +
          '<div class="kta-stats-glob-loading">⏳ Calcul en cours…</div>' +
        '</div>' +
        '<div class="kta-readme-modal-footer kta-stats-glob-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-stats-glob-refresh">🔄 Rafraîchir</button>' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-stats-glob-csv">📊 Export CSV</button>' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-stats-glob-pdf">📤 Export PDF</button>' +
          '<button type="button" class="kta-btn kta-btn-primary" id="kta-stats-glob-copy">📋 Copier le rapport</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-stats-glob-close").addEventListener("click", fermer);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) fermer(); });
    document.addEventListener("keydown", _onEscape);
    document.getElementById("kta-stats-glob-refresh").addEventListener("click", _refreshAndRender);
    document.getElementById("kta-stats-glob-copy").addEventListener("click", function() {
      if (!_lastReport) return;
      const txt = getReportText(_lastReport);
      _copyToClipboard(txt).then(function() {
        const btn = document.getElementById("kta-stats-glob-copy");
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = "✅ Copié !";
          setTimeout(function() { if (btn) btn.textContent = orig; }, 1800);
        }
      }).catch(function(e) { alert("Échec copie : " + (e.message || e)); });
    });

    // 🆕 v1.21.0 — Bouton Export CSV (ZIP 4 fichiers : points/roads/zones/structures).
    document.getElementById("kta-stats-glob-csv").addEventListener("click", function() {
      const btn = document.getElementById("kta-stats-glob-csv");
      const orig = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = "⏳ Génération…"; }
      exportToCSV().then(function() {
        if (btn) {
          btn.textContent = "✅ ZIP téléchargé";
          setTimeout(function() { if (btn) { btn.textContent = orig; btn.disabled = false; } }, 1800);
        }
      }).catch(function(e) {
        if (btn) { btn.textContent = orig; btn.disabled = false; }
        alert("Échec génération CSV : " + (e.message || e));
      });
    });

    // 🆕 v1.21.0 — Bouton Export PDF (A4 portrait, texte/tableaux seuls).
    document.getElementById("kta-stats-glob-pdf").addEventListener("click", function() {
      if (!_lastReport) {
        alert("Aucune donnée à exporter — rafraîchis d'abord.");
        return;
      }
      const btn = document.getElementById("kta-stats-glob-pdf");
      const orig = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = "⏳ Génération…"; }
      exportToPDF({ report: _lastReport }).then(function(res) {
        if (btn) {
          btn.textContent = "✅ PDF téléchargé";
          setTimeout(function() { if (btn) { btn.textContent = orig; btn.disabled = false; } }, 1800);
        }
      }).catch(function(e) {
        if (btn) { btn.textContent = orig; btn.disabled = false; }
        alert("Échec génération PDF : " + (e.message || e));
      });
    });

    _refreshAndRender();
  }

  function _onEscape(e) {
    if (e.key === "Escape" || e.key === "Esc") fermer();
  }

  function fermer() {
    document.removeEventListener("keydown", _onEscape);
    const ex = document.getElementById(MODAL_ID);
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
  }

  function _copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error("execCommand copy failed"));
      } catch(e) { reject(e); }
    });
  }

  // ───────── EXPORT PDF (v1.21.0) ─────────
  //
  // Format A4 portrait via jsPDF (déjà chargé par pdfExport.js / index.html).
  // Texte/tableaux uniquement, pas de rendu de carte (= cf v1.21.0 choix
  // KARMA "PDF léger, partageable, rapide"). Pagination auto si dépasse la
  // page (= grosses carrières avec beaucoup de tags).
  //
  // ⚠️ Rappel CLAUDE.md §44.6 : jsPDF Helvetica latin1 → emojis Unicode
  // rendus en mojibake (`📍` devient `O=UI...`). Donc on remplace tous
  // les emojis par du texte plain (« Points », « Tracés », etc.) pour le
  // contenu textuel. Les sections gardent leur emoji uniquement comme
  // marqueur visuel dans le code, jamais écrit dans pdf.text().
  //
  async function exportToPDF(opts) {
    opts = opts || {};
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      throw new Error("jsPDF non chargé (lib/jspdf.umd.min.js manquant)");
    }
    const jsPDF = window.jspdf.jsPDF;

    // Compute le rapport si pas fourni
    const rep = opts.report || (await compute());

    const pdf = new jsPDF({
      orientation: "portrait",
      unit:        "mm",
      format:      "a4",
      compress:    true
    });

    const pageW   = pdf.internal.pageSize.getWidth();   // 210
    const pageH   = pdf.internal.pageSize.getHeight();  // 297
    const margin  = 15;
    const lineH   = 5;     // mm par ligne de texte 10pt
    const sectionGap = 4;
    let y = margin;

    function _newPageIfNeeded(needed) {
      if (y + needed > pageH - margin - 8) {
        // Footer crédit sur la page courante avant break
        _drawFooterCredit();
        pdf.addPage();
        y = margin;
      }
    }

    function _drawFooterCredit() {
      pdf.setFontSize(8);
      pdf.setTextColor(140, 140, 140);
      const credit = "Genere par MyKTAMap " + (rep.runtime ? rep.runtime.appVersion : ((window.__MKM__ && window.__MKM__.build) || "?")) +
                     " - myktamap.fr - " +
                     new Date(rep.timestamp).toLocaleString("fr-FR");
      pdf.text(credit, pageW / 2, pageH - 8, { align: "center" });
    }

    function _drawTitle(text, size, color) {
      pdf.setFontSize(size || 14);
      pdf.setTextColor((color && color[0]) || 30, (color && color[1]) || 58, (color && color[2]) || 138);
      pdf.text(text, margin, y);
      y += (size || 14) * 0.4;
    }

    function _drawSectionTitle(text) {
      _newPageIfNeeded(12);
      pdf.setFontSize(12);
      pdf.setTextColor(244, 197, 66);  // ambre charte
      pdf.text(text, margin, y);
      y += 2;
      // Underline
      pdf.setDrawColor(244, 197, 66);
      pdf.setLineWidth(0.4);
      pdf.line(margin, y, pageW - margin, y);
      y += 5;
      pdf.setTextColor(40, 40, 40);
    }

    function _drawText(text, size) {
      _newPageIfNeeded(lineH);
      pdf.setFontSize(size || 10);
      pdf.setTextColor(40, 40, 40);
      pdf.text(text, margin, y);
      y += lineH;
    }

    function _drawKV(key, val) {
      _newPageIfNeeded(lineH);
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(key + " :", margin, y);
      pdf.setTextColor(40, 40, 40);
      pdf.text(String(val || ""), margin + 50, y);
      y += lineH;
    }

    function _drawTable2col(rows, leftLbl, rightLbl) {
      _newPageIfNeeded(lineH + 2);
      // Header
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(leftLbl,  margin, y);
      pdf.text(rightLbl, pageW - margin, y, { align: "right" });
      y += 1.5;
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.2);
      pdf.line(margin, y, pageW - margin, y);
      y += 3;
      // Rows
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);
      rows.forEach(function(r) {
        _newPageIfNeeded(lineH);
        pdf.text(String(r[0]), margin, y);
        pdf.text(String(r[1]), pageW - margin, y, { align: "right" });
        y += lineH - 1;
      });
      y += 1;
    }

    function _drawTable3col(rows, lbl1, lbl2, lbl3) {
      _newPageIfNeeded(lineH + 2);
      const colW = (pageW - 2 * margin) / 3;
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(lbl1, margin, y);
      pdf.text(lbl2, margin + colW, y, { align: "right" });
      pdf.text(lbl3, pageW - margin, y, { align: "right" });
      y += 1.5;
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.2);
      pdf.line(margin, y, pageW - margin, y);
      y += 3;
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);
      rows.forEach(function(r) {
        _newPageIfNeeded(lineH);
        pdf.text(String(r[0]), margin, y);
        pdf.text(String(r[1]), margin + colW, y, { align: "right" });
        pdf.text(String(r[2]), pageW - margin, y, { align: "right" });
        y += lineH - 1;
      });
      y += 1;
    }

    // ─── HEADER PRINCIPAL ───
    pdf.setFont("helvetica", "bold");
    _drawTitle("MyKTAMap - Statistiques du plan", 18, [30, 58, 138]);
    y += 2;
    pdf.setFont("helvetica", "normal");

    const meta = rep.planMeta;
    pdf.setFontSize(13);
    pdf.setTextColor(244, 197, 66);
    pdf.setFont("helvetica", "bold");
    pdf.text(meta.name + (meta.version ? "  " + meta.version : ""), margin, y);
    y += 6;
    pdf.setFont("helvetica", "normal");

    // Plan meta
    if (meta.author)               _drawKV("Auteur",            meta.author);
    if (meta.imageW && meta.imageH) _drawKV("Dimensions",        meta.imageW + " x " + meta.imageH + " px");
    if (meta.scale && meta.scale !== 1) _drawKV("Echelle",       meta.scale.toFixed(1) + " px/m");
    const flags = [];
    if (meta.multiLevel) flags.push("Multi-niveau");
    if (meta.tiledV2)    flags.push("V2 tuile");
    if (flags.length) _drawKV("Flags", flags.join(", "));
    _drawKV("Rapport genere", new Date(rep.timestamp).toLocaleString("fr-FR"));
    y += sectionGap;

    // ─── TOTAUX ───
    const t = rep.totals;
    _drawSectionTitle("Totaux (session + data layers embedded)");
    _drawTable2col([
      ["Points",      t.points     + "  (" + rep.session.points     + " session + " + rep.embedded.points     + " embedded)"],
      ["Traces",      t.roads      + "  (" + rep.session.roads      + " session + " + rep.embedded.roads      + " embedded)"],
      ["Zones",       t.zones      + "  (" + rep.session.zones      + " session + " + rep.embedded.zones      + " embedded)"],
      ["Structures",  t.structures + "  (" + rep.session.structures + " session + " + rep.embedded.structures + " embedded)"],
      ["Photos POI",  String(t.photos)]
    ], "Categorie", "Total");
    y += sectionGap;

    // ─── POINTS PAR TAG ───
    if (t.points > 0) {
      _drawSectionTitle("Points par tag");
      const sorted = Object.keys(rep.pointsByTag).sort(function(a, b) {
        return rep.pointsByTag[b] - rep.pointsByTag[a];
      });
      _drawTable2col(sorted.map(function(tag) {
        return [tag, rep.pointsByTag[tag]];
      }), "Tag", "Nombre");
      y += sectionGap;
    }

    // ─── TRACÉS PAR TYPE ───
    if (t.roads > 0) {
      _drawSectionTitle("Traces par type (cumul : " + _formatDist(rep.roadsTotalDistM).replace("²", "2") + ")");
      const sorted = Object.keys(rep.roadsByType).sort(function(a, b) {
        return rep.roadsByType[b] - rep.roadsByType[a];
      });
      _drawTable3col(sorted.map(function(type) {
        const d = rep.roadsDistByTypeM[type] || 0;
        return [type, rep.roadsByType[type], _formatDist(d)];
      }), "Type", "Nombre", "Distance");
      y += sectionGap;
    }

    // ─── ZONES PAR TYPE ───
    if (t.zones > 0) {
      _drawSectionTitle("Zones par type (cumul : " + _formatSurf(rep.zonesTotalAreaM2).replace("²", "2") + ")");
      const sorted = Object.keys(rep.zonesByType).sort(function(a, b) {
        return rep.zonesByType[b] - rep.zonesByType[a];
      });
      _drawTable3col(sorted.map(function(type) {
        const s = rep.zonesAreaByTypeM2[type] || 0;
        return [type, rep.zonesByType[type], _formatSurf(s).replace("²", "2")];
      }), "Type", "Nombre", "Surface");
      y += sectionGap;
    }

    // ─── STRUCTURES PAR TYPE ───
    if (t.structures > 0) {
      _drawSectionTitle("Structures par type");
      const sorted = Object.keys(rep.structsByType).sort(function(a, b) {
        return rep.structsByType[b] - rep.structsByType[a];
      });
      _drawTable2col(sorted.map(function(type) {
        return [type, rep.structsByType[type]];
      }), "Type", "Nombre");
      y += sectionGap;
    }

    // ─── M-LVL BREAKDOWN ───
    if (rep.multiLevelBreakdown) {
      _drawSectionTitle("Breakdown par niveau");
      const lvlKeys = Object.keys(rep.multiLevelBreakdown).sort(function(a, b) {
        return parseInt(a, 10) - parseInt(b, 10);
      });
      const rows = lvlKeys.map(function(k) {
        const b = rep.multiLevelBreakdown[k];
        return [
          "Niveau " + k,
          "P:" + b.points + "  T:" + b.roads + "  Z:" + b.zones + "  S:" + b.structures,
          (b.points + b.roads + b.zones + b.structures) + " total"
        ];
      });
      _drawTable3col(rows, "Niveau", "Detail", "Total");
      y += sectionGap;
    }

    // ─── GÉORÉFÉRENCEMENT ───
    if (rep.georef && rep.georef.pointA && rep.georef.pointB) {
      _drawSectionTitle("Georeferencement GPS");
      const a = rep.georef.pointA;
      const b = rep.georef.pointB;
      _drawKV("Point A (plan -> GPS)", "px (" + a.x + ", " + a.y + ") -> (" + a.lat + ", " + a.lng + ")");
      _drawKV("Point B (plan -> GPS)", "px (" + b.x + ", " + b.y + ") -> (" + b.lat + ", " + b.lng + ")");
      y += sectionGap;
    }

    // ─── FOOTER CRÉDIT (page courante) ───
    _drawFooterCredit();

    // ─── SAVE ───
    const planName = (meta.name || "Plan").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
    const dateStr  = new Date(rep.timestamp).toISOString().slice(0, 10);
    const filename = "MyKTAMap_Stats_" + planName + "_" + dateStr + ".pdf";
    pdf.save(filename);

    return { ok: true, filename: filename };
  }

  // ───────── EXPORT CSV (v1.21.0) ─────────
  //
  // KARMA : "Export CSV des annotations (tableur friendly)".
  // 1 ZIP avec 4 fichiers CSV (points/roads/zones/structures), UTF-8 BOM +
  // séparateur `;` (compat Excel FR par défaut). Inclut session + embedded
  // data layers (cohérent avec le scope StatsGlobales : plan COMPLET).
  // Colonne `source` = "session" ou "embedded" pour permettre filtrage Excel.
  //
  // Reuse JSZip déjà chargé dans index.html (lib/jszip.min.js, pré-requis
  // multi-modules : kmzExport, profileExportImport, etc.).

  // Helper CSV : escape une valeur pour cellule CSV-RFC4180.
  // Si contient `;`, `"` ou newline → wrap en `"..."` + double les `"`.
  function _csvEscape(v) {
    if (v == null) return "";
    const s = String(v);
    if (s.indexOf(";") >= 0 || s.indexOf("\"") >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0) {
      return "\"" + s.replace(/"/g, "\"\"") + "\"";
    }
    return s;
  }

  // Construit un CSV à partir d'un array d'objets + l'ordre des colonnes.
  // UTF-8 BOM ajouté en tête (Excel FR auto-detect encoding).
  function _buildCsv(rows, columns) {
    const BOM = "﻿";
    const sep = ";";
    let csv = BOM + columns.join(sep) + "\r\n";
    rows.forEach(function(row) {
      const line = columns.map(function(col) { return _csvEscape(row[col]); }).join(sep);
      csv += line + "\r\n";
    });
    return csv;
  }

  // Helper : distance polyline en mètres (factorisation depuis _polylinePxLength + scale)
  function _polylineLenM(pts) {
    if (!Array.isArray(pts) || pts.length < 2) return 0;
    const scale = _scalePxPerM();
    if (scale <= 0) return 0;
    return _polylinePxLength(pts) / scale;
  }
  function _polygonAreaM2(pts) {
    if (!Array.isArray(pts) || pts.length < 3) return 0;
    const scale = _scalePxPerM();
    if (scale <= 0) return 0;
    return _polygonAreaPx(pts) / (scale * scale);
  }

  async function exportToCSV() {
    if (typeof JSZip !== "function" && typeof window.JSZip !== "function") {
      throw new Error("JSZip indisponible. Recharge la page pour récupérer la lib.");
    }
    const ZipLib = (typeof JSZip === "function") ? JSZip : window.JSZip;
    const zip    = new ZipLib();

    const planConf = window.PLAN_CONFIG || {};
    const planMeta = planConf.plan || {};
    const planName = (planMeta.name || "Plan").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
    const dateStr  = new Date().toISOString().slice(0, 10);

    // Collecte session + embedded de chaque type
    const sessionPts  = (typeof window.getEditorPoints      === "function") ? (window.getEditorPoints()      || []) : [];
    const embeddedPts = (typeof window.getAllEmbeddedPoints === "function") ? (window.getAllEmbeddedPoints() || []) : [];

    const sessionRoads  = (typeof window.getRoads             === "function") ? (window.getRoads()             || []) : [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads  === "function") ? (window.getAllEmbeddedRoads()  || []) : [];

    const sessionZones  = (typeof window.getZones             === "function") ? (window.getZones()             || []) : [];
    const embeddedZones = (typeof window.getAllEmbeddedZones  === "function") ? (window.getAllEmbeddedZones()  || []) : [];

    const sessionStructs  = (typeof window.getStructures            === "function") ? (window.getStructures()            || []) : [];
    const embeddedStructs = (typeof window.getAllEmbeddedStructures === "function") ? (window.getAllEmbeddedStructures() || []) : [];

    // ─── POINTS ───
    const pointsCols = ["source", "id", "nom", "x", "y", "level", "tags", "etat", "description"];
    const pointsRows = [];
    function _addPoint(p, source) {
      pointsRows.push({
        source:      source,
        id:          p.id || "",
        nom:         p.nom || "",
        x:           (typeof p.x === "number") ? Math.round(p.x) : "",
        y:           (typeof p.y === "number") ? Math.round(p.y) : "",
        level:       (typeof p.level === "number") ? p.level : 0,
        tags:        Array.isArray(p.tags) ? p.tags.join(",") : "",
        etat:        p.etat || "",
        description: p.description || ""
      });
    }
    sessionPts.forEach(function(p)  { _addPoint(p, "session");  });
    embeddedPts.forEach(function(p) { _addPoint(p, "embedded"); });
    zip.file("points.csv", _buildCsv(pointsRows, pointsCols));

    // ─── ROADS ───
    const roadsCols = ["source", "type", "nb_points", "distance_m", "level", "fromLevel", "toLevel", "description"];
    const roadsRows = [];
    function _addRoad(r, source) {
      const isJonction = r.type === "jonction";
      roadsRows.push({
        source:      source,
        type:        r.type || "",
        nb_points:   Array.isArray(r.points) ? r.points.length : 0,
        distance_m:  _polylineLenM(r.points).toFixed(2),
        level:       isJonction ? "" : ((typeof r.level === "number") ? r.level : 0),
        fromLevel:   isJonction ? ((typeof r.fromLevel === "number") ? r.fromLevel : "") : "",
        toLevel:     isJonction ? ((typeof r.toLevel   === "number") ? r.toLevel   : "") : "",
        description: r.description || ""
      });
    }
    sessionRoads.forEach(function(r)  { _addRoad(r, "session");  });
    embeddedRoads.forEach(function(r) { _addRoad(r, "embedded"); });
    zip.file("roads.csv", _buildCsv(roadsRows, roadsCols));

    // ─── ZONES ───
    const zonesCols = ["source", "type", "nb_points", "surface_m2", "level", "description"];
    const zonesRows = [];
    function _addZone(z, source) {
      zonesRows.push({
        source:      source,
        type:        z.type || "",
        nb_points:   Array.isArray(z.points) ? z.points.length : 0,
        surface_m2:  _polygonAreaM2(z.points).toFixed(2),
        level:       (typeof z.level === "number") ? z.level : 0,
        description: z.description || ""
      });
    }
    sessionZones.forEach(function(z)  { _addZone(z, "session");  });
    embeddedZones.forEach(function(z) { _addZone(z, "embedded"); });
    zip.file("zones.csv", _buildCsv(zonesRows, zonesCols));

    // ─── STRUCTURES ───
    // Fronts (front-1/2) = polylines → longueur. Piliers/mur = polygones → surface.
    const structsCols = ["source", "type", "nb_points", "surface_m2", "longueur_m", "level", "description"];
    const structsRows = [];
    function _addStruct(s, source) {
      const isPolyline = (s.type === "front-1" || s.type === "front-2");
      structsRows.push({
        source:      source,
        type:        s.type || "",
        nb_points:   Array.isArray(s.points) ? s.points.length : 0,
        surface_m2:  isPolyline ? "" : _polygonAreaM2(s.points).toFixed(2),
        longueur_m:  isPolyline ? _polylineLenM(s.points).toFixed(2) : "",
        level:       (typeof s.level === "number") ? s.level : 0,
        description: s.description || ""
      });
    }
    sessionStructs.forEach(function(s)  { _addStruct(s, "session");  });
    embeddedStructs.forEach(function(s) { _addStruct(s, "embedded"); });
    zip.file("structures.csv", _buildCsv(structsRows, structsCols));

    // ─── README dans le ZIP pour expliquer le format ───
    const readme =
      "MyKTAMap — Export CSV des annotations\r\n" +
      "Plan : " + (planMeta.name || "") + "\r\n" +
      "Date : " + new Date().toISOString() + "\r\n\r\n" +
      "FICHIERS :\r\n" +
      "  points.csv     — Points (puits, accès, signalétique, etc.)\r\n" +
      "  roads.csv      — Tracés (principal, secondaire, chemin, jonction)\r\n" +
      "  zones.csv      — Zones (eau, remblais, effondrement, inaccessible)\r\n" +
      "  structures.csv — Structures (pilier-1/2, mur, front-1/2)\r\n\r\n" +
      "FORMAT :\r\n" +
      "  - UTF-8 avec BOM (compat Excel)\r\n" +
      "  - Séparateur : `;` (compat Excel FR par défaut)\r\n" +
      "  - Colonne `source` : 'session' (annotations en cours) ou 'embedded' (data layers du plan)\r\n" +
      "  - Distances en mètres (calculées via APP_CONFIG.scale)\r\n" +
      "  - Surfaces en m² (shoelace formula)\r\n\r\n" +
      "Ouverture : double-clic dans Excel/LibreOffice/Numbers, ou import dans ton outil BI préféré.\r\n";
    zip.file("_README.txt", "﻿" + readme);

    // ─── PACK ZIP + DOWNLOAD ───
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url  = URL.createObjectURL(blob);
    const filename = "MyKTAMap_CSV_" + planName + "_" + dateStr + ".zip";
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function() {
      a.remove();
      URL.revokeObjectURL(url);
    }, 500);

    return { ok: true, filename: filename, counts: {
      points: pointsRows.length,
      roads:  roadsRows.length,
      zones:  zonesRows.length,
      structures: structsRows.length
    }};
  }

  // ───────── EXPORT API ─────────
  window.StatsGlobales = {
    ouvrir:        ouvrir,
    fermer:        fermer,
    compute:       compute,
    getReportText: getReportText,
    exportToCSV:   exportToCSV,
    // 🆕 v1.21.0
    exportToPDF:   exportToPDF,
    // 🆕 v1.21.3 (KARMA "dans les stat, rajoute comme on voit sur chaque
    // plan stat détailé les graph et tout") : expose renderPieChart pour
    // la modale Profil > section "📊 Mes plans" → permet de réutiliser
    // l'algo camembert SVG + légende sans dupliquer le code.
    // data = { key: count, ... }
    // category = "tags" | "traces" | "zones" | "structures"
    // size = pixels (default 160)
    renderPieChart: _renderPieChart
  };
})();
