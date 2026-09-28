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

// Faux DOM : juste ce que le bandeau touche (style, classList, textContent,
// innerHTML, querySelector par classe, événements).
function fauxElement() {
  const enfants = {};
  const classes = new Set();
  return {
    style: {}, textContent: "", innerHTML: "", title: "", isConnected: true,
    classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); }, contains: c => classes.has(c) },
    setAttribute() {}, addEventListener() {},
    querySelector(sel) { return enfants[sel] || (enfants[sel] = fauxElement()); }
  };
}

async function bandeau() {
  const roads = [
    R("principal", [[0, 500], [800, 500]]),
    R("principal", [[400, 500], [400, 900]])
  ];
  const w = bac(roads, { smartNav: true });
  const it = await itineraire(w, [20, 500], [400, 880]);
  const pos = { x: 20, y: 500 };
  let actif = true, iti = it.road;
  const ls = {};
  Object.assign(w, {
    document: { body: { appendChild() {} }, createElement: () => (w.__bandeau = fauxElement()) },
    localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
    getTrackingActif: () => actif,
    getTrackingPosition: () => pos,
    getPlanRelHeading: () => 90,
    getRoads: () => (iti ? [iti] : [])
  });
  const G = w.ItiGuidage;
  const aller = (x, y) => { pos.x = x; pos.y = y; G.onPosition(pos); return G.etat(); };

  let e = aller(20, 500);
  t("bandeau : visible (suivi actif + itinéraire)", e.visible === true && e.mode === "guide");
  t("bandeau : « dans … tourner à droite »",
    /guid\.bandeau\.dans/.test(e.principal) && /tournerDroite/.test(e.principal));
  t("bandeau : mètres nets avec la navigation intelligente", !/~/.test(e.principal));
  e = aller(396, 500);
  t("bandeau : à l'approche, « maintenant »", /guid\.bandeau\.maintenant/.test(e.principal));

  // Écart : 3 positions hors du chemin (seuil nav intelligente) avant l'alerte
  aller(400, 600);                                   // on a tourné : sur le chemin
  e = aller(600, 500);
  t("écart : une seule position hors chemin ne suffit pas", e.mode === "guide");
  aller(610, 500); e = aller(620, 500);
  t("écart : confirmé → « Hors itinéraire ? »", e.mode === "ecart");
  e = aller(400, 650);
  t("écart : retour sur le chemin → l'alerte tombe", e.mode === "guide");

  // Demi-tour : on recule de plus de 10 m sur le trajet, 3 fois de suite
  aller(400, 800);
  aller(400, 740); aller(400, 735); e = aller(400, 730);
  t("demi-tour : recul confirmé → « Demi-tour ? »", e.mode === "demi");
  e = aller(400, 810);
  t("demi-tour : on repart dans le bon sens → l'alerte tombe", e.mode === "guide");

  // Réglage « Jamais » et croix
  G.setPref("jamais");
  t("réglage Jamais : bandeau masqué", G.etat().visible === false);
  G.setPref("auto");
  t("réglage Auto : bandeau de retour", G.etat().visible === true);
  iti = Object.assign({}, it.road, { urgence: true });
  G.setPref("jamais");
  t("urgence : affiché même réglé sur Jamais", G.etat().visible === true && G.etat().urgence === true);
  G.setPref("auto");
  actif = false; G.rafraichir();
  t("suivi arrêté : bandeau masqué", G.etat().visible === false);
  actif = true;

  // Départ hors tracé : « rejoindre le tracé » + flèche relative au téléphone
  iti = Object.assign({}, it.road);                  // nouvelle road → état neuf
  e = aller(100, 460);                               // 10 m au nord du trajet
  t("hors tracé au départ : « Rejoindre le tracé »", e.mode === "rejoindre");
  t("hors tracé : flèche relative (tracé au sud, marche vers l'est → +90°)", e.fleche === 90);

  // Sans navigation intelligente : « ~ » et arrondi à 10 m
  w.APP_CONFIG.smartNav = false;
  iti = Object.assign({}, it.road);
  e = aller(20, 500);
  t("sans nav intelligente : distances précédées de « ~ »", /~/.test(e.principal));
  t("sans nav intelligente : une suggestion faite, une seule", ls["myktamap_guidage_astuce_smartnav"] === "1");

  // Urgence (lot 4, décisions C/G) : pas de croix, « Recalculer » vise la
  // sortie la plus proche d'ICI (SortieUrgence.relancerDepuis)
  w.APP_CONFIG.smartNav = true;
  let relance = null;
  w.SortieUrgence = { relancerDepuis: p => { relance = { x: p.x, y: p.y }; } };
  iti = Object.assign({}, it.road, { urgence: true });
  aller(20, 500); aller(400, 600);
  aller(600, 500); aller(610, 500); e = aller(620, 500);
  const actionsHtml = w.__bandeau.querySelector(".kta-guid-actions").innerHTML;
  t("urgence : écart signalé", e.mode === "ecart" && e.urgence === true);
  t("urgence : le bouton dit « sortie la plus proche d'ici »", /guid.btn.sortieProche/.test(actionsHtml));
  t("urgence : pas de croix (décision C)", w.__bandeau.querySelector(".kta-guid-fermer").style.display === "none");
  G.agir("recalculer");
  t("urgence : « Recalculer » relance les sorties depuis la position actuelle",
    relance && relance.x === 620 && relance.y === 500);
  let replan = null;
  w.itineraireReplanifierDepuis = (x, y) => { replan = [x, y]; };
  iti = Object.assign({}, it.road);
  aller(20, 500); aller(400, 600);
  aller(600, 500); aller(610, 500); aller(620, 500);
  G.agir("recalculer");
  t("hors urgence : « Recalculer » replanifie l'itinéraire depuis ici", replan && replan[0] === 620);
  t("hors urgence : la croix est là", w.__bandeau.querySelector(".kta-guid-fermer").style.display === "");

  // Câblage (sources) : la sortie d'urgence marque son itinéraire, « Y aller »
  // le porte sans question, la replanification le garde, l'écran XL lit l'état.
  const src = f => fs.readFileSync(path.join(ROOT, f), "utf8");
  const su = src("js/sortieUrgence.js"), ii = src("js/interfaceItineraire.js");
  const em = src("js/emergencyMode.js"), tr = src("js/tracking.js");
  t("câblage : la sortie d'urgence trace avec urgence: true", su.includes("origine: _lastResultats.origine, urgence: true"));
  t("câblage : SortieUrgence.relancerDepuis existe", su.includes("SU.relancerDepuis = function"));
  t("câblage : « Y aller » marque la road urgence", ii.includes("if (opts.urgence) newRoad.urgence = true;"));
  t("câblage : « Y aller » ne demande pas de remplacer en urgence", ii.includes("if (existing && !opts.urgence)"));
  t("câblage : la replanification garde l'urgence", ii.includes("if (road.urgence) newRoad.urgence = true;"));
  t("câblage : l'écran XL lit ItiGuidage.etat() à chaque tick",
    em.includes("    _majGuidage();") && em.includes("window.ItiGuidage.etat()"));
  t("câblage : tracking.js nourrit le bandeau à chaque pas", tr.includes("window.ItiGuidage.onPosition(position)"));
  w.APP_CONFIG.smartNav = false;
}

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

  // 4) Coude SANS croisement → tu, même franc (retour KARMA, catacombes :
  //    tant qu'il n'y a qu'un chemin, suivre la galerie suffit)
  {
    const w = bac([R("principal", [[0, 500], [300, 500], [300, 100]])]);
    const it = await itineraire(w, [20, 500], [300, 120]);
    const cs = sansArrivee(it.guide);
    t("coude franc (90°) sans croisement : tu", cs.length === 0);
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

  // 5 bis) 🩸 Épingle par une galerie de liaison de 5 m (ouest → sud → est) :
  //   angle ≈ 180°, mais le trajet ne revient PAS sur lui-même → virage, pas
  //   « demi-tour » (cas réel : la fusion en chaîne l'annonçait ainsi). Les
  //   deux coins sont de vrais croisements (une galerie continue vers l'ouest).
  {
    const w = bac([
      R("principal", [[400, 500], [100, 500]]),
      R("principal", [[200, 500], [200, 520]]),
      R("principal", [[100, 520], [400, 520]])
    ]);
    const it = await itineraire(w, [390, 500], [390, 520]);
    const cs = sansArrivee(it.guide);
    t("épingle : pas de « demi-tour »", !cs.some(c => c.type === "demiTour"));
    t("épingle : dite comme un virage à gauche", cs.length >= 1 && cs.every(c => c.type === "virage" && c.cote === "gauche"));
    // Aller-retour au fond d'un cul-de-sac (sans croisement) : c'est l'ÉTAPE
    // qui se dit là, et le retour au croisement.
    const w2 = bac([R("principal", [[0, 500], [400, 500]]), R("principal", [[200, 500], [200, 380]])]);
    const r2 = await w2.Pathfinder.computeRoute([{ x: 20, y: 500 }, { x: 200, y: 380 }, { x: 380, y: 500 }], {});
    const g2 = w2.ItiGuidage.construire({ points: r2.path, raccords: r2.raccords, carrefours: r2.carrefours });
    const etape = g2.consignes.find(c => c.type === "etape");
    t("cul-de-sac : l'étape est dite au fond", !!etape && Math.abs(etape.y - 380) < 4);
    t("cul-de-sac : aucun virage inventé au fond", !g2.consignes.some(c => c.type === "virage" && c.y < 480));
  }

  // 5 ter) GRAND CARREFOUR (décisions 1:a / 2:a / 3:a / 4) — trois branches
  //   qui quittent la galerie à 2,5 m d'intervalle (un carrefour réel n'est
  //   pas un nœud, c'est une zone) : UNE consigne, posée à l'entrée, avec le
  //   schéma des 5 galeries et le nom du lieu.
  {
    const w = bac([
      R("principal", [[0, 500], [800, 500]]),
      R("principal", [[390, 500], [290, 400]]),   // nord-ouest
      R("principal", [[400, 500], [400, 700]]),   // sud
      R("principal", [[410, 500], [510, 400]])    // nord-est
    ]);
    const r = await w.Pathfinder.computeRoute([{ x: 20, y: 500 }, { x: 500, y: 410 }], {});
    const road = { points: r.path, raccords: r.raccords, carrefours: r.carrefours };
    const g = w.ItiGuidage.construire(road, { pois: [{ x: 400, y: 488, nom: "Carrefour test" }] });
    const cs = sansArrivee(g);
    t("grand carrefour : les croisements proches forment une zone", r.carrefours.some(c => c.zone && c.zone.sorties.length === 5));
    t("grand carrefour : UNE seule consigne (pas une par croisement)", cs.length === 1);
    t("grand carrefour : posée à l'entrée de la zone", cs[0] && Math.abs(cs[0].s - 370) <= 4);
    // En marchant vers l'est, le nord-est est DEVANT À GAUCHE (angle négatif).
    t("grand carrefour : schéma à 5 galeries, la choisie devant-gauche",
      cs[0] && cs[0].picto && cs[0].picto.rayons.length === 5 && cs[0].picto.choisie < -10 && cs[0].picto.choisie > -70);
    t("grand carrefour : la galerie tout droit est à < 35° → « la branche de gauche »",
      cs[0] && cs[0].type === "branche" && cs[0].cote === "gauche");
    t("grand carrefour : l'arrivée dessinée derrière (~180°)", cs[0] && cs[0].picto && Math.abs(Math.abs(cs[0].picto.arrivee) - 180) < 10);
    t("grand carrefour : SVG produit", /<svg[^>]*kta-guid-picto/.test(w.ItiGuidage.pictoSvg(cs[0] && cs[0].picto, 40)));
    t("grand carrefour : le lieu nommé ouvre la consigne", cs[0] && cs[0].lieu === "Carrefour test" &&
      /guid\.lieu/.test(w.ItiGuidage.texteAction(cs[0])));
    // Deux croisements à 8 m l'un de l'autre : deux carrefours, pas une zone
    const w2 = bac([
      R("principal", [[0, 500], [800, 500]]),
      R("principal", [[300, 500], [300, 700]]),
      R("principal", [[332, 500], [332, 300]])
    ]);
    const r2 = await w2.Pathfinder.computeRoute([{ x: 20, y: 500 }, { x: 780, y: 500 }], {});
    const g2 = w2.ItiGuidage.construire({ points: r2.path, raccords: r2.raccords, carrefours: r2.carrefours });
    t("croisements à 8 m : deux consignes (au-delà de 5 m, pas une zone)", sansArrivee(g2).length === 2);
    t("croisements à 8 m : pas de schéma (3 galeries chacun)", sansArrivee(g2).every(c => !c.picto));
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

  // 11) BANDEAU EN DIRECT (lot 2) — simulation de marche, faux DOM minimal
  await bandeau();

  console.log(ko ? "\n⚠️ " + ko + " echec(s)" : "\n🎉 guidage : tout passe");
  process.exit(ko ? 1 : 0);
})().catch(function(e) { console.error("❌ check-guidage a planté :", e); process.exit(1); });
