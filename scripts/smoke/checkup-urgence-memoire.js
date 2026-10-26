#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-urgence-memoire.js — checkup de RELEASE (Playwright, à la main) : défauts invisibles à l'œil,
// dans la console et sur le plan de démonstration.
//   1. 🩸 Fuite au changement de plan : `L.Map._initContainer` pose un écouteur `scroll` que `map.remove()`
//      ne retire jamais ; `#map` étant permanent, sa closure épingle chaque ancienne carte (~2,4 Mo par
//      plan, sans plafond, invisible de l'OOMGuard).
//   2. Écran d'urgence « XL » sur un plan servi en HTTP : fond de minimap dessiné, boussole cohérente dès
//      le premier affichage, bouton SORTIR dans l'écran, batterie dans « ÉTAT », coordonnées copiables.
//      Fond V1 au-delà du seuil (relevé fictif) : la question « image volumineuse » est répondue d'abord.
//   3. La mini-carte garde sa palette vive (exception de `styleResolver.js`) mais respecte les couleurs
//      CHOISIES en légende et les types `cust-…`.
// Usage : node scripts/smoke/checkup-urgence-memoire.js
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
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
  // `clipboard-read` : pour vérifier ce qui a été copié, pas seulement ce que dit le bouton.
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

    // ── F1 — l'écouteur `scroll` que Leaflet n'enlève jamais (mécanisme, sur un conteneur jetable) ──
    console.log("— F1 : la fuite du handler `scroll` au changement de plan —");
    const f1 = await page.evaluate(function () {
      const vivants = function (el) {
        const ev = el && el._leaflet_events;
        if (!ev) return 0;
        return Object.keys(ev).filter(function (k) {
          // 🩸 Leaflet met les entrées retirées à `null` sans les supprimer : compter les clés = faux vert.
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

      // (b) ce que fait l'app
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

    // …et sur son chemin réel
    const src = await page.evaluate(function () {
      return fetch("js/main.js").then(function (r) { return r.text(); });
    });
    const applique = /DomEvent\.off\([\s\S]{0,80}"scroll"[\s\S]{0,60}_onScroll/.test(src);
    if (applique) ok("js/main.js retire l'écouteur avant map.remove()");
    else pb("js/main.js ne retire PAS l'écouteur : la fuite est toujours là en usage réel");

    // ── I — fond V1 volumineux : la question passe avant la mini-carte ──
    // ⚠️ Contrat : au-delà de 4 Mpx (ou 10 Mo), l'écran XL demande « sans image / charger quand même » et ne
    // crée la mini-carte qu'après la réponse. Le relevé fictif (image V1 de 9 Mpx) est dans ce cas : sans
    // réponse, tout ce qui suit mesurerait une mini-carte qui n'existe pas.
    console.log("— I : question « image volumineuse » —");
    const im = await page.evaluate(async function () {
      const attendreModale = async function () {
        for (let i = 0; i < 20; i++) {
          if (document.getElementById("kta-emergency-bigimg-modal")) return true;
          await new Promise(function (r) { setTimeout(r, 50); });
        }
        return false;
      };
      const res = {};
      window.EmergencyMode.activer();
      res.posee = await attendreModale();
      if (!res.posee) { window.EmergencyMode.desactiver(); return res; }
      // Fermer l'écran pendant la question : la question part avec lui.
      window.EmergencyMode.desactiver();
      res.resteApresSortie = !!document.getElementById("kta-emergency-bigimg-modal");
      // Réouverture : une seule question, et la réponse donne bien une mini-carte.
      window.EmergencyMode.activer();
      await attendreModale();
      res.nbModales = document.querySelectorAll("#kta-emergency-bigimg-modal").length;
      const memo = document.getElementById("kta-em-bigimg-remember");
      if (memo) memo.checked = true;   // les ouvertures suivantes du checkup chargent sans redemander
      const charger = document.getElementById("kta-em-bigimg-load");
      if (charger) charger.click();
      await new Promise(function (r) { setTimeout(r, 1200); });
      const mini = document.getElementById("kta-em-mini-map");
      res.miniCreee = !!(mini && mini.classList.contains("leaflet-container"));
      window.EmergencyMode.desactiver();
      return res;
    });
    if (!im.posee) inf("fond tuilé ou image légère : pas de question « image volumineuse » sur ce plan");
    else {
      if (!im.resteApresSortie) ok("fermer l'écran XL retire la question « image volumineuse »");
      else pb("la question « image volumineuse » reste à l'écran après la sortie de l'écran XL");
      if (im.nbModales === 1 && im.miniCreee) ok("réouverture : une seule question, « Charger » crée la mini-carte");
      else pb("réouverture : " + im.nbModales + " question(s), mini-carte créée = " + im.miniCreee);
    }

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
      // cap stable : le cas où la boussole peut contredire ses chiffres
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
      // cap immobile : le cas qui peut figer les rotors
      for (let i = 0; i < 30; i++) { envoyer(); await new Promise(function (r) { setTimeout(r, 50); }); }
      await new Promise(function (r) { setTimeout(r, 1200); });

      // Immobile, la minimap ne se recentre pas à chaque tick (250 ms) : chaque setView reparcourt toute
      // la grille de tuiles. On compte ses setView pendant 2 s d'arrêt.
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

    // ── B — batterie indisponible : RIEN, pas un « ? » ──────
    // 🩸 Hors service, `formatLabel()` rend « ? » et `getEmoji()` 🪢 (faits pour la chip de l'en-tête) : le
    // bloc ÉTAT ne doit pas les reprendre (Safari iOS, réglage décoché).
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

    // ── P — coordonnées et copie ──────
    // ⚠️ Contrat : aucune coordonnée affichée en permanence ; plan géoréférencé → icône 📋 qui ouvre une
    // bulle (chiffres en gros + Copier), sinon pas d'icône. On vérifie le CONTENU du presse-papier,
    // collable tel quel dans un SMS ou une carte.
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

    // Repli sans `navigator.clipboard` : instance servie en HTTP (réseau isolé de secours), API absente.
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
    // On capture ce que la mini-carte DEMANDE à Leaflet, pas le pixel (le renderer peut être un canvas).
    console.log("— C : couleurs de la légende personnalisée dans la mini-carte —");
    const c = await page.evaluate(async function () {
      const LC = window.LegendCustomization;
      if (!LC) return { absent: true };
      LC.setColor("traces", "principal", "#ff00ff");
      LC.setColor("zones", "eau", "#00ff88");
      const ent = LC.addCustomEntry({ category: "traces", label: "CheckupCustom",
                                      geometry: "polyline", lineColor: "#123456" });
      const idCust = ent && (ent.id || ent);
      // 🩸 Chaque objet injecté porte son X de départ (201, 202, 203) et seules SES formes comptent : le plan
      // a ses propres tracés, dont des « chemin » dorés — la couleur de repli des types inconnus.
      const pts = function (x0) { return [{ x: x0, y: 200 }, { x: 400, y: 400 }, { x: 600, y: 300 }]; };
      const pousse = function (getter, obj) {
        try {
          const arr = window[getter] && window[getter]();
          if (Array.isArray(arr)) { arr.push(obj); return true; }
        } catch (e) {}
        return false;
      };
      const injecte = pousse("getRoads", { type: "principal", points: pts(201) })
                    && pousse("getZones", { type: "eau", points: pts(202) })
                    && (!!idCust && pousse("getRoads", { type: idCust, points: pts(203) }));

      const vus = [];
      const oL = L.polyline, oP = L.polygon;
      let capture = false;
      const x0 = function (ll) {
        const p = Array.isArray(ll) && (Array.isArray(ll[0]) && Array.isArray(ll[0][0]) ? ll[0][0] : ll[0]);
        return p ? (Array.isArray(p) ? p[1] : p.lng) : null;
      };
      L.polyline = function (ll, o) {
        if (capture && o) vus.push({ g: "line", color: o.color, x: x0(ll) });
        return oL.apply(this, arguments);
      };
      L.polygon = function (ll, o) {
        if (capture && o) vus.push({ g: "poly", fill: o.fillColor, x: x0(ll) });
        return oP.apply(this, arguments);
      };
      capture = true;
      window.EmergencyMode.activer();
      await new Promise(function (r) { setTimeout(r, 2500); });
      capture = false;
      window.EmergencyMode.desactiver();
      L.polyline = oL; L.polygon = oP;

      const ligne = function (x, h) {
        return vus.some(function (v) {
          return v.g === "line" && v.x === x && String(v.color).toLowerCase() === h;
        });
      };
      const fond = function (x, h) {
        return vus.some(function (v) {
          return v.g === "poly" && v.x === x && String(v.fill).toLowerCase() === h;
        });
      };
      return {
        injecte: injecte, total: vus.length,
        traceChoisi: ligne(201, "#ff00ff"), traceBase: ligne(201, "#27c97e"),
        customChoisi: ligne(203, "#123456"), customRepli: ligne(203, "#f4c542"),
        zoneChoisie: fond(202, "#00ff88"), zoneBase: fond(202, "#60a5fa")
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
