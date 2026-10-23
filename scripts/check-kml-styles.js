#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-kml-styles.js — garde-fou pré-commit BLOQUANT des <Style> KML de `js/kmzExport.js`
// =====================================================================
// 🩸 Les Placemark émettent `<styleUrl>#road_<type></styleUrl>` : pour un type CUSTOM, un id jamais déclaré
// laisse le styleUrl pendant, Google Earth retombe sur son trait par défaut et la couleur choisie est perdue.
// Les couleurs passent par `js/styleResolver.js` et un <Style> est déclaré par type hors intégrés utilisé.
// Trois invariants :
//   1. les 14 styles BUILT-IN restent identiques à REFERENCE : le KML a ses propres LARGEURS (unité ≠
//      `weight` Leaflet : un front est à 5 ici, 10 sur la carte) et ALPHAS ; brancher naïvement le
//      résolveur sur ces champs changerait le rendu dans Google Earth ;
//   2. un type CUSTOM produit un style, et un front custom n'a JAMAIS de PolyStyle (le canon donne un
//      `fillColor` aux fronts, mais c'est un LineString) ;
//   3. un type INCONNU (id brut d'un calque, custom supprimé) reçoit le style de repli de sa famille, celui
//      de la carte (zone → remblais, structure → mur, lu dans zones.js / structures.js) : jamais un style
//      inventé, jamais aucun style ; un tracé inconnu n'en reçoit pas (la carte n'a pas de repli de famille).
// =====================================================================

const fs = require("fs");
const vm = require("vm");

// ⚠️ Référence FIGÉE du rendu KML : ne la modifier QUE pour un changement de rendu voulu.
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

// Fonctions extraites de kmzExport.js (le module entier dépend de JSZip, du DOM, de Leaflet)
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
const mRepli = /const REPLI_KML = (\{[^}]*\});/.exec(src);
if (!mRepli) {
  console.error("❌ const REPLI_KML introuvable dans js/kmzExport.js — le script de contrôle doit être mis à jour.");
  process.exit(1);
}
vm.runInContext(
  "var REPLI_KML = " + mRepli[1] + ";\n" +
  extraire("function _kmlColor") + "\n" +
  extraire("function _traitsKml") + "\n" +
  extraire("function _styleKmlDe") + "\n" +
  extraire("function _blocStyleKml") + "\n" +
  extraire("function _genererStylesKml") + "\n" +
  "this._styleKmlDe = _styleKmlDe; this._genererStylesKml = _genererStylesKml; this.REPLI_KML = REPLI_KML;", ctx);

let ko = 0, ok = 0;

// ── 1. Les built-in n'ont pas bougé ──────────
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

// ── 2. Les customs sont stylés ──────────
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

// ── 3. Les types inconnus prennent le repli de la carte ──────────
// Repli de la carte : `_resolveZoneStyle(zone.type) || _resolveZoneStyle("remblais")`, pendant côté structures.
function repliCarte(fichier, fn) {
  const re = new RegExp(fn + "\\([a-z]+\\.type\\) \\|\\| " + fn + "\\(\"([^\"]+)\"\\)");
  const m = re.exec(fs.readFileSync(fichier, "utf8"));
  return m ? m[1] : null;
}
const carte = { zones: repliCarte("js/zones.js", "_resolveZoneStyle"),
                structures: repliCarte("js/structures.js", "_resolveStructureStyle") };
cas("repli de la carte lisible dans zones.js / structures.js", !!carte.zones && !!carte.structures);
cas("repli KML des zones = celui de la carte (" + carte.zones + ")", win.REPLI_KML.zones === carte.zones);
cas("repli KML des structures = celui de la carte (" + carte.structures + ")",
    win.REPLI_KML.structures === carte.structures);

function memeStyle(a, b) {
  return !!a && !!b && CHAMPS.every(function(c) { return a[c] === b[c]; });
}
["zones", "structures"].forEach(function(cat) {
  ["ckbrut", "cust-inexistant"].forEach(function(cle) {
    cas(cat + " « " + cle + " » inconnu → style de repli « " + carte[cat] + " »",
        memeStyle(win._styleKmlDe(cat, cle), win._styleKmlDe(cat, carte[cat])));
  });
});
cas("tracé inconnu → null (pas de repli de famille, pas de style bidon)",
    win._styleKmlDe("traces", "cust-inexistant") === null);

// Bout de chaîne : le document déclare bien un <Style> par type inconnu collecté, identique au repli.
const doc = win._genererStylesKml(new Set(["zone_ckbrut", "structure_ckbrut", "road_ckbrut"]));
function corpsStyle(id) {
  const d = doc.indexOf('<Style id="' + id + '">');
  return d === -1 ? null : doc.slice(doc.indexOf(">", d) + 1, doc.indexOf("</Style>", d));
}
cas("<Style> déclaré pour une zone inconnue, = " + carte.zones,
    !!corpsStyle("zone_ckbrut") && corpsStyle("zone_ckbrut") === corpsStyle("zone_" + carte.zones));
cas("<Style> déclaré pour une structure inconnue, = " + carte.structures,
    !!corpsStyle("structure_ckbrut") && corpsStyle("structure_ckbrut") === corpsStyle("structure_" + carte.structures));
cas("aucun <Style> pour un tracé inconnu", corpsStyle("road_ckbrut") === null);

console.log("🌍 check-kml-styles : " + ok + " contrôle(s) OK, " + ko + " échec(s).");
if (ko > 0) {
  console.log("\n⚠️ La sortie KML a changé. Si c'est VOULU, mettre à jour REFERENCE en haut");
  console.log("   de ce script. Sinon, le rendu dans Google Earth vient d'être modifié.");
  process.exit(1);
}
console.log("✅ sortie KML conforme.");
