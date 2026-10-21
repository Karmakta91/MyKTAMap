#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-resolution-convert.js — garde-fou pré-commit BLOQUANT de « Recaler des données sur un autre scan »
// =====================================================================
// js/recalageScan.js est CHARGÉ dans un vm (window.KtaRecalageScan, calcul pur) puis éprouvé :
//   - réécriture des coordonnées : 🩸 le champ coordonnée OUBLIÉ est le bug classique, chaque tableau du format
//     est vérifié ;
//   - matrices saisies (homothétie, 1 repère + rotation, 2 repères) et leurs refus ;
//   - recalage par les noms : normalisation, appariement des noms uniques, moindres carrés (similitude, affine),
//     rejet des homonymes aberrants, cas dégénérés, déterminisme ;
//   - repères cliqués : un mauvais clic est signalé ; proportions divergentes détectées ;
//   - câblage : index.html, précache sw.js, appel depuis l'Éditeur de données.
// Jeux de test FICTIFS, fabriqués ici (aucune donnée de relevé).
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c, detail) => {
  console.log((c ? "✅" : "❌") + " " + n + (c || detail === undefined ? "" : " — " + JSON.stringify(detail)));
  if (!c) ko++;
};

const win = { console: { log() {}, warn() {}, error() {} } };
win.window = win;
vm.createContext(win);
try {
  vm.runInContext("var window = this;" + fs.readFileSync("js/recalageScan.js", "utf8"), win);
} catch (e) {
  console.error("❌ js/recalageScan.js ne se charge pas : " + e.message);
  process.exit(1);
}
const K = win.KtaRecalageScan;
if (!K) { console.error("❌ window.KtaRecalageScan absent"); process.exit(1); }
t("le module expose la modale (window.ktaOuvrirRecalageScan)", typeof win.ktaOuvrirRecalageScan === "function");

function fichierTest() {
  return {
    type: "myktamap-session",
    data:         [{ x: 100, y: 200, nom: "P1" }],
    editorPoints: [{ x: 10, y: 20, tags: ["puits"] }, { x: 30.5, y: 40.25 }],
    roads:      [{ type: "principal", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }],
    zones:      [{ type: "eau",       points: [{ x: 5, y: 6 }] }],
    structures: [{ type: "pilier-1",  points: [{ x: 7, y: 8 }] }],
    measure:        { points: [{ x: 9, y: 10 }] },          // forme CALQUE
    measureSurface: [{ x: 11, y: 12 }],                     // forme SESSION (tableau direct)
    customLegend: { labels: { "traces.principal": "X" } }
  };
}
const tr = K.transformerCoordsFichier;

// ── Homothétie ×2/×3 ──
let o = fichierTest();
let compte = tr(o, K.matriceHomothetie(2, 3));
t("points plats ×2/×3", o.data[0].x === 200 && o.data[0].y === 600 && o.editorPoints[0].x === 20 && o.editorPoints[0].y === 60);
t("géométries roads/zones/structures converties",
  o.roads[0].points[1].x === 6 && o.roads[0].points[1].y === 12 &&
  o.zones[0].points[0].x === 10 && o.structures[0].points[0].y === 24);
t("mesure forme calque ({points}) convertie", o.measure.points[0].x === 18 && o.measure.points[0].y === 30);
t("mesure forme session (tableau) convertie", o.measureSurface[0].x === 22 && o.measureSurface[0].y === 36);
t("les champs non-coordonnées sont intacts",
  o.data[0].nom === "P1" && o.editorPoints[0].tags[0] === "puits" && o.customLegend.labels["traces.principal"] === "X");
t("le compte couvre les 7 tableaux",
  compte.data === 1 && compte.editorPoints === 2 && compte.roads === 2 &&
  compte.zones === 1 && compte.structures === 1 && compte.measure === 1 && compte.measureSurface === 1);

// ── 1 repère saisi : l'ancre tombe EXACTEMENT ──
let M = K.matriceRecalage(2, 2, 0, { x: 100, y: 200 }, { x: 750, y: 950 });
o = fichierTest(); tr(o, M);
t("1 repère : l'ancre tombe exactement sur sa cible", o.data[0].x === 750 && o.data[0].y === 950);
M = K.matriceRecalage(2, 2, 0, { x: 0, y: 0 }, { x: 500, y: 600 });
o = { data: [{ x: 10, y: 0 }] }; tr(o, M);
t("1 repère : translation + échelle cohérentes", o.data[0].x === 520 && o.data[0].y === 600);
// ⚠️ θ>0 = HORAIRE à l'écran (repère y vers le bas) : +x devient +y
M = K.matriceRecalage(1, 1, 90, { x: 0, y: 0 }, { x: 0, y: 0 });
o = { data: [{ x: 100, y: 0 }] }; tr(o, M);
t("θ=90° : la droite devient le bas (horaire visuel)", Math.abs(o.data[0].x) < 0.01 && Math.abs(o.data[0].y - 100) < 0.01);

// ── 2 repères saisis ──
M = K.matriceDeuxPaires({ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }, { x: 50, y: 250 });
t("2 repères : échelle 2 et rotation 90° déduites", M && Math.abs(M._s - 2) < 1e-9 && Math.abs(M._thetaDeg - 90) < 1e-9);
o = { data: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }] }; tr(o, M);
t("2 repères : les ancres tombent juste, l'intermédiaire est interpolé",
  o.data[0].x === 50 && o.data[0].y === 50 && o.data[1].x === 50 && o.data[1].y === 250 && o.data[2].y === 150);
const Minv = K.matriceDeuxPaires({ x: 50, y: 50 }, { x: 0, y: 0 }, { x: 50, y: 250 }, { x: 100, y: 0 });
o = fichierTest(); tr(o, M); tr(o, Minv);
const ref = fichierTest();
t("aller-retour (M puis M⁻¹) = identité (± 0,02 px)",
  Math.max(Math.abs(o.editorPoints[1].x - ref.editorPoints[1].x), Math.abs(o.roads[0].points[0].y - ref.roads[0].points[0].y)) <= 0.02);
t("2 repères : base < 10 px → null", K.matriceDeuxPaires({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 100, y: 0 }) === null);
t("1 repère : ancre manquante → null", K.matriceRecalage(2, 2, 0, null, { x: 0, y: 0 }) === null);
o = { data: [{ x: 33, y: 77 }] }; tr(o, K.matriceHomothetie(1 / 3, 1 / 7));
t("arrondi centipixel (2 décimales max)", o.data[0].x === 11 && o.data[0].y === 11);
o = fichierTest(); tr(o, K.matriceHomothetie(1, 1));
t("facteur 1 : aucune modification", JSON.stringify(o) === JSON.stringify(fichierTest()));
t("objet vide / null / matrice null : pas de crash",
  Object.keys(tr({}, K.matriceHomothetie(2, 2))).length === 0 && Object.keys(tr(null, K.matriceHomothetie(2, 2))).length === 0 &&
  Object.keys(tr(fichierTest(), null)).length === 0);
o = { roads: [{ type: "x" }, null, { type: "y", points: [{ x: "a", y: 2 }, { x: 1, y: 2 }] }] };
compte = tr(o, K.matriceHomothetie(2, 2));
t("géométrie sans points / ligne null / point malformé : ignorés proprement", compte.roads === 1 && o.roads[2].points[1].x === 2);

// ── Normalisation et appariement ──
t("normalisation : casse, accents, ponctuation, espaces",
  K.normaliserNom("Salle-du Puits") === K.normaliserNom("SALLE DU PUITS") &&
  K.normaliserNom("salle_dù  puits.") === "salledupuits" && K.normaliserNom(null) === "");
const pn = K.pointsNommes({ data: [{ nom: "Alpha", x: 1, y: 2 }, { id: "Bravo", x: 3, y: 4 }, { nom: "", id: "Charlie", x: 5, y: 6 },
  { nom: "Sans coord" }, { x: 7, y: 8 }], editorPoints: [{ nom: "Delta", x: 9, y: 10 }] });
t("points nommés : nom, sinon id ; sans nom ou sans coordonnées ignorés",
  pn.length === 4 && pn[1].nom === "Bravo" && pn[2].nom === "Charlie" && pn[3].nom === "Delta");
const app = K.apparierParNoms(
  [{ nom: "Galerie Nord", x: 0, y: 0 }, { nom: "Puits A", x: 1, y: 1 }, { nom: "Puits A", x: 2, y: 2 },
   { nom: "P1", x: 3, y: 3 }, { nom: "Carrefour", x: 4, y: 4 }, { nom: "Seul ici", x: 5, y: 5 }],
  [{ nom: "GALERIE-NORD", x: 10, y: 10 }, { nom: "puits a", x: 11, y: 11 }, { nom: "P1", x: 13, y: 13 },
   { nom: "Carrefour", x: 14, y: 14 }, { nom: "carrefour", x: 15, y: 15 }]);
t("appariement : seuls les noms uniques des deux côtés (≥ 4 caractères) forment une paire",
  app.paires.length === 1 && app.paires[0].nom === "Galerie Nord" && app.paires[0].B.x === 10, app);
t("appariement : les noms portés deux fois sont comptés ambigus (pas devinés)", app.ambigus === 2, app.ambigus);

// ── Appariement par uid (même Générateur), prioritaire sur le nom ──
const fU = { data: [{ nom: "Sans nom commun 1", uid: "pt_a", x: 0, y: 0 }, { nom: "Galerie Nord", uid: "pt_b", x: 10, y: 0 },
                    { nom: "Carrefour Est", x: 20, y: 5 }, { nom: "Double", uid: "pt_d", x: 1, y: 1 }, { nom: "Double2", uid: "pt_d", x: 2, y: 2 }],
             roads: [{ type: "principal", uid: "rd_1", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 9 }] },
                     { type: "principal", uid: "rd_2", points: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }],
             zones: [{ type: "eau", uid: "zn_1", points: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }] }] };
const pU = { data: [{ nom: "Autre nom", uid: "pt_a", x: 100, y: 100 }, { nom: "Galerie Nord", uid: "pt_b", x: 110, y: 100 },
                    { nom: "Galerie Nord bis", x: 999, y: 999 }, { nom: "Carrefour Est", x: 120, y: 105 }, { nom: "Double", uid: "pt_d", x: 5, y: 5 }],
             roads: [{ type: "principal", uid: "rd_1", points: [{ x: 100, y: 100 }, { x: 105, y: 105 }, { x: 109, y: 109 }] },
                     { type: "principal", uid: "rd_2", points: [{ x: 101, y: 100 }, { x: 102, y: 100 }, { x: 103, y: 100 }] }],
             zones: [{ type: "eau", uid: "zn_1", points: [{ x: 100, y: 101 }, { x: 101, y: 101 }, { x: 101, y: 102 }] }] };
const U = K.apparierParUid(fU, pU);
t("uid : un point apparié même si son nom diffère", U.paires.some(p => p.A.x === 0 && p.A.y === 0 && p.B.x === 100 && p.source === "uid"));
t("uid : tracé et zone au même nombre de sommets → une paire par sommet",
  U.paires.filter(p => /^principal #/.test(p.nom)).length === 3 && U.paires.filter(p => /^eau #/.test(p.nom)).length === 3);
t("uid : tracé au nombre de sommets différent → ignoré (et compté)", U.geoIgnores === 1 && !U.paires.some(p => p.A.x === 1 && p.A.y === 0));
t("uid : un uid présent deux fois d'un côté est ignoré", U.doubles === 1 && !U.paires.some(p => p.B.x === 5));
const AP = K.apparier(fU, pU);
t("mixte : uid d'abord, puis le nom sur les points restants (dont l'objet à uid en double, repris par son nom)",
  AP.nUid === 2 + 3 + 3 && AP.nNoms === 2 &&
  AP.paires.filter(p => p.source === "nom").map(p => p.nom).sort().join("|") === "Carrefour Est|Double", AP);
t("mixte : un objet apparié par uid n'est pas réapparié par son nom",
  AP.paires.filter(p => p.nom === "Galerie Nord").length === 1 && AP.paires.find(p => p.nom === "Galerie Nord").source === "uid");
t("noms seuls : sans uid nulle part, l'appariement retombe sur les noms",
  K.apparier({ data: [{ nom: "Carrefour Est", x: 1, y: 1 }] }, { data: [{ nom: "carrefour-est", x: 2, y: 2 }] }).nNoms === 1);
t("sources comptées (uid / noms)", JSON.stringify(K.compterSources(AP.paires)) === JSON.stringify({ uid: 8, nom: 2 }));

// ── Jeux fictifs : relevé de référence + version transformée ──
function alea(graine) { let s = graine >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function releve(n, graine) {
  const r = alea(graine), out = [];
  for (let i = 0; i < n; i++) out.push({ nom: "Repère fictif " + i, x: Math.round(r() * 8000), y: Math.round(r() * 6000) });
  return out;
}
function similitude(s, deg, tx, ty) {
  const a = deg * Math.PI / 180;
  return { a: s * Math.cos(a), b: -s * Math.sin(a), c: s * Math.sin(a), d: s * Math.cos(a), e: tx, f: ty };
}
function paires(pts, Mv, bruit, graine) {
  const r = alea(graine || 1);
  return pts.map(function (p) {
    const q = K.appliquer(Mv, p);
    return { nom: p.nom, A: { x: p.x, y: p.y }, B: { x: q.x + (r() - 0.5) * 2 * (bruit || 0), y: q.y + (r() - 0.5) * 2 * (bruit || 0) } };
  });
}
const proche = (a, b, eps) => Math.abs(a - b) <= eps;

const VRAI = similitude(0.8, 0, -939, 16);
let P = paires(releve(60, 42), VRAI);
let S = K.similitudeMC(P);
t("similitude MC : échelle 0,8 · rotation 0 · décalage (−939, +16) retrouvés",
  S && proche(S._s, 0.8, 1e-9) && proche(S._thetaDeg, 0, 1e-7) && proche(S.e, -939, 1e-6) && proche(S.f, 16, 1e-6), S);
const VRAI2 = similitude(1.37, -23.5, 410, -1200);
S = K.similitudeMC(paires(releve(30, 7), VRAI2));
t("similitude MC : rotation −23,5° et échelle 1,37 retrouvées", S && proche(S._s, 1.37, 1e-9) && proche(S._thetaDeg, -23.5, 1e-7), S);
t("similitude MC : 1 paire → null", K.similitudeMC(P.slice(0, 1)) === null);
t("similitude MC : repères confondus → null",
  K.similitudeMC([{ A: { x: 5, y: 5 }, B: { x: 1, y: 1 } }, { A: { x: 5, y: 5 }, B: { x: 9, y: 9 } }, { A: { x: 6, y: 5 }, B: { x: 3, y: 3 } }]) === null);

const AFF = { a: 0.8, b: 0.05, c: -0.02, d: 0.86, e: 120, f: -40 };
const A = K.affineMC(paires(releve(25, 9), AFF));
t("affine MC : 6 paramètres retrouvés (étirement + cisaillement)",
  A && proche(A.a, 0.8, 1e-9) && proche(A.b, 0.05, 1e-9) && proche(A.c, -0.02, 1e-9) && proche(A.d, 0.86, 1e-9) &&
  proche(A.e, 120, 1e-6) && proche(A.f, -40, 1e-6), A);
t("affine MC : repères alignés → null",
  K.affineMC([0, 1, 2, 3].map(i => ({ A: { x: i * 100, y: i * 50 }, B: { x: i * 80, y: i * 40 } }))) === null);
t("affine MC : 2 paires → null", K.affineMC(P.slice(0, 2)) === null);

// Aberrants : homonymes posés ailleurs sur le plan d'arrivée.
function avecAberrants(base, nb, graine) {
  const r = alea(graine), out = base.slice();
  const pris = new Set();
  while (pris.size < nb) {
    const k = Math.floor(r() * out.length);
    if (pris.has(k)) continue;
    pris.add(k);
    out[k] = { nom: out[k].nom + " (homonyme)", A: out[k].A,
               B: { x: out[k].B.x + 150 + r() * 3000, y: out[k].B.y - 80 - r() * 2000 }, aberrant: true };
  }
  return out;
}
P = avecAberrants(paires(releve(73, 3), VRAI), 6, 11);
let R = K.estimerRobuste(P);
t("robuste : les 6 homonymes aberrants sont écartés, et eux seuls",
  R && !R.err && R.ecartees.length === 6 && R.ecartees.every(e => /homonyme/.test(e.nom)), R && R.ecartees);
t("robuste : écart médian ≈ 0 px et 90 % sous 0,01 px sur les 67 retenus",
  R && R.stats.mediane < 0.01 && R.stats.p90 < 0.01 && R.stats.n === 67, R && R.stats);
t("robuste : échelle et décalage vrais retrouvés malgré les aberrants",
  R && proche(R.M._s, 0.8, 1e-9) && proche(R.M.e, -939, 1e-6) && proche(R.M.f, 16, 1e-6));
t("robuste : l'affine n'est PAS proposée quand la similitude suffit", R && R.affineMeilleure === false);
const R2 = K.estimerRobuste(P);
t("robuste : déterministe (même entrée, même résultat)", R2 && R2.M.e === R.M.e && R2.ecartees.length === R.ecartees.length);

// 30 % d'aberrants + bruit de mesure ±0,5 px : le consensus tient.
P = avecAberrants(paires(releve(50, 5), VRAI2, 0.5, 3), 15, 21);
R = K.estimerRobuste(P);
t("robuste : 30 % d'aberrants et bruit ±0,5 px → les 15 aberrants écartés, au plus 1 bon perdu",
  R && !R.err && R.ecartees.filter(e => /homonyme/.test(e.nom)).length === 15 &&
  R.ecartees.filter(e => !/homonyme/.test(e.nom)).length <= 1 && R.stats.mediane < 0.7, R && { st: R.stats, ec: R.ecartees.length });

// Scan étiré : l'affine est proposée.
R = K.estimerRobuste(paires(releve(40, 13), { a: 0.8, b: 0, c: 0, d: 0.84, e: -900, f: 10 }));
t("robuste : scan étiré (0,80 × 0,84) → affine proposée et quasi exacte",
  R && R.affineMeilleure === true && R.affine.stats.p90 < 0.01, R && { sim: R.stats, aff: R.affine && R.affine.stats });

// uid seul : noms tous différents d'un côté à l'autre, un objet déplacé à la main sur le nouveau scan (aberrant).
const relU = releve(30, 31);
const fichU = { data: relU.map((p, i) => ({ nom: "Ancien " + i, uid: "pt_u" + i, x: p.x, y: p.y })) };
const planU = { data: relU.map((p, i) => Object.assign({ nom: "Nouveau " + i, uid: "pt_u" + i }, K.appliquer(VRAI2, p))) };
planU.data[4].x += 700;
const APu = K.apparier(fichU, planU);
R = K.estimerRobuste(APu.paires);
t("uid seul : 30 repères par uid, aucun par nom, l'objet déplacé est écarté, écart ≈ 0",
  APu.nUid === 30 && APu.nNoms === 0 && R && R.ecartees.length === 1 && R.ecartees[0].nom === "Ancien 4" &&
  R.stats.mediane < 0.01 && proche(R.M._s, 1.37, 1e-9), R && { st: R.stats, ec: R.ecartees });

t("robuste : moins de 3 paires → refus « peu »", K.estimerRobuste(P.slice(0, 2)).err === "peu");
t("robuste : repères tous confondus → refus « degenere »",
  K.estimerRobuste([0, 1, 2, 3].map(() => ({ nom: "x", A: { x: 1, y: 1 }, B: { x: 2, y: 2 } }))).err === "degenere");
const grand = paires(releve(2000, 77), VRAI, 0.3, 5);
const t0 = Date.now();
R = K.estimerRobuste(grand);
t("robuste : 2 000 repères traités en moins de 4 s", R && !R.err && Date.now() - t0 < 4000, Date.now() - t0);
// 10 000 paires (sommets de tracés appariés par uid) : recherche de départ échantillonnée, rejet sur tout.
// Borne large : quelques centaines de ms sur poste ; un retour au quadratique la dépasse nettement.
const tres = avecAberrants(paires(releve(10000, 55), VRAI2, 0.3, 9), 400, 41);
const t1 = Date.now();
R = K.estimerRobuste(tres);
const dt1 = Date.now() - t1;
t("robuste : 10 000 paires (4 % d'aberrants) en moins de 5 s, aberrants tous écartés, écart < 0,5 px",
  R && !R.err && dt1 < 5000 && R.ecartees.filter(e => /homonyme/.test(e.nom)).length === 400 &&
  R.stats.n >= 9600 - 5 && R.stats.mediane < 0.5, R && { ms: dt1, st: R.stats, ec: R.ecartees.length });

// ── Repères cliqués ──
const clics = paires(releve(4, 99), VRAI, 1, 8);
clics[2] = { nom: clics[2].nom, A: clics[2].A, B: { x: clics[2].B.x + 40, y: clics[2].B.y - 30 } };
const E = K.estimerReperes(clics);
t("repères cliqués : le mauvais clic (50 px) est signalé, et lui seul",
  E && E.suspects[2] === true && E.suspects.filter(Boolean).length === 1, E && { ecarts: E.ecarts, seuil: E.seuil });
t("repères cliqués : 1 repère → null", K.estimerReperes(clics.slice(0, 1)) === null);

// ── Proportions ──
t("proportions identiques (×0,8) → écart 0", K.ecartProportions(10000, 8000, 8000, 6400) === 0);
t("proportions divergentes (cadrages différents) → au-delà du seuil bloquant",
  K.ecartProportions(10000, 8000, 7100, 6160) > K.PROPORTIONS_MAX);

// ── Câblage ──
const IDX = fs.readFileSync("index.html", "utf8");
const SW = fs.readFileSync("sw.js", "utf8");
const TE = fs.readFileSync("js/tableEditor.js", "utf8");
t("câblage : index.html charge js/recalageScan.js", /src="js\/recalageScan\.js"/.test(IDX));
t("câblage : le module est précaché (sw.js)", SW.indexOf('"./js/recalageScan.js"') >= 0);
t("câblage : la tuile de l'Éditeur de données ouvre l'outil", TE.indexOf("window.ktaOuvrirRecalageScan()") >= 0);
// 🩸 Une seconde copie du calcul dans tableEditor.js dériverait sans bruit (une seule source : recalageScan.js).
t("câblage : plus aucune copie de l'ancien convertisseur dans tableEditor.js",
  !/function _matrice|function _transformerCoordsFichier|_ouvrirConvertResolution/.test(TE));

console.log(ko === 0 ? "\n🎉 recalage sur un autre scan : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
