#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-dossier-hors-ligne.js — « 📥 Tout garder hors ligne » d'un dossier de l'accueil (consultatif)
// =====================================================================
// Plans serveur FICTIFS servis par interception (`fictif/<plan>/…`, ETag par version, 304 sur If-None-Match) :
//   1. dossier mixte : manquant récupéré, à jour sauté, version plus récente mise à jour, plan ZIP de l'index
//      récupéré, plan local mémorisé « déjà là », plan introuvable en échec AVEC sa raison ; bilan + toast warn ;
//   2. deuxième passe : tout est à jour, AUCUN fichier retéléchargé, toast success ;
//   2 bis. « Non classés » : son menu ⋮ porte le même bouton, la boucle ne prend que les plans affichés du groupe ;
//   3. « Arrêter » pendant le 1er plan d'un dossier lent : arrêt, plans restants non traités, état honnête ;
//   4. plus de 200 Mo estimés : confirmation avec la taille ; Annuler → rien ne part ;
//   5. données mobiles (navigator.connection.type simulé) : confirmation même pour un petit plan ;
//   6. onglet en arrière-plan pendant un plan (réseau coupé le temps du gel) : reprise au retour, fichiers déjà
//      rangés non retéléchargés, plan complet.
// Usage : node scripts/smoke/checkup-dossier-hors-ligne.js (Playwright ; SMOKE_PORT, KTA_CHROMIUM ;
//   DHL_SHOTS=<dossier> : captures de l'avancement et du bilan).
"use strict";
const path = require("path");
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const server = require("./server.js");
const URL = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123) + "/index.html";
const SHOTS = process.env.DHL_SHOTS || null;
const LS = {
  myktamap_unlock_v1: "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  myktamap_terms_accepted_v1: "1", myktamap_pin_proposal_done_v1: "1", myktamap_tutorial_seen_v1: "1",
  myktamap_osm_view_opt_in: "false", myktamap_home_footer_replie_v1: "false"
};
const echecs = [];
function t(msg, ok) { console.log((ok ? "✅ " : "❌ ") + msg); if (!ok) echecs.push(msg); }
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));

const P = (id, nom, extra) => Object.assign({ id: id, path: "fictif/" + id, name: nom, folder: "dhl" }, extra || {});
const INDEX = {
  folders: [{ id: "dhl", name: "Secteur nord" }, { id: "lents", name: "Lents" }, { id: "lourds", name: "Lourds" },
    { id: "gel", name: "Gel" }, { id: "mobile", name: "Mobile" }],
  plans: [P("neuf", "Neuf"), P("ajour", "A jour"), P("maj", "Majeur"), P("absent", "Absent"),
    { id: "zip", path: "fictif/zipdir", zip: "fictif/plan.zip", name: "Archive", folder: "dhl" },
    P("lent1", "Lent 1", { folder: "lents" }), P("lent2", "Lent 2", { folder: "lents" }), P("lent3", "Lent 3", { folder: "lents" }),
    P("lourd", "Lourd", { folder: "lourds" }), P("gros", "Gros", { folder: "gel" }), P("mob", "Mobile", { folder: "mobile" }),
    { id: "libre", path: "fictif/libre", name: "Libre" }]
};
const COUCHES = { libre: 1, neuf: 2, ajour: 2, maj: 2, lent1: 4, lent2: 4, lent3: 4, lourd: 2, gros: 12, mob: 1 };
const VERS = { libre: 1, neuf: 1, ajour: 1, maj: 1, lent1: 1, lent2: 1, lent3: 1, lourd: 1, gros: 1, mob: 1, zip: 1 };
const banc = { get200: {}, lent: 0, gel: false };
function cfgDe(plan) {
  const dl = [];
  for (let i = 1; i <= (COUCHES[plan] || 1); i++) dl.push({ name: "c" + i, file: "c" + i + ".json" });
  return { plan: { name: plan, version: "V" + VERS[plan], imageWidth: 64, imageHeight: 64, baseImage: "base.png" }, dataLayers: dl };
}

async function intercepter(ctx) {
  await ctx.route("**/data/index.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(INDEX) }));
  await ctx.route("**/fictif/**", async (route) => {
    const req = route.request();
    const u = new globalThis.URL(req.url());
    const morceaux = u.pathname.replace(/^\/fictif\//, "").split("/");
    const plan = morceaux[0] === "plan.zip" ? "zip" : morceaux[0];
    const fichier = morceaux[1] || "plan.zip";
    if (plan === "absent" || !VERS[plan]) return route.fulfill({ status: 404, body: "404" });
    if (banc.gel && fichier !== "plan-config.json") return route.abort("internetdisconnected");
    if (banc.lent) await attendre(banc.lent);
    const etag = '"' + plan + "-" + VERS[plan] + "-" + fichier + '"';
    if (req.headers()["if-none-match"] === etag) return route.fulfill({ status: 304, headers: { ETag: etag } });
    const corps = fichier === "plan-config.json" ? JSON.stringify(cfgDe(plan))
      : plan === "zip" ? "PK\u0003\u0004" + "z".repeat(2000) : "x".repeat(1000);
    const taille = (plan === "lourd" && req.method() === "HEAD") ? 150 * 1024 * 1024 : Buffer.byteLength(corps);
    const h = { ETag: etag, "Content-Type": "application/octet-stream", "Content-Length": String(taille) };
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: h, body: "" });
    if (u.searchParams.get("_ktacheck") === null) banc.get200[u.pathname] = (banc.get200[u.pathname] || 0) + 1;
    return route.fulfill({ status: 200, headers: h, body: corps });
  });
}

async function ouvrir(ctx) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => { console.log("   pageerror : " + e.message); echecs.push("pageerror " + e.message); });
  p.on("console", (m) => { if (/Clé manquante/.test(m.text())) { console.log("   " + m.text()); echecs.push(m.text()); } });
  await p.goto(URL, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(() => {});
  await p.waitForFunction(() => window.PlanRegistry && window.PlanRegistry.findById("server_neuf") && window.KtaDossierHorsLigne, null, { timeout: 15000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => {
    const m = document.getElementById("kta-alert-modal"); if (m) m.remove();
    window.__toasts = [];
    const o = window.OOMGuard.showToast;
    window.OOMGuard.showToast = function (m, ty) { window.__toasts.push([String(m), ty]); return o.apply(this, arguments); };
    window.PlanRegistry.setPlansView("folders");
    window.PlanRegistry.getFolders().forEach((f) => window.PlanRegistry.setFolderCollapsed(f.id, false));
    window.refreshPlansList();
  });
  await p.waitForTimeout(300);
  return p;
}
const idDossier = (p, nom) => p.evaluate((n) => (window.PlanRegistry.findFolderByName(n) || {}).id, nom);

// Ouvre le menu ⋮ du dossier, clique « Tout garder hors ligne ». Rend sans attendre la fin.
async function lancerDossier(p, nom) {
  const fid = await idDossier(p, nom);
  await p.click('.kta-plans-folder-head[data-folder="' + fid + '"] .kta-plans-folder-menu');
  await p.waitForSelector("[data-hors-ligne]", { timeout: 5000 });
  await p.click("[data-hors-ligne]");
}
async function bilan(p, timeout) {
  await p.waitForSelector("#kta-dhl-fermer", { timeout: timeout || 30000 });
  return p.evaluate(() => {
    const out = {};
    document.querySelectorAll("#kta-dhl-bilan .kta-dhl-bilan-titre").forEach((el) => {
      const ul = el.nextElementSibling && el.nextElementSibling.tagName === "UL" ? el.nextElementSibling : null;
      out[el.dataset.bilan] = { texte: el.textContent, items: ul ? Array.from(ul.children).map((li) => li.textContent) : [] };
    });
    return { blocs: out, ligne: document.getElementById("kta-dhl-ligne").textContent, toast: window.__toasts[window.__toasts.length - 1] || null };
  });
}
async function fermerBilan(p) { await p.click("#kta-dhl-fermer"); await p.waitForTimeout(150); }
const statut = (p, id) => p.evaluate((i) => window.PlanOffline.statut(i).then((s) => s.etat), id);
const capture = async (p, nom) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, nom + ".png") }); };

(async function () {
  console.log("📥 checkup DOSSIER HORS LIGNE — tout le dossier sur l'appareil, un plan à la fois\n");
  let nav;
  try {
    nav = await lancerNavigateur(chromium, process.env.KTA_CHROMIUM ? { executablePath: process.env.KTA_CHROMIUM } : {});
    let ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 860 } });
    await ctx.addInitScript((ls) => {
      for (const k in ls) if (!localStorage.getItem(k)) localStorage.setItem(k, ls[k]);
      // Visibilité pilotable (scénario 6) : document.visibilityState lit window.__kvis.
      Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => window.__kvis || "visible" });
      Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => window.__kvis === "hidden" });
    }, LS);
    await intercepter(ctx);
    const p = await ouvrir(ctx);

    // ── 1. dossier mixte ──
    await p.evaluate(async () => {
      const PR = window.PlanRegistry;
      await window.PlanOffline.precacher(PR.findById("server_ajour"));
      await window.PlanOffline.precacher(PR.findById("server_maj"));
      PR.addOrUpdate({ id: "local_l1", type: "local", name: "Local memorise", storedBlob: true });
      PR.setPlanFolder("local_l1", PR.findFolderByName("Secteur nord").id, "user");
      window.refreshPlansList();
    });
    VERS.maj = 2;   // une version plus récente sur le serveur
    banc.get200 = {};
    await p.waitForTimeout(200);
    const bouton = await (async () => {
      const fid = await idDossier(p, "Secteur nord");
      await p.click('.kta-plans-folder-head[data-folder="' + fid + '"] .kta-plans-folder-menu');
      await p.waitForSelector("[data-hors-ligne]", { timeout: 5000 });
      return p.evaluate(() => document.querySelector("[data-hors-ligne]").textContent);
    })();
    t("menu ⋮ du dossier : bouton « 📥 Tout garder hors ligne »", /📥/.test(bouton) && /hors ligne/.test(bouton));
    await p.click("[data-hors-ligne]");
    await p.waitForSelector("#kta-dhl-ligne", { timeout: 5000 });
    await capture(p, "dhl-avancement");
    const b1 = await bilan(p);
    await capture(p, "dhl-bilan");
    const items = (k) => (b1.blocs[k] || { items: [] }).items.join(" | ");
    if (!b1.blocs.recuperes || !b1.blocs.majs) console.log("   bilan : " + JSON.stringify(b1));
    t("manquants récupérés : le plan serveur absent ET le plan ZIP de l'index",
      /Neuf/.test(items("recuperes")) && /Archive/.test(items("recuperes")) && (b1.blocs.recuperes || {}).items.length === 2);
    t("version plus récente : mise à jour (et seulement elle)", items("majs") === "Majeur");
    t("à jour sauté + plan local mémorisé → « déjà sur l'appareil » : 2", /: 2/.test((b1.blocs.deja || {}).texte || ""));
    t("plan introuvable : en échec AVEC sa raison", /Absent — .+/.test(items("echecs")));
    t("toast warn (une erreur) qui résume", b1.toast && b1.toast[1] === "warn" && /1 récupéré|2 récupéré/.test(b1.toast[0]));
    t("plan à jour : AUCUN fichier retéléchargé", !Object.keys(banc.get200).some((k) => k.indexOf("/fictif/ajour/") === 0));
    const apres1 = await p.evaluate(async () => {
      const PR = window.PlanRegistry, PO = window.PlanOffline;
      const v = await PO.verifierMaj(PR.findById("server_maj"));
      return { neuf: (await PO.statut("server_neuf")).etat, maj: v.etat, zip: !!PR.findById("server_zip").storedBlob };
    });
    t("état RELU du cache : neuf complet, majeur désormais à jour, archive gardée", apres1.neuf === "complet" && apres1.maj === "ajour" && apres1.zip);
    await fermerBilan(p);

    // ── 2. deuxième passe ──
    banc.get200 = {};
    await lancerDossier(p, "Secteur nord");
    const b2 = await bilan(p);
    t("2e passe : rien récupéré ni mis à jour, 5 déjà là, l'échec reste", !b2.blocs.recuperes && !b2.blocs.majs &&
      /: 5/.test((b2.blocs.deja || {}).texte || "") && /Absent/.test(((b2.blocs.echecs || {}).items || []).join("")));
    t("2e passe : AUCUN fichier retéléchargé (sondes conditionnelles seulement)", Object.keys(banc.get200).length === 0);
    await fermerBilan(p);

    // ── 2 bis. Non classés ──
    const nc = await p.evaluate(() => Array.from(document.querySelectorAll('#allPlansList .kta-plans-folder-rows[data-folder=""] .plan-row'))
      .map((r) => r.dataset.id));
    await p.click(".kta-plans-folder-unfiled .kta-plans-folder-menu");
    await p.waitForSelector("[data-hors-ligne]", { timeout: 5000 });
    const ncSeul = await p.evaluate(() => document.querySelectorAll(".kta-plans-sheet-overlay button:not([data-close])").length);
    t("« Non classés » : menu ⋮ avec le seul bouton « 📥 Tout garder hors ligne »", ncSeul === 1);
    await p.click("[data-hors-ligne]");
    const bnc = await bilan(p);
    const tousNc = ((bnc.blocs.recuperes || {}).items || []).length + ((bnc.blocs.majs || {}).items || []).length +
      Number((((bnc.blocs.deja || {}).texte || "").match(/: (\d+)/) || [0, 0])[1]) + ((bnc.blocs.echecs || {}).items || []).length;
    t("…même boucle sur les plans affichés du groupe (" + nc.length + ") : « Libre » récupéré, aucun plan d'un dossier",
      /Libre/.test(((bnc.blocs.recuperes || {}).items || []).join("")) && tousNc === nc.length && nc.indexOf("server_neuf") < 0 &&
      (await statut(p, "server_libre")) === "complet", bnc);
    await fermerBilan(p);

    // ── 3. Arrêter ──
    banc.lent = 700;
    await lancerDossier(p, "Lents");
    await p.waitForFunction(() => /^1 \/ 3/.test((document.getElementById("kta-dhl-ligne") || {}).textContent || ""), null, { timeout: 15000 });
    await p.waitForTimeout(400);
    await p.click("#kta-dhl-arreter");
    const b3 = await bilan(p, 20000);
    banc.lent = 0;
    const nt = ((b3.blocs.nonTraites || {}).items || []).join(" | ");
    t("Arrêter : fenêtre « Arrêté », Lent 2 et Lent 3 non traités, toast warn",
      /Arrêt/.test(b3.ligne) && /Lent 2/.test(nt) && /Lent 3/.test(nt) && b3.toast && b3.toast[1] === "warn");
    const e3 = await Promise.all(["server_lent1", "server_lent2", "server_lent3"].map((i) => statut(p, i)));
    t("état honnête après l'arrêt : aucun plan « complet » (" + e3.join(", ") + ")", e3.every((e) => e !== "complet"));
    await fermerBilan(p);

    // ── 4. plus de 200 Mo ──
    banc.get200 = {};
    await lancerDossier(p, "Lourds");
    await p.waitForSelector("#kta-confirm-oui", { timeout: 15000 });
    const q = await p.evaluate(() => document.querySelector(".kta-readme-modal-overlay:last-of-type .kta-readme-modal-corps p").textContent);
    t("> 200 Mo : confirmation qui donne la taille (" + q.replace(/\s+/g, " ").slice(0, 60) + ")", /1 plan/.test(q) && /\d{3}[,.]\d Mo/.test(q));
    await p.click("#kta-confirm-non");
    const b4 = await bilan(p);
    t("Annuler : rien ne part (plan non traité, aucun fichier téléchargé hors plan-config)",
      /Lourd/.test(((b4.blocs.nonTraites || {}).items || []).join("")) &&
      !Object.keys(banc.get200).some((k) => /\/fictif\/lourd\/(?!plan-config)/.test(k)) && (await statut(p, "server_lourd")) === "absent");
    await fermerBilan(p);

    // ── 6. arrière-plan pendant un plan ──
    banc.get200 = {}; banc.lent = 250;
    await lancerDossier(p, "Gel");
    await p.waitForFunction(() => /fichiers/.test((document.getElementById("kta-dhl-detail") || {}).textContent || "") &&
      /^[3-9] \//.test(document.getElementById("kta-dhl-detail").textContent), null, { timeout: 15000 });
    await p.evaluate(() => { window.__kvis = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    banc.gel = true;
    await p.waitForFunction(() => /reprise/i.test((document.getElementById("kta-dhl-detail") || {}).textContent || ""), null, { timeout: 15000 })
      .catch(() => {});
    const repriseVue = await p.evaluate(() => /reprise/i.test(document.getElementById("kta-dhl-detail").textContent));
    await p.waitForTimeout(800);
    banc.gel = false;
    await p.evaluate(() => { window.__kvis = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    const b6 = await bilan(p, 30000);
    banc.lent = 0;
    const doubles = Object.keys(banc.get200).filter((k) => k.indexOf("/fictif/gros/") === 0 && !/plan-config/.test(k) && banc.get200[k] > 1);
    t("arrière-plan : « reprise dès le retour » affiché pendant le gel", repriseVue);
    t("…puis le plan est récupéré, complet, sans échec", /Gros/.test(((b6.blocs.recuperes || {}).items || []).join("")) &&
      !b6.blocs.echecs && (await statut(p, "server_gros")) === "complet");
    t("…et aucun fichier déjà rangé n'est retéléchargé (" + doubles.length + " doublon(s))", doubles.length === 0);
    await fermerBilan(p);
    await ctx.close();

    // ── 5. données mobiles ──
    ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 }, hasTouch: true });
    await ctx.addInitScript((ls) => {
      for (const k in ls) if (!localStorage.getItem(k)) localStorage.setItem(k, ls[k]);
      Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ type: "cellular", effectiveType: "4g" }) });
    }, LS);
    await intercepter(ctx);
    const pm = await ouvrir(ctx);
    await lancerDossier(pm, "Mobile");
    await pm.waitForSelector("#kta-confirm-oui", { timeout: 15000 });
    const qm = await pm.evaluate(() => document.querySelector(".kta-readme-modal-overlay:last-of-type .kta-readme-modal-corps p").textContent);
    t("données mobiles : confirmation même pour un petit plan, qui le dit", /données mobiles/.test(qm));
    await capture(pm, "dhl-mobile-confirmation");
    await pm.click("#kta-confirm-oui");
    const b5 = await bilan(pm);
    t("…accepté : le plan est récupéré, toast success", /Mobile/.test(((b5.blocs.recuperes || {}).items || []).join("")) &&
      b5.toast && b5.toast[1] === "success");
    const largeur = await pm.evaluate(() => { const b = document.querySelector(".kta-dhl-boite"); return b ? Math.round(b.getBoundingClientRect().width) : 0; });
    t("téléphone 390 : la fenêtre tient dans l'écran (" + largeur + " px)", largeur > 0 && largeur <= 390);
    await capture(pm, "dhl-mobile-bilan");
    await ctx.close();
  } catch (e) {
    console.error("\n❌ checkup impossible : " + e.message);
    if (nav) await nav.close();
    server.close();
    process.exit(2);
  }
  await nav.close();
  server.close();
  if (!echecs.length) { console.log("\n🎉 dossier hors ligne : récupérés, mis à jour, sautés, arrêt, confirmation, reprise"); process.exit(0); }
  console.log("\n💥 dossier hors ligne : " + echecs.length + " contrôle(s) en échec");
  process.exit(1);
})();
