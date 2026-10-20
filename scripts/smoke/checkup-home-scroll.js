#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-home-scroll.js — checkup de RELEASE (Playwright, pas un hook) : en petite fenêtre PC, le HOME
// reste atteignable. À chaque taille :
//   1. page dégagée (aucun overlay sous le curseur), sinon ABANDON plutôt qu'un faux vert ;
//   2. si le contenu déborde, la MOLETTE scrolle vraiment (`scrollTop = n` réussit même quand un handler
//      `wheel` mange l'événement) ;
//   3. après scroll, le footer est entièrement dans la viewport ;
//   4. avant tout scroll, « Charger ce plan » est dans la partie VISIBLE de #panelZip, et à ≥ 800 px de
//      haut #panelZip ne cache rien (sinon le bouton part dans le scroll interne, page non débordante).
// 🩸 Le splash (retiré du DOM après ~4 s) et la modale « Accès hors-ligne » (SW bloqué) figent
//    `scrollHeight` et interceptent la molette : mesurer trop tôt invente un bug de scroll. Le script
//    attend le DÉTACHEMENT du splash, retire la modale, et refuse de conclure sans l'avoir fait.
// ⚠️ Ni thème clair ni colonne OSM (pas de réseau). Zoom navigateur émulé comme Chrome (viewport =
//    fenêtre ÷ zoom, deviceScaleFactor = zoom) ; `body.style.zoom` ne déclencherait ni médias ni viewport.
// Usage : node scripts/smoke/checkup-home-scroll.js
// =====================================================================

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge
const server = require("./server.js");

const URL = "http://127.0.0.1:8123/index.html";

// Le HOME est derrière la gate : on pré-remplit les clés de déverrouillage.
const LS = {
  myktamap_unlock_v1: "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  myktamap_terms_accepted_v1: "1",
  myktamap_pin_proposal_done_v1: "1",
  myktamap_tutorial_seen_v1: "1",
  myktamap_osm_view_opt_in: "true",
  myktamap_last_plan_id: "p1",
  myktamap_home_footer_replie_v1: "false"   // footer DÉPLIÉ = pire cas de hauteur
};
(function seedPlans() {
  const plans = [];
  for (let i = 1; i <= 8; i++) {
    plans.push({ id: "p" + i, name: "Carriere de test " + i, type: "local", lastOpened: 100 - i });
  }
  LS.myktamap_plans_registry_v1 = JSON.stringify({ plans: plans });
})();

// Largeur × hauteur [× zoom]. 1536×800 = portable 1080p à 125 % Windows, la config la plus serrée ;
// son zoom navigateur 125 % = 1229×640 à dsf 1,25.
const CONFIGS = [
  [1366, 768], [1366, 600], [1366, 560],
  [1600, 650], [1920, 700], [1280, 500],
  [1536, 800], [1536, 800, 1.25]
];

const echecs = [];

async function testerConfig(nav, W, H, zoom) {
  zoom = zoom || 1;
  const ctx = await nav.newContext({
    serviceWorkers: "block",
    viewport: { width: Math.round(W / zoom), height: Math.round(H / zoom) },
    deviceScaleFactor: zoom
  });
  const p = await ctx.newPage();
  const nom = W + "×" + H + (zoom !== 1 ? " @" + Math.round(zoom * 100) + "%" : "");
  try {
    await p.addInitScript(function (ls) {
      for (const k in ls) localStorage.setItem(k, ls[k]);
    }, LS);
    await p.goto(URL, { waitUntil: "domcontentloaded" });

    // 1) Le splash est RETIRÉ DU DOM après ~4 s (js/ktaSplash.js).
    //    🩸 Pas `display`/`opacity`/`offsetParent` : en `position:fixed`, `offsetParent` vaut null même
    //    quand il couvre tout l'écran.
    await p.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 })
      .catch(function () {});
    await p.waitForTimeout(700);

    // 2) La modale « Accès hors-ligne » apparaît car on bloque le SW.
    await p.evaluate(function () {
      const m = document.getElementById("kta-alert-modal");
      if (m) m.remove();
    });
    await p.waitForTimeout(300);

    // 3) GARDE ANTI-FAUX-VERT : plus rien ne doit couvrir la zone survolée.
    const obstacle = await p.evaluate(function () {
      const e = document.elementFromPoint(300, 150);
      if (!e) return "aucun element";
      const cs = getComputedStyle(e);
      if (cs.position === "fixed" && parseInt(cs.zIndex, 10) >= 5000 && e.id !== "planLoaderOverlay") {
        return (e.id || e.className || e.tagName) + " (z=" + cs.zIndex + ")";
      }
      return null;
    });
    if (obstacle) {
      echecs.push(nom + " : un overlay couvre encore la page (" + obstacle + ") — " +
                  "mesure ABANDONNÉE. Conclure ici donnerait un faux bug de scroll.");
      return;
    }

    // 4 bis) Bouton primaire, avant tout scroll : #panelZip scrolle en interne sous 821 px de haut,
    //    « Charger ce plan » y est épinglé en bas.
    const prim = await p.evaluate(function () {
      const pz = document.getElementById("panelZip");
      const b = document.getElementById("loadPlanBtn");
      if (!pz || !b) return null;
      const zr = pz.getBoundingClientRect(), br = b.getBoundingClientRect();
      return {
        caches: Math.max(0, pz.scrollHeight - pz.clientHeight),
        dansPanel: br.top >= zr.top - 1 && br.bottom <= zr.bottom + 1,
        btnBas: Math.round(br.bottom), panelBas: Math.round(zr.bottom)
      };
    });
    if (!prim) {
      echecs.push(nom + " : #panelZip ou #loadPlanBtn introuvable — le HOME n'a pas la structure attendue.");
      return;
    }
    if (!prim.dansPanel) {
      echecs.push(nom + " : « Charger ce plan » est HORS de la partie visible de #panelZip " +
                  "(bas du bouton " + prim.btnBas + " px, bas visible du panel " + prim.panelBas + " px). " +
                  "Le bouton primaire est parti dans le scroll interne : l'épinglage (sticky) a sauté.");
    }
    const hauteurCss = Math.round(H / zoom);
    if (hauteurCss >= 800 && prim.caches > 0) {
      echecs.push(nom + " : à " + hauteurCss + " px de haut, #panelZip cache encore " + prim.caches +
                  " px. Un bloc a grossi dans la colonne Actions (formats, hints, Outils) : " +
                  "à comprimer côté décoratif, pas à laisser scroller sur un écran de cette taille.");
    }

    // 4) Scroll à la MOLETTE (pas `scrollTop = n`, qui ne prouverait rien).
    await p.evaluate(function () {
      const ov = document.getElementById("planLoaderOverlay");
      if (ov) ov.scrollTop = 0;
    });
    await p.mouse.move(Math.round(W * 0.5), Math.round(H * 0.5));
    for (let i = 0; i < 14; i++) {
      await p.mouse.wheel(0, 240);
      await p.waitForTimeout(40);
    }
    await p.waitForTimeout(400);

    const r = await p.evaluate(function () {
      const ov = document.getElementById("planLoaderOverlay");
      const f = document.getElementById("loaderFooterBlock");
      if (!ov || !f) return null;
      const fr = f.getBoundingClientRect();
      return {
        debord: ov.scrollHeight - ov.clientHeight,
        scrollTop: Math.round(ov.scrollTop),
        footerEntier: fr.bottom <= window.innerHeight + 1 && fr.top >= -1,
        footerBas: Math.round(fr.bottom),
        vp: window.innerHeight
      };
    });

    if (!r) {
      echecs.push(nom + " : #planLoaderOverlay ou #loaderFooterBlock introuvable — " +
                  "le HOME n'a pas la structure attendue (renommage ?).");
      return;
    }

    const scrollOk = r.debord <= 1 || r.scrollTop > 0;
    console.log(
      "  " + nom.padEnd(16) +
      " débord " + String(r.debord).padEnd(5) +
      " molette→ " + String(r.scrollTop).padEnd(5) +
      " footer " + (r.footerEntier ? "atteint" : "COUPÉ (bas=" + r.footerBas + " / vp=" + r.vp + ")").padEnd(9) +
      " · primaire " + (prim.dansPanel ? "visible" : "CACHÉ") +
      " · panelZip cache " + prim.caches + " px"
    );

    if (!scrollOk) {
      echecs.push(nom + " : le contenu déborde de " + r.debord + " px mais la MOLETTE ne " +
                  "scrolle pas (scrollTop reste 0). Un handler `wheel` intercepte, ou " +
                  "`overscroll-behavior` bloque le chaînage vers #planLoaderOverlay.");
    }
    if (!r.footerEntier) {
      echecs.push(nom + " : après scroll complet, le footer n'est pas entièrement visible " +
                  "(bas=" + r.footerBas + " px pour une viewport de " + r.vp + " px). " +
                  "C'est la dette D-home-mini qui revient : le pied de page devient inatteignable.");
    }
  } finally {
    await ctx.close();
  }
}

(async function () {
  console.log("🖥️  checkup HOME — scroll et footer en petite fenêtre\n");
  let nav;
  try {
    nav = await lancerNavigateur(chromium);
    for (const [W, H, Z] of CONFIGS) await testerConfig(nav, W, H, Z);
  } catch (e) {
    console.error("\n❌ checkup impossible : " + e.message);
    if (nav) await nav.close();
    server.close();
    process.exit(2);
  }
  await nav.close();
  server.close();

  if (!echecs.length) {
    console.log("\n🎉 HOME scrollable, footer atteignable et bouton primaire visible sur " + CONFIGS.length + " configurations");
    process.exit(0);
  }
  console.log("\n============================================================");
  console.log("🛑 HOME — pied de page inatteignable ou bouton primaire caché");
  console.log("============================================================");
  echecs.forEach(function (a) { console.log("\n   • " + a); });
  console.log("");
  process.exit(1);
})();
