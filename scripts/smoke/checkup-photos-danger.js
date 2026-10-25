#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-photos-danger.js — checkup (Playwright, pas un hook pré-commit) : date des photos, POI danger
// =====================================================================
// Sur le relevé fictif, photos FABRIQUÉES au lancement (canvas du navigateur + segment EXIF écrit ici) :
// A. Photos par le formulaire du POI : JPEG avec DateTimeOriginal connue → « Prise le … » dans la visionneuse
//    (formulaire et fiche), fichier stocké sans EXIF ni texte de l'EXIF ; JPEG sans EXIF → « Ajoutée le … » ;
//    fichier tronqué dans l'EXIF → refusé et expliqué, rien de stocké ; tronqué dans l'image → refusé ou stocké
//    sans EXIF, jamais d'erreur de page.
// B. POI danger : date de constat pré-remplie au jour même, modifiable, vidée (champ retiré), fiche « Constaté
//    le … » + mention ; tag changé → champ retiré ; point non danger : ni bloc ni mention.
// C. Aller-retour : ZIP de session complet (photos/_index.json : priseLe, createdAt ; dateConstat dans
//    session.json), session et photos effacées puis réimportées ; export anonymisé sans aucune de ces dates ;
//    GeoJSON, KMZ (réimporté) et GPX (réimporté) emportent la date de constat.
// Usage : node scripts/smoke/checkup-photos-danger.js (SMOKE_PORT pour une autre copie ; PD_SHOTS=<dossier> :
//   captures et fichiers produits)
// Doc : docs/architecture/session-data.md (photos) · docs/architecture/data-formats.md (format point)
// =====================================================================
"use strict";

const { chromium } = require("playwright");
const lancerNavigateur = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("./server.js");
const JSZip = require("../../lib/jszip.min.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "1",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_pin_proposal_done_v1": "1",
  "myktamap_tutorial_seen_v1": "1"
};

// Même repli que checkup-poi-jonction.js : on ouvre ce que l'index propose, en le disant.
function planAOuvrir() {
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "data", "index.json"), "utf8"));
    const plans = (idx && idx.plans) || [];
    const fictif = plans.find(function (p) { return /fictif/i.test(p.name || ""); });
    return { nom: (fictif || plans[0] || {}).name || "Relevé fictif de test", fictif: !!fictif };
  } catch (e) {
    return { nom: "Relevé fictif de test", fictif: true };
  }
}

const PLAN = planAOuvrir();
const SORTIE = process.env.PD_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), "kta-pd-"));
const GARDER = !!process.env.PD_SHOTS;
async function capture(page, nom) {
  if (!GARDER) return;
  fs.mkdirSync(SORTIE, { recursive: true });
  await page.screenshot({ path: path.join(SORTIE, nom + ".png") });
}
const problemes = [];
const erreursConsole = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(cond, msg, detail) { if (cond) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

const DATE_EXIF = "2023:08:14 09:41:27";
const PRISE_LE = "2023-08-14T09:41:27";
const TEXTE_EXIF = "KTA-EXIF-TEST";   // texte posé dans l'EXIF : ne doit plus se trouver dans le fichier stocké
const CONSTAT = "2026-10-03";

// Segment APP1 « Exif » petit-boutiste : IFD0 = ImageDescription (texte témoin) + pointeur Exif ; sous-IFD Exif =
// DateTimeOriginal. Offsets relatifs au début de l'en-tête TIFF.
function segmentExif() {
  const t = [];
  const u16 = (v) => [v & 255, v >> 8];
  const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24];
  const desc = TEXTE_EXIF + "\0";
  t.push(0x49, 0x49, ...u16(42), ...u32(8));
  t.push(...u16(2), ...u16(0x010E), ...u16(2), ...u32(desc.length), ...u32(76),
    ...u16(0x8769), ...u16(4), ...u32(1), ...u32(38), ...u32(0));
  t.push(...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(56), ...u32(0));
  for (const c of DATE_EXIF + "\0") t.push(c.charCodeAt(0));
  for (const c of desc) t.push(c.charCodeAt(0));
  const corps = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
  return Buffer.from([0xFF, 0xE1, (corps.length + 2) >> 8, (corps.length + 2) & 255, ...corps]);
}
function avecExif(jpeg) { return Buffer.concat([jpeg.subarray(0, 2), segmentExif(), jpeg.subarray(2)]); }
function contient(buf, txt) { return buf.indexOf(Buffer.from(txt, "latin1")) >= 0; }

async function ouvrir(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  await page.getByText(PLAN.nom, { exact: false }).first().click();
  await attendre(page, function () {
    return !!window.PLAN_CONFIG && !!window.map && !!window.MyKTAMapPhotos && !!window.KtaPoiDanger && !!window.HistoryManager;
  }, 20000);
  await page.waitForTimeout(3000);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const k = m.querySelector('[data-action="keep"]'); if (k) k.click(); else m.remove(); }
  });
  await page.waitForTimeout(300);
  await page.evaluate(function () {
    window.setEditorPoints([]);
    if (window.KtaUid) window.KtaUid.setTombstones([]);
    if (window.renderEditorPoints) window.renderEditorPoints();
    return window.MyKTAMapPhotos.deletePhotosForPlan(window._currentLoadedPlanId || "default");
  });
  const c = await page.evaluate(function () {
    const m = window.map.getCenter();
    return { x: Math.round(m.lng), y: Math.round(window.APP_CONFIG.imageHeight - m.lat) };
  });
  return c;
}

// JPEG de base produit par le canvas du navigateur (aucun EXIF).
async function jpegDeBase(page) {
  const b64 = await page.evaluate(async function () {
    const c = document.createElement("canvas");
    c.width = 96; c.height = 64;
    const g = c.getContext("2d");
    for (let i = 0; i < 6; i++) { g.fillStyle = "hsl(" + (i * 60) + ",70%,50%)"; g.fillRect(i * 16, 0, 16, 64); }
    const blob = await new Promise(function (r) { c.toBlob(r, "image/jpeg", 0.9); });
    const u8 = new Uint8Array(await blob.arrayBuffer());
    let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}

async function ajouterPhoto(page, nom, buf) {
  const avant = await page.evaluate(function () {
    window.__pdAvant = document.querySelectorAll("#kta-poi-photos-grid .kta-poi-photo-thumb img").length;
    const e = document.getElementById("kta-poi-erreur"); if (e) { e.textContent = ""; e.style.display = "none"; }
    return window.__pdAvant;
  });
  await page.setInputFiles("#kta-poi-photos-input-galerie", { name: nom, mimeType: "image/jpeg", buffer: buf });
  // Fini quand une miniature de plus est là, ou quand l'erreur s'affiche (et plus aucun placeholder).
  await attendre(page, function () {
    const n = window.__pdAvant;
    const g = document.getElementById("kta-poi-photos-grid");
    const imgs = g.querySelectorAll(".kta-poi-photo-thumb img").length;
    const attente = g.querySelectorAll(".kta-poi-photo-spinner").length;
    const err = document.getElementById("kta-poi-erreur");
    return attente === 0 && (imgs > n || (err && err.style.display !== "none" && err.textContent));
  }, 10000);
  return page.evaluate(function (n) {
    const err = document.getElementById("kta-poi-erreur");
    return { ajoutee: document.querySelectorAll("#kta-poi-photos-grid .kta-poi-photo-thumb img").length > n,
             erreur: err && err.style.display !== "none" ? err.textContent : "" };
  }, avant);
}

async function lireStockees(page) {
  return page.evaluate(async function () {
    const P = window.MyKTAMapPhotos;
    const liste = await P.listerPlan(window._currentLoadedPlanId || "default");
    const out = [];
    for (const m of liste) {
      const b = await P.getBlob(m.id);
      const u8 = new Uint8Array(await b.arrayBuffer());
      let s = ""; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
      out.push({ id: m.id, pointId: m.pointId, priseLe: m.priseLe, createdAt: m.createdAt, b64: btoa(s) });
    }
    return out;
  });
}

async function fermerVisionneuse(page) {
  await page.evaluate(function () { const b = document.querySelector(".kta-photo-viewer-close"); if (b) b.click(); });
  await page.waitForTimeout(200);
}

async function texteVisionneuse(page) {
  await attendre(page, function () {
    const d = document.querySelector(".kta-photo-viewer-date");
    return !!d && d.textContent.length > 0;
  }, 5000).catch(function () {});
  const t = await page.evaluate(function () {
    const d = document.querySelector(".kta-photo-viewer-date");
    return d ? d.textContent : null;
  });
  return t;
}

// ── A. Photos ─────────────────────────────────────────────
async function partiePhotos(page, c) {
  const base = await jpegDeBase(page);
  const exif = avecExif(base);
  verifier(contient(exif, "Exif\0\0") && contient(exif, TEXTE_EXIF), "fabrique : JPEG de test avec segment EXIF (date + texte témoin)");
  await page.evaluate(function (p) { window.afficherFormulaire(p.x, p.y); }, c);
  await attendre(page, function () { return !!document.getElementById("kta-poi-modal"); }, 5000);
  await page.fill("#kta-poi-nom", "Point photos test");
  const r1 = await ajouterPhoto(page, "avec-exif.jpg", exif);
  verifier(r1.ajoutee && !r1.erreur, "JPEG avec EXIF ajouté", r1);
  const r2 = await ajouterPhoto(page, "sans-exif.jpg", base);
  verifier(r2.ajoutee && !r2.erreur, "JPEG sans EXIF ajouté", r2);
  const r3 = await ajouterPhoto(page, "tronque-exif.jpg", exif.subarray(0, 60));
  const msgIllisible = await page.evaluate(function () { return window.I18n.t("editor.err.photoIllisible"); });
  verifier(!r3.ajoutee && r3.erreur === msgIllisible, "fichier tronqué dans l'EXIF : refusé, message clair", r3);
  const r4 = await ajouterPhoto(page, "tronque-image.jpg", exif.subarray(0, exif.length - 40));
  inf("fichier tronqué dans l'image : " + (r4.ajoutee ? "décodé en partie, stocké ré-encodé" : "refusé (" + r4.erreur + ")"));
  await capture(page, "a1-formulaire-photos");
  await page.click("#kta-poi-valider");
  await attendre(page, function () { return !document.getElementById("kta-poi-modal"); }, 5000);

  const st = await lireStockees(page);
  const pt = await page.evaluate(function () {
    const p = window.getEditorPoints().find(function (q) { return q.nom === "Point photos test"; });
    return p ? { uid: p.uid, x: p.x, y: p.y } : null;
  });
  verifier(!!pt && st.length === (r4.ajoutee ? 3 : 2) && st.every(function (s) { return s.pointId === pt.uid; }),
    "photos stockées sous l'uid du point (" + st.length + "), aucune pour le fichier refusé", st.map(function (s) { return s.pointId; }));
  const avecDate = st.filter(function (s) { return s.priseLe === PRISE_LE; });
  verifier(avecDate.length === (r4.ajoutee ? 2 : 1), "priseLe = " + PRISE_LE + " sur la photo à EXIF (métadonnée de l'enregistrement)",
    st.map(function (s) { return s.priseLe; }));
  verifier(st.filter(function (s) { return !s.priseLe; }).length === 1, "photo sans EXIF : pas de priseLe");
  let sansExif = true;
  st.forEach(function (s) {
    const b = Buffer.from(s.b64, "base64");
    if (b[0] !== 0xFF || b[1] !== 0xD8 || contient(b, "Exif\0\0") || contient(b, TEXTE_EXIF) || contient(b, DATE_EXIF)) sansExif = false;
  });
  verifier(sansExif, "🔒 fichiers stockés : JPEG ré-encodés, ni segment EXIF, ni texte ni date de l'EXIF dedans");

  // Visionneuse depuis le formulaire d'édition : la photo à EXIF puis la photo sans EXIF.
  await page.evaluate(function (p) {
    const pts = window.getEditorPoints();
    window.afficherFormulaire(p.x, p.y, pts.find(function (q) { return q.uid === p.uid; }));
  }, pt);
  await attendre(page, function () {
    return document.querySelectorAll("#kta-poi-photos-grid .kta-poi-photo-thumb img").length >= 2;
  }, 5000);
  const idExif = avecDate[0] && avecDate[0].id;
  const idSans = (st.find(function (s) { return !s.priseLe; }) || {}).id;
  const attendus = await page.evaluate(function (d) {
    const loc = window.ktaLocale ? window.ktaLocale() : "fr-FR";
    const o = { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" };
    return { prise: window.I18n.t("photoviewer.priseLe", { date: new Date(2023, 7, 14, 9, 41, 27).toLocaleString(loc, o) }),
             ajoutPrefixe: window.I18n.t("photoviewer.ajouteeLe", { date: "§" }).split("§")[0] };
  });
  await page.click('#kta-poi-photos-grid .kta-poi-photo-thumb[data-photo-id="' + idExif + '"]');
  const t1 = await texteVisionneuse(page);
  verifier(t1 === attendus.prise, "visionneuse (formulaire) : « " + attendus.prise + " »", t1);
  await capture(page, "a2-visionneuse-prise-le");
  await fermerVisionneuse(page);
  await page.click('#kta-poi-photos-grid .kta-poi-photo-thumb[data-photo-id="' + idSans + '"]');
  const t2 = await texteVisionneuse(page);
  verifier(!!t2 && t2.indexOf(attendus.ajoutPrefixe) === 0 && /\d/.test(t2),
    "visionneuse : photo sans EXIF → date d'ajout libellée comme telle", t2);
  await capture(page, "a3-visionneuse-ajoutee-le");
  await fermerVisionneuse(page);
  await page.click("#kta-poi-annuler");
  return { pt: pt, attendus: attendus, idExif: idExif };
}

// Fiche (popup) du point : visionneuse depuis la miniature.
async function partieFichePhoto(page, A) {
  await page.evaluate(function (p) {
    const ll = window.convertCoord(p.x, p.y);
    let mk = null;
    window.map.eachLayer(function (l) {
      if (l instanceof L.Marker && l.getPopup && l.getLatLng && l.getLatLng().equals(L.latLng(ll))) mk = l;
    });
    window.__pdMk = mk;
    if (mk) mk.openPopup();
  }, A.pt);
  await attendre(page, function () { return document.querySelectorAll(".kta-popup-photo-mini").length >= 1; }, 8000).catch(function () {});
  const n = await page.evaluate(function () { return document.querySelectorAll(".kta-popup-photo-mini").length; });
  verifier(n >= 2, "fiche du point : miniatures des photos (" + n + ")");
  if (!n) return;
  await page.evaluate(function (id) {
    const minis = Array.from(document.querySelectorAll(".kta-popup-photo-mini"));
    const m = minis.find(function (el) { return (el.dataset.photoId || el.dataset.id) === id; }) || minis[0];
    m.click();
  }, A.idExif);
  const t = await texteVisionneuse(page);
  verifier(!!t && (t === A.attendus.prise || t.indexOf(A.attendus.ajoutPrefixe) === 0),
    "visionneuse (fiche) : une date est affichée, prise ou ajout", t);
  await fermerVisionneuse(page);
  await page.evaluate(function () { if (window.__pdMk) window.__pdMk.closePopup(); });
}

// ── B. POI danger ─────────────────────────────────────────
async function ficheTexte(page, nom) {
  return page.evaluate(function (n) {
    const p = window.getEditorPoints().find(function (q) { return q.nom === n; });
    if (!p) return null;
    const ll = window.convertCoord(p.x, p.y);
    let mk = null;
    window.map.eachLayer(function (l) {
      if (l instanceof L.Marker && l.getPopup && l.getLatLng && l.getLatLng().equals(L.latLng(ll))) mk = l;
    });
    if (!mk) return { mk: false };
    mk.openPopup();
    const el = mk.getPopup().getElement();
    const bloc = el ? el.querySelector(".kta-popup-danger") : null;
    const r = { mk: true, bloc: bloc ? bloc.textContent : null };
    mk.closePopup();
    return r;
  }, nom);
}

async function partieDanger(page, c) {
  const jour = await page.evaluate(function () { return window.KtaPoiDanger.jourLocal(); });
  const txt = await page.evaluate(function (d) {
    return { mention: window.I18n.t("poiDanger.mention"),
             constate: window.I18n.t("poiDanger.fiche.constate", { date: window.KtaPoiDanger.formaterDate(d) }),
             sansDate: window.I18n.t("poiDanger.fiche.sansDate") };
  }, CONSTAT);
  const pos = { x: c.x + 40, y: c.y + 30 };
  await page.evaluate(function (p) { window.afficherFormulaire(p.x, p.y); }, pos);
  await attendre(page, function () { return !!document.getElementById("kta-poi-modal"); }, 5000);
  const avant = await page.evaluate(function () {
    const b = document.getElementById("kta-poi-danger");
    return { existe: !!b, cache: !!(b && b.hidden) };
  });
  verifier(avant.existe && avant.cache, "formulaire : bloc « Date de constat » présent, masqué hors tag danger", avant);
  await page.fill("#kta-poi-nom", "Danger test");
  await page.selectOption("#kta-poi-type", "danger");
  const apres = await page.evaluate(function () {
    const b = document.getElementById("kta-poi-danger");
    return { visible: !b.hidden, valeur: document.getElementById("kta-poi-constat").value, texte: b.textContent };
  });
  verifier(apres.visible && apres.valeur === jour, "tag danger : bloc affiché, date pré-remplie au jour même (" + jour + ")", apres);
  verifier(apres.texte.indexOf(txt.mention) >= 0, "formulaire : mention de non-certification affichée");
  await capture(page, "b1-formulaire-danger");
  await page.fill("#kta-poi-constat", CONSTAT);
  await page.click("#kta-poi-valider");
  await attendre(page, function () { return !document.getElementById("kta-poi-modal"); }, 5000);
  const p1 = await page.evaluate(function () {
    const p = window.getEditorPoints().find(function (q) { return q.nom === "Danger test"; });
    return p ? { dateConstat: p.dateConstat, uid: p.uid } : null;
  });
  verifier(!!p1 && p1.dateConstat === CONSTAT, "point créé : dateConstat = " + CONSTAT, p1);
  const f1 = await ficheTexte(page, "Danger test");
  verifier(!!f1 && f1.bloc && f1.bloc.indexOf(txt.constate) >= 0 && f1.bloc.indexOf(txt.mention) >= 0,
    "fiche : « " + txt.constate + " » + mention", f1);

  // Édition : date vidée → champ retiré, fiche « non renseignée » + mention.
  await page.evaluate(function () {
    const p = window.getEditorPoints().find(function (q) { return q.nom === "Danger test"; });
    window.afficherFormulaire(p.x, p.y, p);
  });
  await attendre(page, function () { return !!document.getElementById("kta-poi-modal"); }, 5000);
  const v2 = await page.evaluate(function () { return document.getElementById("kta-poi-constat").value; });
  verifier(v2 === CONSTAT, "édition : la date du point est reprise", v2);
  await page.fill("#kta-poi-constat", "");
  await page.click("#kta-poi-valider");
  await attendre(page, function () { return !document.getElementById("kta-poi-modal"); }, 5000);
  const p2 = await page.evaluate(function () {
    const p = window.getEditorPoints().find(function (q) { return q.nom === "Danger test"; });
    return { a: "dateConstat" in p };
  });
  verifier(!p2.a, "date vidée : champ dateConstat retiré du point");
  const f2 = await ficheTexte(page, "Danger test");
  verifier(!!f2 && f2.bloc && f2.bloc.indexOf(txt.sansDate) >= 0 && f2.bloc.indexOf(txt.mention) >= 0,
    "fiche : « date non renseignée » + mention", f2);
  // Point danger sans date rouvert : rien d'inventé.
  await page.evaluate(function () {
    const p = window.getEditorPoints().find(function (q) { return q.nom === "Danger test"; });
    window.afficherFormulaire(p.x, p.y, p);
  });
  await attendre(page, function () { return !!document.getElementById("kta-poi-modal"); }, 5000);
  const v3 = await page.evaluate(function () { return document.getElementById("kta-poi-constat").value; });
  verifier(v3 === "", "point danger sans date rouvert : champ vide (aucune date inventée)", v3);
  await page.fill("#kta-poi-constat", CONSTAT);
  await page.click("#kta-poi-valider");
  await attendre(page, function () { return !document.getElementById("kta-poi-modal"); }, 5000);

  // Tag changé : le champ part ; point ordinaire : pas de bloc sur la fiche.
  const pos2 = { x: c.x - 40, y: c.y + 30 };
  await page.evaluate(function (p) { window.afficherFormulaire(p.x, p.y); }, pos2);
  await attendre(page, function () { return !!document.getElementById("kta-poi-modal"); }, 5000);
  await page.fill("#kta-poi-nom", "Danger puis info");
  await page.selectOption("#kta-poi-type", "danger");
  await page.click("#kta-poi-valider");
  await attendre(page, function () { return !document.getElementById("kta-poi-modal"); }, 5000);
  const p3 = await page.evaluate(function () {
    return window.getEditorPoints().find(function (q) { return q.nom === "Danger puis info"; }).dateConstat;
  });
  verifier(p3 === jour, "date laissée telle quelle → constat du jour (" + jour + ")", p3);
  await page.evaluate(function () {
    const p = window.getEditorPoints().find(function (q) { return q.nom === "Danger puis info"; });
    window.afficherFormulaire(p.x, p.y, p);
  });
  await attendre(page, function () { return !!document.getElementById("kta-poi-modal"); }, 5000);
  await page.selectOption("#kta-poi-type", "info");
  const cache = await page.evaluate(function () { return document.getElementById("kta-poi-danger").hidden; });
  await page.click("#kta-poi-valider");
  await attendre(page, function () { return !document.getElementById("kta-poi-modal"); }, 5000);
  const p4 = await page.evaluate(function () {
    return "dateConstat" in window.getEditorPoints().find(function (q) { return q.nom === "Danger puis info"; });
  });
  verifier(cache && !p4, "tag changé pour info : bloc masqué, dateConstat retiré");
  const f4 = await ficheTexte(page, "Danger puis info");
  verifier(!!f4 && f4.mk && f4.bloc === null, "fiche d'un point non danger : ni date ni mention", f4);
  if (GARDER) {
    await page.evaluate(function () {
      const p = window.getEditorPoints().find(function (q) { return q.nom === "Danger test"; });
      const ll = window.convertCoord(p.x, p.y);
      window.map.eachLayer(function (l) {
        if (l instanceof L.Marker && l.getPopup && l.getLatLng && l.getLatLng().equals(L.latLng(ll))) { window.__pdMk = l; l.openPopup(); }
      });
    });
    await page.waitForTimeout(700);
    await capture(page, "b2-fiche-danger");
    await page.evaluate(function () { if (window.__pdMk) window.__pdMk.closePopup(); });
  }
  return { txt: txt };
}

// ── C. Aller-retour ───────────────────────────────────────
async function exporterZip(page, anonymiser) {
  await page.evaluate(function () { window.ouvrirExportSessionModal("full"); });
  await attendre(page, function () {
    const s = document.getElementById("full_photos_section"), cb = document.getElementById("full_photos");
    return !!cb && !!s && s.style.display !== "none";
  }, 10000);
  await page.evaluate(function (an) {
    document.getElementById("full_photos").checked = true;
    const a = document.getElementById("full_anonymize");
    if (a && a.checked !== an) a.click();
  }, !!anonymiser);
  await page.waitForTimeout(300);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.evaluate(function () { document.getElementById("kta-ses-download").click(); })
  ]);
  const fichier = path.join(SORTIE, anonymiser ? "session-anonyme.zip" : "session.zip");
  fs.mkdirSync(SORTIE, { recursive: true });
  await dl.saveAs(fichier);
  await page.evaluate(function () {
    const b = document.getElementById("kta-ses-close");
    if (b) b.click();
  });
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape").catch(function () {});
  return fs.readFileSync(fichier);
}

async function lireZip(buf) {
  const z = await JSZip.loadAsync(buf);
  const s = JSON.parse(await z.file("session.json").async("string"));
  const idxF = z.file("photos/_index.json");
  const idx = idxF ? JSON.parse(await idxF.async("string")).photos : {};
  const fichiers = {};
  for (const id of Object.keys(idx)) {
    const f = z.file("photos/" + idx[id].file);
    fichiers[id] = f ? Buffer.from(await f.async("uint8array")) : null;
  }
  return { session: s, idx: idx, fichiers: fichiers };
}

async function partieAllerRetour(page) {
  const z = await lireZip(await exporterZip(page, false));
  const entrees = Object.keys(z.idx).map(function (k) { return z.idx[k]; });
  verifier(entrees.some(function (e) { return e.priseLe === PRISE_LE; }) && entrees.every(function (e) { return e.createdAt > 0; }),
    "ZIP de session : photos/_index.json porte priseLe et createdAt", entrees);
  verifier(Object.keys(z.fichiers).every(function (k) {
    const b = z.fichiers[k]; return b && !contient(b, "Exif\0\0") && !contient(b, TEXTE_EXIF);
  }), "🔒 ZIP de session : fichiers photo sans EXIF (la date est dans l'index, pas dans le fichier)");
  const dz = (z.session.editorPoints || []).find(function (p) { return p.nom === "Danger test"; });
  verifier(!!dz && dz.dateConstat === CONSTAT, "ZIP de session : session.json porte dateConstat", dz && dz.dateConstat);

  const za = await lireZip(await exporterZip(page, true));
  const ea = Object.keys(za.idx).map(function (k) { return za.idx[k]; });
  verifier(ea.length > 0 && ea.every(function (e) { return !("priseLe" in e) && !("createdAt" in e) && !("fiche" in e); }),
    "🔒 export anonymisé : photos sans priseLe, createdAt ni fiche", ea);
  verifier((za.session.editorPoints || []).every(function (p) { return !("dateConstat" in p); }),
    "🔒 export anonymisé : aucun dateConstat");

  // Effacer la session et les photos, puis réimporter le ZIP complet.
  await page.evaluate(function () {
    window.setEditorPoints([]);
    if (window.renderEditorPoints) window.renderEditorPoints();
    return window.MyKTAMapPhotos.deletePhotosForPlan(window._currentLoadedPlanId || "default");
  });
  const vide = await lireStockees(page);
  verifier(vide.length === 0, "session et photos effacées avant réimport");
  const b64 = fs.readFileSync(path.join(SORTIE, "session.zip")).toString("base64");
  await page.evaluate(function (b) {
    const s = atob(b); const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    window.ouvrirImportSession(new File([u8], "session.zip", { type: "application/zip" }));
  }, b64);
  await attendre(page, function () { const b = document.getElementById("kta-import-valider"); return !!b && !b.disabled; }, 15000);
  await page.evaluate(function () { document.getElementById("kta-import-valider").click(); });
  await page.waitForTimeout(800);
  const conf = await page.evaluate(function () { return !!document.getElementById("kta-confirm-oui"); });
  if (conf) {
    await page.waitForTimeout(400);   // garde anti-double-clic de ktaConfirm
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
  }
  await attendre(page, function () { return !document.getElementById("kta-import-modal"); }, 15000);
  await page.waitForTimeout(1500);
  const re = await lireStockees(page);
  const pts = await page.evaluate(function () {
    return window.getEditorPoints().map(function (p) { return { nom: p.nom, dateConstat: p.dateConstat }; });
  });
  verifier(re.some(function (s) { return s.priseLe === PRISE_LE; }) && re.length === entrees.length,
    "réimport : photos restaurées (" + re.length + "), priseLe gardée", re.map(function (s) { return s.priseLe; }));
  const ca = {}; entrees.forEach(function (e, i) { ca[Object.keys(z.idx)[i]] = e.createdAt; });
  verifier(re.every(function (s) { return ca[s.id] === s.createdAt; }), "réimport : date d'ajout (createdAt) d'origine gardée");
  const d = pts.find(function (p) { return p.nom === "Danger test"; });
  verifier(!!d && d.dateConstat === CONSTAT, "réimport : dateConstat du POI danger gardée", pts);
}

async function partieExports(page) {
  const r = await page.evaluate(function () {
    const W = window.APP_CONFIG.imageWidth || 4000, H = window.APP_CONFIG.imageHeight || 3000;
    const calib = { pointA: { x: 0, y: H, lat: 46.5, lng: 3.0 }, pointB: { x: W, y: 0, lat: 46.51, lng: 3.02 },
                    pointC: { x: W, y: H, lat: 46.5, lng: 3.02 } };
    const tr = window.KmzExport.buildTransformCalib(calib);
    const pts = window.getEditorPoints().filter(function (p) { return p.nom === "Danger test"; });
    const niv = new Set((window.APP_CONFIG.availableLevels || [0]).concat([0]));
    const gj = window.GeojsonExport.generer({ transform: tr, epsg: 4326, include: { points: true }, levels: niv,
      data: { editorPoints: pts, roads: [], zones: [], structures: [] } });
    const f = (gj.features || [])[0];
    const kml = window.KmzExport.genererKml({ transform: tr, planName: "Test", include: { points: true }, levels: niv,
      data: { editorPoints: pts, roads: [], zones: [], structures: [] } });
    const doc = new DOMParser().parseFromString(kml, "application/xml");
    const trImp = window.KmzImport.buildTransform({ nw: { lat: 46.51, lng: 3.0 }, ne: { lat: 46.51, lng: 3.02 } }, W, H);
    const lu = window.KmzImport.ingestPlacemarks(doc, trImp, { pointTag: "info", roadType: "chemin", zoneType: "eau" });
    return { geo: f && f.properties && f.properties.dateConstat, kml: /mkm:dateConstat"><value>2026-10-03</.test(kml),
             kmzImp: lu.points[0] && lu.points[0].dateConstat, calib: calib };
  });
  verifier(r.geo === CONSTAT, "GeoJSON : propriété dateConstat", r.geo);
  verifier(r.kml && r.kmzImp === CONSTAT, "KMZ : mkm:dateConstat écrit et relu par l'import", r);

  // GPX : calage prêté le temps de l'export, fichier relu par l'import (aperçu).
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 10000 }),
    page.evaluate(function (calib) {
      const orig = window.KmzExport.getCalibration;
      window.__pdCalib = orig;
      window.KmzExport.getCalibration = function () { return calib; };
      window.GpxIO.exporter({ incEmbedded: false, incRoads: false });
    }, r.calib)
  ]);
  const gpxF = path.join(SORTIE, "export.gpx");
  await dl.saveAs(gpxF);
  const gpx = fs.readFileSync(gpxF, "utf8");
  const g = await page.evaluate(async function (txt) {
    const res = await window.GpxIO.importer(new File([txt], "x.gpx", { type: "application/gpx+xml" }), { confirmAdd: false });
    window.KmzExport.getCalibration = window.__pdCalib;
    const pts = (res && res._toApply && res._toApply.points) || [];
    const d = pts.find(function (p) { return p.nom === "Danger test"; });
    return { ok: res && res.ok, dateConstat: d && d.dateConstat };
  }, gpx);
  verifier(/constat=2026-10-03/.test(gpx) && g.dateConstat === CONSTAT, "GPX : « constat= » dans <cmt>, relu par l'import", g);
}

(async function main() {
  const nav = await lancerNavigateur(chromium);
  const ctx = await nav.newContext({ viewport: { width: 1100, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  page.on("pageerror", function (e) { erreursConsole.push("pageerror : " + e.message); });
  page.on("console", function (m) {
    if (m.type() === "error" && !/version\.json|ping\.html|live-config|favicon|Licence-pro\.json|404/i.test(m.text())) {
      erreursConsole.push(m.text());
    }
  });
  try {
    const c = await ouvrir(page);
    if (!PLAN.fictif) inf("⚠️ relevé fictif absent de data/index.json : le checkup tourne sur « " + PLAN.nom + " »");
    console.log("A. Photos : date de prise de vue, fichier sans EXIF, fichiers abîmés");
    const A = await partiePhotos(page, c);
    await partieFichePhoto(page, A);
    console.log("B. POI danger : date de constat, fiche, mention");
    await partieDanger(page, c);
    console.log("C. Aller-retour : ZIP de session, anonymisé, GeoJSON, KMZ, GPX");
    await partieAllerRetour(page);
    await partieExports(page);
  } catch (e) {
    pb("exception du harnais : " + (e && e.stack || e));
  } finally {
    await nav.close();
    server.close();
    if (!GARDER) fs.rmSync(SORTIE, { recursive: true, force: true });
  }
  if (erreursConsole.length) {
    erreursConsole.slice(0, 10).forEach(function (m) { pb("console : " + m); });
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — date des photos (sans EXIF dans le fichier) et date de constat des POI danger, aller-retour compris.");
  process.exit(0);
})();
