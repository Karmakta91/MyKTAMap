#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📌 check-outils-dessin-sync.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// La pastille d'un outil de dessin (le bouton surligné `kta-actif` dans la
// sidebar) doit refléter l'ÉTAT RÉEL de l'outil, jamais un état fantôme.
//
// 🩸 LE BUG (KARMA, 10/09/2026) : « je débute un tracé, je fais quelques
// points sans fermer l'icône, je fais Ctrl+Z jusqu'à tout effacer — et là le
// bouton est ACTIF dans l'interface (pastille) mais MORT à l'usage : la
// pastille ne disparaît pas alors que l'outil est inactif ».
//
// 🔎 POURQUOI. Les boutons de suppression (↩️/✂️) fermaient déjà le mode via
// `_fermerModeRoad()` (garde `before && !after` sur getCurrentRoad). Mais le
// RACCOURCI CLAVIER Ctrl+Z passe par `HistoryManager.undo → _applyState`, qui
// remet `window.modeRoad` à null quand on annule jusqu'au tracé vide
// (`resetRoads()` le wipe ; `_savedModeRoad` ne le restaure QUE si
// `currentRoadIndex >= 0`, i.e. un tracé encore en cours). Personne ne
// nettoyait alors le VISUEL du bouton → pastille « allumée mais morte ».
//
// 🩹 LE FIX (v1.90.16) : l'abonnement `HistoryManager.onChange` d'interface.js
// resynchronise après chaque undo/redo — bouton road actif + mode ÉTEINT =
// on ferme. Exact car `_applyState` RESTAURE `modeRoad` tant qu'il reste un
// tracé en cours : `!window.modeRoad` après un undo signifie « tout annulé »,
// jamais « en plein dessin ». Volontairement ROAD-ONLY (zones/structures
// n'ont pas cette restauration de mode : les fermer sur `!modeZone` fermerait
// à tort au milieu d'un dessin).
//
// 🍖 LA LEÇON v1.90.12 (le faux positif `_setLastSelected`) : un garde-fou qui
// GREPE le texte d'un appel valide un code cassé. Ici on EXÉCUTE : le corps du
// callback onChange est EXTRAIT du fichier réel et lancé dans un `vm` avec des
// bouchons. Un mauvais nom de fonction ne ferme alors pas la pastille → §1(a)
// rougit. `node -c` ne verrait pas une telle ReferenceError.
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// argv[2] : chemin alternatif d'interface.js (falsification uniquement ;
// défaut = la source réelle). N'affaiblit rien : le pré-commit l'appelle sans
// argument.
const SRC = fs.readFileSync(process.argv[2] || "js/interface.js", "utf8");

// ───────── extraction par comptage d'accolades (pas de recopie) ─────────
// On prend le CORPS réel du fichier : s'il change, c'est la nouvelle version
// qui est éprouvée. Les commentaires du bloc ne contiennent aucune accolade,
// le comptage naïf suffit ici (un déséquilibre ferait un STOP, pas un faux
// vert).
function corpsApres(src, marqueur) {
  const i = src.indexOf(marqueur);
  if (i < 0) return null;
  let j = i + marqueur.length, prof = 1;
  while (j < src.length && prof > 0) {
    const c = src[j++];
    if (c === "{") prof++;
    else if (c === "}") prof--;
  }
  return src.slice(i + marqueur.length, j - 1); // corps SANS l'accolade fermante
}

const CORPS_ONCHANGE = corpsApres(SRC, "window.HistoryManager.onChange(function(state) {");
t("l'abonnement `HistoryManager.onChange(function(state) {…})` est présent",
  typeof CORPS_ONCHANGE === "string" && CORPS_ONCHANGE.length > 0);

// ───────── 1. 🩸 le callback onChange décide correctement de fermer ─────────
// On exécute le VRAI corps extrait, dans quatre situations. `_fermerModeRoad`
// est un espion qui compte ; `_syncHistoryUiRef` un noop (le corps l'appelle
// en premier). `window === ctx`, donc `window.modeRoad` lit `ctx.modeRoad`.
function jouerOnChange(modesActifs, modeRoad) {
  const journal = { fermetures: 0 };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    _syncHistoryUiRef: function () { /* noop */ },
    _modesActifs: modesActifs,
    _fermerModeRoad: function () { journal.fermetures++; },
    modeRoad: modeRoad
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext("(function(state){" + CORPS_ONCHANGE + "})({});", ctx,
    { filename: "interface.js#onChange" });
  return journal;
}

if (CORPS_ONCHANGE) {
  // (a) Ctrl+Z jusqu'à VIDER : bouton road actif, mode éteint → ON FERME.
  //     Sabotage `!window.modeRoad` supprimé, ou mauvais nom `_fermerModeRoad`
  //     (avalé par le try/catch) → cette assertion rougit.
  t("🩸 (a) undo-jusqu'au-vide (road actif + modeRoad null) → la pastille est fermée",
    jouerOnChange({ road: {} }, null).fermetures === 1);

  // (b) Undo d'UN point, tracé encore en cours : `_applyState` a restauré
  //     `modeRoad` → on NE ferme PAS (continuation légitime).
  //     Sabotage : retirer `!window.modeRoad` ferme ici à tort → rouge.
  t("🩸 (b) undo en plein dessin (road actif + modeRoad défini) → PAS de fermeture",
    jouerOnChange({ road: {} }, "principal").fermetures === 0);

  // (c) Aucun outil road armé : rien à fermer.
  //     Sabotage : retirer la garde `_modesActifs[\"road\"]` ferme ici → rouge.
  t("🩸 (c) aucun tracé armé (modeRoad null) → PAS de fermeture",
    jouerOnChange({}, null).fermetures === 0);

  // (d) Road-only : un autre outil (zone) est armé, road non → on ne touche pas.
  //     Prouve qu'on cible bien `_modesActifs[\"road\"]` et pas « un mode actif ».
  t("🩸 (d) road-only : zone armée mais pas road → PAS de fermeture du road",
    jouerOnChange({ zone: {} }, null).fermetures === 0);
}

// ───────── 2. 🩸 `_fermerModeRoad` éteint réellement la pastille ─────────
// Le callback appelle `_fermerModeRoad` ; encore faut-il que CETTE fonction
// retire `kta-actif` ET purge `_modesActifs[\"road\"]`. On l'extrait et on
// l'exécute pour de vrai (sinon le fix ne « ferme » rien de visible).
const FN_FERMER = "function _fermerModeRoad() {" +
  corpsApres(SRC, "function _fermerModeRoad() {") + "}";
{
  const journal = { desactive: 0 };
  const btn = {
    _cls: ["kta-actif", "kta-sub"],
    classList: {
      remove: function (c) { btn._cls = btn._cls.filter(function (k) { return k !== c; }); },
      contains: function (c) { return btn._cls.indexOf(c) >= 0; }
    }
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    _modesActifs: { road: { btnEl: btn, desactiverFn: function () { journal.desactive++; } } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(FN_FERMER + "\n_fermerModeRoad();", ctx, { filename: "interface.js#_fermerModeRoad" });

  t("🩸 `_fermerModeRoad` retire la classe `kta-actif` (la pastille s'éteint)",
    !btn.classList.contains("kta-actif"));
  t("`_fermerModeRoad` appelle `desactiverFn` (coupe l'outil côté état)",
    journal.desactive === 1);
  t("🩸 `_fermerModeRoad` purge `_modesActifs[\"road\"]` (plus d'entrée fantôme)",
    !ctx._modesActifs["road"]);
}

// ───────── 3. le câblage que l'extraction ne voit pas ─────────
// Sûreté de la resync : `_fermerModeRoad` → `desactiverFn`, et CE
// `desactiverFn` (défini dans `_activerRoute`) ne re-toggle QUE
// `if (window.modeRoad)`. Sans cette garde, fermer un mode dont `modeRoad` est
// déjà null RÉ-ARMERAIT l'outil (toggle sur null) — la resync deviendrait un
// bug. Invariant structurel (le desactiverFn dépend de road.js/_groupes,
// pénible à exécuter isolé) : on le vérifie sur le texte, en le disant.
{
  const iRoad = SRC.indexOf('_modesActifs["road"] = {');
  const bloc = iRoad < 0 ? "" : SRC.slice(iRoad, iRoad + 600);
  t("câblage : le `desactiverFn` du road garde `if (window.modeRoad) toggleRoadMode` " +
    "(sinon `_fermerModeRoad` ré-armerait l'outil quand modeRoad est déjà null)",
    /desactiverFn:\s*function\s*\(\)\s*\{\s*if\s*\(\s*window\.modeRoad\s*\)\s*toggleRoadMode/.test(bloc));

  // La resync est ROAD-ONLY côté source : aucune fermeture de zone/structure
  // branchée sur `!window.modeZone`/`!window.modeStructure` dans le callback
  // (ce serait un faux-close en plein dessin, cf. en-tête).
  t("câblage : le callback onChange ne ferme PAS zone/structure sur un simple `!modeX`",
    !!CORPS_ONCHANGE &&
    CORPS_ONCHANGE.indexOf("_fermerModeZone") < 0 &&
    CORPS_ONCHANGE.indexOf("_fermerModeStructure") < 0);
}

console.log(ko === 0 ? "\n🎉 sync pastille outils de dessin : tout passe"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
