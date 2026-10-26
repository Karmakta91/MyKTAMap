/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =====================================================================
// sigImport.js — « Convertir depuis SIG » : un export SIG vectoriel (QGIS & co) devient un ZIP MyKTAMap, sur un
// canvas vierge calibré sur ses bornes GPS (même finalité que gpxImport.js). 100 % local, aucun réseau.
// Formats : GeoJSON (.geojson/.json, JSON.parse) · KML/KMZ vectoriel (DOMParser + JSZip). Hors périmètre :
// Shapefile, GeoPackage (sql.js ≈ 1 Mo WASM, contraire à l'offline léger).
// Pipeline : detecterFormat → parseFichier (structure normalisée, GPS brut) → validerCrs (refus ici) →
// calculerBounds → analyserAttributs (écran « valeur SIG → tag ») → genererZipMyktamap (Blob ZIP).
// ⚠️ Structure normalisée : { points: [{lat, lng, nom, props}], lignes / polygones: [{coords: [{lat, lng}], nom,
// props}], avertissements: [string] }.
// Expose : window.SigImport = { detecterFormat, parseGeoJson, parseKml, parseFichier, validerCrs, calculerBounds,
//          analyserAttributs, proposerMapping, ingest, genererZipMyktamap, FORMATS_ACCEPTES, … }
// Pièges : 🩸 CRS : Lambert 93 (mètres) RECONNU et CONVERTI, conversion ANNONCÉE ; toute autre projection REFUSÉE
//          avec un message actionnable — valider et refuser, jamais clamper en silence (décision produit).
//          🩸 La légende éditée dans l'écran SIG (opts.mapping.planLegend) voyage EN ENTIER dans
//          plan.customLegend (assemblerLegendePlan), pas seulement les entrées `cust-sig-…`.
// Garde-fous : check-lambert93.js, check-geotiff.js
// =====================================================================

(function() {
  "use strict";

  const FORMATS_ACCEPTES = ".geojson,.json,.kml,.kmz";

  // Bornes WGS84 : au-delà, ce n'est PAS du lat/lng (presque toujours un CRS projeté).
  const LAT_MAX = 90;
  const LNG_MAX = 180;

  // Deux seuils d'objets. Un vrai relevé (structuré + topo historique) dépasse 20 000 objets et s'importe sans
  // peine (parse ~0,2 s, ZIP ~1,6 s) ; un atlas entier (centaines de milliers) doit rester arrêté net.
  // ⚠️ NON MESURÉ : le RENDU Leaflet du plan importé. D'où l'avertissement au-delà de WARN_FEATURES : on prévient
  // au lieu de décider à la place de l'utilisateur.
  const MAX_FEATURES  = 60000;   // refus dur : un atlas, pas un plan
  const WARN_FEATURES = 20000;   // accepté, avec avertissement

  // Seuils d'ALERTE de surface du canvas : on prévient et on conseille, on ne bloque ni ne rogne (décision
  // produit : un plafond silencieux rendait le champ largeur inopérant).
  //   • 16 Mpx — ordre de grandeur du plafond canvas d'iOS Safari (~16,7 Mpx) : au-delà, image VIDE sur iPhone
  //     [estimation non testée ; le calcul de surface est certain].
  //   • 60 Mpx — le pipeline tient DEUX bitmaps (canvas + image re-décodée pour le tuilage), ~480 Mo de RGBA :
  //     la génération n'aboutit plus.
  const ALERTE_CANVAS_MPX_IOS = 16;
  const ALERTE_CANVAS_MPX_RAM = 60;

  // ── Détection de format ──────────────────────
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

  // ── Parser GeoJSON ──────────────────────
  // FeatureCollection / Feature / GeometryCollection / géométrie nue. Les Multi* sont ÉCLATÉS (pas de
  // multi-géométrie dans MyKTAMap).
  function parseGeoJson(texte) {
    let obj;
    try { obj = (typeof texte === "string") ? JSON.parse(texte) : texte; }
    catch(e) { throw new Error("sig.err.jsonInvalide"); }
    if (!obj || typeof obj !== "object") throw new Error("sig.err.jsonInvalide");

    const out = { points: [], lignes: [], polygones: [], avertissements: [] };

    // ⚠️ Membre `crs` (GeoJSON 2008, retiré du RFC 7946, QGIS l'écrit encore) : autre que CRS84/4326 → refus net,
    // sauf Lambert 93, laissé passer : validerCrs tranche sur les CHIFFRES (QGIS écrit parfois un `crs` faux).
    if (obj.crs && obj.crs.properties && obj.crs.properties.name) {
      const nom = String(obj.crs.properties.name).toUpperCase();
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
          // Anneau extérieur seulement (pas de zone à trous dans MyKTAMap) ; trous signalés.
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

  // Nom lisible pris dans les clés usuelles des exports SIG, sinon null.
  const CLES_NOM = ["name", "nom", "label", "libelle", "libellé", "title", "titre", "id", "ref"];
  function _nomDepuisProps(props) {
    for (let i = 0; i < CLES_NOM.length; i++) {
      const k = _trouverCle(props, CLES_NOM[i]);
      if (k && props[k] != null && String(props[k]).trim() !== "") return String(props[k]).trim();
    }
    return null;
  }

  // Clé insensible à la casse et aux accents (« Libellé », « LIBELLE », « libelle »…).
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

  // ── Parser KML ──────────────────────
  // 🩸 <coordinates> = « lng,lat[,alt] » séparés par des blancs : MÊME ordre que GeoJSON (lng d'abord).
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

      const pts = pm.getElementsByTagName("Point");
      for (let j = 0; j < pts.length; j++) {
        const co = _coordsKml(pts[j]);
        if (co.length >= 1) out.points.push({ lat: co[0].lat, lng: co[0].lng, nom: nom, props: props });
      }
      const ls = pm.getElementsByTagName("LineString");
      for (let j = 0; j < ls.length; j++) {
        const co = _coordsKml(ls[j]);
        if (co.length >= 2) out.lignes.push({ coords: co, nom: nom, props: props });
      }
      // Polygones : anneau extérieur seulement.
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

  // ── Lecture du fichier ──────────────────────
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

  // ── Lambert 93 (EPSG:2154) ⇄ WGS84 ──────────────────────
  // QGIS exporte souvent en Lambert 93 : des MÈTRES (650000, 6860000), pas des degrés.
  // Pas de proj4 : ~30 Ko pour des milliers de CRS quand on en veut UN, et `lib/` reste minimal (offline, sans
  // bundler). La conique conforme de Lambert tient en ~50 lignes.
  // ⚠️ Vérifiable sans table externe : par construction, l'origine (3°E, 46,5°N) tombe EXACTEMENT sur
  // (700000, 6600000) ; scripts/check-lambert93.js le contrôle, puis l'aller-retour sur une grille.
  // Paramètres officiels EPSG:2154 (IGN / registre EPSG) :
  //   ellipsoïde GRS80 · lat_0 46.5 · lon_0 3 · lat_1 44 · lat_2 49
  //   x_0 700000 · y_0 6600000
  const L93 = (function () {
    const a  = 6378137.0;                 // demi-grand axe GRS80
    const f  = 1 / 298.257222101;         // aplatissement GRS80
    const e  = Math.sqrt(2 * f - f * f);  // première excentricité
    const D  = Math.PI / 180;
    const lat0 = 46.5 * D, lon0 = 3 * D, lat1 = 44 * D, lat2 = 49 * D;
    const x0 = 700000, y0 = 6600000;

    // m(φ) et t(φ) de Snyder, briques de toute conique conforme.
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

    // WGS84 → Lambert 93 : sert à l'aller-retour du garde-fou (prouve que l'inverse n'est pas juste cohérent avec
    // lui-même).
    function versL93(lat, lng) {
      const p = lat * D, l = lng * D;
      const r = a * F * Math.pow(t(p), n);
      const th = n * (l - lon0);
      return { x: x0 + r * Math.sin(th), y: y0 + r0 - r * Math.cos(th) };
    }

    // Lambert 93 → WGS84 : celle dont l'import a besoin.
    function versWgs84(x, y) {
      const dx = x - x0, dy = r0 - (y - y0);
      const r  = Math.sign(n) * Math.sqrt(dx * dx + dy * dy);
      const th = Math.atan2(dx, dy);
      const tt = Math.pow(r / (a * F), 1 / n);
      let p = Math.PI / 2 - 2 * Math.atan(tt);
      // Convergence de la latitude isométrique : 8 tours suffisent (résidu < 1 µm dès le 5e), sortie anticipée.
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

  // ── Web Mercator (EPSG:3857) ⇄ WGS84 ──────────────────────
  // Pour les GeoTIFF calés en 3857 (js/tiffGeoref.js) : QGIS l'impose dès que le calage se fait sur un fond de
  // tuiles web.
  // ⚠️ Mercator SPHÉRIQUE de rayon 6 378 137 m : c'est la DÉFINITION d'EPSG:3857, pas une approximation. Ni
  // excentricité, ni convergence.
  // Vérifiable sans table : équateur → y = 0, Greenwich → x = 0, un tour de longitude = 2πR, projection conforme
  // (scripts/check-geotiff.js ; l'aller-retour seul ne prouverait rien).
  const WEBMERC = (function () {
    const R = 6378137.0;            // rayon de la sphère EPSG:3857
    const D = Math.PI / 180;

    function versMerc(lat, lng) {
      // ⚠️ Le pôle projette à l'infini : borne officielle du 3857 = ±85,051129°.
      const p = Math.max(-85.051129, Math.min(85.051129, lat)) * D;
      // 🩸 PAS ln(tan(π/4 + φ/2)) : en flottant, Math.tan(Math.PI/4) = 0,9999999999999999 et y(0°) ≠ 0.
      // atanh(sin φ) = ½·ln((1+s)/(1-s)) tombe sur 0 EXACT (vérifié par le garde-fou).
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

  // Enveloppe Lambert 93 de la métropole, LARGE à dessein : elle sert à RECONNAÎTRE du L93, pas à valider une
  // position. Aucun autre CRS courant ne produit ces ordres de grandeur (UTM 31N : Y ≈ 5 400 000 ; Web Mercator :
  // X jusqu'à 20 000 000).
  const L93_BBOX = { xMin: 0, xMax: 1300000, yMin: 6000000, yMax: 7200000 };

  function _dansEnveloppeL93(c) {
    // 🩸 GeoJSON projeté : `lng` porte l'ABSCISSE X et `lat` l'ORDONNÉE Y (le parser range coordinates[0]/[1] sans
    // interpréter). Les inverser envoie tout le fichier dans l'Atlantique.
    return c.lng >= L93_BBOX.xMin && c.lng <= L93_BBOX.xMax &&
           c.lat >= L93_BBOX.yMin && c.lat <= L93_BBOX.yMax;
  }

  // Lambert 93 si TOUTES les coordonnées sont dans l'enveloppe. 🩸 Un fichier mixte (degrés ET mètres) est cassé :
  // le reprojeter à moitié donnerait une carte où l'erreur ne se voit pas.
  function detecterLambert93(normalise) {
    const tous = _toutesLesCoords(normalise);
    if (!tous.length) return false;
    for (let i = 0; i < tous.length; i++) {
      if (!_dansEnveloppeL93(tous[i])) return false;
    }
    return true;
  }

  // Reprojette EN PLACE. ⚠️ Rend le nombre de coordonnées converties : l'appelant DOIT l'annoncer (jamais de
  // correction silencieuse).
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

  // ── Validation du CRS : refus franc, jamais de correction silencieuse ──────────────────────
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
      // Lambert 93 reconnu → CONVERSION À PROPOSER (l'appelant décide, l'utilisateur est prévenu). ⚠️ Rien n'est
      // reprojeté ici : on dit seulement que c'est possible.
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
    // Tout dans les bornes : WGS84 plausible (un CRS géographique exotique reste indétectable sans métadonnée).
    return { ok: true, code: "wgs84", total: tous.length };
  }

  function _toutesLesCoords(n) {
    const out = [];
    (n.points || []).forEach(function(p) { out.push({ lat: p.lat, lng: p.lng }); });
    (n.lignes || []).forEach(function(l) { (l.coords || []).forEach(function(c) { out.push(c); }); });
    (n.polygones || []).forEach(function(z) { (z.coords || []).forEach(function(c) { out.push(c); }); });
    return out;
  }

  // ── Bornes ──────────────────────
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
    // 🩸 Étendue nulle (un seul point) : calibrage 2 points dégénéré (division par zéro dans buildTransform) →
    // fenêtre minimale de ~110 m.
    const EPS = 0.001;
    if (latMax - latMin < EPS) { latMin -= EPS / 2; latMax += EPS / 2; }
    if (lngMax - lngMin < EPS) { lngMin -= EPS / 2; lngMax += EPS / 2; }
    return { latMin: latMin, latMax: latMax, lngMin: lngMin, lngMax: lngMax, count: tous.length };
  }

  // ── Analyse des attributs (matière de l'écran de correspondance) ──────────────────────
  // On ne devine PAS la sémantique : colonnes classées par capacité à discriminer un type, valeurs distinctes
  // rendues, et l'utilisateur tranche (une heuristique seule se tromperait en silence sur un schéma inconnu).
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

    // Tri : nom évocateur d'abord, puis cardinalité de nomenclature (2 à 20 valeurs).
    colonnes.sort(function(a, b) {
      if (a.probableType !== b.probableType) return a.probableType ? -1 : 1;
      const sa = (a.nbDistinctes >= 2 && a.nbDistinctes <= 20) ? 0 : 1;
      const sb = (b.nbDistinctes >= 2 && b.nbDistinctes <= 20) ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return a.nbDistinctes - b.nbDistinctes;
    });
    return colonnes;
  }

  // Pré-remplissage de la correspondance par libellé normalisé. Une valeur non reconnue n'est jamais forcée : elle
  // reste sur le défaut.
  const SYNONYMES = {
    traces: {
      principal: "principal", principale: "principal", majeur: "principal", "rue": "principal",
      secondaire: "secondaire", secondaires: "secondaire",
      chemin: "chemin", sentier: "chemin", passage: "chemin",
      jonction: "jonction", puits: "jonction", escalier: "jonction"
    },
    // ⚠️ Préfixe `struct:` : ingest range l'objet dans les structures, pas les zones.
    structures: {
      // Défauts de terrain (décision produit) : dans un relevé SIG, « galerie » ou « pilier » est le CONTOUR relevé,
      // donc un FRONT DE TAILLE. Conséquence assumée : un polygone « pilier » devient un contour épais, pas une
      // surface pleine ; pour un vrai volume, `pilier-1` reste à un clic.
      galerie: "struct:front-1", galeries: "struct:front-1",
      galerie_tech: "struct:front-1", cheminement: "struct:front-1",
      front: "struct:front-1", fronts: "struct:front-1",
      frontdetaille: "struct:front-1", "frontdetaille1": "struct:front-1",
      pilier: "struct:front-1", piliers: "struct:front-1",
      // Formes EXPLICITES (« pilier-1 », « 1ère masse ») : l'intention est claire, respectée.
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

  // Valeurs distinctes d'une colonne VENTILÉES PAR FAMILLE de géométrie : « eau » sur des polygones propose des types
  // de ZONE. Agrégées comme dans analyserAttributs, on proposerait « principal » pour un polygone.
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

  // ── Une couleur par niveau ──────────────────────
  // Six niveaux superposés d'une seule teinte sont illisibles. Une entrée de légende custom par (famille, forme,
  // niveau), au format EXACT de LegendCustomization ({ id, category, label, geometry, lineColor, fillColor,
  // borderColor }), et les objets portent son id `cust-…` comme type : le mécanisme des types créés à la main.
  // Palette lisible sur fond sombre ; elle cycle au-delà de 8 niveaux plutôt que d'inventer une teinte illisible.
  const PALETTE_NIVEAUX = [
    "#8cb4ff", "#7ee0a0", "#f4c542", "#ff9f6b",
    "#e879c8", "#64d8d8", "#b79cff", "#9fd356"
  ];

  function _couleurNiveau(n, rang) {
    return PALETTE_NIVEAUX[((rang % PALETTE_NIVEAUX.length) + PALETTE_NIVEAUX.length) % PALETTE_NIVEAUX.length];
  }

  // 🩸 Id STABLE (pas le `cust-<ts>-<rnd>` de LegendCustomization) : deux imports du même fichier produisent les
  // mêmes types, sinon chaque réimport multiplie les entrées de légende.
  function _idNiveau(categorie, n) {
    return "cust-sig-" + categorie + "-n" + String(n).replace("-", "m");
  }

  // Routage libre : la GÉOMÉTRIE SIG ne dit pas ce que l'objet EST (un polygone peut être zone, pilier, mur ou front ;
  // une polyligne une galerie, un front ou un contour de zone non fermé). Le type choisi porte un préfixe de FAMILLE ;
  // sans préfixe, famille naturelle de la géométrie (ligne → tracé, polygone → zone).
  // 🩸 Déclaré ICI, avant les boucles de lignes et de polygones : plus bas, le const tombe en zone morte temporelle
  // (ReferenceError au premier tracé).
  const PREFIXES = { "struct:": "structures", "zone:": "zones", "trace:": "roads" };

  // { famille, type } depuis le choix de l'utilisateur.
  function _router(choisi, familleNaturelle) {
    const s = String(choisi || "");
    for (const p in PREFIXES) {
      if (s.startsWith(p)) return { famille: PREFIXES[p], type: s.slice(p.length) };
    }
    return { famille: familleNaturelle, type: s };
  }

  // Entrées de légende PRÉVISUALISÉES avant la génération, pour que l'écran SIG les propose à l'édition.
  // ⚠️ Même logique d'id et de couleur que _typeNiveau : on montre exactement ce qui sera produit.
  function previsualiserEntreesNiveaux(normalise, opts) {
    opts = opts || {};
    if (opts.couleurParNiveau !== true || !opts.cleNiveau) return [];

    // 🩸 Famille rejouée avec le MÊME routeur et le MÊME mapping qu'ingest, jamais déduite de la seule géométrie
    // (sinon on annonce des tracés et des zones quand l'utilisateur a choisi des structures).
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
        // ⚠️ Catégorie de LÉGENDE : `roads` se dit `traces` côté LegendCustomization.
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

    // Couleurs une fois tous les niveaux connus : le rang suit l'ordre d'apparition GLOBAL.
    out.forEach(function (e) {
      const c = _couleurNiveau(e._niveau, vus.indexOf(e._niveau));
      e.lineColor = c;
      if (!e._estLigne) { e.fillColor = c; e.borderColor = c; }
      delete e._niveau; delete e._estLigne;
    });
    return out;
  }

  // ── Ingestion → objets MyKTAMap en coordonnées PLAN ──────────────────────
  // ⚠️ `transform` vient de KmzExport.buildTransform (la math partagée par KMZ, Vue OSM et Mode Secours).
  function ingest(normalise, transform, opts) {
    opts = opts || {};
    const tagDefaut   = opts.pointTag || "default";
    const typeDefaut  = opts.roadType || "secondaire";
    const zoneDefaut  = opts.zoneType || "remblais";
    const cleType     = opts.cleType  || null;         // colonne SIG choisie
    const mapTraces   = opts.mapTraces || {};
    const mapZones    = opts.mapZones  || {};
    const mapTags     = opts.mapTags   || {};
    // ⚠️ Le niveau se lit PAR OBJET dans la colonne `opts.cleNiveau` ; `opts.level` n'est que le repli des objets
    // à colonne vide ou illisible (un entier unique mettrait tout un relevé multi-niveaux à plat).
    const cleNiveau   = opts.cleNiveau || null;
    const niveauFixe  = Number.isInteger(opts.level) ? opts.level : null;

    // Premier entier signé trouvé (-3, "-3", "niveau3", "N-3", "niveau -3"…). 🩸 Illisible → repli, JAMAIS 0 : sinon
    // une valeur exotique envoie l'objet à la surface en silence.
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

    // Types par niveau : opt-in.
    const couleurParNiveau = opts.couleurParNiveau === true;
    // Entrées PRÉ-ÉDITÉES dans l'écran SIG (libellé, couleur), utilisées TELLES QUELLES. Indexées par id :
    // _typeNiveau fabrique le même id de façon déterministe et retrouve l'entrée au lieu d'en créer une.
    const entreesPreEditees = {};
    (opts.customEntries || []).forEach(function (e) {
      if (e && e.id) entreesPreEditees[e.id] = e;
    });
    const customEntries = [];
    const _dejaVu = {};
    // Rang d'apparition : la palette suit l'ordre des niveaux rencontrés, pas leur valeur (-3 à -8 démarre sur la
    // 1re couleur).
    const _rangs = {};
    let _rangSuivant = 0;

    // Type custom propre au niveau de l'objet ; type inchangé si option OFF ou objet sans niveau.
    // 🩸 Pour un type CUSTOM, structures.js > _isPolylineType lit `entry.geometry === "polyline"` dans la légende :
    // sans ce champ, un front repeint par niveau redevient un POLYGONE PLEIN. On garde le type de base pour le
    // déduire.
    const TYPES_POLYLIGNE = ["front-1", "front-2"];   // cf. STRUCTURE_TYPES_POLYLINE

    function _typeNiveau(typeBase, categorie, lvl, libelleBase) {
      if (!couleurParNiveau || lvl === null || typeof lvl !== "number") return typeBase;
      const estLigne = (categorie === "traces") || TYPES_POLYLIGNE.indexOf(typeBase) >= 0;
      // Un id par (catégorie, FORME, niveau) : un front (ligne) et un pilier (polygone) ne partagent pas d'entrée.
      const id = _idNiveau(categorie + (estLigne ? "-l" : ""), lvl);
      if (!_dejaVu[id]) {
        // Entrée éditée prioritaire (libellé, couleur de l'user) ; `geometry` calculée gardée si absente (l'éditeur
        // de légende ne l'expose pas, et c'est elle qui décide ligne ou polygone).
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
                    // ⚠️ Lu par structures.js pour trancher ligne/polygone.
                    geometry: estLigne ? "polyline" : "polygon" };
        e.lineColor = c;
        // Remplissage pour ce qui est fermé seulement (un front avec fillColor paraît plein dans la légende).
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
      // Un front de taille est une STRUCTURE en polyligne (structures.js > STRUCTURE_TYPES_POLYLINE) : même routeur.
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

    // Polygones : zone OU structure (un polygone SIG est très souvent un PILIER). Le préfixe `struct:` permet à UN
    // MÊME select de proposer les deux sans ambiguïté ; seul l'utilisateur sait lequel.

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
      // Entrées de légende fabriquées pour les niveaux (vide si option OFF).
      customEntries: customEntries,
      stats: { points: points.length, roads: roads.length, zones: zones.length,
               structures: structures.length,
               // Répartition par niveau affichée AVANT de générer : un import multi-niveaux retombé à plat se voit.
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

  // Dimensions finales du canvas : la largeur demandée, la hauteur déduite du terrain, et une ALERTE de surface
  // (seuils ALERTE_CANVAS_MPX_*). Deux risques : le pipeline tient DEUX bitmaps (≈ 1 Go à 117 Mpx, toBlob peut
  // rendre null sans un mot) ; iOS Safari plafonne vers 16,7 Mpx (fond vide sur iPhone) [estimation non testée].
  // ⚠️ `alerte` : null | "ios" | "ram" — on qualifie, jamais on ne rogne ; l'appelant décide.
  function dimensionsCanvas(bounds, W) {
    W = Math.max(64, W || 4000);
    const H = calculerHauteurCanvas(bounds, W);
    const mpx = (W * H) / 1e6;
    let alerte = null;
    if (mpx > ALERTE_CANVAS_MPX_RAM)      alerte = "ram";
    else if (mpx > ALERTE_CANVAS_MPX_IOS) alerte = "ios";
    return { w: W, h: H, mpx: mpx, alerte: alerte };
  }

  // Hauteur du canvas déduite de la forme du terrain. ⚠️ Une seule implémentation, exposée : le générateur et
  // l'écran d'import (valeur affichée avant de générer) doivent annoncer la même taille.
  function calculerHauteurCanvas(bounds, W) {
    if (!bounds || !window.KmzExport || !window.KmzExport.buildTransform) return W;
    const _mesurer = function (w, h) {
      // ⚠️ Même modèle que genererZipMyktamap (calage "local"), sinon la hauteur annoncée et la réelle divergent.
      const t = window.KmzExport.buildTransform(
        { x: 0, y: h }, { x: w, y: 0 },
        { lat: bounds.latMin, lng: bounds.lngMin },
        { lat: bounds.latMax, lng: bounds.lngMax }, null, null, window.KmzExport.MODELE_LOCAL);
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
    // Plafond de HAUTEUR seul (bande très étroite → canvas démesuré). 🩸 Jamais de plafond de SURFACE ici : rogner la
    // hauteur sans la largeur ÉCRASE le terrain (ratio 1,17 → 0,16).
    return Math.max(64, Math.min(h, 30000));
  }

  // ── Légende du plan (plan-config.json > plan.customLegend) ──────────────────────
  // 🩸 TOUT l'état édité voyage : labels, hidden, colors, borders et les entrées ajoutées À LA MAIN (ingest ne
  // recopie que les ids qu'il fabrique). Sans ça, renommer, masquer ou recolorer un type dans l'écran SIG est perdu
  // à la génération, sans un mot.
  // Écartées : les entrées `cust-sig-…` que CETTE génération n'a pas produites (routage précédent, couleur par
  // niveau décochée) — des types qu'aucun objet ne porte. Une entrée manuelle n'a pas ce préfixe et reste.
  // Pas repris (voulu) : `removedPlan`, qui vise le plan COURANT d'une session ; un plan fabriqué n'en a pas.
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
    // Rien de personnalisé = pas de section (un customLegend vide serait relu à chaque boot pour rien).
    const vide = entrees.length === 0
      && Object.keys(legende.labels).length === 0
      && Object.keys(legende.hidden).length === 0
      && Object.keys(legende.colors).length === 0
      && Object.keys(legende.borders).length === 0;
    return vide ? null : legende;
  }

  // ── Génération du ZIP MyKTAMap ──────────────────────
  // Comme gpxImport : canvas vierge + calibrage 2 points sur les bornes (bas-gauche ↔ latMin/lngMin, haut-droit ↔
  // latMax/lngMax). Une vraie image se pose ensuite via « Modifier un plan ».
  async function genererZipMyktamap(opts) {
    if (typeof JSZip === "undefined") throw new Error("sig.err.jszip");
    if (!opts || !opts.normalise || !opts.bounds) throw new Error("sig.err.genZipReq");
    if (!window.KmzExport || !window.KmzExport.buildTransform) throw new Error("sig.err.kmzExportMissing");
    if (!window.GpxImport || typeof window.GpxImport.genererCanvasVierge !== "function") {
      throw new Error("sig.err.gpxImportMissing");
    }

    // 🩸 La hauteur est DÉDUITE, jamais saisie : buildTransform à 2 points est une SIMILITUDE (rotation + échelle
    // UNIFORME). Coins opposés calés sur un canvas aux mauvaises proportions → elle FAIT TOURNER le rectangle et le
    // contenu sort du cadre des deux côtés (plus de 1 000 px mesurés), sans avertissement.
    // Le ratio ne se calcule pas à la main (la projection n'est pas une règle de trois, et la mesure est faussée par
    // la rotation à annuler) : calculerHauteurCanvas CONVERGE (mesure, ajuste, remesure ; ~6 tours jusqu'à 0 px).
    const _dim = dimensionsCanvas(opts.bounds, opts.canvasWidth || 4000);
    const W = _dim.w, H = _dim.h;

    const pA_plan = { x: 0, y: H };
    const pB_plan = { x: W, y: 0 };
    const pA_gps  = { lat: opts.bounds.latMin, lng: opts.bounds.lngMin };
    const pB_gps  = { lat: opts.bounds.latMax, lng: opts.bounds.lngMax };

    let transform;
    try {
      // Calage "local" (plan tangent) : les objets sont posés par CE transform, l'aller-retour reste exact.
      transform = window.KmzExport.buildTransform(pA_plan, pB_plan, pA_gps, pB_gps, null, null,
                                                  window.KmzExport.MODELE_LOCAL);
      transform.imageW = W;
      transform.imageH = H;
    } catch(e) {
      const err = new Error("sig.err.autoCalib"); err.detail = e.message; throw err;
    }

    const ingested = ingest(opts.normalise, transform, opts.mapping || {});

    // Canvas vierge de gpxImport, réutilisé (un seul générateur de fond).
    const baseBlob = await window.GpxImport.genererCanvasVierge(W, H, opts.canvasColor || "sepia");

    const zip = new JSZip();
    zip.file("data/baseImage.png", baseBlob);

    // 🩸 Tuilage V2 obligatoire pour la Vue OSM du MODE PLAN (osmView.js refuse tout plan non tuilé : l'image
    // entière saturait le GPU mobile). La Vue OSM du HOME accepte le V1 (données sans fond) : ne pas confondre.
    // Un plan SIG, géoréférencé par calcul, est le meilleur candidat pour la Vue OSM.
    // ⚠️ Tuileur du générateur réutilisé (_genererTuilesV2) : il définit format, pyramide et manifeste, une seconde
    // implémentation dériverait.
    let tilingManifest = null;
    try {
      if (typeof _genererTuilesV2 === "function") {
        // 3e argument : progression (une dizaine de secondes sur un grand canvas ; sans retour, l'app semble figée).
        // 4e : fond TOUJOURS uni (genererCanvasVierge), donc toutes les tuiles pleines sont identiques.
        const v2 = await _genererTuilesV2(baseBlob, zip, opts.onProgress || null, true);
        if (v2 && v2.manifest) tilingManifest = v2.manifest;
      } else {
        console.warn("[SigImport] _genererTuilesV2 indisponible — plan généré en V1 " +
                     "(la Vue OSM du mode plan le refusera).");
      }
    } catch(e) {
      // Dégradation assumée : un plan V1 utilisable vaut mieux que rien (retuilable via « Modifier un plan »).
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
        // 🩸 Préfixe `data/` OBLIGATOIRE (le fichier est dans `data/` du ZIP) : sans lui, l'import local passe
        // (findMatchingFile cherche par nom de base) mais le mode serveur, strict, fait 404.
        baseImage:   "data/baseImage.png",
        georef: {
          pointA: { x: pA_plan.x, y: pA_plan.y, lat: pA_gps.lat, lng: pA_gps.lng },
          pointB: { x: pB_plan.x, y: pB_plan.y, lat: pB_gps.lat, lng: pB_gps.lng },
          modele: window.KmzExport.MODELE_LOCAL
        }
      },
      tracking: {
        startX: Math.round(W / 2), startY: Math.round(H / 2),
        // 🩸 Échelle = 1 / transform.metresParPixel (déjà calculé par buildTransform), jamais une valeur en dur : un
        // 50 px/m fixe était faux d'un facteur 15 sur un relevé réel. 50 n'est que le repli si le transform manque.
        scale: (transform && transform.metresParPixel > 0)
               ? Math.round((1 / transform.metresParPixel) * 1000) / 1000
               : 50,
        // Ni stepLength, ni stepThreshold, ni stepCooldown : réglages de la personne, globaux (config.js).
      },
      icons: { default: "icon/iconetrack.png", track: "icon/iconetrack.png" },
      imageLayers: [],
      dataLayers: [{ id: "sig", label: opts.layerLabel || "Import SIG", file: "data/sig.json", visible: true }]
    };
    if (opts.multiLevel === true) planConfig.plan.multiLevel = true;
    // Étiquettes du Générateur (déjà normalisées par PlanRegistry.normaliserTags) ; absentes = champ absent.
    if (Array.isArray(opts.tags) && opts.tags.length) planConfig.plan.tags = opts.tags.slice(0, 12);
    // Profondeurs proposées d'office, mêmes défauts que le Générateur (config.js > proposerProfondeurs).
    // 🩸 SAUF le niveau du TOPO HISTORIQUE : convention d'empilement de deux relevés du même endroit, pas un étage.
    // Une altitude fausserait tout profil qui le traverse → `null` (« sans profondeur »).
    if (opts.multiLevel === true && typeof window.proposerProfondeurs === "function") {
      const _niv = [];
      (ingested.roads || []).concat(ingested.zones || [], ingested.structures || [])
        .forEach(function (o) {
          if (o && Number.isInteger(o.level) && _niv.indexOf(o.level) < 0) _niv.push(o.level);
        });
      if (_niv.length) {
        const _t = window.proposerProfondeurs(_niv);
        // Niveau de l'historique : `opts.historiqueNiveau`, sinon +1 (rangé au-dessus de tout par le découpage).
        const _histo = Number.isInteger(opts.historiqueNiveau) ? opts.historiqueNiveau : 1;
        if (String(_histo) in _t) _t[String(_histo)] = null;
        planConfig.plan.niveauxProfondeur = _t;
      }
    }
    // Légende embarquée au format EXACT de LegendCustomization.getSessionState() (couleurs par niveau + tout l'état
    // édité, cf. assemblerLegendePlan).
    const legendePlan = assemblerLegendePlan(
      (opts.mapping && opts.mapping.planLegend) || opts.planLegend || null,
      ingested.customEntries
    );
    if (legendePlan) planConfig.plan.customLegend = legendePlan;

    // 🩸 Les DEUX marqueurs : `plan.tiledV2` ET la section `tiling` (osmView > _isV2Plan vérifie les deux, plus
    // minNativeZoom et tileSize).
    if (tilingManifest) {
      planConfig.plan.tiledV2 = true;
      planConfig.tiling = tilingManifest;
    }

    // Un uid sur chaque objet du plan fabriqué (docs/ETUDE_UID.md).
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
      structures: ingested.structures || []
    }));   // pas de pretty-print : ×2,7 en taille, que le DEFLATE en JS pur repaierait
    zip.file("plan-config.json", JSON.stringify(planConfig, null, 2));

    // Icône du tracker embarquée (sinon le plan importé n'a pas de marqueur de position).
    try {
      const r = await fetch("icon/iconetrack.png");
      if (r && r.ok) {
        const b = await r.blob();
        if (b && b.size > 0) zip.file("icon/iconetrack.png", b);
      }
    } catch(e) {}

    // DEFLATE niveau 3 (au lieu de 6) : les tuiles sont déjà compressées, seul le JSON gagne, et le niveau 3 en
    // récupère presque tout pour une fraction du temps.
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
    // L93 exposé pour scripts/check-lambert93.js (origine exacte, échelle 1 aux parallèles standard, conformité).
    detecterLambert93:  detecterLambert93,
    reprojeterLambert93: reprojeterLambert93,
    L93:                L93,
    // ⚠️ Web Mercator, exposé pour js/tiffGeoref.js et scripts/check-geotiff.js : SEULE implémentation du projet.
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
