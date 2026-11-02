#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-fiche-titre.js — checkup (Playwright) : titre et pastille de la fiche d'un objet suivent la légende
// =====================================================================
// Parcours sur le relevé fictif (sinon le premier plan de l'index) : un tracé « principal » de session, une zone « eau », un pilier « pilier-1 ».
// Le type est renommé et recoloré dans la légende APRÈS le dessin (setSessionLabel ne redessine pas la carte) :
// la fiche ouverte ensuite doit porter le nouveau nom et une pastille de la nouvelle couleur, jamais l'ancien
// libellé ni l'émoji vert codé en dur. Même contrôle pour un tracé d'un calque de données (fiche en lecture seule).
// Usage : node scripts/smoke/checkup-fiche-titre.js (SMOKE_PORT pour une autre copie) · code : utils.js >
// attacherNotePopup (titre relu à l'ouverture, opts.pastille)
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

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () {
      return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
        window.PlanRegistry.getAll().length > 0;
    }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.evaluate(function () {
      // Relevé fictif s'il est dans l'index, sinon le premier plan (comme smoke.js).
      const tous = window.PlanRegistry.getAll();
      const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
      window.__pret = false;
      Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
    });
    await attendre(page, function () { return window.__pret && !!window.map && !!window.PLAN_CONFIG; }, 40000);
    await page.waitForTimeout(1500);

    // Objets de session dessinés AVANT le renommage.
    await page.evaluate(function () {
      // Au centre de la vue : un objet hors vue n'a pas de calque cliquable (road.js > _isInViewport).
      const c = window.map.getCenter();
      const x = Math.round(c.lng) - 150, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 100;
      window.setRoads((window.getRoads() || []).concat([{ type: "principal", points: [{ x: x, y: y }, { x: x + 300, y: y }] }]));
      window.setZones((window.getZones() || []).concat([{ type: "eau", points: [{ x: x, y: y + 100 }, { x: x + 80, y: y + 100 },
        { x: x + 80, y: y + 180 }, { x: x, y: y + 180 }] }]));
      window.setStructures((window.getStructures() || []).concat([{ type: "pilier-1", points: [{ x: x + 200, y: y + 100 },
        { x: x + 260, y: y + 100 }, { x: x + 260, y: y + 160 }, { x: x + 200, y: y + 160 }] }]));
      const LC = window.LegendCustomization;
      LC.setSessionLabel("traces", "principal", "Réseau A");
      LC.setSessionLabel("zones", "eau", "Bassin B");
      LC.setSessionLabel("structures", "pilier-1", "Massif C");
    });

    // Ouvre chaque fiche de la carte (le contenu se construit à l'ouverture) et rend le titre qui contient `attendu`.
    async function fiche(attendu) {
      return page.evaluate(function (attendu) {
        const couches = [];
        window.map.eachLayer(function (l) { if (l.getPopup && l.getPopup()) couches.push(l); });
        for (const l of couches) {
          l.openPopup();
          const el = l.getPopup().getElement();   // pas document : une fiche fermée reste dans le DOM le temps du fondu
          const b = el && el.querySelector(".leaflet-popup-content b");
          const titre = b ? b.textContent.trim() : "";
          const res = { titre: titre, pastille: !!(b && b.querySelector("span, i, svg")), html: b ? b.innerHTML.slice(0, 200) : "" };
          l.closePopup();
          if (titre.indexOf(attendu) >= 0) return res;
        }
        return null;
      }, attendu);
    }

    const tr = await fiche("Réseau A");
    verifier(!!tr && tr.titre === "Réseau A", "tracé de session : titre = nom renommé après le dessin", tr);
    verifier(!!tr && tr.pastille && tr.titre.indexOf("🟩") < 0, "tracé de session : pastille de couleur, plus d'émoji vert", tr);
    const zo = await fiche("Bassin B");
    verifier(!!zo && zo.titre === "Bassin B" && zo.pastille, "zone de session : nom renommé et pastille", zo);
    const st = await fiche("Massif C");
    verifier(!!st && st.titre === "Massif C" && st.pastille, "pilier de session : nom renommé et pastille", st);

    // La pastille suit la COULEUR choisie.
    const couleur = await page.evaluate(function () {
      window.LegendCustomization.setColor("traces", "principal", "#123456");
      return typeof window.ktaTypeSwatchHtml === "function" ? window.ktaTypeSwatchHtml("traces", "principal") : "";
    });
    const tr2 = await fiche("Réseau A");
    verifier(/123456|18,\s*52,\s*86/i.test(couleur) && !!tr2 && tr2.html.indexOf(couleur) >= 0,
      "tracé de session : pastille de la couleur choisie (#123456)", { couleur: couleur, html: tr2 && tr2.html });
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — la fiche d'un objet suit le nom et la couleur de la légende.");
  process.exit(0);
})();
