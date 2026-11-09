#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-zones-niveaux.js — checkup (Playwright, pas un hook pré-commit) : zone reliée à plusieurs niveaux
// =====================================================================
// Plan multi-niveau FABRIQUÉ dans la page (image dessinée sur un canvas, ZIP construit en mémoire, rien lu ni
// écrit dans data/), galeries de session au −2 (droite + détour), puis :
// A. Zone inaccessible tracée au −1 par de vrais clics de carte (outil de zone), fiche : cases « Aussi aux
//    niveaux » (niveaux du plan hors −1), −2 coché puis appliqué → `niveaux` [−2, −1], `level` −1.
// B. Filtre : visible au −1 et au −2, absente au 0. Zone d'un calque de données portant `niveaux` : même règle.
// C. Itinéraire au −2 (Pathfinder de l'app, zones de la session) : la zone est contournée ; sans elle, direct.
// D. Annulation (HistoryManager.undo = ⏪) puis rétablissement ; KMZ relu par l'import de l'app (une zone, ses
//    niveaux, la copie sautée) ; rechargement de la page : `niveaux` restauré par la session.
// E. Zone jonction (type `pente`) : menu Zone → Jonction → « du niveau … au niveau … » → dessin (niveaux remplis
//    seuls) ; fiche (Du / Au niveau, avertissement, « Tracer la jonction » qui arme le tracé jonction pré-rempli) ;
//    couleur, libellé et filtre partagés avec le tracé jonction ; exports comparés au tracé (KMZ, GeoJSON, PNG / PDF,
//    légendes) ; Convertir vers Jonction (niveaux demandés, ⏪) ; ancienne zone `jonction: true` convertie à l'entrée
//    (session sans touch, calque du plan). KTA_CAPTURES=<dossier> : captures du menu, de la modale et de la fiche.
// F. Générateur : « Jonction » dans les types de zones (SIG, KMZ) avec ses niveaux de/à ; import SIG fictif (GeoJSON
//    en mémoire) → zone écrite dans le ZIP avec ses niveaux, couleurs par niveau sans effet sur elle ; ZIP rouvert.
// Usage : node scripts/smoke/checkup-zones-niveaux.js (SMOKE_PORT pour une autre copie de travail)
// Garde-fou logique associé : scripts/check-zones-niveaux.js · doc : docs/architecture/multilevel-pathfinding.md
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
const NOM_PLAN = "Plan fictif zones multi";

const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

async function apresOuverture(page) {
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.KtaConvertir && !!window.HistoryManager && !!window.Pathfinder;
  }, 30000);
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
  });
  await page.waitForTimeout(300);
}

// Plan fictif : image unie 1200 × 900, multi-niveau, un calque de données avec une zone 0 / +1.
async function chargerPlanFictif(page) {
  await page.evaluate(async function (nom) {
    const W = 1200, H = 900;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#cfcfcf"; g.fillRect(0, 0, W, H);
    const png = await new Promise(function (r) { c.toBlob(r, "image/png"); });
    const carre = function (cx, cy, r) {
      return [{ x: cx - r, y: cy - r }, { x: cx + r, y: cy - r }, { x: cx + r, y: cy + r }, { x: cx - r, y: cy + r }];
    };
    const zip = new JSZip();
    zip.file("fond.png", png);
    zip.file("calque.json", JSON.stringify({ data: [], roads: [], structures: [],
      zones: [{ uid: "zn_calque", type: "eau", level: 0, niveaux: [0, 1], points: carre(900, 200, 40),
                description: "zone de calque" },
              // Ancienne zone jonction (`jonction: true`) d'un calque : relue en type `pente` (section E).
              { uid: "zn_calque_ancienne", type: "eau", level: 0, niveaux: [0, 1], jonction: true,
                points: carre(1100, 800, 30) }] }));
    zip.file("plan-config.json", JSON.stringify({
      plan: { name: nom, version: "T1", imageWidth: W, imageHeight: H, baseImage: "fond.png", multiLevel: true },
      dataLayers: [{ id: "calque", label: "Calque", file: "calque.json", visible: true }],
      tracking: { startX: 600, startY: 450, scale: 4 },
      iconsEmbarquees: []
    }));
    const blob = await zip.generateAsync({ type: "blob" });
    await window.chargerZipFichier(new File([blob], "fictif-zones.zip", { type: "application/zip" }), "auto",
      { storeBlob: true });
  }, NOM_PLAN);
  await apresOuverture(page);
}

function niveaux(page, visibles, actif) {
  return page.evaluate(function (a) {
    window.APP_CONFIG.availableLevels = [-2, -1, 0, 1];
    window.APP_CONFIG.visibleLevels = a.v;
    if (a.actif !== undefined) window.APP_CONFIG.activeLevel = a.actif;
    window.appliquerFiltreNiveau();
  }, { v: visibles, actif: actif });
}

// Polygone de la zone sur la carte (layer porteur de sa fiche) et opacité de la zone de calque.
function surCarte(page, uid) {
  return page.evaluate(function (uid) {
    let session = false, calque = null;
    window.map.eachLayer(function (l) {
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (typeof c === "string" && c.indexOf('data-kta-uid="' + uid + '"') >= 0) session = true;
    });
    const e = (window._ktaDataPolygons || []).find(function (x) { return x.uid === "zn_calque"; });
    if (e) calque = e.polygon.options.fillOpacity;
    return { session: session, calqueVisible: calque !== null && calque > 0 };
  }, uid);
}

function zone(page) {
  return page.evaluate(function () {
    const z = window.getZones().find(function (o) { return o.type === "inaccessible"; });
    return z ? { uid: z.uid, level: z.level, niveaux: z.niveaux === undefined ? null : z.niveaux } : null;
  });
}

function longueurAuMoins2(page) {
  return page.evaluate(async function () {
    try {
      const r = await window.Pathfinder.computeRoute([{ x: 520, y: 450, level: -2 }, { x: 880, y: 450, level: -2 }], {});
      return Math.round(r.totalDistance);
    } catch (e) { return e.code || e.message; }
  });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
  await page.route(/tile\.openstreetmap\.org/, function (r) { return r.abort(); });
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
    await accueil(page);
    await chargerPlanFictif(page);
    verifier(await page.evaluate(function () { return window.APP_CONFIG.multiLevel === true; }),
      "plan fictif fabriqué dans la page, multi-niveau");

    // Galeries du −2 : droite y = 450 (x 500 → 900) et détour par y = 650.
    await page.evaluate(function () {
      const R = function (pts) { return { type: "principal", level: -2, points: pts.map(function (p) { return { x: p[0], y: p[1] }; }) }; };
      window.setRoads([R([[500, 450], [700, 450], [900, 450]]), R([[500, 450], [500, 650], [900, 650], [900, 450]])]);
      window.setZones([]);
      window.HistoryManager.reset();
      window.map.setView(window.convertCoord(700, 450), window.map.getZoom());
    });
    const direct = await longueurAuMoins2(page);
    verifier(direct === 360, "itinéraire au −2 sans zone : direct (360 px)", direct);

    // ── A. Tracé au −1 par l'outil de zone (vrais événements de clic de carte) ──
    console.log("A. Tracé et fiche");
    await niveaux(page, [-1], -1);
    await page.evaluate(function () {
      window.toggleZoneMode("inaccessible");
      const H = window.APP_CONFIG.imageHeight;
      [[680, 430], [720, 430], [720, 470], [680, 470], [680, 430]].forEach(function (p) {
        window.map.fire("click", { latlng: L.latLng(H - p[1], p[0]) });
      });
      window.toggleZoneMode("inaccessible");
    });
    await page.waitForTimeout(400);
    let z = await zone(page);
    verifier(!!z && z.level === -1 && z.niveaux === null, "zone tracée au −1, sans `niveaux` (zone simple)", z);
    const fiche = await page.evaluate(function (uid) {
      let cible = null;
      window.map.eachLayer(function (l) {
        const p = l.getPopup && l.getPopup();
        const c = p && p.getContent && p.getContent();
        if (!cible && typeof c === "string" && c.indexOf('data-kta-uid="' + uid + '"') >= 0) cible = l;
      });
      if (!cible) return null;
      cible.openPopup(cible.getBounds().getCenter());
      return true;
    }, z && z.uid);
    await page.waitForTimeout(400);
    const cases = await page.evaluate(function () {
      return Array.from(document.querySelectorAll(".leaflet-popup-content .kta-note-popup-niveaux-zone-cases input"))
        .map(function (c) { return { n: Number(c.value), coche: c.checked }; });
    });
    verifier(fiche && JSON.stringify(cases.map(function (c) { return c.n; })) === "[-2,0,1]" &&
      cases.every(function (c) { return !c.coche; }),
      "fiche : cases « Aussi aux niveaux » = niveaux du plan hors −1, aucune cochée", cases);
    await page.check('.leaflet-popup-content .kta-note-popup-niveaux-zone-cases input[value="-2"]');
    await page.click(".leaflet-popup-content .kta-note-popup-niveaux-zone-appliquer");
    await page.waitForTimeout(500);
    z = await zone(page);
    verifier(!!z && z.level === -1 && JSON.stringify(z.niveaux) === "[-2,-1]",
      "appliqué : niveaux [−2, −1], niveau d'origine −1 gardé", z);
    const toast = await page.evaluate(function () { return (document.getElementById("kta-toast") || document.body).textContent; });
    verifier(/-2, -1/.test(toast), "toast de confirmation avec la liste des niveaux");

    // ── B. Filtre ──
    console.log("B. Filtre de niveau");
    await niveaux(page, [-1]);
    let v = await surCarte(page, z.uid);
    verifier(v.session, "visible au −1", v);
    await niveaux(page, [-2]);
    v = await surCarte(page, z.uid);
    verifier(v.session, "visible au −2", v);
    await niveaux(page, [0]);
    v = await surCarte(page, z.uid);
    verifier(!v.session && v.calqueVisible, "absente au 0 ; la zone de calque 0 / +1 y est", v);
    await niveaux(page, [1]);
    v = await surCarte(page, z.uid);
    verifier(!v.session && v.calqueVisible, "zone de calque `niveaux` [0, +1] : visible au +1 aussi", v);
    await niveaux(page, [-2]);
    v = await surCarte(page, z.uid);
    verifier(!v.calqueVisible, "zone de calque : masquée au −2", v);

    // ── C. Itinéraire ──
    console.log("C. Itinéraire au −2");
    const contourne = await longueurAuMoins2(page);
    verifier(typeof contourne === "number" && contourne > 700, "itinéraire au −2 : la zone est contournée (" + contourne + " px)", contourne);

    // ── D. Annulation, KMZ, rechargement ──
    console.log("D. Annulation, KMZ, rechargement");
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(300);
    z = await zone(page);
    const apresUndo = await longueurAuMoins2(page);
    verifier(!!z && z.niveaux === null && apresUndo === 360, "⏪ : la zone redevient simple, le −2 n'est plus bloqué", { z: z, d: apresUndo });
    await page.evaluate(function () { window.HistoryManager.redo(); });
    await page.waitForTimeout(300);
    z = await zone(page);
    verifier(!!z && JSON.stringify(z.niveaux) === "[-2,-1]", "⏩ : niveaux [−2, −1] rétablis", z);

    const k = await page.evaluate(function () {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      const tr = window.KmzExport.buildTransformCalib({
        pointA: { x: 0, y: H, lat: 46.5, lng: 3.0 },
        pointB: { x: W, y: 0, lat: 46.51, lng: 3.02 },
        pointC: { x: W, y: H, lat: 46.5, lng: 3.02 }
      });
      const kml = window.KmzExport.genererKml({ transform: tr, planName: "Test", include: { zones: true },
        levels: new Set([-2, -1, 0]), data: { editorPoints: [], roads: [], zones: window.getZones(), structures: [] } });
      const doc = new DOMParser().parseFromString(kml, "application/xml");
      const trImp = window.KmzImport.buildTransform({ nw: { lat: 46.51, lng: 3.0 }, ne: { lat: 46.51, lng: 3.02 } }, W, H);
      const lu = window.KmzImport.ingestPlacemarks(doc, trImp, { pointTag: "info", roadType: "chemin", zoneType: "eau" });
      return { placemarks: (kml.match(/<Placemark>/g) || []).length, zones: lu.zones.length,
               type: lu.zones[0] && lu.zones[0].type, level: lu.zones[0] && lu.zones[0].level,
               niveaux: lu.zones[0] && lu.zones[0].niveaux };
    });
    verifier(k.placemarks === 2 && k.zones === 1 && k.type === "inaccessible" && k.level === -1 &&
      JSON.stringify(k.niveaux) === "[-2,-1]",
      "KMZ : la zone dans les dossiers −1 et −2, relue UNE fois avec ses niveaux", k);

    await page.evaluate(function () { return window.SessionPersist.save({ force: true }); });
    await page.waitForTimeout(1500);
    await accueil(page);
    await page.getByText(NOM_PLAN, { exact: false }).first().click();
    await apresOuverture(page);
    z = await zone(page);
    verifier(!!z && z.level === -1 && JSON.stringify(z.niveaux) === "[-2,-1]", "rechargé : `niveaux` restauré par la session", z);
    await niveaux(page, [-2]);
    v = await surCarte(page, z && z.uid);
    verifier(v.session, "rechargé : visible au −2", v);

    // ── E. Zone jonction : type « Jonction » du menu Zone (niveaux de/à, fiche, Tracer la jonction, lien avec le
    //    tracé jonction : couleur, libellé, filtre, exports, légende ; ancienne zone cochée convertie) ──
    console.log("E. Zone jonction (type dédié)");
    await niveaux(page, [-2, -1], -1);
    const CAP = process.env.KTA_CAPTURES || "";
    const capturer = async function (nom) {
      if (!CAP) return;
      await page.screenshot({ path: require("path").join(CAP, "zone-jonction-" + nom + ".png") });
    };
    // E1. Menu Zone → Jonction → « du niveau … au niveau … » → dessin
    const menu = await page.evaluate(function () {
      window.map.closePopup();
      window.ktaOuvrirOutils("zones", { vue3d: false });   // le panneau de la carte (Jonction : hors vue 3D)
      const fly = document.querySelector(".kta-group-flyout");
      const lib = window.I18n.t("ui.zone.pente");
      const btn = fly && Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (b) {
        return b.textContent.indexOf(lib) >= 0;
      })[0];
      return { vu: !!btn, types: fly ? fly.querySelectorAll(".kta-group-flyout-btn").length : 0 };
    });
    verifier(menu.vu, "menu Zone : type « Jonction » proposé à côté des autres (plan multi-niveau)", menu);
    await capturer("menu");
    await page.evaluate(function () {
      const fly = document.querySelector(".kta-group-flyout");
      const lib = window.I18n.t("ui.zone.pente");
      Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (b) {
        return b.textContent.indexOf(lib) >= 0;
      })[0].click();
    });
    await page.waitForTimeout(300);
    const modale = await page.evaluate(function () {
      const m = document.getElementById("kta-jct-modal");
      return m ? { titre: m.querySelector(".kta-readme-modal-titre").textContent, de: m.querySelector("#kta-jct-from").value }
        : null;
    });
    verifier(!!modale && modale.titre === await page.evaluate(function () { return window.I18n.t("config.zoneJonction.titre"); }),
      "choisir Jonction ouvre « du niveau … au niveau … » (titre de la zone jonction)", modale);
    await page.selectOption("#kta-jct-from", "-1");
    await page.selectOption("#kta-jct-to", "-2");
    await capturer("niveaux");
    await page.click("#kta-jct-ok");
    await page.waitForTimeout(300);
    const zp = await page.evaluate(function () {
      const mode = window.modeZone;
      const H = window.APP_CONFIG.imageHeight;
      [[300, 200], [400, 200], [400, 300], [300, 300], [300, 200]].forEach(function (p) {
        window.map.fire("click", { latlng: L.latLng(H - p[1], p[0]) });
      });
      window._desactiverTousLesModes();
      const q = window.getZones().find(function (o) { return o.type === "pente"; });
      return { mode: mode, z: q ? { uid: q.uid, level: q.level, niveaux: q.niveaux, jonction: "jonction" in q } : null };
    });
    verifier(zp.mode === "pente" && !!zp.z && zp.z.level === -1 && JSON.stringify(zp.z.niveaux) === "[-2,-1]" && !zp.z.jonction,
      "zone dessinée : type `pente`, niveaux [−2, −1] remplis seuls (départ −1), aucun champ à cocher", zp);
    // E2. Fiche : Du / Au niveau, pas de liste Niveau ni de cases, avertissement + « Tracer la jonction »
    const lireFiche = async function (uid) {
      await page.evaluate(function (u) {
        window.map.closePopup();
        let cible = null;
        window.map.eachLayer(function (l) {
          const p = l.getPopup && l.getPopup();
          const c = p && p.getContent && p.getContent();
          if (!cible && typeof c === "string" && c.indexOf('data-kta-uid="' + u + '"') >= 0) cible = l;
        });
        if (cible) cible.openPopup(cible.getBounds().getCenter());
      }, uid);
      await page.waitForTimeout(400);
      return page.evaluate(function () {
        const r = document.querySelector(".leaflet-popup-content .kta-note-popup");
        if (!r) return null;
        const v = function (s) { const e = r.querySelector(s); return e ? e.value : null; };
        const av = r.querySelector(".kta-note-popup-zone-jonction-avis");
        return { de: v(".kta-note-popup-pente-de"), vers: v(".kta-note-popup-pente-vers"),
          niveau: !!r.querySelector(".kta-note-popup-niveau"), cases: !!r.querySelector(".kta-note-popup-niveaux-zone-cases"),
          caseJct: !!r.querySelector(".kta-note-popup-zone-jonction-case"), avis: av ? av.textContent : null,
          tracer: !!r.querySelector(".kta-note-popup-pente-tracer") };
      });
    };
    let f = await lireFiche(zp.z.uid);
    verifier(!!f && f.de === "-1" && f.vers === "-2" && !f.niveau && !f.cases && !f.caseJct && !!f.avis && f.tracer,
      "fiche : Du niveau −1 / Au niveau −2, ni liste Niveau ni cases ni case « Zone jonction » ; sans tracé jonction " +
      "qui la traverse, elle le dit et propose « Tracer la jonction »", f);
    await capturer("bulle");
    // E3. « Tracer la jonction » : mode tracé jonction armé, niveaux pré-remplis, la zone prend sa pente
    await page.click(".leaflet-popup-content .kta-note-popup-pente-tracer");
    await page.waitForTimeout(300);
    const tr = await page.evaluate(function () {
      const etat = { mode: window.modeRoad, meta: window._jonctionPendingMeta };
      const H = window.APP_CONFIG.imageHeight;
      [[280, 250], [420, 250]].forEach(function (p) {
        window.map.fire("mousedown", { latlng: L.latLng(H - p[1], p[0]), originalEvent: { button: 0 } });
      });
      window._desactiverTousLesModes();
      const r = (window.getRoads() || []).find(function (o) { return o.type === "jonction" && o.points.length === 2 &&
        o.points[0].x === 280; });
      const z = window.getZones().find(function (o) { return o.type === "pente"; });
      const p = window.KtaGalerie.penteDeZone(z);
      return { etat: etat, route: r ? { uid: r.uid, de: r.fromLevel, vers: r.toLevel } : null, pente: p ? p.uid : null };
    });
    verifier(tr.etat.mode === "jonction" && tr.etat.meta && tr.etat.meta.fromLevel === -1 && tr.etat.meta.toLevel === -2 &&
      !!tr.route && tr.route.de === -1 && tr.route.vers === -2 && tr.pente === tr.route.uid,
      "« Tracer la jonction » : mode tracé jonction du −1 au −2 (pré-rempli), tracé posé à travers la zone, qui prend sa " +
      "pente (même règle que la 3D)", tr);
    f = await lireFiche(zp.z.uid);
    verifier(!!f && f.avis === null && !f.tracer, "fiche : plus d'avertissement ni de bouton une fois la jonction tracée", f);
    // E4. Couleur et libellé : ceux du tracé jonction, dans les deux sens
    const lien = await page.evaluate(function () {
      const LC = window.LegendCustomization, R = window.ktaResolveStyle;
      const out = { depart: R("zones", "pente").fillColor === R("traces", "jonction").color };
      LC.setColor("traces", "jonction", "#22aa55");
      let poly = null;
      window.map.eachLayer(function (l) {
        const c = l.getPopup && l.getPopup() && l.getPopup().getContent();
        if (typeof c === "string" && c.indexOf("kta-note-popup") >= 0 && l.options && l.options.fillColor === "#22aa55") poly = l;
      });
      out.carte = !!poly;
      LC.setColor("zones", "pente", "#3366ff");
      out.retour = R("traces", "jonction").color === "#3366ff" && R("zones", "pente").fillColor === "#3366ff";
      LC.setSessionLabel("traces", "jonction", "Rampe fictive");
      out.libelle = LC.getLabel("zones", "pente") === "Rampe fictive";
      LC.setSessionLabel("zones", "pente", "Rampe bis");
      out.libelleRetour = LC.getLabel("traces", "jonction") === "Rampe bis";
      out.uneLigne = !LC.listEntries("zones").some(function (e) { return e.key === "pente"; });
      LC.setColor("traces", "jonction", null);
      LC.setSessionLabel("traces", "jonction", null);
      out.reset = R("zones", "pente").fillColor === R("traces", "jonction").color;
      return out;
    });
    verifier(lien.depart && lien.carte && lien.retour && lien.libelle && lien.libelleRetour && lien.uneLigne && lien.reset,
      "couleur et libellé : ceux du tracé jonction (changer l'un change l'autre, carte repeinte, une seule ligne à éditer)", lien);
    // E5. Filtre : la puce « Jonction » des tracés masque aussi la zone
    const visibleZone = function () {
      return page.evaluate(function (u) {
        let vu = false;
        window.map.eachLayer(function (l) {
          const c = l.getPopup && l.getPopup() && l.getPopup().getContent();
          if (typeof c === "string" && c.indexOf('data-kta-uid="' + u + '"') >= 0) vu = true;
        });
        return vu;
      }, zp.z.uid);
    };
    await page.evaluate(function () { window.map.closePopup(); window.FilterPanel.setFilters({ roadTypes: new Set(["principal"]) }); });
    await page.waitForTimeout(500);
    const filtreMasque = { zone: await visibleZone(), zoneTypes: await page.evaluate(function () {
      const z = window._ktaRuntimeFilters.zoneTypes; return z ? z.has("pente") : "null"; }) };
    await page.evaluate(function () { window.FilterPanel.setFilters({ roadTypes: null }); });
    await page.waitForTimeout(500);
    const filtreVu = await visibleZone();
    verifier(!filtreMasque.zone && filtreMasque.zoneTypes === false && filtreVu,
      "filtre : masquer le type de tracé « Jonction » masque la zone jonction (même filtre), la réafficher la rend",
      { masque: filtreMasque, revu: filtreVu });
    // E6. Exports : zone et tracé jonction côte à côte (présence, couleur, légende)
    const ex = await page.evaluate(async function (u) {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      const tr = window.KmzExport.buildTransformCalib({
        pointA: { x: 0, y: H, lat: 46.5, lng: 3.0 }, pointB: { x: W, y: 0, lat: 46.51, lng: 3.02 },
        pointC: { x: W, y: H, lat: 46.5, lng: 3.02 } });
      const data = { editorPoints: [], roads: window.getRoads(), zones: window.getZones(), structures: [] };
      const lv = new Set([-2, -1, 0]);
      const kml = function (jct) {
        return window.KmzExport.genererKml({ transform: tr, planName: "Test", levels: lv, data: data,
          include: { roads: true, zones: true, jonctions: jct } });
      };
      const kAvec = kml(true), kSans = kml(false);
      const dossier = (kAvec.match(/<Folder><name>🪜 Jonctions \((\d+)\)/) || [])[1];
      const couleur = function (k, id) { const m = new RegExp('<Style id="' + id + '"><LineStyle><color>([0-9a-f]{8})')
        .exec(k); return m ? m[1].slice(2) : null; };
      const doc = new DOMParser().parseFromString(kAvec, "application/xml");
      const trImp = window.KmzImport.buildTransform({ nw: { lat: 46.51, lng: 3.0 }, ne: { lat: 46.51, lng: 3.02 } }, W, H);
      const lu = window.KmzImport.ingestPlacemarks(doc, trImp, { pointTag: "info", roadType: "chemin", zoneType: "eau" });
      const zLu = lu.zones.find(function (z) { return z.type === "pente"; });
      // KMZ d'avant le type dédié : `mkm:jonction` sur une zone d'eau → relue en zone jonction.
      const ancien = kAvec.split("<Placemark>").map(function (pm) {
        if (pm.indexOf("#zone_pente") < 0) return pm;
        return pm.replace("#zone_pente", "#zone_eau").replace('<Data name="mkm:niveaux">',
          '<Data name="mkm:jonction"><value>1</value></Data><Data name="mkm:niveaux">');
      }).join("<Placemark>");
      const luAncien = window.KmzImport.ingestPlacemarks(new DOMParser().parseFromString(ancien, "application/xml"), trImp,
        { pointTag: "info", roadType: "chemin", zoneType: "eau" });
      const gj = function (jct) {
        return window.GeojsonExport.generer({ transform: tr, epsg: window.GeojsonExport.EPSG_WGS84, levels: lv, data: data,
          include: { roads: true, zones: true, jonctions: jct } });
      };
      const fam = function (fc, t) { return fc.features.filter(function (x) { return x.properties.famille === "jonction" &&
        x.properties.type === t; }); };
      const g1 = gj(true), g0 = gj(false);
      const gz = fam(g1, "pente")[0], gt = fam(g1, "jonction")[0];
      // PNG / PDF (même moteur) : pixel dans la zone, hors du tracé ; pixel sur le tracé, hors de la zone.
      const rose = function (d) { return d[0] > d[1] + 40 && d[2] > d[1] + 20; };
      const pix = async function (ann) {
        const c = await window.MyKTAMapExporterGenererCanvas({ ann: ann, bg: "white", scale: 1, includeDataLayers: false });
        const g = c.getContext("2d");
        return { zone: rose(g.getImageData(350, 215, 1, 1).data), trace: rose(g.getImageData(290, 250, 1, 1).data) };
      };
      const pTous = await pix({ roads: true, zones: true });
      const pSansZones = await pix({ roads: true, zones: false });
      const pSansTraces = await pix({ roads: false, zones: true });
      // Légende du PNG / PDF : textes posés dans l'ordre ; ≡ Légende de l'app : HTML.
      const textes = [];
      const ft0 = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) { textes.push(String(t)); return ft0.apply(this, arguments); };
      try { await window.MyKTAMapExporterGenererCanvasLegende({ contenu: { traces: true, zones: true } }); }
      finally { CanvasRenderingContext2D.prototype.fillText = ft0; }
      const lib = window.LegendCustomization.getLabel("traces", "jonction");
      const iL = textes.indexOf(lib);
      const html = _ktaLegendeCorps(_sourcePlanCharge(), {});
      const n = html.split(lib).length - 1;
      return {
        kmz: { dossier: Number(dossier), sans: kSans.indexOf("<styleUrl>#zone_pente") < 0 && kSans.indexOf("🪜 Jonctions") < 0,
          couleur: couleur(kAvec, "zone_pente") === couleur(kAvec, "road_jonction"),
          relu: zLu ? { level: zLu.level, niveaux: zLu.niveaux } : null,
          ancien: (luAncien.zones.find(function (z) { return z.type === "pente"; }) || null) !== null },
        geojson: { zone: !!gz, trace: !!gt, sans: fam(g0, "pente").length === 0 && fam(g0, "jonction").length === 0,
          libelle: gz && gt && gz.properties.libelle === gt.properties.libelle,
          niveaux: gz ? gz.properties.niveaux : null },
        png: { tous: pTous, sansZones: pSansZones, sansTraces: pSansTraces },
        legende: { png: iL >= 0 && textes[iL + 1] === lib, app: n >= 2 }
      };
    }, zp.z.uid);
    verifier(ex.kmz.dossier === 2 && ex.kmz.sans && ex.kmz.couleur && !!ex.kmz.relu && ex.kmz.relu.level === -1 &&
      JSON.stringify(ex.kmz.relu.niveaux) === "[-2,-1]" && ex.kmz.ancien,
      "KMZ : zone et tracé jonction ensemble dans « 🪜 Jonctions », même couleur, absents ensemble sans la case ; relue en " +
      "zone jonction avec ses niveaux ; un ancien KMZ (`mkm:jonction`) relu en zone jonction", ex.kmz);
    verifier(ex.geojson.zone && ex.geojson.trace && ex.geojson.sans && ex.geojson.libelle &&
      JSON.stringify(ex.geojson.niveaux) === "[-2,-1]",
      "GeoJSON : zone et tracé jonction dans la même famille, même libellé, absents ensemble sans la case", ex.geojson);
    verifier(ex.png.tous.zone && ex.png.tous.trace && ex.png.sansZones.zone && ex.png.sansZones.trace &&
      !ex.png.sansTraces.zone && !ex.png.sansTraces.trace,
      "PNG / PDF : la zone jonction suit « Tracés » comme le tracé jonction (présents ensemble, absents ensemble), " +
      "à la couleur du tracé", ex.png);
    verifier(ex.legende.png && ex.legende.app,
      "légende (PNG / PDF et ≡ Légende) : la zone jonction juste sous le tracé jonction, même libellé", ex.legende);
    // E7. Convertir une zone en Jonction : « du niveau … au niveau … » demandé ; ⏪ annule
    const zi = await zone(page);
    await page.evaluate(function (u) {
      const z = window.getZones().find(function (o) { return o.uid === u; });
      window.KtaConvertir.ouvrir("zones", z);
    }, zi.uid);
    await page.waitForTimeout(300);
    await page.evaluate(function () {
      const lib = window.LegendCustomization.getLabel("zones", "pente");
      const b = Array.prototype.slice.call(document.querySelectorAll(".kta-convert-choix")).filter(function (x) {
        return x.textContent.indexOf(lib) >= 0;
      })[0];
      if (b) b.click();
    });
    await page.waitForTimeout(300);
    const conv0 = await page.evaluate(function () {
      const m = document.getElementById("kta-jct-modal");
      return m ? { de: m.querySelector("#kta-jct-from").value, vers: m.querySelector("#kta-jct-to").value } : null;
    });
    if (conv0) await page.click("#kta-jct-ok");
    await page.waitForTimeout(300);
    const conv = await page.evaluate(function (u) {
      const q = window.getZones().find(function (o) { return o.uid === u; });
      return q ? { type: q.type, level: q.level, niveaux: q.niveaux } : null;
    }, zi.uid);
    verifier(!!conv0 && conv0.de === "-1" && conv0.vers === "-2" && !!conv && conv.type === "pente" && conv.level === -1 &&
      JSON.stringify(conv.niveaux) === "[-2,-1]",
      "Convertir une zone en Jonction : « du niveau … au niveau … » demandé (niveaux de la zone proposés), uid gardé",
      { modale: conv0, zone: conv });
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(300);
    const annule = await page.evaluate(function (u) {
      const q = window.getZones().find(function (o) { return o.uid === u; });
      return q ? q.type : null;
    }, zi.uid);
    verifier(annule === "inaccessible", "⏪ : la conversion est annulée en un geste", annule);
    // E8. Ancienne zone cochée « Zone jonction » : convertie à l'entrée (session et calque), sans rien perdre
    const anc = await page.evaluate(function () {
      const zs = window.getZones().concat([{ uid: "zn_ancienne", type: "remblais", level: -1, niveaux: [-2, -1],
        jonction: true, updatedAt: 4242, points: [{ x: 50, y: 50 }, { x: 90, y: 50 }, { x: 90, y: 90 }] }]);
      window.setZones(zs);
      const q = window.getZones().find(function (o) { return o.uid === "zn_ancienne"; });
      const c = window.getAllEmbeddedZones().find(function (o) { return o.uid === "zn_calque_ancienne"; });
      return { session: { type: q.type, updatedAt: q.updatedAt, niveaux: q.niveaux, jonction: "jonction" in q },
        calque: c ? { type: c.type, niveaux: c.niveaux } : null };
    });
    verifier(anc.session.type === "pente" && anc.session.updatedAt === 4242 && !anc.session.jonction &&
      JSON.stringify(anc.session.niveaux) === "[-2,-1]" && !!anc.calque && anc.calque.type === "pente",
      "ancienne zone « Zone jonction » : type Jonction à l'ouverture (session : niveaux, uid et updatedAt gardés ; calque " +
      "du plan aussi)", anc);
    // ── F. Générateur : type « Jonction » dans les menus de types de zones (import SIG / KMZ), niveaux de/à saisis,
    //    écrite dans le ZIP, relue en zone jonction ; couleurs par niveau sans effet sur elle ──
    console.log("F. Générateur");
    const gen = await page.evaluate(async function () {
      const out = {};
      out.menus = _SIG_TYPES.polygones.indexOf("pente") >= 0 && _SIG_TYPES_SUP.lignes.indexOf("zone:pente") >= 0 &&
        /kta-kmz-imp-pente-de/.test(_htmlNiveauxPente("kta-kmz-imp"));
      const carre = function (lng, lat, d) {
        return [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]];
      };
      const gj = { type: "FeatureCollection", features: [
        { type: "Feature", properties: { type: "salle", niv: "-1" }, geometry: { type: "Polygon", coordinates: carre(3.0, 46.5, 0.0004) } },
        { type: "Feature", properties: { type: "eau", niv: "-2" }, geometry: { type: "Polygon", coordinates: carre(3.001, 46.5, 0.0003) } },
        { type: "Feature", properties: { type: "galerie", niv: "-1" }, geometry: { type: "LineString", coordinates: [[3.0, 46.5], [3.002, 46.501]] } }
      ] };
      const normalise = window.SigImport.parseGeoJson(JSON.stringify(gj));
      const res = await window.SigImport.genererZipMyktamap({
        normalise: normalise, bounds: window.SigImport.calculerBounds(normalise), planName: "Plan fictif jonction SIG",
        canvasWidth: 800, multiLevel: false, layerLabel: "SIG",
        mapping: { cleType: "type", mapTags: {}, mapTraces: { galerie: "principal" }, mapZones: { salle: "pente", eau: "eau" },
                   cleNiveau: "niv", couleurParNiveau: true, pente: { de: -1, vers: -2 } } });
      const zip = await JSZip.loadAsync(res.blob);
      const pc = JSON.parse(await zip.file("plan-config.json").async("string"));
      const sig = JSON.parse(await zip.file("data/sig.json").async("string"));
      const zj = sig.zones.find(function (z) { return z.type === "pente"; });
      const autre = sig.zones.find(function (z) { return z.type !== "pente"; });
      out.sig = { multi: pc.plan.multiLevel === true, zone: zj ? { level: zj.level, niveaux: zj.niveaux } : null,
        autreParNiveau: !!(autre && /^cust-/.test(autre.type)) };
      // Ouverture du ZIP généré : la zone est relue en zone jonction (couleur du tracé jonction).
      await window.chargerZipFichier(new File([res.blob], "fictif-sig-jonction.zip", { type: "application/zip" }), "auto",
        { storeBlob: false });
      return out;
    });
    await apresOuverture(page);
    const relu = await page.evaluate(function () {
      const z = (window.getAllEmbeddedZones() || []).find(function (o) { return o.type === "pente"; });
      return z ? { niveaux: window.ktaNiveauxObjet(z), couleur: window.ktaResolveStyle("zones", "pente").fillColor ===
        window.ktaResolveStyle("traces", "jonction").color } : null;
    });
    verifier(gen.menus, "Générateur : « Jonction » dans les types de zones (SIG polygones et lignes, import KMZ), " +
      "avec « du niveau … au niveau … »", gen.menus);
    verifier(!!gen.sig.zone && gen.sig.zone.level === -1 && JSON.stringify(gen.sig.zone.niveaux) === "[-2,-1]" &&
      gen.sig.multi && gen.sig.autreParNiveau,
      "import SIG : zone Jonction écrite dans le ZIP avec ses niveaux (départ −1), plan multi-niveau ; les couleurs par " +
      "niveau ne la changent pas en type de niveau (les autres zones, si)", gen.sig);
    verifier(!!relu && JSON.stringify(relu.niveaux) === "[-2,-1]" && relu.couleur,
      "ZIP du Générateur ouvert : zone relue en zone jonction, à la couleur du tracé jonction", relu);
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  if (erreursConsole.length) erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — zone sur plusieurs niveaux : fiche, filtre, itinéraire, annulation, KMZ, rechargement, " +
    "zone jonction (type dédié, comparée au tracé jonction).");
  process.exit(0);
})();
