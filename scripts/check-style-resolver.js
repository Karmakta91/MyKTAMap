const fs = require("fs"), vm = require("vm");
const win = { console: { log(){}, warn(){} } };
win.window = win;
const ctx = vm.createContext(win);
vm.runInContext("var window = this;" + fs.readFileSync("js/styleResolver.js", "utf8"), ctx);
const R = win.ktaResolveStyle;

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ── built-in ──
t("trace principale = vert", R("traces", "principal").color === "#00ff00");
t("zone eau : trait + fond", R("zones", "eau").color === "#0066aa" && R("zones", "eau").fillColor === "#3aa9e8");
t("zone inaccessible presente (LE bug d'origine)", R("zones", "inaccessible") !== null);
t("inaccessible n'est PAS du remblais", R("zones", "inaccessible").fillColor !== R("zones", "remblais").fillColor);
t("structure pilier-1", R("structures", "pilier-1").fillColor === "#f4c542");
t("front-1 est une ligne (pas de fond)", R("structures", "front-1").fillColor === undefined);
t("jonction a son tirete", R("traces", "jonction").dashArray === "10 6");

// ── objet NEUF a chaque appel : un consommateur qui mute ne doit contaminer personne ──
const a = R("traces", "principal"); a.color = "#000000";
t("mutation d'un style ne contamine pas la table", R("traces", "principal").color === "#00ff00");
t("deux appels rendent des objets distincts", R("zones", "eau") !== R("zones", "eau"));

// ── inconnus ──
t("categorie inconnue -> null", R("bidon", "principal") === null);
t("cle inconnue -> null", R("traces", "inexistant") === null);
t("arguments vides -> null", R(null, null) === null && R("traces", "") === null);

// ── customs via LegendCustomization ──
win.LegendCustomization = {
  findCustomEntry(id) {
    if (id === "cust-line") return { id, category: "traces",     geometry: "polyline", lineColor: "#123456" };
    if (id === "cust-poly") return { id, category: "zones",      geometry: "polygon",  fillColor: "#abcdef", borderColor: "#fedcba" };
    if (id === "cust-nogeo") return { id, category: "structures" };   // geometrie absente
    return null;
  }
};
t("custom polyline -> lineColor", R("traces", "cust-line").color === "#123456");
const p = R("zones", "cust-poly");
t("custom polygon -> fond + bordure", p.fillColor === "#abcdef" && p.color === "#fedcba");
t("custom sans geometrie -> repli sur la categorie", R("structures", "cust-nogeo") !== null);
t("custom inconnu -> null", R("traces", "cust-inexistant") === null);

// ── robustesse : module custom absent ou qui jette ──
delete win.LegendCustomization;
t("sans LegendCustomization : built-in OK", R("traces", "chemin").color === "#ffff00");
t("sans LegendCustomization : custom -> null", R("traces", "cust-x") === null);
win.LegendCustomization = { findCustomEntry() { throw new Error("boom"); } };
let crash = false;
try { R("traces", "cust-x"); } catch (e) { crash = true; }
t("un findCustomEntry qui jette ne fait pas planter", !crash);

// ── liste des built-in ──
t("ktaStyleBuiltins(zones) = 4 types", win.ktaStyleBuiltins("zones").length === 4);
t("ktaStyleBuiltins(bidon) = []", win.ktaStyleBuiltins("bidon").length === 0);

console.log(ko === 0 ? "\n🎉 tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
