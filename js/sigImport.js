/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =====================================================================
// SIG IMPORT — « Convertir depuis SIG » (depuis v1.74.0)
// =====================================================================
// Ingère un export SIG (QGIS & co) et produit un ZIP MyKTAMap utilisable
// directement — même finalité que gpxImport.js, autres formats d'entrée.
//
// POURQUOI CE MODULE EXISTE ALORS QUE LES 2 MOITIÉS ÉTAIENT DÉJÀ LÀ :
//   - `kmzImport.js` savait déjà lire des Placemark KML (Point/LineString/
//     Polygon) MAIS exigeait un <GroundOverlay> (une image géoréférencée)
//     et refusait sinon. Or un export QGIS VECTORIEL n'en a jamais.
//   - `gpxImport.js` savait déjà générer un canvas vierge auto-calibré sur
//     les bounds GPS MAIS ne parsait que du GPX.
//   Ce module fait le raccordement : parsers SIG + canvas vierge.
//
// FORMATS (lot 1) :
//   - GeoJSON (.geojson / .json)  → JSON.parse natif, ZÉRO dépendance
//   - KML (.kml) et KMZ vectoriel (.kmz) → DOMParser natif + JSZip (vendored)
//   Hors périmètre : Shapefile (lib binaire à vendorer), GeoPackage (SQLite
//   → sql.js ≈ 1 Mo WASM, incompatible avec la promesse offline légère).
//
// ⚠️ CRS — LE PIÈGE PRINCIPAL :
//   QGIS exporte volontiers dans le CRS de la couche. En France c'est très
//   souvent du Lambert 93 (EPSG:2154) : des MÈTRES (650000, 6860000), pas des
//   degrés.
//   → 📐 v1.82.0 : le Lambert 93 est désormais RECONNU ET CONVERTI, sans
//     `proj4` (~30 Ko pour des milliers de CRS quand on en veut UN, dans un
//     projet offline-first sans bundler). La conique conforme de Lambert
//     tient en ~50 lignes plus bas, et se vérifie EXACTEMENT : par
//     construction, l'origine (3°E, 46,5°N) tombe sur (700000, 6600000).
//     La conversion est ANNONCÉE avec le nombre de coordonnées reprojetées —
//     on ne refuse plus, mais on ne corrige pas en douce non plus.
//   → TOUTE AUTRE projection (UTM, Web Mercator…) reste REFUSÉE FRANCHEMENT,
//     avec un message actionnable, plutôt que de laisser l'utilisateur
//     atterrir au milieu de l'Atlantique sans comprendre.
//     (Règle KARMA : valider et refuser, jamais clamper en silence.)
//
// PIPELINE :
//   1. detecterFormat(file)                → "geojson" | "kml" | "kmz"
//   2. parseFichier(file)                  → structure NORMALISÉE (GPS brut)
//   3. validerCrs(normalise)               → {ok, code, detail}  ← refus ici
//   4. calculerBounds(normalise)           → {latMin, latMax, lngMin, lngMax}
//   5. analyserAttributs(normalise)        → colonnes candidates + valeurs
//      (l'UI en fait un écran de correspondance « valeur SIG → tag MyKTAMap »)
//   6. genererZipMyktamap({...})           → Blob ZIP
//
// 🏷️ LA LÉGENDE ÉDITÉE DANS L'ÉCRAN SIG VOYAGE EN ENTIER (v1.83.1). Le bouton
// « Nommer et colorer les niveaux » ouvre l'éditeur de LegendCustomization sur
// les entrées de cet import ; son état complet revient dans
// `opts.mapping.planLegend` et `assemblerLegendePlan` le pose dans
// `plan.customLegend`. Avant, seules les entrées `cust-sig-…` par niveau
// survivaient : libellés des types built-in, masquages, couleurs et entrées
// ajoutées à la main étaient jetés en silence à la génération.
//
// STRUCTURE NORMALISÉE (pivot commun aux 2 parsers) :
//   { points:    [{ lat, lng, nom, props }],
//     lignes:    [{ coords: [{lat,lng}], nom, props }],
//     polygones: [{ coords: [{lat,lng}], nom, props }],
//     avertissements: [string] }
//
// API : window.SigImport = {
//   detecterFormat, parseGeoJson, parseKml, parseFichier,
//   validerCrs, calculerBounds, analyserAttributs,
//   proposerMapping, ingest, genererZipMyktamap, FORMATS_ACCEPTES
// };
// 100 % local, aucune surface réseau nouvelle.
// =====================================================================

(function() {
  "use strict";

  const FORMATS_ACCEPTES = ".geojson,.json,.kml,.kmz";

  // Bornes WGS84. Une coordonnée hors de là n'est PAS du lat/lng — c'est
  // presque toujours un CRS projeté (Lambert 93, UTM, Web Mercator…).
  const LAT_MAX = 90;
  const LNG_MAX = 180;

  // 🎚️ v1.82.0 — DEUX SEUILS, plus un refus sec à 20 000.
  //
  // Le seuil unique venait d'une crainte raisonnable — « un fichier SIG de
  // cette taille ferait fondre le navigateur au rendu Leaflet » — mais il n'a
  // jamais été confronté à un relevé réel. Il l'a été le 03/09, sur une
  // carrière réelle dont le relevé structuré ET le topo historique font
  // ensemble 20 664 objets : refusés pour 3 % de dépassement, alors que
  // l'import les encaisse sans peine (mesuré : parse 217 ms, génération du ZIP
  // 1,6 s, 137 Mo de heap).
  //
  // Refuser à 3 % près sur un chiffre jamais vérifié, c'est arbitraire. Mais
  // le supprimer serait pire : un atlas départemental entier (245 000 objets)
  // doit toujours être arrêté net.
  //
  // ⚠️ CE QUI N'EST PAS MESURÉ : le RENDU Leaflet du plan une fois importé.
  // C'était la crainte d'origine, et elle reste entière — l'import qui tient
  // ne dit rien de la carte qui suit. D'où l'avertissement : on prévient
  // l'utilisateur au lieu de décider à sa place.
  const MAX_FEATURES  = 60000;   // refus dur : au-delà, c'est un atlas, pas un plan
  const WARN_FEATURES = 20000;   // au-delà : on accepte, mais on prévient

  // 🎚️ SEUILS D'ALERTE DE SURFACE DU CANVAS — on PRÉVIENT, on ne BLOQUE PAS.
  // (arbitrage KARMA du 03/09 : « trop restrictif, on prévient, on conseille,
  // mais on bloque pas »)
  //
  // La première version plafonnait à 16 Mpx et rognait les dimensions en
  // silence : quelle que soit la largeur demandée on obtenait la même, ce qui
  // rendait le champ inopérant sans rien expliquer. Décider à la place de
  // l'utilisateur sur un risque qu'on n'a pas mesuré soi-même, c'est trop.
  //
  // Ce que les seuils signalent, et d'où ils viennent :
  //   • 16 Mpx — ordre de grandeur du plafond de canvas d'iOS Safari
  //     (~16,7 Mpx). Au-delà, un iPhone rend une image VIDE. [Probable :
  //     estimation non testée ici, mais le calcul de surface est certain.]
  //   • 60 Mpx — territoire où le pipeline tient DEUX bitmaps simultanés (le
  //     canvas et l'image re-décodée pour le tuilage), soit ~480 Mo de RGBA.
  //     C'est là que la génération de KARMA n'aboutissait jamais.
  const ALERTE_CANVAS_MPX_IOS = 16;
  const ALERTE_CANVAS_MPX_RAM = 60;

  // =========================================================================
  // DÉTECTION DE FORMAT
  // =========================================================================
  function detecterFormat(file) {
    if (!file || !file.name) return null;
    const n = String(file.name).toLowerCase();
    if (n.endsWith(".geojson")) return "geojson";
    if (n.endsWith(".kml"))     return "kml";
    if (n.endsWith(".kmz"))     return "kmz";
    // .json est ambigu (config, session, geojson…) — on tranchera au contenu.
    if (n.endsWith(".json"))    return "geojson";
    return null;
  }

  // =========================================================================
  // PARSER GEOJSON
  // =========================================================================
  // Couvre FeatureCollection / Feature / GeometryCollection / geometry nue,
  // et les 6 types de géométrie utiles. Les Multi* sont ÉCLATÉS en éléments
  // simples (MyKTAMap n'a pas de notion de multi-géométrie).
  function parseGeoJson(texte) {
    let obj;
    try { obj = (typeof texte === "string") ? JSON.parse(texte) : texte; }
    catch(e) { throw new Error("sig.err.jsonInvalide"); }
    if (!obj || typeof obj !== "object") throw new Error("sig.err.jsonInvalide");

    const out = { points: [], lignes: [], polygones: [], avertissements: [] };

    // ⚠️ Membre `crs` (GeoJSON 2008, retiré du RFC 7946 mais QGIS l'écrit
    // encore). S'il annonce autre chose que CRS84/4326, c'est un refus net.
    if (obj.crs && obj.crs.properties && obj.crs.properties.name) {
      const nom = String(obj.crs.properties.name).toUpperCase();
      // 📐 v1.82.0 — un `crs` annonçant Lambert 93 n'est plus un refus :
      // les coordonnées seront reconnues et la conversion proposée. On
      // laisse simplement passer, `validerCrs` tranchera sur les CHIFFRES
      // (plus fiables qu'une étiquette : QGIS écrit parfois un `crs` qui ne
      // correspond pas au contenu réel du fichier).
      if (/2154|LAMBERT.?93|RGF.?93/.test(nom)) { /* on n'interrompt pas */ } else
      if (!/CRS84|4326/.test(nom)) {
        const e = new Error("sig.err.crsDeclare");
        e.crsNom = obj.crs.properties.name;
        throw e;
      }
    }

    function _pousserGeom(geom, props, nom) {
      if (!geom || !geom.type) return;
      const c = geom.coordinates;
      switch (geom.type) {
        case "Point":
          if (_coordValide(c)) out.points.push({ lat: c[1], lng: c[0], nom: nom, props: props });
          break;
        case "MultiPoint":
          (c || []).forEach(function(p) {
            if (_coordValide(p)) out.points.push({ lat: p[1], lng: p[0], nom: nom, props: props });
          });
          break;
        case "LineString":
          { const co = _versCoords(c); if (co.length >= 2) out.lignes.push({ coords: co, nom: nom, props: props }); }
          break;
        case "MultiLineString":
          (c || []).forEach(function(l) {
            const co = _versCoords(l);
            if (co.length >= 2) out.lignes.push({ coords: co, nom: nom, props: props });
          });
          break;
        case "Polygon":
          // Anneau extérieur seulement — les trous (inner rings) sont ignorés,
          // MyKTAMap n'a pas de zone à trous. Signalé à l'utilisateur.
          { const co = _versCoords((c || [])[0]);
            if (co.length >= 3) out.polygones.push({ coords: co, nom: nom, props: props });
            if ((c || []).length > 1) out.avertissements.push("sig.warn.trous"); }
          break;
        case "MultiPolygon":
          (c || []).forEach(function(poly) {
            const co = _versCoords((poly || [])[0]);
            if (co.length >= 3) out.polygones.push({ coords: co, nom: nom, props: props });
            if ((poly || []).length > 1) out.avertissements.push("sig.warn.trous");
          });
          break;
        case "GeometryCollection":
          (geom.geometries || []).forEach(function(g) { _pousserGeom(g, props, nom); });
          break;
        default:
          out.avertissements.push("sig.warn.geomInconnue");
      }
    }

    function _traiterFeature(f) {
      if (!f) return;
      const props = (f.properties && typeof f.properties === "object") ? f.properties : {};
      const nom = _nomDepuisProps(props);
      _pousserGeom(f.geometry, props, nom);
    }

    if (obj.type === "FeatureCollection") {
      const feats = Array.isArray(obj.features) ? obj.features : [];
      if (feats.length > MAX_FEATURES) { const e = new Error("sig.err.tropDeFeatures"); e.n = feats.length; throw e; }
      feats.forEach(_traiterFeature);
    } else if (obj.type === "Feature") {
      _traiterFeature(obj);
    } else if (obj.type) {
      _pousserGeom(obj, {}, null);
    } else {
      throw new Error("sig.err.pasDuGeojson");
    }

    out.avertissements = Array.from(new Set(out.avertissements));
    return out;
  }

  function _coordValide(c) {
    return Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]);
  }

  function _versCoords(arr) {
    const out = [];
    (arr || []).forEach(function(c) {
      if (_coordValide(c)) out.push({ lat: c[1], lng: c[0] });
    });
    return out;
  }

  // Nom lisible : on pioche dans les clés usuelles des exports SIG, sinon null.
  const CLES_NOM = ["name", "nom", "label", "libelle", "libellé", "title", "titre", "id", "ref"];
  function _nomDepuisProps(props) {
    for (let i = 0; i < CLES_NOM.length; i++) {
      const k = _trouverCle(props, CLES_NOM[i]);
      if (k && props[k] != null && String(props[k]).trim() !== "") return String(props[k]).trim();
    }
    return null;
  }

  // Recherche de clé insensible à la casse et aux accents (les schémas SIG
  // français mélangent « Libellé », « LIBELLE », « libelle »…).
  function _trouverCle(obj, cible) {
    if (!obj) return null;
    const c = _norm(cible);
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      if (_norm(keys[i]) === c) return keys[i];
    }
    return null;
  }

  function _norm(s) {
    return String(s == null ? "" : s)
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().trim();
  }

  // =========================================================================
  // PARSER KML
  // =========================================================================
  // Les <coordinates> KML sont au format « lng,lat[,alt] » séparés par des
  // espaces ou des retours ligne. MÊME ORDRE que GeoJSON (lng d'abord) — le
  // piège classique est de croire l'inverse.
  function parseKml(xmlString) {
    if (typeof DOMParser === "undefined") throw new Error("sig.err.domparser");
    const doc = new DOMParser().parseFromString(xmlString, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("sig.err.kmlInvalide");

    const out = { points: [], lignes: [], polygones: [], avertissements: [] };
    const pms = doc.getElementsByTagName("Placemark");
    if (pms.length > MAX_FEATURES) { const e = new Error("sig.err.tropDeFeatures"); e.n = pms.length; throw e; }

    for (let i = 0; i < pms.length; i++) {
      const pm = pms[i];
      const nomEl = pm.getElementsByTagName("name")[0];
      const nom = nomEl ? String(nomEl.textContent || "").trim() : null;
      const props = _propsDepuisExtendedData(pm);

      // Point(s)
      const pts = pm.getElementsByTagName("Point");
      for (let j = 0; j < pts.length; j++) {
        const co = _coordsKml(pts[j]);
        if (co.length >= 1) out.points.push({ lat: co[0].lat, lng: co[0].lng, nom: nom, props: props });
      }
      // LineString(s)
      const ls = pm.getElementsByTagName("LineString");
      for (let j = 0; j < ls.length; j++) {
        const co = _coordsKml(ls[j]);
        if (co.length >= 2) out.lignes.push({ coords: co, nom: nom, props: props });
      }
      // Polygon(s) — anneau extérieur seulement
      const pg = pm.getElementsByTagName("Polygon");
      for (let j = 0; j < pg.length; j++) {
        const outer = pg[j].getElementsByTagName("outerBoundaryIs")[0];
        const cible = outer || pg[j];
        const co = _coordsKml(cible);
        if (co.length >= 3) out.polygones.push({ coords: co, nom: nom, props: props });
        if (pg[j].getElementsByTagName("innerBoundaryIs").length > 0) {
          out.avertissements.push("sig.warn.trous");
        }
      }
    }
    out.avertissements = Array.from(new Set(out.avertissements));
    return out;
  }

  function _coordsKml(el) {
    const c = el.getElementsByTagName("coordinates")[0];
    if (!c) return [];
    const txt = String(c.textContent || "").trim();
    if (!txt) return [];
    const out = [];
    txt.split(/\s+/).forEach(function(tuple) {
      const p = tuple.split(",");
      const lng = parseFloat(p[0]), lat = parseFloat(p[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat: lat, lng: lng });
    });
    return out;
  }

  // <ExtendedData><Data name="X"><value>Y</value></Data></ExtendedData>
  // et <SimpleData name="X">Y</SimpleData> (schéma OGR/QGIS).
  function _propsDepuisExtendedData(pm) {
    const props = {};
    const datas = pm.getElementsByTagName("Data");
    for (let i = 0; i < datas.length; i++) {
      const k = datas[i].getAttribute("name");
      const v = datas[i].getElementsByTagName("value")[0];
      if (k) props[k] = v ? String(v.textContent || "").trim() : "";
    }
    const simples = pm.getElementsByTagName("SimpleData");
    for (let i = 0; i < simples.length; i++) {
      const k = simples[i].getAttribute("name");
      if (k) props[k] = String(simples[i].textContent || "").trim();
    }
    return props;
  }

  // =========================================================================
  // LECTURE FICHIER (dispatch)
  // =========================================================================
  async function parseFichier(file) {
    const fmt = detecterFormat(file);
    if (!fmt) throw new Error("sig.err.formatInconnu");

    if (fmt === "kmz") {
      if (typeof JSZip === "undefined") throw new Error("sig.err.jszip");
      const zip = await JSZip.loadAsync(file);
      // doc.kml en priorité, sinon le premier .kml rencontré.
      let entry = zip.file("doc.kml");
      if (!entry) {
        const kmls = zip.file(/\.kml$/i);
        entry = (kmls && kmls.length) ? kmls[0] : null;
      }
      if (!entry) throw new Error("sig.err.kmzSansKml");
      return { format: "kmz", data: parseKml(await entry.async("string")) };
    }

    const txt = await file.text();
    if (fmt === "kml") return { format: "kml", data: parseKml(txt) };
    return { format: "geojson", data: parseGeoJson(txt) };
  }

  // =========================================================================
  // LAMBERT 93 (EPSG:2154) ⇄ WGS84 — v1.82.0
  // =========================================================================
  // POURQUOI CE CODE EXISTE : QGIS, en France, exporte massivement en Lambert
  // 93 — des MÈTRES (650000, 6860000), pas des degrés. Jusqu'ici l'import les
  // refusait proprement en comptant les coordonnées fautives. Le refus était
  // juste, mais il laissait l'utilisateur devant un mur : reprojeter dans QGIS
  // ou renoncer.
  //
  // POURQUOI PAS proj4 : ~30 Ko pour couvrir des milliers de CRS quand on en
  // veut UN, dans un projet offline-first, sans bundler, dont `lib/` est
  // volontairement minimal (leaflet, jszip, jspdf, html2canvas, rotated).
  // La projection conique conforme de Lambert tient en ~50 lignes et se
  // vérifie EXACTEMENT — voir plus bas.
  //
  // 🎯 CE QUI REND CE CODE TESTABLE SANS SOURCE EXTERNE : par construction de
  // la projection, le point d'origine (3°E, 46,5°N) tombe EXACTEMENT sur
  // (700000, 6600000). Aucune table de référence à recopier, aucune valeur
  // mémorisée à croire : l'égalité se déduit des paramètres eux-mêmes.
  // `scripts/check-lambert93.js` en fait son premier contrôle, puis vérifie
  // l'aller-retour sur une grille couvrant la France.
  //
  // Paramètres officiels EPSG:2154 (IGN / EPSG registry) :
  //   ellipsoïde GRS80 · lat_0 46.5 · lon_0 3 · lat_1 44 · lat_2 49
  //   x_0 700000 · y_0 6600000
  const L93 = (function () {
    const a  = 6378137.0;                 // demi-grand axe GRS80
    const f  = 1 / 298.257222101;         // aplatissement GRS80
    const e  = Math.sqrt(2 * f - f * f);  // première excentricité
    const D  = Math.PI / 180;
    const lat0 = 46.5 * D, lon0 = 3 * D, lat1 = 44 * D, lat2 = 49 * D;
    const x0 = 700000, y0 = 6600000;

    // m(φ) et t(φ) de Snyder — les deux briques de toute conique conforme.
    function m(p) { const s = Math.sin(p); return Math.cos(p) / Math.sqrt(1 - e * e * s * s); }
    function t(p) {
      const s = Math.sin(p);
      return Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - e * s) / (1 + e * s), e / 2);
    }

    const m1 = m(lat1), m2 = m(lat2);
    const t0 = t(lat0), t1 = t(lat1), t2 = t(lat2);
    const n  = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
    const F  = m1 / (n * Math.pow(t1, n));
    const r0 = a * F * Math.pow(t0, n);

    // WGS84 → Lambert 93. Sert au contrôle d'aller-retour du garde-fou ; c'est
    // lui qui prouve que l'inverse n'est pas juste « cohérent avec lui-même ».
    function versL93(lat, lng) {
      const p = lat * D, l = lng * D;
      const r = a * F * Math.pow(t(p), n);
      const th = n * (l - lon0);
      return { x: x0 + r * Math.sin(th), y: y0 + r0 - r * Math.cos(th) };
    }

    // Lambert 93 → WGS84. C'est celle dont l'import a besoin.
    function versWgs84(x, y) {
      const dx = x - x0, dy = r0 - (y - y0);
      const r  = Math.sign(n) * Math.sqrt(dx * dx + dy * dy);
      const th = Math.atan2(dx, dy);
      const tt = Math.pow(r / (a * F), 1 / n);
      let p = Math.PI / 2 - 2 * Math.atan(tt);
      // Convergence de la latitude isométrique. 8 tours suffisent très
      // largement (le résidu passe sous le micromètre dès le 5e) ; la sortie
      // anticipée évite de tourner pour rien.
      for (let k = 0; k < 8; k++) {
        const s = Math.sin(p);
        const pn = Math.PI / 2 - 2 * Math.atan(tt * Math.pow((1 - e * s) / (1 + e * s), e / 2));
        if (Math.abs(pn - p) < 1e-12) { p = pn; break; }
        p = pn;
      }
      return { lat: p / D, lng: (th / n + lon0) / D };
    }

    return { versL93: versL93, versWgs84: versWgs84 };
  })();

  // =========================================================================
  // WEB MERCATOR (EPSG:3857) ⇄ WGS84
  // =========================================================================
  // Ajouté pour les GeoTIFF calés en 3857 (`js/tiffGeoref.js`) : sur un corpus
  // réel de 39 plans calés sous QGIS, 7 sortent dans ce CRS — QGIS l'impose dès
  // que le calage se fait sur un fond de tuiles web.
  //
  // C'est la projection la plus simple qui soit : Mercator SPHÉRIQUE, sur une
  // sphère de rayon 6 378 137 m (le demi-grand axe de WGS84 utilisé comme si la
  // Terre était ronde — c'est la définition même d'EPSG:3857, pas une
  // approximation qu'on se permettrait ici). Ni excentricité, ni convergence.
  //
  // 🎯 TESTABLE SANS TABLE DE RÉFÉRENCE, comme le Lambert 93 : l'équateur tombe
  // exactement sur y = 0, le méridien de Greenwich sur x = 0, un tour complet
  // de longitude fait exactement 2πR, et la projection est conforme (échelle
  // identique dans toutes les directions). `scripts/check-webmercator.js`
  // vérifie ces propriétés — l'aller-retour seul ne prouverait rien.
  const WEBMERC = (function () {
    const R = 6378137.0;            // rayon de la sphère EPSG:3857
    const D = Math.PI / 180;

    function versMerc(lat, lng) {
      // ⚠️ Le pôle projette à l'infini : la borne officielle du 3857 est
      // ±85,051129°, au-delà de quoi la valeur n'a pas de sens cartographique.
      const p = Math.max(-85.051129, Math.min(85.051129, lat)) * D;
      // ⚠️ ln(tan(π/4 + φ/2)) est l'écriture de manuel, mais elle est FAUSSE
      // EN VIRGULE FLOTTANTE à l'équateur : Math.tan(Math.PI/4) vaut
      // 0,9999999999999999, donc y(0°) sortait à −7,1e-10 m au lieu de 0.
      // L'identité atanh(sin φ) donne le même résultat et tombe sur 0 EXACT
      // (ln(1/1)), ce que le garde-fou vérifie.
      const s = Math.sin(p);
      return { x: R * lng * D, y: R * 0.5 * Math.log((1 + s) / (1 - s)) };
    }

    function versWgs84(x, y) {
      return {
        lat: (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / D,
        lng: (x / R) / D
      };
    }

    return { versMerc: versMerc, versWgs84: versWgs84, R: R };
  })();

  // Enveloppe Lambert 93 du territoire métropolitain, LARGE à dessein : elle
  // sert à RECONNAÎTRE du L93, pas à valider une position. Un fichier qui y
  // tombe entièrement est du Lambert 93 avec une quasi-certitude — aucun autre
  // CRS courant ne produit ces ordres de grandeur (UTM 31N : Y ≈ 5 400 000 ;
  // Web Mercator : X jusqu'à 20 000 000).
  const L93_BBOX = { xMin: 0, xMax: 1300000, yMin: 6000000, yMax: 7200000 };

  function _dansEnveloppeL93(c) {
    // ⚠️ Dans un GeoJSON projeté, `lng` porte l'ABSCISSE (X) et `lat`
    // l'ORDONNÉE (Y) : le parser range coordinates[0] dans lng et [1] dans
    // lat sans rien interpréter. Les inverser ici enverrait tout le fichier
    // au milieu de l'Atlantique.
    return c.lng >= L93_BBOX.xMin && c.lng <= L93_BBOX.xMax &&
           c.lat >= L93_BBOX.yMin && c.lat <= L93_BBOX.yMax;
  }

  // Le fichier est-il du Lambert 93 reconnaissable ? On exige que TOUTES les
  // coordonnées soient dans l'enveloppe : un fichier mixte (des degrés ET des
  // mètres) est un fichier cassé, et le reprojeter à moitié produirait une
  // carte muette où l'erreur ne se voit pas.
  function detecterLambert93(normalise) {
    const tous = _toutesLesCoords(normalise);
    if (!tous.length) return false;
    for (let i = 0; i < tous.length; i++) {
      if (!_dansEnveloppeL93(tous[i])) return false;
    }
    return true;
  }

  // Reprojette EN PLACE une structure normalisée. Retourne le nombre de
  // coordonnées converties, pour que l'appelant puisse le DIRE à
  // l'utilisateur — la règle de ce module reste « jamais de correction
  // silencieuse » : on ne refuse plus, mais on annonce.
  function reprojeterLambert93(normalise) {
    let n = 0;
    const conv = function (c) {
      const g = L93.versWgs84(c.lng, c.lat);   // lng = X, lat = Y (cf. ci-dessus)
      c.lat = g.lat; c.lng = g.lng; n++;
    };
    (normalise.points || []).forEach(conv);
    (normalise.lignes || []).forEach(function (l) { (l.coords || []).forEach(conv); });
    (normalise.polygones || []).forEach(function (z) { (z.coords || []).forEach(conv); });
    return n;
  }

  // =========================================================================
  // VALIDATION CRS — refus franc, jamais de correction silencieuse
  // =========================================================================
  function validerCrs(normalise) {
    const tous = _toutesLesCoords(normalise);
    if (tous.length === 0) return { ok: false, code: "vide" };

    let horsBornes = 0, maxAbsLat = 0, maxAbsLng = 0;
    for (let i = 0; i < tous.length; i++) {
      const la = Math.abs(tous[i].lat), ln = Math.abs(tous[i].lng);
      if (la > maxAbsLat) maxAbsLat = la;
      if (ln > maxAbsLng) maxAbsLng = ln;
      if (la > LAT_MAX || ln > LNG_MAX) horsBornes++;
    }
    if (horsBornes > 0) {
      // 📐 v1.82.0 — avant de refuser, on regarde si c'est du Lambert 93.
      // Si oui, ce n'est plus une erreur mais une CONVERSION À PROPOSER :
      // l'appelant décide, l'utilisateur est prévenu. La règle du module
      // (« jamais de correction silencieuse ») tient toujours — on ne
      // reprojette pas ici, on dit seulement que c'est possible.
      if (detecterLambert93(normalise)) {
        return { ok: false, code: "lambert93", convertible: true,
                 total: tous.length, horsBornes: horsBornes };
      }
    }
    if (horsBornes > 0) {
      return {
        ok: false,
        code: "crsProjete",
        horsBornes: horsBornes,
        total: tous.length,
        maxAbsLat: maxAbsLat,
        maxAbsLng: maxAbsLng
      };
    }
    // Tout est dans les bornes : c'est du WGS84 plausible. On ne peut pas
    // prouver que ce n'est pas un autre CRS géographique exotique, mais le
    // cas est marginal et indétectable sans métadonnée.
    return { ok: true, code: "wgs84", total: tous.length };
  }

  function _toutesLesCoords(n) {
    const out = [];
    (n.points || []).forEach(function(p) { out.push({ lat: p.lat, lng: p.lng }); });
    (n.lignes || []).forEach(function(l) { (l.coords || []).forEach(function(c) { out.push(c); }); });
    (n.polygones || []).forEach(function(z) { (z.coords || []).forEach(function(c) { out.push(c); }); });
    return out;
  }

  // =========================================================================
  // BOUNDS
  // =========================================================================
  function calculerBounds(normalise) {
    const tous = _toutesLesCoords(normalise);
    if (tous.length === 0) return null;
    let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
    tous.forEach(function(c) {
      if (c.lat < latMin) latMin = c.lat;
      if (c.lat > latMax) latMax = c.lat;
      if (c.lng < lngMin) lngMin = c.lng;
      if (c.lng > lngMax) lngMax = c.lng;
    });
    // Étendue nulle (un seul point, ou tous confondus) → le calibrage 2 points
    // serait dégénéré (division par zéro dans buildTransform). On ouvre une
    // fenêtre minimale de ~110 m pour rester calculable.
    const EPS = 0.001;
    if (latMax - latMin < EPS) { latMin -= EPS / 2; latMax += EPS / 2; }
    if (lngMax - lngMin < EPS) { lngMin -= EPS / 2; lngMax += EPS / 2; }
    return { latMin: latMin, latMax: latMax, lngMin: lngMin, lngMax: lngMax, count: tous.length };
  }

  // =========================================================================
  // ANALYSE DES ATTRIBUTS → matière première de l'écran de correspondance
  // =========================================================================
  // On ne devine PAS la sémantique métier : on classe les colonnes par
  // « capacité à discriminer un type » et on rend leurs valeurs distinctes.
  // L'UI construit la correspondance « valeur SIG → tag/type MyKTAMap » et
  // l'utilisateur tranche. Une heuristique qui déciderait seule se tromperait
  // en silence sur des schémas qu'on ne connaît pas.
  const CLES_TYPE_PROBABLES = ["type", "nature", "categorie", "category", "classe", "class", "genre", "kind", "sym", "symbole"];
  const MAX_VALEURS_DISTINCTES = 40;

  function analyserAttributs(normalise) {
    const compteur = {};   // cle → Map(valeur → n)
    function _ingerer(props) {
      if (!props) return;
      Object.keys(props).forEach(function(k) {
        const v = props[k];
        if (v == null || String(v).trim() === "") return;
        if (!compteur[k]) compteur[k] = new Map();
        const s = String(v).trim();
        compteur[k].set(s, (compteur[k].get(s) || 0) + 1);
      });
    }
    (normalise.points || []).forEach(function(p) { _ingerer(p.props); });
    (normalise.lignes || []).forEach(function(l) { _ingerer(l.props); });
    (normalise.polygones || []).forEach(function(z) { _ingerer(z.props); });

    const colonnes = Object.keys(compteur).map(function(k) {
      const distinctes = Array.from(compteur[k].keys());
      const probable = CLES_TYPE_PROBABLES.indexOf(_norm(k)) >= 0;
      return {
        cle: k,
        nbDistinctes: distinctes.length,
        valeurs: distinctes.slice(0, MAX_VALEURS_DISTINCTES),
        tronque: distinctes.length > MAX_VALEURS_DISTINCTES,
        probableType: probable
      };
    });

    // Tri : les colonnes au nom évocateur d'abord, puis celles dont la
    // cardinalité ressemble à une nomenclature (2 à 20 valeurs distinctes).
    colonnes.sort(function(a, b) {
      if (a.probableType !== b.probableType) return a.probableType ? -1 : 1;
      const sa = (a.nbDistinctes >= 2 && a.nbDistinctes <= 20) ? 0 : 1;
      const sb = (b.nbDistinctes >= 2 && b.nbDistinctes <= 20) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.nbDistinctes - b.nbDistinctes;
    });
    return colonnes;
  }

  // Pré-remplissage de l'écran de correspondance : on tente de rapprocher
  // chaque valeur SIG d'un tag/type MyKTAMap par normalisation du libellé.
  // Aucune valeur non reconnue n'est forcée — elle reste sur le défaut, et
  // l'utilisateur la corrige à l'écran.
  const SYNONYMES = {
    // valeur normalisée SIG → type MyKTAMap (tracés)
    traces: {
      principal: "principal", principale: "principal", majeur: "principal", "rue": "principal",
      secondaire: "secondaire", secondaires: "secondaire",
      chemin: "chemin", sentier: "chemin", passage: "chemin",
      jonction: "jonction", puits: "jonction", escalier: "jonction"
    },
    // 🏛️ v1.82.0 — structures. Les valeurs viennent de relevés réels : un
    // export SIG écrit « pilier », « PILIER_1 », « mur »… Le préfixe `struct:`
    // dit à `ingest` de ranger l'objet dans les structures et non les zones.
    structures: {
      // 🎯 v1.82.0 — DÉFAUTS CALÉS SUR LE TERRAIN (arbitrage KARMA, 03/09).
      // Dans un relevé SIG de carrière, ce qui est nommé « galerie » ou
      // « pilier » n'est pas un cheminement ni un volume : c'est le CONTOUR
      // relevé au décamètre, donc un FRONT DE TAILLE. KARMA les mappait déjà
      // ainsi à la main sur chaque import (« ce que j'ai mis moi pour que ça
      // fonctionne ») — autant que ce soit le défaut.
      // ⚠️ Conséquence assumée : un polygone « pilier » devient une polyligne,
      // donc un contour épais au lieu d'une surface pleine. C'est le rendu
      // voulu pour un relevé de carrière ; pour un vrai volume, `pilier-1`
      // reste à un clic dans le même select.
      galerie: "struct:front-1", galeries: "struct:front-1",
      galerie_tech: "struct:front-1", cheminement: "struct:front-1",
      front: "struct:front-1", fronts: "struct:front-1",
      frontdetaille: "struct:front-1", "frontdetaille1": "struct:front-1",
      // `pilier` bascule lui aussi : sa valeur historique (`struct:pilier-1`)
      // reste accessible d'un clic, mais elle n'était pas ce qu'on veut voir
      // par défaut sur un import SIG.
      pilier: "struct:front-1", piliers: "struct:front-1",
      // Formes EXPLICITES : quand le relevé dit « pilier-1 » ou « 1ère masse »,
      // l'intention est claire et on la respecte.
      pilier1: "struct:pilier-1",
      "pilier-1": "struct:pilier-1",
      "pilier1eremasse": "struct:pilier-1", "1eremasse": "struct:pilier-1",
      pilier2: "struct:pilier-2", "pilier-2": "struct:pilier-2",
      "pilier2emasse": "struct:pilier-2", "2emasse": "struct:pilier-2",
      mur: "struct:mur", murs: "struct:mur", muret: "struct:mur",
      maconnerie: "struct:mur", beton: "struct:mur",
      "front1": "struct:front-1", "front2": "struct:front-2"
    },
    zones: {
      eau: "eau", water: "eau", inondation: "eau", "zone humide": "eau",
      remblais: "remblais", remblai: "remblais", comblement: "remblais",
      effondrement: "effondrement", eboulement: "effondrement", fontis: "effondrement",
      inaccessible: "inaccessible", interdit: "inaccessible", danger: "inaccessible"
    }
  };

  // Valeurs distinctes d'une colonne, VENTILÉES PAR FAMILLE de géométrie.
  // Indispensable à l'écran de correspondance : une valeur « eau » trouvée sur
  // des polygones doit proposer des types de ZONE, pas des types de tracé.
  // Agréger les 3 familles comme le fait analyserAttributs() donnerait des
  // choix absurdes (proposer « principal » pour un polygone).
  function valeursParFamille(normalise, cle) {
    const out = { points: [], lignes: [], polygones: [] };
    if (!cle) return out;
    function _collecte(items, dest) {
      const vus = new Set();
      (items || []).forEach(function(it) {
        const k = _trouverCle(it.props, cle);
        if (!k) return;
        const v = it.props[k];
        if (v == null || String(v).trim() === "") return;
        vus.add(String(v).trim());
      });
      out[dest] = Array.from(vus).slice(0, MAX_VALEURS_DISTINCTES);
    }
    _collecte(normalise.points,    "points");
    _collecte(normalise.lignes,    "lignes");
    _collecte(normalise.polygones, "polygones");
    return out;
  }

  function proposerMapping(valeurs, categorie) {
    const table = SYNONYMES[categorie] || {};
    const out = {};
    (valeurs || []).forEach(function(v) {
      const n = _norm(v);
      out[v] = table[n] || null;   // null = « laisse le défaut », décidé par l'UI
    });
    return out;
  }

  // 🎨 v1.82.0 — UNE COULEUR PAR NIVEAU (retour KARMA : « je ne peux pas créer
  // de légende custom depuis Convertir SIG, du coup je peux pas créer des
  // couleurs pour les N niveaux et les N zones »).
  //
  // LE BESOIN RÉEL : sur un relevé multi-niveaux, tous les tracés sortaient de
  // la même couleur quel que soit leur niveau. Six niveaux superposés dans une
  // seule teinte, c'est illisible — et le multi-niveau perd l'essentiel de son
  // intérêt si on ne distingue pas les niveaux à l'œil.
  //
  // COMMENT : on fabrique une entrée de légende custom par (famille, niveau),
  // au format exact de `LegendCustomization` — { id, category, label,
  // lineColor, fillColor, borderColor } — et les objets portent son id
  // `cust-…` comme type. C'est le mécanisme que l'app utilise déjà pour les
  // types créés à la main : rien de nouveau à comprendre côté runtime.
  //
  // Palette lisible sur fond sombre, distincte à teintes voisines. Elle cycle
  // au-delà de 8 niveaux — un relevé à 9 niveaux réutilisera une teinte plutôt
  // que d'en inventer une illisible.
  const PALETTE_NIVEAUX = [
    "#8cb4ff", "#7ee0a0", "#f4c542", "#ff9f6b",
    "#e879c8", "#64d8d8", "#b79cff", "#9fd356"
  ];

  function _couleurNiveau(n, rang) {
    return PALETTE_NIVEAUX[((rang % PALETTE_NIVEAUX.length) + PALETTE_NIVEAUX.length) % PALETTE_NIVEAUX.length];
  }

  // Id stable et lisible plutôt que le `cust-<ts>-<rnd>` aléatoire de
  // LegendCustomization : deux imports du même fichier doivent produire les
  // mêmes types, sinon réimporter multiplierait les entrées de légende.
  function _idNiveau(categorie, n) {
    return "cust-sig-" + categorie + "-n" + String(n).replace("-", "m");
  }

  // Préfixe des types de STRUCTURE. Déclaré ICI, avant toutes les boucles :
  // il est lu par celle des lignes comme par celle des polygones, et un const
  // posé plus bas tombait dans sa zone morte temporelle (ReferenceError au
  // premier tracé — vécu au premier essai sur le relevé réel).
  // 🔀 v1.82.0 — ROUTAGE LIBRE (retour KARMA : « des zones peuvent aussi
  // être des fronts de taille — quelqu'un qui aurait fait un polygone via un
  // front de taille »). Exact, et la règle vaut dans tous les sens : la
  // GÉOMÉTRIE du fichier SIG ne dit pas ce que l'objet EST. Un polygone peut
  // être une zone, un pilier, un mur ou un front ; une polyligne peut être
  // une galerie, un front, ou le contour d'une zone tracé sans le fermer.
  // Le type choisi porte donc un préfixe de FAMILLE. Sans préfixe, l'objet
  // va dans la famille naturelle de sa géométrie (ligne → tracé, polygone →
  // zone), ce qui garde tout le comportement d'avant.
  const PREFIXES = { "struct:": "structures", "zone:": "zones", "trace:": "roads" };

  // Retourne { famille, type } depuis le choix de l'utilisateur.
  function _router(choisi, familleNaturelle) {
    const s = String(choisi || "");
    for (const p in PREFIXES) {
      if (s.startsWith(p)) return { famille: PREFIXES[p], type: s.slice(p.length) };
    }
    return { famille: familleNaturelle, type: s };
  }

  // 🏷️ v1.82.0 — PRÉVISUALISER les entrées de légende AVANT de générer.
  // L'écran SIG en a besoin pour les proposer à l'édition : au moment où
  // l'utilisateur veut les renommer, la génération n'a pas encore eu lieu et
  // les entrées n'existent donc pas encore.
  // Même logique d'id et de couleur que `_typeNiveau` — volontairement, pour
  // que ce qu'on montre soit exactement ce qui sera produit.
  function previsualiserEntreesNiveaux(normalise, opts) {
    opts = opts || {};
    if (opts.couleurParNiveau !== true || !opts.cleNiveau) return [];

    // 🩸 v1.82.0 (retour KARMA : « il me crée des tracés et zones alors que
    // j'ai demandé que des structures »). La première version déduisait la
    // famille de la GÉOMÉTRIE (ligne → tracé, polygone → zone) en ignorant le
    // mapping. Elle annonçait donc autre chose que ce que `ingest` allait
    // produire — l'inverse exact de ce qu'une prévisualisation doit faire.
    // On rejoue ici le MÊME routeur, avec le MÊME mapping.
    const mapTraces  = opts.mapTraces || {};
    const mapZones   = opts.mapZones  || {};
    const typeDefaut = opts.roadType  || "secondaire";
    const zoneDefaut = opts.zoneType  || "remblais";
    const cleType    = opts.cleType   || null;
    const TYPES_POLYLIGNE = ["front-1", "front-2"];

    const valeurType = function (props) {
      if (!cleType || !props) return null;
      const k = _trouverCle(props, cleType);
      return (k && props[k] != null) ? String(props[k]).trim() : null;
    };
    const niveauDe = function (props) {
      const k = _trouverCle(props, opts.cleNiveau);
      if (!k || !props || props[k] == null) return null;
      const m = /-?\d+/.exec(String(props[k]));
      if (!m) return null;
      const n = parseInt(m[0], 10);
      return Number.isFinite(n) ? n : null;
    };

    const vus = [];        // niveaux dans l'ordre RENCONTRÉ (attribue la couleur)
    const cles = [];       // "categorie|forme|niveau" déjà vues
    const out = [];

    const scan = function (items, familleNaturelle, mapping, defaut) {
      (items || []).forEach(function (it) {
        const n = niveauDe(it.props);
        if (n === null) return;
        if (vus.indexOf(n) < 0) vus.push(n);
        const v = valeurType(it.props);
        const r = _router((v && mapping[v]) || defaut, familleNaturelle);
        // Catégorie de LÉGENDE (pas de famille de stockage) : `roads` se dit
        // `traces` côté LegendCustomization.
        const cat = (r.famille === "structures") ? "structures"
                  : (r.famille === "zones")      ? "zones" : "traces";
        const estLigne = (cat === "traces") || TYPES_POLYLIGNE.indexOf(r.type) >= 0;
        const id = _idNiveau(cat + (estLigne ? "-l" : ""), n);
        if (cles.indexOf(id) >= 0) return;
        cles.push(id);
        const libelle = (cat === "structures") ? (estLigne ? "Structure" : "Pilier")
                      : (cat === "zones") ? "Zone" : "Galerie";
        out.push({ id: id, category: cat,
                   label: libelle + " " + (n < 0 ? n : "+" + n),
                   geometry: estLigne ? "polyline" : "polygon",
                   _niveau: n, _estLigne: estLigne });
      });
    };
    scan(normalise.lignes,    "roads", mapTraces, typeDefaut);
    scan(normalise.polygones, "zones", mapZones,  zoneDefaut);

    // Les couleurs seulement une fois tous les niveaux connus : le rang dépend
    // de l'ordre d'apparition GLOBAL, pas de celui de la première famille.
    out.forEach(function (e) {
      const c = _couleurNiveau(e._niveau, vus.indexOf(e._niveau));
      e.lineColor = c;
      if (!e._estLigne) { e.fillColor = c; e.borderColor = c; }
      delete e._niveau; delete e._estLigne;
    });
    return out;
  }

  // =========================================================================
  // INGESTION → objets MyKTAMap en coordonnées PLAN
  // =========================================================================
  // `transform` vient de KmzExport.buildTransform (la math centrale du projet,
  // celle-là même qu'utilisent le KMZ, la Vue OSM et le Mode Secours).
  function ingest(normalise, transform, opts) {
    opts = opts || {};
    const tagDefaut   = opts.pointTag || "default";
    const typeDefaut  = opts.roadType || "secondaire";
    const zoneDefaut  = opts.zoneType || "remblais";
    const cleType     = opts.cleType  || null;         // colonne SIG choisie
    const mapTraces   = opts.mapTraces || {};
    const mapZones    = opts.mapZones  || {};
    const mapTags     = opts.mapTags   || {};
    // 🏔️ v1.82.0 — LE NIVEAU SE LIT PAR OBJET (retour KARMA du 03/09 sur le
    // relevé de Citon_Graves_RD, qui porte SIX niveaux).
    // AVANT : `opts.level` était un entier UNIQUE appliqué à tout l'import —
    // un relevé multi-niveaux arrivait donc entièrement à plat, pendant que la
    // case « Plan multi-niveau » promettait une gestion des niveaux qu'aucun
    // objet ne pouvait honorer. La case posait un drapeau, rien de plus.
    // MAINTENANT : `opts.cleNiveau` désigne une colonne du fichier SIG, lue
    // objet par objet. `opts.level` reste accepté comme valeur de repli pour
    // les objets dont la colonne est vide ou illisible.
    const cleNiveau   = opts.cleNiveau || null;
    const niveauFixe  = Number.isInteger(opts.level) ? opts.level : null;

    // Les relevés écrivent le niveau de toutes les façons : -3, "-3", "3",
    // "niveau3", "N-3", "niveau -3". On extrait le premier entier signé trouvé.
    // Un niveau non lisible ne devient PAS 0 : il retombe sur le repli, sinon
    // une valeur exotique enverrait silencieusement l'objet à la surface.
    function _niveauDe(props) {
      if (!cleNiveau || !props) return niveauFixe;
      const k = _trouverCle(props, cleNiveau);
      if (!k || props[k] == null) return niveauFixe;
      const brut = String(props[k]).trim();
      if (brut === "") return niveauFixe;
      const m = /-?\d+/.exec(brut);
      if (!m) return niveauFixe;
      const n = parseInt(m[0], 10);
      return Number.isFinite(n) ? n : niveauFixe;
    }

    if (!window.KmzExport || typeof window.KmzExport.gpsToPlan !== "function") {
      throw new Error("sig.err.kmzExportMissing");
    }
    const g2p = function(lat, lng) { return window.KmzExport.gpsToPlan(transform, lat, lng); };

    function _valeurType(props) {
      if (!cleType || !props) return null;
      const k = _trouverCle(props, cleType);
      return (k && props[k] != null) ? String(props[k]).trim() : null;
    }

    const points = [], roads = [], zones = [], structures = [];

    // 🎨 Types par niveau : opt-in. Sans lui, rien ne change.
    const couleurParNiveau = opts.couleurParNiveau === true;
    // 🏷️ v1.82.0 — entrées de légende PRÉ-ÉDITÉES par l'utilisateur (libellé,
    // couleur). Fournies, elles sont utilisées TELLES QUELLES : c'est ce qui
    // permet de renommer « Galerie -3 » en son vrai nom depuis l'écran SIG,
    // sans repasser par le générateur de plans.
    // Indexées par id : `_typeNiveau` fabrique le même id de façon
    // déterministe, donc il retrouve l'entrée éditée au lieu d'en créer une.
    const entreesPreEditees = {};
    (opts.customEntries || []).forEach(function (e) {
      if (e && e.id) entreesPreEditees[e.id] = e;
    });
    const customEntries = [];
    const _dejaVu = {};
    // Rang d'apparition du niveau, pour que la palette soit attribuée dans
    // l'ordre des niveaux rencontrés et non selon la valeur brute (un relevé
    // numéroté -3 à -8 doit démarrer sur la 1re couleur, pas la 4e).
    const _rangs = {};
    let _rangSuivant = 0;

    // Remplace le type d'un objet par un type custom propre à son niveau.
    // Retourne le type à utiliser — inchangé si l'option est off, si l'objet
    // n'a pas de niveau, ou si la famille n'est pas colorable.
    // 🩸 v1.82.0 (bug remonté par KARMA : « j'ai bien pris front-1 et pourtant
    // il me fait encore des zones »). La cause était ICI.
    // Pour un type CUSTOM, `structures.js > _isPolylineType` ne peut pas deviner
    // la forme depuis le nom : il lit `entry.geometry === "polyline"` dans la
    // légende. Les entrées fabriquées plus haut n'avaient pas ce champ — un
    // front de taille repeint par niveau redevenait donc un POLYGONE PLEIN,
    // exactement ce que l'utilisateur voyait. La couleur par niveau écrasait
    // l'information de forme.
    // On garde donc le type de base pour en déduire `geometry`.
    const TYPES_POLYLIGNE = ["front-1", "front-2"];   // cf. STRUCTURE_TYPES_POLYLINE

    function _typeNiveau(typeBase, categorie, lvl, libelleBase) {
      if (!couleurParNiveau || lvl === null || typeof lvl !== "number") return typeBase;
      const estLigne = (categorie === "traces") || TYPES_POLYLIGNE.indexOf(typeBase) >= 0;
      // Un id par (catégorie, FORME, niveau) : dans une même catégorie et un
      // même niveau, un front et un pilier ne doivent pas partager une entrée —
      // l'un est une ligne, l'autre un polygone.
      const id = _idNiveau(categorie + (estLigne ? "-l" : ""), lvl);
      if (!_dejaVu[id]) {
        // Une entrée éditée gagne sur celle qu'on aurait fabriquée : le
        // libellé et la couleur viennent de l'utilisateur. On conserve
        // `geometry` calculée si l'éditeur ne l'a pas portée — c'est elle qui
        // décide ligne ou polygone, et l'éditeur de légende ne l'expose pas.
        const pre = entreesPreEditees[id];
        if (pre) {
          const copie = Object.assign({}, pre);
          if (!copie.geometry) copie.geometry = estLigne ? "polyline" : "polygon";
          if (!copie.category) copie.category = categorie;
          customEntries.push(copie);
          _dejaVu[id] = true;
          return id;
        }
        if (!(lvl in _rangs)) { _rangs[lvl] = _rangSuivant++; }
        const c = _couleurNiveau(lvl, _rangs[lvl]);
        const e = { id: id, category: categorie,
                    label: libelleBase + " " + (lvl < 0 ? lvl : "+" + lvl),
                    // Champ LU par structures.js pour trancher ligne/polygone.
                    geometry: estLigne ? "polyline" : "polygon" };
        e.lineColor = c;
        // Remplissage seulement pour ce qui est réellement fermé : donner un
        // fillColor à un front le ferait apparaître plein dans la légende.
        if (!estLigne) { e.fillColor = c; e.borderColor = c; }
        customEntries.push(e);
        _dejaVu[id] = true;
      }
      return id;
    }
    let idSeq = 1;

    (normalise.points || []).forEach(function(p) {
      const xy = g2p(p.lat, p.lng);
      if (!xy) return;
      const v = _valeurType(p.props);
      const o = {
        id:   "sig-p" + (idSeq++),
        x:    Math.round(xy.x),
        y:    Math.round(xy.y),
        nom:  p.nom || "",
        tags: [ (v && mapTags[v]) || tagDefaut ]
      };
      const lvl = _niveauDe(p.props);
      if (lvl !== null) o.level = lvl;
      points.push(o);
    });

    (normalise.lignes || []).forEach(function(l) {
      const pts = [];
      (l.coords || []).forEach(function(c) {
        const xy = g2p(c.lat, c.lng);
        if (xy) pts.push({ x: Math.round(xy.x), y: Math.round(xy.y) });
      });
      if (pts.length < 2) return;
      const v = _valeurType(l.props);
      // Un front de taille est une STRUCTURE en polyligne (front-1 / front-2,
      // cf. STRUCTURE_TYPES_POLYLINE dans structures.js) : même aiguillage.
      const rL = _router((v && mapTraces[v]) || typeDefaut, "roads");
      const o = { type: rL.type, points: pts };
      if (l.nom) o.note = l.nom;
      const lvl = _niveauDe(l.props);
      if (lvl !== null) o.level = lvl;
      o.type = _typeNiveau(o.type,
                           rL.famille === "structures" ? "structures" : (rL.famille === "zones" ? "zones" : "traces"),
                           (typeof o.level === "number") ? o.level : null,
                           rL.famille === "structures" ? "Structure" : (rL.famille === "zones" ? "Zone" : "Galerie"));
      ({ structures: structures, zones: zones, roads: roads }[rL.famille] || roads).push(o);
    });

    // 🏛️ v1.82.0 — LES STRUCTURES, 4e famille (retour KARMA du 03/09 sur un
    // vrai relevé) : « mes zones ne peuvent pas être des structures, or c'est
    // justement ça (pilier) ». L'import ne connaissait que points / tracés /
    // zones, alors qu'un polygone SIG est très souvent un PILIER — l'objet le
    // plus courant d'une carrière. Le forcer en « remblais » était faux.
    //
    // Le type choisi porte le préfixe `struct:` quand il désigne une
    // structure : c'est ce qui permet à UN MÊME select de proposer les zones
    // ET les structures sans ambiguïté — un polygone peut légitimement être
    // l'un ou l'autre, seul l'utilisateur sait lequel.

    (normalise.polygones || []).forEach(function(z) {
      const pts = [];
      (z.coords || []).forEach(function(c) {
        const xy = g2p(c.lat, c.lng);
        if (xy) pts.push({ x: Math.round(xy.x), y: Math.round(xy.y) });
      });
      if (pts.length < 3) return;
      const v = _valeurType(z.props);
      const rZ = _router((v && mapZones[v]) || zoneDefaut, "zones");
      const o = { type: rZ.type, points: pts };
      if (z.nom) o.note = z.nom;
      const lvl = _niveauDe(z.props);
      if (lvl !== null) o.level = lvl;
      o.type = _typeNiveau(o.type,
                           rZ.famille === "structures" ? "structures" : (rZ.famille === "roads" ? "traces" : "zones"),
                           (typeof o.level === "number") ? o.level : null,
                           rZ.famille === "structures" ? "Pilier" : (rZ.famille === "roads" ? "Galerie" : "Zone"));
      ({ structures: structures, zones: zones, roads: roads }[rZ.famille] || zones).push(o);
    });

    return {
      points: points, roads: roads, zones: zones, structures: structures,
      // 🎨 Entrées de légende fabriquées pour les niveaux (vide si opt-out).
      customEntries: customEntries,
      stats: { points: points.length, roads: roads.length, zones: zones.length,
               structures: structures.length,
               // Répartition réelle par niveau : c'est elle qui permet à l'UI de
               // montrer « -1: 8 · -2: 134 · … » AVANT de générer. Un import
               // multi-niveaux qui retombe à plat se voit alors immédiatement.
               parNiveau: (function() {
                 const r = {};
                 [points, roads, zones, structures].forEach(function(arr) {
                   arr.forEach(function(o) {
                     const k = (typeof o.level === "number") ? o.level : 0;
                     r[k] = (r[k] || 0) + 1;
                   });
                 });
                 return r;
               })() }
    };
  }

  // 📐 v1.82.0 — DIMENSIONS FINALES DU CANVAS : la largeur demandée, la hauteur
  // déduite du terrain, puis un plafond de SURFACE appliqué aux deux à la fois.
  //
  // Le plafond répond à deux problèmes distincts qui ont la même cause :
  //   • KARMA : « ma génération depuis qu'on prend tout l'historique n'a JAMAIS
  //     abouti ». 10000×11680 = 117 Mpx, soit ~467 Mo de RGBA — et le pipeline
  //     en tient DEUX (le canvas, puis l'image re-décodée pour le tuilage).
  //     Près d'un gigaoctet pour un aplat de couleur : selon la machine, ça
  //     passe ou `toBlob` renvoie `null` sans un mot.
  //   • iOS Safari plafonne le canvas autour de 16,7 Mpx. L'ancien réglage par
  //     DÉFAUT (4000×4672 = 18,7 Mpx) le dépassait déjà : l'import SIG rendait
  //     un fond vide sur iPhone dans sa configuration de sortie de boîte.
  //     [Probable — plafond iOS non testé ici ; le calcul de surface, lui,
  //     est certain.]
  //
  // On réduit les DEUX dimensions du même facteur : le plan reste à l'échelle,
  // simplement moins fin. Pour un FOND UNI la finesse n'a aucun sens de toute
  // façon — elle ne sert qu'à borner les coordonnées des annotations.
  function dimensionsCanvas(bounds, W) {
    W = Math.max(64, W || 4000);
    const H = calculerHauteurCanvas(bounds, W);
    const mpx = (W * H) / 1e6;
    // `alerte` : null | "ios" | "ram". L'appelant décide quoi en faire —
    // ici on ne fait que qualifier, jamais rogner.
    let alerte = null;
    if (mpx > ALERTE_CANVAS_MPX_RAM)      alerte = "ram";
    else if (mpx > ALERTE_CANVAS_MPX_IOS) alerte = "ios";
    return { w: W, h: H, mpx: mpx, alerte: alerte };
  }

  // 📐 v1.82.0 — HAUTEUR DU CANVAS, DÉDUITE DE LA FORME DU TERRAIN.
  // Exposée : le générateur l'utilise pour de vrai, et l'écran d'import s'en
  // sert pour AFFICHER la valeur avant de générer. Une seule implémentation —
  // deux calculs séparés finiraient par diverger, et l'utilisateur verrait
  // une taille annoncée différente de celle qu'il obtient.
  function calculerHauteurCanvas(bounds, W) {
    if (!bounds || !window.KmzExport || !window.KmzExport.buildTransform) return W;
    const _mesurer = function (w, h) {
      const t = window.KmzExport.buildTransform(
        { x: 0, y: h }, { x: w, y: 0 },
        { lat: bounds.latMin, lng: bounds.lngMin },
        { lat: bounds.latMax, lng: bounds.lngMax });
      const c = [[bounds.latMin, bounds.lngMin], [bounds.latMin, bounds.lngMax],
                 [bounds.latMax, bounds.lngMin], [bounds.latMax, bounds.lngMax]]
        .map(function (g) { return window.KmzExport.gpsToPlan(t, g[0], g[1]); });
      const xs = c.map(function (q) { return q.x; }), ys = c.map(function (q) { return q.y; });
      return { w: Math.max.apply(null, xs) - Math.min.apply(null, xs),
               h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
    };
    let h = W, precedent = -1;
    try {
      for (let k = 0; k < 12; k++) {
        const m = _mesurer(W, h);
        if (!(m.w > 0) || !(m.h > 0)) break;
        const suivant = Math.round(W * (m.h / m.w));
        if (suivant === precedent || suivant === h) { h = suivant; break; }
        precedent = h; h = suivant;
      }
    } catch (e) { return W; }
    // Plafond : un relevé en bande très étroite donnerait un canvas démesuré.
    // Mieux vaut un plan un peu comprimé qu'une image que le navigateur ne
    // saura jamais peindre.
    // Plafond de HAUTEUR seul. Le plafond de SURFACE, lui, ne peut pas être
    // appliqué ici : rogner la hauteur sans toucher à la largeur ÉCRASE le plan
    // (mesuré : 10000×11680 devenait 10000×1600, soit un ratio de 0,16 au lieu
    // de 1,17 — le terrain était aplati). Il vit dans `dimensionsCanvas`, qui
    // réduit les DEUX dimensions du même facteur.
    return Math.max(64, Math.min(h, 30000));
  }

  // =========================================================================
  // LÉGENDE DU PLAN — assemblage de ce qui part dans plan-config.json
  // =========================================================================
  // 🏷️ v1.83.1 — TOUT l'état édité voyage, plus seulement les entrées par niveau.
  //
  // 🩸 LE BUG (KARMA, 04/09 : « j'avais modifié ma légende, elle n'a pas été
  // emportée dans l'export ») : `plan.customLegend` était assemblé ICI avec
  // `labels: {}` et `hidden: {}` ÉCRITS EN DUR, et sans `colors` ni `borders`.
  // Renommer un type BUILT-IN dans l'éditeur 🏷️ de l'écran SIG, en masquer un,
  // en recolorer un : tout finissait à la poubelle à la génération, sans un mot.
  // Seules survivaient les entrées `cust-sig-…` fabriquées par `_typeNiveau`.
  // Deuxième moitié du même trou : une entrée ajoutée À LA MAIN (➕) n'était
  // jamais réémise — `ingest` ne recopie que les ids qu'il fabrique lui-même.
  //
  // 🧹 CE QU'ON ÉCARTE QUAND MÊME : les entrées `cust-sig-…` que CETTE
  // génération n'a PAS produites. Elles viennent d'un routage précédent, ou
  // d'un import où la couleur par niveau a été décochée après l'édition :
  // les garder poserait dans la légende du plan des types qu'aucun objet ne
  // porte. Une entrée ajoutée à la main n'a pas ce préfixe et reste — c'est
  // l'utilisateur qui l'a voulue.
  //
  // Ce qui n'est volontairement PAS repris : `removedPlan`, qui désigne des
  // entrées du plan COURANT masquées en session. Un plan qu'on fabrique n'a
  // pas de « plan précédent » où enterrer quoi que ce soit.
  const PREFIXE_AUTO_NIVEAU = "cust-sig-";

  function assemblerLegendePlan(edite, auto) {
    const listeAuto = Array.isArray(auto) ? auto : [];
    const src = (edite && typeof edite === "object") ? edite : {};
    const obj = function (o) {
      return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
    };
    const entrees = listeAuto.slice();
    const vus = {};
    listeAuto.forEach(function (e) { if (e && e.id) vus[e.id] = true; });
    (Array.isArray(src.customEntries) ? src.customEntries : []).forEach(function (e) {
      if (!e || typeof e.id !== "string" || !e.id || vus[e.id]) return;
      if (e.id.indexOf(PREFIXE_AUTO_NIVEAU) === 0) return;   // orpheline d'un routage périmé
      vus[e.id] = true;
      entrees.push(e);
    });
    const legende = {
      schemaVersion: 1,
      labels:  obj(src.labels),
      hidden:  obj(src.hidden),
      colors:  obj(src.colors),
      borders: obj(src.borders),
      customEntries: entrees
    };
    // Rien de personnalisé = pas de section du tout : un `customLegend` vide
    // dans le plan-config est du bruit que le runtime relira à chaque boot.
    const vide = entrees.length === 0
      && Object.keys(legende.labels).length === 0
      && Object.keys(legende.hidden).length === 0
      && Object.keys(legende.colors).length === 0
      && Object.keys(legende.borders).length === 0;
    return vide ? null : legende;
  }

  // =========================================================================
  // GÉNÉRATION DU ZIP MyKTAMap
  // =========================================================================
  // Même stratégie que gpxImport : canvas vierge + calibrage 2 points sur les
  // bounds (BL ↔ latMin/lngMin, TR ↔ latMax/lngMax). L'utilisateur remplacera
  // le canvas par une vraie image via « Modifier un plan » s'il en a une.
  async function genererZipMyktamap(opts) {
    if (typeof JSZip === "undefined") throw new Error("sig.err.jszip");
    if (!opts || !opts.normalise || !opts.bounds) throw new Error("sig.err.genZipReq");
    if (!window.KmzExport || !window.KmzExport.buildTransform) throw new Error("sig.err.kmzExportMissing");
    if (!window.GpxImport || typeof window.GpxImport.genererCanvasVierge !== "function") {
      throw new Error("sig.err.gpxImportMissing");
    }

    // 📐 v1.82.0 — LA HAUTEUR EST DÉDUITE, PLUS SAISIE (retour KARMA du 03/09 :
    // « si mon plan est plus grand, il sort du canvas »).
    //
    // 🩸 LA CAUSE : `buildTransform` à 2 points est une SIMILITUDE — rotation
    // + échelle UNIFORME. En calant les deux coins opposés du terrain sur les
    // deux coins opposés du canvas, elle n'a qu'un seul degré de liberté : si
    // les proportions diffèrent, elle fait TOURNER le rectangle pour que les
    // diagonales coïncident. Le contenu sort alors du cadre, des deux côtés.
    // Mesuré sur un relevé réel (terrain 1199 × 1562 m, canvas carré
    // 10000 × 10000) : les coins projetés allaient de y = -1097 à y = 11097.
    // Plus de 1 000 px hors cadre en haut ET en bas — soit un plan faux, sans
    // le moindre avertissement.
    //
    // LE CORRECTIF : l'utilisateur donne la LARGEUR, la hauteur est calculée
    // pour que le canvas ait exactement les proportions du terrain projeté.
    // Ce ratio ne se calcule pas à la main : la projection interne de
    // `buildTransform` n'est pas une simple règle de trois sur les degrés, et
    // une mesure faite avec un canvas mal proportionné est elle-même faussée
    // par la rotation qu'on cherche à annuler. On CONVERGE donc : on mesure,
    // on ajuste, on remesure. Sur le cas réel, 6 tours suffisent pour tomber à
    // 0 px de débordement (1097 → 276 → 69 → 17 → 5 → 1 → 0).
    const _dim = dimensionsCanvas(opts.bounds, opts.canvasWidth || 4000);
    const W = _dim.w, H = _dim.h;

    const pA_plan = { x: 0, y: H };
    const pB_plan = { x: W, y: 0 };
    const pA_gps  = { lat: opts.bounds.latMin, lng: opts.bounds.lngMin };
    const pB_gps  = { lat: opts.bounds.latMax, lng: opts.bounds.lngMax };

    let transform;
    try {
      transform = window.KmzExport.buildTransform(pA_plan, pB_plan, pA_gps, pB_gps);
      transform.imageW = W;
      transform.imageH = H;
    } catch(e) {
      const err = new Error("sig.err.autoCalib"); err.detail = e.message; throw err;
    }

    const ingested = ingest(opts.normalise, transform, opts.mapping || {});

    // Canvas vierge : on RÉUTILISE celui de gpxImport (même besoin, même
    // rendu, aucune raison d'avoir deux générateurs de fond).
    const baseBlob = await window.GpxImport.genererCanvasVierge(W, H, opts.canvasColor || "sepia");

    const zip = new JSZip();
    zip.file("data/baseImage.png", baseBlob);

    // 🧱 v1.82.0 — TUILAGE V2 (retour KARMA : « le plan n'est pas généré en V2,
    // donc inutilisable en OSM »). Exact, et le blocage est franc : la Vue OSM
    // du MODE PLAN (`osmView.js`) refuse tout plan non tuilé — pas par confort
    // mais pour une raison documentée, le CRASH MOBILE : avant la v1.39.10 elle
    // chargeait l'image entière via `imageOverlay.rotated`, ce qui saturait le
    // GPU d'un iPhone. Depuis, seuls les plans V2 passent.
    // (La Vue OSM du HOME, elle, accepte les plans V1 : elle affiche alors les
    // données sans le fond. Deux écrans, deux exigences — ne pas les confondre.)
    //
    // Un plan issu d'un SIG est le meilleur candidat qui soit pour la Vue OSM :
    // son géoréférencement est CALCULÉ, pas saisi à la main. Le priver de cet
    // écran pour un fond uni serait absurde — et l'aplat ne gêne pas, la Vue OSM
    // a un toggle « 🖼️ Plan » pour le masquer.
    //
    // On RÉUTILISE le tuileur du générateur de plans (`_genererTuilesV2`) plutôt
    // que d'en écrire un second : c'est lui qui définit le format, la pyramide
    // et le manifeste. Une deuxième implémentation dériverait.
    let tilingManifest = null;
    try {
      if (typeof _genererTuilesV2 === "function") {
        // 📊 v1.82.0 — le 3ᵉ paramètre du tuileur est un callback de PROGRESSION,
        // et il n'était pas passé. Le tuilage d'un canvas 10000×11680 prend une
        // dizaine de secondes : sans retour à l'écran, l'utilisateur regarde un
        // label figé et croit que ça a planté. Le jumeau GPX affiche une barre
        // depuis toujours — on fait pareil. C'est la première cause du « très
        // long » ressenti, avant même le coût réel.
        // 4e argument : le fond d un plan SIG est TOUJOURS un aplat uni
        // (genererCanvasVierge), donc toutes ses tuiles pleines sont identiques.
        const v2 = await _genererTuilesV2(baseBlob, zip, opts.onProgress || null, true);
        if (v2 && v2.manifest) tilingManifest = v2.manifest;
      } else {
        console.warn("[SigImport] _genererTuilesV2 indisponible — plan généré en V1 " +
                     "(la Vue OSM du mode plan le refusera).");
      }
    } catch(e) {
      // Dégradation assumée : mieux vaut un plan V1 utilisable en mode carte
      // qu'aucun plan du tout. L'utilisateur pourra le retuiler via
      // « Modifier un plan ».
      console.warn("[SigImport] tuilage V2 échoué, plan livré en V1 :", e);
      tilingManifest = null;
    }

    const planConfig = {
      plan: {
        name:        opts.planName    || "Import SIG",
        version:     opts.planVersion || "v1",
        author:      opts.planAuthor  || "",
        imageWidth:  W,
        imageHeight: H,
        // 🩸 v1.88.4 — PRÉFIXE `data/` OBLIGATOIRE. Le fichier est écrit dans
        // `data/` du ZIP, mais était déclaré ICI sans le préfixe. En import
        // LOCAL ça passait : `findMatchingFile` retrouve l'asset par son NOM DE
        // BASE, donc l'incohérence était invisible. En mode SERVEUR la résolution
        // est stricte → 404 sur l'image et les calques (constat KARMA : ses plans
        // `*_from_v2` échouaient, les plans du Générateur passaient).
        // ⚠️ `kmzImport` avait déjà corrigé ce motif pour ses CALQUES en
        // v1.21.0-fix5 — jamais pour son `baseImage`.
        baseImage:   "data/baseImage.png",
        georef: {
          pointA: { x: pA_plan.x, y: pA_plan.y, lat: pA_gps.lat, lng: pA_gps.lng },
          pointB: { x: pB_plan.x, y: pB_plan.y, lat: pB_gps.lat, lng: pB_gps.lng }
        }
      },
      tracking: {
        startX: Math.round(W / 2), startY: Math.round(H / 2),
        // 📏 v1.82.0 — L ECHELLE ETAIT EN DUR A 50 px/m, et donc FAUSSE de
        // plusieurs centaines de pour cent sur tout plan SIG (KARMA : « meme
        // si je prends celle calculee par le georef c est completement faux »).
        // Sur Citon : 4000 px pour 1199 m de terrain = 3,34 px/m reels,
        // contre 50 annonces — un facteur 15.
        // La bonne valeur etait DEJA calculee : buildTransform retourne
        // `metresParPixel`, dont scale est exactement l inverse. Rien a
        // recalculer, il fallait juste la lire au lieu d inventer 50.
        scale: (transform && transform.metresParPixel > 0)
               ? Math.round((1 / transform.metresParPixel) * 1000) / 1000
               : 50,
        // 👣 v1.96.0 — plus de stepLength / stepThreshold / stepCooldown ici : ces
        // réglages sont ceux de la personne, globaux à l'appareil (⚙️ Réglages).
      },
      icons: { default: "icon/iconetrack.png", track: "icon/iconetrack.png" },
      imageLayers: [],
      dataLayers: [{ id: "sig", label: opts.layerLabel || "Import SIG", file: "data/sig.json", visible: true }]
    };
    if (opts.multiLevel === true) planConfig.plan.multiLevel = true;
    // 🏷️ 16/09/2026 — étiquettes proposées par le Générateur (déjà normalisées
    // par PlanRegistry.normaliserTags). Absentes = champ absent, JSON inchangé.
    if (Array.isArray(opts.tags) && opts.tags.length) planConfig.plan.tags = opts.tags.slice(0, 12);
    // 📉 v1.83.0 — profondeurs proposées d'office sur un plan importé, avec
    // les mêmes défauts que le Générateur (niveau 0 à -25 m, pas de 5 m).
    //
    // 🩸 SAUF le niveau qui porte le TOPO HISTORIQUE : ce n'est pas un étage
    // physique au-dessus, c'est une convention d'empilement pour séparer deux
    // relevés du MÊME endroit. Lui donner une altitude fausserait tout profil
    // en long qui le traverse — il est donc marqué `null`, « sans profondeur »,
    // le seul état qui dise la vérité.
    if (opts.multiLevel === true && typeof window.proposerProfondeurs === "function") {
      const _niv = [];
      (ingested.roads || []).concat(ingested.zones || [], ingested.structures || [])
        .forEach(function (o) {
          if (o && Number.isInteger(o.level) && _niv.indexOf(o.level) < 0) _niv.push(o.level);
        });
      if (_niv.length) {
        const _t = window.proposerProfondeurs(_niv);
        // Le niveau de l'historique est celui que l'outil de découpage range
        // au-dessus de tout — `opts.historiqueNiveau` s'il est passé, +1 sinon.
        const _histo = Number.isInteger(opts.historiqueNiveau) ? opts.historiqueNiveau : 1;
        if (String(_histo) in _t) _t[String(_histo)] = null;
        planConfig.plan.niveauxProfondeur = _t;
      }
    }
    // 🧱 Les DEUX marqueurs sont nécessaires : le drapeau `plan.tiledV2` et la
    // section `tiling`. `osmView._isV2Plan()` vérifie les deux, plus la présence
    // de `minNativeZoom` et `tileSize` — un drapeau seul ne suffirait pas.
    // 🎨 v1.82.0 — LÉGENDE CUSTOM embarquée dans le plan-config, au format
    // exact de LegendCustomization.getSessionState(). C est ce qui donne une
    // couleur propre à chaque niveau : sans elle, les six niveaux sortaient
    // tous de la même teinte et le multi-niveau perdait son intérêt visuel.
    // 🏷️ v1.83.1 — et DÉSORMAIS tout le reste de l'état édité (cf.
    // `assemblerLegendePlan`), qui partait à la poubelle.
    const legendePlan = assemblerLegendePlan(
      (opts.mapping && opts.mapping.planLegend) || opts.planLegend || null,
      ingested.customEntries
    );
    if (legendePlan) planConfig.plan.customLegend = legendePlan;

    if (tilingManifest) {
      planConfig.plan.tiledV2 = true;
      planConfig.tiling = tilingManifest;
    }

    // 🆔 v2.1.0 — un plan fabriqué ici porte un uid sur chaque objet (ETUDE_UID déc. 5).
    if (window.KtaUid) {
      const _vus = new Set();
      window.KtaUid.ensureAll(ingested.points, "pt", undefined, _vus);
      window.KtaUid.ensureAll(ingested.roads, "rd", undefined, _vus);
      window.KtaUid.ensureAll(ingested.zones, "zn", undefined, _vus);
      window.KtaUid.ensureAll(ingested.structures, "st", undefined, _vus);
    }
    zip.file("data/sig.json", JSON.stringify({
      points: ingested.points,
      roads:  ingested.roads,
      zones:  ingested.zones,
      // 🏛️ v1.82.0 — 4e famille. `structures.js` lit cette clé comme les autres.
      structures: ingested.structures || []
    }));   // 📦 v1.82.0 : plus de pretty-print — x2,7 en taille pour un
                //    fichier que personne ne lit à la main, et tout ce poids
                //    repasse ensuite dans le DEFLATE en JS pur.
    zip.file("plan-config.json", JSON.stringify(planConfig, null, 2));

    // Icône tracker : même reprise que gpxImport (sinon le plan importé
    // n'a pas de marqueur de position).
    try {
      const r = await fetch("icon/iconetrack.png");
      if (r && r.ok) {
        const b = await r.blob();
        if (b && b.size > 0) zip.file("icon/iconetrack.png", b);
      }
    } catch(e) {}

    // 📦 v1.82.0 — DEFLATE niveau 3 au lieu du 6 par défaut. Le contenu est
    // déjà pour l essentiel des JPEG (incompressibles) ; seul le JSON gagne
    // à être compressé, et le niveau 3 en récupère la quasi-totalité pour
    // une fraction du temps. Le jumeau GPX, lui, écrit carrément en STORE.
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE",
                                           compressionOptions: { level: 3 } });
    return { blob: blob, stats: ingested.stats, transform: transform };
  }

  window.SigImport = {
    FORMATS_ACCEPTES:   FORMATS_ACCEPTES,
    detecterFormat:     detecterFormat,
    parseGeoJson:       parseGeoJson,
    parseKml:           parseKml,
    parseFichier:       parseFichier,
    validerCrs:         validerCrs,
    // 📐 v1.82.0 — Lambert 93. `L93` est exposé pour le garde-fou
    // `scripts/check-lambert93.js`, qui vérifie les propriétés
    // définitoires de la projection (origine exacte, échelle 1 aux
    // parallèles standard, conformité) sans aucune table de référence.
    detecterLambert93:  detecterLambert93,
    reprojeterLambert93: reprojeterLambert93,
    L93:                L93,
    // 🌐 Web Mercator — exposé pour `js/tiffGeoref.js` (GeoTIFF calés en 3857)
    // et pour `scripts/check-webmercator.js`. Aucune autre implémentation de
    // cette projection ne doit apparaître dans le projet.
    WEBMERC:            WEBMERC,
    calculerBounds:     calculerBounds,
    WARN_FEATURES:      WARN_FEATURES,
    ALERTE_CANVAS_MPX_IOS: ALERTE_CANVAS_MPX_IOS,
    ALERTE_CANVAS_MPX_RAM: ALERTE_CANVAS_MPX_RAM,
    calculerHauteurCanvas: calculerHauteurCanvas,
    dimensionsCanvas:   dimensionsCanvas,
    analyserAttributs:  analyserAttributs,
    valeursParFamille:  valeursParFamille,
    proposerMapping:    proposerMapping,
    previsualiserEntreesNiveaux: previsualiserEntreesNiveaux,
    ingest:             ingest,
    genererZipMyktamap: genererZipMyktamap
  };

  console.log("[SigImport] Module chargé — API window.SigImport prête");
})();
