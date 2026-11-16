#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-secteur-volume.js — checkup (Playwright) : secteur propre au ⛏️ Volume exploité, par plan et par niveau
// =====================================================================
// Relevé fictif vidé de ses objets, échelle forcée à 2 px/m (1 m² = 4 px²), plan vu en multi-niveau :
// A. « Dessiner le secteur » (niveau 0) : la fenêtre se cache, barre Valider / Annuler, 4 touchers sur la carte (geste
//    de ♦️ Surface), Valider → fenêtre revenue, secteur 100×100 px = 2 500 m² ; la mesure ♦️ d'avant est rendue intacte ;
// B. rechargement de la page : le secteur est retrouvé (appareil) ;
// C. niveau −1 coché sans secteur : « Reprendre le secteur du niveau 0 » ; hauteur −1 = 3 m (Réglages) → total
//    2 500 × 2 + 2 500 × 3 = 12 500 m³, secteur 5 000 m², détail par niveau ; décoché 0 → −1 seul, 7 500 m³ ;
// D. Annuler (Échap) et secteur trop court (2 sommets) : rien ne change, la mesure est rendue ;
// E. capture de la fenêtre à deux niveaux (SV_SHOTS=<dossier>).
// Usage : node scripts/smoke/checkup-secteur-volume.js · code : js/volumeExploite.js (secteurs, sommerNiveaux)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const path = require("path");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const CAPTURES = process.env.SV_SHOTS || null;
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function verifier(c, m, d) { if (c) ok(m); else pb(m + (d !== undefined ? " " + JSON.stringify(d) : "")); }
function net(s) { return String(s || "").replace(/[\s  ]/g, ""); }

async function ouvrirPlan(page, premier) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const b = document.getElementById("kta-alert-ok"); if (b) b.click();
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () { return window.__pret && !!window.map && !!window.KtaVolumeExploite; }, 60000);
  await page.waitForTimeout(2500);
  await page.evaluate(function (premier) {
    const m = document.getElementById("kta-session-modal"); if (m) m.remove();
    const c = window.map.getCenter(), H = window.PLAN_CONFIG.plan.imageHeight;
    window.__sv = { x: Math.round(c.lng) - 50, y: Math.round(H - c.lat) - 50 };
    const A = window.APP_CONFIG;
    A.scale = 2;   // en mémoire seulement
    A.multiLevel = true;
    A.availableLevels = [-1, 0];
    A.visibleLevels = [-1, 0];
    A.activeLevel = 0;
    window.setStructures([]);
    window.setZones([]);
    window._ktaDataStructurePolygons.splice(0);
    window._ktaDataPolygons.splice(0);
    if (premier) {
      window.KtaVolumeExploite.secteurs.retirer(window._currentLoadedPlanId);
      const k = "myktamap_plan_prefs_" + (window._currentLoadedPlanId || "default");
      try {
        const p = JSON.parse(localStorage.getItem(k) || "{}");
        delete p.hauteurGalerieM; delete p.niveauxHauteur;
        localStorage.setItem(k, JSON.stringify(p));
      } catch (e) { /* rien */ }
    }
  }, !!premier);
}

function ouvrir(page) {
  return page.evaluate(function () { window.KtaVolumeExploite.ouvrir(); });
}
function lire(page) {
  return page.evaluate(function () {
    const m = document.getElementById("kta-volume-modal");
    if (!m) return null;
    const lignes = {};
    m.querySelectorAll(".kta-readme-modal-corps > .kta-volume-table tr").forEach(function (tr) {
      lignes[tr.querySelector("th").textContent] = tr.querySelector("td").textContent;
    });
    const t = window.I18n.t.bind(window.I18n);
    return { portee: (m.querySelector("#kta-volume-portee") || {}).textContent || "",
      secteur: lignes[t("volume.secteur")], volume: lignes[t("volume.volume")], videVol: lignes[t("volume.videVol")],
      detail: m.querySelectorAll("#kta-volume-detail .kta-volume-table").length,
      champH: !!m.querySelector("#kta-volume-h"), sans: !!m.querySelector(".kta-volume-sans") };
  });
}
function cliquer(page, sel) {
  return page.evaluate(function (sel) {
    const b = document.querySelector(sel);
    if (!b) return false;
    b.click();
    return true;
  }, sel);
}
// Touchers sur la carte (coordonnées plan relatives au coin du secteur), comme un clic de l'utilisateur.
function toucher(page, pts) {
  return page.evaluate(function (pts) {
    const o = window.__sv, H = window.PLAN_CONFIG.plan.imageHeight;
    pts.forEach(function (p) { window.map.fire("click", { latlng: window.L.latLng(H - (o.y + p[1]), o.x + p[0]) }); });
  }, pts);
}
function mesure(page) {
  return page.evaluate(function () { return JSON.stringify(window.getMeasurePointsSurface()); });
}

(async () => {
  const browser = await lancerNavigateur(chromium);
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  await ctx.addInitScript(function (ls) {
    try { for (const k in ls) localStorage.setItem(k, ls[k]); } catch (e) { /* rien */ }
  }, LS_PREGATES);
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  await ouvrirPlan(page, true);
  const T = await page.evaluate(function () {
    const t = window.I18n.t.bind(window.I18n);
    return { un: t("volume.niveauCalcul", { liste: "0" }), deux: t("volume.niveauxCalcul", { liste: "−1, 0" }),
      moins1: t("volume.niveauCalcul", { liste: "−1" }), aucun: t("volume.secteur.aucun") };
  });
  // Mesure ♦️ en cours (3 sommets) : elle doit être rendue telle quelle après chaque dessin du secteur.
  await page.evaluate(function () {
    const o = window.__sv;
    window.setMeasurePointsSurface([{ x: o.x + 500, y: o.y }, { x: o.x + 520, y: o.y }, { x: o.x + 520, y: o.y + 20 }]);
  });
  const mesureAvant = await mesure(page);

  console.log("\n══ A. dessin du secteur ══");
  await ouvrir(page);
  let f = await lire(page);
  verifier(f && f.sans && f.portee === T.un, "sans secteur : la fenêtre le dit et nomme le niveau du calcul (0)", f);
  verifier(await cliquer(page, '#kta-volume-modal [data-va="dessiner"][data-vn="0"]'), "« Dessiner le secteur » du niveau 0");
  const pendant = await page.evaluate(function () {
    return { fenetre: !!document.getElementById("kta-volume-modal"), barre: !!document.querySelector(".kta-volume-dessin-barre"),
      arme: window.modeMesure === true && window.getMeasureMode() === "surface" &&
        window.getMeasurePointsSurface().length === 0 };
  });
  verifier(!pendant.fenetre && pendant.barre && pendant.arme,
    "pendant le dessin : fenêtre cachée, barre Valider / Annuler, outil ♦️ armé sur une surface vide", pendant);
  await toucher(page, [[0, 0], [100, 0], [100, 100], [0, 100]]);
  await cliquer(page, '.kta-volume-dessin-barre [data-vd="valider"]');
  await page.waitForTimeout(300);
  f = await lire(page);
  verifier(f && net(f.secteur) === "2500m²" && net(f.volume) === "5000m³" && f.champH,
    "Valider : fenêtre revenue, secteur 2 500 m², volume 5 000 m³ à 2 m", f);
  verifier(await mesure(page) === mesureAvant && await page.evaluate(function () { return window.modeMesure === false; }),
    "la mesure ♦️ d'avant est rendue intacte, l'outil désarmé");

  console.log("\n══ B. rechargement ══");
  await ouvrirPlan(page, false);
  await ouvrir(page);
  f = await lire(page);
  verifier(f && net(f.secteur) === "2500m²", "page rechargée : le secteur du niveau 0 est retrouvé (appareil)", f);

  console.log("\n══ C. deux niveaux ══");
  await page.evaluate(function () { window.setHauteurNiveau(-1, 3); });
  await cliquer(page, '#kta-volume-modal input[data-vn="-1"]');
  await page.waitForTimeout(200);
  const ligneM1 = await page.evaluate(function () {
    const cb = document.querySelector('#kta-volume-modal input[data-vn="-1"]');
    const l = cb && cb.closest(".kta-volume-niv");
    return { coche: !!cb && cb.checked, etat: l ? l.querySelector(".kta-volume-niv-etat").textContent : null,
      voisin: !!(l && l.querySelector('[data-va="voisin"][data-vde="0"]')) };
  });
  verifier(ligneM1.coche && ligneM1.etat === T.aucun && ligneM1.voisin,
    "niveau −1 coché : « pas de secteur », « Reprendre le secteur du niveau 0 » proposé", ligneM1);
  await cliquer(page, '#kta-volume-modal [data-va="voisin"][data-vn="-1"]');
  await page.waitForTimeout(200);
  f = await lire(page);
  verifier(f && f.portee === T.deux && net(f.secteur) === "5000m²" && net(f.volume) === "12500m³" &&
    net(f.videVol) === "12500m³" && f.detail === 2 && !f.champH,
  "−1 + 0 : « niveaux −1, 0 (total) », 5 000 m², 2 500 × 3 + 2 500 × 2 = 12 500 m³, détail par niveau, pas de champ",
    f);
  if (CAPTURES) {
    await page.evaluate(function () { document.getElementById("kta-volume-detail").open = true; });
    const boite = await page.$("#kta-volume-modal .kta-readme-modal-boite");
    await boite.screenshot({ path: path.join(CAPTURES, "secteur-volume-deux-niveaux.png") });
    console.log("  •  capture : " + path.join(CAPTURES, "secteur-volume-deux-niveaux.png"));
  }
  await cliquer(page, '#kta-volume-modal input[data-vn="0"]');
  await page.waitForTimeout(200);
  f = await lire(page);
  verifier(f && f.portee === T.moins1 && net(f.volume) === "7500m³" && f.champH,
    "0 décoché : niveau −1 seul, 7 500 m³ (sa hauteur 3 m), champ de hauteur revenu", f);
  await ouvrirPlan(page, false);
  await ouvrir(page);
  f = await lire(page);
  verifier(f && f.portee === T.moins1, "rechargé : les niveaux cochés sont retenus (−1)", f && f.portee);
  await cliquer(page, '#kta-volume-modal [data-va="tous"]');
  await page.waitForTimeout(200);
  f = await lire(page);
  verifier(f && f.portee === T.deux, "« Tous » : les deux niveaux comptés", f && f.portee);

  console.log("\n══ D. annuler, trop court ══");
  const avant = await page.evaluate(function () {
    return JSON.stringify(window.KtaVolumeExploite.secteurs.lire(window._currentLoadedPlanId).niveaux);
  });
  await cliquer(page, '#kta-volume-modal [data-va="dessiner"][data-vn="0"]');
  await toucher(page, [[0, 0], [30, 0], [30, 30]]);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  let apres = await page.evaluate(function () {
    return JSON.stringify(window.KtaVolumeExploite.secteurs.lire(window._currentLoadedPlanId).niveaux);
  });
  verifier(apres === avant && !!(await lire(page)) && await mesure(page) === mesureAvant,
    "Échap : secteur inchangé, fenêtre revenue, mesure rendue");
  await cliquer(page, '#kta-volume-modal [data-va="dessiner"][data-vn="0"]');
  await toucher(page, [[0, 0], [30, 0]]);
  await cliquer(page, '.kta-volume-dessin-barre [data-vd="valider"]');
  await page.waitForTimeout(300);
  apres = await page.evaluate(function () {
    return JSON.stringify(window.KtaVolumeExploite.secteurs.lire(window._currentLoadedPlanId).niveaux);
  });
  const toast = await page.evaluate(function () { return (document.getElementById("kta-toast") || {}).textContent || ""; });
  const attendu = await page.evaluate(function () { return window.I18n.t("volume.secteur.tropCourt"); });
  verifier(apres === avant && toast.indexOf(attendu) >= 0, "2 sommets : refusé avec un message, secteur inchangé", toast);

  verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 5));
  await page.evaluate(function () { window.KtaVolumeExploite.secteurs.retirer(window._currentLoadedPlanId); });
  await browser.close();
  console.log("\n" + (problemes.length ? "❌ " + problemes.length + " problème(s)" :
    "✅ Secteur du volume : dessin, retrouvé, repris, niveaux additionnés, annulation"));
  process.exit(problemes.length ? 1 : 0);
})().catch(function (e) {
  console.error(e);
  lancerNavigateur.fermerTout().then(function () { process.exit(2); });   // navigateurs fermés avant de sortir
});
