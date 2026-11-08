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
// compté sur les seuls convertibles ; entrée directe « ✏️ Par zone » des 3 modes « supprimer au clic » (sans
// graine, famille du mode seule cochée) ; prise d'extension factice qui refuse (rien supprimé, alerte) puis permet ;
// 🏗️ Niveau (N) : liste des niveaux, bouton recompté, jonction et calque annoncés et intacts, un ⏪, masqué hors
// multi-niveau.
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

// Zone tracée directement (sélection sans graine : le tracé est déjà armé).
async function zoneDirecte(page) {
  await cliquer(page, 0, 0);
  await cliquer(page, 200, 0);
  await cliquer(page, 200, 200);
  await cliquer(page, 0, 200);
  await page.waitForTimeout(200);
  await page.evaluate(function () { document.getElementById("kta-selm-zone-ok").click(); });
  await page.waitForTimeout(200);
}

// Fenêtre ouverte par 🗑️ Supprimer : cases et texte, sans cliquer.
async function lireFenetre(page) {
  await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 10000);
  await page.waitForTimeout(500);   // garde anti-double-clic de ktaConfirm
  return page.evaluate(function () {
    const boite = document.getElementById("kta-confirm-oui").closest(".kta-readme-modal-boite");
    return { texte: boite.textContent, ok: document.getElementById("kta-confirm-oui").textContent,
      cases: Array.from(boite.querySelectorAll("[data-kta-selm-fam]")).map(function (c) {
        return c.getAttribute("data-kta-selm-fam") + ":" + c.checked + ":" + c.disabled;
      }) };
  });
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

    // Calques embarqués du plan retirés des registres : un de leurs objets peut tomber dans la zone de test selon
    // la vue d'ouverture et fausser le compte des objets de calque ignorés. Seul le calque fictif ci-dessous compte.
    await page.evaluate(function () {
      ["_ktaDataPolylines", "_ktaDataPolygons", "_ktaDataStructurePolygons", "_ktaDataMarkers"].forEach(function (k) {
        if (Array.isArray(window[k])) window[k].splice(0);
      });
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

    // ── 7. Entrée directe « ✏️ Par zone » depuis les 3 modes « supprimer au clic » ──
    const MODES = [["roads", "activerModeSuppressionTraceClic", "kta-supp-trace-floater"],
      ["zones", "activerModeSuppressionZoneClic", "kta-supp-zone-floater"],
      ["structures", "activerModeSuppressionStructureClic", "kta-supp-structure-floater"]];
    for (const m of MODES) {
      const fam = m[0];
      const r = await page.evaluate(function (m) {
        window[m[1]]();
        const fl = document.getElementById(m[2]);
        const b = fl && fl.querySelector('[data-kta-supp-zone="' + m[0] + '"]');
        if (!b) return { bouton: false };
        const texte = b.textContent;
        b.click();
        const conv = document.getElementById("kta-selm-ok");
        return { bouton: true, texte: texte, floater: !!document.getElementById(m[2]),
          actif: window.SelectionMulti.estActif(), vide: window.SelectionMulti.liste().length === 0,
          trace: window.KtaSelectionZone.enCours(), mode: window.getMeasureMode(),
          convertir: conv ? getComputedStyle(conv).display : "absent" };
      }, m);
      verifier(r.bouton && /Par zone/.test(r.texte), fam + " : le mode « supprimer au clic » porte « ✏️ Par zone »", r);
      verifier(r.floater === false, fam + " : « Par zone » quitte le mode « supprimer au clic »", r);
      verifier(r.actif && r.vide && r.trace && r.mode === "surface",
        fam + " : sélection SANS graine ouverte, tracé de la zone lancé d'emblée", r);
      verifier(r.convertir === "none", fam + " : ✅ Convertir masqué sans graine", r.convertir);
      await zoneDirecte(page);
      const n = await page.evaluate(function () { return window.SelectionMulti.liste().length; });
      verifier(n === 5, fam + " : la zone prend les 5 objets dedans (toutes familles)", n);
      await page.evaluate(function () { document.getElementById("kta-selm-suppr").click(); });
      const f = await lireFenetre(page);
      const attendu = ["editorPoints", "roads", "zones", "structures"].map(function (x) {
        return x + ":" + (x === fam) + ":false";
      });
      verifier(JSON.stringify(f.cases) === JSON.stringify(attendu),
        fam + " : seule la famille du mode est cochée, les autres proposées décochées", f.cases);
      if (fam === "roads") {
        verifier(/\(1\)/.test(f.ok), "roads : bouton « Supprimer (1) »", f.ok);
        await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
        await page.waitForTimeout(800);
        const e = await etat(page);
        verifier(!e.objets.rd_csz_in && !!e.objets.zn_csz_in && !!e.objets.st_csz_in && !!e.objets.pt_csz_photo,
          "roads : seul le tracé part, le reste de la zone reste", e.objets);
        await page.evaluate(function () { window.HistoryManager.undo(); });
        await page.waitForTimeout(500);
      } else {
        await page.evaluate(function () {
          document.getElementById("kta-confirm-non").click();
          window.SelectionMulti.fermer();
        });
        await page.waitForTimeout(300);
      }
    }

    // ── 7 bis. Ligne « ✏️ Effacer par zone » de la fenêtre 🧹 Effacer des 3 groupes (même ordre que la barre) ──
    const FAMS = ["roads", "zones", "structures"];
    for (let i = 0; i < FAMS.length; i++) {
      const fam = FAMS[i];
      const r = await page.evaluate(function (i) {
        // Groupes en menu (flyout) : bouton principal du groupe, puis 🧹 Effacer dans le menu.
        const grp = window._groupes[["traces", "zones", "structures"][i]];
        if (!grp || !grp.btnPrincipal) return { groupe: false };
        grp.btnPrincipal.click();
        const titre = window.I18n.t("ui.btn.effacer");
        const eff = Array.from(document.querySelectorAll(".kta-group-flyout .kta-group-flyout-btn"))
          .find(function (x) { return x.textContent.indexOf(titre) >= 0 || x.title === titre; });
        if (!eff) return { effacer: false };
        eff.click();
        const lignes = Array.from(document.querySelectorAll('.kta-modal-overlay button[id^="_choix-"]'));
        const b = lignes.find(function (x) { return /Effacer par zone/.test(x.textContent); });
        if (!b) return { effacer: subs.length, ligne: false, lignes: lignes.map(function (x) { return x.textContent.trim().slice(0, 30); }) };
        const icones = b.textContent.split("✏️").length - 1;
        b.click();
        return { ligne: true, icones: icones, actif: window.SelectionMulti.estActif(), vide: window.SelectionMulti.liste().length === 0,
          trace: window.KtaSelectionZone.enCours() };
      }, i);
      verifier(r.ligne && r.actif && r.vide && r.trace,
        fam + " : 🧹 Effacer → « ✏️ Effacer par zone » ouvre la sélection sans graine, tracé lancé", r);
      verifier(r.icones === 1, fam + " : une seule icône ✏️ sur la ligne", r.icones);
      if (!r.ligne) continue;
      await zoneDirecte(page);
      await page.evaluate(function () { document.getElementById("kta-selm-suppr").click(); });
      const f = await lireFenetre(page);
      const attendu = ["editorPoints", "roads", "zones", "structures"].map(function (x) {
        return x + ":" + (x === fam) + ":false";
      });
      verifier(JSON.stringify(f.cases) === JSON.stringify(attendu),
        fam + " : depuis 🧹 Effacer, seule la famille du groupe est cochée", f.cases);
      await page.evaluate(function () {
        document.getElementById("kta-confirm-non").click();
        window.SelectionMulti.fermer();
      });
      await page.waitForTimeout(300);
    }

    // ── 8. Prise d'extension factice (plan traité comme un plan d'extension) : refuse, puis permet ──
    await page.evaluate(function () {
      const id = window._currentLoadedPlanId, R = window.PlanRegistry, orig = R.findById;
      window.__cszFind = orig;
      R.findById = function (x) { return x === id ? { type: "ext", extId: "csz" } : orig.apply(R, arguments); };
      window.__cszRep = { permis: false, message: "Refus fictif de la prise" };
      window.KtaExtensions.register({ nom: "csz-test", apiVersion: 1, suppressionLot: function (idExt, objets) {
        window.__cszVu = { idExt: idExt, n: objets.length, uids: objets.map(function (o) { return o.uid; }).sort() };
        return window.__cszRep;
      } });
      window.SelectionMulti.ouvrirZone();
    });
    await zoneDirecte(page);
    const avantRefus = await etat(page);
    await page.evaluate(function () { document.getElementById("kta-selm-suppr").click(); });
    const fr = await lireFenetre(page);
    verifier(fr.cases.length === 0 && /Refus fictif de la prise/.test(fr.texte),
      "prise qui refuse : alerte avec son message, AUCUNE fenêtre de confirmation", fr);
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
    await page.waitForTimeout(500);
    const vu = await page.evaluate(function () { return window.__cszVu; });
    verifier(vu && vu.idExt === "csz" && vu.n === 5 && vu.uids.indexOf("rd_csz_in") >= 0,
      "prise consultée avec l'id de l'extension et les 5 objets (uid)", vu);
    const apresRefus = await etat(page);
    verifier(JSON.stringify(apresRefus) === JSON.stringify(avantRefus),
      "prise qui refuse : rien supprimé, aucune trace, aucune entrée d'historique", apresRefus);
    await page.evaluate(function () { window.__cszRep = Promise.resolve({ permis: true }); });
    await page.evaluate(function () { document.getElementById("kta-selm-suppr").click(); });
    const fp = await lireFenetre(page);
    verifier(fp.cases.length === 4, "prise qui permet : la fenêtre de confirmation s'ouvre", fp.cases);
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
    await page.waitForTimeout(800);
    const e4 = await etat(page);
    verifier(["pt_csz_photo", "pt_csz_in2", "rd_csz_in", "st_csz_in", "zn_csz_in"].every(function (u) { return !e4.objets[u]; }),
      "prise qui permet : les 5 objets sont supprimés", e4.objets);
    await page.evaluate(function () { window.HistoryManager.undo(); window.PlanRegistry.findById = window.__cszFind; });
    await page.waitForTimeout(500);

    // ── 9. 🏗️ Niveau en lot : liste des niveaux, cases, jonction et calque comptés, un ⏪ ──
    await page.evaluate(function () {
      const c = window.__csz;
      window.APP_CONFIG.availableLevels = [-1, 0];
      window.setRoads(window.getRoads().concat([{ uid: "rd_csz_jonc", type: "jonction", fromLevel: 0, toLevel: -1,
        points: [{ x: c.x + 20, y: c.y + 80 }, { x: c.x + 80, y: c.y + 80 }] }]));
    });
    const niv = function () {
      return page.evaluate(function () {
        const r = {};
        ["getEditorPoints", "getRoads", "getZones", "getStructures"].forEach(function (g) {
          (window[g]() || []).forEach(function (o) {
            if (o && o.uid && o.uid.indexOf("_csz_") > 0) {
              r[o.uid] = o.type === "jonction" ? o.fromLevel + ">" + o.toLevel : (Number.isInteger(o.level) ? o.level : 0);
            }
          });
        });
        r.calque = window._ktaDataPolylines.filter(function (e) { return e.uid === "rd_csz_calque"; })
          .map(function (e) { return e.level; })[0];
        return r;
      });
    };
    const n0 = await niv(), h0 = (await etat(page)).histo;
    await ouvrirSelection(page);
    await zone(page);
    const bouton = await page.evaluate(function () {
      const b = document.getElementById("kta-selm-niveau"), s = document.getElementById("kta-selm-suppr");
      return { vu: getComputedStyle(b).display !== "none", txt: b.textContent, voisin: b.nextElementSibling === s };
    });
    verifier(bouton.vu && /\(6\)/.test(bouton.txt) && bouton.voisin,
      "🏗️ Niveau (6) dans le bandeau, à côté de 🗑️ Supprimer", bouton);
    await page.evaluate(function () { document.getElementById("kta-selm-niveau").click(); });
    await attendre(page, function () { return !!document.querySelector("[data-kta-selm-niv]"); }, 10000);
    await page.waitForTimeout(500);   // garde anti-double-clic de ktaConfirm
    const fen = await page.evaluate(function () {
      const b = document.getElementById("kta-confirm-oui"), boite = b.closest(".kta-readme-modal-boite");
      const sel = boite.querySelector("[data-kta-selm-niv]");
      const r = { texte: boite.textContent, ok0: b.textContent, dis0: b.disabled,
        niveaux: Array.from(sel.options).map(function (o) { return o.value; }),
        cases: boite.querySelectorAll("[data-kta-selm-niv-fam]").length };
      sel.value = "-1";
      sel.dispatchEvent(new Event("change"));
      r.ok1 = b.textContent;
      r.dis1 = b.disabled;
      return r;
    });
    verifier(JSON.stringify(fen.niveaux) === JSON.stringify(["-1", "0"]) && fen.cases === 4,
      "fenêtre : liste des niveaux du plan et une case par famille", fen);
    verifier(/\(0\)/.test(fen.ok0) && fen.dis0 && /\(6\)/.test(fen.ok1) && !fen.dis1,
      "fenêtre : le bouton compte ceux qui changent (0 au niveau actuel, 6 au niveau -1)", fen);
    verifier(/1 jonction/.test(fen.texte) && /2 objet\(s\) de calque/.test(fen.texte),
      "fenêtre : la jonction et les 2 objets de calque sont annoncés (jamais touchés)", fen.texte.slice(0, 400));
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
    await page.waitForTimeout(800);
    const n1 = await niv(), h1 = (await etat(page)).histo;
    const lot = ["pt_csz_photo", "pt_csz_in2", "rd_csz_in", "rd_csz_graine", "st_csz_in", "zn_csz_in"];
    verifier(lot.every(function (u) { return n1[u] === -1; }), "niveau : les 6 objets du lot au niveau -1", n1);
    verifier(n1.rd_csz_jonc === "0>-1" && n1.calque === n0.calque && n1.rd_csz_cheval === 0 && n1.pt_csz_out === 0,
      "niveau : jonction, objet de calque et objets hors lot inchangés", n1);
    verifier(h1 === h0 + 1, "niveau : UNE entrée d'historique", [h0, h1]);
    verifier(!(await page.evaluate(function () { return window.SelectionMulti.estActif(); })),
      "niveau : le bandeau se ferme");
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(500);
    const n2 = await niv();
    verifier(lot.every(function (u) { return n2[u] === n0[u]; }), "⏪ : un seul retour rend les niveaux d'avant", n2);
    await page.evaluate(function () { window.APP_CONFIG.multiLevel = false; window.SelectionMulti.ouvrirZone(); });
    const cache = await page.evaluate(function () {
      document.getElementById("kta-selm-zone-annuler").click();   // retour au bandeau de sélection
      const b = document.getElementById("kta-selm-niveau"), s = document.getElementById("kta-selm-suppr");
      const r = getComputedStyle(b).display === "none" && getComputedStyle(s).display !== "none";
      window.SelectionMulti.fermer();
      window.APP_CONFIG.multiLevel = true;
      return r;
    });
    verifier(cache, "plan à un niveau : pas de bouton 🏗️ Niveau");

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
