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
// lecture seule = rien, ronds dorés aux sommets des mesures (au départ, après ajustement), calque verrouillé = rien
// et sa copie « 🔄 Modifier » = oui, aimantation d'un tracé, mur de
// 0,4 m posé coin par coin fermé au 4e coin seulement, et un déplacement carte tournée (rotation manuelle, plan orienté).
// Après chaque geste (déplacer, ajouter, 🗑️, annulé par Échap / molette / 2e doigt, fermé par pointercancel / blur /
// visibilitychange, lâcher jamais reçu), vue droite puis carte tournée à deux doigts : un pan déplace la carte et le
// drag Leaflet revient à son état d'avant.
// 🩸 Le doigt : Chromium passe par CDP (Input.dispatchTouchEvent : vrais touch + pointer + clic du navigateur) ;
// WebKit n'a pas de CDP, il reçoit des PointerEvent `touch` synthétiques suivis de leur TouchEvent (la logique du
// module et du drag Leaflet, pas le pipeline tactile du moteur).
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
      menu: !!document.querySelector(".kta-ajuster-suppr"), plus: !!document.querySelector(".kta-ajuster-inserer"),
      bandeau: (function () {
        const b = document.querySelector(".kta-ajuster-bandeau");
        return b ? b.textContent : null;
      })(), as: window.KtaAjusterSommets.etat() };
  });
}

// ── Pointeurs : souris (Playwright), doigt (CDP sous Chromium, PointerEvent synthétiques sous WebKit) ──
function Pointeur(page, mode, moteur) {
  let cdp = null;
  // Sous WebKit, chaque PointerEvent est suivi de son TouchEvent (Touch n'y est pas constructible : un Event dont
  // `touches` est posé à la main), sinon le drag de Leaflet, qui écoute touchstart, ne verrait aucun doigt.
  const synth = function (type, x, y, clic) {
    return page.evaluate(function (a) {
      window.__asCible = (a.type === "pointerdown" || !window.__asCible) ?
        (document.elementFromPoint(a.x, a.y) || document.body) : window.__asCible;
      const el = a.type === "pointerdown" ? window.__asCible : (document.elementFromPoint(a.x, a.y) || document.body);
      const o = { bubbles: true, cancelable: true, composed: true, clientX: a.x, clientY: a.y, pointerId: 41,
        pointerType: "touch", isPrimary: true, button: 0, buttons: a.type === "pointerup" ? 0 : 1 };
      el.dispatchEvent(new PointerEvent(a.type, o));
      const tt = { pointerdown: "touchstart", pointermove: "touchmove", pointerup: "touchend" }[a.type];
      if (tt) {
        const t = { identifier: 41, target: window.__asCible, clientX: a.x, clientY: a.y, screenX: a.x,
          screenY: a.y, pageX: a.x, pageY: a.y };
        const ev = new Event(tt, { bubbles: true, cancelable: true, composed: true });
        const liste = tt === "touchend" ? [] : [t];
        Object.defineProperty(ev, "touches", { value: liste });
        Object.defineProperty(ev, "targetTouches", { value: liste });
        Object.defineProperty(ev, "changedTouches", { value: [t] });
        window.__asCible.dispatchEvent(ev);
      }
      if (a.type === "pointerup" && a.clic) el.dispatchEvent(new MouseEvent("click", o));
    }, { type: type, x: x, y: y, clic: clic === true });
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
    // Rotation à deux doigts autour de `c` (écran), de `deg` degrés, en `n` pas ; les doigts se lèvent l'un après
    // l'autre, comme à la main.
    async rotation(c, deg, n) {
      const R = 120, pts = function (a) {
        const r = a * Math.PI / 180;
        return [[c[0] - R * Math.cos(r), c[1] - R * Math.sin(r)], [c[0] + R * Math.cos(r), c[1] + R * Math.sin(r)]];
      };
      if (cdp) {
        const tp = function (q) { return [{ x: q[0][0], y: q[0][1], id: 0 }, { x: q[1][0], y: q[1][1], id: 1 }]; };
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(pts(0)) });
        for (let i = 1; i <= n; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(pts(deg * i / n)) });
          await page.waitForTimeout(16);
        }
        const fin = pts(deg);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: fin[1][0], y: fin[1][1], id: 1 }] });
        await page.waitForTimeout(40);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        return;
      }
      await page.evaluate(async function (a) {
        const pts = function (d) {
          const r = d * Math.PI / 180;
          return [[a.c[0] - a.R * Math.cos(r), a.c[1] - a.R * Math.sin(r)], [a.c[0] + a.R * Math.cos(r), a.c[1] + a.R * Math.sin(r)]];
        };
        const q0 = pts(0), cibles = q0.map(function (q) { return document.elementFromPoint(q[0], q[1]) || document.body; });
        const ids = [51, 52];
        const tch = function (q, i) { return { identifier: ids[i], target: cibles[i], clientX: q[0], clientY: q[1], screenX: q[0], screenY: q[1], pageX: q[0], pageY: q[1] }; };
        const touch = function (type, liste, chg, cible) {
          const ev = new Event(type, { bubbles: true, cancelable: true, composed: true });
          Object.defineProperty(ev, "touches", { value: liste });
          Object.defineProperty(ev, "targetTouches", { value: liste });
          Object.defineProperty(ev, "changedTouches", { value: chg });
          cible.dispatchEvent(ev);
        };
        const ptr = function (type, q, i) {
          const el = document.elementFromPoint(q[0], q[1]) || document.body;
          el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: q[0], clientY: q[1],
            pointerId: ids[i], pointerType: "touch", isPrimary: i === 0, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
        };
        ptr("pointerdown", q0[0], 0); touch("touchstart", [tch(q0[0], 0)], [tch(q0[0], 0)], cibles[0]);
        ptr("pointerdown", q0[1], 1); touch("touchstart", [tch(q0[0], 0), tch(q0[1], 1)], [tch(q0[1], 1)], cibles[1]);
        let q = q0;
        for (let i = 1; i <= a.n; i++) {
          q = pts(a.deg * i / a.n);
          ptr("pointermove", q[0], 0); ptr("pointermove", q[1], 1);
          touch("touchmove", [tch(q[0], 0), tch(q[1], 1)], [tch(q[0], 0), tch(q[1], 1)], cibles[0]);
          await new Promise(function (r) { setTimeout(r, 16); });
        }
        ptr("pointerup", q[0], 0); touch("touchend", [tch(q[1], 1)], [tch(q[0], 0)], cibles[0]);
        await new Promise(function (r) { setTimeout(r, 40); });
        ptr("pointerup", q[1], 1); touch("touchend", [], [tch(q[1], 1)], cibles[1]);
      }, { c: c, deg: deg, n: n, R: R });
    },
    // Deuxième doigt posé pendant que le premier tient, puis les deux levés.
    async deuxieme(p, q) {
      if (cdp) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart",
          touchPoints: [{ x: p[0], y: p[1], id: 0 }, { x: q[0], y: q[1], id: 1 }] });
        await page.waitForTimeout(60);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        return;
      }
      await page.evaluate(function (a) {
        const el = document.elementFromPoint(a.q[0], a.q[1]) || document.body;
        const o = { bubbles: true, cancelable: true, composed: true, clientX: a.q[0], clientY: a.q[1], pointerId: 42,
          pointerType: "touch", isPrimary: false, button: 0, buttons: 1 };
        el.dispatchEvent(new PointerEvent("pointerdown", o));
        el.dispatchEvent(new PointerEvent("pointerup", Object.assign({}, o, { buttons: 0 })));
      }, { q: q });
      await synth("pointerup", p[0], p[1]);
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

// Ronds dorés de la mesure (measure.js > _majSommetsMesure) : un par sommet des deux mesures, centré dessus (2 px),
// doré, au-dessus du trait (renderer SVG posé après le canvas des mesures).
async function ronds(page, quand) {
  const r = await page.evaluate(function () {
    const pts = window.getMeasurePoints().concat(window.getMeasurePointsSurface());
    const els = Array.prototype.slice.call(document.querySelectorAll(".kta-mesure-sommet"));
    const centres = els.map(function (el) { const b = el.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    const ecarts = pts.map(function (p) {
      const a = window.__as.ecran(p.x, p.y);
      return Math.min.apply(null, centres.map(function (c) { return Math.hypot(c[0] - a[0], c[1] - a[1]); }).concat([1e9]));
    });
    const el = els[0], svg = el && el.ownerSVGElement;
    const canvas = document.querySelector(".leaflet-overlay-pane canvas");
    return { n: els.length, voulu: pts.length, pire: +Math.max.apply(null, ecarts.concat([0])).toFixed(2),
      fill: el ? getComputedStyle(el).fill : null, accent: (function () {
        const t = document.createElement("span");
        t.style.color = "var(--kta-accent)";
        document.body.appendChild(t);
        const c = getComputedStyle(t).color;
        t.remove();
        return c;
      })(),
      dessus: !!(svg && canvas && (canvas.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING)),
      cliquable: el ? getComputedStyle(el).pointerEvents : null };
  });
  const dore = !!r.fill && r.fill === r.accent;
  verifier(r.n === r.voulu && r.voulu >= 5 && r.pire <= 2 && dore && r.dessus,
    "ronds dorés aux sommets des deux mesures (" + quand + ") : un par sommet, centrés, au-dessus du trait", r);
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
  verifier(g3.apres.menu && g3.apres.plus && !g3.apres.fiche, nom + " : appui long sans bouger → ＋ et 🗑️ proposés, " +
    "sans fiche", g3.apres);
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
  verifier(!g.apres.menu && g.apres.plus && vu && g.apres.as.refus === r0.as.refus + 1 &&
    o1.points.length === o0.points.length,
  nom + " : au minimum, ＋ seul (pas de 🗑️), un toast le dit, rien ne change", { as: g.apres.as, toast: vu });
  await page.evaluate(function () { window.KtaAjusterSommets.annuler(); });
}

// ── Insertion (＋ au sommet) ──
function centreDe(page, sel) {
  return page.evaluate(function (s) {
    const b = document.querySelector(s);
    if (!b) return null;
    const q = b.getBoundingClientRect();
    return [q.left + q.width / 2, q.top + q.height / 2];
  }, sel);
}
async function ouvrirInsertion(page, ptr, de) {
  const g = await geste(page, ptr, de, null);
  const plus = await centreDe(page, ".kta-ajuster-inserer");
  if (plus) { await ptr.tap(plus); await page.waitForTimeout(250); }
  return { menu: g.apres, apres: await etat(page) };
}
// Taps successifs (plan) pendant l'insertion ; toasts vidés, rien ne doit s'ouvrir.
async function taper(page, ptr, pts) {
  for (const p of pts) {
    await viderToasts(page);
    await ptr.tap(await ecran(page, p));
    await page.waitForTimeout(250);
  }
}
async function ctrlZ(page, n) {
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(200);
  }
  await viderToasts(page);
}

// Une famille : appui long sur X → ＋ et 🗑️ ; ＋ ; 3 taps → X+1, X+2, X+3 dans l'ordre (ou en fin de liste : fermée
// qui boucle, ligne prolongée) ; ⏪ point par point pendant (le mode reste, N baisse, à 0 aussi) puis après ; fin par
// `fin` ("ok" ✓, "echap", "suivant" = tap sur X+1).
// c : { nom, ref, x, pts: [[u, v]…] (plan du harnais), fin, histo (false : mesure hors outil, pas d'historique) }
async function insertion(page, ptr, c, tol) {
  // Une fiche ouverte plus tôt a pu recentrer la carte (autoPan) : vue du harnais remise.
  await page.evaluate(function () {
    window.map.closePopup();
    window.map.setView(window.__as.vue[0], window.__as.vue[1], { animate: false });
  });
  await page.waitForTimeout(250);
  const o0 = await lireObjet(page, c.ref), L0 = o0.points.length;
  const e0 = await etat(page);
  const o = await ouvrirInsertion(page, ptr, o0.points[c.x]);
  verifier(o.menu.plus && (o.menu.menu || c.sansSuppr) && !o.menu.fiche, c.nom + " : appui long sans bouger → ＋ et 🗑️",
    o.menu);
  verifier(o.apres.as.insertion && /0/.test(o.apres.bandeau || "") && !o.apres.plus,
    c.nom + " : ＋ ouvre l'insertion, bandeau « 0 point »", { bandeau: o.apres.bandeau, as: o.apres.as });
  const cibles = [];
  for (const uv of c.pts) cibles.push(await planU(page, uv[0], uv[1]));
  await taper(page, ptr, cibles);
  const o1 = await lireObjet(page, c.ref), e1 = await etat(page);
  const debut = c.x + 1;
  const place = o1.points.length === L0 + 3 &&
    cibles.every(function (q, i) { return proche(o1.points[debut + i], q, tol); });
  const reste = o0.points.every(function (p, i) {
    return proche(o1.points[i <= c.x ? i : i + 3], p, 1e-9);
  });
  verifier(place && reste, c.nom + " : 3 taps → 3 sommets à la suite de X (" + c.genre + "), le reste à sa place",
    { L: [L0, o1.points.length], pts: o1.points.slice(debut, debut + 3), voulu: cibles });
  verifier(e1.as.insertion && /3/.test(e1.bandeau || "") && !e1.fiche, c.nom + " : bandeau « 3 points », aucune fiche",
    { bandeau: e1.bandeau, fiche: e1.fiche });
  if (c.histo !== false) {
    verifier(e1.annulables === e0.annulables + 3, c.nom + " : un point = une entrée d'historique",
      { avant: e0.annulables, apres: e1.annulables });
    verifier(o1.uid === o0.uid && o1.updatedAt !== o0.updatedAt, c.nom + " : uid gardé, updatedAt changé");
    await ctrlZ(page, 1);
    let oz = await lireObjet(page, c.ref), ez = await etat(page);
    verifier(oz.points.length === L0 + 2 && proche(oz.points[debut + 1], cibles[1], tol) && ez.as.insertion &&
      /2/.test(ez.bandeau || ""), c.nom + " : Ctrl+Z pendant le mode retire le dernier point, le mode continue (2)",
    { L: oz.points.length, bandeau: ez.bandeau });
    await ctrlZ(page, 2);
    oz = await lireObjet(page, c.ref); ez = await etat(page);
    verifier(oz.points.length === L0 && ez.as.insertion && /0/.test(ez.bandeau || ""),
      c.nom + " : Ctrl+Z jusqu'à 0 point, le mode reste ouvert", { L: oz.points.length, bandeau: ez.bandeau });
    await taper(page, ptr, cibles);
    oz = await lireObjet(page, c.ref);
    verifier(oz.points.length === L0 + 3 && proche(oz.points[debut], cibles[0], tol),
      c.nom + " : les taps reprennent après le Ctrl+Z, au même endroit", { L: oz.points.length });
  }
  // Fin
  if (c.fin === "ok") {
    const ok = await centreDe(page, ".kta-ajuster-bandeau [data-ajuster]");
    if (ok) await ptr.tap(ok);
  } else if (c.fin === "echap") {
    await page.keyboard.press("Escape");
  } else {
    const ox = await lireObjet(page, c.ref);
    await ptr.tap(await ecran(page, ox.points[c.suivant(ox.points.length)]));
  }
  await page.waitForTimeout(300);
  const of = await lireObjet(page, c.ref), ef = await etat(page);
  verifier(!ef.as.insertion && ef.bandeau === null && of.points.length === L0 + 3,
    c.nom + " : fin par " + { ok: "✓", echap: "Échap", suivant: "un tap sur X+1" }[c.fin] + ", les points restent",
    { as: ef.as, bandeau: ef.bandeau, L: of.points.length });
  await page.evaluate(function () { window.map.closePopup(); });
  // Après le mode : un tap ne pose plus rien ; Ctrl+Z retire encore un point à la fois.
  await taper(page, ptr, [await planU(page, c.pts[0][0] + 15, c.pts[0][1] + 15)]);
  await page.evaluate(function () { window.map.closePopup(); });
  verifier((await lireObjet(page, c.ref)).points.length === L0 + 3, c.nom + " : après la fin, un tap ne pose plus rien");
  if (c.histo !== false) {
    await ctrlZ(page, 1);
    const a1 = await lireObjet(page, c.ref);
    await ctrlZ(page, 2);
    const a3 = await lireObjet(page, c.ref);
    verifier(a1.points.length === L0 + 2 && a3.points.length === L0 &&
      a3.points.every(function (p, i) { return proche(p, o0.points[i], 1e-9); }),
    c.nom + " : après le mode, Ctrl+Z retire un point à la fois jusqu'à la forme d'origine",
    { L: [a1.points.length, a3.points.length] });
  }
}

async function insertionRefusee(page, ptr) {
  // Lecture seule : l'appui long n'offre rien ; ouverte puis lecture seule : le tap ferme l'insertion sans rien écrire.
  await page.evaluate(function () { window.__asRO = window.ktaEditionRefusee; window.ktaEditionRefusee = function () { return true; }; });
  const z0 = await lireObjet(page, "zn_as_z");
  const g = await geste(page, ptr, z0.points[1], null);
  verifier(!g.apres.plus && !g.apres.menu && !g.apres.as.insertion, "lecture seule : ni ＋ ni 🗑️", g.apres);
  await page.evaluate(function () { window.ktaEditionRefusee = window.__asRO; });
  await ouvrirInsertion(page, ptr, z0.points[1]);
  const ouverte = (await etat(page)).as.insertion;
  await page.evaluate(function () { window.ktaEditionRefusee = function () { return true; }; });
  await taper(page, ptr, [await planU(page, 75, -380)]);
  const e = await etat(page);
  await page.evaluate(function () { window.ktaEditionRefusee = window.__asRO; window.map.closePopup(); });
  verifier(ouverte && !e.as.insertion && e.bandeau === null &&
    (await lireObjet(page, "zn_as_z")).points.length === z0.points.length,
  "insertion ouverte puis lecture seule : le tap la ferme, rien n'est écrit", { ouverte: ouverte, as: e.as });
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

// ── Pan d'un doigt (ou de la souris) après un geste : la carte suit, le drag Leaflet revient à son état d'avant ──
// Le pan part d'un fond nu (rien à viser, ni vecteur, ni marqueur, ni bouton : cherché sur une grille, la carte
// pouvant être tournée) ; la vue du harnais est remise après.
function fondNu(page) {
  return page.evaluate(function () {
    const cr = window.map.getContainer().getBoundingClientRect();
    for (let y = 200; y < innerHeight - 200; y += 37) {
      for (let x = 200; x < innerWidth - 200; x += 41) {
        const el = document.elementFromPoint(x, y);
        if (!el || !window.map.getContainer().contains(el) || x < cr.left || y < cr.top) continue;
        if (el.closest(".leaflet-control, .leaflet-marker-icon, .leaflet-popup") || el.tagName === "path") continue;
        if (window.KtaAjusterSommets.viser(x, y) || window.KtaAjusterSommets.viser(x + 70, y - 90)) continue;
        return [x, y];
      }
    }
    return null;
  });
}
async function pan(page, ptr) {
  const a = await fondNu(page);
  if (!a) return { px: 0, drag: null, enCours: null, fondNu: false };
  const b = [a[0] + 70, a[1] - 90];
  const c0 = await page.evaluate(function () { return window.map.getCenter(); });
  await ptr.down(a);
  for (let i = 1; i <= 8; i++) {
    await ptr.move([a[0] + (b[0] - a[0]) * i / 8, a[1] + (b[1] - a[1]) * i / 8]);
    await page.waitForTimeout(20);
  }
  await ptr.up(b);
  await page.waitForTimeout(350);
  const r = await page.evaluate(function (c0) {
    const m = window.map, p = m.latLngToContainerPoint(c0), q = m.latLngToContainerPoint(m.getCenter());
    return { px: Math.round(Math.hypot(p.x - q.x, p.y - q.y)), drag: !!(m.dragging && m.dragging.enabled()),
      enCours: window.KtaAjusterSommets.enCours(), menu: !!document.querySelector(".kta-ajuster-suppr") };
  }, c0);
  await page.evaluate(function () { window.map.setView(window.__as.vue[0], window.__as.vue[1], { animate: false }); });
  await page.waitForTimeout(250);
  return r;
}
function dragCarte(page) {
  return page.evaluate(function () { return !!(window.map.dragging && window.map.dragging.enabled()); });
}
async function panApres(page, ptr, nom, drag0) {
  const r = await pan(page, ptr);
  verifier(r.px >= 60 && !r.enCours, nom + " : puis un pan d'un doigt déplace la carte (" + r.px + " px)", r);
  verifier(r.drag === drag0, nom + " : drag de la carte rendu à son état d'avant", { avant: drag0, apres: r.drag });
}

// Appui long armé sur `de`, puis `fin(a)` termine le geste (Échap, molette, 2e doigt, perte de focus…).
async function appuiArme(page, ptr, de, fin) {
  await viderToasts(page);
  const a = await ecran(page, de);
  await ptr.down(a);
  await page.waitForTimeout(650);
  const arme = await page.evaluate(function () { return window.KtaAjusterSommets.etat().arme; });
  await fin(a);
  await page.waitForTimeout(300);
  // La molette a pu zoomer (Leaflet la lit aussi) : vue du harnais remise, sinon le pan bute sur les bords du plan.
  await page.evaluate(function () { window.map.setView(window.__as.vue[0], window.__as.vue[1], { animate: false }); });
  await page.waitForTimeout(200);
  return arme;
}

// Fins ratées : le navigateur ne livre pas le lâcher (pointercancel, onglet caché, focus perdu).
const FINS_RATEES = [
  ["pointercancel", function () {
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: window.__asId, pointerType: "touch",
      bubbles: true }));
  }],
  ["onglet caché (visibilitychange)", function () {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: function () { return "hidden"; } });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
  }],
  ["focus perdu (blur)", function () { window.dispatchEvent(new Event("blur")); }]
];

// Chaque fin de geste, réussie, annulée ou ratée, rend la carte à un doigt (au pointeur sous `souris`).
async function panApresGestes(page, ptr, mode, vue) {
  const k = await page.evaluate(function () { return window.__as.k; });
  const z = function () { return lireObjet(page, "zn_as_z"); };
  const drag0 = await dragCarte(page);
  const pfx = _prefixe;
  _prefixe = pfx + "[" + vue + "] ";
  verifier(drag0 === (vue === "vue droite"), "drag Leaflet de la carte avant les gestes : " +
    (drag0 ? "actif" : "coupé (pan manuel du plan tourné)"));
  const r = await pan(page, ptr);
  verifier(r.px >= 60, "pan témoin, avant tout geste (" + r.px + " px)", r);

  let o = await z();
  await geste(page, ptr, o.points[1], { x: o.points[1].x + 30 * k, y: o.points[1].y + 25 * k });
  await panApres(page, ptr, "sommet déplacé", drag0);
  o = await z();
  const n = o.points.length;
  const mil = { x: (o.points[0].x + o.points[1].x) / 2, y: (o.points[0].y + o.points[1].y) / 2 };
  await geste(page, ptr, mil, { x: mil.x, y: mil.y - 25 * k });
  verifier((await z()).points.length === n + 1, "sommet ajouté (avant le pan)");
  await panApres(page, ptr, "sommet ajouté", drag0);
  o = await z();
  const g = await geste(page, ptr, o.points[1], null);
  verifier(g.apres.menu, "appui long sans bouger : 🗑️ proposé (avant le pan)");
  await panApres(page, ptr, "🗑️ resté ouvert, refermé par le pan", drag0);
  await geste(page, ptr, o.points[1], null);
  verifier(await supprimerParMenu(page, ptr) && (await z()).points.length === n, "sommet supprimé par 🗑️ (avant le pan)");
  await panApres(page, ptr, "sommet supprimé par 🗑️", drag0);

  o = await z();
  let arme = await appuiArme(page, ptr, o.points[0], async function (a) {
    await page.keyboard.press("Escape");
    await ptr.up(a);
  });
  verifier(arme, "Échap : l'appui était armé");
  await panApres(page, ptr, "appui long annulé par Échap", drag0);
  arme = await appuiArme(page, ptr, o.points[0], async function (a) {
    await page.evaluate(function (a) {
      const el = document.elementFromPoint(a[0], a[1]) || window.map.getContainer();
      el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: a[0], clientY: a[1],
        deltaY: 0.01 }));
    }, a);
    await ptr.up(a);
  });
  verifier(arme, "molette : l'appui était armé");
  await panApres(page, ptr, "appui long annulé par la molette", drag0);
  if (mode === "doigt") {
    arme = await appuiArme(page, ptr, o.points[0], async function (a) { await ptr.deuxieme(a, [a[0] + 120, a[1] + 60]); });
    verifier(arme, "2e doigt : l'appui était armé");
    await panApres(page, ptr, "appui long annulé par un 2e doigt", drag0);
  }

  for (const f of FINS_RATEES) {
    await page.evaluate(function () {
      window.__asId = null;
      window.addEventListener("pointerdown", function (e) { window.__asId = e.pointerId; }, { capture: true, once: true });
    });
    let apres = null;
    arme = await appuiArme(page, ptr, o.points[0], async function () {
      await page.evaluate(f[1]);
      apres = await page.evaluate(function () {
        return { enCours: window.KtaAjusterSommets.enCours(), drag: !!window.map.dragging.enabled() };
      });
    });
    verifier(arme && apres && !apres.enCours && apres.drag === drag0, f[0] + " pendant l'appui armé : geste fermé, " +
      "drag rendu aussitôt", { arme: arme, apres: apres });
    // Le lâcher arrive quand même : sans effet.
    await ptr.up(await ecran(page, o.points[0]));
    await page.waitForTimeout(200);
    verifier(proche((await z()).points[0], o.points[0], 1e-9), f[0] + " : rien n'est écrit");
    await panApres(page, ptr, "geste fermé par " + f[0], drag0);
  }

  // Lâcher perdu : un appui armé dont ni pointerup ni pointercancel n'arrive. L'appui suivant est le premier doigt
  // posé (isPrimary) : l'ancien est parti. Joué avec un pointerId neuf (Chromium) et le même réutilisé (WebKit).
  for (const id of [77, 41]) {
    await page.evaluate(function (a) {
      const el = document.elementFromPoint(a.p[0], a.p[1]) || window.map.getContainer();
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, composed: true,
        clientX: a.p[0], clientY: a.p[1], pointerId: a.id, pointerType: "touch", isPrimary: true, button: 0, buttons: 1 }));
    }, { p: await ecran(page, o.points[0]), id: id });
    await page.waitForTimeout(650);
    verifier(await page.evaluate(function () { return window.KtaAjusterSommets.etat().arme; }),
      "lâcher perdu (pointerId " + id + ") : l'appui fantôme était armé");
    await panApres(page, ptr, "lâcher perdu (pointerId " + id + "), appui suivant", drag0);
  }
  _prefixe = pfx;
}

// Un glisser sur carte tournée : le sommet suit le pointeur dans le repère du plan ; ni pan manuel, ni rotation
// (angle et source gardés), drag Leaflet rendu à son état d'avant.
async function sousRotation(page, ptr, nom, rot, k, tol) {
  const rz = await lireObjet(page, "zn_as_z");
  const de = rz.points[0], vers = { x: de.x + 50 * k, y: de.y - 30 * k };
  const c0 = await etat(page);
  const g = await geste(page, ptr, de, vers);
  const rz2 = await lireObjet(page, "zn_as_z");
  verifier(proche(rz2.points[0], vers, tol * 2), nom + " (" + rot.b.toFixed(0) + "°) : le sommet suit le pointeur " +
    "dans le repère du plan", { pt: rz2.points[0], voulu: vers });
  verifier(memeCentre(g.pendant.centre, c0.centre) && memeCentre(g.apres.centre, c0.centre),
    nom + " : le pan manuel ne déplace pas la carte pendant le glisser");
  const apres = await page.evaluate(function () {
    const MB = window.MapBearing;
    return { b: MB.getBearing(), src: MB.getSource ? MB.getSource() : null, drag: window.map.dragging.enabled() };
  });
  verifier(Math.abs(apres.b - rot.b) < 0.5 && apres.src === rot.src, nom + " : le glisser ne fait pas tourner la carte",
    { avant: rot, apres: apres });
  verifier(apres.drag === rot.drag, nom + " : le drag Leaflet rendu à son état d'avant le geste",
    { avant: rot.drag, apres: apres.drag });
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
    await ronds(page, "au départ");
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
    await ronds(page, "après déplacer, ajouter et supprimer");
    await refus(page, ptr, "tracé de 2 points", "rd_as_r2");
    await refus(page, ptr, "zone de 3 sommets", "zn_as_t");

    // ── Insertion (＋) : vue du harnais remise, formes remises à neuf (puis encore pour la suite) ──
    const vueAs = function () {
      return page.evaluate(function () { window.map.setView(window.__as.vue[0], window.__as.vue[1], { animate: false }); });
    };
    await vueAs();
    await page.waitForTimeout(300);
    await semer(page);
    await page.waitForTimeout(300);
    const INS = [
      { nom: "＋ tracé", ref: "rd_as_r1", x: 0, genre: "entre X et X+1", fin: "suivant",
        suivant: function () { return 4; }, pts: [[-412, -270], [-375, -270], [-337, -270]] },
      { nom: "＋ zone (X dernier)", ref: "zn_as_z", x: 3, genre: "fermée : boucle vers le premier", fin: "suivant",
        suivant: function () { return 0; }, pts: [[-30, -238], [-30, -275], [-30, -312]] },
      { nom: "＋ pilier", ref: "st_as_p", x: 1, genre: "entre X et X+1", fin: "ok",
        pts: [[-270, 37], [-270, 75], [-270, 112]] },
      { nom: "＋ mur (ligne, X dernier)", ref: "st_as_l", x: 1, genre: "prolongé au-delà du bout", fin: "echap",
        sansSuppr: true, pts: [[20, -40], [40, -80], [60, -120]] },
      { nom: "＋ mesure distance (X dernier)", ref: "distance", x: 2, genre: "prolongée au-delà du bout", fin: "ok",
        histo: false, pts: [[430, 40], [460, 80], [490, 120]] },
      { nom: "＋ mesure surface (X dernier)", ref: "surface", x: 2, genre: "fermée : boucle vers le premier",
        fin: "suivant", histo: false, sansSuppr: true, suivant: function () { return 0; },
        pts: [[191, 283], [154, 246], [116, 208]] }
    ];
    for (const c of INS) await insertion(page, ptr, c, tol);
    await insertionRefusee(page, ptr);
    await vueAs();
    await page.waitForTimeout(300);
    await semer(page);
    await page.waitForTimeout(300);

    // ── Après chaque geste, réussi, annulé ou mal terminé : un pan déplace la carte ──
    await panApresGestes(page, ptr, mode, "vue droite");
    // Carte tournée à 60° : à deux doigts au doigt (le geste réel), par MapBearing.setManuel à la souris.
    if (mode === "doigt") {
      const f = await fondNu(page);
      await ptr.rotation([f[0] + 35, f[1] - 45], 60, 15);
      await page.waitForTimeout(400);
    } else {
      await page.evaluate(function () { window.MapBearing.setManuel(60); });
    }
    const angle = await page.evaluate(function () { return window.MapBearing.getBearing(); });
    const tournee = Math.abs(angle) > 20;
    verifier(tournee, "carte tournée à la main (" + angle.toFixed(0) + "°)");
    if (tournee) await panApresGestes(page, ptr, mode, "carte tournée");
    await page.evaluate(function () { window.MapBearing.remettreNord(); });
    await page.waitForTimeout(700);

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

    // ── Zone sur plusieurs niveaux (zones.js > _niveauxZone) : repérée si UN de ses niveaux est visible ──
    const ml = await page.evaluate(function () {
      const cfg = window.APP_CONFIG, P = window.__as.P;
      if (cfg.multiLevel !== true) return null;
      window.__asVis = cfg.visibleLevels.slice();
      cfg.visibleLevels = [0];
      const z = window.getZones();
      z.push({ uid: "zn_as_ml", type: "eau", level: -1, niveaux: [-1, 0],
        points: [P(450, -350), P(550, -350), P(550, -250), P(450, -250)] });
      z.push({ uid: "zn_as_m1", type: "eau", level: -1, points: [P(450, -150), P(550, -150), P(550, -60)] });
      window.renderZones();
      return true;
    });
    if (ml) {
      const zml = await lireObjet(page, "zn_as_ml");
      const vml = { x: zml.points[0].x - 30 * s.k, y: zml.points[0].y + 20 * s.k };
      await geste(page, ptr, zml.points[0], vml);
      verifier(proche((await lireObjet(page, "zn_as_ml")).points[0], vml, tol),
        "zone de niveaux −1 et 0, niveau 0 affiché : son sommet se déplace");
      await rien(page, ptr, "zone du seul niveau −1, niveau 0 affiché : rien", "zn_as_m1");
      await page.evaluate(function () {
        window.APP_CONFIG.visibleLevels = window.__asVis;
        window.setZones(window.getZones().filter(function (o) { return o.uid !== "zn_as_ml" && o.uid !== "zn_as_m1"; }));
      });
    } else {
      inf("plan sans multi-niveau : zone sur plusieurs niveaux non jouée");
    }

    // ── Juste après un appui long : un bouton de barre agit aussitôt, un clic sur la carte est avalé ──
    await page.evaluate(function () {
      const g = window._groupes.history;
      if (g.subActions[0].classList.contains("kta-hidden")) g.btnPrincipal.click();
      window.map.closePopup();
    });
    await page.waitForTimeout(300);
    const btnUndo = await page.evaluate(function () {
      const q = window._groupes.history.subActions[0].getBoundingClientRect();
      return q.width ? [q.left + q.width / 2, q.top + q.height / 2] : null;
    });
    const rA = await lireObjet(page, "rd_as_r1"), deA = rA.points[1];
    const versA = { x: deA.x + 30 * s.k, y: deA.y + 30 * s.k };
    const appuiEtLacher = async function () {
      const a = await ecran(page, deA), b = await ecran(page, versA);
      await viderToasts(page);
      await ptr.down(a);
      await page.waitForTimeout(650);
      for (let i = 1; i <= 6; i++) { await ptr.move([a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6]); await page.waitForTimeout(20); }
      await ptr.up(b);
    };
    if (btnUndo) {
      await appuiEtLacher();
      const t0 = Date.now();
      await ptr.tap(btnUndo);
      const dt = Date.now() - t0;
      await page.waitForTimeout(300);
      const rB = await lireObjet(page, "rd_as_r1");
      verifier(proche(rB.points[1], deA, 1e-6), "appui long puis ⏪ de la barre touché aussitôt (" + dt + " ms) : le bouton " +
        "agit, le sommet revient", { pt: rB.points[1], voulu: deA });
    } else {
      pb("bouton ⏪ de la barre introuvable à l'écran");
    }
    await appuiEtLacher();
    await ptr.tap(await ecran(page, await planU(page, 75, -275)));
    await page.waitForTimeout(500);
    e = await etat(page);
    verifier(!e.fiche, "appui long puis clic aussitôt sur une zone de la carte : avalé, aucune fiche");
    await page.evaluate(function () { window.map.closePopup(); window.HistoryManager.undo(); });
    await page.waitForTimeout(300);

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

    // ── Carte tournée : rotation manuelle à deux doigts (MapBearing.setManuel), puis plan orienté (cap du tracker) ──
    const manuel = await page.evaluate(function () {
      const MB = window.MapBearing;
      if (!MB || typeof MB.setManuel !== "function") return null;
      const okPose = MB.setManuel(60);
      return { ok: okPose, b: MB.getBearing(), src: MB.getSource(),
        drag: !!(window.map.dragging && window.map.dragging.enabled()) };
    });
    verifier(!!manuel && manuel.ok, "rotation manuelle forcée par MapBearing.setManuel(60)", manuel);
    if (manuel && manuel.ok) await sousRotation(page, ptr, "rotation manuelle", manuel, s.k, tol);
    await page.evaluate(function () { if (window.MapBearing && window.MapBearing.remettreNord) window.MapBearing.remettreNord(); });
    await page.waitForTimeout(600);
    const cap = await page.evaluate(async function () {
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
      return { b: MB.getBearing(), src: MB.getSource ? MB.getSource() : null,
        drag: !!(window.map.dragging && window.map.dragging.enabled()) };
    });
    if (Math.abs(cap.b) > 5) await sousRotation(page, ptr, "plan orienté", cap, s.k, tol);
    else inf("plan orienté : le cap ne tourne pas la vue dans ce harnais (" + JSON.stringify(cap) + "), cas non joué");
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
