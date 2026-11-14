#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-georef-reglages.js — checkup (Playwright, pas un hook pré-commit) : le calage des Réglages gagne
// =====================================================================
// Relevé fictif chargé en ZIP avec un calage EMBARQUÉ A/B (plan.georef). Par la vraie fenêtre Réglages >
// Géoréférencement (décision produit : le calage saisi ici gagne sur celui du plan, tout de suite et au
// rechargement — KmzExport > appliquerCalageUtilisateur, main.js > _propagerGeorefVersKmzExport) :
//   • B modifié puis C ajouté : localStorage, PLAN_CONFIG.plan.georef (lu en premier par le Secours), registre,
//     OsmView.getGeorefEffectif (fond OSM, Vue OSM) suivent ;
//   • fond OSM allumé : recalculé sur le nouveau calage SANS être rallumé (kta:georefChange) ;
//   • plan rouvert depuis l'accueil : le calage des Réglages reste (le ZIP redonne pourtant A/B) ;
//   • garde-fou : un calage local périmé (points hors du plan) laisse la place au calage embarqué ;
//   • la limite (plan régénéré) est dite dans la fenêtre.
// Usage : node scripts/smoke/checkup-georef-reglages.js (SMOKE_PORT pour une autre copie) · doc : vue-osm.md § 2.2
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Relevé fictif en ZIP, calage embarqué A/B fictif (en mer, près de 0°/0°).
async function ouvrirFictifCale(page) {
  return page.evaluate(async function () {
    const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
    if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
    const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
    const zip = new JSZip();
    const chemins = [cfg.plan.baseImage]
      .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
      .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
    for (const p of Array.from(new Set(chemins))) {
      const r = await fetch(window.resolveServerPath(p, srv.path));
      if (r.ok) zip.file(p, await r.blob());
    }
    const W = cfg.plan.imageWidth, H = cfg.plan.imageHeight;
    cfg.plan.georef = {
      pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
      pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2.4e-6 },
      modele: "local"
    };
    zip.file("plan-config.json", JSON.stringify(cfg));
    const blob = await zip.generateAsync({ type: "blob" });
    window.__zipFictif = blob;   // « Mettre à jour le plan » repart de ce ZIP (calage embarqué A/B)
    await window.chargerZipFichier(new File([blob], "fictif-georef.zip", { type: "application/zip" }), "auto", { storeBlob: true });
    return { ok: true, embarque: cfg.plan.georef };
  });
}

// Saisie par la vraie fenêtre Réglages > Géoréférencement ; champs { B?: {x,y,lat,lng}, C?: {...} }.
async function saisirReglages(page, champs) {
  return page.evaluate(async function (ch) {
    const s = document.getElementById("kta-cfg-georef-modal"); if (s && s._ktaFermer) s._ktaFermer();
    if (!document.getElementById("kta-cfg-modal")) window.afficherConfig();
    await new Promise(function (r) { setTimeout(r, 500); });
    document.getElementById("cfg_georef_open").click();
    await new Promise(function (r) { setTimeout(r, 400); });
    const poser = function (id, v) {
      const el = document.getElementById(id);
      el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    Object.keys(ch).forEach(function (L) {
      const p = ch[L];
      poser("cfg_kmz_" + L + "_x", String(p.x)); poser("cfg_kmz_" + L + "_y", String(p.y));
      poser("cfg_kmz_" + L + "_coords", p.lat.toFixed(7) + ", " + p.lng.toFixed(7));
    });
    document.getElementById("cfg_kmz_save").click();
    await new Promise(function (r) { setTimeout(r, 300); });
    const note = document.getElementById("cfg_kmz_note_gagne");
    return { statut: (document.getElementById("cfg_kmz_status") || {}).textContent || "",
             okAttendu: window.I18n.t("config.georef.okSaved"),
             note: !!note && note.offsetHeight > 0 && note.textContent === window.I18n.t("config.georef.noteGagne") };
  }, champs);
}

// État de toutes les sources pour le point P (« B » ou « C ») attendu.
function lireSources(attendu) {
  const KE = window.KmzExport, id = window._currentLoadedPlanId;
  const proche = function (p) { return !!p && Math.abs(p.lat - attendu.p.lat) < 1e-6 && Math.abs(p.lng - attendu.p.lng) < 1e-6; };
  const cle = "point" + attendu.L;
  const ent = window.PlanRegistry.findById(id);
  const g = window.PLAN_CONFIG.plan.georef;
  const eff = window.OsmView.getGeorefEffectif();
  return { localStorage: proche((KE.getCalibration(id) || {})[cle]), planConfigSecours: proche(g && g[cle]),
           registre: proche(ent && ent.georef && ent.georef[cle]), effectifFondVueOsm: proche(eff && eff[cle]) };
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  try {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on("pageerror", function (e) { erreurs.push(String(e)); });
    await page.addInitScript(function (ls) { for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} } }, LS_PREGATES);
    await page.route(/tile\.openstreetmap\.org/, function (r) { r.abort(); });
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

    console.log("— Plan au calage embarqué —");
    const ouvert = await ouvrirFictifCale(page);
    if (!ouvert.ok) { pb(ouvert.raison); return; }
    await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
    await page.waitForTimeout(2000);
    const id = await page.evaluate(function () { return window._currentLoadedPlanId; });
    const dims = await page.evaluate(function () { return { W: window.APP_CONFIG.imageWidth, H: window.APP_CONFIG.imageHeight }; });
    const eff0 = await page.evaluate(function () { return window.OsmView.getGeorefEffectif(); });
    verifier(eff0 && Math.abs(eff0.pointB.lat - ouvert.embarque.pointB.lat) < 1e-9, "calage embarqué lu au départ", eff0 && eff0.pointB);

    // Fond allumé, espion sur les transformations qu'il calcule
    await page.evaluate(function () {
      const KE = window.KmzExport, orig = KE.buildTransformCalib;
      window.__fondCalages = [];
      KE.buildTransformCalib = function (g) {
        if (/fondOsmPlan/.test(new Error().stack || "")) window.__fondCalages.push(JSON.parse(JSON.stringify(g)));
        return orig.apply(this, arguments);
      };
      window.FondOsmPlan.majBouton(); window.FondOsmPlan.allumer();
    });
    await page.waitForTimeout(800);
    verifier(await page.evaluate(function () { return window.FondOsmPlan.etat().allume; }), "fond OSM allumé");

    console.log("— Réglages : point B modifié —");
    const B2 = Object.assign({}, ouvert.embarque.pointB, { lat: ouvert.embarque.pointB.lat + 0.0003 });
    const nFond1 = await page.evaluate(function () { return window.__fondCalages.length; });
    const s1 = await saisirReglages(page, { B: B2 });
    verifier(s1.statut === s1.okAttendu, "enregistrement accepté", s1.statut);
    verifier(s1.note, "la fenêtre dit la limite (plan régénéré, « Effacer »)", s1);
    const src1 = await page.evaluate(lireSources, { L: "B", p: B2 });
    Object.keys(src1).forEach(function (k) { verifier(src1[k], "B modifié suivi : " + k, src1); });
    const f1 = await page.evaluate(function (n) {
      const nouveaux = window.__fondCalages.slice(n);
      return { n: nouveaux.length, dernierB: nouveaux.length ? nouveaux[nouveaux.length - 1].pointB : null,
               allume: window.FondOsmPlan.etat().allume };
    }, nFond1);
    verifier(f1.allume && f1.n > 0 && f1.dernierB && Math.abs(f1.dernierB.lat - B2.lat) < 1e-6,
      "fond OSM recalculé sur le nouveau B sans être rallumé", f1);

    console.log("— Réglages : point C ajouté —");
    const C = await page.evaluate(function (d) {
      const KE = window.KmzExport, g = window.OsmView.getGeorefEffectif();
      const p = KE.planToGps(KE.buildTransformCalib(g), d.W, 0);
      return { x: d.W, y: 0, lat: p.lat + 0.00045, lng: p.lng };
    }, dims);
    const nFond2 = await page.evaluate(function () { return window.__fondCalages.length; });
    const s2 = await saisirReglages(page, { C: C });
    verifier(s2.statut === s2.okAttendu, "enregistrement du C accepté (non colinéaire)", s2.statut);
    const src2 = await page.evaluate(lireSources, { L: "C", p: C });
    Object.keys(src2).forEach(function (k) { verifier(src2[k], "C ajouté suivi : " + k, src2); });
    const f2 = await page.evaluate(function (n) {
      const nouveaux = window.__fondCalages.slice(n);
      return { n: nouveaux.length, avecC: nouveaux.length ? !!nouveaux[nouveaux.length - 1].pointC : false };
    }, nFond2);
    verifier(f2.n > 0 && f2.avecC, "fond OSM recalculé avec le C sans être rallumé", f2);

    console.log("— Plan rouvert depuis l'accueil —");
    await page.evaluate(function () {
      const s = document.getElementById("kta-cfg-georef-modal"); if (s && s._ktaFermer) s._ktaFermer();
      if (typeof window.afficherLoader === "function") window.afficherLoader();
    });
    await page.waitForTimeout(1500);
    await page.locator('.plan-row[data-id="' + id + '"] .plan-row-name-text').first().click();
    await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.PLAN_CONFIG.plan; }, 90000);
    await page.waitForTimeout(2500);
    const src3 = await page.evaluate(lireSources, { L: "C", p: C });
    verifier(src3.planConfigSecours && src3.effectifFondVueOsm, "rouvert : le calage des Réglages reste (PLAN_CONFIG, Vue OSM)", src3);
    const src3b = await page.evaluate(lireSources, { L: "B", p: B2 });
    verifier(src3b.planConfigSecours && src3b.effectifFondVueOsm, "rouvert : le B modifié reste", src3b);

    console.log("— Mettre à jour le plan : le plan-config produit porte le calage des Réglages —");
    const maj = await page.evaluate(async function (id) {
      let zipProduit = null;
      const fini = new Promise(function (r) {
        window.ktaGenerateurMaj({ planId: id, zip: new File([window.__zipFictif], "fictif-georef.zip", { type: "application/zip" }),
          calques: [], legende: null, onZip: function (b) { zipProduit = b; r(); } });
      });
      for (let i = 0; i < 100 && !document.getElementById("pl_geo_B_coords"); i++) await new Promise(function (r) { setTimeout(r, 100); });
      await new Promise(function (r) { setTimeout(r, 1500); });
      const statut = (document.getElementById("kta-planner-zip-status") || {}).textContent || "";
      const v2 = document.getElementById("pl_tilingV2"); if (v2 && v2.checked) v2.click();
      document.getElementById("kta-planner-generer").click();
      await Promise.race([fini, new Promise(function (r) { setTimeout(r, 60000); })]);
      if (!zipProduit) return { ok: false, statut: statut, erreur: (document.getElementById("kta-planner-erreur") || {}).textContent || "" };
      const z = await JSZip.loadAsync(zipProduit);
      const cfg = JSON.parse(await z.file("plan-config.json").async("string"));
      return { ok: true, statut: statut, phrase: window.I18n.t("gen.maj.georefReglages"), georef: cfg.plan && cfg.plan.georef };
    }, id);
    verifier(maj.ok, "Mettre à jour le plan : ZIP produit", maj);
    if (maj.ok) {
      const g = maj.georef || {};
      verifier(g.pointB && Math.abs(g.pointB.lat - B2.lat) < 1e-6, "plan-config produit : le B modifié dans les Réglages", g.pointB);
      verifier(g.pointC && Math.abs(g.pointC.lat - C.lat) < 1e-6, "plan-config produit : le C ajouté dans les Réglages", g.pointC);
      verifier(maj.statut.indexOf(maj.phrase) >= 0, "le Générateur dit que le calage des Réglages remplace celui du plan", maj.statut);
    }
    await page.evaluate(function () { const m = document.getElementById("kta-planner-modal"); if (m) m.remove(); });

    console.log("— Garde-fou : calage local périmé —");
    const perime = await page.evaluate(function (emb) {
      const KE = window.KmzExport, id = window._currentLoadedPlanId, W = window.APP_CONFIG.imageWidth;
      const vieux = JSON.parse(JSON.stringify(emb));
      vieux.pointB.x = W * 3;   // point hors du plan : calage d'un ancien canvas
      KE.setCalibration(id, vieux);
      window.PLAN_CONFIG.plan.georef = JSON.parse(JSON.stringify(emb));
      window._propagerGeorefVersKmzExport(id);
      return { planConfigB: window.PLAN_CONFIG.plan.georef.pointB.x, lsB: KE.getCalibration(id).pointB.x, attendu: emb.pointB.x };
    }, ouvert.embarque);
    verifier(perime.planConfigB === perime.attendu && perime.lsB === perime.attendu,
      "calage local périmé : le calage embarqué reprend (mémoire et localStorage)", perime);

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
    await ctx.close();
  } catch (e) {
    pb("exception : " + (e && e.stack || e));
  } finally {
    await nav.close();
    console.log("");
    console.log(problemes.length ? "❌ Calage des Réglages : " + problemes.length + " problème(s)" : "✅ Calage des Réglages gagne partout");
    process.exit(problemes.length ? 1 : 0);
  }
})();
