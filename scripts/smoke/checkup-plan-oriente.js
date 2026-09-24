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
//   T7. le culling s'élargit quand la vue tourne
//
// Usage : node scripts/smoke/checkup-plan-oriente.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const server = require("./server.js");

const BASE = "http://127.0.0.1:8123";
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg)  { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }

(async function main() {
  let nav;
  try { nav = await chromium.launch(); }
  catch (e) {
    if (!/Executable doesn't exist/i.test(String((e && e.message) || ""))) throw e;
    nav = await chromium.launch({ channel: "chromium" });
  }
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
    await page.getByText("Relevé fictif de test", { exact: false }).first().click();
    await page.waitForFunction(function () {
      return !!window.PLAN_CONFIG && !!window.map && !!window.MapBearing;
    }, null, { timeout: 20000 });
    await page.waitForTimeout(2500);
    ok("plan de test chargé, MapBearing présent");

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
    console.log("— T7 : culling élargi quand la vue tourne —");
    const t7 = await page.evaluate(async function () {
      await window.__mb.viser(45);
      const actif = window.MapBearing.padCull(0.1);
      return { actif: actif, bearing: window.MapBearing.getBearing() };
    });
    if (t7.actif > 0.4) ok("padding de culling élargi à " + t7.actif + " (vue à " + t7.bearing.toFixed(0) + "°)");
    else pb("padding de culling non élargi : " + t7.actif);

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
