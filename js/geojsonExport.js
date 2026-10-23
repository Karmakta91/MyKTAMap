/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// geojsonExport.js — objets du plan calé → GeoJSON (FeatureCollection) pour un SIG (QGIS, ArcGIS…).
// Mêmes objets et mêmes filtres que le KMZ (familles, types, niveaux ; calques de données et types
// personnalisés compris) : libellés, géométrie des structures et couleurs viennent de window.KmzExport
// (libelleType, estLigneStructure, styleResolu), aucune règle recopiée.
// Projection : "2154" (Lambert 93, défaut) ou "4326" (WGS84). Plan → WGS84 par le calage (planToGps),
// puis WGS84 → Lambert 93 par window.SigImport.L93 (seule copie des maths).
// ⚠️ RFC 7946 impose le WGS84 sans membre `crs`. En Lambert 93 le fichier porte le membre `crs` de
//   GeoJSON 2008 (urn EPSG 2154) et le suffixe « _L93 » : sans lui, QGIS / GDAL le liraient comme des
//   degrés et poseraient tout hors de la Terre, sans erreur. En WGS84 : conforme RFC 7946, sans `crs`.
// Expose : window.GeojsonExport { generer(opts) → objet FeatureCollection, nomFichier(plan, epsg) }
// Garde-fou : scripts/check-export-sig.js · Doc : docs/architecture/exports.md

(function() {
  "use strict";

  const EPSG_L93 = 2154, EPSG_WGS84 = 4326;

  function _entierOu(v, def) { return Number.isInteger(v) ? v : def; }

  // Libellé de légende d'un type (catégorie "icones" | "traces" | "zones" | "structures") : celui que montre
  // ≡ Légende (session > plan > défaut traduit), sinon celui du KML (entrée personnalisée ou id brut).
  function _libelle(categorie, cle) {
    if (cle == null) return null;
    const LC = window.LegendCustomization;
    if (LC && typeof LC.getLabel === "function") {
      try { const l = LC.getLabel(categorie, cle); if (l && l !== cle) return String(l); } catch (e) { /* repli */ }
    }
    return window.KmzExport.libelleType(cle);
  }

  // Arrondis : 8 décimales de degré ≈ 1 mm ; 3 décimales de mètre = 1 mm. Au-delà, du bruit qui alourdit.
  function _projeteur(transform, epsg) {
    const KE = window.KmzExport;
    if (epsg === EPSG_WGS84) {
      return function(x, y) {
        const ll = KE.planToGps(transform, x, y);
        return [Number(ll.lng.toFixed(8)), Number(ll.lat.toFixed(8))];
      };
    }
    const L93 = window.SigImport && window.SigImport.L93;
    if (!L93) throw new Error("SigImport.L93 absent");
    return function(x, y) {
      const ll = KE.planToGps(transform, x, y);
      const p = L93.versL93(ll.lat, ll.lng);
      return [Number(p.x.toFixed(3)), Number(p.y.toFixed(3))];
    };
  }

  // opts = { transform, epsg (2154 | 4326), planName, include, levels, data } — `include`, `levels` et
  // `data` ont EXACTEMENT la forme passée à KmzExport.genererKml (cf. sessionExporter > _kmzSelection).
  function generer(opts) {
    const KE = window.KmzExport;
    if (!KE || !opts || !opts.transform) throw new Error("transform requis");
    const epsg = (opts.epsg === EPSG_WGS84) ? EPSG_WGS84 : EPSG_L93;
    const pt = _projeteur(opts.transform, epsg);
    const inc = opts.include || {};
    const data = opts.data || {};

    // Niveaux : même règle que genererKml (multi-niveau sans niveau choisi = niveau 0 seul).
    const mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    const niveaux = mlOn ? (opts.levels instanceof Set ? opts.levels : new Set([0])) : null;
    const passe = function(lvl) { return !niveaux || niveaux.has(_entierOu(lvl, 0)); };

    const features = [];
    const ajouter = function(geometrie, props, uid) {
      const f = { type: "Feature", geometry: geometrie, properties: props };
      if (uid) f.id = String(uid);
      features.push(f);
    };
    const proprietes = function(famille, type, libelle, o, style) {
      const p = {
        famille: famille,
        type: type,
        libelle: libelle,
        nom: (o && o.nom) ? String(o.nom) : null,
        niveau: _entierOu(o && o.level, null),
        note: (o && o.description) ? String(o.description) : null,
        uid: (o && o.uid) ? String(o.uid) : null,
        couleur: (style && style.color) || null
      };
      if (style && style.fillColor && !style.isPolyline) p.remplissage = style.fillColor;
      return p;
    };
    const ligne = function(points) {
      return { type: "LineString", coordinates: points.map(function(q) { return pt(q.x, q.y); }) };
    };
    // Anneau fermé (premier point répété) ; un anneau déjà fermé n'est pas doublé.
    const polygone = function(points) {
      const c = points.map(function(q) { return pt(q.x, q.y); });
      const a = c[0], z = c[c.length - 1];
      if (a[0] !== z[0] || a[1] !== z[1]) c.push(a.slice());
      return { type: "Polygon", coordinates: [c] };
    };
    const premierTag = function(p) {
      return (Array.isArray(p.tags) && p.tags.length > 0) ? p.tags[0] : "__untagged__";
    };

    if (inc.points && Array.isArray(data.editorPoints)) {
      const tags = (inc.pointTagsSet instanceof Set) ? inc.pointTagsSet : null;
      data.editorPoints.forEach(function(p) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        if (tags && !tags.has(premierTag(p))) return;
        if (!passe(p.level)) return;
        const tag = premierTag(p);
        const t = (tag === "__untagged__") ? null : tag;
        ajouter({ type: "Point", coordinates: pt(p.x, p.y) },
                proprietes("point", t, _libelle("icones", t), p, null), p.uid);
      });
    }

    const filtre = function(set, type) { return !(set instanceof Set) || set.has(type); };

    if (inc.roads && Array.isArray(data.roads)) {
      data.roads.forEach(function(r) {
        if (!r || r.type === "itinerary" || r.type === "jonction") return;
        if (!filtre(inc.roadTypesSet, r.type) || !passe(r.level)) return;
        if (!Array.isArray(r.points) || r.points.length < 2) return;
        ajouter(ligne(r.points), proprietes("trace", r.type, _libelle("traces", r.type), r,
                KE.styleResolu("traces", r.type)), r.uid);
      });
    }

    if (inc.jonctions && mlOn && Array.isArray(data.roads)) {
      data.roads.forEach(function(r) {
        if (!r || r.type !== "jonction") return;
        if (!niveaux.has(_entierOu(r.fromLevel, 0))) return;
        if (!Array.isArray(r.points) || r.points.length < 2) return;
        const p = proprietes("jonction", "jonction", _libelle("traces", "jonction"), r, KE.styleResolu("traces", "jonction"));
        p.niveau_depart = _entierOu(r.fromLevel, null);
        p.niveau_arrivee = _entierOu(r.toLevel, null);
        ajouter(ligne(r.points), p, r.uid);
      });
    }

    if (inc.zones && Array.isArray(data.zones)) {
      data.zones.forEach(function(z) {
        if (!z || !filtre(inc.zoneTypesSet, z.type) || !passe(z.level)) return;
        if (!Array.isArray(z.points) || z.points.length < 3) return;
        ajouter(polygone(z.points), proprietes("zone", z.type, _libelle("zones", z.type), z,
                KE.styleResolu("zones", z.type)), z.uid);
      });
    }

    if (inc.structures && Array.isArray(data.structures)) {
      data.structures.forEach(function(s) {
        if (!s || !filtre(inc.structureTypesSet, s.type) || !passe(s.level)) return;
        const pts = Array.isArray(s.points) ? s.points : [];
        const enLigne = KE.estLigneStructure(s);
        if (pts.length < (enLigne ? 2 : 3)) return;
        ajouter(enLigne ? ligne(pts) : polygone(pts), proprietes("structure", s.type, _libelle("structures", s.type), s,
                KE.styleResolu("structures", s.type)), s.uid);
      });
    }

    if (inc.itineraire && Array.isArray(data.roads)) {
      data.roads.forEach(function(r) {
        if (!r || r.type !== "itinerary" || !Array.isArray(r.points) || r.points.length < 2) return;
        ajouter(ligne(r.points), proprietes("itineraire", "itinerary", _libelle("traces", "itinerary"), r,
                KE.styleResolu("traces", "itinerary")), r.uid);
      });
    }

    const fc = { type: "FeatureCollection", name: String(opts.planName || "MyKTAMap") };
    if (epsg === EPSG_L93) {
      fc.crs = { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::2154" } };
    }
    fc.features = features;
    return fc;
  }

  function nomFichier(planName, epsg) {
    const base = String(planName || "plan").replace(/[^a-z0-9]+/gi, "_");
    const proj = (epsg === EPSG_WGS84) ? "WGS84" : "L93";
    return "MyKTAMap_" + base + "_" + new Date().toISOString().slice(0, 10) + "_" + proj + ".geojson";
  }

  window.GeojsonExport = { generer: generer, nomFichier: nomFichier, EPSG_L93: EPSG_L93, EPSG_WGS84: EPSG_WGS84 };
  console.log("[GeojsonExport] module chargé");
})();
