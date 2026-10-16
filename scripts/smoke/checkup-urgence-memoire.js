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
//   3. LES COULEURS DE LA LÉGENDE PERSONNALISÉE, ignorées par la mini-carte.
//      Cet écran garde délibérément sa palette vive (variante documentée en
//      tête de `styleResolver.js`) — mais il ignorait aussi les couleurs
//      CHOISIES par l'utilisateur, et ne connaissait aucun type `cust-…` :
//      une zone custom sortait en gris remblais, un tracé custom en jaune
//      chemin. La mini-carte montrait donc autre chose que la carte, sur
//      l'écran où l'on cherche à reconnaître son propre relevé.
//
// Usage : node scripts/smoke/checkup-urgence-memoire.js
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
  nav = await lancerNavigateur(chromium);
  // 📋 `clipboard-read` : sans cette permission, on ne pourrait PAS vérifier ce
  // qui a été copié — seulement que le bouton dit l'avoir fait.
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
                                     permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
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
    await attendre(page, function () {
      return !!window.PLAN_CONFIG && !!window.map;
    }, 60000);
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

      // immobile, la minimap ne doit PLUS se recentrer à chaque
      // tick (250 ms) : 40 setView en 10 s relançaient chacun un parcours de
      // toute la grille de tuiles. On compte ses setView pendant 2 s d'arrêt.
      const proto = L.Map.prototype, setViewOrig = proto.setView;
      let setViewsImmobile = 0;
      proto.setView = function () {
        try { if (this.getContainer().id === "kta-em-mini-map") setViewsImmobile++; } catch (e) {}
        return setViewOrig.apply(this, arguments);
      };
      await new Promise(function (r) { setTimeout(r, 2000); });
      proto.setView = setViewOrig;

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
        miniTournee: mini ? (mini.style.transform || "") : "",
        setViewsImmobile: setViewsImmobile
      };
      window.EmergencyMode.desactiver();
      window.fetch = of;
      return res;
    });

    if (u.setViewsImmobile === 0) ok("🔋 immobile : la minimap ne se recentre plus à chaque tick (0 setView en 2 s)");
    else pb("🔋 immobile : " + u.setViewsImmobile + " recentrage(s) de la minimap en 2 s sans bouger");

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

    // ── B — batterie indisponible : RIEN, pas un « ? » ──────────────
    // `formatLabel()` rend « ? » et `getEmoji()` rend 🪢 quand la batterie est
    // hors service (état « indispo » de la v1.11.1, fait pour que la chip de
    // l'en-tête montre son emplacement). Le bloc ÉTAT affichait donc « 🪢 ? »
    // sur Safari iOS et sur tout appareil où l'utilisateur a décoché le
    // réglage : un point d'interrogation à la place d'un niveau, sur l'écran
    // qu'on ouvre quand la batterie lâche.
    console.log("— B : batterie désactivée ou indisponible —");
    const bat = await page.evaluate(async function () {
      const vrai = window.BatteryGuard.isAvailable;
      window.BatteryGuard.isAvailable = function () { return false; };
      window.EmergencyMode.activer();
      await new Promise(function (r) { setTimeout(r, 1200); });
      const txt = (document.getElementById("kta-em-etat") || {}).textContent || "";
      window.EmergencyMode.desactiver();
      window.BatteryGuard.isAvailable = vrai;
      return txt;
    });
    inf("« ÉTAT » sans capteur : " + JSON.stringify(bat));
    if (!/[?%]/.test(bat) && bat.indexOf("🪢") < 0 && bat.indexOf("🔋") < 0
        && bat.indexOf("⚡") < 0) {
      ok("aucun indicateur de batterie quand le capteur est désactivé ou absent");
    } else {
      pb("un reste d'indicateur de batterie subsiste sans capteur : " + JSON.stringify(bat));
    }
    if (/Tracker/.test(bat)) ok("le reste de l'état (tracker, boussole) est intact");
    else pb("l'état a perdu le tracker en même temps que la batterie : " + JSON.stringify(bat));

    if (u.miniTournee) ok("la minimap s'oriente quand le mode « plan orienté » est actif (" + u.miniTournee + ")");
    else pb("la minimap ne tourne pas alors que le mode est activé");

    // ── P — coordonnées et copie (26/09/2026, contrat du 03/10/2026) ──
    // KARMA : « on devrait avoir la possibilité de copier les coordonnées GPS de
    // notre position, pour les envoyer si on trouve un point de réseau ». Depuis
    // le 03/10/2026 plus aucune coordonnée n'est affichée en permanence : plan
    // géoréférencé → icône 📋 dans la ligne d'état, qui ouvre une bulle (chiffres
    // en gros + Copier) ; plan non géoréférencé → pas d'icône du tout. Ce qui
    // compte n'est pas que le bouton dise « copié » : c'est ce qu'il y a DANS le
    // presse-papier, et que ce soit collable tel quel dans un SMS ou une carte.
    console.log("— P : coordonnées (bulle 📋) et copie —");
    const p1 = await page.evaluate(async function () {
      window.EmergencyMode.activer();
      await new Promise(function (r) { setTimeout(r, 1200); });
      const res = {
        ancienBloc: !!(document.getElementById("kta-em-pos-xy") || document.getElementById("kta-em-copier")),
        fenetre: window.innerHeight
      };
      const icone = document.getElementById("kta-em-coords-btn");
      res.geo = !!(icone && !icone.hidden);
      if (res.geo) {
        const rb = icone.getBoundingClientRect();
        res.icone = { l: Math.round(rb.width), h: Math.round(rb.height), haut: rb.top < window.innerHeight / 4 };
        icone.click();
        await new Promise(function (r) { setTimeout(r, 200); });
        const bulle = document.getElementById("kta-em-coords-bulle");
        res.bulleOuverte = !!(bulle && !bulle.hidden);
        const lat = document.getElementById("kta-em-coords-lat");
        res.taillePolice = lat ? parseFloat(getComputedStyle(lat).fontSize) : 0;
        res.chiffresTronques = lat ? (lat.scrollWidth > lat.clientWidth + 1) : null;
        const btn = document.getElementById("kta-em-coords-copier");
        if (btn) btn.click();
        await new Promise(function (r) { setTimeout(r, 700); });
        res.etat = btn ? btn.textContent.trim() : "";
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await new Promise(function (r) { setTimeout(r, 100); });
        res.echapFermeBulle = !!(bulle && bulle.hidden);
        res.ecranToujoursLa = window.EmergencyMode.isActif();
      }
      const exit = document.getElementById("kta-emergency-exit");
      const ov = document.querySelector(".kta-emergency-overlay");
      res.sortieBas = exit ? Math.round(exit.getBoundingClientRect().bottom) : null;
      res.debord = ov ? Math.max(0, ov.scrollHeight - ov.clientHeight) : null;
      window.EmergencyMode.desactiver();
      return res;
    });
    if (!p1.ancienBloc) ok("plus de bloc position permanent (ni X/Y, ni GPS)");
    else pb("le bloc position permanent est encore là");
    if (p1.geo) {
      const presse = await page.evaluate(function () {
        return navigator.clipboard.readText().catch(function () { return null; });
      });
      inf("icône 📋 " + p1.icone.l + "×" + p1.icone.h + " px · police des chiffres " + p1.taillePolice +
          " px · après clic : « " + p1.etat + " » · presse-papier : " + JSON.stringify(presse));
      if (p1.icone.h >= 44 && p1.icone.haut) ok("plan géoréférencé : l'icône 📋 est en haut, cible ≥ 44 px");
      else pb("icône 📋 mal placée ou trop petite : " + JSON.stringify(p1.icone));
      if (p1.bulleOuverte && p1.taillePolice >= 28 && p1.chiffresTronques === false)
        ok("la bulle affiche les coordonnées en gros, sans les tronquer");
      else pb("bulle des coordonnées : " + JSON.stringify(p1));
      // « lat, lng » NU : tout ajout casserait le collage dans une app de carte.
      if (presse && /^-?\d+\.\d{6}, -?\d+\.\d{6}$/.test(presse))
        ok("le presse-papier contient des coordonnées NUES, collables dans un SMS ou une carte");
      else pb("presse-papier inattendu pour un plan géoréférencé : " + JSON.stringify(presse));
      if (p1.echapFermeBulle && p1.ecranToujoursLa) ok("Échap ferme la bulle sans fermer l'écran XL");
      else pb("Échap : bulle fermée " + p1.echapFermeBulle + ", écran encore ouvert " + p1.ecranToujoursLa);
    } else {
      ok("plan non géoréférencé : pas d'icône 📋, aucune coordonnée affichée");
    }
    if (p1.sortieBas !== null && p1.sortieBas <= p1.fenetre && p1.debord === 0)
      ok("la sortie tient dans l'écran (" + p1.sortieBas + " ≤ " + p1.fenetre + ", 0 px de débordement)");
    else pb("l'écran déborde (sortie " + p1.sortieBas + "/" + p1.fenetre + ", débordement " + p1.debord + ")");

    // Le repli quand `navigator.clipboard` est inaccessible : c'est le cas
    // d'une instance servie en HTTP (réseau isolé de secours), où l'API
    // sécurisée n'existe pas. Sans repli, pas de coordonnées à transmettre.
    const p2 = p1.geo ? await page.evaluate(async function () {
      try {
        Object.defineProperty(navigator, "clipboard", {
          get: function () { throw new Error("bloqué"); }, configurable: true
        });
      } catch (e) { return { impossible: true }; }
      window.EmergencyMode.activer();
      await new Promise(function (r) { setTimeout(r, 1000); });
      const ic = document.getElementById("kta-em-coords-btn");
      if (ic) ic.click();
      const btn = document.getElementById("kta-em-coords-copier");
      if (btn) btn.click();
      await new Promise(function (r) { setTimeout(r, 600); });
      const t = btn ? btn.textContent.trim() : "";
      window.EmergencyMode.desactiver();
      return { etat: t };
    }) : { sansGeo: true };
    if (p2.sansGeo) inf("plan non géoréférencé — repli de copie non joué");
    else if (p2.impossible) inf("navigator.clipboard non redéfinissable — repli non joué");
    else if (/✅/.test(p2.etat)) ok("sans `navigator.clipboard`, le repli `execCommand` copie quand même");
    else pb("le repli de copie ne fonctionne pas (bouton : « " + p2.etat + " »)");

    // ── C1 — les couleurs choisies en légende atteignent la mini-carte ──
    // On capture ce que le mini DEMANDE à Leaflet : c'est la décision de style
    // qu'on veut mesurer, pas le pixel (le renderer peut être un canvas).
    console.log("— C : couleurs de la légende personnalisée dans la mini-carte —");
    const c = await page.evaluate(async function () {
      const LC = window.LegendCustomization;
      if (!LC) return { absent: true };
      LC.setColor("traces", "principal", "#ff00ff");
      LC.setColor("zones", "eau", "#00ff88");
      const ent = LC.addCustomEntry({ category: "traces", label: "CheckupCustom",
                                      geometry: "polyline", lineColor: "#123456" });
      const idCust = ent && (ent.id || ent);
      const pts = [{ x: 200, y: 200 }, { x: 400, y: 400 }, { x: 600, y: 300 }];
      const pousse = function (getter, obj) {
        try {
          const arr = window[getter] && window[getter]();
          if (Array.isArray(arr)) { arr.push(obj); return true; }
        } catch (e) {}
        return false;
      };
      const injecte = pousse("getRoads", { type: "principal", points: pts })
                    && pousse("getZones", { type: "eau", points: pts })
                    && (!!idCust && pousse("getRoads", { type: idCust, points: pts }));

      const vus = [];
      const oL = L.polyline, oP = L.polygon;
      let capture = false;
      L.polyline = function (ll, o) {
        if (capture && o) vus.push({ g: "line", color: o.color });
        return oL.apply(this, arguments);
      };
      L.polygon = function (ll, o) {
        if (capture && o) vus.push({ g: "poly", fill: o.fillColor });
        return oP.apply(this, arguments);
      };
      capture = true;
      window.EmergencyMode.activer();
      await new Promise(function (r) { setTimeout(r, 2500); });
      capture = false;
      window.EmergencyMode.desactiver();
      L.polyline = oL; L.polygon = oP;

      const ligne = function (h) {
        return vus.some(function (v) { return v.g === "line" && String(v.color).toLowerCase() === h; });
      };
      const fond = function (h) {
        return vus.some(function (v) { return v.g === "poly" && String(v.fill).toLowerCase() === h; });
      };
      return {
        injecte: injecte, total: vus.length,
        traceChoisi: ligne("#ff00ff"), traceBase: ligne("#27c97e"),
        customChoisi: ligne("#123456"), customRepli: ligne("#f4c542"),
        zoneChoisie: fond("#00ff88"), zoneBase: fond("#60a5fa")
      };
    });

    if (c.absent) inf("LegendCustomization indisponible — contrôle non joué");
    else if (!c.injecte) pb("les objets de test n'ont pas pu être injectés : ce contrôle ne prouve rien");
    else {
      inf(c.total + " forme(s) capturée(s)");
      if (c.traceChoisi && !c.traceBase)
        ok("un tracé built-in repeint par l'utilisateur sort à sa couleur (#ff00ff)");
      else pb("le tracé repeint sort encore à la couleur de base (choisi=" +
              c.traceChoisi + ", base=" + c.traceBase + ")");
      if (c.zoneChoisie && !c.zoneBase)
        ok("une zone repeinte sort à sa couleur (#00ff88)");
      else pb("la zone repeinte sort encore à la couleur de base (choisi=" +
              c.zoneChoisie + ", base=" + c.zoneBase + ")");
      if (c.customChoisi && !c.customRepli)
        ok("un type CUSTOM est reconnu (#123456) au lieu du repli de catégorie");
      else pb("le type custom retombe sur le repli (custom=" + c.customChoisi +
              ", repli=" + c.customRepli + ")");
    }

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
  console.log("🎉 CHECKUP VERT — fuite au plan switch fermée, écran d'urgence lisible, complet,\n" +
              "   et fidèle aux couleurs choisies en légende.");
  process.exit(0);
})();
