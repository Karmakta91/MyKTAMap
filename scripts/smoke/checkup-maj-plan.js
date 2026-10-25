#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-maj-plan.js — checkup (Playwright, pas un hook pré-commit) : assistant « Mettre à jour le plan »
// =====================================================================
// Parcours réel sur le relevé fictif de l'index, rendu LOCAL (son ZIP est construit dans la page puis importé) :
// un calque ouvert à la modification et corrigé (un tracé supprimé), deux objets dessinés à la main (un point,
// un tracé) ; assistant : le calque coché, les points vers un NOUVEAU calque, les tracés vers le calque corrigé ;
// Générateur prérempli, génération en tuilage V2 : refusée une fois à la confirmation (plan intact), puis acceptée
// (plan fermé, session enregistrée) ; le ZIP téléchargé est relu (calque remplacé, objets versés, nouveau calque) ;
// « Remplacer le plan dans l'app » rouvre le plan, puis propose le retrait. Attendu : même entrée du registre, nouveau calque
// affiché, plus de copie ni d'objet versé dans la session, traces datées sous le fichier, et tout cela tient au
// rechargement de la page.
// 🩸 check-maj-plan.js exécute les fonctions dans un `vm` ; seul ce parcours voit le Générateur, le ZIP réel et le
// rechargement du plan.
// Usage : node scripts/smoke/checkup-maj-plan.js (SMOKE_PORT pour une autre copie) · doc : plans-loader.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};
const NOM_NOUVEAU = "Ajouts du checkup";

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

async function cliquerOuiConfirm(page) {
  await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 10000);
  await page.waitForTimeout(600);   // garde anti-double-clic de ktaConfirm
  await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 }, acceptDownloads: true });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  const journal = [];
  page.on("console", function (m) { if (/\[(Planner|MajPlan)/.test(m.text())) journal.push(m.text().slice(0, 200)); });
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await accueil(page);

    // ── 0. Le relevé fictif devient un plan LOCAL : ZIP construit depuis son dossier, importé et gardé ──
    const ouvert = await page.evaluate(async function () {
      const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
      if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
      const cfgTxt = await (await fetch(srv.path + "/plan-config.json")).text();
      const cfg = JSON.parse(cfgTxt);
      const zip = new JSZip();
      zip.file("plan-config.json", cfgTxt);
      const chemins = [cfg.plan.baseImage, cfg.plan.collisionImage]
        .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
        .concat(Object.keys(cfg.icons || {}).map(function (k) { return cfg.icons[k]; }))
        .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
      const manquants = [];
      for (const p of Array.from(new Set(chemins))) {
        // Même résolution que le chargement d'un plan du site (config.js > resolveServerPath).
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob()); else manquants.push(p.split(".").pop());
      }
      window.__ktaCheckupManquants = { n: manquants.length, ext: manquants, base: String(cfg.plan.baseImage || "").split(".").pop() };
      const blob = await zip.generateAsync({ type: "blob" });
      await window.chargerZipFichier(new File([blob], "fictif.zip", { type: "application/zip" }), "auto", { storeBlob: true });
      return { ok: true };
    });
    if (!ouvert.ok) throw new Error(ouvert.raison);
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.CalqueSession && !!window._currentLoadedPlanId; }, 30000);
    await page.waitForTimeout(2500);
    const depart = await page.evaluate(function () {
      const e = window.PlanRegistry.findById(window._currentLoadedPlanId);
      return { id: e.id, type: e.type, garde: !!e.storedBlob, calques: (window.PLAN_CONFIG.dataLayers || []).length };
    });
    verifier(depart.type === "local" && depart.garde, "relevé fictif importé en plan local, archive gardée", depart);

    // ── 1. Un calque en modification, corrigé ; deux objets dessinés à la main ──
    const prep = await page.evaluate(async function () {
      const CS = window.CalqueSession;
      const ids = (window.PLAN_CONFIG.dataLayers || []).filter(function (d) { return d.id !== "editor" && d.file; }).map(function (d) { return d.id; });
      let cible = null;
      for (const id of ids) {
        const r = await fetch(window.PLAN_CONFIG.dataLayers.find(function (d) { return d.id === id; }).file).then(function (x) { return x.json(); });
        if (Array.isArray(r.roads) && r.roads.length >= 2) { cible = id; break; }
      }
      if (!cible) return { ok: false, raison: "aucun calque à deux tracés" };
      const rr = await CS.rapatrier(cible);
      if (!rr.ok) return { ok: false, raison: "rapatriement " + rr.code };
      // Correction : un tracé copié supprimé.
      const routes = window.getRoads();
      const supprime = routes.find(function (o) { return o._srcCalque === cible; });
      window.setRoads(routes.filter(function (o) { return o !== supprime; }));
      // Dessins à la main (uid posés par KtaUid, comme l'éditeur).
      const K = window.KtaUid;
      const pt = { x: 100, y: 120, nom: "point du checkup", tags: ["pa"] };
      const rd = { type: "principal", points: [{ x: 10, y: 10 }, { x: 60, y: 40 }] };
      K.ensure(pt, "pt"); K.touch(pt); K.ensure(rd, "rd"); K.touch(rd);
      window.setEditorPoints((window.getEditorPoints() || []).concat([pt]));
      window.setRoads(window.getRoads().concat([rd]));
      await window.SessionPersist.save({ force: true });
      return { ok: true, cible: cible, supprime: supprime.uid, copiesRoutes: rr.stats.roads, pt: pt.uid, rd: rd.uid };
    });
    if (!prep.ok) throw new Error(prep.raison);
    ok("calque « " + prep.cible + " » en modification (un tracé supprimé), un point et un tracé dessinés");

    // ── 2. L'assistant : étapes 1 et 2 ──
    const ouvre = await page.evaluate(function () { return window.MajPlan.ouvrir(); });
    await attendre(page, function () { return !!document.getElementById("kta-maj-plan"); }, 5000);
    const etapes = await page.evaluate(function (a) {
      const ov = document.getElementById("kta-maj-plan");
      const cb = ov.querySelector('[data-maj-calque="' + a.cible + '"]');
      const sels = Array.prototype.slice.call(ov.querySelectorAll("[data-maj-groupe]"));
      const titre = function (s) { return s.closest(".kta-maj-groupe").querySelector(".kta-maj-groupe-titre").textContent; };
      let points = null, routes = null;
      sels.forEach(function (s) {
        const opts = Array.prototype.map.call(s.options, function (o) { return o.value; });
        if (opts.indexOf("c:" + a.cible) < 0) return;
        if (/Points/.test(titre(s))) points = s; else if (/Tracés/.test(titre(s))) routes = s;
      });
      if (!cb || !cb.checked || !points || !routes) return { ok: false, cb: !!cb, n: sels.length, points: !!points, routes: !!routes };
      points.value = "n"; points.dispatchEvent(new Event("change", { bubbles: true }));
      const nom = ov.querySelector('[data-maj-nom="' + points.getAttribute("data-maj-groupe") + '"]');
      nom.value = a.nom;
      routes.value = "c:" + a.cible; routes.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, groupes: sels.length };
    }, { cible: prep.cible, nom: NOM_NOUVEAU });
    verifier(ouvre === true && etapes.ok, "assistant ouvert : calque coché d'office, groupes points et tracés présents", etapes);
    await page.evaluate(function () { document.getElementById("kta-maj-suivant").click(); });

    // ── 3. Générateur prérempli ──
    await attendre(page, function () {
      const s = document.getElementById("kta-planner-zip-status");
      return !!s && document.querySelectorAll(".kta-planner-layer-maj").length > 0;
    }, 30000);
    const gen = await page.evaluate(function (cible) {
      const lignes = Array.prototype.slice.call(document.querySelectorAll("#pl_dataLayers_list .kta-planner-layer-item"));
      const ids = lignes.map(function (it) { return document.getElementById(it.dataset.layerId + "_id").value; });
      const maj = lignes.filter(function (it) { return it.classList.contains("kta-planner-layer-maj"); })
        .map(function (it) { return document.getElementById(it.dataset.layerId + "_id").value; });
      return { ids: ids, maj: maj, nom: document.getElementById("pl_name").value.length > 0,
               photos: !!document.getElementById("pl_photos").checked, cible: maj.indexOf(cible) >= 0 };
    }, prep.cible);
    verifier(gen.cible && gen.maj.length === 2 && gen.nom, "Générateur ouvert en mode Modifier, déjà rempli (calque remplacé + nouveau calque)", gen);
    const idNouveau = gen.maj.find(function (id) { return id !== prep.cible; });

    // ── 4. Génération en tuilage V2 : le plan ouvert est fermé d'abord (confirmation), puis ZIP relu ──
    const carteVivante = function () { return page.evaluate(function () { return !!(window.L && window.map instanceof window.L.Map); }); };
    await page.evaluate(function () { const c = document.getElementById("pl_tilingV2"); if (c && !c.checked) c.click(); });
    // 4a. « Garder le plan ouvert » : rien ne change, rien n'est généré.
    await page.evaluate(function () { document.getElementById("kta-planner-generer").click(); });
    await attendre(page, function () { return !!document.getElementById("kta-confirm-non"); }, 10000);
    await page.waitForTimeout(600);
    await page.evaluate(function () { document.getElementById("kta-confirm-non").click(); });
    await page.waitForTimeout(1500);
    const garde = await page.evaluate(function (id) {
      return { id: window._currentLoadedPlanId === id, affiche: window.ktaPlanAffiche(),
               generateur: !!document.getElementById("kta-planner-modal"), fin: !!document.getElementById("kta-maj-fin"),
               bouton: !document.getElementById("kta-planner-generer").disabled };
    }, depart.id);
    verifier(garde.id && garde.affiche && garde.generateur && !garde.fin && garde.bouton && await carteVivante(),
      "génération refusée à la confirmation : plan toujours ouvert, Générateur intact, rien de généré", garde);
    // 4b. « Fermer et générer » : la session est enregistrée, le plan démonté, l'accueil affiché.
    await page.evaluate(function () { document.getElementById("kta-planner-generer").click(); });
    await cliquerOuiConfirm(page);
    await attendre(page, function () { return document.body.classList.contains("kta-loader-active"); }, 15000);
    const ferme = await page.evaluate(function (a) {
      const s = window.SessionPersist.getSaved(a.id) || {};
      const uids = [].concat(s.editorPoints || [], s.roads || []).map(function (o) { return o && o.uid; });
      return { accueil: !window.ktaPlanAffiche(), pt: uids.indexOf(a.pt) >= 0, rd: uids.indexOf(a.rd) >= 0 };
    }, { id: depart.id, pt: prep.pt, rd: prep.rd });
    verifier(ferme.accueil && !(await carteVivante()) && ferme.pt && ferme.rd,
      "plan fermé avant le tuilage (carte démontée, accueil), session enregistrée avec les objets dessinés", ferme);
    try { await attendre(page, function () { return !!document.getElementById("kta-maj-fin"); }, 60000); }
    catch (e) {
      const err = await page.evaluate(function () {
        const el = document.getElementById("kta-planner-erreur");
        return el ? el.textContent : "(pas de Générateur)";
      });
      const m = await page.evaluate(function () { return JSON.stringify(window.__ktaCheckupManquants); });
      throw new Error("génération sans suite — fichiers non trouvés : " + m + " — erreur du Générateur : " + err + " · console : " + journal.slice(-5).join(" | "));
    }
    const boutons = await page.evaluate(function () {
      return Array.prototype.map.call(document.querySelectorAll("#kta-maj-fin [data-maj-fin]"), function (b) { return b.getAttribute("data-maj-fin"); });
    });
    verifier(boutons.indexOf("telecharger") >= 0 && boutons.indexOf("remplacer") >= 0 && boutons.indexOf("publier") < 0,
      "plan local : « Télécharger » et « Remplacer dans l'app », pas de publication", boutons);
    const noteFerme = await page.evaluate(function () {
      return document.getElementById("kta-maj-fin").textContent.indexOf(window.I18n.t("maj.fin.planFermeRouvre")) >= 0;
    });
    verifier(noteFerme, "fin de l'assistant : il dit que le plan a été fermé et comment le retrouver");
    const [dl] = await Promise.all([
      page.waitForEvent("download", { timeout: 15000 }),
      page.evaluate(function () { document.querySelector('#kta-maj-fin [data-maj-fin="telecharger"]').click(); })
    ]);
    const b64 = fs.readFileSync(await dl.path()).toString("base64");
    const zipLu = await page.evaluate(async function (a) {
      const z = await JSZip.loadAsync(Uint8Array.from(atob(a.b64), function (c) { return c.charCodeAt(0); }));
      const cfg = JSON.parse(await z.file("plan-config.json").async("string"));
      const lc = cfg.dataLayers.find(function (d) { return d.id === a.cible; });
      const ln = cfg.dataLayers.find(function (d) { return d.id === a.nouveau; });
      const jc = JSON.parse(await z.file(lc.file).async("string"));
      const jn = ln ? JSON.parse(await z.file(ln.file).async("string")) : null;
      const uids = function (arr) { return (arr || []).map(function (o) { return o.uid; }); };
      return {
        nouveauDeclare: !!ln && ln.label === a.nom,
        supprimeAbsent: uids(jc.roads).indexOf(a.supprime) < 0,
        routesCalque: (jc.roads || []).length, attendu: a.copies - 1 + 1,
        rdVerse: uids(jc.roads).indexOf(a.rd) >= 0,
        ptVerse: !!jn && uids(jn.data).indexOf(a.pt) >= 0,
        marques: JSON.stringify(jc).indexOf("_srcCalque") >= 0
      };
    }, { b64: b64, cible: prep.cible, nouveau: idNouveau, nom: NOM_NOUVEAU, supprime: prep.supprime, rd: prep.rd, pt: prep.pt,
         copies: prep.copiesRoutes });
    verifier(zipLu.supprimeAbsent && zipLu.rdVerse && zipLu.routesCalque === zipLu.attendu && !zipLu.marques,
      "ZIP : le calque est remplacé (tracé supprimé absent, tracé dessiné versé, aucune marque de session)", zipLu);
    verifier(zipLu.nouveauDeclare && zipLu.ptVerse, "ZIP : nouveau calque déclaré dans plan-config, le point dessiné dedans", zipLu);

    // ── 5. Remplacer dans l'app, avec le retrait proposé ──
    const T0 = Date.now();
    await page.evaluate(function () { document.querySelector('#kta-maj-fin [data-maj-fin="remplacer"]').click(); });
    await cliquerOuiConfirm(page);
    await attendre(page, function () {
      return !!window.PLAN_CONFIG && (window.PLAN_CONFIG.dataLayers || []).some(function (d) { return d.label === "Ajouts du checkup"; });
    }, 30000);
    await page.waitForTimeout(2500);
    const etat = async function () {
      return page.evaluate(function (a) {
        const tous = [].concat(window.getEditorPoints() || [], window.getRoads() || []);
        const tombes = (window.KtaUid.getTombstones() || []).filter(function (x) { return x.uid === a.pt || x.uid === a.rd; });
        const g = window.dataLayerGroups || {};
        const n = function (id) { let k = 0; if (g[id]) g[id].eachLayer(function () { k++; }); return k; };
        return {
          id: window._currentLoadedPlanId,
          nouveauAffiche: !!g[a.nouveau] && window.map.hasLayer(g[a.nouveau]) && n(a.nouveau) > 0,
          cibleAffiche: !!g[a.cible] && window.map.hasLayer(g[a.cible]),
          enModification: window.CalqueSession.estRapatrie(a.cible),
          copies: tous.filter(function (o) { return o && o._srcCalque; }).length,
          versesEnSession: tous.filter(function (o) { return o && (o.uid === a.pt || o.uid === a.rd); }).length,
          traces: tombes.map(function (x) { return x.deletedAt; })
        };
      }, { cible: prep.cible, nouveau: idNouveau, pt: prep.pt, rd: prep.rd });
    };
    const apres = await etat();
    verifier(apres.id === depart.id, "même entrée du registre (session, calage et photos restent attachés)", apres.id === depart.id);
    verifier(apres.nouveauAffiche && apres.cibleAffiche && !apres.enModification,
      "nouvelle version chargée : nouveau calque affiché, calque corrigé rendu et affiché", apres);
    verifier(apres.copies === 0 && apres.versesEnSession === 0, "session : plus de copie, plus d'objet versé (aucun doublon)", apres);
    verifier(apres.traces.length === 2 && apres.traces.every(function (d) { return d < Date.now() && d >= T0 - 600000; }),
      "traces de suppression posées pour les deux objets versés", apres.traces);

    // ── 6. Rechargement complet de la page : tout tient ──
    await accueil(page);
    await page.evaluate(function (id) { return window.chargerPlanDuRegistre(id); }, depart.id);
    await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.CalqueSession; }, 30000);
    await page.waitForTimeout(3000);
    const rouvert = await etat();
    verifier(rouvert.nouveauAffiche && !rouvert.enModification && rouvert.copies === 0 && rouvert.versesEnSession === 0,
      "page rechargée : l'archive gardée est la nouvelle version, la session reste propre", rouvert);
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
  console.log("🎉 CHECKUP VERT — mise à jour du plan : de la session au ZIP, puis remplacement dans l'app");
})();
