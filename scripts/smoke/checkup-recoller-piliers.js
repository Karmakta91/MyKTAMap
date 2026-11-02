#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-recoller-piliers.js — checkup (Playwright) : recoller en UN pilier des lignes qui forment une boucle
// =====================================================================
// Objets FICTIFS posés au centre de la vue (relevé fictif, sinon le premier plan de l'index), côtés subdivisés
// tous les 5 px comme un relevé SIG (aucune moitié n'est un contour fermé seule) : un carré en 2 lignes (bouts à
// 3 px), un rectangle en 3 lignes, un carré en 2 lignes aux bouts à 8 px (non recollé), un T à 3 branches.
// Vérifie : sélection multiple « tous du type » → fenêtre du lot → case « recoller » (compte), cibles fermées
// seulement, ktaConfirm annonce le compte AVANT, 2 piliers (uid neufs, jonctions fusionnées, aucun point inventé),
// le reste intact, traces de suppression, UNE entrée d'historique, un ⏪ rend les 10 lignes ; fiche d'un morceau.
// 🩸 check-api-surface.js teste le graphe dans un `vm` ; seul ce parcours voit la fenêtre, la case, ktaConfirm et
// la sélection multiple réelle.
// Usage : node scripts/smoke/checkup-recoller-piliers.js (SMOKE_PORT pour une autre copie) · code :
// convertirObjet.js > trouverBoucles / recollerLot / ouvrir · doc : docs/architecture/session-data.md
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
const ORIGINES = ["st_ckr_ca", "st_ckr_cb", "st_ckr_r1", "st_ckr_r2", "st_ckr_r3", "st_ckr_8a", "st_ckr_8b",
  "st_ckr_t1", "st_ckr_t2", "st_ckr_t3"];

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Géométries fictives autour du centre de la vue (coordonnées image du plan).
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const x = Math.round(c.lng) - 150, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 60;
    const seg = function (a, b, sansDebut) {
      const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 5)), out = [];
      for (let i = sansDebut ? 1 : 0; i <= n; i++) {
        out.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n });
      }
      return out;
    };
    const ligne = function (uid, pts, note) {
      let out = seg(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i++) out = out.concat(seg(pts[i - 1], pts[i], true));
      const o = { uid: uid, type: "front-1", level: 0, points: out.map(function (p) { return { x: x + p.x, y: y + p.y }; }) };
      if (note) o.description = note;
      return o;
    };
    window.__ckr = { x: x, y: y };
    window.setRoads([]);
    window.setZones([]);
    window.setStructures([
      // Carré 40 × 40 en 2 lignes, bouts à 3 px.
      ligne("st_ckr_ca", [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }], "fictif A"),
      ligne("st_ckr_cb", [{ x: 37, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 3 }], "fictif B"),
      // Rectangle 80 × 40 en 3 lignes.
      ligne("st_ckr_r1", [{ x: 80, y: 0 }, { x: 160, y: 0 }]),
      ligne("st_ckr_r2", [{ x: 162, y: 1 }, { x: 160, y: 40 }, { x: 120, y: 40 }]),
      ligne("st_ckr_r3", [{ x: 118, y: 41 }, { x: 80, y: 40 }, { x: 81, y: 2 }]),
      // Carré en 2 lignes, bouts à 8 px : non recollé.
      ligne("st_ckr_8a", [{ x: 200, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 40 }]),
      ligne("st_ckr_8b", [{ x: 232, y: 40 }, { x: 200, y: 40 }, { x: 200, y: 8 }]),
      // T à 3 branches.
      ligne("st_ckr_t1", [{ x: 0, y: 100 }, { x: 40, y: 100 }]),
      ligne("st_ckr_t2", [{ x: 80, y: 100 }, { x: 41, y: 101 }]),
      ligne("st_ckr_t3", [{ x: 40, y: 150 }, { x: 40, y: 102 }])
    ]);
  });
}

function etatSession(page) {
  return page.evaluate(function () {
    const res = {};
    ["getRoads", "getZones", "getStructures"].forEach(function (g) {
      (window[g]() || []).forEach(function (o) {
        if (o && o.uid) {
          res[o.uid] = { fam: g, type: o.type, n: o.points.length, level: o.level, note: o.description || "",
                         p0: o.points[0] };
        }
      });
    });
    return res;
  });
}

async function confirmer(page) {
  await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 10000);
  await page.waitForTimeout(500);   // garde anti-double-clic de ktaConfirm
  const texte = await page.evaluate(function () {
    const b = document.getElementById("kta-confirm-oui");
    const boite = b.closest(".kta-readme-modal-boite");
    const t = boite ? boite.textContent : "";
    b.click();
    return t;
  });
  await page.waitForTimeout(800);
  return texte;
}

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
      const tous = window.PlanRegistry.getAll();
      const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
      window.__pret = false;
      Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
    });
    await attendre(page, function () {
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaConvertir && !!window.HistoryManager;
    }, 40000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    });

    await semer(page);
    await page.waitForTimeout(600);
    const seules = await page.evaluate(function () {
      return window.getStructures().filter(function (o) { return window.KtaConvertir.estContourFerme("structures", o); }).length;
    });
    verifier(seules === 0, "aucune des 10 lignes fictives n'est un contour fermé seule", seules);

    // Sélection multiple « tous du type » depuis la fenêtre Convertir d'une ligne, puis ✅.
    const hAvant = await page.evaluate(function () { return window.HistoryManager._peek().undo.length; });
    const sel = await page.evaluate(function () {
      const o = window.getStructures()[0];
      window.KtaConvertir.ouvrir("structures", o);
      const b = document.getElementById("kta-convert-multi");
      if (!b) return { erreur: "pas de bouton sélection multiple" };
      b.click();
      const tous = document.getElementById("kta-selm-tous");
      if (!tous) return { erreur: "pas de bandeau" };
      tous.click();
      const n = window.SelectionMulti.liste().length;
      document.getElementById("kta-selm-ok").click();
      return { n: n, modale: !!document.getElementById("kta-convert-modal") };
    });
    verifier(sel.n === 10 && sel.modale, "sélection « tous du type » = les 10 lignes, fenêtre du lot", sel);

    const caseR = await page.evaluate(function () {
      const cr = document.getElementById("kta-convert-recoller");
      if (!cr) return null;
      return { texte: cr.parentNode.textContent, coche: cr.checked, actif: !cr.disabled,
               pilier: !!document.querySelector('#kta-convert-modal [data-famille="structures"][data-type="pilier-1"]') };
    });
    verifier(!!caseR && /2\D+5/.test(caseR.texte) && !caseR.coche && caseR.actif && !caseR.pilier,
      "lot : case « recoller » (2 objets à partir de 5 lignes), décochée, pas de pilier tant qu'elle l'est", caseR);
    await page.evaluate(function () {
      const cr = document.getElementById("kta-convert-recoller");
      cr.checked = true;
      cr.dispatchEvent(new Event("change"));
    });
    await page.waitForTimeout(300);
    const lotR = await page.evaluate(function () {
      const m = document.getElementById("kta-convert-modal");
      const choix = Array.from(m.querySelectorAll(".kta-convert-choix")).map(function (b) {
        return b.getAttribute("data-famille") + ":" + b.getAttribute("data-type");
      });
      return { source: (m.querySelector(".kta-convert-source") || {}).textContent, choix: choix,
               coche: document.getElementById("kta-convert-recoller").checked };
    });
    verifier(lotR.coche && lotR.choix.indexOf("structures:pilier-1") >= 0 && lotR.choix.indexOf("zones:eau") >= 0 &&
      lotR.choix.every(function (c) { return c.indexOf("roads:") !== 0 && c !== "structures:front-2"; }),
      "lot recollé : cibles fermées seulement (zone, pilier)", lotR);
    await page.evaluate(function () {
      document.querySelector('#kta-convert-modal .kta-convert-choix[data-famille="structures"][data-type="pilier-1"]').click();
    });
    const msg = await confirmer(page);
    verifier(/5/.test(msg) && /2/.test(msg) && /3/.test(msg), "ktaConfirm annonce AVANT : 5 lignes → 2 objets, 3 lignes du T laissées",
      msg.slice(0, 300));

    let e = await etatSession(page);
    const piliers = Object.keys(e).filter(function (u) { return e[u].type === "pilier-1"; });
    verifier(piliers.length === 2 && piliers.every(function (u) { return ORIGINES.indexOf(u) < 0; }),
      "2 piliers, chacun avec un uid NEUF", piliers);
    const c = await page.evaluate(function () { return window.__ckr; });
    const pc = piliers.map(function (u) { return e[u]; }).find(function (o) { return o.note.indexOf("fictif A") >= 0; });
    verifier(!!pc && pc.n === 17 + 15 - 2 && pc.p0.x === c.x && pc.p0.y === c.y && pc.note === "fictif A\nfictif B",
      "carré recollé : 17 + 15 − 2 = 30 points (jonctions fusionnées, premier point gardé), notes concaténées", pc);
    const pr = piliers.map(function (u) { return e[u]; }).find(function (o) { return o !== pc; });
    verifier(!!pr && pr.n === 17 + 17 + 17 - 3, "rectangle recollé : 3 lignes, 3 jonctions fusionnées", pr);
    verifier(["st_ckr_ca", "st_ckr_cb", "st_ckr_r1", "st_ckr_r2", "st_ckr_r3"].every(function (u) { return !e[u]; }),
      "les 5 lignes recollées ont quitté la session");
    verifier(["st_ckr_8a", "st_ckr_8b", "st_ckr_t1", "st_ckr_t2", "st_ckr_t3"].every(function (u) {
      return e[u] && e[u].type === "front-1";
    }), "paire à 8 px et T intacts", e);
    const traces = await page.evaluate(function () {
      return (window.KtaUid.getTombstones() || []).map(function (t) { return t.uid; });
    });
    verifier(["st_ckr_ca", "st_ckr_cb", "st_ckr_r1", "st_ckr_r2", "st_ckr_r3"].every(function (u) {
      return traces.indexOf(u) >= 0;
    }), "les 5 lignes recollées portent une trace de suppression (synchro)", traces);
    const hApres = await page.evaluate(function () { return window.HistoryManager._peek().undo.length; });
    verifier(hApres - hAvant === 1, "UNE entrée d'historique", hApres - hAvant);

    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(600);
    e = await etatSession(page);
    verifier(ORIGINES.every(function (u) { return e[u] && e[u].type === "front-1"; }) &&
      !Object.keys(e).some(function (u) { return e[u].type === "pilier-1"; }),
      "un ⏪ rend les 10 lignes d'origine, plus aucun pilier", e);
    const traces2 = await page.evaluate(function () {
      return (window.KtaUid.getTombstones() || []).map(function (t) { return t.uid; });
    });
    verifier(traces2.indexOf("st_ckr_ca") < 0, "après ⏪ : la trace de suppression des lignes rendues est retirée", traces2);
    // Morceau : un « C » de 3 côtés dont l'autre moitié est une ligne voisine de la session. Sa fenêtre Convertir
    // (fiche) ne propose ni zone ni pilier et dit pourquoi ; un C isolé les propose.
    const morceau = await page.evaluate(function () {
      const c = window.__ckr;
      const C = { uid: "st_ckr_C", type: "front-1", level: 0, points: [{ x: c.x, y: c.y + 200 }, { x: c.x + 40, y: c.y + 200 },
        { x: c.x + 40, y: c.y + 240 }, { x: c.x, y: c.y + 240 }] };
      const voisine = { uid: "st_ckr_Cv", type: "front-1", level: 0,
        points: [{ x: c.x, y: c.y + 238 }, { x: c.x, y: c.y + 202 }] };
      const Ci = { uid: "st_ckr_Ci", type: "front-1", level: 0, points: [{ x: c.x + 100, y: c.y + 200 },
        { x: c.x + 140, y: c.y + 200 }, { x: c.x + 140, y: c.y + 240 }, { x: c.x + 100, y: c.y + 240 }] };
      window.setStructures([C, voisine, Ci]);
      const lire = function (o) {
        window.KtaConvertir.ouvrir("structures", o);
        const m = document.getElementById("kta-convert-modal");
        const r = { pilier: !!m.querySelector('[data-type="pilier-1"]'),
                    regle: (m.querySelector(".kta-convert-regle") || {}).textContent || "" };
        m.remove();
        return r;
      };
      return { C: lire(C), Ci: lire(Ci), cleMorceau: window.I18n.t("convert.regleMorceau") };
    });
    verifier(!morceau.C.pilier && morceau.C.regle === morceau.cleMorceau && morceau.Ci.pilier,
      "morceau : la fiche du C qui touche une voisine ne propose pas de pilier et l'explique ; le C isolé, si", morceau);
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — des lignes qui forment une boucle se recollent en un pilier, en lot, et s'annulent en un ⏪.");
  process.exit(0);
})();
