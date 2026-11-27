#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-flyout-defilement.js — checkup de release : défilement des panneaux `.kta-group-flyout` au téléphone
// =====================================================================
// Au doigt, la barre de défilement n'apparaît qu'au geste : sans indice, rien ne dit qu'il reste des boutons plus bas
// (Structures : 8 types, types personnalisés, ➕, Détecter, Additionner, Terminer, Effacer). Chromium puis WebKit
// (KTA_MOTEURS), en émulation téléphone : iPhone SE portrait 375×667 et paysage 667×375, grand téléphone 412×915 ;
// thème clair rejoué en 375×667. Relevé fictif (sinon le premier plan de l'index, nom jamais affiché) ; 6 types de
// structure personnalisés ajoutés EN MÉMOIRE (session du contexte éphémère) pour forcer le débordement.
// Pour CHAQUE groupe à panneau de la barre, plus le panneau Fond de carte (calage fictif prêté en mémoire, fond jamais
// allumé, tuiles bloquées) :
//   D1 le panneau tient entre la barre du haut et la barre d'état ;
//   D2 il déborde → fondu bas allumé (et fondu haut éteint) avant défilement ; il tient → aucun fondu ;
//   D3 le fondu ne prend pas le toucher : un bouton à moitié caché sous lui reste celui que trouve elementFromPoint ;
//   D4 défilé jusqu'au dernier bouton : entièrement visible sous l'en-tête, elementFromPoint au centre = le bouton,
//      fondu bas éteint, fondu haut allumé (si ça débordait), croix d'en-tête jamais couverte, aucun bouton visible
//      au-dessus de l'en-tête collant ;
//   D5 Tracés / Zones / Structures : séparateur + rubrique « Outils » entre le dernier type et le premier outil ;
//   D6 fondus peints dans la couleur du panneau (jeton --kta-surface, sombre et clair) ;
//   D7 liste qui change (boutons ajoutés sans resize, type personnalisé ajouté panneau ouvert) et rotation : indices
//      remis à jour.
// Usage : node scripts/smoke/checkup-flyout-defilement.js   (SMOKE_PORT pour une copie de travail, KTA_MOTEURS)
"use strict";

const lanceur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const FORMATS = [
  { nom: "iPhone SE portrait", vp: { width: 375, height: 667 }, theme: "dark" },
  { nom: "iPhone SE paysage",  vp: { width: 667, height: 375 }, theme: "dark" },
  { nom: "grand téléphone",    vp: { width: 412, height: 915 }, theme: "dark" },
  { nom: "iPhone SE portrait clair", vp: { width: 375, height: 667 }, theme: "light" }
];
const RE_TUILES = /tile\.openstreetmap\.org|data\.geopf\.fr|wxs\.ign\.fr/;

const problemes = [];
let nbOk = 0;
let moteurCourant = "";
function pb(msg) { msg = "[" + moteurCourant + "] " + msg; problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { nbOk++; console.log("  ✅ " + msg); }
function verifier(cond, msg, detail) {
  if (cond) ok(msg); else pb(msg + (detail !== undefined ? " — " + JSON.stringify(detail) : ""));
}

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  const fictif = await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
    return /fictif/i.test(p.name || "");
  });
  if (!fictif) console.log("  •  relevé fictif absent de l'index : premier plan utilisé (nom non affiché)");
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window._groupes;
  }, 60000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    if (window.getTrackingActif && window.getTrackingActif()) window.stopTracking();
  });
  await page.waitForTimeout(300);
}

// Types de structure d'essai : la liste de Structures déborde même en grand téléphone.
async function ajouterTypes(page, cat, n, prefixe) {
  await page.evaluate(function (a) {
    for (let i = 1; i <= a.n; i++) {
      window.LegendCustomization.addCustomEntry({
        category: a.cat, label: a.prefixe + " " + i, geometry: "polygon", fillColor: "#7a8899", borderColor: "#445566"
      });
    }
  }, { cat: cat, n: n, prefixe: prefixe });
}

// Mesures du panneau ouvert, sans défiler. Rend aussi l'état des fondus (classe + opacité calculée du pseudo-élément).
function mesurer(sel) {
  const fly = document.querySelector(sel);
  if (!fly) return { absent: true };
  const h = document.getElementById("kta-refonte-header");
  const s = document.getElementById("kta-refonte-statusbar");
  const rh = h && h.getBoundingClientRect().height > 0 ? h.getBoundingClientRect() : null;
  const rs = s && s.getBoundingClientRect().height > 0 ? s.getBoundingClientRect() : null;
  const rf = fly.getBoundingClientRect();
  const entete = fly.querySelector(".kta-group-flyout-header");
  const fonduBas = getComputedStyle(fly, "::after");
  const fonduHaut = entete ? getComputedStyle(entete, "::after") : null;
  return {
    haut: Math.round(rf.top), bas: Math.round(rf.bottom), ecran: innerHeight,
    barreHaut: rh ? Math.round(rh.bottom) : 0, barreBas: rs ? Math.round(rs.top) : innerHeight,
    deborde: fly.scrollHeight > fly.clientHeight + 2,
    scrollTop: Math.round(fly.scrollTop),
    bas1: fly.classList.contains("kta-flyout-suite-bas") && fonduBas.opacity === "1",
    haut1: fly.classList.contains("kta-flyout-suite-haut") && !!fonduHaut && fonduHaut.opacity === "1",
    fondPanneau: getComputedStyle(fly).backgroundColor,
    degradeBas: fonduBas.backgroundImage, degradeHaut: fonduHaut ? fonduHaut.backgroundImage : "",
    pointerBas: fonduBas.pointerEvents, pointerHaut: fonduHaut ? fonduHaut.pointerEvents : ""
  };
}

// D3 : un bouton coupé par le bas du panneau (donc sous le fondu) reste touchable.
function sousLeFondu(sel) {
  const fly = document.querySelector(sel);
  const rf = fly.getBoundingClientRect();
  const y = rf.bottom - 14;
  const btns = Array.from(fly.querySelectorAll("button.kta-group-flyout-btn"));
  const b = btns.find(function (x) { const r = x.getBoundingClientRect(); return r.top < y - 2 && r.bottom > y + 2; });
  if (!b) return { aucun: true };
  const r = b.getBoundingClientRect();
  const e = document.elementFromPoint(r.left + r.width / 2, y);
  return { touche: !!(e && (e === b || b.contains(e))), quoi: e ? (e.className || e.tagName) : null };
}

function defilerEnBas(sel) {
  const fly = document.querySelector(sel);
  const btns = fly.querySelectorAll("button.kta-group-flyout-btn");
  const dernier = btns[btns.length - 1];
  if (dernier) dernier.scrollIntoView({ block: "nearest" });
  fly.scrollTop = fly.scrollHeight;
}

function dernierBouton(sel) {
  const fly = document.querySelector(sel);
  const btns = fly.querySelectorAll("button.kta-group-flyout-btn");
  const d = btns[btns.length - 1];
  if (!d) return { aucun: true };
  const rd = d.getBoundingClientRect(), rf = fly.getBoundingClientRect();
  const entete = fly.querySelector(".kta-group-flyout-header");
  const re = entete ? entete.getBoundingClientRect() : { bottom: rf.top };
  const e = document.elementFromPoint(rd.left + rd.width / 2, rd.top + rd.height / 2);
  const croix = fly.querySelector(".kta-group-flyout-close");
  const rc = croix ? croix.getBoundingClientRect() : null;
  const ec = rc ? document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2) : null;
  // Liste défilée : aucun bouton ne doit rester visible au-dessus de l'en-tête collant (bande du padding).
  const ea = document.elementFromPoint(rf.left + rf.width / 2, rf.top + 4);
  return {
    rienAuDessus: !(ea && ea.closest && ea.closest("button.kta-group-flyout-btn")),
    entier: rd.top >= re.bottom - 0.5 && rd.bottom <= rf.bottom + 0.5,
    sousDoigt: !!(e && (e === d || d.contains(e))), quoi: e ? (e.className || e.tagName) : null,
    croixLibre: !croix || !!(ec && (ec === croix || croix.contains(ec)))
  };
}

function rubrique(sel) {
  const grille = document.querySelector(sel + " .kta-group-flyout-grid");
  if (!grille) return { pasDeGrille: true };
  const enfants = Array.from(grille.children);
  const types = enfants.filter(function (e) { return e.dataset && e.dataset.typeAction === "1"; });
  const outils = enfants.filter(function (e) { return e.tagName === "BUTTON" && !(e.dataset && e.dataset.typeAction); });
  const rub = grille.querySelector(".kta-group-flyout-rubrique");
  const iRub = enfants.indexOf(rub);
  return {
    mixte: types.length > 0 && outils.length > 0,
    present: !!rub, texte: rub ? rub.textContent : null, attendu: window.I18n.t("ui.flyout.outils"),
    sepAvant: iRub > 0 && enfants[iRub - 1].classList.contains("kta-group-flyout-sep"),
    apresTypes: iRub > enfants.indexOf(types[types.length - 1]),
    avantOutils: iRub >= 0 && outils.length > 0 && iRub < enfants.indexOf(outils[0])
  };
}

// Couleur du panneau dans le dégradé (pas de couleur en dur : le jeton suit le thème).
function memeFond(m) {
  return m.degradeBas.indexOf(m.fondPanneau) >= 0 && m.degradeHaut.indexOf(m.fondPanneau) >= 0;
}

async function controlerPanneau(page, etiquette, sel, opts) {
  const o = opts || {};
  await page.waitForTimeout(350);   // ouverture animée + fondu (transition 0,15 s)
  const m = await page.evaluate(mesurer, sel);
  if (m.absent) { pb(etiquette + " : le panneau ne s'ouvre pas"); return null; }
  verifier(m.haut >= m.barreHaut && m.bas <= m.barreBas,
    etiquette + " : D1 panneau " + m.haut + "→" + m.bas + " dans la bande " + m.barreHaut + "→" + m.barreBas);
  if (m.deborde) {
    verifier(m.bas1 && !m.haut1, etiquette + " : D2 déborde → fondu bas allumé, fondu haut éteint", m);
    verifier(m.pointerBas === "none" && m.pointerHaut === "none", etiquette + " : D3 fondus en pointer-events none",
      { bas: m.pointerBas, haut: m.pointerHaut });
    const t = await page.evaluate(sousLeFondu, sel);
    if (!t.aucun) verifier(t.touche, etiquette + " : D3 bouton sous le fondu toujours touchable", t);
  } else {
    verifier(!m.bas1 && !m.haut1, etiquette + " : D2 tout tient → aucun fondu", m);
  }
  if (o.theme) {
    verifier(memeFond(m), etiquette + " : D6 fondus dans la couleur du panneau (" + o.theme + ")",
      { fond: m.fondPanneau, bas: m.degradeBas, haut: m.degradeHaut });
  }
  if (o.rubrique) {
    const r = await page.evaluate(rubrique, sel);
    if (r.mixte) {
      verifier(r.present && r.texte === r.attendu && r.sepAvant && r.apresTypes && r.avantOutils,
        etiquette + " : D5 séparateur + « " + r.attendu + " » entre types et outils", r);
    } else if (o.rubriqueExigee) {
      pb(etiquette + " : D5 groupe sans types ET outils (rien à séparer ?)");
    } else {
      verifier(!r.present, etiquette + " : D5 pas de rubrique dans un groupe sans types", r);
    }
  }
  await page.evaluate(defilerEnBas, sel);
  await page.waitForTimeout(300);
  const m2 = await page.evaluate(mesurer, sel);
  const d = await page.evaluate(dernierBouton, sel);
  if (d.aucun) { pb(etiquette + " : aucun bouton dans le panneau"); return m; }
  verifier(d.entier && d.sousDoigt && d.croixLibre && d.rienAuDessus,
    etiquette + " : D4 dernier bouton entier sous l'en-tête et sous le doigt, croix libre, rien au-dessus", d);
  verifier(!m2.bas1 && (m.deborde ? m2.haut1 : !m2.haut1),
    etiquette + " : D4 en bas de liste → fondu bas éteint" + (m.deborde ? ", fondu haut allumé" : ""), m2);
  return m;
}

async function fermerFlyout(page) {
  await page.evaluate(function () {
    if (window.ktaFermerOutils) window.ktaFermerOutils();
    if (window.FondOsmPlan && window.FondOsmPlan.fermerPanneau) window.FondOsmPlan.fermerPanneau();
  });
  await page.waitForTimeout(150);
}

async function groupesAFlyout(page) {
  return page.evaluate(function () {
    return Object.keys(window._groupes).filter(function (id) {
      const g = window._groupes[id];
      return g && g.useFlyout && g.btnPrincipal && g.btnPrincipal.offsetParent;
    });
  });
}

async function ouvrirGroupe(page, id) {
  await page.evaluate(function (g) { window._groupes[g].btnPrincipal.click(); }, id);
}

async function controlerFond(page, f) {
  const pret = await page.evaluate(function () {
    const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
    // Calage fictif en mer, en mémoire seulement (jamais écrit dans data/).
    window.PLAN_CONFIG.plan.georef = {
      pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
      pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2.4e-6 },
      modele: "local"
    };
    const b = document.getElementById("kta-refonte-counter-osm");
    if (!window.FondOsmPlan || !b) return false;
    window.FondOsmPlan.majBouton(b);
    window.FondOsmPlan.basculerPanneau(b);
    return !!document.querySelector(".kta-fond-osm-panneau");
  });
  if (!pret) { pb(f.nom + " · Fond de carte : panneau introuvable"); return; }
  await controlerPanneau(page, f.nom + " · Fond de carte", ".kta-fond-osm-panneau", { theme: f.theme });
  await fermerFlyout(page);
}

// D7 : la liste change sans resize (boutons ajoutés), un type est ajouté panneau ouvert, l'écran tourne.
async function controlerDynamique(page, f) {
  const sel = ".kta-group-flyout:not(.kta-fond-osm-panneau)";
  await ouvrirGroupe(page, "favoris");
  await page.waitForTimeout(350);
  const avant = await page.evaluate(mesurer, sel);
  if (!avant.absent && !avant.deborde) {
    await page.evaluate(function () {
      const g = document.querySelector(".kta-group-flyout .kta-group-flyout-grid");
      const modele = g && g.querySelector(".kta-group-flyout-btn");
      for (let i = 0; i < 30 && modele; i++) {
        const c = modele.cloneNode(true); c.setAttribute("data-clone", "1"); g.appendChild(c);
      }
    });
    await page.waitForTimeout(300);
    const apres = await page.evaluate(mesurer, sel);
    verifier(apres.deborde && apres.bas1, f.nom + " : D7 boutons ajoutés sans resize → fondu bas allumé", apres);
  } else {
    console.log("  •  " + f.nom + " : Favoris déborde déjà ou absent, contrôle « liste allongée » sauté");
  }
  await fermerFlyout(page);

  await ouvrirGroupe(page, "zones");
  await page.waitForTimeout(350);
  await ajouterTypes(page, "zones", 12, "Zone d'essai");
  await page.waitForTimeout(400);
  const z = await page.evaluate(function (s) {
    const fly = document.querySelector(s);
    return fly ? { ouvert: true, n: fly.querySelectorAll("[data-custom-type]").length } : { ouvert: false };
  }, sel);
  const mz = await page.evaluate(mesurer, sel);
  verifier(z.ouvert && z.n >= 12 && mz.deborde === mz.bas1,
    f.nom + " : D7 types ajoutés panneau ouvert → liste reconstruite, fondu bas = débordement", { z: z, m: mz });
  await fermerFlyout(page);

  await ouvrirGroupe(page, "structures");
  await page.waitForTimeout(350);
  const tourne = { width: f.vp.height, height: f.vp.width };
  await page.setViewportSize(tourne);
  await page.waitForTimeout(600);
  const mr = await page.evaluate(mesurer, sel);
  verifier(!mr.absent && mr.haut >= mr.barreHaut && mr.bas <= mr.barreBas && mr.deborde === mr.bas1,
    f.nom + " : D7 rotation " + tourne.width + "×" + tourne.height + " panneau ouvert → bande et fondu à jour", mr);
  await page.setViewportSize(f.vp);
  await page.waitForTimeout(600);
  const mr2 = await page.evaluate(mesurer, sel);
  verifier(!mr2.absent && mr2.deborde === mr2.bas1, f.nom + " : D7 retour à " + f.vp.width + "×" + f.vp.height, mr2);
  await fermerFlyout(page);
}

async function jouerFormat(nav, moteur, f) {
  const ctx = await nav.newContext({ viewport: f.vp, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  await page.route(RE_TUILES, function (route) { route.abort(); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, Object.assign({}, LS_PREGATES, { "myktamap_theme_v1": f.theme }));
  console.log("\n── " + moteur + " · " + f.nom + " " + f.vp.width + "×" + f.vp.height);
  try {
    await ouvrirPlan(page);
    await ajouterTypes(page, "structures", 6, "Type d'essai");
    await page.waitForTimeout(300);
    const groupes = await groupesAFlyout(page);
    verifier(groupes.indexOf("structures") >= 0, f.nom + " : groupe Structures présent (" + groupes.join(", ") + ")");
    const sel = ".kta-group-flyout:not(.kta-fond-osm-panneau)";
    for (const id of groupes) {
      await ouvrirGroupe(page, id);
      const m = await controlerPanneau(page, f.nom + " · " + id, sel, {
        rubrique: true, rubriqueExigee: id === "structures", theme: id === "structures" ? f.theme : null
      });
      if (id === "structures" && m && !m.deborde) pb(f.nom + " · structures : ne déborde pas malgré 6 types ajoutés");
      await fermerFlyout(page);
    }
    await controlerFond(page, f);
    if (f.theme === "dark") await controlerDynamique(page, f);
  } catch (e) {
    pb(moteur + " · " + f.nom + " : harnais — " + String(e.message || e).split("\n")[0]);
  }
  if (erreurs.length) pb(moteur + " · " + f.nom + " : " + erreurs.length + " erreur(s) JS — " + erreurs[0]);
  await ctx.close();
}

(async function main() {
  try {
    for (const moteur of lanceur.moteurs()) {
      moteurCourant = moteur;
      const nav = await lanceur.lancerMoteur(moteur);
      if (!nav) continue;   // WebKit absent : annoncé par lancerMoteur
      try {
        for (const f of FORMATS) await jouerFormat(nav, moteur, f);
      } finally {
        await nav.close();
      }
    }
  } catch (e) {
    pb("harnais : " + String(e.message || e).split("\n")[0]);
  }
  await lanceur.fermerTout();
  server.close();
  console.log("\n" + nbOk + " contrôle(s) OK, " + problemes.length + " problème(s)");
  if (problemes.length) {
    console.log("❌ défilement des panneaux : " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 panneaux : dans la bande, fondus justes, dernier bouton atteint, rubrique « Outils »");
})();
