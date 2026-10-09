#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 💬 check-popups-natives.js — garde-fou pré-commit BLOQUANT (rejoué en CI), à CLIQUET
// =====================================================================
// alert() / confirm() / prompt() natifs : hors charte, ignorent le thème, affichent « <site> indique… »,
// iOS peut les bloquer en PWA, et ils figent l'app (suivi de position compris). Remplaçants :
// window.ktaAlerte (message à lire pour agir), window.ktaConfirm (choix), toast OOMGuard.showToast
// (confirmation de ce qui vient de se passer) — tous dans js/utils.js.
// La migration se fait par lots (09/10/2026) : ce script compte les popups natives restantes dans
// js/*.js et index.html, hors commentaires, et :
//   • refuse toute HAUSSE (une nouvelle popup native) ;
//   • refuse une BAISSE non reportée : abaisser PLAFOND ci-dessous dans le même commit — le compte
//     ne peut ainsi jamais remonter.
// Exception assumée : une ligne marquée « popup-native-ok » (ex. repli de ktaAlerte quand
// l'interface ne peut pas s'afficher).
// =====================================================================

const fs = require("fs");
const path = require("path");

const PLAFOND = 193;

function sansCommentaires(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split(/\r?\n/).map((l) => {
      if (/^\s*\/\//.test(l)) return "";
      // « // » de fin de ligne hors chaîne (approximation : nombre pair de guillemets avant)
      const i = l.search(/\s\/\/(?!\/)/);
      if (i >= 0) {
        const avant = l.slice(0, i);
        const pair = (c) => ((avant.match(new RegExp("\\" + c, "g")) || []).length % 2) === 0;
        if (pair('"') && pair("'") && pair("`")) return avant;
      }
      return l;
    });
}

const MOTIF = /(^|[^.\w$])(alert|confirm|prompt)\s*\(|\bwindow\.(alert|confirm|prompt)\s*\(/;
const fichiers = fs.readdirSync("js").filter((f) => f.endsWith(".js")).map((f) => path.join("js", f))
  .concat(["index.html"]);

// --liste [alert|confirm|prompt] : affiche chaque occurrence (fichier:ligne) au lieu du verdict.
const liste = process.argv.indexOf("--liste") >= 0 ? (process.argv[process.argv.indexOf("--liste") + 1] || "*") : null;
let total = 0;
const parFichier = [];
for (const f of fichiers) {
  const lignes = sansCommentaires(fs.readFileSync(f, "utf8"));
  const brutes = fs.readFileSync(f, "utf8").split(/\r?\n/);
  let n = 0;
  lignes.forEach((l, i) => {
    if (/function\s+(alert|confirm|prompt)\s*\(/.test(l)) return;
    const m = MOTIF.exec(l);
    if (m && !/popup-native-ok/.test(brutes[i] || "")) {
      n++;
      if (liste && (liste === "*" || (m[2] || m[3]) === liste)) console.log(f + ":" + (i + 1) + "  " + l.trim().slice(0, 110));
    }
  });
  if (n) { parFichier.push([n, f]); total += n; }
}
parFichier.sort((a, b) => b[0] - a[0]);
if (liste) process.exit(0);

const detail = parFichier.slice(0, 12).map(([n, f]) => n + " " + f).join(" · ");
if (total > PLAFOND) {
  console.log("❌ popups natives : " + total + " > plafond " + PLAFOND + " — n'en ajoute pas : window.ktaAlerte /" +
    " window.ktaConfirm / toast (js/utils.js)\n     " + detail);
  process.exit(1);
}
if (total < PLAFOND) {
  console.log("❌ popups natives : " + total + " < plafond " + PLAFOND + " — bravo ; abaisse PLAFOND à " + total +
    " dans scripts/check-popups-natives.js (cliquet)");
  process.exit(1);
}
console.log("✅ popups natives : " + total + " (plafond " + PLAFOND + ", ne peut que baisser)\n     " + detail);
