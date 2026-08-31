#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// ❓ check-aide-sections.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LE PROBLÈME : l'Aide intégrée (`js/interfaceDocs.js`) est du HTML EN DUR
// dans deux fonctions jumelles, `_aideHtmlFr()` et `_aideHtmlEn()`. Le hub
// (`_aideRendreHub`) les parse et range les sections en catégories via des
// INDEX NUMÉRIQUES écrits à la main dans `AIDE_CATEGORIES` — index COMMUNS
// aux deux langues. Rien ne vérifiait que les deux fonctions restaient
// alignées, ni que les index pointaient quelque part.
//
// TROIS BUGS RÉELS trouvés le 01/09/2026, tous du même mécanisme :
//   1. « 📚 Bibliothèque de plans » (FR) n'avait pas son conteneur : deux
//      titres dans UNE section. Le hub n'affichait qu'une ligne, la sous-modale
//      servait deux sujets collés, et « 👤 Mode profil » n'était atteignable
//      par aucune ligne.
//   2. La même section n'existait PAS en anglais → 31 sections EN contre 32 FR,
//      donc les index communs ne désignaient pas le même sujet selon la langue.
//   3. Un commentaire annonçait « Mon carnet = index 29 » alors qu'elle était
//      en 30 : l'index pointait sur « Liaisons inter-plan » et « Mon carnet »
//      tombait dans le filet « Autres », invisible.
//
// CE QUE CE SCRIPT VERROUILLE (tout est BLOQUANT) :
//   A. FR et EN déclarent le MÊME nombre de sections.
//   B. Chaque section porte EXACTEMENT un titre (attrape le conteneur oublié).
//   C. `AIDE_CATEGORIES` couvre TOUTES les sections — zéro orpheline. Le filet
//      « Autres » du runtime reste en place, mais il ne doit jamais servir :
//      une section qui y tombe est une section qu'on a cessé de ranger.
//   D. Aucun index hors bornes, aucun doublon entre catégories.
//
// ⚠️ Ce script lit la STRUCTURE, pas le sens : il ne peut pas voir qu'un index
// pointe sur le bon sujet, seulement qu'il pointe sur quelque chose et que les
// deux langues sont superposables. La correspondance de sens se vérifie à
// l'œil (le contrôle FR ↔ EN a été fait au moment de la révision des index).
// =====================================================================

const fs = require("fs");

const SRC = "js/interfaceDocs.js";
let src;
try {
  src = fs.readFileSync(SRC, "utf8");
} catch (e) {
  console.error("❌ [check-aide-sections] " + SRC + " illisible : " + e.message);
  process.exit(2);
}

const lignes = src.split(/\r?\n/);

// --- extraction des sections d'une fonction _aideHtml* ----------------
// On lit le CODE RÉEL plutôt qu'une copie : une divergence entre ce fichier
// et le module serait exactement le défaut que le script prétend interdire.
function sectionsDe(nomFonction) {
  const debut = lignes.findIndex((l) => l.indexOf("function " + nomFonction) !== -1);
  if (debut < 0) return null;
  let fin = debut + 1;
  for (; fin < lignes.length; fin++) {
    if (/^function |^const AIDE|^\/\/ =====/.test(lignes[fin])) break;
  }
  const out = [];
  let courante = null;
  for (let i = debut; i < fin; i++) {
    if (/class="kta-aide-section"/.test(lignes[i])) {
      courante = { titres: [], ligne: i + 1 };
      out.push(courante);
    }
    if (/kta-aide-section-titre/.test(lignes[i]) && courante) {
      courante.titres.push(lignes[i].replace(/<[^>]*>/g, "").trim());
    }
  }
  return out;
}

const fr = sectionsDe("_aideHtmlFr");
const en = sectionsDe("_aideHtmlEn");

const echecs = [];
function verif(nom, ok, aide) {
  console.log((ok ? "✅ " : "❌ ") + nom);
  if (!ok) echecs.push(aide);
}

if (!fr || !en) {
  console.error("❌ [check-aide-sections] _aideHtmlFr / _aideHtmlEn introuvables dans " + SRC);
  process.exit(1);
}

// --- A. même nombre de sections ---------------------------------------
verif(
  "FR et EN déclarent le même nombre de sections  (FR " + fr.length + " · EN " + en.length + ")",
  fr.length === en.length,
  "Les deux langues n'ont pas le même découpage — les index d'AIDE_CATEGORIES sont COMMUNS, " +
  "ils ne peuvent donc plus désigner le même sujet des deux côtés. Ajoute la section manquante " +
  "dans la langue qui l'a perdue, À LA MÊME POSITION."
);

// --- B. exactement un titre par section -------------------------------
[["FR", fr], ["EN", en]].forEach(function (paire) {
  const lang = paire[0], secs = paire[1];
  const fautives = secs
    .map(function (s, i) { return { i: i, n: s.titres.length, ligne: s.ligne, t: s.titres[0] || "(sans titre)" }; })
    .filter(function (s) { return s.n !== 1; });
  verif(
    lang + " : exactement 1 titre par section",
    fautives.length === 0,
    lang + " — section(s) à titre multiple ou absent : " +
    fautives.map(function (s) { return "#" + s.i + " (l." + s.ligne + ", " + s.n + " titres — « " + s.t + " »)"; }).join(", ") +
    ". Un conteneur `<div class=\"kta-aide-section\">` a probablement été oublié : les deux sujets " +
    "sont fusionnés, le hub n'affiche que le premier titre et le second devient inatteignable."
  );
});

// --- C + D. couverture d'AIDE_CATEGORIES ------------------------------
const blocCat = /const AIDE_CATEGORIES = \[([\s\S]*?)\n\];/.exec(src);
verif("AIDE_CATEGORIES trouvée dans le module", !!blocCat, "AIDE_CATEGORIES introuvable — le script ne peut plus rien vérifier.");

if (blocCat) {
  const tousIdx = [];
  const doublons = [];
  const vus = {};
  const reIdx = /idx:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = reIdx.exec(blocCat[1])) !== null) {
    m[1].split(",").forEach(function (x) {
      const v = parseInt(x.trim(), 10);
      if (isNaN(v)) return;
      tousIdx.push(v);
      if (vus[v]) doublons.push(v); else vus[v] = true;
    });
  }

  const horsBornes = tousIdx.filter(function (i) { return i < 0 || i >= fr.length; });
  verif(
    "aucun index hors bornes (0…" + (fr.length - 1) + ")",
    horsBornes.length === 0,
    "Index hors bornes : " + horsBornes.join(", ") + " — ils ne rangent rien et leur section reste orpheline."
  );

  verif(
    "aucun index rangé dans deux catégories",
    doublons.length === 0,
    "Index en double : " + doublons.join(", ") + " — la section apparaîtrait deux fois dans le hub."
  );

  const orphelines = [];
  for (let i = 0; i < fr.length; i++) if (!vus[i]) orphelines.push(i);
  verif(
    "couverture complète : " + tousIdx.length + " index pour " + fr.length + " sections",
    orphelines.length === 0,
    "Section(s) non rangée(s) : " +
    orphelines.map(function (i) { return "#" + i + " « " + (fr[i].titres[0] || "?") + " »"; }).join(", ") +
    ". Elles tombent dans le filet « Autres » du hub — c'est le symptôme exact du bug « Mon carnet » " +
    "(un index annoncé à 29 alors que la section était en 30). Range-les explicitement."
  );
}

// --- verdict -----------------------------------------------------------
if (!echecs.length) {
  console.log("\n🎉 aide intégrée : structure FR/EN alignée, " + fr.length + " sections toutes rangées");
  process.exit(0);
}
console.log("\n============================================================");
console.log("🛑 COMMIT REFUSÉ — structure de l'Aide intégrée incohérente");
console.log("============================================================");
echecs.forEach(function (a) { console.log("\n   • " + a); });
console.log("\n   Détails de la règle : en-tête de ce script · js/interfaceDocs.js > AIDE_CATEGORIES");
console.log("");
process.exit(1);
