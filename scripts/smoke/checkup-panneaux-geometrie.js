#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-panneaux-geometrie.js — checkup de release (pas un hook) des panneaux d'outils du mode plan
// =====================================================================
// Vérifie au pixel que `.kta-group-flyout` (Tracés, Zones, Structures, Favoris) reste utilisable :
// 4 formats (téléphone portrait/paysage, petit paysage, PC) × centré/ancré × 4 panneaux, liste allongée
// à 22 boutons (un plan importé ajoute un type par niveau).
// 🩸 un panneau peut passer SOUS le footer en paysage (ordre des z-index) : le bas de liste reste caché,
// même scrollé, sans erreur console ni prise pour un garde-fou statique.
//   G1 le panneau tient entre la barre du haut et le footer ;
//   G2 le DERNIER bouton, scrollé, est sous le doigt (`elementFromPoint` = le bouton, pas le footer) ;
//   G3 centré : fond posé et croix ≥ 36 px ; au toucher, croix ≥ 40 px dans les deux modes ;
//   G4 toucher la carte pour fermer n'ajoute AUCUN sommet au tracé armé, le toucher suivant en ajoute un ;
//   G5 boutons de zoom (réglage activé) empilés, + au-dessus de −.
// Usage : node scripts/smoke/checkup-panneaux-geometrie.js
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

// Le relevé fictif s'il est dans l'index, sinon le premier plan, dont on ne logue PAS le nom (relevé réel)
function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) {
    return { nom: "Relevé fictif de test", fictif: true };
  }
}
const PLAN = planAOuvrir();

const FORMATS = [
  { nom: "téléphone portrait",  vp: { width: 390,  height: 844 }, touch: true  },
  { nom: "téléphone paysage",   vp: { width: 844,  height: 390 }, touch: true  },
  { nom: "petit paysage",       vp: { width: 640,  height: 360 }, touch: true  },
  { nom: "PC",                  vp: { width: 1366, height: 800 }, touch: false }
];
const GROUPES = ["traces", "zones", "structures", "favoris"];

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  // Clic DOM sur la ligne (en contexte tactile, le clic souris de l'automate n'ouvre pas le plan).
  const trouve = await page.evaluate(function (nom) {
    const rows = Array.from(document.querySelectorAll(".plan-row"));
    const r = rows.find(function (x) { return x.textContent.indexOf(nom) >= 0; }) || rows[0];
    if (r) r.click();
    return !!r;
  }, PLAN.nom);
  if (!trouve) throw new Error("aucun plan dans « Mes plans »");
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window._groupes; }, 60000);
  await page.waitForTimeout(2000);
}

async function geste(page, touch, x, y) {
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}

async function controlerPanneau(page, f, mode, gid) {
  const etiquette = f.nom + " · " + mode + " · " + gid;
  const ouvert = await page.evaluate(function (g) {
    const grp = window._groupes[g];
    if (!grp || !grp.btnPrincipal || !grp.btnPrincipal.offsetParent) return false;
    grp.btnPrincipal.click();
    return true;
  }, gid);
  if (!ouvert) { console.log("  •  " + etiquette + " : groupe absent sur ce plan, ignoré"); return; }
  await page.waitForTimeout(300);

  const r = await page.evaluate(function () {
    const fly = document.querySelector(".kta-group-flyout");
    if (!fly) return { absent: true };
    // Liste allongée à 22 boutons (clones inertes) puis repositionnement réel.
    const grille = fly.querySelector(".kta-group-flyout-grid");
    const modele = grille && grille.querySelector(".kta-group-flyout-btn");
    if (modele) {
      while (grille.querySelectorAll(".kta-group-flyout-btn").length < 22) {
        const c = modele.cloneNode(true); c.setAttribute("data-clone", "1"); grille.appendChild(c);
      }
    }
    window.dispatchEvent(new Event("resize"));
    const rf = fly.getBoundingClientRect();
    const h = document.getElementById("kta-refonte-header");
    const s = document.getElementById("kta-refonte-statusbar");
    const rh = h ? h.getBoundingClientRect() : null;
    const rs = s ? s.getBoundingClientRect() : null;
    const btns = fly.querySelectorAll(".kta-group-flyout-btn");
    const dernier = btns[btns.length - 1];
    if (dernier) dernier.scrollIntoView({ block: "nearest" });
    const rd = dernier ? dernier.getBoundingClientRect() : null;
    const sous = rd ? document.elementFromPoint(rd.left + rd.width / 2, rd.top + rd.height / 2) : null;
    const croix = fly.querySelector(".kta-group-flyout-close");
    const rc = croix ? croix.getBoundingClientRect() : null;
    return {
      haut: Math.round(rf.top), bas: Math.round(rf.bottom), ecran: innerHeight,
      barreHaut: rh && rh.height > 0 ? Math.round(rh.bottom) : null,
      barreBas: rs && rs.height > 0 ? Math.round(rs.top) : null,
      dernierAtteint: !!(sous && dernier && (sous === dernier || dernier.contains(sous))),
      fond: !!document.querySelector(".kta-group-flyout-fond"),
      croix: rc ? Math.round(Math.min(rc.width, rc.height)) : 0
    };
  });
  if (r.absent) { pb(etiquette + " : le panneau ne s'ouvre pas"); return; }
  const limH = r.barreHaut != null ? r.barreHaut : 0;
  const limB = r.barreBas != null ? r.barreBas : r.ecran;
  if (r.haut < limH || r.bas > limB) {
    pb(etiquette + " : panneau " + r.haut + "→" + r.bas + " hors de la bande utile " + limH + "→" + limB);
  } else if (!r.dernierAtteint) {
    pb(etiquette + " : dernier bouton inatteignable (caché sous une barre)");
  } else if (mode === "centré" && (!r.fond || r.croix < 36)) {
    pb(etiquette + " : habillage centré incomplet (fond " + r.fond + ", croix " + r.croix + " px)");
  } else if (mode === "ancré" && r.fond) {
    pb(etiquette + " : fond posé en mode ancré");
  } else if (f.touch && r.croix < 40) {
    // 🩸 une règle « pointer: coarse » placée AVANT les règles de base est sans effet (croix 36/24 px).
    pb(etiquette + " : croix de " + r.croix + " px au toucher (40 attendus)");
  } else {
    ok(etiquette + " : " + r.haut + "→" + r.bas + " dans " + limH + "→" + limB + ", dernier bouton atteint");
  }
  await page.evaluate(function () {
    const c = document.querySelector(".kta-group-flyout-close"); if (c) c.click();
  });
  await page.waitForTimeout(200);
}

async function controlerTapFermeture(page, f) {
  // Arme le premier type de tracé, rouvre le panneau, touche la carte.
  await page.evaluate(function () { window._groupes.traces.btnPrincipal.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(function () {
    const b = document.querySelector(".kta-group-flyout .kta-group-flyout-btn"); if (b) b.click();
  });
  await page.waitForTimeout(300);
  const nb = function () {
    return page.evaluate(function () {
      return (window.getRoads ? window.getRoads() : []).reduce(function (n, r) {
        return n + ((r.points || r.coords || []).length);
      }, 0);
    });
  };
  const arme = await page.evaluate(function () { return !!window.modeRoad; });
  if (!arme) { pb(f.nom + " : impossible d'armer un tracé pour G4"); return; }
  const avant = await nb();
  await page.evaluate(function () { window._groupes.traces.btnPrincipal.click(); });
  await page.waitForTimeout(300);
  // Point de la carte HORS du panneau (centré, il couvre le milieu) et hors des barres.
  const pt = await page.evaluate(function () {
    const r = document.querySelector(".kta-group-flyout").getBoundingClientRect();
    const s = document.getElementById("kta-refonte-statusbar");
    const bas = s && s.getBoundingClientRect().height > 0 ? s.getBoundingClientRect().top : innerHeight;
    const x = (r.right + 40 < innerWidth - 70) ? r.right + 40 : Math.max(80, r.left - 40);
    return { x: x, y: Math.min(bas - 40, r.top + r.height * 0.6) };
  });
  const x = pt.x, y = pt.y;
  await geste(page, f.touch, x, y);
  await page.waitForTimeout(800);
  const apres = await nb();
  await geste(page, f.touch, x, y - 30);
  await page.waitForTimeout(800);
  const apres2 = await nb();
  if (apres !== avant) pb(f.nom + " : fermer le panneau en touchant la carte a ajouté " + (apres - avant) + " sommet(s)");
  else if (apres2 !== apres + 1) pb(f.nom + " : le toucher suivant n'a pas posé de sommet (" + (apres2 - apres) + ")");
  else ok(f.nom + " : fermeture au toucher = 0 sommet, toucher suivant = 1");
  await page.evaluate(function () { if (window.modeRoad && window.toggleRoadMode) window.toggleRoadMode(window.modeRoad); });
}

async function controlerZoom(page, f) {
  const z = await page.evaluate(function () {
    window.APP_CONFIG.zoomBoutons = true;
    if (window.ktaBoutonsZoomPartout) window.ktaBoutonsZoomPartout();
    const c = document.querySelector("#map .leaflet-control-zoom");
    if (!c) return null;
    const p = c.querySelector(".leaflet-control-zoom-in").getBoundingClientRect();
    const m = c.querySelector(".leaflet-control-zoom-out").getBoundingClientRect();
    return { empile: m.top >= p.bottom - 1 };
  });
  if (!z) pb(f.nom + " : réglage « Boutons de zoom » activé, aucun bouton sur la carte");
  else if (!z.empile) pb(f.nom + " : boutons de zoom côte à côte");
  else ok(f.nom + " : boutons de zoom empilés");
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  if (!PLAN.fictif) {
    console.log("  •  relevé fictif absent de data/index.json : premier plan de l'index utilisé (nom non affiché)");
  }
  try {
    for (const f of FORMATS) {
      for (const mode of ["centré", "ancré"]) {
        const ctx = await nav.newContext({ viewport: f.vp, hasTouch: f.touch, isMobile: f.touch });
        const page = await ctx.newPage();
        const erreurs = [];
        page.on("pageerror", function (e) { erreurs.push(e.message); });
        await page.addInitScript(function (ls) {
          for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
        }, LS_PREGATES);
        console.log("\n── " + f.nom + " " + f.vp.width + "×" + f.vp.height + " · " + mode);
        await ouvrirPlan(page);
        await page.evaluate(function (ancre) { window.APP_CONFIG.panneauxAncres = ancre; }, mode === "ancré");
        for (const g of GROUPES) await controlerPanneau(page, f, mode, g);
        if (mode === "centré") {
          await controlerTapFermeture(page, f);
          await controlerZoom(page, f);
        }
        if (erreurs.length) pb(f.nom + " · " + mode + " : " + erreurs.length + " erreur(s) JS — " + erreurs[0]);
        await ctx.close();
      }
    }
  } catch (e) {
    pb("harnais : " + e.message.split("\n")[0]);
  }
  await nav.close();
  server.close();
  console.log("");
  if (problemes.length) {
    console.log("❌ " + problemes.length + " problème(s) de géométrie des panneaux");
    process.exit(1);
  }
  console.log("🎉 panneaux d'outils : dans l'écran, dernier bouton atteint, aucun tracé parasite, sur 4 formats");
})();
