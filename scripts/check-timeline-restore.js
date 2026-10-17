#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// check-timeline-restore.js — la timeline du suivi survit au rechargement SANS perdre ses champs utiles.
// Exécute la vraie fonction `tracking.js > window.setTrackingTimeline` dans un bac à sable et vérifie :
//   - src (« point » / « click »), tp (téléportation), estM / estSrc (distance estimée) sont repris ;
//   - les valeurs invalides (payload tiers) sont écartées ;
//   - les compteurs qui les lisent (recalages sur point, distance estimée) donnent la même chose avant/après.
// 🩸 Sans ces champs, un reload sous-comptait les recalages et la distance estimée (Carnet, statistiques).
"use strict";
const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (nom, ok) => { console.log((ok ? "✅ " : "❌ ") + nom); if (!ok) ko++; };

const src = fs.readFileSync("js/tracking.js", "utf8");
const i = src.indexOf("window.setTrackingTimeline = function");
const fin = src.indexOf("\n};", i);
t("setTrackingTimeline est présent", i >= 0 && fin > i);
if (i < 0 || fin < 0) process.exit(1);
const corps = src.slice(i, fin + 3);

// Bac à sable minimal : la fonction écrit _trackingTimeline / _trackingStartTs et appelle quelques helpers.
const bac = {
  window: {}, console: { warn() {}, log() {} },
  _trackingTimeline: [], _trackingStartTs: null, MAX_TIMELINE_ENTRIES: 100000,
  _decimateTimeline() {}, _rebuildTrailFromTimeline() {}
};
bac.window = bac;
vm.createContext(bac);
try { vm.runInContext(corps, bac); } catch (e) { t("la fonction s'évalue hors de l'app (" + e.message + ")", false); }

const entree = [
  { x: 1, y: 1, t: 1, type: "start" },
  { x: 2, y: 2, t: 2, type: "recalage", src: "point" },
  { x: 3, y: 3, t: 3, type: "recalage", src: "point", tp: 1 },
  { x: 4, y: 4, t: 4, type: "recalage", src: "click" },
  { x: 5, y: 5, t: 5, type: "pdr", estM: 12.5, estSrc: "vol" },
  { x: 6, y: 6, t: 6, type: "pdr", estM: 8, estSrc: "reseau" },
  { x: 7, y: 7, t: 7, type: "pdr", estM: -3, estSrc: "inconnu", src: "<img>", tp: "oui" }
];
try {
  bac.window.setTrackingTimeline(JSON.parse(JSON.stringify(entree)), 1);
  vm.runInContext("this.__tl = _trackingTimeline;", bac);
} catch (e) { t("restauration exécutée (" + e.message + ")", false); }
const tl = bac.__tl || [];
t("toutes les entrées valides sont gardées", tl.length === entree.length);
t("src « point » repris", tl[1] && tl[1].src === "point");
t("téléportation (tp) reprise", tl[2] && tl[2].tp === 1);
t("src « click » repris", tl[3] && tl[3].src === "click");
t("distance estimée « vol » reprise", tl[4] && tl[4].estM === 12.5 && tl[4].estSrc === "vol");
t("distance estimée « reseau » reprise", tl[5] && tl[5].estM === 8 && tl[5].estSrc === "reseau");
t("valeurs invalides écartées (estM < 0, estSrc, src, tp inconnus)",
  tl[6] && !("estM" in tl[6]) && !("estSrc" in tl[6]) && !("src" in tl[6]) && !("tp" in tl[6]));

// Mêmes règles que tracking.js > compteurs : recalages sur point hors téléportation, distance estimée.
const recalages = (l) => l.filter((e) => e && e.type === "recalage" && e.src === "point" && !e.tp).length;
const distance = (l) => l.reduce((s, e) => s + (e && isFinite(e.estM) && e.estM > 0 ? e.estM : 0), 0);
const valides = entree.slice(0, 6);
t("compteur de recalages identique avant/après", recalages(tl) === recalages(valides));
t("distance estimée identique avant/après", distance(tl) === distance(valides));

if (ko) { console.log("\n❌ " + ko + " échec(s) — restauration de la timeline du suivi"); process.exit(1); }
console.log("\n🎉 timeline du suivi : src, tp, estM et estSrc survivent au rechargement");
