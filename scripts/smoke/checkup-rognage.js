#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-rognage.js — checkup (Playwright, pas un hook pré-commit) : calques et rognage automatique du Générateur
// =====================================================================
// Image FABRIQUÉE 1200 × 900 : marges blanches de 100 px, contenu gris, repère rouge 20 × 20 en (400, 300) de la
// source. Un calque pose un point au centre du repère ; le pixel sous ce point est lu dans les tuiles V2 du ZIP
// produit (z0, la même image que celle que l'app affiche) : rouge = calque aligné.
// 1. Nouveau plan V2, calque saisi sur l'image d'origine : la question du rognage est posée, « Les décaler » →
//    aligné ; plan.rognage écrit. Même plan, calque saisi dans le repère rogné, « Les laisser » → aligné, intact.
// 2. « Mettre à jour le plan » (ktaGenerateurMaj) sur le plan rogné, calque dans le repère rogné : même rognage,
//    aligné, pas de question.
// 3. Plan V1 (jamais rogné) régénéré en V2 par le mode Modifier : image entière gardée, calque aligné, sans rognage.
// 🩸 Avant le correctif : cas 1 (pas de question, calque décalé du rognage) et cas 3 (rognage appliqué au
// régénéré) sortaient décalés.
// Usage : node scripts/smoke/checkup-rognage.js (SMOKE_PORT, KTA_MOTEURS) · doc : plans-loader.md, TILING.md
// =====================================================================
"use strict";

const fs = require("fs");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const REPERE = { x: 400, y: 300, c: 20 };

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) {
  if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : ""));
}
const rouge = function (p) { return Array.isArray(p) && p[0] > 200 && p[1] < 70 && p[2] < 70; };

// Calque au centre du repère, décalé de (dx, dy) : point, tracé, zone, structure, point précis.
function calque(dx, dy) {
  const x = REPERE.x - dx, y = REPERE.y - dy, c = REPERE.c;
  const carre = [{ x: x, y: y }, { x: x + c, y: y }, { x: x + c, y: y + c }, { x: x, y: y + c }];
  return { type: "points", version: 1,
    data: [{ id: "repere", nom: "Repère", x: x + c / 2, y: y + c / 2, tags: ["default"], precis: { x: x + 5, y: y + 5 } }],
    roads: [{ type: "principal", points: [{ x: x + c / 2, y: y + c / 2 }, { x: x + 200, y: y + c / 2 }] }],
    zones: [{ type: "eau", points: carre }],
    structures: [{ type: "pilier-1", points: carre }] };
}

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return typeof window.afficherPlanner === "function"; }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

// Générateur neuf, mode Avancé : image source + un calque de données, tuilage V2 ou non.
async function nouveauPlan(page, png, nom, contenuCalque, v2) {
  await page.evaluate(function () {
    const m = document.getElementById("kta-planner-modal"); if (m) m.remove();
    window.afficherPlanner();
  });
  await attendre(page, function () { return !!document.getElementById("pl_baseImage"); }, 15000);
  await page.evaluate(function (n) {
    const b = document.querySelector(".kta-planner-mode-btn[data-mode='avance'], [data-planner-mode='avance']");
    if (b) b.click();
    const e = document.getElementById("pl_name"); e.value = n; e.dispatchEvent(new Event("input", { bubbles: true }));
  }, nom);
  await page.setInputFiles("#pl_baseImage", { name: "source.png", mimeType: "image/png", buffer: png });
  await page.waitForTimeout(1500);
  const lid = await page.evaluate(function () {
    document.getElementById("pl_addDataLayer").click();
    const it = document.querySelector("#pl_dataLayers_list .kta-planner-layer-item:last-child");
    document.getElementById(it.dataset.layerId + "_id").value = "calque-essai";
    return it.dataset.layerId;
  });
  await page.setInputFiles("#" + lid + "_file", { name: "calque-essai.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(contenuCalque)) });
  await page.evaluate(function (v) {
    const c = document.getElementById("pl_tilingV2"); if (c && c.checked !== v) c.click();
  }, v2);
}

// Lance la génération ; `reponse` : true / false = la réponse à donner si la question du rognage vient. Rend
// { zip (nom dans window.__zips), question (texte vu ou null) }. Une génération finie sans question n'est pas une
// exception : l'appelant le constate (l'ancien code ne posait jamais la question).
async function generer(page, nom, reponse) {
  let fini = false;
  const dl = page.waitForEvent("download", { timeout: 180000 }).then(function (d) { fini = true; return d; });
  await page.evaluate(function () { document.getElementById("kta-planner-generer").click(); });
  let question = null;
  while (!fini && question === null) {
    const vue = await page.evaluate(function () { return !!document.getElementById("kta-confirm-oui"); });
    if (vue) {
      await page.waitForTimeout(600);   // garde anti-double-clic de ktaConfirm
      question = await page.evaluate(function (oui) {
        const o = document.getElementById("kta-confirm-oui");
        const t = o.closest(".kta-readme-modal-overlay").textContent;
        (oui ? o : document.getElementById("kta-confirm-non")).click();
        return t;
      }, reponse !== false);
    } else await page.waitForTimeout(250);
  }
  const fichier = await (await dl).path();
  await page.evaluate(function (a) {
    window.__zips = window.__zips || {};
    window.__zips[a.nom] = new Blob([Uint8Array.from(atob(a.b64), function (c) { return c.charCodeAt(0); })]);
  }, { nom: nom, b64: fs.readFileSync(fichier).toString("base64") });
  return { zip: nom, question: question };
}

// « Mettre à jour le plan » sur un ZIP de window.__zips ; le ZIP produit est rangé sous `nomSortie`.
async function mettreAJour(page, nomZip, calques, nomSortie) {
  await page.evaluate(function () { const m = document.getElementById("kta-planner-modal"); if (m) m.remove(); });
  await page.evaluate(async function (a) {
    window.__zipMaj = null;
    await window.ktaGenerateurMaj({ zip: new File([window.__zips[a.zip]], a.zip + ".zip", { type: "application/zip" }),
      calques: a.calques, onZip: function (b) { window.__zipMaj = b; } });
  }, { zip: nomZip, calques: calques });
  await page.waitForTimeout(2500);
  let questions = 0;
  await page.evaluate(function () {
    const c = document.getElementById("pl_tilingV2"); if (c && !c.checked) c.click();
    document.getElementById("kta-planner-generer").click();
  });
  // Confirmation de la mise à jour (toujours) ; une seconde fenêtre serait la question du rognage (interdite ici).
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const etat = await page.evaluate(function () {
      if (window.__zipMaj) return "fini";
      const o = document.getElementById("kta-confirm-oui");
      if (!o) return "attente";
      const rog = /rogn|crop|recort/i.test(o.closest(".kta-readme-modal-overlay").textContent);
      return rog ? "rognage" : "confirm";
    });
    if (etat === "fini") break;
    if (etat === "confirm" || etat === "rognage") {
      if (etat === "rognage") questions++;
      await page.waitForTimeout(600);
      await page.evaluate(function () { const o = document.getElementById("kta-confirm-oui"); if (o) o.click(); });
    }
    await page.waitForTimeout(300);
  }
  await page.evaluate(function (n) { window.__zips[n] = window.__zipMaj; }, nomSortie);
  return { questions: questions };
}

// plan-config, calque relu et pixel des tuiles z0 sous le point du calque.
async function relire(page, nomZip, idCalque) {
  return page.evaluate(async function (a) {
    const z = await JSZip.loadAsync(window.__zips[a.zip]);
    const cfg = JSON.parse(await z.file("plan-config.json").async("string"));
    const dl = cfg.dataLayers.find(function (d) { return d.id === a.id; });
    const j = JSON.parse(await z.file(dl.file).async("string"));
    const p = j.data[0];
    let pixel = "pas de tuilage V2";
    if (cfg.tiling) {
      const T = cfg.tiling.tileSize, H = cfg.plan.imageHeight, ext = window.ktaTileExt(cfg.tiling);
      const col = Math.floor(p.x / T), k = Math.floor((H - p.y) / T) + 1;
      const f = z.file("data/tiles/z0/x" + col + "_y" + (-k) + "." + ext);
      if (!f) pixel = "tuile absente";
      else {
        const bmp = await createImageBitmap(await f.async("blob"));
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0);
        const yT = p.y - (H - k * T) - (T - bmp.height);
        const d = ctx.getImageData(Math.floor(p.x - col * T), Math.floor(yT), 1, 1).data;
        pixel = [d[0], d[1], d[2]];
      }
    }
    return { W: cfg.plan.imageWidth, H: cfg.plan.imageHeight, v2: !!cfg.plan.tiledV2, rognage: cfg.plan.rognage || null,
      point: { x: p.x, y: p.y }, precis: p.precis, route: j.roads[0].points[0], zone: j.zones[0].points[0],
      structure: j.structures[0].points[0], pixel: pixel };
  }, { zip: nomZip, id: idCalque });
}

async function jouer(nomMoteur) {
  const nav = await lancerNavigateur.lancerMoteur(nomMoteur);
  if (!nav) return;
  console.log("\n══ " + nomMoteur + " ══");
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  try {
    const page = await ctx.newPage();
    await page.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    const erreurs = [];
    page.on("pageerror", function (e) { erreurs.push(String(e)); });
    await accueil(page);
    const png = Buffer.from(await page.evaluate(function (R) {
      const c = document.createElement("canvas"); c.width = 1200; c.height = 900;
      const k = c.getContext("2d");
      k.fillStyle = "#ffffff"; k.fillRect(0, 0, 1200, 900);
      k.fillStyle = "#c8c8c8"; k.fillRect(100, 100, 1000, 700);
      k.fillStyle = "#ff0000"; k.fillRect(R.x, R.y, R.c, R.c);
      return c.toDataURL("image/png").split(",")[1];
    }, REPERE), "base64");

    console.log("— 1. nouveau plan rogné, calque saisi sur l'image d'origine, « Les décaler » —");
    await nouveauPlan(page, png, "Essai rognage", calque(0, 0), true);
    const g1 = await generer(page, "decale", true);
    const r1 = await relire(page, "decale", "calque-essai");
    verifier(!!g1.question && /rogn|crop|recort/i.test(g1.question), "la question du rognage est posée", g1.question);
    verifier(r1.v2 && r1.W < 1200 && r1.H < 900 && r1.rognage && r1.rognage.x > 0 && r1.rognage.y > 0,
      "plan rogné " + r1.W + " × " + r1.H + ", plan.rognage écrit " + JSON.stringify(r1.rognage), r1);
    const ox = r1.rognage ? r1.rognage.x : 0, oy = r1.rognage ? r1.rognage.y : 0;
    verifier(!!g1.question && g1.question.indexOf(String(ox)) >= 0 && g1.question.indexOf(String(oy)) >= 0,
      "la question dit le décalage (" + ox + " × " + oy + " px)", g1.question);
    verifier(rouge(r1.pixel), "« Les décaler » : le point du calque tombe sur le repère (pixel " + JSON.stringify(r1.pixel) +
      ")", r1);
    const c = REPERE.c / 2;
    verifier(r1.route.x === REPERE.x + c - ox && r1.zone.y === REPERE.y - oy && r1.structure.x === REPERE.x - ox &&
      r1.precis.x === REPERE.x + 5 - ox, "tracé, zone, structure et point précis décalés aussi", r1);

    console.log("— 1 bis. même plan, calque saisi dans le repère rogné, « Les laisser » —");
    await nouveauPlan(page, png, "Essai rognage", calque(ox, oy), true);
    const g1b = await generer(page, "laisse", false);
    const r1b = await relire(page, "laisse", "calque-essai");
    verifier(!!g1b.question, "la question est posée", g1b.question);
    verifier(r1b.point.x === REPERE.x + c - ox && r1b.point.y === REPERE.y + c - oy,
      "« Les laisser » : calque intact", r1b.point);
    verifier(rouge(r1b.pixel), "et aligné sur le repère (pixel " + JSON.stringify(r1b.pixel) + ")", r1b);

    console.log("— 2. « Mettre à jour le plan » rogné, calque dans le repère rogné —");
    const pay = calque(ox, oy);
    const m2 = await mettreAJour(page, "decale", [{ id: "calque-maj", label: "Mise à jour",
      payload: { data: pay.data, structures: pay.structures, roads: pay.roads, zones: pay.zones } }], "maj");
    const r2 = await relire(page, "maj", "calque-maj");
    verifier(m2.questions === 0, "pas de question du rognage en mise à jour", m2);
    verifier(r2.W === r1.W && r2.H === r1.H && r2.rognage && r2.rognage.x === ox && r2.rognage.y === oy,
      "même repère : " + r2.W + " × " + r2.H + ", rognage " + JSON.stringify(r2.rognage), r2);
    verifier(rouge(r2.pixel), "calque de la mise à jour aligné (pixel " + JSON.stringify(r2.pixel) + ")", r2);
    const r2b = await relire(page, "maj", "calque-essai");
    verifier(rouge(r2b.pixel), "calque déjà dans le plan toujours aligné (pixel " + JSON.stringify(r2b.pixel) + ")", r2b);

    console.log("— 3. plan V1 (jamais rogné) régénéré en V2 par le mode Modifier —");
    await nouveauPlan(page, png, "Essai V1", calque(0, 0), false);
    const g3 = await generer(page, "v1", null);
    verifier(g3.question === null, "plan V1 sans rognage : pas de question", g3.question);
    const r3a = await relire(page, "v1", "calque-essai");
    verifier(!r3a.v2 && r3a.W === 1200 && r3a.H === 900 && !r3a.rognage, "plan V1 : image entière, pas de rognage", r3a);
    const m3 = await mettreAJour(page, "v1", [], "v1v2");
    const r3 = await relire(page, "v1v2", "calque-essai");
    verifier(m3.questions === 0, "pas de question du rognage", m3);
    verifier(r3.v2 && r3.W === 1200 && r3.H === 900 && !r3.rognage,
      "régénéré en V2 dans le même repère : " + r3.W + " × " + r3.H + ", sans rognage", r3);
    verifier(rouge(r3.pixel), "calque aligné (pixel " + JSON.stringify(r3.pixel) + ")", r3);

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } finally {
    await ctx.close();
    await nav.close();
  }
}

(async function main() {
  try {
    for (const m of lancerNavigateur.moteurs()) await jouer(m);
  } catch (e) {
    pb("exception : " + (e && e.stack || e));
  } finally {
    server.close();
  }
  if (problemes.length) {
    console.log("\n❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("\n🎉 CHECKUP VERT — rognage du Générateur : question en nouveau plan (décaler / laisser), repère gardé " +
    "en mise à jour et en régénération V1 → V2, pixel lu dans les tuiles du ZIP.");
})();
