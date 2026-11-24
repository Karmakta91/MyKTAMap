#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-icones-legende.js — checkup (Playwright, pas un hook pré-commit) : icônes personnalisées de la Légende
// =====================================================================
// Relevé fictif rendu LOCAL (son ZIP construit dans la page, avec un ancien tag court « vieux_tag » déclaré dans
// `icons` et son image dans le ZIP, comme un plan d'avant les icônes de Légende), parcours réel :
//   1. « Nouveau tag » par le formulaire → page rechargée : le point garde son tag ET son icône, l'entrée est listée
//      dans « Personnaliser la légende » ;
//   2. « Changer l'icône » (legendCustomization.js > ouvrirEditeur) : image réduite (≤ 64 px, PNG data-URI), carte
//      et résolveurs à jour tout de suite ; fichier illisible → refus dit par ktaAlerte, icône inchangée ;
//   3. « Rendre modifiable » sur l'ancien tag : entrée de même id, libellé lisible, points inchangés ; renommée et
//      icône changée, la nouvelle icône gagne aussi dans les résolveurs qui lisent PLAN_CONFIG.icons d'abord ;
//   4. rechargement, puis « Mettre à jour le plan » (points versés dans deux nouveaux calques) : le ZIP régénéré
//      porte les deux entrées dans sa légende, la nouvelle image de l'ancien tag dans `icons`, aucune clé `cust-…` ;
//      plan remplacé et rouvert : tags et icônes gardés ;
//   5. navigateur neuf, ZIP régénéré importé seul : mêmes icônes, mêmes entrées (le plan se suffit).
// Usage : node scripts/smoke/checkup-icones-legende.js (SMOKE_PORT pour une autre copie) · doc : rendering-leaflet.md
// =====================================================================
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const problemes = [];
function verifier(c, msg, d) {
  if (c) console.log("  ✅ " + msg);
  else { problemes.push(msg); console.log("  ❌ " + msg + (d !== undefined ? " " + JSON.stringify(d).slice(0, 400) : "")); }
}

async function accueil(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

async function fermerFenetreSession(page) {
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
  });
}

async function rouvrir(page, id) {
  await accueil(page);
  await page.evaluate(function (i) { return window.chargerPlanDuRegistre(i); }, id);
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.HistoryManager; }, 30000);
  await page.waitForTimeout(3500);
  await fermerFenetreSession(page);
  await page.waitForTimeout(800);
}

async function cliquerOuiConfirm(page) {
  await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 10000);
  await page.waitForTimeout(600);   // garde anti-double-clic de ktaConfirm
  await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
}

// PNG fabriqué dans la page (canvas) → Buffer, pour le sélecteur de fichier.
async function png(page, w, h, couleur) {
  const b64 = await page.evaluate(function (a) {
    const c = document.createElement("canvas"); c.width = a.w; c.height = a.h;
    const x = c.getContext("2d"); x.fillStyle = a.couleur; x.fillRect(0, 0, a.w, a.h);
    return c.toDataURL("image/png").split(",")[1];
  }, { w: w, h: h, couleur: couleur });
  return Buffer.from(b64, "base64");
}

// Icône réellement posée sur le marqueur du point (session ou calque), et résolveurs voisins.
function icones(page, nom) {
  return page.evaluate(function (n) {
    const tous = [].concat(window.getEditorPoints() || [],
      typeof window.getAllEmbeddedPoints === "function" ? (window.getAllEmbeddedPoints() || []) : []);
    const p = tous.find(function (q) { return q && q.nom === n; });
    if (!p) return { absent: true };
    const ll = window.convertCoord(p.x, p.y);
    let marqueur = null;
    const visiter = function (g) {
      if (!g || typeof g.eachLayer !== "function") return;
      g.eachLayer(function (l) {
        if (l instanceof window.L.Marker) {
          const q = l.getLatLng();
          if (Math.abs(q.lat - ll[0]) < 0.01 && Math.abs(q.lng - ll[1]) < 0.01) {
            const ic = l.options.icon;
            marqueur = ic && (ic._kta_iconUrl || (ic.options && ic.options.iconUrl));
          }
        } else visiter(l);
      });
    };
    visiter(window.layerEditor);
    Object.keys(window.dataLayerGroups || {}).forEach(function (k) { visiter(window.dataLayerGroups[k]); });
    return { tags: p.tags, marqueur: marqueur, url: window.getIconUrlForPoint(p) };
  }, nom);
}

function entree(page, id) {
  return page.evaluate(function (i) {
    const e = window.LegendCustomization.findCustomEntry(i);
    return e ? { label: e.label, iconUrl: e.iconUrl, source: e.source } : null;
  }, id);
}

// « Personnaliser la légende » ouvert, section Icônes dépliée → lignes vues.
async function ouvrirEditeur(page) {
  return page.evaluate(function () {
    if (!document.getElementById("kta-legend-editor-modal")) window.LegendCustomization.ouvrirEditeur();
    const m = document.getElementById("kta-legend-editor-modal");
    m.querySelectorAll("details.kta-legend-cat").forEach(function (d) { d.open = true; });
    const ids = Array.prototype.map.call(m.querySelectorAll(".kta-legend-row[data-custom-id]"),
      function (r) { return r.getAttribute("data-custom-id"); });
    const rendre = Array.prototype.map.call(m.querySelectorAll(".kta-legend-rendre"),
      function (b) { return b.getAttribute("data-tag"); });
    const changer = Array.prototype.map.call(m.querySelectorAll(".kta-legend-icone"),
      function (b) { return b.getAttribute("data-custom-id"); });
    return { ids: ids, rendre: rendre, changer: changer };
  });
}
function fermerEditeur(page) {
  return page.evaluate(function () { const m = document.getElementById("kta-legend-editor-modal"); if (m) m.remove(); });
}

// « Changer l'icône » sur l'entrée `id` avec le fichier donné ; false si le bouton manque.
async function changerIcone(page, id, fichier) {
  const sel = '#kta-legend-editor-modal .kta-legend-icone[data-custom-id="' + id + '"]';
  if (!(await page.$(sel))) return false;
  const attente = page.waitForEvent("filechooser", { timeout: 5000 }).catch(function () { return null; });
  await page.click(sel);
  const choix = await attente;
  // Chromium sans affichage n'ouvre pas toujours un second sélecteur de suite : le clic a quand même désigné
  // l'entrée (data-custom-id), le fichier est alors posé sur le champ.
  if (choix) await choix.setFiles(fichier);
  else await page.setInputFiles("#kta-legend-editor-fichier", fichier);
  await page.waitForTimeout(1500);
  return choix ? "selecteur" : "champ";
}

async function telechargerZipFictif(page) {
  return page.evaluate(async function () {
    const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
    if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
    const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
    // Ancien tag court : clé de `icons` hors catalogue, image embarquée (plan d'avant les icônes de Légende).
    cfg.icons = cfg.icons || {};
    cfg.icons.vieux_tag = "icon/vieux_tag.png";
    const zip = new JSZip();
    zip.file("plan-config.json", JSON.stringify(cfg));
    zip.file("icon/vieux_tag.png", await (await fetch("icon/pa.png")).blob());
    const chemins = [cfg.plan.baseImage]
      .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
      .concat(Object.keys(cfg.icons).filter(function (k) { return k !== "vieux_tag"; }).map(function (k) { return cfg.icons[k]; }))
      .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
    for (const p of Array.from(new Set(chemins))) {
      const r = await fetch(window.resolveServerPath(p, srv.path));
      if (r.ok) zip.file(p, await r.blob());
    }
    const blob = await zip.generateAsync({ type: "blob" });
    await window.chargerZipFichier(new File([blob], "fictif.zip", { type: "application/zip" }), "auto", { storeBlob: true });
    return { ok: true };
  });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  let zipRegenere = null;
  try {
    const page = await nav.newPage({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
    await page.addInitScript(function (ls) { for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} } }, LS);
    const erreurs = [];
    page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
    await accueil(page);
    const z = await telechargerZipFictif(page);
    if (!z.ok) throw new Error(z.raison);
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window._currentLoadedPlanId; }, 30000);
    await page.waitForTimeout(2500);
    await fermerFenetreSession(page);
    const planId = await page.evaluate(function () { return window._currentLoadedPlanId; });

    console.log("— 1. Nouveau tag par le formulaire, puis rechargement —");
    const idA = await page.evaluate(async function () {
      window.setEditorPoints([]);
      const c = window.map.getCenter();
      window.afficherFormulaire(Math.round(c.lng), Math.round(window.APP_CONFIG.imageHeight - c.lat));
      document.getElementById("kta-poi-nom").value = "PointA";
      const s = document.getElementById("kta-poi-type");
      s.value = "__new__"; s.dispatchEvent(new Event("change"));
      document.getElementById("kta-poi-newtag").value = "Puits du nord";
      document.getElementById("kta-poi-valider").click();
      await new Promise(function (r) { setTimeout(r, 1500); });
      // Point d'un ancien tag court, dessiné avant le changement.
      const pts = window.getEditorPoints().slice();
      const pv = { nom: "PointV", x: Math.round(c.lng) + 60, y: Math.round(window.APP_CONFIG.imageHeight - c.lat), tags: ["vieux_tag"] };
      window.KtaUid.ensure(pv, "pt"); window.KtaUid.touch(pv);
      pts.push(pv);
      window.setEditorPoints(pts);
      await window.SessionPersist.save({ force: true });
      const a = pts.find(function (p) { return p.nom === "PointA"; });
      return a && a.tags && a.tags[0];
    });
    verifier(/^cust-/.test(idA || ""), "le point porte l'id d'une icône personnalisée", idA);
    const iconeDefautA = (await entree(page, idA) || {}).iconUrl;
    await rouvrir(page, planId);
    const iA1 = await icones(page, "PointA");
    verifier(iA1.tags && iA1.tags[0] === idA && iA1.marqueur === iconeDefautA,
      "rechargé : le point garde son tag et l'icône de son entrée", { i: iA1, attendu: iconeDefautA });
    let ed = await ouvrirEditeur(page);
    verifier(ed.ids.indexOf(idA) >= 0, "« Personnaliser la légende » liste l'icône créée", ed);
    verifier(ed.rendre.indexOf("vieux_tag") >= 0, "l'ancien tag court est listé avec « Rendre modifiable »", ed);

    console.log("— 2. Changer l'icône —");
    const pngA = await png(page, 200, 120, "#d03030");
    const okA = await changerIcone(page, idA, { name: "rouge.png", mimeType: "image/png", buffer: pngA });
    verifier(okA === "selecteur", "bouton « Changer l'icône » présent, il ouvre le sélecteur de fichier", okA);
    const eA = await entree(page, idA);
    const dims = await page.evaluate(function (u) {
      return new Promise(function (r) {
        if (!u) return r(null);
        const im = new Image(); im.onload = function () { r([im.naturalWidth, im.naturalHeight]); }; im.onerror = function () { r(null); }; im.src = u;
      });
    }, eA && eA.iconUrl);
    verifier(eA && /^data:image\/png;base64,/.test(eA.iconUrl || "") && dims && Math.max(dims[0], dims[1]) <= 64 && dims[0] === 64,
      "image réduite à 64 px de côté, PNG data-URI", { dims: dims, debut: eA && String(eA.iconUrl).slice(0, 30) });
    const iA2 = await icones(page, "PointA");
    verifier(eA && iA2.marqueur === eA.iconUrl && iA2.url === eA.iconUrl, "carte et résolveur à jour tout de suite", iA2.marqueur === (eA && eA.iconUrl));
    const avantIllisible = eA && eA.iconUrl;
    const okI = await changerIcone(page, idA, { name: "faux.png", mimeType: "image/png", buffer: Buffer.from("pas une image") });
    let alerte = false;
    if (okI) {
      try {
        await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 5000);
        alerte = await page.evaluate(function () { return !!document.querySelector(".kta-confirm-overlay, #kta-confirm-oui"); });
        await cliquerOuiConfirm(page);
      } catch (e) { alerte = false; }
    }
    verifier(okI && alerte && ((await entree(page, idA)) || {}).iconUrl === avantIllisible,
      "fichier illisible : refus dit par ktaAlerte, icône inchangée", { okI: okI, alerte: alerte });

    console.log("— 3. Rendre modifiable un ancien tag court —");
    const rendu = await page.evaluate(async function () {
      const b = document.querySelector('#kta-legend-editor-modal .kta-legend-rendre[data-tag="vieux_tag"]');
      if (!b) return { bouton: false };
      b.click();
      await new Promise(function (r) { setTimeout(r, 1500); });
      const pv = window.getEditorPoints().find(function (p) { return p.nom === "PointV"; });
      return { bouton: true, tags: pv && pv.tags };
    });
    const eV = await entree(page, "vieux_tag");
    verifier(rendu.bouton && eV && eV.label === "Vieux tag" && /^data:image\//.test(eV.iconUrl || ""),
      "« Rendre modifiable » : entrée « Vieux tag » de même id, image gardée en data-URI", { rendu: rendu, e: eV && { label: eV.label, u: String(eV.iconUrl).slice(0, 20) } });
    verifier(rendu.tags && rendu.tags.length === 1 && rendu.tags[0] === "vieux_tag", "les points ne changent pas", rendu.tags);
    ed = await ouvrirEditeur(page);
    verifier(ed.ids.indexOf("vieux_tag") >= 0 && ed.rendre.indexOf("vieux_tag") < 0 && ed.changer.indexOf("vieux_tag") >= 0,
      "l'ancien tag devient une ligne renommable avec « Changer l'icône »", ed);
    await page.evaluate(function () {
      const i = document.querySelector('#kta-legend-editor-modal .kta-legend-label[data-custom-id="vieux_tag"]');
      if (i) { i.value = "Ancien puits"; i.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    const pngV = await png(page, 48, 48, "#30a050");
    await changerIcone(page, "vieux_tag", { name: "vert.png", mimeType: "image/png", buffer: pngV });
    const eV2 = await entree(page, "vieux_tag");
    const iV = await icones(page, "PointV");
    const resolveurs = await page.evaluate(function () {
      return { plan: window.PLAN_CONFIG.icons.vieux_tag,
               export: typeof window._iconePourTag === "function" ? window._iconePourTag("vieux_tag") : "(absent)",
               cust: Object.keys(window.PLAN_CONFIG.icons).filter(function (k) { return /^cust-/.test(k); }) };
    });
    verifier(eV2 && eV2.label === "Ancien puits", "ancien tag renommé", eV2 && eV2.label);
    verifier(eV2 && /^data:image\/png/.test(eV2.iconUrl) && iV.marqueur === eV2.iconUrl && iV.url === eV2.iconUrl &&
      resolveurs.plan === eV2.iconUrl && (resolveurs.export === "(absent)" || resolveurs.export === eV2.iconUrl),
      "icône changée : carte, getIconUrlForPoint, PLAN_CONFIG.icons et export suivent", { iV: iV.marqueur === (eV2 && eV2.iconUrl), url: iV.url === (eV2 && eV2.iconUrl), plan: resolveurs.plan === (eV2 && eV2.iconUrl) });
    verifier(resolveurs.cust.length === 0, "aucune clé cust-… dans PLAN_CONFIG.icons", resolveurs.cust);
    await fermerEditeur(page);
    await page.evaluate(async function () { await window.SessionPersist.save({ force: true }); });

    console.log("— 4. Rechargement, puis « Mettre à jour le plan » —");
    await rouvrir(page, planId);
    const iA3 = await icones(page, "PointA"), iV3 = await icones(page, "PointV");
    verifier(iA3.marqueur === (eA && eA.iconUrl) && iV3.marqueur === (eV2 && eV2.iconUrl) && iV3.url === (eV2 && eV2.iconUrl),
      "rechargé : les deux icônes changées tiennent", { a: iA3.marqueur === (eA && eA.iconUrl), v: iV3.marqueur === (eV2 && eV2.iconUrl), vu: iV3.url === (eV2 && eV2.iconUrl) });
    await page.evaluate(function () { return window.MajPlan.ouvrir(); });
    await attendre(page, function () { return !!document.getElementById("kta-maj-plan"); }, 5000);
    const groupes = await page.evaluate(function () {
      const ov = document.getElementById("kta-maj-plan");
      const sels = Array.prototype.slice.call(ov.querySelectorAll("[data-maj-groupe]"));
      let n = 0;
      sels.forEach(function (s) {
        if (!/Points/.test(s.closest(".kta-maj-groupe").querySelector(".kta-maj-groupe-titre").textContent)) return;
        s.value = "n"; s.dispatchEvent(new Event("change", { bubbles: true }));
        const nom = ov.querySelector('[data-maj-nom="' + s.getAttribute("data-maj-groupe") + '"]');
        if (nom) nom.value = "Ajouts " + (++n);
      });
      return n;
    });
    verifier(groupes === 2, "assistant : deux groupes de points versés dans de nouveaux calques", groupes);
    await page.evaluate(function () { document.getElementById("kta-maj-suivant").click(); });
    await attendre(page, function () { return document.querySelectorAll(".kta-planner-layer-maj").length > 0; }, 30000);
    await page.waitForTimeout(800);
    await page.evaluate(function () { document.getElementById("kta-planner-generer").click(); });
    // Tuilage V2 : on confirme d'abord la fermeture du plan ; sinon la génération part directement.
    await attendre(page, function () { return !!document.getElementById("kta-confirm-oui") || !!document.getElementById("kta-maj-fin"); }, 90000);
    if (await page.$("#kta-confirm-oui")) await cliquerOuiConfirm(page);
    await attendre(page, function () { return !!document.getElementById("kta-maj-fin"); }, 90000);
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.evaluate(function () { document.querySelector('#kta-maj-fin [data-maj-fin="telecharger"]').click(); })
    ]);
    zipRegenere = fs.readFileSync(await dl.path());
    const lu = await page.evaluate(async function (a) {
      const zz = await JSZip.loadAsync(Uint8Array.from(atob(a.b64), function (c) { return c.charCodeAt(0); }));
      const cfg = JSON.parse(await zz.file("plan-config.json").async("string"));
      const cl = cfg.customLegend || (cfg.plan && cfg.plan.customLegend) || {};
      const ents = Array.isArray(cl.customEntries) ? cl.customEntries : [];
      const ea = ents.find(function (e) { return e.id === a.idA; });
      const ev = ents.find(function (e) { return e.id === "vieux_tag"; });
      return { a: ea ? { label: ea.label, ok: ea.iconUrl === a.uA } : null,
               v: ev ? { label: ev.label, ok: ev.iconUrl === a.uV } : null,
               iconV: cfg.icons && cfg.icons.vieux_tag === a.uV,
               cust: Object.keys(cfg.icons || {}).filter(function (k) { return /^cust-/.test(k); }) };
    }, { b64: zipRegenere.toString("base64"), idA: idA, uA: eA && eA.iconUrl, uV: eV2 && eV2.iconUrl });
    verifier(lu.a && lu.a.label === "Puits du nord" && lu.a.ok, "ZIP régénéré : légende du plan avec l'icône créée et son image", lu.a);
    verifier(lu.v && lu.v.label === "Ancien puits" && lu.v.ok, "ZIP régénéré : légende du plan avec l'ancien tag renommé", lu.v);
    verifier(lu.iconV, "ZIP régénéré : `icons.vieux_tag` = la nouvelle image", lu.iconV);
    verifier(lu.cust.length === 0, "ZIP régénéré : aucune clé cust-… dans `icons`", lu.cust);
    await page.evaluate(function () { document.querySelector('#kta-maj-fin [data-maj-fin="remplacer"]').click(); });
    await cliquerOuiConfirm(page);
    await attendre(page, function () {
      return !!window.PLAN_CONFIG && (window.PLAN_CONFIG.dataLayers || []).some(function (d) { return d.label === "Ajouts 1"; });
    }, 30000);
    await page.waitForTimeout(3000);
    await fermerFenetreSession(page);
    const iA4 = await icones(page, "PointA"), iV4 = await icones(page, "PointV");
    const enSession = await page.evaluate(function () { return (window.getEditorPoints() || []).length; });
    verifier(enSession === 0 && iA4.tags && iA4.tags[0] === idA && iA4.marqueur === (eA && eA.iconUrl),
      "plan remplacé : le point créé est dans son calque, tag et icône gardés", { session: enSession, tags: iA4.tags, ok: iA4.marqueur === (eA && eA.iconUrl) });
    verifier(iV4.tags && iV4.tags[0] === "vieux_tag" && iV4.marqueur === (eV2 && eV2.iconUrl) && iV4.url === (eV2 && eV2.iconUrl),
      "plan remplacé : l'ancien tag garde sa nouvelle icône", { tags: iV4.tags, m: iV4.marqueur === (eV2 && eV2.iconUrl), u: iV4.url === (eV2 && eV2.iconUrl) });
    ed = await ouvrirEditeur(page);
    verifier(ed.ids.indexOf(idA) >= 0 && ed.ids.indexOf("vieux_tag") >= 0 && ed.rendre.indexOf("vieux_tag") < 0,
      "plan remplacé : les deux entrées restent listées", ed);
    await fermerEditeur(page);
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));

    console.log("— 5. Navigateur neuf : le ZIP régénéré seul —");
    const ctx2 = await nav.newContext({ viewport: { width: 1280, height: 860 } });
    const p2 = await ctx2.newPage();
    await p2.addInitScript(function (ls) { for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} } }, LS);
    const err2 = [];
    p2.on("pageerror", function (e) { err2.push(String(e && e.message)); });
    await accueil(p2);
    await p2.evaluate(async function (b64) {
      const u8 = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
      await window.chargerZipFichier(new File([u8], "regenere.zip", { type: "application/zip" }), "auto", { storeBlob: true });
    }, zipRegenere.toString("base64"));
    await attendre(p2, function () { return !!window.PLAN_CONFIG && !!window.map && !!window._currentLoadedPlanId; }, 30000);
    await p2.waitForTimeout(3500);
    await fermerFenetreSession(p2);
    const nA = await icones(p2, "PointA"), nV = await icones(p2, "PointV");
    verifier(nA.marqueur === (eA && eA.iconUrl) && nV.marqueur === (eV2 && eV2.iconUrl) && nV.url === (eV2 && eV2.iconUrl),
      "plan seul : les deux points ont leur nouvelle icône", { a: nA.marqueur === (eA && eA.iconUrl), v: nV.marqueur === (eV2 && eV2.iconUrl) });
    const ed2 = await ouvrirEditeur(p2);
    const sA = await entree(p2, idA), sV = await entree(p2, "vieux_tag");
    verifier(ed2.ids.indexOf(idA) >= 0 && ed2.ids.indexOf("vieux_tag") >= 0 && sA && sA.source === "plan" && sV && sV.label === "Ancien puits",
      "plan seul : les deux entrées viennent du plan, libellés gardés", { ed: ed2, sA: sA && sA.source, sV: sV && sV.label });
    verifier(err2.length === 0, "aucune erreur de page (navigateur neuf)", err2.slice(0, 3));
    await ctx2.close();
  } catch (e) {
    problemes.push("exception du harnais : " + (e && e.message));
    console.log("  ❌ exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log(problemes.length
    ? "\n❌ CHECKUP ROUGE — " + problemes.length + " problème(s)"
    : "\n🎉 CHECKUP VERT — icônes de Légende changées, anciens tags rendus modifiables, et tout tient à la régénération du plan.");
  process.exit(problemes.length ? 1 : 0);
})();
