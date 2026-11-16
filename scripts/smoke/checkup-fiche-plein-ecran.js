#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-fiche-plein-ecran.js — checkup (Playwright, Chromium + WebKit) : fiches dans une fenêtre au téléphone
// =====================================================================
// A. Case de ⚙️ Configuration de l'accueil : jamais touchée, elle suit l'appareil (téléphone 390 px tactile : cochée ;
//    PC 1200 px : décochée) ; un choix est gardé après rechargement (localStorage), dans les deux sens.
// B. Téléphone : un toucher sur un point de session à longue note ouvre sa fiche dans .kta-fiche-modale (la popup Leaflet
//    dans une boîte centrée sur un voile flouté, comme la modale Tracker ; en-tête au nom du point ;
//    elle-même, pas une copie), la fiche défile, la carte ne bouge pas, rien de la fiche ne reste dans la carte ;
//    « Y aller » agit (itinéraire demandé vers le point, fiche refermée) ; ✕, Échap et toucher le voile ferment ;
//    la fiche se rouvre dans la fenêtre.
// C. Téléphone : fiches d'un tracé, d'une zone (masse au sol) et d'une structure dans la fenêtre, en-tête = titre de
//    la fiche (le type : une forme n'a pas de nom) ; « Convertir » ouvre
//    sa fenêtre PAR-DESSUS la fiche.
// D. Téléphone : « Repositionner » depuis la fiche → fiche fermée, le toucher suivant sur la carte déplace le point.
// E. PC : la popup habituelle, dans la carte, sans fenêtre ; case cochée au PC → fenêtre (captures point et tracé).
// Usage : node scripts/smoke/checkup-fiche-plein-ecran.js (KTA_MOTEURS=chromium pour un seul moteur ; FPE_SHOTS=<dossier>
// pour les captures) · code : js/fichePleinEcran.js · doc : docs/architecture/ui.md § Fiche en fenêtre
// =====================================================================
"use strict";

const path = require("path");
const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const CAPTURES = process.env.FPE_SHOTS || null;
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const TELEPHONE = { viewport: { width: 390, height: 700 }, hasTouch: true };
const PC = { viewport: { width: 1200, height: 850 } };

const problemes = [];
let _prefixe = "";
function pb(m) { problemes.push(_prefixe + m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }
function verifier(c, m, d) { if (c) ok(m); else pb(m + (d !== undefined ? " " + JSON.stringify(d) : "")); }

// 🩸 WebKit signale en pageerror les lectures en cours annulées par page.reload() (deploiement.json, addon.json… :
// l'app les attrape, rien ne casse) — bruit du harnais qui recharge, pas une erreur de l'app.
function _bruitRechargement(e) {
  return /127\.0\.0\.1:\d+\/\S+ due to access control checks/.test(String(e && e.message));
}

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0 && typeof window._ouvrirLoaderConfig === "function" &&
      !!window.KtaFichePleinEcran;
  }, 30000);
  await page.waitForTimeout(1200);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

function caseConfig(page) {
  return page.evaluate(function () {
    window._ouvrirLoaderConfig();
    const cb = document.getElementById("loaderFichePeCb");
    let v = null;
    try { v = localStorage.getItem(window.KtaFichePleinEcran.LS_CLE); } catch (e) { v = "?"; }
    const r = { coche: !!cb && cb.checked, ls: v, telephone: window.KtaFichePleinEcran.estTelephone() };
    if (typeof window._fermerLoaderConfig === "function") window._fermerLoaderConfig();
    return r;
  });
}
async function basculerCase(page) {
  await page.evaluate(function () {
    window._ouvrirLoaderConfig();
    const cb = document.getElementById("loaderFichePeCb");
    cb.click();
    if (typeof window._fermerLoaderConfig === "function") window._fermerLoaderConfig();
  });
}

async function ouvrirPlan(page) {
  await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () { return window.__pret && !!window.map && !!window.setEditorPoints; }, 60000);
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    const A = window.APP_CONFIG;
    if (A.multiLevel === true) { A.activeLevel = 0; if (A.visibleLevels.indexOf(0) < 0) A.visibleLevels.push(0); }
    window.map.setView(window.map.getCenter(), window.map.getMaxZoom() - 1, { animate: false });
  });
  await page.waitForTimeout(800);
  // Objets de session autour du centre de l'écran, plan vidé de ses points de calque pour que le toucher les vise.
  await page.evaluate(function () {
    const c = window.map.getCenter(), H = window.PLAN_CONFIG.plan.imageHeight;
    const cx = Math.round(c.lng), cy = Math.round(H - c.lat);
    const P = function (dx, dy) { return { x: cx + dx, y: cy + dy }; };
    const carre = function (dx, dy, r) { return [P(dx - r, dy - r), P(dx + r, dy - r), P(dx + r, dy + r), P(dx - r, dy + r)]; };
    window.map.eachLayer(function (l) {
      if (l instanceof window.L.Marker && l.getPopup && l.getPopup() && window.layerEditor &&
        !window.layerEditor.hasLayer(l)) { try { window.map.removeLayer(l); } catch (e) { /* rien */ } }
    });
    const longue = [];
    for (let i = 0; i < 40; i++) longue.push("Ligne " + (i + 1) + " de la note : galerie, pilier, puits, repère.");
    window.__fpe = { cx: cx, cy: cy, poi: P(0, 0), cible: P(0, -40) };
    window.setEditorPoints([Object.assign({ id: "PoiFpe", nom: "PoiFpe", uid: "pt_fpe", level: 0, tags: ["salle"],
      description: longue.join("\n") }, P(0, 0))]);
    window.setStructures([{ uid: "st_fpe", type: "pilier-1", level: 0, points: carre(-30, 30, 6), description: "pilier" }]);
    window.setZones([{ uid: "zn_fpe", type: "masse-sol", level: 0, points: carre(30, 30, 10), description: "masse" }]);
    window.setRoads([{ uid: "rd_fpe", type: "principal", level: 0, points: [P(-40, 60), P(40, 60)], description: "tracé" }]);
    if (window.HistoryManager && window.HistoryManager.reset) window.HistoryManager.reset();
  });
  await page.waitForTimeout(600);
}

function ecranPlan(page, p) {
  return page.evaluate(function (q) {
    const pt = window.map.latLngToContainerPoint(window.convertCoord(q.x, q.y));
    const r = window.map.getContainer().getBoundingClientRect();
    return [r.left + pt.x, r.top + pt.y];
  }, p);
}
function centre(page, sel) {
  return page.evaluate(function (s) {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }, sel);
}
async function toucher(page, mode, xy) {
  if (mode === "telephone") await page.touchscreen.tap(xy[0], xy[1]);
  else await page.mouse.click(xy[0], xy[1]);
}
// Bouton de la fiche ouverte : amené à l'écran (la fiche défile), puis touché.
async function toucherBouton(page, mode, sel) {
  await page.evaluate(function (s) {
    const el = document.querySelector(s);
    if (el) el.scrollIntoView({ block: "center" });
  }, sel);
  await page.waitForTimeout(150);
  const xy = await centre(page, sel);
  if (!xy) return false;
  await toucher(page, mode, xy);
  return true;
}

function etatFiche(page) {
  return page.evaluate(function () {
    const pe = document.querySelector(".kta-fiche-modale");
    const pop = document.querySelector(".leaflet-popup");
    const corps = pe && pe.querySelector(".kta-fiche-modale-corps");
    const r = pe ? pe.getBoundingClientRect() : null;
    const boite = pe && pe.querySelector(".kta-tracker-modal-box");
    const rb = boite ? boite.getBoundingClientRect() : null;
    const cs = pe ? getComputedStyle(pe) : null;
    const flou = cs ? String(cs.backdropFilter || cs.webkitBackdropFilter || "") : "";
    const titre = pe && pe.querySelector(".kta-tracker-modal-header .kta-fiche-modale-titre");
    const b = pe && pe.querySelector(".kta-popup-point > b:first-child");
    return {
      pe: !!pe,
      nbPe: document.querySelectorAll(".kta-fiche-modale").length,
      popDansPe: !!(pe && pop && pe.contains(pop)),
      popDansCarte: !!(pop && window.map.getContainer().contains(pop)),
      // Voile : couvre l'écran, flouté ; boîte : centrée, plus étroite que l'écran (≤ 460 px), moins haute que lui.
      voile: !!r && Math.abs(r.width - window.innerWidth) < 2 && Math.abs(r.height - window.innerHeight) < 2 &&
        /blur/.test(flou),
      flou: flou,
      boite: !!rb && rb.width <= 462 && rb.width < window.innerWidth - 10 && rb.height < window.innerHeight &&
        Math.abs((rb.left + rb.width / 2) - window.innerWidth / 2) < 3,
      rb: rb ? [Math.round(rb.left), Math.round(rb.top), Math.round(rb.width), Math.round(rb.height)] : null,
      titre: titre ? titre.textContent.trim() : null,
      titreFiche: b ? b.textContent.trim() : null,
      titreCache: !!b && getComputedStyle(b).display === "none",
      croix: !!(pe && pe.querySelector(".kta-tracker-modal-header .kta-tracker-modal-close")),
      defile: !!corps && corps.scrollHeight > corps.clientHeight + 50,
      z: pe ? getComputedStyle(pe).zIndex : null,
      ouverte: window.KtaFichePleinEcran.ouverte()
    };
  });
}
function centreCarte(page) {
  return page.evaluate(function () { const c = window.map.getCenter(); return [c.lat, c.lng]; });
}
function marqueurPoi(page) {
  return page.evaluate(function () {
    let m = null;
    window.layerEditor.eachLayer(function (l) { if (l instanceof window.L.Marker && l.getPopup && l.getPopup()) m = l; });
    if (!m) return null;
    const r = m.getElement().getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
}
async function capture(page, nom) {
  if (!CAPTURES) return;
  await page.screenshot({ path: path.join(CAPTURES, nom + ".png") });
}

async function telephone(nav, moteur) {
  _prefixe = "[" + moteur + " · téléphone] ";
  console.log("\n══ " + moteur + " · téléphone ══");
  const ctx = await nav.newContext(TELEPHONE);
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) { /* rien */ } }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { if (!_bruitRechargement(e)) erreurs.push(String(e && e.message)); });
  try {
    await accueil(page);
    // A. case : défaut téléphone = cochée, rien d'enregistré
    const a1 = await caseConfig(page);
    verifier(a1.telephone && a1.coche && a1.ls === null,
      "case jamais touchée : appareil vu comme téléphone, case cochée, rien d'enregistré", a1);

    await ouvrirPlan(page);
    // B. fiche longue d'un point, ouverte au toucher
    const avant = await centreCarte(page);
    const m = await marqueurPoi(page);
    verifier(!!m, "le point de session est à l'écran", m);
    await toucher(page, "telephone", m);
    await page.waitForTimeout(500);
    const b1 = await etatFiche(page);
    const apres = await centreCarte(page);
    verifier(b1.pe && b1.nbPe === 1 && b1.popDansPe && !b1.popDansCarte && b1.ouverte,
      "toucher le point : sa fiche (la popup Leaflet) s'ouvre dans la fenêtre, rien ne reste dans la carte", b1);
    verifier(b1.voile, "voile sur tout l'écran, l'app floutée derrière (backdrop-filter)", { flou: b1.flou });
    verifier(b1.boite, "boîte centrée, plus étroite et moins haute que l'écran", b1.rb);
    verifier(b1.titre === "PoiFpe" && b1.titreCache && b1.croix,
      "en-tête : nom du point et ✕ ; le titre n'est pas répété dans le corps", b1);
    verifier(b1.defile, "la fiche longue défile dans la boîte", b1);
    verifier(b1.z === "99998", "z-index juste sous les modales", b1.z);
    verifier(Math.abs(avant[0] - apres[0]) < 1e-6 && Math.abs(avant[1] - apres[1]) < 1e-6,
      "la carte ne bouge pas derrière la fiche", { avant: avant, apres: apres });
    const contenu = await page.evaluate(function () {
      const pe = document.querySelector(".kta-fiche-modale");
      const corps = pe.querySelector(".kta-fiche-modale-corps");
      corps.scrollTop = 300;
      return { titre: pe.textContent.indexOf("PoiFpe") >= 0, aller: !!pe.querySelector('[data-kta-act="aller"]'),
        modifier: !!pe.querySelector('[data-kta-act="modifier"]'), scroll: corps.scrollTop };
    });
    verifier(contenu.titre && contenu.aller && contenu.modifier && contenu.scroll > 0,
      "même fiche que la bulle (titre, Y aller, Modifier), défilée au doigt", contenu);
    await page.evaluate(function () { document.querySelector(".kta-fiche-modale-corps").scrollTop = 0; });
    await capture(page, "telephone-poi-" + moteur);

    // Fermer
    await toucherBouton(page, "telephone", ".kta-fiche-modale-fermer");
    await page.waitForTimeout(400);
    const b2 = await etatFiche(page);
    verifier(!b2.pe && !b2.ouverte && !(await page.evaluate(function () {
      let o = false; window.layerEditor.eachLayer(function (l) { if (l.isPopupOpen && l.isPopupOpen()) o = true; }); return o;
    })), "✕ : fenêtre retirée, popup fermée", b2);

    // Rouvrir, Échap
    await toucher(page, "telephone", await marqueurPoi(page));
    await page.waitForTimeout(500);
    const b3 = await etatFiche(page);
    verifier(b3.pe && b3.popDansPe, "la fiche se rouvre dans la fenêtre", b3);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    verifier(!(await etatFiche(page)).pe, "Échap ferme la fiche");
    // Toucher le voile hors de la boîte (au-dessus d'elle) ferme, comme la modale Tracker ; dans la boîte, non.
    await toucher(page, "telephone", await marqueurPoi(page));
    await page.waitForTimeout(500);
    const dans = await centre(page, ".kta-fiche-modale-corps");
    await toucher(page, "telephone", dans);
    await page.waitForTimeout(300);
    verifier((await etatFiche(page)).pe, "toucher dans la boîte ne ferme pas");
    const hors = await page.evaluate(function () {
      const r = document.querySelector(".kta-fiche-modale .kta-tracker-modal-box").getBoundingClientRect();
      return r.top > 6 ? [r.left + r.width / 2, r.top / 2] : [r.left + r.width / 2, (r.bottom + window.innerHeight) / 2];
    });
    await toucher(page, "telephone", hors);
    await page.waitForTimeout(400);
    verifier(!(await etatFiche(page)).pe, "toucher le voile hors de la boîte ferme la fiche", hors);

    // « Y aller » agit
    await page.evaluate(function () {
      window.__appels = [];
      const orig = window.itineraireYAller;
      window.itineraireYAller = function (x, y, nom) {
        window.__appels.push({ x: x, y: y, nom: nom });
        window.itineraireYAller = orig;
        return orig.apply(window, arguments);
      };
    });
    await toucher(page, "telephone", await marqueurPoi(page));
    await page.waitForTimeout(500);
    await toucherBouton(page, "telephone", '.kta-fiche-modale [data-kta-act="aller"]');
    await page.waitForTimeout(900);
    // Tracker jamais posé : « Y aller » demande d'abord « Où es-tu ? » (toucher la carte), fiche refermée.
    const b4 = await page.evaluate(function () {
      return { appels: window.__appels, poi: window.__fpe.poi, pe: !!document.querySelector(".kta-fiche-modale"),
        ouEsTu: !!document.getElementById("kta-pos-floater") };
    });
    verifier(b4.appels.length === 1 && b4.appels[0].x === b4.poi.x && b4.appels[0].y === b4.poi.y && b4.ouEsTu &&
      !b4.pe, "« Y aller » depuis la fiche en fenêtre : itinéraire vers le point, « Où es-tu ? » sur la carte, " +
      "fiche refermée", b4);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    verifier(!(await page.evaluate(function () { return window._modeClicCarteActif(); })),
      "Échap rend la carte (plus de mode « toucher la carte »)");

    // C. tracé, zone, structure
    for (const f of [["tracé", "getRoads"], ["zone (masse au sol)", "getZones"], ["structure", "getStructures"]]) {
      const r = await page.evaluate(function (g) {
        const o = window[g]()[0], reg = window.ktaFicheObjetDe(o);
        if (!reg || !reg.layer) return { reg: false };
        reg.layer.openPopup();
        return { reg: true };
      }, f[1]);
      await page.waitForTimeout(400);
      const e = await etatFiche(page);
      verifier(r.reg && e.pe && e.popDansPe && !e.popDansCarte &&
        (await page.evaluate(function () { return !!document.querySelector(".kta-fiche-modale .kta-note-popup"); })),
      "fiche d'un " + f[0] + " dans la fenêtre", { r: r, e: e });
      verifier(!!e.titre && e.titre === e.titreFiche && e.titreCache && e.boite && e.voile,
        "fiche d'un " + f[0] + " : en-tête = titre de la fiche (« " + e.titre + " »), boîte centrée, voile", e);
      if (f[1] === "getRoads") await capture(page, "telephone-trace-" + moteur);
      if (f[1] === "getZones") {
        const conv = await toucherBouton(page, "telephone", ".kta-fiche-modale .kta-note-popup-convertir");
        await page.waitForTimeout(500);
        const dessus = await page.evaluate(function () {
          const pe = document.querySelector(".kta-fiche-modale");
          const ov = Array.prototype.slice.call(document.querySelectorAll(".kta-readme-modal-overlay"))
            .filter(function (o) { return o.offsetParent !== null || getComputedStyle(o).position === "fixed"; }).pop();
          if (!ov) return { ov: false };
          const b = ov.querySelector(".kta-readme-modal-boite") || ov;
          const r = b.getBoundingClientRect();
          const el = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(40, r.height / 2));
          const res = { ov: true, dessus: !!el && !(pe && pe.contains(el)) && (ov.contains(el)) };
          const x = ov.querySelector(".kta-panneau-close"); if (x) x.click(); else ov.remove();
          return res;
        });
        verifier(conv && dessus.ov && dessus.dessus, "« Convertir » ouvre sa fenêtre par-dessus la fiche", dessus);
      }
      await page.evaluate(function () { window.KtaFichePleinEcran.fermer(); });
      await page.waitForTimeout(300);
    }

    // D. Repositionner depuis la fiche
    await toucher(page, "telephone", await marqueurPoi(page));
    await page.waitForTimeout(500);
    await toucherBouton(page, "telephone", '.kta-fiche-modale [data-kta-act="repositionner"]');
    await page.waitForTimeout(500);
    const d1 = await etatFiche(page);
    verifier(!d1.pe, "« Repositionner » : la fiche en fenêtre se ferme", d1);
    const cible = await page.evaluate(function () { return window.__fpe.cible; });
    await toucher(page, "telephone", await ecranPlan(page, cible));
    await page.waitForTimeout(600);
    const d2 = await page.evaluate(function () {
      const p = window.getEditorPoints()[0];
      return { x: p.x, y: p.y, cible: window.__fpe.cible, pe: !!document.querySelector(".kta-fiche-modale") };
    });
    verifier(Math.abs(d2.x - d2.cible.x) <= 2 && Math.abs(d2.y - d2.cible.y) <= 2 && !d2.pe,
      "le toucher suivant sur la carte déplace le point, sans fiche", d2);

    // F. Intervention Secours en cours : la fiche s'ouvre dans la fenêtre par-dessus, l'intervention n'est pas touchée
    const f0 = await page.evaluate(function () {
      const S = window.SecoursMode;
      if (!S) return null;
      const s = S.create("Intervention FPE (test)");
      S.addGroupe(s.id, "Équipe 1");
      S.rejoindre(s.id, { role: "operateur" });
      if (S.isOpen && S.isOpen()) S.fermer();
      return s.id;
    });
    await page.waitForTimeout(800);
    if (!f0) pb("SecoursMode absent");
    else {
      await toucher(page, "telephone", await marqueurPoi(page));
      await page.waitForTimeout(500);
      const f1 = await page.evaluate(function (id) {
        const pe = document.querySelector(".kta-fiche-modale");
        const b = pe && pe.querySelector(".kta-fiche-modale-fermer");
        const r = b ? b.getBoundingClientRect() : null;
        const el = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
        const s = window.SecoursMode.get(id);
        return { pe: !!pe, dessus: !!el && pe.contains(el), active: !!(s && s.execution && s.execution.active) };
      }, f0);
      verifier(f1.pe && f1.dessus && f1.active,
        "intervention Secours en cours : la fiche s'ouvre dans la fenêtre, au-dessus, ✕ accessible", f1);
      await toucherBouton(page, "telephone", ".kta-fiche-modale-fermer");
      await page.waitForTimeout(400);
      const f2 = await page.evaluate(function (id) {
        const s = window.SecoursMode.get(id);
        const r = { pe: !!document.querySelector(".kta-fiche-modale"), active: !!(s && s.execution && s.execution.active) };
        const S = window.SecoursMode;
        if (S.isOpen && S.isOpen()) S.fermer();
        S.list().filter(function (x) { return x.nom === "Intervention FPE (test)"; })
          .forEach(function (x) { S.delete(x.id); });
        return r;
      }, f0);
      verifier(!f2.pe && f2.active, "✕ : l'intervention Secours continue", f2);
    }

    // A (suite) : décocher au téléphone, gardé après rechargement → popup habituelle
    await page.evaluate(function () { window.KtaFichePleinEcran.fermer(); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await accueil(page);
    await basculerCase(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await accueil(page);
    const a2 = await caseConfig(page);
    verifier(!a2.coche && a2.ls === "0", "décochée au téléphone : choix gardé après rechargement", a2);
    await ouvrirPlan(page);
    await toucher(page, "telephone", await marqueurPoi(page));
    await page.waitForTimeout(500);
    const a3 = await etatFiche(page);
    verifier(!a3.pe && a3.popDansCarte, "case décochée : la bulle habituelle, même au téléphone", a3);

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.stack || err));
  } finally {
    await ctx.close();
  }
}

async function ordinateur(nav, moteur) {
  _prefixe = "[" + moteur + " · PC] ";
  console.log("\n══ " + moteur + " · PC ══");
  const ctx = await nav.newContext(PC);
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) { /* rien */ } }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { if (!_bruitRechargement(e)) erreurs.push(String(e && e.message)); });
  try {
    await accueil(page);
    const e1 = await caseConfig(page);
    verifier(!e1.telephone && !e1.coche && e1.ls === null, "case jamais touchée au PC : décochée", e1);
    await ouvrirPlan(page);
    await toucher(page, "souris", await marqueurPoi(page));
    await page.waitForTimeout(500);
    const e2 = await etatFiche(page);
    verifier(!e2.pe && e2.popDansCarte, "PC : la bulle habituelle dans la carte, pas de fenêtre", e2);
    await page.evaluate(function () { window.map.closePopup(); });

    // case cochée au PC → gardée après rechargement → fenêtre au PC
    await page.reload({ waitUntil: "domcontentloaded" });
    await accueil(page);
    await basculerCase(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await accueil(page);
    const e3 = await caseConfig(page);
    verifier(e3.coche && e3.ls === "1", "cochée au PC : choix gardé après rechargement", e3);
    await ouvrirPlan(page);
    await toucher(page, "souris", await marqueurPoi(page));
    await page.waitForTimeout(500);
    const e4 = await etatFiche(page);
    verifier(e4.pe && e4.popDansPe && e4.boite && e4.voile && e4.titre === "PoiFpe",
      "case cochée au PC : la fiche s'ouvre dans la fenêtre centrée, voile flouté", e4);
    await capture(page, "pc-poi-" + moteur);
    await page.evaluate(function () {
      window.KtaFichePleinEcran.fermer();
      window.ktaFicheObjetDe(window.getRoads()[0]).layer.openPopup();
    });
    await page.waitForTimeout(400);
    const e5 = await etatFiche(page);
    verifier(e5.pe && e5.boite && !!e5.titre && e5.titre === e5.titreFiche, "PC : fiche d'un tracé dans la fenêtre", e5);
    await capture(page, "pc-trace-" + moteur);
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.stack || err));
  } finally {
    await ctx.close();
  }
}

(async function main() {
  try {
    for (const m of moteurs()) {
      const nav = await lancerMoteur(m);
      if (!nav) { inf(m + " absent : moteur sauté"); continue; }
      try {
        await telephone(nav, m);
        await ordinateur(nav, m);
      } finally {
        await nav.close();
      }
    }
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — au téléphone, les fiches s'ouvrent dans une fenêtre centrée sur l'app floutée (la même " +
    "popup, ses boutons agissent), " +
    "la bulle reste au PC, et la case de l'accueil suit l'appareil puis garde le choix.");
  process.exit(0);
})();
