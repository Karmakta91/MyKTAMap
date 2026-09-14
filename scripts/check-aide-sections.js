#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// ❓ check-aide-sections.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// L'Aide intégrée vit désormais dans les DICOS (`lang/<code>.json`), plus en
// HTML dur dans `js/interfaceDocs.js` (migration lot 2, 01/09/2026). Ce script
// a suivi : il ne compare plus deux fonctions HTML jumelles, il vérifie que le
// contrat entre le MODULE et les DICOS tient, dans TOUTES les langues.
//
// POURQUOI CE GARDE-FOU EXISTE — 4 bugs réels, tous du même mécanisme d'index
// numériques tenus à la main (l'ancien `AIDE_CATEGORIES.idx`) :
//   1. un conteneur oublié fusionnait 2 sections FR → « Mode profil » n'était
//      atteignable par aucune ligne du hub ;
//   2. la même section n'existait pas en anglais → 31 sections EN contre 32 FR,
//      alors que les index étaient COMMUNS aux deux langues ;
//   3. « Mon carnet » annoncée à l'index 29 mais vivant en 30 → elle tombait
//      dans le filet « Autres », invisible ;
//   4. la catégorie « Coordination secours » pointait sur la section
//      **Tracker** — le vrai Mode Secours était rangé dans « Outils carte ».
// Les slugs ont rendu (4) évident ; ce script empêche la famille entière de
// revenir.
//
// CE QU'IL VERROUILLE (tout est BLOQUANT) :
//   A. Chaque slug d'AIDE_SECTIONS a ses 2 clés (`titre` + `html`) dans CHAQUE
//      dico — c'est ce qui attrape une langue laissée en arrière.
//   B. AIDE_CATEGORIES ne range que des slugs connus, sans doublon, et couvre
//      TOUT : zéro section reléguée au filet « Autres ».
//   C. Les libellés d'interface (`aide.ui.*`, `aide.cat.*`) existent partout.
//   D. Aucune clé `aide.*` orpheline dans un dico (section supprimée du module
//      mais laissée dans les 3 fichiers de langue).
//
// ⚠️ Il vérifie la PRÉSENCE, pas la QUALITÉ : il ne peut pas voir qu'une
// traduction est fausse, ni qu'un slug est rangé dans la mauvaise catégorie.
// =====================================================================

const fs = require("fs");

const SRC = "js/interfaceDocs.js";
const LANGS = ["fr", "en", "es"];

let src;
try { src = fs.readFileSync(SRC, "utf8"); }
catch (e) { console.error("❌ [check-aide-sections] " + SRC + " illisible"); process.exit(2); }

// --- extraction des listes depuis le MODULE (pas une copie) -----------
function tableau(nom) {
  const re = new RegExp("const " + nom + " = \\[([\\s\\S]*?)\\n\\];");
  const m = re.exec(src);
  if (!m) return null;
  return (m[1].match(/"([^"]+)"/g) || []).map(function (s) { return s.slice(1, -1); });
}
const SECTIONS = tableau("AIDE_SECTIONS");

// AIDE_CATEGORIES : { cle: "...", slugs: [...] }
const mCat = /const AIDE_CATEGORIES = \[([\s\S]*?)\n\];/.exec(src);
const CATS = [];
if (mCat) {
  const re = /\{\s*cle:\s*"([^"]+)"\s*,\s*slugs:\s*\[([\s\S]*?)\]\s*\}/g;
  let m;
  while ((m = re.exec(mCat[1])) !== null) {
    CATS.push({ cle: m[1], slugs: (m[2].match(/"([^"]+)"/g) || []).map(function (s) { return s.slice(1, -1); }) });
  }
}

const echecs = [];
function verif(nom, ok, aide) {
  console.log((ok ? "✅ " : "❌ ") + nom);
  if (!ok) echecs.push(aide);
}

if (!SECTIONS || !CATS.length) {
  console.error("❌ AIDE_SECTIONS / AIDE_CATEGORIES introuvables dans " + SRC +
                " — le contrat module↔dicos n'est plus vérifiable.");
  process.exit(1);
}
console.log("📖 " + SECTIONS.length + " sections déclarées · " + CATS.length + " catégories\n");

// --- dicos -------------------------------------------------------------
const dicos = {};
LANGS.forEach(function (c) {
  try { dicos[c] = JSON.parse(fs.readFileSync("lang/" + c + ".json", "utf8")); }
  catch (e) { console.error("❌ lang/" + c + ".json illisible : " + e.message); process.exit(1); }
});

// --- A. couverture des sections, langue par langue ---------------------
LANGS.forEach(function (c) {
  const manquantes = [];
  SECTIONS.forEach(function (slug) {
    ["titre", "html"].forEach(function (suffixe) {
      const k = "aide.sec." + slug + "." + suffixe;
      if (!dicos[c][k] || !String(dicos[c][k]).trim()) manquantes.push(slug + "." + suffixe);
    });
  });
  verif(c + " : les " + SECTIONS.length + " sections sont traduites (titre + html)",
        manquantes.length === 0,
        c + " — " + manquantes.length + " clé(s) de section absente(s) ou vide(s) : " +
        manquantes.slice(0, 6).join(", ") + (manquantes.length > 6 ? " … (+" + (manquantes.length - 6) + ")" : "") +
        ". Une langue incomplète affiche la clé brute à l'utilisateur.");
});

// --- C. libellés d'interface ------------------------------------------
const UI = ["aide.intro", "aide.ui.titre", "aide.ui.search", "aide.ui.shortcuts",
            "aide.ui.other", "aide.ui.back", "aide.ui.empty",
            "aide.ctx.btn"]   // ❓ v1.94.0 — libellé du bouton d'aide contextuelle des modales
  .concat(CATS.map(function (c) { return "aide.cat." + c.cle; }));
LANGS.forEach(function (c) {
  const manque = UI.filter(function (k) { return !dicos[c][k]; });
  verif(c + " : libellés d'interface (" + UI.length + ")", manque.length === 0,
        c + " — manquants : " + manque.join(", "));
});

// --- B. rangement -------------------------------------------------------
const vus = {};
const inconnus = [], doublons = [];
CATS.forEach(function (cat) {
  cat.slugs.forEach(function (s) {
    if (SECTIONS.indexOf(s) < 0) inconnus.push(cat.cle + " → " + s);
    if (vus[s]) doublons.push(s); else vus[s] = cat.cle;
  });
});
verif("aucun slug inconnu dans les catégories", inconnus.length === 0,
      "Slug(s) rangé(s) mais absent(s) d'AIDE_SECTIONS : " + inconnus.join(", ") +
      " — la ligne ne s'affichera jamais.");
verif("aucun slug rangé deux fois", doublons.length === 0,
      "Slug(s) en double : " + doublons.join(", ") + " — la section apparaîtrait deux fois dans le hub.");

const orphelins = SECTIONS.filter(function (s) { return !vus[s]; });
verif("couverture complète : " + Object.keys(vus).length + "/" + SECTIONS.length + " sections rangées",
      orphelins.length === 0,
      "Section(s) non rangée(s) : " + orphelins.join(", ") +
      ". Elles tomberaient dans le filet « Autres » — c'est le symptôme exact du bug « Mon carnet ».");

// --- D. clés orphelines dans les dicos ---------------------------------
LANGS.forEach(function (c) {
  const attendues = {};
  UI.forEach(function (k) { attendues[k] = 1; });
  // ⌨️ `.raccourci` est FACULTATIF : seules les sections qui ont un raccourci
  // clavier le portent. Il est accepté ici, jamais exigé.
  SECTIONS.forEach(function (s) {
    attendues["aide.sec." + s + ".titre"] = 1;
    attendues["aide.sec." + s + ".html"] = 1;
    attendues["aide.sec." + s + ".raccourci"] = 1;
  });
  const orph = Object.keys(dicos[c]).filter(function (k) {
    return /^aide\./.test(k) && !attendues[k];
  });
  verif(c + " : aucune clé aide.* orpheline", orph.length === 0,
        c + " — clé(s) sans consommateur : " + orph.slice(0, 6).join(", ") +
        ". Une section retirée du module doit l'être des 3 dicos.");
});

// --- E. aucun balisage dans un titre -----------------------------------
// 🩸 KARMA, 14/09/2026 : « Recherche unifiée <span class="kta-aide-mini">
// (Ctrl+K)</span> » s'affichait tel quel. Les titres sont posés en
// `textContent` — un `<span>` dans le dico se lit en clair à l'écran. La
// mise en forme appartient au gabarit (`_aidePoserTitre`), le dico ne porte
// que du texte.
LANGS.forEach(function (c) {
  const fautifs = SECTIONS.filter(function (s) {
    const v = dicos[c]["aide.sec." + s + ".titre"];
    return typeof v === "string" && /<[a-z/]/i.test(v);
  });
  verif(c + " : aucun titre de section ne contient de balisage", fautifs.length === 0,
        c + " — titre(s) avec du HTML : " + fautifs.join(", ") +
        ". Un titre est posé en textContent : le balisage s'afficherait en clair. " +
        "Le raccourci clavier va dans « aide.sec.<slug>.raccourci », mis en forme par le gabarit.");
});

// --- verdict -----------------------------------------------------------
if (!echecs.length) {
  console.log("\n🎉 aide intégrée : " + SECTIONS.length + " sections × " + LANGS.length +
              " langues, toutes rangées, aucun orphelin");
  process.exit(0);
}
console.log("\n============================================================");
console.log("🛑 COMMIT REFUSÉ — contrat Aide ↔ dicos rompu");
console.log("============================================================");
echecs.forEach(function (a) { console.log("\n   • " + a); });
console.log("\n   Détails : en-tête de ce script · js/interfaceDocs.js > AIDE_SECTIONS");
console.log("");
process.exit(1);
