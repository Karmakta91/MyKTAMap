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
// 🎨 26/09/2026 (audit icônes, étage 1) — IL NE GARDAIT QUE 2 TABLES SUR 8.
// L'audit a mesuré que **six** autres tables connaissent les tags built-in et
// que rien ne les confrontait : l'invariant ne tenait que par discipline. Or
// c'est exactement par là que `portail` s'est perdu en v1.81.0. Ajouté :
//   E1. les 4 tables « tag → valeur » : `createConf > PLANNER_DEFAULT_ICONS`,
//       `editor > EDITOR_TAG_LABELS`, `interfaceLegende > LEGENDE_LABELS`,
//       `legendCustomization > DEFAULT_LABELS.icones` ;
//   E2. les 3 structures de GROUPES (qui décident de l'ordre et des
//       catégories) : `interfaceLegende > GROUPES` et `GROUPES2`,
//       `exporter > GROUPES_ICONES`. Un tag absent d'un groupe **disparaît**
//       de la légende ou de l'export sans erreur ;
//   E3. le PRÉCACHE : chaque icône PNG du catalogue doit être dans
//       `sw.js > ASSETS_TO_CACHE` **et exister sur le disque**. Un oubli = une
//       icône absente hors-ligne, invisible en développement ;
//   E4. les dictionnaires : `editor.tag.<tag>` et `legendui.label.<tag>` dans
//       les TROIS langues — sans quoi l'utilisateur lit la clé brute.
//
// 📌 Ce qui n'est PAS vérifié ici, volontairement :
// `sessionExporter.js > EMOJI_PAR_TAG` (18 clés dont **aucune** n'existe dans
// le catalogue, alors que son commentaire dit « synchroniser avec
// TAGS_BUILTIN »). Le brancher changerait les noms produits par l'export
// anonymisé (`🎯-1` → autre chose) : c'est un format de sortie, donc un
// arbitrage KARMA, pas un bug à corriger en silence. Consigné au BACKLOG.
//
// ⚠️ Contrôle STATIQUE : il compare des listes de CLÉS. Il ne dit pas qu'un
// fichier `icon/<tag>.png` s'affiche — ça, c'est le smoke. Il vérifie en
// revanche qu'il EXISTE (E3).
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

// =====================================================================
// E. LES SIX AUTRES TABLES (26/09/2026)
// =====================================================================
// Toutes ces structures dérivent du même catalogue et aucune n'était gardée.
// On vérifie l'INCLUSION dans les deux sens : un tag oublié = une
// fonctionnalité muette, un tag inventé = une promesse que la carte ne tient
// pas. Les seules clés tolérées en plus sont `default` et `track`, qui ne sont
// pas des tags de POI mais les deux icônes de service.
const HORS_CATALOGUE = ["default", "track"];

function lireFichier(chemin) {
  try { return fs.readFileSync(chemin, "utf8"); }
  catch (e) {
    console.error("❌ [check-icon-catalog] " + chemin + " illisible : " + e.message);
    process.exit(2);
  }
}

// Corps d'un littéral borné par ses délimiteurs (accolades ou crochets).
function corpsLitteral(src, declaration, ou, ouvre, ferme) {
  const i = src.indexOf(declaration);
  if (i < 0) {
    console.error("❌ [check-icon-catalog] `" + declaration + "` introuvable dans " + ou +
                  " — renommée ou supprimée. Mets ce garde-fou à jour AVANT de committer.");
    process.exit(2);
  }
  const debut = src.indexOf(ouvre, i);
  let n = 0, fin = -1;
  for (let k = debut; k < src.length; k++) {
    if (src[k] === ouvre) n++;
    else if (src[k] === ferme) { n--; if (n === 0) { fin = k; break; } }
  }
  if (fin < 0) {
    console.error("❌ [check-icon-catalog] littéral non refemé pour `" + declaration + "` dans " + ou);
    process.exit(2);
  }
  return src.slice(debut + 1, fin);
}

// Clés d'un objet, y compris les clés citées ("pilier-1") — `extraireCles`
// ci-dessus ne lit que les identifiants nus, ce qui suffit à TAGS_BUILTIN.
function clesObjet(src, declaration, ou) {
  const corps = corpsLitteral(src, declaration, ou, "{", "}");
  const out = new Set();
  corps.split(/\r?\n/).forEach(function (ligne) {
    const nu = ligne.trim();
    if (!nu || nu.startsWith("//")) return;
    const re = /(^|[,{]\s*)(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))\s*:/g;
    let m;
    while ((m = re.exec(nu)) !== null) out.add(m[2] || m[3] || m[4]);
  });
  return out;
}

// Tags cités dans les `cles: […]` d'une structure de groupes.
function tagsDeGroupes(src, declaration, ou) {
  const corps = corpsLitteral(src, declaration, ou, "[", "]");
  const out = new Set();
  const re = /cles\s*:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(corps)) !== null) {
    (m[1].match(/"([^"]+)"|'([^']+)'/g) || []).forEach(function (s) {
      out.add(s.replace(/["']/g, ""));
    });
  }
  if (!out.size) {
    console.error("❌ [check-icon-catalog] aucun `cles: […]` dans `" + declaration + "` (" + ou +
                  ") — structure changée, ce contrôle ne prouverait plus rien.");
    process.exit(2);
  }
  return out;
}

function confronter(nom, cles, aideOubli) {
  const oublies = [...clesMap].filter(function (t) { return !cles.has(t); });
  const inventes = [...cles].filter(function (t) {
    return !clesMap.has(t) && HORS_CATALOGUE.indexOf(t) < 0;
  });
  verif(nom + " connaît les " + clesMap.size + " tags du catalogue",
        oublies.length === 0,
        "Tags du catalogue absents de " + nom + " : " + oublies.join(", ") + ". " + aideOubli);
  verif(nom + " n'invente aucun tag",
        inventes.length === 0,
        "Tags inconnus du catalogue dans " + nom + " : " + inventes.join(", ") +
        ". Cette table promet un type que la carte ne sait pas rendre.");
}

const GEN = "js/createConf.js", ED = "js/editor.js", LEG = "js/interfaceLegende.js",
      EXP = "js/exporter.js", LC = "js/legendCustomization.js", SW = "sw.js";
const gsrc = lireFichier(GEN), esrc = lireFichier(ED), lsrc = lireFichier(LEG),
      xsrc = lireFichier(EXP), csrc = lireFichier(LC), swsrc = lireFichier(SW);

// --- E1. les tables « tag → valeur » ------------------------------------
confronter("`PLANNER_DEFAULT_ICONS` (" + GEN + ")",
  clesObjet(gsrc, "const PLANNER_DEFAULT_ICONS = {", GEN),
  "Le Générateur ne proposerait pas ce tag, et un plan généré n'aurait pas son icône.");
confronter("`EDITOR_TAG_LABELS` (" + ED + ")",
  clesObjet(esrc, "const EDITOR_TAG_LABELS = {", ED),
  "L'éditeur de point ne proposerait pas ce type — aucun point ne pourrait le porter.");
confronter("`LEGENDE_LABELS` (" + LEG + ")",
  clesObjet(lsrc, "LEGENDE_LABELS = {", LEG),
  "≡ Légende afficherait la clé brute au lieu du libellé (bug réel de la v1.76.0).");
confronter("`DEFAULT_LABELS.icones` (" + LC + ")",
  clesObjet(csrc.slice(csrc.indexOf("const DEFAULT_LABELS = {")), "icones: {", LC),
  "La légende personnalisable afficherait la clé brute dès que LegendCustomization est chargé — c'est-à-dire toujours.");

// --- E2. les groupes (ordre et catégories de la légende / de l'export) ---
confronter("`GROUPES` (" + LEG + ")",  tagsDeGroupes(lsrc, "const GROUPES = [", LEG),
  "Ce tag n'apparaîtrait dans AUCUN groupe de ≡ Légende : invisible, sans erreur.");
confronter("`GROUPES2` (" + LEG + ")", tagsDeGroupes(lsrc, "const GROUPES2 = [", LEG),
  "Même effet dans la seconde vue de la légende.");
confronter("`GROUPES_ICONES` (" + EXP + ")", tagsDeGroupes(xsrc, "const GROUPES_ICONES = [", EXP),
  "Le tag manquerait à la légende des exports PNG/PDF — un relevé imprimé sans sa clef de lecture.");

// --- E3. le précache du Service Worker + l'existence du fichier ----------
// Un oubli ici ne se voit pas en développement : l'icône se charge depuis le
// réseau. Elle manque **hors-ligne**, c'est-à-dire sous terre.
const corpsCat = corpsLitteral(msrc, "const TAGS_BUILTIN = {", MAP, "{", "}");
const valeurs = {};
(corpsCat.match(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]*)"/g) || []).forEach(function (s) {
  const m = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]*)"/.exec(s);
  if (m) valeurs[m[1]] = m[2];
});
const precache = new Set((swsrc.match(/["']\.?\/?icon\/[^"']+["']/g) || []).map(function (s) {
  return s.replace(/["']/g, "").replace(/^\.?\//, "");
}));
const nonPrecachees = [], nonExistantes = [], nonLisibles = [];
[...clesMap].forEach(function (t) {
  const v = valeurs[t];
  if (v === undefined) { nonLisibles.push(t); return; }          // valeur non extractible
  if (/^(data:|blob:|https?:)/.test(v)) return;                   // rien à précacher
  if (!precache.has(v)) nonPrecachees.push(t + " (" + v + ")");
  if (!fs.existsSync(v)) nonExistantes.push(t + " (" + v + ")");
});
verif("chaque icône de fichier du catalogue est précachée par " + SW,
  nonPrecachees.length === 0,
  "Absentes de `ASSETS_TO_CACHE` : " + nonPrecachees.join(", ") +
  ". Invisible en développement (le réseau répond) et manquante HORS-LIGNE, " +
  "c'est-à-dire sous terre — le seul endroit qui compte.");
verif("chaque icône de fichier du catalogue existe sur le disque",
  nonExistantes.length === 0,
  "Fichiers déclarés mais absents : " + nonExistantes.join(", ") + ".");
if (nonLisibles.length) {
  console.log("   ℹ️ valeur non extractible statiquement (donc hors E3) : " + nonLisibles.join(", "));
}

// --- E4. les trois dictionnaires -----------------------------------------
["fr", "en", "es"].forEach(function (lg) {
  const chemin = "lang/" + lg + ".json";
  let dico;
  try { dico = JSON.parse(lireFichier(chemin)); }
  catch (e) {
    console.error("❌ [check-icon-catalog] " + chemin + " n'est pas du JSON valide : " + e.message);
    process.exit(2);
  }
  const manquantes = [];
  [...clesMap].forEach(function (t) {
    if (!(("editor.tag." + t) in dico))      manquantes.push("editor.tag." + t);
    if (!(("legendui.label." + t) in dico))  manquantes.push("legendui.label." + t);
  });
  verif(chemin + " a les libellés des " + clesMap.size + " tags",
    manquantes.length === 0,
    "Clés absentes de " + chemin + " : " + manquantes.join(", ") +
    ". L'utilisateur lirait la clé brute — exactement le défaut corrigé en v1.76.0.");
});

// --- verdict -------------------------------------------------------------
if (!echecs.length) {
  console.log("\n🎉 Catalogue d'icônes cohérent : " + clesMap.size + " tags, " +
              "9 tables confrontées, précache et 3 dicos compris");
  process.exit(0);
}
console.log("\n============================================================");
console.log("🛑 COMMIT REFUSÉ — les catalogues de tags ont divergé");
console.log("============================================================");
echecs.forEach(function (a) { console.log("\n   • " + a); });
console.log("");
process.exit(1);
