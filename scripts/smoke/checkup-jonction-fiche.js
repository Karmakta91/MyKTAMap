#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-jonction-fiche.js — checkup (Playwright, pas un hook pré-commit) : fiche d'une jonction inter-niveau,
// et « Effacer la session » depuis 📊 Détails de la session
// =====================================================================
// A. Fiche d'une jonction (popup Leaflet) sur un plan multi-niveau : titre « Jonction N… ↔ N… », pas de Convertir,
//    deux niveaux identiques refusés dans la fiche, niveaux changés (un geste, une entrée ⏪) puis ⏪ / ⏩ ; filtre par
//    niveau et ronds d'extrémité qui suivent ; itinéraire (Pathfinder sur les tracés de session) qui emprunte la
//    jonction seulement quand ses bouts portent les bons niveaux ; note modifiée ; suppression (trace) puis ⏪ ;
//    pas de fiche pendant un dessin ; lecture seule.
// B. 📊 Détails de la session → 🗑️ : la confirmation de l'app (plan local), annuler n'efface rien ; les trois choix
//    d'un plan partagé (prise effacerSession simulée : N en attente → 3 choix, 0 → 2, rien de présélectionné) ; plan ☁️
//    en lecture seule, aux deux entrées : « Rien à effacer : ce plan vient du serveur ».
// 🩸 check-api-surface.js teste changerNiveauxJonction dans un `vm` ; seul ce parcours voit la popup, le re-rendu
// filtré, les ronds et le graphe réel.
// Usage : node scripts/smoke/checkup-jonction-fiche.js (SMOKE_PORT pour une autre copie)
// Doc : docs/architecture/multilevel-pathfinding.md · docs/architecture/session-data.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
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
const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function ouvrir(page, garderFenetre) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.KtaConvertir && !!window.HistoryManager && !!window.Pathfinder;
  }, 20000);
  await page.waitForTimeout(3000);
  // Une restauration de session peut ouvrir sa fenêtre : on la ferme sans rien effacer (sauf si on la teste).
  if (!garderFenetre) await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
  });
  await page.waitForTimeout(300);
}

// Plan affiché déguisé en plan d'extension ; `prise` = méthodes de l'extension simulée (lectureSeule, effacerSession…).
async function simulerExtension(page, prise) {
  await page.evaluate(function (prise) {
    const id = window._currentLoadedPlanId, orig = window.PlanRegistry.findById.bind(window.PlanRegistry);
    window.PlanRegistry.findById = function (x) { return x === id ? { type: "ext", extId: "simule" } : orig(x); };
    const ext = { nom: "checkup-jonction", apiVersion: 1 };
    if (prise.lectureSeule) ext.lectureSeule = function () { return true; };
    if (prise.effacer) {
      ext.effacerSession = function () { return Promise.resolve(prise.effacer); };
      ext.auteurObjet = function (uid) { return { createur: /^pt_moi/.test(uid) ? "moi" : "autre", modifiePar: null }; };
    }
    window.KtaExtensions.register(ext);
  }, prise);
}

// ── A. Jonction ──────────
// Tracé A au niveau 0 (gauche), tracé B au niveau +1 (droite), jonction entre les deux, ses bouts décalés de 2 px
// (au-dessus du seuil de fusion du graphe : le raccord dépend alors du NIVEAU de chaque bout). Départ 0, arrivée -1 :
// l'itinéraire A → B est impossible tant que l'arrivée n'est pas mise à +1.
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const h = window.APP_CONFIG.imageHeight;
    const x = Math.round(c.lng), y = Math.round(h - c.lat);
    window.APP_CONFIG.visibleLevels = [-1, 0, 1];
    window.APP_CONFIG.activeLevel = 0;
    window.setRoads([
      { uid: "rd_jfa", type: "principal", level: 0, points: [{ x: x - 60, y: y }, { x: x - 20, y: y }] },
      { uid: "rd_jct", type: "jonction", fromLevel: 0, toLevel: -1, updatedAt: 1000,
        points: [{ x: x - 18, y: y }, { x: x, y: y + 4 }, { x: x + 18, y: y }] },
      { uid: "rd_jfb", type: "principal", level: 1, points: [{ x: x + 20, y: y }, { x: x + 60, y: y }] }
    ]);
    window.KtaUid.setTombstones([]);
    if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    window.HistoryManager.reset();
    window.__jct = { x: x, y: y };
    // Un toast « info » est masqué par défaut (réglage de notifications) : on lit l'appel, pas l'écran.
    window.__toasts = [];
    const orig = window.OOMGuard.showToast;
    window.OOMGuard.showToast = function (m, n) { window.__toasts.push((n || "") + ":" + m); return orig.apply(this, arguments); };
    return { x: x, y: y };
  });
}

function etatJonction(page) {
  return page.evaluate(function () {
    const j = (window.getRoads() || []).find(function (r) { return r && r.uid === "rd_jct"; }) || null;
    const P = window.__jct;
    let fiche = false, ronds = 0;
    const H = window.APP_CONFIG.imageHeight;
    window.map.eachLayer(function (l) {
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (typeof c === "string" && c.indexOf('data-kta-uid="rd_jct"') >= 0) fiche = true;
      if (l instanceof L.CircleMarker && l.options && l.options.radius === 7 && l.getLatLng) {
        const ll = l.getLatLng();
        if (Math.abs(H - ll.lat - P.y) < 0.5 && (Math.abs(ll.lng - (P.x - 18)) < 0.5 || Math.abs(ll.lng - (P.x + 18)) < 0.5)) ronds++;
      }
    });
    let route = null;
    try {
      const r = window.Pathfinder.computeRouteOnRoads(
        [{ x: P.x - 55, y: P.y, level: 0, label: "A" }, { x: P.x + 55, y: P.y, level: 1, label: "B" }],
        window.getRoads(), {});
      route = { ok: true, viaJonction: r.path.some(function (p) { return Math.abs(p.y - (P.y + 4)) < 0.5; }) };
    } catch (e) { route = { ok: false, code: e.code || e.message }; }
    return {
      present: !!j,
      de: j ? j.fromLevel : null, vers: j ? j.toLevel : null, note: j ? (j.description || "") : null,
      updatedAt: j ? j.updatedAt : null, level: j && ("level" in j),
      fiche: fiche, ronds: ronds, route: route,
      trace: (window.KtaUid.getTombstones() || []).some(function (t) { return t && t.uid === "rd_jct"; }),
      canUndo: window.HistoryManager.canUndo(),
      popupOuverte: !!document.querySelector(".leaflet-popup-content .kta-note-popup"),
      toast: (window.__toasts || []).slice(-1)[0] || ""
    };
  });
}

// Ouvre la fiche de la jonction par son layer de clic → contenu lu, ou null.
async function ouvrirFiche(page) {
  const ouverte = await page.evaluate(function () {
    let cible = null;
    window.map.eachLayer(function (l) {
      if (cible) return;
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (typeof c === "string" && c.indexOf('data-kta-uid="rd_jct"') >= 0) cible = l;
    });
    if (!cible) return false;
    cible.openPopup(cible.getBounds ? cible.getBounds().getCenter() : undefined);
    return true;
  });
  if (!ouverte) return null;
  await page.waitForTimeout(350);
  return page.evaluate(function () {
    const r = document.querySelector(".leaflet-popup-content .kta-note-popup");
    if (!r) return null;
    const de = r.querySelector(".kta-note-popup-jct-de"), vers = r.querySelector(".kta-note-popup-jct-vers");
    return {
      titre: (r.querySelector("b") || {}).textContent || "",
      lecture: r.classList.contains("kta-note-popup-readonly-mode"),
      convertir: !!r.querySelector(".kta-note-popup-convertir"),
      niveauSimple: !!r.querySelector(".kta-note-popup-niveau"),
      supprimer: !!r.querySelector(".kta-note-popup-supprimer"),
      de: de ? de.value : null, vers: vers ? vers.value : null,
      options: de ? Array.prototype.map.call(de.options, function (o) { return o.value; }) : null
    };
  });
}

async function appliquerNiveaux(page, de, vers) {
  await page.selectOption(".leaflet-popup-content .kta-note-popup-jct-de", String(de));
  await page.selectOption(".leaflet-popup-content .kta-note-popup-jct-vers", String(vers));
  await page.click(".leaflet-popup-content .kta-note-popup-jct-appliquer");
  await page.waitForTimeout(600);
}

async function partieJonction(page) {
  await semer(page);
  const e0 = await etatJonction(page);
  verifier(e0.fiche && e0.ronds === 2, "jonction semée (0 ↔ -1) : layer de fiche et deux ronds d'extrémité", e0);
  verifier(e0.route && !e0.route.ok, "itinéraire 0 → +1 impossible tant que l'arrivée est à -1", e0.route);

  // Pas de fiche pendant un dessin.
  const pendant = await page.evaluate(function () {
    window.modeRoad = "principal";
    window.renderRoads();
    let fiche = false;
    window.map.eachLayer(function (l) {
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (typeof c === "string" && c.indexOf('data-kta-uid="rd_jct"') >= 0) fiche = true;
    });
    window.modeRoad = null;
    window.renderRoads();
    return fiche;
  });
  verifier(!pendant, "pas de fiche de jonction pendant un tracé en cours");

  const f0 = await ouvrirFiche(page);
  verifier(f0 && /Jonction N0 ↔ N-1/.test(f0.titre), "titre de la fiche « 🪜 Jonction N0 ↔ N-1 »", f0 && f0.titre);
  verifier(f0 && !f0.convertir && !f0.niveauSimple && f0.supprimer, "pas de 🔄 Convertir ni de liste « Niveau » simple ; 🗑️ présent", f0);
  verifier(f0 && f0.de === "0" && f0.vers === "-1", "listes Départ = 0, Arrivée = -1", f0);
  verifier(f0 && JSON.stringify(f0.options) === "[\"-2\",\"-1\",\"0\",\"1\",\"2\"]", "niveaux proposés = niveaux du plan", f0 && f0.options);

  // Deux niveaux identiques : refus dans la fiche.
  await appliquerNiveaux(page, 0, 0);
  const refus = await page.evaluate(function () {
    const s = document.querySelector(".leaflet-popup-content .kta-note-popup-jct-statut");
    return s ? { visible: !s.hidden, texte: s.textContent } : null;
  });
  const e1 = await etatJonction(page);
  verifier(refus && refus.visible && refus.texte.length > 10, "⚠️ deux niveaux identiques : message dans la fiche", refus);
  verifier(e1.popupOuverte && e1.de === 0 && e1.vers === -1 && !e1.canUndo, "⚠️ refus : fiche ouverte, rien d'écrit, aucune entrée ⏪", e1);

  // Arrivée → +1.
  await appliquerNiveaux(page, 0, 1);
  const e2 = await etatJonction(page);
  verifier(e2.de === 0 && e2.vers === 1 && !e2.level, "niveaux appliqués : 0 ↔ +1 (pas de `level` posé)", e2);
  verifier(!e2.popupOuverte && /0 ↔ \+1/.test(e2.toast), "fiche fermée, toast « 0 ↔ +1 »", e2.toast);
  verifier(e2.updatedAt > 1000, "touch : updatedAt avancé (synchro)", e2.updatedAt);
  verifier(e2.route && e2.route.ok && e2.route.viaJonction, "itinéraire 0 → +1 trouvé, il emprunte la jonction", e2.route);
  const f2 = await ouvrirFiche(page);
  verifier(f2 && /Jonction N0 ↔ N\+1/.test(f2.titre) && f2.vers === "1", "fiche rouverte : titre et liste à jour", f2);
  await page.evaluate(function () { window.map.closePopup(); });

  // Filtre et ronds : niveau -1 seul affiché → la jonction 0 ↔ +1 quitte la carte avec ses ronds.
  await page.evaluate(function () { window.APP_CONFIG.visibleLevels = [-1]; window.appliquerFiltreNiveau(); });
  const e3 = await etatJonction(page);
  verifier(!e3.fiche && e3.ronds === 0, "filtre « -1 » : jonction 0 ↔ +1 masquée, ronds compris", e3);

  // ⏪ : une seule entrée annule les deux bouts.
  const sig = await page.evaluate(function () {
    if (!window.RoadGraph || !window.RoadGraph.stats) return null;
    window.RoadGraph.getGraph();
    const avant = window.RoadGraph.stats().sig;
    window.HistoryManager.undo();
    window.RoadGraph.getGraph();
    return { avant: avant, apres: window.RoadGraph.stats().sig };
  });
  await page.waitForTimeout(400);
  const e4 = await etatJonction(page);
  verifier(e4.de === 0 && e4.vers === -1 && !e4.canUndo, "⏪ ×1 : jonction revenue à 0 ↔ -1 (une seule entrée)", e4);
  verifier(e4.fiche && e4.ronds === 2, "⏪ : de nouveau affichée au filtre « -1 », ronds compris", e4);
  verifier(e4.route && !e4.route.ok, "⏪ : l'itinéraire 0 → +1 redevient impossible", e4.route);
  verifier(sig && sig.avant !== sig.apres, "🩸 graphe de navigation : la signature suit les niveaux de la jonction", sig);
  await page.evaluate(function () { window.HistoryManager.redo(); });
  await page.waitForTimeout(400);
  const e5 = await etatJonction(page);
  verifier(e5.de === 0 && e5.vers === 1 && e5.route && e5.route.ok && !e5.fiche, "⏩ : 0 ↔ +1 rétabli, itinéraire de nouveau trouvé", e5);

  // Note.
  await page.evaluate(function () { window.APP_CONFIG.visibleLevels = [-1, 0, 1]; window.appliquerFiltreNiveau(); });
  const avantNote = (await etatJonction(page)).updatedAt;
  await ouvrirFiche(page);
  await page.fill(".leaflet-popup-content .kta-note-popup-textarea", "Échelle fixe, 12 barreaux");
  await page.click(".leaflet-popup-content .kta-note-popup-save");
  await page.waitForTimeout(1200);
  const e6 = await etatJonction(page);
  verifier(e6.note === "Échelle fixe, 12 barreaux" && e6.updatedAt >= avantNote, "note de la jonction enregistrée (touch)", e6);

  // Suppression puis ⏪.
  await ouvrirFiche(page);
  await page.click(".leaflet-popup-content .kta-note-popup-supprimer");
  await page.waitForTimeout(600);
  const e7 = await etatJonction(page);
  verifier(!e7.present && !e7.fiche && e7.ronds === 0, "🗑️ : jonction supprimée, ronds partis", e7);
  verifier(e7.trace, "🗑️ : trace de suppression posée (synchro)", e7);
  verifier(e7.route && !e7.route.ok, "🗑️ : plus d'itinéraire entre les niveaux", e7.route);
  await page.evaluate(function () { window.HistoryManager.undo(); });
  await page.waitForTimeout(500);
  const e8 = await etatJonction(page);
  verifier(e8.present && e8.de === 0 && e8.vers === 1 && e8.note === "Échelle fixe, 12 barreaux" && e8.fiche && e8.ronds === 2,
    "⏪ : jonction revenue avec ses niveaux et sa note", e8);
  verifier(!e8.trace, "⏪ : la trace de suppression est retirée", e8);
  verifier(e8.route && e8.route.ok, "⏪ : l'itinéraire repasse par la jonction", e8.route);

  // Persistance.
  await page.evaluate(function () { return window.SessionPersist.save({ force: true }); });
  await page.waitForTimeout(1500);
  await ouvrir(page);
  const e9 = await page.evaluate(function () {
    const j = (window.getRoads() || []).find(function (r) { return r && r.uid === "rd_jct"; });
    return j ? { de: j.fromLevel, vers: j.toLevel, note: j.description } : null;
  });
  verifier(e9 && e9.de === 0 && e9.vers === 1 && e9.note === "Échelle fixe, 12 barreaux", "rechargé : niveaux et note restaurés", e9);

  // Lecture seule : fiche en lecture, l'API refuse.
  await simulerExtension(page, { lectureSeule: true });
  await page.evaluate(function () {
    const j = window.getRoads().find(function (r) { return r.uid === "rd_jct"; });
    const b = j.points[0];
    window.map.setView([window.APP_CONFIG.imageHeight - b.y, b.x + 18], window.map.getZoom(), { animate: false });
    window.APP_CONFIG.visibleLevels = [-1, 0, 1];
    window.appliquerFiltreNiveau();
  });
  await page.waitForTimeout(500);
  const fRo = await ouvrirFiche(page);
  verifier(fRo && fRo.lecture && fRo.de === null && !fRo.supprimer, "🔒 lecture seule : fiche en lecture (ni niveaux, ni 🗑️)", fRo);
  const refusRo = await page.evaluate(function () {
    const j = window.getRoads().find(function (r) { return r.uid === "rd_jct"; });
    return { r: window.KtaConvertir.changerNiveauxJonction(j, -2, 2), de: j.fromLevel, vers: j.toLevel };
  });
  verifier(refusRo.r === false && refusRo.de === 0 && refusRo.vers === 1, "🔒 lecture seule : changement de niveaux refusé", refusRo);
}

// ── B. Effacer la session depuis 📊 Détails ──────────
async function semerPoints(page) {
  await page.evaluate(function () {
    const t0 = Date.now() - 3600000;
    const p = function (uid, nom) { return { uid: uid, id: nom, name: nom, x: 1000, y: 1000, tag: "puits", updatedAt: t0 }; };
    window.setEditorPoints([p("pt_moi1", "Mien 1"), p("pt_moi2", "Mien 2"), p("pt_aut1", "Autre 1")]);
    window.KtaUid.setTombstones([]);
    if (window.renderEditorPoints) window.renderEditorPoints();
  });
}

async function ouvrirDetails(page) {
  await page.evaluate(function () { window.ktaOuvrirDetailsSession(); });
  await attendre(page, function () { return !!document.getElementById("kta-refonte-session-modal"); }, 5000);
  return page.evaluate(function () { return !!document.getElementById("kta-refonte-session-effacer"); });
}

async function clicEffacer(page) {
  await page.click("#kta-refonte-session-effacer");
  await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 15000);
  await page.waitForTimeout(450);   // garde anti-double-clic de ktaConfirm
  return page.evaluate(function () {
    const ov = document.getElementById("kta-confirm-oui").closest(".kta-readme-modal-overlay");
    const radios = [].slice.call(document.querySelectorAll("[data-kta-confirm-choix]"));
    return { texte: ov ? ov.textContent : "", choix: radios.map(function (r) { return r.value; }),
      coche: radios.some(function (r) { return r.checked; }), okInactif: document.getElementById("kta-confirm-oui").disabled,
      auDessus: ov ? Number(getComputedStyle(ov).zIndex) > 99999 : false };
  });
}

function etatSession(page) {
  return page.evaluate(function () {
    return { pts: window.getEditorPoints().map(function (p) { return p.uid; }).sort(),
      traces: (window.KtaUid.getTombstones() || []).map(function (t) { return t.uid; }).sort(),
      details: !!document.getElementById("kta-refonte-session-modal"),
      toast: (document.getElementById("kta-toast") || {}).textContent || "" };
  });
}

async function partieEffacer(page) {
  await ouvrir(page);
  const titreApp = await page.evaluate(function () { return window.I18n.t("session.confirm.clearTitle"); });

  // Plan local : annuler puis confirmer.
  await semerPoints(page);
  verifier(await ouvrirDetails(page), "📊 Détails : bouton 🗑️ Effacer la session présent");
  const c1 = await clicEffacer(page);
  verifier(c1.texte.indexOf(titreApp) >= 0 && !c1.choix.length && c1.auDessus,
    "plan local : la confirmation de l'app (même titre, sans choix), au-dessus des Détails", c1);
  await page.click("#kta-confirm-non");
  await page.waitForTimeout(500);
  const s1 = await etatSession(page);
  verifier(s1.pts.length === 3 && s1.details, "annuler : rien d'effacé, Détails toujours ouverts", s1);
  await clicEffacer(page);
  await page.click("#kta-confirm-oui");
  await page.waitForTimeout(1500);
  const s2 = await etatSession(page);
  verifier(!s2.pts.length && !s2.traces.length && !s2.details, "confirmer : session vidée, aucune trace, Détails fermés", s2);

  // Plan partagé, N modifications en attente d'envoi : trois choix, rien de présélectionné ; on annule.
  await ouvrir(page);
  await semerPoints(page);
  await simulerExtension(page, { effacer: { miens: true, tout: true, auteur: "moi", enAttente: 4 } });
  await ouvrirDetails(page);
  const c2 = await clicEffacer(page);
  verifier(c2.choix.join() === "appareil,miens,tout" && !c2.coche && c2.okInactif && /\(4 modification/.test(c2.texte),
    "plan partagé, 4 en attente : trois choix (dont « Annuler … (4 modifications) »), rien de présélectionné, OK inactif", c2);
  await page.click("#kta-confirm-non");
  await page.waitForTimeout(400);

  // Plan partagé, rien en attente : deux choix, « mes ajouts ».
  await ouvrir(page);
  await semerPoints(page);
  await simulerExtension(page, { effacer: { miens: true, tout: true, auteur: "moi" } });
  await ouvrirDetails(page);
  const c3 = await clicEffacer(page);
  verifier(c3.choix.join() === "miens,tout" && !c3.coche && c3.okInactif,
    "plan partagé, 0 en attente : deux choix (mes ajouts, tout), rien de présélectionné", c3);
  await page.evaluate(function () {
    document.querySelector('[data-kta-confirm-choix="miens"]').click();
    document.getElementById("kta-confirm-oui").click();
  });
  await page.waitForTimeout(900);
  const seconde = await page.evaluate(function () {
    const o = document.getElementById("kta-confirm-oui");
    const ov = o ? o.closest(".kta-readme-modal-overlay") : null;
    return ov ? ov.textContent : null;
  });
  verifier(!!seconde && /(^|\D)2 objet/.test(seconde), "« mes ajouts » : confirmation chiffrée (2 objets)", seconde);
  await page.waitForTimeout(450);
  await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
  await page.waitForTimeout(1500);
  const s3 = await etatSession(page);
  verifier(JSON.stringify(s3.traces) === "[\"pt_moi1\",\"pt_moi2\"]" && !s3.pts.length && !s3.details,
    "« mes ajouts » : une trace par objet à moi, appareil vidé, Détails fermés", s3);

  // Plan ☁️ en lecture seule (même règle aux deux entrées) : « Rien à effacer : ce plan vient du serveur ».
  const DROITS = { lectureSeule: true, effacer: { miens: true, tout: true, auteur: "moi", enAttente: 3 } };
  const rienTexte = await page.evaluate(function () { return window.I18n.t("session.partage.rienServeur"); });
  await ouvrir(page);
  await semerPoints(page);
  await simulerExtension(page, DROITS);
  await ouvrirDetails(page);
  const bRo = await page.evaluate(function () {
    const b = document.getElementById("kta-refonte-session-effacer");
    return b ? { texte: b.textContent, inactif: b.disabled } : null;
  });
  verifier(bRo && bRo.inactif && bRo.texte === rienTexte, "🔒 lecture seule ☁️ (Détails) : bouton inactif « Rien à effacer : ce plan vient du serveur »", bRo);
  const s4 = await etatSession(page);
  verifier(s4.pts.length === 3, "🔒 lecture seule ☁️ (Détails) : rien n'est effacé", s4);

  await page.evaluate(function () { return window.SessionPersist.save({ force: true }); });
  await page.waitForTimeout(1200);
  await ouvrir(page, true);
  await attendre(page, function () { return !!document.querySelector('#kta-session-modal [data-action="clear"]'); }, 10000);
  await simulerExtension(page, DROITS);
  await page.click('#kta-session-modal [data-action="clear"]');
  await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 15000);
  await page.waitForTimeout(450);
  const r2 = await page.evaluate(function () {
    const ov = document.getElementById("kta-confirm-oui").closest(".kta-readme-modal-overlay");
    return { texte: ov ? ov.textContent : "", choix: document.querySelectorAll("[data-kta-confirm-choix]").length,
      annuler: !!document.getElementById("kta-confirm-non") };
  });
  await page.click("#kta-confirm-oui");
  await page.waitForTimeout(600);
  const s5 = await etatSession(page);
  verifier(r2.texte.indexOf(rienTexte) >= 0 && !r2.choix && !r2.annuler,
    "🔒 lecture seule ☁️ (« Session précédente restaurée ») : message « Rien à effacer », sans fenêtre de choix", r2);
  verifier(s5.pts.length === 3 && !s5.traces.length, "🔒 lecture seule ☁️ (« Session précédente restaurée ») : rien n'est effacé", s5);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
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
    console.log("A. Fiche d'une jonction");
    await partieJonction(page);
    console.log("B. Effacer la session depuis 📊 Détails");
    await partieEffacer(page);
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
  console.log("🎉 CHECKUP VERT — fiche de jonction (note, niveaux, suppression, ⏪, itinéraire) et Effacer depuis les Détails.");
  process.exit(0);
})();
