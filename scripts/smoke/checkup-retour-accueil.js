#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-retour-accueil.js — checkup (Playwright) : fermer un plan le vide, « Reprendre » le retrouve
// =====================================================================
// Parcours : le relevé fictif est ouvert, on y dessine (point, tracé) et on lance le suivi ; retour à l'accueil
// par le bouton 🏠 de l'en-tête (fenêtre « Changer de plan ») → carte démontée (window.map, PLAN_CONFIG, canvas de
// collision, tuiles), session enregistrée, suivi coupé, extension prévenue une fois (mktm:plan-ferme « accueil »),
// aucune erreur pendant l'attente à l'accueil (minuteries, pas compté). « Reprendre » recharge le plan avec les
// objets dessinés. Puis RA_N allers-retours (10) : ni le tas JS, ni les nœuds, ni les écouteurs ne grimpent ; la barre
// d'état d'un plan rouvert suit encore sa hauteur.
// Mesures (CDP Performance.getMetrics après ramasse-miettes) imprimées : tas JS, nœuds, images de la carte.
// RA_ZIP=<chemin d'un ZIP de plan> : mesure ce plan-là au lieu du relevé fictif (rien de lui n'est imprimé hors
// chiffres) ; RA_MESURE_SEULE=1 : imprime les mesures sans juger (comparaison avec une version antérieure) ;
// RA_PROCESSUS=1 (Windows) : ajoute la mémoire privée des processus du navigateur de test (images décodées,
// canvas : hors tas JS).
// Usage : node scripts/smoke/checkup-retour-accueil.js (SMOKE_PORT pour une autre copie)
// Doc : docs/architecture/plans-loader.md (fermer un plan), perf-memory.md
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const ZIP = process.env.RA_ZIP ? path.resolve(process.env.RA_ZIP) : null;
const MESURE_SEULE = process.env.RA_MESURE_SEULE === "1";
const PROCESSUS = process.env.RA_PROCESSUS === "1" && process.platform === "win32";
const ALLERS_RETOURS = Math.max(3, parseInt(process.env.RA_N, 10) || 10);

// Mémoire privée (Mo) des processus Edge / Chromium lancés par Playwright ; null si illisible.
function memoireProcessus() {
  try {
    const cmd = "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe' " +
      "-or $_.Name -eq 'chrome-headless-shell.exe') -and $_.CommandLine -match 'playwright' } | " +
      "Measure-Object -Property PrivatePageCount -Sum | ForEach-Object { $_.Sum }";
    const out = require("child_process").execFileSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8" });
    const n = parseFloat(String(out).trim());
    return Number.isFinite(n) ? Math.round(n / 1048576) : null;
  } catch (e) { return null; }
}
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) {
  if (MESURE_SEULE) { console.log("  · " + msg + " : " + (c ? "oui" : "non")); return; }
  if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : ""));
}

(async function main() {
  if (ZIP && !fs.existsSync(ZIP)) { console.log("❌ RA_ZIP introuvable"); process.exit(1); }
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) {
    erreurs.push(String(e && e.message) + " | " + String((e && e.stack) || "").split("\n").slice(1, 4).join(" < "));
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");

  async function mesurer(etiquette) {
    for (let i = 0; i < 3; i++) { await cdp.send("HeapProfiler.collectGarbage"); await page.waitForTimeout(300); }
    const m = (await cdp.send("Performance.getMetrics")).metrics;
    const v = function (n) { const x = m.find(function (e) { return e.name === n; }); return x ? x.value : null; };
    const dom = await page.evaluate(function () {
      const c = window.collisionCanvas;
      return {
        carte: !!(window.L && window.map instanceof window.L.Map),
        noeudsDocument: document.getElementsByTagName("*").length,
        imagesCarte: document.querySelectorAll("#map img").length,
        canvasCarte: document.querySelectorAll("#map canvas").length,
        marqueurs: document.querySelectorAll("#map .leaflet-marker-icon").length,
        collisionMo: c && c.width ? Math.round(c.width * c.height * 4 / 1048576) : 0
      };
    });
    const r = Object.assign({ tasMo: Math.round(v("JSHeapUsedSize") / 104857.6) / 10, noeuds: v("Nodes"),
      ecouteurs: v("JSEventListeners") }, dom);
    if (PROCESSUS) { await page.waitForTimeout(1500); r.processusMo = memoireProcessus(); }
    console.log("  📏 " + etiquette + " : " + JSON.stringify(r));
    return r;
  }

  async function planPret() {
    await attendre(page, function () {
      return !!(window.L && window.map instanceof window.L.Map) && typeof window.ktaPlanAffiche === "function" &&
        window.ktaPlanAffiche() && !!window._currentLoadedPlanId;
    }, ZIP ? 300000 : 30000);
    await page.waitForTimeout(ZIP ? 4000 : 2000);   // tuiles du premier écran, session restaurée
    // « Continuer » comme un utilisateur : retirer la modale à la main sauterait son nettoyage (écouteur Échap).
    await page.evaluate(function () {
      const b = document.querySelector('#kta-session-modal [data-action="keep"]');
      if (b) b.click();
    });
  }

  async function ouvrir() {
    if (ZIP) {
      await page.evaluate(function () {
        let i = document.getElementById("ra-zip");
        if (!i) { i = document.createElement("input"); i.type = "file"; i.id = "ra-zip"; i.style.display = "none"; document.body.appendChild(i); }
      });
      await page.setInputFiles("#ra-zip", ZIP);
      await page.evaluate(function () {
        const f = document.getElementById("ra-zip").files[0];
        window.chargerZipFichier(f, "auto", { storeBlob: true }).catch(function (e) { window.__raErreur = String(e); });
      });
    } else {
      await page.evaluate(function () {
        const p = window.PlanRegistry.getAll().find(function (x) { return /fictif/i.test(x.name || ""); });
        window.chargerPlanDuRegistre(p.id);
      });
    }
    await planPret();
  }

  async function retourAccueil() {
    await page.evaluate(function () { document.getElementById("kta-refonte-home").click(); });
    await page.waitForTimeout(300);
    await page.evaluate(function () { const b = document.getElementById("popupChargerPlan"); if (b) b.click(); });
    await attendre(page, function () { return document.body.classList.contains("kta-loader-active"); }, 10000);
    await page.waitForTimeout(800);
  }

  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () {
      return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
        window.PlanRegistry.getAll().some(function (p) { return /fictif/i.test(p.name || ""); });
    }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    const m0 = await mesurer("accueil au démarrage");

    // ── 1. Plan ouvert, dessin, suivi lancé ──
    await ouvrir();
    const uids = await page.evaluate(function () {
      const h = window.APP_CONFIG.imageHeight || 1000, w = window.APP_CONFIG.imageWidth || 1000;
      const pt = { uid: window.KtaUid.genUid("pt"), id: "Repère du checkup", name: "Repère du checkup",
        x: Math.round(w / 2), y: Math.round(h / 2), updatedAt: Date.now() };
      window.setEditorPoints(window.getEditorPoints().concat([pt]));
      const rd = { uid: window.KtaUid.genUid("rd"), type: "galerie", name: "Tracé du checkup", updatedAt: Date.now(),
        points: [{ x: Math.round(w / 3), y: Math.round(h / 3) }, { x: Math.round(w / 2), y: Math.round(h / 3) }] };
      window.setRoads(window.getRoads().concat([rd]));
      if (typeof window.startTracking === "function") window.startTracking();
      window.__raFermes = [];
      window.addEventListener("mktm:plan-ferme", function (e) { window.__raFermes.push(e.detail && e.detail.vers); });
      return { pt: pt.uid, rd: rd.uid, planId: window._currentLoadedPlanId, suivi: window.getTrackingActif() };
    });
    verifier(uids.suivi === true, "suivi lancé sur le plan ouvert");
    const m1 = await mesurer("plan ouvert");

    // ── 2. Retour à l'accueil par 🏠 (fenêtre « Changer de plan ») ──
    await retourAccueil();
    const apres = await page.evaluate(function (u) {
      const s = window.SessionPersist.getSaved(u.planId);
      const p = s && (s.payload || s);
      const a = function (k) { return (p && Array.isArray(p[k])) ? p[k] : []; };
      return {
        carte: window.map === null,
        planConfig: window.PLAN_CONFIG === null,
        divVide: document.getElementById("map").children.length === 0,
        collision: !window.collisionCanvas,
        suivi: window.getTrackingActif(),
        affiche: window.ktaPlanAffiche(),
        pt: a("editorPoints").some(function (o) { return o.uid === u.pt; }),
        rd: a("roads").some(function (o) { return o.uid === u.rd; }),
        fermes: window.__raFermes.slice(),
        reprendre: (document.getElementById("resumeBox") || {}).dataset ? document.getElementById("resumeBox").dataset.planId : null
      };
    }, uids);
    verifier(apres.carte && apres.planConfig && apres.divVide && apres.collision && !apres.affiche,
      "accueil : carte démontée (window.map, PLAN_CONFIG, conteneur vide, canvas de collision)", apres);
    verifier(apres.pt && apres.rd, "session enregistrée avec le point et le tracé dessinés", apres);
    verifier(apres.suivi === false, "suivi coupé à la fermeture");
    verifier(apres.fermes.length === 1 && apres.fermes[0] === "accueil", "extension prévenue une fois : mktm:plan-ferme « accueil »", apres.fermes);
    verifier(apres.reprendre === uids.planId, "« Reprendre » propose le plan fermé");
    const m2 = await mesurer("accueil après fermeture");
    verifier(m2.imagesCarte === 0 && m2.canvasCarte === 0 && m2.marqueurs === 0, "aucune tuile, aucun canvas ni marqueur de carte à l'accueil", m2);

    // Un pas détecté et les minuteries de l'app à l'accueil : rien ne doit toucher la carte détruite.
    await page.evaluate(function () {
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new DeviceMotionEvent("devicemotion", { accelerationIncludingGravity: { x: 30, y: 30, z: 30 } }));
      }
    });
    await page.waitForTimeout(12000);
    verifier(erreurs.length === 0, "aucune erreur de page à l'accueil (pas compté, minuteries, 12 s)", erreurs);

    // ── 3. « Reprendre » : le plan revient avec ce qui a été dessiné ──
    await page.evaluate(function () { document.getElementById("resumeBtn").click(); });
    await planPret();
    const repris = await page.evaluate(function (u) {
      return {
        planId: window._currentLoadedPlanId,
        pt: window.getEditorPoints().some(function (o) { return o.uid === u.pt; }),
        rd: window.getRoads().some(function (o) { return o.uid === u.rd; }),
        tuiles: document.querySelectorAll("#map img").length
      };
    }, uids);
    verifier(repris.planId === uids.planId && repris.pt && repris.rd && repris.tuiles > 0,
      "« Reprendre » : plan rechargé, point et tracé retrouvés, carte peinte", repris);

    // ── 4. Fermeture pour le Générateur : même chemin ; à l'accueil, rien à fermer ──
    const gen = await page.evaluate(function () {
      const a = window.ktaFermerPlanPourMemoire();
      const b = window.ktaFermerPlanPourMemoire();
      return { a: a.ferme, b: b.ferme, carte: window.map === null };
    });
    verifier(gen.a === true && gen.b === false && gen.carte, "ktaFermerPlanPourMemoire : ferme le plan ouvert, ne touche à rien à l'accueil", gen);

    // ── 5. Allers-retours : la mémoire JS à l'accueil ne grimpe pas ──
    // 🩸 Nœuds et écouteurs comptés APRÈS ramasse-miettes : un écouteur de window posé à chaque ouverture et jamais
    // retiré garde l'ancien header détaché (~56 nœuds et ~12 écouteurs par ouverture avant correction). Le premier
    // aller-retour amorce des choses posées une fois pour la page : la dérive se lit à partir du deuxième.
    const tas = [], suivis = [];
    for (let i = 0; i < ALLERS_RETOURS; i++) {
      await page.evaluate(function () { document.getElementById("resumeBtn").click(); });
      await planPret();
      await retourAccueil();
      const m = await mesurer("accueil, aller-retour " + (i + 1));
      tas.push(m.tasMo);
      suivis.push(m);
    }
    const derive = Math.round((tas[tas.length - 1] - tas[0]) * 10) / 10;
    verifier(derive < 3, ALLERS_RETOURS + " allers-retours : le tas JS à l'accueil dérive de moins de 3 Mo (" +
      derive + " Mo)", tas);
    const dN = suivis[suivis.length - 1].noeuds - suivis[1].noeuds;
    const dE = suivis[suivis.length - 1].ecouteurs - suivis[1].ecouteurs;
    verifier(dN <= 10 && dE <= 2, "allers-retours 2 → " + ALLERS_RETOURS + " : nœuds " + (dN >= 0 ? "+" : "") + dN +
      ", écouteurs " + (dE >= 0 ? "+" : "") + dE + " (dérive nulle attendue, bruit toléré : 10 nœuds, 2 écouteurs)",
      suivis.map(function (m) { return [m.noeuds, m.ecouteurs]; }));

    // La barre d'état d'un plan rouvert suit encore sa hauteur réelle (l'observateur de la précédente ne la bloque
    // plus).
    await page.evaluate(function () { document.getElementById("resumeBtn").click(); });
    await planPret();
    const barre = await page.evaluate(async function () {
      const lire = function () {
        return getComputedStyle(document.documentElement).getPropertyValue("--kta-statusbar-h").trim();
      };
      const el = document.getElementById("kta-refonte-statusbar");
      if (!el) return { absente: true };
      const avant = lire();
      el.style.minHeight = (el.offsetHeight + 40) + "px";
      await new Promise(function (r) { setTimeout(r, 300); });
      const apres = lire();
      el.style.minHeight = "";
      return { avant: avant, apres: apres };
    });
    verifier(!barre.absente && barre.avant !== barre.apres,
      "plan rouvert : --kta-statusbar-h suit la hauteur de la barre d'état", barre);
    await retourAccueil();
    verifier(erreurs.length === 0, "aucune erreur de page sur tout le parcours", erreurs);

    console.log("\n  Bilan : plan ouvert " + m1.tasMo + " Mo · accueil après fermeture " + m2.tasMo + " Mo · accueil au démarrage " +
      m0.tasMo + " Mo (tas JS) ; nœuds " + m1.noeuds + " → " + m2.noeuds + " ; canvas de collision " + m1.collisionMo +
      " Mo → " + m2.collisionMo + " Mo");
  } catch (e) {
    pb("exception : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  if (problemes.length) { console.log("\n❌ CHECKUP ROUGE — " + problemes.length + " problème(s)"); process.exit(1); }
  console.log(MESURE_SEULE ? "\nMesures relevées (sans jugement)." :
    "\n🎉 CHECKUP VERT — fermer un plan le vide, « Reprendre » le retrouve, sans erreur ni fuite.");
})();
