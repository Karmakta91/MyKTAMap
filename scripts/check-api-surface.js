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
