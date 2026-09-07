#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// ⚖️ check-portee-reglages.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LA RÈGLE (audit KARMA du 07/09/2026) :
//
//   « La config du MODE PLAN ne doit concerner QUE le plan. Si une
//     modification faite là affecte toute l'application — donc les autres
//     plans — elle n'a rien à faire là. »
//
// 🩸 CE QUE ÇA COÛTAIT. Dix réglages GLOBAUX vivaient dans la config du mode
// plan. Cocher « magnétisme au dessin » depuis un relevé le cochait pour TOUS,
// sans qu'un mot le dise. Le pire cas avait déjà été payé en v1.59.0 sur les
// toggles Perf ULTRA : « cocher ULTRA une fois sur un gros plan l'appliquait
// silencieusement à TOUS les plans », perçu par l'utilisateur comme une
// « activation automatique » qu'il n'avait pas demandée.
//
// COMMENT ON TRANCHE, sans deviner : une préférence est GLOBALE si elle est
// écrite dans `app_user_prefs` par `sauvegarderPrefsUtilisateur()`. C'est la
// couche de persistance qui fait foi, jamais l'onglet où le réglage s'affiche.
//
// ⚠️ CE CONTRÔLE NE LIT QUE LES ÉCRITURES DIRECTES `APP_CONFIG.x = …` dans
// l'écran de réglages du mode plan. Un réglage qui passerait par un setteur
// indirect lui échapperait — la limite est réelle et assumée, elle couvre le
// cas qui s'est produit.
// =====================================================================
"use strict";

const fs = require("fs");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const CFG = fs.readFileSync("js/config.js", "utf8");
const UIC = fs.readFileSync("js/interfaceConfig.js", "utf8");
const IDX = fs.readFileSync("index.html", "utf8");

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
// Ces trois-là restent accessibles depuis un plan PARCE QU'ON LES AJUSTE SUR LE
// TERRAIN : allumer l'écran ou couper la vibration en cavité ne doit pas
// obliger à remonter au HOME. Arbitrage KARMA (option 1:c de l'audit).
// Une omission doit rester une DÉCISION, jamais un oubli — même principe que
// `HORS_REBUILD_ASSUME` dans check-prefs-survival.js.
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
// 🩸 Sortir un réglage du mode plan sans l'ajouter au HOME le rendrait
// INTROUVABLE — pire que le désordre de départ.
[["loaderScaledMarkers", "taille des icônes au zoom"],
 ["loaderPanneauxAncres", "ancrage des panneaux"],
 ["loaderSnapDraw", "magnétisme au dessin"],
 ["loaderSnapDrawPx", "rayon du magnétisme"]].forEach(function (r) {
  t("🩸 rapatrié et ATTEIGNABLE au HOME : " + r[1], IDX.indexOf('id="' + r[0] + '"') >= 0);
});

// ───────── 5. la nav intelligente est bien PAR PLAN ─────────
// Elle dépend de la qualité du réseau de tracés DU plan : globale, l'activer
// sur un relevé bien tracé l'activait sur un plan qui n'en a aucun.
t("🧭 nav intelligente : elle n'est plus écrite globalement",
  !GLOBAUX.has("smartNav") || !ecrits.has("smartNav"));
t("🧭 nav intelligente : un setteur PAR PLAN existe", /function setPlanSmartNav/.test(CFG));
t("🧭 nav intelligente : l'écran de réglages l'appelle", /setPlanSmartNav\(/.test(UIC));
t("🩸 nav intelligente : la valeur globale sert de REPLI (aucune perte à la migration)",
  /g\.smartNav === true/.test(CFG));

// ───────── 6. les toggles Perf ne sont plus au HOME ─────────
// Ils y étaient affichés et câblés, mais `perfUltra.js > _persist()` sort sans
// écrire quand aucun plan n'est chargé — ce qui est TOUJOURS le cas au HOME.
// L'utilisateur cochait, l'interface répondait, rien n'était gardé.
t("🩸 perf : les toggles ULTRA ne sont plus affichés au HOME",
  IDX.indexOf('id="loader_perf_') < 0);
t("perf : ni câblés", fs.readFileSync("js/homeConfig.js", "utf8").indexOf("loader_perf_") < 0);
// (l assertion « le tuilage reste ici » a ete remplacee par le §8 ci-dessous)
t("perf : la persistance reste bien par plan",
  /STORAGE_PREFIX\s*=\s*"myktamap_perf_toggles_v2_"/.test(fs.readFileSync("js/perfUltra.js", "utf8")));

// 🩸 STRIPPER LIGNE À LIGNE, JAMAIS INLINE — « le mangeur de blocs », 2e round.
// La version précédente faisait `.replace(/\/\*[\s\S]*?\*\//g, " ")`. Or un
// `/*` peut apparaître AILLEURS que dans un commentaire : dans une chaîne
// (`accept="image/*"`), dans un chemin cité (`data/**`), dans une regex. Le
// non-greedy avalait alors tout jusqu'au `*/` suivant — MESURÉ : de 28 % à
// 88 % du fichier détruit selon les cas (main.js : 98 986 → 12 170 octets).
// 🩸 Le danger n'était pas les faux rouges, qui se voient : c'étaient les
// assertions de la forme « X n'est PAS présent », vraies par accident dès que
// la zone avait été mangée. Le même piège est documenté dans README.md pour
// check-i18n (« le mangeur de blocs »), et je l'ai réintroduit ici.
// On ne retire donc QUE des lignes ENTIÈRES de commentaire : un `/*` au milieu
// d'une ligne de code est laissé tel quel, il ne peut plus rien avaler.
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

// ───────── 7. 🌍 LES ÉCRITURES GLOBALES *INDIRECTES* ─────────
// 🩸 LA LIMITE DU §3 A MORDU EN MOINS D'UNE JOURNÉE. Le contrôle ci-dessus ne
// voit que les écritures directes `APP_CONFIG.x = …`. Or le sélecteur de LANGUE
// vivait dans la config du mode plan et persistait via `I18n.setLang()` →
// localStorage `myktamap_app_lang`. Aussi global que le reste, invisible pour
// l'audit. KARMA l'a vu à l'œil nu ; le garde-fou, non.
//
// On liste donc les SETTEURS qui persistent quelque chose de global. Un réglage
// du mode plan qui en appelle un est fautif, quel que soit son onglet. Cette
// liste est le point d'extension : tout nouveau setteur global s'ajoute ici.
const SETTEURS_GLOBAUX = [
  ["I18n.setLang", "la langue de toute l'application"]
];
SETTEURS_GLOBAUX.forEach(function (r) {
  t("🌍 écriture globale indirecte absente du mode plan : " + r[1] + " (" + r[0] + ")",
    UIC_CODE.indexOf(r[0] + "(") < 0);
});
t("🌍 le sélecteur de langue a bien quitté la config du mode plan",
  UIC_CODE.indexOf("cfg_app_lang") < 0);

// 🩸 …et il reste ATTEIGNABLE hors plan, sinon on l'aurait rendu introuvable.
t("🌍 langue atteignable : ⚙️ Configuration de l'accueil",
  IDX.indexOf('id="loaderAppLang"') >= 0);
t("🌍 langue atteignable : écran de déverrouillage",
  fs.readFileSync("js/unlockGate.js", "utf8").indexOf("I18n.setLang(") >= 0);

// ───────── 8. 🖼️ LE TUILAGE N'EST PAS UN RÉGLAGE ─────────
// Il ne se mémorise NULLE PART : `getLoaderPerfPreset()` lit une classe CSS,
// le markup naît sur "auto" à chaque démarrage, et quand il vaut ≠ auto il
// écrase le preset mémorisé du plan qu'on ouvre. Le ranger parmi les réglages
// le faisait passer pour une préférence durable. Sa place est contre le bouton
// qui le déclenche. Il reste le SEUL point de réglage : côté plan le preset est
// affiché en lecture seule.
t("🖼️ le groupe « Performance » a disparu de la config de l'accueil",
  IDX.indexOf('data-i18n="config.group.perf"') < 0);
t("🖼️ le tuilage est DANS la carte de chargement (entre le choix du fichier et le bouton Charger)",
  (function () {
    const zip = IDX.indexOf('id="zipFile"');
    const til = IDX.indexOf('id="loaderPerfSegmented"');
    const btn = IDX.indexOf('id="loadPlanBtn"');
    return zip > 0 && til > zip && btn > til;
  })());
t("🖼️ et il dit qu'il n'est pas mémorisé",
  IDX.indexOf('data-i18n="home.perf.tilingHint"') >= 0 &&
  JSON.parse(fs.readFileSync("lang/fr.json", "utf8"))["home.perf.tilingHint"].indexOf("Non mémorisé") >= 0);
t("🖼️ côté plan, le preset reste en LECTURE SEULE (aucun second point de réglage)",
  UIC.indexOf("affichage read-only") >= 0 && !/id="cfg_perfPreset"/.test(UIC));


console.log(ko === 0 ? "\n🎉 portée des réglages : le plan ne décide plus pour l'app"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
