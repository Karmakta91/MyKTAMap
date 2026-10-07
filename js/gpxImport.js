/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// GPX IMPORT — depuis v1.15.0
// =====================================================================
// Inverse de l'export GPX (gpxIO.js). Ingère un fichier .gpx exporté
// depuis MyKTAMap (round-trip) et produit un ZIP MyKTAMap utilisable
// directement.
//
// Différence majeure vs kmzImport.js : un GPX n'a PAS d'image de plan.
// Du coup gpxImport.js GÉNÈRE un canvas vierge (mode « image vierge »
// du générateur classique) aux dimensions choisies par l'user, et
// auto-calibre le canvas sur les bounds GPS du GPX pour que les
// annotations tombent aux bons pixels. L'user pourra ensuite remplacer
// le canvas par une vraie image en mode Modifier le plan.
//
// Pipeline :
//   1. Lecture du fichier + parsing GPX 1.1 (via window.GpxIO.parser)
//   2. Détection GPX MyKTAMap (signature creator + <cmt>MyKTAMap level=N>)
//   3. Calcul bounds GPS (lat/lng min/max) sur waypoints + trkpts
//   4. Génération canvas vierge (PNG) + calibrage GPS automatique
//      (2 points : coin BL = (lat_min, lng_min) et TR = (lat_max, lng_max))
//   5. Ingestion des waypoints/tracks → points/roads (avec preservation
//      tag/type/level via <sym>/<type>/<cmt>)
//   6. Génération ZIP MyKTAMap : plan-config.json + canvas baseImage +
//      data layer "imported.json" + plan.georef pour auto-propagation
//      du calibrage vers KmzExport
//
// API publique : window.GpxImport
//   - estGpxMyktamap(gpxDoc)               → boolean
//   - extraireGpx(file)                    → Promise<{ gpxDoc, parsed }>
//   - extraireBoundsGps(parsed)            → { latMin, latMax, lngMin, lngMax } | null
//   - genererCanvasVierge(w, h, color)     → Promise<Blob>
//   - ingestParsed(parsed, transform, opts) → { points, roads, stats }
//   - genererZipMyktamap(opts)             → Promise<Blob>
// =====================================================================

(function() {
  "use strict";

  // =========================================================================
  // DÉTECTION GPX MyKTAMap (round-trip)
  // =========================================================================
  function estGpxMyktamap(gpxDoc) {
    if (!gpxDoc) return false;
    const root = gpxDoc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "gpx") return false;
    // 1) Attribut creator du root
    const creator = root.getAttribute("creator") || "";
    if (/MyKTAMap/i.test(creator)) return true;
    // 2) Tag <author><name>MyKTAMap...</name>
    const author = root.querySelector("metadata > author > name");
    if (author && /MyKTAMap/i.test(author.textContent || "")) return true;
    // 3) Présence d'au moins un <cmt>MyKTAMap level=N</cmt> (signature
    //    posée sur waypoints et tracks par gpxIO.js)
    const cmts = root.getElementsByTagName("cmt");
    for (let i = 0; i < cmts.length; i++) {
      if (/MyKTAMap level=/i.test(cmts[i].textContent || "")) return true;
    }
    return false;
  }

  // =========================================================================
  // EXTRACTION (file → parsed)
  // =========================================================================
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

  // =========================================================================
  // CALCUL DES BOUNDS GPS
  // =========================================================================
  // Retourne { latMin, latMax, lngMin, lngMax, count } ou null si vide.
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
    // Ajoute une marge de 5% autour des bounds pour éviter que les
    // annotations soient pile sur les bords du canvas (= invisibles).
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

  // =========================================================================
  // GÉNÉRATION CANVAS VIERGE (PNG Blob)
  // =========================================================================
  // Mêmes 4 couleurs que le générateur classique : white, gray, black, sepia.
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
        if (color !== "transparent") {      // 🫥 07/10/2026 : transparent = aucun remplissage
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

  // =========================================================================
  // INGESTION PARSED → points/roads (utilise un transform KmzExport)
  // =========================================================================
  // transform : { metresParPixel, rotation, latMoyenne, refPlan, refGps,
  //               imageW, imageH }
  // Mêmes structures que kmzImport.ingestPlacemarks.
  function ingestParsed(parsed, transform, opts) {
    opts = opts || {};
    const stats = { kept: 0, skipped: 0, outOfBounds: 0 };
    const out = { points: [], roads: [], stats: stats };
    const W = transform.imageW, H = transform.imageH;
    function _inBounds(p) {
      return p.x >= -50 && p.x <= W + 50 && p.y >= -50 && p.y <= H + 50;
    }

    // === Waypoints → points ===
    parsed.waypoints.forEach(function(w, i) {
      const px = window.KmzExport.gpsToPlan(transform, w.lat, w.lng);
      if (!px || !_inBounds(px)) { stats.outOfBounds++; return; }
      // Tag depuis <sym> ou <type>, fallback opts.pointTag ou "default"
      const tag = w.sym || w.type || opts.pointTag || "default";
      // Level depuis <cmt>MyKTAMap level=N</cmt>
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

    // === Tracks → roads ===
    // 🆕 v1.21.1 (audit fix #4) : ajout du préfixe `cust-` comme type valide
    // pour préserver les entrées custom Légende (dessinables, cf §31.6
    // CLAUDE.md) au roundtrip MKM→GPX→MKM. Avant, `validTypes.indexOf` strict
    // → tout type `cust-XYZ` revenait à `opts.roadType` (typiquement "chemin")
    // au ré-import. Symétrique au fix KMZ import #3 ci-dessus.
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
        // ⚠️ i18n « figé à la langue d'import » : fallback de label écrit comme
        // donnée d'annotation (affiché sur la carte). Non re-traduit après import.
        label:       trk.name || window.I18n.t("gpx.import.trackLabelDefault"),
        description: trk.desc || undefined,
        points:      projected,
        level:       level
      });
      stats.kept++;
    });

    return out;
  }

  // =========================================================================
  // GÉNÉRATION DU ZIP MyKTAMap
  // =========================================================================
  //
  // opts = {
  //   planName: string,
  //   planVersion: string,
  //   planAuthor: string,
  //   parsed: { metadata, waypoints, tracks } (depuis extraireGpx),
  //   bounds: { latMin, latMax, lngMin, lngMax } (depuis extraireBoundsGps),
  //   canvasWidth: number    (par défaut 4000),
  //   canvasHeight: number   (par défaut 4000),
  //   canvasColor: string    (white|gray|black|sepia, défaut sepia),
  //   pointTag: string       (fallback tag pour wpts sans <sym>),
  //   roadType: string       (fallback type pour trks sans <type>),
  //   tilingV2: boolean      (re-tile en V2 — coûteux mais utile mobile),
  //   multiLevel: boolean    (active plan.multiLevel),
  //   onTilingProgress: fn(done, total, currentZ) — pour overlay UI
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

    // === Calibrage automatique : 2 points coin BL et coin TR ===
    // BL = (x=0, y=H) ↔ (lat_min, lng_min)
    // TR = (x=W, y=0) ↔ (lat_max, lng_max)
    // → image upright (Y inversé Leaflet : y=0 en haut = lat_max).
    const pA_plan = { x: 0, y: H };
    const pB_plan = { x: W, y: 0 };
    const pA_gps  = { lat: opts.bounds.latMin, lng: opts.bounds.lngMin };
    const pB_gps  = { lat: opts.bounds.latMax, lng: opts.bounds.lngMax };
    let transform;
    try {
      transform = window.KmzExport.buildTransform(pA_plan, pB_plan, pA_gps, pB_gps);
      // Patch transform avec dims image (utilisé par ingestParsed)
      transform.imageW = W;
      transform.imageH = H;
    } catch(e) {
      throw new Error(window.I18n.t("gpx.err.autoCalib", { msg: e.message }));
    }

    // === Ingestion annotations ===
    const ingested = ingestParsed(opts.parsed, transform, {
      pointTag: opts.pointTag,
      roadType: opts.roadType
    });

    // === Génération canvas vierge ===
    const baseBlob = await genererCanvasVierge(W, H, color);
    const baseFilename = "baseImage.png";

    // === ZIP ===
    const zip = new JSZip();

    // V2 tilage (optionnel)
    let tilingManifest = null;
    let v2Dims = null;
    if (opts.tilingV2 === true && typeof window.MyKTAMapTilingV2 === "function") {
      try {
        const v2 = await window.MyKTAMapTilingV2(baseBlob, zip, opts.onTilingProgress);
        tilingManifest = v2.manifest;
        v2Dims = v2.dims;
      } catch(e) {
        console.error("[GpxImport] Échec tilingV2 :", e);
        // continue en V1 plat
      }
    }

    zip.file("data/" + baseFilename, baseBlob);

    const finalW = v2Dims ? v2Dims.width  : W;
    const finalH = v2Dims ? v2Dims.height : H;

    const planConfig = {
      plan: {
        // ⚠️ i18n « figé à la langue d'import » : défauts écrits comme donnée
        // dans le plan-config.json reconstruit. Non re-traduits après import.
        name:        opts.planName    || window.I18n.t("gpx.import.planNameDefault"),
        version:     opts.planVersion || "v1",
        author:      opts.planAuthor  || window.I18n.t("gpx.import.authorDefault"),
        imageWidth:  finalW,
        imageHeight: finalH,
        // 🩸 v1.88.4 — PRÉFIXE `data/` OBLIGATOIRE. Le fichier est écrit dans
        // `data/` du ZIP, mais était déclaré ICI sans le préfixe. En import
        // LOCAL ça passait : `findMatchingFile` retrouve l'asset par son NOM DE
        // BASE, donc l'incohérence était invisible. En mode SERVEUR la résolution
        // est stricte → 404 sur l'image et les calques (constat KARMA : ses plans
        // `*_from_v2` échouaient, les plans du Générateur passaient).
        // ⚠️ `kmzImport` avait déjà corrigé ce motif pour ses CALQUES en
        // v1.21.0-fix5 — jamais pour son `baseImage`.
        baseImage:   "data/" + baseFilename,
        // Embarque le calibrage GPS dans le plan-config.json (cf v1.14.20
        // pattern plan.georef → propagation auto vers KmzExport au load
        // du plan via main.js > _propagerGeorefVersKmzExport).
        georef: {
          pointA: { x: pA_plan.x, y: pA_plan.y, lat: pA_gps.lat, lng: pA_gps.lng },
          pointB: { x: pB_plan.x, y: pB_plan.y, lat: pB_gps.lat, lng: pB_gps.lng }
        }
      },
      // 🆕 v1.21.0-fix5 (symétrique kmzImport) : section `tracking` centrée
      // sur le plan (W/2 × H/2) au lieu de défaut 0/0 qui place le tracker
      // au coin haut-gauche. Cohérent avec createConf.js > _genererZip.
      tracking: {
        startX:        Math.round(finalW / 2),
        startY:        Math.round(finalH / 2),
        // 📏 v1.82.0 — MÊME DÉFAUT QUE L'IMPORT SIG, corrigé au même endroit :
        // l'échelle était figée à 50 px/m alors qu'elle dépend entièrement du
        // canvas et de l'étendue GPS. Sur un tracé d'un kilomètre rendu sur
        // 4000 px, la vraie valeur est de l'ordre de 4 px/m — soit un facteur
        // dix. Toute distance lue sur le plan était donc fausse.
        // `buildTransform` calcule DÉJÀ `metresParPixel` ; `scale` en est
        // exactement l'inverse. La valeur était disponible, elle n'était pas lue.
        // KARMA n'a signalé le symptôme que sur le SIG, mais le GPX produit des
        // plans par le même chemin : le corriger d'un seul côté aurait laissé
        // une moitié fausse en attendant qu'on la retrouve.
        scale:         (transform && transform.metresParPixel > 0)
                         ? Math.round((1 / transform.metresParPixel) * 1000) / 1000
                         : 50,
        // 👣 v1.96.0 — plus de stepLength / stepThreshold / stepCooldown ici : ces
        // réglages sont ceux de la personne, globaux à l'appareil (⚙️ Réglages).
      },
      icons: {
        default: "icon/iconetrack.png",
        track:   "icon/iconetrack.png"
      },
      imageLayers: [],
      dataLayers: []
    };
    if (opts.multiLevel === true) planConfig.plan.multiLevel = true;
    // 🏷️ 16/09/2026 — étiquettes proposées par le Générateur (déjà normalisées
    // par PlanRegistry.normaliserTags). Absentes = champ absent, JSON inchangé.
    if (Array.isArray(opts.tags) && opts.tags.length) planConfig.plan.tags = opts.tags.slice(0, 12);
    if (tilingManifest)           planConfig.plan.tiledV2    = true;
    if (tilingManifest)           planConfig.tiling          = tilingManifest;

    // 🆕 v1.18.1 — Roundtrip légende plan-level via GPX (symétrique
    // kmzImport.js + §59 CLAUDE.md). Le parser gpxIO.js extrait l'éventuelle
    // balise <extensions><myktamap:customLegend> sous <metadata> et la pose
    // dans `parsed.metadata.customLegend`. On l'injecte ici dans
    // `planConfig.plan.customLegend` du ZIP MyKTAMap reconstruit — la cascade
    // LegendCustomization.loadPlanState l'appliquera au boot du plan importé.
    // Skip silencieux si absente (GPX tiers ou MyKTAMap < v1.18.1).
    const _planCustomLegend = opts.parsed
                              && opts.parsed.metadata
                              && opts.parsed.metadata.customLegend;
    if (_planCustomLegend && typeof _planCustomLegend === "object") {
      planConfig.plan.customLegend = _planCustomLegend;
    }

    // === Restauration icônes default + track depuis l'app courante ===
    // Fetch les icônes par défaut comme kmzImport.js > hotfix10.
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
    // Pour chaque tag rencontré dans les points, tente fetch icon/<tag>.png
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

    // === data layer "imported" ===
    if (ingested.points.length > 0 || ingested.roads.length > 0) {
      planConfig.dataLayers.push({
        id:      "imported",
        // ⚠️ i18n « figé à la langue d'import » : label de dataLayer écrit comme
        // donnée (affiché dans le FilterPanel). Non re-traduit après import.
        label:   window.I18n.t("gpx.import.layerLabel"),
        // 🐛 v1.21.0-fix5 (symétrique kmzImport) : file = "data/imported.json"
        // pour matcher la clé d'enregistrement de l'asset (sinon resolution
        // RUNTIME_ASSETS échoue silencieusement → fetch URL relative → 404
        // → roads jamais chargées → Pathfinder ne voit aucun réseau).
        file:    "data/imported.json",
        visible: true
      });
      const payload = {
        data:       ingested.points,
        roads:      ingested.roads,
        zones:      [],
        structures: []
      };
      // 🆔 v2.1.0 — un plan fabriqué ici porte un uid sur chaque objet (ETUDE_UID déc. 5).
      if (window.KtaUid) { const _vus = new Set(); ["data", "roads", "zones", "structures"].forEach(function (k) { window.KtaUid.ensureAll(payload[k], k === "data" ? "pt" : k === "roads" ? "rd" : k === "zones" ? "zn" : "st", undefined, _vus); }); }
      zip.file("data/imported.json", JSON.stringify(payload, null, 2));
    }

    zip.file("plan-config.json", JSON.stringify(planConfig, null, 2));

    return {
      blob:  await zip.generateAsync({ type: "blob" }),
      stats: ingested.stats
    };
  }

  // =========================================================================
  // API PUBLIQUE
  // =========================================================================
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
