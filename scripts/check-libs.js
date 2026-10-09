#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📚 check-libs.js — garde-fou pré-commit BLOQUANT (rejoué en CI)
// =====================================================================
// Les librairies de lib/ sont copiées à la main (PWA hors ligne, pas de bundler). Leur veille passe par
// lib/package.json, manifeste DÉCLARATIF lu par Dependabot (avis de sécurité, nouvelles versions). Trois
// sources doivent dire la même version, sinon la veille ment :
//   • l'en-tête du fichier embarqué (ce qui tourne vraiment) ;
//   • lib/package.json (ce que Dependabot surveille) ;
//   • lib/VERSIONS.md (ce que l'humain lit).
// Une PR Dependabot ne touche que le manifeste : ce script la fait échouer tant que le fichier et la table
// n'ont pas suivi — c'est voulu (la mise à jour réelle reste un geste testé, cf. lib/VERSIONS.md).
// =====================================================================

const fs = require("fs");

let ko = 0;
const t = (n, c, info) => {
  console.log((c ? "✅" : "❌") + " " + n + (c || info === undefined ? "" : "  → " + info));
  if (!c) ko++;
};

// paquet npm → fichiers embarqués + motif de version dans leur en-tête (1er groupe = version)
const LIBS = {
  leaflet:     { fichiers: ["lib/leaflet/leaflet.js", "lib/leaflet/leaflet-src.js"], motif: /Leaflet (\d+\.\d+\.\d+)/ },
  jszip:       { fichiers: ["lib/jszip.min.js"],          motif: /JSZip v(\d+\.\d+\.\d+)/ },
  jspdf:       { fichiers: ["lib/jspdf.umd.min.js"],      motif: /jsPDF[\s\S]{0,200}?Version (\d+\.\d+\.\d+)/ },
  html2canvas: { fichiers: ["lib/html2canvas.min.js"],    motif: /html2canvas (\d+\.\d+\.\d+)/ }
};
// libellé de la ligne dans lib/VERSIONS.md
const LIGNE = { leaflet: "**Leaflet**", jszip: "**JSZip**", jspdf: "**jsPDF**", html2canvas: "**html2canvas**" };

let manifeste = {};
try { manifeste = JSON.parse(fs.readFileSync("lib/package.json", "utf8")).dependencies || {}; }
catch (e) { t("lib/package.json lisible", false, e.message); }
const table = fs.existsSync("lib/VERSIONS.md") ? fs.readFileSync("lib/VERSIONS.md", "utf8").split(/\r?\n/) : [];

t("lib/package.json déclare exactement les librairies suivies",
  Object.keys(manifeste).sort().join(",") === Object.keys(LIBS).sort().join(","), Object.keys(manifeste).join(","));

for (const [nom, def] of Object.entries(LIBS)) {
  const declaree = manifeste[nom];
  t(nom + " : version EXACTE dans lib/package.json (pas de ^ ni ~)", /^\d+\.\d+\.\d+$/.test(declaree || ""), declaree);
  for (const f of def.fichiers) {
    let tete = "";
    try { tete = fs.readFileSync(f, "utf8").slice(0, 2000); } catch { /* absent */ }
    const m = def.motif.exec(tete);
    t(nom + " : " + f + " embarque " + declaree, !!m && m[1] === declaree, m ? "en-tête " + m[1] : "en-tête illisible");
  }
  const ligne = table.find((l) => l.startsWith("| " + LIGNE[nom] + " "));
  t(nom + " : lib/VERSIONS.md dit " + declaree, !!ligne && ligne.includes("**" + declaree + "**"),
    ligne ? ligne.slice(0, 80) : "ligne absente");
}

console.log(ko === 0 ? "\n🎉 librairies : fichiers, manifeste et table concordent" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
