#!/usr/bin/env node
/*
 * MyKTAMap — check-mur-ligne.js
 * Garde-fou BLOQUANT du mur en ligne (`mur-ligne`), seule structure qui coupe l'itinéraire.
 *
 * CHARGE les vrais modules (styleResolver, legendCustomization, structures, convertirObjet, pathfinder) dans
 * un bac à sable, sur des réseaux FICTIFS (aucune donnée de data/ ici). Il fige :
 *   • le type est intégré, en LIGNE (canon, légende, structures.js) ;
 *   • un front (ligne) peut devenir un mur en ligne, l'inverse aussi ; un pilier non ;
 *   • un segment de tracé qui croise un mur en ligne du même niveau n'est pas dans le graphe ; le même segment
 *     passe quand on lève la contrainte (`respecterInaccessibles: false`) ;
 *   • un mur en ligne d'un AUTRE niveau, un mur polygone, un front ne coupent rien ;
 *   • les murs des calques comptent, le Secours / Perdu (computeReachable) et l'inter-plans aussi ;
 *   • l'import SIG « une couleur par niveau » garde la clé `mur-ligne` (sinon le mur perdrait son rôle) ;
 *   • un relevé de milliers de murs ne rend pas le graphe quadratique (temps mesuré, plafond large).
 *
 * Usage : node scripts/check-mur-ligne.js   (exit 1 si un contrôle échoue)
 */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

function bac(fichiers, extra) {
  const win = Object.assign({
    console: { log(){}, warn(){}, error(){} },
    APP_CONFIG: { scale: 4, multiLevel: false, imageHeight: 1000 },
    I18n: { t: (k) => k, has: () => false },
    getRoads: () => [],
    getAllEmbeddedRoads: () => [],
    getEditorPoints: () => [],
    getAllEmbeddedPoints: () => [],
    getProfondeurNiveau: () => null,
    getZones: () => [],
    getStructures: () => [],
    _ktaDataPolygons: [],
    _ktaDataStructurePolygons: []
  }, extra || {});
  win.window = win;
  const ctx = vm.createContext(win);
  fichiers.forEach(function (f) {
    vm.runInContext("var window = this;" + fs.readFileSync(path.join(ROOT, f), "utf8"), ctx);
  });
  return win;
}

// ───────── 1. Le type : intégré, en ligne ─────────
(function () {
  const w = bac(["js/styleResolver.js", "js/legendCustomization.js", "js/structures.js"]);
  const s = w.ktaResolveStyle("structures", "mur-ligne");
  t("canon : mur-ligne existe et se dessine en ligne", !!s && s.isPolyline === true);
  t("canon : la couleur est le bleu du mur", !!s && s.color === w.ktaResolveStyle("structures", "mur").fillColor);
  t("canon : listé parmi les structures intégrées", w.ktaStyleBuiltins("structures").indexOf("mur-ligne") >= 0);
  t("structures.js : isStructurePolylineType(mur-ligne)", w.isStructurePolylineType("mur-ligne") === true);
  t("structures.js : le mur polygone reste un polygone", w.isStructurePolylineType("mur") === false);
  t("structures.js : KTA_STRUCTURE_TYPES_BUILTIN le liste à côté du mur",
    Array.isArray(w.KTA_STRUCTURE_TYPES_BUILTIN) &&
    w.KTA_STRUCTURE_TYPES_BUILTIN.indexOf("mur-ligne") === w.KTA_STRUCTURE_TYPES_BUILTIN.indexOf("mur") + 1);
  const LC = w.LegendCustomization;
  t("légende : libellé par défaut", LC.getLabel("structures", "mur-ligne") === "Mur (ligne)");
  LC.setSessionLabel("structures", "mur-ligne", "Muret");
  t("légende : renommable comme un intégré", LC.getLabel("structures", "mur-ligne") === "Muret");
  LC.setColor("structures", "mur-ligne", "#00ff88");
  const r = w.ktaResolveStyle("structures", "mur-ligne");
  t("légende : recolorable, reste une ligne", r.color === "#00ff88" && r.isPolyline === true);
  ["fr", "en", "es"].forEach(function (l) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, "lang/" + l + ".json"), "utf8"));
    t("dico " + l + " : libellés du type présents",
      ["legend.label.structures.mur-ligne", "struct.label.mur-ligne", "struct.popup.mur-ligne", "ui.struct.murLigne"]
        .every(function (k) { return typeof d[k] === "string" && d[k].length > 0; }));
  });
})();

// ───────── 2. Conversion ligne → ligne ─────────
(function () {
  const w = bac(["js/styleResolver.js", "js/legendCustomization.js", "js/structures.js", "js/convertirObjet.js"]);
  let S = [{ uid: "st_f", type: "front-1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }];
  w.getStructures = () => S;
  w.setStructures = (v) => { S = v; };
  w.renderStructures = () => {};
  const CV = w.KtaConvertir;
  const types = (fam, ty) => CV.listerCibles(fam, ty).map(function (c) { return c.famille + ":" + c.type; });
  t("conversion : un front peut devenir un mur en ligne", types("structures", "front-1").indexOf("structures:mur-ligne") >= 0);
  t("conversion : un mur en ligne peut devenir un front", types("structures", "mur-ligne").indexOf("structures:front-1") >= 0);
  t("conversion : un mur en ligne peut devenir un tracé", types("structures", "mur-ligne").indexOf("roads:principal") >= 0);
  t("conversion : un pilier (fermé) ne devient pas un mur en ligne",
    types("structures", "pilier-1").indexOf("structures:mur-ligne") < 0);
  t("conversion : front → mur-ligne appliquée",
    CV.convertir("structures", S[0], "structures", "mur-ligne") === true && S[0].type === "mur-ligne" && S[0].uid === "st_f");
})();

// ───────── 3. Itinéraire ─────────
// Ligne droite A (0,100) → B (400,100), et un détour par y = 300. Le mur vertical x = 200 (y 0 → 150) coupe la
// ligne droite, pas le détour : 400 px sans mur, 800 px avec.
const DROIT  = { type: "principal", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 400, y: 100 }] };
const DETOUR = { type: "principal", points: [{ x: 0, y: 100 }, { x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 100 }] };
const MUR    = [{ x: 200, y: 0 }, { x: 200, y: 150 }];
const WPS    = [{ x: 0, y: 100 }, { x: 400, y: 100 }];

function pf(structures, cfg, embarquees) {
  return bac(["js/pathfinder.js"], {
    APP_CONFIG: Object.assign({ scale: 4, multiLevel: false, imageHeight: 1000 }, cfg || {}),
    getAllEmbeddedRoads: () => [DROIT, DETOUR],
    getStructures: () => structures || [],
    _ktaDataStructurePolygons: embarquees || []
  });
}
async function dist(w, opts) {
  try { return Math.round((await w.Pathfinder.computeRoute(WPS, opts || {})).totalDistance); }
  catch (e) { return e.code || "ERR"; }
}

(async function () {
  t("itinéraire : sans mur, la ligne droite (400)", await dist(pf([])) === 400);
  t("itinéraire : un mur en ligne la coupe, détour (800)",
    await dist(pf([{ type: "mur-ligne", points: MUR }])) === 800);
  t("itinéraire : la case « respecter » décochée le lève (400)",
    await dist(pf([{ type: "mur-ligne", points: MUR }]), { respecterInaccessibles: false }) === 400);
  t("itinéraire : un mur des CALQUES coupe aussi (800)",
    await dist(pf([], null, [{ type: "mur-ligne", points: MUR, level: 0 }])) === 800);
  t("itinéraire : un mur polygone ne coupe pas",
    await dist(pf([{ type: "mur", points: [{ x: 195, y: 0 }, { x: 205, y: 0 }, { x: 205, y: 150 }, { x: 195, y: 150 }] }])) === 400);
  t("itinéraire : un front ne coupe pas", await dist(pf([{ type: "front-1", points: MUR }])) === 400);
  t("itinéraire : un mur renommé en légende coupe toujours (le rôle tient à la clé)",
    await dist(Object.assign(pf([{ type: "mur-ligne", points: MUR }]), {
      LegendCustomization: { getLabel: () => "Muret", findCustomEntry: () => null } })) === 800);
  // Multi-niveau : tracés au niveau 0.
  t("multi-niveau : un mur du niveau 1 ne coupe pas le niveau 0",
    await dist(pf([{ type: "mur-ligne", points: MUR, level: 1 }], { multiLevel: true })) === 400);
  t("multi-niveau : un mur sans level (= 0) coupe le niveau 0",
    await dist(pf([{ type: "mur-ligne", points: MUR }], { multiLevel: true })) === 800);
  // Mur qui ferme tout : pas de chemin, sauf en levant la contrainte.
  const FERME = [{ type: "mur-ligne", points: [{ x: 200, y: 0 }, { x: 200, y: 400 }] }];
  t("itinéraire : mur infranchissable → pas de chemin", await dist(pf(FERME)) === "NO_PATH");
  t("itinéraire : … qui passe en levant la contrainte", await dist(pf(FERME), { respecterInaccessibles: false }) === 400);

  // Graphe réseau (Secours, guidage) : le segment coupé est absent avec includeZones, présent sans.
  const wg = pf([{ type: "mur-ligne", points: MUR }]);
  const croise = function (g) {
    return g.segments.some(function (s) {
      const a = g.nodes[s.a], b = g.nodes[s.b];
      return Math.min(a.x, b.x) < 200 && Math.max(a.x, b.x) >= 200 && a.y === 100 && b.y === 100;
    }) || g.segments.some(function (s) {
      const a = g.nodes[s.a], b = g.nodes[s.b];
      return a.y === 100 && b.y === 100 && ((a.x === 200 && b.x === 0) || (a.x === 0 && b.x === 200));
    });
  };
  t("graphe réseau (includeZones) : le segment coupé est absent", !croise(wg.Pathfinder.buildNetworkGraph({ includeZones: true })));
  t("graphe réseau (sans includeZones) : présent", croise(wg.Pathfinder.buildNetworkGraph({})));
  t("nbObstaclesDurs compte le mur", wg.Pathfinder.nbObstaclesDurs() === 1);

  // Perdu / Secours : la portée ne franchit pas un mur infranchissable.
  const wr = pf(FERME);
  const reach = wr.Pathfinder.computeReachable({ x: 0, y: 100 }, 2000, {});
  const auDela = reach.fullSegments.concat(reach.partialSegments).some(function (sg) {
    return sg.some(function (p) { return p.x > 200; });
  });
  t("computeReachable : rien d'atteint au-delà du mur", !auDela && reach.fullSegments.length > 0);

  // Inter-plans : les murs du réseau distant sont fournis par l'appelant.
  const wi = pf([]);
  const sur = function (o) {
    try { return Math.round(wi.Pathfinder.computeRouteOnRoads(WPS, [DROIT, DETOUR], o).totalDistance); }
    catch (e) { return e.code || "ERR"; }
  };
  t("inter-plans : murs fournis → détour", sur({ murs: [{ points: MUR }] }) === 800);
  t("inter-plans : levés avec respecterInaccessibles: false", sur({ murs: [{ points: MUR }], respecterInaccessibles: false }) === 400);

  const ipr = fs.readFileSync(path.join(ROOT, "js/interPlanRoute.js"), "utf8");
  t("inter-plans : les deux étapes distantes passent les murs de leur plan",
    ipr.includes("murs: ctx.murs") && ipr.includes("murs: routingB.murs || []"));

  // ───────── Import SIG ─────────
  // « Une couleur par niveau » fabrique un type de légende par (famille, forme, niveau) : un mur en ligne y
  // perdrait sa clé, donc son rôle d'obstacle.
  (function () {
    const w = bac(["js/sigImport.js"], { KmzExport: { gpsToPlan: (tr, lat, lng) => ({ x: lng, y: lat }) } });
    const ligne = (type) => ({ coords: [{ lat: 0, lng: 0 }, { lat: 0, lng: 10 }], props: { type: type, niv: 1 } });
    const r = w.SigImport.ingest({ points: [], lignes: [ligne("mur"), ligne("front")], polygones: [] }, {},
      { cleType: "type", cleNiveau: "niv", couleurParNiveau: true,
        mapTraces: { mur: "struct:mur-ligne", front: "struct:front-1" } });
    const types = r.structures.map((s) => s.type);
    t("SIG : un mur en ligne garde sa clé sous « une couleur par niveau »", types[0] === "mur-ligne");
    t("SIG : … le front du même niveau prend, lui, le type du niveau", /^cust-/.test(types[1] || ""));
  })();

  // ───────── 4. Perf : relevé dense fictif ─────────
  // 70 × 70 galeries en grille (≈ 9 700 segments) et 3 000 murs de 2 segments : le test naïf ferait ~6·10⁷
  // intersections par graphe ; avec la grille de murs, le graphe coûte le même ordre de temps que sans murs.
  const N = 70, PAS = 20, roads = [], murs = [];
  for (let i = 0; i < N; i++) {
    const h = [], v = [];
    for (let j = 0; j < N; j++) { h.push({ x: j * PAS, y: i * PAS }); v.push({ x: i * PAS, y: j * PAS }); }
    roads.push({ type: "principal", points: h }, { type: "principal", points: v });
  }
  let graine = 7;
  const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  for (let k = 0; k < 3000; k++) {
    const x = alea() * N * PAS, y = alea() * N * PAS;
    murs.push({ type: "mur-ligne", points: [{ x: x, y: y }, { x: x + 6, y: y + 6 }, { x: x + 12, y: y }] });
  }
  const mesure = function (structs) {
    const w = bac(["js/pathfinder.js"], { getAllEmbeddedRoads: () => roads, getStructures: () => structs });
    const t0 = process.hrtime.bigint();
    const g = w.Pathfinder.buildNetworkGraph({ includeZones: true });
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6, segs: g.segments.length };
  };
  const sans = mesure([]), avec = mesure(murs);
  console.log("   ↳ perf : " + sans.segs + " segments sans murs en " + sans.ms.toFixed(0) + " ms ; " +
              avec.segs + " avec 3 000 murs en " + avec.ms.toFixed(0) + " ms");
  t("perf : des murs coupent bien des segments du relevé dense", avec.segs < sans.segs);
  t("perf : 3 000 murs coûtent moins de 3× le graphe sans murs (+ 500 ms de marge)",
    avec.ms < sans.ms * 3 + 500);

  console.log(ko === 0 ? "\n🎉 tout passe" : "\n⚠️ " + ko + " echec(s)");
  process.exit(ko === 0 ? 0 : 1);
})();
