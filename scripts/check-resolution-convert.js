#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-resolution-convert.js — garde-fou pré-commit BLOQUANT du convertisseur résolution/recalage
// =====================================================================
// Éditeur de données (js/tableEditor.js, fonctions réelles extraites) : homothétie, 1 paire + rotation,
// 2 paires (échelle et rotation déduites). 🩸 Le champ coordonnée OUBLIÉ est le bug classique : chaque
// tableau du format est éprouvé, plus les matrices et leurs refus.
// =====================================================================

const fs = require("fs");
const src = fs.readFileSync("js/tableEditor.js", "utf8");
const d = src.indexOf("function _matriceHomothetie");
const fin = src.indexOf("\n  function _ouvrirConvertResolution", d);
if (d < 0 || fin < 0) { console.error("❌ fonctions introuvables"); process.exit(1); }
// eslint-disable-next-line no-eval
eval(src.slice(d, fin));

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

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

// ── Homothétie ×2/×3 ──
let o = fichierTest();
let compte = _transformerCoordsFichier(o, _matriceHomothetie(2, 3));
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

// ── 1 paire : l'ancre tombe EXACTEMENT (×2, θ=0, translation clouée sur la paire) ──
let M = _matriceRecalage(2, 2, 0, { x: 100, y: 200 }, { x: 750, y: 950 });
o = fichierTest();
_transformerCoordsFichier(o, M);
t("1 paire : l'ancre tombe exactement sur sa cible", o.data[0].x === 750 && o.data[0].y === 950);
M = _matriceRecalage(2, 2, 0, { x: 0, y: 0 }, { x: 500, y: 600 });
o = { data: [{ x: 10, y: 0 }] };
_transformerCoordsFichier(o, M);
t("1 paire : translation + échelle cohérentes", o.data[0].x === 520 && o.data[0].y === 600);

// ⚠️ θ>0 = HORAIRE à l'écran (repère y vers le bas) : +x devient +y
M = _matriceRecalage(1, 1, 90, { x: 0, y: 0 }, { x: 0, y: 0 });
o = { data: [{ x: 100, y: 0 }] };
_transformerCoordsFichier(o, M);
t("θ=90° : la droite devient le bas (horaire visuel)", Math.abs(o.data[0].x) < 0.01 && Math.abs(o.data[0].y - 100) < 0.01);
o = { data: [{ x: 0, y: 100 }] };
_transformerCoordsFichier(o, M);
t("θ=90° : le bas devient la gauche", Math.abs(o.data[0].x + 100) < 0.01 && Math.abs(o.data[0].y) < 0.01);

// ── 2 paires : base A vers +x, base B vers +y, 100→200 → échelle 2, θ +90° ──
M = _matriceDeuxPaires({ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }, { x: 50, y: 250 });
t("2 paires : échelle déduite = 2", M && Math.abs(M._s - 2) < 1e-9);
t("2 paires : rotation déduite = 90°", M && Math.abs(M._thetaDeg - 90) < 1e-9);
o = { data: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 0 }] };
_transformerCoordsFichier(o, M);
t("2 paires : les deux ancres tombent juste",
  o.data[0].x === 50 && o.data[0].y === 50 && o.data[1].x === 50 && o.data[1].y === 250);
t("2 paires : un point intermédiaire est interpolé", o.data[2].x === 50 && o.data[2].y === 150);

// ── Aller-retour : M puis la matrice des paires échangées ≈ identité ──
const Minv = _matriceDeuxPaires({ x: 50, y: 50 }, { x: 0, y: 0 }, { x: 50, y: 250 }, { x: 100, y: 0 });
o = fichierTest();
_transformerCoordsFichier(o, M);
_transformerCoordsFichier(o, Minv);
const ref = fichierTest();
const ecart = Math.max(
  Math.abs(o.editorPoints[1].x - ref.editorPoints[1].x),
  Math.abs(o.roads[0].points[0].y - ref.roads[0].points[0].y));
t("aller-retour (M puis M⁻¹) = identité (± 0,02 px)", ecart <= 0.02);

// ── Refus dégénérés ──
t("2 paires : base source < 10 px → null", _matriceDeuxPaires({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 100, y: 0 }) === null);
t("2 paires : base destination < 10 px → null", _matriceDeuxPaires({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 5, y: 0 }) === null);
t("1 paire : ancre manquante → null", _matriceRecalage(2, 2, 0, null, { x: 0, y: 0 }) === null);

// ── Homothétie : arrondi et facteur neutre ──
o = { data: [{ x: 33, y: 77 }] };
_transformerCoordsFichier(o, _matriceHomothetie(1 / 3, 1 / 7));
t("arrondi centipixel (2 décimales max)", o.data[0].x === 11 && o.data[0].y === 11);
o = fichierTest();
_transformerCoordsFichier(o, _matriceHomothetie(1, 1));
t("facteur 1 : aucune modification", JSON.stringify(o) === JSON.stringify(fichierTest()));

// ── Robustesse ──
t("objet vide → compte vide, pas de crash", Object.keys(_transformerCoordsFichier({}, _matriceHomothetie(2, 2))).length === 0);
t("null → pas de crash", Object.keys(_transformerCoordsFichier(null, _matriceHomothetie(2, 2))).length === 0);
t("matrice null → pas de crash", Object.keys(_transformerCoordsFichier(fichierTest(), null)).length === 0);
o = { roads: [{ type: "x" }, null, { type: "y", points: [{ x: "a", y: 2 }, { x: 1, y: 2 }] }] };
compte = _transformerCoordsFichier(o, _matriceHomothetie(2, 2));
t("géométrie sans points / ligne null / point malformé : ignorés proprement",
  compte.roads === 1 && o.roads[2].points[1].x === 2);

console.log(ko === 0 ? "\n🎉 convertisseur résolution/recalage : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
