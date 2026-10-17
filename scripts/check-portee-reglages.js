#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-portee-reglages.js — garde-fou pré-commit BLOQUANT de la portée des réglages
// =====================================================================
// Règle (décision produit) : la config du MODE PLAN ne concerne QUE le plan ; un réglage qui
// affecte toute l'app vit au HOME.
// 🩸 Un réglage global écrit depuis un plan s'applique en silence à TOUS les plans (perçu comme une
// « activation automatique »).
// ⚠️ Arbitre : une préférence est GLOBALE si `sauvegarderPrefsUtilisateur()` l'écrit dans
// `app_user_prefs` (la persistance fait foi, pas l'onglet). Le §3 ne lit que les écritures
// DIRECTES `APP_CONFIG.x = …` de js/interfaceConfig.js ; les setteurs indirects connus sont
// listés au §7 (`SETTEURS_GLOBAUX`, point d'extension).
// =====================================================================
"use strict";

const fs = require("fs");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const CFG = fs.readFileSync("js/config.js", "utf8");
const UIC = fs.readFileSync("js/interfaceConfig.js", "utf8");
const IDX = fs.readFileSync("index.html", "utf8");
// Fin du démarrage du HOME (hors d'index.html : CSP stricte).
const BOOT = fs.readFileSync("js/homeDemarrage.js", "utf8");

// ───────── 1. qui est GLOBAL : la persistance fait foi ─────────
const GLOBAUX = new Set();
{
  const i = CFG.indexOf("function sauvegarderPrefsUtilisateur");
  t("le point de persistance globale est trouvable", i >= 0);
  const bloc = CFG.slice(i, CFG.indexOf("localStorage.setItem", i));
  for (const m of bloc.matchAll(/existing\.([A-Za-z0-9_]+)\s*=/g)) GLOBAUX.add(m[1]);
  t("au moins 5 préférences globales déclarées", GLOBAUX.size >= 5);
  console.log("   → globales : " + [...GLOBAUX].join(", "));
}

// ───────── 2. 🩸 TOLÉRANCE EXPLICITE ─────────
// Réglables depuis un plan parce qu'on les ajuste SUR LE TERRAIN, sans remonter au HOME (décision
// produit). Une tolérance reste une DÉCISION écrite ici, jamais un oubli (cf `HORS_REBUILD_ASSUME`
// de check-prefs-survival.js).
const TOLERES = new Set([
  "vibrationEnabled",   // 📳 se coupe en cavité, à plusieurs
  "batterieEnabled"     // 🔋 idem, et c'est là qu'on surveille sa charge
  // (le Wake Lock a son propre stockage, il n'apparaît pas dans app_user_prefs)
]);

// ───────── 3. le contrôle ─────────
const ecrits = new Set();
for (const m of UIC.matchAll(/APP_CONFIG\.([A-Za-z0-9_]+)\s*=/g)) ecrits.add(m[1]);

const fautifs = [...ecrits].filter((k) => GLOBAUX.has(k) && !TOLERES.has(k));
t("🩸 aucun réglage GLOBAL n'est écrit depuis la config du mode plan" +
  (fautifs.length ? " — FAUTIFS : " + fautifs.join(", ") : ""),
  fautifs.length === 0);

[...TOLERES].forEach(function (k) {
  t("toléré (décision KARMA) : « " + k + " » reste réglable en cavité", ecrits.has(k));
});

// ───────── 4. les rapatriés doivent être ATTEIGNABLES ─────────
// 🩸 Sortir un réglage du mode plan sans l'ajouter au HOME le rend INTROUVABLE.
[["loaderScaledMarkers", "taille des icônes au zoom"],
 ["loaderPanneauxAncres", "ancrage des panneaux"],
 ["loaderSnapDraw", "magnétisme au dessin"],
 ["loaderSnapDrawPx", "rayon du magnétisme"],
 ["loaderJournalCb", "carnet des sorties (v1.92.0)"]].forEach(function (r) {
  t("🩸 rapatrié et ATTEIGNABLE au HOME : " + r[1], IDX.indexOf('id="' + r[0] + '"') >= 0);
});

// ───────── 5. la nav intelligente est bien PAR PLAN ─────────
// Elle dépend de la qualité des tracés DU plan : globale, elle s'activerait sur un plan sans tracés.
t("🧭 nav intelligente : elle n'est plus écrite globalement",
  !GLOBAUX.has("smartNav") || !ecrits.has("smartNav"));
t("🧭 nav intelligente : un setteur PAR PLAN existe", /function setPlanSmartNav/.test(CFG));
t("🧭 nav intelligente : l'écran de réglages l'appelle", /setPlanSmartNav\(/.test(UIC));
t("🩸 nav intelligente : la valeur globale sert de REPLI (aucune perte à la migration)",
  /g\.smartNav === true/.test(CFG));

// ───────── 6. les toggles Perf ne sont plus au HOME ─────────
// 🩸 `perfUltra.js > _persist()` sort sans écrire quand aucun plan n'est chargé (toujours le cas au
// HOME) : une case cochée là ne serait jamais gardée.
t("🩸 perf : les toggles ULTRA ne sont plus affichés au HOME",
  IDX.indexOf('id="loader_perf_') < 0);
t("perf : ni câblés", fs.readFileSync("js/homeConfig.js", "utf8").indexOf("loader_perf_") < 0);
t("perf : la persistance reste bien par plan",
  /STORAGE_PREFIX\s*=\s*"myktamap_perf_toggles_v2_"/.test(fs.readFileSync("js/perfUltra.js", "utf8")));

// 🩸 « Le mangeur de blocs » : retirer les commentaires LIGNE À LIGNE, jamais par regex
// `/\/\*[\s\S]*?\*\//`. Un `/*` hors commentaire (chaîne `image/*`, chemin `data/**`, regex) ferait
// avaler tout jusqu'au `*/` suivant, et les assertions « X n'est PAS présent » deviendraient
// vraies par accident. Seules les lignes ENTIÈRES de commentaire partent.
function sansCommentaires(src) {
  const nl = src.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
  const out = [];
  let dansBloc = false, dansHtml = false;
  src.split(/\r?\n/).forEach(function (l) {
    const t = l.trim();
    if (dansBloc) { if (t.indexOf("*/") >= 0) dansBloc = false; out.push(""); return; }
    if (dansHtml) { if (t.indexOf("-->") >= 0) dansHtml = false; out.push(""); return; }
    if (t.indexOf("//") === 0) { out.push(""); return; }
    if (t.indexOf("/*") === 0) { if (t.indexOf("*/") < 0) dansBloc = true; out.push(""); return; }
    if (t.indexOf("<!--") === 0) { if (t.indexOf("-->") < 0) dansHtml = true; out.push(""); return; }
    out.push(l);
  });
  return out.join(nl);
}
const UIC_CODE = sansCommentaires(UIC);

// ───────── 7. LES ÉCRITURES GLOBALES *INDIRECTES* ─────────
// 🩸 Le §3 ne voit pas un setteur qui persiste du global (`I18n.setLang()` → `myktamap_app_lang`).
// ⚠️ Point d'extension : tout nouveau setteur global s'ajoute à cette liste.
const SETTEURS_GLOBAUX = [
  ["I18n.setLang", "la langue de toute l'application"]
];
SETTEURS_GLOBAUX.forEach(function (r) {
  t("🌍 écriture globale indirecte absente du mode plan : " + r[1] + " (" + r[0] + ")",
    UIC_CODE.indexOf(r[0] + "(") < 0);
});
t("🌍 le sélecteur de langue a bien quitté la config du mode plan",
  UIC_CODE.indexOf("cfg_app_lang") < 0);

// 🩸 …et il reste ATTEIGNABLE hors plan.
t("🌍 langue atteignable : ⚙️ Configuration de l'accueil",
  IDX.indexOf('id="loaderAppLang"') >= 0);
t("🌍 langue atteignable : écran de déverrouillage",
  fs.readFileSync("js/unlockGate.js", "utf8").indexOf("I18n.setLang(") >= 0);

// ───────── 8. LE TUILAGE N'EST PAS RÉGLABLE AU HOME ─────────
// Auto par défaut (décision produit). Sur un plan V2 la branche tuiles passe AVANT le preset :
// le réglage n'agit que sur un gros plan V1. Il vit donc dans la fiche Infos, seulement pour un plan
// non V2, et y est mémorisé.
t("🖼️ le groupe « Performance » a disparu de la config de l'accueil",
  IDX.indexOf('data-i18n="config.group.perf"') < 0);

// 🩸 Ni le contrôle, ni son câblage : un câblage resté seul lit un DOM absent (réglage fantôme).
[["loaderPerfSegmented", "le sélecteur"],
 ["loaderPerfDetails",   "son bloc dépliant"],
 ["loaderPerfDesc",      "sa description"],
 ["loaderPerfResume",    "son résumé"],
 ["loaderPerfDebug",     "sa ligne debug"]].forEach(function (r) {
  t("🖼️ absent du HOME : " + r[1] + " (#" + r[0] + ")", IDX.indexOf('id="' + r[0] + '"') < 0);
});
t("🖼️ …et son câblage aussi (pas de lecteur d'un DOM disparu)",
  IDX.indexOf("updatePerfDebugLine") < 0 && IDX.indexOf(".kta-perf-btn") < 0);

// 🩸 Les deux fonctions restent exposées (main.js et homeLoader.js les appellent) et renvoient
// « auto », ce qui fait retomber les lecteurs sur le preset MÉMORISÉ du plan.
t("🖼️ getLoaderPerfPreset survit et vaut toujours « auto »",
  /function getLoaderPerfPreset\(\) \{ return "auto"; \}/.test(BOOT) &&
  /window\.getLoaderPerfPreset = getLoaderPerfPreset;/.test(BOOT));
t("🖼️ setLoaderPerfPreset survit en no-op (main.js l'appelle au changement de langue)",
  /function setLoaderPerfPreset\(\)/.test(BOOT) &&
  /window\.setLoaderPerfPreset = setLoaderPerfPreset;/.test(BOOT));

// 🩸 …et le réglage existe bien ailleurs : seul moyen de couper le tuilage d'un très gros plan V1.
{
  const HL = fs.readFileSync("js/homeLoader.js", "utf8");
  t("🖼️ le réglage vit dans ℹ️ Infos", HL.indexOf('id="kta-plan-tiling-select"') >= 0);
  t("🩸 …et SEULEMENT pour un plan non tuilé V2 (sinon : un interrupteur débranché)",
    /if \(plan\.tiledV2 !== true\) \{/.test(HL));
  t("🖼️ il est MÉMORISÉ pour ce plan (ce que le HOME ne savait pas faire)",
    /PlanRegistry\.setPerfPreset\(plan\.id, selTuilage\.value\)/.test(HL));
  t("🩸 son câblage tolère l'absence du sélecteur (sinon tout le reste de la modale meurt)",
    /const selTuilage = document\.getElementById\("kta-plan-tiling-select"\);/.test(HL) &&
    /if \(selTuilage\) \{/.test(HL));
}

// ───────── 8 bis. 🩸 LA DOC NE DÉCRIT PAS UN CONTRÔLE DISPARU ─────────
// Une doc fausse envoie chercher un contrôle qui n'existe pas : l'app passe pour cassée.
// ⚠️ Limite assumée : seules ces tournures connues sont refusées, une nouvelle phrase fausse
// échappe. (« Chaque doc nomme le nouvel emplacement » serait vrai par accident : ces mots
// apparaissent ailleurs dans les mêmes fichiers.)
[["docs/applications/README_USER.md",
  "un bandeau **🖼️ Tuilage pour ce chargement : Auto** montre le mode actif",
  "doc utilisateur FR"],
 ["docs/applications/README_USER.en.md",
  "a strip reading **🖼️ Tiling for this load: Auto** shows the active mode",
  "doc utilisateur EN"],
 ["docs/TILING.md",
  "Le sélecteur vit dans la **carte de chargement**",
  "référence tuilage"],
 ["docs/applications/AI_CONTEXT.md",
  "Le sélecteur de tuilage est REPLIÉ par défaut",
  "contexte IA"]].forEach(function (r) {
  t("📄 " + r[2] + " : ne décrit plus le bandeau de l'écran de chargement",
    fs.readFileSync(r[0], "utf8").indexOf(r[1]) < 0);
});

// 🩸 Sur le CODE (UIC_CODE), jamais sur un commentaire (il satisferait l'assertion à lui seul).
// Lecture seule = le preset est AFFICHÉ et rien ne l'écrit (ni champ, ni affectation, ni setteur).
t("🖼️ côté plan (⚙️ Réglages), le preset reste en LECTURE SEULE (aucun troisième point)",
  /\$\{presetMeta\.label\}/.test(UIC_CODE) && /_PRESET_LABELS\[c\.perfPreset\]/.test(UIC_CODE) &&
  !/id="cfg_perfPreset"/.test(UIC_CODE) && !/\.perfPreset\s*=[^=]/.test(UIC_CODE) &&
  !/setPerfPreset\s*\(/.test(UIC_CODE));

console.log(ko === 0 ? "\n🎉 portée des réglages : le plan ne décide plus pour l'app"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
