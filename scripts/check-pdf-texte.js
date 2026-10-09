#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🖨️ check-pdf-texte.js — garde-fou pré-commit BLOQUANT (rejoué en CI)
// =====================================================================
// Les PDF de l'app (jsPDF, police standard Helvetica en WinAnsi) affichent tous les accents
// français et espagnols et la typographie « » ’ — … € (PDF d'échantillon du 09/10/2026). Hors
// police : flèches, coches, symboles, emojis — charabia qui désorganise toute la ligne.
// Avant le 09/10/2026, on croyait l'inverse et les libellés PDF étaient écrits SANS accents.
//   1. Libellés PDF des 3 dicos (clé contenant « .pdf. » ou « Ascii ») : uniquement des caractères
//      de la police (pas de → ✓ ⚠ ni d'emoji).
//   2. Plus de suppression d'accents dans le code des PDF : le texte libre passe par
//      window.ktaTextePdf (utils.js), qui garde les accents.
// =====================================================================

const fs = require("fs");

let ko = 0;
const t = (n, c, info) => {
  console.log((c ? "✅" : "❌") + " " + n + (c || info === undefined ? "" : "\n     " + info));
  if (!c) ko++;
};

const EXTRA = "ŒœŠšŽžŸƒˆ˜–—‘’‚“”„†‡•…‰‹›€™";
const horsPolice = (s) => [...String(s)].filter((c) => {
  const n = c.codePointAt(0);
  return !((n >= 0x20 && n <= 0x7E) || n === 0x0A || n === 0x09 || (n >= 0xA0 && n <= 0xFF) || EXTRA.includes(c));
});

// 1. Libellés PDF des dictionnaires : clés « .pdf. » / « Ascii », briefing pompiers (secours.surf.*,
//    secours.briefing.footer). Pas histoire.pdf.* (interface HTML du lecteur PDF, emojis voulus) ni les
//    toasts (affichés à l'écran).
const estLibellePdf = (k) => (/\.pdf\.|Ascii|^secours\.surf\.|^secours\.briefing\.footer$/.test(k)) &&
  !/^histoire\.pdf\.|\.toast\./.test(k);
for (const langue of ["fr", "en", "es"]) {
  const dico = JSON.parse(fs.readFileSync("lang/" + langue + ".json", "utf8"));
  const fautifs = Object.keys(dico)
    .filter((k) => estLibellePdf(k) && typeof dico[k] === "string")
    .map((k) => [k, horsPolice(dico[k])])
    .filter(([, h]) => h.length);
  t("lang/" + langue + ".json : libellés PDF dans la police des PDF (pas de → ✓ ⚠ ni d'emoji)",
    fautifs.length === 0, fautifs.slice(0, 8).map(([k, h]) => k + " → " + h.join(" ")).join("\n     "));
}

// 2. Plus de suppression d'accents dans les modules qui produisent des PDF
const MODULES_PDF = ["js/secoursMode.js", "js/sessionReport.js", "js/statsGlobales.js", "js/pdfExport.js"];
for (const f of MODULES_PDF) {
  const src = fs.readFileSync(f, "utf8");
  const nfd = (src.match(/normalize\(\s*["']NFD["']\s*\)/g) || []).length;
  t(f + " : aucun texte de PDF privé de ses accents (normalize(\"NFD\"))", nfd === 0, nfd + " occurrence(s)");
}
t("utils.js : window.ktaTextePdf existe", /window\.ktaTextePdf\s*=\s*function/.test(fs.readFileSync("js/utils.js", "utf8")));

console.log(ko === 0 ? "\n🎉 textes des PDF : accents gardés, rien hors police" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
