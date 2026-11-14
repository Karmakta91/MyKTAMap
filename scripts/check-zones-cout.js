#!/usr/bin/env node
/*
 * MyKTAMap — check-zones-cout.js
 * Garde-fou BLOQUANT des zones à coût de l'itinéraire : Comblé (`remblais`) et effondrement ne sont JAMAIS des
 * contraintes dures. CHARGE poiJonction.js, pathfinder.js et verifierPlan.js dans un bac à sable, sur des réseaux
 * FICTIFS en mémoire (aucune donnée de data/ ici).
 *
 * Il fige :
 *   • évitées quand un autre chemin existe, même bien plus long ; traversées sans autre chemin, et le résultat le dit
 *     (`zonesTraversees`, phrase de `texteZonesTraversees`) ; jamais « aucun chemin » à cause d'elles ;
 *   • la distance rendue reste la vraie longueur (le coût vit à part) ; sans zone à coût, coût = distance ;
 *   • la case « Respecter… » ne les lève pas, la passe 2 non plus ; elles ne sont plus dans les évitables ;
 *   • `inaccessible` reste dure ; une zone d'un autre niveau ne coûte rien ; le Secours / Perdu (computeReachable)
 *     les ignore ; l'inter-plans (computeRouteOnRoads) suit la même règle ;
 *   • « Vérifier le plan » : C12 range le tracé qui en traverse une en « revoir », jamais en bloquant ni en C1 ;
 *   • tables uniques (TYPES_ZONES_COUT), brancard sans Comblé coché.
 *
 * Usage : node scripts/check-zones-cout.js   (exit 1 si un contrôle échoue)
 */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const lire = f => fs.readFileSync(path.join(ROOT, f), "utf8");

let ko = 0;
const t = (n, c, detail) => {
  console.log((c ? "✅" : "❌") + " " + n + (!c && detail !== undefined ? " " + JSON.stringify(detail) : ""));
  if (!c) ko++;
};

const ECHELLE = 4;   // px/m
const P = (x, y) => ({ x: x, y: y });
const R = (uid, type, pts, extra) => Object.assign({ uid: uid, type: type, points: pts.map(p => P(p[0], p[1])) },
  extra || {});

function bac(d, cfg) {
  const win = {
    console: { log() {}, warn() {}, error() {} },
    APP_CONFIG: Object.assign({ scale: ECHELLE, multiLevel: false, imageHeight: 1000 }, cfg || {}),
    I18n: { t: (k, p) => k + (p ? JSON.stringify(p) : "") },
    formatDistance: (m) => m.toFixed(1) + " m",
    getRoads: () => d.roads || [],
    getAllEmbeddedRoads: () => [],
    getZones: () => d.zones || [],
    getStructures: () => d.structures || [],
    getEditorPoints: () => [],
    getAllEmbeddedPoints: () => [],
    getProfondeurNiveau: () => null,
    _ktaDataPolygons: d.calques || [],
    _ktaDataStructurePolygons: [],
    getPlanVerifVus: () => [],
    setPlanVerifVus: () => true,
    addEventListener() {},
    ktaEsc: s => String(s),
    ktaIcone: () => ""
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ["js/poiJonction.js", "js/pathfinder.js", "js/verifierPlan.js"].forEach(function (f) {
    vm.runInContext("var window = this;" + lire(f), ctx);
  });
  return win;
}

// Galerie droite A(0,0) → B(200,0) ; détour A → (0,100) → (200,100) → B (400 px, 100 m). Zone au milieu de la droite.
const A = { x: 0, y: 0 }, B = { x: 200, y: 0 };
const droite = R("rd_droit", "principal", [[0, 0], [100, 0], [200, 0]]);
const detour = R("rd_detour", "principal", [[0, 0], [0, 100], [200, 100], [200, 0]]);
const zone = (type, extra) => R("zn_" + type, type, [[80, -20], [120, -20], [120, 20], [80, 20]], extra);

async function route(w, opts) {
  try {
    const r = await w.Pathfinder.computeRoute([A, B], Object.assign({ allowedTypes: ["principal"] }, opts || {}));
    return r;
  } catch (e) { return { erreur: e.code || String(e.message) }; }
}

(async function () {
  // ── 1. Tables ──
  {
    const w = bac({});
    const PF = w.Pathfinder;
    t("TYPES_ZONES_COUT = [remblais, effondrement]",
      JSON.stringify(PF.TYPES_ZONES_COUT) === JSON.stringify(["remblais", "effondrement"]));
    t("Comblé et effondrement : ni durs ni absents (estZoneCout vrai, estZoneDure faux)",
      PF.estZoneCout("remblais") && PF.estZoneCout("effondrement") && !PF.estZoneDure("remblais") &&
      !PF.estZoneDure("effondrement") && PF.estZoneDure("inaccessible") && !PF.estZoneCout("eau"));
    const sec = lire("js/secoursMode.js");
    const m = sec.match(/const BRANCARD_COCHES = (\[[^\]]*\])/);
    t("brancard : Comblé plus coché (évité d'office par son coût, jamais bloquant)",
      !!m && m[1].indexOf("remblais") < 0, m && m[1]);
    const pf = lire("js/pathfinder.js"), ipr = lire("js/interPlanRoute.js");
    t("pathfinder.js / interPlanRoute.js : aucun test `=== \"remblais\"` ou `\"effondrement\"` hors de la table",
      !/[!=]==\s*"(?:remblais|effondrement)"/.test(pf) && !/[!=]==\s*"(?:remblais|effondrement)"/.test(ipr) &&
      /estZoneCout/.test(ipr));
  }

  for (const type of ["remblais", "effondrement"]) {
    // ── 2. Évitée quand un autre chemin existe ──
    {
      const w = bac({ roads: [droite, detour], zones: [zone(type)] });
      const r = await route(w);
      t(type + " + détour : le détour est pris (400 px)", !r.erreur && Math.round(r.totalDistance) === 400,
        r.erreur || r.totalDistance);
      t(type + " + détour : rien de traversé, pas d'alerte", !r.erreur && r.zonesTraversees.length === 0 &&
        w.Pathfinder.texteZonesTraversees(r.zonesTraversees) === null);
      const r2 = await route(w, { respecterInaccessibles: false });
      t(type + " : la case « Respecter… » décochée ne lève pas l'évitement", !r2.erreur &&
        Math.round(r2.totalDistance) === 400);
      t(type + " : absent des types évitables (une case serait trompeuse)",
        w.getAvoidableZoneTypes().every(z => z.type !== type));
      const r3 = await route(w, { avoidZones: [type, "eau"] });
      t(type + " coché dans d'anciennes préférences : ignoré, pas de passe 2", !r3.erreur && !r3.usedFallback &&
        Math.round(r3.totalDistance) === 400);
    }
    // Détour très long (20 fois la droite) : toujours préféré.
    {
      const loin = R("rd_loin", "principal", [[0, 0], [0, 2000], [200, 2000], [200, 0]]);
      const w = bac({ roads: [droite, loin], zones: [zone(type)] });
      const r = await route(w);
      t(type + " : un détour 20 fois plus long l'emporte encore", !r.erreur && Math.round(r.totalDistance) === 4200,
        r.erreur || r.totalDistance);
    }
    // ── 3. Traversée sans autre chemin, et dite ──
    {
      const w = bac({ roads: [droite], zones: [zone(type)] });
      const r = await route(w);
      t(type + " seul chemin : l'itinéraire passe (jamais « aucun chemin »)", !r.erreur, r.erreur);
      t(type + " seul chemin : distance = vraie longueur (200 px), coût à part", !r.erreur &&
        Math.round(r.totalDistance) === 200 && r.cout > r.totalDistance, r.erreur || [r.totalDistance, r.cout]);
      const z = !r.erreur && r.zonesTraversees[0];
      t(type + " seul chemin : la zone est rendue, 40 px traversés", !!z && z.type === type &&
        Math.abs(z.longueurPx - 40) < 0.01 && z.objet.uid === "zn_" + type, r.zonesTraversees);
      const txt = !r.erreur && w.Pathfinder.texteZonesTraversees(r.zonesTraversees);
      t(type + " seul chemin : la phrase le dit (iti.zonesCout.traverse, 10 m)",
        typeof txt === "string" && txt.indexOf("iti.zonesCout.traverse") === 0 && txt.indexOf("10.0 m") > 0, txt);
      const cr = w.Pathfinder.computeReachable(A, 400);
      const atteint = cr.fullSegments.length + cr.partialSegments.length;
      t(type + " : le périmètre du Secours / Perdu (computeReachable) n'en tient pas compte",
        !cr.exceedsBudget && Math.abs(cr.totalReachableDistance - 200) < 1, [atteint, cr.totalReachableDistance]);
    }
    // Départ DANS la zone : passe aussi.
    {
      const w = bac({ roads: [droite], zones: [zone(type)] });
      let r;
      try { r = await w.Pathfinder.computeRoute([{ x: 100, y: 0 }, B], { allowedTypes: ["principal"] }); }
      catch (e) { r = { erreur: e.code }; }
      t(type + " : départ dans la zone → chemin trouvé, 20 px traversés",
        !r.erreur && r.zonesTraversees.length === 1 &&
        Math.abs(r.zonesTraversees[0].longueurPx - 20) < 0.01, r.erreur || r.zonesTraversees);
    }
    // ── 4. Inter-plans : réseau fourni ──
    {
      const w = bac({});
      const pf = w.Pathfinder;
      const r1 = pf.computeRouteOnRoads([A, B], [droite, detour],
        { allowedTypes: ["principal"], zones: [zone(type)] });
      t(type + " inter-plans : évitée si un autre chemin existe", Math.round(r1.totalDistance) === 400 &&
        r1.zonesTraversees.length === 0);
      const r2 = pf.computeRouteOnRoads([A, B], [droite], { allowedTypes: ["principal"], zones: [zone(type)],
        respecterInaccessibles: false });
      t(type + " inter-plans : seul chemin → traversée et rendue, distance vraie",
        Math.round(r2.totalDistance) === 200 &&
        r2.zonesTraversees.length === 1);
    }
  }

  // ── 5. Inaccessible reste dure ── (galerie en 4 segments : les bouts restent au graphe, le milieu sort)
  const droite4 = R("rd_droit4", "principal", [[0, 0], [50, 0], [100, 0], [150, 0], [200, 0]]);
  {
    const w = bac({ roads: [droite4], zones: [zone("inaccessible")] });
    const r = await route(w);
    t("inaccessible seul chemin : aucun chemin (NO_PATH)", r.erreur === "NO_PATH", r.erreur || r.totalDistance);
    const r2 = await route(w, { respecterInaccessibles: false });
    t("inaccessible : levée par la case, comme avant", !r2.erreur && Math.round(r2.totalDistance) === 200);
    let ko2 = null;
    try {
      w.Pathfinder.computeRouteOnRoads([A, B], [droite4],
        { allowedTypes: ["principal"], zones: [zone("inaccessible")] });
    }
    catch (e) { ko2 = e.code; }
    t("inaccessible inter-plans : toujours dure", ko2 === "NO_PATH", ko2);
  }

  // ── 6. Sans zone à coût : coût = distance, chemin inchangé ──
  {
    const w = bac({ roads: [droite, detour], zones: [zone("eau")] });
    const r = await route(w);
    t("sans zone à coût : droite prise, coût = distance au bit près", !r.erreur && r.cout === r.totalDistance &&
      Math.round(r.totalDistance) === 200 && r.zonesTraversees.length === 0);
  }

  // ── 7. Multi-niveau : une zone d'un autre niveau ne coûte rien ; calques comptés ──
  {
    const d0 = R("rd_d0", "principal", [[0, 0], [200, 0]], { level: 0 });
    const t0 = R("rd_t0", "principal", [[0, 0], [0, 100], [200, 100], [200, 0]], { level: 0 });
    const z1 = zone("remblais", { level: 1 });
    const w = bac({ roads: [d0, t0], zones: [z1] }, { multiLevel: true });
    let r;
    try { r = await w.Pathfinder.computeRoute([Object.assign({ level: 0 }, A), Object.assign({ level: 0 }, B)],
      { allowedTypes: ["principal"] }); } catch (e) { r = { erreur: e.code }; }
    t("multi-niveau : Comblé du niveau 1 ne détourne pas le niveau 0",
      !r.erreur && Math.round(r.totalDistance) === 200 &&
      r.zonesTraversees.length === 0, r.erreur || r.totalDistance);
    const w2 = bac({ roads: [droite, detour], calques: [zone("remblais")] });
    const r2 = await route(w2);
    t("Comblé d'un calque de données : évité aussi", !r2.erreur && Math.round(r2.totalDistance) === 400);
  }

  // ── 8. Vérifier le plan : C12 « à revoir », jamais bloquant ──
  {
    const w = bac({ roads: [droite, detour], zones: [zone("remblais"), zone("effondrement", { uid: "zn_eff2",
      points: [P(0, 40), P(20, 40), P(20, 60), P(0, 60)] })] });
    const l = w.KtaVerifierPlan.analyser().liste;
    const c12 = l.filter(c => c.controle === "C12");
    t("C12 : tracé à travers un Comblé → signalé", c12.some(c => c.objet.uid === "rd_droit" &&
      c.autre.uid === "zn_remblais"), c12.map(c => c.cle));
    t("C12 : tracé à travers un effondrement → signalé", c12.some(c => c.objet.uid === "rd_detour" &&
      c.autre.uid === "zn_eff2"), c12.map(c => c.cle));
    t("C12 : rangé en « revoir », jamais en bloquant", c12.length === 2 && c12.every(c => c.gravite === "revoir"));
    t("C12 : longueur dans la zone = 40 px", c12.some(c => Math.abs(c.longueurPx - 40) < 0.01));
    t("aucun C1 pour une zone à coût", l.filter(c => c.controle === "C1").length === 0, l.map(c => c.cle));
    t("C12 : clé = C12|uid du tracé|uid de la zone", c12.some(c => c.cle === "C12|rd_droit|zn_remblais"));
    t("C12 : même mesure que le graphe (zonesCoutDe = forme du graphe)",
      w.Pathfinder.controle.zonesCoutDe([zone("remblais"), zone("eau")]).length === 1);
  }

  console.log(ko ? "\n❌ check-zones-cout : " + ko + " échec(s)" : "\n✅ check-zones-cout : zones à coût conformes");
  process.exit(ko ? 1 : 0);
})();
