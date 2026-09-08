/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// KMZ IMPORT — depuis v173 / Karma_dev
// =====================================================================
// Inverse de l'export KMZ (kmzExport.js v170). Ingère un fichier .kmz
// standard (Google Earth, OsmAnd, Locus, Avenza, IGN scan…) et produit
// un ZIP MyKTAMap utilisable directement.
//
// Pipeline (Phase 1 MVP) :
//   1. Extraction ZIP via JSZip → trouve doc.kml + assets/
//   2. Parsing KML via DOMParser natif (XML)
//   3. Lecture des <GroundOverlay> pour récupérer l'image plan + ses 4
//      coins GPS (LatLonQuad ou LatLonBox)
//   4. Construction de la transformation GPS → pixels (rotation + scale
//      + translation via projection équirectangulaire locale, inverse
//      mathématique de kmzExport.js buildTransform)
//   5. Ingestion des <Placemark> : Point/LineString/Polygon → editor /
//      road / zone MyKTAMap avec types par défaut configurables
//   6. Génération du ZIP MyKTAMap : plan-config.json + image baseImage
//      + data layer "imported" qui groupe points/roads/zones
//
// Mode A (GroundOverlay présent) : pipeline complet ci-dessus.
// Mode C (pas de GroundOverlay) : refus avec explication (l'import KMZ
//   sans image plan nécessiterait un calibrage manuel — non MVP).
//
// API publique : window.KmzImport
//   - extraireKmz(file)              → { kmlDoc, assets }
//   - extraireGroundOverlays(kmlDoc) → [{ name, hrefBlob, corners, ... }]
//   - buildTransform(corners, W, H)  → transform object
//   - gpsToPixel(transform, lat, lng) → { x, y }
//   - ingestPlacemarks(kmlDoc, t, defaults, opts) → { points, roads, zones }
//   - genererZipMyktamap(opts)       → Promise<Blob>
// =====================================================================

(function() {
  "use strict";

  // =========================================================================
  // DÉTECTION KMZ MyKTAMap (round-trip only — v173 simplifié)
  // =========================================================================
  //
  // Phase 1 simplifiée : on ne supporte QUE les KMZ exportés par MyKTAMap
  // (kmzExport.js v170+). Pour détecter ça, on cherche la signature
  // "Export MyKTAMap" dans <Document><description> qui est posée par
  // kmzExport.js > genererKml ligne 485.
  //
  // Returns true si signature MyKTAMap détectée, false sinon.
  function estKmzMyktamap(kmlDoc) {
    if (!kmlDoc) return false;
    // 1) <Document><description> contient "Export MyKTAMap" ?
    const docDesc = kmlDoc.querySelector("Document > description");
    if (docDesc && /Export\s+MyKTAMap/i.test(docDesc.textContent || "")) {
      return true;
    }
    // 2) Fallback : <Document><name> contient "MyKTAMap" ?
    // (cas où l'user a renommé manuellement le KMZ sans casser le KML)
    const docName = kmlDoc.querySelector("Document > name");
    if (docName && /MyKTAMap/i.test(docName.textContent || "")) {
      return true;
    }
    // 3) Fallback : styles MyKTAMap caractéristiques (road_principal/etc.)
    // déclarés dans <Style id="...">. Si on trouve "road_principal" ou
    // "zone_eau" → forte probabilité d'un KMZ MyKTAMap.
    const styles = kmlDoc.querySelectorAll('Style[id^="road_"], Style[id^="zone_"], Style[id^="point_"]');
    if (styles && styles.length >= 2) return true;
    return false;
  }

  // =========================================================================
  // EXTRACTION ZIP
  // =========================================================================

  // Charge le KMZ via JSZip et retourne le DOM KML + un dictionnaire des
  // assets binaires (chemin → Blob). Le KML principal est `doc.kml` par
  // convention ; on tolère d'autres noms si un seul .kml est présent.
  async function extraireKmz(file) {
    if (typeof JSZip === "undefined") {
      throw new Error(window.I18n.t("kmz.err.jszipExtract"));
    }
    const zip = await JSZip.loadAsync(file);

    // Trouver le KML principal (préférer "doc.kml" si présent, sinon
    // 1er .kml à la racine ou n'importe où)
    let kmlFile = zip.file("doc.kml") || zip.file("Doc.kml") || zip.file("DOC.kml");
    if (!kmlFile) {
      const kmlNames = Object.keys(zip.files).filter(function(n) {
        return /\.kml$/i.test(n) && !zip.files[n].dir;
      });
      if (kmlNames.length === 0) {
        throw new Error(window.I18n.t("kmz.err.noKml"));
      }
      // Préférer le plus court chemin (racine) si plusieurs
      kmlNames.sort(function(a, b) { return a.length - b.length; });
      kmlFile = zip.file(kmlNames[0]);
    }

    const kmlText = await kmlFile.async("string");
    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, "application/xml");
    const err = kmlDoc.querySelector("parsererror");
    if (err) {
      throw new Error(window.I18n.t("kmz.err.kmlInvalid",
        { msg: err.textContent || window.I18n.t("kmz.err.kmlParseError") }));
    }

    // Extraire tous les assets non-KML (images, icônes…)
    const assets = {};
    const fileNames = Object.keys(zip.files);
    for (let i = 0; i < fileNames.length; i++) {
      const name = fileNames[i];
      const entry = zip.files[name];
      if (entry.dir) continue;
      if (/\.kml$/i.test(name)) continue;  // skip les KML eux-mêmes
      try {
        assets[name] = await entry.async("blob");
      } catch (e) {
        console.warn("[KmzImport] Asset extraction failed :", name, e);
      }
    }

    return { kmlDoc, assets };
  }

  // =========================================================================
  // RÉSOLUTION D'UN <href> KML → Blob (depuis assets ou data URI)
  // =========================================================================

  // Le href dans <GroundOverlay><Icon><href> ou <Style><IconStyle><Icon><href>
  // peut être :
  //   - relatif (ex: "files/plan.png") → lookup dans assets
  //   - data URI (ex: "data:image/png;base64,...") → décodage en Blob
  //   - URL absolue (ex: "https://...") → non supporté en MVP (refus silencieux)
  function _resoudreHref(href, assets) {
    if (!href) return null;
    // data URI
    if (/^data:/.test(href)) {
      try {
        const m = href.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) return null;
        const mime = m[1];
        const bin = atob(m[2]);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
      } catch(e) { return null; }
    }
    // URL absolue → non supporté
    if (/^https?:\/\//i.test(href)) return null;
    // Chemin relatif — essayer plusieurs variations (avec/sans préfixe "files/")
    if (assets[href]) return assets[href];
    if (assets["files/" + href]) return assets["files/" + href];
    // Normalisation : retirer "./" en début
    const cleaned = href.replace(/^\.\//, "");
    if (assets[cleaned]) return assets[cleaned];
    if (assets["files/" + cleaned]) return assets["files/" + cleaned];
    return null;
  }

  // =========================================================================
  // PARSING <GroundOverlay>
  // =========================================================================

  // Renvoie un tableau de [{ name, hrefBlob, type: "quad"|"box", corners:
  // {sw, se, ne, nw}, rotation }, ...]. Vide si aucun GroundOverlay.
  function extraireGroundOverlays(kmlDoc, assets) {
    const els = kmlDoc.getElementsByTagName("GroundOverlay");
    const out = [];
    for (let i = 0; i < els.length; i++) {
      const parsed = _parseGroundOverlay(els[i], assets);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  function _parseGroundOverlay(el, assets) {
    const name = (el.getElementsByTagName("name")[0]?.textContent || "").trim();
    const iconEl = el.getElementsByTagName("Icon")[0];
    const hrefEl = iconEl ? iconEl.getElementsByTagName("href")[0] : null;
    const href = hrefEl ? hrefEl.textContent.trim() : "";
    const hrefBlob = _resoudreHref(href, assets);

    if (!hrefBlob) {
      console.warn("[KmzImport] GroundOverlay sans image résolvable :", href);
      return null;
    }

    // 1) Essayer gx:LatLonQuad (orientation arbitraire — préféré)
    // Le namespace gx peut être omis dans certains KML, on cherche les 2 variantes.
    let quad = el.getElementsByTagName("gx:LatLonQuad")[0]
            || el.getElementsByTagName("LatLonQuad")[0];
    if (quad) {
      const coordsEl = quad.getElementsByTagName("coordinates")[0];
      if (coordsEl) {
        const tokens = coordsEl.textContent.trim().split(/\s+/);
        const pts = tokens.map(function(c) {
          const arr = c.split(",").map(parseFloat);
          return { lng: arr[0], lat: arr[1] };
        }).filter(function(p) { return isFinite(p.lat) && isFinite(p.lng); });
        if (pts.length === 4) {
          // Ordre KML : SW SE NE NW (sens trigonométrique)
          return {
            name: name,
            hrefBlob: hrefBlob,
            type: "quad",
            corners: { sw: pts[0], se: pts[1], ne: pts[2], nw: pts[3] },
            rotation: 0
          };
        }
      }
    }

    // 2) Fallback LatLonBox (axes-aligned + rotation optionnelle)
    const box = el.getElementsByTagName("LatLonBox")[0];
    if (box) {
      const n = parseFloat(box.getElementsByTagName("north")[0]?.textContent);
      const s = parseFloat(box.getElementsByTagName("south")[0]?.textContent);
      const e = parseFloat(box.getElementsByTagName("east")[0]?.textContent);
      const w = parseFloat(box.getElementsByTagName("west")[0]?.textContent);
      const rotation = parseFloat(box.getElementsByTagName("rotation")[0]?.textContent || "0");
      if (isFinite(n) && isFinite(s) && isFinite(e) && isFinite(w)) {
        // Conversion en LatLonQuad (sans appliquer la rotation pour le MVP —
        // si rotation ≠ 0 on warn et on traite quand même axes-aligned).
        if (rotation !== 0) {
          console.warn("[KmzImport] GroundOverlay LatLonBox avec rotation=" + rotation +
            "° non gérée en MVP, traitée comme axes-aligned.");
        }
        return {
          name: name,
          hrefBlob: hrefBlob,
          type: "box",
          corners: {
            sw: { lat: s, lng: w },
            se: { lat: s, lng: e },
            ne: { lat: n, lng: e },
            nw: { lat: n, lng: w }
          },
          rotation: rotation
        };
      }
    }

    console.warn("[KmzImport] GroundOverlay sans LatLonQuad ni LatLonBox valide :", name);
    return null;
  }

  // =========================================================================
  // TRANSFORMATION GPS → PIXEL (INVERSE DE kmzExport.js)
  // =========================================================================
  //
  // Math : projection équirectangulaire locale. Cohérent avec kmzExport
  // qui utilise les mêmes constantes (~111320 m/° E-W ajusté par cos(lat),
  // ~110540 m/° N-S).
  //
  // On utilise le coin NW comme origine pixel (0, 0). On calcule l'angle de
  // rotation pour aligner le vecteur NW→NE avec l'axe X de l'image (en haut).
  // metresParPixel = norme(NW→NE) / imageWidth.
  //
  // gpsToPixel applique la transformation inverse :
  //   1. Vecteur GPS_point - NW (en lat/lng)
  //   2. Projection en mètres (équirectangulaire)
  //   3. Rotation inverse pour ramener dans le repère image
  //   4. Division par metresParPixel pour obtenir x/y en pixels
  //   5. Inversion de y (axe image vers le bas)
  function buildTransform(corners, imageW, imageH) {
    if (!corners || !corners.nw || !corners.ne) {
      throw new Error(window.I18n.t("kmz.err.cornersRequired"));
    }
    if (!isFinite(imageW) || !isFinite(imageH) || imageW <= 0 || imageH <= 0) {
      throw new Error(window.I18n.t("kmz.err.imageDimsInvalid", { w: imageW, h: imageH }));
    }

    const nw = corners.nw;
    const ne = corners.ne;
    const latMoyenne = (nw.lat + ne.lat) / 2;
    const cosL = Math.cos(latMoyenne * Math.PI / 180);

    // Vecteur NW→NE en mètres (= largeur du plan en haut)
    const dlngTop = ne.lng - nw.lng;
    const dlatTop = ne.lat - nw.lat;
    const dxMetres = dlngTop * 111320 * cosL;
    const dyMetres = dlatTop * 110540;

    const lenTopMetres = Math.hypot(dxMetres, dyMetres);
    if (lenTopMetres < 0.1) {
      throw new Error(window.I18n.t("kmz.err.cornersIdentical"));
    }

    const metresParPixel = lenTopMetres / imageW;

    // Angle de rotation : angle entre vecteur NW→NE (monde) et axe X image (= horizontal "vers la droite")
    // atan2(dy, dx) donne l'angle dans le repère "math" (Y vers le haut)
    const rotation = Math.atan2(dyMetres, dxMetres);

    return {
      origin: { lat: nw.lat, lng: nw.lng },
      metresParPixel: metresParPixel,
      rotation: rotation,
      latMoyenne: latMoyenne,
      imageW: imageW,
      imageH: imageH
    };
  }

  function gpsToPixel(transform, lat, lng) {
    if (!transform) return { x: 0, y: 0 };
    const dlat = lat - transform.origin.lat;
    const dlng = lng - transform.origin.lng;
    const cosL = Math.cos(transform.latMoyenne * Math.PI / 180);
    const dxMetres = dlng * 111320 * cosL;
    const dyMetres = dlat * 110540;

    // Rotation inverse pour aligner avec l'axe X de l'image
    const cosR = Math.cos(-transform.rotation);
    const sinR = Math.sin(-transform.rotation);
    const dxRot = dxMetres * cosR - dyMetres * sinR;
    const dyRot = dxMetres * sinR + dyMetres * cosR;

    const xPx = dxRot / transform.metresParPixel;
    // y inversé : axe Y mathématique pointe haut, axe Y image pointe bas
    const yPx = -dyRot / transform.metresParPixel;

    return { x: xPx, y: yPx };
  }

  // =========================================================================
  // INGESTION DES <Placemark>
  // =========================================================================
  //
  // defaults : { pointTag, roadType, zoneType }
  //   pointTag : tag par défaut pour les Points (ex: "editor" pour data layer,
  //              ou "pa" / "pc" / etc. pour un type spécifique)
  //   roadType : "principal" / "secondaire" / "chemin"
  //   zoneType : "eau" / "remblais" / "effondrement" / "inaccessible"
  //
  // Returns : { points: [...], roads: [...], zones: [...], structures: [...],
  //             stats: { total, kept, skipped, outOfBounds, multiGeometry } }
  // 🆕 v1.9.3-A1.b.1 : ajout de `structures` (piliers + murs). Détection via
  // le styleUrl du Placemark : si commence par "#structure_<type>" on classe
  // le polygone comme structure (sinon zone, comportement legacy).
  function ingestPlacemarks(kmlDoc, transform, defaults) {
    const stats = { total: 0, kept: 0, skipped: 0, outOfBounds: 0, multiGeometry: 0 };
    const out = { points: [], roads: [], zones: [], structures: [], stats: stats };

    const W = transform.imageW;
    const H = transform.imageH;
    // Tolérance bounds : on garde les points jusqu'à 2× hors-image (le KMZ
    // peut avoir des annotations légèrement en dehors du quad)
    const minX = -W, maxX = 2 * W;
    const minY = -H, maxY = 2 * H;
    function _inBounds(p) {
      return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    }

    const placemarks = kmlDoc.getElementsByTagName("Placemark");
    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      stats.total++;
      const nom = (pm.getElementsByTagName("name")[0]?.textContent || "").trim();
      let desc = (pm.getElementsByTagName("description")[0]?.textContent || "").trim();
      // v1.14.20-hotfix9 — l'export KMZ wrappe la description en CDATA et
      // convertit \n en <br/> pour que Google Earth affiche correctement
      // les sauts de ligne dans le balloon. À l'import on inverse pour
      // préserver le format texte original : <br/>, <br>, <br /> → \n.
      // Pattern strict (case-insensitive) pour ne pas toucher d'autres balises
      // HTML qui pourraient être présentes dans une description tierce.
      if (desc) {
        desc = desc.replace(/<br\s*\/?>/gi, "\n");
      }
      const pmId = pm.getAttribute("id") || ("pm_" + i);

      // Helper pour parser une string "lng,lat[,alt] lng,lat[,alt] ..."
      const _parseCoords = function(text) {
        return text.trim().split(/\s+/).map(function(c) {
          const arr = c.split(",").map(parseFloat);
          return { lng: arr[0], lat: arr[1] };
        }).filter(function(p) { return isFinite(p.lat) && isFinite(p.lng); });
      };

      // 🆕 v1.21.1 (audit fix #14) : extraction des ExtendedData MyKTAMap
      // (mkm:level, mkm:fromLevel, mkm:toLevel). Pattern symétrique au
      // _emitExtendedDataLevel de kmzExport.js. Préserve les niveaux M-LVL
      // au roundtrip MKM→KMZ→MKM. Si absent (KMZ tiers ou KMZ MKM < v1.21.1),
      // retourne null sur chaque champ → fallback level 0 côté caller.
      const _mkmData = (function() {
        const out = { level: null, fromLevel: null, toLevel: null };
        const dataEls = pm.querySelectorAll(":scope > ExtendedData > Data");
        for (let j = 0; j < dataEls.length; j++) {
          const el = dataEls[j];
          const name = el.getAttribute("name") || "";
          if (name.indexOf("mkm:") !== 0) continue;
          const valEl = el.querySelector("value");
          if (!valEl) continue;
          const v = parseInt((valEl.textContent || "").trim(), 10);
          if (!Number.isFinite(v)) continue;
          if (name === "mkm:level")     out.level     = v;
          if (name === "mkm:fromLevel") out.fromLevel = v;
          if (name === "mkm:toLevel")   out.toLevel   = v;
        }
        return out;
      })();

      // v1.14.20-hotfix8 (KARMA « pk l'export KMZ ne sauvegarde pas les
      // icônes comme on veut pour pouvoir re-importer ensuite ») :
      // détection du tag/type depuis le <styleUrl> du Placemark (encodé
      // par kmzExport.js sous la forme #point_<tag> / #road_<type> /
      // #zone_<type>). Avant ce fix, seuls les sous-types « structure »
      // (#structure_pilier-1/2/mur/front-1/2) étaient lus — les Points,
      // Roads et Zones tombaient tous sur le tag/type par défaut imposé
      // par la modale Import, perdant l'info à l'import. Maintenant : on
      // lit le styleUrl pour tout, fallback aux défauts seulement si
      // styleUrl absent ou non reconnu.
      const _styleEl = pm.querySelector(":scope > styleUrl");
      const _styleUrl = _styleEl ? (_styleEl.textContent || "").trim() : "";

      // Point — chercher en descendant DIRECT pour éviter les sous-MultiGeometry
      const pointCoords = pm.querySelector(":scope > Point > coordinates");
      if (pointCoords) {
        const pts = _parseCoords(pointCoords.textContent);
        if (pts.length >= 1) {
          const px = gpsToPixel(transform, pts[0].lat, pts[0].lng);
          if (_inBounds(px)) {
            // Tag depuis styleUrl #point_<tag>, fallback défaut
            const ptMatch = _styleUrl.match(/^#point_(.+)$/);
            const tag = (ptMatch && ptMatch[1]) ? ptMatch[1] : defaults.pointTag;
            const _pt = {
              id: pmId, nom: nom, description: desc || undefined,
              x: Math.round(px.x), y: Math.round(px.y),
              tags: [tag]
            };
            // 🆕 v1.21.1 (audit fix #14) : préserve level M-LVL si présent
            if (Number.isInteger(_mkmData.level)) _pt.level = _mkmData.level;
            out.points.push(_pt);
            stats.kept++;
          } else {
            stats.outOfBounds++;
          }
        } else { stats.skipped++; }
        continue;
      }

      // LineString
      const lineCoords = pm.querySelector(":scope > LineString > coordinates");
      if (lineCoords) {
        const pts = _parseCoords(lineCoords.textContent);
        if (pts.length >= 2) {
          const projected = pts.map(function(p) {
            const px = gpsToPixel(transform, p.lat, p.lng);
            return { x: Math.round(px.x), y: Math.round(px.y) };
          });
          // 🆕 v1.9.3-A1.b.2 + v1.14.20-hotfix8 : détection via styleUrl.
          // Notre KMZ export utilise :
          //   #structure_front-1 / front-2 / cust-XYZ → structure polyline
          //   #road_principal / secondaire / chemin / jonction / itinerary / cust-XYZ → road
          // Sinon (KMZ tiers) → fallback defaults.roadType.
          //
          // 🆕 v1.21.1 (audit fix #3) : regex élargie pour capturer aussi
          // les types `cust-*` (entrées custom légende). Avant la regex stricte
          // `^#road_(principal|...)$` ne matchait pas → fallback roadType
          // perdait silencieusement le type custom au roundtrip MKM→KMZ→MKM.
          const frontMatch = _styleUrl.match(/^#structure_(front-1|front-2)$/);
          const frontCustMatch = _styleUrl.match(/^#structure_(cust-[A-Za-z0-9_-]+)$/);
          if (frontMatch || frontCustMatch) {
            // C'est un front de taille (polyline structure) OU structure custom polyline
            const stType = frontMatch ? frontMatch[1] : frontCustMatch[1];
            const _st = {
              id: pmId, nom: nom || undefined,
              description: desc || undefined,
              type: stType, points: projected
            };
            // 🆕 v1.21.1 (audit fix #14) : préserve level M-LVL
            if (Number.isInteger(_mkmData.level)) _st.level = _mkmData.level;
            out.structures.push(_st);
          } else {
            // Type road : built-in OU custom
            const roadMatch = _styleUrl.match(/^#road_(principal|secondaire|chemin|jonction|itinerary)$/);
            const roadCustMatch = _styleUrl.match(/^#road_(cust-[A-Za-z0-9_-]+)$/);
            const roadType = (roadMatch && roadMatch[1])
                             ? roadMatch[1]
                             : (roadCustMatch && roadCustMatch[1])
                               ? roadCustMatch[1]
                               : defaults.roadType;
            const _rd = {
              id: pmId, nom: nom || undefined,
              description: desc || undefined,
              type: roadType, points: projected
            };
            // 🆕 v1.21.1 (audit fix #14) : level + jonction fromLevel/toLevel
            if (roadType === "jonction") {
              if (Number.isInteger(_mkmData.fromLevel)) _rd.fromLevel = _mkmData.fromLevel;
              if (Number.isInteger(_mkmData.toLevel))   _rd.toLevel   = _mkmData.toLevel;
            } else if (Number.isInteger(_mkmData.level)) {
              _rd.level = _mkmData.level;
            }
            out.roads.push(_rd);
          }
          stats.kept++;
        } else { stats.skipped++; }
        continue;
      }

      // Polygon (outer ring seul en MVP — les inner rings/holes ignorés)
      const ring = pm.querySelector(":scope > Polygon > outerBoundaryIs > LinearRing > coordinates");
      if (ring) {
        let pts = _parseCoords(ring.textContent);
        // KML ferme explicitement le polygone (1er point répété en fin) — on retire
        if (pts.length >= 4 &&
            pts[0].lat === pts[pts.length - 1].lat &&
            pts[0].lng === pts[pts.length - 1].lng) {
          pts = pts.slice(0, -1);
        }
        if (pts.length >= 3) {
          const projected = pts.map(function(p) {
            const px = gpsToPixel(transform, p.lat, p.lng);
            return { x: Math.round(px.x), y: Math.round(px.y) };
          });
          // 🆕 v1.9.3-A1.b.1 + v1.14.20-hotfix8 + v1.21.1 audit fix #3 :
          // détection via styleUrl, élargie aux types `cust-*` (entrées
          // custom Légende dessinables) pour roundtrip MKM→KMZ→MKM complet.
          //   #structure_pilier-1 / pilier-2 / mur / cust-XYZ → structure polygone
          //   #zone_eau / remblais / effondrement / inaccessible / cust-XYZ → zone
          // Sinon (KMZ tiers) → fallback defaults.zoneType.
          const structMatch     = _styleUrl.match(/^#structure_(pilier-1|pilier-2|mur)$/);
          const structCustMatch = _styleUrl.match(/^#structure_(cust-[A-Za-z0-9_-]+)$/);
          if (structMatch || structCustMatch) {
            const stType = structMatch ? structMatch[1] : structCustMatch[1];
            const _st = {
              id: pmId, nom: nom || undefined,
              description: desc || undefined,
              type: stType, points: projected
            };
            // 🆕 v1.21.1 (audit fix #14) : level M-LVL
            if (Number.isInteger(_mkmData.level)) _st.level = _mkmData.level;
            out.structures.push(_st);
          } else {
            const zoneMatch     = _styleUrl.match(/^#zone_(eau|remblais|effondrement|inaccessible)$/);
            const zoneCustMatch = _styleUrl.match(/^#zone_(cust-[A-Za-z0-9_-]+)$/);
            const zoneType = (zoneMatch && zoneMatch[1])
                             ? zoneMatch[1]
                             : (zoneCustMatch && zoneCustMatch[1])
                               ? zoneCustMatch[1]
                               : defaults.zoneType;
            const _zn = {
              id: pmId, nom: nom || undefined,
              description: desc || undefined,
              type: zoneType, points: projected
            };
            // 🆕 v1.21.1 (audit fix #14) : level M-LVL
            if (Number.isInteger(_mkmData.level)) _zn.level = _mkmData.level;
            out.zones.push(_zn);
          }
          stats.kept++;
        } else { stats.skipped++; }
        continue;
      }

      // MultiGeometry — non supporté en MVP, marqué dans stats (Phase 2 éclatera)
      const multi = pm.querySelector(":scope > MultiGeometry");
      if (multi) {
        stats.multiGeometry++;
        stats.skipped++;
        continue;
      }

      stats.skipped++;
    }

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
  //   baseImage: Blob,         // image principale (PNG/JPEG) du GroundOverlay
  //   baseImageFilename: string, // nom du fichier dans le ZIP (préserve extension)
  //   imageW, imageH: number,
  //   imported: { points: [...], roads: [...], zones: [...] }
  // }
  async function genererZipMyktamap(opts) {
    if (typeof JSZip === "undefined") {
      throw new Error(window.I18n.t("kmz.err.jszipZipGen"));
    }
    if (!opts || !opts.baseImage || !opts.imageW || !opts.imageH) {
      throw new Error(window.I18n.t("kmz.err.genZipReq"));
    }

    const zip = new JSZip();

    // v1.14.20-hotfix12 (KARMA « depuis import KMZ, on doit pouvoir cocher
    // un mode V2 pour regénérer les tuiles. Pareil M-LVL ») : si l'option
    // tilingV2 est cochée ET que window.MyKTAMapTilingV2 est dispo (fourni
    // par createConf.js > _genererTuilesV2 exposé v1.14.20-hotfix12), on
    // re-tile l'image plate du KMZ vers une structure V2 (tuiles 512×512
    // sur 4 niveaux de zoom) ajoutée au ZIP. Le manifest est posé dans
    // planConfig.tiling et planObj.tiledV2 = true. La baseImage plate
    // reste embarquée comme fallback pour les anciens runtimes.
    let tilingManifest = null;
    let v2Dims = null;
    if (opts.tilingV2 === true && typeof window.MyKTAMapTilingV2 === "function") {
      try {
        const v2 = await window.MyKTAMapTilingV2(opts.baseImage, zip, opts.onTilingProgress);
        tilingManifest = v2.manifest;
        v2Dims = v2.dims;
      } catch(e) {
        console.error("[KmzImport] Échec tilingV2 :", e);
        // On continue sans V2 — le ZIP sera un V1 plat utilisable
      }
    }

    // Image baseImage (préservée verbatim — choix 6=A validé KARMA).
    // Si V2 actif, baseImage reste embarquée comme fallback (cohérent avec
    // le générateur classique createConf.js qui fait pareil).
    const baseFilename = opts.baseImageFilename || "baseImage.png";
    zip.file("data/" + baseFilename, opts.baseImage);

    // plan-config.json minimal valide.
    // v173 fix : champ `icons` ajouté pour éviter le crash TypeError au boot
    // (creerIcones lit iconConfig.track/default). Sans ces 2 valeurs au minimum,
    // map.js > initMapFromConfig throw → écran noir au chargement du plan.
    //
    // v1.14.20-hotfix4 (KARMA « quand je renvois un KMZ de chez nous je perd
    // les icônes ») : copie aussi les icônes embarquées dans le KMZ (path
    // `files/icons/<tag>.png` posé par kmzExport.js ligne 622-642) vers le
    // ZIP MyKTAMap sous `icon/<tag>.png`, et peuple planConfig.icons avec
    // le mapping tag → chemin. Le caller passe opts.assets (le dict complet
    // des fichiers du KMZ, déjà extrait par extraireKmz).
    // v1.14.20-hotfix12 — dimensions post-V2 si re-tilage (l'auto-crop
    // peut avoir réduit la zone effectivement tuilée par rapport à
    // l'image source).
    const finalW = v2Dims ? v2Dims.width  : opts.imageW;
    const finalH = v2Dims ? v2Dims.height : opts.imageH;

    // 🐛 v1.21.1 (audit fix #9) : V2 auto-crop produisait des coords
    // décalées. L'auto-crop de _genererTuilesV2 détecte les marges blanches
    // et retire les pixels [0, cropX] × [0, cropY] → les annotations
    // (ingested.points/roads/zones/structures), projetées AVANT le crop
    // avec les dims ORIGINALES (opts.imageW × opts.imageH), pointent vers
    // des coords obsolètes dans le repère POST-crop. De même, le georef
    // calculé avec finalW/finalH mais les corners SW/NE GPS originaux
    // (qui couvrent l'image PRÉ-crop entière) était mathématiquement faux.
    //
    // Fix : si v2Dims.cropOffset présent, on translate toutes les coords
    // par (-cropX, -cropY) et on recalcule le georef avec les coordonnées
    // GPS interpolées des nouveaux coins post-crop.
    const cropOffset = (v2Dims && v2Dims.cropOffset) ? v2Dims.cropOffset : null;
    if (cropOffset && opts.imported) {
      function _translate(items) {
        if (!Array.isArray(items)) return;
        items.forEach(function(it) {
          if (typeof it.x === "number" && typeof it.y === "number") {
            it.x -= cropOffset.x;
            it.y -= cropOffset.y;
          }
          if (Array.isArray(it.points)) {
            it.points.forEach(function(p) {
              if (typeof p.x === "number" && typeof p.y === "number") {
                p.x -= cropOffset.x;
                p.y -= cropOffset.y;
              }
            });
          }
        });
      }
      _translate(opts.imported.points);
      _translate(opts.imported.roads);
      _translate(opts.imported.zones);
      _translate(opts.imported.structures);
    }

    // 🆕 v1.21.0-fix6 + v1.21.1 audit fix #9 : embed `plan.georef` à partir
    // des coins GPS du GroundOverlay KML, ajusté pour le crop V2 si applicable.
    // Convention plan MyKTAMap (cf convertCoord = [imgH - y, x]) :
    //   - coin SW visuel = (x=0, y=H)        → corners.sw GPS
    //   - coin NE visuel = (x=W, y=0)        → corners.ne GPS
    //
    // Si crop V2 actif, les nouveaux coins SW/NE post-crop correspondent
    // dans l'image originale à des positions intérieures dont on calcule
    // les GPS par interpolation linéaire (cas LatLonBox axis-aligned —
    // approximation acceptable pour LatLonQuad avec rotation faible).
    let _georef = null;
    if (opts.overlayCorners && opts.overlayCorners.sw && opts.overlayCorners.ne
        && isFinite(opts.overlayCorners.sw.lat) && isFinite(opts.overlayCorners.sw.lng)
        && isFinite(opts.overlayCorners.ne.lat) && isFinite(opts.overlayCorners.ne.lng)) {
      const sw = opts.overlayCorners.sw;
      const ne = opts.overlayCorners.ne;
      if (cropOffset) {
        // Recalcul des GPS des nouveaux coins SW/NE post-crop.
        // Convention plan : (x=0, y=opts.imageH) = SW image originale = sw.lat/lng.
        // Le nouveau (x=0, y=finalH) post-crop correspond à (cropX, cropY+finalH)
        // dans l'image originale. Idem (x=finalW, y=0) post-crop → (cropX+finalW, cropY).
        // Interpolation linéaire pour récupérer leur GPS :
        //   frac_x = x_orig / opts.imageW  → lng = sw.lng + frac_x * (ne.lng - sw.lng)
        //   frac_y = y_orig / opts.imageH  → lat = ne.lat - frac_y * (ne.lat - sw.lat)
        function _interpGps(xOrig, yOrig) {
          const fx = xOrig / opts.imageW;
          const fy = yOrig / opts.imageH;
          return {
            lng: sw.lng + fx * (ne.lng - sw.lng),
            lat: ne.lat - fy * (ne.lat - sw.lat)
          };
        }
        const swPost = _interpGps(cropOffset.x,            cropOffset.y + finalH);
        const nePost = _interpGps(cropOffset.x + finalW,   cropOffset.y);
        _georef = {
          pointA: { x: 0,      y: finalH, lat: swPost.lat, lng: swPost.lng },
          pointB: { x: finalW, y: 0,      lat: nePost.lat, lng: nePost.lng }
        };
      } else {
        _georef = {
          pointA: { x: 0,      y: finalH, lat: sw.lat, lng: sw.lng },
          pointB: { x: finalW, y: 0,      lat: ne.lat, lng: ne.lng }
        };
      }
    }

    const planConfig = {
      plan: {
        // ⚠️ i18n « figé à la langue d'import » : ces défauts sont ÉCRITS comme
        // donnée dans le plan-config.json reconstruit (nom/auteur de plan). Ils
        // ne se re-traduisent pas si l'user change de langue après l'import.
        name: opts.planName || window.I18n.t("kmz.import.planNameDefault"),
        version: opts.planVersion || "v1",
        author: opts.planAuthor || window.I18n.t("kmz.import.authorDefault"),
        imageWidth: finalW,
        imageHeight: finalH,
        // 🩸 v1.88.4 — PRÉFIXE `data/` OBLIGATOIRE. Le fichier est écrit dans
        // `data/` du ZIP, mais était déclaré ICI sans le préfixe. En import
        // LOCAL ça passait : `findMatchingFile` retrouve l'asset par son NOM DE
        // BASE, donc l'incohérence était invisible. En mode SERVEUR la résolution
        // est stricte → 404 sur l'image et les calques (constat KARMA : ses plans
        // `*_from_v2` échouaient, les plans du Générateur passaient).
        // ⚠️ `kmzImport` avait déjà corrigé ce motif pour ses CALQUES en
        // v1.21.0-fix5 — jamais pour son `baseImage`.
        baseImage: "data/" + baseFilename,
        // v1.21.0-fix6 : georef si dispo (pattern aligné gpxImport)
        ...(_georef ? { georef: _georef } : {})
      },
      // 🆕 v1.21.0-fix5 (KARMA : "l'icone du tracker est toujours perdu et
      // commence en 0, 0 (pas 50% comme en générateur habituel)") : ajout
      // d'une section `tracking` avec startX/startY centrés sur le plan,
      // cohérent avec createConf.js > _genererZip qui met W/2 × H/2 quand
      // pl_startX / pl_startY ne sont pas saisis. Sans ça, le tracker
      // démarre à (0, 0) = coin haut-gauche du plan, désorientant.
      tracking: {
        startX:        Math.round(finalW / 2),
        startY:        Math.round(finalH / 2),
        scale:         50,    // default raisonnable px/m (modifiable Réglages)
        // 🩸 v1.82.0 — TROISIÈME COPIE DE LA MÊME TRIPLETTE FAUSSE, trouvée
        // par le garde-fou qui venait de la corriger dans sigImport et
        // gpxImport. `stepThreshold: 1.2` est comparé par `tracking.js` à la
        // magnitude de `accelerationIncludingGravity`, qui vaut ~9,81
        // téléphone posé : toujours vrai, donc ~3,6 pas/seconde à l'arrêt.
        ...(window.KTA_TRACKING_USINE || { stepLength: 0.7, stepThreshold: 13, stepCooldown: 400 })
      },
      icons: {
        default: "icon/iconetrack.png",
        track:   "icon/iconetrack.png"
      },
      imageLayers: [],
      dataLayers: []
    };
    // v1.14.20-hotfix12 — flags optionnels (cohérent createConf.js > _genererZip)
    if (opts.multiLevel === true) planConfig.plan.multiLevel = true;
    if (tilingManifest)           planConfig.plan.tiledV2    = true;
    if (tilingManifest)           planConfig.tiling          = tilingManifest;

    // 🆕 v1.18.0 — Roundtrip légende plan-level (cf §58.2 CLAUDE.md +
    // kmzExport.js > genererKmz). Si le KMZ source contient `myktamap-extras.json`
    // (= généré par une autre instance MyKTAMap v1.18.0+), on extrait son
    // champ `customLegend` et on l'injecte dans `planConfig.plan.customLegend`
    // du ZIP MyKTAMap reconstruit. La cascade LegendCustomization > loadPlanState
    // l'appliquera automatiquement au boot du plan importé. Skip silencieux
    // si fichier absent (KMZ d'une app tierce, ou KMZ MyKTAMap < v1.18.0).
    // Tolérant aux variantes de casse / chemin (certains zip-writers ré-archivent
    // avec normalisation du chemin).
    if (opts.assets && typeof opts.assets === "object") {
      const extrasKey = Object.keys(opts.assets).find(function(p) {
        return /(?:^|\/)myktamap-extras\.json$/i.test(p);
      });
      if (extrasKey) {
        try {
          const extrasBlob = opts.assets[extrasKey];
          if (extrasBlob && typeof extrasBlob.text === "function") {
            const txt = await extrasBlob.text();
            const extras = JSON.parse(txt);
            if (extras && extras.customLegend && typeof extras.customLegend === "object") {
              planConfig.plan.customLegend = extras.customLegend;
              console.log("[KmzImport] ✅ Légende plan-level restaurée depuis myktamap-extras.json");
            }
          }
        } catch(e) {
          console.warn("[KmzImport] ⚠️ Échec parse myktamap-extras.json (ignoré) :", e);
        }
      }
    }

    // === Restauration des icônes embarquées dans le KMZ source ===
    // Pattern d'embed côté kmzExport.js : zip.folder("files/icons").file(
    // tag + ".png", blob). Donc côté assets on cherche tout ce qui matche
    // "files/icons/<tag>.<ext>" ou simplement "icons/<tag>.<ext>" si le
    // KMZ a été ré-archivé manuellement. Pour chaque trouvée : copie dans
    // le ZIP MyKTAMap + mapping dans planConfig.icons.
    let _hasTrackIcon   = false;
    let _hasDefaultIcon = false;
    if (opts.assets && typeof opts.assets === "object") {
      for (const path of Object.keys(opts.assets)) {
        const m = path.match(/(?:^|\/)icons\/([^\/]+)\.(png|jpe?g|webp|svg|gif)$/i);
        if (!m) continue;
        const tag = m[1];
        const ext = m[2].toLowerCase();
        const iconBlob = opts.assets[path];
        if (!iconBlob) continue;
        const targetName = "icon/" + tag + "." + ext;
        zip.file(targetName, iconBlob);
        planConfig.icons[tag] = targetName;
        if (tag === "track")   _hasTrackIcon = true;
        if (tag === "default") _hasDefaultIcon = true;
      }
    }

    // v1.14.20-hotfix10 (KARMA « perte de l'icône tracker, on doit repartir
    // en default pour le tracker si non c'est bien ») : si le KMZ source
    // n'embarquait PAS d'icône `track` (cas où aucun point n'avait ce tag
    // — typique d'un KMZ V2 sans tracker), on tente de fetcher l'icône
    // depuis l'app courante (qui la sert sous icon/iconetrack.png). Idem
    // pour `default` si absente. Cached par le SW donc fonctionne aussi
    // offline.
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
    if (!_hasTrackIcon) {
      const fetched = await _tenterFetchIconeApp("icon/iconetrack.png");
      if (fetched) {
        zip.file("icon/iconetrack.png", fetched);
        planConfig.icons.track = "icon/iconetrack.png";
      } else if (planConfig.icons.default && _hasDefaultIcon) {
        // Fallback : pointer track sur l'icône default qu'on a sauvée.
        planConfig.icons.track = planConfig.icons.default;
      }
    }
    if (!_hasDefaultIcon) {
      const fetched = await _tenterFetchIconeApp("icon/iconetrack.png");
      if (fetched) {
        // Réutilise iconetrack comme default si pas mieux dans le KMZ.
        zip.file("icon/iconetrack.png", fetched);
        planConfig.icons.default = "icon/iconetrack.png";
        // Et si track était vide aussi, on l'aligne sur default
        if (!_hasTrackIcon) planConfig.icons.track = "icon/iconetrack.png";
      }
    }

    // Data layer "imported" qui groupe tous les éléments importés.
    // 🆕 v1.9.3-A1.b.1 : ajout des structures (piliers + murs). Si le KMZ
    // exporté venait de MyKTAMap v1.9.3+ avec des structures, elles sont
    // détectées via styleUrl="#structure_*" et préservées avec leur
    // sous-type d'origine. Rétrocompat KMZ legacy : pas de structures →
    // imported.structures vide → no-op silencieux.
    const imported = opts.imported || {};
    const hasContent = (imported.points     && imported.points.length)     ||
                       (imported.roads      && imported.roads.length)      ||
                       (imported.zones      && imported.zones.length)      ||
                       (imported.structures && imported.structures.length);
    if (hasContent) {
      planConfig.dataLayers.push({
        id: "imported",
        // ⚠️ i18n « figé à la langue d'import » : label de dataLayer écrit comme
        // donnée (affiché dans le FilterPanel). Non re-traduit après import.
        label: window.I18n.t("kmz.import.layerLabel"),
        // 🐛 v1.21.0-fix5 (KARMA : "bug en reimport KMZ, les tracés bien que
        // visible ne sont plus pris en compte par itinéraire") : avant on
        // mettait `file: "imported.json"` (sans préfixe data/). Au load, la
        // résolution `getRuntimeAssetUrl("imported.json")` échouait silencieux
        // car l'asset est enregistré sous `data/imported.json`. Le fetch
        // tentait alors l'URL relative `"imported.json"` → 404 → roads jamais
        // chargées en runtime → Pathfinder ne voit aucun réseau → "Aucune
        // route disponible". Les markers étaient visibles car le fetch des
        // POIs est tolérant aux 404 partiels (chaque point indépendant).
        // Pattern aligné sur createConf.js > _genererZip > dataLayers.push
        // qui utilise `"data/" + fileName`.
        file: "data/imported.json",
        visible: true
      });

      const payload = {
        data:       imported.points     || [],
        roads:      imported.roads      || [],
        zones:      imported.zones      || [],
        structures: imported.structures || []
      };
      zip.file("data/imported.json", JSON.stringify(payload, null, 2));
    }

    zip.file("plan-config.json", JSON.stringify(planConfig, null, 2));

    return await zip.generateAsync({ type: "blob" });
  }

  // =========================================================================
  // HELPER : lire les dimensions d'une image (Blob) sans la décoder à fond
  // =========================================================================
  function lireDimensionsImage(blob) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = function() {
        const W = img.naturalWidth, H = img.naturalHeight;
        URL.revokeObjectURL(url);
        if (!W || !H) reject(new Error(window.I18n.t("kmz.err.imageNoDims")));
        else resolve({ width: W, height: H });
      };
      img.onerror = function() {
        URL.revokeObjectURL(url);
        reject(new Error(window.I18n.t("kmz.err.imageDecode")));
      };
      img.src = url;
    });
  }

  // =========================================================================
  // API PUBLIQUE
  // =========================================================================
  window.KmzImport = {
    estKmzMyktamap:        estKmzMyktamap,
    extraireKmz:           extraireKmz,
    extraireGroundOverlays: extraireGroundOverlays,
    buildTransform:        buildTransform,
    gpsToPixel:            gpsToPixel,
    ingestPlacemarks:      ingestPlacemarks,
    genererZipMyktamap:    genererZipMyktamap,
    lireDimensionsImage:   lireDimensionsImage
  };

  console.log("[KmzImport] Module chargé (Phase 1 MVP)");
})();
