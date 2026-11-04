#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-vue-3d.js — checkup (Playwright) : vue 3D (js/vue3d.js) sur le relevé fictif
// =====================================================================
// Rien de la 3D n'est demandé au démarrage ni au chargement du plan. Bouton cube de la barre de droite (sous ≡) grisé
// sans échelle (rien chargé, message), plus de tuile au menu Tracker ; ouverte par ce bouton derrière un indicateur de
// chargement, focus dans la vue (aria-modal) puis rendu au bouton : scène non vide, textes du dictionnaire,
// mur plus bas que le pilier qu'il traverse, avancer, buter contre le pilier (règle du pas du tracker), clavier, vue plongeante,
// niveau ; perte du contexte WebGL simulée (WEBGL_lose_context) puis reprise ; « Je suis ici ? » à la fermeture
// (Non = rien, Oui = tracker recalé) ; perte sans reprise = fermeture avec message ; WebGL absent = refus avec
// message ; 20 ouvertures de suite sans « Too many active WebGL contexts » ; aucune erreur de page ni de console.
// Aussi : pas rapide (appui long ▲, Maj) ; collisions sur 6 obstacles fictifs (pilier, pilier fin, mur, mur en
// ligne, front, pilier perso) sous 12 angles, pas rapides et grand pas, départ collé à une face, jugées par une
// géométrie propre au checkup ; inclinaison de la vue plongeante ; rose des vents (nord calibré ou non) ; bascule
// suivi / libre avec un cap d'appareil simulé, 🧭 grisé tracker arrêté ; POI au centre d'un pilier visible depuis
// la galerie, collé à la face vue. Mode galerie sur des tracés fictifs (T, X, coudes droit et aigu, cul-de-sac, presque
// parallèles) : aucune paroi à travers une autre, butées, carrefours, zones coupées au tube, POI à 2 / 5 / 25 m,
// interrupteur retenu par plan ; passages 🪜 par POI et tracé jonction ; carte 2D placée à la sortie. Passages (14) :
// volume par moyen, rampe, panneau ↕, 🪜 nommé, fiche, fondu et descente, arrivée dans le tube, cap, guidage, suivi.
// Aucune paroi de tube dans un passage (§ 14 bis) : bouche ou tranchée coupée par un tracé, cul-de-sac, 3 rendus.
// Accès de surface sans passage (§ 14 quater : esf, pef, pb, pc, psf, ps, pe, cao, caf) : forme, place, ni 🪜 ni
// cadre, blocage (cône, cavage fermé ; bassin contre la paroi, qu'on longe), itinéraire sur le cône, arrivée devant
// un cavage fermé, 🧱, 2D intacte ; cavage comblé (§ 14 sexies : galerie de 4 m entre deux murs, comblement jusqu'aux
// murs, côtés inégaux, porte ouverte ou fermée, rendu galerie inchangé). Escaliers (§ 14 quinquies : esf, eso, jes)
// en niche latérale, pied contre la paroi.
// Intégration :
// ≡ ouvre le ≡ Filtres de la carte (état partagé dans les deux sens : zone, structure, calque, type de tracé), pastille ;
// 🚨 = Sortie d'urgence ; toasts sous la rangée ; ✕ au coin haut droit au téléphone ; ❓ ouvre l'aide de la 3D ;
// Échap ferme le réglage puis la vue ; panneau de POI sombre en thème clair, borné de près ; rendu en pause.
// Homogène à la 2D (PC, téléphone, paysage) : boutons du haut à la taille du ≡ de la barre 2D (± 1 px), mêmes
// icônes (☰ 🚨 ⚙️ ❓), cibles ≥ 44 px, pastille de mode ; interrupteurs de la tuile à Entrée et Espace, focus visible.
// Interrupteur 🪧 Guidage (§ 22) : bandeau et chevrons masqués, ruban gardé, urgence affichée, retenu.
// Interrupteur 🧱 Textures (§ 24) : roche brute (sans lits de mortier) et parpaing par défaut, taille réelle (mur de 2 m = mur de 40 m), coupé =
// couleurs de la légende (type perso compris), retenu, greffe intacte, mixte / structures / galerie ; parois des
// tubes et des galeries en pierre de taille (lits de joint mesurés, 0,5 de texture par mètre à 2,5 m comme à 6 m de
// hauteur, une assise part du sol), moellons d'origine une fois coupé, temps de dessin des textures ; remblais et
// effondrement texturés (zone de 1 m et de 10 m à la même échelle, chambre, tube, galerie, structures ; eau et zone
// perso jamais texturées ; couleur de la légende une fois coupé).
// Mixte par côté (pilier ou front d'un seul côté, deux côtés, structure dans l'axe : parois, pans de retour, fentes
// cherchées par rayons, collisions) ; itinéraire en tirets (largeur, liseré, étape, 🏁) ; ronds d'intersection de
// la carte ; joystick (pointeurs tactiles synthétiques, pointeur grossier simulé) et pavé (PC, option) ; plus de
// « bêta », toast de présence en info, nom d'un membre touché, focus rendu après « Je suis ici ? ». Greffe (21) :
// prise neutre d'un add-on (cycle de vie, rendu à la demande, règle du pas), code « six vers le bas ». Add-on mkmg
// (23) : refus, confirmation, partie en vagues, masquage, endurance, tir, recharge, objets, égaré, silhouette, fin.
// Réglages (25) : portée 15 / 100 m (curseur, brouillard, profondeur, lampe, tuiles, relue), intensité 25 / 300 %
// et faisceau 40 / 160° (curseurs, pénombre, relus, ancien « forte » / « jour » relu), ☀️ Plein jour (interrupteur),
// greffe figée ou non (facteur d'une greffe multiplié, réglages rendus au retrait), zoom de la vue plongeante 6 / 60 m
// (molette, Maj + molette, + / −, = / -, pincement, tuiles qui suivent le recul).
// Données changées pendant la vue (26). Toucher un objet (27) : fiche de la carte d'un pilier, d'un mur, d'une zone,
// d'un tracé (mixte, structures, galerie ; yeux et plongée), vide = rien, panneau de POI d'abord, note au clavier,
// Échap et focus, greffe qui coupe les fiches (doigt), lecture seule (extension, calque), 🗑️ suivi sans rouvrir,
// « Voir sur la carte » (carte centrée, fiche de la carte, surbrillance).
// Mesures (facultatives, objets FICTIFS générés en mémoire, jamais écrits) :
//   KTA_V3D_PERF=galerie → réseau de 3 120 tronçons en mode galerie seulement (=1 : tout) ;
//   KTA_V3D_PERF=mixte → ce réseau sur le plan dense, piliers gardés sur la moitié est seulement (tubes à l'ouest,
//   chambres à l'est), en mode mixte ;
//   KTA_V3D_PERF=passages → plan dense, sans puis avec 10 passages entre niveaux et 2 rampes à portée de vue ;
//   KTA_V3D_PERF=1 → plan dense synthétique (9 000 piliers, 3 000 murs, 1 000 murs en ligne, 700 fronts,
//   zones, tracés, POI) : temps d'ouverture, triangles, appels, ms par image à 20 / 30 / 50 / 75 / 100 m, sans
//   tuiles et en vue plongeante dézoomée (recul 60 m) ; marche de 120 m à 30 et 100 m ;
//   KTA_V3D_PERF=dessin → plan dense, pilier dessiné au doigt en plongée : coût d'un sommet, délai de fermeture ;
//   KTA_V3D_TEL=1 → fenêtre et densité d'un iPhone (393 × 852, x3), processeur ralenti x4 (Chromium seul) ;
//   KTA_V3D_CAPTURES=<dossier> → captures (hors dépôt) ; KTA_V3D_SEUL=dessin → la section 28 seule.
// Usage : node scripts/smoke/checkup-vue-3d.js (SMOKE_PORT pour une autre copie) · doc : docs/ETUDE_VUE_3D.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const path = require("path");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
// KTA_V3D_PERF=1 : toutes les mesures ; =galerie ou =mixte : celles de ce rendu seulement.
const PERF = ["1", "galerie", "mixte", "passages", "dessin"].indexOf(process.env.KTA_V3D_PERF) >= 0;
const PERF_DESSIN = process.env.KTA_V3D_PERF === "dessin";
const PERF_PASSAGES = process.env.KTA_V3D_PERF === "passages";
const PERF_STRUCTURES = process.env.KTA_V3D_PERF === "1";
const PERF_GALERIE = process.env.KTA_V3D_PERF === "1" || process.env.KTA_V3D_PERF === "galerie";
const PERF_MIXTE = process.env.KTA_V3D_PERF === "1" || process.env.KTA_V3D_PERF === "mixte";
const TEL = process.env.KTA_V3D_TEL === "1";
const CAPTURES = process.env.KTA_V3D_CAPTURES || "";
// KTA_V3D_SEUL=dessin : la section 28 seule (mise au point).
const SEUL = process.env.KTA_V3D_SEUL || "";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const RX_3D = /\/lib\/three\/|\/js\/vue3d\.js|\/css\/vue3d\.css/;

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
// Suivi, vue, hauteur, rendu et boussole sont dans la tuile ⚙️ : l'ouvrir avant de toucher l'un d'eux (sans la
// refermer si elle l'est déjà ; un toucher ailleurs la ferme).
async function reglages(page) {
  await page.evaluate(function () {
    const t = document.getElementById("kta-v3d-reglages");
    if (t && t.hidden) document.querySelector('#kta-vue3d [data-v3d="reglages"]').click();
  });
}

// Interface homogène à la 2D (décision produit : la 2D est la référence), à la taille de fenêtre courante, vue
// ouverte (la carte reste dessous dans le DOM) : boutons de la rangée du haut à la taille de la pilule ≡ de la barre
// de droite (± 1 px), mêmes icônes que la 2D, zone de toucher d'au moins 44 px (sondée à 21 px du centre), pastille
// de mode à la même taille.
async function homogene(page, nom) {
  const r = await page.evaluate(function () {
    const q = function (s) { return document.querySelector(s); };
    const barre = q(".kta-filter-ctrl").getBoundingClientRect();
    const haut = Array.prototype.slice.call(document.querySelectorAll("#kta-vue3d .kta-v3d-haut > button"));
    const tailles = haut.map(function (b) {
      const rb = b.getBoundingClientRect();
      return { b: b.getAttribute("data-v3d") || "aide", w: +rb.width.toFixed(1), h: +rb.height.toFixed(1) };
    });
    // 🩸 Référence = la LARGEUR de la pilule : en paysage bas, la barre 2D est plus basse que ses boutons de 30 px
    // (rognés par overflow: hidden) ; la 3D reste carrée.
    const ecarts = tailles.filter(function (t) {
      return Math.abs(t.w - barre.width) > 1 || Math.abs(t.h - barre.width) > 1;
    });
    const sonder = function (b) {
      const rb = b.getBoundingClientRect(), cx = rb.left + rb.width / 2, cy = rb.top + rb.height / 2;
      return [[21, 0], [-21, 0], [0, 21], [0, -21]].every(function (d) {
        const el = document.elementFromPoint(cx + d[0], cy + d[1]);
        return !!el && (el === b || b.contains(el));
      });
    };
    const flottants = haut.concat(Array.prototype.slice.call(
      document.querySelectorAll("#kta-vue3d .kta-v3d-pad > button, #kta-vue3d .kta-v3d-incl:not([hidden]) > button")));
    const petits = flottants.filter(function (b) { return b.offsetParent !== null && !sonder(b); })
      .map(function (b) { return b.getAttribute("data-v3d") || "aide"; });
    const texte = function (el) { return el ? el.textContent.trim() : null; };
    const gauche = Array.prototype.slice.call(document.querySelectorAll(".leaflet-top.leaflet-left .leaflet-bar a"))
      .map(texte);
    const icones = {
      filtres: [texte(q('#kta-vue3d [data-v3d="filtres"]')), texte(q(".kta-filter-ctrl a"))],
      urgence: [texte(q('#kta-vue3d [data-v3d="urgence"]')),
        texte(q("#kta-refonte-counter-sortie .kta-refonte-counter-icon"))],
      reglages: [texte(q('#kta-vue3d [data-v3d="reglages"]')), gauche.indexOf("⚙️") >= 0 ? "⚙️" : gauche.join("")],
      aide: [texte(q("#kta-vue3d .kta-v3d-haut > .kta-aide-ctx-btn")), "❓"]
    };
    const autres = Object.keys(icones).filter(function (k) { return icones[k][0] !== icones[k][1]; });
    const indic = q("#kta-vue3d .kta-v3d-mode-indic").getBoundingClientRect();
    return { barre: [+barre.width.toFixed(1), +barre.height.toFixed(1)], tailles: tailles, ecarts: ecarts,
      petits: petits, autres: autres, icones: icones, indic: Math.abs(indic.width - barre.width) <= 1 };
  });
  verifier(r.ecarts.length === 0 && r.tailles.length === 5,
    nom + " : boutons du haut de la 3D à la taille de la barre 2D (" + r.barre.join(" × ") + ", ± 1 px)", r);
  verifier(r.autres.length === 0, nom + " : ☰ 🚨 ⚙️ ❓ de la 3D = icônes de la 2D", r.icones);
  verifier(r.petits.length === 0, nom + " : cibles de toucher ≥ 44 px (rangée du haut, pavé, zoom)", r.petits);
  verifier(r.indic, nom + " : pastille de mode à la taille des boutons", r);
}

async function capture(page, nom) {
  if (!CAPTURES) return;
  await page.screenshot({ path: path.join(CAPTURES, nom + ".png") });
}

// Plan dense synthétique, dans le registre des structures embarquées (mémoire seule, aucune session écrite).
// Maille de 7 m : piliers irréguliers de 6 à 12 sommets, murs polygones allongés, murs en ligne et fronts dans
// les galeries ; quelques zones, tracés et POI.
function semerPlanDense() {
  const sc = window.APP_CONFIG.scale, H = window.PLAN_CONFIG.plan.imageHeight, W = window.PLAN_CONFIG.plan.imageWidth;
  let graine = 42;
  const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  const maille = 7 * sc, cotes = 115;
  const x0 = Math.max(0, W / 2 - (cotes / 2) * maille), y0 = Math.max(0, H / 2 - (cotes / 2) * maille);
  const liste = [], zones = [], points = [];
  let piliers = 0, murs = 0, lignes = 0, fronts = 0;
  for (let j = 0; j < cotes; j++) {
    for (let i = 0; i < cotes; i++) {
      const cx = x0 + (i + 0.5) * maille, cy = y0 + (j + 0.5) * maille;
      if (piliers < 9000 && (murs >= 3000 || alea() < 0.75)) {
        const n = 6 + Math.floor(alea() * 7), r = (1.6 + alea() * 0.8) * sc, pts = [];
        for (let k = 0; k < n; k++) {
          const a = k / n * Math.PI * 2, rr = r * (0.8 + alea() * 0.35);
          pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
        }
        liste.push({ type: alea() < 0.85 ? "pilier-1" : "pilier-2", level: 0, points: pts });
        piliers++;
      } else if (murs < 3000) {
        const l = 2.6 * sc, e = 0.5 * sc, pts = [];
        for (let k = 0; k <= 4; k++) pts.push({ x: cx - l + k * l / 2, y: cy - e + (alea() - 0.5) * sc * 0.2 });
        for (let k = 4; k >= 0; k--) pts.push({ x: cx - l + k * l / 2, y: cy + e + (alea() - 0.5) * sc * 0.2 });
        liste.push({ type: "mur", level: 0, points: pts });
        murs++;
      }
      // Murs en ligne et fronts : dans la galerie au sud-est de la case.
      if (lignes < 1000 && alea() < 0.08) {
        const gx = cx + maille / 2, gy = cy + maille / 2, pts = [];
        for (let k = 0; k < 4; k++) pts.push({ x: gx + (k - 1.5) * sc * 1.5, y: gy + (alea() - 0.5) * sc });
        liste.push({ type: "mur-ligne", level: 0, points: pts });
        lignes++;
      } else if (fronts < 700 && alea() < 0.06) {
        const gx = cx + maille / 2, gy = cy, pts = [];
        for (let k = 0; k < 8; k++) pts.push({ x: gx + (alea() - 0.5) * sc * 0.6, y: gy + (k - 3.5) * sc * 0.8 });
        liste.push({ type: "front-1", level: 0, points: pts });
        fronts++;
      }
      if (alea() < 0.01) {
        const t = ["eau", "remblais", "effondrement", "inaccessible"][Math.floor(alea() * 4)];
        const gx = cx + maille / 2, gy = cy + maille / 2, r = 1.2 * sc;
        zones.push({ type: t, level: 0, points: [{ x: gx - r, y: gy - r }, { x: gx + r, y: gy - r },
          { x: gx + r, y: gy + r }, { x: gx - r, y: gy + r }] });
      }
      if (alea() < 0.04) points.push({ id: "POI " + points.length, x: cx + maille / 2, y: cy + maille / 2, level: 0,
        tags: ["danger"] });
    }
  }
  window.__v3dAvant = (window._ktaDataStructurePolygons || []).slice();
  window._ktaDataStructurePolygons = (window._ktaDataStructurePolygons || []).concat(liste);
  window.setZones(zones);
  window.setEditorPoints(points);
  return { piliers: piliers, murs: murs, lignes: lignes, fronts: fronts, zones: zones.length, poi: points.length,
    depart: { x: x0 + maille * cotes / 2, y: y0 + maille * cotes / 2 + maille / 2, cap: 90 } };
}

// Dessin d'un pilier au doigt en vue plongeante sur le plan dense (KTA_V3D_PERF=dessin) : coût d'un sommet (geste de
// la carte et aperçu, sans reconstruction) et délai de la fermeture jusqu'à la scène refaite, par rendu.
async function mesuresDessin(page, depart) {
  for (const rendu of ["structures", "mixte"]) {
    const r = await page.evaluate(async function (a) {
      const K = window.KtaVue3D, sc = window.APP_CONFIG.scale;
      const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
      const images = async function (n) {
        for (let i = 0; i < n; i++) await new Promise(function (ok) { requestAnimationFrame(ok); });
      };
      window.setPlanRenduVue3D(null, a.rendu);
      await K.ouvrir({ depart: a.d, commandes: "joystick" });
      K.basculerVue();
      await pause(400); await images(10);
      let ctx = null;
      const deg = K.greffer({ nom: "v3d-perf-dessin", scene: function (c) { ctx = c; } });
      if (deg) deg();
      await pause(400); await images(10);
      const ecran = function (x, z) {
        const cv = document.querySelector("#kta-vue3d canvas"), rc = cv.getBoundingClientRect();
        const v = new ctx.THREE.Vector3(x, 0, z).project(ctx.camera);
        return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height };
      };
      const tap = async function (x, z) {
        const p = ecran(a.d.x / sc + x, a.d.y / sc + z), cv = document.querySelector("#kta-vue3d canvas");
        const o = { bubbles: true, cancelable: true, pointerId: 90, pointerType: "touch", isPrimary: true,
          clientX: p.x, clientY: p.y };
        cv.dispatchEvent(new PointerEvent("pointerdown", o));
        cv.dispatchEvent(new PointerEvent("pointerup", o));
        await images(2);
      };
      K.dessiner(true);
      window.toggleStructureMode("pilier-1");
      const n0 = K.etat().donnees.refaites;
      for (const c of [[2.5, -0.5], [3.5, -0.5], [3.5, 0.5], [2.5, 0.5]]) await tap(c[0], c[1]);
      const pendant = K.etat().donnees.refaites - n0, poses = K.etat().dessin.msPoses.slice();
      const t0 = performance.now();
      await tap(2.5, -0.5);
      while (K.etat().donnees.refaites === n0 && performance.now() - t0 < 20000) await images(1);
      await images(1);
      const visible = performance.now() - t0;
      const ed = K.etat();
      window.toggleStructureMode("pilier-1");
      // Plan au sol : mémoire (tas JS, Chromium) et texture avant / après, temps de dessin, images par seconde.
      const tas = function () { return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; };
      const ips = async function () {
        const t = performance.now(); let n = 0;
        while (performance.now() - t < 1500) { K.tourner(1); await images(1); n++; }
        return Math.round(n * 1000 / (performance.now() - t));
      };
      const sol = { tasAvant: tas(), texAvant: ed.memoire ? ed.memoire.textures : null, ipsAvant: await ips() };
      document.querySelector('#kta-vue3d [data-v3d="planSol"]').click();
      const tS = performance.now();
      while (!(K.etat().dessin.planSol && K.etat().dessin.planSol.px) && performance.now() - tS < 20000) await images(1);
      await images(5);
      const es = K.etat();
      Object.assign(sol, { plan: es.dessin.planSol, tasApres: tas(), texApres: es.memoire ? es.memoire.textures : null,
        ipsApres: await ips(), v2: !!(window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.tiledV2) });
      await K.fermer();
      window.setStructures([]);
      return { planSol: sol, rendu: a.rendu, msSommets: poses.map(function (v) { return +v.toFixed(1); }), refaitesPendant: pendant,
        msFermetureScene: ed.dessin.msFin === null ? null : +ed.dessin.msFin.toFixed(0),
        msReconstruction: ed.donnees.ms, msVisible: +visible.toFixed(0), tuilesReprises: ed.dessin.tuilesReprises,
        tuiles: ed.tuiles, msIndex: ed.msIndex, msEmpreinte: ed.donnees.msEmpreinte };
    }, { d: depart, rendu: rendu });
    console.log("  📏 dessin d'un pilier (plan dense, plongée) : " + JSON.stringify(r));
  }
}

async function mesures(page, depart) {
  const out = {};
  const cas_ = [{ nom: "20 m", d: 20 }, { nom: "30 m", d: 30 }, { nom: "50 m", d: 50 }, { nom: "75 m", d: 75 },
    { nom: "100 m", d: 100 }, { nom: "30 m sans tuiles", d: 30, sansTuiles: true },
    { nom: "plongée, recul 60 m", d: 30, recul: 60 }];
  for (const cas of cas_) {
    const r = await page.evaluate(function (c) {
      return window.KtaVue3D.ouvrir({ depart: c.depart, distanceVue: c.d, tuiles: !c.sansTuiles }).then(function () {
        if (c.recul) { window.KtaVue3D.basculerVue(); window.KtaVue3D.zoomer(c.recul / 18.4); }
        const e0 = window.KtaVue3D.etat();
        const m = window.KtaVue3D.mesurer({ images: 90 });
        const e1 = window.KtaVue3D.etat();
        window.KtaVue3D.fermer();
        const tas = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        return { ouverture: e0.msOuverture, index: e0.msIndex, tuiles: e1.tuiles, construites: e1.construites,
          geometries: m.memoire.geometries, premierTour: m.msPremierTour, msMed: m.msMed, msP95: m.msP95,
          msMax: m.msMax, triangles: m.trianglesMax, appels: m.appelsMax, tasMo: tas };
      });
    }, { depart: depart, d: cas.d, sansTuiles: !!cas.sansTuiles, recul: cas.recul || 0 });
    out[cas.nom] = r;
    console.log("  📏 " + cas.nom + " : " + JSON.stringify(r));
  }
  return out;
}

// Réseau synthétique pour le mode galerie (mémoire seule) : 26 tracés est-ouest et 26 nord-sud tous les 12 m sur
// 300 m, un sommet tous les 5 m un peu décalé (≈ 3 100 tronçons, 676 carrefours), quatre types dont un perso ; zones
// et POI aux carrefours.
function semerGalerie() {
  const sc = window.APP_CONFIG.scale, W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
  if (window.__v3dAvant) window._ktaDataStructurePolygons = window.__v3dAvant;
  let graine = 11;
  const alea = function () { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  const cote = 300, pas = 12, x0 = W / 2 / sc - cote / 2, z0 = H / 2 / sc - cote / 2;
  const types = ["principal", "secondaire", "chemin", "cust-v3d-galerie"], roads = [], zones = [], points = [];
  let troncons = 0;
  for (let k = 0; k <= 25; k++) {
    for (let sens = 0; sens < 2; sens++) {
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const a = i * 5, b = k * pas + (alea() - 0.5) * 1.2;
        pts.push(sens ? { x: (x0 + b) * sc, y: (z0 + a) * sc } : { x: (x0 + a) * sc, y: (z0 + b) * sc });
      }
      troncons += pts.length - 1;
      roads.push({ type: types[(k + sens) % 4], level: 0, points: pts });
    }
  }
  for (let k = 0; k < 120; k++) {
    const cx = x0 + Math.floor(alea() * 25) * pas + 6, cz = z0 + Math.floor(alea() * 26) * pas, r = 2;
    zones.push({ type: ["eau", "remblais", "inaccessible", "effondrement"][k % 4], level: 0,
      points: [{ x: (cx - r) * sc, y: (cz - r) * sc }, { x: (cx + r) * sc, y: (cz - r) * sc },
        { x: (cx + r) * sc, y: (cz + r) * sc }, { x: (cx - r) * sc, y: (cz + r) * sc }] });
  }
  for (let k = 0; k < 300; k++) {
    points.push({ id: "POI " + k, level: 0, tags: ["danger"], x: (x0 + alea() * cote) * sc, y: (z0 + alea() * cote) * sc });
  }
  window.setRoads(roads);
  window.setZones(zones);
  window.setEditorPoints(points);
  window.setPlanRenduVue3D(null, "galerie");
  window.KtaGalerie.invalider();
  const t0 = performance.now(), m = window.KtaGalerie.modele(0), ms = performance.now() - t0;
  return { troncons: troncons, aretes: m.aretes.length, pieces: m.pieces.length, dalles: m.dalles, coudes: m.coudes,
    msModele: Math.round(ms), zones: zones.length, poi: points.length,
    depart: { x: (x0 + 150) * sc, y: (z0 + 12 * 12) * sc, cap: 90 } };
}

// Mixte : réseau de semerGalerie posé, puis le plan dense (semerPlanDense) gardé sur la moitié est : la marche de
// 120 m passe des tubes aux chambres. Appelé après les deux semis.
function semerMixte() {
  const sc = window.APP_CONFIG.scale, W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
  const garde = (window.__v3dAvant || []).length;
  window._ktaDataStructurePolygons = window._ktaDataStructurePolygons.filter(function (s, i) {
    return i < garde || s.points[0].x > W / 2;
  });
  window.setPlanRenduVue3D(null, "mixte");
  window.KtaGalerie.invalider();
  const t0 = performance.now(), m = window.KtaGalerie.modele(0, true), ms = performance.now() - t0;
  return { structures: window._ktaDataStructurePolygons.length - garde, aretes: m.aretes.length,
    pieces: m.pieces.length, chambres: m.chambres, ouverts: m.ouverts, msModele: Math.round(ms),
    depart: { x: W / 2, y: H / 2 - 6 * sc, cap: 90 } };
}

// nom : "galerie" (réseau seul, rendu galerie) ou "mixte" (semis déjà posé par semerMixte).
// Dix passages entre niveaux (tous les moyens, puits de surface et aération) et deux tracés jonction autour du départ,
// dans les galeries du plan dense (mémoire seule) : le coût des volumes construits à portée.
function semerPassages(d) {
  const sc = window.APP_CONFIG.scale, tags = ["jes", "jpe", "jps", "peo", "eso", "pa", "jes", "jpe", "jps", "jpe"];
  const niv = [[0, -1], [0, 1], [-1, 0, 1], null, null, [0, -1], [0, 1], [0, -1], [-1, 0, 1], [0, 1]];
  const pts = tags.map(function (t, i) {
    const a = i * Math.PI / 5, r = (8 + (i % 3) * 7) * sc, x = d.x + Math.cos(a) * r, y = d.y + Math.sin(a) * r;
    const o = { id: "Passage mesure " + i, uid: "pt_mes_" + i, level: 0, tags: [t], x: x, y: y };
    if (niv[i]) {
      o.niveaux = niv[i];
      o.accroches = niv[i].filter(function (n) { return n !== 0; }).map(function (n) { return { level: n, x: x, y: y }; });
    }
    return o;
  });
  window.setEditorPoints(window.getEditorPoints().concat(pts));
  window.setRoads(window.getRoads().concat([
    { uid: "rd_mes_jb", type: "jonction", level: 0, fromLevel: 0, toLevel: -1, points: [{ x: d.x - 20 * sc, y: d.y },
      { x: d.x - 20 * sc, y: d.y + 8 * sc }] },
    { uid: "rd_mes_jh", type: "jonction", level: 0, fromLevel: 0, toLevel: 1, points: [{ x: d.x + 20 * sc, y: d.y },
      { x: d.x + 20 * sc, y: d.y - 8 * sc }] }]));
  window.ktaSetActiveLevel(0);
  return pts.length;
}

// Ouverture à 30 m et tour sur place, deux passages : sans puis avec les passages (même plan dense).
async function mesuresPassages(page, depart) {
  const un = function (avec) {
    return page.evaluate(function (c) {
      return window.KtaVue3D.ouvrir({ depart: c.depart, distanceVue: 30 }).then(function () {
        const e0 = window.KtaVue3D.etat(), m = window.KtaVue3D.mesurer({ images: 90 }), e1 = window.KtaVue3D.etat();
        window.KtaVue3D.fermer();
        const v = e1.volumes.filter(function (q) { return q.construit; });
        return { volumes: v.length, trianglesVolumes: v.reduce(function (s, q) { return s + (q.triangles || 0); }, 0),
          ouverture: e0.msOuverture, msMed: m.msMed, msP95: m.msP95, msMax: m.msMax, triangles: m.trianglesMax,
          appels: m.appelsMax };
      });
    }, { depart: depart });
  };
  for (let i = 0; i < 2; i++) console.log("  📏 30 m sans passages : " + JSON.stringify(await un(false)));
  const n = await page.evaluate(semerPassages, depart);
  console.log("  ℹ️ " + n + " passages et 2 tracés jonction semés autour du départ");
  for (let i = 0; i < 2; i++) console.log("  📏 30 m avec passages : " + JSON.stringify(await un(true)));
  // Passage animé (fondu + descente) : durée des images pendant le geste, construction de l'autre niveau comprise.
  const geste = await page.evaluate(function (d) {
    const K = window.KtaVue3D, sc = window.APP_CONFIG.scale;
    return K.ouvrir({ depart: { x: d.x + 8 * sc - 1 * sc, y: d.y, cap: 90 }, distanceVue: 30 }).then(function () {
      K.gesteAnime(true);
      const lance = K.changerNiveau("bas"), durees = [];
      return new Promise(function (r) {
        let t = 0;
        (function img(ts) {
          if (t) durees.push(ts - t);
          t = ts;
          if (K.etat().geste) { requestAnimationFrame(img); return; }
          K.fermer();
          durees.sort(function (a, b) { return a - b; });
          r({ lance: lance, images: durees.length, msMed: +durees[durees.length >> 1].toFixed(1),
            msMax: +durees[durees.length - 1].toFixed(1), plus33ms: durees.filter(function (v) { return v > 33.4; }).length });
        })(0);
      });
    });
  }, depart);
  console.log("  📏 passage animé (images pendant le geste) : " + JSON.stringify(geste));
}

// Coût d'une scène refaite sur changement de données (vue ouverte, un pilier de session ajouté à 3 m puis retiré,
// 3 fois) : relecture complète (empreinte, caches de KtaGalerie vidés, _reindexer, tuiles proches), et empreinte
// seule après un rendu sans changement.
async function mesuresDonnees(page, depart, nom) {
  const r = await page.evaluate(async function (d) {
    const K = window.KtaVue3D, sc = window.APP_CONFIG.scale;
    const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    const attendre = async function (n) {
      for (let i = 0; i < 100 && (K.etat().donnees.attente || K.etat().donnees.refaites <= n); i++) await pause(30);
      return K.etat().donnees;
    };
    await K.ouvrir({ depart: d, distanceVue: 30 });
    await pause(300);
    const avant = window.getStructures(), ms = [], x = d.x + 3 * sc, y = d.y;
    for (let i = 0; i < 3; i++) {
      let n = K.etat().donnees.refaites;
      window.setStructures(avant.concat([{ uid: "st_mesure_" + i, type: "pilier-1", level: 0,
        points: [{ x: x, y: y }, { x: x + sc, y: y }, { x: x + sc, y: y + sc }, { x: x, y: y + sc }] }]));
      const a = await attendre(n);
      ms.push({ total: a.ms, empreinte: a.msEmpreinte, index: K.etat().msIndex });
      n = a.refaites;
      window.setStructures(avant);
      await attendre(n);
    }
    const v0 = K.etat().donnees.verifs;
    window.renderStructures();
    for (let i = 0; i < 40 && K.etat().donnees.verifs === v0; i++) await pause(30);
    const vide = K.etat().donnees.msEmpreinte;
    const c = K.etat().compte;
    await K.fermer();
    return { refaites: ms, empreinteSeule: vide, objets: { structures: c.structures, roads: c.roads, points: c.points } };
  }, depart);
  console.log("  📏 " + nom + ", scène refaite sur données changées (ms) : " + JSON.stringify(r));
}

async function mesuresGalerie(page, nom, semisDonne) {
  const semis = semisDonne || await page.evaluate(semerGalerie);
  console.log("  ℹ️ réseau " + nom + " synthétique : " + JSON.stringify(semis));
  for (const d of [30, 50]) {
    const r = await page.evaluate(function (c) {
      return window.KtaVue3D.ouvrir({ depart: c.depart, distanceVue: c.d }).then(function () {
        const e0 = window.KtaVue3D.etat(), m = window.KtaVue3D.mesurer({ images: 90 }), e1 = window.KtaVue3D.etat();
        const parois = window.KtaVue3D.parois().length, tx = window.KtaVue3D.textures();
        window.KtaVue3D.fermer();
        const tas = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        // Textures : dessin à cette ouverture (structures, pierre des parois) et premier dessin dans la page.
        return { rendu: e1.rendu, ouverture: e0.msOuverture, index: e0.msIndex, construites: e1.construites,
          parois: parois, premierTour: m.msPremierTour, msMed: m.msMed, msP95: m.msP95,
          msMax: m.msMax, triangles: m.trianglesMax, appels: m.appelsMax, tasMo: tas,
          textures: { structures: tx.ms, parois: tx.msParoi, premiers: tx.dessins } };
      });
    }, { depart: semis.depart, d: d });
    console.log("  📏 " + nom + " " + d + " m : " + JSON.stringify(r));
  }
  const marche = await page.evaluate(function (d) {
    return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30 }).then(function () {
      const sc = window.APP_CONFIG.scale, durees = [];
      return new Promise(function (r) {
        let i = 0, t = 0;
        function pas(ts) {
          if (t && i > 3) durees.push(ts - t);
          t = ts;
          if (i++ >= 600) {
            window.KtaVue3D.fermer();
            durees.sort(function (a, b) { return a - b; });
            r({ images: durees.length, msMed: +durees[durees.length >> 1].toFixed(1),
              msP95: +durees[Math.floor(durees.length * 0.95)].toFixed(1), msMax: +durees[durees.length - 1].toFixed(1),
              plus33ms: durees.filter(function (v) { return v > 33.4; }).length });
            return;
          }
          window.KtaVue3D.placer(d.x + (i * 0.2 - 60) * sc, d.y, 90);
          requestAnimationFrame(pas);
        }
        requestAnimationFrame(pas);
      });
    });
  }, semis.depart);
  console.log("  📏 " + nom + ", marche 120 m (intervalle entre images) : " + JSON.stringify(marche));
  // Règle du pas sur la même marche : 600 pas de 0,2 m (avancer = un lot _juger par essai) ; chaque pas part de sa
  // place sur la ligne, pour couvrir les 120 m (tubes et chambres) même si l'un est refusé.
  const pasMarche = await page.evaluate(function (d) {
    return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30 }).then(function () {
      const sc = window.APP_CONFIG.scale, t = [];
      let refus = 0;
      for (let i = 0; i < 600; i++) {
        window.KtaVue3D.placer(d.x + (i * 0.2 - 60) * sc, d.y, 90);
        const t0 = performance.now();
        if (!window.KtaVue3D.avancer(0.2)) refus++;
        t.push(performance.now() - t0);
      }
      window.KtaVue3D.fermer();
      const total = t.reduce(function (s, v) { return s + v; }, 0);
      t.sort(function (a, b) { return a - b; });
      return { pas: t.length, refus: refus, msMed: +t[t.length >> 1].toFixed(3),
        msP95: +t[Math.floor(t.length * 0.95)].toFixed(3), msMax: +t[t.length - 1].toFixed(3),
        msTotal: Math.round(total) };
    });
  }, semis.depart);
  console.log("  📏 " + nom + ", règle du pas sur la marche 120 m (avancer 0,2 m) : " + JSON.stringify(pasMarche));
  const coutPas = await page.evaluate(function (d) {
    return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30 }).then(function () {
      const libres = [], refuses = [];
      for (let i = 0; i < 600; i++) {
        const t0 = performance.now(), ok = window.KtaVue3D.avancer(0.08);
        (ok ? libres : refuses).push(performance.now() - t0);
        if (!ok) window.KtaVue3D.tourner(90);
      }
      window.KtaVue3D.fermer();
      const st = function (t) {
        if (!t.length) return null;
        t.sort(function (a, b) { return a - b; });
        return { n: t.length, msMed: +t[t.length >> 1].toFixed(3), msP95: +t[Math.floor(t.length * 0.95)].toFixed(3) };
      };
      return { libres: st(libres), refuses: st(refuses) };
    });
  }, semis.depart);
  console.log("  📏 " + nom + ", pas balayé (avancer 8 cm) : " + JSON.stringify(coutPas));
  await page.evaluate(function (d) { return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30, stats: true }); },
    semis.depart);
  await page.waitForTimeout(800);
  await capture(page, nom + "-dense");
  await page.evaluate(function () { window.__v3dImg0 = window.KtaVue3D.etat().images; });
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(3000);
  await page.keyboard.up("ArrowLeft");
  const n = await page.evaluate(function () {
    const k = window.KtaVue3D.etat().images - window.__v3dImg0;
    window.KtaVue3D.fermer();
    return k;
  });
  console.log("  📏 " + nom + ", rotation continue 3 s : " + Math.round(n / 3) + " images/s");
}

// ── 26. Données du plan changées pendant la vue : scène refaite sans rouvrir, place gardée (kta:donneesPlanChange) ──
// Chaque source (setStructures, setZones, setRoads, setEditorPoints, fiche, annulation, calque rapatrié puis
// restitué, case de calque, légende) : la scène change sans rouvrir, une rafale = une reconstruction, rien pendant
// un geste (rattrapé à sa fin), aucun coût sans changement, un rendu sans changement relu sans rien refaire.
async function sectionDonnees(page, MX) {
  const R = await page.evaluate(async function (a) {
    const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
    const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    const carre = function (cx, cz, r) { return [P(cx - r, cz - r), P(cx + r, cz - r), P(cx + r, cz + r), P(cx - r, cz + r)]; };
    const pilier = function (uid, cx, cz, r) { return { uid: uid, type: "pilier-1", level: 0, points: carre(cx, cz, r || 1) }; };
    const r = {};
    if (window.getTrackingActif()) window.stopTracking();
    window._currentLoadedPlanId = "v3d-checkup-donnees";
    window.setPlanRenduVue3D(null, "mixte");
    window.setRoads([{ uid: "rd_dn_p", type: "principal", level: 0, points: [P(-40, 0), P(40, 0)] },
      { uid: "rd_dn_iti", type: "itinerary", level: 0, points: [P(-12, 0), P(30, 0)] }]);
    window.setStructures([pilier("st_dn_a", 10, 4)]);
    window.setZones([]);
    window.setEditorPoints([Object.assign({ id: "POI donnees v3d", uid: "pt_dn_a", level: 0, tags: ["salle"] }, P(-6, 1))]);
    window.KtaGalerie.invalider();
    const d = P(-10, 0);
    // Ouverture en libre avec la place au centre d'un pilier : dégagée au point libre le plus proche ; en suivi
    // (tracker posé dans le pilier), rien : la place est celle du tracker.
    window.setStructures([pilier("st_dn_a", 10, 4), pilier("st_dn_o", -10, 0, 1)]);
    await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "pave" });
    const o1 = K.etat();
    r.ouvLibre = { mode: o1.mode, degagements: o1.degagements, dM: Math.hypot(o1.pos.x - d.x, o1.pos.y - d.y) / a.sc,
      cap: o1.cap };
    await K.fermer();
    window.startTracking();
    window.recalerTrackerSurPoint(d.x, d.y, 0);
    const tr = window.getTrackingPosition();
    await K.ouvrir({ commandes: "pave" });
    const o2 = K.etat();
    r.ouvSuivi = { mode: o2.mode, degagements: o2.degagements, ecart: Math.hypot(o2.pos.x - tr.x, o2.pos.y - tr.y),
      dansPilier: Math.hypot(tr.x - d.x, tr.y - d.y) / a.sc < 1 };
    await K.fermer();
    window.stopTracking();
    window.setStructures([pilier("st_dn_a", 10, 4)]);
    window.KtaGalerie.invalider();
    await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "pave" });
    await pause(300);
    // Place et vue réglées à la main : tout doit survivre aux reconstructions.
    K.tourner(20);
    K.basculerVue();
    K.incliner(10);
    K.zoomer(0.8);
    K.reglerPortee(42);
    K.reglerLampe(200);
    await pause(200);
    const place = function () {
      const e = K.etat();
      return { x: +e.pos.x.toFixed(3), y: +e.pos.y.toFixed(3), cap: +e.cap.toFixed(3), niveau: e.niveau,
        niveauLibre: e.niveauLibre, mode: e.mode, vue: e.vue, inclinaison: e.inclinaison, recul: e.portee.recul,
        distance: e.distance, lampe: e.eclairage.active.intensite, rendu: e.rendu, iti: (e.rubans.itinerary || 0) > 0,
        guidage: e.bandeau.affiche };
    };
    const lire = function () {
      const e = K.etat();
      return { reindex: e.reindexations, donnees: e.donnees, compte: e.compte, place: place(), fiche: e.fiche,
        panneaux: e.panneaux.map(function (q) { return q.nom; }) };
    };
    // Attente de la relecture (rafale de 120 ms au moins) : jusqu'à `refaites` atteint ou 1,5 s.
    const apres = async function (n0) {
      for (let i = 0; i < 30; i++) {
        await pause(50);
        const e = K.etat();
        if (!e.donnees.attente && e.donnees.refaites > n0) break;
      }
      await pause(60);
      return lire();
    };
    r.avant = lire();
    r.place0 = place();
    // Aucun changement : rien sur 40 images (signal absent), puis un rendu sans changement relu sans rien refaire.
    const img0 = K.etat().images;
    K.tourner(0.01);
    for (let i = 0; i < 40; i++) await new Promise(function (ok) { requestAnimationFrame(ok); });
    r.repos = { reindex: K.etat().reindexations - r.avant.reindex, verifs: K.etat().donnees.verifs - r.avant.donnees.verifs,
      images: K.etat().images - img0 };
    K.tourner(-0.01);
    window.renderRoads(); window.renderStructures();
    await pause(400);
    r.vide = lire();
    // setStructures : un pilier de plus.
    let n = r.vide.donnees.refaites;
    window.setStructures(window.getStructures().concat([pilier("st_dn_b", 14, -4)]));
    r.structures = await apres(n); n = r.structures.donnees.refaites;
    window.setZones([{ uid: "zn_dn_e", type: "eau", level: 0, points: carre(20, 0, 1) }]);
    r.zones = await apres(n); n = r.zones.donnees.refaites;
    window.setRoads(window.getRoads().concat([{ uid: "rd_dn_s", type: "secondaire", level: 0,
      points: [P(0, 0), P(0, -20)] }]));
    r.roads = await apres(n); n = r.roads.donnees.refaites;
    window.setEditorPoints(window.getEditorPoints().concat([Object.assign({ id: "POI ajout v3d", uid: "pt_dn_b",
      level: 0, tags: ["salle"] }, P(-4, -1))]));
    r.points = await apres(n); n = r.points.donnees.refaites;
    // Sommet du milieu déplacé (la signature de KtaGalerie ne le voit pas) : relu quand même.
    const sec = window.getRoads().filter(function (q) { return q.uid === "rd_dn_s"; })[0];
    sec.points.splice(1, 0, P(2, -10));
    window.renderRoads();
    r.sommet = await apres(n); n = r.sommet.donnees.refaites;
    // Rafale : 6 écritures à 30 ms d'écart, puis 5 dans la même tâche → une reconstruction chacune.
    for (let i = 0; i < 6; i++) {
      window.setStructures(window.getStructures().concat([pilier("st_dn_r" + i, 24 + i * 3, 6, 0.5)]));
      await pause(30);
    }
    r.rafale = await apres(n); n = r.rafale.donnees.refaites;
    for (let i = 0; i < 5; i++) window.setStructures(window.getStructures().slice(0, -1));
    r.rafale2 = await apres(n); n = r.rafale2.donnees.refaites;
    // Fiche ouverte DEPUIS la 3D : renommé ailleurs → relue ; supprimé (🗑️ de la fiche de la carte) → fermée.
    K.basculerVue();
    const cible = window.getEditorPoints().filter(function (q) { return q.uid === "pt_dn_a"; })[0];
    K.placer(P(-9, 1).x, P(-9, 1).y, 90);
    await pause(400);
    const sp = K.etat().panneaux.filter(function (q) { return q.nom === "POI donnees v3d" && q.visible; })[0];
    r.ficheVisee = !!sp;
    if (sp) {
      const cv = document.querySelector("#kta-vue3d canvas");
      const down = { bubbles: true, pointerId: 41, clientX: sp.ecran.x, clientY: sp.ecran.y };
      cv.dispatchEvent(new PointerEvent("pointerdown", down));
      cv.dispatchEvent(new PointerEvent("pointerup", down));
    }
    await pause(100);
    r.ficheOuverte = !!K.etat().fiche;
    n = K.etat().donnees.refaites;
    cible.nom = "POI renomme v3d";
    window.renderEditorPoints();
    r.renomme = await apres(n); n = r.renomme.donnees.refaites;
    r.renommeTexte = (document.querySelector("#kta-vue3d .kta-v3d-fiche") || {}).textContent || "";
    window.supprimerPointEditor(cible.id, cible.x, cible.y);
    r.supprime = await apres(n); n = r.supprime.donnees.refaites;
    // Annuler (HistoryManager) : le pilier retiré revient.
    const H = window.HistoryManager, avantH = H.captureState();
    window.setStructures(window.getStructures().filter(function (q) { return q.uid !== "st_dn_b"; }));
    H.record("checkup v3d", avantH);
    r.retire = await apres(n); n = r.retire.donnees.refaites;
    H.undo();
    r.annule = await apres(n); n = r.annule.donnees.refaites;
    // Obstacle posé sur la place, en libre : la place est dégagée, comme à l'ouverture.
    const ici = K.etat().pos, sc = a.sc;
    window.setStructures(window.getStructures().concat([{ uid: "st_dn_sur", type: "pilier-1", level: 0,
      points: [{ x: ici.x - sc, y: ici.y - sc }, { x: ici.x + sc, y: ici.y - sc }, { x: ici.x + sc, y: ici.y + sc },
        { x: ici.x - sc, y: ici.y + sc }] }]));
    r.surPlace = await apres(n); n = r.surPlace.donnees.refaites;
    r.surPlaceDe = { x: ici.x, y: ici.y };
    window.setStructures(window.getStructures().filter(function (q) { return q.uid !== "st_dn_sur"; }));
    r.retireSur = await apres(n); n = r.retireSur.donnees.refaites;
    // Légende : couleur du pilier changée (session) → scène refaite ; remise.
    window.LegendCustomization.setColor("structures", "pilier-1", "#c0392b");
    r.legende = await apres(n); n = r.legende.donnees.refaites;
    window.LegendCustomization.setColor("structures", "pilier-1", null);
    r.legendeRemise = await apres(n); n = r.legendeRemise.donnees.refaites;
    // Greffe factice : prévenue (scene « refaite ») et sa règle du pas voit l'obstacle neuf aussitôt.
    const appels = [];
    const q = P(5, 0);
    let ctxG = null;
    const degreffer2 = K.greffer({ nom: "v3d-donnees", scene: function (ctx, raison) { ctxG = ctx; appels.push(raison); } });
    r.greffeLibreAvant = ctxG ? ctxG.libre(q.x, q.y) : null;
    window.setStructures(window.getStructures().concat([pilier("st_dn_g", 5, 0, 1)]));
    r.greffe = await apres(n); n = r.greffe.donnees.refaites;
    r.greffeLibreApres = ctxG ? ctxG.libre(q.x, q.y) : null;
    r.greffeAppels = appels.slice();
    if (degreffer2) degreffer2();
    window.setStructures(window.getStructures().filter(function (s) { return s.uid !== "st_dn_g"; }));
    r.greffeRetiree = await apres(n); n = r.greffeRetiree.donnees.refaites;
    // Geste de passage (niveau de la carte changé : fondu) : une écriture pendant le geste attend sa fin.
    r.multi = window.APP_CONFIG.multiLevel === true && (window.APP_CONFIG.availableLevels || []).indexOf(1) >= 0;
    if (r.multi) {
      r.nGeste = n;
      const anime = K.gesteAnime();
      K.gesteAnime(true);
      window.ktaSetActiveLevel(1);
      await new Promise(function (ok) { requestAnimationFrame(ok); });
      await new Promise(function (ok) { requestAnimationFrame(ok); });
      r.gesteEnCours = !!K.etat().geste;
      window.setStructures(window.getStructures().concat([pilier("st_dn_n1", 12, 0, 1)]));
      window.getStructures()[window.getStructures().length - 1].level = 1;
      window.renderStructures();
      await pause(180);
      r.pendant = { geste: !!K.etat().geste, refaites: K.etat().donnees.refaites - n, attente: K.etat().donnees.attente };
      for (let i = 0; i < 40 && K.etat().geste; i++) await pause(50);
      r.gesteFini = await apres(n); n = r.gesteFini.donnees.refaites;
      window.ktaSetActiveLevel(0);
      for (let i = 0; i < 40 && (K.etat().geste || K.etat().niveau !== 0); i++) await pause(50);
      window.setStructures(window.getStructures().filter(function (s) { return s.uid !== "st_dn_n1"; }));
      r.retourNiveau = await apres(n); n = r.retourNiveau.donnees.refaites;
      K.gesteAnime(anime);
    }
    // Carte déplacée et zoomée sous la décimation PerfUltra (renderRoads complet à chaque moveend / zoomend), vue
    // ouverte : redessin d'affichage seul, ni signal, ni empreinte, ni reconstruction. Les redessins sont comptés
    // par le journal de road.js (debugMode).
    const PU = window.PerfUltra, decimAvant = !!PU.get("decim"), debugAvant = window.APP_CONFIG.debugMode;
    const logAvant = console.log;
    let redessins = 0;
    console.log = function (m) {
      if (typeof m === "string" && m.indexOf("[Road] renderRoads") === 0) { redessins++; return; }
      return logAvant.apply(console, arguments);
    };
    window.APP_CONFIG.debugMode = true;
    PU.set("decim", true);
    await pause(400);
    const m0 = lire();
    window.map.panBy([120, 60], { animate: false });
    await pause(400);
    window.map.setZoom(window.map.getZoom() + 1, { animate: false });
    await pause(400);
    window.map.panBy([-120, -60], { animate: false });
    await pause(400);
    window.map.setZoom(window.map.getZoom() - 1, { animate: false });
    await pause(400);
    const m1 = lire();
    r.carteBouge = { redessins: redessins, signaux: m1.donnees.signaux - m0.donnees.signaux,
      verifs: m1.donnees.verifs - m0.donnees.verifs, refaites: m1.donnees.refaites - m0.donnees.refaites,
      reindex: m1.reindex - m0.reindex };
    PU.set("decim", decimAvant);
    await pause(400);
    window.APP_CONFIG.debugMode = debugAvant;
    console.log = logAvant;
    // Calque de données (lu comme un calque du plan) : rapatrié (🔄 Modifier), copie de session retouchée, restitué ;
    // puis case du calque décochée et recochée dans ≡ Filtres. La vue reste ouverte de bout en bout.
    r.finAvantCalque = lire();
    await K.fermer();
    const bouchons = { r: window.getAllEmbeddedRoads, z: window.getAllEmbeddedZones, p: window.getAllEmbeddedPoints,
      s: window.getAllEmbeddedStructures };
    const vrais = window.__v3dEmb;
    window.getAllEmbeddedRoads = vrais.r; window.getAllEmbeddedZones = vrais.z; window.getAllEmbeddedPoints = vrais.p;
    window.getAllEmbeddedStructures = vrais.s;
    const CAL = "v3d_dn_calque";
    const json = { data: [Object.assign({ id: "POI calque v3d", nom: "POI calque v3d", uid: "pt_dn_cal", tags: ["salle"],
      level: 0, description: "" }, P(-3, 2))],
      structures: [pilier("st_dn_cal1", 16, 4, 0.8), pilier("st_dn_cal2", 16, -4, 0.8)] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
    window.PLAN_CONFIG.dataLayers = (window.PLAN_CONFIG.dataLayers || []).concat([
      { id: CAL, label: "Calque du checkup v3d", file: url, visible: true }]);
    const groupe = L.layerGroup().addTo(window.map);
    window.dataLayerGroups[CAL] = groupe;
    window.ajouterPointsDepuisJSON(url, groupe);
    const charge = function () {
      return window.getAllEmbeddedStructures().some(function (o) { return o && o.uid === "st_dn_cal1"; });
    };
    for (let i = 0; i < 60 && !charge(); i++) await pause(50);
    r.calqueCharge = charge();
    await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "pave" });
    await pause(300);
    r.cal0 = lire(); n = r.cal0.donnees.refaites;
    r.rapatrie = await window.CalqueSession.rapatrier(CAL);
    r.cal1 = await apres(n); n = r.cal1.donnees.refaites;
    r.copieSession = window.getStructures().filter(function (o) { return o && o.uid === "st_dn_cal1"; }).length;
    window.setStructures(window.getStructures().filter(function (o) { return !o || o.uid !== "st_dn_cal1"; }));
    r.cal2 = await apres(n); n = r.cal2.donnees.refaites;
    r.restitue = window.CalqueSession.restituer(CAL, { local: true });
    r.cal3 = await apres(n); n = r.cal3.donnees.refaites;
    // Case du calque (≡ Filtres) : son propre signal (FilterPanel.onChange), une reconstruction ; le rendu de la
    // carte qui suit (150 ms plus tard) est relu sans rien refaire.
    window.FilterPanel.ouvrir();
    await pause(150);
    const caseCal = function () { return document.querySelector('#kta-fp-modal [data-data-layer="' + CAL + '"]'); };
    r.caseTrouvee = !!caseCal();
    const ri = K.etat().reindexations;
    if (caseCal()) caseCal().click();
    await pause(700);
    r.decoche = Object.assign(lire(), { reindexDelta: K.etat().reindexations - ri });
    const ri2 = K.etat().reindexations;
    if (caseCal()) caseCal().click();
    await pause(700);
    r.recoche = Object.assign(lire(), { reindexDelta: K.etat().reindexations - ri2 });
    window.FilterPanel.fermer();
    await pause(100);
    await K.fermer();
    window.map.removeLayer(groupe);
    delete window.dataLayerGroups[CAL];
    window.PLAN_CONFIG.dataLayers = window.PLAN_CONFIG.dataLayers.filter(function (l) { return l.id !== CAL; });
    window.getAllEmbeddedRoads = bouchons.r; window.getAllEmbeddedZones = bouchons.z;
    window.getAllEmbeddedPoints = bouchons.p; window.getAllEmbeddedStructures = bouchons.s;
    URL.revokeObjectURL(url);
    r.fin = r.finAvantCalque;
    window.setRoads([]); window.setZones([]); window.setStructures([]); window.setEditorPoints([]);
    window.KtaGalerie.invalider();
    return r;
  }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });

  const eq = function (p, q) { return JSON.stringify(p) === JSON.stringify(q); };
  const A = R.avant, P0 = R.place0;
  verifier(R.repos.reindex === 0 && R.repos.verifs === 0 && A.donnees.signaux === 0,
    "sans changement : aucune relecture ni reconstruction sur 40 images", { repos: R.repos, signaux: A.donnees.signaux });
  verifier(R.vide.donnees.verifs > A.donnees.verifs && R.vide.donnees.refaites === 0 && R.vide.reindex === A.reindex,
    "rendu de la carte sans changement (renderRoads, renderStructures) : empreinte relue, rien refait",
    { verifs: R.vide.donnees.verifs, refaites: R.vide.donnees.refaites, reindex: [A.reindex, R.vide.reindex],
      msEmpreinte: R.vide.donnees.msEmpreinte });
  const cas = [
    ["setStructures", R.structures, R.vide, function (x, y) { return x.compte.structures === y.compte.structures + 1; }],
    ["setZones", R.zones, R.structures, function (x, y) { return x.compte.zones === y.compte.zones + 1; }],
    ["setRoads", R.roads, R.zones, function (x, y) { return x.compte.roads === y.compte.roads + 1; }],
    ["setEditorPoints", R.points, R.roads, function (x, y) { return x.compte.points === y.compte.points + 1; }],
    ["sommet du milieu déplacé", R.sommet, R.points, function (x, y) { return x.compte.roads === y.compte.roads; }],
    ["annuler (HistoryManager)", R.annule, R.retire, function (x, y) { return x.compte.structures === y.compte.structures + 1; }],
    ["légende (couleur du pilier)", R.legende, R.retireSur, function (x, y) { return x.compte.structures === y.compte.structures; }]
  ];
  cas.forEach(function (c) {
    const x = c[1], y = c[2];
    verifier(x.donnees.refaites === y.donnees.refaites + 1 && x.reindex === y.reindex + 1 && c[3](x, y) &&
      eq(x.place, y.place), c[0] + " pendant la vue : une reconstruction, scène changée, place, cap, niveau, mode, " +
      "vue, réglages, itinéraire gardés", { refaites: [y.donnees.refaites, x.donnees.refaites], reindex: [y.reindex, x.reindex],
      compte: [y.compte, x.compte], place: [y.place, x.place] });
  });
  verifier(eq(R.structures.place, P0) && P0.vue === "plongee" && P0.distance === 42 && P0.lampe === 200 && P0.iti &&
    P0.rendu === "mixte", "place de départ réglée (plongée, inclinaison, zoom, portée 42 m, lampe 200 %, itinéraire)",
    P0);
  verifier(R.rafale.donnees.refaites === R.sommet.donnees.refaites + 1 &&
    R.rafale.compte.structures === R.sommet.compte.structures + 6 &&
    R.rafale2.donnees.refaites === R.rafale.donnees.refaites + 1 &&
    R.rafale2.compte.structures === R.rafale.compte.structures - 5,
    "rafale (6 écritures à 30 ms, puis 5 d'un coup) : une reconstruction chacune",
    { refaites: [R.sommet.donnees.refaites, R.rafale.donnees.refaites, R.rafale2.donnees.refaites],
      structures: [R.sommet.compte.structures, R.rafale.compte.structures, R.rafale2.compte.structures] });
  verifier(R.ficheVisee && R.ficheOuverte && R.renomme.fiche && R.renomme.fiche.nom === "POI renomme v3d" &&
    /POI renomme v3d/.test(R.renommeTexte) && R.renomme.panneaux.indexOf("POI renomme v3d") >= 0,
    "fiche ouverte depuis la 3D : POI renommé ailleurs → fiche et panneau relus",
    { visee: R.ficheVisee, ouverte: R.ficheOuverte, fiche: R.renomme.fiche, panneaux: R.renomme.panneaux });
  verifier(!R.supprime.fiche && R.supprime.compte.points === R.renomme.compte.points - 1 &&
    R.supprime.panneaux.indexOf("POI renomme v3d") < 0 && R.supprime.donnees.refaites === R.renomme.donnees.refaites + 1,
    "POI supprimé (🗑️ de la fiche de la carte) : panneau retiré, fiche de la 3D fermée",
    { fiche: R.supprime.fiche, points: [R.renomme.compte.points, R.supprime.compte.points] });
  const dS = Math.hypot(R.surPlace.place.x - R.surPlaceDe.x, R.surPlace.place.y - R.surPlaceDe.y) / MX.sc;
  verifier(R.surPlace.donnees.degagees === R.annule.donnees.degagees + 1 && dS > 0.9 && dS < 4 &&
    R.surPlace.place.cap === R.annule.place.cap && R.surPlace.place.mode === "libre",
    "pilier posé sur la place (libre) : place dégagée au point libre le plus proche, cap gardé", { dS: dS });
  verifier(R.greffeLibreAvant === true && R.greffeLibreApres === false &&
    R.greffeAppels.filter(function (x) { return x === "refaite"; }).length === 1,
    "greffe : prévenue une fois (scene « refaite »), ctx.libre voit l'obstacle neuf aussitôt",
    { avant: R.greffeLibreAvant, apres: R.greffeLibreApres, appels: R.greffeAppels });
  if (R.multi) {
    verifier(R.gesteEnCours && R.pendant.geste && R.pendant.refaites === 0 && R.pendant.attente &&
      R.gesteFini.donnees.refaites === R.nGeste + 1 && R.gesteFini.place.niveau === 1,
      "écriture pendant un geste de passage : rien pendant, relue à sa fin", { pendant: R.pendant,
        fini: R.gesteFini.donnees });
  } else {
    console.log("  ℹ️ plan à un niveau : écriture pendant un geste non jouée");
  }
  verifier(R.calqueCharge && R.rapatrie && R.rapatrie.ok && R.copieSession === 1 &&
    R.cal1.donnees.refaites === R.cal0.donnees.refaites + 1 && R.cal1.compte.structures === R.cal0.compte.structures &&
    R.cal1.compte.points === R.cal0.compte.points && eq(R.cal1.place, R.cal0.place),
    "calque rapatrié (🔄 Modifier) vue ouverte : scène refaite sur les copies de session (ni double, ni trou), place gardée",
    { charge: R.calqueCharge, rap: R.rapatrie, copie: R.copieSession, compte: [R.cal0.compte, R.cal1.compte] });
  verifier(R.cal2.compte.structures === R.cal1.compte.structures - 1 && R.restitue && R.restitue.ok &&
    R.cal3.compte.structures === R.cal0.compte.structures && R.cal3.donnees.refaites === R.cal2.donnees.refaites + 1 &&
    eq(R.cal3.place, R.cal0.place),
    "copie retouchée (pilier retiré) puis calque restitué : scène suivie à chaque fois, place gardée",
    { structures: [R.cal0.compte.structures, R.cal1.compte.structures, R.cal2.compte.structures,
      R.cal3.compte.structures], restitue: R.restitue });
  verifier(R.caseTrouvee && R.decoche.compte.structures === R.cal3.compte.structures - 2 &&
    R.decoche.compte.points === R.cal3.compte.points - 1 && R.decoche.reindexDelta === 1 &&
    R.recoche.compte.structures === R.cal3.compte.structures && R.recoche.reindexDelta === 1 &&
    R.decoche.donnees.refaites === R.cal3.donnees.refaites && eq(R.recoche.place, R.cal0.place),
    "case du calque dans ≡ : une reconstruction par clic (le rendu de la carte qui suit ne refait rien), place gardée",
    { trouvee: R.caseTrouvee, structures: [R.cal3.compte.structures, R.decoche.compte.structures,
      R.recoche.compte.structures], delta: [R.decoche.reindexDelta, R.recoche.reindexDelta] });
  verifier(R.ouvLibre.mode === "libre" && R.ouvLibre.degagements === 1 && R.ouvLibre.dM > 1.3 && R.ouvLibre.dM < 4 &&
    R.ouvLibre.cap === 90, "ouverture en libre au centre d'un pilier : place dégagée hors du pilier, cap gardé",
    R.ouvLibre);
  verifier(R.ouvSuivi.dansPilier && R.ouvSuivi.mode === "suivi" && R.ouvSuivi.degagements === 0 &&
    R.ouvSuivi.ecart < 1e-6,
    "ouverture en suivi, tracker dans le pilier : rien, la place est celle du tracker", R.ouvSuivi);
  verifier(R.carteBouge.redessins >= 4 && R.carteBouge.signaux === 0 && R.carteBouge.verifs === 0 &&
    R.carteBouge.refaites === 0 && R.carteBouge.reindex === 0,
    "carte déplacée et zoomée sous la décimation PerfUltra (" + R.carteBouge.redessins + " redessins) : " +
    "ni signal, ni empreinte, ni reconstruction de la 3D", R.carteBouge);
  verifier(R.fin.donnees.signaux > 0 && R.fin.donnees.refaites > 10,
    "bilan : " + R.fin.donnees.signaux + " signaux, " + R.fin.donnees.verifs + " relectures, " +
    R.fin.donnees.refaites + " reconstructions (dernière " + R.fin.donnees.ms + " ms, empreinte " +
    R.fin.donnees.msEmpreinte + " ms)", R.fin.donnees);
}

// ── 27. Toucher un objet → sa fiche de la carte (structure, zone, tracé), « Voir sur la carte », verrous ──────
// Formes fictives autour du centre du plan (m) : tracé principal z = 0 (x de -30 à 30), zone eau qui le coupe
// (x -20 à -18), pilier (8, 6), mur polygone (x 7,8 à 8,2, z 10 à 14), zone remblais hors du tracé, POI collé au
// pilier. On vise un point du monde projeté par la caméra de la vue (ctx d'une greffe vide) et on touche au doigt.
async function sectionFichesObjets(page) {
  const R = await page.evaluate(async function () {
    const K = window.KtaVue3D, sc = window.APP_CONFIG.scale;
    const W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
    const ox = W / 2 / sc, oz = H / 2 / sc;
    const P = function (x, z) { return { x: (ox + x) * sc, y: (oz + z) * sc }; };
    const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    const images = async function (n) {
      for (let i = 0; i < (n || 3); i++) await new Promise(function (ok) { requestAnimationFrame(ok); });
    };
    const rect = function (x0, x1, z0, z1) { return [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)]; };
    const r = { cas: [] };
    if (window.getTrackingActif()) window.stopTracking();
    // Calques du plan mis de côté : seules les formes du checkup comptent (rendus au calque de la fin de section).
    window.__v3dFi = { r: window.getAllEmbeddedRoads, z: window.getAllEmbeddedZones, p: window.getAllEmbeddedPoints,
      s: window.getAllEmbeddedStructures, id: window._currentLoadedPlanId };
    const vide = function () { return []; };
    window.getAllEmbeddedRoads = window.getAllEmbeddedZones = window.getAllEmbeddedPoints = vide;
    window.getAllEmbeddedStructures = vide;
    window._currentLoadedPlanId = "v3d-checkup-fiches";
    const poser = function () {
      window.setRoads([{ uid: "rd_fi_p", type: "principal", level: 0, points: [P(-30, 0), P(30, 0)],
        description: "note du trace" }]);
      window.setStructures([
        { uid: "st_fi_pil", type: "pilier-1", level: 0, points: rect(7, 9, 5, 7) },
        { uid: "st_fi_mur", type: "mur", level: 0, points: rect(7.8, 8.2, 10, 14) }
      ]);
      window.setZones([
        { uid: "zn_fi_eau", type: "eau", level: 0, points: rect(-20, -18, -4, 4) },
        { uid: "zn_fi_rem", type: "remblais", level: 0, points: rect(-8, -4, 5, 8) }
      ]);
      window.setEditorPoints([Object.assign({ id: "POI fiche v3d", nom: "POI fiche v3d", uid: "pt_fi_a", level: 0,
        tags: ["salle"] }, P(6.7, 6))]);
      window.KtaGalerie.invalider();
    };
    poser();
    let ctxV = null;
    // Caméra de la vue (greffe vide, aussitôt retirée : ctx lit la vue ouverte).
    const camera = function () {
      const deg = K.greffer({ nom: "v3d-fiches-camera", scene: function (ctx) { ctxV = ctx; } });
      if (deg) deg();
    };
    const ecran = function (x, z, h) {
      const cv = document.querySelector("#kta-vue3d canvas"), rc = cv.getBoundingClientRect();
      const v = new ctxV.THREE.Vector3(ox + x, h, oz + z).project(ctxV.camera);
      return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height, z: v.z };
    };
    const tap = async function (pt, doigt) {
      const cv = document.querySelector("#kta-vue3d canvas");
      const o = { bubbles: true, cancelable: true, pointerId: doigt ? 61 : 1, pointerType: doigt ? "touch" : "mouse",
        isPrimary: true, clientX: pt.x, clientY: pt.y, button: 0 };
      cv.dispatchEvent(new PointerEvent("pointerdown", o));
      await pause(40);
      cv.dispatchEvent(new PointerEvent("pointerup", o));
      await pause(80);
      return K.etat().fiche;
    };
    const fermerFiche = function () {
      const b = document.querySelector('#kta-vue3d .kta-v3d-fiche [data-v3d="ficheFermer"]');
      if (b) b.click();
    };
    const ouvrir = async function (rendu, x, z, cap) {
      if (K.etat().ouvert !== false) await K.fermer();
      window.setPlanRenduVue3D(null, rendu);
      const d = P(x, z);
      await K.ouvrir({ depart: { x: d.x, y: d.y, cap: cap }, commandes: "joystick" });
      camera();
      await pause(250);
      await images(4);
    };
    const m = function (q) { return [+(q.x / sc - ox).toFixed(2), +(q.y / sc - oz).toFixed(2)]; };   // px → m
    const essai = async function (nom, cible, attendu, plonger) {
      if (plonger && K.etat().vue !== "plongee") { K.basculerVue(); await pause(250); await images(4); }
      if (!plonger && K.etat().vue === "plongee") { K.basculerVue(); await pause(250); await images(4); }
      const pt = ecran(cible[0], cible[1], cible[2]);
      const vise = K.viser(pt.x, pt.y);
      const f = await tap(pt, true);
      const ok = attendu === null ? !f : !!f && f.uid === attendu && !!f.voir;
      r.cas.push({ nom: nom, ok: ok, attendu: attendu, fiche: f ? { uid: f.uid || null, nom: f.nom || null,
        famille: f.famille || null } : null, vise: vise, ou: m(K.etat().pos),
        touche: vise && vise.x !== undefined ? m(vise).concat([+vise.h.toFixed(2)]) : null,
        ecran: { x: Math.round(pt.x), y: Math.round(pt.y) } });
      fermerFiche();
      await pause(60);
    };
    // Mixte et structures : pilier (face), mur (face), zone au sol, tracé au sol, vide ; puis en plongée.
    for (const rendu of ["mixte", "structures"]) {
      await ouvrir(rendu, 3, 6, 90);
      r.cap = K.etat().cap;
      await essai(rendu + " · pilier (face, yeux)", [7, 6, 1], "st_fi_pil");
      await ouvrir(rendu, 3, 12, 90);
      await essai(rendu + " · mur (face, yeux)", [7.8, 12, 1], "st_fi_mur");
      await ouvrir(rendu, -12, 6.5, 90);
      await essai(rendu + " · zone remblais (yeux)", [-6, 6.5, 0.3], "zn_fi_rem");
      await essai(rendu + " · sol vide (yeux)", [-9, 3, 0], null);
      await ouvrir(rendu, -26, 0, 90);
      await essai(rendu + " · zone eau sur le tracé (yeux)", [-19, 0, 0.04], "zn_fi_eau");
      await essai(rendu + " · tracé (yeux)", [-23, 0, 0.03], "rd_fi_p");
      await essai(rendu + " · plafond (yeux)", [-22, 0, 5], null);
      await ouvrir(rendu, 0, 6, 90);
      await essai(rendu + " · pilier (dessus, plongée)", [8, 6, K.etat().hauteur], "st_fi_pil", true);
      await essai(rendu + " · mur (plongée)", [8, 12, K.etat().hauteur * 0.98], "st_fi_mur", true);
      await essai(rendu + " · zone remblais (plongée)", [-6, 6.5, K.etat().hauteur * 0.6], "zn_fi_rem", true);
      await essai(rendu + " · tracé (plongée)", [-2, 0, 0.03], "rd_fi_p", true);
      await essai(rendu + " · sol vide (plongée)", [2, 9, 0], null, true);
    }
    // Galerie : ni pilier ni mur (jamais dessinés en galerie) ; tracé par sa paroi, son sol, zone dans le tube.
    await ouvrir("galerie", -26, 0, 90);
    const demi = 0.9;
    await essai("galerie · zone eau dans le tube (yeux)", [-19, 0, 0.04], "zn_fi_eau");
    await essai("galerie · tracé par le sol (yeux)", [-23, 0, 0], "rd_fi_p");
    r.galeriePilier = null;
    await essai("galerie · tracé par la paroi (yeux)", [-22, -demi * 0.98, 1.2], "rd_fi_p");
    await essai("galerie · zone eau (plongée)", [-19, 0, 0.04], "zn_fi_eau", true);
    await essai("galerie · tracé (plongée)", [-12, 0, 0], "rd_fi_p", true);
    // Priorité au panneau du POI collé au pilier : sa fiche, pas celle du pilier.
    await ouvrir("mixte", 3, 6, 90);
    const sp = K.etat().panneaux.filter(function (q) { return q.nom === "POI fiche v3d" && q.visible; })[0];
    r.poiVu = !!sp;
    if (sp) {
      const f = await tap(sp.ecran, true);
      r.poi = f ? { nom: f.nom || null, famille: f.famille || null } : null;
      fermerFiche();
    }
    // Fiche d'un objet de session : focus, saisie dans la note sans déplacer la vue, Échap, focus rendu.
    const pil = ecran(7, 6, 1);
    let f = await tap(pil, true);
    const posAvant = K.etat().pos;
    r.focus = { ouverte: !!f, focus: f && f.focus, note: f && f.note, supprimer: f && f.supprimer,
      registre: f && f.registre };
    const ta = document.querySelector("#kta-vue3d .kta-v3d-fiche .kta-note-popup-textarea");
    r.zIndex = getComputedStyle(document.getElementById("kta-vue3d")).zIndex;
    r.fichePosee = !!document.querySelector("#kta-vue3d .kta-v3d-fiche .leaflet-popup-content .kta-note-popup");
    if (ta) {
      ta.focus();
      r.taFocus = document.activeElement === ta;
    }
    return { r: r, pil: pil, posAvant: posAvant };
  });
  await capture(page, "fiche-objet-pilier");
  // Saisie réelle au clavier (W A S D font avancer la vue d'ordinaire).
  await page.keyboard.type("wasd note");
  await page.waitForTimeout(200);
  const R2 = await page.evaluate(async function (a) {
    const K = window.KtaVue3D, r = a.r;
    const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    const ta = document.querySelector("#kta-vue3d .kta-v3d-fiche .kta-note-popup-textarea");
    const pos = K.etat().pos;
    r.saisie = { valeur: ta ? ta.value : null, bouge: Math.hypot(pos.x - a.posAvant.x, pos.y - a.posAvant.y) };
    const sauver = document.querySelector("#kta-vue3d .kta-v3d-fiche .kta-note-popup-save");
    if (sauver) sauver.click();
    await pause(1100);
    const pil = window.getStructures().filter(function (q) { return q.uid === "st_fi_pil"; })[0];
    r.noteEcrite = pil ? pil.description || null : null;
    r.fermeeApresSauver = !K.etat().fiche;
    return r;
  }, { r: R.r, posAvant: R.posAvant });
  // Échap ferme la fiche et rend le focus à la vue.
  await page.evaluate(async function (a) {
    const cv = document.querySelector("#kta-vue3d canvas");
    const o = { bubbles: true, cancelable: true, pointerId: 62, pointerType: "touch", isPrimary: true,
      clientX: a.x, clientY: a.y };
    cv.dispatchEvent(new PointerEvent("pointerdown", o));
    cv.dispatchEvent(new PointerEvent("pointerup", o));
    await new Promise(function (ok) { setTimeout(ok, 100); });
  }, R.pil);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const R3 = await page.evaluate(async function (a) {
    const K = window.KtaVue3D, r = a.r, sc = window.APP_CONFIG.scale;
    const W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
    const ox = W / 2 / sc, oz = H / 2 / sc;
    const P = function (x, z) { return { x: (ox + x) * sc, y: (oz + z) * sc }; };
    const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    const rect = function (x0, x1, z0, z1) { return [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)]; };
    r.echap = { vueOuverte: K.etat().ouvert !== false, fiche: !!K.etat().fiche,
      focusVue: document.activeElement === document.getElementById("kta-vue3d") };
    let ctxV = null;
    const deg0 = K.greffer({ nom: "v3d-fiches-camera", scene: function (ctx) { ctxV = ctx; } });
    if (deg0) deg0();
    const ecran = function (x, z, h) {
      const cv = document.querySelector("#kta-vue3d canvas"), rc = cv.getBoundingClientRect();
      const v = new ctxV.THREE.Vector3(ox + x, h, oz + z).project(ctxV.camera);
      return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height };
    };
    const tap = async function (pt) {
      const cv = document.querySelector("#kta-vue3d canvas");
      const o = { bubbles: true, cancelable: true, pointerId: 63, pointerType: "touch", isPrimary: true,
        clientX: pt.x, clientY: pt.y };
      cv.dispatchEvent(new PointerEvent("pointerdown", o));
      await pause(30);
      cv.dispatchEvent(new PointerEvent("pointerup", o));
      await pause(80);
      return K.etat().fiche;
    };
    const apres = async function (n0) {
      for (let i = 0; i < 40; i++) {
        await pause(50);
        const d = K.etat().donnees;
        if (!d.attente && d.refaites > n0) break;
      }
      await pause(60);
    };
    // Greffe qui coupe les fiches (un jeu) : un toucher au doigt n'ouvre ni pilier ni POI ; retirée, tout revient.
    const sp = K.etat().panneaux.filter(function (q) { return q.nom === "POI fiche v3d" && q.visible; })[0];
    const deg = K.greffer({ nom: "v3d-fiches-coupees", scene: function (ctx) { ctx.regler({ fiches: false }); } });
    await pause(60);
    r.greffe = { pilier: !!(await tap(a.pil)), poi: sp ? !!(await tap(sp.ecran)) : null };
    if (deg) deg();
    await pause(60);
    r.greffe.apres = !!(await tap(a.pil));
    document.querySelector('#kta-vue3d .kta-v3d-fiche [data-v3d="ficheFermer"]').click();
    // Lecture seule d'une extension (prise ktaEditionRefusee) : la fiche s'affiche sans note modifiable ni 🗑️.
    window.ktaEditionRefusee = function () { return true; };
    const fRO = await tap(a.pil);
    r.extensionLecture = fRO ? { note: fRO.note, supprimer: fRO.supprimer, voir: fRO.voir } : null;
    delete window.ktaEditionRefusee;
    document.querySelector('#kta-vue3d .kta-v3d-fiche [data-v3d="ficheFermer"]').click();
    // 🗑️ depuis la fiche : le pilier quitte la scène sans rouvrir la vue (E1), la fiche se ferme.
    await tap(a.pil);
    const n0 = K.etat().donnees.refaites, nS = K.etat().compte.structures;
    const suppr = document.querySelector("#kta-vue3d .kta-v3d-fiche .kta-note-popup-supprimer");
    if (suppr) suppr.click();
    await apres(n0);
    const vise = K.viser(a.pil.x, a.pil.y);
    r.suppression = { bouton: !!suppr, fiche: !!K.etat().fiche, structures: [nS, K.etat().compte.structures],
      refaites: K.etat().donnees.refaites - n0, session: window.getStructures().some(function (q) {
        return q.uid === "st_fi_pil"; }), viseApres: vise ? vise.genre : null, vueOuverte: K.etat().ouvert !== false };
    // Annuler (Ctrl+Z de la carte) : le pilier revient dans la scène.
    window.HistoryManager.undo();
    await apres(K.etat().donnees.refaites);
    r.annule = window.getStructures().some(function (q) { return q.uid === "st_fi_pil"; }) &&
      K.etat().compte.structures === nS;
    // Calque de données (non modifiable) : pilier noté et pilier muet → fiche en lecture seule, sans 🗑️.
    await K.fermer();
    const vrais = window.__v3dFi;
    window.getAllEmbeddedRoads = vrais.r; window.getAllEmbeddedZones = vrais.z; window.getAllEmbeddedPoints = vrais.p;
    window.getAllEmbeddedStructures = vrais.s;
    const CAL = "v3d_fi_calque";
    const json = { data: [], structures: [
      { uid: "st_fi_cal1", type: "pilier-1", level: 0, points: rect(13, 15, 5, 7), description: "note du calque" },
      { uid: "st_fi_cal2", type: "pilier-1", level: 0, points: rect(13, 15, 11, 13) }] };
    const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
    window.PLAN_CONFIG.dataLayers = (window.PLAN_CONFIG.dataLayers || []).concat([
      { id: CAL, label: "Calque du checkup v3d", file: url, visible: true }]);
    const groupe = L.layerGroup().addTo(window.map);
    window.dataLayerGroups[CAL] = groupe;
    window.ajouterPointsDepuisJSON(url, groupe);
    const charge = function () {
      return window.getAllEmbeddedStructures().some(function (o) { return o && o.uid === "st_fi_cal1"; });
    };
    for (let i = 0; i < 60 && !charge(); i++) await pause(50);
    window.setPlanRenduVue3D(null, "mixte");
    const d = P(10, 6);
    await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "joystick" });
    const deg2 = K.greffer({ nom: "v3d-fiches-camera", scene: function (ctx) { ctxV = ctx; } });
    if (deg2) deg2();
    await pause(300);
    const f1 = await tap(ecran(13, 6, 1));
    r.calqueNote = f1 ? { uid: f1.uid, note: f1.note, supprimer: f1.supprimer, session: f1.session,
      registre: f1.registre,
      texte: /note du calque/.test(document.querySelector("#kta-vue3d .kta-v3d-fiche").textContent) } : null;
    const x1 = document.querySelector('#kta-vue3d .kta-v3d-fiche [data-v3d="ficheFermer"]');
    if (x1) x1.click();
    K.placer(P(10, 12).x, P(10, 12).y, 90);
    await pause(300);
    const f2 = await tap(ecran(13, 12, 1));
    r.calqueMuet = f2 ? { uid: f2.uid, note: f2.note, supprimer: f2.supprimer, registre: f2.registre } : null;
    // « Voir sur la carte » depuis la fiche du pilier muet : vue fermée, carte centrée, contour en surbrillance.
    const voir = document.querySelector('#kta-vue3d .kta-v3d-fiche [data-v3d="ficheVoir"]');
    if (voir) voir.click();
    await pause(300);
    const cible = P(14, 12), c = window.map.getCenter();
    const centre = { x: c.lng, y: window.APP_CONFIG.imageHeight - c.lat };
    r.voirMuet = { vue: K.etat().ouvert !== false, montre: K.derniereMontre(),
      ecartM: Math.hypot(centre.x - cible.x, centre.y - cible.y) / window.APP_CONFIG.scale };
    // Calque restitué au plan : bouchons remis.
    window.map.removeLayer(groupe);
    delete window.dataLayerGroups[CAL];
    window.PLAN_CONFIG.dataLayers = window.PLAN_CONFIG.dataLayers.filter(function (l) { return l.id !== CAL; });
    URL.revokeObjectURL(url);
    // « Voir sur la carte » d'une zone de session : vue fermée, carte centrée, fiche de la carte ouverte sur la zone.
    window.setPlanRenduVue3D(null, "structures");
    const d2 = P(-12, 6.5);
    await K.ouvrir({ depart: { x: d2.x, y: d2.y, cap: 90 }, commandes: "joystick" });
    const deg3 = K.greffer({ nom: "v3d-fiches-camera", scene: function (ctx) { ctxV = ctx; } });
    if (deg3) deg3();
    await pause(300);
    const fz = await tap(ecran(-6, 6.5, 0.3));
    r.zoneOuverte = fz ? fz.uid : null;
    const v2 = document.querySelector('#kta-vue3d .kta-v3d-fiche [data-v3d="ficheVoir"]');
    if (v2) v2.click();
    await pause(400);
    const cz = window.map.getCenter(), cibleZ = P(-6, 6.5);
    const popup = document.querySelector(".leaflet-popup .kta-note-popup");
    r.voirZone = { vue: K.etat().ouvert !== false, montre: K.derniereMontre(),
      ecartM: Math.hypot(cz.lng - cibleZ.x, window.APP_CONFIG.imageHeight - cz.lat - cibleZ.y) / sc,
      popup: !!popup, popupNote: !!(popup && popup.querySelector(".kta-note-popup-textarea")),
      popupSuppr: !!(popup && popup.querySelector(".kta-note-popup-supprimer")) };
    window.map.closePopup();
    window.setRoads([]); window.setZones([]); window.setStructures([]);
    window.setEditorPoints(window.__v3dPoints || []);
    window._currentLoadedPlanId = vrais.id;
    window.KtaGalerie.invalider();
    return r;
  }, { r: R2, pil: R.pil });

  const r = R3;
  r.cas.forEach(function (c) {
    verifier(c.ok, "toucher " + c.nom + " → " + (c.attendu ? "fiche de " + c.attendu : "rien"),
      { fiche: c.fiche, ou: c.ou, touche: c.touche, genre: c.vise && c.vise.genre, ecran: c.ecran });
  });
  verifier(r.poiVu && r.poi && r.poi.nom === "POI fiche v3d" && !r.poi.famille,
    "panneau de POI collé au pilier : sa fiche d'abord (priorité), pas celle du pilier", { vu: r.poiVu, poi: r.poi });
  verifier(r.focus.ouverte && r.focus.focus && r.focus.note && r.focus.supprimer && r.focus.registre && r.fichePosee &&
    String(r.zIndex) === "99999",
    "fiche du pilier de session : la même que la carte (note, 🗑️), au rang des modales, focus dans la fiche",
    { focus: r.focus, posee: r.fichePosee, z: r.zIndex });
  verifier(r.taFocus && r.saisie.valeur === "wasd note" && r.saisie.bouge < 1e-6 && r.noteEcrite === "wasd note" &&
    r.fermeeApresSauver,
    "note saisie au clavier dans la fiche (W A S D compris, la vue ne bouge pas), sauvée, fiche fermée",
    { saisie: r.saisie, note: r.noteEcrite, fermee: r.fermeeApresSauver });
  verifier(r.echap.vueOuverte && !r.echap.fiche && r.echap.focusVue,
    "Échap ferme la fiche (pas la vue), focus rendu à la vue", r.echap);
  verifier(r.greffe.pilier === false && r.greffe.poi === false && r.greffe.apres === true,
    "greffe ctx.regler({ fiches: false }) : un toucher au doigt n'ouvre ni pilier ni POI ; retirée, la fiche revient",
    r.greffe);
  verifier(r.extensionLecture && !r.extensionLecture.note && !r.extensionLecture.supprimer && r.extensionLecture.voir,
    "lecture seule d'une extension (ktaEditionRefusee) : fiche sans note modifiable ni 🗑️", r.extensionLecture);
  verifier(r.suppression.bouton && !r.suppression.fiche && !r.suppression.session && r.suppression.refaites === 1 &&
    r.suppression.structures[1] === r.suppression.structures[0] - 1 && r.suppression.viseApres !== "structures" &&
    r.suppression.vueOuverte,
    "🗑️ depuis la fiche : pilier retiré de la session et de la scène sans rouvrir (une reconstruction), fiche fermée",
    r.suppression);
  verifier(r.annule, "annuler : le pilier revient dans la scène", r.annule);
  verifier(r.calqueNote && r.calqueNote.uid === "st_fi_cal1" && !r.calqueNote.note && !r.calqueNote.supprimer &&
    !r.calqueNote.session && r.calqueNote.registre && r.calqueNote.texte,
    "calque de données : fiche de la carte en lecture seule (note lue, ni saisie ni 🗑️)", r.calqueNote);
  verifier(r.calqueMuet && r.calqueMuet.uid === "st_fi_cal2" && !r.calqueMuet.note && !r.calqueMuet.supprimer &&
    !r.calqueMuet.registre, "pilier de calque sans note (pas de fiche sur la carte) : titre en lecture seule",
    r.calqueMuet);
  verifier(!r.voirMuet.vue && r.voirMuet.montre && r.voirMuet.montre.uid === "st_fi_cal2" && r.voirMuet.montre.centre &&
    !r.voirMuet.montre.fiche && r.voirMuet.montre.surbrillance && r.voirMuet.ecartM < 1,
    "« Voir sur la carte » (pilier muet) : vue fermée, carte centrée sur lui, contour en surbrillance", r.voirMuet);
  verifier(r.zoneOuverte === "zn_fi_rem" && !r.voirZone.vue && r.voirZone.montre && r.voirZone.montre.fiche &&
    r.voirZone.popup && r.voirZone.popupNote && r.voirZone.popupSuppr && r.voirZone.ecartM < 1,
    "« Voir sur la carte » (zone de session) : vue fermée, carte centrée, la fiche de la carte ouverte sur la zone",
    { zone: r.zoneOuverte, voir: r.voirZone });
}

// ── 28. Dessiner en vue plongeante (✏️) : outils de la carte rejoués au doigt (formes fictives) ──────────────────
// Pilier, mur, mur en ligne, zone, tracé et mesure posés au toucher (pointeurs tactiles synthétiques) sur la 3D au
// niveau −1, carte au 0 : objet de la carte au niveau de la 3D, montré après sa fin, annulable, identique au même
// geste fait sur la carte ; aperçu sans reconstruction par sommet ; gestes de caméra sans sommet ; désarmé en
// sortant de la plongée, à la fermeture et par Échap ; greffe `fiches: false` et lecture seule : rien.
// Captures (KTA_V3D_CAPTURES) : pilier et mur dessinés au doigt en plongée, plan au sol allumé, en cours puis finis.
async function capturesDessin(page) {
  const etape = async function (nom, f, arg) { await page.evaluate(f, arg); await page.waitForTimeout(700); await capture(page, nom); };
  await etape("dessin-0-barre", async function () {
    const K = window.KtaVue3D, sc = window.APP_CONFIG.scale;
    const ox = window.PLAN_CONFIG.plan.imageWidth / 2 / sc, oz = window.PLAN_CONFIG.plan.imageHeight / 2 / sc;
    window.setStructures([]);
    // Toasts des contrôles d'avant (§ 28 : objet abandonné en sortant de la plongée, rendu passé en mixte) retirés :
    // ils restent affichés et feraient croire qu'ils viennent du dessin capturé.
    const pile = document.getElementById("kta-toasts");
    if (pile) pile.textContent = "";
    window.setPlanRenduVue3D(null, "mixte");
    await K.ouvrir({ depart: { x: ox * sc, y: oz * sc, cap: 0 }, commandes: "joystick" });
    K.basculerVue();
    await new Promise(function (ok) { setTimeout(ok, 400); });
    let ctx = null;
    const deg = K.greffer({ nom: "v3d-capture", scene: function (c) { ctx = c; } });
    if (deg) deg();
    window.__v3dTap = async function (x, z) {
      const cv = document.querySelector("#kta-vue3d canvas"), rc = cv.getBoundingClientRect();
      const v = new ctx.THREE.Vector3(ox + x, 0, oz + z).project(ctx.camera);
      const o = { bubbles: true, cancelable: true, pointerId: 95, pointerType: "touch", isPrimary: true,
        clientX: rc.left + (v.x + 1) / 2 * rc.width, clientY: rc.top + (1 - v.y) / 2 * rc.height };
      cv.dispatchEvent(new PointerEvent("pointerdown", o)); cv.dispatchEvent(new PointerEvent("pointerup", o));
      await new Promise(function (ok) { setTimeout(ok, 60); });
    };
    K.dessiner(true);
    document.querySelector('#kta-vue3d [data-v3d="planSol"]').click();
    document.querySelector('#kta-vue3d .kta-v3d-outils [data-groupe="structures"]').click();
  });
  await etape("dessin-1-pilier-en-cours", async function () {
    const lib = window.I18n.t("ui.struct.pilier1");
    Array.prototype.slice.call(document.querySelectorAll(".kta-group-flyout .kta-group-flyout-btn")).filter(function (b) {
      return b.textContent.indexOf(lib) >= 0; })[0].click();
    for (const c of [[1, -6], [4, -6], [4, -3]]) await window.__v3dTap(c[0], c[1]);
  });
  await etape("dessin-2-pilier-fini", async function () { await window.__v3dTap(1, -3); await window.__v3dTap(1, -6); });
  await etape("dessin-3-mur-en-cours", async function () {
    window.toggleStructureMode("pilier-1");
    window.toggleStructureMode("mur");
    for (const c of [[-6, -8], [6, -8], [6, -7]]) await window.__v3dTap(c[0], c[1]);
  });
  await etape("dessin-4-mur-fini", async function () {
    await window.__v3dTap(-6, -7);
    window.fermerStructureEnCours();
  });
  await page.evaluate(function () {
    window.toggleStructureMode("mur");
    delete window.__v3dTap;
    return window.KtaVue3D.fermer().then(function () { window.setStructures([]); });
  });
}

async function sectionDessin(page) {
  const R = await page.evaluate(async function () {
    const K = window.KtaVue3D, C = window.APP_CONFIG, sc = C.scale;
    const W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
    const ox = W / 2 / sc, oz = H / 2 / sc;
    const P = function (x, z) { return { x: (ox + x) * sc, y: (oz + z) * sc }; };
    const m = function (q) { return [+(q.x / sc - ox).toFixed(3), +(q.y / sc - oz).toFixed(3)]; };
    const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    const images = async function (n) {
      for (let i = 0; i < (n || 3); i++) await new Promise(function (ok) { requestAnimationFrame(ok); });
    };
    const r = {};
    if (window.getTrackingActif()) window.stopTracking();
    const av = { ml: C.multiLevel, dispo: C.availableLevels, vis: C.visibleLevels, actif: C.activeLevel,
      r: window.getAllEmbeddedRoads, z: window.getAllEmbeddedZones, p: window.getAllEmbeddedPoints,
      s: window.getAllEmbeddedStructures, id: window._currentLoadedPlanId };
    const vide = function () { return []; };
    window.getAllEmbeddedRoads = window.getAllEmbeddedZones = window.getAllEmbeddedPoints = vide;
    window.getAllEmbeddedStructures = vide;
    window._currentLoadedPlanId = "v3d-checkup-dessin";
    // Plan à deux niveaux (−1 et 0), carte au 0 : la 3D dessine au −1.
    C.multiLevel = true;
    C.availableLevels = [-1, 0];
    C.visibleLevels = [-1, 0];
    C.activeLevel = 0;
    window.setRoads([]); window.setZones([]); window.setStructures([]);
    if (window.resetMesure) window.resetMesure();
    window.KtaGalerie.invalider();
    if (window.HistoryManager && window.HistoryManager.reset) window.HistoryManager.reset();
    let ctxV = null;
    const camera = function () {
      const deg = K.greffer({ nom: "v3d-dessin-camera", scene: function (ctx) { ctxV = ctx; } });
      if (deg) deg();
    };
    const ecran = function (x, z, h) {
      const cv = document.querySelector("#kta-vue3d canvas"), rc = cv.getBoundingClientRect();
      const v = new ctxV.THREE.Vector3(ox + x, h || 0, oz + z).project(ctxV.camera);
      return { x: rc.left + (v.x + 1) / 2 * rc.width, y: rc.top + (1 - v.y) / 2 * rc.height };
    };
    let idDoigt = 70;
    const tap = async function (pt) {
      const cv = document.querySelector("#kta-vue3d canvas");
      const o = { bubbles: true, cancelable: true, pointerId: ++idDoigt, pointerType: "touch", isPrimary: true,
        clientX: pt.x, clientY: pt.y, button: 0 };
      cv.dispatchEvent(new PointerEvent("pointerdown", o));
      await pause(30);
      cv.dispatchEvent(new PointerEvent("pointerup", o));
      await pause(40);
    };
    const ouvrir = async function (rendu, x, z, niveau) {
      if (K.etat().ouvert !== false) await K.fermer();
      window.setPlanRenduVue3D(null, rendu);
      const d = P(x, z);
      await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 0, niveau: niveau === undefined ? -1 : niveau },
        commandes: "joystick" });
      K.basculerVue();
      await pause(250);
      await images(4);
      camera();
      await images(2);
    };
    const apres = async function (n0) {
      for (let i = 0; i < 60; i++) {
        await pause(40);
        const dd = K.etat().donnees;
        if (!dd.attente && dd.refaites > n0) break;
      }
      await images(2);
    };
    // Panneau d'un groupe ouvert depuis la barre de la vue, puis un de ses boutons touché (par son libellé 2D).
    const panneau = function (groupe) {
      const b = document.querySelector('#kta-vue3d .kta-v3d-outils [data-groupe="' + groupe + '"]');
      if (b) b.click();
      return document.querySelector(".kta-group-flyout");
    };
    const choisir = function (groupe, cle) {
      const fly = panneau(groupe);
      if (!fly) return false;
      const lib = window.I18n.t(cle);
      const btn = Array.prototype.slice.call(fly.querySelectorAll(".kta-group-flyout-btn")).filter(function (b) {
        return b.textContent.indexOf(lib) >= 0;
      })[0];
      if (!btn) { window.ktaFermerOutils(); return false; }
      btn.click();
      return true;
    };
    const struct = function (uid) {
      return window.getStructures().filter(function (s) { return s.uid === uid; })[0] || null;
    };
    const nouveau = function (liste, avant) {
      return liste.filter(function (o) { return avant.indexOf(o.uid) < 0; })[0] || null;
    };
    const uids = function (liste) { return liste.map(function (o) { return o.uid; }); };

    // ── Barre : ni à hauteur d'yeux, ✏️ en plongée, les 4 groupes de la carte dans son ordre ──
    await ouvrir("mixte", 0, 0);
    K.basculerVue();
    await images(2);
    r.yeux = { barre: K.etat().dessin.barre, refuse: K.dessiner(true) === false };
    K.basculerVue();
    await images(2);
    const ed0 = K.etat().dessin;
    r.plongee = { barre: ed0.barre, boutons: ed0.boutons.slice() };
    r.ouvre = K.dessiner(true);
    const barreEl = document.querySelector("#kta-vue3d .kta-v3d-outils");
    const a0 = barreEl && barreEl.querySelector('[data-groupe="structures"]');
    const src = window._groupes.structures.btnPrincipal;
    r.boutons = K.etat().dessin.boutons.slice();
    // Ordre de la barre de droite 2D (position dans le document des boutons de groupe).
    r.ordre2d = ["mesure", "traces", "zones", "structures"].slice().sort(function (a, b) {
      const x = window._groupes[a].btnPrincipal, y = window._groupes[b].btnPrincipal;
      return x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    r.style = a0 ? { w: getComputedStyle(a0).width, h: getComputedStyle(a0).height, wSrc: getComputedStyle(src).width,
      hSrc: getComputedStyle(src).height, icone: a0.innerHTML === src.innerHTML, titre: a0.title === src.title,
      cible: [getComputedStyle(a0, "::before").width, getComputedStyle(a0, "::before").height],
      jeton: getComputedStyle(document.documentElement).getPropertyValue("--kta-cible-toucher").trim() } : null;
    // Rien d'armé : un toucher n'ouvre pas d'outil, ne pose rien.
    await tap(ecran(3, 3));
    r.sansOutil = { structures: window.getStructures().length, poses: K.etat().dessin.poses };

    // ── Pilier au doigt : 4 sommets, fermé en retouchant le 1er (à 10 px près) ──
    const fly = panneau("structures");
    r.panneau = fly ? { z: getComputedStyle(fly).zIndex, dessus: (function () {
      const rc = fly.getBoundingClientRect();
      const el = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
      return !!el && fly.contains(el);
    })(), jonction: /🪜/.test(fly.textContent), effacer: /🧹/.test(fly.textContent),
      fermer: fly.textContent.indexOf(window.I18n.t("ui.struct.fermer")) >= 0 } : null;
    window.ktaFermerOutils();
    r.arme = choisir("structures", "ui.struct.pilier1") && window.modeStructure === "pilier-1";
    await images(2);
    r.boutonArme = !!a0 && a0.classList.contains("kta-group-mode-actif");
    const coins = [[2, -6], [4, -6], [4, -4], [2, -4]];
    const avantS = uids(window.getStructures());
    const n0 = K.etat().donnees.refaites;
    for (const c of coins) await tap(ecran(c[0], c[1]));
    await images(2);
    const enCours = window.getCurrentStructure();
    r.enCours = { points: enCours ? enCours.points.length : 0, niveau: enCours ? enCours.level : null,
      refaites: K.etat().donnees.refaites - n0, apercu: K.etat().dessin.apercu,
      msPoses: K.etat().dessin.msPoses.slice(), dansScene: K.viser(ecran(3, -5).x, ecran(3, -5).y) };
    // Dans le rond doré du 1er sommet (0,3 m), pas sur lui.
    await tap(ecran(coins[0][0] + 0.15, coins[0][1] - 0.1));
    const nouv = nouveau(window.getStructures(), avantS);
    await apres(n0);
    const vis = K.viser(ecran(3, -5, K.etat().hauteur).x, ecran(3, -5, K.etat().hauteur).y);
    r.pilier = { cree: !!nouv, ferme: !window.getCurrentStructure(), type: nouv && nouv.type, niveau: nouv && nouv.level,
      points: nouv ? nouv.points.map(m) : null, uid: nouv && nouv.uid, actifCarte: C.activeLevel,
      niveau3d: K.etat().niveau, refaites: K.etat().donnees.refaites - n0, msFin: K.etat().dessin.msFin,
      vise: vis ? { genre: vis.genre, uid: vis.uid } : null, encoreArme: window.modeStructure === "pilier-1",
      cles: nouv ? Object.keys(nouv).sort() : null };
    const pile = window.HistoryManager._peek().undo.map(function (x) { return x.label; });
    r.pilier.historique = pile.slice(-5);
    // Gestes de caméra, outil armé : glisser à un doigt, pincer, deux doigts glissés, molette, Maj + molette.
    const cv = document.querySelector("#kta-vue3d canvas"), rc = cv.getBoundingClientRect();
    const cx = rc.left + rc.width * 0.6, cy = rc.top + rc.height * 0.55;
    const ptr = function (type, id, x, y) {
      cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: "touch",
        isPrimary: id === 201, clientX: x, clientY: y }));
    };
    const posesG = K.etat().dessin.poses, nbG = window.getStructures().length;
    ptr("pointerdown", 201, cx, cy);
    for (let i = 1; i <= 6; i++) { ptr("pointermove", 201, cx + i * 8, cy + i * 3); await pause(16); }
    ptr("pointerup", 201, cx + 48, cy + 18);
    await pause(40);
    ptr("pointerdown", 201, cx - 30, cy); ptr("pointerdown", 202, cx + 30, cy);
    for (let i = 1; i <= 6; i++) { ptr("pointermove", 201, cx - 30 - i * 6, cy); ptr("pointermove", 202, cx + 30 + i * 6, cy); await pause(16); }
    ptr("pointerup", 201, cx - 66, cy); ptr("pointerup", 202, cx + 66, cy);
    await pause(40);
    ptr("pointerdown", 201, cx - 30, cy); ptr("pointerdown", 202, cx + 30, cy);
    for (let i = 1; i <= 6; i++) { ptr("pointermove", 201, cx - 30, cy - i * 6); ptr("pointermove", 202, cx + 30, cy - i * 6); await pause(16); }
    ptr("pointerup", 201, cx - 30, cy - 36); ptr("pointerup", 202, cx + 30, cy - 36);
    await pause(40);
    cv.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -200, clientX: cx, clientY: cy }));
    cv.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100, shiftKey: true,
      clientX: cx, clientY: cy }));
    await pause(60);
    r.gestes = { poses: K.etat().dessin.poses - posesG, structures: window.getStructures().length - nbG,
      enCours: !!window.getCurrentStructure() };
    // Annuler (HistoryManager) jusqu'à retirer le pilier : la scène suit.
    let tours = 0;
    while (struct(r.pilier.uid) && window.HistoryManager.canUndo() && tours < 8) {
      const nA = K.etat().donnees.refaites;
      window.HistoryManager.undo();
      tours++;
      await apres(nA);
    }
    camera();
    const vis2 = K.viser(ecran(3, -5, K.etat().hauteur).x, ecran(3, -5, K.etat().hauteur).y);
    r.annule = { parti: !struct(r.pilier.uid), tours: tours, vise: vis2 ? vis2.genre : null };

    // ── Mur (polygone) fermé par ✅ « Fermer la structure » du panneau ; mur en ligne : 2 sommets puis ✅ ──
    r.echelle = sc;
    r.armeMur = choisir("structures", "ui.struct.mur") && window.modeStructure === "mur";
    const avM = uids(window.getStructures()), nM = K.etat().donnees.refaites;
    // 1,2 m d'épaisseur : la tolérance de fermeture de la 2D (zones.js > CLOSE_TOLERANCE, 5 px plan) vaut 0,8 m sur
    // le relevé fictif ; un 4e coin plus près du 1er fermerait la forme, en 2D comme en 3D.
    for (const c of [[-4, -8], [4, -8], [4, -6.8], [-4, -6.8]]) await tap(ecran(c[0], c[1]));
    const fermeMur = choisir("structures", "ui.struct.fermer");
    await apres(nM);
    const mur = nouveau(window.getStructures(), avM);
    camera();
    const vM = K.viser(ecran(0, -7.4, K.etat().hauteur * 0.98).x, ecran(0, -7.4, K.etat().hauteur * 0.98).y);
    r.mur = { ferme: fermeMur, type: mur && mur.type, niveau: mur && mur.level, points: mur ? mur.points.map(m) : null,
      vise: vM ? { genre: vM.genre, uid: vM.uid } : null, uid: mur && mur.uid };
    r.armeLigne = choisir("structures", "ui.struct.murLigne") && window.modeStructure === "mur-ligne";
    const avL = uids(window.getStructures()), nL = K.etat().donnees.refaites;
    for (const c of [[-4, -2.5], [4, -2.5]]) await tap(ecran(c[0], c[1]));
    choisir("structures", "ui.struct.fermer");
    await apres(nL);
    const ligne = nouveau(window.getStructures(), avL);
    r.murLigne = { type: ligne && ligne.type, niveau: ligne && ligne.level, points: ligne ? ligne.points.map(m) : null };
    window._desactiverTousLesModes();

    // ── Zone de remblais : 3 sommets, fermée sur le 1er ──
    r.armeZone = choisir("zones", "ui.zone.remblais") && window.modeZone === "remblais";
    const avZ = uids(window.getZones()), nZ = K.etat().donnees.refaites;
    const tri = [[-6, 2], [-2, 2], [-4, 5]];
    for (const c of tri) await tap(ecran(c[0], c[1]));
    await tap(ecran(tri[0][0] - 0.12, tri[0][1] + 0.12));
    await apres(nZ);
    const zone = nouveau(window.getZones(), avZ);
    camera();
    const vZ = K.viser(ecran(-4, 3, K.etat().hauteur * 0.6).x, ecran(-4, 3, K.etat().hauteur * 0.6).y);
    r.zone = { type: zone && zone.type, niveau: zone && zone.level, points: zone ? zone.points.map(m) : null,
      ferme: !window.getCurrentZone(), vise: vZ ? { genre: vZ.genre, uid: vZ.uid } : null, uid: zone && zone.uid,
      arme: window.modeZone === "remblais" };
    window._desactiverTousLesModes();

    // ── Tracé principal : 3 sommets, ✅ « Valider le tracé » ──
    r.armeTrace = choisir("traces", "ui.trace.principal") && window.modeRoad === "principal";
    const avR = uids(window.getRoads()), nR = K.etat().donnees.refaites;
    for (const c of [[6, 4], [10, 4], [10, 8]]) await tap(ecran(c[0], c[1]));
    const refaitesPendant = K.etat().donnees.refaites - nR;
    choisir("traces", "ui.trace.valider");
    await apres(nR);
    const trace = nouveau(window.getRoads(), avR);
    camera();
    const vR = K.viser(ecran(8, 4, 0.03).x, ecran(8, 4, 0.03).y);
    r.trace = { type: trace && trace.type, niveau: trace && trace.level, points: trace ? trace.points.map(m) : null,
      fini: !window.getCurrentRoad() && !window.modeRoad, vise: vR ? { genre: vR.genre, uid: vR.uid } : null,
      uid: trace && trace.uid, refaitesPendant: refaitesPendant };
    // Aimantation des tracés (réglage de la carte) : un toucher à 0,22 m d'un sommet s'y accroche (rayon d'écran de
    // la 2D converti à la profondeur du point touché).
    const snapAv = { on: C.snapDraw, px: C.snapDrawPx };
    C.snapDraw = true; C.snapDrawPx = 14;
    choisir("traces", "ui.trace.chemin");
    const avA = uids(window.getRoads());
    await tap(ecran(6.18, 4.12)); await tap(ecran(6, 0));
    choisir("traces", "ui.trace.valider");
    const aim = nouveau(window.getRoads(), avA);
    r.aimant = { premier: aim ? m(aim.points[0]) : null, n: aim ? aim.points.length : 0 };
    C.snapDraw = snapAv.on; C.snapDrawPx = snapAv.px;
    window._desactiverTousLesModes();

    // ── Mesure 📐 : deux points à 10 m, distance de la carte et étiquette dans la 3D ──
    r.armeMesure = choisir("mesure", "ui.subaction.mesureDistance") && window.modeMesure === true;
    await tap(ecran(-6, 1)); await tap(ecran(4, 1));
    await images(2);
    const dist = window.calculDistance();
    r.mesure = { points: window.getMeasurePoints().length, distance: +dist.toFixed(3),
      etiquettes: K.etat().dessin.etiquettes.slice(), attendu: window.formatDistance(dist, 2),
      sansObjet: window.getStructures().length };
    // Retoucher 📐 dans son panneau : éteint.
    choisir("mesure", "ui.subaction.mesureDistance");
    r.mesure.eteinte = window.modeMesure !== true;
    if (window.resetMesure) window.resetMesure();

    // ── Désarmé en sortant de la plongée (objet de 2 sommets abandonné, comme en 2D) ──
    choisir("structures", "ui.struct.pilier1");
    await tap(ecran(-6, 6)); await tap(ecran(-4, 6));
    const nbAvantSortie = window.getStructures().length;
    K.basculerVue();
    await images(2);
    r.sortie = { arme: !!window.modeStructure, barre: K.etat().dessin.barre, enCours: !!window.getCurrentStructure(),
      abandonne: window.getStructures().length === nbAvantSortie - 1 };
    K.basculerVue();
    await images(2);
    // Échap éteint l'outil armé (la vue reste ouverte).
    K.dessiner(true);
    choisir("structures", "ui.struct.pilier1");
    const avantEchap = { arme: !!window.modeStructure, actif: K.etat().dessin.actif, recouverte: K.etat().recouverte,
      centre: (function () {
        const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        return el ? el.tagName + "." + el.className + " " + (el.closest(".kta-modal, [class*=overlay]") || el).textContent.slice(0, 200) : null;
      })() };
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await images(1);
    r.echap = { arme: !!window.modeStructure, vue: K.etat().ouvert !== false, avant: avantEchap };
    // Fermer la vue, objet de 3 sommets en cours : validé comme en 2D, outil éteint.
    choisir("structures", "ui.struct.pilier1");
    const avF = uids(window.getStructures());
    for (const c of [[-8, -2], [-7, -2], [-7.5, -1]]) await tap(ecran(c[0], c[1]));
    await K.fermer();
    const garde = nouveau(window.getStructures(), avF);
    r.fermeture = { arme: !!window.modeStructure, garde: !!garde && garde.points.length === 3,
      niveau: garde && garde.level, actif: C.activeLevel };
    window.ktaSetActiveLevel ? window.ktaSetActiveLevel(0) : (C.activeLevel = 0);

    // ── Greffe `fiches: false` : ni ✏️ ni sommet, même outil armé ──
    await ouvrir("mixte", 0, 0);
    const deg = K.greffer({ nom: "v3d-dessin-coupe", scene: function (ctx) { ctx.regler({ fiches: false }); } });
    await images(2);
    const refus = K.dessiner(true);
    window.toggleStructureMode("pilier-1");
    const nG = window.getStructures().length;
    await tap(ecran(1, 1)); await tap(ecran(2, 1)); await tap(ecran(2, 2));
    r.greffe = { barre: K.etat().dessin.barre, refus: refus === false, poses: window.getStructures().length - nG,
      enCours: !!window.getCurrentStructure() };
    window.toggleStructureMode("pilier-1");
    if (deg) deg();
    await images(2);
    r.greffe.apres = K.etat().dessin.barre;

    // ── Lecture seule (extension) : groupes grisés recopiés, aucun outil de dessin armé ; 📐 reste permis ──
    window.ktaEditionRefusee = function () { return true; };
    window.ktaMajOutilsLectureSeule();
    K.dessiner(true);
    await images(2);
    const bS = document.querySelector('#kta-vue3d .kta-v3d-outils [data-groupe="structures"]');
    bS.click();
    const flyRO = !!document.querySelector(".kta-group-flyout");
    window.toggleStructureMode("pilier-1");
    r.lecture = { grise: bS.classList.contains("kta-outil-lecture-seule"), panneau: flyRO,
      arme: !!window.modeStructure };
    document.querySelectorAll("#kta-confirm-oui, .kta-readme-modal-overlay .kta-btn-primary").forEach(function (b) {
      b.click();
    });
    delete window.ktaEditionRefusee;
    window.ktaMajOutilsLectureSeule();

    // ── Plan au sol 🗺️ : caché au −1 (le plan de base est le niveau 0), au 0 une texture du fond, libérée coupée ──
    const bSol = function () { return document.querySelector('#kta-vue3d [data-v3d="planSol"]'); };
    r.solMoins1 = !!bSol() && bSol().hidden;
    await ouvrir("mixte", 0, 0, 0);
    K.dessiner(true);
    await images(2);
    const solVisible = !bSol().hidden;
    const tex0 = K.etat().dessin.textures;
    bSol().click();
    for (let i = 0; i < 100 && !(K.etat().dessin.planSol && K.etat().dessin.planSol.px); i++) await images(1);
    await images(3);
    const ps = K.etat().dessin.planSol, tex1 = K.etat().dessin.textures;
    bSol().click();
    await images(2);
    r.planSol = { moins1Cache: r.solMoins1, visible: solVisible, plan: ps, textures: [tex0, tex1, K.etat().dessin.textures],
      presse: bSol().getAttribute("aria-pressed"), coupe: K.etat().dessin.planSol };

    // ── Rendu galerie : armer une structure passe en mixte (on voit ce qu'on dessine), toast ──
    await ouvrir("galerie", 0, 0);
    K.dessiner(true);
    choisir("structures", "ui.struct.pilier1");
    await images(3);
    r.galerie = { rendu: K.etat().rendu, bascule: K.etat().dessin.renduBascule, retenu: window.getPlanRenduVue3D() };
    window._desactiverTousLesModes();
    await K.fermer();

    // ── Parcours normal, Galerie puis Mixte : armer le pilier depuis ✏️, 3 sommets, fermer, fermer la vue → aucun
    // toast « abandonné » (les toasts sont relevés à leur appel, pas à l'écran où ceux d'avant restent affichés) ──
    r.parcours = [];
    const motAbandon = window.I18n.t("struct.toast.abandon", { type: "" }).split(":")[0].trim().split(" ").pop();
    for (const rendu of ["galerie", "mixte"]) {
      await ouvrir(rendu, 0, 0);
      const dits = [], orig = window.OOMGuard.showToast;
      window.OOMGuard.showToast = function (m, t) { dits.push(String(m)); return orig.apply(this, arguments); };
      try {
        K.dessiner(true);
        choisir("structures", "ui.struct.pilier1");
        await images(3);
        const avP = uids(window.getStructures()), nP = K.etat().donnees.refaites;
        for (const c of [[-3, -5], [-1, -5], [-2, -3]]) await tap(ecran(c[0], c[1]));
        await tap(ecran(-3, -5));
        await apres(nP);
        const cree = nouveau(window.getStructures(), avP);
        await K.fermer();
        r.parcours.push({ rendu: rendu, cree: !!cree && cree.points.length === 3, toasts: dits.slice(),
          abandon: dits.some(function (m) { return m.indexOf(motAbandon) >= 0; }) });
      } finally {
        window.OOMGuard.showToast = orig;
      }
      window.ktaSetActiveLevel ? window.ktaSetActiveLevel(0) : (C.activeLevel = 0);
    }

    // ── Même geste sur la carte (2D, niveau −1) : même objet que la 3D ──
    r.geste2d = null;
    window.__v3dDessinRef = r.pilier.points;
    // Restitué à la fin de la section (page.evaluate suivant).
    window.__v3dDessinAv = av;
    return r;
  });
  // Même pilier tracé à la souris sur la carte (2D), carte au −1 : mêmes champs, mêmes sommets à 1 px d'écran près.
  const coins2d = await page.evaluate(function () {
    const C = window.APP_CONFIG, sc = C.scale;
    const ox = window.PLAN_CONFIG.plan.imageWidth / 2 / sc, oz = window.PLAN_CONFIG.plan.imageHeight / 2 / sc;
    C.activeLevel = -1;
    const P = function (x, z) { return { x: (ox + x) * sc, y: (oz + z) * sc }; };
    window.map.setView(window.convertCoord(P(3, -5).x, P(3, -5).y), Math.max(window.map.getZoom(), 2), { animate: false });
    const b = window._groupes.structures.btnPrincipal;
    b.click();
    const lib = window.I18n.t("ui.struct.pilier1");
    const btn = Array.prototype.slice.call(document.querySelectorAll(".kta-group-flyout .kta-group-flyout-btn"))
      .filter(function (x) { return x.textContent.indexOf(lib) >= 0; })[0];
    if (btn) btn.click();
    const coins = [[2, -6], [4, -6], [4, -4], [2, -4], [2, -6]];
    const rc = document.getElementById("map").getBoundingClientRect();
    window.__v3dAvant2d = window.getStructures().map(function (s) { return s.uid; });
    return { pts: coins.map(function (c) {
      const p = P(c[0], c[1]), q = window.map.latLngToContainerPoint(window.convertCoord(p.x, p.y));
      return { x: rc.left + q.x, y: rc.top + q.y };
    }), pxPlan: (function () {
      const a = window.map.containerPointToLatLng([0, 0]), b2 = window.map.containerPointToLatLng([1, 0]);
      return Math.abs(b2.lng - a.lng);
    })(), arme: window.modeStructure };
  });
  for (const p of coins2d.pts) {
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(120);
  }
  const R2 = await page.evaluate(function (pxPlan) {
    const C = window.APP_CONFIG, sc = C.scale;
    const ox = window.PLAN_CONFIG.plan.imageWidth / 2 / sc, oz = window.PLAN_CONFIG.plan.imageHeight / 2 / sc;
    const s = window.getStructures().filter(function (x) { return window.__v3dAvant2d.indexOf(x.uid) < 0; })[0];
    const ref = window.__v3dDessinRef;
    const pts = s ? s.points.map(function (q) { return [q.x / sc - ox, q.y / sc - oz]; }) : [];
    const ecart = s && ref && pts.length === ref.length ? Math.max.apply(null, pts.map(function (q, i) {
      return Math.hypot(q[0] - ref[i][0], q[1] - ref[i][1]);
    })) : null;
    const r = { cree: !!s, type: s && s.type, niveau: s && s.level, n: pts.length, ecartM: ecart,
      toleranceM: 1.5 * pxPlan / sc, cles: s ? Object.keys(s).sort() : null,
      historique: window.HistoryManager._peek().undo.map(function (x) { return x.label; }).slice(-5) };
    window._desactiverTousLesModes();
    // Restitution : plan, niveaux, calques, données.
    const av = window.__v3dDessinAv;
    C.multiLevel = av.ml; C.availableLevels = av.dispo; C.visibleLevels = av.vis; C.activeLevel = av.actif;
    window.getAllEmbeddedRoads = av.r; window.getAllEmbeddedZones = av.z; window.getAllEmbeddedPoints = av.p;
    window.getAllEmbeddedStructures = av.s; window._currentLoadedPlanId = av.id;
    window.setRoads([]); window.setZones([]); window.setStructures([]);
    window.setEditorPoints(window.__v3dPoints || window.getEditorPoints());
    window.KtaGalerie.invalider();
    return r;
  }, coins2d.pxPlan);

  const r = R;
  const proche = function (pts, attendus, tol) {
    return !!pts && pts.length === attendus.length && pts.every(function (q, i) {
      return Math.hypot(q[0] - attendus[i][0], q[1] - attendus[i][1]) <= tol;
    });
  };
  verifier(!r.yeux.barre && r.yeux.refuse, "dessin : ni barre ni ✏️ à hauteur d'yeux", r.yeux);
  verifier(r.plongee.barre && r.ouvre === true && JSON.stringify(r.boutons) === JSON.stringify(r.ordre2d) &&
    JSON.stringify(r.boutons) === JSON.stringify(["mesure", "traces", "zones", "structures"]),
    "vue plongeante : ✏️ montre 📐 🛣️ ⬛ 🏛️ (ordre de la barre de droite 2D)", { plongee: r.plongee, boutons: r.boutons,
    ordre2d: r.ordre2d });
  verifier(r.style && r.style.w === r.style.wSrc && r.style.h === r.style.hSrc && r.style.icone && r.style.titre &&
    r.style.cible[0] === r.style.jeton && r.style.cible[1] === r.style.jeton,
    "boutons de la barre : taille, icône et titre de ceux de la carte, zone de toucher de --kta-cible-toucher", r.style);
  verifier(r.sansOutil.structures === 0 && r.sansOutil.poses === 0, "✏️ ouvert sans outil armé : un toucher ne pose rien",
    r.sansOutil);
  verifier(r.panneau && String(r.panneau.z) === "99999" && r.panneau.dessus && !r.panneau.jonction &&
    !r.panneau.effacer && r.panneau.fermer,
    "panneau 🏛️ de la carte au-dessus de la vue (sans 🪜 ni 🧹, ✅ Fermer gardé)", r.panneau);
  verifier(r.arme && r.boutonArme, "pilier armé depuis le panneau : bouton 🏛️ de la vue marqué comme celui de la carte",
    { arme: r.arme, bouton: r.boutonArme });
  verifier(r.enCours.points === 4 && r.enCours.niveau === -1 && r.enCours.refaites === 0 && r.enCours.apercu > 0 &&
    !(r.enCours.dansScene && r.enCours.dansScene.genre === "structures"),
    "pilier en cours (4 sommets au doigt) : niveau −1 de la 3D, aperçu au sol, aucune reconstruction", r.enCours);
  verifier(r.pilier.cree && r.pilier.ferme && r.pilier.type === "pilier-1" && r.pilier.niveau === -1 &&
    r.pilier.actifCarte === 0 && r.pilier.niveau3d === -1 && proche(r.pilier.points, [[2, -6], [4, -6], [4, -4], [2, -4]], 0.03) &&
    r.pilier.refaites === 1 && r.pilier.vise && r.pilier.vise.genre === "structures" && r.pilier.vise.uid === r.pilier.uid &&
    r.pilier.encoreArme,
    "pilier fermé au doigt sur son 1er sommet : niveau −1 (carte au 0), sommets justes, une reconstruction, visible, " +
    "outil gardé (comme la 2D)", r.pilier);
  verifier(r.gestes.poses === 0 && r.gestes.structures === 0 && !r.gestes.enCours,
    "outil armé : glisser, pincer, deux doigts, molette et Maj + molette ne posent aucun sommet", r.gestes);
  verifier(r.annule.parti && r.annule.vise !== "structures", "annuler (HistoryManager) : pilier retiré, scène suivie",
    r.annule);
  verifier(r.armeMur && r.mur.ferme && r.mur.type === "mur" && r.mur.niveau === -1 &&
    proche(r.mur.points, [[-4, -8], [4, -8], [4, -6.8], [-4, -6.8]], 0.03) && r.mur.vise && r.mur.vise.uid === r.mur.uid,
    "mur au doigt, fermé par ✅ du panneau : niveau −1, sommets justes, visible", { mur: r.mur, echelle: r.echelle });
  verifier(r.armeLigne && r.murLigne.type === "mur-ligne" && r.murLigne.niveau === -1 &&
    proche(r.murLigne.points, [[-4, -2.5], [4, -2.5]], 0.03), "mur en ligne : 2 sommets puis ✅", r.murLigne);
  verifier(r.armeZone && r.zone.type === "remblais" && r.zone.niveau === -1 && r.zone.ferme && r.zone.arme &&
    proche(r.zone.points, [[-6, 2], [-2, 2], [-4, 5]], 0.03) && r.zone.vise && r.zone.vise.uid === r.zone.uid,
    "zone de remblais au doigt, fermée sur son 1er sommet : niveau −1, visible", r.zone);
  verifier(r.armeTrace && r.trace.type === "principal" && r.trace.niveau === -1 && r.trace.fini &&
    r.trace.refaitesPendant === 0 && proche(r.trace.points, [[6, 4], [10, 4], [10, 8]], 0.03) &&
    r.trace.vise && r.trace.vise.uid === r.trace.uid,
    "tracé au doigt, validé par ✅ : niveau −1, aucune reconstruction pendant, visible", r.trace);
  verifier(r.aimant.n === 2 && proche([r.aimant.premier], [[6, 4]], 1e-6),
    "aimantation des tracés (snapDraw) : toucher à 0,22 m d'un sommet → accroché sur lui", r.aimant);
  verifier(r.armeMesure && r.mesure.points === 2 && Math.abs(r.mesure.distance - 10) < 0.03 &&
    r.mesure.etiquettes.some(function (t) { return t.indexOf(r.mesure.attendu) >= 0; }) && r.mesure.eteinte,
    "mesure 📐 au doigt : 10 m justes, étiquette de la carte dans la 3D, retoucher l'éteint", r.mesure);
  verifier(!r.sortie.arme && !r.sortie.barre && !r.sortie.enCours && r.sortie.abandonne,
    "sortir de la plongée : outil éteint, objet de 2 sommets abandonné (règle de la 2D)", r.sortie);
  verifier(!r.echap.arme && r.echap.vue, "Échap : outil éteint, vue ouverte", r.echap);
  verifier(!r.fermeture.arme && r.fermeture.garde && r.fermeture.niveau === -1,
    "fermer la vue : outil éteint, pilier de 3 sommets gardé (validé comme en 2D)", r.fermeture);
  verifier(!r.greffe.barre && r.greffe.refus && r.greffe.poses === 0 && !r.greffe.enCours && r.greffe.apres,
    "greffe fiches: false : ni barre ni sommet (outil armé compris) ; retirée, la barre revient", r.greffe);
  verifier(r.lecture.grise && !r.lecture.panneau && !r.lecture.arme,
    "lecture seule : 🏛️ grisé comme sur la carte, pas de panneau, aucun outil armé", r.lecture);
  verifier(r.planSol.moins1Cache && r.planSol.visible && r.planSol.plan && r.planSol.plan.ok && r.planSol.plan.px >= 1024 &&
    r.planSol.textures[1] === r.planSol.textures[0] + 1 && r.planSol.textures[2] === r.planSol.textures[0] &&
    r.planSol.presse === "false" && r.planSol.coupe && r.planSol.coupe.voulu === false,
    "plan au sol 🗺️ : caché au −1, au 0 une texture du fond (une de plus), libérée une fois coupé", r.planSol);
  verifier(r.parcours.length === 2 && r.parcours.every(function (x) { return x.cree && !x.abandon; }),
    "parcours normal (Galerie puis Mixte) : pilier armé depuis ✏️, 3 sommets, fermé, vue fermée → aucun toast « abandonné »",
    r.parcours);
  verifier(r.galerie.rendu === "mixte" && r.galerie.bascule === "mixte" && r.galerie.retenu === "mixte",
    "rendu galerie : armer une structure passe en mixte (retenu), on voit ce qu'on dessine", r.galerie);
  verifier(R2.cree && R2.type === "pilier-1" && R2.niveau === -1 && R2.n === 4 && R2.ecartM !== null &&
    R2.ecartM <= R2.toleranceM && JSON.stringify(R2.cles) === JSON.stringify(r.pilier.cles) &&
    JSON.stringify(R2.historique) === JSON.stringify(r.pilier.historique),
    "même pilier à la souris sur la carte : mêmes champs, mêmes sommets (à 1,5 px d'écran), même historique",
    { carte: R2, vue: { cles: r.pilier.cles, historique: r.pilier.historique } });
  console.log("  📏 sommet posé en 3D (geste de la carte compris), ms : " + JSON.stringify(r.enCours.msPoses.map(function (v) {
    return +v.toFixed(2); })) + " · fermeture → scène refaite : " + r.pilier.msFin + " ms");
}

(async function main() {
  const lancement = { args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"] };
  const nav = await lancerNavigateur(chromium, lancement);
  const contexte = await nav.newContext(TEL
    ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "block" }
    : { viewport: { width: 1200, height: 800 }, serviceWorkers: "block" });
  const page = await contexte.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [], consoleErr = [], requetes3d = [];
  let ouvert = false, perteSimulee = false;
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  page.on("console", function (m) {
    const t = m.text();
    // Pertes de contexte et WebGL coupé PROVOQUÉS par le checkup : leurs avis sont attendus.
    if (perteSimulee && /CONTEXT_LOST|loseContext|restoreContext|Error creating WebGL context|WebGL indisponible/i.test(t)) return;
    if (/Too many active WebGL contexts|CONTEXT_LOST|WebGL: INVALID/i.test(t)) consoleErr.push(t.slice(0, 160));
    if (m.type() === "error" && /vue3d|three|WebGL/i.test(t)) consoleErr.push(t.slice(0, 160));
  });
  page.on("request", function (r) { if (RX_3D.test(r.url()) && !ouvert) requetes3d.push(r.url().replace(BASE, "")); });
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
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && typeof window.ktaPasBloqueParStructure === "function";
    }, 40000);
    await page.waitForTimeout(1500);
    verifier(requetes3d.length === 0, "rien de la 3D chargé au démarrage ni avec le plan", requetes3d);
    verifier(await page.evaluate(function () { return !window.KtaVue3D && !document.getElementById("kta-vue3d-css"); }),
      "KtaVue3D absent tant qu'on ne l'a pas demandé");

    const gpu = await page.evaluate(function () {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return "sans WebGL2";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const perte = gl.getExtension("WEBGL_lose_context");
      if (perte) perte.loseContext();
      return r;
    });
    console.log("  ℹ️ rendu WebGL : " + gpu);

    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    });

    if (SEUL === "dessin") {
      ouvert = true;
      await page.addScriptTag({ url: BASE + "/js/vue3d.js" });
      await page.evaluate(function () { window.__v3dPoints = (window.getEditorPoints() || []).slice(); });
      await sectionDessin(page);
      if (CAPTURES) await capturesDessin(page);
    } else if (PERF) {
      ouvert = true;
      await page.addScriptTag({ url: BASE + "/js/vue3d.js" });
      if (TEL) {
        try {
          const cdp = await contexte.newCDPSession(page);
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
          console.log("  ℹ️ processeur ralenti x4");
        } catch (e) { console.log("  ℹ️ ralentissement processeur indisponible : " + e.message); }
      }
      if (PERF_DESSIN) {
        const semisD = await page.evaluate(semerPlanDense);
        await mesuresDessin(page, semisD.depart);
      }
      if (PERF_STRUCTURES) {
      await page.evaluate(function () { window.setPlanRenduVue3D(null, "structures"); });
      const semis = await page.evaluate(semerPlanDense);
      console.log("  ℹ️ plan dense synthétique : " + JSON.stringify(semis));
      await mesures(page, semis.depart);
      await mesuresDonnees(page, semis.depart, "structures");
      // Marche de 120 m en ligne droite (0,2 m par image) : durée de chaque image, constructions de tuiles comprises,
      // à la portée par défaut et à la borne haute du réglage.
      for (const portee of [30, 100]) {
        const marche = await page.evaluate(function (o) {
          const d = o.d;
          return window.KtaVue3D.ouvrir({ depart: d, distanceVue: o.portee }).then(function () {
            const sc = window.APP_CONFIG.scale, durees = [];
            return new Promise(function (r) {
              let i = 0, t = 0;
              function pas(ts) {
                if (t && i > 3) durees.push(ts - t);   // les premières images compilent les shaders
                t = ts;
                if (i++ >= 600) {
                  window.KtaVue3D.fermer();
                  durees.sort(function (a, b) { return a - b; });
                  r({ images: durees.length, msMed: +durees[durees.length >> 1].toFixed(1),
                    msP95: +durees[Math.floor(durees.length * 0.95)].toFixed(1), msMax: +durees[durees.length - 1].toFixed(1),
                    plus33ms: durees.filter(function (v) { return v > 33.4; }).length });
                  return;
                }
                window.KtaVue3D.placer(d.x + i * 0.2 * sc, d.y, 90);
                requestAnimationFrame(pas);
              }
              requestAnimationFrame(pas);
            });
          });
        }, { d: semis.depart, portee: portee });
        console.log("  📏 marche 120 m, " + portee + " m de vue (intervalle entre images) : " + JSON.stringify(marche));
      }
      // Coût d'un pas balayé (corps de 0,8 m : 3 couloirs + 12 rayons) dans le plan dense, buttées comprises.
      const coutPas = await page.evaluate(function (d) {
        // Image de collision du plan fictif mise de côté : seules les structures synthétiques sont jugées.
        const acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        // Départ DANS l'image du plan (le semis la déborde : un pas hors du plan est refusé), dans une galerie.
        const sc = window.APP_CONFIG.scale, m = 7 * sc, W = window.PLAN_CONFIG.plan.imageWidth;
        const H = window.PLAN_CONFIG.plan.imageHeight, x0 = Math.max(0, W / 2 - 57.5 * m), y0 = Math.max(0, H / 2 - 57.5 * m);
        const dep = { x: x0 + (Math.floor((W / 2 - x0) / m) + 0.5) * m, y: y0 + Math.floor((H / 2 - y0) / m) * m, cap: 90 };
        return window.KtaVue3D.ouvrir({ depart: dep, distanceVue: 30 }).then(function () {
          const libres = [], refuses = [];
          for (let i = 0; i < 600; i++) {
            const t0 = performance.now();
            const ok = window.KtaVue3D.avancer(0.08);
            (ok ? libres : refuses).push(performance.now() - t0);
            if (!ok) window.KtaVue3D.tourner(23);
          }
          window.KtaVue3D.fermer();
          window.ktaEstAccessible = acc;
          const st = function (t) {
            if (!t.length) return null;
            t.sort(function (a, b) { return a - b; });
            return { n: t.length, msMed: +t[t.length >> 1].toFixed(3), msP95: +t[Math.floor(t.length * 0.95)].toFixed(3),
              msMax: +t[t.length - 1].toFixed(3) };
          };
          return { libres: st(libres), refuses: st(refuses) };
        });
      }, semis.depart);
      console.log("  📏 pas balayé (avancer 8 cm, plan dense) : " + JSON.stringify(coutPas));
      await page.evaluate(function (d) {
        return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30, stats: true });
      }, semis.depart);
      await page.waitForTimeout(800);
      await capture(page, "dense-yeux");
      await page.evaluate(function () { window.KtaVue3D.basculerVue(); });
      await page.waitForTimeout(500);
      await capture(page, "dense-plongee");
      // Fréquence réelle (requestAnimationFrame) en marchant 3 s au clavier.
      await page.evaluate(function () { window.__v3dImg0 = window.KtaVue3D.etat().images; window.KtaVue3D.basculerVue(); });
      await page.keyboard.down("ArrowLeft");
      await page.waitForTimeout(3000);
      await page.keyboard.up("ArrowLeft");
      const n = await page.evaluate(function () { return window.KtaVue3D.etat().images - window.__v3dImg0; });
      console.log("  📏 rotation continue 3 s : " + Math.round(n / 3) + " images/s (affichage limité à l'écran)");
      await page.evaluate(function () { window.KtaVue3D.fermer(); });
      await page.evaluate(function (d) {
        return window.KtaVue3D.ouvrir({ depart: d, distanceVue: 30, densiteMax: 1 });
      }, semis.depart);
      await page.evaluate(function () { window.__v3dImg0 = window.KtaVue3D.etat().images; });
      await page.keyboard.down("ArrowLeft");
      await page.waitForTimeout(3000);
      await page.keyboard.up("ArrowLeft");
      const n1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        window.KtaVue3D.fermer();
        return e.images - window.__v3dImg0;
      });
      console.log("  📏 rotation continue 3 s, densité 1 : " + Math.round(n1 / 3) + " images/s");
      }
      if (PERF_PASSAGES) {
        await page.evaluate(function () { window.setPlanRenduVue3D(null, "structures"); });
        const semisP = await page.evaluate(semerPlanDense);
        await mesuresPassages(page, semisP.depart);
      }
      if (PERF_GALERIE) await mesuresGalerie(page, "galerie");
      if (PERF_MIXTE) {
        await page.evaluate(semerGalerie);
        await page.evaluate(semerPlanDense);
        const semisM = await page.evaluate(semerMixte);
        await mesuresGalerie(page, "mixte", semisM);
        await mesuresDonnees(page, semisM.depart, "mixte");
      }
    } else {
      // ── 1. Bouton cube grisé sans échelle : rien n'est chargé, le toucher explique ; plus de tuile au Tracker ──
      const grise = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale;
        window.APP_CONFIG.scale = 0;
        window.ktaMajBoutonVue3D();
        const a = document.querySelector(".kta-vue3d-ctrl a"), droite = document.querySelector(".leaflet-top.leaflet-right");
        const ctrls = droite ? Array.prototype.slice.call(droite.children) : [];
        const iFiltres = ctrls.findIndex(function (c) { return c.classList.contains("kta-filter-ctrl"); });
        const r = { existe: !!a, inactif: !!a && a.classList.contains("kta-inactif"), titre: a ? a.title : null,
          attendu: window.I18n.t("vue3d.sansEchelle"), sousFiltres: iFiltres >= 0 && ctrls[iFiltres + 1] &&
            ctrls[iFiltres + 1].classList.contains("kta-vue3d-ctrl"),
          picto: !!(a && a.querySelector("svg.kta-vue3d-ctrl-picto path")),
          couleur: a ? getComputedStyle(a).color : null, texte3: getComputedStyle(document.body).getPropertyValue("--kta-texte-3").trim(),
          opacite: a ? getComputedStyle(a).opacity : null, filtre: a ? getComputedStyle(a).filter : null };
        if (a) a.click();
        const ok = document.getElementById("kta-confirm-oui");
        r.alerte = ok ? ok.closest(".kta-readme-modal-boite").textContent : null;
        if (ok) ok.click();
        window.APP_CONFIG.scale = sc;
        window.ktaMajBoutonVue3D();
        r.actifApres = !a.classList.contains("kta-inactif");
        window.ouvrirMenuTracker();
        r.tuile = Array.prototype.slice.call(document.querySelectorAll(".kta-tracker-modal-tile")).some(function (t) {
          return t.textContent.indexOf("🧊") >= 0 || /3D/.test(t.textContent);
        });
        r.tuiles = document.querySelectorAll(".kta-tracker-modal-tile").length;
        const croix = document.querySelector(".kta-tracker-modal-close");
        if (croix) croix.click();
        return r;
      });
      verifier(grise.existe && grise.sousFiltres && grise.picto, "bouton cube (picto de l'écran Bienvenue) juste sous ≡ Filtres", grise);
      verifier(grise.inactif && grise.titre === grise.attendu && grise.opacite === "1" && /grayscale/.test(grise.filtre),
        "sans échelle : bouton grisé (texte-3, désaturé, sans opacité), son titre dit pourquoi", grise);
      verifier(!!grise.alerte && grise.alerte.indexOf(grise.attendu) >= 0 && grise.actifApres,
        "toucher le bouton grisé : message, pas de 3D ; échelle revenue : bouton actif", grise);
      verifier(!grise.tuile && grise.tuiles > 0, "menu Tracker : plus de tuile Vue 3D (" + grise.tuiles + " tuiles)", grise);
      await page.waitForTimeout(300);
      verifier(requetes3d.length === 0 && await page.evaluate(function () { return !window.KtaVue3D; }),
        "bouton grisé : rien de la 3D chargé", requetes3d);

      // Pilier de session à 3 m au nord du départ, et un mur qui le traverse d'est en ouest (objets fictifs).
      const prep = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale;
        if (window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
        // Départ : le point le plus proche du centre dont la bande nord-sud de -4 m à +2 m est accessible selon
        // l'image de collision du plan (le pilier est posé dedans).
        const c = window.map.getCenter();
        const W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
        const cx = Math.round(c.lng), cy = Math.round(H - c.lat);
        const acc = window.ktaEstAccessible;
        const libre = function (px, py) {
          for (let k = -40; k <= 20; k++) { if (!acc(px, py + k * sc / 10)) return false; }
          return px > 5 * sc && px < W - 5 * sc && py > 6 * sc && py < H - 4 * sc;
        };
        let x = cx, y = cy;
        chercher: for (let r = 0; r < 400; r++) {
          for (let a = 0; a < 16; a++) {
            const px = Math.round(cx + Math.cos(a * Math.PI / 8) * r * sc);
            const py = Math.round(cy + Math.sin(a * Math.PI / 8) * r * sc);
            if (libre(px, py)) { x = px; y = py; break chercher; }
          }
        }
        const d = 3 * sc, l = 1.5 * sc, m = 0.25 * sc, ym = y - d - l;
        window.setStructures([
          { uid: "st_v3d_pilier", type: "pilier-1", level: 0,
            points: [{ x: x - l, y: y - d - 2 * l }, { x: x + l, y: y - d - 2 * l }, { x: x + l, y: y - d }, { x: x - l, y: y - d }] },
          { uid: "st_v3d_mur", type: "mur", level: 0,
            points: [{ x: x - 4 * sc, y: ym - m }, { x: x + 4 * sc, y: ym - m }, { x: x + 4 * sc, y: ym + m }, { x: x - 4 * sc, y: ym + m }] }
        ]);
        // Un POI fictif au centre du pilier : son panneau doit rester visible depuis la galerie.
        window.__v3dPoints = (window.getEditorPoints() || []).slice();
        window.setEditorPoints(window.__v3dPoints.concat([{ id: "POI v3d", x: x, y: ym, level: 0, tags: ["danger"] }]));
        // Tracker en suivi, posé au départ : la tuile ouvre la vue là.
        window.recalerTrackerSurPoint(x, y, 0);
        if (!window.getTrackingActif()) window.startTracking();
        return { x: x, y: y, sc: sc, multi: window.APP_CONFIG.multiLevel === true };
      });

      // ── 2. Ouverture par le bouton cube : indicateur de chargement, focus dans la vue ─────────────────────
      await page.evaluate(function () {
        window.__v3dLoader = [];
        window.__v3dObs = new MutationObserver(function () {
          const ov = document.getElementById("kta-compute-overlay");
          if (ov && ov.style.display !== "none") {
            const m = ov.querySelector(".kta-compute-msg");
            const t = m ? m.textContent : "";
            if (window.__v3dLoader.indexOf(t) < 0) window.__v3dLoader.push(t);
          }
        });
        window.__v3dObs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      });
      ouvert = true;
      await page.locator(".kta-vue3d-ctrl a").click();
      await attendre(page, function () {
        return !!window.KtaVue3D && window.KtaVue3D.etat().ouvert === true;
      }, 20000);
      await page.waitForTimeout(200);
      const charge = await page.evaluate(function () {
        window.__v3dObs.disconnect();
        const ov = document.getElementById("kta-vue3d");
        return { messages: window.__v3dLoader, attendu: window.I18n.t("vue3d.chargementPremier"),
          reste: !!document.getElementById("kta-compute-overlay"), modal: ov.getAttribute("aria-modal"),
          role: ov.getAttribute("role"), focus: ov.contains(document.activeElement) };
      });
      verifier(charge.messages.indexOf(charge.attendu) >= 0 && !charge.reste,
        "toucher → indicateur « premier chargement » jusqu'à la scène, puis retiré", charge);
      verifier(charge.role === "dialog" && charge.modal === "true" && charge.focus,
        "vue ouverte : dialog aria-modal, focus clavier dedans", charge);
      // Passages sans geste (bascule immédiate) jusqu'à la partie 14, qui joue le fondu et la descente.
      await page.evaluate(function () { window.KtaVue3D.gesteAnime(false); });
      await page.keyboard.press("Tab");
      const tab = await page.evaluate(function () {
        return { dans: document.getElementById("kta-vue3d").contains(document.activeElement),
          v3d: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.v3d : null };
      });
      verifier(tab.dans, "Tab : le focus reste dans la vue", tab);
      const depuisTuile = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      verifier(depuisTuile.mode === "suivi" && Math.abs(depuisTuile.pos.x - prep.x) < 1 &&
        Math.abs(depuisTuile.pos.y - prep.y) < 1, "ouverte par le bouton, à la position du tracker, en suivi",
        { mode: depuisTuile.mode, pos: depuisTuile.pos });
      // ── Mode « suivi » / « libre » : cap simulé à la source du mode plan orienté (getPlanRelHeading) ────────
      const capVrai = await page.evaluate(function () {
        window.__v3dCapVrai = window.getPlanRelHeading;
        window.getPlanRelHeading = function () { return 120; };
        return true;
      });
      await page.waitForTimeout(700);
      const s1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), b = document.querySelector('#kta-vue3d [data-v3d="suivre"]');
        return { mode: e.mode, cap: e.cap, dispo: e.suiviDispo, presse: b.getAttribute("aria-pressed"), titre: b.title,
          attendu: window.I18n.t("vue3d.passerLibre") };
      });
      verifier(capVrai && s1.mode === "suivi" && Math.abs(s1.cap - 120) < 2 && s1.dispo && s1.presse === "true" &&
        s1.titre === s1.attendu, "suivi : la vue prend le cap de l'appareil (120° simulés)", s1);
      await reglages(page);
      await page.locator('#kta-vue3d [data-v3d="suivre"]').click();
      await page.evaluate(function () { window.getPlanRelHeading = function () { return 200; }; });
      await page.waitForTimeout(500);
      const s2 = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { mode: e.mode, cap: e.cap }; });
      verifier(s2.mode === "libre" && Math.abs(s2.cap - 120) < 2, "🧭 → libre : le cap de l'appareil n'agit plus", s2);
      const etiq = await page.evaluate(function () {
        return { texte: document.querySelector('#kta-vue3d [data-v3d="suivre"]').textContent,
          libre: window.I18n.t("vue3d.etatLibre"), suivi: window.I18n.t("vue3d.etatSuivi") };
      });
      verifier(etiq.texte.indexOf(etiq.libre) >= 0 && etiq.texte.indexOf(etiq.suivi) < 0,
        "le bouton de mode dit « Libre » en mode libre", etiq);
      await reglages(page);
      await page.locator('#kta-vue3d [data-v3d="suivre"]').click();
      await page.waitForTimeout(800);
      const s3 = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { mode: e.mode, cap: e.cap }; });
      verifier(s3.mode === "suivi" && Math.abs(s3.cap - 200) < 2, "🧭 → suivi : la vue tourne avec l'appareil (200°)", s3);
      verifier(await page.evaluate(function () {
        return document.querySelector('#kta-vue3d [data-v3d="suivre"]').textContent.indexOf(window.I18n.t("vue3d.etatSuivi")) >= 0;
      }), "le bouton de mode dit « Suivi » en suivi");
      // Toucher et glisser l'écran en suivi : le suivi reste (le cap est celui de l'appareil).
      const cv = await page.locator("#kta-vue3d canvas").boundingBox();
      await page.mouse.move(cv.x + cv.width / 2, cv.y + cv.height / 2);
      await page.mouse.down();
      await page.mouse.move(cv.x + cv.width / 2 + 40, cv.y + cv.height / 2 + 10, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const sTouche = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { mode: e.mode, cap: e.cap }; });
      verifier(sTouche.mode === "suivi" && Math.abs(sTouche.cap - 200) < 2, "suivi : toucher et glisser l'écran ne quitte pas le suivi", sTouche);
      await page.evaluate(function () { window.stopTracking(); });
      await page.waitForTimeout(300);
      await reglages(page);
      await page.locator('#kta-vue3d [data-v3d="suivre"]').click();
      await page.waitForTimeout(200);
      const s4 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), b = document.querySelector('#kta-vue3d [data-v3d="suivre"]');
        const pile = document.getElementById("kta-toasts");
        return { mode: e.mode, dispo: e.suiviDispo, grise: b.classList.contains("kta-v3d-inactif"), titre: b.title,
          toast: pile ? pile.textContent : "", attendu: window.I18n.t("vue3d.suiviIndispo") };
      });
      verifier(s4.mode === "libre" && !s4.dispo && s4.grise && s4.titre === s4.attendu && s4.toast.indexOf(s4.attendu) >= 0,
        "tracker arrêté : retour en libre, 🧭 grisé, son toucher explique", s4);
      await page.evaluate(function () {
        window.getPlanRelHeading = window.__v3dCapVrai;
        window.startTracking();
      });
      await page.waitForTimeout(200);
      verifier(await page.evaluate(function () { return window.KtaVue3D.etat().suiviDispo; }) === true,
        "tracker relancé : 🧭 de nouveau disponible");

      await page.evaluate(function (p) { window.KtaVue3D.placer(p.x, p.y, 0); }, prep);
      await page.waitForTimeout(600);
      const e0 = await page.evaluate(function () {
        const m = window.KtaVue3D.mesurer({ images: 4 });
        return { etat: window.KtaVue3D.etat(), tri: m.trianglesMax, canvas: !!document.querySelector("#kta-vue3d canvas"),
          css: !!document.getElementById("kta-vue3d-css"),
          titres: Array.prototype.map.call(document.querySelectorAll("#kta-vue3d [data-v3d]"), function (b) { return b.title; }),
          // ⚙️ : « Réglages de la vue », suivi d'une mention quand un réglage n'est pas celui par défaut.
          attendus: ["vue3d.fermer", window.FilterPanel.nbActifs() > 0 ? "filter.badge.actifs" : "filter.badge.aucun",
            "ui.refonte.counter_sortie_title", "vue3d.reglages",
            "vue3d.tournerGauche", "vue3d.avancer", "vue3d.tournerDroite", "vue3d.pasGauche", "vue3d.reculer",
            "vue3d.pasDroite", "vue3d.zoomPlus", "vue3d.inclinaisonPlus", "vue3d.zoomMoins", "vue3d.inclinaisonMoins",
            "vue3d.dessin.titre", "ui.group.mesure", "ui.group.traces", "ui.group.zones", "ui.group.structures",
            "vue3d.dessin.planSol", "vue3d.suivre", "vue3d.plongee", "vue3d.hauteur", "vue3d.hauteurMoins", "vue3d.hauteurPlus",
            "vue3d.passerStructures", "vue3d.texturesMontrer", "vue3d.boussoleMontrer", "vue3d.guidageMontrer",
            "vue3d.lampeJourAide"].map(function (k) {
            const t = window.I18n.t(k, { n: window.FilterPanel.nbActifs() });
            return k === "vue3d.reglages" && window.KtaVue3D.etat().reglages.repere ?
              t + " · " + window.I18n.t("vue3d.reglagesModifies") : t;
          }) };
      });
      verifier(e0.canvas && e0.css, "fenêtre, scène et feuille montées");
      verifier(JSON.stringify(e0.titres) === JSON.stringify(e0.attendus), "boutons titrés par le dictionnaire", e0.titres);
      verifier(e0.etat.compte.structures >= 2 && e0.tri > 100, "scène non vide (" + e0.etat.compte.structures +
        " structure(s), " + e0.tri + " triangles, hauteur " + e0.etat.hauteur + " m)", e0.etat);
      verifier(e0.etat.yMax.murs > 0 && e0.etat.yMax.murs < e0.etat.yMax.opaque && e0.etat.murDecale,
        "mur qui traverse le pilier : plus bas (" + e0.etat.yMax.murs.toFixed(2) + " m < " +
        e0.etat.yMax.opaque.toFixed(2) + " m) et reculé en profondeur", e0.etat.yMax);
      const pan = e0.etat.panneaux.filter(function (q) { return q.dansVolume; });
      const zFace = prep.y / prep.sc - 3;
      verifier(pan.length === 1 && pan[0].visible && pan[0].depthTest === false && pan[0].ordre >= 10 &&
        pan[0].z > zFace && pan[0].z < zFace + 0.2 && Math.abs(pan[0].x - prep.x / prep.sc) < 0.05,
        "POI au centre du pilier : panneau visible, sans test de profondeur, collé à la face vue de la galerie", pan);
      await capture(page, "fictif-yeux");

      // ── Intégration : 🚨, toasts, ❓, ✕ au téléphone, Échap, panneau de POI sombre et borné, rendu en pause ──────
      const urg = await page.evaluate(function () {
        const S = window.SortieUrgence, d = S.declencher, c = S.demandeLaCarte;
        window.__v3dSortie = 0;
        S.declencher = function () { window.__v3dSortie++; };
        S.demandeLaCarte = function () { return false; };
        document.querySelector('#kta-vue3d [data-v3d="urgence"]').click();
        const r = { appels: window.__v3dSortie, ouvert: window.KtaVue3D.etat().ouvert };
        S.declencher = d; S.demandeLaCarte = c;
        return r;
      });
      verifier(urg.appels === 1 && urg.ouvert, "🚨 de la vue : Sortie d'urgence déclenchée (même action que l'en-tête)", urg);
      const toast = await page.evaluate(function () {
        window.OOMGuard.showToast("Toast de test (vue 3D)", "warn");
        const t = Array.prototype.slice.call(document.querySelectorAll(".kta-toast")).pop();
        const bas = Math.max.apply(null, Array.prototype.map.call(
          document.querySelectorAll("#kta-vue3d .kta-v3d-haut > button"), function (b) { return b.getBoundingClientRect().bottom; }));
        return { haut: t ? t.getBoundingClientRect().top : -1, rangee: bas };
      });
      verifier(toast.haut >= toast.rangee, "toast sous la rangée du haut (" + Math.round(toast.haut) + " px ≥ " +
        Math.round(toast.rangee) + " px)", toast);
      await capture(page, "integration-toast");
      await page.evaluate(function () {
        document.querySelectorAll(".kta-toast").forEach(function (t) { t.remove(); });
      });
      // ❓ : l'aide de la vue 3D, par-dessus ; Échap ferme l'aide, la vue reste.
      await page.locator("#kta-vue3d .kta-v3d-haut .kta-aide-ctx-btn").click();
      await page.waitForTimeout(300);
      const aide = await page.evaluate(function () {
        const sm = document.getElementById("kta-aide-submodal");
        return { ouverte: !!sm, texte: sm ? sm.textContent.slice(0, 300) : "", recouverte: window.KtaVue3D.etat().recouverte,
          attendu: window.I18n.t("aide.sec.vue-3d.titre") };
      });
      verifier(aide.ouverte && aide.recouverte && aide.texte.indexOf(aide.attendu) >= 0,
        "❓ ouvre l'aide « Vue 3D » au-dessus de la vue", aide);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const aideFermee = await page.evaluate(function () {
        return { aide: !!document.getElementById("kta-aide-submodal"), vue: window.KtaVue3D.etat().ouvert };
      });
      verifier(!aideFermee.aide && aideFermee.vue, "Échap avec l'aide ouverte : l'aide se ferme, la vue reste", aideFermee);
      // Échap : d'abord le réglage de hauteur ouvert, puis (plus loin, § 4) la vue.
      await reglages(page);
      await page.locator('#kta-vue3d [data-v3d="hauteur"]').click();
      await page.keyboard.press("Escape");
      const echap = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { ouvert: e.ouvert, reglage: e.reglageHauteur.visible };
      });
      verifier(echap.ouvert && !echap.reglage, "Échap ferme d'abord le réglage ouvert, la vue reste", echap);
      // ≡ juste à gauche de ✕, côte à côte en haut à droite (rangée en row-reverse, `order`), au PC puis au téléphone.
      const filtresAColle = function () {
        const x = document.querySelector('#kta-vue3d [data-v3d="fermer"]').getBoundingClientRect();
        const f = document.querySelector('#kta-vue3d [data-v3d="filtres"]').getBoundingClientRect();
        const autres = Array.prototype.slice.call(document.querySelectorAll("#kta-vue3d .kta-v3d-haut > *"))
          .filter(function (b) { return b.offsetParent !== null && !b.hidden && b.getAttribute("data-v3d") !== "fermer" &&
            b.getAttribute("data-v3d") !== "filtres"; })
          .map(function (b) { return b.getBoundingClientRect(); });
        // Rien entre ≡ et ✕ sur la même ligne.
        const entre = autres.filter(function (r) {
          return Math.abs(r.top - x.top) < 2 && r.left >= f.right - 1 && r.right <= x.left + 1;
        }).length;
        return { memeLigne: Math.abs(f.top - x.top) < 1, ecart: Math.round(x.left - f.right), entre: entre,
          largeur: window.innerWidth };
      };
      const filtresPc = await page.evaluate(filtresAColle);
      await homogene(page, "PC (1200 × 800)");
      verifier(filtresPc.memeLigne && filtresPc.ecart >= 0 && filtresPc.ecart <= 12 && filtresPc.entre === 0,
        "PC : ≡ immédiatement à gauche de ✕", filtresPc);
      // Téléphone : ✕ au coin haut droit, sur la première ligne de boutons.
      await page.setViewportSize({ width: 393, height: 852 });
      await page.waitForTimeout(400);
      const filtresTel = await page.evaluate(filtresAColle);
      await homogene(page, "téléphone (393 × 852)");
      verifier(filtresTel.memeLigne && filtresTel.ecart >= 0 && filtresTel.ecart <= 12 && filtresTel.entre === 0 &&
        filtresTel.largeur === 393, "téléphone (393 px) : ≡ immédiatement à gauche de ✕", filtresTel);
      const tel = await page.evaluate(function () {
        const bs = Array.prototype.slice.call(document.querySelectorAll("#kta-vue3d .kta-v3d-haut > button"));
        const rs = bs.map(function (b) { return b.getBoundingClientRect(); });
        const x = document.querySelector('#kta-vue3d [data-v3d="fermer"]').getBoundingClientRect();
        const lignes = {};
        rs.forEach(function (r) { lignes[Math.round(r.top)] = true; });
        return { xTop: x.top, xRight: x.right, top: Math.min.apply(null, rs.map(function (r) { return r.top; })),
          right: Math.max.apply(null, rs.map(function (r) { return r.right; })), lignes: Object.keys(lignes).length,
          largeur: window.innerWidth };
      });
      verifier(Math.abs(tel.xTop - tel.top) < 1 && Math.abs(tel.xRight - tel.right) < 1 && tel.largeur === 393 &&
        tel.lignes === 1, "téléphone (393 px) : ✕ en haut à droite, rangée du haut sur une seule ligne (" + tel.lignes +
        ")", tel);
      await capture(page, "integration-telephone");
      // Téléphone en paysage : la tuile ⚙️ tient dans l'écran, son dernier réglage s'atteint en la faisant défiler.
      await page.setViewportSize({ width: 852, height: 393 });
      await page.waitForTimeout(300);
      await homogene(page, "paysage (852 × 393)");
      const pay = await page.evaluate(async function () {
        const t = document.getElementById("kta-v3d-reglages");
        const ouverte = !t.hidden;
        if (!ouverte) document.querySelector('#kta-vue3d [data-v3d="reglages"]').click();
        await new Promise(function (r) { setTimeout(r, 100); });
        const dernier = t.lastElementChild;
        dernier.scrollIntoView({ block: "nearest" });
        await new Promise(function (r) { setTimeout(r, 100); });
        const rt = t.getBoundingClientRect(), rd = dernier.getBoundingClientRect();
        const r = { bas: Math.round(rt.bottom), haut: window.innerHeight, defile: t.scrollHeight > t.clientHeight,
          dernierVisible: rd.top >= rt.top - 1 && rd.bottom <= rt.bottom + 1 };
        if (!ouverte) document.querySelector('#kta-vue3d [data-v3d="reglages"]').click();
        return r;
      });
      verifier(pay.bas <= pay.haut && pay.dernierVisible,
        "téléphone en paysage (852 × 393) : tuile ⚙️ dans l'écran, dernier réglage atteint en la faisant défiler", pay);
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(300);
      // Interrupteurs de la tuile au clavier : Entrée puis Espace basculent (une seule fois chacun), focus visible au
      // jeton --kta-interaction ; un toucher (pointerdown puis click) ne bascule qu'une fois.
      await reglages(page);
      const clavier = [];
      for (const a of ["boussole", "guidage", "textures", "pleinJour"]) {
        const sel = '#kta-vue3d [data-v3d="' + a + '"]';
        const lire = function (s) { return document.querySelector(s).getAttribute("aria-pressed"); };
        const avant = await page.evaluate(lire, sel);
        await page.focus(sel);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(80);
        const entree = await page.evaluate(lire, sel);
        const focus = await page.evaluate(function (s) {
          const b = document.querySelector(s), st = getComputedStyle(b);
          const sonde = document.createElement("span");
          sonde.style.color = "var(--kta-interaction)";
          b.parentNode.appendChild(sonde);
          const attendu = getComputedStyle(sonde).color;
          sonde.remove();
          return { visible: b.matches(":focus-visible"), style: st.outlineStyle, couleur: st.outlineColor,
            attendu: attendu };
        }, sel);
        await page.keyboard.press("Space");
        await page.waitForTimeout(80);
        const espace = await page.evaluate(lire, sel);
        await page.locator(sel).click();
        await page.waitForTimeout(80);
        const toucher = await page.evaluate(lire, sel);
        await page.locator(sel).click();
        await page.waitForTimeout(80);
        clavier.push({ a: a, avant: avant, entree: entree, espace: espace, toucher: toucher, focus: focus });
      }
      verifier(clavier.every(function (c) {
        return c.entree !== c.avant && c.espace === c.avant && c.toucher !== c.avant && c.focus.visible &&
          c.focus.style === "solid" && c.focus.couleur === c.focus.attendu;
      }), "tuile ⚙️ : interrupteurs à Entrée et Espace, focus visible --kta-interaction, un toucher = une bascule",
      clavier);
      await reglages(page);
      await page.evaluate(function () {
        const t = document.getElementById("kta-v3d-reglages");
        if (t && !t.hidden) document.querySelector('#kta-vue3d [data-v3d="reglages"]').click();
      });
      // Rendu en pause : immobile en libre, aucune image ; en suivi, le bruit de la boussole (± 0,9°) non plus.
      const pause = await page.evaluate(function () {
        return new Promise(function (r) {
          setTimeout(function () {
            const i0 = window.KtaVue3D.etat().images;
            setTimeout(function () { r({ libre: window.KtaVue3D.etat().images - i0 }); }, 1000);
          }, 300);
        });
      });
      const pauseSuivi = await page.evaluate(function (p) {
        window.__v3dCap = window.getPlanRelHeading;
        let k = 0;
        window.getPlanRelHeading = function () { k++; return 90 + (k % 2 ? 0.9 : -0.9); };
        window.recalerTrackerSurPoint(p.x, p.y, 0);
        if (!window.getTrackingActif()) window.startTracking();
        window.KtaVue3D.suivre();
        return new Promise(function (r) {
          setTimeout(function () {
            const i0 = window.KtaVue3D.etat().images;
            setTimeout(function () {
              const e = window.KtaVue3D.etat();
              window.getPlanRelHeading = window.__v3dCap;
              window.KtaVue3D.placer(p.x, p.y, 0);
              r({ suivi: e.images - i0, mode: e.mode, cap: e.cap });
            }, 1000);
          }, 1500);
        });
      }, prep);
      verifier(pause.libre <= 1 && pauseSuivi.mode === "suivi" && pauseSuivi.suivi <= 2,
        "rendu en pause : " + pause.libre + " image(s) en 1 s immobile, " + pauseSuivi.suivi +
        " en suivi avec une boussole qui tremble de ± 0,9°", { pause: pause, suivi: pauseSuivi });
      // Panneau de POI : couleurs du thème sombre en thème clair ; de près, borné à l'écran, fondu puis masqué.
      const prox = await page.evaluate(function (p) {
        const K = window.KtaVue3D, clair = window.ThemeManager.isLight(), r = {};
        // Tracker arrêté le temps de ces réouvertures (pas de « Je suis ici ? »), relancé au départ ensuite.
        window.stopTracking();
        return K.fermer().then(function () {
          if (clair) window.ThemeManager.setTheme("dark");
          r.surfaceSombre = getComputedStyle(document.body).getPropertyValue("--kta-surface").trim();
          window.ThemeManager.setTheme("light");
          r.surfaceClaire = getComputedStyle(document.body).getPropertyValue("--kta-surface").trim();
          return K.ouvrir({ depart: { x: p.x, y: p.y - 1.4 * p.sc, cap: 0 } });
        }).then(function () {
          return new Promise(function (res) { setTimeout(res, 300); });
        }).then(function () {
          const pan = K.etat().panneaux.filter(function (q) { return q.dansVolume; })[0];
          r.fond = pan.fond; r.loin = pan;
          K.placer(p.x, p.y - 2.4 * p.sc, 0);
          return new Promise(function (res) { setTimeout(res, 300); });
        }).then(function () {
          r.pres = K.etat().panneaux.filter(function (q) { return q.dansVolume; })[0];
          return K.fermer();
        }).then(function () {
          window.ThemeManager.setTheme(clair ? "light" : "dark");
          window.recalerTrackerSurPoint(p.x, p.y, 0);
          window.startTracking();
          return K.ouvrir({ depart: { x: p.x, y: p.y, cap: 0 } });
        }).then(function () { return r; });
      }, prep);
      verifier(prox.fond === prox.surfaceSombre && prox.surfaceClaire !== prox.surfaceSombre,
        "thème clair : panneau de POI aux couleurs du thème sombre (" + prox.fond + ")", prox);
      verifier(prox.loin.visible && prox.loin.largeurEcran <= 0.46 && prox.loin.opacite < 1 && !prox.pres.visible,
        "de près : panneau à " + Math.round(prox.loin.largeurEcran * 100) + " % de l'écran au plus, fondu (" +
        prox.loin.opacite + "), masqué sous 1 m", { loin: prox.loin, pres: prox.pres });
      await page.waitForTimeout(300);

      // Avancer vers le sud (dégagé), puis buter contre le pilier au nord.
      const sud = await page.evaluate(function (p) {
        window.KtaVue3D.tourner(180);
        const r = window.KtaVue3D.avancer(1);
        const e = window.KtaVue3D.etat();
        return { ok: r, dy: (e.pos.y - p.y) / p.sc };
      }, prep);
      verifier(sud.ok && Math.abs(sud.dy - 1) < 0.01, "avancer d'un mètre (vers le sud)", sud);
      const butee = await page.evaluate(function (p) {
        window.KtaVue3D.tourner(180);
        let pas = 0;
        for (let i = 0; i < 100; i++) { if (window.KtaVue3D.avancer(0.1)) pas++; }
        const e = window.KtaVue3D.etat();
        return { pas: pas, butees: e.butees, distM: (e.pos.y - (p.y - 3 * p.sc)) / p.sc };
      }, prep);
      verifier(butee.butees > 0 && butee.distM > 0.05 && butee.distM < 0.6,
        "bute contre le pilier : arrêt à " + butee.distM.toFixed(2) + " m de sa face", butee);
      await capture(page, "fictif-butee");

      // Clavier : flèche bas maintenue → recule.
      const yAvant = await page.evaluate(function () { return window.KtaVue3D.etat().pos.y; });
      await page.keyboard.down("ArrowDown");
      await page.waitForTimeout(600);
      await page.keyboard.up("ArrowDown");
      const yApres = await page.evaluate(function () { return window.KtaVue3D.etat().pos.y; });
      verifier(yApres > yAvant, "clavier : flèche bas maintenue recule", { yAvant: yAvant, yApres: yApres });

      // Bouton à l'écran : ▲ maintenu → avance.
      const boite = await page.locator('#kta-vue3d [data-v3d="av"]').boundingBox();
      await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
      const y1 = await page.evaluate(function () { return window.KtaVue3D.etat().pos.y; });
      await page.mouse.down();
      await page.waitForTimeout(300);
      await page.mouse.up();
      const y2 = await page.evaluate(function () { return window.KtaVue3D.etat().pos.y; });
      verifier(y2 < y1, "bouton ▲ maintenu : avance", { y1: y1, y2: y2 });
      verifier(await page.evaluate(function () { return window.KtaVue3D.etat().rapide; }) === false,
        "appui court sur ▲ : pas normal");
      // Appui long sur ▲ (vers le sud, dégagé) : pas rapide ; relâché : retour au pas normal.
      await page.evaluate(function () { window.KtaVue3D.tourner(180); });
      await page.mouse.down();
      await page.waitForTimeout(900);
      const long = await page.evaluate(function () { return window.KtaVue3D.etat().rapide; });
      await page.mouse.up();
      await page.waitForTimeout(100);
      const relache = await page.evaluate(function () { return window.KtaVue3D.etat().rapide; });
      verifier(long === true && relache === false, "appui long sur ▲ : pas rapide, puis normal au relâché",
        { long: long, relache: relache });
      await page.keyboard.down("Shift");
      await page.keyboard.down("ArrowDown");
      await page.waitForTimeout(150);
      const maj = await page.evaluate(function () { return window.KtaVue3D.etat().rapide; });
      await page.keyboard.up("ArrowDown");
      await page.keyboard.up("Shift");
      verifier(maj === true, "Maj maintenue au clavier : pas rapide");
      await page.evaluate(function () { window.KtaVue3D.tourner(180); });

      await reglages(page);
      await page.locator('#kta-vue3d [data-v3d="vue"]').click();
      await page.waitForTimeout(300);
      const vue = await page.evaluate(function () { return window.KtaVue3D.etat().vue; });
      verifier(vue === "plongee", "bascule en vue plongeante", vue);
      await capture(page, "fictif-plongee");
      await page.keyboard.press("KeyV");
      verifier(await page.evaluate(function () { return window.KtaVue3D.etat().vue; }) === "yeux", "touche V : retour à hauteur d'yeux");

      // ── Inclinaison de la vue plongeante : PageUp/PageDown, Maj + molette, boutons, deux doigts ; bornée et retenue ──
      const i0 = await page.evaluate(function () {
        window.KtaVue3D.basculerVue();
        return window.KtaVue3D.etat();
      });
      verifier(i0.vue === "plongee" && i0.inclinaison === 60 && i0.boussole.inclinaisonVisible,
        "vue plongeante : inclinaison 60°, boutons d'inclinaison montrés", { incl: i0.inclinaison });
      await page.keyboard.press("PageUp");
      const iUp = await page.evaluate(function () { return window.KtaVue3D.etat().inclinaison; });
      await page.keyboard.press("PageDown");
      await page.keyboard.press("PageDown");
      const iDown = await page.evaluate(function () { return window.KtaVue3D.etat().inclinaison; });
      const cvBoite = await page.locator("#kta-vue3d canvas").boundingBox();
      await page.mouse.move(cvBoite.x + cvBoite.width / 2, cvBoite.y + cvBoite.height / 3);
      await page.keyboard.down("Shift");
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(100);
      await page.keyboard.up("Shift");
      const iMolette = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      await page.locator('#kta-vue3d [data-v3d="inclMoins"]').click();
      const iBouton = await page.evaluate(function () { return window.KtaVue3D.etat().inclinaison; });
      verifier(iUp === 65 && iDown === 55 && iMolette.inclinaison === 60 && iMolette.portee.recul === 18.4 &&
        iBouton === 50, "PageUp / PageDown, Maj + molette (sans zoomer) et bouton ▼ changent l'inclinaison",
        { pageUp: iUp, pageDown: iDown, molette: iMolette.inclinaison, recul: iMolette.portee.recul, bouton: iBouton });
      // Deux doigts glissés vers le bas (pointeurs tactiles synthétiques) : plus verticale.
      const iDoigts = await page.evaluate(function () {
        const cv = document.querySelector("#kta-vue3d canvas"), r = cv.getBoundingClientRect();
        const ev = function (type, id, y) {
          cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 11,
            clientX: r.left + r.width / 2 + (id === 11 ? -40 : 40), clientY: y, bubbles: true }));
        };
        const y0 = r.top + r.height / 3;
        ev("pointerdown", 11, y0); ev("pointerdown", 12, y0);
        for (let k = 1; k <= 10; k++) { ev("pointermove", 11, y0 + k * 8); ev("pointermove", 12, y0 + k * 8); }
        ev("pointerup", 11, y0 + 80); ev("pointerup", 12, y0 + 80);
        return window.KtaVue3D.etat();
      });
      verifier(iDoigts.inclinaison > iBouton && iDoigts.mode === "libre" && Math.abs(iDoigts.cap - i0.cap) < 0.01,
        "deux doigts glissés à la verticale : inclinaison changée, cap inchangé",
        { avant: iBouton, apres: iDoigts.inclinaison, cap: iDoigts.cap });
      const bornes = await page.evaluate(function () {
        window.KtaVue3D.incliner(500);
        const haut = window.KtaVue3D.etat().inclinaison;
        window.KtaVue3D.incliner(-500);
        const bas = window.KtaVue3D.etat().inclinaison;
        window.KtaVue3D.incliner(40);
        window.KtaVue3D.basculerVue();
        const yeux = window.KtaVue3D.etat();
        window.KtaVue3D.basculerVue();
        const retour = window.KtaVue3D.etat().inclinaison;
        window.KtaVue3D.basculerVue();
        return { haut: haut, bas: bas, cachesEnYeux: !yeux.boussole.inclinaisonVisible, retour: retour };
      });
      verifier(bornes.haut === 85 && bornes.bas === 15 && bornes.cachesEnYeux && bornes.retour === 55,
        "inclinaison bornée (15° à 85°), retenue d'une vue à l'autre, boutons cachés à hauteur d'yeux", bornes);
      await capture(page, "fictif-yeux-boussole");

      // ── Boussole : N vers le nord réel (cap plan − calibration Nord du plan), sinon haut du plan + mention ──
      const bous = await page.evaluate(function () {
        window.resetPlanNorthOffset();
        const brut = window.PLAN_CONFIG.plan.northOffsetDeg;
        window.KtaVue3D.placer(window.KtaVue3D.etat().pos.x, window.KtaVue3D.etat().pos.y, 90);
        return new Promise(function (r) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              const a = window.KtaVue3D.etat().boussole;
              const rose = document.querySelector("#kta-vue3d .kta-v3d-rose");
              a.transform = rose.style.transform;
              a.planConfig = brut;
              a.texte = document.querySelector("#kta-vue3d .kta-v3d-rose-mention") ? "visible" : "";
              a.attendu = window.I18n.t("vue3d.nordNonCalibre");
              window.setPlanNorthOffset(null, 30);
              requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                  const b = window.KtaVue3D.etat().boussole;
                  b.transform = rose.style.transform;
                  window.KtaVue3D.tourner(45);
                  requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                      const c = window.KtaVue3D.etat().boussole;
                      c.transform = rose.style.transform;
                      window.resetPlanNorthOffset();
                      r({ sans: a, avec: b, tourne: c });
                    });
                  });
                });
              });
            });
          });
        });
      });
      const deg = function (t) { const m = /rotate\((-?[\d.]+)deg\)/.exec(t || ""); return m ? Number(m[1]) : NaN; };
      const sansCalib = bous.sans.planConfig === undefined || bous.sans.planConfig === null;
      verifier(!sansCalib || (bous.sans.calibre === false && bous.sans.texte === "" &&
        bous.sans.libelle.indexOf(bous.sans.attendu) >= 0 && deg(bous.sans.transform) === -90),
        "boussole sans nord calibré : haut du plan, aucun texte à l'écran, dit au libellé accessible", bous.sans);
      verifier(bous.avec.calibre === true && bous.avec.libelle.indexOf(bous.sans.attendu) < 0 && deg(bous.avec.transform) === -60 &&
        deg(bous.tourne.transform) === -105, "boussole calibrée (30°) : N au nord réel, tourne avec la vue",
        { avec: bous.avec, tourne: bous.tourne });

      if (prep.multi) {
        const niv = await page.evaluate(function () {
          const avant = window.KtaVue3D.etat().niveau;
          window.APP_CONFIG.activeLevel = avant === 0 ? 1 : 0;
          return new Promise(function (r) {
            setTimeout(function () {
              const e = window.KtaVue3D.etat();
              window.APP_CONFIG.activeLevel = 0;
              r({ avant: avant, apres: e.niveau, structures: e.compte.structures });
            }, 300);
          });
        });
        verifier(niv.apres !== niv.avant && niv.structures === 0,
          "changement de niveau : scène refaite (le pilier du niveau 0 n'y est plus)", niv);
        await page.waitForTimeout(300);
      } else {
        console.log("  ℹ️ plan à un niveau : changement de niveau non joué");
      }

      // ── Collisions : jamais à travers un pilier, un mur, un mur en ligne, un front ou un pilier perso ──────
      // Obstacles fictifs posés loin du départ (image de collision du plan mise de côté le temps du test : seule
      // la règle des structures est jugée). Chaque pas est vérifié par une géométrie propre au checkup (pas celle
      // de l'app) : le segment parcouru ne coupe aucune arête, l'arrivée n'est dans aucun polygone, et le corps
      // garde au moins 0,2 m du bord.
      const coll = await page.evaluate(function (p) {
        const sc = p.sc, ox = p.x, oy = p.y + 30 * sc;
        const carre = function (cx, cy, dx, dy) {
          return [{ x: cx - dx, y: cy - dy }, { x: cx + dx, y: cy - dy }, { x: cx + dx, y: cy + dy }, { x: cx - dx, y: cy + dy }];
        };
        const obstacles = [
          { nom: "pilier", s: { uid: "st_v3d_c1", type: "pilier-1", level: 0, points: carre(ox, oy, 1.5 * sc, 1.5 * sc) } },
          { nom: "pilier fin (0,4 m)", s: { uid: "st_v3d_c2", type: "pilier-2", level: 0, points: carre(ox + 20 * sc, oy, 0.2 * sc, 1.5 * sc) } },
          { nom: "mur", s: { uid: "st_v3d_c3", type: "mur", level: 0, points: carre(ox + 40 * sc, oy, 2 * sc, 0.3 * sc) } },
          { nom: "mur en ligne", s: { uid: "st_v3d_c4", type: "mur-ligne", level: 0,
            points: [{ x: ox + 60 * sc, y: oy - 2 * sc }, { x: ox + 60 * sc, y: oy + 2 * sc }] } },
          { nom: "front", s: { uid: "st_v3d_c5", type: "front-1", level: 0,
            points: [{ x: ox + 80 * sc - 2 * sc, y: oy }, { x: ox + 80 * sc, y: oy + 0.5 * sc }, { x: ox + 80 * sc + 2 * sc, y: oy }] } },
          { nom: "pilier perso", s: { uid: "st_v3d_c6", type: "cust-v3d-test", level: 0, points: carre(ox + 100 * sc, oy, 1 * sc, 1 * sc) } }
        ];
        const avant = window.getStructures().slice();
        window.setStructures(avant.concat(obstacles.map(function (o) { return o.s; })));
        const accVrai = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        const coupe = function (ax, ay, bx, by, cx, cy, dx, dy) {
          const o = function (px, py, qx, qy, rx, ry) { return (qx - px) * (ry - py) - (qy - py) * (rx - px); };
          const d1 = o(cx, cy, dx, dy, ax, ay), d2 = o(cx, cy, dx, dy, bx, by);
          const d3 = o(ax, ay, bx, by, cx, cy), d4 = o(ax, ay, bx, by, dx, dy);
          return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
        };
        const dedans = function (pts, x, y) {
          let r = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const a = pts[i], b = pts[j];
            if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) r = !r;
          }
          return r;
        };
        const distBord = function (pts, ferme, x, y) {
          let d = Infinity;
          const n = ferme ? pts.length : pts.length - 1;
          for (let i = 0; i < n; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
            const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2)) : 0;
            d = Math.min(d, Math.hypot(x - a.x - t * vx, y - a.y - t * vy));
          }
          return d / sc;
        };
        const echecs = [];
        let pas = 0, butees = 0, distMin = Infinity;
        const juger = function (o, a, b, cas) {
          const pts = o.s.points, ferme = o.s.type !== "mur-ligne" && o.s.type !== "front-1";
          const n = ferme ? pts.length : pts.length - 1;
          for (let i = 0; i < n; i++) {
            const q = pts[i], r = pts[(i + 1) % pts.length];
            if (coupe(a.x, a.y, b.x, b.y, q.x, q.y, r.x, r.y)) { echecs.push(o.nom + " traversé (" + cas + ")"); return false; }
          }
          if (ferme && dedans(pts, b.x, b.y)) { echecs.push(o.nom + " : arrivée dedans (" + cas + ")"); return false; }
          const d = distBord(pts, ferme, b.x, b.y);
          distMin = Math.min(distMin, d);
          if (d < 0.2) echecs.push(o.nom + " : corps à " + d.toFixed(2) + " m du bord (" + cas + ")");
          return true;
        };
        const centre = function (o) {
          let x = 0, y = 0;
          o.s.points.forEach(function (q) { x += q.x; y += q.y; });
          return { x: x / o.s.points.length, y: y / o.s.points.length };
        };
        obstacles.forEach(function (o) {
          const c = centre(o);
          // Droit dessus sous 12 angles, pas « rapide » (0,7 m = 7 m/s sur une image de 0,1 s), puis un grand pas.
          for (let k = 0; k < 12; k++) {
            const cap = k * 30, a = cap * Math.PI / 180;
            const fx = Math.sin(a), fy = -Math.cos(a);
            window.KtaVue3D.placer(c.x - fx * 4 * sc, c.y - fy * 4 * sc, cap);
            let ok = true;
            for (let i = 0; i < 16 && ok; i++) {
              const p0 = window.KtaVue3D.etat().pos;
              const r = window.KtaVue3D.avancer(i === 15 ? 6 : 0.7);
              pas++; if (!r) butees++;
              ok = juger(o, p0, window.KtaVue3D.etat().pos, "cap " + cap + "°, pas " + i);
            }
          }
        });
        // Départ à 0,1 m d'une face, face à elle : aucun pas ne passe.
        const P = obstacles[0], cP = centre(P);
        window.KtaVue3D.placer(cP.x, cP.y + 1.6 * sc, 0);
        const p0 = window.KtaVue3D.etat().pos;
        const presFace = window.KtaVue3D.avancer(0.05) === false && window.KtaVue3D.avancer(1) === false;
        const p1 = window.KtaVue3D.etat().pos;
        if (!presFace || p1.y !== p0.y) echecs.push("départ à 0,1 m de la face : un pas est passé");
        // … mais on n'y reste pas collé : reculer et longer la face passent.
        window.KtaVue3D.tourner(90);
        const longe = window.KtaVue3D.avancer(0.05);
        window.KtaVue3D.tourner(90);
        const recule = window.KtaVue3D.avancer(0.05);
        if (!longe || !recule) echecs.push("départ à 0,1 m de la face : figé (longer " + longe + ", reculer " + recule + ")");
        // Pas plus long que l'épaisseur du pilier fin, depuis 0,5 m.
        const T = obstacles[1], cT = centre(T);
        window.KtaVue3D.placer(cT.x - 0.7 * sc, cT.y, 90);
        const t0 = window.KtaVue3D.etat().pos;
        window.KtaVue3D.avancer(3);
        juger(T, t0, window.KtaVue3D.etat().pos, "pas de 3 m sur un pilier de 0,4 m");
        window.ktaEstAccessible = accVrai;
        window.setStructures(avant);
        window.KtaVue3D.placer(p.x, p.y - 1 * sc, 0);   // à 2 m du pilier du départ, écarté du tracker
        return { echecs: echecs.slice(0, 6), nEchecs: echecs.length, pas: pas, butees: butees,
          distMin: +distMin.toFixed(2) };
      }, prep);
      verifier(coll.nEchecs === 0 && coll.butees > 0, "collisions : " + coll.pas + " pas sur 6 obstacles (12 angles, " +
        "pas rapide et grand pas), aucun traversé, corps à " + coll.distMin + " m du bord au plus près", coll);

      // ── 3. Perte du contexte WebGL simulée, puis reprise ───────────────────────────────────────────
      perteSimulee = true;
      const perte = await page.evaluate(function () {
        const gl = document.querySelector("#kta-vue3d canvas").getContext("webgl2");
        window.__v3dPerte = gl.getExtension("WEBGL_lose_context");
        window.__v3dPerte.loseContext();
        return new Promise(function (r) { setTimeout(function () { r(window.KtaVue3D.etat()); }, 400); });
      });
      verifier(perte.ouvert && perte.perdu && !perte.contexteVivant, "contexte perdu : la vue reste ouverte et attend",
        { ouvert: perte.ouvert, perdu: perte.perdu, vivant: perte.contexteVivant });
      const reprise = await page.evaluate(function () {
        const i0 = window.KtaVue3D.etat().images;
        window.__v3dPerte.restoreContext();
        return new Promise(function (r) {
          setTimeout(function () {
            window.KtaVue3D.tourner(5);
            setTimeout(function () {
              const e = window.KtaVue3D.etat(), m = window.KtaVue3D.mesurer({ images: 4 });
              window.KtaVue3D.tourner(-5);
              r({ ouvert: e.ouvert, perdu: e.perdu, vivant: e.contexteVivant, reprises: e.reprises,
                images: e.images - i0, tri: m.trianglesMax });
            }, 400);
          }, 400);
        });
      });
      verifier(reprise.ouvert && !reprise.perdu && reprise.vivant && reprise.reprises === 1 && reprise.images > 0 &&
        reprise.tri > 100, "contexte repris : la scène se redessine (" + reprise.tri + " triangles)", reprise);
      await page.waitForTimeout(300);
      perteSimulee = false;

      // ── 4. Échap après un déplacement, suivi actif : « Je suis ici ? » → Non ne change rien ─────────
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const question = await page.evaluate(function () {
        const ok = document.getElementById("kta-confirm-oui");
        return { dom: !!document.getElementById("kta-vue3d"), etat: window.KtaVue3D.etat(),
          oui: ok ? ok.textContent : null, attendu: window.I18n.t("vue3d.jeSuisIci.oui") };
      });
      verifier(!question.dom && question.etat.contexteLibere === true && question.etat.fermeture === "utilisateur",
        "Échap ferme et libère le contexte WebGL", question.etat);
      verifier(question.oui === question.attendu, "fermeture après un déplacement : « Je suis ici ? » posée", question);
      await page.locator("#kta-confirm-non").click();
      await page.waitForTimeout(200);
      const apresNon = await page.evaluate(function () { return window.getTrackingPosition(); });
      verifier(apresNon.x === prep.x && apresNon.y === prep.y, "« Non » : le tracker n'a pas bougé", apresNon);

      // ── 5. Rouvrir par le bouton cube, 1 m au sud, ✕ → « Oui » recale le tracker là ─────────────────
      await page.locator(".kta-vue3d-ctrl a").click();
      await attendre(page, function () { return window.KtaVue3D.etat().ouvert === true; }, 10000);
      const cible = await page.evaluate(function () {
        window.KtaVue3D.placer(window.getTrackingPosition().x, window.getTrackingPosition().y, 180);
        window.KtaVue3D.avancer(1);
        return window.KtaVue3D.etat().pos;
      });
      // ✕ : rien au simple appui (pointerdown) ; le clic ferme, et rien ne part vers ce qui est dessous.
      const appui = await page.evaluate(function () {
        const x = document.querySelector('#kta-vue3d [data-v3d="fermer"]');
        x.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
        return window.KtaVue3D.etat().ouvert;
      });
      verifier(appui === true, "✕ : le simple appui ne ferme pas (seul le clic ferme)");
      await page.evaluate(function () {
        window.__v3dSortie = 0;
        const S = window.SortieUrgence;
        if (S) { window.__v3dDecl = S.declencher; S.declencher = function () { window.__v3dSortie++; }; }
      });
      await page.locator('#kta-vue3d [data-v3d="fermer"]').click();
      await page.waitForTimeout(200);
      const sortie = await page.evaluate(function () {
        if (window.__v3dDecl) window.SortieUrgence.declencher = window.__v3dDecl;
        return window.__v3dSortie;
      });
      verifier(sortie === 0, "✕ : la Sortie d'urgence n'est pas déclenchée", sortie);
      const q2 = await page.evaluate(function () { return !!document.getElementById("kta-confirm-oui"); });
      verifier(q2, "✕ après un déplacement : « Je suis ici ? » posée");
      await page.locator("#kta-confirm-oui").click();
      await page.waitForTimeout(300);
      const apresOui = await page.evaluate(function () { return window.getTrackingPosition(); });
      verifier(Math.abs(apresOui.x - cible.x) < 0.01 && Math.abs(apresOui.y - cible.y) < 0.01 &&
        Math.abs((apresOui.y - prep.y) / prep.sc - 1) < 0.01, "« Oui » : le tracker est recalé là où la vue s'est arrêtée",
        { apresOui: apresOui, cible: cible });
      await page.evaluate(function () { window.stopTracking(); });

      // ── 6. Perte sans reprise : la vue se ferme avec un message ─────────────────────────────────────
      perteSimulee = true;
      const echec = await page.evaluate(function (p) {
        return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 }, attenteReprise: 600 }).then(function () {
          const gl = document.querySelector("#kta-vue3d canvas").getContext("webgl2");
          gl.getExtension("WEBGL_lose_context").loseContext();
          return new Promise(function (r) {
            setTimeout(function () {
              const pile = document.getElementById("kta-toasts");
              r({ etat: window.KtaVue3D.etat(), dom: !!document.getElementById("kta-vue3d"),
                toast: pile ? pile.textContent : "", attendu: window.I18n.t("vue3d.contextePerdu") });
            }, 1800);
          });
        });
      }, prep);
      verifier(!echec.dom && echec.etat.ouvert === false && echec.etat.fermeture === "contexte" &&
        echec.toast.indexOf(echec.attendu) >= 0, "contexte non repris : vue fermée avec un message", echec);
      await page.waitForTimeout(300);
      perteSimulee = false;

      // ── 7. WebGL absent : refus avec un message ─────────────────────────────────────────────────────
      perteSimulee = true;
      const sansGl = await page.evaluate(function (p) {
        const proto = HTMLCanvasElement.prototype, orig = proto.getContext;
        proto.getContext = function (t, o) { return /webgl/i.test(String(t)) ? null : orig.call(this, t, o); };
        return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } }).then(function (ok) {
          proto.getContext = orig;
          const b = document.getElementById("kta-confirm-oui");
          const txt = b ? b.closest(".kta-readme-modal-boite").textContent : "";
          if (b) b.click();
          return { ok: ok, txt: txt, dom: !!document.getElementById("kta-vue3d"), attendu: window.I18n.t("vue3d.indisponible") };
        }, function (err) { proto.getContext = orig; return { erreur: String(err && err.message) }; });
      }, prep);
      verifier(sansGl.ok === false && !sansGl.dom && sansGl.txt.indexOf(sansGl.attendu) >= 0,
        "WebGL absent : ouverture refusée avec un message", sansGl);
      await page.waitForTimeout(300);
      perteSimulee = false;

      const cycles = await page.evaluate(function (p) {
        let chaine = Promise.resolve(), perdus = 0;
        for (let i = 0; i < 20; i++) {
          chaine = chaine.then(function () { return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } }); })
            .then(function () { window.KtaVue3D.fermer(); if (window.KtaVue3D.etat().contexteLibere) perdus++; });
        }
        return chaine.then(function () { return { perdus: perdus, restes: document.querySelectorAll("#kta-vue3d").length }; });
      }, prep);
      verifier(cycles.perdus === 20 && cycles.restes === 0, "20 ouvertures / fermetures : contexte libéré à chaque fois", cycles);
      const apres = await page.evaluate(function (p) {
        return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } }).then(function () {
          const e = window.KtaVue3D.etat();
          window.KtaVue3D.fermer();
          return e.contexteVivant;
        });
      }, prep);
      verifier(apres === true, "21e ouverture : la vue a un contexte vivant");

      // ── Hauteur ⛏️ (structures) : le chiffre de ⛏️ Volume exploité, scène refaite, relu à la réouverture ──
      await page.evaluate(function (p) {
        return window.KtaVue3D.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } });
      }, prep);
      const h0 = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      await reglages(page);
      await page.locator('#kta-vue3d [data-v3d="hauteur"]').click();
      await page.locator('#kta-vue3d [data-v3d="hauteurPlus"]').click();
      const h1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { hauteur: e.hauteur, pref: window.getPlanHauteurGalerie(), reglage: e.reglageHauteur,
          attendu: window.formatDistance(e.hauteur, 1) };
      });
      verifier(h0.hauteur === 2 && h1.hauteur === 2.1 && h1.pref === 2.1 && h1.reglage.visible &&
        h1.reglage.valeur === h1.attendu && h1.reglage.bouton === "⛏️ " + h1.attendu,
        "⛏️ puis + : 2 m → 2,1 m, écrit pour le plan, montré sur le bouton et dans le réglage", { h0: h0.hauteur, h1: h1 });
      await capture(page, "hauteur-reglage");
      const h3 = await page.evaluate(function () {
        const K = window.KtaVue3D, r = {};
        r.haut = K.reglerHauteur(30); r.bas = K.reglerHauteur(1);
        r.v12 = K.reglerHauteur(12);
        document.querySelector('#kta-vue3d [data-v3d="hauteurMoins"]')
          .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));   // − / + agissent au pointerdown
        r.v12moins = K.etat().hauteur;
        r.v = K.reglerHauteur(3);
        const e = K.etat();
        r.hauteur = e.hauteur; r.pref = window.getPlanHauteurGalerie(); r.yMax = e.yMax; r.oeil = e.oeil;
        r.pos = e.pos; r.cap = e.cap; r.rendu = e.rendu; r.construites = e.construites;
        r.plus = document.querySelector('#kta-vue3d [data-v3d="hauteurPlus"]').disabled;
        return r;
      });
      verifier(h3.haut === 20 && h3.bas === 1.5 && h3.v12 === 12 && h3.v12moins === 11.5 && h3.v === 3 && h3.hauteur === 3 &&
        h3.pref === 3 && !h3.plus,
        "réglage borné de 1,5 à 20 m (12 m puis − → 11,5 m, pas de 0,5 au-delà de 5 m) ; à 3 m, getPlanHauteurGalerie() vaut 3", h3);
      verifier(Math.abs(h3.yMax.opaque - 3) < 1e-6 && Math.abs(h3.yMax.murs - 3 * 0.98) < 1e-6 && h3.oeil === 1.6 &&
        h3.construites > 0 && h3.rendu === "mixte" &&
        h3.pos.x === h0.pos.x && h3.pos.y === h0.pos.y && h3.cap === h0.cap,
        "mixte (défaut) : scène refaite à 3 m (piliers 3 m, murs 98 %), position et cap gardés", h3);
      const h4 = await page.evaluate(function (p) {
        const K = window.KtaVue3D, r = {};
        return K.fermer().then(function () {
          return K.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } });
        }).then(function () {
          r.rouvert = K.etat().hauteur; r.bouton = K.etat().reglageHauteur.bouton;
          return K.fermer();
        }).then(function () {
          // ⛏️ Volume exploité lit le même chiffre, et ce qu'il écrit, la vue le relit.
          const surf = window.getMeasurePointsSurface;
          window.getMeasurePointsSurface = function () {
            const d = 5 * p.sc;
            return [{ x: p.x - d, y: p.y - d }, { x: p.x + d, y: p.y - d }, { x: p.x + d, y: p.y + d }, { x: p.x - d, y: p.y + d }];
          };
          window.KtaVolumeExploite.ouvrir();
          const champ = document.getElementById("kta-volume-h");
          r.volume = champ ? champ.value : null;
          if (champ) { champ.value = "2.5"; champ.dispatchEvent(new Event("input", { bubbles: true })); }
          const x = document.querySelector("#kta-volume-modal .kta-panneau-close");
          if (x) x.click();
          window.getMeasurePointsSurface = surf;
          return K.ouvrir({ depart: { x: p.x, y: p.y + 4 * p.sc, cap: 0 } });
        }).then(function () {
          r.depuisVolume = K.etat().hauteur;
          return K.fermer();
        }).then(function () {
          const k = "myktamap_plan_prefs_" + (window._currentLoadedPlanId || "default");
          const pr = JSON.parse(localStorage.getItem(k) || "{}");
          delete pr.hauteurGalerieM;
          localStorage.setItem(k, JSON.stringify(pr));
          return r;
        });
      }, prep);
      verifier(h4.rouvert === 3 && h4.bouton.indexOf("3.0") >= 0 && h4.volume === "3" && h4.depuisVolume === 2.5,
        "3 m relus à la réouverture et par ⛏️ Volume exploité ; 2,5 m saisis dans ⛏️ relus par la vue", h4);
      await page.evaluate(function () {
        window.setStructures([]);
        window.setEditorPoints(window.__v3dPoints || []);
      });

      // ── 8. Mode galerie : formes fictives (T, X, coude droit, coude aigu, cul-de-sac, presque parallèles) ───
      // Calques du plan mis de côté pendant la partie galerie : seules les formes du checkup comptent. Plan courant
      // remplacé par un identifiant de test (le rendu est retenu PAR PLAN : rien n'est écrit pour le relevé fictif).
      const G = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale, W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
        window.__v3dEmb = { r: window.getAllEmbeddedRoads, z: window.getAllEmbeddedZones, p: window.getAllEmbeddedPoints,
          s: window.getAllEmbeddedStructures, id: window._currentLoadedPlanId };
        const vide = function () { return []; };
        window.getAllEmbeddedRoads = window.getAllEmbeddedZones = window.getAllEmbeddedPoints = vide;
        window.getAllEmbeddedStructures = vide;
        window._currentLoadedPlanId = "v3d-checkup-galerie";
        if (window.getTrackingActif()) window.stopTracking();
        window.ktaSetActiveLevel(0);
        const ox = W / 2 / sc - 125, oz = H / 2 / sc;   // mètres
        const P = function (cx, x, z) { return { x: (ox + cx + x) * sc, y: (oz + z) * sc }; };
        let n = 0;
        const R = function (type, cx, pts, lvl) {
          return { uid: "rd_v3d_" + (n++), type: type, level: lvl || 0,
            points: pts.map(function (q) { return P(cx, q[0], q[1]); }) };
        };
        window.setRoads([
          R("principal", 0, [[-12, 0], [12, 0]]), R("secondaire", 0, [[0, 0], [0, 12]]),        // T
          R("principal", 50, [[-12, 0], [12, 0]]), R("principal", 50, [[0, -12], [0, 12]]),     // X
          R("chemin", 100, [[0, -12], [0, 0], [12, 0]]),                                       // coude droit
          R("chemin", 150, [[-12, 0], [0, 0], [-12, 4]]),                                      // coude aigu (19°)
          R("principal", 200, [[0, 0], [14, 0]]),                                               // cul-de-sac
          R("principal", 250, [[-12, 0], [12, 0]]), R("principal", 250, [[-12, 1.6], [12, 2.4]]), // presque parallèles
          R("principal", 0, [[-12, -6], [12, -6]], 1), R("principal", 50, [[-12, -6], [12, -6]], 1),
          { uid: "rd_v3d_j", type: "jonction", level: 0, fromLevel: 0, toLevel: 1, points: [P(50, 8, 0), P(50, 8, -6)] }
        ]);
        const carre = function (cx, x0, x1, z0, z1) {
          return [P(cx, x0, z0), P(cx, x1, z0), P(cx, x1, z1), P(cx, x0, z1)];
        };
        window.setZones([
          { uid: "zn_v3d_e", type: "eau", level: 0, points: carre(200, 2, 4, -3, 3) },
          { uid: "zn_v3d_r", type: "remblais", level: 0, points: carre(200, 6, 8, -3, 3) },
          { uid: "zn_v3d_i", type: "inaccessible", level: 0, points: carre(200, 10, 11, -3, 3) }
        ]);
        const pj = P(0, -8, 0), acc = P(0, -8, -6);
        window.setEditorPoints([
          Object.assign({ id: "POI 2 m v3d", level: 0, tags: ["danger"] }, P(200, 5, 2)),
          Object.assign({ id: "POI 5 m v3d", level: 0, tags: ["danger"] }, P(200, 5, 5)),
          Object.assign({ id: "POI 25 m v3d", level: 0, tags: ["danger"] }, P(200, 5, 25)),
          { id: "POI jonction v3d", x: pj.x, y: pj.y, level: 0, tags: ["jes"], niveaux: [0, 1],
            accroches: [{ level: 1, x: acc.x, y: acc.y }] }
        ]);
        window.KtaGalerie.invalider();
        const m = window.KtaGalerie.modele(0);
        return { sc: sc, ox: ox, oz: oz, H: H, multi: window.APP_CONFIG.multiLevel === true, planReel: window.__v3dEmb.id,
          modele: { pieces: m.pieces.length, aretes: m.aretes.length, dalles: m.dalles, coudes: m.coudes, bouts: m.bouts,
            ms: +m.msConstruction.toFixed(1) } };
      });
      // Point (mètres, relatif à une forme) → coordonnées plan (px).
      const pt = function (cx, x, z, cap) {
        return { x: (G.ox + cx + x) * G.sc, y: (G.oz + z) * G.sc, cap: cap === undefined ? 0 : cap };
      };
      verifier(G.modele.dalles >= 2 && G.modele.coudes >= 2 && G.modele.bouts >= 6,
        "galerie : graphe des formes (dalles aux carrefours T et X, coudes, bouts libres)", G.modele);

      // Interrupteur à trois états : mixte par défaut (avec ou sans structure), bouton mixte → structures → galerie,
      // retenu par plan. Un pilier posé sur le T : dessiné et bloquant en mixte et en structures, absent en galerie.
      // La suite de la partie 8 se joue en galerie (choix retenu pour le plan de test).
      const inter = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, r = {}, acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };   // image du plan : seule la structure juge
        const traverser = function () {
          K.placer(a.avant.x, a.avant.y, 90);
          for (let i = 0; i < 30; i++) K.avancer(0.2);
          return (K.etat().pos.x - a.avant.x) / a.sc;
        };
        const clic = function () {
          document.querySelector('#kta-vue3d [data-v3d="rendu"]').dispatchEvent(new PointerEvent("pointerdown",
            { bubbles: true }));
          const e = K.etat();
          return { rendu: e.rendu, bouton: e.boutonRendu, pref: window.getPlanRenduVue3D(), parois: K.parois().length,
            yMax: e.yMax.opaque };
        };
        await K.ouvrir({ depart: a.dep });
        r.sans = K.etat().rendu; r.paroisSans = K.parois().length;
        await K.fermer();
        window.setStructures([{ uid: "st_v3d_g", type: "pilier-1", level: 0, points: a.pilier }]);
        await K.ouvrir({ depart: a.dep });
        const e = K.etat();
        r.avec = e.rendu; r.bouton = e.boutonRendu; r.prefAvant = window.getPlanRenduVue3D();
        r.paroisMixte = K.parois().length; r.yMaxMixte = e.yMax.opaque;
        r.traverseMixte = traverser();
        r.c1 = clic();
        r.traverseStructures = traverser();
        r.c2 = clic();
        r.traverseGalerie = traverser();   // le pilier posé sur le tube n'arrête rien en galerie
        await K.fermer();
        await K.ouvrir({ depart: a.dep });
        r.rouvert = K.etat().rendu;
        r.autrePlan = window.getPlanRenduVue3D("v3d-autre-plan");
        r.c3 = clic(); r.c4 = clic(); r.c5 = clic();
        await K.fermer();
        window.setStructures([]);
        window.ktaEstAccessible = acc;
        r.libelles = { m: window.I18n.t("vue3d.modeMixte"), s: window.I18n.t("vue3d.modeStructures"),
          g: window.I18n.t("vue3d.modeGalerie") };
        return r;
      }, { dep: pt(0, -8, 0, 90), avant: pt(0, -8, 0), sc: G.sc,
        pilier: [pt(0, -4.5, -0.5), pt(0, -3.5, -0.5), pt(0, -3.5, 0.5), pt(0, -4.5, 0.5)] });
      verifier(inter.sans === "mixte" && inter.avec === "mixte" && inter.prefAvant === null && inter.paroisSans > 0 &&
        inter.bouton.indexOf("🏛️🛣️ " + inter.libelles.m) === 0,
        "défaut : mixte, avec ou sans structure au niveau (sans structure : tout en tubes), bouton 🏛️🛣️ Mixte", inter);
      verifier(inter.paroisMixte > 0 && Math.abs(inter.yMaxMixte - 2) < 1e-6 && inter.traverseMixte < 3.5,
        "mixte : pilier posé sur le tube dessiné et bloquant, parois des tubes ailleurs", inter);
      verifier(inter.c1.rendu === "structures" && inter.c1.bouton.indexOf("🏛️ " + inter.libelles.s) === 0 &&
        inter.c1.pref === "structures" && inter.c1.parois === 0 && inter.traverseStructures < 3.5,
        "bouton : mixte → 🏛️ Structures (retenu pour le plan) : aucune paroi, le pilier arrête", inter.c1);
      verifier(inter.c2.rendu === "galerie" && inter.c2.bouton.indexOf("🛣️ " + inter.libelles.g) === 0 &&
        inter.c2.pref === "galerie" && inter.c2.parois > 0 && inter.c2.yMax < 0.1 && inter.traverseGalerie > 5,
        "→ 🛣️ Galerie (retenu) : tubes, ni pilier dessiné ni butée contre lui", { c2: inter.c2, t: inter.traverseGalerie });
      verifier(inter.rouvert === "galerie" && inter.autrePlan === null && inter.c3.rendu === "mixte" &&
        inter.c3.pref === "mixte" && inter.c4.rendu === "structures" && inter.c5.rendu === "galerie",
        "rouvert : rendu retenu (galerie), autre plan sans choix ; → mixte → structures → galerie, en boucle", inter);

      // Formes : toutes les parois construites (une seule tuile), aucune ne traverse une autre ; axes libres.
      const formes = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a.dep, tuiles: false }).then(function () {
          const ps = window.KtaVue3D.parois();
          const coupe = function (s, t) {
            const dx = s[2] - s[0], dz = s[3] - s[1], ex = t[2] - t[0], ez = t[3] - t[1], d = dx * ez - dz * ex;
            if (Math.abs(d) < 1e-12) return false;
            const rx = t[0] - s[0], rz = t[1] - s[1], u = (rx * ez - rz * ex) / d, v = (rx * dz - rz * dx) / d;
            return u > 1e-4 && u < 1 - 1e-4 && v > 1e-4 && v < 1 - 1e-4;
          };
          let croisements = 0;
          const exemples = [];
          for (let i = 0; i < ps.length; i++) {
            for (let j = i + 1; j < ps.length; j++) {
              if (coupe(ps[i], ps[j])) { croisements++; if (exemples.length < 3) exemples.push([ps[i], ps[j]]); }
            }
          }
          const M = function (cx, x0, z0, x1, z1) { return [a.ox + cx + x0, a.oz + z0, a.ox + cx + x1, a.oz + z1]; };
          const murs = function (s) { return ps.filter(function (p) { return coupe(s, p); }).length; };
          const axes = {
            T: murs(M(0, -11.5, 0, 11.5, 0)) + murs(M(0, 0, 0.1, 0, 11.5)),
            X: murs(M(50, -11.5, 0, 11.5, 0)) + murs(M(50, 0, -11.5, 0, 11.5)),
            coude: murs(M(100, 0, -11.5, 0, 0)) + murs(M(100, 0, 0, 11.5, 0)),
            aigu: murs(M(150, -11.5, 0, 0, 0)) + murs(M(150, 0, 0, -11.5, 3.83)),
            paralleles: murs(M(250, -11.5, 0, 11.5, 0)) + murs(M(250, -11.5, 1.63, 11.5, 2.38)) +
              murs(M(250, 0, 0, 0, 2)),
            culDeSac: murs(M(200, -1, 0, 15, 0)),
            coteT: murs(M(0, -6, -2, -6, 2)),
            fondT: murs(M(0, 6, 0.5, 6, -2))
          };
          window.KtaVue3D.fermer();
          return { parois: ps.length, croisements: croisements, exemples: exemples, axes: axes };
        });
      }, { dep: pt(0, -8, 0, 90), ox: G.ox, oz: G.oz });
      verifier(formes.parois > 20 && formes.croisements === 0,
        "galerie : " + formes.parois + " parois (T, X, coudes droit et aigu, cul-de-sac, presque parallèles), " +
        "aucune ne traverse une autre", { croisements: formes.croisements, exemples: formes.exemples });
      const ax = formes.axes;
      verifier(ax.T === 0 && ax.X === 0 && ax.coude === 0 && ax.aigu === 0 && ax.paralleles === 0,
        "axes libres : carrefours ouverts (T, X), coudes passants, tracés presque parallèles fondus en une galerie", ax);
      verifier(ax.culDeSac === 2 && ax.coteT === 2 && ax.fondT === 1,
        "bouts libres fermés par une paroi ; T : deux parois en travers d'une branche, une en face du départ", ax);
      await capture(page, "galerie-formes");

      // Collisions contre les parois : butée, carrefour passé, coude, remblais qui bouche, eau qui ne bouche pas.
      const coll3 = await page.evaluate(function (a) {
        const K = window.KtaVue3D, rel = function (cx) {
          const p = K.etat().pos;
          return { x: +(p.x / a.sc - a.ox - cx).toFixed(2), z: +(p.y / a.sc - a.oz).toFixed(2) };
        };
        const marcher = function (n, pas) { for (let i = 0; i < n; i++) K.avancer(pas || 0.2); };
        return K.ouvrir({ depart: a.t }).then(function () {
          const r = {};
          // À 2 m du POI jonction (x = −8, sur l'axe) : sa niche d'escalier ouvre la paroi nord.
          K.placer(a.t.x + 2 * a.sc, a.t.y, 0); marcher(30); r.paroiNord = rel(0).z;
          K.placer(a.t.x - 2 * a.sc, a.t.y, 90); marcher(120); r.carrefourEst = rel(0).x;
          K.placer((a.ox + 0) * a.sc, a.oz * a.sc, 180); marcher(70); r.branche = rel(0).z;
          K.placer((a.ox + 100) * a.sc, (a.oz - 10) * a.sc, 180); marcher(70); r.coudeSud = rel(100).z;
          K.tourner(-90); marcher(70); r.coudeEst = rel(100).x;
          K.placer((a.ox + 200.8) * a.sc, a.oz * a.sc, 90); marcher(70, 0.1); r.remblais = rel(200).x;
          r.butees = K.etat().butees;
          K.fermer();
          return r;
        });
      }, { t: pt(0, -8, 0, 90), sc: G.sc, ox: G.ox, oz: G.oz });
      verifier(coll3.paroiNord > -0.9 && coll3.paroiNord < -0.6 && coll3.carrefourEst > 10.5 && coll3.branche > 10.5 &&
        coll3.coudeSud > 0.2 && coll3.coudeSud < 0.5 && coll3.coudeEst > 10.5,
        "galerie : on bute contre la paroi (" + coll3.paroiNord + " m de l'axe), on passe le carrefour et le coude",
        coll3);
      verifier(coll3.remblais > 5.3 && coll3.remblais < 5.65,
        "galerie : l'eau ne bouche pas, le remblais découpé arrête (" + coll3.remblais + " m, remblais à 6 m)", coll3);

      // Zones coupées au tube, rideau en travers ; POI à 2 m et 5 m ramenés dans le tube, à 25 m masqué.
      const zp = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a.dep }).then(function () {
          const e = window.KtaVue3D.etat();
          window.KtaVue3D.fermer();
          const b = e.boites, rel = function (bb) {
            return bb ? { x0: +(bb.x0 - a.ox - 200).toFixed(2), x1: +(bb.x1 - a.ox - 200).toFixed(2),
              z0: +(bb.z0 - a.oz).toFixed(2), z1: +(bb.z1 - a.oz).toFixed(2), y1: +bb.y1.toFixed(2) } : null;
          };
          return { eau: rel(b.eau), remblais: rel(b.remblais), sol: rel(b.inaccessible), rideau: rel(b.rideau),
            rideaux: e.rideaux.map(function (q) { return +(q[0] - a.ox - 200).toFixed(2); }),
            faces: e.facesRemblais, hauteur: e.hauteur, masques: e.poiMasques,
            poi: e.panneaux.filter(function (q) { return /v3d/.test(q.nom); }).map(function (q) {
              return { nom: q.nom, visible: q.visible, z: +(q.z - a.oz).toFixed(2), depthTest: q.depthTest };
            }) };
        });
      }, { dep: pt(200, 5, 0, 90), ox: G.ox, oz: G.oz });
      const dans = function (bb, x0, x1) {
        return !!bb && bb.z0 >= -1.26 && bb.z1 <= 1.26 && bb.x0 >= x0 - 0.01 && bb.x1 <= x1 + 0.01;
      };
      verifier(dans(zp.eau, 2, 4) && dans(zp.remblais, 6, 8) && dans(zp.sol, 10, 11) &&
        Math.abs(zp.remblais.y1 - zp.hauteur * 0.6) < 0.01 && zp.faces === 2,
        "zones coupées au tube (2,5 m) : eau, remblais à 60 % (faces vers la galerie seulement), inaccessible", zp);
      verifier(zp.rideaux.length === 2 && zp.rideaux.indexOf(10) >= 0 && zp.rideaux.indexOf(11) >= 0 &&
        dans(zp.rideau, 10, 11), "inaccessible : un rideau en travers du tube à chaque bord qui coupe l'axe", zp.rideaux);
      const p2 = zp.poi.filter(function (q) { return q.nom === "POI 2 m v3d"; })[0];
      const p5 = zp.poi.filter(function (q) { return q.nom === "POI 5 m v3d"; })[0];
      verifier(!!p2 && p2.visible && Math.abs(p2.z - 1.17) < 0.02 && p2.depthTest === false &&
        !!p5 && p5.visible && Math.abs(p5.z - 1.17) < 0.02 &&
        !zp.poi.some(function (q) { return q.nom === "POI 25 m v3d"; }) && zp.masques >= 1,
        "POI à 2 et 5 m de l'axe : visibles, ramenés contre la paroi ; POI à 25 m : masqué", zp.poi);
      await capture(page, "galerie-zones");

      // Hauteur ⛏️ en mode galerie : tubes, plafond, remblais à 60 % et rideaux refaits à 3 m ; relue à la réouverture.
      const hg = await page.evaluate(function (a) {
        const K = window.KtaVue3D, r = {};
        return K.ouvrir({ depart: a.dep }).then(function () {
          const e0 = K.etat();
          r.v = K.reglerHauteur(3);
          const e = K.etat(), b = e.boites;
          r.rendu = e.rendu; r.hauteur = e.hauteur; r.pref = window.getPlanHauteurGalerie();
          r.y = { parois: b.parois && b.parois.y1, plafond: b.plafond && b.plafond.y1,
            remblais: b.remblais && b.remblais.y1, rideau: b.rideau && b.rideau.y1 };
          r.rideaux = e.rideaux.length; r.faces = e.facesRemblais;
          r.garde = e.pos.x === e0.pos.x && e.pos.y === e0.pos.y && e.cap === e0.cap;
          return K.fermer();
        }).then(function () { return K.ouvrir({ depart: a.dep }); }).then(function () {
          r.rouvert = K.etat().hauteur;
          return K.fermer();
        }).then(function () {
          const k = "myktamap_plan_prefs_" + window._currentLoadedPlanId;
          const pr = JSON.parse(localStorage.getItem(k) || "{}");
          delete pr.hauteurGalerieM;
          localStorage.setItem(k, JSON.stringify(pr));
          return r;
        });
      }, { dep: pt(200, 5, 0, 90) });
      const pres = function (v, att) { return typeof v === "number" && Math.abs(v - att) < 1e-6; };
      verifier(hg.v === 3 && hg.rendu === "galerie" && hg.pref === 3 && hg.garde && pres(hg.y.parois, 3) &&
        pres(hg.y.plafond, 3) && pres(hg.y.remblais, 1.8) && pres(hg.y.rideau, 3) && hg.rideaux === 2 && hg.faces === 2,
        "galerie : réglé à 3 m, parois, plafond et rideaux à 3 m, remblais à 1,8 m, position et cap gardés", hg);
      verifier(hg.rouvert === 3, "galerie : 3 m relus à la réouverture", hg.rouvert);

      // ── Filtres partagés : ≡ ouvre le ≡ Filtres de la carte ; masquer d'un côté masque de l'autre ──────────────
      // Calque de données fictif (une zone d'effondrement au bout du cul-de-sac), itinéraire, et un pilier pour le
      // rendu structures. Collisions et itinéraire ne suivent aucun filtre.
      await page.evaluate(function (a) {
        window.__v3dRoutes = window.getRoads();
        window.setRoads(window.__v3dRoutes.concat([{ uid: "rd_v3d_iti", type: "itinerary", level: 0,
          points: [a.it0, a.it1] }]));
        const g = L.layerGroup().addTo(window.map);
        window.dataLayerGroups.v3d_calque = g;
        window.__v3dZonesEmb = window.getAllEmbeddedZones;
        window.getAllEmbeddedZones = function () {
          return [{ type: "effondrement", level: 0, layerId: "v3d_calque", points: a.calque }];
        };
        window.setStructures([{ uid: "st_v3d_f", type: "pilier-1", level: 0, points: a.pilier }]);
        window.KtaGalerie.invalider();
        return window.KtaVue3D.ouvrir({ depart: a.dep }).then(function () { window.KtaVue3D.basculerRendu("galerie"); });
      }, { dep: pt(200, 5, 0, 90), it0: pt(200, 1, 0), it1: pt(200, 12, 0),
        calque: [pt(200, 12, -3), pt(200, 13, -3), pt(200, 13, 3), pt(200, 12, 3)],
        pilier: [pt(200, 6, -5), pt(200, 7, -5), pt(200, 7, -4), pt(200, 6, -4)] });
      const f0 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { rendu: e.rendu, zones: e.zonesDecoupees, liseres: e.liseres, rubans: e.rubans,
          panneaux: e.panneaux.length, pastille: e.filtres.pastille };
      });
      await page.locator('#kta-vue3d [data-v3d="filtres"]').click();
      await page.waitForTimeout(200);
      const f1 = await page.evaluate(function () {
        const fp = document.getElementById("kta-fp-modal"), e = window.KtaVue3D.etat();
        return { panneau: !!fp, ouvert: e.filtres.panneauOuvert, dessus: e.recouverte, vue: e.ouvert,
          ancien: !!document.querySelector("#kta-vue3d [data-v3d-aff], #kta-vue3d .kta-v3d-affichage"),
          calque: !!(fp && fp.querySelector('[data-data-layer="v3d_calque"]')) };
      });
      verifier(f0.rendu === "galerie" && f0.zones.eau > 0 && f0.zones.effondrement > 0 && f0.liseres.principal > 0 &&
        f0.rubans.itinerary > 0 && f0.panneaux > 0 && !f0.pastille, "galerie : zones (calque compris), liserés, " +
        "itinéraire et POI dessinés, ≡ sans pastille", f0);
      verifier(f1.panneau && f1.ouvert && f1.dessus && f1.vue && !f1.ancien && f1.calque,
        "≡ de la vue : le panneau ≡ Filtres de la carte, au-dessus de la 3D (plus de panneau propre à la 3D)", f1);
      await capture(page, "filtres-dans-la-3d");
      await page.evaluate(function () {
        ['[data-set="zoneTypes"][data-type="eau"]', '[data-set="roadTypes"][data-type="principal"]',
          '[data-set="tags"][data-type="danger"]', '[data-data-layer="v3d_calque"]'].forEach(function (q) {
          document.querySelector("#kta-fp-modal " + q).click();
        });
      });
      await page.waitForTimeout(400);
      const f2 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), f = window._ktaRuntimeFilters;
        return { zones: e.zonesDecoupees, liseres: e.liseres, rubans: e.rubans,
          danger: e.panneaux.some(function (q) { return /POI [25] m v3d/.test(q.nom); }),
          eau2D: f.zoneTypes instanceof Set && !f.zoneTypes.has("eau"),
          principal2D: f.roadTypes instanceof Set && !f.roadTypes.has("principal"),
          danger2D: f.tags instanceof Set && !f.tags.has("danger"),
          calque2D: window.map.hasLayer(window.dataLayerGroups.v3d_calque),
          pastille: e.filtres.pastille, pastille2D: document.querySelector(".kta-filter-ctrl a").classList.contains(
            "kta-filter-ctrl-actif") };
      });
      verifier(!f2.zones.eau && !f2.zones.effondrement && f2.eau2D && !f2.calque2D,
        "zone « eau » et calque décochés dans ≡ : retirés de la 3D ET de la carte", f2);
      verifier(!f2.liseres.principal && f2.principal2D && f2.rubans.itinerary > 0,
        "type de tracé décoché : liseré retiré en 3D et en 2D ; l'itinéraire reste (son propre interrupteur)", f2);
      verifier(!f2.danger && f2.danger2D, "tag « danger » décoché : panneaux retirés en 3D et en 2D", f2);
      verifier(f2.pastille && f2.pastille2D, "pastille de filtre actif sur le ≡ de la vue comme sur celui de la carte", f2);
      // Échap : le panneau ≡ se ferme, la vue reste.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      const f3 = await page.evaluate(function (a) {
        const K = window.KtaVue3D, r = { panneau: !!document.getElementById("kta-fp-modal"), vue: K.etat().ouvert };
        // Collision : le bout du cul-de-sac (tracé principal masqué) arrête toujours.
        K.placer(a.bout.x, a.bout.y, 90);
        for (let i = 0; i < 20; i++) K.avancer(1);
        r.avance = (K.etat().pos.x - a.bout.x) / a.sc;
        return r;
      }, { bout: pt(0, 5, 0, 90), sc: G.sc });
      verifier(!f3.panneau && f3.vue, "Échap avec ≡ ouvert : le panneau se ferme, la vue reste", f3);
      verifier(f3.avance > 4 && f3.avance < 8, "tracé masqué : le bout du tube arrête toujours (" +
        f3.avance.toFixed(2) + " m sur 20)", f3.avance);
      // Inversement : filtres remis depuis la carte (« Tout afficher » du ≡ Filtres) → la 3D les suit.
      await page.evaluate(function (d) { window.KtaVue3D.placer(d.x, d.y, 90); window.FilterPanel.ouvrir(); },
        pt(200, 5, 0, 90));
      await page.locator("#kta-fp-reset-all").click();
      await page.waitForTimeout(400);
      await page.evaluate(function () { window.FilterPanel.fermer(); });
      const f4 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { zones: e.zonesDecoupees, liseres: e.liseres, pastille: e.filtres.pastille,
          danger: e.panneaux.some(function (q) { return /POI [25] m v3d/.test(q.nom); }) };
      });
      verifier(f4.zones.eau > 0 && f4.zones.effondrement > 0 && f4.liseres.principal > 0 && f4.danger && !f4.pastille,
        "« Tout afficher » sur la carte : zone, calque, liseré et POI reviennent en 3D, pastille éteinte", f4);
      // Structures : un type masqué depuis la carte (FilterPanel.setFilters) disparaît de la 3D, la butée reste.
      const f5 = await page.evaluate(function (a) {
        const K = window.KtaVue3D, r = {}, acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };   // image de collision du plan hors jeu ici
        K.basculerRendu("structures");
        r.rendu = K.etat().rendu;
        r.avant = K.etat().compte.structures;
        window.FilterPanel.setFilters({ structTypes: new Set(["mur"]) });
        return new Promise(function (res) { setTimeout(res, 300); }).then(function () {
          r.apres = K.etat().compte.structures;
          K.placer(a.dep.x, a.dep.y, 0);
          for (let i = 0; i < 20; i++) K.avancer(0.25);
          r.nord = (a.dep.y - K.etat().pos.y) / a.sc;
          window.FilterPanel.setFilters({ structTypes: null });
          return new Promise(function (res) { setTimeout(res, 300); });
        }).then(function () {
          r.retour = K.etat().compte.structures;
          K.basculerRendu("galerie");
          window.ktaEstAccessible = acc;
          return r;
        });
      }, { dep: pt(200, 6.5, -2.5), sc: G.sc });
      verifier(f5.rendu === "structures" && f5.avant === 1 && f5.apres === 0 && f5.retour === 1,
        "structures : pilier masqué par les filtres de la carte → retiré de la 3D, puis rendu", f5);
      verifier(f5.nord > 0.3 && f5.nord < 1.5, "pilier masqué : la butée reste (arrêt à " + f5.nord.toFixed(2) +
        " m du départ, face à 1,5 m)", f5);
      // Niveaux visibles (plan multi-niveau) : le niveau de la vue décoché sur la carte → plus rien dessiné.
      const f6 = await page.evaluate(function () {
        const c = window.APP_CONFIG;
        if (c.multiLevel !== true) return null;
        const avant = c.visibleLevels.slice(), K = window.KtaVue3D;
        c.visibleLevels = c.availableLevels.filter(function (l) { return l !== 0; });
        window.appliquerFiltreNiveau();
        return new Promise(function (res) { setTimeout(res, 300); }).then(function () {
          const e = K.etat(), r = { zones: e.compte.zones, pastille: e.filtres.pastille };
          c.visibleLevels = avant;
          window.appliquerFiltreNiveau();
          return new Promise(function (res) { setTimeout(res, 300); }).then(function () {
            r.retour = K.etat().compte.zones;
            return r;
          });
        });
      });
      if (f6) {
        verifier(f6.zones === 0 && f6.pastille && f6.retour > 0,
          "niveau 0 masqué sur la carte : rien de dessiné en 3D, pastille ; remis : la 3D le redessine", f6);
      } else {
        console.log("  ℹ️ plan à un niveau : filtre de niveaux non joué");
      }
      await page.evaluate(function () {
        window.map.removeLayer(window.dataLayerGroups.v3d_calque);
        delete window.dataLayerGroups.v3d_calque;
        window.getAllEmbeddedZones = window.__v3dZonesEmb;
        window.setStructures([]);
        window.setRoads(window.__v3dRoutes);
        window.KtaGalerie.invalider();
        return window.KtaVue3D.fermer();
      });

      // ── 9. Passage de niveau 🪜 (POI jonction, tracé jonction) ; carte placée à la sortie ─────────────────
      if (G.multi) {
        const j1 = await page.evaluate(function (a) {
          window.startTracking();
          window.recalerTrackerSurPoint(a.tracker.x, a.tracker.y, 0);
          return window.KtaVue3D.ouvrir({ depart: a.pres }).then(function () {
            return new Promise(function (r) { setTimeout(function () { r(window.KtaVue3D.etat()); }, 200); });
          });
        }, { tracker: pt(0, -10, 0), pres: pt(0, -7, 0, 90) });
        verifier(j1.mode === "libre" && j1.passage.visible && j1.passage.haut === 1 && j1.passage.bas === null,
          "à 1 m d'un POI jonction (niveaux 0 et +1) : 🪜 ▲ montré", j1.passage);
        await capture(page, "galerie-passage");
        await page.locator('#kta-vue3d [data-v3d="niveauHaut"]').click();
        const j2 = await page.evaluate(function (a) {
          const e = window.KtaVue3D.etat(), tr = window.getTrackingPosition();
          return { niveau: e.niveau, cap: e.cap, pos: e.pos, aretes: e.compte.aretes, bas: e.passage.bas,
            actif: window.APP_CONFIG.activeLevel, trNiveau: window.getTrackerLevel(),
            trBouge: Math.hypot(tr.x - a.tracker.x, tr.y - a.tracker.y), acc: a.acc };
        }, { tracker: pt(0, -10, 0), acc: pt(0, -8, -6) });
        verifier(j2.niveau === 1 && Math.abs(j2.cap - 90) < 0.01 && Math.hypot(j2.pos.x - j2.acc.x, j2.pos.y - j2.acc.y) < 0.01 &&
          j2.aretes === 2 && j2.bas === 0, "▲ : niveau +1, à l'accroche validée, cap gardé, scène refaite", j2);
        verifier(j2.actif === 0 && j2.trNiveau === 0 && j2.trBouge < 0.01,
          "passage : le tracker et le niveau de la carte 2D ne bougent pas", j2);
        const j3 = await page.evaluate(function (a) {
          const K = window.KtaVue3D, r = {};
          r.bas = K.changerNiveau("bas"); r.n0 = K.etat().niveau; r.pos0 = K.etat().pos;
          K.placer(a.A.x, a.A.y, 0);
          r.hautTrace = K.changerNiveau("haut"); r.n1 = K.etat().niveau; r.pos1 = K.etat().pos;
          r.basTrace = K.changerNiveau("bas"); r.n2 = K.etat().niveau; r.pos2 = K.etat().pos;
          window.__v3dCap2 = window.getPlanRelHeading;
          window.getPlanRelHeading = function () { return 90; };
          K.suivre();
          return new Promise(function (res) {
            setTimeout(function () {
              const e = K.etat();
              r.suivi = { mode: e.mode, niveau: e.niveau, boite: e.passage.visible };
              K.basculerSuivi();
              window.getPlanRelHeading = window.__v3dCap2;
              res(r);
            }, 300);
          });
        }, { A: pt(50, 8, 0), B: pt(50, 8, -6) });
        const B = pt(50, 8, -6), A = pt(50, 8, 0);
        verifier(j3.bas && j3.n0 === 0 && j3.hautTrace && j3.n1 === 1 && Math.hypot(j3.pos1.x - B.x, j3.pos1.y - B.y) < 0.01 &&
          j3.basTrace && j3.n2 === 0 && Math.hypot(j3.pos2.x - A.x, j3.pos2.y - A.y) < 0.01,
          "▼ revient ; tracé jonction pris dans les deux sens, d'un bout à l'autre", j3);
        verifier(j3.suivi.mode === "suivi" && j3.suivi.niveau === 0 && !j3.suivi.boite,
          "en suivi : niveau du tracker, pas de 🪜", j3.suivi);
        // Toucher le panneau du POI jonction, à 3,5 m (hors de portée du bouton) : sa fiche, avec le bouton de passage.
        await page.evaluate(function (a) { window.KtaVue3D.placer(a.x, a.y, 90); }, pt(0, -11.5, 0));
        await page.waitForTimeout(300);
        const vise = await page.evaluate(function () {
          const q = window.KtaVue3D.etat().panneaux.filter(function (p) { return p.jonction && p.visible; })[0];
          return q ? q.ecran : null;
        });
        if (vise) await page.mouse.click(vise.x, vise.y);
        await page.waitForTimeout(200);
        const j4f = await page.evaluate(function () {
          const e = window.KtaVue3D.etat();
          return { niveau: e.niveau, fiche: e.fiche, attendu: window.I18n.t("vue3d.ficheMonter",
            { n: window.ktaFormatNiveau(1), moyen: window.I18n.t("vue3d.moyen.escalier") }) };
        });
        verifier(!!vise && j4f.niveau === 0 && !!j4f.fiche && j4f.fiche.passages.length === 1 &&
          j4f.fiche.passages[0] === j4f.attendu,
          "toucher le panneau du POI jonction : sa fiche, avec « ▲ Monter au niveau +1 (escalier) »", { vise: vise, j4f: j4f });
        await capture(page, "fiche-poi-jonction");
        await page.locator("#kta-vue3d [data-v3d-passage]").first().click();
        await page.waitForTimeout(200);
        const j4 = await page.evaluate(function () {
          const e = window.KtaVue3D.etat(); return { niveau: e.niveau, pos: e.pos, fiche: e.fiche };
        });
        const acc = pt(0, -8, -6);
        verifier(j4.niveau === 1 && Math.hypot(j4.pos.x - acc.x, j4.pos.y - acc.y) < 0.01 && !j4.fiche,
          "bouton de la fiche : passage au niveau +1, à l'accroche, fiche fermée", j4);
        // Fermer : « Je suis ici ? » parle du niveau ; Non → tracker inchangé, carte au niveau et à la place de la 3D.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        const q1 = await page.evaluate(function () {
          const b = document.getElementById("kta-confirm-oui");
          return { texte: b ? b.closest(".kta-readme-modal-boite").textContent : "",
            attendu: window.I18n.t("vue3d.jeSuisIci.texteNiveau", { n: window.ktaFormatNiveau(1) }) };
        });
        verifier(q1.texte.indexOf(q1.attendu) >= 0, "fermeture sur un autre niveau : « Je suis ici ? » le dit", q1);
        await page.locator("#kta-confirm-non").click();
        await page.waitForTimeout(200);
        const carte1 = await page.evaluate(function (a) {
          const c = window.map.getCenter(), tr = window.getTrackingPosition();
          return { actif: window.APP_CONFIG.activeLevel, lat: c.lat, lng: c.lng, attendu: window.convertCoord(a.acc.x, a.acc.y),
            trNiveau: window.getTrackerLevel(), trBouge: Math.hypot(tr.x - a.tracker.x, tr.y - a.tracker.y) };
        }, { acc: acc, tracker: pt(0, -10, 0) });
        verifier(carte1.actif === 1 && Math.abs(carte1.lat - carte1.attendu[0]) < 1 && Math.abs(carte1.lng - carte1.attendu[1]) < 1 &&
          carte1.trNiveau === 0 && carte1.trBouge < 0.01,
          "« Non » : tracker inchangé, la carte 2D passe au niveau +1 et se centre sur la position 3D", carte1);
        // « Oui » : le tracker est recalé là ET sur ce niveau.
        await page.evaluate(function (a) {
          window.ktaSetActiveLevel(0);
          return window.KtaVue3D.ouvrir({ depart: a }).then(function () { window.KtaVue3D.changerNiveau("haut"); });
        }, pt(0, -7, 0, 90));
        await page.locator('#kta-vue3d [data-v3d="fermer"]').click();
        await page.waitForTimeout(200);
        await page.locator("#kta-confirm-oui").click();
        await page.waitForTimeout(300);
        const oui = await page.evaluate(function (a) {
          const tr = window.getTrackingPosition();
          return { trNiveau: window.getTrackerLevel(), d: Math.hypot(tr.x - a.x, tr.y - a.y), actif: window.APP_CONFIG.activeLevel };
        }, acc);
        verifier(oui.trNiveau === 1 && oui.d < 0.01 && oui.actif === 1,
          "« Oui » : tracker recalé à l'accroche et au niveau +1, carte au niveau +1", oui);
        // Suivi sans déplacement : la carte se centre sur le tracker.
        const suiviCarte = await page.evaluate(function () {
          return window.KtaVue3D.ouvrir().then(function () {
            const e = window.KtaVue3D.etat();
            return window.KtaVue3D.fermer().then(function () {
              const c = window.map.getCenter(), tr = window.getTrackingPosition(), att = window.convertCoord(tr.x, tr.y);
              return { mode: e.mode, dLat: Math.abs(c.lat - att[0]), dLng: Math.abs(c.lng - att[1]) };
            });
          });
        });
        verifier(suiviCarte.mode === "suivi" && suiviCarte.dLat < 1 && suiviCarte.dLng < 1,
          "fermeture en suivi sans déplacement : la carte se centre sur le tracker", suiviCarte);
        await page.evaluate(function () { window.stopTracking(); window.ktaSetActiveLevel(0); });
      } else {
        console.log("  ℹ️ plan à un niveau : passages 🪜 non joués");
      }
      // Libre, quelques mètres, fermer (sans tracker, pas de question) : la carte se centre sur la position 3D.
      const carte2 = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a }).then(function () {
          window.KtaVue3D.avancer(1); window.KtaVue3D.avancer(1); window.KtaVue3D.avancer(1);
          const p = window.KtaVue3D.etat().pos;
          return window.KtaVue3D.fermer().then(function () {
            const c = window.map.getCenter(), att = window.convertCoord(p.x, p.y);
            return { avance: Math.hypot(p.x - a.x, p.y - a.y) / window.APP_CONFIG.scale,
              dLat: Math.abs(c.lat - att[0]), dLng: Math.abs(c.lng - att[1]) };
          });
        });
      }, pt(0, -8, 0, 90));
      verifier(carte2.avance > 2.9 && carte2.dLat < 1 && carte2.dLng < 1,
        "libre, 3 m puis fermer : la carte 2D est centrée sur la position 3D", carte2);

      // ── 10. Guidage en 3D, fiche d'un POI, « Y aller » depuis la 3D (QCM du 02/11/2026) ─────────────────
      // Sur le T fictif (principal est-ouest, secondaire vers le sud depuis son milieu). Itinéraire tracé PENDANT la
      // vue, comme depuis 🚨 : la scène le montre ; bandeau (aperçu en libre, consigne réelle en suivi) ; chevrons.
      const POIS_V3D = [
        Object.assign({ id: "Salle v3d", nom: "Salle v3d", uid: "pt_v3d_salle", level: 0, tags: ["salle"] }, pt(0, 7, 0.6)),
        Object.assign({ id: "Salle haut v3d", nom: "Salle haut v3d", uid: "pt_v3d_haut", level: 1, tags: ["salle"] },
          pt(0, 4, -5.4))
      ];
      await page.evaluate(function (pois) {
        window.__v3dPointsAvant = window.getEditorPoints().slice();
        window.setEditorPoints(window.__v3dPointsAvant.concat(pois));
        window.setRoads(window.getRoads().filter(function (r) { return r.type !== "itinerary"; }));
        if (window.getTrackingActif()) window.stopTracking();
        window.ktaSetActiveLevel(0);
        try { localStorage.removeItem("myktamap_guidage_v1"); } catch (err) { /* réglage « Auto » par défaut */ }
      }, POIS_V3D);
      // Attend un itinéraire différent de `avant` (référence des points), puis une image de la vue.
      const attendreIti = async function () {
        await attendre(page, function () {
          const r = (window.getRoads() || []).find(function (x) { return x && x.type === "itinerary"; });
          return !!r && r.points !== window.__v3dItiAvant;
        }, 15000).catch(function () {});
        await page.waitForTimeout(500);
      };
      const noterIti = function () {
        return page.evaluate(function () {
          const r = (window.getRoads() || []).find(function (x) { return x && x.type === "itinerary"; });
          window.__v3dItiAvant = r ? r.points : null;
        });
      };
      const ga0 = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a }).then(function () {
          const e = window.KtaVue3D.etat();
          return { rubans: e.rubans.itinerary || 0, bandeau: e.bandeau.affiche, chevrons: e.chevrons, mode: e.mode };
        });
      }, pt(0, -10, 0, 90));
      verifier(ga0.mode === "libre" && !ga0.rubans && !ga0.bandeau && !ga0.chevrons,
        "sans itinéraire : ni ruban, ni bandeau, ni chevrons", ga0);
      await noterIti();
      await page.evaluate(function (a) {
        window.itineraireYAller(a.c.x, a.c.y, "Cible v3d", { origine: { x: a.o.x, y: a.o.y, level: 0 } });
      }, { c: pt(0, 0, 10), o: pt(0, -10, 0) });
      await attendreIti();
      const ga1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), b = document.querySelector("#kta-vue3d .kta-v3d-bandeau");
        const ap = window.ItiGuidage.apercu(e.pos, { cap: e.cap });
        return { rubans: e.rubans.itinerary || 0, bandeau: e.bandeau, chevrons: e.chevrons, visibles: e.chevronsVisibles,
          marque: !!(b && b.querySelector(".kta-v3d-guid-apercu")), attendu: ap.principal,
          texte: b ? b.textContent : "",
          haut: document.querySelector("#kta-vue3d .kta-v3d-haut").getBoundingClientRect().bottom,
          bTop: b ? b.getBoundingClientRect().top : 0 };
      });
      verifier(ga1.rubans > 0, "itinéraire tracé pendant la vue : la scène le montre (kta:itineraireChange)", ga1.rubans);
      verifier(ga1.bandeau.affiche && ga1.bandeau.apercu && !ga1.marque && ga1.bandeau.principal === ga1.attendu &&
        ga1.attendu && ga1.texte.indexOf(ga1.attendu) >= 0 && ga1.bTop >= ga1.haut,
        "libre : bandeau sous la rangée du haut, consigne d'aperçu, sans marque « Aperçu »", ga1);
      verifier(ga1.chevrons > 0 && ga1.visibles, "chevrons au sol sur le ruban (" + ga1.chevrons + ")", ga1);
      await capture(page, "guidage-apercu");
      // Le bandeau ne descend pas à chaque relecture (il se cale sous la rangée seule).
      const stableB = await page.evaluate(function () {
        const b = document.querySelector("#kta-vue3d .kta-v3d-bandeau"), t0 = b.getBoundingClientRect().top;
        window.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("resize"));
        return Math.abs(b.getBoundingClientRect().top - t0);
      });
      verifier(stableB < 1, "bandeau à la même place après deux redimensionnements", stableB);
      // Suivi : la consigne réelle du tracker (celle du bandeau 2D, ItiGuidage.etat()), sans la marque.
      const ga2 = await page.evaluate(function (a) {
        window.startTracking();
        window.recalerTrackerSurPoint(a.x, a.y, 0);
        window.__v3dCapG = window.getPlanRelHeading;
        window.getPlanRelHeading = function () { return 90; };
        window.KtaVue3D.suivre();
        window.ItiGuidage.rafraichir();
        return new Promise(function (r) {
          setTimeout(function () {
            const e = window.KtaVue3D.etat(), st = window.ItiGuidage.etat();
            r({ mode: e.mode, bandeau: e.bandeau, reel: st.visible ? st.principal : null, chevrons: e.chevrons });
          }, 1300);
        });
      }, pt(0, -10, 0));
      verifier(ga2.mode === "suivi" && ga2.bandeau.affiche && !ga2.bandeau.apercu && ga2.reel &&
        ga2.bandeau.principal === ga2.reel && ga2.chevrons > 0, "suivi : la consigne réelle du guidage, sans « Aperçu »", ga2);
      // Toucher un panneau de POI → sa fiche de la carte (sans ✏️ / 🗑️ : la carte est dessous). Le POI jonction
      // reste derrière (le toucher d'un POI jonction garde son passage 🪜).
      await page.evaluate(function (a) {
        window.KtaVue3D.basculerSuivi();
        window.KtaVue3D.placer(a.x, a.y, 90);
      }, pt(0, 1, 0, 90));
      await page.waitForTimeout(400);
      const visePoi = async function (nom) {
        return page.evaluate(function (n) {
          const q = window.KtaVue3D.etat().panneaux.filter(function (p) { return p.nom === n && p.visible; })[0];
          return q ? q.ecran : null;
        }, nom);
      };
      let viseP = await visePoi("Salle v3d");
      if (viseP) await page.mouse.click(viseP.x, viseP.y);
      await page.waitForTimeout(300);
      const fi1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat(), f = document.querySelector("#kta-vue3d .kta-v3d-fiche");
        return { fiche: e.fiche, aller: !!(f && f.querySelector(".kta-popup-point .kta-popup-btn-aller")),
          ici: !!(f && f.querySelector(".kta-popup-btn-here")), etape: !!(f && f.querySelector(".kta-popup-btn-add")),
          favori: !!(f && f.querySelector(".kta-popup-btn-fav")), edition: !!(f && f.querySelector(".kta-popup-btn-edit, .kta-popup-btn-delete")),
          niveau: e.niveau };
      });
      verifier(!!viseP && fi1.fiche && fi1.fiche.nom === "Salle v3d" && fi1.aller && fi1.ici && fi1.etape && fi1.favori &&
        !fi1.edition, "toucher le panneau d'un POI : sa fiche de la carte (Y aller, Je suis ici, étape, favori)", fi1);
      await capture(page, "fiche-poi");
      await page.keyboard.press("Escape");
      const fi2 = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { ouvert: e.ouvert, fiche: e.fiche }; });
      verifier(fi2.ouvert && !fi2.fiche, "Échap ferme d'abord la fiche, la vue reste", fi2);
      // « Y aller » de la fiche, mode libre, tracker actif : départ de la position 3D (niveau compris), tracker non
      // recalé. Sur un plan multi-niveau, on passe au niveau 1 par le POI jonction avant.
      const hautN = G.multi;
      const BB = hautN ? pt(0, -2, -6, 90) : pt(0, 1, 0, 90);
      await page.evaluate(function (a) {
        const K = window.KtaVue3D;
        if (a.hautN) { K.placer(a.pres.x, a.pres.y, 90); K.changerNiveau("haut"); }
        K.placer(a.BB.x, a.BB.y, 90);
      }, { hautN: hautN, pres: pt(0, -7, 0, 90), BB: BB });
      await page.waitForTimeout(400);
      viseP = await visePoi(hautN ? "Salle haut v3d" : "Salle v3d");
      if (viseP) await page.mouse.click(viseP.x, viseP.y);
      await page.waitForTimeout(300);
      await noterIti();
      const trAvant = await page.evaluate(function () { return { p: window.getTrackingPosition(), n: window.getTrackerLevel() }; });
      await page.locator("#kta-vue3d .kta-v3d-fiche .kta-popup-btn-aller").click();
      await page.waitForTimeout(300);
      if (await page.locator("#kta-iti-confirm-ok").count()) await page.locator("#kta-iti-confirm-ok").click();
      await attendreIti();
      const ya1 = await page.evaluate(function () {
        const r = window.getRoads().find(function (x) { return x && x.type === "itinerary"; });
        const e = window.KtaVue3D.etat();
        return { wp0: r && r.waypoints[0], p0: r && r.points[0], pos: e.pos, niveau: e.niveau, fiche: e.fiche,
          tr: window.getTrackingPosition(), trN: window.getTrackerLevel(), rubans: e.rubans.itinerary || 0 };
      });
      verifier(ya1.wp0 && Math.hypot(ya1.wp0.x - BB.x, ya1.wp0.y - BB.y) < 0.5 && (hautN ? ya1.wp0.level === 1 : true) &&
        (hautN ? ya1.p0 && ya1.p0.level === 1 : true) && !ya1.fiche,
        "« Y aller » en libre : départ de la position 3D" + (hautN ? ", niveau 1 compris" : "") + ", fiche refermée", ya1);
      verifier(Math.hypot(ya1.tr.x - trAvant.p.x, ya1.tr.y - trAvant.p.y) < 0.01 && ya1.trN === trAvant.n,
        "le tracker n'est pas recalé", { avant: trAvant, apres: { p: ya1.tr, n: ya1.trN } });
      verifier(ya1.rubans > 0, "le nouvel itinéraire est dans la scène", ya1.rubans);
      // Tracker arrêté : « D'où pars-tu ? » avec « Ici » en premier ; « Ici » recale le tracker à la position 3D
      // (niveau compris) et l'itinéraire en part.
      await page.evaluate(function () { window.stopTracking(); window.getPlanRelHeading = window.__v3dCapG; });
      await page.waitForTimeout(200);
      viseP = await visePoi(hautN ? "Salle haut v3d" : "Salle v3d");
      if (viseP) await page.mouse.click(viseP.x, viseP.y);
      await page.waitForTimeout(300);
      await noterIti();
      await page.locator("#kta-vue3d .kta-v3d-fiche .kta-popup-btn-aller").click();
      await page.waitForTimeout(300);
      const qa3 = await page.evaluate(function () {
        const ov = document.getElementById("kta-iti-depart");
        return ov ? Array.from(ov.querySelectorAll("[data-kta-confirm-choix]")).map(function (r) { return r.value; }) : null;
      });
      verifier(qa3 && qa3[0] === "ici" && qa3.indexOf("derniere") > 0 && qa3.indexOf("repositionner") > 0,
        "tracker arrêté : « D'où pars-tu ? », « Ici » en premier", qa3);
      if (qa3) {
        await page.locator('#kta-iti-depart [data-kta-confirm-choix="ici"]').check();
        await page.locator("#kta-iti-depart #kta-confirm-oui").click();
        await page.waitForTimeout(300);
        if (await page.locator("#kta-iti-confirm-ok").count()) await page.locator("#kta-iti-confirm-ok").click();
        await attendreIti();
      }
      const ya2 = await page.evaluate(function () {
        const r = window.getRoads().find(function (x) { return x && x.type === "itinerary"; });
        const e = window.KtaVue3D.etat();
        return { wp0: r && r.waypoints[0], tr: window.getTrackingPosition(), trN: window.getTrackerLevel(),
          confirmee: window.getTrackingPositionEtat().confirmee, pos: e.pos, niveau: e.niveau, mode: e.mode };
      });
      verifier(ya2.wp0 && Math.hypot(ya2.wp0.x - BB.x, ya2.wp0.y - BB.y) < 0.5 && Math.hypot(ya2.tr.x - BB.x, ya2.tr.y - BB.y) < 0.01 &&
        (hautN ? ya2.trN === 1 && ya2.wp0.level === 1 : true) && ya2.confirmee,
        "« Ici » : tracker recalé à la position 3D" + (hautN ? " et au niveau 1" : "") + ", l'itinéraire en part", ya2);
      verifier(Math.hypot(ya2.pos.x - BB.x, ya2.pos.y - BB.y) < 0.01 && (hautN ? ya2.niveau === 1 : true) && ya2.mode === "libre",
        "« Ici » : la 3D ne bouge pas (elle y est déjà)", ya2);

      // ── 10b. Depuis la 3D en libre, choisir la position du tracker amène la 3D dessus ; la recaler, non ────────
      // (retour terrain : « Y aller » → « Ma dernière position » laissait la 3D où elle était ; « Je suis ici » d'une
      // fiche téléportait la 3D à la position ajustée du tracker, souvent hors de la galerie.) Fermer ensuite ne
      // demande pas « Je suis ici ? ». « Me repositionner » : picker sur la carte, la 3D se rouvre au point choisi.
      const dist = function (a, b) { return (a && b) ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity; };
      // Ferme la vue en guettant « Je suis ici ? » : une question laissée ouverte bloquerait le harnais (Non).
      const fermerSansQuestion = function () {
        return page.evaluate(function () {
          return new Promise(function (res) {
            let question = false;
            const t = setInterval(function () { if (document.getElementById("kta-confirm-oui")) question = true; }, 40);
            const garde = setTimeout(function () {
              clearInterval(t);
              const non = document.getElementById("kta-confirm-non");
              if (non) non.click();
              res({ question: true, bloquee: true });
            }, 3000);
            window.KtaVue3D.fermer().then(function (recale) {
              clearInterval(t); clearTimeout(garde);
              res({ question: question, recale: recale, ouvert: window.KtaVue3D.etat().ouvert });
            });
          });
        });
      };
      // a. « Ma dernière position » : tracker (arrêté) recalé au T du niveau 0 — depuis la 3D en libre, la place ne
      // bouge pas (règle du recalage) — puis 3D emmenée à 10 m, au niveau 1 par le POI jonction si le plan en a.
      const TR = pt(0, -10, 0);
      const pos0 = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { x: e.pos.x, y: e.pos.y }; });
      await page.evaluate(function (a) {
        window.setRoads(window.getRoads().filter(function (r) { return r.type !== "itinerary"; }));
        // Les itinéraires de cette partie changent de niveau : le POI jonction reçoit aussi son raccord du niveau 0
        // (le pathfinder ne relie un puits qu'à ses raccords validés). Remis avec les points d'avant, plus bas.
        window.setEditorPoints(window.getEditorPoints().map(function (p) {
          if (p.id !== "POI jonction v3d") return p;
          return Object.assign({}, p, { accroches: [{ level: 0, x: p.x, y: p.y }].concat(p.accroches || []) });
        }));
        window.recalerTrackerSurPoint(a.x, a.y, 0);
      }, TR);
      await page.waitForTimeout(300);
      const rc1 = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { pos: e.pos, niveau: e.niveau, mode: e.mode, bouge: e.aBouge, tr: window.getTrackingPosition() };
      });
      verifier(dist(rc1.pos, pos0) < 0.01 && dist(rc1.tr, TR) < 0.01 && rc1.mode === "libre" && !rc1.bouge,
        "recalage du tracker pendant la 3D libre : tracker recalé, la place 3D ne bouge pas", { rc1: rc1, pos0: pos0 });
      const LOIN = hautN ? pt(0, -2, -6, 90) : pt(0, 0, 0, 90);
      await page.evaluate(function (a) {
        const K = window.KtaVue3D;
        if (a.hautN) { K.placer(a.pres.x, a.pres.y, 90); K.changerNiveau("haut"); }
        K.placer(a.LOIN.x, a.LOIN.y, 90);
      }, { hautN: hautN, pres: pt(0, -7, 0, 90), LOIN: LOIN });
      await page.waitForTimeout(400);
      const av1 = await page.evaluate(function () { const e = window.KtaVue3D.etat(); return { pos: e.pos, niveau: e.niveau, cap: e.cap }; });
      verifier(Math.abs(dist(av1.pos, TR) / G.sc - 10) < 0.05 && (hautN ? av1.niveau === 1 : true) && Math.abs(av1.cap - 90) < 0.01,
        "3D emmenée à 10 m du tracker" + (hautN ? ", au niveau 1" : "") + ", cap 90", av1);
      viseP = await visePoi(hautN ? "Salle haut v3d" : "Salle v3d");
      if (viseP) await page.mouse.click(viseP.x, viseP.y);
      await page.waitForTimeout(300);
      await noterIti();
      await page.locator("#kta-vue3d .kta-v3d-fiche .kta-popup-btn-aller").click();
      await attendre(page, function () { return !!document.getElementById("kta-iti-depart"); }, 3000).catch(function () {});
      const qd = await page.locator('#kta-iti-depart [data-kta-confirm-choix="derniere"]').count();
      verifier(qd === 1, "« D'où pars-tu ? » propose « Ma dernière position »", qd);
      if (qd) {
        await page.locator('#kta-iti-depart [data-kta-confirm-choix="derniere"]').check();
        await page.locator("#kta-iti-depart #kta-confirm-oui").click();
        await page.waitForTimeout(300);
        if (await page.locator("#kta-iti-confirm-ok").count()) await page.locator("#kta-iti-confirm-ok").click();
        await attendreIti();
      }
      const md = await page.evaluate(function () {
        const r = window.getRoads().find(function (x) { return x && x.type === "itinerary"; });
        const e = window.KtaVue3D.etat();
        return { wp0: r && r.waypoints[0], pos: e.pos, niveau: e.niveau, cap: e.cap, mode: e.mode, ouvert: e.ouvert,
          tr: window.getTrackingPosition(), trN: window.getTrackerLevel(), fiche: e.fiche };
      });
      verifier(md.ouvert && md.mode === "libre" && dist(md.pos, TR) < 0.01 && (hautN ? md.niveau === 0 : true) &&
        Math.abs(md.cap - 90) < 0.01, "« Ma dernière position » : la 3D est sur le tracker" +
        (hautN ? ", à son niveau 0" : "") + ", cap gardé", md);
      verifier(md.wp0 && dist(md.wp0, TR) < 0.5 && (hautN ? md.wp0.level === 0 : true) && dist(md.tr, TR) < 0.01 &&
        (hautN ? md.trN === 0 : true), "l'itinéraire part du tracker, tracker non recalé", md);
      // b. « 📍 Je suis ici » d'une fiche ouverte en 3D, tracker ACTIF, libre à 10 m du POI : le tracker est mis dans
      // la galerie (0,6 m sous le POI), la 3D ne bouge pas ; fermer ne pose pas « Je suis ici ? ». Puis, vue fermée,
      // le même recalage pose le tracker au même point (comportement de la carte inchangé).
      const SALLE = pt(0, 7, 0.6);
      await page.evaluate(function (a) {
        window.setRoads(window.getRoads().filter(function (r) { return r.type !== "itinerary"; }));
        if (!window.getTrackingActif()) window.startTracking();
        window.KtaVue3D.placer(a.x, a.y, 90);
      }, pt(0, -3, 0, 90));
      await page.waitForTimeout(400);
      viseP = await visePoi("Salle v3d");
      if (viseP) await page.mouse.click(viseP.x, viseP.y);
      await page.waitForTimeout(300);
      const ici0 = await page.locator("#kta-vue3d .kta-v3d-fiche .kta-popup-btn-here").count();
      if (ici0) await page.locator("#kta-vue3d .kta-v3d-fiche .kta-popup-btn-here").click();
      await page.waitForTimeout(400);
      const ji = await page.evaluate(function () {
        const e = window.KtaVue3D.etat();
        return { pos: e.pos, niveau: e.niveau, mode: e.mode, fiche: e.fiche, bouge: e.aBouge, actif: window.getTrackingActif(),
          tr: window.getTrackingPosition(), trN: window.getTrackerLevel() };
      });
      // Le POI est à 0,6 m de l'axe du principal : déjà dans la galerie de la 3D, le tracker va sur lui.
      verifier(ici0 === 1 && ji.actif && ji.mode === "libre" && dist(ji.tr, SALLE) < 0.01,
        "« Je suis ici » sur un POI déjà dans la galerie : tracker sur le POI", ji);
      verifier(dist(ji.pos, pt(0, -3, 0)) < 0.01 && dist(ji.pos, ji.tr) > 1 && !ji.fiche && !ji.bouge,
        "la 3D ne bouge pas (pas de téléportation au tracker), fiche refermée", ji);
      const fq1 = await fermerSansQuestion();
      verifier(!fq1.question && fq1.recale === false && fq1.ouvert === false,
        "fermer juste après : pas de « Je suis ici ? » (on vient de dire où l'on est)", fq1);
      const ferme = await page.evaluate(function (a) {
        window.recalerTrackerSurPoint(a.x, a.y, 0, { dansGalerie: true });
        return window.getTrackingPosition();
      }, SALLE);
      verifier(dist(ferme, ji.tr) < 0.01, "vue fermée : « Je suis ici » pose le tracker au même point", ferme);
      // Suivi (décision produit) : « Je suis ici » (recalage `dansGalerie`, celui du bouton de la fiche) passe la vue
      // en libre à cet instant, sans la bouger ; toast success ; le tracker est recalé (POI à 3 m de l'axe → sur
      // l'axe). Le bouton du suivi la ramène ensuite au tracker.
      const suivi = await page.evaluate(function (a) {
        const K = window.KtaVue3D, G = window.OOMGuard, show = G.showToast, toasts = [];
        G.showToast = function (t, type) { toasts.push({ t: t, type: type }); return show.apply(G, arguments); };
        const att = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        return K.ouvrir({}).then(function () {
          K.suivre();
          return att(400);
        }).then(function () {
          const e0 = K.etat(), avant = { x: e0.pos.x, y: e0.pos.y, mode: e0.mode, niveau: e0.niveau };
          window.recalerTrackerSurPoint(a.ici.x, a.ici.y, 0, { dansGalerie: true });
          const e1 = K.etat(), tout = { x: e1.pos.x, y: e1.pos.y, mode: e1.mode };
          return att(400).then(function () {
            const e = K.etat(), r = { avant: avant, tout: tout, apres: { x: e.pos.x, y: e.pos.y, mode: e.mode,
              niveau: e.niveau, bouge: e.aBouge }, tr: window.getTrackingPosition(), toasts: toasts.slice(),
              texte: window.I18n.t("vue3d.libreApresRecalage") };
            K.basculerSuivi();
            return att(500).then(function () {
              const e2 = K.etat();
              r.retour = { x: e2.pos.x, y: e2.pos.y, mode: e2.mode };
              G.showToast = show;
              return K.fermer().then(function () { return r; });
            });
          });
        });
      }, { ici: pt(0, -10, 3) });
      verifier(suivi.avant.mode === "suivi" && suivi.tout.mode === "libre" && suivi.apres.mode === "libre",
        "suivi : « Je suis ici » passe la vue en libre à cet instant", suivi);
      verifier(dist(suivi.apres, suivi.avant) < 0.01 && dist(suivi.tout, suivi.avant) < 0.01 &&
        suivi.apres.niveau === suivi.avant.niveau && !suivi.apres.bouge,
        "suivi : la position 3D ne change pas (ni tout de suite, ni aux images suivantes), niveau gardé", suivi);
      verifier(dist(suivi.tr, pt(0, -10, 0)) < 0.01, "suivi : tracker recalé dans la galerie (POI à 3 m → axe)",
        suivi.tr);
      verifier(suivi.toasts.some(function (t) { return t.type === "success" && t.t === suivi.texte; }) &&
        suivi.texte !== "vue3d.libreApresRecalage", "suivi : toast success « mode libre »", suivi.toasts);
      verifier(suivi.retour.mode === "suivi" && dist(suivi.retour, suivi.tr) < 0.01,
        "bouton du suivi : la vue repart sur le tracker recalé", suivi.retour);
      // c. « Me repositionner » : la 3D se ferme pour le picker « Où es-tu ? » ; une fois le point choisi (niveau
      // demandé si un autre niveau passe à moins de 10 m : on prend le 1), le tracker est recalé là et la 3D se
      // ROUVRE en libre, au point et au niveau choisis, cap gardé ; l'itinéraire en part ; fermer : pas de question.
      await page.evaluate(function (a) {
        window.stopTracking();
        window.ktaSetActiveLevel(0);
        return window.KtaVue3D.ouvrir({ depart: a });
      }, pt(0, -3, 0, 90));
      await page.waitForTimeout(400);
      viseP = await visePoi("Salle v3d");
      if (viseP) await page.mouse.click(viseP.x, viseP.y);
      await page.waitForTimeout(300);
      await noterIti();
      await page.locator("#kta-vue3d .kta-v3d-fiche .kta-popup-btn-aller").click();
      await attendre(page, function () { return !!document.getElementById("kta-iti-depart"); }, 3000).catch(function () {});
      const qr = await page.locator('#kta-iti-depart [data-kta-confirm-choix="repositionner"]').count();
      if (qr) {
        await page.locator('#kta-iti-depart [data-kta-confirm-choix="repositionner"]').check();
        await page.locator("#kta-iti-depart #kta-confirm-oui").click();
      }
      await attendre(page, function () {
        return !window.KtaVue3D.etat().ouvert && window.ktaDemanderPositionCarte.estActif();
      }, 5000).catch(function () {});
      const pk0 = await page.evaluate(function () {
        return { ouvert: window.KtaVue3D.etat().ouvert, picker: window.ktaDemanderPositionCarte.estActif() };
      });
      verifier(qr === 1 && !pk0.ouvert && pk0.picker, "« Me repositionner » : la 3D se ferme, picker « Où es-tu ? » armé", pk0);
      // Point choisi : sur la galerie du niveau 1 (z = −6, à 6 m de celle du niveau 0 → niveau demandé) ; plan à un
      // niveau : au bout sud de la secondaire.
      const PK = hautN ? pt(0, 6, -6, 90) : pt(0, 0, 10, 90);
      const NPK = hautN ? 1 : 0;
      const xy = await page.evaluate(function (a) {
        window.map.setView(window.convertCoord(a.x, a.y), window.map.getZoom(), { animate: false });
        const cp = window.map.latLngToContainerPoint(window.convertCoord(a.x, a.y));
        const r = window.map.getContainer().getBoundingClientRect();
        return { cx: r.left + cp.x, cy: r.top + cp.y };
      }, PK);
      await page.mouse.click(xy.cx, xy.cy);
      await page.waitForTimeout(400);
      if (hautN) {
        const qn = await page.locator('#kta-recal-niveau [data-kta-confirm-choix="1"]').count();
        verifier(qn === 1, "picker : « Dans quel niveau es-tu ? » (niveau 1 à portée)", qn);
        if (qn) {
          await page.locator('#kta-recal-niveau [data-kta-confirm-choix="1"]').check();
          await page.locator("#kta-recal-niveau #kta-confirm-oui").click();
        }
      }
      await attendre(page, function () { return window.KtaVue3D.etat().ouvert; }, 10000).catch(function () {});
      await attendreIti();
      const rp = await page.evaluate(function () {
        const r = window.getRoads().find(function (x) { return x && x.type === "itinerary"; });
        const e = window.KtaVue3D.etat();
        return { ouvert: e.ouvert, mode: e.mode, pos: e.pos, niveau: e.niveau, cap: e.cap, wp0: r && r.waypoints[0],
          tr: window.getTrackingPosition(), trN: window.getTrackerLevel(), actif: window.APP_CONFIG.activeLevel };
      });
      // Le tap sur la carte tombe au pixel de l'écran (quelques px du plan de PK) : la référence est le tracker recalé.
      verifier(rp.ouvert && rp.mode === "libre" && dist(rp.pos, rp.tr) < 0.01 && (hautN ? rp.niveau === NPK : true) &&
        Math.abs(rp.cap - 90) < 0.01, "point choisi : la 3D se rouvre en libre, au point" + (hautN ? " et au niveau 1" : "") +
        ", cap gardé", rp);
      verifier(dist(rp.tr, PK) < 1 * G.sc && (hautN ? rp.trN === NPK : true) && rp.wp0 && dist(rp.wp0, rp.tr) < 0.5 &&
        (hautN ? rp.wp0.level === NPK : true), "tracker recalé au point choisi (à moins d'un mètre du tap), l'itinéraire en part", rp);
      const fq2 = await fermerSansQuestion();
      verifier(!fq2.question && fq2.ouvert === false, "fermer ensuite : pas de « Je suis ici ? »", fq2);
      await page.evaluate(function () {
        return window.KtaVue3D.fermer().then(function () {
          window.setRoads(window.getRoads().filter(function (r) { return r.type !== "itinerary"; }));
          window.setEditorPoints(window.__v3dPointsAvant);
          window.ktaSetActiveLevel(0);
        });
      });
      // Itinéraire multi-niveau (niveau porté par chaque point) : au −1, seul son morceau du −1 est dessiné.
      const iti = await page.evaluate(function (a) {
        const C = window.APP_CONFIG, av = { m: C.multiLevel, l: C.activeLevel }, sc = C.scale;
        C.multiLevel = true; C.activeLevel = -1;
        window.setRoads([{ type: "itinerary", points: [
          { x: a.x, y: a.y, level: 0 }, { x: a.x + 2 * sc, y: a.y, level: 0 },
          { x: a.x + 2 * sc, y: a.y + 1, level: -1 }, { x: a.x + 6 * sc, y: a.y, level: -1 },
          { x: a.x + 9 * sc, y: a.y, level: -1 }] }]);
        return window.KtaVue3D.ouvrir({ depart: a }).then(function () {
          const e = window.KtaVue3D.etat();
          const r = { niveau: e.niveau, roads: e.compte.roads };
          return window.KtaVue3D.fermer().then(function () {
            C.multiLevel = av.m; C.activeLevel = av.l; window.setRoads([]);
            return r;
          });
        });
      }, pt(0, -8, 0, 90));
      verifier(iti.niveau === -1 && iti.roads === 1,
        "itinéraire multi-niveau : au −1, son morceau du −1 est dessiné (plus d'itinéraire disparu)", iti);
      // ── 11. Mode mixte : une galerie qui débouche sur une chambre (fronts de taille et piliers), fictive ─────────
      // Galerie principale d'ouest en est (x de -30 à 22 m), branche secondaire en T à x = -15 ; chambre de x = 0 à
      // 24 m, z de -10 à 10, bordée de fronts (ouverture de 3 m à l'ouest pour la galerie), six piliers de 2 × 2 m à
      // z = ±3,5. Rendu par défaut (plan de test sans choix) : mixte.
      const MX = await page.evaluate(function () {
        const sc = window.APP_CONFIG.scale, W = window.PLAN_CONFIG.plan.imageWidth, H = window.PLAN_CONFIG.plan.imageHeight;
        window._currentLoadedPlanId = "v3d-checkup-mixte";
        const ox = W / 2 / sc, oz = H / 2 / sc, P = function (x, z) { return { x: (ox + x) * sc, y: (oz + z) * sc }; };
        window.setRoads([
          { uid: "rd_mx_p", type: "principal", level: 0, points: [P(-30, 0), P(22, 0)] },
          { uid: "rd_mx_s", type: "secondaire", level: 0, points: [P(-15, 0), P(-15, -20)] }
        ]);
        const carre = function (cx, cz, r) { return [P(cx - r, cz - r), P(cx + r, cz - r), P(cx + r, cz + r), P(cx - r, cz + r)]; };
        const st = [{ uid: "st_mx_f", type: "front-1", level: 0,
          points: [P(0, -1.5), P(0, -10), P(24, -10), P(24, 10), P(0, 10), P(0, 1.5)] }];
        [6, 12, 18].forEach(function (x) {
          [-3.5, 3.5].forEach(function (z) {
            st.push({ uid: "st_mx_" + x + "_" + z, type: "pilier-1", level: 0, points: carre(x, z, 1) });
          });
        });
        window.setStructures(st);
        window.setZones([
          { uid: "zn_mx_t", type: "eau", level: 0, points: [P(-25, -3), P(-23, -3), P(-23, 3), P(-25, 3)] },
          { uid: "zn_mx_c", type: "eau", level: 0, points: [P(14, -1), P(16, -1), P(16, 1), P(14, 1)] }
        ]);
        window.setEditorPoints([
          Object.assign({ id: "POI danger chambre v3d", level: 0, tags: ["danger"] }, P(3, 1.5)),
          Object.assign({ id: "POI danger tube v3d", level: 0, tags: ["danger"] }, P(-20, 5)),
          Object.assign({ id: "POI favori v3d", level: 0, tags: ["info"] }, P(-6, -0.5))
        ]);
        window.Favoris.add({ pointId: "POI favori v3d", nom: "POI favori v3d", x: P(-6, -0.5).x, y: P(-6, -0.5).y });
        window.KtaGalerie.invalider();
        const m = window.KtaGalerie.modele(0, true);
        return { sc: sc, ox: ox, oz: oz, pref: window.getPlanRenduVue3D(), seuil: window.KtaGalerie.SEUIL_CHAMBRE_M,
          modele: { pieces: m.pieces.length, chambres: m.chambres, ouverts: m.ouverts, dalles: m.dalles,
            ms: +m.msConstruction.toFixed(1) },
          structures: st.map(function (s) {
            return { ligne: s.type === "front-1", pts: s.points.map(function (q) { return [q.x / sc - ox, q.y / sc - oz]; }) };
          }) };
      });
      const mq = function (x, z, cap) {
        return { x: (MX.ox + x) * MX.sc, y: (MX.oz + z) * MX.sc, cap: cap === undefined ? 0 : cap };
      };
      verifier(MX.pref === null && MX.seuil === 3 && MX.modele.ouverts >= 1 && MX.modele.chambres >= 1 &&
        MX.modele.dalles === 1, "mixte : modèle (dalle du T en tube, nœuds en chambre, bout ouvert) en " + MX.modele.ms +
        " ms", MX.modele);
      const sc1 = await page.evaluate(function (a) {
        return window.KtaVue3D.ouvrir({ depart: a.dep, tuiles: false }).then(function () {
          const e = window.KtaVue3D.etat(), ps = window.KtaVue3D.parois();
          const rel = ps.map(function (s) { return [s[0] - a.ox, s[1] - a.oz, s[2] - a.ox, s[3] - a.oz]; });
          return { rendu: e.rendu, bouton: e.boutonRendu, parois: rel, yMax: e.yMax, zonesTube: e.zonesTube,
            eau: e.zonesDecoupees.eau || 0, poiTube: e.poiTube, halos: e.halos,
            panneaux: e.panneaux.map(function (q) {
              return { nom: q.nom, x: +(q.x - a.ox).toFixed(2), z: +(q.z - a.oz).toFixed(2), danger: q.danger,
                favori: q.favori, bord: q.bord, halo: q.halo,
                haloXZ: q.haloXZ ? [+(q.haloXZ[0] - a.ox).toFixed(2), +(q.haloXZ[1] - a.oz).toFixed(2)] : null };
            }) };
        });
      }, { dep: mq(-12, 0, 90), ox: MX.ox, oz: MX.oz });
      // Géométrie des parois (m, relatives) : où elles sont, et jamais à travers une structure.
      const coupe = function (s, t) {
        const dx = s[2] - s[0], dz = s[3] - s[1], ex = t[2] - t[0], ez = t[3] - t[1], d = dx * ez - dz * ex;
        if (Math.abs(d) < 1e-12) return false;
        const rx = t[0] - s[0], rz = t[1] - s[1], u = (rx * ez - rz * ex) / d, v = (rx * dz - rz * dx) / d;
        return u >= 0 && u <= 1 && v >= 0 && v <= 1;
      };
      const bords = [];
      MX.structures.forEach(function (s) {
        const n = s.pts.length, fin = s.ligne ? n - 1 : n;
        for (let i = 0; i < fin; i++) {
          const p = s.pts[i], q = s.pts[(i + 1) % n];
          bords.push([p[0], p[1], q[0], q[1]]);
        }
      });
      const distSeg = function (x, z, s) {
        const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz;
        const t = l2 ? Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / l2)) : 0;
        return Math.hypot(x - s[0] - t * dx, z - s[1] - t * dz);
      };
      const xMax = Math.max.apply(null, sc1.parois.map(function (s) { return Math.max(s[0], s[2]); }));
      const traversent = sc1.parois.filter(function (s) { return bords.some(function (b) { return coupe(s, b); }); });
      const procheStruct = Math.min.apply(null, sc1.parois.map(function (s) {
        return Math.min.apply(null, bords.map(function (b) {
          return Math.min(distSeg(s[0], s[1], b), distSeg(s[2], s[3], b), distSeg(b[0], b[1], s), distSeg(b[2], b[3], s));
        }));
      }));
      const enTravers = sc1.parois.filter(function (s) { return coupe(s, [-3.5, 0, 23, 0]); });
      // Côtés jugés à part : le front en travers de l'entrée ouvre les deux côtés à 1,75 m de lui (échantillon de côté
      // à w + 0,5 m de l'axe, seuil 3 m − w) ; le tube s'arrête là.
      verifier(sc1.rendu === "mixte" && sc1.parois.length >= 4 && xMax < -1.5 && xMax > -2.1,
        "mixte : tube avant la chambre, aucune paroi dans la chambre (paroi la plus à l'est à x = " + xMax.toFixed(2) +
        " m, entrée à 0)", { parois: sc1.parois.length, xMax: xMax });
      verifier(traversent.length === 0 && procheStruct > 1.5,
        "mixte : aucune paroi à travers un pilier ou un front (la plus proche à " + procheStruct.toFixed(2) + " m)",
        traversent.slice(0, 3));
      verifier(enTravers.length === 0 && MX.modele.ouverts >= 1,
        "mixte : le tube débouche OUVERT dans la chambre (aucune paroi en travers de l'axe, bout sans fond)", enTravers);
      verifier(Math.abs(sc1.yMax.opaque - 2) < 1e-6 && sc1.zonesTube === 1 && sc1.eau >= 1,
        "mixte : piliers et fronts dressés ; eau du tube découpée (règle galerie), eau de la chambre entière", sc1);
      const panMx = function (n) { return sc1.panneaux.filter(function (q) { return q.nom === n; })[0] || null; };
      const dCh = panMx("POI danger chambre v3d"), dTu = panMx("POI danger tube v3d"), fav = panMx("POI favori v3d");
      verifier(!!dCh && dCh.x === 3 && dCh.z === 1.5 && !!dTu && dTu.x === -20 && Math.abs(dTu.z - 1.17) < 0.02 &&
        sc1.poiTube >= 1, "mixte : POI de la chambre à sa place (règle structures), POI à 5 m du tube ramené contre la " +
        "paroi (règle galerie)", { dCh: dCh, dTu: dTu });
      const rouge = await page.evaluate(function () {
        return getComputedStyle(document.documentElement).getPropertyValue("--kta-erreur").trim();
      });
      verifier(!!dCh && dCh.danger && dCh.halo && dCh.haloXZ[0] === 3 && dCh.haloXZ[1] === 1.5 && dTu.halo &&
        dTu.haloXZ[1] === dTu.z && sc1.halos === 2 && /^#ff8c8c$/i.test(dCh.bord) && !fav.danger && !fav.halo,
        "danger : liseré et halo au sol rouges de la charte (--kta-erreur sombre), sous le panneau ; pas sur un autre POI",
        { dCh: dCh, dTu: dTu, rouge: rouge });
      verifier(!!fav && fav.favori && !dCh.favori, "favori : ⭐ sur son panneau, pas sur les autres", fav);
      if (CAPTURES) {
        await page.evaluate(function (d) { return window.KtaVue3D.fermer().then(function () {
          return window.KtaVue3D.ouvrir({ depart: d });
        }); }, mq(-11, 0, 90));
        await page.waitForTimeout(800);
        await capture(page, "mixte-galerie-chambre");
        await page.evaluate(function () { window.KtaVue3D.basculerVue(); });
        await page.waitForTimeout(500);
        await capture(page, "mixte-galerie-chambre-plongee");
      }
      // Collisions : paroi du tube, entrée dans la chambre, pilier ; dans la chambre, aucune paroi n'arrête.
      const mc = await page.evaluate(function (a) {
        const K = window.KtaVue3D, acc = window.ktaEstAccessible, r = {};
        window.ktaEstAccessible = function () { return true; };   // image de collision du plan hors jeu ici
        const rel = function () { const p = K.etat().pos; return [+(p.x / a.sc - a.ox).toFixed(2), +(p.y / a.sc - a.oz).toFixed(2)]; };
        const marcher = function (n) { for (let i = 0; i < n; i++) K.avancer(0.2); };
        return K.fermer().then(function () { return K.ouvrir({ depart: a.t }); }).then(function () {
          K.placer(a.t.x, a.t.y, 0); marcher(20); r.paroi = rel();
          K.placer(a.t.x, a.t.y, 90); marcher(70); r.entree = rel();
          K.placer(a.c.x, a.c.y, 0); marcher(25); r.pilier = rel();
          K.placer(a.l.x, a.l.y, 0); marcher(30); r.libre = rel();
          r.butees = K.etat().butees;
          window.ktaEstAccessible = acc;
          return K.fermer();
        }).then(function () { return r; });
      }, { t: mq(-10, 0), c: mq(6, 0), l: mq(2, 0), sc: MX.sc, ox: MX.ox, oz: MX.oz });
      verifier(mc.paroi[1] > -0.9 && mc.paroi[1] < -0.75, "mixte : on bute contre la paroi du tube (" + mc.paroi[1] +
        " m de l'axe, paroi à 1,25 m)", mc);
      verifier(mc.entree[0] > 3.5, "mixte : on entre dans la chambre par le bout ouvert (x = " + mc.entree[0] + " m)", mc);
      verifier(mc.pilier[1] > -2.2 && mc.pilier[1] < -1.9, "mixte : dans la chambre, on bute contre un pilier (" +
        mc.pilier[1] + " m, face à 2,5 m)", mc);
      verifier(mc.libre[1] < -5.5, "mixte : dans la chambre, aucune paroi n'arrête (6 m vers le nord entre front et " +
        "piliers)", mc);
      // Trois états retenus PAR PLAN : un choix sur ce plan ne touche pas un autre.
      const tri = await page.evaluate(function (d) {
        const K = window.KtaVue3D, r = [];
        return K.ouvrir({ depart: d }).then(function () {
          for (let i = 0; i < 3; i++) {
            document.querySelector('#kta-vue3d [data-v3d="rendu"]').dispatchEvent(new PointerEvent("pointerdown",
              { bubbles: true }));
            r.push([K.etat().rendu, window.getPlanRenduVue3D(), K.parois().length]);
          }
          K.basculerRendu("structures");
          return K.fermer();
        }).then(function () { return K.ouvrir({ depart: d }); }).then(function () {
          const out = { suite: r, rouvert: K.etat().rendu, autre: window.getPlanRenduVue3D("v3d-checkup-galerie") };
          K.basculerRendu("mixte");
          return K.fermer().then(function () { return out; });
        });
      }, mq(-12, 0, 90));
      verifier(JSON.stringify(tri.suite.map(function (q) { return q[0] + "/" + q[1]; })) ===
        JSON.stringify(["structures/structures", "galerie/galerie", "mixte/mixte"]) && tri.suite[0][2] === 0 &&
        tri.suite[1][2] > tri.suite[2][2] && tri.rouvert === "structures" && tri.autre === "galerie",
        "trois états : mixte → structures → galerie → mixte, retenus pour ce plan (l'autre plan garde le sien)", tri);

      // ── 12. Membres, repères et itinéraires d'une extension (prise neutre, extension FACTICE) ─────────────────
      const eq0 = await page.evaluate(function (d) {
        return window.KtaVue3D.ouvrir({ depart: d }).then(function () {
          const e = window.KtaVue3D.etat();
          return { equipe: e.equipe, membres: e.membres.length, version: typeof window.KtaPresences.version };
        });
      }, mq(-12, 0, 90));
      verifier(eq0.version === "function" && eq0.equipe.membres === 0 && eq0.equipe.reperes === 0 &&
        eq0.equipe.itineraires === 0 && eq0.membres === 0, "sans extension : ni membre, ni repère, ni itinéraire en 3D",
        eq0);
      const eq1 = await page.evaluate(function (a) {
        const X = window.KtaExtensions, P = function (x, z) { return [(a.ox + x) * a.sc, (a.oz + z) * a.sc]; };
        // presence.vue3d capte la place libre remise par la 3D (§ 12 bis) ; le partage suit __v3dPartage.
        window.__v3dPub = [];
        X.register({ nom: "v3d-factice", apiVersion: 1, presence: { actif: function () { return window.__v3dPartage === true; },
          basculer: function () {}, vue3d: function (p) { window.__v3dPub.push(p); } } });
        const m0 = P(-8, 0.5), m1 = P(-6, 0);
        X.afficherPresences([
          { id: "membre-a", pseudo: "Membre A", x: m0[0], y: m0[1], niveau: 0 },
          { id: "membre-b", pseudo: "Membre B", x: m1[0], y: m1[1], niveau: 1 }
        ]);
        // afficherReperes exige le plan prêt : le plan du relevé fictif, le temps de l'appel.
        const id = window._currentLoadedPlanId;
        window._currentLoadedPlanId = a.planReel;
        const r = P(-9, -0.5);
        const nr = X.afficherReperes("v3dtest", [{ id: "rep-1", x: r[0], y: r[1], niveaux: [0], teinte: "ok",
          symbole: "✓", titre: "Repère test" }]);
        window._currentLoadedPlanId = id;
        const i0 = P(-14, 0.4), i1 = P(-4, 0.4);
        X.afficherItineraires([{ id: "iti-1", pseudo: "Membre A", points: [[i0[0], i0[1], 0], [i1[0], i1[1], 0]] }]);
        return new Promise(function (res) { setTimeout(res, 200); }).then(function () {
          const e = window.KtaVue3D.etat();
          return { nr: nr, equipe: e.equipe, membres: e.membres.map(function (q) {
            return [+(q.x - a.ox).toFixed(2), +(q.z - a.oz).toFixed(2)];
          }), multi: window.APP_CONFIG.multiLevel === true, noms: e.panneaux.filter(function (q) {
            return q.genre !== "poi";
          }).map(function (q) { return q.genre + ":" + q.nom; }) };
        });
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc, planReel: G.planReel });
      await capture(page, "mixte-equipe");
      verifier(eq1.equipe.membres === (eq1.multi ? 1 : 2) && eq1.membres.length === eq1.equipe.membres &&
        eq1.membres[0][0] === -8 && eq1.membres[0][1] === 0.5 && eq1.noms.indexOf("membre:Membre A") >= 0 &&
        (!eq1.multi || eq1.noms.indexOf("membre:Membre B") < 0),
        "extension factice : membre au niveau affiché en silhouette nommée à sa place ; celui d'un autre niveau absent",
        eq1);
      verifier(eq1.nr === 1 && eq1.equipe.reperes === 1 && eq1.noms.indexOf("repere:✓ Repère test") >= 0 &&
        eq1.equipe.itineraires === 1, "extension factice : repère et itinéraire partagé dessinés en 3D", eq1);
      // Toucher le panneau d'un membre ou d'un repère : rien (ce ne sont pas des POI, pas de fiche de la carte).
      const eqT = [];
      for (const nom of ["Membre A", "✓ Repère test"]) {
        const vise = await page.evaluate(function (n) {
          const q = window.KtaVue3D.etat().panneaux.filter(function (p) { return p.nom === n && p.visible; })[0];
          return q ? q.ecran : null;
        }, nom);
        if (vise) await page.mouse.click(vise.x, vise.y);
        await page.waitForTimeout(250);
        eqT.push({ nom: nom, vise: !!vise, fiche: await page.evaluate(function () {
          return !!window.KtaVue3D.etat().fiche || !!document.querySelector("#kta-vue3d .kta-v3d-fiche");
        }) });
      }
      verifier(eqT.every(function (q) { return q.vise && !q.fiche; }),
        "toucher le panneau d'un membre ou d'un repère n'ouvre aucune fiche", eqT);
      const eq2 = await page.evaluate(function (a) {
        const X = window.KtaExtensions;
        X.afficherPresences([]);
        const id = window._currentLoadedPlanId;
        window._currentLoadedPlanId = a.planReel;
        X.afficherReperes("v3dtest", []);
        window._currentLoadedPlanId = id;
        X.afficherItineraires([]);
        return new Promise(function (res) { setTimeout(res, 200); }).then(function () {
          const e = window.KtaVue3D.etat();
          return window.KtaVue3D.fermer().then(function () { return e.equipe; });
        });
      }, { planReel: G.planReel });
      verifier(eq2.membres === 0 && eq2.reperes === 0 && eq2.itineraires === 0,
        "listes vidées par l'extension : la 3D les retire", eq2);
      await page.evaluate(function () {
        window.Favoris.remove("POI favori v3d");
        window.setStructures([]);
      });

      // ── 12 bis. Place libre montrée à l'équipe (prise presence.vue3d de l'extension FACTICE) ────────────────
      // Rien sans partage ; libre et déplacé à la main → appels espacés (0,5 m ou 10°), jamais un par image ; suivi
      // → null ; fermeture → null ; le tracker n'est jamais déplacé. Et la place d'un autre « en 3D » est marquée.
      const pub = await page.evaluate(async function (d) {
        const K = window.KtaVue3D, r = {}, pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const n = function () { return window.__v3dPub.length; };
        const trackerAvant = window.getTrackingActif();
        if (!trackerAvant) window.startTracking();
        window.recalerTrackerSurPoint(d.x, d.y, window.APP_CONFIG.activeLevel);
        const tr0 = Object.assign({}, window.getTrackingPosition());
        window.__v3dPartage = false; window.__v3dPub = [];
        await K.ouvrir({ depart: d });
        await pause(200);
        r.avantPas = n();
        K.avancer(1);
        await pause(250);
        r.sansPartage = { n: n(), etat: K.etat().presence.publications };
        window.__v3dPartage = true;
        await pause(250);
        r.premier = { n: n(), p: window.__v3dPub[0] || null };
        await pause(600);
        r.immobile = n();
        const e0 = K.etat(), x0 = e0.pos.x, y0 = e0.pos.y, i0 = e0.images;
        for (let i = 0; i < 40; i++) { K.avancer(0.05); await pause(16); }
        await pause(150);
        const e1 = K.etat();
        r.marche = { appels: n() - r.premier.n, images: e1.images - i0, m: Math.hypot(e1.pos.x - x0, e1.pos.y - y0) / d.sc };
        const n1 = n();
        K.tourner(6); await pause(150);
        r.tourne6 = n() - n1;
        K.tourner(6); await pause(150);
        r.tourne12 = n() - n1;
        r.dernier = window.__v3dPub[n() - 1];
        r.capVue = Math.round(K.etat().cap) % 360;
        K.suivre();
        await pause(250);
        r.suivi = { mode: K.etat().mode, dernier: window.__v3dPub[n() - 1], n: n() };
        K.basculerSuivi();
        await pause(250);
        r.libreSansPas = n() - r.suivi.n;
        K.avancer(0.6);
        await pause(250);
        r.relibre = window.__v3dPub[n() - 1];
        const tr1 = window.getTrackingPosition();
        r.trackerBouge = Math.hypot(tr1.x - tr0.x, tr1.y - tr0.y);
        window.stopTracking();
        await K.fermer();
        r.ferme = { dernier: window.__v3dPub[n() - 1], n: n() };
        // Un autre membre « en 3D » : silhouette marquée, son pseudo suivi de « 3D ».
        window.KtaExtensions.afficherPresences([{ id: "membre-3d", pseudo: "Membre C", x: d.x + 3 * d.sc, y: d.y,
          niveau: window.APP_CONFIG.activeLevel, source: "vue3d", cap: 45 }]);
        await K.ouvrir({ depart: d });
        await pause(250);
        const e3 = K.etat();
        r.autre = { equipe: e3.equipe, membres: e3.membres, noms: e3.panneaux.filter(function (q) { return q.genre === "membre"; })
          .map(function (q) { return q.nom; }), marque: window.I18n.t("presence.vue3d.marque") };
        window.KtaExtensions.afficherPresences([]);
        await K.fermer();
        window.__v3dPartage = false;
        if (trackerAvant) window.startTracking();
        return r;
      }, Object.assign({ sc: MX.sc }, mq(-12, 0, 90)));
      verifier(pub.avantPas === 0 && pub.sansPartage.n === 0 && pub.sansPartage.etat === 0,
        "🔒 place libre : rien remis sans partage de position, ni avant un déplacement à la main", pub);
      verifier(pub.premier.n === 1 && pub.premier.p && pub.premier.p.source === "vue3d" && pub.immobile === 1,
        "partage allumé en libre : une place remise (source vue3d), puis rien tant qu'on ne bouge pas", pub.premier);
      verifier(pub.marche.images >= 10 && pub.marche.m > 1 && pub.marche.appels >= 1 &&
        pub.marche.appels <= Math.ceil(pub.marche.m / 0.5) + 1,
        "en marchant : une remise tous les 0,5 m environ, jamais une par image", pub.marche);
      verifier(pub.tourne6 === 0 && pub.tourne12 === 1 && pub.dernier && pub.dernier.cap === pub.capVue,
        "en tournant : rien sous 10°, une remise au-delà, cap arrondi au degré", pub);
      verifier(pub.dernier && Math.round(pub.dernier.x * 10) === pub.dernier.x * 10 &&
        Math.round(pub.dernier.y * 10) === pub.dernier.y * 10, "place arrondie (0,1 px)", pub.dernier);
      verifier(pub.suivi.mode === "suivi" && pub.suivi.dernier === null && pub.libreSansPas === 0,
        "suivi → null (retour au tracker) ; repasser en libre sans bouger ne remet rien", pub.suivi);
      verifier(pub.relibre && pub.relibre.source === "vue3d" && pub.ferme.dernier === null,
        "libre à nouveau → place remise ; fermeture → null", pub);
      verifier(pub.trackerBouge < 0.01, "le tracker n'est pas déplacé par la place libre", pub.trackerBouge);
      verifier(pub.autre.equipe.membres === 1 && pub.autre.equipe.membres3d === 1 && pub.autre.membres[0].vue3d === true &&
        pub.autre.noms[0] === "Membre C · " + pub.autre.marque,
        "membre « en 3D » d'une extension : silhouette marquée, pseudo suivi de « 3D »", pub.autre);

      // ── 13. Jamais coincé : accroche d'un POI jonction posée à 3 m d'un tube (dans la roche) ─────────────────
      // Après le passage, la place est ramenée dans le tube et l'on avance, en galerie et en mixte ; partie d'un
      // pilier (aucun pas possible), un pas qui rapproche de la galerie passe.
      if (G.multi) {
        const nc = await page.evaluate(async function (a) {
          const K = window.KtaVue3D, acc = window.ktaEstAccessible, P = function (x, z) {
            return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc };
          };
          window.ktaEstAccessible = function () { return true; };
          window.ktaSetActiveLevel(0);
          window.setRoads([
            { uid: "rd_nc_0", type: "principal", level: 0, points: [P(-20, 0), P(0, 0)] },
            { uid: "rd_nc_1", type: "principal", level: 1, points: [P(-20, -6), P(0, -6)] }
          ]);
          // Puits à échelons : l'accroche d'un escalier ouvrirait sa niche jusque-là (_nicheAuRaccord), on y arriverait.
          const ac = P(-8, -9);
          window.setEditorPoints([Object.assign({ id: "POI jonction nc v3d", level: 0, tags: ["jpe"], niveaux: [0, 1],
            accroches: [{ level: 1, x: ac.x, y: ac.y }] }, P(-10, 0))]);
          window.setStructures([{ uid: "st_nc", type: "pilier-1", level: 1,
            points: [P(-15, -13), P(-13, -13), P(-13, -11), P(-15, -11)] }]);
          window.KtaGalerie.invalider();
          const r = {};
          for (const rendu of ["galerie", "mixte"]) {
            window.setPlanRenduVue3D(null, rendu);
            window.ktaSetActiveLevel(0);   // la fermeture précédente a mis la carte au niveau de la 3D
            const d = P(-9.5, 0);
            await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
            const ok = K.changerNiveau("haut"), e = K.etat();
            const z0 = e.pos.y / a.sc - a.oz, x0 = e.pos.x / a.sc - a.ox;
            for (let i = 0; i < 10; i++) K.avancer(0.2);
            const x1 = K.etat().pos.x / a.sc - a.ox;
            // Cap d'arrivée : le long de la galerie, vers son côté le plus long (12 m à l'ouest, 8 m à l'est) = 270°.
            r[rendu] = { passe: ok, niveau: e.niveau, z: +z0.toFixed(2), degage: e.degagements, cap: Math.round(e.cap),
              avance: +Math.abs(x1 - x0).toFixed(2) };
            if (rendu === "mixte") {
              const c = P(-14, -12);
              K.placer(c.x, c.y, 180);   // au centre du pilier : vers le sud, on s'approche de la galerie
              const yA = K.etat().pos.y;
              for (let i = 0; i < 5; i++) K.avancer(0.2);
              r.pilier = +((K.etat().pos.y - yA) / a.sc).toFixed(2);
            }
            await K.fermer();
          }
          window.setPlanRenduVue3D(null, "mixte");
          window.ktaEstAccessible = acc;
          window.setStructures([]); window.setEditorPoints([]);
          return r;
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        verifier(nc.galerie.passe && nc.galerie.niveau === 1 && Math.abs(nc.galerie.z + 6) < 0.05 &&
          nc.galerie.degage === 1 && nc.galerie.cap === 270 && nc.galerie.avance > 1.5,
          "galerie : accroche à 3 m du tube → ramené dans le tube (axe), cap vers le côté long, on avance", nc.galerie);
        verifier(nc.mixte.passe && nc.mixte.niveau === 1 && Math.abs(nc.mixte.z + 6) < 0.05 && nc.mixte.degage === 1 &&
          nc.mixte.cap === 270 && nc.mixte.avance > 1.5,
          "mixte : accroche hors du tube → ramené dans le tube comme en galerie, cap vers le côté long, on avance", nc.mixte);
        verifier(nc.pilier > 0.5, "mixte : parti du centre d'un pilier, un pas qui rapproche de la galerie passe (" +
          nc.pilier + " m)", nc);
      } else {
        console.log("  ℹ️ plan à un niveau : passage vers une accroche hors du tube non joué");
      }

      // ── 14. Passages entre niveaux (QCM du 02/11/2026) : volumes par moyen, rampe, panneau, fiche, geste, arrivée ──
      // Réseau fictif : une galerie est-ouest aux niveaux −1, 0 et +1 ; sur le 0, un passage par moyen (escalier vers
      // −1, échelons vers +1, corde entre les trois), deux puits de surface (peo, eso), une aération pa (0 et −1), deux
      // tracés jonction (vers −1 et vers +1). Accroches au même endroit sur les autres niveaux.
      if (G.multi) {
        const PJ = await page.evaluate(function (a) {
          const P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
          window.__v3dAcc14 = window.ktaEstAccessible;
          window.ktaEstAccessible = function () { return true; };
          window.setStructures([]);
          window.setRoads([-1, 0, 1].map(function (n) {
            return { uid: "rd_p14_" + (n + 1), type: "principal", level: n, points: [P(-70, 0), P(70, 0)] };
          }).concat([
            { uid: "rd_p14_jb", type: "jonction", level: 0, fromLevel: 0, toLevel: -1, points: [P(45, 0), P(45, 8)] },
            { uid: "rd_p14_jh", type: "jonction", level: 0, fromLevel: 0, toLevel: 1, points: [P(55, 0), P(55, -8)] }
          ]));
          const poi = function (id, x, tag, niveaux) {
            const q = P(x, 0), o = { id: id, nom: id, uid: "pt_p14_" + tag, level: 0, tags: [tag], x: q.x, y: q.y };
            if (niveaux) {
              o.niveaux = niveaux;
              o.accroches = niveaux.filter(function (n) { return n !== 0; }).map(function (n) { return { level: n, x: q.x, y: q.y }; });
            }
            return o;
          };
          window.setEditorPoints([poi("Escalier p14", -40, "jes", [0, -1]), poi("Puits a echelons p14", -25, "jpe", [0, 1]),
            poi("Puits a corde p14", -10, "jps", [-1, 0, 1]), poi("Puits ouvert p14", 5, "peo"),
            poi("Escalier de surface p14", 20, "eso"), poi("Aeration p14", 35, "pa", [0, -1])]);
          window.setPlanRenduVue3D(null, "mixte");
          window.ktaSetActiveLevel(0);
          window.KtaGalerie.invalider();
          const d = P(-46, 0);
          return window.KtaVue3D.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, distanceVue: 150 }).then(function () {
            const e = window.KtaVue3D.etat();
            return { volumes: e.volumes, h: e.hauteur, jonction: (window.ktaResolveStyle("traces", "jonction") || {}).color,
              panneaux: e.panneaux.filter(function (p) { return /p14/.test(p.nom); }).map(function (p) {
                return { nom: p.nom, jonction: p.jonction, bord: p.bord };
              }) };
          });
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        const vol = function (tag) { return PJ.volumes.filter(function (v) { return v.tag === tag; })[0] || {}; };
        const h = PJ.h, L = 6, pres = function (a, b) { return typeof a === "number" && Math.abs(a - b) < 0.15; };
        const jes = vol("jes"), jpe = vol("jpe"), jps = vol("jps"), peo = vol("peo"), eso = vol("eso"), pa = vol("pa");
        verifier(jes.forme === "escalier" && jes.sol && !jes.plafond && jes.triangles > 0 && jes.bouchesSol > 0 &&
          jes.bouchesPlafond === 0 && jes.cadre && pres(jes.yMin, -L),
          "jes (vers −1) : cage d'escalier ouverte dans le sol, marches, cadre doré", jes);
        verifier(jpe.forme === "puits" && jpe.plafond && !jpe.sol && jpe.echelons && jpe.bouchesPlafond > 0 &&
          jpe.bouchesSol === 0 && pres(jpe.yMax, h + L) && jpe.cadre,
          "jpe (vers +1) : puits à échelons ouvert dans le plafond, qui dépasse la hauteur", jpe);
        verifier(jps.forme === "puits" && jps.sol && jps.plafond && !jps.echelons && jps.bouchesSol > 0 &&
          jps.bouchesPlafond > 0 && jps.triangles > 0,
          "jps (−1, 0, +1) : puits nu ouvert dans le sol ET le plafond", jps);
        verifier(peo.plafond && !peo.sol && peo.ciel && peo.cielVu && peo.echelons && !peo.passage && !peo.cadre,
          "peo (surface) : puits à échelons dans le plafond, disque de ciel, ni passage ni cadre", peo);
        verifier(eso.forme === "escalier" && eso.plafond && !eso.sol && eso.ciel && !eso.passage,
          "eso (surface) : escalier dans le plafond, disque de ciel", eso);
        verifier(pa.forme === "aeration" && pa.plafond && !pa.sol && pa.grille && !pa.ciel && !pa.passage &&
          pa.bouchesSol === 0 && pa.bouchesPlafond > 0,
          "pa (niveaux 0 et −1) : tube d'aération à grille dans le plafond SEUL, sans passage", pa);
        const rampes = PJ.volumes.filter(function (v) { return v.genre === "rampe"; });
        const rb = rampes.filter(function (v) { return v.monte === false; })[0] || {};
        const rh = rampes.filter(function (v) { return v.monte === true; })[0] || {};
        verifier(rh.triangles > 0 && pres(rh.yMax, h) && rh.bouchesSol === 0 && rb.triangles > 0 && rb.bouchesSol > 0 &&
          pres(rb.yMin, -h - 0.1),
          "tracé jonction en rampe : du sol au plafond vers +1, du sol à −" + h + " m en tranchée vers −1", rampes);
        verifier(PJ.panneaux.filter(function (p) { return p.jonction; }).length === 3 &&
          PJ.panneaux.every(function (p) { return p.jonction ? p.bord === PJ.jonction : p.bord !== PJ.jonction; }),
          "panneaux des trois passages au liseré du tracé jonction (canon) ; puits de surface et pa : liseré doré",
          PJ.panneaux);
        // Captures (une par moyen) : vue plongeante au-dessus de chaque volume, puis à hauteur d'yeux.
        if (CAPTURES) {
          for (const c of [["jes", -40], ["jpe", -25], ["jps", -10], ["peo", 5], ["eso", 20], ["pa", 35], ["rampes", 50]]) {
            await page.evaluate(function (a) {
              const K = window.KtaVue3D;
              K.placer((a.ox + a.x - 4) * a.sc, a.oz * a.sc, 90);
              if (K.etat().vue !== "plongee") K.basculerVue();
            }, { ox: MX.ox, oz: MX.oz, sc: MX.sc, x: c[1] });
            await page.waitForTimeout(250);
            await capture(page, "passage-" + c[0] + "-plongee");
            await page.evaluate(function () { window.KtaVue3D.basculerVue(); });
            await page.waitForTimeout(250);
            await capture(page, "passage-" + c[0] + "-yeux");
          }
        }
        // Panneau d'un passage lisible jusqu'à 1 m (là où 🪜 apparaît) ; ↕ et liseré dessinés dans le canvas.
        const pan = await page.evaluate(function (a) {
          const K = window.KtaVue3D;
          K.placer((a.ox - 40 - 1.05) * a.sc, a.oz * a.sc, 90);
          return new Promise(function (r) { setTimeout(r, 150); }).then(function () {
            const e = K.etat(), q = e.panneaux.filter(function (p) { return p.nom === "Escalier p14"; })[0];
            return { visible: q && q.visible, opacite: q && q.opacite, boite: e.passage };
          });
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        verifier(pan.visible && pan.opacite >= 0.85 && pan.boite.visible && pan.boite.bas === -1,
          "à 1 m d'un POI jonction : panneau encore lisible (opacité " + pan.opacite + ") ET 🪜 ▼ montré", pan);
        // 🪜 nommé, et aucun 🪜 près du puits d'aération ni d'un puits de surface.
        const nomme = await page.evaluate(function (a) {
          const K = window.KtaVue3D, r = {};
          r.texte = Array.prototype.map.call(document.querySelectorAll("#kta-vue3d .kta-v3d-niveaux button"),
            function (b) { return b.textContent; });
          r.attendu = window.I18n.t("vue3d.passageNomme", { fleche: "▼", n: "-1", nom: "Escalier p14",
            moyen: window.I18n.t("vue3d.moyen.escalier") });
          K.placer((a.ox + 35 - 1) * a.sc, a.oz * a.sc, 90);
          return new Promise(function (res) { setTimeout(res, 150); }).then(function () {
            r.pa = K.etat().passage.visible;
            K.placer((a.ox + 5 - 1) * a.sc, a.oz * a.sc, 90);
            return new Promise(function (res) { setTimeout(res, 150); });
          }).then(function () { r.peo = K.etat().passage.visible; return r; });
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        verifier(nomme.texte.length === 1 && nomme.texte[0] === nomme.attendu && !nomme.pa && !nomme.peo,
          "🪜 nommé (« " + nomme.attendu + " ») ; ni 🪜 à l'aération ni au puits de surface", nomme);
        // Fiche du puits à corde (trois niveaux) : deux boutons, le plus haut d'abord.
        await page.evaluate(function (a) { window.KtaVue3D.placer((a.ox - 10 - 4) * a.sc, a.oz * a.sc, 90); },
          { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        await page.waitForTimeout(300);
        const viseC = await page.evaluate(function () {
          const q = window.KtaVue3D.etat().panneaux.filter(function (p) { return p.nom === "Puits a corde p14" && p.visible; })[0];
          return q ? q.ecran : null;
        });
        if (viseC) await page.mouse.click(viseC.x, viseC.y);
        await page.waitForTimeout(200);
        const fc = await page.evaluate(function () {
          const t = function (k, n) {
            return window.I18n.t(k, { n: window.ktaFormatNiveau(n), moyen: window.I18n.t("vue3d.moyen.corde") });
          };
          return { fiche: window.KtaVue3D.etat().fiche, attendu: [t("vue3d.ficheMonter", 1), t("vue3d.ficheDescendre", -1)] };
        });
        verifier(!!viseC && !!fc.fiche && JSON.stringify(fc.fiche.passages) === JSON.stringify(fc.attendu),
          "fiche d'un passage entre trois niveaux : « ▲ Monter… », « ▼ Descendre… » (moyen compris)", fc);
        await capture(page, "passage-fiche-corde");
        await page.keyboard.press("Escape");

        // Geste : fondu noir et descente animée ~1 s, scène du niveau d'arrivée construite au noir ; bandeau 2 s.
        const ge = await page.evaluate(function (a) {
          const K = window.KtaVue3D;
          K.gesteAnime(true);
          K.placer((a.ox - 40 - 1) * a.sc, a.oz * a.sc, 90);
          return new Promise(function (r) { setTimeout(r, 100); }).then(function () {
            const oeil = K.etat().oeil, ech = [], t0 = performance.now();
            const lance = K.changerNiveau("bas");
            return new Promise(function (res) {
              (function lire() {
                const e = K.etat();
                ech.push({ t: Math.round(performance.now() - t0), y: e.cameraY, f: e.fondu, n: e.niveau, g: !!e.geste,
                  voile: e.fonduPresent, bandeau: e.bandeauNiveau, im: e.images, aretes: e.compte.aretes });
                if (performance.now() - t0 < 1500) requestAnimationFrame(lire);
                else res({ lance: lance, oeil: oeil, ech: ech });
              })();
            });
          });
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        const avant = ge.ech.filter(function (q) { return q.n === 0; }), apres = ge.ech.filter(function (q) { return q.n === -1; });
        const fin = ge.ech.filter(function (q) { return !q.g && q.n === -1; })[0] || {};
        const yMin0 = Math.min.apply(null, avant.map(function (q) { return q.y; }));
        const yMax1 = Math.max.apply(null, apres.map(function (q) { return q.y; }));
        const fMax = Math.max.apply(null, ge.ech.map(function (q) { return q.f; }));
        const bascule = apres.length ? apres[0].t : null;
        verifier(ge.lance && avant.length > 3 && apres.length > 3 && yMin0 < 0 && yMax1 > PJ.h && fMax >= 0.9 &&
          fin.f === 0 && fin.voile === false && Math.abs(fin.y - ge.oeil) < 0.01 && fin.t > 800 && fin.t < 1300 &&
          bascule > 350 && bascule < 750,
          "descente animée : caméra de " + ge.oeil + " m à " + yMin0.toFixed(2) + " m, noir (" + fMax + ") à la bascule (" +
          bascule + " ms), arrivée par le plafond (" + yMax1.toFixed(2) + " m), fin à " + fin.t + " ms, voile retiré",
          { yMin0: yMin0, yMax1: yMax1, fMax: fMax, bascule: bascule, fin: fin });
        const auNoir = apres[0] || {};
        verifier(auNoir.f >= 0.9 && auNoir.aretes > 0 && apres.some(function (q) { return q.bandeau; }),
          "scène du niveau −1 construite pendant le noir ; bandeau « " + (apres.filter(function (q) { return q.bandeau; })[0] || {}).bandeau + " »",
          auNoir);
        const repos = await page.evaluate(function () {
          const K = window.KtaVue3D, i0 = K.etat().images;
          return new Promise(function (r) { setTimeout(r, 1500); }).then(function () {
            const e = K.etat();
            return { images: e.images - i0, bandeau: e.bandeauNiveau, geste: e.geste };
          });
        });
        verifier(repos.images === 0 && repos.bandeau === null && !repos.geste,
          "après le geste : aucun rendu continu, bandeau retiré au bout de 2 s", repos);

        // Arrivée en mixte à 5,9 m de l'axe (accroche posée à côté du tube) : ramenée dans le tube, un pas possible.
        // Cap à l'arrivée : vers la galerie (côté le plus long) sans itinéraire, vers la prochaine consigne avec.
        const ar = await page.evaluate(async function (a) {
          const K = window.KtaVue3D, dormir = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
          const P = function (x, z, n) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc, level: n }; };
          if (K.gesteAnime) K.gesteAnime(false);
          const acc = P(-40, 5.9);
          window.setEditorPoints(window.getEditorPoints().map(function (p) {
            return p.id === "Escalier p14" ? Object.assign({}, p, { accroches: [{ level: -1, x: acc.x, y: acc.y }] }) : p;
          }));
          await K.fermer();
          window.ktaSetActiveLevel(0);
          const d = P(-41, 0);
          await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 0 } });
          const r = { passe: K.changerNiveau("bas") };
          let e = K.etat();
          const m = window.KtaGalerie.modele(-1, true);
          r.niveau = e.niveau; r.z = +(e.pos.y / a.sc - a.oz).toFixed(2); r.dansTube = m.dedans(e.pos.x, e.pos.y);
          r.cap = Math.round(e.cap);
          const x0 = e.pos.x, y0 = e.pos.y;
          for (let i = 0; i < 10; i++) K.avancer(0.2);
          e = K.etat();
          r.avance = +(Math.hypot(e.pos.x - x0, e.pos.y - y0) / a.sc).toFixed(2);
          // Itinéraire par le passage, vers l'ouest au −1 (le côté long de la galerie du −1 y est à l'est).
          window.__v3dRoutes14 = window.getRoads();
          window.setRoads(window.__v3dRoutes14.concat([{ uid: "rd_p14_iti", type: "itinerary", level: 0,
            points: [P(-50, 0, 0), P(-40, 0, 0), Object.assign(P(-40, 0, null), { via: "escalier" }), P(-40, 0, -1),
              P(-60, 0, -1), P(-60, 10, -1)] }]));
          window.setEditorPoints(window.getEditorPoints().map(function (p) {
            return p.id === "Escalier p14" ? Object.assign({}, p, { accroches: [{ level: -1, x: P(-40, 0).x, y: P(-40, 0).y }] }) : p;
          }));
          await dormir(300);   // scène refaite à kta:itineraireChange (passages relus)
          K.placer(P(-40.5, 0).x, P(-40.5, 0).y, 90);
          K.changerNiveau("haut");
          K.placer(P(-48, 0).x, P(-48, 0).y, 90);
          await dormir(400);
          e = K.etat();
          r.avant = { niveau: e.niveau, principal: e.bandeau.principal, chevrons: e.chevrons };
          r.attendu = window.I18n.t("guid.act.descendre", { niveau: window.I18n.t("guid.niveau", { n: "-1" }) });
          K.placer(P(-40.5, 0).x, P(-40.5, 0).y, 90);
          K.changerNiveau("bas");
          await dormir(400);
          e = K.etat();
          r.apres = { niveau: e.niveau, cap: Math.round(e.cap), principal: e.bandeau.principal, mode: e.bandeau.mode,
            chevrons: e.chevrons };
          // Niveau +1 (aucun tronçon de l'itinéraire) par le puits à corde : plus de « Rejoindre le tracé ».
          K.placer(P(-11, 0).x, P(-11, 0).y, 90);
          await dormir(100);
          K.changerNiveau(1);
          await dormir(400);
          e = K.etat();
          r.plusUn = { niveau: e.niveau, bandeau: e.bandeau.affiche, mode: e.bandeau.mode || null };
          window.setRoads(window.__v3dRoutes14);
          return r;
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        verifier(ar.passe && ar.niveau === -1 && Math.abs(ar.z) < 0.05 && ar.dansTube && ar.avance > 1.5,
          "mixte : arrivée à 5,9 m de l'axe → ramenée dans le tube, on avance (" + ar.avance + " m)", ar);
        verifier(ar.cap === 90, "cap d'arrivée sans itinéraire : le long de la galerie, côté le plus long (90°)", ar.cap);
        verifier(ar.avant.niveau === 0 && ar.avant.principal.indexOf(ar.attendu) >= 0 && ar.avant.chevrons > 0,
          "itinéraire par le passage : le bandeau dit « " + ar.attendu + " » avant le passage, chevrons jusque-là", ar.avant);
        verifier(ar.apres.niveau === -1 && ar.apres.cap === 270 && ar.apres.mode === "guide" && ar.apres.chevrons > 0 &&
          ar.apres.principal.indexOf(ar.attendu) < 0,
          "après le passage : cap vers la prochaine consigne (270°, pas le côté long), guidage repris au −1, chevrons",
          ar.apres);
        verifier(ar.plusUn.niveau === 1 && !ar.plusUn.bandeau,
          "niveau +1 sans tronçon de l'itinéraire : aucun bandeau (plus de « Rejoindre le tracé »)", ar.plusUn);

        // Changement de niveau du tracker en suivi : même fondu (sans descente), bandeau « Niveau −1 ».
        const su = await page.evaluate(async function (a) {
          const K = window.KtaVue3D, dormir = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
          const P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
          await K.fermer();
          window.ktaSetActiveLevel(0);
          if (!window.getTrackingActif()) window.startTracking();
          const t = P(-30, 0);
          window.recalerTrackerSurPoint(t.x, t.y, 0);
          if (K.gesteAnime) K.gesteAnime(true);
          await K.ouvrir({});
          await dormir(300);
          const r = { mode: K.etat().mode, avant: K.etat().niveau, ech: [] };
          window.recalerTrackerSurPoint(t.x, t.y, -1);
          const t0 = performance.now();
          while (performance.now() - t0 < 900) {
            const e = K.etat();
            r.ech.push({ t: Math.round(performance.now() - t0), f: e.fondu, n: e.niveau, y: e.cameraY, b: e.bandeauNiveau });
            await new Promise(function (res) { requestAnimationFrame(res); });
          }
          r.texte = window.I18n.t("vue3d.niveauBandeau", { n: window.ktaFormatNiveau(-1) });
          await K.fermer();
          window.stopTracking();
          return r;
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        const sAv = su.ech.filter(function (q) { return q.n === 0; }), sAp = su.ech.filter(function (q) { return q.n === -1; });
        const ys = su.ech.map(function (q) { return q.y; });
        verifier(su.mode === "suivi" && su.avant === 0 && sAv.some(function (q) { return q.f > 0.5; }) && sAp.length &&
          sAp[0].f >= 0.9 && sAp[sAp.length - 1].f === 0 && Math.max.apply(null, ys) - Math.min.apply(null, ys) < 0.3 &&
          sAp.some(function (q) { return q.b === su.texte; }),
          "suivi : le tracker passe au −1 → fondu noir sans descente, scène refaite au noir, bandeau « " + su.texte + " »",
          { avant: sAv.length, apres: sAp.length, premier: sAp[0], dernier: sAp[sAp.length - 1] });

        // Tracker arrêté, recalé au −1 (« Je suis ici » d'un POI du −1 vu depuis le 0) : la vue s'ouvre au −1, la
        // carte reste au 0 ; recalé au 0, elle s'y rouvre.
        const ji = await page.evaluate(async function (a) {
          const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
          await K.fermer();
          if (window.getTrackingActif()) window.stopTracking();
          window.ktaSetActiveLevel(0);
          const t = P(-30, 0);
          window.recalerTrackerSurPoint(t.x, t.y, -1, { dansGalerie: true });
          await K.ouvrir({});
          const r = { mode: K.etat().mode, niveau: K.etat().niveau, actif: window.APP_CONFIG.activeLevel };
          await K.fermer();
          window.recalerTrackerSurPoint(t.x, t.y, 0);
          await K.ouvrir({});
          r.niveau0 = K.etat().niveau;
          await K.fermer();
          return r;
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        verifier(ji.mode === "libre" && ji.niveau === -1 && ji.actif === 0 && ji.niveau0 === 0,
          "tracker arrêté recalé au −1, carte au 0 : la vue s'ouvre au niveau du tracker, la carte reste au 0", ji);
        await page.evaluate(function () {
          window.ktaEstAccessible = window.__v3dAcc14;
          if (window.KtaVue3D.gesteAnime) window.KtaVue3D.gesteAnime(false);
          window.setStructures([]); window.setEditorPoints([]); window.setRoads([]);
          window.ktaSetActiveLevel(0);
        });
      } else {
        console.log("  ℹ️ plan à un niveau : passages entre niveaux non joués");
      }

      // ── 14 bis. Aucune paroi de tube dans un passage (fictif) ─────────────────────────────────────────────
      // Une galerie est-ouest aux niveaux 0 et −1 ; sur le 0 : escalier coupé en diagonale par un chemin, escalier
      // qui déborde du tube (paroi à 1,25 m, bouche de 0,75 à 2,25 m), escalier au bout d'un cul-de-sac, puits à
      // échelons qui déborde, puits à corde, puits ouvert et aération coupés en diagonale, tracé jonction qui
      // traverse la paroi. Test géométrique : aucun morceau de paroi dessinée (KtaVue3D.parois) dans la bouche de
      // chaque volume ni dans la tranchée d'une rampe (2 cm de marge), dans les 3 rendus et aux deux niveaux.
      if (G.multi) {
        const CE = await page.evaluate(async function (a) {
          const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
          const acc = window.ktaEstAccessible;
          window.ktaEstAccessible = function () { return true; };
          window.setStructures([]); window.setZones([]);
          window.setRoads([-1, 0].map(function (n) {
            return { uid: "rd_ce_" + (n + 1), type: "principal", level: n, points: [P(-60, 0), P(60, 0)] };
          }).concat([
            { uid: "rd_ce_d1", type: "chemin", level: 0, points: [P(-44, -4), P(-36, 4)] },
            { uid: "rd_ce_cs", type: "secondaire", level: 0, points: [P(0, 0), P(0, 12)] },
            { uid: "rd_ce_d2", type: "chemin", level: 0, points: [P(26, -4), P(34, 4)] },
            { uid: "rd_ce_d3", type: "chemin", level: 0, points: [P(36, -4), P(44, 4)] },
            { uid: "rd_ce_d4", type: "chemin", level: 0, points: [P(46, -4), P(54, 4)] },
            { uid: "rd_ce_j", type: "jonction", level: 0, fromLevel: 0, toLevel: -1, points: [P(-30, 0), P(-30, 6)] }
          ]));
          const poi = function (id, x, z, tag, niveaux) {
            const q = P(x, z), o = { id: id, nom: id, uid: "pt_ce_" + id, level: 0, tags: [tag], x: q.x, y: q.y };
            if (niveaux) {
              o.niveaux = niveaux;
              o.accroches = niveaux.filter(function (n) { return n !== 0; }).map(function (n) { return { level: n, x: q.x, y: q.y }; });
            }
            return o;
          };
          window.setEditorPoints([poi("ce jes diagonale", -40, 0, "jes", [0, -1]), poi("ce jes deborde", -20, 1.5, "jes", [0, -1]),
            poi("ce jes bout", 0, 12, "jes", [0, -1]), poi("ce jpe deborde", 20, 1.5, "jpe", [0, -1]),
            poi("ce jps diagonale", 30, 0, "jps", [0, -1]), poi("ce peo diagonale", 40, 0, "peo"),
            poi("ce pa diagonale", 50, 0, "pa", [0, -1])]);
          window.KtaGalerie.invalider();
          // Bord convexe : point strictement dedans, à plus de 2 cm de chaque bord.
          const dedans = function (poly, x, z) {
            let s = 0;
            for (let i = 0; i < poly.length; i++) {
              const p = poly[i], q = poly[(i + 1) % poly.length];
              const c = ((q[0] - p[0]) * (z - p[1]) - (q[1] - p[1]) * (x - p[0])) / Math.hypot(q[0] - p[0], q[1] - p[1]);
              if (Math.abs(c) < 0.02) return false;
              if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false;
            }
            return true;
          };
          const tranchee = function (A, B) {   // rectangle (m) de la tranchée d'une rampe, demi-largeur 0,6 m
            const l = Math.hypot(B[0] - A[0], B[1] - A[1]), nx = -(B[1] - A[1]) / l * 0.6, nz = (B[0] - A[0]) / l * 0.6;
            return [[A[0] - nx, A[1] - nz], [B[0] - nx, B[1] - nz], [B[0] + nx, B[1] + nz], [A[0] + nx, A[1] + nz]];
          };
          const r = { cas: [] };
          for (const rendu of ["mixte", "galerie", "structures"]) {
            for (const niv of [0, -1]) {
              await K.fermer();
              window.setPlanRenduVue3D(null, rendu);
              window.ktaSetActiveLevel(niv);
              // Départ dans la niche d'une bouche qui déborde du tube (jamais coincé) : au 0, au-delà du bout du
              // cul-de-sac (la place d'un POI sans raccord est ramenée dans le tube : plus de niche à côté) ; au −1, la
              // bouche au raccord validé, hors du tube.
              const d = niv === 0 ? P(0, 12.8) : P(-20, 1.5);
              await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, distanceVue: 150 });
              const e = K.etat(), ps = K.parois(), polys = [];
              e.volumes.forEach(function (v) {
                if (v.bouche) polys.push({ nom: v.tag + "@" + Math.round(v.x / a.sc - a.ox), poly: v.bouche });
              });
              if (niv === 0) polys.push({ nom: "rampe", poly: tranchee([a.ox - 30, a.oz], [a.ox - 30, a.oz + 6]) });
              const dans = polys.map(function (b) {
                let lg = 0;
                ps.forEach(function (w) {
                  const l = Math.hypot(w[2] - w[0], w[3] - w[1]), k = Math.max(2, Math.ceil(l / 0.01));
                  let n = 0;
                  for (let i = 0; i <= k; i++) {
                    if (dedans(b.poly, w[0] + (w[2] - w[0]) * i / k, w[1] + (w[3] - w[1]) * i / k)) n++;
                  }
                  lg += n / (k + 1) * l;
                });
                return { nom: b.nom, m: +lg.toFixed(2) };
              }).filter(function (q) { return q.m > 0; });
              const pos0 = e.pos, ok = K.avancer(0.5);
              r.cas.push({ rendu: rendu, niveau: e.niveau, parois: ps.length, bouches: polys.length, dans: dans,
                degage: e.degagements, avance: !!ok && Math.hypot(K.etat().pos.x - pos0.x, K.etat().pos.y - pos0.y) > 0,
                rubans: !!e.boites.rubans,
                passages: rendu === "structures" ? null : window.KtaGalerie.modele(niv, rendu === "mixte").passages });
            }
          }
          await K.fermer();
          window.setPlanRenduVue3D(null, "mixte");
          window.ktaEstAccessible = acc;
          window.setStructures([]); window.setEditorPoints([]); window.setRoads([]);
          window.ktaSetActiveLevel(0);
          return r;
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        CE.cas.forEach(function (c) {
          verifier(c.dans.length === 0 && c.bouches >= (c.niveau === 0 ? 8 : 5) && (c.rendu === "structures" || c.parois > 0),
            c.rendu + ", niveau " + c.niveau + " : aucune paroi de tube dans les " + c.bouches +
            " emprises de passage (" + c.parois + " parois, " + (c.passages === null ? "—" : c.passages) + " niches)", c);
          verifier(c.degage === 0 && c.avance, c.rendu + ", niveau " + c.niveau +
            " : départ dans la niche d'une bouche qui déborde du tube, pas ramené, un pas passe", c);
        });
        verifier(CE.cas.filter(function (c) { return c.niveau === 0; }).every(function (c) { return c.rubans; }),
          "rubans des tracés dans leur famille (gabarit du sol : coupés à la bouche)", CE.cas);
      }

      // ── 14 ter. POI de passage posé à côté de l'axe (le cas courant : lisible en 2D) ─────────────────────────
      // Galerie principale (paroi à 1,25 m) aux niveaux −1, 0, +1 ; une branche secondaire (paroi à 1 m) vers +z au
      // niveau 0 (carrefour). Sur le 0, des POI décalés de 1 à 5 m des deux côtés, sans raccord validé : chaque volume
      // doit tomber dans le tube (bouche ET cadre doré dans l'emprise : visible), sur CHAQUE niveau sans raccord ; un
      // raccord validé reste au point exact ; panneau au-dessus du volume, 🪜 montré au volume. Près du carrefour, le
      // POI va à la galerie dont l'emprise est la plus proche (la branche) ; un raccord validé sur son niveau tranche.
      // Rendu structures : le point tel quel. Les POI enregistrés ne bougent pas.
      if (G.multi) {
        const DC = await page.evaluate(async function (a) {
          const K = window.KtaVue3D, sc = a.sc, P = function (x, z) { return { x: (a.ox + x) * sc, y: (a.oz + z) * sc }; };
          const acc = window.ktaEstAccessible;
          window.ktaEstAccessible = function () { return true; };
          window.setStructures([]); window.setZones([]);
          window.setRoads([-1, 0, 1].map(function (n) {
            return { uid: "rd_dc_" + (n + 1), type: "principal", level: n, points: [P(-80, 0), P(80, 0)] };
          }).concat([{ uid: "rd_dc_b", type: "secondaire", level: 0, points: [P(60, 0), P(60, 20)] },
            { uid: "rd_dc_c", type: "secondaire", level: 0, points: [P(75, 0), P(75, 20)] }]));
          const poi = function (id, x, z, tag, niveaux, raccords) {
            const q = P(x, z), o = { id: id, nom: id, uid: "pt_dc_" + id.replace(/\W/g, "_"), level: 0, tags: [tag],
              x: q.x, y: q.y };
            if (niveaux) { o.niveaux = niveaux; o.accroches = []; }
            (raccords || []).forEach(function (r) { const c = P(r[1], r[2]); o.accroches.push({ level: r[0], x: c.x, y: c.y }); });
            return o;
          };
          // [nom, x, z, tag, niveaux, raccords [niveau, x, z], attendu au 0 (z), au −1 / +1 (z | null = exact)]
          const C = [
            ["dc jpe bas 3", -70, 3, "jpe", [0, -1], [[-1, -70, 0]]],
            ["dc jpe bas -2", -60, -2, "jpe", [0, -1], []],
            ["dc jpe haut 1.5", -50, 1.5, "jpe", [0, 1], [[1, -50, 0.3]]],
            ["dc jpe haut -5", -40, -5, "jpe", [0, 1], []],
            ["dc jes 2", -30, 2, "jes", [0, -1], []],
            ["dc jps 4", -20, -4, "jps", [-1, 0, 1], [[-1, -20, -0.2]]],
            ["dc peo 2.5", -10, 2.5, "peo", null, []],
            ["dc eso -3", 0, -3, "eso", null, []],
            ["dc pa 2", 10, 2, "pa", [0, -1], []],
            ["dc jpe dedans 1", 20, 1, "jpe", [0, -1], []],
            ["dc jpe raccord 0", 30, 3, "jpe", [0, -1], [[0, 30, 0]]],
            ["dc jpe carrefour", 62.2, 4, "jpe", [0, -1], []],
            ["dc jpe carrefour raccord", 77.2, 4, "jpe", [0, -1], [[0, 77.2, 0]]]
          ];
          const pts = C.map(function (c) { return poi(c[0], c[1], c[2], c[3], c[4], c[5]); });
          window.setEditorPoints(pts);
          const avant = JSON.stringify(window.getEditorPoints());
          window.KtaGalerie.invalider();
          const r = { cas: [], panneaux: [], echelles: [] };
          for (const rendu of ["mixte", "galerie", "structures"]) {
            for (const niv of [0, -1, 1]) {
              await K.fermer();
              window.setPlanRenduVue3D(null, rendu);
              window.ktaSetActiveLevel(niv);
              const d = P(-78, 0);
              await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, distanceVue: 200 });
              const e = K.etat(), m = rendu === "structures" ? null : window.KtaGalerie.modele(niv, rendu === "mixte");
              for (const v of e.volumes) {
                if (v.genre !== "poi") continue;
                const c = C.filter(function (q) { return Math.abs((a.ox + q[1]) * sc - v.x) < 3.5 * sc; })[0];
                if (!c) continue;
                const cx = v.x / sc, cz = v.y / sc, ux = Math.cos(Math.atan2(v.bouche[1][1] - v.bouche[0][1],
                  v.bouche[1][0] - v.bouche[0][0])), uz = Math.sin(Math.atan2(v.bouche[1][1] - v.bouche[0][1],
                  v.bouche[1][0] - v.bouche[0][0]));
                // Emprise avec cadre (bouche + 0,2 m) : 7 × 7 échantillons, tous dans l'emprise des tubes et joints.
                const A = Math.hypot(v.bouche[1][0] - v.bouche[0][0], v.bouche[1][1] - v.bouche[0][1]) / 2 + 0.2;
                const B = Math.hypot(v.bouche[3][0] - v.bouche[0][0], v.bouche[3][1] - v.bouche[0][1]) / 2 + 0.2;
                let hors = 0;
                if (m) {
                  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
                    const s = (i / 3 - 1) * A * 0.995, t = (j / 3 - 1) * B * 0.995;
                    const x = cx + ux * s - uz * t, z = cz + uz * s + ux * t;
                    const ok = m.piecesPres(x * sc, z * sc, x * sc, z * sc).some(function (k) {
                      return m.pieces[k].genre !== "passage" && window.KtaGalerie.dansPiece(m.pieces[k], x * sc, z * sc, 1e-6);
                    });
                    if (!ok) hors++;
                  }
                }
                r.cas.push({ rendu: rendu, niv: niv, nom: c[0], z: +(cz - a.oz).toFixed(3), x: +(cx - a.ox).toFixed(3),
                  hors: hors, cadre: v.cadre, construit: v.construit });
              }
              e.panneaux.filter(function (p) { return /^dc /.test(p.nom); }).forEach(function (p) {
                r.panneaux.push({ rendu: rendu, niv: niv, nom: p.nom, x: +(p.x - a.ox).toFixed(3), z: +(p.z - a.oz).toFixed(3) });
              });
              // 🪜 : posé au centre de chaque volume de passage (POI à moyen), la boîte des niveaux apparaît.
              if (rendu !== "structures") {
                for (const v of e.volumes) {
                  if (v.genre !== "poi" || !v.passage) continue;
                  K.placer(v.x, v.y, 90);
                  await new Promise(function (ok) { setTimeout(ok, 120); });
                  const b = K.etat().passage;
                  r.echelles.push({ rendu: rendu, niv: niv, x: +(v.x / sc - a.ox).toFixed(1), visible: b.visible, liste: b.liste });
                }
              }
            }
          }
          r.inchanges = JSON.stringify(window.getEditorPoints()) === avant;
          await K.fermer();
          window.setPlanRenduVue3D(null, "mixte");
          window.ktaEstAccessible = acc;
          window.setStructures([]); window.setEditorPoints([]); window.setRoads([]);
          window.ktaSetActiveLevel(0);
          window.KtaGalerie.invalider();
          return r;
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        const un = function (rendu, niv, nom) {
          return DC.cas.filter(function (c) { return c.rendu === rendu && c.niv === niv && c.nom === nom; })[0] || null;
        };
        const pres = function (a, b, tol) { return a !== null && a !== undefined && Math.abs(a - b) <= (tol || 0.01); };
        for (const rendu of ["mixte", "galerie"]) {
          const tube = DC.cas.filter(function (c) { return c.rendu === rendu; });
          verifier(tube.length >= 20 && tube.every(function (c) { return c.hors === 0 && c.construit; }),
            rendu + " : " + tube.length + " volumes de POI décalés de 1 à 5 m (3 niveaux) : bouche et cadre doré " +
            "dans le tube (ou la niche d'un escalier)",
            tube.filter(function (c) { return c.hors > 0 || !c.construit; }));
          const z = function (niv, nom) { const c = un(rendu, niv, nom); return c ? c.z : null; };
          verifier(pres(z(0, "dc jpe bas 3"), 0.45) && pres(z(0, "dc jpe bas -2"), -0.45) && pres(z(-1, "dc jpe bas -2"), -0.45) &&
            pres(z(0, "dc jpe haut -5"), -0.45) && pres(z(1, "dc jpe haut -5"), -0.45) && pres(z(0, "dc jes 2"), 2.5) &&
            pres(z(0, "dc eso -3"), -2.5) && pres(z(0, "dc pa 2"), 0.65) && pres(z(0, "dc jpe dedans 1"), 0.45),
            rendu + " : sans raccord, ramené du côté du POI (puits 0,45 m, aération 0,65 m de l'axe, escalier en " +
            "niche à 2,5 m), sur chaque niveau", tube);
          verifier(pres(z(-1, "dc jpe bas 3"), 0) && pres(z(1, "dc jpe haut 1.5"), 0.3) && pres(z(-1, "dc jps 4"), -0.2) &&
            pres(z(1, "dc jps 4"), -0.45) && pres(z(0, "dc jpe raccord 0"), 0),
            rendu + " : raccord validé (autre niveau ou celui du POI) au point exact ; niveau sans raccord ramené", tube);
          const cb = un(rendu, 0, "dc jpe carrefour"), cr = un(rendu, 0, "dc jpe carrefour raccord");
          verifier(!!cb && pres(cb.x, 60.2, 0.02) && cb.z > 2 && !!cr && pres(cr.x, 77.2) && pres(cr.z, 0),
            rendu + " : près d'un carrefour, galerie à l'emprise la plus proche (la branche) ; un raccord validé tranche", [cb, cr]);
          const loin = DC.panneaux.filter(function (p) {
            const c = un(rendu, p.niv, p.nom);
            return p.rendu === rendu && (!c || Math.hypot(p.x - c.x, p.z - c.z) > 0.01);
          });
          verifier(DC.panneaux.some(function (p) { return p.rendu === rendu; }) && loin.length === 0,
            rendu + " : panneau de chaque POI de passage au-dessus de son volume, sur chaque niveau", loin);
          const sans = DC.echelles.filter(function (q) { return q.rendu === rendu && !q.visible; });
          verifier(DC.echelles.filter(function (q) { return q.rendu === rendu; }).length >= 12 && sans.length === 0,
            rendu + " : 🪜 montré au centre de chaque volume de passage recalé", sans);
        }
        const loinSt = DC.panneaux.filter(function (p) {
          const c = un("structures", p.niv, p.nom);
          return p.rendu === "structures" && (!c || Math.hypot(p.x - c.x, p.z - c.z) > 0.01);
        });
        verifier(loinSt.length === 0, "structures : panneau au-dessus du volume (raccord validé du niveau du POI compris)", loinSt);
        const st = DC.cas.filter(function (c) { return c.rendu === "structures" && c.niv === 0; });
        verifier(st.length > 0 && pres((un("structures", 0, "dc jpe bas 3") || {}).z, 3) &&
          pres((un("structures", 0, "dc jpe haut -5") || {}).z, -5),
          "structures : volume au point du POI (sol dessiné partout, rien à recaler)", st);
        verifier(DC.inchanges, "POI enregistrés inchangés (seule la 3D recale le dessin)");
      }


      // ── 14 quater. Accès de surface sans passage (esf, pef, pb, pc, psf, ps, pe, cao, caf), fictifs ─────────────
      // Galerie principale (paroi à 1,25 m) au niveau 0 ; un POI par tag, posé à 2 m de l'axe (le cas courant). Par
      // rendu : forme et bouches de chaque volume, place (dans le tube en galerie / mixte, porte sur l'axe, bassin
      // contre la paroi ; au point en structures), ni 🪜 ni cadre doré, blocage du pas (cône, porte fermée ; bassin,
      // porte ouverte, puits fermés et bouché laissent passer), départ dedans ramené au bord ; itinéraire par-dessus le cône ; arrivée d'un
      // itinéraire 2D devant un cavage fermé atteinte ; 🧱 coupé = couleurs unies, obstacles gardés ; 2D intacte
      // (recalage, itinéraire, pas du tracker identiques sans et avec ces POI) ; mesures d'ouverture et du pas.
      const AC = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, G = window.KtaGalerie, sc = a.sc;
        const P = function (x, z) { return { x: (a.ox + x) * sc, y: (a.oz + z) * sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        window.ktaSetActiveLevel(0);
        window.setVue3DTextures(true);
        window.setStructures([]); window.setZones([]);
        window.setRoads([{ uid: "rd_ac", type: "principal", level: 0, points: [P(-70, 0), P(70, 0)] }]);
        const T = [["esf", -50], ["pef", -40], ["pb", -30], ["pc", -20], ["psf", -10], ["ps", 0], ["pe", 10],
          ["cao", 20], ["caf", 30]];
        const pois = T.map(function (t) {
          return Object.assign({ id: "ac " + t[0], nom: "ac " + t[0], uid: "pt_ac_" + t[0], level: 0, tags: [t[0]] },
            P(t[1], 2));
        });
        const relx = function () { return +(K.etat().pos.x / sc - a.ox).toFixed(2); };
        const r = { moyens: T.map(function (t) {
          return [t[0], window.KtaPoiJonction.moyen(t[0]), window.KtaPoiJonction.porteNiveaux(t[0])];
        }) };
        // 2D : recalage autour de chaque POI, itinéraire le long de la galerie, pas du tracker : sans puis avec.
        const deux = async function () {
          G.invalider();
          const rec = T.map(function (t) {
            return [[t[1], 2], [t[1], 0.8], [t[1] - 1, 0]].map(function (q) {
              const v = G.versGalerie(P(q[0], q[1]).x, P(q[0], q[1]).y, 0);
              return [v.etat, +(v.x / sc - a.ox).toFixed(3), +(v.y / sc - a.oz).toFixed(3)];
            });
          });
          let it;
          try {
            const ri = await window.Pathfinder.computeRoute([P(-60, 0), P(40, 0)], { allowedTypes: ["principal"] });
            it = { d: Math.round(ri.totalDistance), n: (ri.path || []).length };
          } catch (e) { it = String(e && e.message); }
          const seg = [[P(-60, 0).x, P(-60, 0).y, P(40, 0).x, P(40, 0).y], [P(-60, 2).x, P(-60, 2).y, P(40, 2).x, P(40, 2).y]];
          return { rec: rec, iti: it, pas: window.ktaSegmentsBloquesParStructure(seg, 0) };
        };
        window.setEditorPoints([]);
        r.sans = await deux();
        const zb = G.zonesBloquent, dz = G.dansZone;
        let appels = 0;
        G.zonesBloquent = function () { appels++; return zb.apply(null, arguments); };
        G.dansZone = function () { appels++; return dz.apply(null, arguments); };
        window.setEditorPoints(pois);
        r.avec = await deux();
        r.appels2D = appels;
        G.zonesBloquent = zb; G.dansZone = dz;
        const avantPts = JSON.stringify(window.getEditorPoints());
        // Marche le long de z depuis x0 vers l'est, n pas de 0,1 m → x atteint (m relatifs).
        const marcher = function (x0, z, n) {
          const d = P(x0, z);
          K.placer(d.x, d.y, 90);
          for (let i = 0; i < n; i++) K.avancer(0.1);
          return relx();
        };
        for (const rendu of ["mixte", "galerie", "structures"]) {
          window.setPlanRenduVue3D(null, rendu);
          G.invalider();
          const d = P(-60, 0), t0 = performance.now();
          await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, distanceVue: 200, tuiles: false });
          const o = r[rendu] = { ms: Math.round(performance.now() - t0), h: K.etat().hauteur, vol: {}, marche: {},
            echelle: {} };
          await pause(50);
          K.etat().volumes.forEach(function (v) {
            if (!v.acces) return;
            o.vol[v.tag] = Object.assign({}, v, { x: +(v.x / sc - a.ox).toFixed(3), z: +(v.y / sc - a.oz).toFixed(3),
              bouche: null, diam: v.bouche ? +Math.hypot(v.bouche[1][0] - v.bouche[0][0],
                v.bouche[1][1] - v.bouche[0][1]).toFixed(3) : null });
          });
          T.forEach(function (t) {
            const v = o.vol[t[0]];
            if (!v) return;
            // esf en niche latérale (à 2,5 m de l'axe, hors du passage) : on passe devant, sur l'axe.
            const z = t[0] === "esf" ? 0 : v.z;
            o.marche[t[0]] = marcher(t[1] - 4, z, 80);
            if (t[0] === "pe") o.marche.peCote = marcher(t[1] - 4, -0.85, 80);   // le long du passage laissé (0,8 m)
            if (t[0] === "caf") {
              o.marche.cafBord1 = marcher(t[1] - 4, z + 0.8, 80);
              o.marche.cafBord2 = marcher(t[1] - 4, z - 0.8, 80);
            }
            K.placer(P(t[1], z).x, P(t[1], z).y, 90);
            o.echelle[t[0]] = K.etat().passage.visible;
          });
          await K.fermer();
          // Départ au centre d'un obstacle : ramené au bord, on repart.
          o.dedans = {};
          for (const tag of ["pc", "caf"]) {
            const v = o.vol[tag], t = T.filter(function (q) { return q[0] === tag; })[0];
            await K.ouvrir({ depart: Object.assign({ cap: 270 }, P(t[1], v.z)), tuiles: false });
            const p = K.etat().pos;
            o.dedans[tag] = { degage: K.etat().degagements, dans: G.dansZone(p.x, p.y, 0, rendu), x: relx() };
            // Repartir : 2 m vers l'est, sinon vers l'ouest.
            let best = 0;
            for (const cap of [90, 270]) {
              K.placer(p.x, p.y, cap);
              for (let i = 0; i < 10; i++) K.avancer(0.2);
              best = Math.max(best, Math.hypot(K.etat().pos.x - p.x, K.etat().pos.y - p.y) / sc);
            }
            o.dedans[tag].parcouru = +best.toFixed(2);
            await K.fermer();
          }
        }
        // Bassin contre la paroi (placePassage) : POI près de l'axe ou de l'autre côté, galerie plus étroite que lui.
        window.setRoads([{ uid: "rd_ac", type: "principal", level: 0, points: [P(-70, 0), P(70, 0)] },
          { uid: "rd_ac_ch", type: "chemin", level: 0, points: [P(-70, 40), P(70, 40)] }]);
        r.contre = {};
        for (const rendu of ["mixte", "galerie", "structures"]) {
          G.invalider();
          r.contre[rendu] = [[10, 0.1], [10, -2], [10, 42]].map(function (q) {
            const pl = G.placePassage(Object.assign({ uid: "pt_ac_pe_c", level: 0, tags: ["pe"] }, P(q[0], q[1])), 0,
              rendu);
            return pl ? +(pl.y / sc - a.oz).toFixed(3) : null;
          });
        }
        window.setRoads([{ uid: "rd_ac", type: "principal", level: 0, points: [P(-70, 0), P(70, 0)] }]);
        // Itinéraire par-dessus le cône (mixte) : ruban sur le dessus (0,6 m + 5 cm), jamais dedans.
        window.setPlanRenduVue3D(null, "mixte");
        G.invalider();
        const zc = r.mixte.vol.pc.z, Pl = function (x, z) { return Object.assign({ level: 0 }, P(x, z)); };
        const ipts = [Pl(-26, zc), Pl(-14, zc)];
        window.setVue3DGuidage(true);
        window.setRoads([{ uid: "rd_ac", type: "principal", level: 0, points: [P(-70, 0), P(70, 0)] },
          { uid: "rd_ac_i", type: "itinerary", level: 0, points: ipts,
            raccords: [{ role: "depart", vers: { x: ipts[0].x, y: ipts[0].y } },
              { role: "arrivee", label: "Arrivée fictive", vers: { x: ipts[1].x, y: ipts[1].y } }] }]);
        await K.ouvrir({ depart: Object.assign({ cap: 90 }, P(-25, zc + 0.6)), tuiles: false });
        await pause(300);
        r.iti = (K.etat({ profilIti: true }).itineraire.profil || []).map(function (q) {
          return [+(q[0] - a.ox).toFixed(2), q[1], q[2], q[3]];
        });
        await K.fermer();
        // Itinéraire sur l'axe le long du bassin (galerie principale) : le passage de 0,8 m est contre l'autre paroi,
        // le bassin couvre l'axe ; le ruban monte sur la margelle (0,4 m + 5 cm), jamais dans l'eau.
        const ipe = [Pl(4, 0), Pl(16, 0)];
        window.setRoads([{ uid: "rd_ac", type: "principal", level: 0, points: [P(-70, 0), P(70, 0)] },
          { uid: "rd_ac_ipe", type: "itinerary", level: 0, points: ipe,
            raccords: [{ role: "depart", vers: { x: ipe[0].x, y: ipe[0].y } },
              { role: "arrivee", label: "Arrivée fictive", vers: { x: ipe[1].x, y: ipe[1].y } }] }]);
        await K.ouvrir({ depart: Object.assign({ cap: 90 }, P(5, 0)), tuiles: false });
        await pause(300);
        r.itiPe = (K.etat({ profilIti: true }).itineraire.profil || []).map(function (q) {
          return [+(q[0] - a.ox).toFixed(2), q[1], q[2], q[3]];
        });
        await K.fermer();
        // Arrivée d'un itinéraire 2D sur le cavage fermé : chemin du Pathfinder jusqu'au POI (décalé de 2 m).
        const caf = pois.filter(function (p) { return p.tags[0] === "caf"; })[0];
        window.setRoads([{ uid: "rd_ac", type: "principal", level: 0, points: [P(-70, 0), P(70, 0)] }]);
        G.invalider();
        const route = await window.Pathfinder.computeRoute([P(15, 0), { x: caf.x, y: caf.y }],
          { allowedTypes: ["principal"] });
        const chemin = (route.path || []).map(function (q) { return { x: q.x, y: q.y, level: 0 }; });
        const fin = chemin[chemin.length - 1];
        window.setRoads([{ uid: "rd_ac", type: "principal", level: 0, points: [P(-70, 0), P(70, 0)] },
          { uid: "rd_ac_c", type: "itinerary", level: 0, points: chemin,
            raccords: [{ role: "depart", vers: { x: chemin[0].x, y: chemin[0].y } },
              { role: "arrivee", label: "ac caf", vers: { x: caf.x, y: caf.y } }] }]);
        await K.ouvrir({ depart: Object.assign({ cap: 90 }, P(22, 0)), tuiles: false });
        if (K.etat().mode !== "libre") K.basculerSuivi();
        for (let i = 0; i < 100; i++) K.avancer(0.1);
        await pause(600);
        const pf = K.etat().pos, eb = K.etat().bandeau;
        r.arrivee = { fin: [+(fin.x / sc - a.ox).toFixed(2), +(fin.y / sc - a.oz).toFixed(2)], x: relx(),
          reste: +(Math.hypot(pf.x - fin.x, pf.y - fin.y) / sc).toFixed(2), bandeau: eb,
          coince: G.dansZone(pf.x, pf.y, 0, "mixte") };
        const xa = relx();
        K.placer(pf.x, pf.y, 270);
        for (let i = 0; i < 10; i++) K.avancer(0.2);
        r.arrivee.recul = +Math.abs(relx() - xa).toFixed(2);
        await K.fermer();
        window.setRoads([{ uid: "rd_ac", type: "principal", level: 0, points: [P(-70, 0), P(70, 0)] }]);
        // 🧱 coupé : couleurs unies, obstacles gardés.
        window.setVue3DTextures(false);
        G.invalider();
        await K.ouvrir({ depart: Object.assign({ cap: 90 }, P(-60, 0)), distanceVue: 200, tuiles: false });
        await pause(50);
        r.coupe = { vol: {} };
        K.etat().volumes.forEach(function (v) { if (v.acces) r.coupe.vol[v.tag] = v; });
        r.coupe.caf = marcher(26, 0, 80);
        await K.fermer();
        window.setVue3DTextures(true);
        // Mesures : ouverture avec et sans ces POI, temps de avancer (médiane, max) le long des accès.
        const mesure = async function () {
          G.invalider();
          const t0 = performance.now();
          await K.ouvrir({ depart: Object.assign({ cap: 90 }, P(-56, 0)) });
          const ouv = performance.now() - t0, ts = [];
          for (let i = 0; i < 120; i++) {
            const t1 = performance.now();
            K.avancer(0.5);
            ts.push(performance.now() - t1);
          }
          await K.fermer();
          ts.sort(function (x, y) { return x - y; });
          return { ouverture: Math.round(ouv), med: +ts[60].toFixed(2), max: +ts[119].toFixed(2) };
        };
        window.setPlanRenduVue3D(null, "mixte");
        window.setEditorPoints([]);
        r.perfSans = await mesure();
        window.setEditorPoints(pois);
        r.perfAvec = await mesure();
        r.inchanges = JSON.stringify(window.getEditorPoints()) === avantPts;
        window.ktaEstAccessible = acc;
        r.T = T;
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      if (CAPTURES) {
        for (const t of AC.T) {
          await page.evaluate(async function (q) {
            const P = function (x, z) { return { x: (q.ox + x) * q.sc, y: (q.oz + z) * q.sc }; };
            window.KtaGalerie.invalider();
            const d = P(q.x - 3.5, 0);
            await window.KtaVue3D.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, tuiles: false });
          }, { ox: MX.ox, oz: MX.oz, sc: MX.sc, x: t[1] });
          await page.waitForTimeout(500);
          await capture(page, "acces-" + t[0]);
          await page.evaluate(function () { return window.KtaVue3D.fermer(); });
        }
      }
      await page.evaluate(function () {
        window.setEditorPoints([]); window.setRoads([]); window.KtaGalerie.invalider();
      });
      verifier(AC.moyens.every(function (m) { return m[1] === null && m[2] === false; }),
        "accès : aucun des 9 tags n'a de moyen ni de niveaux (ni 🪜, ni itinéraire, ni coût vertical)", AC.moyens);
      const prAc = function (v, att, tol) { return typeof v === "number" && Math.abs(v - att) <= (tol || 0.02); };
      ["mixte", "galerie", "structures"].forEach(function (k) {
        const o = AC[k], V = o.vol, h = o.h, tube = k !== "structures";
        const manque = AC.T.filter(function (t) { return !V[t[0]] || !V[t[0]].construit; }).map(function (t) { return t[0]; });
        verifier(manque.length === 0, k + " : un volume construit par accès (9 tags)", manque);
        if (manque.length) return;
        verifier(AC.T.every(function (t) { return !V[t[0]].passage && !V[t[0]].cadre && !o.echelle[t[0]]; }),
          k + " : aucun accès n'a de 🪜 ni de cadre doré", o.echelle);
        // Place : en galerie / mixte dans le tube (demi-emprise comprise), porte sur l'axe, esf en niche (centre à
        // 1,25 + 1,25 m de l'axe) ; en structures au POI.
        const demi = { esf: 0.75, pef: 0.6, pb: 0.6, pc: 0.9, psf: 1.25, ps: 1.25, pe: 1, cao: Infinity, caf: Infinity };
        verifier(AC.T.every(function (t) {
          const v = V[t[0]];
          // Bassin : 0,8 m libre jusqu'à la paroi d'en face (−1,25) → centre à 0,55 dans un tube de 2,5 m.
          const zt = t[0] === "pe" ? 0.55 : t[0] === "esf" ? 2.5 : Math.max(0, 1.25 - demi[t[0]]);
          return prAc(v.x, t[1]) && (tube ? prAc(v.z, zt) : prAc(v.z, 2));
        }), k + (tube ? " : volume ramené dans le tube du côté du POI (au plus w − demi-emprise de l'axe), porte sur " +
          "l'axe, esf en niche" : " : volume au point du POI"), AC.T.map(function (t) { return [t[0], V[t[0]].x, V[t[0]].z]; }));
        const esf = V.esf, pef = V.pef, pb = V.pb, pc = V.pc, psf = V.psf, ps = V.ps, pe = V.pe, cao = V.cao, caf = V.caf;
        verifier(esf.forme === "escalier" && esf.ferme && esf.plafond && !esf.ciel && !esf.cielVu &&
          esf.bouchesPlafond > 0 && prAc(esf.dalleY, h + 2.5) && pef.forme === "puits" && pef.echelons && pef.ferme &&
          !pef.cielVu && prAc(pef.dalleY, h + 2.5),
          k + " : esf / pef = volume d'eso / peo (marches, échelons) fermé par une dalle sombre, sans ciel", [esf, pef]);
        verifier(pb.bouchee && pb.bouchesPlafond === 0 && pb.bouchesSol === 0 && prAc(pb.dalleY, h - 0.06) &&
          pb.yMax <= h + 0.001, k + " : pb = dalle maçonnée au ras du plafond, plafond non troué", pb);
        verifier(pc.comble && pc.bouchesPlafond > 0 && pc.cone && pc.cone.R === 0.9 && pc.remblais > 0 &&
          pc.remblaisTexture && prAc(pc.combleY, h + 0.5) && psf.comble && psf.forme === "rond" &&
          psf.bouchesPlafond === 14 && psf.cone && psf.remblais > 0,
          k + " : pc / psf = bouche au plafond (carrée / ronde) remplie de remblais texturé, cône d'éboulis au sol",
          [pc, psf]);
        verifier(ps.forme === "rond" && !ps.echelons && ps.cielVu && ps.bouchesPlafond === 14 && prAc(ps.yMax, h + 6) &&
          ps.bouchesSol === 0 && prAc(ps.diam, 2.5) && prAc(psf.diam, 2.5),
          k + " : ps = puits rond maçonné de 2,5 m (psf aussi), sans échelons, ciel au sommet", [ps.diam, psf.diam]);
        verifier(pe.bassin && pe.bouchesSol === 14 && pe.bouchesPlafond === 0 && pe.eau > 0 && prAc(pe.eauY, -0.8) &&
          prAc(pe.yMin, -1.2) && prAc(pe.margelleH, 0.4),
          k + " : pe = bassin creusé (bouche au sol), margelle de 0,4 m, eau à −0,8 m", pe);
        const lg = 2.5;
        verifier(cao.porte && cao.ouvert && caf.porte && !caf.ouvert && prAc(cao.largeur, lg) && prAc(caf.largeur, lg) &&
          cao.bois > 0 && caf.bois > 0 && cao.porteTexturee && caf.porteTexturee &&
          caf.battants.every(function (b) { return Math.abs(b[0]) < 0.05 && Math.abs(b[1]) < 0.05; }) &&
          cao.battants.every(function (b) {
            return b[1] - b[0] > 1 && Math.abs(Math.max(Math.abs(b[2]), Math.abs(b[3])) - 1.13) < 0.01;
          }),
          k + " : cavage = porte à deux battants de bois texturé, largeur de la galerie (2,5 m) ; fermée en travers, " +
          "ouverte à 90° contre les parois", [cao, caf]);
        // Blocage : départ 4 m avant (x − 4), 8 m de marche. Bord ouest de l'obstacle : cône 0,9 m, porte 0,1 m ;
        // arrêt entre 0,3 et 0,7 m avant (corps 0,4 m, pas de 0,1 m).
        const bord = { pc: 0.9, psf: 0.9, caf: 0.1 }, M = o.marche;
        const arrete = function (tag, x) { const b = x - bord[tag]; return M[tag] < b - 0.3 && M[tag] > b - 0.75; };
        verifier(arrete("pc", -20) && arrete("psf", -10) && arrete("caf", 30) &&
          M.cafBord1 < 29.6 && M.cafBord2 < 29.6,
          k + " : cône (pc, psf) et cavage fermé (caf, sur toute sa largeur) arrêtent le pas", M);
        verifier(M.esf > -46.5 && M.pef > -36.5 && M.pb > -26.5 && M.ps > 3.5 && M.pe > 13.5 && M.peCote > 13.5 &&
          M.cao > 23.5, k + " : esf, pef, pb, ps, bassin (pe : par son centre et en le longeant) et cavage ouvert (cao) " +
          "ne bloquent pas : on passe", M);
        verifier(["pc", "caf"].every(function (t) {
          const q = o.dedans[t];
          return q.degage >= 1 && !q.dans && q.parcouru > 1;
        }), k + " : départ dans le cône ou la porte fermée : ramené au bord, on repart", o.dedans);
      });
      verifier(["mixte", "galerie"].every(function (k) {
        const c = AC.contre[k];
        // Rayon 1 m (margelle comprise), passage libre = (z − 1) − (−w) ; centre du côté du POI.
        return prAc(c[0], 0.55) && prAc(c[1], -0.55) && prAc(c[2], 40.95) && c[2] - 1 - (40 - 0.85) >= 0.8 - 0.005 &&
          c[2] > 40;
      }) && prAc(AC.contre.structures[0], 0.1) && prAc(AC.contre.structures[2], 42),
        "bassin (pe) contre la paroi du côté du POI, enfoncé dans SA paroi pour laisser 0,8 m jusqu'à la paroi d'en " +
        "face (tube de 2,5 m : centre à 0,55 m, POI près de l'axe ou de l'autre côté ; chemin de 1,7 m : 0,95 m, " +
        "centre jamais au-delà de l'axe) ; structures : au point", AC.contre);
      const pePlat = AC.itiPe.filter(function (q) { return q[0] > 9.3 && q[0] < 10.7; });   // corde de ±0,83 m
      verifier(pePlat.length >= 1 && pePlat.every(function (q) { return q[2] > 0.4; }),
        "mixte : le ruban de l'itinéraire sur l'axe passe sur la margelle du bassin (tube de 2,5 m : le bassin couvre " +
        "l'axe, le passage libre est contre l'autre paroi), jamais dans l'eau", pePlat.slice(0, 4));
      const horAc = AC.iti.filter(function (q) { return q[3] - q[2] < 0.01; });
      const surCone = horAc.filter(function (q) { return q[0] > -20.6 && q[0] < -19.4; });
      verifier(surCone.length >= 1 && surCone.every(function (q) { return prAc(q[2], 0.65, 0.015); }) &&
        horAc.every(function (q) { return !(q[0] > -20.8 && q[0] < -19.2 && q[2] < 0.6); }),
        "mixte : le ruban de l'itinéraire passe par-dessus le cône d'éboulis (0,6 m + 5 cm), jamais dedans",
        { sur: surCone.slice(0, 4), n: horAc.length });
      verifier(AC.arrivee.reste <= 1 && !AC.arrivee.coince && AC.arrivee.recul > 1 && AC.arrivee.bandeau.affiche &&
        /arriv/i.test(AC.arrivee.bandeau.principal || ""),
        "cavage fermé : l'arrivée de l'itinéraire 2D (bout du chemin " + JSON.stringify(AC.arrivee.fin) + ") est " +
        "atteinte devant la porte (" + AC.arrivee.reste + " m), bandeau d'arrivée, on repart", AC.arrivee);
      const cvA = AC.coupe.vol;
      verifier(cvA.cao && cvA.cao.bois === 0 && !cvA.cao.porteTexturee && cvA.caf.bois === 0 && cvA.pc.remblais === 0 &&
        !cvA.pc.remblaisTexture && cvA.pc.triangles > 0 && cvA.cao.triangles > 0 && AC.coupe.caf < 29.6,
        "🧱 coupé : battants et remblais en couleur unie (aucune texture), porte fermée toujours bloquante", AC.coupe);
      verifier(JSON.stringify(AC.sans) === JSON.stringify(AC.avec) && AC.appels2D === 0 && AC.inchanges,
        "2D intacte : recalage du tracker autour des 9 POI, itinéraire et pas du tracker identiques sans et avec eux ; " +
        "règles d'obstacles de la 3D appelées " + AC.appels2D + " fois par la 2D ; POI enregistrés inchangés",
        { sans: AC.sans, avec: AC.avec });
      ok("mesure (info) : ouverture sans / avec les 9 accès " + AC.perfSans.ouverture + " / " + AC.perfAvec.ouverture +
        " ms ; avancer médiane " + AC.perfSans.med + " / " + AC.perfAvec.med + " ms, max " + AC.perfSans.max + " / " +
        AC.perfAvec.max + " ms ; ouverture par rendu (mixte, galerie, structures) " +
        [AC.mixte.ms, AC.galerie.ms, AC.structures.ms].join(" / ") + " ms");

      // ── 14 sexies. Cavage comblé : galerie de 4 m entre deux murs, porte de la largeur du tracé (fictifs) ─────────
      // Principal (porte de 2,5 m) entre deux murs dont la face est à ±2 m de l'axe : de chaque côté, 0,75 m de pierre
      // de taille du cadre au mur, jusqu'au plafond ; tracé décalé de 0,5 m : côtés inégaux (1,25 / 0,25 m). Porte
      // fermée (caf) : on ne passe nulle part ; ouverte (cao) : par l'ouverture seulement. Rendu galerie : la porte
      // touche les parois du tube, rien ne change (aucun comblement, volume identique sans et avec les murs).
      const CB = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, G = window.KtaGalerie, sc = a.sc;
        const P = function (x, z) { return { x: (a.ox + x) * sc, y: (a.oz + z) * sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        window.ktaSetActiveLevel(0);
        window.setVue3DTextures(true);
        window.setZones([]);
        const murs = [
          { uid: "st_cb_n", type: "mur", level: 0, points: [P(-20, 2), P(20, 2), P(20, 2.6), P(-20, 2.6)] },
          { uid: "st_cb_s", type: "mur", level: 0, points: [P(-20, -2.6), P(20, -2.6), P(20, -2), P(-20, -2)] }];
        const route = function (z) {
          window.setRoads([{ uid: "rd_cb", type: "principal", level: 0, points: [P(-40, z), P(40, z)] }]);
        };
        const poser = function (tag, z) {
          window.setEditorPoints([Object.assign({ id: "cb " + tag, nom: "cb " + tag, uid: "pt_cb_" + tag, level: 0,
            tags: [tag] }, P(0, z))]);
        };
        const relx = function () { return +(K.etat().pos.x / sc - a.ox).toFixed(2); };
        const marcher = function (x0, z, n) {
          const d = P(x0, z);
          K.placer(d.x, d.y, 90);
          for (let i = 0; i < n; i++) K.avancer(0.1);
          return relx();
        };
        const vol = function () {
          return K.etat().volumes.filter(function (v) { return v.acces && v.porte; })[0] || null;
        };
        const ouvrir = async function () {
          G.invalider();
          const d = P(-6, 0);
          await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, distanceVue: 60, tuiles: false });
          await pause(50);
        };
        const r = {};
        // Témoin : murs seuls, sans porte, on longe le mur (centre à 1,5 m de l'axe) d'un bout à l'autre.
        window.setStructures(murs); route(0); window.setEditorPoints([]);
        window.setPlanRenduVue3D(null, "mixte");
        await ouvrir();
        r.temoin = { axe: marcher(-4, 0, 80), bordN: marcher(-4, 1.5, 80), bordS: marcher(-4, -1.5, 80) };
        await K.fermer();
        for (const rendu of ["mixte", "structures", "galerie"]) {
          window.setPlanRenduVue3D(null, rendu);
          const o = r[rendu] = {};
          for (const tag of ["caf", "cao"]) {
            route(0); poser(tag, 0);
            await ouvrir();
            const v = vol();
            o[tag] = { comble: v && v.comble, combleUni: v && v.combleUni, largeur: v && v.largeur,
              triangles: v && v.triangles, battants: v && v.battants,
              api: G.comblementPorte(P(0, 0).x, P(0, 0).y, 0, 1.25 * sc, 0, rendu),
              axe: marcher(-4, 0, 80), n1: marcher(-4, 1.0, 80), s1: marcher(-4, -1.0, 80),
              n16: marcher(-4, 1.5, 80), s16: marcher(-4, -1.5, 80) };
            // Retour par l'ouverture (cao) : depuis l'est, vers l'ouest.
            const d = P(4, 0);
            K.placer(d.x, d.y, 270);
            for (let i = 0; i < 80; i++) K.avancer(0.1);
            o[tag].retour = relx();
            await K.fermer();
            // Côtés inégaux : tracé à z = 0,5, porte sur l'axe.
            route(0.5); poser(tag, 0.5);
            await ouvrir();
            const w = vol();
            o[tag].inegal = { comble: w && w.comble, s16: marcher(-4, -1.5, 80), axe: marcher(-4, 0.5, 80) };
            await K.fermer();
            // Rendu galerie : le même volume sans les murs (comparaison).
            if (rendu === "galerie") {
              window.setStructures([]); route(0); poser(tag, 0);
              await ouvrir();
              const s = vol();
              o[tag].sansMurs = { comble: s && s.comble, largeur: s && s.largeur, triangles: s && s.triangles,
                battants: s && s.battants };
              await K.fermer();
              window.setStructures(murs);
            }
          }
        }
        // 🧱 coupé : comblement uni, toujours bloquant.
        window.setPlanRenduVue3D(null, "mixte");
        window.setVue3DTextures(false);
        route(0); poser("caf", 0);
        await ouvrir();
        const u = vol();
        r.uni = { comble: u && u.comble, combleUni: u && u.combleUni, s16: marcher(-4, -1.5, 80) };
        // Galerie de 3 m : paroi au-dessus du linteau (2,1 m + cadre), même couleur unie que le comblement.
        const h0 = K.etat().hauteur;
        K.reglerHauteur(3);
        await pause(50);
        const u3 = vol();
        r.uni.haut = { tympan: u3 && u3.tympan, tympanUni: u3 && u3.tympanUni, combleUni: u3 && u3.combleUni };
        await K.fermer();
        window.setVue3DTextures(true);
        await ouvrir();
        K.reglerHauteur(3);
        await pause(50);
        const t3 = vol();
        r.uni.pierre = { tympan: t3 && t3.tympan, tympanUni: t3 && t3.tympanUni, combleUni: t3 && t3.combleUni };
        K.reglerHauteur(h0);
        await K.fermer();
        window.ktaEstAccessible = acc;
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      if (CAPTURES) {
        for (const tag of ["caf", "cao"]) {
          await page.evaluate(async function (q) {
            const P = function (x, z) { return { x: (q.ox + x) * q.sc, y: (q.oz + z) * q.sc }; };
            window.ktaSetActiveLevel(0);
            window.setPlanRenduVue3D(null, "mixte");
            window.setStructures([
              { uid: "st_cb_n", type: "mur", level: 0, points: [P(-20, 2), P(20, 2), P(20, 2.6), P(-20, 2.6)] },
              { uid: "st_cb_s", type: "mur", level: 0, points: [P(-20, -2.6), P(20, -2.6), P(20, -2), P(-20, -2)] }]);
            window.setRoads([{ uid: "rd_cb", type: "principal", level: 0, points: [P(-40, 0.5), P(40, 0.5)] }]);
            window.setEditorPoints([Object.assign({ id: "cb", nom: "cb", uid: "pt_cb", level: 0, tags: [q.tag] },
              P(0, 0.5))]);
            window.KtaGalerie.invalider();
            const d = P(-3.5, 0);
            await window.KtaVue3D.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, tuiles: false });
          }, { ox: MX.ox, oz: MX.oz, sc: MX.sc, tag: tag });
          await page.waitForTimeout(800);
          await capture(page, "cavage-comble-" + tag);
          await page.evaluate(function () { return window.KtaVue3D.fermer(); });
        }
      }
      await page.evaluate(function () {
        window.setEditorPoints([]); window.setRoads([]); window.setStructures([]); window.KtaGalerie.invalider();
        window.setPlanRenduVue3D(null, "mixte");
      });
      const bloque = function (x) { return typeof x === "number" && x < -0.3; };   // arrêté avant le plan de la porte
      const passe = function (x) { return typeof x === "number" && x > 3.5; };
      verifier(passe(CB.temoin.axe) && passe(CB.temoin.bordN) && passe(CB.temoin.bordS),
        "cavage comblé (témoin) : sans porte, on longe les deux murs d'une galerie de 4 m", CB.temoin);
      ["mixte", "structures"].forEach(function (k) {
        const o = CB[k], F = o.caf, O = o.cao;
        const egal = function (c, x, y) {
          return Array.isArray(c) && Math.abs(c[0] - x) < 0.02 && Math.abs(c[1] - y) < 0.02;
        };
        verifier(egal(F.comble, 0.75, 0.75) && egal(O.comble, 0.75, 0.75) && egal(F.api, 0.75, 0.75) &&
          F.largeur === 2.5 && O.largeur === 2.5 && F.combleUni === false,
          k + " : la porte garde 2,5 m (tracé principal), pierre de taille de 0,75 m de chaque côté jusqu'aux murs",
          { caf: F, cao: O });
        const ci = F.inegal.comble, oi = O.inegal.comble;
        const inegal = function (c) {
          return Array.isArray(c) && Math.abs(Math.min(c[0], c[1]) - 0.25) < 0.02 &&
            Math.abs(Math.max(c[0], c[1]) - 1.25) < 0.02;
        };
        verifier(inegal(ci) && inegal(oi) && bloque(F.inegal.s16) && bloque(O.inegal.s16) && bloque(F.inegal.axe) &&
          passe(O.inegal.axe),
          k + " : tracé décalé de 0,5 m, côtés inégaux (0,25 / 1,25 m), le grand côté bloque, l'ouverture passe",
          { caf: F.inegal, cao: O.inegal });
        verifier(bloque(F.axe) && bloque(F.n1) && bloque(F.s1) && bloque(F.n16) && bloque(F.s16),
          k + " : porte fermée, on ne passe ni par elle ni à côté (comblement des deux côtés)", F);
        verifier(passe(O.axe) && O.retour < -3.5 && bloque(O.n16) && bloque(O.s16),
          k + " : porte ouverte, on passe par son ouverture (aller et retour), jamais à côté", O);
      });
      const GF = CB.galerie.caf, GO = CB.galerie.cao;
      verifier(GF.comble[0] === 0 && GF.comble[1] === 0 && GO.comble[0] === 0 && GO.comble[1] === 0 &&
        GF.api[0] === 0 && GF.api[1] === 0 &&
        JSON.stringify([GF.largeur, GF.triangles, GF.battants]) ===
        JSON.stringify([GF.sansMurs.largeur, GF.sansMurs.triangles, GF.sansMurs.battants]) &&
        JSON.stringify([GO.largeur, GO.triangles, GO.battants]) ===
        JSON.stringify([GO.sansMurs.largeur, GO.sansMurs.triangles, GO.sansMurs.battants]) &&
        bloque(GF.axe) && bloque(GF.n1) && bloque(GF.s1) && passe(GO.axe),
        "rendu galerie : la porte touche les parois du tube, aucun comblement, volume identique sans et avec les murs",
        { caf: GF, cao: GO });
      verifier(CB.uni.combleUni === true && CB.uni.comble[0] > 0.7 && bloque(CB.uni.s16),
        "🧱 coupé : comblement en couleur unie, toujours bloquant", CB.uni);
      verifier(CB.uni.haut.tympan === true && CB.uni.haut.tympanUni === true && CB.uni.haut.combleUni === true &&
        CB.uni.pierre.tympan === true && CB.uni.pierre.tympanUni === false && CB.uni.pierre.combleUni === false,
        "mur de porte homogène (galerie de 3 m) : paroi au-dessus du linteau et comblement unis avec 🧱 coupé, en " +
        "pierre de taille avec 🧱", CB.uni);

      // ── 14 quinquies. Escaliers en niche latérale (esf, eso, jes), fictifs ────────────────────────────────────────
      // Une galerie principale par cas (paroi à 1,25 m), à 15 m d'écart, dessinée dans les deux sens. Attendu
      // (KtaGalerie.placePassage > niche, décision produit : jamais en plein milieu de la galerie) : volée
      // perpendiculaire à l'axe, dans une niche du côté du POI (POI sur l'axe : à gauche du sens du tracé), centre à
      // 1,25 + 1,25 m de l'axe, pied contre la paroi (haut de la volée qui monte au fond de la niche, marche la plus
      // haute de celle qui descend contre la paroi ; entre trois niveaux, les deux) ; bouche hors du passage de la
      // galerie ; niche marchable (dedans, pas de l'axe à la niche, ctx.libre des add-ons), paroi de la galerie ouverte
      // devant elle, fond muré. POI au-delà du bout d'un cul-de-sac : volée dans l'axe vers le fond, sans niche.
      // Raccord validé du niveau : en niche aussi, à sa place exacte le long de la galerie, du côté du raccord (sur
      // l'axe : à gauche du tracé), le POI ailleurs. Rendu structures : le point (le raccord s'il y en a un). 2D intacte
      // (recalage, itinéraire, pas du tracker et de la galerie).
      const MS = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, G = window.KtaGalerie, sc = a.sc;
        const P = function (x, z) { return { x: (a.ox + x) * sc, y: (a.oz + z) * sc }; };
        const acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        window.ktaSetActiveLevel(0);
        window.setStructures([]); window.setZones([]);
        // [nom, tag, niveaux, x0 → x1 du tracé, POI (x, z), côté de la niche (+1 / −1 ; "gauche" : sens du tracé ;
        // 0 : bout de cul-de-sac, volée dans l'axe vers +x), raccord validé au niveau 0 (x, z) facultatif]
        const C = [["mn esf cote", "esf", null, -30, 30, 0, 1.5, 1], ["mn eso loin", "eso", null, -30, 30, 5, -4, -1],
          ["mn esf dedans", "esf", null, -30, 30, -5, 0.5, 1], ["mn esf axe", "esf", null, -30, 30, 0, 0, "gauche"],
          ["mn esf fond", "esf", null, -60, 0, 2, 0.5, 0]];
        if (a.multi) {
          C.push(["mn jes bas", "jes", [0, -1], -30, 30, 0, 2, 1], ["mn jes haut", "jes", [0, 1], -30, 30, 0, -2, -1],
            ["mn jes trois", "jes", [-1, 0, 1], -30, 30, 0, 3, 1],
            ["mn jes raccord", "jes", [0, -1], -30, 30, 0, 6, 1, [3, 0.4]],
            ["mn jes raccord axe", "jes", [0, -1], -30, 30, 0, -6, "gauche", [-4, 0]]);
        }
        const roads = [], pois = [], cas = [];
        C.forEach(function (c, i) {
          [false, true].forEach(function (inv, j) {
            // Rangées de part et d'autre du centre du plan : un pas jugé hors de l'image est refusé (_balayage).
            const z = (2 * i + j - C.length) * 15, id = c[0] + (inv ? " inverse" : "");
            const pts = [P(c[3], z), P(c[4], z)];
            roads.push({ uid: "rd_ms_" + i + "_" + j, type: "principal", level: 0, points: inv ? pts.reverse() : pts });
            const o = Object.assign({ id: id, nom: id, uid: "pt_ms_" + i + "_" + j, level: 0, tags: [c[1]] },
              P(c[5], z + c[6]));
            if (c[2]) o.niveaux = c[2];
            if (c[8]) o.accroches = [Object.assign({ level: 0 }, P(c[8][0], z + c[8][1]))];
            pois.push(o);
            // Carte nord en haut, plan en y vers le bas : la gauche d'un tracé vers +x est −z.
            const cote = c[7] === "gauche" ? (inv ? 1 : -1) : c[7];
            const st = c[8] ? [c[8][0], z + c[8][1]] : [c[5], z + c[6]];
            cas.push({ nom: id, x: st[0], z: z, pz: c[6], cote: cote, st: st });
          });
        });
        // Boucle (rectangle de 20 × 10 m), POI à 1,5 m sous son bord sud : niche aussi.
        const zb = C.length * 15;
        roads.push({ uid: "rd_ms_boucle", type: "principal", level: 0,
          points: [P(-10, zb), P(10, zb), P(10, zb + 10), P(-10, zb + 10), P(-10, zb)] });
        const boucle = Object.assign({ id: "ms esf boucle", nom: "ms esf boucle", uid: "pt_ms_boucle", level: 0,
          tags: ["esf"] }, P(0, zb - 1.5));
        cas.push({ nom: boucle.nom, x: 0, z: zb, pz: -1.5, cote: -1, st: [0, zb - 1.5] });
        const tous = pois.concat([boucle]);
        window.setRoads(roads);
        // 2D : recalage autour de chaque POI et devant chaque niche, itinéraire, pas du tracker : sans puis avec.
        const deux = async function () {
          G.invalider();
          const rec = [];
          cas.forEach(function (c) {
            [c.pz, 1.2 * (c.cote || 1), 2.5 * (c.cote || 1)].forEach(function (dz) {
              const q = P(c.x, c.z + dz), v = G.versGalerie(q.x, q.y, 0);
              rec.push([v.etat, +(v.x / sc - a.ox).toFixed(3), +(v.y / sc - a.oz).toFixed(3)]);
            });
          });
          let it;
          try {
            const ri = await window.Pathfinder.computeRoute([P(-25, 0), P(25, 0)], { allowedTypes: ["principal"] });
            it = { d: Math.round(ri.totalDistance), n: (ri.path || []).length };
          } catch (e) { it = String(e && e.message); }
          const seg = [[P(-25, 0).x, P(-25, 0).y, P(25, 0).x, P(25, 0).y]];
          return { rec: rec, iti: it, pas: window.ktaSegmentsBloquesParStructure(seg, 0),
            galerie: G.segmentsBloques(seg, 0) };
        };
        window.setEditorPoints([]);
        const r = { sans: await deux(), cas: cas };
        window.setEditorPoints(tous);
        const avantPts = JSON.stringify(window.getEditorPoints());
        r.avec = await deux();
        r.places = {};
        r.vol = {};
        r.niche = {};
        for (const rendu of ["mixte", "galerie", "structures"]) {
          window.setPlanRenduVue3D(null, rendu);
          G.invalider();
          r.places[rendu] = tous.map(function (p) {
            const pl = G.placePassage(p, 0, rendu);
            return pl ? { x: +(pl.x / sc - a.ox).toFixed(3), z: +(pl.y / sc - a.oz).toFixed(3), niche: !!pl.niche,
              entree: pl.entree } : null;
          });
          const d = P(0, 0);
          await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, distanceVue: 400, tuiles: false });
          await new Promise(function (ok) { setTimeout(ok, 50); });
          let ctx = null;
          const retirer = K.greffer({ nom: "ms-niche", scene: function (c) { ctx = c; } });
          r.vol[rendu] = K.etat().volumes.filter(function (v) { return v.genre === "poi" && v.forme === "escalier"; })
            .map(function (v) {
              const m = v.marches || {};
              const rel = function (q) { return q ? [+(q[0] - a.ox).toFixed(2), +(q[1] - a.oz).toFixed(2)] : null; };
              return { x: +(v.x / sc - a.ox).toFixed(2), z: +(v.y / sc - a.oz).toFixed(2), tag: v.tag, sol: v.sol,
                plafond: v.plafond, construit: v.construit, haut: rel(m.haut), entreeBas: rel(m.entreeBas),
                bouche: v.bouche.map(function (q) { return [+(q[0] - a.ox).toFixed(3), +(q[1] - a.oz).toFixed(3)]; }) };
            });
          if (rendu !== "structures") {
            // Niche : marchable (règle du pas de la 3D, ctx des add-ons), paroi de la galerie ouverte devant elle,
            // fond muré. Parois du modèle de ce rendu (celles que la 3D dessine et contre lesquelles le mixte bute).
            const m = G.modele(0, rendu === "mixte");
            const parois = function (x0, z0, x1, z1) {
              const out = [];
              m.piecesPres(P(x0, z0).x, P(x0, z0).y, P(x1, z1).x, P(x1, z1).y).forEach(function (i) {
                m.paroisDe(i).forEach(function (w) {
                  out.push([w[0] / sc - a.ox, w[1] / sc - a.oz, w[2] / sc - a.ox, w[3] / sc - a.oz]);
                });
              });
              return out;
            };
            const touche = function (ws, x, z) {
              return ws.some(function (w) {
                const dx = w[2] - w[0], dz = w[3] - w[1], l2 = dx * dx + dz * dz;
                const t = l2 ? Math.max(0, Math.min(1, ((x - w[0]) * dx + (z - w[1]) * dz) / l2)) : 0;
                return Math.hypot(x - w[0] - t * dx, z - w[1] - t * dz) < 0.01;
              });
            };
            r.niche[rendu] = cas.filter(function (c) { return c.cote; }).map(function (c) {
              const s = c.cote, zc = c.z + s * 2.5, A = P(c.x, c.z), B = P(c.x, zc), F = P(c.x, c.z + s * 4.5);
              const ws = parois(c.x - 3, c.z - 5, c.x + 3, c.z + 5);
              return { nom: c.nom, dedans: G.dedans(B.x, B.y, 0), pas: !G.segmentsBloques([[A.x, A.y, B.x, B.y]], 0)[0],
                fond: G.segmentsBloques([[B.x, B.y, F.x, F.y]], 0)[0],
                libre: !!ctx && ctx.libre(B.x, B.y), ctxPas: !!ctx && !ctx.bloque(A.x, A.y, B.x, B.y),
                ouverte: [-0.6, 0, 0.6].every(function (dx) { return !touche(ws, c.x + dx, c.z + s * 1.25); }),
                muree: touche(ws, c.x, c.z + s * 3.95) };
            });
          }
          if (retirer) retirer();
          await K.fermer();
        }
        r.inchanges = JSON.stringify(window.getEditorPoints()) === avantPts;
        window.setEditorPoints([]); window.setRoads([]); G.invalider();
        window.setPlanRenduVue3D(null, "mixte");
        window.ktaEstAccessible = acc;
        r.roads = roads; r.pois = tous;
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc, multi: G.multi });
      const presMs = function (u, v, tol) { return u !== null && u !== undefined && Math.abs(u - v) <= (tol || 0.02); };
      ["mixte", "galerie"].forEach(function (k) {
        const V = MS.vol[k], faux = [];
        MS.cas.forEach(function (c, i) {
          const v = V.filter(function (q) { return Math.abs(q.z - c.z) < 6 && Math.abs(q.x - c.x) < 6; })[0];
          const pl = MS.places[k][i];
          if (!v || !v.construit || !pl) { faux.push([c.nom, "absent"]); return; }
          if (!c.cote) {
            // Bout de cul-de-sac : dans l'axe, sans niche, la volée qui monte vers le fond (+x).
            if (pl.niche || Math.abs(v.z - c.z) > 1.25 || !v.haut || !(v.haut[0] > v.x)) faux.push([c.nom, v, pl]);
            return;
          }
          const s = c.cote, d = function (q) { return q ? (q[1] - c.z) * s : null; };
          const okPlace = pl.niche && presMs(v.x, c.x) && presMs((v.z - c.z) * s, 2.5);
          const okHaut = !v.plafond || d(v.haut) > 2.5;
          const okBas = !v.sol || (d(v.entreeBas) !== null && d(v.entreeBas) < 2.5);
          const libre = v.bouche.every(function (q) { return (q[1] - c.z) * s >= 1.25 - 0.01; });
          if (!okPlace || !okHaut || !okBas || !libre) faux.push([c.nom, v, pl]);
        });
        verifier(faux.length === 0, k + " : " + MS.cas.length + " escaliers (esf, eso" +
          (G.multi ? ", jes vers −1, +1, entre trois niveaux et au raccord validé" : "") + ", tracé dans les deux " +
          "sens, boucle) en niche " +
          "latérale du côté du POI (sur l'axe : à gauche du tracé), pied contre la paroi, passage de la galerie libre ; " +
          "bout de cul-de-sac dans l'axe vers le fond", faux);
        const N = MS.niche[k], mauvais = N.filter(function (n) {
          return !n.dedans || !n.pas || !n.fond || !n.libre || !n.ctxPas || !n.ouverte || !n.muree;
        });
        verifier(N.length > 0 && mauvais.length === 0, k + " : " + N.length + " niches marchables (pas de l'axe à la " +
          "niche, ctx.libre et ctx.bloque des add-ons), paroi de la galerie ouverte devant, fond muré", mauvais);
      });
      const st = MS.places.structures.filter(function (pl, i) {
        const c = MS.cas[i];
        return !pl || pl.niche || !presMs(pl.x, c.st[0]) || !presMs(pl.z, c.st[1]);
      });
      verifier(st.length === 0, "structures : escalier au point du POI (au raccord validé s'il y en a un), sans niche", st);
      verifier(JSON.stringify(MS.sans) === JSON.stringify(MS.avec) && MS.inchanges,
        "niches d'escalier : 2D intacte (recalage au POI et devant la niche, itinéraire, pas du tracker et de la " +
        "galerie identiques sans et avec les escaliers) ; POI enregistrés inchangés", { sans: MS.sans, avec: MS.avec });
      if (CAPTURES) {
        for (const c of MS.cas.slice(0, 2)) {
          await page.evaluate(async function (q) {
            const P = function (x, z) { return { x: (q.ox + x) * q.sc, y: (q.oz + z) * q.sc }; };
            window.setRoads(q.roads); window.setEditorPoints(q.pois);
            window.KtaGalerie.invalider();
            const d = P(q.x - 5, q.z);   // dans la galerie, la niche sur le côté
            await window.KtaVue3D.ouvrir({ depart: { x: d.x, y: d.y, cap: q.cote > 0 ? 135 : 45 }, tuiles: false });
          }, { ox: MX.ox, oz: MX.oz, sc: MX.sc, x: c.x, z: c.z, cote: c.cote, roads: MS.roads, pois: MS.pois });
          await page.waitForTimeout(500);
          await capture(page, "marches-" + c.nom.replace(/\s+/g, "-"));
          await page.evaluate(function () {
            return window.KtaVue3D.fermer().then(function () {
              window.setEditorPoints([]); window.setRoads([]); window.KtaGalerie.invalider();
            });
          });
        }
      }

      // ── 15. Raccord galerie / structures par côté (mixte), fictif ───────────────────────────────────────────
      // Un tube principal d'ouest en est (z = 0, paroi à 1,25 m) ; « droite » en marchant vers l'est = +z. Cas :
      // A pilier 2 × 2 m dont la face est à 2 m à droite ; B front de 10 m à 2 m à droite ; C piliers des deux
      // côtés (chambre) ; D pilier dans l'axe (bout ouvert). Parois lues dans le modèle (m relatifs), « fente »
      // cherchée par rayons tirés de l'axe vers +z (chaque rayon doit toucher une paroi ou la structure).
      const RC = await page.evaluate(function (a) {
        const P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const carre = function (cx, cz, r) {
          return [P(cx - r, cz - r), P(cx + r, cz - r), P(cx + r, cz + r), P(cx - r, cz + r)];
        };
        window.ktaSetActiveLevel(0);
        window.setPlanRenduVue3D(null, "mixte");
        const cas = {
          A: [{ uid: "st_rc_a", type: "pilier-1", level: 0, points: carre(0, 3, 1) }],
          B: [{ uid: "st_rc_b", type: "front-1", level: 0, points: [P(-5, 2), P(5, 2)] }],
          C: [{ uid: "st_rc_c1", type: "pilier-1", level: 0, points: carre(0, 3, 1) },
            { uid: "st_rc_c2", type: "pilier-1", level: 0, points: carre(0, -3, 1) }],
          D: [{ uid: "st_rc_d", type: "pilier-1", level: 0, points: carre(0, 0, 1) }]
        };
        window.setRoads([{ uid: "rd_rc", type: "principal", level: 0, points: [P(-30, 0), P(30, 0)] }]);
        const rel = function (s) { return [s[0] / a.sc - a.ox, s[1] / a.sc - a.oz, s[2] / a.sc - a.ox, s[3] / a.sc - a.oz]; };
        const out = {};
        Object.keys(cas).forEach(function (k) {
          window.setStructures(cas[k]);
          window.KtaGalerie.invalider();
          const m = window.KtaGalerie.modele(0, true), parois = [];
          for (let i = 0; i < m.pieces.length; i++) m.paroisDe(i).forEach(function (s) { parois.push(rel(s)); });
          const bords = [];
          cas[k].forEach(function (s) {
            const pts = s.points.map(function (q) { return [q.x / a.sc - a.ox, q.y / a.sc - a.oz]; });
            const n = pts.length, fin = s.type === "front-1" ? n - 1 : n;
            for (let i = 0; i < fin; i++) bords.push([pts[i][0], pts[i][1], pts[(i + 1) % n][0], pts[(i + 1) % n][1]]);
          });
          out[k] = { parois: parois, bords: bords, chambres: m.chambres, cotes: m.cotesOuverts,
            retours: m.retours.map(rel), ms: +m.msConstruction.toFixed(1) };
        });
        return out;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      // Couverture d'une ligne z = cote par les parois qui la longent, sur [x0, x1] : longueur couverte (m).
      const couvre = function (parois, cote, x0, x1) {
        let l = 0;
        parois.forEach(function (s) {
          if (Math.abs(s[1] - cote) > 0.02 || Math.abs(s[3] - cote) > 0.02) return;
          const a0 = Math.max(x0, Math.min(s[0], s[2])), a1 = Math.min(x1, Math.max(s[0], s[2]));
          if (a1 > a0) l += a1 - a0;
        });
        return +l.toFixed(2);
      };
      // Rayons de l'axe (x, 0) vers +z sur 4 m : chacun doit toucher une paroi ou un bord de structure.
      const fentes = function (r, x0, x1) {
        const vides = [];
        for (let x = x0; x <= x1 + 1e-9; x += 0.1) {
          const ray = [x, 0, x, 4];
          if (!r.parois.concat(r.bords).some(function (s) { return coupe(ray, s); })) vides.push(+x.toFixed(1));
        }
        return vides;
      };
      const retourOk = function (r, xs) {
        return xs.every(function (x) {
          return r.retours.some(function (s) {
            return Math.abs(s[0] - s[2]) < 0.02 && Math.abs(s[0] - x) < 0.15 && Math.abs(s[1] - 1.25) < 0.02 &&
              Math.abs(s[3] - 2) < 0.05;
          });
        });
      };
      const rA = RC.A, rB = RC.B, rC = RC.C, rD = RC.D;
      verifier(couvre(rA.parois, -1.25, -20, 20) > 39.9 && couvre(rA.parois, 1.25, -0.9, 0.9) === 0 &&
        couvre(rA.parois, 1.25, -20, -3) > 16.9 && couvre(rA.parois, 1.25, 3, 20) > 16.9,
        "par côté (A, pilier à 2 m à droite) : paroi gauche gardée d'un bout à l'autre, droite ouverte devant le pilier",
        { gauche: couvre(rA.parois, -1.25, -20, 20), droiteDevant: couvre(rA.parois, 1.25, -0.9, 0.9), ms: rA.ms });
      verifier(rA.retours.length === 2 && retourOk(rA, [-1, 1]) && fentes(rA, -8, 8).length === 0,
        "par côté (A) : un pan de retour perpendiculaire à chaque bout, du bord du tube (1,25 m) à la face du pilier " +
        "(2 m), aucune fente (rayons tous les 10 cm)", { retours: rA.retours, fentes: fentes(rA, -8, 8).slice(0, 5) });
      verifier(couvre(rB.parois, -1.25, -20, 20) > 39.9 && couvre(rB.parois, 1.25, -4.9, 4.9) === 0 &&
        retourOk(rB, [-5, 5]) && fentes(rB, -10, 10).length === 0,
        "par côté (B, front de 10 m à droite) : gauche gardée, droite ouverte le long du front, pans de retour, aucune " +
        "fente", { droite: couvre(rB.parois, 1.25, -4.9, 4.9), retours: rB.retours, fentes: fentes(rB, -10, 10).slice(0, 5) });
      verifier(couvre(rC.parois, 1.25, -0.9, 0.9) === 0 && couvre(rC.parois, -1.25, -0.9, 0.9) === 0 &&
        rC.retours.length === 0 && rC.parois.every(function (s) { return !coupe(s, [-0.9, 0, 0.9, 0]); }),
        "deux côtés (C) : chambre, aucune paroi de part et d'autre entre les piliers", { parois: rC.parois.length,
          retours: rC.retours.length });
      const enTraversD = rD.parois.filter(function (s) { return coupe(s, [-3.5, 0, 3.5, 0]); });
      verifier(enTraversD.length === 0 && rD.parois.every(function (s) {
        return rD.bords.every(function (b) { return !coupe(s, b); });
      }), "structure dans l'axe (D) : le tube s'arrête sur un bout ouvert, aucune paroi en travers ni à travers le pilier",
      enTraversD.slice(0, 3));
      // Collisions du cas A : on bute à gauche sur la paroi, à droite sur le pilier (corps de 0,8 m).
      const colA = await page.evaluate(function (a) {
        const K = window.KtaVue3D, acc = window.ktaEstAccessible, P = function (x, z) {
          return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc };
        };
        window.ktaEstAccessible = function () { return true; };
        window.setStructures([{ uid: "st_rc_a", type: "pilier-1", level: 0,
          points: [P(-1, 2), P(1, 2), P(1, 4), P(-1, 4)] }]);
        window.KtaGalerie.invalider();
        const d = P(0, 0), r = {};
        const z = function () { return +(K.etat().pos.y / a.sc - a.oz).toFixed(2); };
        return K.ouvrir({ depart: { x: d.x, y: d.y, cap: 0 } }).then(function () {
          for (let i = 0; i < 20; i++) K.avancer(0.2);
          r.gauche = z();
          K.placer(d.x, d.y, 180);
          for (let i = 0; i < 20; i++) K.avancer(0.2);
          r.droite = z();
          K.placer(P(-6, 0).x, d.y, 180);
          for (let i = 0; i < 20; i++) K.avancer(0.2);
          r.droiteLoin = z();
          window.ktaEstAccessible = acc;
          return K.fermer();
        }).then(function () { return r; });
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      verifier(colA.gauche > -0.9 && colA.gauche < -0.75 && colA.droite > 1.5 && colA.droite < 1.65 &&
        colA.droiteLoin > 0.75 && colA.droiteLoin < 0.9,
        "collisions (A) : à gauche on bute sur la paroi (" + colA.gauche + " m), à droite sur le pilier (" + colA.droite +
        " m, face à 2 m), plus loin sur la paroi droite gardée (" + colA.droiteLoin + " m)", colA);

      // ── 16. Itinéraire au sol : ruban de 0,35 m en tirets, liseré, étape et arrivée ─────────────────────────
      const IT = await page.evaluate(function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc, level: 0 }; };
        window.setStructures([]);
        window.KtaGalerie.invalider();
        const pts = [P(-20, 0), P(-10, 0), P(0, 0), P(10, 0)];
        window.setRoads([{ uid: "rd_it_t", type: "principal", level: 0, points: [P(-30, 0), P(30, 0)] },
          { uid: "rd_it", type: "itinerary", level: 0, points: pts,
            raccords: [{ role: "depart", vers: { x: pts[0].x, y: pts[0].y } },
              { role: "etape", label: "Étape fictive", vers: { x: pts[2].x, y: pts[2].y } },
              { role: "arrivee", label: "Arrivée fictive", vers: { x: pts[3].x, y: pts[3].y } }] }]);
        const d = P(-14, 0.3);
        return K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, tuiles: false }).then(function () {
          const e = K.etat();
          const fin = e.panneaux.filter(function (q) { return q.genre === "arrivee"; })[0] || null;
          return { iti: e.itineraire,
            arrivee: fin ? { nom: fin.nom, x: +(fin.x - a.ox).toFixed(2), z: +(fin.z - a.oz).toFixed(2) } : null };
        });
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      if (CAPTURES) { await page.waitForTimeout(600); await capture(page, "itineraire-tirets"); }
      await page.evaluate(function () { return window.KtaVue3D.fermer(); });
      const it = IT.iti;
      verifier(Math.abs(it.ruban - 0.35) < 0.005 && Math.abs(it.lisere - 0.43) < 0.005 &&
        Math.abs(it.longueurTiret - 1.2) < 0.01,
        "itinéraire : ruban de 0,35 m, liseré de 4 cm de chaque côté (0,43 m), tirets de 1,2 m", it);
      // 30 m de trajet en tirets de 1,2 m tous les 1,8 m : 17 tirets (le dernier commence à 28,8 m).
      verifier(it.tirets === 17 && /^#8cb4ff$/i.test(it.couleur) && /^#0a0d18$/i.test(it.couleurLisere),
        "itinéraire : 17 tirets sur 30 m (1,2 m / 0,6 m, « 12 6 » de la carte), --kta-interaction, liseré --kta-fond",
        it);
      verifier(it.etapes === 1 && it.arrivee === true && !!IT.arrivee && IT.arrivee.x === 10 && IT.arrivee.z === 0 &&
        IT.arrivee.nom === "🏁 Arrivée fictive", "itinéraire : un marqueur à l'étape, 🏁 à l'arrivée (panneau)",
        { it: it, arrivee: IT.arrivee });

      // ── 17. Ronds d'intersection de la carte, lus en 3D (option 2D, niveau affiché) ─────────────────────────
      const RD = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const c = window.APP_CONFIG, vis = Array.isArray(c.visibleLevels) ? c.visibleLevels.slice() : null;
        if (Array.isArray(c.availableLevels)) c.visibleLevels = c.availableLevels.slice();
        window.setRoads([
          { uid: "rd_x1", type: "principal", level: 0, points: [P(-10, 0), P(10, 0)] },
          { uid: "rd_x2", type: "chemin", level: 0, points: [P(4, -6), P(4, 6)] },
          { uid: "rd_x3", type: "principal", level: 1, points: [P(-10, 5), P(10, 5)] },
          { uid: "rd_x4", type: "chemin", level: 1, points: [P(-4, -1), P(-4, 9)] }
        ]);
        window.setPlanShowsIntersections(null, false);
        const r = {}, d = P(0, 0.3);
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.sans = K.etat().ronds.length;
        window.setPlanShowsIntersections(null, true);
        await pause(250);
        r.liste2D = window.getRoadIntersections().map(function (q) {
          return [+(q.point.x / a.sc - a.ox).toFixed(2), +(q.point.y / a.sc - a.oz).toFixed(2), q.color, q.level];
        });
        r.avec = K.etat().ronds.map(function (q) {
          return [+(q.x - a.ox).toFixed(2), +(q.z - a.oz).toFixed(2), q.couleur, q.niveau];
        });
        r.couleurChemin = window.ktaResolveStyle("traces", "chemin").color;
        window.setPlanShowsIntersections(null, false);
        await pause(250);
        r.coupe = K.etat().ronds.length;
        await K.fermer();
        if (vis) c.visibleLevels = vis;
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      verifier(RD.sans === 0 && RD.coupe === 0, "ronds : aucun en 3D quand l'option de la carte est coupée", RD);
      // La carte compte aussi les tracés du relevé fictif : la 3D doit montrer exactement ses ronds du niveau 0.
      const du0 = RD.liste2D.filter(function (q) { return !G.multi || q[3] === 0; });
      const ici = RD.avec.filter(function (q) { return q[0] === 4 && q[1] === 0; })[0];
      const au1 = RD.liste2D.filter(function (q) { return q[0] === -4 && q[1] === 5; })[0];
      verifier(RD.avec.length === du0.length && !!ici && ici[2] === RD.couleurChemin && ici[3] === 0 &&
        (!G.multi || (!!au1 && au1[3] === 1 && RD.avec.every(function (q) { return q[3] === 0; }))),
        "ronds : option cochée → les ronds de la carte du niveau affiché (" + RD.avec.length + "), à leur couleur ; " +
        "celui du niveau 1 absent", { avec: RD.avec.length, carte: RD.liste2D.length, ici: ici, au1: au1 });

      // ── 18. Joystick (téléphone) : pointeurs tactiles synthétiques ──────────────────────────────────────────
      // Pointeur grossier simulé (matchMedia) : la vue choisit le joystick sans qu'on le lui dise ; pavé au PC
      // (pointeur fin du navigateur de test) et avec l'option « Pavé classique » de cet appareil.
      const JS = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const acc = window.ktaEstAccessible, mm = window.matchMedia;
        window.ktaEstAccessible = function () { return true; };
        window.setRoads([{ uid: "rd_js", type: "principal", level: 0, points: [P(-40, 0), P(40, 0)] }]);
        window.KtaGalerie.invalider();
        const r = {}, d = P(-30, 0);
        r.finPc = !!(mm && mm.call(window, "(pointer: fine)").matches);
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.pc = { commandes: K.etat().commandes, pave: K.etat().pave };
        await K.fermer();
        window.matchMedia = function (q) {
          if (!/pointer:\s*fine/.test(q)) return mm.call(window, q);
          return { matches: false, media: q, addListener: function () {}, removeListener: function () {},
            addEventListener: function () {}, removeEventListener: function () {} };
        };
        window.setVue3DPave(true);
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.option = { commandes: K.etat().commandes, pave: K.etat().pave };
        await K.fermer();
        window.setVue3DPave(false);
        // Suivi actif : toucher sans bouger ne quitte pas le suivi, sortir de la zone morte passe en libre.
        const trackerAvant = window.getTrackingActif();
        if (!trackerAvant) window.startTracking();
        window.recalerTrackerSurPoint(d.x, d.y, 0);
        await K.ouvrir({});
        const e0 = K.etat(), z = document.querySelector("#kta-vue3d .kta-v3d-stick-zone");
        r.tel = { commandes: e0.commandes, pave: e0.pave, zone: !!z, mode: e0.mode, stick: e0.stick,
          barre: document.querySelector("#kta-vue3d .kta-v3d-haut").getBoundingClientRect().bottom,
          boussole: document.querySelector("#kta-vue3d .kta-v3d-boussole").getBoundingClientRect().top,
          largeur: document.getElementById("kta-vue3d").getBoundingClientRect().width };
        if (!z) { window.stopTracking(); await K.fermer(); window.matchMedia = mm; window.ktaEstAccessible = acc; return r; }
        const zr = z.getBoundingClientRect(), x0 = zr.left + 100, y0 = zr.top + zr.height / 2;
        const ev = function (type, id, x, y, cible) {
          (cible || z).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id,
            pointerType: "touch", isPrimary: id === 7, clientX: x, clientY: y }));
        };
        ev("pointerdown", 7, x0, y0);
        await pause(100);
        r.pose = K.etat().stick;
        ev("pointerup", 7, x0, y0);
        await pause(50);
        r.tapMode = K.etat().mode;
        // Vitesse mesurée sur la position de la vue entre deux instants (m/s), et son déplacement (m).
        const vitesse = async function (ms) {
          const p0 = K.etat().pos, t0 = performance.now();
          await pause(ms);
          const p1 = K.etat().pos, t1 = performance.now();
          return { v: +(Math.hypot(p1.x - p0.x, p1.y - p0.y) / a.sc / ((t1 - t0) / 1000)).toFixed(2),
            dx: +((p1.x - p0.x) / a.sc).toFixed(2), dz: +((p1.y - p0.y) / a.sc).toFixed(2) };
        };
        ev("pointerdown", 7, x0, y0);
        ev("pointermove", 7, x0, y0 - 26);
        await pause(80);
        r.libre = { mode: K.etat().mode, m: K.etat().stick.m, libres: K.etat().stick.libres };
        // Cap connu (vers l'est, le long du tube) : celui du tracker ne l'est pas.
        K.placer(d.x, d.y, 90);
        r.moitie = await vitesse(600);
        ev("pointermove", 7, x0, y0 - 40);
        await pause(80);
        r.plein = await vitesse(400);
        await pause(300);
        r.course = K.etat().stick.course;
        r.courseV = await vitesse(400);
        // Pas de côté sous le seuil de course (30 px : la course tient tant que le débattement reste au-delà).
        ev("pointermove", 7, x0 + 30, y0);
        await pause(80);
        r.cote = await vitesse(500);
        ev("pointermove", 7, x0 + 5, y0 - 5);
        await pause(80);
        r.morte = await vitesse(300);
        // Deux doigts sur la scène, le doigt du joystick posé : la vue plongeante s'incline.
        K.basculerVue();
        const cv = document.querySelector("#kta-vue3d canvas"), cr = cv.getBoundingClientRect();
        const i0 = K.etat().inclinaison, cx = cr.left + cr.width * 0.75;
        ev("pointerdown", 8, cx, 300, cv); ev("pointerdown", 9, cx + 30, 300, cv);
        for (let k = 1; k <= 10; k++) {
          ev("pointermove", 8, cx, 300 + 8 * k, cv); ev("pointermove", 9, cx + 30, 300 + 8 * k, cv);
        }
        r.incl = { avant: i0, apres: K.etat().inclinaison, stick: K.etat().stick.actif };
        ev("pointerup", 8, cx, 380, cv); ev("pointerup", 9, cx + 30, 380, cv);
        ev("pointerup", 7, x0 + 5, y0 - 5);
        await pause(50);
        r.relache = K.etat().stick.actif;
        K.basculerVue();
        window.stopTracking();
        await K.fermer();
        if (trackerAvant) window.startTracking();
        window.matchMedia = mm;
        window.ktaEstAccessible = acc;
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      verifier(JS.pc.commandes === (JS.finPc ? "pave" : "joystick") && JS.pc.pave === JS.finPc &&
        JS.option.commandes === "pave" && JS.option.pave === true && JS.tel.commandes === "joystick" &&
        JS.tel.pave === false && JS.tel.zone,
        "commandes : pavé au PC (pointeur fin), joystick au téléphone (pavé absent), pavé avec l'option de cet appareil",
        { pc: JS.pc, option: JS.option, tel: JS.tel.commandes, pave: JS.tel.pave, finPc: JS.finPc });
      if (JS.tel.zone) {
        const st0 = JS.tel.stick;
        verifier(st0.zone.y >= JS.tel.barre - 0.5 && st0.zone.y + st0.zone.h <= JS.tel.boussole + 0.5 &&
          Math.abs(st0.zone.w - JS.tel.largeur / 2) < 1 && st0.anneau.w >= 88 && st0.bouton === 44,
          "joystick : zone gauche sous la rangée du haut et au-dessus de la boussole, anneau ≥ 88 px, bouton 44 px",
          JS.tel);
        verifier(JS.pose.actif && Math.abs(JS.pose.anneau.x - (st0.zone.x + 100)) < 1.5 &&
          Math.abs(JS.pose.anneau.y - (st0.zone.y + st0.zone.h / 2)) < 1.5 && JS.tel.mode === "suivi" &&
          JS.tapMode === "suivi",
          "joystick : l'anneau apparaît sous le doigt ; un toucher bref sans bouger ne quitte pas le suivi", JS.pose);
        verifier(JS.libre.mode === "libre" && JS.libre.libres === 1 && Math.abs(JS.libre.m - 0.5) < 0.01,
          "joystick : sortir de la zone morte passe en libre (débattement 26 px → moitié de la vitesse)", JS.libre);
        verifier(Math.abs(JS.moitie.v - 1.4) < 0.35 && Math.abs(JS.plein.v - 2.8) < 0.5 &&
          Math.abs(JS.moitie.dz) < 0.05 && JS.moitie.dx > 0,
          "joystick : avance proportionnelle (" + JS.moitie.v + " m/s à mi-course, " + JS.plein.v +
          " m/s au bout, attendu 1,4 et 2,8), vers l'avant", { moitie: JS.moitie, plein: JS.plein });
        verifier(JS.course === true && JS.courseV.v > 5.5, "joystick : au bout, tenu 0,6 s → course (" + JS.courseV.v +
          " m/s)", JS.courseV);
        verifier(JS.cote.dz > 0.5 && Math.abs(JS.cote.dx) < 0.05 && JS.morte.v === 0,
          "joystick : vers la droite → pas de côté (vers +z en regardant à l'est) ; dans la zone morte, rien",
          { cote: JS.cote, morte: JS.morte });
        verifier(JS.incl.apres !== JS.incl.avant && JS.incl.stick && JS.relache === false,
          "joystick posé : deux doigts sur la scène inclinent la vue plongeante (le doigt du joystick ne compte pas)",
          JS.incl);
      }

      // ── 19. Finitions : plus de « bêta », toast de présence en info, nom au toucher, focus après « Je suis ici ? »
      const FI = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const orig = window.OOMGuard.showToast;
        window.__v3dToasts = [];
        window.OOMGuard.showToast = function (m, t, o) {
          window.__v3dToasts.push([String(m), t || "warn"]);
          return orig.call(this, m, t, o);
        };
        window.__v3dToastOrig = orig;
        const d = P(-30, 0), r = {};
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        const ov = document.getElementById("kta-vue3d");
        r.beta = /b[êe]ta/i.test(ov.textContent + " " + ov.getAttribute("aria-label"));
        r.titre = window.I18n.t("vue3d.titre");
        window.__v3dPartage = true; window.__v3dPub = [];
        const m = P(-26, 0);
        window.KtaExtensions.afficherPresences([{ id: "membre-t", pseudo: "Membre T", x: m.x, y: m.y, niveau: 0 }]);
        await pause(250);
        K.avancer(0.6);
        await pause(300);
        r.presence = window.__v3dToasts.filter(function (t) { return /📡/.test(t[0]); });
        const q = K.etat().panneaux.filter(function (p) { return p.genre === "membre" && p.visible; })[0];
        r.vise = q ? q.ecran : null;
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      if (FI.vise) await page.mouse.click(FI.vise.x, FI.vise.y);
      await page.waitForTimeout(250);
      const FI2 = await page.evaluate(async function () {
        const K = window.KtaVue3D, r = { nom: K.etat().toucheNom, fiche: !!K.etat().fiche,
          toast: window.__v3dToasts.filter(function (t) { return t[0] === "Membre T"; }) };
        window.KtaExtensions.afficherPresences([]);
        window.__v3dPartage = false;
        window.OOMGuard.showToast = window.__v3dToastOrig;
        await K.fermer();
        return r;
      });
      verifier(!FI.beta && !/b[êe]ta/i.test(FI.titre), "plus de « bêta » dans la vue (rangée, titre)", FI);
      verifier(FI.presence.length === 1 && FI.presence[0][1] === "success",
        "toast de présence 3D en « success » (toujours vu, jamais une alerte)", FI.presence);
      verifier(!!FI.vise && FI2.nom === "Membre T" && FI2.toast.length === 1 && FI2.toast[0][1] === "success" &&
        !FI2.fiche,
        "toucher un membre : un toast court avec son nom, pas de fiche", FI2);
      // Focus rendu au bouton cube après « Je suis ici ? » (suivi actif, déplacé, Non).
      const FO = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const acc = window.ktaEstAccessible, r = {};
        window.ktaEstAccessible = function () { return true; };
        const trackerAvant = window.getTrackingActif();
        if (!trackerAvant) window.startTracking();
        const d = P(-30, 0);
        window.recalerTrackerSurPoint(d.x, d.y, 0);
        const cube = document.querySelector(".kta-vue3d-ctrl a");
        await K.ouvrir({ retourFocus: cube });
        const loin = P(-28, 0);
        K.placer(loin.x, loin.y, 90);
        const ferme = K.fermer();
        await pause(300);
        const non = Array.prototype.filter.call(document.querySelectorAll("button"), function (b) {
          return b.offsetParent !== null && b.textContent.trim() === window.I18n.t("vue3d.jeSuisIci.non");
        })[0];
        r.question = !!non;
        if (non) non.click();
        await ferme;
        await pause(200);
        r.focus = document.activeElement === cube;
        r.actif = document.activeElement ? (document.activeElement.className || document.activeElement.tagName) : null;
        window.stopTracking();
        if (trackerAvant) window.startTracking();
        window.ktaEstAccessible = acc;
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      verifier(FO.question && FO.focus, "focus rendu au bouton cube après « Je suis ici ? » (Non)", FO);

      // ── 20. Tuile ⚙️ Réglages : rangée du haut réduite, tuile ancrée, fermeture, repère, mode visible, boussole ──
      const TU = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const q = function (s) { return document.querySelector("#kta-vue3d " + s); };
        window.setVue3DBoussole(true);
        const d = P(-30, 0), r = {};
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.rangee = Array.prototype.map.call(document.querySelectorAll("#kta-vue3d .kta-v3d-haut > *"), function (b) {
          return b.getAttribute("data-v3d") || (b.classList.contains("kta-aide-ctx-btn") ? "aide" : b.className);
        }).sort();
        r.dansTuile = ["suivre", "vue", "hauteur", "rendu", "boussole", "guidage"].map(function (k) {
          const b = q('[data-v3d="' + k + '"]');
          return !!b && !!b.closest("#kta-v3d-reglages") && b.textContent.trim().length > 1;
        });
        r.ferme0 = K.etat().reglages.ouvert;
        q('[data-v3d="reglages"]').click();
        await pause(50);
        const t = q("#kta-v3d-reglages").getBoundingClientRect(), g = q('[data-v3d="reglages"]').getBoundingClientRect();
        r.ouverte = { ouvert: K.etat().reglages.ouvert, sous: t.top >= g.bottom - 0.5 && t.top <= g.bottom + 12,
          droite: Math.abs(t.right - (window.innerWidth - 10)) < 1.5, pleinEcran: t.height > window.innerHeight * 0.9,
          expanded: q('[data-v3d="reglages"]').getAttribute("aria-expanded") };
        q('[data-v3d="reglages"]').click();
        await pause(50);
        r.reclic = K.etat().reglages.ouvert;
        q('[data-v3d="reglages"]').click();
        const cv = q("canvas"), cr = cv.getBoundingClientRect();
        cv.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 3, clientX: cr.left + 30,
          clientY: cr.top + cr.height - 30 }));
        cv.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 3, clientX: cr.left + 30,
          clientY: cr.top + cr.height - 30 }));
        await pause(50);
        r.ailleurs = K.etat().reglages.ouvert;
        // Repère et pastille du mode : libre (ouvert avec un départ) → repère, pastille 🕹️.
        r.libre = { repere: K.etat().reglages.repere, indic: K.etat().reglages.indic, mode: K.etat().mode,
          indicVisible: q(".kta-v3d-mode-indic").getBoundingClientRect().width > 0 };
        // Boussole : masquée par l'interrupteur, retenue sur l'appareil, rien d'autre ne bouge.
        const avant = q('[data-v3d="reglages"]').getBoundingClientRect().top;
        q('[data-v3d="reglages"]').click();
        q('[data-v3d="boussole"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 4 }));
        await pause(50);
        r.masquee = { visible: K.etat().reglages.boussole, pref: window.getVue3DBoussole(),
          presse: q('[data-v3d="boussole"]').getAttribute("aria-pressed"), tuile: K.etat().reglages.ouvert,
          rangee: q('[data-v3d="reglages"]').getBoundingClientRect().top === avant };
        await K.fermer();
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.rouverte = { visible: K.etat().reglages.boussole, repere: K.etat().reglages.repere };
        // Échap : la tuile d'abord, la vue reste.
        q('[data-v3d="reglages"]').click();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await pause(50);
        r.echap = { tuile: K.etat().reglages.ouvert, vue: K.etat().ouvert };
        window.setVue3DBoussole(true);
        await K.fermer();
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      verifier(JSON.stringify(TU.rangee) === JSON.stringify(["aide", "fermer", "filtres", "reglages", "urgence"]) &&
        TU.dansTuile.every(Boolean), "rangée du haut : ✕, ≡, 🚨, ❓, ⚙️ ; suivi, vue, hauteur, rendu, boussole et guidage " +
        "dans la tuile, écrits en clair", TU);
      verifier(TU.ferme0 === false && TU.ouverte.ouvert && TU.ouverte.sous && TU.ouverte.droite && !TU.ouverte.pleinEcran &&
        TU.ouverte.expanded === "true", "⚙️ ouvre un petit panneau ancré sous lui, à droite (pas une fenêtre plein écran)",
        TU.ouverte);
      verifier(TU.reclic === false && TU.ailleurs === false && TU.echap.tuile === false && TU.echap.vue,
        "tuile fermée par ⚙️ à nouveau, par un toucher ailleurs, par Échap (la vue reste)", TU);
      verifier(TU.libre.mode === "libre" && TU.libre.repere && TU.libre.indic === "🕹️" && TU.libre.indicVisible,
        "mode libre : repère sur ⚙️, pastille 🕹️ visible hors de la tuile", TU.libre);
      verifier(TU.masquee.visible === false && TU.masquee.pref === false && TU.masquee.presse === "false" &&
        TU.masquee.tuile && TU.masquee.rangee && TU.rouverte.visible === false && TU.rouverte.repere,
        "boussole masquée par la tuile, retenue sur l'appareil (rouverte masquée), rien d'autre ne bouge", TU);
      await page.evaluate(function () { window.setStructures([]); window.KtaGalerie.invalider(); });

      // ── 21. Greffe (prise neutre d'un add-on) et code « six vers le bas » ────────────────────────────────────
      perteSimulee = true;
      const GR = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const q = function (s) { return document.querySelector("#kta-vue3d " + s); };
        const acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        window.setRoads([{ uid: "rd_gr", type: "principal", level: 0, points: [P(-40, 0), P(40, 0)] }]);
        window.setStructures([{ uid: "st_gr", type: "pilier-2", level: 0,
          points: [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)] }]);
        window.KtaGalerie.invalider();
        const codes = [];
        const surCode = function (ev) { codes.push(ev.detail && ev.detail.code); };
        window.addEventListener("kta:vue3dCode", surCode);
        const r = {}, d = P(-6, 0);
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "pave" });
        const renduAvant = K.etat().rendu;
        K.basculerRendu("structures");
        await pause(50);
        r.sans = { greffe: K.etat().greffe, calque: !!q(".kta-v3d-greffe") };
        // Greffon d'essai : journal des appels, un cube dans son groupe, un élément dans son calque.
        const j = [];
        let cube = null, animer = false, jeter = false;
        const g = {
          nom: "essai",
          scene: function (ctx, raison) {
            j.push("scene:" + raison);
            cube = new ctx.THREE.Mesh(new ctx.THREE.BoxGeometry(0.5, 0.5, 0.5), new ctx.THREE.MeshBasicMaterial());
            cube.position.set(d.x / ctx.sc + 2, 1, d.y / ctx.sc);
            ctx.groupe.add(cube);
            if (!ctx.hud.firstChild) { const b = document.createElement("div"); b.className = "essai"; ctx.hud.appendChild(b); }
          },
          surImage: function (ctx, dt) {
            if (jeter) throw new Error("essai");
            if (animer) { cube.rotation.y += dt; ctx.sale(); }
          },
          demonter: function (ctx, raison) { j.push("demonter:" + raison); }
        };
        const retirer = K.greffer(g);
        r.double = K.greffer({ nom: "autre" });
        await pause(100);
        r.posee = { greffe: K.etat().greffe, journal: j.slice(), calque: !!q(".kta-v3d-greffe .essai"),
          apresCanvas: q("canvas").nextElementSibling === q(".kta-v3d-greffe") };
        // Rendu à la demande : immobile, rien ; greffon animé (ctx.sale), une image à chaque fois.
        const i0 = K.etat().images;
        await pause(300);
        const i1 = K.etat().images;
        animer = true;
        await pause(300);
        const i2 = K.etat().images;
        animer = false;
        r.images = { immobile: i1 - i0, anime: i2 - i1 };
        // Retrait, puis un second greffon qui garde son ctx : règle du pas contre le pilier de 2 m du centre.
        let ctxPris = null;
        retirer();
        r.retire = { journal: j.slice(), greffe: K.etat().greffe, calque: !!q(".kta-v3d-greffe") };
        K.greffer({ nom: "regle", scene: function (ctx) { ctxPris = ctx; } });
        const A = P(-3, 0), B = P(3, 0), C = P(-3, 3), D = P(3, 3);
        r.regle = { pilier: ctxPris.bloque(A.x, A.y, B.x, B.y), cote: ctxPris.bloque(C.x, C.y, D.x, D.y),
          vuePilier: ctxPris.ligneBloquee(A.x, A.y, B.x, B.y), vueCote: ctxPris.ligneBloquee(C.x, C.y, D.x, D.y),
          dansPilier: ctxPris.libre(P(0, 0).x, P(0, 0).y), dehors: ctxPris.libre(C.x, C.y),
          sc: ctxPris.sc === a.sc, pos: ctxPris.pos.x === K.etat().pos.x, niveau: ctxPris.niveau };
        await K.fermer();
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "pave" });
        j.length = 0;
        K.greffer(g);
        // Scène refaite (itinéraire changé) puis perte du contexte et reprise : groupe neuf.
        window.dispatchEvent(new Event("kta:itineraireChange"));
        await pause(150);
        const gl = q("canvas").getContext("webgl2"), perte = gl.getExtension("WEBGL_lose_context");
        perte.loseContext();
        await pause(300);
        perte.restoreContext();
        await pause(500);
        r.cycle = { journal: j.slice(), greffe: K.etat().greffe };
        // Exception du greffon : la greffe part, la vue reste.
        jeter = true;
        await pause(150);
        jeter = false;
        r.erreur = { journal: j.slice(), greffe: K.etat().greffe, ouvert: K.etat().ouvert };
        // Fermeture de la vue : demonter("fermeture") ; vue fermée : greffer refusé.
        j.length = 0;
        K.greffer(g);
        await K.fermer();
        r.fermeture = { journal: j.slice(), apres: K.greffer(g) };
        // Code « six vers le bas » : pavé, clavier, joystick. L'add-on lié est remplacé par un faux qui compte ses
        // lancements (le vrai ouvrirait sa confirmation par-dessus la vue) ; § 23 joue le vrai.
        const addonsAvant = window.KtaAddons;
        let lances = 0;
        window.KtaAddons = { mkmg: { lancer: function () { lances++; } } };
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "pave" });
        const ar = q('[data-v3d="ar"]'), av = q('[data-v3d="av"]');
        const appui = function (b) {
          b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 2 }));
          window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 2 }));
        };
        codes.length = 0;
        for (let k = 0; k < 6; k++) { appui(ar); await pause(40); }
        r.pave6 = { codes: codes.slice(), compte: K.etat().codesBas };
        codes.length = 0;
        for (let k = 0; k < 6; k++) { appui(k === 3 ? av : ar); await pause(40); }
        r.paveCoupe = codes.length;
        // Chaque série repart de 0 (un ▲ remet le compte à zéro) : le compte entamé d'une série vaut pour la suivante.
        appui(av);
        codes.length = 0;
        for (let k = 0; k < 5; k++) { appui(ar); await pause(40); }
        await pause(2100);
        appui(ar);
        r.paveLent = codes.length;
        const touche = function (type, code, rep) {
          document.dispatchEvent(new KeyboardEvent(type, { code: code, key: code, bubbles: true, repeat: !!rep }));
        };
        appui(av);
        codes.length = 0;
        for (let k = 0; k < 6; k++) { touche("keydown", "ArrowDown"); touche("keyup", "ArrowDown"); await pause(30); }
        r.clavier = codes.length;
        codes.length = 0;
        touche("keydown", "KeyS");
        for (let k = 0; k < 8; k++) { touche("keydown", "KeyS", true); await pause(20); }
        touche("keyup", "KeyS");
        r.clavierRepete = codes.length;
        await K.fermer();
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "joystick" });
        const z = q(".kta-v3d-stick-zone"), zr = z.getBoundingClientRect();
        const x0 = zr.left + 100, y0 = zr.top + zr.height / 2;
        const ev = function (type, x, y) {
          z.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch",
            isPrimary: true, clientX: x, clientY: y }));
        };
        const coup = async function (dx, dy, tenir) {
          ev("pointerdown", x0, y0); ev("pointermove", x0 + dx, y0 + dy);
          await pause(tenir || 30);
          ev("pointerup", x0 + dx, y0 + dy);
          await pause(30);
        };
        codes.length = 0;
        for (let k = 0; k < 6; k++) await coup(0, 40);
        r.stick6 = codes.length;
        await coup(40, 0);   // coup de côté : compte remis à 0 avant chaque série
        codes.length = 0;
        for (let k = 0; k < 6; k++) await coup(0, 40, k === 2 ? 650 : 30);
        r.stickTenu = codes.length;
        await coup(40, 0);
        codes.length = 0;
        for (let k = 0; k < 6; k++) await coup(k === 4 ? 40 : 0, k === 4 ? 0 : 40);
        r.stickCote = codes.length;
        await K.fermer();
        window.removeEventListener("kta:vue3dCode", surCode);
        r.lances = lances;
        window.KtaAddons = addonsAvant;
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        K.basculerRendu(renduAvant);
        await K.fermer();
        window.ktaEstAccessible = acc;
        window.setStructures([]); window.setRoads([]); window.KtaGalerie.invalider();
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      perteSimulee = false;
      verifier(GR.sans.greffe === null && !GR.sans.calque, "greffe : rien sans greffon (ni calque, ni état)", GR.sans);
      verifier(GR.posee.greffe && GR.posee.greffe.nom === "essai" && GR.posee.greffe.dansScene &&
        GR.posee.greffe.objets === 1 && GR.posee.greffe.hud && GR.posee.calque && GR.posee.apresCanvas &&
        GR.posee.journal[0] === "scene:greffe" && GR.double === null,
        "greffe posée : scene(\"greffe\"), groupe dans la scène, calque juste après le canvas ; une seule à la fois",
        { posee: GR.posee, double: GR.double });
      verifier(GR.posee.greffe.appels.image > 0 && GR.images.immobile === 0 && GR.images.anime >= 5,
        "greffe : surImage à chaque image ; immobile, rien n'est dessiné ; ctx.sale() redessine (" + GR.images.anime +
        " images en 0,3 s)", GR.images);
      verifier(GR.retire.greffe === null && !GR.retire.calque &&
        GR.retire.journal[GR.retire.journal.length - 1] === "demonter:degreffe",
        "greffe retirée : demonter(\"degreffe\"), calque et groupe enlevés", GR.retire);
      verifier(GR.regle.pilier === true && GR.regle.cote === false && GR.regle.vuePilier === true &&
        GR.regle.vueCote === false && GR.regle.dansPilier === false && GR.regle.dehors === true && GR.regle.sc &&
        GR.regle.pos, "greffe : règle du pas de la vue (corps, ligne de vue, place libre) contre un pilier fictif",
        GR.regle);
      verifier(GR.cycle.journal[0] === "scene:greffe" && GR.cycle.journal.indexOf("scene:refaite") > 0 &&
        GR.cycle.journal.indexOf("scene:reprise") > 0 && GR.cycle.greffe && GR.cycle.greffe.dansScene &&
        GR.cycle.greffe.objets === 1, "greffe : scene(\"refaite\") puis scene(\"reprise\") avec un groupe neuf", GR.cycle);
      verifier(GR.erreur.greffe === null && GR.erreur.ouvert &&
        GR.erreur.journal[GR.erreur.journal.length - 1] === "demonter:erreur",
        "greffe : une exception du greffon le retire, la vue reste ouverte", GR.erreur);
      verifier(GR.fermeture.journal.indexOf("demonter:fermeture") >= 0 && GR.fermeture.apres === null,
        "greffe : fermer la vue appelle demonter(\"fermeture\") ; vue fermée, greffer refusé", GR.fermeture);
      verifier(GR.pave6.codes.length === 1 && GR.pave6.codes[0] === "bas6" && GR.pave6.compte === 1 &&
        GR.paveCoupe === 0 && GR.paveLent === 0,
        "code : 6 × ▼ en moins de 2 s → kta:vue3dCode « bas6 » ; un ▲ entre deux ou plus de 2 s → rien",
        { pave6: GR.pave6, coupe: GR.paveCoupe, lent: GR.paveLent });
      verifier(GR.clavier === 1 && GR.clavierRepete === 0, "code : 6 × ↓ au clavier ; S maintenu (répétition) ne compte pas",
        { clavier: GR.clavier, repete: GR.clavierRepete });
      verifier(GR.stick6 === 1 && GR.stickTenu === 0 && GR.stickCote === 0,
        "code : 6 coups brefs du joystick vers le bas ; un coup tenu ou vers le côté → rien",
        { six: GR.stick6, tenu: GR.stickTenu, cote: GR.stickCote });
      verifier(GR.lances === GR.pave6.codes.length + GR.clavier + GR.stick6,
        "code : chaque « bas6 » lance l'add-on lié (" + GR.lances + " lancements)", GR.lances);

      // ── 23. Add-on « mkmg » (jeu en vagues) : refus, confirmation, partie, masquage, endurance, cible, sortie ──
      const MK = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const q = function (s) { return document.querySelector(s); };
        const acc = window.ktaEstAccessible, ext = window.KtaExtensions.etat, poisAvant = window.getEditorPoints();
        window.ktaEstAccessible = function () { return true; };
        const tracker = window.getTrackingActif();
        if (tracker) window.stopTracking();
        // Pilier fictif sur le tracé, au droit du POI : la validation ne doit tomber ni hors galerie, ni dedans.
        window.setStructures([{ uid: "st_mk", type: "pilier-2", level: 0,
          points: [P(14.2, -0.8), P(15.8, -0.8), P(15.8, 0.8), P(14.2, 0.8)] }]);
        // Effondrement fictif autour du pilier : la validation ne doit pas y tomber non plus.
        window.setZones([{ uid: "zn_mk", type: "effondrement", level: 0,
          points: [P(12.5, -2.5), P(17.5, -2.5), P(17.5, 2.5), P(12.5, 2.5)] }]);
        window.setRoads([
          { uid: "rd_mk", type: "principal", level: 0, points: [P(-80, 0), P(80, 0)] },
          { uid: "rd_mk_iti", type: "itinerary", level: 0, points: [P(-20, 0), P(-10, 0)] }
        ]);
        // POI relevé à 4 m du tracé (hors galerie) : sa validation doit tomber sur le tracé.
        window.setEditorPoints([{ id: "mk1", nom: "Salle fictive", x: P(15, 4).x, y: P(15, 4).y, level: 0, tags: [] }]);
        window.KtaGalerie.invalider();
        const d = P(-30, 0), r = {};
        const appui = function (b) {
          b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 2 }));
          window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 2 }));
        };
        const code = async function () {
          appui(document.querySelector('#kta-vue3d [data-v3d="av"]'));
          const ar = document.querySelector('#kta-vue3d [data-v3d="ar"]');
          for (let k = 0; k < 6; k++) { appui(ar); await pause(30); }
          for (let k = 0; k < 40 && !q("#kta-confirm-oui"); k++) await pause(50);
        };
        const texteFenetre = function () { return q("#kta-confirm-oui") ? document.body.textContent : ""; };
        const M = function () { return window.KtaAddons && window.KtaAddons.mkmg; };
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "pave" });
        r.avant = { roads: K.etat().compte.roads, greffe: K.etat().greffe };
        // Refus : installation reliée, puis suivi du tracker actif.
        window.KtaExtensions.etat = function () { return { etat: "on", raison: "" }; };
        await code();
        r.refusInstallation = !!q("#kta-confirm-oui") && texteFenetre().indexOf("installation") >= 0;
        if (q("#kta-confirm-oui")) q("#kta-confirm-oui").click();
        await pause(100);
        // Même installation, autorisée par son hébergeur (data/reglages.json > addons.mkmg) : la confirmation vient.
        const inst = window.KtaInstance.etat;
        window.KtaInstance.etat = function () {
          return Object.assign({}, inst(), { reglages: { addons: { mkmg: true } } });
        };
        await code();
        r.permisInstallation = document.querySelectorAll('input[name="kta-confirm-choix"]').length === 3;
        if (q("#kta-confirm-non")) q("#kta-confirm-non").click();
        await pause(100);
        r.permisInstallation = r.permisInstallation && K.etat().greffe === null;
        window.KtaInstance.etat = inst;
        window.KtaExtensions.etat = ext;
        await pause(100);
        window.startTracking();
        await code();
        r.refusSuivi = !!q("#kta-confirm-oui") && /tracker|suivi/.test(texteFenetre()) && K.etat().greffe === null;
        if (q("#kta-confirm-oui")) q("#kta-confirm-oui").click();
        window.stopTracking();
        await pause(100);
        // Confirmation avec la difficulté (facile par défaut), puis partie.
        await code();
        r.radios = document.querySelectorAll('input[name="kta-confirm-choix"]').length;
        q("#kta-confirm-oui").click();
        for (let k = 0; k < 60 && !(M() && M().etat().cible); k++) await pause(50);
        await pause(200);
        const e1 = K.etat(), m1 = M().etat();
        r.partie = { greffe: e1.greffe && e1.greffe.nom, reglage: e1.greffe && e1.greffe.reglage, roads: e1.compte.roads,
          diff: m1.diff, vague: m1.vague, cible: m1.cible && m1.cible.nom, route: m1.route, traits: m1.traits, chevrons: m1.chevrons,
          panneau: !!q("#kta-vue3d .kta-v3d-greffe .mkmg-panneau"), fleche: !!q(".mkmg-fleche") &&
            !q(".mkmg-fleche").hidden, reste: q(".mkmg-reste") && q(".mkmg-reste").textContent,
          ennemis: m1.ennemis.length, objets: m1.objets.length, tirer: !!q(".mkmg-tirer"),
          cartouches: m1.canon + "/" + m1.reserve,
          cibleM: m1.cible ? [+(m1.cible.x / a.sc - a.ox).toFixed(2), +(m1.cible.y / a.sc - a.oz).toFixed(2)] : null,
          surTrace: !!m1.cible && Math.hypot(m1.cible.x - P(15, 0).x, m1.cible.y - P(15, 0).y) < 5 * a.sc &&
            Math.hypot(m1.cible.x - P(15, 4).x, m1.cible.y - P(15, 4).y) > 1 * a.sc,
          horsPilier: !!m1.cible && (Math.abs(m1.cible.x - P(15, 0).x) > 0.8 * a.sc ||
            Math.abs(m1.cible.y - P(15, 0).y) > 0.8 * a.sc),
          horsEffondrement: !!m1.cible && (Math.abs(m1.cible.x - P(15, 0).x) > 2.5 * a.sc ||
            Math.abs(m1.cible.y - P(15, 0).y) > 2.5 * a.sc) };
        // Éléments du jeu (addons/mkmg/css) en place autour des commandes de la vue : aucun ne chevauche un bouton,
        // la pastille de mode ni la boussole. Les calques plein écran sans pointeur (voile d'un coup reçu) ne comptent
        // pas : ils passent sous tout.
        const boite = function (el) { return el.getBoundingClientRect(); };
        const commandes = Array.prototype.slice.call(document.querySelectorAll("#kta-vue3d .kta-v3d-haut > *, " +
          "#kta-vue3d .kta-v3d-mode-indic, #kta-vue3d .kta-v3d-boussole, #kta-vue3d .kta-v3d-pad > *, " +
          "#kta-vue3d .kta-v3d-incl > *")).filter(function (el) { return el.getClientRects().length > 0; });
        const jeu = Array.prototype.slice.call(document.querySelectorAll("#kta-vue3d .kta-v3d-greffe [class*='mkmg-']"))
          .filter(function (el) {
            const b = boite(el);
            const plein = b.width >= window.innerWidth - 1 && b.height >= window.innerHeight * 0.8 &&
              getComputedStyle(el).pointerEvents === "none";
            return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden" && !plein;
          });
        r.chevauche = [];
        jeu.forEach(function (j) {
          const bj = boite(j);
          commandes.forEach(function (c) {
            const bc = boite(c);
            if (bc.width && bj.left < bc.right && bj.right > bc.left && bj.top < bc.bottom && bj.bottom > bc.top) {
              r.chevauche.push(j.className + " / " + (c.getAttribute("data-v3d") || c.className));
            }
          });
        });
        r.elementsJeu = jeu.length;
        // Situation contrôlée : monde vidé, puis un égaré à 5 m devant (cap 90 = vers l'est).
        const X = M().essai, tape = function () {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
        };
        X.vider();
        // Joueur : fusil tenu à deux mains, accroché à la caméra. Vue plongeante interdite pendant la partie (voir
        // d'en haut serait tricher) : bouton 🦅 grisé, basculement refusé.
        r.joueur = M().etat().joueur;
        K.basculerVue();
        await pause(150);
        r.plongee = { vue: K.etat().vue, reglage: K.etat().greffe.reglage.plongee,
          bouton: !!q("#kta-vue3d .kta-v3d-vue") && q("#kta-vue3d .kta-v3d-vue").disabled };
        // Viseur (souris capturée, PC) : le regard rejoué comme un glisser de la vue (40 px = 10°), glisser clos.
        K.placer(d.x, d.y, 90);
        await pause(50);
        X.viser(40, 0);
        await pause(50);
        r.viseur = { cap: Math.round(K.etat().cap), apres: 0 };
        X.viser(-40, 0);
        await pause(50);
        r.viseur.apres = Math.round(K.etat().cap);
        K.placer(d.x, d.y, 90);
        X.poser("egare", P(-25, 0).x, P(-25, 0).y);
        await pause(50);
        tape();
        await pause(30);
        r.tirJoueur = M().etat().joueur;
        await pause(20);
        r.tir = { canon: M().etat().canon, tues: M().etat().tues, ennemis: M().etat().ennemis.length,
          cadavres: M().etat().cadavres };
        tape();
        await pause(50);
        r.recharge = { canon: M().etat().canon, recharge: M().etat().recharge };
        await pause(1700);
        r.recharge.apres = M().etat().canon + "/" + M().etat().reserve;
        r.stats = { tirs: M().etat().tirs, touches: M().etat().touches, tues: M().etat().tues };
        // Ramasser en passant dessus : munitions, champignon (soin).
        X.vider();   // l'égaré tué peut avoir lâché un champignon (au hasard)
        X.sante(50);
        X.poser("munitions", P(-29.6, 0).x, P(-29.6, 0).y);
        X.poser("champignon", P(-30, 0.5).x, P(-30, 0.5).y);
        await pause(150);
        r.ramasse = { reserve: M().etat().reserve, sante: M().etat().sante, objets: M().etat().objets.length };
        // Contact d'un égaré : la santé baisse.
        X.poser("egare", P(-29.4, 0).x, P(-29.4, 0).y);
        await pause(600);
        r.contact = M().etat().sante;
        X.vider();
        // Silhouette : figée dans le faisceau, elle avance dès qu'on lui tourne le dos.
        X.poser("silhouette", P(-18, 0).x, P(-18, 0).y);
        await pause(500);
        const s0 = M().etat().ennemis[0];
        r.silFace = { vu: s0.vu, x: s0.x };
        K.tourner(180);
        await pause(400);
        const s1 = M().etat().ennemis[0];
        r.silDos = { vu: s1.vu, avance: s0.x - s1.x, coeur: M().etat().coeur };
        X.vider();
        // Charge : 8 égarés à 15-40 m (sur le tracé et à côté) et la silhouette ; temps du monde par image (moyenne
        // glissante) et approche par la carte des distances (un égaré loin avance vers soi).
        for (let k = 0; k < 8; k++) X.poser("egare", P(-30 + (k % 2 ? 15 : -15) - k * 3, k % 3 - 1).x, P(0, k % 3 - 1).y);
        X.poser("silhouette", P(5, 0).x, P(5, 0).y);
        const loin0 = M().etat().ennemis[7];
        await pause(1500);
        const loin1 = M().etat().ennemis[7];
        r.charge = { msMonde: M().etat().msMonde, ennemis: M().etat().ennemis.length,
          approche: (Math.abs(loin0.x - P(-30, 0).x) - Math.abs(loin1.x - P(-30, 0).x)) / a.sc };
        X.vider();
        K.tourner(180);
        // Pile faible : la lampe de la vue baisse (ctx.regler({ lampe })) ; pile pleine : elle revient.
        K.placer(d.x, d.y, 90);
        X.pile(10);
        await pause(300);
        r.pile = { lampe: M().etat().lampe, vue: K.etat().lampe, faible: !!q(".mkmg-jauge-lampe.mkmg-faible") };
        X.pile(100);
        await pause(200);
        r.pile.rendue = K.etat().lampe;
        // Gardien à 5 m : sa jauge paraît ; un coup lui ôte 2 PV, il recule et poursuit.
        X.poser("gardien", P(-25, 0).x, P(-25, 0).y);
        await pause(200);
        const g0 = M().etat().ennemis[0];
        tape();
        await pause(200);
        const g1 = M().etat().ennemis[0];
        r.gardien = { jauge: !q(".mkmg-jauge-gardien").hidden, pv: g0.pv - g1.pv, recul: (g1.x - g0.x) / a.sc,
          vivant: g1.type === "gardien" };
        X.vider();
        await pause(200);
        r.gardien.jaugePartie = q(".mkmg-jauge-gardien").hidden;
        // Hurleur à 8 m, en vue : il crie (message) et des égarés sortent du noir près de lui.
        X.poser("hurleur", P(-22, 0).x, P(-22, 0).y);
        await pause(500);
        r.hurleur = { message: /hurlement/.test(q(".mkmg-message").textContent), ennemis: M().etat().ennemis.length };
        X.vider();
        // Eau sous ses pieds : pas ralenti (ctx.regler({ vitesse })), rendu en sortant.
        const zonesAvant = window.getZones() || [];
        window.setZones(zonesAvant.concat([{ type: "eau", points: [P(-31, -1), P(-29, -1), P(-29, 1), P(-31, 1)] }]));
        await pause(2300);   // zones relues au plus toutes les 2 s (monde.js > zonesDe)
        r.eau = { dedans: M().etat().eau, vitesse: K.etat().greffe.reglage.vitesse };
        window.setZones(zonesAvant);
        await pause(2300);
        r.eau.sortie = K.etat().greffe.reglage.vitesse;
        // Chrono à 0 : −25 de santé et horde autour de soi ; la vague continue.
        K.placer(d.x, d.y, 90);
        r.chronoAffiche = !q(".mkmg-chrono").hidden && /⏱ \d+:\d\d/.test(q(".mkmg-chrono").textContent) &&
          M().etat().chronoReste > 30;
        X.sante(100);
        X.chrono(150);
        await pause(400);
        r.tropTard = { depasse: M().etat().chronoDepasse, sante: M().etat().sante, ennemis: M().etat().ennemis.length,
          vague: M().etat().vague, alerte: q(".mkmg-chrono").classList.contains("mkmg-chrono-alerte") };
        X.vider();
        // Tenaille au départ du trajet (cap vers l'est) : un groupe devant sur le trajet, un autre dans le dos.
        X.tenaille();
        await pause(50);
        const en = M().etat().ennemis;
        r.tenaille = { devant: en.filter(function (o) { return o.x > d.x + 10 * a.sc; }).length,
          derriere: en.filter(function (o) { return o.x < d.x - 10 * a.sc; }).length };
        X.vider();
        // Mi-parcours du trajet vers B : la tenaille se déclenche d'elle-même, une fois.
        const cMi = M().etat().cible;
        K.placer((d.x + cMi.x) / 2 + 2 * a.sc, d.y, 90);
        await pause(300);
        r.mi = { fait: M().etat().tenailleMi, ennemis: M().etat().ennemis.length };
        X.vider();
        // On fuit à 30 m derrière le départ (dos à B) : le trajet se recale d'ici à B, plus long d'autant.
        K.placer(d.x, d.y, 90);
        await pause(100);
        r.recalage = { avant: M().etat().recalages, resteAvant: M().etat().restantM };
        K.placer(P(-60, 0).x, P(-60, 0).y, 270);
        await pause(2200);
        r.recalage.apres = M().etat().recalages;
        r.recalage.resteApres = M().etat().restantM;
        r.recalage.ecart = M().etat().ecartM;
        X.vider();
        K.placer(d.x, d.y, 90);
        // (Les Espace des tirs plus haut n'ont pas de keyup : détente relâchée d'abord.)
        document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
        // Rage : prête à 20 égarés ; bouton au-dessus du fusil ; Espace tenu = tir automatique, cartouches non comptées.
        X.rage(19);
        await pause(50);
        r.rage = { a19: M().etat().rage.bouton };
        X.rage(20);
        X.sante(30);
        await pause(50);
        r.rage.a20 = M().etat().rage.bouton;
        q(".mkmg-rage").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
        await pause(50);
        const avR = M().etat();
        r.rage.active = avR.rage.active;
        r.rage.sante = avR.sante;
        r.rage.tues = avR.rage.tues;
        r.rage.chargeurAvant = avR.rage.canon;
        document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
        await pause(650);
        document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
        const apR = M().etat();
        r.rage.tirs = apR.tirs - avR.tirs;
        r.rage.chargeur = apR.rage.canon;
        r.rage.munitions = apR.canon + "/" + apR.reserve === avR.canon + "/" + avR.reserve;
        await pause(300);
        r.rage.lache = M().etat().tirs - apR.tirs;
        X.rageFin();
        await pause(100);
        r.rage.fin = M().etat().rage.active;
        // Endurance : pas rapide (Maj + ↑) vers l'ouest jusqu'à bout de souffle, puis repos.
        K.placer(d.x, d.y, 270);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", code: "ShiftLeft", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true }));
        await pause(700);
        r.court = { endurance: M().etat().endurance, rapide: K.etat().rapide, coeur: M().etat().coeur };
        for (let k = 0; k < 120 && !M().etat().souffle; k++) await pause(50);
        await pause(100);
        r.souffle = { souffle: M().etat().souffle, course: K.etat().greffe.reglage.course, rapide: K.etat().rapide,
          coeur: M().etat().coeur };
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", code: "ArrowUp", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code: "ShiftLeft", bubbles: true }));
        await pause(2500);
        r.repos = { souffle: M().etat().souffle, course: K.etat().greffe.reglage.course,
          endurance: M().etat().endurance, coeur: M().etat().coeur };
        // Cible atteinte : vague suivante.
        const c = M().etat().cible;
        K.placer(c.x, c.y, 90);
        for (let k = 0; k < 60 && M().etat().vague < 2; k++) await pause(50);
        r.vague2 = { vague: M().etat().vague, reussies: M().etat().reussies };
        X.vider();
        // Santé à 0 : fin de partie, meilleure vague retenue, « Rejouer » relance la vague 1.
        X.sante(0);
        await pause(150);
        const pave = function () { const el = q("#kta-vue3d .kta-v3d-pad"); return !!el && getComputedStyle(el).display !== "none"; };
        r.fin = { fin: M().etat().fin, carte: !!q(".mkmg-fin"), score: M().etat().scores.facile,
          tirer: q(".mkmg-tirer").disabled, pave: pave() };
        q(".mkmg-fin .mkmg-bouton-primaire").click();
        for (let k = 0; k < 60 && !(M().etat().cible); k++) await pause(50);
        r.rejoue = { enCours: M().etat().enCours, fin: M().etat().fin, vague: M().etat().vague, carte: !!q(".mkmg-fin"),
          pave: pave() };
        // Son après « Rejouer » : l'arrêt de l'ancienne partie ne suspend pas le son de la nouvelle (veille différée).
        const sonAvant = M().etat().son.contexte;
        await pause(1800);
        r.son = { avant: sonAvant, apres: M().etat().son.contexte, actif: M().etat().son.actif,
          api: !!(window.AudioContext || window.webkitAudioContext) };
        M().essai.vider();
        // Panneau réductible (Quitter, objectif, statistiques repliés ; en-tête et guidage gardés), jauges dehors.
        const corps = function () { return q(".mkmg-corps").getBoundingClientRect().height; };
        r.panneau = { jaugesDehors: !!q(".mkmg-jauges .mkmg-jauge") && !q(".mkmg-panneau .mkmg-jauge"),
          ouvert: corps() > 0 && !M().etat().reduit, stats: /\d/.test(q(".mkmg-stats").textContent),
          cartouches: /\d · \d/.test(q(".mkmg-tirer .mkmg-cartouches").textContent) };
        q(".mkmg-plier").click();
        r.panneau.reduit = M().etat().reduit && corps() === 0 && !!q(".mkmg-vague").getBoundingClientRect().height &&
          q(".mkmg-plier").getAttribute("aria-expanded") === "false";
        q(".mkmg-plier").click();
        r.panneau.rouvert = !M().etat().reduit && corps() > 0;
        // Quitter : la greffe part, l'itinéraire de l'app revient.
        q(".mkmg-panneau .mkmg-bouton").click();
        await pause(300);
        r.quitte = { enCours: M().etat().enCours, greffe: K.etat().greffe, roads: K.etat().compte.roads,
          panneau: !!q(".mkmg-panneau"), boutonVue: !q("#kta-vue3d .kta-v3d-vue").disabled };
        // Difficile : ni tracés, ni trajet, ni balise, ni guidage.
        await code();
        q('input[name="kta-confirm-choix"][value="difficile"]').click();
        q("#kta-confirm-oui").click();
        for (let k = 0; k < 60 && !(M().etat().cible); k++) await pause(50);
        await pause(200);
        r.difficile = { diff: M().etat().diff, reglage: K.etat().greffe.reglage, roads: K.etat().compte.roads,
          traits: M().etat().traits, guide: q(".mkmg-guide").hidden };
        // Fermer la vue termine la partie.
        await K.fermer();
        r.ferme = M().etat().enCours;
        window.ktaEstAccessible = acc;
        window.setEditorPoints(poisAvant || []);
        window.setStructures([]); window.setZones([]); window.setRoads([]); window.KtaGalerie.invalider();
        if (tracker) window.startTracking();
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      verifier(MK.avant.greffe === null && MK.avant.roads === 2, "jeu : rien avant le code (tracé et itinéraire dessinés)",
        MK.avant);
      verifier(MK.refusInstallation && MK.refusSuivi, "jeu : refusé sur une installation reliée et pendant le suivi",
        { installation: MK.refusInstallation, suivi: MK.refusSuivi });
      verifier(MK.permisInstallation, "jeu : installation reliée autorisée par reglages.json (addons.mkmg) → " +
        "confirmation ; « Rester ici » ne lance rien", MK.permisInstallation);
      verifier(MK.radios === 3 && MK.partie.greffe === "mkmg" && MK.partie.diff === "facile" && MK.partie.vague === 1 &&
        MK.partie.cible === "Salle fictive" && MK.partie.route >= 2 && MK.partie.traits === 4 &&
        MK.partie.chevrons >= 2 && MK.partie.panneau && MK.partie.fleche && /\d/.test(MK.partie.reste || "") &&
        MK.partie.surTrace && MK.partie.horsPilier,
        "jeu : confirmation à 3 difficultés ; facile → cible (POI fictif à 4 m du tracé, validée près du tracé, hors " +
        "du pilier et de l'effondrement qui le couvrent), trajet et ses chevrons de sens, balise, panneau, flèche, reste",
        MK.partie);
      verifier(MK.elementsJeu > 0 && MK.chevauche.length === 0,
        "jeu : ses éléments (" + MK.elementsJeu + ") ne chevauchent aucune commande de la vue (boutons, pastille, " +
        "boussole)",
        MK.chevauche);
      verifier(MK.partie.ennemis >= 1 && MK.partie.objets >= 2 && MK.partie.tirer && MK.partie.cartouches === "2/6",
        "jeu : vague 1 peuplée (égarés, munitions, champignons), bouton de tir, 2 cartouches + 6", MK.partie);
      verifier(MK.tir.canon === 1 && MK.tir.tues === 1 && MK.tir.ennemis === 0 && MK.tir.cadavres === 1,
        "jeu : un coup à 5 m tue l'égaré devant soi (Espace) ; il tombe et reste au sol", MK.tir);
      verifier(MK.joueur.arme && MK.joueur.surCamera && !MK.joueur.silhouette && MK.tirJoueur.recul > 0 &&
        MK.tirJoueur.eclair, "jeu : bras et fusil 3D accrochés à la caméra (recul et éclair au tir)",
        { yeux: MK.joueur, tir: MK.tirJoueur });
      verifier(MK.plongee.vue === "yeux" && MK.plongee.reglage === false && MK.plongee.bouton && MK.quitte.boutonVue,
        "jeu : vue plongeante interdite pendant la partie (🦅 grisé, basculement refusé), rendue en quittant",
        { partie: MK.plongee, quitte: MK.quitte.boutonVue });
      verifier(MK.viseur.cap === 100 && MK.viseur.apres === 90,
        "jeu : viseur à la souris — regard rejoué par la vue (40 px → 10°), glisser clos (pas de doigt resté posé)",
        MK.viseur);
      verifier(MK.recalage.apres > MK.recalage.avant && MK.recalage.resteApres > MK.recalage.resteAvant + 25 &&
        MK.recalage.ecart < 2, "jeu : enfui à 30 m derrière le départ, le trajet se recale d'ici à B", MK.recalage);
      verifier(MK.rage.a19 === false && MK.rage.a20 === true && MK.rage.active && MK.rage.sante === 100 && MK.rage.tues === 0 &&
        MK.rage.tirs >= 4 && MK.rage.chargeurAvant === 25 &&
        MK.rage.chargeur === 25 - MK.rage.tirs && MK.rage.munitions && MK.rage.lache === 0 &&
        MK.rage.fin === false, "jeu : rage prête à 20 égarés, santé rendue, détente tenue = tir automatique (chargeur de 25), " +
        "cartouches non comptées, s'arrête au relâché, retombe à la fin", MK.rage);
      verifier(MK.recharge.canon === 0 && MK.recharge.recharge && MK.recharge.apres === "2/4",
        "jeu : canon vide → recharge automatique de 1,5 s (2 cartouches prises dans la réserve)", MK.recharge);
      verifier(MK.ramasse.reserve === 8 && MK.ramasse.sante === 80 && MK.ramasse.objets === 0,
        "jeu : en passant dessus, munitions (+4) et champignon (+30 santé) ramassés", MK.ramasse);
      verifier(MK.contact < 80, "jeu : au contact d'un égaré, la santé baisse (" + MK.contact + ")", MK.contact);
      verifier(MK.silFace.vu === true && MK.silDos.vu === false && MK.silDos.avance > 0,
        "jeu : la silhouette reste figée dans le faisceau, avance dès qu'on lui tourne le dos",
        { face: MK.silFace, dos: MK.silDos });
      verifier(MK.pile.lampe < 0.5 && Math.abs(MK.pile.vue - MK.pile.lampe) < 0.02 && MK.pile.faible &&
        MK.pile.rendue === 1, "jeu : pile à 10 % → la lampe de la vue baisse (jauge en alerte) ; pile pleine → rendue",
        MK.pile);
      verifier(MK.gardien.jauge && MK.gardien.pv === 2 && MK.gardien.recul > 0.2 && MK.gardien.vivant &&
        MK.gardien.jaugePartie, "jeu : gardien = jauge à part ; un coup à 5 m lui ôte 2 PV, il recule et tient debout",
        MK.gardien);
      verifier(MK.hurleur.message && MK.hurleur.ennemis >= 1,
        "jeu : un hurleur en vue crie (message), les égarés accourent", MK.hurleur);
      verifier(MK.eau.dedans === true && MK.eau.vitesse === 0.6 && MK.eau.sortie === 1,
        "jeu : dans l'eau, pas ralenti à 60 % (réglage vitesse de la greffe), rendu en sortant", MK.eau);
      console.log("  ℹ️ jeu, charge (8 égarés + silhouette) : " + MK.charge.msMonde + " ms de monde par image, égaré loin " +
        "rapproché de " + MK.charge.approche.toFixed(1) + " m en 1,5 s");
      verifier(MK.charge.ennemis === 9 && MK.charge.msMonde < 2 && MK.charge.approche > 0.5,
        "jeu : 8 égarés + silhouette pensés à 15 Hz sous 2 ms par image, l'égaré loin s'approche (carte des distances)",
        MK.charge);
      verifier(MK.chronoAffiche && MK.tropTard.depasse && MK.tropTard.sante === 75 && MK.tropTard.ennemis >= 6 &&
        MK.tropTard.vague === 1 && MK.tropTard.alerte,
        "jeu : chrono affiché (longueur du trajet) ; à 0 → −25 de santé, horde autour de soi, la vague continue",
        { affiche: MK.chronoAffiche, tropTard: MK.tropTard });
      verifier(MK.tenaille.devant >= 2 && MK.tenaille.derriere >= 2,
        "jeu : tenaille = un groupe devant sur le trajet ET un groupe dans le dos", MK.tenaille);
      // ≥ 2 : une partie du groupe peut tomber dans l'effondrement fictif près de B, refusée (placeOk).
      verifier(MK.mi.fait === true && MK.mi.ennemis >= 2, "jeu : à mi-parcours du trajet, la tenaille se déclenche seule",
        MK.mi);
      verifier(MK.partie.reglage.itineraire === false && MK.partie.reglage.guidage === false &&
        MK.partie.reglage.traces !== false && MK.partie.roads === 1,
        "jeu : itinéraire et guidage de l'app masqués pendant la partie, tracés gardés (facile)", MK.partie);
      verifier(MK.court.endurance < 100 && MK.souffle.souffle && MK.souffle.course === false && !MK.souffle.rapide &&
        MK.repos.souffle === false && MK.repos.course === true,
        "jeu : le pas rapide vide l'endurance ; à bout de souffle plus de course, elle revient au repos",
        { court: MK.court, souffle: MK.souffle, repos: MK.repos });
      verifier(MK.silDos.coeur === 0 && MK.court.coeur === 0 && MK.souffle.coeur > 0.5 && MK.repos.coeur === 0,
        "jeu : battement de cœur seulement à bout de souffle (ni près de la silhouette, ni en courant), éteint au repos",
        { silhouette: MK.silDos.coeur, court: MK.court.coeur, souffle: MK.souffle.coeur, repos: MK.repos.coeur });
      verifier(MK.vague2.vague === 2 && MK.vague2.reussies === 1, "jeu : cible atteinte → vague 2", MK.vague2);
      verifier(MK.fin.fin && MK.fin.carte && MK.fin.score === 1 && MK.fin.tirer === true && MK.rejoue.enCours &&
        !MK.rejoue.fin && MK.rejoue.vague === 1 && !MK.rejoue.carte && MK.fin.pave === false && MK.rejoue.pave === true,
        "jeu : santé à 0 → fin, meilleure vague retenue (1), tir coupé, commandes retirées (la carte se touche) ; " +
        "« Rejouer » relance la vague 1, commandes revenues",
        { fin: MK.fin, rejoue: MK.rejoue });
      console.log("  ℹ️ jeu, son après « Rejouer » : " + MK.son.avant + " → " + MK.son.apres + " (navigateur de test : " +
        "un clic simulé n'est pas un geste, le son peut y rester suspendu)");
      // Sans WebAudio (WebKit de test sous Windows), le jeu reste muet : rien à vérifier.
      if (!MK.son.api) console.log("  ℹ️ jeu, son après « Rejouer » : pas de WebAudio dans ce navigateur, contrôle sauté");
      else verifier(MK.son.actif === true && !(MK.son.avant === "running" && MK.son.apres !== "running"),
        "jeu : après « Rejouer », le son reste actif (la veille de l'ancienne partie ne le suspend pas)", MK.son);
      verifier(MK.stats.tirs === 2 && MK.stats.touches === 1 && MK.stats.tues === 1,
        "jeu : statistiques (2 balles tirées, 1 au but, 1 égaré tué)", MK.stats);
      verifier(MK.panneau.jaugesDehors && MK.panneau.ouvert && MK.panneau.stats && MK.panneau.cartouches &&
        MK.panneau.reduit && MK.panneau.rouvert,
        "jeu : jauges en haut à gauche hors du panneau, cartouches sur le bouton de tir ; panneau réduit puis rouvert " +
        "(vague et chrono gardés)", MK.panneau);
      verifier(MK.quitte.enCours === false && MK.quitte.greffe === null && MK.quitte.roads === 2 && !MK.quitte.panneau,
        "jeu : Quitter retire la greffe, l'itinéraire de l'app revient", MK.quitte);
      verifier(MK.difficile.diff === "difficile" && MK.difficile.reglage.traces === false && MK.difficile.roads === 0 &&
        MK.difficile.traits === 0 && MK.difficile.guide === true && MK.ferme === false,
        "jeu : difficile → ni tracés, ni trajet, ni balise, ni guidage ; fermer la vue termine la partie",
        { difficile: MK.difficile, ferme: MK.ferme });

      // ── 22. Interrupteur 🪧 Guidage de la tuile ⚙️ : bandeau et chevrons masqués, ruban gardé, urgence toujours ──
      const GU = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return Object.assign({ level: 0 }, { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }); };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const q = function (s) { return document.querySelector("#kta-vue3d " + s); };
        const acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        window.setVue3DGuidage(true);
        let pref2D = null;
        try { pref2D = localStorage.getItem("myktamap_guidage_v1"); } catch (err) { /* lecture seule */ }
        const iti = function (urgence) {
          const r = { uid: "rd_gu_iti", type: "itinerary", level: 0, points: [P(-30, 0), P(0, 0), P(0, 20)] };
          if (urgence) r.urgence = true;
          return r;
        };
        window.setStructures([]);
        window.setRoads([{ uid: "rd_gu_p", type: "principal", level: 0, points: [P(-40, 0), P(0, 0), P(0, 30)] }, iti(false)]);
        window.KtaGalerie.invalider();
        const d = P(-26, 0), r = {};
        const lire = function () {
          const e = K.etat();
          return { bandeau: e.bandeau.affiche, urgence: !!e.bandeau.affiche && q(".kta-v3d-bandeau").classList.contains("kta-v3d-guid-urgence"),
            chevrons: e.chevronsVisibles ? e.chevrons : 0, ruban: e.rubans.itinerary || 0, montre: e.reglages.guidage,
            presse: q('[data-v3d="guidage"]').getAttribute("aria-pressed"), repere: e.reglages.repere,
            dansTuile: !!q('[data-v3d="guidage"]').closest("#kta-v3d-reglages") };
        };
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        await pause(500);
        r.montre = lire();
        q('[data-v3d="reglages"]').click();
        q('[data-v3d="guidage"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 5 }));
        await pause(500);
        r.coupe = lire();
        r.coupe.pref = window.getVue3DGuidage();
        try { r.coupe.pref2D = localStorage.getItem("myktamap_guidage_v1") === pref2D; } catch (err) { r.coupe.pref2D = true; }
        // Guidage d'urgence : affiché même coupé.
        window.setRoads([{ uid: "rd_gu_p", type: "principal", level: 0, points: [P(-40, 0), P(0, 0), P(0, 30)] }, iti(true)]);
        await pause(600);
        r.urgence = lire();
        window.setRoads([{ uid: "rd_gu_p", type: "principal", level: 0, points: [P(-40, 0), P(0, 0), P(0, 30)] }, iti(false)]);
        await K.fermer();
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        await pause(500);
        r.rouverte = lire();
        window.setVue3DGuidage(true);
        await K.fermer();
        window.ktaEstAccessible = acc;
        window.setRoads([]); window.KtaGalerie.invalider();
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      verifier(GU.montre.bandeau && GU.montre.chevrons > 0 && GU.montre.ruban > 0 && GU.montre.montre &&
        GU.montre.presse === "true" && GU.montre.dansTuile,
        "guidage montré par défaut : bandeau, chevrons et ruban ; interrupteur 🪧 dans la tuile ⚙️", GU.montre);
      verifier(!GU.coupe.bandeau && GU.coupe.chevrons === 0 && GU.coupe.ruban > 0 && !GU.coupe.montre &&
        GU.coupe.presse === "false" && GU.coupe.repere && GU.coupe.pref === false && GU.coupe.pref2D,
        "guidage coupé : ni bandeau ni chevrons, le ruban reste ; repère sur ⚙️ ; préférence 2D inchangée", GU.coupe);
      verifier(GU.urgence.bandeau && GU.urgence.urgence && GU.urgence.chevrons > 0 && !GU.urgence.montre,
        "guidage coupé : un guidage d'urgence s'affiche quand même (bandeau et chevrons)", GU.urgence);
      verifier(!GU.rouverte.bandeau && GU.rouverte.chevrons === 0 && GU.rouverte.ruban > 0 && !GU.rouverte.montre &&
        GU.rouverte.presse === "false", "réglage retenu sur l'appareil : rouverte, guidage toujours coupé", GU.rouverte);

      // ── 24. Interrupteur 🧱 Textures : roche brute et parpaing à l'échelle réelle, couleurs de la légende une fois coupé ──
      const TX = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const q = function (s) { return document.querySelector("#kta-vue3d " + s); };
        const acc = window.ktaEstAccessible, LC = window.LegendCustomization, trouver = LC.findCustomEntry;
        window.ktaEstAccessible = function () { return true; };
        // Type perso fictif (polygone, couleur choisie) : sa base est la géométrie de son entrée de légende.
        LC.findCustomEntry = function (id) {
          if (id === "cust-v3d-zone") return { id: id, category: "zones", geometry: "polygon", fillColor: "#7d3cff" };
          return id === "cust-v3d-tex" ? { id: id, category: "structures", geometry: "polygon", fillColor: "#3c9be0" }
            : trouver.apply(LC, arguments);
        };
        try { localStorage.removeItem("myktamap_v3d_textures_v1"); } catch (err) { /* lecture seule */ }
        const carre = function (cx, cz, r) { return [P(cx - r, cz - r), P(cx + r, cz - r), P(cx + r, cz + r), P(cx - r, cz + r)]; };
        const rect = function (x0, z0, x1, z1) { return [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)]; };
        window.setRoads([{ uid: "rd_tx", type: "principal", level: 0, points: [P(-40, 0), P(-8, 0)] }]);
        window.setStructures([
          { uid: "st_tx_p", type: "pilier-1", level: 0, points: carre(4, -3, 1) },
          { uid: "st_tx_f", type: "front-2", level: 0, points: [P(10, -12), P(10, 12)] },
          { uid: "st_tx_m2", type: "mur", level: 0, points: rect(0, 6, 2, 6.4) },
          { uid: "st_tx_m40", type: "mur", level: 0, points: rect(-20, 14, 20, 14.4) },
          { uid: "st_tx_ml", type: "mur-ligne", level: 0, points: [P(-6, -8), P(6, -10)] },
          { uid: "st_tx_c", type: "cust-v3d-tex", level: 0, points: carre(4, 3, 1) },
          { uid: "st_tx_x", type: "type-inconnu-v3d", level: 0, points: carre(6, 9, 0.5) }
        ]);
        // Remblais et effondrement : un petit (1 m) et un grand (10 m) en chambre, un de chaque dans le tube ; eau
        // et type de zone perso pour les contre-épreuves (jamais texturés).
        window.setZones([
          { uid: "zn_tx_r1", type: "remblais", level: 0, points: carre(6, -6, 0.5) },
          { uid: "zn_tx_r2", type: "remblais", level: 0, points: rect(12, -6, 22, 4) },
          { uid: "zn_tx_rt", type: "remblais", level: 0, points: rect(-30, -3, -27, 3) },
          { uid: "zn_tx_e1", type: "effondrement", level: 0, points: rect(12, 6, 18, 10) },
          { uid: "zn_tx_et", type: "effondrement", level: 0, points: rect(-22, -3, -19, 3) },
          { uid: "zn_tx_eau", type: "eau", level: 0, points: rect(-15, -3, -13, 3) },
          { uid: "zn_tx_cz", type: "cust-v3d-zone", level: 0, points: rect(-11, -3, -9, 3) }
        ]);
        const legendeZ = ["remblais", "effondrement", "eau"].reduce(function (o, k) {
          o[k] = window.ktaResolveStyle("zones", k, { flat: true }).fillColor;
          return o;
        }, {});
        window.KtaGalerie.invalider();
        const d = P(-6, 0), r = {};
        const lire = function () {
          const t = K.textures(), e = K.etat();
          return { t: t, repere: e.reglages.repere, murDecale: e.murDecale, yMax: e.yMax,
            parois: !!e.boites.parois, rendu: e.rendu, greffe: e.greffe, hauteur: e.hauteur };
        };
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, tuiles: false });
        await pause(100);
        r.defaut = lire();
        r.defaut.pref = window.getVue3DTextures();
        r.legende = legendeZ;
        // Parois à deux hauteurs de galerie : même échelle (aucun étirement), puis hauteur rendue.
        const h0 = K.etat().hauteur;
        K.reglerHauteur(2.5);
        await pause(50);
        r.h25 = lire();
        K.reglerHauteur(6);
        await pause(50);
        r.h6 = lire();
        K.reglerHauteur(h0);
        await pause(50);
        // Une greffe posée ne doit rien sentir de la bascule (scène et groupe gardés).
        const j = [];
        K.greffer({ nom: "tex", scene: function (ctx, raison) {
          j.push("scene:" + raison);
          ctx.groupe.add(new ctx.THREE.Object3D());
        }, demonter: function (ctx, raison) { j.push("demonter:" + raison); } });
        await pause(50);
        q('[data-v3d="reglages"]').click();
        q('[data-v3d="textures"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 6 }));
        await pause(100);
        r.coupe = lire();
        r.coupe.pref = window.getVue3DTextures();
        r.coupe.tuile = K.etat().reglages.ouvert;
        r.coupe.dansTuile = !!q('[data-v3d="textures"]').closest("#kta-v3d-reglages");
        r.coupe.journal = j.slice();
        K.basculerTextures();
        await pause(50);
        r.remis = lire();
        r.remis.journal = j.slice();
        K.basculerTextures();
        await K.fermer();
        // Référence : vue ouverte d'emblée avec les textures coupées = le rendu d'origine.
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, tuiles: false });
        await pause(100);
        r.rouverte = lire();
        await K.fermer();
        // Structures seules, puis galerie (aucune structure : aucun matériau de texture).
        window.setVue3DTextures(true);
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, tuiles: false });
        const renduAvant = K.etat().rendu;
        K.basculerRendu("structures");
        await pause(50);
        r.structures = lire();
        K.basculerRendu("galerie");
        await pause(50);
        r.galerie = lire();
        K.basculerTextures();
        await pause(50);
        r.galerieCoupe = lire();
        K.basculerTextures();
        K.basculerRendu(renduAvant);
        await K.fermer();
        r.libere = K.textures() === null;
        LC.findCustomEntry = trouver;
        window.ktaEstAccessible = acc;
        window.setStructures([]); window.setRoads([]); window.setZones([]); window.KtaGalerie.invalider();
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      // Couleur d'un sommet (octets linéaires de three.js) → hex sRGB, pour la comparer à la légende.
      const versSrgb = function (hex) {
        return [1, 3, 5].map(function (i) {
          const c = parseInt(hex.substr(i, 2), 16) / 255;
          return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
        });
      };
      const contient = function (liste, hex) {
        const v = [1, 3, 5].map(function (i) { return parseInt(hex.substr(i, 2), 16); });
        return (liste || []).some(function (h) {
          const w = versSrgb(h);
          return Math.abs(w[0] - v[0]) <= 4 && Math.abs(w[1] - v[1]) <= 4 && Math.abs(w[2] - v[2]) <= 4;
        });
      };
      const D0 = TX.defaut.t, C0 = TX.coupe.t, R0 = TX.rouverte.t;
      // Parois des tubes (mixte) : pierre de taille avec relief quand 🧱 est activé, moellons d'origine coupé.
      const pa = D0.materiaux.paroi || {}, pc = C0.materiaux.paroi || {}, pr = R0.materiaux.paroi || {};
      const ech2 = function (t, sens) {
        const v = t.aretes.filter(function (x) { return x.mat === "paroi" && x.sens === sens; }).map(function (x) {
          return x.uvParM;
        });
        return v.length ? { n: v.length, min: +Math.min.apply(null, v).toFixed(4), max: +Math.max.apply(null, v).toFixed(4) }
          : { n: 0 };
      };
      const juste2 = function (s, v) { return s.n > 0 && Math.abs(s.min - v) < 2e-3 && Math.abs(s.max - v) < 2e-3; };
      const UP = D0.uvParMetre;
      verifier(pa.pierre === true && pa.carte === "256x256" && pa.normale && pa.relief === 256 && pa.mipmaps &&
        pa.anisotropie >= 1 && pa.anisotropie <= 4 && pa.lits > 0.12 && D0.maillages.paroi >= 1 &&
        JSON.stringify(pa.repetition) === JSON.stringify([UP.pierre, UP.pierre]) &&
        JSON.stringify(pa.repetitionRelief) === JSON.stringify([UP.pierre, UP.pierre]),
        "🧱 activé : parois des tubes en pierre de taille, 256 px, relief (normal map), mipmaps, lits de joint " +
        "mesurés (écart de rangée " + pa.lits + ")", pa);
      const ePa = { h: ech2(D0, "h"), v: ech2(D0, "v"), h25: { h: ech2(TX.h25.t, "h"), v: ech2(TX.h25.t, "v") },
        h6: { h: ech2(TX.h6.t, "h"), v: ech2(TX.h6.t, "v") }, hauteurs: [TX.h25.hauteur, TX.h6.hauteur],
        attendu: UP.pierre };
      verifier(juste2(ePa.h, UP.pierre) && juste2(ePa.v, UP.pierre) && TX.h25.hauteur === 2.5 && TX.h6.hauteur === 6 &&
        juste2(ePa.h25.h, UP.pierre) && juste2(ePa.h25.v, UP.pierre) && juste2(ePa.h6.h, UP.pierre) &&
        juste2(ePa.h6.v, UP.pierre) && TX.h6.t.materiaux.paroi.pierre,
        "pierre des parois à la taille réelle : " + UP.pierre + " de texture par mètre en long et en hauteur, à 2,5 m " +
        "comme à 6 m de hauteur de galerie (aucun étirement)", ePa);
      const sol = D0.aretes.filter(function (x) { return x.mat === "paroi" && x.sens === "v" && Math.abs(x.y) < 1e-6; });
      verifier(sol.length > 0 && sol.every(function (x) { return Math.abs(x.v0) < 1e-6; }),
        "parois : une assise part toujours du sol (v = 0 à y = 0, " + sol.length + " arêtes)", sol.slice(0, 3));
      verifier(pc.pierre === false && pc.carte === "256x160" && !pc.normale && C0.maillages.paroi >= 1 &&
        juste2(ech2(C0, "h"), UP.moellons.h) && juste2(ech2(C0, "v"), UP.moellons.v) &&
        JSON.stringify(pc) === JSON.stringify(pr) && JSON.stringify(ech2(C0, "h")) === JSON.stringify(ech2(R0, "h")),
        "🧱 coupé : parois en moellons d'origine (256 × 160, sans relief, un motif par 1,6 × 1 m), comme une vue " +
        "ouverte sans textures", { coupe: pc, rouverte: pr, h: ech2(C0, "h"), v: ech2(C0, "v") });
      const dess = D0.dessins || {};
      verifier(dess.roche >= 0 && dess.parpaing >= 0 && dess.pierre >= 0 && D0.msParoi >= 0,
        "premier dessin des trois textures : roche " + dess.roche + " ms, parpaing " + dess.parpaing + " ms, pierre " +
        dess.pierre + " ms (à cette ouverture : structures " + D0.ms + " ms, parois " + D0.msParoi + " ms)", dess);
      verifier(D0.actives && D0.bouton === "true" && TX.defaut.pref === true &&
        D0.maillages.roche >= 1 && D0.maillages.parpaing >= 1 && !D0.maillages.murs,
        "textures actives par défaut : roche brute (piliers, fronts, type perso) et parpaing (murs)",
        { actives: D0.actives, bouton: D0.bouton, maillages: D0.maillages });
      const mp = D0.materiaux.roche || {}, mg = D0.materiaux.parpaing || {};
      // Roche brute : aucune assise appareillée, donc aucune rangée de la couleur nettement à l'écart des autres
      // (lits de mortier) ; le parpaing, lui, en a (témoin de la mesure ; l'ancienne pierre de taille : 0,57).
      verifier(mp.lits < 0.1 && mg.lits > 0.12,
        "piliers et fronts en roche brute : aucun lit de mortier (écart de rangée " + mp.lits + " ; parpaing " +
        mg.lits + ")", { roche: mp.lits, parpaing: mg.lits });
      verifier(mp.carte === "256x256" && mp.normale && mp.relief === 256 && mp.mipmaps && mp.anisotropie >= 1 &&
        mp.anisotropie <= 4 && mp.couleursSommets === false && mp.recule === false && mg.carte === "256x256" &&
        mg.normale && mg.mipmaps && mg.recule === true && TX.defaut.murDecale,
        "matériaux : couleur et normal map de 256 px (puissance de 2), mipmaps, anisotropie ≤ 4, jamais teintés ; " +
        "parpaing reculé en profondeur comme les murs (" + D0.ms + " ms pour les dessiner)", D0.materiaux);
      verifier((D0.couleurs.opaque || []).length >= 1 && !contient(D0.couleurs.opaque, "#3c9be0") &&
        TX.defaut.yMax.murs > 0 && TX.defaut.yMax.murs < TX.defaut.yMax.opaque,
        "type perso en roche brute (sa couleur n'est plus dessinée), type inconnu du canon gardé en couleur unie ; " +
        "mur toujours plus bas que pilier et front", { couleurs: D0.couleurs, yMax: TX.defaut.yMax });
      // Échelle : chaque arête horizontale ou verticale d'une face texturée, mur de 2 m comme mur de 40 m.
      const echelle = function (filtre) {
        const v = D0.aretes.filter(filtre).map(function (x) { return x.uvParM; });
        return v.length ? { n: v.length, min: Math.min.apply(null, v), max: Math.max.apply(null, v) } : { n: 0 };
      };
      const zM = function (z) { return function (x) { return x.mat === "parpaing" && Math.abs(x.z - (MX.oz + z)) < 0.5; }; };
      const ech = { mur2: echelle(zM(6.2)), mur40: echelle(zM(14.2)),
        verticalesMur: echelle(function (x) { return x.sens === "v" && x.mat === "parpaing"; }),
        roche: echelle(function (x) { return x.mat === "roche"; }), attendu: D0.uvParMetre };
      const juste = function (s, v) { return s.n > 0 && Math.abs(s.min - v) < 2e-3 && Math.abs(s.max - v) < 2e-3; };
      const ap = ech.attendu.parpaing, ar = ech.attendu.roche;
      verifier(juste(ech.mur2, ap) && juste(ech.mur40, ap) && juste(ech.verticalesMur, ap) && juste(ech.roche, ar),
        "taille réelle : parpaing " + ap + " et roche " + ar + " de texture par mètre, sur le mur de 2 m comme sur " +
        "celui de 40 m, en hauteur et sur le dessus (aucun étirement)", ech);
      verifier(!C0.actives && C0.bouton === "false" && TX.coupe.pref === false && TX.coupe.repere && TX.coupe.tuile &&
        TX.coupe.dansTuile && !C0.maillages.roche && !C0.maillages.parpaing && C0.maillages.opaque >= 1 &&
        C0.maillages.murs >= 1 && C0.aretes.every(function (x) { return x.mat === "paroi"; }),
        "🧱 coupé dans la tuile ⚙️ : matériaux d'origine, plus aucune texture ; repère sur ⚙️ ; tuile ouverte",
        { actives: C0.actives, maillages: C0.maillages, repere: TX.coupe.repere });
      verifier(contient(C0.couleurs.opaque, "#3c9be0") && contient(C0.couleurs.opaque, "#f4c542") &&
        contient(C0.couleurs.opaque, "#ff9933") && contient(C0.couleurs.murs, "#1e3a8a") &&
        JSON.stringify(C0.couleurs) === JSON.stringify(TX.rouverte.t.couleurs) &&
        JSON.stringify(C0.maillages) === JSON.stringify(R0.maillages),
        "coupé : couleurs de la légende (type perso compris), identiques à une vue ouverte sans textures",
        { coupe: C0.couleurs, rouverte: R0.couleurs });
      verifier(TX.coupe.greffe && TX.coupe.greffe.dansScene && TX.coupe.greffe.objets === 1 &&
        TX.coupe.journal.length === 1 && TX.coupe.journal[0] === "scene:greffe" && TX.remis.greffe &&
        TX.remis.greffe.dansScene && TX.remis.journal.length === 1,
        "bascule avec une greffe posée : groupe gardé dans la scène, ni demonter ni scene refaite", TX.coupe.journal);
      verifier(TX.remis.t.actives && TX.remis.t.maillages.roche >= 1 && !R0.actives && R0.bouton === "false" &&
        TX.rouverte.repere, "réglage retenu sur l'appareil : rouverte, textures toujours coupées",
        { remis: TX.remis.t.actives, rouverte: R0.actives });
      verifier(TX.defaut.rendu === "mixte" && TX.defaut.parois && TX.structures.t.maillages.roche >= 1 &&
        TX.structures.t.maillages.parpaing >= 1 && !TX.structures.t.maillages.paroi && !TX.galerie.t.maillages.roche &&
        TX.galerie.parois && TX.galerie.t.maillages.paroi >= 1 && TX.galerie.t.materiaux.paroi.pierre && TX.libere,
        "mixte (parois des tubes en pierre de taille), structures seules texturées sans paroi ; galerie : parois en " +
        "pierre de taille, aucune structure ; rien après la fermeture",
        { mixte: TX.defaut.parois, structures: TX.structures.t.maillages, galerie: TX.galerie.t.maillages });

      // Remblais (terre et cailloux) et effondrement (éboulis) : texturés sous 🧱 dans les trois rendus, à la taille
      // réelle (petite et grande zone, chambre et tube), couleurs de la légende une fois coupé.
      const dansRect = function (x0, z0, x1, z1) {
        return function (a) { return a.x >= MX.ox + x0 - 0.05 && a.x <= MX.ox + x1 + 0.05 && a.z >= MX.oz + z0 - 0.05 &&
          a.z <= MX.oz + z1 + 0.05; };
      };
      const zEch = function (t, mat, filtre) {
        const v = t.aretes.filter(function (a) { return a.mat === mat && filtre(a); });
        const u = v.map(function (a) { return a.uvParM; });
        return u.length ? { n: u.length, h: v.filter(function (a) { return a.sens === "h"; }).length,
          v: v.filter(function (a) { return a.sens === "v"; }).length, min: +Math.min.apply(null, u).toFixed(4),
          max: +Math.max.apply(null, u).toFixed(4) } : { n: 0 };
      };
      const zJuste = function (e, val, flancs) {
        return e.n > 0 && Math.abs(e.min - val) < 2e-3 && Math.abs(e.max - val) < 2e-3 && (!flancs || e.v > 0);
      };
      const ur = UP.remblais, ue = UP.eboulis, Lz = TX.legende;
      const zEchs = {
        petit: zEch(D0, "remblais", dansRect(5.5, -6.5, 6.5, -5.5)), grand: zEch(D0, "remblais", dansRect(12, -6, 22, 4)),
        tube: zEch(D0, "remblais", dansRect(-30, -3, -27, 3)), ebChambre: zEch(D0, "eboulis", dansRect(12, 6, 18, 10)),
        ebTube: zEch(D0, "eboulis", dansRect(-22, -3, -19, 3)),
        galerie: zEch(TX.galerie.t, "remblais", dansRect(-30, -3, -27, 3)),
        ebGalerie: zEch(TX.galerie.t, "eboulis", dansRect(-22, -3, -19, 3)),
        structures: zEch(TX.structures.t, "remblais", dansRect(-30, -3, -27, 3)), attendu: { remblais: ur, eboulis: ue } };
      verifier(zJuste(zEchs.petit, ur, true) && zJuste(zEchs.grand, ur, true) && zJuste(zEchs.tube, ur, true) &&
        zJuste(zEchs.galerie, ur, true) && zJuste(zEchs.structures, ur, true) &&
        zJuste(zEchs.ebChambre, ue, true) && zJuste(zEchs.ebTube, ue, true) && zJuste(zEchs.ebGalerie, ue, true),
        "remblais et effondrement à la taille réelle : " + ur + " et " + ue + " de texture par mètre, zone de 1 m comme " +
        "de 10 m, flancs (long et hauteur) et dessus, en chambre, dans le tube, en galerie et en structures seules", zEchs);
      const zSol = D0.aretes.filter(function (a) { return a.mat === "remblais" && a.sens === "v" && Math.abs(a.y) < 1e-6; });
      const ebSol = D0.aretes.filter(function (a) { return a.mat === "eboulis" && a.sens === "v" && Math.abs(a.y) < 1e-6; });
      verifier(zSol.length > 0 && zSol.every(function (a) { return Math.abs(a.v0) < 1e-6; }) && ebSol.length > 0 &&
        ebSol.every(function (a) { return Math.abs(a.v0) < 1e-6; }),
        "remblais et effondrement : la texture part du sol sur les flancs (v = 0 à y = 0, " + zSol.length + " et " +
        ebSol.length + " arêtes)", { remblais: zSol.slice(0, 2), eboulis: ebSol.slice(0, 2) });
      const mRe = D0.materiaux.remblais || {}, mEb = D0.materiaux.eboulis || {};
      verifier(mRe.carte === "256x256" && mRe.normale && mRe.relief === 256 && mRe.mipmaps && mRe.anisotropie >= 1 &&
        mRe.anisotropie <= 4 && mRe.couleursSommets === false && mEb.carte === "256x256" && mEb.normale && mEb.mipmaps &&
        mEb.couleursSommets === false && mRe.pente > 0.05 && mEb.pente > mRe.pente * 1.3 &&
        D0.maillages.remblais >= 1 && D0.maillages.eboulis >= 1 && TX.galerie.t.maillages.remblais >= 1 &&
        TX.galerie.t.maillages.eboulis >= 1 && TX.structures.t.maillages.remblais >= 1 &&
        TX.structures.t.maillages.eboulis >= 1,
        "🧱 activé : remblais et effondrement texturés (couleur et relief de 256 px, mipmaps, jamais teintés ; pente " +
        "du relief " + mRe.pente + ", éboulis plus marqué " + mEb.pente + ") en mixte, galerie et structures seules",
        { remblais: mRe, eboulis: mEb, maillages: [D0.maillages, TX.galerie.t.maillages, TX.structures.t.maillages] });
      const dZ = D0.dessins || {};
      verifier(dZ.remblais >= 0 && dZ.eboulis >= 0 && D0.msZones >= 0,
        "premier dessin : remblais " + dZ.remblais + " ms, éboulis " + dZ.eboulis + " ms (à cette ouverture : zones " +
        D0.msZones + " ms)", dZ);
      const eauTex = D0.aretes.filter(function (a) { return a.mat !== "paroi" && dansRect(-15, -3, -13, 3)(a); });
      verifier(!contient(D0.couleurs.opaque, Lz.remblais) && !contient(D0.couleurs.opaque, Lz.effondrement) &&
        contient(D0.couleurs.opaque, "#7d3cff") && eauTex.length === 0 &&
        !contient(TX.galerie.t.couleurs.opaque, Lz.remblais) && contient(TX.galerie.t.couleurs.opaque, "#7d3cff"),
        "contre-épreuves sous 🧱 : couleur de la légende du remblais et de l'effondrement plus dessinée ; type de zone " +
        "perso et eau gardés comme avant (aucune texture)", { couleurs: D0.couleurs.opaque, eau: eauTex.length });
      verifier(!C0.maillages.remblais && !C0.maillages.eboulis && contient(C0.couleurs.opaque, Lz.remblais) &&
        contient(C0.couleurs.opaque, Lz.effondrement) && !TX.galerieCoupe.t.maillages.remblais &&
        !TX.galerieCoupe.t.maillages.eboulis && contient(TX.galerieCoupe.t.couleurs.opaque, Lz.remblais) &&
        contient(TX.galerieCoupe.t.couleurs.opaque, Lz.effondrement) && !R0.maillages.remblais,
        "🧱 coupé : remblais et effondrement à la couleur de la légende (mixte et galerie), comme une vue ouverte " +
        "sans textures", { mixte: C0.couleurs.opaque, galerie: TX.galerieCoupe.t.couleurs.opaque, legende: Lz });

      // ── 24 bis. Remblais, effondrement et inaccessible = obstacles de la 3D dans tous les rendus ; 2D intacte ────
      // Tube principal à l'ouest (remblais, inaccessible, effondrement en travers), chambre à piliers à l'est (un
      // effondrement, un remblais, un inaccessible entre deux rangées). Volume dans les trois rendus ; un pas qui
      // traverse une des trois zones est arrêté au bord dans les 4 contextes (galerie, tube et chambre du mixte,
      // structures) ; départ dedans = ramené au bord, on repart ; recalage (versGalerie), itinéraire et pas du tracker
      // identiques avec et sans les zones, et jamais appelés par les règles de zones de la 3D.
      const EF = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, G = window.KtaGalerie;
        const P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const rect = function (x0, z0, x1, z1) { return [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)]; };
        const acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        window.setVue3DTextures(true);
        window.setRoads([{ uid: "rd_ef", type: "principal", level: 0, points: [P(-40, 0), P(44, 0)] }]);
        // Faces des piliers sur des x entiers, atteints par les pas de 0,1 m : un rayon du corps aligné sur une
        // face sans la recouvrir ne compte pas comme un contact (tracking.js > _segmentsSeCoupent).
        const st = [];
        for (let i = 0; i < 4; i++) {
          const x = 22 + i * 6;
          st.push({ uid: "st_ef_n" + i, type: "pilier-1", level: 0, points: rect(x, -3.5, x + 2, -2) });
          st.push({ uid: "st_ef_s" + i, type: "pilier-1", level: 0, points: rect(x, 2, x + 2, 3.5) });
        }
        window.setStructures(st);
        // [nom, type, x0 (bord ouest, m), x1, départ de la marche, contexte du mixte]
        const Z = [
          ["rt", "remblais", -34, -31, -39, "tube"], ["it", "inaccessible", -27, -25, -30, "tube"],
          ["et", "effondrement", -16, -12, -22, "tube"], ["ec", "effondrement", 25, 27, 23, "chambre"],
          ["rc", "remblais", 31, 33, 29.5, "chambre"], ["ic", "inaccessible", 37, 39, 35.5, "chambre"]
        ];
        const zones = Z.map(function (z) {
          const h = z[5] === "tube" ? 3 : 1.5;
          return { uid: "zn_ef_" + z[0], type: z[1], level: 0, points: rect(z[2], -h, z[3], h) };
        });
        const relx = function () { return +(K.etat().pos.x / a.sc - a.ox).toFixed(2); };
        const marcher = function (x, n) {
          const d = P(x, 0);
          K.placer(d.x, d.y, 90);
          for (let i = 0; i < n; i++) K.avancer(0.1);
          return relx();
        };
        // Repartir : 2 m vers l'est, sinon vers l'ouest → distance parcourue (m).
        const repartir = function () {
          const p0 = Object.assign({}, K.etat().pos);
          for (let i = 0; i < 10; i++) K.avancer(0.2);
          let p1 = K.etat().pos;
          if (Math.hypot(p1.x - p0.x, p1.y - p0.y) / a.sc < 1) {
            K.placer(p0.x, p0.y, 270);
            for (let i = 0; i < 10; i++) K.avancer(0.2);
            p1 = K.etat().pos;
          }
          return +(Math.hypot(p1.x - p0.x, p1.y - p0.y) / a.sc).toFixed(2);
        };
        const r = { chambres: {} };
        // 2D : recalage dans l'effondrement du tube et à côté, dans l'inaccessible du tube, itinéraire qui traverse
        // l'effondrement, pas du tracker à travers les trois zones du tube.
        const deux = async function () {
          G.invalider();
          const v = G.versGalerie(P(-14, 0.5).x, P(-14, 0.5).y, 0), w = G.versGalerie(P(-14, 4).x, P(-14, 4).y, 0);
          const vi = G.versGalerie(P(-26, 0.5).x, P(-26, 0.5).y, 0);
          let it;
          try {
            const ri = await window.Pathfinder.computeRoute([P(-20, 0), P(-6, 0)], { allowedTypes: ["principal"] });
            it = { d: Math.round(ri.totalDistance), chemin: JSON.stringify(ri.path || ri.points || ri.coords || null) };
          } catch (e) { it = e.code || String(e && e.message); }
          const seg = [[P(-39, 0).x, P(-39, 0).y, P(-6, 0).x, P(-6, 0).y], [P(24, 0).x, P(24, 0).y, P(40, 0).x, P(40, 0).y]];
          return { dedans: v, ramene: w, inaccessible: vi, iti: it,
            pasTracker: window.ktaSegmentsBloquesParStructure(seg, 0),
            pasUn: window.ktaPasBloqueParStructure(seg[0][0], seg[0][1], seg[0][2], seg[0][3], 0) };
        };
        window.setZones([]);
        r.sans = await deux();
        // Sentinelle : les règles de zones de la 3D ne sont jamais appelées par la 2D.
        const zb = G.zonesBloquent, dz = G.dansZone;
        let appels = 0;
        G.zonesBloquent = function () { appels++; return zb.apply(null, arguments); };
        G.dansZone = function () { appels++; return dz.apply(null, arguments); };
        // Remblais et effondrement seuls : tout identique ; avec l'inaccessible (qui coupe déjà l'itinéraire en 2D,
        // règle du Pathfinder inchangée), recalage et pas du tracker identiques.
        window.setZones(zones.filter(function (z) { return z.type !== "inaccessible"; }));
        r.volumes = await deux();
        window.setZones(zones);
        r.avec = await deux();
        r.appels2D = appels;
        G.zonesBloquent = zb; G.dansZone = dz;
        for (const rendu of ["galerie", "mixte", "structures"]) {
          window.setPlanRenduVue3D(null, rendu);
          G.invalider();
          await K.ouvrir({ depart: Object.assign({ cap: 90 }, P(-22, 0)), tuiles: false });
          await pause(50);
          const e = K.etat(), b = e.boites.effondrement, t = K.textures();
          const o = r[rendu] = {
            rendu: e.rendu, hauteur: e.hauteur, faces: e.facesEboulis,
            boite: b ? { x0: +(b.x0 - a.ox).toFixed(2), x1: +(b.x1 - a.ox).toFixed(2), y1: +b.y1.toFixed(2) } : null,
            remblaisY: e.boites.remblais ? +e.boites.remblais.y1.toFixed(2) : null,
            maillages: t.maillages.eboulis || 0, marche: {}, dedans: {}
          };
          Z.forEach(function (z) { o.marche[z[0]] = marcher(z[4], 100); });
          if (rendu === "mixte") {
            const m = G.modele(0, true);
            Z.forEach(function (z) { r.chambres[z[0]] = m.enChambre(P((z[2] + z[3]) / 2, 0).x, P(0, 0).y); });
          }
          await K.fermer();
          // Départ au milieu de chaque zone : ramené dehors (au bord), on repart.
          for (const z of Z) {
            const c = (z[2] + z[3]) / 2;
            await K.ouvrir({ depart: Object.assign({ cap: 90 }, P(c, 0)), tuiles: false });
            const p = K.etat().pos;
            o.dedans[z[0]] = { x: relx(), degage: K.etat().degagements, dansZone: G.dansZone(p.x, p.y, 0),
              repart: repartir() };
            await K.fermer();
          }
        }
        // 🧱 coupé : le volume reste, à la couleur de la légende.
        window.setVue3DTextures(false);
        window.setPlanRenduVue3D(null, "galerie");
        await K.ouvrir({ depart: Object.assign({ cap: 90 }, P(-22, 0)), tuiles: false });
        const ec = K.etat(), tc = K.textures();
        r.coupe = { y1: ec.boites.opaque ? +ec.boites.opaque.y1.toFixed(2) : null, faces: ec.facesEboulis,
          eboulis: tc.maillages.eboulis || 0, couleurs: tc.couleurs.opaque, tube: marcher(-22, 100),
          legende: window.ktaResolveStyle("zones", "effondrement", { flat: true }).fillColor };
        await K.fermer();
        window.setVue3DTextures(true);
        window.setPlanRenduVue3D(null, "mixte");
        window.ktaEstAccessible = acc;
        window.setStructures([]); window.setRoads([]); window.setZones([]); G.invalider();
        r.Z = Z;
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      const hEf = EF.galerie.hauteur * 0.6;
      const pres2 = function (v, att) { return typeof v === "number" && Math.abs(v - att) < 0.01; };
      verifier(["galerie", "mixte", "structures"].every(function (k) {
        const o = EF[k];
        return o.rendu === k && o.boite && pres2(o.boite.y1, hEf) && pres2(o.remblaisY, hEf) && o.maillages >= 1 &&
          o.boite.x0 >= -16.01 && o.boite.x1 <= 27.01;
      }) && EF.galerie.faces === 4 && EF.mixte.faces === 2,
        "effondrement en volume texturé (éboulis) à la hauteur du remblais (" + hEf.toFixed(2) + " m) en galerie, " +
        "mixte (tube et chambre) et structures ; découpé au tube, faces vers la galerie seulement",
        { g: EF.galerie.boite, m: EF.mixte.boite, s: EF.structures.boite, faces: [EF.galerie.faces, EF.mixte.faces] });
      verifier(EF.Z.every(function (z) { return EF.chambres[z[0]] === (z[5] === "chambre"); }),
        "témoin : les zones de l'ouest sont dans un tube du mixte, celles de l'est dans une chambre", EF.chambres);
      // Arrêt au bord : corps de 0,2 m et balayage prolongé de 0,2 m, pas de 0,1 m → entre 0,3 et 0,6 m avant le bord.
      const arrete = function (v, bord) { return typeof v === "number" && v > bord - 0.6 && v < bord - 0.3; };
      ["galerie", "mixte", "structures"].forEach(function (k) {
        EF.Z.forEach(function (z) {
          const ctx = k === "mixte" ? "mixte (" + z[5] + ")" : k;
          verifier(arrete(EF[k].marche[z[0]], z[2]),
            ctx + " : un pas qui traverse " + (z[1] === "inaccessible" ? "l'inaccessible" : "le " + z[1]) +
            " est arrêté au bord (" + EF[k].marche[z[0]] + " m, bord à " + z[2] + " m)", EF[k].marche);
        });
      });
      ["galerie", "mixte", "structures"].forEach(function (k) {
        const d = EF[k].dedans;
        verifier(EF.Z.every(function (z) {
          const o = d[z[0]];
          return o.degage >= 1 && !o.dansZone && (o.x <= z[2] + 0.01 || o.x >= z[3] - 0.01) && o.repart > 1;
        }), k + " : départ dans chacune des 6 zones (" + (k === "mixte" ? "3 en tube, 3 en chambre" : "remblais, " +
          "effondrement, inaccessible") + ") ramené au bord, on repart", d);
      });
      const sansIti = function (o) { return JSON.stringify(Object.assign({}, o, { iti: null })); };
      verifier(JSON.stringify(EF.sans) === JSON.stringify(EF.volumes) && sansIti(EF.sans) === sansIti(EF.avec) &&
        EF.appels2D === 0 && EF.avec.dedans.etat === "dedans" && EF.avec.ramene.etat === "ramene" &&
        EF.avec.inaccessible.etat === "dedans" && typeof EF.volumes.iti === "object" && EF.volumes.iti.d > 0 &&
        EF.avec.pasTracker.every(function (b) { return !b; }) && EF.avec.pasUn === false,
        "2D intacte : recalage du tracker (versGalerie dans et à côté de l'effondrement, dans l'inaccessible), " +
        "itinéraire qui traverse l'effondrement et pas du tracker à travers les 6 zones identiques avec et sans elles ; " +
        "règles de zones de la 3D appelées " + EF.appels2D + " fois par la 2D",
        { sans: EF.sans, volumes: EF.volumes, avec: EF.avec });
      verifier(EF.coupe.eboulis === 0 && pres2(EF.coupe.y1, hEf) && EF.coupe.faces === 4 && arrete(EF.coupe.tube, -16) &&
        contient(EF.coupe.couleurs, EF.coupe.legende),
        "🧱 coupé : l'effondrement reste un volume qui arrête, à la couleur de la légende", EF.coupe);
      // ── 24 ter. Itinéraire par-dessus un remblais ou un effondrement (ruban, tirets, chevrons, étape) ──────────
      // Tube principal, effondrement de 4 m en travers (-16 → -12), itinéraire de -23,5 à -4 (une face franchie dans
      // un tiret à l'entrée comme à la sortie), étape sur l'effondrement. Trois rendus ; tracé 2D inchangé.
      const IV = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc, level: 0 }; };
        const rect = function (x0, z0, x1, z1) { return [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)]; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const acc = window.ktaEstAccessible;
        window.ktaEstAccessible = function () { return true; };
        window.setVue3DGuidage(true);
        window.setStructures([]);
        const pts = [P(-23.5, 0), P(-14, 0), P(-4, 0)];
        const iti = { uid: "rd_iv", type: "itinerary", level: 0, points: pts,
          raccords: [{ role: "depart", vers: { x: pts[0].x, y: pts[0].y } },
            { role: "etape", label: "Étape fictive", vers: { x: pts[1].x, y: pts[1].y } },
            { role: "arrivee", label: "Arrivée fictive", vers: { x: pts[2].x, y: pts[2].y } }] };
        window.setRoads([{ uid: "rd_iv_p", type: "principal", level: 0, points: [P(-40, 0), P(10, 0)] }, iti]);
        window.setZones([{ uid: "zn_iv_e", type: "effondrement", level: 0, points: rect(-16, -3, -12, 3) }]);
        const avant2D = JSON.stringify(window.getRoads().filter(function (r) { return r.type === "itinerary"; }));
        const rel = function (q) { return [+(q[0] - a.ox).toFixed(2), q[1], q[2], q[3], q[4]]; };
        const r = {};
        for (const rendu of ["mixte", "galerie", "structures"]) {
          window.setPlanRenduVue3D(null, rendu);
          window.KtaGalerie.invalider();
          await K.ouvrir({ depart: Object.assign({ cap: 90 }, P(-21, 0.6)), tuiles: false });
          await pause(400);
          const e = K.etat({ profilIti: true }), it = e.itineraire;
          r[rendu] = { rendu: e.rendu, hauteur: e.hauteur, profil: (it.profil || []).map(rel),
            chevrons: (it.chevronsY || []).map(function (c) { return [+(c[0] - a.ox).toFixed(2), c[2]]; }),
            etapes: (it.etapesY || []).map(function (c) { return [+(c[0] - a.ox).toFixed(2), c[2]]; }),
            rubansYMax: it.rubansYMax, nChevrons: e.chevrons };
          if (rendu === "mixte" && a.captures) {
            await pause(300);
            r.capture = true;
            window.ktaEstAccessible = acc;
            return r;   // captures prises par le harnais, la vue reste ouverte
          }
          await K.fermer();
        }
        r.apres2D = JSON.stringify(window.getRoads().filter(function (r) { return r.type === "itinerary"; }));
        r.avant2D = avant2D;
        window.ktaEstAccessible = acc;
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc, captures: !!CAPTURES });
      if (IV.capture) {
        await capture(page, "iti-effondrement-yeux");
        await page.evaluate(function () { window.KtaVue3D.basculerVue(); });
        await page.waitForTimeout(600);
        await capture(page, "iti-effondrement-plongee");
        await page.evaluate(function () { window.KtaVue3D.basculerVue(); return window.KtaVue3D.fermer(); });
      }
      ["mixte", "galerie", "structures"].forEach(function (k) {
        const o = IV[k];
        if (!o) return;
        const hv = o.hauteur * 0.6, pres3 = function (v, att) { return Math.abs(v - att) < 0.012; };
        // Horizontaux : sur le volume (centre entre -15,8 et -12,2) au dessus + 5 cm ; hors du volume au sol.
        const hor = o.profil.filter(function (q) { return q[3] - q[2] < 0.01; });
        const dessus = hor.filter(function (q) { return q[0] > -15.8 && q[0] < -12.2; });
        const sol = hor.filter(function (q) { return q[0] < -16.4 || q[0] > -11.6; });
        const vert = o.profil.filter(function (q) { return q[3] - q[2] > 0.3; });
        const entree = vert.filter(function (q) { return q[0] < -16 && q[0] > -16.1; });
        const sortie = vert.filter(function (q) { return q[0] > -12 && q[0] < -11.9; });
        verifier(dessus.length >= 4 && dessus.every(function (q) { return q[2] >= hv + 0.03 && q[2] <= hv + 0.06; }) &&
          sol.length >= 8 && sol.every(function (q) { return q[2] <= 0.06; }) &&
          hor.every(function (q) { return !(q[0] > -16 && q[0] < -12 && q[2] < hv); }),
          k + " : le ruban passe sur l'effondrement (dessus à " + hv.toFixed(2) + " m + 5 cm), au sol ailleurs, jamais " +
          "dessous ni en l'air", { dessus: dessus.slice(0, 4), sol: sol.slice(0, 3), n: [dessus.length, sol.length] });
        verifier(entree.length === 2 && sortie.length === 2 && vert.length === 4 && vert.every(function (q) {
          return pres3(q[2], 0.05) && pres3(q[3], hv + 0.05);
        }), k + " : une contremarche (ruban et liseré) collée à la face d'entrée et de sortie, du sol au dessus",
        { entree: entree, sortie: sortie, n: vert.length });
        const chOn = o.chevrons.filter(function (c) { return c[0] > -15.7 && c[0] < -12.3; });
        const chOff = o.chevrons.filter(function (c) { return c[0] < -16.3 || c[0] > -11.7; });
        verifier(o.nChevrons > 0 && chOn.length >= 2 && chOn.every(function (c) { return pres3(c[1], hv + 0.07); }) &&
          chOff.every(function (c) { return c[1] < 0.1; }),
          k + " : chevrons de guidage sur le dessus du volume, au sol ailleurs", { on: chOn.slice(0, 6), off: chOff.length });
        verifier(o.etapes.length === 1 && o.etapes[0][0] === -14 && pres3(o.etapes[0][1], hv),
          k + " : marqueur d'étape posé sur l'effondrement (" + JSON.stringify(o.etapes) + ")", o.etapes);
        verifier(o.rubansYMax === null || o.rubansYMax <= 0.031,
          k + " : rubans des tracés ordinaires inchangés, au sol (" + o.rubansYMax + ")", o.rubansYMax);
      });
      if (!IV.capture) {
        verifier(IV.avant2D === IV.apres2D, "tracé 2D de l'itinéraire inchangé par la 3D", { avant: IV.avant2D.length });
      }
      await page.evaluate(function () {
        window.setRoads([]); window.setZones([]); window.setPlanRenduVue3D(null, "mixte"); window.KtaGalerie.invalider();
      });

      // ── 25. Réglages ⚙️ Portée et Lampe, zoom de la vue plongeante (QCM du 03/11/2026) ─────────────────────────
      // Piliers fictifs tous les 12 m sur 260 m autour du départ : de quoi remplir des tuiles à toute portée.
      await page.evaluate(function (a) {
        const P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; }, st = [];
        for (let x = -130; x <= 130; x += 12) {
          for (let z = -130; z <= 130; z += 12) {
            st.push({ uid: "st_rg_" + x + "_" + z, type: "pilier-1", level: 0,
              points: [P(x - 1, z - 1), P(x + 1, z - 1), P(x + 1, z + 1), P(x - 1, z + 1)] });
          }
        }
        window.setStructures(st);
        window.KtaGalerie.invalider();
        ["myktamap_v3d_portee_v1", "myktamap_v3d_lampe_v1", "myktamap_v3d_lampe_intensite_v1",
          "myktamap_v3d_faisceau_v1", "myktamap_v3d_jour_v1"].forEach(function (k) { localStorage.removeItem(k); });
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      const RG = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const q = function (s) { return document.querySelector("#kta-vue3d " + s); };
        const pose = async function () {
          await pause(100);
          for (let i = 0; i < 80 && (K.etat().portee.tuiles.manquantes || K.etat().portee.tuiles.hors); i++) {
            await pause(50);
          }
        };
        const d = P(6, 6), r = {};
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        await pose();
        r.defaut = K.etat().portee;
        const c = q("#kta-v3d-portee");
        r.curseur = { dansTuile: !!c.closest("#kta-v3d-reglages"), libelle: !!q('label[for="kta-v3d-portee"]') &&
          q('label[for="kta-v3d-portee"]').textContent.length > 2, valuetext: c.getAttribute("aria-valuetext") };
        c.value = "50";
        c.dispatchEvent(new Event("input", { bubbles: true }));
        await pose();
        r.p50 = K.etat().portee;
        r.lampe50 = K.etat().eclairage.portee;
        r.pref50 = window.getVue3DPortee();
        r.p100 = { retenue: K.reglerPortee(500) };
        await pose();
        Object.assign(r.p100, K.etat().portee);
        r.p15 = { retenue: K.reglerPortee(3) };
        await pose();
        Object.assign(r.p15, K.etat().portee);
        r.repere = K.etat().reglages.repere;
        K.reglerPortee(42);
        await K.fermer();
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.rouverte = { distance: K.etat().portee.distance, curseur: Number(q("#kta-v3d-portee").value) };
        K.reglerPortee(30);
        // Lampe : intensité 100 %, faisceau 71°, Plein jour coupé par défaut ; deux curseurs et un interrupteur,
        // bornés, retenus sur l'appareil.
        const curs = function (id, v) {
          const c = q("#" + id);
          c.value = String(v);
          c.dispatchEvent(new Event("input", { bubbles: true }));
        };
        const appuiJour = function () {
          q('[data-v3d="pleinJour"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 5 }));
        };
        const pref = function () {
          return { intensite: window.getVue3DLampeIntensite(), faisceau: window.getVue3DFaisceau(),
            jour: window.getVue3DPleinJour() };
        };
        const lire = function () {
          return Object.assign({ brume: K.etat().portee.brume, lampe: K.etat().lampe, pref: pref(),
            repere: K.etat().reglages.repere }, K.etat().eclairage);
        };
        r.l100 = lire();
        curs("kta-v3d-lampe", 200);
        r.l200 = lire();
        curs("kta-v3d-lampe", 300);
        r.l300 = lire();
        r.l25 = Object.assign({ retenue: K.reglerLampe(5) }, lire());
        r.lMax = { retenue: K.reglerLampe(900), pref: window.getVue3DLampeIntensite() };
        curs("kta-v3d-lampe", 150);
        r.l150 = lire();
        curs("kta-v3d-faisceau", 160);
        r.f160 = lire();
        r.f40 = Object.assign({ retenu: K.reglerFaisceau(10) }, lire());
        r.f100 = Object.assign({ retenu: K.reglerFaisceau(100) }, lire());
        appuiJour();
        r.jour = lire();
        await K.fermer();
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.rouverteL = lire();
        appuiJour();
        r.jourCoupe = lire();
        // Ancien réglage retenu (Normale / Forte / Plein jour) : relu tant que les nouvelles clés manquent.
        await K.fermer();
        const neuves = ["myktamap_v3d_lampe_intensite_v1", "myktamap_v3d_faisceau_v1", "myktamap_v3d_jour_v1"];
        neuves.forEach(function (k) { localStorage.removeItem(k); });
        localStorage.setItem("myktamap_v3d_lampe_v1", "forte");
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.migreForte = lire();
        await K.fermer();
        localStorage.setItem("myktamap_v3d_lampe_v1", "jour");
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.migreJour = lire();
        K.reglerPleinJour(false);
        r.migreJour.apres = { pref: pref(), ancienne: localStorage.getItem("myktamap_v3d_lampe_v1") };
        localStorage.removeItem("myktamap_v3d_lampe_v1");
        K.reglerLampe(100);
        K.reglerFaisceau(71);
        r.defautRendu = lire();
        // Greffe SANS reglagesFiges : réglages gardés et permis (Plein jour compris), facteur du jeu multiplié.
        K.reglerLampe(200);
        K.reglerFaisceau(120);
        K.reglerPleinJour(true);
        let ctx = null;
        K.greffer({ nom: "essai-lampe", scene: function (c2) { ctx = c2; } });
        await pause(50);
        ctx.regler({ lampe: 0.5, plongee: false });
        r.greffeLibre = lire();
        r.greffeZoom = { avant: K.etat().portee.recul, apres: K.zoomer(0.5), vue: K.etat().vue };
        K.basculerVue();
        r.greffeZoom.vueApres = K.etat().vue;
        curs("kta-v3d-lampe", 100);
        r.greffe100 = lire();
        r.greffe100.jourCoupe = K.reglerPleinJour(false);
        r.greffe100.jourRemis = K.reglerPleinJour(true);
        // Réglages poussés retenus : greffe sans la clé, rien ne change ; avec la clé, 30 m, 100 %, faisceau par
        // défaut, Plein jour coupé, contrôles grisés ; clé à false puis retrait : rendus ; l'appareil les garde.
        await K.fermer();
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        K.reglerPortee(100);
        K.reglerLampe(250);
        K.reglerFaisceau(140);
        K.reglerPleinJour(true);
        await pause(100);
        const cliche = function () {
          const p = K.etat().portee, l = lire();
          return Object.assign(l, { distance: p.distance, far: p.far, rayon: p.rayon, grise: p.curseur.grise,
            curseur: p.curseur.valeur, app: { portee: window.getVue3DPortee(), lampe: pref() },
            tousGrises: p.curseur.grise && l.jour.grise && l.curseurs.every(function (c) { return c.grise; }),
            tousActifs: !p.curseur.grise && !l.jour.grise && l.curseurs.every(function (c) { return !c.grise; }) });
        };
        r.avant = cliche();
        let ctx2 = null;
        const retirer2 = K.greffer({ nom: "essai-lampe-2", scene: function (c2) { ctx2 = c2; } });
        await pause(50);
        ctx2.regler({ lampe: 0.3 });
        r.sansCle = cliche();
        ctx2.regler({ reglagesFiges: true });
        r.pendant = cliche();
        r.pendant.refus = [K.reglerPortee(60), K.reglerLampe(50), K.reglerFaisceau(50), K.reglerPleinJour(true)];
        curs("kta-v3d-portee", 70);
        curs("kta-v3d-lampe", 60);
        curs("kta-v3d-faisceau", 45);
        appuiJour();
        r.pendant.apresSaisie = { distance: K.etat().portee.distance, app: window.getVue3DPortee(), lampe: pref(),
          active: K.etat().eclairage.active };
        ctx2.regler({ reglagesFiges: false });
        r.cleFausse = cliche();
        ctx2.regler({ reglagesFiges: true });
        retirer2();
        await pause(50);
        r.apres = cliche();
        await K.fermer();
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        r.rouverteFin = cliche();
        K.reglerPortee(30);
        K.reglerLampe(100);
        K.reglerFaisceau(71);
        K.reglerPleinJour(false);
        await K.fermer();
        return r;
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      const RD0 = RG.defaut;
      verifier(RD0.distance === 30 && RD0.curseur && RD0.curseur.min === 15 && RD0.curseur.max === 100 &&
        RD0.curseur.valeur === 30 && RG.curseur.dansTuile && RG.curseur.libelle && /30/.test(RG.curseur.valuetext),
        "portée : curseur de 15 à 100 m dans la tuile ⚙️, 30 m par défaut, libellé et valeur dite",
        { RD0: RD0, c: RG.curseur });
      verifier(RD0.brume[1] === 30 && RD0.far === 35 && RD0.tuiles.manquantes === 0 && RD0.tuiles.hors === 0 &&
        RD0.tuiles.montrees > 0, "portée 30 m : brouillard noir à 30 m, profondeur 35 m, tuiles à portée", RD0);
      const RP5 = RG.p50;
      verifier(RP5.distance === 50 && RG.pref50 === 50 && RP5.brume[1] === 50 && RP5.far === 55 && RG.lampe50 === 50 &&
        RP5.rayon === 50 && RP5.tuiles.manquantes === 0 && RP5.tuiles.hors === 0 &&
        RP5.tuiles.montrees > RD0.tuiles.montrees && RP5.sol >= 100,
        "curseur à 50 m : retenu, brouillard, profondeur, lampe, sol et tuiles suivent",
        { p50: RP5, lampe: RG.lampe50, pref: RG.pref50 });
      verifier(RG.p100.retenue === 100 && RG.p100.distance === 100 && RG.p100.tuiles.manquantes === 0 &&
        RG.p100.tuiles.hors === 0 && RG.p100.tuiles.montrees > RP5.tuiles.montrees && RG.p15.retenue === 15 &&
        RG.p15.distance === 15 && RG.p15.tuiles.hors === 0 && RG.p15.tuiles.montrees < RD0.tuiles.montrees &&
        RG.repere, "portée bornée à 15 / 100 m, tuiles suivies dans les deux sens, repère sur ⚙️",
        { p100: RG.p100, p15: RG.p15 });
      verifier(RG.rouverte.distance === 42 && RG.rouverte.curseur === 42, "portée relue à la réouverture", RG.rouverte);
      // Lampe : chiffres de vue3d.js > _courbeLampe et _coneLampe (100 % = la lampe d'origine, 200 % = l'ancienne
      // Forte).
      const prL = function (v, att, tol) { return typeof v === "number" && Math.abs(v - att) <= (tol || 0.011); };
      const act = function (o, i, f, j) {
        return !!o.active && o.active.intensite === i && o.active.faisceau === f && o.active.jour === j;
      };
      const rad = function (deg) { return deg * Math.PI / 360; };
      const L1 = RG.l100, L2 = RG.l200, L3 = RG.l300, L0 = RG.l25, L15 = RG.l150;
      const cI = L1.curseurs[0], cF = L1.curseurs[1];
      verifier(act(L1, 100, 71, false) && prL(L1.intensite, 24) && L1.decay === 1.2 && prL(L1.portee, 30) &&
        prL(L1.halo, 1.6) && prL(L1.angle, rad(71), 0.001) && L1.penombre === 0.55 && L1.ambiance === 0.04 &&
        prL(L1.brume[0], 13.5) && L1.jour.presse === "false" &&
        cI.id === "kta-v3d-lampe" && cI.min === 25 && cI.max === 300 && cI.valeur === 100 && cI.libelle &&
        /100/.test(cI.valuetext) && cF.id === "kta-v3d-faisceau" && cF.min === 40 && cF.max === 160 &&
        cF.valeur === 71 && cF.libelle && cF.valuetext === "71°",
        "lampe : 100 % et faisceau de 71° par défaut (force 24, décroissance 1,2, portée = portée réglée, demi-angle " +
        "0,62 rad, pénombre 0,55), Plein jour coupé ; curseurs 25–300 % et 40–160°, libellés, valeur dite", L1);
      verifier(L2.pref.intensite === 200 && prL(L2.intensite, 30) && L2.decay === 0.5 && prL(L2.portee, 39) &&
        prL(L2.halo, 2.4) && prL(L2.brume[0], 24) && prL(L3.intensite, 36) && L3.decay === 0.3 && prL(L3.portee, 48) &&
        prL(L3.halo, 3.2) && prL(L3.brume[0], 25.5) && L3.curseurs[0].valeur === 300 &&
        L15.decay > L2.decay && L15.decay < L1.decay && L15.portee > L1.portee && L15.portee < L2.portee,
        "intensité : plus haut = plus loin (200 % = l'ancienne Forte : ×1,25, décroissance 0,5, coupure ×1,3, halo " +
        "×1,5, brouillard à 80 % ; 300 % : ×1,5, 0,3, ×1,6, ×2, 85 %), retenue", { L2: L2, L3: L3, L15: L15 });
      verifier(RG.l25.retenue === 25 && prL(L0.intensite, 6) && prL(L0.portee, 15) && L0.decay === 1.6 &&
        prL(L0.halo, 0.4) && prL(L0.brume[0], 7.5) && L0.curseurs[0].valeur === 25 && RG.lMax.retenue === 300 &&
        RG.lMax.pref === 300, "intensité bornée à 25 / 300 % (25 % : ×0,25, portée moitié, décroissance 1,6)",
        { L0: L0, max: RG.lMax });
      const F6 = RG.f160, F4 = RG.f40, FC = RG.f100;
      verifier(F6.pref.faisceau === 160 && prL(F6.angle, rad(160), 0.001) && F6.angle <= Math.PI / 2 &&
        F6.penombre === 1 && F6.curseurs[1].texte === "160°" && F4.retenu === 40 && prL(F4.angle, rad(40), 0.001) &&
        F4.penombre === 0.4 && FC.retenu === 100 && prL(FC.angle, rad(100), 0.001) && FC.penombre === 0.697 &&
        FC.pref.faisceau === 100,
        "faisceau borné à 40 / 160° (demi-angle ≤ π/2), pénombre qui suit (0,4 à 40°, 0,55 à 71°, 0,7 à 100°, 1 à " +
        "160° : le bord se fond dans le noir), retenu", { F6: F6, F4: F4, FC: FC });
      const RJ = RG.jour, RJO = RG.rouverteL, RJC = RG.jourCoupe;
      verifier(act(RJ, 150, 100, true) && RJ.pref.jour && RJ.ambiance === 0.9 && RJ.jour.presse === "true" &&
        prL(RJ.brume[0], 19.5) && prL(RJ.intensite, 27) && RJ.lampe === 1 && RJ.repere &&
        act(RJO, 150, 100, true) && RJO.curseurs[0].valeur === 150 && RJO.curseurs[1].valeur === 100 &&
        RJO.ambiance === 0.9 && act(RJC, 150, 100, false) && RJC.ambiance === 0.04 && !RJC.pref.jour &&
        RJC.jour.presse === "false",
        "☀️ Plein jour : interrupteur à part (ambiance 0,9, brouillard à 65 % au moins, lampe inchangée), les trois " +
        "réglages relus à la réouverture, coupé de nouveau", { J: RJ, O: RJO, C: RJC });
      const MF = RG.migreForte, MJ = RG.migreJour;
      verifier(act(MF, 200, 71, false) && MF.pref.intensite === 200 && prL(MF.intensite, 30) && MF.decay === 0.5 &&
        act(MJ, 100, 71, true) && MJ.ambiance === 0.9 && MJ.apres.pref.jour === false &&
        MJ.apres.ancienne === "jour" && act(RG.defautRendu, 100, 71, false),
        "ancien réglage retenu : « forte » = 200 %, « jour » = Plein jour (ancienne clé jamais réécrite)",
        { MF: MF, MJ: MJ });
      const GL = RG.greffeLibre, G1 = RG.greffe100;
      const actifs = function (o) { return !o.jour.grise && o.curseurs.every(function (c) { return !c.grise; }); };
      verifier(act(GL, 200, 120, true) && GL.lampe === 0.5 && prL(GL.intensite, 15) && prL(GL.portee, 19.5) &&
        prL(GL.angle, rad(120), 0.001) && GL.ambiance === 0.9 && actifs(GL) && act(G1, 100, 120, true) &&
        prL(G1.intensite, 12) && prL(G1.portee, 15) && G1.lampe === 0.5 && G1.jourCoupe === false &&
        G1.jourRemis === true,
        "greffe sans reglagesFiges : 200 %, 120° et Plein jour gardés et permis, facteur du jeu multiplié (×0,5 : " +
        "force et portée), curseur suivi pendant la greffe", { GL: GL, G1: G1 });
      verifier(RG.greffeZoom.apres === RG.greffeZoom.avant && RG.greffeZoom.vueApres === "yeux",
        "greffe qui interdit la plongée : zoom refusé, pas de vue plongeante", RG.greffeZoom);
      const RGA = RG.avant, RGP = RG.pendant, RGR = RG.apres, RGO = RG.rouverteFin;
      const pousses = function (o) {
        return o.app.portee === 100 && o.app.lampe.intensite === 250 && o.app.lampe.faisceau === 140 &&
          o.app.lampe.jour === true;
      };
      verifier(RGA.distance === 100 && act(RGA, 250, 140, true) && pousses(RGA) && RGA.tousActifs &&
        RGA.brume[1] === 100 && prL(RGA.intensite, 33) && prL(RGA.portee, 145) && RGA.ambiance === 0.9,
        "avant la greffe : portée 100 m, lampe 250 %, faisceau 140°, Plein jour, retenus, contrôles actifs", RGA);
      const RGS = RG.sansCle, RGF = RG.cleFausse;
      verifier(RGS.distance === 100 && act(RGS, 250, 140, true) && RGS.tousActifs && RGS.lampe === 0.3 &&
        prL(RGS.intensite, 9.9) && prL(RGS.portee, 43.5),
        "greffe sans la clé : réglages gardés, contrôles actifs, facteur du jeu multiplié", RGS);
      verifier(RGF.distance === 100 && act(RGF, 250, 140, true) && RGF.tousActifs,
        "reglagesFiges à false, greffe posée : réglages rendus, contrôles actifs", RGF);
      verifier(RGP.distance === 30 && RGP.brume[1] === 30 && RGP.far === 35 && RGP.rayon === 30 && RGP.curseur === 30 &&
        act(RGP, 100, 71, false) && RGP.tousGrises && RGP.jour.presse === "false" &&
        RGP.curseurs[0].valeur === 100 && RGP.curseurs[1].valeur === 71 && RGP.ambiance === 0.04 &&
        prL(RGP.portee, 9) && prL(RGP.intensite, 7.2) && prL(RGP.angle, rad(71), 0.001) && RGP.penombre === 0.55 &&
        RGP.lampe === 0.3 && RGP.voulue.intensite === 250 && RGP.voulue.faisceau === 140 && RGP.voulue.jour === true &&
        RGP.porteeVoulue === 100 && pousses(RGP) && RGP.refus.every(function (v) { return v === false; }) &&
        RGP.apresSaisie.distance === 30 && RGP.apresSaisie.app === 100 &&
        RGP.apresSaisie.lampe.intensite === 250 && RGP.apresSaisie.lampe.faisceau === 140 &&
        RGP.apresSaisie.lampe.jour === true && RGP.apresSaisie.active.intensite === 100,
        "reglagesFiges : 30 m, 100 %, 71°, Plein jour coupé, lampe du jeu sur 30 m (×0,3), trois curseurs et ☀️ " +
        "grisés, saisies refusées, appareil intact", RGP);
      verifier(RGR.distance === 100 && RGR.brume[1] === 100 && act(RGR, 250, 140, true) && RGR.lampe === 1 &&
        prL(RGR.portee, 145) && RGR.tousActifs && pousses(RGR) && RGR.ambiance === 0.9,
        "retrait de la greffe : 100 m, 250 %, 140° et Plein jour rendus, contrôles actifs", RGR);
      verifier(RGO.distance === 100 && act(RGO, 250, 140, true),
        "l'appareil garde 100 m, 250 %, 140° et Plein jour (réouverture)", RGO);

      // Zoom de la vue plongeante : molette, Maj + molette, boutons, clavier, pincement ; borné ; tuiles suivent.
      await page.evaluate(async function (a) {
        const P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; }, d = P(6, 6);
        await window.KtaVue3D.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "pave" });
        window.KtaVue3D.basculerVue();
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      await page.waitForTimeout(200);
      const z0 = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      const cvZ = await page.locator("#kta-vue3d canvas").boundingBox();
      await page.mouse.move(cvZ.x + cvZ.width / 2, cvZ.y + cvZ.height / 3);
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(100);
      const zLoin = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(100);
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(100);
      const zPres = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      await page.keyboard.down("Shift");
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(100);
      await page.keyboard.up("Shift");
      const zMaj = await page.evaluate(function () { return window.KtaVue3D.etat(); });
      verifier(z0.vue === "plongee" && z0.portee.recul === 18.4 && z0.portee.zoomVisible &&
        Math.abs(zLoin.portee.recul - 18.4 * 1.15) < 0.01 && Math.abs(zPres.portee.recul - 18.4 / 1.15) < 0.01 &&
        zLoin.inclinaison === z0.inclinaison && zMaj.inclinaison === z0.inclinaison + 5 &&
        zMaj.portee.recul === zPres.portee.recul,
        "molette = zoom (vers soi = plus loin), Maj + molette = inclinaison seule ; recul 18,4 m par défaut",
        { r0: z0.portee.recul, loin: zLoin.portee.recul, pres: zPres.portee.recul,
          i: [z0.inclinaison, zLoin.inclinaison, zMaj.inclinaison] });
      const zB = await page.evaluate(async function () {
        const K = window.KtaVue3D, q = function (s) { return document.querySelector("#kta-vue3d " + s); };
        const pause = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
        const pose = async function () {
          await pause(100);
          for (let i = 0; i < 120 && (K.etat().portee.tuiles.manquantes || K.etat().portee.tuiles.hors); i++) {
            await pause(50);
          }
        };
        const r = {}, appui = function (k) {
          q('[data-v3d="' + k + '"]').dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 6 }));
        };
        K.zoomer(18.4 / K.etat().portee.recul);
        const r0 = K.etat().portee.recul;
        appui("zoomPlus");
        r.plus = K.etat().portee.recul / r0;
        appui("zoomMoins");
        r.moins = K.etat().portee.recul / r0;
        r.min = K.zoomer(0.001);
        r.minGrise = K.etat().portee.zoomPlusGrise;
        r.max = K.zoomer(1000);
        await pose();
        r.loin = K.etat().portee;
        K.basculerVue();
        r.yeux = K.etat().portee;
        K.basculerVue();
        r.retenu = K.etat().portee.recul;
        K.zoomer(18.4 / 60);
        await pose();
        r.defaut = K.etat().portee;
        return r;
      });
      const RZL = zB.loin;
      verifier(Math.abs(zB.plus - 1 / 1.3225) < 0.01 && Math.abs(zB.moins - 1) < 0.01 && zB.min === 6 && zB.minGrise &&
        zB.max === 60 && RZL.zoomMoinsGrise && zB.retenu === 60,
        "boutons + / − (deux crans), recul borné à 6 / 60 m (bouton grisé à la borne), retenu d'une vue à l'autre", zB);
      verifier(RZL.rayon === 138 && RZL.tuiles.manquantes === 0 && RZL.tuiles.hors === 0 &&
        RZL.tuiles.montrees > zB.defaut.tuiles.montrees && RZL.sol >= 2 * RZL.rayon &&
        RZL.brume[1] === +(60 + 138 + 2).toFixed(2) && zB.yeux.rayon === 30 && zB.defaut.rayon === 42.32 &&
        Math.abs(zB.defaut.brume[1] - (18.4 + 42.32 + 2)) < 0.02,
        "dézoomé à 60 m : tuiles jusqu'à 138 m (2,3 m par mètre de recul), sol et brouillard suivent ; 42,3 m au défaut",
        { loin: RZL, defaut: zB.defaut, yeux: zB.yeux.rayon });
      // Clavier : = rapproche, - éloigne (vue plongeante seulement).
      await page.keyboard.press("Equal");
      const kPlus = await page.evaluate(function () { return window.KtaVue3D.etat().portee.recul; });
      await page.keyboard.press("Minus");
      const kMoins = await page.evaluate(function () { return window.KtaVue3D.etat().portee.recul; });
      verifier(Math.abs(kPlus - 18.4 / 1.15) < 0.01 && Math.abs(kMoins - 18.4) < 0.01,
        "clavier : = rapproche, - éloigne", { plus: kPlus, moins: kMoins });
      // Pincement (deux pointeurs tactiles qui s'écartent) : plus près, sans pencher ; deux doigts glissés ensemble :
      // penche sans zoomer.
      const zP = await page.evaluate(function () {
        const K = window.KtaVue3D, cv = document.querySelector("#kta-vue3d canvas"), r = cv.getBoundingClientRect();
        const ev = function (type, id, x, y) {
          cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 21,
            clientX: x, clientY: y, bubbles: true }));
        };
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, e0 = K.etat(), out = {};
        ev("pointerdown", 21, cx - 40, cy); ev("pointerdown", 22, cx + 40, cy);
        for (let k = 1; k <= 10; k++) {
          ev("pointermove", 21, cx - 40 - k * 4, cy); ev("pointermove", 22, cx + 40 + k * 4, cy);
        }
        ev("pointerup", 21, cx - 80, cy); ev("pointerup", 22, cx + 80, cy);
        const e1 = K.etat();
        out.pince = { avant: e0.portee.recul, apres: e1.portee.recul, incl: [e0.inclinaison, e1.inclinaison],
          cap: [e0.cap, e1.cap] };
        ev("pointerdown", 23, cx - 40, cy - 60); ev("pointerdown", 24, cx + 40, cy - 60);
        for (let k = 1; k <= 10; k++) {
          ev("pointermove", 23, cx - 40, cy - 60 + k * 8); ev("pointermove", 24, cx + 40, cy - 60 + k * 8);
        }
        ev("pointerup", 23, cx - 40, cy + 20); ev("pointerup", 24, cx + 40, cy + 20);
        const e2 = K.etat();
        out.glisse = { recul: [e1.portee.recul, e2.portee.recul], incl: [e1.inclinaison, e2.inclinaison] };
        return out;
      });
      verifier(Math.abs(zP.pince.apres - zP.pince.avant / 2) < 0.1 && zP.pince.incl[0] === zP.pince.incl[1] &&
        Math.abs(zP.pince.cap[0] - zP.pince.cap[1]) < 0.01 && zP.glisse.recul[0] === zP.glisse.recul[1] &&
        zP.glisse.incl[1] > zP.glisse.incl[0],
        "pincer = zoom (écart doublé : recul moitié), sans pencher ni tourner ; deux doigts glissés = inclinaison seule",
        zP);
      const zF = await page.evaluate(async function (a) {
        const K = window.KtaVue3D, P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; };
        const d = P(6, 6);
        await K.fermer();
        await K.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
        const recul = K.etat().portee.recul;
        await K.fermer();
        window.setStructures([]); window.KtaGalerie.invalider();
        return { recul: recul };
      }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
      verifier(zF.recul === 18.4, "zoom retenu tant que la vue est ouverte : 18,4 m à la réouverture", zF);
      if (CAPTURES) {
        // Lampe à 25 / 100 / 300 %, faisceau de 40 / 160°, Plein jour, à 60 m de portée ; tuile ouverte au téléphone,
        // plongée dézoomée.
        const vp = page.viewportSize();
        await page.evaluate(async function (a) {
          const P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; }, st = [];
          for (let x = -130; x <= 130; x += 12) {
            for (let z = -130; z <= 130; z += 12) {
              st.push({ uid: "st_rc_" + x + "_" + z, type: "pilier-1", level: 0,
                points: [P(x - 1, z - 1), P(x + 1, z - 1), P(x + 1, z + 1), P(x - 1, z + 1)] });
            }
          }
          window.setStructures(st);
          window.KtaGalerie.invalider();
          const d = P(0, 6);
          await window.KtaVue3D.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 } });
          window.KtaVue3D.reglerPortee(60);
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        for (const m of [[25, 71, false], [100, 71, false], [300, 71, false], [100, 40, false], [100, 160, false],
          [100, 71, true]]) {
          await page.evaluate(function (x) {
            const K = window.KtaVue3D;
            K.reglerLampe(x[0]); K.reglerFaisceau(x[1]); K.reglerPleinJour(x[2]);
          }, m);
          await page.waitForTimeout(1500);
          await capture(page, "reglage-lampe-" + m[0] + "-" + m[1] + (m[2] ? "-jour" : ""));
        }
        await page.evaluate(function () {
          window.KtaVue3D.reglerLampe(100); window.KtaVue3D.reglerFaisceau(71); window.KtaVue3D.reglerPleinJour(false);
          window.KtaVue3D.basculerVue();
          window.KtaVue3D.zoomer(1000);
        });
        await page.waitForTimeout(2500);
        await capture(page, "reglage-plongee-recul-60");
        await page.evaluate(function () { window.KtaVue3D.zoomer(0.001); });
        await page.waitForTimeout(800);
        await capture(page, "reglage-plongee-recul-6");
        await page.evaluate(function () { return window.KtaVue3D.fermer(); });
        await page.setViewportSize({ width: 393, height: 852 });
        await page.evaluate(async function (a) {
          const P = function (x, z) { return { x: (a.ox + x) * a.sc, y: (a.oz + z) * a.sc }; }, d = P(0, 6);
          await window.KtaVue3D.ouvrir({ depart: { x: d.x, y: d.y, cap: 90 }, commandes: "joystick" });
          window.KtaVue3D.basculerVue();
          document.querySelector('#kta-vue3d [data-v3d="reglages"]').click();
        }, { ox: MX.ox, oz: MX.oz, sc: MX.sc });
        await page.waitForTimeout(800);
        await capture(page, "reglage-tuile-telephone");
        await page.evaluate(function () {
          window.KtaVue3D.reglerPortee(30);
          window.setStructures([]); window.KtaGalerie.invalider();
          return window.KtaVue3D.fermer();
        });
        await page.setViewportSize(vp);
      }

      await sectionDonnees(page, MX);

      await page.evaluate(function () {
        const s = window.__v3dEmb;
        window.getAllEmbeddedRoads = s.r; window.getAllEmbeddedZones = s.z; window.getAllEmbeddedPoints = s.p;
        window.getAllEmbeddedStructures = s.s; window._currentLoadedPlanId = s.id;
        window.setRoads([]); window.setZones([]); window.setEditorPoints(window.__v3dPoints || []);
        window.KtaGalerie.invalider();
      });

      await sectionFichesObjets(page);
      await sectionDessin(page);
    }
    // 🩸 WebKit ne rend la place d'un contexte perdu qu'au passage du ramasse-miettes : après ~16 ouvertures
    // rapprochées il annonce « too many active WebGL contexts » et perd le plus ancien (déjà fermé). Toléré sous
    // WebKit seulement, et seulement ce message : la 21e ouverture ci-dessus prouve que la vue courante vit.
    const webkit = nav.browserType().name() === "webkit";
    const vraies = consoleErr.filter(function (t) {
      return !(webkit && /too many active WebGL contexts|loseContext: context already lost/i.test(t));
    });
    if (vraies.length !== consoleErr.length) {
      console.log("  ℹ️ WebKit : " + (consoleErr.length - vraies.length) +
        " avis de contexte en trop (ramasse-miettes différé), tolérés");
    }
    verifier(vraies.length === 0, "console : aucune erreur WebGL ni contexte en trop", vraies.slice(0, 4));
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
  console.log("🎉 CHECKUP VERT — vue 3D : chargée à la demande, scène, déplacement, butée, vues, fermeture propre.");
  process.exit(0);
})();
