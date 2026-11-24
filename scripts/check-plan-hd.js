#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-plan-hd.js — garde-fou pré-commit BLOQUANT de « Régénérer en haute résolution » (js/planHD.js)
// =====================================================================
// js/recalageScan.js et js/planHD.js sont CHARGÉS dans un vm (calcul pur) puis éprouvés :
//   - facteurs ×2 / ×3 / ×4 : taille finale, refus au-delà du plafond de l'appareil (iPhone, ordinateur, côté max),
//     tuilage V2 au-delà de 4096² px ;
//   - plan-config à l'échelle : dimensions, calage (Réglages prioritaires), départ, échelle px/m, calages de calques
//     image (appareil prioritaire), ancien scan en calque (emprise ×k, rognage compris), le reste intact ;
//   - calques à l'échelle (homothétie EXACTE) : 🩸 le champ oublié est le bug classique — tout couple { x, y } du
//     fichier, où qu'il soit, doit sortir à ×k (sauf le côté d'une liaison qui vise un autre plan) ;
//   - liaisons recopiées pour le nouveau plan, identifiant libre (jamais celui du plan d'origine) ;
//   - câblage : ordre d'index.html, précache sw.js, Éditeur de données, Générateur (statut, tuilage), exporter.
// Jeux de test FICTIFS, fabriqués ici (aucune donnée de relevé).
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c, detail) => {
  console.log((c ? "✅" : "❌") + " " + n + (c || detail === undefined ? "" : " — " + JSON.stringify(detail)));
  if (!c) ko++;
};

const win = { console: { log() {}, warn() {}, error() {} } };
win.window = win;
vm.createContext(win);
try {
  vm.runInContext("var window = this;" + fs.readFileSync("js/recalageScan.js", "utf8"), win);
  vm.runInContext(fs.readFileSync("js/planHD.js", "utf8"), win);
} catch (e) {
  console.error("❌ js/planHD.js ne se charge pas : " + e.message);
  process.exit(1);
}
const P = win.KtaPlanHD;
if (!P) { console.error("❌ window.KtaPlanHD absent"); process.exit(1); }
t("le module expose la fenêtre (window.ktaOuvrirPlanHD)", typeof win.ktaOuvrirPlanHD === "function");

// ── Facteurs et plafond ──
let f = P.facteurs(1000, 800, P.plafond(true));
t("×2 / ×3 / ×4 : tailles finales", f.map(x => x.w + "x" + x.h).join(" ") === "2000x1600 3000x2400 4000x3200", f);
t("iPhone : 12,8 Mpx accepté, sans tuilage V2", !f[2].refuse && !f[2].tuilage);
f = P.facteurs(2100, 2100, P.plafond(true));
t("iPhone : 17,6 Mpx refusé (plafond 16,7 Mpx)", f[0].refuse === true, f[0]);
f = P.facteurs(2100, 2100, P.plafond(false));
t("ordinateur : 17,6 Mpx accepté, tuilage V2 requis", !f[0].refuse && f[0].tuilage, f[0]);
t("ordinateur : au-delà de 64 Mpx refusé", f[2].refuse === true, f[2]);
f = P.facteurs(9000, 100, P.plafond(false));
t("côté > 32 767 px refusé même sous le plafond de surface", f[2].refuse === true && !f[1].refuse, f);
t("dimensions inconnues : tout refusé", P.facteurs(0, 0, P.plafond(false)).every(x => x.refuse));

// Tous les couples { x, y } d'un objet, avec leur chemin ; `sauf(chemin, objet)` en écarte.
function couples(o, chemin, out, sauf) {
  out = out || [];
  if (!o || typeof o !== "object") return out;
  if (typeof o.x === "number" && typeof o.y === "number" && !(sauf && sauf(chemin, o))) out.push({ chemin: chemin, x: o.x, y: o.y });
  Object.keys(o).forEach(k => couples(o[k], chemin + "." + k, out, sauf));
  return out;
}
function tousDoubles(avant, apres, k, sauf) {
  const a = couples(avant, "", [], sauf), b = couples(apres, "", [], sauf);
  const faux = b.filter((p, i) => !a[i] || a[i].chemin !== p.chemin || p.x !== a[i].x * k || p.y !== a[i].y * k);
  return { ok: a.length === b.length && a.length > 0 && faux.length === 0, n: a.length, faux: faux.slice(0, 3) };
}

// ── plan-config ──
const cfg = {
  plan: { name: "Relevé fictif", version: "V3", imageWidth: 1000, imageHeight: 800, baseImage: "data/scan.png",
          rognage: { x: 12, y: 7 }, tiledV2: true, multiLevel: true, northOffsetDeg: 12,
          niveauxProfondeur: { "0": -20, "-1": -25 }, niveauxHauteur: { "0": 2.5 },
          customLegend: { labels: { "traces.principal": "Galerie" } },
          georef: { pointA: { x: 10, y: 790, lat: 45.1, lng: 1.2 }, pointB: { x: 990, y: 5, lat: 45.2, lng: 1.3, estimated: true },
                    pointC: { x: 10, y: 5, lat: 45.2, lng: 1.2 }, modele: "local" } },
  imageLayers: [
    { id: "legende", label: "Légende", file: "data/legende.png", visible: true, order: 10, level: 0 },
    { id: "niv-1", label: "Niveau -1", file: "data/n1.png", visible: true, order: 20, level: -1,
      calibration: { sourceA: { sx: 0, sy: 0 }, targetA: { x: 50, y: 60 }, sourceB: { sx: 400, sy: 300 }, targetB: { x: 450, y: 360 } } }
  ],
  dataLayers: [{ id: "points", label: "Points", file: "data/points.json", visible: true },
               { id: "editor", label: "Mes ajouts", file: "data/editor.json", visible: true }],
  tracking: { startX: 345, startY: 519, scale: 4.9 },
  icons: { default: "icon/default.png" },
  iconsEmbarquees: [],
  tiling: { version: 2, tileSize: 512 }
};
const copie = JSON.stringify(cfg);
let c = P.mettreAEchellePlanConfig(cfg, 2, { nom: "Relevé fictif (HD)", baseImage: "data/fond_hd.png" });
t("l'entrée n'est pas modifiée", JSON.stringify(cfg) === copie);
t("dimensions ×2", c.plan.imageWidth === 2000 && c.plan.imageHeight === 1600);
t("nom et image du nouveau plan", c.plan.name === "Relevé fictif (HD)" && c.plan.baseImage === "data/fond_hd.png");
t("ni rognage, ni tiledV2, ni manifeste de tuiles (image neuve, retuilée)", !c.plan.rognage && !c.plan.tiledV2 && !c.tiling);
t("calage : A, B, C à ×2, lat/lng, estimated et modèle intacts",
  c.plan.georef.pointA.x === 20 && c.plan.georef.pointA.y === 1580 && c.plan.georef.pointB.x === 1980 &&
  c.plan.georef.pointB.lat === 45.2 && c.plan.georef.pointB.estimated === true && c.plan.georef.pointC.y === 10 &&
  c.plan.georef.modele === "local");
t("départ du tracker et échelle px/m à ×2", c.tracking.startX === 690 && c.tracking.startY === 1038 && c.tracking.scale === 9.8);
t("calque image calé : cibles ×2, sources intactes",
  c.imageLayers[1].calibration.targetA.x === 100 && c.imageLayers[1].calibration.targetB.y === 720 &&
  c.imageLayers[1].calibration.sourceB.sx === 400);
t("calque image sans calage : inchangé (étiré sur le plan, il suit)", JSON.stringify(c.imageLayers[0]) === JSON.stringify(cfg.imageLayers[0]));
t("mètres, niveaux, Nord, légende, icônes, calques de données : intacts",
  JSON.stringify(c.plan.niveauxProfondeur) === JSON.stringify(cfg.plan.niveauxProfondeur) && c.plan.niveauxHauteur["0"] === 2.5 &&
  c.plan.northOffsetDeg === 12 && c.plan.multiLevel === true && c.plan.customLegend.labels["traces.principal"] === "Galerie" &&
  c.icons.default === "icon/default.png" && JSON.stringify(c.dataLayers) === JSON.stringify(cfg.dataLayers));
// Le rognage n'est pas une coordonnée du plan (décalage dans l'ancienne image source) : retiré, jamais mis à l'échelle.
const rognage = (chemin) => chemin === ".plan.rognage";
t("🩸 tout couple { x, y } du plan-config sort à ×2", tousDoubles(cfg, c, 2, rognage).ok, tousDoubles(cfg, c, 2, rognage));
c = P.mettreAEchellePlanConfig(cfg, 3, {
  georef: { pointA: { x: 1, y: 2, lat: 45, lng: 1 }, pointB: { x: 900, y: 700, lat: 45.1, lng: 1.1 } },
  scale: 6.5, depart: { x: 100, y: 200 },
  calibrations: { legende: { sourceA: { sx: 0, sy: 0 }, targetA: { x: 5, y: 5 }, sourceB: { sx: 10, sy: 10 }, targetB: { x: 15, y: 25 } } }
});
t("calage des Réglages prioritaire, à ×3", c.plan.georef.pointA.x === 3 && c.plan.georef.pointB.y === 2100 && !c.plan.georef.pointC);
t("échelle recalibrée et départ de l'appareil prioritaires, à ×3",
  Math.abs(c.tracking.scale - 19.5) < 1e-12 && c.tracking.startX === 300 && c.tracking.startY === 600);
t("calage de calque image de l'appareil prioritaire, à ×3", c.imageLayers[0].calibration.targetB.y === 75);
c = P.mettreAEchellePlanConfig({ plan: { imageWidth: 10, imageHeight: 10 } }, 4, {});
t("échelle absente = 4,9 px/m (défaut de l'app), passée à ×4", Math.abs(c.tracking.scale - 19.6) < 1e-12);

// ── Ancien scan en calque image ──
c = P.mettreAEchellePlanConfig(cfg, 2, { scan: { file: "data/scan_origine.png", label: "Ancien scan", rognage: null } });
let scan = c.imageLayers.find(l => l.id === P.ID_SCAN);
t("ancien scan : calque image ajouté, visible, niveau 0, sans calage (étiré sur 2000 × 1600)",
  !!scan && scan.file === "data/scan_origine.png" && scan.visible === true && scan.level === 0 && !scan.calibration);
c = P.mettreAEchellePlanConfig(cfg, 2, { scan: { file: "data/scan_origine.png", label: "Ancien scan", rognage: { x: 12, y: 7 } } });
scan = c.imageLayers.find(l => l.id === P.ID_SCAN);
t("ancien scan rogné : calé sur la partie qui fait le plan (coin → 0,0 ; coin opposé → 2000,1600)",
  !!scan.calibration && scan.calibration.sourceA.sx === 12 && scan.calibration.sourceA.sy === 7 &&
  scan.calibration.targetA.x === 0 && scan.calibration.sourceB.sx === 1012 && scan.calibration.sourceB.sy === 807 &&
  scan.calibration.targetB.x === 2000 && scan.calibration.targetB.y === 1600);

// ── Calques ──
function calqueTest() {
  return {
    type: "data",
    data: [
      { id: "P1", nom: "Puits", x: 100.25, y: 200.5, tags: ["pa"], uid: "pt_a", updatedAt: 1,
        interPlanLinks: [{ id: "ipl_1", a: { planId: "local_releve_fictif_v3", x: 100, y: 200 }, b: { planId: "local_autre", x: 7, y: 9 } }] },
      { id: "C", x: 3, y: 4, tags: ["chatiere"], precis: { pts: [{ x: 1, y: 2 }, { x: 5, y: 6 }] } },
      { id: "J", x: 5, y: 6, tags: ["jes"], niveaux: [0, -1], accroches: [{ level: -1, x: 7, y: 8 }], precis: { x: 1, y: 1 } }
    ],
    roads: [{ type: "principal", uid: "rd_a", points: [{ x: 1, y: 2 }, { x: 3.333, y: 4 }] }],
    zones: [{ type: "masse-sol", comble: 0.5, points: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }],
              rampes: [{ bord: 1, fin: { x: 5, y: 5 } }] }],
    structures: [{ type: "pilier-bras", uid: "st_a", points: [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 11, y: 11 }, { x: 10, y: 11 }] }],
    measure: { points: [{ x: 1, y: 1 }] },
    customLegend: { labels: {} }
  };
}
const autreCote = (chemin) => /interPlanLinks\.\d+\.b$/.test(chemin);
let a = calqueTest(), b = calqueTest();
let cpt = P.mettreAEchelleCalque(b, 3, "local_releve_fictif_v3");
t("🩸 tout couple { x, y } du calque sort à ×3 EXACTEMENT (côté de la liaison vers un autre plan excepté)",
  tousDoubles(a, b, 3, autreCote).ok, tousDoubles(a, b, 3, autreCote));
t("liaison embarquée : le côté qui vise un autre plan est intact",
  b.data[0].interPlanLinks[0].b.x === 7 && b.data[0].interPlanLinks[0].b.planId === "local_autre" && cpt.liaisons === 1);
t("uid, updatedAt, tags, niveaux, part comblée, bord de rampe : intacts",
  b.data[0].uid === "pt_a" && b.data[0].updatedAt === 1 && b.data[2].niveaux[1] === -1 && b.zones[0].comble === 0.5 &&
  b.zones[0].rampes[0].bord === 1 && b.roads[0].uid === "rd_a");
t("homothétie exacte : 3,333 × 3 sans arrondi", b.roads[0].points[1].x === 3.333 * 3);

// ── Liaisons et identifiant ──
const liens = [
  { id: "ipl_1", a: { planId: "local_x", planName: "X", x: 10, y: 20 }, b: { planId: "local_y", x: 1, y: 2 }, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ipl_2", a: { planId: "local_z", x: 1, y: 1 }, b: { planId: "local_y", x: 1, y: 1 } },
  { id: "ipl_3", a: { planId: "local_x", x: 1, y: 1 }, b: { planId: "local_x", x: 2, y: 3 } }
];
const avantLiens = JSON.stringify(liens);
const lc = P.liaisonsPourNouveauPlan(liens, "local_x", "local_x_hd", "X (HD)", 2, i => "neuf" + i);
t("liaisons : seules celles du plan d'origine, entrée intacte", lc.length === 2 && JSON.stringify(liens) === avantLiens);
t("liaison recopiée : nouvel id, côté d'origine → nouveau plan à ×2, autre côté intact",
  lc[0].id === "neuf0" && lc[0].a.planId === "local_x_hd" && lc[0].a.planName === "X (HD)" && lc[0].a.x === 20 &&
  lc[0].a.y === 40 && lc[0].b.planId === "local_y" && lc[0].b.x === 1);
t("liaison d'un plan vers lui-même : les deux côtés suivent", lc[1].a.planId === "local_x_hd" && lc[1].b.planId === "local_x_hd" && lc[1].b.y === 6);
const reg = { ids: new Set(["local_x_hd_v3"]),
  genLocalId: (n, v) => "local_" + String(n).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") + (v ? "_" + v.toLowerCase() : ""),
  findById(id) { return this.ids.has(id) ? { id: id } : null; } };
t("identifiant libre : suffixé s'il est pris", P.idLibre(reg, "X (HD)", "V3", "local_x_v3") === "local_x_hd_v3_2");
t("identifiant libre : jamais celui du plan d'origine", P.idLibre(reg, "X", "V3", "local_x_v3") === "local_x_v3_2");
t("identifiant libre : nom neuf = son id naturel", P.idLibre(reg, "Y", "", "local_x_v3") === "local_y");

// ── Câblage ──
const idx = fs.readFileSync("index.html", "utf8");
const pos = n => idx.indexOf('src="js/' + n + '"');
t("index.html : planHD.js chargé après recalageScan.js et majPlan.js",
  pos("planHD.js") > 0 && pos("planHD.js") > pos("recalageScan.js") && pos("planHD.js") > pos("majPlan.js"));
t("sw.js : planHD.js précaché", /"\.\/js\/planHD\.js"/.test(fs.readFileSync("sw.js", "utf8")));
t("Éditeur de données : bouton qui ouvre la fenêtre", /ktaOuvrirPlanHD\(\)/.test(fs.readFileSync("js/tableEditor.js", "utf8")));
t("MajPlan expose l'archive du plan (zipDuPlan)", /zipDuPlan:\s*_zipDuPlan/.test(fs.readFileSync("js/majPlan.js", "utf8")));
const cc = fs.readFileSync("js/createConf.js", "utf8");
t("Générateur : statut et tuilage V2 de l'assistant appliqués", /maj\.statut/.test(cc) && /maj\.tilingV2/.test(cc));
t("exporter.js : option sansIcones (fond peint sans icônes)", /opts\.sansIcones/.test(fs.readFileSync("js/exporter.js", "utf8")));

console.log("");
if (ko) { console.log("❌ check-plan-hd : " + ko + " échec(s)"); process.exit(1); }
console.log("🎉 régénérer en haute résolution : tout passe");
