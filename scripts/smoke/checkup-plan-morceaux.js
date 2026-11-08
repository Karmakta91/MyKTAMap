#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-plan-morceaux.js — copie d'un plan rangée EN MORCEAUX dans le registre (PlanRegistry.rangerEnMorceaux)
// =====================================================================
// 🩸 Sous WebKit (iPhone), un Blob composé de Blobs lus dans une autre base, rangé puis séparé de ses sources,
// devient illisible. La copie en morceaux garde ses morceaux tant que la fiche les désigne ; ce checkup le joue
// dans un vrai navigateur, Chromium puis WebKit (KTA_MOTEURS), avec un ZIP fictif de plusieurs morceaux :
//   1. rangement morceau par morceau, relu après rechargement de la page, ZIP ouvert par JSZip ;
//   2. nouvelle génération : l'ancienne copie reste tant que la nouvelle n'est pas complète et relue, puis ses
//      morceaux partent ; une copie refusée par `verifier` ou abandonnée ne laisse rien et ne touche pas l'ancienne ;
//   3. saveBlob(id, Blob composé) = rien à réécrire ; saveBlob d'un seul tenant remplace les morceaux ;
//      removeBlob efface tout ; zipLisible refuse un ZIP tronqué.
// Usage : node scripts/smoke/checkup-plan-morceaux.js (SMOKE_PORT pour une autre copie, KTA_MOTEURS=chromium|webkit)
// Doc : docs/architecture/plans-loader.md (copie en morceaux) · contrat : community-server-line.md §3
// =====================================================================
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { moteurs, lancerPersistant } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS = {
  myktamap_unlock_v1: "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  myktamap_terms_accepted_v1: "2",
  myktamap_tutorial_seen_v1: "1"
};
const echecs = [];
let moteurCourant = "";
function t(msg, ok, detail) {
  console.log((ok ? "  ✅ " : "  ❌ ") + msg + (ok || detail === undefined ? "" : " " + JSON.stringify(detail)));
  if (!ok) echecs.push("[" + moteurCourant + "] " + msg);
}

async function page(ctx) {
  const p = await ctx.newPage();
  await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(p, "window.PlanRegistry && window.PlanRegistry.rangerEnMorceaux && window.JSZip ? 1 : null", 60000);
  return p;
}

// Dans la page : un ZIP fictif (STORE, contenu pseudo-aléatoire) de `mo` Mo, rangé en morceaux de 8 Mio.
async function ranger(p, id, mo, graine, opts) {
  return p.evaluate(async function (a) {
    const PR = window.PlanRegistry;
    const z = new window.JSZip();
    const octets = new Uint8Array(a.mo * 1048576);
    let x = a.graine;
    for (let i = 0; i < octets.length; i += 4) { x = (x * 1103515245 + 12345) >>> 0; octets[i] = x & 255; }
    z.file("plan-config.json", JSON.stringify({ plan: { name: "Checkup morceaux " + a.graine } }));
    z.file("bourrage.bin", octets);
    const zip = new Uint8Array(await z.generateAsync({ type: "uint8array", compression: "STORE" }));
    const M = 8 * 1048576;
    const e = PR.rangerEnMorceaux(a.id);
    for (let d = 0; d < zip.length; d += M) await e.ajouter(zip.subarray(d, Math.min(zip.length, d + M)));
    if (a.abandon) { await e.abandonner(); return { abandon: true, taille: zip.length }; }
    const r = await e.terminer({ type: "application/zip", verifier: a.refus ? async function () { return false; } : PR.zipLisible });
    return { ok: r.ok, code: r.code || null, taille: zip.length, rendu: r.blob ? r.blob.size : null };
  }, Object.assign({ id: id, mo: mo, graine: graine }, opts || {}));
}

// Dans la page : la copie relue, ouverte par JSZip, et les clés rangées pour cet id.
async function etat(p, id) {
  return p.evaluate(async function (id) {
    const PR = window.PlanRegistry;
    const b = await PR.getBlob(id);
    let nom = null, lisible = false, erreur = null;
    if (b) {
      try {
        lisible = await PR.zipLisible(b);
        const z = await window.JSZip.loadAsync(b);
        nom = JSON.parse(await z.file("plan-config.json").async("string")).plan.name;
        await z.file("bourrage.bin").async("uint8array");
      } catch (e) { erreur = (e && (e.name + " " + e.message)) || "?"; }
    }
    const cles = await new Promise(function (ok) {
      const o = indexedDB.open("myktamap_handles");
      o.onsuccess = function () {
        const req = o.result.transaction("blobs", "readonly").objectStore("blobs").getAllKeys();
        req.onsuccess = function () {
          o.result.close();
          ok((req.result || []).filter(function (k) { return k === id || (Array.isArray(k) && k[0] === id); })
            .map(function (k) { return Array.isArray(k) ? k[1] + "#" + k[2] : "fiche"; }));
        };
      };
      o.onerror = function () { ok(null); };
    });
    const gens = {};
    (cles || []).forEach(function (k) { if (k !== "fiche") gens[k.split("#")[0]] = true; });
    return { taille: b ? b.size : null, lisible: lisible, nom: nom, erreur: erreur, nbCles: (cles || []).length,
      generations: Object.keys(gens).length, fiche: (cles || []).indexOf("fiche") >= 0 };
  }, id);
}

// 🩸 Profil PERSISTANT : WebKit refuse un Blob en IndexedDB dans un contexte éphémère (UnknownError), alors que
// Safari, lui, a toujours un profil.
async function jouer(ctx) {
  await ctx.addInitScript(function (ls) { for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) { /* rien */ } } }, LS);
  let p = await page(ctx);
  const ID = "ck_morceaux";

  const r1 = await ranger(p, ID, 20, 7);
  t("rangé en 3 morceaux (ZIP fictif de 20 Mo) : terminer ok, Blob rendu de la bonne taille",
    r1.ok && r1.rendu === r1.taille, r1);
  let e1 = await etat(p, ID);
  t("relu : fiche + 3 morceaux d'une génération, zipLisible, ZIP ouvert", e1.fiche && e1.nbCles === 4 &&
    e1.generations === 1 && e1.lisible && e1.nom === "Checkup morceaux 7" && !e1.erreur, e1);

  await p.close();
  p = await page(ctx);
  e1 = await etat(p, ID);
  t("après rechargement de la page : même copie, lisible jusqu'au dernier octet", e1.taille === r1.taille &&
    e1.lisible && e1.nom === "Checkup morceaux 7" && !e1.erreur, e1);

  const refus = await ranger(p, ID, 9, 8, { refus: true });
  let e2 = await etat(p, ID);
  t("copie refusée par verifier : code illisible, ancienne copie intacte, aucun morceau laissé",
    !refus.ok && refus.code === "illisible" && e2.nom === "Checkup morceaux 7" && e2.nbCles === 4, [refus, e2]);
  await ranger(p, ID, 9, 9, { abandon: true });
  e2 = await etat(p, ID);
  t("copie abandonnée : ancienne copie intacte, aucun morceau laissé", e2.nom === "Checkup morceaux 7" && e2.nbCles === 4, e2);

  const r3 = await ranger(p, ID, 12, 11);
  const e3 = await etat(p, ID);
  t("nouvelle génération : elle seule reste (2 morceaux), anciens morceaux effacés après la bascule",
    r3.ok && e3.nom === "Checkup morceaux 11" && e3.generations === 1 && e3.nbCles === 3 && e3.lisible, e3);

  const noop = await p.evaluate(async function (id) {
    const PR = window.PlanRegistry;
    const b = await PR.getBlob(id);
    return PR.saveBlob(id, b);
  }, ID);
  const e4 = await etat(p, ID);
  t("saveBlob(id, sa copie composée) : rien réécrit, morceaux gardés, lisible", noop.ok && e4.nbCles === 3 &&
    e4.nom === "Checkup morceaux 11" && !e4.erreur, [noop, e4]);

  const copie = await p.evaluate(async function (id) {
    const PR = window.PlanRegistry;
    return PR.saveBlob(id + "_bis", await PR.getBlob(id));
  }, ID);
  const e5 = await etat(p, ID + "_bis");
  t("saveBlob(autre id, copie composée) : recopiée en morceaux, lisible", copie.ok && e5.fiche && e5.nbCles === 3 &&
    e5.nom === "Checkup morceaux 11", [copie, e5]);

  const seul = await p.evaluate(async function (id) {
    const PR = window.PlanRegistry;
    const z = new window.JSZip();
    z.file("plan-config.json", JSON.stringify({ plan: { name: "Checkup seul" } }));
    z.file("bourrage.bin", new Uint8Array(1000));
    return PR.saveBlob(id, await z.generateAsync({ type: "blob" }));
  }, ID);
  const e6 = await etat(p, ID);
  t("saveBlob d'un seul tenant : remplace la copie en morceaux (aucun morceau restant), lu comme avant",
    seul.ok && e6.nbCles === 1 && !e6.generations && e6.nom === "Checkup seul" && e6.lisible, e6);

  const tronque = await p.evaluate(async function (id) {
    const PR = window.PlanRegistry;
    const b = await PR.getBlob(id);
    return { entier: await PR.zipLisible(b), tronque: await PR.zipLisible(b.slice(0, b.size - 30)),
      pasZip: await PR.zipLisible(new Blob([new Uint8Array(100)])) };
  }, ID);
  t("zipLisible : vrai pour le ZIP entier, faux tronqué (fin de répertoire absente) ou sans « PK »",
    tronque.entier && !tronque.tronque && !tronque.pasZip, tronque);

  await p.evaluate(async function (id) {
    await window.PlanRegistry.removeBlob(id);
    await window.PlanRegistry.removeBlob(id + "_bis");
  }, ID);
  const e7 = await etat(p, ID), e8 = await etat(p, ID + "_bis");
  t("removeBlob : copie et morceaux effacés", e7.nbCles === 0 && e7.taille === null && e8.nbCles === 0, [e7, e8]);
}

(async function () {
  try {
    for (const nom of moteurs()) {
      moteurCourant = nom;
      const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "kta-morceaux-"));
      const ctx = await lancerPersistant(nom, dossier);
      if (ctx) {
        console.log("▶ " + nom);
        try { await jouer(ctx); } finally { await ctx.close(); }
      }
      try { fs.rmSync(dossier, { recursive: true, force: true }); } catch (e) { /* verrou Windows : dossier temporaire */ }
    }
  } catch (e) {
    echecs.push("exception : " + (e && e.stack || e));
    console.log("❌ exception", e);
  } finally {
    server.close();
  }
  console.log(echecs.length ? "\n⚠️ " + echecs.length + " échec(s) :\n- " + echecs.join("\n- ") : "\n🎉 copie en morceaux : OK");
  process.exit(echecs.length ? 1 : 0);
})();
