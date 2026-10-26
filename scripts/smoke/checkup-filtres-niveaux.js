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
// 2. « Afficher le plan de base » (case toujours présente) : en automatique elle suit le niveau 0 (cochée et fond
//    visible avec 0 visible, décochée et fond masqué avec 0 masqué) ; décochée à la main avec 0 visible → fond
//    masqué (pastille ≡ allumée) ; cochée à la main avec 0 masqué → fond visible ; « Tout afficher » la remet en
//    automatique. Rendu direct du relevé fictif, V1 sur une couche factice, V2 sur un ZIP `PLAN_V2_ZIP` ou sur
//    un état factice. Plan à un seul niveau : case dans « Calques image ». Le choix survit au rechargement, et
//    une session ancienne `garderFond: true` revient en « affiché » forcé.
// 3. Point masqué (tag décoché, niveau masqué, calque décoché puis recoché) : son icône ne prend plus le
//    pointeur à son emplacement, aucun clic n'ouvre sa fiche ; il redevient cliquable au réaffichage. Point de
//    session et point d'un calque de données.
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
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
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

// Case du plan de base, où qu'elle soit (Niveaux en multi-niveau, Calques image sinon).
function caseFond(page) {
  return page.evaluate(function () {
    const cb = document.querySelector("#kta-fp-modal [data-plan-de-base]");
    if (!cb) return { presente: false };
    const sec = cb.closest(".kta-fp-section");
    return { presente: true, cochee: cb.checked, section: sec ? sec.id : null,
             libelle: (cb.closest("label") || cb).textContent.trim(),
             mode: window.FilterPanel.getState().planDeBase,
             pastille: !!document.querySelector(".kta-filter-ctrl a[data-filtre-actif]") };
  });
}

async function cliquerVisible(page, lvl) {
  await page.locator('#kta-fp-sec-lvl [data-lvl-visible="' + lvl + '"]').click();
  await page.waitForTimeout(400);
}

async function cliquerFond(page) {
  await page.locator("#kta-fp-modal [data-plan-de-base]").click();
  await page.waitForTimeout(400);
}

async function toutAfficher(page) {
  await page.locator("#kta-fp-reset-all").click();
  await page.waitForTimeout(500);
}

async function testerFond(page, etiquette) {
  await page.evaluate(function () {
    window.APP_CONFIG.activeLevel = 0;
    window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice();
    if (window.FilterPanel.getState()) window.FilterPanel.getState().planDeBase = null;
    window.appliquerFiltreNiveau();
  });
  await ouvrirFiltres(page);
  const f0 = await lireFond(page);
  const c0 = await caseFond(page);
  inf(etiquette + " : rendu du fond = " + f0.mode + " (" + f0.poses + "/" + f0.total + " couche(s) posée(s))");
  verifier(f0.total > 0 && f0.poses > 0 && !f0.cache, etiquette + " : auto, niveau 0 visible → fond visible", f0);
  verifier(c0.presente && c0.section === "kta-fp-sec-lvl" && c0.cochee === true && c0.mode === null,
    etiquette + " : auto, niveau 0 visible → case présente dans Niveaux, cochée", c0);

  // Décochée à la main, niveau 0 visible : le fond part, la pastille ≡ le signale.
  await cliquerFond(page);
  const c1 = await caseFond(page);
  const f1 = await lireFond(page);
  verifier(c1.cochee === false && c1.mode === false && f1.poses === 0 && f1.cache,
    etiquette + " : case décochée, niveau 0 visible → fond masqué", { case: c1, fond: f1 });
  verifier(c1.pastille, etiquette + " : fond masqué à la main → pastille ≡ allumée", c1);
  const v1 = await page.evaluate(function () { return window.APP_CONFIG.visibleLevels.indexOf(0); });
  verifier(v1 >= 0, etiquette + " : décocher la case ne masque pas le niveau 0", { indexOf0: v1 });

  // « Tout afficher » → automatique : fond de nouveau visible (0 visible).
  await toutAfficher(page);
  const c2 = await caseFond(page);
  const f2 = await lireFond(page);
  verifier(c2.mode === null && c2.cochee === true && f2.poses > 0 && !f2.cache && !c2.pastille,
    etiquette + " : « Tout afficher » → automatique, case cochée, fond visible, pastille éteinte",
    { case: c2, fond: f2 });

  // Automatique, niveau 0 masqué : case décochée, fond masqué.
  // Le niveau actif doit quitter 0, sinon décocher 0 laisse le niveau de dessin masqué (permis, mais hors sujet).
  await page.locator('#kta-fp-sec-lvl [data-lvl-active="-1"]').click();
  await page.waitForTimeout(300);
  await cliquerVisible(page, 0);
  const c3 = await caseFond(page);
  const f3 = await lireFond(page);
  verifier(c3.presente && c3.cochee === false && c3.mode === null && f3.poses === 0 && f3.cache,
    etiquette + " : auto, niveau 0 masqué → case décochée, fond masqué", { case: c3, fond: f3 });

  // Cochée à la main, niveau 0 masqué : fond visible, le choix survit au re-rendu de la section.
  await cliquerFond(page);
  const c4 = await caseFond(page);
  const f4 = await lireFond(page);
  verifier(c4.cochee === true && c4.mode === true && f4.poses > 0 && !f4.cache,
    etiquette + " : case cochée, niveau 0 masqué → fond visible", { case: c4, fond: f4 });
  const v4 = await page.evaluate(function () { return window.APP_CONFIG.visibleLevels.indexOf(0); });
  verifier(v4 < 0, etiquette + " : cocher la case ne réaffiche pas le niveau 0", { indexOf0: v4 });
  await cliquerVisible(page, 0);
  await cliquerVisible(page, 0);
  const c5 = await caseFond(page);
  verifier(c5.cochee === true && c5.mode === true && (await lireFond(page)).poses > 0,
    etiquette + " : niveau 0 recoché puis décoché → le choix « affiché » l'emporte toujours", c5);

  // « Tout afficher » : niveaux tous visibles et automatique.
  await toutAfficher(page);
  const c6 = await caseFond(page);
  const f6 = await lireFond(page);
  verifier(c6.mode === null && c6.cochee === true && f6.poses > 0,
    etiquette + " : « Tout afficher » → automatique, fond visible", { case: c6, fond: f6 });
  await page.evaluate(function () { window.FilterPanel.fermer(); });
}

// Plan à un seul niveau (simulé) : la case vit dans « Calques image », toujours cochée en automatique.
async function testerFondMono(page) {
  await page.evaluate(function () {
    window._ktaTestML = { ml: window.APP_CONFIG.multiLevel, vis: window.APP_CONFIG.visibleLevels.slice() };
    window.APP_CONFIG.multiLevel = false;
    window.APP_CONFIG.visibleLevels = [];   // ignoré en mono-niveau : la règle ne doit pas le lire
    window.FilterPanel.getState().planDeBase = null;
    window.appliquerFiltreNiveau();
    window.FilterPanel.ouvrir();
  });
  await page.waitForTimeout(400);
  const c0 = await caseFond(page);
  const f0 = await lireFond(page);
  verifier(c0.presente && c0.section === "kta-fp-sec-img" && c0.cochee === true && f0.poses > 0,
    "mono-niveau : case dans « Calques image », cochée, fond visible", { case: c0, fond: f0 });
  const nb = await page.evaluate(function () {
    return document.querySelectorAll("#kta-fp-modal [data-plan-de-base]").length;
  });
  verifier(nb === 1, "mono-niveau : une seule case dans la modale", { nb: nb });
  await cliquerFond(page);
  const f1 = await lireFond(page);
  verifier(f1.poses === 0 && f1.cache, "mono-niveau : case décochée → fond masqué", f1);
  await toutAfficher(page);
  const c2 = await caseFond(page);
  const f2 = await lireFond(page);
  verifier(c2.mode === null && c2.cochee === true && f2.poses > 0,
    "mono-niveau : « Tout afficher » → automatique, fond visible", { case: c2, fond: f2 });
  await page.evaluate(function () {
    window.FilterPanel.fermer();
    window.APP_CONFIG.multiLevel = window._ktaTestML.ml;
    window.APP_CONFIG.visibleLevels = window._ktaTestML.vis;
    window.appliquerFiltreNiveau();
  });
}

// Point masqué = ni cliquable ni survolable : l'élément sous le pointeur, à l'emplacement du marqueur, ne doit
// pas être son icône (une opacité 0 seule laisse l'icône prendre le clic). `quel` = "session" ou "calque".
function sonderMarqueur(page, quel) {
  return page.evaluate(function (q) {
    const m = q === "session" ? window._ktaTestMarqueurSession : window._ktaTestMarqueurCalque;
    if (!m) return { absent: true };
    window.map.closePopup();   // une fiche ouverte couvrirait le point sondé
    if (!window.map.hasLayer(m) || !m._icon) return { surCarte: false, touche: false };
    const r = m._icon.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const el = document.elementFromPoint(x, y);
    const touche = !!(el && el.closest(".leaflet-marker-icon") === m._icon);
    return { surCarte: true, touche: touche, opacite: m._icon.style.opacity, x: x, y: y };
  }, quel);
}

async function cliquerSansPopup(page, s) {
  await page.evaluate(function () { window.map.closePopup(); });
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(400);
  return page.evaluate(function () { return document.querySelectorAll(".leaflet-popup").length === 0; });
}

// Coche / décoche une case de la modale ≡ (tag de point ou calque de données) par un vrai clic.
async function caseFiltre(page, selecteur, coche) {
  await page.evaluate(function () { window.FilterPanel.ouvrir(); });
  await page.waitForTimeout(300);
  await page.evaluate(function (a) {
    const cb = document.querySelector("#kta-fp-modal " + a.sel);
    if (cb && cb.checked !== a.coche) cb.click();
  }, { sel: selecteur, coche: coche });
  await page.waitForTimeout(500);
  await page.evaluate(function () { window.FilterPanel.fermer(); });
  await page.waitForTimeout(300);
}

function retrouverMarqueurSession(page) {
  return page.evaluate(function () {
    const p = window.getEditorPoints()[0];
    window._ktaTestMarqueurSession = null;
    window.layerEditor.getLayers().forEach(function (l) {
      if (!l.getLatLng) return;
      const ll = l.getLatLng();
      if (Math.abs(ll.lng - p.x) < 0.01 && Math.abs(ll.lat - (window.APP_CONFIG.imageHeight - p.y)) < 0.01) {
        window._ktaTestMarqueurSession = l;
      }
    });
    return !!window._ktaTestMarqueurSession;
  });
}

async function testerPointsMasques(page) {
  // Un point d'un calque de données au centre de la vue, et un point de session de tag « salle » à côté.
  const prep = await page.evaluate(function () {
    window.map.closePopup();
    window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice();
    window.APP_CONFIG.activeLevel = 0;
    window.FilterPanel.setFilters({ tags: null });
    window.FilterPanel.applyFilters();
    const mC = (window._ktaDataMarkers || []).find(function (m) {
      return m && m._icon && window.map.hasLayer(m) && Array.isArray(m._ktaTags) && m._ktaTags[0]
        && m._ktaTags[0] !== "salle" && m._ktaLayerId;
    }) || null;
    window._ktaTestMarqueurCalque = mC;
    if (mC) window.map.setView(mC.getLatLng(), window.map.getZoom(), { animate: false });
    const c = window.map.getCenter();
    window.setEditorPoints([{ id: "PoiMasque", nom: "PoiMasque", uid: "pt_masquetest",
      x: Math.round(c.lng) + 60, y: Math.round(window.APP_CONFIG.imageHeight - c.lat) + 60,
      tags: ["salle"], level: 0, etat: "Non inspectée", description: "", source: "editor" }]);
    window.appliquerFiltreNiveau();
    return { calque: !!mC, tagCalque: mC ? mC._ktaTags[0] : null, idCalque: mC ? mC._ktaLayerId : null };
  });
  await page.waitForTimeout(600);
  verifier(await retrouverMarqueurSession(page), "point de session posé et affiché");
  if (!prep.calque) inf("aucun point de calque de données visible : volet « calque » sauté");

  const s0 = await sonderMarqueur(page, "session");
  verifier(s0.surCarte && s0.touche, "session, sans filtre : le point est cliquable", s0);
  if (s0.touche) verifier(!(await cliquerSansPopup(page, s0)), "session, sans filtre : le clic ouvre sa fiche");

  const tagSession = '[data-set="tags"][data-type="salle"]';
  await caseFiltre(page, tagSession, false);
  const s1 = await sonderMarqueur(page, "session");
  verifier(!s1.touche, "session, tag décoché : le point n'est plus sous le pointeur", s1);
  if (s1.surCarte) verifier(await cliquerSansPopup(page, s1), "session, tag décoché : clic à son emplacement → aucune fiche");
  await caseFiltre(page, tagSession, true);
  verifier((await sonderMarqueur(page, "session")).touche, "session, tag recoché : le point redevient cliquable");

  await page.evaluate(function () {
    const pts = window.getEditorPoints(); pts[0].level = -1; window.renderEditorPoints();
    window.APP_CONFIG.visibleLevels = [0]; window.APP_CONFIG.activeLevel = 0; window.appliquerFiltreNiveau();
  });
  await retrouverMarqueurSession(page);
  await page.waitForTimeout(300);
  const s3 = await sonderMarqueur(page, "session");
  verifier(!s3.touche, "session, niveau masqué : le point n'est plus sous le pointeur", s3);
  if (s3.surCarte) verifier(await cliquerSansPopup(page, s3), "session, niveau masqué : clic à son emplacement → aucune fiche");
  await page.evaluate(function () {
    window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice(); window.appliquerFiltreNiveau();
  });
  await page.waitForTimeout(300);
  verifier((await sonderMarqueur(page, "session")).touche, "session, niveau ré-affiché : le point redevient cliquable");

  if (prep.calque) {
    const c0 = await sonderMarqueur(page, "calque");
    verifier(c0.surCarte && c0.touche, "calque, sans filtre : le point est cliquable", c0);
    const tagCalque = '[data-set="tags"][data-type="' + prep.tagCalque + '"]';
    const caseCalque = '[data-data-layer="' + prep.idCalque + '"]';
    await caseFiltre(page, tagCalque, false);
    const c1 = await sonderMarqueur(page, "calque");
    verifier(!c1.touche, "calque, tag décoché : le point n'est plus sous le pointeur", c1);
    if (c1.surCarte) verifier(await cliquerSansPopup(page, c1), "calque, tag décoché : clic à son emplacement → aucune fiche");
    // 🩸 Calque décoché puis recoché, tag toujours décoché : l'icône recréée par Leaflet doit rester inerte.
    await caseFiltre(page, caseCalque, false);
    verifier(!(await sonderMarqueur(page, "calque")).touche, "calque décoché : le point n'est plus sous le pointeur");
    await caseFiltre(page, caseCalque, true);
    const c3 = await sonderMarqueur(page, "calque");
    verifier(!c3.touche, "calque recoché, tag toujours décoché : le point reste inerte", c3);
    await caseFiltre(page, tagCalque, true);
    verifier((await sonderMarqueur(page, "calque")).touche, "calque, tag recoché : le point redevient cliquable");
    await page.evaluate(function () {
      const m = window._ktaTestMarqueurCalque;
      m._ktaNiveauOrig = m._ktaLevel; m._ktaLevel = 1;
      window.APP_CONFIG.visibleLevels = [0]; window.appliquerFiltreNiveau();
    });
    await page.waitForTimeout(300);
    verifier(!(await sonderMarqueur(page, "calque")).touche, "calque, niveau masqué : le point n'est plus sous le pointeur");
    await page.evaluate(function () {
      const m = window._ktaTestMarqueurCalque;
      m._ktaLevel = m._ktaNiveauOrig;
      window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice(); window.appliquerFiltreNiveau();
    });
  }
  await page.evaluate(function () { window.map.closePopup(); window.setEditorPoints([]); });
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
    // 🩸 Points des calques filtrés AVANT leur addTo (niveaux ≠ 0 au chargement) : l'icône créée ensuite doit
    // naître inerte.
    const auChargement = await page.evaluate(function () {
      const icone = L.divIcon({ className: "kta-marker-divicon", iconSize: [24, 24],
        html: '<img class="kta-marker-img" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">' });
      const m = L.marker(window.map.getCenter(), { icon: icone });
      if (typeof window.ktaMasquerMarqueur === "function") window.ktaMasquerMarqueur(m, true);
      else m.setOpacity(0);
      m.addTo(window.map);
      const img = m._icon.querySelector("img");
      const r = { div: getComputedStyle(m._icon).pointerEvents, img: getComputedStyle(img).pointerEvents };
      m.remove();
      return r;
    });
    verifier(auChargement.div === "none" && auChargement.img === "none",
      "marqueur masqué avant son addTo : l'icône créée ensuite est inerte (icône et image)", auChargement);

    console.log("\n── 1. Niveau actif (dessin) : classe et couleur du bouton cliqué ──");
    await testerBoutonsActifs(page, "dark");
    await testerBoutonsActifs(page, "light");
    await page.evaluate(function () { window.ThemeManager.setTheme("dark"); });

    console.log("\n── 2. Afficher le plan de base (tuilage du plan servi) ──");
    await testerFond(page, "plan servi");
    await testerFondMono(page);

    console.log("\n── 2bis. Le choix survit au rechargement ; ancienne session migrée ──");
    async function sauverEtRecharger(valeur, ancienne) {
      await page.evaluate(function (a) {
        const c = window.map.getCenter();
        window.setEditorPoints([{ id: "PoiFond", nom: "PoiFond", uid: "pt_fondtest", x: Math.round(c.lng),
          y: Math.round(window.APP_CONFIG.imageHeight - c.lat), tags: ["salle"], level: 0,
          etat: "Non inspectée", description: "", source: "editor" }]);
        window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice();
        window.FilterPanel.getState().planDeBase = a.valeur;
        window.appliquerFiltreNiveau();
        return window.SessionPersist.save({ force: true });
      }, { valeur: valeur });
      await page.waitForTimeout(1500);
      if (ancienne) {
        // Session écrite avant le renommage : `garderFond: true`, pas de `planDeBase`.
        const reecrite = await page.evaluate(function () {
          const S = window.KtaSessionStore;
          const id = S.ids().find(function (k) { return (S.lire(k) || "").indexOf("pt_fondtest") >= 0; });
          if (!id) return false;
          const p = JSON.parse(S.lire(id));
          delete p.runtimeFilters.planDeBase;
          p.runtimeFilters.garderFond = true;
          return S.ecrireDurable(id, JSON.stringify(p)).then(function () { return true; });
        });
        verifier(reecrite, "session réécrite au format ancien (garderFond: true)");
      }
      await ouvrirPlan(page);
      await page.waitForTimeout(500);
      await ouvrirFiltres(page);
    }
    // Masqué à la main, niveau 0 visible : le fond reste masqué après rechargement.
    await sauverEtRecharger(false, false);
    const cA = await caseFond(page);
    const fA = await lireFond(page);
    verifier(cA.mode === false && cA.cochee === false && fA.poses === 0 && cA.pastille,
      "rechargé : « masqué » restauré, fond masqué avec le niveau 0 visible, pastille allumée", { case: cA, fond: fA });
    await page.evaluate(function () { window.FilterPanel.fermer(); });
    // Affiché à la main, niveau 0 masqué ensuite.
    await sauverEtRecharger(true, false);
    await page.locator('#kta-fp-sec-lvl [data-lvl-active="-1"]').click();
    await page.waitForTimeout(300);
    await cliquerVisible(page, 0);
    const cB = await caseFond(page);
    const fB = await lireFond(page);
    verifier(cB.mode === true && cB.cochee === true && fB.poses > 0,
      "rechargé : « affiché » restauré, fond visible avec le niveau 0 masqué", { case: cB, fond: fB });
    await page.evaluate(function () { window.FilterPanel.fermer(); });
    // Automatique : rien de forcé au retour.
    await sauverEtRecharger(null, false);
    const cC = await caseFond(page);
    verifier(cC.mode === null && cC.cochee === true, "rechargé : automatique restauré", cC);
    await page.evaluate(function () { window.FilterPanel.fermer(); });
    // Ancienne session `garderFond: true` → « affiché » forcé.
    await sauverEtRecharger(null, true);
    const cD = await caseFond(page);
    verifier(cD.mode === true && cD.cochee === true, "ancienne session garderFond: true → « affiché » forcé", cD);
    await page.evaluate(function () {
      window.FilterPanel.fermer();
      window.setEditorPoints([]);
      window.FilterPanel.getState().planDeBase = null;
      window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice();
      window.appliquerFiltreNiveau();
      return window.SessionPersist.save({ force: true });
    });
    await page.waitForTimeout(800);

    console.log("\n── 3. Point masqué par ≡ Filtres : ni cliquable ni survolable ──");
    await testerPointsMasques(page);

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
  console.log("🎉 CHECKUP VERT — niveau actif marqué au clic, plan de base au choix (auto, affiché, masqué), point masqué inerte.");
  process.exit(0);
})();
