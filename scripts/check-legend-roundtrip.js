#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔁 check-legend-roundtrip.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Rejoue de bout en bout LE scénario qui était cassé (F2/F3, audit du 04/08) :
// je crée un type custom, je dessine, j'exporte en calque de données, je
// régénère un plan avec ce calque, je l'ouvre.
//
// Avant v1.76.0 : seul l'ID du type voyageait, jamais sa DÉFINITION. Les
// tracés custom ressortaient en BLANC, les zones en gris remblais, les
// structures en bleu mur — et aucune ligne dans ≡ Légende, puisque le panneau
// ne liste que les entrées connues et ne regarde jamais les objets dessinés.
// Aucun chemin d'UI ne permettait de réparer.
//
// Le code testé est EXTRAIT des fichiers réels (pas recopié) : si quelqu'un
// modifie `_legendePourPayload` ou `_absorberLegendeCalque`, c'est la nouvelle
// version qui est éprouvée. Si l'une des deux disparaît ou change de nom, le
// script échoue bruyamment au lieu de tester du vide.
//
// Ce qu'il verrouille, au-delà du simple aller-retour :
//   • on n'embarque QUE ce que le calque référence (pas toute la session) ;
//   • le ré-import du même calque est IDEMPOTENT (pas de doublons) ;
//   • en cas de CONFLIT, la légende du plan gagne toujours — un calque ne
//     doit jamais repeindre en silence le travail de l'auteur du plan.
// =====================================================================
const fs = require("fs"), vm = require("vm");

function extraire(src, signature, fin) {
  const d = src.indexOf(signature);
  if (d < 0) throw new Error("introuvable : " + signature);
  return src.slice(d, src.indexOf(fin, d) + fin.length);
}

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ───────── cote EXPORT (sessionExporter.js) ─────────
const se = fs.readFileSync("js/sessionExporter.js", "utf8");
const winE = { console: { log() {}, warn() {} } };
winE.window = winE;
const ctxE = vm.createContext(winE);
vm.runInContext("var window=this;" + extraire(se, "function _legendePourPayload", "\n  }") +
                "\nthis._legendePourPayload=_legendePourPayload;", ctxE);

// La session : 2 types custom + un built-in renomme + une couleur choisie.
winE.LegendCustomization = {
  getSessionState() {
    return {
      schemaVersion: 1,
      labels: { "traces.principal": "Grande galerie", "zones.eau": "Flotte" },
      hidden: { "structures.mur": true },
      colors: { "traces.chemin": "#ff8800", "zones.remblais": "#112233" },
      customEntries: [
        { id: "cust-aaa", category: "traces", geometry: "polyline", label: "Boyau", lineColor: "#ff00aa" },
        { id: "cust-bbb", category: "zones",  geometry: "polygon",  label: "Argile", fillColor: "#00ffaa" },
        { id: "cust-zzz", category: "traces", geometry: "polyline", label: "Jamais dessine", lineColor: "#000000" }
      ]
    };
  }
};

// Le calque exporte : un tracé custom + un tracé principal. Pas de zones.
const payload = { data: [], roads: [ { type: "cust-aaa" }, { type: "principal" } ] };
const leg = winE._legendePourPayload(payload);

t("une legende est bien embarquee", !!leg);
t("l'entree custom REFEREE part", leg.customEntries.some(e => e.id === "cust-aaa"));
t("l'entree custom NON referencee ne part PAS", !leg.customEntries.some(e => e.id === "cust-zzz"));
t("l'entree custom d'une autre categorie ne part pas", !leg.customEntries.some(e => e.id === "cust-bbb"));
t("le renommage d'un built-in present part", leg.labels["traces.principal"] === "Grande galerie");
t("le renommage d'un built-in ABSENT ne part pas", leg.labels["zones.eau"] === undefined);
t("la couleur d'un built-in absent ne part pas", leg.colors["zones.remblais"] === undefined);
t("le masquage d'un type absent ne part pas", leg.hidden["structures.mur"] === undefined);

// Un calque sans aucune personnalisation ne doit rien trainer.
t("calque sans perso -> pas de champ legende",
  winE._legendePourPayload({ data: [], roads: [{ type: "secondaire" }] }) === null);

// ───────── cote IMPORT (createConf.js) ─────────
const cc = fs.readFileSync("js/createConf.js", "utf8");
const winI = { console: { log() {}, warn() {} } };
winI.window = winI;
const ctxI = vm.createContext(winI);
vm.runInContext(
  "var window=this; var _plannerPlanLegend = null; function _plannerLegendStatus(){}\n" +
  extraire(cc, "function _absorberLegendeCalque", "\n}") + "\n" +
  extraire(cc, "function _plannerLegendStateNormalize", "\n}") + "\n" +
  "this._absorber = function(l){ _absorberLegendeCalque(l); return _plannerPlanLegend; };" +
  "this._setPlan  = function(p){ _plannerPlanLegend = p; };", ctxI);

// Cas 1 : plan vierge -> tout est repris.
let res = winI._absorber(leg);
t("plan vierge : la legende du calque est reprise", !!res);
t("  -> l'entree custom est la", res.customEntries.some(e => e.id === "cust-aaa"));
t("  -> le renommage est la", res.labels["traces.principal"] === "Grande galerie");

// Cas 2 : re-import du MEME calque -> idempotent, aucun doublon.
const avant = JSON.stringify(res);
res = winI._absorber(leg);
t("re-import du meme calque : idempotent", JSON.stringify(res) === avant);
t("  -> pas de doublon d'entree", res.customEntries.filter(e => e.id === "cust-aaa").length === 1);

// Cas 3 : CONFLIT -> l'existant du plan gagne, toujours.
winI._setPlan({
  labels: { "traces.principal": "NOM DU PLAN" },
  hidden: {}, colors: {},
  customEntries: [{ id: "cust-aaa", category: "traces", label: "VERSION DU PLAN", lineColor: "#111111" }]
});
res = winI._absorber(leg);
t("conflit de libelle : l'existant du plan gagne", res.labels["traces.principal"] === "NOM DU PLAN");
const e1 = res.customEntries.filter(e => e.id === "cust-aaa");
t("conflit d'id : l'entree du plan gagne", e1.length === 1 && e1[0].label === "VERSION DU PLAN");

// Cas 4 : une legende vide ne doit pas creer un plan-config bidon.
winI._setPlan(null);
t("legende vide -> rien n'est cree", winI._absorber({ labels:{}, hidden:{}, colors:{}, customEntries:[] }) === null);
t("legende absente -> rien n'est cree", winI._absorber(null) === null);

console.log(ko === 0 ? "\n🎉 round-trip complet OK" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
