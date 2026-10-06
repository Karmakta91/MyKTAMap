#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔁 check-secours-relais.js — garde-fou pré-commit BLOQUANT (05/10/2026)
// =====================================================================
// Défaut constaté (étude Secours avec l'installation, étape 0) : le relais en
// direct d'une installation reliée importait le scénario reçu en « remplacer »,
// qui reconstruit le scénario SANS son exécution et efface ses photos — le PC qui
// coche effaçait le tableau du téléphone de l'équipe, et l'inverse ; le rôle de
// l'un écrasait celui de l'autre. Ce contrôle exécute la VRAIE fusion
// (js/secoursMode.js) contre ces cas et vérifie son câblage.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c, detail) => { console.log((c ? "✅" : "❌") + " " + n + (c || detail === undefined ? "" : " — " + JSON.stringify(detail))); if (!c) ko++; };
const SM = fs.readFileSync("js/secoursMode.js", "utf8").replace(/\r\n/g, "\n");

function corps(nom) {
  const i = SM.indexOf("function " + nom + "(");
  if (i < 0) return "";
  const retrait = SM.lastIndexOf("\n", i) + 1;
  const pad = SM.slice(retrait, i).replace(/\S.*$/, "");   // indentation seule (« async » exclu)
  const fin = SM.indexOf("\n" + pad + "}", i);
  return fin < 0 ? "" : SM.slice(i, fin + pad.length + 2);
}
const champs = (SM.match(/const _CHAMPS_APPAREIL = \[[\s\S]*?\];/) || [""])[0];

// ═════════ 1. La vraie fusion, exécutée ═════════
const ctx = {};
let charge = true;
try {
  vm.runInNewContext(
    "const MC_MAX = 2000;\n" +
    "const TABLEAU_STATUTS = [{ id: 'pending', severity: 0 }, { id: 'ras', severity: 0 }, { id: 'suspect', severity: 1 }, { id: 'victime', severity: 3 }];\n" +
    corps("_getStatutInfo") + "\n" + champs + "\n" +
    ["_fusionnerEtape", "_fusionnerEtapesEquipe", "_unionPar", "_fusionnerExecutionDirect"].map(corps).join("\n") +
    "\nthis.F = _fusionnerExecutionDirect;", ctx);
} catch (e) { charge = false; console.log(e.message); }
t("fusion de js/secoursMode.js chargée et exécutable", charge && typeof ctx.F === "function");

if (ctx.F) {
  const F = ctx.F;
  const T1 = "2026-10-05T10:00:00.000Z", T2 = "2026-10-05T10:05:00.000Z";
  const locale = {
    active: true, role: "equipe", currentEquipeId: "G2", rapportExporteAt: null,
    etapes: {
      G1: [{ wid: "w1", statut: "pending" }, { wid: "w2", statut: "ras", majAt: T2 }],
      G2: [{ wid: "w3", statut: "suspect", majAt: T2 }],
      _notes_libres: [{ id: "n1", texte: "ici" }]
    },
    mainCourante: [{ at: T1, cle: "a", p: {} }]
  };
  const recue = {
    active: true, role: "operateur", currentEquipeId: null, currentPhaseIdx: 1,
    etapes: {
      G1: [{ wid: "w1", statut: "ras", majAt: T1 }, { wid: "w2", statut: "suspect", majAt: T1 }],
      G2: [{ wid: "w3", statut: "pending" }],
      _notes_libres: [{ id: "n1", texte: "ici" }, { id: "n2", texte: "là-bas" }]
    },
    mainCourante: [{ at: T1, cle: "a", p: {} }, { at: T2, cle: "b", p: {} }]
  };
  const m = F(locale, recue);
  t("🩸 le rôle et l'équipe suivie de CET appareil restent les siens", m.role === "equipe" && m.currentEquipeId === "G2", [m.role, m.currentEquipeId]);
  t("étape cochée ailleurs, jamais touchée ici → reprise", m.etapes.G1[0].statut === "ras");
  t("🩸 étape modifiée ici PLUS RÉCEMMENT → gardée (pas écrasée par l'ancienne version reçue)", m.etapes.G1[1].statut === "ras");
  t("🩸 étape de mon équipe modifiée ici, reçue sans horodatage → gardée", m.etapes.G2[0].statut === "suspect");
  t("notes libres : union sans doublon", m.etapes._notes_libres.length === 2);
  t("main courante : union sans doublon, dans l'ordre", m.mainCourante.length === 2 && m.mainCourante[1].cle === "b");
  t("champs communs (phase en cours) : la version reçue", m.currentPhaseIdx === 1);
  t("🩸 sans exécution ici, rien n'est créé (l'appareil choisit de rejoindre)", F(null, recue) === null);
  t("reçue sans exécution → la locale est gardée", F(locale, null) === locale);
  const g = F({ role: "operateur", etapes: { G1: [{ wid: "w1", statut: "ras" }] } },
    { role: "equipe", etapes: { G1: [{ wid: "w1", statut: "victime" }] } });
  t("sans horodatage des deux côtés : le statut le plus grave gagne", g.etapes.G1[0].statut === "victime");
}

// ═════════ 2. Câblage ═════════
t("updateEtape horodate chaque modification (majAt)", /et\.majAt = _nowIso\(\);/.test(corps("updateEtape")));
const imp = corps("_appliquerPayloadImport");
t("🩸 import « remplacer » + garderExecution : exécution FUSIONNÉE, photos gardées",
  /remplacer && garderExecution && _scenarios\[idxExistant\]\.execution/.test(imp) &&
  /cleanScenario\.execution = _fusionnerExecutionDirect\(/.test(imp));
t("importerScenario transmet garderExecution", /garderExecution: !!\(opts && opts\.garderExecution\)/.test(corps("importerScenario")));
t("sans l'option, « remplacer » garde son comportement (exécution effacée, annoncée par l'aperçu)",
  /\} else if \(remplacer\) \{/.test(imp));

console.log(ko ? "\n❌ check-secours-relais : " + ko + " échec(s)" : "\n🎉 relais Secours : l'intervention en cours n'est jamais effacée, le poste reste celui de l'appareil");
process.exit(ko ? 1 : 0);
