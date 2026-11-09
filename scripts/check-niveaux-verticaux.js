#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-niveaux-verticaux.js — garde-fou pré-commit BLOQUANT : géométrie verticale des niveaux
// =====================================================================
// Contrat de config.js > getNiveauVertical (sol, hauteur, plafond, écart d'un niveau), seul accès que la vue 3D,
// ⛏️ Volume exploité et les niveaux voisins en 3D ont le droit de lire.
// 🩸 Ce qui régresse sans bruit :
//   1. un plan SANS la donnée change de comportement (hauteur ≠ 2 m, sol inventé, écart sorti de nulle part) ;
//   2. l'écart est stocké en plus des sols : deux vérités, l'itinéraire et la 3D se contredisent ;
//   3. la pref locale ne gagne plus sur le plan-config (correction de ⚙️ perdue) ;
//   4. l'ancienne pref unique `hauteurGalerieM` est oubliée (hauteur réglée avant la table perdue) ;
//   5. saisir un écart ne déplace pas les niveaux du dessous (leur écart change en silence) ;
//   6. un consommateur relit `getPlanHauteurGalerie` (supprimée) ou les tables à la main.
// `js/config.js` est EXÉCUTÉ dans un bac à sable (localStorage en mémoire), PLAN_CONFIG fictif.
// Usage : node scripts/check-niveaux-verticaux.js [racine] · Doc : docs/architecture/multilevel-pathfinding.md
"use strict";
const fs   = require("fs");
const path = require("path");
const vm   = require("vm");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function t(msg, cond, detail) {
  console.log((cond ? "✅ " : "❌ ") + msg + (cond || detail === undefined ? "" : " " + JSON.stringify(detail)));
  if (!cond) echecs++;
}

function bac(prefsPlan, planConfig) {
  const mem = {};
  if (prefsPlan) mem["myktamap_plan_prefs_p1"] = JSON.stringify(prefsPlan);
  const localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
  const win = { addEventListener: function () {}, localStorage: localStorage, I18n: { t: function (k) { return k; } } };
  const sb = {
    window: win, localStorage: localStorage,
    console: { log: function () {}, warn: function () {}, error: function () {} },
    navigator: { userAgent: "node" }, document: { getElementById: function () { return null; },
      querySelector: function () { return null; }, querySelectorAll: function () { return []; },
      addEventListener: function () {} },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    URL: { createObjectURL: function () { return ""; } },
    fetch: function () { return Promise.reject(new Error("pas de réseau")); },
    Blob: function () {}, File: function () {},
    Image: function () {}
  };
  sb.self = sb.window; sb.globalThis = sb;
  vm.runInNewContext(lire("js/config.js"), sb, { filename: "config.js" });
  win._currentLoadedPlanId = "p1";
  win.PLAN_CONFIG = { plan: planConfig || {} };
  win.APP_CONFIG = { availableLevels: [1, 0, -1] };
  return { w: win, prefs: function () { return JSON.parse(mem["myktamap_plan_prefs_p1"] || "{}"); } };
}

// ── 1. Sans donnée : exactement comme avant ──
{
  const { w } = bac();
  const n0 = w.getNiveauVertical(0), nu = w.getNiveauVertical(null);
  t("sans donnée : hauteur 2 m (défaut), source « defaut »", n0.hauteurM === 2 && n0.sourceHauteur === "defaut", n0);
  t("sans donnée : ni sol, ni plafond, ni écart inventés",
    n0.solM === null && n0.plafondM === null && n0.ecartM === null);
  t("plan à un niveau : niveau null rangé sous 0", nu.niveau === 0 && nu.hauteurM === 2);
  t("sans donnée : getProfondeurNiveau reste null (itinéraire inchangé)", w.getProfondeurNiveau(0) === null);
  t("liste : niveaux du plan ouvert, du haut vers le bas",
    w.getPlanNiveauxVerticaux().map(function (n) { return n.niveau; }).join() === "1,0,-1");
}

// ── 2. Profondeurs seules (plan d'avant les hauteurs) ──
{
  const { w } = bac(null, { niveauxProfondeur: { "1": -20, "0": -25, "-1": -30, "2": null } });
  const n0 = w.getNiveauVertical(0), n1 = w.getNiveauVertical(1), m1 = w.getNiveauVertical(-1);
  t("profondeurs seules : sol = profondeur du plan-config", n0.solM === -25 && w.getProfondeurNiveau(0) === -25);
  t("profondeurs seules : plafond = sol + 2 m", n0.plafondM === -23);
  t("profondeurs seules : écart = sol du dessus − plafond (3 m)", n0.ecartM === 3 && m1.ecartM === 3, [n0, m1]);
  t("niveau du dessus « sans profondeur » : écart null", n1.ecartM === null, n1);
  t("niveau sans voisin au-dessus : écart null", w.getNiveauVertical(3).ecartM === null);
}

// ── 3. Écart négatif (niveaux entremêlés) et hauteur par niveau ──
{
  const { w } = bac(null, { niveauxProfondeur: { "0": -25, "-1": -27 }, niveauxHauteur: { "0": 3, "-1": 3.5 } });
  const m1 = w.getNiveauVertical(-1), n0 = w.getNiveauVertical(0);
  t("hauteur par niveau lue dans le plan-config (source « plan »)",
    m1.hauteurM === 3.5 && n0.hauteurM === 3 && m1.sourceHauteur === "plan", [m1, n0]);
  t("écart négatif : plafond du −1 (−23,5) 1,5 m au-dessus du sol du 0",
    m1.plafondM === -23.5 && m1.ecartM === -1.5, m1);
  t("hauteur invalide du plan-config (0, texte) ignorée",
    bac(null, { niveauxHauteur: { "0": 0, "1": "x" } }).w.getNiveauVertical(0).hauteurM === 2);
}

// ── 4. Pref locale qui gagne ; ancienne pref unique ──
{
  const plan = { niveauxProfondeur: { "0": -25, "-1": -30 }, niveauxHauteur: { "0": 3, "-1": 3 } };
  let b = bac({ niveauxHauteur: { "0": 2.4 } }, plan);
  t("pref du niveau gagne sur le plan-config", b.w.getNiveauVertical(0).hauteurM === 2.4 &&
    b.w.getNiveauVertical(0).sourceHauteur === "pref" && b.w.getNiveauVertical(-1).hauteurM === 3);
  b = bac({ hauteurGalerieM: 4 }, plan);
  t("ancienne pref unique hauteurGalerieM relue pour chaque niveau",
    b.w.getNiveauVertical(0).hauteurM === 4 && b.w.getNiveauVertical(-1).hauteurM === 4);
  b = bac({ niveauxProfondeur: { "0": -10, "-1": -14 } }, plan);
  t("pref des profondeurs gagne (table entière), écart recalculé", b.w.getNiveauVertical(-1).ecartM === 1);
  t("getHauteurNiveauDuPlan ignore les prefs", b.w.getHauteurNiveauDuPlan(0) === 3);

  b = bac({ hauteurGalerieM: 4 }, plan);
  t("setHauteurNiveau : refus ≤ 0", b.w.setHauteurNiveau(0, 0) === false && b.w.setHauteurNiveau(0, -1) === false);
  b.w.setHauteurNiveau(-1, 2.8);
  t("setHauteurNiveau : écrit le seul niveau, l'ancienne pref vaut encore ailleurs",
    b.w.getHauteurNiveau(-1) === 2.8 && b.w.getHauteurNiveau(0) === 4);
  b.w.setPlanHauteursNiveaux(null, { "0": 3, "-1": 2.5 });
  const p = b.prefs();
  t("setPlanHauteursNiveaux : ne garde que ce qui diffère du plan, retire l'ancienne pref",
    !("hauteurGalerieM" in p) && JSON.stringify(p.niveauxHauteur) === JSON.stringify({ "-1": 2.5 }), p);
  b.w.setPlanHauteursNiveaux(null, { "0": 3, "-1": 3 });
  t("setPlanHauteursNiveaux : table égale au plan → aucune pref", !("niveauxHauteur" in b.prefs()));
  b = bac({ niveauxHauteur: { "0": 9 }, niveauxProfondeur: { "0": 1 }, hauteurGalerieM: 4, autre: 1 }, plan);
  b.w.effacerReglagesNiveaux(null);
  const q = b.prefs();
  t("effacerReglagesNiveaux : sols et hauteurs reviennent au plan, le reste des prefs gardé",
    !q.niveauxHauteur && !q.niveauxProfondeur && !q.hauteurGalerieM && q.autre === 1 &&
    b.w.getNiveauVertical(0).hauteurM === 3 && b.w.getNiveauVertical(0).solM === -25);
}

// ── 5. Saisie d'un écart (calcul pur, partagé par ⚙️ et le Générateur) ──
{
  const { w } = bac();
  const t0 = { "1": -20, "0": -25, "-1": -30, "-2": null };
  const r = w.ecartVersProfondeurs(t0, { "0": 2, "-1": 2 }, 0, -1.5);
  t("écart −1,5 au niveau 0 : sol = −20 − 2 + 1,5 = −20,5", r && r["0"] === -20.5, r);
  t("le niveau du dessous suit du même déplacement, « sans profondeur » gardé",
    r && r["-1"] === -25.5 && r["-2"] === null);
  t("le niveau du dessus ne bouge pas, table d'entrée intacte", r && r["1"] === -20 && t0["0"] === -25);
  t("écart sans sol au-dessus → null", w.ecartVersProfondeurs({ "0": -25 }, {}, 0, 1) === null);
  t("écart vide → null (jamais 0)", w.ecartVersProfondeurs(t0, {}, 0, "") === null);
  const c = w.calculerNiveauVertical(0, r, function () { return 2; });
  t("aller-retour : l'écart relu vaut l'écart saisi", c.ecartM === -1.5, c);
}

// ── 6. Les consommateurs passent par l'accès ──
{
  const fichiers = fs.readdirSync(path.join(ROOT, "js")).filter(function (f) { return /\.js$/.test(f); });
  const morts = fichiers.filter(function (f) { return /PlanHauteurGalerie/.test(lire("js/" + f)); });
  t("plus aucun appel à get/setPlanHauteurGalerie dans js/", morts.length === 0, morts);
  const lecteurs = fichiers.filter(function (f) {
    return f !== "config.js" && f !== "createConf.js" && /\.niveauxHauteur\b|hauteurGalerieM/.test(lire("js/" + f));
  });
  t("niveauxHauteur / hauteurGalerieM lus seulement par config.js (et écrits par le Générateur)", lecteurs.length === 0,
    lecteurs);
  t("vue 3D : hauteur du niveau affiché par getNiveauVertical, écrite par setHauteurNiveau",
    /getNiveauVertical\(niveau\)\.hauteurM/.test(lire("js/vue3d.js")) &&
    /setHauteurNiveau\(e\.niveau, v\)/.test(lire("js/vue3d.js")));
  t("⛏️ Volume exploité : hauteur du niveau mesuré, écrite seulement sur un plan à un niveau",
    /getNiveauVertical\(niveau\)\.hauteurM/.test(lire("js/volumeExploite.js")) &&
    /r\.niveau === null && [^\n]*setHauteurNiveau\(null, h\)/.test(lire("js/volumeExploite.js")));
  t("vue 3D : reglerHauteur sans effet sur un plan multi-niveau",
    /function reglerHauteur\(m\) \{[\s\S]{0,120}if \(_hauteurFigee\(\)\) return e\.hauteur;/.test(lire("js/vue3d.js")));
  t("l'écart n'est jamais écrit dans un plan-config ni une pref", !/niveauxEcart|ecartM\s*=/.test(
    lire("js/createConf.js") + lire("js/profondeurNiveaux.js")));
}

console.log(echecs ? "\n❌ check-niveaux-verticaux : " + echecs + " échec(s)" : "\n✅ check-niveaux-verticaux : OK");
process.exit(echecs ? 1 : 0);
