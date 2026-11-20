#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-selection-zone.js — checkup (Playwright, Chromium et WebKit) : la sélection par zone suit les niveaux VISIBLES
// =====================================================================
// Relevé fictif (sinon le premier plan de l'index), multi-niveau forcé (niveaux 0, +1, +2 ajoutés à ceux du plan),
// objets FICTIFS posés au centre de la vue. Visibilité changée par la case du niveau dans ≡ Filtres (FilterPanel),
// parcours réel : fiche → 🔄 Convertir → 🎯 Sélectionner plusieurs → Sélectionner par zone (clics carte) → Prendre
// la zone. Vérifie : niveau actif 0, +1 visible → mur en ligne, mur fermé et pilier du +1 pris ; +1 masqué → plus
// pris ; à cheval jamais pris ; objet du 0 dans la zone toujours pris ; hors zone jamais pris ; zone sur plusieurs
// niveaux prise si l'un des siens est visible ; plan à un niveau : tout ce qui est dedans ; « Niveau → 0 » et
// « Supprimer » ne touchent que la sélection (un ⏪ chacun) ; libellés « niveaux visibles ».
// 🩸 check-selection-multi.js teste la règle dans un `vm` ; seul ce parcours voit le panneau des filtres, l'outil de
// mesure, le bandeau et ktaConfirm réels. KTA_MOTEURS=chromium pour un seul moteur.
// Usage : node scripts/smoke/checkup-selection-zone.js (SMOKE_PORT pour une autre copie) · code : js/selectionZone.js,
// js/selectionMulti.js > ktaNiveauVisible · doc : docs/architecture/session-data.md
// =====================================================================
"use strict";

const navigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
let moteur = "";
function pb(msg) { problemes.push(moteur + " : " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Zone = carré de 200 px plan à partir de (x, y).
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const x = Math.round(c.lng) - 100, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 100;
    const A = window.APP_CONFIG;
    const natif = { multi: A.multiLevel === true, niveaux: Array.isArray(A.availableLevels) ? A.availableLevels.length : 0 };
    const avail = (Array.isArray(A.availableLevels) ? A.availableLevels : []).concat([0, 1, 2]);
    A.multiLevel = true;
    A.availableLevels = avail.filter(function (n, i) { return avail.indexOf(n) === i; }).sort(function (a, b) { return a - b; });
    A.activeLevel = 0;
    A.visibleLevels = [0];
    if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    const L2 = function (x0, y0, x1, y1) { return [{ x: x0, y: y0 }, { x: x1, y: y1 }]; };
    const C = function (x0, y0, d) {
      return [{ x: x0, y: y0 }, { x: x0 + d, y: y0 }, { x: x0 + d, y: y0 + d }, { x: x0, y: y0 + d }];
    };
    window.__czv = { x: x, y: y };
    window.setRoads([
      { uid: "rd_czv_in0", type: "principal", level: 0, points: L2(x + 20, y + 20, x + 120, y + 20) },
      { uid: "rd_czv_out0", type: "principal", level: 0, points: L2(x + 220, y + 120, x + 280, y + 120) },
      { uid: "rd_czv_out1", type: "principal", level: 1, points: L2(x + 220, y + 160, x + 280, y + 160) },
      { uid: "rd_czv_graine", type: "principal", level: 0, points: L2(x + 300, y + 20, x + 380, y + 20) }
    ]);
    window.setStructures([
      { uid: "st_czv_murl1", type: "mur-ligne", level: 1, points: L2(x + 20, y + 60, x + 120, y + 60) },
      { uid: "st_czv_murp1", type: "mur", level: 1, points: C(x + 130, y + 30, 40) },
      { uid: "st_czv_pil1", type: "pilier-1", level: 1, points: C(x + 40, y + 140, 30) },
      { uid: "st_czv_cheval1", type: "mur-ligne", level: 1, points: L2(x + 150, y + 100, x + 260, y + 100) }
    ]);
    window.setZones([{ uid: "zn_czv_multi", type: "eau", level: 2, niveaux: [1, 2], points: C(x + 130, y + 130, 30) }]);
    window.setEditorPoints([
      { uid: "pt_czv_in0", id: "Fictif zéro", nom: "Fictif zéro", x: x + 100, y: y + 170, level: 0 },
      { uid: "pt_czv_out0", id: "Fictif dehors", nom: "Fictif dehors", x: x + 320, y: y + 120, level: 0 }
    ]);
    return natif;
  });
}

// Objets fictifs → niveau (ou absent).
function etat(page) {
  return page.evaluate(function () {
    const res = {};
    ["getEditorPoints", "getRoads", "getZones", "getStructures"].forEach(function (g) {
      (window[g]() || []).forEach(function (o) {
        if (o && o.uid && o.uid.indexOf("_czv_") > 0) res[o.uid] = Number.isInteger(o.level) ? o.level : 0;
      });
    });
    return { objets: res, histo: window.HistoryManager._peek().undo.length };
  });
}

function cliquer(page, dx, dy) {
  return page.evaluate(function (d) {
    const c = window.__czv, H = window.PLAN_CONFIG.plan.imageHeight;
    window.map.fire("click", { latlng: window.L.latLng(H - (c.y + d[1]), c.x + d[0]) });
  }, [dx, dy]);
}

// Case d'un niveau dans ≡ Filtres (le panneau réel), cochée ou décochée, puis panneau fermé.
async function caseNiveau(page, niveau, coche) {
  const r = await page.evaluate(function (a) {
    window.FilterPanel.ouvrir();
    const cb = document.querySelector('[data-lvl-visible="' + a[0] + '"]');
    if (!cb) return { trouve: false };
    if (cb.checked !== a[1]) { cb.checked = a[1]; cb.dispatchEvent(new Event("change", { bubbles: true })); }
    window.FilterPanel.fermer();
    return { trouve: true, visibles: window.APP_CONFIG.visibleLevels.slice().sort(), actif: window.APP_CONFIG.activeLevel };
  }, [niveau, coche]);
  await page.waitForTimeout(300);
  return r;
}

async function ouvrirSelection(page) {
  const r = await page.evaluate(function () {
    window.SelectionMulti.fermer();
    const g = window.getRoads().find(function (o) { return o.uid === "rd_czv_graine"; });
    window.KtaConvertir.ouvrir("roads", g);
    const b = document.getElementById("kta-convert-multi");
    if (!b) return "pas de bouton Sélectionner plusieurs";
    b.click();
    return window.SelectionMulti.estActif() ? "" : "sélection pas ouverte";
  });
  if (r) pb("sélection multiple depuis la fenêtre Convertir : " + r);
}

// Sélectionner par zone → 4 clics carte → Prendre la zone ; rend les uid sélectionnés et le message du bandeau.
async function prendreZone(page) {
  await page.evaluate(function () { document.getElementById("kta-selm-zone").click(); });
  await cliquer(page, 0, 0);
  await cliquer(page, 200, 0);
  await cliquer(page, 200, 200);
  await cliquer(page, 0, 200);
  await page.waitForTimeout(200);
  await page.evaluate(function () { document.getElementById("kta-selm-zone-ok").click(); });
  await page.waitForTimeout(200);
  return page.evaluate(function () {
    return { uids: window.SelectionMulti.liste().map(function (s) { return s.obj.uid; }).sort(),
             msg: document.querySelector(".kta-selm-msg").textContent,
             tous: document.getElementById("kta-selm-tous").textContent };
  });
}

// Fenêtre ktaConfirm montée (`niveau` : celle du niveau en lot, sinon celle de la suppression).
async function attendreConfirm(page, niveau) {
  await attendre(page, niveau
    ? function () { return !!document.querySelector("[data-kta-selm-niv]"); }
    : function () { return !!document.querySelector("[data-kta-selm-fam]"); }, 10000);
  await page.waitForTimeout(500);   // garde anti-double-clic de ktaConfirm
}

const NIV1 = ["st_czv_murl1", "st_czv_murp1", "st_czv_pil1"];
const TOUJOURS = ["pt_czv_in0", "rd_czv_graine", "rd_czv_in0"];
const JAMAIS = ["st_czv_cheval1", "rd_czv_out0", "rd_czv_out1", "pt_czv_out0"];
const trie = function (a) { return a.slice().sort(); };

async function jouer(nom) {
  moteur = nom;
  console.log("\n── " + nom + " ──");
  const nav = await navigateur.lancerMoteur(nom);
  if (!nav) { pb("moteur absent (installer : npx playwright install " + nom + ")"); return; }
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
    }, 30000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    const fictif = await page.evaluate(function () {
      const tous = window.PlanRegistry.getAll();
      const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
      window.__pret = false;
      Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
      return /fictif/i.test(p.name || "");
    });
    await attendre(page, function () {
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaSelectionZone &&
        !!window.HistoryManager && !!window.FilterPanel;
    }, 60000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
      // Calques embarqués retirés des registres : seuls les objets fictifs de session comptent ici.
      ["_ktaDataPolylines", "_ktaDataPolygons", "_ktaDataStructurePolygons", "_ktaDataMarkers"].forEach(function (k) {
        if (Array.isArray(window[k])) window[k].splice(0);
      });
    });
    const natif = await semer(page);
    console.log("  ℹ️ plan " + (fictif ? "fictif" : "de repli") + ", multi-niveau d'origine : " + natif.multi +
      " (" + natif.niveaux + " niveau(x) déclarés) ; multi-niveau forcé 0/+1/+2 pour le test");
    const e0 = await etat(page);

    // ── 1. Niveau actif 0, +1 visible (case de ≡ Filtres) ──
    const f1 = await caseNiveau(page, 1, true);
    verifier(f1.trouve && JSON.stringify(f1.visibles) === "[0,1]" && f1.actif === 0,
      "≡ Filtres : case du niveau +1 cochée → niveaux visibles 0 et +1, actif 0", f1);
    await ouvrirSelection(page);
    const s1 = await prendreZone(page);
    verifier(NIV1.every(function (u) { return s1.uids.indexOf(u) >= 0; }),
      "+1 visible : mur en ligne, mur fermé et pilier du +1 pris", s1.uids);
    verifier(s1.uids.indexOf("zn_czv_multi") >= 0, "+1 visible : zone des niveaux +1/+2 prise (l'un des siens est visible)",
      s1.uids);
    verifier(TOUJOURS.every(function (u) { return s1.uids.indexOf(u) >= 0; }), "objets du niveau 0 dans la zone pris", s1.uids);
    verifier(JAMAIS.every(function (u) { return s1.uids.indexOf(u) < 0; }), "à cheval et hors zone jamais pris", s1.uids);
    verifier(s1.uids.length === 7, "+1 visible : 7 objets dans la sélection (graine comprise)", s1.uids);
    verifier(/niveaux visibles/.test(s1.tous), "libellé « Tous les … des niveaux visibles »", s1.tous);

    // ── 2. « Niveau → 0 » : seule la sélection change ──
    await page.evaluate(function () { document.getElementById("kta-selm-niveau").click(); });
    await attendreConfirm(page, true);
    const fen = await page.evaluate(function () {
      const b = document.getElementById("kta-confirm-oui"), sel = document.querySelector("[data-kta-selm-niv]");
      sel.value = "0";
      sel.dispatchEvent(new Event("change"));
      const r = { ok: b.textContent, dis: b.disabled };
      b.click();
      return r;
    });
    verifier(/\(4\)/.test(fen.ok) && !fen.dis, "Niveau → 0 : le bouton compte les 4 objets hors du 0 (3 du +1, zone)", fen);
    await page.waitForTimeout(800);
    const e2 = await etat(page);
    verifier(NIV1.concat(["zn_czv_multi"]).every(function (u) { return e2.objets[u] === 0; }),
      "Niveau → 0 : les objets de la sélection passent au niveau 0", e2.objets);
    verifier(e2.objets.st_czv_cheval1 === 1 && e2.objets.rd_czv_out1 === 1 && e2.objets.rd_czv_out0 === 0,
      "Niveau → 0 : à cheval et hors zone inchangés", e2.objets);
    verifier(e2.histo === e0.histo + 1, "Niveau → 0 : UNE entrée d'historique", [e0.histo, e2.histo]);
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(600);
    const e3 = await etat(page);
    verifier(JSON.stringify(e3.objets) === JSON.stringify(e0.objets), "⏪ : niveaux d'avant rendus", e3.objets);

    // ── 3. « Supprimer » : seule la sélection part ──
    await ouvrirSelection(page);
    const s3 = await prendreZone(page);
    verifier(JSON.stringify(s3.uids) === JSON.stringify(s1.uids), "même zone : même sélection", s3.uids);
    await page.evaluate(function () { document.getElementById("kta-selm-suppr").click(); });
    await attendreConfirm(page, false);
    const conf = await page.evaluate(function () {
      const b = document.getElementById("kta-confirm-oui"), boite = b.closest(".kta-readme-modal-boite");
      const r = { texte: boite.textContent, ok: b.textContent };
      b.click();
      return r;
    });
    verifier(/Niveaux visibles seulement : 0, \+1\./.test(conf.texte), "fenêtre Supprimer : « Niveaux visibles seulement : 0, +1. »",
      conf.texte.slice(0, 400));
    verifier(/\(7\)/.test(conf.ok), "fenêtre Supprimer : bouton « Supprimer (7) »", conf.ok);
    await page.waitForTimeout(800);
    const e4 = await etat(page);
    verifier(s1.uids.every(function (u) { return e4.objets[u] === undefined; }), "Supprimer : les 7 objets de la sélection partent",
      e4.objets);
    verifier(JAMAIS.every(function (u) { return e4.objets[u] !== undefined; }), "Supprimer : à cheval et hors zone restent", e4.objets);
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(600);
    const e5 = await etat(page);
    verifier(JSON.stringify(e5.objets) === JSON.stringify(e0.objets), "⏪ : un seul retour rend tout", e5.objets);

    // ── 4. +1 masqué (case décochée) : ses objets ne sont plus pris ──
    const f2 = await caseNiveau(page, 1, false);
    verifier(f2.trouve && JSON.stringify(f2.visibles) === "[0]", "≡ Filtres : case du +1 décochée → seul le 0 visible", f2);
    await ouvrirSelection(page);
    const s4 = await prendreZone(page);
    verifier(JSON.stringify(s4.uids) === JSON.stringify(trie(TOUJOURS)),
      "+1 masqué : seuls les objets du 0 dans la zone sont pris (ni mur, ni pilier, ni zone +1/+2)", s4.uids);
    await page.evaluate(function () { window.SelectionMulti.fermer(); });

    // ── 5. Plan à un niveau : tout ce qui est entièrement dedans ──
    await page.evaluate(function () { window.APP_CONFIG.multiLevel = false; });
    await ouvrirSelection(page);
    const s5 = await prendreZone(page);
    verifier(JSON.stringify(s5.uids) === JSON.stringify(s1.uids),
      "plan à un niveau : les 7 objets entièrement dedans, quel que soit leur champ niveau", s5.uids);
    await page.evaluate(function () { window.SelectionMulti.fermer(); window.APP_CONFIG.multiLevel = true; });

    verifier(erreurs.length === 0, "aucune erreur de page ni clé i18n manquante", erreurs);
  } catch (e) {
    pb("exception : " + (e && e.stack || e));
  } finally {
    await nav.close();
  }
}

(async function main() {
  try {
    for (const nom of navigateur.moteurs()) await jouer(nom);
  } finally {
    await navigateur.fermerTout();
    server.close();
  }
  console.log(problemes.length ? "\n⚠️ " + problemes.length + " problème(s)" : "\n🎉 sélection par zone, niveaux visibles : tout passe");
  process.exit(problemes.length ? 1 : 0);
})();
