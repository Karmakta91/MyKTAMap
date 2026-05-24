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

    // Points par tag
    if (t.points > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">📍 Points par tag</div>';
      html += '<div class="kta-stats-glob-list">';
      Object.keys(rep.pointsByTag).sort(function(a, b) {
        return rep.pointsByTag[b] - rep.pointsByTag[a];
      }).forEach(function(tag) {
        html += '<div class="kta-stats-glob-row">' +
                  '<span class="kta-stats-glob-row-lbl"><code>' + _escapeHtml(tag) + '</code></span>' +
                  '<span class="kta-stats-glob-row-num">' + rep.pointsByTag[tag] + '</span>' +
                '</div>';
      });
      html += '</div></div>';
    }

    // Tracés par type + distance
    if (t.roads > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🛣️ Tracés ' +
              '<span class="kta-stats-glob-total">' + _formatDist(rep.roadsTotalDistM) + ' cumulés</span></div>';
      html += '<div class="kta-stats-glob-list">';
      const sortedTypes = Object.keys(rep.roadsByType).sort(function(a, b) {
        return rep.roadsByType[b] - rep.roadsByType[a];
      });
      sortedTypes.forEach(function(type) {
        const n = rep.roadsByType[type];
        const d = rep.roadsDistByTypeM[type] || 0;
        html += '<div class="kta-stats-glob-row">' +
                  '<span class="kta-stats-glob-row-lbl">' + _escapeHtml(type) + '</span>' +
                  '<span class="kta-stats-glob-row-num">' + n + ' &middot; ' + _formatDist(d) + '</span>' +
                '</div>';
      });
      html += '</div></div>';
    }

    // Zones par type + surface
    if (t.zones > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">⬛ Zones ' +
              '<span class="kta-stats-glob-total">' + _formatSurf(rep.zonesTotalAreaM2) + ' cumulés</span></div>';
      html += '<div class="kta-stats-glob-list">';
      Object.keys(rep.zonesByType).sort(function(a, b) {
        return rep.zonesByType[b] - rep.zonesByType[a];
      }).forEach(function(type) {
        const n = rep.zonesByType[type];
        const s = rep.zonesAreaByTypeM2[type] || 0;
        html += '<div class="kta-stats-glob-row">' +
                  '<span class="kta-stats-glob-row-lbl">' + _escapeHtml(type) + '</span>' +
                  '<span class="kta-stats-glob-row-num">' + n + ' &middot; ' + _formatSurf(s) + '</span>' +
                '</div>';
      });
      html += '</div></div>';
    }

    // Structures par type
    if (t.structures > 0) {
      html += '<div class="kta-stats-glob-section">';
      html += '<div class="kta-stats-glob-section-titre">🏛️ Structures</div>';
      html += '<div class="kta-stats-glob-list">';
      Object.keys(rep.structsByType).sort(function(a, b) {
        return rep.structsByType[b] - rep.structsByType[a];
      }).forEach(function(type) {
        html += '<div class="kta-stats-glob-row">' +
                  '<span class="kta-stats-glob-row-lbl">' + _escapeHtml(type) + '</span>' +
                  '<span class="kta-stats-glob-row-num">' + rep.structsByType[type] + '</span>' +
                '</div>';
      });
      html += '</div></div>';
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

  // ───────── EXPORT API ─────────
  window.StatsGlobales = {
    ouvrir:        ouvrir,
    fermer:        fermer,
    compute:       compute,
    getReportText: getReportText
  };
})();
