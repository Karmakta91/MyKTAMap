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
//   degrés. Aucune lib de reprojection n'est vendored (pas de proj4).
//   → On REFUSE FRANCHEMENT avec un message actionnable plutôt que de laisser
//     l'utilisateur atterrir au milieu de l'Atlantique sans comprendre.
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

  // Au-delà, on refuse d'ingérer : un fichier SIG de cette taille ferait
  // fondre le navigateur au rendu Leaflet bien avant l'export.
  const MAX_FEATURES = 20000;

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
    const niveau      = Number.isInteger(opts.level) ? opts.level : null;

    if (!window.KmzExport || typeof window.KmzExport.gpsToPlan !== "function") {
      throw new Error("sig.err.kmzExportMissing");
    }
    const g2p = function(lat, lng) { return window.KmzExport.gpsToPlan(transform, lat, lng); };

    function _valeurType(props) {
      if (!cleType || !props) return null;
      const k = _trouverCle(props, cleType);
      return (k && props[k] != null) ? String(props[k]).trim() : null;
    }

    const points = [], roads = [], zones = [];
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
      if (niveau !== null) o.level = niveau;
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
      const o = { type: (v && mapTraces[v]) || typeDefaut, points: pts };
      if (l.nom) o.note = l.nom;
      if (niveau !== null) o.level = niveau;
      roads.push(o);
    });

    (normalise.polygones || []).forEach(function(z) {
      const pts = [];
      (z.coords || []).forEach(function(c) {
        const xy = g2p(c.lat, c.lng);
        if (xy) pts.push({ x: Math.round(xy.x), y: Math.round(xy.y) });
      });
      if (pts.length < 3) return;
      const v = _valeurType(z.props);
      const o = { type: (v && mapZones[v]) || zoneDefaut, points: pts };
      if (z.nom) o.note = z.nom;
      if (niveau !== null) o.level = niveau;
      zones.push(o);
    });

    return {
      points: points, roads: roads, zones: zones,
      stats: { points: points.length, roads: roads.length, zones: zones.length }
    };
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

    const W = opts.canvasWidth  || 4000;
    const H = opts.canvasHeight || 4000;

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

    const planConfig = {
      plan: {
        name:        opts.planName    || "Import SIG",
        version:     opts.planVersion || "v1",
        author:      opts.planAuthor  || "",
        imageWidth:  W,
        imageHeight: H,
        baseImage:   "baseImage.png",
        georef: {
          pointA: { x: pA_plan.x, y: pA_plan.y, lat: pA_gps.lat, lng: pA_gps.lng },
          pointB: { x: pB_plan.x, y: pB_plan.y, lat: pB_gps.lat, lng: pB_gps.lng }
        }
      },
      tracking: {
        startX: Math.round(W / 2), startY: Math.round(H / 2),
        scale: 50, stepLength: 0.75, stepThreshold: 1.2, stepCooldown: 280
      },
      icons: { default: "icon/iconetrack.png", track: "icon/iconetrack.png" },
      imageLayers: [],
      dataLayers: [{ id: "sig", label: opts.layerLabel || "Import SIG", file: "sig.json", visible: true }]
    };
    if (opts.multiLevel === true) planConfig.plan.multiLevel = true;

    zip.file("data/sig.json", JSON.stringify({
      points: ingested.points,
      roads:  ingested.roads,
      zones:  ingested.zones
    }, null, 2));
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

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    return { blob: blob, stats: ingested.stats, transform: transform };
  }

  window.SigImport = {
    FORMATS_ACCEPTES:   FORMATS_ACCEPTES,
    detecterFormat:     detecterFormat,
    parseGeoJson:       parseGeoJson,
    parseKml:           parseKml,
    parseFichier:       parseFichier,
    validerCrs:         validerCrs,
    calculerBounds:     calculerBounds,
    analyserAttributs:  analyserAttributs,
    valeursParFamille:  valeursParFamille,
    proposerMapping:    proposerMapping,
    ingest:             ingest,
    genererZipMyktamap: genererZipMyktamap
  };

  console.log("[SigImport] Module chargé — API window.SigImport prête");
})();
