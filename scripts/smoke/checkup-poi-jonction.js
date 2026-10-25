#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-poi-jonction.js — checkup (Playwright, pas un hook pré-commit) : POI « entre niveaux »
// =====================================================================
// Sur le relevé fictif (multi-niveau), galeries de session FABRIQUÉES au lancement (niveaux 0 et −1, plus une
// galerie hors rayon) :
// A. Formulaire du POI : tag jpe, cases des niveaux, raccords proposés dans le rayon (5 m à l'échelle du plan,
//    50 px sans échelle), galerie lointaine non proposée, validation → `niveaux` + `accroches` sur le point ;
//    fiche : niveaux et raccords, raccords dessinés seulement fiche ouverte ; filtre : visible sur chacun de ses
//    niveaux, masqué ailleurs.
// B. Itinéraire par la fenêtre de l'app : forfait, profondeurs saisies, consigne de guidage, jps sans / avec corde.
// C. Sortie d'urgence : un peo multi-niveaux reste proposé, un jpe jamais.
// D. KMZ : le passage dans le dossier de chacun de ses niveaux, réimporté une seule fois avec ses niveaux.
// Usage : node scripts/smoke/checkup-poi-jonction.js (SMOKE_PORT pour une autre copie ; PJ_SHOTS=<dossier> : captures)
// Doc : docs/architecture/multilevel-pathfinding.md §26.11
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

// Même repli que checkup-jonction-fiche.js : on ouvre ce que l'index propose, en le disant.
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
const SHOTS = process.env.PJ_SHOTS || null;
async function capture(page, nom) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, nom + ".png") });
}
const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.KtaPoiJonction && !!window.Pathfinder && !!window.HistoryManager;
  }, 20000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
  });
  await page.waitForTimeout(300);
}

// Réseau fictif autour du centre de la vue. Échelle E (px/m) : tout se mesure en mètres.
//   niveau 0 : galerie G0 de (x−40 m, y) à (x+40 m, y) ;
//   niveau −1 : galerie G1 de (x+1 m, y−40 m) à (x+1 m, y+40 m) (1 m du puits) ;
//   niveau −1 : galerie lointaine GL à 30 m (hors rayon) ;
//   niveau −1 : retour R1 qui rejoint G0 seulement par une jonction en tracé à 60 m (le détour).
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const h = window.APP_CONFIG.imageHeight;
    const E = (Number(window.APP_CONFIG.scale) > 0) ? Number(window.APP_CONFIG.scale) : 10;
    const x = Math.round(c.lng), y = Math.round(h - c.lat);
    const m = function (v) { return Math.round(v * E * 100) / 100; };
    window.APP_CONFIG.availableLevels = [-1, 0, 1];
    window.APP_CONFIG.visibleLevels = [-1, 0];
    window.APP_CONFIG.activeLevel = 0;
    window.setRoads([
      { uid: "rd_pj0", type: "principal", level: 0, points: [{ x: x - m(40), y: y }, { x: x + m(40), y: y }] },
      { uid: "rd_pj1", type: "principal", level: -1, points: [{ x: x + m(1), y: y - m(40) }, { x: x + m(1), y: y + m(40) }] },
      { uid: "rd_pjl", type: "principal", level: -1, points: [{ x: x - m(30), y: y - m(30) }, { x: x - m(30), y: y + m(30) }] }
    ]);
    window.setEditorPoints([]);
    window.KtaUid.setTombstones([]);
    if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    window.HistoryManager.reset();
    window.__pj = { x: x, y: y, E: E, echelle: Number(window.APP_CONFIG.scale) > 0 };
    return window.__pj;
  });
}

async function partieFormulaire(page) {
  const P = await semer(page);
  inf("échelle du plan : " + (P.echelle ? P.E + " px/m (rayon 5 m)" : "aucune (rayon 50 px)"));
  await page.evaluate(function () { window.afficherFormulaire(window.__pj.x, window.__pj.y); });
  await attendre(page, function () { return !!document.getElementById("kta-poi-modal"); }, 5000);
  const avant = await page.evaluate(function () {
    const b = document.getElementById("kta-poi-jonction");
    return { existe: !!b, cache: !!(b && b.hidden) };
  });
  verifier(avant.existe && avant.cache, "formulaire : bloc « Niveaux desservis » présent, masqué tant que le tag n'est pas un passage", avant);
  await page.fill("#kta-poi-nom", "Puits test");
  await page.selectOption("#kta-poi-type", "jpe");
  const apresTag = await page.evaluate(function () {
    const b = document.getElementById("kta-poi-jonction");
    const cases = Array.from(b.querySelectorAll("input[data-niv]")).map(function (c) {
      return { n: Number(c.dataset.niv), coche: c.checked, fige: c.disabled };
    });
    return { visible: !b.hidden, cases: cases, texte: b.textContent };
  });
  verifier(apresTag.visible, "formulaire : tag jpe → bloc affiché");
  const c0 = apresTag.cases.find(function (c) { return c.n === 0; });
  verifier(!!c0 && c0.coche && c0.fige, "formulaire : niveau du point (0) coché et figé", apresTag.cases);
  verifier(apresTag.cases.some(function (c) { return c.n === -1 && !c.coche; }), "formulaire : niveau −1 proposé, non coché");
  await page.check('#kta-poi-jonction input[data-niv="-1"]');
  const props = await page.evaluate(function () {
    return Array.from(document.querySelectorAll("#kta-poi-jonction input[data-acc-niv]")).map(function (c) {
      return { n: Number(c.dataset.accNiv), x: Number(c.dataset.accX), y: Number(c.dataset.accY), coche: c.checked,
        texte: c.parentNode.textContent };
    });
  });
  const pr0 = props.filter(function (p) { return p.n === 0; });
  const pr1 = props.filter(function (p) { return p.n === -1; });
  verifier(pr0.length === 1 && pr1.length === 1, "raccords : une galerie proposée par niveau (la lointaine à 30 m ne l'est pas)", props);
  verifier(props.every(function (p) { return !p.coche; }), "raccords : proposés NON validés (l'utilisateur valide)");
  verifier(pr1.length === 1 && Math.abs(pr1[0].x - (P.x + P.E)) < 0.6 && Math.abs(pr1[0].y - P.y) < 0.6,
    "raccords : niveau −1 calé sur la galerie, à 1 m du puits", pr1);
  const rayonTxt = await page.evaluate(function () { return document.getElementById("kta-poi-jonction-rayon").textContent; });
  verifier(P.echelle ? /5/.test(rayonTxt) : /50/.test(rayonTxt), "raccords : le rayon est dit (" + rayonTxt + ")");
  await page.check('#kta-poi-jonction input[data-acc-niv="0"]');
  await page.check('#kta-poi-jonction input[data-acc-niv="-1"]');
  await capture(page, "formulaire");
  await page.click("#kta-poi-valider");
  await attendre(page, function () { return !document.getElementById("kta-poi-modal"); }, 5000);
  const pt = await page.evaluate(function () {
    const p = (window.getEditorPoints() || []).find(function (q) { return q.nom === "Puits test"; });
    return p ? { niveaux: p.niveaux, accroches: p.accroches, level: p.level, tags: p.tags, uid: p.uid, maj: p.updatedAt } : null;
  });
  verifier(!!pt && JSON.stringify(pt.niveaux) === "[-1,0]" && pt.level === 0,
    "point : niveaux [−1, 0], level 0 gardé", pt);
  verifier(!!pt && Array.isArray(pt.accroches) && pt.accroches.length === 2 && !!pt.uid && typeof pt.maj === "number",
    "point : 2 raccords validés, uid et updatedAt posés", pt);
  return pt;
}

async function partieFiche(page) {
  // Fiche : ouvrir la popup du marqueur → raccords dessinés ; fermer → retirés.
  const r = await page.evaluate(function () {
    let mk = null;
    window.map.eachLayer(function (l) {
      if (l instanceof L.Marker && l.getPopup && l._ktaNiveaux) mk = l;
    });
    if (!mk) return { mk: false };
    const compter = function () {
      let n = 0;
      window.map.eachLayer(function (l) { if (l instanceof L.Polyline && l.options && l.options.dashArray === "4 4") n++; });
      return n;
    };
    const ferme = compter();
    mk.openPopup();
    window.__pjMk = mk;
    const html = mk.getPopup().getElement() ? mk.getPopup().getElement().textContent : "";
    const ouvert = compter();
    mk.closePopup();
    return { mk: true, ferme: ferme, ouvert: ouvert, apres: compter(), html: html, niveaux: mk._ktaNiveaux };
  });
  verifier(r.mk, "carte : le marqueur du passage porte ses niveaux", r.niveaux);
  verifier(r.ferme === 0 && r.ouvert === 2 && r.apres === 0, "fiche : 2 raccords dessinés seulement fiche ouverte", r);
  verifier(/2/.test(r.html) && /-1/.test(r.html), "fiche : niveaux et nombre de raccords lisibles", r.html);
  // Filtre : visible sur chacun de ses niveaux, masqué ailleurs.
  const f = await page.evaluate(function () {
    function opacite() {
      let o = null;
      window.map.eachLayer(function (l) { if (l instanceof L.Marker && l._ktaNiveaux) o = l.options.opacity; });
      return o;
    }
    const out = {};
    [[-1], [0], [1]].forEach(function (v) {
      window.APP_CONFIG.visibleLevels = v;
      window.appliquerFiltreNiveau();
      out[String(v[0])] = opacite();
    });
    window.APP_CONFIG.visibleLevels = [-1, 0];
    window.appliquerFiltreNiveau();
    return out;
  });
  verifier(f["-1"] === 1 && f["0"] === 1 && f["1"] === 0, "filtre : visible au 0 et au −1, masqué au +1", f);
  if (SHOTS) {
    await page.evaluate(function () { window.__pjMk.openPopup(); });
    await page.waitForTimeout(400);
    await capture(page, "fiche");
    await page.evaluate(function () { window.__pjMk.closePopup(); });
  }
}

// B. Itinéraire par la fenêtre de l'app : A sur la galerie du 0 (30 m à l'ouest du puits), B sur celle du −1
// (30 m au sud). Sans le puits, aucun chemin (les deux galeries ne se touchent pas) : par lui, 30 + forfait 20
// + 1 + 30 = 81 m ; profondeurs saisies (6 m d'écart) : 67 m.
async function calculer(page) {
  await page.evaluate(function () {
    const e = document.getElementById("kta-iti-error"); if (e) e.style.display = "none";
    const r = document.getElementById("kta-iti-result"); if (r) r.style.display = "none";
  });
  await page.click("#kta-iti-compute");
  await attendre(page, function () {
    const r = document.getElementById("kta-iti-result"), e = document.getElementById("kta-iti-error");
    return (r && r.style.display === "block") || (e && e.style.display === "block");
  }, 15000);
  return page.evaluate(function () {
    const r = document.getElementById("kta-iti-result"), e = document.getElementById("kta-iti-error");
    const ok = r.style.display === "block";
    const it = (window.getRoads() || []).find(function (x) { return x.type === "itinerary"; });
    let consigne = null;
    if (ok && it && window.ItiGuidage) {
      const g = window.ItiGuidage.construire(it);
      const c = g && g.consignes.find(function (k) { return k.type === "niveau"; });
      consigne = c ? window.ItiGuidage.texteAction(c) : null;
    }
    const m = ok ? (r.textContent.match(/(\d+(?:[.,]\d+)?)\s*m\b/) || [])[1] : null;
    return { ok: ok, err: ok ? null : e.textContent, distM: m ? Number(m.replace(",", ".")) : null,
             via: !!(it && it.points.some(function (p) { return p.via; })), consigne: consigne };
  });
}

async function partieItineraire(page) {
  await page.evaluate(function () {
    const P = window.__pj, E = P.E;
    try { localStorage.removeItem("myktamap_route_avoid_" + (window._currentLoadedPlanId || "default")); } catch (e) {}
    window.itineraireAjouterWaypoint(P.x - 30 * E, P.y, "A");
    window.itineraireAjouterWaypoint(P.x + E, P.y + 30 * E, "B");
  });
  await attendre(page, function () { return !!document.getElementById("kta-iti-compute"); }, 5000);
  let r = await calculer(page);
  verifier(r.ok && Math.abs(r.distM - 81) <= 0.6,
    "itinéraire 0 → −1 par le puits jpe : 30 + 20 (forfait échelons) + 1 + 30 = 81 m", r);
  verifier(r.via && /échelle/.test(r.consigne || ""), "guidage : la consigne dit « par l'échelle » (" + r.consigne + ")");
  // Profondeurs saisies : 6 m entre le 0 et le −1 remplacent le forfait.
  await page.evaluate(function () {
    window.__profOrig = window.getProfondeurNiveau;
    window.getProfondeurNiveau = function (n) { return n === 0 ? -25 : (n === -1 ? -31 : null); };
  });
  r = await calculer(page);
  verifier(r.ok && Math.abs(r.distM - 67) <= 0.6, "profondeurs saisies : la vraie différence (6 m) remplace le forfait → 67 m", r);
  await page.evaluate(function () { window.getProfondeurNiveau = window.__profOrig; });
  // Puits sans échelon : exclu sans la case corde, emprunté avec.
  await page.evaluate(function () {
    const p = window.getEditorPoints().find(function (q) { return q.nom === "Puits test"; });
    p.tags = ["jps"];
    window.renderEditorPoints();
  });
  r = await calculer(page);
  verifier(!r.ok, "jps sans « équipe équipée (corde) » : hors itinéraire (aucun chemin)", r);
  const caseCorde = await page.evaluate(function () { return !!document.getElementById("kta-iti-corde"); });
  verifier(caseCorde, "fenêtre d'itinéraire : case « équipe équipée (corde) » présente (plan multi-niveau)");
  if (caseCorde) {
    // La case vit dans « Évitements » (repliée) : on l'ouvre comme un utilisateur.
    await page.click(".kta-iti-avoid-details > summary");
    await page.check("#kta-iti-corde");
    r = await calculer(page);
    verifier(r.ok && Math.abs(r.distM - 81) <= 0.6 && /corde/.test(r.consigne || ""),
      "jps avec la case corde : emprunté (81 m), consigne « par le puits (corde) »", r);
    await page.uncheck("#kta-iti-corde");
  }
  await page.evaluate(function () {
    const p = window.getEditorPoints().find(function (q) { return q.nom === "Puits test"; });
    p.tags = ["jpe"];
    window.renderEditorPoints();
    const b = document.getElementById("kta-iti-close"); if (b) b.click();
  });
  await page.waitForTimeout(300);
}

// C. Sortie d'urgence : un peo qui dessert aussi deux niveaux reste une sortie, le jpe jamais.
async function partieSortie(page) {
  await page.evaluate(function () {
    const P = window.__pj, E = P.E;
    window.setRoads((window.getRoads() || []).filter(function (r) { return r.type !== "itinerary"; }));
    const pts = window.getEditorPoints().slice();
    pts.push({ id: "PuitsSurface", nom: "PuitsSurface", x: P.x - 35 * E, y: P.y, level: 0, tags: ["peo"],
               niveaux: [0, -1], accroches: [] });
    window.setEditorPoints(pts);
    window.SortieUrgence.declencherDepuis(P.x - 20 * E, P.y, 0, {});
  });
  await attendre(page, function () {
    const m = document.getElementById("kta-sortie-urgence-modal");
    return !!(m && m.querySelector(".kta-sortie-principal"));
  }, 15000);
  await page.waitForTimeout(500);
  const txt = await page.evaluate(function () {
    const m = document.getElementById("kta-sortie-urgence-modal");
    const t = m ? m.textContent : "";
    const b = document.getElementById("kta-sortie-close"); if (b) b.click();
    return t;
  });
  verifier(txt.indexOf("PuitsSurface") >= 0, "sortie d'urgence : le peo multi-niveaux reste proposé");
  verifier(txt.indexOf("Puits test") < 0, "🔒 sortie d'urgence : le puits entre niveaux (jpe) n'est jamais proposé");
}

// D. KMZ niveau par niveau, relu par l'import de l'app : le passage est dans les dossiers 0 et −1, réimporté UNE fois
// avec ses niveaux (la copie est sautée). Calage fictif posé sur l'emprise du plan.
async function partieKmz(page) {
  const r = await page.evaluate(function () {
    const W = window.APP_CONFIG.imageWidth || 4000, H = window.APP_CONFIG.imageHeight || 3000;
    const tr = window.KmzExport.buildTransformCalib({
      pointA: { x: 0, y: H, lat: 46.5, lng: 3.0 },
      pointB: { x: W, y: 0, lat: 46.51, lng: 3.02 },
      pointC: { x: W, y: H, lat: 46.5, lng: 3.02 }
    });
    const pts = window.getEditorPoints().filter(function (p) { return p.nom === "Puits test"; });
    const kml = window.KmzExport.genererKml({ transform: tr, planName: "Test",
      include: { points: true }, levels: new Set([0, -1]),
      data: { editorPoints: pts, roads: [], zones: [], structures: [] } });
    const doc = new DOMParser().parseFromString(kml, "application/xml");
    // L'import a sa propre transformation (coins NW / NE de l'image) ; seuls le compte et les champs comptent ici.
    const trImp = window.KmzImport.buildTransform({ nw: { lat: 46.51, lng: 3.0 }, ne: { lat: 46.51, lng: 3.02 } }, W, H);
    const lu = window.KmzImport.ingestPlacemarks(doc, trImp, { pointTag: "info", roadType: "chemin", zoneType: "eau" });
    return { placemarks: (kml.match(/<name>Puits test<\/name>/g) || []).length,
             importes: lu.points.length, niveaux: lu.points[0] && lu.points[0].niveaux,
             tag: lu.points[0] && lu.points[0].tags[0] };
  });
  verifier(r.placemarks === 2, "KMZ niveau par niveau : le passage dans le dossier du 0 et dans celui du −1", r);
  verifier(r.importes === 1 && JSON.stringify(r.niveaux) === "[-1,0]" && r.tag === "jpe",
    "KMZ réimporté : un seul point, tag et niveaux gardés (la copie est sautée)", r);
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
    console.log("A. Formulaire, raccords, fiche, filtre");
    await partieFormulaire(page);
    await partieFiche(page);
    console.log("B. Itinéraire par le puits (forfait, profondeurs, corde)");
    await partieItineraire(page);
    console.log("C. Sortie d'urgence");
    await partieSortie(page);
    console.log("D. KMZ niveau par niveau");
    await partieKmz(page);
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
  console.log("🎉 CHECKUP VERT — POI entre niveaux : formulaire, raccords, fiche, filtre, itinéraire, corde, sortie, KMZ.");
  process.exit(0);
})();
