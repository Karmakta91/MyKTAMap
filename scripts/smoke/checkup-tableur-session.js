#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-tableur-session.js — checkup (Playwright, pas un hook pré-commit) : l'Éditeur de données applique un
// fichier de SESSION à la session, sur un plan multi-niveau
// =====================================================================
// Parcours réel : session semée SANS champ `level`, fichier de session déposé dans l'Éditeur de données, colonne
// « level » présente quand même (liste = niveaux du plan), type et niveau changés dans les cellules d'un tracé,
// d'une zone, d'une structure, puis « Appliquer à la session » ; tags et niveau d'un POI puis « Remplacer la
// session » ; type inconnu refusé (message nommant la ligne et le type, rien d'écrit) ; ⏪ (HistoryManager.undo)
// annule chaque application en une fois.
// 🩸 check-api-surface.js teste KtaConvertir.appliquerTableau dans un `vm` ; seul ce parcours voit les cellules, le
// menu de sauvegarde, la fenêtre d'erreur et le re-rendu.
// Usage : node scripts/smoke/checkup-tableur-session.js (SMOKE_PORT pour changer de port) · doc :
// docs/architecture/session-data.md (Tableur)
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
const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail ? " " + JSON.stringify(detail) : "")); }

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.KtaConvertir && !!window.HistoryManager &&
      typeof window.ouvrirTableEditor === "function";
  }, 20000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

// Session semée sans aucun champ `level` ; rend le fichier de session correspondant (comme l'export Complet).
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const h = window.APP_CONFIG.imageHeight;
    const x = Math.round(c.lng), y = Math.round(h - c.lat), d = 25;
    window.APP_CONFIG.visibleLevels = window.APP_CONFIG.availableLevels.slice();
    window.HistoryManager.reset();
    window.setRoads([
      { uid: "rd_tab", type: "principal", description: "ancienne", points: [{ x: x - d, y: y - d }, { x: x + d, y: y - d }] },
      { uid: "rd_tab2", type: "chemin", points: [{ x: x - d, y: y + d }, { x: x + d, y: y + d }] }
    ]);
    window.setZones([{ uid: "zn_tab", type: "eau",
      points: [{ x: x - d, y: y }, { x: x - 5, y: y }, { x: x - 5, y: y + d }, { x: x - d, y: y + d }] }]);
    window.setStructures([{ uid: "st_tab", type: "front-1",
      points: [{ x: x + 5, y: y }, { x: x + d, y: y + d }] }]);
    window.setEditorPoints([{ id: "PoiTab", nom: "PoiTab", uid: "pt_tab", x: x, y: y + d + 10,
      tags: ["salle"], etat: "Non inspectée", description: "", source: "editor" }]);
    return JSON.stringify({
      type: "devmap-session", version: "1.0",
      editorPoints: window.getEditorPoints(), roads: window.getRoads(),
      zones: window.getZones(), structures: window.getStructures()
    });
  });
}

function etat(page) {
  return page.evaluate(function () {
    const f = function (liste, uid) { return (liste || []).find(function (o) { return o && o.uid === uid; }) || null; };
    const r = function (o) { return o ? { type: o.type, tags: o.tags, level: o.level, n: (o.points || []).length,
      updatedAt: o.updatedAt } : null; };
    return {
      rd: r(f(window.getRoads(), "rd_tab")), rd2: r(f(window.getRoads(), "rd_tab2")),
      zn: r(f(window.getZones(), "zn_tab")), st: r(f(window.getStructures(), "st_tab")),
      pt: r(f(window.getEditorPoints(), "pt_tab")),
      nRoads: window.getRoads().length, undo: window.HistoryManager.canUndo()
    };
  });
}

// Ouvre l'Éditeur de données sur le fichier de session, puis le tableau `kind`.
async function ouvrirTableau(page, json, kind) {
  await page.evaluate(function () { window.ouvrirTableEditor(); });
  await page.click("#kta-tbl-src-json");
  await page.setInputFiles("#kta-tbl-file", { name: "session-test.json", mimeType: "application/json",
    buffer: Buffer.from(json, "utf8") });
  await page.waitForSelector(".kta-tbl-entry");
  const i = await page.evaluate(function (kind) {
    const libelle = window.I18n.t("tabledit.kind." + kind);
    const btns = Array.prototype.slice.call(document.querySelectorAll(".kta-tbl-entry"));
    return btns.findIndex(function (b) {
      const n = b.querySelector(".kta-tbl-entry-count");
      return !!n && n.textContent.trim().endsWith(" " + libelle);
    });
  }, kind);
  if (i < 0) throw new Error("tableau « " + kind + " » absent du sélecteur");
  await page.click('.kta-tbl-entry[data-i="' + i + '"]');
  await page.waitForSelector("#kta-tbl-table thead th");
  return page.evaluate(function () {
    return Array.prototype.map.call(document.querySelectorAll("#kta-tbl-table thead th[data-col]"),
      function (th) { return th.dataset.col; });
  });
}

// Index de la ligne d'uid donné dans le tableau (les uid ne sont pas des colonnes : lu par l'ordre du fichier).
function idxDe(json, kind, uid) {
  const src = JSON.parse(json)[kind];
  return src.findIndex(function (o) { return o.uid === uid; });
}

async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("pageerror", function (e) { erreursConsole.push("pageerror : " + e.message); });
  page.on("console", function (m) {
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro\.json|404/i.test(m.text())) {
      erreursConsole.push(m.text());
    }
  });
  try {
    await ouvrir(page);
    if (!PLAN.fictif) inf("⚠️ relevé fictif absent de data/index.json : le checkup tourne sur « " + PLAN.nom + " »");
    const multi = await page.evaluate(function () { return window.APP_CONFIG.multiLevel === true; });
    if (!multi) throw new Error("le plan « " + PLAN.nom + " » n'est pas multi-niveau");
    const niveauxPlan = await page.evaluate(function () {
      return window.APP_CONFIG.availableLevels.slice().sort(function (a, b) { return a - b; }).map(String);
    });
    const json = await semer(page);
    const e0 = await etat(page);
    verifier(e0.rd && e0.rd.level === undefined && e0.zn.level === undefined && e0.st.level === undefined &&
      e0.pt.level === undefined, "session semée sans aucun champ level", e0);
    // Les fenêtres d'alerte sont lues puis fermées par leur bouton.
    await page.evaluate(function () {
      window.__alertes = [];
      const orig = window.ktaAlerte;
      window.ktaAlerte = function (m, o) { window.__alertes.push(String(m)); return orig(m, o); };
    });

    // Tracé, zone, structure : type + niveau par les cellules, puis « Appliquer à la session ».
    const CAS = [
      { kind: "roads", uid: "rd_tab", type: "secondaire", niveau: "-1", cle: "rd" },
      { kind: "zones", uid: "zn_tab", type: "remblais", niveau: "1", cle: "zn" },
      { kind: "structures", uid: "st_tab", type: "front-2", niveau: "2", cle: "st" }
    ];
    for (const cas of CAS) {
      const cols = await ouvrirTableau(page, json, cas.kind);
      verifier(cols.indexOf("level") >= 0, cas.kind + " : colonne « level » présente sans aucun champ level", cols);
      const idx = idxDe(json, cas.kind, cas.uid);
      const lu = await page.textContent('td[data-idx="' + idx + '"][data-col="level"]');
      verifier(String(lu).trim() === "0", cas.kind + " : niveau absent affiché 0", lu);
      await page.click('td[data-idx="' + idx + '"][data-col="type"]');
      await page.fill('td[data-idx="' + idx + '"][data-col="type"] input', cas.type);
      await page.press('td[data-idx="' + idx + '"][data-col="type"] input', "Enter");
      await page.waitForTimeout(200);
      // Entrée ouvre la cellule de la ligne suivante : un clic hors du tableau la referme sans rien changer.
      await page.click("#kta-tbl-info");
      await page.waitForTimeout(150);
      await page.click('td[data-idx="' + idx + '"][data-col="level"]');
      const options = await page.evaluate(function (idx) {
        const s = document.querySelector('td[data-idx="' + idx + '"][data-col="level"] select');
        return s ? Array.prototype.map.call(s.options, function (o) { return o.value; }) : null;
      }, idx);
      verifier(JSON.stringify(options) === JSON.stringify(niveauxPlan),
        cas.kind + " : la cellule niveau est une LISTE des niveaux du plan", { options: options, plan: niveauxPlan });
      await page.selectOption('td[data-idx="' + idx + '"][data-col="level"] select', cas.niveau);
      await page.waitForTimeout(150);
      await page.click("#kta-tbl-save");
      const lib = await page.textContent("#save-session");
      verifier(/Appliquer/.test(lib || ""), cas.kind + " : menu « Appliquer à la session » proposé", lib);
      const avant = await etat(page);
      await page.click("#save-session");
      await page.waitForTimeout(600);
      const apres = await etat(page);
      const o = apres[cas.cle];
      verifier(o && o.type === cas.type && o.level === parseInt(cas.niveau, 10) && o.n === avant[cas.cle].n &&
        o.updatedAt !== avant[cas.cle].updatedAt,
        cas.kind + " : type et niveau appliqués à la session (géométrie gardée, touch)", { avant: avant[cas.cle], apres: o });
      if (cas.kind === "roads") {
        verifier(apres.rd2 && apres.rd2.updatedAt === avant.rd2.updatedAt && apres.nRoads === 2,
          "roads : la ligne non modifiée n'est pas touchée", apres.rd2);
      }
      await page.click("#kta-tbl-close");
    }

    // POI : tags + niveau, même « Appliquer à la session ».
    {
      const cols = await ouvrirTableau(page, json, "editorPoints");
      verifier(cols.indexOf("level") >= 0, "POI : colonne « level » présente sans aucun champ level", cols);
      await page.click('td[data-idx="0"][data-col="tags"] [data-tag-remove="0"]');
      await page.waitForTimeout(150);
      await page.click('td[data-idx="0"][data-col="tags"] .kta-tag-add');
      await page.fill("#kta-tag-new", "puits");
      await page.press("#kta-tag-new", "Enter");
      await page.waitForTimeout(150);
      await page.click('td[data-idx="0"][data-col="level"]');
      await page.selectOption('td[data-idx="0"][data-col="level"] select', "-2");
      await page.waitForTimeout(150);
      await page.click("#kta-tbl-save");
      await page.click("#save-session");
      await page.waitForTimeout(600);
      const e = await etat(page);
      verifier(e.pt && e.pt.level === -2 && JSON.stringify(e.pt.tags) === JSON.stringify(["puits"]),
        "POI : tags et niveau appliqués à la session", e.pt);
      await page.click("#kta-tbl-close");
    }

    // Type inconnu : refusé à l'application, ligne et type nommés, rien d'écrit.
    {
      await ouvrirTableau(page, json, "roads");
      const idx = idxDe(json, "roads", "rd_tab2");
      await page.click('td[data-idx="' + idx + '"][data-col="type"]');
      await page.fill('td[data-idx="' + idx + '"][data-col="type"] input', "galerie-inexistante");
      await page.press('td[data-idx="' + idx + '"][data-col="type"] input', "Enter");
      await page.waitForTimeout(150);
      const rouge = await page.evaluate(function (idx) {
        const td = document.querySelector('td[data-idx="' + idx + '"][data-col="type"]');
        return !!(td && td.classList.contains("col-error"));
      }, idx);
      verifier(rouge, "type inconnu : cellule signalée en rouge");
      const avant = await etat(page);
      await page.click("#kta-tbl-save");
      await page.click("#save-session");
      await page.waitForTimeout(500);
      const msg = await page.evaluate(function () { return window.__alertes[window.__alertes.length - 1] || ""; });
      const ligne = String(idx + 1);
      verifier(msg.indexOf("galerie-inexistante") >= 0 && msg.indexOf(ligne) >= 0,
        "type inconnu : refusé, message nommant la ligne " + ligne + " et le type", msg);
      const apres = await etat(page);
      verifier(JSON.stringify(apres) === JSON.stringify(avant), "type inconnu : la session n'a pas bougé");
      await page.click("#kta-confirm-oui");
      await page.waitForTimeout(200);
      const dl = await page.evaluate(function () { return !!document.getElementById("kta-tbl-modal"); });
      verifier(dl, "type inconnu : le tableau reste ouvert avec la saisie (téléchargement toujours possible)");
      // Fermer sans sauver.
      await page.click("#kta-tbl-close");
      await page.click("#conf-quit");
    }

    // ⏪ : chaque application s'annule en un geste (POI, structure, zone, tracé).
    const pile = [
      { cle: "pt", test: function (o) { return o.level === undefined && JSON.stringify(o.tags) === "[\"salle\"]"; } },
      { cle: "st", test: function (o) { return o.type === "front-1" && o.level === undefined; } },
      { cle: "zn", test: function (o) { return o.type === "eau" && o.level === undefined; } },
      { cle: "rd", test: function (o) { return o.type === "principal" && o.level === undefined; } }
    ];
    for (const p of pile) {
      await page.evaluate(function () { window.HistoryManager.undo(); });
      await page.waitForTimeout(400);
      const e = await etat(page);
      verifier(e[p.cle] && p.test(e[p.cle]), "⏪ annule l'application (" + p.cle + ") en un geste", e[p.cle]);
    }
    const fin = await etat(page);
    verifier(!fin.undo, "⏪ ×4 : la pile d'annulation est vide (une entrée par application)", fin);

    // Fichier ANCIEN : la session a changé depuis (note de T1, type de T2). Seule la cellule modifiée s'applique.
    await page.evaluate(function () {
      const R = window.getRoads().map(function (o) { return Object.assign({}, o); });
      R.forEach(function (o) {
        if (o.uid === "rd_tab") o.description = "récente";
        if (o.uid === "rd_tab2") o.type = "secondaire";
        window.KtaUid.touch(o);
      });
      window.setRoads(R);
    });
    await ouvrirTableau(page, json, "roads");
    const i1 = idxDe(json, "roads", "rd_tab");
    await page.click('td[data-idx="' + i1 + '"][data-col="level"]');
    await page.selectOption('td[data-idx="' + i1 + '"][data-col="level"] select', "1");
    await page.waitForTimeout(150);
    await page.click("#kta-tbl-save");
    await page.click("#save-session");
    await page.waitForTimeout(600);
    const recent = await page.evaluate(function () {
      const f = function (uid) { return window.getRoads().find(function (o) { return o.uid === uid; }) || {}; };
      return { t1: { level: f("rd_tab").level, description: f("rd_tab").description, type: f("rd_tab").type },
               t2: { type: f("rd_tab2").type } };
    });
    verifier(recent.t1.level === 1, "fichier ancien : la seule cellule modifiée (niveau de T1) est appliquée", recent);
    verifier(recent.t1.description === "récente" && recent.t1.type === "principal",
      "🩸 fichier ancien : les autres champs de T1 gardent leur valeur plus récente de la session", recent);
    verifier(recent.t2.type === "secondaire", "🩸 fichier ancien : la ligne non touchée (T2) ne change rien", recent);
    await page.click("#kta-tbl-close");

    // POI, fichier ancien : la note du point a changé dans la session depuis ; seule la cellule niveau est modifiée.
    await page.evaluate(function () {
      const P = window.getEditorPoints().map(function (o) { return Object.assign({}, o); });
      P.forEach(function (o) { if (o.uid === "pt_tab") { o.description = "note récente"; window.KtaUid.touch(o); } });
      window.setEditorPoints(P);
    });
    await ouvrirTableau(page, json, "editorPoints");
    await page.click('td[data-idx="0"][data-col="level"]');
    await page.selectOption('td[data-idx="0"][data-col="level"] select', "1");
    await page.waitForTimeout(150);
    await page.click("#kta-tbl-save");
    await page.click("#save-session");
    await page.waitForTimeout(600);
    const poi = await page.evaluate(function () {
      const o = window.getEditorPoints().find(function (p) { return p.uid === "pt_tab"; }) || {};
      return { level: o.level, description: o.description, tags: o.tags };
    });
    verifier(poi.level === 1, "POI, fichier ancien : la seule cellule modifiée (niveau) est appliquée", poi);
    verifier(poi.description === "note récente" && JSON.stringify(poi.tags) === "[\"salle\"]",
      "🩸 POI, fichier ancien : les autres champs gardent leur valeur plus récente de la session", poi);
    await page.click("#kta-tbl-close");

    // Supprimé depuis l'export : T2 effacé dans la session (trace de suppression), puis le fichier ancien réappliqué.
    await page.evaluate(function () {
      window.__toasts = [];
      const orig = window.OOMGuard.showToast;
      window.OOMGuard.showToast = function (m, ty, o) { window.__toasts.push(String(m)); return orig.call(window.OOMGuard, m, ty, o); };
      const t2 = window.getRoads().find(function (o) { return o.uid === "rd_tab2"; });
      window.KtaConvertir.supprimer("roads", t2);
    });
    const trace = function () {
      return page.evaluate(function () {
        return { present: window.getRoads().some(function (o) { return o.uid === "rd_tab2"; }),
                 trace: window.KtaUid.getTombstones().some(function (t) { return t.uid === "rd_tab2"; }),
                 toast: window.__toasts[window.__toasts.length - 1] || "" };
      });
    };
    const s0 = await trace();
    verifier(!s0.present && s0.trace, "T2 supprimé dans la session : trace de suppression posée", s0);
    const appliquerNiveau = async function (uid, n) {
      await ouvrirTableau(page, json, "roads");
      const i = idxDe(json, "roads", uid);
      await page.click('td[data-idx="' + i + '"][data-col="level"]');
      await page.selectOption('td[data-idx="' + i + '"][data-col="level"] select', n);
      await page.waitForTimeout(150);
      await page.click("#kta-tbl-save");
      await page.click("#save-session");
      await page.waitForTimeout(600);
      await page.click("#kta-tbl-close");
    };
    await appliquerNiveau("rd_tab", "2");
    const s1 = await trace();
    verifier(!s1.present && s1.trace, "🩸 ligne non touchée d'un objet supprimé depuis l'export : pas ressuscitée", s1);
    verifier(/1 ligne/.test(s1.toast) && /ignor/.test(s1.toast), "…et le bilan l'annonce (« 1 ligne(s) … ignorées »)", s1.toast);
    await appliquerNiveau("rd_tab2", "1");
    const s2 = await trace();
    verifier(s2.present && !s2.trace, "ligne MODIFIÉE d'un objet supprimé : réajoutée (geste explicite), trace retirée", s2);
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  if (erreursConsole.length) {
    erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — l'Éditeur de données applique type et niveau à la session, refuse un type inconnu, ⏪ annule.");
  process.exit(0);
}

main();
