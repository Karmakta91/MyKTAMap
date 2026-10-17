/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// statsGlobales.js — modale de stats du PLAN entier (session + couches embarquées), à distinguer
//   de « Détails session ». Points par tag, tracés (distance), zones (surface), structures, photos,
//   géoréf, multi-niveau ; copie du rapport, export PDF et CSV.
// Expose : window.StatsGlobales (ouvrir, fermer, compute, getReportText, renderPieChart…).
// Couleurs : window.ktaSwatchColor (styleResolver.js), jamais de table locale.
// 🩸 En agrégat multi-plans, un type BUILT-IN garde son libellé PAR DÉFAUT (décision produit).
// Garde-fous : scripts/check-legend-roundtrip.js, scripts/check-style-canon.js, scripts/check-pdf-texte.js

(function() {
  "use strict";

  // CSS chargé à la demande (js/cssLazy.js).
  if (typeof window._loadCssOnce === "function") {
    window._loadCssOnce("css/style-stats-globales.css", "kta-css-style-stats-globales");
  }

  const MODAL_ID = "kta-stats-globales-modal";

  // ── Utilitaires ──────────────────────────────
  function _escapeHtml(s) { return window.ktaEsc(s); }

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

  // ── Camemberts SVG ──────────────────────────────
  // Types de tracés/zones/structures : couleur du canon (ktaSwatchColor). Points par tag et types
  // inconnus : palette de repli, indexée par hash djb2 (un tag garde toujours la même couleur).
  const _PALETTE_TAGS = [
    "#f4c542", "#8cb4ff", "#6ee287", "#ff8c8c", "#ff4ecb",
    "#00d4ff", "#a78bfa", "#ffb380", "#34d399", "#c9b88f"
  ];

  function _djb2Hash(str) {
    let h = 5381;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return Math.abs(h | 0);
  }

  function _colorForKey(category, key) {
    // 🩸 "roads" ET "traces" acceptés (le Profil envoie "traces") : sinon repli par hash, et deux
    // types distincts peuvent prendre la même couleur. Les types `cust-` ont aussi leur vraie couleur.
    const cat = (category === "roads" || category === "traces") ? "traces"
              : (category === "zones" || category === "structures") ? category
              : null;
    if (cat && typeof window.ktaSwatchColor === "function") {
      const c = window.ktaSwatchColor(cat, key);
      if (c) return c;
    }
    return _PALETTE_TAGS[_djb2Hash(key) % _PALETTE_TAGS.length];
  }

  // Libellé par la cascade LegendCustomization (session > plan > défaut). Type `cust-` : préfixe ✨.
  function _lcLabelStat(category, type, fallback) {
    if (typeof type !== "string" || !type) return fallback || "?";
    if (type.indexOf("cust-") === 0) {
      if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
        try {
          const e = window.LegendCustomization.findCustomEntry(type);
          if (e && e.label) return "✨ " + e.label;
        } catch(err) {}
      }
      return fallback || type;
    }
    if (window.LegendCustomization && typeof window.LegendCustomization.getLabel === "function") {
      try {
        const lcCat = (category === "roads") ? "traces"
                    : (category === "tags")  ? "icones"
                    : category;
        const lbl = window.LegendCustomization.getLabel(lcCat, type);
        if (lbl) return lbl;
      } catch(err) {}
    }
    return fallback || type;
  }

  // Libellé pour l'agrégat multi-plans (Profil de l'accueil). Un type BUILT-IN prend son libellé par
  // DÉFAUT (décision produit) : un renommage sur le plan A ne doit pas s'imposer au total.
  // 🩸 Un type `cust-` n'a que son nom : sur l'accueil, findCustomEntry (état du plan COURANT) ne
  // trouve rien, et le nom d'un type né d'un import SIG vit dans le plan-config du ZIP. D'où un
  // dictionnaire externe (homeProfile.js), consulté pour les seules clés `cust-`.
  let _labelsExternes = null;   // { "structures.cust-…": "Niveau -2", … }
  function _setLabelsExternes(map) { _labelsExternes = map || null; }

  function _defaultLabelStat(category, type, fallback) {
    if (typeof type !== "string" || !type) return fallback || "?";
    if (type.indexOf("cust-") === 0) {
      // 1. dictionnaire multi-plans (seul à savoir sur l'accueil), 2. légende du plan ouvert.
      if (_labelsExternes) {
        const lcCat2 = (category === "roads") ? "traces"
                     : (category === "tags")  ? "icones"
                     : category;
        const ext = _labelsExternes[lcCat2 + "." + type] || _labelsExternes[category + "." + type];
        if (ext) return "✨ " + ext;
      }
      if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
        try {
          const e = window.LegendCustomization.findCustomEntry(type);
          if (e && e.label) return "✨ " + e.label;
        } catch(err) {}
      }
      return fallback || type;
    }
    // Built-in : STRICTEMENT le libellé par défaut, jamais celui de la session ou du plan.
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

  // 🏷️ ancre:fin-libelles-stats
  /**
   * Génère un camembert SVG inline + légende textuelle à droite.
   * @param {Object}  data              - {key: count, ...}
   * @param {String}  category          - "roads"|"zones"|"structures"|"tags" (palette + labels)
   * @param {Number}  size              - taille en px (recommandé 160)
   * @param {Boolean} useDefaultLabels  - true : libellés par défaut (agrégat multi-plans)
   * @param {Object}  labelsExternes    - dictionnaire des types `cust-` (cf _defaultLabelStat)
   * @returns {String} HTML <div> contenant SVG + légende
   */
  function _renderPieChart(data, category, size, useDefaultLabels, labelsExternes) {
    // 🩸 Dictionnaire posé le temps du rendu puis RETIRÉ, sinon les noms d'un agrégat fuient
    // dans la modale d'un plan.
    if (arguments.length >= 5) _setLabelsExternes(labelsExternes);
    size = size || 160;
    const r = size / 2 - 4;        // rayon (avec marge)
    const cx = size / 2;
    const cy = size / 2;
    const keys = Object.keys(data || {});
    // 🩸 Les DEUX sorties anticipées retirent aussi le dictionnaire (fuite invisible : camembert vide).
    if (keys.length === 0) { _setLabelsExternes(null); return ""; }
    const total = keys.reduce(function(s, k) { return s + (data[k] || 0); }, 0);
    if (total === 0) { _setLabelsExternes(null); return ""; }

    const sortedKeys = keys.slice().sort(function(a, b) { return (data[b] || 0) - (data[a] || 0); });

    // Une seule part : cercle plein (un arc SVG de 360° dégénère).
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

    if (arguments.length >= 5) _setLabelsExternes(null);

    return '<div class="kta-stats-glob-pie-wrap">' +
             '<svg class="kta-stats-glob-pie-svg" viewBox="0 0 ' + size + ' ' + size +
                  '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
               svgSlices +
             '</svg>' +
             legend +
           '</div>';
  }

  // ── Collecte ──────────────────────────────
  /**
   * Agrège tout le plan (session + couches embarquées).
   * @returns {Promise<StatsReport>}
   */
  async function compute() {
    const planId   = window._currentLoadedPlanId || null;
    const planConf = window.PLAN_CONFIG || {};
    const planMeta = planConf.plan || {};
    const scale    = _scalePxPerM();

    const sessionPts  = (typeof window.getEditorPoints      === "function") ? (window.getEditorPoints()      || []) : [];
    const embeddedPts = (typeof window.getAllEmbeddedPoints === "function") ? (window.getAllEmbeddedPoints() || []) : [];
    const allPoints   = sessionPts.concat(embeddedPts);

    const sessionRoads  = (typeof window.getRoads             === "function") ? (window.getRoads()             || []) : [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads  === "function") ? (window.getAllEmbeddedRoads()  || []) : [];
    const allRoads      = sessionRoads.concat(embeddedRoads);

    const sessionZones  = (typeof window.getZones             === "function") ? (window.getZones()             || []) : [];
    const embeddedZones = (typeof window.getAllEmbeddedZones  === "function") ? (window.getAllEmbeddedZones()  || []) : [];
    const allZones      = sessionZones.concat(embeddedZones);

    const sessionStructs  = (typeof window.getStructures            === "function") ? (window.getStructures()            || []) : [];
    const embeddedStructs = (typeof window.getAllEmbeddedStructures === "function") ? (window.getAllEmbeddedStructures() || []) : [];
    const allStructs      = sessionStructs.concat(embeddedStructs);

    // Un point compte pour son PREMIER tag.
    const pointsByTag = {};
    allPoints.forEach(function(p) {
      const tag = (Array.isArray(p.tags) && p.tags[0]) ? p.tags[0] : "default";
      pointsByTag[tag] = (pointsByTag[tag] || 0) + 1;
    });

    const roadsByType = {};
    const roadsDistByType = {};   // px
    allRoads.forEach(function(r) {
      if (!r || !Array.isArray(r.points)) return;
      const type = r.type || "?";
      roadsByType[type] = (roadsByType[type] || 0) + 1;
      roadsDistByType[type] = (roadsDistByType[type] || 0) + _polylinePxLength(r.points);
    });
    const roadsDistByTypeM = {};
    Object.keys(roadsDistByType).forEach(function(t) {
      roadsDistByTypeM[t] = scale > 0 ? roadsDistByType[t] / scale : 0;
    });
    const roadsTotalDistM = Object.keys(roadsDistByTypeM).reduce(function(s, t) {
      return s + roadsDistByTypeM[t];
    }, 0);

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

    const structsByType = {};
    allStructs.forEach(function(s) {
      const type = s.type || "?";
      structsByType[type] = (structsByType[type] || 0) + 1;
    });

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
          // Une jonction relie 2 niveaux : comptée sur le plus haut.
          const lvl = Math.max(r.fromLevel || 0, r.toLevel || 0);
          _addLvl(lvl, "roads");
        } else {
          _addLvl(r.level, "roads");
        }
      });
      allZones.forEach(function(z)   { _addLvl(z.level, "zones");      });
      allStructs.forEach(function(s) { _addLvl(s.level, "structures"); });
    }

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

    const georef = planMeta.georef || null;

    return {
      timestamp:    new Date().toISOString(),
      planId:       planId,
      auteurs:      _compterAuteurs([sessionPts, sessionRoads, sessionZones, sessionStructs]),
      planMeta:     {
        name:       planMeta.name       || (window.I18n ? window.I18n.t("stats.plan.noName") : "(sans nom)"),
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
      georef: georef,
      // Tracker (timeline persistée) : distM = podomètre + tronçons estimés entre recalages, sans les
      // sauts de recalage ; la part estimée est rendue à part, jamais fondue. steps = pas PDR appliqués.
      tracker: {
        distM: (typeof window.getTrackingDistanceTotaleM === "function")
                 ? (window.getTrackingDistanceTotaleM() || 0)
                 : ((typeof window.getTrackingDistanceM === "function")
                      ? (window.getTrackingDistanceM() || 0) : 0),
        distEstimeeM: (typeof window.getTrackingDistanceEstimeeM === "function")
                 ? (window.getTrackingDistanceEstimeeM() || 0) : 0,
        steps: (typeof window.getTrackingTimeline === "function")
                 ? (window.getTrackingTimeline() || []).filter(function(e) { return e.type === "pdr"; }).length
                 : 0
      }
    };
  }

  // Objets ajoutés (session) par auteur, seulement quand une extension sait dire qui a créé un objet
  // (prise auteurObjet, par uid). Sans elle : null, rien n'est affiché. Les objets sans uid, l'itinéraire
  // et l'aperçu de tracé ne comptent pas. Rend [{ nom, n }] trié, nom null = auteur inconnu.
  function _compterAuteurs(familles) {
    const K = window.KtaExtensions;
    if (!K || typeof K.aPrise !== "function" || !K.aPrise("auteurObjet") || typeof K.auteurObjet !== "function") {
      return null;
    }
    const parNom = new Map();
    familles.forEach(function(liste) {
      liste.forEach(function(o) {
        if (!o || typeof o.uid !== "string" || !o.uid || o.type === "itinerary" || o._preview) return;
        const a = K.auteurObjet(o.uid);
        const nom = (a && a.createur) || null;
        parNom.set(nom, (parNom.get(nom) || 0) + 1);
      });
    });
    return Array.from(parNom, function(e) { return { nom: e[0], n: e[1] }; })
      .sort(function(x, y) { return y.n - x.n; });
  }

  // Ligne « Ajoutés, par auteur : Alice 12 · Bob 5 · inconnu 3 » (10 auteurs au plus, le reste en « +N »).
  // Les noms viennent de l'extension : toujours échappés.
  function _renderAuteurs(auteurs) {
    if (!Array.isArray(auteurs) || !auteurs.length) return "";
    const MAX = 10;
    const parts = auteurs.slice(0, MAX).map(function(a) {
      return _escapeHtml(a.nom != null ? a.nom : window.I18n.t("stats.auteurs.inconnu")) + " " + a.n;
    });
    if (auteurs.length > MAX) parts.push("+" + (auteurs.length - MAX));
    return '<div class="kta-stats-glob-meta kta-stats-glob-auteurs" title="' +
             _escapeHtml(window.I18n.t("stats.auteurs.title")) + '">' +
             _escapeHtml(window.I18n.t("stats.auteurs.label")) + ' ' + parts.join(" · ") + '</div>';
  }

  // ── Rendu ──────────────────────────────
  function _renderHtml(rep) {
    const t = rep.totals;
    const meta = rep.planMeta;
    let html = "";

    html += '<div class="kta-stats-glob-header">';
    html += '<div class="kta-stats-glob-plan-name">' + _escapeHtml(meta.name);
    if (meta.version) html += ' <span class="kta-stats-glob-dim">' + _escapeHtml(meta.version) + '</span>';
    html += '</div>';
    if (meta.author) html += '<div class="kta-stats-glob-meta">' + window.I18n.t("stats.meta.par", { author: _escapeHtml(meta.author) }) + '</div>';
    html += '<div class="kta-stats-glob-meta">';
    if (meta.imageW && meta.imageH) html += '📐 ' + meta.imageW + ' × ' + meta.imageH + ' px';
    if (meta.scale && meta.scale !== 1) html += ' &middot; ' + meta.scale.toFixed(1) + ' px/m';
    if (meta.multiLevel) html += ' &middot; ' + window.I18n.t("stats.meta.multiNiveau");
    if (meta.tiledV2)    html += ' &middot; ' + window.I18n.t("stats.meta.v2Tuile");
    html += '</div>';
    html += '</div>';

    html += '<div class="kta-stats-glob-grid">';
    html += _statCard("📍", t.points,     window.I18n.t(t.points     > 1 ? "stats.card.points.plural"     : "stats.card.points.singular"),     rep.session.points,     rep.embedded.points);
    html += _statCard("🛣️", t.roads,      window.I18n.t(t.roads      > 1 ? "stats.card.roads.plural"      : "stats.card.roads.singular"),      rep.session.roads,      rep.embedded.roads);
    html += _statCard("⬛", t.zones,      window.I18n.t(t.zones      > 1 ? "stats.card.zones.plural"      : "stats.card.zones.singular"),      rep.session.zones,      rep.embedded.zones);
    html += _statCard("🏛️", t.structures, window.I18n.t(t.structures > 1 ? "stats.card.structures.plural" : "stats.card.structures.singular"), rep.session.structures, rep.embedded.structures);
    if (t.photos > 0) {
      const sz = rep.photos.bytes > 0 ? (rep.photos.bytes / 1024 / 1024).toFixed(1) + " MB" : "";
      html += '<div class="kta-stats-glob-card"><div class="kta-stats-glob-card-num">' + t.photos + '</div>' +
              '<div class="kta-stats-glob-card-label">📸 ' + window.I18n.t(t.photos > 1 ? "stats.card.photos.plural" : "stats.card.photos.singular") + '</div>' +
              (sz ? '<div class="kta-stats-glob-card-sub">' + sz + '</div>' : '') +
              '</div>';
    }
    if (rep.tracker && (rep.tracker.distM > 0 || rep.tracker.steps > 0)) {
      html += '<div class="kta-stats-glob-card"><div class="kta-stats-glob-card-num">' + _formatDist(rep.tracker.distM) + '</div>' +
              '<div class="kta-stats-glob-card-label">🧭 ' + window.I18n.t("stats.card.tracker.label") + '</div>' +
              '<div class="kta-stats-glob-card-sub">' + window.I18n.t("stats.card.tracker.steps", { n: rep.tracker.steps }) +
                ((rep.tracker.distEstimeeM || 0) > 0
                  ? ' · ' + window.I18n.t("jrn.section.dontEstime", { dist: _formatDist(rep.tracker.distEstimeeM) })
                  : '') +
              '</div>' +
              '</div>';
    }
    html += '</div>';
    html += _renderAuteurs(rep.auteurs);

    if (t.points > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">📍 ' + window.I18n.t("stats.section.pointsParTag") + '</div>';
      html += _renderPieChart(rep.pointsByTag, "tags", 160);
      html += '</div>';
    }

    // Tracés et zones : le camembert compte les objets, la liste donne distance ou surface par type.
    if (t.roads > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🛣️ ' + window.I18n.t("stats.section.traces") + ' ' +
              '<span class="kta-stats-glob-total">' + window.I18n.t("stats.section.cumules", { val: _formatDist(rep.roadsTotalDistM) }) + '</span></div>';
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

    if (t.zones > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">⬛ ' + window.I18n.t("stats.section.zones") + ' ' +
              '<span class="kta-stats-glob-total">' + window.I18n.t("stats.section.cumules", { val: _formatSurf(rep.zonesTotalAreaM2) }) + '</span></div>';
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

    if (t.structures > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🏛️ ' + window.I18n.t("stats.section.structures") + '</div>';
      html += _renderPieChart(rep.structsByType, "structures", 160);
      html += '</div>';
    }

    if (rep.multiLevelBreakdown) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🏗️ ' + window.I18n.t("stats.section.breakdownNiveau") + '</div>';
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
                  '<span class="kta-stats-glob-row-lbl">' + window.I18n.t("stats.niveau", { n: _escapeHtml(k) }) + '</span>' +
                  '<span class="kta-stats-glob-row-num">' + parts.join(' &middot; ') + '</span>' +
                '</div>';
      });
      html += '</div></div>';
    }

    if (rep.georef && rep.georef.pointA && rep.georef.pointB) {
      const a = rep.georef.pointA;
      const b = rep.georef.pointB;
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🌐 ' + window.I18n.t("stats.section.georeferencement") + '</div>';
      html += '<div class="kta-stats-glob-list">';
      html += '<div class="kta-stats-glob-row"><span class="kta-stats-glob-row-lbl">' + window.I18n.t("stats.georef.pointA") + '</span>' +
                '<span class="kta-stats-glob-row-num">px (' + a.x + ', ' + a.y + ') &harr; (' + a.lat + ', ' + a.lng + ')</span></div>';
      html += '<div class="kta-stats-glob-row"><span class="kta-stats-glob-row-lbl">' + window.I18n.t("stats.georef.pointB") + '</span>' +
                '<span class="kta-stats-glob-row-num">px (' + b.x + ', ' + b.y + ') &harr; (' + b.lat + ', ' + b.lng + ')</span></div>';
      html += '</div></div>';
    }

    return html;
  }

  function _statCard(emoji, num, label, sessionN, embeddedN) {
    let sub = "";
    // « Ajoutés » = posés par-dessus les données d'origine du plan, par l'utilisateur ou reçus par synchronisation.
    const titre = ' title="' + _escapeHtml(window.I18n.t("stats.card.sub.title")) + '"';
    if (sessionN > 0 && embeddedN > 0) {
      sub = '<div class="kta-stats-glob-card-sub"' + titre + '>' + window.I18n.t("stats.card.sub.sessionEmbed", { session: sessionN, embed: embeddedN }) + '</div>';
    } else if (sessionN > 0) {
      sub = '<div class="kta-stats-glob-card-sub"' + titre + '>' + window.I18n.t("stats.card.sub.session", { session: sessionN }) + '</div>';
    } else if (embeddedN > 0) {
      sub = '<div class="kta-stats-glob-card-sub"' + titre + '>' + window.I18n.t("stats.card.sub.embed", { embed: embeddedN }) + '</div>';
    }
    return '<div class="kta-stats-glob-card">' +
             '<div class="kta-stats-glob-card-num">' + num + '</div>' +
             '<div class="kta-stats-glob-card-label">' + emoji + ' ' + label + '</div>' +
             sub +
           '</div>';
  }

  // ── Rapport texte (bouton Copier) ──────────────────────────────
  function getReportText(rep) {
    if (!rep) return "";
    const t = rep.totals;
    const meta = rep.planMeta;
    const lines = [];
    lines.push("=========================================");
    lines.push(window.I18n.t("stats.report.titre"));
    lines.push("=========================================");
    lines.push("📦 " + window.I18n.t("stats.report.plan") + " : " + meta.name + " " + meta.version);
    if (meta.author) lines.push("👤 " + window.I18n.t("stats.report.auteur") + "       : " + meta.author);
    if (meta.imageW && meta.imageH) lines.push("📐 " + window.I18n.t("stats.report.dimensions") + "   : " + meta.imageW + " × " + meta.imageH + " px");
    if (meta.scale && meta.scale !== 1) lines.push("📏 " + window.I18n.t("stats.report.echelle") + "      : " + meta.scale.toFixed(1) + " px/m");
    if (meta.multiLevel) lines.push("🏗️  " + window.I18n.t("stats.report.multiNiveau") + " : ON");
    if (meta.tiledV2)    lines.push("🧱 " + window.I18n.t("stats.report.v2Tuile") + "     : ON");
    lines.push("📅 " + window.I18n.t("stats.report.captureLe") + "   : " + new Date(rep.timestamp).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR"));
    lines.push("");

    lines.push("📊 " + window.I18n.t("stats.report.totaux"));
    lines.push("─────────────────────────────────────────");
    lines.push("📍 " + window.I18n.t("stats.report.points") + "      : " + t.points + "  (" + window.I18n.t("stats.report.sessionEmbed", { session: rep.session.points, embed: rep.embedded.points }) + ")");
    lines.push("🛣️  " + window.I18n.t("stats.report.traces") + "      : " + t.roads  + "  (" + window.I18n.t("stats.report.sessionEmbed", { session: rep.session.roads, embed: rep.embedded.roads }) + ")  → " + _formatDist(rep.roadsTotalDistM));
    lines.push("⬛ " + window.I18n.t("stats.report.zones") + "       : " + t.zones  + "  (" + window.I18n.t("stats.report.sessionEmbed", { session: rep.session.zones, embed: rep.embedded.zones }) + ")  → " + _formatSurf(rep.zonesTotalAreaM2));
    lines.push("🏛️  " + window.I18n.t("stats.report.structures") + "  : " + t.structures + "  (" + window.I18n.t("stats.report.sessionEmbed", { session: rep.session.structures, embed: rep.embedded.structures }) + ")");
    lines.push("📸 " + window.I18n.t("stats.report.photosPoi") + "  : " + t.photos);
    lines.push("");

    if (t.points > 0) {
      lines.push("📍 " + window.I18n.t("stats.report.pointsParTag"));
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.pointsByTag).sort(function(a, b) {
        return rep.pointsByTag[b] - rep.pointsByTag[a];
      }).forEach(function(tag) {
        lines.push("  " + (rep.pointsByTag[tag] + "").padStart(5, " ") + "  " + tag);
      });
      lines.push("");
    }

    if (t.roads > 0) {
      lines.push("🛣️  " + window.I18n.t("stats.report.tracesParType"));
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.roadsByType).sort(function(a, b) { return a.localeCompare(b); }).forEach(function(type) {
        lines.push("  " + type.padEnd(14, " ") + "  " + (rep.roadsByType[type] + "").padStart(4, " ") +
                   "  " + _formatDist(rep.roadsDistByTypeM[type] || 0));
      });
      lines.push("");
    }

    if (t.zones > 0) {
      lines.push("⬛ " + window.I18n.t("stats.report.zonesParType"));
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.zonesByType).sort(function(a, b) { return a.localeCompare(b); }).forEach(function(type) {
        lines.push("  " + type.padEnd(14, " ") + "  " + (rep.zonesByType[type] + "").padStart(4, " ") +
                   "  " + _formatSurf(rep.zonesAreaByTypeM2[type] || 0));
      });
      lines.push("");
    }

    if (t.structures > 0) {
      lines.push("🏛️  " + window.I18n.t("stats.report.structuresParType"));
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.structsByType).sort(function(a, b) { return a.localeCompare(b); }).forEach(function(type) {
        lines.push("  " + type.padEnd(14, " ") + "  " + rep.structsByType[type]);
      });
      lines.push("");
    }

    if (rep.multiLevelBreakdown) {
      lines.push("🏗️  " + window.I18n.t("stats.report.breakdownNiveau"));
      lines.push("─────────────────────────────────────────");
      Object.keys(rep.multiLevelBreakdown).sort(function(a, b) {
        return parseInt(a, 10) - parseInt(b, 10);
      }).forEach(function(k) {
        const b = rep.multiLevelBreakdown[k];
        lines.push("  " + window.I18n.t("stats.niveau", { n: k }) + " : 📍" + b.points + " 🛣️" + b.roads +
                   " ⬛" + b.zones + " 🏛️" + b.structures);
      });
      lines.push("");
    }

    lines.push("=========================================");
    return lines.join("\n");
  }

  // ── Modale ──────────────────────────────
  let _lastReport = null;

  async function _refreshAndRender() {
    const corps = document.getElementById("kta-stats-glob-corps");
    if (!corps) return;
    corps.innerHTML = '<div class="kta-stats-glob-loading">⏳ ' + window.I18n.t("stats.loading") + '</div>';
    try {
      _lastReport = await compute();
      corps.innerHTML = _renderHtml(_lastReport);
    } catch(e) {
      corps.innerHTML = '<div class="kta-mem-warn">❌ ' + window.I18n.t("stats.erreur", { msg: _escapeHtml(e.message || e) }) + '</div>';
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
          '<span class="kta-readme-modal-titre">📊 ' + window.I18n.t("stats.modal.titre") + '</span>' +
          '<button type="button" class="kta-panneau-close" id="kta-stats-glob-close" aria-label="' + window.I18n.t("stats.modal.fermer") + '">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" id="kta-stats-glob-corps">' +
          '<div class="kta-stats-glob-loading">⏳ ' + window.I18n.t("stats.loading") + '</div>' +
        '</div>' +
        '<div class="kta-readme-modal-footer kta-stats-glob-footer">' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-stats-glob-refresh">🔄 ' + window.I18n.t("stats.btn.rafraichir") + '</button>' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-stats-glob-csv">📊 ' + window.I18n.t("stats.btn.exportCsv") + '</button>' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-stats-glob-pdf">📤 ' + window.I18n.t("stats.btn.exportPdf") + '</button>' +
          '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-stats-glob-rapport">📋 ' + window.I18n.t("stats.btn.rapportSortie") + '</button>' +
          '<button type="button" class="kta-btn kta-btn-primary" id="kta-stats-glob-copy">📋 ' + window.I18n.t("stats.btn.copierRapport") + '</button>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    document.getElementById("kta-stats-glob-close").addEventListener("click", fermer);
    overlay.addEventListener("click", function(e) { if (e.target === overlay) fermer(); });
    document.addEventListener("keydown", _onEscape);
    document.getElementById("kta-stats-glob-refresh").addEventListener("click", _refreshAndRender);

    // Rapport de sortie (js/sessionReport.js) : collecte ses propres données, pas _lastReport.
    const btnRapport = document.getElementById("kta-stats-glob-rapport");
    if (btnRapport) {
      btnRapport.addEventListener("click", function() {
        if (window.SessionReport && typeof window.SessionReport.ouvrirModal === "function") {
          window.SessionReport.ouvrirModal();
        } else {
          window.ktaAlerte(window.I18n.t("stats.feedback.sessionReportIndispo"), { type: "erreur" });
        }
      });
    }

    document.getElementById("kta-stats-glob-copy").addEventListener("click", function() {
      if (!_lastReport) return;
      const txt = getReportText(_lastReport);
      _copyToClipboard(txt).then(function() {
        const btn = document.getElementById("kta-stats-glob-copy");
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = "✅ " + window.I18n.t("stats.feedback.copie");
          setTimeout(function() { if (btn) btn.textContent = orig; }, 1800);
        }
      }).catch(function(e) {
        window.ktaAlerte(window.I18n.t("stats.feedback.echecCopie", { msg: (e.message || e) }), { type: "erreur" });
      });
    });

    document.getElementById("kta-stats-glob-csv").addEventListener("click", function() {
      const btn = document.getElementById("kta-stats-glob-csv");
      const orig = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = "⏳ " + window.I18n.t("stats.feedback.generation"); }
      exportToCSV().then(function() {
        if (btn) {
          btn.textContent = "✅ " + window.I18n.t("stats.feedback.zipTelecharge");
          setTimeout(function() { if (btn) { btn.textContent = orig; btn.disabled = false; } }, 1800);
        }
      }).catch(function(e) {
        if (btn) { btn.textContent = orig; btn.disabled = false; }
        window.ktaAlerte(window.I18n.t("stats.feedback.echecCsv", { msg: (e.message || e) }), { type: "erreur" });
      });
    });

    document.getElementById("kta-stats-glob-pdf").addEventListener("click", function() {
      if (!_lastReport) {
        window.ktaAlerte(window.I18n.t("stats.feedback.aucuneDonnee"));
        return;
      }
      const btn = document.getElementById("kta-stats-glob-pdf");
      const orig = btn ? btn.textContent : null;
      if (btn) { btn.disabled = true; btn.textContent = "⏳ " + window.I18n.t("stats.feedback.generation"); }
      exportToPDF({ report: _lastReport }).then(function(res) {
        if (btn) {
          btn.textContent = "✅ " + window.I18n.t("stats.feedback.pdfTelecharge");
          setTimeout(function() { if (btn) { btn.textContent = orig; btn.disabled = false; } }, 1800);
        }
      }).catch(function(e) {
        if (btn) { btn.textContent = orig; btn.disabled = false; }
        window.ktaAlerte(window.I18n.t("stats.feedback.echecPdf", { msg: (e.message || e) }), { type: "erreur" });
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

  // ktaCopierTexte (utils.js) retombe sur execCommand si le presse-papiers est refusé ; rejette en échec.
  function _copyToClipboard(text) {
    if (typeof window.ktaCopierTexte !== "function") {
      return Promise.reject(new Error("ktaCopierTexte indisponible"));
    }
    return window.ktaCopierTexte(text).then(function(ok) {
      if (!ok) throw new Error("clipboard + execCommand KO");
    });
  }

  // ── Export PDF ──────────────────────────────
  // A4 portrait (jsPDF), texte et tableaux seulement, sans carte (décision produit : PDF léger).
  // ⚠️ Helvetica latin1 : un emoji passé à pdf.text() sort en mojibake. Textes en clair seulement.
  async function exportToPDF(opts) {
    opts = opts || {};
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) {
      throw new Error(window.I18n.t("stats.pdf.errJspdf"));
    }
    const jsPDF = window.jspdf.jsPDF;

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
        _drawFooterCredit();
        pdf.addPage();
        y = margin;
      }
    }

    function _drawFooterCredit() {
      pdf.setFontSize(8);
      pdf.setTextColor(140, 140, 140);
      const credit = window.I18n.t("stats.pdf.creditPrefix") + " MyKTAMap " + (rep.runtime ? rep.runtime.appVersion : ((window.__MKM__ && window.__MKM__.build) || "?")) +
                     " - myktamap.fr - " +
                     new Date(rep.timestamp).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR");
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
      pdf.setDrawColor(244, 197, 66);
      pdf.setLineWidth(0.4);
      pdf.line(margin, y, pageW - margin, y);
      y += 5;
      pdf.setTextColor(40, 40, 40);
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
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text(leftLbl,  margin, y);
      pdf.text(rightLbl, pageW - margin, y, { align: "right" });
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

    pdf.setFont("helvetica", "bold");
    _drawTitle("MyKTAMap - " + window.I18n.t("stats.pdf.title"), 18, [30, 58, 138]);
    y += 2;
    pdf.setFont("helvetica", "normal");

    const meta = rep.planMeta;
    pdf.setFontSize(13);
    pdf.setTextColor(244, 197, 66);
    pdf.setFont("helvetica", "bold");
    // Nom, version, auteur = saisie libre : ktaTextePdf (utils.js) retire ce que la police ne sait pas écrire.
    pdf.text(window.ktaTextePdf(meta.name + (meta.version ? "  " + meta.version : "")), margin, y);
    y += 6;
    pdf.setFont("helvetica", "normal");

    if (meta.author)               _drawKV(window.I18n.t("stats.pdf.kv.auteur"),     window.ktaTextePdf(meta.author));
    if (meta.imageW && meta.imageH) _drawKV(window.I18n.t("stats.pdf.kv.dimensions"), meta.imageW + " x " + meta.imageH + " px");
    if (meta.scale && meta.scale !== 1) _drawKV(window.I18n.t("stats.pdf.kv.echelle"), meta.scale.toFixed(1) + " px/m");
    const flags = [];
    if (meta.multiLevel) flags.push(window.I18n.t("stats.pdf.flag.multiNiveau"));
    if (meta.tiledV2)    flags.push(window.I18n.t("stats.pdf.flag.v2Tuile"));
    if (flags.length) _drawKV(window.I18n.t("stats.pdf.kv.flags"), flags.join(", "));
    _drawKV(window.I18n.t("stats.pdf.kv.rapportGenere"), new Date(rep.timestamp).toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR"));
    y += sectionGap;

    const t = rep.totals;
    _drawSectionTitle(window.I18n.t("stats.pdf.sec.totaux"));
    _drawTable2col([
      [window.I18n.t("stats.pdf.row.points"),     t.points     + "  (" + window.I18n.t("stats.pdf.sessionEmbed", { session: rep.session.points,     embed: rep.embedded.points })     + ")"],
      [window.I18n.t("stats.pdf.row.traces"),     t.roads      + "  (" + window.I18n.t("stats.pdf.sessionEmbed", { session: rep.session.roads,      embed: rep.embedded.roads })      + ")"],
      [window.I18n.t("stats.pdf.row.zones"),      t.zones      + "  (" + window.I18n.t("stats.pdf.sessionEmbed", { session: rep.session.zones,      embed: rep.embedded.zones })      + ")"],
      [window.I18n.t("stats.pdf.row.structures"), t.structures + "  (" + window.I18n.t("stats.pdf.sessionEmbed", { session: rep.session.structures, embed: rep.embedded.structures }) + ")"],
      [window.I18n.t("stats.pdf.row.photosPoi"),  String(t.photos)]
    ], window.I18n.t("stats.pdf.col.categorie"), window.I18n.t("stats.pdf.col.total"));
    y += sectionGap;

    if (t.points > 0) {
      _drawSectionTitle(window.I18n.t("stats.pdf.sec.pointsParTag"));
      const sorted = Object.keys(rep.pointsByTag).sort(function(a, b) {
        return rep.pointsByTag[b] - rep.pointsByTag[a];
      });
      _drawTable2col(sorted.map(function(tag) {
        return [tag, rep.pointsByTag[tag]];
      }), window.I18n.t("stats.pdf.col.tag"), window.I18n.t("stats.pdf.col.nombre"));
      y += sectionGap;
    }

    if (t.roads > 0) {
      _drawSectionTitle(window.I18n.t("stats.pdf.sec.tracesParType", { cumul: _formatDist(rep.roadsTotalDistM).replace("²", "2") }));
      const sorted = Object.keys(rep.roadsByType).sort(function(a, b) {
        return rep.roadsByType[b] - rep.roadsByType[a];
      });
      _drawTable3col(sorted.map(function(type) {
        const d = rep.roadsDistByTypeM[type] || 0;
        return [type, rep.roadsByType[type], _formatDist(d)];
      }), window.I18n.t("stats.pdf.col.type"), window.I18n.t("stats.pdf.col.nombre"), window.I18n.t("stats.pdf.col.distance"));
      y += sectionGap;
    }

    if (t.zones > 0) {
      _drawSectionTitle(window.I18n.t("stats.pdf.sec.zonesParType", { cumul: _formatSurf(rep.zonesTotalAreaM2).replace("²", "2") }));
      const sorted = Object.keys(rep.zonesByType).sort(function(a, b) {
        return rep.zonesByType[b] - rep.zonesByType[a];
      });
      _drawTable3col(sorted.map(function(type) {
        const s = rep.zonesAreaByTypeM2[type] || 0;
        return [type, rep.zonesByType[type], _formatSurf(s).replace("²", "2")];
      }), window.I18n.t("stats.pdf.col.type"), window.I18n.t("stats.pdf.col.nombre"), window.I18n.t("stats.pdf.col.surface"));
      y += sectionGap;
    }

    if (t.structures > 0) {
      _drawSectionTitle(window.I18n.t("stats.pdf.sec.structuresParType"));
      const sorted = Object.keys(rep.structsByType).sort(function(a, b) {
        return rep.structsByType[b] - rep.structsByType[a];
      });
      _drawTable2col(sorted.map(function(type) {
        return [type, rep.structsByType[type]];
      }), window.I18n.t("stats.pdf.col.type"), window.I18n.t("stats.pdf.col.nombre"));
      y += sectionGap;
    }

    if (rep.multiLevelBreakdown) {
      _drawSectionTitle(window.I18n.t("stats.pdf.sec.breakdownNiveau"));
      const lvlKeys = Object.keys(rep.multiLevelBreakdown).sort(function(a, b) {
        return parseInt(a, 10) - parseInt(b, 10);
      });
      const rows = lvlKeys.map(function(k) {
        const b = rep.multiLevelBreakdown[k];
        return [
          window.I18n.t("stats.niveau", { n: k }),
          "P:" + b.points + "  T:" + b.roads + "  Z:" + b.zones + "  S:" + b.structures,
          window.I18n.t("stats.pdf.totalSuffix", { n: (b.points + b.roads + b.zones + b.structures) })
        ];
      });
      _drawTable3col(rows, window.I18n.t("stats.pdf.col.niveau"), window.I18n.t("stats.pdf.col.detail"), window.I18n.t("stats.pdf.col.total"));
      y += sectionGap;
    }

    if (rep.georef && rep.georef.pointA && rep.georef.pointB) {
      _drawSectionTitle(window.I18n.t("stats.pdf.sec.georeferencement"));
      const a = rep.georef.pointA;
      const b = rep.georef.pointB;
      _drawKV(window.I18n.t("stats.pdf.kv.pointA"), "px (" + a.x + ", " + a.y + ") -> (" + a.lat + ", " + a.lng + ")");
      _drawKV(window.I18n.t("stats.pdf.kv.pointB"), "px (" + b.x + ", " + b.y + ") -> (" + b.lat + ", " + b.lng + ")");
      y += sectionGap;
    }

    _drawFooterCredit();

    const planName = (meta.name || "Plan").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
    const dateStr  = new Date(rep.timestamp).toISOString().slice(0, 10);
    const filename = "MyKTAMap_Stats_" + planName + "_" + dateStr + ".pdf";
    pdf.save(filename);

    return { ok: true, filename: filename };
  }

  // ── Export CSV ──────────────────────────────
  // Un ZIP de 4 CSV (points, roads, zones, structures) du plan COMPLET : BOM UTF-8 et séparateur `;`
  // (Excel FR), colonne `source` = "session" | "embedded". JSZip est chargé par index.html.

  // RFC 4180 : `;`, `"` ou fin de ligne → cellule entre guillemets, `"` doublés.
  function _csvEscape(v) {
    if (v == null) return "";
    const s = String(v);
    if (s.indexOf(";") >= 0 || s.indexOf("\"") >= 0 || s.indexOf("\n") >= 0 || s.indexOf("\r") >= 0) {
      return "\"" + s.replace(/"/g, "\"\"") + "\"";
    }
    return s;
  }

  // BOM en tête : sans lui, Excel FR se trompe d'encodage.
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
      throw new Error(window.I18n.t("stats.csv.errJszip"));
    }
    const ZipLib = (typeof JSZip === "function") ? JSZip : window.JSZip;
    const zip    = new ZipLib();

    const planConf = window.PLAN_CONFIG || {};
    const planMeta = planConf.plan || {};
    const planName = (planMeta.name || "Plan").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40);
    const dateStr  = new Date().toISOString().slice(0, 10);

    const sessionPts  = (typeof window.getEditorPoints      === "function") ? (window.getEditorPoints()      || []) : [];
    const embeddedPts = (typeof window.getAllEmbeddedPoints === "function") ? (window.getAllEmbeddedPoints() || []) : [];

    const sessionRoads  = (typeof window.getRoads             === "function") ? (window.getRoads()             || []) : [];
    const embeddedRoads = (typeof window.getAllEmbeddedRoads  === "function") ? (window.getAllEmbeddedRoads()  || []) : [];

    const sessionZones  = (typeof window.getZones             === "function") ? (window.getZones()             || []) : [];
    const embeddedZones = (typeof window.getAllEmbeddedZones  === "function") ? (window.getAllEmbeddedZones()  || []) : [];

    const sessionStructs  = (typeof window.getStructures            === "function") ? (window.getStructures()            || []) : [];
    const embeddedStructs = (typeof window.getAllEmbeddedStructures === "function") ? (window.getAllEmbeddedStructures() || []) : [];

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

    const readme =
      window.I18n.t("stats.csv.readme.titre") + "\r\n" +
      window.I18n.t("stats.csv.readme.plan") + " : " + (planMeta.name || "") + "\r\n" +
      window.I18n.t("stats.csv.readme.date") + " : " + new Date().toISOString() + "\r\n\r\n" +
      window.I18n.t("stats.csv.readme.fichiers") + " :\r\n" +
      "  points.csv     — " + window.I18n.t("stats.csv.readme.filePoints") + "\r\n" +
      "  roads.csv      — " + window.I18n.t("stats.csv.readme.fileRoads") + "\r\n" +
      "  zones.csv      — " + window.I18n.t("stats.csv.readme.fileZones") + "\r\n" +
      "  structures.csv — " + window.I18n.t("stats.csv.readme.fileStructs") + "\r\n\r\n" +
      window.I18n.t("stats.csv.readme.format") + " :\r\n" +
      "  - " + window.I18n.t("stats.csv.readme.fmtBom") + "\r\n" +
      "  - " + window.I18n.t("stats.csv.readme.fmtSep") + "\r\n" +
      "  - " + window.I18n.t("stats.csv.readme.fmtSource") + "\r\n" +
      "  - " + window.I18n.t("stats.csv.readme.fmtDist") + "\r\n" +
      "  - " + window.I18n.t("stats.csv.readme.fmtSurf") + "\r\n\r\n" +
      window.I18n.t("stats.csv.readme.ouverture") + "\r\n";
    zip.file("_README.txt", "﻿" + readme);

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

  window.StatsGlobales = {
    ouvrir:        ouvrir,
    fermer:        fermer,
    compute:       compute,
    getReportText: getReportText,
    exportToCSV:   exportToCSV,
    exportToPDF:   exportToPDF,
    // Réutilisé par le Profil (Mes plans) ; signature : cf _renderPieChart.
    renderPieChart: _renderPieChart
  };
})();
