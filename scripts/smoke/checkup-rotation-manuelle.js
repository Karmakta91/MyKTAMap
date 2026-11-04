#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-rotation-manuelle.js — checkup de RELEASE (Playwright, pas un hook pré-commit)
// =====================================================================
// Vérifie la rotation manuelle de la carte 2D (js/mapBearing.js) dans l'app réelle, sur le relevé fictif, sous
// chaque moteur de KTA_MOTEURS (Chromium, WebKit = Safari) :
// R1 pincement sous le seuil d'angle : zoom seul · R2 deux doigts au-delà : la vue suit, sans saut, contenu sous les
// doigts · R3 bouton nord · R4 outil armé : vue droite, geste refusé, droite au désarmement · R5 toucher d'un POI et
// d'une structure sous rotation : la bonne fiche · R6 popup droite · R7 Maj + molette · R8 exports PNG/PDF droits
// (même canvas qu'à plat) · R9 mode plein écran redresse · R10 vue 3D aller-retour · R11 plan orienté qui reprend la
// main · R12 changement de plan · R13 bouton nord en bas à gauche, hors de la barre de droite, sans chevauchement
// (393 × 852, 430 × 932, 852 × 393, 1366 × 768 ; seul, boussole ouverte, mode Présentation) et barre 2D entière
// (10 pilules de 30 px à 852 × 393) · R14 (Chromium) vrai geste tactile CDP.
// 🩸 Les doigts simulés suivent la famille d'événements de Leaflet (`L.Browser.touchNative` : TouchEvent sous
// Chromium, PointerEvent sous WebKit de bureau) : sinon le pinch-zoom de Leaflet ne voit rien et R1 passe à vide.
// Usage : node scripts/smoke/checkup-rotation-manuelle.js · doc : docs/architecture/tracking.md §plan orienté
// =====================================================================
"use strict";

const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");
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
function ok(msg)  { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) {
  if (cond) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}

async function ouvrirPlan(nav, ctxOpts) {
  const ctx = await nav.newContext(ctxOpts);
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(e.message); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN, { exact: false }).first().click();
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.MapBearing; }, 30000);
  await page.waitForTimeout(2500);
  await outils(page);
  return { ctx: ctx, page: page, erreurs: erreurs };
}

// Outils posés dans la page : doigts simulés, mesures d'angle, toucher d'un point à l'écran.
async function outils(page) {
  await page.evaluate(function () {
    const attente = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    const centreEcran = function () {
      const r = window.map.getContainer().getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    window.__rm = {
      attente: attente,
      // Geste à deux doigts autour de (cx, cy) : écart d0 → d1 px, angle a0 → a1 degrés, en n pas.
      geste: async function (o) {
        const cont = window.map.getContainer();
        const tactile = !!(L.Browser && L.Browser.touchNative);
        const n = o.n || 12;
        const pos = function (k) {
          const d = o.d0 + (o.d1 - o.d0) * k, a = (o.a0 + (o.a1 - o.a0) * k) * Math.PI / 180;
          const ux = Math.cos(a) * d / 2, uy = Math.sin(a) * d / 2;
          return [{ x: o.cx - ux, y: o.cy - uy }, { x: o.cx + ux, y: o.cy + uy }];
        };
        const envoyer = function (type, pts, fin) {
          if (tactile) {
            // 🩸 WebKit expose TouchEvent mais refuse `new Touch()` : événement simple portant des listes de points
            // (Leaflet et mapBearing.js n'en lisent que clientX / clientY).
            let ev;
            try {
              const touches = pts.map(function (p, i) {
                return new Touch({ identifier: 41 + i, target: cont, clientX: p.x, clientY: p.y,
                                   radiusX: 10, radiusY: 10, force: 1 });
              });
              ev = new TouchEvent(type, { bubbles: true, cancelable: true, composed: true,
                touches: fin ? [] : touches, targetTouches: fin ? [] : touches, changedTouches: touches });
            } catch (e) {
              const faux = pts.map(function (p, i) {
                return { identifier: 41 + i, target: cont, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y };
              });
              ev = new Event(type, { bubbles: true, cancelable: true, composed: true });
              Object.defineProperty(ev, "touches", { value: fin ? [] : faux });
              Object.defineProperty(ev, "targetTouches", { value: fin ? [] : faux });
              Object.defineProperty(ev, "changedTouches", { value: faux });
            }
            cont.dispatchEvent(ev);
          } else {
            const nom = { touchstart: "pointerdown", touchmove: "pointermove", touchend: "pointerup" }[type];
            pts.forEach(function (p, i) {
              cont.dispatchEvent(new PointerEvent(nom, { bubbles: true, cancelable: true, composed: true,
                pointerId: 41 + i, pointerType: "touch", isPrimary: i === 0, clientX: p.x, clientY: p.y,
                buttons: nom === "pointerup" ? 0 : 1 }));
            });
          }
        };
        // Les deux doigts d'un coup : Leaflet exige touches.length === 2 au touchstart.
        envoyer("touchstart", pos(0));
        for (let i = 1; i <= n; i++) {
          await attente(30);
          envoyer("touchmove", pos(i / n));
        }
        await attente(40);
        envoyer("touchend", pos(1), true);
        await attente(o.apres || 700);
      },
      centre: centreEcran,
      // Latlng affichée sous un point de l'écran, rotation comprise.
      sousEcran: function (x, y) {
        const map = window.map, cr = map.getContainer().getBoundingClientRect();
        const cc = map.getSize().divideBy(2);
        const a = -window.MapBearing.getBearing() * Math.PI / 180;
        const dx = (x - cr.left) - cc.x, dy = (y - cr.top) - cc.y;
        return map.containerPointToLatLng(L.point(dx * Math.cos(a) - dy * Math.sin(a) + cc.x,
                                                  dx * Math.sin(a) + dy * Math.cos(a) + cc.y));
      },
      // Position écran d'une latlng, rotation comprise.
      versEcran: function (ll) {
        const map = window.map, cr = map.getContainer().getBoundingClientRect();
        const cc = map.getSize().divideBy(2);
        const p = map.latLngToContainerPoint(ll);
        const a = window.MapBearing.getBearing() * Math.PI / 180;
        const dx = p.x - cc.x, dy = p.y - cc.y;
        return { x: cr.left + dx * Math.cos(a) - dy * Math.sin(a) + cc.x,
                 y: cr.top + dx * Math.sin(a) + dy * Math.cos(a) + cc.y };
      },
      angle: function () { const b = window.MapBearing.getBearing(); return ((b % 360) + 540) % 360 - 180; },
      nordVisible: function () {
        const el = document.querySelector(".kta-nord-ctrl");
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== "none";
      },
      // Angle visuel cumulé d'un élément (somme des rotations de ses ancêtres).
      angleCumule: function (n) {
        let a = 0, p = n;
        while (p && p !== document.body) {
          const cs = getComputedStyle(p);
          if (cs.transform && cs.transform !== "none") {
            const mm = new DOMMatrix(cs.transform);
            a += Math.atan2(mm.b, mm.a) * 180 / Math.PI;
          }
          p = p.parentElement;
        }
        return ((a % 360) + 540) % 360 - 180;
      }
    };
  });
}

// Angle du premier pas d'un geste de `total`° en `n` pas qui atteint le seuil : là où la vue commence à tourner.
function franchi(total, n, seuil) {
  for (let i = 1; i <= n; i++) { if (total * i / n >= seuil + 1e-6) return total * i / n; }
  return total;
}

async function suite(nav, nomMoteur) {
  const { ctx, page, erreurs } = await ouvrirPlan(nav, { viewport: { width: 1100, height: 800 } });
  try {
    const famille = await page.evaluate(function () { return L.Browser.touchNative ? "touch" : "pointeurs"; });
    inf("doigts simulés en " + famille + " (famille du pinch-zoom de Leaflet sur ce moteur)");
    const seuil = await page.evaluate(function () { return window.MapBearing.SEUIL_ROTATION; });

    // ── R0 — état de départ ──
    console.log("— R0 : état de départ —");
    const r0 = await page.evaluate(function () {
      return { b: window.MapBearing.getBearing(), src: window.MapBearing.getSource(), nord: window.__rm.nordVisible() };
    });
    verifier(r0.b === 0 && r0.src === null && !r0.nord, "vue droite, aucune source, bouton nord absent", r0);

    // ── R1 — pincement sous le seuil d'angle ──
    console.log("— R1 : pincement avec " + (seuil - 7) + "° de torsion (seuil " + seuil + "°) —");
    const r1 = await page.evaluate(async function (torsion) {
      window.map.setZoom(-1, { animate: false });
      await window.__rm.attente(500);
      const z0 = window.map.getZoom(), c = window.__rm.centre();
      await window.__rm.geste({ cx: c.x - 60, cy: c.y + 40, d0: 120, d1: 260, a0: 0, a1: torsion });
      return { z0: z0, z1: window.map.getZoom(), b: window.__rm.angle(), src: window.MapBearing.getSource() };
    }, seuil - 7);
    verifier(r1.z1 > r1.z0, "le pincement zoome (" + r1.z0 + " → " + r1.z1 + ")", r1);
    verifier(Math.abs(r1.b) < 0.01 && r1.src === null, "sous le seuil, la vue ne tourne pas", r1);

    // ── R2 — deux doigts au-delà du seuil ──
    console.log("— R2 : torsion de 66° à deux doigts, par pas de 5,5° —");
    const r2 = await page.evaluate(async function () {
      const c = window.__rm.centre();
      const mx = c.x - 60, my = c.y + 40;
      const ll = window.__rm.sousEcran(mx, my);
      await window.__rm.geste({ cx: mx, cy: my, d0: 200, d1: 200, a0: 0, a1: 66, n: 12 });
      const e = window.__rm.versEcran(ll);
      return { b: window.__rm.angle(), src: window.MapBearing.getSource(), nord: window.__rm.nordVisible(),
               derive: Math.round(Math.hypot(e.x - mx, e.y - my) * 10) / 10,
               verrou: !(window.map.dragging && window.map.dragging.enabled()) };
    });
    // La vue part du pas qui franchit le seuil et suit le reste du geste (aucun saut).
    const attenduR2 = 66 - franchi(66, 12, seuil);
    verifier(Math.abs(r2.b - attenduR2) < 1, "la vue tourne de " + r2.b.toFixed(1) + "° (66° de geste moins le pas qui " +
      "franchit " + seuil + "°, sans saut)", r2);
    verifier(r2.src === "manuel" && r2.nord, "source « manuel », bouton nord visible", r2);
    verifier(r2.derive < 12, "le contenu reste sous les doigts (dérive " + r2.derive + " px)", r2);
    verifier(r2.verrou, "drag Leaflet verrouillé (pan refait dans le bon repère)", r2);

    // Pan à un doigt (souris) : la carte suit le doigt malgré la rotation.
    const p0 = await page.evaluate(function () {
      const c = window.__rm.centre();
      window.__rmLL = window.__rm.sousEcran(c.x, c.y);
      return c;
    });
    await page.mouse.move(p0.x, p0.y);
    await page.mouse.down();
    await page.mouse.move(p0.x + 150, p0.y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const pan = await page.evaluate(function () {
      const e = window.__rm.versEcran(window.__rmLL), c = window.__rm.centre();
      return { dx: Math.round(e.x - c.x), dy: Math.round(e.y - c.y) };
    });
    verifier(Math.abs(pan.dx - 150) < 8 && Math.abs(pan.dy) < 8, "pan au doigt sous rotation : la carte suit (" +
      pan.dx + ", " + pan.dy + " px pour 150, 0)", pan);

    // ── R3 — bouton nord ──
    console.log("— R3 : bouton nord —");
    const btn = await page.evaluate(function () {
      const a = document.querySelector(".kta-nord-ctrl .kta-nord-btn");
      const r = a.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x: x, y: y, w: r.width, h: r.height, touche: !!(hit && a.contains(hit)), titre: a.title,
               angleAiguille: Math.round(window.__rm.angleCumule(a.querySelector(".kta-nord-picto"))) };
    });
    verifier(btn.touche, "le bouton nord est le premier élément sous le doigt (" + btn.w + " × " + btn.h + " px)", btn);
    verifier(Math.abs(btn.angleAiguille - Math.round(r2.b)) <= 1, "l'aiguille montre le haut du plan (" +
      btn.angleAiguille + "° pour une vue à " + r2.b.toFixed(1) + "°)", btn);
    inf("libellé : « " + btn.titre + " »");
    await page.mouse.click(btn.x, btn.y);
    await page.waitForTimeout(150);
    const r3mi = await page.evaluate(function () { return window.__rm.angle(); });
    await page.waitForTimeout(450);
    const r3 = await page.evaluate(function () {
      return { b: window.MapBearing.getBearing(), src: window.MapBearing.getSource(), nord: window.__rm.nordVisible(),
               drag: !!(window.map.dragging && window.map.dragging.enabled()),
               transform: document.querySelector(".kta-rotate-pane").style.transform };
    });
    verifier(Math.abs(r3mi) > 0.5 && Math.abs(r3mi) < Math.abs(r2.b), "retour animé (" + r3mi.toFixed(1) +
      "° à 150 ms)", r3mi);
    verifier(r3.b === 0 && r3.src === null && !r3.nord && r3.drag && !r3.transform,
      "carte droite en moins de 600 ms, bouton masqué, drag rendu", r3);
    // prefers-reduced-motion : retour immédiat.
    await page.emulateMedia({ reducedMotion: "reduce" });
    const r3b = await page.evaluate(function () {
      window.MapBearing.setManuel(80);
      window.MapBearing.remettreNord();
      return window.MapBearing.getBearing();
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    verifier(r3b === 0, "mouvement réduit : la carte se redresse sans animation", r3b);

    // ── R4 — outil armé ──
    console.log("— R4 : outil armé —");
    const r4 = await page.evaluate(async function () {
      window.MapBearing.setManuel(60);
      const avant = window.__rm.angle();
      window.modeMesure = true;
      await window.__rm.attente(400);
      const arme = window.MapBearing.getBearing();
      const c = window.__rm.centre();
      await window.__rm.geste({ cx: c.x, cy: c.y, d0: 200, d1: 200, a0: 0, a1: 70 });
      const apresGeste = window.MapBearing.getBearing();
      const parCode = window.MapBearing.setManuel(30);
      window.modeMesure = false;
      await window.__rm.attente(400);
      const desarme = window.MapBearing.getBearing();
      // Picker réel (floater .kta-iti-floater), fermé par Échap.
      window.MapBearing.setManuel(40);
      window.ktaDemanderPositionCarte(function () {});
      await window.__rm.attente(400);
      const picker = window.MapBearing.getBearing();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await window.__rm.attente(200);
      return { avant: avant, arme: arme, apresGeste: apresGeste, parCode: parCode, desarme: desarme, picker: picker,
               floaterParti: !document.getElementById("kta-pos-floater") };
    });
    verifier(Math.abs(r4.avant) > 50 && r4.arme === 0, "mesure armée : la carte se redresse (était à " +
      Math.round(r4.avant) + "°)", r4);
    verifier(r4.apresGeste === 0 && r4.parCode === false, "outil armé : rotation à deux doigts refusée", r4);
    verifier(r4.desarme === 0, "outil désarmé : la carte reste droite (aucun retour à l'angle d'avant)", r4);
    verifier(r4.picker === 0, "choix d'une position sur la carte (picker) : carte droite", r4);
    if (!r4.floaterParti) inf("le picker n'a pas été fermé par Échap");

    // ── R5 — toucher d'un POI et d'une structure sous rotation ──
    console.log("— R5 : fiches au toucher sous rotation —");
    const prepa = await page.evaluate(async function () {
      window.map.closePopup();
      window.map.setZoom(0, { animate: false });
      await window.__rm.attente(400);
      // Un POI du plan amené à 120 px du centre : la rotation le déplace à l'écran.
      let cible = null;
      window.map.eachLayer(function (l) {
        if (!cible && l instanceof L.Marker && l._ktaNom && l.getPopup()) cible = l;
      });
      if (cible) {
        const pc = window.map.latLngToContainerPoint(cible.getLatLng());
        window.map.panBy([pc.x - window.map.getSize().x / 2 + 120, pc.y - window.map.getSize().y / 2], { animate: false });
        await window.__rm.attente(400);
      }
      // Pilier de session décalé du centre (la rotation le déplace à l'écran), avec une note.
      const c = window.map.getCenter();
      const H = window.PLAN_CONFIG.plan.imageHeight;
      const x = Math.round(c.lng) + 140, y = Math.round(H - c.lat) - 60;
      if (window.APP_CONFIG.multiLevel === true) window.APP_CONFIG.activeLevel = 0;
      window.setStructures([{ uid: "st_rm_pilier", type: "pilier-1", level: 0, description: "Pilier du checkup RM",
        points: [{ x: x - 25, y: y - 25 }, { x: x + 25, y: y - 25 }, { x: x + 25, y: y + 25 }, { x: x - 25, y: y + 25 }] }]);
      window.renderStructures();
      window.__rmPilier = window.convertCoord(x, y);
      window.MapBearing.setManuel(70);
      await window.__rm.attente(300);
      const cr = window.map.getContainer().getBoundingClientRect();
      let poi = null;
      window.map.eachLayer(function (l) {
        if (poi || !(l instanceof L.Marker) || !l._ktaNom || !l.getPopup()) return;
        const el = l.getElement();
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
        if (x0 < cr.left + 80 || x0 > cr.right - 80 || y0 < cr.top + 80 || y0 > cr.bottom - 80) return;
        const hit = document.elementFromPoint(x0, y0);
        if (!hit || !el.contains(hit)) return;
        poi = { x: x0, y: y0, nom: l._ktaNom };
      });
      const ps = window.__rm.versEcran(window.__rmPilier);
      // Contre-essai : là où Leaflet le croirait sans la rotation.
      const brut = window.map.latLngToContainerPoint(window.__rmPilier);
      return { poi: poi, pilier: ps, fantome: { x: cr.left + brut.x, y: cr.top + brut.y },
               b: window.__rm.angle() };
    });
    if (!prepa.poi) pb("aucun POI touchable à l'écran : R5 ne prouve rien pour les POI");
    else {
      await page.mouse.click(prepa.poi.x, prepa.poi.y);
      await page.waitForTimeout(500);
      const f = await page.evaluate(function () {
        const p = document.querySelector(".leaflet-popup");
        const croix = p && p.querySelector(".leaflet-popup-close-button");
        const corps = p && p.querySelector(".leaflet-popup-content-wrapper");
        return { texte: p ? p.textContent : "", angle: corps ? Math.round(window.__rm.angleCumule(corps)) : null,
                 croix: croix ? Math.round(window.__rm.angleCumule(croix)) : null,
                 b: window.__rm.angle() };
      });
      verifier(f.texte.indexOf(prepa.poi.nom) >= 0, "toucher du POI « " + prepa.poi.nom + " » → sa fiche", f.texte.slice(0, 80));
      // ── R6 — popup droite ──
      verifier(f.angle !== null && Math.abs(f.angle) <= 1 && Math.abs(f.croix) <= 1,
        "R6 : fiche et croix droites sous une vue à " + Math.round(f.b) + "°", f);
      const jsi = await page.evaluate(function () {
        const p = document.querySelector(".leaflet-popup");
        const b = p && Array.from(p.querySelectorAll("button, a")).find(function (x) {
          return /Je suis ici|I am here|Estoy aquí/i.test(x.textContent || "");
        });
        const y = p && Array.from(p.querySelectorAll("button, a")).find(function (x) {
          return /Y aller|Go there|Ir allí/i.test(x.textContent || "");
        });
        const pt = function (el) {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2, hit = document.elementFromPoint(x0, y0);
          return { x: x0, y: y0, touche: !!(hit && el.contains(hit)) };
        };
        return { jeSuisIci: pt(b), yAller: pt(y) };
      });
      if (jsi.jeSuisIci) verifier(jsi.jeSuisIci.touche, "« 📍 Je suis ici » touchable dans la fiche tournée", jsi);
      else inf("pas de « Je suis ici » dans cette fiche");
      if (jsi.yAller) verifier(jsi.yAller.touche, "« 🧭 Y aller » touchable dans la fiche tournée", jsi);
      else inf("pas de « Y aller » dans cette fiche");
      if (jsi.jeSuisIci && jsi.jeSuisIci.touche) {
        await page.mouse.click(jsi.jeSuisIci.x, jsi.jeSuisIci.y);
        await page.waitForTimeout(600);
        const apresJsi = await page.evaluate(function () {
          const pos = window.getTrackingPosition ? window.getTrackingPosition() : null;
          return { pos: pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : null, b: window.__rm.angle() };
        });
        verifier(!!apresJsi.pos, "« Je suis ici » sous rotation : position posée", apresJsi);
        await page.keyboard.press("Escape");
      }
    }
    await page.evaluate(async function () {
      window.map.closePopup();
      document.querySelectorAll(".kta-readme-modal-overlay").forEach(function (o) { o.remove(); });
      if (Math.abs(window.__rm.angle() - 70) > 0.5) window.MapBearing.setManuel(70);
      await window.__rm.attente(200);
    });
    const ps = await page.evaluate(function () {
      const p = window.__rm.versEcran(window.__rmPilier);
      const h = document.elementFromPoint(p.x, p.y);
      p.sous = h ? (h.tagName + "." + (h.className && h.className.baseVal !== undefined ? h.className.baseVal : h.className)) : null;
      return p;
    });
    await page.mouse.click(ps.x, ps.y);
    await page.waitForTimeout(500);
    const fs1 = await page.evaluate(function () {
      const p = document.querySelector(".leaflet-popup");
      const t = p ? p.textContent + " " + Array.from(p.querySelectorAll("textarea")).map(function (x) { return x.value; }).join(" ") : "";
      window.map.closePopup();
      return t;
    });
    verifier(/Pilier du checkup RM/.test(fs1), "toucher du pilier là où il est VISIBLE → sa fiche", { fiche: fs1.slice(0, 80), ps: ps, sous: ps.sous });
    const fantome = await page.evaluate(function () { return window.__rm.versEcran(window.__rmPilier); });
    if (Math.hypot(fantome.x - prepa.fantome.x, fantome.y - prepa.fantome.y) > 60) {
      await page.mouse.click(prepa.fantome.x, prepa.fantome.y);
      await page.waitForTimeout(400);
      const fs2 = await page.evaluate(function () {
        const p = document.querySelector(".leaflet-popup");
        const t = p ? p.textContent + " " + Array.from(p.querySelectorAll("textarea")).map(function (x) { return x.value; }).join(" ") : "";
        window.map.closePopup();
        return t;
      });
      verifier(!/Pilier du checkup RM/.test(fs2), "contre-essai : toucher sa place « à plat » n'ouvre pas sa fiche", fs2.slice(0, 80));
    }

    // ── R7 — Maj + molette ──
    console.log("— R7 : Maj + molette (PC) —");
    await page.evaluate(function () { window.MapBearing.reset(); });
    const cM = await page.evaluate(function () { return window.__rm.centre(); });
    const z7 = await page.evaluate(function () { return window.map.getZoom(); });
    await page.mouse.move(cM.x + 100, cM.y + 50);
    await page.keyboard.down("Shift");
    for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(60); }
    await page.keyboard.up("Shift");
    await page.waitForTimeout(600);
    const r7 = await page.evaluate(function () {
      return { b: window.__rm.angle(), src: window.MapBearing.getSource(), z: window.map.getZoom() };
    });
    verifier(Math.abs(r7.b) > 30 && r7.src === "manuel", "Maj + molette tourne la vue (" + r7.b.toFixed(1) + "°)", r7);
    verifier(r7.z === z7, "…sans zoomer (" + z7 + " → " + r7.z + ")", r7);

    // ── R8 — exports PNG / PDF ──
    console.log("— R8 : exports (PNG, et PDF qui reprend son canvas) —");
    const r8 = await page.evaluate(async function () {
      const empreinte = async function () {
        const cv = await window.MyKTAMapExporterGenererCanvas({ scale: 0.25, ann: { points: true, roads: true, zones: true, structures: true } });
        const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
        let h = 0;
        for (let i = 0; i < d.length; i += 16) h = (h * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) % 1000000007;
        return { w: cv.width, h: cv.height, e: h };
      };
      window.MapBearing.setManuel(45);
      const tourne = await empreinte();
      const b = window.__rm.angle();
      window.MapBearing.reset();
      const droit = await empreinte();
      return { tourne: tourne, droit: droit, b: b };
    });
    verifier(Math.abs(r8.b) > 40 && r8.tourne.w === r8.droit.w && r8.tourne.h === r8.droit.h &&
      r8.tourne.e === r8.droit.e, "export sous une vue à " + Math.round(r8.b) + "° = export à plat, au pixel près (" +
      r8.droit.w + " × " + r8.droit.h + ") : le plan sort droit", r8);

    // ── R9 — mode plein écran ──
    console.log("— R9 : mode plein écran (Je suis perdu) —");
    const r9 = await page.evaluate(async function () {
      if (!window.LostMode) return { skip: true };
      window.MapBearing.setManuel(50);
      window.LostMode.open();
      await window.__rm.attente(400);
      const pendant = window.MapBearing.getBearing();
      try { window.LostMode.close(); } catch (e) {}
      await window.__rm.attente(400);
      return { pendant: pendant, apres: window.MapBearing.getBearing(), src: window.MapBearing.getSource() };
    });
    if (r9.skip) inf("LostMode indisponible — R9 sauté");
    else verifier(r9.pendant === 0 && r9.apres === 0, "plein écran : vue droite, et droite à la fermeture", r9);

    // ── R10 — vue 3D aller-retour ──
    console.log("— R10 : vue 3D aller-retour —");
    const r10 = await page.evaluate(async function () {
      window.MapBearing.setManuel(35);
      const a = document.querySelector(".kta-vue3d-ctrl a");
      if (!a || a.classList.contains("kta-inactif")) return { skip: "bouton 3D inactif sur ce plan" };
      a.click();
      for (let i = 0; i < 80 && !(window.KtaVue3D && window.KtaVue3D.etat && window.KtaVue3D.etat().ouvert); i++) {
        await window.__rm.attente(250);
      }
      const ouverte = !!(window.KtaVue3D && window.KtaVue3D.etat && window.KtaVue3D.etat().ouvert);
      const pendant = window.__rm.angle();
      if (ouverte) await window.KtaVue3D.fermer();
      await window.__rm.attente(600);
      return { ouverte: ouverte, pendant: pendant, apres: window.__rm.angle(), src: window.MapBearing.getSource(),
               nord: window.__rm.nordVisible() };
    });
    if (r10.skip) inf("R10 sauté : " + r10.skip);
    else if (!r10.ouverte) inf("la vue 3D ne s'est pas ouverte dans ce navigateur (WebGL ?) — R10 sauté");
    else verifier(Math.abs(r10.apres - 35) < 0.5 && r10.src === "manuel" && r10.nord,
      "retour de la 3D : la carte 2D garde son angle manuel (la 3D a son propre cap)", r10);

    // ── R11 — le plan orienté reprend la main ──
    console.log("— R11 : plan orienté (tracker + réglage) —");
    const r11 = await page.evaluate(async function () {
      window.MapBearing.setManuel(50);
      window.MapBearing.setEnabled(true);
      if (!window.getTrackingActif()) window.startTracking();
      for (let i = 0; i < 60; i++) {
        window.MapBearing.onStep(window.map.getCenter());
        window.MapBearing.onHeading(90);
        await window.__rm.attente(40);
        if (Math.abs(window.MapBearing.getBearing() - 270) < 1) break;
      }
      const cap = { b: window.MapBearing.getBearing(), src: window.MapBearing.getSource(), nord: window.__rm.nordVisible() };
      const c = window.__rm.centre();
      await window.__rm.geste({ cx: c.x, cy: c.y, d0: 200, d1: 200, a0: 0, a1: 60 });
      const apresGeste = { b: window.MapBearing.getBearing(), src: window.MapBearing.getSource() };
      window.stopTracking();
      await window.__rm.attente(200);
      const arret = { b: window.MapBearing.getBearing(), src: window.MapBearing.getSource(),
                      drag: !!(window.map.dragging && window.map.dragging.enabled()) };
      window.MapBearing.setEnabled(false);
      return { cap: cap, apresGeste: apresGeste, arret: arret };
    });
    verifier(Math.abs(r11.cap.b - 270) < 1.5 && r11.cap.src === "cap" && !r11.cap.nord,
      "le cap du téléphone prend la main sur l'angle manuel (vue à " + r11.cap.b.toFixed(1) + "°, bouton nord masqué)", r11.cap);
    verifier(r11.apresGeste.src === "cap" && Math.abs(r11.apresGeste.b - r11.cap.b) < 3,
      "deux doigts ne font pas tourner une vue tenue par le cap", r11.apresGeste);
    verifier(r11.arret.b === 0 && r11.arret.src === null && r11.arret.drag,
      "à l'arrêt du suivi, la carte revient au nord (pas à l'ancien angle manuel)", r11.arret);

    // ── R12 — changement de plan ──
    console.log("— R12 : changement de plan —");
    await page.evaluate(function () {
      window.MapBearing.setManuel(65);
      window.__rmAvant = window.map;
      const p = window.PlanRegistry.getAll().find(function (x) { return /fictif/i.test(x.name || ""); });
      window.chargerPlanDuRegistre(p.id);
    });
    await attendre(page, function () { return !!window.map && window.map !== window.__rmAvant && !!window.PLAN_CONFIG; }, 30000);
    await page.waitForTimeout(2500);
    const r12 = await page.evaluate(function () {
      return { b: window.MapBearing.getBearing(), src: window.MapBearing.getSource(), nord: window.__rm.nordVisible(),
               drag: !!(window.map.dragging && window.map.dragging.enabled()) };
    });
    verifier(r12.b === 0 && r12.src === null && !r12.nord && r12.drag, "nouveau plan : angle remis à 0, bouton nord absent", r12);
    // Écouteurs non empilés : le conteneur est persistant, un geste ne tourne pas deux fois.
    const r12b = await page.evaluate(async function () {
      const c = window.__rm.centre();
      await window.__rm.geste({ cx: c.x, cy: c.y, d0: 200, d1: 200, a0: 0, a1: 44, n: 8 });
      const b = window.__rm.angle();
      window.MapBearing.reset();
      return b;
    });
    verifier(Math.abs(r12b - (44 - franchi(44, 8, seuil))) < 1, "après le changement de plan, un geste de 44° tourne de " + r12b.toFixed(1) +
      "° (écouteurs non empilés)", r12b);

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } finally {
    await ctx.close();
  }

  // ── R13 — bouton nord en bas à gauche, sans chevauchement, barre 2D entière ──
  // Trois états par format : seul, boussole 2D ouverte avec un toast témoin, mode Présentation. Paysage bas : la
  // boussole est centrée, le bouton ne s'empile pas sur elle.
  console.log("— R13 : bouton nord et barre 2D aux quatre formats —");
  const formats = [
    { nom: "portrait 393 × 852", viewport: { width: 393, height: 852 }, paysageBas: false },
    { nom: "portrait 430 × 932", viewport: { width: 430, height: 932 }, paysageBas: false },
    { nom: "paysage 852 × 393", viewport: { width: 852, height: 393 }, paysageBas: true },
    { nom: "PC 1366 × 768", viewport: { width: 1366, height: 768 }, paysageBas: false }
  ];
  for (const f of formats) {
    const o = await ouvrirPlan(nav, { viewport: f.viewport });
    try {
      for (const etat of ["seul", "boussole", "présentation"]) {
        const m = await o.page.evaluate(async function (etat) {
          if (etat === "boussole") {
            window.CompassWidget.show();
            window.OOMGuard.showToast("Toast témoin du checkup", "success");
          }
          if (etat === "présentation") { window.CompassWidget.hide(); window.PresentationMode.activate(); }
          window.MapBearing.setManuel(30);
          await window.__rm.attente(450);   // transition de 0,2 s du bouton, toast posé
          const ctrl = document.querySelector(".kta-nord-ctrl");
          const b = ctrl && ctrl.querySelector(".kta-nord-btn");
          const r = b ? b.getBoundingClientRect() : null;
          const res = { visible: window.__rm.nordVisible(), touche: false, chevauche: [], w: 0, h: 0 };
          if (!r) return res;
          res.w = Math.round(r.width); res.h = Math.round(r.height);
          res.rect = [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
          res.dansBarreDroite = !!ctrl.closest(".leaflet-top.leaflet-right");
          res.basGauche = r.left + r.width / 2 < innerWidth / 2 && r.top + r.height / 2 > innerHeight / 2;
          res.dansEcran = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          res.touche = !!(hit && b.contains(hit));
          const inter = function (q) {
            return !(q.right <= r.left + 0.5 || q.left >= r.right - 0.5 || q.bottom <= r.top + 0.5 || q.top >= r.bottom - 0.5);
          };
          document.querySelectorAll(".leaflet-top .leaflet-control, .leaflet-control a, .leaflet-control button, " +
                                    ".kta-refonte-header, #kta-refonte-statusbar, .kta-compass-widget, " +
                                    ".kta-bearing-recentrer, .kta-toast, .kta-presentation-exit-btn, " +
                                    ".leaflet-control-scale, .leaflet-control-attribution").forEach(function (el) {
            if (ctrl.contains(el)) return;
            const q = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (!q.width || !q.height || cs.visibility === "hidden" || cs.display === "none") return;
            if (inter(q)) res.chevauche.push(el.className || el.id);
          });
          res.toasts = document.querySelectorAll(".kta-toast").length;
          const bou = document.querySelector(".kta-compass-widget");
          const rb = bou && bou.getBoundingClientRect();
          res.boussole = rb && rb.width ? { haut: Math.round(rb.top), gauche: Math.round(rb.left) } : null;
          // Barre 2D : chaque bouton entier dans sa pilule (bas non coupé), hauteurs des pilules de droite.
          const coupes = [];
          document.querySelectorAll(".leaflet-top .leaflet-bar").forEach(function (bar) {
            const rbar = bar.getBoundingClientRect();
            if (!rbar.width || !rbar.height) return;
            bar.querySelectorAll("a").forEach(function (x) {
              const q = x.getBoundingClientRect();
              if (!q.width || !q.height) return;
              if (q.bottom > rbar.bottom + 0.5 || q.top < rbar.top - 0.5) {
                coupes.push((bar.className.match(/kta-[\w-]+/) || ["?"])[0] + " " + Math.round(q.height) + "/" + Math.round(rbar.height));
              }
            });
          });
          res.coupes = coupes;
          res.pilulesDroite = [].map.call(document.querySelectorAll(".leaflet-top.leaflet-right > .leaflet-control"),
            function (p) { return Math.round(p.getBoundingClientRect().height * 10) / 10; })
            .filter(function (h) { return h > 0; });
          if (etat === "présentation") window.PresentationMode.deactivate();
          return res;
        }, etat);
        const nom = f.nom + ", " + etat;
        verifier(m.visible && m.touche && m.dansEcran && m.chevauche.length === 0, nom + " : bouton nord " + m.w +
          " × " + m.h + " px " + JSON.stringify(m.rect) + ", touchable, sans chevauchement", m);
        verifier(m.basGauche && !m.dansBarreDroite, nom + " : en bas à gauche, hors de la barre de droite", m);
        if (etat === "boussole") {
          verifier(m.toasts > 0, nom + " : un toast affiché pendant la mesure (témoin)", m.toasts);
          if (f.paysageBas) {
            verifier(!!m.boussole, nom + " : boussole centrée, bouton au coin", m.boussole);
          } else {
            verifier(!!m.boussole && m.rect[3] <= m.boussole.haut - 4 && m.rect[0] === m.boussole.gauche,
              nom + " : posé au-dessus de la boussole, aligné à gauche", { nord: m.rect, boussole: m.boussole });
          }
        }
        if (etat === "seul") {
          verifier(m.coupes.length === 0, f.nom + " : boutons de la barre 2D entiers", m.coupes);
          if (f.paysageBas) {
            verifier(m.pilulesDroite.length === 10 && m.pilulesDroite.every(function (h) { return h >= 30; }),
              f.nom + " : 10 pilules de 30 px dans la barre de droite", m.pilulesDroite);
          }
        }
      }
    } finally {
      await o.ctx.close();
    }
  }

  // ── R14 — vrai geste tactile (Chromium, CDP) ──
  if (nomMoteur !== "chromium") { inf("R14 (geste CDP) : Chromium seul"); return; }
  console.log("— R14 : vrai geste tactile (CDP, téléphone 430 × 932) —");
  const t = await ouvrirPlan(nav, { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3,
                                    hasTouch: true, isMobile: true });
  try {
    const cdp = await t.ctx.newCDPSession(t.page);
    const tordre = async function (cx, cy, d, a1) {
      const pts = function (a) {
        const r = a * Math.PI / 180, ux = Math.cos(r) * d / 2, uy = Math.sin(r) * d / 2;
        return [[cx - ux, cy - uy], [cx + ux, cy + uy]];
      };
      const env = function (type, ps) {
        return cdp.send("Input.dispatchTouchEvent", { type: type, touchPoints: ps.map(function (p, i) {
          return { x: p[0], y: p[1], id: i, radiusX: 12, radiusY: 12, force: 1 };
        }) });
      };
      await env("touchStart", pts(0));
      for (let i = 1; i <= 12; i++) { await env("touchMove", pts(a1 * i / 12)); await t.page.waitForTimeout(30); }
      await env("touchEnd", []);
      await t.page.waitForTimeout(700);
    };
    await tordre(215, 600, 180, 8);
    const sous = await t.page.evaluate(function () { return window.__rm.angle(); });
    verifier(Math.abs(sous) < 0.01, "vrai toucher, 8° de torsion : pas de rotation", sous);
    await tordre(215, 600, 180, 50);
    const sur = await t.page.evaluate(function () { return { b: window.__rm.angle(), nord: window.__rm.nordVisible() }; });
    verifier(Math.abs(sur.b - (50 - franchi(50, 12, 15))) < 2 && sur.nord, "vrai toucher, 50° de torsion : vue à " + sur.b.toFixed(1) + "°", sur);
    const n = await t.page.evaluate(function () {
      const r = document.querySelector(".kta-nord-ctrl .kta-nord-btn").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await t.page.touchscreen.tap(n.x, n.y);
    await t.page.waitForTimeout(700);
    const fin = await t.page.evaluate(function () { return window.MapBearing.getBearing(); });
    verifier(fin === 0, "un toucher du bouton nord remet la carte droite", fin);
    verifier(t.erreurs.length === 0, "aucune erreur de page (tactile)", t.erreurs.slice(0, 3));
  } finally {
    await t.ctx.close();
  }
}

(async function main() {
  const liste = lancerNavigateur.moteurs();
  try {
    for (const nom of liste) {
      moteurCourant = nom;
      console.log("\n══ Moteur : " + nom + " ══");
      const nav = await lancerNavigateur.lancerMoteur(nom);
      if (!nav) { pb("moteur absent : rien n'a été vérifié"); continue; }
      try { await suite(nav, nom); }
      catch (e) { pb("exception du harnais : " + (e && e.message)); }
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
  console.log("🎉 CHECKUP VERT — rotation manuelle : geste, bouton nord, outils, fiches, exports, plan orienté, barre 2D.");
  process.exit(0);
})();
