#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-import-garder-deux.js — checkup (Playwright, pas un hook pré-commit) : photos d'un ZIP importé deux fois
// =====================================================================
// Parcours réel sur le relevé fictif de l'index, rendu LOCAL : son ZIP est construit dans la page avec une photo
// embarquée (data/photos/_index.json, comme « Inclure les photos » du Générateur), puis importé (plan A).
// Réimporté depuis l'accueil, « Garder les deux » : la copie (plan B) doit recevoir la photo, sous un identifiant
// neuf, rattachée au même point ; A garde la sienne. Rouvrir B ou « Mettre à jour » ne duplique rien ; un ZIP de B
// qui embarque une autre photo retire sa copie (origine « plan »), jamais la photo de A.
// 🩸 Les photos sont rangées par identifiant tous plans confondus : une photo « déjà là » appartenant à un autre plan
// ne prouve pas que CE plan l'a (main.js > startImportedPlan).
// Usage : node scripts/smoke/checkup-import-garder-deux.js (SMOKE_PORT pour une autre copie) · doc : session-data.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
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
const PHOTO_ID = "ph_checkup_garder_deux";
const AUTRE_PHOTO_ID = "ph_checkup_autre";
const POINT_UID = "pt_checkup_garder_deux";

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

// Lance l'import du ZIP du relevé fictif, avec la photo `photoId`, SANS l'attendre : la question « même nom » peut
// bloquer la promesse. meta.planId posé = entrée visée, pas de question.
// 🩸 Un ZIP sans data/photos/_index.json ne touche à aucune photo (section sautée) : pour voir le tri, le ZIP
// « sans la photo » en embarque une autre.
async function lancerImport(page, photoId, planId) {
  const r = await page.evaluate(async function (a) {
    const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
    if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
    const cfgTxt = await (await fetch(srv.path + "/plan-config.json")).text();
    const cfg = JSON.parse(cfgTxt);
    const zip = new JSZip();
    zip.file("plan-config.json", cfgTxt);
    const chemins = [cfg.plan.baseImage]
      .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
      .concat(Object.keys(cfg.icons || {}).map(function (k) { return cfg.icons[k]; }))
      .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
    for (const p of Array.from(new Set(chemins))) {
      const rep = await fetch(window.resolveServerPath(p, srv.path));
      if (rep.ok) zip.file(p, await rep.blob());
    }
    const c = document.createElement("canvas");
    c.width = 64; c.height = 48;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#3a7"; ctx.fillRect(0, 0, 64, 48);
    const jpg = await new Promise(function (res) { c.toBlob(res, "image/jpeg", 0.9); });
    const idx = { photos: {} };
    idx.photos[a.photoId] = { pointId: a.pointUid, mime: "image/jpeg", size: jpg.size, file: a.photoId + ".jpg" };
    zip.file("data/photos/_index.json", JSON.stringify(idx));
    zip.file("data/photos/" + a.photoId + ".jpg", jpg);
    const blob = await zip.generateAsync({ type: "blob" });
    const meta = { storeBlob: true };
    if (a.planId) meta.planId = a.planId;
    window.__ktaImport = window.chargerZipFichier(new File([blob], "fictif.zip", { type: "application/zip" }), "auto", meta)
      .then(function () { return "fini"; }, function (e) { return "erreur : " + (e && e.message); });
    return { ok: true };
  }, { planId: planId || null, photoId: photoId, pointUid: POINT_UID });
  if (!r.ok) throw new Error(r.raison);
}

async function repondreDoublon(page, bouton) {
  await attendre(page, function () { return !!document.getElementById("kta-dup-both"); }, 30000);
  await page.waitForTimeout(400);
  await page.evaluate(function (id) { document.getElementById(id).click(); }, bouton);
}

// Page neuve à chaque import : le plan ouvert est forcément celui de l'import ; `different` vérifie en plus l'id.
async function planOuvert(page, different) {
  await page.evaluate(function (d) { window.__ktaPlanAvant = d; }, different || null);
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window._currentLoadedPlanId
      && window._currentLoadedPlanId !== window.__ktaPlanAvant;
  }, 30000);
  await page.waitForTimeout(1500);
  return page.evaluate(function () { return window._currentLoadedPlanId; });
}

function photosDe(page, planId) {
  return page.evaluate(async function (id) {
    const arr = await window.MyKTAMapPhotos.getAllPhotosForPlan(id);
    return arr.map(function (r) { return { id: r.id, pointId: r.pointId, taille: r.blob ? r.blob.size : 0, meta: r.meta || null }; });
  }, planId);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const erreurs = [];
  try {
    const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
    await page.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });

    console.log("— 1. Premier import (plan A) —");
    await accueil(page);
    await lancerImport(page, PHOTO_ID);
    const A = await planOuvert(page);
    const pA = await photosDe(page, A);
    verifier(pA.length === 1 && pA[0].id === PHOTO_ID && pA[0].pointId === POINT_UID,
      "plan A : la photo du ZIP est restaurée sous son identifiant, rattachée au point", pA);

    console.log("— 2. Réimport, « Garder les deux » (plan B) —");
    await accueil(page);
    await lancerImport(page, PHOTO_ID);
    await repondreDoublon(page, "kta-dup-both");
    const B = await planOuvert(page, A);
    verifier(B && B !== A, "plan B : nouvelle entrée du registre", { A: A, B: B });
    const pB = await photosDe(page, B);
    verifier(pB.length === 1 && pB[0].id !== PHOTO_ID && pB[0].pointId === POINT_UID && pB[0].taille > 0,
      "plan B : la copie reçoit la photo (identifiant neuf, même point, image présente)", pB);
    const pA2 = await photosDe(page, A);
    verifier(pA2.length === 1 && pA2[0].id === PHOTO_ID, "plan A : sa photo n'a pas bougé", pA2);

    console.log("— 3. Rouvrir B depuis le même ZIP —");
    await accueil(page);
    await lancerImport(page, PHOTO_ID, B);
    await planOuvert(page);
    const pB3 = await photosDe(page, B);
    verifier(pB3.length === 1 && pB.length === 1 && pB3[0].id === pB[0].id, "plan B rouvert : toujours une seule photo", pB3);

    console.log("— 4. Réimport, « Mettre à jour » —");
    await accueil(page);
    await lancerImport(page, PHOTO_ID);
    await repondreDoublon(page, "kta-dup-update");
    const cible = await planOuvert(page);
    const pA4 = await photosDe(page, A), pB4 = await photosDe(page, B);
    verifier((cible === A || cible === B) && pA4.length === 1 && pB4.length === 1,
      "mise à jour : aucun doublon, ni dans A ni dans B", { cible: cible, A: pA4.length, B: pB4.length });

    console.log("— 5. B réimporté avec une autre photo —");
    await accueil(page);
    await lancerImport(page, AUTRE_PHOTO_ID, B);
    await planOuvert(page);
    const pB5 = await photosDe(page, B), pA5 = await photosDe(page, A);
    verifier(pB5.length === 1 && pB5[0].id === AUTRE_PHOTO_ID,
      "plan B : la copie disparue du ZIP est retirée (origine « plan »), la nouvelle photo restaurée", pB5);
    verifier(pA5.length === 1 && pA5[0].id === PHOTO_ID, "plan A : sa photo reste", pA5);

    const fin = await page.evaluate(function () { return window.__ktaImport; });
    verifier(fin === "fini", "dernier import terminé sans erreur", fin);
    verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs.slice(0, 3));
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — photos d'un ZIP importé deux fois : la copie reçoit les siennes, sans doublon");
})();
