/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// GPX IO — Import / Export GPX 1.1 (v1.14.0)
// =========================
// Permet d'exporter une session MyKTAMap au format GPX 1.1 (compatible
// apps spéléo / outdoor : TopoDroid, OsmAnd, Avenza, GPSies, Strava, etc.)
// et d'importer un fichier GPX externe pour ajouter ses points/tracés aux
// annotations de session du plan courant.
//
// Requiert un calibrage KMZ existant (2 points GPS) pour faire la
// transformation plan ↔ WGS84. Si pas calibré, on alerte l'user.
//
// Format GPX 1.1 :
//   - Points → <wpt lat="..." lon="..."> avec <name>, <desc>, <sym>, <type>
//   - Tracés → <trk><name/><type/><trkseg><trkpt lat="..." lon="..."/></trkseg></trk>
//
// API publique :
//   window.GpxIO = {
//     exporter(opts)   → génère + télécharge un .gpx depuis la session courante
//     parser(xmlString) → parse GPX XML → { metadata, waypoints, tracks }
//     importer(file)    → lit file + parse + transforme + ajoute aux annotations
//     verifierCalibrage() → bool — true si le plan courant a un calibrage utilisable
//   };
//
// Note : pas de support GPX 1.0 (vieille spec) ni des extensions Garmin/Strava
// custom — uniquement waypoints + tracks 1.1 standard.
// =========================

(function() {
  "use strict";

  // ============================================================
  // HELPERS COMMUNS
  // ============================================================
  function _xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function _fmtCoord(n, dec) {
    return Number(n).toFixed(dec != null ? dec : 8);
  }

  function _isoNow() {
    return new Date().toISOString();
  }

  function _currentPlanId() {
    return window._currentLoadedPlanId || "default";
  }

  function _currentPlanName() {
    return (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "MyKTAMap session";
  }

  // ============================================================
  // CHECK CALIBRAGE
  // ============================================================
  //
  // 🐛 v1.21.0-fix4 (KARMA : "bug export GPX malgré le calibrage il me dit
  // que je ne l'ai pas fait") : avant ce fix, on cherchait `calib.transform`
  // dans le calibrage persisté — MAIS `KmzExport.setCalibration` ne stocke
  // que `{pointA, pointB}` (cf js/kmzExport.js > setCalibration ligne 178),
  // pas de champ `transform`. Le transform est calculé À LA DEMANDE via
  // `buildTransform(planA, planB, gpsA, gpsB)`. Donc `verifierCalibrage()`
  // retournait toujours `false` et l'export GPX bloquait avec "pas calibré"
  // même quand le user avait bien saisi ses 8 champs.
  //
  // Fix : vérifie les 8 champs requis (x/y/lat/lng × pointA/pointB) puis
  // calcule `transform` au vol. Symétrique exact à ce que fait KMZ
  // (sessionExporter.js > _exportKmz ligne 2811).

  function _calibComplet(calib) {
    if (!calib || !calib.pointA || !calib.pointB) return false;
    const pA = calib.pointA;
    const pB = calib.pointB;
    function _isNum(v) { return typeof v === "number" && Number.isFinite(v); }
    return _isNum(pA.x) && _isNum(pA.y) && _isNum(pA.lat) && _isNum(pA.lng)
        && _isNum(pB.x) && _isNum(pB.y) && _isNum(pB.lat) && _isNum(pB.lng);
  }

  function verifierCalibrage() {
    if (!window.KmzExport || typeof window.KmzExport.getCalibration !== "function") return false;
    const calib = window.KmzExport.getCalibration(_currentPlanId());
    if (!_calibComplet(calib)) return false;
    // Vérifie en plus que buildTransform ne lève pas (ex: 2 points identiques
    // ou GPS à distance nulle → throw côté KmzExport.buildTransform pour
    // signaler un calibrage dégénéré).
    if (typeof window.KmzExport.buildTransform !== "function") return false;
    try {
      window.KmzExport.buildTransformCalib(calib);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
      return true;
    } catch(e) {
      // Calibrage présent mais dégénéré (2 points identiques, etc.)
      return false;
    }
  }

  function _getTransform() {
    const calib = window.KmzExport && window.KmzExport.getCalibration
                  ? window.KmzExport.getCalibration(_currentPlanId())
                  : null;
    if (!_calibComplet(calib)) return null;
    try {
      return window.KmzExport.buildTransformCalib(calib);   // 📐 v1.73.0 : pointC optionnel propagé (affine)
    } catch(e) {
      return null;
    }
  }

  // ============================================================
  // EXPORTER — Génère + télécharge un .gpx
  // ============================================================
  //
  // opts (tous optionnels — défaut = tout inclure) :
  //   {
  //     incPoints:     bool (default true)   → editorPoints session
  //     incEmbedded:   bool (default true)   → points embedded data layers
  //     incRoads:      bool (default true)   → tracés session
  //     incIti:        bool (default false)  → itinéraire (souvent éphémère)
  //     filename:      string (default auto) → nom du fichier .gpx
  //   }
  //
  // Retourne { ok: bool, msg: string, counts: {wpts, trks} }
  function exporter(opts) {
    opts = opts || {};
    if (!verifierCalibrage()) {
      return {
        ok:  false,
        msg: window.I18n.t("gpx.notCalibrated")
      };
    }
    const t = _getTransform();
    const incPoints   = opts.incPoints   !== false;
    const incEmbedded = opts.incEmbedded !== false;
    const incRoads    = opts.incRoads    !== false;
    const incIti      = opts.incIti      === true;
    // 🆕 v1.18.1 — Roundtrip légende plan-level (symétrique kmzExport).
    // Si opts.planCustomLegend est présent et non-null, embed dans
    // <extensions><myktamap:customLegend>...</myktamap:customLegend></extensions>
    // sous <metadata>. Skip silencieux si null/absent.
    const planCustomLegend = (opts.planCustomLegend && typeof opts.planCustomLegend === "object")
                              ? opts.planCustomLegend : null;

    // Collecte des annotations à exporter
    const sessionPoints   = incPoints && window.getEditorPoints ? (window.getEditorPoints() || []) : [];
    const embeddedPoints  = incEmbedded && window.getAllEmbeddedPoints ? (window.getAllEmbeddedPoints() || []) : [];
    const allPoints       = sessionPoints.concat(embeddedPoints);

    const sessionRoads = incRoads && window.getRoads ? (window.getRoads() || []) : [];
    // Filtre itinéraire (= éphémère, généralement on ne veut pas l'exporter)
    const tracesAExporter = sessionRoads.filter(function(r) {
      if (!r || !Array.isArray(r.points) || r.points.length < 2) return false;
      if (r.type === "itinerary" && !incIti) return false;
      return true;
    });

    // Génère le GPX XML
    const xml = _genererGpx(allPoints, tracesAExporter, t, planCustomLegend);

    // Télécharge
    const planName = _currentPlanName().replace(/[^\w\-]+/g, "_");
    const date     = new Date().toISOString().split("T")[0];
    const filename = opts.filename || ("myktamap_" + planName + "_" + date + ".gpx");
    _telechargerFichier(xml, filename, "application/gpx+xml");

    return {
      ok:     true,
      msg:    window.I18n.t("gpx.exportOk"),
      counts: {
        wpts: allPoints.length,
        trks: tracesAExporter.length
      },
      filename: filename
    };
  }

  // ============================================================
  // GÉNÉRATEUR GPX 1.1
  // ============================================================
  function _genererGpx(points, tracks, t, planCustomLegend) {
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    // 🆕 v1.18.1 — Ajout du namespace `xmlns:myktamap` au root <gpx> pour
    // permettre l'extension `<myktamap:customLegend>` sous <metadata>.
    // Strictement transparent pour les apps tierces (TopoDroid, OsmAnd…)
    // qui ignorent les namespaces inconnus dans les `<extensions>` standards.
    lines.push('<gpx version="1.1" creator="MyKTAMap (myktamap.fr)" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:myktamap="https://myktamap.fr/gpx/ext/v1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">');

    // Métadonnées
    lines.push('  <metadata>');
    lines.push('    <name>' + _xmlEsc(_currentPlanName()) + '</name>');
    lines.push('    <desc>Export GPX depuis MyKTAMap — ' + points.length + ' point(s), ' + tracks.length + ' tracé(s)</desc>');
    lines.push('    <author><name>MyKTAMap</name><link href="https://myktamap.fr"><text>myktamap.fr</text></link></author>');
    lines.push('    <time>' + _isoNow() + '</time>');
    // 🆕 v1.18.1 — Roundtrip légende plan-level. Embed le state complet en
    // JSON brut (CDATA inutile car _xmlEsc gère les & et < / > du JSON).
    // Format ouvert {type, version, exportedAt, customLegend} aligné sur
    // myktamap-extras.json côté KMZ (cf §59.2 CLAUDE.md). Les apps tierces
    // ignorent les <extensions> sous <metadata>. Parsé par parser() côté
    // import → utilisé par gpxImport.js > genererZipMyktamap au ré-import.
    if (planCustomLegend) {
      const extrasPayload = JSON.stringify({
        type:          "myktamap-gpx-extras",
        version:       1,
        exportedAt:    _isoNow(),
        customLegend:  planCustomLegend
      });
      lines.push('    <extensions>');
      lines.push('      <myktamap:customLegend>' + _xmlEsc(extrasPayload) + '</myktamap:customLegend>');
      lines.push('    </extensions>');
    }
    lines.push('  </metadata>');

    // Waypoints (= points editor + embedded)
    points.forEach(function(p) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
      const ll = window.KmzExport.planToGps(t, p.x, p.y);
      if (!ll) return;
      lines.push('  <wpt lat="' + _fmtCoord(ll.lat) + '" lon="' + _fmtCoord(ll.lng) + '">');
      if (p.nom)         lines.push('    <name>' + _xmlEsc(p.nom) + '</name>');
      if (p.description) lines.push('    <desc>' + _xmlEsc(p.description) + '</desc>');
      if (Array.isArray(p.tags) && p.tags.length > 0) {
        // GPX <type> = tag principal
        lines.push('    <type>' + _xmlEsc(p.tags[0]) + '</type>');
        // GPX <sym> = symbole (= aussi le tag pour lecture par autres apps)
        lines.push('    <sym>' + _xmlEsc(p.tags[0]) + '</sym>');
      }
      if (Number.isInteger(p.level)) {
        // Niveau M-LVL stocké en cmt (commentaire libre, conservé par TopoDroid/OsmAnd)
        lines.push('    <cmt>MyKTAMap level=' + p.level + '</cmt>');
      }
      lines.push('  </wpt>');
    });

    // Tracks (= roads session)
    tracks.forEach(function(r) {
      lines.push('  <trk>');
      lines.push('    <name>' + _xmlEsc(r.label || r.type || "Tracé") + '</name>');
      // v1.15.0 — ajout de <desc> sur les tracks (description du road) pour
      // roundtrip MyKTAMap. Avant ce fix, la description du tracé était
      // perdue à l'export GPX (seul le name était écrit).
      if (r.description) {
        lines.push('    <desc>' + _xmlEsc(r.description) + '</desc>');
      }
      lines.push('    <type>' + _xmlEsc(r.type || "trace") + '</type>');
      if (Number.isInteger(r.level)) {
        lines.push('    <cmt>MyKTAMap level=' + r.level + '</cmt>');
      }
      lines.push('    <trkseg>');
      r.points.forEach(function(pt) {
        if (!pt || typeof pt.x !== "number" || typeof pt.y !== "number") return;
        const ll = window.KmzExport.planToGps(t, pt.x, pt.y);
        if (!ll) return;
        lines.push('      <trkpt lat="' + _fmtCoord(ll.lat) + '" lon="' + _fmtCoord(ll.lng) + '"/>');
      });
      lines.push('    </trkseg>');
      lines.push('  </trk>');
    });

    lines.push('</gpx>');
    return lines.join("\n");
  }

  // ============================================================
  // PARSER GPX → { metadata, waypoints, tracks }
  // ============================================================
  function parser(xmlString) {
    if (!xmlString || typeof xmlString !== "string") {
      throw new Error(window.I18n.t("gpx.err.contentEmpty"));
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");

    // Détecte erreur de parsing (DOMParser ajoute un <parsererror> en cas de XML mal formé)
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error(window.I18n.t("gpx.err.malformed",
        { detail: parseError.textContent.split("\n")[0] }));
    }
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "gpx") {
      throw new Error(window.I18n.t("gpx.err.notGpx"));
    }

    // Métadonnées (optionnel)
    const metadata = {};
    const meta = root.getElementsByTagName("metadata")[0];
    if (meta) {
      const nameEl = meta.getElementsByTagName("name")[0];
      const descEl = meta.getElementsByTagName("desc")[0];
      const timeEl = meta.getElementsByTagName("time")[0];
      if (nameEl) metadata.name = nameEl.textContent.trim();
      if (descEl) metadata.desc = descEl.textContent.trim();
      if (timeEl) metadata.time = timeEl.textContent.trim();

      // 🆕 v1.18.1 — Roundtrip légende plan-level (symétrique kmzImport).
      // Extrait `<extensions><myktamap:customLegend>` qui peut contenir
      // soit le payload wrapper complet {type, version, exportedAt,
      // customLegend} soit (legacy/permissif) directement l'état customLegend.
      // Utilisé par gpxImport.js > genererZipMyktamap pour injecter dans
      // planConfig.plan.customLegend au ré-import GPX → ZIP autonome.
      // Ignoré silencieusement par importer() qui n'opère que sur session.
      const extEl = meta.getElementsByTagName("extensions")[0];
      if (extEl) {
        // getElementsByTagNameNS gère mal les fichiers sans déclaration namespace
        // (cas où l'user a édité manuellement le GPX). On scanne tous les enfants
        // direct par localName == "customLegend" pour être tolérant.
        let clEl = null;
        const children = extEl.children || [];
        for (let i = 0; i < children.length; i++) {
          const c = children[i];
          const ln = (c.localName || c.nodeName || "").toLowerCase();
          if (ln === "customlegend" || ln.endsWith(":customlegend")) {
            clEl = c;
            break;
          }
        }
        if (clEl) {
          const raw = (clEl.textContent || "").trim();
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              // 2 formats acceptés : wrapper {type, customLegend} OU état brut
              if (parsed && parsed.customLegend && typeof parsed.customLegend === "object") {
                metadata.customLegend = parsed.customLegend;
              } else if (parsed && (parsed.labels || parsed.hidden || parsed.customEntries)) {
                metadata.customLegend = parsed;
              }
            } catch(e) {
              console.warn("[GpxIO] ⚠️ Échec parse <myktamap:customLegend> (ignoré) :", e);
            }
          }
        }
      }
    }

    // Waypoints
    const waypoints = [];
    const wpts = root.getElementsByTagName("wpt");
    for (let i = 0; i < wpts.length; i++) {
      const w = wpts[i];
      const lat = parseFloat(w.getAttribute("lat"));
      const lng = parseFloat(w.getAttribute("lon"));
      if (isNaN(lat) || isNaN(lng)) continue;
      const wpt = { lat: lat, lng: lng };
      const nameEl = w.getElementsByTagName("name")[0];
      const descEl = w.getElementsByTagName("desc")[0];
      const symEl  = w.getElementsByTagName("sym")[0];
      const typeEl = w.getElementsByTagName("type")[0];
      const cmtEl  = w.getElementsByTagName("cmt")[0];
      if (nameEl) wpt.name = nameEl.textContent.trim();
      if (descEl) wpt.desc = descEl.textContent.trim();
      if (symEl)  wpt.sym  = symEl.textContent.trim();
      if (typeEl) wpt.type = typeEl.textContent.trim();
      if (cmtEl)  wpt.cmt  = cmtEl.textContent.trim();
      waypoints.push(wpt);
    }

    // Tracks (peut contenir plusieurs trkseg, on les concat en 1 seul tracé
    // par <trk> pour simplifier — les segments multi sont rares en pratique
    // pour des plans souterrains)
    const tracks = [];
    const trks = root.getElementsByTagName("trk");
    for (let i = 0; i < trks.length; i++) {
      const trk = trks[i];
      const nameEl = trk.getElementsByTagName("name")[0];
      const descEl = trk.getElementsByTagName("desc")[0];  // v1.15.0
      const typeEl = trk.getElementsByTagName("type")[0];
      const cmtEl  = trk.getElementsByTagName("cmt")[0];
      const track = {
        name:  nameEl ? nameEl.textContent.trim() : null,
        desc:  descEl ? descEl.textContent.trim() : null,  // v1.15.0
        type:  typeEl ? typeEl.textContent.trim() : null,
        cmt:   cmtEl  ? cmtEl.textContent.trim()  : null,
        points: []
      };
      const segs = trk.getElementsByTagName("trkseg");
      for (let s = 0; s < segs.length; s++) {
        const pts = segs[s].getElementsByTagName("trkpt");
        for (let p = 0; p < pts.length; p++) {
          const pt = pts[p];
          const lat = parseFloat(pt.getAttribute("lat"));
          const lng = parseFloat(pt.getAttribute("lon"));
          if (isNaN(lat) || isNaN(lng)) continue;
          track.points.push({ lat: lat, lng: lng });
        }
      }
      if (track.points.length >= 2) tracks.push(track);
    }

    return { metadata: metadata, waypoints: waypoints, tracks: tracks };
  }

  // ============================================================
  // IMPORTER — Lit file + parse + transforme + ajoute aux annotations
  // ============================================================
  // Retourne une Promise : { ok, msg, counts: {wpts, trks}, preview: {...} }
  // Si confirmAdd=false, on retourne juste la preview sans toucher à la session
  // (l'UI peut afficher une modale de confirmation puis re-appeler avec true).
  function importer(file, opts) {
    opts = opts || {};
    const confirmAdd = opts.confirmAdd === true;

    return new Promise(function(resolve) {
      if (!verifierCalibrage()) {
        return resolve({
          ok:  false,
          msg: window.I18n.t("gpx.notCalibratedImport")
        });
      }

      if (!file || !(file instanceof Blob)) {
        return resolve({ ok: false, msg: window.I18n.t("gpx.noFileSelected") });
      }

      const reader = new FileReader();
      reader.onerror = function() {
        resolve({ ok: false, msg: window.I18n.t("gpx.readError") });
      };
      reader.onload = function(e) {
        let parsed;
        try {
          parsed = parser(e.target.result);
        } catch(err) {
          return resolve({ ok: false, msg: window.I18n.t("gpx.parseError", { msg: err.message }) });
        }

        const t = _getTransform();
        const imgW = window.APP_CONFIG && window.APP_CONFIG.imageWidth  || 0;
        const imgH = window.APP_CONFIG && window.APP_CONFIG.imageHeight || 0;

        // Transforme waypoints en points plan
        const nouveauxPoints = [];
        let outOfBoundsWpt = 0;
        parsed.waypoints.forEach(function(w) {
          const pos = window.KmzExport.gpsToPlan(t, w.lat, w.lng);
          if (!pos) return;
          // Check si le point tombe dans les bounds du plan (sinon ignore ou warn)
          if (imgW > 0 && imgH > 0) {
            if (pos.x < -50 || pos.x > imgW + 50 || pos.y < -50 || pos.y > imgH + 50) {
              outOfBoundsWpt++;
              return;
            }
          }
          // Détecte le level depuis le commentaire "MyKTAMap level=N"
          let level = null;
          if (w.cmt && /MyKTAMap level=(-?\d+)/.test(w.cmt)) {
            level = parseInt(RegExp.$1, 10);
          }
          // Détermine le tag (sym/type) — par défaut "info" si rien
          const tag = w.sym || w.type || "info";
          nouveauxPoints.push({
            id:          "gpx_" + Date.now() + "_" + nouveauxPoints.length,
            x:           Math.round(pos.x),
            y:           Math.round(pos.y),
            // ⚠️ i18n « figé à la langue d'import » : fallback de nom écrit comme
            // donnée d'annotation (affiché sur la carte). Non re-traduit ensuite.
            nom:         w.name || window.I18n.t("gpx.import.pointNameDefault"),
            description: w.desc || "",
            tags:        [tag],
            level:       Number.isInteger(level) ? level : 0
          });
        });

        // Transforme tracks en roads plan
        const nouveauxTraces = [];
        let outOfBoundsTrk = 0;
        parsed.tracks.forEach(function(trk) {
          const points = [];
          let allOutOfBounds = true;
          trk.points.forEach(function(pt) {
            const pos = window.KmzExport.gpsToPlan(t, pt.lat, pt.lng);
            if (!pos) return;
            if (imgW > 0 && imgH > 0) {
              if (pos.x >= -50 && pos.x <= imgW + 50 && pos.y >= -50 && pos.y <= imgH + 50) {
                allOutOfBounds = false;
              }
            }
            points.push({ x: Math.round(pos.x), y: Math.round(pos.y) });
          });
          if (points.length < 2) return;
          if (allOutOfBounds && imgW > 0) {
            outOfBoundsTrk++;
            return;
          }
          // Détecte le level
          let level = null;
          if (trk.cmt && /MyKTAMap level=(-?\d+)/.test(trk.cmt)) {
            level = parseInt(RegExp.$1, 10);
          }
          // Map type GPX → type road MyKTAMap (si reconnu).
          // v1.15.0 — ajout de "jonction" pour roundtrip complet (sans ça,
          // un tracé jonction exporté revenait en chemin à l'import).
          const validTypes = ["principal", "secondaire", "chemin", "itinerary", "jonction"];
          const type = (trk.type && validTypes.indexOf(trk.type) >= 0) ? trk.type : "chemin";
          nouveauxTraces.push({
            id:          "gpx_trk_" + Date.now() + "_" + nouveauxTraces.length,
            type:        type,
            // ⚠️ i18n « figé à la langue d'import » : fallback de label écrit comme
            // donnée d'annotation (affiché sur la carte). Non re-traduit ensuite.
            label:       trk.name || window.I18n.t("gpx.import.trackImportedDefault"),
            description: trk.desc || undefined,  // v1.15.0 — préserve la desc track
            points:      points,
            level:       Number.isInteger(level) ? level : 0
          });
        });

        const preview = {
          wpts:           nouveauxPoints.length,
          trks:           nouveauxTraces.length,
          outOfBoundsWpt: outOfBoundsWpt,
          outOfBoundsTrk: outOfBoundsTrk,
          metadata:       parsed.metadata
        };

        if (!confirmAdd) {
          // Preview only — l'UI doit demander confirmation et rappeler
          return resolve({
            ok:      true,
            msg:     window.I18n.t("gpx.previewGenerated"),
            preview: preview,
            // On stocke les nouveaux objets sur l'instance pour les commit
            // ultérieur via un second appel à _appliquerImport()
            _toApply: { points: nouveauxPoints, tracks: nouveauxTraces }
          });
        }

        // confirmAdd === true → on ajoute direct aux annotations
        _appliquerImport(nouveauxPoints, nouveauxTraces);
        resolve({
          ok:      true,
          msg:     window.I18n.t("gpx.importOk", { wpts: preview.wpts, trks: preview.trks }),
          counts:  preview,
          preview: preview
        });
      };
      reader.readAsText(file);
    });
  }

  // Applique l'import aux setters MyKTAMap (avec snapshot HistoryManager
  // pour pouvoir undo si l'user regrette).
  function _appliquerImport(points, tracks) {
    // Snapshot avant pour Undo
    const _hb = window.HistoryManager ? window.HistoryManager.captureState() : null;

    // Ajout points session
    if (points.length > 0 && window.getEditorPoints && window.setEditorPoints) {
      const current = window.getEditorPoints() || [];
      window.setEditorPoints(current.concat(points));
      if (window.renderEditorPoints) window.renderEditorPoints();
    }

    // Ajout tracés session
    if (tracks.length > 0 && window.getRoads && window.setRoads) {
      const current = window.getRoads() || [];
      window.setRoads(current.concat(tracks));
    }

    // Record dans HistoryManager pour permettre Undo
    if (window.HistoryManager && _hb) {
      window.HistoryManager.record(
        window.I18n.t("history.action.importGpx", { points: points.length, tracks: tracks.length }),
        _hb
      );
    }
  }

  // ============================================================
  // HELPER DOWNLOAD
  // ============================================================
  function _telechargerFichier(content, filename, mime) {
    const blob = new Blob([content], { type: mime || "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  // ============================================================
  // EXPORT GLOBAL
  // ============================================================
  window.GpxIO = {
    exporter:           exporter,
    parser:             parser,
    importer:           importer,
    verifierCalibrage:  verifierCalibrage,
    _appliquerImport:   _appliquerImport   // exposé pour le flow preview→confirm dans l'UI
  };

  console.log("[GpxIO] Module chargé — API window.GpxIO prête");
})();
