#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-doc-sidebar.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Confronte le tableau récapitulatif des groupes de la barre latérale, dans
// les trois `README_USER`, à ce que `js/interface.js` déclare vraiment.
// Sans lui, la doc dérive en silence : nombre de groupes faux, groupes réels
// absents, groupes retirés encore décrits.
// Vérifie : le nombre annoncé = nombre déclaré ; chaque groupe a sa ligne ;
// fantômes absents (Générateur présenté comme groupe de la barre, « effacer »
// depuis la ligne Édition) ; aucune ligne orpheline après le tableau (une note
// insérée au milieu le coupe en deux au rendu Markdown).
// ⚠️ Ne lit que la structure, pas la prose des cellules.
// =====================================================================
"use strict";

const fs = require("fs");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const SRC = fs.readFileSync("js/interface.js", "utf8");
const FR  = JSON.parse(fs.readFileSync("lang/fr.json", "utf8"));

// ── 1. la vérité terrain : ce que interface.js déclare ───────────────
const groupes = [];
{
  const re = /_creerGroupeAccordeon\(\{[\s\S]{0,500}?id:\s*"([^"]+)"[\s\S]{0,500}?titre:\s*window\.I18n\.t\("([^"]+)"\)/g;
  let m;
  while ((m = re.exec(SRC)) !== null) groupes.push({ id: m[1], cle: m[2] });
}
t("la barre latérale déclare au moins 10 groupes (extraction saine)", groupes.length >= 10);
t("aucun id de groupe en double", new Set(groupes.map((g) => g.id)).size === groupes.length);
console.log("   → " + groupes.length + " groupes : " + groupes.map((g) => g.id).join(", "));

// ── 2. le compte annoncé par la doc ──────────────────────────────────
const DOCS = [
  { l: "fr", p: "docs/applications/README_USER.md",    nb: /organisée en \*\*(\d+) groupes\*\*/,   mot: "groupes" },
  { l: "en", p: "docs/applications/README_USER.en.md", nb: /organized into \*\*(\d+) groups\*\*/,  mot: "groups"  },
  { l: "es", p: "docs/applications/README_USER.es.md", nb: /organizada en \*\*(\d+) grupos\*\*/,   mot: "grupos"  }
];

// ⚠️ Libellés tenus ICI et non lus dans les dicos : c'est le texte écrit dans
// la doc qu'on confronte. Un renommage passe par les deux.
const ATTENDUS = {
  favoris:    { fr: "Favoris",            en: "Favorites",     es: "Favoritos" },
  aide:       { fr: "Aide / Documentation / Légende", en: "Help / Documentation / Legend", es: "Ayuda / Documentación / Leyenda" },   // = ui.group.aide
  settings:   { fr: "Réglages",           en: "Settings",      es: "Ajustes" },   // un seul mot, celui de la modale
  recherche:  { fr: "Recherche",          en: "Search",        es: "Búsqueda" },
  charger:    { fr: "Charger / Import",   en: "Load / Import", es: "Cargar / Importar" },
  save:       { fr: "Exporter",           en: "Export",        es: "Exportar" },
  history:    { fr: "Historique",         en: "History",       es: "Historial" },
  tracker:    { fr: "Tracker",            en: "Tracker",       es: "Rastreador" },
  mesure:     { fr: "Mesure",             en: "Measurement",   es: "Medición" },
  edition:    { fr: "Édition de points",  en: "Point editing", es: "Edición de puntos" },
  traces:     { fr: "Tracés",             en: "Paths",         es: "Trazados" },
  zones:      { fr: "Zones",              en: "Zones",         es: "Zonas" },
  structures: { fr: "Structures",         en: "Structures",    es: "Estructuras" }
};

DOCS.forEach(function (d) {
  const DOC = fs.readFileSync(d.p, "utf8");
  const m = DOC.match(d.nb);
  t("🩸 " + d.l + " : la doc annonce un nombre de " + d.mot, !!m);
  if (m) {
    t("🩸 " + d.l + " : " + m[1] + " annoncés = " + groupes.length + " déclarés",
      Number(m[1]) === groupes.length);
  }

  groupes.forEach(function (g) {
    const lib = ATTENDUS[g.id] && ATTENDUS[g.id][d.l];
    if (!lib) { t("⚠️ " + d.l + " : libellé attendu manquant pour « " + g.id + " » (à déclarer ici)", false); return; }
    t(d.l + " : le tableau liste « " + lib + " »", DOC.indexOf("| **" + lib) >= 0);
  });

  t("🩸 " + d.l + " : le Générateur n'est PAS présenté comme un groupe de la barre",
    !/\| \*\*(Créer \/ Modifier plan|Create \/ Edit plan|Crear \/ Modificar (?:plano|mapa))\*\*/.test(DOC));
  t("🩸 " + d.l + " : la ligne Édition ne promet plus « effacer » depuis la barre",
    !/\| \*\*(Édition de points|Point editing|Edición de puntos)\*\*[^\n]*(, effacer|, clear|, borrar)/.test(DOC));

  // 🩸 Un blockquote au milieu coupe le tableau au rendu : la moitié basse
  // perd son en-tête. Aucune ligne « | **X** | » après la fin du tableau.
  const iTab = DOC.indexOf("| Groupe | Icône |") >= 0 ? DOC.indexOf("| Groupe | Icône |")
             : DOC.indexOf("| Group | Icon |") >= 0 ? DOC.indexOf("| Group | Icon |")
             : DOC.indexOf("| Grupo | Icono |");
  t(d.l + " : l'en-tête du tableau existe", iTab >= 0);
  if (iTab >= 0) {
    const bloc = DOC.slice(iTab, iTab + 4000);
    const finTab = bloc.search(/\r?\n\r?\n/);         // 1re ligne vide = fin du tableau
    const apres = bloc.slice(finTab, finTab + 2500);
    t("🩸 " + d.l + " : aucune ligne de tableau orpheline après la coupure",
      !/^\| \*\*/m.test(apres));
  }
});

console.log(ko === 0 ? "\n🎉 doc de la barre latérale : conforme au code" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
