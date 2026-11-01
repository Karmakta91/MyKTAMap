#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-suppr-zone.js — checkup (Playwright) : sélection par zone et suppression en lot (sélection multiple 🎯)
// =====================================================================
// Objets FICTIFS posés au centre de la vue (relevé fictif, sinon le premier plan de l'index) et un calque de données
// fabriqué ici. Parcours réel : fiche → 🔄 Convertir → 🎯 Sélection multiple → ✏️ Sélectionner par zone (clics carte
// sur l'outil ♦️ Surface) → ✅ Prendre la zone → re-clics → 🗑️ Supprimer (N) → confirmation à cases → un ⏪.
// Vérifie : objet dedans pris, à cheval et autre niveau non pris, objets de calque ignorés et comptés, point avec
// photo (photo gardée « sans point », annoncée), re-clic qui retire, mesure ♦️ d'avant rendue, traces de
// suppression posées puis retirées par le ⏪, une case de famille décochée qui garde sa famille, ✅ Convertir
// compté sur les seuls convertibles.
// 🩸 check-selection-multi.js teste la règle dans un `vm` ; seul ce parcours voit le bandeau, l'outil de mesure,
// ktaConfirm, l'historique, les traces et le stockage des photos réels.
// Usage : node scripts/smoke/checkup-suppr-zone.js (SMOKE_PORT pour une autre copie) · code : js/selectionZone.js,
// js/selectionMulti.js · doc : docs/architecture/session-data.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const CALQUE = "csz_calque_test";

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Zone = carré de 200 px plan à partir de (x, y) ; objets fictifs dedans, à cheval, dehors, autre niveau.
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const x = Math.round(c.lng) - 100, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 100;
    // Multi-niveau forcé pour le cas « autre niveau » : niveau actif 0, seul visible.
    window.APP_CONFIG.multiLevel = true;
    window.APP_CONFIG.activeLevel = 0;
    window.APP_CONFIG.visibleLevels = [0];
    const L2 = function (x0, y0, x1, y1) { return [{ x: x0, y: y0 }, { x: x1, y: y1 }]; };
    const C = function (x0, y0, d) {
      return [{ x: x0, y: y0 }, { x: x0 + d, y: y0 }, { x: x0 + d, y: y0 + d }, { x: x0, y: y0 + d }];
    };
    window.__csz = { x: x, y: y };
    window.setRoads([
      { uid: "rd_csz_in", type: "principal", level: 0, points: L2(x + 20, y + 20, x + 120, y + 20) },
      { uid: "rd_csz_cheval", type: "principal", level: 0, points: L2(x + 150, y + 60, x + 260, y + 60) },
      { uid: "rd_csz_niv", type: "principal", level: -1, points: L2(x + 20, y + 100, x + 120, y + 100) },
      { uid: "rd_csz_graine", type: "principal", level: 0, points: L2(x + 300, y + 20, x + 380, y + 20) }
    ]);
    window.setZones([{ uid: "zn_csz_in", type: "eau", level: 0, points: C(x + 130, y + 130, 30) }]);
    window.setStructures([{ uid: "st_csz_in", type: "pilier-1", level: 0, points: C(x + 40, y + 140, 30) }]);
    window.setEditorPoints([
      { uid: "pt_csz_photo", id: "Fictif photo", nom: "Fictif photo", x: x + 60, y: y + 60, level: 0 },
      { uid: "pt_csz_in2", id: "Fictif deux", nom: "Fictif deux", x: x + 100, y: y + 170, level: 0 },
      { uid: "pt_csz_out", id: "Fictif dehors", nom: "Fictif dehors", x: x + 320, y: y + 120, level: 0 }
    ]);
    // Une mesure ♦️ en cours : la zone ne doit pas l'effacer.
    window.setMeasurePointsSurface([{ x: x - 50, y: y - 50 }, { x: x - 10, y: y - 50 }, { x: x - 10, y: y - 10 }]);
  });
}

function etat(page) {
  return page.evaluate(function () {
    const res = {};
    ["getEditorPoints", "getRoads", "getZones", "getStructures"].forEach(function (g) {
      (window[g]() || []).forEach(function (o) { if (o && o.uid && o.uid.indexOf("_csz_") > 0) res[o.uid] = g; });
    });
    const traces = (window.KtaUid.getTombstones() || []).map(function (t) { return t.uid; })
      .filter(function (u) { return u.indexOf("_csz_") > 0; }).sort();
    return { objets: res, traces: traces, histo: window.HistoryManager._peek().undo.length };
  });
}

// Clic carte en coordonnées PLAN (le handler de capture de map.js ré-émet de la même façon).
function cliquer(page, dx, dy) {
  return page.evaluate(function (d) {
    const c = window.__csz, H = window.PLAN_CONFIG.plan.imageHeight;
    window.map.fire("click", { latlng: window.L.latLng(H - (c.y + d[1]), c.x + d[0]) });
  }, [dx, dy]);
}

async function ouvrirSelection(page) {
  const r = await page.evaluate(function () {
    const g = window.getRoads().find(function (o) { return o.uid === "rd_csz_graine"; });
    window.KtaConvertir.ouvrir("roads", g);
    const b = document.getElementById("kta-convert-multi");
    if (!b) return "pas de bouton Sélection multiple";
    b.click();
    return window.SelectionMulti.estActif() ? "" : "sélection pas ouverte";
  });
  verifier(r === "", "🎯 sélection multiple ouverte depuis la fenêtre Convertir", r);
}

async function zone(page) {
  await page.evaluate(function () { document.getElementById("kta-selm-zone").click(); });
  const arme = await page.evaluate(function () {
    return { mesure: window.modeMesure === true, mode: window.getMeasureMode(),
             vide: window.getMeasurePointsSurface().length === 0,
             prendre: getComputedStyle(document.getElementById("kta-selm-zone-ok")).display !== "none",
             suppr: getComputedStyle(document.getElementById("kta-selm-suppr")).display === "none" };
  });
  verifier(arme.mesure && arme.mode === "surface" && arme.vide && arme.prendre && arme.suppr,
    "✏️ zone : outil ♦️ Surface armé à vide, bandeau en mode tracé", arme);
  await cliquer(page, 0, 0);
  await cliquer(page, 200, 0);
  await cliquer(page, 200, 200);
  await cliquer(page, 0, 200);
  await page.waitForTimeout(200);
  const n = await page.evaluate(function () { return window.KtaSelectionZone.nbSommets(); });
  verifier(n === 4, "✏️ zone : 4 sommets posés par les clics carte", n);
  await page.evaluate(function () { document.getElementById("kta-selm-zone-ok").click(); });
  await page.waitForTimeout(200);
}

async function confirmer(page, decocher) {
  await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 10000);
  await page.waitForTimeout(500);   // garde anti-double-clic de ktaConfirm
  return page.evaluate(function (dec) {
    const b = document.getElementById("kta-confirm-oui");
    const boite = b.closest(".kta-readme-modal-boite");
    const cases = Array.from(boite.querySelectorAll("[data-kta-selm-fam]"));
    (dec || []).forEach(function (f) {
      const cb = boite.querySelector('[data-kta-selm-fam="' + f + '"]');
      if (cb) { cb.checked = false; cb.dispatchEvent(new Event("change")); }
    });
    const res = { texte: boite.textContent, ok: b.textContent,
      cases: cases.map(function (c) { return c.getAttribute("data-kta-selm-fam") + ":" + c.checked + ":" + c.disabled; }) };
    b.click();
    return res;
  }, decocher || []);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  page.on("console", function (m) {
    if (m.type() === "warning" && /Clé manquante/.test(m.text())) erreurs.push(m.text());
  });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () {
      return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
        window.PlanRegistry.getAll().length > 0;
    }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.evaluate(function () {
      const tous = window.PlanRegistry.getAll();
      const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
      window.__pret = false;
      Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
    });
    await attendre(page, function () {
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaSelectionZone &&
        !!window.HistoryManager && !!window.KtaUid;
    }, 40000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    });

    await semer(page);
    // Calque de données fictif : un tracé et un point dans la zone (lecture seule : ignorés, comptés).
    await page.evaluate(function (id) {
      const c = window.__csz;
      const json = {
        roads: [{ uid: "rd_csz_calque", type: "principal", level: 0,
                  points: [{ x: c.x + 20, y: c.y + 190 }, { x: c.x + 90, y: c.y + 190 }] }],
        data: [{ uid: "pt_csz_calque", id: "Fictif calque", x: c.x + 150, y: c.y + 20, level: 0, tags: [] }]
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
      window.PLAN_CONFIG.dataLayers = (window.PLAN_CONFIG.dataLayers || []).concat([{ id: id, label: "Calque fictif", file: url }]);
      const groupe = window.L.layerGroup().addTo(window.map);
      window.dataLayerGroups = window.dataLayerGroups || {};
      window.dataLayerGroups[id] = groupe;
      window.ajouterPointsDepuisJSON(url, groupe);
    }, CALQUE);
    await page.waitForTimeout(1500);
    // Une photo fictive sur un point de la zone (canvas uni, sans EXIF).
    const photo = await page.evaluate(function () {
      const cv = document.createElement("canvas");
      cv.width = 40; cv.height = 30;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#336699"; ctx.fillRect(0, 0, 40, 30);
      return new Promise(function (res) { cv.toBlob(res, "image/jpeg", 0.8); }).then(function (blob) {
        return window.MyKTAMapPhotos.addPhoto(window._currentLoadedPlanId, "pt_csz_photo", blob);
      }).then(function (r) { return !!r; }).catch(function (e) { return String(e && e.message); });
    });
    verifier(photo === true, "photo fictive ajoutée au point de la zone", photo);
    const e0 = await etat(page);

    // ── 1. Sélection par zone ──
    await ouvrirSelection(page);
    await zone(page);
    const sel = await page.evaluate(function () {
      return { uids: window.SelectionMulti.liste().map(function (s) { return s.obj.uid; }).sort(),
               msg: document.querySelector(".kta-selm-msg").textContent,
               mesure: window.getMeasurePointsSurface().length, modeMesure: window.modeMesure,
               conv: document.getElementById("kta-selm-ok").textContent,
               suppr: document.getElementById("kta-selm-suppr").textContent };
    });
    const attendus = ["pt_csz_in2", "pt_csz_photo", "rd_csz_graine", "rd_csz_in", "st_csz_in", "zn_csz_in"];
    verifier(JSON.stringify(sel.uids) === JSON.stringify(attendus),
      "zone : objets ENTIÈREMENT dedans ajoutés à la graine (2 points, tracé, pilier, zone)", sel.uids);
    verifier(sel.uids.indexOf("rd_csz_cheval") < 0, "zone : le tracé À CHEVAL n'est pas pris");
    verifier(sel.uids.indexOf("rd_csz_niv") < 0, "zone : le tracé d'un AUTRE niveau n'est pas pris");
    verifier(sel.uids.indexOf("pt_csz_out") < 0 && sel.uids.indexOf("rd_csz_calque") < 0,
      "zone : ni le point dehors, ni l'objet de calque");
    verifier(/\b2\b/.test(sel.msg) && /5/.test(sel.msg), "zone : bandeau = 5 ajoutés, 2 objets de calque ignorés", sel.msg);
    verifier(sel.mesure === 3 && sel.modeMesure === false, "zone : la mesure ♦️ d'avant est rendue (3 points), outil coupé", sel);
    verifier(/\(2\)/.test(sel.conv), "✅ Convertir compte les seules lignes (graine + tracé), pas points ni surfaces", sel.conv);
    verifier(/\(6\)/.test(sel.suppr), "🗑️ Supprimer (6) compte tout le lot", sel.suppr);

    // ── 2. Re-clic : retire ──
    await cliquer(page, 100, 170);   // point « deux »
    await cliquer(page, 340, 20);    // graine
    await page.waitForTimeout(200);
    const sel2 = await page.evaluate(function () {
      return window.SelectionMulti.liste().map(function (s) { return s.obj.uid; }).sort();
    });
    verifier(JSON.stringify(sel2) === JSON.stringify(["pt_csz_photo", "rd_csz_in", "st_csz_in", "zn_csz_in"]),
      "re-clic : le point et la graine sortent de la sélection", sel2);

    // ── 3. Suppression ──
    await page.evaluate(function () { document.getElementById("kta-selm-suppr").click(); });
    const conf = await confirmer(page);
    verifier(conf.cases.length === 4 && conf.cases.every(function (c) { return /:true:false$/.test(c); }),
      "confirmation : 4 cases de famille, cochées", conf.cases);
    verifier(/Points \(1\)/.test(conf.texte) && /Tracés \(1\)/.test(conf.texte) && /Zones \(1\)/.test(conf.texte) &&
      /Structures \(1\)/.test(conf.texte), "confirmation : le nombre de chaque famille", conf.texte.slice(0, 300));
    verifier(/1 photo/.test(conf.texte), "confirmation : la photo du point est annoncée");
    verifier(/2 objet\(s\) de calque/.test(conf.texte), "confirmation : 2 objets de calque ignorés annoncés");
    verifier(/\(4\)/.test(conf.ok), "confirmation : bouton « Supprimer (4) »", conf.ok);
    await page.waitForTimeout(800);
    const e1 = await etat(page);
    const partis = ["pt_csz_photo", "rd_csz_in", "st_csz_in", "zn_csz_in"];
    verifier(partis.every(function (u) { return !e1.objets[u]; }), "suppression : les 4 objets ont disparu", e1.objets);
    verifier(["pt_csz_in2", "pt_csz_out", "rd_csz_cheval", "rd_csz_niv", "rd_csz_graine"].every(function (u) { return !!e1.objets[u]; }),
      "suppression : le reste est intact");
    verifier(JSON.stringify(e1.traces) === JSON.stringify(partis.slice().sort()),
      "suppression : une trace de suppression (KtaUid) par objet supprimé", e1.traces);
    verifier(e1.histo === e0.histo + 1, "suppression : UNE entrée d'historique", [e0.histo, e1.histo]);
    const sm = await page.evaluate(function () { return window.SelectionMulti.estActif(); });
    verifier(!sm, "suppression : le bandeau se ferme");
    const ph = await page.evaluate(function () {
      return window.MyKTAMapPhotos.listerPlan(window._currentLoadedPlanId).then(function (a) {
        return a.filter(function (r) { return r.pointId === "pt_csz_photo"; }).length;
      });
    });
    verifier(ph === 1, "suppression : la photo est gardée (« sans point »), pas effacée", ph);
    const calque = await page.evaluate(function () {
      return window._ktaDataPolylines.some(function (e) { return e.uid === "rd_csz_calque"; });
    });
    verifier(calque, "suppression : l'objet du calque n'est pas touché");

    // ── 4. Un seul ⏪ ──
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(800);
    const e2 = await etat(page);
    verifier(partis.every(function (u) { return !!e2.objets[u]; }), "⏪ : un seul retour rend les 4 objets", e2.objets);
    verifier(e2.traces.length === 0, "⏪ : les traces de suppression sont retirées", e2.traces);

    // ── 5. Case décochée : sa famille reste ──
    await ouvrirSelection(page);
    await zone(page);
    await page.evaluate(function () { document.getElementById("kta-selm-suppr").click(); });
    const conf2 = await confirmer(page, ["zones", "editorPoints"]);
    verifier(/\(3\)/.test(conf2.ok), "case décochée : le bouton se recompte (graine + tracé + pilier = 3)", conf2.ok);
    await page.waitForTimeout(800);
    const e3 = await etat(page);
    verifier(!!e3.objets.zn_csz_in && !!e3.objets.pt_csz_photo && !!e3.objets.pt_csz_in2 &&
      !e3.objets.rd_csz_in && !e3.objets.st_csz_in && !e3.objets.rd_csz_graine,
      "case décochée : zones et points gardés, le reste supprimé", e3.objets);
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(500);

    // ── 6. Annuler la zone rend la mesure ──
    await ouvrirSelection(page);
    await page.evaluate(function () { document.getElementById("kta-selm-zone").click(); });
    await cliquer(page, 0, 0);
    await page.evaluate(function () { document.getElementById("kta-selm-annuler") && window.SelectionMulti.fermer(); });
    const m = await page.evaluate(function () { return { n: window.getMeasurePointsSurface().length, on: window.modeMesure }; });
    verifier(m.n === 3 && m.on === false, "fermer pendant le tracé : la mesure ♦️ d'avant est rendue", m);

    verifier(erreurs.length === 0, "aucune erreur de page ni clé i18n manquante", erreurs);
  } catch (e) {
    pb("exception : " + (e && e.stack || e));
  } finally {
    await nav.close();
    server.close();
  }
  console.log(problemes.length ? "\n⚠️ " + problemes.length + " problème(s)" : "\n🎉 suppression par zone : tout passe");
  process.exit(problemes.length ? 1 : 0);
})();
