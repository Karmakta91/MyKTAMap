/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 */

// =========================
// SESSION REPORT — D1 v1.33.0
// =========================
//
// Génération de rapports de sortie post-mission pour un usage cataphile/spéléo
// CLASSIQUE (≠ Mode Secours, qui a son propre rapport via secoursMode.js).
//
// 3 formats d'export : 📄 Texte presse-papier + 📦 JSON + 📑 PDF (jsPDF).
//
// Périmètre temporel sélectionnable (date range start/end). POI + tracker
// GPS sont filtrés temporellement, mais roads/zones/structures n'ont pas
// de timestamp dans le format actuel → inclus en totalité avec note dans
// le rapport.
//
// Contenu (8 sections optionnelles) :
//   📍 Points (POI) — filtré par date_update
//   🛣️ Tracés (toutes périodes)
//   ⬛ Zones (toutes périodes)
//   🏛️ Structures (toutes périodes)
//   🧭 Tracker GPS — filtré par t (timestamp ms)
//   📸 Photos — pas de filtre temporel MVP (à voir si KARMA insiste)
//   🗺️ Carte miniature (PDF only) — canvas du plan avec overlay POI/tracés/heatmap
//   🔥 Heatmap zones explorées (PDF only) — radial blur sur path tracker
//
// + Note libre user (textarea optionnelle).
//
// API publique :
//   window.SessionReport = {
//     ouvrirModal:               function() { ... }  // ouvre la modale UI
//     _collecterDonneesBrutes:   function() { ... }  // exposé pour tests
//     _genererTexte:             function(data, opts) { ... }
//     _genererJSON:              function(data, opts) { ... }
//   };
//
// Intégration UI : bouton "📋 Générer rapport de sortie" dans la modale
// 📊 Stats globales (statsGlobales.js _renderHtml fin de output).

(function() {
  "use strict";

  // ====================================================================
  // MODULE STATE
  // ====================================================================
  let _modal = null;

  // ====================================================================
  // I18N HELPER — appelé AU RENDU (jamais au load). Fallback = clé brute.
  // ====================================================================
  function t(key, params) {
    return (window.I18n && typeof window.I18n.t === "function")
      ? window.I18n.t(key, params)
      : key;
  }

  // ====================================================================
  // 📊 DATA COLLECTION
  // ====================================================================

  // Récupère TOUTES les données disponibles de la session courante.
  // Retourne un objet structuré, à filtrer ensuite par _filtrerParPeriode.
  // Photos en async via Promise (caller attend la résolution avant export).
  function _collecterDonneesBrutes() {
    const planCfg = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) || {};
    const data = {
      plan: {
        name:    planCfg.name    || "(plan inconnu)",
        version: planCfg.version || "",
        author:  planCfg.author  || "",
        imageW:  planCfg.imageWidth  || 0,
        imageH:  planCfg.imageHeight || 0,
        baseImage: planCfg.baseImage || null,
        scale:   (window.APP_CONFIG && window.APP_CONFIG.scale) || 1,
        multiLevel: !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel),
        planId:  window._currentLoadedPlanId || "default"
      },
      points:     (typeof window.getEditorPoints === "function")        ? (window.getEditorPoints()        || []) : [],
      roads:      (typeof window.getRoads === "function")               ? (window.getRoads()               || []) : [],
      zones:      (typeof window.getZones === "function")               ? (window.getZones()               || []) : [],
      structures: (typeof window.getStructures === "function")          ? (window.getStructures()          || []) : [],
      mesure:     (typeof window.getMeasurePoints === "function")       ? (window.getMeasurePoints()       || []) : [],
      mesureSurf: (typeof window.getMeasurePointsSurface === "function")? (window.getMeasurePointsSurface()|| []) : [],
      tracker: {
        path:     (typeof window.getTrackingPath === "function")     ? (window.getTrackingPath()     || []) : [],
        timeline: (typeof window.getTrackingTimeline === "function") ? (window.getTrackingTimeline() || []) : [],
        startTs:  (typeof window.getTrackingStartTs === "function")  ? (window.getTrackingStartTs()  || null) : null
      },
      photosPromise: null,
      app: {
        version: (window.__MKM__ && window.__MKM__.build) || "?",
        site:    "myktamap.fr"
      }
    };
    if (window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.getAllPhotosForPlan === "function") {
      data.photosPromise = window.MyKTAMapPhotos.getAllPhotosForPlan(data.plan.planId)
        .catch(function(e) { console.warn("[SessionReport] photos KO :", e); return []; });
    } else {
      data.photosPromise = Promise.resolve([]);
    }
    return data;
  }

  // Filtre les données par période [startTs, endTs] en ms epoch.
  // - POI : filter by date_update (YYYY-MM-DD)
  // - Tracker timeline : filter by t (ms epoch)
  // - Roads/zones/structures : inclus tels quels (pas de timestamp natif)
  function _filtrerParPeriode(data, startTs, endTs) {
    const startDay = new Date(startTs).toISOString().slice(0, 10);
    const endDay   = new Date(endTs).toISOString().slice(0, 10);
    const filteredPoints = data.points.filter(function(p) {
      const d = p.date_update || "";
      // Si pas de date_update → inclus (pre-v1.x ou points programmatiques)
      if (!d) return true;
      return d >= startDay && d <= endDay;
    });
    const filteredTimeline = data.tracker.timeline.filter(function(pt) {
      const t = pt.t || 0;
      return t >= startTs && t <= endTs;
    });
    return Object.assign({}, data, {
      points: filteredPoints,
      tracker: Object.assign({}, data.tracker, { timeline: filteredTimeline })
    });
  }

  // ====================================================================
  // 📊 STATS HELPERS
  // ====================================================================

  function _calculerDistanceTrackerPx(timeline) {
    if (!timeline || timeline.length < 2) return 0;
    let dist = 0;
    for (let i = 1; i < timeline.length; i++) {
      const a = timeline[i - 1];
      const b = timeline[i];
      if (typeof a.x === "number" && typeof b.x === "number") {
        const dx = (b.x - a.x);
        const dy = (b.y - a.y);
        dist += Math.sqrt(dx * dx + dy * dy);
      }
    }
    return dist;
  }

  function _calculerDureeTimelineMs(timeline) {
    if (!timeline || timeline.length < 2) return 0;
    const first = timeline[0].t || 0;
    const last  = timeline[timeline.length - 1].t || 0;
    return Math.max(0, last - first);
  }

  function _calculerDistanceRoadsPx(roads) {
    let total = 0;
    (roads || []).forEach(function(r) {
      if (!Array.isArray(r.points) || r.points.length < 2) return;
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1];
        const b = r.points[i];
        if (typeof a.x === "number" && typeof b.x === "number") {
          total += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
        }
      }
    });
    return total;
  }

  function _pxVersM(distPx, scale) {
    return (scale && scale > 0) ? distPx / scale : distPx;
  }

  function _formatDuree(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return h + "h" + String(m).padStart(2, "0") + "m";
    if (m > 0) return m + "m" + String(sec).padStart(2, "0") + "s";
    return sec + "s";
  }

  function _formatDistance(distM, dec) {
    if (typeof window.formatDistance === "function") {
      return window.formatDistance(distM, dec || 1);
    }
    return (distM || 0).toFixed(dec || 1) + " m";
  }

  function _statsParTag(points) {
    const map = {};
    (points || []).forEach(function(p) {
      const tags = Array.isArray(p.tags) ? p.tags.filter(Boolean) : [];
      if (tags.length === 0) {
        map["(sans tag)"] = (map["(sans tag)"] || 0) + 1;
      } else {
        tags.forEach(function(t) {
          map[String(t)] = (map[String(t)] || 0) + 1;
        });
      }
    });
    return map;
  }

  function _statsParType(arr) {
    const map = {};
    (arr || []).forEach(function(item) {
      const t = item.type || "(sans type)";
      map[t] = (map[t] || 0) + 1;
    });
    return map;
  }

  // ====================================================================
  // 📄 TEXTE GÉNÉRATION (Markdown-ish pour WhatsApp / Discord)
  // ====================================================================

  function _genererTexte(data, opts) {
    const o = opts || {};
    const lines = [];
    const sep = "─".repeat(40);

    // En-tête
    lines.push("📋 " + t("report.txt.header") + data.plan.name);
    lines.push(sep);
    const dStart = new Date(o.startTs).toLocaleDateString("fr-FR");
    const dEnd   = new Date(o.endTs).toLocaleDateString("fr-FR");
    if (dStart === dEnd) {
      lines.push("📅 " + t("report.txt.date") + dStart);
    } else {
      lines.push("📅 " + t("report.txt.period") + dStart + " → " + dEnd);
    }
    lines.push("🌍 " + t("report.txt.plan") + data.plan.name + (data.plan.version ? " " + data.plan.version : ""));
    if (data.plan.author) lines.push("👤 " + t("report.txt.author") + data.plan.author);
    lines.push("📱 " + t("report.txt.app") + " " + data.app.version);
    lines.push("");

    // Stats POI
    if (o.includePoints !== false) {
      const tagStats = _statsParTag(data.points);
      lines.push("📍 " + t("report.txt.poi") + data.points.length);
      Object.keys(tagStats).sort().forEach(function(tag) {
        lines.push("   • " + tag + " : " + tagStats[tag]);
      });
      lines.push("");
    }

    // Roads
    if (o.includeRoads !== false) {
      const typeStats = _statsParType(data.roads);
      lines.push("🛣️ " + t("report.txt.roads") + data.roads.length + " " + t("report.txt.allPeriodsNoTs"));
      Object.keys(typeStats).sort().forEach(function(ty) {
        lines.push("   • " + ty + " : " + typeStats[ty]);
      });
      const distM = _pxVersM(_calculerDistanceRoadsPx(data.roads), data.plan.scale);
      if (distM > 0) {
        lines.push("   • " + t("report.txt.roadsDist") + _formatDistance(distM));
      }
      lines.push("");
    }

    // Zones
    if (o.includeZones !== false) {
      const typeStats = _statsParType(data.zones);
      lines.push("⬛ " + t("report.txt.zones") + data.zones.length + " " + t("report.txt.allPeriods"));
      Object.keys(typeStats).sort().forEach(function(ty) {
        lines.push("   • " + ty + " : " + typeStats[ty]);
      });
      lines.push("");
    }

    // Structures
    if (o.includeStructures !== false && data.structures.length > 0) {
      const typeStats = _statsParType(data.structures);
      lines.push("🏛️ " + t("report.txt.structures") + data.structures.length + " " + t("report.txt.allPeriods"));
      Object.keys(typeStats).sort().forEach(function(ty) {
        lines.push("   • " + ty + " : " + typeStats[ty]);
      });
      lines.push("");
    }

    // Tracker
    if (o.includeTracker !== false && data.tracker.timeline.length > 0) {
      const distM = _pxVersM(_calculerDistanceTrackerPx(data.tracker.timeline), data.plan.scale);
      const duree = _calculerDureeTimelineMs(data.tracker.timeline);
      lines.push("🧭 " + t("report.txt.tracker"));
      lines.push("   • " + t("report.txt.trackerDist") + _formatDistance(distM));
      lines.push("   • " + t("report.txt.duration") + _formatDuree(duree));
      lines.push("   • " + t("report.txt.trackerPts") + data.tracker.timeline.length);
      lines.push("");
    }

    // Photos
    if (o.includePhotos !== false && typeof o.photosCount === "number" && o.photosCount > 0) {
      lines.push("📸 " + t("report.txt.photos") + o.photosCount);
      lines.push("");
    }

    // Note libre
    if (o.note && o.note.trim()) {
      lines.push("📝 " + t("report.txt.note"));
      lines.push(sep);
      lines.push(o.note.trim());
      lines.push("");
    }

    lines.push(sep);
    lines.push(t("report.txt.generatedBy") + " " + data.app.version + " — " + new Date().toLocaleString("fr-FR"));
    lines.push("https://myktamap.fr");

    return lines.join("\n");
  }

  // ====================================================================
  // 📦 JSON GÉNÉRATION
  // ====================================================================

  function _genererJSON(data, opts) {
    const o = opts || {};
    const out = {
      type:        "devmap-report",
      version:     "1.0",
      generatedAt: new Date().toISOString(),
      period: {
        startTs: o.startTs || null,
        endTs:   o.endTs   || null,
        startISO: o.startTs ? new Date(o.startTs).toISOString() : null,
        endISO:   o.endTs   ? new Date(o.endTs).toISOString()   : null
      },
      plan: data.plan,
      app:  data.app,
      stats: {
        pointsCount:     data.points.length,
        roadsCount:      data.roads.length,
        zonesCount:      data.zones.length,
        structuresCount: data.structures.length,
        pointsByTag:     _statsParTag(data.points),
        roadsByType:     _statsParType(data.roads),
        zonesByType:     _statsParType(data.zones),
        trackerDistanceM: _pxVersM(_calculerDistanceTrackerPx(data.tracker.timeline), data.plan.scale),
        trackerDurationMs: _calculerDureeTimelineMs(data.tracker.timeline),
        trackerPointCount: data.tracker.timeline.length,
        roadsDistanceM:    _pxVersM(_calculerDistanceRoadsPx(data.roads), data.plan.scale)
      }
    };
    if (o.includePoints     !== false) out.points     = data.points;
    if (o.includeRoads      !== false) out.roads      = data.roads;
    if (o.includeZones      !== false) out.zones      = data.zones;
    if (o.includeStructures !== false) out.structures = data.structures;
    if (o.includeTracker    !== false) out.tracker    = data.tracker;
    if (o.note && o.note.trim()) out.note = o.note.trim();
    return out;
  }

  // ====================================================================
  // 🖼️ CARTE MINIATURE (canvas → PNG dataURL)
  // ====================================================================

  // Génère une PNG miniature du plan avec overlay POI/tracés/heatmap.
  // Retourne Promise<dataURL> ou null si pas possible.
  // Cible : largeur max 800px (downscaled), pour intégration PDF.
  //
  // 🩹 v1.33.0-fix1 — KARMA bug : "en pdf, la carte exposé n'affiche pas
  // l'image principal". Cause : la tentative custom de charger
  // "data/<planId>/<baseImage>" ne marchait pas pour les plans selfhost,
  // les plans ZIP-loaded, ou avec des chemins relatifs différents.
  // Fix : on utilise window.MyKTAMapExporterGenererCanvas (helper global
  // exposé par js/exporter.js depuis v1.10.3) qui gère DÉJÀ correctement
  // tous les cas : selfhost, server, ZIP, multi-layer, etc. C'est le même
  // helper que Mode Secours utilise pour ses cartes miniatures PDF
  // (cf js/secoursMode.js ligne 4208+).
  // Stratégie :
  //   1. Préférence : exporter.generCanvas → canvas full résolution
  //      avec image + data layers, SANS annotations
  //   2. Downscale à 800px max
  //   3. Overlay session filtrée (heatmap, tracker, roads, zones, POI)
  //      par-dessus
  function _genererCarteMiniature(data, opts) {
    const W = data.plan.imageW;
    const H = data.plan.imageH;
    if (!W || !H) return Promise.resolve(null);

    const MAX_W = 800;
    const ratio = Math.min(1, MAX_W / W);
    const cw = Math.round(W * ratio);
    const ch = Math.round(H * ratio);

    return new Promise(function(resolve) {
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");

      // Fond sombre (fallback ultime + visible dans les zones transparentes du plan)
      ctx.fillStyle = "#1a1f2e";
      ctx.fillRect(0, 0, cw, ch);

      function _finishWithOverlay() {
        try {
          _dessinerOverlay(ctx, data, opts, ratio);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch (e) {
          console.warn("[SessionReport] toDataURL KO :", e);
          resolve(null);
        }
      }

      // ─── Préférence : helper exporter ──────────────────
      if (typeof window.MyKTAMapExporterGenererCanvas === "function") {
        window.MyKTAMapExporterGenererCanvas({
          scale:             1,
          bg:                "image",
          includeImgLayers:  true,
          includeDataLayers: true,
          // PAS d'annotations exporter → on dessine notre overlay filtré par-dessus
          ann: {
            points: false, roads: false, zones: false, structures: false,
            jonctions: false, itineraire: false
          }
        }).then(function(fullCanvas) {
          if (fullCanvas && fullCanvas.width > 0 && fullCanvas.height > 0) {
            // Downscale full → mini (800px max width)
            ctx.drawImage(fullCanvas, 0, 0, cw, ch);
          } else {
            console.warn("[SessionReport] exporter canvas vide, fallback fond sombre");
          }
          _finishWithOverlay();
        }).catch(function(e) {
          console.warn("[SessionReport] exporter canvas KO :", e);
          _finishWithOverlay();
        });
        return;
      }

      // ─── Fallback : image base directe (cas exporter indispo) ─
      // Note : ce path n'est pratiquement jamais pris en prod car
      // exporter.js est en cache PWA depuis v1.10.3.
      if (data.plan.baseImage) {
        const planUrl = "data/" + data.plan.planId + "/" + data.plan.baseImage;
        const img = new Image();
        img.onload = function() {
          ctx.drawImage(img, 0, 0, cw, ch);
          _finishWithOverlay();
        };
        img.onerror = function() {
          console.warn("[SessionReport] Image plan non chargeable, fallback fond sombre");
          _finishWithOverlay();
        };
        img.src = planUrl;
        setTimeout(function() {
          if (!img.complete) {
            console.warn("[SessionReport] Image plan timeout, fallback");
            _finishWithOverlay();
          }
        }, 3000);
      } else {
        _finishWithOverlay();
      }
    });
  }

  function _dessinerOverlay(ctx, data, opts, ratio) {
    // 1. Heatmap tracker (radial blur sur path)
    if (opts.includeHeatmap !== false && data.tracker.timeline.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#ff6b6b";
      data.tracker.timeline.forEach(function(pt) {
        if (typeof pt.x === "number" && typeof pt.y === "number") {
          const r = 12;
          const g = ctx.createRadialGradient(pt.x * ratio, pt.y * ratio, 0, pt.x * ratio, pt.y * ratio, r);
          g.addColorStop(0, "rgba(255, 107, 107, 0.6)");
          g.addColorStop(1, "rgba(255, 107, 107, 0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(pt.x * ratio, pt.y * ratio, r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }

    // 2. Tracker path runtime (polyline cyan)
    if (data.tracker.path && data.tracker.path.length > 1) {
      ctx.save();
      ctx.strokeStyle = "#00d4ff";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      const p0 = data.tracker.path[0];
      ctx.moveTo(p0.x * ratio, p0.y * ratio);
      for (let i = 1; i < data.tracker.path.length; i++) {
        const p = data.tracker.path[i];
        if (typeof p.x === "number") ctx.lineTo(p.x * ratio, p.y * ratio);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Roads
    if (opts.includeRoads !== false && data.roads.length > 0) {
      ctx.save();
      ctx.lineWidth = 1.5;
      data.roads.forEach(function(r) {
        if (!Array.isArray(r.points) || r.points.length < 2) return;
        // Couleur par type
        const c = (r.type === "principal" ? "#6ce28a" :
                   r.type === "secondaire" ? "#a78bfa" :
                   r.type === "chemin" ? "#f4c542" : "#8cb4ff");
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.moveTo(r.points[0].x * ratio, r.points[0].y * ratio);
        for (let i = 1; i < r.points.length; i++) {
          ctx.lineTo(r.points[i].x * ratio, r.points[i].y * ratio);
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    // 4. Zones (filled polygon)
    if (opts.includeZones !== false && data.zones.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      data.zones.forEach(function(z) {
        if (!Array.isArray(z.points) || z.points.length < 3) return;
        const c = (z.type === "eau" ? "#3b82f6" :
                   z.type === "remblais" ? "#6b7280" :
                   z.type === "effondrement" ? "#ef4444" :
                   z.type === "inaccessible" ? "#991b1b" : "#8892a4");
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(z.points[0].x * ratio, z.points[0].y * ratio);
        for (let i = 1; i < z.points.length; i++) {
          ctx.lineTo(z.points[i].x * ratio, z.points[i].y * ratio);
        }
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    }

    // 5. Points (POI) — small ambre dots
    if (opts.includePoints !== false && data.points.length > 0) {
      ctx.save();
      ctx.fillStyle = "#f4c542";
      ctx.strokeStyle = "#1a1f2e";
      ctx.lineWidth = 1;
      data.points.forEach(function(p) {
        if (typeof p.x !== "number") return;
        ctx.beginPath();
        ctx.arc(p.x * ratio, p.y * ratio, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  // ====================================================================
  // 📑 PDF GÉNÉRATION (jsPDF)
  // ====================================================================

  // Strip emojis + caractères hors-latin1 pour jsPDF Helvetica par défaut.
  // jsPDF supporte Unicode uniquement avec polices custom embeddées —
  // overkill pour MVP. Cf. secoursMode.js _stripPourPdf pattern identique.
  function _stripPourPdf(s) {
    if (!s) return "";
    return String(s)
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
      .replace(/[\u{2600}-\u{26FF}]/gu, "")
      .replace(/[\u{2700}-\u{27BF}]/gu, "")
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "")
      .trim();
  }

  function _genererPDF(data, opts, mapDataUrl) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error(t("report.err.jspdf"));
    }
    const pdf = new window.jspdf.jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 15;
    let y = margin;

    function _ensurePageSpace(needed) {
      if (y + needed > pageH - 15) {
        pdf.addPage();
        y = margin;
      }
    }

    // ─── HEADER ─────────────────────────────────────────────
    pdf.setFontSize(16); pdf.setFont(undefined, "bold");
    pdf.text(_stripPourPdf(t("report.pdf.title")), margin, y); y += 8;
    pdf.setFontSize(11);
    pdf.text(_stripPourPdf(data.plan.name) + (data.plan.version ? " " + data.plan.version : ""), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");
    const dStart = new Date(opts.startTs).toLocaleDateString("fr-FR");
    const dEnd   = new Date(opts.endTs).toLocaleDateString("fr-FR");
    pdf.text(dStart === dEnd
      ? _stripPourPdf(t("report.pdf.date")) + dStart
      : _stripPourPdf(t("report.pdf.period")) + dStart + " - " + dEnd, margin, y); y += 4;
    if (data.plan.author) {
      pdf.text(_stripPourPdf(t("report.pdf.author")) + _stripPourPdf(data.plan.author), margin, y); y += 4;
    }
    pdf.text(_stripPourPdf(t("report.pdf.generatedBy")) + " " + data.app.version + " - " + new Date().toLocaleString("fr-FR"), margin, y);
    y += 8;

    // ─── CARTE MINIATURE ───────────────────────────────────
    if (mapDataUrl && opts.includeMapMini !== false) {
      try {
        const imgW = pageW - 2 * margin;
        const ratio = data.plan.imageH / data.plan.imageW;
        const imgH = Math.min(imgW * ratio, 100);
        _ensurePageSpace(imgH + 8);
        pdf.addImage(mapDataUrl, "JPEG", margin, y, imgW, imgH);
        y += imgH + 6;
        // Légende
        pdf.setFontSize(8); pdf.setFont(undefined, "italic");
        pdf.text(_stripPourPdf(t("report.pdf.mapLegend")),
                 margin, y);
        y += 8;
        pdf.setFont(undefined, "normal");
      } catch (e) {
        console.warn("[SessionReport] PDF addImage KO :", e);
      }
    }

    // ─── STATS ─────────────────────────────────────────────
    _ensurePageSpace(20);
    pdf.setFontSize(12); pdf.setFont(undefined, "bold");
    pdf.text(_stripPourPdf(t("report.pdf.stats")), margin, y); y += 6;
    pdf.setFontSize(9); pdf.setFont(undefined, "normal");

    if (opts.includePoints !== false) {
      pdf.text(_stripPourPdf(t("report.pdf.poi")) + data.points.length, margin, y); y += 4;
      const tagStats = _statsParTag(data.points);
      Object.keys(tagStats).sort().forEach(function(tag) {
        _ensurePageSpace(4);
        pdf.text("    - " + _stripPourPdf(tag) + " : " + tagStats[tag], margin, y); y += 4;
      });
      y += 2;
    }
    if (opts.includeRoads !== false) {
      _ensurePageSpace(8);
      pdf.text(_stripPourPdf(t("report.pdf.roads")) + data.roads.length + " " + _stripPourPdf(t("report.pdf.allPeriods")), margin, y); y += 4;
      const distM = _pxVersM(_calculerDistanceRoadsPx(data.roads), data.plan.scale);
      if (distM > 0) {
        pdf.text("    " + _stripPourPdf(t("report.pdf.totalDist")) + _formatDistance(distM, 0), margin, y); y += 4;
      }
      y += 2;
    }
    if (opts.includeZones !== false) {
      _ensurePageSpace(4);
      pdf.text(_stripPourPdf(t("report.pdf.zones")) + data.zones.length + " " + _stripPourPdf(t("report.pdf.allPeriods")), margin, y); y += 4;
      y += 2;
    }
    if (opts.includeStructures !== false && data.structures.length > 0) {
      _ensurePageSpace(4);
      pdf.text(_stripPourPdf(t("report.pdf.structures")) + data.structures.length + " " + _stripPourPdf(t("report.pdf.allPeriods")), margin, y); y += 4;
      y += 2;
    }
    if (opts.includeTracker !== false && data.tracker.timeline.length > 0) {
      _ensurePageSpace(12);
      const distM = _pxVersM(_calculerDistanceTrackerPx(data.tracker.timeline), data.plan.scale);
      const duree = _calculerDureeTimelineMs(data.tracker.timeline);
      pdf.text(_stripPourPdf(t("report.pdf.tracker")), margin, y); y += 4;
      pdf.text("    " + _stripPourPdf(t("report.pdf.trackerDist")) + _formatDistance(distM, 0), margin, y); y += 4;
      pdf.text("    " + _stripPourPdf(t("report.pdf.duration")) + _formatDuree(duree), margin, y); y += 4;
      pdf.text("    " + _stripPourPdf(t("report.pdf.trackerPts")) + data.tracker.timeline.length, margin, y); y += 4;
      y += 2;
    }
    if (opts.includePhotos !== false && typeof opts.photosCount === "number" && opts.photosCount > 0) {
      _ensurePageSpace(4);
      pdf.text(_stripPourPdf(t("report.pdf.photos")) + opts.photosCount, margin, y); y += 4;
      y += 2;
    }

    // ─── NOTE LIBRE ────────────────────────────────────────
    if (opts.note && opts.note.trim()) {
      _ensurePageSpace(20);
      y += 4;
      pdf.setFontSize(12); pdf.setFont(undefined, "bold");
      pdf.text(_stripPourPdf(t("report.pdf.note")), margin, y); y += 6;
      pdf.setFontSize(9); pdf.setFont(undefined, "normal");
      const noteLines = pdf.splitTextToSize(_stripPourPdf(opts.note), pageW - 2 * margin);
      noteLines.forEach(function(line) {
        _ensurePageSpace(4);
        pdf.text(line, margin, y); y += 4;
      });
    }

    // ─── FOOTER PAGES ─────────────────────────────────────
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);
      pdf.setFontSize(7); pdf.setFont(undefined, "italic");
      pdf.setTextColor(120, 120, 120);
      pdf.text("MyKTAMap " + data.app.version + " - myktamap.fr - " + _stripPourPdf(t("report.pdf.footer")) + " " + i + "/" + pageCount,
               pageW / 2, pageH - 6, { align: "center" });
      pdf.setTextColor(0, 0, 0);
    }

    return pdf;
  }

  // ====================================================================
  // 💾 DOWNLOAD HELPERS
  // ====================================================================

  function _telechargerBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function _telechargerTexte(txt, filename) {
    _telechargerBlob(new Blob([txt], { type: "text/plain;charset=utf-8" }), filename);
  }

  function _telechargerJSON(obj, filename) {
    _telechargerBlob(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json;charset=utf-8" }), filename);
  }

  function _filename(planName, ext) {
    const safePlan = String(planName || "plan").replace(/[^a-z0-9_-]/gi, "_");
    const date = new Date().toISOString().slice(0, 10);
    return "rapport_" + safePlan + "_" + date + "." + (ext || "txt");
  }

  // ====================================================================
  // 🖥️ UI MODAL
  // ====================================================================

  function _checkboxRow(id, label, defaultChecked) {
    const chk = defaultChecked ? " checked" : "";
    return '<label class="kta-report-cb-row">' +
             '<input type="checkbox" id="' + id + '"' + chk + '>' +
             '<span>' + label + '</span>' +
           '</label>';
  }

  function ouvrirModal() {
    if (_modal) { _modal.remove(); _modal = null; }

    // Détermine dates par défaut :
    // - startTs : début du tracker actuel si dispo, sinon hier
    // - endTs : maintenant
    const trackerStart = (typeof window.getTrackingStartTs === "function") ? window.getTrackingStartTs() : null;
    const startTs = trackerStart || (Date.now() - 86400 * 1000);
    const endTs = Date.now();

    function _toDateInput(ts) {
      return new Date(ts).toISOString().slice(0, 10);
    }
    const startDateStr = _toDateInput(startTs);
    const endDateStr   = _toDateInput(endTs);

    const modal = document.createElement("div");
    modal.id = "kta-report-modal";
    modal.className = "kta-readme-modal-overlay";
    const T = window.I18n.t.bind(window.I18n);
    modal.innerHTML = '<div class="kta-readme-modal-boite kta-report-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">📋 ' + T("report.title") + '</span>' +
        '<button class="kta-panneau-close" id="kta-report-close" type="button" aria-label="' + T("report.close") + '">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">📅 ' + T("report.period_title") + '</div>' +
          '<div class="kta-report-period">' +
            '<label>' + T("report.period_from") + ' <input class="kta-report-date" id="kta-report-start" type="date" value="' + startDateStr + '"></label>' +
            '<label>' + T("report.period_to") + ' <input class="kta-report-date" id="kta-report-end"   type="date" value="' + endDateStr   + '"></label>' +
          '</div>' +
          '<p class="kta-report-hint">' +
            T("report.period_hint") +
          '</p>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">👁️ ' + T("report.preview_title") + '</div>' +
          '<div id="kta-report-preview" class="kta-report-preview">⏳ ' + T("report.preview_computing") + '</div>' +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">📦 ' + T("report.sections_title") + '</div>' +
          _checkboxRow("kta-report-inc-points",  "📍 " + T("report.sec_points"),  true) +
          _checkboxRow("kta-report-inc-roads",   "🛣️ " + T("report.sec_roads"),   true) +
          _checkboxRow("kta-report-inc-zones",   "⬛ " + T("report.sec_zones"),    true) +
          _checkboxRow("kta-report-inc-struct",  "🏛️ " + T("report.sec_structures"), true) +
          _checkboxRow("kta-report-inc-tracker", "🧭 " + T("report.sec_tracker"),  true) +
          _checkboxRow("kta-report-inc-photos",  "📸 " + T("report.sec_photos"),   true) +
          _checkboxRow("kta-report-inc-mapmini", "🗺️ " + T("report.sec_mapmini"),  true) +
          _checkboxRow("kta-report-inc-heatmap", "🔥 " + T("report.sec_heatmap"),  true) +
        '</div>' +

        '<div class="kta-aide-section">' +
          '<div class="kta-aide-section-titre">📝 ' + T("report.note_title") + '</div>' +
          '<textarea id="kta-report-note" class="kta-report-note" rows="4" ' +
            'placeholder="' + T("report.note_placeholder") + '"></textarea>' +
        '</div>' +

        '<div class="kta-report-actions">' +
          '<button class="kta-btn kta-btn-primary" id="kta-report-btn-pdf"  type="button">📑 ' + T("report.btn_pdf") + '</button>' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-report-btn-json" type="button">📄 ' + T("report.btn_json") + '</button>' +
          '<button class="kta-btn kta-btn-ghost"   id="kta-report-btn-text" type="button">📝 ' + T("report.btn_text") + '</button>' +
        '</div>' +
        '<div id="kta-report-status" class="kta-report-status"></div>' +

      '</div>' +
    '</div>';
    document.documentElement.appendChild(modal);
    _modal = modal;

    function fermer() {
      if (_modal) { _modal.remove(); _modal = null; }
    }
    document.getElementById("kta-report-close").addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape" && _modal) {
        fermer();
        document.removeEventListener("keydown", onEsc);
      }
    });

    // Données de base (1 fois — pas refetchées à chaque preview)
    const baseData = _collecterDonneesBrutes();

    function _readOpts() {
      const sInput = document.getElementById("kta-report-start").value;
      const eInput = document.getElementById("kta-report-end").value;
      return {
        startTs: new Date(sInput + "T00:00:00").getTime(),
        endTs:   new Date(eInput + "T23:59:59").getTime(),
        includePoints:     document.getElementById("kta-report-inc-points").checked,
        includeRoads:      document.getElementById("kta-report-inc-roads").checked,
        includeZones:      document.getElementById("kta-report-inc-zones").checked,
        includeStructures: document.getElementById("kta-report-inc-struct").checked,
        includeTracker:    document.getElementById("kta-report-inc-tracker").checked,
        includePhotos:     document.getElementById("kta-report-inc-photos").checked,
        includeMapMini:    document.getElementById("kta-report-inc-mapmini").checked,
        includeHeatmap:    document.getElementById("kta-report-inc-heatmap").checked,
        note:              document.getElementById("kta-report-note").value
      };
    }

    function _setStatus(msg, isError) {
      const el = document.getElementById("kta-report-status");
      if (el) {
        el.textContent = msg || "";
        el.style.color = isError ? "#ff6b6b" : "#8cb4ff";
      }
    }

    function _refreshPreview() {
      const opts = _readOpts();
      const filtered = _filtrerParPeriode(baseData, opts.startTs, opts.endTs);
      const distM = _pxVersM(_calculerDistanceTrackerPx(filtered.tracker.timeline), baseData.plan.scale);
      const duree = _calculerDureeTimelineMs(filtered.tracker.timeline);
      const preview = document.getElementById("kta-report-preview");
      if (preview) {
        const T = window.I18n.t.bind(window.I18n);
        preview.innerHTML =
          '<div class="kta-report-preview-row">' +
            '📍 <strong>' + filtered.points.length + '</strong> ' + T("report.preview_poi") +
            ' · 🛣️ <strong>' + baseData.roads.length + '</strong> ' + T("report.preview_roads") +
            ' · ⬛ <strong>' + baseData.zones.length + '</strong> ' + T("report.preview_zones") +
            (baseData.structures.length > 0 ? ' · 🏛️ <strong>' + baseData.structures.length + '</strong>' : '') +
          '</div>' +
          (filtered.tracker.timeline.length > 0 ?
            '<div class="kta-report-preview-row">' +
              '🧭 ' + T("report.preview_tracker", { dist: _formatDistance(distM), duree: _formatDuree(duree), count: filtered.tracker.timeline.length }) +
            '</div>' :
            '<div class="kta-report-preview-row kta-report-preview-dim">' + T("report.preview_no_tracker") + '</div>'
          );
      }
    }
    _refreshPreview();
    document.getElementById("kta-report-start").addEventListener("change", _refreshPreview);
    document.getElementById("kta-report-end").addEventListener("change", _refreshPreview);

    // === EXPORT HANDLERS ===

    document.getElementById("kta-report-btn-text").addEventListener("click", function() {
      const opts = _readOpts();
      const filtered = _filtrerParPeriode(baseData, opts.startTs, opts.endTs);
      _setStatus("⏳ " + window.I18n.t("report.status_gen_text"));
      baseData.photosPromise.then(function(photos) {
        opts.photosCount = photos.length;
        const txt = _genererTexte(filtered, opts);
        const fn = _filename(filtered.plan.name, "txt");
        _telechargerTexte(txt, fn);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function() {
            _setStatus("✅ " + window.I18n.t("report.status_text_ok_copied"));
          }).catch(function() {
            _setStatus("✅ " + window.I18n.t("report.status_text_ok_noclip"));
          });
        } else {
          _setStatus("✅ " + window.I18n.t("report.status_text_ok"));
        }
      });
    });

    document.getElementById("kta-report-btn-json").addEventListener("click", function() {
      const opts = _readOpts();
      const filtered = _filtrerParPeriode(baseData, opts.startTs, opts.endTs);
      _setStatus("⏳ " + window.I18n.t("report.status_gen_json"));
      baseData.photosPromise.then(function(photos) {
        const payload = _genererJSON(filtered, opts);
        if (opts.includePhotos && photos.length > 0) {
          // Métadonnées photos seulement, pas les blobs (trop lourd en JSON
          // texte — le user peut les exporter via Enregistrer session ZIP)
          payload.photosMeta = photos.map(function(p) {
            return { id: p.id, pointId: p.pointId, mime: p.mime, size: p.size };
          });
          payload.stats.photosCount = photos.length;
        }
        const fn = _filename(filtered.plan.name, "json");
        _telechargerJSON(payload, fn);
        _setStatus("✅ " + window.I18n.t("report.status_json_ok"));
      });
    });

    document.getElementById("kta-report-btn-pdf").addEventListener("click", function() {
      const opts = _readOpts();
      const filtered = _filtrerParPeriode(baseData, opts.startTs, opts.endTs);
      _setStatus("⏳ " + window.I18n.t("report.status_gen_pdf"));
      Promise.all([
        baseData.photosPromise,
        (opts.includeMapMini !== false)
          ? _genererCarteMiniature(filtered, opts)
          : Promise.resolve(null)
      ]).then(function(results) {
        const photos = results[0];
        const mapDataUrl = results[1];
        opts.photosCount = photos.length;
        try {
          const pdf = _genererPDF(filtered, opts, mapDataUrl);
          const fn = _filename(filtered.plan.name, "pdf");
          pdf.save(fn);
          _setStatus("✅ " + window.I18n.t("report.status_pdf_ok"));
        } catch (e) {
          console.error("[SessionReport] PDF KO :", e);
          _setStatus("❌ " + window.I18n.t("report.status_pdf_err", { error: (e.message || e) }), true);
        }
      });
    });
  }

  // ====================================================================
  // 🔌 EXPORT API
  // ====================================================================
  window.SessionReport = {
    ouvrirModal:              ouvrirModal,
    // Exposés pour debug / tests / réutilisation
    _collecterDonneesBrutes:  _collecterDonneesBrutes,
    _filtrerParPeriode:       _filtrerParPeriode,
    _genererTexte:            _genererTexte,
    _genererJSON:             _genererJSON
  };

  console.log("[SessionReport] Module chargé (D1 — Rapport post-mission v1.33.0)");
})();
