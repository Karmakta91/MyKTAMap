#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🗂️ check-osm-pile.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// La PILE DE PLANS du widget OSM de l'accueil (`osmHomePreview.js >
// _stackOrder`) et sa règle de promotion du principal.
//
// 🩸 LE BUG QUI L'A FAIT NAÎTRE (KARMA, 14/09/2026) : « je charge A, retour
// home → A en OSM home ; je charge B, retour home → B chargé, mais A est
// toujours dans la liste et impossible à supprimer ». Deux fautes :
//   1. le re-mount du widget (retour home, v1.90.12) posait le nouveau
//      principal par un simple `unshift`, sans retirer l'ancien — seul
//      `selectPlan` le faisait. `_stackOrder` est une variable de module :
//      elle survit au remontage → A restait en fantôme ;
//   2. le ✕ (`_demonterPlanOsm`) refusait tout id sans groupe extra — un
//      ex-principal n'en a jamais eu → retrait refusé sans toucher la pile.
//
// ON EXÉCUTE, ON NE GREPE PAS (leçon v1.90.15) : la règle et le démontage sont
// extraits du fichier réel et joués sur les scénarios du bug.
//
// Usage : node scripts/check-osm-pile.js [racine]
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const HOME = fs.readFileSync(path.join(ROOT, "js/osmHomePreview.js"), "utf8").replace(/\r\n/g, "\n");

let echecs = 0;
function t(msg, cond) { console.log((cond ? "✅ " : "❌ ") + msg); if (!cond) echecs++; }
function fonction(nom) {
  const i = HOME.indexOf("function " + nom + "(");
  if (i < 0) return "";
  // fin = première ligne "  }" (indentation IIFE) après le début
  const j = HOME.indexOf("\n  }\n", i);
  return j < 0 ? "" : HOME.slice(i, j + 4);
}

// ---------- 1. La règle de promotion, exécutée ----------
{
  const src = fonction("_remplacerPrincipalDansPile");
  t("la règle _remplacerPrincipalDansPile est extractible", src.length > 0);
  if (src) {
    const run = function(pile, prev, next) {
      const sb = { pile: pile.slice(), prev: prev, next: next, resultat: null };
      vm.runInNewContext(src + "\nresultat = _remplacerPrincipalDansPile(pile, prev, next);", sb, { filename: "osmHome.pile.js" });
      return sb.resultat;
    };
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    t("🩸 scénario du bug : pile [A], A quitté puis B → [B] (A ne reste pas)", eq(run(["A"], "A", "B"), ["B"]));
    t("🩸 B prend la PLACE de A quand d'autres plans sont empilés : [X, A, Y] → [X, B, Y]", eq(run(["X", "A", "Y"], "A", "B"), ["X", "B", "Y"]));
    t("🩸 nouveau déjà dans la pile : [B, A], A→B → [B] (l'ancien sort)", eq(run(["B", "A"], "A", "B"), ["B"]));
    t("sans principal précédent : [] → [B]", eq(run([], null, "B"), ["B"]));
    t("même principal : [A, X] → [A, X] (rien ne bouge)", eq(run(["A", "X"], "A", "A"), ["A", "X"]));
    t("next vide : la pile est rendue telle quelle", eq(run(["A"], "A", null), ["A"]));
  }
  const rw = HOME.slice(HOME.indexOf("function _renderWidget("), HOME.indexOf("function _renderWidget(") + 2500);
  t("🩸 _renderWidget (re-mount au retour home) passe par la règle", /_remplacerPrincipalDansPile\(_stackOrder, _prevPrimary, sel\.id\)/.test(rw));
  t("🩸 …et mémorise l'ancien principal AVANT de poser le nouveau", /const _prevPrimary = _selectedPlanId;\n\s*_selectedPlanId = sel\.id;/.test(rw));
  t("🩸 …sans plus d'unshift direct du principal", !/_stackOrder\.unshift\(sel\.id\)/.test(rw));
  const sp = HOME.slice(HOME.indexOf("function selectPlan("), HOME.indexOf("function selectPlan(") + 2500);
  t("🩸 selectPlan (dropdown) passe par la MÊME règle", /_remplacerPrincipalDansPile\(_stackOrder, _prevPrimary, planId\)/.test(sp));
}

// ---------- 2. Le démontage, exécuté : un fantôme se retire ----------
{
  const src = fonction("_demonterPlanOsm");
  t("_demonterPlanOsm est extractible", src.length > 0);
  if (src) {
    const run = function(pile, principal, extra, cible) {
      const sb = {
        _extraLayers: extra, _stackOrder: pile.slice(), _selectedPlanId: principal,
        _mapInstance: null, _retirerHiRes: function() {}, _extraOpacity: {}, resultat: null
      };
      vm.runInNewContext(src + "\nresultat = _demonterPlanOsm(cible);", Object.assign(sb, { cible: cible }), { filename: "osmHome.demonter.js" });
      return { ok: sb.resultat, pile: sb._stackOrder };
    };
    const r1 = run(["B", "A"], "B", {}, "A");
    t("🩸 fantôme (dans la pile, sans groupe) : le ✕ le retire et rend true", r1.ok === true && JSON.stringify(r1.pile) === '["B"]');
    const r2 = run(["B", "A"], "B", {}, "B");
    t("le principal courant ne se retire pas par ce chemin", r2.ok === false && JSON.stringify(r2.pile) === '["B","A"]');
    const r3 = run(["B"], "B", {}, "Z");
    t("un id absent de la pile : rien ne bouge, false", r3.ok === false && JSON.stringify(r3.pile) === '["B"]');
    const fauxGroupe = { tiles: { clearLayers() {} }, data: { clearLayers() {} } };
    const r4 = run(["X", "B"], "B", { X: fauxGroupe }, "X");
    t("un plan ajouté (avec groupe) se démonte comme avant : true, hors de la pile", r4.ok === true && JSON.stringify(r4.pile) === '["B"]');
  }
}

// ---------- 3. À la destruction de la carte, les groupes morts sortent de la pile ----------
{
  const i = HOME.indexOf("try { _mapInstance.remove(); } catch(e) {}");
  const bloc = i >= 0 ? HOME.slice(i, i + 1200) : "";
  t("🩸 _initMiniMap : à la destruction de la carte, _extraLayers est purgé ET ces ids sortent de _stackOrder",
    /Object\.keys\(_extraLayers\)\.forEach\(function\(id\) \{\n\s*delete _extraLayers\[id\];\n\s*const iX = _stackOrder\.indexOf\(id\);\n\s*if \(iX !== -1\) _stackOrder\.splice\(iX, 1\);/.test(bloc));
}

console.log("");
if (echecs) { console.log("💥 pile OSM : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 pile OSM : le plan quitté remplace l'ancien, et un fantôme se retire toujours");
