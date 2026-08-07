#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔁 check-resolution-convert.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Verrouille le convertisseur de résolution de l'éditeur de données
// (v1.76.2 — migrer les données d'une carrière d'un scan A vers un scan B).
// Le champ coordonnée OUBLIÉ est LE bug classique de ce genre d'outil : ce
// script éprouve chaque tableau du format (points plats, géométries,
// mesures sous leurs DEUX formes calque/session) + l'aller-retour A→B→A.
// Fonction extraite du code RÉEL de js/tableEditor.js.
// =====================================================================

const fs = require("fs");
const src = fs.readFileSync("js/tableEditor.js", "utf8");
const d = src.indexOf("function _transformerCoordsFichier");
if (d < 0) { console.error("❌ _transformerCoordsFichier introuvable"); process.exit(1); }
const fin = src.indexOf("\n  function _ouvrirConvertResolution", d);
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

// ── Homothétie exacte ×2 / ×3 ──
let o = fichierTest();
let compte = _transformerCoordsFichier(o, 2, 3);
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

// ── Sous-pixel : arrondi centipixel, pas de dérive JSON ──
o = { data: [{ x: 33, y: 77 }] };
_transformerCoordsFichier(o, 1 / 3, 1 / 7);
t("arrondi centipixel (2 décimales max)", o.data[0].x === 11 && o.data[0].y === 11);

// ── Aller-retour A→B→A ≈ identité (tolérance = l'arrondi centipixel) ──
o = fichierTest();
_transformerCoordsFichier(o, 8192 / 4096, 6144 / 3072);      // ×2 exact
_transformerCoordsFichier(o, 4096 / 8192, 3072 / 6144);      // retour
const ref = fichierTest();
const ecart = Math.max(
  Math.abs(o.editorPoints[1].x - ref.editorPoints[1].x),
  Math.abs(o.editorPoints[1].y - ref.editorPoints[1].y),
  Math.abs(o.roads[0].points[0].x - ref.roads[0].points[0].x));
t("aller-retour A→B→A = identité (± 0,01 px)", ecart <= 0.01);

// ── Facteur 1 = no-op strict ──
o = fichierTest();
_transformerCoordsFichier(o, 1, 1);
t("facteur 1 : aucune modification", JSON.stringify(o) === JSON.stringify(fichierTest()));

// ── Robustesse : objets sans tableaux, null, points malformés ──
t("objet vide → compte vide, pas de crash", Object.keys(_transformerCoordsFichier({}, 2, 2)).length === 0);
t("null → pas de crash", Object.keys(_transformerCoordsFichier(null, 2, 2)).length === 0);
o = { roads: [{ type: "x" }, null, { type: "y", points: [{ x: "a", y: 2 }, { x: 1, y: 2 }] }] };
compte = _transformerCoordsFichier(o, 2, 2);
t("géométrie sans points / ligne null / point malformé : ignorés proprement",
  compte.roads === 1 && o.roads[2].points[1].x === 2);

console.log(ko === 0 ? "\n🎉 convertisseur de résolution : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
