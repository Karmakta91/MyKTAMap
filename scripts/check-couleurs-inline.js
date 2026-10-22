#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-couleurs-inline.js — garde-fou pré-commit BLOQUANT (rejoué en CI), à CLIQUET
// =====================================================================
// La charte s'écrit `var(--kta-…)` aussi dans un style posé par le JS : un hex en dur ignore le thème clair et
// échappe aux mesures de contraste (docs/architecture/ui.md §Couleurs posées par le JS).
// Compte, dans js/*.js hors commentaires, les couleurs hex écrites dans :
//   • un attribut `style="…"` d'un gabarit HTML (de `style=` à la fin de la balise, concaténations comprises) ;
//   • `el.style.<prop> = …`, `style.cssText = …` (tableau `[…].join` compris), `style.setProperty(…)`,
//     `setAttribute("style", …)` (jusqu'à la fin de l'instruction).
// Ne compte pas : le repli d'un `var(--kta-x, #…)`, une entité HTML `&#…;`, la valeur d'un `<input type="color"
// value="#…">` (une donnée, pas un style). Exception assumée : une ligne marquée « couleur-inline-ok » avec sa
// raison (ex. conteneur de rendu hors écran exporté en image, qui ne doit pas suivre le thème).
// 🩸 Les palettes propres de check-style-canon.js (mini-carte d'emergencyMode.js, cartes OSM) visent les styles
// Leaflet des types, pas l'interface : leurs `style=` d'interface comptent ici comme les autres.
// Refuse toute HAUSSE, et une BAISSE non reportée dans PLAFOND (même commit) : le compte ne peut que baisser.
// Lit l'arbre entier (pas l'index) : rien à brancher dans ci-commits.sh. Diagnostic : --liste [fichier.js].
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const PLAFOND = 15;

const HEX = /(?<![&\w])#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])/g;

function sansCommentaires(src) {
  // 🩸 `accept="image/*"` dans un gabarit ouvre un faux commentaire bloc : un vrai ne suit jamais une lettre, un
  // chiffre, un guillemet ni `/`.
  return src.replace(/(?<![\w"'`/])\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split(/\r?\n/).map((l) => {
      if (/^\s*\/\//.test(l)) return "";
      const i = l.search(/\s\/\/(?!\/)/);
      if (i >= 0) {
        const avant = l.slice(0, i);
        const pair = (c) => ((avant.match(new RegExp("\\" + c, "g")) || []).length % 2) === 0;
        if (pair('"') && pair("'") && pair("`")) return avant;
      }
      return l;
    });
}

// Couleurs comptées dans un morceau de style : replis de var() et valeurs d'<input> retirés.
function hexDe(morceau) {
  const net = morceau.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, "")
    .replace(/\bvalue\s*=\s*\\?["'][^"']*\\?["']/g, "");
  return net.match(HEX) || [];
}

const ATTR = /\bstyle\s*=\s*\\?["'`]/;
const AFFECT = /\.style\s*(?:\.\s*[\w$]+|\[[^\]]+\])?\s*=(?!=)|\.style\s*\.\s*setProperty\s*\(|setAttribute\(\s*["']style["']/;

// → [{ ligne (0-based), n }] pour un fichier déjà privé de ses commentaires.
function occurrences(lignes) {
  const out = [];
  let mode = null;   // "attr" : on attend la fin de la balise ; "instr" : la fin de l'instruction
  lignes.forEach((l, i) => {
    let zone = "";
    let reste = l;
    if (mode === "attr") {
      const fin = reste.indexOf(">");
      zone += fin >= 0 ? reste.slice(0, fin) : reste;
      if (fin >= 0) { mode = null; reste = reste.slice(fin + 1); } else reste = "";
    } else if (mode === "instr") {
      zone += reste;
      if (/;\s*$|\]\s*\.join|\}\s*\)\s*;?\s*$/.test(reste)) mode = null;
      reste = "";
    }
    // Attributs style="…" de la ligne : jusqu'au `>` qui ferme la balise, sinon la suite déborde.
    let m;
    while (mode === null && (m = ATTR.exec(reste))) {
      const apres = reste.slice(m.index + m[0].length);
      const fin = apres.indexOf(">");
      if (fin >= 0) { zone += " " + apres.slice(0, fin); reste = apres.slice(fin + 1); } else {
        zone += " " + apres; reste = ""; mode = "attr";
      }
    }
    // Affectation d'un style : jusqu'au `;` final, ou la ligne qui ferme le tableau / l'appel.
    const a = mode === null ? AFFECT.exec(reste) : null;
    if (a) {
      const suite = reste.slice(a.index);
      zone += " " + suite;
      if (!/;\s*$/.test(suite) && /[[+,(?:]\s*$|=\s*$/.test(suite)) mode = "instr";
    }
    const n = hexDe(zone).length;
    if (n) out.push({ ligne: i, n: n });
  });
  return out;
}

// Auto-test (chaque passage) : un motif qui ne voit plus une forme connue = garde-fou à vide.
const DOIT_VOIR = {
  "'<p style=\"color:#ff8a5c;\">'": 1,
  "el.style.color = ok ? \"#6ce28a\" : \"#ff8c8c\";": 2,
  "b.style.borderLeft = \"6px solid #8cb4ff\";": 1,
  "x.style.cssText = \"color:#fff; background:#000;\";": 2,
  "x.style.cssText = [\n  \"border:2px solid #d32f2f\",\n  \"color:#fff\"\n].join(\";\");": 2,
  "'<b style=\"color:' + (on ? \"#f4c542\" : \"#8892a4\") + ';\">'": 2,
  "'<div style=\"margin:0;' +\n  ' color:#ffb3b3;\">' + t": 1,
  "el.style.setProperty(\"color\", \"#abc\");": 1,
  "el.setAttribute(\"style\", \"color:#abcdef\");": 1,
  "el.style[\"color\"] = \"#123\";": 1
};
const NE_DOIT_PAS_VOIR = [
  "'<p style=\"color:var(--kta-accent-texte);\">'",
  "'<p style=\"color:var(--kta-accent, #f4c542);\">'",
  "'<button>&#9776;</button>'",
  "'<input type=\"color\" value=\"#00ff00\" style=\"height:32px;\">'",
  "const PALETTE = { eau: \"#3b82f6\" };",
  "L.polyline(p, { color: \"#ff0000\" });",
  "// el.style.color = \"#fff\";",
  "'<p style=\"margin:0\">#1 en tête</p>'",
  "if (el.style.color === \"#fff\") x();"
];
const compte = (src) => occurrences(sansCommentaires(src)).reduce((s, o) => s + o.n, 0);
const ratesVoir = Object.keys(DOIT_VOIR).filter((c) => compte(c) !== DOIT_VOIR[c]);
const ratesPas = NE_DOIT_PAS_VOIR.filter((c) => compte(c) !== 0);
if (ratesVoir.length || ratesPas.length) {
  console.log("❌ check-couleurs-inline : le motif a régressé" +
    (ratesVoir.length ? "\n     compte faux : " + ratesVoir.map((c) => JSON.stringify(c) + " → " + compte(c)).join(" · ") : "") +
    (ratesPas.length ? "\n     voit à tort : " + ratesPas.map((c) => JSON.stringify(c)).join(" · ") : ""));
  process.exit(1);
}

const iListe = process.argv.indexOf("--liste");
const liste = iListe >= 0 ? (process.argv[iListe + 1] || "*") : null;
let total = 0;
const parFichier = [];
for (const nom of fs.readdirSync("js").filter((f) => f.endsWith(".js")).sort()) {
  const f = path.join("js", nom);
  const brutes = fs.readFileSync(f, "utf8").split(/\r?\n/);
  let n = 0;
  occurrences(sansCommentaires(brutes.join("\n"))).forEach((o) => {
    if (/couleur-inline-ok/.test(brutes[o.ligne] || "")) return;
    n += o.n;
    if (liste && (liste === "*" || liste === nom)) {
      console.log(f + ":" + (o.ligne + 1) + "  [" + o.n + "] " + brutes[o.ligne].trim().slice(0, 110));
    }
  });
  if (n) { parFichier.push([n, f]); total += n; }
}
if (liste) process.exit(0);
parFichier.sort((a, b) => b[0] - a[0]);

const detail = parFichier.slice(0, 10).map(([n, f]) => n + " " + f).join(" · ");
if (total > PLAFOND) {
  console.log("❌ couleurs en dur dans un style posé par le JS : " + total + " > plafond " + PLAFOND +
    " — écris var(--kta-…) (jetons en tête de css/style.css) ou une classe .kta-tx-…\n     " + detail +
    "\n     détail : node scripts/check-couleurs-inline.js --liste [fichier.js]");
  process.exit(1);
}
if (total < PLAFOND) {
  console.log("❌ couleurs en dur dans un style posé par le JS : " + total + " < plafond " + PLAFOND +
    " — abaisse PLAFOND à " + total + " dans scripts/check-couleurs-inline.js (cliquet)");
  process.exit(1);
}
console.log("✅ couleurs en dur dans un style posé par le JS : " + total + " (plafond " + PLAFOND +
  ", ne peut que baisser)\n     " + detail);
