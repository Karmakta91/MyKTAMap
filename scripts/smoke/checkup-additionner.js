#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-additionner.js — checkup (Playwright, pas un hook pré-commit) : « Additionner des structures »
// (js/additionnerStructures.js) joué comme l'utilisateur, sous chaque moteur de KTA_MOTEURS (Chromium et WebKit)
// =====================================================================
// Relevé fictif seulement. Le checkup pose des structures FICTIVES dans une zone libre du plan : trois piliers
// séparés par des traits de 3 px, un mur collé au premier, un pilier à 30 px, puis :
//   1. ouvre le mode par le vrai bouton de l'outil Structures (panneau de la barre de droite) ; bandeau, icônes SVG ;
//   2. touche (vrais clics souris sur la carte) le 1er pilier, le mur (refusé : autre type), le pilier lointain
//      (refusé : ne touche pas), les deux voisins ; re-toucher un voisin le retire, le re-toucher le remet ; aucune
//      fiche ne s'ouvre ;
//   3. Valider : UN pilier, uid du premier gardé, bandes absorbées, les deux autres retirés avec trace de suppression,
//      UNE étape ⏪, mode fermé ; ⏪ rend les trois ;
//   4. 📊 Éditeur de données → carte « Additionner » : même mode ; lecture seule : Valider refusé, rien d'écrit, et
//      l'ouverture elle-même refusée ; Échap ferme le mode.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8200 node scripts/smoke/checkup-additionner.js
// Doc : docs/architecture/plans-loader.md (Additionner des structures)
// =====================================================================
"use strict";

const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const PLAN = "Relevé fictif de test";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
let moteurCourant = "";
function pb(msg) { problemes.push("[" + moteurCourant + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) {
  if (cond) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}

// Formes relatives au coin O (px du plan) : [x0, y0, x1, y1, type, uid].
const FORMES = [
  [0, 0, 100, 60, "pilier-1", "st_ckadd_a"],
  [103, 0, 200, 60, "pilier-1", "st_ckadd_b"],
  [203, 0, 300, 60, "pilier-1", "st_ckadd_c"],
  [0, 63, 100, 120, "mur", "st_ckadd_m"],
  [330, 0, 400, 60, "pilier-1", "st_ckadd_l"]
];
const TAILLE = [400, 120];

async function poser(page) {
  return page.evaluate(function (a) {
    const C = window.APP_CONFIG, W = C.imageWidth, H = C.imageHeight;
    const routes = (window.getRoads() || []).concat(window.getAllEmbeddedRoads ? window.getAllEmbeddedRoads() : []);
    const occupes = (window.getStructures() || []).concat(window.getAllEmbeddedStructures ? window.getAllEmbeddedStructures() : [],
      window.getZones ? window.getZones() : [], routes)
      .filter(function (q) { return q && Array.isArray(q.points) && q.points.length; });
    const libre = function (o) {
      return !occupes.some(function (q) {
        return q.points.some(function (pt) {
          return pt.x > o.x - 80 && pt.x < o.x + a.taille[0] + 80 && pt.y > o.y - 80 && pt.y < o.y + a.taille[1] + 80;
        });
      });
    };
    let O = null;
    for (let y = 100; y + a.taille[1] + 100 < H && !O; y += 40) {
      for (let x = 100; x + a.taille[0] + 100 < W && !O; x += 40) if (libre({ x: x, y: y })) O = { x: x, y: y };
    }
    if (!O) return null;
    const niv = C.multiLevel === true ? (Number.isInteger(C.activeLevel) ? C.activeLevel : 0) : null;
    const neuves = a.formes.map(function (f) {
      const s = { uid: f[5], updatedAt: 1, type: f[4], points: [{ x: O.x + f[0], y: O.y + f[1] }, { x: O.x + f[2], y: O.y + f[1] },
        { x: O.x + f[2], y: O.y + f[3] }, { x: O.x + f[0], y: O.y + f[3] }] };
      if (niv !== null) s.level = niv;
      return s;
    });
    window.setStructures((window.getStructures() || []).concat(neuves));
    window.map.fitBounds(L.latLngBounds([window.convertCoord(O.x - 30, O.y - 30),
      window.convertCoord(O.x + a.taille[0] + 30, O.y + a.taille[1] + 30)]), { animate: false, paddingBottomRight: [0, 200] });
    if (window.HistoryManager && typeof window.HistoryManager.reset === "function") window.HistoryManager.reset();
    if (window.KtaUid) window.KtaUid.setTombstones([]);
    return O;
  }, { formes: FORMES, taille: TAILLE });
}

async function toucher(page, x, y) {
  const pt = await page.evaluate(function (a) {
    const r = window.map.getContainer().getBoundingClientRect();
    const c = window.map.latLngToContainerPoint(window.convertCoord(a.x, a.y));
    return { x: r.left + c.x, y: r.top + c.y };
  }, { x: x, y: y });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(250);
}
function etat(page) { return page.evaluate(function () { return window.KtaAdditionner.etat(); }); }
function structures(page) {
  return page.evaluate(function () {
    const aire = function (P) {
      let s = 0;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += P[j].x * P[i].y - P[i].x * P[j].y;
      return Math.abs(s / 2);
    };
    return window.getStructures().filter(function (s) { return /^st_ckadd_/.test(s.uid); }).map(function (s) {
      return { uid: s.uid, aire: Math.round(aire(s.points)), n: s.points.length };
    });
  });
}
function historique(page) { return page.evaluate(function () { return window.HistoryManager._peek().undo.length; }); }
function message(page) {
  return page.evaluate(function () {
    const el = document.querySelector("#kta-addit-floater .kta-addit-msg");
    return el ? el.textContent : null;
  });
}
function texte(page, cle, p) { return page.evaluate(function (a) { return window.I18n.t(a.k, a.p); }, { k: cle, p: p }); }

// Vrais clics : bouton du groupe Structures (barre de droite), puis « Additionner » dans son panneau.
async function ouvrirParStructures(page) {
  const titre = await texte(page, "ui.group.structures");
  const groupe = page.locator('a.kta-group-toggle[title="' + titre + '"]').first();
  if (!(await groupe.count())) return "bouton du groupe Structures absent";
  await groupe.click();
  await page.waitForTimeout(300);
  const lib = await texte(page, "addit.bouton");
  const btn = page.locator(".kta-group-flyout .kta-group-flyout-btn", { hasText: lib }).first();
  if (!(await btn.count())) return "bouton absent du panneau : " + lib;
  const svg = await btn.evaluate(function (b) { return !!b.querySelector("svg"); });
  await btn.click();
  await page.waitForTimeout(300);
  return svg ? "ok" : "bouton sans icône SVG";
}

async function suite(nav) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e)); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { if (localStorage.getItem(k) === null) localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN, { exact: false }).first().click();
  await attendre(page, function () { return !!window.map && !!window.PLAN_CONFIG && !!window.KtaAdditionner; }, 90000);
  await page.waitForTimeout(2000);
  const O = await poser(page);
  if (!O) { pb("aucune zone libre dans le relevé fictif pour poser les structures"); await ctx.close(); return; }
  await page.waitForTimeout(500);
  const milieu = function (i) { const f = FORMES[i]; return { x: O.x + (f[0] + f[2]) / 2, y: O.y + (f[1] + f[3]) / 2 }; };
  const t = async function (i) { const m = milieu(i); await toucher(page, m.x, m.y); };

  // ── 1. Ouverture par le bouton de l'outil Structures ──
  let r = await ouvrirParStructures(page);
  verifier(r === "ok" && !!(await etat(page)), "outil Structures → « Additionner » (icône SVG) ouvre le mode", r);
  const bandeau = await page.evaluate(function () {
    const f = document.getElementById("kta-addit-floater");
    return f ? { svg: f.querySelectorAll("svg").length, valider: f.querySelector('[data-addit="valider"]').disabled,
      tol: Number(f.querySelector('[data-addit="tol"]').value), iti: f.classList.contains("kta-iti-floater") } : null;
  });
  verifier(bandeau && bandeau.svg >= 3 && bandeau.valider && bandeau.tol === 6 && bandeau.iti,
    "bandeau : icônes SVG, Valider inactif à vide, tolérance 6 px", bandeau);

  // ── 2. Touchers ──
  await t(0);
  let e = await etat(page);
  verifier(e && e.sel.length === 1 && e.sel[0] === "st_ckadd_a", "toucher le 1er pilier : il est la première", e);
  await t(3);
  e = await etat(page);
  const msgType = await texte(page, "addit.autreType", { type: "§", ref: "§" });
  const mType = await message(page);
  verifier(e.sel.length === 1 && mType && mType.indexOf(msgType.split("§")[0]) === 0, "toucher le mur : refusé, type différent dit",
    { sel: e.sel, msg: mType });
  await t(4);
  e = await etat(page);
  const mLoin = await message(page);
  verifier(e.sel.length === 1 && /30/.test(mLoin || ""), "toucher le pilier à 30 px : refusé, « ne touche pas » avec l'écart",
    { sel: e.sel, msg: mLoin });
  await t(1);
  await t(2);
  e = await etat(page);
  verifier(e.sel.length === 3, "toucher les deux voisins : 3 choisis", e.sel);
  await t(1);
  e = await etat(page);
  verifier(e.sel.length === 2 && e.sel.indexOf("st_ckadd_b") < 0, "re-toucher un voisin le retire", e.sel);
  await t(1);
  e = await etat(page);
  const fiche = await page.evaluate(function () { return document.querySelectorAll(".leaflet-popup").length; });
  verifier(e.sel.length === 3 && fiche === 0, "le re-toucher le remet ; aucune fiche ouverte pendant le mode", { sel: e.sel, fiche: fiche });

  // ── 3. Valider, puis ⏪ ──
  const h0 = await historique(page);
  await page.click('#kta-addit-floater [data-addit="valider"]');
  await page.waitForTimeout(600);
  let S = await structures(page);
  const traces = await page.evaluate(function () { return window.KtaUid.getTombstones().map(function (x) { return x.uid; }); });
  const a = S.find(function (s) { return s.uid === "st_ckadd_a"; });
  verifier(S.length === 3 && a && a.aire === 300 * 60 && a.n === 4,
    "Valider : un seul pilier, uid du premier gardé, bandes absorbées (300 × 60)", S);
  verifier(traces.indexOf("st_ckadd_b") >= 0 && traces.indexOf("st_ckadd_c") >= 0, "traces de suppression des deux absorbés", traces);
  verifier((await historique(page)) === h0 + 1 && !(await etat(page)) &&
    !(await page.evaluate(function () { return !!document.getElementById("kta-addit-floater"); })),
    "UNE étape dans l'historique, mode fermé");
  await page.evaluate(function () { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);
  S = await structures(page);
  verifier(S.length === 5 && ["st_ckadd_a", "st_ckadd_b", "st_ckadd_c"].every(function (u) {
    return S.some(function (s) { return s.uid === u && s.aire <= 6000; });
  }), "⏪ rend les trois piliers d'origine (mêmes uid)", S);

  // ── 4. Éditeur de données, lecture seule, Échap ──
  await page.evaluate(function () { window.ouvrirTableEditor(); });
  await attendre(page, function () { return !!document.getElementById("kta-tbl-src-additionner"); }, 5000);
  const carte = await page.evaluate(function () {
    const b = document.getElementById("kta-tbl-src-additionner");
    return b ? !!b.querySelector("svg") : null;
  });
  await page.click("#kta-tbl-src-additionner");
  await page.waitForTimeout(400);
  verifier(carte === true && !!(await etat(page)), "📊 Éditeur de données → carte « Additionner » (icône SVG) ouvre le même mode",
    carte);
  // Textes différents : confirmation qui les liste ; Annuler laisse le mode armé (fenêtre exclue de la coupure).
  await page.evaluate(function () {
    window.getStructures().forEach(function (s) {
      if (s.uid === "st_ckadd_a") s.description = "Texte gardé";
      if (s.uid === "st_ckadd_b") s.description = "Texte perdu";
    });
  });
  await t(0);
  await t(1);
  await page.click('#kta-addit-floater [data-addit="valider"]');
  await page.waitForTimeout(400);
  const conf = await page.evaluate(function () {
    const o = document.getElementById("kta-addit-confirm");
    return o ? o.textContent : null;
  });
  verifier(conf && conf.indexOf("Texte perdu") >= 0 && conf.indexOf("Texte gardé") < 0,
    "textes différents : la confirmation liste ce qui sera perdu", conf);
  if (conf) await page.click("#kta-addit-confirm #kta-confirm-non");
  await page.waitForTimeout(400);
  S = await structures(page);
  e = await etat(page);
  verifier(S.length === 5 && e && e.sel.length === 2, "Annuler la confirmation : rien d'écrit, le mode reste armé avec sa sélection",
    { n: S.length, e: e });
  await page.click('#kta-addit-floater [data-addit="valider"]');
  await page.waitForTimeout(400);
  if (await page.locator("#kta-addit-confirm #kta-confirm-oui").count()) await page.click("#kta-addit-confirm #kta-confirm-oui");
  await page.waitForTimeout(500);
  S = await structures(page);
  const desc = await page.evaluate(function () {
    const s = window.getStructures().find(function (x) { return x.uid === "st_ckadd_a"; });
    return s && s.description;
  });
  verifier(S.length === 4 && desc === "Texte gardé" && !(await etat(page)),
    "confirmer : additionnées, la première garde sa description", { n: S.length, desc: desc });
  await page.evaluate(function () { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);

  // Lecture seule, Échap
  await page.evaluate(function () { window.KtaAdditionner.ouvrir(); });
  await page.waitForTimeout(200);
  await t(0);
  await t(1);
  await page.evaluate(function () { window.__adRO = window.ktaEditionRefusee; window.ktaEditionRefusee = function () { return true; }; });
  await page.click('#kta-addit-floater [data-addit="valider"]');
  await page.waitForTimeout(400);
  S = await structures(page);
  verifier(S.length === 5 && !!(await etat(page)), "🔒 lecture seule : Valider refusé, rien d'écrit (le mode reste)", S.length);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  verifier(!(await etat(page)), "Échap ferme le mode");
  const ouvert = await page.evaluate(function () { return window.KtaAdditionner.ouvrir(); });
  verifier(ouvert === false && !(await etat(page)), "🔒 lecture seule : l'ouverture du mode est refusée");
  await page.evaluate(function () { window.ktaEditionRefusee = window.__adRO; });

  verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  await ctx.close();
}

(async function main() {
  const liste = lancerNavigateur.moteurs();
  try {
    for (const nom of liste) {
      moteurCourant = nom;
      console.log("\n══ Moteur : " + nom + " ══");
      const nav = await lancerNavigateur.lancerMoteur(nom);
      if (!nav) { pb("moteur absent : rien n'a été vérifié"); continue; }
      try { await suite(nav); }
      catch (err) { pb("exception du harnais : " + (err && err.message)); }
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
  console.log("🎉 CHECKUP VERT — additionner : touchers, refus expliqués, une étape ⏪, Éditeur de données, lecture seule.");
  process.exit(0);
})();
