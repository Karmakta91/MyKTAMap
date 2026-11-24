#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-tag-nouveau.js — checkup (Playwright, pas un hook pré-commit) : tag créé à la volée sur un POI
// =====================================================================
// Relevé fictif, par le vrai formulaire (editor.js > afficherFormulaire) :
//   • « Nouveau tag » avec un libellé libre (« Puits du nord ») → icône personnalisée de la Légende (id cust-…,
//     icône par défaut), le point porte cet id ; même libellé à la casse près → la même entrée est reprise ;
//   • page rechargée, plan rouvert : le point garde son tag, « Modifier » le présente sélectionné avec son
//     libellé, Enregistrer sans rien changer le garde ;
//   • ancien tag court (« montag », créé avant ce changement, absent de PLAN_CONFIG.icons) : toujours proposé et
//     gardé par « Modifier » (editor.js > _buildTypeOptionsHTML).
// Usage : node scripts/smoke/checkup-tag-nouveau.js (SMOKE_PORT pour une autre copie)
// =====================================================================
"use strict";
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
require("./server.js");

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
  else { problemes.push(msg); console.log("  ❌ " + msg + (d !== undefined ? " " + JSON.stringify(d) : "")); }
}

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText("Relevé fictif", { exact: false }).first().click();
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.HistoryManager; }, 30000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
  });
  await page.waitForTimeout(1500);
}

// Ajoute un point par le formulaire avec « Nouveau tag » = libelle ; rend les points de session.
function ajouterAvecNouveauTag(page, nom, libelle, decalage) {
  return page.evaluate(async function (a) {
    const c = window.map.getCenter();
    window.afficherFormulaire(Math.round(c.lng) + a.decalage, Math.round(window.APP_CONFIG.imageHeight - c.lat));
    document.getElementById("kta-poi-nom").value = a.nom;
    const s = document.getElementById("kta-poi-type");
    s.value = "__new__"; s.dispatchEvent(new Event("change"));
    document.getElementById("kta-poi-newtag").value = a.libelle;
    document.getElementById("kta-poi-valider").click();
    await new Promise(function (r) { setTimeout(r, 1500); });
    return window.getEditorPoints().map(function (p) { return { nom: p.nom, tags: p.tags }; });
  }, { nom: nom, libelle: libelle, decalage: decalage });
}

// Ouvre « Modifier » sur le point `nom`, lit la liste Type, enregistre sans rien changer.
function modifierSansChanger(page, nom) {
  return page.evaluate(async function (n) {
    const p = window.getEditorPoints().find(function (q) { return q.nom === n; });
    window.afficherFormulaire(p.x, p.y, p);
    const sel = document.getElementById("kta-poi-type");
    const opt = sel.options[sel.selectedIndex];
    const avant = { valeur: sel.value, texte: opt ? opt.textContent : null };
    document.getElementById("kta-poi-valider").click();
    await new Promise(function (r) { setTimeout(r, 1500); });
    const apres = window.getEditorPoints().find(function (q) { return q.nom === n; });
    return Object.assign(avant, { apres: apres ? apres.tags : null });
  }, nom);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  try {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on("pageerror", function (e) { erreurs.push(String(e)); });
    // Pré-gates posés une seule fois : le rechargement doit retrouver la session, pas un état neuf.
    await page.addInitScript(function (ls) {
      if (sessionStorage.getItem("kta-ck-init")) return;
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
      sessionStorage.setItem("kta-ck-init", "1");
    }, LS);
    await ouvrir(page);
    await page.evaluate(function () {
      window.setEditorPoints([]);
      if (window.renderEditorPoints) window.renderEditorPoints();
    });

    console.log("— Nouveau tag au libellé libre —");
    const r1 = await ajouterAvecNouveauTag(page, "PointA", "Puits du nord", 0);
    const idA = r1[0] && r1[0].tags && r1[0].tags[0];
    verifier(/^cust-/.test(idA || ""), "le point porte l'id d'une icône personnalisée", r1);
    const entree = await page.evaluate(function (id) {
      const e = window.LegendCustomization.listCustomEntries("icones").find(function (x) { return x.id === id; });
      return e ? { label: e.label, iconUrl: e.iconUrl, icone: !!window._iconMap[id] } : null;
    }, idA);
    verifier(entree && entree.label === "Puits du nord" && !!entree.iconUrl && entree.icone,
      "entrée de Légende « Puits du nord », icône par défaut, icône de carte enregistrée", entree);
    const r2 = await ajouterAvecNouveauTag(page, "PointB", "  puits   du NORD ", 40);
    const idB = (r2.find(function (p) { return p.nom === "PointB"; }) || {}).tags;
    const nEntrees = await page.evaluate(function () {
      return window.LegendCustomization.listCustomEntries("icones").filter(function (e) { return /puits du nord/i.test(e.label); }).length;
    });
    verifier(idB && idB[0] === idA && nEntrees === 1, "même libellé (casse, espaces) : la même entrée est reprise", { idB: idB, nEntrees: nEntrees });

    console.log("— Ancien tag court —");
    await page.evaluate(function () {
      const c = window.map.getCenter();
      const pts = window.getEditorPoints().slice();
      pts.push({ nom: "PointC", id: "PointC", x: Math.round(c.lng) + 80, y: Math.round(window.APP_CONFIG.imageHeight - c.lat),
        tags: ["montag"], description: "" });
      window.setEditorPoints(pts);
      if (window.renderEditorPoints) window.renderEditorPoints();
      if (window.SessionPersist) window.SessionPersist.save({ force: true });
    });
    await page.waitForTimeout(3000);

    console.log("— Rechargement —");
    await ouvrir(page);
    const apres = await page.evaluate(function () {
      const o = {};
      window.getEditorPoints().forEach(function (p) { o[p.nom] = p.tags; });
      return o;
    });
    verifier(apres.PointA && apres.PointA[0] === idA && apres.PointB && apres.PointB[0] === idA,
      "rechargé : les deux points gardent l'icône personnalisée", apres);
    verifier(apres.PointC && apres.PointC[0] === "montag", "rechargé : l'ancien tag court est gardé", apres);
    const mA = await modifierSansChanger(page, "PointA");
    verifier(mA.valeur === idA && /Puits du nord/.test(mA.texte || ""), "« Modifier » : tag sélectionné avec son libellé", mA);
    verifier(mA.apres && mA.apres[0] === idA, "Enregistrer sans rien changer garde le tag", mA);
    const mC = await modifierSansChanger(page, "PointC");
    verifier(mC.valeur === "montag", "« Modifier » : l'ancien tag court est proposé et sélectionné", mC);
    verifier(mC.apres && mC.apres[0] === "montag", "Enregistrer sans rien changer garde l'ancien tag court", mC);
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs);
  } finally {
    await nav.close();
  }
  console.log(problemes.length
    ? "\n❌ CHECKUP ROUGE — " + problemes.length + " problème(s)"
    : "\n🎉 CHECKUP VERT — un nouveau tag prend un libellé libre (icône de Légende) et survit au rechargement.");
  process.exit(problemes.length ? 1 : 0);
})();
