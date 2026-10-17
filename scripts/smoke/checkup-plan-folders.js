#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-plan-folders.js — le mode Dossiers de « Mes plans », au pixel (consultatif)
// =====================================================================
// Vérifie : 1. mode TOUT sans hauteur ajoutée (sélecteur dans la ligne de titre) ;
//   2. 🩸 avec 8 dossiers et 60 plans, « Mes plans » en Dossiers n'est PAS plus haut qu'en TOUT (1536×800) ;
//   3. créer un dossier, y ranger un plan, sélection multiple ;
//   4. dossiers de l'index serveur verrouillés ; un plan déplacé à la main y reste après redécouverte ;
//   5. mobile 400 px : un dossier déplié se borne à 5 lignes + « Tout le dossier » ;
//   6. glisser souris (HTML5) et appui long tactile vers un en-tête.
// Usage : node scripts/smoke/checkup-plan-folders.js (Playwright ; KTA_CHROMIUM=<chrome.exe> force l'exécutable).
"use strict";
const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");   // repli Chromium → Edge
const server = require("./server.js");
const URL = "http://127.0.0.1:8123/index.html";
const LS = {
  myktamap_unlock_v1: "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  myktamap_terms_accepted_v1: "1", myktamap_pin_proposal_done_v1: "1", myktamap_tutorial_seen_v1: "1",
  myktamap_osm_view_opt_in: "true", myktamap_home_footer_replie_v1: "false"
};
function registre(nPlans) {
  const plans = [];
  for (let i = 1; i <= nPlans; i++) plans.push({ id: "local_p" + i, type: "local", name: "Plan " + i, version: "V1", lastOpened: new Date(2026, 8, 1, 0, 0, i).toISOString() });
  return JSON.stringify({ version: "1.0", lastPlanId: null, plans: plans });
}
const INDEX_DOSSIERS = {
  folders: [{ id: "secteur", name: "Secteur", color: "#123456" }, { id: "calcaire", name: "Calcaire" }],
  plans: [{ id: "s1", path: "data/test", name: "Serveur 1", folder: "secteur" }, { id: "s2", path: "data/test", name: "Serveur 2", folder: "secteur" }]
};
const echecs = [];
function t(msg, ok) { console.log((ok ? "✅ " : "❌ ") + msg); if (!ok) echecs.push(msg); }

async function ouvrir(ctx, opts) {
  const p = await ctx.newPage();
  if (opts && opts.index) await p.route("**/data/index.json", function (route) { route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.index) }); });
  await p.goto(URL, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#splashOverlay", { state: "detached", timeout: 25000 }).catch(function () {});
  await p.waitForTimeout(700);
  await p.evaluate(function () { const m = document.getElementById("kta-alert-modal"); if (m) m.remove(); });
  await p.waitForTimeout(300);
  return p;
}
const hauteur = function (p) { return p.evaluate(function () { const b = document.getElementById("myPlansBox"); return b ? Math.round(b.getBoundingClientRect().height) : -1; }); };
const modeVue = function (p, v) { return p.click('#loaderPlansViewSwitch [data-view="' + v + '"]').then(function () { return p.waitForTimeout(150); }); };

(async function () {
  console.log("📁 checkup DOSSIERS — « Mes plans » garde sa hauteur, l'index propose, l'utilisateur dispose\n");
  let nav;
  try {
    const opts = process.env.KTA_CHROMIUM ? { executablePath: process.env.KTA_CHROMIUM } : {};
    nav = await lancerNavigateur(chromium, opts);

    // ── 1-2-3. PC 1536×800, 60 plans ──
    let ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1536, height: 800 } });
    await ctx.addInitScript(function (ls) { for (const k in ls) if (!localStorage.getItem(k)) localStorage.setItem(k, ls[k]); }, Object.assign({ myktamap_plans: registre(60) }, LS));
    let p = await ouvrir(ctx);
    const etat0 = await p.evaluate(function () {
      const sw = document.getElementById("loaderPlansViewSwitch");
      const head = sw && sw.closest(".loader-section-head");
      return { sw: !!sw, dansTitre: !!head, actif: sw ? (sw.querySelector(".kta-actif") || {}).dataset : null,
               headH: head ? Math.round(head.getBoundingClientRect().height) : 0, dossiers: document.querySelectorAll(".kta-plans-folder-head").length,
               newHidden: document.getElementById("loaderPlansFolderNew").hidden, lignes: document.querySelectorAll("#allPlansList .plan-row").length };
    });
    // (le data/index.json réel du dépôt ajoute 1 plan serveur : ≥ 60 lignes)
    if (!(etat0.sw && etat0.dansTitre && etat0.actif && etat0.actif.view === "all" && etat0.dossiers === 0 && etat0.newHidden && etat0.lignes >= 60)) console.log("   état : " + JSON.stringify(etat0));
    t("mode TOUT par défaut : sélecteur dans la ligne de titre, « Tout » actif, aucun en-tête de dossier, ➕ masqué",
      etat0.sw && etat0.dansTitre && etat0.actif && etat0.actif.view === "all" && etat0.dossiers === 0 && etat0.newHidden && etat0.lignes >= 60);
    t("la ligne de titre reste basse (" + etat0.headH + " px ≤ 40)", etat0.headH > 0 && etat0.headH <= 40);
    const hTout = await hauteur(p);

    // 8 dossiers × 7 plans (56 rangés + non classés), par l'API : l'écran est testé ensuite
    await p.evaluate(function () {
      const PR = window.PlanRegistry;
      for (let d = 1; d <= 8; d++) {
        const f = PR.createFolder("Dossier " + d);
        for (let k = 1; k <= 7; k++) PR.setPlanFolder("local_p" + ((d - 1) * 7 + k), f.id, "user");
      }
    });
    await modeVue(p, "folders");
    const etat1 = await p.evaluate(function () {
      const heads = Array.from(document.querySelectorAll(".kta-plans-folder-head"));
      return { n: heads.length, hMax: Math.max.apply(null, heads.map(function (h) { return Math.round(h.getBoundingClientRect().height); })),
               visibles: Array.from(document.querySelectorAll("#allPlansList .plan-row")).filter(function (r) { return r.getBoundingClientRect().height > 0; }).length,
               chips: getComputedStyle(document.getElementById("loaderPlansTagChips")).display,
               dernier: heads[heads.length - 1].textContent.trim() };
    });
    const attendusNonClasses = etat0.lignes - 56;
    if (!(etat1.n === 9 && etat1.visibles === attendusNonClasses)) console.log("   état : " + JSON.stringify(etat1) + " attendus non classés = " + attendusNonClasses);
    t("mode Dossiers : 8 dossiers repliés + Non classés en dernier, chips masquées, seuls les non classés visibles (" + attendusNonClasses + ")",
      etat1.n === 9 && etat1.visibles === attendusNonClasses && etat1.chips === "none" && /Non class/.test(etat1.dernier));
    t("un en-tête de dossier fait la hauteur d'une ligne (" + etat1.hMax + " px ≤ 40)", etat1.hMax <= 40);
    await p.evaluate(function () { window.PlanRegistry.getFolders().forEach(function (f) { window.PlanRegistry.setFolderCollapsed(f.id, false); }); window.refreshPlansList(); });
    const hDossiersOuverts = await hauteur(p);
    await modeVue(p, "all");
    const hTout2 = await hauteur(p);
    t("🩸 CONTRAINTE STRICTE : « Mes plans » n'est pas plus haut en Dossiers (tout déplié : " + hDossiersOuverts + " px) qu'en TOUT (" + hTout2 + " px) — la colonne borne, la liste scrolle dedans",
      hDossiersOuverts <= hTout2 + 2 && hTout === hTout2);
    await modeVue(p, "folders");

    await p.click("#loaderPlansFolderNew");
    await p.fill("#kta-plans-folder-name", "Secteur");
    await p.keyboard.press("Enter");
    await p.waitForTimeout(200);
    const cree = await p.evaluate(function () { const f = window.PlanRegistry.findFolderByName("secteur"); return f ? { id: f.id, ouvert: f.collapsed === false } : null; });
    t("➕ crée le dossier « Secteur » (déplié) et il apparaît", !!cree && cree.ouvert && (await p.$$('.kta-plans-folder-head[data-folder="' + cree.id + '"]')).length === 1);
    // Pas de bouton par ligne (décision produit) : on range par ☑ puis « Déplacer vers… », ou par glisser
    t("aucun bouton 📁 « Déplacer vers » sur les lignes", (await p.$$(".kta-plan-row-move")).length === 0);
    await p.click("#loaderPlansSelect");
    await p.click('.plan-row[data-id="local_p57"]');
    await p.click("#loaderPlansSelectMove");
    await p.click('.kta-plans-sheet-item[data-fid="' + cree.id + '"]');
    await p.waitForTimeout(200);
    t("☑ un seul plan coché → Déplacer vers → il est dans Secteur (origine user), sélection close",
      await p.evaluate(function (fid) { const pl = window.PlanRegistry.findById("local_p57"); return pl.folderId === fid && pl.folderSrc === "user" && !document.getElementById("loaderPlansSelectBar"); }, cree.id));
    await p.click("#loaderPlansSelect");
    await p.click('.plan-row[data-id="local_p58"]');
    await p.click('.plan-row[data-id="local_p59"]');
    const nSel = await p.evaluate(function () { return document.querySelectorAll(".plan-row.kta-plan-row-selected").length; });
    t("☑ sélection : un clic coche au lieu d'ouvrir (" + nSel + " cochés, aucun plan ouvert)", nSel === 2 && await p.evaluate(function () { return !window.PLAN_CONFIG; }));
    // 🩸 en bas de liste, la barre « Déplacer vers » passe inaperçue : elle doit être en tête, visible sans défiler
    const barre = await p.evaluate(function () {
      const l = document.getElementById("allPlansList"), b = document.getElementById("loaderPlansSelectBar");
      if (!l || !b) return null;
      const r = b.getBoundingClientRect(), h = document.getElementById("myPlansBox").getBoundingClientRect();
      return { premier: l.firstElementChild === b, visible: r.top >= h.top - 1 && r.bottom <= h.bottom + 1, sticky: getComputedStyle(b).position === "sticky" };
    });
    t("la barre « Déplacer vers… » est le PREMIER élément de la liste, collante, visible sans défiler", !!barre && barre.premier && barre.visible && barre.sticky);
    await p.click("#loaderPlansSelectMove");
    await p.click('.kta-plans-sheet-item[data-fid="' + cree.id + '"]');
    await p.waitForTimeout(200);
    t("« Déplacer 2 vers… » range les deux d'un coup et sort du mode sélection",
      await p.evaluate(function (fid) { return ["local_p58", "local_p59"].every(function (id) { return window.PlanRegistry.findById(id).folderId === fid; }) && !document.getElementById("loaderPlansSelectBar"); }, cree.id));

    // ── 6. Glisser souris (HTML5) : local_p60 (non classé) → en-tête Secteur ──
    // 🩸 un mouvement LENT déclenche dragstart avant le seuil maison : le seuil ne doit pas l'annuler.
    const src = await p.$('.plan-row[data-id="local_p60"]');
    const dst = await p.$('.kta-plans-folder-head[data-folder="' + cree.id + '"]');
    if (src && dst) {
      const a = await src.boundingBox(), b = await dst.boundingBox();
      await p.mouse.move(a.x + 40, a.y + a.height / 2);
      await p.mouse.down();
      await p.mouse.move(a.x + 42, a.y + a.height / 2 + 1);                       // souris lente : 2 px
      await p.mouse.move(a.x + 45, a.y + a.height / 2 + 3);                       // 5 px : Chrome démarre le glisser
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
      await p.mouse.up();
      await p.waitForTimeout(300);
      const glisse = await p.evaluate(function (fid) { return window.PlanRegistry.findById("local_p60").folderId === fid; }, cree.id);
      t("🩸 glisser PC LENT : la ligne déposée sur l'en-tête rejoint le dossier", glisse);
    }
    const clicOk = await p.evaluate(function () { return typeof window.PLAN_CONFIG === "undefined" || !window.PLAN_CONFIG; });
    t("aucun plan ne s'est ouvert pendant ces gestes", clicOk);
    await ctx.close();

    // ── 4. Index serveur : dossiers verrouillés, l'utilisateur dispose ──
    ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 1536, height: 800 } });
    await ctx.addInitScript(function (ls) { for (const k in ls) if (!localStorage.getItem(k)) localStorage.setItem(k, ls[k]); }, Object.assign({ myktamap_plans: registre(2), myktamap_loader_show_server_plans: "true" }, LS));
    p = await ouvrir(ctx, { index: INDEX_DOSSIERS });
    await p.waitForTimeout(800);
    const idx1 = await p.evaluate(function () {
      const PR = window.PlanRegistry; const g = PR.findFolder("secteur"), c = PR.findFolder("calcaire");
      const s1 = PR.getAll().find(function (x) { return x.type === "server" && /Serveur 1/.test(x.name); });
      return { g: g && g.src, c: c && c.src, couleur: g && g.color, s1: s1 ? { fid: s1.folderId, src: s1.folderSrc, id: s1.id } : null };
    });
    t("index.json → dossiers Secteur et Calcaire créés, verrouillés (src index), couleur reprise, Serveur 1 rangé par l'index",
      idx1.g === "index" && idx1.c === "index" && idx1.couleur === "#123456" && idx1.s1 && idx1.s1.fid === "secteur" && idx1.s1.src === "index");
    await modeVue(p, "folders");
    await p.click('.kta-plans-folder-head[data-folder="secteur"] .kta-plans-folder-menu');
    await p.waitForTimeout(150);
    const verrou = await p.evaluate(function () {
      const nom = document.getElementById("kta-plans-folder-name"); const del = document.querySelector("[data-del]");
      return { lock: !!document.querySelector(".kta-plans-sheet-lock"), nomDisabled: nom && nom.disabled, delDisabled: del && del.disabled, ok: !document.querySelector("[data-ok]") };
    });
    t("⋮ sur un dossier de l'index : verrou affiché, nom et suppression désactivés", verrou.lock && verrou.nomDisabled && verrou.delDisabled && verrou.ok);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(150);
    // Serveur 1 déplacé à la main vers Calcaire, puis index redécouvert (rechargement)
    await p.evaluate(function (id) { window.PlanRegistry.setPlanFolder(id, "calcaire", "user"); }, idx1.s1.id);
    await p.close();
    p = await ouvrir(ctx, { index: INDEX_DOSSIERS });
    await p.waitForTimeout(800);
    const idx2 = await p.evaluate(function (id) { const s1 = window.PlanRegistry.findById(id); return { fid: s1.folderId, src: s1.folderSrc }; }, idx1.s1.id);
    t("🩸 après redécouverte, le plan déplacé à la main RESTE dans Calcaire (l'index ne le reprend pas)", idx2.fid === "calcaire" && idx2.src === "user");
    await p.close();
    p = await ouvrir(ctx, { index: { folders: [INDEX_DOSSIERS.folders[0]], plans: INDEX_DOSSIERS.plans } });
    await p.waitForTimeout(800);
    const idx3 = await p.evaluate(function () { const c = window.PlanRegistry.findFolder("calcaire"); return c ? c.src : "absent"; });
    t("l'index ne déclare plus Calcaire → dossier LIBÉRÉ (src user), toujours là", idx3 === "user");
    await ctx.close();

    // ── 5. Mobile 400 px : repli par dossier ──
    ctx = await nav.newContext({ serviceWorkers: "block", viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(function (ls) { for (const k in ls) if (!localStorage.getItem(k)) localStorage.setItem(k, ls[k]); }, Object.assign({ myktamap_plans: registre(12) }, LS));
    p = await ouvrir(ctx);
    await p.evaluate(function () { const PR = window.PlanRegistry; const f = PR.createFolder("Grand"); for (let i = 1; i <= 8; i++) PR.setPlanFolder("local_p" + i, f.id, "user"); PR.setFolderCollapsed(f.id, false); PR.setPlansView("folders"); window.refreshPlansList(); });
    await p.waitForTimeout(200);
    const mob = await p.evaluate(function () {
      const rows = document.querySelector(".kta-plans-folder-rows:not([hidden])");
      const visibles = Array.from(rows.querySelectorAll(".plan-row")).filter(function (r) { return r.getBoundingClientRect().height > 0; }).length;
      return { visibles: visibles, bouton: !!rows.querySelector(".kta-plans-folder-more"), draggable: document.querySelectorAll(".plan-row[draggable]").length,
               boutonGlobal: !!document.getElementById("kta-home-plans-more") };
    });
    t("mobile : un dossier de 8 plans déplié montre 5 lignes + « Tout le dossier », et AUCUNE ligne n'est draggable au doigt",
      mob.visibles === 5 && mob.bouton && mob.draggable === 0);
    t("🩸 mobile : le bouton global « Tous mes plans » du mode TOUT ne survit PAS au passage en Dossiers", !mob.boutonGlobal);
    // 🩸 cocher un plan après « Tout le dossier » re-rend la liste : le dossier ne doit pas se replier
    await p.click("#loaderPlansSelect");
    await p.click(".kta-plans-folder-rows:not([hidden]) .kta-plans-folder-more");
    await p.waitForTimeout(150);
    const avantCoche = await p.evaluate(function () { const rows = document.querySelector(".kta-plans-folder-rows:not([hidden])"); return Array.from(rows.querySelectorAll(".plan-row")).filter(function (r) { return r.getBoundingClientRect().height > 0; }).length; });
    await p.click('.plan-row[data-id="local_p7"]');
    await p.waitForTimeout(200);
    const apresCoche = await p.evaluate(function () {
      const rows = document.querySelector(".kta-plans-folder-rows:not([hidden])");
      return { visibles: Array.from(rows.querySelectorAll(".plan-row")).filter(function (r) { return r.getBoundingClientRect().height > 0; }).length,
               coche: !!document.querySelector('.plan-row[data-id="local_p7"].kta-plan-row-selected') };
    });
    t("🩸 mobile : « Tout le dossier » puis cocher un plan → le plan est coché ET le dossier RESTE déplié (" + avantCoche + " → " + apresCoche.visibles + " lignes)",
      avantCoche === 8 && apresCoche.visibles === 8 && apresCoche.coche);
    await p.click("#loaderPlansSelectDone");

    // Glisser tactile par appui long : local_p10 (non classé) → en-tête « Grand »
    const tactile = await p.evaluate(async function () {
      const row = document.querySelector('.plan-row[data-id="local_p10"]');
      const head = document.querySelector('.kta-plans-folder-head[data-folder]:not([data-folder=""])');
      if (!row || !head) return { erreur: "ligne ou en-tête introuvable" };
      const r = row.getBoundingClientRect(), h = head.getBoundingClientRect();
      const touche = function (el, type, x, y) {
        const t0 = new Touch({ identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
        el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [t0], changedTouches: [t0] }));
      };
      const x0 = r.left + 30, y0 = r.top + r.height / 2;
      // 1) un doigt qui BOUGE tout de suite = défilement, rien ne se soulève
      touche(row, "touchstart", x0, y0); touche(row, "touchmove", x0, y0 + 30);
      await new Promise(function (ok) { setTimeout(ok, 600); });
      const souleveTrop = !!document.querySelector(".kta-plans-drag-ghost");
      touche(row, "touchend", x0, y0 + 30);
      // 2) appui long immobile → la ligne se soulève → déplacement sur l'en-tête → dépôt
      touche(row, "touchstart", x0, y0);
      await new Promise(function (ok) { setTimeout(ok, 600); });
      const souleve = !!document.querySelector(".kta-plans-drag-ghost");
      const h2 = head.getBoundingClientRect();   // relu après le soulèvement (le contenu peut avoir bougé)
      touche(row, "touchmove", h2.left + h2.width / 2, h2.top + h2.height / 2);
      const cibleSurlignee = head.classList.contains("kta-drop-cible");
      touche(row, "touchend", h2.left + h2.width / 2, h2.top + h2.height / 2);
      await new Promise(function (ok) { setTimeout(ok, 200); });
      const pl = window.PlanRegistry.findById("local_p10");
      return { souleveTrop: souleveTrop, souleve: souleve, cibleSurlignee: cibleSurlignee, range: pl.folderId === head.dataset.folder, fantomeRestant: !!document.querySelector(".kta-plans-drag-ghost") };
    });
    if (tactile.erreur) console.log("   " + tactile.erreur);
    t("📱 un doigt qui bouge tout de suite fait DÉFILER (rien ne se soulève)", tactile.souleveTrop === false);
    t("📱 appui long → la ligne se soulève, l'en-tête survolé se surligne, le dépôt range le plan, le fantôme disparaît",
      tactile.souleve && tactile.cibleSurlignee && tactile.range && !tactile.fantomeRestant);
    // Pendant le geste : pas de double de la ligne, et le bord bas fait défiler
    const bords = await p.evaluate(async function () {
      const row = document.querySelector('.plan-row[data-id="local_p11"]');
      if (!row) return { erreur: "local_p11 introuvable" };
      const r = row.getBoundingClientRect();
      const touche = function (el, type, x, y) {
        const t0 = new Touch({ identifier: 2, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
        el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [t0], changedTouches: [t0] }));
      };
      // le conteneur qui défile autour de la ligne, comme _trouverScroller de l'app
      let sc = row.parentElement;
      while (sc && sc !== document.body) {
        const cs = getComputedStyle(sc);
        if (/(auto|scroll)/.test(cs.overflowY) && sc.scrollHeight > sc.clientHeight + 4) break;
        sc = sc.parentElement;
      }
      if (!sc || sc === document.body) sc = document.scrollingElement;
      const x0 = r.left + 30, y0 = r.top + r.height / 2;
      touche(row, "touchstart", x0, y0);
      await new Promise(function (ok) { setTimeout(ok, 600); });
      const empreinte = row.classList.contains("kta-plan-row-empreinte") && parseFloat(getComputedStyle(row).opacity) < 0.3;
      const avant = sc.scrollTop;
      touche(row, "touchmove", x0, window.innerHeight - 6);   // doigt collé au bord bas
      await new Promise(function (ok) { setTimeout(ok, 450); });
      const apres = sc.scrollTop;
      // 🩸 le défilement auto doit s'arrêter à la fin de la liste, sinon il file vers la Vue OSM
      await new Promise(function (ok) { setTimeout(ok, 1500); });
      const estPage = (sc === document.scrollingElement);
      const bas = estPage ? window.innerHeight : sc.getBoundingClientRect().bottom;
      const finListe = document.getElementById("allPlansList").getBoundingClientRect().bottom;
      touche(row, "touchend", x0, window.innerHeight - 6);   // relâché hors dossier : rien ne bouge
      await new Promise(function (ok) { setTimeout(ok, 100); });
      const TOLERANCE = 16;   // une image de défilement au plus
      return { empreinte: empreinte, defile: apres > avant, peutDefiler: sc.scrollHeight > sc.clientHeight + 10,
               borne: finListe >= bas - TOLERANCE, finListe: Math.round(finListe), bas: Math.round(bas),
               fantome: !!document.querySelector(".kta-plans-drag-ghost"), range: !!window.PlanRegistry.findById("local_p11").folderId };
    });
    if (bords.erreur) console.log("   " + bords.erreur);
    t("📱 pendant le geste, la ligne d'origine n'est qu'une empreinte (pas de double)", bords.empreinte === true);
    t("📱 doigt au bord bas → la page DÉFILE pendant le glisser" + (bords.peutDefiler ? "" : " (page non défilable ici : contrôle neutre)"), bords.defile || !bords.peutDefiler);
    if (!bords.borne) console.log("   fin de liste à " + bords.finListe + " px, bord bas du conteneur à " + bords.bas + " px");
    t("📱 …et S'ARRÊTE quand la fin de « Mes plans » est visible (jamais au-delà, vers la Vue OSM)", bords.borne === true);
    t("📱 relâcher hors dossier : rien n'est rangé, le fantôme est retiré", !bords.range && !bords.fantome);
    await ctx.close();
  } catch (e) {
    console.error("\n❌ checkup impossible : " + e.message);
    if (nav) await nav.close();
    server.close();
    process.exit(2);
  }
  await nav.close();
  server.close();
  if (!echecs.length) { console.log("\n🎉 dossiers : hauteur tenue, index proposé, utilisateur maître, glisser souris et appui long"); process.exit(0); }
  console.log("\n💥 dossiers : " + echecs.length + " contrôle(s) en échec");
  process.exit(1);
})();
