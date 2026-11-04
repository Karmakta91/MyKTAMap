#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-ajuster-sommets.js — checkup (Playwright) : ajuster une forme dessinée par appui long (js/ajusterSommets.js)
// =====================================================================
// Objets FICTIFS posés au centre de la vue du relevé fictif (sinon le premier plan de l'index) : un tracé, un tracé
// cible d'aimantation, deux zones, un pilier, un mur en ligne, les deux mesures. Joué sous chaque moteur
// (KTA_MOTEURS, Chromium et WebKit par défaut), à la souris puis au doigt.
// Vérifie : déplacer / ajouter / supprimer un sommet sur les 4 familles, refus sous le minimum (toast), un geste =
// une entrée d'historique annulable, uid gardé et updatedAt changé, un seul rendu au lâcher (aucun pendant), carte
// immobile pendant le glisser, aucune fiche après un appui long et une fiche au tap court, outil armé = rien,
// lecture seule = rien, calque verrouillé = rien et sa copie « 🔄 Modifier » = oui, aimantation d'un tracé, mur de
// 0,4 m posé coin par coin fermé au 4e coin seulement, et un déplacement sous rotation (plan orienté).
// 🩸 Le doigt : Chromium passe par CDP (Input.dispatchTouchEvent : vrais touch + pointer + clic du navigateur) ;
// WebKit n'a pas de CDP, il reçoit des PointerEvent `touch` synthétiques (la logique du module, pas le pipeline
// tactile du moteur).
// Usage : node scripts/smoke/checkup-ajuster-sommets.js (SMOKE_PORT pour une autre copie ; KTA_MODES=souris ou doigt
// pour un seul pointeur ; KTA_DEBUG=1 dit ce que vise chaque appui) · code :
// js/ajusterSommets.js · doc : docs/architecture/ui.md § Ajuster une forme
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
      !!window.HistoryManager && !!window.CalqueSession;
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
    cfg.snapDraw = true;
  });
  // La vue retrouvée à la réouverture se pose après le chargement : on attend qu'elle soit posée avant de fixer la
  // nôtre, sinon les objets semés glissent sous la barre d'état.
  await page.waitForTimeout(2500);
  await page.evaluate(function () {
    window.map.setView(window.map.getCenter(), window.map.getMaxZoom() - 1, { animate: false });
  });
  await page.waitForTimeout(800);
}

// Objets en px d'écran (×0,8) autour du centre de la FENÊTRE (le conteneur de la carte la déborde, la barre d'état
// en couvre le bas), vue droite, convertis en plan ; outils exposés dans window.__as.
function semer(page) {
  return page.evaluate(function () {
    const m = window.map, H = window.APP_CONFIG.imageHeight;
    const cr0 = m.getContainer().getBoundingClientRect();
    const c = m.containerPointToLatLng([innerWidth / 2 - cr0.left, innerHeight / 2 - 40 - cr0.top]);
    const k = 1 / m.options.crs.scale(m.getZoom());
    const bx = c.lng, by = H - c.lat;
    const P = function (u, v) { return { x: bx + 0.8 * u * k, y: by + 0.8 * v * k }; };
    window.__as = {
      k: k,
      P: P,
      ecran: function (x, y) {
        const p = m.latLngToContainerPoint(window.convertCoord(x, y));
        const cr = m.getContainer().getBoundingClientRect();
        const a = (window.MapBearing ? window.MapBearing.getBearing() : 0) * Math.PI / 180;
        const cx = cr.width / 2, cy = cr.height / 2, dx = p.x - cx, dy = p.y - cy;
        return [cr.left + cx + dx * Math.cos(a) - dy * Math.sin(a), cr.top + cy + dx * Math.sin(a) + dy * Math.cos(a)];
      },
      vue: [m.getCenter(), m.getZoom()],
      signaux: 0,
      annulables: 0
    };
    window.addEventListener("kta:donneesPlanChange", function () { window.__as.signaux++; });
    window.HistoryManager.onChange(function (s) { window.__as.annulables = s.undoSize; });
    window.setRoads([
      { uid: "rd_as_r1", type: "principal", level: 0, points: [P(-450, -300), P(-300, -300), P(-150, -300)] },
      { uid: "rd_as_r2", type: "chemin", level: 0, points: [P(-300, -170), P(-150, -170)] }
    ]);
    window.setZones([
      { uid: "zn_as_z", type: "eau", level: 0, points: [P(0, -350), P(150, -350), P(150, -200), P(0, -200)] },
      { uid: "zn_as_t", type: "remblais", level: 0, points: [P(250, -350), P(400, -350), P(325, -220)] }
    ]);
    window.setStructures([
      { uid: "st_as_p", type: "pilier-1", level: 0, points: [P(-450, 0), P(-300, 0), P(-300, 150), P(-450, 150)] },
      { uid: "st_as_l", type: "mur-ligne", level: 0, points: [P(-150, 0), P(0, 0)] }
    ]);
    window.setMeasurePoints([P(100, 0), P(250, 0), P(400, 0)]);
    window.setMeasurePointsSurface([P(100, 150), P(250, 150), P(250, 300)]);
    window.renderRoads();
    window.HistoryManager.reset();
    return { k: k, zoom: m.getZoom(), echelle: window.APP_CONFIG.scale, base: window.__as.ecran(bx, by).map(Math.round) };
  });
}

// Objet d'une famille par uid (ou mesure : "distance" / "surface").
function lireObjet(page, ref) {
  return page.evaluate(function (ref) {
    if (ref === "distance") return { points: window.getMeasurePoints().slice() };
    if (ref === "surface") return { points: window.getMeasurePointsSurface().slice() };
    const tous = window.getRoads().concat(window.getZones(), window.getStructures());
    const o = tous.find(function (x) { return x.uid === ref; });
    return o ? JSON.parse(JSON.stringify(o)) : null;
  }, ref);
}

function etat(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    return { signaux: window.__as.signaux, annulables: window.__as.annulables, centre: [c.lat, c.lng],
      fiche: !!document.querySelector(".leaflet-popup"), apercu: !!document.querySelector(".kta-ajuster-apercu"),
      menu: !!document.querySelector(".kta-ajuster-suppr"), as: window.KtaAjusterSommets.etat() };
  });
}

// ── Pointeurs : souris (Playwright), doigt (CDP sous Chromium, PointerEvent synthétiques sous WebKit) ──
function Pointeur(page, mode, moteur) {
  let cdp = null;
  const synth = function (type, x, y) {
    return page.evaluate(function (a) {
      const el = document.elementFromPoint(a.x, a.y) || document.body;
      const o = { bubbles: true, cancelable: true, composed: true, clientX: a.x, clientY: a.y, pointerId: 41,
        pointerType: "touch", isPrimary: true, button: 0, buttons: a.type === "pointerup" ? 0 : 1 };
      el.dispatchEvent(new PointerEvent(a.type, o));
      if (a.type === "pointerup" && a.clic) el.dispatchEvent(new MouseEvent("click", o));
    }, { type: type, x: x, y: y, clic: arguments[3] === true });
  };
  return {
    async init() {
      if (mode === "doigt" && moteur === "chromium") cdp = await page.context().newCDPSession(page);
    },
    async down(p) {
      if (mode === "souris") { await page.mouse.move(p[0], p[1]); await page.mouse.down(); return; }
      if (cdp) { await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p[0], y: p[1] }] }); return; }
      await synth("pointerdown", p[0], p[1]);
    },
    async move(p) {
      if (mode === "souris") { await page.mouse.move(p[0], p[1]); return; }
      if (cdp) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p[0], y: p[1] }] }); return; }
      await synth("pointermove", p[0], p[1]);
    },
    async up(p, clic) {
      if (mode === "souris") { await page.mouse.up(); return; }
      if (cdp) { await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); return; }
      await synth("pointerup", p[0], p[1], clic === true);
    },
    async tap(p) {
      if (mode === "souris") { await page.mouse.click(p[0], p[1]); return; }
      if (cdp) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p[0], y: p[1] }] });
        await page.waitForTimeout(60);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        return;
      }
      await synth("pointerdown", p[0], p[1]);
      await page.waitForTimeout(60);
      await synth("pointerup", p[0], p[1], true);
    }
  };
}

// Les toasts (⏪, refus) recouvrent la carte : vidés avant chaque geste, le harnais ne vise que la carte.
function viderToasts(page) {
  return page.evaluate(function () { const t = document.getElementById("kta-toasts"); if (t) t.innerHTML = ""; });
}
function toastVu(page, motif) {
  return page.evaluate(function (m) {
    const t = document.getElementById("kta-toasts");
    return !!t && t.textContent.indexOf(m) >= 0;
  }, motif);
}

function ecran(page, pt) { return page.evaluate(function (p) { return window.__as.ecran(p.x, p.y); }, pt); }
function planU(page, u, v) { return page.evaluate(function (a) { return window.__as.P(a[0], a[1]); }, [u, v]); }

// Appui long sur `de` (plan), glissé vers `vers` (plan, ou null : sans bouger), lâcher. Rend l'état au milieu du
// glisser et après.
async function geste(page, ptr, de, vers) {
  await viderToasts(page);
  const a = await ecran(page, de);
  const sous = await page.evaluate(function (p) {
    const el = document.elementFromPoint(p[0], p[1]);
    return el && !window.map.getContainer().contains(el) ? (el.id || el.className || el.tagName) : null;
  }, a);
  if (sous) inf("point de départ hors carte : " + String(sous));
  if (process.env.KTA_DEBUG) inf("vise " + JSON.stringify(await page.evaluate(function (p) { return window.KtaAjusterSommets.viser(p[0], p[1]); }, a)) + " à " + a.map(Math.round));
  const b = vers ? await ecran(page, vers) : a;
  await ptr.down(a);
  await page.waitForTimeout(650);
  let pendant = null;
  if (vers) {
    for (let i = 1; i <= 8; i++) {
      await ptr.move([a[0] + (b[0] - a[0]) * i / 8, a[1] + (b[1] - a[1]) * i / 8]);
      await page.waitForTimeout(25);
      if (i === 4) pendant = await etat(page);
    }
  } else {
    pendant = await etat(page);
  }
  await ptr.up(b);
  await page.waitForTimeout(400);
  return { pendant: pendant, apres: await etat(page) };
}

function proche(p, q, tol) { return !!p && !!q && Math.hypot(p.x - q.x, p.y - q.y) <= tol; }
function memeCentre(a, b) { return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6; }

async function supprimerParMenu(page, ptr) {
  const r = await page.evaluate(function () {
    const b = document.querySelector(".kta-ajuster-suppr");
    if (!b) return null;
    const q = b.getBoundingClientRect();
    return [q.left + q.width / 2, q.top + q.height / 2];
  });
  if (!r) return false;
  await ptr.tap(r);
  await page.waitForTimeout(400);
  return true;
}

// Déplacer, ajouter au milieu, supprimer : un objet, une famille.
async function famille(page, ptr, nom, ref, iSommet, iMilieu, tolPlan) {
  const k = await page.evaluate(function () { return window.__as.k; });
  const o0 = await lireObjet(page, ref);
  const e0 = await etat(page);
  // Déplacer
  const de = o0.points[iSommet];
  const vers = { x: de.x + 40 * k, y: de.y + 30 * k };
  const g1 = await geste(page, ptr, de, vers);
  const o1 = await lireObjet(page, ref);
  verifier(proche(o1.points[iSommet], vers, tolPlan) && o1.points.length === o0.points.length,
    nom + " : sommet déplacé là où le pointeur l'a lâché", { avant: de, apres: o1.points[iSommet], voulu: vers });
  verifier(g1.pendant && g1.pendant.apercu && g1.pendant.as.arme, nom + " : aperçu dessiné pendant le glisser");
  verifier(memeCentre(g1.pendant.centre, e0.centre) && memeCentre(g1.apres.centre, e0.centre),
    nom + " : la carte ne bouge pas pendant le glisser");
  verifier(!g1.apres.fiche && !g1.apres.menu && !g1.apres.apercu, nom + " : ni fiche, ni menu, ni aperçu au lâcher",
    g1.apres);
  if (ref !== "distance" && ref !== "surface") {
    verifier(g1.pendant.signaux === e0.signaux && g1.apres.signaux === e0.signaux + 1,
      nom + " : aucun rendu pendant le glisser, un seul au lâcher (kta:donneesPlanChange)",
      { avant: e0.signaux, pendant: g1.pendant.signaux, apres: g1.apres.signaux });
    verifier(g1.apres.annulables === e0.annulables + 1, nom + " : un geste = une entrée d'historique",
      { avant: e0.annulables, apres: g1.apres.annulables });
    verifier(o1.uid === o0.uid && o1.updatedAt !== o0.updatedAt, nom + " : uid gardé, updatedAt changé",
      { uid: o1.uid, avant: o0.updatedAt, apres: o1.updatedAt });
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(200);
    const ou = await lireObjet(page, ref);
    verifier(proche(ou.points[iSommet], de, 1e-6), nom + " : ⏪ remet le sommet en place en une fois");
    await page.evaluate(function () { window.HistoryManager.redo(); });
    await page.waitForTimeout(200);
  }
  // Ajouter au milieu du segment iMilieu → iMilieu + 1, puis glisser
  const oA = await lireObjet(page, ref);
  const n = oA.points.length, p = oA.points[iMilieu], q = oA.points[(iMilieu + 1) % n];
  const mil = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const versM = { x: mil.x + 20 * k, y: mil.y + 35 * k };
  const g2 = await geste(page, ptr, mil, versM);
  const o2 = await lireObjet(page, ref);
  verifier(o2.points.length === n + 1 && proche(o2.points[iMilieu + 1], versM, tolPlan),
    nom + " : sommet ajouté au milieu du segment et glissé", { n: o2.points.length, pt: o2.points[iMilieu + 1] });
  verifier(!g2.apres.fiche, nom + " : pas de fiche après l'ajout");
  // Supprimer (appui long sans bouger → 🗑️)
  const g3 = await geste(page, ptr, o2.points[iMilieu + 1], null);
  verifier(g3.apres.menu, nom + " : appui long sans bouger → 🗑️ proposé, sans fiche", g3.apres);
  const e3 = await etat(page);
  verifier(await supprimerParMenu(page, ptr), nom + " : 🗑️ touché");
  const o3 = await lireObjet(page, ref);
  const e4 = await etat(page);
  verifier(o3.points.length === n && !e4.fiche && !e4.menu, nom + " : sommet supprimé, sans fiche",
    { n: o3.points.length, fiche: e4.fiche });
  if (ref !== "distance" && ref !== "surface") {
    verifier(e4.annulables === e3.annulables + 1, nom + " : la suppression = une entrée d'historique");
  }
}

async function refus(page, ptr, nom, ref) {
  const o0 = await lireObjet(page, ref);
  const r0 = await etat(page);
  const g = await geste(page, ptr, o0.points[0], null);
  const o1 = await lireObjet(page, ref);
  const motif = await page.evaluate(function () { return window.I18n.t("ajuster.toast.minimum", { n: 9 }).split("9")[0]; });
  const vu = await toastVu(page, motif);
  verifier(!g.apres.menu && vu && g.apres.as.refus === r0.as.refus + 1 && o1.points.length === o0.points.length,
    nom + " : au minimum, pas de 🗑️, un toast le dit, rien ne change", { as: g.apres.as, toast: vu });
}

async function rien(page, ptr, nom, ref) {
  const o0 = await lireObjet(page, ref);
  const de = o0.points[0];
  const k = await page.evaluate(function () { return window.__as.k; });
  const e0 = await etat(page);
  const g = await geste(page, ptr, de, { x: de.x + 40 * k, y: de.y + 40 * k });
  const o1 = await lireObjet(page, ref);
  verifier(proche(o1.points[0], de, 1e-6) && g.apres.as.ecritures === e0.as.ecritures, nom, g.apres.as);
}

async function jouer(nav, moteur, mode) {
  _prefixe = "[" + moteur + " · " + mode + "] ";
  console.log("\n══ " + moteur + " · " + mode + " ══");
  const opts = { viewport: { width: 1200, height: 850 } };
  if (mode === "doigt") Object.assign(opts, { hasTouch: true });
  const page = await nav.newPage(opts);
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  const ptr = Pointeur(page, mode, moteur);
  try {
    await ouvrirPlan(page);
    await ptr.init();
    const s = await semer(page);
    inf("zoom " + s.zoom + ", " + (1 / s.k).toFixed(2) + " px d'écran par px plan, échelle " + s.echelle + " px/m, base à l'écran " + s.base);
    await page.waitForTimeout(800);
    const base2 = await page.evaluate(function () { const p = window.__as.P(0, 0); return window.__as.ecran(p.x, p.y).map(Math.round); });
    verifier(Math.hypot(base2[0] - s.base[0], base2[1] - s.base[1]) < 2, "la vue reste où le harnais l'a posée", { avant: s.base, apres: base2 });
    const tol = 2.5 * s.k;   // 2,5 px d'écran

    // ── Tap court : la fiche s'ouvre toujours ──
    await ptr.tap(await ecran(page, await planU(page, 75, -275)));
    await page.waitForTimeout(500);
    let e = await etat(page);
    verifier(e.fiche && e.as.ecritures === 0, "tap court sur une zone : sa fiche s'ouvre, rien n'est modifié", e.as);
    await page.evaluate(function () { window.map.closePopup(); });
    await ptr.tap(await ecran(page, (await lireObjet(page, "rd_as_r1")).points[1]));
    await page.waitForTimeout(500);
    e = await etat(page);
    verifier(e.fiche, "tap court sur un sommet de tracé : la fiche du tracé s'ouvre");
    await page.evaluate(function () { window.map.closePopup(); });

    // ── Les 4 familles ──
    // Une fiche ouverte recentre la carte (autoPan) : la vue du harnais est remise.
    await page.evaluate(function () { window.map.setView(window.__as.vue[0], window.__as.vue[1], { animate: false }); });
    await page.waitForTimeout(300);
    await famille(page, ptr, "tracé", "rd_as_r1", 1, 0, tol);
    await famille(page, ptr, "zone", "zn_as_z", 2, 3, tol);          // segment de fermeture (3 → 0)
    await famille(page, ptr, "pilier", "st_as_p", 0, 1, tol);
    await famille(page, ptr, "mur (ligne)", "st_as_l", 1, 0, tol);
    await famille(page, ptr, "mesure distance", "distance", 2, 0, tol);
    await famille(page, ptr, "mesure surface", "surface", 1, 2, tol);
    await refus(page, ptr, "tracé de 2 points", "rd_as_r2");
    await refus(page, ptr, "zone de 3 sommets", "zn_as_t");

    // ── Aimantation d'un tracé ──
    const cible = (await lireObjet(page, "rd_as_r2")).points[0];
    const r1 = await lireObjet(page, "rd_as_r1");
    await geste(page, ptr, r1.points[1], { x: cible.x + 6 * s.k, y: cible.y + 5 * s.k });
    const r1b = await lireObjet(page, "rd_as_r1");
    verifier(proche(r1b.points[1], cible, 1e-9), "tracé lâché à 8 px d'un sommet d'un autre tracé : aimanté dessus",
      { pt: r1b.points[1], cible: cible });
    const graphe = await page.evaluate(function () {
      if (!window.RoadGraph || typeof window.RoadGraph.getGraph !== "function") return null;
      const g = window.RoadGraph.getGraph();
      return g ? (g.nodes ? (g.nodes.size || g.nodes.length || Object.keys(g.nodes).length) : true) : null;
    });
    verifier(graphe !== null, "RoadGraph se reconstruit après l'ajustement", graphe);

    // ── Outil armé : rien ──
    await page.evaluate(function () { window.toggleZoneMode("eau"); });
    await rien(page, ptr, "outil de dessin armé : aucun ajustement", "rd_as_r1");
    await page.evaluate(function () {
      window.toggleZoneMode("eau");
      const z = window.getZones();
      window.setZones(z.filter(function (o) { return /^zn_as_/.test(o.uid); }));
    });

    // ── Lecture seule : rien ──
    await page.evaluate(function () { window.__asRO = window.ktaEditionRefusee; window.ktaEditionRefusee = function () { return true; }; });
    await rien(page, ptr, "lecture seule d'une extension : aucun ajustement", "rd_as_r1");
    await page.evaluate(function () { window.ktaEditionRefusee = window.__asRO; });

    // ── Calque : verrouillé = rien ; copie en « 🔄 Modifier » = oui ──
    const calque = await page.evaluate(function () {
      const P = window.__as.P;
      const json = { data: [], zones: [], structures: [],
        roads: [{ uid: "rd_as_calque", type: "principal", level: 0, points: [P(150, 250), P(350, 250), P(450, 330)] }] };
      const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
      window.PLAN_CONFIG.dataLayers = (window.PLAN_CONFIG.dataLayers || []).concat([
        { id: "kta_as_calque", label: "Calque du checkup", file: url, visible: true }]);
      const groupe = L.layerGroup().addTo(window.map);
      window.dataLayerGroups = window.dataLayerGroups || {};
      window.dataLayerGroups.kta_as_calque = groupe;
      window.ajouterPointsDepuisJSON(url, groupe);
      return true;
    });
    await page.waitForTimeout(1200);
    const emb = await page.evaluate(function () {
      const r = (window.getAllEmbeddedRoads() || []).find(function (x) { return x.uid === "rd_as_calque"; });
      return r ? r.points.map(function (p) { return { x: p.x, y: p.y }; }) : null;
    });
    verifier(calque && !!emb, "calque fabriqué chargé (tracé embarqué)");
    if (emb) {
      const e0 = await etat(page);
      await geste(page, ptr, emb[1], { x: emb[1].x + 40 * s.k, y: emb[1].y + 40 * s.k });
      const emb2 = await page.evaluate(function () {
        const r = (window.getAllEmbeddedRoads() || []).find(function (x) { return x.uid === "rd_as_calque"; });
        return r ? r.points[1] : null;
      });
      const e1 = await etat(page);
      verifier(proche(emb2, emb[1], 1e-9) && e1.as.ecritures === e0.as.ecritures, "calque verrouillé : aucun ajustement");
      await page.evaluate(function () { window.map.closePopup(); });
      const rap = await page.evaluate(function () { return window.CalqueSession.rapatrier("kta_as_calque"); });
      await page.waitForTimeout(800);
      const copie = await lireObjet(page, "rd_as_calque");
      verifier(!!copie, "calque en « 🔄 Modifier » : sa copie est en session", rap);
      if (copie) {
        const vers = { x: copie.points[1].x + 40 * s.k, y: copie.points[1].y + 40 * s.k };
        await geste(page, ptr, copie.points[1], vers);
        const c2 = await lireObjet(page, "rd_as_calque");
        verifier(proche(c2.points[1], vers, tol), "copie du calque : le sommet se déplace", c2.points[1]);
      }
    }

    // ── Fermeture en mètres : mur de 0,4 m posé coin par coin ──
    // Au zoom max (le seul où un mur de 0,4 m fait plus de 8 px d'écran) ; la vue du harnais est remise ensuite.
    const mur = await page.evaluate(function () {
      window.map.setZoom(window.map.getMaxZoom(), { animate: false });
      const sc = window.APP_CONFIG.scale, H = window.APP_CONFIG.imageHeight, P = window.__as.P;
      const o = P(-200, 250);
      const coins = [[0, 0], [3, 0], [3, 0.4], [0, 0.4]].map(function (c) { return { x: o.x + c[0] * sc, y: o.y + c[1] * sc }; });
      const avant = window.getStructures().length;
      window.toggleStructureMode("mur");
      const clic = function (p) { window.map.fire("click", { latlng: window.L.latLng(H - p.y, p.x) }); };
      coins.forEach(clic);
      const enCours = window.getCurrentStructure();
      const n4 = enCours ? enCours.points.length : -1;
      clic(coins[0]);
      const ferme = !window.getCurrentStructure();
      window.toggleStructureMode("mur");
      const s = window.getStructures();
      const nouveau = s.length > avant ? s[s.length - 1] : null;
      return { tol: window.ktaToleranceFermeture(), m04: 0.4 * sc, n4: n4, ferme: ferme,
        pts: nouveau ? nouveau.points.length : null, zoom: window.map.getZoom() };
    });
    await page.evaluate(function () { window.map.setView(window.__as.vue[0], window.__as.vue[1], { animate: false }); });
    await page.waitForTimeout(300);
    verifier(mur.tol < mur.m04, "tolérance de fermeture sous 0,4 m à ce zoom (" + (mur.tol / (mur.m04 / 0.4)).toFixed(2) +
      " m)", mur);
    verifier(mur.n4 === 4 && mur.ferme && mur.pts === 4, "mur de 0,4 m : 4 coins posés sans fermeture anticipée, fermé " +
      "au re-clic du 1er", mur);

    // ── Sous rotation (plan orienté) ──
    const rot = await page.evaluate(async function () {
      const MB = window.MapBearing;
      if (!MB || typeof window.startTracking !== "function") return { b: 0 };
      MB.setEnabled(true);
      if (!window.getTrackingActif || !window.getTrackingActif()) window.startTracking();
      for (let i = 0; i < 60; i++) {
        MB.onStep(window.map.getCenter());
        MB.onHeading(300);
        await new Promise(function (r) { setTimeout(r, 50); });
        if (Math.abs(MB.getBearing() - 60) < 1) break;
      }
      return { b: MB.getBearing(), actif: MB.isActive(), drag: !!(window.map.dragging && window.map.dragging.enabled()) };
    });
    if (Math.abs(rot.b) > 5) {
      const rz = await lireObjet(page, "zn_as_z");
      const de = rz.points[0], vers = { x: de.x + 50 * s.k, y: de.y - 30 * s.k };
      const c0 = await etat(page);
      const g = await geste(page, ptr, de, vers);
      const rz2 = await lireObjet(page, "zn_as_z");
      verifier(proche(rz2.points[0], vers, tol * 2), "carte tournée de " + rot.b.toFixed(0) + "° : le sommet suit le " +
        "pointeur dans le repère du plan", { pt: rz2.points[0], voulu: vers });
      verifier(memeCentre(g.pendant.centre, c0.centre) && memeCentre(g.apres.centre, c0.centre),
        "carte tournée : le pan manuel ne déplace pas la carte pendant le glisser");
      const dragApres = await page.evaluate(function () { return window.map.dragging.enabled(); });
      verifier(dragApres === rot.drag, "carte tournée : le drag Leaflet rendu à son état d'avant le geste",
        { avant: rot.drag, apres: dragApres });
    } else {
      inf("rotation non obtenue (" + JSON.stringify(rot) + ") : cas tourné non joué ici");
      pb("rotation du plan orienté non forcée");
    }
    await page.evaluate(function () {
      try { if (window.stopTracking) window.stopTracking(); } catch (err) { /* rien */ }
      if (window.MapBearing) window.MapBearing.setEnabled(false);
    });

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.stack || err));
  } finally {
    await page.close();
  }
}

(async function main() {
  const liste = moteurs();
  try {
    for (const m of liste) {
      const nav = await lancerMoteur(m);
      if (!nav) { inf(m + " absent : moteur sauté"); continue; }
      try {
        for (const mode of (process.env.KTA_MODES || "souris,doigt").split(",")) await jouer(nav, m, mode);
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
  console.log("🎉 CHECKUP VERT — une forme dessinée s'ajuste par appui long (déplacer, ajouter, supprimer), sur les 4 " +
    "familles, à la souris et au doigt, sans fiche ni carte qui bouge, en un seul rendu et une seule annulation.");
  process.exit(0);
})();
