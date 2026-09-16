#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 📦 checkup-import-masse.js — la copie d'un ZIP mémorisé est RÉELLE
// =====================================================================
// 🩸 Vécu le 16/09/2026 (KARMA : « ça marche uniquement pour le dernier plan
// chargé dans la liste »). Chromium range un `File` issu d'un sélecteur PAR
// RÉFÉRENCE au fichier sur le disque : IndexedDB rend un objet de la bonne
// taille, mais sa lecture échoue dès que l'original a été modifié, déplacé
// ou supprimé. Aucun garde-fou statique ne peut le prouver : seul un
// navigateur le montre. Ce checkup :
//   1. fabrique 3 ZIP MyKTAMap sur le disque ;
//   2. les importe PAR L'ÉCRAN (bouton 📦, champ de fichiers, Importer) ;
//   3. MODIFIE plan1.zip, SUPPRIME plan2.zip, laisse plan3 intact ;
//   4. recharge la page et relit les 3 blobs (4 octets chacun) ;
//   5. ouvre depuis la liste le plan dont le fichier a disparu.
// Sur le code d'avant (put(file) tel quel) : plan1 NotReadableError, plan2
// NotFoundError. Usage : node scripts/smoke/checkup-import-masse.js
// (Playwright + Chromium requis, comme les autres checkups de ce dossier ;
// KTA_CHROMIUM=<chemin de chrome.exe> pour imposer un exécutable.)
"use strict";
const path = require("path");
const fs   = require("fs");
const os   = require("os");
const { chromium } = require("playwright");
const server = require("./server.js");
const ROOT  = path.resolve(__dirname, "..", "..");
const JSZip = require(path.join(ROOT, "lib", "jszip.min.js"));

const URL = "http://127.0.0.1:8123/index.html";
const LS = {
  myktamap_unlock_v1: "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  myktamap_terms_accepted_v1: "1",
  myktamap_pin_proposal_done_v1: "1",
  myktamap_tutorial_seen_v1: "1",
  myktamap_osm_view_opt_in: "true",
  myktamap_home_footer_replie_v1: "false"
};
const echecs = [];
function t(msg, ok) { console.log((ok ? "✅ " : "❌ ") + msg); if (!ok) echecs.push(msg); }

// Trois VRAIS plans : le ZIP d'exemple du dépôt (`data/myktamap.zip`, plan
// « Test MultiLVL »), renommé et re-versionné trois fois. Un plan fabriqué
// de toutes pièces (image 1×1) reste bloqué sur « Chargement en cours… » :
// l'étape 5 doit ouvrir un plan qui se charge vraiment.
const ZIP_EXEMPLE = path.join(ROOT, "data", "myktamap.zip");
async function fabriquerZip(dossier, i) {
  const z = await JSZip.loadAsync(fs.readFileSync(ZIP_EXEMPLE));
  const entree = z.file("plan-config.json") || z.file(/(^|\/)plan-config\.json$/)[0];
  const cfg = JSON.parse(await entree.async("string"));
  cfg.plan.name = "Checkup import " + i;
  cfg.plan.version = "V" + i;
  // 🏷️ 16/09/2026 — étiquettes proposées par le ZIP (champ du Générateur) :
  // elles doivent apparaître dans la liste dès l'import multiple.
  cfg.plan.tags = ["checkup", "lot " + i];
  z.file(entree.name, JSON.stringify(cfg));
  z.file("bourrage.bin", Buffer.alloc(1000 * i, i));   // taille distincte par plan
  const p = path.join(dossier, "plan" + i + ".zip");
  fs.writeFileSync(p, await z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return p;
}

async function ouvrirAccueil(ctx) {
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: "domcontentloaded" });
  // Le splash est RETIRÉ DU DOM après ~3,5 s (cf. checkup-home-scroll.js).
  await p.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
  await p.waitForTimeout(700);
  await p.evaluate(function () { const m = document.getElementById("kta-alert-modal"); if (m) m.remove(); });
  await p.waitForTimeout(300);
  return p;
}

// Pour chaque plan local : le drapeau, la taille du blob et sa LISIBILITÉ.
async function etatBlobs(p) {
  return p.evaluate(async function () {
    const out = [];
    for (const pl of window.PlanRegistry.getAll()) {
      if (pl.type !== "local") continue;
      const b = await window.PlanRegistry.getBlob(pl.id);
      let lisible = null;
      if (b) {
        try { lisible = (await b.slice(0, 4).arrayBuffer()).byteLength === 4; }
        catch (e) { lisible = "ERREUR " + (e && e.name); }
      }
      out.push({ id: pl.id, storedBlob: !!pl.storedBlob, taille: b ? b.size : null, lisible: lisible });
    }
    return out;
  });
}

(async function () {
  console.log("📦 checkup IMPORT MULTIPLE — la copie du ZIP survit à son fichier d'origine\n");
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "kta-impmasse-"));
  const zips = [];
  for (let i = 1; i <= 3; i++) zips.push(await fabriquerZip(dossier, i));

  let nav;
  try {
    const opts = process.env.KTA_CHROMIUM ? { executablePath: process.env.KTA_CHROMIUM } : {};
    nav = await chromium.launch(opts).catch(function () { return chromium.launch({ channel: "chromium" }); });
    const ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(function (ls) { for (const k in ls) if (!localStorage.getItem(k)) localStorage.setItem(k, ls[k]); }, LS);

    // 1-2. Import par l'écran
    let p = await ouvrirAccueil(ctx);
    await p.click("#loaderImportMasseBtn");
    await p.waitForSelector("#kta-impm-input", { state: "attached", timeout: 5000 });
    await p.setInputFiles("#kta-impm-input", zips);
    await p.waitForFunction(function () { const b = document.getElementById("kta-impm-lancer"); return b && !b.disabled; }, null, { timeout: 15000 });
    await p.click("#kta-impm-lancer");
    await p.waitForFunction(function () { const b = document.getElementById("kta-impm-lancer"); return b && b.dataset.fini === "1"; }, null, { timeout: 30000 });
    console.log("   " + (await p.textContent("#kta-impm-resume")).trim());

    const e1 = await etatBlobs(p);
    t("3 plans entrés dans la liste, tous marqués « mémorisé »", e1.length === 3 && e1.every(function (x) { return x.storedBlob; }));
    t("les 3 blobs se lisent dans l'onglet de l'import", e1.every(function (x) { return x.taille && x.lisible === true; }));
    // 🏷️ 16/09/2026 — les étiquettes du plan-config arrivent AVEC l'entrée, origine "config".
    const tags1 = await p.evaluate(function () {
      return window.PlanRegistry.getAll().filter(function (pl) { return pl.type === "local"; })
        .map(function (pl) { return { tags: pl.tags || [], src: pl.tagsSrc || null }; });
    });
    t("🏷️ les étiquettes écrites dans les ZIP sont dans la liste dès l'import multiple, origine « config »",
      tags1.length === 3 && tags1.every(function (x) { return x.tags.indexOf("checkup") >= 0 && x.tags.length === 2 && x.src === "config"; }));

    // 3. Le disque bouge
    fs.appendFileSync(zips[0], Buffer.alloc(10, 9));
    fs.unlinkSync(zips[1]);
    console.log("   disque : plan1.zip modifié · plan2.zip supprimé · plan3.zip intact");

    // 4. Rechargement, relecture
    await p.close();
    p = await ouvrirAccueil(ctx);
    const e2 = await etatBlobs(p);
    e2.forEach(function (x) { console.log("   " + x.id + " → " + (x.lisible === true ? "lisible" : x.lisible)); });
    t("🩸 après modification et suppression des fichiers d'origine, les 3 blobs se lisent encore (= vraie COPIE, pas une référence)",
      e2.length === 3 && e2.every(function (x) { return x.taille && x.lisible === true; }));

    // 5. Ouverture du plan dont le fichier a disparu
    const ligne = await p.$("text=Checkup import 2");
    t("le plan dont le fichier a été supprimé est dans la liste", !!ligne);
    if (ligne) {
      await ligne.click();
      // Ouvert = le plan courant porte son nom (indépendant de la façon dont
      // l'accueil se masque). On laisse jusqu'à 10 s à un vrai chargement.
      await p.waitForFunction(function () {
        return (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name === "Checkup import 2") ||
               !!document.getElementById("planIntrouvableModal");
      }, null, { timeout: 10000 }).catch(function () {});
      const etat = await p.evaluate(function () {
        const st = document.getElementById("loaderStatus");
        return {
          modale: !!document.getElementById("planIntrouvableModal"),
          ouvert: !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name === "Checkup import 2"),
          statut: st ? st.textContent.trim().slice(0, 120) : ""
        };
      });
      if (!etat.ouvert) console.log("   état : modale=" + etat.modale + " · statut=« " + etat.statut + " »");
      t("🩸 …et il S'OUVRE depuis sa copie (pas de modale « Données introuvables »)", etat.ouvert && !etat.modale);
      // 🏷️ l'ouverture rejoue la règle « le fichier propose » : les étiquettes restent, même origine.
      const tagsOuv = await p.evaluate(function () {
        const pl = window.PlanRegistry.findById("local_checkup_import_2_v2");
        return pl ? { tags: pl.tags || [], src: pl.tagsSrc || null } : null;
      });
      t("🏷️ après ouverture, les étiquettes du ZIP sont conservées (« checkup », « lot 2 », origine config)",
        !!tagsOuv && tagsOuv.tags.length === 2 && tagsOuv.tags.indexOf("lot 2") >= 0 && tagsOuv.src === "config");
    }
    await ctx.close();
  } catch (e) {
    console.error("\n❌ checkup impossible : " + e.message);
    if (nav) await nav.close();
    server.close();
    process.exit(2);
  }
  await nav.close();
  server.close();
  try { fs.rmSync(dossier, { recursive: true, force: true }); } catch (e) {}

  if (!echecs.length) {
    console.log("\n🎉 import multiple : les ZIP mémorisés sont de vraies copies, elles survivent au disque");
    process.exit(0);
  }
  console.log("\n💥 import multiple : " + echecs.length + " contrôle(s) en échec");
  process.exit(1);
})();
