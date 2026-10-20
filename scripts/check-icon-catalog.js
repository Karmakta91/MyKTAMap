#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-icon-catalog.js — BLOQUANT (pré-commit) : confronte au catalogue `js/map.js > TAGS_BUILTIN` les
// 9 autres tables qui connaissent les tags built-in, dans les deux sens (oubli = fonction muette, tag
// inventé = promesse que la carte ne tient pas).
//   A/B. `osmHomePreview.js > TAGS_BUILTIN_HOME` (filet si map.js absent) : ni manquant ni inventé.
//        Sans icône, un point en Vue OSM tombe sur un petit rond jaune.
//   C. le HOME lit `window._ktaBuiltinIconUrls` en priorité : il dessine des plans NON chargés, donc ne
//      peut pas passer par `window._iconMap` (résolveur du plan courant).
//   D. 🩸 `map.js` expose la globale au TOP-LEVEL : dans `creerIcones()`, elle n'existe qu'après le
//      chargement d'un plan, trop tard pour le HOME.
//   E1. tables tag → valeur : PLANNER_DEFAULT_ICONS, EDITOR_TAG_LABELS, LEGENDE_LABELS, DEFAULT_LABELS.icones.
//   E2. GROUPES, GROUPES2, GROUPES_ICONES : un tag hors groupe disparaît de la légende/l'export sans erreur.
//   E3. précache `sw.js > ASSETS_TO_CACHE` + fichier présent : un oubli ne manque que HORS-LIGNE.
//   E4. `editor.tag.<tag>` et `legendui.label.<tag>` dans les 3 dicos.
// Volontairement hors contrôle : `sessionExporter.js > EMOJI_PAR_TAG` (format de sortie de l'export
// anonymisé, à arbitrer ; docs/IDEES.md).
// ⚠️ Contrôle statique de CLÉS : l'affichage réel d'une icône relève du smoke.
// Ajouter un tag : skill `add-icon-tag`.
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

// ── Clés d'un littéral d'objet, borné par comptage d'accolades (pas d'identifiants voisins) ──
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

// ── A. Rien ne manque côté HOME ──────
const manquants = [...clesMap].filter(function (t) { return !clesHome.has(t); });
verif(
  "aucun tag de " + MAP + " absent de la copie du HOME (" + clesMap.size + " tags)",
  manquants.length === 0,
  "Tags présents dans `TAGS_BUILTIN` mais absents de `TAGS_BUILTIN_HOME` : " +
  manquants.join(", ") + ". C'est EXACTEMENT le bug de la v1.81.0 : en Vue OSM, " +
  "un point portant un de ces tags s'affiche en petit rond jaune au lieu de son icône."
);

// ── B. Rien d'inventé côté HOME ──────
const orphelins = [...clesHome].filter(function (t) { return !clesMap.has(t); });
verif(
  "aucun tag inventé côté HOME",
  orphelins.length === 0,
  "Tags dans `TAGS_BUILTIN_HOME` inconnus de `TAGS_BUILTIN` : " + orphelins.join(", ") +
  ". Le HOME promettrait une icône que le plan ouvert ne sait pas rendre — " +
  "l'incohérence dans l'autre sens, tout aussi trompeuse."
);

// ── C. Le HOME lit la source, pas sa copie ──────
verif(
  "le HOME résout ses icônes via `window._ktaBuiltinIconUrls`",
  /window\._ktaBuiltinIconUrls\s*\|\|\s*TAGS_BUILTIN_HOME/.test(hsrc),
  "`" + HOME + "` doit lire `window._ktaBuiltinIconUrls || TAGS_BUILTIN_HOME`. " +
  "Sans ça, les deux tables peuvent rester identiques pendant que le HOME " +
  "continue d'utiliser sa copie — le garde-fou serait vert et le bug de retour " +
  "au prochain tag ajouté."
);

// ── D. Globale exposée au top-level (ligne SANS indentation = hors de toute fonction) ──
verif(
  "`window._ktaBuiltinIconUrls` est exposé au top-level de " + MAP,
  /^window\._ktaBuiltinIconUrls = TAGS_BUILTIN;$/m.test(msrc),
  "L'affectation doit être au TOP-LEVEL de `" + MAP + "` (colonne 0), pas à " +
  "l'intérieur de `creerIcones()`. Indentée, elle ne s'exécute qu'au chargement " +
  "d'un plan — or le HOME s'affiche AVANT, et c'est lui qui en a besoin."
);

// ── E. Les autres tables ──────
// Seules clés tolérées hors catalogue : `default` et `track` (icônes de service, pas des tags de POI).
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

// Clés d'un objet, y compris citées ("pilier-1") ; `extraireCles` ne lit que les identifiants nus.
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

// ── E1. Tables « tag → valeur » ──────
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

// ── E2. Groupes (ordre et catégories de la légende / de l'export) ──────
confronter("`GROUPES` (" + LEG + ")",  tagsDeGroupes(lsrc, "const GROUPES = [", LEG),
  "Ce tag n'apparaîtrait dans AUCUN groupe de ≡ Légende : invisible, sans erreur.");
confronter("`GROUPES2` (" + LEG + ")", tagsDeGroupes(lsrc, "const GROUPES2 = [", LEG),
  "Même effet dans la seconde vue de la légende.");
confronter("`GROUPES_ICONES` (" + EXP + ")", tagsDeGroupes(xsrc, "const GROUPES_ICONES = [", EXP),
  "Le tag manquerait à la légende des exports PNG/PDF — un relevé imprimé sans sa clef de lecture.");

// ── E3. Précache du Service Worker + existence du fichier ──────
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

// ── E4. Les trois dictionnaires ──────
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

// ── Verdict ──────
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
