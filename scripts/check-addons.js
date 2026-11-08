#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-addons.js — garde-fou pré-commit BLOQUANT (rejoué en CI) : add-ons livrés (addons/<nom>/)
// =====================================================================
// addons/index.json liste les add-ons ; chaque addons/<nom>/addon.json dit sa prise, son code, son entrée et ses
// fichiers. Le registre de l'app (js/ktaAddons.js) et le précache (sw.js > _assetsAddons) lisent ces manifestes :
// un fichier oublié manque hors ligne, un dossier non listé n'existe pas pour l'app, un code que la vue 3D n'émet
// jamais ne lance rien. Vérifie aussi que sw.js ne liste plus d'add-on à la main et que les trois lecteurs (ici,
// ktaAddons.js, sw.js) gardent la même règle de chemin.
// Doc : docs/architecture/addons.md
// =====================================================================

const fs = require("fs");
const path = require("path");

let ko = 0;
const t = (n, c, info) => {
  console.log((c ? "✅" : "❌") + " " + n + (c || info === undefined ? "" : "  → " + info));
  if (!c) ko++;
};
const lire = (f) => fs.readFileSync(f, "utf8");

const RX_NOM = /^[a-z0-9-]{1,32}$/;
const RX_FICHIER = /^(js|css|img)\/[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)+$/;
const RX_CODE = /^[a-z0-9]{1,16}$/;
const PRISES = ["vue3d"];
const LANGUES = ["fr", "en", "es"];

// Même règle de chemin chez les deux lecteurs servis (un écart = un fichier chargé mais non précaché, ou l'inverse).
const REGISTRE = lire("js/ktaAddons.js"), SW = lire("sw.js");
t("js/ktaAddons.js : règle de chemin identique au garde-fou",
  REGISTRE.includes("const RX_FICHIER = " + RX_FICHIER.toString() + ";"));
t("sw.js : _assetsAddons lit les manifestes avec la même règle de chemin",
  SW.includes("async function _assetsAddons()") && SW.includes(RX_FICHIER.toString() + ".test(f)"));
const i0 = SW.indexOf("const ASSETS_TO_CACHE = [");
const liste = i0 >= 0 ? SW.slice(i0, SW.indexOf("];", i0)) : "";
t("sw.js : aucun fichier d'add-on listé à la main dans ASSETS_TO_CACHE", !/["']\.\/addons\//.test(liste));

// Codes que la vue 3D émet vraiment (vue3d.js > _lancerAddon("<code>")).
const codesVue = new Set(Array.from(lire("js/vue3d.js").matchAll(/_lancerAddon\("([a-z0-9]+)"\)/g), (m) => m[1]));

let index = null;
try { index = JSON.parse(lire("addons/index.json")); } catch (e) { t("addons/index.json lisible", false, e.message); }
const noms = index && Array.isArray(index.addons) ? index.addons : [];
t("addons/index.json : liste `addons` de noms [a-z0-9-], sans doublon",
  !!index && Array.isArray(index.addons) && noms.every((n) => typeof n === "string" && RX_NOM.test(n)) &&
  new Set(noms).size === noms.length, JSON.stringify(index));
const dossiers = fs.readdirSync("addons", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
t("chaque dossier addons/<nom>/ est listé dans addons/index.json, et inversement",
  dossiers.slice().sort().join(",") === noms.slice().sort().join(","), "dossiers " + dossiers + " / index " + noms);

const codes = {};
for (const nom of noms) {
  const base = path.join("addons", nom);
  let m = null;
  try { m = JSON.parse(lire(path.join(base, "addon.json"))); } catch (e) { t(nom + " : addon.json lisible", false, e.message); continue; }
  t(nom + " : nom du manifeste = nom du dossier", m.nom === nom, m.nom);
  t(nom + " : prise connue (" + PRISES.join(", ") + ")", PRISES.includes(m.prise), m.prise);
  t(nom + " : secret est un booléen", m.secret === undefined || typeof m.secret === "boolean", m.secret);
  t(nom + " : parDefaut est un booléen", m.parDefaut === undefined || typeof m.parDefaut === "boolean", m.parDefaut);
  const fichiers = Array.isArray(m.fichiers) ? m.fichiers : [];
  const mauvais = fichiers.filter((f) => typeof f !== "string" || !RX_FICHIER.test(f));
  t(nom + " : fichiers sous js/, css/ ou img/, sans chemin détourné", fichiers.length > 0 && !mauvais.length,
    mauvais.join(", ") || "liste vide");
  const absents = fichiers.filter((f) => typeof f === "string" && !fs.existsSync(path.join(base, f)));
  t(nom + " : chaque fichier listé existe", !absents.length, absents.join(", "));
  const surDisque = [];
  (function parcourir(rel) {
    for (const d of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) {
      const r = rel ? rel + "/" + d.name : d.name;
      if (d.isDirectory()) parcourir(r); else if (r !== "addon.json") surDisque.push(r);
    }
  })("");
  const oublies = surDisque.filter((f) => !fichiers.includes(f));
  t(nom + " : chaque fichier du dossier est listé (sinon absent hors ligne)", !oublies.length, oublies.join(", "));
  t(nom + " : entrée .js parmi ses fichiers", typeof m.entree === "string" && /\.js$/.test(m.entree) &&
    fichiers.includes(m.entree), m.entree);
  t(nom + " : titre en " + LANGUES.join(", "), !!m.titre && LANGUES.every((l) => typeof m.titre[l] === "string" &&
    m.titre[l].trim()), JSON.stringify(m.titre));
  // Un add-on secret n'est pas dans 🧩 : son code est son seul lancement, obligatoire. Un visible peut s'en passer.
  if (m.secret === true || m.code !== undefined) {
    t(nom + " : code de la vue 3D émis par vue3d.js", typeof m.code === "string" && RX_CODE.test(m.code) &&
      codesVue.has(m.code), m.code + " (codes émis : " + Array.from(codesVue).join(", ") + ")");
  }
  if (m.code) {
    t(nom + " : code " + m.code + " pris par un seul add-on", !codes[m.code], codes[m.code]);
    codes[m.code] = nom;
  }
}

console.log(ko === 0 ? "\n🎉 add-ons : index, manifestes, fichiers et précache concordent" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko ? 1 : 0);
