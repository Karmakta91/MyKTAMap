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
  ["js/pathfinder.js"].forEach(function (f) {
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

  console.log(ko ? "\n⚠️ " + ko + " echec(s)" : "\n🎉 POI entre niveaux : tout passe");
  process.exit(ko ? 1 : 0);
})();
