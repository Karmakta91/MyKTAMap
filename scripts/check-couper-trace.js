#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-couper-trace.js — BLOQUANT (pré-commit) : ✂️ Couper un tracé à un sommet (js/ajusterSommets.js > _couper,
// prise road.js > ktaFormesAjustables.roads), chargés dans un `vm` sans Leaflet.
// 🩸 Ce qui régresse sans bruit :
//   1. Deux morceaux qui partagent le sommet coupé (dupliqué) : sans lui, l'itinéraire ne passe plus par là.
//   2. Le premier morceau GARDE l'objet (uid, champs) ; le second a un uid NEUF (deux uid égaux = un objet perdu à la
//      synchro) et reprend type, niveau, note.
//   3. Une écriture, UN instantané, UNE entrée ⏪ ; KtaUid.touch sur le premier (la synchro voit partir).
//   4. Refus : sommet de bout, milieu de segment, jonction, itinéraire ; menu sans ✂️ dans ces cas.
// La prise est le bloc RÉEL de road.js (extrait du fichier), pas une copie.
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

function contexte() {
  const journal = { snap: 0, record: [], saves: 0, rendus: 0, toasts: [] };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, JSON, Math, Array, Object, String, Number, Boolean, RegExp, Error, Date, Set,
    performance: { now: () => Date.now() },
    crypto: { getRandomValues: (b) => { for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256); return b; } },
    document: { querySelector: () => null, addEventListener() {}, visibilityState: "visible" },
    addEventListener() {}, removeEventListener() {},
    I18n: { t: (k, p) => k + (p ? ":" + JSON.stringify(p) : "") },
    ktaEsc: (s) => String(s),
    HistoryManager: {
      captureState: (cat) => { journal.snap++; return { cat: cat }; },
      record: (label, avant, cat) => { journal.record.push({ label, avant, cat }); }
    },
    SessionPersist: { save: () => { journal.saves++; } },
    OOMGuard: { showToast: (m, ty) => { journal.toasts.push([m, ty]); } },
    APP_CONFIG: { imageHeight: 1000, multiLevel: true, visibleLevels: [0, -1], activeLevel: 0 },
    map: {
      mouseEventToLatLng: () => ({ lat: 0, lng: 0 }),
      options: { crs: { scale: () => 1 } }, getZoom: () => 0, hasLayer: () => true
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("js/ktaUid.js", "utf8"), ctx, { filename: "ktaUid.js" });
  vm.runInContext(fs.readFileSync("js/ajusterSommets.js", "utf8"), ctx, { filename: "ajusterSommets.js" });
  // Bloc réel de la prise des tracés, avec ce qu'il lit de road.js.
  const ROAD = fs.readFileSync("js/road.js", "utf8").replace(/\r\n/g, "\n");
  const m = ROAD.match(/window\.ktaFormesAjustables\.roads = \{[\s\S]*?\n\};/);
  t("prise : bloc ktaFormesAjustables.roads trouvé dans road.js", !!m);
  ctx.roadsData = [];
  ctx.currentRoad = null;
  ctx.renderRoads = () => { journal.rendus++; };
  ctx._tracePasseFiltres = () => true;
  ctx._libelleTypeTrace = (ty) => ty;
  ctx._snapSurSommetProche = () => null;
  ctx._flashSnap = () => {};
  vm.runInContext("var roadsData = window.roadsData, currentRoad = null;" +
    "window.ktaFormesAjustables = window.ktaFormesAjustables || {};" + (m ? m[0] : ""), ctx, { filename: "road.js" });
  return { ctx, journal };
}

const A = (h) => h.ctx.KtaAjusterSommets;
const pts = (l) => l.map(function (p) { return { x: p[0], y: p[1] }; });

// ── 1. Coupe au sommet intérieur ──────
{
  const h = contexte();
  const tr = { uid: "rd_orig", updatedAt: 0, type: "principal", level: -1, description: "note", points:
    pts([[0, 0], [10, 0], [20, 0], [30, 0]]) };
  const autre = { uid: "rd_autre", type: "principal", level: 0, points: pts([[0, 50], [10, 50]]) };
  h.ctx.roadsData.push(tr, autre);
  const c = A(h).plan.saisir(20, 0, 1);
  t("visée : le sommet intérieur est attrapé", !!c && c.genre === "sommet" && c.i === 2);
  t("menu : ✂️ proposé sur un sommet intérieur d'un tracé", A(h).plan.coupable(c) === true);
  t("menu : le bouton ✂️ est dans le HTML du menu quand il est proposé",
    /kta-ajuster-couper/.test(A(h).htmlMenu(null, false, true)) && !/kta-ajuster-couper/.test(A(h).htmlMenu(null, false, false)));
  const ok = A(h).plan.couper(c);
  const R = h.ctx.roadsData;
  t("coupe : deux tracés à la place d'un", ok === true && R.length === 3);
  const neuf = R[1];
  t("coupe : le second morceau suit le premier dans la liste", R[0] === tr && R[2] === autre);
  t("🩸 coupe : le premier finit au sommet coupé, le second y commence (sommet partagé)",
    JSON.stringify(tr.points) === JSON.stringify(pts([[0, 0], [10, 0], [20, 0]])) &&
    JSON.stringify(neuf.points) === JSON.stringify(pts([[20, 0], [30, 0]])));
  t("coupe : le sommet partagé est une copie (déplacer l'un ne déplace pas l'autre)",
    neuf.points[0] !== tr.points[2]);
  t("🩸 coupe : le premier garde son uid, le second en reçoit un neuf",
    tr.uid === "rd_orig" && typeof neuf.uid === "string" && /^rd_/.test(neuf.uid) && neuf.uid !== tr.uid);
  t("coupe : même type, niveau et note", neuf.type === "principal" && neuf.level === -1 && neuf.description === "note");
  t("coupe : le premier est horodaté (KtaUid.touch), le second aussi", tr.updatedAt > 0 && neuf.updatedAt > 0);
  t("🩸 coupe : UN instantané (tracés), UNE entrée ⏪, un rendu, une sauvegarde",
    h.journal.snap === 1 && h.journal.record.length === 1 && h.journal.record[0].cat === "roads" &&
    h.journal.rendus === 1 && h.journal.saves === 1);
  t("coupe : un toast dit ce qui s'est passé", h.journal.toasts.some((x) => /ajuster\.toast\.coupe/.test(x[0])));
  t("coupe : compteur", A(h).etat().coupes === 1);
}

// ── 2. Refus ──────
{
  const h = contexte();
  const tr = { uid: "rd_b", type: "principal", level: 0, points: pts([[0, 0], [10, 0], [20, 0]]) };
  const jonc = { uid: "rd_j", type: "jonction", fromLevel: 0, toLevel: -1, points: pts([[0, 100], [10, 100], [20, 100]]) };
  h.ctx.roadsData.push(tr, jonc);
  const bout0 = A(h).plan.saisir(0, 0, 1), bout1 = A(h).plan.saisir(20, 0, 1);
  t("🩸 refus : premier sommet (bout)", !A(h).plan.coupable(bout0) && !A(h).plan.couper(bout0));
  t("🩸 refus : dernier sommet (bout)", !A(h).plan.coupable(bout1) && !A(h).plan.couper(bout1));
  const milieu = A(h).plan.saisir(5, 0, 1);
  t("refus : milieu de segment (on ajoute d'abord un sommet)",
    !!milieu && milieu.genre === "milieu" && !A(h).plan.couper(milieu));
  const cj = A(h).plan.saisir(10, 100, 1);
  t("🩸 refus : une jonction ne se coupe pas", !!cj && !A(h).plan.coupable(cj) && !A(h).plan.couper(cj));
  t("refus : rien écrit, rien à annuler",
    h.ctx.roadsData.length === 2 && h.journal.snap === 0 && h.journal.record.length === 0);
  t("refus : l'itinéraire n'est pas une forme coupable", h.ctx.ktaFormesAjustables.roads.coupable({ type: "itinerary" }) === false);
  h.ctx.ktaEditionRefusee = () => true;
  const c = { genre: "sommet", f: "roads", a: h.ctx.ktaFormesAjustables.roads, o: tr, i: 1 };
  t("🔒 refus : plan en lecture seule", !A(h).plan.couper(c) && h.ctx.roadsData.length === 2);
}

// ── 3. Câblage ──────
{
  const AJ = fs.readFileSync("js/ajusterSommets.js", "utf8");
  const V3 = fs.readFileSync("js/vue3d.js", "utf8");
  t("câblage carte : le clic sur ✂️ coupe", /kta-ajuster-couper"\)\) _couper\(c\)/.test(AJ));
  t("câblage 3D : le menu demande ✂️ à la règle de la carte", /A\.plan\.coupable\(g\.c\)/.test(V3));
  t("câblage 3D : ✂️ agit (data-v3d ajusterCouper)", /a === "ajusterCouper"\) \{ ev\.preventDefault\(\); _ajusterCouper\(\); \}/.test(V3));
  ["ajuster.couper", "ajuster.histo.couper", "ajuster.toast.coupe"].forEach(function (k) {
    ["fr", "en", "es"].forEach(function (l) {
      const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
      t("i18n " + l + " : " + k, typeof D[k] === "string" && D[k].length > 0);
    });
  });
}

console.log(ko === 0 ? "\n🎉 ✂️ couper un tracé : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
