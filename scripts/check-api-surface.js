// check-api-surface.js — garde-fou BLOQUANT : CHARGE réellement les modules IIFE dans un vm et
// vérifie que chaque méthode annoncée existe et se comporte (userProfile, styleResolver,
// legendCustomization, osmMesure, profondeurNiveaux, convertirObjet, loi de largeur des fronts).
// 🩸 `node -c` ne valide QUE la syntaxe : une constante supprimée mais encore citée dans le bloc
// d'exports passe `node -c` et meurt en ReferenceError au chargement navigateur (module entier
// perdu, méthodes disparues des exports sans signal).
const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ⚠️ `prealables` : fichiers chargés dans le MÊME contexte avant celui-ci, dès qu'un module en
// interroge un autre au chargement (legendCustomization → styleResolver) ; sinon la dépendance
// est silencieusement absente.
function charger(fichier, nomGlobal, prealables) {
  const win = {
    console: { log(){}, warn(){}, error(){} },
    indexedDB: { open() { return { onupgradeneeded: null, onsuccess: null, onerror: null }; } },
    I18n: { t: k => k, has: () => false },
    document: { createElement: () => ({ getContext: () => ({ drawImage(){} }), toBlob(){} }) },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL(){} },
    Image: function(){},
    navigator: {}
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const PREAMBULE = "var window = this; var document = this.document; var indexedDB = this.indexedDB;";
  try {
    (prealables || []).forEach(function(p) {
      vm.runInContext(PREAMBULE + fs.readFileSync(p, "utf8"), ctx);
    });
    vm.runInContext(PREAMBULE + fs.readFileSync(fichier, "utf8"), ctx);
  } catch (e) {
    t(fichier + " se charge sans erreur", false);
    console.log("   ↳ " + e.name + " : " + e.message);
    return null;
  }
  t(fichier + " se charge sans erreur", true);
  // `__win` : certains modules exposent des fonctions libres (window.ktaResolveStyle).
  const api = win[nomGlobal];
  if (api && typeof api === "object") api.__win = win;
  return api;
}

// ───────── largeur des fronts : UNE loi, TROIS consommateurs ─────────
// Mode plan, export PNG/PDF (échelle du plan) et Vue OSM (résolution Web Mercator) donnent la MÊME
// largeur à densité égale : une seule formule, trois copies dériveraient.
(function () {
  const src = fs.readFileSync("js/structures.js", "utf8");
  const a = src.indexOf("const FRONT_LARGEUR_M");
  const b = src.indexOf("function majLargeurFronts()");
  if (a < 0 || b < 0) { t("largeur fronts : bloc de la loi localisé", false); return; }
  const win = { APP_CONFIG: { scale: 2.764 } };   // px/m d'un relevé réel
  const ctx = vm.createContext({ window: win, Math: Math, Number: Number, console: { log(){} } });
  try { vm.runInContext("var window = this.window;" + src.slice(a, b), ctx); }
  catch (e) { t("largeur fronts : la loi s'évalue", false); return; }
  t("largeur fronts : la loi s'évalue", true);
  const map = function (z, lat) {
    return { getZoom: function () { return z; }, getCenter: function () { return { lat: lat }; } };
  };

  // Résolution Web Mercator : valeur de référence connue, pas déduite du code.
  t("px/m : équateur au zoom 0 = 1/156543 (valeur canonique)",
    Math.abs(win.ktaPxParMetreOsm(map(0, 0)) - 1 / 156543.03392804097) < 1e-12);
  const r45 = win.ktaPxParMetreOsm(map(10, 45)), r0 = win.ktaPxParMetreOsm(map(10, 0));
  t("px/m : la LATITUDE compte — 45°N vaut 1/cos(45) fois l'équateur",
    Math.abs(r45 / r0 - 1 / Math.cos(45 * Math.PI / 180)) < 1e-9);

  // 🩸 Balayer PLUSIEURS densités, bornes comprises : une copie qui dérive sur un plafond (12 px au
  // lieu de 14) concorde partout entre les bornes et passerait sur un seul échantillon.
  const DENSITES = [0.005, 0.5, 1, 2.764, 9, 12, 50, 500];
  const divergentes = DENSITES.filter(function (d) {
    // Même densité : ratio du mode plan (échelle 2,764 px/m × ratio) vs px/m de la Vue OSM.
    return win.ktaLargeurFrontPourRatio(d / 2.764) !== win.ktaLargeurFrontPourPxParMetre(d);
  });
  t("largeur : plan et Vue OSM concordent sur " + DENSITES.length + " densités, bornes comprises",
    divergentes.length === 0);
  t("largeur : plus de pixels par mètre = trait plus large",
    win.ktaLargeurFrontPourPxParMetre(10) > win.ktaLargeurFrontPourPxParMetre(1));
  t("largeur : bornée à 14 px (au-delà c'est un pâté)",
    win.ktaLargeurFrontPourPxParMetre(1000) === 14);
  t("largeur : plancher à 1 px (invisible serait pire)",
    win.ktaLargeurFrontPourPxParMetre(0.01) === 1);
  t("largeur : densité nulle → null, aucune largeur inventée",
    win.ktaLargeurFrontPourPxParMetre(0) === null);
  t("px/m : sans carte → null", win.ktaPxParMetreOsm(null) === null);
})();

// ───────── osmMesure.js ─────────
// ⚠️ Confronté à des VALEURS CONNUES (1° de latitude ≈ 111,2 km, de longitude à 45°N ≈ 78,6 km),
// jamais au code lui-même : un test qui se compare à ses propres suppositions ne prouve rien.
(function () {
  const OM = charger("js/osmMesure.js", "OsmMesure");
  if (!OM) return;
  const w = OM.__win;
  // Sans Leaflet : un `distanceTo` géodésique INDÉPENDANT du code testé.
  function LL(lat, lng) {
    return { lat: lat, lng: lng, distanceTo: function (o) {
      const R = 6371008.8, r = Math.PI / 180;
      const dLat = (o.lat - lat) * r, dLng = (o.lng - lng) * r;
      const a = Math.pow(Math.sin(dLat / 2), 2) +
                Math.cos(lat * r) * Math.cos(o.lat * r) * Math.pow(Math.sin(dLng / 2), 2);
      return 2 * R * Math.asin(Math.sqrt(a));
    } };
  }
  w.L = { latLng: function (a, b) { return LL(a, b); } };

  let d = OM._distance([LL(44, 0), LL(45, 0)]);
  t("mesure OSM : 1° de latitude ≈ 111,2 km", Math.abs(d - 111195) < 200);
  d = OM._distance([LL(45, 0), LL(45, 1)]);
  t("mesure OSM : 1° de longitude à 45°N ≈ 78,6 km", Math.abs(d - 78626) < 400);
  d = OM._distance([LL(44.8, -0.25), LL(44.801, -0.25), LL(44.802, -0.25)]);
  t("mesure OSM : les segments se cumulent", Math.abs(d - 222.4) < 2);
  t("mesure OSM : un seul point → 0", OM._distance([LL(44, 0)]) === 0);

  const s = OM._surface([LL(44.80, -0.25), LL(44.80, -0.24), LL(44.81, -0.24), LL(44.81, -0.25)]);
  const att = (0.01 * 111195) * (0.01 * 111195 * Math.cos(44.805 * Math.PI / 180));
  t("mesure OSM : surface d'un carré de 0,01° (1 % près)", Math.abs(s - att) / att < 0.01);
  const s2 = OM._surface([LL(44.81, -0.25), LL(44.81, -0.24), LL(44.80, -0.24), LL(44.80, -0.25)]);
  t("mesure OSM : le sens de parcours ne change pas la surface", Math.abs(s - s2) < 1);
  t("mesure OSM : moins de 3 points → surface nulle", OM._surface([LL(44, 0), LL(45, 0)]) === 0);
})();

// ───────── profondeurNiveaux.js (profil en long) ─────────
// ⚠️ Un point de niveau INDÉTERMINÉ (milieu de jonction, un puits) s'interpole ; un niveau SANS
// PROFONDEUR en bout de chemin ne s'extrapole PAS (un +1 d'import SIG est une convention
// d'empilement, pas un étage : inventer son altitude fausserait le profil).
(function () {
  const PN = charger("js/profondeurNiveaux.js", "ProfondeurNiveaux");
  if (!PN) return;
  const w = PN.__win;
  w.APP_CONFIG = { scale: 2 };            // 2 px/m
  const TABLE = { "0": -25, "-1": -30, "-2": -35 };
  w.getProfondeurNiveau = function (n) {
    const v = TABLE[String(n)];
    return (v === undefined) ? null : v;
  };
  const CP = PN.construireProfil;

  let r = CP([{x:0,y:0,level:0},{x:20,y:0,level:0},{x:40,y:0,level:0}]);
  t("profil : longueur convertie en mètres par l'échelle", Math.abs(r.longueur - 20) < 1e-9);
  t("profil : à plat, aucun dénivelé", r.montee === 0 && r.descente === 0);

  r = CP([{x:0,y:0,level:0},{x:10,y:0,level:null},{x:20,y:0,level:-1}]);
  t("profil : le point de transit d'une jonction est INTERPOLÉ",
    r.pts[1].z === -27.5 && r.pts[1].interpole === true);
  t("profil : 5 m de descente comptés", Math.abs(r.descente - 5) < 1e-9 && r.montee === 0);
  t("profil : zMin / zMax justes", r.zMin === -30 && r.zMax === -25);

  r = CP([{x:0,y:0,level:0},{x:10,y:0,level:-1},{x:20,y:0,level:0}]);
  t("profil : aller-retour = 5 m de descente ET 5 m de montée",
    Math.abs(r.descente - 5) < 1e-9 && Math.abs(r.montee - 5) < 1e-9);

  r = CP([{x:0,y:0,level:1},{x:10,y:0,level:0},{x:20,y:0,level:-1}]);
  t("profil : un niveau SANS PROFONDEUR n'est pas extrapolé", r.pts[0].z === null);
  t("profil : et le résultat se déclare incomplet", r.incomplet === true);

  w.getProfondeurNiveau = function () { return null; };
  r = CP([{x:0,y:0,level:0},{x:10,y:0,level:-1}]);
  t("profil : aucune profondeur → incomplet, sans planter", r.incomplet === true && r.connus === 0);

  w.APP_CONFIG = { scale: 0 };
  t("profil : plan sans échelle → null, aucun mètre inventé",
    CP([{x:0,y:0,level:0},{x:1,y:0,level:0}]) === null);
  t("profil : chemin trop court → null", CP([{x:0,y:0,level:0}]) === null);
})();

// ───────── convertirObjet.js (reclasser un objet) ─────────
// Le Pathfinder ne construit son graphe QUE sur les `roads` : un relevé importé tout en structures
// n'a d'itinéraire qu'après conversion. On teste la RÈGLE (ouvert/fermé) et le DÉPLACEMENT.
(function () {
  const CV = charger("js/convertirObjet.js", "KtaConvertir",
    ["js/styleResolver.js", "js/legendCustomization.js"]);
  if (!CV) return;
  const w = CV.__win;
  // `isStructurePolylineType` vit dans structures.js (vrai Leaflet requis) : même règle recopiée ici.
  w.isStructurePolylineType = function (t) {
    if (t === "front-1" || t === "front-2") return true;
    const e = w.LegendCustomization && w.LegendCustomization.findCustomEntry(t);
    return !!(e && e.category === "structures" && e.geometry === "polyline");
  };

  t("convert : un tracé est OUVERT",    CV.estOuvert("roads", "principal") === true);
  t("convert : une zone est FERMÉE",    CV.estOuvert("zones", "eau") === false);
  t("convert : un front est OUVERT",    CV.estOuvert("structures", "front-1") === true);
  t("convert : un pilier est FERMÉ",    CV.estOuvert("structures", "pilier-1") === false);

  const dOuvert = CV.listerCibles("structures", "front-1");
  const typesO = dOuvert.map(function (c) { return c.famille + ":" + c.type; });
  t("convert : un front peut devenir un tracé (LE cas de KARMA)",
    typesO.indexOf("roads:principal") >= 0);
  t("convert : un front peut devenir l'autre front",  typesO.indexOf("structures:front-2") >= 0);
  t("convert : un front ne peut PAS devenir une zone",
    !typesO.some(function (s) { return s.indexOf("zones:") === 0; }));
  t("convert : un front ne peut PAS devenir un pilier",
    typesO.indexOf("structures:pilier-1") < 0);
  t("convert : la source elle-même n'est pas proposée", typesO.indexOf("structures:front-1") < 0);
  t("convert : `jonction` exclue (elle porte fromLevel/toLevel)",
    typesO.indexOf("roads:jonction") < 0);
  t("convert : `itinerary` exclu (c'est le trajet calculé)",
    typesO.indexOf("roads:itinerary") < 0);

  const dFerme = CV.listerCibles("zones", "eau");
  const typesF = dFerme.map(function (c) { return c.famille + ":" + c.type; });
  t("convert : une zone peut devenir un pilier",  typesF.indexOf("structures:pilier-1") >= 0);
  t("convert : une zone ne peut PAS devenir un tracé",
    !typesF.some(function (s) { return s.indexOf("roads:") === 0; }));
  t("convert : une zone ne peut PAS devenir un front",
    typesF.indexOf("structures:front-1") < 0);

  // Les types CUSTOM polylignes sont proposés : sur un plan importé, tous les types le sont.
  w.LegendCustomization.loadSessionState({
    schemaVersion: 1, labels: {}, hidden: {}, customEntries: [
      { id: "cust-sig-l", category: "structures", geometry: "polyline", label: "Galerie N+1", lineColor: "#8cb4ff" },
      { id: "cust-sig-p", category: "structures", geometry: "polygon",  label: "Pilier N+1",  fillColor: "#8cb4ff" }
    ]
  });
  const avecCustom = CV.listerCibles("structures", "front-1")
    .map(function (c) { return c.type; });
  t("convert : un type custom POLYLIGNE est proposé", avecCustom.indexOf("cust-sig-l") >= 0);
  t("convert : un type custom POLYGONE ne l'est pas",  avecCustom.indexOf("cust-sig-p") < 0);
  t("convert : le libellé de la légende est servi, pas l'id brut",
    (CV.listerCibles("structures", "front-1").find(function (c) { return c.type === "cust-sig-l"; }) || {})
      .label === "Galerie N+1");
  w.LegendCustomization.loadSessionState(null);

  // ── LE DÉPLACEMENT ──
  const front = { type: "front-1", level: 2, description: "note", points: [{x:0,y:0},{x:9,y:9}] };
  let R = [{ type: "principal", points: [] }], Z = [], S = [front];
  w.getRoads = function () { return R; };  w.setRoads = function (v) { R = v; };
  w.getZones = function () { return Z; };  w.setZones = function (v) { Z = v; };
  w.getStructures = function () { return S; }; w.setStructures = function (v) { S = v; };

  t("convert : l'opération réussit", CV.convertir("structures", front, "roads", "chemin") === true);
  t("convert : l'objet a QUITTÉ les structures", S.length === 0);
  t("convert : il est arrivé dans les tracés",   R.length === 2);
  const arrive = R[1];
  t("convert : le nouveau type est appliqué",    arrive.type === "chemin");
  t("convert : le NIVEAU est conservé",          arrive.level === 2);
  t("convert : la note est conservée",           arrive.description === "note");
  t("convert : la géométrie est conservée",      arrive.points.length === 2 && arrive.points[1].x === 9);
  t("convert : l'objet d'origine n'est pas muté", front.type === "front-1");

  // 🩸 Même famille : écrire la liste amputée PUIS la relire pour ajouter perd l'objet.
  const pilier = { type: "pilier-1", level: 0, points: [{x:0,y:0},{x:1,y:0},{x:1,y:1}] };
  S = [pilier];
  t("convert : reclassement DANS la même famille", CV.convertir("structures", pilier, "structures", "mur") === true);
  t("convert : l'objet n'a pas disparu", S.length === 1);
  t("convert : il porte le nouveau type", S[0].type === "mur");

  // Une jonction reclassée perd fromLevel/toLevel, sinon les filtres de niveau mentent.
  const jonc = { type: "jonction", fromLevel: 0, toLevel: -1, level: 0, points: [{x:0,y:0},{x:2,y:2}] };
  R = [jonc]; S = [];
  CV.convertir("roads", jonc, "structures", "front-2");
  t("convert : fromLevel/toLevel retirés au reclassement",
    S.length === 1 && S[0].fromLevel === undefined && S[0].toLevel === undefined);

  t("convert : un objet absent de sa famille est refusé",
    CV.convertir("roads", { type: "x" }, "zones", "eau") === false);

  // ── Contour FERMÉ par la géométrie (import SIG : pilier carré livré en 4 points / 3 côtés) ──
  // Écart des bouts < 1,5 × le plus grand côté ET forme compacte (4πA/P² ≥ 0,2). Aucun point inventé ; seul un
  // dernier point qui répète le premier est retiré.
  const carre = { uid: "st_carre", type: "front-1", level: -1, description: "n",
                  points: [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}] };
  const boucle = { type: "front-1", points: [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:0,y:0}] };
  // Zigzag ouvert, posé à l'écart : ses bouts ne doivent toucher aucun autre objet du test (sinon morceau).
  const uLarge = { type: "front-1", points: [{x:100,y:0},{x:110,y:5},{x:120,y:0},{x:130,y:5}] };
  const allonge = { type: "front-1", points: [{x:0,y:0},{x:0,y:20},{x:44,y:20},{x:44,y:3}] };   // grand côté manquant
  const crochet = { type: "front-1", points: [{x:0,y:0},{x:100,y:0},{x:100,y:10}] };   // écart < 1,5 × grand côté
  const ramifie = { type: "front-1", points: [{x:0,y:0},{x:100,y:0},{x:100,y:4},{x:52,y:4},{x:52,y:60},{x:48,y:60},
                    {x:48,y:4},{x:0,y:4}] };   // contour de galeries en T : se referme mais remplirait la galerie
  const deux   = { type: "front-1", points: [{x:0,y:0},{x:0.1,y:0}] };
  const joncF  = { type: "jonction", fromLevel: 0, toLevel: -1, points: carre.points };
  t("fermé : API estContourFerme exposée", typeof CV.estContourFerme === "function");
  t("fermé : carré à 3 côtés (écart = 1 côté) reconnu", CV.estContourFerme("structures", carre) === true);
  t("fermé : premier point répété reconnu",               CV.estContourFerme("structures", boucle) === true);
  t("fermé : zigzag (écart > 1,5 × grand côté) reste ouvert", CV.estContourFerme("structures", uLarge) === false);
  t("fermé : pilier allongé sans son grand côté reconnu", CV.estContourFerme("structures", allonge) === true);
  t("🩸 fermé : crochet peu compact reste ouvert", CV.estContourFerme("structures", crochet) === false);
  t("🩸 fermé : contour ramifié (galerie en T) reste ouvert", CV.estContourFerme("structures", ramifie) === false);
  t("fermé : 2 points jamais fermés",                     CV.estContourFerme("structures", deux) === false);
  t("fermé : une jonction jamais (ses niveaux)",          CV.estContourFerme("roads", joncF) === false);
  t("fermé : une zone n'est pas un « contour » (déjà fermée par son type)",
    CV.estContourFerme("zones", { type: "eau", points: carre.points }) === false);
  const ciblesCarre = CV.listerCibles("structures", "front-1", carre).map(function (c) { return c.famille + ":" + c.type; });
  t("fermé : le carré se voit proposer zone ET pilier", ciblesCarre.indexOf("zones:eau") >= 0 &&
    ciblesCarre.indexOf("structures:pilier-1") >= 0);
  t("fermé : et garde ses cibles ouvertes", ciblesCarre.indexOf("roads:principal") >= 0);
  t("fermé : sans l'objet, la règle par type reste (pas de zone)",
    CV.listerCibles("structures", "front-1").every(function (c) { return c.famille !== "zones"; }));
  t("fermé : le zigzag n'a pas de cible fermée",
    CV.listerCibles("structures", "front-1", uLarge).every(function (c) { return c.famille !== "zones"; }));

  S = [carre, boucle, uLarge]; Z = []; R = [];
  t("fermé : carré → pilier réussit", CV.convertir("structures", carre, "structures", "pilier-1") === true);
  const pil = S.find(function (o) { return o.uid === "st_carre"; });
  t("fermé : aucun point inventé (4 points restent 4)", !!pil && pil.type === "pilier-1" && pil.points.length === 4);
  t("fermé : uid, niveau et note conservés", !!pil && pil.level === -1 && pil.description === "n");
  t("fermé : boucle → zone réussit", CV.convertir("structures", boucle, "zones", "eau") === true);
  t("fermé : le doublon du premier point est retiré (5 → 4)", Z.length === 1 && Z[0].points.length === 4);
  t("fermé : l'objet d'origine garde ses 5 points (historique)", boucle.points.length === 5);
  t("🩸 fermé : zigzag → zone REFUSÉ (rien ne bouge)",
    CV.convertir("structures", uLarge, "zones", "eau") === false && S.indexOf(uLarge) >= 0 && Z.length === 1);
  const zoneSeule = Z[0];
  t("🩸 fermé → ouvert : refusé même en appel direct",
    CV.convertir("zones", zoneSeule, "roads", "chemin") === false && Z.length === 1);

  // Lot : contour fermé converti, ligne ouverte comptée en échec, un seul instantané.
  const c2 = { type: "front-1", points: [{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}] };
  S = [c2, uLarge]; Z = [];
  const bl = CV.convertirLot([{ famille: "structures", obj: c2 }, { famille: "structures", obj: uLarge }], "zones", "eau");
  t("fermé : lot mixte → 1 converti, 1 échec (jamais forcé)", bl.convertis === 1 && bl.echecs === 1 &&
    Z.length === 1 && S.length === 1 && S[0] === uLarge);
  const cl = CV.listerCiblesLot([{ famille: "structures", obj: c2 }], true).map(function (c) { return c.famille; });
  t("fermé : cibles d'un lot filtré = fermées comprises", cl.indexOf("zones") >= 0);
  t("fermé : cibles d'un lot non filtré = règle par type", CV.listerCiblesLot([{ famille: "structures", obj: c2 }])
    .every(function (c) { return c.famille !== "zones"; }));

  // ── La suppression (même popup, même référence directe sur l'objet) ──
  t("suppr : l'API est exposée", typeof CV.supprimer === "function");

  const journal = { snap: 0, record: [], saves: 0 };
  w.HistoryManager = {
    captureState: function () { journal.snap++; return { s: journal.snap }; },
    record: function (label, avant) { journal.record.push({ label: label, avant: avant }); }
  };
  w.SessionPersist = { save: function () { journal.saves++; } };

  // 🩸 Deux tracés peuvent être identiques (même type, même géométrie) : chercher par contenu
  // retirerait le mauvais, sans que rien ne se voie. Seule l'identité par RÉFÉRENCE tient.
  const jumeauA = { type: "principal", points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] };
  const jumeauB = { type: "principal", points: [{ x: 1, y: 1 }, { x: 5, y: 5 }] };
  const temoin  = { type: "chemin",    points: [{ x: 0, y: 0 }] };
  R = [jumeauA, jumeauB, temoin];
  Z = [{ type: "eau", points: [] }];
  S = [{ type: "mur", points: [] }];

  t("suppr : l'opération réussit", CV.supprimer("roads", jumeauB) === true);
  t("suppr : un seul objet est parti", R.length === 2);
  t("🩸 suppr : c'est le JUMEAU VISÉ qui part, pas son sosie (identité par référence)",
    R[0] === jumeauA && R.indexOf(jumeauB) < 0);
  t("suppr : le témoin de la même famille est intact", R.indexOf(temoin) >= 0);
  t("suppr : les autres familles ne sont pas touchées", Z.length === 1 && S.length === 1);
  t("🩸 suppr : un instantané est pris AVANT (sans lui l'objet serait perdu pour de bon)",
    journal.snap === 1);
  t("suppr : l'action est enregistrée dans l'historique", journal.record.length === 1);
  t("suppr : la session est sauvegardée tout de suite", journal.saves === 1);

  // Le marquage de calque ne protège pas l'objet (nettoyer un calque avant export est voulu).
  const duCalque = { type: "eau", points: [], _srcCalque: "sig" };
  Z = [duCalque];
  t("suppr : un objet venu d'un calque se supprime aussi",
    CV.supprimer("zones", duCalque) === true && Z.length === 0);

  const avantRefus = journal.record.length;
  t("suppr : un objet absent de sa famille est refusé",
    CV.supprimer("structures", { type: "mur" }) === false);
  t("suppr : arguments vides refusés",
    CV.supprimer("roads", null) === false && CV.supprimer(null, jumeauA) === false);
  t("suppr : une famille inconnue est refusée", CV.supprimer("bidon", jumeauA) === false);
  t("suppr : aucun refus n'a laissé d'entrée d'historique", journal.record.length === avantRefus);

  // 🩸 Référence PÉRIMÉE : une réception de synchro remplace l'objet par une copie de même uid ; la fiche (ou la
  // fenêtre Convertir) garde l'ancienne. Sans repli par uid, le geste échouait sans un mot.
  const toasts = [];
  w.OOMGuard = { showToast: function (m, niveau) { toasts.push(niveau + ":" + m); } };
  const vieux = { uid: "rd_vieux01", type: "principal", level: 0, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }], updatedAt: 10 };
  const copie = () => JSON.parse(JSON.stringify(vieux));
  R = [copie(), temoin];
  t("🩸 suppr : référence remplacée par une copie de même uid (réception) → supprimée quand même",
    CV.supprimer("roads", vieux) === true && R.length === 1 && R[0] === temoin);
  R = [Object.assign(copie(), { description: "note reçue" })];
  t("🩸 niveau : référence périmée → c'est l'objet de la liste qui change",
    CV.changerNiveau("roads", vieux, -1) === true && R[0].level === -1 && vieux.level === 0);
  R = [Object.assign(copie(), { description: "note reçue" })]; S = [];
  t("🩸 convert : référence périmée → la version courante est convertie (rien de la vieille copie)",
    CV.convertir("roads", vieux, "structures", "front-2") === true && R.length === 0 && S.length === 1 &&
    S[0].uid === "rd_vieux01" && S[0].description === "note reçue");
  R = [temoin];
  const nToasts = toasts.length;
  t("🩸 suppr : objet absent même par uid (supprimé ailleurs) → refus DIT (toast d'avertissement)",
    CV.supprimer("roads", vieux) === false && toasts.length === nToasts + 1 && /^warn:convert\.introuvable/.test(toasts[nToasts]));
  t("…niveau et conversion aussi", CV.changerNiveau("roads", vieux, -3) === false && CV.convertir("roads", vieux, "zones", "eau") === false &&
    toasts.length === nToasts + 3);
  delete w.OOMGuard;
  S = [{ type: "mur", points: [] }];

  // ── Le niveau (liste « Niveau » de la même popup) ──
  t("niveau : l'API est exposée", typeof CV.changerNiveau === "function");
  const journalNiv = { touch: 0, inval: 0, cats: [] };
  w.KtaUid = { touch: function (o) { journalNiv.touch++; o.updatedAt = 42; } };
  w.RoadGraph = { invalidate: function () { journalNiv.inval++; } };
  w.HistoryManager = {
    captureState: function (cat) { journalNiv.cats.push(cat); return { cat: cat }; },
    record: function (label, avant, cat) { journal.record.push({ label: label, avant: avant, cat: cat }); }
  };
  const galerie = { type: "principal", level: 0, uid: "rd_g", points: [{ x: 0, y: 0 }, { x: 3, y: 3 }] };
  R = [galerie];
  const nRec = journal.record.length, nSave = journal.saves;
  t("niveau : l'opération réussit", CV.changerNiveau("roads", galerie, -2) === true);
  t("niveau : MÊME objet muté en place (référence et uid gardés)", R[0] === galerie && galerie.uid === "rd_g");
  t("niveau : la valeur choisie est écrite", galerie.level === -2);
  t("niveau : touch appelé (synchro)", journalNiv.touch === 1 && galerie.updatedAt === 42);
  t("🩸 niveau : le graphe de navigation est invalidé", journalNiv.inval === 1);
  t("niveau : instantané CIBLÉ sur la famille, entrée d'historique de la même famille",
    journalNiv.cats[0] === "roads" && journal.record.length === nRec + 1 && journal.record[nRec].cat === "roads");
  t("niveau : session sauvegardée", journal.saves === nSave + 1);
  // 🩸 pilier-2 / front-2 naissent à « niveau actif − 1 » : un changement écrit la valeur telle quelle.
  const p2 = { type: "pilier-2", level: -1, points: [{x:0,y:0},{x:1,y:0},{x:1,y:1}] };
  S = [p2];
  t("🩸 niveau : pilier-2 reçoit la valeur choisie, sans le « − 1 » de la création",
    CV.changerNiveau("structures", p2, 1) === true && p2.level === 1);
  const zoneSansNiv = { type: "eau", points: [] };
  Z = [zoneSansNiv];
  const nRec2 = journal.record.length;
  t("niveau : même niveau (absent = 0) → refus, rien d'écrit",
    CV.changerNiveau("zones", zoneSansNiv, 0) === false && !("level" in zoneSansNiv) && journal.record.length === nRec2);
  t("niveau : une zone sans level reçoit le niveau choisi", CV.changerNiveau("zones", zoneSansNiv, 2) === true && zoneSansNiv.level === 2);
  const joncN = { type: "jonction", fromLevel: 0, toLevel: 1, points: [] };
  R = [joncN];
  t("niveau : une jonction est refusée (fromLevel / toLevel, hors de cette liste)",
    CV.changerNiveau("roads", joncN, 3) === false && !("level" in joncN));
  t("niveau : un objet absent de sa famille est refusé", CV.changerNiveau("roads", { type: "chemin" }, 1) === false);
  t("niveau : un niveau non entier est refusé", CV.changerNiveau("zones", zoneSansNiv, "1") === false);
  w.ktaEditionRefusee = function () { return true; };
  t("🔒 niveau : lecture seule → refus", CV.changerNiveau("zones", zoneSansNiv, -1) === false && zoneSansNiv.level === 2);
  delete w.ktaEditionRefusee;

  // ── Les niveaux d'une jonction (sa fiche) : de = premier point, vers = dernier, un geste ──
  t("jonction : l'API est exposée", typeof CV.changerNiveauxJonction === "function");
  const jct = { type: "jonction", uid: "rd_j", fromLevel: -1, toLevel: 0, points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] };
  const tem = { type: "chemin", level: 0, points: [] };
  R = [tem, jct];
  const j0 = { touch: journalNiv.touch, inval: journalNiv.inval, rec: journal.record.length, save: journal.saves,
               cats: journalNiv.cats.length };
  t("jonction : l'opération réussit", CV.changerNiveauxJonction(jct, 0, 1) === true);
  t("jonction : MÊME objet muté en place, les deux bouts écrits", R[1] === jct && jct.fromLevel === 0 && jct.toLevel === 1);
  t("jonction : pas de `level` posé (une jonction n'en a pas)", !("level" in jct));
  t("jonction : touch (synchro), graphe invalidé, session sauvegardée",
    journalNiv.touch === j0.touch + 1 && journalNiv.inval === j0.inval + 1 && journal.saves === j0.save + 1);
  t("jonction : UNE entrée d'historique, instantané ciblé sur les tracés",
    journal.record.length === j0.rec + 1 && journal.record[j0.rec].cat === "roads" &&
    journalNiv.cats.length === j0.cats + 1 && journalNiv.cats[j0.cats] === "roads");
  const j1 = journal.record.length;
  t("⚠️ jonction : deux niveaux identiques refusés, rien d'écrit",
    CV.changerNiveauxJonction(jct, 1, 1) === false && jct.fromLevel === 0 && jct.toLevel === 1 && journal.record.length === j1);
  t("jonction : niveaux inchangés → refus sans entrée d'historique",
    CV.changerNiveauxJonction(jct, 0, 1) === false && journal.record.length === j1);
  t("jonction : niveaux non entiers refusés", CV.changerNiveauxJonction(jct, "0", 2) === false && jct.toLevel === 1);
  t("jonction : un tracé ordinaire est refusé", CV.changerNiveauxJonction(tem, 0, 1) === false && !("fromLevel" in tem));
  R = [tem, JSON.parse(JSON.stringify(jct))];
  t("🩸 jonction : référence périmée (copie de même uid) → c'est l'objet de la liste qui change",
    CV.changerNiveauxJonction(jct, -1, 1) === true && R[1].fromLevel === -1 && jct.fromLevel === 0);
  w.ktaEditionRefusee = function () { return true; };
  t("🔒 jonction : lecture seule → refus", CV.changerNiveauxJonction(R[1], 2, 1) === false && R[1].fromLevel === -1);
  delete w.ktaEditionRefusee;

  // ── Appliquer un tableau (« Appliquer à la session » de l'Éditeur de données) ──
  t("tableau : l'API est exposée", typeof CV.appliquerTableau === "function");
  {
    const jt = { touch: 0, inval: 0, cats: [], rec: [] };
    w.KtaUid = { touch: function (o) { jt.touch++; o.updatedAt = 99; } };
    w.RoadGraph = { invalidate: function () { jt.inval++; } };
    w.HistoryManager = {
      captureState: function (cat) { jt.cats.push(cat); return { cat: cat }; },
      record: function (label, avant, cat) { jt.rec.push({ label: label, cat: cat }); }
    };
    const pts = [{ x: 0, y: 0 }, { x: 4, y: 4 }];
    const a = { uid: "rd_a", type: "principal", level: 0, description: "a", points: pts, updatedAt: 1 };
    const b = { uid: "rd_b", type: "chemin", points: pts, updatedAt: 1 };
    const c = { uid: "rd_c", type: "chemin", points: pts, updatedAt: 1 };
    const iti = { uid: "rd_i", type: "itinerary", points: pts };
    const copie = function (o) { return JSON.parse(JSON.stringify(o)); };
    R = [a, b, c, iti];
    const lignes = [copie(a), copie(b), { uid: "rd_n", type: "secondaire", points: pts }];
    lignes[0].type = "secondaire"; lignes[0].level = -1; lignes[0].points = [];
    lignes[1].description = "note neuve";
    const sim = CV.appliquerTableau("roads", lignes, { simuler: true });
    t("tableau : simulation = bilan sans écriture (1 ajout, 2 modifiés, 1 supprimé ; itinéraire hors compte)",
      sim && sim.modifies === 2 && sim.ajoutes === 1 && sim.supprimes === 1 && R.length === 4 && jt.rec.length === 0);
    const bil = CV.appliquerTableau("roads", lignes);
    const na = R.find(function (o) { return o.uid === "rd_a"; });
    t("tableau : type par le chemin de Convertir (nouvel objet, même uid, touch)",
      na && na !== a && na.type === "secondaire" && a.type === "principal");
    t("tableau : niveau posé, géométrie de la SESSION gardée (le tableau ne l'édite pas)",
      na.level === -1 && na.points === pts);
    t("tableau : autre colonne modifiée en place + touch", R.indexOf(b) >= 0 && b.description === "note neuve" && b.updatedAt === 99);
    t("tableau : ligne d'uid inconnu ajoutée, objet absent du tableau retiré, itinéraire gardé",
      R.some(function (o) { return o.uid === "rd_n"; }) && R.indexOf(c) < 0 && R.indexOf(iti) >= 0 && R.length === 4);
    t("tableau : UN instantané ciblé, UNE entrée d'historique, graphe invalidé",
      jt.cats.length === 1 && jt.cats[0] === "roads" && jt.rec.length === 1 && jt.rec[0].cat === "roads" && jt.inval === 1);
    t("tableau : bilan rendu", bil && bil.modifies === 2 && bil.ajoutes === 1 && bil.supprimes === 1);
    const nTouch = jt.touch;
    t("tableau : rien de changé → rien d'écrit ni de touché",
      CV.appliquerTableau("roads", R.map(copie)).modifies === 0 && jt.rec.length === 1 && jt.touch === nTouch);

    const err = function (fam, l) { const r = CV.appliquerTableau(fam, l); return r && r.erreur; };
    const z = { uid: "zn_z", type: "eau", points: pts };
    Z = [z];
    const e1 = err("zones", [Object.assign(copie(z), { type: "eua" })]);
    t("tableau : type inconnu REFUSÉ, ligne et type nommés, rien d'écrit",
      e1 && e1.code === "typeInconnu" && e1.ligne === 1 && e1.type === "eua" && Z[0] === z && z.type === "eau");
    const f = { uid: "st_f", type: "front-1", points: pts };
    S = [f];
    const e2 = err("structures", [Object.assign(copie(f), { type: "pilier-1" })]);
    t("tableau : type connu mais de l'autre géométrie (front → pilier) refusé", e2 && e2.code === "typeIncompatible");
    R = [copie(b)];
    const e3 = err("roads", [Object.assign(copie(b), { type: "jonction" })]);
    t("tableau : jonction non posable depuis le tableau", e3 && e3.code === "typeInterdit");
    const e4 = err("zones", [Object.assign(copie(z), { level: "2" })]);
    t("tableau : niveau non entier refusé", e4 && e4.code === "niveau");
    const e5 = err("zones", [copie(z), { type: "inconnu-x", points: pts }]);
    t("tableau : une ligne ajoutée d'un type inconnu est refusée (ligne 2)", e5 && e5.code === "typeInconnu" && e5.ligne === 2);
    t("tableau : un type orphelin INCHANGÉ ne bloque pas (donnée existante)",
      (function () { const o = { uid: "zn_o", type: "cust-disparu", points: pts }; Z = [o];
        const r = CV.appliquerTableau("zones", [Object.assign(copie(o), { description: "x" })]);
        return r && !r.erreur && r.modifies === 1; })());
    t("tableau : structure front-1 → front-2 et niveau, appliqués",
      (function () { S = [f]; const r = CV.appliquerTableau("structures", [Object.assign(copie(f), { type: "front-2", level: 1 })]);
        return r && r.modifies === 1 && S[0].type === "front-2" && S[0].level === 1 && S[0].uid === "st_f"; })());
    w.ktaEditionRefusee = function () { return true; };
    t("🔒 tableau : lecture seule → refus", CV.appliquerTableau("zones", [copie(z)]) === null);
    delete w.ktaEditionRefusee;
    t("tableau : famille inconnue refusée", CV.appliquerTableau("bidon", []) === null);
    // Fichier ANCIEN : seule la cellule modifiée depuis le chargement s'applique (opts.origine).
    {
      const t1 = { uid: "rd_o1", type: "principal", description: "récente", level: 0, points: pts };
      const t2 = { uid: "rd_o2", type: "secondaire", points: pts };
      R = [t1, t2];
      const vieux = [{ uid: "rd_o1", type: "principal", description: "ancienne", level: 0, points: pts },
                     { uid: "rd_o2", type: "chemin", points: pts }];
      const origines = new Map(vieux.map(function (l) { return [l, copie(l)]; }));
      vieux[0].level = 2;
      const r = CV.appliquerTableau("roads", vieux, { origine: function (l) { return origines.get(l) || null; } });
      const n1 = R.find(function (o) { return o.uid === "rd_o1"; }) || {};
      const n2 = R.find(function (o) { return o.uid === "rd_o2"; }) || {};
      t("🩸 tableau + origine : seule la cellule modifiée part (niveau), la note plus récente de la session reste",
        r && r.modifies === 1 && n1.level === 2 && n1.description === "récente", r);
      t("🩸 tableau + origine : une ligne non touchée d'un fichier ancien ne change rien", n2.type === "secondaire");
      // Supprimé depuis l'export (trace) : non touché = ignoré, modifié = réajouté.
      w.KtaUid.getTombstones = function () { return [{ uid: "rd_o3", deletedAt: 5 }]; };
      R = [n1];
      const l3 = { uid: "rd_o3", type: "chemin", points: pts };
      const o3 = new Map([[l3, copie(l3)]]);
      const r3 = CV.appliquerTableau("roads", [copie(n1), l3], { origine: function (l) { return o3.get(l) || null; } });
      t("🩸 tableau : ligne non touchée d'un objet supprimé depuis l'export → ignorée, comptée",
        r3 && r3.ignores === 1 && r3.ajoutes === 0 && !R.some(function (o) { return o.uid === "rd_o3"; }), r3);
      l3.level = 1;
      const r4 = CV.appliquerTableau("roads", [copie(n1), l3], { origine: function (l) { return o3.get(l) || null; } });
      t("tableau : la même ligne MODIFIÉE est réajoutée (geste explicite)",
        r4 && r4.ignores === 0 && r4.ajoutes === 1 && R.some(function (o) { return o.uid === "rd_o3"; }), r4);
      delete w.KtaUid.getTombstones;
      // Points (POI) : même chemin, la liste fournie par l'appelant (opts.acces), aucune validation de type.
      let P = [{ uid: "pt_a", nom: "A", x: 1, y: 1, tags: ["salle"], description: "récente" },
               { uid: "pt_b", nom: "B", x: 2, y: 2, tags: [] }];
      const cats = [];
      w.HistoryManager = {
        captureState: function (cat) { cats.push(cat); return { cat: cat }; },
        record: function (label, avant, cat) { cats.push("rec:" + cat); }
      };
      const accesPts = { lire: function () { return P; }, ecrire: function (v) { P = v; }, categorie: "pts-test" };
      const fic = [{ uid: "pt_a", nom: "A", x: 1, y: 1, tags: ["salle"], description: "ancienne" },
                   { uid: "pt_b", nom: "B", x: 2, y: 2, tags: [] }];
      const oP = new Map(fic.map(function (l) { return [l, copie(l)]; }));
      fic[0].level = 2;
      fic[1].nom = "B2"; fic[1].type = "libre";
      const rp = CV.appliquerTableau("points", fic, { acces: accesPts, origine: function (l) { return oP.get(l) || null; } });
      const pa = P.find(function (o) { return o.uid === "pt_a"; }) || {}, pb = P.find(function (o) { return o.uid === "pt_b"; }) || {};
      t("tableau, points : seules les cellules modifiées (niveau de A, nom et champ type libre de B), note récente gardée",
        rp && !rp.erreur && rp.modifies === 2 && pa.level === 2 && pa.description === "récente" && pb.nom === "B2" && pb.type === "libre", rp);
      t("tableau, points : instantané et historique dans la catégorie fournie", cats.join(",") === "pts-test,rec:pts-test", cats);
      const rq = CV.appliquerTableau("points", [copie(pa)], { acces: accesPts });
      t("tableau, points : ligne retirée = suppression", rq && rq.supprimes === 1 && P.length === 1);
    }
  }

  // ── le câblage, que l'extraction ne voit pas ──
  {
    const U = fs.readFileSync("js/utils.js", "utf8");
    t("câblage : le bouton Supprimer est dans la popup de l'objet",
      U.indexOf("kta-note-popup-supprimer") >= 0);
    t("câblage : il appelle bien KtaConvertir.supprimer",
      /KtaConvertir\.supprimer\(opts\.convertir\.famille, opts\.convertir\.obj\)/.test(U));
    // 🩸 Collée au « Sauver », une action destructrice se clique par accident : ligne danger à part.
    t("🩸 câblage : le bouton est dans une ligne DANGER séparée",
      /kta-popup-actions-danger[^']*'[\s\S]{0,220}kta-note-popup-supprimer/.test(U));
    // 🩸 Le setteur relance un rendu complet qui détruit le layer : sans fermeture, popup orpheline.
    const iSup = U.indexOf("kta-note-popup-supprimer\");");
    t("🩸 câblage : la popup est FERMÉE (sinon elle survit à son layer détruit)",
      iSup > 0 && U.slice(iSup, iSup + 900).indexOf("closePopup") >= 0);
    t("câblage : la liste « Niveau » est dans la popup et appelle KtaConvertir.changerNiveau",
      U.indexOf("kta-note-popup-niveau") >= 0 &&
      /KtaConvertir\.changerNiveau\(opts\.convertir\.famille, opts\.convertir\.obj, n\)/.test(U));
    // 🩸 La popup quittée reste dans le DOM pendant son fondu : chercher dans tout le document branchait ses
    // boutons à elle, ceux de la nouvelle fiche restaient morts.
    t("🩸 câblage : les écouteurs de la fiche sont cherchés DANS la popup ouverte (evt.popup.getElement)",
      /const popupRoot = racine\.querySelector\("\.leaflet-popup-content \.kta-note-popup"\)/.test(U) &&
      /evt\.popup\.getElement\(\)/.test(U));
    // Fiche d'une jonction : ses niveaux, jamais Convertir ; refus de deux niveaux identiques dans la fiche.
    t("câblage : la fiche d'une jonction appelle KtaConvertir.changerNiveauxJonction",
      /KtaConvertir\.changerNiveauxJonction\(opts\.convertir\.obj, de, vers\)/.test(U));
    t("câblage : pas de 🔄 Convertir sur la fiche d'une jonction", /opts\.convertir && !opts\.jonction/.test(U));
    const iJct = U.indexOf("jctBtn.addEventListener(\"click\"");
    t("🩸 câblage : deux niveaux identiques arrêtent AVANT la fermeture et l'écriture",
      iJct > 0 && U.indexOf("de === vers", iJct) < U.indexOf("closePopup", iJct) &&
      U.indexOf("closePopup", iJct) < U.indexOf("changerNiveauxJonction(", iJct));
    const RD = fs.readFileSync("js/road.js", "utf8");
    t("câblage : road.js ouvre une fiche pour la jonction (`opts.jonction`), pas pour l'itinéraire",
      /jonction: road\.type === "jonction"/.test(RD) && !/road\.type !== "jonction" &&\s*road !== currentRoad/.test(RD));
    const iNiv = U.indexOf("nivSel.addEventListener(\"change\"");
    t("🩸 câblage : la popup est fermée AVANT changerNiveau (le setteur détruit le layer)",
      iNiv > 0 && U.indexOf("closePopup", iNiv) < U.indexOf("changerNiveau(", iNiv));
    // Niveaux proposés (utils.js, extrait du fichier : il ne se charge pas sans Leaflet).
    const a = U.indexOf("window.ktaNiveauxProposes = function");
    const b = U.indexOf("window.ktaOptionsNiveauHtml = function");
    const wn = { APP_CONFIG: { multiLevel: true, availableLevels: [2, -1, 0, 1] },
                 _aucunModeEditionActif: function () { return true; } };
    let NP = null;
    try {
      vm.runInContext("var window = this;" + U.slice(a, b), vm.createContext(wn));
      NP = wn.ktaNiveauxProposes;
    } catch (e) { console.log("   ↳ " + e.message); }
    t("niveaux proposés : bloc extrait de utils.js", a > 0 && b > a && typeof NP === "function");
    if (NP) {
      t("niveaux proposés : triés", JSON.stringify(NP(0)) === "[-1,0,1,2]");
      t("🩸 niveaux proposés : le niveau ACTUEL y est même hors availableLevels",
        JSON.stringify(NP(-4)) === "[-4,-1,0,1,2]");
      t("niveaux proposés : pas de doublon", JSON.stringify(NP(1)) === "[-1,0,1,2]");
      wn._aucunModeEditionActif = function () { return false; };
      t("niveaux proposés : aucune liste pendant un dessin", NP(0) === null);
      wn._aucunModeEditionActif = function () { return true; };
      wn.APP_CONFIG.multiLevel = false;
      t("niveaux proposés : aucune liste hors multi-niveau", NP(0) === null);
      t("libellé signé : +2 / 0 / -1",
        wn.ktaFormatNiveau(2) === "+2" && wn.ktaFormatNiveau(0) === "0" && wn.ktaFormatNiveau(-1) === "-1");
    }
    const E = fs.readFileSync("js/editor.js", "utf8");
    t("câblage : le formulaire d'un POI porte la liste « Niveau » (édition seulement)",
      /isEdit && typeof window\.ktaOptionsNiveauHtml === "function"/.test(E) && E.indexOf('id="kta-poi-niveau"') >= 0);
    t("câblage : un POI changé de niveau recale ses liaisons inter-plan",
      /InterPlanLinks\.onPointLevelChanged\(planId, existingPoint\)/.test(E));
    ["convert.btnSuppr", "convert.toastSuppr", "convert.histoireSuppr", "niveauObjet.label", "niveauObjet.option",
     "niveauObjet.histoire", "niveauObjet.toastDeplace", "niveauObjet.toastMasque"].forEach(function (k) {
      ["fr", "en", "es"].forEach(function (l) {
        const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
        t("i18n " + l + " : " + k, typeof D[k] === "string" && D[k].length > 0);
      });
    });
  }
})();

// ───────── convertirObjet.js : recoller des lignes qui forment ensemble une boucle ─────────
// À l'import SIG, un pilier arrive en 2 à 4 lignes dont les bouts se touchent presque : aucune n'est fermée seule.
// Côtés subdivisés tous les 5 px (comme un relevé SIG) : une moitié de carré n'est alors PAS un contour fermé seule.
(function () {
  const CV = charger("js/convertirObjet.js", "KtaConvertir",
    ["js/styleResolver.js", "js/legendCustomization.js", "js/ktaUid.js"]);
  if (!CV) return;
  const w = CV.__win;
  w.isStructurePolylineType = function (t) { return t === "front-1" || t === "front-2"; };
  t("recoller : API trouverBoucles et recollerLot exposées",
    typeof CV.trouverBoucles === "function" && typeof CV.recollerLot === "function");
  if (typeof CV.trouverBoucles !== "function") return;
  // Segment subdivisé de a à b (b inclus, a exclu si `sansDebut`).
  const seg = function (a, b, sansDebut) {
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 5)), out = [];
    for (let i = sansDebut ? 1 : 0; i <= n; i++) out.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n });
    return out;
  };
  const chemin = function (pts) {
    let out = seg(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i++) out = out.concat(seg(pts[i - 1], pts[i], true));
    return out;
  };
  const ligne = function (uid, pts, extra) {
    return Object.assign({ uid: uid, type: "front-1", level: 0, points: chemin(pts) }, extra || {});
  };
  const it = function (o, f) { return { famille: f || "structures", obj: o }; };
  // Carré 30 × 30 à l'abscisse ox livré en 2 lignes : moitié haut-droite, moitié bas-gauche aux bouts décalés de e px.
  const carre2 = function (p, ox, e, extraA, extraB) {
    const A = ligne(p + "a", [{ x: ox, y: 0 }, { x: ox + 30, y: 0 }, { x: ox + 30, y: 30 }], extraA);
    const B = ligne(p + "b", [{ x: ox + 30 - e, y: 30 }, { x: ox, y: 30 }, { x: ox, y: e }], extraB);
    return [A, B];
  };

  const [a3, b3] = carre2("st_r3", 0, 3, { description: "note A" }, { description: "note B" });
  t("recoller : une moitié de carré seule n'est pas un contour fermé", CV.estContourFerme("structures", a3) === false);
  let r = CV.trouverBoucles([it(a3), it(b3)]);
  t("recoller : 2 lignes formant un carré à 3 px d'écart → 1 boucle de 2 lignes",
    r.boucles.length === 1 && r.lignes === 2 && r.ignorees === 0);
  const pts = r.boucles[0] ? r.boucles[0].points : [];
  t("recoller : jonctions fusionnées, aucun point inventé (A + B − 2 points)",
    pts.length === a3.points.length + b3.points.length - 2);
  t("recoller : le point de la PREMIÈRE ligne est gardé aux jonctions (départ et coin)",
    pts.length > 0 && pts[0].x === 0 && pts[0].y === 0 && pts.some(function (q) { return q.x === 30 && q.y === 30; }) &&
    !pts.some(function (q) { return q.x === 27 && q.y === 30; }) && !pts.some(function (q) { return q.x === 0 && q.y === 3; }));
  const bInv = Object.assign({}, b3, { points: b3.points.slice().reverse() });
  r = CV.trouverBoucles([it(a3), it(bInv)]);
  t("recoller : une ligne dans l'autre sens est retournée", r.boucles.length === 1 &&
    r.boucles[0].points.length === pts.length && r.boucles[0].points[pts.length - 1].y === pts[pts.length - 1].y);

  const [a8, b8] = carre2("st_r8", 100, 8);
  r = CV.trouverBoucles([it(a8), it(b8)]);
  t("🩸 recoller : bouts à 8 px → pas recollés", r.boucles.length === 0);

  // Rectangle 60 × 30 en 3 lignes.
  const r1 = ligne("st_q1", [{ x: 200, y: 0 }, { x: 260, y: 0 }]);
  const r2 = ligne("st_q2", [{ x: 262, y: 1 }, { x: 260, y: 30 }, { x: 230, y: 30 }]);
  const r3 = ligne("st_q3", [{ x: 228, y: 31 }, { x: 200, y: 30 }, { x: 201, y: 2 }]);
  r = CV.trouverBoucles([it(r1), it(r2), it(r3)]);
  t("recoller : 3 lignes formant un rectangle → 1 boucle", r.boucles.length === 1 && r.lignes === 3);

  // T à 3 branches qui se rejoignent en un nœud.
  const t1 = ligne("st_t1", [{ x: 300, y: 0 }, { x: 330, y: 0 }]);
  const t2 = ligne("st_t2", [{ x: 360, y: 0 }, { x: 331, y: 1 }]);
  const t3 = ligne("st_t3", [{ x: 330, y: 40 }, { x: 330, y: 2 }]);
  r = CV.trouverBoucles([it(t1), it(t2), it(t3)]);
  t("🩸 recoller : T à 3 branches → non, compté", r.boucles.length === 0 && r.ignorees === 3);
  // Carré en 2 lignes + une branche accrochée à un coin : degré 3, pas une boucle simple.
  const [ab, bb] = carre2("st_rb", 400, 3);
  const br = ligne("st_rbr", [{ x: 400, y: -2 }, { x: 400, y: -40 }]);
  r = CV.trouverBoucles([it(ab), it(bb), it(br)]);
  t("🩸 recoller : boucle avec une branche → non, 3 lignes comptées", r.boucles.length === 0 && r.ignorees === 3);

  // Boucle peu compacte (100 × 2) : remplirait une galerie.
  const f1 = ligne("st_f1", [{ x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 102 }]);
  const f2 = ligne("st_f2", [{ x: 98, y: 102 }, { x: 0, y: 102 }, { x: 0, y: 101 }]);
  r = CV.trouverBoucles([it(f1), it(f2)]);
  t("🩸 recoller : boucle peu compacte → non", r.boucles.length === 0 && r.ignorees === 2);

  const [an, bn] = carre2("st_rn", 500, 3, null, { level: -1 });
  r = CV.trouverBoucles([it(an), it(bn)]);
  t("🩸 recoller : niveaux différents → non", r.boucles.length === 0);

  const jc = { uid: "rd_j", type: "jonction", fromLevel: 0, toLevel: -1, points: b3.points };
  r = CV.trouverBoucles([it(a3), it(jc, "roads")]);
  t("recoller : une jonction n'entre jamais dans une boucle", r.boucles.length === 0);

  // L'opération : un instantané, une entrée, lignes supprimées, uid neuf, notes concaténées, ⏪ = état d'avant.
  let R = [], Z = [], S = [];
  w.getRoads = function () { return R; };  w.setRoads = function (v) { R = v; };
  w.getZones = function () { return Z; };  w.setZones = function (v) { Z = v; };
  w.getStructures = function () { return S; }; w.setStructures = function (v) { S = v; };
  const journal = { snap: 0, record: [] };
  w.HistoryManager = {
    captureState: function () { journal.snap++; return { S: S.slice(), Z: Z.slice() }; },
    record: function (label, avant) { journal.record.push({ label: label, avant: avant }); }
  };
  const seul = { uid: "st_seul", type: "front-1", level: 0,   // contour fermé seul : 4 points / 3 côtés
                 points: [{ x: 600, y: 0 }, { x: 630, y: 0 }, { x: 630, y: 30 }, { x: 600, y: 30 }] };
  const autre = ligne("st_autre", [{ x: 700, y: 0 }, { x: 800, y: 0 }]);
  S = [a3, b3, r1, r2, r3, a8, b8, seul, autre];
  const bl = CV.recollerLot(S.map(function (o) { return it(o); }), "structures", "pilier-1");
  t("recoller : bilan = 2 objets recollés (5 lignes), 1 contour seul converti",
    bl.recolles === 2 && bl.lignes === 5 && bl.convertis === 1);
  t("recoller : UN instantané, UNE entrée d'historique", journal.snap === 1 && journal.record.length === 1);
  const piliers = S.filter(function (o) { return o.type === "pilier-1"; });
  t("recoller : 3 piliers, les lignes recollées ont quitté la session", piliers.length === 3 &&
    ["st_r3a", "st_r3b", "st_q1", "st_q2", "st_q3"].every(function (u) { return !S.some(function (o) { return o.uid === u; }); }));
  t("recoller : paire à 8 px et ligne seule intactes", S.indexOf(a8) >= 0 && S.indexOf(b8) >= 0 && S.indexOf(autre) >= 0);
  const pc = piliers.find(function (o) { return o.description && o.description.indexOf("note A") >= 0; });
  t("recoller : notes distinctes concaténées", !!pc && pc.description === "note A\nnote B");
  t("recoller : uid NEUF (préfixe de la famille cible), niveau gardé", !!pc && /^st_/.test(pc.uid) &&
    pc.uid !== "st_r3a" && pc.uid !== "st_r3b" && pc.level === 0 && typeof pc.updatedAt === "number");
  t("recoller : l'objet d'origine n'est pas muté (historique)", a3.type === "front-1" && a3.points.length === 13);
  const avant = journal.record[0] && journal.record[0].avant;
  t("recoller : l'instantané d'avant tient les lignes d'origine (⏪ les rend)",
    !!avant && avant.S.indexOf(a3) >= 0 && avant.S.indexOf(r3) >= 0 && avant.S.length === 9);

  // Cible ouverte : rien n'est recollé.
  S = [a3, b3]; journal.snap = 0; journal.record = [];
  const blO = CV.recollerLot([it(a3), it(b3)], "structures", "front-2");
  t("🩸 recoller : cible ouverte → rien recollé, rien écrit",
    blO.recolles === 0 && S.length === 2 && journal.record.length === 0);

  // Marque de calque : gardée si toutes les lignes ont la même, retirée sinon.
  const [ca, cb] = carre2("st_rc", 0, 3, { _srcCalque: "L1", _srcCalqueDepuis: 5 }, { _srcCalque: "L1", _srcCalqueDepuis: 5 });
  const [ma, mb] = carre2("st_rm", 100, 3, { _srcCalque: "L1" }, null);
  S = [ca, cb, ma, mb];
  CV.recollerLot(S.map(function (o) { return it(o); }), "zones", "eau");
  const zc = Z.find(function (o) { return o.points[0].x === 0; });
  const zm = Z.find(function (o) { return o.points[0].x === 100; });
  t("recoller : même calque → marque gardée",
    !!zc && zc._srcCalque === "L1" && zc._srcCalqueDepuis === 5 && /^zn_/.test(zc.uid));
  t("recoller : provenances mêlées → objet ordinaire (marque retirée)",
    !!zm && zm._srcCalque === undefined && zm._srcCalqueDepuis === undefined);
  t("recoller : vers une autre famille, les lignes quittent la leur", S.length === 0 && Z.length === 2);

  // Règle 1 : une ligne de 2 segments n'est jamais un contour fermé seule (sinon un triangle).
  const V = { uid: "st_V", type: "front-1", level: 0, points: [{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 20, y: 0 }] };
  const La = { uid: "st_La", type: "front-1", level: 0, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }] };
  t("🩸 contour : un V de 2 segments n'est pas fermé seul", CV.estContourFerme("structures", V) === false);
  t("🩸 contour : un L de 2 segments n'est pas fermé seul", CV.estContourFerme("structures", La) === false);
  t("contour : 2 segments + premier point répété = triangle fermé (3 côtés)", CV.estContourFerme("structures",
    { type: "front-1", points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 0 }] }) === true);

  // Règle 2 : un « C » de 3 segments dont un bout touche une autre ligne de la SESSION est un morceau.
  const Ca = { uid: "st_Ca", type: "front-1", level: 0,
               points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }] };
  const Cb = { uid: "st_Cb", type: "front-1", level: 0, points: [{ x: 0, y: 28 }, { x: 0, y: 2 }] };
  const Ci = { uid: "st_Ci", type: "front-1", level: 0,
               points: [{ x: 500, y: 0 }, { x: 530, y: 0 }, { x: 530, y: 30 }, { x: 500, y: 30 }] };
  S = [Ca, Cb, Ci]; Z = []; R = [];
  t("contour : le C à 3 segments se referme (géométrie seule)", CV.estContourFerme("structures", Ca) === true);
  t("🩸 morceau : la fiche du C qui touche une ligne voisine ne propose ni zone ni pilier",
    CV.listerCibles("structures", "front-1", Ca).every(function (c) { return c.famille !== "zones" && c.type !== "pilier-1"; }));
  t("contour : la fiche du C isolé propose zone et pilier",
    CV.listerCibles("structures", "front-1", Ci).some(function (c) { return c.famille === "zones"; }));
  r = CV.trouverBoucles([it(Ca)]);
  t("🩸 morceau : la voisine HORS sélection suffit (C seul sélectionné → 0 contour, 1 morceau)",
    r.contours.length === 0 && r.morceaux === 1 && r.boucles.length === 0);
  r = CV.trouverBoucles([it(Ca), it(Cb), it(Ci)]);
  t("morceau : recollé avec sa voisine (1 boucle de 4 points), le C isolé reste un contour seul",
    r.boucles.length === 1 && r.boucles[0].points.length === 4 && r.contours.length === 1 &&
    r.contours[0].obj === Ci && r.morceaux === 0);
  journal.snap = 0; journal.record = [];
  const blM = CV.convertirLot([it(Ca), it(Ci)], "structures", "pilier-1");
  t("🩸 morceau : refusé seul en lot (1 converti = le C isolé, 1 échec)", blM.convertis === 1 && blM.echecs === 1 &&
    S.indexOf(Ca) >= 0 && S.indexOf(Ci) < 0);
  const blR = CV.recollerLot([it(Ca), it(Cb)], "structures", "pilier-1");
  t("morceau : recollé avec sa voisine en un pilier", blR.recolles === 1 && blR.lignes === 2 &&
    S.indexOf(Ca) < 0 && S.indexOf(Cb) < 0);
  S = [Ca, Cb];
  t("🩸 morceau : convertir() direct refusé aussi", CV.convertir("structures", Ca, "zones", "eau") === false);

  ["convert.recollerFiltre", "convert.lotSourceRecoller", "convert.regleRecoller", "convert.recollerTitre",
   "convert.recollerConfirm", "convert.recollerBilan", "convert.histoireRecoller",
   "convert.morceauxReste", "convert.regleMorceau"].forEach(function (k) {
    ["fr", "en", "es"].forEach(function (l) {
      const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
      t("i18n " + l + " : " + k, typeof D[k] === "string" && D[k].length > 0);
    });
  });
})();

// ───────── userProfile.js ─────────
const UP = charger("js/userProfile.js", "UserProfile");
if (UP) {
  const ATTENDU = [
    "init", "get", "getPhotoBlob", "getPhotoObjectUrl", "setSurnom", "setPhoto",
    "removePhoto", "clear", "onChange", "getInitial", "getAvatarColor",
    // fond d'ecran
    "setWallpaper", "removeWallpaper", "getWallpaperBlob", "getWallpaperObjectUrl",
    "setWallpaperVoile", "setWallpaperCadrage", "setWallpaperFit"
  ];
  ATTENDU.forEach(function(m) {
    t("UserProfile." + m + "() exposee", typeof UP[m] === "function");
  });
  ["PALETTE", "DB_NAME", "WALLPAPER_MAX_SHORT", "WALLPAPER_MAX_LONG"].forEach(function(c) {
    t("UserProfile." + c + " exposee", UP[c] !== undefined);
  });

  // L'état par défaut porte les champs du fond d'écran, sinon les curseurs lisent `undefined`.
  const snap = UP.get();
  ["hasWallpaper", "wallVoile", "wallPosX", "wallPosY", "wallFit"].forEach(function(k) {
    t("get() expose " + k, Object.prototype.hasOwnProperty.call(snap, k));
  });
  t("voile par defaut = 55", snap.wallVoile === 55);
  t("cadrage par defaut centre", snap.wallPosX === 50 && snap.wallPosY === 50);
}

// ───────── styleResolver.js (fonctions LIBRES sur window) ─────────
const SR = charger("js/styleResolver.js", "ktaResolveStyle");
t("window.ktaResolveStyle() exposee",  typeof SR === "function");
["ktaStyleBuiltins", "ktaSwatchColor", "ktaTypeSwatchHtml"].forEach(function(f) {
  const g = charger("js/styleResolver.js", f);
  t("window." + f + "() exposee", typeof g === "function");
});

// ───────── legendCustomization.js ─────────
// 🩸 Une table supprimée mais encore exportée = ReferenceError au chargement : plus aucune légende
// ni type custom, alors que `node -c` passe.
const LC = charger("js/legendCustomization.js", "LegendCustomization", ["js/styleResolver.js"]);
if (LC) {
  const ATTENDU_LC = [
    "loadSessionState", "getSessionState", "isSessionStateEmpty", "loadPlanState",
    "getLabel", "getDefaultLabel", "isVisible", "getSource",
    "listEntries", "listCustomEntries", "findCustomEntry",
    "addCustomEntry", "removeCustomEntry", "ouvrirEditeur",
    // 🩸 `getColor` est appelée par ktaResolveStyle : absente, la carte perd les couleurs choisies.
    "getColor", "setColor", "hasColorOverride",
    "countUsages",   // lu par la confirmation de suppression de l'éditeur
    // 🩸 exporter.js DÉLÈGUE son ajout à ouvrirAddDialog : renommée, le bouton ➕ de l'Export devient
    // un no-op silencieux. listOrphanTypes est lu par le bandeau ⚠️ de la Légende.
    "ouvrirAddDialog", "listOrphanTypes",
    "getBorderColor", "setBorderColor"   // bordure indépendante, lue par ktaResolveStyle
  ];
  ATTENDU_LC.forEach(function(m) {
    t("LegendCustomization." + m + "() exposee", typeof LC[m] === "function");
  });
  ["SCHEMA_VERSION", "DEFAULT_LABELS", "CATEGORIES"].forEach(function(c) {
    t("LegendCustomization." + c + " exposee", LC[c] !== undefined);
  });

  // Le rendu d'une entrée built-in est DÉRIVÉ du style réel, sinon les pastilles virent au gris.
  const traces = LC.listEntries("traces") || [];
  const principal = traces.filter(function(e) { return e.key === "principal"; })[0];
  t("listEntries(traces) rend le built-in principal", !!principal);
  t("pastille d'un trace = sa couleur de trait",
    !!principal && principal.lineColor === "#00ff00");
  const zones = LC.listEntries("zones") || [];
  const eau = zones.filter(function(e) { return e.key === "eau"; })[0];
  t("pastille d'une zone = fond + bordure",
    !!eau && eau.fillColor === "#3aa9e8" && eau.borderColor === "#0066aa");
  const structs = LC.listEntries("structures") || [];
  const front1 = structs.filter(function(e) { return e.key === "front-1"; })[0];
  t("pastille d'un front = un TRAIT, pas un polygone",
    !!front1 && front1.lineColor === "#f4c542" && !front1.fillColor);

  // Override : la pastille suit (via le résolveur), le retrait rend EXACTEMENT la couleur d'origine.
  t("pas d'override au depart", LC.hasColorOverride("traces", "principal") === false);
  LC.setColor("traces", "principal", "#abcdef");
  t("setColor est enregistre", LC.getColor("traces", "principal") === "#abcdef");
  t("hasColorOverride bascule", LC.hasColorOverride("traces", "principal") === true);
  const apres = (LC.listEntries("traces") || []).filter(function(e) { return e.key === "principal"; })[0];
  t("la pastille de l'editeur suit l'override", !!apres && apres.lineColor === "#abcdef");
  t("listEntries expose hasColor", !!apres && apres.hasColor === true);
  LC.setColor("traces", "principal", null);
  t("retrait de l'override = retour au canon",
    LC.getColor("traces", "principal") === null &&
    (LC.listEntries("traces") || []).filter(function(e) { return e.key === "principal"; })[0].lineColor === "#00ff00");

  // 🩸 `hidden` en TABLEAU (forme qui circule, cf createConf) est MIGRÉ en objet au chargement,
  // sinon les lookups rendent undefined et les masquages se perdent en silence.
  LC.loadSessionState({ hidden: ["traces.principal"], labels: {}, customEntries: [] });
  t("hidden en tableau : le masquage est bien applique", LC.isVisible("traces", "principal") === false);
  t("hidden en tableau : les autres types restent visibles", LC.isVisible("traces", "chemin") === true);
  const snapH = LC.getSessionState();
  t("hidden re-serialise en OBJET", !Array.isArray(snapH.hidden) && snapH.hidden["traces.principal"] === true);
  LC.loadSessionState(null);

  // Collision d'id plan/session : UNE seule ligne, variante session.
  LC.__win.PLAN_CONFIG = { customLegend: { labels: {}, hidden: {}, customEntries: [
    { id: "cust-dup", category: "traces", geometry: "polyline", label: "Version PLAN", lineColor: "#111111" },
    { id: "cust-planonly", category: "traces", geometry: "polyline", label: "Plan seul", lineColor: "#222222" }
  ] } };
  LC.loadPlanState();
  LC.loadSessionState({ labels: {}, hidden: {}, customEntries: [
    { id: "cust-dup", category: "traces", geometry: "polyline", label: "Version SESSION", lineColor: "#333333" }
  ] });
  const lst = LC.listCustomEntries("traces");
  t("collision d'id : une seule ligne", lst.filter(function(e) { return e.id === "cust-dup"; }).length === 1);
  t("collision d'id : la variante SESSION gagne",
    lst.filter(function(e) { return e.id === "cust-dup"; })[0].label === "Version SESSION");
  t("l'entree plan sans collision reste listee", lst.some(function(e) { return e.id === "cust-planonly"; }));
  t("ordre historique conserve (plan d'abord)", lst[0].id === "cust-dup" && lst[1].id === "cust-planonly");
  LC.loadSessionState(null);
  // 🩸 Renommer / recolorer une entrée PLAN-LEVEL : `updateCustomEntry` doit la reprendre en
  // session, sinon les types d'un plan importé (import SIG) sont listés mais inertes.
  (function () {
    LC.loadSessionState(null);
    LC.__win.PLAN_CONFIG = { plan: { customLegend: { labels: {}, hidden: {}, customEntries: [
      { id: "cust-sig-structures-l-n1", category: "structures", geometry: "polyline",
        label: "Structure +1", lineColor: "#8cb4ff" }
    ] } } };
    LC.loadPlanState();
    const avant = LC.listCustomEntries("structures").find(function (e) { return e.id === "cust-sig-structures-l-n1"; });
    t("plan-level : l'entrée est listée, source « plan »", !!avant && avant.source === "plan");
    t("plan-level : renommer RETOURNE VRAI (le bug : c'était false)",
      LC.updateCustomEntry("cust-sig-structures-l-n1", { label: "Topo historique" }) === true);
    const apres = LC.listCustomEntries("structures").find(function (e) { return e.id === "cust-sig-structures-l-n1"; });
    t("plan-level : le nouveau nom est servi", !!apres && apres.label === "Topo historique");
    t("plan-level : l'entrée passe en source « session » (l'user l'a reprise)",
      !!apres && apres.source === "session");
    t("plan-level : une seule ligne, pas un doublon",
      LC.listCustomEntries("structures").filter(function (e) { return e.id === "cust-sig-structures-l-n1"; }).length === 1);
    t("plan-level : le résolveur sert le nom repris",
      (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).label === "Topo historique");
    t("plan-level : la géométrie déclarée survit à la promotion",
      (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).geometry === "polyline");
    t("plan-level : recolorer marche aussi (mêmes 3 couleurs, même chemin)",
      LC.updateCustomEntry("cust-sig-structures-l-n1", { lineColor: "#ff0000" }) === true
      && (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).lineColor === "#ff0000");
    t("plan-level : la modification voyage avec la session",
      (LC.getSessionState().customEntries || []).some(function (e) {
        return e.id === "cust-sig-structures-l-n1" && e.label === "Topo historique";
      }));
    LC.loadPlanState();   // recharger le plan ne doit pas ecraser la reprise
    t("plan-level : survit au rechargement du plan",
      (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).label === "Topo historique");
    LC.resetSession();
    t("plan-level : resetSession rend le nom d'origine du plan",
      (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).label === "Structure +1");
    t("plan-level : un id inconnu du plan ET de la session reste refusé",
      LC.updateCustomEntry("cust-inexistant", { label: "x" }) === false);
    LC.__win.PLAN_CONFIG = null;
    LC.loadPlanState();
    LC.loadSessionState(null);
  })();

  LC.__win.PLAN_CONFIG = null;
  LC.loadPlanState();

  // 🩸 La carte doit se REPEINDRE, pas seulement l'état changer : chaque mutation de rendu
  // (setColor, resetSession, add/update/removeCustomEntry) déclenche les render*.
  (function() {
    let repeints = 0;
    ["renderRoads", "renderZones", "renderStructures"].forEach(function(fn) {
      LC.__win[fn] = function() { repeints++; };
    });
    function _mutationRepeint(nom, mutation) {
      repeints = 0;
      mutation();
      t(nom + " repeint la carte", repeints >= 3);
    }
    _mutationRepeint("setColor", function() { LC.setColor("traces", "principal", "#0000aa"); });
    _mutationRepeint("resetSession (bug du restart)", function() { LC.resetSession(); });
    _mutationRepeint("addCustomEntry (C1, l'oublie de la famille)", function() {
      LC.addCustomEntry({ category: "zones", label: "tmpC1", geometry: "polygon", fillColor: "#456789" });
    });
    // addCustomEntry retourne l'ID (string), pas l'entrée.
    const idTmp = LC.addCustomEntry({ category: "traces", label: "tmp", geometry: "polyline", lineColor: "#123123" });
    _mutationRepeint("updateCustomEntry", function() { LC.updateCustomEntry(idTmp, { lineColor: "#321321" }); });
    _mutationRepeint("removeCustomEntry", function() { LC.removeCustomEntry(idTmp); });
    ["renderRoads", "renderZones", "renderStructures"].forEach(function(fn) { delete LC.__win[fn]; });
    LC.loadSessionState(null);
  })();

  // 🩸 Session, plan-config et calques importés sont NON FIABLES : une entrée `null` dans
  // customEntries ferait tomber légende et sidebar au boot. _normalize assainit TOUT.
  t("customLegend = 42 ne casse rien", (function() {
    LC.loadSessionState(42);
    return LC.listCustomEntries("traces").length === 0 && LC.isVisible("traces", "principal");
  })());
  t("entree null/invalide filtree a l'entree", (function() {
    LC.loadSessionState({ labels: {}, hidden: {}, colors: {},
      customEntries: [ {}, { id: "cust-ok", category: "traces", geometry: "polyline", lineColor: "#123456" }, { category: "bidon" }, null ] });
    const l = LC.listCustomEntries("traces");
    return l.length === 1 && l[0].id === "cust-ok";
  })());
  t("labels null / colors tableau -> ignores sans crash", (function() {
    LC.loadSessionState({ labels: null, colors: [], hidden: {}, customEntries: [] });
    return LC.getLabel("traces", "principal") !== null && LC.getColor("traces", "principal") === null;
  })());
  LC.loadSessionState(null);

  // bordure independante : persiste, voyage, se reset.
  LC.setBorderColor("zones", "eau", "#121212");
  t("setBorderColor est enregistre", LC.getBorderColor("zones", "eau") === "#121212");
  t("hasColorOverride vrai sur bordure seule", LC.hasColorOverride("zones", "eau") === true);
  const snapB = LC.getSessionState();
  t("getSessionState embarque les bordures", !!snapB.borders && snapB.borders["zones.eau"] === "#121212");
  LC.loadSessionState(snapB);
  t("recharger la session restaure les bordures", LC.getBorderColor("zones", "eau") === "#121212");
  LC.setBorderColor("zones", "eau", null);
  t("retrait de la bordure -> plus d'override", LC.hasColorOverride("zones", "eau") === false);
  LC.loadSessionState(null);

  // Liaison par id technique : une entrée peut porter l'id EXACT d'un type brut des données.
  const idBas = LC.addCustomEntry({ id: "Bas", category: "zones", geometry: "polygon", label: "Zone basse", fillColor: "#334455" });
  t("addCustomEntry accepte un id explicite", idBas === "Bas");
  t("le resolveur sert le type brut lie", (function() {
    const s = LC.__win.ktaResolveStyle("zones", "Bas");
    return !!s && s.fillColor === "#334455";
  })());
  // re-liaison (double-clic bandeau) : REMPLACE, n'empile pas
  LC.addCustomEntry({ id: "Bas", category: "zones", geometry: "polygon", label: "Zone basse v2", fillColor: "#556677" });
  const lstBas = LC.listCustomEntries("zones").filter(function(e) { return e.id === "Bas"; });
  t("id explicite re-ajoute : remplace, pas de doublon", lstBas.length === 1 && lstBas[0].label === "Zone basse v2");
  // orphelins : un type brut SANS entree est signale, AVEC entree non
  LC.__win.getZones = function() { return [ { type: "Bas" }, { type: "Perdu" }, { type: "eau" } ]; };
  const orph = LC.listOrphanTypes();
  t("type brut sans entree = orphelin signale", orph.some(function(o) { return o.type === "Perdu"; }));
  t("type brut AVEC entree liee = pas orphelin", !orph.some(function(o) { return o.type === "Bas"; }));
  t("type built-in jamais orphelin", !orph.some(function(o) { return o.type === "eau"; }));
  delete LC.__win.getZones;
  LC.loadSessionState(null);

  // 🩸 Les producteurs écrivent `plan.customLegend` (sous-objet) ; la racine reste lue en
  // rétro-compat. Lire une seule forme rend la légende du plan muette.
  LC.__win.PLAN_CONFIG = { plan: { customLegend: { labels: { "traces.principal": "Nom plan" }, hidden: {}, customEntries: [
    { id: "cust-duplan", category: "zones", geometry: "polygon", label: "Du plan", fillColor: "#9a9a9a" }
  ] } } };
  LC.loadPlanState();
  t("C4 : plan.customLegend (sous-objet, forme REELLE des ZIP) est lu",
    LC.getLabel("traces", "principal") === "Nom plan" &&
    LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-duplan"; }));
  LC.__win.PLAN_CONFIG = { customLegend: { labels: { "traces.chemin": "Racine" }, hidden: {}, customEntries: [] } };
  LC.loadPlanState();
  t("C4 : la forme racine reste lue (retro-compat)", LC.getLabel("traces", "chemin") === "Racine");
  LC.__win.PLAN_CONFIG = null;
  LC.loadPlanState();

  // 🩸 suspendPersist coupe SessionPersist pendant le swap du Générateur, sinon la légende du PLAN
  // fuit dans la session du plan chargé.
  (function() {
    let saves = 0;
    LC.__win.SessionPersist = { save: function() { saves++; } };
    LC.suspendPersist(true);
    LC.setColor("traces", "principal", "#0a0a0a");
    t("suspendPersist(true) : aucune ecriture session", saves === 0);
    LC.suspendPersist(false);
    LC.setColor("traces", "principal", null);
    t("suspendPersist(false) : la persistance repart", saves > 0);
    delete LC.__win.SessionPersist;
    LC.loadSessionState(null);
  })();

  // 🩸 Tombstones : une entrée PLAN-LEVEL supprimée ne revient pas du plan-config au rechargement
  // (sinon un type embarqué dans le ZIP est insupprimable).
  LC.__win.PLAN_CONFIG = { plan: { customLegend: { labels: {}, hidden: {}, customEntries: [
    { id: "cust-fantome", category: "zones", geometry: "polygon", label: "Fantôme", fillColor: "#808080" }
  ] } } };
  LC.loadPlanState();
  t("tombstone : l'entrée plan est listée avant suppression",
    LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-fantome"; }));
  t("tombstone : removeCustomEntry accepte une entrée PLAN", LC.removeCustomEntry("cust-fantome") === true);
  t("tombstone : l'entrée plan disparaît de la liste",
    !LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-fantome"; }));
  t("tombstone : findCustomEntry ne la sert plus (résolveur au repli)", LC.findCustomEntry("cust-fantome") === null);
  t("tombstone : persisté dans la session", (LC.getSessionState().removedPlan || []).indexOf("cust-fantome") >= 0);
  LC.loadPlanState();   // re-chargement du plan : elle ne revient PAS
  t("tombstone : survit au rechargement du plan",
    !LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-fantome"; }));
  LC.resetSession();
  t("tombstone : resetSession la fait revenir (voulu et documenté)",
    LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-fantome"; }));
  LC.__win.PLAN_CONFIG = null;
  LC.loadPlanState();
  LC.loadSessionState(null);

  // L'override VOYAGE avec la session, sinon il est perdu au reload.
  LC.setColor("zones", "eau", "#010203");
  const snap = LC.getSessionState();
  t("getSessionState embarque les couleurs", !!snap.colors && snap.colors["zones.eau"] === "#010203");
  LC.loadSessionState(null);
  t("loadSessionState(null) purge les couleurs", LC.getColor("zones", "eau") === null);
  LC.loadSessionState(snap);
  t("recharger la session restaure les couleurs", LC.getColor("zones", "eau") === "#010203");
  LC.loadSessionState(null);
}

console.log(ko === 0 ? "\n🎉 tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
