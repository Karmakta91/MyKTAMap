#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-mesure-annulable.js — checkup (Playwright) : la mesure 📐 annulable tant que l'outil est armé
// =====================================================================
// Relevé fictif (sinon le premier plan de l'index), objets FICTIFS posés au centre de la vue, jamais écrits. Joué
// sous chaque moteur (KTA_MOTEURS, Chromium et WebKit par défaut).
// Vérifie : 3 points posés, ⏪ ⏪ → 1 point, ⏩ → 2 points (libellés « Mesure : … », bouton ⏪ et Ctrl+Z compris) ;
// sommet ajusté par appui long outil armé (seule la mesure s'ajuste, aucun point posé par le clic), ⏪ → sommet en
// place ; dernier point retiré et effacement annulables ; distance ↔ surface ne purge rien ; zone dessinée, outil
// armé, 2 points, ⏪ ×2 → mesure vide et zone intacte, ⏪ suivant → la zone ; outil fermé → aucune entrée « mesure »
// dans la pile (annuler comme rétablir), ⏪ défait directement l'objet et la mesure reste affichée ; outil fermé, un
// ajustement de la mesure n'entre pas dans l'historique ; vue 3D, vue d'édition : ⏪ met le bandeau et l'aperçu à
// jour, la fermeture de la vue purge ; Échap sur la carte désarme 📐 et purge de même.
// Usage : node scripts/smoke/checkup-mesure-annulable.js (SMOKE_PORT pour une autre copie) · code : js/measure.js,
// js/historyManager.js (purger), js/interface.js > _initPrecisionCursor · doc : docs/architecture/session-data.md
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
let _prefixe = "";
function pb(msg) { problemes.push(_prefixe + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
  });
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaAjusterSommets &&
      !!window.HistoryManager && !!window._groupes && !!window._groupes.mesure;
  }, 60000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    const cfg = window.APP_CONFIG;
    if (cfg.multiLevel === true) {
      cfg.activeLevel = 0;
      if (cfg.visibleLevels.indexOf(0) < 0) cfg.visibleLevels.push(0);
    }
  });
  // La vue retrouvée à la réouverture se pose après le chargement : attendue avant de fixer la nôtre.
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    window.map.setView(window.map.getCenter(), window.map.getMaxZoom() - 1, { animate: false });
  });
  await page.waitForTimeout(800);
}

// Outils du harnais dans window.__ma : P(u, v) = point plan à (u, v) px d'écran du centre de la fenêtre ; ecran(p) ;
// clic(p) = clic carte (même chemin que la carte : map.fire) ; choisir(groupe, clé) = bouton de la barre puis son
// panneau ; pile() = résumé de la pile.
function outils(page) {
  return page.evaluate(function () {
    const m = window.map, H = window.APP_CONFIG.imageHeight;
    const cr0 = m.getContainer().getBoundingClientRect();
    const c = m.containerPointToLatLng([innerWidth / 2 - cr0.left, innerHeight / 2 - 40 - cr0.top]);
    const k = 1 / m.options.crs.scale(m.getZoom());
    const bx = c.lng, by = H - c.lat;
    window.setRoads([]); window.setZones([]); window.setStructures([]);
    window.renderRoads();
    if (window.resetMesure) window.resetMesure();
    window.HistoryManager.reset();
    window.__ma = {
      k: k,
      P: function (u, v) { return { x: bx + u * k, y: by + v * k }; },
      ecran: function (p) {
        const q = m.latLngToContainerPoint(window.convertCoord(p.x, p.y));
        const cr = m.getContainer().getBoundingClientRect();
        return [cr.left + q.x, cr.top + q.y];
      },
      clic: function (p) { m.fire("click", { latlng: window.L.latLng(H - p.y, p.x) }); },
      choisir: function (groupe, cle) {
        const g = window._groupes[groupe];
        if (!g || !g.btnPrincipal) return false;
        const lib = window.I18n.t(cle);
        let b = null;
        if (!g.useFlyout) {
          // accordéon : ouvert s'il est fermé, puis son bouton (titre = libellé)
          if (!g.subActions.some(function (x) { return !x.classList.contains("kta-hidden"); })) g.btnPrincipal.click();
          b = g.subActions.filter(function (x) { return (x.title || "").indexOf(lib) >= 0; })[0];
        } else {
          g.btnPrincipal.click();
          const fly = document.querySelector(".kta-group-flyout");
          if (!fly) return false;
          b = Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
            return x.textContent.indexOf(lib) >= 0;
          })[0];
        }
        if (!b) return false;
        b.click();
        return true;
      },
      pile: function () {
        const p = window.HistoryManager._peek();
        const cats = function (l) { return l.map(function (e) { return e.category; }); };
        return { undo: cats(p.undo), redo: cats(p.redo), labels: p.undo.map(function (e) { return e.label; }),
          mesureUndo: p.undo.filter(function (e) { return e.category === "mesure"; }).length,
          mesureRedo: p.redo.filter(function (e) { return e.category === "mesure"; }).length };
      }
    };
    return { k: k, zoom: m.getZoom() };
  });
}

function mesure(page) {
  return page.evaluate(function () {
    return { d: window.getMeasurePoints().map(function (p) { return { x: p.x, y: p.y }; }),
      s: window.getMeasurePointsSurface().map(function (p) { return { x: p.x, y: p.y }; }),
      arme: window.modeMesure === true, mode: window.getMeasureMode(), pile: window.__ma.pile(),
      libelle: (document.getElementById("measureLabel") || {}).textContent || "" };
  });
}
// La purge à la fermeture se joue en fin de tâche : un tour de boucle avant de lire la pile.
const tour = function (page) { return page.waitForTimeout(80); };
function proche(p, q, tol) { return !!p && !!q && Math.hypot(p.x - q.x, p.y - q.y) <= tol; }

async function undo(page) { await page.evaluate(function () { window.HistoryManager.undo(); }); await tour(page); }
async function redo(page) { await page.evaluate(function () { window.HistoryManager.redo(); }); await tour(page); }

// Appui long à la souris sur `de` (plan), glissé vers `vers` (plan), lâcher.
async function appuiLong(page, de, vers) {
  await page.evaluate(function () { const t = document.getElementById("kta-toasts"); if (t) t.innerHTML = ""; });
  const a = await page.evaluate(function (p) { return window.__ma.ecran(p); }, de);
  const b = await page.evaluate(function (p) { return window.__ma.ecran(p); }, vers);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.waitForTimeout(650);
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(a[0] + (b[0] - a[0]) * i / 8, a[1] + (b[1] - a[1]) * i / 8);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function section2D(page) {
  const s = await outils(page);
  inf("zoom " + s.zoom + ", " + (1 / s.k).toFixed(2) + " px d'écran par px plan");
  const tol = 2.5 * s.k;

  // ── 3 points, ⏪ ⏪ → 1, ⏩ → 2 ──
  let r = await page.evaluate(function () {
    const M = window.__ma;
    return M.choisir("mesure", "ui.subaction.mesureDistance") && window.modeMesure === true;
  });
  verifier(r, "📐 Distance armé depuis la barre");
  await page.evaluate(function () {
    const M = window.__ma;
    [[-200, 0], [0, 0], [200, 0]].forEach(function (q) { M.clic(M.P(q[0], q[1])); });
  });
  let m = await mesure(page);
  const pose = m.d.slice();
  verifier(m.d.length === 3 && m.pile.mesureUndo === 3, "3 points posés = 3 entrées « mesure »", m.pile);
  verifier(m.pile.labels[2] === await page.evaluate(function () { return window.I18n.t("measure.histo.point"); }),
    "libellé d'historique « " + m.pile.labels[2] + " »");
  // 1er ⏪ par le bouton de la barre (l'outil reste armé), 2e par Ctrl+Z.
  r = await page.evaluate(function () { return window.__ma.choisir("history", "ui.subaction.undo"); });
  await tour(page);
  m = await mesure(page);
  verifier(r && m.d.length === 2 && m.arme, "⏪ de la barre : 2 points, outil toujours armé", { bouton: r, n: m.d.length,
    arme: m.arme });
  await page.evaluate(function () { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await page.keyboard.press("Control+z");
  await tour(page);
  m = await mesure(page);
  verifier(m.d.length === 1 && proche(m.d[0], pose[0], 1e-9), "Ctrl+Z : 1 point, le premier", m.d);
  await redo(page);
  m = await mesure(page);
  verifier(m.d.length === 2 && proche(m.d[1], pose[1], 1e-9) && m.pile.mesureRedo === 1,
    "⏩ : 2 points, le 2e revenu à sa place", { n: m.d.length, redo: m.pile.mesureRedo });
  verifier(m.libelle.length > 0, "libellé bas-gauche affiché (" + m.libelle + ")");

  // ── Sommet ajusté outil armé, puis ⏪ ──
  await page.evaluate(function () { const M = window.__ma; M.clic(M.P(200, 0)); });
  m = await mesure(page);
  const avantAjust = m.d.slice(), nAvant = m.pile.mesureUndo;
  const vers = await page.evaluate(function (p) { return { x: p.x + 40 * window.__ma.k, y: p.y + 60 * window.__ma.k }; },
    avantAjust[1]);
  await appuiLong(page, avantAjust[1], vers);
  m = await mesure(page);
  verifier(m.d.length === 3 && proche(m.d[1], vers, tol), "outil armé : appui long sur un sommet de la mesure → déplacé, " +
    "aucun point posé par le clic", { n: m.d.length, pt: m.d[1], voulu: vers });
  verifier(m.pile.mesureUndo === nAvant + 1 && m.pile.labels[m.pile.labels.length - 1] ===
    await page.evaluate(function () { return window.I18n.t("measure.histo.deplacer"); }),
  "l'ajustement = une entrée « Mesure : sommet déplacé »", m.pile.labels.slice(-2));
  await undo(page);
  m = await mesure(page);
  verifier(m.d.length === 3 && proche(m.d[1], avantAjust[1], 1e-9), "⏪ : le sommet revient à sa position d'avant", m.d[1]);

  // Outil armé : un tracé sous le doigt ne s'ajuste pas (seule la mesure).
  await page.evaluate(function () {
    const M = window.__ma;
    window.setRoads([{ uid: "rd_ma_r", type: "principal", level: 0, points: [M.P(-200, -200), M.P(0, -200), M.P(200, -200)] }]);
    window.renderRoads();
  });
  const rd = await page.evaluate(function () { return window.getRoads()[0].points[1]; });
  await appuiLong(page, rd, { x: rd.x + 40 * s.k, y: rd.y + 40 * s.k });
  const rd2 = await page.evaluate(function () { return window.getRoads()[0].points[1]; });
  m = await mesure(page);
  verifier(proche(rd2, rd, 1e-9), "outil 📐 armé : un sommet de tracé ne s'ajuste pas", rd2);
  // le clic qui suit l'appui long n'a pas été avalé (rien d'armé côté ajustement) : il a posé un point, retiré
  if (m.d.length === 4) await undo(page);

  // ── Dernier point retiré (❌) et effacement : annulables ──
  await page.evaluate(function () { window.removeLastMeasurePoint(); });
  m = await mesure(page);
  verifier(m.d.length === 2 && m.pile.labels[m.pile.labels.length - 1] ===
    await page.evaluate(function () { return window.I18n.t("measure.histo.retire"); }), "❌ dernier point = une entrée", m.pile.labels.slice(-1));
  await undo(page);
  m = await mesure(page);
  verifier(m.d.length === 3, "⏪ : le point retiré revient");
  await page.evaluate(function () { window.resetMesureMode("distance"); });
  m = await mesure(page);
  verifier(m.d.length === 0, "❌ toute la distance : effacée");
  await undo(page);
  m = await mesure(page);
  verifier(m.d.length === 3, "⏪ : la distance effacée revient (3 points)");

  // ── Distance ↔ surface : ni entrée, ni purge ──
  const nPile = m.pile.mesureUndo;
  r = await page.evaluate(function () { return window.__ma.choisir("mesure", "ui.subaction.mesureSurface"); });
  await tour(page);
  m = await mesure(page);
  verifier(r && m.arme && m.mode === "surface" && m.pile.mesureUndo === nPile,
    "passage en ♦️ Surface : outil armé, aucune entrée ajoutée ni purgée", { mode: m.mode, n: m.pile.mesureUndo, avant: nPile });
  await page.evaluate(function () {
    const M = window.__ma;
    [[-100, 150], [100, 150], [100, 300]].forEach(function (q) { M.clic(M.P(q[0], q[1])); });
  });
  m = await mesure(page);
  verifier(m.s.length === 3 && m.pile.mesureUndo === nPile + 3, "3 sommets de surface = 3 entrées");
  for (let i = 0; i < 4; i++) await undo(page);
  m = await mesure(page);
  verifier(m.s.length === 0 && m.d.length === 2, "⏪ ×4 : surface vide, puis un point de distance défait", { s: m.s.length, d: m.d.length });

  // ── Fermer l'outil : la pile perd toutes ses entrées « mesure » (annuler et rétablir) ──
  r = await page.evaluate(function () { return window.__ma.choisir("mesure", "ui.subaction.mesureSurface"); });
  await tour(page);
  m = await mesure(page);
  verifier(r && !m.arme && m.pile.mesureUndo === 0 && m.pile.mesureRedo === 0,
    "📐 fermé : aucune entrée « mesure » dans la pile (annuler comme rétablir)", m.pile);
  verifier(m.d.length === 2, "📐 fermé : la mesure reste affichée");
  // Outil fermé, l'ajustement de la mesure reste possible, hors historique.
  const nFerme = m.pile.undo.length;
  const v2 = { x: m.d[0].x - 40 * s.k, y: m.d[0].y + 50 * s.k };
  await appuiLong(page, m.d[0], v2);
  m = await mesure(page);
  verifier(proche(m.d[0], v2, tol) && m.pile.undo.length === nFerme, "📐 fermé : sommet de mesure ajusté, aucune entrée",
    { pt: m.d[0], n: m.pile.undo.length, avant: nFerme });

  // ── Zone, puis mesure : ⏪ défait la mesure d'abord, la zone ensuite ──
  await page.evaluate(function () {
    const M = window.__ma;
    window.setRoads([]); window.renderRoads();
    window.resetMesure();
    window.HistoryManager.reset();
    window.toggleZoneMode("eau");
    [[-300, -300], [-100, -300], [-100, -150], [-300, -150]].forEach(function (q) { M.clic(M.P(q[0], q[1])); });
    M.clic(M.P(-300, -300));
    if (window.modeZone) window.toggleZoneMode("eau");
  });
  const z0 = await page.evaluate(function () {
    const z = window.getZones();
    return { n: z.length, pts: z.length ? z[z.length - 1].points.length : 0, pile: window.__ma.pile() };
  });
  verifier(z0.n === 1 && z0.pts === 4 && z0.pile.undo.length > 0, "zone de 4 sommets dessinée à l'outil", z0);
  r = await page.evaluate(function () { return window.__ma.choisir("mesure", "ui.subaction.mesureDistance"); });
  await page.evaluate(function () {
    const M = window.__ma;
    [[100, 100], [300, 100]].forEach(function (q) { M.clic(M.P(q[0], q[1])); });
  });
  m = await mesure(page);
  verifier(r && m.arme && m.d.length === 2 && m.pile.mesureUndo === 2, "📐 armé, 2 points de mesure",
    { bouton: r, arme: m.arme, d: m.d.length, pile: m.pile, zone: await page.evaluate(function () { return window.modeZone; }) });
  await undo(page); await undo(page);
  m = await mesure(page);
  const z1 = await page.evaluate(function () { const z = window.getZones(); return { n: z.length, pts: z.length ? z[0].points.length : 0 }; });
  verifier(m.d.length === 0 && z1.n === 1 && z1.pts === 4, "⏪ ×2 : mesure vide, zone intacte", { d: m.d.length, z: z1 });
  await undo(page);
  const z2 = await page.evaluate(function () {
    const z = window.getZones(), cur = window.getCurrentZone ? window.getCurrentZone() : null;
    return { n: z.length, pts: z.length ? z[0].points.length : 0, enCours: !!cur };
  });
  verifier(JSON.stringify(z2) !== JSON.stringify({ n: 1, pts: 4, enCours: false }), "⏪ suivant : c'est la zone qui est défaite",
    z2);
  // Toute la pile : la zone disparaît.
  await page.evaluate(function () { let i = 0; while (window.HistoryManager.canUndo() && i++ < 20) window.HistoryManager.undo(); });
  await tour(page);
  verifier(await page.evaluate(function () { return window.getZones().length; }) === 0, "⏪ jusqu'au bout : plus de zone");

  // ── Outil fermé : ⏪ défait directement l'objet ──
  await page.evaluate(function () {
    window._desactiverTousLesModes();
    window.HistoryManager.reset();
    window.resetMesure();
    const M = window.__ma;
    window.toggleZoneMode("eau");
    [[-300, -300], [-100, -300], [-100, -150]].forEach(function (q) { M.clic(M.P(q[0], q[1])); });
    M.clic(M.P(-300, -300));
    if (window.modeZone) window.toggleZoneMode("eau");
    M.choisir("mesure", "ui.subaction.mesureDistance");
    [[100, 100], [300, 100]].forEach(function (q) { M.clic(M.P(q[0], q[1])); });
    M.choisir("mesure", "ui.subaction.mesureDistance");   // re-clic : l'outil se ferme
  });
  await tour(page);
  m = await mesure(page);
  verifier(!m.arme && m.pile.mesureUndo === 0 && m.pile.undo.length > 0 && m.pile.undo[m.pile.undo.length - 1] === "zones",
    "zone, 📐 armé, 2 points, 📐 fermé : la pile ne garde que la zone", m.pile);
  await undo(page);
  m = await mesure(page);
  verifier(m.pile.redo[m.pile.redo.length - 1] === "zones" && m.d.length === 2,
    "⏪ défait directement la zone (entrée « zones »), la mesure (2 points) reste", { d: m.d.length, redo: m.pile.redo });

  // ── Changement d'outil par la barre : 📐 tombe, ses entrées aussi ──
  await page.evaluate(function () {
    if (window.modeZone) window.toggleZoneMode(window.modeZone);
    window._desactiverTousLesModes();
    window.HistoryManager.reset(); window.resetMesure();
    const M = window.__ma;
    M.choisir("mesure", "ui.subaction.mesureDistance");
    M.clic(M.P(0, 200));
    M.choisir("zones", "ui.zone.eau");
  });
  await tour(page);
  const barre = await page.evaluate(function () {
    return { mesure: window.modeMesure, zone: window.modeZone, pile: window.__ma.pile() };
  });
  if (barre.zone) {
    verifier(!barre.mesure && barre.pile.mesureUndo === 0, "📐 armé puis ⬛ Zone depuis la barre : 📐 fermé, entrées purgées",
      barre);
  } else {
    inf("bouton de type de zone introuvable dans le panneau : changement d'outil par la barre non joué (" +
      JSON.stringify(barre) + ")");
  }
  await page.evaluate(function () {
    if (window.modeZone) window.toggleZoneMode(window.modeZone);
    window._desactiverTousLesModes();
    window.setZones([]); window.resetMesure(); window.HistoryManager.reset();
  });

  // ── Échap : 📐 désarmé comme par son bouton, entrées purgées, mesure affichée (shortcuts.js > _echapCarte) ──
  r = await page.evaluate(function () {
    const M = window.__ma;
    const okArme = M.choisir("mesure", "ui.subaction.mesureDistance");
    if (window.ktaFermerOutils) window.ktaFermerOutils();
    [[100, 100], [300, 100], [300, 300]].forEach(function (q) { M.clic(M.P(q[0], q[1])); });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    return okArme && window.modeMesure === true;
  });
  m = await mesure(page);
  verifier(r && m.d.length === 3 && m.pile.mesureUndo === 3, "📐 armé, 3 points (avant Échap)", m.pile);
  await page.keyboard.press("Escape");
  await tour(page);
  m = await mesure(page);
  const allume = await page.evaluate(function () {
    const g = window._groupes.mesure;
    return g.btnPrincipal.classList.contains("kta-group-mode-actif") ||
      g.subActions.some(function (b) { return b.classList.contains("kta-actif"); });
  });
  verifier(!m.arme && !allume && m.pile.mesureUndo === 0 && m.pile.mesureRedo === 0 && m.d.length === 3,
    "Échap : 📐 désarmé (bouton éteint), aucune entrée « mesure » dans la pile, la mesure reste affichée",
    { arme: m.arme, allume: allume, pile: m.pile, d: m.d.length });
  await page.evaluate(function () { window.resetMesure(); window.HistoryManager.reset(); });
}

// ── Vue 3D, vue d'édition : ⏪ met à jour le bandeau et l'aperçu ; fermer la vue purge ──
async function section3D(page) {
  // Chargée à la demande par le bouton cube de la barre (interface.js > _ouvrirVue3D), comme à l'usage.
  await page.evaluate(function () { const a = document.querySelector(".kta-vue3d-ctrl a"); if (a) a.click(); });
  try {
    await attendre(page, function () { return !!window.KtaVue3D && window.KtaVue3D.etat().ouvert === true; }, 30000);
  } catch (err) { pb("vue 3D : pas ouverte par le bouton cube (" + err.message + ")"); return; }
  const R = await page.evaluate(async function () {
    const K = window.KtaVue3D, C = window.APP_CONFIG, sc = C.scale;
    const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    const images = async function (n) {
      for (let i = 0; i < (n || 3); i++) await new Promise(function (ok) { requestAnimationFrame(ok); });
    };
    if (!K || typeof K.ouvrir !== "function") return { absent: true };
    const W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
    const ox = W / 2 / sc, oz = H / 2 / sc;
    const P = function (x, z) { return { x: (ox + x) * sc, y: (oz + z) * sc }; };
    const r = {};
    if (window.getTrackingActif && window.getTrackingActif()) window.stopTracking();
    const acc = window.ktaEstAccessible;
    window.ktaEstAccessible = function () { return true; };
    window.HistoryManager.reset();
    window.resetMesure();
    let ctxV = null;
    const cv = function () { return document.querySelector("#kta-vue3d canvas"); };
    const ecran = function (x, z) {
      const rc = cv().getBoundingClientRect();
      const v = new ctxV.THREE.Vector3(ox + x, 0, oz + z).project(ctxV.camera);
      return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height };
    };
    let id = 500;
    const evt = function (type, i, x, y) {
      return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: i, pointerType: "touch",
        isPrimary: true, clientX: x, clientY: y, button: 0 });
    };
    const tap = async function (pt) {
      const i = ++id, c = cv();
      c.dispatchEvent(evt("pointerdown", i, pt.x, pt.y));
      await pause(30);
      c.dispatchEvent(evt("pointerup", i, pt.x, pt.y));
      await pause(40);
    };
    const choisir = function (groupe, cle) {
      const b = document.querySelector('#kta-vue3d .kta-v3d-outils [data-groupe="' + groupe + '"]');
      if (b) b.click();
      const fly = document.querySelector(".kta-group-flyout");
      if (!fly) return false;
      const lib = window.I18n.t(cle);
      const btn = Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
        return x.textContent.indexOf(lib) >= 0;
      })[0];
      if (!btn) { window.ktaFermerOutils(); return false; }
      btn.click();
      return true;
    };
    const lignes = function () { const m = K.etat().mesure; return m && m.affiche ? m.lignes.slice() : []; };
    const etiquettes = function () { return K.etat().dessin.etiquettes.length; };
    const mesureEntrees = function () {
      return window.HistoryManager._peek().undo.filter(function (e) { return e.category === "mesure"; }).length;
    };
    try {
      await K.fermer();
      const d = P(0, 0);
      await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 0, niveau: 0 }, commandes: "joystick" });
      if (!K.etat().camera.edition) K.basculerVue();
      await pause(200);
      await images(4);
      const deg = K.greffer({ nom: "ma-camera", scene: function (ctx) { ctxV = ctx; } });
      if (deg) deg();
      await images(2);
      r.edition = K.etat().camera.edition;
      r.arme = choisir("mesure", "ui.subaction.mesureDistance") && window.modeMesure === true;
      await images(2);
      r.vide = lignes();
      await tap(ecran(-4, 2));
      await tap(ecran(2, 2));
      await tap(ecran(2, -3));
      await images(3);
      r.n3 = { pts: window.getMeasurePoints().length, lignes: lignes(), etiq: etiquettes(), entrees: mesureEntrees(),
        attendu: window.I18n.t("measure.label.distance", { val: window.formatDistance(window.calculDistance(), 2) }) };
      window.HistoryManager.undo();
      await images(3);
      r.n2 = { pts: window.getMeasurePoints().length, lignes: lignes(), etiq: etiquettes(),
        attendu: window.I18n.t("measure.label.distance", { val: window.formatDistance(window.calculDistance(), 2) }) };
      window.HistoryManager.undo(); window.HistoryManager.undo();
      await images(3);
      r.n0 = { pts: window.getMeasurePoints().length, lignes: lignes(), etiq: etiquettes(),
        attendu: window.I18n.t("measure.hint.distance") };
      window.HistoryManager.redo();
      window.HistoryManager.redo();
      await images(3);
      r.redo = { pts: window.getMeasurePoints().length, lignes: lignes(), etiq: etiquettes() };
      r.avantFermer = mesureEntrees();
      await K.fermer();
      await pause(80);
      r.apresFermer = { arme: window.modeMesure === true, entrees: mesureEntrees(),
        redo: window.HistoryManager._peek().redo.filter(function (e) { return e.category === "mesure"; }).length };
    } finally {
      window.ktaEstAccessible = acc;
      if (K.etat().ouvert) await K.fermer();
      window._desactiverTousLesModes();
      window.resetMesure();
    }
    return r;
  });
  if (R.absent) { pb("vue 3D absente : section non jouée"); return; }
  verifier(R.edition && R.arme, "3D, vue d'édition, 📐 Distance armé", R);
  verifier(R.n3.pts === 3 && R.n3.entrees === 3 && R.n3.lignes.join("|").indexOf(R.n3.attendu) >= 0,
    "3D : 3 points posés, 3 entrées, bandeau « " + R.n3.attendu + " »", R.n3);
  verifier(R.n2.pts === 2 && R.n2.lignes.join("|").indexOf(R.n2.attendu) >= 0 && R.n2.etiq !== R.n3.etiq,
    "3D : ⏪ → bandeau « " + R.n2.attendu + " », aperçu refait", { n2: R.n2, etiqAvant: R.n3.etiq });
  verifier(R.n0.pts === 0 && R.n0.lignes.join("|").indexOf(R.n0.attendu) >= 0,
    "3D : ⏪ ⏪ → mesure vide, le bandeau revient à l'invite", R.n0);
  verifier(R.redo.pts === 2 && R.redo.lignes.length > 0, "3D : ⏩ ⏩ → 2 points, bandeau relu", R.redo);
  verifier(R.apresFermer && !R.apresFermer.arme && R.apresFermer.entrees === 0 && R.apresFermer.redo === 0,
    "3D fermée outil armé : 📐 fermé, aucune entrée « mesure » dans la pile", { avant: R.avantFermer, apres: R.apresFermer });
}

async function jouer(nav, moteur) {
  _prefixe = "[" + moteur + "] ";
  console.log("\n══ " + moteur + " ══");
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await ouvrirPlan(page);
    await section2D(page);
    await section3D(page);
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.stack || err));
  } finally {
    await page.close();
  }
}

(async function main() {
  try {
    for (const m of moteurs()) {
      const nav = await lancerMoteur(m);
      if (!nav) { inf(m + " absent : moteur sauté"); continue; }
      try { await jouer(nav, m); } finally { await nav.close(); }
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
  console.log("🎉 CHECKUP VERT — la mesure 📐 s'annule et se rétablit tant que l'outil est armé ; fermé, la pile ne " +
    "garde que les objets.");
  process.exit(0);
})();
