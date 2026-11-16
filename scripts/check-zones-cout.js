#!/usr/bin/env node
/*
 * MyKTAMap — check-zones-cout.js
 * Garde-fou BLOQUANT des zones à coût de l'itinéraire : Comblé (`remblais`) et effondrement ne sont JAMAIS des
 * contraintes dures. CHARGE poiJonction.js, pathfinder.js et verifierPlan.js dans un bac à sable, sur des réseaux
 * FICTIFS en mémoire (aucune donnée de data/ ici).
 *
 * Il fige :
 *   • évitées quand un autre chemin existe, même bien plus long ; traversées sans autre chemin, et le résultat le dit
 *     (`zonesTraversees`, phrase de `texteZonesTraversees`) ; jamais « aucun chemin » à cause d'elles ;
 *   • la distance rendue reste la vraie longueur (le coût vit à part) ; sans zone à coût, coût = distance ;
 *   • la case « Respecter… » ne les lève pas, la passe 2 non plus ; elles ne sont plus dans les évitables ;
 *   • `inaccessible` reste dure ; une zone d'un autre niveau ne coûte rien ; le Secours / Perdu (computeReachable)
 *     les ignore ; l'inter-plans (computeRouteOnRoads) suit la même règle ;
 *   • « Vérifier le plan » : C12 range le tracé qui en traverse une en « revoir », jamais en bloquant ni en C1 ;
 *   • tables uniques (TYPES_ZONES_COUT), brancard sans Comblé coché ;
 *   • tolérance d'1 m : traversée continue de 0,5 m ignorée (itinéraire et C12), 1,5 m pénalisée et dite, tracé dense
 *     toujours évité (mesure par traversée, pas par arête), deux passages courts ignorés, sans échelle : strict ;
 *   • masse au sol (§ 10, charge aussi styleResolver.js et masseSol.js) : coût selon le vide (¼ ½ ¾ calculés à la
 *     main), coupé sous 0,5 m, détour préféré s'il coûte moins, brancard, sortie d'urgence, sol abaissé ×1, talus pris
 *     point par point, inter-plans, guidage (ralentissement cumulé), zones à coût et inaccessible inchangées.
 *
 * Usage : node scripts/check-zones-cout.js   (exit 1 si un contrôle échoue)
 */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const lire = f => fs.readFileSync(path.join(ROOT, f), "utf8");

let ko = 0;
const t = (n, c, detail) => {
  console.log((c ? "✅" : "❌") + " " + n + (!c && detail !== undefined ? " " + JSON.stringify(detail) : ""));
  if (!c) ko++;
};

const ECHELLE = 4;   // px/m
const P = (x, y) => ({ x: x, y: y });
const R = (uid, type, pts, extra) => Object.assign({ uid: uid, type: type, points: pts.map(p => P(p[0], p[1])) },
  extra || {});

// `extra` (facultatif) : { fichiers: modules chargés AVANT pathfinder.js, win: globales en plus }.
function bac(d, cfg, extra) {
  const win = {
    console: { log() {}, warn() {}, error() {} },
    APP_CONFIG: Object.assign({ scale: ECHELLE, multiLevel: false, imageHeight: 1000 }, cfg || {}),
    I18n: { t: (k, p) => k + (p ? JSON.stringify(p) : "") },
    formatDistance: (m) => m.toFixed(1) + " m",
    getRoads: () => d.roads || [],
    getAllEmbeddedRoads: () => [],
    getZones: () => d.zones || [],
    getStructures: () => d.structures || [],
    getEditorPoints: () => [],
    getAllEmbeddedPoints: () => [],
    getProfondeurNiveau: () => null,
    _ktaDataPolygons: d.calques || [],
    _ktaDataStructurePolygons: [],
    getPlanVerifVus: () => [],
    setPlanVerifVus: () => true,
    addEventListener() {},
    ktaEsc: s => String(s),
    ktaIcone: () => ""
  };
  Object.assign(win, (extra && extra.win) || {});
  win.window = win;
  const ctx = vm.createContext(win);
  win.__ctx = ctx;
  ((extra && extra.fichiers) || []).concat(["js/poiJonction.js", "js/pathfinder.js", "js/verifierPlan.js"])
    .forEach(function (f) {
    vm.runInContext("var window = this;" + lire(f), ctx);
  });
  return win;
}

// Galerie droite A(0,0) → B(200,0) ; détour A → (0,100) → (200,100) → B (400 px, 100 m). Zone au milieu de la droite.
const A = { x: 0, y: 0 }, B = { x: 200, y: 0 };
const droite = R("rd_droit", "principal", [[0, 0], [100, 0], [200, 0]]);
const detour = R("rd_detour", "principal", [[0, 0], [0, 100], [200, 100], [200, 0]]);
const zone = (type, extra) => R("zn_" + type, type, [[80, -20], [120, -20], [120, 20], [80, 20]], extra);

async function route(w, opts) {
  try {
    const r = await w.Pathfinder.computeRoute([A, B], Object.assign({ allowedTypes: ["principal"] }, opts || {}));
    return r;
  } catch (e) { return { erreur: e.code || String(e.message) }; }
}

(async function () {
  // ── 1. Tables ──
  {
    const w = bac({});
    const PF = w.Pathfinder;
    t("TYPES_ZONES_COUT = [remblais, effondrement]",
      JSON.stringify(PF.TYPES_ZONES_COUT) === JSON.stringify(["remblais", "effondrement"]));
    t("Comblé et effondrement : ni durs ni absents (estZoneCout vrai, estZoneDure faux)",
      PF.estZoneCout("remblais") && PF.estZoneCout("effondrement") && !PF.estZoneDure("remblais") &&
      !PF.estZoneDure("effondrement") && PF.estZoneDure("inaccessible") && !PF.estZoneCout("eau"));
    const sec = lire("js/secoursMode.js");
    const m = sec.match(/const BRANCARD_COCHES = (\[[^\]]*\])/);
    t("brancard : Comblé plus coché (évité d'office par son coût, jamais bloquant)",
      !!m && m[1].indexOf("remblais") < 0, m && m[1]);
    const pf = lire("js/pathfinder.js"), ipr = lire("js/interPlanRoute.js");
    t("pathfinder.js / interPlanRoute.js : aucun test `=== \"remblais\"` ou `\"effondrement\"` hors de la table",
      !/[!=]==\s*"(?:remblais|effondrement)"/.test(pf) && !/[!=]==\s*"(?:remblais|effondrement)"/.test(ipr) &&
      /estZoneCout/.test(ipr));
  }

  for (const type of ["remblais", "effondrement"]) {
    // ── 2. Évitée quand un autre chemin existe ──
    {
      const w = bac({ roads: [droite, detour], zones: [zone(type)] });
      const r = await route(w);
      t(type + " + détour : le détour est pris (400 px)", !r.erreur && Math.round(r.totalDistance) === 400,
        r.erreur || r.totalDistance);
      t(type + " + détour : rien de traversé, pas d'alerte", !r.erreur && r.zonesTraversees.length === 0 &&
        w.Pathfinder.texteZonesTraversees(r.zonesTraversees) === null);
      const r2 = await route(w, { respecterInaccessibles: false });
      t(type + " : la case « Respecter… » décochée ne lève pas l'évitement", !r2.erreur &&
        Math.round(r2.totalDistance) === 400);
      t(type + " : absent des types évitables (une case serait trompeuse)",
        w.getAvoidableZoneTypes().every(z => z.type !== type));
      const r3 = await route(w, { avoidZones: [type, "eau"] });
      t(type + " coché dans d'anciennes préférences : ignoré, pas de passe 2", !r3.erreur && !r3.usedFallback &&
        Math.round(r3.totalDistance) === 400);
    }
    // Détour très long (20 fois la droite) : toujours préféré.
    {
      const loin = R("rd_loin", "principal", [[0, 0], [0, 2000], [200, 2000], [200, 0]]);
      const w = bac({ roads: [droite, loin], zones: [zone(type)] });
      const r = await route(w);
      t(type + " : un détour 20 fois plus long l'emporte encore", !r.erreur && Math.round(r.totalDistance) === 4200,
        r.erreur || r.totalDistance);
    }
    // ── 3. Traversée sans autre chemin, et dite ──
    {
      const w = bac({ roads: [droite], zones: [zone(type)] });
      const r = await route(w);
      t(type + " seul chemin : l'itinéraire passe (jamais « aucun chemin »)", !r.erreur, r.erreur);
      t(type + " seul chemin : distance = vraie longueur (200 px), coût à part", !r.erreur &&
        Math.round(r.totalDistance) === 200 && r.cout > r.totalDistance, r.erreur || [r.totalDistance, r.cout]);
      const z = !r.erreur && r.zonesTraversees[0];
      t(type + " seul chemin : la zone est rendue, 40 px traversés", !!z && z.type === type &&
        Math.abs(z.longueurPx - 40) < 0.01 && z.objet.uid === "zn_" + type, r.zonesTraversees);
      const txt = !r.erreur && w.Pathfinder.texteZonesTraversees(r.zonesTraversees);
      t(type + " seul chemin : la phrase le dit (iti.zonesCout.traverse, 10 m)",
        typeof txt === "string" && txt.indexOf("iti.zonesCout.traverse") === 0 && txt.indexOf("10.0 m") > 0, txt);
      const cr = w.Pathfinder.computeReachable(A, 400);
      const atteint = cr.fullSegments.length + cr.partialSegments.length;
      t(type + " : le périmètre du Secours / Perdu (computeReachable) n'en tient pas compte",
        !cr.exceedsBudget && Math.abs(cr.totalReachableDistance - 200) < 1, [atteint, cr.totalReachableDistance]);
    }
    // Départ DANS la zone : passe aussi.
    {
      const w = bac({ roads: [droite], zones: [zone(type)] });
      let r;
      try { r = await w.Pathfinder.computeRoute([{ x: 100, y: 0 }, B], { allowedTypes: ["principal"] }); }
      catch (e) { r = { erreur: e.code }; }
      t(type + " : départ dans la zone → chemin trouvé, 20 px traversés",
        !r.erreur && r.zonesTraversees.length === 1 &&
        Math.abs(r.zonesTraversees[0].longueurPx - 20) < 0.01, r.erreur || r.zonesTraversees);
    }
    // ── 4. Inter-plans : réseau fourni ──
    {
      const w = bac({});
      const pf = w.Pathfinder;
      const r1 = pf.computeRouteOnRoads([A, B], [droite, detour],
        { allowedTypes: ["principal"], zones: [zone(type)] });
      t(type + " inter-plans : évitée si un autre chemin existe", Math.round(r1.totalDistance) === 400 &&
        r1.zonesTraversees.length === 0);
      const r2 = pf.computeRouteOnRoads([A, B], [droite], { allowedTypes: ["principal"], zones: [zone(type)],
        respecterInaccessibles: false });
      t(type + " inter-plans : seul chemin → traversée et rendue, distance vraie",
        Math.round(r2.totalDistance) === 200 &&
        r2.zonesTraversees.length === 1);
    }
  }

  // ── 5. Inaccessible reste dure ── (galerie en 4 segments : les bouts restent au graphe, le milieu sort)
  const droite4 = R("rd_droit4", "principal", [[0, 0], [50, 0], [100, 0], [150, 0], [200, 0]]);
  {
    const w = bac({ roads: [droite4], zones: [zone("inaccessible")] });
    const r = await route(w);
    t("inaccessible seul chemin : aucun chemin (NO_PATH)", r.erreur === "NO_PATH", r.erreur || r.totalDistance);
    const r2 = await route(w, { respecterInaccessibles: false });
    t("inaccessible : levée par la case, comme avant", !r2.erreur && Math.round(r2.totalDistance) === 200);
    let ko2 = null;
    try {
      w.Pathfinder.computeRouteOnRoads([A, B], [droite4],
        { allowedTypes: ["principal"], zones: [zone("inaccessible")] });
    }
    catch (e) { ko2 = e.code; }
    t("inaccessible inter-plans : toujours dure", ko2 === "NO_PATH", ko2);
  }

  // ── 6. Sans zone à coût : coût = distance, chemin inchangé ──
  {
    const w = bac({ roads: [droite, detour], zones: [zone("eau")] });
    const r = await route(w);
    t("sans zone à coût : droite prise, coût = distance au bit près", !r.erreur && r.cout === r.totalDistance &&
      Math.round(r.totalDistance) === 200 && r.zonesTraversees.length === 0);
  }

  // ── 7. Multi-niveau : une zone d'un autre niveau ne coûte rien ; calques comptés ──
  {
    const d0 = R("rd_d0", "principal", [[0, 0], [200, 0]], { level: 0 });
    const t0 = R("rd_t0", "principal", [[0, 0], [0, 100], [200, 100], [200, 0]], { level: 0 });
    const z1 = zone("remblais", { level: 1 });
    const w = bac({ roads: [d0, t0], zones: [z1] }, { multiLevel: true });
    let r;
    try { r = await w.Pathfinder.computeRoute([Object.assign({ level: 0 }, A), Object.assign({ level: 0 }, B)],
      { allowedTypes: ["principal"] }); } catch (e) { r = { erreur: e.code }; }
    t("multi-niveau : Comblé du niveau 1 ne détourne pas le niveau 0",
      !r.erreur && Math.round(r.totalDistance) === 200 &&
      r.zonesTraversees.length === 0, r.erreur || r.totalDistance);
    const w2 = bac({ roads: [droite, detour], calques: [zone("remblais")] });
    const r2 = await route(w2);
    t("Comblé d'un calque de données : évité aussi", !r2.erreur && Math.round(r2.totalDistance) === 400);
  }

  // ── 8. Vérifier le plan : C12 « à revoir », jamais bloquant ──
  {
    const w = bac({ roads: [droite, detour], zones: [zone("remblais"), zone("effondrement", { uid: "zn_eff2",
      points: [P(0, 40), P(20, 40), P(20, 60), P(0, 60)] })] });
    const l = w.KtaVerifierPlan.analyser().liste;
    const c12 = l.filter(c => c.controle === "C12");
    t("C12 : tracé à travers un Comblé → signalé", c12.some(c => c.objet.uid === "rd_droit" &&
      c.autre.uid === "zn_remblais"), c12.map(c => c.cle));
    t("C12 : tracé à travers un effondrement → signalé", c12.some(c => c.objet.uid === "rd_detour" &&
      c.autre.uid === "zn_eff2"), c12.map(c => c.cle));
    t("C12 : rangé en « revoir », jamais en bloquant", c12.length === 2 && c12.every(c => c.gravite === "revoir"));
    t("C12 : longueur dans la zone = 40 px", c12.some(c => Math.abs(c.longueurPx - 40) < 0.01));
    t("aucun C1 pour une zone à coût", l.filter(c => c.controle === "C1").length === 0, l.map(c => c.cle));
    t("C12 : clé = C12|uid du tracé|uid de la zone", c12.some(c => c.cle === "C12|rd_droit|zn_remblais"));
    t("C12 : même mesure que le graphe (zonesCoutDe = forme du graphe)",
      w.Pathfinder.controle.zonesCoutDe([zone("remblais"), zone("eau")]).length === 1);
  }

  // ── 9. Tolérance : une traversée continue de moins d'1 m est ignorée (contour un peu large) ──
  // À 4 px/m : 1 m = 4 px. Zone de 2 px (0,5 m) et de 6 px (1,5 m) en travers de la droite.
  {
    const bande = (larg, extra) => R("zn_bande", "remblais",
      [[100 - larg / 2, -20], [100 + larg / 2, -20], [100 + larg / 2, 20], [100 - larg / 2, 20]], extra);
    const C = bac({}).Pathfinder.controle;
    t("tolérance : une seule constante, 1 m (TOLERANCE_ZONE_COUT_M)", C.TOLERANCE_ZONE_COUT_M === 1);
    t("tolérance : 1 m = 4 px à 4 px/m, 0 sans échelle (repli strict)",
      C.toleranceZonePx(4) === 4 && bac({}, { scale: 0 }).Pathfinder.controle.toleranceZonePx(0) === 0);

    let w = bac({ roads: [droite, detour], zones: [bande(2)] });
    let r = await route(w);
    t("0,5 m traversé : ignoré, la droite est prise (200 px), rien n'est dit", !r.erreur &&
      Math.round(r.totalDistance) === 200 && r.zonesTraversees.length === 0,
      r.erreur || [r.totalDistance, r.zonesTraversees]);
    let c12 = w.KtaVerifierPlan.analyser().liste.filter(c => c.controle === "C12");
    t("0,5 m traversé : pas de C12 (ni « au bord »)", c12.length === 0, c12.map(c => c.cle));

    w = bac({ roads: [droite, detour], zones: [bande(6)] });
    r = await route(w);
    t("1,5 m traversé + détour : le détour est pris (400 px)", !r.erreur && Math.round(r.totalDistance) === 400,
      r.erreur || r.totalDistance);
    w = bac({ roads: [droite], zones: [bande(6)] });
    r = await route(w);
    t("1,5 m traversé, seul chemin : pénalisé et dit (6 px)", !r.erreur && r.cout > r.totalDistance &&
      r.zonesTraversees.length === 1 && Math.abs(r.zonesTraversees[0].longueurPx - 6) < 0.01,
      r.erreur || r.zonesTraversees);
    c12 = w.KtaVerifierPlan.analyser().liste.filter(c => c.controle === "C12");
    t("1,5 m traversé : C12 signalé", c12.length === 1 && Math.abs(c12[0].longueurPx - 6) < 0.01, c12.map(c => c.cle));

    // 🩸 Tracé dense (un sommet par pixel) dans la zone de 10 m : chaque arête < 1 m, la traversée reste de 10 m.
    const dense = R("rd_dense", "principal", Array.from({ length: 201 }, (_, i) => [i, 0]));
    w = bac({ roads: [dense, detour], zones: [zone("remblais")] });
    r = await route(w);
    t("tracé dense (arêtes de 1 px) à travers 10 m : toujours évité (mesure par traversée, pas par arête)",
      !r.erreur && Math.round(r.totalDistance) === 400, r.erreur || r.totalDistance);

    // Deux passages de 0,5 m chacun sur le même tracé : chacun ignoré (la tolérance est par traversée).
    const deux = R("zn_deux", "remblais", [[60, -20], [62, -20], [62, 20], [60, 20]]);
    const deux2 = R("zn_deux2", "remblais", [[140, -20], [142, -20], [142, 20], [140, 20]]);
    w = bac({ roads: [droite, detour], zones: [deux, deux2] });
    r = await route(w);
    t("deux traversées de 0,5 m : ignorées toutes deux (droite prise)",
      !r.erreur && Math.round(r.totalDistance) === 200, r.erreur || r.totalDistance);

    w = bac({ roads: [droite, detour], zones: [bande(2)] }, { scale: 0 });
    r = await route(w);
    t("sans échelle : aucune tolérance, la bande de 2 px est évitée (repli strict)", !r.erreur &&
      Math.round(r.totalDistance) === 400, r.erreur || r.totalDistance);
  }

  // ── 10. Masse au sol : coût selon le vide (docs/ETUDE_REMBLAIS.md § 8) ──
  // Hauteur du niveau 2 m (ktaMetresComble sans réglage), 4 px/m. Droite A → B = 200 px (50 m) ; masse x 80-120 (40 px
  // = 10 m traversés). Bords FERMÉS (sonde de la 3D simulée bloquée partout : KtaGalerie.zonesBloquent) → sol =
  // part × 2 m sur toute la traversée. Coût attendu = 200 px + 40 px × (facteur − 1) :
  //   ¼ : sol 0,5 → vide 1,5 m → courbé ×1,5 → 200 + 20 = 220 px (55 m) ;
  //   ½ : sol 1   → vide 1 m   → courbé ×1,5 → 220 px ;
  //   ¾ : sol 1,5 → vide 0,5 m → ramper ×3   → 200 + 80 = 280 px (70 m) ;
  //   0,8 : vide 0,4 m → coupé. Distance toujours 200 px.
  {
    const MASSE_FICHIERS = ["js/styleResolver.js", "js/masseSol.js"];
    const ferme = { KtaGalerie: { zonesBloquent: s2 => s2.map(() => true) } };
    const masse = (c, extra) => R("zn_ms", "masse-sol", [[80, -20], [120, -20], [120, 20], [80, 20]],
      Object.assign({ comble: c }, extra || {}));
    const bacM = (d, cfg, ouvert) => bac(d, cfg, { fichiers: MASSE_FICHIERS, win: ouvert ? {} : ferme });
    const proche = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-6);

    const PF0 = bacM({}).Pathfinder;
    t("masse : facteurs 1 / 1,5 / 3 / coupé aux seuils 1,8 / 1 / 0,5 m",
      PF0.facteurVide(1.8) === 1 && PF0.facteurVide(1.79) === 1.5 && PF0.facteurVide(1) === 1.5 &&
      PF0.facteurVide(0.99) === 3 && PF0.facteurVide(0.5) === 3 && PF0.facteurVide(0.49) === Infinity);
    for (const cas of [[0.25, 220], [0.5, 220], [0.75, 280]]) {
      const w = bacM({ roads: [droite], zones: [masse(cas[0])] });
      const r = await route(w);
      t("masse " + cas[0] + " : coût " + cas[1] + " px (calcul à la main), distance 200 px inchangée",
        !r.erreur && proche(r.cout, cas[1], 1e-6) && proche(r.totalDistance, 200, 1e-9),
        r.erreur || [r.cout, r.totalDistance]);
    }
    {
      // Rampe (zone.rampes, posée par le bord bas : ici le bord gauche x = 80, indice 3 du contour) : le sol monte de 0 à
      // 1,5 m sur la traversée au lieu d'être à 1,5 m partout → le vide, donc le coût, change sans rien d'autre (la
      // masse est construite par KtaMasseSol.masse, qui lit les rampes : aucune copie dans le pathfinder).
      const w = bacM({ roads: [droite], zones: [masse(0.75, { rampes: [{ bord: 3 }] })] });
      const r = await route(w);
      t("masse ¾ avec une rampe : coût entre 200 et 280 px (vide plus grand au pied de la pente), distance 200 px",
        !r.erreur && r.cout > 200 + 1e-6 && r.cout < 280 - 1e-6 && proche(r.totalDistance, 200, 1e-9),
        r.erreur || [r.cout, r.totalDistance]);
    }
    {
      // Cache des masses (par contour) : une part changée sur le même objet est relue au calcul suivant.
      const z = masse(0.5);
      const w = bacM({ roads: [droite], zones: [z] });
      const r1 = await route(w);
      z.comble = 0.75;
      const r2 = await route(w);
      t("cache des masses : part ½ → ¾ sur le même objet, coût 220 puis 280 px", !r1.erreur && !r2.erreur &&
        proche(r1.cout, 220) && proche(r2.cout, 280), [r1.cout, r2.cout]);
    }
    {
      const w = bacM({ roads: [droite], zones: [masse(0.8)] });
      const r = await route(w);
      t("masse 0,8 (vide 0,4 m < 0,5) : passage coupé, aucun chemin (NO_PATH)", r.erreur === "NO_PATH",
        r.erreur || r.cout);
      const r2 = await route(w, { respecterInaccessibles: false });
      t("masse coupée : la case « Respecter… » ne la lève pas", r2.erreur === "NO_PATH", r2.erreur || r2.cout);
      const w2 = bacM({ roads: [droite, detour], zones: [masse(0.8)] });
      const r3 = await route(w2);
      t("masse coupée + détour : le détour est pris (400 px)", !r3.erreur && proche(r3.totalDistance, 400),
        r3.erreur || r3.totalDistance);
    }
    {
      // Détour de 260 px (65 m) : plus court en coût que ¾ (280 px), plus long que ½ (220 px).
      const court = R("rd_court", "principal", [[0, 0], [0, 30], [200, 30], [200, 0]]);
      let w = bacM({ roads: [droite, court], zones: [masse(0.75)] });
      let r = await route(w);
      t("masse ¾ (coût 280 px) + détour de 260 px : le détour l'emporte", !r.erreur && proche(r.totalDistance, 260) &&
        proche(r.cout, 260), r.erreur || [r.totalDistance, r.cout]);
      w = bacM({ roads: [droite, court], zones: [masse(0.5)] });
      r = await route(w);
      t("masse ½ (coût 220 px) + détour de 260 px : la droite reste prise", !r.erreur &&
        proche(r.totalDistance, 200) && proche(r.cout, 220), r.erreur || [r.totalDistance, r.cout]);
    }
    {
      // Brancard : ¼ laisse 1,5 m (< 1,8) → évité d'office ; 0,1 laisse 1,8 m → passe normalement.
      let w = bacM({ roads: [droite, detour], zones: [masse(0.25)] });
      let r = await route(w, { brancard: true });
      t("brancard : masse ¼ (vide 1,5 m) évitée, détour pris (400 px)", !r.erreur && proche(r.totalDistance, 400),
        r.erreur || r.totalDistance);
      r = await route(w);
      t("sans brancard : la même masse ¼ est traversée (coût 220 < 400)", !r.erreur && proche(r.totalDistance, 200));
      w = bacM({ roads: [droite, detour], zones: [masse(0.1)] });
      r = await route(w, { brancard: true });
      t("brancard : masse 0,1 (vide 1,8 m) passe normalement (200 px, coût = distance)", !r.erreur &&
        proche(r.totalDistance, 200) && proche(r.cout, 200), r.erreur || [r.totalDistance, r.cout]);
      w = bacM({ roads: [droite], zones: [masse(0.25)] });
      r = await route(w, { brancard: true });
      t("brancard : seul chemin par une masse ¼ → l'itinéraire passe (jamais bloquant)", !r.erreur &&
        proche(r.totalDistance, 200), r.erreur);
      w = bacM({ roads: [droite], zones: [masse(0.8)] });
      r = await route(w, { brancard: true });
      t("brancard : sous 0,5 m de vide, coupé pour tous", r.erreur === "NO_PATH", r.erreur);
    }
    {
      // Sortie d'urgence réelle (DOM simulé) : la sortie en B, contraintes brancard transmises au moteur.
      const lancer = async function (contraintes) {
        const w = bacM({ roads: [droite, detour], zones: [masse(0.25)] });
        w.getEditorPoints = () => [{ nom: "SortieB", x: 200, y: 0, tags: ["peo"] }];
        const vus = [];
        const orig = w.Pathfinder.computeRoute;
        w.Pathfinder.computeRoute = function (wps, o) {
          return orig(wps, o).then(function (r) { vus.push({ o: o, r: r }); return r; });
        };
        const corps = { innerHTML: "" };
        const modal = { id: "", className: "", innerHTML: "", parentNode: null, addEventListener() {},
          querySelector: () => corps };
        w.document = { createElement: () => modal, getElementById: () => ({ addEventListener() {} }),
          documentElement: { appendChild(el) { el.parentNode = { removeChild() {} }; } },
          addEventListener() {}, removeEventListener() {} };
        w.requestAnimationFrame = f => f();
        w.setTimeout = setTimeout;
        w.itineraireYAller = () => {};
        vm.runInContext("var window = this;" + lire("js/sortieUrgence.js"), w.__ctx);
        w.SortieUrgence.declencherDepuis(0, 0, undefined, { contraintes: contraintes });
        for (let i = 0; i < 200 && !vus.length; i++) await new Promise(res => setTimeout(res, 5));
        return vus[0] || null;
      };
      let v = await lancer({ avoidZones: [], respecterInaccessibles: true, brancard: true });
      t("sortie d'urgence (évacuation brancard) : `brancard` transmis, masse ¼ évitée (400 px)",
        !!v && v.o.brancard === true && proche(v.r.totalDistance, 400), v && [v.o.brancard, v.r.totalDistance]);
      v = await lancer(null);
      t("sortie d'urgence ordinaire : masse ¼ traversée, coût 220 px, distance 200 px",
        !!v && v.o.brancard === false && proche(v.r.totalDistance, 200) && proche(v.r.cout, 220),
        v && [v.o.brancard, v.r.totalDistance, v.r.cout]);
    }
    {
      // ⚠️ Sorties classées au TEMPS (décision produit) : B à 200 px derrière une masse ¾ (à plat ventre sur 10 m :
      // temps 280 px), C à 240 px debout → C d'abord, malgré la distance. Rendu réel de la fenêtre (ordre des noms).
      const w = bacM({ roads: [droite, R("rd_versC", "principal", [[0, 0], [0, 240]])], zones: [masse(0.75)] });
      w.getEditorPoints = () => [{ nom: "SortieB", x: 200, y: 0, tags: ["peo"] },
        { nom: "SortieC", x: 0, y: 240, tags: ["peo"] }];
      const corps = { innerHTML: "" };
      const modal = { id: "", className: "", innerHTML: "", parentNode: null, addEventListener() {},
        querySelector: () => corps };
      w.document = { createElement: () => modal, getElementById: () => ({ addEventListener() {} }),
        documentElement: { appendChild(el) { el.parentNode = { removeChild() {} }; } },
        addEventListener() {}, removeEventListener() {} };
      w.requestAnimationFrame = f => f();
      w.setTimeout = setTimeout;
      w.itineraireYAller = () => {};
      vm.runInContext("var window = this;" + lire("js/sortieUrgence.js"), w.__ctx);
      w.SortieUrgence.declencherDepuis(0, 0, undefined, {});
      for (let i = 0; i < 300 && !/SortieB/.test(corps.innerHTML); i++) await new Promise(res => setTimeout(res, 5));
      const h = corps.innerHTML, iB = h.indexOf("SortieB"), iC = h.indexOf("SortieC");
      t("sortie d'urgence au temps : C (240 px debout) avant B (200 px, à plat ventre sur 10 m)",
        iB >= 0 && iC >= 0 && iC < iB, [iB, iC]);
      const res = w.Pathfinder.resumeMasseTrajet([P(0, 0), P(200, 0)]);
      t("resumeMasseTrajet : masse ¾ → 40 px à plat ventre, 0 courbé, ralentissement 80 px",
        proche(res.ramperPx, 40, 1e-6) && proche(res.courbePx, 0) && proche(res.extraPx, 80, 1e-6), res);
      const w2 = bacM({ roads: [droite], zones: [masse(0.25)] });
      const res2 = w2.Pathfinder.resumeMasseTrajet([P(0, 0), P(200, 0)]);
      t("resumeMasseTrajet : masse ¼ → 40 px courbé, ralentissement 20 px",
        proche(res2.courbePx, 40, 1e-6) && proche(res2.ramperPx, 0) && proche(res2.extraPx, 20, 1e-6), res2);
    }
    {
      const w = bacM({ roads: [droite], zones: [masse(-0.5)] });
      const r = await route(w);
      t("sol abaissé −½ : ×1, coût = distance (200 px)", !r.erreur && proche(r.cout, 200) &&
        proche(r.totalDistance, 200), r.erreur || r.cout);
    }
    {
      // Pleine hauteur sans rampe (révision du 15/11/2026, plus de talus automatique) : masse ¾ de 10 m de large (x 80-120)
      // et 100 m de long, traversée au milieu : vide = ¼ × 2 m = 0,5 m partout, à plat ventre sur les 10 m (×3) → +80 px,
      // comme la masse ¾ entière (aucune pente aux bords).
      const long = R("zn_long", "masse-sol", [[80, -200], [120, -200], [120, 200], [80, 200]], { comble: 0.75 });
      const w = bacM({ roads: [droite], zones: [long] }, null, true);
      const r = await route(w);
      t("masse ¾ sans rampe : pleine hauteur partout (vide ¼ H), +80 px, aucune pente aux bords", !r.erreur &&
        Math.abs(r.cout - 200 - 80) < 1.2 && proche(r.totalDistance, 200), r.erreur || r.cout - 200);
    }
    {
      const w = bacM({});
      const r = w.Pathfinder.computeRouteOnRoads([A, B], [droite], { allowedTypes: ["principal"],
        zones: [masse(0.75)], echelle: ECHELLE });
      t("inter-plans (réseau fourni) : masse ¾ → coût 280 px, distance 200 px", proche(r.cout, 280) &&
        proche(r.totalDistance, 200), [r.cout, r.totalDistance]);
      let ko3 = null;
      try {
        w.Pathfinder.computeRouteOnRoads([A, B], [droite], { allowedTypes: ["principal"], zones: [masse(0.8)],
          echelle: ECHELLE });
      } catch (e) { ko3 = e.code; }
      t("inter-plans : masse coupée → aucun chemin", ko3 === "NO_PATH", ko3);
    }
    {
      const w = bacM({ zones: [masse(0.75)] });
      const cum = w.Pathfinder.surcoutMasseTrajet([P(0, 0), P(100, 0), P(200, 0)]);
      t("guidage : ralentissement cumulé ¾ = 0 / 40 / 80 px (le temps compte 20 m de plus)",
        cum.length === 3 && proche(cum[0], 0) && proche(cum[1], 40) && proche(cum[2], 80), cum);
    }
    {
      // Zones à coût et inaccessible inchangées en présence d'une masse ailleurs (x 20-40, hors de la zone).
      const loin = R("zn_ms_loin", "masse-sol", [[20, 40], [40, 40], [40, 60], [20, 60]], { comble: 0.75 });
      for (const type of ["remblais", "effondrement"]) {
        let w = bacM({ roads: [droite], zones: [zone(type), loin] });
        let r = await route(w);
        t(type + " avec une masse ailleurs : coût inchangé (200 + 40 × 1e6), traversée dite", !r.erreur &&
          proche(r.cout, 200 + 40e6, 1e-3) && r.zonesTraversees.length === 1, r.erreur || r.cout);
        w = bacM({ roads: [droite, detour], zones: [zone(type), loin] });
        r = await route(w);
        t(type + " avec une masse ailleurs : toujours évité (400 px)", !r.erreur && proche(r.totalDistance, 400));
      }
      const w = bacM({ roads: [droite4], zones: [zone("inaccessible"), loin] });
      const r = await route(w);
      t("inaccessible avec une masse ailleurs : toujours dure (NO_PATH)", r.erreur === "NO_PATH", r.erreur);
      const w2 = bacM({ roads: [droite, detour], zones: [zone("eau")] });
      const r2 = await route(w2);
      t("sans masse : coût = distance au bit près", !r2.erreur && r2.cout === r2.totalDistance);
    }
  }

  console.log(ko ? "\n❌ check-zones-cout : " + ko + " échec(s)" : "\n✅ check-zones-cout : zones à coût conformes");
  process.exit(ko ? 1 : 0);
})();
