#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-additionner.js — BLOQUANT (pré-commit, donc CI) : « Additionner » des structures (js/additionnerStructures.js)
// exécuté en Node sur des formes FICTIVES, puis dans un `vm` avec les vrais ktaUid.js et historyManager.js.
// 🩸 Ce qu'il empêche :
//   1. un trait de 3 px qui reste entre deux morceaux d'un pilier (bande non comblée, ou piliers juxtaposés) ;
//   2. une soudure à travers un passage (écart au-delà de la tolérance accepté) ;
//   3. deux types, une structure en ligne ou deux niveaux fondus ensemble ;
//   4. un trou gardé (le contour extérieur seul est voulu) ou un contour perdu (chevauchement, contact en un point) ;
//   5. une identité perdue : la première garde son uid, les autres ont une trace de suppression, UNE étape ⏪,
//      l'événement `mktm:objets-additionnes` part après l'écriture ; lecture seule = rien d'écrit.
// Doc : docs/architecture/plans-loader.md § Additionner des structures
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

let ko = 0;
const t = (n, c, d) => { console.log((c ? "✅" : "❌") + " " + n + (c || d === undefined ? "" : " — " + JSON.stringify(d))); if (!c) ko++; };
const lire = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");
const A = require(path.join(__dirname, "..", "js", "additionnerStructures.js"));

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const aire = (P) => { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j].x * P[i].y - P[i].x * P[j].y; return Math.abs(a / 2); };
const dans = (P, x, y) => {
  let r = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) r = !r;
  }
  return r;
};

// ── 1. Trois rectangles séparés par des traits de 3 px → un seul polygone qui couvre les bandes ──
{
  const r = A.unir([rect(0, 0, 100, 50), rect(103, 0, 200, 50), rect(203, 0, 300, 50)], 6);
  t("trois rectangles à 3 px : additionnés", r.ok, r);
  if (r.ok) {
    t("un rectangle de 4 sommets (sommets alignés retirés)", r.points.length === 4, r.points);
    t("aire = 300 × 50 : les deux bandes sont absorbées", Math.abs(aire(r.points) - 15000) < 1e-6, aire(r.points));
    t("le milieu de chaque bande est dans le résultat", dans(r.points, 101.5, 25) && dans(r.points, 201.5, 25));
  }
  const ordre = A.unir([rect(203, 0, 300, 50), rect(0, 0, 100, 50), rect(103, 0, 200, 50)], 6);
  t("même résultat quel que soit l'ordre des touchers (la suivante = la plus proche)",
    ordre.ok && Math.abs(aire(ordre.points) - 15000) < 1e-6, ordre);
}

// ── 2. Trait en biais : pilier carré coupé par une diagonale de 3 px ──
{
  const h = 3 / Math.SQRT2 / 2 * 2;   // demi-largeur de la bande portée sur les axes (≈ 2,12)
  const a = [{ x: 0, y: 0 }, { x: 100 - h, y: 0 }, { x: 0, y: 100 - h }];
  const b = [{ x: 100, y: h }, { x: 100, y: 100 }, { x: h, y: 100 }];
  const r = A.unir([a, b], 6);
  t("trait en biais : additionné", r.ok, r);
  if (r.ok) {
    t("le milieu de la bande en biais est couvert", dans(r.points, 50, 50) && dans(r.points, 70, 30) && dans(r.points, 30, 70));
    t("aire ≥ somme des deux morceaux", aire(r.points) >= aire(a) + aire(b) - 1e-6, aire(r.points));
  }
}

// ── 3. Contours dentelés (sortie de la détection) séparés par un trait ──
{
  const dent = (x0, x1, y0, y1, pas, sens) => {
    const pts = [];
    for (let y = y0; y <= y1; y += pas) pts.push({ x: x1 + ((y / pas) % 2 ? 0.6 : 0) * sens, y });
    return pts;
  };
  const gauche = [{ x: 0, y: 0 }].concat(dent(0, 60, 0, 40, 4, 1), [{ x: 0, y: 40 }]);
  const droite = dent(0, 63.5, 0, 40, 5, -1).reverse().concat([{ x: 120, y: 40 }, { x: 120, y: 0 }]).reverse();
  const r = A.unir([gauche, droite], 6);
  t("contours dentelés à ~3 px : additionnés en un seul", r.ok, r);
  if (r.ok) {
    let trous = 0;
    for (let y = 1; y < 40; y += 1) if (!dans(r.points, 61.8, y)) trous++;
    t("bande entre deux contours dentelés couverte sur toute sa hauteur", trous === 0, trous);
  }
}

// ── 4. Au-delà de la tolérance : refus, rien de calculé ──
{
  const r = A.unir([rect(0, 0, 100, 50), rect(120, 0, 200, 50)], 6);
  t("écart de 20 px, tolérance 6 : refus « ecart »", !r.ok && r.raison === "ecart" && Math.abs(r.ecart - 20) < 1e-9, r);
  const r2 = A.unir([rect(0, 0, 100, 50), rect(120, 0, 200, 50)], 20);
  t("le même écart passe si la tolérance est portée à 20 px", r2.ok, r2);
  const r3 = A.unir([rect(0, 0, 100, 50), rect(103, 0, 200, 50), rect(400, 0, 500, 50)], 6);
  t("trois formes dont une loin : refus, indice de la forme qui ne touche pas", !r3.ok && r3.raison === "ecart" && r3.indice === 2, r3);
  t("écart entre deux formes", A.ecart(rect(0, 0, 10, 10), rect(13, 0, 20, 10)) === 3 &&
    A.ecart(rect(0, 0, 10, 10), rect(5, 5, 20, 20)) === 0 && A.ecart(rect(0, 0, 100, 100), rect(10, 10, 20, 20)) === 0);
}

// ── 5. Chevauchement accepté ──
{
  const r = A.unir([rect(0, 0, 60, 50), rect(40, 0, 100, 50), rect(30, 20, 70, 80)], 6);
  t("formes qui se chevauchent : union exacte", r.ok && Math.abs(aire(r.points) - (100 * 50 + 40 * 30)) < 1e-6, r.ok ? aire(r.points) : r);
  const inc = A.unir([rect(0, 0, 100, 100), rect(10, 10, 20, 20)], 6);
  t("forme contenue dans une autre : la grande reste", inc.ok && Math.abs(aire(inc.points) - 10000) < 1e-6, inc);
}

// ── 6. Anneau : quatre barres en cadre, séparées par des traits → contour extérieur seul ──
{
  const r = A.unir([rect(0, 0, 100, 10), rect(0, 90, 100, 100), rect(0, 13, 10, 87), rect(90, 13, 100, 87)], 6);
  t("cadre en quatre barres : additionné", r.ok, r);
  if (r.ok) {
    t("contour extérieur seul : le vide du milieu est perdu (aire 100 × 100)",
      Math.abs(aire(r.points) - 10000) < 1e-6 && dans(r.points, 50, 50), aire(r.points));
  }
}

// ── 7. Contact en un seul point (coin contre coin) ──
{
  const r = A.unir([rect(0, 0, 50, 50), rect(50, 50, 100, 100)], 6);
  t("deux carrés coin contre coin : un contour qui garde les deux",
    r.ok && Math.abs(aire(r.points) - 5000) < 1e-6 && dans(r.points, 25, 25) && dans(r.points, 75, 75), r);
  const biais = A.unir([rect(0, 0, 50, 50), rect(53, 53, 100, 100)], 6);
  t("coins écartés en biais (4,2 px, aucun bord en face) : ponts généraux, les deux gardés",
    biais.ok && dans(biais.points, 25, 25) && dans(biais.points, 75, 75) && dans(biais.points, 51.5, 51.5), biais);
}

// ── 7 bis. Le pont est la bande, ni plus ni moins ──
{
  const r = A.unir([rect(0, 0, 100, 50), rect(103, -20, 200, 70)], 6);
  t("voisin plus haut : aire = les deux + la bande 3 × 50 (aucun débord aux bouts du trait)",
    r.ok && Math.abs(aire(r.points) - (5000 + 97 * 90 + 150)) < 1e-6, r.ok ? aire(r.points) : r);
  const gal = A.unir([rect(0, 0, 100, 50), rect(140, 0, 240, 50)], 6);
  t("deux piliers de part et d'autre d'une galerie de 40 px : jamais soudés", !gal.ok && gal.raison === "ecart", gal);
}

// ── 8. Préparer : types, lignes, niveaux, textes perdus ──
const estLigne = (ty) => ["front-1", "front-2", "mur-ligne", "arc"].indexOf(ty) >= 0;
{
  const L = [
    { uid: "st_a_aaaaaa", type: "pilier-1", points: rect(0, 0, 100, 50), description: "Grand pilier" },
    { uid: "st_b_bbbbbb", type: "pilier-2", points: rect(103, 0, 200, 50) },
    { uid: "st_c_cccccc", type: "front-1", points: [{ x: 0, y: 53 }, { x: 100, y: 53 }] },
    { uid: "st_d_dddddd", type: "pilier-1", points: rect(103, 0, 200, 50), level: -1 },
    { uid: "st_e_eeeeee", type: "pilier-1", points: rect(103, 0, 200, 50), description: "Autre texte", nom: "P2" },
    { uid: "st_f_ffffff", type: "pilier-1", points: rect(0, 0, 100, 50) }
  ];
  let p = A.preparer(L, ["st_a_aaaaaa", "st_b_bbbbbb"], { tol: 6, estLigne });
  t("types différents : refus « type »", !p.ok && p.raison === "type" && p.type === "pilier-2" && p.ref === "pilier-1", p);
  p = A.preparer(L, ["st_a_aaaaaa", "st_c_cccccc"], { tol: 6, estLigne });
  t("structure en ligne : refus « ligne »", !p.ok && p.raison === "ligne", p);
  p = A.preparer(L, ["st_a_aaaaaa", "st_d_dddddd"], { tol: 6, estLigne });
  t("niveaux différents : refus « niveau »", !p.ok && p.raison === "niveau", p);
  p = A.preparer(L, ["st_a_aaaaaa"], { tol: 6, estLigne });
  t("une seule structure : refus « minimum »", !p.ok && p.raison === "minimum", p);
  p = A.preparer(L, ["st_a_aaaaaa", "st_z_zzzzzz"], { tol: 6, estLigne });
  t("structure disparue (annulée entre-temps) : refus « disparue »", !p.ok && p.raison === "disparue", p);
  p = A.preparer(L, ["st_a_aaaaaa", "st_e_eeeeee"], { tol: 6, estLigne });
  t("textes différents : listés comme perdus (nom et description de la seconde)",
    p.ok && p.pertes.length === 2 && p.pertes.some((x) => x.champ === "nom" && x.valeur === "P2") &&
    p.pertes.some((x) => x.champ === "description" && x.valeur === "Autre texte"), p.pertes);
  p = A.preparer(L, ["st_f_ffffff", "st_e_eeeeee"], { tol: 6, estLigne });
  t("première sans texte, seconde avec : le texte de la seconde est annoncé perdu (jamais en silence)",
    p.ok && p.pertes.length === 2, p.pertes);
}

// ── 9. Appliquer dans un vm : uid gardé, traces de suppression, UNE étape ⏪, événement, lecture seule ──
{
  const store = { editorPoints: [], roads: [], zones: [], structures: [] };
  const emis = [];
  const w = {
    console: { log() {}, warn() {}, error() {} },
    document: { addEventListener() {}, activeElement: null },
    getEditorPoints: () => store.editorPoints, setEditorPoints: (a) => { store.editorPoints = a || []; },
    getRoads: () => store.roads, setRoads: (a) => { store.roads = a || []; }, resetRoads: () => { store.roads = []; },
    getZones: () => store.zones, setZones: (a) => { store.zones = a || []; }, resetZones: () => { store.zones = []; },
    getStructures: () => store.structures, setStructures: (a) => { store.structures = a || []; },
    resetStructures: () => { store.structures = []; },
    getCurrentRoadIndex: () => -1, getCurrentZoneIndex: () => -1, getCurrentStructureIndex: () => -1,
    setCurrentRoadByIndex() {}, setCurrentZoneByIndex() {}, setCurrentStructureByIndex() {},
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    dispatchEvent(e) { emis.push({ e, traces: w.KtaUid.getTombstones().length, n: store.structures.length }); return true; }
  };
  w.window = w;
  const ctx = vm.createContext(w);
  vm.runInContext("var document = window.document, console = window.console;", ctx);
  vm.runInContext(lire("js/ktaUid.js"), ctx, { filename: "ktaUid.js" });
  vm.runInContext(lire("js/historyManager.js"), ctx, { filename: "historyManager.js" });
  // document sans createElement : seul le moteur est chargé (pas d'interface)
  vm.runInContext(lire("js/additionnerStructures.js"), ctx, { filename: "additionnerStructures.js" });
  const HM = w.HistoryManager, KU = w.KtaUid, AV = w.KtaAdditionner;
  t("vm : moteur chargé sans interface (document sans createElement)", !!AV && typeof AV.ouvrir !== "function");

  const neuf = () => [
    { uid: "st_p1_aaaaaa", updatedAt: 1, type: "pilier-1", points: rect(0, 0, 100, 50), description: "Garde" },
    { uid: "st_p2_bbbbbb", updatedAt: 1, type: "pilier-1", points: rect(103, 0, 200, 50) },
    { uid: "st_p3_cccccc", updatedAt: 1, type: "pilier-1", points: rect(203, 0, 300, 50) },
    { uid: "st_x_dddddd", updatedAt: 1, type: "pilier-1", points: rect(0, 500, 10, 510) }
  ];
  store.structures = neuf();
  KU.setTombstones([]);
  HM.reset();
  w.ktaEditionRefusee = () => true;
  let prep = AV.preparer(store.structures, ["st_p1_aaaaaa", "st_p2_bbbbbb", "st_p3_cccccc"], { tol: 6, estLigne });
  t("🔒 lecture seule : appliquer refuse, rien d'écrit, aucune étape, aucun événement",
    AV.appliquer(prep, "x") === false && store.structures.length === 4 && !HM.canUndo() && emis.length === 0);
  delete w.ktaEditionRefusee;

  prep = AV.preparer(store.structures, ["st_p1_aaaaaa", "st_p2_bbbbbb", "st_p3_cccccc"], { tol: 6, estLigne });
  const ok = AV.appliquer(prep, "Additionner 3");
  const g = store.structures.find((s) => s.uid === "st_p1_aaaaaa");
  const traces = KU.getTombstones().map((x) => x.uid).sort();
  t("appliquer : 2 structures retirées, l'autre structure intacte", ok && store.structures.length === 2 &&
    store.structures.some((s) => s.uid === "st_x_dddddd"), store.structures.map((s) => s.uid));
  t("la première garde son uid, sa description, et prend le contour additionné",
    g && g.description === "Garde" && Math.abs(aire(g.points) - 15000) < 1e-6);
  t("la première est horodatée (updatedAt = maintenant : la synchro prend la nouvelle forme)",
    g && Math.abs(g.updatedAt - Date.now()) < 5000);
  t("traces de suppression des deux autres (synchro)", JSON.stringify(traces) === JSON.stringify(["st_p2_bbbbbb", "st_p3_cccccc"]), traces);
  t("UNE étape dans l'historique", HM._peek ? HM._peek().undo.length === 1 : HM.canUndo());
  t("événement mktm:objets-additionnes APRÈS l'écriture et les traces, détail { famille, uid, absorbes }",
    emis.length === 1 && emis[0].e.type === "mktm:objets-additionnes" && emis[0].traces === 2 && emis[0].n === 2 &&
    emis[0].e.detail.famille === "structures" && emis[0].e.detail.uid === "st_p1_aaaaaa" &&
    JSON.stringify(emis[0].e.detail.absorbes) === JSON.stringify(["st_p2_bbbbbb", "st_p3_cccccc"]), emis.map((x) => x.e.detail));
  HM.undo();
  t("⏪ rend les trois structures d'origine et retire les traces",
    store.structures.length === 4 && ["st_p1_aaaaaa", "st_p2_bbbbbb", "st_p3_cccccc"].every((u) => store.structures.some((s) => s.uid === u)) &&
    KU.getTombstones().length === 0 && Math.abs(aire(store.structures.find((s) => s.uid === "st_p1_aaaaaa").points) - 5000) < 1e-6);
  const perime = AV.preparer(store.structures, ["st_p1_aaaaaa", "st_p2_bbbbbb"], { tol: 6, estLigne });
  store.structures = store.structures.filter((s) => s.uid !== "st_p2_bbbbbb");
  t("préparation périmée (une structure a disparu depuis) : rien d'écrit", AV.appliquer(perime, "x") === false &&
    store.structures.length === 3);
}

// ── 10. Câblage ──
{
  const IDX = lire("index.html"), SW = lire("sw.js"), INTF = lire("js/interface.js"), TBL = lire("js/tableEditor.js");
  const MOD = lire("js/additionnerStructures.js");
  t("index.html charge additionnerStructures.js après structures.js et selectionMulti.js",
    IDX.indexOf('src="js/additionnerStructures.js"') > IDX.indexOf('src="js/selectionMulti.js"') &&
    IDX.indexOf('src="js/selectionMulti.js"') > IDX.indexOf('src="js/structures.js"'));
  t("précaché par le service worker", /"\.\/js\/additionnerStructures\.js"/.test(SW));
  t("bouton dans l'outil Structures et carte dans l'📊 Éditeur de données",
    /KtaAdditionner\.ouvrir\(\)/.test(INTF) && /kta-tbl-src-additionner/.test(TBL) && /KtaAdditionner\.ouvrir\(\)/.test(TBL));
  t("la confirmation des textes perdus ne coupe pas le mode (id exclu de la coupure des modes)",
    /"kta-addit-confirm": true/.test(INTF) && /id: "kta-addit-confirm"/.test(MOD));
  t("🩸 bandeau .kta-iti-floater (aucune fiche au toucher) et mode inscrit au registre",
    /kta-iti-floater kta-addit-floater/.test(MOD) && /ktaInscrireModeClic\(MODE_CLIC, fermer\)/.test(MOD));
  t("jamais de popup native ni de calque.remove()", !/\b(alert|confirm|prompt)\(/.test(MOD.replace(/ktaConfirm\(/g, "")) &&
    !/\.remove\(\)/.test(MOD));
}

console.log(ko ? "\n❌ check-additionner : " + ko + " échec(s)" : "\n✅ check-additionner : tout est vert");
process.exit(ko ? 1 : 0);
