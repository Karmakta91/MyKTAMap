#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-verifier-plan-auto.js — checkup (Playwright) : passe légère de « Vérifier le plan » (js/verifierPlanAuto.js)
// =====================================================================
// Sur le relevé fictif, objets FICTIFS posés hors de l'image (un tracé à travers une zone inaccessible, un tracé
// jonction du niveau 0 au niveau 0) :
//   · ouverture : passe au repos après le plan prêt ; pastille du nombre sur la carte Vérifier le plan (📊 Éditeur
//     de données) et sur la tuile Éditeur de données (Exporter) ; UN toast « warn » s'il y a des bloquants ;
//   · réouverture au même nombre : pas de second toast ; nombre changé : un nouveau toast ;
//   · « Vu, normal » : la pastille baisse sans nouvelle passe ;
//   · urgence (mode urgence actif) et plan en lecture seule : pastille seule, aucun toast ;
//   · moteur qui lève : ni pastille ni toast, console.warn [VerifierPlan], plan utilisable ;
//   · temps : plus longue tranche de la passe et plus longue tâche du fil principal pendant la passe (< 50 ms).
// Usage : node scripts/smoke/checkup-verifier-plan-auto.js (SMOKE_PORT pour une autre copie, KTA_MOTEURS : un moteur)
// Code : js/verifierPlanAuto.js · doc : multilevel-pathfinding.md § Vérifier le plan
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

// Toasts, tâches longues et avertissements relevés dès le chargement (avant les scripts de l'app).
function sonde() {
  window.__toasts = [];
  window.__longues = [];
  window.__warns = [];
  const w = console.warn;
  console.warn = function () {
    try { window.__warns.push(Array.prototype.map.call(arguments, String).join(" ")); } catch (e) { /* rien */ }
    return w.apply(console, arguments);
  };
  try {
    new PerformanceObserver(function (l) {
      l.getEntries().forEach(function (e) { window.__longues.push({ t: e.startTime, d: e.duration }); });
    }).observe({ type: "longtask", buffered: false });
  } catch (e) { /* moteur sans longtask */ }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) {
        if (n.nodeType === 1 && n.classList.contains("kta-toast")) {
          const msg = n.querySelector(".kta-toast-msg");
          window.__toasts.push({ type: n.getAttribute("data-kta-type"), msg: msg ? msg.textContent : "" });
        }
      });
    });
  }).observe(document, { childList: true, subtree: true });
}

function toastsAuto(page) {
  return page.evaluate(function () {
    return window.__toasts.filter(function (x) { return x.msg.indexOf("Vérifier le plan :") === 0; });
  });
}

async function ouvrirPlan(page) {
  await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    window.__planTest = p.id;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaVerifierPlanAuto;
  }, 60000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}
// Fin de la passe d'ouverture : etat() rempli pour le plan ouvert.
async function passeFaite(page, ms) {
  await attendre(page, function () {
    const e = window.KtaVerifierPlanAuto.etat();
    return !!e && e.planId === window._currentLoadedPlanId;
  }, ms || 20000);
  return page.evaluate(function () { return window.KtaVerifierPlanAuto.etat(); });
}
// Rejoue la passe d'ouverture comme le chargement (mktm:plan-pret), sans recharger le plan.
async function repasser(page) {
  await page.evaluate(function () {
    window.__debutPasse = performance.now();
    window.dispatchEvent(new CustomEvent("mktm:plan-pret", { detail: { planId: window._currentLoadedPlanId } }));
  });
}

// Objets en mètres, posés à (-4000, -4000) px : hors de l'image. `updatedAt` ancien : pas de toast de saisie.
function semer(page, avecJonction) {
  return page.evaluate(function (a) {
    const s = a.s, O = -4000, VIEUX = 1000;
    const P = function (q) { return { x: O + q[0] * s, y: O + q[1] * s }; };
    const O2 = function (uid, type, pts, extra) {
      return Object.assign({ uid: uid, updatedAt: VIEUX, type: type, level: 0, points: pts.map(P) }, extra || {});
    };
    const garder = function (l) { return l.filter(function (o) { return !/_vpa_/.test(String(o.uid)); }); };
    window.APP_CONFIG.scale = s;
    window.setZones(garder(window.getZones()).concat([
      O2("zn_vpa_dur", "inaccessible", [[20, -6], [30, -6], [30, 6], [20, 6]])]));
    const rs = [O2("rd_vpa_coupe", "principal", [[0, 0], [50, 0]])];
    if (a.j) rs.push(O2("rd_vpa_jmeme", "jonction", [[160, 0], [160, 20]], { fromLevel: 0, toLevel: 0 }));
    window.setRoads(garder(window.getRoads()).concat(rs));
    if (window.SessionPersist && typeof window.SessionPersist.save === "function") window.SessionPersist.save();
  }, { s: ECHELLE, j: !!avecJonction });
}

function pastilles(page) {
  return page.evaluate(async function () {
    const lire = function (sel) {
      const p = document.querySelector(sel + " [data-kta-verif-pastille]");
      return p ? Number(p.textContent) : 0;
    };
    window.ouvrirTableEditor();
    await new Promise(function (r) { setTimeout(r, 300); });
    const carte = lire("#kta-tbl-src-verif");
    const m = document.getElementById("kta-tbl-close-accueil");
    if (m) m.click();
    return { carte: carte, nombre: window.KtaVerifierPlanAuto.nombre() };
  });
}
// Tuile « Éditeur de données » du lanceur Exporter (interface.js > _creerTile), ouvert par son bouton de la barre.
function pastilleTuile(page) {
  return page.evaluate(async function () {
    const titre = window.I18n.t("ui.group.save");
    const bouton = Array.from(document.querySelectorAll("a[role='button'], a")).find(function (a) {
      return (a.getAttribute("title") || "") === titre || (a.getAttribute("aria-label") || "") === titre;
    });
    if (!bouton) return { bouton: false };
    bouton.click();
    await new Promise(function (r) { setTimeout(r, 600); });
    const m = document.getElementById("kta-export-lanceur");
    const lib = window.I18n.t("export.lanceur.editeur");
    const t = m ? Array.from(m.querySelectorAll(".kta-tracker-modal-tile")).find(function (x) {
      return x.textContent.indexOf(lib) >= 0;
    }) : null;
    const p = t ? t.querySelector("[data-kta-verif-pastille]") : null;
    const res = { bouton: true, tuile: !!t, n: p ? Number(p.textContent) : 0 };
    const x = m && m.querySelector(".kta-tracker-modal-close");
    if (x) x.click();
    return res;
  });
}

async function jouer(nav, moteur) {
  _prefixe = "[" + moteur + "] ";
  console.log("\n══ " + moteur + " ══");
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) { /* rien */ } }
  }, LS_PREGATES);
  await page.addInitScript(sonde);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () {
      return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
        window.PlanRegistry.getAll().length > 0;
    }, 30000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

    // ── 1. Première ouverture ──
    await ouvrirPlan(page);
    const aPlanPret = await page.evaluate(function () { return !!window.KtaVerifierPlanAuto.etat(); });
    verifier(!aPlanPret, "rien n'est calculé au plan prêt (attente du premier rendu, puis repos)");
    let e = await passeFaite(page);
    const multi = await page.evaluate(function () { return window.APP_CONFIG.multiLevel === true; });
    const n0 = e.nombre;
    inf("relevé fictif seul : " + n0 + " bloquant(s), " + e.tranches + " tranche(s), plus longue " +
      e.maxMs.toFixed(1) + " ms, passe " + Math.round(e.ms) + " ms");
    let t = await toastsAuto(page);
    verifier(t.length === (n0 ? 1 : 0), "première ouverture : " + (n0 ? "un toast" : "aucun toast (0 bloquant)"), t);

    // ── 2. Bloquants ajoutés, réouverture : un nouveau toast ──
    await semer(page, multi);
    await page.waitForTimeout(800);
    await ouvrirPlan(page);
    e = await passeFaite(page);
    const n1 = e.nombre;
    const ajout = multi ? 2 : 1;
    verifier(n1 === n0 + ajout, "réouverture : " + ajout + " bloquant(s) de plus comptés (" + n0 + " → " + n1 + ")",
      { n0: n0, n1: n1 });
    t = await toastsAuto(page);
    const dernier = t[t.length - 1];
    verifier(t.length === (n0 ? 2 : 1) && dernier && dernier.type === "warn" && dernier.msg.indexOf(String(n1)) > 0,
      "nombre changé : un nouveau toast « warn » avec le nombre", t);

    // ── 3. Pastilles ──
    const p = await pastilles(page);
    verifier(p.carte === n1, "pastille " + n1 + " sur la carte Vérifier le plan (📊 Éditeur de données)", p);
    const tu = await pastilleTuile(page);
    verifier(tu.tuile && tu.n === n1, "pastille " + n1 + " sur la tuile Éditeur de données (menu Exporter)", tu);

    // ── 4. Même nombre à la réouverture : pas de second toast ──
    await ouvrirPlan(page);
    e = await passeFaite(page);
    t = await toastsAuto(page);
    verifier(e.nombre === n1 && t.length === (n0 ? 2 : 1), "réouverture au même nombre : pas de nouveau toast",
      { nombre: e.nombre, toasts: t.length });

    // ── 5. « Vu, normal » : la pastille baisse sans nouvelle passe ──
    const vu = await page.evaluate(function () {
      window.setPlanVerifVus(null, ["C1|rd_vpa_coupe|zn_vpa_dur"]);
      return window.KtaVerifierPlanAuto.nombre();
    });
    verifier(vu === n1 - 1, "« Vu, normal » exclu du compte, aussitôt (" + n1 + " → " + vu + ")");
    await page.evaluate(function () { window.setPlanVerifVus(null, []); });

    // ── 6. Urgence : nombre changé, pastille seule ──
    const ls0 = await page.evaluate(function () { return localStorage.getItem("myktamap_verif_auto_v1"); });
    await page.evaluate(function () {
      window.setRoads(window.getRoads().filter(function (r) { return r.uid !== "rd_vpa_coupe"; }));
      window.EmergencyMode.activer();
    });
    const urg = await page.evaluate(function () { return window.EmergencyMode.isActif(); });
    await repasser(page);
    e = await passeFaite(page);
    t = await toastsAuto(page);
    const ls1 = await page.evaluate(function () { return localStorage.getItem("myktamap_verif_auto_v1"); });
    verifier(urg && e.nombre === n1 - 1 && t.length === (n0 ? 2 : 1) && ls1 === ls0,
      "urgence active, nombre changé (" + e.nombre + ") : pastille seule, aucun toast, rien retenu",
      { urgence: urg, nombre: e.nombre, toasts: t.length });
    await page.evaluate(function () { window.EmergencyMode.desactiver(); });

    // ── 7. Lecture seule : pastille seule ──
    await page.evaluate(function () {
      window.__refus = window.ktaEditionRefusee;
      window.ktaEditionRefusee = function () { return true; };
    });
    await repasser(page);
    e = await passeFaite(page);
    t = await toastsAuto(page);
    verifier(e.nombre === n1 - 1 && t.length === (n0 ? 2 : 1), "plan en lecture seule : pastille seule, aucun toast",
      { nombre: e.nombre, toasts: t.length });
    await page.evaluate(function () { window.ktaEditionRefusee = window.__refus; });

    // ── 8. Temps : relevé fictif + objets du test, passe rejouée seule ──
    await repasser(page);
    e = await passeFaite(page);
    t = await toastsAuto(page);
    verifier(t.length === (n0 ? 3 : 2), "hors urgence, nombre changé depuis le dernier toast : un toast", t.length);
    const longues = await page.evaluate(function () {
      return window.__longues.filter(function (x) { return x.t >= window.__debutPasse; })
        .map(function (x) { return Math.round(x.d); });
    });
    const maxLongue = longues.length ? Math.max.apply(null, longues) : 0;
    inf("passe rejouée : " + e.tranches + " tranche(s), plus longue " + e.maxMs.toFixed(1) + " ms, tâches longues " +
      "du fil pendant la passe : " + JSON.stringify(longues));
    verifier(e.maxMs < 50, "plus longue tranche < 50 ms (" + e.maxMs.toFixed(1) + " ms)");
    verifier(maxLongue < 50, "aucune tâche du fil principal ≥ 50 ms pendant la passe (" + maxLongue + " ms)", longues);

    // ── 9. Moteur qui lève : ni pastille ni toast, warn, plan utilisable ──
    await page.evaluate(function () {
      window.__c1 = window.KtaVerifierPlan.bloquants.C1;
      window.KtaVerifierPlan.bloquants.C1 = function () { throw new Error("moteur cassé (checkup)"); };
      window.__warns = [];
    });
    await repasser(page);
    await page.waitForTimeout(4000);
    const casse = await page.evaluate(async function () {
      window.ouvrirTableEditor();
      await new Promise(function (r) { setTimeout(r, 300); });
      const pastille = !!document.querySelector("#kta-tbl-src-verif [data-kta-verif-pastille]");
      const m = document.getElementById("kta-tbl-close-accueil");
      if (m) m.click();
      const z = window.map.getZoom();
      window.map.setZoom(z - 1, { animate: false });
      return { etat: window.KtaVerifierPlanAuto.etat(), nombre: window.KtaVerifierPlanAuto.nombre(),
        pastille: pastille, warn: window.__warns.filter(function (w) { return w.indexOf("[VerifierPlan]") === 0; }),
        carte: window.map.getZoom() === z - 1 };
    });
    t = await toastsAuto(page);
    verifier(casse.etat === null && casse.nombre === null && !casse.pastille && t.length === (n0 ? 3 : 2),
      "moteur qui lève : ni pastille ni toast", casse);
    verifier(casse.warn.length === 1, "moteur qui lève : un console.warn [VerifierPlan]", casse.warn);
    verifier(casse.carte, "moteur qui lève : la carte répond", casse);
    await page.evaluate(function () { window.KtaVerifierPlan.bloquants.C1 = window.__c1; });

    // Nettoyage des objets du test (la session du relevé fictif reste celle d'avant).
    await page.evaluate(function () {
      const garder = function (l) { return l.filter(function (o) { return !/_vpa_/.test(String(o.uid)); }); };
      window.setRoads(garder(window.getRoads()));
      window.setZones(garder(window.getZones()));
      if (window.SessionPersist && typeof window.SessionPersist.save === "function") window.SessionPersist.save();
    });
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
  console.log("🎉 CHECKUP VERT — pastille, un seul toast, rien à la réouverture au même nombre, un nouveau s'il " +
    "change, " +
    "rien pendant l'urgence ni en lecture seule, moteur cassé sans effet, passe sous 50 ms.");
  process.exit(0);
})();
