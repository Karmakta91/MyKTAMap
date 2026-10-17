/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// GPXIMPORT.JS — GPX → ZIP de plan MyKTAMap (convertisseur du Générateur)
// =====================================================================
// Inverse de l'export GPX (gpxIO.js). Un GPX n'a PAS d'image : on GÉNÈRE un canvas vierge aux dimensions choisies,
// calé automatiquement sur l'emprise GPS du fichier pour que les annotations tombent aux bons pixels (l'image se
// remplace ensuite en mode Modifier).
// Étapes : 1. lecture + parsing GPX 1.1 (window.GpxIO.parser) ; 2. détection MyKTAMap (creator +
// <cmt>MyKTAMap level=N>) ; 3. emprise GPS (waypoints + trkpts) ; 4. canvas vierge (PNG) + calage 2 points (coin
// BL = (lat_min, lng_min), TR = (lat_max, lng_max)) ; 5. waypoints / tracks → points / roads (tag, type, level par
// <sym>/<type>/<cmt>) ; 6. ZIP : plan-config.json + canvas + calque "imported.json" + plan.georef.
// API : window.GpxImport
//   - estGpxMyktamap(gpxDoc)                → boolean
//   - extraireGpx(file)                     → Promise<{ gpxDoc, parsed }>
//   - extraireBoundsGps(parsed)             → { latMin, latMax, lngMin, lngMax } | null
//   - genererCanvasVierge(w, h, color)      → Promise<Blob>
//   - ingestParsed(parsed, transform, opts) → { points, roads, stats }
//   - genererZipMyktamap(opts)              → Promise<Blob>
// Doc : docs/architecture/plans-loader.md.

(function() {
  "use strict";

  // ── Détection d'un GPX MyKTAMap (aller-retour) ──────────
  function estGpxMyktamap(gpxDoc) {
    if (!gpxDoc) return false;
    const root = gpxDoc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "gpx") return false;
    // 1) Attribut creator de la racine
    const creator = root.getAttribute("creator") || "";
    if (/MyKTAMap/i.test(creator)) return true;
    // 2) <author><name>MyKTAMap...</name>
    const author = root.querySelector("metadata > author > name");
    if (author && /MyKTAMap/i.test(author.textContent || "")) return true;
    // 3) Au moins un <cmt>MyKTAMap level=N</cmt> (posé par gpxIO.js)
    const cmts = root.getElementsByTagName("cmt");
    for (let i = 0; i < cmts.length; i++) {
      if (/MyKTAMap level=/i.test(cmts[i].textContent || "")) return true;
    }
    return false;
  }

  // ── Extraction (fichier → parsed) ──────────
  async function extraireGpx(file) {
    if (!file || !(file instanceof Blob)) throw new Error(window.I18n.t("gpx.err.fileInvalid"));
    const text = await file.text();
    const parser = new DOMParser();
    const gpxDoc = parser.parseFromString(text, "application/xml");
    const err = gpxDoc.querySelector("parsererror");
    if (err) throw new Error(window.I18n.t("gpx.err.malformedShort",
      { detail: (err.textContent || "").split("\n")[0] }));

    if (!window.GpxIO || typeof window.GpxIO.parser !== "function") {
      throw new Error(window.I18n.t("gpx.err.gpxioMissing"));
    }
    const parsed = window.GpxIO.parser(text);
    return { gpxDoc: gpxDoc, parsed: parsed, rawText: text };
  }

  // ── Emprise GPS ──────────
  // Rend { latMin, latMax, lngMin, lngMax, count } ou null si vide.
  function extraireBoundsGps(parsed) {
    if (!parsed || !parsed.waypoints || !parsed.tracks) return null;
    let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
    let count = 0;
    function _maj(lat, lng) {
      if (!isFinite(lat) || !isFinite(lng)) return;
      if (lat < latMin) latMin = lat;
      if (lat > latMax) latMax = lat;
      if (lng < lngMin) lngMin = lng;
      if (lng > lngMax) lngMax = lng;
      count++;
    }
    parsed.waypoints.forEach(function(w) { _maj(w.lat, w.lng); });
    parsed.tracks.forEach(function(trk) {
      trk.points.forEach(function(p) { _maj(p.lat, p.lng); });
    });
    if (count === 0) return null;
    // Marge de 5 % : une annotation pile sur le bord du canvas serait invisible.
    const dLat = (latMax - latMin) * 0.05 || 0.0005;
    const dLng = (lngMax - lngMin) * 0.05 || 0.0005;
    return {
      latMin: latMin - dLat,
      latMax: latMax + dLat,
      lngMin: lngMin - dLng,
      lngMax: lngMax + dLng,
      count: count
    };
  }

  // ── Canvas vierge (PNG) ──────────
  // Les 4 couleurs du générateur : white, gray, black, sepia.
  function genererCanvasVierge(width, height, color) {
    return new Promise(function(resolve, reject) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        const fills = {
          white: "#ffffff",
          gray:  "#cfcfcf",
          black: "#1a1a1a",
          sepia: "#d9c9a8"
        };
        if (color !== "transparent") {      // transparent = aucun remplissage
          ctx.fillStyle = fills[color] || fills.sepia;
          ctx.fillRect(0, 0, width, height);
        }
        canvas.toBlob(function(blob) {
          if (!blob) reject(new Error(window.I18n.t("gpx.err.canvasNull")));
          else resolve(blob);
        }, "image/png");
      } catch(e) { reject(e); }
    });
  }

  // ── Ingestion parsed → points / roads (transform KmzExport) ──────────
  // transform : { metresParPixel, rotation, latMoyenne, refPlan, refGps, imageW, imageH } ; mêmes structures que
  // kmzImport.ingestPlacemarks.
  function ingestParsed(parsed, transform, opts) {
    opts = opts || {};
    const stats = { kept: 0, skipped: 0, outOfBounds: 0 };
    const out = { points: [], roads: [], stats: stats };
    const W = transform.imageW, H = transform.imageH;
    function _inBounds(p) {
      return p.x >= -50 && p.x <= W + 50 && p.y >= -50 && p.y <= H + 50;
    }

    // Waypoints → points
    parsed.waypoints.forEach(function(w, i) {
      const px = window.KmzExport.gpsToPlan(transform, w.lat, w.lng);
      if (!px || !_inBounds(px)) { stats.outOfBounds++; return; }
      // Tag : <sym>, <type>, opts.pointTag, sinon "default".
      const tag = w.sym || w.type || opts.pointTag || "default";
      // Niveau depuis <cmt>MyKTAMap level=N</cmt>
      let level = 0;
      if (w.cmt && /MyKTAMap level=(-?\d+)/.test(w.cmt)) {
        level = parseInt(RegExp.$1, 10);
      }
      out.points.push({
        id:          "gpx_imp_" + (Date.now() + i),
        nom:         w.name || "(Point GPX)",
        description: w.desc || undefined,
        x:           Math.round(px.x),
        y:           Math.round(px.y),
        tags:        [tag],
        level:       level
      });
      stats.kept++;
    });

    // Tracks → roads. Les types CUSTOM (`cust-…`, entrées dessinables de la légende) sont valides : sinon ils
    // reviendraient en `opts.roadType` à l'aller-retour (même règle que gpxIO.js et kmzImport).
    const validTypes = ["principal", "secondaire", "chemin", "itinerary", "jonction"];
    function _isValidRoadType(t) {
      if (typeof t !== "string" || !t) return false;
      if (validTypes.indexOf(t) >= 0) return true;
      if (t.indexOf("cust-") === 0) return true;  // custom Légende
      return false;
    }
    parsed.tracks.forEach(function(trk, i) {
      const projected = [];
      trk.points.forEach(function(p) {
        const px = window.KmzExport.gpsToPlan(transform, p.lat, p.lng);
        if (!px) return;
        projected.push({ x: Math.round(px.x), y: Math.round(px.y) });
      });
      if (projected.length < 2) { stats.skipped++; return; }
      const type = _isValidRoadType(trk.type) ? trk.type : (opts.roadType || "chemin");
      let level = 0;
      if (trk.cmt && /MyKTAMap level=(-?\d+)/.test(trk.cmt)) {
        level = parseInt(RegExp.$1, 10);
      }
      out.roads.push({
        id:          "gpx_imp_trk_" + (Date.now() + i),
        type:        type,
        // ⚠️ Libellé de repli figé dans la langue d'import (donnée d'annotation, jamais retraduite).
        label:       trk.name || window.I18n.t("gpx.import.trackLabelDefault"),
        description: trk.desc || undefined,
        points:      projected,
        level:       level
      });
      stats.kept++;
    });

    return out;
  }

  // ── Génération du ZIP ──────────
  // opts = {
  //   planName, planVersion, planAuthor: string,
  //   parsed: { metadata, waypoints, tracks } (extraireGpx),
  //   bounds: { latMin, latMax, lngMin, lngMax } (extraireBoundsGps),
  //   canvasWidth / canvasHeight: number (4000 par défaut),
  //   canvasColor: string    (white|gray|black|sepia, sepia par défaut),
  //   pointTag: string       (tag de repli des wpts sans <sym>),
  //   roadType: string       (type de repli des trks sans <type>),
  //   tilingV2: boolean      (re-tuilage V2, coûteux mais utile sur mobile),
  //   multiLevel: boolean    (plan.multiLevel),
  //   onTilingProgress: fn(done, total, currentZ)
  // }
  async function genererZipMyktamap(opts) {
    if (typeof JSZip === "undefined") throw new Error(window.I18n.t("gpx.err.jszip"));
    if (!opts || !opts.parsed || !opts.bounds) {
      throw new Error(window.I18n.t("gpx.err.genZipReq"));
    }
    if (!window.KmzExport || !window.KmzExport.buildTransform) {
      throw new Error(window.I18n.t("gpx.err.kmzExportMissing"));
    }

    const W = opts.canvasWidth  || 4000;
    const H = opts.canvasHeight || 4000;
    const color = opts.canvasColor || "sepia";

    // Calage automatique, 2 points : BL = (x=0, y=H) ↔ (lat_min, lng_min), TR = (x=W, y=0) ↔ (lat_max, lng_max) ;
    // image droite (Y inversé Leaflet : y=0 en haut = lat_max).
    const pA_plan = { x: 0, y: H };
    const pB_plan = { x: W, y: 0 };
    const pA_gps  = { lat: opts.bounds.latMin, lng: opts.bounds.lngMin };
    const pB_gps  = { lat: opts.bounds.latMax, lng: opts.bounds.lngMax };
    let transform;
    try {
      transform = window.KmzExport.buildTransform(pA_plan, pB_plan, pA_gps, pB_gps);
      // Dimensions de l'image dans le transform (lues par ingestParsed).
      transform.imageW = W;
      transform.imageH = H;
    } catch(e) {
      throw new Error(window.I18n.t("gpx.err.autoCalib", { msg: e.message }));
    }

    const ingested = ingestParsed(opts.parsed, transform, {
      pointTag: opts.pointTag,
      roadType: opts.roadType
    });

    const baseBlob = await genererCanvasVierge(W, H, color);
    const baseFilename = "baseImage.png";

    const zip = new JSZip();

    // Tuilage V2 (optionnel)
    let tilingManifest = null;
    let v2Dims = null;
    if (opts.tilingV2 === true && typeof window.MyKTAMapTilingV2 === "function") {
      try {
        const v2 = await window.MyKTAMapTilingV2(baseBlob, zip, opts.onTilingProgress);
        tilingManifest = v2.manifest;
        v2Dims = v2.dims;
      } catch(e) {
        console.error("[GpxImport] Échec tilingV2 :", e);
        // Échec : on continue en V1 plat.
      }
    }

    zip.file("data/" + baseFilename, baseBlob);

    const finalW = v2Dims ? v2Dims.width  : W;
    const finalH = v2Dims ? v2Dims.height : H;

    const planConfig = {
      plan: {
        // ⚠️ Défauts figés dans la langue d'import (donnée du plan-config reconstruit).
        name:        opts.planName    || window.I18n.t("gpx.import.planNameDefault"),
        version:     opts.planVersion || "v1",
        author:      opts.planAuthor  || window.I18n.t("gpx.import.authorDefault"),
        imageWidth:  finalW,
        imageHeight: finalH,
        // 🩸 PRÉFIXE `data/` OBLIGATOIRE : le fichier est écrit dans `data/` du ZIP. En local, `findMatchingFile`
        // retrouve l'asset par son NOM DE BASE et masque l'oubli ; en mode SERVEUR la résolution est stricte → 404
        // sur l'image et les calques.
        baseImage:   "data/" + baseFilename,
        // Calage GPS embarqué : propagé à KmzExport au chargement (main.js > _propagerGeorefVersKmzExport).
        georef: {
          pointA: { x: pA_plan.x, y: pA_plan.y, lat: pA_gps.lat, lng: pA_gps.lng },
          pointB: { x: pB_plan.x, y: pB_plan.y, lat: pB_gps.lat, lng: pB_gps.lng }
        }
      },
      // Tracking centré sur le plan (W/2 × H/2) plutôt qu'en 0/0, coin haut-gauche (comme createConf.js > _genererZip).
      tracking: {
        startX:        Math.round(finalW / 2),
        startY:        Math.round(finalH / 2),
        // 🩸 L'échelle dépend du canvas et de l'étendue GPS : une valeur figée (50 px/m) fausse toute distance d'un
        // facteur dix (1 km sur 4000 px ≈ 4 px/m). `scale` = l'inverse de `metresParPixel`, déjà calculé par
        // `buildTransform`. Même correction que l'import SIG (même chemin de fabrication).
        scale:         (transform && transform.metresParPixel > 0)
                         ? Math.round((1 / transform.metresParPixel) * 1000) / 1000
                         : 50,
        // Pas de stepLength / stepThreshold / stepCooldown : réglages de la personne, globaux (⚙️ Réglages).
      },
      icons: {
        default: "icon/iconetrack.png",
        track:   "icon/iconetrack.png"
      },
      imageLayers: [],
      dataLayers: []
    };
    if (opts.multiLevel === true) planConfig.plan.multiLevel = true;
    // Étiquettes proposées par le Générateur (déjà normalisées par PlanRegistry.normaliserTags) ; absentes =
    // champ absent.
    if (Array.isArray(opts.tags) && opts.tags.length) planConfig.plan.tags = opts.tags.slice(0, 12);
    if (tilingManifest)           planConfig.plan.tiledV2    = true;
    if (tilingManifest)           planConfig.tiling          = tilingManifest;

    // Légende du plan (aller-retour, comme kmzImport.js) : gpxIO.js > parser pose `parsed.metadata.customLegend`,
    // injectée dans `planConfig.plan.customLegend` (appliquée par LegendCustomization.loadPlanState au démarrage du
    // plan). Absente (GPX tiers ou ancien) : rien.
    const _planCustomLegend = opts.parsed
                              && opts.parsed.metadata
                              && opts.parsed.metadata.customLegend;
    if (_planCustomLegend && typeof _planCustomLegend === "object") {
      planConfig.plan.customLegend = _planCustomLegend;
    }

    // Icônes default + track reprises de l'app courante (comme kmzImport.js).
    async function _tenterFetchIconeApp(relativePath) {
      try {
        const r = await fetch(relativePath);
        if (r && r.ok) {
          const blob = await r.blob();
          if (blob && blob.size > 0) return blob;
        }
      } catch(e) {}
      return null;
    }
    const iconTrack = await _tenterFetchIconeApp("icon/iconetrack.png");
    if (iconTrack) {
      zip.file("icon/iconetrack.png", iconTrack);
    }
    // Pour chaque tag rencontré, tentative sur icon/<tag>.png.
    const tagsRencontres = new Set();
    ingested.points.forEach(function(p) {
      if (Array.isArray(p.tags) && p.tags[0]) tagsRencontres.add(p.tags[0]);
    });
    for (const tag of tagsRencontres) {
      if (tag === "default" || tag === "track") continue;  // déjà géré
      const iconBlob = await _tenterFetchIconeApp("icon/" + tag + ".png");
      if (iconBlob) {
        zip.file("icon/" + tag + ".png", iconBlob);
        planConfig.icons[tag] = "icon/" + tag + ".png";
      }
    }

    // Calque de données "imported"
    if (ingested.points.length > 0 || ingested.roads.length > 0) {
      planConfig.dataLayers.push({
        id:      "imported",
        // ⚠️ Libellé figé dans la langue d'import (donnée affichée dans le FilterPanel).
        label:   window.I18n.t("gpx.import.layerLabel"),
        // 🩸 file = "data/imported.json", la clé d'enregistrement de l'asset : sinon la résolution RUNTIME_ASSETS
        // échoue en silence (URL relative → 404 → roads jamais chargées → Pathfinder sans réseau).
        file:    "data/imported.json",
        visible: true
      });
      const payload = {
        data:       ingested.points,
        roads:      ingested.roads,
        zones:      [],
        structures: []
      };
      // Un plan fabriqué ici porte un uid sur chaque objet (ETUDE_UID décision 5).
      if (window.KtaUid) { const _vus = new Set(); ["data", "roads", "zones", "structures"].forEach(function (k) { window.KtaUid.ensureAll(payload[k], k === "data" ? "pt" : k === "roads" ? "rd" : k === "zones" ? "zn" : "st", undefined, _vus); }); }
      zip.file("data/imported.json", JSON.stringify(payload, null, 2));
    }

    zip.file("plan-config.json", JSON.stringify(planConfig, null, 2));

    return {
      blob:  await zip.generateAsync({ type: "blob" }),
      stats: ingested.stats
    };
  }

  // ── API publique ──────────
  window.GpxImport = {
    estGpxMyktamap:     estGpxMyktamap,
    extraireGpx:        extraireGpx,
    extraireBoundsGps:  extraireBoundsGps,
    genererCanvasVierge: genererCanvasVierge,
    ingestParsed:       ingestParsed,
    genererZipMyktamap: genererZipMyktamap
  };

  console.log("[GpxImport] Module chargé — API window.GpxImport prête");
})();
