#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-effacer-session-partage.js — checkup (Playwright, pas un hook pré-commit) : « Effacer la session »,
// plan local et plan partagé par une extension (prises effacerSession et auteurObjet simulées)
// =====================================================================
// Rejoue la vraie fenêtre « session restaurée » → 🗑️ Effacer la session :
//   1. plan local : la confirmation de l'app, sans choix ; aucune trace posée ;
//   2. prise { miens, tout } : trois choix, nombres annoncés ; « Vider cet appareil » ne pose aucune trace ;
//   3. « Supprimer mes ajouts » : confirmation chiffrée, une trace par objet créé par le compte, anciennes gardées ;
//   4. « Tout supprimer » : une trace par objet, datée après l'objet ;
//   5. droit « modifier » ({ miens } seul) : pas de « tout » ; prise en erreur : « Vider cet appareil » seul ;
//   6. droit retiré entre l'ouverture et la confirmation : refus nommé, rien n'est effacé.
// 🩸 check-extensions.js lit le câblage ; seul ce parcours voit la fenêtre, les setters réels et l'ordre
// snapshot → vidage → traces → sauvegarde.
// Usage : node scripts/smoke/checkup-effacer-session-partage.js · doc : docs/architecture/session-data.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:8123";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

// Même repli que checkup-plan-oriente.js : on ouvre ce que l'index propose, en le disant.
function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) {
    return { nom: "Relevé fictif de test", fictif: true };
  }
}

const PLAN = planAOuvrir();
const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verif(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }

const FUTUR = Date.now() + 3600000;   // un objet modifié « dans une heure » (horloge d'un autre appareil en avance)

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.KtaUid; }, 20000);
  await page.waitForTimeout(2000);
}

// Session : trois points créés par « moi » (dont un daté dans le futur), un par « autre », une ancienne trace ;
// sauvegardée, puis plan rouvert → fenêtre « session restaurée ».
async function poserEtRouvrir(page) {
  await page.evaluate(function (futur) {
    const t0 = Date.now() - 3600000;
    const p = function (uid, nom, ts) { return { uid: uid, id: nom, name: nom, x: 1000, y: 1000, tag: "puits", updatedAt: ts || t0 }; };
    window.setEditorPoints([p("pt_moi1", "Mien 1"), p("pt_moi2", "Mien 2", futur), p("pt_moi3", "Mien 3"), p("pt_aut1", "Autre 1")]);
    window.KtaUid.setTombstones([{ uid: "pt_ancien", deletedAt: t0 + 60000 }]);
    if (window.renderEditorPoints) window.renderEditorPoints();
    window.SessionPersist.save({ force: true });
  }, FUTUR);
  await page.waitForTimeout(1200);
  await ouvrir(page);
  await attendre(page, function () { return !!document.querySelector('#kta-session-modal [data-action="clear"]'); }, 10000);
}

// Prise simulée : le plan affiché passe pour un plan d'extension partagé ; `rep` = réponse d'effacerSession
// ("panne" = exception ; { suite } = réponse des appels suivants).
async function simulerPrise(page, rep) {
  await page.evaluate(function (rep) {
    const id = window._currentLoadedPlanId, orig = window.PlanRegistry.findById.bind(window.PlanRegistry);
    window.PlanRegistry.findById = function (x) { return x === id ? { type: "ext", extId: "simule" } : orig(x); };
    window.__appelsPrise = 0;
    window.KtaExtensions.register({ nom: "checkup-effacer", apiVersion: 1,
      effacerSession: function () {
        window.__appelsPrise++;
        if (rep === "panne") throw new Error("panne simulée");
        const r = (window.__appelsPrise > 1 && rep.suite) ? rep.suite : rep;
        return Promise.resolve({ miens: r.miens, tout: r.tout, auteur: r.auteur });
      },
      auteurObjet: function (uid) { return { createur: /^pt_moi/.test(uid) ? "moi" : "autre", modifiePar: null }; }
    });
  }, rep);
}

// Clic sur 🗑️, lecture de la fenêtre de choix (ou de la confirmation de l'app), choix coché, OK ; la 2e
// confirmation éventuelle est lue puis acceptée. → { choix, aides, premiere, seconde, alerte, apres }
async function effacer(page, valeur) {
  await page.evaluate(function () { document.querySelector('#kta-session-modal [data-action="clear"]').click(); });
  await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 15000);
  await page.waitForTimeout(450);   // garde anti-double-clic de ktaConfirm
  const vue = await page.evaluate(function () {
    const radios = [].slice.call(document.querySelectorAll("[data-kta-confirm-choix]"));
    const ov = document.getElementById("kta-confirm-oui").closest(".kta-readme-modal-overlay");
    return { choix: radios.map(function (r) { return r.value; }),
      aides: radios.map(function (r) { return r.parentNode.textContent; }), premiere: ov ? ov.textContent : "" };
  });
  await page.evaluate(function (v) {
    const r = v ? document.querySelector('[data-kta-confirm-choix="' + v + '"]') : null;
    if (r) r.click();
    document.getElementById("kta-confirm-oui").click();
  }, valeur || "");
  await page.waitForTimeout(900);
  const suite = await page.evaluate(function () {
    const o = document.getElementById("kta-confirm-oui");
    const ov = o ? o.closest(".kta-readme-modal-overlay") : null;
    return ov ? { texte: ov.textContent, annuler: !!document.getElementById("kta-confirm-non") } : null;
  });
  if (suite && suite.annuler) {
    vue.seconde = suite.texte;
    await page.waitForTimeout(450);
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
  } else if (suite) {
    vue.alerte = suite.texte;
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
  }
  await page.waitForTimeout(1500);
  vue.apres = await page.evaluate(function () {
    const traces = window.KtaUid.getTombstones();
    const lu = window.SessionPersist.getSaved();
    return { pts: window.getEditorPoints().map(function (p) { return p.uid; }).sort(),
      traces: traces.map(function (t) { return t.uid; }).sort(),
      futur: (traces.find(function (t) { return t.uid === "pt_moi2"; }) || {}).deletedAt || null,
      tracesEcrites: lu ? (lu.tombstones || []).map(function (t) { return t.uid; }).sort() : [] };
  });
  return vue;
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("pageerror", function (e) { pb("erreur de page : " + e.message); });
  const TOUS = ["pt_aut1", "pt_moi1", "pt_moi2", "pt_moi3"];
  try {
    await ouvrir(page);
    if (!PLAN.fictif) inf("⚠️ relevé fictif absent de data/index.json : le checkup tourne sur un autre plan de l'index");

    // 1. Plan local.
    await poserEtRouvrir(page);
    const v1 = await effacer(page, "");
    verif(!v1.choix.length && !v1.seconde, "plan local : confirmation de l'app, sans choix ni seconde confirmation", v1);
    verif(!v1.apres.pts.length && !v1.apres.traces.length, "plan local : session vidée, aucune trace (inchangé)", v1.apres);

    // 2. Prise { miens, tout } : vider l'appareil.
    await poserEtRouvrir(page);
    await simulerPrise(page, { miens: true, tout: true, auteur: "moi" });
    const v2 = await effacer(page, "appareil");
    verif(v2.choix.join() === "appareil,miens,tout", "plan partagé, droit « gérer » : trois choix", v2.choix);
    verif(/(^|\D)3 objet/.test(v2.aides[1] || "") && /(^|\D)4 objet/.test(v2.aides[2] || ""),
      "les choix annoncent 3 objets à moi, 4 en tout", v2.aides);
    verif(/reviendra/.test(v2.aides[0] || ""), "« Vider cet appareil » dit que tout reviendra du serveur", v2.aides[0]);
    verif(!v2.seconde && !v2.apres.pts.length && !v2.apres.traces.length,
      "Vider cet appareil : aucune seconde confirmation, aucune trace", v2.apres);

    // 3. Supprimer mes ajouts.
    await poserEtRouvrir(page);
    await simulerPrise(page, { miens: true, tout: true, auteur: "moi" });
    const v3 = await effacer(page, "miens");
    verif(!!v3.seconde && /(^|\D)3 objet/.test(v3.seconde), "mes ajouts : confirmation qui annonce 3 objets", v3.seconde);
    verif(JSON.stringify(v3.apres.traces) === JSON.stringify(["pt_ancien", "pt_moi1", "pt_moi2", "pt_moi3"]),
      "mes ajouts : une trace par objet à moi, aucune pour l'autre, l'ancienne gardée", v3.apres.traces);
    verif(JSON.stringify(v3.apres.tracesEcrites) === JSON.stringify(v3.apres.traces), "mes ajouts : traces écrites dans la session",
      v3.apres.tracesEcrites);
    verif(v3.apres.futur > FUTUR, "🩸 trace datée après l'objet (horloge en avance)", v3.apres.futur);
    verif(!v3.apres.pts.length, "mes ajouts : l'appareil est vidé (les objets des autres reviendront de la synchro)", v3.apres.pts);

    // 4. Tout supprimer.
    await poserEtRouvrir(page);
    await simulerPrise(page, { miens: true, tout: true, auteur: "moi" });
    const v4 = await effacer(page, "tout");
    verif(!!v4.seconde && /(^|\D)4 objet/.test(v4.seconde) && /tous les membres/.test(v4.seconde),
      "tout : confirmation « 4 objets … pour tous les membres »", v4.seconde);
    verif(JSON.stringify(v4.apres.traces) === JSON.stringify(["pt_ancien"].concat(TOUS)), "tout : une trace par objet", v4.apres.traces);

    // 5. Droit « modifier », puis prise en erreur.
    await poserEtRouvrir(page);
    await simulerPrise(page, { miens: true, tout: false, auteur: "moi" });
    const v5 = await effacer(page, "appareil");
    verif(v5.choix.join() === "appareil,miens", "droit « modifier » : pas de « Tout supprimer »", v5.choix);
    await poserEtRouvrir(page);
    await simulerPrise(page, "panne");
    const v6 = await effacer(page, "appareil");
    verif(v6.choix.join() === "appareil" && !v6.apres.traces.length, "🔒 prise en erreur : « Vider cet appareil » seul, aucune trace", v6);

    // 6. Droit retiré pendant que la fenêtre est ouverte.
    await poserEtRouvrir(page);
    await simulerPrise(page, { miens: true, tout: true, auteur: "moi", suite: { miens: true, tout: false, auteur: "moi" } });
    const v7 = await effacer(page, "tout");
    verif(!!v7.alerte && !v7.seconde, "🔒 droit relu au clic : refus nommé, pas de confirmation", v7.alerte);
    verif(JSON.stringify(v7.apres.pts) === JSON.stringify(TOUS) && JSON.stringify(v7.apres.traces) === JSON.stringify(["pt_ancien"]),
      "🔒 droit retiré : rien n'est effacé", v7.apres);
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("✅ CHECKUP VERT — « Effacer la session » : plan local inchangé, plan partagé en trois choix");
})();
