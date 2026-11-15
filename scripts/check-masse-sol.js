#!/usr/bin/env node
/*
 * MyKTAMap — check-masse-sol.js
 * Filet de la zone « Masse au sol » (`masse-sol`, remblai partiel) et de sa part comblée (`comble`, 0-1, absente = ½).
 *
 * ⚠️ Contrat (docs/ETUDE_REMBLAIS.md, décisions du 11/11/2026) : style du canon (sable, grains dont le nombre suit la
 * part, contour tireté court), valeur par crans ¼ ½ ¾ ou libre, ≥ 1 = un Comblé (`remblais`) ; champ gardé par
 * chaque copie et à l'aller-retour KMZ (`mkm:comble`, style `#zone_masse-sol`), GeoJSON (propriété `comble`) et import
 * SIG (synonymes ms / masse au sol / remblai partiel, colonne de hauteur facultative) ; DÉFAUT d'un polygone SIG non
 * reconnu = masse au sol (un Comblé posé en silence deviendrait un obstacle), compté pour l'écran de correspondance.
 *
 * CHARGE les vrais modules dans un bac à sable, sur des objets FICTIFS (aucune donnée de data/ ici). La relecture
 * d'un KMZ (DOMParser), la fiche, le Tableur et la légende se jouent dans scripts/smoke/checkup-masse-sol.js.
 *
 * Usage : node scripts/check-masse-sol.js   (exit 1 si un contrôle échoue)
 */
"use strict";

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const lire = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const KTA_ESC = (function () {
  const m = lire("js/langManager.js").match(/window\.ktaEsc = (function\(s\) \{[\s\S]*?\n\};)/);
  if (!m) throw new Error("window.ktaEsc introuvable dans js/langManager.js");
  return vm.runInNewContext("(" + m[1].replace(/;$/, "") + ")");
})();

let ko = 0;
const t = (n, c, d) => { console.log((c ? "✅" : "❌") + " " + n + (!c && d !== undefined ? " " + JSON.stringify(d) : "")); if (!c) ko++; };
const J = JSON.stringify;
const carre = (cx, cy, r) => [{ x: cx - r, y: cy - r }, { x: cx + r, y: cy - r }, { x: cx + r, y: cy + r }, { x: cx - r, y: cy + r }];

function contexte(cfg) {
  const win = {
    console: { log() {}, warn() {}, error() {} },
    APP_CONFIG: Object.assign({ multiLevel: false, imageHeight: 1000, scale: 4, visibleLevels: [0] }, cfg || {}),
    I18n: { t: (k, p) => k + (p ? J(p) : ""), has: () => false },
    formatDistance: (m) => (Math.round(m * 10) / 10) + " m",
    ktaLocale: () => "fr-FR",
    ktaEsc: KTA_ESC,
    ktaRetirerCalque: function (l) { if (l) l.remove(); },
    Blob, Uint8Array, ArrayBuffer, DataView, Math, JSON, Promise, Error, Date, Set, Map,
    isFinite, Number, Array, String, Object, RegExp
  };
  win.window = win; win.globalThis = win;
  vm.createContext(win);
  return win;
}
function charger(win, fichiers) {
  fichiers.forEach(function (f) { vm.runInContext(lire(f), win, { filename: f }); });
}

(async function main() {
  // ── 1. Canon : type, part comblée par défaut, texte des crans, empilement ──
  {
    const w = contexte();
    charger(w, ["js/styleResolver.js"]);
    t("type built-in : ktaStyleBuiltins(zones) contient masse-sol", w.ktaStyleBuiltins("zones").indexOf("masse-sol") >= 0);
    const C = w.ktaCombleZone;
    t("part comblée : absente, nulle ou illisible = ½, nombre gardé, ≥ 1 gardé (la fiche propose Comblé)",
      C({}) === 0.5 && C({ comble: 0.75 }) === 0.75 && C({ comble: "x" }) === 0.5 && C({ comble: 0 }) === 0.5 &&
      C({ comble: 1.2 }) === 1.2 && C(null) === 0.5);
    t("sol abaissé : part négative gardée (−½), bornée à −1 (−2 → −1)",
      C({ comble: -0.5 }) === -0.5 && C({ comble: -1 }) === -1 && C({ comble: -2 }) === -1);
    const V = w.ktaCombleValide;
    t("saisie et import : [−1 ; 1[ sauf 0 (ktaCombleValide)", V(-1) && V(-0.25) && V(0.9) && !V(0) && !V(1) &&
      !V(-1.01) && !V(NaN) && !V("0,5"));
    const T = w.ktaTexteComble;
    t("texte : crans ¼ ½ ¾, valeur libre en décimale locale (0,9)",
      T(0.25) === "¼" && T(0.5) === "½" && T(0.75) === "¾" && T(0.9) === "0,9" && T(-0.25) === "−¼" &&
      T(-0.5) === "−½" && T(-0.75) === "−¾" && T(-0.9) === "-0,9");
    w.getNiveauVertical = (n) => ({ hauteurM: n === -1 ? 10 : 2 });
    const M = w.ktaMetresComble;
    t("mètres : d'après la hauteur du niveau de la zone (½ de 10 m = 5 m ; ¾ de 2 m = 1,5 m)",
      M({ level: -1 }, 0.5).m === 5 && M({ level: -1 }, 0.5).h === 10 && M({}, 0.75).m === 1.5 &&
      M({}, -0.5).m === -1);
    const O = w.KTA_ORDRE_ZONES;
    t("empilement : eau < masse au sol < remblais (Comblé) < effondrement < inaccessible",
      O.eau < O["masse-sol"] && O["masse-sol"] < O.remblais && O.remblais < O.effondrement &&
      O.effondrement < O.inaccessible);
    t("aplat (exports, KMZ, OSM) : sable à 50 %, contour brun",
      J(w.ktaResolveStyle("zones", "masse-sol", { flat: true })).indexOf('"fillColor":"#c9b48c"') >= 0);
  }

  // ── 2. Carte : la zone passe sa part comblée au canon (densité des grains) ──
  {
    const w = contexte();
    const recus = [];
    const couche = function () { return { addTo() { return this; }, remove() {}, bindPopup() {}, on() {} }; };
    w.L = { polygon: couche, polyline: couche, circleMarker: couche };
    w.map = { on() {} };
    w.convertCoord = (x, y) => [1000 - y, x];
    w._aucunModeEditionActif = () => true;
    charger(w, ["js/styleResolver.js"]);
    const vrai = w.ktaResolveStyle;
    w.ktaResolveStyle = function (cat, cle, opts) { recus.push({ cle: cle, opts: opts }); return vrai(cat, cle, opts); };
    charger(w, ["js/zones.js"]);
    w.setZones([{ type: "masse-sol", comble: 0.75, points: carre(100, 100, 20) },
      { type: "masse-sol", points: carre(300, 100, 20) }]);
    const ms = recus.filter(r => r.cle === "masse-sol");
    t("rendu : chaque masse au sol demande son style avec sa part (¾, puis ½ par défaut)",
      ms.length >= 2 && ms.some(r => r.opts && r.opts.comble === 0.75) && ms.some(r => r.opts && r.opts.comble === 0.5));
  }

  // ── 3. Fiche et Tableur (convertirObjet.js) ──
  {
    const w = contexte();
    let zones = [{ uid: "zn_m", type: "masse-sol", level: 0, points: carre(1, 1, 1) },
      { uid: "zn_e", type: "eau", level: 0, points: carre(5, 5, 1) }];
    const notes = [];
    w.getZones = () => zones; w.setZones = (l) => { zones = l; };
    w.getRoads = () => []; w.setRoads = () => {};
    w.getStructures = () => []; w.setStructures = () => {};
    w.HistoryManager = { captureState: () => ({}), record: (lbl) => notes.push(lbl) };
    w.KtaUid = { touch: (o) => { o.updatedAt = 1; }, getTombstones: () => [], getTracesCopie: () => [] };
    w.ktaTexteComble = (v) => String(v);
    charger(w, ["js/styleResolver.js", "js/poiJonction.js", "js/convertirObjet.js"]);
    const C = w.KtaConvertir;
    t("fiche : ¾ appliqué en place (même objet, horodaté), une entrée d'historique",
      C.changerComble(zones[0], 0.75) === true && zones[0].comble === 0.75 && zones[0].updatedAt === 1 &&
      notes.length === 1);
    t("fiche : même valeur = rien à annuler (pas d'entrée)", C.changerComble(zones[0], 0.75) === false && notes.length === 1);
    t("fiche : ≥ 1 refusé ici (la fiche propose d'abord Comblé), 0, sous −1 et texte refusés",
      C.changerComble(zones[0], 1) === false && C.changerComble(zones[0], 0) === false &&
      C.changerComble(zones[0], -1.5) === false && C.changerComble(zones[0], "x") === false &&
      zones[0].comble === 0.75);
    t("fiche : sol abaissé −½ appliqué (une entrée), puis ¾ remis",
      C.changerComble(zones[0], -0.5) === true && zones[0].comble === -0.5 && notes.length === 2 &&
      C.changerComble(zones[0], 0.75) === true && zones[0].comble === 0.75);
    t("fiche : refusé sur une zone qui n'est pas une masse au sol", C.changerComble(zones[1], 0.5) === false);
    t("changement de type : passer en Comblé (remblais) retire la part comblée",
      C.convertir("zones", zones[0], "zones", "remblais") === true &&
      zones.some(z => z.uid === "zn_m" && z.type === "remblais" && !("comble" in z)));
    // Tableur : seule une part lisible dans [−1 ; 1[ sauf 0 passe ; la première ligne fautive arrête tout.
    zones = [{ uid: "zn_t", type: "masse-sol", level: 0, points: carre(1, 1, 1) }];
    const orig = JSON.parse(J(zones));
    const ligne = (c) => [Object.assign({}, orig[0], { comble: c })];
    const appliquer = (l) => C.appliquerTableau("zones", l, { origines: new Map([[l[0], orig[0]]]) });
    const r1 = appliquer(ligne(1.5));
    t("Tableur : 1,5 refusé (code comble), rien d'écrit", r1 && r1.erreur && r1.erreur.code === "comble" && !("comble" in zones[0]));
    const rb = appliquer(ligne(-1.5));
    t("Tableur : −1,5 refusé (code comble)", rb && rb.erreur && rb.erreur.code === "comble");
    const r0 = appliquer(ligne(0));
    t("Tableur : 0 refusé (code comble)", r0 && r0.erreur && r0.erreur.code === "comble");
    const rn = appliquer(ligne(-0.25));
    t("Tableur : −0,25 (sol abaissé) accepté", rn && !rn.erreur && zones[0].comble === -0.25, rn);
  }

  // ── 4. KMZ et GeoJSON ──
  {
    const w = contexte();
    charger(w, ["js/poiJonction.js", "js/styleResolver.js", "js/kmzExport.js", "js/geojsonExport.js"]);
    const KE = w.KmzExport, GJ = w.GeojsonExport;
    const tr = KE.buildTransformCalib({
      pointA: { x: 300, y: 2700, lat: 46.5, lng: 3.0 },
      pointB: { x: 3600, y: 400, lat: 46.50845, lng: 3.02631 },
      pointC: { x: 3500, y: 2800, lat: 46.49840, lng: 3.02560 }
    });
    w.APP_CONFIG.imageHeight = 3000;
    const data = { editorPoints: [], roads: [], structures: [], zones: [
      { type: "masse-sol", comble: 0.75, points: carre(1000, 1000, 50), description: "MasseTroisQuarts" },
      { type: "masse-sol", points: carre(1500, 1000, 50), description: "MasseSansValeur" },
      { type: "masse-sol", comble: -0.5, points: carre(2000, 1000, 50), description: "MasseCreuse" }
    ] };
    const inc = { points: false, roads: false, zones: true, structures: false, jonctions: false, itineraire: false };
    const kml = KE.genererKml({ transform: tr, planName: "Test", include: inc, levels: null, data: data });
    t("KMZ : style #zone_masse-sol déclaré et utilisé",
      kml.indexOf('<Style id="zone_masse-sol">') >= 0 && kml.indexOf("<styleUrl>#zone_masse-sol</styleUrl>") >= 0);
    const pm = kml.split("<Placemark>").slice(1);
    const pmDe = (txt) => pm.find(p => p.indexOf(txt) >= 0) || "";
    t("KMZ : mkm:comble 0.75 sur la zone ¾, absent sur la zone sans valeur (relue à ½)",
      pmDe("MasseTroisQuarts").indexOf('mkm:comble"><value>0.75<') >= 0 && pmDe("MasseSansValeur").indexOf("mkm:comble") < 0);
    t("KMZ : sol abaissé écrit signé (mkm:comble -0.5)", pmDe("MasseCreuse").indexOf('mkm:comble"><value>-0.5<') >= 0);
    const ki = lire("js/kmzImport.js");
    t("KMZ relu : #zone_masse-sol reconnu, mkm:comble reposé sur la zone (masse au sol seulement)",
      /#zone_\(eau\|masse-sol\|remblais/.test(ki) && /name === "mkm:comble"/.test(ki) &&
      /zoneType === "masse-sol" && _mkmData\.comble !== null\) _zn\.comble = _mkmData\.comble/.test(ki) &&
      /Number\.isFinite\(c\) && c !== 0 && c >= -1\) out\.comble = c/.test(ki));
    const fc = GJ.generer({ transform: tr, epsg: 4326, planName: "Test", include: inc, levels: null, data: data });
    const f = fc.features.filter(x => x.properties.type === "masse-sol");
    t("GeoJSON : propriété comble (¾, ½ pour la zone sans valeur, −½ signée)",
      f.length === 3 && f.some(x => x.properties.comble === 0.75) && f.some(x => x.properties.comble === 0.5) &&
      f.some(x => x.properties.comble === -0.5));
  }

  // ── 5. Import SIG (sigImport.js) ──
  {
    const w = contexte();
    w.KmzExport = { gpsToPlan: (t2, lat, lng) => ({ x: lng * 1000, y: lat * 1000 }) };
    charger(w, ["js/sigImport.js"]);
    const S = w.SigImport;
    const pm = S.proposerMapping(["ms", "Masse au sol", "remblai partiel", "masse au ciel", "MC", "comble",
      "remblai", "Remblais", "truc"], "zones");
    t("synonymes : ms / masse au sol / remblai partiel → masse-sol",
      pm.ms === "masse-sol" && pm["Masse au sol"] === "masse-sol" && pm["remblai partiel"] === "masse-sol");
    t("synonymes : masse au ciel / mc / comble → Comblé (remblais) ; remblai(s) seul reste Comblé ; inconnu = défaut",
      pm["masse au ciel"] === "remblais" && pm.MC === "remblais" && pm.comble === "remblais" &&
      pm.remblai === "remblais" && pm.Remblais === "remblais" && pm.truc === null);
    const c = (v) => S.combleDe({ h: v }, "h");
    t("colonne de hauteur : 0,5 / 0.75 = part, 50 % ou 90 = pourcentage",
      c("0,5") === 0.5 && c(0.75) === 0.75 && c("50 %") === 0.5 && c(90) === 0.9);
    t("colonne de hauteur : vide, texte, 0, ≥ 1 (100 %) → rien (½ par défaut)",
      c("") === null && c("abc") === null && c(0) === null && c("100%") === null && c(1) === null &&
      c("-150 %") === null &&
      S.combleDe({}, "h") === null && S.combleDe({ h: 0.5 }, null) === null);
    t("colonne de hauteur : sol abaissé « -0,5 », « -50 % », « −0,25 », -1 (aller-retour GeoJSON → SIG)",
      c("-0,5") === -0.5 && c("-50 %") === -0.5 && c("−0,25") === -0.25 && c(-1) === -1 && c(-0.5) === -0.5);
    const poly = (type, h) => ({ props: { type: type, h: h, niv: "-1" },
      coords: [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }, { lat: 2, lng: 1 }] });
    const normalise = { points: [], lignes: [], polygones: [poly("ms", "0,25"), poly("truc", "0,5"), poly("", "x"),
      poly("mc", "0,9")] };
    const map = S.proposerMapping(["ms", "truc", "mc"], "zones");
    const r = S.ingest(normalise, {}, { cleType: "type", mapZones: map, cleComble: "h" });
    const ty = r.zones.map(z => z.type);
    t("défaut d'un polygone non reconnu (valeur inconnue ou vide) = masse-sol, jamais Comblé",
      J(ty) === J(["masse-sol", "masse-sol", "masse-sol", "remblais"]));
    t("part comblée lue sur les masses au sol (¼, ½), illisible = absente, jamais posée sur un Comblé",
      r.zones[0].comble === 0.25 && r.zones[1].comble === 0.5 && !("comble" in r.zones[2]) && !("comble" in r.zones[3]));
    t("compte du défaut : 2 polygones sans type reconnu (stats.zonesDefaut)", r.stats.zonesDefaut === 2);
    t("écran de correspondance : même compte (compterPolygonesDefaut)", S.compterPolygonesDefaut(normalise, "type") === 2 &&
      S.compterPolygonesDefaut(normalise, null) === 4);
    const rN = S.ingest(normalise, {}, { cleType: "type", mapZones: map, cleNiveau: "niv", couleurParNiveau: true });
    t("couleur par niveau : la masse au sol garde SA clé (sa part se lit par masse-sol), le Comblé prend un type de niveau",
      rN.zones[0].type === "masse-sol" && /^cust-/.test(rN.zones[3].type));
  }

  // ── 5 bis. Rampes : règle partagée (masseSol.js), fiche (poser / retirer), type changé, KMZ, GeoJSON, SIG ──
  {
    const w = contexte();
    let zones = [{ uid: "zn_r", type: "masse-sol", level: 0, comble: 0.5,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }] }];
    const notes = [];
    w.getZones = () => zones; w.setZones = (l) => { zones = l; };
    w.getRoads = () => []; w.setRoads = () => {};
    w.getStructures = () => []; w.setStructures = () => {};
    w.HistoryManager = { captureState: () => ({}), record: (lbl) => notes.push(lbl) };
    w.KtaUid = { touch: (o) => { o.updatedAt = (o.updatedAt || 0) + 1; }, getTombstones: () => [],
      getTracesCopie: () => [] };
    charger(w, ["js/styleResolver.js", "js/poiJonction.js", "js/masseSol.js", "js/convertirObjet.js"]);
    const M = w.KtaMasseSol, C = w.KtaConvertir;
    // Rampes ouest (bord 3) et est (bord 1), échelle 10 px / m : 10 × 6 m, hauteur 1,2 m.
    t("règle : bords bas valides seulement (entiers, dans le contour, une fois)",
      J(M.rampesValides({ points: zones[0].points, rampes: [{ bord: 3 }, { bord: 1 }, { bord: 1 }, { bord: 9 },
        { bord: "2" }, null] })) === "[1,3]");
    const m = M.masse({ points: zones[0].points, rampes: [{ bord: 3 }, { bord: 1 }] }, 10, 1.2, () => false);
    const sol = (x) => +M.sol(m, x, 3).toFixed(3);
    t("règle : minimum des profils (0 aux bords bas, 0,6 au milieu), plafonné au cran", sol(0) === 0 && sol(10) === 0 &&
      sol(5) === 0.6 && sol(2.5) === 0.3 && M.atteinte(m) > 0.59 && M.atteinte(m) <= 0.6);
    const m1 = M.masse({ points: zones[0].points, rampes: [{ bord: 3 }] }, 10, -1.2, () => false);
    t("règle : une rampe seule monte (descend en négatif) de 0 au cran à l'extrémité opposée",
      M.sol(m1, 0, 3) === 0 && +M.sol(m1, 10, 3).toFixed(3) === -1.2 && +M.sol(m1, 5, 3).toFixed(3) === -0.6);
    const mt = M.masse({ points: zones[0].points }, 10, 1.2, () => false);
    t("règle : sans rampe, pleine hauteur partout (plus de talus automatique), atteinte = cran",
      M.sol(mt, 0.1, 3) === 1.2 && M.sol(mt, 5, 3) === 1.2 && M.atteinte(mt) === 1.2);
    const mf = M.masse({ points: zones[0].points, rampes: [{ bord: 3, fin: { x: 30, y: 30 } }] }, 10, 1.2);
    t("règle : rampe avec fin à 3 m → pente jusqu'à la fin (0,6 à 1,5 m), plat au cran au-delà",
      +M.sol(mf, 1.5, 3).toFixed(3) === 0.6 && +M.sol(mf, 3, 3).toFixed(3) === 1.2 && M.sol(mf, 8, 3) === 1.2);
    const mf2 = M.masse({ points: zones[0].points, rampes: [{ bord: 3, fin: { x: 20, y: 30 } }, { bord: 1, fin: { x: 80, y: 30 } }] },
      10, 1.2);
    t("règle : deux rampes à fin (2 m chacune) → plateau au cran entre les deux, minimum des profils",
      +M.sol(mf2, 1, 3).toFixed(3) === 0.6 && M.sol(mf2, 5, 3) === 1.2 && +M.sol(mf2, 9, 3).toFixed(3) === 0.6);
    t("chevrons : rampe à fin = chevrons sur la longueur de pente + un trait de fin",
      M.chevrons({ points: zones[0].points, rampes: [{ bord: 3, fin: { x: 30, y: 30 } }] }, 10).some(function (p) {
        return p.length >= 2 && p.every(function (q) { return Math.abs(q.x - 30) < 1e-6; });
      }));
    t("chevrons : un jeu par rampe, pointés vers le haut, dans le contour",
      M.chevrons({ points: zones[0].points, rampes: [{ bord: 3 }] }, 10).length > 0 &&
      M.chevrons({ points: zones[0].points, rampes: [{ bord: 3 }, { bord: 1 }] }, 10).length ===
        2 * M.chevrons({ points: zones[0].points, rampes: [{ bord: 3 }] }, 10).length);
    t("fiche : poser l'ouest puis l'est (deux entrées ⏪, horodaté), le même bord refusé",
      C.ajouterRampe(zones[0], 3) && C.ajouterRampe(zones[0], 1) && !C.ajouterRampe(zones[0], 1) &&
      J(zones[0].rampes) === J([{ bord: 1 }, { bord: 3 }]) && notes.length === 2 && zones[0].updatedAt === 2);
    t("fiche : bord hors du contour ou zone qui n'est pas une masse au sol refusés",
      !C.ajouterRampe(zones[0], 7) && !C.ajouterRampe({ type: "eau", points: zones[0].points }, 0));
    t("fiche : retirer l'est, puis l'ouest → champ retiré (pleine hauteur)",
      C.retirerRampe(zones[0], 1) && J(zones[0].rampes) === J([{ bord: 3 }]) && C.retirerRampe(zones[0], 3) &&
      !("rampes" in zones[0]) && !C.retirerRampe(zones[0], 3));
    C.ajouterRampe(zones[0], 3);
    t("fiche : fin posée à la pose, déplacée, retirée (une entrée ⏪ chacune), les autres fins gardées",
      C.ajouterRampe(zones[0], 1, { x: 70, y: 30 }) && J(zones[0].rampes[0]) === J({ bord: 1, fin: { x: 70, y: 30 } }) &&
      C.changerFinRampe(zones[0], 1, { x: 60, y: 30 }) && zones[0].rampes[0].fin.x === 60 &&
      C.ajouterRampe(zones[0], 0) && zones[0].rampes.filter(function (r) { return r.bord === 1; })[0].fin &&
      C.changerFinRampe(zones[0], 1, null) &&
      !zones[0].rampes.some(function (r) { return r.fin; }) && !C.changerFinRampe(zones[0], 2, { x: 1, y: 1 }));
    C.retirerRampe(zones[0], 0);
    C.retirerRampe(zones[0], 1);
    t("changement de type : passer en Comblé retire les rampes",
      C.convertir("zones", zones[0], "zones", "remblais") === true &&
      zones.some(z => z.uid === "zn_r" && z.type === "remblais" && !("rampes" in z)));
  }
  {
    const w = contexte();
    charger(w, ["js/poiJonction.js", "js/styleResolver.js", "js/masseSol.js", "js/kmzExport.js",
      "js/geojsonExport.js"]);
    const KE = w.KmzExport, GJ = w.GeojsonExport;
    const tr = KE.buildTransformCalib({
      pointA: { x: 300, y: 2700, lat: 46.5, lng: 3.0 },
      pointB: { x: 3600, y: 400, lat: 46.50845, lng: 3.02631 },
      pointC: { x: 3500, y: 2800, lat: 46.49840, lng: 3.02560 }
    });
    w.APP_CONFIG.imageHeight = 3000;
    const data = { editorPoints: [], roads: [], structures: [], zones: [
      { type: "masse-sol", comble: 0.5, rampes: [{ bord: 3 }, { bord: 1 }], points: carre(1000, 1000, 50),
        description: "MasseRampes" },
      { type: "masse-sol", comble: 0.5, rampes: [{ bord: 0, fin: { x: 1000, y: 1020 } }], points: carre(2000, 1000, 50),
        description: "MasseFin" },
      { type: "masse-sol", points: carre(1500, 1000, 50), description: "MasseSansRampe" }
    ] };
    const inc = { points: false, roads: false, zones: true, structures: false, jonctions: false, itineraire: false };
    const kml = KE.genererKml({ transform: tr, planName: "Test", include: inc, levels: null, data: data });
    const pm = kml.split("<Placemark>").slice(1), pmDe = (txt) => pm.find(p => p.indexOf(txt) >= 0) || "";
    t("KMZ : mkm:rampes « 1,3 » sur la zone à rampes, absent sur l'autre",
      pmDe("MasseRampes").indexOf('mkm:rampes"><value>1,3<') >= 0 && pmDe("MasseSansRampe").indexOf("mkm:rampes") < 0);
    const ki = lire("js/kmzImport.js");
    t("KMZ relu : mkm:rampes reposé sur la masse au sol, revalidé sur le contour",
      /name === "mkm:rampes"/.test(ki) && /_zn\.rampes = _mkmData\.rampes\.map/.test(ki) &&
      /window\.KtaMasseSol\.rampesValides\(_zn\)/.test(ki));
    const vf = (pmDe("MasseFin").match(/mkm:rampes"><value>([^<]*)</) || [])[1] || "";
    const mm = vf.match(/^0:(-?[\d.]+);(-?[\d.]+)$/), back = mm ? w.KmzExport.gpsToPlan(tr, Number(mm[2]), Number(mm[1])) : null;
    t("KMZ : fin écrite en WGS84 (« 0:lng;lat ») et relue au même point du plan (< 1 cm)",
      !!back && Math.abs(back.x - 1000) < 0.01 && Math.abs(back.y - 1020) < 0.01, vf);
    t("KMZ relu : « b:lng;lat » reprojeté (gpsToPixel), « b » seul gardé (rétrocompatible)",
      /finLL/.test(ki) && /gpsToPixel\(transform, r\.finLL\.lat, r\.finLL\.lng\)/.test(ki));
    const fc = GJ.generer({ transform: tr, epsg: 4326, planName: "Test", include: inc, levels: null, data: data });
    const g = fc.features.filter(x => x.properties.type === "masse-sol");
    t("GeoJSON : propriété rampes [1, 3] sur la zone à rampes, absente sur l'autre",
      g.some(x => J(x.properties.rampes) === "[1,3]") && g.some(x => !("rampes" in x.properties)));
    const gf = g.filter(x => Array.isArray(x.properties.rampes) && typeof x.properties.rampes[0] === "object")[0];
    const gb = gf ? w.KmzExport.gpsToPlan(tr, gf.properties.rampes[0].fin[1], gf.properties.rampes[0].fin[0]) : null;
    t("GeoJSON : rampe à fin = { bord, fin: [lng, lat] }, au même point du plan (< 1 cm)",
      !!gb && gf.properties.rampes[0].bord === 0 && Math.abs(gb.x - 1000) < 0.01 && Math.abs(gb.y - 1020) < 0.01, gf);
  }
  {
    const w = contexte();
    w.KmzExport = { gpsToPlan: (t2, lat, lng) => ({ x: lng * 1000, y: lat * 1000 }) };
    charger(w, ["js/sigImport.js"]);
    const S = w.SigImport;
    t("SIG : colonne rampes relue (liste ou « 1,3 »), bords hors contour et doublons écartés",
      J(S.rampesDe({ rampes: [3, 1, 1, 9] }, 4)) === J([{ bord: 1 }, { bord: 3 }]) &&
      J(S.rampesDe({ Rampes: "1,3" }, 4)) === J([{ bord: 1 }, { bord: 3 }]) && S.rampesDe({ rampes: "x" }, 4) === null &&
      S.rampesDe({}, 4) === null);
    const poly = { props: { type: "ms", rampes: [0] },
      coords: [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }, { lat: 2, lng: 1 }] };
    const r = S.ingest({ points: [], lignes: [], polygones: [poly] }, {},
      { cleType: "type", mapZones: S.proposerMapping(["ms"], "zones") });
    t("SIG : aller-retour GeoJSON → masse au sol avec sa rampe", r.zones[0].type === "masse-sol" &&
      J(r.zones[0].rampes) === J([{ bord: 0 }]));
    const g2p = (lat, lng) => ({ x: lng * 100, y: lat * 100 });
    t("SIG : { bord, fin: [lng, lat] } relu et reprojeté", J(S.rampesDe({ rampes: [{ bord: 2, fin: [1.5, 2.5] }, 0] }, 4, g2p)) ===
      J([{ bord: 0 }, { bord: 2, fin: { x: 150, y: 250 } }]));
  }

  // ── 6. Copies champ par champ et défauts du Générateur (lecture du code) ──
  {
    const u = lire("js/utils.js");
    t("zone embarquée : le registre garde `comble` (entrée _ktaDataPolygons)",
      /comble:\s+Number\.isFinite\(zone\.comble\) \? zone\.comble : undefined/.test(u));
    t("getAllEmbeddedZones recopie `comble`", /if \(Number\.isFinite\(e\.comble\)\) out\.comble = e\.comble;/.test(u));
    t("zone embarquée : registre et getAllEmbeddedZones gardent `rampes`, chevrons dessinés",
      /rampes:\s+Array\.isArray\(zone\.rampes\)/.test(u) && /out\.rampes = e\.rampes\.map/.test(u) &&
      /window\.ktaChevronsRampes\(zone, layer, style\.color\)/.test(u));
    t("zone embarquée : style avec sa part, fiche même sans note",
      /_ktaStyleMap\("zones", zone\.type, "remblais",\s*typeof window\.ktaCombleZone === "function" \? \{ comble: window\.ktaCombleZone\(zone\) \}/.test(u) &&
      /\|\| zone\.type === "masse-sol";/.test(u));
    const cc = lire("js/createConf.js");
    t("Générateur, import KMZ : masse au sol présélectionnée", /<option value="masse-sol" selected>/.test(cc) &&
      !/<option value="remblais" selected>/.test(cc));
    t("Générateur, import SIG : masse-sol en tête des polygones (1re option = type d'une valeur non reconnue)",
      /polygones: \["masse-sol", "remblais"/.test(cc));
    t("Générateur : la colonne de hauteur voyage avec le mapping (cleComble)", /cleComble: \(document\.getElementById\("kta-sig-imp-comble"\)/.test(cc));
  }

  console.log("");
  if (ko) { console.log("❌ check-masse-sol : " + ko + " échec(s)"); process.exit(1); }
  console.log("✅ check-masse-sol : masse au sol et part comblée tenues (canon, fiche, Tableur, KMZ, GeoJSON, SIG).");
})().catch(function (e) { console.log("❌ check-masse-sol : exception " + (e && e.stack || e)); process.exit(1); });
