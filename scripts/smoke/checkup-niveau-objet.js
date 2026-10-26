#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-niveau-objet.js — checkup (Playwright, pas un hook pré-commit) : changer le NIVEAU d'un objet de
// session (tracé, zone, structure, POI) sur un plan multi-niveau
// =====================================================================
// Parcours réel : liste « Niveau » de la fiche d'un tracé / zone / structure (popup Leaflet), liste du
// formulaire d'édition d'un POI ; niveau cible masqué par le filtre (objet retiré de la carte, toast, vue
// inchangée) ou visible ; niveau actuel hors availableLevels proposé ; pas de liste pendant un dessin ;
// annulation (HistoryManager.undo, ce que fait ⏪) puis rétablissement ; persistance après rechargement.
// 🩸 check-api-surface.js teste changerNiveau dans un `vm` ; seul ce parcours voit le re-rendu filtré, la popup
// fermée avant le setteur et le marqueur d'un POI.
// Usage : node scripts/smoke/checkup-niveau-objet.js · doc : docs/architecture/multilevel-pathfinding.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

// Même repli que checkup-calque-effacer.js : on ouvre ce que l'index propose, en le disant.
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
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail ? " " + JSON.stringify(detail) : "")); }

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.KtaConvertir && !!window.HistoryManager;
  }, 20000);
  await page.waitForTimeout(3000);
  // Une restauration de session peut ouvrir sa fenêtre : on la ferme sans rien effacer.
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

// Objets posés au centre de la vue (les tracés hors écran n'ont pas de layer de clic : culling du rendu).
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const h = window.APP_CONFIG.imageHeight;
    const x = Math.round(c.lng), y = Math.round(h - c.lat);
    const d = 25;
    window.APP_CONFIG.visibleLevels = [0];
    window.APP_CONFIG.activeLevel = 0;
    window.setRoads([{ uid: "rd_nivtest", type: "principal", level: 0,
      points: [{ x: x - d, y: y - d }, { x: x + d, y: y - d }] }]);
    window.setZones([
      { uid: "zn_nivtest", type: "eau", level: 0,
        points: [{ x: x - d, y: y }, { x: x - 5, y: y }, { x: x - 5, y: y + d }, { x: x - d, y: y + d }] },
      { uid: "zn_horsplage", type: "remblais", level: 9,
        points: [{ x: x + 30, y: y + 30 }, { x: x + 40, y: y + 30 }, { x: x + 40, y: y + 40 }] }
    ]);
    window.setStructures([{ uid: "st_nivtest", type: "pilier-2", level: 0,
      points: [{ x: x + 5, y: y }, { x: x + d, y: y }, { x: x + d, y: y + d }, { x: x + 5, y: y + d }] }]);
    window.setEditorPoints([{ id: "PoiNiv", nom: "PoiNiv", uid: "pt_nivtest", x: x, y: y + d + 10,
      tags: ["salle"], level: 0, etat: "Non inspectée", description: "", source: "editor" }]);
    if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    return { x: x, y: y };
  });
}

// Lecture de l'état : niveau stocké, présence d'un layer de fiche sur la carte, opacité du marqueur du POI.
function etat(page) {
  return page.evaluate(function () {
    function trouver(liste, uid) { return (liste || []).find(function (o) { return o && o.uid === uid; }) || null; }
    const surCarte = {};
    window.map.eachLayer(function (l) {
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (typeof c !== "string") return;
      const m = /data-kta-uid="([^"]+)"/.exec(c);
      if (m) surCarte[m[1]] = true;
    });
    const pt = trouver(window.getEditorPoints(), "pt_nivtest");
    let opacitePoi = null;
    window.layerEditor.getLayers().forEach(function (l) {
      if (!pt || !l.getLatLng) return;
      const ll = l.getLatLng();
      if (Math.abs(ll.lng - pt.x) < 0.01 && Math.abs(ll.lat - (window.APP_CONFIG.imageHeight - pt.y)) < 0.01) {
        opacitePoi = (l.options && typeof l.options.opacity === "number") ? l.options.opacity : 1;
      }
    });
    const niv = function (o) { return o ? (Number.isInteger(o.level) ? o.level : 0) : null; };
    return {
      niveaux: {
        rd: niv(trouver(window.getRoads(), "rd_nivtest")),
        zn: niv(trouver(window.getZones(), "zn_nivtest")),
        st: niv(trouver(window.getStructures(), "st_nivtest")),
        pt: niv(pt)
      },
      surCarte: { rd: !!surCarte.rd_nivtest, zn: !!surCarte.zn_nivtest, st: !!surCarte.st_nivtest },
      opacitePoi: opacitePoi,
      activeLevel: window.APP_CONFIG.activeLevel,
      visibleLevels: window.APP_CONFIG.visibleLevels.slice(),
      popupOuverte: !!document.querySelector(".leaflet-popup-content"),
      toast: (document.getElementById("kta-toast") || {}).textContent || ""
    };
  });
}

// Ouvre la fiche d'un objet par son layer de clic ; renvoie les options de la liste « Niveau » (ou null).
async function ouvrirFiche(page, uid) {
  const ouverte = await page.evaluate(function (uid) {
    let cible = null;
    window.map.eachLayer(function (l) {
      if (cible) return;
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (typeof c === "string" && c.indexOf('data-kta-uid="' + uid + '"') >= 0) cible = l;
    });
    if (!cible) return false;
    cible.openPopup(cible.getBounds ? cible.getBounds().getCenter() : undefined);
    return true;
  }, uid);
  if (!ouverte) return null;
  await page.waitForTimeout(300);
  return page.evaluate(function () {
    const s = document.querySelector(".leaflet-popup-content select.kta-note-popup-niveau");
    if (!s) return null;
    return { valeur: s.value, options: Array.prototype.map.call(s.options, function (o) { return o.value; }) };
  });
}

async function choisirDansFiche(page, valeur) {
  await page.selectOption(".leaflet-popup-content select.kta-note-popup-niveau", String(valeur));
  await page.waitForTimeout(500);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("pageerror", function (e) { erreursConsole.push("pageerror : " + e.message); });
  page.on("console", function (m) {
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro\.json|404/i.test(m.text())) {
      erreursConsole.push(m.text());
    }
  });
  try {
    await ouvrir(page);
    if (!PLAN.fictif) inf("⚠️ relevé fictif absent de data/index.json : le checkup tourne sur « " + PLAN.nom + " »");
    const multi = await page.evaluate(function () { return window.APP_CONFIG.multiLevel === true; });
    if (!multi) throw new Error("le plan « " + PLAN.nom + " » n'est pas multi-niveau");
    await semer(page);
    const e0 = await etat(page);
    verifier(e0.surCarte.rd && e0.surCarte.zn && e0.surCarte.st && e0.opacitePoi === 1,
      "objets semés au niveau 0, tous affichés", e0);

    // ── Pas de liste pendant un dessin ──
    const pendantDessin = await page.evaluate(function () {
      window.modeRoad = "principal";
      const html = window.ktaOptionsNiveauHtml(0);
      window.modeRoad = null;
      return html;
    });
    verifier(pendantDessin === "", "pas de liste « Niveau » pendant un tracé en cours");

    // ── Niveau actuel hors availableLevels ──
    const horsPlage = await ouvrirFiche(page, "zn_horsplage");
    verifier(!horsPlage, "zone au niveau 9 masquée par le filtre (pas de fiche)");
    await page.evaluate(function () {
      window.APP_CONFIG.visibleLevels = [0, 9];
      window.appliquerFiltreNiveau();
    });
    const fHors = await ouvrirFiche(page, "zn_horsplage");
    verifier(fHors && fHors.valeur === "9" && fHors.options.indexOf("9") >= 0,
      "🩸 niveau actuel hors availableLevels (9) proposé et sélectionné", fHors);
    await page.evaluate(function () {
      window.map.closePopup();
      window.APP_CONFIG.visibleLevels = [0];
      window.appliquerFiltreNiveau();
    });

    // ── Tracé → +1, masqué par le filtre ──
    const fRd = await ouvrirFiche(page, "rd_nivtest");
    verifier(fRd && fRd.valeur === "0", "fiche du tracé : liste « Niveau » présente, sur 0", fRd);
    await choisirDansFiche(page, 1);
    const e1 = await etat(page);
    verifier(e1.niveaux.rd === 1, "tracé déplacé au niveau +1", e1.niveaux);
    verifier(!e1.surCarte.rd, "tracé retiré de la carte (niveau +1 masqué)");
    verifier(!e1.popupOuverte, "fiche fermée après le changement");
    verifier(/masqu/i.test(e1.toast), "toast « masqué par le filtre »", e1.toast);
    verifier(e1.activeLevel === 0 && JSON.stringify(e1.visibleLevels) === "[0]", "la vue reste sur le niveau 0", e1);

    // ── Zone → -1, visible ──
    await page.evaluate(function () { window.APP_CONFIG.visibleLevels = [-1, 0]; window.appliquerFiltreNiveau(); });
    const fZn = await ouvrirFiche(page, "zn_nivtest");
    verifier(!!fZn, "fiche de la zone : liste « Niveau » présente", fZn);
    await choisirDansFiche(page, -1);
    const e2 = await etat(page);
    verifier(e2.niveaux.zn === -1 && e2.surCarte.zn, "zone déplacée au niveau -1, toujours affichée", e2);

    // ── Structure pilier-2 → +2 (valeur écrite telle quelle, pas de « − 1 ») ──
    await page.evaluate(function () { window.APP_CONFIG.visibleLevels = [0]; window.appliquerFiltreNiveau(); });
    const fSt = await ouvrirFiche(page, "st_nivtest");
    verifier(!!fSt, "fiche de la structure : liste « Niveau » présente", fSt);
    await choisirDansFiche(page, 2);
    const e3 = await etat(page);
    verifier(e3.niveaux.st === 2 && !e3.surCarte.st, "🩸 pilier-2 au niveau +2 exactement, masqué", e3.niveaux);

    // ── POI → -2 par le formulaire d'édition ──
    await page.evaluate(function () {
      const p = window.getEditorPoints()[0];
      window.modifierPointEditor(p.id, p.x, p.y);
    });
    await attendre(page, function () { return !!document.getElementById("kta-poi-modal"); }, 5000);
    const selPoi = await page.evaluate(function () {
      const s = document.getElementById("kta-poi-niveau");
      return s ? s.value : null;
    });
    verifier(selPoi === "0", "formulaire du POI : liste « Niveau » présente, sur 0", selPoi);
    await page.selectOption("#kta-poi-niveau", "-2");
    await page.evaluate(function () { document.getElementById("kta-poi-valider").click(); });
    await attendre(page, function () { return !document.getElementById("kta-poi-modal"); }, 5000);
    await page.waitForTimeout(500);
    const e4 = await etat(page);
    verifier(e4.niveaux.pt === -2 && e4.opacitePoi === 0, "POI au niveau -2, marqueur masqué", e4);
    const ajout = await page.evaluate(function () {
      window.afficherFormulaire(10, 10);
      const present = !!document.getElementById("kta-poi-niveau");
      document.getElementById("kta-poi-annuler").click();
      return present;
    });
    verifier(!ajout, "formulaire d'AJOUT d'un POI : pas de liste (niveau actif)");

    // ── Annulation ⏪ (4 changements, dans l'ordre inverse) ──
    for (let i = 0; i < 4; i++) {
      await page.evaluate(function () { window.HistoryManager.undo(); });
      await page.waitForTimeout(300);
    }
    const e5 = await etat(page);
    verifier(JSON.stringify(e5.niveaux) === JSON.stringify({ rd: 0, zn: 0, st: 0, pt: 0 }),
      "⏪ ×4 : les quatre objets reviennent au niveau 0", e5.niveaux);
    verifier(e5.surCarte.rd && e5.surCarte.st && e5.opacitePoi === 1, "⏪ : tracé, structure et POI réaffichés", e5);
    const sigOk = await page.evaluate(function () {
      if (!window.RoadGraph || !window.RoadGraph.stats) return null;
      window.RoadGraph.getGraph();
      const avant = window.RoadGraph.stats().sig;
      window.HistoryManager.redo();
      window.RoadGraph.getGraph();
      const apres = window.RoadGraph.stats().sig;
      return { avant: avant, apres: apres };
    });
    verifier(sigOk && sigOk.avant !== sigOk.apres,
      "🩸 graphe de navigation : la signature change avec le niveau d'un tracé (⏩)", sigOk);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(function () { window.HistoryManager.redo(); });
      await page.waitForTimeout(300);
    }
    const e6 = await etat(page);
    verifier(JSON.stringify(e6.niveaux) === JSON.stringify({ rd: 1, zn: -1, st: 2, pt: -2 }),
      "⏩ ×4 : les quatre changements sont rétablis", e6.niveaux);

    // ── Persistance ──
    await page.evaluate(function () { return window.SessionPersist.save({ force: true }); });
    await page.waitForTimeout(1500);
    await ouvrir(page);
    const e7 = await etat(page);
    verifier(JSON.stringify(e7.niveaux) === JSON.stringify({ rd: 1, zn: -1, st: 2, pt: -2 }),
      "rechargé : les niveaux choisis sont restaurés", e7.niveaux);
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  if (erreursConsole.length) {
    erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — le niveau d'un objet de session se change, se filtre, s'annule et persiste.");
  process.exit(0);
})();
