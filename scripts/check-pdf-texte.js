#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-pdf-texte.js — garde-fou pré-commit BLOQUANT (rejoué en CI) : textes des PDF dans la police
// =====================================================================
// ⚠️ jsPDF en Helvetica WinAnsi affiche tous les accents FR/ES et « » ’ — … € : on écrit AVEC accents.
// 🩸 Hors police (flèches, coches, symboles, emojis) : charabia qui désorganise toute la ligne.
//   1. libellés PDF des 3 dicos : uniquement des caractères de la police ;
//   2. aucune suppression d'accents (normalize("NFD")) dans les modules PDF : le texte libre passe par
//      window.ktaTextePdf (js/utils.js), qui garde les accents ;
//   3. auto-test de ktaTextePdf (exécuté).
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

// 1. Clés « .pdf. » / « Ascii », briefing secours (secours.surf.*, secours.briefing.footer). Pas
//    histoire.pdf.* (interface HTML du lecteur, emojis voulus) ni les toasts (affichés à l'écran).
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

// 2. Modules qui produisent des PDF
const MODULES_PDF = ["js/secoursMode.js", "js/sessionReport.js", "js/statsGlobales.js", "js/pdfExport.js"];
for (const f of MODULES_PDF) {
  const src = fs.readFileSync(f, "utf8");
  const nfd = (src.match(/normalize\(\s*["']NFD["']\s*\)/g) || []).length;
  t(f + " : aucun texte de PDF privé de ses accents (normalize(\"NFD\"))", nfd === 0, nfd + " occurrence(s)");
}
const utilsSrc = fs.readFileSync("js/utils.js", "utf8");
t("utils.js : window.ktaTextePdf existe", /window\.ktaTextePdf\s*=\s*function/.test(utilsSrc));

// 3. Une lettre hors police garde sa base (« Łódź » → « Lódz »), accents FR gardés, symboles convertis,
//    emojis retirés, rien hors police en sortie.
const bloc = (utilsSrc.match(/\(function \(\) \{\s*const EXTRA[\s\S]*?\n\}\)\(\);/) || [])[0];
t("utils.js : bloc de window.ktaTextePdf repérable pour l'auto-test", !!bloc);
if (bloc) {
  const bac = { window: {} };
  require("vm").runInNewContext(bloc, bac);
  const f = bac.window.ktaTextePdf;
  const CAS = [
    ["Łódź", "Lódz"], ["Kraków", "Kraków"], ["Dąbrowa Górnicza", "Dabrowa Górnicza"], ["Brno — Šťastný", "Brno — Štastný"],
    ["Ţară", "Tara"], ["Đuro", "Duro"], ["Équipe « Été » ’ …", "Équipe « Été » ’ …"], ["A → B ✓", "A -> B OK"],
    ["Salle 🦇 nord", "Salle  nord"], ["ﬁn", "fin"], ["", ""], [null, ""]
  ];
  const ratés = CAS.filter(([e, a]) => typeof f !== "function" || f(e) !== a)
    .map(([e, a]) => JSON.stringify(e) + " → " + JSON.stringify(typeof f === "function" ? f(e) : "?") + " (attendu " +
      JSON.stringify(a) + ")");
  t("ktaTextePdf : " + CAS.length + " cas (lettre de base gardée, accents FR gardés, symboles, emojis)",
    ratés.length === 0, ratés.join("\n     "));
  const hors = typeof f === "function" ? horsPolice(f("Łódź Ţară ☃ 𝔸 ǅ ﬀ ① ㎡ ΑΩ 漢")) : ["?"];
  t("ktaTextePdf : rien hors police en sortie, quel que soit le texte", hors.length === 0, hors.join(" "));
}

console.log(ko === 0 ? "\n🎉 textes des PDF : accents gardés, rien hors police" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
