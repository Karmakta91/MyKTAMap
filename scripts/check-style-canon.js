#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-style-canon.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Vérifie que toute table de style encore présente dans le code reste d'accord
// avec la table canonique `js/styleResolver.js > CANON` (trait, fond, weight,
// fillOpacity).
// 🩸 Un oubli dans une copie est invisible : une zone dangereuse peut sortir en
// gris dans un export sans que rien ne le signale.
// ⚠️ EXCEPTIONS : palettes volontairement différentes, inscrites en dur
// ci-dessous avec leur raison ; tout nouvel écart doit y être déclaré.
// =====================================================================

const fs = require("fs");

// fichier → raison. Doit rester COURT : chaque entrée est une dette assumée.
const EXCEPTIONS = {
  "js/emergencyMode.js":
    "palette dédiée à la mini-carte d'urgence (couleurs vives, cf. commentaire du fichier)",
  "js/osmView.js":
    "`inaccessible` en aplat orange : le motif hachuré SVG n'est pas rendu sur fond OSM",
  "js/osmHomePreview.js":
    "idem osmView (même repli d'aplat)"
};

const FICHIERS = [
  "js/road.js", "js/zones.js", "js/structures.js", "js/legendCustomization.js",
  "js/exporter.js", "js/utils.js", "js/kmzExport.js", "js/osmView.js",
  "js/osmHomePreview.js", "js/secoursMode.js", "js/emergencyMode.js",
  "js/interfaceLegende.js", "js/statsGlobales.js", "js/interfaceDistanceTotale.js"
];

// Extrait la table canonique du resolver sans exécuter le module.
function lireCanon() {
  const src = fs.readFileSync("js/styleResolver.js", "utf8");
  const d = src.indexOf("const CANON = {");
  const f = src.indexOf("\n  };", d);
  if (d === -1 || f === -1) { console.error("❌ CANON introuvable dans styleResolver.js"); process.exit(1); }
  const corps = src.slice(d + "const CANON = ".length, f + 4);
  // eslint-disable-next-line no-eval
  return eval("(" + corps + ")");
}

// Couleurs et valeurs citées pour un type, quel que soit le nom du champ :
// `color` = `borderColor` (trait), `fill` = `fillColor` (remplissage) — sinon
// faux positifs. `weight` et `fillOpacity` sont comparés aussi (un écart de
// valeur numérique est invisible si l'on ne compare que les hex).
// 🩸 `width:` (KMZ) n'est PAS assimilé à `weight:` : autre unité.
function couleursPour(txt, type) {
  const esc = type.replace(/-/g, "\\-");
  const rx = new RegExp('["\']?' + esc + '["\']?\\s*:\\s*\\{([^}]*)\\}', "g");
  const out = [];
  let m;
  while ((m = rx.exec(txt)) !== null) {
    const corps = m[1];
    const lire = function (noms) {
      for (const n of noms) {
        const mm = corps.match(new RegExp(n + '\\s*:\\s*"(#[0-9a-fA-F]{6})"'));
        if (mm) return mm[1].toLowerCase();
      }
      return null;
    };
    const lireNum = function (nom) {
      const mm = corps.match(new RegExp("\\b" + nom + "\\s*:\\s*([0-9]*\\.?[0-9]+)"));
      return mm ? parseFloat(mm[1]) : null;
    };
    const trait = lire(["borderColor", "color", "line", "stroke", "lineColor"]);
    const fond  = lire(["fillColor", "fill"]);
    const motif = /fill(?:Color)?\s*:\s*"url\(#/.test(corps);
    if (trait || fond || motif) {
      out.push({
        ligne: txt.slice(0, m.index).split("\n").length,
        trait, fond, motif,
        weight: lireNum("weight"),
        fillOpacity: lireNum("fillOpacity")
      });
    }
  }
  return out;
}

const CANON = lireCanon();
let ko = 0, verifs = 0, ignores = 0;

for (const fichier of FICHIERS) {
  let txt;
  try { txt = fs.readFileSync(fichier, "utf8"); } catch (e) { continue; }
  if (EXCEPTIONS[fichier]) { ignores++; continue; }

  for (const [cat, table] of Object.entries(CANON)) {
    for (const [cle, ref] of Object.entries(table)) {
      const refTrait = (ref.color || "").toLowerCase() || null;
      // Type à motif SVG : le motif et son aplat de repli (bitmap/KMZ/OSM) passent.
      const refFonds = [];
      if (ref.fillColor && ref.fillColor.indexOf("url(") !== 0) refFonds.push(ref.fillColor.toLowerCase());
      if (ref._flatFill) refFonds.push(ref._flatFill.toLowerCase());
      const refOpas = [];
      if (ref.fillOpacity !== undefined) refOpas.push(ref.fillOpacity);
      if (ref._flatFillOpacity !== undefined) refOpas.push(ref._flatFillOpacity);

      for (const occ of couleursPour(txt, cle)) {
        verifs++;
        // Une déclaration partielle est tolérée ; seul un CONFLIT est fautif.
        if (occ.trait && refTrait && occ.trait !== refTrait) {
          console.log("❌ " + fichier + ":" + occ.ligne + "  " + cat + "/" + cle +
                      " trait " + occ.trait + " ≠ canon " + refTrait);
          ko++;
        }
        if (occ.fond && refFonds.length && refFonds.indexOf(occ.fond) === -1) {
          console.log("❌ " + fichier + ":" + occ.ligne + "  " + cat + "/" + cle +
                      " fond " + occ.fond + " ∉ canon [" + refFonds.join(", ") + "]");
          ko++;
        }
        if (occ.weight !== null && ref.weight !== undefined && occ.weight !== ref.weight) {
          console.log("❌ " + fichier + ":" + occ.ligne + "  " + cat + "/" + cle +
                      " weight " + occ.weight + " ≠ canon " + ref.weight);
          ko++;
        }
        if (occ.fillOpacity !== null && refOpas.length && refOpas.indexOf(occ.fillOpacity) === -1) {
          console.log("❌ " + fichier + ":" + occ.ligne + "  " + cat + "/" + cle +
                      " fillOpacity " + occ.fillOpacity + " ∉ canon [" + refOpas.join(", ") + "]");
          ko++;
        }
      }
    }
  }
}

console.log("🎨 check-style-canon : " + verifs + " déclaration(s) confrontée(s) à la table canonique, "
            + ignores + " fichier(s) en exception assumée.");
if (ko > 0) {
  console.log("\n⚠️ " + ko + " divergence(s). Soit la table canonique de styleResolver.js doit changer,");
  console.log("   soit le fichier fautif a dérivé. Si l'écart est VOLONTAIRE, l'inscrire dans");
  console.log("   EXCEPTIONS en haut de ce script, avec sa raison.");
  process.exit(1);
}
console.log("✅ aucune dérive.");
