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
t("front-1 est une polyline epaisse", R("structures", "front-1").weight === 10 && R("structures", "front-1").isPolyline === true);
t("pilier garde son contour de 3px", R("structures", "pilier-1").weight === 3);

// ── motif SVG et son repli d'aplat ──
// Le rendu carte veut le motif hachure ; tout contexte qui ne sait pas peindre
// un url(#...) (bitmap, KMZ, fond OSM) demande { flat: true }.
t("inaccessible par defaut = motif SVG", /^url\(#/.test(R("zones", "inaccessible").fillColor));
t("inaccessible { flat } = aplat #7a0000", R("zones", "inaccessible", { flat: true }).fillColor === "#7a0000");
t("inaccessible { flat } baisse l'opacite", R("zones", "inaccessible", { flat: true }).fillOpacity === 0.65);
t("{ flat } n'affecte pas un type sans motif", R("zones", "eau", { flat: true }).fillColor === "#3aa9e8");
t("le style rendu ne fuit aucun champ interne",
  !("_flatFill" in R("zones", "inaccessible")) && !("_flatFillOpacity" in R("zones", "inaccessible", { flat: true })));
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
    if (id === "cust-front") return { id, category: "structures", geometry: "polyline", lineColor: "#ff0000" };
    if (id === "cust-pilier") return { id, category: "structures", geometry: "polygon", fillColor: "#00ff88" };
    return null;
  }
};
t("custom polyline -> lineColor", R("traces", "cust-line").color === "#123456");
const p = R("zones", "cust-poly");
t("custom polygon -> fond + bordure", p.fillColor === "#abcdef" && p.color === "#fedcba");
t("custom sans geometrie -> repli sur la categorie", R("structures", "cust-nogeo") !== null);
t("custom inconnu -> null", R("traces", "cust-inexistant") === null);
// Un custom doit ressembler aux built-in de SA categorie, pas a un gabarit unique.
const cf = R("structures", "cust-front");
t("front custom : epaisseur 10 + isPolyline", cf.weight === 10 && cf.isPolyline === true && cf.color === "#ff0000");
const cp = R("structures", "cust-pilier");
t("pilier custom : contour noir + opacite 0.85", cp.color === "#000000" && cp.fillOpacity === 0.85 && cp.weight === 3);
t("categorie croisee refusee (zone custom demandee en trace)", R("traces", "cust-poly") === null);

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
