#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-recalage-scan.js — checkup (Playwright, pas un hook pré-commit) : « Recaler des données sur un autre scan »
// =====================================================================
// Sur le relevé fictif ouvert, avec des jeux FICTIFS fabriqués ici : 20 points de session posés sur le plan, et un
// fichier « autre scan » = ces points passés par une similitude connue (×1,25, 4°, décalage), plus 3 homonymes
// aberrants, un tracé et une zone. Vérifie, à la souris :
//   1. depuis l'accueil (aucun plan) : seul le mode résolutions, message clair ;
//   2. par les uid (10 points renommés) puis les noms : écart ≈ 0, les 3 aberrants écartés, sources annoncées ;
//      le fichier téléchargé retombe sur le plan ;
//   3. aperçu : calque temporaire sur la carte, retiré à la fermeture de l'outil ;
//   4. repères cliqués : 4 clics dont un faux (signalé en rouge, laissé hors du calcul), retiré → recalage juste ;
//   5. résolutions : proportions divergentes = refus bloquant ; mêmes proportions = autorisé.
// Usage : node scripts/smoke/checkup-recalage-scan.js   (SMOKE_PORT pour une autre copie ; RECAL_SHOTS=<dossier>
// pour des captures)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const SHOTS = process.env.RECAL_SHOTS || null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kta-recal-"));
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
  } catch (e) {
    return { nom: "Relevé fictif de test", fictif: true };
  }
}

const PLAN = planAOuvrir();
const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
async function capture(page, nom) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, nom + ".png") }); }

// Similitude connue : plan ouvert → « autre scan » (le fichier). L'outil doit retrouver l'inverse.
const S = 1.25, DEG = 4, TX = 310, TY = -145;
function versAutreScan(p) {
  const a = DEG * Math.PI / 180;
  return { x: S * (Math.cos(a) * p.x - Math.sin(a) * p.y) + TX, y: S * (Math.sin(a) * p.x + Math.cos(a) * p.y) + TY };
}

async function ouvrirOutil(page) {
  await page.evaluate(function () { window.ouvrirTableEditor(); });
  await page.waitForTimeout(400);
  await page.locator("#kta-tbl-src-resol").click();
  await attendre(page, function () { return !!document.getElementById("kta-recal-modal"); }, 5000);
  await page.waitForTimeout(200);
}
async function fermerOutil(page) {
  await page.locator("#kta-recal-close").click();
  await page.waitForTimeout(300);
}
async function telecharger(page, selecteur) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.locator(selecteur).click()]);
  const dest = path.join(TMP, "dl-" + Date.now() + ".json");
  await dl.saveAs(dest);
  await page.waitForTimeout(400);
  await page.locator("#kta-confirm-oui").click();   // bilan ktaAlerte : lu, puis l'outil se ferme
  await page.waitForTimeout(300);
  return { nom: dl.suggestedFilename(), obj: JSON.parse(fs.readFileSync(dest, "utf8")) };
}
function ecartMax(obj, verite) {
  let m = 0;
  (obj.data || []).forEach(function (p) {
    const v = verite[p.ref || p.nom];
    if (v) m = Math.max(m, Math.hypot(p.x - v.x, p.y - v.y));
  });
  return m;
}
function nbLayers(page) {
  return page.evaluate(function () { let n = 0; window.map.eachLayer(function () { n++; }); return n; });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const ctx = await nav.newContext({ viewport: { width: 1200, height: 850 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("pageerror", function (e) { erreursConsole.push("pageerror : " + e.message); });
  page.on("console", function (m) {
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro\.json|404/i.test(m.text())) {
      erreursConsole.push(m.text());
    }
  });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

    // ── 1. Depuis l'accueil : mode résolutions seul ──
    console.log("— 1. Accueil (aucun plan) —");
    await ouvrirOutil(page);
    const accueil = await page.evaluate(function () {
      return {
        onglets: document.querySelectorAll("#kta-recal-modal [data-recal-methode]").length,
        resolVisible: !document.getElementById("kta-recal-p-resol").hidden,
        apercu: !!document.getElementById("kta-recal-apercu")
      };
    });
    verifier(accueil.onglets === 0 && accueil.resolVisible && !accueil.apercu,
      "accueil : ni onglets noms / clics ni aperçu, panneau résolutions affiché", accueil);
    await fermerOutil(page);

    // ── Plan fictif + jeux fictifs ──
    await page.getByText(PLAN.nom, { exact: false }).first().click();
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.setEditorPoints; }, 20000);
    await page.waitForTimeout(3000);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    });
    if (!PLAN.fictif) inf("⚠️ relevé fictif absent de data/index.json : le checkup tourne sur « " + PLAN.nom + " »");
    const verite = await page.evaluate(function () {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      const niv = window.APP_CONFIG.multiLevel ? (window.APP_CONFIG.activeLevel || 0) : undefined;
      const pts = [];
      let s = 12345;
      const r = function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      for (let i = 0; i < 20; i++) {
        const p = { id: "Repère checkup " + i, nom: "Repère checkup " + i, uid: "pt_chk" + i, x: Math.round(W * (0.1 + 0.8 * r())),
          y: Math.round(H * (0.1 + 0.8 * r())), tags: ["salle"], etat: "Non inspectée", description: "", source: "editor" };
        if (niv !== undefined) p.level = niv;
        pts.push(p);
      }
      window.setEditorPoints(pts);
      const v = {};
      pts.forEach(function (p) { v[p.nom] = { x: p.x, y: p.y }; });
      return v;
    });
    const noms = Object.keys(verite);
    const fichier = { data: [], roads: [], zones: [] };
    // Les 10 premiers ne se retrouvent QUE par leur uid (renommés dans le fichier), les 10 autres par leur nom.
    noms.forEach(function (n, i) {
      const q = versAutreScan(verite[n]);
      fichier.data.push(i < 10 ? { nom: "Ancien scan " + i, uid: "pt_chk" + i, ref: n, x: q.x, y: q.y } : { nom: n, ref: n, x: q.x, y: q.y });
    });
    // Homonymes aberrants : même nom qu'un point du plan, position fausse dans le fichier.
    ["Repère checkup 3", "Repère checkup 9", "Repère checkup 15"].forEach(function (n, i) {
      const p = fichier.data.find(function (d) { return d.ref === n; });
      p.x += 400 + 150 * i; p.y -= 250 + 90 * i;
    });
    const g = function (k) { return versAutreScan(verite[noms[k]]); };
    fichier.roads.push({ type: "principal", points: [g(0), g(1), g(2)] });
    fichier.zones.push({ type: "eau", points: [g(4), g(5), g(6)] });
    const FICH = path.join(TMP, "autre-scan.json");
    fs.writeFileSync(FICH, JSON.stringify(fichier));

    // ── 2. Par les noms ──
    console.log("— 2. Recalage par les noms —");
    await ouvrirOutil(page);
    await page.locator("#kta-recal-files").setInputFiles(FICH);
    await attendre(page, function () { return !document.getElementById("kta-recal-go").disabled; }, 5000).catch(function () {});
    const recap = await page.evaluate(function () {
      return { txt: document.getElementById("kta-recal-recap").textContent,
               go: !document.getElementById("kta-recal-go").disabled,
               methode: (document.querySelector("[data-recal-methode][aria-pressed=true]") || {}).getAttribute
                 ? document.querySelector("[data-recal-methode][aria-pressed=true]").getAttribute("data-recal-methode") : null };
    });
    verifier(recap.methode === "noms", "méthode par défaut avec un plan ouvert : par les noms", recap.methode);
    verifier(/17 repères/.test(recap.txt) && /3 écarté/.test(recap.txt), "17 repères retenus, 3 aberrants écartés", recap.txt);
    verifier(/dont 8 par identifiant commun .* et 9 par le nom/.test(recap.txt), "annonce : 8 repères par uid, 9 par le nom", recap.txt);
    verifier(/médian 0 px/.test(recap.txt) || /median 0 px/.test(recap.txt), "écart médian 0 px annoncé", recap.txt);
    verifier(/1[,.]25|0[,.]8000/.test(recap.txt), "échelle inverse (0,8) annoncée", recap.txt);
    verifier(recap.go, "Télécharger actif");
    await capture(page, "1-noms");

    // ── 3. Aperçu ──
    console.log("— 3. Aperçu sur la carte —");
    const base = await nbLayers(page);
    await page.locator("#kta-recal-apercu").click();
    await page.waitForTimeout(500);
    const pendant = await nbLayers(page);
    const vue = await page.evaluate(function () {
      const m = document.getElementById("kta-recal-modal");
      return { barre: !!document.getElementById("kta-recal-barre"), modaleCachee: m && getComputedStyle(m).display === "none" };
    });
    verifier(vue.barre && vue.modaleCachee, "aperçu : outil masqué, barre d'aperçu affichée", vue);
    verifier(pendant - base === 20 + 2 + 1, "aperçu : 22 objets (20 points, 1 tracé, 1 zone) dans un calque ajouté", { base: base, pendant: pendant });
    await capture(page, "2-apercu");
    await page.locator("#kta-recal-barre-retour").click();
    await page.waitForTimeout(300);
    const dl = await telecharger(page, "#kta-recal-go");
    verifier(/_conv\.json$/.test(dl.nom), "fichier téléchargé « …_conv.json »", dl.nom);
    const bons = {};
    noms.forEach(function (n) { if (!/ (3|9|15)$/.test(n)) bons[n] = verite[n]; });
    const e1 = ecartMax(dl.obj, bons);
    verifier(e1 <= 0.02, "les points recalés retombent sur le plan (écart max ≤ 0,02 px)", e1);
    const r0 = dl.obj.roads[0].points[0], v0 = verite[noms[0]];
    verifier(Math.hypot(r0.x - v0.x, r0.y - v0.y) <= 0.02, "le tracé est recalé lui aussi");
    const apres = await nbLayers(page);
    verifier(!(await page.evaluate(function () { return !!document.getElementById("kta-recal-modal"); })) && apres === base,
      "fermeture : outil fermé et calque d'aperçu retiré", { base: base, apres: apres });

    // ── 4. Repères cliqués ──
    console.log("— 4. Repères cliqués —");
    await ouvrirOutil(page);
    await page.locator("#kta-recal-files").setInputFiles(FICH);
    await page.waitForTimeout(500);
    await page.locator("[data-recal-methode=clics]").click();
    const cibles = ["Repère checkup 10", "Repère checkup 12", "Repère checkup 16", "Repère checkup 18"];
    for (let i = 0; i < cibles.length; i++) {
      const nom = cibles[i];
      await page.locator("#kta-recal-clic-point").selectOption({ label: nom });
      await page.locator("#kta-recal-clic-go").click();
      await page.waitForTimeout(300);
      const ecran = await page.evaluate(function (p) {
        // zoom maximal : un pixel d'écran y vaut au plus un pixel du plan (précision du clic connue)
        window.map.setView(window.convertCoord(p.x, p.y), window.map.getMaxZoom(), { animate: false });
        const c = window.map.latLngToContainerPoint(window.convertCoord(p.x, p.y));
        const r = document.getElementById("map").getBoundingClientRect();
        return { x: r.left + c.x, y: r.top + c.y };
      }, verite[nom]);
      await page.waitForTimeout(300);
      const faux = (i === 2) ? 90 : 0;   // le 3e clic tombe à côté
      await page.mouse.click(ecran.x + faux, ecran.y - faux);
      await page.waitForTimeout(400);
    }
    const etatClics = await page.evaluate(function () {
      return { lignes: document.querySelectorAll(".kta-recal-repere").length,
               suspects: Array.prototype.map.call(document.querySelectorAll(".kta-recal-suspect .kta-recal-repere-nom"),
                 function (e) { return e.textContent; }),
               warn: document.getElementById("kta-recal-warn").textContent,
               visible: getComputedStyle(document.getElementById("kta-recal-modal")).display !== "none" };
    });
    verifier(etatClics.visible && etatClics.lignes === 4, "4 repères cliqués, l'outil revient après chaque clic", etatClics);
    verifier(etatClics.suspects.length === 1 && etatClics.suspects[0] === "Repère checkup 16",
      "le mauvais clic est signalé en rouge, et lui seul", etatClics.suspects);
    await capture(page, "3-clics");
    await page.locator(".kta-recal-suspect button").click();
    await page.waitForTimeout(300);
    const dl2 = await telecharger(page, "#kta-recal-go");
    const sansAberrants = {};
    Object.keys(bons).forEach(function (n) { sansAberrants[n] = bons[n]; });
    const e2 = ecartMax(dl2.obj, sansAberrants);
    verifier(e2 <= 3, "après retrait du mauvais clic : recalage juste à la précision du clic (≤ 3 px)", e2);

    // ── 5. Résolutions ──
    console.log("— 5. Résolutions (dernier recours) —");
    await ouvrirOutil(page);
    await page.locator("#kta-recal-files").setInputFiles(FICH);
    await page.waitForTimeout(400);
    await page.locator("[data-recal-methode=resol]").click();
    const remplir = async function (w1, h1, w2, h2) {
      await page.locator("#kta-recal-src_w").fill(String(w1));
      await page.locator("#kta-recal-src_h").fill(String(h1));
      await page.locator("#kta-recal-dst_w").fill(String(w2));
      await page.locator("#kta-recal-dst_h").fill(String(h2));
      await page.waitForTimeout(200);
      return page.evaluate(function () {
        const w = document.getElementById("kta-recal-warn");
        return { go: !document.getElementById("kta-recal-go").disabled, bloque: !w.hidden && w.classList.contains("kta-recal-bloque"),
                 apercu: !document.getElementById("kta-recal-apercu").disabled };
      });
    };
    const div = await remplir(10000, 8000, 7100, 6160);
    verifier(div.bloque && !div.go && !div.apercu, "proportions divergentes (> 2 %) : refus bloquant, rien à télécharger", div);
    await capture(page, "4-resol-bloque");
    const eg = await remplir(10000, 8000, 8000, 6400);
    verifier(!eg.bloque && eg.go, "mêmes proportions : homothétie autorisée", eg);
    await fermerOutil(page);

    // ── 6. Session polluée : elle porte une copie NON convertie du fichier ──
    // 🩸 Cas réel : une session de l'ancienne version importée sur le nouveau plan. Si calques et session sont lus
    // ensemble, chaque objet du calque est en double côté plan (écarté), et les seuls repères qui restent sont
    // ceux de la copie, identiques au fichier : transformation ≈ identité, données posées non converties.
    console.log("— 6. Session polluée par une copie non convertie du fichier —");
    const calque = await page.evaluate(function () {
      const pts = window.getAllEmbeddedPoints();
      const cle = function (n) { return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ""); };
      const nb = {};
      pts.forEach(function (p) { const k = cle(p.nom); nb[k] = (nb[k] || 0) + 1; });
      return pts.filter(function (p) { return cle(p.nom).length >= 4 && nb[cle(p.nom)] === 1; })
        .map(function (p) { return { nom: p.nom, x: p.x, y: p.y }; });
    });
    const W0 = await page.evaluate(function () { return { W: window.APP_CONFIG.imageWidth, H: window.APP_CONFIG.imageHeight }; });
    inf(calque.length + " points nommés sans ambiguïté dans les calques du relevé fictif");
    const fichier6 = { data: [], roads: [] };
    calque.forEach(function (p) { const q = versAutreScan(p); fichier6.data.push({ nom: p.nom, ref: p.nom, x: q.x, y: q.y }); });
    // Objets ajoutés sur l'ancien scan (absents des calques) : ils ne se retrouvent que dans la copie de session.
    for (let i = 0; i < 8; i++) {
      const q = versAutreScan({ x: W0.W * (0.15 + 0.09 * i), y: W0.H * (0.2 + 0.07 * i) });
      fichier6.data.push({ nom: "Ajout ancien scan " + i, uid: "pt_ajout" + i, x: q.x, y: q.y });
    }
    for (let i = 0; i < 2; i++) {
      fichier6.roads.push({ type: "principal", uid: "rd_ajout" + i, points: [0, 1, 2].map(function (k) {
        return versAutreScan({ x: W0.W * (0.3 + 0.1 * k), y: W0.H * (0.3 + 0.2 * i + 0.05 * k) }); }) });
    }
    await page.evaluate(function (f) {
      const copie = JSON.parse(JSON.stringify(f));
      const niv = window.APP_CONFIG.multiLevel ? (window.APP_CONFIG.activeLevel || 0) : undefined;
      window.setEditorPoints(copie.data.map(function (p) {
        const q = { id: p.nom, nom: p.nom, x: p.x, y: p.y, tags: ["salle"], etat: "Non inspectée", description: "", source: "editor" };
        if (p.uid) q.uid = p.uid;
        if (niv !== undefined) q.level = niv;
        return q;
      }));
      window.setRoads(copie.roads);
    }, fichier6);
    const FICH6 = path.join(TMP, "session-polluee.json");
    fs.writeFileSync(FICH6, JSON.stringify(fichier6));
    await ouvrirOutil(page);
    await page.locator("#kta-recal-files").setInputFiles(FICH6);
    await attendre(page, function () { return !/⏳/.test(document.getElementById("kta-recal-recap").textContent); }, 8000).catch(function () {});
    await page.waitForTimeout(300);
    const r6 = await page.evaluate(function () { return document.getElementById("kta-recal-recap").textContent; });
    verifier(/0[,.]8000/.test(r6) && !/1[,.]0000/.test(r6), "session polluée : échelle 0,8 retrouvée (pas l'identité)", r6);
    verifier(/calques du plan/.test(r6), "annonce : repères pris dans les calques du plan", r6);
    verifier(/médian 0 px/.test(r6), "session polluée : écart médian 0 px", r6);
    await capture(page, "5-session-polluee");
    if (!(await page.evaluate(function () { return document.getElementById("kta-recal-go").disabled; }))) {
      const dl6 = await telecharger(page, "#kta-recal-go");
      const vCalque = {};
      calque.forEach(function (p) { vCalque[p.nom] = p; });
      const e6 = ecartMax(dl6.obj, vCalque);
      verifier(e6 <= 0.02, "session polluée : les points recalés retombent sur ceux du calque (≤ 0,02 px)", e6);
    } else {
      pb("session polluée : Télécharger inactif");
      await fermerOutil(page);
    }

    // ── 7. Fichier déjà dans le repère du plan (copie non convertie dans les calques) : alerte + écarter ──
    console.log("— 7. Repères à la même position : alerte et « écarter » —");
    await page.evaluate(function (v) {
      const niv = window.APP_CONFIG.multiLevel ? (window.APP_CONFIG.activeLevel || 0) : undefined;
      window.setEditorPoints(Object.keys(v).map(function (n) {
        const p = { id: n, nom: n, x: v[n].x, y: v[n].y, tags: ["salle"], etat: "Non inspectée", description: "", source: "editor" };
        if (niv !== undefined) p.level = niv;
        return p;
      }));
      window.setRoads([]);
    }, verite);
    const fichier7 = { data: calque.map(function (p) { return { nom: p.nom, x: p.x, y: p.y }; }) };
    noms.forEach(function (n) { const q = versAutreScan(verite[n]); fichier7.data.push({ nom: n, ref: n, x: q.x, y: q.y }); });
    const FICH7 = path.join(TMP, "deja-dans-le-repere.json");
    fs.writeFileSync(FICH7, JSON.stringify(fichier7));
    await ouvrirOutil(page);
    await page.locator("#kta-recal-files").setInputFiles(FICH7);
    await attendre(page, function () { return !/⏳/.test(document.getElementById("kta-recal-recap").textContent); }, 8000).catch(function () {});
    await page.waitForTimeout(300);
    const a7 = await page.evaluate(function () {
      const b = document.getElementById("kta-recal-ecarter");
      const boite = document.getElementById("kta-recal-identiques");
      return { bouton: !!b && !!boite && !boite.hidden && b.offsetWidth > 0, txt: boite ? boite.textContent : "",
               recap: document.getElementById("kta-recal-recap").textContent };
    });
    verifier(a7.bouton && /même position/.test(a7.txt), "alerte « même position » affichée avec le bouton Écarter", a7);
    await capture(page, "6-alerte-identiques");
    if (a7.bouton) {
      await page.locator("#kta-recal-ecarter").click();
      await attendre(page, function () { return !/⏳/.test(document.getElementById("kta-recal-recap").textContent); }, 8000).catch(function () {});
      await page.waitForTimeout(300);
      const b7 = await page.evaluate(function () {
        const boite = document.getElementById("kta-recal-identiques");
        return { recap: document.getElementById("kta-recal-recap").textContent, alerte: !!boite && !boite.hidden };
      });
      verifier(/0[,.]8000/.test(b7.recap) && /session/.test(b7.recap) && /écarté/.test(b7.recap),
        "écarter : recalcul sans eux, sur la session, échelle 0,8", b7.recap);
      verifier(!b7.alerte, "écarter : l'alerte disparaît", b7);
    }
    await fermerOutil(page);
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  if (erreursConsole.length) erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — recalage par les noms, aperçu, repères cliqués et refus des résolutions.");
  process.exit(0);
})();
