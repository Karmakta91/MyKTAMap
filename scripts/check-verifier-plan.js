#!/usr/bin/env node
/*
 * MyKTAMap — check-verifier-plan.js
 * Garde-fou BLOQUANT de « Vérifier le plan » (js/verifierPlan.js) : CHARGE pathfinder.js, poiJonction.js et
 * verifierPlan.js dans un bac à sable, sur des données FICTIVES en mémoire (aucune donnée de data/ ici).
 *
 * 🔒 Ce qu'il garantit d'abord : l'outil et l'itinéraire disent la même chose. Pour chaque tracé, les segments que
 * C1 déclare coupés sont exactement ceux que le graphe de l'itinéraire écarte (Pathfinder.grapheDeTraces avec les
 * obstacles) ; sinon l'outil annonce une coupure que l'itinéraire n'a pas, ou en tait une.
 * Puis : cas positifs et négatifs de C1 (zone dure, zone souple, mur en ligne, pilier, niveaux, « au bord »), C2
 * (raccord manquant, perdu, puits d'aération, plan à un niveau), C3 (même niveau, bout en l'air), « vu, normal »,
 * table unique des types de zone durs (aucun test `"inaccessible"` écrit à part dans l'itinéraire).
 *
 * Usage : node scripts/check-verifier-plan.js   (exit 1 si un contrôle échoue)
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

const ECHELLE = 4;   // px/m : 0,5 m = 2 px
const P = (x, y) => ({ x: x, y: y });
const R = (uid, type, pts, extra) => Object.assign({ uid: uid, type: type, points: pts.map(p => P(p[0], p[1])) },
  extra || {});

// Bac à sable : les vrais modules, les données passées en globales comme la carte les expose.
function bac(d, cfg) {
  const win = {
    console: { log() {}, warn() {}, error() {} },
    APP_CONFIG: Object.assign({ scale: ECHELLE, multiLevel: false, imageHeight: 1000 }, cfg || {}),
    I18n: { t: (k, p) => k + (p ? JSON.stringify(p) : "") },
    getRoads: () => d.roads || [],
    getAllEmbeddedRoads: () => [],
    getZones: () => d.zones || [],
    getStructures: () => d.structures || [],
    getEditorPoints: () => d.points || [],
    getAllEmbeddedPoints: () => [],
    getProfondeurNiveau: () => null,
    _ktaDataPolygons: [],
    _ktaDataStructurePolygons: [],
    _vus: [],
    getPlanVerifVus: function () { return win._vus.slice(); },
    setPlanVerifVus: function (_p, l) { win._vus = l.slice(); return true; },
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
const analyse = (w) => w.KtaVerifierPlan.analyser();
const de = (l, ctl) => l.filter(c => c.controle === ctl);

// ── 1. Table unique des types durs ──
{
  const pf = lire("js/pathfinder.js"), ipr = lire("js/interPlanRoute.js");
  t("pathfinder.js : aucun test `=== \"inaccessible\"` / `!== \"inaccessible\"` hors de TYPES_ZONES_DURS",
    !/[!=]==\s*"inaccessible"/.test(pf));
  t("interPlanRoute.js : les évitements excluent les types durs par Pathfinder.estZoneDure",
    !/[!=]==\s*"inaccessible"/.test(ipr) && /estZoneDure/.test(ipr));
  const w = bac({});
  t("Pathfinder.TYPES_ZONES_DURS = [inaccessible] (Comblé pas encore dur)",
    JSON.stringify(w.Pathfinder.TYPES_ZONES_DURS) === JSON.stringify(["inaccessible"]));
  t("estZoneDure : inaccessible oui, remblais / eau non", w.Pathfinder.estZoneDure("inaccessible") &&
    !w.Pathfinder.estZoneDure("remblais") && !w.Pathfinder.estZoneDure("eau"));
  const C = w.Pathfinder.controle;
  t("Pathfinder.controle exposé (obstaclesDe, preparer, zonesQuiBloquent, mursQuiCoupent, PROXIMITY_TOLERANCE 15)",
    !!C && typeof C.obstaclesDe === "function" && typeof C.zonesQuiBloquent === "function" &&
    typeof C.mursQuiCoupent === "function" && C.PROXIMITY_TOLERANCE === 15);
}

// ── 2. C1 : tracé coupé par un obstacle dur ──
const zoneInacc = R("zn_dur", "inaccessible", [[100, -20], [140, -20], [140, 20], [100, 20]]);
const zoneEau = R("zn_eau", "eau", [[300, -20], [340, -20], [340, 20], [300, 20]]);
const mur = R("st_mur", "mur-ligne", [[500, -30], [500, 30]]);
const pilier = R("st_pil", "pilier", [[700, -10], [710, -10], [710, 10], [700, 10]]);
const roads = [
  R("rd_coupe", "principal", [[0, 0], [80, 0], [200, 0], [260, 0]]),       // traverse la zone dure sur 40 px
  R("rd_eau", "principal", [[280, 0], [360, 0]]),                          // zone souple : rien
  R("rd_bord", "secondaire", [[60, 40], [101, 40], [101.5, 18.5]]),        // bout 1,5 px dans la zone : au bord
  R("rd_mur", "principal", [[450, 0], [550, 0]]),                          // croise le mur au milieu
  R("rd_murbout", "chemin", [[420, 10], [501, 10]]),                       // dépasse le mur de 1 px : au bord
  R("rd_pilier", "principal", [[650, 0], [760, 0]]),                       // pilier : pas un obstacle
  R("rd_libre", "principal", [[0, 100], [800, 100]])                       // rien sur son chemin
];
{
  const w = bac({ roads: roads, zones: [zoneInacc, zoneEau], structures: [mur, pilier] });
  const l = de(analyse(w).liste, "C1");
  const par = uid => l.filter(c => c.objet.uid === uid);
  const c = par("rd_coupe")[0];
  t("C1 : tracé qui traverse une zone inaccessible → signalé, zone nommée", !!c && c.autre.uid === "zn_dur" &&
    c.motif === "zone" && c.gravite === "bloquant", l.map(x => x.cle));
  t("C1 : longueur dans la zone = 40 px (10 m), pas « au bord »", !!c && Math.abs(c.longueurPx - 40) < 0.01 &&
    !c.auBord, c && c.longueurPx);
  t("C1 : zone souple (eau) → rien", par("rd_eau").length === 0);
  const b = par("rd_bord")[0];
  t("C1 : bout de tracé 1,5 px dans la zone (< 0,5 m) → signalé « au bord »", !!b && b.auBord, b && b.longueurPx);
  const m = par("rd_mur")[0];
  t("C1 : tracé qui croise un mur en ligne → signalé, pas au bord", !!m && m.motif === "mur" &&
    m.autre.uid === "st_mur" && !m.auBord);
  const mb = par("rd_murbout")[0];
  t("C1 : tracé qui dépasse le mur de 1 px → « au bord »", !!mb && mb.auBord);
  t("C1 : pilier (structure non bloquante) → rien", par("rd_pilier").length === 0);
  t("C1 : tracé libre → rien", par("rd_libre").length === 0);
  t("C1 : un constat par paire (tracé, obstacle)", l.length === 4, l.map(x => x.cle));
  t("C1 : clé = C1|uid du tracé|uid de l'obstacle", !!c && c.cle === "C1|rd_coupe|zn_dur");

  // 🔒 Mêmes segments que le graphe : segments écartés par grapheDeTraces(includeZones) = segments coupés par C1.
  const C = w.Pathfinder.controle;
  const prep = C.preparer(C.obstaclesDe([zoneInacc, zoneEau], [mur, pilier]));
  let accord = true;
  const detail = [];
  roads.forEach(function (r) {
    const g = w.Pathfinder.grapheDeTraces([r], { includeZones: true, allowedTypes: ["principal", "secondaire",
      "chemin"] });
    const ecartesGraphe = (r.points.length - 1) - g.segments.filter(s => s.road === r).length;
    let coupesC1 = 0;
    for (let i = 1; i < r.points.length; i++) {
      const p1 = r.points[i - 1], p2 = r.points[i];
      if (C.zonesQuiBloquent(p1, p2, 0, prep.polys).length || C.mursQuiCoupent(p1, p2, 0, prep.grille).length) {
        coupesC1++;
      }
    }
    const signale = l.some(x => x.objet === r);
    if (ecartesGraphe !== coupesC1 || signale !== (coupesC1 > 0)) {
      accord = false;
      detail.push({ uid: r.uid, graphe: ecartesGraphe, c1: coupesC1, signale: signale });
    }
  });
  t("🔒 C1 = graphe : chaque segment déclaré coupé est écarté par l'itinéraire, et seulement lui", accord, detail);
}

// ── 3. C1 sur plusieurs niveaux ──
{
  const zN1 = R("zn_n1", "inaccessible", [[100, -20], [140, -20], [140, 20], [100, 20]], { level: 1 });
  const zN01 = R("zn_n01", "inaccessible", [[300, -20], [340, -20], [340, 20], [300, 20]],
    { level: 1, niveaux: [0, 1] });
  const murN1 = R("st_mur1", "mur-ligne", [[500, -30], [500, 30]], { level: 1 });
  const rs = [
    R("rd_n0a", "principal", [[0, 0], [200, 0]], { level: 0 }),
    R("rd_n0b", "principal", [[260, 0], [380, 0]], { level: 0 }),
    R("rd_n0c", "principal", [[450, 0], [550, 0]], { level: 0 }),
    R("rd_n1c", "principal", [[450, 5], [550, 5]], { level: 1 })
  ];
  const w = bac({ roads: rs, zones: [zN1, zN01], structures: [murN1] }, { multiLevel: true });
  const l = de(analyse(w).liste, "C1");
  const uids = l.map(c => c.objet.uid + ">" + c.autre.uid).sort();
  t("C1 multi-niveau : zone du niveau 1 ne coupe pas le niveau 0", uids.indexOf("rd_n0a>zn_n1") < 0, uids);
  t("C1 multi-niveau : zone sur les niveaux 0 et 1 coupe le niveau 0", uids.indexOf("rd_n0b>zn_n01") >= 0, uids);
  t("C1 multi-niveau : mur du niveau 1 coupe le niveau 1 seulement",
    uids.indexOf("rd_n1c>st_mur1") >= 0 && uids.indexOf("rd_n0c>st_mur1") < 0, uids);
  const c = l.find(x => x.objet.uid === "rd_n1c");
  t("C1 multi-niveau : niveau du constat = niveau du tracé", !!c && c.niveau === 1);
}

// ── 4. C2 : passage entre niveaux sans raccord validé ──
{
  const gal0 = R("rd_g0", "principal", [[0, 0], [200, 0]], { level: 0 });
  const gal1 = R("rd_g1", "principal", [[0, 50], [200, 50]], { level: 1 });
  const gal2 = R("rd_g2", "principal", [[0, 100], [200, 100]], { level: 2 });
  const pt = (uid, tag, x, niveaux, acc) => ({ uid: uid, id: uid, nom: uid, tags: [tag], x: x, y: 35, level: niveaux[0],
    niveaux: niveaux, accroches: acc });
  const pts = [
    pt("pt_ok", "jes", 20, [0, 1], [{ level: 0, x: 20, y: 0 }, { level: 1, x: 20, y: 50 }]),
    pt("pt_manque", "jpe", 60, [0, 1], [{ level: 0, x: 60, y: 0 }]),
    pt("pt_perdu", "jes", 100, [0, 1], [{ level: 0, x: 100, y: 0 }, { level: 1, x: 100, y: 80 }]),
    pt("pt_aer", "pa", 140, [0, 1], []),
    pt("pt_mid", "jpe", 180, [0, 1, 2], [{ level: 0, x: 180, y: 0 }, { level: 2, x: 180, y: 100 }])
  ];
  const w = bac({ roads: [gal0, gal1, gal2], points: pts }, { multiLevel: true });
  const l = de(analyse(w).liste, "C2");
  const k = l.map(c => c.objet.uid + "@" + c.niveau + ":" + c.motif).sort();
  t("C2 : raccords validés à chaque niveau → rien", !k.some(x => x.indexOf("pt_ok") === 0), k);
  t("C2 : niveau 1 sans raccord → signalé (aucun)", k.indexOf("pt_manque@1:aucun") >= 0, k);
  t("C2 : raccord du niveau 1 à 30 px de toute galerie (> 15 px) → signalé (perdu)",
    k.indexOf("pt_perdu@1:perdu") >= 0, k);
  t("C2 : puits d'aération (aucun moyen de passage) → rien", !k.some(x => x.indexOf("pt_aer") === 0), k);
  const mid = l.find(c => c.objet.uid === "pt_mid");
  t("C2 : niveau intermédiaire sans raccord → signalé, marqué « traversé », gravité info", !!mid && mid.niveau === 1 &&
    mid.intermediaire === true && mid.gravite === "info", mid && mid.gravite);
  const manque = l.find(c => c.cle === "C2|pt_manque|1"), perdu = l.find(c => c.cle === "C2|pt_perdu|1");
  t("C2 : niveau de départ ou d'arrivée sans raccord (ou raccord perdu) → bloquant",
    !!manque && manque.gravite === "bloquant" && !!perdu && perdu.gravite === "bloquant");
  const ordre = analyse(w).liste.map(c => c.gravite);
  t("liste triée par gravité : bloquant avant info", ordre.lastIndexOf("bloquant") < ordre.indexOf("info"), ordre);
  t("C2 : galeries proches comptées pour la proposition", !!l.find(c => c.objet.uid === "pt_manque" &&
    c.proposes >= 1));
  t("C2 : clé = C2|uid|niveau", l.some(c => c.cle === "C2|pt_manque|1"));
  const w1 = bac({ roads: [gal0, gal1], points: pts }, { multiLevel: false });
  t("C2 : plan à un seul niveau → rien", de(analyse(w1).liste, "C2").length === 0);
}

// ── 5. C3 : tracé jonction mal posé ──
{
  const gal0 = R("rd_h0", "principal", [[0, 0], [200, 0]], { level: 0 });
  const gal1 = R("rd_h1", "principal", [[0, 50], [200, 50]], { level: 1 });
  const J = (uid, pts, a, b) => R(uid, "jonction", pts, { fromLevel: a, toLevel: b });
  const rs = [gal0, gal1,
    J("rd_j_ok", [[20, 0], [20, 50]], 0, 1),
    J("rd_j_meme", [[60, 0], [60, 50]], 0, 0),
    J("rd_j_bout", [[100, 0], [100, 80]], 0, 1),          // bout au niveau 1 à 30 px de la galerie
    J("rd_j_tol", [[140, 0], [140, 64]], 0, 1)            // bout à 14 px : dans la tolérance
  ];
  const w = bac({ roads: rs }, { multiLevel: true });
  const l = de(analyse(w).liste, "C3");
  const k = l.map(c => c.objet.uid + ":" + c.motif + (c.bout !== undefined ? c.bout : "")).sort();
  t("C3 : jonction bien posée → rien", !k.some(x => x.indexOf("rd_j_ok") === 0), k);
  t("C3 : même niveau aux deux bouts → signalé", k.indexOf("rd_j_meme:meme") >= 0, k);
  t("C3 : bout à 30 px de toute galerie de son niveau → signalé (bout 1)", k.indexOf("rd_j_bout:bout1") >= 0, k);
  t("C3 : bout à 14 px (≤ tolérance du pathfinder, 15 px) → rien", !k.some(x => x.indexOf("rd_j_tol") === 0), k);
  t("C3 : jonctions jamais signalées par C1 ni C2", de(analyse(w).liste, "C1").length === 0);
}

// ── 6. « Vu, normal » ──
{
  const w = bac({ roads: roads, zones: [zoneInacc], structures: [] });
  const V = w.KtaVerifierPlan;
  const avant = analyse(w);
  const c = avant.liste.find(x => x.cle === "C1|rd_coupe|zn_dur");
  V.marquerVu(c);
  const apres = analyse(w);
  t("vu, normal : le constat quitte la liste et passe dans les vus",
    !apres.liste.some(x => x.cle === c.cle) && apres.vus.some(x => x.cle === c.cle));
  zoneInacc.points[0].x -= 2;
  const modif = analyse(w);
  t("vu, normal : modifier la zone (même uid) ne fait pas revenir le constat", !modif.liste.some(x => x.cle === c.cle));
  zoneInacc.points[0].x += 2;
  V.retablir(c.cle);
  t("vu, normal : Rétablir le remet dans la liste", analyse(w).liste.some(x => x.cle === c.cle));
  const sansUid = R(undefined, "inaccessible", [[100, -20], [140, -20], [140, 20], [100, 20]]);
  delete sansUid.uid;
  const w2 = bac({ roads: roads, zones: [sansUid] });
  const k1 = analyse(w2).liste.map(x => x.cle), k2 = analyse(w2).liste.map(x => x.cle);
  t("objet sans uid : identité = empreinte de la géométrie, stable", k1.length > 0 && k1.join() === k2.join() &&
    k1.every(x => /\|g[0-9a-z]+$/.test(x)), k1);
}

console.log("");
if (ko) {
  console.log("❌ check-verifier-plan : " + ko + " contrôle(s) en échec");
  process.exit(1);
}
console.log("🎉 check-verifier-plan : C1 = graphe de l'itinéraire, C1 à C3 positifs et négatifs, « vu, normal » tenu");
