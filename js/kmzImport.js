/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.is-underground.fr
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
      throw new Error("JSZip non chargé — impossible d'extraire le KMZ");
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
        throw new Error("Aucun fichier .kml trouvé dans le KMZ");
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
      throw new Error("KML invalide : " + (err.textContent || "XML parse error"));
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
      throw new Error("buildTransform : 4 coins (sw/se/ne/nw) requis");
    }
    if (!isFinite(imageW) || !isFinite(imageH) || imageW <= 0 || imageH <= 0) {
      throw new Error("buildTransform : dimensions image invalides (" + imageW + "x" + imageH + ")");
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
      throw new Error("Coins NW et NE quasi-identiques (largeur < 0.1 m) — KMZ non géolocalisé valablement");
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
      const desc = (pm.getElementsByTagName("description")[0]?.textContent || "").trim();
      const pmId = pm.getAttribute("id") || ("pm_" + i);

      // Helper pour parser une string "lng,lat[,alt] lng,lat[,alt] ..."
      const _parseCoords = function(text) {
        return text.trim().split(/\s+/).map(function(c) {
          const arr = c.split(",").map(parseFloat);
          return { lng: arr[0], lat: arr[1] };
        }).filter(function(p) { return isFinite(p.lat) && isFinite(p.lng); });
      };

      // Point — chercher en descendant DIRECT pour éviter les sous-MultiGeometry
      const pointCoords = pm.querySelector(":scope > Point > coordinates");
      if (pointCoords) {
        const pts = _parseCoords(pointCoords.textContent);
        if (pts.length >= 1) {
          const px = gpsToPixel(transform, pts[0].lat, pts[0].lng);
          if (_inBounds(px)) {
            out.points.push({
              id: pmId, nom: nom, description: desc || undefined,
              x: Math.round(px.x), y: Math.round(px.y),
              tags: [defaults.pointTag]
            });
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
          out.roads.push({
            id: pmId, nom: nom || undefined,
            type: defaults.roadType, points: projected
          });
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
          // 🆕 v1.9.3-A1.b.1 : détection structure vs zone via styleUrl.
          // Notre KMZ export utilise "#structure_<type>" pour les piliers
          // et murs. Sinon (= KMZ d'une autre app, ou KMZ MyKTAMap legacy
          // sans structures), comportement existant : import comme zone.
          const styleUrlEl = pm.querySelector(":scope > styleUrl");
          const styleUrl = styleUrlEl ? (styleUrlEl.textContent || "").trim() : "";
          const structMatch = styleUrl.match(/^#structure_(pilier-1|pilier-2|mur)$/);
          if (structMatch) {
            // C'est une structure (pilier 1ère masse / 2e masse / mur).
            // On préserve le sous-type extrait du styleUrl pour respecter
            // ce que le KMZ exportait à l'origine.
            out.structures.push({
              id: pmId, nom: nom || undefined,
              type: structMatch[1], points: projected
            });
          } else {
            // Comportement legacy : zone avec le type par défaut.
            out.zones.push({
              id: pmId, nom: nom || undefined,
              type: defaults.zoneType, points: projected
            });
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
      throw new Error("JSZip non chargé — impossible de générer le ZIP MyKTAMap");
    }
    if (!opts || !opts.baseImage || !opts.imageW || !opts.imageH) {
      throw new Error("genererZipMyktamap : opts.baseImage + imageW + imageH requis");
    }

    const zip = new JSZip();

    // Image baseImage (préservée verbatim — choix 6=A validé KARMA)
    const baseFilename = opts.baseImageFilename || "baseImage.png";
    zip.file("data/" + baseFilename, opts.baseImage);

    // plan-config.json minimal valide.
    // v173 fix : champ `icons` ajouté pour éviter le crash TypeError au boot
    // (creerIcones lit iconConfig.track/default). Sans ces 2 valeurs au minimum,
    // map.js > initMapFromConfig throw → écran noir au chargement du plan.
    const planConfig = {
      plan: {
        name: opts.planName || "Plan importé KMZ",
        version: opts.planVersion || "v1",
        author: opts.planAuthor || "Import KMZ",
        imageWidth: opts.imageW,
        imageHeight: opts.imageH,
        baseImage: baseFilename
      },
      icons: {
        default: "icon/iconetrack.png",
        track:   "icon/iconetrack.png"
      },
      imageLayers: [],
      dataLayers: []
    };

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
        label: "Annotations importées (KMZ)",
        file: "imported.json",
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
        if (!W || !H) reject(new Error("Image GroundOverlay sans dimensions"));
        else resolve({ width: W, height: H });
      };
      img.onerror = function() {
        URL.revokeObjectURL(url);
        reject(new Error("Impossible de décoder l'image GroundOverlay"));
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
