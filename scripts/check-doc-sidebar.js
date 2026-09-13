#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧭 check-doc-sidebar.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LE TABLEAU RÉCAPITULATIF DES GROUPES DE LA BARRE LATÉRALE, dans les trois
// `README_USER`, confronté à ce que `js/interface.js` déclare vraiment.
//
// 🩸 POURQUOI CE CONTRÔLE EXISTE. Le 05/09/2026, KARMA signale que la doc
// décrit un bouton 🗑️ voisin de ✏️ ouvrant une fenêtre à deux options — retiré
// le 25/05 (commit b9de2fa), quatre mois plus tôt. En cherchant si d'autres
// erreurs du même genre traînaient, le tableau récapitulatif s'est révélé
// faux sur CINQ points d'un coup, dont un plus ancien encore :
//
//   1. « 🏗️ Créer / Modifier plan » y figurait comme un groupe de la barre.
//      `interface.js` écrit pourtant en toutes lettres « RETIRÉ du mode carte
//      (refonte UI imposée depuis v1.14.19) », branche legacy supprimée au
//      cleanup v1.26.2. Le Générateur ne vit plus que dans le HOME. Un
//      utilisateur pouvait chercher ce bouton indéfiniment.
//   2. « 11 groupes » annoncés, 13 déclarés.
//   3. Trois groupes RÉELS absents du tableau : ⭐ Favoris, ⏪ Historique,
//      🏛️ Structures.
//   4. « Édition de points : ajouter tes propres points, effacer » — le même
//      fantôme que la sous-action 🗑️.
//   5. La note « 💡 Calque Mes annotations » était insérée AU MILIEU du
//      tableau : en Markdown ça le coupe en deux, la ligne Zones sortait du
//      tableau au rendu.
//
// AUCUN de ces défauts n'était détectable autrement : rien ne confrontait la
// doc au code. C'est ce chaînon manquant qu'on pose ici.
//
// CE QUE CE GARDE-FOU NE FAIT PAS : vérifier la PROSE. Il ne lit que la
// structure — combien de groupes, lesquels, et l'absence des fantômes connus.
// Une description inexacte à l'intérieur d'une cellule lui échappe.
// =====================================================================
"use strict";

const fs = require("fs");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const SRC = fs.readFileSync("js/interface.js", "utf8");
const FR  = JSON.parse(fs.readFileSync("lang/fr.json", "utf8"));

// ───────── 1. la vérité terrain : ce que interface.js déclare ─────────
const groupes = [];
{
  const re = /_creerGroupeAccordeon\(\{[\s\S]{0,500}?id:\s*"([^"]+)"[\s\S]{0,500}?titre:\s*window\.I18n\.t\("([^"]+)"\)/g;
  let m;
  while ((m = re.exec(SRC)) !== null) groupes.push({ id: m[1], cle: m[2] });
}
t("la barre latérale déclare au moins 10 groupes (extraction saine)", groupes.length >= 10);
t("aucun id de groupe en double", new Set(groupes.map((g) => g.id)).size === groupes.length);
console.log("   → " + groupes.length + " groupes : " + groupes.map((g) => g.id).join(", "));

// ───────── 2. le compte annoncé par la doc ─────────
const DOCS = [
  { l: "fr", p: "docs/applications/README_USER.md",    nb: /organisée en \*\*(\d+) groupes\*\*/,   mot: "groupes" },
  { l: "en", p: "docs/applications/README_USER.en.md", nb: /organized into \*\*(\d+) groups\*\*/,  mot: "groups"  },
  { l: "es", p: "docs/applications/README_USER.es.md", nb: /organizada en \*\*(\d+) grupos\*\*/,   mot: "grupos"  }
];

// Les libellés attendus par langue, groupe par groupe. Ils vivent ICI et pas
// dans les dicos : la doc les écrit en toutes lettres, c'est justement ce
// qu'on veut confronter. Un renommage devra passer par les deux.
const ATTENDUS = {
  favoris:    { fr: "Favoris",            en: "Favorites",     es: "Favoritos" },
  aide:       { fr: "Aide / Documentation / Légende", en: "Help / Documentation / Legend", es: "Ayuda / Documentación / Leyenda" },   // = ui.group.aide (audit ergonomie D9, 13/09/2026)
  settings:   { fr: "Paramètres",         en: "Settings",      es: "Ajustes" },
  recherche:  { fr: "Recherche",          en: "Search",        es: "Búsqueda" },
  charger:    { fr: "Charger / Import",   en: "Load / Import", es: "Cargar / Importar" },
  save:       { fr: "Enregistrer",        en: "Save",          es: "Guardar" },
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

  // Chaque groupe reel doit avoir sa ligne dans le tableau.
  groupes.forEach(function (g) {
    const lib = ATTENDUS[g.id] && ATTENDUS[g.id][d.l];
    if (!lib) { t("⚠️ " + d.l + " : libellé attendu manquant pour « " + g.id + " » (à déclarer ici)", false); return; }
    t(d.l + " : le tableau liste « " + lib + " »", DOC.indexOf("| **" + lib) >= 0);
  });

  // 🩸 Les fantomes connus ne doivent pas repousser.
  t("🩸 " + d.l + " : le Générateur n'est PAS présenté comme un groupe de la barre",
    !/\| \*\*(Créer \/ Modifier plan|Create \/ Edit plan|Crear \/ Modificar plano)\*\*/.test(DOC));
  t("🩸 " + d.l + " : la ligne Édition ne promet plus « effacer » depuis la barre",
    !/\| \*\*(Édition de points|Point editing|Edición de puntos)\*\*[^\n]*(, effacer|, clear|, borrar)/.test(DOC));

  // 🩸 Un tableau coupe par un blockquote se casse en deux au rendu : la
  // moitie basse perd son en-tete. On verifie qu aucune ligne « | **X** | »
  // ne traine APRES la fin du tableau.
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
