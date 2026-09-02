#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🏷️ check-icon-catalog.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Confronte les DEUX tables de tags built-in du projet :
//   • `js/map.js > TAGS_BUILTIN`            — la SOURCE (exposée en
//     `window._ktaBuiltinIconUrls` dès le chargement du script)
//   • `js/osmHomePreview.js > TAGS_BUILTIN_HOME` — le FILET DE SECOURS,
//     utilisé seulement si map.js n'est pas chargé
//
// LE BUG D'ORIGINE (v1.81.0) : la table du HOME faisait autorité et a dérivé
// DEUX FOIS sans que rien ne le signale.
//   - `entree_plan` (v1.41.0) — dont le commentaire dit pourtant « Vue OSM ×
//     Mode Secours » : il manquait précisément dans la Vue OSM ;
//   - `portail` (v1.59.0) — l'icône vortex des liaisons inter-plans.
// Conséquence visible : en Vue OSM, un point portail tombait sur le
// `circleMarker` de secours — un petit rond jaune de rayon 4 à la place de son
// icône. Le module le SAVAIT et l'écrivait (« ⚠️ Tags POI sans icône :
// portail(N) »)… en `console.log`, dégradé depuis `console.warn` en v1.40.15,
// donc noyé dans le bruit et invisible du smoke.
//
// POURQUOI DEUX TABLES SUBSISTENT : `osmHomePreview` dessine des plans qui ne
// sont PAS chargés (il lit leur ZIP), sur un HOME affiché avant tout plan. Il
// ne peut donc pas passer par `window._iconMap`, qui est le résolveur du plan
// courant. Depuis la v1.81.0 il lit `window._ktaBuiltinIconUrls` ; la copie
// locale ne sert que si `map.js` venait à ne pas être chargé.
//
// CE QUI EST VÉRIFIÉ :
//   A. aucun tag de map.js absent de la copie du HOME (le bug d'origine) ;
//   B. aucun tag inventé côté HOME et inconnu de map.js (dérive inverse) ;
//   C. la copie n'est plus consommée directement : `osmHomePreview` doit lire
//      `window._ktaBuiltinIconUrls` en priorité — sans quoi les deux tables
//      peuvent rester identiques et le HOME continuer à utiliser la mauvaise ;
//   D. `map.js` expose la globale AU TOP-LEVEL, hors de toute fonction. C'est
//      tout le sujet : à l'intérieur de `creerIcones()`, elle n'existait
//      qu'après le chargement d'un plan — trop tard pour le HOME.
//
// ⚠️ Contrôle STATIQUE : il compare des listes de CLÉS. Il ne dit pas qu'un
// fichier `icon/<tag>.png` existe ni qu'il s'affiche — ça, c'est le smoke.
// =====================================================================

const fs = require("fs");

const MAP  = "js/map.js";
const HOME = "js/osmHomePreview.js";

let msrc, hsrc;
try {
  msrc = fs.readFileSync(MAP, "utf8");
  hsrc = fs.readFileSync(HOME, "utf8");
} catch (e) {
  console.error("❌ [check-icon-catalog] fichier illisible : " + e.message);
  process.exit(2);
}

// --- extraction des clés d'un littéral d'objet ---------------------------
// On borne au littéral pour ne pas ramasser des identifiants voisins : on part
// de l'accolade ouvrante et on compte les niveaux jusqu'à la fermante.
function extraireCles(src, declaration, ou) {
  const i = src.indexOf(declaration);
  if (i < 0) {
    console.error("❌ [check-icon-catalog] `" + declaration + "` introuvable dans " + ou +
                  " — la table a été renommée ou supprimée. Ce garde-fou ne peut plus " +
                  "rien vérifier : mets-le à jour AVANT de committer.");
    process.exit(2);
  }
  let n = 0, fin = -1;
  const debut = src.indexOf("{", i);
  for (let k = debut; k < src.length; k++) {
    if (src[k] === "{") n++;
    else if (src[k] === "}") { n--; if (n === 0) { fin = k; break; } }
  }
  if (fin < 0) {
    console.error("❌ [check-icon-catalog] littéral non refermé pour `" + declaration + "` dans " + ou);
    process.exit(2);
  }
  const corps = src.slice(debut + 1, fin);
  const cles = new Set();
  // Une clé = un identifiant en début de ligne (hors commentaire) suivi de `:`.
  corps.split(/\r?\n/).forEach(function (ligne) {
    const nu = ligne.trim();
    if (!nu || nu.startsWith("//")) return;
    const re = /(^|[,{]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
    let m;
    while ((m = re.exec(nu)) !== null) cles.add(m[2]);
  });
  return cles;
}

const clesMap  = extraireCles(msrc, "const TAGS_BUILTIN = {", MAP);
const clesHome = extraireCles(hsrc, "const TAGS_BUILTIN_HOME = {", HOME);

const echecs = [];
function verif(nom, ok, aide) {
  console.log((ok ? "✅ " : "❌ ") + nom);
  if (!ok) echecs.push(aide);
}

// --- A. rien ne manque côté HOME ----------------------------------------
const manquants = [...clesMap].filter(function (t) { return !clesHome.has(t); });
verif(
  "aucun tag de " + MAP + " absent de la copie du HOME (" + clesMap.size + " tags)",
  manquants.length === 0,
  "Tags présents dans `TAGS_BUILTIN` mais absents de `TAGS_BUILTIN_HOME` : " +
  manquants.join(", ") + ". C'est EXACTEMENT le bug de la v1.81.0 : en Vue OSM, " +
  "un point portant un de ces tags s'affiche en petit rond jaune au lieu de son icône."
);

// --- B. rien d'inventé côté HOME ----------------------------------------
const orphelins = [...clesHome].filter(function (t) { return !clesMap.has(t); });
verif(
  "aucun tag inventé côté HOME",
  orphelins.length === 0,
  "Tags dans `TAGS_BUILTIN_HOME` inconnus de `TAGS_BUILTIN` : " + orphelins.join(", ") +
  ". Le HOME promettrait une icône que le plan ouvert ne sait pas rendre — " +
  "l'incohérence dans l'autre sens, tout aussi trompeuse."
);

// --- C. le HOME lit bien la source, pas sa copie -------------------------
verif(
  "le HOME résout ses icônes via `window._ktaBuiltinIconUrls`",
  /window\._ktaBuiltinIconUrls\s*\|\|\s*TAGS_BUILTIN_HOME/.test(hsrc),
  "`" + HOME + "` doit lire `window._ktaBuiltinIconUrls || TAGS_BUILTIN_HOME`. " +
  "Sans ça, les deux tables peuvent rester identiques pendant que le HOME " +
  "continue d'utiliser sa copie — le garde-fou serait vert et le bug de retour " +
  "au prochain tag ajouté."
);

// --- D. la globale est exposée au TOP-LEVEL ------------------------------
// Une ligne SANS indentation = hors de toute fonction. C'est tout l'enjeu :
// dans `creerIcones()`, la globale n'existait qu'après le chargement d'un plan.
verif(
  "`window._ktaBuiltinIconUrls` est exposé au top-level de " + MAP,
  /^window\._ktaBuiltinIconUrls = TAGS_BUILTIN;$/m.test(msrc),
  "L'affectation doit être au TOP-LEVEL de `" + MAP + "` (colonne 0), pas à " +
  "l'intérieur de `creerIcones()`. Indentée, elle ne s'exécute qu'au chargement " +
  "d'un plan — or le HOME s'affiche AVANT, et c'est lui qui en a besoin."
);

// --- verdict -------------------------------------------------------------
if (!echecs.length) {
  console.log("\n🎉 Catalogue d'icônes cohérent : " + clesMap.size + " tags, une seule source");
  process.exit(0);
}
console.log("\n============================================================");
console.log("🛑 COMMIT REFUSÉ — les catalogues de tags ont divergé");
console.log("============================================================");
echecs.forEach(function (a) { console.log("\n   • " + a); });
console.log("");
process.exit(1);
