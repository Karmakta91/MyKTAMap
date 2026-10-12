#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🧭 checkup-plan-oriente.js — checkup de RELEASE (pas un hook pré-commit)
// =====================================================================
// Vérifie le mode « plan orienté » (js/mapBearing.js) DANS L'APP RÉELLE, sur
// le plan de test, parce que tout ce qui casse ici casse en silence : une vue
// tournée ne lève aucune erreur, elle affiche simplement les choses au
// mauvais endroit.
//
// 🩸 CE QUE LE PROTOTYPE A APPRIS, ET QUE CE CHECKUP FIGE :
// poser la rotation sur `.leaflet-map-pane` SEMBLE marcher — tant que la
// carte n'a jamais été panée. Le map-pane porte le `translate3d` de Leaflet,
// et une rotation posée dessus fait pivoter ce vecteur de translation :
// 918 px d'erreur à 45° après un simple pan. D'où le pane INTERCALAIRE, et
// d'où le test T1 ci-dessous qui pane AVANT de mesurer. Sans ce pan, le test
// passerait au vert avec l'implémentation fausse.
//
// Même piège pour la contre-rotation des textes : elle doit se poser sur un
// ENFANT, jamais sur l'élément que Leaflet positionne (forcer
// `transform-origin: center` ne suffit PAS — 436 px de dérive mesurés).
//
// CE QUI EST VÉRIFIÉ :
//   T0. mode OFF par défaut → la vue ne tourne pas, rien n'est verrouillé
//   T1. géométrie exacte après pan (le cas qui a cassé la 1re implémentation)
//   T2. les contrôles Leaflet restent droits
//   T3. les textes (labels de mesure) sont contre-tournés sans dériver
//   T4. un mode « clic carte » (mesure) redresse la vue
//   T5. un mode plein écran (Mode perdu) redresse la vue
//   T6. arrêt du tracking → vue droite ET interactions rendues
//   T20. changement de plan SANS couper le suivi → le bouton « Recentrer » disparaît
//   T7. le culling s'élargit quand la vue tourne
//
// Usage : node scripts/smoke/checkup-plan-oriente.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");


const BASE = "http://127.0.0.1:8123";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

// 🩸 Le checkup ouvrait « Relevé fictif de test » par son nom. Quand
// `data/index.json` pointe ailleurs — ce qui arrive dès qu'on pose un plan
// réel en local pour enquêter — tout le harnais tombe en timeout opaque.
// On lit donc l'index, et on ouvre ce qui y est, en le disant.
function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test",
             fictif: !!fictif };
  } catch (e) {
    return { nom: "Relevé fictif de test", fictif: true };
  }
}

const PLAN = planAOuvrir();
const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg)  { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }

(async function main() {
  let nav;
  nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1100, height: 800 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);

  try {
    // ── Boot + chargement du plan de test ──────────────────────────────
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () {
      const b = document.getElementById("kta-alert-ok");
      if (b) b.click();
    });
    await page.getByText(PLAN.nom, { exact: false }).first().click();
    await attendre(page, function () {
      return !!window.PLAN_CONFIG && !!window.map && !!window.MapBearing;
    }, 20000);
    await page.waitForTimeout(2500);
    ok("plan chargé (« " + PLAN.nom + " »), MapBearing présent");
    if (!PLAN.fictif) {
      inf("⚠️ le relevé fictif n'est pas dans data/index.json — ce checkup tourne " +
          "sur « " + PLAN.nom + " ». Les autres harnais du dépôt, eux, le cherchent par son nom " +
          "et tomberont en timeout tant que l'index pointe ailleurs.");
    }

    // Helpers injectés : mesure de la position écran d'un latlng, et
    // prédiction par le modèle (rotation du containerPoint autour du centre).
    await page.evaluate(function () {
      window.__mb = {
        // Marqueur témoin planté au centre de la vue courante.
        planter: function () {
          if (window.__mbMarker) { try { window.map.removeLayer(window.__mbMarker); } catch (e) {} }
          const ll = window.map.getCenter();
          window.__mbLL = ll;
          window.__mbMarker = L.marker(ll, {
            icon: L.divIcon({ className: "mb-probe", iconSize: [12, 12], iconAnchor: [6, 6], html: "<i></i>" })
          }).addTo(window.map);
        },
        reel: function () {
          const r = window.__mbMarker.getElement().getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2];
        },
        predit: function () {
          const p = window.map.latLngToContainerPoint(window.__mbLL);
          const cr = window.map.getContainer().getBoundingClientRect();
          const a = window.MapBearing.getBearing() * Math.PI / 180;
          const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
          const dx = cr.left + p.x - cx, dy = cr.top + p.y - cy;
          return [dx * Math.cos(a) - dy * Math.sin(a) + cx, dx * Math.sin(a) + dy * Math.cos(a) + cy];
        },
        // Amène la vue à un cap donné : le mode exige des PAS récents (gel à
        // l'arrêt), d'où l'appel à onStep avant chaque cap.
        viser: async function (cap) {
          for (let i = 0; i < 40; i++) {
            window.MapBearing.onStep(window.map.getCenter());
            window.MapBearing.onHeading(cap);
            await new Promise(function (r) { setTimeout(r, 50); });
            if (Math.abs(window.MapBearing.getBearing() - ((-cap % 360) + 360) % 360) < 1) break;
          }
          return window.MapBearing.getBearing();
        }
      };
    });
    const dist = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); };

    // ── T0 — OFF par défaut ────────────────────────────────────────────
    console.log("— T0 : état par défaut —");
    const t0 = await page.evaluate(function () {
      return {
        enabled: window.MapBearing.isEnabled(),
        bearing: window.MapBearing.getBearing(),
        pane: !!document.querySelector(".kta-rotate-pane"),
        paneAEnfants: !!document.querySelector(".kta-rotate-pane .leaflet-map-pane, .kta-rotate-pane .leaflet-tile-pane, .kta-rotate-pane .leaflet-overlay-pane"),
        dragging: !!(window.map.dragging && window.map.dragging.enabled()),
        transform: (document.querySelector(".kta-rotate-pane") || {}).style ?
                    document.querySelector(".kta-rotate-pane").style.transform : "?"
      };
    });
    if (t0.enabled === false) ok("mode OFF par défaut"); else pb("le mode est ON par défaut");
    if (t0.pane && t0.paneAEnfants) ok("pane de rotation en place, panes Leaflet à l'intérieur");
    else pb("pane de rotation absent ou vide (" + JSON.stringify(t0) + ")");
    if (!t0.transform) ok("aucune rotation appliquée au repos");
    else pb("transform déjà posé au repos : " + t0.transform);
    if (t0.dragging) ok("carte manipulable normalement (mode OFF)");
    else pb("le drag est désactivé alors que le mode est OFF");

    // ── T1 — géométrie après PAN (le cas qui a cassé la 1re version) ───
    console.log("— T1 : géométrie, APRÈS un pan —");
    await page.evaluate(function () {
      window.MapBearing.setEnabled(true);
      window.startTracking();
      window.map.panBy([260, -180], { animate: false });
    });
    await page.waitForTimeout(400);
    await page.evaluate(function () { window.__mb.planter(); });
    let pire = 0;
    for (const cap of [30, 90, 200]) {
      const b = await page.evaluate(function (c) { return window.__mb.viser(c); }, cap);
      const r = await page.evaluate(function () { return window.__mb.reel(); });
      const p = await page.evaluate(function () { return window.__mb.predit(); });
      const e = dist(r, p);
      pire = Math.max(pire, e);
      inf("cap " + cap + "° → vue à " + b.toFixed(1) + "° — écart modèle/réel " + e.toFixed(2) + " px");
    }
    if (pire < 1.5) ok("géométrie exacte après pan (écart max " + pire.toFixed(2) + " px)");
    else pb("géométrie fausse après pan : écart max " + pire.toFixed(2) + " px");

    // ── T2 — contrôles droits ──────────────────────────────────────────
    console.log("— T2 : contrôles Leaflet —");
    const t2 = await page.evaluate(function () {
      const el = document.querySelector(".leaflet-control-container .leaflet-top");
      if (!el) return null;
      const cs = getComputedStyle(el);
      const m = new DOMMatrix(cs.transform === "none" ? "" : cs.transform);
      return { angle: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI * 10) / 10 };
    });
    if (t2 && Math.abs(t2.angle) < 0.1) ok("les contrôles restent droits (0°)");
    else pb("contrôles affectés par la rotation : " + JSON.stringify(t2));

    // ── T3 — contre-rotation des textes ────────────────────────────────
    console.log("— T3 : contre-rotation des textes —");
    const t3 = await page.evaluate(function () {
      // Label de mesure factice, même structure que measure.js (wrapper
      // positionné par Leaflet + enfant porteur du texte).
      const m = L.marker(window.map.getCenter(), {
        icon: L.divIcon({ className: "kta-measure-seg-label-wrap",
                          html: '<div class="kta-measure-seg-label">12,3 m</div>',
                          iconSize: null, iconAnchor: [0, 0] }),
        interactive: false
      }).addTo(window.map);
      const wrap = m.getElement();
      const lbl = wrap.querySelector(".kta-measure-seg-label");
      const avant = wrap.getBoundingClientRect();
      const cs = getComputedStyle(lbl);
      const mm = new DOMMatrix(cs.transform === "none" ? "" : cs.transform);
      const angleLabel = Math.round(Math.atan2(mm.b, mm.a) * 180 / Math.PI * 10) / 10;
      const apres = wrap.getBoundingClientRect();
      window.map.removeLayer(m);
      return {
        angleLabel: angleLabel,
        bearing: Math.round(window.MapBearing.getBearing() * 10) / 10,
        derive: Math.hypot(avant.left - apres.left, avant.top - apres.top)
      };
    });
    const attendu = -((t3.bearing % 360) + 360) % 360;
    const ecartAngle = Math.abs(((t3.angleLabel - attendu) % 360 + 540) % 360 - 180);
    if (ecartAngle < 1.5 && t3.derive < 1.5)
      ok("label contre-tourné (" + t3.angleLabel + "° pour une vue à " + t3.bearing + "°), sans dérive");
    else pb("contre-rotation du texte incorrecte : " + JSON.stringify(t3));

    // ── T4 — mode « clic carte » ───────────────────────────────────────
    console.log("— T4 : un outil de dessin redresse la vue —");
    await page.evaluate(async function () {
      window.modeMesure = true;
      for (let i = 0; i < 40; i++) {
        window.MapBearing.onHeading(120);
        await new Promise(function (r) { setTimeout(r, 40); });
        if (Math.abs(window.MapBearing.getBearing()) < 0.5) break;
      }
    });
    const b4 = await page.evaluate(function () { window.modeMesure = false; return window.MapBearing.getBearing(); });
    if (Math.abs(b4) < 0.5) ok("vue redressée quand un mode clic-carte est armé");
    else pb("la vue reste tournée (" + b4.toFixed(1) + "°) alors qu'un mode clic-carte est armé");

    // ── T5 — mode plein écran ──────────────────────────────────────────
    console.log("— T5 : un mode plein écran redresse la vue —");
    const t5 = await page.evaluate(async function () {
      await window.__mb.viser(70);
      const avant = window.MapBearing.getBearing();
      if (!window.LostMode) return { skip: true };
      window.LostMode.open();
      for (let i = 0; i < 40; i++) {
        window.MapBearing.onStep(window.map.getCenter());
        window.MapBearing.onHeading(70);
        await new Promise(function (r) { setTimeout(r, 40); });
        if (Math.abs(window.MapBearing.getBearing()) < 0.5) break;
      }
      const apres = window.MapBearing.getBearing();
      try { window.LostMode.close(); } catch (e) {}
      return { avant: avant, apres: apres };
    });
    await page.waitForTimeout(400);
    if (t5.skip) inf("LostMode indisponible — test sauté");
    else if (Math.abs(t5.apres) < 0.5)
      ok("vue redressée à l'ouverture du Mode perdu (était à " + t5.avant.toFixed(1) + "°)");
    else pb("la vue reste tournée (" + t5.apres.toFixed(1) + "°) sous le Mode perdu");

    // ── T7 — culling élargi (avant l'arrêt du tracking) ────────────────
    // 🩸 v1.97.3 — ce test portait sur `padCull`, un facteur d'élargissement
    // scalaire. Il a été supprimé : une marge unique ne peut pas être juste à
    // tous les formats d'écran (cf T17). Ce qui compte n'est pas la valeur
    // d'un facteur, c'est que la zone retenue contienne VRAIMENT les quatre
    // coins de l'écran.
    console.log("— T7 : la zone de culling contient les 4 coins de l'écran —");
    const t7 = await page.evaluate(async function () {
      await window.__mb.viser(45);
      const map = window.map;
      const s = map.getSize(), cc = s.divideBy(2);
      const a = -window.MapBearing.getBearing() * Math.PI / 180;
      // Les latlng réellement affichés aux 4 coins (rotation inverse).
      const coins = [[0, 0], [s.x, 0], [s.x, s.y], [0, s.y]].map(function (p) {
        const dx = p[0] - cc.x, dy = p[1] - cc.y;
        return map.containerPointToLatLng(L.point(
          dx * Math.cos(a) - dy * Math.sin(a) + cc.x,
          dx * Math.sin(a) + dy * Math.cos(a) + cc.y));
      });
      const zone = window.MapBearing.zoneVisible(0);
      const brut = map.getBounds();
      // Hors rotation, zoneVisible doit rendre exactement getBounds().
      window.MapBearing.reset();
      const zPlat = window.MapBearing.zoneVisible(0), bPlat = map.getBounds();
      return {
        bearing: Math.round(window.MapBearing.getBearing()),
        parZone: coins.filter(function (ll) { return zone.contains(ll); }).length,
        parGetBounds: coins.filter(function (ll) { return brut.contains(ll); }).length,
        identiqueAPlat: zPlat.equals(bPlat)
      };
    });
    if (t7.parZone === 4) ok("zoneVisible() contient les 4 coins réels de l'écran");
    else pb("zoneVisible() en manque " + (4 - t7.parZone) + " sur 4");
    inf("à titre de comparaison, getBounds() n'en contenait que " + t7.parGetBounds +
        "/4 — c'est l'écart qui effaçait tracés et tuiles au bord");
    if (t7.identiqueAPlat) ok("hors rotation, zoneVisible() rend exactement getBounds()");
    else pb("zoneVisible() diverge de getBounds() alors que la vue est droite");

    // ── T10 — tourner SUR PLACE, et ne pas suivre le bruit ─────────────
    // 🩸 Retour terrain KARMA (24/09/2026) : « ça tourne, ça bugue et ça
    // s'arrête, puis ça reprend ». La v1 figeait la vue après 2,5 s sans pas
    // détecté ; en tournant sur place — ce qu'on fait justement pour se
    // réorienter — la vue restait bloquée **6,3 s** pendant que le cap
    // faisait 140°. Ce test interdit le retour de ce gel, sans pour autant
    // laisser le magnétomètre faire pivoter la carte à l'arrêt.
    console.log("— T10 : rotation sur place vs bruit à l'arrêt —");
    const t10 = await page.evaluate(async function () {
      // Sans requestPermission(), les écouteurs d'orientation ne sont pas
      // attachés : les événements simulés ne seraient écoutés par personne et
      // les DEUX sous-tests passeraient au vert pour cette mauvaise raison
      // (rien ne bouge, donc « pas de dérive »).
      try { await window.requestPermission(); } catch (e) {}
      const nomEv = ("ondeviceorientationabsolute" in window)
                      ? "deviceorientationabsolute" : "deviceorientation";
      const envoyer = function (capMonde) {
        const ev = new Event(nomEv);
        ev.alpha = ((360 - capMonde) % 360 + 360) % 360;
        ev.beta = 0; ev.gamma = 0; ev.absolute = true;
        window.dispatchEvent(ev);
      };
      const dcirc = function (a, b) { return ((b - a) % 360 + 540) % 360 - 180; };
      const poser = async function (cap) {          // amène le lissage au cap
        for (let i = 0; i < 60; i++) { envoyer(cap); await new Promise(function (r) { setTimeout(r, 20); }); }
        await new Promise(function (r) { setTimeout(r, 900); });
      };

      // (a) rotation sur place : aucun pas, le cap tourne de 90°
      await poser(0);
      const depart = window.MapBearing.getBearing();
      for (let i = 0; i <= 90; i += 2) { envoyer(i); await new Promise(function (r) { setTimeout(r, 40); }); }
      // Le capteur continue d'émettre une fois l'utilisateur immobile : sans
      // ça le lissage resterait figé en cours de route et le test mesurerait
      // son propre silence, pas le comportement du mode.
      await poser(90);
      const suivi = Math.abs(dcirc(window.MapBearing.getBearing(), -90));

      // (b) arrêt complet, cap stable mais bruité ±8°
      await poser(0);
      const avant = window.MapBearing.getBearing();
      let derive = 0;
      for (let i = 0; i < 120; i++) {
        envoyer(Math.sin(i / 4) * 8);
        await new Promise(function (r) { setTimeout(r, 25); });
        derive = Math.max(derive, Math.abs(dcirc(avant, window.MapBearing.getBearing())));
      }
      return { depart: Math.round(depart), ecartApres90: Math.round(suivi), deriveBruit: Math.round(derive) };
    });
    if (t10.ecartApres90 < 20)
      ok("tourner sur place SANS avancer fait bien tourner la vue (écart final " + t10.ecartApres90 + "°)");
    else pb("la vue ne suit pas une rotation sur place (écart " + t10.ecartApres90 + "°) — le gel est de retour");
    if (t10.deriveBruit <= 6)
      ok("un magnétomètre bruité ±8° à l'arrêt ne fait pas dériver la vue (" + t10.deriveBruit + "°)");
    else pb("la vue suit le bruit à l'arrêt : " + t10.deriveBruit + "° de dérive");

    // ── T9 — le canvas des vecteurs couvre-t-il les coins ? ────────────
    // Leaflet dimensionne le canvas au viewport + 10 % : une fois la vue
    // tournée, ce rectangle ne couvre plus les coins de l'écran et les tracés
    // s'y arrêtent net (dès ~10° avec le réglage d'origine). On vérifie donc
    // la géométrie réelle : les 4 coins du viewport tombent-ils dans le
    // rectangle TOURNÉ du canvas ?
    console.log("— T9 : couverture du canvas des vecteurs —");
    const t9 = await page.evaluate(async function () {
      const res = [];
      const cv = document.querySelector(".leaflet-overlay-pane canvas");
      if (!cv) return { skip: "pas de canvas vecteurs sur ce plan" };
      const rot = document.querySelector(".kta-rotate-pane");
      for (const cap of [10, 45, 80]) {
        await window.__mb.viser(cap);
        const bearing = window.MapBearing.getBearing();
        const garde = rot.style.transform;
        rot.style.transform = "";                  // rect non tourné du canvas
        const r = cv.getBoundingClientRect();
        rot.style.transform = garde;
        const cr = window.map.getContainer().getBoundingClientRect();
        const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
        const a = bearing * Math.PI / 180;
        const tourne = function (x, y) {
          const dx = x - cx, dy = y - cy;
          return [dx * Math.cos(a) - dy * Math.sin(a) + cx, dx * Math.sin(a) + dy * Math.cos(a) + cy];
        };
        const quad = [tourne(r.left, r.top), tourne(r.right, r.top),
                      tourne(r.right, r.bottom), tourne(r.left, r.bottom)];
        const dans = function (p) {
          let ins = false;
          for (let i = 0, j = 3; i < 4; j = i++) {
            const xi = quad[i][0], yi = quad[i][1], xj = quad[j][0], yj = quad[j][1];
            if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) ins = !ins;
          }
          return ins;
        };
        const coins = [[cr.left + 1, cr.top + 1], [cr.right - 2, cr.top + 1],
                       [cr.right - 2, cr.bottom - 2], [cr.left + 1, cr.bottom - 2]];
        res.push({ cap: cap, couverts: coins.filter(dans).length,
                   padding: window.map._renderer ? window.map._renderer.options.padding : null });
      }
      return { res: res };
    });
    if (t9.skip) { inf("T9 sauté : " + t9.skip); }
    else {
      let tousCouverts = true;
      t9.res.forEach(function (r) {
        inf("cap " + r.cap + "° → coins peints " + r.couverts + "/4 (padding renderer " + r.padding + ")");
        if (r.couverts < 4) tousCouverts = false;
      });
      if (tousCouverts) ok("le canvas des vecteurs couvre l'écran à tous les angles testés");
      else pb("des coins de l'écran ne sont plus peints : les tracés s'y arrêteront");
    }

    // ── T8 — chaîne complète avec un VRAI cap capteur ──────────────────
    // Le reste du checkup injecte le cap directement dans MapBearing. Ici on
    // passe par l'événement d'orientation, donc par toute la chaîne :
    //   getHeading(α,β,γ) → _getCorrectedHeading → _getPlanRelHeading
    //                     → icône tracker ET rotation de la vue.
    // 🩸 C'est le SEUL test qui prouve la composition des deux rotations :
    // l'icône porte `rotate(+cap)` et la vue `rotate(-cap)`. Si leur somme
    // n'est pas nulle, l'icône ne pointe plus la direction de marche — et
    // rien dans le code ne le dirait.
    console.log("— T8 : icône + vue, avec un cap capteur simulé —");
    const t8 = await page.evaluate(async function () {
      // Les écouteurs d'orientation sont attachés par requestPermission()
      // (pas par startTracking) : sans lui, l'événement simulé ne serait
      // écouté par personne et le test mesurerait un cap figé à 0.
      try { await window.requestPermission(); } catch (e) {}
      // α = 270 → cap 90° (Est), cf tracking.js §24 (table des 4 cardinaux).
      const nom = ("ondeviceorientationabsolute" in window)
                    ? "deviceorientationabsolute" : "deviceorientation";
      for (let i = 0; i < 60; i++) {
        const ev = new Event(nom);
        ev.alpha = 270; ev.beta = 0; ev.gamma = 0; ev.absolute = true;
        window.dispatchEvent(ev);
        window.MapBearing.onStep(window.map.getCenter());
        await new Promise(function (r) { setTimeout(r, 30); });
      }
      const img = document.querySelector(".kta-tracker-img");
      if (!img) return { skip: "icône tracker absente" };
      const cs = getComputedStyle(img);
      const m = new DOMMatrix(cs.transform === "none" ? "" : cs.transform);
      const angleIcone = Math.atan2(m.b, m.a) * 180 / Math.PI;
      return {
        cap:        Math.round((window.getPlanRelHeading ? window.getPlanRelHeading() : NaN) * 10) / 10,
        angleIcone: Math.round(angleIcone * 10) / 10,
        vue:        Math.round(window.MapBearing.getBearing() * 10) / 10
      };
    });
    if (t8.skip) {
      inf("T8 sauté : " + t8.skip);
    } else {
      const somme = ((t8.angleIcone + t8.vue) % 360 + 540) % 360 - 180;
      inf("cap capteur " + t8.cap + "° · icône " + t8.angleIcone + "° · vue " + t8.vue + "°");
      if (Math.abs(t8.cap - 90) < 3)
        ok("la chaîne capteur → cap plan donne bien 90° pour α=270");
      else pb("cap plan inattendu pour α=270 : " + t8.cap + "°");
      if (Math.abs(somme) < 8)
        ok("icône + vue = " + somme.toFixed(1) + "° → l'icône pointe le haut de l'écran (direction de marche)");
      else pb("icône et vue ne se compensent pas (somme " + somme.toFixed(1) + "°) : " +
              "l'icône ne montre plus la direction de marche");
    }

    // ── T11 — cliquer un TRACÉ sous rotation ───────────────────────────
    // Avant le patch des conversions : le clic sur le tracé visible ne
    // déclenchait rien, et un clic dans le vide réveillait son « fantôme »
    // — la position que Leaflet lui croyait, jusqu'à 200 px plus loin.
    console.log("— T11 : clic sur un tracé, et pan, sous rotation —");
    const prep = await page.evaluate(async function () {
      await window.__mb.viser(50);
      const c = window.map.getCenter();
      window.__hits = 0;
      if (window.__sonde) { try { window.map.removeLayer(window.__sonde); } catch (e) {} }
      // Tracé horizontal (repère plan) passant par le centre de la vue.
      window.__sonde = L.polyline([[c.lat, c.lng - 300], [c.lat, c.lng + 300]],
                                  { color: "#ff5c5c", weight: 12 }).addTo(window.map);
      window.__sonde.on("click", function () { window.__hits++; });
      await new Promise(function (r) { setTimeout(r, 400); });
      const ll = L.latLng(c.lat, c.lng + 150);
      // `latLngToContainerPoint` n'est PAS patché (seuls les gestes le sont) :
      // il rend donc la position « à plat », là où Leaflet croit le tracé —
      // le fantôme. La position VISIBLE est celle-ci, tournée.
      const brut = window.map.latLngToContainerPoint(ll);
      const cr = window.map.getContainer().getBoundingClientRect();
      const cc = window.map.getSize().divideBy(2);
      const a = window.MapBearing.getBearing() * Math.PI / 180;
      const dx = brut.x - cc.x, dy = brut.y - cc.y;
      return {
        visible: [cr.left + dx * Math.cos(a) - dy * Math.sin(a) + cc.x,
                  cr.top + dx * Math.sin(a) + dy * Math.cos(a) + cc.y],
        fantome: [cr.left + brut.x, cr.top + brut.y]
      };
    });
    await page.mouse.click(prep.visible[0], prep.visible[1]);
    await page.waitForTimeout(250);
    const hitVisible = await page.evaluate(function () { const h = window.__hits; window.__hits = 0; return h; });
    await page.mouse.click(prep.fantome[0], prep.fantome[1]);
    await page.waitForTimeout(250);
    const hitFantome = await page.evaluate(function () { const h = window.__hits; window.__hits = 0; return h; });
    if (hitVisible >= 1) ok("clic sur le tracé LÀ OÙ IL EST VISIBLE → le tracé répond");
    else pb("le tracé ne répond pas au clic à sa position visible");
    if (hitFantome === 0) ok("clic sur son ancien fantôme → plus rien (le décalage est corrigé)");
    else pb("le fantôme répond encore : les conversions ne sont pas appliquées partout");

    // Pan : le doigt part vers la droite, la carte doit suivre le doigt.
    const avantPan = await page.evaluate(function () { return window.__mb.reel(); });
    await page.mouse.move(550, 400);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const apresPan = await page.evaluate(function () { return window.__mb.reel(); });
    const angPan = Math.round(Math.atan2(apresPan[1] - avantPan[1], apresPan[0] - avantPan[0]) * 180 / Math.PI);
    const ampPan = Math.hypot(apresPan[0] - avantPan[0], apresPan[1] - avantPan[1]);
    inf("doigt vers la droite (0°) → la carte part à " + angPan + "° sur " + Math.round(ampPan) + " px");
    if (ampPan > 40 && Math.abs(angPan) < 15)
      ok("le pan suit le doigt malgré la rotation");
    else pb("le pan part de travers : " + angPan + "° (0° attendu)");
    const suiviDesarme = await page.evaluate(function () {
      return !!document.querySelector(".kta-bearing-recentrer");
    });
    if (suiviDesarme) ok("le pan manuel désarme le suivi et propose 🎯 Recentrer");
    else pb("aucun bouton Recentrer après un pan manuel");

    // Au doigt : sans `touch-action: none`, le navigateur scrollerait la page
    // au lieu de laisser le pan manuel agir (`dragging.disable()` a retiré la
    // classe `leaflet-touch-drag` de Leaflet).
    const ta = await page.evaluate(function () {
      const c = window.map.getContainer();
      return { touchAction: getComputedStyle(c).touchAction,
               classe: c.classList.contains("kta-bearing-lock") };
    });
    if (ta.classe && ta.touchAction === "none")
      ok("le conteneur garde `touch-action: none` → le pan au doigt reste à nous");
    else pb("touch-action = « " + ta.touchAction + " » : au doigt, la page scrollerait");

    // ── T18 — le pan manuel ne s'échappe pas des limites du plan ───────
    // 🩸 `panBy({animate:false})` passe par `_rawPanBy`, qui NE limite PAS le
    // centre : pendant le mode, la vue sortait des `maxBounds` (pourtant
    // posés avec `maxBoundsViscosity: 1.0`) et le zoom suivant la ramenait
    // d'un coup — ce qui se lit « au zoom, tout se décale ».
    console.log("— T18 : le pan manuel reste dans les limites du plan —");
    await page.evaluate(async function () {
      window.map.setZoom(-4);                 // 1 px d'écran = beaucoup de plan
      await new Promise(function (r) { setTimeout(r, 400); });
      await window.__mb.viser(45);
    });
    for (let i = 0; i < 6; i++) {             // on pousse loin, vers un coin
      await page.mouse.move(700, 500);
      await page.mouse.down();
      await page.mouse.move(250, 180, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(120);
    }
    const t18 = await page.evaluate(async function () {
      const map = window.map;
      const mb = map.options.maxBounds;
      const avant = map.getCenter();
      const dedans = mb ? mb.contains(avant) : null;
      map.setZoom(map.getZoom());             // c'est CE zoom qui ramenait la vue
      await new Promise(function (r) { setTimeout(r, 500); });
      const apres = map.getCenter();
      return { dedans: dedans,
               saut: Math.round(Math.hypot(apres.lat - avant.lat, apres.lng - avant.lng)) };
    });
    if (t18.dedans) ok("après 6 pans vers un coin, la vue est restée dans les limites du plan");
    else pb("la vue s'est échappée des maxBounds pendant le pan manuel");
    if (t18.saut <= 5) ok("le zoom suivant ne la ramène pas d'un coup (saut " + t18.saut + " unités)");
    else pb("le zoom a rattrapé la vue de " + t18.saut + " unités : la contrainte n'était pas appliquée");

    // ── T12 — les autres cartes de l'app ne sont PAS affectées ─────────
    // Le patch vit sur le prototype de L.Map : il est vu par la Vue OSM, la
    // minimap d'urgence, le Mode Secours, le picker de calage et l'aperçu
    // HOME. Aucune ne tourne — aucune ne doit voir ses conversions changer.
    console.log("— T12 : les 5 autres cartes de l'app —");
    const t12 = await page.evaluate(function () {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;left:-9999px;width:400px;height:300px";
      document.body.appendChild(div);
      const autre = L.map(div, { crs: L.CRS.Simple, center: [0, 0], zoom: 0 });
      const r = div.getBoundingClientRect();
      // Un geste au centre de CETTE carte doit rester au centre : aucune
      // rotation ne doit lui être appliquée, alors que la carte principale
      // tourne au même instant.
      const faux = { clientX: r.left + 200, clientY: r.top + 150 };
      const p = autre.mouseEventToContainerPoint(faux);
      const ecart = Math.hypot(p.x - 200, p.y - 150);
      // …et la carte principale, elle, DOIT tourner ce même geste.
      const cr = window.map.getContainer().getBoundingClientRect();
      const cc = window.map.getSize().divideBy(2);
      const g = { clientX: cr.left + cc.x + 100, clientY: cr.top + cc.y };
      const pp = window.map.mouseEventToContainerPoint(g);
      const deltaPrincipale = Math.hypot(pp.x - (cc.x + 100), pp.y - cc.y);
      autre.remove(); div.remove();
      return { ecart: ecart, deltaPrincipale: deltaPrincipale,
               bearingPrincipal: window.MapBearing.getBearing() };
    });
    if (t12.ecart < 0.01 && t12.deltaPrincipale > 5)
      ok("une autre carte reçoit le geste inchangé (écart " + t12.ecart.toFixed(2) + " px) " +
         "pendant que la carte principale, à " + Math.round(t12.bearingPrincipal) + "°, le corrige de " +
         Math.round(t12.deltaPrincipale) + " px");
    else pb("le patch déborde, ou ne s'applique pas : " + JSON.stringify(t12));

    // ── T6 — arrêt du tracking ─────────────────────────────────────────
    // ── T13 — la popup d'un POI reste lisible ET fermable ──────────────
    // 🩸 Signalé par KARMA : la croix de fermeture tournait avec la carte.
    // Leaflet la crée comme FRÈRE du contenu, pas comme son enfant : la
    // contre-rotation du contenu ne l'atteignait pas. Elle est désormais
    // adoptée dans le contenu à l'ouverture de la popup.
    console.log("— T13 : popup d'un POI sous rotation —");
    const t13 = await page.evaluate(async function () {
      await window.__mb.viser(55);
      const m = L.marker(window.map.getCenter()).addTo(window.map);
      m.bindPopup("<b>Point test</b><br>Infos et actions").openPopup();
      await new Promise(function (r) { setTimeout(r, 500); });
      const el = document.querySelector(".leaflet-popup");
      if (!el) { try { window.map.removeLayer(m); } catch (e) {} return { skip: true }; }
      const croix = el.querySelector(".leaflet-popup-close-button");
      const contenu = el.querySelector(".leaflet-popup-content-wrapper");
      // Angle visuel CUMULÉ : on remonte les ancêtres jusqu'au conteneur.
      const angleCumule = function (n) {
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
      };
      const res = {
        adoptee: !!(croix && contenu && croix.parentNode === contenu),
        angleCroix: croix ? Math.round(angleCumule(croix) * 10) / 10 : null,
        angleContenu: contenu ? Math.round(angleCumule(contenu) * 10) / 10 : null,
        surLaBulle: false
      };
      if (croix && contenu) {
        const rc = croix.getBoundingClientRect(), rb = contenu.getBoundingClientRect();
        res.surLaBulle = rc.left >= rb.left - 8 && rc.right <= rb.right + 8 &&
                         rc.top >= rb.top - 8 && rc.bottom <= rb.bottom + 8;
      }
      try { window.map.closePopup(); window.map.removeLayer(m); } catch (e) {}
      return res;
    });
    if (t13.skip) { inf("T13 sauté : pas de popup"); }
    else {
      inf("contenu à " + t13.angleContenu + "° · croix à " + t13.angleCroix + "°");
      if (t13.adoptee) ok("la croix de fermeture est bien dans le contenu de la bulle");
      else pb("la croix est restée hors du contenu : elle tourne avec la carte");
      if (Math.abs(t13.angleCroix) < 1.5)
        ok("la croix est redressée comme le texte (" + t13.angleCroix + "°)");
      else pb("la croix est de travers : " + t13.angleCroix + "°");
      if (t13.surLaBulle) ok("la croix reste posée sur la bulle");
      else pb("la croix a décroché de la bulle");
    }

    // ── T14 — 🎯 Recentrer SANS la rotation ────────────────────────────
    // Demande KARMA : le bouton a du sens dès que le tracker tourne, que la
    // carte pivote ou non. Sans le mode, il n'y a pas de suivi automatique —
    // le bouton est alors le seul chemin de retour vers sa position.
    console.log("— T14 : 🎯 Recentrer avec le mode désactivé —");
    const t14 = await page.evaluate(async function () {
      window.MapBearing.setEnabled(false);          // rotation OFF
      // T11 a pané : le suivi est déjà désarmé et le bouton affiché. On
      // repart d'un état armé, sinon on mesurerait l'héritage du test
      // précédent au lieu du comportement de celui-ci.
      window.MapBearing.recentrer();
      await new Promise(function (r) { setTimeout(r, 400); });
      const avant = !!document.querySelector(".kta-bearing-recentrer");
      window.map.fire("dragstart");                 // l'utilisateur part voir ailleurs
      await new Promise(function (r) { setTimeout(r, 200); });
      const apresPan = !!document.querySelector(".kta-bearing-recentrer");
      const btn = document.querySelector(".kta-bearing-recentrer");
      if (btn) btn.click();
      await new Promise(function (r) { setTimeout(r, 600); });
      const apresClic = !!document.querySelector(".kta-bearing-recentrer");
      const rot = document.querySelector(".kta-rotate-pane");
      return { avant: avant, apresPan: apresPan, apresClic: apresClic,
               transform: rot ? rot.style.transform : "?" };
    });
    if (!t14.avant && t14.apresPan)
      ok("mode désactivé : le bouton apparaît quand on quitte sa position (tracker actif)");
    else pb("bouton absent hors rotation (avant=" + t14.avant + " après pan=" + t14.apresPan + ")");
    if (!t14.apresClic) ok("un clic sur 🎯 Recentrer le fait disparaître");
    else pb("le bouton reste après le recentrage");
    if (!t14.transform) ok("aucune rotation n'a été introduite par ce chemin");
    else pb("la vue a tourné alors que le mode est désactivé : " + t14.transform);

    // ── T15 — les tuiles hors écran sortent de la couche ───────────────
    // 🩸 Régression v1.97.0 vue en terrain (iPhone, plan 16332 px, dézoom à
    // fond) : des pans du fond restaient noirs alors que les logs disaient
    // « 56 tuiles affichées, 0 manquante ». Le tuilage pose TOUTES les tuiles
    // du niveau, même hors écran ; sous notre pane transformé, iOS doit
    // composer tout ça en une couche et renonce à en peindre une partie.
    // Ce test fige la parade : pendant le mode, les tuiles hors viewport
    // quittent la carte.
    // 🧱 29/09/2026 — le retrait est devenu PERMANENT (tiling.js >
    // ktaCullerTuilesV2 : 864 tuiles posées pour 6 visibles, même sans
    // rotation). À l'arrêt, ne reviennent donc que les tuiles proches de
    // l'écran droit — plus « toutes ».
    console.log("— T15 : tuiles hors écran pendant la rotation —");
    const t15 = await page.evaluate(async function () {
      const map = window.map;
      // T14 a laissé le mode désactivé et T18 la carte au zoom -4, où tout
      // tient dans la vue : deux états hérités qui feraient mesurer autre
      // chose que ce test.
      window.MapBearing.setEnabled(true);
      map.setZoom(0);
      await new Promise(function (r) { setTimeout(r, 400); });
      const c = map.getCenter();
      const faux = [];
      // 25 tuiles en grille : quelques-unes au centre, la plupart très loin.
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const ov = L.imageOverlay(
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
            [[c.lat + i * 4000, c.lng + j * 4000], [c.lat + (i + 1) * 4000, c.lng + (j + 1) * 4000]],
            { interactive: false, pane: "tilePane" });
          ov.addTo(map);
          faux.push(ov);
        }
      }
      // Une tuile volontairement HORS carte (comme si le filtre multi-niveau
      // l'avait masquée) : elle ne doit jamais être réintégrée par le culling.
      const masquee = L.imageOverlay(
        "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        [[c.lat, c.lng], [c.lat + 100, c.lng + 100]], { interactive: false, pane: "tilePane" });
      faux.push(masquee);                       // dans activeOverlays, mais PAS sur la carte
      window.__ancienState = window._tilingV2State;
      window._tilingV2State = { activeOverlays: faux };

      const surCarte = function () { return faux.filter(function (o) { return map.hasLayer(o); }).length; };
      const avant = surCarte();
      await window.__mb.viser(40);              // rotation → culling
      await new Promise(function (r) { setTimeout(r, 700); });
      const pendant = surCarte();
      const bearingPendant = Math.round(window.MapBearing.getBearing());
      const masqueeReintegree = map.hasLayer(masquee);

      window.MapBearing.reset();                // vue droite → les proches reviennent
      await new Promise(function (r) { setTimeout(r, 500); });
      const apres = surCarte();
      const masqueeApres = map.hasLayer(masquee);
      // Attendu à plat : exactement les tuiles (hors « masquee ») qui croisent
      // l'écran élargi de 15 % — la règle de ktaCullerTuilesV2.
      const zonePlate = map.getBounds().pad(0.15);
      const attenduesApres = faux.filter(function (o) {
        return o !== masquee && zonePlate.intersects(o.getBounds());
      }).length;

      faux.forEach(function (o) { try { map.removeLayer(o); } catch (e) {} });
      window._tilingV2State = window.__ancienState;
      return { total: faux.length, avant: avant, pendant: pendant, apres: apres,
               bearingPendant: bearingPendant, attenduesApres: attenduesApres,
               masqueeReintegree: masqueeReintegree, masqueeApres: masqueeApres };
    });
    inf("tuiles sur la carte : " + t15.avant + " avant · " + t15.pendant + " pendant la rotation (vue à " +
        t15.bearingPendant + "°) · " + t15.apres + " après");
    if (!t15.bearingPendant) pb("la vue n'a pas tourné : le test ne prouve rien");
    if (t15.pendant < t15.avant)
      ok("les tuiles hors écran quittent la carte pendant la rotation (" +
         (t15.avant - t15.pendant) + " retirées sur " + t15.total + ")");
    else pb("aucune tuile retirée : la couche à composer reste entière");
    if (t15.apres === t15.attenduesApres && t15.apres > 0)
      ok("vue redressée : reviennent exactement les tuiles proches de l'écran droit (" + t15.apres + ")");
    else pb("après le retour à plat : " + t15.apres + " tuiles, attendu " + t15.attenduesApres);
    if (!t15.masqueeReintegree && !t15.masqueeApres)
      ok("une tuile masquée par ailleurs (filtre multi-niveau) n'est jamais réintégrée");
    else pb("le culling a réintégré une tuile qui devait rester masquée");

    // ── T16 — 🎯 Recentrer ne recouvre aucun flottant du bas ───────────
    // 🩸 Signalé par KARMA : après un saut de portail, le bouton « ↩️ Retour »
    // et 🎯 Recentrer se superposaient — tous deux centrés, tous deux à ~84 px
    // du bas. Trois autres flottants partagent cette zone.
    console.log("— T16 : cohabitation avec les flottants du bas —");
    const t16 = await page.evaluate(async function () {
      // On fait apparaître le bouton Recentrer (tracker actif + suivi désarmé)
      if (!window.getTrackingActif()) window.startTracking();
      window.map.fire("dragstart");
      await new Promise(function (r) { setTimeout(r, 300); });
      const seul = document.querySelector(".kta-bearing-recentrer");
      const rSeul = seul ? seul.getBoundingClientRect() : null;

      // …puis le bouton « Retour » d'un saut de portail, à sa vraie place.
      const faux = document.createElement("div");
      faux.id = "kta-ipl-back-float";
      faux.style.cssText = "position:fixed;bottom:84px;left:50%;transform:translateX(-50%);" +
                           "z-index:1300;padding:10px 18px;background:#1a1f2e;border:1px solid #f4c542";
      faux.textContent = "↩️ Retour : Plan précédent";
      document.documentElement.appendChild(faux);
      await new Promise(function (r) { setTimeout(r, 400); });   // MutationObserver

      const btn = document.querySelector(".kta-bearing-recentrer");
      const r1 = btn ? btn.getBoundingClientRect() : null;
      const r2 = faux.getBoundingClientRect();
      const chevauche = !!(r1 && !(r1.bottom <= r2.top || r1.top >= r2.bottom ||
                                   r1.right <= r2.left || r1.left >= r2.right));
      faux.remove();
      await new Promise(function (r) { setTimeout(r, 400); });
      const rApres = btn ? btn.getBoundingClientRect() : null;
      return {
        avant: rSeul ? Math.round(window.innerHeight - rSeul.bottom) : null,
        pendant: r1 ? Math.round(window.innerHeight - r1.bottom) : null,
        apres: rApres ? Math.round(window.innerHeight - rApres.bottom) : null,
        chevauche: chevauche, visible: !!btn
      };
    });
    if (!t16.visible) { pb("le bouton Recentrer n'est pas apparu : T16 ne prouve rien"); }
    else {
      inf("distance au bas de l'écran : " + t16.avant + " px seul · " + t16.pendant +
          " px avec le Retour · " + t16.apres + " px après sa disparition");
      if (!t16.chevauche) ok("🎯 Recentrer ne recouvre pas le bouton « ↩️ Retour »");
      else pb("les deux boutons se superposent encore");
      if (t16.pendant > t16.avant) ok("il s'est bien écarté pour lui laisser la place");
      else pb("aucun décalage appliqué (" + t16.avant + " → " + t16.pendant + ")");
      if (Math.abs(t16.apres - t16.avant) <= 2) ok("il reprend sa place quand le Retour disparaît");
      else pb("il reste décalé après la disparition du Retour (" + t16.apres + " vs " + t16.avant + ")");
    }

    console.log("— T6 : arrêt du tracking —");
    const t6 = await page.evaluate(function () {
      window.MapBearing.setEnabled(true);   // T14 l'avait désactivé
      window.stopTracking();
      const rot = document.querySelector(".kta-rotate-pane");
      return {
        bearing: window.MapBearing.getBearing(),
        transform: rot ? rot.style.transform : "?",
        dragging: !!(window.map.dragging && window.map.dragging.enabled()),
        pointerEvents: window.map.getPane("overlayPane").style.pointerEvents,
        enabledEncore: window.MapBearing.isEnabled()
      };
    });
    if (Math.abs(t6.bearing) < 0.01 && !t6.transform) ok("vue droite après l'arrêt du tracking");
    else pb("vue encore tournée après l'arrêt : " + JSON.stringify(t6));
    if (t6.dragging) ok("carte de nouveau manipulable");
    else pb("le drag n'a pas été rendu après l'arrêt");
    if (!t6.pointerEvents) ok("événements des overlays rendus");
    else pb("pointer-events des overlays resté à « " + t6.pointerEvents + " »");
    if (t6.enabledEncore) ok("le choix de l'utilisateur est conservé (repris au prochain Play)");
    else pb("le toggle a été perdu à l'arrêt du tracking");

    // ── T20 — CHANGER DE PLAN SANS COUPER LE SUIVI (KARMA, 28/09/2026) ──
    // « Si je quitte le plan sans couper le tracking, le bouton pour recadrer
    // la position persiste sur l'autre plan. » Le chargement d'un plan coupe
    // le suivi dans initTracking(), SANS passer par stopTracking() : la carte
    // orientée n'était pas prévenue, et son bouton (posé dans le body, hors
    // carte) survivait. On rejoue exactement ce chemin.
    console.log("— T20 : changement de plan, suivi non coupé —");
    const t20 = await page.evaluate(function () {
      function avecBouton() {
        if (!window.getTrackingActif()) window.startTracking();
        window.map.fire("dragstart");               // suivi désarmé → le bouton apparaît
        return !!document.querySelector(".kta-bearing-recentrer");
      }
      // Contre-essai : sans le signal ajouté, le défaut doit réapparaître —
      // sinon ce test ne prouverait rien.
      const avant1 = avecBouton();
      const vrai = window.MapBearing.onTrackingChange;
      window.MapBearing.onTrackingChange = function () {};
      window.initTracking();
      const resteSansSignal = !!document.querySelector(".kta-bearing-recentrer");
      window.MapBearing.onTrackingChange = vrai;
      window.MapBearing.onTrackingChange(false);    // nettoyage du contre-essai
      // Le vrai chemin
      const avant2 = avecBouton();
      window.initTracking();
      return {
        avant1: avant1, resteSansSignal: resteSansSignal, avant2: avant2,
        apres: !!document.querySelector(".kta-bearing-recentrer"),
        suivi: window.getTrackingActif()
      };
    });
    if (t20.avant1 && t20.resteSansSignal) ok("🩸 contre-essai : sans le signal, le bouton survit bien (le test voit le défaut)");
    else pb("contre-essai non concluant : " + JSON.stringify(t20));
    if (t20.avant2 && !t20.apres && !t20.suivi) ok("🩸 changement de plan : le bouton « Recentrer » disparaît avec le suivi");
    else pb("le bouton « Recentrer » survit au changement de plan : " + JSON.stringify(t20));

    // ── T17 — LE FORMAT PORTRAIT, que le reste du checkup ne voit pas ──
    // 🩸 v1.97.3. Les marges de culling devaient valoir (grand côté / petit
    // côté − 1)/2 : 0,19 au format de ce checkup (1100×800), mais **0,58**
    // sur un téléphone en portrait. Les constantes posées en v1.97.1 (0,35 et
    // 0,45) tenaient donc ici et pas en main — 17,2 % de l'écran jamais peint
    // sur 430×932, signalé en terrain, invisible de tous les tests.
    //
    // Deux leçons, et ce bloc les applique toutes les deux :
    //   1. un checkup qui ne tourne qu'à UN format ne voit pas les défauts
    //      qui dépendent du format ;
    //   2. compter les tuiles retirées ne prouve rien — « 25 → 4 » est vert
    //      pour un culler juste comme pour un culler faux. On mesure donc ce
    //      que l'utilisateur voit : la part d'écran que PLUS AUCUNE tuile ne
    //      couvre.
    console.log("— T17 : couverture de l'écran en PORTRAIT (430×932) —");
    const portrait = await nav.newPage({ viewport: { width: 430, height: 932 } });
    await portrait.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    await portrait.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await portrait.waitForTimeout(2500);
    await portrait.evaluate(function () {
      const b = document.getElementById("kta-alert-ok"); if (b) b.click();
    });
    await portrait.getByText(PLAN.nom, { exact: false }).first().click();
    await attendre(portrait, function () {
      return !!window.PLAN_CONFIG && !!window.map && !!window.MapBearing;
    }, 20000);
    await portrait.waitForTimeout(2500);

    const t17 = await portrait.evaluate(async function () {
      const map = window.map;
      map.setZoom(0);
      await new Promise(function (r) { setTimeout(r, 400); });
      const c = map.getCenter();
      // Grille de tuiles. ⚠️ La TAILLE À L'ÉCRAN décide de ce que ce test
      // peut voir : avec des tuiles de 512 px, une seule couvre la largeur
      // d'un téléphone et la granularité masque le trou — le test passait au
      // vert même sur le culling fautif de v1.97.1. À 128 px, la grille est
      // assez fine pour que le manque se voie. Falsifié : remettre le
      // `pad(0.35)` de v1.97.1 doit faire rougir ce test.
      const T = 128, N = 8, faux = [];
      for (let i = -N; i <= N; i++) {
        for (let j = -N; j <= N; j++) {
          const ov = L.imageOverlay(
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
            [[c.lat + i * T, c.lng + j * T], [c.lat + (i + 1) * T, c.lng + (j + 1) * T]],
            { interactive: false, pane: "tilePane" });
          ov.addTo(map); faux.push(ov);
        }
      }
      window._tilingV2State = { activeOverlays: faux };
      window.MapBearing.setEnabled(true);
      try { await window.requestPermission(); } catch (e) {}
      if (!window.getTrackingActif()) window.startTracking();
      const nomEv = ("ondeviceorientationabsolute" in window)
                      ? "deviceorientationabsolute" : "deviceorientation";

      // Part de l'écran que plus aucune tuile PRÉSENTE ne couvre. On teste
      // contre les rectangles englobants, qui SURESTIMENT la couverture : un
      // trou détecté ici est donc un vrai trou, jamais un artefact.
      const mesurerVide = function () {
        const rects = [];
        faux.forEach(function (o) {
          if (!map.hasLayer(o)) return;
          const el = o.getElement && o.getElement();
          if (!el) return;
          const r = el.getBoundingClientRect();
          if (r.width && r.height) rects.push(r);
        });
        let total = 0, vides = 0;
        for (let y = 2; y < window.innerHeight; y += 10) {
          for (let x = 2; x < window.innerWidth; x += 10) {
            total++;
            let couvert = false;
            for (let k = 0; k < rects.length; k++) {
              const r = rects[k];
              if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { couvert = true; break; }
            }
            if (!couvert) vides++;
          }
        }
        return total ? Math.round(vides / total * 1000) / 10 : 0;
      };

      const releve = [];
      for (const cap of [0, 45, 90, 135]) {
        for (let i = 0; i < 70; i++) {
          const ev = new Event(nomEv);
          ev.alpha = ((360 - cap) % 360 + 360) % 360;
          ev.beta = 0; ev.gamma = 0; ev.absolute = true;
          window.dispatchEvent(ev);
          window.MapBearing.onStep(map.getCenter());
          await new Promise(function (r) { setTimeout(r, 20); });
        }
        await new Promise(function (r) { setTimeout(r, 400); });
        releve.push({ cap: cap, vue: Math.round(window.MapBearing.getBearing()),
                      vide: mesurerVide(),
                      gardees: faux.filter(function (o) { return map.hasLayer(o); }).length });
      }
      return { releve: releve, total: faux.length };
    });

    let pireVide = 0, aTourne = false;
    t17.releve.forEach(function (r) {
      inf("cap " + r.cap + "° → vue " + r.vue + "° · " + r.vide + " % d'écran sans tuile · " +
          r.gardees + "/" + t17.total + " tuiles gardées");
      pireVide = Math.max(pireVide, r.vide);
      if (r.vue !== 0) aTourne = true;
    });
    if (!aTourne) pb("la vue n'a jamais tourné en portrait : T17 ne prouve rien");
    else if (pireVide <= 1) ok("aucun trou visible en portrait (pire cas " + pireVide + " %)");
    else pb("il reste " + pireVide + " % d'écran sans tuile en portrait (c'était 17,2 % en v1.97.1)");
    await portrait.close();

    // ── T19 — le dézoom AU DOIGT ─────────────────────────────────────
    // 🩸 Constat KARMA : « avec les boutons zoom/dézoom aucun problème, mais
    // au doigt ça bugue ». Deux causes, toutes deux dans ce module :
    //   • `touchZoom = "center"`, que _verrouiller imposait « par prudence » :
    //     le zoom se faisait au centre de l'écran et non entre les doigts, donc
    //     pincer ailleurs faisait glisser toute la carte (95 px mesurés) ;
    //   • le pan à un doigt volait le début du geste — entre la pose du 1er
    //     doigt et celle du 2e, il bouge toujours un peu (21 unités mesurées).
    //
    // ⚠️ Le critère n'est PAS « le point pincé ne bouge pas » : Leaflet arrondit
    // le zoom à l'entier, donc il bouge toujours un peu, mode ou pas. On mesure
    // l'ÉCART AU COMPORTEMENT DE RÉFÉRENCE, mode désactivé. Sans ce contrôle on
    // courrait après un zéro impossible.
    console.log("— T19 : dézoom au doigt, comparé au mode désactivé —");
    const tactile = await nav.newPage({
      viewport: { width: 430, height: 932 }, deviceScaleFactor: 3,
      hasTouch: true, isMobile: true
    });
    await tactile.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    await tactile.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await tactile.waitForTimeout(2500);
    await tactile.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await tactile.getByText(PLAN.nom, { exact: false }).first().click();
    await attendre(tactile, function () {
      return !!window.PLAN_CONFIG && !!window.map && !!window.MapBearing;
    }, 60000);
    await tactile.waitForTimeout(4000);

    const cdp = await tactile.context().newCDPSession(tactile);
    const PX = 215, PY = 700;                      // volontairement hors centre
    const pincer = async function () {
      const d0 = 160, d1 = 70;
      const env = function (type, pts) {
        return cdp.send("Input.dispatchTouchEvent", {
          type: type,
          touchPoints: pts.map(function (p) {
            return { x: p[0], y: p[1], radiusX: 12, radiusY: 12, force: 1 };
          })
        });
      };
      await env("touchStart", [[PX - d0 / 2, PY], [PX + d0 / 2, PY]]);
      for (let i = 1; i <= 8; i++) {
        const d = d0 + (d1 - d0) * (i / 8);
        await env("touchMove", [[PX - d / 2, PY], [PX + d / 2, PY]]);
        await tactile.waitForTimeout(40);
      }
      await env("touchEnd", []);
      await tactile.waitForTimeout(700);
    };
    // Glissement du contenu situé sous les doigts, pour un pincement donné.
    const glissement = async function (modeActif) {
      await tactile.evaluate(async function (actif) {
        window.MapBearing.setEnabled(actif);
        if (actif) {
          try { await window.requestPermission(); } catch (e) {}
          if (!window.getTrackingActif()) window.startTracking();
          const nom = ("ondeviceorientationabsolute" in window)
                        ? "deviceorientationabsolute" : "deviceorientation";
          for (let i = 0; i < 70; i++) {
            const ev = new Event(nom);
            ev.alpha = 315; ev.beta = 0; ev.gamma = 0; ev.absolute = true;
            window.dispatchEvent(ev);
            window.MapBearing.onStep(window.map.getCenter());
            await new Promise(function (r) { setTimeout(r, 20); });
          }
        }
        window.map.setZoom(0);
        await new Promise(function (r) { setTimeout(r, 700); });
      }, modeActif);
      const av = await tactile.evaluate(function (xy) {
        const map = window.map, cr = map.getContainer().getBoundingClientRect();
        const cc = map.getSize().divideBy(2);
        const a = -window.MapBearing.getBearing() * Math.PI / 180;
        const dx = (xy[0] - cr.left) - cc.x, dy = (xy[1] - cr.top) - cc.y;
        const p = L.point(dx * Math.cos(a) - dy * Math.sin(a) + cc.x,
                          dx * Math.sin(a) + dy * Math.cos(a) + cc.y);
        const ll = map.containerPointToLatLng(p);
        return { lat: ll.lat, lng: ll.lng, vue: Math.round(window.MapBearing.getBearing()) };
      }, [PX, PY]);
      await pincer();
      return tactile.evaluate(function (d) {
        const map = window.map, cr = map.getContainer().getBoundingClientRect();
        const cc = map.getSize().divideBy(2);
        const p = map.latLngToContainerPoint(L.latLng(d.lat, d.lng));
        const a = window.MapBearing.getBearing() * Math.PI / 180;
        const dx = p.x - cc.x, dy = p.y - cc.y;
        const x = cr.left + dx * Math.cos(a) - dy * Math.sin(a) + cc.x;
        const y = cr.top + dx * Math.sin(a) + dy * Math.cos(a) + cc.y;
        return { px: Math.round(Math.hypot(x - d.px, y - d.py)), vue: d.vue };
      }, { lat: av.lat, lng: av.lng, px: PX, py: PY, vue: av.vue });
    };

    const modeOn = await glissement(true);
    const modeOff = await glissement(false);
    inf("mode actif (vue à " + modeOn.vue + "°) : " + modeOn.px + " px · " +
        "référence mode désactivé : " + modeOff.px + " px");
    if (!modeOn.vue) pb("la vue n'a pas tourné : T19 ne prouve rien");
    else if (Math.abs(modeOn.px - modeOff.px) <= 12)
      ok("le dézoom au doigt se comporte comme sans le mode (écart " +
         Math.abs(modeOn.px - modeOff.px) + " px)");
    else pb("le mode dégrade le dézoom au doigt de " +
            (modeOn.px - modeOff.px) + " px (c'était +68 px avec touchZoom=center)");
    await tactile.close();

  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }

  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — mode « plan orienté » : géométrie, lisibilité, frontières et restitution.");
  process.exit(0);
})();
