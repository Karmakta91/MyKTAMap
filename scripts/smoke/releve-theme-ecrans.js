/* eslint-disable no-console */
// =====================================================================
// releve-theme-ecrans.js — écrans parcourus par releve-theme.js, dans l'ordre, sur le relevé fictif
// =====================================================================
// Expose liste() (accueil, puis « __plan__ » = ouverture du relevé fictif, puis la carte et ses fenêtres),
// chargerPlan(page) et fermer(page). Un écran = { nom, go(page)[, ferme(page)] } ; « phase » carte = rouvrir le
// plan après un rechargement.
// ⚠️ contrat : l'ordre et le contenu doivent rester reproductibles d'un chargement à l'autre (même données,
// mêmes clics), sinon les relevés avant / après ne se comparent plus. Le Secours garde ses scénarios en
// localStorage : les écrans Secours s'empilent, dans le même ordre à chaque relevé.
// Ajouter un écran = étendre la couverture : un sélecteur clair qu'aucun écran n'atteint n'est jamais retiré.
// =====================================================================
"use strict";

const attendre = require("./attendre.js");

async function appel(page, obj, fn, args) {
  return page.evaluate(function (a) {
    const o = a[0] ? window[a[0]] : window;
    if (!o || typeof o[a[1]] !== "function") return "absent";
    try { const r = o[a[1]].apply(o, a[2] || []); if (r && r.then) r.catch(function () {}); return "ok"; }
    catch (e) { return "erreur : " + e.message; }
  }, [obj, fn, args || []]);
}
// Clic réel, sinon clic JS (bouton masqué de la Configuration, ex. audit réseau).
async function clic(page, sel) {
  try { await page.locator(sel).first().click({ timeout: 2500 }); return "ok"; } catch (e) {
    return page.evaluate(function (q) { const el = document.querySelector(q); if (!el) return "absent"; el.click(); return "js"; }, sel);
  }
}
async function action(page, nom) {
  await page.evaluate(function (x) { const b = document.querySelector("[data-action=\"" + x + "\"]"); if (b) b.click(); }, nom);
  await page.waitForTimeout(600);
}
async function fermer(page) {
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape").catch(function () {}); await page.waitForTimeout(120); }
  await page.evaluate(function () {
    const sels = ".kta-panneau-close, .kta-readme-modal-close, .kta-modal-close, [data-action='close'], .kta-fp-close";
    for (let t = 0; t < 3; t++) {
      let n = 0;
      document.querySelectorAll(sels).forEach(function (b) { if (b.getClientRects().length) { try { b.click(); n++; } catch (e) { /* suivant */ } } });
      if (!n) break;
    }
  });
  await page.waitForTimeout(350);
}
async function chargerPlan(page) {
  await page.getByText("Relevé fictif de test", { exact: false }).first().click();
  await attendre(page, function () { return !!window.PLAN_CONFIG && !!window.map && !!window.FilterPanel; }, 60000);
  await page.waitForTimeout(3500);
  await page.evaluate(function () {
    const m = document.getElementById("kta-session-modal");
    if (m) { const x = m.querySelector(".kta-panneau-close"); if (x) x.click(); else m.remove(); }
  });
  await page.waitForTimeout(500);
}
async function secoursPret(page, nom) {
  await page.evaluate(function (n) {
    const S = window.SecoursMode, s = S.create(n);
    S.addGroupe(s.id, "Équipe 1", 0); S.addGroupe(s.id, "Équipe 2", 0); S.ouvrir(s.id);
  }, nom);
  await page.waitForTimeout(600);
}
async function secoursActif(page) {
  await page.evaluate(function () {
    const s = window.SecoursMode.list().find(function (x) { return x.execution && x.execution.active; });
    if (s) window.SecoursMode.ouvrir(s.id);
  });
  await page.waitForTimeout(700);
}
async function alerte(page, niveau) {
  await page.evaluate(function (n) {
    window.afficherModaleAlerte({ id: "releve-" + n, level: n, title: "Alerte de test", message: "Message de test.",
      details: "Détail de test.", released: "2026-11-01T00:00:00Z" });
  }, niveau);
}
// Popup Leaflet d'un point (rang-ième) ou d'un tracé, du calque de session puis des calques de données.
async function popup(page, rang, trace) {
  await page.evaluate(function (a) {
    const l = [];
    function scan(g) {
      if (!g || !g.eachLayer) return;
      g.eachLayer(function (x) {
        if (x.eachLayer && !x.getPopup) { scan(x); return; }
        if (x.getPopup && x.getPopup() && !!x.getLatLngs === !!a[1]) l.push(x);
      });
    }
    scan(window.layerEditor);
    Object.keys(window.dataLayerGroups || {}).forEach(function (k) { scan(window.dataLayerGroups[k]); });
    const m = l[Math.min(a[0], l.length - 1)];
    if (m) { if (m.getLatLng) window.map.setView(m.getLatLng(), window.map.getZoom()); m.openPopup(); }
  }, [rang, !!trace]);
  await page.waitForTimeout(800);
}
// Itinéraire réel entre deux points nommés à 60–250 m, position simulée (pas de capteurs ici).
async function itineraire(page) {
  await page.evaluate(function () {
    const e = Number(window.APP_CONFIG.scale) || 1;
    const pts = [].concat(window.getEditorPoints ? window.getEditorPoints() : [],
      window.getAllEmbeddedPoints ? window.getAllEmbeddedPoints() : [])
      .filter(function (q) { return q && q.nom && typeof q.x === "number"; });
    let a = null, b = null;
    for (let i = 0; i < pts.length && !a; i++) {
      for (let j = 0; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) / e;
        if (i !== j && d > 60 && d < 250) { a = pts[i]; b = pts[j]; break; }
      }
    }
    if (!a) return;
    window.__relevePos = { x: a.x + 12, y: a.y + 9 };
    window.getTrackingPosition = function () { return window.__relevePos; };
    window.getTrackingPositionEtat = function () { return { confirmee: true, ts: Date.now(), suiviActif: true }; };
    window.startTracking();
    window.itineraireYAller(b.x, b.y, b.nom);
  });
  await page.waitForTimeout(3000);
  await page.evaluate(function () { if (window.ItiGuidage && window.ItiGuidage.rafraichir) window.ItiGuidage.rafraichir(); });
  await page.waitForTimeout(800);
}

const c = function (sel) { return async function (p) { await clic(p, sel); }; };
const a = function (obj, fn, args) { return async function (p) { await appel(p, obj, fn, args); }; };

const ACCUEIL = [
  ["accueil", async function () {}],
  ["accueil-config", c("#loaderConfigBtn")],
  ["accueil-audit-doc", c("#loaderNetDocBtn")],
  ["accueil-audit-log", c("#loaderNetLogBtn")],
  ["accueil-aide", c("#loaderHelpBtn")],
  ["accueil-carnet", c("#loaderJournalBtn")],
  ["accueil-editeur", c("#loaderTableEditorBtn")],
  ["accueil-editeur-recalage", async function (p) {
    await clic(p, "#loaderTableEditorBtn"); await p.waitForTimeout(400); await clic(p, "#kta-tbl-src-resol");
  }],
  ["accueil-liaisons", c("#loaderLinksMgrBtn")],
  ["accueil-photos", c("#loaderPhotosBtn")],
  ["accueil-generateur", c("#loaderPlannerBtn")],
  ["accueil-import-masse", c("#loaderImportMasseBtn")],
  ["accueil-alertes", c("#loaderAlertBtn")],
  ["accueil-recherche", c("#loaderSearchBtn")],
  ["accueil-profil", c("#kta-loader-profile-bar")],
  ["accueil-meminspector", c("#loaderMemInspectorBtn")],
  ["accueil-depannage", c("#loaderDepannageBtn")],
  ["accueil-horsligne", c("#loaderOfflineHdrBtn")],
  ["accueil-stats", a("StatsGlobales", "ouvrir")],
  ["accueil-raccourcis", a("ShortcutsCheatsheet", "ouvrir")],
  ["accueil-tutoriel", a("Tutorial", "ouvrir")],
  ["accueil-pin", a("MyKTAMapPinLock", "_afficherGateUI", [])],
  ["accueil-alertes-selecteur", a(null, "afficherSelecteurAlertes")],
  ["accueil-unlock", async function (p) { await p.evaluate(function () { window.UnlockGate.ouvrirGate(); }); await p.waitForTimeout(1500); }],
  ["accueil-readme", a(null, "afficherReadme")]
];

const CARTE = [
  ["carte", async function () {}],
  ["carte-groupes", async function (p) {
    await p.evaluate(function () {
      document.querySelectorAll(".leaflet-bar a.kta-group, .kta-refonte-sidebar .kta-group-btn").forEach(function (x) { try { x.click(); } catch (e) { /* suivant */ } });
    });
  }],
  ["carte-reglages", a(null, "afficherConfig")],
  ["carte-reglages-georef", async function (p) { await appel(p, null, "afficherConfig"); await p.waitForTimeout(400); await clic(p, "#cfg_georef_open"); }],
  ["carte-legende", a(null, "afficherLegende")],
  ["carte-session", c("#kta-refonte-counters-btn")],
  ["carte-aide", a(null, "afficherAide")],
  ["carte-aide-fiche", async function (p) {
    await appel(p, null, "afficherAide"); await p.waitForTimeout(400);
    await p.locator("#kta-aide-modal .kta-aide-row").nth(1).click({ timeout: 2000 }).catch(function () {});
  }],
  ["carte-filtres", a("FilterPanel", "ouvrir")],
  ["carte-export", a(null, "ouvrirExportModal")],
  ["carte-export-session", a(null, "ouvrirExportSessionModal")],
  ["carte-import", a(null, "ouvrirImportChoix")],
  ["carte-recherche", a(null, "ouvrirRecherche")],
  ["carte-itineraire", a(null, "ouvrirItinerairModal")],
  ["carte-stats", a("StatsGlobales", "ouvrir")],
  ["carte-meminspector", a("MemInspector", "ouvrir")],
  ["carte-swinspector", a("SwInspector", "ouvrir")],
  ["carte-raccourcis", a("ShortcutsCheatsheet", "ouvrir")],
  ["carte-carnet", a("JournalUi", "ouvrir")],
  ["carte-rapport", a("SessionReport", "ouvrirModal")],
  ["carte-switcher", a(null, "togglePlanSwitcher")],
  ["carte-tracker", a(null, "ouvrirMenuTracker")],
  ["carte-aide-ia", a(null, "afficherModaleAideIA")],
  ["carte-logs", a(null, "afficherLogsDebug")],
  ["carte-maj", a(null, "afficherModaleUpdateDispo")],
  ["carte-import-sig", a(null, "afficherImporterSig")],
  ["carte-import-gpx", a(null, "afficherImporterGpx")],
  ["carte-import-image", a(null, "afficherImporterImage")],
  ["carte-traces", a(null, "toggleRoadMode")],
  ["carte-zones", a(null, "toggleZoneMode")],
  ["carte-structures", a(null, "toggleStructureMode")],
  ["carte-popup", async function (p) { await popup(p, 0); }],
  ["carte-popup-2", async function (p) { await popup(p, 3); }],
  ["carte-popup-trace", async function (p) { await popup(p, 0, true); }],
  ["carte-filtres-modifies", async function (p) {
    await appel(p, "FilterPanel", "ouvrir"); await p.waitForTimeout(500);
    await p.evaluate(function () {
      const cb = document.querySelector("#kta-fp-modal input[type=checkbox][id^='kta-fp-tag-']"); if (cb) cb.click();
      const t = document.querySelectorAll("#kta-fp-modal .kta-fp-section-titre"); if (t[0]) t[0].click();
      const chip = document.querySelector("#kta-fp-modal .kta-fp-chip"); if (chip) chip.click();
    });
  }],
  ["carte-itineraire-calcule", itineraire],
  ["carte-itineraire-modale-calcule", a(null, "ouvrirItinerairModal")],
  ["carte-alerte-urgence", async function (p) { await alerte(p, "emergency"); }],
  ["carte-alerte-attention", async function (p) { await alerte(p, "warning"); }],
  ["carte-alerte-info", async function (p) { await alerte(p, "info"); }],
  ["carte-kta-alerte", async function (p) { await p.evaluate(function () { window.ktaAlerte("Message de test."); }); }],
  ["carte-kta-alerte-erreur", async function (p) { await p.evaluate(function () { window.ktaAlerte("Erreur de test.", { type: "erreur" }); }); }],
  ["carte-kta-confirm", async function (p) { await p.evaluate(function () { window.ktaConfirm("Confirmer le test ?").catch(function () {}); }); }],
  ["carte-osm", async function (p) {
    await p.evaluate(function () { try { window.OsmView.setOptedIn(true); window.OsmView.open(); } catch (e) { /* indisponible */ } });
    await p.waitForTimeout(2500);
  }],
  ["carte-histoire-pdf", a("ModeHistoire", "openTab", ["pdf"])],
  ["carte-histoire-note", a("ModeHistoire", "openTab", ["note"])],
  ["carte-meminspector-crash", async function (p) {
    await p.evaluate(async function () {
      await window.CrashReports.saveCrash({ ageSec: 42, planId: "test" });
      await window.CrashReports.saveCrash({ ageSec: 7, planId: null });
      window.MemInspector.ouvrir();
    });
    await p.waitForTimeout(2000);
  }],
  ["carte-profil-export", async function (p) { await appel(p, "ProfileExportImport", "ouvrirExportModale"); await p.waitForTimeout(1200); }],
  ["carte-profil-import", async function (p) {
    await p.evaluate(async function () {
      const P = window.ProfileExportImport, prof = await P.buildProfile();
      P.ouvrirImportModale(new File([JSON.stringify(prof)], "profil.json", { type: "application/json" }));
    });
    await p.waitForTimeout(1500);
  }],
  ["carte-sortie", async function (p) { await appel(p, "Journal", "demarrer"); await p.waitForTimeout(500); await appel(p, "JournalUi", "ouvrir"); }],
  ["carte-histoire", a("ModeHistoire", "open")],
  ["carte-secours-liste", async function (p) { await p.evaluate(function () { window.SecoursMode.create("Scénario A"); window.SecoursMode.ouvrir(); }); }],
  ["carte-secours-edit", async function (p) { await secoursPret(p, "Scénario B"); }],
  ["carte-secours-creer", async function (p) { await appel(p, "SecoursMode", "ouvrir"); await p.waitForTimeout(400); await action(p, "new-scenario"); }],
  ["carte-secours-lancer", async function (p) { await secoursPret(p, "Scénario L"); await action(p, "ouvrir-lancer-modale"); }],
  ["carte-secours-phase", async function (p) { await secoursPret(p, "Scénario P"); await action(p, "add-phase"); }],
  ["carte-secours-live", async function (p) {
    await secoursPret(p, "Scénario V"); await action(p, "ouvrir-lancer-modale"); await action(p, "confirm-lancer");
    await p.evaluate(function () { const b = document.getElementById("kta-confirm-oui"); if (b) b.click(); });
    await p.waitForTimeout(800);
  }],
  ["carte-secours-live-rapport", async function (p) { await secoursActif(p); await action(p, "live-rapport"); }],
  ["carte-secours-live-details", async function (p) { await secoursActif(p); await action(p, "live-op-details"); }],
  ["carte-retour-accueil", async function (p) { await appel(p, null, "afficherLoader"); await p.waitForTimeout(1500); }, chargerPlan],
  ["carte-secours", a("SecoursMode", "ouvrir")],
  ["carte-perdu", a("LostMode", "open")],
  ["carte-urgence", a("EmergencyMode", "activer"), a("EmergencyMode", "desactiver")],
  ["carte-vue3d", async function (p) { await clic(p, ".kta-vue3d-ctrl a"); await p.waitForTimeout(8000); },
    async function (p) { await appel(p, "KtaVue3D", "fermer"); await p.waitForTimeout(800); }]
];

function liste() {
  const l = [];
  ACCUEIL.forEach(function (e) { l.push({ phase: "accueil", nom: e[0], go: e[1], ferme: e[2] }); });
  l.push({ phase: "plan", nom: "__plan__" });
  CARTE.forEach(function (e) { l.push({ phase: "carte", nom: e[0], go: e[1], ferme: e[2] }); });
  return l;
}

module.exports = { liste, chargerPlan, fermer };
