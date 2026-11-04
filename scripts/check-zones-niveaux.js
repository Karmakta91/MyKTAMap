#!/usr/bin/env node
/*
 * MyKTAMap — check-zones-niveaux.js
 * Filet des zones reliées à plusieurs niveaux (champ `niveaux`, plan multi-niveau).
 *
 * ⚠️ Contrat : `niveaux` (entiers, triés, sans doublon) contient toujours `level` ; absent = `level` seul. Un seul
 * objet, même contour sur chacun de ses niveaux : affiché sur eux seuls, bloquant (inaccessible) sur chacun d'eux,
 * gardé à l'aller-retour session / KMZ / GeoJSON. Règle unique : poiJonction.js > ktaNiveauxObjet.
 *
 * CHARGE les vrais modules dans un bac à sable, sur des objets FICTIFS (aucune donnée de data/ ici). La relecture
 * d'un KMZ (DOMParser) et le parcours de la fiche se jouent dans scripts/smoke/checkup-zones-niveaux.js.
 *
 * Usage : node scripts/check-zones-niveaux.js   (exit 1 si un contrôle échoue)
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
    APP_CONFIG: Object.assign({ multiLevel: true, imageHeight: 1000, scale: 4, visibleLevels: [0] }, cfg || {}),
    I18n: { t: (k, p) => k + (p ? J(p) : ""), has: () => false },
    formatDistance: (m) => Math.round(m) + " m",
    getProfondeurNiveau: () => null,
    ktaEsc: KTA_ESC,
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
  // ── 1. La règle commune ──
  {
    const w = contexte();
    charger(w, ["js/poiJonction.js"]);
    const N = w.ktaNiveauxObjet;
    t("règle exposée : window.ktaNiveauxObjet est la même fonction que KtaPoiJonction.niveaux",
      typeof N === "function" && N === w.KtaPoiJonction.niveaux);
    t("`level` toujours inclus, trié, sans doublon", J(N({ level: -1, niveaux: [-2, -2] })) === "[-2,-1]");
    t("sans `niveaux` = [level] ; sans level = [0]", J(N({ level: -1 })) === "[-1]" && J(N({})) === "[0]");
    t("valeur non entière ignorée", J(N({ level: 0, niveaux: [1, "x", 1.5] })) === "[0,1]");
  }

  // ── 2. Rendu : la zone s'affiche sur ses niveaux seulement (zones.js > renderZones) ──
  {
    function rendre(zones, visibles) {
      const w = contexte({ visibleLevels: visibles });
      const poses = [];
      const couche = function (latlngs, opts) {
        return { addTo() { poses.push({ latlngs: latlngs, opts: opts }); return this; }, remove() {} };
      };
      w.L = { polygon: couche, polyline: couche, circleMarker: couche, svg: () => ({}) };
      w.map = { on() {} };
      w.convertCoord = (x, y) => [1000 - y, x];
      w.ktaResolveStyle = () => ({ color: "#000", fillColor: "#000", weight: 1, opacity: 1, fillOpacity: 0.5 });
      w._aucunModeEditionActif = () => true;
      charger(w, ["js/poiJonction.js", "js/zones.js"]);
      w.setZones(zones);
      return poses.length;
    }
    const z = () => ({ uid: "zn_a", type: "effondrement", level: -1, niveaux: [-2, -1], points: carre(200, 500, 30) });
    t("zone −1 cochée −2 : affichée quand seul le −2 est visible", rendre([z()], [-2]) === 1);
    t("zone −1 cochée −2 : affichée quand seul le −1 est visible", rendre([z()], [-1]) === 1);
    t("zone −1 cochée −2 : absente quand seul le 0 est visible", rendre([z()], [0]) === 0);
    t("un seul polygone même si ses deux niveaux sont visibles (un objet, pas une copie)", rendre([z()], [-2, -1]) === 1);
    t("zone simple (−1, sans `niveaux`) : absente au −2", rendre([{ type: "eau", level: -1, points: carre(1, 1, 1) }], [-2]) === 0);
  }

  // ── 3. Itinéraire : une inaccessible bloque sur CHACUN de ses niveaux ──
  // Galerie droite y = 500 de x = 0 à 400 (360 px du départ à l'arrivée) et détour par y = 700 ; la zone couvre
  // le milieu de la galerie droite. Mêmes galeries au −1 et au −2.
  {
    const R = (lvl, pts) => ({ type: "principal", level: lvl, points: pts.map(p => ({ x: p[0], y: p[1] })) });
    const reseau = [].concat(...[-1, -2].map(l => [
      R(l, [[0, 500], [200, 500], [400, 500]]),
      R(l, [[0, 500], [0, 700], [400, 700], [400, 500]])
    ]));
    async function longueur(zones, niveau, viaOpts) {
      const w = contexte();
      w.getRoads = () => [];
      w.getAllEmbeddedRoads = () => reseau;
      w.getEditorPoints = () => [];
      w.getAllEmbeddedPoints = () => [];
      w.getZones = () => (viaOpts ? [] : zones);
      charger(w, ["js/poiJonction.js", "js/pathfinder.js"]);
      const wp = [{ x: 20, y: 500, level: niveau }, { x: 380, y: 500, level: niveau }];
      try {
        const r = viaOpts ? w.Pathfinder.computeRouteOnRoads(wp, reseau, { zones: zones })
                          : await w.Pathfinder.computeRoute(wp, {});
        return Math.round(r.totalDistance);
      } catch (e) { return e.code || e.message; }
    }
    const zone = (extra) => [Object.assign({ type: "inaccessible", level: -1, points: carre(200, 500, 20) }, extra || {})];
    t("sans zone : chemin direct (360 px)", await longueur([], -2) === 360);
    t("zone −1 sans `niveaux` : le −2 n'est pas bloqué", await longueur(zone(), -2) === 360);
    const d2 = await longueur(zone({ niveaux: [-2, -1] }), -2);
    t("zone −1 cochée −2 : l'itinéraire au −2 la contourne par le détour (" + d2 + " px > 700)", d2 > 700);
    const d1 = await longueur(zone({ niveaux: [-2, -1] }), -1);
    t("zone −1 cochée −2 : l'itinéraire au −1 la contourne aussi (" + d1 + " px)", d1 === d2);
    const dInter = await longueur(zone({ niveaux: [-2, -1] }), -2, true);
    t("réseau d'un autre plan (computeRouteOnRoads, opts.zones) : même règle (" + dInter + " px)", dInter === d2);
    const d0 = await longueur(zone({ level: 0, niveaux: [0, 1] }), -2);
    t("zone 0 / +1 : le −2 n'est pas bloqué", d0 === 360);
  }

  // ── 4. Fiche et changements de niveau (convertirObjet.js) ──
  {
    const w = contexte();
    let zones = [{ uid: "zn_f", type: "effondrement", level: -1, points: carre(1, 1, 1) }];
    w.getZones = () => zones;
    w.setZones = (l) => { zones = l; };
    w.getRoads = () => []; w.setRoads = () => {};
    w.getStructures = () => []; w.setStructures = (l) => { w._st = l; };
    w.ktaStyleBuiltins = () => [];
    charger(w, ["js/poiJonction.js", "js/convertirObjet.js"]);
    const C = w.KtaConvertir;
    t("cases « aussi au −2 » : niveaux [−2, −1], level inchangé",
      C.changerNiveauxZone(zones[0], [-2]) && J(zones[0].niveaux) === "[-2,-1]" && zones[0].level === -1);
    t("même choix redemandé : rien à écrire (pas d'entrée ⏪ vide)", C.changerNiveauxZone(zones[0], [-2]) === false);
    t("niveau d'origine déplacé (−1 → 0) : remplacé dans `niveaux`, `level` inclus",
      C.changerNiveau("zones", zones[0], 0) && zones[0].level === 0 && J(zones[0].niveaux) === "[-2,0]");
    t("tout décoché : le champ disparaît (zone simple)",
      C.changerNiveauxZone(zones[0], []) && !("niveaux" in zones[0]) && zones[0].level === 0);
    C.changerNiveauxZone(zones[0], [1]);
    t("zone → zone d'un autre type : `niveaux` gardé",
      C.convertir("zones", zones[0], "zones", "eau") && J(zones[0].niveaux) === "[0,1]" && zones[0].type === "eau");
    C.convertir("zones", zones[0], "structures", "pilier-1");
    t("zone → structure : `niveaux` retiré (propre aux zones)", Array.isArray(w._st) && w._st.length === 1 &&
      !("niveaux" in w._st[0]));
  }

  // ── 5. Session : le champ passe tel quel ──
  {
    const w = contexte({ visibleLevels: [-2] });
    const couche = () => ({ addTo() { return this; }, remove() {} });
    w.L = { polygon: couche, polyline: couche, circleMarker: couche, svg: () => ({}) };
    w.map = { on() {} };
    w.convertCoord = (x, y) => [1000 - y, x];
    w.ktaResolveStyle = () => ({ color: "#000" });
    w._aucunModeEditionActif = () => true;
    charger(w, ["js/poiJonction.js", "js/zones.js"]);
    w.setZones(JSON.parse(J([{ uid: "zn_s", type: "eau", level: -1, niveaux: [-2, -1], points: carre(5, 5, 2) }])));
    const relu = JSON.parse(J(w.getZones()));
    t("session : getZones → JSON → setZones garde `niveaux`", J(relu[0].niveaux) === "[-2,-1]" && relu[0].level === -1);
    const se = lire("js/sessionExporter.js");
    const anon = (se.match(/\/\/ 3\. zones[\s\S]*?\/\/ 4\. structures/) || [""])[0];
    t("export anonymisé : `niveaux` d'une zone gardé (règle des passages entre niveaux)",
      /out\.niveaux = z\.niveaux\.slice\(\)/.test(anon));
    const u = lire("js/utils.js");
    const emb = (u.match(/window\.getAllEmbeddedZones = function[\s\S]*?\n\};/) || [""])[0];
    t("zones de calque : getAllEmbeddedZones rend `niveaux`", /out\.niveaux = /.test(emb));
  }

  // ── 6. KMZ et GeoJSON ──
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
      { type: "effondrement", level: -1, niveaux: [-2, -1], points: carre(1000, 1000, 50), description: "ZoneMulti" },
      { type: "eau", level: -1, points: carre(1500, 1000, 50), description: "ZoneSimple" }
    ] };
    const inc = { points: false, roads: false, zones: true, structures: false, jonctions: false, itineraire: false };
    const kml = KE.genererKml({ transform: tr, planName: "Test", include: inc, levels: new Set([0, -1, -2]), data: data });
    const dossiers = kml.split("<name>🏗️ Niveau ").slice(1);
    const dans = (n, txt) => dossiers.filter(d => d.indexOf(n + "</name>") === 0)
      .some(d => d.split("</Folder></Folder>")[0].indexOf(txt) >= 0);
    t("KMZ : la zone multi-niveaux est dans le dossier du −1 ET du −2, pas du 0",
      dans("-1", "ZoneMulti") && dans("-2", "ZoneMulti") && !dans("0", "ZoneMulti"));
    t("KMZ : la zone simple reste dans le seul dossier de son niveau", dans("-1", "ZoneSimple") && !dans("-2", "ZoneSimple"));
    t("KMZ : mkm:niveaux écrit sur les deux exemplaires, une seule copie marquée mkm:copie",
      (kml.match(/mkm:niveaux"><value>-2,-1</g) || []).length === 2 && (kml.match(/mkm:copie/g) || []).length === 1);
    const seul2 = KE.genererKml({ transform: tr, planName: "Test", include: inc, levels: new Set([-2]), data: data });
    t("KMZ du seul −2 : la zone y est l'original (pas une copie)",
      seul2.indexOf("ZoneMulti") >= 0 && seul2.indexOf("mkm:copie") < 0 && seul2.indexOf("ZoneSimple") < 0);
    const ki = lire("js/kmzImport.js");
    t("KMZ relu : une copie est sautée quelle que soit sa géométrie, `niveaux` reposé sur la zone",
      /if \(_mkmData\.copie\) \{ stats\.skipped\+\+; continue; \}/.test(ki) && /_zn\.niveaux = _mkmData\.niveaux/.test(ki));
    const fc = GJ.generer({ transform: tr, epsg: 4326, planName: "Test", include: inc, levels: new Set([-2]), data: data });
    const fz = fc.features.filter(f => f.properties.type === "effondrement");
    t("GeoJSON : une seule entité, gardée au −2 seul, propriété niveaux [−2, −1]",
      fz.length === 1 && J(fz[0].properties.niveaux) === "[-2,-1]" && !fc.features.some(f => f.properties.type === "eau"));
    const fc0 = GJ.generer({ transform: tr, epsg: 4326, planName: "Test", include: inc, levels: new Set([0]), data: data });
    t("GeoJSON du seul 0 : la zone −1 / −2 n'y est pas", fc0.features.length === 0);
  }

  // ── 7. Vue 3D, sélection par zone, volume exploité : la zone compte sur chacun de ses niveaux ──
  {
    const w = contexte();
    let horloge = 0;
    w.performance = { now: () => horloge };
    let zones = [{ uid: "zn_3", type: "inaccessible", level: 0, niveaux: [-1, 0], points: carre(100, 100, 20) },
      { uid: "zn_r", type: "remblais", level: 0, niveaux: [-1, 0], points: carre(300, 100, 10) }];
    w.getZones = () => zones;
    w.getRoads = () => []; w.getStructures = () => []; w.getEditorPoints = () => [];
    charger(w, ["js/poiJonction.js", "js/galerieEmprise.js", "js/selectionZone.js", "js/volumeExploite.js"]);
    const G = w.KtaGalerie;
    t("3D (règle du pas) : la zone 0 / −1 bouche au 0 et au −1, pas au −2",
      G.dansZone(100, 100, 0, "structures") && G.dansZone(100, 100, -1, "structures") &&
      !G.dansZone(100, 100, -2, "structures"));
    zones = zones.map(z => Object.assign({}, z, { niveaux: undefined }));
    horloge += 1000;
    t("3D : −1 décoché (même contour, même `level`) → la signature le voit, la zone ne bouche plus au −1",
      !G.dansZone(100, 100, -1, "structures") && G.dansZone(100, 100, 0, "structures"));
    const v3d = lire("js/vue3d.js");
    t("3D (scène) : les zones dessinées du niveau passent par _zoneSurNiveau (ktaNiveauxObjet)",
      /zones: _filtrer\([\s\S]{0,200}_zoneSurNiveau\(z, niveau\)/.test(v3d) &&
      /function _zoneSurNiveau\(z, niveau\) \{[\s\S]{0,200}ktaNiveauxObjet\(z\)/.test(v3d));
    zones[0].niveaux = [-1, 0]; zones[1].niveaux = [-1, 0];
    w.APP_CONFIG.activeLevel = -1;
    w.ktaPointInPolygon = (q, poly) => {   // ray-casting, la règle de utils.js
      let d = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const A = poly[i], B = poly[j];
        if ((A.y > q.y) !== (B.y > q.y) && q.x < (B.x - A.x) * (q.y - A.y) / (B.y - A.y) + A.x) d = !d;
      }
      return d;
    };
    const sel = w.KtaSelectionZone.dansZone(carre(100, 100, 40));
    w.APP_CONFIG.activeLevel = -2;
    const sel2 = w.KtaSelectionZone.dansZone(carre(100, 100, 40));
    t("sélection par zone : la zone 0 / −1 en fait partie au −1, pas au −2",
      sel.items.some(i => i.obj === zones[0]) && !sel2.items.some(i => i.obj === zones[0]));
    const vol = (niveau) => w.KtaVolumeExploite.calculer({ secteur: carre(300, 100, 50), structures: [],
      zones: zones, niveau: niveau, scale: 2, hauteur: 2 });
    t("volume exploité : le remblais 0 / −1 compte au −1, pas au −2",
      vol(-1).remblaisM2 > 0 && vol(-2).remblaisM2 === 0, [vol(-1).remblaisM2, vol(-2).remblaisM2]);
  }

  console.log(ko ? "\n⚠️ " + ko + " echec(s)" : "\n🎉 Zones sur plusieurs niveaux : tout passe");
  process.exit(ko ? 1 : 0);
})();
