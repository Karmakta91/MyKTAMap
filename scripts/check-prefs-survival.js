// check-prefs-survival.js — garde-fou pré-commit BLOQUANT
// Toute pref (globale ou per-plan) survit au CHARGEMENT D'UN PLAN.
// 🩸 APP_CONFIG est reconstruit à chaque plan par buildAppConfigFromPlan() : une
// pref sauvegardée mais absente de sa relecture retombe en silence sur le défaut.
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

// ⚠️ Prefs VOLONTAIREMENT hors rebuild (ne pilotent rien au niveau plan) :
// listées pour que toute nouvelle omission soit une décision, pas un oubli.
const HORS_REBUILD_ASSUME = new Set([
  "vibrationEnabled",   // lue directement par kta_vibrate
  "last_version_data"
]);

for (const p of ecrites) {
  if (HORS_REBUILD_ASSUME.has(p)) continue;
  t("pref « " + p + " » survit au chargement d'un plan", relues.has(p));
}


// ── Prefs per-plan ───────────────────────────────────────────────────
// 🩸 Un réglage per-plan a besoin de DEUX pièces, l'oubli de l'une ou l'autre
// donne le même symptôme muet (« j'applique, je reviens, c'est revenu ») :
//   1. un ÉCRIVAIN (`setPlanX`) appelé par l'écran ⚙️ Réglages ;
//   2. un APPLICATEUR (`appliquerXPerPlan`) appelé par main.js une fois l'id du
//      plan connu — jamais depuis buildAppConfigFromPlan (prefs du plan PRÉCÉDENT).
const iface = fs.readFileSync("js/interfaceConfig.js", "utf8");
const mainJs = fs.readFileSync("js/main.js", "utf8");

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

// Podomètre : réglages GLOBAUX, écrits par setGlobalPodometre depuis l'écran de
// réglages (sinon « Appliquer » ne persiste rien) ; le reste : check-podometre-global.js.
["stepLength", "stepThreshold", "stepCooldown"].forEach(function (k) {
  const bloc = iface.slice(iface.indexOf("window.setGlobalPodometre({"));
  t("réglage « " + k + " » transmis à setGlobalPodometre (global depuis v1.96.0)",
    iface.indexOf("window.setGlobalPodometre({") >= 0 && bloc.slice(0, 400).indexOf(k) >= 0);
});

console.log(ko === 0 ? "\n🎉 tout passe" : "\n⚠️ " + ko + " pref(s) perdue(s) au chargement d'un plan");
process.exit(ko === 0 ? 0 : 1);
