#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🪧 checkup-guidage.js — checkup de RELEASE (pas un hook pré-commit)
// =====================================================================
// Vérifie le guidage de l'itinéraire (js/itiGuidage.js) DANS L'APP RÉELLE,
// en taille téléphone (390×844) : c'est là qu'il sert, et c'est là qu'un
// bandeau trop large ou masqué se voit.
//
// Le filet logique (scripts/check-guidage.js) tourne sur des réseaux fictifs ;
// ce checkup-ci vérifie ce qu'il ne peut pas voir : le rendu, le câblage au
// tracker, la cohabitation avec l'en-tête, les colonnes de boutons, l'écran XL.
//
// Il ouvre le plan que liste `data/index.json` (le relevé fictif s'il y est)
// et choisit lui-même deux points nommés : aucun nom de plan ni de point ici.
//
// CE QUI EST VÉRIFIÉ :
//   G1. itinéraire « Y aller » calculé → bandeau visible, sous l'en-tête,
//       entre les colonnes de boutons, avec une consigne
//   G2. raccord à vol d'oiseau dessiné en pointillé (si le départ est hors tracé)
//   G3. toucher le bandeau → feuille de route peuplée
//   G4. avancer le long du trajet → la distance restante baisse / la consigne change
//   G5. s'écarter → « Hors itinéraire ? » + 3 boutons
//   G6. écran XL → la consigne y est reprise
//   G8. itinéraire d'urgence → pas de croix
//   G9. suivi arrêté → bandeau masqué
//   + zéro erreur console / pageerror / clé i18n manquante
//
// Captures : dossier $GUID_SHOTS (défaut : dossier temporaire du système).
// Usage : node scripts/smoke/checkup-guidage.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
require("./server.js");

const BASE = "http://127.0.0.1:8123";
const SHOTS = process.env.GUID_SHOTS || path.join(os.tmpdir(), "kta-checkup-guidage");
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return (fictif || plans[0] || {}).name || "Relevé fictif de test";
  } catch (e) {
    return "Relevé fictif de test";
  }
}

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg)  { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }

(async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  let nav;
  try { nav = await chromium.launch(); }
  catch (e) {
    if (!/Executable doesn't exist/i.test(String((e && e.message) || ""))) throw e;
    nav = await chromium.launch({ channel: "chromium" });
  }
  const page = await nav.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("console", function (m) {
    const t = m.text();
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro|404/i.test(t)) pb("console : " + t);
    if (/\[I18n\] Clé manquante/.test(t)) pb("i18n : " + t);
  });
  page.on("pageerror", function (e) { pb("pageerror : " + e.message); });
  const shot = async function (nom) {
    const f = path.join(SHOTS, nom + ".png");
    await page.screenshot({ path: f });
    inf("capture : " + f);
  };

  try {
    const PLAN = planAOuvrir();
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.getByText(PLAN, { exact: false }).first().click();
    await page.waitForFunction(function () {
      return !!window.PLAN_CONFIG && !!window.map && !!window.ItiGuidage && !!window.Pathfinder;
    }, null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    ok("plan chargé, ItiGuidage présent");

    // Deux points nommés à 60–250 m l'un de l'autre (calcul court).
    const choix = await page.evaluate(function () {
      const e = Number(window.APP_CONFIG.scale) || 1;
      const pts = [].concat(window.getEditorPoints ? window.getEditorPoints() : [],
                            window.getAllEmbeddedPoints ? window.getAllEmbeddedPoints() : [])
        .filter(function (p) { return p && p.nom && typeof p.x === "number"; });
      for (let i = 0; i < pts.length; i++) {
        for (let j = 0; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / e;
          if (i !== j && d > 60 && d < 250) return { a: pts[i], b: pts[j], d: Math.round(d) };
        }
      }
      return null;
    });
    if (!choix) { pb("aucune paire de points nommés à 60–250 m : checkup impossible sur ce plan"); throw new Error("stop"); }
    inf("trajet entre deux points nommés à ~" + choix.d + " m à vol d'oiseau");

    // Position fictive pilotée par le test (le tracker n'a pas de capteurs ici).
    await page.evaluate(function (a) {
      window.__guidPos = { x: a.x + 12, y: a.y + 9 };   // un peu à côté du point : départ hors tracé probable
      window.getTrackingPosition = function () { return window.__guidPos; };
      window.getTrackingPositionEtat = function () { return { confirmee: true, ts: Date.now(), suiviActif: true }; };
      window.startTracking();
    }, choix.a);
    await page.evaluate(function (b) { window.itineraireYAller(b.x, b.y, b.nom); }, choix.b);
    await page.waitForFunction(function () {
      return (window.getRoads() || []).some(function (r) { return r.type === "itinerary"; });
    }, null, { timeout: 180000 });
    await page.evaluate(function () { window.ItiGuidage.rafraichir(); });
    await page.waitForTimeout(800);

    // G1 — bandeau
    const g1 = await page.evaluate(function () {
      const el = document.getElementById("kta-guid-bandeau");
      if (!el || el.style.display === "none") return null;
      const r = el.getBoundingClientRect();
      const header = document.querySelector(".kta-refonte-header");
      const hb = header ? header.getBoundingClientRect().bottom : 0;
      return { top: r.top, left: r.left, right: r.right, width: r.width, hb: hb,
               txt: el.querySelector(".kta-guid-principal").textContent, vw: window.innerWidth };
    });
    if (!g1) pb("G1 : bandeau absent");
    else {
      ok("G1 : bandeau visible — « " + g1.txt + " »");
      if (g1.top < g1.hb) pb("G1 : le bandeau passe sous l'en-tête (top " + g1.top + " < " + g1.hb + ")");
      else ok("G1 : sous l'en-tête");
      if (g1.left < 44 || g1.right > g1.vw - 44) pb("G1 : le bandeau déborde sur les colonnes de boutons");
      else ok("G1 : entre les colonnes de boutons (" + Math.round(g1.width) + " px)");
    }
    await shot("g1-bandeau");

    // G2 — raccord pointillé
    const g2 = await page.evaluate(function () {
      const iti = window.getRoads().find(function (r) { return r.type === "itinerary"; });
      const rac = (iti.raccords || []).filter(function (r) { return r.distPx > 0.5; }).length;
      return { rac: rac, dom: document.querySelectorAll(".kta-itinerary-raccord").length,
               carrefours: (iti.carrefours || []).length };
    });
    if (g2.rac > 0 && g2.dom === 0) pb("G2 : " + g2.rac + " raccord(s) mais aucun pointillé dessiné");
    else ok("G2 : " + g2.dom + " pointillé(s) pour " + g2.rac + " raccord(s) · " + g2.carrefours + " carrefour(s) sur le trajet");

    // G3 — feuille de route
    await page.click("#kta-guid-bandeau .kta-guid-corps");
    await page.waitForTimeout(400);
    const g3 = await page.evaluate(function () {
      const m = document.getElementById("kta-guid-feuille");
      return m ? m.querySelectorAll(".kta-guid-feuille-ligne").length : -1;
    });
    if (g3 < 1) pb("G3 : feuille de route absente ou vide");
    else ok("G3 : feuille de route — " + g3 + " ligne(s)");
    await shot("g3-feuille");
    await page.evaluate(function () { const m = document.getElementById("kta-guid-feuille"); if (m) m.remove(); });

    // G4 — avancer le long du trajet
    const g4 = await page.evaluate(async function () {
      const iti = window.getRoads().find(function (r) { return r.type === "itinerary"; });
      const g = window.ItiGuidage.construire(iti);
      const e = g.echelle, textes = [];
      for (let s = 0; s <= g.longueurPx * 0.6; s += 0.7 * e) {
        const p = window.ItiGuidage.pointA(g, s);
        window.__guidPos = { x: p.x, y: p.y };
        window.ItiGuidage.onPosition(window.__guidPos);
        const st = window.ItiGuidage.etat();
        if (textes[textes.length - 1] !== st.principal) textes.push(st.principal);
      }
      return { n: textes.length, premiers: textes.slice(0, 4), mode: window.ItiGuidage.etat().mode };
    });
    if (g4.n < 2) pb("G4 : le bandeau ne change pas quand on avance");
    else ok("G4 : " + g4.n + " textes successifs — " + g4.premiers.join(" | "));
    if (g4.mode !== "guide") pb("G4 : fausse alerte en suivant le trajet (" + g4.mode + ")");
    await shot("g4-en-route");

    // G5 — écart
    const g5 = await page.evaluate(function () {
      const e = Number(window.APP_CONFIG.scale) || 1;
      const p0 = window.__guidPos;
      for (let i = 1; i <= 8; i++) {
        window.__guidPos = { x: p0.x + 40 * e + i, y: p0.y + 40 * e };
        window.ItiGuidage.onPosition(window.__guidPos);
      }
      const el = document.getElementById("kta-guid-bandeau");
      return { mode: window.ItiGuidage.etat().mode,
               btns: el.querySelectorAll(".kta-guid-btn").length };
    });
    if (g5.mode !== "ecart" || g5.btns !== 3) pb("G5 : écart non signalé (mode " + g5.mode + ", " + g5.btns + " bouton(s))");
    else ok("G5 : « Hors itinéraire ? » + 3 boutons");
    await shot("g5-ecart");

    // G6 — écran XL
    await page.evaluate(function () { window.EmergencyMode.activer(); });
    await page.waitForTimeout(700);
    const g6 = await page.evaluate(function () {
      const b = document.getElementById("kta-em-guidage");
      return b && b.style.display !== "none" ? document.getElementById("kta-em-guid-principal").textContent : null;
    });
    if (!g6) pb("G6 : la consigne n'est pas reprise sur l'écran XL");
    else ok("G6 : écran XL — « " + g6 + " »");
    await shot("g6-xl");
    await page.evaluate(function () { window.EmergencyMode.desactiver(); });
    await page.waitForTimeout(300);

    // G8 — urgence : pas de croix
    const g8 = await page.evaluate(function () {
      const iti = window.getRoads().find(function (r) { return r.type === "itinerary"; });
      iti.urgence = true;
      window.ItiGuidage.rafraichir();
      const f = document.querySelector("#kta-guid-bandeau .kta-guid-fermer");
      const cache = f.style.display === "none";
      delete iti.urgence;
      window.ItiGuidage.rafraichir();
      return cache;
    });
    if (!g8) pb("G8 : la croix reste en urgence");
    else ok("G8 : itinéraire d'urgence → pas de croix");

    // G9 — suivi arrêté
    await page.evaluate(function () { window.stopTracking(); window.ItiGuidage.rafraichir(); });
    const g9 = await page.evaluate(function () {
      const el = document.getElementById("kta-guid-bandeau");
      return !el || el.style.display === "none";
    });
    if (!g9) pb("G9 : bandeau encore visible suivi arrêté");
    else ok("G9 : suivi arrêté → bandeau masqué");
  } catch (e) {
    if (String(e && e.message) !== "stop") pb("exception : " + (e && e.stack || e));
  } finally {
    await nav.close();
    console.log(problemes.length ? "\n⚠️ " + problemes.length + " problème(s)" : "\n🎉 CHECKUP GUIDAGE VERT");
    process.exit(problemes.length ? 1 : 0);
  }
})();
