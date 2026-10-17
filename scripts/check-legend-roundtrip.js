#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-legend-roundtrip.js — BLOQUANT (pré-commit) : aller-retour de la légende personnalisée
// (type custom → dessin → export en calque → plan régénéré → ouverture), plus la légende SIG et le nom
// des types custom dans les stats de l'accueil. Code EXTRAIT des fichiers réels ; une fonction renommée
// fait échouer bruyamment.
// 🩸 La DÉFINITION du type doit voyager, pas seulement son id : sinon tracés blancs, zones grises, et
//    aucune ligne dans la Légende (elle ne liste que les entrées connues), sans réparation possible.
// ⚠️ Contrat : on n'embarque que ce que le calque référence ; ré-import idempotent ; en conflit, la
//    légende du PLAN gagne toujours (un calque ne repeint jamais en silence le travail de l'auteur).
// =====================================================================
const fs = require("fs"), vm = require("vm");

function extraire(src, signature, fin) {
  const d = src.indexOf(signature);
  if (d < 0) throw new Error("introuvable : " + signature);
  return src.slice(d, src.indexOf(fin, d) + fin.length);
}

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ── Côté export (sessionExporter.js) ──────
const se = fs.readFileSync("js/sessionExporter.js", "utf8");
const winE = { console: { log() {}, warn() {} } };
winE.window = winE;
const ctxE = vm.createContext(winE);
// styleResolver d'abord : _legendePourPayload interroge ktaStyleBuiltins (types bruts non built-in).
vm.runInContext("var window=this;" + fs.readFileSync("js/styleResolver.js", "utf8"), ctxE);
vm.runInContext("var window=this;" + extraire(se, "function _legendePourPayload", "\n  }") +
                "\nthis._legendePourPayload=_legendePourPayload;", ctxE);

// La session : 2 types custom + un built-in renomme + une couleur choisie.
winE.LegendCustomization = {
  getSessionState() {
    return {
      schemaVersion: 1,
      labels: { "traces.principal": "Grande galerie", "zones.eau": "Flotte" },
      hidden: { "structures.mur": true },
      colors: { "traces.chemin": "#ff8800", "zones.remblais": "#112233" },
      borders: { "zones.eau": "#101010", "zones.remblais": "#202020" },
      customEntries: [
        { id: "cust-aaa", category: "traces", geometry: "polyline", label: "Boyau", lineColor: "#ff00aa" },
        { id: "cust-bbb", category: "zones",  geometry: "polygon",  label: "Argile", fillColor: "#00ffaa" },
        { id: "cust-zzz", category: "traces", geometry: "polyline", label: "Jamais dessine", lineColor: "#000000" },
        // entree liee a un ID TECHNIQUE brut (pas de prefixe cust-)
        { id: "Bas", category: "zones", geometry: "polygon", label: "Zone basse", fillColor: "#334455" }
      ]
    };
  }
};

// Le calque exporte : un tracé custom + un tracé principal. Pas de zones.
const payload = { data: [], roads: [ { type: "cust-aaa" }, { type: "principal" } ] };
const leg = winE._legendePourPayload(payload);

t("une legende est bien embarquee", !!leg);
t("l'entree custom REFEREE part", leg.customEntries.some(e => e.id === "cust-aaa"));
t("l'entree custom NON referencee ne part PAS", !leg.customEntries.some(e => e.id === "cust-zzz"));
t("l'entree custom d'une autre categorie ne part pas", !leg.customEntries.some(e => e.id === "cust-bbb"));
t("le renommage d'un built-in present part", leg.labels["traces.principal"] === "Grande galerie");
t("le renommage d'un built-in ABSENT ne part pas", leg.labels["zones.eau"] === undefined);
t("la couleur d'un built-in absent ne part pas", leg.colors["zones.remblais"] === undefined);
t("le masquage d'un type absent ne part pas", leg.hidden["structures.mur"] === undefined);

// Un calque sans aucune personnalisation ne doit rien trainer.
t("calque sans perso -> pas de champ legende",
  winE._legendePourPayload({ data: [], roads: [{ type: "secondaire" }] }) === null);

// Un type BRUT (id technique « Bas », sans préfixe cust-) voyage lui aussi.
const legBas = winE._legendePourPayload({ data: [], zones: [ { type: "Bas" }, { type: "eau" } ] });
t("l'entree a id technique part avec le calque", !!legBas && legBas.customEntries.some(e => e.id === "Bas"));
t("les bordures overridees des types presents partent", !!legBas && legBas.borders["zones.eau"] === "#101010");
t("les bordures des types ABSENTS ne partent pas", !!legBas && legBas.borders["zones.remblais"] === undefined);

// ── Côté import (createConf.js) ──────
const cc = fs.readFileSync("js/createConf.js", "utf8");
const winI = { console: { log() {}, warn() {} } };
winI.window = winI;
const ctxI = vm.createContext(winI);
vm.runInContext(
  "var window=this; var _plannerPlanLegend = null; function _plannerLegendStatus(){}\n" +
  extraire(cc, "function _absorberLegendeCalque", "\n}") + "\n" +
  extraire(cc, "function _plannerLegendStateNormalize", "\n}") + "\n" +
  "this._absorber = function(l){ _absorberLegendeCalque(l); return _plannerPlanLegend; };" +
  "this._setPlan  = function(p){ _plannerPlanLegend = p; };", ctxI);

// Cas 1 : plan vierge -> tout est repris.
let res = winI._absorber(leg);
t("plan vierge : la legende du calque est reprise", !!res);
t("  -> l'entree custom est la", res.customEntries.some(e => e.id === "cust-aaa"));
t("  -> le renommage est la", res.labels["traces.principal"] === "Grande galerie");

// Cas 2 : re-import du MEME calque -> idempotent, aucun doublon.
const avant = JSON.stringify(res);
res = winI._absorber(leg);
t("re-import du meme calque : idempotent", JSON.stringify(res) === avant);
t("  -> pas de doublon d'entree", res.customEntries.filter(e => e.id === "cust-aaa").length === 1);

// Cas 3 : CONFLIT -> l'existant du plan gagne, toujours.
winI._setPlan({
  labels: { "traces.principal": "NOM DU PLAN" },
  hidden: {}, colors: {},
  customEntries: [{ id: "cust-aaa", category: "traces", label: "VERSION DU PLAN", lineColor: "#111111" }]
});
res = winI._absorber(leg);
t("conflit de libelle : l'existant du plan gagne", res.labels["traces.principal"] === "NOM DU PLAN");
const e1 = res.customEntries.filter(e => e.id === "cust-aaa");
t("conflit d'id : l'entree du plan gagne", e1.length === 1 && e1[0].label === "VERSION DU PLAN");

// Cas 4 : une legende vide ne doit pas creer un plan-config bidon.
winI._setPlan(null);
t("legende vide -> rien n'est cree", winI._absorber({ labels:{}, hidden:{}, colors:{}, customEntries:[] }) === null);
t("legende absente -> rien n'est cree", winI._absorber(null) === null);

// ── Côté générateur SIG (sigImport.js > assemblerLegendePlan) ──────
// 🩸 La légende éditée (labels, hidden, colors, borders, entrées ajoutées à la main) doit partir dans le
// ZIP, pas des objets vides écrits en dur. Contre-piège : une entrée `cust-sig-…` que la génération
// courante n'a PAS produite vient d'un routage périmé et poserait un type qu'aucun objet ne porte.
const si = fs.readFileSync("js/sigImport.js", "utf8");
const winS = { console: { log() {}, warn() {} } };
winS.window = winS;
const ctxS = vm.createContext(winS);
vm.runInContext(
  "var window=this;\n" +
  extraire(si, "const PREFIXE_AUTO_NIVEAU", ";") + "\n" +
  extraire(si, "function assemblerLegendePlan", "\n  }") + "\n" +
  "this._assembler = assemblerLegendePlan;", ctxS);

const autoSig = [
  { id: "cust-sig-traces-l-nm1",   category: "traces",     label: "Mon niveau -1",  lineColor: "#8cb4ff" },
  { id: "cust-sig-structures-nm2", category: "structures", label: "Mes piliers -2", fillColor: "#7ee0a0" }
];
const editeSig = {
  schemaVersion: 1,
  labels:  { "traces.principal": "Grande galerie" },
  hidden:  { "zones.remblais": true },
  colors:  { "traces.secondaire": "#ff00ff" },
  borders: { "zones.eau": "#0000ff" },
  customEntries: autoSig.concat([
    { id: "cust-mfz1x-ab12",    category: "structures", label: "Pilier historique", fillColor: "#ff0000" },
    { id: "cust-sig-zones-nm9", category: "zones",      label: "Routage perime",    fillColor: "#00ff00" }
  ])
};
const legSig = winS._assembler(editeSig, autoSig);
t("SIG : les libelles des types built-in voyagent", legSig.labels["traces.principal"] === "Grande galerie");
t("SIG : les masquages voyagent",                   legSig.hidden["zones.remblais"] === true);
t("SIG : les couleurs voyagent",                    legSig.colors["traces.secondaire"] === "#ff00ff");
t("SIG : les bordures voyagent",                    legSig.borders["zones.eau"] === "#0000ff");
t("SIG : l'entree ajoutee a la main voyage",
  legSig.customEntries.some(e => e.id === "cust-mfz1x-ab12"));
t("SIG : le renommage des entrees par niveau voyage",
  legSig.customEntries.some(e => e.id === "cust-sig-traces-l-nm1" && e.label === "Mon niveau -1"));
t("SIG : une entree cust-sig- orpheline est ecartee",
  !legSig.customEntries.some(e => e.id === "cust-sig-zones-nm9"));
t("SIG : aucun doublon", new Set(legSig.customEntries.map(e => e.id)).size === legSig.customEntries.length);
t("SIG : rien de personnalise -> pas de section customLegend",
  winS._assembler(null, []) === null &&
  winS._assembler({ labels:{}, hidden:{}, colors:{}, borders:{}, customEntries:[] }, []) === null);
t("SIG : sans etat edite, les entrees par niveau partent quand meme",
  (winS._assembler(null, autoSig) || {}).customEntries.length === 2);

// ── Nom d'un type personnalisé vu depuis l'accueil (statsGlobales.js) ──────
// 🩸 `findCustomEntry` interroge le plan CHARGÉ : sur l'accueil il n'y en a aucun, et le nom d'un type
// SIG vit dans le plan-config du ZIP. D'où un dictionnaire externe, qui ne sert QUE les clés `cust-` :
// en agrégat cross-plan, un BUILT-IN garde son libellé par défaut (décision produit), sinon le renommage
// d'un plan s'impose au total de tous les autres.
{
  const SG = fs.readFileSync("js/statsGlobales.js", "utf8");
  const d = SG.indexOf("let _labelsExternes = null;");
  // ⚠️ Fin de découpe = ancre explicite de la source (jamais un commentaire libre, qu'un nettoyage
  // retirerait). Absente → échec, pas de découpe jusqu'à la fin.
  const f = d >= 0 ? SG.indexOf("// 🏷️ ancre:fin-libelles-stats", d) : -1;
  t("le résolveur de libellé est extractible de statsGlobales.js (repère `🏷️ ancre:fin-libelles-stats`)",
    d >= 0 && f > d);

  if (d >= 0 && f > d) {
    const sb = {
      window: {
        LegendCustomization: {
          getDefaultLabel: function (cat, k) {
            return (cat === "traces" && k === "principal") ? "Principal" : null;
          },
          findCustomEntry: function () { return null; }   // l'accueil : aucun plan chargé
        }
      }
    };
    let err = null;
    try {
      vm.runInNewContext(SG.slice(d, f) + ";this.__set = _setLabelsExternes; this.__lbl = _defaultLabelStat;",
        sb, { filename: "statsGlobales.labels.js" });
    } catch (e) { err = e.message; }
    t("🩸 le résolveur s'EXÉCUTE sans ReferenceError" + (err ? " — " + err : ""), !err);

    if (!err) {
      const DICO = { "structures.cust-sig-structures-l-nm2": "Niveau -2",
                     "traces.principal": "NE DOIT PAS SERVIR" };

      sb.__set(null);
      t("sans dictionnaire, une clé custom reste brute (état d'avant le fix)",
        sb.__lbl("structures", "cust-sig-structures-l-nm2", "cust-sig-structures-l-nm2")
          === "cust-sig-structures-l-nm2");

      // avec dictionnaire : le nom, préfixé ✨ comme partout ailleurs
      sb.__set(DICO);
      t("🏷️ avec dictionnaire, la clé custom devient son NOM",
        sb.__lbl("structures", "cust-sig-structures-l-nm2", "x") === "✨ Niveau -2");

      t("🩸 un type BUILT-IN garde son libellé par défaut (règle v1.21.5-fix1)",
        sb.__lbl("roads", "principal", "x") === "Principal");

      t("une clé custom inconnue reste brute (aucun nom inventé)",
        sb.__lbl("zones", "cust-inconnu-42", "cust-inconnu-42") === "cust-inconnu-42");

      t("🩸 le dictionnaire se retire (sinon il fuiterait dans la modale d'un plan)",
        /if \(arguments\.length >= 5\) _setLabelsExternes\(null\);/.test(SG) &&
        /keys\.length === 0\) \{ _setLabelsExternes\(null\); return "";/.test(SG) &&
        /total === 0\) \{ _setLabelsExternes\(null\); return "";/.test(SG));
    }
  }

  // Côté profil : dictionnaire alimenté au CHARGEMENT du plan, seul moment où la cascade complète répond.
  const HP = fs.readFileSync("js/homeProfile.js", "utf8");
  t("les libellés custom sont mémorisés dans le cache de stats du plan",
    /labels: _labelsCustomCourants\(/.test(HP));
  t("🩸 …et SEULEMENT les custom (un built-in polluerait l'agrégat)",
    /if \(cle\.indexOf\("cust-"\) !== 0\) return;/.test(HP));
  t("🩸 …et jamais un libellé égal à la clé (ça masquerait le trou pour toujours)",
    /if \(lbl && lbl !== cle\)/.test(HP));
  t("l'agrégat cross-plan les fusionne", /aggLabels\[k\] == null\) aggLabels\[k\]/.test(HP));
  t("et les passe au camembert", /renderPie\(data, s\.category, 140, true, labels \|\| \{\}\)/.test(HP));
  t("🩸 quand un nom manque encore, on le DIT au lieu d'afficher une clé sans un mot",
    /_noteTypesNonResolus\(data, s\.category, labels\)/.test(HP) &&
    /home\.profile\.pies\.typesInconnus/.test(HP));
}

console.log(ko === 0 ? "\n🎉 round-trip complet OK" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
