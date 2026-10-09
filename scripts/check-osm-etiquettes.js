#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🏷️ check-osm-etiquettes.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Éprouve l'AJOUT DE PLANS PAR ÉTIQUETTE dans la pile multi-plans de la Vue
// OSM du HOME (demande KARMA du 04/09 : « afficher d'un coup tous les plans
// tagués GIRONDE »), sur deux points qui régressent en silence :
//
//   1. LE REGROUPEMENT EST INSENSIBLE À LA CASSE. `PlanRegistry.setTags`
//      dédoublonne les étiquettes D'UN plan, jamais ENTRE plans : « Gironde »
//      sur l'un et « GIRONDE » sur l'autre donneraient deux chips, chacun ne
//      montrant que la moitié de ses plans. Le bug ne se voit que si on a
//      justement tapé les deux orthographes — donc jamais chez celui qui code.
//
//   2. LE CLIC N'EST PAS SYMÉTRIQUE : tant qu'il manque un plan, il AJOUTE
//      seulement les manquants (ré-ajouter un plan déjà monté le dupliquerait
//      dans la pile) ; quand ils y sont tous, il RETIRE. Inverser ou simplifier
//      cette règle rend la fonction inutilisable au deuxième clic.
//
// Le code testé est EXTRAIT de `js/osmHomePreview.js` (pas recopié) : si les
// fonctions changent, c'est la nouvelle version qui est éprouvée ; si elles
// disparaissent ou sont renommées, le script échoue bruyamment au lieu de
// tester du vide.
// =====================================================================
const fs = require("fs"), vm = require("vm");

const src = fs.readFileSync("js/osmHomePreview.js", "utf8");
function extraire(sig, fin) {
  const d = src.indexOf(sig);
  if (d < 0) throw new Error("introuvable dans osmHomePreview.js : " + sig);
  return src.slice(d, src.indexOf(fin, d) + fin.length);
}

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// Registre de test : casses mélangées, étiquettes vides, plan sans étiquette.
const PLANS = [
  { id: "a", tags: ["Gironde", "carriere"] },
  { id: "b", tags: ["GIRONDE"] },
  { id: "c", tags: ["gironde", "test"] },
  { id: "d", tags: [] },
  { id: "e", tags: ["  ", null, "Gironde"] },
  { id: "f", tags: ["Solo"] }
];

const ctx = {
  console: { log() {}, warn() {} }, Promise, Array, Object, String, Set,
  _listGeorefPlans: () => PLANS,
  _stackOrder: [],
  _ajouterPlansOsm: (ids) => { ctx._ajout = ids.slice(); },
  _retirerPlansOsm: (ids) => { ctx._retrait = ids.slice(); }
};
vm.createContext(ctx);
vm.runInContext(
  extraire("  function _etiquettesDesPlans()", "\n  }") + "\n" +
  extraire("  function _basculerEtiquettePlans(cle)", "\n  }") + "\n" +
  "this._et = _etiquettesDesPlans; this._bascule = _basculerEtiquettePlans;", ctx);

// ───────── 1. regroupement ─────────
const e = ctx._et();
t("casse ignoree : Gironde / GIRONDE / gironde = UNE etiquette",
  !!e.gironde && e.gironde.ids.length === 4);
t("  -> les 4 bons plans, dans l'ordre du registre",
  JSON.stringify(e.gironde && e.gironde.ids) === JSON.stringify(["a", "b", "c", "e"]));
t("  -> le libelle affiche est la 1re orthographe rencontree",
  e.gironde && e.gironde.libelle === "Gironde");
t("etiquettes vides / null ecartees", !e[""] && !e["null"] && !e["  "]);
t("une etiquette a UN seul plan existe (c'est le rendu qui la masque)",
  !!e.solo && e.solo.ids.length === 1);
t("un plan sans etiquette n'apparait nulle part",
  !Object.keys(e).some(k => e[k].ids.indexOf("d") >= 0));

// ───────── 2. bascule ─────────
const reset = () => { ctx._ajout = null; ctx._retrait = null; };

ctx._stackOrder.length = 0; reset();
ctx._bascule("gironde");
t("pile vide : le clic AJOUTE les 4",
  JSON.stringify(ctx._ajout) === JSON.stringify(["a", "b", "c", "e"]));

ctx._stackOrder.push("a", "c"); reset();
ctx._bascule("gironde");
t("pile partielle : n'ajoute QUE les manquants (pas de doublon)",
  JSON.stringify(ctx._ajout) === JSON.stringify(["b", "e"]));
t("  -> et ne retire rien", ctx._retrait === null);

ctx._stackOrder.push("b", "e"); reset();
ctx._bascule("gironde");
t("pile complete : le clic RETIRE les 4",
  JSON.stringify(ctx._retrait) === JSON.stringify(["a", "b", "c", "e"]));
t("  -> et n'ajoute rien", ctx._ajout === null);

reset();
ctx._bascule("nexistepas");
t("etiquette inconnue : aucun effet", ctx._ajout === null && ctx._retrait === null);

// ───────── 3. cablage (ce que l'extraction ne voit pas) ─────────
t("`_listGeorefPlans` transporte bien `tags`", /tags:\s*Array\.isArray\(p\.tags\)/.test(src));
t("le conteneur des chips existe dans la modale", src.indexOf('id="ktaOsmMultiTags"') >= 0);
t("`_renderMultiPanel` rend les chips", /_renderMultiTags\(\);/.test(src));
t("l'ajout en lot demande confirmation avant de depasser la pile",
  /osm_mode\.multi\.tagConfirm/.test(src));
t("le plan PRINCIPAL est protege du retrait en lot",
  /_retirerPlansOsm[\s\S]{0,400}id === _selectedPlanId/.test(src));
// En série = chaque chargement accroché au précédent (reduce, ou forEach qui réaffecte la chaîne — écriture
// adoptée le 09/10/2026, Sonar refusant une valeur de reduce ignorée) ; jamais Promise.all sur le lot.
t("les donnees d'un lot se chargent EN SERIE, pas en parallele",
  (/montes\.reduce\(/.test(src) || /montes\.forEach\(function \(m\) \{\s*chaine = chaine\.then\(/.test(src)) &&
  !/Promise\.all\(\s*montes/.test(src));

console.log(ko === 0 ? "\n🎉 etiquettes de plans (Vue OSM) : tout passe"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
