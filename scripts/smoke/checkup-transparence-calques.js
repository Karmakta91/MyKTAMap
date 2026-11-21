#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-transparence-calques.js — checkup (Playwright, pas un hook pré-commit) : opacité des calques image
// =====================================================================
// Le relevé fictif est rechargé en ZIP fabriqué en mémoire (jamais dans data/), avec deux calques image opaques
// dessinés dans la page : « tc-std » (niveau 1, bornes du plan, rouge) et « tc-cal » (niveau 2, calé, vert). Par
// moteur (Chromium puis WebKit) :
//   T1 sans réglage : opacité 1, aucun style posé, rien dans les prefs, export = couleur pleine du calque ;
//   T2 curseurs des filtres ≡ (30 % posé, 70 % au clavier) : overlay, valeur affichée, prefs, autres clés gardées ;
//   T3 export PNG : pixel composé = calque × opacité + fond × (1 − opacité), comparé à opaque et sans calque ;
//   T4 détection : ktaDessinerRegionPlan lit les pixels pleins (identiques à opacité 100 %) ;
//   T5 fond OSM sous le plan (tuiles bloquées) : sa transparence et l'opacité du calque restent chacune à soi ;
//   T6 rechargement de la page puis du plan : valeurs retenues et réappliquées (calque standard ET calé) ;
//   T7 retour à 100 % : entrée retirée des prefs, autres réglages du plan gardés ; aucune erreur de page.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8162 node scripts/smoke/checkup-transparence-calques.js
// Doc : docs/architecture/rendering-leaflet.md (Calques image) · docs/architecture/ui.md (filtres)
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1",
  "myktamap_osm_view_opt_in": "1"
};
const RE_OSM = /tile\.openstreetmap\.org\//;
const ROUGE = [220, 40, 40], VERT = [30, 180, 60];

let MOTEUR = "";
const problemes = [];
function pb(msg) { problemes.push("[" + MOTEUR + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
function proches(a, b, tol) { return !!a && !!b && [0, 1, 2].every(function (i) { return Math.abs(a[i] - b[i]) <= tol; }); }

// Outils posés dans la page (lus au moment de l'appel : l'app est chargée).
function outilsPage() {
  window.__tc = {
    // planId : rouvrir un plan déjà enregistré avec la même archive (chemin du blob mémorisé, homeLoader.js).
    fabriquer: async function (nomZip, couleurs, planId) {
      const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
      if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
      const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
      const W = cfg.plan.imageWidth, H = cfg.plan.imageHeight, S = 256;
      const png = async function (c) {
        const cv = document.createElement("canvas"); cv.width = S; cv.height = S;
        const g = cv.getContext("2d"); g.fillStyle = "rgb(" + c.join(",") + ")"; g.fillRect(0, 0, S, S);
        return new Promise(function (r) { cv.toBlob(r, "image/png"); });
      };
      // tc-cal : carré de 0,5 largeur d'image, coin haut gauche à 25 % / 25 % (calage plan-config).
      const k = 0.5 * W / S, x0 = Math.round(W * 0.25), y0 = Math.round(H * 0.25);
      const calques = [
        { id: "tc-std", label: "Calque essai A", file: "calques/tc-std.png", level: 1, visible: true, order: 1 },
        { id: "tc-cal", label: "Calque essai B", file: "calques/tc-cal.png", level: 2, visible: true, order: 2,
          calibration: { sourceA: { sx: 0, sy: 0 }, targetA: { x: x0, y: y0 },
                         sourceB: { sx: 100, sy: 0 }, targetB: { x: x0 + 100 * k, y: y0 } } }
      ];
      cfg.imageLayers = calques;
      cfg.plan.name = "Essai opacite " + nomZip.replace(/\.zip$/, "");
      const zip = new JSZip();
      zip.file(calques[0].file, await png(couleurs[0]));
      zip.file(calques[1].file, await png(couleurs[1]));
      const chemins = [cfg.plan.baseImage]
        .concat((cfg.dataLayers || []).map(function (l) { return l.file; }))
        .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
      for (const p of Array.from(new Set(chemins))) {
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob());
      }
      zip.file("plan-config.json", JSON.stringify(cfg));
      const blob = await zip.generateAsync({ type: "blob" });
      // Point commun aux deux calques, dans l'image : région de 40 × 40 unités plan autour de lui.
      const px = Math.round(W * 0.35), py = Math.min(H - 30, Math.round(y0 + 0.1 * W));
      window.__tcInfo = { W: W, H: H, region: { x: px - 20, y: py - 20, w: 40, h: 40 } };
      window.__tcFini = false;
      const optsZip = planId ? { planId: planId, fromStoredBlob: true } : { storeBlob: true };
      window.__tcCharge = window.chargerZipFichier(new File([blob], nomZip, { type: "application/zip" }), "auto",
        optsZip).then(function () { window.__tcFini = true; return true; },
        function (e) { window.__tcFini = true; return String(e && e.message || e); });
      return { ok: true, info: window.__tcInfo };
    },
    entree: function (id) { return (window._ktaImageOverlays || []).find(function (e) { return e.id === id; }) || null; },
    // Opacité d'un calque : option Leaflet, style posé sur son élément, opacité calculée.
    opacite: function (id) {
      const e = window.__tc.entree(id);
      if (!e) return null;
      const el = e.overlay._image;
      return { option: e.overlay.options.opacity, style: el ? el.style.opacity : null,
               calculee: el ? Number(getComputedStyle(el).opacity) : null, calibre: !!e.overlay._ktaCalibrated };
    },
    prefs: function () {
      try { return JSON.parse(localStorage.getItem("myktamap_plan_prefs_" + window._currentLoadedPlanId) || "null"); }
      catch (e) { return "illisible"; }
    },
    // Pixel central de l'export PNG (moteur des exports), région fixe, sans annotations ni calques de données.
    pixelExport: async function (ids) {
      const calques = {};
      ids.forEach(function (id) { calques[id] = true; });
      const cv = await window.MyKTAMapExporterGenererCanvas({
        bg: "image", scale: 1, region: window.__tcInfo.region, imageLayers: calques,
        includeImgLayers: ids.length > 0, includeDataLayers: false,
        ann: { points: false, roads: false, zones: false, structures: false }
      });
      const d = cv.getContext("2d").getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    // Pixels lus par la détection (tiling.js > ktaDessinerRegionPlan) pour un niveau : empreinte de la région.
    pixelsDetection: async function (niveau) {
      const r = window.__tcInfo.region, cv = document.createElement("canvas");
      cv.width = r.w; cv.height = r.h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const res = await window.ktaDessinerRegionPlan(ctx, r, 1, { niveau: niveau });
      const d = ctx.getImageData(0, 0, r.w, r.h).data;
      let somme = 0, h = 0;
      for (let i = 0; i < d.length; i++) { somme += d[i]; h = (h * 31 + d[i]) >>> 0; }
      const c = ((r.h / 2) * r.w + r.w / 2) * 4;
      return { ok: res && res.ok, source: res && res.source, somme: somme, empreinte: h,
               centre: [d[c], d[c + 1], d[c + 2], d[c + 3]] };
    },
    opacitePlan: function () {
      const tp = window.map.getPane("tilePane");
      const b = (window._ktaBaseLayers || [])[0] || ((window._baseTiles || [])[0] || {}).overlay;
      return { tilePane: tp ? tp.style.opacity : null, fond: b && b.options ? b.options.opacity : null };
    },
    curseur: function (id) {
      const i = document.querySelector('[data-img-opacite="' + id + '"]');
      if (!i) return null;
      const v = i.closest(".kta-fp-opacite").querySelector(".kta-fp-opacite-valeur");
      return { valeur: i.value, texte: v ? v.textContent : null, aria: i.getAttribute("aria-label"),
               min: i.min, max: i.max };
    },
    regler: function (id, pct) {
      const i = document.querySelector('[data-img-opacite="' + id + '"]');
      if (!i) return false;
      i.value = String(pct);
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  };
}

async function attendreCalques(page, quoi) {
  try {
    await attendre(page, function () {
      return window.__tcFini !== false && !!window.map && !!window.PLAN_CONFIG &&
        Array.isArray(window._ktaImageOverlays) && window._ktaImageOverlays.length === 2;
    }, 90000);
  } catch (e) {
    const etat = await page.evaluate(async function () {
      const st = document.getElementById("loaderStatus");
      const minute = function (p) { return Promise.race([p, new Promise(function (r) { setTimeout(function () { r("délai"); }, 3000); })]); };
      let sonde = null;
      try {
        const plans = window.PlanRegistry.getAll().filter(function (p) { return /opacite/i.test(p.name || ""); });
        const b = plans[0] ? await minute(window.PlanRegistry.getBlob(plans[0].id)) : "aucun plan";
        sonde = { type: plans[0] && plans[0].type, blob: b && b.size !== undefined ? b.size : String(b),
                  lecture: b && b.slice ? String(await minute(b.slice(0, 4).arrayBuffer().then(function (x) { return x.byteLength; }))) : null };
      } catch (e) { sonde = String(e && e.message || e); }
      const modales = Array.from(document.querySelectorAll("[role=dialog], .kta-modal, [id*=modal]"))
        .filter(function (m) { return m.offsetParent !== null; })
        .map(function (m) { return (m.id || m.className) + " : " + (m.textContent || "").trim().slice(0, 160); });
      return { fini: window.__tcFini, carte: !!window.map, calques: (window._ktaImageOverlays || []).length,
               plan: window._currentLoadedPlanId || null, modales: modales.slice(0, 4),
               statut: st ? st.textContent : null, sonde: sonde };
    });
    throw new Error(quoi + " pas ouvert : " + JSON.stringify(etat));
  }
  await page.waitForTimeout(1200);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

async function demarrer(page) {
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerZipFichier === "function" && typeof JSZip !== "undefined";
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

async function scenario(nav) {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 820 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  if (process.env.KTA_DEBUG) page.on("console", function (m) { console.log("     [page] " + m.text().slice(0, 200)); });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  await page.addInitScript(outilsPage);
  let requetesOsm = 0;
  await page.route(RE_OSM, function (route) { requetesOsm++; route.abort(); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await demarrer(page);
    const r = await page.evaluate(function (c) { return window.__tc.fabriquer("transparence.zip", c); }, [ROUGE, VERT]);
    if (!r.ok) throw new Error(r.raison);
    await attendreCalques(page, "plan fabriqué");
    const planId = await page.evaluate(function () { return window._currentLoadedPlanId; });
    inf("image " + r.info.W + " × " + r.info.H + ", 2 calques fabriqués (niveaux 1 et 2, le second calé)");
    // Témoin : un autre réglage du plan, qui doit survivre à chaque écriture de l'opacité.
    await page.evaluate(function () {
      const k = "myktamap_plan_prefs_" + window._currentLoadedPlanId;
      const p = JSON.parse(localStorage.getItem(k) || "{}");
      p.tcTemoin = "garde";
      localStorage.setItem(k, JSON.stringify(p));
    });

    // ── T1 : sans réglage ─────────────────────────────────────────────
    console.log("— T1 : sans réglage —");
    const t1 = await page.evaluate(async function () {
      return { std: window.__tc.opacite("tc-std"), cal: window.__tc.opacite("tc-cal"), prefs: window.__tc.prefs(),
               base: await window.__tc.pixelExport([]), pStd: await window.__tc.pixelExport(["tc-std"]),
               pCal: await window.__tc.pixelExport(["tc-cal"]),
               d1: await window.__tc.pixelsDetection(1), d2: await window.__tc.pixelsDetection(2) };
    });
    verifier(t1.std && t1.cal && t1.cal.calibre, "deux calques posés, le second calé", { std: t1.std, cal: t1.cal });
    verifier(t1.std && t1.std.option === 1 && t1.std.style === "" && t1.cal && t1.cal.option === 1 && t1.cal.style === "",
      "opacité 1 et aucun style d'opacité posé sur les calques", { std: t1.std, cal: t1.cal });
    verifier(t1.prefs && !("imageLayerOpacity" in t1.prefs) && t1.prefs.tcTemoin === "garde",
      "rien d'écrit dans les prefs du plan", t1.prefs);
    verifier(proches(t1.pStd, ROUGE, 1) && t1.pStd[3] === 255 && proches(t1.pCal, VERT, 1),
      "export : couleur pleine des calques (" + t1.pStd.slice(0, 3) + " / " + t1.pCal.slice(0, 3) + ")",
      { std: t1.pStd, cal: t1.pCal });
    verifier(t1.d1.ok && t1.d1.source === "calques" && t1.d2.ok && proches(t1.d1.centre, ROUGE, 1) &&
      proches(t1.d2.centre, VERT, 1), "détection : calques des niveaux 1 et 2 lus", { d1: t1.d1, d2: t1.d2 });
    inf("pixel du fond (export sans calque) : " + t1.base.join(", "));

    // ── T2 : curseurs des filtres ≡ ───────────────────────────────────
    console.log("— T2 : curseurs des filtres —");
    await page.evaluate(function () { window.FilterPanel.ouvrir(); });
    await page.waitForTimeout(500);
    const c0 = await page.evaluate(function () { return { std: window.__tc.curseur("tc-std"), cal: window.__tc.curseur("tc-cal") }; });
    verifier(c0.std && c0.cal && c0.std.valeur === "100" && c0.cal.valeur === "100" && /100/.test(c0.std.texte || ""),
      "un curseur par calque, à 100 % au départ", c0);
    verifier(c0.std && /Calque essai A/.test(c0.std.aria || ""), "curseur nommé pour les lecteurs d'écran", c0.std);
    if (c0.std && c0.cal) {
      await page.evaluate(function () { window.__tc.regler("tc-std", 30); });
      // Calque calé : au clavier (6 × flèche gauche, pas de 5 %), comme un vrai utilisateur.
      await page.focus('[data-img-opacite="tc-cal"]');
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(200);
    }
    const t2 = await page.evaluate(function () {
      return { std: window.__tc.opacite("tc-std"), cal: window.__tc.opacite("tc-cal"), prefs: window.__tc.prefs(),
               cStd: window.__tc.curseur("tc-std"), cCal: window.__tc.curseur("tc-cal") };
    });
    verifier(t2.std && Math.abs(t2.std.calculee - 0.3) < 0.01, "calque standard à 30 % sur la carte", t2.std);
    verifier(t2.cal && Math.abs(t2.cal.calculee - 0.7) < 0.01, "calque calé à 70 % (clavier) sur la carte", t2.cal);
    verifier(t2.cStd && /^30\s?%$/.test((t2.cStd.texte || "").replace(/ /g, " ")), "valeur affichée « 30 % »", t2.cStd);
    const op = t2.prefs && t2.prefs.imageLayerOpacity;
    verifier(op && op["tc-std"] === 0.3 && op["tc-cal"] === 0.7, "prefs : imageLayerOpacity par calque", t2.prefs);
    verifier(t2.prefs && t2.prefs.tcTemoin === "garde", "prefs : les autres réglages du plan sont gardés", t2.prefs);

    // ── T3 : export PNG ───────────────────────────────────────────────
    console.log("— T3 : export PNG —");
    const t3 = await page.evaluate(async function () {
      return { pStd: await window.__tc.pixelExport(["tc-std"]), pCal: await window.__tc.pixelExport(["tc-cal"]) };
    });
    const attStd = [0, 1, 2].map(function (i) { return Math.round(ROUGE[i] * 0.3 + t1.base[i] * 0.7); });
    const attCal = [0, 1, 2].map(function (i) { return Math.round(VERT[i] * 0.7 + t1.base[i] * 0.3); });
    verifier(proches(t3.pStd, attStd, 3), "export, calque à 30 % : " + t3.pStd.slice(0, 3) + " (attendu " + attStd +
      ", opaque " + t1.pStd.slice(0, 3) + ", fond " + t1.base.slice(0, 3) + ")");
    verifier(proches(t3.pCal, attCal, 3), "export, calque calé à 70 % : " + t3.pCal.slice(0, 3) + " (attendu " + attCal +
      ", opaque " + t1.pCal.slice(0, 3) + ")");

    // ── T4 : détection, image pleine ──────────────────────────────────
    console.log("— T4 : détection —");
    const t4 = await page.evaluate(async function () {
      return { d1: await window.__tc.pixelsDetection(1), d2: await window.__tc.pixelsDetection(2) };
    });
    verifier(t4.d1.empreinte === t1.d1.empreinte && t4.d1.somme === t1.d1.somme,
      "détection niveau 1 (calque à 30 %) : pixels identiques à 100 % (centre " + t4.d1.centre.slice(0, 3) + ")",
      { avant: t1.d1, apres: t4.d1 });
    verifier(t4.d2.empreinte === t1.d2.empreinte && t4.d2.somme === t1.d2.somme,
      "détection niveau 2 (calque calé à 70 %) : pixels identiques à 100 %", { avant: t1.d2, apres: t4.d2 });

    // ── T5 : fond OSM sous le plan ────────────────────────────────────
    console.log("— T5 : fond OSM sous le plan —");
    const t5a = await page.evaluate(async function () {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      window.PLAN_CONFIG.plan.georef = {
        pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
        pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2.4e-6 },
        modele: "local"
      };
      if (!window.FondOsmPlan) return { allume: false };
      window.FondOsmPlan.majBouton();
      window.FondOsmPlan.allumer();
      window.FondOsmPlan.regler(40);
      await new Promise(function (r) { setTimeout(r, 400); });
      return { allume: window.FondOsmPlan.etat().allume, plan: window.__tc.opacitePlan(),
               std: window.__tc.opacite("tc-std"), cal: window.__tc.opacite("tc-cal") };
    });
    const planA60 = function (p) { return p && (p.tilePane === "0.6" || Math.abs(Number(p.fond) - 0.6) < 0.01); };
    verifier(t5a.allume && planA60(t5a.plan), "fond OSM allumé, plan à 60 % (transparence 40)", t5a);
    verifier(t5a.std && Math.abs(t5a.std.calculee - 0.3) < 0.01 && t5a.cal && Math.abs(t5a.cal.calculee - 0.7) < 0.01,
      "fond OSM allumé et réglé : les calques gardent 30 % / 70 %", { std: t5a.std, cal: t5a.cal });
    const t5b = await page.evaluate(async function () {
      window.__tc.regler("tc-std", 50);
      await new Promise(function (r) { setTimeout(r, 200); });
      const apres = { transparence: window.FondOsmPlan.etat().transparence, plan: window.__tc.opacitePlan(),
                      std: window.__tc.opacite("tc-std") };
      window.FondOsmPlan.eteindre();
      await new Promise(function (r) { setTimeout(r, 200); });
      return { apres: apres, eteint: { plan: window.__tc.opacitePlan(), std: window.__tc.opacite("tc-std"),
                                       cal: window.__tc.opacite("tc-cal") } };
    });
    verifier(t5b.apres.transparence === 40 && planA60(t5b.apres.plan) && Math.abs(t5b.apres.std.calculee - 0.5) < 0.01,
      "calque passé à 50 % : la transparence du fond OSM reste à 40", t5b.apres);
    verifier(Math.abs(t5b.eteint.std.calculee - 0.5) < 0.01 && Math.abs(t5b.eteint.cal.calculee - 0.7) < 0.01,
      "fond OSM éteint : les calques gardent 50 % / 70 %", t5b.eteint);
    inf("requêtes de tuiles OSM bloquées : " + requetesOsm);
    await page.evaluate(function () { window.__tc.regler("tc-std", 30); window.FilterPanel.fermer(); });

    // ── T6 : rechargement ─────────────────────────────────────────────
    console.log("— T6 : rechargement de la page et du plan —");
    await page.reload({ waitUntil: "domcontentloaded" });
    await demarrer(page);
    // 🩸 WebKit (Playwright) ne garde pas l'archive en IndexedDB (getBlob → null) : le plan est alors rouvert
    // avec la même archive et le même identifiant, comme homeLoader.js le fait depuis le blob mémorisé.
    const chemin = await page.evaluate(async function (a) {
      const blob = await window.PlanRegistry.getBlob(a[0]).catch(function () { return null; });
      if (blob) {
        window.__tcFini = false;
        window.chargerPlanDuRegistre(a[0]).then(function () { window.__tcFini = true; },
          function () { window.__tcFini = true; });
        return "registre (archive mémorisée)";
      }
      const r = await window.__tc.fabriquer("transparence.zip", a[1], a[0]);
      return r.ok ? "même archive, même identifiant (pas d'archive mémorisée)" : r.raison;
    }, [planId, [ROUGE, VERT]]);
    inf("plan rouvert par : " + chemin);
    await attendreCalques(page, "plan rouvert");
    await page.evaluate(function () { window.FilterPanel.ouvrir(); });
    await page.waitForTimeout(500);
    const t6 = await page.evaluate(function () {
      return { id: window._currentLoadedPlanId, std: window.__tc.opacite("tc-std"), cal: window.__tc.opacite("tc-cal"),
               cStd: window.__tc.curseur("tc-std"), cCal: window.__tc.curseur("tc-cal") };
    });
    verifier(t6.id === planId, "même plan rouvert", { avant: planId, apres: t6.id });
    verifier(t6.std && Math.abs(t6.std.calculee - 0.3) < 0.01 && t6.std.option === 0.3,
      "calque standard : 30 % réappliqué au chargement", t6.std);
    verifier(t6.cal && t6.cal.calibre && Math.abs(t6.cal.calculee - 0.7) < 0.01,
      "calque calé (chargé en asynchrone) : 70 % réappliqué", t6.cal);
    verifier(t6.cStd && t6.cStd.valeur === "30" && t6.cCal && t6.cCal.valeur === "70",
      "curseurs rouverts à 30 / 70", { std: t6.cStd, cal: t6.cCal });

    // ── T7 : retour à 100 % ───────────────────────────────────────────
    console.log("— T7 : retour à 100 % —");
    const t7 = await page.evaluate(function () {
      window.__tc.regler("tc-std", 100);
      const un = window.__tc.prefs();
      window.__tc.regler("tc-cal", 100);
      return { un: un, deux: window.__tc.prefs(), std: window.__tc.opacite("tc-std") };
    });
    verifier(t7.un && t7.un.imageLayerOpacity && !("tc-std" in t7.un.imageLayerOpacity) &&
      t7.un.imageLayerOpacity["tc-cal"] === 0.7, "100 % retire l'entrée du calque, l'autre reste", t7.un);
    verifier(t7.deux && !("imageLayerOpacity" in t7.deux) && t7.deux.tcTemoin === "garde",
      "plus aucun réglage d'opacité : la clé disparaît, le témoin reste", t7.deux);
    verifier(t7.std && t7.std.calculee === 1, "calque standard de nouveau opaque", t7.std);

    const utiles = erreurs.filter(function (e) { return !/swRegister|serviceWorker/i.test(e); });
    verifier(utiles.length === 0, "aucune erreur de page", utiles.slice(0, 3));
  } finally {
    await ctx.close();
  }
}

(async function main() {
  const server = require("./server.js");
  const joues = [];
  for (const nom of moteurs()) {
    let nav = null;
    try {
      nav = await lancerMoteur(nom);
      if (!nav) { inf("moteur " + nom + " absent : non joué"); continue; }
      MOTEUR = nom;
      console.log("\n══ moteur " + nom + " (" + nav.version() + ") ══");
      await scenario(nav);
      joues.push(nom);
    } catch (e) {
      MOTEUR = nom;
      pb("exception : " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
    } finally {
      if (nav) await nav.close();
    }
  }
  if (server && server.close) server.close();
  if (!joues.length && !problemes.length) pb("aucun moteur lancé (KTA_MOTEURS=" + (process.env.KTA_MOTEURS || "") + ")");
  console.log("");
  if (problemes.length) {
    console.log("⚠️ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — opacité des calques image (" + joues.join(", ") + ")");
  process.exit(0);
})();
