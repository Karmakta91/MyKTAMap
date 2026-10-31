#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-accueil-hote.js — checkup ciblé (marche 3 du RELEASE_GATE), non branché au pre-commit
// =====================================================================
// Écran d'arrivée d'une installation community hors des domaines de présentation (js/unlockGate.js >
// presentationComplete) : la ville seule de l'écran Bienvenue (js/bienvenue.js, villeSeule sans connexion).
// L'hôte est un VRAI autre hôte, sans porte dérobée dans l'app : le site est servi aussi sur 127.0.0.2 (relais TCP
// vers le serveur des harnais, 127.0.0.1) ; le bouclage local reste un contexte sûr (crypto.subtle du code d'accès).
// La présentation complète (127.0.0.1) est prouvée par checkup-bienvenue.js.
//   1. ville seule, téléphone 390×844 et PC 1366×768 : titre et description de `config.accueil` (chaîne), « Entrer »
//      et 📖, langues ; ni « Découvrir », ni stations, ni pied, ni 🚨, ni pastille pro, ni lien source, ni contacts ;
//      rien ne défile ni ne déborde ; cibles ≥ 44 px ; au-dessus du splash ;
//   2. objet par langue (fr, en ; es → repli fr), bouton traduit ; repli `config.subtitle`, puis tagline traduite ;
//      HTML gardé en texte ;
//   3. « Entrer » : conditions d'utilisation refusables (refus = écran gardé, rien mémorisé), puis acceptées →
//      descente, l'app, accès libre retenu (le rechargement ne remontre pas l'écran) ;
//   4. `accessHash` : champ « Code d'accès » à la place d'« Entrer », code faux, verrou temporisé puis champ rendu,
//      code juste → conditions → descente, accès par le hash d'instance ;
//   5. 📖 Documentation par-dessus l'écran ; repli (css/bienvenue.css bloquée) : carte centrée ;
//   6. console : aucune erreur, aucune violation CSP (serveur des harnais : CSP stricte de nginx-docker.conf) ;
//   7. data/reglages.json : prime sur l'index champ par champ (un champ faux laisse place à l'index), sous-titre
//      effectif, accessHash / serverConnection / plans qu'il porterait ignorés, JSON illisible ignoré sans erreur ;
//      absent (404 du serveur, cas de tous les autres tests) = défauts.
// Usage : cd scripts/smoke && node checkup-accueil-hote.js (SMOKE_PORT, KTA_MOTEURS, BV_SHOTS=<dossier> : captures)
"use strict";

const fs = require("fs");
const net = require("net");
const path = require("path");
const crypto = require("crypto");
const { moteurs, lancerMoteur } = require("./navigateur.js");   // Chromium (repli Edge) puis WebKit
const attendre = require("./attendre.js");

const PORT = parseInt(process.env.SMOKE_PORT, 10) || 8123;   // même port que server.js
const HOTE = "127.0.0.2";
const BASE = "http://" + HOTE + ":" + PORT;
const SHOTS = process.env.BV_SHOTS || "";
const BRUIT_TOLERE = [/Licence-pro\.json/i, /data\/reglages\.json/i, /version\.json/i, /ping\.html/i, /live-config/i, /favicon/i];
const VUES = [
  { nom: "telephone", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { nom: "pc", viewport: { width: 1366, height: 768 } }
];
const CODE = "essai-accueil";
const HASH = crypto.createHash("sha256").update(CODE).digest("hex");
const ACCEPTEES = { myktamap_terms_accepted_v1: "2" };

const problemes = [];
let MOTEUR = "";
function pb(m) { problemes.push((MOTEUR ? "[" + MOTEUR + "] " : "") + m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function verifier(cond, msgOk, msgKo) { if (cond) ok(msgOk); else pb(msgOk + " — " + (msgKo || "")); }
// Comme attendre.js (pas de waitForFunction : la CSP refuse son évaluation de chaîne), mais rend la valeur non nulle
// que fn finit par donner ; null au délai.
async function valeur(page, fn, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const v = await page.evaluate(fn).catch(function () { return null; });
    if (v !== null && v !== undefined && v !== false) return v;
    await page.waitForTimeout(250);
  }
  return null;
}

async function capture(page, nom) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, MOTEUR + "-hote-" + nom + ".png") });
}

// Relais TCP 127.0.0.2:PORT → 127.0.0.1:PORT (server.js n'écoute que sur 127.0.0.1).
function relais() {
  return new Promise(function (resolve, reject) {
    const r = net.createServer(function (c) {
      const s = net.connect(PORT, "127.0.0.1");
      c.pipe(s).pipe(c);
      c.on("error", function () { s.destroy(); });
      s.on("error", function () { c.destroy(); });
    });
    r.on("error", reject);
    r.listen(PORT, HOTE, function () { resolve(r); });
  });
}

function semer(ls) {
  if (sessionStorage.getItem("__ah_seme")) return;
  sessionStorage.setItem("__ah_seme", "1");
  localStorage.clear();
  for (const k in ls) localStorage.setItem(k, ls[k]);
}

// cfg : champs posés sur config de l'index servi ; null = retiré. Sous-titre et accueil toujours fixés par le cas.
// reglages : objet → data/reglages.json servi en JSON ; chaîne → servi tel quel (JSON illisible) ; absent → 404 du
// serveur (aucun fichier dans le dépôt).
function routes(cfg, bloquerCss, reglages) {
  return async function (p) {
    await p.route(/\/data\/index\.json(\?.*)?$/, async function (route) {
      const rep = await route.fetch();
      const idx = await rep.json();
      const c = Object.assign({}, idx.config || {});
      delete c.subtitle; delete c.accueil; delete c.accessHash;
      Object.keys(cfg || {}).forEach(function (k) { if (cfg[k] !== null) c[k] = cfg[k]; });
      idx.config = c;
      await route.fulfill({ response: rep, json: idx });
    });
    if (reglages !== undefined) {
      await p.route(/\/data\/reglages\.json(\?.*)?$/, function (route) {
        return typeof reglages === "string"
          ? route.fulfill({ status: 200, contentType: "application/json", body: reglages })
          : route.fulfill({ status: 200, json: reglages });
      });
    }
    if (bloquerCss) await p.route(/\/css\/bienvenue\.css(\?.*)?$/, function (route) { return route.abort(); });
  };
}

async function nouvellePage(nav, vue, opts) {
  const ctx = await nav.newContext({ serviceWorkers: "block", viewport: vue.viewport,
    deviceScaleFactor: vue.deviceScaleFactor || 1, isMobile: !!vue.isMobile, hasTouch: !!vue.hasTouch });
  const page = await ctx.newPage();
  const journal = { erreurs: [] };
  page.on("pageerror", function (e) { journal.erreurs.push("pageerror : " + String(e).slice(0, 200)); });
  page.on("console", function (m) {
    if (m.type() !== "error") return;
    const txt = m.text();
    if (/Failed to load resource/.test(txt)) return;
    if (!BRUIT_TOLERE.some(function (re) { return re.test(txt); })) journal.erreurs.push("console : " + txt.slice(0, 200));
  });
  page.on("response", function (r) {
    if (r.status() < 400) return;
    if (!BRUIT_TOLERE.some(function (re) { return re.test(r.url()); })) journal.erreurs.push("HTTP " + r.status() + " : " + r.url());
  });
  await page.addInitScript(semer, opts.ls || {});
  await routes(opts.cfg, opts.bloquerCss, opts.reglages)(page);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  return { ctx: ctx, page: page, journal: journal };
}

function villeOuverte() {
  const o = document.getElementById("kta-unlock-overlay");
  return !!(o && o.classList.contains("kta-bv-ville-seule") && o.querySelector("#kta-bv-titre") && !o.inert);
}

// Ce que montre l'écran (une seule évaluation : comparé ensuite côté Node).
function lireEcran() {
  const o = document.getElementById("kta-unlock-overlay");
  if (!o) return null;
  const sp = document.getElementById("splashOverlay");
  const d = o.querySelector(".kta-bv-accroche");
  const cibles = Array.from(o.querySelectorAll("button, input")).map(function (el) {
    const r = el.getBoundingClientRect();
    return { t: (el.textContent || el.placeholder || "").trim().slice(0, 20), h: Math.round(r.height), w: Math.round(r.width) };
  });
  return {
    ville: o.classList.contains("kta-bv-ville-seule"), connexion: o.classList.contains("kta-bv-connexion"),
    z: parseInt(getComputedStyle(o).zIndex, 10), zs: sp ? parseInt(getComputedStyle(sp).zIndex, 10) : -1,
    titre: o.querySelector("h1").textContent, balises: o.querySelector("h1").children.length + (d ? d.children.length : 0),
    desc: d && !d.hidden ? d.textContent : null,
    entrer: Array.from(o.querySelectorAll('[data-bv="entrer"]')).map(function (b) { return b.textContent.trim(); }),
    doc: !!o.querySelector('[data-bv="doc"]'),
    champ: !!o.querySelector(".kta-bv-code-champ"), note: !!o.querySelector(".kta-bv-code-note"),
    autres: o.querySelectorAll('[data-bv="decouvrir"], [data-bv="visite"], .kta-bv-station, .kta-bv-pied, ' +
      ".kta-bv-sortie-urgence, .kta-bv-sortie-docs").length,
    pro: o.querySelectorAll(".kta-bv-pastille-pro, a[href*='pro.myktamap.fr']").length,
    source: o.querySelectorAll(".kta-bv-github, a[href*='github.com']").length,
    contacts: o.querySelectorAll(".kta-bv-contacts, .kta-unlock-contact, a[href^='mailto:'], a[href*='instagram']").length,
    langues: o.querySelectorAll(".kta-bv-langue").length,
    defile: o.scrollHeight > o.clientHeight + 1,
    deborde: Math.max(o.scrollWidth - o.clientWidth, document.documentElement.scrollWidth - window.innerWidth) > 0,
    petites: cibles.filter(function (c) { return c.h < 44 || c.w < 44; }),
    fil: !!o.querySelector(".kta-bv-fil-entree") && !!o.querySelector(".kta-bv-tete-entree")
  };
}

async function etatApp(page) {
  await attendre(page, function () { return !document.getElementById("kta-unlock-overlay"); }, 10000).catch(function () {});
  await page.waitForTimeout(2000);
  return page.evaluate(function () {
    const lo = document.getElementById("planLoaderOverlay");
    return { ouvert: !!document.getElementById("kta-unlock-overlay"), accueil: !!(lo && lo.style.display === "flex"),
      u: localStorage.getItem("myktamap_unlock_v1"), k: localStorage.getItem("myktamap_unlock_instance_v1") };
  });
}

// ── 1 et 3 : sans mot de passe, par format ──────────────────────────────
async function libre(nav, vue) {
  console.log("\n— " + vue.nom + " " + vue.viewport.width + "×" + vue.viewport.height + " : ville seule, « Entrer » —");
  const cfg = { accueil: { titre: "Club de test", description: "Les plans du club.\nDeuxième ligne." },
    subtitle: "Sous-titre ignoré ici" };
  const { ctx, page, journal } = await nouvellePage(nav, vue, { cfg: cfg });
  await attendre(page, villeOuverte, 20000);
  const hote = await page.evaluate(function () {
    return [location.hostname, window.UnlockGate.presentationComplete(location.hostname)];
  });
  verifier(hote[0] === HOTE && hote[1] === false, "hôte " + hote[0] + " : hors des domaines de présentation");
  await page.waitForTimeout(600);
  const e = await page.evaluate(lireEcran);
  verifier(e.ville && !e.connexion && e.z === 100100 && (e.zs < 0 || e.z > e.zs),
    "ville seule (pas celle d'une gate déléguée), au-dessus du splash (z " + e.z + ")", JSON.stringify(e));
  verifier(e.titre === cfg.accueil.titre && e.desc === cfg.accueil.description,
    "titre et description de config.accueil (la description passe avant le sous-titre)", JSON.stringify(e));
  verifier(e.entrer.length === 1 && e.entrer[0] === "Entrer" && e.doc && !e.champ && e.langues === 3,
    "« Entrer », 📖 Documentation et les 3 langues ; pas de champ de code", JSON.stringify(e));
  verifier(e.autres === 0 && e.pro === 0 && e.source === 0 && e.contacts === 0,
    "ni défilement de présentation, ni stations, ni 🚨, ni pastille pro, ni lien source, ni contacts", JSON.stringify(e));
  verifier(!e.defile && !e.deborde, "rien ne défile, aucun débordement", JSON.stringify(e));
  verifier(!e.petites.length, "cibles ≥ 44 px", JSON.stringify(e.petites));
  verifier(e.fil, "fil et tête de suivi du puits présents (la descente d'« Entrer »)");
  await capture(page, vue.nom + "-ville");

  console.log("— « Entrer » : conditions refusables —");
  await page.click('[data-bv="entrer"]');
  await attendre(page, function () { return !!document.getElementById("kta-legal-refuse"); }, 6000)
    .then(function () { ok("conditions d'utilisation ouvertes au clic, avec « Refuser »"); })
    .catch(function () { pb("conditions absentes ou non refusables après « Entrer »"); });
  await page.click("#kta-legal-refuse").catch(function () {});
  await page.waitForTimeout(800);
  const refus = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    const b = o && o.querySelector('[data-bv="entrer"]');
    return { ouvert: !!o, actif: !!(b && !b.disabled), u: localStorage.getItem("myktamap_unlock_v1"),
      legal: !!document.getElementById("kta-legal-cb") };
  });
  verifier(refus.ouvert && refus.actif && !refus.u && !refus.legal, "refus : l'écran reste, « Entrer » réactivé, rien mémorisé",
    JSON.stringify(refus));
  await page.click('[data-bv="entrer"]');
  await attendre(page, function () { return !!document.getElementById("kta-legal-cb"); }, 6000).catch(function () {});
  await page.check("#kta-legal-cb");
  await page.click("#kta-legal-accept");
  await page.waitForTimeout(900);
  const desc = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    const tete = o && o.querySelector(".kta-bv-tete-entree");
    return { descend: !!(o && o.classList.contains("kta-bv-descend")), tete: tete ? parseFloat(getComputedStyle(tete).opacity) : 0 };
  });
  verifier(desc.descend && desc.tete > 0.5, "acceptées : le tracker descend le puits", JSON.stringify(desc));
  const app = await etatApp(page);
  verifier(!app.ouvert && app.accueil && app.u === "libre-v1", "puis l'accueil de l'app, accès libre retenu", JSON.stringify(app));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  verifier(!(await page.evaluate(function () { return !!document.getElementById("kta-unlock-overlay"); })),
    "rechargement : l'écran ne revient pas");
  verifier(!journal.erreurs.length, "console sans erreur ni violation CSP", journal.erreurs.join(" | "));
  await ctx.close();
}

// ── 2 : textes par langue et replis ─────────────────────────────────────
async function textes(nav) {
  console.log("\n— textes : objet par langue, replis sous-titre puis tagline, HTML en texte (390×844) —");
  const vue = VUES[0];
  const a = await nouvellePage(nav, vue, { ls: ACCEPTEES,
    cfg: { accueil: { titre: { fr: "Accueil FR", en: "Welcome EN" }, description: { fr: "Texte FR" } } } });
  await attendre(a.page, villeOuverte, 20000);
  const fr = await a.page.evaluate(lireEcran);
  await a.page.click('[data-lang="en"]');
  const en = await valeur(a.page, function () {
    const o = document.getElementById("kta-unlock-overlay");
    return o && o.querySelector("h1").textContent === "Welcome EN" ? [o.querySelector(".kta-bv-accroche").textContent,
      o.querySelector('[data-bv="entrer"]').textContent.trim()] : null;
  }, 8000);
  await a.page.click('[data-lang="es"]');
  const es = await valeur(a.page, function () {
    const o = document.getElementById("kta-unlock-overlay");
    const l = o && o.querySelector('[data-lang="es"]');
    return l && l.getAttribute("aria-pressed") === "true" ? o.querySelector("h1").textContent : null;
  }, 8000);
  verifier(fr.titre === "Accueil FR" && fr.desc === "Texte FR" && en && en[0] === "Texte FR" && en[1] === "Enter" &&
    es === "Accueil FR", "objet par langue : fr ; en (description en repli fr, « Enter ») ; es → repli fr",
    JSON.stringify({ fr: [fr.titre, fr.desc], en: en, es: es }));
  verifier(!a.journal.erreurs.length, "langues : console sans erreur", a.journal.erreurs.join(" | "));
  await a.ctx.close();

  const b = await nouvellePage(nav, vue, { ls: ACCEPTEES, cfg: { subtitle: "Sous-titre de test" } });
  await attendre(b.page, villeOuverte, 20000);
  const sb = await b.page.evaluate(lireEcran);
  verifier(sb.titre === "MyKTAMap" && sb.desc === "Sous-titre de test",
    "sans config.accueil : « MyKTAMap », description = config.subtitle", JSON.stringify([sb.titre, sb.desc]));
  await b.ctx.close();

  const c = await nouvellePage(nav, vue, { ls: ACCEPTEES, cfg: {} });
  await attendre(c.page, villeOuverte, 20000);
  const sc = await c.page.evaluate(lireEcran);
  await c.page.click('[data-lang="en"]');
  const scEn = await valeur(c.page, function () {
    const o = document.getElementById("kta-unlock-overlay");
    const l = o && o.querySelector('[data-lang="en"]');
    return l && l.getAttribute("aria-pressed") === "true" ? o.querySelector(".kta-bv-accroche").textContent : null;
  }, 8000);
  verifier(sc.titre === "MyKTAMap" && sc.desc === "Cartographie souterraine" && scEn === "Underground mapping",
    "ni accueil ni sous-titre : la tagline traduite (fr, puis en)", JSON.stringify([sc.titre, sc.desc, scEn]));
  await c.ctx.close();

  const d = await nouvellePage(nav, vue, { ls: ACCEPTEES,
    cfg: { accueil: { titre: "<b>Club</b>", description: "<img src=x onerror=alert(1)>" } } });
  await attendre(d.page, villeOuverte, 20000);
  const sd = await d.page.evaluate(lireEcran);
  verifier(sd.titre === "<b>Club</b>" && sd.balises === 0 && /^<img/.test(sd.desc || ""),
    "🔒 HTML de l'index montré en texte, jamais interprété", JSON.stringify(sd));
  verifier(!d.journal.erreurs.length, "HTML en texte : console sans erreur", d.journal.erreurs.join(" | "));
  await d.ctx.close();
}

// ── 4 : instance protégée ───────────────────────────────────────────────
async function protegee(nav, vue) {
  console.log("\n— " + vue.nom + " : ville seule AVEC mot de passe —");
  const { ctx, page, journal } = await nouvellePage(nav, vue,
    { cfg: { accessHash: HASH, accueil: { titre: "Installation privée" } } });
  await attendre(page, function () {
    const o = document.getElementById("kta-unlock-overlay");
    return !!(o && o.classList.contains("kta-bv-ville-seule") && o.querySelector(".kta-bv-code-champ"));
  }, 20000);
  await page.waitForTimeout(600);
  const e = await page.evaluate(lireEcran);
  verifier(e.champ && e.note && !e.entrer.length && e.doc && e.titre === "Installation privée",
    "champ « Code d'accès » (et à qui le demander) à la place d'« Entrer », 📖 gardé", JSON.stringify(e));
  verifier(e.autres === 0 && e.pro === 0 && e.source === 0 && e.contacts === 0 && !e.defile && !e.deborde,
    "ni présentation, ni pastille pro, ni lien source, ni contacts ; rien ne défile ni ne déborde", JSON.stringify(e));
  verifier(!e.petites.length, "cibles ≥ 44 px", JSON.stringify(e.petites));
  await capture(page, vue.nom + "-protege");

  const saisir = async function (v) {
    await page.fill(".kta-bv-code-champ", v);
    await page.press(".kta-bv-code-champ", "Enter");
    await page.waitForTimeout(400);
  };
  await saisir("pas-le-bon");
  const faux = await page.evaluate(function () {
    const o = document.getElementById("kta-unlock-overlay");
    return { erreur: (document.querySelector(".kta-bv-code-retour") || {}).textContent || "",
      u: localStorage.getItem("myktamap_unlock_v1"), defile: o.scrollHeight > o.clientHeight + 1 };
  });
  verifier(/incorrect/i.test(faux.erreur) && /4/.test(faux.erreur) && !faux.u && !faux.defile,
    "code faux : refusé, 4 essais restants, rien mémorisé, toujours sans défilement", JSON.stringify(faux));

  if (vue.nom === "telephone") {
    for (let i = 0; i < 4; i++) await saisir("faux-" + i);
    await page.waitForTimeout(500);
    const v = await page.evaluate(function () {
      const o = document.getElementById("kta-unlock-overlay");
      return { classe: o.classList.contains("kta-bv-verrou"), champ: o.querySelector(".kta-bv-code-champ").disabled,
        rebours: (o.querySelector(".kta-bv-code-rebours") || {}).textContent || "", ville: o.classList.contains("kta-bv-ville-seule") };
    });
    verifier(v.classe && v.champ && /\d+ min/.test(v.rebours) && v.ville, "5 échecs : verrou dans la zone du champ, ville gardée",
      JSON.stringify(v));
    await capture(page, "telephone-verrou");
    await page.evaluate(function () {
      const l = JSON.parse(localStorage.getItem("myktamap_unlock_lock_v1"));
      l.until = Date.now() + 1200;
      localStorage.setItem("myktamap_unlock_lock_v1", JSON.stringify(l));
    });
    await page.waitForTimeout(3000);
    verifier(await page.evaluate(function () { return !document.querySelector(".kta-bv-code-champ").disabled; }),
      "fin du verrou : le champ revient sans recharger");
  }

  await page.fill(".kta-bv-code-champ", CODE);
  await page.press(".kta-bv-code-champ", "Enter");
  await attendre(page, function () { return !!document.getElementById("kta-legal-refuse"); }, 6000)
    .then(function () { ok("code juste : conditions refusables avant d'entrer"); })
    .catch(function () { pb("code juste : conditions absentes"); });
  if (vue.nom === "pc") {
    await page.click("#kta-legal-refuse").catch(function () {});
    await page.waitForTimeout(700);
    const r = await page.evaluate(function () {
      const o = document.getElementById("kta-unlock-overlay");
      const ch = o && o.querySelector(".kta-bv-code-champ");
      return { ouvert: !!o, actif: !!(ch && !ch.disabled), vide: !!(ch && ch.value === "") };
    });
    verifier(r.ouvert && r.actif && r.vide, "refus : la ville reste, champ réactivé et vidé", JSON.stringify(r));
    await page.fill(".kta-bv-code-champ", CODE);
    await page.press(".kta-bv-code-champ", "Enter");
    await attendre(page, function () { return !!document.getElementById("kta-legal-cb"); }, 6000).catch(function () {});
  }
  await page.check("#kta-legal-cb");
  await page.click("#kta-legal-accept");
  const app = await etatApp(page);
  verifier(!app.ouvert && app.accueil && app.u === HASH && app.k === HASH,
    "acceptées : l'app, accès mémorisé par le hash d'instance (jamais libre-v1)", JSON.stringify(app));
  verifier(!journal.erreurs.length, "console sans erreur ni violation CSP", journal.erreurs.join(" | "));
  await ctx.close();
}

// ── 5 : documentation et repli ──────────────────────────────────────────
// ── 7 : data/reglages.json (fichier de l'installation, hors Git) ─────────
async function reglages(nav) {
  console.log("\n— data/reglages.json : prime sur l'index, champ faux ignoré, clés interdites ignorées (390×844) —");
  const vue = VUES[0];
  const a = await nouvellePage(nav, vue, { ls: ACCEPTEES,
    cfg: { accueil: { titre: "Titre index", description: "Description index" }, subtitle: "Sous-titre index" },
    reglages: { accueil: { titre: "Titre réglages", description: 42 }, subtitle: "Sous-titre réglages",
      accessHash: HASH, serverConnection: { state: "on", api: "/api/", modules: ["js/inconnu.js"] },
      plans: [{ id: "intrus", path: "data/intrus", name: "Intrus" }] } });
  await attendre(a.page, villeOuverte, 20000);
  const e = await a.page.evaluate(lireEcran);
  verifier(e.titre === "Titre réglages" && e.desc === "Description index",
    "le titre de reglages.json prime ; sa description mal formée est ignorée, celle de l'index s'applique",
    JSON.stringify([e.titre, e.desc]));
  const st = await a.page.evaluate(function () {
    const s = window.KtaInstance.etat();
    return { sousTitre: s.config && s.config.subtitle, cles: Object.keys(s.reglages || {}).sort().join(","),
      cnx: window.KtaExtensions.etat().etat, hash: !!(s.config && s.config.accessHash) };
  });
  verifier(!e.champ && e.entrer.length === 1 && st.cles === "accueil,subtitle" && st.cnx === "off" && !st.hash,
    "🔒 accessHash, serverConnection et plans de reglages.json ignorés (pas de champ de code, connexion « off »)",
    JSON.stringify(st));
  verifier(st.sousTitre === "Sous-titre réglages", "le sous-titre de reglages.json remplace celui de l'index (config effective)");
  await a.page.click('[data-bv="entrer"]');
  const app = await etatApp(a.page);
  const intrus = await a.page.evaluate(function () {
    return (window.PlanRegistry && typeof window.PlanRegistry.getAll === "function")
      ? window.PlanRegistry.getAll().some(function (p) { return /intrus/i.test(p.id || "") || /Intrus/.test(p.name || ""); })
      : false;
  });
  verifier(!app.ouvert && app.u === "libre-v1" && !intrus, "entrée normale, aucun plan déclaré par reglages.json",
    JSON.stringify({ app: app, intrus: intrus }));
  verifier(!a.journal.erreurs.length, "reglages.json : console sans erreur", a.journal.erreurs.join(" | "));
  await a.ctx.close();

  const b = await nouvellePage(nav, vue, { ls: ACCEPTEES, cfg: {}, reglages: { subtitle: "Seul sous-titre" } });
  await attendre(b.page, villeOuverte, 20000);
  const eb = await b.page.evaluate(lireEcran);
  verifier(eb.titre === "MyKTAMap" && eb.desc === "Seul sous-titre", "reglages.json sans accueil : son sous-titre en description",
    JSON.stringify([eb.titre, eb.desc]));
  await b.ctx.close();

  const c = await nouvellePage(nav, vue, { ls: ACCEPTEES, cfg: { accueil: { titre: "Titre index" } }, reglages: "{ pas du json" });
  await attendre(c.page, villeOuverte, 20000);
  const ec = await c.page.evaluate(lireEcran);
  verifier(ec.titre === "Titre index" && ec.desc === "Cartographie souterraine" && !c.journal.erreurs.length,
    "reglages.json illisible : ignoré sans erreur, l'index et les défauts s'appliquent",
    JSON.stringify([ec.titre, ec.desc, c.journal.erreurs]));
  await c.ctx.close();
}

async function docEtRepli(nav) {
  console.log("\n— 📖 Documentation, puis repli (css/bienvenue.css bloquée), 390×844 —");
  const a = await nouvellePage(nav, VUES[0], { ls: ACCEPTEES, cfg: {} });
  await attendre(a.page, villeOuverte, 20000);
  await a.page.click('[data-bv="doc"]');
  await attendre(a.page, function () {
    const m = document.getElementById("kta-readme-modal");
    const o = document.getElementById("kta-unlock-overlay");
    return m && o && parseInt(getComputedStyle(m).zIndex, 10) > parseInt(getComputedStyle(o).zIndex, 10);
  }, 10000).then(function () { ok("📖 Documentation s'ouvre par-dessus la ville"); })
    .catch(function () { pb("📖 Documentation absente ou sous la ville"); });
  verifier(!a.journal.erreurs.length, "documentation : console sans erreur", a.journal.erreurs.join(" | "));
  await a.ctx.close();

  const b = await nouvellePage(nav, VUES[0], { ls: ACCEPTEES, cfg: {}, bloquerCss: true });
  await attendre(b.page, function () { return !!document.getElementById("kta-unlock-libre-btn"); }, 20000)
    .then(function () { ok("fichiers de l'écran absents : la carte centrée « Entrer »"); })
    .catch(function () { pb("repli : pas de carte centrée"); });
  await b.ctx.close();
}

(async function main() {
  const server = require("./server.js");
  let pont = null;
  try { pont = await relais(); } catch (e) { pb("relais " + HOTE + ":" + PORT + " impossible : " + e.message); }
  const joues = [];
  if (pont) {
    for (const nom of moteurs()) {
      let nav = null;
      try {
        nav = await lancerMoteur(nom);
        if (!nav) continue;
        MOTEUR = nom;
        console.log("\n══ moteur " + nom + " (" + nav.version() + ") ══");
        for (const vue of VUES) await libre(nav, vue);
        await textes(nav);
        for (const vue of VUES) await protegee(nav, vue);
        await reglages(nav);
        await docEtRepli(nav);
        joues.push(nom);
      } catch (e) {
        pb("exception : " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
      } finally {
        if (nav) await nav.close();
      }
    }
    pont.close();
  }
  if (server && server.close) server.close();
  if (!joues.length && !problemes.length) pb("aucun moteur lancé (KTA_MOTEURS=" + (process.env.KTA_MOTEURS || "") + ")");
  console.log("");
  if (problemes.length) {
    console.log("⚠️ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP ACCUEIL HORS PRÉSENTATION VERT (" + joues.join(" + ") + ") — ville seule, textes, « Entrer », code d'accès, repli.");
})();
