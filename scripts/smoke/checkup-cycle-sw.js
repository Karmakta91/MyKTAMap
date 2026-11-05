#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-cycle-sw.js — checkup (Playwright, profil persistant) : cycle de vie du Service Worker
// =====================================================================
// Serveur propre au checkup, qui imite le site en ligne : ETag + 304, `no-cache` sur sw.js et version.json, toute
// adresse inconnue servie en 200 avec la page de l'app, `deploiement.json` à la racine. Trois versions servies à la
// suite : A (dépôt tel quel) · B (correctif SANS bump : index.html et un JS changés, autre commit) · C (bump).
//   1. visiteur : écran Bienvenue sans « Entrer » → 0 SW, 0 cache, stockage mesuré ; instance à mot de passe sans code
//      → 0 SW ; « Entrer » + conditions → SW inscrit, précache complet (délai mesuré = le trou) ; coupure réseau :
//      l'app redémarre et le relevé fictif, rendu disponible hors ligne, s'ouvre ;
//   2. correctif sans bump (B) : nouvelle page au 2e chargement, aucune fenêtre ;
//   3. bump (C) + « Mettre à jour » (sw.js retenu jusqu'au clic : le bouton installe le nouveau SW) : plan hors ligne et
//      cache de module gardés, cache de l'app complet, nouveau code ;
//   4. bascule passive (C, autre profil) : nouveau code au 2e chargement, plus de fenêtre ensuite ;
//   5. poids de l'installation : précache en "no-cache" (actuel) puis en "reload" (sw.js modifié à la volée).
// Rien n'est écrit dans data/ (l'index est lu par le serveur et servi tel quel, ou avec un accessHash).
// Usage : node scripts/smoke/checkup-cycle-sw.js (SMOKE_PORT, défaut 8131 ; Chromium seul, KTA_MOTEURS=webkit pour WebKit ;
//   CYCLE_SW_ETAPES=1,2 pour quelques parties)
// =====================================================================
"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { moteurs, lancerPersistant } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app

const RACINE = path.resolve(__dirname, "..", "..");
const PORT = parseInt(process.env.SMOKE_PORT, 10) || 8131;
const BASE = "http://127.0.0.1:" + PORT;
// CYCLE_SW_ETAPES=1,2 : seulement ces parties (la 1 se joue toujours, les 2 et 3 en dépendent).
const ETAPES = String(process.env.CYCLE_SW_ETAPES || "1,1bis,2,3,4,5").split(",");
const CODE = "essai-cycle-sw";
const HASH = crypto.createHash("sha256").update(CODE).digest("hex");
const LS_ENTRE = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon" };

const problemes = [];
const mesures = [];
let MOTEUR = "";
function pb(m) { problemes.push((MOTEUR ? "[" + MOTEUR + "] " : "") + m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function info(m) { console.log("  ℹ️  " + m); mesures.push((MOTEUR ? "[" + MOTEUR + "] " : "") + m); }
function verifier(c, m, detail) { if (c) ok(m); else pb(m + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
function mo(n) { return (n / 1048576).toFixed(2) + " Mo"; }

// ── Serveur : version servie, coupure, comptage ──
const etat = { version: "A", swRetenu: false, installReload: process.env.CYCLE_SW_RELOAD === "1", accessHash: null, coupe: false, octets: 0, r200: 0, r304: 0 };
const CSP = (function () {
  try {
    const m = fs.readFileSync(path.join(RACINE, "docker", "nginx-docker.conf"), "utf8")
      .match(/add_header Content-Security-Policy "([^"]+)"/);
    return m ? m[1].replace(/\s*upgrade-insecure-requests;?/, "").trim() : null;
  } catch (e) { return null; }
})();
function transformer(rel, buf) {
  const v = etat.version;
  let s = null;
  const txt = function () { if (s === null) s = buf.toString("utf8"); return s; };
  if (rel === "sw.js") {
    if (v === "C" && !etat.swRetenu) s = txt().replace(/myktamap-cache-v[0-9.]+/, "myktamap-cache-v9.9.9");
    if (etat.installReload) s = txt().replace('{ cache: "no-cache" }));', '{ cache: "reload" }));');
  }
  if ((v === "B" || v === "C") && rel === "index.html") s = txt().replace("<head>", '<head>\n<meta name="kta-essai" content="B">');
  if ((v === "B" || v === "C") && rel === "js/utils.js") s = txt() + "\nwindow.__ktaEssai = \"B\";\n";
  if (v === "C" && rel === "version.json") s = txt().replace(/"version"\s*:\s*"[^"]+"/, '"version": "v9.9.9"');
  if (v === "C" && rel === "js/copyright.js") s = txt().replace(/build:\s*"v[0-9.]+"/, 'build:     "v9.9.9"');
  if (rel === "data/index.json" && etat.accessHash) {
    const idx = JSON.parse(txt());
    idx.config = Object.assign({}, idx.config || {}, { accessHash: etat.accessHash });
    s = JSON.stringify(idx);
  }
  return s === null ? buf : Buffer.from(s, "utf8");
}
const serveur = http.createServer(function (req, res) {
  if (etat.coupe) { req.socket.destroy(); return; }
  const chemin = decodeURIComponent((req.url || "/").split("?")[0]);
  if (chemin === "/deploiement.json") {
    const corps = Buffer.from(JSON.stringify({ commit: etat.version.toLowerCase().repeat(40), branche: "essai" }));
    return envoyer(req, res, corps, MIME[".json"], "deploiement-" + etat.version, true);
  }
  let fp = path.join(RACINE, chemin === "/" ? "index.html" : chemin);
  if (!fp.startsWith(RACINE)) { res.writeHead(403); res.end(); return; }
  fs.readFile(fp, function (err, buf) {
    // Adresse inconnue : la page de l'app en 200, comme le serveur en ligne.
    if (err) { fp = path.join(RACINE, "index.html"); buf = fs.readFileSync(fp); }
    const rel = path.relative(RACINE, fp).split(path.sep).join("/");
    const corps = transformer(rel, buf);
    const nocache = rel === "sw.js" || rel === "version.json";
    envoyer(req, res, corps, MIME[path.extname(fp).toLowerCase()] || "application/octet-stream", null, nocache, rel);
  });
});
function envoyer(req, res, corps, type, etiquette, nocache, rel) {
  const etag = '"' + crypto.createHash("sha1").update(corps).digest("hex").slice(0, 16) + '"';
  const h = { "Content-Type": type, "ETag": etag };
  if (nocache) h["Cache-Control"] = "no-store, no-cache, must-revalidate";
  if (CSP && /html/.test(type) && rel !== "killsw.html") h["Content-Security-Policy"] = CSP;
  if (req.headers["if-none-match"] === etag) { etat.r304++; res.writeHead(304, h); res.end(); return; }
  etat.r200++;
  etat.octets += corps.length;
  res.writeHead(200, h);
  res.end(corps);
}
function compteur() { return { o: etat.octets, r200: etat.r200, r304: etat.r304 }; }
function depuis(c0) { return { o: etat.octets - c0.o, r200: etat.r200 - c0.r200, r304: etat.r304 - c0.r304 }; }
function decrire(d) { return mo(d.o) + " (" + d.r200 + " fichiers envoyés, " + d.r304 + " réponses 304)"; }

// ── Dans la page ──
function etatSw() {
  return (async function () {
    const regs = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
    const cles = window.caches ? await caches.keys() : [];
    let usage = null;
    try { usage = (await navigator.storage.estimate()).usage; } catch (e) { usage = null; }
    const reg = regs[0];
    const sw = reg && (reg.active || reg.waiting || reg.installing);
    return { regs: regs.length, script: sw ? sw.scriptURL : null, etatSw: sw ? sw.state : null, cles: cles, usage: usage,
      controle: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      build: window.__MKM__ && window.__MKM__.build, essai: window.__ktaEssai || null,
      meta: !!document.querySelector('meta[name="kta-essai"]') };
  })();
}
function precacheComplet() {
  return (async function () {
    if (!window.SwInspector || !navigator.serviceWorker || !navigator.serviceWorker.controller) return false;
    const r = await window.SwInspector.etat();
    window.__ktaEtatCache = r;
    return r && r.etat === "ok";
  })();
}
function appPrete() {
  return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
    window.PlanRegistry.getAll().some(function (p) { return /fictif/i.test(p.name || ""); }) &&
    !document.getElementById("kta-unlock-overlay") && !document.getElementById("kta-legal-gate-overlay");
}
function modaleMaj() { return !!document.getElementById("kta-update-modal"); }

async function nouveauProfil(nom, ls) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "kta-cycle-sw-" + nom + "-"));
  const ctx = await lancerPersistant(MOTEUR, dossier, { viewport: { width: 390, height: 844 } });
  if (!ctx) throw new Error("moteur " + MOTEUR + " absent");
  const page = ctx.pages()[0] || await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message).slice(0, 200)); });
  const journal = [];
  page.on("response", function (r) { if (r.status() >= 400) journal.push("http " + r.status() + " " + r.url().slice(0, 140)); });
  page.on("console", function (m) { journal.push(m.type() + " " + m.text().slice(0, 160)); if (journal.length > 400) journal.shift(); });
  if (ls) {
    await page.addInitScript(function (l) {
      if (localStorage.getItem("__kta_seme")) return;
      for (const k in l) localStorage.setItem(k, l[k]);
      localStorage.setItem("__kta_seme", "1");
    }, ls);
  }
  return { ctx: ctx, page: page, erreurs: erreurs, journal: journal, dossier: dossier };
}
async function fermer(p) {
  await p.ctx.close().catch(function () {});
  try { fs.rmSync(p.dossier, { recursive: true, force: true }); } catch (e) { /* profil verrouillé : dossier temporaire */ }
}
async function charger(page) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await attendre(page, appPrete, 40000);
}

// 1. Visiteur, entrée, hors ligne.
async function visiteur() {
  console.log("\n— 1. visiteur de passage, puis « Entrer » et hors ligne —");
  etat.version = "A";
  const p = await nouveauProfil("visiteur");
  const page = p.page;
  const c0 = compteur();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!document.querySelector('[data-bv="entrer"]'); }, 30000);
  await page.waitForTimeout(12000);
  const avant = await page.evaluate(etatSw);
  verifier(avant.regs === 0, "Bienvenue sans « Entrer » : aucun service worker", avant);
  verifier(avant.cles.length === 0, "Bienvenue sans « Entrer » : aucun cache", avant.cles);
  info("visiteur de passage : page " + decrire(depuis(c0)) + ", stockage " + (avant.usage === null ? "?" : mo(avant.usage)));

  const c1 = compteur();
  const t0 = Date.now();
  await page.evaluate(function () { document.querySelector('[data-bv="entrer"]').click(); });
  await attendre(page, function () { return !!document.getElementById("kta-legal-cb"); }, 15000);
  await page.evaluate(function () {
    const cb = document.getElementById("kta-legal-cb");
    cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("kta-legal-accept").click();
  });
  await attendre(page, appPrete, 40000);
  let complet = true;
  await attendre(page, precacheComplet, 120000, 500).catch(function () { complet = false; });
  const trou = Date.now() - t0;
  const apres = await page.evaluate(etatSw);
  verifier(apres.regs === 1 && apres.controle, "après « Entrer » : service worker inscrit et aux commandes", apres);
  verifier(complet, "après « Entrer » : précache complet", await page.evaluate(function () { return window.__ktaEtatCache; }));
  if (!complet) {
    const echecs = await page.evaluate(function () {
      return new Promise(function (r) {
        const c = new MessageChannel();
        c.port1.onmessage = function (e) { r((e.data.failures || []).slice(0, 6)); };
        navigator.serviceWorker.controller.postMessage({ type: "GET_INSTALL_FAILURES" }, [c.port2]);
        setTimeout(function () { r("muet"); }, 3000);
      });
    });
    console.log("     · échecs d'installation : " + JSON.stringify(echecs).slice(0, 900));
  }
  info("trou après « Entrer » : précache complet en " + (trou / 1000).toFixed(1) + " s (local) ; installation " +
    decrire(depuis(c1)) + ", stockage " + mo(apres.usage || 0));

  // Plan fictif rendu disponible hors ligne + cache de module (pour la partie 3).
  const dispo = await page.evaluate(async function () {
    const plan = window.PlanRegistry.getAll().find(function (x) { return /fictif/i.test(x.name || ""); });
    await window.PlanOffline.precacher(plan);
    const c = await caches.open("myktamap-ext-essai");
    await c.put("/pro-essai.js", new Response("1"));
    return (await window.PlanOffline.statut(plan.id)).etat;
  });
  verifier(dispo === "complet" || dispo === "ok" || dispo === "disponible", "relevé fictif rendu disponible hors ligne", dispo);

  etat.coupe = true;
  await p.ctx.setOffline(true);
  let horsLigne = true;
  await charger(page).catch(function () { horsLigne = false; });
  verifier(horsLigne, "coupure réseau : l'app redémarre hors ligne");
  // 🩸 Ouvert trop tôt après le démarrage, chargerPlanDuRegistre rend la main sans rien charger (comme le note
  // checkup-ouvertures-enchainees) : on laisse l'accueil se poser, et on relance une fois.
  await page.waitForTimeout(2000);
  const ouvrir = function () { return page.evaluate(function () {
    const p = window.PlanRegistry.getAll().find(function (x) { return /fictif/i.test(x.name || ""); });
    window.__ouv = { fini: false, erreur: null };
    Promise.resolve().then(function () { return window.chargerPlanDuRegistre(p.id); })
      .then(function () { window.__ouv.fini = true; }, function (e) { window.__ouv.fini = true; window.__ouv.erreur = String(e); });
  }); };
  const carte = function () {
    return !!(window.__ouv && window.__ouv.fini && window.PLAN_CONFIG && window.map && window.map._loaded);
  };
  let plan = true;
  const j0 = p.journal.length;
  await ouvrir();
  await attendre(page, carte, 15000).catch(async function () {
    info("ouverture hors ligne relancée une fois (rendue sans rien charger)");
    await ouvrir();
    await attendre(page, carte, 40000).catch(function () { plan = false; });
  });
  verifier(plan, "coupure réseau : le relevé fictif s'ouvre", await page.evaluate(function () {
    return { ouv: window.__ouv, conf: !!window.PLAN_CONFIG, map: !!window.map };
  }));
  if (!plan) p.journal.slice(j0).slice(-40).forEach(function (l) { console.log("     · " + l); });
  await p.ctx.setOffline(false);
  etat.coupe = false;
  verifier(p.erreurs.length === 0, "aucune erreur de page", p.erreurs.slice(0, 3));
  return p;
}

// Instance à mot de passe, sans code : rien d'inscrit.
async function protegee() {
  console.log("\n— 1bis. instance à mot de passe, visiteur sans code —");
  etat.version = "A"; etat.accessHash = HASH;
  const p = await nouveauProfil("protegee");
  await p.page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await attendre(p.page, function () { return !!document.querySelector(".kta-bv-code-champ"); }, 30000);
  await p.page.waitForTimeout(10000);
  const e = await p.page.evaluate(etatSw);
  verifier(e.regs === 0 && e.cles.length === 0, "écran du code sans code : aucun service worker, aucun cache", e);
  await p.page.fill(".kta-bv-code-champ", CODE);
  await p.page.keyboard.press("Enter");
  await attendre(p.page, function () { return !!document.getElementById("kta-legal-cb"); }, 15000).then(function () {
    return p.page.evaluate(function () {
      const cb = document.getElementById("kta-legal-cb");
      cb.checked = true; cb.dispatchEvent(new Event("change", { bubbles: true }));
      document.getElementById("kta-legal-accept").click();
    });
  }).catch(function () { /* conditions déjà posées par l'écran */ });
  await attendre(p.page, function () {
    return navigator.serviceWorker.getRegistrations().then(function (r) { return r.length === 1; });
  }, 30000).then(function () { ok("code juste : service worker inscrit"); }, function () { pb("code juste : pas de service worker"); });
  etat.accessHash = null;
  await fermer(p);
}

// 2. Correctif sans bump.
async function sansBump(p) {
  console.log("\n— 2. correctif sans bump (index.html + un JS changés, même CACHE_NAME) —");
  const page = p.page;
  etat.version = "B";
  const c0 = compteur();
  await charger(page);
  const ch1 = await page.evaluate(etatSw);
  verifier(!ch1.meta, "chargement 1 : encore l'ancienne page (attendu)", ch1);
  await attendre(page, function () {
    return navigator.serviceWorker.getRegistration().then(function (r) {
      return !!(r && r.active && /[?&]d=bbbbbbbbbbbb/.test(r.active.scriptURL) && !r.installing && !r.waiting);
    });
  }, 60000).catch(function () { pb("chargement 1 : SW pas réinstallé sous le nouveau commit"); });
  info("réinstallation après un correctif : " + decrire(depuis(c0)));
  await charger(page);
  await page.waitForTimeout(6000);
  const ch2 = await page.evaluate(etatSw);
  verifier(ch2.meta && ch2.essai === "B", "chargement 2 : nouvelle page (index.html et JS)", ch2);
  verifier(!(await page.evaluate(modaleMaj)), "chargement 2 : aucune fenêtre de mise à jour");
}

// 3. Bump + « Mettre à jour ».
async function bumpMettreAJour(p) {
  console.log("\n— 3. bump puis « Mettre à jour » —");
  const page = p.page;
  // sw.js retenu jusqu'au clic : c'est « Mettre à jour » qui installe le nouveau SW (pas la vérification du navigateur).
  etat.version = "C"; etat.swRetenu = true;
  await charger(page);
  await attendre(page, modaleMaj, 30000).then(function () { ok("fenêtre « Mise à jour disponible » ouverte"); },
    function () { pb("fenêtre « Mise à jour disponible » absente"); });
  const c0 = compteur();
  etat.swRetenu = false;
  await page.evaluate(function () { const b = document.getElementById("kta-update-accept-soft"); if (b) b.click(); });
  await page.waitForEvent("load", { timeout: 60000 }).catch(function () {});
  await attendre(page, appPrete, 40000);
  let complet = true;
  await attendre(page, precacheComplet, 60000, 500).catch(function () { complet = false; });
  const e = await page.evaluate(etatSw);
  info("« Mettre à jour » : " + decrire(depuis(c0)));
  verifier(e.build === "v9.9.9", "nouveau code chargé après « Mettre à jour »", e.build);
  verifier(e.cles.indexOf("myktamap-cache-v9.9.9") >= 0 && !e.cles.some(function (k) {
    return /^myktamap-cache-/.test(k) && k !== "myktamap-cache-v9.9.9";
  }), "un seul cache de l'app, le nouveau", e.cles);
  verifier(e.cles.some(function (k) { return /^myktamap-plan-/.test(k); }), "plan hors ligne gardé", e.cles);
  verifier(e.cles.indexOf("myktamap-ext-essai") >= 0, "cache de module gardé", e.cles);
  verifier(complet, "cache de l'app complet après la mise à jour", await page.evaluate(function () { return window.__ktaEtatCache; }));
  await page.waitForTimeout(3000);
  verifier(!(await page.evaluate(modaleMaj)), "pas de fenêtre après le rechargement");
  await fermer(p);
}

// 4. Bascule passive.
async function bascule() {
  console.log("\n— 4. bascule passive (bump, sans toucher « Mettre à jour ») —");
  etat.version = "A";
  const p = await nouveauProfil("bascule", LS_ENTRE);
  const page = p.page;
  await charger(page);
  await attendre(page, precacheComplet, 120000, 500).catch(function () { pb("précache initial incomplet"); });
  etat.version = "C";
  await charger(page);
  await attendre(page, function () {
    return caches.keys().then(function (k) { return k.indexOf("myktamap-cache-v9.9.9") >= 0; });
  }, 60000).catch(function () {});
  await attendre(page, function () {
    return navigator.serviceWorker.getRegistration().then(function (r) {
      return !!(r && r.active && !r.installing && !r.waiting && /[?&]d=cccccccccccc/.test(r.active.scriptURL));
    });
  }, 60000).catch(function () { pb("nouveau SW pas aux commandes"); });
  for (const n of [2, 3]) {
    await charger(page);
    await page.waitForTimeout(8000);
    const e = await page.evaluate(etatSw);
    const vu = await page.evaluate(function () { return localStorage.getItem("myktamap_known_version"); });
    verifier(e.build === "v9.9.9", "chargement " + n + " : nouveau code", e.build);
    verifier(!(await page.evaluate(modaleMaj)), "chargement " + n + " : aucune fenêtre de mise à jour");
    verifier(vu === "v9.9.9", "chargement " + n + " : version notée", vu);
  }
  verifier(p.erreurs.length === 0, "aucune erreur de page", p.erreurs.slice(0, 3));
  await fermer(p);
}

// 5. Poids de l'installation, "no-cache" puis "reload".
async function poids() {
  console.log("\n— 5. poids de l'installation (profil neuf, déjà entré) —");
  for (const reload of [false, true]) {
    etat.version = "A"; etat.installReload = reload;
    const p = await nouveauProfil(reload ? "reload" : "nocache", LS_ENTRE);
    const c0 = compteur();
    await charger(p.page);
    await attendre(p.page, precacheComplet, 120000, 500).catch(function () { pb("précache incomplet (" + reload + ")"); });
    const total = depuis(c0);
    etat.version = "B";
    const c1 = compteur();
    await charger(p.page);
    await attendre(p.page, function () {
      return navigator.serviceWorker.getRegistration().then(function (r) {
        return !!(r && r.active && !r.installing && /[?&]d=bbbbbbbbbbbb/.test(r.active.scriptURL));
      });
    }, 60000).catch(function () { pb("réinstallation absente (" + reload + ")"); });
    info("installation en \"" + (reload ? "reload" : "no-cache") + "\" : 1re visite (page + SW) " + decrire(total) +
      " · réinstallation après un correctif " + decrire(depuis(c1)));
    await fermer(p);
  }
  etat.installReload = false;
}

(async function main() {
  await new Promise(function (r) { serveur.listen(PORT, "127.0.0.1", r); });
  console.log("[cycle-sw] " + BASE + " ← " + RACINE);
  // 🩸 Chromium par défaut : le WebKit de Playwright sous Windows échoue à écrire la plupart des entrées du précache
  // (« Failed writing data to the file system »), même sur le code d'avant ce checkup — pas un bug de l'app.
  for (const nom of (process.env.KTA_MOTEURS ? moteurs() : ["chromium"])) {
    MOTEUR = nom;
    console.log("\n══ " + nom + " ══");
    try {
      const p = await visiteur();
      if (ETAPES.indexOf("2") >= 0) await sansBump(p);
      if (ETAPES.indexOf("3") >= 0) await bumpMettreAJour(p); else await fermer(p);
      if (ETAPES.indexOf("1bis") >= 0) await protegee();
      if (ETAPES.indexOf("4") >= 0) await bascule();
      if (nom === "chromium" && ETAPES.indexOf("5") >= 0) await poids();
    } catch (e) {
      pb("exception du harnais : " + (e && e.stack || e));
    }
  }
  serveur.close();
  console.log("\n── Mesures ──");
  mesures.forEach(function (m) { console.log("  " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    problemes.forEach(function (m) { console.log("  - " + m); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — cycle de vie du Service Worker.");
  process.exit(0);
})();
