#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-exports-structures.js — checkup (Playwright, pas un hook pré-commit) : ce que les exports emportent
// =====================================================================
// Le relevé fictif devient un plan LOCAL (ZIP construit dans la page) auquel on ajoute un calque de données
// fabriqué : les 5 structures intégrées, une structure personnalisée en LIGNE et une en polygone (`cust-…`,
// légende du plan), une structure au type brut sans entrée de légende, et de même pour tracés et zones ; des
// points de chaque tag du catalogue, un point sans tag, un point au tag inconnu. Puis :
//   • KMZ (par la fenêtre d'export) : Placemarks par famille = objets du calque, ligne personnalisée en
//     LineString avec son <Style> à la couleur de la légende ; une icône par tag, présente et non vide ;
//   • image (pipeline commun PNG / PDF) : un pixel de la couleur attendue sur chaque structure personnalisée,
//     légende de l'export qui porte ces couleurs ;
//   • ≡ Légende : la ligne « Point sans tag » montre icon/default.png ;
//   • ≡ Filtres : une ligne par type personnalisé, une pastille de couleur, aucun ✨ en double.
// Usage : node scripts/smoke/checkup-exports-structures.js (SMOKE_PORT pour une autre copie) · doc : exports.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};
// Couleurs fictives des types personnalisés, choisies loin de la charte pour être reconnues au pixel.
const COUL = { sFront: "#12ab34", sPil: "#3344ee", trace: "#ee7711", zone: "#aa22cc" };

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const page = await nav.newPage({ viewport: { width: 1200, height: 850 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  try {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await attendre(page, function () { return !!window.PlanRegistry && typeof window.chargerZipFichier === "function"; }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });

    // ── Plan local : relevé fictif + calque fabriqué + légende personnalisée du plan ──
    const ouvert = await page.evaluate(async function (C) {
      const srv = window.PlanRegistry.getAll().find(function (p) { return p.type === "server" && /fictif/i.test(p.name || ""); });
      if (!srv || !srv.path) return { ok: false, raison: "relevé fictif absent de l'index" };
      const cfg = JSON.parse(await (await fetch(srv.path + "/plan-config.json")).text());
      const zip = new JSZip();
      const chemins = [cfg.plan.baseImage, cfg.plan.collisionImage]
        .concat((cfg.imageLayers || []).map(function (l) { return l.file; }), (cfg.dataLayers || []).map(function (l) { return l.file; }))
        .filter(function (p) { return typeof p === "string" && p && !/^(data:|blob:|https?:)/.test(p); });
      for (const p of Array.from(new Set(chemins))) {
        const r = await fetch(window.resolveServerPath(p, srv.path));
        if (r.ok) zip.file(p, await r.blob());
      }
      const img = new Image();
      img.src = window.resolveServerPath(cfg.plan.baseImage, srv.path);
      await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      // Objets dans le quart central, à l'écart les uns des autres (cases de 8 × 8).
      const pas = Math.floor(Math.min(W, H) / 20), x0 = Math.floor(W / 2 - 4 * pas), y0 = Math.floor(H / 2 - 4 * pas);
      function carre(i, j) {
        const x = x0 + i * pas, y = y0 + j * pas, d = Math.floor(pas * 0.7);
        return [{ x: x, y: y }, { x: x + d, y: y }, { x: x + d, y: y + d }, { x: x, y: y + d }];
      }
      function trait(i, j) { const x = x0 + i * pas, y = y0 + j * pas; return [{ x: x, y: y }, { x: x + Math.floor(pas * 0.8), y: y }]; }
      const structures = [
        { type: "pilier-1", points: carre(0, 0) }, { type: "pilier-2", points: carre(1, 0) }, { type: "mur", points: carre(2, 0) },
        { type: "front-1", points: trait(3, 0) }, { type: "front-2", points: trait(4, 0) },
        { type: "cust-ckpil", points: carre(0, 1) }, { type: "cust-ckfront", points: trait(1, 1) },
        { type: "ckbrut", points: carre(2, 1) }
      ].map(function (s) { s.level = 0; return s; });
      const roads = [
        { type: "principal", points: trait(0, 3) }, { type: "cust-cktrace", points: trait(1, 3) }, { type: "ckbrut", points: trait(2, 3) }
      ].map(function (s) { s.level = 0; return s; });
      const zones = [
        { type: "eau", points: carre(0, 4) }, { type: "cust-ckzone", points: carre(1, 4) }, { type: "ckbrut", points: carre(2, 4) }
      ].map(function (s) { s.level = 0; return s; });
      const tags = Object.keys(window._ktaBuiltinIconUrls);
      const data = tags.map(function (t, k) { return { id: "ck-" + t, nom: "ck " + t, tags: [t], x: x0 + k * 7, y: y0 + 6 * pas, level: 0 }; });
      data.push({ id: "ck-sans-tag", nom: "ck sans tag", tags: [], x: x0, y: y0 + 7 * pas, level: 0 });
      data.push({ id: "ck-inconnu", nom: "ck inconnu", tags: ["inconnu_ck"], x: x0 + 20, y: y0 + 7 * pas, level: 0 });
      zip.file("checkup/calque.json", JSON.stringify({ data: data, roads: roads, zones: zones, structures: structures }));
      cfg.dataLayers = (cfg.dataLayers || []).concat([{ id: "ck-calque", label: "Calque checkup", file: "checkup/calque.json", visible: true }]);
      cfg.plan.customLegend = { customEntries: [
        { id: "cust-ckfront", category: "structures", label: "Front checkup", geometry: "polyline", lineColor: C.sFront },
        { id: "cust-ckpil", category: "structures", label: "Pilier checkup", geometry: "polygon", fillColor: C.sPil, borderColor: "#000000" },
        { id: "cust-cktrace", category: "traces", label: "Trace checkup", lineColor: C.trace },
        { id: "cust-ckzone", category: "zones", label: "Zone checkup", fillColor: C.zone, borderColor: C.zone }
      ] };
      // Icônes de plan qu'un KMZ ne peut pas reprendre telles quelles : un SVG embarqué dans le ZIP (`pe`) et
      // un chemin mort (`pa`, la carte se replie sur le catalogue).
      zip.file("checkup/pe.svg", '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
        '<circle cx="32" cy="32" r="28" fill="#1166dd"/></svg>');
      cfg.icons = Object.assign({}, cfg.icons || {}, { pe: "checkup/pe.svg", pa: "checkup/absente.png" });
      zip.file("plan-config.json", JSON.stringify(cfg));
      const blob = await zip.generateAsync({ type: "blob" });
      await window.chargerZipFichier(new File([blob], "fictif-exports.zip", { type: "application/zip" }), "auto", { storeBlob: true });
      return { ok: true, attendu: { structures: structures.length, roads: roads.length, zones: zones.length, points: data.length }, tags: tags };
    }, COUL);
    if (!ouvert.ok) throw new Error(ouvert.raison);
    await attendre(page, function () {
      return !!window.PLAN_CONFIG && !!window.map && !!window._iconMap &&
        (window._ktaDataStructurePolygons || []).some(function (e) { return e.type === "cust-ckfront"; });
    }, 60000);
    await page.waitForTimeout(2500);
    const A = ouvert.attendu;
    // Objets du calque fabriqué tels que l'app les a chargés (le relevé fictif en apporte d'autres).
    const charge = await page.evaluate(function () {
      function du(arr) { return (arr || []).filter(function (o) { return o.layerId === "ck-calque"; }).length; }
      return {
        structures: du(window.getAllEmbeddedStructures()), roads: du(window.getAllEmbeddedRoads()),
        zones: du(window.getAllEmbeddedZones()),
        points: (window._ktaDataMarkers || []).filter(function (m) { return m._ktaLayerId === "ck-calque"; }).length
      };
    });
    verifier(charge.structures === A.structures && charge.roads === A.roads && charge.zones === A.zones && charge.points === A.points,
      "calque fabriqué chargé tel quel (" + A.structures + " structures, " + A.roads + " tracés, " + A.zones + " zones, " + A.points + " points)", charge);

    // ── ≡ Légende : ligne « Point sans tag » ──
    const leg = await page.evaluate(async function () {
      window.afficherLegende();
      await new Promise(function (r) { setTimeout(r, 500); });
      const img = document.querySelector('img.kta-legende-icone[data-kta-tag="default"]');
      const res = { src: img ? img.getAttribute("src") : null };
      const b = document.getElementById("kta-legende-close"); if (b) b.click();
      return res;
    });
    verifier(/(^|\/)icon\/default\.png$/.test(leg.src || ""), "≡ Légende : « Point sans tag » = icon/default.png", leg);

    // ── ≡ Filtres : types personnalisés ──
    const filt = await page.evaluate(async function () {
      window.FilterPanel.ouvrir();
      await new Promise(function (r) { setTimeout(r, 500); });
      function lignes(sec) {
        return Array.from(document.querySelectorAll("#kta-fp-sec-" + sec + " label.kta-fp-chip")).map(function (l) {
          const t = l.querySelector("input").getAttribute("data-type");
          const pastilles = Array.from(l.querySelectorAll("span[style*='background']")).map(function (s) { return getComputedStyle(s).backgroundColor; });
          return { type: t, texte: l.textContent, etoiles: (l.textContent.match(/✨/g) || []).length, pastilles: pastilles };
        });
      }
      const res = { structs: lignes("structs"), roads: lignes("roads"), zones: lignes("zones") };
      if (window.FilterPanel.fermer) window.FilterPanel.fermer();
      return res;
    });
    function rgb(hex) { return "rgb(" + [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); }).join(", ") + ")"; }
    [["structs", "cust-ckfront", COUL.sFront, "structure en ligne"], ["structs", "cust-ckpil", COUL.sPil, "structure en polygone"],
     ["roads", "cust-cktrace", COUL.trace, "tracé"], ["zones", "cust-ckzone", COUL.zone, "zone"]].forEach(function (c) {
      const l = filt[c[0]].find(function (x) { return x.type === c[1]; });
      verifier(!!l && l.etoiles === 0 && l.pastilles.length === 1 && l.pastilles[0] === rgb(c[2]),
        "≡ Filtres : " + c[3] + " personnalisé(e) — une pastille de sa couleur, pas de ✨", l);
    });
    const front1 = filt.structs.find(function (x) { return x.type === "front-1"; });
    verifier(!!front1 && front1.pastilles.length === 1, "≡ Filtres : structure intégrée avec sa pastille", front1);

    // ── KMZ par la fenêtre d'export (sans l'image du plan) ──
    await page.evaluate(function () {
      const id = window._currentLoadedPlanId;
      const W = window.APP_CONFIG.imageWidth, H = window.APP_CONFIG.imageHeight;
      window.KmzExport.setCalibration(id, { pointA: { x: 0, y: 0, lat: 0.004, lng: 0.001 },
        pointB: { x: W, y: H, lat: 0.004 - H * 2e-6, lng: 0.001 + W * 2e-6 } });
      window.__kmz = null;
      const orig = URL.createObjectURL;
      URL.createObjectURL = function (b) { if (b && /kmz|zip/.test(b.type || "")) window.__kmz = b; return orig.call(URL, b); };
      window.__clicOrig = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      window.ouvrirExportSessionModal("extern", false, { format: "kmz" });
    });
    await page.waitForTimeout(2000);
    const compteurs = await page.evaluate(function () {
      const c = document.getElementById("kmz_inc_image"); if (c && c.checked) c.click();
      const s = document.getElementById("kmz_inc_structures");
      return { structuresActif: !!(s && s.checked && !s.disabled) };
    });
    verifier(compteurs.structuresActif, "KMZ : case Structures cochée et active", compteurs);
    await page.evaluate(function () { document.getElementById("kta-ses-download").click(); });
    await attendre(page, function () { return !!window.__kmz; }, 60000);
    const k = await page.evaluate(async function () {
      HTMLAnchorElement.prototype.click = window.__clicOrig;
      const zip = await JSZip.loadAsync(window.__kmz);
      const kml = await zip.file("doc.kml").async("string");
      const doc = new DOMParser().parseFromString(kml, "application/xml");
      const familles = {};
      Array.from(doc.getElementsByTagName("Folder")).forEach(function (f) {
        const nom = f.getElementsByTagName("name")[0].textContent;
        const fam = /Structures/.test(nom) ? "structures" : /Tracés/.test(nom) ? "roads" : /Zones/.test(nom) ? "zones" : /Points/.test(nom) ? "points" : null;
        if (!fam) return;
        Array.from(f.children).filter(function (c) { return c.tagName === "Placemark"; }).forEach(function (pm) {
          const st = (pm.getElementsByTagName("styleUrl")[0] || {}).textContent || "";
          (familles[fam] = familles[fam] || []).push({ style: st.slice(1), geom: pm.querySelector("LineString") ? "ligne" : pm.querySelector("Polygon") ? "polygone" : "point", nom: pm.getElementsByTagName("name")[0].textContent });
        });
      });
      function styleDe(id) {
        const s = doc.querySelector('Style[id="' + id + '"]');
        if (!s) return null;
        const l = s.querySelector("LineStyle > color"), p = s.querySelector("PolyStyle > color"), h = s.querySelector("IconStyle href");
        return { ligne: l ? l.textContent : null, fond: p ? p.textContent : null, href: h ? h.textContent : null };
      }
      const icones = {};
      const refs = new Set();
      (familles.points || []).forEach(function (p) { refs.add(p.style); });
      for (const id of refs) {
        const st = styleDe(id);
        const href = st && st.href;
        const f = href ? zip.file(href) : null;
        icones[id] = { href: href, octets: f ? (await f.async("uint8array")).length : 0,
          png: f ? (function (u) { return u[0] === 0x89 && u[1] === 0x50; })(await f.async("uint8array")) : false };
      }
      return { familles: familles, icones: icones, styleFront: styleDe("structure_cust-ckfront"), stylePil: styleDe("structure_cust-ckpil") };
    });
    function compte(fam, pred) { return (k.familles[fam] || []).filter(pred).length; }
    function ck(st) { return /(^|_)(cust-ck|ckbrut)/.test(st); }
    const sAtt = A.structures;
    const sVu = compte("structures", function () { return true; });
    verifier(sVu === sAtt, "KMZ : " + sAtt + " structures du calque exportées (vu " + sVu + ")", (k.familles.structures || []).map(function (x) { return x.style; }));
    const frontCk = (k.familles.structures || []).find(function (x) { return x.style === "structure_cust-ckfront"; });
    verifier(!!frontCk && frontCk.geom === "ligne", "KMZ : structure personnalisée en ligne = LineString", frontCk);
    verifier(!!frontCk && frontCk.nom === "Front checkup", "KMZ : nom = libellé de la légende", frontCk && frontCk.nom);
    function kml(hex) { return "ff" + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3); }
    verifier(!!k.styleFront && k.styleFront.ligne === kml(COUL.sFront) && !k.styleFront.fond,
      "KMZ : <Style> de la ligne personnalisée à sa couleur, sans fond", k.styleFront);
    verifier(!!k.stylePil && (k.stylePil.fond || "").slice(2) === kml(COUL.sPil).slice(2), "KMZ : <Style> du polygone personnalisé à sa couleur", k.stylePil);
    const rCk = compte("roads", function (x) { return ck(x.style) || x.style === "road_principal"; });
    const zCk = compte("zones", function (x) { return ck(x.style) || x.style === "zone_eau"; });
    verifier(compte("roads", function (x) { return ck(x.style); }) === 2, "KMZ : tracés personnalisé + brut du calque exportés", rCk);
    verifier(compte("zones", function (x) { return ck(x.style); }) === 2, "KMZ : zones personnalisée + brute du calque exportées", zCk);
    const tagsVus = Object.keys(k.icones);
    const manquantes = ouvert.tags.filter(function (t) { return !k.icones["point_" + t]; });
    verifier(manquantes.length === 0, "KMZ : chaque tag du catalogue a son style d'icône (" + ouvert.tags.length + ")", manquantes);
    const morts = tagsVus.filter(function (id) { return !(k.icones[id].octets > 0 && k.icones[id].png); });
    verifier(morts.length === 0, "KMZ : chaque icône référencée est un PNG présent et non vide (" + tagsVus.length + " styles)",
      morts.map(function (id) { return id + "=" + JSON.stringify(k.icones[id]); }));

    // ── Image : pipeline commun PNG / PDF (MyKTAMapExporterGenererCanvas) ──
    const im = await page.evaluate(async function (C) {
      const dl = {}; (window.PLAN_CONFIG.dataLayers || []).forEach(function (l) { dl[l.id] = l.id === "ck-calque"; });
      const cv = await window.MyKTAMapExporterGenererCanvas({ ann: { points: false, roads: true, zones: true, structures: true },
        scale: 1, bg: "white", includeImgLayers: false, dataLayers: dl });
      const ctx = cv.getContext("2d");
      function px(x, y) { const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2]]; }
      // Couleur attendue, posée pleine OU avec son opacité (fond des piliers 0,85) sur l'un des fonds possibles.
      let FONDS = [[255, 255, 255]];
      function proche(p, hex) {
        const c = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
        return FONDS.some(function (f) {
          for (let a = 0.3; a <= 1.0001; a += 0.05) {
            if (Math.abs(p[0] - (a * c[0] + (1 - a) * f[0])) + Math.abs(p[1] - (a * c[1] + (1 - a) * f[1])) +
                Math.abs(p[2] - (a * c[2] + (1 - a) * f[2])) < 24) return true;
          }
          return false;
        });
      }
      const ss = window.getAllEmbeddedStructures().filter(function (s) { return s.layerId === "ck-calque"; });
      const sx = cv.width / window.APP_CONFIG.imageWidth;
      function centre(type) {
        const s = ss.find(function (o) { return o.type === type; });
        const x = s.points.reduce(function (a, p) { return a + p.x; }, 0) / s.points.length;
        const y = s.points.reduce(function (a, p) { return a + p.y; }, 0) / s.points.length;
        return px(x * sx, y * sx);
      }
      const pFront = centre("cust-ckfront"), pPil = centre("cust-ckpil");
      const lg = await window.MyKTAMapExporterGenererCanvasLegende({ contenu: { icones: false, traces: true, zones: true, structures: true, track: false, meta: false } });
      let nFront = 0, nPil = 0;
      if (lg) {
        const d = lg.getContext("2d").getImageData(0, 0, lg.width, lg.height).data;
        const m = (Math.floor(lg.height / 2) * lg.width + 6) * 4;
        FONDS = [[255, 255, 255], [0, 0, 0], [d[m], d[m + 1], d[m + 2]]];
        for (let i = 0; i < d.length; i += 4) {
          const p = [d[i], d[i + 1], d[i + 2]];
          if (proche(p, C.sFront)) nFront++;
          if (proche(p, C.sPil)) nPil++;
        }
      }
      return { front: proche(pFront, C.sFront), pil: proche(pPil, C.sPil), pFront: pFront, pPil: pPil, legFront: nFront, legPil: nPil };
    }, COUL);
    verifier(im.front, "image : la structure personnalisée en ligne est dessinée à sa couleur", im.pFront);
    verifier(im.pil, "image : la structure personnalisée en polygone est dessinée à sa couleur", im.pPil);
    verifier(im.legFront > 20 && im.legPil > 20, "image : la légende de l'export porte les deux couleurs personnalisées",
      { front: im.legFront, pilier: im.legPil });

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
  console.log("🎉 CHECKUP VERT — KMZ, image et filtres emportent les structures de calque et les types personnalisés.");
  process.exit(0);
})();
