#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-contour-ferme.js — checkup (Playwright) : convertir en zone ou en pilier une ligne FERMÉE
// =====================================================================
// Objets FICTIFS posés au centre de la vue (relevé fictif, sinon le premier plan de l'index) : un carré à 3 côtés
// (4 points), un contour qui répète son premier point, un U large (reste ouvert), une ligne de 2 points.
// Vérifie : cibles proposées (fiche), conversion unitaire, lot filtré « seulement les contours fermés » avec le
// compte confirmé avant, annulation unique, doublon retiré, uid et niveau conservés. Puis le chemin d'un calque de
// données fabriqué ici : « 🔄 Modifier » (panneau des filtres), fiche d'une copie, sélection multiple « tous du
// type », case « seulement les contours fermés », un ⏪.
// 🩸 check-api-surface.js teste la règle dans un `vm` ; seul ce parcours voit la fiche, la case, ktaConfirm, le
// panneau des filtres, la sélection multiple et le rapatriement réel.
// Usage : node scripts/smoke/checkup-contour-ferme.js (SMOKE_PORT pour une autre copie) · code :
// convertirObjet.js > estContourFerme / ouvrir · doc : docs/architecture/session-data.md
// =====================================================================
"use strict";

const { chromium } = require("playwright");
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
const CALQUE = "ckc_calque_test";

const problemes = [];
function pb(msg) { problemes.push(msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

// Géométries fictives autour de (x, y) : côté 60 px plan.
function semer(page) {
  return page.evaluate(function () {
    const c = window.map.getCenter();
    const x = Math.round(c.lng) - 120, y = Math.round(window.PLAN_CONFIG.plan.imageHeight - c.lat) - 80;
    const carre = function (dx, dy, uid, repete) {
      const p = [{ x: x + dx, y: y + dy }, { x: x + dx + 60, y: y + dy }, { x: x + dx + 60, y: y + dy + 60 },
        { x: x + dx, y: y + dy + 60 }];
      if (repete) p.push({ x: x + dx, y: y + dy });
      return { uid: uid, type: "front-1", level: 0, description: "fictif " + uid, points: p };
    };
    window.__ckc = { x: x, y: y };
    window.setRoads([]);
    window.setZones([]);
    window.setStructures([
      carre(0, 0, "st_ckc_carre", false),
      carre(100, 0, "st_ckc_boucle", true),
      { uid: "st_ckc_u", type: "front-1", level: 0,
        points: [{ x: x, y: y + 120 }, { x: x, y: y + 130 }, { x: x + 160, y: y + 130 }, { x: x + 160, y: y + 120 }] },
      { uid: "st_ckc_deux", type: "front-1", level: 0, points: [{ x: x + 200, y: y }, { x: x + 260, y: y }] }
    ]);
  });
}

function etatSession(page) {
  return page.evaluate(function () {
    const res = {};
    ["getRoads", "getZones", "getStructures"].forEach(function (g) {
      (window[g]() || []).forEach(function (o) {
        if (o && o.uid) res[o.uid] = { fam: g, type: o.type, n: o.points.length, level: o.level, src: o._srcCalque };
      });
    });
    return res;
  });
}

// Ouvre la fiche de l'objet (uid) et clique 🔄 Convertir ; rend les choix de la modale.
// 🩸 Les boutons de la fiche sont branchés dans un setTimeout après `popupopen` (utils.js > attacherNotePopup) :
// ouvrir, attendre, puis cliquer.
async function ficheConvertir(page, uid) {
  const trouvee = await page.evaluate(function (uid) {
    let cible = null;
    window.map.eachLayer(function (l) {
      const p = l.getPopup && l.getPopup();
      const c = p && p.getContent && p.getContent();
      if (!cible && typeof c === "string" && c.indexOf('data-kta-uid="' + uid + '"') >= 0) cible = l;
    });
    if (!cible) return false;
    window.__ckcFiche = cible;
    cible.openPopup();
    return true;
  }, uid);
  if (!trouvee) return { erreur: "fiche introuvable" };
  await page.waitForTimeout(300);
  return page.evaluate(function () {
    const cible = window.__ckcFiche;
    const el = cible.getPopup().getElement();
    const b = el && el.querySelector(".kta-note-popup-convertir");
    if (!b) return { erreur: "pas de bouton Convertir" };
    b.click();
    const m = document.getElementById("kta-convert-modal");
    if (!m) return { erreur: "pas de modale" };
    return {
      choix: Array.from(m.querySelectorAll(".kta-convert-choix")).map(function (x) {
        return x.getAttribute("data-famille") + ":" + x.getAttribute("data-type");
      }),
      regle: (m.querySelector(".kta-convert-regle") || {}).textContent || ""
    };
  });
}

async function choisir(page, cle) {
  return page.evaluate(function (cle) {
    const p = cle.split(":");
    const b = document.querySelector('#kta-convert-modal .kta-convert-choix[data-famille="' + p[0] +
      '"][data-type="' + p[1] + '"]');
    if (!b) return false;
    b.click();
    return true;
  }, cle);
}

async function confirmer(page) {
  await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 10000);
  await page.waitForTimeout(500);   // garde anti-double-clic de ktaConfirm
  const texte = await page.evaluate(function () {
    const b = document.getElementById("kta-confirm-oui");
    const boite = b.closest(".kta-readme-modal-boite");
    const t = boite ? boite.textContent : "";
    b.click();
    return t;
  });
  await page.waitForTimeout(800);
  return texte;
}

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
    await attendre(page, function () {
      return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
        window.PlanRegistry.getAll().length > 0;
    }, 20000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
    await page.evaluate(function () {
      const tous = window.PlanRegistry.getAll();
      const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
      window.__pret = false;
      Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
    });
    await attendre(page, function () {
      return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.KtaConvertir && !!window.HistoryManager;
    }, 40000);
    await page.waitForTimeout(1500);
    await page.evaluate(function () {
      const m = document.getElementById("kta-session-modal");
      if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    });

    // ── 1. Reconnaissance ──
    await semer(page);
    await page.waitForTimeout(500);
    const reco = await page.evaluate(function () {
      const KC = window.KtaConvertir, S = window.getStructures();
      const f = function (uid) { return S.find(function (o) { return o.uid === uid; }); };
      return typeof KC.estContourFerme !== "function" ? null : {
        carre: KC.estContourFerme("structures", f("st_ckc_carre")),
        boucle: KC.estContourFerme("structures", f("st_ckc_boucle")),
        u: KC.estContourFerme("structures", f("st_ckc_u")),
        deux: KC.estContourFerme("structures", f("st_ckc_deux"))
      };
    });
    verifier(!!reco && reco.carre && reco.boucle && !reco.u && !reco.deux,
      "reconnaissance : carré 3 côtés et boucle fermés, U large et 2 points ouverts", reco);

    // ── 2. Fiche : cibles proposées, conversion unitaire ──
    const fc = await ficheConvertir(page, "st_ckc_carre");
    verifier(!!fc.choix && fc.choix.indexOf("zones:eau") >= 0 && fc.choix.indexOf("structures:pilier-1") >= 0,
      "fiche du carré : zone et pilier proposés", fc);
    verifier(!!fc.choix && fc.choix.indexOf("roads:principal") >= 0, "fiche du carré : cibles ouvertes gardées");
    await page.evaluate(function () { const m = document.getElementById("kta-convert-modal"); if (m) m.remove(); });
    const fu = await ficheConvertir(page, "st_ckc_u");
    verifier(!!fu.choix && fu.choix.length > 0 && fu.choix.every(function (c) { return c.indexOf("zones:") !== 0 && c !== "structures:pilier-1"; }),
      "fiche du U large : aucune cible fermée", fu);
    await page.evaluate(function () { const m = document.getElementById("kta-convert-modal"); if (m) m.remove(); });
    const fd = await ficheConvertir(page, "st_ckc_deux");
    verifier(!!fd.choix && fd.choix.every(function (c) { return c.indexOf("zones:") !== 0; }),
      "fiche de la ligne de 2 points : aucune cible fermée", fd);
    await page.evaluate(function () { const m = document.getElementById("kta-convert-modal"); if (m) m.remove(); });

    await ficheConvertir(page, "st_ckc_carre");
    verifier(await choisir(page, "structures:pilier-1"), "fiche du carré : clic sur « pilier »");
    await page.waitForTimeout(600);
    let e = await etatSession(page);
    verifier(e.st_ckc_carre && e.st_ckc_carre.type === "pilier-1" && e.st_ckc_carre.n === 4 && e.st_ckc_carre.level === 0,
      "conversion unitaire : pilier, 4 points (aucun inventé), uid et niveau gardés", e.st_ckc_carre);
    await ficheConvertir(page, "st_ckc_boucle");
    verifier(await choisir(page, "zones:eau"), "fiche de la boucle : clic sur « eau »");
    await page.waitForTimeout(600);
    e = await etatSession(page);
    verifier(e.st_ckc_boucle && e.st_ckc_boucle.fam === "getZones" && e.st_ckc_boucle.n === 4,
      "conversion unitaire : boucle → zone, doublon du premier point retiré (5 → 4)", e.st_ckc_boucle);

    // ── 3. Lot filtré : compte, confirmation, une annulation ──
    await semer(page);
    await page.evaluate(function () {
      const S = window.getStructures();
      const c = window.__ckc;
      // 2 carrés de plus : 4 contours fermés sur 6 lignes.
      S.push({ uid: "st_ckc_c3", type: "front-1", level: 0, points: [{ x: c.x + 300, y: c.y }, { x: c.x + 340, y: c.y },
        { x: c.x + 340, y: c.y + 40 }, { x: c.x + 300, y: c.y + 40 }] });
      S.push({ uid: "st_ckc_c4", type: "front-1", level: 0, points: [{ x: c.x + 300, y: c.y + 60 }, { x: c.x + 340, y: c.y + 60 },
        { x: c.x + 340, y: c.y + 100 }, { x: c.x + 300, y: c.y + 100 }] });
      window.setStructures(S.slice());
      window.__histAvant = window.HistoryManager._peek().undo.length;
      const lot = window.getStructures().map(function (o) { return { famille: "structures", obj: o }; });
      window.KtaConvertir.ouvrir("structures", lot[0].obj, { lot: lot });
    });
    const caseLot = await page.evaluate(function () {
      const cb = document.getElementById("kta-convert-fermes");
      return cb ? { texte: cb.parentNode.textContent, coche: cb.checked, actif: !cb.disabled,
                    zones: !!document.querySelector('#kta-convert-modal [data-famille="zones"]') } : null;
    });
    verifier(!!caseLot && /4\D+6/.test(caseLot.texte) && !caseLot.coche && caseLot.actif && !caseLot.zones,
      "lot : case « seulement les contours fermés (4 sur 6) », décochée, pas de zone tant qu'elle l'est", caseLot);
    await page.evaluate(function () {
      const cb = document.getElementById("kta-convert-fermes");
      cb.checked = true;
      cb.dispatchEvent(new Event("change"));
    });
    await page.waitForTimeout(300);
    const lotF = await page.evaluate(function () {
      const m = document.getElementById("kta-convert-modal");
      return { source: (m.querySelector(".kta-convert-source") || {}).textContent,
               zones: !!m.querySelector('[data-famille="zones"][data-type="eau"]'),
               coche: document.getElementById("kta-convert-fermes").checked };
    });
    verifier(lotF.zones && lotF.coche && /4/.test(lotF.source), "lot filtré : 4 retenus, cible zone proposée", lotF);
    await choisir(page, "zones:eau");
    const msg = await confirmer(page);
    verifier(/4/.test(msg) && /2/.test(msg), "lot filtré : ktaConfirm annonce 4 contours et 2 autres AVANT", msg.slice(0, 200));
    e = await etatSession(page);
    const zonesLot = ["st_ckc_carre", "st_ckc_boucle", "st_ckc_c3", "st_ckc_c4"].filter(function (u) {
      return e[u] && e[u].fam === "getZones" && e[u].type === "eau";
    });
    verifier(zonesLot.length === 4 && e.st_ckc_u.fam === "getStructures" && e.st_ckc_deux.fam === "getStructures",
      "lot filtré : 4 zones, U et 2 points restés fronts", e);
    verifier(e.st_ckc_boucle && e.st_ckc_boucle.n === 4, "lot filtré : doublon retiré (boucle 5 → 4)", e.st_ckc_boucle);
    const hist = await page.evaluate(function () { return window.HistoryManager._peek().undo.length - window.__histAvant; });
    verifier(hist === 1, "lot filtré : UNE entrée d'historique", hist);
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(600);
    e = await etatSession(page);
    const fronts = Object.keys(e).filter(function (u) { return e[u].fam === "getStructures" && e[u].type === "front-1"; });
    verifier(fronts.length === 6 && e.st_ckc_boucle.n === 5,
      "lot filtré : un seul ⏪ rend les 6 fronts d'origine (boucle à 5 points)", e);

    // ── 4. Calque de données : « 🔄 Modifier », puis le chemin ordinaire (fiche, sélection, lot fermés, ⏪) ──
    await page.evaluate(function (id) {
      const c = window.__ckc;
      window.setStructures([]);
      const json = {
        structures: [
          { uid: "st_ckc_cal_carre", type: "front-1", level: 0, points: [{ x: c.x, y: c.y + 200 },
            { x: c.x + 50, y: c.y + 200 }, { x: c.x + 50, y: c.y + 250 }, { x: c.x, y: c.y + 250 }] },
          { uid: "st_ckc_cal_c2", type: "front-1", level: 0, points: [{ x: c.x + 300, y: c.y + 200 },
            { x: c.x + 340, y: c.y + 200 }, { x: c.x + 340, y: c.y + 240 }, { x: c.x + 300, y: c.y + 240 },
            { x: c.x + 300, y: c.y + 200 }] },
          { uid: "st_ckc_cal_u", type: "front-1", level: 0, points: [{ x: c.x + 100, y: c.y + 200 },
            { x: c.x + 100, y: c.y + 210 }, { x: c.x + 260, y: c.y + 210 }, { x: c.x + 260, y: c.y + 200 }] }
        ],
        roads: [{ uid: "rd_ckc_cal", type: "chemin", level: 0, points: [{ x: c.x, y: c.y + 300 }, { x: c.x + 80, y: c.y + 300 }] }]
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: "application/json" }));
      window.PLAN_CONFIG.dataLayers = (window.PLAN_CONFIG.dataLayers || []).concat([{ id: id, label: "Calque fictif", file: url }]);
      const groupe = L.layerGroup().addTo(window.map);
      window.dataLayerGroups = window.dataLayerGroups || {};
      window.dataLayerGroups[id] = groupe;
      window.ajouterPointsDepuisJSON(url, groupe);
    }, CALQUE);
    await page.waitForTimeout(1500);
    const lu = await page.evaluate(function (id) {
      window.FilterPanel.ouvrir();
      const b = document.querySelector('[data-calque-rapatrier="' + id + '"]');
      if (b) b.click();
      return !!b;
    }, CALQUE);
    verifier(lu, "calque : bouton « 🔄 Modifier » sur sa ligne du panneau des filtres");
    await confirmer(page);   // annonce du poids de la copie
    await attendre(page, function () { return window.CalqueSession.estRapatrie("ckc_calque_test"); }, 10000);
    await page.evaluate(function () { window.FilterPanel.fermer(); });
    await page.waitForTimeout(1000);
    e = await etatSession(page);
    verifier(e.st_ckc_cal_carre && e.st_ckc_cal_carre.src === CALQUE && e.st_ckc_cal_c2 && e.st_ckc_cal_u,
      "Modifier : les objets du calque sont en session (marqués)", e);

    // La copie a une fiche, qui propose zone et pilier.
    const fCal = await ficheConvertir(page, "st_ckc_cal_carre");
    verifier(!!fCal.choix && fCal.choix.indexOf("structures:pilier-1") >= 0 && fCal.choix.indexOf("zones:eau") >= 0,
      "Modifier : la fiche d'une copie fermée propose zone et pilier", fCal);
    const hAvant = await page.evaluate(function () { return window.HistoryManager._peek().undo.length; });
    // Sélection multiple depuis cette fiche : « ➕ Tous les « type » », puis ✅.
    const sel = await page.evaluate(function () {
      const b = document.getElementById("kta-convert-multi");
      if (!b) return { erreur: "pas de bouton sélection multiple" };
      b.click();
      const tous = document.getElementById("kta-selm-tous");
      if (!tous) return { erreur: "pas de bandeau" };
      tous.click();
      const n = window.SelectionMulti.liste().length;
      document.getElementById("kta-selm-ok").click();
      return { n: n, modale: !!document.getElementById("kta-convert-modal") };
    });
    verifier(sel.n === 3 && sel.modale, "Modifier : sélection « tous du type » = les 3 fronts copiés, fenêtre du lot", sel);
    const caseCal = await page.evaluate(function () {
      const cb = document.getElementById("kta-convert-fermes");
      if (!cb) return null;
      const t = cb.parentNode.textContent;
      cb.checked = true;
      cb.dispatchEvent(new Event("change"));
      return t;
    });
    verifier(!!caseCal && /2\D+3/.test(caseCal), "Modifier : case « seulement les contours fermés (2 sur 3) »", caseCal);
    await page.waitForTimeout(300);
    verifier(await choisir(page, "structures:pilier-1"), "Modifier : clic sur « pilier »");
    const msgCal = await confirmer(page);
    verifier(/2/.test(msgCal) && /1/.test(msgCal), "Modifier : ktaConfirm annonce 2 contours et 1 autre", msgCal.slice(0, 200));
    e = await etatSession(page);
    verifier(e.st_ckc_cal_carre.type === "pilier-1" && e.st_ckc_cal_c2.type === "pilier-1" && e.st_ckc_cal_c2.n === 4 &&
      e.st_ckc_cal_carre.src === CALQUE && e.st_ckc_cal_u.type === "front-1" && e.rd_ckc_cal.type === "chemin",
      "Modifier : 2 piliers (doublon retiré, marque du calque gardée), U et tracé intacts", e);
    const hApres = await page.evaluate(function () { return window.HistoryManager._peek().undo.length; });
    verifier(hApres - hAvant === 1, "Modifier : une entrée d'historique", hApres - hAvant);
    await page.evaluate(function () { window.HistoryManager.undo(); });
    await page.waitForTimeout(600);
    e = await etatSession(page);
    verifier(e.st_ckc_cal_carre.type === "front-1" && e.st_ckc_cal_c2.type === "front-1" && e.st_ckc_cal_c2.n === 5,
      "Modifier : un ⏪ rend les 2 fronts d'origine (5 points pour la boucle)", e);
    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 4));
  } catch (err) {
    pb("exception du harnais : " + (err && err.message));
  } finally {
    await nav.close();
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s)");
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — une ligne fermée se convertit en zone ou en pilier, seule, en lot, et sur un calque passé en « Modifier ».");
  process.exit(0);
})();
