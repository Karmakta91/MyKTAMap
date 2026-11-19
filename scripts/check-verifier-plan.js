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
 * table unique des types de zone durs (aucun test `"inaccessible"` écrit à part dans l'itinéraire) ; C4 (piliers
 * posés comme la détection, deux fois ; morceaux d'un ✂️ jamais en double ; doublons d'un calque : couche Leaflet
 * cyclique et champs d'affichage du registre, sans plantage), C5 (KtaRaccords, « vu » = Ignorer), C6
 * (pilier qui se recoupe, contour dégénéré, grand contour en temps borné), C7, C8 (zone sur plusieurs niveaux), C9,
 * C10 (dédoublonnage de tableEditor.js, compte seul), C11 (compte des liaisons vers un plan absent).
 * 🔒 Falsification : chaque contrôle C4 à C10 est rejoué sur une copie de verifierPlan.js où sa règle est cassée ;
 * le cas positif doit disparaître (sinon le test ne prouve rien). Un motif de mutation introuvable échoue aussi.
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

// Bac à sable : les vrais modules, les données passées en globales comme la carte les expose. `extra` : globales en
// plus ; `mutation` : [motif, remplacement] appliqué à verifierPlan.js (falsification).
const POLYLIGNES = JSON.parse(/STRUCTURE_TYPES_POLYLINE\s*=\s*(\[[^\]]*\])/.exec(lire("js/structures.js"))[1]);
function bac(d, cfg, extra, mutation) {
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
    isStructurePolylineType: t => POLYLIGNES.indexOf(t) >= 0,
    _ktaDataPolygons: [],
    _ktaDataStructurePolygons: [],
    _vus: [],
    _ign: [],
    getPlanVerifVus: function () { return win._vus.slice(); },
    setPlanVerifVus: function (_p, l) { win._vus = l.slice(); return true; },
    getPlanRaccordsIgnores: function () { return win._ign.slice(); },
    setPlanRaccordsIgnores: function (_p, l) { win._ign = l.slice(); return true; },
    addEventListener() {},
    document: { addEventListener() {}, getElementById: () => null },
    ktaEsc: s => String(s),
    ktaIcone: () => ""
  };
  Object.assign(win, extra || {});
  win.window = win;
  const ctx = vm.createContext(win);
  ["js/poiJonction.js", "js/pathfinder.js", "js/styleResolver.js", "js/tableEditor.js", "js/raccordsTraces.js",
    "js/verifierPlan.js"].forEach(function (f) {
    let src = lire(f);
    if (mutation && f === "js/verifierPlan.js") {
      if (src.indexOf(mutation[0]) < 0) throw new Error("motif de mutation introuvable : " + mutation[0]);
      src = src.split(mutation[0]).join(mutation[1]);
    }
    vm.runInContext("var window = this;" + src, ctx);
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

// ── 3 bis. « Galerie volontairement condamnée » (`condamne: true` sur la zone ou le mur en ligne) ──
// Même paire tracé / obstacle : C1 la signale sans le champ, se tait avec ; l'itinéraire la refuse dans les deux cas
// (le champ ne change rien au graphe). `mutation` : falsification sur verifierPlan.js.
function casCondamne(condamne, mutation) {
  const z = R("zn_cond", "inaccessible", [[100, -20], [140, -20], [140, 20], [100, 20]]);
  const m = R("st_cond", "mur-ligne", [[500, -30], [500, 30]]);
  if (condamne) { z.condamne = true; m.condamne = true; }
  const rz = R("rd_cz", "principal", [[0, 0], [260, 0]]), rm = R("rd_cm", "principal", [[450, 0], [550, 0]]);
  const w = bac({ roads: [rz, rm], zones: [z], structures: [m] }, null, null, mutation);
  const cles = de(analyse(w).liste, "C1").map(c => c.cle).sort();
  const C = w.Pathfinder.controle, prep = C.preparer(C.obstaclesDuPlan());
  const bloque = C.zonesQuiBloquent(rz.points[0], rz.points[1], 0, prep.polys).length === 1 &&
    C.mursQuiCoupent(rm.points[0], rm.points[1], 0, prep.grille).length === 1;
  const g = w.Pathfinder.grapheDeTraces([rz, rm], { includeZones: true });
  return { cles: cles, bloque: bloque, segments: g.segments.length };
}
{
  const sans = casCondamne(false), avec = casCondamne(true);
  t("condamnée : sans le champ, C1 signale tracé / zone et tracé / mur en ligne",
    sans.cles.join() === "C1|rd_cm|st_cond,C1|rd_cz|zn_cond", sans.cles);
  t("condamnée : avec `condamne: true`, C1 ne les signale plus", avec.cles.length === 0, avec.cles);
  t("condamnée : l'itinéraire refuse les deux segments dans les deux cas (Pathfinder.controle, graphe sans segment)",
    sans.bloque && avec.bloque && sans.segments === 0 && avec.segments === 0, { sans: sans, avec: avec });
  const casse = casCondamne(true, ["      .filter(function (e) { return !(e.autre && e.autre.condamne === true); });",
    ";"]);
  t("🔒 falsification condamnée : sans le filtre de _c1, les deux paires reviennent", casse.cles.length === 2,
    casse.cles);
  const comble = R("zn_comble", "remblais", [[100, -20], [140, -20], [140, 20], [100, 20]], { condamne: true });
  const wc = bac({ roads: [R("rd_cc", "principal", [[0, 0], [260, 0]])], zones: [comble] });
  t("condamnée : le champ ne vaut que pour C1 — une zone Comblé qui le porte reste signalée en C12",
    de(analyse(wc).liste, "C12").length === 1, de(analyse(wc).liste, "C12").map(c => c.cle));
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
  const k1 = de(analyse(w2).liste, "C1").map(x => x.cle), k2 = de(analyse(w2).liste, "C1").map(x => x.cle);
  t("objet sans uid : identité = empreinte de la géométrie, stable", k1.length > 0 && k1.join() === k2.join() &&
    k1.every(x => /\|g[0-9a-z]+$/.test(x)), k1);
}

// ── 7. C4 : objets en double ──
// Piliers posés comme detectionStructures.js > _valider : { type, points, level?, uid "st_…", updatedAt }.
const carre = (x, y, c) => [[x, y], [x + c, y], [x + c, y + c], [x, y + c]];
const pilierDet = (uid, pts, extra) => R(uid, "pilier-1", pts, Object.assign({ updatedAt: 1000 }, extra || {}));
function casC4() {
  const rd0 = R("rd_couper", "principal", [[0, 300], [10, 300], [20, 305], [30, 305]]);
  // ✂️ au sommet 2, comme ajusterSommets.js > _couper : le second morceau commence au sommet coupé, dupliqué.
  const rd1 = R("rd_couper2", "principal", rd0.points.slice(2).map(p => [p.x, p.y]));
  rd0.points.splice(3);
  const fr0 = R("st_front", "front-1", [[0, 400], [10, 400], [20, 410], [30, 410]]);
  const fr1 = R("st_front2", "front-1", fr0.points.slice(1).map(p => [p.x, p.y]));
  fr0.points.splice(2);
  const tourne = carre(200, 0, 10).slice(2).concat(carre(200, 0, 10).slice(0, 2)).reverse();
  return {
    structures: [
      pilierDet("st_d1", carre(0, 0, 10)), pilierDet("st_d2", carre(0, 0, 10), { updatedAt: 2000 }),   // 2 passes
      pilierDet("st_r1", carre(200, 0, 10)), pilierDet("st_r2", tourne),                              // départ, sens
      pilierDet("st_cm1", carre(400, 0, 10)), pilierDet("st_cm2", carre(400.01, 0, 10)),               // < 1 cm
      pilierDet("st_px1", carre(600, 0, 10)), pilierDet("st_px2", carre(601, 0, 10)),                  // 25 cm
      pilierDet("st_ty1", carre(800, 0, 10)), R("st_ty2", "pilier-2", carre(800, 0, 10)),           // autre type
      fr0, fr1
    ],
    roads: [rd0, rd1],
    points: [
      { uid: "pt_a", id: "a", nom: "Puits", tags: ["jes"], x: 50, y: 50 },
      { uid: "pt_b", id: "b", nom: "Puits", tags: ["jes"], x: 50, y: 50 },
      { uid: "pt_c", id: "c", nom: "Autre", tags: ["jes"], x: 50, y: 50 }
    ]
  };
}
{
  const w = bac(casC4());
  const l = de(analyse(w).liste, "C4");
  const k = l.map(c => c.cle);
  const d12 = l.find(c => c.cle === "C4|st_d1|st_d2");
  t("C4 : deux passes de détection sur le même pilier → un constat, « identiques en tout », à revoir",
    !!d12 && d12.identiques && d12.copies === 2 && d12.motif === "identiques" && d12.gravite === "revoir", k);
  const r12 = l.find(c => c.cle === "C4|st_r1|st_r2");
  t("C4 : même contour, autre départ et autre sens → en double, mais pas identiques en tout",
    !!r12 && !r12.identiques && r12.motif === "differents", k);
  t("C4 : écart de 0,01 px (< 1 cm à 4 px/m) → en double", k.indexOf("C4|st_cm1|st_cm2") >= 0, k);
  t("C4 : décalé de 1 px (25 cm) → rien", !k.some(x => /st_px/.test(x)), k);
  t("C4 : même géométrie, autre type → rien", !k.some(x => /st_ty/.test(x)), k);
  t("C4 : points même position, même tag, même nom → en double ; nom différent → hors du groupe",
    k.indexOf("C4|pt_a|pt_b") >= 0 && !k.some(x => /pt_c/.test(x)), k);
  t("C4 : les deux morceaux d'un ✂️ (tracé, front) ne sont jamais en double", !k.some(x => /couper|front/.test(x)), k);
  t("C10 : les morceaux d'un ✂️ n'ont aucun sommet en double",
    !de(analyse(w).liste, "C10").some(c => /couper|front/.test(c.cle)));
  const wm = bac({ structures: [pilierDet("st_n0", carre(0, 0, 10), { level: 0 }), pilierDet("st_n1", carre(0, 0, 10),
    { level: 1 })] }, { multiLevel: true, availableLevels: [0, 1] });
  t("C4 : même pilier sur deux niveaux → rien", de(analyse(wm).liste, "C4").length === 0);
}

// ── 7 bis. C4 dans un calque : entrées des registres (couche Leaflet cyclique, champs d'affichage) ──
// Entrées comme utils.js les pousse dans _ktaDataStructurePolygons : `polygon` = la couche (cyclique par _map),
// origOpacity / origFillOpacity. `variante` : "base" (mêmes champs d'affichage), "opacite" (origOpacity différente :
// identiques grâce à la liste HORS_COMPARAISON seule), "cycle" (objet simple cyclique hors liste : seule la garde
// des cycles l'empêche de planter), "classe" (instance de classe hors liste, état interne différent : seule la
// restriction aux objets simples les rend identiques).
function Couche(id, carte) { this._leaflet_id = id; this._map = carte; }
function casC4Calque(variante) {
  const carte = { _layers: {} };
  const entree = function (uid, n) {
    const couche = new Couche(n, carte);
    carte._layers[n] = couche;
    const e = { polygon: couche, layerId: "calque-a", type: "pilier-1", points: carre(0, 0, 10).map(p => P(p[0], p[1])),
      level: 0, uid: uid, updatedAt: 1000, origOpacity: variante === "opacite" ? n / 10 : 1, origFillOpacity: 0.85 };
    if (variante === "cycle") { const m = { nom: "meta" }; m.soi = m; e.meta = m; }
    if (variante === "classe") e.rendu = new Couche(100 + n, carte);
    return e;
  };
  return [entree("st_ca", 1), entree("st_cb", 2)];
}
function c4Calque(variante, mutation) {
  const w = bac({}, null, { _ktaDataStructurePolygons: casC4Calque(variante) }, mutation);
  return de(analyse(w).liste, "C4").find(c => c.cle === "C4|st_ca|st_cb");
}
{
  ["base", "opacite", "cycle", "classe"].forEach(function (v) {
    let c = null, err;
    try { c = c4Calque(v); } catch (e) { err = e.message; }
    t("C4 calque (" + v + ") : analyser() ne plante pas, les deux copies sont « identiques en tout »",
      !!c && c.identiques === true, err || (c && c.motif));
  });
  const PARADES = [
    { nom: "liste HORS_COMPARAISON (champs d'affichage)", v: "opacite",
      m: ["polygon: 1, origOpacity: 1, origFillOpacity: 1 };", "polygon: 1 };"] },
    { nom: "garde des cycles", v: "cycle", m: ["if (vus.has(v)) return '\"~cycle\"';", "/* sans garde */"] },
    { nom: "objets simples seulement", v: "classe",
      m: ["if (!Array.isArray(v) && !_simple(v)) return '\"~objet\"';", "/* tout objet */"] },
    { nom: "garde générale entière", v: "cycle",
      m: ["const vus = chemin || new WeakSet();", "const vus = { has() { return false; }, add() {}, delete() {} };" +
        " const _simple = function () { return true; };"] }
  ];
  PARADES.forEach(function (x) {
    let casse = false, err = null;
    try { const c = c4Calque(x.v, x.m); casse = !c || c.identiques !== true; } catch (e) { casse = true; err = e.message; }
    t("🔒 falsification C4 calque (" + x.nom + ") : sans elle, le cas « " + x.v + " » tombe", casse, err);
  });
}

// ── 8. C6 : contour fermé dégénéré ou qui se recoupe ──
function casC6() {
  return {
    zones: [
      R("zn_ok", "eau", carre(0, 0, 20)),
      R("zn_l", "eau", [[100, 0], [140, 0], [140, 10], [110, 10], [110, 40], [100, 40]]),     // en L : concave
      R("zn_clos", "eau", carre(200, 0, 20).concat([[200, 0]])),                            // fermeture écrite
      R("zn_deux", "eau", [[300, 0], [310, 0], [300, 0], [310, 0]]),                         // 2 sommets distincts
      R("zn_ligne", "eau", [[400, 0], [405, 0], [410, 0]])                                   // alignés : aire nulle
    ],
    structures: [
      pilierDet("st_noeud", [[0, 100], [10, 110], [10, 100], [0, 110]]),                        // en nœud papillon
      pilierDet("st_carre", carre(50, 100, 10)),
      R("st_zig", "front-1", [[0, 200], [10, 210], [10, 200], [0, 210]])                     // ligne : pas un contour
    ]
  };
}
{
  const w = bac(casC6());
  const l = de(analyse(w).liste, "C6");
  const par = uid => l.find(c => c.objet.uid === uid);
  const n = par("st_noeud");
  t("C6 : pilier détecté qui se recoupe (nœud papillon) → « recoupe », croisement au centre",
    !!n && n.motif === "recoupe" && Math.abs(n.ancre.x - 5) < 1e-6 && Math.abs(n.ancre.y - 105) < 1e-6,
    l.map(c => c.cle + ":" + c.motif));
  t("C6 : zone à deux sommets distincts → « dégénéré »", !!par("zn_deux") && par("zn_deux").motif === "degenere");
  t("C6 : zone aux sommets alignés (aire nulle) → « dégénéré »",
    !!par("zn_ligne") && par("zn_ligne").motif === "degenere");
  t("C6 : carré, contour en L, fermeture écrite (dernier = premier), pilier carré → rien",
    !par("zn_ok") && !par("zn_l") && !par("zn_clos") && !par("st_carre"), l.map(c => c.cle));
  t("C6 : structure en ligne qui se croise (front) → rien", !par("st_zig"));
  t("C6 : gravité « à revoir »", l.every(c => c.gravite === "revoir"));
  // Grand contour : 20 000 sommets sur un cercle, en temps borné (balayage, pas de O(n²)).
  const cercle = [];
  for (let i = 0; i < 20000; i++) {
    cercle.push([5000 + 4000 * Math.cos(i * 2 * Math.PI / 20000), 5000 + 4000 * Math.sin(i * 2 * Math.PI / 20000)]);
  }
  const wc = bac({ zones: [R("zn_cercle", "eau", cercle)] });
  const t0 = Date.now();
  const lc = de(analyse(wc).liste, "C6");
  const ms = Date.now() - t0;
  t("C6 : contour de 20 000 sommets sans croisement → rien, en moins de 2 s (" + ms + " ms)", !lc.length && ms < 2000);
}

// ── 9. C7 : hors de l'image ──
function casC7() {
  return {
    roads: [R("rd_dedans", "principal", [[10, 10], [990, 990]]),
      R("rd_deborde", "principal", [[900, 10], [1010, 10]])],
    zones: [R("zn_dehors", "eau", carre(-200, -200, 50))],
    points: [{ uid: "pt_loin", id: "l", nom: "l", tags: ["jes"], x: -5, y: 500 },
      { uid: "pt_bord", id: "b", nom: "b", tags: ["jes"], x: -1, y: 500 }]
  };
}
{
  const w = bac(casC7(), { imageWidth: 1000, imageHeight: 1000 });
  const l = de(analyse(w).liste, "C7");
  const m = {};
  l.forEach(c => { m[c.objet.uid] = c.motif; });
  t("C7 : tracé dans l'image → rien", !m.rd_dedans, m);
  t("C7 : tracé qui dépasse de 10 px → « déborde »", m.rd_deborde === "deborde", m);
  t("C7 : zone entièrement dehors → « dehors »", m.zn_dehors === "dehors", m);
  t("C7 : point à 5 px du bord (> 0,5 m = 2 px) → signalé ; à 1 px → rien", m.pt_loin === "dehors" && !m.pt_bord, m);
  t("C7 : gravité « pour info »", l.every(c => c.gravite === "info"));
  t("C7 : dimensions de l'image inconnues → rien",
    de(analyse(bac(casC7(), { imageHeight: 0 })).liste, "C7").length === 0);
}

// ── 10. C8 : niveau inconnu ──
function casC8() {
  return {
    roads: [R("rd_n3", "principal", [[0, 0], [10, 0]], { level: 3 }),
      R("rd_txt", "principal", [[0, 10], [10, 10]], { level: "1" }),
      R("rd_ok", "principal", [[0, 20], [10, 20]], { level: 1 }),
      R("rd_j4", "jonction", [[0, 30], [0, 40]], { fromLevel: 0, toLevel: 4 })],
    zones: [R("zn_02", "eau", carre(100, 0, 10), { level: 0, niveaux: [0, 2] }),
      R("zn_01", "eau", carre(200, 0, 10), { level: 0, niveaux: [0, 1] })],
    points: [{ uid: "pt_j5", id: "j", nom: "j", tags: ["jpe"], x: 5, y: 5, level: 0, niveaux: [0, 5] },
      { uid: "pt_x7", id: "x", nom: "x", tags: ["sortie"], x: 5, y: 5, level: 0, niveaux: [7] }]
  };
}
{
  const w = bac(casC8(), { multiLevel: true, availableLevels: [-1, 0, 1] });
  const k = de(analyse(w).liste, "C8").map(c => c.cle + ":" + c.motif).sort();
  t("C8 : tracé au niveau 3 (absent du sélecteur) → « inconnu »", k.indexOf("C8|rd_n3|3:inconnu") >= 0, k);
  t("C8 : niveau écrit en texte (« 1 ») → « invalide »", k.indexOf("C8|rd_txt|1:invalide") >= 0, k);
  t("C8 : tracé jonction vers le niveau 4 → signalé pour 4", k.indexOf("C8|rd_j4|4:inconnu") >= 0, k);
  t("C8 : zone sur les niveaux 0 et 2 → signalée pour 2 seulement",
    k.indexOf("C8|zn_02|2:inconnu") >= 0 && !k.some(x => x.indexOf("C8|zn_02|0") === 0), k);
  t("C8 : passage entre niveaux 0 et 5 → signalé pour 5", k.indexOf("C8|pt_j5|5:inconnu") >= 0, k);
  t("C8 : objets sur des niveaux connus, `niveaux` d'un point qui ne relie pas de niveaux → rien",
    !k.some(x => /rd_ok|zn_01|pt_x7/.test(x)), k);
  t("C8 : gravité « à revoir »", de(analyse(w).liste, "C8").every(c => c.gravite === "revoir"));
  t("C8 : plan à un seul niveau → rien", de(analyse(bac(casC8(), { availableLevels: [0] })).liste, "C8").length === 0);
}

// ── 11. C9 : type absent de la légende ──
function casC9() {
  return {
    roads: [R("rd_faute", "principall", [[0, 0], [10, 0]]), R("rd_ok", "principal", [[0, 10], [10, 10]]),
      R("rd_cust", "cust-galerie", [[0, 20], [10, 20]]), R("rd_custz", "cust-zone", [[0, 30], [10, 30]]),
      { uid: "rd_sans", points: [P(0, 40), P(10, 40)] }],
    zones: [R("zn_faute", "eaux", carre(100, 0, 10)), R("zn_ok", "eau", carre(200, 0, 10))],
    structures: [pilierDet("st_ok", carre(300, 0, 10))],
    points: [{ uid: "pt_tag", id: "t", nom: "t", tags: ["xyz"], x: 5, y: 5 },
      { uid: "pt_ok", id: "o", nom: "o", tags: ["jes"], x: 5, y: 5 }]
  };
}
const LEGENDE = { findCustomEntry: id => ({ "cust-galerie": { id: id, category: "traces", lineColor: "#123456" },
  "cust-zone": { id: id, category: "zones", fillColor: "#654321" } })[id] || null };
{
  const w = bac(casC9(), null, { LegendCustomization: LEGENDE, _iconMap: { jes: {} } });
  const m = {};
  de(analyse(w).liste, "C9").forEach(c => { m[c.objet.uid] = c.motif; });
  t("C9 : tracé « principall », zone « eaux » → « absent »", m.rd_faute === "absent" && m.zn_faute === "absent", m);
  t("C9 : tracé sans type → « sansType »", m.rd_sans === "sansType", m);
  t("C9 : types built-in et type perso de la catégorie → rien", !m.rd_ok && !m.zn_ok && !m.st_ok && !m.rd_cust, m);
  t("C9 : type perso d'une AUTRE catégorie (zone sur un tracé) → « absent »", m.rd_custz === "absent", m);
  t("C9 : point dont le tag n'a pas d'icône → signalé ; tag connu → rien", m.pt_tag === "absent" && !m.pt_ok, m);
  t("C9 : gravité « pour info »", de(analyse(w).liste, "C9").every(c => c.gravite === "info"));
}

// ── 12. C10 : sommets en double (compte seul) ──
function casC10() {
  return {
    roads: [R("rd_dbl", "principal", [[0, 0], [10, 0], [10, 0], [20, 0]]),
      R("rd_nul", "principal", [[0, 10], [0, 10]]),
      R("rd_retour", "principal", [[0, 20], [10, 20], [0, 20]])],
    zones: [R("zn_dbl", "eau", [[100, 0], [110, 0], [110, 0], [110, 0], [110, 10], [100, 10]])]
  };
}
{
  const d = casC10();
  const avant = JSON.stringify(d);
  const w = bac(d);
  const m = {};
  de(analyse(w).liste, "C10").forEach(c => { m[c.objet.uid] = c; });
  t("C10 : tracé avec un sommet répété → 1 sommet en double", !!m.rd_dbl && m.rd_dbl.n === 1 && !m.rd_dbl.disparait);
  t("C10 : zone avec deux répétitions → 2", !!m.zn_dbl && m.zn_dbl.n === 2);
  t("C10 : tracé réduit à un point par le nettoyage → « disparaîtrait »", !!m.rd_nul && m.rd_nul.disparait);
  t("C10 : aller-retour (sommets égaux mais pas consécutifs) → rien", !m.rd_retour);
  t("C10 : gravité « pour info »", de(analyse(w).liste, "C10").every(c => c.gravite === "info"));
  t("C10 : compte seul, les données ne bougent pas", JSON.stringify(d) === avant);
}

// ── 13. C5 : écarts du réseau (KtaRaccords.detecter) ──
function casC5() {
  // Sommet INTÉRIEUR de rd_b à 4 px de rd_a (bouts à 40 px) : le graphe ne les joint pas (3 px), Raccords le voit.
  return { roads: [R("rd_a", "principal", [[0, 0], [100, 0]]), R("rd_b", "principal", [[20, 40], [50, 4], [80, 40]])] };
}
{
  const w = bac(casC5());
  const l = de(analyse(w).liste, "C5");
  t("C5 : sommet de tracé à 4 px d'une autre galerie (1 m) → un écart, à revoir",
    l.length === 1 && l[0].gravite === "revoir" && Math.abs(l[0].ecartPx - 4) < 1e-6, l.map(c => c.cle));
  t("C5 : même liste que la carte Raccords", l.length === w.KtaRaccords.detecter().liste.length);
  w.KtaVerifierPlan.marquerVu(l[0]);
  t("C5 : « Vu, normal » = Ignorer des Raccords (une seule mémoire)", de(analyse(w).liste, "C5").length === 0 &&
    w._ign.length === 1 && w._vus.length === 0 && w.KtaRaccords.detecter().liste.length === 0);
}

// ── 13 bis. C5 en cache : KtaRaccords.detecter seulement quand ce qu'il lit change ──
// `mutation` : [motif, remplacement] sur verifierPlan.js (falsification). → liste des échecs (vide = tenu).
function casCacheC5(mutation) {
  const d = casC5(), echecs = [];
  const w = bac(d, null, { _currentLoadedPlanId: "p1" }, mutation);
  let n = 0;
  const vrai = w.KtaRaccords.detecter;
  w.KtaRaccords.detecter = function () { n++; return vrai.apply(this, arguments); };
  const c5 = () => de(analyse(w).liste, "C5");
  const ok = (nom, c) => { if (!c) echecs.push(nom + " (appels : " + n + ")"); };
  ok("1re ouverture : un écart", c5().length === 1 && n === 1);
  ok("2e ouverture sans changement : pas de nouvel appel", c5().length === 1 && n === 1);
  w.KtaVerifierPlan.marquerVu(c5()[0]);
  ok("« Vu, normal » (Ignorer) : écart retiré sans nouvel appel", c5().length === 0 && n === 1);
  // Résultat gardé calculé SANS ignoré : le réafficher n'a pas besoin de recalcul (filtre seul).
  w.setPlanRaccordsIgnores(null, []);
  ok("ignorés réaffichés (résultat gardé sans ignoré) : l'écart revient sans appel", c5().length === 1 && n === 1);
  w.KtaVerifierPlan.marquerVu(c5()[0]);
  d.roads[0].nom = "A";         // champ sans effet sur l'écart : recalcul, l'ignoré est retenu par detecter
  ok("champ d'un tracé changé : recalcul, l'écart reste ignoré", c5().length === 0 && n === 2);
  w.setPlanRaccordsIgnores(null, []);
  ok("ignorés réaffichés (résultat gardé AVEC l'ignoré) : recalcul, l'écart revient", c5().length === 1 && n === 3);
  d.roads[1].points[1].y = 30;   // sommet éloigné à 30 px : plus d'écart proposé
  ok("sommet déplacé : recalcul, l'écart disparaît", c5().length === 0 && n === 4);
  c5();
  ok("après la modification, réouverture sans changement : pas de nouvel appel", n === 4);
  d.roads[1].level = 1;
  ok("niveau d'un tracé changé : recalcul", (c5(), n === 5));
  d.points = [{ uid: "pt_j", x: 50, y: 4, tags: ["puits"] }];
  ok("point ajouté (jonctions du graphe) : recalcul", (c5(), n === 6));
  w.APP_CONFIG.scale = 8;
  ok("échelle changée : recalcul", (c5(), n === 7));
  w.KtaVerifierPlan.analyser(w.KtaVerifierPlan.collecter());
  ok("données passées à analyser() : jamais lues dans le cache", n === 8);
  return echecs;
}
{
  const e = casCacheC5();
  t("C5 en cache : 1 appel pour 2 ouvertures sans changement, « Vu, normal » sans appel, recalcul après " +
    "modification (sommet, champ, point, échelle, ignorés réaffichés)", e.length === 0, e);
  const MUT_CACHE = [
    { nom: "cache jamais relu", m: ["if (sig && _c5Cache && _c5Cache.sig === sig) {", "if (false) {"] },
    { nom: "géométrie hors signature", m: ["if (p && typeof p === \"object\") { nombre(p.x); nombre(p.y); }",
      "if (p && typeof p === \"object\") { /* rien */ }"] },
    { nom: "ignorés retirés sans recalcul", m: ["if (!ign.has(k)) garde = false;", "/* rien */"] }
  ];
  MUT_CACHE.forEach(function (x) {
    let echecs = [];
    try { echecs = casCacheC5(x.m); } catch (err) { echecs = null; }
    t("🔒 falsification du cache C5 (" + x.nom + ") : le test le voit", Array.isArray(echecs) && echecs.length > 0,
      echecs);
  });
}

// ── 14. C11 : liaisons vers un plan absent ──
{
  const w = bac({}, null, { _currentLoadedPlanId: "p1",
    InterPlanLinks: { getLinksForPlan: () => [{ a: { planId: "p1" }, b: { planId: "p2" } },
      { a: { planId: "p3" }, b: { planId: "p1" } }, { a: { planId: "p1" }, b: { planId: "p4" } }] },
    PlanRegistry: { findById: id => (id === "p2" ? { id: id } : null) } });
  t("C11 : deux liaisons vers un plan absent de l'appareil, comptées (renvoi au gestionnaire)",
    w.KtaVerifierPlan.liaisonsAbsentes() === 2);
}

// ── 15. 🔒 Falsification : règle cassée → cas positif perdu ──
const MUTANTS = [
  { nom: "C4", m: ["if (g.length < 2) return;", "if (g.length < 99) return;"], cas: casC4,
    vu: l => l.some(c => c.cle === "C4|st_d1|st_d2") },
  { nom: "C4 (contour : départ et sens quelconques)", m: ["return a < b ? a : b;", "return l.join(\";\");"],
    cas: casC4, vu: l => l.some(c => c.cle === "C4|st_r1|st_r2") },
  { nom: "C5", m: ["return _detecterC5(d, cache).map(", "return [].map("], cas: casC5,
    vu: l => l.some(c => c.controle === "C5") },
  { nom: "C6 (se recoupe)", m: ["if (ip) return ip;", "if (ip && false) return ip;"], cas: casC6,
    vu: l => l.some(c => c.controle === "C6" && c.motif === "recoupe") },
  { nom: "C6 (dégénéré)", m: ["if (_degenere(pts)) {", "if (false) {"], cas: casC6,
    vu: l => l.some(c => c.controle === "C6" && c.motif === "degenere") },
  { nom: "C7", m: ["if (hors) out.push", "if (hors && false) out.push"], cas: casC7,
    cfg: { imageWidth: 1000, imageHeight: 1000 }, vu: l => l.some(c => c.controle === "C7") },
  { nom: "C8", m: ["if (entier && d.niveaux.indexOf(v) >= 0) return;", "return;"], cas: casC8,
    cfg: { multiLevel: true, availableLevels: [-1, 0, 1] }, vu: l => l.some(c => c.controle === "C8") },
  { nom: "C8 (zone sur plusieurs niveaux)", m: ["if (porte && Array.isArray(o.niveaux))", "if (false)"], cas: casC8,
    cfg: { multiLevel: true, availableLevels: [-1, 0, 1] }, vu: l => l.some(c => c.cle === "C8|zn_02|2") },
  { nom: "C9", m: ["memo.set(k, !!s);", "memo.set(k, true);"], cas: casC9,
    extra: { LegendCustomization: LEGENDE }, vu: l => l.some(c => c.controle === "C9" && c.objet.uid === "rd_faute") },
  { nom: "C10", m: ["if (!b || !b.sommets) return;", "return;"], cas: casC10,
    vu: l => l.some(c => c.controle === "C10") }
];
MUTANTS.forEach(function (x) {
  let perdu = false, err;
  try {
    const sain = x.vu(analyse(bac(x.cas(), x.cfg, x.extra)).liste);
    const casse = x.vu(analyse(bac(x.cas(), x.cfg, x.extra, x.m)).liste);
    perdu = sain && !casse;
  } catch (e) { err = e.message; }
  t("🔒 falsification " + x.nom + " : règle cassée → le cas positif n'est plus vu", perdu, err);
});

// ── 16. Corrections sûres : C4 identiques, C6 dégénéré, C10 ; galerie condamnée ──
// Écriture observée par des doublures : HistoryManager (une entrée ⏪ par geste), setters (rendu), ktaConfirm (filet),
// KtaExtensions.suppressionLot (plan partagé), FilterPanel.rapatrierCalque (calque → session). `o` : { refus,
// confirme, lectureSeule, calques, rapatrier } ; `mutation` : falsification de verifierPlan.js.
function bacCorr(d, o, mutation) {
  o = o || {};
  const j = { records: [], confirms: [], alertes: [], lots: [], rapatries: [], touches: 0 };
  const extra = {
    setRoads: l => { d.roads = l; }, setZones: l => { d.zones = l; }, setStructures: l => { d.structures = l; },
    setEditorPoints: l => { d.points = l; },
    HistoryManager: {
      captureState: cat => JSON.parse(JSON.stringify({ cat: cat || null, roads: d.roads || [], zones: d.zones || [],
        structures: d.structures || [], points: d.points || [] })),
      record: (label, avant, cat) => { j.records.push({ label: label, cat: cat || null, avant: avant }); }
    },
    KtaUid: { touch: x => { x.updatedAt = 9999; j.touches++; } },
    ktaConfirm: msg => { j.confirms.push(msg); return Promise.resolve(o.confirme !== false); },
    ktaAlerte: msg => { j.alertes.push(msg); return Promise.resolve(); },
    ktaEditionRefusee: () => o.lectureSeule === true,
    _currentLoadedPlanId: "plan-fictif",
    KtaExtensions: { suppressionLot: (id, objets) => {
      j.lots.push(objets.length);
      return o.refus ? Promise.resolve({ permis: false, message: "refus-installation" }) : null;
    } },
    CalqueSession: {},
    PLAN_CONFIG: { dataLayers: (o.calques || []).map(c => ({ id: c.id, file: c.file })) },
    FilterPanel: { rapatrierCalque: id => {
      j.rapatries.push(id);
      if (o.rapatrier === false) return Promise.resolve(false);
      const reg = extra._ktaDataStructurePolygons;
      reg.filter(e => e.layerId === id).forEach(e => {
        const c = JSON.parse(JSON.stringify(Object.assign({}, e, { polygon: undefined })));
        delete c.layerId; delete c.polygon; delete c.origOpacity; delete c.origFillOpacity;
        c._srcCalque = id;
        d.structures = (d.structures || []).concat([c]);
      });
      extra._ktaDataStructurePolygons.splice(0).forEach(e => { if (e.layerId !== id) reg.push(e); });
      return Promise.resolve(true);
    } },
    _ktaDataStructurePolygons: o.registre || [],
    document: { addEventListener() {}, getElementById: () => null }
  };
  const w = bac(d, null, extra, mutation);
  return { w: w, j: j, V: w.KtaVerifierPlan };
}
const pil = (uid, x, extra) => pilierDet(uid, carre(x, 0, 10), extra);
// Entrée du registre d'un calque (utils.js > _ktaDataStructurePolygons) : champs d'affichage en plus des données.
const entreeCalque = (uid, id) => ({ polygon: { _map: null }, layerId: id, type: "pilier-1",
  points: carre(500, 0, 10).map(p => P(p[0], p[1])), level: 0, uid: uid, updatedAt: uid === "st_c1" ? 1 : 2,
  origOpacity: 1, origFillOpacity: 0.85 });
// 50 piliers posés deux fois (deux passes de détection) : la seconde passe est plus récente.
function cas50() {
  const s = [];
  for (let i = 0; i < 50; i++) {
    s.push(pil("st_a" + i, i * 20, { updatedAt: 1000 }));
    s.push(pil("st_b" + i, i * 20, { updatedAt: 2000 }));
  }
  return { structures: s };
}
async function testsCorrections() {
  // 50 doublons d'un coup : une confirmation, une consultation de la prise, UNE entrée ⏪, les plus anciens restent.
  {
    const d = cas50(), b = bacCorr(d);
    const avant = de(analyse(b.w).liste, "C4");
    t("correction C4 : 50 groupes « identiques en tout », tous corrigibles",
      avant.length === 50 && avant.every(c => b.V.corrigible(c)), avant.length);
    const r = await b.V.corrigerTout("C4");
    const restants = d.structures.map(x => x.uid);
    t("correction C4 : « Garder un exemplaire » sur 50 doublons → 50 retirés, UNE entrée ⏪, une confirmation, " +
      "une consultation de la prise (50 objets)", !!r && r.supprimes === 50 && b.j.records.length === 1 &&
      b.j.confirms.length === 1 && b.j.lots.length === 1 && b.j.lots[0] === 50,
      { r: r, records: b.j.records.length, confirms: b.j.confirms.length, lots: b.j.lots });
    t("correction C4 : l'exemplaire gardé est le plus ancien (première passe)",
      restants.length === 50 && restants.every(u => /^st_a/.test(u)), restants.slice(0, 3));
    t("correction C4 : l'entrée ⏪ a capturé toutes les familles avant l'écriture (Ctrl+Z remet les 100)",
      b.j.records[0] && b.j.records[0].cat === null && b.j.records[0].avant.structures.length === 100);
    t("correction C4 : plus aucun doublon après le geste", de(analyse(b.w).liste, "C4").length === 0);
  }
  // Refus de l'installation (plan partagé) : message, rien supprimé, pas d'entrée ⏪.
  {
    const d = cas50(), b = bacCorr(d, { refus: true });
    const r = await b.V.corrigerTout("C4");
    t("plan partagé : refus de suppressionLot → message de l'installation, rien supprimé, aucune entrée ⏪",
      r === null && d.structures.length === 100 && b.j.records.length === 0 &&
      b.j.alertes.indexOf("refus-installation") >= 0, { n: d.structures.length, alertes: b.j.alertes });
  }
  // Confirmation refusée : rien.
  {
    const d = cas50(), b = bacCorr(d, { confirme: false });
    await b.V.corrigerTout("C4");
    t("filet : confirmation refusée → rien supprimé, prise jamais consultée",
      d.structures.length === 100 && b.j.records.length === 0 && b.j.lots.length === 0);
  }
  // Copies qui diffèrent (une note) : on montre, on ne corrige pas.
  {
    const d = { structures: [pil("st_n1", 0), pil("st_n2", 0, { description: "note" })] }, b = bacCorr(d);
    const c = de(analyse(b.w).liste, "C4")[0];
    t("correction C4 : exemplaires qui diffèrent (note) → pas corrigibles (décision 7a)",
      !!c && !c.identiques && !b.V.corrigible(c));
  }
  // Plan en lecture seule : rien de corrigible, rien d'écrit.
  {
    const d = cas50(), b = bacCorr(d, { lectureSeule: true });
    const l = de(analyse(b.w).liste, "C4");
    const r = await b.V.corrigerTout("C4");
    t("lecture seule : aucun constat corrigible, rien écrit", !l.some(c => b.V.corrigible(c)) && r === null &&
      d.structures.length === 100 && b.j.records.length === 0);
  }
  // Doublons dans un calque : passage en session d'abord (la question de « 🔄 Modifier »), puis la correction.
  {
    const d = { structures: [] };
    const b = bacCorr(d, { calques: [{ id: "cq", file: "cq.json" }], registre: [entreeCalque("st_c1", "cq"),
      entreeCalque("st_c2", "cq")] });
    const c = de(analyse(b.w).liste, "C4")[0];
    t("calque : doublons d'un calque rapatriable → corrigibles", !!c && b.V.corrigible(c));
    const r = await b.V.corriger(c);
    t("calque : le calque passe en session d'abord, puis une copie part (UNE entrée ⏪)",
      !!r && b.j.rapatries.join() === "cq" && d.structures.length === 1 && d.structures[0].uid === "st_c1" &&
      b.j.records.length === 1, { r: r, rap: b.j.rapatries, s: d.structures.map(x => x.uid) });
  }
  {
    const d = { structures: [] };
    const b = bacCorr(d, { calques: [{ id: "cq", file: "cq.json" }], rapatrier: false,
      registre: [entreeCalque("st_c1", "cq"), entreeCalque("st_c2", "cq")] });
    const r = await b.V.corriger(de(analyse(b.w).liste, "C4")[0]);
    t("calque : passage en session refusé → rien corrigé", r === null && b.j.records.length === 0);
  }
  {
    const d = { structures: [] };
    const b = bacCorr(d, { calques: [{ id: "cq" }], registre: [entreeCalque("st_c1", "cq"), entreeCalque("st_c2", "cq")] });
    const c = de(analyse(b.w).liste, "C4")[0];
    const r = await b.V.corriger(c);
    t("calque en lecture seule (sans fichier) : affiché, jamais corrigé", !!c && !b.V.corrigible(c) && r === null &&
      b.j.rapatries.length === 0 && b.j.records.length === 0);
  }
  // Session ↔ calque : l'exemplaire dessiné ici part, celui du calque reste, même plus récent ; le calque n'est ni
  // passé en session ni modifié ; confirmation, prise suppressionLot, UNE entrée ⏪ qui remet l'objet de session.
  {
    // Copie du calque déjà passée en session (_srcCalque), plus récente que l'objet dessiné ici.
    const copieCq = pil("st_c2", 500, { updatedAt: 2, _srcCalque: "cq" });
    const d = { structures: [pil("st_s", 500, { updatedAt: 1 }), copieCq] };
    const avantCopie = JSON.stringify(copieCq);
    const b = bacCorr(d, { calques: [{ id: "cq", file: "cq.json" }] });
    const c = de(analyse(b.w).liste, "C4")[0];
    t("session ↔ calque (copie en session) : identiques, corrigibles", !!c && c.identiques && b.V.corrigible(c),
      c && c.cle);
    const r = await b.V.corriger(c);
    t("session ↔ calque (copie en session) : l'objet de session part, la copie du calque reste intacte, " +
      "aucun passage en session, une confirmation, la prise consultée, UNE entrée ⏪",
      !!r && r.supprimes === 1 && d.structures.length === 1 && d.structures[0] === copieCq &&
      JSON.stringify(copieCq) === avantCopie && b.j.rapatries.length === 0 && b.j.confirms.length === 1 &&
      b.j.lots.length === 1 && b.j.lots[0] === 1 && b.j.records.length === 1 &&
      b.j.records[0].avant.structures.some(x => x.uid === "st_s"), { r: r, s: d.structures.map(x => x.uid) });
  }
  {
    // Objet d'un calque resté calque (registre), plus récent que l'objet dessiné ici.
    const ent = entreeCalque("st_c2", "cq");
    const d = { structures: [pil("st_s", 500, { updatedAt: 1, level: 0 })] };
    const b = bacCorr(d, { calques: [{ id: "cq", file: "cq.json" }], registre: [ent] });
    const avantEnt = JSON.stringify(ent);
    const c = de(analyse(b.w).liste, "C4")[0];
    t("session ↔ calque (registre) : identiques, corrigibles", !!c && c.identiques && b.V.corrigible(c), c && c.cle);
    const r = await b.V.corriger(c);
    const reg = b.w._ktaDataStructurePolygons;
    t("session ↔ calque (registre) : l'objet de session part, le calque n'est jamais passé en session, son objet " +
      "reste dans le registre, inchangé", !!r && r.supprimes === 1 && d.structures.length === 0 &&
      b.j.rapatries.length === 0 && reg.length === 1 && reg[0] === ent && JSON.stringify(ent) === avantEnt,
    { r: r, rap: b.j.rapatries, reg: reg.length });
    t("session ↔ calque (registre) : UNE entrée ⏪, qui a capturé l'objet de session",
      b.j.records.length === 1 && b.j.records[0].avant.structures.length === 1 &&
      b.j.records[0].avant.structures[0].uid === "st_s");
    t("session ↔ calque (registre) : plus aucun doublon après le geste", de(analyse(b.w).liste, "C4").length === 0);
  }
  {
    const d = { structures: [pil("st_s", 500, { updatedAt: 1, level: 0, description: "note" })] };
    const b = bacCorr(d, { calques: [{ id: "cq", file: "cq.json" }], registre: [entreeCalque("st_c2", "cq")] });
    const c = de(analyse(b.w).liste, "C4")[0];
    t("session ↔ calque qui diffèrent (note) : montrés, jamais corrigés", !!c && !c.identiques && !b.V.corrigible(c));
  }
  {
    const d = { structures: [pil("st_s", 500, { updatedAt: 1, level: 0 })] };
    const b = bacCorr(d, { calques: [{ id: "cq", file: "cq.json" }], registre: [entreeCalque("st_c2", "cq")],
      refus: true });
    const r = await b.V.corriger(de(analyse(b.w).liste, "C4")[0]);
    t("session ↔ calque, plan partagé : refus de suppressionLot → rien supprimé, aucune entrée ⏪",
      r === null && d.structures.length === 1 && b.j.records.length === 0 && b.j.rapatries.length === 0);
    const d2 = { structures: [pil("st_s", 500, { updatedAt: 1, level: 0 })] };
    const b2 = bacCorr(d2, { calques: [{ id: "cq", file: "cq.json" }], registre: [entreeCalque("st_c2", "cq")],
      confirme: false });
    await b2.V.corriger(de(analyse(b2.w).liste, "C4")[0]);
    t("session ↔ calque : confirmation refusée → rien supprimé, prise jamais consultée",
      d2.structures.length === 1 && b2.j.records.length === 0 && b2.j.lots.length === 0);
    const d3 = { structures: [pil("st_s", 500, { updatedAt: 1, level: 0 })] };
    const b3 = bacCorr(d3, { calques: [{ id: "cq", file: "cq.json" }], registre: [entreeCalque("st_c2", "cq")],
      lectureSeule: true });
    t("session ↔ calque, plan en lecture seule : pas corrigible",
      !b3.V.corrigible(de(analyse(b3.w).liste, "C4")[0]));
  }
  // C6 : dégénéré supprimé (filet), qui se recoupe jamais.
  {
    const d = casC6(), b = bacCorr(d);
    const l = de(analyse(b.w).liste, "C6");
    const deg = l.find(c => c.objet.uid === "zn_deux"), rec = l.find(c => c.objet.uid === "st_noeud");
    t("correction C6 : dégénéré corrigible, contour qui se recoupe non", b.V.corrigible(deg) && !b.V.corrigible(rec));
    const r = await b.V.corrigerTout("C6");
    t("correction C6 : les 2 contours dégénérés supprimés en un geste (confirmation, une entrée ⏪)",
      !!r && r.supprimes === 2 && !d.zones.some(z => z.uid === "zn_deux" || z.uid === "zn_ligne") &&
      b.j.confirms.length === 1 && b.j.records.length === 1, r);
  }
  // C10 : ktaDedupliquerFichier sur l'objet de session ; un objet qui disparaîtrait devient une suppression.
  {
    const d = casC10(), b = bacCorr(d);
    const r = await b.V.corrigerTout("C10");
    const dbl = d.roads.find(x => x.uid === "rd_dbl"), zn = d.zones.find(x => x.uid === "zn_dbl");
    t("correction C10 : sommets en double retirés (tracé 4 → 3, zone 6 → 4), tracé réduit à un point supprimé, " +
      "UNE entrée ⏪", !!r && dbl.points.length === 3 && zn.points.length === 4 && !d.roads.some(x => x.uid === "rd_nul") &&
      b.j.records.length === 1 && b.j.confirms.length === 1, r);
    t("correction C10 : objets nettoyés touchés (updatedAt), aller-retour intact",
      dbl.updatedAt === 9999 && d.roads.find(x => x.uid === "rd_retour").points.length === 3);
  }
  {
    const d = { roads: [R("rd_seul", "principal", [[0, 0], [10, 0], [10, 0], [20, 0]])] }, b = bacCorr(d);
    await b.V.corrigerTout("C10");
    t("correction C10 sans suppression : aucune confirmation (rien ne disparaît), une entrée ⏪",
      b.j.confirms.length === 0 && b.j.records.length === 1 && d.roads[0].points.length === 3);
  }
  // ✂️ : morceaux d'une coupe jamais corrigibles (ni C4, ni C10).
  {
    const b = bacCorr(casC4());
    const l = analyse(b.w).liste.filter(c => /couper|front/.test(c.cle));
    t("✂️ : les morceaux d'une coupe ne donnent aucun constat corrigible", !l.some(c => b.V.corrigible(c)));
  }
  // Galerie condamnée : écrite sur l'obstacle, une entrée ⏪ ciblée, C1 se tait ; retirée par le même chemin.
  {
    const z = R("zn_g", "inaccessible", [[100, -20], [140, -20], [140, 20], [100, 20]]);
    const d = { roads: [R("rd_g", "principal", [[0, 0], [260, 0]])], zones: [z] }, b = bacCorr(d);
    const c = de(analyse(b.w).liste, "C1")[0];
    const ok = await b.V.condamner(c);
    t("condamnée : `condamne: true` écrit sur la zone, touchée, UNE entrée ⏪ (zones), C1 se tait",
      ok === true && d.zones[0].condamne === true && d.zones[0].updatedAt === 9999 && b.j.records.length === 1 &&
      b.j.records[0].cat === "zones" && de(analyse(b.w).liste, "C1").length === 0);
    t("condamnée : listée parmi les galeries condamnées", b.V.condamnes().length === 1);
    await b.V.decondamner(0);
    t("condamnée : « Retirer » enlève le champ (2e entrée ⏪) et C1 revient",
      d.zones[0].condamne === undefined && b.j.records.length === 2 && de(analyse(b.w).liste, "C1").length === 1);
    const ro = bacCorr({ roads: [R("rd_g", "principal", [[0, 0], [260, 0]])], zones: [R("zn_g", "inaccessible",
      [[100, -20], [140, -20], [140, 20], [100, 20]])] }, { lectureSeule: true });
    const r2 = await ro.V.condamner(de(analyse(ro.w).liste, "C1")[0]);
    t("condamnée : plan en lecture seule → rien écrit", r2 === false && ro.j.records.length === 0);
  }
}

// 🔒 Falsifications des corrections : chaque garde cassée doit faire tomber un test ci-dessus.
async function falsifCorr(m, verif) {
  try { return await verif(m); } catch (e) { return "exception : " + e.message; }
}
async function falsificationsCorrections() {
  const F = [
    { nom: "une entrée ⏪ par geste", m: ["    if (avant) H.record(libelle, avant);\n",
      "    if (avant) ops.suppr.forEach(function () { H.record(libelle, avant); });\n"],
      v: async m => { const b = bacCorr(cas50(), null, m); await b.V.corrigerTout("C4"); return b.j.records.length === 1; } },
    { nom: "exemplaires revérifiés au geste", m: ["return m.every(function (e) { return _contenu(e.o) === ref; }) ? m : null;",
      "return m;"],
      v: async m => { const d = { structures: [pil("st_n1", 0), pil("st_n2", 0)] }, b = bacCorr(d, null, m);
        const c = de(analyse(b.w).liste, "C4")[0];
        d.structures[1].description = "note ajoutée par la synchro";
        await b.V.corriger(c);
        return d.structures.length === 2; } },
    { nom: "prise suppressionLot consultée", m: ["if (!(await _permisSuppression(ops.suppr))) return null;", ""],
      v: async m => { const d = cas50(), b = bacCorr(d, { refus: true }, m); await b.V.corrigerTout("C4");
        return d.structures.length === 100; } },
    { nom: "confirmation des suppressions", m: ["      if (!ok) return null;\n", "\n"],
      v: async m => { const d = cas50(), b = bacCorr(d, { confirme: false }, m); await b.V.corrigerTout("C4");
        return d.structures.length === 100; } },
    { nom: "lecture seule", m: ["if (_lectureSeule()) return { refus: \"lectureSeule\" };", ""],
      v: async m => { const b = bacCorr(cas50(), { lectureSeule: true }, m);
        return !de(analyse(b.w).liste, "C4").some(c => b.V.corrigible(c)); } },
    { nom: "session ↔ calque : le calque n'est jamais passé en session", m: [
      "if (mains.length && copie) return { objets: mains, calques: [], mixte: true };", ""],
      v: async m => { const d = { structures: [pil("st_s", 500, { updatedAt: 1, level: 0 })] };
        const b = bacCorr(d, { calques: [{ id: "cq", file: "cq.json" }], registre: [entreeCalque("st_c2", "cq")] }, m);
        await b.V.corriger(de(analyse(b.w).liste, "C4")[0]);
        return b.j.rapatries.length === 0 && b.w._ktaDataStructurePolygons.length === 1 && d.structures.length === 0; } },
    { nom: "session ↔ calque : l'exemplaire de session part, même plus ancien", m: [
      "if (c.controle === \"C4\" && p.mixte) {", "if (false) {"],
      v: async m => { const d = { structures: [pil("st_s", 500, { updatedAt: 1 }),
        pil("st_c2", 500, { updatedAt: 2, _srcCalque: "cq" })] };
        const b = bacCorr(d, { calques: [{ id: "cq", file: "cq.json" }] }, m);
        await b.V.corriger(de(analyse(b.w).liste, "C4")[0]);
        return d.structures.length === 1 && d.structures[0].uid === "st_c2"; } },
    { nom: "session ↔ calque : confirmation", m: ["      if (!ok) return null;\n", "\n"],
      v: async m => { const d = { structures: [pil("st_s", 500, { updatedAt: 1, level: 0 })] };
        const b = bacCorr(d, { calques: [{ id: "cq", file: "cq.json" }], registre: [entreeCalque("st_c2", "cq")],
          confirme: false }, m);
        await b.V.corriger(de(analyse(b.w).liste, "C4")[0]);
        return d.structures.length === 1; } },
    { nom: "C6 qui se recoupe jamais corrigé", m: ["if (c.controle === \"C6\" && c.motif !== \"degenere\") return null;", ""],
      v: async m => { const b = bacCorr(casC6(), null, m);
        return !b.V.corrigible(de(analyse(b.w).liste, "C6").find(c => c.objet.uid === "st_noeud")); } },
    { nom: "C10 qui ferait disparaître l'objet = suppression", m: ["if (b && b.objets) prendre(suppr, objs[0]);",
      "if (false) prendre(suppr, objs[0]);"],
      v: async m => { const d = casC10(), b = bacCorr(d, null, m); await b.V.corrigerTout("C10");
        return !d.roads.some(x => x.uid === "rd_nul"); } }
  ];
  for (const x of F) {
    const sain = await falsifCorr(null, x.v);
    const casse = await falsifCorr(x.m, x.v);
    t("🔒 falsification correction (" + x.nom + ") : tenue saine, tombe cassée", sain === true && casse !== true,
      { sain: sain, casse: casse });
  }
}

(async function () {
  await testsCorrections();
  await falsificationsCorrections();
  console.log("");
  if (ko) {
    console.log("❌ check-verifier-plan : " + ko + " contrôle(s) en échec");
    process.exit(1);
  }
  console.log("🎉 check-verifier-plan : C1 = graphe de l'itinéraire, C1 à C10 positifs et négatifs, " +
    "falsifications tenues, « vu, normal » tenu");
})();
