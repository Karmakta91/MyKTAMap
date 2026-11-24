#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-plan-hd.js — checkup (Playwright, pas un hook pré-commit) : « Régénérer en haute résolution »
// =====================================================================
// Parcours réel sur le relevé fictif de l'index, rendu LOCAL (son ZIP est construit dans la page puis importé),
// calage posé dans les Réglages, une photo et trois objets dessinés à la main (point avec point précis, tracé, pilier
// à bras). Passe 1, ×2 fond uni, ancien scan gardé, session comprise : bouton de l'Éditeur de données → fenêtre →
// Générateur prérempli → ZIP téléchargé et relu (dimensions, calage, px/m, départ, chaque couple { x, y } de chaque
// calque exactement ×2, objets de session présents, scan déclaré, image unie aux bonnes dimensions) → « Ajouter à
// mes plans » : nouvelle entrée du registre, ancien plan et son archive inchangés, scan affiché sur toute l'emprise,
// photo rattachée ; page rechargée, nouveau plan rouvert sans erreur. Passe 2, ×2 fond rendu : image peinte (des
// pixels hors du fond). Refus au-delà du plafond : dimensions et appareil simulés dans la fenêtre.
// 🩸 check-plan-hd.js éprouve le calcul dans un vm ; seul ce parcours voit le Générateur, le rendu et le chargement.
// Usage : node scripts/smoke/checkup-plan-hd.js (SMOKE_PORT pour une autre copie) · doc : plans-loader.md
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
  "myktamap_tutorial_seen_v1": "1"
};

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

async function planOuvert(page) {
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.CalqueSession && !!window._currentLoadedPlanId &&
      window.ktaPlanAffiche();
  }, 30000);
  await page.waitForTimeout(2500);
}

// ZIP téléchargé → base64 (relu dans la page par JSZip).
async function telecharger(page, selecteur) {
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.evaluate(function (s) { document.querySelector(s).click(); }, selecteur)
  ]);
  return fs.readFileSync(await dl.path()).toString("base64");
}

// Fenêtre → Générateur → fin. `choix` : { k, fond, couleur }.
async function parcours(page, choix, journal) {
  await page.evaluate(function () { window.ouvrirTableEditor(); });
  await attendre(page, function () { return !!document.getElementById("kta-tbl-src-hd"); }, 10000);
  await page.evaluate(function () { document.getElementById("kta-tbl-src-hd").click(); });
  await attendre(page, function () { return !!document.getElementById("kta-plan-hd"); }, 10000);
  const fen = await page.evaluate(function (c) {
    const ov = document.getElementById("kta-plan-hd");
    const r = ov.querySelector('input[name="kta-planhd-k"][value="' + c.k + '"]');
    const f = ov.querySelector('input[name="kta-planhd-fond"][value="' + c.fond + '"]');
    if (!r || r.disabled || !f) return { ok: false, r: !!r, dis: r && r.disabled, f: !!f };
    r.checked = true; f.checked = true;
    ov.querySelector("#kta-planhd-couleur").value = c.couleur;
    const box = ov.querySelector(".kta-readme-modal-boite").getBoundingClientRect();
    return { ok: true, visible: box.width > 100 && box.height > 100,
             scan: !!ov.querySelector("#kta-planhd-scan:checked"), session: !!ov.querySelector("#kta-planhd-session:checked"),
             lignes: ov.querySelectorAll('input[name="kta-planhd-k"]').length };
  }, choix);
  if (!fen.ok) throw new Error("fenêtre : facteur ou fond introuvable " + JSON.stringify(fen));
  await page.evaluate(function () { document.getElementById("kta-planhd-suivant").click(); });
  try {
    await attendre(page, function () {
      const s = document.getElementById("kta-planner-zip-status");
      return !!s && s.textContent.indexOf(window.I18n.t("planhd.gen.statut", { k: 2, w: "", h: "" }).slice(0, 12)) >= 0;
    }, 60000);
  } catch (e) {
    const err = await page.evaluate(function () {
      const el = document.getElementById("kta-planhd-erreur");
      const s = document.getElementById("kta-planner-zip-status");
      return (el ? el.textContent : "") + " | statut : " + (s ? s.textContent : "(pas de Générateur)");
    });
    throw new Error("Générateur non prérempli — " + err + " · " + journal.slice(-4).join(" | "));
  }
  const gen = await page.evaluate(function () {
    return { nom: document.getElementById("pl_name").value, w: document.getElementById("pl_width").value,
             h: document.getElementById("pl_height").value, photos: !!document.getElementById("pl_photos").checked,
             scale: document.getElementById("pl_scale").value, v2: !!document.getElementById("pl_tilingV2").checked };
  });
  await page.evaluate(function () { document.getElementById("kta-planner-generer").click(); });
  // Tuilage V2 (au-delà de 4096² px) : le Générateur demande d'abord de fermer le plan ouvert.
  if (gen.v2) {
    await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 15000);
    await page.waitForTimeout(600);   // garde anti-double-clic de ktaConfirm
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
  }
  try { await attendre(page, function () { return !!document.getElementById("kta-plan-hd-fin"); }, 300000); }
  catch (e) {
    const err = await page.evaluate(function () { const el = document.getElementById("kta-planner-erreur"); return el ? el.textContent : "?"; });
    throw new Error("génération sans suite — " + err + " · " + journal.slice(-4).join(" | "));
  }
  return { fen: fen, gen: gen };
}

// Relit le ZIP produit et le compare à l'archive du plan d'origine (relue dans la page).
async function relire(page, b64, a) {
  return page.evaluate(async function (a) {
    const z = await JSZip.loadAsync(Uint8Array.from(atob(a.b64), function (c) { return c.charCodeAt(0); }));
    const cfg = JSON.parse(await z.file("plan-config.json").async("string"));
    const zo = await JSZip.loadAsync(await window.PlanRegistry.getBlob(a.ancien));
    const cfgO = JSON.parse(await zo.file("plan-config.json").async("string"));
    const couples = function (o, chemin, out) {
      if (!o || typeof o !== "object") return out;
      if (typeof o.x === "number" && typeof o.y === "number") out.push({ c: chemin, x: o.x, y: o.y });
      Object.keys(o).forEach(function (k) { couples(o[k], chemin + "." + k, out); });
      return out;
    };
    const calques = [];
    for (const d of cfgO.dataLayers.filter(function (x) { return x.id !== "editor"; })) {
      const avant = JSON.parse(await zo.file(d.file).async("string"));
      const dn = cfg.dataLayers.find(function (x) { return x.id === d.id; });
      const apres = dn ? JSON.parse(await z.file(dn.file).async("string")) : null;
      // Aucun calque en modification ici : chaque couple { x, y } du fichier, où qu'il soit, dans le même ordre.
      const ca = couples(avant, "", []), cb = apres ? couples(apres, "", []) : [];
      const faux = [];
      cb.forEach(function (p, i) {
        const r = ca[i];
        if (!r || r.c !== p.c || p.x !== r.x * 2 || p.y !== r.y * 2) faux.push(p.c);
      });
      calques.push({ id: d.id, declare: !!dn, avant: ca.length, apres: cb.length, compares: cb.length, faux: faux.slice(0, 3) });
    }
    const session = cfg.dataLayers.find(function (x) { return x.label === window.I18n.t("planhd.calqueSession"); });
    const js = session ? JSON.parse(await z.file(session.file).async("string")) : {};
    const tous = [].concat(js.data || [], js.roads || [], js.structures || []);
    const pt = tous.find(function (o) { return o.uid === a.pt.uid; });
    const rd = tous.find(function (o) { return o.uid === a.rd.uid; });
    const st = tous.find(function (o) { return o.uid === a.st.uid; });
    const scan = (cfg.imageLayers || []).find(function (l) { return l.id === window.KtaPlanHD.ID_SCAN; });
    const img = z.file(cfg.plan.baseImage);
    let pixels = null;
    if (img) {
      const bmp = await createImageBitmap(await img.async("blob"));
      const cv = document.createElement("canvas");
      cv.width = bmp.width; cv.height = bmp.height;
      const ctx = cv.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      let hors = 0;
      for (let i = 0; i < d.length; i += 4 * 97) {
        if (d[i] !== 255 || d[i + 1] !== 255 || d[i + 2] !== 255 || d[i + 3] !== 255) hors++;
      }
      pixels = { w: bmp.width, h: bmp.height, hors: hors };
      cv.width = 0;
    }
    const g = cfg.plan.georef || {}, gr = a.georef;
    return {
      nom: cfg.plan.name, w: cfg.plan.imageWidth, h: cfg.plan.imageHeight, wO: cfgO.plan.imageWidth, hO: cfgO.plan.imageHeight,
      echelle: cfg.tracking.scale, echelleO: a.echelle,
      depart: [cfg.tracking.startX, cfg.tracking.startY], departO: a.depart,
      calage: !!g.pointA && g.pointA.x === gr.pointA.x * 2 && g.pointA.y === gr.pointA.y * 2 && g.pointB.x === gr.pointB.x * 2 &&
        g.pointB.y === gr.pointB.y * 2 && g.pointA.lat === gr.pointA.lat && g.pointB.lng === gr.pointB.lng,
      calques: calques,
      pt: pt ? { x: pt.x, y: pt.y, px: pt.precis && pt.precis.x } : null,
      rd: rd ? rd.points.map(function (p) { return [p.x, p.y]; }) : null,
      st: st ? st.points.map(function (p) { return [p.x, p.y]; }) : null,
      scan: scan ? { file: scan.file, present: !!z.file(scan.file), cal: !!scan.calibration } : null,
      pixels: pixels, tiles: Object.keys(z.files).filter(function (n) { return /^data\/tiles\//.test(n); }).length,
      photos: !!z.file("data/photos/_index.json")
    };
  }, Object.assign({ b64: b64 }, a));
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 }, acceptDownloads: true });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  const journal = [];
  page.on("console", function (m) { if (/\[(Planner|PlanHD|MajPlan|Loader)/.test(m.text())) journal.push(m.text().slice(0, 200)); });
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await accueil(page);

    // ── 0. Relevé fictif en plan LOCAL, calage des Réglages, objets dessinés, une photo ──
    const ouvert = await page.evaluate(async function () {
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
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob());
      }
      const blob = await zip.generateAsync({ type: "blob" });
      await window.chargerZipFichier(new File([blob], "fictif.zip", { type: "application/zip" }), "auto", { storeBlob: true });
      return { ok: true };
    });
    if (!ouvert.ok) throw new Error(ouvert.raison);
    await planOuvert(page);
    const depart = await page.evaluate(async function () {
      const id = window._currentLoadedPlanId;
      const pc = window.PLAN_CONFIG.plan;
      const W = pc.imageWidth, H = pc.imageHeight;
      const georef = { pointA: { x: Math.round(W * 0.1), y: Math.round(H * 0.9), lat: 45.5, lng: 1.5 },
                       pointB: { x: Math.round(W * 0.9), y: Math.round(H * 0.1), lat: 45.501, lng: 1.502 }, modele: "local" };
      window.KmzExport.setCalibration(id, georef);
      const K = window.KtaUid;
      const pt = { x: Math.round(W / 3) + 0.25, y: Math.round(H / 3) + 0.5, nom: "point du checkup HD", tags: ["info"],
                   precis: { x: Math.round(W / 3) + 3, y: Math.round(H / 3) + 4 } };
      const rd = { type: "principal", points: [{ x: 10.5, y: 12 }, { x: 60, y: 40.75 }] };
      const st = { type: "pilier-bras", points: [{ x: 100, y: 100 }, { x: 104.9, y: 100 }, { x: 104.9, y: 104.9 }, { x: 100, y: 104.9 }] };
      K.ensure(pt, "pt"); K.touch(pt); K.ensure(rd, "rd"); K.touch(rd); K.ensure(st, "st"); K.touch(st);
      window.setEditorPoints((window.getEditorPoints() || []).concat([pt]));
      window.setRoads((window.getRoads() || []).concat([rd]));
      window.setStructures((window.getStructures() || []).concat([st]));
      await window.SessionPersist.save({ force: true });
      // Photo du point (pixel PNG fabriqué ici).
      const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
      cv.getContext("2d").fillRect(0, 0, 8, 8);
      const png = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
      let photo = null;
      try { photo = { id: await window.MyKTAMapPhotos.addPhoto(id, pt.uid, png) }; } catch (e) { photo = { err: e.message }; }
      const e = window.PlanRegistry.findById(id);
      const b = await window.PlanRegistry.getBlob(id);
      return { id: id, type: e.type, entree: JSON.stringify(Object.assign({}, e, { lastOpened: null })), taille: b.size,
               cfg: await (await JSZip.loadAsync(b)).file("plan-config.json").async("string"),
               georef: georef, echelle: window.getPlanScale(id) || window.APP_CONFIG.scale,
               depart: [window.APP_CONFIG.startX, window.APP_CONFIG.startY], W: W, H: H,
               pt: { uid: pt.uid, x: pt.x, y: pt.y, px: pt.precis.x }, rd: { uid: rd.uid, points: rd.points.map(function (p) { return [p.x, p.y]; }) },
               st: { uid: st.uid, points: st.points.map(function (p) { return [p.x, p.y]; }) }, photo: photo };
    });
    verifier(depart.type === "local", "relevé fictif importé en plan local (" + depart.W + " × " + depart.H + " px), calage posé dans les Réglages");
    verifier(!!depart.photo && !!depart.photo.id, "photo ajoutée au point dessiné (par son uid)", depart.photo);

    // ── 1. ×2, fond uni blanc, ancien scan, session ──
    console.log("\n══ passe 1 : ×2, fond uni, ancien scan, session ══");
    const p1 = await parcours(page, { k: 2, fond: "uni", couleur: "white" }, journal);
    verifier(p1.fen.visible && p1.fen.lignes === 3 && p1.fen.scan && p1.fen.session,
      "fenêtre visible depuis l'Éditeur de données : 3 facteurs, ancien scan et session cochés", p1.fen);
    verifier(p1.gen.nom === JSON.parse(depart.cfg).plan.name + " (HD)" && Number(p1.gen.w) === depart.W * 2 &&
      Number(p1.gen.h) === depart.H * 2 && p1.gen.photos,
      "Générateur prérempli : nom « (HD) », dimensions ×2, photos cochées", p1.gen);
    const b1 = await telecharger(page, '#kta-plan-hd-fin [data-planhd-fin="telecharger"]');
    const z1 = await relire(page, b1, { ancien: depart.id, georef: depart.georef, echelle: depart.echelle, depart: depart.depart,
      pt: depart.pt, rd: depart.rd, st: depart.st });
    verifier(z1.w === z1.wO * 2 && z1.h === z1.hO * 2, "ZIP : dimensions du plan ×2", [z1.w, z1.h, z1.wO, z1.hO]);
    verifier(z1.calage, "ZIP : calage des Réglages à ×2 (lat/lng intacts)");
    verifier(Math.abs(z1.echelle - z1.echelleO * 2) < 1e-9, "ZIP : échelle px/m ×2", [z1.echelle, z1.echelleO]);
    verifier(z1.depart[0] === Math.round(z1.departO[0] * 2) && z1.depart[1] === Math.round(z1.departO[1] * 2),
      "ZIP : départ du tracker ×2", [z1.depart, z1.departO]);
    const tousCalques = z1.calques.every(function (c) { return c.declare && c.avant === c.apres && c.faux.length === 0; });
    const nbCouples = z1.calques.reduce(function (s, c) { return s + c.compares; }, 0);
    verifier(tousCalques && z1.calques.length > 0 && nbCouples > 0,
      "ZIP : " + z1.calques.length + " calque(s) déclarés, " + nbCouples + " couples { x, y } (points, sommets, points précis, " +
      "raccords, rampes) tous exactement ×2", z1.calques);
    verifier(!!z1.pt && z1.pt.x === depart.pt.x * 2 && z1.pt.y === depart.pt.y * 2 && z1.pt.px === depart.pt.px * 2,
      "ZIP : point dessiné (et son point précis) à ×2, uid gardé", z1.pt);
    verifier(!!z1.rd && JSON.stringify(z1.rd) === JSON.stringify(depart.rd.points.map(function (p) { return [p[0] * 2, p[1] * 2]; })),
      "ZIP : tracé dessiné à ×2, uid gardé", z1.rd);
    verifier(!!z1.st && JSON.stringify(z1.st) === JSON.stringify(depart.st.points.map(function (p) { return [p[0] * 2, p[1] * 2]; })),
      "ZIP : pilier à bras dessiné à ×2, uid gardé", z1.st);
    verifier(!!z1.scan && z1.scan.present, "ZIP : ancien scan déclaré en calque image, fichier embarqué", z1.scan);
    verifier(!!z1.pixels && z1.pixels.w === depart.W * 2 && z1.pixels.h === depart.H * 2 && z1.pixels.hors === 0,
      "ZIP : image du plan unie (blanche) à " + (depart.W * 2) + " × " + (depart.H * 2) + " px", z1.pixels);
    verifier(z1.photos, "ZIP : photo embarquée (data/photos/_index.json)");

    // ── 2. Ajouter à mes plans et l'ouvrir ──
    await page.evaluate(function () { document.querySelector('#kta-plan-hd-fin [data-planhd-fin="ouvrir"]').click(); });
    await attendre(page, function () { return !document.getElementById("kta-plan-hd-fin"); }, 60000);
    await planOuvert(page);
    const neuf = await page.evaluate(async function (a) {
      const id = window._currentLoadedPlanId;
      const e = window.PlanRegistry.findById(a.ancien);
      const b = await window.PlanRegistry.getBlob(a.ancien);
      const cfgA = await (await JSZip.loadAsync(b)).file("plan-config.json").async("string");
      let scan = null;
      const en = (window._ktaImageOverlays || []).find(function (x) { return x.id === window.KtaPlanHD.ID_SCAN; });
      if (en && en.overlay && en.overlay.getBounds) {
        const bb = en.overlay.getBounds();
        scan = { sud: bb.getSouth(), ouest: bb.getWest(), nord: bb.getNorth(), est: bb.getEast(),
                 affiche: window.map.hasLayer(en.overlay) };
      }
      const photos = await window.MyKTAMapPhotos.getAllPhotosForPlan(id);
      return { id: id, distinct: id !== a.ancien, w: window.PLAN_CONFIG.plan.imageWidth, h: window.PLAN_CONFIG.plan.imageHeight,
               ancienIntact: JSON.stringify(Object.assign({}, e, { lastOpened: null })) === a.entree && b.size === a.taille && cfgA === a.cfg,
               scan: scan, photo: photos.some(function (p) { return p.pointId === a.uid; }),
               scale: window.APP_CONFIG.scale };
    }, { ancien: depart.id, entree: depart.entree, taille: depart.taille, cfg: depart.cfg, uid: depart.pt.uid });
    verifier(neuf.distinct, "nouveau plan distinct dans le registre (" + neuf.id + ")", neuf.id);
    verifier(neuf.ancienIntact, "ancien plan inchangé : entrée du registre, archive gardée et son plan-config identiques");
    verifier(neuf.w === depart.W * 2 && neuf.h === depart.H * 2, "nouveau plan ouvert à ×2", [neuf.w, neuf.h]);
    verifier(!!neuf.scan && Math.abs(neuf.scan.ouest) < 1e-6 && Math.abs(neuf.scan.sud) < 1e-6 &&
      Math.abs(neuf.scan.est - depart.W * 2) < 1e-6 && Math.abs(neuf.scan.nord - depart.H * 2) < 1e-6,
      "ancien scan affiché sur toute l'emprise du nouveau plan (0,0 → " + depart.W * 2 + "," + depart.H * 2 + ")", neuf.scan);
    verifier(neuf.photo, "photo rattachée au point dans le nouveau plan (même uid)");
    verifier(Math.abs(neuf.scale - depart.echelle * 2) < 1e-9, "échelle du nouveau plan ouvert ×2", [neuf.scale, depart.echelle]);

    // ── 3. Page rechargée : le nouveau plan se rouvre sans erreur ──
    const errAvant = erreurs.length;
    await accueil(page);
    await page.evaluate(function (id) { return window.chargerPlanDuRegistre(id); }, neuf.id);
    await planOuvert(page);
    const rouvert = await page.evaluate(function () {
      let n = 0;
      Object.keys(window.dataLayerGroups || {}).forEach(function (k) { window.dataLayerGroups[k].eachLayer(function () { n++; }); });
      return { id: window._currentLoadedPlanId, w: window.PLAN_CONFIG.plan.imageWidth, couches: n };
    });
    verifier(rouvert.id === neuf.id && rouvert.w === depart.W * 2 && rouvert.couches > 0 && erreurs.length === errAvant,
      "page rechargée : nouveau plan rouvert, calques affichés, aucune erreur", { rouvert: rouvert, erreurs: erreurs.slice(errAvant, errAvant + 3) });

    // ── 4. ×2, fond rendu, depuis l'ancien plan ──
    console.log("\n══ passe 2 : ×2, fond rendu ══");
    await page.evaluate(function (id) { return window.chargerPlanDuRegistre(id); }, depart.id);
    await planOuvert(page);
    await parcours(page, { k: 2, fond: "rendu", couleur: "white" }, journal);
    const b2 = await telecharger(page, '#kta-plan-hd-fin [data-planhd-fin="telecharger"]');
    const z2 = await relire(page, b2, { ancien: depart.id, georef: depart.georef, echelle: depart.echelle, depart: depart.depart,
      pt: depart.pt, rd: depart.rd, st: depart.st });
    verifier(!!z2.pixels && z2.pixels.w === depart.W * 2 && z2.pixels.h === depart.H * 2 && z2.pixels.hors > 0,
      "fond rendu : image ×2 peinte (" + (z2.pixels && z2.pixels.hors) + " pixels échantillonnés hors du fond blanc)", z2.pixels);
    verifier(z2.calques.every(function (c) { return c.faux.length === 0; }), "fond rendu : données toujours à ×2");
    await page.evaluate(function () { const f = document.getElementById("kta-plan-hd-fin"); if (f) f.remove(); });

    // ── 5. Refus au-delà du plafond (dimensions et appareil simulés, rendus ensuite) ──
    console.log("\n══ refus au-delà du plafond ══");
    // Le tuilage V2 de la passe 2 a fermé le plan : il est rouvert.
    await page.evaluate(function (id) { return window.chargerPlanDuRegistre(id); }, depart.id);
    await planOuvert(page);
    const refus = await page.evaluate(async function () {
      const pc = window.PLAN_CONFIG.plan;
      const w0 = pc.imageWidth, h0 = pc.imageHeight, ios0 = window.ktaEstIos;
      const lire = function () {
        const ov = document.getElementById("kta-plan-hd");
        const r = {};
        ov.querySelectorAll('input[name="kta-planhd-k"]').forEach(function (i) {
          const note = ov.querySelector('[data-planhd-note="' + i.value + '"]');
          r[i.value] = { dis: i.disabled, note: note ? note.textContent : "" };
        });
        r.suivant = !document.getElementById("kta-planhd-suivant").disabled;
        document.querySelector("#kta-plan-hd [data-planhd-fermer]").click();
        return r;
      };
      try {
        pc.imageWidth = 3000; pc.imageHeight = 2000;
        window.ktaEstIos = function () { return true; };
        window.ktaOuvrirPlanHD(); const ios = lire();
        window.ktaEstIos = function () { return false; };
        window.ktaOuvrirPlanHD(); const ordi = lire();
        pc.imageWidth = 5000; pc.imageHeight = 4000;
        window.ktaOuvrirPlanHD(); const aucun = lire();
        return { ios: ios, ordi: ordi, aucun: aucun, attendu: window.I18n.t("planhd.facteur.refuse", { max: "" }).slice(0, 10) };
      } finally { pc.imageWidth = w0; pc.imageHeight = h0; window.ktaEstIos = ios0; }
    });
    verifier(refus.ios["2"].dis && refus.ios["2"].note.indexOf(refus.attendu) === 0 && !refus.ios.suivant,
      "iPhone, 3000 × 2000 : ×2 (24 Mpx) refusé avec la raison, rien à générer", refus.ios);
    verifier(!refus.ordi["2"].dis && !refus.ordi["3"].dis && refus.ordi["4"].dis && refus.ordi.suivant &&
      refus.ordi["2"].note.length > 0,
      "ordinateur, 3000 × 2000 : ×2 et ×3 permis (tuilage V2 annoncé), ×4 (96 Mpx) refusé", refus.ordi);
    verifier(refus.aucun["2"].dis && refus.aucun["3"].dis && refus.aucun["4"].dis && !refus.aucun.suivant,
      "5000 × 4000 : tout refusé, bouton Générateur grisé", refus.aucun);

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
  console.log("🎉 CHECKUP VERT — régénérer en haute résolution : nouveau plan ×2, données exactement à l'échelle, " +
    "ancien plan intact, refus au-delà du plafond");
})();
