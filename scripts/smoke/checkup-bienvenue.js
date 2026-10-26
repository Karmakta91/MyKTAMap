#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-bienvenue.js — checkup ciblé (marche 3 du RELEASE_GATE), non branché au pre-commit
// =====================================================================
// Écran Bienvenue avec ou sans mot de passe d'instance (js/bienvenue.js, css/bienvenue.css, js/unlockGate.js) et
// parcours d'arrivée (js/firstRunFlow.js), au téléphone 390×844 et au PC 1366×768 :
//   1. premier lancement : l'écran passe au-dessus du splash, polices de l'écran chargées, « réseau fictif »,
//      cibles ≥ 44 px, aucun débordement horizontal ; toute première ouverture : conditions d'utilisation d'abord ;
//   2. défilement : galerie pilotée (fil doré dessiné, tête de suivi en cours, repère atteint avec flash) ;
//      « Découvrir » amène la 1re station ; changement de langue (EN) redessine l'écran ;
//   3. « Entrer » : descente du tracker puis l'app (accueil) ; ni visite guidée ni proposition de PIN ; accès
//      retenu : au rechargement, l'écran ne revient pas ;
//   4. « Découvrir l'app en 1 minute » : entrée puis visite guidée ouverte ;
//   5. mouvement réduit : état final statique (pas de fil piloté), « Entrer » immédiat ;
//   6. instance AVEC mot de passe (accessHash injecté dans l'index), téléphone et PC : présentation avec champ
//      « Code d'accès » en haut, ni contacts ni pastille pro, lisible sans code ; « Entrer » du bas et la visite
//      remontent au champ ; code faux → message à côté du champ ; 5 échecs (téléphone) → verrou dans la zone du
//      champ, présentation lisible, champ rendu à l'échéance ; code juste → descente puis l'app, visite d'office ;
//      visite demandée avant le code → ouverte après ; repli (css/bienvenue.css bloquée) : carte centrée avec champ,
//      et carte « Entrer » sans mot de passe ;
//   7. console : aucune erreur (hors bruit nominal : sondes de licence, de version).
// Usage : cd scripts/smoke && node checkup-bienvenue.js (BV_SHOTS=<dossier> : captures téléphone + PC)
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge
const attendre = require("./attendre.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);   // même port que server.js
const SHOTS = process.env.BV_SHOTS || "";
// Conditions déjà acceptées : la gate légale (avant l'écran) n'est pas l'objet du checkup.
const LS_ARRIVEE = { myktamap_terms_accepted_v1: "2" };
const BRUIT_TOLERE = [/Licence-pro\.json/i, /version\.json/i, /ping\.html/i, /live-config/i, /favicon/i];
const VUES = [
  { nom: "telephone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { nom: "pc", viewport: { width: 1366, height: 768 } }
];

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function info(m) { console.log("  ℹ️  " + m); }
function verifier(cond, msgOk, msgKo) { if (cond) ok(msgOk); else pb(msgKo || msgOk); }

async function capture(page, nom) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const f = path.join(SHOTS, nom + ".png");
  await page.screenshot({ path: f });
  info("capture : " + f);
}

// LS posé une seule fois (pas à chaque rechargement) : le rechargement doit relire ce que l'app a retenu.
function semer(ls) {
  if (sessionStorage.getItem("__bv_seme")) return;
  sessionStorage.setItem("__bv_seme", "1");
  localStorage.clear();
  for (const k in ls) localStorage.setItem(k, ls[k]);
  // Sonde des repères qui flashent (la classe ne dure que 650 ms).
  window.__bvFlash = 0;
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.target.classList && m.target.classList.contains("kta-bv-flash")) window.__bvFlash++;
    });
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
}

async function nouvellePage(nav, vue, opts) {
  const ctx = await nav.newContext(Object.assign({ serviceWorkers: "block", viewport: vue.viewport,
    deviceScaleFactor: vue.deviceScaleFactor || 1, isMobile: !!vue.isMobile, hasTouch: !!vue.hasTouch },
  (opts && opts.ctx) || {}));
  const page = await ctx.newPage();
  const journal = { erreurs: [], requetes: [] };
  page.on("pageerror", function (e) { journal.erreurs.push("pageerror : " + String(e).slice(0, 200)); });
  // 🩸 Le message console d'un 404 ne cite pas l'URL : on la lit sur la réponse et on n'en compte que le bruit.
  page.on("console", function (m) {
    if (m.type() !== "error") return;
    const txt = m.text();
    if (/Failed to load resource/.test(txt)) return;
    if (!BRUIT_TOLERE.some(function (re) { return re.test(txt); })) journal.erreurs.push("console : " + txt.slice(0, 200));
  });
  page.on("response", function (r) {
    if (r.status() < 400) return;
    if (!BRUIT_TOLERE.some(function (re) { return re.test(r.url()); })) {
      journal.erreurs.push("HTTP " + r.status() + " : " + r.url().replace(BASE, ""));
    }
  });
  page.on("request", function (r) { journal.requetes.push(r.url()); });
  await page.addInitScript(semer, (opts && opts.ls) || ((opts && opts.sansConditions) ? {} : LS_ARRIVEE));
  if (opts && opts.route) await opts.route(page);
  return { ctx: ctx, page: page, journal: journal };
}

function ecranBienvenue() {
  const o = document.getElementById("kta-unlock-overlay");
  return !!(o && o.classList.contains("kta-bv") && o.querySelector(".kta-bv-entete"));
}

async function verifierConsole(journal, quoi) {
  if (journal.erreurs.length) journal.erreurs.forEach(function (e) { pb(quoi + " — " + e); });
  else ok(quoi + " : console sans erreur");
}

// ── 1 à 4 : parcours complet, par format ──────────────────────────────
async function parcours(nav, vue) {
  console.log("\n— " + vue.nom + " " + vue.viewport.width + "×" + vue.viewport.height + " : premier lancement —");
  const { ctx, page, journal } = await nouvellePage(nav, vue);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, ecranBienvenue, 20000);
  const etat = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    const sp = document.getElementById("splashOverlay");
    const z = parseInt(getComputedStyle(o).zIndex, 10);
    const zs = sp ? parseInt(getComputedStyle(sp).zIndex, 10) : -1;
    const tailles = Array.from(o.querySelectorAll('[data-bv="entrer"], [data-bv="decouvrir"], [data-bv="visite"], ' +
      ".kta-bv-langue, .kta-bv-pastille-pro, .kta-bv-pied .kta-bv-contacts a")).map(function (el) {
      const r = el.getBoundingClientRect();
      return { t: el.textContent.trim().slice(0, 24), h: Math.round(r.height), w: Math.round(r.width) };
    });
    return { z: z, zs: zs, splash: !!sp, fictif: /réseau fictif/.test(o.textContent),
      entrer: o.querySelectorAll('[data-bv="entrer"]').length, visite: !!o.querySelector('[data-bv="visite"]'),
      badge: !!o.querySelector(".kta-bv-badge"), contacts: o.querySelectorAll(".kta-bv-pied .kta-bv-contacts a").length,
      contactsHaut: o.querySelectorAll(".kta-bv-entete .kta-bv-contacts").length,
      pastillePro: !!o.querySelector('.kta-bv-entete .kta-bv-pastille-pro[href^="https://pro.myktamap.fr/"]'),
      langues: o.querySelectorAll(".kta-bv-langue").length, tailles: tailles,
      tutoriel: !!document.getElementById("kta-tutorial-modal") };
  });
  verifier(etat.z === 100100 && (!etat.splash || etat.z > etat.zs),
    "écran au-dessus du splash (z " + etat.z + (etat.splash ? " > splash " + etat.zs : ", splash retiré") + ")");
  verifier(etat.fictif, "« réseau fictif » affiché");
  verifier(etat.entrer === 2 && etat.visite, "« Entrer » en haut et en bas, lien de visite guidée présent");
  verifier(etat.badge, "Mode Secours montré avec son badge");
  verifier(etat.contacts >= 3 && etat.langues === 3, "contacts (emojis) au pied et sélecteur de langue (3) présents");
  verifier(!etat.contactsHaut && etat.pastillePro, "en haut : pas de contacts, pastille « Licence pro » seule");
  const petites = etat.tailles.filter(function (x) { return x.h < 44 || x.w < 44; });
  verifier(!petites.length, "cibles ≥ 44 px (" + etat.tailles.length + " vérifiées)",
    "cibles < 44 px : " + JSON.stringify(petites));
  verifier(!etat.tutoriel, "pas de visite guidée sous l'écran");
  await page.waitForTimeout(1200);
  const polices = await page.evaluate(function () {
    return document.fonts.check('800 20px "Montserrat"') && document.fonts.check('16px "Permanent Marker"');
  });
  verifier(polices, "polices de l'écran chargées (Montserrat, Permanent Marker)");
  const debord = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    return { o: o.scrollWidth - o.clientWidth, doc: document.documentElement.scrollWidth - window.innerWidth };
  });
  verifier(debord.o <= 0 && debord.doc <= 0, "aucun débordement horizontal", "débordement : " + JSON.stringify(debord));
  await capture(page, vue.nom + "-1-haut");

  console.log("— défilement : galerie, tête de suivi, flash —");
  const parcoursFil = await page.evaluate(async function () {
    const o = document.getElementById("kta-unlock-overlay");
    const images = function (n) {
      return new Promise(function (r) { let i = 0; (function f() { if (++i >= n) r(); else requestAnimationFrame(f); })(); });
    };
    const stations = o.querySelectorAll(".kta-bv-station");
    const cible = stations[1].offsetTop + stations[1].offsetHeight * 0.3;
    let teteVue = false;
    for (let y = 0; y <= cible; y += 60) {
      o.scrollTop = y;
      await images(2);
      if (o.querySelector(".kta-bv-tete-sec.kta-bv-en-cours")) teteVue = true;
    }
    await images(4);
    const g = stations[0].querySelector(".kta-bv-galerie");
    return { piloté: o.classList.contains("kta-bv-js-fil"), teteVue: teteVue,
      atteint1: stations[0].querySelector(".kta-bv-repere").classList.contains("kta-bv-atteint"),
      atteintFin: stations[stations.length - 1].querySelector(".kta-bv-repere").classList.contains("kta-bv-atteint"),
      reste: parseFloat(g.style.getPropertyValue("--fil-reste")), flash: window.__bvFlash || 0,
      entree: parseFloat(o.querySelector(".kta-bv-fil-entree").style.getPropertyValue("--entree")) };
  });
  verifier(parcoursFil.piloté, "galeries pilotées par le défilement");
  verifier(parcoursFil.teteVue, "tête de suivi visible pendant la descente");
  verifier(parcoursFil.atteint1 && !parcoursFil.atteintFin, "repère de la 1re station atteint, pas celui de la sortie");
  verifier(parcoursFil.flash > 0, "flash au passage d'un repère (" + parcoursFil.flash + ")");
  verifier(parcoursFil.reste === 0 && parcoursFil.entree === 1, "fil de l'entrée et de la 1re station complets");
  await page.waitForTimeout(200);
  await capture(page, vue.nom + "-2-galerie");

  // « Découvrir » depuis le haut : la 1re station arrive en haut de l'écran.
  await page.evaluate(function () { document.getElementById("kta-unlock-overlay").scrollTop = 0; });
  await page.waitForTimeout(300);
  await page.click('[data-bv="decouvrir"]');
  await page.waitForTimeout(1500);
  const decouvrir = await page.evaluate(function () {
    const s = document.getElementById("kta-bv-plans");
    return Math.round(s.getBoundingClientRect().top);
  });
  verifier(Math.abs(decouvrir) <= 4, "« Découvrir » amène la 1re station (haut à " + decouvrir + " px)");

  if (vue.nom === "telephone") {
    console.log("— langue : EN —");
    await page.click('.kta-bv-langue[data-lang="en"]');
    await page.waitForTimeout(800);
    const h1 = await page.evaluate(function () { return document.querySelector(".kta-bv-hero h1").textContent; });
    verifier(/Underground/.test(h1), "écran redessiné en anglais (« " + h1 + " »)");
    await page.click('.kta-bv-langue[data-lang="fr"]');
    await page.waitForTimeout(800);
  }

  console.log("— « Entrer » —");
  await page.evaluate(function () { document.getElementById("kta-unlock-overlay").scrollTop = 0; });
  await page.waitForTimeout(300);
  await page.click('.kta-bv-hero [data-bv="entrer"]');
  await page.waitForTimeout(1300);
  const pendant = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    const tete = o && o.querySelector(".kta-bv-tete-entree");
    return { descend: !!(o && o.classList.contains("kta-bv-descend")),
      tete: tete ? parseFloat(getComputedStyle(tete).opacity) : 0,
      memo: localStorage.getItem("myktamap_unlock_v1") };
  });
  verifier(pendant.descend && pendant.tete > 0.5, "le tracker descend le puits");
  verifier(pendant.memo === "libre-v1", "accès retenu dès le clic (libre-v1)");
  await capture(page, vue.nom + "-3-descente");
  await attendre(page, function () { return !document.getElementById("kta-unlock-overlay"); }, 6000);
  await page.waitForTimeout(4000);
  const apres = await page.evaluate(function () {
    const lo = document.getElementById("planLoaderOverlay");
    return { accueil: !!(lo && lo.style.display === "flex"), tutoriel: !!document.getElementById("kta-tutorial-modal"),
      pin: !!document.getElementById("kta-pin-proposal-overlay"), vu: localStorage.getItem("myktamap_tutorial_seen_v1") };
  });
  verifier(apres.accueil, "l'accueil s'affiche après l'écran");
  verifier(!apres.tutoriel, "visite guidée NON imposée");
  verifier(!apres.pin, "PIN non proposé");
  await capture(page, vue.nom + "-4-accueil");

  console.log("— rechargement —");
  await page.reload({ waitUntil: "domcontentloaded" });
  let revu = false;
  const finR = Date.now() + 8000;
  while (Date.now() < finR) {
    if (await page.evaluate(function () { return !!document.getElementById("kta-unlock-overlay"); }).catch(function () { return false; })) { revu = true; break; }
    await page.waitForTimeout(200);
  }
  verifier(!revu, "écran non réaffiché au rechargement (une seule fois par appareil)");
  await verifierConsole(journal, vue.nom + " parcours");
  await ctx.close();

  console.log("— « Découvrir l'app en 1 minute » —");
  const p2 = await nouvellePage(nav, vue);
  await p2.page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(p2.page, ecranBienvenue, 20000);
  await p2.page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    o.scrollTop = o.scrollHeight;
  });
  await p2.page.waitForTimeout(600);
  await capture(p2.page, vue.nom + "-5-sortie");
  await p2.page.click('[data-bv="visite"]');
  await attendre(p2.page, function () { return !!document.getElementById("kta-tutorial-modal"); }, 10000)
    .then(function () { ok("visite guidée ouverte à la demande"); })
    .catch(function () { pb("visite guidée pas ouverte après le lien"); });
  await verifierConsole(p2.journal, vue.nom + " visite");
  await p2.ctx.close();
}

// ── 1 bis : toute première ouverture (conditions pas encore acceptées) ──
async function premiereOuverture(nav) {
  console.log("\n— toute première ouverture : conditions d'utilisation, puis Bienvenue (390×844) —");
  const { ctx, page, journal } = await nouvellePage(nav, VUES[0], { sansConditions: true });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!document.getElementById("kta-legal-cb"); }, 20000);
  const avant = await page.evaluate(function () { return !!document.getElementById("kta-unlock-overlay"); });
  verifier(!avant, "écran Bienvenue pas encore monté pendant les conditions");
  await page.check("#kta-legal-cb");
  await page.click("#kta-legal-accept");
  await attendre(page, ecranBienvenue, 15000)
    .then(function () { ok("écran Bienvenue après les conditions acceptées"); })
    .catch(function () { pb("écran Bienvenue absent après les conditions"); });
  await verifierConsole(journal, "première ouverture");
  await ctx.close();
}

// ── 5 : mouvement réduit ──────────────────────────────────────────────
async function mouvementReduit(nav) {
  console.log("\n— mouvement réduit (390×844) —");
  const { ctx, page, journal } = await nouvellePage(nav, VUES[0], { ctx: { reducedMotion: "reduce" } });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, ecranBienvenue, 20000);
  await page.waitForTimeout(500);
  const etat = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    const fil = o.querySelector(".kta-bv-fil-sec path");
    const pieton = o.querySelector(".kta-bv-pieton");
    return { pilote: o.classList.contains("kta-bv-js-fil"), dash: getComputedStyle(fil).strokeDasharray,
      anim: getComputedStyle(pieton).animationName };
  });
  verifier(!etat.pilote && (etat.dash === "none" || !etat.dash), "fil complet, non piloté");
  verifier(etat.anim === "none", "ville immobile");
  await capture(page, "telephone-6-reduit");
  const t0 = Date.now();
  await page.click('.kta-bv-hero [data-bv="entrer"]');
  await attendre(page, function () { return !document.getElementById("kta-unlock-overlay"); }, 3000);
  const ms = Date.now() - t0;
  verifier(ms < 1200, "« Entrer » sans descente (" + ms + " ms)");
  await verifierConsole(journal, "mouvement réduit");
  await ctx.close();
}

// ── 6 : instance avec mot de passe ────────────────────────────────────
const CODE = "essai-bienvenue";
const HASH = crypto.createHash("sha256").update(CODE).digest("hex");

// Index servi avec (ou sans) accessHash ; bloquerCss : la feuille de l'écran Bienvenue échoue (repli).
function routes(hash, bloquerCss) {
  return async function (p) {
    await p.route(/\/data\/index\.json(\?.*)?$/, async function (route) {
      const rep = await route.fetch();
      const idx = await rep.json();
      if (hash) idx.config = Object.assign({}, idx.config || {}, { accessHash: hash });
      await route.fulfill({ response: rep, json: idx });
    });
    if (bloquerCss) await p.route(/\/css\/bienvenue\.css(\?.*)?$/, function (route) { return route.abort(); });
  };
}

function ecranProtege() {
  const o = document.getElementById("kta-unlock-overlay");
  return !!(o && o.classList.contains("kta-bv-protege") && o.querySelector(".kta-bv-code-champ"));
}

async function saisir(page, code) {
  await page.fill(".kta-bv-code-champ", code);
  await page.press(".kta-bv-code-champ", "Enter");
  await page.waitForTimeout(400);
}

async function retourCode(page) {
  return page.evaluate(function () {
    const r = document.querySelector(".kta-bv-code-retour");
    return r ? r.textContent : "";
  });
}

// Après l'écran : accueil, visite guidée attendue ou non, jamais de PIN proposé.
async function apresEntree(page, visiteAttendue, quoi) {
  await attendre(page, function () { return !document.getElementById("kta-unlock-overlay"); }, 8000);
  const memo = await page.evaluate(function () {
    return { u: localStorage.getItem("myktamap_unlock_v1"), k: localStorage.getItem("myktamap_unlock_instance_v1") };
  });
  verifier(memo.u === HASH && memo.k === HASH, quoi + " : accès mémorisé par le hash d'instance (jamais libre-v1)",
    quoi + " : mémoire inattendue " + JSON.stringify(memo));
  if (visiteAttendue) {
    await attendre(page, function () { return !!document.getElementById("kta-tutorial-modal"); }, 12000)
      .then(function () { ok(quoi + " : visite guidée ouverte"); })
      .catch(function () { pb(quoi + " : visite guidée absente"); });
    await page.click("#kta-tutorial-skip").catch(function () {});
  }
  await page.waitForTimeout(2500);
  const etat = await page.evaluate(function () {
    const lo = document.getElementById("planLoaderOverlay");
    return { accueil: !!(lo && lo.style.display === "flex"), pin: !!document.getElementById("kta-pin-proposal-overlay") };
  });
  verifier(etat.accueil, quoi + " : l'accueil s'affiche");
  verifier(!etat.pin, quoi + " : PIN non proposé");
}

async function instanceProtegee(nav, vue) {
  console.log("\n— instance AVEC mot de passe, " + vue.nom + " " + vue.viewport.width + "×" + vue.viewport.height + " —");
  const { ctx, page, journal } = await nouvellePage(nav, vue, { route: routes(HASH) });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, ecranProtege, 20000);
  await page.waitForTimeout(800);
  const etat = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    const tailles = Array.from(o.querySelectorAll(".kta-bv-code-champ, .kta-bv-code-entrer, [data-bv]"))
      .map(function (el) {
        const r = el.getBoundingClientRect();
        return { t: (el.textContent || el.placeholder || "").trim().slice(0, 24), h: Math.round(r.height), w: Math.round(r.width) };
      });
    return {
      champHaut: !!o.querySelector(".kta-bv-entete .kta-bv-code .kta-bv-code-champ[type=password]"),
      submit: !!o.querySelector('.kta-bv-entete .kta-bv-code button[type=submit]'),
      entrerDirect: o.querySelectorAll('.kta-bv-entete [data-bv="entrer"]').length,
      decouvrir: !!o.querySelector('.kta-bv-entete [data-bv="decouvrir"]'),
      basEntrer: !!o.querySelector('.kta-bv-station-sortie [data-bv="entrer"]'),
      visite: !!o.querySelector('[data-bv="visite"]'),
      contacts: o.querySelectorAll(".kta-bv-contacts, a[href^='mailto:'], a[href*='instagram']").length,
      pastille: o.querySelectorAll(".kta-bv-pastille-pro, a[href*='pro.myktamap.fr']").length,
      noteHaut: (o.querySelector(".kta-bv-entete .kta-bv-code-note") || {}).textContent || "",
      notePied: Array.from(o.querySelectorAll(".kta-bv-pied .kta-bv-pied-note")).map(function (p) { return p.textContent; }).join(" | "),
      credits: !!o.querySelector(".kta-bv-pied-credits") && !!o.querySelector(".kta-bv-pied .kta-bv-signature"),
      tailles: tailles,
      debord: Math.max(o.scrollWidth - o.clientWidth, document.documentElement.scrollWidth - window.innerWidth),
      ancienneCarte: !!o.querySelector(".kta-unlock-box"),
      focus: document.activeElement === o
    };
  });
  verifier(etat.champHaut && etat.submit && !etat.entrerDirect && etat.decouvrir,
    "en-tête : champ « Code d'accès » + « Entrer » de formulaire + « Découvrir », pas d'« Entrer » direct",
    "en-tête inattendu : " + JSON.stringify({ c: etat.champHaut, s: etat.submit, e: etat.entrerDirect, d: etat.decouvrir }));
  verifier(!etat.ancienneCarte, "plus l'ancienne carte centrée");
  verifier(etat.basEntrer && etat.visite, "« Entrer » et la visite présents en bas");
  verifier(etat.contacts === 0 && etat.pastille === 0, "ni contacts de l'auteur ni pastille « Licence pro » (haut et pied)",
    "contacts " + etat.contacts + ", pastille " + etat.pastille);
  verifier(/personne qui gère/.test(etat.noteHaut) && /personne qui gère/.test(etat.notePied),
    "à qui demander le code : dit en haut et au pied");
  verifier(etat.credits, "pied : librairies et signature présentes");
  const petites = etat.tailles.filter(function (x) { return x.h < 44 || x.w < 44; });
  verifier(!petites.length, "cibles ≥ 44 px (" + etat.tailles.length + " vérifiées)", "cibles < 44 px : " + JSON.stringify(petites));
  verifier(etat.debord <= 0, "aucun débordement horizontal", "débordement : " + etat.debord);
  verifier(etat.focus, "focus sur l'écran, pas sur le champ (pas de clavier imposé)");
  verifier(journal.requetes.some(function (u) { return /css\/bienvenue\.css/.test(u); }), "feuille de l'écran Bienvenue chargée");
  await capture(page, vue.nom + "-7-protege-haut");

  // Toute la présentation se lit sans code.
  const lecture = await page.evaluate(async function () {
    const o = document.getElementById("kta-unlock-overlay");
    o.scrollTop = o.scrollHeight;
    await new Promise(function (r) { setTimeout(r, 400); });
    return { bas: o.scrollTop + o.clientHeight >= o.scrollHeight - 2, haut: o.scrollTop };
  });
  verifier(lecture.bas && lecture.haut > 0, "présentation lisible jusqu'en bas sans code");
  await capture(page, vue.nom + "-8-protege-bas");

  await page.click('.kta-bv-station-sortie [data-bv="entrer"]');
  await page.waitForTimeout(1200);
  const remonte = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    return { top: o.scrollTop, focus: !!(document.activeElement && document.activeElement.classList.contains("kta-bv-code-champ")),
      ouvert: !!o };
  });
  verifier(remonte.ouvert && remonte.top < 5 && remonte.focus, "« Entrer » du bas : remonte au champ et lui donne le focus",
    "« Entrer » du bas : " + JSON.stringify(remonte));

  await page.evaluate(function () { const o = document.getElementById("kta-unlock-overlay"); o.scrollTop = o.scrollHeight; });
  await page.waitForTimeout(300);
  await page.click('[data-bv="visite"]');
  await page.waitForTimeout(1200);
  const remonteV = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    return { top: o ? o.scrollTop : -1, focus: !!(document.activeElement && document.activeElement.classList.contains("kta-bv-code-champ")) };
  });
  verifier(remonteV.top < 5 && remonteV.focus, "« Découvrir l'app en 1 minute » : exige le code (remonte au champ)");

  console.log("— code faux —");
  await saisir(page, "pas-le-bon");
  const faux = await page.evaluate(function () {
    return { ouvert: !!document.getElementById("kta-unlock-overlay"), erreur: !!document.querySelector(".kta-bv-code-retour .kta-bv-code-erreur"),
      memo: localStorage.getItem("myktamap_unlock_v1"), vide: document.querySelector(".kta-bv-code-champ").value === "" };
  });
  verifier(faux.ouvert && faux.erreur && !faux.memo && faux.vide, "code faux : message à côté du champ, écran gardé, rien mémorisé",
    "code faux : " + JSON.stringify(faux));
  verifier(/incorrect/i.test(await retourCode(page)) && /4/.test(await retourCode(page)), "code faux : essais restants annoncés (4)");

  if (vue.nom === "telephone") {
    console.log("— verrou temporisé —");
    for (let i = 0; i < 4; i++) await saisir(page, "toujours-faux-" + i);
    await page.waitForTimeout(600);
    const verrou = await page.evaluate(function () {
      const o = document.getElementById("kta-unlock-overlay");
      const ch = o.querySelector(".kta-bv-code-champ");
      const rb = o.querySelector(".kta-bv-code .kta-bv-code-rebours");
      return { classe: o.classList.contains("kta-bv-verrou"), desactive: ch.disabled,
        bouton: o.querySelector(".kta-bv-code-entrer").disabled, rebours: rb ? rb.textContent : "",
        placeholder: ch.placeholder, carte: !!o.querySelector(".kta-unlock-box"), bv: o.classList.contains("kta-bv") };
    });
    verifier(verrou.classe && verrou.desactive && verrou.bouton, "verrou : champ et « Entrer » désactivés",
      "verrou : " + JSON.stringify(verrou));
    verifier(/\d+ min/.test(verrou.rebours) && /\d+ min/.test(verrou.placeholder),
      "verrou : compte à rebours dans la zone du champ (« " + verrou.rebours + " »)");
    verifier(verrou.bv && !verrou.carte, "verrou : la présentation reste affichée (pas l'ancienne carte)");
    await capture(page, "telephone-9-verrou");
    const lisible = await page.evaluate(async function () {
      const o = document.getElementById("kta-unlock-overlay");
      o.scrollTop = o.scrollHeight;
      await new Promise(function (r) { setTimeout(r, 300); });
      const v = o.scrollTop > 0;
      o.scrollTop = 0;
      return v;
    });
    verifier(lisible, "verrou : présentation toujours lisible (défilement)");
    // Fin du verrou avancée : le champ revient sur le même écran, la promesse de la gate attend toujours.
    await page.evaluate(function () {
      const l = JSON.parse(localStorage.getItem("myktamap_unlock_lock_v1"));
      l.until = Date.now() + 1200;
      localStorage.setItem("myktamap_unlock_lock_v1", JSON.stringify(l));
    });
    await page.waitForTimeout(3000);
    const fin = await page.evaluate(function () {
      const o = document.getElementById("kta-unlock-overlay");
      return { actif: !o.querySelector(".kta-bv-code-champ").disabled, classe: o.classList.contains("kta-bv-verrou") };
    });
    verifier(fin.actif && !fin.classe, "fin du verrou : le champ revient sans recharger");
  }

  console.log("— code juste —");
  await page.fill(".kta-bv-code-champ", CODE);
  await page.press(".kta-bv-code-champ", "Enter");
  await page.waitForTimeout(1300);
  const descente = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    const tete = o && o.querySelector(".kta-bv-tete-entree");
    return { descend: !!(o && o.classList.contains("kta-bv-descend")), tete: tete ? parseFloat(getComputedStyle(tete).opacity) : 0 };
  });
  verifier(descente.descend && descente.tete > 0.5, "code juste : le tracker descend le puits");
  await capture(page, vue.nom + "-10-protege-descente");
  // Visite : comportement inchangé (d'office au 1er lancement d'une instance protégée).
  await apresEntree(page, true, vue.nom + " code juste");
  await verifierConsole(journal, vue.nom + " instance protégée");
  await ctx.close();
}

// Visite demandée avant le code, sur un appareil qui l'a déjà vue : elle s'ouvre quand même après le code.
async function protegeeVisite(nav) {
  console.log("\n— instance protégée : « Découvrir l'app en 1 minute » puis code (390×844) —");
  const ls = Object.assign({}, LS_ARRIVEE, { myktamap_tutorial_seen_v1: "1" });
  const { ctx, page, journal } = await nouvellePage(nav, VUES[0], { route: routes(HASH), ls: ls });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, ecranProtege, 20000);
  await page.evaluate(function () { const o = document.getElementById("kta-unlock-overlay"); o.scrollTop = o.scrollHeight; });
  await page.waitForTimeout(400);
  await page.click('[data-bv="visite"]');
  await page.waitForTimeout(1000);
  await page.keyboard.type(CODE);
  await page.keyboard.press("Enter");
  await apresEntree(page, true, "visite demandée");
  await verifierConsole(journal, "visite demandée");
  await ctx.close();
}

// Repli : css/bienvenue.css injoignable → carte centrée, avec et sans mot de passe.
async function repli(nav) {
  console.log("\n— repli : css/bienvenue.css bloquée (390×844) —");
  const a = await nouvellePage(nav, VUES[0], { route: routes(HASH, true) });
  await a.page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(a.page, function () { return !!document.getElementById("kta-unlock-input"); }, 20000)
    .then(function () { ok("instance protégée : carte de repli avec champ"); })
    .catch(function () { pb("instance protégée : pas de carte de repli"); });
  const etat = await a.page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    return { bv: !!(o && o.classList.contains("kta-bv")), contacts: !!(o && o.querySelector(".kta-unlock-contact")) };
  });
  verifier(!etat.bv && !etat.contacts, "repli protégé : carte simple, sans contacts de l'auteur");
  await capture(a.page, "telephone-11-repli-protege");
  await a.page.fill("#kta-unlock-input", "faux");
  await a.page.click("#kta-unlock-btn");
  await a.page.waitForTimeout(500);
  verifier(/incorrect/i.test(await a.page.evaluate(function () { return document.getElementById("kta-unlock-feedback").textContent; })),
    "repli protégé : code faux refusé");
  await a.page.fill("#kta-unlock-input", CODE);
  await a.page.click("#kta-unlock-btn");
  await apresEntree(a.page, true, "repli protégé");
  await a.ctx.close();

  const b = await nouvellePage(nav, VUES[0], { route: routes(null, true) });
  await b.page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(b.page, function () { return !!document.getElementById("kta-unlock-libre-btn"); }, 20000)
    .then(function () { ok("sans mot de passe : carte « Entrer » de repli"); })
    .catch(function () { pb("sans mot de passe : pas de carte de repli"); });
  await b.page.click("#kta-unlock-libre-btn");
  await attendre(b.page, function () { return !document.getElementById("kta-unlock-overlay"); }, 6000)
    .then(function () { ok("repli libre : « Entrer » ouvre l'app"); })
    .catch(function () { pb("repli libre : l'écran reste"); });
  verifier((await b.page.evaluate(function () { return localStorage.getItem("myktamap_unlock_v1"); })) === "libre-v1",
    "repli libre : accès libre retenu");
  await b.ctx.close();
}

(async function main() {
  const server = require("./server.js");
  let nav;
  try {
    nav = await lancerNavigateur(chromium);
    for (const vue of VUES) await parcours(nav, vue);
    await premiereOuverture(nav);
    await mouvementReduit(nav);
    for (const vue of VUES) await instanceProtegee(nav, vue);
    await protegeeVisite(nav);
    await repli(nav);
  } catch (e) {
    pb("exception : " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
  } finally {
    if (nav) await nav.close();
    if (server && server.close) server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("⚠️ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP BIENVENUE VERT — écran du premier lancement, descente, visite proposée, code d'accès et repli.");
})();
