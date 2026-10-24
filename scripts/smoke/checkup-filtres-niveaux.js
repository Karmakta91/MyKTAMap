#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-filtres-niveaux.js — checkup (Playwright, pas un hook pré-commit) : section « Niveaux M-LVL » de la
// modale ≡ Filtres sur le relevé fictif (multi-niveau)
// =====================================================================
// 1. NIVEAU ACTIF (DESSIN) : un clic réel sur chaque bouton, en sombre puis en clair → le niveau de dessin
//    change, SEUL le bouton cliqué porte la classe active ET la couleur active calculée (fond doré).
//    🩸 Le clic re-rend la section (ktaSetActiveLevel → appliquerFiltreNiveau → FilterPanel.onLevelChange) :
//    un marquage par identité du bouton cliqué visait un nœud détaché et effaçait le marquage du re-rendu.
// 2. « Garder le plan de base » : niveau 0 masqué → case présente, décochée → fond masqué, cochée → fond
//    visible (rendu direct du relevé fictif, V1 sur une couche factice, V2 sur un ZIP `PLAN_V2_ZIP` ou sur un
//    état factice) ;
//    niveau 0 visible → case absente, fond visible ; le choix survit au rechargement (session du plan).
// Usage : node scripts/smoke/checkup-filtres-niveaux.js · doc : docs/architecture/multilevel-pathfinding.md
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
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

// Même repli que checkup-niveau-objet.js : on ouvre ce que l'index propose, en le disant.
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
const PX_VIDE = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
// Plan tuilé V2 facultatif (chemin hors dépôt, jamais écrit ici) : sans lui, V2 est testé sur un état factice.
const ZIP_V2 = process.env.PLAN_V2_ZIP || "";

async function chargerZipV2(page) {
  await page.evaluate(function () {
    const i = document.createElement("input");
    i.type = "file"; i.id = "kta-checkup-zip"; i.style.display = "none";
    document.body.appendChild(i);
  });
  await page.setInputFiles("#kta-checkup-zip", ZIP_V2);
  await page.evaluate(function () {
    const f = document.getElementById("kta-checkup-zip").files[0];
    window.chargerZipFichier(f, "auto", { storeBlob: false });
  });
  await attendre(page, function () {
    return !!window._tilingV2State && Array.isArray(window._tilingV2State.activeOverlays)
      && window._tilingV2State.activeOverlays.length > 0;
  }, 180000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    // Un plan mono-niveau passe en multi-niveau pour l'essai : seule la règle du fond est testée ici.
    if (window.APP_CONFIG.multiLevel !== true) {
      window.APP_CONFIG.multiLevel = true;
      window.APP_CONFIG.availableLevels = [-2, -1, 0, 1, 2];
    }
  });
}
const problemes = [];
const erreursPage = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail ? " " + JSON.stringify(detail) : "")); }

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.FilterPanel && !!window.ktaSetActiveLevel;
  }, 60000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

async function ouvrirFiltres(page) {
  await page.evaluate(function () { window.FilterPanel.ouvrir(); });
  await attendre(page, function () { return !!document.querySelector("#kta-fp-sec-lvl [data-lvl-active]"); }, 5000);
}

// Classe et fond calculé de chaque bouton de niveau actif (relus après chaque clic : la section est re-rendue).
function lireBoutons(page) {
  return page.evaluate(function () {
    return Array.from(document.querySelectorAll("#kta-fp-sec-lvl [data-lvl-active]")).map(function (b) {
      return {
        lvl: parseInt(b.getAttribute("data-lvl-active"), 10),
        actif: b.classList.contains("kta-fp-lvl-btn-active"),
        fond: getComputedStyle(b).backgroundColor
      };
    });
  });
}

// Fond « actif » = doré opaque (#f4c542 ou proche) ; repos = quasi transparent (sombre) ou beige (clair).
function estDore(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(rgb || "");
  if (!m) return false;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  return a > 0.9 && +m[1] > 220 && +m[2] > 170 && +m[2] < 215 && +m[3] < 110;
}

async function testerBoutonsActifs(page, theme) {
  await page.evaluate(function (t) { window.ThemeManager.setTheme(t); }, theme);
  await page.waitForTimeout(300);
  await ouvrirFiltres(page);
  const lvls = (await lireBoutons(page)).map(function (b) { return b.lvl; });
  // On finit par un bouton déjà cliqué pour couvrir aussi le retour (dont RDC = 0).
  const ordre = lvls.slice().reverse().concat([lvls[0], 0]);
  for (const lvl of ordre) {
    // Pointeur réel : la souris reste sur le bouton (le survol ne doit pas masquer l'état actif).
    await page.locator('#kta-fp-sec-lvl [data-lvl-active="' + lvl + '"]').click();
    await page.waitForTimeout(250);
    const etat = await lireBoutons(page);
    const actifs = etat.filter(function (b) { return b.actif; }).map(function (b) { return b.lvl; });
    const dores = etat.filter(function (b) { return estDore(b.fond); }).map(function (b) { return b.lvl; });
    const niv = await page.evaluate(function () { return window.APP_CONFIG.activeLevel; });
    verifier(niv === lvl && actifs.length === 1 && actifs[0] === lvl && dores.length === 1 && dores[0] === lvl,
      theme + " : clic sur " + lvl + " → niveau de dessin " + lvl + ", seul ce bouton est actif et doré",
      { niveau: niv, classe: actifs, dore: dores, fonds: etat.map(function (b) { return b.lvl + ":" + b.fond; }) });
  }
  await page.evaluate(function () { window.FilterPanel.fermer(); });
}

// Fond du plan sur la carte : rendu direct, V1 et V2 (au moins une couche posée = visible).
function lireFond(page) {
  return page.evaluate(function () {
    const map = window.map;
    let poses = 0, total = 0;
    (window._ktaBaseLayers || []).forEach(function (l) { total++; if (map.hasLayer(l)) poses++; });
    (window._baseTiles || []).forEach(function (t) { if (t && t.overlay) { total++; if (map.hasLayer(t.overlay)) poses++; } });
    const st = window._tilingV2State;
    if (st && Array.isArray(st.activeOverlays)) {
      st.activeOverlays.forEach(function (o) { if (o) { total++; if (map.hasLayer(o)) poses++; } });
    }
    const mode = (st && Array.isArray(st.activeOverlays) && st.activeOverlays.length) ? "V2"
      : ((window._baseTiles || []).length ? "V1" : "direct");
    return { mode: mode, total: total, poses: poses, cache: window._ktaBaseHidden === true };
  });
}

function caseGarder(page) {
  return page.evaluate(function () {
    const cb = document.querySelector("#kta-fp-sec-lvl [data-lvl-garder-fond]");
    return cb ? { presente: true, cochee: cb.checked, libelle: (cb.closest("label") || cb).textContent.trim() }
              : { presente: false };
  });
}

async function cliquerVisible(page, lvl) {
  await page.locator('#kta-fp-sec-lvl [data-lvl-visible="' + lvl + '"]').click();
  await page.waitForTimeout(400);
}

async function testerFond(page, etiquette) {
  await page.evaluate(function () {
    window.APP_CONFIG.activeLevel = 0;
    window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice();
    if (window.FilterPanel.getState()) window.FilterPanel.getState().garderFond = false;
    window.appliquerFiltreNiveau();
  });
  await ouvrirFiltres(page);
  const f0 = await lireFond(page);
  inf(etiquette + " : rendu du fond = " + f0.mode + " (" + f0.poses + "/" + f0.total + " couche(s) posée(s))");
  verifier(f0.total > 0 && f0.poses > 0 && !f0.cache, etiquette + " : niveau 0 visible → fond visible", f0);
  verifier(!(await caseGarder(page)).presente, etiquette + " : niveau 0 visible → pas de case « garder le plan »");

  // Le niveau actif doit quitter 0, sinon décocher 0 laisse le niveau de dessin masqué (permis, mais hors sujet).
  await page.locator('#kta-fp-sec-lvl [data-lvl-active="-1"]').click();
  await page.waitForTimeout(300);
  await cliquerVisible(page, 0);
  const c1 = await caseGarder(page);
  const f1 = await lireFond(page);
  verifier(c1.presente && c1.cochee === false, etiquette + " : niveau 0 masqué → case présente, décochée", c1);
  verifier(f1.poses === 0 && f1.cache, etiquette + " : case décochée → fond masqué", f1);

  await page.locator("#kta-fp-sec-lvl [data-lvl-garder-fond]").click();
  await page.waitForTimeout(500);
  const c2 = await caseGarder(page);
  const f2 = await lireFond(page);
  verifier(c2.presente && c2.cochee === true, etiquette + " : la case reste cochée après le re-rendu", c2);
  verifier(f2.poses > 0 && !f2.cache, etiquette + " : case cochée → fond visible (niveau 0 toujours masqué)", f2);
  const vis = await page.evaluate(function () { return window.APP_CONFIG.visibleLevels.indexOf(0); });
  verifier(vis < 0, etiquette + " : cocher la case ne réaffiche pas le niveau 0", { indexOf0: vis });

  await page.locator("#kta-fp-sec-lvl [data-lvl-garder-fond]").click();
  await page.waitForTimeout(400);
  const f3 = await lireFond(page);
  verifier(f3.poses === 0 && f3.cache, etiquette + " : case décochée de nouveau → fond masqué", f3);

  // Niveau 0 ré-affiché, case cochée ou non : fond visible, case absente.
  await page.locator("#kta-fp-sec-lvl [data-lvl-garder-fond]").click();
  await page.waitForTimeout(300);
  await cliquerVisible(page, 0);
  const f4 = await lireFond(page);
  verifier(f4.poses > 0 && !f4.cache && !(await caseGarder(page)).presente,
    etiquette + " : niveau 0 ré-affiché → fond visible, case absente", f4);
  await page.evaluate(function () { window.FilterPanel.fermer(); });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  try {
    if (!PLAN.fictif) inf("⚠️ le relevé fictif n'est pas dans data/index.json — checkup sur « " + PLAN.nom + " »");
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    const page = await ctx.newPage();
    page.on("pageerror", function (e) { erreursPage.push(String(e)); });

    console.log("\n── Ouverture de « " + PLAN.nom + " » ──");
    await ouvrirPlan(page);
    const ml = await page.evaluate(function () {
      return { ml: window.APP_CONFIG.multiLevel === true, niveaux: window.APP_CONFIG.availableLevels };
    });
    if (!ml.ml) throw new Error("le plan ouvert n'est pas multi-niveau");
    ok("plan multi-niveau, niveaux " + JSON.stringify(ml.niveaux));

    console.log("\n── 1. Niveau actif (dessin) : classe et couleur du bouton cliqué ──");
    await testerBoutonsActifs(page, "dark");
    await testerBoutonsActifs(page, "light");
    await page.evaluate(function () { window.ThemeManager.setTheme("dark"); });

    console.log("\n── 2. Garder le plan de base (tuilage du plan servi) ──");
    await testerFond(page, "plan servi");

    console.log("\n── 2bis. Le choix survit au rechargement ──");
    await page.evaluate(function () {
      const c = window.map.getCenter();
      window.setEditorPoints([{ id: "PoiFond", nom: "PoiFond", uid: "pt_fondtest", x: Math.round(c.lng),
        y: Math.round(window.APP_CONFIG.imageHeight - c.lat), tags: ["salle"], level: 0,
        etat: "Non inspectée", description: "", source: "editor" }]);
      window.FilterPanel.getState().garderFond = true;
      return window.SessionPersist.save({ force: true });
    });
    await page.waitForTimeout(1500);
    await ouvrirPlan(page);
    await page.waitForTimeout(500);
    await ouvrirFiltres(page);
    await page.locator('#kta-fp-sec-lvl [data-lvl-active="-1"]').click();
    await page.waitForTimeout(300);
    await cliquerVisible(page, 0);
    const cR = await caseGarder(page);
    const fR = await lireFond(page);
    verifier(cR.presente && cR.cochee === true && fR.poses > 0,
      "rechargé : case cochée restaurée, fond visible avec le niveau 0 masqué", { case: cR, fond: fR });
    await page.evaluate(function () {
      window.FilterPanel.fermer();
      window.setEditorPoints([]);
      window.FilterPanel.getState().garderFond = false;
      return window.SessionPersist.save({ force: true });
    });
    await page.waitForTimeout(800);

    console.log("\n── 2ter. Tuilage V1 et V2 ──");
    // Le relevé fictif est en rendu direct : V1 = une couche factice dans _baseTiles (même règle que le rendu réel).
    await page.evaluate(function (px) {
      const h = window.APP_CONFIG.imageHeight, w = window.APP_CONFIG.imageWidth;
      window._baseTiles = [{ overlay: L.imageOverlay(px, [[0, 0], [h / 4, w / 4]]).addTo(window.map) }];
    }, PX_VIDE);
    await testerFond(page, "V1 (couche factice) + direct");
    if (ZIP_V2) {
      await chargerZipV2(page);
      const m = (await lireFond(page)).mode;
      if (m !== "V2") pb("ZIP V2 chargé mais le fond n'est pas en V2 (" + m + ")");
      else await testerFond(page, "V2 (ZIP fourni)");
    } else {
      inf("PLAN_V2_ZIP absent : V2 testé sur un état factice (tuiles reposées par ktaCullerTuilesV2)");
      await page.evaluate(function (px) {
        const h = window.APP_CONFIG.imageHeight, w = window.APP_CONFIG.imageWidth;
        window._baseTiles = [];
        window._ktaBaseLayers = [];
        const ov = L.imageOverlay(px, [[0, 0], [h, w]]).addTo(window.map);
        window._tilingV2State = { activeOverlays: [ov] };
      }, PX_VIDE);
      await testerFond(page, "V2 (état factice)");
      await page.evaluate(function () { window._tilingV2State = null; });
    }
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  erreursPage.slice(0, 10).forEach(function (m) { pb("erreur de page : " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — niveau actif marqué au clic, plan de base gardé au choix.");
  process.exit(0);
})();
