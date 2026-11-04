#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-guidage.js — checkup de release (pas un hook) du guidage d'itinéraire (js/itiGuidage.js)
// =====================================================================
// Dans l'app réelle, en taille téléphone (390×844), ce que scripts/check-guidage.js (logique, réseaux
// fictifs) ne voit pas : rendu, câblage au tracker, en-tête, colonnes de boutons, écran XL.
// Ouvre le plan listé par `data/index.json` (le relevé fictif s'il y est) et choisit deux points nommés :
// aucun nom de plan ni de point ici.
//   G1 bandeau sous l'en-tête, entre les colonnes de boutons · G2 raccord à vol d'oiseau en pointillé ·
//   G3 feuille de route · G4 la consigne change en avançant · G5 écart → « Hors itinéraire ? » + 3 boutons ·
//   G6 consigne reprise sur l'écran XL · G8 urgence sans croix · G9 suivi arrêté : bandeau gardé si
//   position confirmée, masqué sinon · G10 tracé jonction, aperçu par niveau · G11 repère au niveau du tronçon
//   (bandeau 2D, feuille, aperçu 3D ; manœuvre inchangée) · G12 encart « reste » (distance, temps, niveau,
//   réduit retenu, sans chevauchement à 3 tailles) · zéro erreur console / pageerror / clé i18n manquante.
// Captures : $GUID_SHOTS (défaut : dossier temporaire). Usage : node scripts/smoke/checkup-guidage.js
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const os = require("os");
const path = require("path");
require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const SHOTS = process.env.GUID_SHOTS || path.join(os.tmpdir(), "kta-checkup-guidage");
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return (fictif || plans[0] || {}).name || "Relevé fictif de test";
  } catch (e) {
    return "Relevé fictif de test";
  }
}

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg)  { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }

(async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  let nav;
  nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("console", function (m) {
    const t = m.text();
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro|404/i.test(t)) pb("console : " + t);
    if (/\[I18n\] Clé manquante/.test(t)) pb("i18n : " + t);
  });
  page.on("pageerror", function (e) { pb("pageerror : " + e.message); });
  const shot = async function (nom) {
    const f = path.join(SHOTS, nom + ".png");
    await page.screenshot({ path: f });
    inf("capture : " + f);
  };

  try {
    const PLAN = planAOuvrir();
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.getByText(PLAN, { exact: false }).first().click();
    await attendre(page, function () {
      return !!window.PLAN_CONFIG && !!window.map && !!window.ItiGuidage && !!window.Pathfinder;
    }, 30000);
    await page.waitForTimeout(3000);
    ok("plan chargé, ItiGuidage présent");

    // Deux points nommés à 60–250 m (calcul court)
    const choix = await page.evaluate(function () {
      const e = Number(window.APP_CONFIG.scale) || 1;
      const pts = [].concat(window.getEditorPoints ? window.getEditorPoints() : [],
                            window.getAllEmbeddedPoints ? window.getAllEmbeddedPoints() : [])
        .filter(function (p) { return p && p.nom && typeof p.x === "number"; });
      for (let i = 0; i < pts.length; i++) {
        for (let j = 0; j < pts.length; j++) {
          const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / e;
          if (i !== j && d > 60 && d < 250) return { a: pts[i], b: pts[j], d: Math.round(d) };
        }
      }
      return null;
    });
    if (!choix) { pb("aucune paire de points nommés à 60–250 m : checkup impossible sur ce plan"); throw new Error("stop"); }
    inf("trajet entre deux points nommés à ~" + choix.d + " m à vol d'oiseau");

    // Position fictive pilotée par le test (le tracker n'a pas de capteurs ici).
    await page.evaluate(function (a) {
      window.__guidPos = { x: a.x + 12, y: a.y + 9 };   // un peu à côté du point : départ hors tracé probable
      window.getTrackingPosition = function () { return window.__guidPos; };
      window.getTrackingPositionEtat = function () { return { confirmee: true, ts: Date.now(), suiviActif: true }; };
      window.startTracking();
    }, choix.a);
    await page.evaluate(function (b) { window.itineraireYAller(b.x, b.y, b.nom); }, choix.b);
    await attendre(page, function () {
      return (window.getRoads() || []).some(function (r) { return r.type === "itinerary"; });
    }, 180000);
    await page.evaluate(function () { window.ItiGuidage.rafraichir(); });
    await page.waitForTimeout(800);

    // G1 — bandeau
    const g1 = await page.evaluate(function () {
      const el = document.getElementById("kta-guid-bandeau");
      if (!el || el.style.display === "none") return null;
      const r = el.getBoundingClientRect();
      const header = document.querySelector(".kta-refonte-header");
      const hb = header ? header.getBoundingClientRect().bottom : 0;
      return { top: r.top, left: r.left, right: r.right, width: r.width, hb: hb,
               txt: el.querySelector(".kta-guid-principal").textContent, vw: window.innerWidth };
    });
    if (!g1) pb("G1 : bandeau absent");
    else {
      ok("G1 : bandeau visible — « " + g1.txt + " »");
      if (g1.top < g1.hb) pb("G1 : le bandeau passe sous l'en-tête (top " + g1.top + " < " + g1.hb + ")");
      else ok("G1 : sous l'en-tête");
      if (g1.left < 44 || g1.right > g1.vw - 44) pb("G1 : le bandeau déborde sur les colonnes de boutons");
      else ok("G1 : entre les colonnes de boutons (" + Math.round(g1.width) + " px)");
    }
    await shot("g1-bandeau");

    // G2 — raccord pointillé
    const g2 = await page.evaluate(function () {
      const iti = window.getRoads().find(function (r) { return r.type === "itinerary"; });
      const rac = (iti.raccords || []).filter(function (r) { return r.distPx > 0.5; }).length;
      return { rac: rac, dom: document.querySelectorAll(".kta-itinerary-raccord").length,
               carrefours: (iti.carrefours || []).length };
    });
    if (g2.rac > 0 && g2.dom === 0) pb("G2 : " + g2.rac + " raccord(s) mais aucun pointillé dessiné");
    else ok("G2 : " + g2.dom + " pointillé(s) pour " + g2.rac + " raccord(s) · " + g2.carrefours + " carrefour(s) sur le trajet");

    // G3 — feuille de route
    await page.click("#kta-guid-bandeau .kta-guid-corps");
    await page.waitForTimeout(400);
    const g3 = await page.evaluate(function () {
      const m = document.getElementById("kta-guid-feuille");
      return m ? m.querySelectorAll(".kta-guid-feuille-ligne").length : -1;
    });
    if (g3 < 1) pb("G3 : feuille de route absente ou vide");
    else ok("G3 : feuille de route — " + g3 + " ligne(s)");
    await shot("g3-feuille");
    await page.evaluate(function () { const m = document.getElementById("kta-guid-feuille"); if (m) m.remove(); });

    // G4 — avancer le long du trajet
    const g4 = await page.evaluate(async function () {
      const iti = window.getRoads().find(function (r) { return r.type === "itinerary"; });
      const g = window.ItiGuidage.construire(iti);
      const e = g.echelle, textes = [];
      for (let s = 0; s <= g.longueurPx * 0.6; s += 0.7 * e) {
        const p = window.ItiGuidage.pointA(g, s);
        window.__guidPos = { x: p.x, y: p.y };
        window.ItiGuidage.onPosition(window.__guidPos);
        const st = window.ItiGuidage.etat();
        if (textes[textes.length - 1] !== st.principal) textes.push(st.principal);
      }
      return { n: textes.length, premiers: textes.slice(0, 4), mode: window.ItiGuidage.etat().mode };
    });
    if (g4.n < 2) pb("G4 : le bandeau ne change pas quand on avance");
    else ok("G4 : " + g4.n + " textes successifs — " + g4.premiers.join(" | "));
    if (g4.mode !== "guide") pb("G4 : fausse alerte en suivant le trajet (" + g4.mode + ")");
    await shot("g4-en-route");

    // G5 — écart
    const g5 = await page.evaluate(function () {
      const e = Number(window.APP_CONFIG.scale) || 1;
      const p0 = window.__guidPos;
      for (let i = 1; i <= 8; i++) {
        window.__guidPos = { x: p0.x + 40 * e + i, y: p0.y + 40 * e };
        window.ItiGuidage.onPosition(window.__guidPos);
      }
      const el = document.getElementById("kta-guid-bandeau");
      return { mode: window.ItiGuidage.etat().mode,
               btns: el.querySelectorAll(".kta-guid-btn").length };
    });
    if (g5.mode !== "ecart" || g5.btns !== 3) pb("G5 : écart non signalé (mode " + g5.mode + ", " + g5.btns + " bouton(s))");
    else ok("G5 : « Hors itinéraire ? » + 3 boutons");
    await shot("g5-ecart");

    // G6 — écran XL
    await page.evaluate(function () { window.EmergencyMode.activer(); });
    await page.waitForTimeout(700);
    const g6 = await page.evaluate(function () {
      const b = document.getElementById("kta-em-guidage");
      return b && b.style.display !== "none" ? document.getElementById("kta-em-guid-principal").textContent : null;
    });
    if (!g6) pb("G6 : la consigne n'est pas reprise sur l'écran XL");
    else ok("G6 : écran XL — « " + g6 + " »");
    await shot("g6-xl");
    await page.evaluate(function () { window.EmergencyMode.desactiver(); });
    await page.waitForTimeout(300);

    // G8 — urgence : pas de croix
    const g8 = await page.evaluate(function () {
      const iti = window.getRoads().find(function (r) { return r.type === "itinerary"; });
      iti.urgence = true;
      window.ItiGuidage.rafraichir();
      const f = document.querySelector("#kta-guid-bandeau .kta-guid-fermer");
      const cache = f.style.display === "none";
      delete iti.urgence;
      window.ItiGuidage.rafraichir();
      return cache;
    });
    if (!g8) pb("G8 : la croix reste en urgence");
    else ok("G8 : itinéraire d'urgence → pas de croix");

    // G9 — suivi arrêté : une position CONFIRMÉE suffit à garder le guidage (décision produit :
    // on avance de plaque en plaque) ; sans elle, masqué.
    const masque = function () {
      const el = document.getElementById("kta-guid-bandeau");
      return !el || el.style.display === "none";
    };
    await page.evaluate(function () { window.stopTracking(); window.ItiGuidage.rafraichir(); });
    const g9a = await page.evaluate(masque);
    if (g9a) pb("G9 : suivi arrêté, position confirmée → bandeau masqué (il devait rester)");
    else ok("G9 : suivi arrêté, position confirmée → le guidage continue");
    await page.evaluate(function () {
      window.getTrackingPositionEtat = function () { return { confirmee: false, ts: 0, suiviActif: false }; };
      window.ItiGuidage.rafraichir();
    });
    const g9b = await page.evaluate(masque);
    if (!g9b) pb("G9 : suivi arrêté, position NON confirmée → bandeau encore visible");
    else ok("G9 : suivi arrêté, position non confirmée → bandeau masqué");

    // G10 — itinéraire par un tracé `jonction` (fictif, en mémoire) : le changement de niveau tombe au même point que
    // le virage du carrefour d'arrivée ; la consigne « descendre » passe devant et absorbe le virage. Aperçu filtré
    // par niveau (vue 3D) : rien sur un niveau sans tronçon. Libellé du niveau signé (« +1 »).
    const g10 = await page.evaluate(function (a) {
      const e = Number(window.APP_CONFIG.scale) || 1, G = window.ItiGuidage, r = {};
      const P = function (x, y, n) { return { x: a.x + x * e, y: a.y + y * e, level: n }; };
      const route = { uid: "rd_g10", type: "itinerary", level: 0,
        points: [P(0, 0, 0), P(20, 0, 0), P(20, 5, -1), P(40, 5, -1)],
        carrefours: [{ x: a.x + 20 * e, y: a.y + 5 * e, sorties: [0, 90, 180, 270] }] };
      const g = G.construire(route, { pois: [] });
      r.consignes = g.consignes.map(function (c) { return c.type + "@" + Math.round(c.s / e); });
      r.premier = G.texteAction(g.consignes[0]);
      r.monter = G.texteAction({ type: "niveau", sens: "monter", vers: 1 });
      r.plus1 = window.ktaFormatNiveau(1);
      const avant = window.getRoads();
      window.setRoads(avant.filter(function (x) { return x.type !== "itinerary"; }).concat([route]));
      const ici = P(30, 5);
      const m1 = G.apercu(ici, { niveau: -1 }), p1 = G.apercu(ici, { niveau: 1 }), z0 = G.apercu(P(10, 0), { niveau: 0 });
      window.setRoads(avant);
      r.m1 = { visible: m1.visible, mode: m1.mode, cap: m1.capTrajet };
      r.p1 = { visible: p1.visible, mode: p1.mode };
      r.z0 = { visible: z0.visible, principal: z0.principal };
      return r;
    }, choix.a);
    if (g10.consignes[0] !== "niveau@25" || g10.consignes.some(function (c) { return /^virage/.test(c); })) {
      pb("G10 : par tracé jonction, la consigne de niveau n'est pas dite en premier — " + g10.consignes.join(", "));
    } else {
      ok("G10 : par tracé jonction, « " + g10.premier + " » d'abord, virage du nœud absorbé (" +
        g10.consignes.join(", ") + ")");
    }
    if (g10.monter.indexOf(g10.plus1) < 0) pb("G10 : libellé du niveau non signé — « " + g10.monter + " »");
    else ok("G10 : libellé signé — « " + g10.monter + " »");
    if (!g10.m1.visible || g10.m1.mode !== "guide" || g10.m1.cap !== 90 || g10.p1.visible || !g10.z0.visible) {
      pb("G10 : aperçu par niveau — " + JSON.stringify({ m1: g10.m1, p1: g10.p1, z0: g10.z0 }));
    } else ok("G10 : aperçu au −1 sur son tronçon (cap du trajet 90°), rien au +1 (pas de « Rejoindre »), 0 guidé");

    // G11 — repère au niveau du tronçon (fictif, en mémoire) : itinéraire au niveau 0 qui tourne à gauche sous un POI
    // nommé du niveau 1 (à l'aplomb du carrefour) et à côté d'un POI nommé du niveau 0. La consigne cite celui du 0,
    // jamais celui du 1 : bandeau 2D (tracker au 0), feuille de route, aperçu de la vue 3D au 0. Sans POI du 0 à
    // portée : pas de repère. La manœuvre est la même avec ou sans repère.
    const g11 = await page.evaluate(function (a) {
      const e = Number(window.APP_CONFIG.scale) || 1, G = window.ItiGuidage, C = window.APP_CONFIG, r = {};
      const P = function (x, y, n) { return { x: a.x + x * e, y: a.y + y * e, level: n }; };
      const route = { uid: "rd_g11", type: "itinerary", level: 0,
        points: [P(0, 0, 0), P(20, 0, 0), P(20, -20, 0)],
        carrefours: [{ x: a.x + 20 * e, y: a.y, sorties: [0, 90, 270] }] };
      const haut = Object.assign({ nom: "Repère haut fictif", uid: "pt_g11_haut", tags: ["salle"] }, P(20, 0, 1));
      const bas = Object.assign({ nom: "Repère bas fictif", uid: "pt_g11_bas", tags: ["salle"] }, P(22, 2, 0));
      const av = { ml: C.multiLevel, dispo: C.availableLevels, vis: C.visibleLevels, actif: C.activeLevel,
        ed: window.getEditorPoints, emb: window.getAllEmbeddedPoints, roads: window.getRoads(),
        niv: window.getTrackerLevel, pos: window.__guidPos, etat: window.getTrackingPositionEtat };
      C.multiLevel = true; C.availableLevels = [0, 1]; C.visibleLevels = [0, 1]; C.activeLevel = 0;
      window.getTrackerLevel = function () { return 0; };
      window.getTrackingPositionEtat = function () { return { confirmee: true, ts: Date.now(), suiviActif: true }; };
      const virage = function (g) {
        const c = g.consignes.find(function (x) { return x.carrefour; });
        return c ? c.type + ":" + (c.cote || "") + ":" + (c.force || "") : null;
      };
      // Une copie de l'itinéraire par lecture : bandeau et aperçu ne refont leurs consignes que si la road change.
      const lire = function (pois) {
        const rt = JSON.parse(JSON.stringify(route));
        window.getEditorPoints = function () { return pois.slice(); };
        window.getAllEmbeddedPoints = function () { return []; };
        window.setRoads(av.roads.filter(function (x) { return x.type !== "itinerary"; }).concat([rt]));
        const g = G.construire(rt);
        window.__guidPos = P(5, 0);
        G.onPosition(window.__guidPos);
        const st = G.etat();
        G.ouvrirFeuilleDeRoute(rt);
        const f = document.getElementById("kta-guid-feuille");
        const feuille = f ? f.querySelector(".kta-guid-feuille-liste").textContent : "";
        if (f) f.remove();
        const ap = G.apercu(P(5, 0), { niveau: 0 });
        return { manoeuvre: virage(g), texte: G.texteAction(g.consignes.find(function (x) { return x.carrefour; })),
          bandeau: (st.principal || "") + " " + (st.sous || ""), feuille: feuille,
          apercu: (ap.principal || "") + " " + (ap.sous || "") };
      };
      r.sans = lire([]);
      r.deux = lire([haut, bas]);
      r.hautSeul = lire([haut]);
      C.multiLevel = av.ml; C.availableLevels = av.dispo; C.visibleLevels = av.vis; C.activeLevel = av.actif;
      window.getEditorPoints = av.ed; window.getAllEmbeddedPoints = av.emb; window.getTrackerLevel = av.niv;
      window.getTrackingPositionEtat = av.etat;
      window.setRoads(av.roads);
      window.__guidPos = av.pos;
      return r;
    }, choix.a);
    const citeHaut = function (o) { return /Repère haut fictif/.test(o.bandeau + o.feuille + o.apercu + o.texte); };
    const citeBas = function (o) {
      return [o.bandeau, o.feuille, o.apercu, o.texte].every(function (t) { return /Repère bas fictif/.test(t); });
    };
    if (g11.sans.manoeuvre !== "virage:gauche:franc" || g11.deux.manoeuvre !== g11.sans.manoeuvre ||
        g11.hautSeul.manoeuvre !== g11.sans.manoeuvre) {
      pb("G11 : la manœuvre change avec le repère — " + JSON.stringify([g11.sans.manoeuvre, g11.deux.manoeuvre,
        g11.hautSeul.manoeuvre]));
    } else ok("G11 : même manœuvre avec ou sans repère (" + g11.sans.manoeuvre + ")");
    if (citeHaut(g11.deux) || !citeBas(g11.deux)) pb("G11 : repère d'un autre niveau cité — " + JSON.stringify(g11.deux));
    else ok("G11 : POI du 0 cité, celui du 1 jamais (bandeau 2D, feuille, aperçu 3D) — « " + g11.deux.texte + " »");
    if (citeHaut(g11.hautSeul) || g11.hautSeul.texte !== g11.sans.texte) {
      pb("G11 : seul un POI du 1 à portée, la consigne devait se dire sans repère — " + JSON.stringify(g11.hautSeul));
    } else ok("G11 : seul un POI du 1 à portée → consigne sans repère — « " + g11.hautSeul.texte + " »");

    // G12 — encart « reste » (fictif, en mémoire) : 300 m au 0, passage de 10 m vers le −1, 300 m au −1, raccord
    // d'arrivée de 3 m (613 m). Distance restante à 1 m près à 3 positions (au 0, dans le passage, au −1), niveau de
    // l'arrivée dit seulement depuis un autre niveau, temps = distance / vitesse de l'itinéraire (rien de choisi :
    // le défaut, « lente », 3 km/h ; « normale » retenue : 5 km/h), réduit / déplié retenu sur l'appareil, aucun
    // chevauchement à 3 tailles.
    const g12 = await page.evaluate(async function (a) {
      const e = Number(window.APP_CONFIG.scale) || 1, G = window.ItiGuidage, C = window.APP_CONFIG, r = { pos: [] };
      const P = function (x, y, n) { return { x: a.x + x * e, y: a.y + y * e, level: n }; };
      const route = { uid: "rd_g12", type: "itinerary", level: 0,
        points: [P(0, 0, 0), P(300, 0, 0), P(300, 10, -1), P(600, 10, -1)], carrefours: [],
        raccords: [{ role: "arrivee", label: "Cible fictive", de: P(603, 10), vers: P(600, 10), distPx: 3 * e }],
        waypoints: [Object.assign({ source: "tracker", label: "Départ" }, P(0, 0, 0)),
          Object.assign({ source: "search", label: "Cible fictive" }, P(603, 10, -1))] };
      const av = { ml: C.multiLevel, dispo: C.availableLevels, vis: C.visibleLevels, roads: window.getRoads(),
        niv: window.getTrackerLevel, pos: window.__guidPos, etat: window.getTrackingPositionEtat };
      C.multiLevel = true; C.availableLevels = [-1, 0]; C.visibleLevels = [-1, 0];
      try { localStorage.removeItem("myktamap_guidage_encart_v1"); } catch (err) { /* déplié par défaut */ }
      let niv = 0;
      window.getTrackerLevel = function () { return niv; };
      window.getTrackingPositionEtat = function () { return { confirmee: true, ts: Date.now(), suiviActif: true }; };
      window.setRoads(av.roads.filter(function (x) { return x.type !== "itinerary"; }).concat([route]));
      const aller = function (x, y, n) {
        niv = n;
        window.__guidPos = P(x, y);
        G.onPosition(window.__guidPos);
        const st = G.etat(), el = document.querySelector("#kta-guid-bandeau .kta-guid-resume-txt");
        return { resteM: st.resume ? +st.resume.resteM.toFixed(2) : null, tempsMin: st.resume ? st.resume.tempsMin : null,
          niveau: st.resume ? st.resume.niveau : null, texte: el ? el.textContent : "" };
      };
      // On marche le long du trajet tous les 2 m (le guidage suit une progression, pas des sauts) ; relevés à 100 m,
      // au milieu du passage (305 m, tracker encore au 0) et à 450 m (au −1, 140 m après le passage).
      const g = G.construire(route), rel = [100, 305, 450];
      for (let s = 0; s <= 450; s += (rel.indexOf(s + 1) >= 0 ? 1 : 2)) {
        const p = G.pointA(g, s * e);
        const m = aller((p.x - a.x) / e, (p.y - a.y) / e, s < 310 ? 0 : -1);
        if (rel.indexOf(s) >= 0) r.pos.push(m);
      }
      r.attendu = [513, 308, 163];   // 610 m de trajet + 3 m de raccord − s
      r.vitesse = 3000 / 60;
      r.choixAvant = localStorage.getItem("myktamap_iti_walking_preset");
      // Allure choisie et retenue (« normale ») : la sienne, pas le défaut.
      localStorage.setItem("myktamap_iti_walking_preset", "normale");
      const p450 = G.pointA(g, 450 * e);
      r.retenue = aller((p450.x - a.x) / e, (p450.y - a.y) / e, -1);
      localStorage.removeItem("myktamap_iti_walking_preset");
      // Réduit, puis une position de plus : toujours réduit ; relu après un rechargement de l'état (réglage retenu).
      const btn = document.querySelector("#kta-guid-bandeau .kta-guid-resume");
      btn.click();
      aller(460, 10, -1);
      r.reduit = { etat: G.etat().encartReduit, texte: btn.querySelector(".kta-guid-resume-txt").textContent,
        ls: localStorage.getItem("myktamap_guidage_encart_v1"), lu: G.encartReduit(), h: Math.round(btn.getBoundingClientRect().height) };
      btn.click();
      aller(470, 10, -1);
      r.deplie = { etat: G.etat().encartReduit, texte: btn.querySelector(".kta-guid-resume-txt").textContent,
        ls: localStorage.getItem("myktamap_guidage_encart_v1") };
      window.__g12 = av;
      return r;
    }, choix.a);
    g12.pos.forEach(function (m, i) {
      const att = g12.attendu[i], tAtt = att / g12.vitesse;
      if (m.resteM === null || Math.abs(m.resteM - att) > 1) pb("G12 : distance restante " + m.resteM + " m, attendu " + att);
      else if (Math.abs(m.tempsMin - tAtt) > 0.05) pb("G12 : temps " + m.tempsMin + " min, attendu " + tAtt.toFixed(2));
      else ok("G12 : reste " + m.resteM + " m (attendu " + att + "), " + m.tempsMin.toFixed(1) + " min — « " + m.texte + " »");
    });
    const tRet = 163 / (5000 / 60);
    if (g12.choixAvant !== null || !g12.retenue.tempsMin || Math.abs(g12.retenue.tempsMin - tRet) > 0.05) {
      pb("G12 : allure retenue « normale » — " + JSON.stringify({ avant: g12.choixAvant, retenue: g12.retenue }));
    } else ok("G12 : rien de choisi = 3 km/h ; « normale » retenue = 5 km/h (" + g12.retenue.tempsMin.toFixed(1) + " min)");
    if (g12.pos[0].niveau !== -1 || g12.pos[2].niveau !== null || !/Cible fictive/.test(g12.pos[0].texte)) {
      pb("G12 : niveau de l'arrivée mal dit — " + JSON.stringify([g12.pos[0], g12.pos[2]]));
    } else ok("G12 : niveau de l'arrivée dit depuis le 0, pas depuis le −1");
    if (!g12.reduit.etat || g12.reduit.texte !== "" || g12.reduit.ls !== "reduit" || !g12.reduit.lu ||
        g12.deplie.etat || !g12.deplie.texte || g12.deplie.ls !== null) {
      pb("G12 : réduit / déplié — " + JSON.stringify({ reduit: g12.reduit, deplie: g12.deplie }));
    } else ok("G12 : réduit (languette de " + g12.reduit.h + " px) puis déplié, retenu sur l'appareil");
    // Aucun chevauchement : bandeau (encart déplié, puis écart avec ses 3 boutons) contre les contrôles de la carte,
    // la boussole ouverte, le bouton nord, l'en-tête et la barre du bas, en portrait, en paysage et au PC.
    for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(400);
      const ch = await page.evaluate(function () {
        if (window.CompassWidget && typeof window.CompassWidget.show === "function") { try { window.CompassWidget.show(); } catch (err) { /* sans boussole */ } }
        window.ItiGuidage.onPosition(window.__guidPos);
        const b = document.getElementById("kta-guid-bandeau"), rb = b.getBoundingClientRect();
        const autres = Array.prototype.filter.call(document.querySelectorAll(
          ".leaflet-control, #kta-compass-widget, .kta-nord-ctrl, .kta-refonte-header, .kta-refonte-bottom, " +
          ".kta-bottom-bar, .kta-barre-bas"), function (x) {
          if (b.contains(x) || x.contains(b)) return false;
          const r = x.getBoundingClientRect(), st = getComputedStyle(x);
          return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
        });
        const touche = autres.filter(function (x) {
          const r = x.getBoundingClientRect();
          return r.left < rb.right - 0.5 && r.right > rb.left + 0.5 && r.top < rb.bottom - 0.5 && r.bottom > rb.top + 0.5;
        }).map(function (x) { return (x.id || x.className || x.tagName).toString().slice(0, 60); });
        return { touche: touche, n: autres.length, bas: Math.round(rb.bottom), h: window.innerHeight };
      });
      if (ch.touche.length) pb("G12 : " + vp.width + "×" + vp.height + " — le bandeau chevauche " + ch.touche.join(", "));
      else ok("G12 : " + vp.width + "×" + vp.height + " — aucun chevauchement (" + ch.n + " éléments, bas du bandeau " +
        ch.bas + "/" + ch.h + " px)");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(function () {
      if (window.CompassWidget && typeof window.CompassWidget.hide === "function") { try { window.CompassWidget.hide(); } catch (err) { /* idem */ } }
      const av = window.__g12, C = window.APP_CONFIG;
      C.multiLevel = av.ml; C.availableLevels = av.dispo; C.visibleLevels = av.vis;
      window.getTrackerLevel = av.niv; window.getTrackingPositionEtat = av.etat;
      window.setRoads(av.roads); window.__guidPos = av.pos;
    });
  } catch (e) {
    if (String(e && e.message) !== "stop") pb("exception : " + (e && e.stack || e));
  } finally {
    await nav.close();
    console.log(problemes.length ? "\n⚠️ " + problemes.length + " problème(s)" : "\n🎉 CHECKUP GUIDAGE VERT");
    process.exit(problemes.length ? 1 : 0);
  }
})();
