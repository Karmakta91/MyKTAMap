#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-dessin-sans-fiche.js — checkup (Playwright) : outil de dessin armé = tout toucher pose un sommet
// =====================================================================
// Relevé fictif, objets FICTIFS posés en mémoire autour du centre de la vue : POI de session, structure, zone et tracé
// de session (tracé annoté : fantôme de la note), POI, structure, zone et tracé d'un calque de données fabriqué (blob,
// notes en lecture seule), itinéraire. Pour chaque outil (tracé, zone, structure, mesure), armé par son panneau, un
// toucher sur chaque objet doit poser UN sommet au point touché (au px plan près) et n'ouvrir aucune fiche (popup,
// modale) ; l'outil reste armé. Hors outil, la fiche s'ouvre comme avant (POI, structure, zone, tracé, calque).
// Ajout de point (✏️ modeEdition) : sa fenêtre de nommage s'ouvre, même sur un POI. « Où es-tu ? »
// (ktaDemanderPositionCarte) et recalage (📍) : le toucher sur un POI rend la position touchée, sans fiche. Appui long
// sur un sommet, outil armé : pas d'ajustement (ajusterSommets.js) ; outil désarmé : le 1er toucher rouvre la fiche.
// Un seul outil armé (POI / mesure / zone / tracé). Échap, 3 sommets posés : même fin que le re-clic du bouton de type
// (tracé, zone, structure, mesure), ajout de point désarmé. Vue 3D d'édition, outil armé (colonne toujours active, sans
// interrupteur) : panneau de POI, pilier, zone → sommet, aucune fiche ; armé par les vrais boutons (groupe, type) puis
// le sol ; un seul outil ; ✏️ ajout de point à sa place dans la colonne ; outil armé en 2D puis vue d'édition : le PREMIER
// toucher pose ; outil armé à hauteur d'yeux : toucher consommé, aucune fiche.
// Clic lent sous une image lourde, recul maximal (150 m) aux 4 coins et 3 inclinaisons (point du plan y = 0 à 5 cm,
// ramené dans les bornes de l'image hors du plan), Galerie hors tube : sommet posé.
// Joué au doigt (393 × 852, hasTouch, isMobile) et à la souris (1280 × 800), sous Chromium puis WebKit (KTA_MOTEURS
// pour un seul).
// Usage : node scripts/smoke/checkup-dessin-sans-fiche.js (SMOKE_PORT pour une autre copie) · doc : ui.md § Outil armé
// =====================================================================
"use strict";

const navigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const ENTREES = [
  { nom: "doigt",
    ctx: { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 } },
  { nom: "souris", ctx: { viewport: { width: 1280, height: 800 } } }
];
// Outils armés par leur panneau (groupe de la barre de droite, libellé du bouton) ; `mode` relu après le choix.
const OUTILS = [
  { nom: "tracé", groupe: "traces", cle: "ui.trace.principal" },
  { nom: "zone", groupe: "zones", cle: "ui.zone.eau" },
  { nom: "structure", groupe: "structures", cle: "ui.struct.pilier1" },
  { nom: "mesure", groupe: "mesure", cle: "ui.subaction.mesureDistance" }
];
const CIBLES = ["poiSession", "poiCalque", "structSession", "structCalque", "zoneSession", "zoneCalque",
  "traceSession", "traceCalque", "itineraire"];

const problemes = [];
let prefixe = "";
function pb(msg) { problemes.push(prefixe + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) {
  if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : ""));
}

// ── Dans la page : objets fictifs autour du centre de la vue (zoom 0 : 1 px plan = 1 px écran) ──────────
function semer() {
  const C = window.APP_CONFIG, H = C.imageHeight;
  C.visibleLevels = (C.availableLevels || [0]).slice();
  C.activeLevel = 0;
  if (typeof window.getTrackingActif === "function" && window.getTrackingActif()) window.stopTracking();
  // Calques du plan retirés de la carte : seuls les objets du checkup sont sous le doigt. 🩸 Sauf le calque des
  // annotations (window.layerEditor) : il porte aussi les objets de session.
  const g = window.dataLayerGroups || {};
  Object.keys(g).forEach(function (k) {
    if (g[k] === window.layerEditor) return;
    try { window.map.removeLayer(g[k]); } catch (e) { /* déjà retiré */ }
  });
  const c = window.map.getCenter();
  const cx = Math.round(c.lng), cy = Math.round(H - c.lat);
  const P = function (dx, dy) { return { x: cx + dx, y: cy + dy }; };
  const carre = function (dx, dy, d) {
    return [P(dx - d, dy - d), P(dx + d, dy - d), P(dx + d, dy + d), P(dx - d, dy + d)];
  };
  const F = {
    cx: cx, cy: cy,
    poiSession: P(-90, 270), poiCalque: P(90, 270),
    structSession: P(-90, -90), structCalque: P(90, -90),
    zoneSession: P(-90, 20), zoneCalque: P(90, 20),
    traceSession: P(-90, 120), traceCalque: P(90, 120),
    itineraire: P(0, 200)
  };
  window.__dsf = F;
  F.poser = function () {
    window.setEditorPoints([Object.assign({ id: "PoiSessionDsf", nom: "PoiSessionDsf", uid: "pt_dsf_s", level: 0,
      tags: ["salle"], description: "" }, F.poiSession)]);
    window.setStructures([{ uid: "st_dsf_s", type: "pilier-1", level: 0, points: carre(-90, -90, 25),
      description: "note du pilier" }]);
    window.setZones([{ uid: "zn_dsf_s", type: "eau", level: 0, points: carre(-90, 20, 30),
      description: "note de zone" }]);
    window.setRoads([
      { uid: "rd_dsf_s", type: "principal", level: 0, points: [P(-160, 120), P(-20, 120)],
        description: "note du tracé" },
      { uid: "rd_dsf_iti", type: "itinerary", level: 0, points: [P(-160, 200), P(160, 200)] }
    ]);
    if (window.resetMesure) window.resetMesure();
    if (window.HistoryManager && window.HistoryManager.reset) window.HistoryManager.reset();
  };
  // Vue 3D : objets serrés autour du départ (la vue plongeante montre une vingtaine de mètres).
  F.v3d = { depart: P(0, 0), pilier: P(0, -14), zone: P(14, 6), poi: P(-12, 6) };
  F.poser3D = function () {
    F.poser();
    const V = F.v3d;
    window.setEditorPoints([Object.assign({ id: "PoiSessionDsf", nom: "PoiSessionDsf", uid: "pt_dsf_s", level: 0,
      tags: ["salle"], description: "" }, V.poi)]);
    window.setStructures([{ uid: "st_dsf_s", type: "pilier-1", level: 0, points: carre(0, -14, 5) }]);
    window.setZones([{ uid: "zn_dsf_s", type: "remblais", level: 0, points: carre(14, 6, 6) }]);
    window.setRoads([]);
  };
  F.poser();
  const json = {
    data: [Object.assign({ id: "PoiCalqueDsf", nom: "PoiCalqueDsf", uid: "pt_dsf_c", tags: ["info"], level: 0,
      description: "" }, F.poiCalque)],
    structures: [{ uid: "st_dsf_c", type: "pilier-1", level: 0, points: carre(90, -90, 25), description: "note RO" }],
    zones: [{ uid: "zn_dsf_c", type: "eau", level: 0, points: carre(90, 20, 30), description: "note RO" }],
    roads: [{ uid: "rd_dsf_c", type: "principal", level: 0, points: [P(20, 120), P(160, 120)], description: "note RO" }]
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
  const groupe = L.layerGroup().addTo(window.map);
  window.dataLayerGroups = window.dataLayerGroups || {};
  window.dataLayerGroups.kta_test_dsf = groupe;
  window.__dsfGroupe = groupe;
  window.ajouterPointsDepuisJSON(url, groupe);
}

// Point écran (client) de chaque cible : icône du marqueur pour un POI, point plan sinon.
function ciblesEcran() {
  const F = window.__dsf, m = window.map, H = window.APP_CONFIG.imageHeight;
  const rc = m.getContainer().getBoundingClientRect();
  const out = {};
  const ecran = function (p) {
    const q = m.latLngToContainerPoint(L.latLng(H - p.y, p.x));
    return { x: rc.left + q.x, y: rc.top + q.y };
  };
  ["structSession", "structCalque", "zoneSession", "zoneCalque", "traceSession", "traceCalque"].forEach(function (k) {
    out[k] = ecran(F[k]);
  });
  out.itineraire = ecran({ x: F.itineraire.x + 40, y: F.itineraire.y });
  const icone = function (p) {
    let el = null;
    m.eachLayer(function (l) {
      if (!el && l instanceof L.Marker && l._icon) {
        const ll = l.getLatLng();
        if (Math.abs(ll.lng - p.x) < 0.5 && Math.abs(ll.lat - (H - p.y)) < 0.5) el = l._icon;
      }
    });
    if (!el) return null;
    const img = el.querySelector("img") || el;
    const r = img.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  out.poiSession = icone(F.poiSession);
  out.poiCalque = icone(F.poiCalque);
  Object.keys(out).forEach(function (k) {
    const p = out[k];
    if (!p) return;
    const el = document.elementFromPoint(p.x, p.y);
    p.sous = el ? (el.tagName.toLowerCase() + (el.className && el.className.baseVal !== undefined
      ? "." + el.className.baseVal : (el.className ? "." + String(el.className).split(" ")[0] : ""))) : null;
  });
  return out;
}

// État lu après un toucher : fiche ouverte, sommets de l'objet en cours, dernier sommet (px plan).
function lireEtat() {
  const enCours = function () {
    if (window.modeRoad) return window.getCurrentRoad && window.getCurrentRoad();
    if (window.modeZone) return window.getCurrentZone && window.getCurrentZone();
    if (window.modeStructure) return window.getCurrentStructure && window.getCurrentStructure();
    return null;
  };
  let pts = [];
  if (window.modeMesure) pts = window.getMeasurePoints() || [];
  else { const o = enCours(); pts = (o && o.points) || []; }
  const fiche = Array.prototype.slice.call(document.querySelectorAll(
    ".leaflet-popup, .kta-readme-modal-overlay, #kta-poi-modal, .kta-modal-overlay")).filter(function (el) {
    return el.offsetParent !== null || getComputedStyle(el).position === "fixed";
  }).map(function (el) { return el.id || el.className.split(" ")[0]; });
  const arme = !!(window.modeRoad || window.modeZone || window.modeStructure || window.modeMesure);
  return { n: pts.length, dernier: pts.length ? pts[pts.length - 1] : null, fiche: fiche, arme: arme };
}

function remettre() {
  try { window.map.closePopup(); } catch (e) { /* aucune */ }
  document.querySelectorAll(".kta-readme-modal-overlay, .kta-modal-overlay").forEach(function (o) { o.remove(); });
  const pm = document.getElementById("kta-poi-modal");
  if (pm) pm.remove();
  if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
  window.modeEdition = false;
  window.__dsf.poser();
  // 🩸 Une fiche ouverte déplace la carte (autoPan) : vue reposée, sinon les cibles suivantes sont manquées.
  const F = window.__dsf;
  window.map.setView(L.latLng(window.APP_CONFIG.imageHeight - F.cy, F.cx), 0, { animate: false });
}

function armer(o) {
  if (typeof window.ktaOuvrirOutils !== "function") return { arme: false, raison: "ktaOuvrirOutils absent" };
  window.ktaOuvrirOutils(o.groupe);
  const fly = document.querySelector(".kta-group-flyout");
  if (!fly) return { arme: false, raison: "panneau absent" };
  const lib = window.I18n.t(o.cle);
  const btn = Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (b) {
    return b.textContent.indexOf(lib) >= 0;
  })[0];
  if (!btn) { window.ktaFermerOutils(); return { arme: false, raison: "bouton absent : " + lib }; }
  btn.click();
  if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
  return { arme: !!(window.modeRoad || window.modeZone || window.modeStructure || window.modeMesure),
    modes: [window.modeRoad, window.modeZone, window.modeStructure, window.modeMesure] };
}

// Outils armés (drapeaux de la carte), pour la règle « un seul outil à la fois ».
function modesArmes() {
  const out = [];
  if (window.modeEdition) out.push("poi");
  if (window.modeMesure) out.push("mesure");
  if (window.modeRoad) out.push("tracé");
  if (window.modeZone) out.push("zone");
  if (window.modeStructure) out.push("structure");
  if (window.modeRecalage) out.push("recalage");
  return out;
}

// Ajout de point armé par son bouton (✏️ de la barre de droite, sans panneau).
function armerPoi() {
  const g = window._groupes && window._groupes.edition;
  if (!g || !g.btnPrincipal) return false;
  if (!window.modeEdition) g.btnPrincipal.click();
  return window.modeEdition === true;
}

// Point plan attendu sous un point écran (client).
function planSous(p) {
  const m = window.map, rc = m.getContainer().getBoundingClientRect();
  const ll = m.containerPointToLatLng([p.x - rc.left, p.y - rc.top]);
  return { x: ll.lng, y: window.APP_CONFIG.imageHeight - ll.lat };
}

async function toucher(page, entree, p) {
  if (entree === "doigt") await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(450);   // > délai de double-toucher et de rendu
}

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().some(function (p) { return /fictif/i.test(p.name || ""); });
  }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.evaluate(function () {
    const p = window.PlanRegistry.getAll().find(function (x) { return /fictif/i.test(x.name || ""); });
    window.chargerPlanDuRegistre(p.id);
  });
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && typeof window.ajouterPointsDepuisJSON === "function" &&
      !!window._groupes;
  }, 40000);
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    window.map.setZoom(0, { animate: false });
  });
  await page.waitForTimeout(600);
  await page.evaluate(semer);
  await attendre(page, function () {
    const g = window.__dsfGroupe;
    return (window._ktaDataMarkers || []).some(function (m) { return m && m._ktaLayer === g && m._icon; });
  }, 15000);
  await page.waitForTimeout(500);
}

// ── 2D : chaque outil × chaque cible ─────────────────────────────────────────────────────────────────
async function section2D(page, entree) {
  const cibles = await page.evaluate(ciblesEcran);
  console.log("    sous le doigt : " + CIBLES.map(function (k) {
    return k + "=" + (cibles[k] ? cibles[k].sous : "∅");
  }).join(" "));
  verifier(CIBLES.every(function (k) { return !!cibles[k]; }), "toutes les cibles à l'écran",
    CIBLES.filter(function (k) { return !cibles[k]; }));

  // Hors outil : la fiche s'ouvre (référence : sinon le reste ne prouverait rien).
  const sansOutil = {};
  for (const k of ["poiSession", "poiCalque", "structSession", "structCalque", "zoneSession", "zoneCalque",
    "traceSession", "traceCalque"]) {
    if (!cibles[k]) continue;
    await page.evaluate(remettre);
    await page.waitForTimeout(150);
    await toucher(page, entree, cibles[k]);
    sansOutil[k] = (await page.evaluate(lireEtat)).fiche;
  }
  await page.evaluate(remettre);
  const sansFiche = Object.keys(sansOutil).filter(function (k) { return !sansOutil[k].length; });
  verifier(sansFiche.length === 0, "sans outil : la fiche de chaque objet s'ouvre", sansFiche);

  for (const o of OUTILS) {
    const fautes = [];
    for (const k of CIBLES) {
      if (!cibles[k]) continue;
      await page.evaluate(remettre);
      await page.waitForTimeout(150);
      const a = await page.evaluate(armer, o);
      if (!a.arme) { fautes.push(k + " : outil non armé " + JSON.stringify(a)); continue; }
      await page.waitForTimeout(150);
      const avant = await page.evaluate(lireEtat);
      const attendu = await page.evaluate(planSous, cibles[k]);
      await toucher(page, entree, cibles[k]);
      const apres = await page.evaluate(lireEtat);
      const pose = apres.n === avant.n + 1;
      const ecart = apres.dernier ? Math.hypot(apres.dernier.x - attendu.x, apres.dernier.y - attendu.y) : null;
      if (!pose || apres.fiche.length || !apres.arme || ecart > 3) {
        fautes.push(k + " : " + JSON.stringify({ sommets: apres.n - avant.n, fiche: apres.fiche, arme: apres.arme,
          ecart: ecart === null ? null : +ecart.toFixed(1), sous: cibles[k].sous }));
      }
    }
    verifier(fautes.length === 0, "outil " + o.nom + " : un sommet au point touché, aucune fiche, sur les " +
      CIBLES.length + " cibles", fautes);
  }
  await page.evaluate(remettre);

  // Appui long sur un sommet, outil armé : l'ajustement des formes (ajusterSommets.js) ne part pas, aucune fiche.
  // Puis l'outil désarmé : le premier toucher rouvre la fiche (aucun état resté en retard d'un geste).
  await page.evaluate(remettre);
  await page.evaluate(armer, OUTILS[1]);
  const coin = await page.evaluate(function () {
    const F = window.__dsf, m = window.map, rc = m.getContainer().getBoundingClientRect();
    const q = m.latLngToContainerPoint(L.latLng(window.APP_CONFIG.imageHeight - (F.structSession.y - 25),
      F.structSession.x - 25));
    return { x: rc.left + q.x, y: rc.top + q.y,
      gestes: window.KtaAjusterSommets ? window.KtaAjusterSommets.etat().gestes : null };
  });
  // Appui long au pointeur principal (Playwright n'a pas d'appui long au doigt) ; l'écoute est la même (pointerdown).
  await page.mouse.move(coin.x, coin.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const appui = await page.evaluate(function (g0) {
    return { gestes: window.KtaAjusterSommets ? window.KtaAjusterSommets.etat().gestes - g0 : null,
      enCours: window.KtaAjusterSommets ? window.KtaAjusterSommets.enCours() : null,
      popup: !!document.querySelector(".leaflet-popup"), zone: !!window.modeZone };
  }, coin.gestes);
  verifier(appui.gestes === 0 && !appui.enCours && !appui.popup && appui.zone,
    "appui long sur un sommet, outil armé : pas d'ajustement, aucune fiche, outil gardé", appui);
  await page.evaluate(function () {
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    window.map.closePopup();
  });
  await page.evaluate(remettre);
  await page.waitForTimeout(150);
  await toucher(page, entree, cibles.poiSession);
  const rouvre = await page.evaluate(lireEtat);
  verifier(rouvre.fiche.length > 0, "outil désarmé : le premier toucher sur un POI rouvre sa fiche", rouvre);
  await page.evaluate(remettre);

  // Ajout de point : sa fenêtre de nommage s'ouvre, même touché sur un POI (exclusion voulue).
  const ajout = [];
  for (const k of ["poiCalque", "structSession"]) {
    await page.evaluate(remettre);
    await page.evaluate(function () { window.modeEdition = true; });
    await toucher(page, entree, cibles[k]);
    ajout.push({ k: k, modale: await page.evaluate(function () { return !!document.getElementById("kta-poi-modal"); }),
      popup: await page.evaluate(function () { return !!document.querySelector(".leaflet-popup"); }) });
  }
  await page.evaluate(remettre);
  verifier(ajout.every(function (a) { return a.modale && !a.popup; }),
    "ajout de point : fenêtre de nommage, pas de fiche", ajout);

  // « Où es-tu ? » : le toucher sur un POI rend la position touchée, sans fiche. Le POI est amené au centre : au
  // téléphone, le bandeau du picker (bas de l'écran) le couvrirait.
  const auCentre = async function (k) {
    await page.evaluate(function (k) {
      const F = window.__dsf;
      window.map.setView(L.latLng(window.APP_CONFIG.imageHeight - F[k].y, F[k].x), 0, { animate: false });
    }, k);
    await page.waitForTimeout(300);
    return (await page.evaluate(ciblesEcran))[k];
  };
  await page.evaluate(function () {
    window.__dsfPick = null;
    window.ktaDemanderPositionCarte(function (r) { window.__dsfPick = r; }, { recaler: false });
  });
  const ciblePick = await auCentre("poiSession");
  const attPick = await page.evaluate(planSous, ciblePick);
  await toucher(page, entree, ciblePick);
  const pick = await page.evaluate(function () {
    return { r: window.__dsfPick, popup: !!document.querySelector(".leaflet-popup") };
  });
  verifier(!!pick.r && !pick.popup && Math.hypot(pick.r.x - attPick.x, pick.r.y - attPick.y) <= 3,
    "« Où es-tu ? » sur un POI : position touchée, aucune fiche", pick);
  await page.evaluate(function () {
    if (window.ktaDemanderPositionCarte.annuler) window.ktaDemanderPositionCarte.annuler();
  });

  // Recalage 📍 : armé, le toucher sur un POI recale le tracker au point touché, sans fiche.
  await page.evaluate(remettre);
  const rec = await page.evaluate(function () { window.modeRecalage = true; return true; });
  const cibleRec = await auCentre("poiCalque");
  const attRec = await page.evaluate(planSous, cibleRec);
  await toucher(page, entree, cibleRec);
  const recale = await page.evaluate(function () {
    const p = typeof window.getTrackingPosition === "function" ? window.getTrackingPosition() : null;
    return { pos: p ? { x: p.x, y: p.y } : null, popup: !!document.querySelector(".leaflet-popup"),
      encore: window.modeRecalage === true };
  });
  verifier(rec && !recale.popup && !!recale.pos && Math.hypot(recale.pos.x - attRec.x, recale.pos.y - attRec.y) <= 3,
    "recalage sur un POI : tracker au point touché, aucune fiche", recale);
  await page.evaluate(function () { window.modeRecalage = false; });
  await page.evaluate(remettre);

  // Un seul outil à la fois : armer l'un désarme l'autre, dans les deux sens.
  const OUT = { poi: null, mesure: OUTILS[3], zone: OUTILS[1], "tracé": OUTILS[0] };
  const couples = [["poi", "mesure"], ["mesure", "poi"], ["poi", "zone"], ["zone", "poi"], ["mesure", "tracé"],
    ["tracé", "mesure"]];
  const doubles = [];
  for (const c of couples) {
    await page.evaluate(remettre);
    for (const nom of c) {
      if (nom === "poi") await page.evaluate(armerPoi);
      else await page.evaluate(armer, OUT[nom]);
    }
    const m = await page.evaluate(modesArmes);
    if (m.length !== 1 || m[0] !== c[1]) doubles.push(c.join(" puis ") + " → " + JSON.stringify(m));
  }
  await page.evaluate(remettre);
  verifier(doubles.length === 0, "2D : un seul outil armé (POI / mesure / zone / tracé, dans les deux sens)", doubles);

  // Échap désarme l'outil comme son bouton (shortcuts.js > _echapCarte) : 3 sommets posés, puis Échap ou re-clic du
  // bouton de type ; l'objet en cours finit pareil (mêmes listes, rien en cours), outil et bouton éteints.
  const bilan = function () {
    const cours = [window.getCurrentRoad, window.getCurrentZone, window.getCurrentStructure].some(function (f) {
      try { return typeof f === "function" && !!f(); } catch (e) { return false; }
    });
    const allume = Object.keys(window._groupes || {}).filter(function (id) {
      const g = window._groupes[id];
      return id !== "tracker" && g.btnPrincipal && (g.btnPrincipal.classList.contains("kta-group-mode-actif") ||
        (g.subActions || []).some(function (b) { return b.classList.contains("kta-actif"); }));
    });
    return { roads: window.getRoads().length, zones: window.getZones().length,
      structs: window.getStructures().length, mesure: (window.getMeasurePoints() || []).length, cours: cours,
      arme: !!(window.modeRoad || window.modeZone || window.modeStructure || window.modeMesure || window.modeEdition),
      allume: allume };
  };
  const echap = [];
  for (const o of OUTILS) {
    const fin = {};
    for (const voie of ["echap", "bouton"]) {
      await page.evaluate(remettre);
      await page.waitForTimeout(150);
      const a = await page.evaluate(armer, o);
      if (!a.arme) { echap.push(o.nom + " : non armé " + JSON.stringify(a)); break; }
      for (const k of ["poiSession", "structSession", "zoneSession"]) await toucher(page, entree, cibles[k]);
      if (voie === "echap") {
        await page.evaluate(function () { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
        await page.keyboard.press("Escape");
      } else {
        await page.evaluate(armer, o);
      }
      await page.waitForTimeout(250);
      fin[voie] = await page.evaluate(bilan);
    }
    if (!fin.echap || !fin.bouton) continue;
    if (fin.echap.arme || fin.echap.allume.length || fin.echap.cours ||
        JSON.stringify(fin.echap) !== JSON.stringify(fin.bouton)) {
      echap.push(o.nom + " : " + JSON.stringify(fin));
    }
  }
  await page.evaluate(remettre);
  await page.evaluate(armerPoi);
  await page.evaluate(function () { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const poiEchap = await page.evaluate(bilan);
  if (poiEchap.arme || poiEchap.allume.length) echap.push("ajout de point : " + JSON.stringify(poiEchap));
  await page.evaluate(remettre);
  verifier(echap.length === 0, "Échap, 3 sommets posés : outil désarmé comme par son bouton (tracé, zone, structure, " +
    "mesure), ajout de point désarmé", echap);
}

// ── 3D plongeante ────────────────────────────────────────────────────────────────────────────────────
async function section3D(page, entree) {
  // js/vue3d.js n'est chargé qu'à la première ouverture (interface.js > _chargerVue3D) : même chemin.
  await page.evaluate(function () {
    if (window.KtaVue3D) return true;
    return new Promise(function (r) {
      const s = document.createElement("script");
      s.src = "js/vue3d.js";
      s.addEventListener("load", function () { r(true); });
      s.addEventListener("error", function () { r(false); });
      document.head.appendChild(s);
    });
  });
  const pret = await page.evaluate(async function () {
    const K = window.KtaVue3D;
    if (!K) return { ok: false, raison: "KtaVue3D absent" };
    const F = window.__dsf;
    const pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    F.poser3D();
    if (window.KtaGalerie && window.KtaGalerie.invalider) window.KtaGalerie.invalider();
    window.setPlanRenduVue3D(null, "mixte");
    const ok3 = await K.ouvrir({ depart: { x: F.v3d.depart.x, y: F.v3d.depart.y, cap: 0, niveau: 0 },
      commandes: "joystick" });
    if (!ok3) return { ok: false, raison: "vue non ouverte" };
    // Vue d'édition retenue par plan (vue3d.js > _lireEdition) : l'ouverture peut déjà y être.
    if (K.etat().vue !== "plongee") K.basculerVue();
    await pause(400);
    return { ok: K.etat().vue === "plongee" };
  });
  verifier(pret.ok, "vue 3D ouverte en plongée", pret);
  if (!pret.ok) return;

  // Cibles projetées par la caméra de la vue (greffe vide, retirée aussitôt).
  const projeter = function () {
    return page.evaluate(async function () {
      const K = window.KtaVue3D, F = window.__dsf, sc = window.APP_CONFIG.scale;
      const images = async function (n) {
        for (let i = 0; i < n; i++) await new Promise(function (r) { requestAnimationFrame(r); });
      };
      await images(3);
      let ctxV = null;
      const deg = K.greffer({ nom: "dsf-camera", scene: function (ctx) { ctxV = ctx; } });
      if (deg) deg();
      const cv = document.querySelector("#kta-vue3d canvas"), rc = cv.getBoundingClientRect();
      const ecran = function (p, h) {
        const v = new ctxV.THREE.Vector3(p.x / sc, h, p.y / sc).project(ctxV.camera);
        return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height };
      };
      const haut = K.etat().hauteur;
      const pan = (K.etat().panneaux || []).filter(function (q) { return q.nom === "PoiSessionDsf" && q.visible; })[0];
      const out = { pilier: ecran(F.v3d.pilier, haut),
        zone: ecran({ x: F.v3d.zone.x + 2, y: F.v3d.zone.y + 2 }, haut * 0.6),
        poi: pan ? pan.ecran : null };
      Object.keys(out).forEach(function (k) {
        const p = out[k];
        if (!p) return;
        const vu = K.viser(p.x, p.y);
        p.vise = vu ? vu.genre : null;
        p.dans = p.x > rc.left && p.x < rc.right && p.y > rc.top && p.y < rc.bottom;
        const el = document.elementFromPoint(p.x, p.y);
        const cl = el && typeof el.className === "string" ? el.className.split(" ")[0] : "";
        p.sous = el ? (cl || el.tagName) : null;
      });
      return out;
    });
  };
  const etat3 = function () {
    return page.evaluate(function () {
      const K = window.KtaVue3D, d = K.etat().dessin;
      const o = window.modeStructure ? window.getCurrentStructure() : window.modeZone ? window.getCurrentZone()
        : window.modeRoad ? window.getCurrentRoad() : null;
      const n = window.modeMesure ? (window.getMeasurePoints() || []).length : (o && o.points ? o.points.length : 0);
      return { fiche: !!K.etat().fiche, poses: d ? d.poses : 0, n: n,
        popup: !!document.querySelector(".leaflet-popup") };
    });
  };
  const fermerFiche = function () {
    return page.evaluate(function () {
      const b = document.querySelector('#kta-vue3d .kta-v3d-fiche [data-v3d="ficheFermer"]');
      if (b) b.click();
      try { window.map.closePopup(); } catch (e) { /* aucune */ }
    });
  };
  const toucher3 = async function (p) {
    if (entree === "doigt") await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(250);
  };

  let cibles = await projeter();
  console.log("    3D : " + Object.keys(cibles).map(function (k) {
    return k + "=" + (cibles[k] ? (cibles[k].vise || "∅") + "/" + cibles[k].sous + (cibles[k].dans ? "" : " (hors vue)")
      : "absent");
  }).join(" "));
  verifier(!!cibles.poi && cibles.pilier.vise === "structures" && cibles.zone.vise === "zones",
    "3D : panneau de POI, pilier et zone sous le doigt", cibles);

  // Hors outil : la fiche s'ouvre (référence ; réglage ⚙️ Fiches ouvert, sinon coupé par défaut au doigt :
  // checkup-vue-3d.js § 37).
  await page.evaluate(function () { window.setVue3DFichesObjets(true); });
  const ref = {};
  for (const k of ["poi", "pilier", "zone"]) {
    if (!cibles[k]) continue;
    await toucher3(cibles[k]);
    ref[k] = (await etat3()).fiche;
    await fermerFiche();
  }
  verifier(Object.keys(ref).length === 3 && Object.keys(ref).every(function (k) { return ref[k]; }),
    "3D sans outil : la fiche de chaque objet s'ouvre", ref);

  // Chaque outil armé par le panneau de la vue.
  for (const o of OUTILS) {
    const fautes = [];
    for (const k of ["poi", "pilier", "zone"]) {
      if (!cibles[k]) continue;
      const a = await page.evaluate(function (o) {
        window.__dsf.poser3D();
        if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
        const K = window.KtaVue3D;
        const b = document.querySelector('#kta-vue3d .kta-v3d-outils [data-groupe="' + o.groupe + '"]');
        if (b) b.click();
        const fly = document.querySelector(".kta-group-flyout");
        if (!fly) return { arme: false, raison: "panneau absent" };
        const lib = window.I18n.t(o.cle);
        const btn = Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
          return x.textContent.indexOf(lib) >= 0;
        })[0];
        if (btn) btn.click();
        if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
        return { arme: !!(window.modeRoad || window.modeZone || window.modeStructure || window.modeMesure) };
      }, o);
      if (!a.arme) { fautes.push(k + " : non armé " + JSON.stringify(a)); continue; }
      await page.waitForTimeout(800);   // toucher qui ferme le panneau : avalé 700 ms (vue3d.js > DESSIN_AVALER)
      cibles = await projeter();
      const avant = await etat3();
      await toucher3(cibles[k]);
      const apres = await etat3();
      if (apres.fiche || apres.popup || apres.poses !== avant.poses + 1 || apres.n !== avant.n + 1) {
        fautes.push(k + " : " + JSON.stringify({ fiche: apres.fiche, popup: apres.popup,
          poses: apres.poses - avant.poses, sommets: apres.n - avant.n }));
      }
      await fermerFiche();
    }
    verifier(fautes.length === 0, "3D outil " + o.nom + " : sommet, aucune fiche (POI, pilier, zone)", fautes);
  }

  // Un seul outil à la fois dans la vue : POI armé sur la carte avant la vue, puis 📐 de la colonne ; mesure puis
  // tracé ; tracé puis zone. La colonne propose ✏️ ajout de point, à sa place de la barre 2D (décision produit).
  const armer3 = function (o) {
    return page.evaluate(function (o) {
      const K = window.KtaVue3D;
      const b = document.querySelector('#kta-vue3d .kta-v3d-outils [data-groupe="' + o.groupe + '"]');
      if (b) b.click();
      const fly = document.querySelector(".kta-group-flyout");
      if (!fly) return false;
      const lib = window.I18n.t(o.cle);
      const btn = Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (x) {
        return x.textContent.indexOf(lib) >= 0;
      })[0];
      if (btn) btn.click();
      if (window.ktaOutilsOuverts && window.ktaOutilsOuverts()) window.ktaFermerOutils();
      return true;
    }, o);
  };
  const seul3 = [];
  for (const c of [[null, OUTILS[3], "mesure"], [OUTILS[3], OUTILS[0], "tracé"], [OUTILS[0], OUTILS[1], "zone"]]) {
    await page.evaluate(function () {
      if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    });
    if (c[0]) await armer3(c[0]);
    else await page.evaluate(armerPoi);   // par le ✏️ de la carte, resté armé sous la vue
    await armer3(c[1]);
    const m = await page.evaluate(modesArmes);
    if (m.length !== 1 || m[0] !== c[2]) seul3.push((c[0] ? c[0].nom : "poi") + " puis " + c[1].nom + " → " +
      JSON.stringify(m));
  }
  const barrePoi = await page.evaluate(function () {
    return Array.prototype.slice.call(document.querySelectorAll('#kta-vue3d .kta-v3d-outils [data-groupe]'))
      .map(function (a) { return a.dataset.groupe; });
  });
  await page.evaluate(function () {
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    window.modeEdition = false;
  });
  verifier(seul3.length === 0, "3D : un seul outil armé (POI de la carte puis 📐, 📐 puis tracé, tracé puis zone)",
    seul3);
  verifier(barrePoi.indexOf("edition") === 1, "3D : la colonne d'outils propose ✏️ ajout de point, après 📐", barrePoi);

  // Armer par les vrais boutons, au pointeur de l'entrée (souris ou doigt) : groupe, type du panneau, puis le sol.
  const reels = [];
  const centre = async function (sel) {
    const b = await page.locator(sel).first().boundingBox();
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
  };
  const viser = async function (p) {
    if (!p) return false;
    if (entree === "doigt") { await page.touchscreen.tap(p.x, p.y); }
    else {
      await page.mouse.move(p.x - 20, p.y - 10, { steps: 5 });
      await page.mouse.move(p.x, p.y, { steps: 5 });
      await page.mouse.down();
      await page.waitForTimeout(120);
      await page.mouse.up();
    }
    await page.waitForTimeout(250);
    return true;
  };
  for (const o of OUTILS) {
    await page.evaluate(function () {
      window.__dsf.poser3D();
      if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    });
    await page.waitForTimeout(300);
    const pas = [];
    pas.push(await viser(await centre('#kta-vue3d .kta-v3d-outils [data-groupe="' + o.groupe + '"]')));
    const lib = await page.evaluate(function (k) { return window.I18n.t(k); }, o.cle);
    pas.push(await viser(await centre('.kta-group-flyout .kta-group-flyout-btn:has-text("' + lib + '")')));
    const arme = (await page.evaluate(modesArmes)).length === 1;
    await page.waitForTimeout(800);
    const avant = await etat3();
    const cv = await page.locator("#kta-vue3d canvas").first().boundingBox();
    await viser({ x: cv.x + cv.width * 0.62, y: cv.y + cv.height * 0.45 });
    const apres = await etat3();
    if (pas.indexOf(false) >= 0 || !arme || apres.poses !== avant.poses + 1 || apres.n !== avant.n + 1 || apres.fiche) {
      reels.push(o.nom + " : " + JSON.stringify({ boutons: pas, arme: arme, poses: apres.poses - avant.poses,
        sommets: apres.n - avant.n, fiche: apres.fiche }));
    }
  }
  await page.evaluate(function () {
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
  });
  verifier(reels.length === 0, "3D, vrais boutons (groupe, type) puis le sol : sommet posé, pour les 4 outils",
    reels);

  // Clic lent sous une scène lourde : le geste dure 150 ms mais son traitement attend 700 ms (image lente simulée,
  // vue dézoomée). Le toucher reste bref (durée lue sur l'instant du geste) : sommet posé.
  // Puis recul maximal (60 m), inclinaisons 15 / 50 / 85°, 4 coins de la vue : sommet au point du plan y = 0 visé
  // (5 cm près), ou rien au-dessus de l'horizon. Rendu Galerie, zone armée, toucher hors de tout tube : sommet posé.
  const armerZone3 = async function () {
    await page.evaluate(function () {
      window.__dsf.poser3D();
      window.setStructures([]); window.setZones([]); window.setEditorPoints([]);
      if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    });
    await armer3(OUTILS[1]);
    await page.waitForTimeout(800);
  };
  const geste = async function (p, ms) {
    if (entree === "doigt") {
      await page.touchscreen.tap(p.x, p.y);
    } else {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.waitForTimeout(ms || 80);
      await page.mouse.up();
    }
    await page.waitForTimeout(350);
  };
  await armerZone3();
  const cvb = await page.locator("#kta-vue3d canvas").first().boundingBox();
  const lent0 = await etat3();
  // Geste rejoué à la main : lâcher créé 150 ms après l'appui, traité 700 ms plus tard (image lente).
  await page.evaluate(async function (a) {
    const cv = document.querySelector("#kta-vue3d canvas"), r = cv.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerId: 41, pointerType: a.doigt ? "touch" : "mouse",
      isPrimary: true, button: 0, clientX: r.left + r.width * 0.6, clientY: r.top + r.height * 0.6 };
    cv.dispatchEvent(new PointerEvent("pointerdown", o));
    await new Promise(function (ok) { setTimeout(ok, 150); });
    const up = new PointerEvent("pointerup", o);
    const t = performance.now();
    while (performance.now() - t < 700) { /* image lente */ }
    cv.dispatchEvent(up);
    await new Promise(function (ok) { setTimeout(ok, 100); });
  }, { doigt: entree === "doigt" });
  const lent = await etat3();
  const refusLent = await page.evaluate(function () { return window.KtaVue3D.etat().dessin.refus; });
  verifier(lent.poses === lent0.poses + 1 && lent.n === lent0.n + 1,
    "3D, clic de 150 ms traité après une image de 700 ms : sommet posé", { refus: refusLent });

  const loin = [];
  let dansPlan = 0, horsPlan = 0;
  for (const incl of [15, 50, 85]) {
    await armerZone3();
    await page.evaluate(function (incl) {
      const K = window.KtaVue3D;
      K.zoomer(100);   // borné au recul maximal
      K.incliner(incl - K.etat().inclinaison);
    }, incl);
    await page.waitForTimeout(1500);
    for (const c of [[0.08, 0.1], [0.92, 0.1], [0.08, 0.9], [0.92, 0.9]]) {
      // Coin de la scène : ramené vers le centre tant qu'un bouton de la vue (pavé, zoom, colonne d'outils) le couvre.
      const p = await page.evaluate(function (a) {
        const cv = document.querySelector("#kta-vue3d canvas"), r = cv.getBoundingClientRect();
        let fx = a.c[0], fy = a.c[1];
        for (let i = 0; i < 20; i++) {
          // Pixel entier : WebKit arrondit clientX, et 0,5 px vaut plus de 5 cm au loin, au recul maximal.
          const q = { x: Math.round(r.left + r.width * fx), y: Math.round(r.top + r.height * fy) };
          const sous = document.elementFromPoint(q.x, q.y);
          // La zone du joystick (gauche de la vue, au doigt) appartient à la scène : son toucher bref va à _toucher.
          if (sous === cv || (sous && sous.classList.contains("kta-v3d-stick-zone"))) return q;
          fx += (0.5 - fx) * 0.15; fy += (0.5 - fy) * 0.15;
        }
        const el = document.elementFromPoint(r.left + r.width * a.c[0], r.top + r.height * a.c[1]);
        return { couvert: el ? (el.outerHTML || "").slice(0, 120) : null };
      }, { c: c });
      if (p.couvert !== undefined) {
        loin.push(incl + "° coin " + c.join("/") + " : aucun point de la scène libre " + p.couvert);
        continue;
      }
      // Point attendu : rayon de la caméra contre le plan y = 0, calculé ici (greffe vide pour lire la caméra).
      const att = await page.evaluate(function (p) {
        const K = window.KtaVue3D, sc = window.APP_CONFIG.scale;
        let ctxV = null;
        const deg = K.greffer({ nom: "dsf-rayon", scene: function (ctx) { ctxV = ctx; } });
        if (deg) deg();
        const T = ctxV.THREE, rc = document.querySelector("#kta-vue3d canvas").getBoundingClientRect();
        const r = new T.Raycaster();
        r.setFromCamera(new T.Vector2((p.x - rc.left) / rc.width * 2 - 1, -(p.y - rc.top) / rc.height * 2 + 1),
          ctxV.camera);
        const q = r.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), new T.Vector3());
        return { q: q ? { x: q.x * sc, y: q.z * sc } : null, sc: sc, incl: K.etat().inclinaison,
          recul: K.etat().portee.recul, W: Number(window.PLAN_CONFIG.plan.imageWidth),
          H: Number(window.APP_CONFIG.imageHeight) };
      }, p);
      const av = await etat3();
      await geste(p);
      const ap = await etat3();
      const dernier = await page.evaluate(function () {
        const z = window.getCurrentZone && window.getCurrentZone();
        return z && z.points.length ? z.points[z.points.length - 1] : null;
      });
      const nom = incl + "° coin " + c.join("/");
      if (!att.q) {
        if (ap.n !== av.n) loin.push(nom + " : au-dessus de l'horizon, un sommet posé quand même");
        continue;
      }
      // 🩸 Au recul maximal, le bas de la vue (et un coin haut en paysage) voit le sol AU-DELÀ de l'image du relevé
      // fictif : le sommet est alors ramené dans ses bornes (vue3d.js > _poserSommet, décision produit), et l'attendu
      // aussi. Les deux comptes ci-dessous prouvent que les deux cas sont joués.
      const vx = Math.max(0, Math.min(att.W, att.q.x)), vy = Math.max(0, Math.min(att.H, att.q.y));
      if (vx === att.q.x && vy === att.q.y) dansPlan++; else horsPlan++;
      const ecart = dernier ? Math.hypot(dernier.x - vx, dernier.y - vy) / att.sc : null;
      if (ap.n !== av.n + 1 || ecart === null || ecart > 0.05) {
        loin.push(nom + " : " + JSON.stringify({ sommets: ap.n - av.n,
          ecart_m: ecart === null ? null : +ecart.toFixed(3), recul: att.recul, incl: att.incl }));
      }
    }
  }
  verifier(loin.length === 0 && dansPlan > 0 && horsPlan > 0,
    "3D, recul maximal (150 m), inclinaisons 15 / 50 / 85°, 4 coins : sommet au point visé (5 cm), ramené dans "
    + "l'image hors du plan", { ecarts: loin, dansPlan: dansPlan, horsPlan: horsPlan });

  await armerZone3();
  await page.evaluate(function () {
    const F = window.__dsf, P = function (dx, dy) { return { x: F.v3d.depart.x + dx, y: F.v3d.depart.y + dy }; };
    window.setRoads([{ uid: "rd_dsf_gal", type: "principal", level: 0, points: [P(-60, 0), P(60, 0)] }]);
    window.KtaVue3D.basculerRendu("galerie");
    window.KtaVue3D.zoomer(0.5);
  });
  await page.waitForTimeout(800);
  const gal0 = await etat3();
  const rendu = await page.evaluate(function () { return window.KtaVue3D.etat().rendu; });
  await geste({ x: cvb.x + cvb.width * 0.5, y: cvb.y + cvb.height * 0.2 });
  const gal = await etat3();
  const refusGal = await page.evaluate(function () { return window.KtaVue3D.etat().dessin.refus; });
  verifier(rendu === "galerie" && gal.n === gal0.n + 1,
    "3D rendu Galerie, zone armée, toucher hors de tout tube : sommet posé",
    { rendu: rendu, sommets: gal.n - gal0.n, refus: refusGal });
  await page.evaluate(function () {
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    window.KtaVue3D.basculerRendu("mixte");
    window.KtaVue3D.zoomer(0.01);
  });

  // Outil armé sur la carte (2D) puis vue d'édition : rien à ouvrir, le PREMIER toucher pose un sommet, sans fiche.
  // Vue rouverte comme au départ (le bloc précédent l'a dézoomée).
  await page.evaluate(async function () {
    const K = window.KtaVue3D, F = window.__dsf;
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    await K.fermer();
    const n = document.querySelector(".kta-modal-overlay");
    if (n) n.remove();
    await K.ouvrir({ depart: { x: F.v3d.depart.x, y: F.v3d.depart.y, cap: 0, niveau: 0 }, commandes: "joystick" });
    if (K.etat().vue !== "plongee") K.basculerVue();
    await new Promise(function (r) { setTimeout(r, 400); });
  });
  cibles = await projeter();
  const direct = [];
  let directVus = 0;
  for (const k of ["poi", "pilier", "zone"]) {
    if (!cibles[k] || !cibles[k].dans || !cibles[k].sous) continue;   // hors de la fenêtre : rien à toucher
    directVus++;
    await page.evaluate(function () {
      window.__dsf.poser3D();
      if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
      window.toggleStructureMode("pilier-1");   // armé comme sur la carte, aucun bouton de la vue touché
    });
    await page.waitForTimeout(300);
    // 🩸 Le pilier d'une 1re cible abandonné à l'extinction peut finir après le réarmement : armé de nouveau s'il le faut.
    const armeAvant = await page.evaluate(function () {
      if (window.modeStructure !== "pilier-1") window.toggleStructureMode("pilier-1");
      return window.modeStructure;
    });
    const avant = await etat3();
    await toucher3(cibles[k]);
    const e = await etat3();
    if (e.fiche || e.popup || e.n !== 1 || e.poses !== avant.poses + 1) {
      const diag = await page.evaluate(function () {
        return { arme: window.modeStructure || null, refus: window.KtaVue3D.etat().dessin.refus };
      });
      direct.push(k + " : " + JSON.stringify({ sommets: e.n, poses: e.poses - avant.poses, fiche: e.fiche || e.popup,
        armeAvant: armeAvant, arme: diag.arme, refus: diag.refus, sous: cibles[k].sous, vise: cibles[k].vise }));
    }
    await fermerFiche();
  }
  await page.evaluate(function () {
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
  });
  verifier(directVus >= 1 && direct.length === 0,
    "3D d'édition, outil armé directement : le premier toucher pose, aucune fiche (" + directVus + " cibles)", direct);

  // Outil armé à hauteur d'yeux (pas de dessin là) : le toucher est consommé, sans fiche ni sommet.
  await page.evaluate(async function () {
    window.KtaVue3D.basculerVue();
    for (let i = 0; i < 4; i++) await new Promise(function (r) { requestAnimationFrame(r); });
  });
  const yeux = await page.evaluate(function () { return window.KtaVue3D.etat().vue; });
  cibles = await projeter();
  const cvY = await page.locator("#kta-vue3d canvas").first().boundingBox();
  cibles.centre = { x: cvY.x + cvY.width * 0.5, y: cvY.y + cvY.height * 0.55, dans: true };
  const sansBarre = [];
  let yeuxVus = 0;
  for (const k of ["poi", "pilier", "zone", "centre"]) {
    if (!cibles[k] || !cibles[k].dans) continue;
    yeuxVus++;
    await page.evaluate(function () {
      window.__dsf.poser3D();
      window.modeZone = "eau";   // armé hors de la vue (2D), comme un outil resté armé à l'ouverture
    });
    await page.waitForTimeout(300);
    const avant = await etat3();
    await toucher3(cibles[k]);
    const e = await etat3();
    if (e.fiche || e.popup || e.poses !== avant.poses) sansBarre.push(k);
    await fermerFiche();
  }
  await page.evaluate(function () { window.modeZone = null; window.KtaVue3D.basculerVue(); });
  verifier(yeux !== "plongee" && yeuxVus >= 1 && sansBarre.length === 0,
    "3D à hauteur d'yeux, outil armé : aucune fiche, aucun sommet (" + yeuxVus + " cibles)", { vue: yeux, fautes: sansBarre });

  await page.evaluate(async function () {
    if (typeof window._desactiverTousLesModes === "function") window._desactiverTousLesModes();
    await window.KtaVue3D.fermer();
    const n = document.querySelector(".kta-modal-overlay");   // « Je suis ici ? » de la fermeture
    if (n) n.remove();
  });
}

(async function main() {
  const erreurs = [];
  try {
    for (const nomMoteur of navigateur.moteurs()) {
      const nav = await navigateur.lancerMoteur(nomMoteur);
      if (!nav) continue;
      try {
        for (const en of ENTREES) {
          prefixe = "[" + nomMoteur + " · " + en.nom + "] ";
          console.log("\n▶ " + nomMoteur + " · " + en.nom);
          const ctx = await nav.newContext(en.ctx);
          const page = await ctx.newPage();
          page.on("pageerror", function (e) { erreurs.push(prefixe + String(e && e.message)); });
          await page.addInitScript(function (ls) {
            for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) { /* stockage refusé */ } }
          }, LS_PREGATES);
          await ouvrirPlan(page);
          await section2D(page, en.nom);
          await section3D(page, en.nom);
          await ctx.close();
        }
      } finally {
        await nav.close();
      }
    }
    prefixe = "";
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 5));
  } catch (e) {
    pb("exception du harnais : " + (e && e.stack || e));
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — outil armé : chaque toucher pose un sommet, aucune fiche, en 2D comme en 3D.");
  process.exit(0);
})();
