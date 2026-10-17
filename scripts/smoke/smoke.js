#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// smoke.js — smoke navigateur (Playwright), le garde-fou qui CLIQUE : boote l'app dans un vrai Chromium,
// ouvre les écrans et ÉCHOUE sur toute erreur console, pageerror, warn « [I18n] Clé manquante » ou modale
// invisible — les erreurs runtime qu'aucun garde-fou statique ne voit.
// Usage : cd scripts/smoke && npm install && npm run smoke (premier install : Chromium ~130 Mo).
// Marche du RELEASE_GATE, lancée à la main avant release (trop lent pour le pre-commit).
// =====================================================================
"use strict";

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app

const PORT = 8123;
const BASE = "http://127.0.0.1:" + PORT;

// 🩸 Ne pas exiger un plan par son nom : `data/` (hors Git) peut ne contenir que des relevés réels. Le
// smoke ouvre le relevé fictif s'il est là, sinon le PREMIER plan de l'index, et le dit.
function planDeTest() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) { return { nom: "Relevé fictif de test", fictif: true }; }
}
const PLAN = planDeTest();

// Clés localStorage pré-posées pour passer les gates (valeurs lues dans le
// code : unlockGate.HASH_VALIDE, legalGate, tutorial).
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};
// 🩸 Les alertes en cours d'alert.json sont acquittées d'avance (acquit = `released`, cf alertChecker) :
// sinon leur modale s'ouvre à un instant variable et bloque les clics.
try {
  const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "alert.json"), "utf8"));
  (Array.isArray(live.alerts) ? live.alerts : []).forEach(function (a) {
    if (a && a.id && a.released) LS_PREGATES["myktamap_alert_seen_" + a.id] = a.released;
  });
} catch (e) { /* pas d'alert.json : rien à acquitter */ }

const problemes = [];
function pb(cat, msg) { problemes.push("[" + cat + "] " + msg); console.log("  ❌ " + cat + " : " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }

// Bruit console toléré (réseau absent en local, live-config…) — liste COURTE
// et justifiée : tout ajout doit expliquer pourquoi ce n'est pas un bug.
const BRUIT_TOLERE = [
  /Failed to load resource.*(version\.json|ping\.html|live-config)/i,  // update-checker offline : dégradation prévue
  /favicon/i,
  /Licence-pro.json/i   // sonde proLicense au boot : 404 = instance community, comportement NOMINAL
];
function estBruit(txt) { return BRUIT_TOLERE.some(function (re) { return re.test(txt); }); }

// Un 404 sur `data/<plan>/icon/…` n'est pas un asset manquant : `config.js > resoudreIconesPlanServeur`
// sonde chaque icône d'un plan qui ne déclare pas `iconsEmbarquees`, puis se replie à la racine. On compte.
const RX_SONDE_ICONE = /\/data\/[^/]+\/icon\/[^/]+$/;
const sondesIcones = [];

(async function main() {
  const server = require("./server.js");
  // Playwright ≥ 1.49 lance le « headless shell », binaire distinct du Chromium complet ; si son
  // téléchargement a échoué (proxy TLS), repli sur le Chromium complet, puis sur Edge.
  let navigateur;
  try {
    navigateur = await chromium.launch();
  } catch (e) {
    if (!/Executable doesn't exist/i.test(String((e && e.message) || ""))) throw e;
    console.log("[smoke] headless shell absent → repli sur le Chromium complet (channel: chromium)");
    try {
      navigateur = await chromium.launch({ channel: "chromium" });
    } catch (e2) {
      if (!/Executable doesn't exist/i.test(String((e2 && e2.message) || ""))) throw e2;
      // Aucun navigateur Playwright téléchargé : Edge, présent sur tout Windows.
      console.log("[smoke] Chromium Playwright absent → repli sur Microsoft Edge (channel: msedge)");
      navigateur = await chromium.launch({ channel: "msedge" });
    }
  }
  const contexte = await navigateur.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 800 } });
  const page = await contexte.newPage();

  page.on("response", function (r) {
    if (r.status() !== 404 || estBruit(r.url())) return;
    const u = r.url().replace(BASE, "");
    if (RX_SONDE_ICONE.test(u)) { sondesIcones.push(u); return; }
    pb("404", u);
  });
  page.on("console", function (m) {
    const txt = m.text();
    if (/Failed to load resource/.test(txt)) return;   // doublon sans URL du handler response
    if (m.type() === "error" && !estBruit(txt)) pb("console.error", txt.slice(0, 200));
    if (m.type() === "warning" && /Clé manquante/.test(txt)) pb("i18n", txt.slice(0, 160));
  });
  page.on("pageerror", function (e) { pb("pageerror", String(e).slice(0, 220)); });

  await page.addInitScript(function (pregates) {
    for (const k in pregates) localStorage.setItem(k, pregates[k]);
  }, LS_PREGATES);

  async function modaleVisible(nom, selecteur) {
    // 🩸 Une modale présente mais invisible (classe fantôme, display:none) : on exige des dimensions réelles.
    const el = page.locator(selecteur).last();
    try {
      await el.waitFor({ state: "visible", timeout: 4000 });
      const box = await el.boundingBox();
      if (!box || box.width < 40 || box.height < 40) { pb("modale", nom + " : présente mais dimensions nulles (" + JSON.stringify(box) + ")"); return false; }
      ok(nom + " visible (" + Math.round(box.width) + "×" + Math.round(box.height) + ")");
      return true;
    } catch (e) {
      pb("modale", nom + " : jamais visible (" + selecteur + ")");
      return false;
    }
  }
  async function fermerModales() {
    await page.keyboard.press("Escape").catch(function () {});
    // puis clic sur les ✕ visibles
    const boutons = await page.locator(".kta-panneau-close:visible").all();
    for (const b of boutons.reverse()) { await b.click({ timeout: 1000 }).catch(function () {}); }
    await page.waitForTimeout(250);
  }

  try {
    // ── 1. Boot HOME ──────
    console.log("— 1. Boot HOME —");
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);   // i18n + homeLoader async
    const titreVisible = await page.locator("#loaderTitle, .loader-title, .loader-header").first().isVisible().catch(function () { return false; });
    if (titreVisible) ok("HOME affiché"); else pb("boot", "HOME : aucun en-tête visible");
    // La modale Alertes peut recouvrir le HOME au boot : on la ferme comme un utilisateur.
    const alerteOuverte = await page.locator("#kta-alert-modal").isVisible().catch(function () { return false; });
    if (alerteOuverte) {
      await page.evaluate(function () {
        const b = document.getElementById("kta-alert-ok") || document.querySelector("#kta-alert-modal .kta-panneau-close");
        if (b) b.click();
      });
      await page.waitForTimeout(400);
      const encore = await page.locator("#kta-alert-modal").isVisible().catch(function () { return false; });
      if (encore) pb("boot", "la modale Alertes ne se ferme pas"); else ok("modale Alertes fermée (annonce au boot)");
    }
    const planListe = await page.getByText(PLAN.nom, { exact: false }).first().isVisible().catch(function () { return false; });
    if (planListe) ok("liste des plans peuplée (" + PLAN.nom + ")");
    else pb("boot", "aucun plan ouvrable dans data/index.json (cherché : " + PLAN.nom + ")");
    if (!PLAN.fictif) console.log("  •  ⚠️ le relevé fictif n'est pas dans data/index.json — smoke sur « " + PLAN.nom + " »");

    // ── 2. Configuration (HOME) ──────
    console.log("— 2. ⚙️ Configuration HOME —");
    await page.locator("#loaderConfigBtn").click();
    await page.waitForTimeout(600);
    const modeDev = await page.locator("#kta-devmode-wrap").isVisible().catch(function () { return false; });
    if (modeDev) ok("section Mode Développeur présente"); else pb("config", "section Mode Développeur absente/invisible");
    await page.evaluate(function () { const b = document.getElementById("loaderConfigClose"); if (b) b.click(); });
    await page.waitForTimeout(300);
    const configFermee = await page.locator("#loaderConfigModal").isVisible().catch(function () { return false; });
    if (configFermee) pb("config", "la modale Configuration ne se ferme pas"); else ok("Configuration fermée");

    // ── 3. Éditeur de données + modale résolution ──────
    console.log("— 3. Éditeur de données —");
    const edOk = await page.evaluate(function () {
      if (typeof window.ouvrirTableEditor === "function") { window.ouvrirTableEditor(); return true; }
      return false;
    });
    if (!edOk) pb("editeur", "window.ouvrirTableEditor indisponible");
    await page.waitForTimeout(500);
    await modaleVisible("accueil éditeur", "#kta-tbl-modal");
    await page.locator("#kta-tbl-src-resol").click();
    // modale exposée à la classe CSS fantôme : dimensions exigées
    await modaleVisible("convertisseur de résolution", ".kta-readme-modal-overlay:has(#kta-tbl-resol-go)");
    await fermerModales();   // convertisseur
    await page.evaluate(function () { const b = document.getElementById("kta-tbl-close-accueil"); if (b) b.click(); });
    await page.waitForTimeout(300);
    const overlayRestant = await page.locator(".kta-readme-modal-overlay:visible").count();
    if (overlayRestant > 0) {
      const ids = await page.locator(".kta-readme-modal-overlay:visible").evaluateAll(function (els) { return els.map(function (e) { return e.id || e.className; }); });
      pb("editeur", overlayRestant + " overlay(s) encore visible(s) : " + ids.join(" | "));
    }
    else ok("tous les overlays fermés");

    // ── 4. Charger le plan de test ──────
    console.log("— 4. Chargement du plan " + PLAN.nom + " —");
    await page.getByText(PLAN.nom, { exact: false }).first().click();
    // 🩸 attendre() et non page.waitForFunction, refusé par la CSP (attendre.js) : faux « pas chargé ».
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!document.getElementById("map"); }, 15000)
      .then(function () { ok("plan chargé (PLAN_CONFIG posé, #map présent)"); })
      .catch(function () { pb("plan", "le plan ne s'est pas chargé en 15 s"); });
    await page.waitForTimeout(2500);   // rendu calques + restore session

    // 🩸 Le premier rendu du tuilage doit COMPTER ses tuiles : un rendu fantôme « z=NaN » (carte sans vue)
    // laisse `attendusPremier` à 0 et désarme en silence le repli « tout a échoué → image entière ».
    const tuilage = await page.evaluate(function () {
      const s = window._tilingV2State;
      return s ? { niveau: s.currentLevel, attendus: s.attendusPremier } : null;
    });
    if (!tuilage) ok("plan non tuilé V2 — contrôle du premier rendu sans objet");
    else if (Number.isInteger(tuilage.niveau) && tuilage.attendus > 0) {
      ok("tuilage : premier rendu au niveau z=" + tuilage.niveau + ", " + tuilage.attendus + " tuiles attendues (repli d'erreur armé)");
    } else pb("tuilage", "premier rendu fantôme — niveau " + tuilage.niveau + ", " + tuilage.attendus + " tuile(s) attendue(s)");

    // ── 5. Réglages (construction complète, section géoref comprise) ──────
    console.log("— 5. ⚙️ Réglages carte —");
    const ouvert = await page.evaluate(function () {
      if (typeof window.afficherConfig === "function") { window.afficherConfig(); return true; }
      return false;
    });
    if (ouvert) {
      await modaleVisible("⚙️ Réglages", "#kta-cfg-modal");
      // Application immédiate : l'échelle saisie est persistée sans Appliquer (puis remise).
      const persiste = await page.evaluate(function () {
        const el = document.getElementById("cfg_scale"); if (!el) return "champ absent";
        const avant = el.value;
        el.value = "7.25"; el.dispatchEvent(new Event("change", { bubbles: true }));
        const pid = window._currentLoadedPlanId || "default";
        let prefs = {}; try { prefs = JSON.parse(localStorage.getItem("myktamap_plan_prefs_" + pid) || "{}"); } catch (e) {}
        el.value = avant; el.dispatchEvent(new Event("change", { bubbles: true }));
        return prefs.scale === 7.25 ? "ok" : "scale=" + JSON.stringify(prefs.scale);
      });
      if (persiste === "ok") ok("réglage immédiat : l'échelle est persistée à la saisie (sans Appliquer)");
      else pb("reglages", "échelle non persistée à la saisie (" + persiste + ")");
      // Le géoréférencement vit dans sa sous-modale.
      if (await page.locator("#cfg_georef_open").count() > 0) {
        await page.locator("#cfg_georef_open").click();
        await page.waitForTimeout(300);
      } else pb("reglages", "bouton 🌐 Géoréférencement absent du groupe Plan");
      // bouton présent = la section géoref s'est construite sans erreur
      const estimer = await page.locator("#cfg_kmz_B_estimer").count();
      if (estimer > 0) ok("section géoref construite (bouton Estimer B présent)");
      else pb("reglages", "bouton Estimer B absent — section géoref cassée ?");
      await fermerModales();
    } else pb("reglages", "afficherConfig indisponible");

    // ── 6. Légende ──────
    console.log("— 6. ≡ Légende —");
    const legendeOuverte = await page.evaluate(function () {
      if (typeof window.afficherLegende === "function") { window.afficherLegende(); return true; }
      return false;
    });
    if (legendeOuverte) { await modaleVisible("≡ Légende", ".kta-legende-modal, #kta-legende-modal, .kta-readme-modal-overlay"); await fermerModales(); }
    else console.log("  ℹ️ afficherLegende non exposée — étape sautée (non bloquant)");

    // ── 7. Modale Session + section Carnet ──────
    console.log("— 7. 📊 Modale Session + section Carnet —");
    const compteurs = await page.locator("#kta-refonte-counters-btn").count();
    if (compteurs > 0) {
      await page.locator("#kta-refonte-counters-btn").click();
      await modaleVisible("📊 Session", "#kta-refonte-session-modal");
      const carnet = await page.locator("#kta-refonte-session-carnet-section").count();
      if (carnet > 0) ok("section 📔 Carnet présente");
      else pb("session", "section Carnet absente de la modale Session");
      // Boutons de classement exigés seulement avec une sortie en cours (carnet désactivé sinon).
      const sortieEnCours = await page.evaluate(function () {
        try { return !!(window.Journal && window.Journal.getCurrent && window.Journal.getCurrent()); }
        catch (e) { return false; }
      });
      if (sortieEnCours) {
        const nbT = await page.locator("#kta-refonte-session-carnet-type-terrain").count();
        const nbB = await page.locator("#kta-refonte-session-carnet-type-bureau").count();
        if (nbT > 0 && nbB > 0) ok("boutons 🚶/🖥️ de classement présents");
        else pb("session", "boutons de classement absents alors qu'une sortie est en cours");
        // 🩸 Cliquer le bouton NON actif : la sortie démarre « bureau », cliquer « bureau » puis le voir actif
        // serait vrai sans rien faire (tautologie).
        if (nbT > 0 && nbB > 0) {
          const idT = "#kta-refonte-session-carnet-type-terrain";
          const idB = "#kta-refonte-session-carnet-type-bureau";
          const estPrimary = function (sel) {
            return page.locator(sel).evaluate(function (el) {
              return el.classList.contains("kta-btn-primary");
            }).catch(function () { return false; });
          };
          const tAvant = await estPrimary(idT);
          const cible  = tAvant ? idB : idT;     // celui qui n'est pas actif
          const autre  = tAvant ? idT : idB;
          await page.locator(cible).click();
          await page.waitForTimeout(600);
          const cibleOk = await estPrimary(cible);
          const autreOk = !(await estPrimary(autre));
          if (cibleOk && autreOk) ok("le classement bascule (cible active, autre désactivée)");
          else pb("session", "clic de classement sans bascule visible (setType échoué ? cible=" +
                             cibleOk + " autre_desactive=" + autreOk + ")");
        }
        // « Affiner le tracé » doit être GRISÉ : aucun « Je suis ici » posé ; actif = compteur de tronçons faux.
        const aff = await page.locator("#kta-refonte-session-carnet-affiner").count();
        if (aff > 0) {
          const grise = await page.locator("#kta-refonte-session-carnet-affiner")
            .evaluate(function (el) { return el.disabled === true; }).catch(function () { return false; });
          if (grise) ok("bouton 🧭 Affiner présent et grisé (rien à affiner)");
          else pb("session", "bouton Affiner actif alors qu'aucun « Je suis ici » n'a été posé");
        } else pb("session", "bouton 🧭 Affiner absent de la section Carnet");
      } else {
        console.log("  ℹ️ aucune sortie en cours (carnet désactivé ?) — boutons de classement non exigés");
      }
      await fermerModales();
    } else console.log("  ℹ️ bouton compteurs absent — étape sautée (non bloquant)");

    // ── 8. Aide intégrée (hub + une sous-modale) ──────
    console.log("— 8. ❓ Aide intégrée —");
    const aideOuverte = await page.evaluate(function () {
      if (typeof window.afficherAide === "function") { window.afficherAide(); return true; }
      return false;
    });
    if (aideOuverte) {
      await modaleVisible("❓ Aide", "#kta-aide-modal");
      // 🩸 Un parsing cassé rend une modale vide mais VISIBLE : on compte les lignes.
      const nbLignes = await page.locator("#kta-aide-modal .kta-aide-row").count();
      if (nbLignes >= 10) ok("hub d'aide peuplé (" + nbLignes + " lignes)");
      else pb("aide", "hub d'aide quasi vide (" + nbLignes + " lignes) — parsing des sections cassé ?");

      // Les classes de typographie de l'Aide doivent exister dans le CSS servi (sinon aucune erreur console).
      const cssOk = await page.evaluate(function () {
        const d = document.createElement("p");
        d.className = "kta-aide-note";
        document.body.appendChild(d);
        const c = getComputedStyle(d).fontSize;
        d.remove();
        return c;
      });
      if (cssOk === "12px") ok("classes de typographie de l'Aide servies (kta-aide-note = 12px)");
      else pb("aide", "classe kta-aide-note sans effet (font-size lu : " + cssOk + ") — bloc CSS absent du fichier servi ?");

      // Ouvrir une section : c'est le chemin qui construit la sous-modale.
      await page.locator("#kta-aide-modal .kta-aide-row").nth(1).click().catch(function () {});
      await page.waitForTimeout(300);
      const sous = await page.locator(".kta-aide-submodal").count();
      if (sous > 0) ok("sous-modale d'une section s'ouvre");
      else console.log("  ℹ️ sous-modale non détectée — non bloquant (la 2e ligne peut être un lien externe)");
      await fermerModales();
    } else console.log("  ℹ️ afficherAide non exposée — étape sautée (non bloquant)");

    await page.waitForTimeout(800);   // laisser sortir les erreurs asynchrones
  } catch (e) {
    pb("smoke", "exception du scénario : " + String(e).slice(0, 300));
  } finally {
    await navigateur.close();
    server.close();
  }

  console.log("");
  if (sondesIcones.length) {
    console.log("•  ℹ️ " + sondesIcones.length + " sondage(s) d'icône en 404 — NORMAL pour un plan généré " +
                "avant la v1.97.9 : son plan-config ne déclare pas ce qu'il embarque, l'app doit donc " +
                "demander. Régénère le plan pour les faire disparaître.");
  }
  if (problemes.length) {
    console.log("⚠️ SMOKE ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 SMOKE VERT — boot, modales, plan, Réglages, Légende, Session, Aide : zéro erreur runtime.");
  process.exit(0);
})();
