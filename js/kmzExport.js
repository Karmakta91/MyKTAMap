/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// KMZ EXPORT — export geolocalise pour Google Earth / OsmAnd / Locus / Avenza
// =========================
// Convertit un plan MyKTAMap (image + annotations) en un fichier .kmz contenant :
//   - Un GroundOverlay = l'image plan georeferencee (4 coins en lat/lng)
//   - Des Placemark = points editor + data layers
//   - Des LineString = roads, jonctions, itineraire
//   - Des Polygon = zones (avec fill)
//   - Folders par niveau si multiLevel actif
//
// CALIBRAGE A 2 POINTS
//   L'user fournit 2 couples (point_plan, point_GPS). Le module calcule une
//   transformation affine 2D similarity (rotation + scale + translation) qui
//   permet de convertir n'importe quel (x,y) plan en (lat,lng) GPS.
//
// MATH
//   - Vecteur AB plan → vecteur AB GPS (en mètres via approximation
//     equirectangulaire locale autour de latMoyenne)
//   - Echelle = lenGps / lenPlan (m/px)
//   - Rotation = atan2(dxGps, dyGps) - atan2(dxPlan, dyPlan)
//   - L'axe y plan est INVERSE (y augmente vers le bas dans MyKTAMap, mais
//     vers le haut dans le repere math standard) → on flip pour avoir
//     dy_plan vers le HAUT, cohérent avec dy_gps vers le NORD
//
// FORMAT KMZ
//   = ZIP contenant `doc.kml` + dossier `files/` avec image plan et icones
//
// API : window.KmzExport
//   - genererKmz(opts) → Promise<Blob> du KMZ téléchargé
//   - getCalibration(planId) → calibrage sauvé pour ce plan (ou null)
//   - setCalibration(planId, calib) → persistance localStorage
//   - buildTransform(planA, planB, gpsA, gpsB) → transform object (exposé pour
//     l'aperçu des 4 coins dans la modale UI)
//   - planToGps(transform, x, y) → {lat, lng} (idem)
// =========================

(function() {
  "use strict";

  const KMZ_CALIB_LS_PREFIX = "myktamap_kmz_calib_";
  const MIN_PLAN_DISTANCE   = 50;   // pixels (sinon precision math degueulasse)
  const MIN_GPS_DISTANCE_M  = 1;    // mètres (sinon AB GPS trop proche/identique)

  // =========================
  // MATH AFFINE 2D
  // =========================

  // Construit une transformation affine 2D similarity (rotation+scale+translation)
  // qui mappe (x,y) plan vers (lat,lng) GPS, à partir de 2 points de calibrage.
  //
  // planA, planB : {x, y} en pixels image
  // gpsA, gpsB   : {lat, lng} en degrés décimaux
  //
  // Retourne { refPlan, refGps, metresParPixel, rotation, latMoyenne }
  // ou throw si distance insuffisante.
  function buildTransform(planA, planB, gpsA, gpsB) {
    if (!planA || !planB || !gpsA || !gpsB) {
      throw new Error("Calibrage incomplet : 2 points (plan + GPS) requis");
    }

    // Vecteur plan AB. y plan inverse : y croît vers le bas en MyKTAMap, on
    // veut un repere math standard avec y vers le HAUT pour aligner avec
    // l'axe Nord du GPS.
    const dxPlan = planB.x - planA.x;
    const dyPlan = -(planB.y - planA.y);
    const lenPlan = Math.hypot(dxPlan, dyPlan);
    if (lenPlan < MIN_PLAN_DISTANCE) {
      throw new Error("Les 2 points plan sont trop proches (" + Math.round(lenPlan) +
                      " px, min " + MIN_PLAN_DISTANCE + " px) pour calibrer avec précision");
    }

    // Vecteur GPS AB en mètres via projection equirectangulaire locale
    // (= valide sur quelques km autour de la latitude moyenne, suffisant
    // pour un plan de carrière)
    const dlatDeg = gpsB.lat - gpsA.lat;
    const dlngDeg = gpsB.lng - gpsA.lng;
    const latMoy = (gpsA.lat + gpsB.lat) / 2;
    const dxGps = dlngDeg * 111320 * Math.cos(latMoy * Math.PI / 180); // Est-Ouest
    const dyGps = dlatDeg * 110540;                                    // Nord-Sud
    const lenGps = Math.hypot(dxGps, dyGps);
    if (lenGps < MIN_GPS_DISTANCE_M) {
      throw new Error("Les 2 points GPS sont identiques ou trop proches (< 1 m).");
    }

    // Echelle métres par pixel
    const metresParPixel = lenGps / lenPlan;

    // Rotation : angle entre vecteur plan et vecteur GPS
    const anglePlan = Math.atan2(dyPlan, dxPlan);
    const angleGps  = Math.atan2(dyGps,  dxGps);
    const rotation  = angleGps - anglePlan;

    return {
      refPlan:        { x: planA.x, y: planA.y },
      refGps:         { lat: gpsA.lat, lng: gpsA.lng },
      metresParPixel: metresParPixel,
      rotation:       rotation,
      latMoyenne:     latMoy
    };
  }

  // Convertit (x,y) plan en (lat,lng) GPS via la transformation t.
  function planToGps(t, x, y) {
    if (!t) return null;
    // Position relative à refPlan (y inversé pour math standard, cf buildTransform)
    const dx = x - t.refPlan.x;
    const dy = -(y - t.refPlan.y);
    // Rotation
    const cosR = Math.cos(t.rotation);
    const sinR = Math.sin(t.rotation);
    const dxRot = dx * cosR - dy * sinR;
    const dyRot = dx * sinR + dy * cosR;
    // Echelle (px → mètres)
    const dxMetres = dxRot * t.metresParPixel;
    const dyMetres = dyRot * t.metresParPixel;
    // Mètres → degrés (référence: latMoyenne)
    const dlngDeg = dxMetres / (111320 * Math.cos(t.latMoyenne * Math.PI / 180));
    const dlatDeg = dyMetres / 110540;
    return {
      lat: t.refGps.lat + dlatDeg,
      lng: t.refGps.lng + dlngDeg
    };
  }

  // 🆕 v1.14.0 : Convertit (lat,lng) GPS en (x,y) plan via la transformation
  // inverse. Utilisé pour l'import GPX (apps tierces fournissent des coords
  // WGS84 qu'on doit ramener dans le repère plan local).
  //
  // Inverse exact de planToGps :
  //   1. (lat,lng) → mètres relatifs à refGps via projection equirectangulaire
  //   2. mètres → pixels via 1/metresParPixel
  //   3. rotation inverse (-rotation)
  //   4. unflip Y (y plan = -dy + refPlan.y)
  function gpsToPlan(t, lat, lng) {
    if (!t) return null;
    // Position relative à refGps en degrés
    const dlatDeg = lat - t.refGps.lat;
    const dlngDeg = lng - t.refGps.lng;
    // Degrés → mètres (projection equirectangulaire locale, valide quelques km)
    const dxMetres = dlngDeg * 111320 * Math.cos(t.latMoyenne * Math.PI / 180);
    const dyMetres = dlatDeg * 110540;
    // Mètres → pixels (inverse de metresParPixel)
    const dxRot = dxMetres / t.metresParPixel;
    const dyRot = dyMetres / t.metresParPixel;
    // Rotation inverse : matrice rotation transposée (cos / -sin)
    const cosR = Math.cos(-t.rotation);  // ou cos(rotation), même valeur
    const sinR = Math.sin(-t.rotation);
    const dx = dxRot * cosR - dyRot * sinR;
    const dy = dxRot * sinR + dyRot * cosR;
    // Position relative → absolue (unflip Y)
    return {
      x: t.refPlan.x + dx,
      y: t.refPlan.y - dy
    };
  }

  // =========================
  // PERSISTANCE
  // =========================
  function _calibLsKey(planId) {
    return KMZ_CALIB_LS_PREFIX + (planId || "default");
  }

  function getCalibration(planId) {
    try {
      const raw = localStorage.getItem(_calibLsKey(planId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e) { return null; }
  }

  function setCalibration(planId, calib) {
    try { localStorage.setItem(_calibLsKey(planId), JSON.stringify(calib)); }
    catch(e) {}
  }

  // =========================
  // KML — HELPERS GENERATION
  // =========================

  // Echappe pour XML/KML (pas de & < > " ' dans le texte)
  function _xmlEsc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // Format coords lat/lng pour KML : "lng,lat,alt" (alt = 0)
  function _coord(latlng) {
    return latlng.lng.toFixed(8) + "," + latlng.lat.toFixed(8) + ",0";
  }

  // Convertit une color hex "#RRGGBB" + alpha [0..1] en format KML "AABBGGRR"
  // (KML utilise un ordre inversé alpha, blue, green, red sans le #)
  function _kmlColor(hex, alpha) {
    if (!hex || hex[0] !== "#") return "ff000000";
    const a = Math.round((alpha != null ? alpha : 1) * 255).toString(16).padStart(2, "0");
    const r = hex.slice(1, 3);
    const g = hex.slice(3, 5);
    const b = hex.slice(5, 7);
    return (a + b + g + r).toLowerCase();
  }

  // Styles communs (1 fois par doc)
  const STYLES_KML = {
    road_principal:    { line: "#00ff00", width: 4, alpha: 1   },
    road_secondaire:   { line: "#b000ff", width: 4, alpha: 1   },
    road_chemin:       { line: "#ffff00", width: 3, alpha: 1   },
    road_jonction:     { line: "#ff4ecb", width: 4, alpha: 1   },
    road_itinerary:    { line: "#00d4ff", width: 6, alpha: 1   },
    zone_eau:          { line: "#0066aa", fill: "#3aa9e8", fillAlpha: 0.6, width: 2 },
    zone_remblais:     { line: "#3a3a44", fill: "#5a5a68", fillAlpha: 0.6, width: 2 },
    zone_effondrement: { line: "#cc0000", fill: "#ff3333", fillAlpha: 0.6, width: 2 },
    zone_inaccessible: { line: "#5a0a0a", fill: "#7a0000", fillAlpha: 0.65, width: 2 },
    // 🆕 v1.9.3-A1.b.1 : structures (piliers + murs). Stroke noir (#000)
    // signature visuelle qui distingue des zones. fill cohérent avec
    // STRUCTURE_STYLES de structures.js (jaune charte / orange / bleu foncé).
    "structure_pilier-1": { line: "#000000", fill: "#f4c542", fillAlpha: 0.85, width: 2 },
    "structure_pilier-2": { line: "#000000", fill: "#ff9933", fillAlpha: 0.85, width: 2 },
    "structure_mur":      { line: "#000000", fill: "#1e3a8a", fillAlpha: 0.85, width: 2 },
    // 🆕 v1.9.3-A1.b.2 : fronts de taille — LineStrings épaisses sans
    // contour. width: 5 dans KML car ≠ unité que le canvas Leaflet
    // weight, ajusté visuellement pour rendre épais à l'échelle GPS.
    // 🔧 v1.10.1-hotfix2 (KARMA) : front-1 jaune = pilier-1 jaune,
    // front-2 orange = pilier-2 orange (alignement couleur/masse).
    "structure_front-1":  { line: "#f4c542", width: 5, alpha: 1 },
    "structure_front-2":  { line: "#ff9933", width: 5, alpha: 1 }
  };

  function _genererStylesKml() {
    let out = "";
    Object.keys(STYLES_KML).forEach(function(id) {
      const s = STYLES_KML[id];
      out += '<Style id="' + id + '">';
      if (s.line) {
        out += '<LineStyle>' +
                 '<color>' + _kmlColor(s.line, s.alpha != null ? s.alpha : 1) + '</color>' +
                 '<width>' + s.width + '</width>' +
               '</LineStyle>';
      }
      if (s.fill) {
        out += '<PolyStyle>' +
                 '<color>' + _kmlColor(s.fill, s.fillAlpha != null ? s.fillAlpha : 0.5) + '</color>' +
                 '<outline>1</outline>' +
                 '<fill>1</fill>' +
               '</PolyStyle>';
      }
      out += '</Style>';
    });
    return out;
  }

  // Style Placemark pour un point (icone embarquee files/icons/<tag>.png)
  // Génère 1 <Style id="point_<tag>"> par tag rencontré.
  function _genererStyleIconePoint(tag) {
    const id = "point_" + (tag || "default");
    return '<Style id="' + id + '">' +
             '<IconStyle>' +
               '<Icon><href>files/icons/' + (tag || "default") + '.png</href></Icon>' +
               '<scale>0.8</scale>' +
             '</IconStyle>' +
             '<LabelStyle>' +
               '<color>ffffffff</color>' +
               '<scale>0.85</scale>' +
             '</LabelStyle>' +
           '</Style>';
  }

  // =========================
  // GENERATION KML COMPLETE
  // =========================
  //
  // opts = {
  //   planName, planVersion, planAuthor,    // métadonnées du plan
  //   imageW, imageH,                        // dimensions plan en px
  //   transform,                             // résultat de buildTransform
  //   include: {
  //     image: true|false,                   // GroundOverlay
  //     points: true,                        // parent — si false, tous les points droppés
  //     roads: true,                         // parent — idem roads
  //     zones: true,                         // parent — idem zones
  //     structures: true,                    // 🆕 v1.9.3-A1.b.1 — parent piliers + murs
  //     jonctions: true,                     // (uniquement si multi-niveau)
  //     itineraire: true,
  //     dataLayers: true,                    // points + roads + zones + structures embedded
  //     // Filtres granulaires (v169 Karma_dev, pattern IMAGE AVANCE) :
  //     pointTagsSet: Set<string> | null,    // whitelist tags (1er tag de chaque point)
  //     roadTypesSet: Set<string> | null,    // whitelist {principal, secondaire, chemin}
  //     zoneTypesSet: Set<string> | null,    // whitelist {eau, remblais, effondrement, inaccessible}
  //     structureTypesSet: Set<string> | null// 🆕 v1.9.3-A1.b.1 — whitelist {pilier-1, pilier-2, mur}
  //                                          // null = pas de filtre (legacy compat)
  //                                          // Set vide = drop tout (parent coché sans enfants)
  //   },
  //   levels: Set<number> | null,            // filtre niveaux (null = tous)
  //   data: {
  //     editorPoints: [...],
  //     roads: [...],
  //     zones: [...],
  //     structures: [...],                   // 🆕 v1.9.3-A1.b.1
  //     dataLayerItems: { points: [...], roads: [...], zones: [...], structures: [...] }
  //   },
  //   imageBaseUrl: string,                  // URL relative ou data: pour le GroundOverlay
  //                                          // (résolu par RUNTIME_ASSETS ou le caller)
  //   imageOpacity: number                   // 0-100, default 60 (% d'opacité du GroundOverlay)
  // }
  //
  // Retourne le KML complet en string.
  function genererKml(opts) {
    const t = opts.transform;
    if (!t) throw new Error("Transform requis (calibrage)");

    const planName = opts.planName || "Plan MyKTAMap";

    // === GroundOverlay (image plan géoréférencée) ===
    let groundOverlay = "";
    if (opts.include.image && opts.imageBaseUrl) {
      // Calcule les 4 coins du plan en (lat,lng) via la transformation
      const cTL = planToGps(t, 0,          0);
      const cTR = planToGps(t, opts.imageW, 0);
      const cBR = planToGps(t, opts.imageW, opts.imageH);
      const cBL = planToGps(t, 0,          opts.imageH);

      // Opacité : KML <color> au format AABBGGRR (alpha + bleu + vert + rouge).
      // ffffffff = blanc full opaque (default Google Earth si <color> absent).
      // L'opacité s'applique à l'image via teinte blanche × alpha.
      // Default 60% si non spécifié (lecture sous le plan sans masquer).
      const opPct = (typeof opts.imageOpacity === "number") ? opts.imageOpacity : 60;
      const opClamped = Math.max(0, Math.min(100, opPct));
      const alpha255 = Math.round(opClamped * 2.55);
      const alphaHex = (alpha255 < 16 ? "0" : "") + alpha255.toString(16);
      const colorTag = '<color>' + alphaHex + 'ffffff</color>';

      // gx:LatLonQuad supporte une orientation arbitraire (4 coins libres),
      // contrairement à LatLonBox qui suppose un axes-aligned + rotation
      // unique. Plus robuste pour les plans tournés.
      // Ordre KML : SW, SE, NE, NW (= BL, BR, TR, TL en coords image)
      groundOverlay =
        '<GroundOverlay>' +
          '<name>' + _xmlEsc(planName + " — plan image") + '</name>' +
          colorTag +
          '<Icon><href>' + _xmlEsc(opts.imageBaseUrl) + '</href></Icon>' +
          '<gx:LatLonQuad xmlns:gx="http://www.google.com/kml/ext/2.2">' +
            '<coordinates>' +
              _coord(cBL) + ' ' + _coord(cBR) + ' ' + _coord(cTR) + ' ' + _coord(cTL) +
            '</coordinates>' +
          '</gx:LatLonQuad>' +
        '</GroundOverlay>';
    }

    // === Filtre niveau (Set ou null) ===
    function _passeLevel(item, levelFromItem) {
      if (!opts.levels) return true;
      const lvl = Number.isInteger(levelFromItem) ? levelFromItem : 0;
      return opts.levels.has(lvl);
    }

    // === Collect tags utilises pour generer les styles d'icones ===
    const tagsRencontres = new Set(["default"]);

    function _emitPlacemark(p, layerIcon) {
      const tag = (Array.isArray(p.tags) && p.tags.length > 0) ? p.tags[0] : "default";
      tagsRencontres.add(tag);
      const ll = planToGps(t, p.x, p.y);
      const nom = p.nom || p.id || "(point)";
      // v1.14.20-hotfix9 (KARMA « on perd la descriptions des points dans
      // le kmz, ou Google ne l'affiche pas ») : wrapper la description en
      // <![CDATA[...]]> pour que Google Earth l'interprète en HTML (les
      // retours à la ligne \n natifs étaient invisibles, Google rend la
      // description en HTML inline → \n ignorés). On échappe le ]] et
      // ]]> internes pour éviter de casser le CDATA, et on convertit \n
      // en <br/>. L'import KMZ fait l'opération inverse pour préserver
      // le format texte original au roundtrip.
      const desc = p.description ? _emitDescriptionCdata(p.description) : '';
      return '<Placemark>' +
               '<name>' + _xmlEsc(nom) + '</name>' +
               desc +
               '<styleUrl>#point_' + tag + '</styleUrl>' +
               '<Point><coordinates>' + _coord(ll) + '</coordinates></Point>' +
             '</Placemark>';
    }

    // Helper CDATA pour les descriptions HTML compatibles Google Earth.
    function _emitDescriptionCdata(text) {
      const s = String(text == null ? "" : text);
      // \n natif → <br/> pour préservation visuelle dans le balloon Google Earth.
      // CDATA ne nécessite pas d'XML-escape mais on doit éviter de fermer le
      // CDATA prématurément si la description contenait littéralement "]]>"
      // (très rare, mais défensif).
      const html = s.replace(/]]>/g, "]]]]><![CDATA[>").replace(/\n/g, "<br/>");
      return '<description><![CDATA[' + html + ']]></description>';
    }

    function _emitLineString(road, styleId) {
      if (!road.points || road.points.length < 2) return "";
      const coords = road.points
        .map(function(p) { return _coord(planToGps(t, p.x, p.y)); })
        .join(" ");
      const nom = road.type === "itinerary" ? "🗺️ Itinéraire"
                : road.type === "jonction"  ? "🪜 Jonction"
                : road.type.charAt(0).toUpperCase() + road.type.slice(1);
      // v1.16.0 step 1 — description (note) CDATA + \n → <br/> (cf hotfix9 sur points)
      const desc = road.description ? _emitDescriptionCdata(road.description) : '';
      return '<Placemark>' +
               '<name>' + _xmlEsc(nom) + '</name>' +
               desc +
               '<styleUrl>#' + styleId + '</styleUrl>' +
               '<LineString><tessellate>1</tessellate><coordinates>' + coords +
               '</coordinates></LineString>' +
             '</Placemark>';
    }

    function _emitPolygon(zone, styleId) {
      if (!zone.points || zone.points.length < 3) return "";
      // KML : 1er point répété à la fin pour fermer le ring
      const ring = zone.points.slice();
      ring.push(zone.points[0]);
      const coords = ring
        .map(function(p) { return _coord(planToGps(t, p.x, p.y)); })
        .join(" ");
      // 🆕 v1.9.3-A1.b.1 : nom lisible selon le type. Pour les structures
      // (pilier-1 / pilier-2 / mur), le mapping basique
      // "type.charAt(0).toUpperCase() + slice(1)" donnerait "Pilier-1" qui
      // est peu informatif. On mappe vers des noms explicites cataphile.
      let nom;
      if (zone.type === "pilier-1") nom = "Pilier 1ère masse";
      else if (zone.type === "pilier-2") nom = "Pilier 2e masse";
      else if (zone.type === "mur") nom = "Mur";
      else nom = zone.type.charAt(0).toUpperCase() + zone.type.slice(1);
      // v1.16.0 step 1 — description (note) CDATA + \n → <br/>
      const desc = zone.description ? _emitDescriptionCdata(zone.description) : '';
      return '<Placemark>' +
               '<name>' + _xmlEsc(nom) + '</name>' +
               desc +
               '<styleUrl>#' + styleId + '</styleUrl>' +
               '<Polygon><outerBoundaryIs><LinearRing><coordinates>' +
               coords + '</coordinates></LinearRing></outerBoundaryIs></Polygon>' +
             '</Placemark>';
    }

    // === Construction des Folders ===
    // Si multiLevel : 1 sous-folder par niveau visible. Sinon : 1 folder unique.
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const levels = mlOn ? (opts.levels ? Array.from(opts.levels).sort(function(a,b){return a-b;}) : [0])
                        : [0];

    // Filtres granulaires depuis opts.include (v169 Karma_dev) :
    //   pointTagsSet : Set<string> | null — whitelist des tags (1er tag du point)
    //   roadTypesSet : Set<string> | null — whitelist des types principal/secondaire/chemin
    //   zoneTypesSet : Set<string> | null — whitelist des types eau/remblais/effondrement/inaccessible
    // null = pas de filtre (legacy compat). Set vide = drop tout (parent
    // coché mais aucun enfant sélectionné, edge case).
    const pointTagsSet = (opts.include.pointTagsSet instanceof Set) ? opts.include.pointTagsSet : null;
    const roadTypesSet = (opts.include.roadTypesSet instanceof Set) ? opts.include.roadTypesSet : null;
    const zoneTypesSet = (opts.include.zoneTypesSet instanceof Set) ? opts.include.zoneTypesSet : null;
    // 🆕 v1.9.3-A1.b.1 : filtre granulaire sous-types structures (pilier-1
    // / pilier-2 / mur). null = pas de filtre, Set vide = drop tout.
    const structureTypesSet = (opts.include.structureTypesSet instanceof Set) ? opts.include.structureTypesSet : null;

    // Helper : 1er tag d'un point pour le filtre (cohérent avec _emitPlacemark)
    function _firstTag(p) {
      return (Array.isArray(p.tags) && p.tags.length > 0) ? p.tags[0] : "__untagged__";
    }

    function _folderForLevel(level) {
      let body = "";
      // Editor points
      if (opts.include.points && opts.data.editorPoints) {
        const points = opts.data.editorPoints.filter(function(p) {
          if (pointTagsSet && !pointTagsSet.has(_firstTag(p))) return false;
          return _passeLevel(p, Number.isInteger(p.level) ? p.level : 0) &&
                 (!mlOn || (Number.isInteger(p.level) ? p.level : 0) === level);
        });
        if (points.length > 0) {
          body += '<Folder><name>📍 Points (' + points.length + ')</name>';
          points.forEach(function(p) { body += _emitPlacemark(p); });
          body += '</Folder>';
        }
      }
      // Roads
      if (opts.include.roads && opts.data.roads) {
        const roads = opts.data.roads.filter(function(r) {
          if (r.type === "itinerary" || r.type === "jonction") return false;
          if (roadTypesSet && !roadTypesSet.has(r.type)) return false;
          return _passeLevel(r, Number.isInteger(r.level) ? r.level : 0) &&
                 (!mlOn || (Number.isInteger(r.level) ? r.level : 0) === level);
        });
        if (roads.length > 0) {
          body += '<Folder><name>🛣️ Tracés (' + roads.length + ')</name>';
          roads.forEach(function(r) {
            const styleId = "road_" + r.type;
            body += _emitLineString(r, styleId);
          });
          body += '</Folder>';
        }
      }
      // Jonctions (uniquement si multi-niveau)
      if (opts.include.jonctions && mlOn && opts.data.roads) {
        const jonctions = opts.data.roads.filter(function(r) {
          if (r.type !== "jonction") return false;
          // Une jonction est visible dans le folder du niveau de son fromLevel
          const fl = Number.isInteger(r.fromLevel) ? r.fromLevel : 0;
          return fl === level;
        });
        if (jonctions.length > 0) {
          body += '<Folder><name>🪜 Jonctions (' + jonctions.length + ')</name>';
          jonctions.forEach(function(r) { body += _emitLineString(r, "road_jonction"); });
          body += '</Folder>';
        }
      }
      // Zones
      if (opts.include.zones && opts.data.zones) {
        const zones = opts.data.zones.filter(function(z) {
          if (zoneTypesSet && !zoneTypesSet.has(z.type)) return false;
          return _passeLevel(z, Number.isInteger(z.level) ? z.level : 0) &&
                 (!mlOn || (Number.isInteger(z.level) ? z.level : 0) === level);
        });
        if (zones.length > 0) {
          body += '<Folder><name>⬛ Zones (' + zones.length + ')</name>';
          zones.forEach(function(z) {
            const styleId = "zone_" + z.type;
            body += _emitPolygon(z, styleId);
          });
          body += '</Folder>';
        }
      }
      // 🆕 v1.9.3-A1.b.1 + A1.b.2 : Structures (piliers + murs + fronts) —
      // calqué sur zones avec styles dédiés. Filtre niveau identique.
      // Différenciation polyline (fronts) vs polygon (piliers/mur) au
      // niveau du KML : LineString pour les fronts, Polygon pour le reste.
      if (opts.include.structures && opts.data.structures) {
        const structures = opts.data.structures.filter(function(s) {
          if (structureTypesSet && !structureTypesSet.has(s.type)) return false;
          return _passeLevel(s, Number.isInteger(s.level) ? s.level : 0) &&
                 (!mlOn || (Number.isInteger(s.level) ? s.level : 0) === level);
        });
        if (structures.length > 0) {
          body += '<Folder><name>🏛️ Structures (' + structures.length + ')</name>';
          structures.forEach(function(s) {
            const styleId = "structure_" + s.type;
            // Fronts (polylines) → KML LineString. Piliers/mur → Polygon.
            // _emitLineString attend road.type pour le nom — on patch
            // temporairement avec un objet adapté.
            if (s.type === "front-1" || s.type === "front-2") {
              if (!s.points || s.points.length < 2) return;
              const coords = s.points
                .map(function(p) { return _coord(planToGps(t, p.x, p.y)); })
                .join(" ");
              const nom = s.type === "front-1"
                ? "Front de taille 1ère masse"
                : "Front de taille 2e masse";
              body += '<Placemark>' +
                        '<name>' + _xmlEsc(nom) + '</name>' +
                        '<styleUrl>#' + styleId + '</styleUrl>' +
                        '<LineString><tessellate>1</tessellate>' +
                          '<coordinates>' + coords + '</coordinates>' +
                        '</LineString>' +
                      '</Placemark>';
            } else {
              body += _emitPolygon(s, styleId);
            }
          });
          body += '</Folder>';
        }
      }

      if (!body) return "";
      const folderName = mlOn ? ("🏗️ Niveau " + level) : "📚 Annotations";
      return '<Folder><name>' + folderName + '</name>' + body + '</Folder>';
    }

    let foldersByLevel = "";
    levels.forEach(function(lvl) {
      foldersByLevel += _folderForLevel(lvl);
    });

    // === Itinéraire actif (pas dans les folders niveau, à part car cyan néon) ===
    let itineraireFolder = "";
    if (opts.include.itineraire && opts.data.roads) {
      const itis = opts.data.roads.filter(function(r) { return r.type === "itinerary"; });
      if (itis.length > 0) {
        itineraireFolder = '<Folder><name>🗺️ Itinéraire (' + itis.length + ')</name>';
        itis.forEach(function(r) { itineraireFolder += _emitLineString(r, "road_itinerary"); });
        itineraireFolder += '</Folder>';
      }
    }

    // === Styles icones (un par tag rencontre + default) ===
    let stylesIcones = "";
    tagsRencontres.forEach(function(tag) {
      stylesIcones += _genererStyleIconePoint(tag);
    });

    // === Document KML complet ===
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<kml xmlns="http://www.opengis.net/kml/2.2">' +
        '<Document>' +
          '<name>' + _xmlEsc(planName) + '</name>' +
          '<description>' + _xmlEsc(
            "Export MyKTAMap — " + (opts.planAuthor || "KARMA") + " — " +
            new Date().toISOString().slice(0, 10) +
            " — Calibrage GPS via 2 points (rotation + scale + translation)"
          ) + '</description>' +
          _genererStylesKml() +
          stylesIcones +
          (groundOverlay || "") +
          foldersByLevel +
          itineraireFolder +
        '</Document>' +
      '</kml>';
  }

  // =========================
  // GENERATION KMZ (zip)
  // =========================
  // opts (en plus de genererKml) :
  //   - imageBlob : Blob du plan PNG/JPEG (ou null pour skip GroundOverlay)
  //   - imageFilename : "data/TestMAP.png" (sera mis dans files/<basename>)
  //   - iconsToEmbed : { tag → URL/blob } (résolu par caller via RUNTIME_ASSETS ou _iconMap)
  //
  // Retourne Promise<Blob> du KMZ généré.
  async function genererKmz(opts) {
    if (typeof JSZip !== "function") {
      throw new Error("JSZip non chargé — impossible de générer le KMZ");
    }
    const zip = new JSZip();

    // Préparation de l'imageBaseUrl pour le KML
    let imageBaseUrl = null;
    if (opts.include.image && opts.imageBlob && opts.imageFilename) {
      const basename = String(opts.imageFilename).split("/").pop() || "plan.png";
      imageBaseUrl = "files/" + basename;
      zip.folder("files").file(basename, opts.imageBlob);
    }

    // Préparation des icônes embedded (1 par tag dans tagsRencontres)
    // On les ajoute toutes au zip — le KML référencera celles qui sont utilisées
    // dans les Placemarks (les autres ne seront pas affichées, peu importe).
    if (opts.iconsToEmbed) {
      const filesFolder = zip.folder("files").folder("icons");
      for (const tag of Object.keys(opts.iconsToEmbed)) {
        const ic = opts.iconsToEmbed[tag];
        if (!ic) continue;
        if (ic instanceof Blob) {
          filesFolder.file(tag + ".png", ic);
        } else if (typeof ic === "string") {
          // URL → fetch + ajout
          try {
            const r = await fetch(ic);
            if (r.ok) {
              const b = await r.blob();
              filesFolder.file(tag + ".png", b);
            }
          } catch(e) {
            console.warn("[KmzExport] Echec fetch icone", tag, e);
          }
        }
      }
    }

    // Generation KML
    const kml = genererKml(Object.assign({}, opts, { imageBaseUrl: imageBaseUrl }));
    zip.file("doc.kml", kml);

    // Generation du KMZ blob
    return zip.generateAsync({
      type:               "blob",
      compression:        "DEFLATE",
      compressionOptions: { level: 6 },
      mimeType:           "application/vnd.google-earth.kmz"
    });
  }

  // =========================
  // EXPORT GLOBAL
  // =========================
  window.KmzExport = {
    buildTransform:  buildTransform,
    planToGps:       planToGps,
    gpsToPlan:       gpsToPlan,    // 🆕 v1.14.0 : inverse pour import GPX
    getCalibration:  getCalibration,
    setCalibration:  setCalibration,
    genererKml:      genererKml,
    genererKmz:      genererKmz
  };

  console.log("[KmzExport] Module chargé — API window.KmzExport prête");
})();
