#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-verifier-plan.js — checkup (Playwright) : « Vérifier le plan » (js/verifierPlan.js)
// =====================================================================
// Objets FICTIFS posés hors de l'image (aucun calque du plan ne les touche), échelle forcée à 2,5 px/m, plan
// multi-niveau (le relevé fictif l'est ; sinon C2 / C3 sont sautés et le harnais le dit) :
//   · C1 : un tracé qui traverse une zone inaccessible (signalé), un tracé qui croise un mur en ligne (signalé), un
//     tracé qui traverse une zone d'eau et un tracé libre (jamais signalés) ;
//   · C2 : un puits à échelons entre les niveaux 0 et 1 sans raccord au niveau 1 (signalé) ;
//   · C3 : un tracé jonction du niveau 0 au niveau 0 (signalé) ;
//   · parcours à la souris depuis l'Éditeur de données : liste groupée par gravité, clic sur une ligne → carte centrée
//     sur l'endroit, niveau changé, objet surligné, fiche ouverte ; Précédent / Suivant ;
//   · « Vu, normal » : le constat quitte la liste, reste vu au rechargement, « Rétablir » le rend ;
//   · saisie : un tracé ajouté à travers la zone inaccessible → un toast d'avertissement, une seule fois.
// Usage : node scripts/smoke/checkup-verifier-plan.js (SMOKE_PORT pour une autre copie, KTA_MOTEURS : un moteur)
// Code : js/verifierPlan.js, pathfinder.js > controle · doc : multilevel-pathfinding.md § Vérifier le plan, ui.md §91.6
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
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaVerifierPlan && !!window.Pathfinder;
  }, 60000);
  await page.waitForTimeout(2500);
  return page.evaluate(function (echelle) {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    const cfg = window.APP_CONFIG;
    cfg.scale = echelle;
    // Objets du test hors de l'image : les bornes de la carte (map.js > maxBounds) empêcheraient de les centrer.
    window.map.setMaxBounds(null);
    if (cfg.multiLevel === true) {
      [0, 1, 2].forEach(function (n) {
        if (cfg.availableLevels.indexOf(n) < 0) cfg.availableLevels.push(n);
        if (cfg.visibleLevels.indexOf(n) < 0) cfg.visibleLevels.push(n);
      });
      cfg.activeLevel = 0;
    }
    return cfg.multiLevel === true;
  }, ECHELLE);
}

// Objets en mètres, posés à (-4000, -4000) px : hors de l'image, loin de tout calque du plan. `updatedAt` ancien :
// ils passent pour des données d'avant l'ouverture (pas de toast de saisie au semis).
function semer(page) {
  return page.evaluate(function (s) {
    const O = -4000, VIEUX = 1000;
    const P = function (q) { return { x: O + q[0] * s, y: O + q[1] * s }; };
    const O2 = function (uid, type, pts, extra) {
      return Object.assign({ uid: uid, updatedAt: VIEUX, type: type, level: 0, points: pts.map(P) }, extra || {});
    };
    window.__vp = { P: P };
    window.setZones([
      O2("zn_vp_dur", "inaccessible", [[20, -6], [30, -6], [30, 6], [20, 6]]),
      O2("zn_vp_eau", "eau", [[70, -6], [80, -6], [80, 6], [70, 6]])
    ]);
    window.setStructures([O2("st_vp_mur", "mur-ligne", [[125, -10], [125, 10]])]);
    window.setRoads([
      O2("rd_vp_coupe", "principal", [[0, 0], [50, 0]]),
      O2("rd_vp_eau", "principal", [[60, 0], [90, 0]]),
      O2("rd_vp_mur", "principal", [[110, 0], [140, 0]]),
      O2("rd_vp_libre", "principal", [[0, 30], [140, 30]]),
      O2("rd_vp_n1", "principal", [[0, 60], [140, 60]], { level: 1 }),
      O2("rd_vp_n2", "principal", [[0, 90], [140, 90]], { level: 2 }),
      O2("rd_vp_jmeme", "jonction", [[160, 0], [160, 20]], { fromLevel: 0, toLevel: 0 })
    ]);
    window.setEditorPoints([{ uid: "pt_vp_puits", updatedAt: VIEUX, id: "vp-puits", nom: "vp-puits", tags: ["jpe"],
      x: O + 100 * s, y: O + 61 * s, level: 0, niveaux: [0, 1],
      accroches: [{ level: 0, x: O + 100 * s, y: O + 30 * s }] },
      { uid: "pt_vp_mid", updatedAt: VIEUX, id: "vp-mid", nom: "vp-mid", tags: ["jpe"], x: O + 40 * s, y: O + 31 * s,
        level: 0, niveaux: [0, 1, 2], accroches: [{ level: 0, x: O + 40 * s, y: O + 30 * s },
          { level: 2, x: O + 40 * s, y: O + 90 * s }] }]);
    if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    if (window.HistoryManager && typeof window.HistoryManager.reset === "function") window.HistoryManager.reset();
  }, ECHELLE);
}

// Constats du test (objets « _vp_ ») : { liste: [cle], vus: [cle] }.
function nosConstats(page) {
  return page.evaluate(function () {
    const r = window.KtaVerifierPlan.analyser();
    const f = function (c) { return /_vp_/.test(c.cle); };
    return { liste: r.liste.filter(f).map(function (c) { return c.cle; }),
      vus: r.vus.filter(f).map(function (c) { return c.cle; }) };
  });
}

async function ouvrirListe(page) {
  await page.evaluate(function () { window.ouvrirTableEditor(); });
  await attendre(page, function () { return !!document.getElementById("kta-tbl-src-verif"); }, 5000);
  await page.click("#kta-tbl-src-verif");
  await attendre(page, function () { return !!document.getElementById("kta-verif-modal"); }, 5000);
}

function rang(page, cle) {
  return page.evaluate(function (k) {
    const e = window.KtaVerifierPlan.liste().find(function (q) { return q.cle === k; });
    return e ? e.i : -1;
  }, cle);
}

function bandeau(page) {
  return page.evaluate(function () {
    const b = document.getElementById("kta-verif-bandeau");
    if (!b) return null;
    return {
      pos: b.querySelector(".kta-verif-pos").textContent,
      info: b.querySelector(".kta-verif-info").textContent,
      objet: document.querySelectorAll(".kta-verif-objet").length,
      obstacle: document.querySelectorAll(".kta-verif-obstacle").length,
      modale: !!document.getElementById("kta-verif-modal"),
      fiche: !!document.querySelector(".leaflet-popup"),
      niveau: window.APP_CONFIG.activeLevel,
      // Boutons sortis du cadre du bandeau (ou de l'écran) : rangée qui ne passe pas à la ligne.
      deborde: Array.prototype.filter.call(b.querySelectorAll("button"), function (x) {
        if (x.offsetParent === null) return false;
        const r = x.getBoundingClientRect(), c = b.getBoundingClientRect();
        return r.left < c.left - 1 || r.right > c.right + 1 || r.left < 0 || r.right > window.innerWidth;
      }).map(function (x) { return x.dataset.verif; })
    };
  });
}

// La vue montre-t-elle le point (m) du test ?
function visible(page, q) {
  return page.evaluate(function (xy) {
    const p = window.__vp.P(xy);
    return window.map.getBounds().contains(window.convertCoord(p.x, p.y));
  }, q);
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
    const multi = await ouvrirPlan(page);
    if (!multi) inf("plan à un seul niveau : C2 et C3 sautés");
    await page.evaluate(function () { window.setPlanVerifVus(null, []); });
    await semer(page);
    await page.waitForTimeout(500);

    // ── 1. Détection ──
    let l = await nosConstats(page);
    inf("constats du test : " + JSON.stringify(l.liste));
    const C1Z = "C1|rd_vp_coupe|zn_vp_dur", C1M = "C1|rd_vp_mur|st_vp_mur";
    const C2 = "C2|pt_vp_puits|1", C3 = "C3|rd_vp_jmeme|meme";
    verifier(l.liste.indexOf(C1Z) >= 0, "C1 : tracé à travers une zone inaccessible signalé");
    verifier(l.liste.indexOf(C1M) >= 0, "C1 : tracé qui croise un mur en ligne signalé");
    verifier(!l.liste.some(function (k) { return /rd_vp_eau|rd_vp_libre|zn_vp_eau/.test(k); }),
      "C1 : zone d'eau et tracé libre jamais signalés", l.liste);
    if (multi) {
      verifier(l.liste.indexOf(C2) >= 0, "C2 : puits sans raccord au niveau 1 signalé");
      verifier(l.liste.indexOf(C3) >= 0, "C3 : jonction du niveau 0 au niveau 0 signalée");
      verifier(!l.liste.some(function (k) { return k.indexOf("C2|pt_vp_puits|0") === 0; }),
        "C2 : le niveau raccordé (0) n'est pas signalé", l.liste);
      verifier(l.liste.indexOf("C2|pt_vp_mid|1") >= 0, "C2 : niveau intermédiaire traversé sans raccord signalé", l.liste);
    }
    const ok1 = await page.evaluate(async function () {
      const P = window.__vp.P;
      try {
        await window.Pathfinder.computeRoute([P([0, 0]), P([50, 0])], { allowedTypes: ["principal"] });
        return "passe";
      } catch (e) { return e.code || "erreur"; }
    });
    verifier(ok1 !== "passe", "même vérité que l'itinéraire : pas de chemin à travers la zone signalée", ok1);

    // ── 2. Éditeur de données → liste → clic ──
    await ouvrirListe(page);
    const fen = await page.evaluate(function () {
      const m = document.getElementById("kta-verif-modal");
      const info = m.querySelector(".kta-verif-g-info");
      let apresInfo = [];
      for (let e = info && info.nextElementSibling; e; e = e.nextElementSibling) {
        if (e.classList.contains("kta-verif-gravite")) break;
        apresInfo = apresInfo.concat(Array.from(e.querySelectorAll(".kta-verif-ligne-objet")).map(function (x) {
          return x.textContent; }));
      }
      return { info: apresInfo, bloquant: !!m.querySelector(".kta-verif-g-bloquant"),
        controles: Array.from(m.querySelectorAll(".kta-verif-controle")).map(function (e) { return e.textContent; }),
        lignes: m.querySelectorAll(".kta-verif-ligne").length, popupNative: false };
    });
    verifier(fen.bloquant && fen.lignes >= 2, "fenêtre : groupe « Bloquant », une ligne par constat", fen);
    verifier(fen.controles.length >= (multi ? 3 : 1), "fenêtre : constats rangés par contrôle", fen.controles);
    if (multi) {
      verifier(fen.info.some(function (x) { return /vp-mid/.test(x); }) &&
        !fen.info.some(function (x) { return /vp-puits/.test(x); }),
        "fenêtre : niveau intermédiaire traversé rangé en « Pour info », le puits sans raccord reste bloquant", fen.info);
    }
    const iZ = await rang(page, C1Z);
    await page.click('#kta-verif-modal [data-verif-i="' + iZ + '"]');
    await page.waitForTimeout(700);
    let b = await bandeau(page);
    verifier(!!b && !b.modale && b.objet === 1 && b.obstacle === 1,
      "clic sur la ligne : la fenêtre se replie, bandeau, tracé surligné et zone cernée", b);
    verifier(await visible(page, [25, 0]), "clic sur la ligne : la carte est centrée sur la coupure");
    verifier(!!b && b.fiche, "clic sur la ligne : la fiche du tracé est ouverte", b);
    verifier(!!b && b.niveau === 0, "niveau du constat affiché", b && b.niveau);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const bTel = await bandeau(page);
    verifier(!!bTel && bTel.deborde.length === 0, "bandeau au téléphone (390 px) : aucun bouton hors du cadre",
      bTel && bTel.deborde);
    await page.setViewportSize({ width: 1200, height: 850 });
    await page.waitForTimeout(300);
    if (multi) {
      const i2 = await rang(page, C2);
      for (let k = 0; k < 10; k++) {
        const pos = (await bandeau(page)).pos;
        if (pos.indexOf((i2 + 1) + " /") === 0) break;
        await page.click('#kta-verif-bandeau [data-verif="suiv"]');
        await page.waitForTimeout(250);
      }
      b = await bandeau(page);
      verifier(!!b && b.niveau === 1 && await visible(page, [100, 61]),
        "Suivant jusqu'au puits : niveau 1 affiché, carte centrée sur le puits", b);
      await page.waitForTimeout(400);
      verifier(!!(await bandeau(page)).fiche, "Suivant : la fiche du puits est ouverte");
      for (let k = 0; k < 10; k++) {
        const pos = (await bandeau(page)).pos;
        if (pos.indexOf((iZ + 1) + " /") === 0) break;
        await page.click('#kta-verif-bandeau [data-verif="prec"]');
        await page.waitForTimeout(250);
      }
      verifier((await bandeau(page)).pos.indexOf((iZ + 1) + " /") === 0, "Précédent : retour sur la coupure");
    }

    // ── 3. Vu, normal ──
    await page.click('#kta-verif-bandeau [data-verif="vu"]');
    await page.waitForTimeout(400);
    l = await nosConstats(page);
    verifier(l.liste.indexOf(C1Z) < 0 && l.vus.indexOf(C1Z) >= 0, "Vu, normal : le constat quitte la liste", l);
    const vusLs = await page.evaluate(function () { return window.getPlanVerifVus(); });
    verifier(vusLs.indexOf(C1Z) >= 0, "Vu, normal : retenu dans les préférences du plan", vusLs);
    await page.click('#kta-verif-bandeau [data-verif="fermer"]');
    await page.waitForTimeout(300);
    const ferme = await page.evaluate(function () {
      return { bandeau: !!document.getElementById("kta-verif-bandeau"),
        modale: !!document.getElementById("kta-verif-modal"),
        marques: document.querySelectorAll(".kta-verif-objet, .kta-verif-obstacle").length,
        vus: !!document.querySelector('#kta-verif-modal [data-verif="voir-vus"]') };
    });
    verifier(!ferme.bandeau && ferme.modale && ferme.marques === 0 && ferme.vus,
      "Fermer : bandeau et marques partis, la liste revient avec « Vus, normaux »", ferme);

    // ── 4. Rechargement : le vu reste vu ; Rétablir ──
    await ouvrirPlan(page);
    await semer(page);
    await page.waitForTimeout(500);
    l = await nosConstats(page);
    verifier(l.liste.indexOf(C1Z) < 0 && l.vus.indexOf(C1Z) >= 0, "après rechargement : toujours vu, normal", l);
    await ouvrirListe(page);
    await page.click('#kta-verif-modal [data-verif="voir-vus"]');
    await page.waitForTimeout(200);
    const nVus = await page.evaluate(function () { return document.querySelectorAll(".kta-verif-vu").length; });
    verifier(nVus >= 1, "liste des vus consultable", nVus);
    await page.click('#kta-verif-modal [data-verif-retablir="0"]');
    await page.waitForTimeout(300);
    l = await nosConstats(page);
    verifier(l.liste.indexOf(C1Z) >= 0 && l.vus.indexOf(C1Z) < 0, "Rétablir : le constat revient dans la liste", l);
    await page.evaluate(function () { window.KtaVerifierPlan.fermer(); });

    // ── 5. Saisie : un tracé tiré à travers la zone inaccessible → un toast, une fois ──
    const avant = await page.evaluate(function () { return window.KtaVerifierPlan.etat().avertis; });
    await page.evaluate(function () {
      const P = window.__vp.P;
      window.setRoads(window.getRoads().concat([{ uid: "rd_vp_saisi", type: "secondaire", level: 0,
        points: [P([25, -20]), P([25, 20])] }]));
    });
    await page.waitForTimeout(1500);
    const apres = await page.evaluate(function () {
      const toasts = Array.from(document.querySelectorAll("body *")).filter(function (e) {
        return e.children.length === 0 &&
          /zone bloquante ou un mur|blocking zone or a wall|zona bloqueante o un muro/.test(e.textContent || "");
      }).length;
      return { avertis: window.KtaVerifierPlan.etat().avertis, toasts: toasts };
    });
    verifier(apres.avertis === avant + 1 && apres.toasts >= 1, "saisie : tracé coupé par une zone → un toast", apres);
    await page.evaluate(function () { window.setRoads(window.getRoads().slice()); });
    await page.waitForTimeout(1500);
    const encore = await page.evaluate(function () { return window.KtaVerifierPlan.etat().avertis; });
    verifier(encore === apres.avertis, "saisie : pas de second toast pour la même coupure", encore);

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
  console.log("🎉 CHECKUP VERT — C1 à C3 signalés (et rien de plus), clic qui centre et ouvre la fiche, « vu, normal »" +
    " retenu au rechargement, avertissement à la saisie.");
  process.exit(0);
})();
