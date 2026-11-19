#!/usr/bin/env node
/*
 * MyKTAMap — check-verifier-plan-auto.js
 * Garde-fou BLOQUANT de la passe légère de « Vérifier le plan » (js/verifierPlanAuto.js) : CHARGE pathfinder.js,
 * poiJonction.js, verifierPlan.js et verifierPlanAuto.js dans un bac à sable, sur des données FICTIVES en mémoire.
 *
 * 🔒 Ce qu'il garantit :
 *   A. Même vérité que la liste : les clés comptées par la passe découpée en tranches sont exactement les bloquants
 *      d'analyser() (C1 à C3, gravité « bloquant »), sur un jeu qui en porte de chaque sorte ; « Vu, normal » exclus.
 *   B. C1 à C3 seulement : la passe n'appelle ni analyser() ni les autres contrôles (texte du module, et appels
 *      comptés : analyser remplacé par une fonction qui lève).
 *   C. Jamais pendant le splash ni le premier rendu : la passe d'ouverture part de mktm:plan-pret, attend
 *      KtaSplash.surFermeture et requestIdleCallback (texte du module).
 *   D. Moteur qui lève : passe abandonnée (null), console.warn [VerifierPlan] ; moteur qui ne rend plus la main :
 *      plafond de tranches.
 *   G. Fin du Générateur (verifierZip) : calques d'un faux ZIP, plan généré multi-niveau alors que la page ne l'est
 *      pas → mêmes bloquants que le plan ouvert, toast « warn », APP_CONFIG.multiLevel rendu.
 *   E. Jeu fictif moyen (~2 000 objets, multi-niveau) : clés des tranches = bloquants d'analyser(), à l'identique.
 *   F. --cout : jeu fictif d'environ 20 000 objets, plus longue tranche < 50 ms (~6 s : hors pre-commit).
 * Usage : node scripts/check-verifier-plan-auto.js [--cout]   (exit 1 si un contrôle échoue)
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

const P = (x, y) => ({ x: x, y: y });
const R = (uid, type, pts, extra) => Object.assign({ uid: uid, type: type, points: pts.map(p => P(p[0], p[1])) },
  extra || {});

function bac(d, cfg) {
  const avert = [];
  const win = {
    console: { log() {}, warn() { avert.push(Array.prototype.join.call(arguments, " ")); }, error() {} },
    APP_CONFIG: Object.assign({ scale: 4, multiLevel: false, imageHeight: 100000, imageWidth: 100000 }, cfg || {}),
    I18n: { t: (k, p) => k + (p ? JSON.stringify(p) : "") },
    getRoads: () => d.roads || [],
    getAllEmbeddedRoads: () => [],
    getZones: () => d.zones || [],
    getStructures: () => d.structures || [],
    getEditorPoints: () => d.points || [],
    getAllEmbeddedPoints: () => [],
    getProfondeurNiveau: () => null,
    isStructurePolylineType: () => false,
    _ktaDataPolygons: [],
    _ktaDataStructurePolygons: [],
    _vus: [],
    getPlanVerifVus: function () { return win._vus.slice(); },
    setPlanVerifVus: function (_p, l) { win._vus = l.slice(); return true; },
    getPlanRaccordsIgnores: () => [],
    addEventListener() {},
    ktaEsc: s => String(s),
    ktaIcone: () => "",
    _currentLoadedPlanId: "plan_fictif"
  };
  win.window = win;
  win.__avert = avert;
  const ctx = vm.createContext(win);
  ["js/poiJonction.js", "js/pathfinder.js", "js/verifierPlan.js", "js/verifierPlanAuto.js"].forEach(function (f) {
    vm.runInContext("var window = this;" + lire(f), ctx);
  });
  return win;
}
const maintenant = () => Number(process.hrtime.bigint()) / 1e6;
const reposImmediat = fn => setImmediate(() => fn(null));

// Jeu de contrôle : un bloquant de chaque sorte, et des cas qui n'en sont pas.
function jeu() {
  const roads = [
    R("rd_coupe", "principal", [[0, 0], [200, 0]], { level: 0 }),            // C1 : zone inaccessible
    R("rd_mur", "principal", [[450, 0], [550, 0]], { level: 0 }),            // C1 : mur en ligne
    R("rd_libre", "principal", [[0, 300], [800, 300]], { level: 0 }),
    R("rd_g1", "principal", [[0, 50], [800, 50]], { level: 1 }),
    R("rd_g2", "principal", [[0, 100], [800, 100]], { level: 2 }),
    R("rd_jmeme", "jonction", [[600, 300], [610, 300]], { fromLevel: 0, toLevel: 0 }),   // C3 : même niveau
    R("rd_jok", "jonction", [[700, 300], [700, 50]], { fromLevel: 0, toLevel: 1 })
  ];
  const zones = [R("zn_dur", "inaccessible", [[100, -20], [140, -20], [140, 20], [100, 20]], { level: 0 }),
    R("zn_eau", "eau", [[300, -20], [340, -20], [340, 20], [300, 20]], { level: 0 })];
  const structures = [R("st_mur", "mur-ligne", [[500, -30], [500, 30]], { level: 0 })];
  const pt = (uid, tag, x, niveaux, acc) => ({ uid: uid, id: uid, nom: uid, tags: [tag], x: x, y: 300,
    level: niveaux[0], niveaux: niveaux, accroches: acc });
  const points = [
    pt("pt_manque", "jpe", 60, [0, 1], [{ level: 0, x: 60, y: 300 }]),                         // C2 bloquant
    pt("pt_mid", "jpe", 180, [0, 1, 2], [{ level: 0, x: 180, y: 300 }, { level: 2, x: 180, y: 100 }]),  // C2 info
    pt("pt_ok", "jes", 20, [0, 1], [{ level: 0, x: 20, y: 300 }, { level: 1, x: 20, y: 50 }])
  ];
  return { roads: roads, zones: zones, structures: structures, points: points };
}

(async function () {
  // ── A. Même vérité que la liste ──
  {
    const w = bac(jeu(), { multiLevel: true });
    const attendu = w.KtaVerifierPlan.analyser().liste.filter(c => c.gravite === "bloquant").map(c => c.cle).sort();
    const r = await w.KtaVerifierPlanAuto.lancer(null, { repos: reposImmediat, maintenant: maintenant });
    const obtenu = r ? r.cles.slice().sort() : null;
    t("A : clés comptées = bloquants d'analyser() (C1 zone, C1 mur, C2, C3)",
      JSON.stringify(obtenu) === JSON.stringify(attendu) && attendu.length === 4, { obtenu, attendu });
    t("A : le niveau traversé de C2 (gravité info) n'est pas compté",
      !!obtenu && !obtenu.some(k => k.indexOf("C2|pt_mid") === 0));
    w._vus = [attendu[0]];
    w.__etatTest = true;
    // nombre() lit les vus au moment de la lecture : on rejoue la passe comme le module à l'ouverture.
    const r2 = await w.KtaVerifierPlanAuto.lancer(null, { repos: reposImmediat, maintenant: maintenant });
    const vus = new Set(w._vus);
    t("A : « Vu, normal » exclu du compte", r2.cles.filter(k => !vus.has(k)).length === 3);
    const w1 = bac(jeu(), { multiLevel: false });
    const r1 = await w1.KtaVerifierPlanAuto.lancer(null, { repos: reposImmediat, maintenant: maintenant });
    t("A : plan à un niveau → C1 seul (C2, C3 sautés)", !!r1 && r1.cles.every(k => k.indexOf("C1|") === 0) &&
      r1.cles.length === 2, r1 && r1.cles);
  }

  // ── B. C1 à C3 seulement ──
  {
    const src = lire("js/verifierPlanAuto.js");
    const code = src.replace(/\/\/[^\n]*/g, "");
    t("B : le module n'appelle pas analyser()", !/\.analyser\s*\(/.test(code));
    t("B : seuls bloquants.C1 / C2 / C3 sont lus", /ordre = \["C1", "C2", "C3"\]/.test(code) &&
      !/bloquants\.C(?![123]\b)/.test(code));
    const w = bac(jeu(), { multiLevel: true });
    w.KtaVerifierPlan.analyser = function () { throw new Error("analyser appelé"); };
    const r = await w.KtaVerifierPlanAuto.lancer(null, { repos: reposImmediat, maintenant: maintenant });
    t("B : la passe aboutit sans analyser()", !!r && r.cles.length === 4);
    const vp = lire("js/verifierPlan.js");
    t("B : verifierPlan.js expose bloquants = { C1: _c1, C2: _c2, C3: _c3 } (les fonctions de la liste)",
      /bloquants:\s*\{\s*C1:\s*function\s*\(d\)\s*\{\s*return _c1\(d\);\s*\},\s*C2:\s*_c2,\s*C3:\s*_c3\s*\}/.test(vp));
  }

  // ── C. Jamais pendant le splash ni le premier rendu ──
  {
    const code = lire("js/verifierPlanAuto.js").replace(/\/\/[^\n]*/g, "");
    const pret = code.indexOf('addEventListener("mktm:plan-pret"');
    t("C : passe d'ouverture déclenchée par mktm:plan-pret, via _apresPremierRendu", pret > 0 &&
      /mktm:plan-pret"[\s\S]{0,200}_apresPremierRendu\(/.test(code));
    t("C : _apresPremierRendu attend KtaSplash.surFermeture puis deux images",
      /KtaSplash\.surFermeture\(suite\)/.test(code) &&
      /requestAnimationFrame\(function \(\) \{\s*requestAnimationFrame/.test(code));
    t("C : tranches au repos (requestIdleCallback)", /requestIdleCallback\(/.test(code));
    const appels = (code.match(/_passePlan\(/g) || []).length;
    t("C : _passePlan appelé seulement depuis plan-pret et le recompte après modification", appels === 3, appels);
  }

  // ── D. Moteur qui lève, moteur qui ne rend plus la main ──
  {
    const w = bac(jeu(), { multiLevel: true });
    w.KtaVerifierPlan.bloquants.C1 = function () { throw new Error("moteur cassé"); };
    const r = await w.KtaVerifierPlanAuto.lancer(null, { repos: reposImmediat, maintenant: maintenant });
    t("D : moteur qui lève → null, console.warn [VerifierPlan]", r === null &&
      w.__avert.some(m => m.indexOf("[VerifierPlan]") === 0), w.__avert);
    const w2 = bac(jeu(), { multiLevel: true });
    let horloge = 0;
    w2.KtaVerifierPlan.bloquants.C1 = function () { horloge += 70000; return []; };
    const r2 = await w2.KtaVerifierPlanAuto.lancer(null, { repos: reposImmediat, maintenant: () => horloge });
    t("D : plafond de temps dépassé → abandon (null, warn)", r2 === null &&
      w2.__avert.some(m => m.indexOf("plafond") >= 0), w2.__avert);
  }

  // ── G. Fin du Générateur ──
  {
    const j = jeu();
    const w = bac({}, { multiLevel: false });
    const toasts = [];
    w.OOMGuard = { showToast: (m, ty) => toasts.push(ty + ":" + m) };
    w.requestIdleCallback = (fn) => setImmediate(() => fn(null));
    const fichiers = {
      "data/galeries.json": JSON.stringify({ roads: j.roads }),
      "data/obstacles.json": JSON.stringify({ zones: j.zones, structures: j.structures }),
      "data/points.json": JSON.stringify({ data: j.points }),
      "data/editor.json": JSON.stringify({ data: [] }),
      "data/photos/_index.json": "{}"
    };
    const zip = { file: (re) => Object.keys(fichiers).filter(k => re.test(k))
      .map(k => ({ async: () => Promise.resolve(fichiers[k]) })) };
    const n = await w.KtaVerifierPlanAuto.verifierZip(zip,
      { multiLevel: true, echelle: 4, image: { w: 1000, h: 1000 } });
    t("G : ZIP généré → 4 bloquants (C1 zone, C1 mur, C2, C3), comme le plan ouvert", n === 4, n);
    t("G : un toast « warn » au pluriel",
      toasts.length === 1 && toasts[0].indexOf("warn:verif.auto.generateur.n") === 0, toasts);
    t("G : APP_CONFIG.multiLevel de la page rendu", w.APP_CONFIG.multiLevel === false);
    const w0 = bac({}, {});
    const t0 = [];
    w0.OOMGuard = { showToast: (m, ty) => t0.push(ty) };
    w0.requestIdleCallback = (fn) => setImmediate(() => fn(null));
    const zip0 = { file: () => [{ async: () => Promise.resolve(JSON.stringify({ roads: [j.roads[2]] })) }] };
    const n0 = await w0.KtaVerifierPlanAuto.verifierZip(zip0, { multiLevel: false });
    t("G : aucun bloquant → aucun toast", n0 === 0 && t0.length === 0, { n0, t0 });
  }

  // ── E / F. Jeux fictifs : k = 1 → ~20 000 objets, k = 10 → ~2 000 ──
  function grosJeu(k) {
    const roads = [], zones = [], structures = [], points = [];
    let n = 0;
    const N = (v) => Math.round(v / k);
    // 10 000 tracés sur une grille de 100 × 100 cases de 200 px, 3 niveaux ; 5 500 piliers ; 1 000 zones (dont
    // 300 inaccessibles) ; 300 murs en ligne ; 3 034 points dont 300 passages entre niveaux ; 200 jonctions.
    for (let i = 0; i < N(10000); i++) {
      const cx = (i % 100) * 200, cy = Math.floor(i / 100) * 200, lvl = i % 3;
      const pts = [];
      for (let k = 0; k < 6; k++) pts.push([cx + k * 40, cy + (k % 2) * 30]);
      roads.push(R("rd_" + (n++), "principal", pts, { level: lvl }));
    }
    for (let i = 0; i < N(200); i++) {
      const cx = (i * 97 % 100) * 200, cy = (i * 31 % 100) * 200;
      roads.push(R("rd_" + (n++), "jonction", [[cx, cy], [cx + 3, cy + 3]], { fromLevel: i % 2, toLevel: i % 2 + 1 }));
    }
    for (let i = 0; i < N(5500); i++) {
      const cx = (i * 7 % 100) * 200 + 100, cy = (i * 13 % 100) * 200 + 120;
      structures.push(R("st_" + (n++), "pilier", [[cx, cy], [cx + 10, cy], [cx + 10, cy + 10], [cx, cy + 10]],
        { level: i % 3 }));
    }
    for (let i = 0; i < N(300); i++) {
      const cx = (i * 37 % 100) * 200 + 60, cy = (i * 53 % 100) * 200;
      structures.push(R("st_" + (n++), "mur-ligne", [[cx, cy - 20], [cx, cy + 50]], { level: i % 3 }));
    }
    for (let i = 0; i < N(1000); i++) {
      const cx = (i * 41 % 100) * 200 + 20, cy = (i * 59 % 100) * 200 - 10;
      zones.push(R("zn_" + (n++), i < N(300) ? "inaccessible" : "eau",
        [[cx, cy], [cx + 50, cy], [cx + 50, cy + 50], [cx, cy + 50]], { level: i % 3 }));
    }
    for (let i = 0; i < N(3034); i++) {
      const x = (i * 11 % 100) * 200 + 40, y = (i * 17 % 100) * 200;
      const p = { uid: "pt_" + (n++), id: "p" + i, nom: "p" + i, tags: [i < N(300) ? "jpe" : "pa"], x: x, y: y,
        level: 0 };
      if (i < N(300)) { p.niveaux = [0, 1]; p.accroches = [{ level: 0, x: x, y: y }]; }
      points.push(p);
    }
    return { roads: roads, zones: zones, structures: structures, points: points };
  }
  const total = (j) => j.roads.length + j.zones.length + j.structures.length + j.points.length;
  {
    const j = grosJeu(10);
    const w = bac(j, { multiLevel: true });
    const attendu = w.KtaVerifierPlan.analyser().liste.filter(c => c.gravite === "bloquant").map(c => c.cle).sort();
    const r = await w.KtaVerifierPlanAuto.lancer(null, { repos: reposImmediat, maintenant: maintenant });
    const obtenu = r ? r.cles.slice().sort() : [];
    t("E : " + total(j) + " objets fictifs, " + (r ? r.tranches : 0) + " tranches : clés = bloquants d'analyser() (" +
      attendu.length + ")", attendu.length > 50 && JSON.stringify(obtenu) === JSON.stringify(attendu),
    { obtenu: obtenu.length, attendu: attendu.length });
  }
  if (process.argv.indexOf("--cout") >= 0) {
    const j = grosJeu(1);
    const w = bac(j, { multiLevel: true });
    const a = maintenant();
    const r = await w.KtaVerifierPlanAuto.lancer(null, { repos: reposImmediat, maintenant: maintenant });
    const msTot = maintenant() - a;
    console.log("   " + total(j) + " objets fictifs : " + r.tranches + " tranches, plus longue " + r.maxMs.toFixed(1) +
      " ms, total " + Math.round(msTot) + " ms, " + r.cles.length + " bloquants");
    t("F : ~20 000 objets fictifs, plus longue tranche < 50 ms", total(j) > 19000 && !!r && r.maxMs < 50, r && r.maxMs);
  }

  console.log(ko ? "\n❌ check-verifier-plan-auto : " + ko + " échec(s)"
    : "\n✅ check-verifier-plan-auto : tout est vert");
  process.exit(ko ? 1 : 0);
})();
