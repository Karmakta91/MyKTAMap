#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧹 check-secours-balayage.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Lot C1 de l'audit Secours (QCM KARMA du 15/10/2026) : découpage du réseau en
// secteurs équilibrés et parcours de balayage. ON EXÉCUTE le vrai moteur
// (js/secoursBalayage.js) sur le vrai graphe (js/pathfinder.js), en VM, avec un
// réseau synthétique : boucles, culs-de-sac, deux niveaux reliés par un puits,
// un bout isolé.
//
// 🩸 CE QUI RÉGRESSE SANS BRUIT :
//   1. Une galerie oubliée par le parcours (le défaut d'origine : 62-72 % de
//      couverture avec des étapes) — on vérifie que CHAQUE pièce est parcourue.
//   2. Une galerie comptée deux fois (segment d'origine + morceaux coupés aux
//      croisements) : longueurs et charges faussées.
//   3. Des secteurs déséquilibrés ou en plusieurs morceaux.
//   4. Le parcours ne part pas de l'entrée ou n'arrive pas à la sortie.
// Usage : node scripts/check-secours-balayage.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");

let echecs = 0;
function t(msg, cond, detail) {
  console.log((cond ? "✅ " : "❌ ") + msg + (cond || detail === undefined ? "" : " — " + JSON.stringify(detail)));
  if (!cond) echecs++;
}

function charger(roads) {
  const win = { console: { log() {}, warn() {} }, APP_CONFIG: { scale: 1, multiLevel: true },
    getRoads: () => roads, getAllEmbeddedRoads: () => [] };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/pathfinder.js"), "utf8"), win);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/secoursBalayage.js"), "utf8"), win);
  return { graph: win.Pathfinder.buildNetworkGraph({ includeZones: true }), SB: win.SecoursBalayage };
}
const L = (pts) => pts.reduce((s, p, i) => i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0, 0);

// ---------- Réseau synthétique ----------
// Niveau 0 : grille 4 × 4 de 100 px (24 galeries, des boucles) faite de LONGS tracés
// qui se croisent (l'enrichissement les coupe), + 3 culs-de-sac. Niveau −1 : une
// galerie en L reliée au niveau 0 par un puits (jonction). Un bout isolé, injoignable.
const roads = [];
for (let i = 0; i < 4; i++) {
  roads.push({ type: "principal", level: 0, points: [{ x: 0, y: i * 100 }, { x: 300, y: i * 100 }] });
  roads.push({ type: "principal", level: 0, points: [{ x: i * 100, y: 0 }, { x: i * 100, y: 300 }] });
}
roads.push({ type: "secondaire", level: 0, points: [{ x: 300, y: 300 }, { x: 380, y: 380 }] });   // cul-de-sac
roads.push({ type: "secondaire", level: 0, points: [{ x: 0, y: 0 }, { x: -60, y: -60 }] });        // cul-de-sac
roads.push({ type: "chemin", level: 0, points: [{ x: 300, y: 150 }, { x: 360, y: 150 }] });         // cul-de-sac
roads.push({ type: "jonction", fromLevel: 0, toLevel: -1, points: [{ x: 0, y: 300 }, { x: 0, y: 302 }] });
roads.push({ type: "principal", level: -1, points: [{ x: 0, y: 302 }, { x: -200, y: 302 }, { x: -200, y: 500 }] });
roads.push({ type: "principal", level: 0, points: [{ x: 900, y: 900 }, { x: 1000, y: 900 }] });       // isolé
const totalTraces = roads.reduce((s, r) => s + L(r.points), 0);

const { graph, SB } = charger(roads);
const P = SB.pieces(graph);
const totalPieces = P.reduce((s, p) => s + p.len, 0);

// ---------- 1. Pièces ----------
t("pièces : la longueur totale = celle des tracés (rien de compté deux fois aux croisements)",
  Math.abs(totalPieces - totalTraces) < 1, { totalPieces, totalTraces });
t("pièces : les longs tracés sont coupés à chaque croisement (≥ 24 pièces dans la grille)",
  P.filter((p) => graph.segments[p.seg].level === 0).length >= 24);
t("pièces : chacune connaît son tracé d'origine", P.every((p) => roads.indexOf(graph.segments[p.seg].road) >= 0));

// ---------- 2. Découpage ----------
const depart = { x: 0, y: 0 };
const D = SB.decouper(graph, { n: 3, depart: depart });
t("découpage : 3 secteurs", D.secteurs.length === 3);
const isoles = D.horsReseau.map((i) => graph.segments[P[i].seg].road);
t("découpage : le bout isolé est signalé « hors réseau », rien d'autre",
  D.horsReseau.length >= 1 && isoles.every((r) => r === roads[roads.length - 1]), D.horsReseau.length);
const affectees = D.secteurs.reduce((s, x) => s + x.pieces.length, 0);
t("découpage : toute pièce atteignable est dans exactement un secteur",
  affectees + D.horsReseau.length === P.length &&
  new Set([].concat.apply([], D.secteurs.map((x) => x.pieces))).size === affectees);
const charges = D.secteurs.map((x) => x.longueur);
t("découpage : secteurs équilibrés (max/min ≤ 1,6)", Math.max.apply(null, charges) / Math.min.apply(null, charges) <= 1.6, charges);
// Continuité : les pièces d'un secteur forment un seul morceau (via leurs nœuds et les raccords du graphe).
const continu = D.secteurs.every((x) => {
  const noeuds = new Set();
  x.pieces.forEach((i) => { noeuds.add(P[i].a); noeuds.add(P[i].b); });
  const vus = new Set(), pile = [P[x.pieces[0]].a];
  const adj = {};
  x.pieces.forEach((i) => { (adj[P[i].a] = adj[P[i].a] || []).push(P[i].b); (adj[P[i].b] = adj[P[i].b] || []).push(P[i].a); });
  while (pile.length) { const n = pile.pop(); if (vus.has(n)) continue; vus.add(n); (adj[n] || []).forEach((m) => pile.push(m)); }
  return [...noeuds].every((n) => vus.has(n));
});
t("découpage : chaque secteur est d'un seul tenant", continu);

// Plusieurs accès : chaque secteur reçoit le plus proche par les galeries.
const D2a = SB.decouper(graph, { n: 2, departs: [{ x: 0, y: 0 }, { x: 300, y: 300 }] });
t("accès : chaque secteur reçoit l'accès le plus proche de son germe", D2a.secteurs.length === 2 && D2a.secteurs.every((x) => {
  const G = graph.nodes[x.germe];
  const proche = Math.hypot(G.x, G.y) <= Math.hypot(G.x - 300, G.y - 300) ? 0 : 1;
  return x.acces === proche;
}), D2a.secteurs.map((x) => x.acces));
t("accès : sans accès fourni, acces = −1", D.secteurs.every((x) => x.acces === 0) &&
  SB.decouper(graph, { n: 2 }).secteurs.every((x) => x.acces === -1));

// ---------- 3. Parcours complet ----------
function couvreTout(res, idx) {
  const pas = new Set();
  for (let k = 1; k < res.path.length; k++) {
    const a = res.path[k - 1], b = res.path[k];
    pas.add(a.x + "," + a.y + "|" + b.x + "," + b.y); pas.add(b.x + "," + b.y + "|" + a.x + "," + a.y);
  }
  return idx.filter((i) => {
    const A = graph.nodes[P[i].a], B = graph.nodes[P[i].b];
    return !pas.has(A.x + "," + A.y + "|" + B.x + "," + B.y);
  });
}
const tout = P.map((_, i) => i).filter((i) => D.horsReseau.indexOf(i) < 0);
const R = SB.parcours(graph, tout, { depart: depart, mode: "complet" });
t("complet : un parcours est rendu", !!(R && R.path.length > 2));
const oubliees = couvreTout(R, tout);
t("🩸 complet : CHAQUE galerie est parcourue (le défaut d'origine : 62-72 %)", oubliees.length === 0, oubliees.length);
t("complet : part de l'entrée et y revient",
  R.path[0].x === 0 && R.path[0].y === 0 && R.path[R.path.length - 1].x === 0 && R.path[R.path.length - 1].y === 0);
t("complet : longueur ≥ galeries à couvrir et raisonnable (≤ 1,6 ×)",
  R.longueur >= R.aCouvrir - 1 && R.longueur <= 1.6 * R.aCouvrir, { l: R.longueur, c: R.aCouvrir });
t("complet : tout est couvert (couvert = à couvrir)", Math.abs(R.couvert - R.aCouvrir) < 1);
t("complet : chaque pas suit une galerie ou un raccord (aucun saut à travers la roche)", (() => {
  const cle = (n) => n.x + "," + n.y;
  const idx = {}; graph.nodes.forEach((n, i) => { idx[cle(n)] = i; });
  for (let k = 1; k < R.path.length; k++) {
    const a = idx[cle(R.path[k - 1])], b = idx[cle(R.path[k])];
    // une arête du graphe, ou une pièce (deux croisements consécutifs d'un même segment)
    if (!graph.edges[a].some((e) => e.to === b) && !P.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))) return false;
  }
  return true;
})());
t("complet : les niveaux sont rendus (0 et −1 présents)",
  R.path.some((p) => p.level === 0) && R.path.some((p) => p.level === -1));

// ---------- 4. Arrivée distincte ----------
const R2 = SB.parcours(graph, tout, { depart: depart, arrivee: { x: 300, y: 300 }, mode: "complet" });
t("entrée ≠ sortie : part de l'entrée, finit à la sortie",
  R2.path[0].x === 0 && R2.path[0].y === 0 && R2.path[R2.path.length - 1].x === 300 && R2.path[R2.path.length - 1].y === 300);
t("entrée ≠ sortie : toujours tout parcouru", couvreTout(R2, tout).length === 0);

// ---------- 5. Ossature ----------
const O = SB.parcours(graph, tout, { depart: depart, mode: "ossature" });
const culsDeSac = P.map((_, i) => i).filter((i) => [roads[8], roads[10]].indexOf(graph.segments[P[i].seg].road) >= 0);
t("ossature : plus court que le complet", O.longueur < R.longueur, { o: O.longueur, c: R.longueur });
t("ossature : les culs-de-sac ne sont pas parcourus", couvreTout(O, culsDeSac).length === culsDeSac.length);
t("ossature : les boucles de la grille le sont", couvreTout(O, tout.filter((i) => {
  const r = graph.segments[P[i].seg].road; return roads.indexOf(r) < 8;
})).length === 0);

// ---------- 6. Un secteur seul ----------
const S0 = D.secteurs[0];
const RS = SB.parcours(graph, S0.pieces, { depart: depart, mode: "complet" });
t("secteur : tout le secteur est parcouru, approche comprise", RS && couvreTout(RS, S0.pieces).length === 0);

// ---------- 6 bis. Câblage dans l'app (décisions 3:a et 4:a) ----------
{
  const SM = fs.readFileSync(path.join(ROOT, "js/secoursMode.js"), "utf8");
  const II = fs.readFileSync(path.join(ROOT, "js/interfaceItineraire.js"), "utf8");
  t("🩸 une équipe en balayage n'est pas recalculée en plus court chemin (sync et à l'export)",
    SM.includes("if (_estBalayage(g)) return _appliquerBalayage(") &&
    SM.includes("if (_estBalayage(g)) { resolve(!!_appliquerBalayage("));
  t("« Suivre mon parcours » emporte le circuit pour le guidage", SM.includes("road.secours.balayage = points.map"));
  t("🩸 après un écart, le guidage REJOINT le circuit et en garde la suite (pas de plus court chemin)",
    /Array\.isArray\(sec\.balayage\)[\s\S]{0,2600}rj\.path\.concat\(B\.slice\(k \+ 1\)\)[\s\S]{0,1400}return;\s*\}\s*const result = await/.test(II));
  t("la progression sur le circuit est notée pendant la marche", SM.includes("if (pos) _avancerBalayage(road, pos);"));
  t("les étapes sont remises dans l'ordre du circuit", SM.includes("partiel.intermediaires = inter;"));
}

// ---------- 7. Tenue en charge ----------
{
  const big = [];
  const n = 60;
  for (let i = 0; i <= n; i++) {
    big.push({ type: "principal", level: 0, points: [{ x: 0, y: i * 50 }, { x: n * 50, y: i * 50 }] });
    big.push({ type: "principal", level: 0, points: [{ x: i * 50, y: 0 }, { x: i * 50, y: n * 50 }] });
  }
  const g2 = charger(big);
  const t0 = Date.now();
  const P2 = g2.SB.pieces(g2.graph);
  const D2 = g2.SB.decouper(g2.graph, { n: 6, depart: { x: 0, y: 0 } });
  const R3 = g2.SB.parcours(g2.graph, D2.secteurs[0].pieces, { depart: { x: 0, y: 0 }, mode: "complet" });
  const ms = Date.now() - t0;
  const c2 = D2.secteurs.map((x) => x.longueur);
  t("charge : 6 secteurs équilibrés sur la grande grille (max/min ≤ 1,5)",
    D2.secteurs.length === 6 && Math.max.apply(null, c2) / Math.min.apply(null, c2) <= 1.5, c2.map(Math.round));
  t("charge : le parcours du secteur couvre tout le secteur", Math.abs(R3.couvert - R3.aCouvrir) < 1 && R3.couvert > 0);
  t("charge : grille de " + P2.length + " pièces, découpage en 6 + un parcours en < 8 s (" + ms + " ms)", ms < 8000 && !!R3);
}

console.log("");
if (echecs) { console.log("💥 balayage Secours : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 balayage Secours : secteurs équilibrés et d'un seul tenant, chaque galerie parcourue");
