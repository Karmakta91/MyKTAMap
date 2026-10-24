#!/usr/bin/env node
/*
 * MyKTAMap — check-poi-jonction.js
 * Filet des POI « entre niveaux » (escalier, puits à échelons, puits sans échelon : tags jes / jpe / jps).
 *
 * 🔒 Ce qu'il garantit d'abord : un passage ENTRE NIVEAUX n'est JAMAIS une sortie de surface. Un puits qui
 * relie le 0 au −1 proposé comme sortie d'urgence, ou compté parmi les accès de surface du briefing pompiers,
 * enverrait une équipe dans un cul-de-sac. Les tags de surface (peo, eso…) restent des sorties, même quand
 * ils desservent aussi plusieurs niveaux (champ `niveaux`).
 *
 * CHARGE les vrais modules dans un bac à sable, sur des réseaux FICTIFS (aucune donnée de data/ ici).
 *
 * Usage : node scripts/check-poi-jonction.js   (exit 1 si un contrôle échoue)
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
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const TAGS_ENTRE_NIVEAUX = ["jes", "jpe", "jps"];

// Tableau littéral `const NOM = [ … ];` d'un fichier → liste de chaînes (null si introuvable).
function tableau(src, nom) {
  const m = src.match(new RegExp("const " + nom + "\\s*=\\s*\\[([\\s\\S]*?)\\];"));
  if (!m) return null;
  return (m[1].match(/"([^"]+)"/g) || []).map(s => s.slice(1, -1));
}

// ── 1. Les listes de sorties ne contiennent aucun tag « entre niveaux » ──
{
  const su = lire("js/sortieUrgence.js");
  const sm = lire("js/secoursMode.js");
  const sortie = tableau(su, "TYPES_SORTIE");
  const entree = tableau(su, "TAGS_ENTREE");
  const crit = tableau(sm, "CRIT_TAGS");
  const fermes = tableau(sm, "CRIT_FERMES");
  t("listes de sorties lisibles (TYPES_SORTIE, TAGS_ENTREE, CRIT_TAGS, CRIT_FERMES)",
    !!(sortie && entree && crit && fermes));
  const fuites = [].concat(sortie || [], entree || [], crit || [], fermes || [])
    .filter(x => TAGS_ENTRE_NIVEAUX.indexOf(x) >= 0);
  t("🔒 aucun tag entre niveaux parmi les sorties d'urgence ni les accès de surface du Secours" +
    (fuites.length ? " (trouvé : " + fuites.join(", ") + ")" : ""), fuites.length === 0);
  t("les accès de surface restent des sorties (cao, peo, eso)",
    !!sortie && ["cao", "peo", "eso"].every(x => sortie.indexOf(x) >= 0));
  const map = lire("js/map.js");
  t("les 3 tags entre niveaux sont au catalogue (map.js > TAGS_BUILTIN)",
    TAGS_ENTRE_NIVEAUX.every(x => new RegExp("\\n  " + x + ":\\s+\"icon/" + x + "\\.png\"").test(map)));
}

// ── Bac à sable : pathfinder + sortie d'urgence ──
function bac(roads, pois, cfg) {
  const win = {
    console: { log() {}, warn() {}, error() {} },
    APP_CONFIG: Object.assign({ scale: 4, multiLevel: true, imageHeight: 1000 }, cfg || {}),
    I18n: { t: (k, p) => k + (p ? JSON.stringify(p) : "") },
    formatDistance: (m) => Math.round(m) + " m",
    getRoads: () => [],
    getAllEmbeddedRoads: () => roads,
    getEditorPoints: () => pois,
    getAllEmbeddedPoints: () => [],
    getProfondeurNiveau: () => null,
    ktaEsc: KTA_ESC
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ["js/poiJonction.js", "js/pathfinder.js", "js/itiGuidage.js"].forEach(function (f) {
    vm.runInContext("var window = this;" + lire(f), ctx);
  });
  return { win: win, ctx: ctx };
}
const R = (type, pts, extra) => Object.assign({ type: type, points: pts.map(p => ({ x: p[0], y: p[1] })) }, extra || {});

// Sortie d'urgence réelle, DOM simulé : rend le HTML de la fenêtre.
async function sortiesProposees(b, de) {
  const w = b.win;
  const corps = { innerHTML: "" };
  const modal = { id: "", className: "", innerHTML: "", parentNode: null, addEventListener() {},
                  querySelector: () => corps };
  w.document = { createElement: () => modal, getElementById: () => ({ addEventListener() {} }),
                 documentElement: { appendChild(el) { el.parentNode = { removeChild() {} }; } },
                 addEventListener() {}, removeEventListener() {} };
  w.requestAnimationFrame = f => f();
  w.setTimeout = setTimeout;
  w.itineraireYAller = () => {};
  vm.runInContext("var window = this;" + lire("js/sortieUrgence.js"), b.ctx);
  w.SortieUrgence.declencherDepuis(de[0], de[1], de[2], {});
  for (let i = 0; i < 200 && !/kta-sortie-principal|sortie\.aucune/.test(corps.innerHTML); i++) {
    await new Promise(r => setTimeout(r, 5));
  }
  return corps.innerHTML;
}

(async function main() {
  // ── 2. Comportement : un jpe n'est jamais proposé, un peo multi-niveaux reste une sortie ──
  {
    const roads = [
      R("principal", [[0, 500], [400, 500]], { level: 0 }),
      R("principal", [[0, 600], [400, 600]], { level: -1 })
    ];
    const pois = [
      { nom: "PuitsInterne", x: 200, y: 500, level: 0, tags: ["jpe"], niveaux: [0, -1] },
      { nom: "EscalierInterne", x: 300, y: 500, level: 0, tags: ["jes"], niveaux: [0, -1] },
      { nom: "PuitsSurface", x: 380, y: 500, level: 0, tags: ["peo"], niveaux: [0, -1] }
    ];
    const html = await sortiesProposees(bac(roads, pois), [20, 500, 0]);
    t("sortie d'urgence : un peo qui dessert aussi deux niveaux reste proposé", html.includes("PuitsSurface"));
    t("🔒 sortie d'urgence : ni le puits ni l'escalier entre niveaux ne sont proposés",
      !html.includes("PuitsInterne") && !html.includes("EscalierInterne"));
  }

  // ── 3. 🩸 Deux galeries d'étages différents qui passent par le MÊME point ne communiquent pas ──
  // Le graphe fusionnait deux sommets à ≤ 1,5 px sans regarder leur niveau : un sommet du 0 posé sur un
  // sommet du −1 devenait un nœud à deux niveaux, et l'itinéraire changeait d'étage là, sans jonction, à
  // coût nul. C'est exactement la situation d'un puits (les galeries des deux niveaux y arrivent).
  {
    const superposes = [
      R("principal", [[0, 500], [200, 500], [400, 500]], { level: 0 }),
      R("principal", [[200, 300], [200, 500], [200, 700]], { level: -1 })
    ];
    const pf = bac(superposes, []).win.Pathfinder;
    let err = null;
    try {
      await pf.computeRoute([{ x: 20, y: 500, level: 0 }, { x: 200, y: 680, level: -1 }], {});
    } catch (e) { err = e; }
    t("🩸 sommets superposés de deux niveaux : aucun passage d'étage sans jonction (NO_PATH)",
      !!err && err.code === "NO_PATH");
    // Même dessin, plan à un seul niveau : le point commun reste un carrefour.
    const mono = bac(superposes, [], { multiLevel: false }).win.Pathfinder;
    const r = await mono.computeRoute([{ x: 20, y: 500 }, { x: 200, y: 680 }], {});
    t("plan à un niveau : le sommet commun relie toujours les deux galeries (" + Math.round(r.totalDistance) + " px)",
      Math.abs(r.totalDistance - 360) < 0.5);
    // Jonction en tracé (pente douce) : ses bouts s'accrochent toujours à LEUR niveau.
    const avecJonction = superposes.concat([R("jonction", [[400, 500], [400, 700]], { fromLevel: 0, toLevel: -1 }),
                                            R("principal", [[200, 700], [400, 700]], { level: -1 })]);
    const pj = bac(avecJonction, []).win.Pathfinder;
    const rj = await pj.computeRoute([{ x: 20, y: 500, level: 0 }, { x: 200, y: 680, level: -1 }], {});
    t("jonction en tracé : l'itinéraire 0 → −1 passe par elle (" + Math.round(rj.totalDistance) + " px)",
      Math.abs(rj.totalDistance - (380 + 200 + 200 + 20)) < 0.5);
  }

  // ── 4. Le POI dans le graphe : raccords validés, coût vertical, corde ──
  // Échelle 4 px/m. Galerie du 0 horizontale (y = 500), galerie du −1 verticale (x = 200), qui se croisent au
  // puits (200, 500) SANS se toucher (correctif du §3). Départ (20, 500) au 0, arrivée (200, 680) au −1 :
  // 180 px jusqu'au puits, 180 px après.
  {
    const E = 4;
    const roads = [
      R("principal", [[0, 500], [400, 500]], { level: 0 }),
      R("principal", [[200, 300], [200, 700]], { level: -1 })
    ];
    const puits = (tag, extra) => Object.assign({ nom: "Puits", x: 200, y: 500, level: 0, tags: [tag], niveaux: [0, -1],
      accroches: [{ level: 0, x: 200, y: 500 }, { level: -1, x: 200, y: 500 }] }, extra || {});
    const A = { x: 20, y: 500, level: 0 }, B = { x: 200, y: 680, level: -1 };
    async function route(pois, opts, cfg, prof) {
      const b = bac(roads, pois, cfg);
      if (prof) b.win.getProfondeurNiveau = n => (prof[String(n)] === undefined ? null : prof[String(n)]);
      try { return { r: await b.win.Pathfinder.computeRoute([A, B], opts || {}), w: b.win }; }
      catch (e) { return { err: e.code || e.message, w: b.win }; }
    }
    const proche = (d, att) => Math.abs(d - att) < 0.5;

    let x = await route([puits("jpe")]);
    t("jpe, profondeurs non saisies : 0 → −1 par le puits, forfait 20 m (" + (x.r && Math.round(x.r.totalDistance)) +
      " px, attendu " + (360 + 20 * E) + ")", !!x.r && proche(x.r.totalDistance, 360 + 20 * E));
    t("chemin : les points du puits portent le moyen (via = echelons)", !!x.r && x.r.path.some(p => p.via === "echelons"));
    const guide = x.w.ItiGuidage.construire({ type: "itinerary", points: x.r.path, raccords: x.r.raccords, carrefours: [] });
    const niv = guide && guide.consignes.find(c => c.type === "niveau");
    t("guidage : « descendre vers le niveau −1 par l'échelle »",
      !!niv && niv.vers === -1 && niv.moyen === "echelons" && /guid\.par\.echelons/.test(x.w.ItiGuidage.texteAction(niv)));

    x = await route([puits("jpe")], {}, {}, { "0": -25, "-1": -37 });
    t("jpe, profondeurs saisies : la vraie différence (12 m) remplace le forfait (" +
      (x.r && Math.round(x.r.totalDistance)) + " px, attendu " + (360 + 12 * E) + ")",
      !!x.r && proche(x.r.totalDistance, 360 + 12 * E));

    x = await route([puits("jes")]);
    t("jes : forfait escalier 10 m (" + (x.r && Math.round(x.r.totalDistance)) + " px)",
      !!x.r && proche(x.r.totalDistance, 360 + 10 * E) && x.r.path.some(p => p.via === "escalier"));

    x = await route([puits("jps")]);
    t("jps sans la case corde : hors itinéraire (NO_PATH)", x.err === "NO_PATH");
    x = await route([puits("jps")], { corde: true });
    t("jps avec « équipe équipée (corde) » : emprunté (" + (x.r && Math.round(x.r.totalDistance)) + " px)",
      !!x.r && proche(x.r.totalDistance, 360 + 20 * E) && x.r.path.some(p => p.via === "corde"));

    x = await route([puits("jpe", { accroches: [] })]);
    t("niveaux cochés mais aucun raccord validé : pas de passage (NO_PATH)", x.err === "NO_PATH");
    x = await route([puits("jpe", { accroches: [{ level: 0, x: 200, y: 500 }] })]);
    t("un seul niveau raccordé : pas de passage (NO_PATH)", x.err === "NO_PATH");
    x = await route([puits("jpe", { niveaux: undefined })]);
    t("point sans `niveaux` (ancien plan) : son seul niveau, pas de passage", x.err === "NO_PATH");
    x = await route([puits("jpe")], {}, { multiLevel: false });
    t("plan à un seul niveau : le POI n'ajoute rien (le croisement relie déjà les galeries, 360 px)",
      !!x.r && proche(x.r.totalDistance, 360) && !x.r.path.some(p => p.via));
    x = await route([puits("salle")]);
    t("tag ordinaire (salle) avec `niveaux` : ignoré", x.err === "NO_PATH");

    // Raccord perdu : la galerie a bougé de plus de 15 px.
    const bPerdu = bac(roads, [puits("jpe", { accroches: [{ level: 0, x: 200, y: 500 }, { level: -1, x: 240, y: 500 }] })]);
    const g = bPerdu.win.Pathfinder.buildNetworkGraph({});
    t("raccord qui ne retombe plus sur sa galerie : ignoré et compté (graph.raccordsPerdus = 1)", g.raccordsPerdus === 1);

    // Puits 0 / −1 / −2 sans débouché au −1 : 0 ↔ −2 direct, deux niveaux franchis.
    const roads3 = roads.concat([R("principal", [[200, 500], [400, 700]], { level: -2 })]);
    const p3 = { nom: "Puits3", x: 200, y: 500, level: 0, tags: ["jpe"], niveaux: [0, -1, -2],
      accroches: [{ level: 0, x: 200, y: 500 }, { level: -2, x: 200, y: 500 }] };
    const b3 = bac(roads3, [p3]);
    const r3 = await b3.win.Pathfinder.computeRoute([A, { x: 380, y: 680, level: -2 }], {});
    const att3 = 180 + 2 * 20 * E + Math.hypot(180, 180);
    t("puits 0 / −1 / −2 sans débouché au −1 : 0 → −2 direct, deux niveaux de forfait (" +
      Math.round(r3.totalDistance) + " px, attendu " + Math.round(att3) + ")", proche(r3.totalDistance, att3));

    // Zone atteignable (Mode Perdu / Secours) : passe le puits.
    const bz = bac(roads, [puits("jpe")]);
    const z = bz.win.Pathfinder.computeReachable({ x: 20, y: 500, level: 0 }, 1000, {});
    t("zone atteignable : la galerie du −1 est atteinte par le puits",
      z.fullSegments.concat(z.partialSegments).some(s => s[0].x === 200 && s[1].x === 200 && s[0].y !== s[1].y));
    const zsans = bac(roads, [puits("jps")]).win.Pathfinder.computeReachable({ x: 20, y: 500, level: 0 }, 1000, {});
    t("zone atteignable : un puits sans échelon ne l'étend pas",
      !zsans.fullSegments.concat(zsans.partialSegments).some(s => s[0].x === 200 && s[1].x === 200 && s[0].y !== s[1].y));

    // Sortie d'urgence : une sortie au −1 se rejoint par le puits, qui n'est pas lui-même proposé.
    const html = await sortiesProposees(bac(roads, [puits("jpe"),
      { nom: "CavageBas", x: 200, y: 690, level: -1, tags: ["cao"] }]), [20, 500, 0]);
    t("sortie d'urgence : la sortie du −1 est rejointe par le puits (chemin trouvé), le puits n'est pas une sortie",
      html.includes("CavageBas") && !/Puits/.test(html.replace(/CavageBas/g, "")) && !/fallback/.test(html));
  }

  // ── 5. Exports : KMZ niveau par niveau, GeoJSON ──
  {
    const win = {
      console: { log() {}, warn() {}, error() {} },
      I18n: { t: (k) => k, has: () => false },
      APP_CONFIG: { multiLevel: true, scale: 4, imageHeight: 3000 },
      getProfondeurNiveau: () => null,
      ktaEsc: KTA_ESC,
      Blob, Uint8Array, ArrayBuffer, DataView, Math, JSON, Promise, Error, Date, Set, Map,
      isFinite, Number, Array, String, Object, RegExp
    };
    win.window = win; win.globalThis = win;
    vm.createContext(win);
    ["js/poiJonction.js", "js/styleResolver.js", "js/kmzExport.js", "js/geojsonExport.js"].forEach(function (f) {
      vm.runInContext(lire(f), win, { filename: f });
    });
    const KE = win.KmzExport, GJ = win.GeojsonExport;
    const tr = KE.buildTransformCalib({
      pointA: { x: 300, y: 2700, lat: 46.5, lng: 3.0 },
      pointB: { x: 3600, y: 400, lat: 46.50845, lng: 3.02631 },
      pointC: { x: 3500, y: 2800, lat: 46.49840, lng: 3.02560 }
    });
    const data = { editorPoints: [
      { nom: "PuitsJ", x: 1000, y: 1000, level: 0, tags: ["jpe"], niveaux: [0, -1],
        accroches: [{ level: 0, x: 1000, y: 1000 }] },
      { nom: "Salle0", x: 1200, y: 1000, level: 0, tags: ["salle"] }
    ], roads: [], zones: [], structures: [] };
    const inc = { points: true, roads: false, zones: false, structures: false, jonctions: false, itineraire: false };
    const kml = KE.genererKml({ transform: tr, planName: "Test", include: inc, levels: new Set([0, -1]), data: data });
    const dossiers = kml.split("<name>🏗️ Niveau ").slice(1);
    const dans = (n, nom) => dossiers.filter(d => d.indexOf(n + "</name>") === 0)
      .some(d => d.split("</Folder></Folder>")[0].indexOf("<name>" + nom + "</name>") >= 0);
    t("KMZ niveau par niveau : le passage est dans le dossier du 0 ET du −1", dans("0", "PuitsJ") && dans("-1", "PuitsJ"));
    t("KMZ : un point ordinaire reste dans le seul dossier de son niveau", dans("0", "Salle0") && !dans("-1", "Salle0"));
    t("KMZ : mkm:niveaux écrit, une seule copie marquée mkm:copie (pas de doublon au réimport)",
      (kml.match(/mkm:niveaux"><value>-1,0</g) || []).length === 2 && (kml.match(/mkm:copie/g) || []).length === 1);
    const seulMoins1 = KE.genererKml({ transform: tr, planName: "Test", include: inc, levels: new Set([-1]), data: data });
    t("KMZ du seul −1 : le passage y est l'original (pas une copie)",
      seulMoins1.indexOf("<name>PuitsJ</name>") >= 0 && seulMoins1.indexOf("mkm:copie") < 0);
    t("KMZ : les raccords (pixels du plan) ne partent pas", kml.indexOf("accroche") < 0);
    const fc = GJ.generer({ transform: tr, epsg: 4326, planName: "Test", include: inc, levels: new Set([-1]), data: data });
    const fj = fc.features.filter(f => f.properties.nom === "PuitsJ");
    t("GeoJSON : une seule entité, gardée au −1 seul, propriété niveaux [−1, 0]",
      fj.length === 1 && JSON.stringify(fj[0].properties.niveaux) === "[-1,0]" &&
      !fc.features.some(f => f.properties.nom === "Salle0"));
  }

  console.log(ko ? "\n⚠️ " + ko + " echec(s)" : "\n🎉 POI entre niveaux : tout passe");
  process.exit(ko ? 1 : 0);
})();
