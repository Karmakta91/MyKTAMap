#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-detection-generateur.js — checkup (Playwright, pas un hook pré-commit) : « Détecter piliers et fronts »
// dans le Générateur (js/detectionGenerateur.js, createConf.js > _detecterStructuresGenerateur)
// =====================================================================
// Image FABRIQUÉE 1400 × 1000 : marges blanches (le tuilage V2 la rogne), fond gris, 9 piliers orange de 40 px.
// 1. Nouveau plan, multi-niveau coché : bouton « Détecter » → fenêtre à mini-carte ; pipette sur un pilier,
//    « Tout le plan », aperçu de 9, Valider → ligne « Structures détectées » ; génération sans question du
//    rognage ; ZIP relu : 9 structures au pixel près DANS LE REPÈRE ROGNÉ, uid, updatedAt, niveau 0, pixel des
//    tuiles orange au centre de chacune.
// 2. Mode Modifier sur ce ZIP (« Mettre à jour le plan ») : relance → 0 nouveau, 9 déjà présents (doublons
//    comparés dans le repère du plan gardé).
// 3. Échap ferme la fenêtre, le Générateur reste ouvert.
// 🩸 Sans la conversion du rognage, les structures sortent décalées de la marge ; sans les doublons, la relance
// en remet 9.
// Usage : node scripts/smoke/checkup-detection-generateur.js (SMOKE_PORT, KTA_MOTEURS) · doc : plans-loader.md
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
const IMG = { W: 1400, H: 1000, marge: 120, cote: 40 };
// 9 piliers (coin haut-gauche, px de l'image SOURCE)
const PILIERS = [];
for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) PILIERS.push([300 + i * 250, 250 + j * 200]);

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) {
  if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : ""));
}

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return typeof window.afficherPlanner === "function"; }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

// Toucher un point de l'image SOURCE sur la mini-carte (l'image d'aperçu couvre exactement l'image source).
async function toucherImage(page, x, y) {
  const pt = await page.evaluate(function (a) {
    const im = document.querySelector(".kta-detect-gen .leaflet-image-layer");
    const r = im.getBoundingClientRect();
    return { x: r.left + a.x * r.width / a.W, y: r.top + a.y * r.height / a.H };
  }, { x: x, y: y, W: IMG.W, H: IMG.H });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(300);
}
function etat(page) { return page.evaluate(function () { return window.KtaDetectionUI.etat(); }); }
async function bouton(page, act) {
  await page.click('#kta-detect-bandeau [data-detect="' + act + '"]');
  await page.waitForTimeout(200);
}
// Ouvre la fenêtre de détection depuis le Générateur et attend la mini-carte.
async function ouvrirDetection(page) {
  await page.evaluate(function () { document.getElementById("pl_detectStructures").click(); });
  await attendre(page, function () {
    return !!document.querySelector(".kta-detect-gen .leaflet-image-layer") && !!window.KtaDetectionUI.etat();
  }, 30000);
  await page.waitForTimeout(500);
}
// Pipette sur un pilier (si aucune couleur retenue), « Tout le plan », aperçu.
async function detecterTout(page) {
  const e0 = await etat(page);
  if (!e0.exemples.a) {
    const p = PILIERS[4];
    await toucherImage(page, p[0] + IMG.cote / 2, p[1] + IMG.cote / 2);
  }
  await bouton(page, "zone");
  await bouton(page, "tout");
  await attendre(page, function () { const s = window.KtaDetectionUI.etat(); return s && s.etape === "apercu"; }, 60000);
  return etat(page);
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
      try { localStorage.removeItem("myktamap_detect_couleurs_v1_generateur"); } catch (e) {}
    }, LS_PREGATES);
    const erreurs = [];
    page.on("pageerror", function (e) { erreurs.push(String(e)); });
    await accueil(page);
    const png = Buffer.from(await page.evaluate(function (a) {
      const c = document.createElement("canvas"); c.width = a.I.W; c.height = a.I.H;
      const k = c.getContext("2d");
      k.fillStyle = "#ffffff"; k.fillRect(0, 0, a.I.W, a.I.H);
      k.fillStyle = "#b4b4b4"; k.fillRect(a.I.marge, a.I.marge, a.I.W - 2 * a.I.marge, a.I.H - 2 * a.I.marge);
      k.fillStyle = "#ff9933";
      a.P.forEach(function (p) { k.fillRect(p[0], p[1], a.I.cote, a.I.cote); });
      return c.toDataURL("image/png").split(",")[1];
    }, { I: IMG, P: PILIERS }), "base64");

    console.log("— 1. nouveau plan : détecter sur l'image source —");
    await page.evaluate(function () { window.afficherPlanner(); });
    await attendre(page, function () { return !!document.getElementById("pl_baseImage"); }, 15000);
    await page.evaluate(function () {
      const b = document.querySelector(".kta-planner-mode-btn[data-mode='avance'], [data-planner-mode='avance']");
      if (b) b.click();
      const e = document.getElementById("pl_name"); e.value = "Essai détection";
      e.dispatchEvent(new Event("input", { bubbles: true }));
      const m = document.getElementById("pl_multiLevel"); if (m && !m.checked) m.click();
      const v = document.getElementById("pl_tilingV2"); if (v && !v.checked) v.click();
    });
    await page.setInputFiles("#pl_baseImage", { name: "source.png", mimeType: "image/png", buffer: png });
    await page.waitForTimeout(1500);
    await ouvrirDetection(page);
    let e = await etat(page);
    verifier(e && e.etape === "exemples" && e.pipette === "a", "fenêtre ouverte, pipette armée (aucune couleur retenue)", e);
    e = await detecterTout(page);
    verifier(e.exemples.a === 1, "pipette sur un pilier de la mini-carte : un exemple (lu en pleine résolution)", e.exemples);
    verifier(e.apercu && e.apercu.n === 9 && e.apercu.deja === 0, "« Tout le plan » : 9 piliers dans l'aperçu", e.apercu);
    await bouton(page, "valider");
    await attendre(page, function () {
      const st = document.getElementById("pl_detect_status");
      return st && st.style.display !== "none" && !document.querySelector(".kta-detect-gen");
    }, 10000);
    const ligne = await page.evaluate(function () {
      const items = Array.prototype.slice.call(document.querySelectorAll("#pl_dataLayers_list .kta-planner-layer-item"));
      return items.map(function (it) { return document.getElementById(it.dataset.layerId + "_id").value; });
    });
    verifier(ligne.indexOf("structures-detectees") >= 0, "ligne « Structures détectées » ajoutée aux calques", ligne);

    // génération (pas de calque fourni ni de calage : pas de question du rognage)
    const dl = page.waitForEvent("download", { timeout: 180000 });
    await page.evaluate(function () { document.getElementById("kta-planner-generer").click(); });
    let question = null;
    for (let i = 0; i < 40 && !question; i++) {
      question = await page.evaluate(function () {
        const o = document.getElementById("kta-confirm-oui");
        return o ? o.closest(".kta-readme-modal-overlay").textContent : null;
      });
      if (!question) await page.waitForTimeout(250);
    }
    if (question) await page.evaluate(function () { document.getElementById("kta-confirm-non").click(); });
    const fichier = await (await dl).path();
    verifier(!question, "pas de question du rognage (structures détectées : repère géré seul)", question);
    await page.evaluate(function (b64) {
      window.__zipDet = new Blob([Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); })]);
    }, fs.readFileSync(fichier).toString("base64"));
    const lu = await page.evaluate(async function () {
      const z = await JSZip.loadAsync(window.__zipDet);
      const cfg = JSON.parse(await z.file("plan-config.json").async("string"));
      const dl = cfg.dataLayers.find(function (d) { return d.id === "structures-detectees"; });
      const j = dl ? JSON.parse(await z.file(dl.file).async("string")) : { structures: [] };
      const T = cfg.tiling.tileSize, H = cfg.plan.imageHeight, ext = window.ktaTileExt(cfg.tiling);
      const pixel = async function (x, y) {
        const col = Math.floor(x / T), k = Math.floor((H - y) / T) + 1;
        const f = z.file("data/tiles/z0/x" + col + "_y" + (-k) + "." + ext);
        if (!f) return null;
        const bmp = await createImageBitmap(await f.async("blob"));
        const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
        const g = c.getContext("2d"); g.drawImage(bmp, 0, 0);
        const d = g.getImageData(Math.floor(x - col * T), Math.floor(y - (H - k * T) - (T - bmp.height)), 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      const sts = [];
      for (const s of j.structures) {
        const xs = s.points.map(function (p) { return p.x; }), ys = s.points.map(function (p) { return p.y; });
        const b = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
        sts.push({ type: s.type, level: s.level, uid: s.uid, maj: s.updatedAt, b: b,
          px: await pixel((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) });
      }
      return { W: cfg.plan.imageWidth, H: cfg.plan.imageHeight, rognage: cfg.plan.rognage || null, sts: sts };
    });
    const rx = lu.rognage ? lu.rognage.x : 0, ry = lu.rognage ? lu.rognage.y : 0;
    verifier(lu.rognage && rx > 0 && ry > 0, "plan rogné (" + lu.W + " × " + lu.H + ", rognage " + rx + ", " + ry + ")",
      lu.rognage);
    verifier(lu.sts.length === 9, "ZIP : 9 structures dans le calque", lu.sts.length);
    const auPixel = PILIERS.every(function (p) {
      return lu.sts.some(function (s) {
        return Math.abs(s.b[0] - (p[0] - rx)) <= 1.5 && Math.abs(s.b[1] - (p[1] - ry)) <= 1.5 &&
          Math.abs(s.b[2] - (p[0] + IMG.cote - rx)) <= 1.5 && Math.abs(s.b[3] - (p[1] + IMG.cote - ry)) <= 1.5;
      });
    });
    verifier(auPixel, "chaque pilier au pixel près dans le REPÈRE ROGNÉ (source − rognage)", lu.sts.slice(0, 2));
    verifier(lu.sts.every(function (s) {
      return s.type === "pilier-1" && s.level === 0 && /^st_/.test(s.uid || "") && Number.isFinite(s.maj);
    }), "type pilier-1, niveau 0 (multi-niveau), uid et updatedAt", lu.sts.slice(0, 2));
    verifier(lu.sts.every(function (s) { return s.px && s.px[0] > 200 && s.px[1] > 110 && s.px[1] < 190 && s.px[2] < 110; }),
      "tuiles du ZIP : orange sous le centre de chaque structure", lu.sts.map(function (s) { return s.px; }).slice(0, 3));

    console.log("— 2. mode Modifier : relance sur le plan généré —");
    await page.evaluate(function () { const m = document.getElementById("kta-planner-modal"); if (m) m.remove(); });
    await page.evaluate(async function () {
      await window.ktaGenerateurMaj({ zip: new File([window.__zipDet], "essai-detection.zip", { type: "application/zip" }),
        calques: [], onZip: function () {} });
    });
    await page.waitForTimeout(2000);
    // avertissement du tuilage V2 (plan V2 rouvert) : fermé comme le ferait l'utilisateur avant de toucher le bouton
    await page.evaluate(function () { const o = document.getElementById("kta-v2-warn-ok"); if (o) o.click(); });
    await page.waitForTimeout(300);
    await ouvrirDetection(page);
    e = await detecterTout(page);
    verifier(e.exemples.a === 1, "couleurs retenues pour le Générateur : pas de nouvelle pipette", e.exemples);
    verifier(e.apercu && e.apercu.n === 0 && e.apercu.deja === 9,
      "relance en mode Modifier : 0 nouveau, 9 déjà présents (comparés dans le repère gardé)", e.apercu);

    console.log("— 3. Échap —");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const apres = await page.evaluate(function () {
      return { fenetre: !!document.querySelector(".kta-detect-gen"), parcours: !!window.KtaDetectionUI.etat(),
               generateur: !!document.getElementById("kta-planner-modal") };
    });
    verifier(!apres.fenetre && !apres.parcours && apres.generateur, "Échap ferme la fenêtre de détection, le " +
      "Générateur reste ouvert", apres);

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
  console.log("\n🎉 CHECKUP VERT — détecter dans le Générateur : fenêtre à mini-carte, calque « Structures détectées », " +
    "repère rogné au pixel près, doublons en mode Modifier, Échap.");
})();
