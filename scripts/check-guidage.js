#!/usr/bin/env node
/*!
 * MyKTAMap — check-guidage.js
 * Filet du guidage de l'itinéraire (js/itiGuidage.js + champs `raccords` /
 * `carrefours` de js/pathfinder.js). Étude : docs/ETUDE_GUIDAGE.md.
 *
 * CHARGE les vrais modules (pathfinder + itiGuidage) dans un bac à sable et
 * les fait tourner sur des réseaux FICTIFS : aucune donnée de data/ ici (un
 * relevé réel ne part jamais sur le dépôt).
 *
 * Ce qu'il fige — la logique « quand annoncer » de l'étude :
 *   • un croisement se dit, même pour aller tout droit ;
 *   • un simple coude du dessin, ou le tremblement du dessin à la main, ne se
 *     dit pas ; un virage franc sans croisement, si ;
 *   • deux sorties trop proches → « la branche de gauche / droite » ;
 *   • un quadrillage serré (chambre à piliers) ne produit pas une consigne
 *     tous les trois mètres ;
 *   • le raccord à vol d'oiseau est rendu, compté (×2 pour une étape) et
 *     alerté au-delà de 50 m ;
 *   • le passage d'une jonction de niveau se dit.
 *
 * Usage : node scripts/check-guidage.js   (exit 1 si un contrôle échoue)
 */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

function bac(roads, cfg) {
  const win = {
    console: { log(){}, warn(){}, error(){} },
    APP_CONFIG: Object.assign({ scale: 4, multiLevel: false, imageHeight: 1000 }, cfg || {}),
    I18n: { t: (k, p) => k + (p ? JSON.stringify(p) : "") },
    formatDistance: (m) => Math.round(m) + " m",
    getRoads: () => [],
    getAllEmbeddedRoads: () => roads,
    getEditorPoints: () => [],
    getAllEmbeddedPoints: () => [],
    getProfondeurNiveau: () => null
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ["js/pathfinder.js", "js/itiGuidage.js"].forEach(function(f) {
    vm.runInContext("var window = this;" + fs.readFileSync(path.join(ROOT, f), "utf8"), ctx);
  });
  return win;
}

const R = (type, pts, extra) => Object.assign({ type: type, points: pts.map(p => ({ x: p[0], y: p[1] })) }, extra || {});

async function itineraire(win, de, vers, opts) {
  const r = await win.Pathfinder.computeRoute(
    [{ x: de[0], y: de[1], label: "A" }, { x: vers[0], y: vers[1], label: "B" }], opts || {});
  const road = { type: "itinerary", points: r.path, raccords: r.raccords, carrefours: r.carrefours };
  return { r: r, road: road, guide: win.ItiGuidage.construire(road) };
}

const sansArrivee = g => g.consignes.filter(c => c.type !== "arrivee");

(async function main() {
  // 1) Croisement en T, on tourne : un seul virage franc, à droite
  //    (cap est → cap sud : sud est à droite de l'est, y croît vers le bas).
  {
    const w = bac([R("principal", [[0, 500], [400, 500]]), R("principal", [[200, 500], [200, 900]])]);
    const it = await itineraire(w, [20, 500], [200, 880]);
    const cs = sansArrivee(it.guide);
    t("T : le croisement est trouvé sur le chemin", it.r.carrefours.length >= 1);
    t("T : une seule consigne avant l'arrivée", cs.length === 1);
    t("T : c'est « tourner à droite »", cs[0] && cs[0].type === "virage" && cs[0].cote === "droite" && cs[0].force === "franc");
    t("T : placée au croisement (± 2 m)", cs[0] && Math.abs(cs[0].s - 180) <= 8);
    t("T : l'arrivée ferme la liste", it.guide.consignes[it.guide.consignes.length - 1].type === "arrivee");
    // 🩸 Le départ s'accroche sur un segment qui porte un nœud de croisement :
    // le chemin partait d'abord EN ARRIÈRE jusqu'à l'extrémité (+2×20 px).
    t("🩸 T : pas d'aller-retour au départ (180 + 380 px, pas 220 + 380)",
      Math.abs(it.r.totalDistance - 560) < 0.5);
    t("🩸 T : pas de « demi-tour » au départ", !it.guide.consignes.some(c => c.type === "demiTour"));
  }

  // 2) Croisement franchi TOUT DROIT : il se dit quand même (étude, règle 1)
  //    — et c'est le cas où le chemin peut ne PAS traverser le nœud du
  //    croisement (arête d'origine gardée dans le graphe).
  {
    const w = bac([R("principal", [[0, 500], [400, 500]]), R("principal", [[200, 300], [200, 700]])]);
    const it = await itineraire(w, [20, 500], [380, 500]);
    const cs = sansArrivee(it.guide);
    t("croisement tout droit : trouvé même si le chemin l'enjambe", it.r.carrefours.length >= 1);
    t("croisement tout droit : « continuer tout droit »", cs.length === 1 && cs[0].type === "toutDroit");
  }

  // 3) Tracé tremblé à la main (± 2 px tous les 5 px) : aucune consigne parasite
  {
    const pts = [];
    for (let x = 0; x <= 600; x += 5) pts.push([x, 500 + ((x / 5) % 2 ? 2 : -2)]);
    const w = bac([R("principal", pts)]);
    const it = await itineraire(w, [10, 500], [590, 500]);
    t("dessin tremblé : aucune consigne avant l'arrivée", sansArrivee(it.guide).length === 0);
  }

  // 4) Coude franc SANS croisement → dit ; coude doux → tu
  {
    const w = bac([R("principal", [[0, 500], [300, 500], [300, 100]])]);
    const it = await itineraire(w, [20, 500], [300, 120]);
    const cs = sansArrivee(it.guide);
    t("coude franc sans croisement : dit (le tracé ne montre pas toutes les ouvertures)",
      cs.length === 1 && cs[0].type === "virage" && cs[0].cote === "gauche");
    const w2 = bac([R("principal", [[0, 500], [300, 500], [600, 380]])]);   // ~22°
    const it2 = await itineraire(w2, [20, 500], [590, 384]);
    t("coude doux sans croisement : tu", sansArrivee(it2.guide).length === 0);
  }

  // 5) Fourche en Y à ±15° : « la branche de gauche »
  {
    const w = bac([
      R("principal", [[0, 500], [300, 500]]),
      R("principal", [[300, 500], [700, 393]]),   // -15° (vers le haut = gauche en allant à l'est)
      R("principal", [[300, 500], [700, 607]])    // +15°
    ]);
    const it = await itineraire(w, [20, 500], [690, 396]);
    const cs = sansArrivee(it.guide);
    t("fourche : une consigne", cs.length === 1);
    t("fourche : « prendre la branche de gauche »", cs[0] && cs[0].type === "branche" && cs[0].cote === "gauche");
  }

  // 6) Quadrillage serré (chambre à piliers, maille 2 m = 8 px) traversé en
  //    ligne droite : la fusion empêche une consigne à chaque maille.
  {
    const roads = [];
    for (let k = 0; k <= 30; k++) {
      roads.push(R("principal", [[0, 400 + k * 8], [240, 400 + k * 8]]));
      roads.push(R("principal", [[k * 8, 400], [k * 8, 640]]));
    }
    const w = bac(roads);
    const it = await itineraire(w, [0, 520], [240, 520]);
    const cs = sansArrivee(it.guide);
    const metres = it.guide.longueurPx / 4;
    t("piliers : " + cs.length + " consigne(s) pour " + Math.round(metres) + " m (≤ 1 tous les 4 m)",
      cs.length <= Math.ceil(metres / 4));
  }

  // 7) Raccords à vol d'oiseau : rendus, comptés, alertés
  {
    const w = bac([R("principal", [[0, 500], [400, 500]])], { scale: 0.5 });   // 0,5 px/m
    const it = await itineraire(w, [100, 460], [300, 500]);                     // 40 px = 80 m
    const dep = it.r.raccords.find(r => r.role === "depart");
    t("raccord : le départ hors tracé est rendu", dep && Math.abs(dep.distPx - 40) < 0.01);
    t("raccord : il vise le tracé le plus proche", dep && Math.abs(dep.vers.y - 500) < 0.01);
    t("raccord : consigne « rejoindre le tracé » au départ", !!it.guide.depart);
    t("raccord : 80 m > 50 m → alerte", it.guide.alerteRaccord && Math.round(it.guide.alerteRaccord.distM) === 80);
    t("raccord : compté dans la longueur", Math.abs(w.ItiGuidage.longueurRaccordsPx(it.road) - 40) < 0.01);
    const etape = { raccords: [{ role: "etape", distPx: 10 }, { role: "arrivee", distPx: 3 }] };
    t("raccord : une étape hors tracé compte aller ET retour", w.ItiGuidage.longueurRaccordsPx(etape) === 23);
    const w2 = bac([R("principal", [[0, 500], [400, 500]])], { scale: 4 });
    const it2 = await itineraire(w2, [100, 460], [300, 500]);                   // 10 m
    t("raccord : 10 m → pas d'alerte", it2.guide.alerteRaccord === null);
  }

  // 8) Jonction de niveau : « monter / descendre » (niveau croissant = plus haut)
  {
    const w = bac([
      R("principal", [[0, 500], [200, 500]], { level: 0 }),
      R("jonction", [[200, 500], [205, 500], [210, 500]], { fromLevel: 0, toLevel: 1 }),
      R("principal", [[210, 500], [400, 500]], { level: 1 })
    ], { multiLevel: true });
    const it = await itineraire(w, [20, 500], [390, 500]);
    const niv = it.guide.consignes.find(c => c.type === "niveau");
    t("niveau : le passage de jonction est dit", !!niv);
    t("niveau : vers le niveau 1, en montant", niv && niv.vers === 1 && niv.sens === "monter");
  }

  // 9) Plan sans tracé : détecté (on avertit au lancement)
  {
    t("aucun tracé : aDesTraces() = faux", bac([]).Pathfinder.aDesTraces() === false);
    t("aucun tracé : un itinéraire seul ne compte pas",
      bac([R("itinerary", [[0, 0], [10, 0]])]).Pathfinder.aDesTraces() === false);
    t("un tracé : aDesTraces() = vrai", bac([R("principal", [[0, 0], [10, 0]])]).Pathfinder.aDesTraces() === true);
  }

  // 10) Rétro-compat : un itinéraire d'avant le guidage (sans raccords ni carrefours)
  {
    const w = bac([]);
    const g = w.ItiGuidage.construire({ type: "itinerary", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] });
    t("ancien itinéraire : se lit sans planter", !!g && g.consignes.length === 1);
    t("ancien itinéraire : aucune longueur de raccord", w.ItiGuidage.longueurRaccordsPx({ points: [] }) === 0);
  }

  console.log(ko ? "\n⚠️ " + ko + " echec(s)" : "\n🎉 guidage : tout passe");
  process.exit(ko ? 1 : 0);
})().catch(function(e) { console.error("❌ check-guidage a planté :", e); process.exit(1); });
