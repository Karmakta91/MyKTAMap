#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-rotation-memoire.js — checkup de RELEASE (Playwright, pas un hook pré-commit)
// =====================================================================
// Mémoire de la carte 2D tournée (js/mapBearing.js, js/perfUltra.js), téléphone 393 × 852 à 3×, sous chaque moteur
// de KTA_MOTEURS (Chromium, WebKit = Safari) :
// M1 plan normal : canvas élargi à la couverture complète, aucun levier forcé · M2 plan rendu lourd (POI et
// structures fabriqués en mémoire) : à plat rien ne change · M3 tourné : canvas sous le budget en pixels réels,
// viewportCull / decim / noIntersect forcés sans être enregistrés ni montrés, noTooltips jamais, POI hors écran
// retirés et POI de l'écran présents · M4 zooms tournés : budget tenu · M5 POI touché sous rotation → sa fiche ·
// M6 retour au nord : leviers rendus, tous les POI revenus, padding d'origine · M7 choix explicite de
// l'utilisateur : aucun levier ajouté, plafond du canvas tenu · M8 case « Alléger la carte tournée » : présente et
// cochée dans les Réglages, décochée → aucun levier forcé (plafond tenu), décochée carte tournée → leviers rendus.
// Rien n'est écrit dans data/ : le plan lourd est fabriqué dans la page.
// Usage : node scripts/smoke/checkup-rotation-memoire.js · doc : docs/architecture/perf-memory.md §21
// =====================================================================
"use strict";

const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const PLAN = "Relevé fictif de test";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
// Budget du canvas d'un plan lourd (mapBearing.js > BUDGET_CANVAS_LOURD) ; 1 % de marge pour l'arrondi de Leaflet.
const BUDGET_LOURD = 6000000 * 1.01;
const NB_POI = 3000, NB_STRUCTURES = 10000;

const problemes = [];
let moteurCourant = "";
function pb(msg) { problemes.push("[" + moteurCourant + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg)  { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) {
  if (cond) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}

async function suite(nav, nom) {
  const ctx = await nav.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3,
                                     hasTouch: true, isMobile: nom === "chromium" });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(e.message); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.getByText(PLAN, { exact: false }).first().click();
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.MapBearing; }, 30000);
    await page.waitForTimeout(2500);

    // Mesures posées dans la page.
    await page.evaluate(function () {
      const attente = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      window.__rmm = {
        attente: attente,
        etat: function () {
          const r = window.map._renderer, c = r && r._container;
          const P = window.PerfUltra;
          const faux = window.__rmmPoi || [];
          const z = window.MapBearing.zoneVisible(0);
          let surCarte = 0, dansZone = 0, dansZoneAbsents = 0;
          faux.forEach(function (m) {
            if (m._map) surCarte++;
            if (z.contains(m.getLatLng())) { dansZone++; if (!m._map) dansZoneAbsents++; }
          });
          const pid = window._currentLoadedPlanId;
          return {
            b: Math.round(window.MapBearing.getBearing()), pad: r.options.padding,
            px: c ? c.width * c.height : 0, taille: c ? c.width + "x" + c.height : "",
            // Sans l'API (code d'avant), le poids est recompté ici : le checkup mesure au lieu de planter.
            poids: P.poidsPlan ? P.poidsPlan() : ["_ktaDataMarkers", "_ktaDataPolylines", "_ktaDataPolygons",
              "_ktaDataStructurePolygons"].reduce(function (n, k) { return n + (window[k] || []).length; }, 0),
            lourd: P.planLourd ? P.planLourd() : null,
            forces: { viewportCull: P.get("viewportCull"), decim: P.get("decim"),
                      noIntersect: P.get("noIntersect"), noTooltips: P.get("noTooltips") },
            choix: P.getAll(), slot: localStorage.getItem("myktamap_perf_toggles_v2_" + pid),
            poi: { total: faux.length, surCarte: surCarte, dansZone: dansZone, dansZoneAbsents: dansZoneAbsents }
          };
        },
        tourner: async function (deg) { window.MapBearing.setManuel(deg); await attente(600); },
        nord: async function () { window.MapBearing.remettreNord(); await attente(900); }
      };
    });
    const etat = function () { return page.evaluate(function () { return window.__rmm.etat(); }); };

    // ── M1 — plan normal ──
    console.log("— M1 : plan normal tourné —");
    const m1a = await etat();
    await page.evaluate(function () { return window.__rmm.tourner(35); });
    const m1 = await etat();
    const requis = await page.evaluate(function () {
      const s = window.map.getSize();
      return Math.ceil((Math.hypot(s.x, s.y) / Math.min(s.x, s.y) - 1) / 2 * 100) / 100;
    });
    verifier(!m1.lourd, "plan fictif non lourd (" + m1.poids + " objets)", m1.poids);
    verifier(m1.pad === Math.max(0.5, requis) && m1.px > m1a.px,
      "canvas élargi à la couverture complète (" + m1a.taille + " → " + m1.taille + ", padding " + m1.pad + ")", m1);
    verifier(!m1.forces.viewportCull && !m1.forces.decim && !m1.forces.noIntersect, "aucun levier forcé", m1.forces);
    await page.evaluate(function () { return window.__rmm.nord(); });

    // ── M2 — plan rendu lourd ──
    console.log("— M2 : plan lourd (" + NB_POI + " POI, " + NB_STRUCTURES + " structures fabriqués) —");
    await page.evaluate(function (n) {
      const map = window.map, H = window.PLAN_CONFIG.plan.imageHeight, W = window.PLAN_CONFIG.plan.imageWidth;
      const g = L.layerGroup().addTo(map), gs = L.layerGroup().addTo(map);
      const icone = L.divIcon({ className: "kta-rmm-poi", iconSize: [24, 24] });
      window.__rmmPoi = [];
      let graine = 7;
      const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
      for (let i = 0; i < n.poi; i++) {
        const m = L.marker([H * alea(), W * alea()], { icon: icone }).bindPopup("<b>POI lourd " + i + "</b>");
        m._ktaNom = "POI lourd " + i; m._ktaLayer = g;
        m.addTo(g);
        window._ktaDataMarkers.push(m);
        window.__rmmPoi.push(m);
      }
      for (let j = 0; j < n.st; j++) {
        const x = W * alea(), y = H * alea(), d = 6 + 20 * alea();
        const pts = [{ x: x, y: y }, { x: x + d, y: y }, { x: x + d, y: y + d }, { x: x, y: y + d }];
        const poly = L.polygon(pts.map(function (p) { return window.convertCoord(p.x, p.y); }),
          { renderer: map._renderer, color: "#888", weight: 1, fillOpacity: 0.6, interactive: false }).addTo(gs);
        window._ktaDataStructurePolygons.push({ polygon: poly, layerId: null, type: "mur", points: pts, level: 0,
          origOpacity: 1, origFillOpacity: 0.6 });
      }
    }, { poi: NB_POI, st: NB_STRUCTURES });
    await page.waitForTimeout(1500);
    const m2 = await etat();
    verifier(m2.lourd, "plan lourd reconnu (" + m2.poids + " objets)", m2.poids);
    verifier(m2.pad === 0.5 && !m2.forces.viewportCull && m2.poi.surCarte === m2.poi.total,
      "à plat : padding 0,5, aucun levier forcé, " + m2.poi.surCarte + "/" + m2.poi.total + " POI sur la carte", m2);

    // ── M3 — tourné ──
    console.log("— M3 : plan lourd tourné —");
    await page.evaluate(function () { return window.__rmm.tourner(35); });
    await page.waitForTimeout(400);
    const m3 = await etat();
    inf(JSON.stringify({ taille: m3.taille, px: m3.px, pad: m3.pad, poi: m3.poi }));
    verifier(m3.px <= BUDGET_LOURD && m3.pad >= 0.5,
      "canvas sous le budget : " + m3.taille + " = " + (m3.px / 1e6).toFixed(2) + " M px réels (≤ 6 M)", m3.px);
    verifier(m3.forces.viewportCull && m3.forces.decim && m3.forces.noIntersect,
      "leviers forcés pendant la rotation (viewportCull, decim, noIntersect)", m3.forces);
    verifier(!m3.forces.noTooltips, "noTooltips jamais forcé : POI touchables", m3.forces);
    verifier(!m3.choix.viewportCull && !m3.choix.decim && !m3.choix.noIntersect && m3.slot === m2.slot,
      "réglages de l'utilisateur intacts (affichés et enregistrés)", { choix: m3.choix, slot: m3.slot });
    verifier(m3.poi.surCarte < m3.poi.total && m3.poi.dansZoneAbsents === 0 && m3.poi.dansZone > 0,
      "POI hors écran retirés (" + m3.poi.surCarte + "/" + m3.poi.total + " sur la carte), ceux de l'écran présents (" +
      m3.poi.dansZone + ")", m3.poi);

    // ── M4 — zooms tournés ──
    console.log("— M4 : zooms sous rotation —");
    const m4 = await page.evaluate(async function () {
      const z0 = window.map.getZoom(), out = [];
      for (const dz of [1, 2, 1, 0, -1, 0]) {
        window.map.setZoom(z0 + dz);
        await window.__rmm.attente(900);
        const e = window.__rmm.etat();
        out.push({ z: window.map.getZoom(), px: e.px, absents: e.poi.dansZoneAbsents, cull: e.forces.viewportCull });
      }
      return out;
    });
    verifier(m4.every(function (e) { return e.px <= BUDGET_LOURD && e.cull && e.absents === 0; }),
      "budget, leviers et POI de l'écran tenus à chaque zoom (" + m4.map(function (e) { return e.z; }).join(", ") + ")", m4);

    // ── M5 — POI touché sous rotation ──
    console.log("— M5 : POI touché sous rotation —");
    const cible = await page.evaluate(function () {
      const cr = window.map.getContainer().getBoundingClientRect();
      let best = null;
      (window.__rmmPoi || []).forEach(function (m) {
        if (best || !m._map) return;
        const el = m.getElement();
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (x < cr.left + 60 || x > cr.right - 60 || y < cr.top + 120 || y > cr.bottom - 120) return;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !el.contains(hit)) return;
        best = { x: x, y: y, nom: m._ktaNom };
      });
      return best;
    });
    if (!cible) pb("aucun POI fabriqué touchable à l'écran : M5 ne prouve rien");
    else {
      await page.mouse.click(cible.x, cible.y);
      await page.waitForTimeout(500);
      const texte = await page.evaluate(function () {
        const p = document.querySelector(".leaflet-popup");
        return p ? p.textContent : "";
      });
      verifier(texte.indexOf(cible.nom) >= 0, "toucher de « " + cible.nom + " » sous rotation → sa fiche", texte.slice(0, 60));
      await page.evaluate(function () { window.map.closePopup(); });
    }

    // ── M6 — retour au nord ──
    console.log("— M6 : retour au nord —");
    await page.evaluate(function () { return window.__rmm.nord(); });
    await page.waitForTimeout(400);
    const m6 = await etat();
    verifier(m6.b === 0 && m6.pad === 0.5, "vue droite, padding d'origine (" + m6.taille + ")", m6);
    verifier(!m6.forces.viewportCull && !m6.forces.decim && !m6.forces.noIntersect, "leviers rendus", m6.forces);
    verifier(m6.poi.surCarte === m6.poi.total, "tous les POI revenus (" + m6.poi.surCarte + "/" + m6.poi.total + ")", m6.poi);

    // ── M7 — choix explicite ──
    console.log("— M7 : choix explicite de l'utilisateur —");
    await page.evaluate(function () { window.PerfUltra.set("decim", true); });
    await page.evaluate(function () { return window.__rmm.tourner(35); });
    const m7 = await etat();
    verifier(m7.forces.decim && !m7.forces.viewportCull && !m7.forces.noIntersect,
      "réglage choisi gardé, aucun levier ajouté", m7.forces);
    verifier(m7.px <= BUDGET_LOURD, "plafond du canvas tenu (" + m7.taille + ")", m7.px);
    await page.evaluate(function () { return window.__rmm.nord(); });
    await page.evaluate(function () {
      window.PerfUltra.set("decim", false);
      try { localStorage.removeItem("myktamap_perf_toggles_v2_" + window._currentLoadedPlanId); } catch (e) {}
    });

    // ── M8 — case « Alléger la carte tournée » ──
    console.log("— M8 : case « Alléger la carte tournée » —");
    const caseUi = await page.evaluate(async function () {
      if (typeof window.afficherConfig !== "function") return { absente: true };
      window.afficherConfig();
      await window.__rmm.attente(400);
      const el = document.getElementById("cfg_perf_allegerRotation");
      const lbl = el && el.closest("label");
      const r = { presente: !!el, cochee: !!(el && el.checked), texte: lbl ? lbl.textContent.replace(/\s+/g, " ").trim() : "" };
      if (el) { el.click(); await window.__rmm.attente(200); r.apresClic = window.PerfUltra.get("allegerRotation"); }
      const fermer = document.getElementById("kta-cfg-close");
      if (fermer) fermer.click();
      return r;
    });
    verifier(caseUi.presente && caseUi.cochee && caseUi.texte.length > 10 && caseUi.texte.indexOf("config.") < 0,
      "case présente, cochée par défaut, libellé traduit (« " + (caseUi.texte || "").slice(0, 50) + " »)", caseUi);
    verifier(caseUi.apresClic === false, "décochée depuis les Réglages : enregistrée pour ce plan", caseUi);
    await page.evaluate(function () { return window.__rmm.tourner(35); });
    await page.waitForTimeout(300);
    const m8 = await etat();
    verifier(!m8.forces.viewportCull && !m8.forces.decim && !m8.forces.noIntersect && m8.poi.surCarte === m8.poi.total,
      "case décochée : aucun levier forcé, tous les POI posés", { forces: m8.forces, poi: m8.poi });
    verifier(m8.px <= BUDGET_LOURD, "plafond du canvas tenu sans la case (" + m8.taille + ")", m8.px);
    await page.evaluate(function () { return window.__rmm.nord(); });
    // Recochée, puis décochée pendant la rotation : les leviers se retirent sans attendre le nord.
    await page.evaluate(function () { window.PerfUltra.set("allegerRotation", true); });
    await page.evaluate(function () { return window.__rmm.tourner(35); });
    const m8b = await etat();
    await page.evaluate(function () { window.PerfUltra.set("allegerRotation", false); });
    await page.waitForTimeout(400);
    const m8c = await etat();
    verifier(m8b.forces.viewportCull && !m8c.forces.viewportCull && m8c.poi.surCarte === m8c.poi.total,
      "décochée carte tournée : leviers rendus aussitôt, POI revenus", { avant: m8b.forces, apres: m8c.forces, poi: m8c.poi });
    await page.evaluate(function () { return window.__rmm.nord(); });
    await page.evaluate(function () {
      window.PerfUltra.set("allegerRotation", true);
      try { localStorage.removeItem("myktamap_perf_toggles_v2_" + window._currentLoadedPlanId); } catch (e) {}
    });

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } finally {
    await ctx.close();
  }
}

(async function main() {
  const liste = lancerNavigateur.moteurs();
  try {
    for (const nom of liste) {
      moteurCourant = nom;
      console.log("\n══ Moteur : " + nom + " ══");
      const nav = await lancerNavigateur.lancerMoteur(nom);
      if (!nav) { pb("moteur absent : rien n'a été vérifié"); continue; }
      try { await suite(nav, nom); }
      catch (e) { pb("exception du harnais : " + (e && e.message)); }
      finally { await nav.close(); }
    }
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — carte tournée sur plan lourd : canvas plafonné, leviers forcés puis rendus, POI touchables.");
  process.exit(0);
})();
