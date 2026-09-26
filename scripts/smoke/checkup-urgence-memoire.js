#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🚨 checkup-urgence-memoire.js — checkup de RELEASE
// =====================================================================
// Couvre deux familles de défauts qu'un audit mesuré a sorties en v1.97.6,
// et qu'aucun test ne pouvait voir : ils ne se manifestent ni à l'œil, ni
// dans la console, ni sur le plan de démonstration.
//
//   1. LA FUITE AU CHANGEMENT DE PLAN. `L.Map._initContainer` pose un
//      écouteur `scroll` sur le conteneur et `map.remove()` ne le retire
//      JAMAIS. Comme `<div id="map">` est permanent et réutilisé à chaque
//      plan, sa closure épingle l'ancienne carte pour toujours : +1 `L.Map`,
//      +970 polylines, +11 641 `L.LatLng`, +2,43 Mo par plan chargé, sans
//      plafond. Ni l'OOMGuard ni l'inspecteur mémoire ne lisent
//      `performance.memory` — l'app était aveugle à sa propre fuite.
//
//   2. L'ÉCRAN D'URGENCE « XL ». Sur un plan servi en HTTP — le modèle de
//      déploiement de la production — sa minimap n'affichait AUCUN fond
//      (0 tuile, 0 requête, un rectangle noir), sa boussole graphique
//      contredisait ses propres chiffres au premier affichage, son unique
//      bouton de sortie était coupé, et le bloc « 🔋 ÉTAT » ne montrait pas
//      la batterie. Sur l'écran qu'on ouvre quand on est perdu.
//
// Usage : node scripts/smoke/checkup-urgence-memoire.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
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

function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) { return { nom: "Relevé fictif de test", fictif: true }; }
}
const PLAN = planAOuvrir();

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function inf(m) { console.log("  •  " + m); }

(async function main() {
  let nav;
  try { nav = await chromium.launch(); }
  catch (e) {
    if (!/Executable doesn't exist/i.test(String((e && e.message) || ""))) throw e;
    nav = await chromium.launch({ channel: "chromium" });
  }
  const page = await nav.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    // Sans ça, `js/debug.js` masque les logs de l'app et on mesure son silence.
    try { localStorage.setItem("app_user_prefs", '{"debugMode":true}'); } catch (e) {}
  }, LS_PREGATES);

  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.getByText(PLAN.nom, { exact: false }).first().click();
    await page.waitForFunction(function () {
      return !!window.PLAN_CONFIG && !!window.map;
    }, null, { timeout: 60000 });
    await page.waitForTimeout(5000);
    ok("plan chargé (« " + PLAN.nom + " »)");
    if (!PLAN.fictif) inf("⚠️ le relevé fictif n'est pas dans data/index.json — checkup sur « " + PLAN.nom + " »");

    // ── F1 — l'écouteur `scroll` que Leaflet n'enlève jamais ───────────
    // Testé sur un conteneur jetable : c'est le MÉCANISME qu'on fige, à
    // l'identique de ce que fait l'app sur son `#map` permanent.
    console.log("— F1 : la fuite du handler `scroll` au changement de plan —");
    const f1 = await page.evaluate(function () {
      const vivants = function (el) {
        const ev = el && el._leaflet_events;
        if (!ev) return 0;
        return Object.keys(ev).filter(function (k) {
          // ⚠️ Leaflet met les entrées retirées à `null` SANS les supprimer :
          // compter les clés donnerait un faux vert.
          return /^scroll/.test(k) && ev[k];
        }).length;
      };
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;left:-9999px;width:200px;height:200px";
      document.body.appendChild(div);

      // (a) ce que fait Leaflet seul
      let m = L.map(div, { crs: L.CRS.Simple, center: [0, 0], zoom: 0 });
      m.remove();
      const sansParade = vivants(div);

      // (b) ce que fait l'app depuis v1.97.6
      m = L.map(div, { crs: L.CRS.Simple, center: [0, 0], zoom: 0 });
      L.DomEvent.off(div, "scroll", m._onScroll, m);
      m.remove();
      const avecParade = vivants(div) - sansParade;

      div.remove();
      return { sansParade: sansParade, avecParade: avecParade };
    });
    inf("après remove() seul : " + f1.sansParade + " écouteur `scroll` survit · " +
        "avec la parade : " + f1.avecParade);
    if (f1.sansParade >= 1) ok("le défaut de Leaflet est bien là (sinon ce test ne prouverait rien)");
    else pb("le défaut n'est pas reproduit : ce test ne prouve plus rien");
    if (f1.avecParade === 0) ok("la parade retire l'écouteur — plus rien ne retient la carte");
    else pb("la parade laisse " + f1.avecParade + " écouteur vivant");

    // …et l'app l'applique-t-elle vraiment sur son chemin réel ?
    const src = await page.evaluate(function () {
      return fetch("js/main.js").then(function (r) { return r.text(); });
    });
    const applique = /DomEvent\.off\([\s\S]{0,80}"scroll"[\s\S]{0,60}_onScroll/.test(src);
    if (applique) ok("js/main.js retire l'écouteur avant map.remove()");
    else pb("js/main.js ne retire PAS l'écouteur : la fuite est toujours là en usage réel");

    // ── U1..U4 — l'écran d'urgence XL ──────────────────────────────────
    console.log("— U : écran d'urgence « XL » —");
    const u = await page.evaluate(async function () {
      const compteRequetes = { tuiles: 0 };
      const of = window.fetch;
      window.fetch = function (u) {
        try { if (/\/tiles\/z/.test(String(u))) compteRequetes.tuiles++; } catch (e) {}
        return of.apply(this, arguments);
      };
      window.MapBearing && window.MapBearing.setEnabled(true);   // pour la rotation
      // cap stable : c'est le cas qui révélait la boussole contradictoire
      try { await window.requestPermission(); } catch (e) {}
      const nomEv = ("ondeviceorientationabsolute" in window)
                      ? "deviceorientationabsolute" : "deviceorientation";
      const envoyer = function () {
        const ev = new Event(nomEv);
        ev.alpha = 223; ev.beta = 0; ev.gamma = 0; ev.absolute = true;   // cap 137°
        window.dispatchEvent(ev);
      };
      for (let i = 0; i < 20; i++) { envoyer(); await new Promise(function (r) { setTimeout(r, 25); }); }

      window.EmergencyMode.activer();
      // le cap NE bouge plus : c'est ce qui figeait les rotors
      for (let i = 0; i < 30; i++) { envoyer(); await new Promise(function (r) { setTimeout(r, 50); }); }
      await new Promise(function (r) { setTimeout(r, 1200); });

      const mini = document.getElementById("kta-em-mini-map");
      const rotorN = document.querySelector(".kta-em-mini-tracker-rotor");
      const rotorT = document.querySelector(".kta-em-mini-tracker-triangle-rotor");
      const btn = document.getElementById("kta-emergency-exit");
      const rBtn = btn ? btn.getBoundingClientRect() : null;
      const etat = document.getElementById("kta-em-etat");
      const res = {
        tuilesDOM: mini ? mini.querySelectorAll("img.leaflet-image-layer").length : -1,
        requetesTuiles: compteRequetes.tuiles,
        rotorNord: rotorN ? (rotorN.style.transform || "") : null,
        rotorTri: rotorT ? (rotorT.style.transform || "") : null,
        capTexte: (document.getElementById("kta-em-heading-num") || {}).textContent || "",
        btnBas: rBtn ? Math.round(rBtn.bottom) : null,
        fenetre: window.innerHeight,
        etat: etat ? etat.textContent : "",
        miniTournee: mini ? (mini.style.transform || "") : ""
      };
      window.EmergencyMode.desactiver();
      window.fetch = of;
      return res;
    });

    inf("minimap : " + u.tuilesDOM + " tuile(s) affichée(s), " + u.requetesTuiles + " requête(s)");
    if (u.tuilesDOM > 0) ok("le fond de la minimap est dessiné (il ne l'était pas sur un plan serveur)");
    else pb("la minimap n'a toujours aucun fond (" + u.tuilesDOM + " tuile)");

    inf("cap affiché « " + u.capTexte + " » · rotor Nord « " + u.rotorNord + " » · triangle « " + u.rotorTri + " »");
    if (u.rotorTri) ok("la boussole est orientée dès le premier affichage, cap figé compris");
    else pb("le triangle n'a pas été orienté : la boussole contredit encore les chiffres");

    if (u.btnBas !== null && u.btnBas <= u.fenetre)
      ok("le bouton SORTIR tient dans l'écran (" + u.btnBas + " ≤ " + u.fenetre + ")");
    else pb("le bouton SORTIR déborde encore (" + u.btnBas + " > " + u.fenetre + ")");

    if (/%/.test(u.etat)) ok("le bloc « ÉTAT » affiche la batterie (" + u.etat + ")");
    else inf("batterie absente de « ÉTAT » (" + u.etat + ") — l'API batterie n'existe pas partout, " +
             "non bloquant au harnais");

    if (u.miniTournee) ok("la minimap s'oriente quand le mode « plan orienté » est actif (" + u.miniTournee + ")");
    else pb("la minimap ne tourne pas alors que le mode est activé");

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
  console.log("🎉 CHECKUP VERT — fuite au plan switch fermée, écran d'urgence lisible et complet.");
  process.exit(0);
})();
