#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🌍 check-kml-styles.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Verrouille les <Style> KML produits par `js/kmzExport.js`.
//
// POURQUOI : les Placemark émettent `<styleUrl>#road_<type></styleUrl>`. Pour
// un type CUSTOM ça donnait `#road_cust-abc123`, un id qui n'était JAMAIS
// déclaré dans le document — styleUrl pendant, Google Earth retombait sur son
// trait par défaut, la couleur choisie par l'utilisateur était perdue.
// Corrigé en v1.76.0 en résolvant les couleurs via `js/styleResolver.js` et en
// déclarant un <Style> par type custom réellement utilisé.
//
// Ce script garde DEUX invariants :
//   1. Les 14 styles BUILT-IN restent identiques à la référence figée
//      ci-dessous. Le KML a ses propres LARGEURS (unité ≠ `weight` Leaflet,
//      ajustées à l'échelle GPS : un front est à 5 ici, 10 sur la carte) et
//      ses propres ALPHAS. Brancher naïvement le résolveur sur ces champs
//      changerait le rendu dans Google Earth — d'où cette référence.
//   2. Un type CUSTOM produit bien un style, et un front custom n'hérite
//      JAMAIS d'un remplissage (le canon donne un `fillColor` aux fronts,
//      mais un LineString KML ne doit pas se voir attribuer de PolyStyle).
// =====================================================================

const fs = require("fs");
const vm = require("vm");

// Référence FIGÉE : sortie du code d'avant la migration (v1.75.2).
// Ne la modifier QUE si un changement de rendu KML est explicitement voulu.
const REFERENCE = {
  road_principal:    { line: "#00ff00", width: 4, alpha: 1 },
  road_secondaire:   { line: "#b000ff", width: 4, alpha: 1 },
  road_chemin:       { line: "#ffff00", width: 3, alpha: 1 },
  road_jonction:     { line: "#ff4ecb", width: 4, alpha: 1 },
  road_itinerary:    { line: "#00d4ff", width: 6, alpha: 1 },
  zone_eau:          { line: "#0066aa", fill: "#3aa9e8", fillAlpha: 0.6,  width: 2 },
  zone_remblais:     { line: "#3a3a44", fill: "#5a5a68", fillAlpha: 0.6,  width: 2 },
  zone_effondrement: { line: "#cc0000", fill: "#ff3333", fillAlpha: 0.6,  width: 2 },
  zone_inaccessible: { line: "#5a0a0a", fill: "#7a0000", fillAlpha: 0.65, width: 2 },
  "structure_pilier-1": { line: "#000000", fill: "#f4c542", fillAlpha: 0.85, width: 2 },
  "structure_pilier-2": { line: "#000000", fill: "#ff9933", fillAlpha: 0.85, width: 2 },
  "structure_mur":      { line: "#000000", fill: "#1e3a8a", fillAlpha: 0.85, width: 2 },
  "structure_front-1":  { line: "#f4c542", width: 5, alpha: 1 },
  "structure_front-2":  { line: "#ff9933", width: 5, alpha: 1 }
};

const win = { console: { log() {}, warn() {} } };
win.window = win;
const ctx = vm.createContext(win);
vm.runInContext("var window=this;" + fs.readFileSync("js/styleResolver.js", "utf8"), ctx);

// Extrait les deux fonctions de kmzExport.js sans charger le module entier
// (il dépend de JSZip, du DOM, de Leaflet…).
const src = fs.readFileSync("js/kmzExport.js", "utf8");
function extraire(signature) {
  const d = src.indexOf(signature);
  if (d === -1) {
    console.error("❌ " + signature + " introuvable dans js/kmzExport.js — le script de contrôle doit être mis à jour.");
    process.exit(1);
  }
  return src.slice(d, src.indexOf("\n  }", d) + 4);
}
win.PREFIXE_CATEGORIE = { road: "traces", zone: "zones", structure: "structures" };
vm.runInContext(
  extraire("function _traitsKml") + "\n" +
  extraire("function _styleKmlDe") + "\n" +
  "this._styleKmlDe = _styleKmlDe;", ctx);

let ko = 0, ok = 0;

// ---------- 1. les built-in n'ont pas bougé ----------
const produits = {};
Object.keys(win.PREFIXE_CATEGORIE).forEach(function(prefixe) {
  const cat = win.PREFIXE_CATEGORIE[prefixe];
  win.ktaStyleBuiltins(cat).forEach(function(cle) {
    produits[prefixe + "_" + cle] = win._styleKmlDe(cat, cle);
  });
});

const CHAMPS = ["line", "width", "alpha", "fill", "fillAlpha"];
new Set(Object.keys(REFERENCE).concat(Object.keys(produits))).forEach(function(id) {
  const a = REFERENCE[id], n = produits[id];
  if (!a) { console.log("❌ " + id + " : style APPARU (absent de la référence)"); ko++; return; }
  if (!n) { console.log("❌ " + id + " : style DISPARU"); ko++; return; }
  const diffs = CHAMPS.filter(function(c) { return a[c] !== n[c]; });
  if (diffs.length) {
    console.log("❌ " + id + " : " + diffs.map(function(c) {
      return c + " " + a[c] + " → " + n[c];
    }).join(", "));
    ko++;
  } else ok++;
});

// ---------- 2. les customs sont stylés (LE bug corrigé) ----------
win.LegendCustomization = {
  findCustomEntry(id) {
    if (id === "cust-trace") return { id, category: "traces",     geometry: "polyline", lineColor: "#ff00aa" };
    if (id === "cust-zone")  return { id, category: "zones",      geometry: "polygon",  fillColor: "#00ffaa", borderColor: "#004433" };
    if (id === "cust-front") return { id, category: "structures", geometry: "polyline", lineColor: "#abcdef" };
    if (id === "cust-mur")   return { id, category: "structures", geometry: "polygon",  fillColor: "#123456" };
    return null;
  }
};
function cas(nom, cond) { if (cond) ok++; else { console.log("❌ " + nom); ko++; } }

const ct = win._styleKmlDe("traces", "cust-trace");
const cz = win._styleKmlDe("zones", "cust-zone");
const cf = win._styleKmlDe("structures", "cust-front");
const cm = win._styleKmlDe("structures", "cust-mur");

cas("trace custom stylée à sa couleur", !!ct && ct.line === "#ff00aa");
cas("trace custom sans remplissage",    !!ct && !ct.fill);
cas("zone custom : fond + bordure",     !!cz && cz.fill === "#00ffaa" && cz.line === "#004433");
cas("front custom à sa couleur",        !!cf && cf.line === "#abcdef");
cas("front custom SANS PolyStyle",      !!cf && !cf.fill);
cas("front custom garde la largeur KML 5", !!cf && cf.width === 5);
cas("pilier custom : fond + largeur 2", !!cm && cm.fill === "#123456" && cm.width === 2);
cas("custom supprimé de la légende → null (pas de style bidon)",
    win._styleKmlDe("traces", "cust-inexistant") === null);

console.log("🌍 check-kml-styles : " + ok + " contrôle(s) OK, " + ko + " échec(s).");
if (ko > 0) {
  console.log("\n⚠️ La sortie KML a changé. Si c'est VOULU, mettre à jour REFERENCE en haut");
  console.log("   de ce script. Sinon, le rendu dans Google Earth vient d'être modifié.");
  process.exit(1);
}
console.log("✅ sortie KML conforme.");
