#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-raccords.js — checkup (Playwright) : règle stricte des jonctions et « 🔗 Raccords à vérifier »
// =====================================================================
// Tracés FICTIFS posés hors de l'image (aucun calque du plan ne les touche), échelle forcée à 2,5 px/m :
//   · deux galeries parallèles à 4 m, reliées seulement par un détour → l'itinéraire fait le détour, ne traverse pas
//     le mur, et l'écart n'est pas proposé (même morceau du réseau) ;
//   · un carrefour dessiné en deux « L » dont les sommets intérieurs sont à 3 m → proposé ; Raccorder → l'itinéraire
//     passe ; Ctrl+Z → il ne passe plus et l'écart revient ;
//   · deux galeries parallèles à 4 m, sans détour → proposé ; Ignorer → disparaît, et reste ignoré au rechargement ;
//     « Réafficher les ignorés » le rend.
// Parcours à la souris depuis l'Éditeur de données (liste, bandeau Précédent / Suivant, Fermer), Chromium et WebKit.
// Usage : node scripts/smoke/checkup-raccords.js (SMOKE_PORT pour une autre copie, KTA_MOTEURS pour un seul moteur)
// Code : js/raccordsTraces.js, pathfinder.js > _enrichirGrapheAvecCroisements · doc : multilevel-pathfinding.md
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const ECHELLE = 2.5;   // px/m

const problemes = [];
let _prefixe = "";
function pb(msg) { problemes.push(_prefixe + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  ℹ️  " + msg); }
function verifier(c, msg, detail) {
  if (c) ok(msg);
  else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : ""));
}

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaRaccords && !!window.Pathfinder &&
      !!window.HistoryManager;
  }, 60000);
  await page.waitForTimeout(2500);
  await page.evaluate(function (echelle) {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    const cfg = window.APP_CONFIG;
    if (cfg.multiLevel === true) {
      cfg.activeLevel = 0;
      if (cfg.visibleLevels.indexOf(0) < 0) cfg.visibleLevels.push(0);
    }
    cfg.scale = echelle;
  }, ECHELLE);
}

// Tracés en mètres, posés à (-4000, -4000) px : hors de l'image, loin de tout calque du plan.
function semer(page) {
  return page.evaluate(function (s) {
    const O = -4000;
    const P = function (mx, my) { return { x: O + mx * s, y: O + my * s }; };
    const R = function (uid, pts) {
      return { uid: uid, type: "principal", level: 0, points: pts.map(function (q) { return P(q[0], q[1]); }) };
    };
    window.__rac = { P: P };
    window.setRoads([
      // Galeries parallèles à 4 m, reliées par le détour C (bouts confondus) : l'itinéraire fait le tour.
      R("rd_rac_a", [[0, -8], [0, 0], [4, 0], [8, 0], [12, 0], [16, 0], [20, 0], [20, -8]]),
      R("rd_rac_b", [[0, 12], [0, 4], [4, 4], [8, 4], [12, 4], [16, 4], [20, 4], [20, 12]]),
      R("rd_rac_c", [[20, -8], [30, -8], [30, 12], [20, 12]]),
      // Carrefour en deux « L », sommets intérieurs à 3 m.
      R("rd_rac_l1", [[60, -10], [60, 0], [70, 0]]),
      R("rd_rac_l2", [[50, 3], [60, 3], [60, 13]]),
      // Galeries parallèles à 4 m sans détour : un mur.
      R("rd_rac_d", [[100, -8], [100, 0], [120, 0], [120, -8]]),
      R("rd_rac_e", [[100, 12], [100, 4], [120, 4], [120, 12]])
    ]);
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") {
      try { window.SessionPersist.save({ force: true }); } catch (e) { /* sans effet sur le test */ }
    }
  }, ECHELLE);
}

// Itinéraire en mètres entre deux points (m), ou le code d'erreur.
function itineraire(page, a, b) {
  return page.evaluate(async function (ab) {
    const P = window.__rac.P;
    try {
      const r = await window.Pathfinder.computeRoute([P(ab[0][0], ab[0][1]), P(ab[1][0], ab[1][1])],
        { allowedTypes: ["principal"] });
      return Math.round(r.totalDistance / window.APP_CONFIG.scale * 10) / 10;
    } catch (e) { return e.code || String(e && e.message); }
  }, [a, b]);
}

// Écarts proposés dans la zone du test (x < -1000) : [{ m, ax, ay }] en mètres depuis l'origine du test.
function nosEcarts(page) {
  return page.evaluate(function () {
    const s = window.APP_CONFIG.scale;
    return window.KtaRaccords.detecter().liste.filter(function (e) { return e.a.x < -1000; }).map(function (e) {
      return { m: Math.round(e.ecartPx / s * 10) / 10, ax: Math.round((e.a.x + 4000) / s),
        ay: Math.round((e.a.y + 4000) / s) };
    });
  });
}
function aCarrefour(l) { return l.some(function (e) { return e.ax >= 50 && e.ax <= 70 && Math.abs(e.m - 3) < 0.05; }); }
function aMur(l) { return l.some(function (e) { return e.ax >= 100 && e.ax <= 120 && Math.abs(e.m - 4) < 0.05; }); }

// Rang dans la liste affichée de l'écart du test dont le sommet est dans [x0, x1] m.
function rang(page, x0, x1) {
  return page.evaluate(function (b) {
    const s = window.APP_CONFIG.scale;
    const e = window.KtaRaccords.liste().find(function (q) {
      const x = (q.a.x + 4000) / s;
      return q.a.x < -1000 && x >= b[0] && x <= b[1];
    });
    return e ? e.i : -1;
  }, [x0, x1]);
}

async function ouvrirListe(page) {
  await page.evaluate(function () { window.ouvrirTableEditor(); });
  await attendre(page, function () { return !!document.getElementById("kta-tbl-src-raccords"); }, 5000);
  await page.click("#kta-tbl-src-raccords");
  await attendre(page, function () { return !!document.getElementById("kta-racc-modal"); }, 5000);
}

function bandeau(page) {
  return page.evaluate(function () {
    const b = document.getElementById("kta-racc-bandeau");
    if (!b) return null;
    return {
      pos: b.querySelector(".kta-racc-pos").textContent,
      info: b.querySelector(".kta-racc-info").textContent,
      cercles: document.querySelectorAll(".kta-racc-cercle").length,
      modale: !!document.getElementById("kta-racc-modal"),
      niveau: window.APP_CONFIG.activeLevel
    };
  });
}

async function jouer(nav, moteur) {
  _prefixe = "[" + moteur + "] ";
  console.log("\n══ " + moteur + " ══");
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await ouvrirPlan(page);
    await page.evaluate(function () { window.setPlanRaccordsIgnores(null, []); });
    await semer(page);
    await page.waitForTimeout(500);
    const seuils = await page.evaluate(function () { return window.KtaRaccords.seuilsPx(); });
    inf("seuils " + seuils.min.toFixed(1) + " → " + seuils.max.toFixed(1) + " px (échelle " + seuils.echelle +
      " px/m)");

    // ── 1. Mur entre deux galeries parallèles : l'itinéraire fait le détour ──
    const dMur = await itineraire(page, [10, 0], [10, 4]);
    verifier(typeof dMur === "number" && dMur > 40, "galeries parallèles à 4 m : l'itinéraire fait le détour (" + dMur +
      " m), ne traverse pas le mur");
    let l = await nosEcarts(page);
    inf("écarts proposés dans la zone du test : " + JSON.stringify(l));
    verifier(!l.some(function (e) { return e.ax <= 30; }),
      "galeries reliées par un détour : écart non proposé (même morceau)");
    verifier(aCarrefour(l), "carrefour à 3 m entre sommets intérieurs : proposé");
    verifier(aMur(l), "galeries séparées à 4 m sans détour : proposées");
    verifier(l.length === 2, "un seul écart par paire de morceaux (2 attendus)", l.length);
    const dAvant = await itineraire(page, [60, -10], [60, 13]);
    verifier(typeof dAvant !== "number", "carrefour non raccordé : pas d'itinéraire entre les deux « L »", dAvant);

    // ── 2. Éditeur de données → liste → bandeau ──
    await ouvrirListe(page);
    const lignes = await page.evaluate(function () {
      return Array.from(document.querySelectorAll("#kta-racc-modal .kta-racc-ligne")).map(function (b) {
        return b.textContent;
      });
    });
    inf("liste : " + lignes.length + " ligne(s)");
    const iC = await rang(page, 50, 70);
    verifier(iC >= 0 && /3/.test(lignes[iC] || ""), "ligne du carrefour : écart en mètres", lignes[iC]);
    await page.click('#kta-racc-modal [data-racc-i="' + iC + '"]');
    await page.waitForTimeout(400);
    let b = await bandeau(page);
    verifier(!!b && !b.modale && b.cercles === 2,
      "clic sur la ligne : la fenêtre se replie, bandeau et deux points entourés", b);
    verifier(!!b && b.pos === (iC + 1) + " / " + lignes.length, "bandeau : rang / total", b && b.pos);
    if (lignes.length > 1) {
      await page.click('#kta-racc-bandeau [data-racc="suiv"]');
      const b2 = await bandeau(page);
      await page.click('#kta-racc-bandeau [data-racc="prec"]');
      const b3 = await bandeau(page);
      verifier(b2.pos !== b.pos && b3.pos === b.pos, "Suivant puis Précédent : on revient au même écart",
        [b2.pos, b3.pos]);
    }

    // ── 3. Raccorder → l'itinéraire passe ; Ctrl+Z → il ne passe plus ──
    const histAvant = await page.evaluate(function () { return window.HistoryManager.canUndo(); });
    await page.click('#kta-racc-bandeau [data-racc="raccorder"]');
    await page.waitForTimeout(600);
    const dApres = await itineraire(page, [60, -10], [60, 13]);
    verifier(typeof dApres === "number" && dApres > 20 && dApres < 26,
      "Raccorder : l'itinéraire passe par le carrefour (" +
      dApres + " m)");
    l = await nosEcarts(page);
    verifier(!aCarrefour(l) && aMur(l), "Raccorder : le carrefour quitte la liste, le mur reste", l);
    b = await bandeau(page);
    verifier(!!b && b.cercles === 2, "bandeau ouvert sur l'écart suivant", b);
    const geo = await page.evaluate(function () {
      const r = window.getRoads();
      const l1 = r.find(function (x) { return x.uid === "rd_rac_l1"; });
      const l2 = r.find(function (x) { return x.uid === "rd_rac_l2"; });
      return { n1: l1.points.length, n2: l2.points.length,
        commun: l1.points.some(function (p) {
          return l2.points.some(function (q) { return p.x === q.x && p.y === q.y; });
        }) };
    });
    verifier(geo.commun, "Raccorder : les deux tracés partagent un sommet exact", geo);
    verifier(await page.evaluate(function () { return window.HistoryManager.canUndo(); }),
      "Raccorder : une entrée d'historique",
      { avant: histAvant });
    await page.evaluate(function () { if (document.activeElement) document.activeElement.blur(); });
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(800);
    const dAnnule = await itineraire(page, [60, -10], [60, 13]);
    verifier(typeof dAnnule !== "number", "Ctrl+Z : le raccord est défait, plus d'itinéraire", dAnnule);
    l = await nosEcarts(page);
    verifier(aCarrefour(l), "Ctrl+Z : le carrefour revient dans la liste", l);
    b = await bandeau(page);
    verifier(!!b, "Ctrl+Z pendant la revue : le bandeau reste et suit la liste recalculée", b);

    // ── 4. Ignorer le mur → disparaît, persiste au rechargement ──
    const iM = await rang(page, 100, 120);
    for (let k = 0; k < 20; k++) {
      const pos = (await bandeau(page)).pos;
      if (pos.indexOf((iM + 1) + " /") === 0) break;
      await page.click('#kta-racc-bandeau [data-racc="suiv"]');
    }
    await page.click('#kta-racc-bandeau [data-racc="ignorer"]');
    await page.waitForTimeout(400);
    l = await nosEcarts(page);
    verifier(!aMur(l) && aCarrefour(l), "Ignorer : le mur quitte la liste, le carrefour reste", l);
    await page.click('#kta-racc-bandeau [data-racc="fermer"]');
    await page.waitForTimeout(300);
    const ferme = await page.evaluate(function () {
      return { bandeau: !!document.getElementById("kta-racc-bandeau"),
        modale: !!document.getElementById("kta-racc-modal"),
        cercles: document.querySelectorAll(".kta-racc-cercle").length,
        reafficher: !!document.querySelector('#kta-racc-modal [data-racc="reafficher"]') };
    });
    verifier(!ferme.bandeau && ferme.modale && ferme.cercles === 0 && ferme.reafficher,
      "Fermer : bandeau et marque partis, la liste revient avec « Réafficher les ignorés »", ferme);

    await ouvrirPlan(page);
    await semer(page);
    await page.waitForTimeout(500);
    l = await nosEcarts(page);
    verifier(!aMur(l) && aCarrefour(l), "après rechargement : le mur reste ignoré, le carrefour est proposé", l);
    await ouvrirListe(page);
    const txt = await page.evaluate(function () {
      const x = document.querySelector('#kta-racc-modal [data-racc="reafficher"]');
      return x ? x.textContent : null;
    });
    verifier(!!txt && /1/.test(txt), "« Réafficher les ignorés (1) »", txt);
    await page.click('#kta-racc-modal [data-racc="reafficher"]');
    await page.waitForTimeout(300);
    l = await nosEcarts(page);
    verifier(aMur(l), "Réafficher : le mur revient dans la liste", l);
    await page.evaluate(function () { window.KtaRaccords.fermer(); });

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs);
  } finally {
    await page.close();
  }
}

(async function main() {
  const liste = moteurs();
  try {
    for (const m of liste) {
      const nav = await lancerMoteur(m);
      if (!nav) { inf(m + " absent : moteur sauté"); continue; }
      try { await jouer(nav, m); } finally { await nav.close(); }
    }
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — mur respecté, carrefour proposé puis raccordé et annulé, écart ignoré retenu au " +
    "rechargement.");
  process.exit(0);
})();
