#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🎨 check-style-canon.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Vérifie que la table canonique de `js/styleResolver.js` reste d'accord avec
// TOUTES les tables de style encore présentes dans le code.
//
// Pourquoi ce contrôle existe : les couleurs des 13 types built-in étaient
// recopiées à la main dans ~25 tables sur 12 fichiers. Un oubli y est
// invisible — `exporter.js > ZS_EMBED` avait perdu `inaccessible`, et une zone
// DANGEREUSE sortait en gris remblais dans l'export PNG sans que rien ne le
// signale. Tant que des tables subsistent (migration en cours), ce script
// garantit qu'elles ne DÉRIVENT pas de la référence.
//
// ⚠️ EXCEPTIONS DÉLIBÉRÉES, listées en dur ci-dessous. Deux fichiers ont une
// palette volontairement différente, commentée dans leur source. Les unifier
// changerait le rendu de deux écrans sans que personne l'ait demandé. Elles
// sont donc EXCLUES du contrôle — et le fait de devoir les inscrire ici rend
// tout nouvel écart VOLONTAIRE et visible, au lieu de silencieux.
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

// Toutes les couleurs citées pour un type donné, quel que soit le nom du champ.
// `color` et `borderColor` désignent le MÊME trait ; `fill` et `fillColor` le
// même remplissage. Ne pas les assimiler produirait des faux positifs (piège
// rencontré au premier jet du relevé).
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
    const trait = lire(["borderColor", "color", "line", "stroke", "lineColor"]);
    const fond  = lire(["fillColor", "fill"]);
    if (trait || fond) out.push({ ligne: txt.slice(0, m.index).split("\n").length, trait, fond });
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
      const refFond  = (ref.fillColor || "").toLowerCase() || null;
      for (const occ of couleursPour(txt, cle)) {
        verifs++;
        // Une déclaration partielle est tolérée ; seul un CONFLIT est fautif.
        if (occ.trait && refTrait && occ.trait !== refTrait) {
          console.log("❌ " + fichier + ":" + occ.ligne + "  " + cat + "/" + cle +
                      " trait " + occ.trait + " ≠ canon " + refTrait);
          ko++;
        }
        if (occ.fond && refFond && occ.fond !== refFond) {
          console.log("❌ " + fichier + ":" + occ.ligne + "  " + cat + "/" + cle +
                      " fond " + occ.fond + " ≠ canon " + refFond);
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
