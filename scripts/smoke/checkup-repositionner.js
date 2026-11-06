#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-repositionner.js — checkup (Playwright, pas un hook pré-commit) : « Repositionner » un POI de session
// =====================================================================
// Parcours réel À LA SOURIS : clic sur le marqueur, clic sur « Repositionner » dans sa fiche, puis clic ailleurs
// sur la carte ; Échap et ✕ annulent sans rien écrire. 🩸 Le bouton arme le mode pendant la capture de SON clic
// (écouteur sur document, avant #map) : map.js > _ktaPickCaptureClick prenait ce même clic pour la position choisie
// (le POI sautait sous le bouton).
// check-repositionner.js teste la fonction dans un `vm` ; seul ce parcours voit l'ordre réel des écouteurs.
// Usage : node scripts/smoke/checkup-repositionner.js (KTA_MOTEURS=webkit : sous WebKit)
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
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.setEditorPoints; }, 20000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

function point(page) {
  return page.evaluate(function () {
    const p = (window.getEditorPoints() || []).find(function (o) { return o.uid === "pt_repotest"; });
    return p ? { x: p.x, y: p.y } : null;
  });
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
    // Un POI de session au centre de la vue, au niveau affiché.
    const p0 = await page.evaluate(function () {
      const c = window.map.getCenter();
      const x = Math.round(c.lng), y = Math.round(window.APP_CONFIG.imageHeight - c.lat);
      const niv = window.APP_CONFIG.multiLevel ? (window.APP_CONFIG.activeLevel || 0) : undefined;
      const pt = { id: "PoiRepo", nom: "PoiRepo", uid: "pt_repotest", x: x, y: y, tags: ["salle"],
        etat: "Non inspectée", description: "", source: "editor" };
      if (niv !== undefined) pt.level = niv;
      window.setEditorPoints([pt]);
      return { x: x, y: y };
    });
    await page.waitForTimeout(500);

    // 1. Fiche du POI de test ouverte par son marqueur (un point du plan peut se trouver au même endroit et
    //    prendre un clic souris) ; les deux clics qui comptent, eux, sont de vrais clics souris.
    const ouverte = await page.evaluate(function () {
      window.map.closePopup();
      let fait = false;
      window.layerEditor.getLayers().forEach(function (l) { if (!fait && l.openPopup) { l.openPopup(); fait = true; } });
      return fait;
    });
    if (!ouverte) throw new Error("marqueur du POI introuvable");
    await page.waitForTimeout(600);
    const btn = await page.$(".leaflet-popup [data-kta-act=\"repositionner\"]");
    verifier(!!btn, "fiche ouverte, bouton « Repositionner » présent");
    if (!btn) throw new Error("pas de bouton Repositionner");

    // 2. Clic souris sur « Repositionner » : le mode s'arme, le POI NE BOUGE PAS
    const bb = await btn.boundingBox();
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(600);
    const p1 = await point(page);
    const arme = await page.evaluate(function () { return !!document.getElementById("kta-repo-floater"); });
    verifier(arme, "mode repositionnement armé (bandeau affiché)");
    verifier(p1 && p1.x === p0.x && p1.y === p0.y, "🩸 le clic sur le bouton n'a PAS déplacé le POI", { p0: p0, p1: p1 });

    // 3. Clic souris ailleurs sur la carte : le POI y va, le mode tombe
    const cible = await page.evaluate(function () {
      const r = document.getElementById("map").getBoundingClientRect();
      const px = r.left + r.width * 0.25, py = r.top + r.height * 0.7;
      const ll = window.map.containerPointToLatLng([px - r.left, py - r.top]);
      return { px: px, py: py, x: ll.lng, y: window.APP_CONFIG.imageHeight - ll.lat };
    });
    await page.mouse.click(cible.px, cible.py);
    await page.waitForTimeout(600);
    const p2 = await point(page);
    const encore = await page.evaluate(function () { return !!document.getElementById("kta-repo-floater"); });
    verifier(p2 && Math.abs(p2.x - cible.x) < 2 && Math.abs(p2.y - cible.y) < 2,
      "clic sur la carte : le POI est posé à cet endroit", { cible: cible, p2: p2 });
    verifier(!encore, "mode repositionnement terminé après le clic");

    // 3 bis. 🩸 Les marqueurs remplacés quittent le GROUPE layerEditor (calque « Ajout »), pas seulement la carte :
    //    masquer puis réafficher ce calque ne fait revenir aucun ancien marqueur à l'ancienne place.
    const groupe = await page.evaluate(function () {
      const L0 = window.L, G = window.layerEditor, n = window.getEditorPoints().length;
      const marqueurs = function () {
        return G.getLayers().filter(function (l) { return l instanceof L0.Marker; }).length;
      };
      const dansGroupe = marqueurs();
      window.map.removeLayer(G);
      window.map.addLayer(G);
      let surCarte = 0;
      window.map.eachLayer(function (l) { if (l instanceof L0.Marker && G.hasLayer(l)) surCarte++; });
      return { points: n, dansGroupe: dansGroupe, surCarte: surCarte };
    });
    verifier(groupe.dansGroupe === groupe.points && groupe.surCarte === groupe.points,
      "après Repositionner : un seul marqueur par POI dans le calque, même masqué puis réaffiché", groupe);
    // 🩸 iOS : pas de menu de l'image (Partager, Enregistrer…) sur un appui long d'icône. -webkit-touch-callout
    //    n'existe que sur iOS (ni Chromium ni le WebKit de bureau ne le calculent) : on lit la règle servie.
    const callout = await page.evaluate(async function () {
      const css = await (await fetch("css/style.css", { cache: "no-store" })).text();
      const m = css.match(/\.leaflet-marker-icon,\s*\.leaflet-marker-icon img,[^{]*\{[^}]*-webkit-touch-callout:\s*none/);
      return { regle: !!m };
    });
    verifier(callout.regle, "icône de POI : -webkit-touch-callout: none servi (pas de menu de l'image à l'appui long iOS)",
      callout);

    // 4. Échap puis ✕ annulent sans rien écrire : bandeau retiré, le clic suivant sur la carte ne déplace rien.
    //    🩸 Le bandeau `.kta-iti-floater` fait reculer shortcuts.js > _echapCarte : l'Échap est celui d'editor.js.
    const annuler = async function (geste) {
      await page.evaluate(function () {
        window.map.closePopup();
        // Après le déplacement, le groupe garde un marqueur hors carte : on prend celui qui est affiché.
        const l = window.layerEditor.getLayers().find(function (q) { return q._map && q.getPopup && q.getPopup(); });
        if (l) l.openPopup();
      });
      await page.waitForTimeout(600);
      const b = await page.$(".leaflet-popup [data-kta-act=\"repositionner\"]");
      if (!b) return { bouton: false };
      const r = await b.boundingBox();
      await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      await page.waitForTimeout(400);
      const avant = await point(page);
      const arme2 = await page.evaluate(function () { return !!document.getElementById("kta-repo-floater"); });
      if (geste === "echap") await page.keyboard.press("Escape");
      else await page.click("#kta-repo-cancel");
      await page.waitForTimeout(300);
      const bandeau = await page.evaluate(function () { return !!document.getElementById("kta-repo-floater"); });
      await page.mouse.click(cible.px + 60, cible.py - 60);
      await page.waitForTimeout(500);
      const apres = await point(page);
      return { arme: arme2, bandeau: bandeau, avant: avant, apres: apres };
    };
    let a = await annuler("echap");
    verifier(a.arme && !a.bandeau && a.apres && a.apres.x === a.avant.x && a.apres.y === a.avant.y,
      "Échap annule Repositionner : bandeau retiré, le clic suivant ne déplace pas le POI", a);
    a = await annuler("croix");
    verifier(a.arme && !a.bandeau && a.apres && a.apres.x === a.avant.x && a.apres.y === a.avant.y,
      "✕ Annuler : même effet", a);
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
  console.log("🎉 CHECKUP VERT — « Repositionner » attend le clic sur la carte, puis y pose le POI ; Échap et ✕ " +
    "l'annulent.");
  process.exit(0);
})();
