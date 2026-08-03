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

console.log(ko === 0 ? "\n🎉 tout passe" : "\n⚠️ " + ko + " pref(s) perdue(s) au chargement d'un plan");
process.exit(ko === 0 ? 0 : 1);
