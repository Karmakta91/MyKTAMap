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

  // Construit une transformation 2D qui mappe (x,y) plan vers (lat,lng) GPS.
  //
  // planA, planB : {x, y} en pixels image      gpsA, gpsB : {lat, lng}
  // 📐 v1.73.0 (KARMA « erreurs de projection sur un assemblage ») :
  // planC/gpsC OPTIONNELS. Absents → similitude 2 points (rotation + échelle
  // uniforme), comportement historique BIT-À-BIT. Présents → AFFINE 6 DOF
  // (échelles X/Y indépendantes + cisaillement) résolue exactement sur les
  // 3 correspondances — corrige une déformation GLOBALE constante, PAS les
  // erreurs locales d'un assemblage morceau par morceau (l'affine moyenne).
  // C quasi colinéaire avec A-B (aire du triangle < seuil) → C IGNORÉ,
  // repli similitude + `degenereC: true` (jamais de throw pour C : optionnel).
  //
  // Retourne { refPlan, refGps, metresParPixel, rotation, latMoyenne,
  //            affine?, affineInv?, degenereC? } — metresParPixel/rotation
  // restent dérivés de A/B même en affine (affichage d'échelle : approximation
  // assumée, une affine n'a pas UNE échelle).
  function buildTransform(planA, planB, gpsA, gpsB, planC, gpsC) {
    if (!planA || !planB || !gpsA || !gpsB) {
      throw new Error(window.I18n.t("kmz.err.calibIncomplete"));
    }

    // Vecteur plan AB. y plan inverse : y croît vers le bas en MyKTAMap, on
    // veut un repere math standard avec y vers le HAUT pour aligner avec
    // l'axe Nord du GPS.
    const dxPlan = planB.x - planA.x;
    const dyPlan = -(planB.y - planA.y);
    const lenPlan = Math.hypot(dxPlan, dyPlan);
    if (lenPlan < MIN_PLAN_DISTANCE) {
      throw new Error(window.I18n.t("kmz.err.planTooClose",
        { px: Math.round(lenPlan), min: MIN_PLAN_DISTANCE }));
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
      throw new Error(window.I18n.t("kmz.err.gpsTooClose"));
    }

    // Echelle métres par pixel
    const metresParPixel = lenGps / lenPlan;

    // Rotation : angle entre vecteur plan et vecteur GPS
    const anglePlan = Math.atan2(dyPlan, dxPlan);
    const angleGps  = Math.atan2(dyGps,  dxGps);
    const rotation  = angleGps - anglePlan;

    const t = {
      refPlan:        { x: planA.x, y: planA.y },
      refGps:         { lat: gpsA.lat, lng: gpsA.lng },
      metresParPixel: metresParPixel,
      rotation:       rotation,
      latMoyenne:     latMoy
    };

    // 📐 Point C optionnel → transformation AFFINE (repère : yF = -y, mètres
    // équirectangulaires relatifs à gpsA, à la latitude moyenne des 3 points).
    const _fin = function(v) { return typeof v === "number" && Number.isFinite(v); };
    if (planC && gpsC && _fin(planC.x) && _fin(planC.y) && _fin(gpsC.lat) && _fin(gpsC.lng)) {
      const x1 = planA.x, y1 = -planA.y,
            x2 = planB.x, y2 = -planB.y,
            x3 = planC.x, y3 = -planC.y;
      // 2 × aire du triangle plan — quasi nul = C colinéaire avec A-B :
      // l'affine serait dégénérée (matrice non inversible) → repli 2 points.
      const det3 = x1 * (y2 - y3) - y1 * (x2 - x3) + (x2 * y3 - x3 * y2);
      if (Math.abs(det3) < MIN_PLAN_DISTANCE * MIN_PLAN_DISTANCE * 0.05) {
        t.degenereC = true;
        console.warn("[KmzExport] Point C quasi colinéaire avec A-B — ignoré (repli 2 points)");
        return t;
      }
      const latMoy3 = (gpsA.lat + gpsB.lat + gpsC.lat) / 3;
      const kLng = 111320 * Math.cos(latMoy3 * Math.PI / 180), kLat = 110540;
      // Mètres Est/Nord relatifs à gpsA
      const E = [0, (gpsB.lng - gpsA.lng) * kLng, (gpsC.lng - gpsA.lng) * kLng];
      const N = [0, (gpsB.lat - gpsA.lat) * kLat, (gpsC.lat - gpsA.lat) * kLat];
      // Aire du triangle GPS quasi nulle → même dégénérescence côté monde
      const detG = E[0] * (N[1] - N[2]) - N[0] * (E[1] - E[2]) + (E[1] * N[2] - E[2] * N[1]);
      if (Math.abs(detG) < MIN_GPS_DISTANCE_M * MIN_GPS_DISTANCE_M * 0.05) {
        t.degenereC = true;
        console.warn("[KmzExport] Points GPS quasi colinéaires — C ignoré (repli 2 points)");
        return t;
      }
      // Résolution exacte (Cramer) de  E = a·x + b·yF + e  ;  N = c·x + d·yF + f
      const X = [x1, x2, x3], Y = [y1, y2, y3];
      const solve = function(V) {
        const d0 = det3;
        const da = V[0] * (Y[1] - Y[2]) - Y[0] * (V[1] - V[2]) + (V[1] * Y[2] - V[2] * Y[1]);
        const db = X[0] * (V[1] - V[2]) - V[0] * (X[1] - X[2]) + (X[1] * V[2] - X[2] * V[1]);
        const dc = X[0] * (Y[1] * V[2] - Y[2] * V[1]) - Y[0] * (X[1] * V[2] - X[2] * V[1]) + V[0] * (X[1] * Y[2] - X[2] * Y[1]);
        return [da / d0, db / d0, dc / d0];
      };
      const sE = solve(E), sN = solve(N);
      const aff = { a: sE[0], b: sE[1], e: sE[2], c: sN[0], d: sN[1], f: sN[2], latMoy3: latMoy3, kLng: kLng, kLat: kLat };
      const detA = aff.a * aff.d - aff.b * aff.c;
      if (!Number.isFinite(detA) || Math.abs(detA) < 1e-12) {
        t.degenereC = true;
        console.warn("[KmzExport] Affine non inversible — C ignoré (repli 2 points)");
        return t;
      }
      aff.det = detA;
      t.affine = aff;
    }
    return t;
  }

  // 📐 v1.73.0 — Helper : transform depuis un objet calib/georef
  // { pointA, pointB, pointC? } (chaque point = {x, y, lat, lng}).
  // pointC incomplet → ignoré (warn). Throw identique à buildTransform si A/B invalides.
  function buildTransformCalib(g) {
    if (!g || !g.pointA || !g.pointB) {
      throw new Error(window.I18n.t("kmz.err.calibIncomplete"));
    }
    const _fin = function(v) { return typeof v === "number" && Number.isFinite(v); };
    let pC = g.pointC || null;
    if (pC && !(_fin(pC.x) && _fin(pC.y) && _fin(pC.lat) && _fin(pC.lng))) {
      console.warn("[KmzExport] pointC incomplet — ignoré");
      pC = null;
    }
    return buildTransform(
      { x: g.pointA.x, y: g.pointA.y }, { x: g.pointB.x, y: g.pointB.y },
      { lat: g.pointA.lat, lng: g.pointA.lng }, { lat: g.pointB.lat, lng: g.pointB.lng },
      pC ? { x: pC.x, y: pC.y } : null,
      pC ? { lat: pC.lat, lng: pC.lng } : null
    );
  }

  // Convertit (x,y) plan en (lat,lng) GPS via la transformation t.
  function planToGps(t, x, y) {
    if (!t) return null;
    // 📐 v1.73.0 — chemin affine (3 points) : (x, -y) → mètres E/N relatifs
    // à refGps → degrés. Exact sur A, B et C par construction.
    if (t.affine) {
      const f = t.affine, yF = -y;
      const E = f.a * x + f.b * yF + f.e;
      const N = f.c * x + f.d * yF + f.f;
      return { lat: t.refGps.lat + N / f.kLat, lng: t.refGps.lng + E / f.kLng };
    }
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
    // 📐 v1.73.0 — inverse affine exacte (det vérifié non nul à la construction)
    if (t.affine) {
      const f = t.affine;
      const E = (lng - t.refGps.lng) * f.kLng;
      const N = (lat - t.refGps.lat) * f.kLat;
      const x  = (f.d * (E - f.e) - f.b * (N - f.f)) / f.det;
      const yF = (f.a * (N - f.f) - f.c * (E - f.e)) / f.det;
      return { x: x, y: -yF };
    }
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

  // 🩸 v1.83.0 — L'ALTITUDE ÉTAIT ÉCRITE `0`, EN DUR. Un relevé de carrière
  // exporté en KMZ se posait donc À LA SURFACE : ouvert dans Google Earth, il
  // flottait sur les vignes au lieu d'être sous elles. Les profondeurs des
  // niveaux existent depuis la v1.83.0 — il ne restait qu'à les écrire.
  //
  // ⚠️ Un `alt` non nul ne suffit PAS : par défaut KML est en `clampToGround`
  // et l'ignore, et `<tessellate>1</tessellate>` force ce collage au sol. Toute
  // géométrie qui porte une altitude doit donc déclarer `relativeToGround` ET
  // renoncer au tessellate — les deux, sinon rien ne bouge.
  //
  // `relativeToGround` et non `absolute` : notre profondeur est mesurée SOUS
  // LA SURFACE, pas depuis le niveau de la mer. L'altitude du terrain, nous ne
  // la connaissons pas — et l'inventer serait plus faux que zéro.
  function _coord(latlng, alt) {
    const a = Number.isFinite(alt) ? alt : 0;
    return latlng.lng.toFixed(8) + "," + latlng.lat.toFixed(8) + "," + a.toFixed(1);
  }

  // Altitude KML d'un niveau : sa profondeur (négative) ou 0 si non renseignée.
  function _altNiveau(level) {
    if (!Number.isInteger(level)) return 0;
    if (typeof window.getProfondeurNiveau !== "function") return 0;
    const z = window.getProfondeurNiveau(level);
    return Number.isFinite(z) ? z : 0;
  }

  // Balises à poser sur une géométrie qui porte une altitude réelle. Vide
  // quand tout est à 0 : on ne change pas le KML des plans sans profondeurs.
  function _modeAltitude(alt) {
    return (Number.isFinite(alt) && alt !== 0)
      ? "<altitudeMode>relativeToGround</altitudeMode>" : "<tessellate>1</tessellate>";
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

  // =====================================================================
  // 🎨 v1.76.0 — STYLES KML : couleurs résolues, épaisseurs propres au KML
  // =====================================================================
  // Les COULEURS viennent de `js/styleResolver.js` (table canonique) — c'est
  // la seule chose qui doit rester alignée sur la carte.
  // Les LARGEURS, elles, restent définies ICI et ne sont PAS les `weight`
  // Leaflet : l'unité diffère et elles ont été ajustées visuellement à
  // l'échelle GPS (un front de taille est à 5 ici, 10 sur la carte ; un
  // pilier à 2 ici, 3 sur la carte). Les mélanger changerait le rendu dans
  // Google Earth. Idem pour les alphas de remplissage (0.6 ici, 0.7 sur la
  // carte). C'est une VARIANTE DÉLIBÉRÉE, pas une dérive.
  //
  // `{ flat: true }` : le KML ne sait pas peindre un motif SVG, `inaccessible`
  // retombe donc sur son aplat de repli.
  const PREFIXE_CATEGORIE = { road: "traces", zone: "zones", structure: "structures" };

  function _traitsKml(categorie, cle, style) {
    if (categorie === "traces") {
      if (cle === "chemin")    return { width: 3, alpha: 1 };
      if (cle === "itinerary") return { width: 6, alpha: 1 };
      return { width: 4, alpha: 1 };
    }
    if (categorie === "zones") {
      return { width: 2, fillAlpha: (cle === "inaccessible") ? 0.65 : 0.6 };
    }
    // Structures : la géométrie tranche. Un front (polyline) est une
    // LineString épaisse SANS remplissage ; un pilier/mur est un polygone.
    if (style && style.isPolyline) return { width: 5, alpha: 1 };
    return { width: 2, fillAlpha: 0.85 };
  }

  // Retourne le descriptif de style KML d'un type, built-in OU custom, ou null
  // si le type est inconnu (custom supprimé de la légende, par exemple).
  function _styleKmlDe(categorie, cle) {
    if (typeof window.ktaResolveStyle !== "function") return null;
    const s = window.ktaResolveStyle(categorie, cle, { flat: true });
    if (!s) return null;
    const t = _traitsKml(categorie, cle, s);
    const out = { line: s.color, width: t.width };
    if (t.alpha != null) out.alpha = t.alpha;
    // Pas de PolyStyle sur une polyline : le canon donne `fillColor` aux
    // fronts (plusieurs consommateurs le lisent), mais un LineString KML ne
    // doit pas se voir attribuer de remplissage.
    if (s.fillColor && !s.isPolyline) {
      out.fill = s.fillColor;
      out.fillAlpha = t.fillAlpha;
    }
    return out;
  }

  function _blocStyleKml(id, s) {
    let out = '<Style id="' + id + '">';
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
    return out + '</Style>';
  }

  // 🐛 v1.76.0 — CORRECTION DU BUG 2.
  // Les Placemark émettent `<styleUrl>#road_<type></styleUrl>`. Pour un type
  // CUSTOM ça donnait `#road_cust-abc123`, un id qui n'était JAMAIS déclaré
  // dans le document (la table ne listait que les built-in) : styleUrl
  // pendant → Google Earth retombait sur son trait par défaut et la couleur
  // choisie par l'utilisateur était perdue.
  // On déclare désormais un <Style> pour chaque type custom RÉELLEMENT
  // utilisé — collectés pendant la génération du corps, cf. `_idStyleEtCollecte`.
  function _genererStylesKml(idsCustomUtilises) {
    let out = "";
    Object.keys(PREFIXE_CATEGORIE).forEach(function(prefixe) {
      const cat = PREFIXE_CATEGORIE[prefixe];
      const cles = (typeof window.ktaStyleBuiltins === "function") ? window.ktaStyleBuiltins(cat) : [];
      cles.forEach(function(cle) {
        const s = _styleKmlDe(cat, cle);
        if (s) out += _blocStyleKml(prefixe + "_" + cle, s);
      });
    });
    if (idsCustomUtilises && idsCustomUtilises.size) {
      idsCustomUtilises.forEach(function(id) {
        const sep = id.indexOf("_");
        const cat = PREFIXE_CATEGORIE[id.slice(0, sep)];
        const s   = cat ? _styleKmlDe(cat, id.slice(sep + 1)) : null;
        // Type custom introuvable (supprimé de la légende entre-temps) : on
        // n'émet rien. Le styleUrl reste pendant — mais c'est exactement le
        // comportement d'avant, et la donnée elle-même est préservée.
        if (s) out += _blocStyleKml(id, s);
      });
    }
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
    if (!t) throw new Error(window.I18n.t("kmz.err.transformRequired"));

    const planName = opts.planName || "Plan MyKTAMap";

    // === GroundOverlay (image plan géoréférencée) ===
    let groundOverlay = "";
    // 🗼 v1.76.4 — SUPEROVERLAY (plans V2) : un GroundOverlay PAR TUILE de la
    // pyramide, chacun avec sa <Region>/<Lod> — Google Earth n'affiche que le
    // niveau adapté au zoom (le mécanisme standard des superoverlays
    // gdal2tiles/MapTiler, et l'équivalent KML de nos tuiles OSM). Les quads
    // sont calculés par planToGps sur les PIXELS NATIFS couverts par chaque
    // tuile (bornés à l'emprise réelle : les tuiles de bord sont rognées côté
    // collecte). drawOrder croissant avec le niveau : le fin dessus.
    if (opts.include.image && opts.tilesOverlay && Array.isArray(opts.tilesOverlay.levels)) {
      const TO = opts.tilesOverlay;
      const zVals = TO.levels.map(function(l) { return l.z; });
      const zMinP = Math.min.apply(null, zVals), zMaxP = Math.max.apply(null, zVals);
      const opPct2 = (typeof opts.imageOpacity === "number") ? opts.imageOpacity : 60;
      const a255 = Math.round(Math.max(0, Math.min(100, opPct2)) * 2.55);
      const colorTag2 = '<color>' + (a255 < 16 ? "0" : "") + a255.toString(16) + 'ffffff</color>';
      // 15/10/2026 — mosaïque (Google Earth mobile) : quelques grandes images, bornes natives fournies, sans Region.
      const mosaique = TO.mosaique === true;
      const morceaux = ['<Folder><name>' + _xmlEsc(opts.planName + (mosaique ? " — plan" : " — plan (tuiles)")) + '</name>'];
      TO.levels.forEach(function(lvl) {
        const scale = Math.pow(2, -lvl.z);
        // Lod : un seul niveau visible à la fois (128→512 px écran par tuile),
        // le plus grossier reste visible de loin (min 0), le plus fin n'a pas
        // de plafond (max -1) — recettes standard des superoverlays.
        const lodMin = (lvl.z === zMinP) ? 0 : 128;
        const lodMax = (lvl.z === zMaxP) ? -1 : 512;
        // 🐛 v1.76.4-fix (capture KARMA : « tuiles décalées », double image) —
        // k=1 est la bande du BAS du plan (Leaflet CRS.Simple : lat = H − y,
        // vérifié dans tiling.js ET _genererTuilesV2), pas du haut : la
        // v1 plaçait chaque niveau à l'envers, et les rangées partielles
        // décalaient les niveaux entre eux. Mapping bas-en-haut, en pixels
        // NIVEAU convertis au natif, bornés à l'emprise.
        const lvlH = Math.ceil(opts.imageH / scale);
        const lvlW = Math.ceil(opts.imageW / scale);
        // 15/10/2026 — un sous-dossier par niveau et des tuiles NOMMÉES : sans nom, Google Earth (mobile)
        // listait 2 177 « Superposition sans titre » à plat.
        if (!mosaique) morceaux.push('<Folder><name>' + _xmlEsc("Détail " + (lvl.z - zMinP + 1) + " (" + lvl.tiles.length + " tuiles)") + '</name>');
        lvl.tiles.forEach(function(tu) {
          let x0 = tu.col * TO.tileSize * scale;
          let x1 = Math.min(Math.min(lvlW, (tu.col + 1) * TO.tileSize) * scale, opts.imageW);
          let y1 = Math.min((lvlH - (tu.k - 1) * TO.tileSize) * scale, opts.imageH);   // bas de la tuile
          let y0 = Math.max(0, (lvlH - tu.k * TO.tileSize)) * scale;                   // haut de la tuile
          if (mosaique) { x0 = tu.nx0; y0 = tu.ny0; x1 = tu.nx1; y1 = tu.ny1; }
          const qTL = planToGps(t, x0, y0), qTR = planToGps(t, x1, y0);
          const qBR = planToGps(t, x1, y1), qBL = planToGps(t, x0, y1);
          const lats = [qTL.lat, qTR.lat, qBR.lat, qBL.lat];
          const lngs = [qTL.lng, qTR.lng, qBR.lng, qBL.lng];
          morceaux.push(
            '<GroundOverlay>' +
              '<name>' + _xmlEsc(mosaique ? "Image " + tu.k + "," + (tu.col + 1)
                : "Détail " + (lvl.z - zMinP + 1) + " — tuile " + (tu.col + 1) + "," + tu.k) + '</name>' +
              colorTag2 +
              '<drawOrder>' + (lvl.z - zMinP) + '</drawOrder>' +
              '<Icon><href>' + _xmlEsc(tu.kmzPath) + '</href></Icon>' +
              (mosaique ? '' :
              '<Region>' +
                '<LatLonAltBox>' +
                  '<north>' + Math.max.apply(null, lats).toFixed(8) + '</north>' +
                  '<south>' + Math.min.apply(null, lats).toFixed(8) + '</south>' +
                  '<east>'  + Math.max.apply(null, lngs).toFixed(8) + '</east>' +
                  '<west>'  + Math.min.apply(null, lngs).toFixed(8) + '</west>' +
                '</LatLonAltBox>' +
                '<Lod><minLodPixels>' + lodMin + '</minLodPixels><maxLodPixels>' + lodMax + '</maxLodPixels></Lod>' +
              '</Region>') +
              '<gx:LatLonQuad xmlns:gx="http://www.google.com/kml/ext/2.2">' +
                '<coordinates>' + _coord(qBL) + ' ' + _coord(qBR) + ' ' + _coord(qTR) + ' ' + _coord(qTL) + '</coordinates>' +
              '</gx:LatLonQuad>' +
            '</GroundOverlay>');
        });
        if (!mosaique) morceaux.push('</Folder>');
      });
      morceaux.push('</Folder>');
      groundOverlay = morceaux.join("");
    } else if (opts.include.image && opts.imageBaseUrl) {
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
      // 🆕 v1.21.1 (audit fix #14) : préserve level M-LVL via ExtendedData
      const extData = _emitExtendedDataLevel(Number.isInteger(p.level) ? p.level : null);
      return '<Placemark>' +
               '<name>' + _xmlEsc(nom) + '</name>' +
               desc +
               extData +
               '<styleUrl>#point_' + tag + '</styleUrl>' +
               '<Point><coordinates>' + _coord(ll) + '</coordinates></Point>' +
             '</Placemark>';
    }

    // 🆕 v1.21.1 (audit fix #14) : Helper ExtendedData KML pour préserver
    // les méta MyKTAMap (level M-LVL, fromLevel/toLevel pour jonctions) au
    // roundtrip MKM→KMZ→MKM. Sans ça, les niveaux étaient perdus (chaque
    // Placemark ne portait QUE son styleUrl, le folder parent encodait le
    // niveau mais kmzImport.ingestPlacemarks ne le réextrayait pas).
    //
    // Format KML standard <ExtendedData> + <Data name="..."><value>...</value></Data>
    // — transparent pour Google Earth/OsmAnd/etc. (ignore les Data inconnues),
    // mais lu par kmzImport.ingestPlacemarks pour repopulater item.level.
    //
    // Convention de namespace : préfixe `mkm:` pour éviter collision avec
    // d'autres apps qui auraient leurs propres <Data>.
    function _emitExtendedDataLevel(level, extra) {
      const parts = [];
      if (Number.isInteger(level)) {
        parts.push('<Data name="mkm:level"><value>' + level + '</value></Data>');
      }
      if (extra && Number.isInteger(extra.fromLevel)) {
        parts.push('<Data name="mkm:fromLevel"><value>' + extra.fromLevel + '</value></Data>');
      }
      if (extra && Number.isInteger(extra.toLevel)) {
        parts.push('<Data name="mkm:toLevel"><value>' + extra.toLevel + '</value></Data>');
      }
      if (parts.length === 0) return '';
      return '<ExtendedData>' + parts.join('') + '</ExtendedData>';
    }

    // Helper CDATA pour les descriptions HTML compatibles Google Earth.
    function _emitDescriptionCdata(text) {
      const s = String(text == null ? "" : text);
      // \n natif → <br/> pour préservation visuelle dans le balloon Google Earth.
      // CDATA ne nécessite pas d'XML-escape mais on doit éviter de fermer le
      // CDATA prématurément si la description contenait littéralement "]]>"
      // (très rare, mais défensif).
      // 🔒 05/10/2026 (audit XSS) : le texte est échappé (Google Earth rend la description en HTML ;
      // une note partagée ne doit pas y devenir du balisage). « ]]> » ne peut plus survivre à l'échappement.
      const html = window.ktaEsc(s).replace(/\n/g, "<br/>");
      return '<description><![CDATA[' + html + ']]></description>';
    }

    function _emitLineString(road, styleId) {
      if (!road.points || road.points.length < 2) return "";
      // Une jonction relie deux étages : on la pose au plus HAUT des deux,
      // faute de pouvoir incliner une seule altitude sur toute la ligne.
      const _altRoad = (road.type === "jonction")
        ? Math.max(_altNiveau(road.fromLevel), _altNiveau(road.toLevel))
        : _altNiveau(road.level);
      const coords = road.points
        .map(function(p) { return _coord(planToGps(t, p.x, p.y), _altRoad); })
        .join(" ");
      const nom = road.type === "itinerary" ? "🗺️ Itinéraire"
                : road.type === "jonction"  ? "🪜 Jonction"
                : road.type.charAt(0).toUpperCase() + road.type.slice(1);
      // v1.16.0 step 1 — description (note) CDATA + \n → <br/> (cf hotfix9 sur points)
      const desc = road.description ? _emitDescriptionCdata(road.description) : '';
      // 🆕 v1.21.1 (audit fix #14) : level + fromLevel/toLevel pour jonctions
      const extData = (road.type === "jonction")
        ? _emitExtendedDataLevel(null, { fromLevel: road.fromLevel, toLevel: road.toLevel })
        : _emitExtendedDataLevel(Number.isInteger(road.level) ? road.level : null);
      return '<Placemark>' +
               '<name>' + _xmlEsc(nom) + '</name>' +
               desc +
               extData +
               '<styleUrl>#' + styleId + '</styleUrl>' +
               '<LineString>' + _modeAltitude(_altRoad) + '<coordinates>' + coords +
               '</coordinates></LineString>' +
             '</Placemark>';
    }

    function _emitPolygon(zone, styleId) {
      if (!zone.points || zone.points.length < 3) return "";
      // KML : 1er point répété à la fin pour fermer le ring
      const ring = zone.points.slice();
      const _altZone = _altNiveau(zone.level);
      ring.push(zone.points[0]);
      const coords = ring
        .map(function(p) { return _coord(planToGps(t, p.x, p.y), _altZone); })
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
      // 🆕 v1.21.1 (audit fix #14) : préserve level M-LVL
      const extData = _emitExtendedDataLevel(Number.isInteger(zone.level) ? zone.level : null);
      return '<Placemark>' +
               '<name>' + _xmlEsc(nom) + '</name>' +
               desc +
               extData +
               '<styleUrl>#' + styleId + '</styleUrl>' +
               '<Polygon>' + _modeAltitude(_altZone) + '<outerBoundaryIs><LinearRing><coordinates>' +
               coords + '</coordinates></LinearRing></outerBoundaryIs></Polygon>' +
             '</Placemark>';
    }

    // 🆕 v1.23.0 Phase 2 Feature A — Émet le Folder Secours complet pour le KMZ.
    // Cross-app : Google Earth, OsmAnd, Avenza, Locus, ArcGIS Earth, Strava...
    // Retourne { folder: string, styles: string }.
    function _emitSecoursFolder(opts, secoursPlan, palette) {
      const t = opts.transform;
      const groupes = secoursPlan.groupes || [];
      if (groupes.length === 0) return { folder: "", styles: "" };

      let styles = "";
      let folder = '<Folder><name>🚑 Secours — ' + _xmlEsc(secoursPlan.nom || "Plan de secours") + '</name>';
      const ctxDesc = [];
      if (secoursPlan.context && secoursPlan.context.incidentAt) {
        ctxDesc.push("Incident : " + secoursPlan.context.incidentAt);
      }
      ctxDesc.push(groupes.length + " équipe" + (groupes.length > 1 ? "s" : ""));
      if (secoursPlan.context && secoursPlan.context.notes) {
        ctxDesc.push("Notes : " + secoursPlan.context.notes);
      }
      folder += '<description>' + _emitDescriptionCdata(ctxDesc.join("\n")) + '</description>';

      // Styles fixes communs (entrée vert, sortie rouge, sortie boucle orange)
      styles += '<Style id="secours_entree">' +
                  '<IconStyle><color>ff44cc00</color><scale>1.2</scale>' +
                    '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/grn-circle.png</href></Icon>' +
                  '</IconStyle>' +
                  '<LabelStyle><color>ff44cc00</color><scale>0.9</scale></LabelStyle>' +
                '</Style>';
      styles += '<Style id="secours_sortie">' +
                  '<IconStyle><color>ff0000cc</color><scale>1.2</scale>' +
                    '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/red-circle.png</href></Icon>' +
                  '</IconStyle>' +
                  '<LabelStyle><color>ff0000cc</color><scale>0.9</scale></LabelStyle>' +
                '</Style>';
      styles += '<Style id="secours_sortie_boucle">' +
                  '<IconStyle><color>ff00aaff</color><scale>1.3</scale>' +
                    '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/orange-circle.png</href></Icon>' +
                  '</IconStyle>' +
                  '<LabelStyle><color>ff00aaff</color><scale>0.9</scale></LabelStyle>' +
                '</Style>';

      // Style par INDEX de palette : 1 polygon + 1 lineString itinéraire +
      // 1 placemark intermédiaire par couleur (tinted blank circle)
      palette.forEach(function(c, idx) {
        const colorFill = _kmlColor(c.hex, 0.30);   // 30 % fill polygon
        const colorLine = _kmlColor(c.hex, 1.0);    // 100 % outline
        const colorTint = _kmlColor(c.hex, 1.0);    // tint icon intermédiaire
        // Polygon zone
        styles += '<Style id="secours_zone_' + idx + '">' +
                    '<LineStyle><color>' + colorLine + '</color><width>3</width></LineStyle>' +
                    '<PolyStyle><color>' + colorFill + '</color><fill>1</fill><outline>1</outline></PolyStyle>' +
                  '</Style>';
        // Halo roads (line plus épaisse semi-transparente)
        styles += '<Style id="secours_zoneroad_' + idx + '">' +
                    '<LineStyle><color>' + _kmlColor(c.hex, 0.55) + '</color><width>8</width></LineStyle>' +
                  '</Style>';
        // LineString itinéraire (dashed via gx, ou solid si non supporté — KML std)
        styles += '<Style id="secours_iti_' + idx + '">' +
                    '<LineStyle><color>' + colorLine + '</color><width>5</width></LineStyle>' +
                  '</Style>';
        // Intermédiaire : icon teinté couleur équipe
        styles += '<Style id="secours_etape_' + idx + '">' +
                    '<IconStyle><color>' + colorTint + '</color><scale>1.0</scale>' +
                      '<Icon><href>http://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon>' +
                    '</IconStyle>' +
                    '<LabelStyle><color>' + colorTint + '</color><scale>0.8</scale></LabelStyle>' +
                  '</Style>';
      });

      // Helper : retourne le L.latLng (lat, lng) GPS pour un waypoint plan {x, y}
      function _wpToGps(w) {
        return planToGps(t, w.x, w.y);
      }

      // 🆕 v1.23.0 (KARMA "ecrit un dossier pour les point pour pouvoir
      // filtrer plus facilement, et rajoute les itineraire de chaque équipe") :
      // Restructure le KML en sous-folders par CATÉGORIE dans chaque équipe :
      //   <Folder>🚨 Équipe Alpha</Folder>
      //     <Folder>📍 Points (5)</Folder>
      //       └── Entrée + Étapes + Sortie
      //     <Folder>⬛ Zone</Folder>
      //       └── Polygon OU Tracés roads halos
      //     <Folder>🗺️ Itinéraire</Folder>
      //       └── LineString itinéraire complet entrée→étapes→sortie
      //
      // Bénéfice cross-app : dans Google Earth / OsmAnd, l'utilisateur peut
      // cocher/décocher les sous-folders pour ne voir que certaines couches
      // (ex: juste les points pour les briefer, ou juste les zones pour
      // visualiser la couverture globale).
      groupes.forEach(function(g) {
        const idx = (g.couleurIdx || 0) % palette.length;
        const couleurNom = palette[idx].nom || ("Équipe " + (idx + 1));
        let sub = '<Folder><name>🚨 ' + _xmlEsc(g.nom || couleurNom) + ' (' + _xmlEsc(couleurNom) + ')</name>';

        // Description riche HTML (affichée au clic sur le folder dans Google Earth)
        const descParts = [];
        if (Array.isArray(g.membres) && g.membres.length > 0) {
          descParts.push("Membres : " + g.membres.join(", "));
        }
        if (typeof g.distanceM === "number") {
          descParts.push("Distance : " + Math.round(g.distanceM) + " m");
        }
        if (typeof g.dureeEstimeeMin === "number") {
          descParts.push("Durée estimée : ~" + Math.round(g.dureeEstimeeMin) + " min");
        }
        if (g.statut) descParts.push("Statut : " + g.statut);
        if (descParts.length > 0) {
          sub += '<description>' + _emitDescriptionCdata(descParts.join("\n")) + '</description>';
        }

        // ───────────────────────────────────────────────────────────
        // SOUS-FOLDER 1 : 📍 Points (Entrée + Intermédiaires + Sortie)
        // ───────────────────────────────────────────────────────────
        let pointsXml = "";
        let nbPoints = 0;
        // 1a. Entrée
        if (g.entree && typeof g.entree.x === "number") {
          const ll = _wpToGps(g.entree);
          const lbl = g.entree.label || g.entree.pointId || "";
          pointsXml += '<Placemark>' +
                         '<name>📍 Entrée ' + _xmlEsc(g.nom) + (lbl ? " — " + _xmlEsc(lbl) : "") + '</name>' +
                         '<styleUrl>#secours_entree</styleUrl>' +
                         '<Point><coordinates>' + _coord(ll) + '</coordinates></Point>' +
                       '</Placemark>';
          nbPoints++;
        }
        // 1b. Intermédiaires numérotés
        if (Array.isArray(g.intermediaires)) {
          g.intermediaires.forEach(function(w, i) {
            if (!w || typeof w.x !== "number") return;
            const ll = _wpToGps(w);
            const lbl = w.label || w.pointId || "";
            pointsXml += '<Placemark>' +
                           '<name>▾ Étape ' + (i + 1) + ' (' + _xmlEsc(g.nom) + ')' +
                           (lbl ? " — " + _xmlEsc(lbl) : "") + '</name>' +
                           '<styleUrl>#secours_etape_' + idx + '</styleUrl>' +
                           '<Point><coordinates>' + _coord(ll) + '</coordinates></Point>' +
                         '</Placemark>';
            nbPoints++;
          });
        }
        // 1c. Sortie (rouge OU orange si entrée = sortie boucle)
        if (g.sortie && typeof g.sortie.x === "number") {
          const ll = _wpToGps(g.sortie);
          const isBoucle = g.entree && (
            (g.entree.pointId && g.sortie.pointId && g.entree.pointId === g.sortie.pointId) ||
            (Math.abs((g.entree.x || 0) - (g.sortie.x || 0)) < 0.5 &&
             Math.abs((g.entree.y || 0) - (g.sortie.y || 0)) < 0.5)
          );
          const lbl = g.sortie.label || g.sortie.pointId || "";
          const styleId = isBoucle ? "secours_sortie_boucle" : "secours_sortie";
          const namePrefix = isBoucle ? "↻ Boucle " : "🚪 Sortie ";
          pointsXml += '<Placemark>' +
                         '<name>' + namePrefix + _xmlEsc(g.nom) + (lbl ? " — " + _xmlEsc(lbl) : "") + '</name>' +
                         '<styleUrl>#' + styleId + '</styleUrl>' +
                         '<Point><coordinates>' + _coord(ll) + '</coordinates></Point>' +
                       '</Placemark>';
          nbPoints++;
        }
        if (nbPoints > 0) {
          sub += '<Folder><name>📍 Points (' + nbPoints + ')</name>' + pointsXml + '</Folder>';
        }

        // ───────────────────────────────────────────────────────────
        // SOUS-FOLDER 2 : ⬛ Zone (Polygon OU LineStrings halo)
        // ───────────────────────────────────────────────────────────
        let zoneXml = "";
        // 2a. Zone polygon
        if (g.zoneType === "polygon" && Array.isArray(g.zonePolygon) && g.zonePolygon.length >= 3) {
          const ring = g.zonePolygon.slice();
          ring.push(g.zonePolygon[0]);   // ferme le ring
          const coords = ring.map(function(p) { return _coord(_wpToGps(p)); }).join(" ");
          zoneXml += '<Placemark>' +
                       '<name>⬛ Polygone zone ' + _xmlEsc(g.nom) + '</name>' +
                       '<styleUrl>#secours_zone_' + idx + '</styleUrl>' +
                       '<Polygon><outerBoundaryIs><LinearRing><coordinates>' +
                       coords + '</coordinates></LinearRing></outerBoundaryIs></Polygon>' +
                     '</Placemark>';
        }
        // 2b. Zone roads (halo par road sélectionnée)
        // 🩸 29/09/2026 — `zoneRoadIds` porte des EMPREINTES de géométrie, pas des
        // `road.id` : la résolution appartient au Mode Secours (SecoursMode.tracesZone).
        const tracesZone = (window.SecoursMode && typeof window.SecoursMode.tracesZone === "function")
                           ? window.SecoursMode.tracesZone(g) : [];
        if (tracesZone.length > 0) {
          tracesZone.forEach(function(road) {
            if (!road || !Array.isArray(road.points) || road.points.length < 2) return;
            const coords = road.points.map(function(p) { return _coord(_wpToGps(p)); }).join(" ");
            zoneXml += '<Placemark>' +
                         '<name>🛣️ Tracé zone ' + _xmlEsc(g.nom) + '</name>' +
                         '<styleUrl>#secours_zoneroad_' + idx + '</styleUrl>' +
                         '<LineString><tessellate>1</tessellate><coordinates>' +
                         coords + '</coordinates></LineString>' +
                       '</Placemark>';
          });
        }
        if (zoneXml) {
          sub += '<Folder><name>⬛ Zone de recherche</name>' + zoneXml + '</Folder>';
        }

        // ───────────────────────────────────────────────────────────
        // SOUS-FOLDER 3 : 🗺️ Itinéraire (LineString)
        // ───────────────────────────────────────────────────────────
        if (Array.isArray(g.itineraireSuggere) && g.itineraireSuggere.length >= 2) {
          const coords = g.itineraireSuggere.map(function(p) { return _coord(_wpToGps(p)); }).join(" ");
          let itiDesc = "";
          if (typeof g.distanceM === "number" && typeof g.dureeEstimeeMin === "number") {
            itiDesc = '<description>' + _emitDescriptionCdata(
              Math.round(g.distanceM) + " m — ~" + Math.round(g.dureeEstimeeMin) + " min"
            ) + '</description>';
          }
          sub += '<Folder><name>🗺️ Itinéraire</name>' +
                   '<Placemark>' +
                     '<name>🗺️ Itinéraire ' + _xmlEsc(g.nom) + '</name>' +
                     itiDesc +
                     '<styleUrl>#secours_iti_' + idx + '</styleUrl>' +
                     '<LineString><tessellate>1</tessellate><coordinates>' +
                     coords + '</coordinates></LineString>' +
                   '</Placemark>' +
                 '</Folder>';
        }

        sub += '</Folder>';
        folder += sub;
      });

      folder += '</Folder>';
      return { folder: folder, styles: styles };
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
    // 🐛 v1.76.0 (bug 2) — ids de style des types CUSTOM réellement rencontrés
    // pendant la génération du corps. Ils sont déclarés en fin de document par
    // `_genererStylesKml`. Sans ça leur <styleUrl> pointait dans le vide et
    // Google Earth affichait un trait par défaut.
    const idsStyleCustom = new Set();
    function _idStyleEtCollecte(prefixe, type) {
      const id = prefixe + "_" + type;
      // 🧷 v1.76.1 — tout type NON built-in est collecté (plus seulement les
      // `cust-`) : une entrée liée à un id technique (« Bas ») doit recevoir
      // son <Style> KML elle aussi.
      const cat = PREFIXE_CATEGORIE[prefixe];
      const builtins = (cat && typeof window.ktaStyleBuiltins === "function")
                         ? window.ktaStyleBuiltins(cat) : [];
      if (builtins.indexOf(String(type)) === -1) idsStyleCustom.add(id);
      return id;
    }

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
            const styleId = _idStyleEtCollecte("road", r.type);
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
            const styleId = _idStyleEtCollecte("zone", z.type);
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
            const styleId = _idStyleEtCollecte("structure", s.type);
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
              // 🐛 v1.21.1 (audit fix #7) : émission de <description> manquante
              // pour les fronts (asymétrie avec _emitPolygon piliers/mur qui
              // l'émettait via _emitDescriptionCdata). Sans ça, la description
              // d'un front se perdait à l'export KMZ → pas affichée Google Earth,
              // pas roundtrip-able MKM→KMZ→MKM.
              body += '<Placemark>' +
                        '<name>' + _xmlEsc(nom) + '</name>' +
                        (s.description ? _emitDescriptionCdata(s.description) : '') +
                        // 🆕 v1.21.1 (audit fix #14) : level M-LVL pour fronts
                        _emitExtendedDataLevel(Number.isInteger(s.level) ? s.level : null) +
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

    // 🆕 v1.23.0 Phase 2 Feature A (KARMA "Complet : LineString itinéraire +
    // Placemarks intermédiaires numérotés") — Folder secours visible dans
    // Google Earth/OsmAnd/Avenza/etc. Contient pour chaque équipe :
    //   • Polygon zone (fill 30 % + outline) OU LineStrings halo si zoneType=roads
    //   • Placemark Entrée (icon vert)
    //   • Placemarks Intermédiaires (icon couleur équipe avec numéro 1, 2, ...)
    //   • Placemark Sortie (icon rouge OU orange si boucle entrée=sortie)
    //   • LineString Itinéraire (couleur équipe weight 5)
    //
    // Apps tierces qui ignorent les <Folder> imbriqués affichent quand même
    // tous les Placemarks à plat (compat dégradée OK).
    let secoursFolder = "";
    let secoursStyles = "";
    if (opts.secoursPlan && typeof opts.secoursPlan === "object"
        && Array.isArray(opts.secoursPlan.groupes) && opts.secoursPlan.groupes.length > 0
        && Array.isArray(opts.secoursPalette) && opts.secoursPalette.length > 0) {
      const sec = _emitSecoursFolder(opts, opts.secoursPlan, opts.secoursPalette);
      secoursFolder = sec.folder;
      secoursStyles = sec.styles;
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
          _genererStylesKml(idsStyleCustom) +
          stylesIcones +
          secoursStyles +
          (groundOverlay || "") +
          foldersByLevel +
          itineraireFolder +
          secoursFolder +
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
  //   - planCustomLegend : objet `LegendCustomization.getSessionState()` du
  //                        niveau plan (cf §58.2 CLAUDE.md). Si présent et
  //                        non-null, embed dans `myktamap-extras.json`
  //                        annexe au doc.kml. Les apps tierces (Google Earth,
  //                        OsmAnd, Avenza) ignorent ce fichier inconnu sans
  //                        broncher. Au ré-import MyKTAMap, parsé par
  //                        kmzImport.js > _extraireExtras et injecté dans
  //                        plan-config.json > plan.customLegend du ZIP
  //                        reconstruit — la légende voyage avec le plan.
  //
  // Retourne Promise<Blob> du KMZ généré.
  async function genererKmz(opts) {
    if (typeof JSZip !== "function") {
      throw new Error(window.I18n.t("kmz.err.jszipExport"));
    }
    const zip = new JSZip();
    // 15/10/2026 (KMZ d'un grand plan tuilé : croix rouges dans Google Earth sur iPhone, archive pourtant saine) :
    // 1. le KML est écrit EN PREMIER dans l'archive (usage du format ; certains lecteurs prennent le 1er .kml) ;
    // 2. les images (JPEG / PNG, déjà compressées) sont RANGÉES sans recompression (STORE) : aucun gain à les
    //    dégonfler, seulement du temps et de la mémoire à l'export comme à la lecture.
    const SANS_COMPRESSION = { compression: "STORE" };

    // Préparation de l'imageBaseUrl pour le KML
    let imageBaseUrl = null, imageBasename = null;
    if (opts.include.image && opts.imageBlob && opts.imageFilename) {
      imageBasename = String(opts.imageFilename).split("/").pop() || "plan.png";
      imageBaseUrl = "files/" + imageBasename;
    }

    // Generation KML — d'abord, pour qu'il soit le premier fichier de l'archive
    const kml = genererKml(Object.assign({}, opts, { imageBaseUrl: imageBaseUrl }));
    zip.file("doc.kml", kml);

    if (imageBaseUrl) zip.folder("files").file(imageBasename, opts.imageBlob, SANS_COMPRESSION);
    // 🗼 v1.76.4 — tuiles du superoverlay V2 : embarquées telles quelles
    // (kmzPath relatif référencé par les <Icon> des GroundOverlays)
    if (opts.include.image && opts.tilesOverlay && Array.isArray(opts.tilesOverlay.levels)) {
      opts.tilesOverlay.levels.forEach(function(lvl) {
        lvl.tiles.forEach(function(tu) { zip.file(tu.kmzPath, tu.blob, SANS_COMPRESSION); });
      });
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
          filesFolder.file(tag + ".png", ic, SANS_COMPRESSION);
        } else if (typeof ic === "string") {
          // URL → fetch + ajout
          try {
            const r = await fetch(ic);
            if (r.ok) {
              const b = await r.blob();
              filesFolder.file(tag + ".png", b, SANS_COMPRESSION);
            }
          } catch(e) {
            console.warn("[KmzExport] Echec fetch icone", tag, e);
          }
        }
      }
    }

    // 🆕 v1.18.0 — Légende plan-level (roundtrip MyKTAMap ↔ MyKTAMap).
    // Embed `customLegend` dans un fichier JSON annexe au doc.kml. Les apps
    // tierces ignorent les fichiers inconnus du ZIP KMZ — c'est strictement
    // une donnée MyKTAMap. Format ouvert pour ajouter d'autres « extras » plus
    // tard (favoris partagés, notes globales, etc.) sans bumper la version.
    // 🆕 v1.22.0 (KARMA "définir un plan de secours") : embed un scénario
    // Mode Secours via opts.secoursPlan dans le même myktamap-extras.json.
    // Plusieurs champs peuvent coexister (customLegend + secoursPlan), c'est
    // le but du wrapper extensible.
    const _hasExtras = !!(
      (opts.planCustomLegend && typeof opts.planCustomLegend === "object") ||
      (opts.secoursPlan      && typeof opts.secoursPlan      === "object")
    );
    if (_hasExtras) {
      const extras = {
        type:          "myktamap-kmz-extras",
        version:       1,
        exportedAt:    new Date().toISOString()
      };
      if (opts.planCustomLegend && typeof opts.planCustomLegend === "object") {
        extras.customLegend = opts.planCustomLegend;
      }
      if (opts.secoursPlan && typeof opts.secoursPlan === "object") {
        extras.secoursPlan = opts.secoursPlan;
      }
      zip.file("myktamap-extras.json", JSON.stringify(extras, null, 2));
    }

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
    buildTransformCalib: buildTransformCalib,
    planToGps:       planToGps,
    gpsToPlan:       gpsToPlan,    // 🆕 v1.14.0 : inverse pour import GPX
    getCalibration:  getCalibration,
    setCalibration:  setCalibration,
    genererKml:      genererKml,
    genererKmz:      genererKmz
  };

  console.log("[KmzExport] Module chargé — API window.KmzExport prête");
})();
