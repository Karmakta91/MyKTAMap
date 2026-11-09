#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-icones-ui.js — checkup (Playwright, pas un hook pré-commit) : icônes SVG de l'interface
// =====================================================================
// Dans l'app réelle, Chromium et WebKit, thème sombre puis clair : en-tête de l'accueil, titres de section, Outils et
// lignes de Mes plans, Configuration de l'accueil (titres, groupes, réglages) et ses fenêtres Journal réseau, réseau
// expliqué et Dépannage, barre de la carte (groupes et sous-actions des accordéons), fenêtre Tracker, lanceur
// d'export (tuiles et titres de section) → chaque contrôle migré porte un svg.kta-ico et aucun emoji. Documentation
// (guides fr, en, es) : chaque emoji rendu en SVG (bouton ou notion), les emoji restés = exactement les exceptions
// KtaIcones.GARDE, titres h1 à h5, sommaire et fils d'Ariane sans emoji hors exception, icône proportionnée au titre
// et à la puce. Aide intégrée : hub (titres, catégories, lignes) et chaque fiche, même règle ; fiche « Menu
// Tracker » : Tracker / Boussole chacun SA bonne icône.
// Fenêtres d'outils de la carte (Réglages du plan, Filtres, Légende, Distance totale, Boussole, Heatmap, exports,
// Recherche, Statistiques, Carnet, Itinéraire, Je suis perdu, Mode Secours, éditeur de point, raccourcis) : titres,
// sections et boutons migrés en SVG, sans emoji. Reste de l'interface (lot C3) : barres du haut et du bas, fiche d'un
// point, bouton d'aide des fenêtres, Mode Secours (vues opérateur et secouriste), vue 3D, Générateur, Tableur, Mes
// photos, tutoriel (icônes de carte et emoji de bouton substitués), Vue OSM si le plan est géoréférencé. Fin de la
// refonte (lot C4) : pied de page de l'accueil, Profil et export du profil, sélection multiple, recalage, rapport de
// session, raccourcis, recherche multi-plans, Mes liaisons, calibrer l'échelle, ConfAdmin.
// check-icones-ui.js garde le source ; seul ce parcours voit le rendu (substitution, DOM, CSS).
// Captures : KTA_CAPTURES=<dossier hors dépôt> (aucune par défaut).
// Usage : node scripts/smoke/checkup-icones-ui.js   (KTA_MOTEURS=chromium : un seul moteur)
// =====================================================================
"use strict";

const path = require("path");
const nav = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const CAPTURES = process.env.KTA_CAPTURES || "";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_readme_lang": "fr"
};
const GROUPES = ["favoris", "aide", "settings", "recherche", "charger", "save", "history", "tracker", "mesure",
  "edition", "traces", "zones", "structures"];
const ENTETE = ["loaderSearchBtn", "loaderOfflineHdrBtn", "loaderAlertBtn", "loaderHelpBtn", "loaderConfigBtn",
  "loaderPlansFolderNew", "loaderPlansSelect"];

const problemes = [];
let prefixe = "";
function pb(msg) { problemes.push(prefixe + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail ? " " + JSON.stringify(detail) : "")); }

// Évalué dans la page : un élément porte-t-il une icône SVG et aucun emoji dans son texte ?
const SONDE = function () {
  window.__ktaSonde = function (el) {
    if (!el) return { absent: true };
    const emo = /[\p{Extended_Pictographic}⬛☑ℹ]/u.test(el.textContent || "");
    return { svg: !!el.querySelector("svg.kta-ico"), emoji: emo };
  };
};

async function capture(page, nom) {
  if (!CAPTURES) return;
  await page.screenshot({ path: path.join(CAPTURES, prefixe.replace(/[^\w-]+/g, "-") + nom + ".png") });
}

async function jouer(page, theme) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(SONDE);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

  // 1. En-tête de l'accueil (boutons cachés compris : leur contenu est posé au chargement).
  await attendre(page, function () { return !!window.KtaIcones && !!document.querySelector("#loaderHelpBtn svg"); }, 15000);
  const entete = await page.evaluate(function (ids) {
    return ids.map(function (id) { return Object.assign({ id: id }, window.__ktaSonde(document.getElementById(id))); });
  }, ENTETE);
  const fautesEntete = entete.filter(function (b) { return !b.svg || b.emoji; });
  verifier(fautesEntete.length === 0, "accueil : " + ENTETE.length + " boutons d'en-tête / Mes plans en SVG, sans emoji",
    fautesEntete);
  const themeVu = await page.evaluate(function () { return document.documentElement.classList.contains("kta-theme-light"); });
  verifier(themeVu === (theme === "light"), "thème " + theme + " appliqué");
  // Le splash est retiré du DOM après quelques secondes (js/ktaSplash.js) : capture de l'accueil prêt.
  await page.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
  await page.waitForTimeout(800);
  await capture(page, "1-accueil");

  // 1 bis. Accueil : titres de section, Outils, lignes de Mes plans, case des plans du site.
  const accueil = await page.evaluate(function () {
    const S = window.__ktaSonde;
    const liste = function (sel) {
      return Array.prototype.map.call(document.querySelectorAll(sel), function (el) {
        return Object.assign({ t: (el.textContent || "").trim().slice(0, 30) }, S(el));
      });
    };
    return { titres: liste(".loader-section-head .loader-section-titre"),
      outils: liste(".loader-secondary-actions > button"), lignes: liste(".plan-row-icon"),
      siteCase: S(document.querySelector(".loader-plans-filter-row")), zip: S(document.querySelector(".zip-icon")) };
  });
  const fA = accueil.titres.concat(accueil.outils, accueil.lignes).filter(function (b) { return !b.svg || b.emoji; });
  verifier(accueil.titres.length === 4 && accueil.outils.length === 6 && accueil.lignes.length >= 1 && fA.length === 0,
    "accueil : " + accueil.titres.length + " titres de section, " + accueil.outils.length + " outils, " +
    accueil.lignes.length + " ligne(s) de plan en SVG, sans emoji", fA);
  verifier(accueil.siteCase.svg && !accueil.siteCase.emoji && accueil.zip.svg, "accueil : case des plans du site et " +
    "zone Ajouter un plan en SVG", [accueil.siteCase, accueil.zip]);

  // 1 ter. Configuration de l'accueil : titres, groupes, libellés de réglage, boutons des fenêtres.
  await page.evaluate(function () { document.getElementById("loaderConfigBtn").click(); });
  await attendre(page, function () {
    const m = document.getElementById("loaderConfigModal");
    return !!m && m.style.display !== "none" && !!m.querySelector("#kta-devmode-toggle svg");
  }, 8000);
  const cfg = await page.evaluate(function () {
    const S = window.__ktaSonde, m = document.getElementById("loaderConfigModal");
    const sondes = function (sel) {
      return Array.prototype.map.call(m.querySelectorAll(sel), function (el) {
        return Object.assign({ t: (el.textContent || "").trim().slice(0, 30) }, S(el));
      });
    };
    // Une icône posée par data-kta-ico, et le libellé qui la suit sans emoji (les indices remplis par l'app,
    // .kta-cfg-raison, peuvent garder un emoji de message : hors contrôle).
    const icones = Array.prototype.map.call(m.querySelectorAll("[data-kta-ico]"), function (el) {
      const suite = el.nextElementSibling;
      return { nom: el.getAttribute("data-kta-ico"), svg: !!el.querySelector("svg.kta-ico"),
        emoji: !!suite && /[\p{Extended_Pictographic}☑ℹ]/u.test(suite.textContent || "") };
    });
    return { titres: sondes(".kta-readme-modal-titre, .kta-cfg-group-titre, .kta-perf-titre"),
      boutons: sondes("#loaderNetLogBtn, #loaderNetDocBtn, #loaderMemInspectorBtn, #loaderDepannageBtn, " +
        "#kta-devmode-toggle, #loaderIncognitoIcon"), icones: icones };
  });
  const fC = cfg.titres.concat(cfg.boutons).filter(function (b) { return !b.svg || b.emoji; });
  const fI = cfg.icones.filter(function (b) { return !b.svg || b.emoji; });
  verifier(cfg.titres.length >= 12 && cfg.boutons.length === 6 && fC.length === 0, "Configuration : " +
    cfg.titres.length + " titres et " + cfg.boutons.length + " boutons en SVG, sans emoji", fC);
  verifier(cfg.icones.length >= 30 && fI.length === 0, "Configuration : " + cfg.icones.length +
    " icônes posées, libellés sans emoji", fI);
  await page.waitForTimeout(700);   // fondu d'ouverture de la fenêtre
  await capture(page, "1b-configuration");

  // Journal réseau, « Que fait l'app sur le réseau ? », Dépannage : titres et boutons.
  const fenetre = async function (ouvrir, selVisible, selControles, nom, fermer) {
    await page.evaluate(ouvrir);
    await page.waitForSelector(selVisible, { state: "visible", timeout: 6000 }).catch(function () {});
    await page.waitForTimeout(300);
    const r = await page.evaluate(function (sel) {
      return Array.prototype.filter.call(document.querySelectorAll(sel), function (el) {
        return el.offsetParent !== null;
      }).map(function (el) { return Object.assign({ t: (el.textContent || "").trim().slice(0, 30) }, window.__ktaSonde(el)); });
    }, selControles);
    const f = r.filter(function (b) { return !b.svg || b.emoji; });
    verifier(r.length >= 2 && f.length === 0, nom + " : " + r.length + " titres et boutons en SVG, sans emoji", f);
    await capture(page, "1c-" + nom.replace(/[^\wé]+/g, "-").toLowerCase());
    await page.evaluate(fermer);
    await page.waitForTimeout(300);
  };
  await fenetre(function () { document.getElementById("loaderNetLogBtn").click(); }, "#loaderNetLogModal",
    "#loaderNetLogModal .kta-readme-modal-titre, #loaderNetLogCopy, #loaderNetLogExport, #loaderNetLogClear",
    "Journal réseau", function () { document.getElementById("loaderNetLogClose").click(); });
  await fenetre(function () { document.getElementById("loaderNetDocBtn").click(); }, "#loaderNetDocModal",
    "#loaderNetDocModal .kta-readme-modal-titre, #loaderNetDocModal .kta-net-doc-section-titre:not(.kta-cnx-bloc-titre), " +
    "#loaderNetDocOpenFull", "Réseau expliqué", function () { document.getElementById("loaderNetDocClose").click(); });
  await fenetre(function () { window.ktaOuvrirDepannage(); }, "#kta-depannage-modal",
    "#kta-depannage-modal .kta-readme-modal-titre, #loaderForceUpdateBtn, #loaderKillSwBtn, #loaderResetBtn",
    "Dépannage", function () { document.getElementById("kta-depannage-close").click(); });
  await page.evaluate(function () { document.getElementById("loaderConfigClose").click(); });
  await page.waitForTimeout(300);

  // 1d. Fin de la refonte (accueil) : pied de page et crédits, fenêtre Profil (stats, bandeau, actions), export du
  //     profil (lignes de section, boutons). Les médailles des rangs et des hauts faits restent des emoji.
  const pied = await page.evaluate(function () {
    return [".kta-loader-contact", ".kta-loader-credits:not(.kta-loader-contact)", "#loaderCnxChip"].map(function (s) {
      const el = document.querySelector(s);
      return el ? Object.assign({ s: s, n: el.querySelectorAll("svg.kta-ico").length }, window.__ktaSonde(el)) : { s: s, absent: true };
    });
  });
  const piedFautes = pied.filter(function (p) { return p.absent || p.emoji || (p.s !== "#loaderCnxChip" && p.n < 3); });
  verifier(piedFautes.length === 0, "accueil : pied de page (contacts, crédits) et pastille de connexion en SVG, sans emoji",
    piedFautes);
  await page.evaluate(function () { const b = document.getElementById("kta-loader-profile-bar"); if (b) b.click(); });
  await attendre(page, function () { return !!document.querySelector("#kta-profile-details-modal .kta-profile-stat-cell"); }, 10000);
  await page.waitForTimeout(800);
  const profil = await page.evaluate(function () {
    const m = document.getElementById("kta-profile-details-modal");
    if (!m) return null;
    return Array.prototype.filter.call(m.querySelectorAll(".kta-readme-modal-titre, .kta-btn, .kta-profile-stat-lbl, " +
      ".kta-profile-barstats-header, .kta-profile-barstats-cb > span, .kta-profile-details-section-titre, " +
      ".kta-profile-plansstats-header, .kta-feats-head, .kta-feats-sptitle, .kta-feat-fam, .kta-feat-sp"), function (el) {
      return el.offsetParent !== null && (el.textContent || "").trim();
    }).map(function (el) { return Object.assign({ t: el.textContent.trim().slice(0, 30) }, window.__ktaSonde(el)); });
  });
  const profilFautes = (profil || []).filter(function (b) { return !b.svg || b.emoji; });
  verifier(!!profil && profil.length >= 12 && profilFautes.length === 0, "Profil : " + (profil ? profil.length : 0) +
    " titres, boutons, libellés, familles et spéciaux des hauts faits en SVG, sans emoji", profilFautes);
  // Les médailles des paliers restent des emoji (récompenses colorées, lot police emoji).
  const medailles = await page.evaluate(function () {
    return document.querySelectorAll("#kta-profile-details-modal .kta-feat-badge").length;
  });
  verifier(medailles >= 32, "Profil : " + medailles + " médailles de palier (emoji gardés)");
  await capture(page, "1d-profil");
  await page.evaluate(function () { const x = document.getElementById("kta-profile-details-close"); if (x) x.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(function () { window.ProfileExportImport.ouvrirExportModale(); });
  await attendre(page, function () { return !!document.querySelector("#kta-profile-export-modal .kta-profile-row"); }, 15000);
  const exportProfil = await page.evaluate(function () {
    const m = document.getElementById("kta-profile-export-modal");
    const lignes = Array.prototype.map.call(m.querySelectorAll(".kta-profile-row-emoji"), function (el) {
      return window.__ktaSonde(el);
    });
    const autres = Array.prototype.map.call(m.querySelectorAll(".kta-readme-modal-titre, #kta-profile-export-go"),
      function (el) { return window.__ktaSonde(el); });
    return lignes.concat(autres);
  });
  const expFautes = exportProfil.filter(function (b) { return !b.svg || b.emoji; });
  verifier(exportProfil.length >= 12 && expFautes.length === 0, "Exporter mon profil : " + exportProfil.length +
    " lignes, titre et bouton en SVG, sans emoji", expFautes);
  await capture(page, "1d-export-profil");
  await page.evaluate(function () { const x = document.getElementById("kta-profile-export-close"); if (x) x.click(); });
  await page.waitForTimeout(300);

  // 2. Ouvrir un plan (relevé fictif s'il est proposé, sinon le premier de la liste).
  const choisi = await page.evaluate(function () {
    const noms = Array.prototype.slice.call(document.querySelectorAll(".plan-row-name-text"));
    const n = noms.find(function (e) { return /fictif/i.test(e.textContent); }) || noms[0];
    if (!n) return false;
    n.click();
    return true;
  });
  if (!choisi) throw new Error("aucun plan proposé à l'accueil");
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window._groupes &&
    !!window._groupes.tracker; }, 30000);
  await page.waitForTimeout(3000);
  await page.evaluate(SONDE);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });

  // 3. Barre de la carte : boutons de groupe, sous-actions des accordéons, bouton de la vue 3D.
  const barre = await page.evaluate(function (ids) {
    const G = window._groupes || {};
    const groupes = ids.map(function (id) {
      return Object.assign({ id: id }, window.__ktaSonde(G[id] && G[id].btnPrincipal));
    });
    const subs = [];
    ["aide", "history", "mesure"].forEach(function (id) {
      (G[id] && G[id].subActions || []).forEach(function (b, i) { subs.push(Object.assign({ id: id + "#" + i }, window.__ktaSonde(b))); });
    });
    const v3d = window.__ktaSonde(document.querySelector(".kta-vue3d-ctrl a"));
    return { groupes: groupes, subs: subs, v3d: v3d };
  }, GROUPES);
  const fG = barre.groupes.filter(function (b) { return !b.svg || b.emoji; });
  verifier(fG.length === 0, "carte : " + GROUPES.length + " boutons de groupe en SVG, sans emoji", fG);
  const fS = barre.subs.filter(function (b) { return !b.svg || b.emoji; });
  verifier(barre.subs.length >= 9 && fS.length === 0, "carte : " + barre.subs.length +
    " sous-actions (aide, historique, mesure) en SVG, sans emoji", fS);
  verifier(barre.v3d.svg && !barre.v3d.emoji, "carte : bouton de la vue 3D en SVG", barre.v3d);

  // État actif : Mesure de distance armée → le groupe porte le liseré doré, l'icône suit la couleur du bouton.
  await page.evaluate(function () { window._groupes.mesure.btnPrincipal.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(function () { window._groupes.mesure.subActions[0].click(); });
  await page.waitForTimeout(300);
  const actif = await page.evaluate(function () {
    const b = window._groupes.mesure.btnPrincipal, s = b.querySelector("svg");
    return { actif: b.classList.contains("kta-group-mode-actif"), trait: s && getComputedStyle(s).stroke,
      couleur: getComputedStyle(b).color, larg: s && s.getBoundingClientRect().width };
  });
  verifier(actif.actif && actif.larg >= 14 && actif.larg <= 24, "carte : Mesure armée, groupe en mode actif, icône de " +
    Math.round(actif.larg || 0) + " px", actif);
  await capture(page, "2-carte");
  await page.evaluate(function () { window._groupes.mesure.subActions[0].click(); });

  // 4. Fenêtre Tracker.
  await page.evaluate(function () { window.ouvrirMenuTracker(); });
  await attendre(page, function () { return !!document.querySelector("#kta-tracker-modal .kta-tracker-modal-tile"); }, 5000);
  const trk = await page.evaluate(function () {
    const o = document.getElementById("kta-tracker-modal");
    const tuiles = Array.prototype.map.call(o.querySelectorAll(".kta-tracker-modal-tile"), function (t) {
      return Object.assign({ l: t.querySelector(".kta-tracker-modal-tile-label").textContent },
        window.__ktaSonde(t.querySelector(".kta-tracker-modal-tile-icon")));
    });
    const titre = window.__ktaSonde(o.querySelector(".kta-tracker-modal-title > span"));
    const boussole = tuiles.find(function (t) { return /boussole/i.test(t.l); });
    const iconeBoussole = Array.prototype.find.call(o.querySelectorAll(".kta-tracker-modal-tile"), function (t) {
      return /boussole/i.test(t.textContent);
    });
    const svgB = iconeBoussole && iconeBoussole.querySelector("svg");
    return { tuiles: tuiles, titre: titre, boussole: !!boussole,
      boussoleCompass: !!svgB && svgB.classList.contains("kta-ico-compass") };
  });
  const fT = trk.tuiles.filter(function (t) { return !t.svg || t.emoji; });
  verifier(trk.tuiles.length >= 10 && fT.length === 0, "Tracker : " + trk.tuiles.length + " tuiles en SVG, sans emoji", fT);
  verifier(trk.titre.svg && !trk.titre.emoji, "Tracker : icône du titre en SVG");
  verifier(trk.boussoleCompass, "Tracker : la tuile Boussole porte l'icône compass (plus le 🧭 du groupe)");
  await capture(page, "3-tracker");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 5. Lanceur d'export.
  await page.evaluate(function () { window._groupes.save.btnPrincipal.click(); });
  await attendre(page, function () { return !!document.querySelector("#kta-export-lanceur .kta-tracker-modal-tile"); }, 5000);
  const exp = await page.evaluate(function () {
    const o = document.getElementById("kta-export-lanceur");
    return Array.prototype.map.call(o.querySelectorAll(".kta-tracker-modal-tile"), function (t) {
      return Object.assign({ l: t.textContent.trim().slice(0, 30) }, window.__ktaSonde(t.querySelector(".kta-tracker-modal-tile-icon")));
    });
  });
  const fE = exp.filter(function (t) { return !t.svg || t.emoji; });
  verifier(exp.length === 10 && fE.length === 0, "export : " + exp.length + " tuiles en SVG, sans emoji", fE);
  const sections = await page.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll("#kta-export-lanceur .kta-tracker-modal-section-title"),
      function (t) { return Object.assign({ l: t.textContent.trim() }, window.__ktaSonde(t)); });
  });
  const fSec = sections.filter(function (t) { return !t.svg || t.emoji; });
  verifier(sections.length === 4 && fSec.length === 0, "export : " + sections.length +
    " titres de section en SVG, sans emoji", fSec);
  await capture(page, "4-export");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 8. Fenêtres d'outils de la carte : titre, titres de section et boutons migrés portent leur SVG, sans emoji.
  //    Chaque fenêtre est ouverte par son point d'entrée public, sondée, puis fermée par son ✕ (ou Échap).
  const OUTILS = [
    { nom: "Réglages du plan", ouvrir: ["afficherConfig"], fen: "#kta-cfg-modal", min: 8,
      sel: ".kta-readme-modal-titre, .kta-cfg-group-titre, #cfg_georef_open, #cfg_globaux_home, #kta-cfg-calib-echelle",
      fermer: "#kta-cfg-close" },
    { nom: "Filtres", ouvrir: ["FilterPanel.ouvrir"], fen: "#kta-fp-modal", min: 4,
      sel: ".kta-fp-section-titre, #kta-fp-reset-all", fermer: "#kta-fp-close" },
    { nom: "Légende", ouvrir: ["afficherLegende"], fen: ".kta-legende-modal-boite", min: 3,
      sel: ".kta-readme-modal-titre, .kta-aide-section-titre, #kta-legende-modifier", fermer: "#kta-legende-close" },
    { nom: "Distance totale", ouvrir: ["ouvrirRoadsDistanceFloater"], fen: ".kta-rd-modal-boite", min: 2,
      sel: ".kta-readme-modal-titre, #kta-rd-erase", fermer: "#kta-rd-close" },
    { nom: "Boussole", ouvrir: ["CompassWidget.openFull"], fen: ".kta-compass-full-boite", min: 1,
      sel: ".kta-readme-modal-titre", fermer: "#kta-compass-full-close" },
    { nom: "Heatmap", ouvrir: ["MyKTAMapHeatmap.ouvrirModale"], fen: "#kta-heatmap-modal", min: 4,
      sel: ".kta-readme-modal-titre, .kta-heatmap-section-titre, #kta-hm-appliquer, #kta-hm-effacer",
      fermer: "#kta-heatmap-close" },
    { nom: "Export PNG", ouvrir: ["ouvrirExportModal"], fen: "#kta-export-modal", min: 3,
      sel: ".kta-readme-modal-titre, .kta-conv-sens-label, #kta-export-go", fermer: "#kta-export-close" },
    { nom: "Export PDF", ouvrir: ["MyKTAMapPdfExport.afficherModale"], fen: "#kta-pdf-modal", min: 6,
      sel: ".kta-readme-modal-titre, .kta-ses-section-title, #kta-pdf-generer", fermer: "#kta-pdf-close" },
    { nom: "Export GeoTIFF", ouvrir: ["GeotiffExport.afficherModale"], fen: "#kta-geotiff-modal", min: 2,
      sel: ".kta-readme-modal-titre, #kta-geotiff-go", fermer: "#kta-geotiff-close" },
    { nom: "Export complet", ouvrir: ["ouvrirExportSessionModal", "full", true], fen: "#kta-ses-close", min: 1,
      sel: ".kta-readme-modal-titre", fermer: "#kta-ses-close", racine: "body" },
    { nom: "Recherche", ouvrir: ["ouvrirRecherche"], fen: "#kta-search-close", min: 1,
      sel: "#kta-search-modal .kta-readme-modal-titre, #kta-search-modal [data-filter-type='kind']",
      fermer: "#kta-search-close", racine: "body" },
    { nom: "Statistiques", ouvrir: ["StatsGlobales.ouvrir"], fen: "#kta-stats-glob-close", min: 5,
      sel: ".kta-readme-modal-titre, #kta-stats-glob-refresh, #kta-stats-glob-csv, #kta-stats-glob-pdf, " +
        "#kta-stats-glob-copy", fermer: "#kta-stats-glob-close", racine: "body" },
    { nom: "Carnet", ouvrir: ["JournalUi.ouvrir"], fen: "#kta-jrn-close", min: 3,
      sel: ".kta-readme-modal-titre, .kta-jrn-onglet", fermer: "#kta-jrn-close", racine: "body" },
    { nom: "Itinéraire", ouvrir: ["ouvrirItinerairModal"], fen: "#kta-itinerary-modal", min: 6,
      sel: ".kta-readme-modal-titre, .kta-iti-section-titre, #kta-iti-mode-click, #kta-iti-tracker-pos, #kta-iti-clear, " +
        "#kta-iti-compute", fermer: "#kta-iti-close" },
    { nom: "Je suis perdu", ouvrir: ["LostMode.open"], fen: "#kta-lost-modal", min: 2,
      sel: ".kta-readme-modal-titre, #kta-lost-calc, #kta-lost-fermer", fermer: "#kta-lost-close" },
    { nom: "Mode Secours", ouvrir: ["SecoursMode.ouvrir"], fen: "#kta-secours-modal", min: 3,
      sel: ".kta-readme-modal-titre, [data-action='new-scenario'], [data-action='import-mkmsec']",
      fermer: "#kta-secours-close" },
    { nom: "Éditeur de point", ouvrir: ["afficherFormulaire", 120, 120], fen: "#kta-poi-modal", min: 4,
      sel: ".kta-readme-modal-titre, .kta-aide-section-titre:not(:empty), #kta-poi-valider", fermer: "#kta-poi-close",
      seulsMigres: true },
    { nom: "Raccourcis", ouvrir: ["ShortcutsCheatsheet.ouvrir"], fen: "#kta-cheatsheet-modal", min: 3,
      sel: ".kta-cheat-row[data-ligne^='outil.'] .kta-cheat-label", fermer: "#kta-cheatsheet-close", racine: "body" }
  ];
  for (const o of OUTILS) {
    // Point d'entrée résolu sur window (pas d'eval : la CSP de l'app le refuse).
    await page.evaluate(function (o) {
      const parts = o[0].split("."), nomFn = parts.pop();
      const cible = parts.reduce(function (acc, p) { return acc ? acc[p] : null; }, window);
      try { if (cible && typeof cible[nomFn] === "function") cible[nomFn].apply(cible, o.slice(1)); } catch (e) { /* plan sans données */ }
    }, o.ouvrir);
    await page.waitForSelector(o.fen, { state: "attached", timeout: 6000 }).catch(function () {});
    await page.waitForTimeout(500);
    const r = await page.evaluate(function (a) {
      const racine = a.racine === "body" ? document : document.querySelector(a.fen);
      if (!racine) return null;
      return Array.prototype.filter.call(racine.querySelectorAll(a.sel), function (el) {
        return el.offsetParent !== null;
      }).map(function (el) { return Object.assign({ t: (el.textContent || "").trim().slice(0, 30) }, window.__ktaSonde(el)); });
    }, { fen: o.fen, sel: o.sel, racine: o.racine });
    if (!r) { pb(o.nom + " : fenêtre introuvable (" + o.ouvrir[0] + ")"); continue; }
    // Éditeur : le titre « Description » n'a jamais eu d'emoji ni d'icône (seuls les titres migrés comptent).
    const vus = o.seulsMigres ? r.filter(function (b) { return b.svg || b.emoji; }) : r;
    const f = vus.filter(function (b) { return !b.svg || b.emoji; });
    verifier(vus.length >= o.min && f.length === 0, "carte · " + o.nom + " : " + vus.length +
      " titre(s) et bouton(s) en SVG, sans emoji", f);
    await capture(page, "8-" + o.nom.replace(/[^\wéÉè]+/g, "-").toLowerCase());
    await page.evaluate(function (sel) { const b = document.querySelector(sel); if (b) b.click(); }, o.fermer);
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape").catch(function () {});
    await page.waitForTimeout(200);
  }

  // 9. Lot C3 : barres du haut et du bas, fiche d'un point, bouton d'aide des fenêtres, confirmations, Mode Secours
  //    (vue opérateur et secouriste), vue 3D, Vue OSM, Générateur, Tableur, Mes photos, tutoriel.
  const sonder = function (sel, racine) {
    return page.evaluate(function (a) {
      const r = a.racine ? document.querySelector(a.racine) : document;
      if (!r) return null;
      return Array.prototype.filter.call(r.querySelectorAll(a.sel), function (el) {
        return el.offsetParent !== null || el.closest("#kta-refonte-header, #kta-refonte-statusbar");
      }).map(function (el) { return Object.assign({ t: (el.textContent || "").trim().slice(0, 30) }, window.__ktaSonde(el)); });
    }, { sel: sel, racine: racine || null });
  };
  const exiger = function (nom, r, min) {
    if (!r) { pb(nom + " : introuvable"); return; }
    const f = r.filter(function (b) { return !b.svg || b.emoji; });
    verifier(r.length >= min && f.length === 0, nom + " : " + r.length + " icône(s) en SVG, sans emoji", f);
  };
  exiger("barre du haut", await sonder("#kta-refonte-header .kta-refonte-counter-icon"), 7);
  exiger("barre du bas", await sonder("#kta-refonte-statusbar .kta-refonte-stat-icon"), 4);
  const urgence = await page.evaluate(function () {
    const s = document.querySelector("#kta-refonte-counter-sortie svg");
    return !!s && s.classList.contains("kta-ico-siren");
  });
  verifier(urgence, "barre du haut : Sortie d'urgence = siren (la même que la vue 3D)");
  await capture(page, "9-barres");

  // Fiche d'un point de session, rendue par l'app (utils.js > buildPointPopupHtml).
  const fiche = await page.evaluate(function () {
    const d = document.createElement("div");
    d.id = "kta-sonde-fiche";
    d.className = "leaflet-popup-content";
    d.innerHTML = window.buildPointPopupHtml({ uid: "pt_sonde", id: "sonde", nom: "Sonde", x: 10, y: 10, tags: [] }, true,
      { layerId: "editor", layerLabel: "x" });
    document.body.appendChild(d);
    const r = Array.prototype.map.call(d.querySelectorAll(".kta-popup-btn"), function (b) {
      return Object.assign({ t: b.textContent.trim().slice(0, 20) }, window.__ktaSonde(b));
    });
    d.remove();
    return r;
  });
  exiger("fiche d'un point (boutons)", fiche, 6);

  // Bouton d'aide des fenêtres (circle-help) et icône d'une confirmation.
  await page.evaluate(function () { window.ouvrirItinerairModal(); });
  await page.waitForTimeout(500);
  const aideBtn = await page.evaluate(function () {
    const b = document.querySelector("#kta-itinerary-modal .kta-aide-ctx-btn");
    return b ? Object.assign({ circle: !!b.querySelector("svg.kta-ico-circle-help") }, window.__ktaSonde(b)) : null;
  });
  verifier(!!aideBtn && aideBtn.circle && !aideBtn.emoji, "bouton d'aide d'une fenêtre : icône circle-help, sans emoji", aideBtn);
  await page.evaluate(function () { const b = document.getElementById("kta-iti-close"); if (b) b.click(); });
  await page.waitForTimeout(300);

  // Mode Secours : vue opérateur puis secouriste (bandeau, barre d'outils, titres).
  const secours = async function (role, nom) {
    const id = await page.evaluate(function (role) {
      const S = window.SecoursMode;
      const s = S.create("Sonde " + role);
      S.addGroupe(s.id, "Équipe 1");
      S.rejoindre(s.id, { role: role });
      S.ouvrir(s.id);
      return s.id;
    }, role);
    await page.waitForTimeout(900);
    const r = await sonder("#kta-secours-modal .kta-readme-modal-titre, #kta-secours-modal button.kta-btn:not([data-action^='statut'])" +
      ":not(.kta-secours-live-step), #kta-secours-modal .kta-secours-tool-block-titre");
    const f = (r || []).filter(function (b) { return b.emoji; });
    verifier(!!r && r.length >= 4 && f.length === 0, "Mode Secours (" + nom + ") : " + (r ? r.length : 0) +
      " titres et boutons sans emoji", f);
    const svg = (r || []).filter(function (b) { return b.svg; }).length;
    verifier(svg >= 4, "Mode Secours (" + nom + ") : " + svg + " icônes SVG");
    await capture(page, "9-secours-" + role);
    await page.evaluate(function (id) { window.SecoursMode.fermer(); try { window.SecoursMode.delete(id); } catch (e) { /* déjà retiré */ } }, id);
    await page.waitForTimeout(400);
  };
  await secours("operateur", "opérateur");
  await secours("secouriste", "secouriste");

  // Vue 3D : rangée du haut, tuile des réglages (hors Boussole, image de la rose de la carte, et choix de niveaux en
  // texte), pastille de mode.
  // Par le bouton de la carte (le même chemin que l'utilisateur ; la vue choisit sa place de départ).
  await page.evaluate(function () { const a = document.querySelector(".kta-vue3d-ctrl a"); if (a) a.click(); });
  const ouvre3d = await page.waitForSelector("#kta-vue3d .kta-v3d-haut", { state: "attached", timeout: 20000 })
    .then(function () { return true; }, function () { return false; });
  if (ouvre3d) {
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.querySelector('#kta-vue3d [data-v3d="reglages"]'); if (b) b.click(); });
    await page.waitForTimeout(400);
    exiger("vue 3D : rangée du haut", await sonder("#kta-vue3d .kta-v3d-haut > button:not(.kta-v3d-fermer):not(.kta-v3d-filtres)"), 4);
    exiger("vue 3D : tuile des réglages", await sonder("#kta-vue3d .kta-v3d-reglages button.kta-v3d-btn-mode:not(.kta-v3d-btn-boussole):not(.kta-v3d-btn-niveaux), " +
      "#kta-vue3d .kta-v3d-curseur-nom"), 8);
    exiger("vue 3D : pastille de mode", await sonder("#kta-vue3d .kta-v3d-mode-indic"), 1);
    await capture(page, "9-vue3d");
    await page.evaluate(function () { window.KtaVue3D.fermer(); });
    await page.waitForTimeout(600);
  } else pb("vue 3D : ouverture impossible");

  // Générateur, Tableur, Mes photos, tutoriel.
  const FEN = [
    { nom: "Générateur", ouvrir: ["afficherPlanner"], fen: "#kta-planner-modal", min: 4,
      sel: ".kta-readme-modal-titre, .kta-aide-section-titre, .kta-planner-mode-btn", fermer: "#kta-planner-close" },
    { nom: "Tableur", ouvrir: ["ouvrirTableEditor"], fen: "#kta-tbl-modal", min: 4,
      sel: ".kta-tbl-source-ico, .kta-readme-modal-titre", fermer: "#kta-tbl-close", racine: "body" },
    { nom: "Mes photos", ouvrir: ["KtaPhotosGalerie.ouvrir"], fen: "#kta-phg-modal", min: 1,
      sel: "#kta-phg-modal .kta-readme-modal-titre", fermer: "[data-phg='fermer']", racine: "body" }
  ];
  for (const o of FEN) {
    await page.evaluate(function (o) {
      const parts = o[0].split("."), nomFn = parts.pop();
      const cible = parts.reduce(function (acc, p) { return acc ? acc[p] : null; }, window);
      try { if (cible && typeof cible[nomFn] === "function") cible[nomFn].apply(cible, o.slice(1)); } catch (e) { /* hors sujet */ }
    }, o.ouvrir);
    await page.waitForSelector(o.fen, { state: "attached", timeout: 6000 }).catch(function () {});
    await page.waitForTimeout(600);
    exiger(o.nom, await sonder(o.sel, o.racine === "body" ? null : o.fen), o.min);
    await capture(page, "9-" + o.nom.replace(/[^\wéÉè]+/g, "-").toLowerCase());
    await page.evaluate(function (sel) { const b = document.querySelector(sel); if (b) b.click(); }, o.fermer);
    await page.waitForTimeout(300);
    // Générateur : « Quitter le générateur ? » (saisie en cours) — on quitte.
    await page.evaluate(function () { const b = document.getElementById("kta-confirm-oui"); if (b) b.click(); });
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape").catch(function () {});
    await page.waitForTimeout(200);
  }

  // Tutoriel : icône de carte en SVG ; dans le texte, chaque emoji est un SVG (bouton ou notion), sauf exception.
  await page.evaluate(function () { window.Tutorial.ouvrir(); });
  await page.waitForTimeout(600);
  const tuto = [];
  for (let i = 0; i < 11; i++) {
    tuto.push(await page.evaluate(function () {
      const K = window.KtaIcones, carte = document.querySelector("#kta-tutorial-corps .kta-tutorial-card");
      if (!carte) return null;
      const texte = carte.querySelector(".kta-tutorial-card-texte");
      const t = texte.textContent.replace(/\uFE0F/g, "");
      const migres = K.classerDoc(t).filter(function (o) { return o.icone || o.notion; }).length;   // emoji substituable resté
      return { ico: !!carte.querySelector(".kta-tutorial-card-emoji svg.kta-ico"), svg: texte.querySelectorAll("svg.kta-ico-doc").length,
        reste: migres };
    }));
    if (i === 4) await capture(page, "9-tutoriel");
    await page.evaluate(function () { const b = document.getElementById("kta-tutorial-next"); if (b) b.click(); });
    await page.waitForTimeout(250);
  }
  const tv = tuto.filter(Boolean);
  verifier(tv.length >= 10 && tv.every(function (c) { return c.ico; }), "tutoriel : " + tv.length + " cartes, icône de carte en SVG");
  const tSvg = tv.reduce(function (a, c) { return a + c.svg; }, 0), tReste = tv.reduce(function (a, c) { return a + c.reste; }, 0);
  verifier(tSvg >= 20 && tReste === 0, "tutoriel : " + tSvg + " icônes SVG dans le texte, " + tReste +
    " emoji substituable restant");
  await page.evaluate(function () { window.Tutorial.fermer(); });
  await page.waitForTimeout(300);

  // Vue OSM (plan géoréférencé seulement) : contrôles en SVG.
  const osm = await page.evaluate(function () {
    try { if (window.OsmView && window.OsmView.setOptedIn) window.OsmView.setOptedIn(true); } catch (e) { /* option */ }
    if (!window.OsmView || !window.OsmView.isAvailable || !window.OsmView.isAvailable()) return false;
    try { window.OsmView.open(); return true; } catch (e) { return false; }
  });
  if (osm) {
    await page.waitForTimeout(2500);
    exiger("Vue OSM", await sonder("#kta-osm-view-overlay .kta-readme-modal-titre, #kta-osm-view-overlay button.kta-btn"), 3);
    await capture(page, "9-vue-osm");
    await page.evaluate(function () { try { window.OsmView.close(); } catch (e) { /* déjà fermée */ } });
    await page.waitForTimeout(400);
  } else console.log("  ℹ️ Vue OSM : plan non géoréférencé ou vue indisponible, sondage sauté");

  // 10. Fin de la refonte (carte) : sélection multiple (bandeau), recalage sur un autre scan (titre, onglets,
  //     boutons), rapport de session, raccourcis clavier, recherche multi-plans, Mes liaisons, calibrer l'échelle.
  const fenetreC4 = async function (ouvrir, selRacine, selControles, nom, min) {
    await page.evaluate(ouvrir);
    await attendre(page, new Function("return !!document.querySelector(" + JSON.stringify(selRacine) + ");"), 8000)
      .catch(function () {});
    await page.waitForTimeout(500);
    exiger(nom, await sonder(selControles), min);
    await capture(page, "10-" + nom.replace(/[^\wé]+/g, "-").toLowerCase());
  };
  const fermerOverlay = function (sel) {
    return page.evaluate(function (s) { const o = document.querySelector(s); if (o) o.remove(); }, sel);
  };
  await page.evaluate(function () { window.SelectionMulti.ouvrir(); });
  await page.waitForTimeout(500);
  exiger("sélection multiple (bandeau)", await sonder("#kta-selm-floater .kta-iti-floater-icon, #kta-selm-zone, " +
    "#kta-selm-niveau, #kta-selm-suppr"), 2);
  await page.evaluate(function () { window.SelectionMulti.fermer(); });
  await fenetreC4(function () { window.ktaOuvrirRecalageScan(); }, ".kta-recal-boite",
    ".kta-recal-boite .kta-readme-modal-titre, .kta-recal-boite .kta-recal-onglet, .kta-recal-boite .kta-recal-fichier, " +
    "#kta-recal-go, #kta-recal-apercu", "recalage sur un autre scan", 4);
  await page.evaluate(function () { const x = document.getElementById("kta-recal-close"); if (x) x.click(); });
  await fenetreC4(function () { window.SessionReport.ouvrirModal(); }, "#kta-report-modal",
    "#kta-report-modal .kta-readme-modal-titre, #kta-report-modal .kta-aide-section-titre, " +
    "#kta-report-modal .kta-report-cb-row, #kta-report-modal .kta-report-actions .kta-btn", "rapport de session", 12);
  await fermerOverlay("#kta-report-modal");
  await fenetreC4(function () { window.ShortcutsCheatsheet.ouvrir(); }, "#kta-cheatsheet-close",
    ".kta-readme-modal-titre", "raccourcis clavier", 1);
  await page.evaluate(function () { const x = document.getElementById("kta-cheatsheet-close"); if (x) x.click(); });
  await fenetreC4(function () { window.CrossPlanSearch.ouvrir(); }, ".kta-xps-multihop, .kta-readme-modal-titre",
    ".kta-readme-modal-overlay:last-of-type .kta-readme-modal-titre, .kta-xps-multihop > span", "recherche multi-plans", 1);
  await page.evaluate(function () {
    document.querySelectorAll(".kta-readme-modal-overlay").forEach(function (o) { o.remove(); });
  });
  await fenetreC4(function () { window.InterPlanLinks.ouvrirGestionnaire(); }, "#kta-ipl-mgr-vlist",
    ".kta-readme-modal-overlay .kta-readme-modal-titre, #kta-ipl-mgr-vlist, #kta-ipl-mgr-vgraph", "Mes liaisons", 3);
  await page.evaluate(function () {
    document.querySelectorAll(".kta-readme-modal-overlay").forEach(function (o) { o.remove(); });
  });
  await fenetreC4(function () { window.ouvrirCalibrageEchelle(); }, "#kta-calib-close",
    ".kta-readme-modal-overlay .kta-readme-modal-titre, .kta-readme-modal-overlay .kta-aide-section-titre",
    "calibrer l'échelle", 2);
  await page.evaluate(function () { const x = document.getElementById("kta-calib-close"); if (x) x.click(); });
  await page.waitForTimeout(300);

  // 6. Documentation, trois guides : chaque emoji rendu en SVG (bouton ou notion), sauf les exceptions GARDE ;
  //    titres (h1 à h5, sommaire compris) et fils d'Ariane : SVG, aucun emoji hors exception.
  for (const langue of ["fr", "en", "es"]) {
    await page.evaluate(function (l) {
      try { localStorage.setItem("myktamap_readme_lang", l); } catch (e) { /* stockage refusé */ }
      const m = document.getElementById("kta-readme-modal"); if (m) m.remove();
      window.afficherReadme();
    }, langue);
    await attendre(page, function () {
      return !!document.querySelector("#kta-readme-modal .kta-readme-corps h2 svg");
    }, 15000).catch(function () {});
    const doc = await page.evaluate(async function (l) {
      const K = window.KtaIcones, corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
      const toc = document.getElementById("kta-readme-toc-sidebar");
      if (!corps) return { absent: true };
      const fichier = "docs/applications/README_USER" + (l === "fr" ? "" : "." + l) + ".md";
      const md = await (await fetch(fichier, { cache: "no-store" })).text();
      const occ = K.classerDoc(md);
      const EMO = /\p{Extended_Pictographic}/gu;
      const compte = function (t) { return (String(t).match(EMO) || []).length; };
      const titresMd = md.split(/\r?\n/).filter(function (x) { return /^#{1,5} /.test(x); }).join("\n");
      const gardesTitres = K.classerDoc(titresMd).filter(function (o) { return o.garde; }).length;
      const titres = corps.querySelectorAll("h1, h2, h3, h4, h5");
      let emoTitres = 0, titresSvg = 0, titresAvecRepere = 0;
      titres.forEach(function (h) {
        emoTitres += compte(h.textContent);
        if (h.querySelector("svg.kta-ico-doc")) titresSvg++;
      });
      titresAvecRepere = K.classerDoc(titresMd).filter(function (o) { return o.icone || o.notion; }).length;
      // Fil d'Ariane : « Documentation › … › … » ou « Pour aller plus loin › … » rendu en texte.
      let filsEmoji = 0, fils = 0;
      corps.querySelectorAll("p, li, td, blockquote").forEach(function (el) {
        if (el.textContent.indexOf("›") < 0) return;
        fils++;
        const t = el.textContent.split("›").slice(0, -1).join("›");
        filsEmoji += compte(t.replace(/[⛔🟦🟩🟪🟨🟥🟧🟢🟡🟠🔵🟣⚪⬛▶◀↔©🚪⚠]/gu, ""));
      });
      return {
        svgs: corps.querySelectorAll("svg.kta-ico-doc").length,
        attenduSvg: occ.filter(function (o) { return o.icone || o.notion; }).length,
        restants: compte(corps.textContent),
        attenduGarde: occ.filter(function (o) { return o.garde; }).length,
        nonClasses: occ.filter(function (o) { return !o.icone && !o.notion && !o.garde; }).length,
        emoTitres: emoTitres, gardesTitres: gardesTitres, titresSvg: titresSvg, titresAvecRepere: titresAvecRepere,
        tocEmoji: toc ? compte(toc.textContent) : -1, tocSvg: toc ? toc.querySelectorAll("svg").length : 0,
        pied: (function () {
          const f = document.querySelector("#kta-readme-modal .kta-readme-modal-footer");
          return f ? { emoji: compte(f.textContent), svg: f.querySelectorAll("svg.kta-ico").length } : null;
        })(),
        fils: fils, filsEmoji: filsEmoji,
        h2Carte: (function () {
          const h = Array.prototype.find.call(corps.querySelectorAll("h2"), function (x) {
            return /Utiliser la carte|Using the map|Usar el mapa/.test(x.textContent);
          });
          const s = h && h.querySelector("svg");
          return s ? K.noms().filter(function (n) { return s.classList.contains("kta-ico-" + n); })[0] : null;
        })(),
        taille: (function () {
          const h = corps.querySelector("h2 svg.kta-ico-doc"), li = corps.querySelector("li svg.kta-ico-doc");
          const r = function (s) {
            if (!s) return null;
            const b = s.getBoundingClientRect(), p = s.parentElement.getBoundingClientRect();
            const fs = parseFloat(getComputedStyle(s.parentElement).fontSize);
            return { h: Math.round(b.height * 10) / 10, fs: fs, haut: Math.round(b.top - p.top), bas: Math.round(p.bottom - b.bottom),
              couleur: getComputedStyle(s).color };
          };
          return { h2: r(h), li: r(li) };
        })()
      };
    }, langue);
    const p = "Documentation (" + langue + ") : ";
    verifier(!doc.absent && doc.nonClasses === 0, p + "aucun emoji non classé dans le guide", doc.nonClasses);
    verifier(doc.svgs === doc.attenduSvg, p + doc.svgs + " icônes SVG posées = " + doc.attenduSvg + " emplois classés");
    verifier(doc.restants === doc.attenduGarde, p + doc.restants + " emoji restés dans le rendu = " + doc.attenduGarde +
      " exceptions listées (GARDE)");
    verifier(doc.emoTitres === doc.gardesTitres && doc.titresSvg >= doc.titresAvecRepere * 0.9,
      p + "titres h1 à h5 : " + doc.titresSvg + " avec SVG, " + doc.emoTitres + " emoji (exceptions " + doc.gardesTitres + ")");
    verifier(doc.tocSvg > 20 && doc.tocEmoji <= doc.gardesTitres, p + "sommaire : " + doc.tocSvg + " SVG, " + doc.tocEmoji +
      " emoji");
    verifier(doc.fils > 0 && doc.filsEmoji === 0, p + doc.fils + " lignes à fil d'Ariane, " + doc.filsEmoji + " emoji avant le dernier ›");
    verifier(doc.h2Carte === "map", p + "chapitre « Utiliser la carte » → icône map", doc.h2Carte);
    verifier(doc.pied && doc.pied.emoji === 0 && doc.pied.svg === 7, p + "crédits du pied de fenêtre en SVG", doc.pied);
    const t = doc.taille || {};
    verifier(t.h2 && t.li && t.h2.h >= t.h2.fs * 0.95 && t.h2.h <= t.h2.fs * 1.3 && t.li.h >= t.li.fs * 0.95 &&
      t.li.h <= t.li.fs * 1.3 && t.h2.h > t.li.h, p + "icône proportionnée au texte (h2 " + (t.h2 && t.h2.h) + " px pour " +
      (t.h2 && t.h2.fs) + ", puce " + (t.li && t.li.h) + " px pour " + (t.li && t.li.fs) + ")", t);
    if (langue === "fr") {
      await capture(page, "5-documentation");
      // Chapitre avec sous-titres : « Utiliser la carte ».
      await page.evaluate(function () {
        const sc = document.getElementById("kta-readme-corps-scroll");
        const h = Array.prototype.find.call(document.querySelectorAll("#kta-readme-modal .kta-readme-corps h2"), function (x) {
          return /Utiliser la carte/.test(x.textContent);
        });
        if (sc && h) sc.scrollTop = h.offsetTop - 10;
      });
      await page.waitForTimeout(300);
      await capture(page, "5-documentation-chapitre");
    }
  }
  await page.evaluate(function () {
    try { localStorage.setItem("myktamap_readme_lang", "fr"); } catch (e) { /* stockage refusé */ }
    const m = document.getElementById("kta-readme-modal"); if (m) m.remove();
  });

  // 7. Aide intégrée : hub (intro, catégories, lignes, raccourcis, « Autres ») puis chaque fiche : SVG partout,
  //    emoji restants = exceptions GARDE ; fiche « Menu Tracker » : Tracker / Boussole chacun SA bonne icône.
  await page.evaluate(function () { window.afficherAide(); });
  await attendre(page, function () { return !!document.querySelector("#kta-aide-modal .kta-aide-row"); }, 8000);
  const hub = await page.evaluate(function () {
    const m = document.getElementById("kta-aide-modal");
    const EMO = /\p{Extended_Pictographic}/u;
    const els = m.querySelectorAll(".kta-readme-modal-titre, .kta-aide-intro, .kta-aide-cat-titre, .kta-aide-row-titre");
    let emo = 0, svg = 0;
    els.forEach(function (el) { if (EMO.test(el.textContent)) emo++; if (el.querySelector("svg.kta-ico-doc")) svg++; });
    return { n: els.length, emo: emo, svg: svg };
  });
  verifier(hub.n >= 40 && hub.emo === 0 && hub.svg >= 40, "Aide (hub) : " + hub.n + " titres, " + hub.svg + " avec SVG, " +
    hub.emo + " avec emoji", hub);
  await page.waitForTimeout(500);   // fin du fondu d'ouverture avant la capture
  await capture(page, "6-aide-hub");
  const fiches = await page.evaluate(async function () {
    const K = window.KtaIcones, d = await (await fetch("lang/fr.json", { cache: "no-store" })).json();
    const slugs = Object.keys(d).filter(function (k) { return /^aide\.sec\.[^.]+\.titre$/.test(k); })
      .map(function (k) { return k.split(".")[2]; });
    const res = [];
    for (const slug of slugs) {
      if (!window.ktaOuvrirAideSection(slug)) continue;
      await new Promise(function (r) { setTimeout(r, 30); });
      const zone = document.querySelector("#kta-aide-submodal") || document.querySelector("#kta-aide-modal .kta-aide-fiche-vue");
      const texte = (d["aide.sec." + slug + ".titre"] || "") + "\n" + (d["aide.sec." + slug + ".html"] || "") + "\n" +
        (d["aide.sec." + slug + ".raccourci"] || "");
      const occ = K.classerDoc(texte);
      const rendu = zone ? (zone.textContent.match(/\p{Extended_Pictographic}/gu) || []).length : -1;
      res.push({ slug: slug, rendu: rendu, garde: occ.filter(function (o) { return o.garde; }).length,
        svg: zone ? zone.querySelectorAll("svg.kta-ico-doc").length : 0,
        attendu: occ.filter(function (o) { return o.icone || o.notion; }).length });
      const x = document.getElementById("kta-aide-sub-close"); if (x) x.click();
    }
    return res;
  });
  const fFautes = fiches.filter(function (f) { return f.rendu !== f.garde || f.svg < f.attendu; });
  verifier(fiches.length >= 40 && fFautes.length === 0, "Aide (fiches) : " + fiches.length + " fiches, " +
    fiches.reduce(function (a, f) { return a + f.svg; }, 0) + " SVG, emoji restants = exceptions (" +
    fiches.reduce(function (a, f) { return a + f.rendu; }, 0) + ")", fFautes);
  await page.evaluate(function () { window.ktaOuvrirAideSection("menu-tracker"); });
  await page.waitForTimeout(600);
  const aide = await page.evaluate(function () {
    const K = window.KtaIcones;
    const zone = document.querySelector("#kta-aide-submodal") || document.querySelector("#kta-aide-modal .kta-aide-fiche-vue");
    if (!zone) return { zone: false };
    const nom = function (s) { return K.noms().filter(function (n) { return s.classList.contains("kta-ico-" + n); })[0]; };
    const suivi = function (re) {
      const s = Array.prototype.find.call(zone.querySelectorAll("svg.kta-ico-doc"), function (x) {
        let t = "", n = x.nextSibling;
        while (n && t.length < 30) { t += n.textContent || ""; n = n.nextSibling; }
        return re.test(t);
      });
      return s ? nom(s) : null;
    };
    const cat = Array.prototype.some.call(document.querySelectorAll("#kta-aide-modal .kta-aide-cat-titre svg.kta-ico-doc"),
      function (s) { return nom(s) === "settings"; });
    return { zone: true, tracker: suivi(/^\s*Tracker/), boussole: suivi(/^\s*Boussole/), cat: cat,
      fil: suivi(/^\s*Tracker de position/) };
  });
  verifier(aide.zone && aide.tracker === "navigation", "Aide : « 🧭 Tracker » → icône navigation", aide);
  verifier(aide.boussole === "compass", "Aide : « 🧭 Boussole » → icône compass", aide.boussole);
  verifier(aide.cat, "Aide : titre de catégorie « ⚙️ Réglages… » avec l'icône settings");
  verifier(aide.fil === "navigation", "Aide : fil d'Ariane « › 📍 Tracker de position » → icône navigation", aide.fil);
  await capture(page, "6-aide");

  // 11. ConfAdmin (page à part) : titres, boutons, colonnes et rubriques en SVG, sans emoji.
  await page.goto(BASE + "/confadmin.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!document.querySelector("h1 svg.kta-ico"); }, 10000).catch(function () {});
  await page.evaluate(SONDE);
  const ca = await page.evaluate(function () {
    return Array.prototype.filter.call(document.querySelectorAll("h1, h2, button.kta-ca-btn, th, summary strong, " +
      ".kta-ca-accueil > span > strong, #caAddons > span > strong"), function (el) {
      return /[\p{Extended_Pictographic}]/u.test(el.textContent) || !!el.querySelector("[data-kta-ico]");
    }).map(function (el) { return Object.assign({ t: el.textContent.trim().slice(0, 30) }, window.__ktaSonde(el)); });
  });
  const caFautes = ca.filter(function (b) { return !b.svg || b.emoji; });
  verifier(ca.length >= 15 && caFautes.length === 0, "ConfAdmin : " + ca.length + " titres, boutons et rubriques en SVG, " +
    "sans emoji", caFautes);
  await capture(page, "11-confadmin");
}

(async function main() {
  try {
    for (const moteur of nav.moteurs()) {
      for (const theme of ["dark", "light"]) {
        const navigateur = await nav.lancerMoteur(moteur);
        if (!navigateur) continue;
        prefixe = moteur + "-" + theme + " ";
        console.log("▶ " + moteur + " · thème " + theme);
        const page = await navigateur.newPage({ viewport: { width: 1200, height: 820 } });
        await page.addInitScript(function (a) {
          for (const k in a.ls) { try { localStorage.setItem(k, a.ls[k]); } catch (e) { /* stockage refusé */ } }
          try { localStorage.setItem("myktamap_theme_v1", a.theme); } catch (e) { /* idem */ }
        }, { ls: LS_PREGATES, theme: theme });
        page.on("pageerror", function (e) { pb("pageerror : " + e.message); });
        try { await jouer(page, theme); } catch (e) { pb("exception du harnais : " + (e && e.message)); }
        finally { await navigateur.close(); }
      }
    }
  } finally {
    server.close();
  }
  console.log(problemes.length ? "\n⚠️ " + problemes.length + " problème(s) :\n- " + problemes.join("\n- ")
    : "\n🎉 icônes de l'interface : SVG et doc alignés");
  process.exit(problemes.length ? 1 : 0);
})();
