#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-icones-ui.js — checkup (Playwright, pas un hook pré-commit) : icônes SVG de l'interface
// =====================================================================
// Dans l'app réelle, Chromium et WebKit, thème sombre puis clair : en-tête de l'accueil, titres de section, Outils et
// lignes de Mes plans, Configuration de l'accueil (titres, groupes, réglages) et ses fenêtres Journal réseau, réseau
// expliqué et Dépannage, barre de la carte (groupes et sous-actions des accordéons), fenêtre Tracker, lanceur
// d'export (tuiles et titres de section) → chaque contrôle migré porte un svg.kta-ico et aucun emoji. Documentation (fr) : « 🧭 Menu Tracker » et « 🧭 Boussole » montrent chacun SA bonne icône, et les
// emoji migrés restés dans la page sont exactement ceux listés « autre sens » (KtaIcones.AUTRE_SENS) : reste 0.
// Aide intégrée : fiche « Menu Tracker », même contrôle Tracker / Boussole.
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

  // 6. Documentation (fr) : bonnes icônes, et aucun emoji migré resté hors « autre sens ».
  await page.evaluate(function () { window.afficherReadme(); });
  await attendre(page, function () {
    return !!document.querySelector("#kta-readme-modal .kta-readme-corps h2");
  }, 15000);
  const doc = await page.evaluate(async function () {
    const K = window.KtaIcones, corps = document.querySelector("#kta-readme-modal .kta-readme-corps");
    const md = await (await fetch("docs/applications/README_USER.md", { cache: "no-store" })).text();
    const occ = K.classerDoc(md);
    const attenduSvg = occ.filter(function (o) { return o.icone; }).length;
    const attenduAutre = occ.filter(function (o) { return o.sens; }).length;
    const nonClasses = occ.filter(function (o) { return !o.icone && !o.sens; }).length;
    // Emoji migrés restés dans le rendu (sommaire exclu : il recopie les titres).
    const emojis = {};
    occ.forEach(function (o) { emojis[o.emoji] = true; });
    const texte = corps.textContent.replace(/️/g, "");
    let restants = 0;
    Object.keys(emojis).forEach(function (e) { restants += texte.split(e).length - 1; });
    const svgs = corps.querySelectorAll("svg.kta-ico-doc").length;
    const nomIcone = function (s) { return K.noms().filter(function (n) { return s.classList.contains("kta-ico-" + n); })[0]; };
    const titre = function (re) {
      const h = Array.prototype.find.call(corps.querySelectorAll("h3"), function (x) { return re.test(x.textContent); });
      const s = h && h.querySelector("svg");
      return s ? nomIcone(s) : null;
    };
    return { attenduSvg: attenduSvg, attenduAutre: attenduAutre, nonClasses: nonClasses, restants: restants, svgs: svgs,
      menuTracker: titre(/^\s*Menu Tracker/), boussole: titre(/^\s*Boussole/) };
  });
  verifier(doc.menuTracker === "navigation", "Documentation : « 🧭 Menu Tracker » → icône navigation", doc.menuTracker);
  verifier(doc.boussole === "compass", "Documentation : « 🧭 Boussole » → icône compass", doc.boussole);
  verifier(doc.svgs === doc.attenduSvg, "Documentation : " + doc.svgs + " icônes SVG posées = " + doc.attenduSvg +
    " emploi(s) substitués du guide");
  verifier(doc.nonClasses === 0 && doc.restants - doc.attenduAutre === 0, "Documentation : emoji migrés restants hors « autre sens » = " +
    (doc.restants - doc.attenduAutre) + " (restants " + doc.restants + ", listés " + doc.attenduAutre + ")");
  await capture(page, "5-documentation");
  await page.evaluate(function () { const m = document.getElementById("kta-readme-modal"); if (m) m.remove(); });

  // 7. Aide intégrée : fiche « Menu Tracker ».
  await page.evaluate(function () { window.afficherAide(); });
  await attendre(page, function () { return !!document.querySelector("#kta-aide-modal .kta-aide-row"); }, 8000);
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
    return { zone: true, tracker: suivi(/^\s*Tracker/), boussole: suivi(/^\s*Boussole/), cat: cat };
  });
  verifier(aide.zone && aide.tracker === "navigation", "Aide : « 🧭 Tracker » → icône navigation", aide);
  verifier(aide.boussole === "compass", "Aide : « 🧭 Boussole » → icône compass", aide.boussole);
  verifier(aide.cat, "Aide : titre de catégorie « ⚙️ Réglages… » avec l'icône settings");
  await capture(page, "6-aide");
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
