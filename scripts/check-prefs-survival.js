// Harness : toute pref GLOBALE doit survivre au CHARGEMENT D'UN PLAN.
// APP_CONFIG est reconstruit a chaque plan par buildAppConfigFromPlan() ; une
// pref absente de sa liste de relecture retombe silencieusement sur le defaut.
// C'est le bug du 03/08 : snapDraw etait restaure au boot mais PAS ici, donc
// le magnetisme repassait a false des l'ouverture d'un plan.
const fs = require("fs");

const src = fs.readFileSync("js/config.js", "utf8");

// 1) prefs ECRITES par sauvegarderPrefsUtilisateur
const blocSave = src.slice(src.indexOf("function sauvegarderPrefsUtilisateur"));
const finSave  = blocSave.indexOf("localStorage.setItem");
const ecrites = new Set();
for (const m of blocSave.slice(0, finSave).matchAll(/existing\.([A-Za-z0-9_]+)\s*=/g)) ecrites.add(m[1]);

// 2) prefs RELUES au rebuild par plan
const iReb = src.indexOf('const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");',
                          src.indexOf("function buildAppConfigFromPlan"));
const blocReb = src.slice(iReb, iReb + 2500);
const relues = new Set();
for (const m of blocReb.matchAll(/"([A-Za-z0-9_]+)"\s+in saved/g)) relues.add(m[1]);
for (const m of blocReb.matchAll(/saved\.([A-Za-z0-9_]+)/g)) relues.add(m[1]);

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

console.log("prefs sauvegardees :", [...ecrites].join(", "));
console.log("prefs relues au chargement de plan :", [...relues].join(", "));
console.log("");

// Tolerance : quelques prefs sont VOLONTAIREMENT hors rebuild (elles ne
// pilotent rien au niveau plan). On les liste explicitement pour que toute
// nouvelle omission soit une DECISION, pas un oubli.
const HORS_REBUILD_ASSUME = new Set([
  "vibrationEnabled",   // lue directement par kta_vibrate
  "last_version_data"
]);

for (const p of ecrites) {
  if (HORS_REBUILD_ASSUME.has(p)) continue;
  t("pref « " + p + " » survit au chargement d'un plan", relues.has(p));
}


// ─────────────────────────────────────────────────────────────────────
// 👣 v1.82.0 — LES PREFS PER-PLAN AUSSI, et pour la MÊME raison.
//
// Le défaut ci-dessus a maintenant TROIS occurrences :
//   • v1.75.0 magnétisme  → pref globale, corrigée
//   • v1.76.1 échelle     → pref PER-PLAN (setPlanScale)
//   • v1.82.0 podomètre   → pref per-plan (setPlanTracking), signalée par
//     KARMA : « je modifie, j'applique, je reviens, c'est revenu par défaut »
//
// Un réglage per-plan a besoin de DEUX choses, et l'oubli de l'une ou de
// l'autre produit exactement le même symptôme muet :
//   1. un ÉCRIVAIN   (`setPlanX`) appelé par l'écran ⚙️ Réglages ;
//   2. un APPLICATEUR (`appliquerXPerPlan`) appelé par main.js une fois
//      l'id du plan connu — jamais depuis buildAppConfigFromPlan, où l'on
//      lirait les prefs du plan PRÉCÉDENT.
const iface = fs.readFileSync("js/interfaceConfig.js", "utf8");
const mainJs = fs.readFileSync("js/main.js", "utf8");

// Tout `appliquerXPerPlan` déclaré dans config.js doit être exposé, appelé
// par main.js, et avoir son écrivain appelé depuis l'écran de réglages.
const PER_PLAN = [...src.matchAll(/function (appliquer([A-Za-z0-9]+)PerPlan)\s*\(/g)]
  .map(function (m) { return { applique: m[1], sujet: m[2] }; });

t("au moins un réglage per-plan est déclaré", PER_PLAN.length > 0);
PER_PLAN.forEach(function (p) {
  const ecrivain = "setPlan" + p.sujet;
  t("per-plan « " + p.sujet + " » : l'applicateur est exposé",
    src.indexOf("window." + p.applique + "") >= 0);
  t("per-plan « " + p.sujet + " » : main.js l'appelle au chargement",
    mainJs.indexOf(p.applique + "()") >= 0);
  t("per-plan « " + p.sujet + " » : un écrivain " + ecrivain + " existe",
    src.indexOf("function " + ecrivain) >= 0);
  t("per-plan « " + p.sujet + " » : ⚙️ Réglages appelle " + ecrivain,
    iface.indexOf(ecrivain + "(") >= 0);
});

// Et le cas concret qui a mordu : les trois réglages de podomètre doivent
// être écrits par l'écran de réglages. Sans ça, « Appliquer » ne persiste rien.
["stepLength", "stepThreshold", "stepCooldown"].forEach(function (k) {
  const bloc = iface.slice(iface.indexOf("setPlanTracking"));
  t("réglage « " + k + " » transmis à setPlanTracking",
    bloc.slice(0, 600).indexOf(k) >= 0);
});

console.log(ko === 0 ? "\n🎉 tout passe" : "\n⚠️ " + ko + " pref(s) perdue(s) au chargement d'un plan");
process.exit(ko === 0 ? 0 : 1);
