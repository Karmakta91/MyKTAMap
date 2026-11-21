#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-detection-niveau.js — checkup (Playwright, pas un hook pré-commit) : image lue par la détection selon le
// niveau (tiling.js > ktaDessinerRegionPlan, refus affiché par js/detectionStructures.js)
// =====================================================================
// Le relevé fictif est rechargé en ZIP fabriqué en mémoire (jamais dans data/), multi-niveau, avec trois calques
// image opaques dessinés dans la page : « dn-a » (niveau 1, bornes du plan, rouge), « dn-b » (niveau 1, calé, vert,
// par-dessus) et « dn-z » (niveau 0, bornes du plan, bleu). Le niveau 2 n'a aucun calque. Par moteur :
//   N1 niveau sans calque : { ok: false, raison: "niveau-sans-image" }, rien dessiné (l'image du niveau 0 non lue) ;
//   N2 calque masqué (case des filtres ≡ décochée) : pas lu, seuls les pixels du calque visible ;
//   N3 tous les calques du niveau masqués : { raison: "calques-masques" }, rien dessiné ;
//   N4 niveau 0 : image de base, empreinte identique calque du niveau 0 affiché ou masqué, sans son bleu ;
//   N5 calque à 10 % (curseur des filtres) : pixels identiques à 100 % (niveau 1 et niveau 0) ;
//   N6 parcours « Détecter » au niveau 2 : pipette et « Tout le plan » refusés par un message, aucune structure ;
//      niveau 1 calques masqués : « Tout le plan » refusé par le message des calques masqués ; aucune erreur de page.
// Usage : NODE_PATH=<node_modules de scripts/smoke> SMOKE_PORT=8166 node scripts/smoke/checkup-detection-niveau.js
// Doc : docs/architecture/plans-loader.md (Détecter les structures)
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const ROUGE = [220, 40, 40], VERT = [30, 180, 60], BLEU = [40, 60, 220];
const SENTINELLE = [255, 0, 255];   // couleur posée avant la lecture : intacte = rien n'a été dessiné

let MOTEUR = "";
const problemes = [];
function pb(msg) { problemes.push("[" + MOTEUR + "] " + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }
function proches(a, b, tol) { return !!a && !!b && [0, 1, 2].every(function (i) { return Math.abs(a[i] - b[i]) <= tol; }); }

// Outils posés dans la page (lus au moment de l'appel : l'app est chargée).
function outilsPage() {
  window.__dn = {
    fabriquer: async function (couleurs) {
      const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
      if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
      const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
      const W = cfg.plan.imageWidth, H = cfg.plan.imageHeight, S = 256;
      const png = async function (c) {
        const cv = document.createElement("canvas"); cv.width = S; cv.height = S;
        const g = cv.getContext("2d"); g.fillStyle = "rgb(" + c.join(",") + ")"; g.fillRect(0, 0, S, S);
        return new Promise(function (r) { cv.toBlob(r, "image/png"); });
      };
      const k = 0.5 * W / S, x0 = Math.round(W * 0.25), y0 = Math.round(H * 0.25);
      const calques = [
        { id: "dn-a", label: "Calque essai A", file: "calques/dn-a.png", level: 1, visible: true, order: 1 },
        { id: "dn-b", label: "Calque essai B", file: "calques/dn-b.png", level: 1, visible: true, order: 2,
          calibration: { sourceA: { sx: 0, sy: 0 }, targetA: { x: x0, y: y0 },
                         sourceB: { sx: 100, sy: 0 }, targetB: { x: x0 + 100 * k, y: y0 } } },
        { id: "dn-z", label: "Calque essai Z", file: "calques/dn-z.png", level: 0, visible: true, order: 3 }
      ];
      cfg.imageLayers = calques;
      cfg.plan.multiLevel = true;
      cfg.plan.name = "Essai detection niveau";
      const zip = new JSZip();
      for (let i = 0; i < calques.length; i++) zip.file(calques[i].file, await png(couleurs[i]));
      const chemins = [cfg.plan.baseImage]
        .concat((cfg.dataLayers || []).map(function (l) { return l.file; }))
        .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
      for (const p of Array.from(new Set(chemins))) {
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob());
      }
      zip.file("plan-config.json", JSON.stringify(cfg));
      const blob = await zip.generateAsync({ type: "blob" });
      // Point commun aux deux calques du niveau 1, dans l'image : région de 40 × 40 unités plan autour de lui.
      const px = Math.round(W * 0.35), py = Math.min(H - 30, Math.round(y0 + 0.1 * W));
      window.__dnInfo = { W: W, H: H, region: { x: px - 20, y: py - 20, w: 40, h: 40 }, point: { x: px, y: py } };
      window.__dnFini = false;
      window.chargerZipFichier(new File([blob], "detection-niveau.zip", { type: "application/zip" }), "auto",
        { storeBlob: true }).then(function () { window.__dnFini = true; }, function () { window.__dnFini = true; });
      return { ok: true, info: window.__dnInfo };
    },
    // Lecture de la détection pour un niveau, sur un canvas rempli de la sentinelle : empreinte et état.
    lire: async function (niveau, sentinelle) {
      const r = window.__dnInfo.region, cv = document.createElement("canvas");
      cv.width = r.w; cv.height = r.h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "rgb(" + sentinelle.join(",") + ")"; ctx.fillRect(0, 0, r.w, r.h);
      const res = await window.ktaDessinerRegionPlan(ctx, r, 1, { niveau: niveau });
      const d = ctx.getImageData(0, 0, r.w, r.h).data;
      let h = 0, intacts = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] === sentinelle[0] && d[i + 1] === sentinelle[1] && d[i + 2] === sentinelle[2]) intacts++;
        h = (h * 31 + d[i]) >>> 0; h = (h * 31 + d[i + 1]) >>> 0; h = (h * 31 + d[i + 2]) >>> 0;
      }
      const c = ((r.h / 2) * r.w + r.w / 2) * 4;
      return { ok: !!(res && res.ok), source: res && res.source, raison: res && res.raison, empreinte: h,
               intacts: intacts, total: r.w * r.h, centre: [d[c], d[c + 1], d[c + 2]] };
    },
    // Case d'un calque dans les filtres ≡ (le vrai geste : la case décochée retire l'overlay de la carte).
    caseCalque: function (id, coche) {
      const cb = document.querySelector('[data-img-layer="' + id + '"]');
      if (!cb) return false;
      if (cb.checked !== coche) cb.click();
      const e = (window._ktaImageOverlays || []).find(function (x) { return x.id === id; });
      return !!e && window.map.hasLayer(e.overlay) === coche;
    },
    regler: function (id, pct) {
      const i = document.querySelector('[data-img-opacite="' + id + '"]');
      if (!i) return false;
      i.value = String(pct);
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
      const e = (window._ktaImageOverlays || []).find(function (x) { return x.id === id; });
      return !!e && Math.abs(e.overlay.options.opacity - pct / 100) < 0.001;
    },
    // Toasts émis (OOMGuard.showToast), pour lire le message de refus.
    espionToasts: function () {
      window.__dnToasts = [];
      const G = window.OOMGuard, orig = G.showToast;
      G.showToast = function (msg, type) { window.__dnToasts.push({ msg: String(msg), type: type }); return orig.apply(G, arguments); };
    }
  };
}

async function demarrer(page) {
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerZipFichier === "function" && typeof JSZip !== "undefined";
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
}

async function attendreCalques(page) {
  await attendre(page, function () {
    return window.__dnFini !== false && !!window.map && !!window.PLAN_CONFIG &&
      Array.isArray(window._ktaImageOverlays) && window._ktaImageOverlays.length === 3 &&
      window._ktaImageOverlays.every(function (e) { return e.overlay && (e.overlay._image || e.overlay._rawImage); });
  }, 90000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
}

// Toucher la carte au point plan (x, y).
async function toucher(page, x, y) {
  const pt = await page.evaluate(function (a) {
    const r = window.map.getContainer().getBoundingClientRect();
    const c = window.map.latLngToContainerPoint(window.convertCoord(a.x, a.y));
    return { x: r.left + c.x, y: r.top + c.y };
  }, { x: x, y: y });
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(400);
}
async function bouton(page, act) {
  await page.click('#kta-detect-bandeau [data-detect="' + act + '"]');
  await page.waitForTimeout(200);
}

// « Tout le plan » avec un exemple déjà retenu pour le plan ; rend l'état une fois le calcul fini ou refusé.
async function toutLePlan(page) {
  await page.evaluate(function (rouge) {
    localStorage.setItem(window.KtaDetectionUI.PREFIXE + window._currentLoadedPlanId,
      JSON.stringify({ a: [{ rgb: rouge }], b: [], f: [] }));
    window.__dnToasts.length = 0;
    window.KtaDetectionUI.ouvrir();
  }, ROUGE);
  await page.waitForTimeout(300);
  await bouton(page, "zone");
  await bouton(page, "tout");
  try {
    await attendre(page, function () {
      const e = window.KtaDetectionUI.etat();
      return !e || e.etape === "zone" || e.etape === "apercu";
    }, 60000);
  } catch (e) { /* état rendu tel quel */ }
  return page.evaluate(function () {
    return { etat: window.KtaDetectionUI.etat(), toasts: window.__dnToasts.slice(),
             structures: window.getStructures().length };
  });
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
  await page.route(/tile\.openstreetmap\.org\//, function (route) { route.abort(); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await demarrer(page);
    const r = await page.evaluate(function (c) { return window.__dn.fabriquer(c); }, [ROUGE, VERT, BLEU]);
    if (!r.ok) throw new Error(r.raison);
    await attendreCalques(page);
    const base = await page.evaluate(function () {
      window.__dn.espionToasts();
      return { multi: window.APP_CONFIG.multiLevel === true, tuile: !!(window.PLAN_CONFIG.plan.tiledV2),
               visibles: window.APP_CONFIG.visibleLevels };
    });
    inf("image " + r.info.W + " × " + r.info.H + ", calques dn-a + dn-b (niveau 1), dn-z (niveau 0) ; " +
      "plan " + (base.tuile ? "tuilé V2" : "direct / V1") + ", niveaux affichés " + JSON.stringify(base.visibles));
    verifier(base.multi, "plan multi-niveau chargé");
    await page.evaluate(function () { window.FilterPanel.ouvrir(); });
    await page.waitForTimeout(500);

    // ── N1 : niveau sans calque ───────────────────────────────────────
    console.log("— N1 : niveau 2, sans calque image —");
    const n1 = await page.evaluate(function (s) { return window.__dn.lire(2, s); }, SENTINELLE);
    verifier(!n1.ok && n1.raison === "niveau-sans-image", "refus « niveau-sans-image »",
      { ok: n1.ok, source: n1.source, raison: n1.raison });
    verifier(n1.intacts === n1.total, "rien dessiné : l'image du niveau 0 n'est pas lue (" + n1.intacts + "/" +
      n1.total + " pixels intacts)", { centre: n1.centre });

    // ── N2 : calque masqué ────────────────────────────────────────────
    console.log("— N2 : calque masqué dans les filtres —");
    const n2a = await page.evaluate(function (s) { return window.__dn.lire(1, s); }, SENTINELLE);
    verifier(n2a.ok && n2a.source === "calques" && proches(n2a.centre, VERT, 1),
      "deux calques affichés : le calque du dessus (vert) est lu au centre", n2a);
    const cache = await page.evaluate(function () { return window.__dn.caseCalque("dn-b", false); });
    verifier(cache, "case du calque B décochée : overlay retiré de la carte");
    const n2 = await page.evaluate(function (s) { return window.__dn.lire(1, s); }, SENTINELLE);
    verifier(n2.ok && proches(n2.centre, ROUGE, 1) && n2.intacts === 0,
      "calque B masqué : pas lu, seuls les pixels du calque A (centre " + n2.centre + ")", n2);

    // ── N3 : tous masqués ─────────────────────────────────────────────
    console.log("— N3 : tous les calques du niveau masqués —");
    await page.evaluate(function () { window.__dn.caseCalque("dn-a", false); });
    const n3 = await page.evaluate(function (s) { return window.__dn.lire(1, s); }, SENTINELLE);
    verifier(!n3.ok && n3.raison === "calques-masques" && n3.intacts === n3.total,
      "refus « calques-masques », rien dessiné", { ok: n3.ok, source: n3.source, raison: n3.raison, intacts: n3.intacts });
    await page.evaluate(function () { window.__dn.caseCalque("dn-a", true); });

    // ── N4 : niveau 0 ─────────────────────────────────────────────────
    console.log("— N4 : niveau 0 —");
    const n4a = await page.evaluate(function (s) { return window.__dn.lire(0, s); }, SENTINELLE);
    await page.evaluate(function () { window.__dn.caseCalque("dn-z", false); });
    const n4b = await page.evaluate(function (s) { return window.__dn.lire(0, s); }, SENTINELLE);
    await page.evaluate(function () { window.__dn.caseCalque("dn-z", true); });
    inf("niveau 0 : source " + n4a.source + ", empreinte " + n4a.empreinte + ", centre " + n4a.centre);
    verifier(n4a.ok && n4a.source !== "calques" && n4a.intacts === 0, "image de base lue (" + n4a.source + ")", n4a);
    verifier(n4a.empreinte === n4b.empreinte && !proches(n4a.centre, BLEU, 30),
      "calque du niveau 0 ignoré : empreinte identique affiché ou masqué, pas de bleu", { a: n4a, b: n4b });

    // ── N5 : opacité ignorée ──────────────────────────────────────────
    console.log("— N5 : calque à 10 % —");
    const regle = await page.evaluate(function () {
      return { a: window.__dn.regler("dn-a", 10), z: window.__dn.regler("dn-z", 10) };
    });
    verifier(regle.a && regle.z, "curseurs des calques A et Z à 10 %", regle);
    const n5 = await page.evaluate(function (s) {
      return Promise.all([window.__dn.lire(1, s), window.__dn.lire(0, s)]);
    }, SENTINELLE);
    verifier(n5[0].empreinte === n2.empreinte && proches(n5[0].centre, ROUGE, 1),
      "niveau 1, calque A à 10 % : pixels identiques à 100 % (centre " + n5[0].centre + ")", { avant: n2, apres: n5[0] });
    verifier(n5[1].empreinte === n4a.empreinte, "niveau 0, calque Z à 10 % : pixels identiques", n5[1]);
    await page.evaluate(function () {
      window.__dn.regler("dn-a", 100); window.__dn.regler("dn-z", 100); window.__dn.caseCalque("dn-b", true);
      window.FilterPanel.fermer();
    });

    // ── N6 : parcours « Détecter » ─────────────────────────────────────
    console.log("— N6 : parcours Détecter —");
    const msgSans = await page.evaluate(function () { return window.I18n.t("detect.refus.niveau-sans-image"); });
    const msgMasq = await page.evaluate(function () { return window.I18n.t("detect.refus.calques-masques"); });
    verifier(msgSans && msgSans.indexOf("detect.") !== 0 && msgMasq && msgMasq.indexOf("detect.") !== 0,
      "messages de refus traduits", { msgSans: msgSans, msgMasq: msgMasq });
    const avant = await page.evaluate(function () {
      window.ktaSetActiveLevel(2);
      window.__dnToasts.length = 0;
      window.KtaDetectionUI.ouvrir();
      return window.getStructures().length;
    });
    await page.waitForTimeout(300);
    await page.evaluate(function (pt) { window.map.setView(window.convertCoord(pt.x, pt.y), 0, { animate: false }); },
      r.info.point);
    await page.waitForTimeout(300);
    // Sans exemple retenu, le parcours s'ouvre pipette « Masse A » armée.
    if ((await page.evaluate(function () { return window.KtaDetectionUI.etat().pipette; })) !== "a") {
      await bouton(page, "pipette-a");
    }
    await toucher(page, r.info.point.x, r.info.point.y);
    const p6 = await page.evaluate(function () {
      return { etat: window.KtaDetectionUI.etat(), toasts: window.__dnToasts.slice() };
    });
    verifier(p6.etat && p6.etat.exemples.a === 0 && p6.toasts.some(function (t) { return t.msg === msgSans; }),
      "niveau 2, pipette : refusée, message « " + msgSans + " », aucun exemple", p6);
    await page.evaluate(function () { window.KtaDetectionUI.fermer(); });
    const t6 = await toutLePlan(page);
    verifier(t6.etat && t6.etat.etape === "zone" && t6.toasts.some(function (t) { return t.msg === msgSans; }),
      "niveau 2, « Tout le plan » : refusé avec le même message", { etape: t6.etat && t6.etat.etape, toasts: t6.toasts });
    verifier(t6.structures === avant && !(t6.etat && t6.etat.apercu), "aucune structure créée, aucun aperçu",
      { avant: avant, apres: t6.structures });
    await page.evaluate(function () { window.KtaDetectionUI.fermer(); });

    await page.evaluate(function () {
      window.ktaSetActiveLevel(1);
      window.FilterPanel.ouvrir();
    });
    await page.waitForTimeout(400);
    await page.evaluate(function () {
      window.__dn.caseCalque("dn-a", false); window.__dn.caseCalque("dn-b", false); window.FilterPanel.fermer();
    });
    const m6 = await toutLePlan(page);
    verifier(m6.etat && m6.etat.etape === "zone" && m6.toasts.some(function (t) { return t.msg === msgMasq; }) &&
      m6.structures === avant, "niveau 1 calques masqués, « Tout le plan » : refusé, message « " + msgMasq + " »",
      { etape: m6.etat && m6.etat.etape, toasts: m6.toasts, structures: m6.structures });
    await page.evaluate(function () { window.KtaDetectionUI.fermer(); });

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
  console.log("🎉 CHECKUP VERT — image lue par la détection selon le niveau (" + joues.join(", ") + ")");
  process.exit(0);
})();
