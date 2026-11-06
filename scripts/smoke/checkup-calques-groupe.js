#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// checkup-calques-groupe.js — checkup (Playwright) : un rendu de session ne laisse aucun calque mort dans layerEditor
// =====================================================================
// Relevé fictif (sinon le premier plan de l'index), objets FICTIFS générés autour du centre de la vue, jamais écrits
// dans un fichier : 1000 murs (dont 50 annotés) et 200 zones d'eau en session, puis les mêmes servis comme un calque de
// données (réponse du `fetch` du calque remplacée en mémoire) et rapatriés par « 🔄 Modifier »
// (FilterPanel.rapatrierCalque, confirmation cliquée).
// Vérifie, après chaque série (10 modifications de murs et de zones par le chemin d'écriture de l'ajustement, ⏪ ×3,
// ⏩ ×3, Convertir, fiche ouverte pendant un rendu, 10 modifications vue 3D d'édition ouverte) : nombre de calques de
// window.layerEditor = calques du plan + un par objet dessiné ; aucun calque du groupe hors carte ; calque de
// session décoché puis recoché dans ≡ = aucun fantôme ; une extension qui ouvre la fiche d'un mur
// (KtaExtensions.allerAObjet) l'ouvre sur un calque vivant ; tas après GC stable (Chromium, CDP).
// Joué sous chaque moteur (KTA_MOTEURS, Chromium et WebKit par défaut ; WebKit : tas non mesuré, pas de CDP).
// Usage : node scripts/smoke/checkup-calques-groupe.js (SMOKE_PORT pour une autre copie ; KTA_NB_MURS, KTA_NB_ZONES)
// · code : js/structures.js, js/zones.js, js/road.js, utils.js > ktaRetirerCalque · garde-fou :
// scripts/check-calques-groupe.js · doc : docs/architecture/perf-memory.md §13 (calques de session)
// =====================================================================
"use strict";

const { moteurs, lancerMoteur } = require("./navigateur.js");
const attendre = require("./attendre.js");   // pas de waitForFunction : refusé par la CSP de l'app
const server = require("./server.js");

const BASE = "http://127.0.0.1:" + (parseInt(process.env.SMOKE_PORT, 10) || 8123);
const LS_PREGATES = {
  "myktamap_unlock_v1": "89e39e7658b8352ab93330b78ccc32db93c90dbc3a5d364ac0c3fbde38b8f4ae",
  "myktamap_terms_accepted_v1": "2",
  "myktamap_alert_seen_offline-precache-2026-06": "2026-06-13T12:00:00Z",
  "myktamap_tutorial_seen_v1": "1"
};
const NB_MURS = parseInt(process.env.KTA_NB_MURS, 10) || 1000;
const NB_ZONES = parseInt(process.env.KTA_NB_ZONES, 10) || 200;
// Tas après GC : 10 rendus de ~1200 objets gardaient ~30 Mo ; au-delà de ce seuil, quelque chose retient.
const TAS_TOLERE_MO = 8;

const problemes = [];
let _prefixe = "";
function pb(msg) { problemes.push(_prefixe + msg); console.log("  ❌ " + msg); }
function ok(msg) { console.log("  ✅ " + msg); }
function inf(msg) { console.log("  •  " + msg); }
function verifier(c, msg, detail) { if (c) ok(msg); else pb(msg + (detail !== undefined ? " " + JSON.stringify(detail) : "")); }

async function ouvrirPlan(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await attendre(page, function () {
    return !!window.PlanRegistry && typeof window.chargerPlanDuRegistre === "function" &&
      window.PlanRegistry.getAll().length > 0;
  }, 30000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () { const b = document.getElementById("kta-alert-ok"); if (b) b.click(); });
  const nom = await page.evaluate(function () {
    const tous = window.PlanRegistry.getAll();
    const p = tous.find(function (x) { return /fictif/i.test(x.name || ""); }) || tous[0];
    window.__pret = false;
    Promise.resolve(window.chargerPlanDuRegistre(p.id)).then(function () { window.__pret = true; });
    return /fictif/i.test(p.name || "") ? "fictif" : "autre";
  });
  if (nom !== "fictif") inf("⚠️ relevé fictif absent de l'index : le checkup tourne sur le premier plan");
  await attendre(page, function () {
    return window.__pret && !!window.map && !!window.PLAN_CONFIG && !!window.layerEditor && !!window.HistoryManager &&
      !!window.CalqueSession && !!window.FilterPanel && !!window.ktaFormesAjustables;
  }, 60000);
  await page.waitForTimeout(1500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
    const cfg = window.APP_CONFIG;
    if (cfg.multiLevel === true) {
      cfg.activeLevel = 0;
      if (cfg.visibleLevels.indexOf(0) < 0) cfg.visibleLevels.push(0);
    }
  });
  await page.waitForTimeout(2500);   // vue retrouvée à la réouverture, posée après le chargement
}

// Harnais dans window.__cg : objets fictifs, compte du groupe, écriture d'une modification.
function harnais(page, nbMurs, nbZones) {
  return page.evaluate(function (a) {
    const m = window.map, H = window.APP_CONFIG.imageHeight;
    const c = m.getCenter();
    const bx = c.lng, by = H - c.lat;
    window.setRoads([]); window.setZones([]); window.setStructures([]);
    if (typeof window.setEditorPoints === "function") window.setEditorPoints([]);
    window.HistoryManager.reset();
    const G = window.layerEditor;
    const base = Object.keys(G._layers).length;
    const cote = Math.ceil(Math.sqrt(a.nbMurs));
    window.__cg = {
      base: base,
      murs: function () {
        const l = [];
        for (let i = 0; i < a.nbMurs; i++) {
          const x = bx + (i % cote) * 6 - cote * 3, y = by + Math.floor(i / cote) * 6 - cote * 3;
          const s = { type: "mur", level: 0, points: [{ x: x, y: y }, { x: x + 4, y: y }, { x: x + 4, y: y + 4 },
            { x: x, y: y + 4 }] };
          if (i % 20 === 0) s.label = "Mur fictif " + i;
          l.push(s);
        }
        return l;
      },
      zones: function () {
        const l = [];
        for (let i = 0; i < a.nbZones; i++) {
          const x = bx + (i % 20) * 9 - 90, y = by + Math.floor(i / 20) * 9 + cote * 3 + 10;
          l.push({ type: "eau", level: 0, points: [{ x: x, y: y }, { x: x + 6, y: y }, { x: x + 6, y: y + 6 }] });
        }
        return l;
      },
      compte: function () {
        const L = Object.keys(G._layers).map(function (k) { return G._layers[k]; });
        const surCarte = m.hasLayer(G);
        const horsCarte = surCarte ? L.filter(function (l) { return !l._map; }).length : null;
        return { total: L.length, base: base, horsCarte: horsCarte, objets: window.getStructures().length + window.getZones().length };
      },
      // Même chemin qu'un geste d'ajustement (ajusterSommets.js > _ecrire) : captureState → mutation → touch →
      // rendre → record → save.
      modifier: function (fam, i, dx) {
        const A = window.ktaFormesAjustables[fam];
        const Hm = window.HistoryManager;
        const liste = fam === "structures" ? window.getStructures() : window.getZones();
        const o = liste[i % liste.length];
        const avant = Hm.captureState(A.cat);
        o.points[0] = Object.assign({}, o.points[0], { x: o.points[0].x + dx });
        if (o.uid && window.KtaUid) window.KtaUid.touch(o);
        A.rendre();
        Hm.record("modif", avant, A.cat);
        if (window.SessionPersist) { try { window.SessionPersist.save({ force: true }); } catch (e) {} }
      }
    };
    return { base: base };
  }, { nbMurs: nbMurs, nbZones: nbZones });
}

function compte(page) { return page.evaluate(function () { return window.__cg.compte(); }); }

// Calques du groupe = calques du plan + un par mur ou zone fermé (aucun outil armé : pas de fantôme de note).
async function controler(page, etape) {
  const c = await compte(page);
  const attendu = c.base + c.objets;
  verifier(c.total === attendu && c.horsCarte === 0,
    etape + " : " + c.total + " calques dans layerEditor (attendu " + attendu + "), " + c.horsCarte + " hors carte", c);
  return c;
}

async function tas(cdp) {
  if (!cdp) return null;
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const r = await cdp.send("Runtime.getHeapUsage");
  return r.usedSize / 1048576;
}

async function dixModifs(page, fam, dx) {
  for (let i = 0; i < 10; i++) {
    await page.evaluate(function (a) { window.__cg.modifier(a.fam, a.i * 37, a.dx); }, { fam: fam, i: i, dx: dx });
  }
  await page.waitForTimeout(150);
}

// ≡ : case du calque de session décochée puis recochée, par le vrai panneau.
async function basculerSession(page) {
  return page.evaluate(async function () {
    const FP = window.FilterPanel;
    FP.ouvrir();
    const cb = document.querySelector('[data-data-layer="editor"]');
    if (!cb) { FP.fermer(); return false; }
    cb.click();
    await new Promise(function (r) { setTimeout(r, 100); });
    const masque = !window.map.hasLayer(window.layerEditor);
    cb.click();
    await new Promise(function (r) { setTimeout(r, 100); });
    FP.fermer();
    return masque && window.map.hasLayer(window.layerEditor);
  });
}

// Extension : allerAObjet(uid) d'un mur annoté → la fiche ouverte est celle d'un calque vivant.
async function ficheParExtension(page) {
  return page.evaluate(async function () {
    const s = window.getStructures().find(function (o) { return o.label; });
    if (!s || !window.KtaExtensions || typeof window.KtaExtensions.allerAObjet !== "function") return { prise: false };
    window.map.closePopup();
    const r = window.KtaExtensions.allerAObjet(s.uid);
    await new Promise(function (res) { setTimeout(res, 400); });
    const p = window.map._popup;
    const src = p && p._source;
    const vivant = !!(src && src._map && window.layerEditor.hasLayer(src));
    window.map.closePopup();
    return { prise: true, appel: r, ouverte: !!p, vivant: vivant };
  });
}

async function serie(page, cdp, titre) {
  await controler(page, titre + ", rendu initial");
  const t0 = await tas(cdp);
  await dixModifs(page, "structures", 1);
  await controler(page, titre + ", 10 modifications de murs");
  await dixModifs(page, "zones", 1);
  await controler(page, titre + ", 10 modifications de zones");
  for (let i = 0; i < 3; i++) await page.evaluate(function () { window.HistoryManager.undo(); });
  await page.waitForTimeout(100);
  await controler(page, titre + ", ⏪ ×3");
  for (let i = 0; i < 3; i++) await page.evaluate(function () { window.HistoryManager.redo(); });
  await page.waitForTimeout(100);
  await controler(page, titre + ", ⏩ ×3");
  const conv = await page.evaluate(function () {
    const s = window.getStructures()[5];
    return !!(window.KtaConvertir && window.KtaConvertir.convertir("structures", s, "zones", "eau"));
  });
  await page.waitForTimeout(150);
  verifier(conv, titre + " : Convertir un mur en zone d'eau accepté");
  await controler(page, titre + ", Convertir");
  // Fiche ouverte pendant un rendu : popup d'un mur annoté, puis une modification d'un autre mur.
  const fiche = await page.evaluate(function () {
    const G = window.layerEditor;
    let l = null;
    G.eachLayer(function (x) { if (!l && x._map && x.getPopup && x.getPopup() && x.getLatLngs) l = x; });
    if (!l) return false;
    l.openPopup();
    window.__cg.modifier("structures", 101, 1);
    return true;
  });
  await page.waitForTimeout(150);
  verifier(fiche, titre + " : fiche ouverte pendant un rendu");
  await controler(page, titre + ", rendu fiche ouverte");
  const bas = await basculerSession(page);
  verifier(bas, titre + " : ≡ calque de session décoché puis recoché");
  await controler(page, titre + ", ≡ décoché / recoché");
  const ext = await ficheParExtension(page);
  if (ext.prise) verifier(ext.appel && ext.ouverte && ext.vivant, titre + " : allerAObjet ouvre la fiche d'un calque vivant", ext);
  else inf("prise allerAObjet absente : non testée");
  const t1 = await tas(cdp);
  if (t0 !== null) {
    verifier(t1 - t0 < TAS_TOLERE_MO, titre + " : tas après GC " + t0.toFixed(1) + " → " + t1.toFixed(1) + " Mo (Δ " +
      (t1 - t0).toFixed(1) + ", seuil " + TAS_TOLERE_MO + ")");
  }
}

async function jouer(nom) {
  const nav = await lancerMoteur(nom);
  if (!nav) return;
  _prefixe = "[" + nom + "] ";
  console.log("\n━━ " + nom + " ━━");
  const page = await nav.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(function (ls) {
    for (const k in ls) { try { localStorage.setItem(k, ls[k]); } catch (e) {} }
  }, LS_PREGATES);
  const erreurs = [];
  page.on("pageerror", function (e) { erreurs.push(String(e && e.message)); });
  let cdp = null;
  if (nom === "chromium") { try { cdp = await page.context().newCDPSession(page); } catch (e) { cdp = null; } }
  try {
    await ouvrirPlan(page);
    const h = await harnais(page, NB_MURS, NB_ZONES);
    inf("calques du plan dans layerEditor : " + h.base);

    // ── Série 1 : objets dessinés en session ──
    await page.evaluate(function () {
      window.setStructures(window.__cg.murs());
      window.setZones(window.__cg.zones());
    });
    await page.waitForTimeout(300);
    await serie(page, cdp, "session");

    // ── Série 2 : calque de données rapatrié par « 🔄 Modifier », puis vue 3D d'édition ──
    await page.evaluate(function () {
      window.setStructures([]); window.setZones([]);
      window.HistoryManager.reset();
    });
    const id = await page.evaluate(function () {
      const lc = (window.PLAN_CONFIG.dataLayers || []).find(function (d) {
        return d && d.file && d.id !== "editor" && window.dataLayerGroups && window.dataLayerGroups[d.id] &&
          !window.CalqueSession.estRapatrie(d.id);
      });
      if (!lc) return null;
      const corps = JSON.stringify({ structures: window.__cg.murs(), zones: window.__cg.zones() });
      const vrai = window.fetch;
      // Réponse du calque remplacée EN MÉMOIRE (objets fictifs) : rien n'est lu ni écrit dans data/.
      window.fetch = function (u) {
        if (String(u) === String(lc.file)) {
          return Promise.resolve(new Response(corps, { headers: { "Content-Type": "application/json" } }));
        }
        return vrai.apply(this, arguments);
      };
      return lc.id;
    });
    if (!id) throw new Error("aucun calque de données à rapatrier dans ce plan");
    await page.evaluate(function (id) { window.__rap = null; window.FilterPanel.rapatrierCalque(id).then(function (r) { window.__rap = r; }); }, id);
    await attendre(page, function () { return !!document.getElementById("kta-confirm-oui"); }, 15000);
    await page.waitForTimeout(500);   // garde anti-double-clic de ktaConfirm
    await page.evaluate(function () { document.getElementById("kta-confirm-oui").click(); });
    await attendre(page, function () { return window.__rap !== null; }, 30000);
    const rap = await page.evaluate(function () {
      return { r: window.__rap, murs: window.getStructures().length, zones: window.getZones().length };
    });
    verifier(rap.r === true && rap.murs === NB_MURS && rap.zones === NB_ZONES,
      "calque rapatrié par 🔄 Modifier : " + rap.murs + " murs, " + rap.zones + " zones en session", rap);
    await page.waitForTimeout(300);
    await serie(page, cdp, "calque rapatrié");

    const v3d = await page.evaluate(async function () {
      if (typeof window.ktaChargerVue3D === "function") await window.ktaChargerVue3D();
      const K = window.KtaVue3D;
      if (!K || typeof K.ouvrir !== "function") return { ok: false, api: false };
      const c = window.map.getCenter(), H = window.APP_CONFIG.imageHeight;
      const okv = await K.ouvrir({ depart: { x: c.lng, y: H - c.lat, cap: 0, niveau: 0 }, commandes: "joystick" });
      if (K.etat().vue !== "plongee") K.basculerVue();
      await new Promise(function (r) { setTimeout(r, 600); });
      const et = K.etat() || {};
      return { ok: okv !== false && et.vue === "plongee", ouvert: okv, vue: et.vue };
    });
    if (v3d.ok) {
      ok("vue 3D d'édition ouverte");
      const t0 = await tas(cdp);
      await dixModifs(page, "structures", -1);
      await page.waitForTimeout(800);
      await controler(page, "vue 3D d'édition, 10 modifications de murs");
      const t1 = await tas(cdp);
      if (t0 !== null) inf("tas après GC, vue 3D ouverte : " + t0.toFixed(1) + " → " + t1.toFixed(1) + " Mo");
      await page.evaluate(function () { return window.KtaVue3D.fermer(); });
      await page.waitForTimeout(800);
      await controler(page, "vue 3D refermée");
      const t2 = await tas(cdp);
      if (t0 !== null) {
        verifier(t2 - t0 < TAS_TOLERE_MO, "vue 3D d'édition : tas après GC à la fermeture " + t0.toFixed(1) + " → " +
          t2.toFixed(1) + " Mo (seuil " + TAS_TOLERE_MO + ")");
      }
    } else pb("vue 3D d'édition : ouverture impossible " + JSON.stringify(v3d));

    verifier(erreurs.length === 0, "aucune erreur de page", erreurs.slice(0, 3));
  } catch (e) {
    pb("exception du harnais : " + (e && e.message));
  } finally {
    await nav.close();
  }
}

(async function main() {
  try {
    for (const nom of moteurs()) await jouer(nom);
  } finally {
    server.close();
  }
  console.log("");
  if (problemes.length) {
    console.log("❌ CHECKUP ROUGE — " + problemes.length + " problème(s) :");
    problemes.forEach(function (p) { console.log("   • " + p); });
    process.exit(1);
  }
  console.log("🎉 CHECKUP VERT — aucun calque mort dans layerEditor, tas stable.");
  process.exit(0);
})();
