#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-popups-natives.js — garde-fou pré-commit BLOQUANT (rejoué en CI), à CLIQUET, plafond 0
// =====================================================================
// alert() / confirm() / prompt() natifs : hors charte, ignorent le thème, affichent « <site> indique… »,
// iOS peut les bloquer en PWA, et ils figent l'app (suivi de position compris). Remplaçants (js/utils.js) :
// window.ktaAlerte (message à lire pour agir), window.ktaConfirm (choix), toast OOMGuard.showToast.
// Compte les appels dans js/*.js et index.html, hors commentaires : refuse toute HAUSSE, et une BAISSE non
// reportée dans PLAFOND (même commit) — le compte ne peut jamais remonter.
// Exception assumée : une ligne marquée « popup-native-ok » (ex. repli de ktaAlerte quand
// l'interface ne peut pas s'afficher).
// Diagnostic : --liste [alert|confirm|prompt] affiche chaque occurrence.
// =====================================================================

const fs = require("fs");
const path = require("path");

const PLAFOND = 0;

function sansCommentaires(src) {
  // 🩸 `accept="image/*"` dans un gabarit HTML ouvre un faux commentaire jusqu'au `*/` suivant et masque
  // des centaines de lignes. Un vrai commentaire bloc ne suit jamais une lettre, un chiffre, un guillemet ni `/`.
  return src.replace(/(?<![\w"'`/])\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
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

// Motif appliqué au fichier ENTIER (hors commentaires) : la parenthèse peut être à la ligne suivante.
//   • appel nu : alert( · confirm (  · prompt\n(  · alert.call( / .apply(  — pas obj.confirm( ni function confirm(
//   • par un objet global : window. / globalThis. / self. / top. / parent. / frames. (et ?.)
//   • par crochets : window["alert"]( · self['confirm']( · globalThis[`prompt`](
const NOM = "(alert|confirm|prompt)";
const GLOBAL = "\\b(?:window|globalThis|self|top|parent|frames)\\s*";
const APPEL = "(?:\\s*\\.\\s*(?:call|apply))?\\s*\\(";
const MOTIFS = [
  new RegExp("(?<![.\\w$])(?<!function\\s+)" + NOM + APPEL, "g"),
  new RegExp(GLOBAL + "(?:\\?\\.|\\.)\\s*" + NOM + APPEL, "g"),
  new RegExp(GLOBAL + "(?:\\?\\.)?\\s*\\[\\s*([\"'`])" + NOM + "\\1\\s*\\]" + APPEL, "g")
];
// Texte déjà privé de ses commentaires → [{ ligne (0-based), nom }]
function occurrences(texte) {
  const vues = new Map();
  for (const re of MOTIFS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texte))) {
      const nom = /alert|confirm|prompt/.exec(m[0])[0];
      const debut = m.index + m[0].indexOf(nom);
      if (!vues.has(debut)) vues.set(debut, { ligne: texte.slice(0, debut).split("\n").length - 1, nom: nom });
    }
  }
  return [...vues.values()];
}

// Auto-test du motif (chaque passage) : un motif qui ne voit plus une forme connue = garde-fou à vide.
const DOIT_VOIR = ["alert(1)", "x = confirm ('a')", "prompt\n  ('a')", "window.alert(1)", "window ?. confirm(1)",
  "globalThis.alert(1)", "self.confirm(1)", "top.prompt(1)", "parent.alert(1)", "window[\"alert\"](1)",
  "self['confirm'](1)", "globalThis[`prompt`](1)", "window\n  .alert\n  (1)", "alert.call(window, 1)"];
const NE_DOIT_PAS_VOIR = ["window.ktaConfirm(1)", "ktaAlerte(1)", "obj.confirm(1)", "function confirm(a) {}",
  "const alerte = 1", "this.prompt(1)", "confirmer(1)", "window.confirmation(1)"];
const ratesVoir = DOIT_VOIR.filter((c) => occurrences(sansCommentaires(c).join("\n")).length !== 1);
const ratesPas = NE_DOIT_PAS_VOIR.filter((c) => occurrences(sansCommentaires(c).join("\n")).length !== 0);
if (ratesVoir.length || ratesPas.length) {
  console.log("❌ check-popups-natives : le motif a régressé" +
    (ratesVoir.length ? "\n     ne voit plus : " + ratesVoir.map((c) => JSON.stringify(c)).join(" · ") : "") +
    (ratesPas.length ? "\n     voit à tort : " + ratesPas.map((c) => JSON.stringify(c)).join(" · ") : ""));
  process.exit(1);
}

const fichiers = fs.readdirSync("js").filter((f) => f.endsWith(".js")).map((f) => path.join("js", f))
  .concat(["index.html"]);

const liste = process.argv.indexOf("--liste") >= 0 ? (process.argv[process.argv.indexOf("--liste") + 1] || "*") : null;
let total = 0;
const parFichier = [];
for (const f of fichiers) {
  const lignes = sansCommentaires(fs.readFileSync(f, "utf8"));
  const brutes = fs.readFileSync(f, "utf8").split(/\r?\n/);
  let n = 0;
  occurrences(lignes.join("\n")).forEach((o) => {
    if (/popup-native-ok/.test(brutes[o.ligne] || "")) return;
    n++;
    if (liste && (liste === "*" || o.nom === liste)) {
      console.log(f + ":" + (o.ligne + 1) + "  " + lignes[o.ligne].trim().slice(0, 110));
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
