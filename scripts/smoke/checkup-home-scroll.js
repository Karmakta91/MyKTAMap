#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🖥️ checkup-home-scroll.js — checkup de RELEASE (pas un hook pré-commit)
// =====================================================================
// Vérifie qu'en petite fenêtre PC le HOME reste ATTEIGNABLE : le contenu
// déborde (normal), mais il scrolle et le footer se rejoint à la molette.
//
// POURQUOI CE CHECKUP EXISTE (dette D-home-mini, refermée le 02/09/2026) :
// la dette décrivait « footer coupé SANS scroll possible, scrollHeight ne
// grandit pas ». Rediagnostiqué sur 9 configs (1366/1600/1920 × 500→1080) :
// NON REPRODUIT — le scroll marche partout. Le postulat « colonne Actions
// ~586 px incompressibles » était faux : elle est élastique (852 px à 1080
// de haut, 520 px à 560).
//
// 🩸 LA LEÇON, ET LA VRAIE RAISON DE CE FICHIER : pendant le rediagnostic,
// trois mesures successives ont été FAUSSÉES par un overlay qui couvrait la
// page — le splash (3,5 s minimum, `SPLASH_MIN_DURATION_MS` dans main.js) puis
// la modale `#kta-alert-modal` (« Accès hors-ligne », déclenchée quand le
// service worker est bloqué). Les deux figent `scrollHeight` et interceptent
// la molette : exactement le symptôme décrit par la dette. Un harnais qui
// mesure trop tôt invente un bug qui n'existe pas.
//   → Ce script attend le DÉTACHEMENT du splash (il est retiré du DOM, pas
//     masqué) puis retire la modale, et REFUSE de conclure sans l'avoir fait.
//
// CE QUI EST VÉRIFIÉ, à chaque hauteur :
//   1. la page est bien dégagée (aucun overlay sous le curseur) — sinon ABANDON
//      plutôt qu'un faux vert ;
//   2. si le contenu déborde, la molette scrolle VRAIMENT (pas `scrollTop = n`
//      en JS : ça marche même quand un handler mange l'événement) ;
//   3. après scroll, le footer est ENTIÈREMENT dans la viewport.
//
// ⚠️ Ne teste pas le rendu à zoom navigateur ≠ 100 %, ni le thème clair, ni la
// colonne OSM (invisible au harnais : pas de réseau pour les tuiles).
//
// Usage : node scripts/smoke/checkup-home-scroll.js
// =====================================================================

const { chromium } = require("playwright");
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

// Largeur × hauteur. Les hauteurs < 768 sont le domaine de la dette.
const CONFIGS = [
  [1366, 768], [1366, 600], [1366, 560],
  [1600, 650], [1920, 700], [1280, 500]
];

const echecs = [];

async function testerConfig(nav, W, H) {
  const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  const nom = W + "×" + H;
  try {
    await p.addInitScript(function (ls) {
      for (const k in ls) localStorage.setItem(k, ls[k]);
    }, LS);
    await p.goto(URL, { waitUntil: "domcontentloaded" });

    // 1) Le splash est RETIRÉ DU DOM après ~3,5 s (main.js > _splashEnd).
    //    Ne pas tester `display`/`opacity`/`offsetParent` : il est en
    //    `position:fixed`, donc `offsetParent` vaut null même quand il couvre
    //    tout l'écran — piège vécu, il rendait l'attente vraie trop tôt.
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

    // 4) Scroll À LA MOLETTE. `scrollTop = n` en JS réussit même si un
    //    handler `wheel` mange l'événement — ça ne prouverait rien.
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
      "  " + nom.padEnd(10) +
      " débord " + String(r.debord).padEnd(5) +
      " molette→ " + String(r.scrollTop).padEnd(5) +
      " footer " + (r.footerEntier ? "atteint" : "COUPÉ (bas=" + r.footerBas + " / vp=" + r.vp + ")")
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
    nav = await chromium.launch().catch(function () { return chromium.launch({ channel: "chromium" }); });
    for (const [W, H] of CONFIGS) await testerConfig(nav, W, H);
  } catch (e) {
    console.error("\n❌ checkup impossible : " + e.message);
    if (nav) await nav.close();
    server.close();
    process.exit(2);
  }
  await nav.close();
  server.close();

  if (!echecs.length) {
    console.log("\n🎉 HOME scrollable et footer atteignable sur " + CONFIGS.length + " configurations");
    process.exit(0);
  }
  console.log("\n============================================================");
  console.log("🛑 HOME — le pied de page devient inatteignable");
  console.log("============================================================");
  echecs.forEach(function (a) { console.log("\n   • " + a); });
  console.log("");
  process.exit(1);
})();
