/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// KMZ IMPORT — .kmz (Google Earth, OsmAnd, Locus, Avenza…) → ZIP MyKTAMap
// =====================================================================
// Inverse de kmzExport.js : JSZip → doc.kml (DOMParser) → <GroundOverlay> (image + 4 coins GPS, LatLonQuad
// ou LatLonBox) → transformation GPS → pixels → <Placemark> (Point/LineString/Polygon → points, routes,
// zones, structures ; types lus dans le styleUrl, défauts sinon) → ZIP (plan-config.json, image, calque
// "imported", icônes, légende de myktamap-extras.json, tuilage V2 optionnel).
// Sans GroundOverlay : refus expliqué (il faudrait un calage manuel).
// Expose window.KmzImport : estKmzMyktamap, extraireKmz, extraireGroundOverlays, buildTransform, gpsToPixel,
//   ingestPlacemarks, genererZipMyktamap, lireDimensionsImage.
// ⚠️ Chemins du ZIP préfixés `data/` (baseImage, calques) : la résolution serveur est stricte.
// Doc : docs/architecture/exports.md · docs/architecture/plans-loader.md
// =====================================================================

(function() {
  "use strict";

  // ── Détection d'un KMZ exporté par MyKTAMap ──────────
  // Signature « Export MyKTAMap » dans <Document><description> (posée par kmzExport.js > genererKml).
  function estKmzMyktamap(kmlDoc) {
    if (!kmlDoc) return false;
    const docDesc = kmlDoc.querySelector("Document > description");
    if (docDesc && /Export\s+MyKTAMap/i.test(docDesc.textContent || "")) {
      return true;
    }
    // Repli : <Document><name> (KMZ renommé sans casser le KML).
    const docName = kmlDoc.querySelector("Document > name");
    if (docName && /MyKTAMap/i.test(docName.textContent || "")) {
      return true;
    }
    // Repli : styles caractéristiques (road_principal, zone_eau…).
    const styles = kmlDoc.querySelectorAll('Style[id^="road_"], Style[id^="zone_"], Style[id^="point_"]');
    if (styles && styles.length >= 2) return true;
    return false;
  }

  // ── Extraction ZIP ──────────

  // → DOM KML + assets binaires (chemin → Blob). `doc.kml` par convention, sinon le .kml le plus court.
  async function extraireKmz(file) {
    if (typeof JSZip === "undefined") {
      throw new Error(window.I18n.t("kmz.err.jszipExtract"));
    }
    const zip = await JSZip.loadAsync(file);

    let kmlFile = zip.file("doc.kml") || zip.file("Doc.kml") || zip.file("DOC.kml");
    if (!kmlFile) {
      const kmlNames = Object.keys(zip.files).filter(function(n) {
        return /\.kml$/i.test(n) && !zip.files[n].dir;
      });
      if (kmlNames.length === 0) {
        throw new Error(window.I18n.t("kmz.err.noKml"));
      }
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

  // ── <href> KML → Blob ──────────
  // Relatif (files/plan.png) → assets ; data URI → Blob ; URL absolue → non supportée (null).
  function _resoudreHref(href, assets) {
    if (!href) return null;
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
    if (/^https?:\/\//i.test(href)) return null;
    // Chemin relatif : avec/sans préfixe "files/", sans "./".
    if (assets[href]) return assets[href];
    if (assets["files/" + href]) return assets["files/" + href];
    const cleaned = href.replace(/^\.\//, "");
    if (assets[cleaned]) return assets[cleaned];
    if (assets["files/" + cleaned]) return assets["files/" + cleaned];
    return null;
  }

  // ── <GroundOverlay> ──────────

  // → [{ name, hrefBlob, type: "quad"|"box", corners: {sw, se, ne, nw}, rotation }] ; [] si aucun.
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

    // gx:LatLonQuad d'abord (orientation libre) ; le namespace gx peut être omis.
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
          // Ordre KML : SW SE NE NW.
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

    // Repli LatLonBox.
    const box = el.getElementsByTagName("LatLonBox")[0];
    if (box) {
      const n = parseFloat(box.getElementsByTagName("north")[0]?.textContent);
      const s = parseFloat(box.getElementsByTagName("south")[0]?.textContent);
      const e = parseFloat(box.getElementsByTagName("east")[0]?.textContent);
      const w = parseFloat(box.getElementsByTagName("west")[0]?.textContent);
      const rotation = parseFloat(box.getElementsByTagName("rotation")[0]?.textContent || "0");
      if (isFinite(n) && isFinite(s) && isFinite(e) && isFinite(w)) {
        // ⚠️ Rotation de la LatLonBox non appliquée : warn et traitement aligné sur les axes.
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

  // ── Transformation GPS → pixel ──────────
  // Projection équirectangulaire locale, mêmes constantes que kmzExport (~111320 m/° × cos(lat), ~110540
  // m/°). Origine pixel = coin NW ; rotation alignant NW→NE sur l'axe X ; metresParPixel =
  // |NW→NE| / largeur. gpsToPixel : vecteur au NW → mètres → rotation inverse → ÷ metresParPixel →
  // y inversé (axe image vers le bas).
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

    const dlngTop = ne.lng - nw.lng;
    const dlatTop = ne.lat - nw.lat;
    const dxMetres = dlngTop * 111320 * cosL;
    const dyMetres = dlatTop * 110540;

    const lenTopMetres = Math.hypot(dxMetres, dyMetres);
    if (lenTopMetres < 0.1) {
      throw new Error(window.I18n.t("kmz.err.cornersIdentical"));
    }

    const metresParPixel = lenTopMetres / imageW;

    // atan2 dans le repère math (Y vers le haut).
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

    const cosR = Math.cos(-transform.rotation);
    const sinR = Math.sin(-transform.rotation);
    const dxRot = dxMetres * cosR - dyMetres * sinR;
    const dyRot = dxMetres * sinR + dyMetres * cosR;

    const xPx = dxRot / transform.metresParPixel;
    // y inversé : Y math vers le haut, Y image vers le bas.
    const yPx = -dyRot / transform.metresParPixel;

    return { x: xPx, y: yPx };
  }

  // ── Ingestion des <Placemark> ──────────
  // defaults : { pointTag, roadType, zoneType }.
  // → { points, roads, zones, structures, stats: { total, kept, skipped, outOfBounds, multiGeometry } }.
  function ingestPlacemarks(kmlDoc, transform, defaults) {
    const stats = { total: 0, kept: 0, skipped: 0, outOfBounds: 0, multiGeometry: 0 };
    const out = { points: [], roads: [], zones: [], structures: [], stats: stats };

    const W = transform.imageW;
    const H = transform.imageH;
    // Points gardés jusqu'à 2× hors image (annotations un peu hors du quad).
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
      // Inverse de l'export (CDATA, \n → <br/>) : <br/>, <br>, <br /> → \n. Motif strict, insensible à la
      // casse, pour ne pas toucher d'autres balises d'une description tierce.
      if (desc) {
        desc = desc.replace(/<br\s*\/?>/gi, "\n");
      }
      const pmId = pm.getAttribute("id") || ("pm_" + i);

      // "lng,lat[,alt] lng,lat[,alt] …"
      const _parseCoords = function(text) {
        return text.trim().split(/\s+/).map(function(c) {
          const arr = c.split(",").map(parseFloat);
          return { lng: arr[0], lat: arr[1] };
        }).filter(function(p) { return isFinite(p.lat) && isFinite(p.lng); });
      };

      // ExtendedData MyKTAMap (mkm:level, mkm:fromLevel, mkm:toLevel), symétrique de
      // kmzExport > _emitExtendedDataLevel. Absent (KMZ tiers) → null → niveau 0 côté appelant.
      const _mkmData = (function() {
        const out = { level: null, fromLevel: null, toLevel: null, niveaux: null, copie: false, dateConstat: null };
        const dataEls = pm.querySelectorAll(":scope > ExtendedData > Data");
        for (let j = 0; j < dataEls.length; j++) {
          const el = dataEls[j];
          const name = el.getAttribute("name") || "";
          if (name.indexOf("mkm:") !== 0) continue;
          const valEl = el.querySelector("value");
          if (!valEl) continue;
          // Passage entre niveaux : « 0,-1 » ; une copie (dossier d'un autre de ses niveaux) n'est pas un point.
          if (name === "mkm:niveaux") {
            const l = (valEl.textContent || "").split(",").map(function(s) { return Number(s.trim()); });
            if (l.length && l.every(Number.isInteger)) out.niveaux = l;
            continue;
          }
          if (name === "mkm:copie") { out.copie = (valEl.textContent || "").trim() === "1"; continue; }
          if (name === "mkm:dateConstat") {
            out.dateConstat = window.KtaPoiDanger ? window.KtaPoiDanger.dateValide(valEl.textContent || "") : null;
            continue;
          }
          const v = parseInt((valEl.textContent || "").trim(), 10);
          if (!Number.isFinite(v)) continue;
          if (name === "mkm:level")     out.level     = v;
          if (name === "mkm:fromLevel") out.fromLevel = v;
          if (name === "mkm:toLevel")   out.toLevel   = v;
        }
        return out;
      })();

      // Tag/type lus dans le <styleUrl> (#point_<tag>, #road_<type>, #zone_<type>, #structure_<type>) pour
      // le roundtrip ; défauts de la modale seulement si styleUrl absent ou non reconnu.
      const _styleEl = pm.querySelector(":scope > styleUrl");
      const _styleUrl = _styleEl ? (_styleEl.textContent || "").trim() : "";

      // Point en descendant DIRECT (pas dans un MultiGeometry).
      const pointCoords = pm.querySelector(":scope > Point > coordinates");
      if (pointCoords && _mkmData.copie) { stats.skipped++; continue; }
      if (pointCoords) {
        const pts = _parseCoords(pointCoords.textContent);
        if (pts.length >= 1) {
          const px = gpsToPixel(transform, pts[0].lat, pts[0].lng);
          if (_inBounds(px)) {
            const ptMatch = _styleUrl.match(/^#point_(.+)$/);
            const tag = (ptMatch && ptMatch[1]) ? ptMatch[1] : defaults.pointTag;
            const _pt = {
              id: pmId, nom: nom, description: desc || undefined,
              x: Math.round(px.x), y: Math.round(px.y),
              tags: [tag]
            };
            if (Number.isInteger(_mkmData.level)) _pt.level = _mkmData.level;
            if (_mkmData.niveaux) _pt.niveaux = _mkmData.niveaux;
            if (_mkmData.dateConstat) _pt.dateConstat = _mkmData.dateConstat;
            out.points.push(_pt);
            stats.kept++;
          } else {
            stats.outOfBounds++;
          }
        } else { stats.skipped++; }
        continue;
      }

      const lineCoords = pm.querySelector(":scope > LineString > coordinates");
      if (lineCoords) {
        const pts = _parseCoords(lineCoords.textContent);
        if (pts.length >= 2) {
          const projected = pts.map(function(p) {
            const px = gpsToPixel(transform, p.lat, p.lng);
            return { x: Math.round(px.x), y: Math.round(px.y) };
          });
          // #structure_front-1/2/cust-… → structure polyline ; #road_<built-in>/cust-… → route ; sinon
          // defaults.roadType. 🩸 Les types `cust-*` doivent matcher, sinon le type custom est perdu en silence.
          const frontMatch = _styleUrl.match(/^#structure_(front-1|front-2)$/);
          const frontCustMatch = _styleUrl.match(/^#structure_(cust-[A-Za-z0-9_-]+)$/);
          if (frontMatch || frontCustMatch) {
            const stType = frontMatch ? frontMatch[1] : frontCustMatch[1];
            const _st = {
              id: pmId, nom: nom || undefined,
              description: desc || undefined,
              type: stType, points: projected
            };
            if (Number.isInteger(_mkmData.level)) _st.level = _mkmData.level;
            out.structures.push(_st);
          } else {
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

      // Polygone : anneau extérieur seul (trous ignorés).
      const ring = pm.querySelector(":scope > Polygon > outerBoundaryIs > LinearRing > coordinates");
      if (ring) {
        let pts = _parseCoords(ring.textContent);
        // Le KML répète le 1er point en fin : retiré.
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
          // #structure_pilier-1/2/mur/cust-… → structure polygone ; #zone_<built-in>/cust-… → zone ;
          // sinon defaults.zoneType.
          const structMatch     = _styleUrl.match(/^#structure_(pilier-1|pilier-2|mur)$/);
          const structCustMatch = _styleUrl.match(/^#structure_(cust-[A-Za-z0-9_-]+)$/);
          if (structMatch || structCustMatch) {
            const stType = structMatch ? structMatch[1] : structCustMatch[1];
            const _st = {
              id: pmId, nom: nom || undefined,
              description: desc || undefined,
              type: stType, points: projected
            };
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
            if (Number.isInteger(_mkmData.level)) _zn.level = _mkmData.level;
            out.zones.push(_zn);
          }
          stats.kept++;
        } else { stats.skipped++; }
        continue;
      }

      // MultiGeometry non supporté : compté dans stats.
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

  // ── Génération du ZIP MyKTAMap ──────────
  // opts = { planName, planVersion, planAuthor, baseImage (Blob), baseImageFilename, imageW, imageH,
  //   imported: { points, roads, zones, structures }, assets, tilingV2?, multiLevel?, tags?, corners? }
  async function genererZipMyktamap(opts) {
    if (typeof JSZip === "undefined") {
      throw new Error(window.I18n.t("kmz.err.jszipZipGen"));
    }
    if (!opts || !opts.baseImage || !opts.imageW || !opts.imageH) {
      throw new Error(window.I18n.t("kmz.err.genZipReq"));
    }

    const zip = new JSZip();

    // tilingV2 coché et window.MyKTAMapTilingV2 dispo (createConf.js > _genererTuilesV2) : l'image plate
    // est retuilée en V2 (manifest dans planConfig.tiling, tiledV2 = true) ; la baseImage plate reste
    // embarquée en repli pour les anciens runtimes.
    let tilingManifest = null;
    let v2Dims = null;
    if (opts.tilingV2 === true && typeof window.MyKTAMapTilingV2 === "function") {
      try {
        const v2 = await window.MyKTAMapTilingV2(opts.baseImage, zip, opts.onTilingProgress);
        tilingManifest = v2.manifest;
        v2Dims = v2.dims;
      } catch(e) {
        console.error("[KmzImport] Échec tilingV2 :", e);
        // Sans V2 : le ZIP reste un V1 plat utilisable.
      }
    }

    // baseImage préservée telle quelle (aussi en V2, comme le Générateur).
    const baseFilename = opts.baseImageFilename || "baseImage.png";
    zip.file("data/" + baseFilename, opts.baseImage);

    // 🩸 `icons` obligatoire : sans track/default, map.js > initMapFromConfig lève → écran noir.
    // Les icônes embarquées (files/icons/<tag>.png de kmzExport > genererKmz) sont copiées en
    // icon/<tag>.png et mappées dans planConfig.icons (opts.assets = fichiers du KMZ).
    // Dimensions post-V2 si retuilage (l'auto-crop peut réduire la zone).
    const finalW = v2Dims ? v2Dims.width  : opts.imageW;
    const finalH = v2Dims ? v2Dims.height : opts.imageH;

    // 🩸 L'auto-crop V2 retire [0, cropX] × [0, cropY] : les annotations projetées AVANT le crop (dims
    // d'origine) et le georef (coins GPS de l'image entière) seraient faux. Si v2Dims.cropOffset : tout
    // est translaté de (-cropX, -cropY) et le georef recalculé sur les coins post-crop interpolés.
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

    // `plan.georef` depuis les coins GPS du GroundOverlay (convertCoord = [imgH - y, x]) :
    // SW visuel = (x=0, y=H) → corners.sw ; NE visuel = (x=W, y=0) → corners.ne.
    // Avec crop V2 : GPS des nouveaux coins par interpolation linéaire (exact pour une LatLonBox,
    // approximation acceptable pour un LatLonQuad peu tourné).
    let _georef = null;
    if (opts.overlayCorners && opts.overlayCorners.sw && opts.overlayCorners.ne
        && isFinite(opts.overlayCorners.sw.lat) && isFinite(opts.overlayCorners.sw.lng)
        && isFinite(opts.overlayCorners.ne.lat) && isFinite(opts.overlayCorners.ne.lng)) {
      const sw = opts.overlayCorners.sw;
      const ne = opts.overlayCorners.ne;
      if (cropOffset) {
        // Nouveau (x=0, y=finalH) = (cropX, cropY+finalH) d'origine ; (x=finalW, y=0) = (cropX+finalW, cropY).
        // lng = sw.lng + x/imageW × (ne.lng − sw.lng) ; lat = ne.lat − y/imageH × (ne.lat − sw.lat).
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
        // ⚠️ Défauts ÉCRITS comme donnée dans le plan-config : figés à la langue d'import.
        name: opts.planName || window.I18n.t("kmz.import.planNameDefault"),
        version: opts.planVersion || "v1",
        author: opts.planAuthor || window.I18n.t("kmz.import.authorDefault"),
        imageWidth: finalW,
        imageHeight: finalH,
        // 🩸 PRÉFIXE `data/` OBLIGATOIRE : le fichier est dans `data/` du ZIP. En local, findMatchingFile
        // retrouve l'asset par son nom de base et masque l'erreur ; en mode SERVEUR la résolution est stricte
        // → 404 sur l'image.
        baseImage: "data/" + baseFilename,
        ...(_georef ? { georef: _georef } : {})
      },
      // Départ du tracker au centre du plan (comme createConf.js > _genererZip), sinon (0, 0) = coin
      // haut-gauche.
      tracking: {
        startX:        Math.round(finalW / 2),
        startY:        Math.round(finalH / 2),
        scale:         50,    // default raisonnable px/m (modifiable Réglages)
        // Pas de stepLength/stepThreshold/stepCooldown : réglages de la personne, globaux à l'appareil.
      },
      icons: {
        default: "icon/iconetrack.png",
        track:   "icon/iconetrack.png"
      },
      imageLayers: [],
      dataLayers: []
    };
    if (opts.multiLevel === true) planConfig.plan.multiLevel = true;
    // Étiquettes déjà normalisées (PlanRegistry.normaliserTags) ; absentes = champ absent.
    if (Array.isArray(opts.tags) && opts.tags.length) planConfig.plan.tags = opts.tags.slice(0, 12);
    if (tilingManifest)           planConfig.plan.tiledV2    = true;
    if (tilingManifest)           planConfig.tiling          = tilingManifest;

    // myktamap-extras.json du KMZ (autre instance MyKTAMap) : `customLegend` → planConfig.plan.customLegend,
    // appliquée au boot par LegendCustomization > loadPlanState. Absent (app tierce) : ignoré. Casse et
    // chemin tolérés (zip ré-archivés).
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

    // Icônes embarquées : files/icons/<tag>.<ext> (ou icons/… si ré-archivé) → copie + mapping.
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

    // KMZ sans icône `track` (ou `default`) : celle de l'app (icon/iconetrack.png, en cache SW, donc
    // hors ligne aussi), sinon repli sur default.
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
        planConfig.icons.track = planConfig.icons.default;
      }
    }
    if (!_hasDefaultIcon) {
      const fetched = await _tenterFetchIconeApp("icon/iconetrack.png");
      if (fetched) {
        zip.file("icon/iconetrack.png", fetched);
        planConfig.icons.default = "icon/iconetrack.png";
        if (!_hasTrackIcon) planConfig.icons.track = "icon/iconetrack.png";
      }
    }

    // Calque "imported" : points, routes, zones, structures (sous-type d'origine via styleUrl).
    const imported = opts.imported || {};
    const hasContent = (imported.points     && imported.points.length)     ||
                       (imported.roads      && imported.roads.length)      ||
                       (imported.zones      && imported.zones.length)      ||
                       (imported.structures && imported.structures.length);
    if (hasContent) {
      planConfig.dataLayers.push({
        id: "imported",
        // ⚠️ Libellé écrit comme donnée (FilterPanel) : figé à la langue d'import.
        label: window.I18n.t("kmz.import.layerLabel"),
        // 🩸 `data/` obligatoire : getRuntimeAssetUrl("imported.json") échoue (asset enregistré sous
        // data/imported.json) → 404 → routes jamais chargées, Pathfinder sans réseau, alors que les POI
        // s'affichent (fetch tolérant). Aligné sur createConf.js > _genererZip.
        file: "data/imported.json",
        visible: true
      });

      const payload = {
        data:       imported.points     || [],
        roads:      imported.roads      || [],
        zones:      imported.zones      || [],
        structures: imported.structures || []
      };
      // Un plan fabriqué ici porte un uid sur chaque objet (docs/ETUDE_UID.md).
      if (window.KtaUid) { const _vus = new Set(); ["data", "roads", "zones", "structures"].forEach(function (k) { window.KtaUid.ensureAll(payload[k], k === "data" ? "pt" : k === "roads" ? "rd" : k === "zones" ? "zn" : "st", undefined, _vus); }); }
      zip.file("data/imported.json", JSON.stringify(payload, null, 2));
    }

    zip.file("plan-config.json", JSON.stringify(planConfig, null, 2));

    return await zip.generateAsync({ type: "blob" });
  }

  // ── Dimensions d'une image (Blob) sans la décoder à fond ──────────
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

  // ── API publique ──────────
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
