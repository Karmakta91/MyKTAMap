#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-outils-dessin-sync.js — BLOQUANT (pré-commit) : la pastille `kta-actif` d'un outil de dessin
// (tracé, zone, structure) reflète l'état RÉEL de l'outil, y compris après Ctrl+Z.
// 🩸 Ctrl+Z passe par `HistoryManager.undo → _applyState`, dont les reset* remettent `window.modeX` à null :
//    sans resync, le bouton reste allumé mais mort.
// Contrat :
//   1. `_applyState` RESTAURE le mode tant qu'une forme est en cours (index >= 0 dans le snapshot) :
//      `!window.modeX` après un undo veut dire « tout annulé », jamais « en plein dessin ».
//   2. `interface.js > HistoryManager.onChange` : bouton actif + mode éteint → `_fermerModeX()`.
// On EXÉCUTE dans un `vm` les corps extraits (onChange, `_applyState`, `_captureState`) : un grep du
// texte d'un appel valide un code cassé.
// Usage falsification : argv[2]/[3] = chemins alternatifs interface.js / historyManager.js.
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const SRC  = fs.readFileSync(process.argv[2] || "js/interface.js", "utf8");
const HSRC = fs.readFileSync(process.argv[3] || "js/historyManager.js", "utf8");

// ── Extraction par comptage d'accolades (pas de recopie) ──────
// ⚠️ Comptage naïf : une accolade déséquilibrée dans un commentaire des sources fait un STOP, pas un faux vert.
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

// ── 1. onChange ferme le BON outil quand son mode est éteint ──────
// `_fermerModeX` = espions ; `window === ctx`, donc `window.modeX` lit `ctx.modeX`.
function jouerOnChange(modesActifs, modes) {
  const j = { road: 0, zone: 0, structure: 0 };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    _syncHistoryUiRef: function () { /* noop */ },
    _modesActifs: modesActifs,
    _fermerModeRoad:      function () { j.road++; },
    _fermerModeZone:      function () { j.zone++; },
    _fermerModeStructure: function () { j.structure++; },
    modeRoad:      modes.road      || null,
    modeZone:      modes.zone      || null,
    modeStructure: modes.structure || null
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext("(function(state){" + CORPS_ONCHANGE + "})({});", ctx,
    { filename: "interface.js#onChange" });
  return j;
}

if (CORPS_ONCHANGE) {
  [["road", "modeRoad", "Road"], ["zone", "modeZone", "Zone"], ["structure", "modeStructure", "Structure"]]
    .forEach(function (row) {
      const cle = row[0], typ = row[2].toLowerCase() === "road" ? "principal" : (cle === "zone" ? "eau" : "mur");
      const actif = {}; actif[cle] = {};

      // (a) undo-jusqu'au-vide : bouton actif + mode null → ON FERME cet outil.
      const a = jouerOnChange(actif, {});
      t("🩸 (" + cle + ") undo-au-vide (actif + mode null) → la pastille est fermée", a[cle] === 1);

      // (b) undo en plein dessin : mode restauré → PAS de fermeture.
      const bModes = {}; bModes[cle] = typ;
      const b = jouerOnChange(actif, bModes);
      t("🩸 (" + cle + ") undo en plein dessin (mode défini) → PAS de fermeture", b[cle] === 0);
    });

  // (c) aucun outil armé → rien à fermer.
  const c = jouerOnChange({}, {});
  t("🩸 (c) aucun outil armé → aucune fermeture", c.road === 0 && c.zone === 0 && c.structure === 0);

  // (d) isolation : seule la zone est armée → SEULE la zone se ferme.
  const d = jouerOnChange({ zone: {} }, {});
  t("🩸 (d) isolation : zone armée seule → zone fermée, road/structure intacts",
    d.zone === 1 && d.road === 0 && d.structure === 0);
}

// ── 2. Chaque `_fermerModeX` éteint réellement la pastille ──────
[["_fermerModeRoad", "road"], ["_fermerModeZone", "zone"], ["_fermerModeStructure", "structure"]]
  .forEach(function (row) {
    const fnNom = row[0], cle = row[1];
    const corps = corpsApres(SRC, "function " + fnNom + "() {");
    if (corps == null) { t("extraction de `" + fnNom + "`", false); return; }
    const journal = { desactive: 0 };
    const btn = {
      _cls: ["kta-actif", "kta-sub"],
      classList: {
        remove: function (k) { btn._cls = btn._cls.filter(function (x) { return x !== k; }); },
        contains: function (k) { return btn._cls.indexOf(k) >= 0; }
      }
    };
    const ctx = { console: { log() {}, warn() {}, error() {} }, _modesActifs: {} };
    ctx._modesActifs[cle] = { btnEl: btn, desactiverFn: function () { journal.desactive++; } };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext("function " + fnNom + "() {" + corps + "}\n" + fnNom + "();", ctx,
      { filename: "interface.js#" + fnNom });

    t("🩸 `" + fnNom + "` retire `kta-actif` (la pastille s'éteint)", !btn.classList.contains("kta-actif"));
    t("`" + fnNom + "` appelle `desactiverFn` (coupe l'outil)", journal.desactive === 1);
    t("🩸 `" + fnNom + "` purge `_modesActifs[\"" + cle + "\"]`", !ctx._modesActifs[cle]);
  });

// ── 3. `_applyState` restaure le mode en plein dessin, le laisse null au vide (3 outils) ──────
// 🩸 Sans restauration, la resync du §1 fermerait à tort en plein dessin. Les reset* bouchonnés wipent
// le mode, comme les vrais.
const CORPS_APPLY = corpsApres(HSRC, "function _applyState(s) {");
t("extraction de `_applyState`", typeof CORPS_APPLY === "string" && CORPS_APPLY.length > 0);

function jouerApplyState(s, modesAvant) {
  const store = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    JSON: JSON, Array: Array,
    modeRoad:      modesAvant.road      || null,
    modeZone:      modesAvant.zone      || null,
    modeStructure: modesAvant.structure || null,
    // reset* fidèles : mode remis à null (cf road/zones/structures.js)
    resetRoads:      function () { ctx.modeRoad = null; },
    resetZones:      function () { ctx.modeZone = null; },
    resetStructures: function () { ctx.modeStructure = null; },
    setRoads:      function (a) { store.roads = a; },
    setZones:      function (a) { store.zones = a; },
    setStructures: function (a) { store.structures = a; },
    setCurrentRoadByIndex:      function () {},
    setCurrentZoneByIndex:      function () {},
    setCurrentStructureByIndex: function () {},
    setEditorPoints: function () {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext("function _applyState(s){" + CORPS_APPLY + "}\n_applyState(" + JSON.stringify(s) + ");",
    ctx, { filename: "historyManager.js#_applyState" });
  return ctx;
}

if (CORPS_APPLY) {
  // ── Zone ──
  let r = jouerApplyState({ zones: [{ points: [{}, {}] }], currentZoneIndex: 0 }, { zone: "eau" });
  t("🩸 _applyState ZONE en plein dessin (index 0) → `modeZone` RESTAURÉ (continuation)", r.modeZone === "eau");
  r = jouerApplyState({ zones: [], currentZoneIndex: -1 }, { zone: "eau" });
  t("🩸 _applyState ZONE au vide (index -1) → `modeZone` laissé null (la resync pourra fermer)", r.modeZone === null);

  // ── Structure ──
  r = jouerApplyState({ structures: [{ points: [{}, {}] }], currentStructureIndex: 0 }, { structure: "mur" });
  t("🩸 _applyState STRUCTURE en plein dessin (index 0) → `modeStructure` RESTAURÉ", r.modeStructure === "mur");
  r = jouerApplyState({ structures: [], currentStructureIndex: -1 }, { structure: "mur" });
  t("🩸 _applyState STRUCTURE au vide (index -1) → `modeStructure` laissé null", r.modeStructure === null);

  // ── Tracé ──
  r = jouerApplyState({ roads: [{ points: [{}, {}] }], currentRoadIndex: 0 }, { road: "principal" });
  t("_applyState ROAD en plein dessin (index 0) → `modeRoad` restauré (non-régression)", r.modeRoad === "principal");
  r = jouerApplyState({ roads: [], currentRoadIndex: -1 }, { road: "principal" });
  t("_applyState ROAD au vide (index -1) → `modeRoad` laissé null (non-régression)", r.modeRoad === null);

  // ── Isolation : un undo "zones" ne touche ni road ni structure ──
  r = jouerApplyState({ zones: [{ points: [{}] }], currentZoneIndex: 0 }, { road: "principal", zone: "eau", structure: "mur" });
  t("🩸 _applyState : un undo ZONES ne touche pas `modeRoad` (isolation catégorie)", r.modeRoad === "principal");
  t("🩸 _applyState : un undo ZONES ne touche pas `modeStructure` (isolation catégorie)", r.modeStructure === "mur");
}

// ── 4. Le snapshot capture les TROIS index ──────
const CORPS_CAPTURE = corpsApres(HSRC, "function _captureState(category) {");
t("extraction de `_captureState`", typeof CORPS_CAPTURE === "string" && CORPS_CAPTURE.length > 0);

if (CORPS_CAPTURE) {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    _deepCloneArray: function (a) { return JSON.parse(JSON.stringify(a || [])); },
    getCurrentRoadIndex:      function () { return 5; },
    getCurrentZoneIndex:      function () { return 7; },
    getCurrentStructureIndex: function () { return 9; },
    getZones: function () { return [{ a: 1 }]; }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const snap = vm.runInContext("(function(category){" + CORPS_CAPTURE + "})(\"zones\");",
    ctx, { filename: "historyManager.js#_captureState" });
  t("🩸 snapshot capture `currentRoadIndex`",      snap.currentRoadIndex === 5);
  t("🩸 snapshot capture `currentZoneIndex`",      snap.currentZoneIndex === 7);
  t("🩸 snapshot capture `currentStructureIndex`", snap.currentStructureIndex === 9);
  t("capture ciblée : catégorie \"zones\" clone bien `zones`", Array.isArray(snap.zones) && snap.zones[0].a === 1);
}

// ── 5. Câblage que l'extraction ne voit pas (vérifié sur le texte) ──────
// 🩸 `desactiverFn` ne re-toggle que `if (window.modeX)` : sans cette garde, fermer un mode déjà null
// RÉ-ARME l'outil et la resync devient un bug.
{
  const cas = [
    ['_modesActifs["road"] = {',      /desactiverFn:\s*function\s*\(\)\s*\{\s*if\s*\(\s*window\.modeRoad\s*\)\s*toggleRoadMode/,           "road"],
    ['_modesActifs["zone"] = {',      /desactiverFn:\s*function\s*\(\)\s*\{\s*if\s*\(\s*window\.modeZone\s*\)\s*toggleZoneMode/,            "zone"],
    ['_modesActifs["structure"] = {', /desactiverFn:\s*function\s*\(\)\s*\{\s*if\s*\(\s*window\.modeStructure\s*&&/,                        "structure"]
  ];
  cas.forEach(function (row) {
    const i = SRC.indexOf(row[0]);
    const bloc = i < 0 ? "" : SRC.slice(i, i + 700);
    t("câblage : le `desactiverFn` de " + row[2] + " garde `if (window.mode" +
      row[2][0].toUpperCase() + row[2].slice(1) + ")` (sinon `_fermerMode" +
      row[2][0].toUpperCase() + row[2].slice(1) + "` ré-armerait l'outil)", row[1].test(bloc));
  });


  t("câblage : le callback onChange ferme les trois outils (road + zone + structure)",
    !!CORPS_ONCHANGE &&
    CORPS_ONCHANGE.indexOf("_fermerModeRoad") >= 0 &&
    CORPS_ONCHANGE.indexOf("_fermerModeZone") >= 0 &&
    CORPS_ONCHANGE.indexOf("_fermerModeStructure") >= 0);
}

console.log(ko === 0 ? "\n🎉 sync pastille outils de dessin (tracé + zone + structure) : tout passe"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
