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
// ── couleur representative (pastilles, barres, camemberts) ──
// Un polygone est represente par son REMPLISSAGE, une ligne par son TRAIT.
const S = win.ktaSwatchColor;
t("swatch trace = son trait",            S("traces", "principal") === "#00ff00");
t("swatch zone = son REMPLISSAGE",       S("zones", "eau") === "#3aa9e8");
t("swatch inaccessible = aplat de repli", S("zones", "inaccessible") === "#7a0000");
t("swatch pilier = son remplissage",     S("structures", "pilier-1") === "#f4c542");
t("swatch front (polyline) = son TRAIT", S("structures", "front-1") === "#f4c542");
t("swatch d'un type inconnu = null",     S("zones", "inexistant") === null);

// ── OVERRIDE DE COULEUR (v1.76.0) ──
// Le point de branchement unique : une couleur choisie ici doit atteindre
// TOUS les consommateurs, sans qu'aucun n'ait a le savoir.
const _over = {};
win.LegendCustomization = {
  findCustomEntry() { return null; },
  getColor(cat, cle) { return _over[cat + "." + cle] || null; }
};

_over["traces.principal"] = "#123456";
t("override d'un trace repeint son trait", R("traces", "principal").color === "#123456");
t("un trace non override reste au canon", R("traces", "chemin").color === "#ffff00");

_over["zones.eau"] = "#00ccff";
const zo = R("zones", "eau");
t("override d'une zone repeint le REMPLISSAGE", zo.fillColor === "#00ccff");
t("la bordure d'une zone est DERIVEE (assombrie)", zo.color !== "#00ccff" && zo.color !== "#0066aa");

_over["structures.pilier-1"] = "#ff00ff";
const so = R("structures", "pilier-1");
t("override d'un pilier repeint le remplissage", so.fillColor === "#ff00ff");
t("le contour NOIR d'une structure est preserve", so.color === "#000000");

_over["structures.front-1"] = "#00ff88";
const fo = R("structures", "front-1");
t("override d'un front repeint son trait", fo.color === "#00ff88" && fo.fillColor === "#00ff88");
t("le front reste une polyline", fo.isPolyline === true && fo.weight === 10);

// Un type a MOTIF repeint perd ses hachures : le pattern SVG est statique.
_over["zones.inaccessible"] = "#888800";
const io = R("zones", "inaccessible");
t("inaccessible override = aplat, plus de motif", io.fillColor === "#888800" && !/^url\(/.test(io.fillColor));
t("inaccessible override prend l'opacite de son repli", io.fillOpacity === 0.65);
t("aucun champ interne ne fuit apres override",
  !("_flatFill" in io) && !("_flatFillOpacity" in io));

// La couleur representative doit suivre l'override, sinon pastilles et
// camemberts continueraient d'afficher l'ancienne couleur.
t("swatch suit l'override (zone)",  win.ktaSwatchColor("zones", "eau") === "#00ccff");
t("swatch suit l'override (trace)", win.ktaSwatchColor("traces", "principal") === "#123456");

// Retrait de l'override → retour exact au canon.
delete _over["traces.principal"];
delete _over["zones.eau"];
t("retirer l'override rend la couleur d'origine",
  R("traces", "principal").color === "#00ff00" &&
  R("zones", "eau").fillColor === "#3aa9e8" && R("zones", "eau").color === "#0066aa");

// Un getColor qui jette ne doit pas emporter le rendu de la carte.
win.LegendCustomization = { findCustomEntry() { return null; }, getColor() { throw new Error("boom"); } };
let crashOver = false;
try { R("traces", "principal"); } catch (e) { crashOver = true; }
t("un getColor qui jette ne fait pas planter", !crashOver);
delete win.LegendCustomization;

// ── pastille HTML (remplace les emojis de la sidebar) ──
const H = win.ktaTypeSwatchHtml;
t("pastille d'un trace = un trait de sa couleur",
  /height:4px/.test(H("traces", "principal")) && /#00ff00/.test(H("traces", "principal")));
t("pastille d'une zone = carre rempli + borde",
  /#3aa9e8/.test(H("zones", "eau")) && /#0066aa/.test(H("zones", "eau")));
t("pastille d'un front = un trait (isPolyline)", /height:4px/.test(H("structures", "front-1")));
t("pastille d'un pilier = carre a bordure noire", /#000000/.test(H("structures", "pilier-1")));
t("type inconnu -> repli emoji rendu tel quel", H("zones", "inexistant", "⛔") === "⛔");
// La pastille doit suivre un override : c'est sa raison d'etre.
win.LegendCustomization = {
  findCustomEntry() { return null; },
  getColor(cat, cle) { return (cat === "traces" && cle === "principal") ? "#ff0000" : null; }
};
t("pastille apres override = la couleur choisie", /#ff0000/.test(H("traces", "principal")));
delete win.LegendCustomization;

t("ktaStyleBuiltins(zones) = 4 types", win.ktaStyleBuiltins("zones").length === 4);
t("ktaStyleBuiltins(bidon) = []", win.ktaStyleBuiltins("bidon").length === 0);

console.log(ko === 0 ? "\n🎉 tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
