/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// GPXIO.JS — Import / export GPX 1.1 de la session
// =========================
// Export de la session au format GPX 1.1 (TopoDroid, OsmAnd, Avenza, Strava…) et import d'un GPX externe dans
// les annotations de session du plan courant. Requiert un calage (2 points GPS) pour la transformation
// plan ↔ WGS84 ; sans calage, on prévient.
// Format : points → <wpt lat lon> (<name>, <desc>, <sym>, <type>) ; tracés → <trk><trkseg><trkpt/></trkseg></trk>.
// Pas de GPX 1.0 ni d'extensions Garmin/Strava : waypoints + tracks 1.1 standard.
// API : window.GpxIO = {
//   exporter(opts)      → génère + télécharge un .gpx depuis la session courante
//   parser(xmlString)   → { metadata, waypoints, tracks }
//   importer(file)      → lit, parse, transforme, ajoute aux annotations
//   verifierCalibrage() → true si le plan courant a un calage utilisable
// };
// Doc : docs/architecture/exports.md.

(function() {
  "use strict";

  // ── Helpers communs ──────────
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

  // ── Vérification du calage ──────────
  // 🩸 Le calage persisté ne contient que `{pointA, pointB}` (js/kmzExport.js > setCalibration), JAMAIS de
  // `transform` : on vérifie les 8 champs (x/y/lat/lng × A/B) puis on calcule la transformation à la demande
  // (`buildTransform`), comme le KMZ (sessionExporter.js > _exportKmz).

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
    // buildTransform ne doit pas lever (points identiques, distance GPS nulle = calage dégénéré).
    if (typeof window.KmzExport.buildTransform !== "function") return false;
    try {
      window.KmzExport.buildTransformCalib(calib);   // pointC optionnel propagé (affine)
      return true;
    } catch(e) {
      return false;
    }
  }

  function _getTransform() {
    const calib = window.KmzExport && window.KmzExport.getCalibration
                  ? window.KmzExport.getCalibration(_currentPlanId())
                  : null;
    if (!_calibComplet(calib)) return null;
    try {
      return window.KmzExport.buildTransformCalib(calib);   // pointC optionnel propagé (affine)
    } catch(e) {
      return null;
    }
  }

  // ── Exporter : génère + télécharge un .gpx ──────────
  // opts (tout optionnel, défaut = tout inclure) :
  //   {
  //     incPoints:     bool (true)   → points de session
  //     incEmbedded:   bool (true)   → points des calques
  //     incRoads:      bool (true)   → tracés de session
  //     incIti:        bool (false)  → itinéraire (souvent éphémère)
  //     filename:      string (auto) → nom du fichier
  //   }
  // Rend { ok: bool, msg: string, counts: {wpts, trks} }
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
    // Légende du plan (aller-retour, comme kmzExport) : opts.planCustomLegend non nul → embarquée dans
    // <metadata><extensions><myktamap:customLegend>.
    const planCustomLegend = (opts.planCustomLegend && typeof opts.planCustomLegend === "object")
                              ? opts.planCustomLegend : null;

    const sessionPoints   = incPoints && window.getEditorPoints ? (window.getEditorPoints() || []) : [];
    const embeddedPoints  = incEmbedded && window.getAllEmbeddedPoints ? (window.getAllEmbeddedPoints() || []) : [];
    const allPoints       = sessionPoints.concat(embeddedPoints);

    const sessionRoads = incRoads && window.getRoads ? (window.getRoads() || []) : [];
    // Itinéraire exclu sauf demande (éphémère).
    const tracesAExporter = sessionRoads.filter(function(r) {
      if (!r || !Array.isArray(r.points) || r.points.length < 2) return false;
      if (r.type === "itinerary" && !incIti) return false;
      return true;
    });

    const xml = _genererGpx(allPoints, tracesAExporter, t, planCustomLegend);

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

  // ── Générateur GPX 1.1 ──────────
  function _genererGpx(points, tracks, t, planCustomLegend) {
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    // Namespace `xmlns:myktamap` sur <gpx> pour `<myktamap:customLegend>` ; les apps tierces ignorent les
    // namespaces inconnus dans `<extensions>`.
    lines.push('<gpx version="1.1" creator="MyKTAMap (myktamap.fr)" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:myktamap="https://myktamap.fr/gpx/ext/v1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">');

    lines.push('  <metadata>');
    lines.push('    <name>' + _xmlEsc(_currentPlanName()) + '</name>');
    lines.push('    <desc>Export GPX depuis MyKTAMap — ' + points.length + ' point(s), ' + tracks.length + ' tracé(s)</desc>');
    lines.push('    <author><name>MyKTAMap</name><link href="https://myktamap.fr"><text>myktamap.fr</text></link></author>');
    lines.push('    <time>' + _isoNow() + '</time>');
    // Légende du plan en JSON brut (_xmlEsc gère & < >), format {type, version, exportedAt, customLegend} comme
    // myktamap-extras.json du KMZ. Relu par parser() à l'import (gpxImport.js > genererZipMyktamap).
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

    // 🩸 PAS DE `<ele>` (décision produit). En GPX, `<ele>` est l'altitude AU-DESSUS DE LA MER : « -30 » pour une
    // galerie à 30 m sous une colline à 100 m annoncerait un point 30 m sous la mer (130 m d'erreur, plausible donc
    // indétectable). Il faudrait l'altitude du terrain, que l'app ne connaît pas. La profondeur part dans la
    // DESCRIPTION, lue par un humain. (Le KMZ, lui, l'écrit en `relativeToGround`, qui veut dire « sous la surface ».)
    function _mentionProfondeur(level) {
      if (!Number.isInteger(level)) return "";
      if (typeof window.getProfondeurNiveau !== "function") return "";
      const z = window.getProfondeurNiveau(level);
      if (!Number.isFinite(z)) return "";
      return "Niveau " + (level > 0 ? "+" + level : level) +
             " · " + z.toFixed(1) + " m sous la surface";
    }
    function _descAvecProfondeur(desc, level) {
      const m = _mentionProfondeur(level);
      if (!m) return desc || "";
      return desc ? (desc + " — " + m) : m;
    }

    // Waypoints (points de session + calques)
    points.forEach(function(p) {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number") return;
      const ll = window.KmzExport.planToGps(t, p.x, p.y);
      if (!ll) return;
      lines.push('  <wpt lat="' + _fmtCoord(ll.lat) + '" lon="' + _fmtCoord(ll.lng) + '">');
      if (p.nom)         lines.push('    <name>' + _xmlEsc(p.nom) + '</name>');
      const _dp = _descAvecProfondeur(p.description, p.level);
      if (_dp) lines.push('    <desc>' + _xmlEsc(_dp) + '</desc>');
      if (Array.isArray(p.tags) && p.tags.length > 0) {
        // <type> = tag principal
        lines.push('    <type>' + _xmlEsc(p.tags[0]) + '</type>');
        // <sym> = tag aussi (lu par les autres apps)
        lines.push('    <sym>' + _xmlEsc(p.tags[0]) + '</sym>');
      }
      if (Number.isInteger(p.level)) {
        // Niveau dans <cmt> (commentaire libre, conservé par TopoDroid / OsmAnd).
        // Passage entre niveaux : « niveaux=0,-1 » à la suite (relu à l'import).
        const nv = (window.KtaPoiJonction && window.KtaPoiJonction.estJonction(p))
          ? " niveaux=" + window.KtaPoiJonction.niveaux(p).join(",") : "";
        lines.push('    <cmt>MyKTAMap level=' + p.level + nv + '</cmt>');
      }
      lines.push('  </wpt>');
    });

    // Tracks (tracés de session)
    tracks.forEach(function(r) {
      lines.push('  <trk>');
      lines.push('    <name>' + _xmlEsc(r.label || r.type || "Tracé") + '</name>');
      // <desc> du tracé (sa description, + profondeur), pour l'aller-retour.
      const _dr = _descAvecProfondeur(r.description, r.level);
      if (_dr) {
        lines.push('    <desc>' + _xmlEsc(_dr) + '</desc>');
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

  // ── Parser GPX → { metadata, waypoints, tracks } ──────────
  function parser(xmlString) {
    if (!xmlString || typeof xmlString !== "string") {
      throw new Error(window.I18n.t("gpx.err.contentEmpty"));
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");

    // XML mal formé : DOMParser ajoute un <parsererror>.
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error(window.I18n.t("gpx.err.malformed",
        { detail: parseError.textContent.split("\n")[0] }));
    }
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "gpx") {
      throw new Error(window.I18n.t("gpx.err.notGpx"));
    }

    const metadata = {};
    const meta = root.getElementsByTagName("metadata")[0];
    if (meta) {
      const nameEl = meta.getElementsByTagName("name")[0];
      const descEl = meta.getElementsByTagName("desc")[0];
      const timeEl = meta.getElementsByTagName("time")[0];
      if (nameEl) metadata.name = nameEl.textContent.trim();
      if (descEl) metadata.desc = descEl.textContent.trim();
      if (timeEl) metadata.time = timeEl.textContent.trim();

      // Légende du plan (`<extensions><myktamap:customLegend>`) : enveloppe {type, version, exportedAt,
      // customLegend} ou état brut. Utilisée par gpxImport.js > genererZipMyktamap (planConfig.plan.customLegend) ;
      // ignorée par importer(), qui n'agit que sur la session.
      const extEl = meta.getElementsByTagName("extensions")[0];
      if (extEl) {
        // Recherche par localName == "customLegend" sur les enfants directs : getElementsByTagNameNS échoue sur un
        // GPX sans déclaration de namespace (édité à la main).
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

    // Tracks : plusieurs trkseg concaténés en un seul tracé par <trk> (rare sous terre).
    const tracks = [];
    const trks = root.getElementsByTagName("trk");
    for (let i = 0; i < trks.length; i++) {
      const trk = trks[i];
      const nameEl = trk.getElementsByTagName("name")[0];
      const descEl = trk.getElementsByTagName("desc")[0];
      const typeEl = trk.getElementsByTagName("type")[0];
      const cmtEl  = trk.getElementsByTagName("cmt")[0];
      const track = {
        name:  nameEl ? nameEl.textContent.trim() : null,
        desc:  descEl ? descEl.textContent.trim() : null,
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

  // ── Importer : lit, parse, transforme, ajoute aux annotations ──────────
  // Rend une Promise { ok, msg, counts: {wpts, trks}, preview }. confirmAdd=false → aperçu seul, session intacte
  // (l'UI confirme puis rappelle avec true).
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

        const nouveauxPoints = [];
        let outOfBoundsWpt = 0;
        parsed.waypoints.forEach(function(w) {
          const pos = window.KmzExport.gpsToPlan(t, w.lat, w.lng);
          if (!pos) return;
          // Point hors des limites du plan : ignoré ou signalé.
          if (imgW > 0 && imgH > 0) {
            if (pos.x < -50 || pos.x > imgW + 50 || pos.y < -50 || pos.y > imgH + 50) {
              outOfBoundsWpt++;
              return;
            }
          }
          // Niveau depuis le commentaire "MyKTAMap level=N".
          let level = null;
          if (w.cmt && /MyKTAMap level=(-?\d+)/.test(w.cmt)) {
            level = parseInt(RegExp.$1, 10);
          }
          // Tag : sym, sinon type, sinon "info".
          const tag = w.sym || w.type || "info";
          const nouveau = {
            id:          "gpx_" + Date.now() + "_" + nouveauxPoints.length,
            x:           Math.round(pos.x),
            y:           Math.round(pos.y),
            // ⚠️ Nom de repli figé dans la langue d'import (donnée d'annotation, jamais retraduite).
            nom:         w.name || window.I18n.t("gpx.import.pointNameDefault"),
            description: w.desc || "",
            tags:        [tag],
            level:       Number.isInteger(level) ? level : 0
          };
          // Passage entre niveaux : « niveaux=0,-1 » (raccords à revalider sur le plan).
          const mNiv = w.cmt ? String(w.cmt).match(/niveaux=(-?\d+(?:,-?\d+)*)/) : null;
          if (mNiv) nouveau.niveaux = mNiv[1].split(",").map(Number);
          nouveauxPoints.push(nouveau);
        });

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
          let level = null;
          if (trk.cmt && /MyKTAMap level=(-?\d+)/.test(trk.cmt)) {
            level = parseInt(RegExp.$1, 10);
          }
          // Type GPX → type de tracé : intégrés (jonction comprise) ET types CUSTOM (`cust-…`) gardés, sinon
          // « chemin ». 🩸 Même règle que gpxImport.js : deux importeurs GPX ne doivent pas lire différemment le
          // même fichier (rejeter un custom = perte de donnée silencieuse).
          const validTypes = ["principal", "secondaire", "chemin", "itinerary", "jonction"];
          const type = (trk.type &&
                        (validTypes.indexOf(trk.type) >= 0 || String(trk.type).indexOf("cust-") === 0))
                         ? trk.type : "chemin";
          nouveauxTraces.push({
            id:          "gpx_trk_" + Date.now() + "_" + nouveauxTraces.length,
            type:        type,
            // ⚠️ Libellé de repli figé dans la langue d'import (donnée d'annotation, jamais retraduite).
            label:       trk.name || window.I18n.t("gpx.import.trackImportedDefault"),
            description: trk.desc || undefined,  // préserve la desc track
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
          // Aperçu seul : l'UI demande confirmation puis rappelle.
          return resolve({
            ok:      true,
            msg:     window.I18n.t("gpx.previewGenerated"),
            preview: preview,
            // Objets gardés pour le commit ultérieur (_appliquerImport).
            _toApply: { points: nouveauxPoints, tracks: nouveauxTraces }
          });
        }

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

  // Applique l'import aux setters, avec instantané HistoryManager (annulable).
  function _appliquerImport(points, tracks) {
    const _hb = window.HistoryManager ? window.HistoryManager.captureState() : null;

    if (points.length > 0 && window.getEditorPoints && window.setEditorPoints) {
      const current = window.getEditorPoints() || [];
      window.setEditorPoints(current.concat(points));
      if (window.renderEditorPoints) window.renderEditorPoints();
    }

    if (tracks.length > 0 && window.getRoads && window.setRoads) {
      const current = window.getRoads() || [];
      window.setRoads(current.concat(tracks));
    }

    if (window.HistoryManager && _hb) {
      window.HistoryManager.record(
        window.I18n.t("history.action.importGpx", { points: points.length, tracks: tracks.length }),
        _hb
      );
    }
  }

  // ── Téléchargement ──────────
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

  // ── Export global ──────────
  window.GpxIO = {
    exporter:           exporter,
    parser:             parser,
    importer:           importer,
    verifierCalibrage:  verifierCalibrage,
    _appliquerImport:   _appliquerImport   // exposé pour le flow preview→confirm dans l'UI
  };

  console.log("[GpxIO] Module chargé — API window.GpxIO prête");
})();
