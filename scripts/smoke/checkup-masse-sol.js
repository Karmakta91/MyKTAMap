#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-masse-sol.js — checkup (Playwright) : zone « Masse au sol » (masse-sol) et sa part comblée (comble)
// =====================================================================
// Relevé FICTIF, session semée en mémoire (rien lu ni écrit dans data/) : quatre masses au sol (¼, ½, ¾, sans
// valeur = ½), un Remblais et une eau. Puis :
// A. Carte : chaque masse au sol est peinte par un CanvasPattern de son cran (¼ ≠ ½ ≠ ¾, sans valeur = ½), tirets
//    courts ; le Remblais reste un aplat ; aucune erreur de page.
// B. Légende in-app : ligne « Masse au sol » à l'échantillon opaque (image) et contour en tirets ; bouton du groupe
//    Zones présent.
// C. Fiche : bloc « Part comblée » (¼ ½ ¾ Autre, ½ coché, mètres) ; ¾ appliqué (⏪ l'annule) ; « Autre » 1,2 →
//    confirmation chartée → la zone devient un Remblais, sans `comble`.
// D. Tableur : colonne `comble` (« ½ (défaut) » pour la zone sans valeur, lecture seule sur l'eau).
// E. KMZ relu par l'import de l'app (DOMParser) : type masse-sol et comble 0,75 gardés, −½ (sol abaissé) aussi.
// F. Rampes : « Placer une pente » (bord bas puis fin), chevrons, légende, ✕ et ⏪ dans la fiche.
// G. Ajuster les sommets (prise `plan` de ajusterSommets.js) : la rampe suit son segment (insertion avant, sommet né
//    sur son bord), disparaît avec lui (sommet supprimé) ; ⏪ remet tout.
// Sol abaissé (part négative, deuxième rangée −¼ −½ −¾) : motif à grains clairs en creux, distinct de chaque cran
// positif, densité qui suit |comble| ; fiche : crans −¾ −½ −¼, −½ appliqué, mètres « plus bas ».
// KTA_CAPTURES=<dossier hors dépôt> : captures de la carte (proche, dézoomée), de la légende, de la fiche, du Tableur.
// Usage : node scripts/smoke/checkup-masse-sol.js (SMOKE_PORT pour une autre copie de travail)
// Garde-fou logique associé : scripts/check-masse-sol.js · doc : docs/architecture/data-formats.md (Masse au sol)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const CAPTURES = process.env.KTA_CAPTURES || null;
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};

const problemes = [];
function pb(m) { problemes.push(m); console.log("  ❌ " + m); }
function ok(m) { console.log("  ✅ " + m); }
function verifier(c, m, d) { if (c) ok(m); else pb(m + (d !== undefined ? " " + JSON.stringify(d) : "")); }
async function capture(page, nom, opts) {
  if (CAPTURES) await page.screenshot(Object.assign({ path: path.join(CAPTURES, nom + ".png") }, opts || {}));
}

// Couche de la carte qui porte la fiche de l'objet `uid` (contenu de popup marqué data-kta-uid).
function ouvrirFiche(page, uid) {
  return page.evaluate(function (uid) {
    let cible = null;
    window.map.eachLayer(function (l) {
      const c = window.ktaHtmlFiche(l);
      if (!cible && typeof c === "string" && c.indexOf('data-kta-uid="' + uid + '"') >= 0) cible = l;
    });
    if (!cible) return false;
    cible.openPopup(cible.getBounds().getCenter());
    return true;
  }, uid);
}
const zoneDe = (page, uid) => page.evaluate(function (uid) {
  const z = window.getZones().find(function (o) { return o.uid === uid; });
  return z ? { type: z.type, comble: z.comble === undefined ? null : z.comble } : null;
}, uid);

(async function main() {
  if (CAPTURES) fs.mkdirSync(CAPTURES, { recursive: true });
  const nav = await lancerNavigateur(chromium);
  const erreurs = [];
  try {
    const ctx = await nav.newContext({ viewport: { width: 1300, height: 850 }, serviceWorkers: "block" });
    const page = await ctx.newPage();
    page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
    await page.addInitScript(function (ls) {
      for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
    }, LS_PREGATES);
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.getByText("Relevé fictif de test", { exact: false }).first().click();
    await attendre(page, function () {
      return !!window.PLAN_CONFIG && !!window.map && !!window.KtaConvertir && !!window.HistoryManager &&
        typeof window.setZones === "function";
    }, 60000);
    await page.waitForTimeout(3000);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    });

    // Session fictive : six zones en rangée autour du centre de la vue.
    const json = await page.evaluate(function () {
      const c = window.map.getCenter(), H = window.APP_CONFIG.imageHeight;
      const x0 = Math.round(c.lng) - 150, y0 = Math.round(H - c.lat) - 20;
      const sc = window.APP_CONFIG.scale;
      // Rectangle de w × h m, son coin à (dx, dy) px de (x0, y0).
      const m = function (dx, dy, w, h) {
        const x = x0 + dx, y = y0 + dy;
        return [{ x: x, y: y }, { x: x + w * sc, y: y }, { x: x + w * sc, y: y + h * sc }, { x: x, y: y + h * sc }];
      };
      const r = function (i, dy) {
        const x = x0 + i * 50, y = y0 + (dy || 0);
        return [{ x: x, y: y }, { x: x + 40, y: y }, { x: x + 40, y: y + 30 }, { x: x, y: y + 30 }];
      };
      window.HistoryManager.reset();
      window.setRoads([]); window.setStructures([]); window.setEditorPoints([]);
      window.setZones([
        { uid: "zn_m25", type: "masse-sol", comble: 0.25, points: r(0) },
        { uid: "zn_m50", type: "masse-sol", comble: 0.5, points: r(1) },
        { uid: "zn_m75", type: "masse-sol", comble: 0.75, points: r(2) },
        { uid: "zn_m00", type: "masse-sol", points: r(3) },
        { uid: "zn_rem", type: "remblais", points: r(4) },
        { uid: "zn_eau", type: "eau", points: r(5) },
        { uid: "zn_n25", type: "masse-sol", comble: -0.25, points: r(0, 40) },
        { uid: "zn_n50", type: "masse-sol", comble: -0.5, points: r(1, 40) },
        { uid: "zn_n75", type: "masse-sol", comble: -0.75, points: r(2, 40) },
        // Bande de 2 m à ¾ avec deux rampes opposées (le sommet est à mi-cran) ; carré de 30 m à ¼, rampe seule.
        { uid: "zn_court", type: "masse-sol", comble: 0.75, points: m(0, 80, 20, 2), rampes: [{ bord: 0 }, { bord: 2 }] },
        { uid: "zn_long", type: "masse-sol", comble: 0.25, points: m(0, 80 + 4 * sc, 30, 30), rampes: [{ bord: 3 }] }
      ]);
      window.map.fitBounds([[H - y0 - 80, x0 - 10], [H - y0 + 10, x0 + 300]], { animate: false });
      return JSON.stringify({ type: "devmap-session", version: "1.0", editorPoints: [], roads: [],
        zones: window.getZones(), structures: [] });
    });
    await page.waitForTimeout(800);

    // ── A. Carte ──
    const a = await page.evaluate(function () {
      const par = {};
      window.map.eachLayer(function (l) {
        const c = window.ktaHtmlFiche(l);
        const m = typeof c === "string" && /data-kta-uid="([^"]+)"/.exec(c);
        if (m && l.options) par[m[1]] = l.options;
      });
      const motif = function (u) { return !!(par[u] && par[u].fillColor instanceof CanvasPattern); };
      return { motifs: ["zn_m25", "zn_m50", "zn_m75", "zn_m00"].map(motif),
        distincts: par.zn_m25 && par.zn_m50 && par.zn_m75 && par.zn_m25.fillColor !== par.zn_m50.fillColor &&
          par.zn_m50.fillColor !== par.zn_m75.fillColor,
        defautEgalDemi: par.zn_m00 && par.zn_m50 && par.zn_m00.fillColor === par.zn_m50.fillColor,
        tirets: par.zn_m50 && par.zn_m50.dashArray, rembAplat: par.zn_rem && typeof par.zn_rem.fillColor === "string",
        creux: ["zn_n25", "zn_n50", "zn_n75"].map(motif),
        creuxDistincts: ["zn_n25", "zn_n50", "zn_n75"].every(function (n) {
          return par[n] && ["zn_m25", "zn_m50", "zn_m75", "zn_n25", "zn_n50", "zn_n75"].every(function (m) {
            return m === n || (par[m] && par[m].fillColor !== par[n].fillColor);
          });
        }),
        creuxTirets: par.zn_n50 && par.zn_n50.dashArray };
    });
    verifier(a.motifs.every(Boolean), "carte : chaque masse au sol peinte par un CanvasPattern", a.motifs);
    verifier(a.distincts, "carte : ¼, ½ et ¾ ont chacun leur motif (densité des grains)");
    verifier(a.defautEgalDemi, "carte : une masse au sol sans valeur a le motif du cran ½");
    verifier(a.tirets === "4 3" && a.rembAplat, "carte : contour en tirets courts « 4 3 », le Remblais reste un aplat", a);
    verifier(a.creux.every(Boolean) && a.creuxDistincts && a.creuxTirets === "4 3",
      "carte : sol abaissé −¼ −½ −¾ peint par son propre motif (grains en creux), distinct de chaque cran, " +
      "mêmes tirets", a);
    await capture(page, "1-carte-crans-proche");
    await page.evaluate(function () { window.map.setZoom(window.map.getZoom() - 2, { animate: false }); });
    await page.waitForTimeout(600);
    await capture(page, "2-carte-crans-dezoom");
    await page.evaluate(function () { window.map.setZoom(window.map.getZoom() + 2, { animate: false }); });
    await page.waitForTimeout(400);

    // ── B. Légende et bouton du groupe Zones ──
    await page.evaluate(function () { window.afficherLegende(); });
    await page.waitForSelector("#kta-legende-modal");
    const b = await page.evaluate(function () {
      const lignes = Array.from(document.querySelectorAll("#kta-legende-modal .kta-legende-ligne"));
      const l = lignes.find(function (x) { return /Masse au sol/.test(x.textContent); });
      const trait = l && l.querySelector(".kta-legende-trait");
      return { ligne: !!l, image: !!trait && /url\(/.test(trait.style.background || trait.getAttribute("style")),
        tirets: !!trait && /dashed/.test(trait.getAttribute("style") || "") };
    });
    verifier(b.ligne && b.image && b.tirets, "légende : « Masse au sol », échantillon opaque (image) et contour en tirets", b);
    const lg = await page.$("#kta-legende-modal .kta-readme-modal-boite, #kta-legende-modal");
    if (lg && CAPTURES) await lg.screenshot({ path: path.join(CAPTURES, "3-legende.png") });
    await page.evaluate(function () { window.afficherLegende(); });   // bascule : referme
    // Groupe Zones en menu flottant : ses boutons n'existent qu'une fois le menu ouvert.
    const bouton = await page.evaluate(function () {
      window.ktaOuvrirOutils("zones", { vue3d: false });
      const vu = Array.from(document.querySelectorAll(".kta-group-flyout-btn-label")).some(function (e) {
        return e.textContent.trim() === window.I18n.t("ui.zone.masseSol");
      });
      window.ktaFermerOutils();
      return vu;
    });
    verifier(bouton, "groupe Zones : bouton « Masse au sol »");

    // ── C. Fiche ──
    verifier(await ouvrirFiche(page, "zn_m00"), "fiche de la masse au sol sans valeur ouverte");
    await page.waitForTimeout(400);
    const c0 = await page.evaluate(function () {
      const bloc = document.querySelector(".leaflet-popup-content .kta-note-popup-comble");
      if (!bloc) return null;
      const r = Array.from(bloc.querySelectorAll('input[type="radio"]'));
      return { crans: r.map(function (x) { return x.value; }), coche: (r.find(function (x) { return x.checked; }) || {}).value,
        metres: (bloc.querySelector(".kta-note-popup-comble-metres") || {}).textContent || "" };
    });
    const crans = ["-0.75", "-0.5", "-0.25", "0.25", "0.5", "0.75", "autre"];
    verifier(!!c0 && JSON.stringify(c0.crans) === JSON.stringify(crans) && c0.coche === "0.5" && /≈/.test(c0.metres),
      "fiche : crans −¾ −½ −¼ ¼ ½ ¾ Autre, ½ coché par défaut, mètres affichés", c0);
    await capture(page, "4-fiche-part-comblee");
    await page.evaluate(function () {
      document.querySelector('.leaflet-popup-content .kta-note-popup-comble input[value="0.75"]').click();
      document.querySelector(".leaflet-popup-content .kta-note-popup-comble-appliquer").click();
    });
    await page.waitForTimeout(400);
    verifier(JSON.stringify(await zoneDe(page, "zn_m00")) === JSON.stringify({ type: "masse-sol", comble: 0.75 }),
      "fiche : ¾ appliqué");
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(300);
    // Sol abaissé : −½ coché, mètres « plus bas » en direct, appliqué ; ⏪ le retire.
    await ouvrirFiche(page, "zn_m00");
    await page.waitForTimeout(400);
    const cn = await page.evaluate(function () {
      const bloc = document.querySelector(".leaflet-popup-content .kta-note-popup-comble");
      const r = bloc.querySelector('input[value="-0.5"]');
      r.click();
      r.dispatchEvent(new Event("change", { bubbles: true }));
      const m = (bloc.querySelector(".kta-note-popup-comble-metres") || {}).textContent || "";
      bloc.querySelector(".kta-note-popup-comble-appliquer").click();
      return { metres: m, libelle: r.parentNode.textContent.trim() };
    });
    await capture(page, "4b-fiche-sol-abaisse");
    await page.waitForTimeout(400);
    verifier(JSON.stringify(await zoneDe(page, "zn_m00")) === JSON.stringify({ type: "masse-sol", comble: -0.5 }) &&
      /plus bas/.test(cn.metres) && cn.libelle === "−½", "fiche : −½ appliqué, « sol … plus bas » affiché", cn);
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(300);
    // Sous −1 : refusé dans la fiche, qui le dit.
    await ouvrirFiche(page, "zn_m00");
    await page.waitForTimeout(400);
    const tb1 = await page.evaluate(function () {
      const i = document.querySelector(".leaflet-popup-content .kta-note-popup-comble-autre");
      i.value = "-1,5";
      i.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector(".leaflet-popup-content .kta-note-popup-comble-appliquer").click();
      const st = document.querySelector(".leaflet-popup-content .kta-note-popup-status");
      return st ? st.textContent : "";
    });
    const z00 = JSON.stringify(await zoneDe(page, "zn_m00"));
    verifier(/−1/.test(tb1) && z00 === JSON.stringify({ type: "masse-sol", comble: null }),
      "fiche : −1,5 refusé (message), la zone ne change pas", tb1);
    await page.evaluate(function () { if (window.map.closePopup) window.map.closePopup(); });
    verifier(JSON.stringify(await zoneDe(page, "zn_m00")) === JSON.stringify({ type: "masse-sol", comble: null }),
      "⏪ : la part comblée revient à son absence (½)");
    await ouvrirFiche(page, "zn_m75");
    await page.waitForTimeout(400);
    await page.evaluate(function () {
      const i = document.querySelector(".leaflet-popup-content .kta-note-popup-comble-autre");
      i.value = "1,2";
      i.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector(".leaflet-popup-content .kta-note-popup-comble-appliquer").click();
    });
    await page.waitForSelector("#kta-confirm-oui", { timeout: 5000 }).catch(function () {});
    const confirme = await page.evaluate(function () {
      const o = document.getElementById("kta-confirm-oui");
      if (!o) return false;
      o.click();
      return true;
    });
    await page.waitForTimeout(400);
    const z75 = await zoneDe(page, "zn_m75");
    verifier(confirme && z75 && z75.type === "remblais" && z75.comble === null,
      "fiche : « Autre » 1,2 → confirmation → la zone devient un Remblais, sans part comblée", z75);
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(300);

    // Hauteur atteinte : jamais dans la fiche (décision produit : 3D et volume seulement, à la demande). Ouvrir la fiche
    // d'une masse à rampes (bande courte : la hauteur atteinte serait sous le cran) ne la calcule pas.
    const att = async function (uid) {
      await page.evaluate(function () {
        const M = window.KtaMasseSol;
        window.__nAtteinte = 0;
        ["atteinteZone", "atteinte"].forEach(function (k) {
          if (!M["__" + k]) M["__" + k] = M[k];
          M[k] = function () { window.__nAtteinte++; return M["__" + k].apply(null, arguments); };
        });
      });
      await ouvrirFiche(page, uid);
      await page.waitForTimeout(400);
      return page.evaluate(function () {
        const M = window.KtaMasseSol, c = document.querySelector(".leaflet-popup-content");
        ["atteinteZone", "atteinte"].forEach(function (k) { M[k] = M["__" + k]; delete M["__" + k]; });
        return { appels: window.__nAtteinte, ligne: !!document.querySelector(".kta-note-popup-comble-atteinte"),
          texte: /atteinte/i.test(c ? c.textContent : ""), metres: !!(c && c.querySelector(".kta-note-popup-comble-metres")) };
      });
    };
    const aCourt = await att("zn_court");
    await capture(page, "4c-fiche-sans-hauteur-atteinte");
    const aLong = await att("zn_long");
    verifier([aCourt, aLong].every(function (a) { return a.appels === 0 && !a.ligne && !a.texte && a.metres; }),
      "fiche : part comblée seule (cran et mètres), aucune « hauteur atteinte », jamais calculée à l'ouverture " +
      "(0 appel à atteinteZone / atteinte)", { aCourt, aLong });
    await page.evaluate(function () { if (window.map.closePopup) window.map.closePopup(); });

    // ── D. Tableur ──
    await page.evaluate(function () { window.ouvrirTableEditor(); });
    await page.click("#kta-tbl-src-json");
    await page.setInputFiles("#kta-tbl-file", { name: "session-masse.json", mimeType: "application/json",
      buffer: Buffer.from(json, "utf8") });
    // Un seul tableau dans le fichier (zones) : l'éditeur l'ouvre directement, sans liste de choix.
    await page.waitForSelector(".kta-tbl-entry, #kta-tbl-table thead th");
    const i = await page.evaluate(function () {
      const libelle = window.I18n.t("tabledit.kind.zones");
      return Array.prototype.slice.call(document.querySelectorAll(".kta-tbl-entry")).findIndex(function (bt) {
        const n = bt.querySelector(".kta-tbl-entry-count");
        return !!n && n.textContent.trim().endsWith(" " + libelle);
      });
    });
    if (i >= 0) await page.click('.kta-tbl-entry[data-i="' + i + '"]');
    await page.waitForSelector("#kta-tbl-table thead th");
    const d = await page.evaluate(function () {
      const cols = Array.from(document.querySelectorAll("#kta-tbl-table thead th[data-col]")).map(function (t) { return t.dataset.col; });
      const cell = function (row) { return document.querySelector('#kta-tbl-table td[data-col="comble"][data-idx="' + row + '"]'); };
      return { cols: cols, c25: cell(0) && cell(0).textContent.trim(), c00: cell(3) && cell(3).textContent.trim(),
        eauRo: !!cell(5) && cell(5).classList.contains("col-readonly") };
    });
    verifier(d.cols.indexOf("comble") >= 0, "Tableur : colonne comble", d.cols);
    const rp = await page.evaluate(function () {
      const c = document.querySelector('#kta-tbl-table td[data-col="rampes"][data-idx="10"]');
      return c ? { texte: c.textContent.trim(), ro: c.classList.contains("col-readonly") } : null;
    });
    verifier(!!rp && /\(1\)/.test(rp.texte) && rp.ro, "Tableur : colonne rampes en lecture seule (« oui (1) »)", rp);
    verifier(d.c25 === "¼" && /½/.test(d.c00 || "") && d.eauRo,
      "Tableur : ¼ affiché, « ½ (défaut) » pour la zone sans valeur, lecture seule sur l'eau", d);
    const tb = await page.$("#kta-tbl-modal .kta-readme-modal-boite, #kta-tbl-modal");
    if (tb && CAPTURES) await tb.screenshot({ path: path.join(CAPTURES, "5-tableur-comble.png") });
    await page.evaluate(function () { const m = document.getElementById("kta-tbl-modal"); if (m) m.remove(); });

    // ── E. KMZ relu par l'import de l'app ──
    const k = await page.evaluate(function () {
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      const tr = window.KmzExport.buildTransformCalib({
        pointA: { x: 0, y: H, lat: 46.5, lng: 3.0 }, pointB: { x: W, y: 0, lat: 46.51, lng: 3.02 },
        pointC: { x: W, y: H, lat: 46.5, lng: 3.02 }
      });
      const kml = window.KmzExport.genererKml({ transform: tr, planName: "Test", include: { zones: true }, levels: null,
        data: { editorPoints: [], roads: [], zones: window.getZones().filter(function (z) {
          return z.uid === "zn_m75" || z.uid === "zn_m00" || z.uid === "zn_n50";
        }),
          structures: [] } });
      const doc = new DOMParser().parseFromString(kml, "application/xml");
      const trImp = window.KmzImport.buildTransform({ nw: { lat: 46.51, lng: 3.0 }, ne: { lat: 46.51, lng: 3.02 } }, W, H);
      const lu = window.KmzImport.ingestPlacemarks(doc, trImp, { pointTag: "info", roadType: "chemin", zoneType: "eau" });
      return lu.zones.map(function (z) { return { type: z.type, comble: z.comble === undefined ? null : z.comble }; });
    });
    verifier(k.length === 3 && k.every(function (z) { return z.type === "masse-sol"; }) &&
      k.some(function (z) { return z.comble === 0.75; }) && k.some(function (z) { return z.comble === null; }) &&
      k.some(function (z) { return z.comble === -0.5; }),
      "KMZ relu : trois masses au sol, ¾ et −½ gardés, la zone sans valeur reste sans valeur (½)", k);

    // ── F. Rampes : « Placer une pente » dans la fiche, un toucher près du bord bas, chevrons, légende, ✕ ──
    const zrp = await page.evaluate(function () {
      // Chevrons de pente posés sur la carte (canvas : comptés par leurs couches, pas dans le DOM).
      window.__ktaChevrons = function () {
        let k = 0;
        window.map.eachLayer(function (l) { if (l.options && l.options.className === "kta-rampe-chevron") k++; });
        return k;
      };
      const sc = window.APP_CONFIG.scale, c = window.map.getCenter(), H = window.APP_CONFIG.imageHeight;
      const x0 = Math.round(c.lng), y0 = Math.round(H - c.lat);
      const pts = [{ x: x0, y: y0 }, { x: x0 + 20 * sc, y: y0 }, { x: x0 + 20 * sc, y: y0 + 10 * sc },
        { x: x0, y: y0 + 10 * sc }];
      window.setZones(window.getZones().concat([{ uid: "zn_rp", type: "masse-sol", comble: 0.5, points: pts }]));
      window.map.fitBounds([[H - y0 - 12 * sc, x0 - 2 * sc], [H - y0 + 2 * sc, x0 + 22 * sc]], { animate: false });
      return { x0: x0, y0: y0, sc: sc };
    });
    await page.waitForTimeout(500);
    verifier(await ouvrirFiche(page, "zn_rp"), "rampes : fiche de la masse au sol ouverte");
    await page.waitForTimeout(400);
    const f0 = await page.evaluate(function () {
      const b = document.querySelector(".leaflet-popup-content .kta-note-popup-rampe-placer");
      const v = document.querySelector(".leaflet-popup-content .kta-note-popup-rampes");
      return { bouton: !!b, aucune: v ? v.textContent : "" };
    });
    await page.evaluate(function () {
      document.querySelector(".leaflet-popup-content .kta-note-popup-rampe-placer").click();
    });
    await page.waitForTimeout(300);
    const arme = await page.evaluate(function () {
      const fl = document.getElementById("kta-rampe-floater");
      return { bandeau: fl ? fl.textContent : null, clicCarte: window._modeClicCarteActif() };
    });
    // Un toucher loin de tout bord (le centre), puis un toucher à 0,2 m du bord ouest (bord 3).
    const toucher = function (x, y) {
      return page.evaluate(function (q) {
        const H = window.APP_CONFIG.imageHeight;
        window.map.fire("click", { latlng: L.latLng(H - q.y, q.x) });
      }, { x: x, y: y });
    };
    await toucher(zrp.x0 + 10 * zrp.sc, zrp.y0 + 5 * zrp.sc);
    await page.waitForTimeout(200);
    const loin = await page.evaluate(function () { return !!document.getElementById("kta-rampe-floater"); });
    await toucher(zrp.x0 + 0.2 * zrp.sc, zrp.y0 + 5 * zrp.sc);
    await page.waitForTimeout(300);
    // 2e toucher : la fin de la pente, à 8 m du bord ouest (au-delà : plat au cran).
    const bandeauFin = await page.evaluate(function () {
      const fl = document.getElementById("kta-rampe-floater");
      return fl ? fl.textContent : null;
    });
    await toucher(zrp.x0 + 8 * zrp.sc, zrp.y0 + 5 * zrp.sc);
    await page.waitForTimeout(500);
    const pose = await page.evaluate(function () {
      const z = window.getZones().filter(function (q) { return q.uid === "zn_rp"; })[0];
      return { rampes: z && z.rampes ? JSON.stringify(z.rampes) : null,
        bandeau: !!document.getElementById("kta-rampe-floater"),
        chevrons: window.__ktaChevrons() };
    });
    const r2 = function (v) { return Math.round(v * 100) / 100; };
    const finAtt = JSON.stringify([{ bord: 3, fin: { x: r2(zrp.x0 + 8 * zrp.sc), y: r2(zrp.y0 + 5 * zrp.sc) } }]);
    verifier(f0.bouton && /pleine hauteur/.test(f0.aucune) && /bord bas/.test(arme.bandeau || "") && arme.clicCarte &&
      loin && /atteint le haut/.test(bandeauFin || "") && /Sans fin/.test(bandeauFin || "") && pose.rampes === finAtt &&
      !pose.bandeau && pose.chevrons > 0,
      "rampes : « Placer une pente », toucher loin d'un bord ignoré, bord ouest puis fin à 8 m → rampe posée avec sa " +
      "fin, chevrons et trait de fin", { f0: f0, arme: arme, loin: loin, bandeauFin: bandeauFin, pose: pose });
    await capture(page, "6-carte-rampe-chevrons");
    await page.evaluate(function () { window.map.setZoom(window.map.getZoom() - 2, { animate: false }); });
    await page.waitForTimeout(500);
    await capture(page, "7-carte-rampe-dezoom");
    await page.evaluate(function () { window.map.setZoom(window.map.getZoom() + 2, { animate: false }); });
    await page.waitForTimeout(400);
    await page.evaluate(function () { window.afficherLegende(); });
    await page.waitForSelector("#kta-legende-modal");
    const lgR = await page.evaluate(function () {
      const l = Array.from(document.querySelectorAll("#kta-legende-modal .kta-legende-ligne")).find(function (x) {
        return /Pente d'une masse au sol/.test(x.textContent);
      });
      return { ligne: !!l, svg: !!(l && l.querySelector(".kta-legende-rampe svg")) };
    });
    const lgElR = await page.$("#kta-legende-modal .kta-readme-modal-boite, #kta-legende-modal");
    if (lgElR && CAPTURES) await lgElR.screenshot({ path: path.join(CAPTURES, "8-legende-rampe.png") });
    await page.evaluate(function () {
      const m = document.getElementById("kta-legende-modal");
      const x = m && m.querySelector(".kta-panneau-close, .kta-readme-modal-close");
      if (x) x.click(); else if (m) m.remove();
    });
    verifier(lgR.ligne && lgR.svg, "légende : ligne « Pente d'une masse au sol » (chevron) quand une zone a une rampe", lgR);
    verifier(await ouvrirFiche(page, "zn_rp"), "rampes : fiche rouverte");
    await page.waitForTimeout(400);
    await capture(page, "9-fiche-pentes");
    const lst = await page.evaluate(function () {
      const l = Array.from(document.querySelectorAll(".leaflet-popup-content .kta-note-popup-rampe"));
      const t = l.map(function (x) { return x.textContent.trim(); });
      const b = document.querySelector(".leaflet-popup-content .kta-note-popup-rampe-retirer");
      if (b) b.click();
      return t;
    });
    await page.waitForTimeout(400);
    const ret = await page.evaluate(function () {
      const z = window.getZones().filter(function (q) { return q.uid === "zn_rp"; })[0];
      return { rampes: z && "rampes" in z, chevrons: window.__ktaChevrons() };
    });
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(300);
    const annule = await page.evaluate(function () {
      const z = window.getZones().filter(function (q) { return q.uid === "zn_rp"; })[0];
      return z && z.rampes ? JSON.stringify(z.rampes) : null;
    });
    verifier(lst.length === 1 && /→/.test(lst[0]) && /avec fin/.test(lst[0]) && !ret.rampes && annule === finAtt,
      "rampes : la fiche liste la pente (monte vers →), ✕ la retire (pleine hauteur), ⏪ la remet", { lst, ret, annule });

    // ── G. Les rampes suivent leur segment quand on ajuste les sommets (masseSol.js > suivreBords) ──
    // zn_rp : rectangle p0 p1 p2 p3, rampe sur le bord 3 (p3 → p0, côté ouest) avec sa fin.
    const bg = await page.evaluate(function () {
      window.map.closePopup();
      const A = window.KtaAjusterSommets.plan, H = window.HistoryManager;
      const z = function () { return window.getZones().filter(function (q) { return q.uid === "zn_rp"; })[0]; };
      const garder = function (f, o) { return o.uid === "zn_rp"; };
      const cote = function () {   // le segment physique de la rampe : ses deux sommets
        const o = z(), r = o.rampes && o.rampes[0];
        if (!r) return null;
        const n = o.points.length, a = o.points[r.bord], b = o.points[(r.bord + 1) % n];
        return { bord: r.bord, n: n, a: [a.x, a.y], b: [b.x, b.y], fin: r.fin ? [r.fin.x, r.fin.y] : null };
      };
      const p = z().points.map(function (q) { return { x: q.x, y: q.y }; }), r = {};
      r.avant = cote();
      // Sommet né au milieu du bord 0 (p0 → p1), AVANT le bord de la rampe : elle passe au bord 4, même segment.
      const c1 = A.saisir((p[0].x + p[1].x) / 2, p[0].y, 2, garder);
      r.genre1 = c1 && c1.genre;
      r.ajoute = A.lacher(c1, null, 2);
      r.insere = cote();
      H.undo();
      r.annuleInsere = cote();
      // Sommet né au milieu du bord de la rampe lui-même (p3 → p0, côté de fermeture) : la rampe garde la 1re moitié.
      const c2 = A.saisir(p[0].x, (p[0].y + p[3].y) / 2, 2, garder);
      r.ajoute2 = A.lacher(c2, null, 2);
      r.coupe = cote();
      H.undo();
      // Suppression du sommet p0 : le segment p3 → p0 disparaît, la rampe aussi ; ⏪ la remet.
      const c3 = A.saisir(p[0].x, p[0].y, 2, garder);
      r.genre3 = c3 && c3.genre;
      r.supprime = A.supprimer(c3);
      r.apresSuppr = { n: z().points.length, rampes: "rampes" in z() };
      H.undo();
      r.annuleSuppr = cote();
      r.p = p.map(function (q) { return [q.x, q.y]; });
      return r;
    });
    const J = JSON.stringify, P = bg.p;
    verifier(bg.avant && bg.avant.bord === 3 && J(bg.avant.a) === J(P[3]) && J(bg.avant.b) === J(P[0]) &&
      bg.genre1 === "milieu" && bg.ajoute === "ajoute" && bg.insere && bg.insere.n === 5 && bg.insere.bord === 4 &&
      J(bg.insere.a) === J(P[3]) && J(bg.insere.b) === J(P[0]) && J(bg.insere.fin) === J(bg.avant.fin),
      "rampes : sommet inséré avant le bord de la rampe (bord 3 → 4) : elle reste sur le même segment, fin inchangée",
      bg);
    verifier(J(bg.annuleInsere) === J(bg.avant), "rampes : ⏪ de l'insertion → bord 3, 4 sommets", bg.annuleInsere);
    verifier(bg.ajoute2 === "ajoute" && bg.coupe && bg.coupe.bord === 3 && bg.coupe.n === 5 &&
      J(bg.coupe.a) === J(P[3]) && bg.coupe.b[0] === P[0][0],
      "rampes : sommet né sur le bord de la rampe : elle garde la première moitié du côté coupé", bg.coupe);
    verifier(bg.genre3 === "sommet" && bg.supprime === true && bg.apresSuppr.n === 3 && !bg.apresSuppr.rampes &&
      J(bg.annuleSuppr) === J(bg.avant),
      "rampes : sommet supprimé au bout du bord de la rampe → segment disparu, rampe retirée ; ⏪ la remet", bg);

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — masse au sol : motif par cran, légende, fiche, Tableur, KMZ relu.");
  process.exit(0);
})();
