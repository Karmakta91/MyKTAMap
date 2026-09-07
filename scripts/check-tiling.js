#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🖼️ check-tiling.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LA RÈGLE (audit tuilage du 07/09/2026, arbitrage KARMA) :
//
//   « Un plan V2 doit OBLIGATOIREMENT profiter du mode tuile. Le fichier
//     complet reste dans le ZIP — il sert au dézip manuel — mais en
//     principe il n'est pas utilisé. »
//
// 🩸 CE QUE L'AUDIT A TROUVÉ :
//
//   1. Sur un plan V2, les presets Qualité / Équilibré / Performance / Auto
//      étaient STRICTEMENT identiques : la branche V2 est prise avant eux et
//      `_chargerImageV2OptionB` ne reçoit aucun paramètre de preset. L'UI
//      promettait « Plus net. Recommandé sur PC desktop. » — c'était faux.
//
//   2. `auto`, le DÉFAUT, était le mode le MOINS protecteur : il tranchait
//      sur le poids fichier (60 Mo) quand les presets explicites tranchaient
//      sur la surface (4096²). Un JPEG de 100 Mpx pèse ~15 Mo → auto ne
//      tuilait pas, texture géante, crash Safari iOS.
//
//   3. Un plan V2 servi en HTTP affichait une CARTE BLANCHE : RUNTIME_ASSETS
//      n'est rempli que par les imports ZIP, donc toutes les tuiles étaient
//      introuvables. Seul « Désactivé » sauvait ce cas — par accident.
// =====================================================================
"use strict";

const fs = require("fs");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const TIL = fs.readFileSync("js/tiling.js", "utf8");
const IDX = fs.readFileSync("index.html", "utf8");

// 🩸 On teste du CODE, pas des commentaires : une assertion qui cherche une
// chaîne dans tout un fichier est satisfaite — ou cassée — par le commentaire
// qui explique la règle. Piège déjà vécu deux fois (v1.85.3, v1.85.4).
function sansCommentaires(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}
const CODE = sansCommentaires(TIL);
const IDXC = sansCommentaires(IDX);

// Extrait le bloc `if (preset === "off")` SITUÉ DANS la branche V2, par
// appariement d'accolades. 🩸 Première version : je découpais « du test tiledV2
// jusqu'à l'appel du runtime V2 » — la tranche se terminait sur le `return` du
// dispatch lui-même, et l'assertion rougissait sur du code parfaitement sain.
function blocOffV2() {
  const d = CODE.indexOf("pc.plan.tiledV2 === true");
  if (d < 0) return "";
  const i = CODE.indexOf('if (preset === "off")', d);
  if (i < 0) return "";
  const j = CODE.indexOf("{", i);
  if (j < 0) return "";
  let prof = 0;
  for (let k = j; k < CODE.length; k++) {
    if (CODE[k] === "{") prof++;
    else if (CODE[k] === "}") { prof--; if (prof === 0) return CODE.slice(i, k + 1); }
  }
  return "";
}

// ───────── 1. un plan V2 tuile TOUJOURS ─────────
{
  const b = blocOffV2();
  t("le traitement de « off » dans la branche V2 est trouvable", b.length > 0);
  // Le contournement v151 posait un L.imageOverlay puis SORTAIT de la fonction.
  // Ce sont le `return` et le `imageOverlay` qui faisaient le détournement.
  t("🩸 un plan V2 ne peut plus être détourné vers le baseImage par « off »",
    b.length > 0 && b.indexOf("return") < 0 && b.indexOf("imageOverlay") < 0);
  t("« off » sur un plan V2 est explicitement ignoré (et tracé)",
    /console\.log/.test(b));
}

// ───────── 2. auto tranche sur les PIXELS ─────────
{
  const d = CODE.indexOf('if (p === "auto")');
  const f = CODE.indexOf("}", CODE.indexOf("return {", d));
  const b = (d >= 0) ? CODE.slice(d, f) : "";
  t("la branche auto est trouvable", b.length > 0);
  t("🩸 auto tranche sur la SURFACE (le défaut n'est plus le mode le moins protecteur)",
    b.indexOf("TUILING_NECESSAIRE_PIXELS") >= 0);
  t("auto garde le poids fichier en second critère",
    b.indexOf("PERF_AUTO_TILE_THRESHOLD") >= 0);
}

// ───────── 3. les plans SERVEUR résolvent leurs tuiles en HTTP ─────────
// 🩸 v1.87.0 : la dérivation a quitté l'IIFE locale pour une fonction
// TOP-LEVEL partagée avec le pré-cache hors-ligne. Deux copies auraient
// divergé, et le symptôme aurait été un plan « téléchargé » mais troué.
t("🌐 la racine des tuiles serveur est une fonction PARTAGÉE",
  /function ktaRacineTuilesServeur\(pc\)/.test(CODE));
t("🩸 le runtime V2 l'APPELLE au lieu de recalculer",
  /const RACINE_SRV = ktaRacineTuilesServeur\(/.test(CODE));
t("🌐 elle est exposée pour le pré-cache hors-ligne",
  /window\.ktaRacineTuilesServeur\s*=/.test(CODE) && /window\.ktaTuilesV2Urls\s*=/.test(CODE));
t("🌐 elle est dérivée du dossier du baseImage", /lastIndexOf\("\/"\)[\s\S]{0,200}\/tiles/.test(CODE));
t("🌐 un déploiement non standard peut la surcharger (tilesDir)",
  /tm\.tilesDir/.test(CODE));
t("🩸 un plan LOCAL (baseImage en blob:) n'est PAS pris pour un plan serveur",
  /blob:\|data:/.test(CODE));
t("🌐 sans asset en mémoire, la tuile est résolue en HTTP au lieu de null",
  // 🩸 ASSERTION RENFORCÉE APRÈS FALSIFICATION : la première version ne testait
  // que la PRÉSENCE de RACINE_SRV dans le ternaire — `return null ? RACINE_SRV
  // + ... : null` la satisfaisait. On exige qu'il en soit la CONDITION.
  /return RACINE_SRV\s*[\r\n]\s*\? RACINE_SRV \+/.test(CODE) && /if \(!asset\) \{/.test(CODE));

// ───────── 4. le repli est une RÉCUPÉRATION, pas un mode ─────────
t("🩸 un repli baseImage existe quand aucune tuile n'est exploitable",
  /function _repliBaseImage\(/.test(CODE));
t("il ne se déclenche qu'une seule fois par chargement",
  /if \(state\.repliFait\) return;[\s\S]{0,80}state\.repliFait = true;/.test(CODE));
t("déclencheur 1 : aucune tuile résolue",
  /added === 0 && missing > 0[\s\S]{0,60}_repliBaseImage/.test(CODE));
// 🩸 En mode serveur une URL HTTP « résout » toujours, même en 404 : `added`
// ne dit plus rien. Sans ce second déclencheur, un déploiement raté redonne
// une carte blanche muette — le bug qu'on vient de corriger.
t("🩸 déclencheur 2 : toutes les tuiles du premier rendu en ERREUR de chargement",
  /overlay\.on\("error"/.test(CODE) && CODE.indexOf("state.erreursPremier") >= 0);
t("le premier rendu est capturé AVANT la boucle (currentLevel est réaffecté après)",
  /const premierRendu = \(state\.currentLevel === null\);/.test(CODE));

// ───────── 5. l'UI ne propose plus que ce qui agit ─────────
{
  const presets = (IDXC.match(/data-preset="([a-z]+)"/g) || []).map(s => s.split('"')[1]);
  t("🩸 l'UI ne propose plus que 2 choix (les 3 presets V1 ne changeaient rien en V2) : " +
    presets.join(", "),
    presets.length === 2 && presets.indexOf("auto") >= 0 && presets.indexOf("off") >= 0);
  t("Auto est le défaut affiché en premier", presets[0] === "auto");
  // 🩸 RÉTRO-COMPAT : un plan peut avoir « quality » mémorisé dans le registre.
  // Le code doit continuer de l'accepter, sinon le preset stocké devient invalide.
  ["js/main.js", "js/planRegistry.js"].forEach(function (f) {
    t("rétro-compat : " + f + " accepte toujours les 5 valeurs historiques",
      /"off", "auto", "quality", "balanced", "performance"/.test(fs.readFileSync(f, "utf8")));
  });
  t("rétro-compat : resoudrePerfPreset sait toujours traiter les presets explicites",
    CODE.indexOf("PERF_PRESETS[p]") >= 0);
}

// ───────── 6. le chemin des tuiles ZIP n'est écrit qu'une fois ─────────
t("le chemin d'une tuile ZIP a UN seul point de vérité (_cheminTuileZip)",
  /function _cheminTuileZip\(/.test(CODE) &&
  (CODE.match(/"data\/tiles\/z"/g) || []).length === 1);

// ───────── 7. « off » sur un gros plan V1 est annoncé ─────────
t("⚠️ « off » sur une image > 4096² avertit l'utilisateur",
  /preset === "off" && \(W \* H\) > TUILING_NECESSAIRE_PIXELS/.test(CODE));


// ───────── 9. 🌐 DÉPLOIEMENT SERVEUR : ON EXÉCUTE, ON NE DEVINE PAS ─────────
// 🩸 VÉCU (v1.86.1) : « je crée un dossier toto et j'y mets le contenu du ZIP ».
// Ça ne marchait pas, et ça n'avait JAMAIS marché — ni en V1 ni en V2. Le
// générateur écrit `data/MonPlan.png` dans le plan-config (mise en page DU ZIP)
// et `resolveServerPath` rendait tout chemin `data/…` TEL QUEL, donc résolu à
// la racine du site : 404 sur tout sauf le plan-config. Il fallait aplatir le
// dossier `data/` ET réécrire chaque chemin à la main, sans que rien ne le dise.
//
// Ce contrôle CHARGE config.js dans un vm et APPELLE la fonction : une
// assertion de chaîne aurait laissé passer une régression de logique.
{
  const vm = require("vm");
  const win = { location: { href: "http://x/", search: "" }, navigator: { userAgent: "node" },
                localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
                document: { addEventListener: () => {}, documentElement: {},
                            querySelector: () => null, getElementById: () => null },
                addEventListener: () => {}, console: console, indexedDB: null };
  win.window = win;
  let f = null;
  try {
    const ctx = vm.createContext(win);
    vm.runInContext("var window = this; var document = this.document; var localStorage = this.localStorage;" +
                    fs.readFileSync("js/config.js", "utf8"), ctx);
    f = win.resolveServerPath;
  } catch (e) {
    console.log("   ↳ " + e.name + " : " + e.message);
  }
  t("config.js se charge et expose resolveServerPath", typeof f === "function");

  if (typeof f === "function") {
    const cas = [
      // LE CAS KARMA : dézip brut du ZIP dans data/toto/
      ["data/MonPlan.png",        "data/toto", "data/toto/data/MonPlan.png", "🩸 dézip brut : le chemin du ZIP est préfixé"],
      ["data/tiles/z0/x0_y-1.jpg","data/toto", "data/toto/data/tiles/z0/x0_y-1.jpg", "🩸 les tuiles suivent le même chemin"],
      // RÉTRO-COMPAT : déploiement réécrit à la main (data/test)
      ["data/test/TestMAP.png",   "data/test", "data/test/TestMAP.png",      "🩸 déploiement déjà préfixé : INCHANGÉ"],
      ["data/test/puits.json",    "data/test", "data/test/puits.json",       "…y compris les calques de données"],
      // Ce qui ne doit jamais bouger
      ["icon/house.png",          "data/toto", "icon/house.png",             "icon/ reste à la racine (icônes de l'app)"],
      ["https://x/y.png",         "data/toto", "https://x/y.png",            "URL absolue intacte"],
      ["/racine.png",             "data/toto", "/racine.png",                "chemin absolu intact"],
      ["autre.json",              "data/toto", "data/toto/autre.json",       "chemin nu : relatif au plan"]
    ];
    cas.forEach(function (c) {
      const got = f(c[0], c[1]);
      t(c[3] + "  [" + c[0] + " @ " + c[1] + " → " + got + "]", got === c[2]);
    });
  }
}


// ───────── 10. 🎨 ICÔNES : ON SONDE, ON NE DEVINE PLUS ─────────
// 🩸 VÉCU DEUX FOIS, ET LA 2e ÉTAIT MA CORRECTION DE LA 1re.
//   v1.86.1 — les icônes PERSO d'un plan servi n'étaient pas résolues
//             (`icon/…` toujours lu depuis la racine du site).
//   v1.86.2 — j'ai voulu trancher sur le catalogue `TAGS_BUILTIN` : hors
//             catalogue = icône du ZIP → préfixée. FAUX. `TAGS_BUILTIN` liste
//             des **tags de POI**, pas les icônes livrées avec l'app :
//             `icon/iconetrack.png` (marqueur du tracker) existe bien à la
//             racine et n'y figure pas. Sur un plan serveur, l'icône du
//             tracker partait donc en `data/<plan>/icon/iconetrack.png` → 404.
//             Régression d'AFFICHAGE, révélée par hasard par le pré-cache
//             hors-ligne (« 9 fichiers sur 10 », constat KARMA).
//   v1.87.2 — on ne devine plus : on DEMANDE au serveur. Une icône n'est
//             réécrite que si elle est VRAIMENT dans le dossier du plan.
// Aucun catalogue ne liste toutes les icônes de l'app : tout critère fondé
// sur une liste rejouera ce bug. C'est ce que ce contrôle empêche.
{
  const CFG = fs.readFileSync("js/config.js", "utf8");
  const CFGC = sansCommentaires(CFG);
  t("🩸 `icon/…` n'est plus jamais préfixé en synchrone (fin de la devinette)",
    CFGC.indexOf("_ktaBuiltinIconUrls") < 0);
  t("🎨 un sondeur asynchrone existe", CFGC.indexOf("async function resoudreIconesPlanServeur") >= 0);
  t("🎨 loadAppConfig l'ATTEND (le rendu lit config.icons juste après)",
    CFGC.indexOf("await resoudreIconesPlanServeur(config, baseDir)") >= 0);
  t("🎨 il est exposé pour le pré-cache hors-ligne",
    CFGC.indexOf("window.resoudreIconesPlanServeur") >= 0 &&
    sansCommentaires(fs.readFileSync("js/planOffline.js", "utf8"))
      .indexOf("await window.resoudreIconesPlanServeur") >= 0);
  t("🩸 seule une réponse 200 fait basculer l'icône vers le dossier du plan",
    /r\.status === 200/.test(CFGC));
}

// ───────── 11. 🎨 ON EXÉCUTE LE SONDEUR ─────────
// Le cas de la régression est rejoué tel quel : une icône de l'app absente du
// dossier du plan NE DOIT PAS être réécrite, une icône perso présente DOIT
// l'être. Une assertion de chaîne n'aurait rien dit de ce comportement.
// 🩸 `async` : sans ça, un throw de `vm.runInContext` (module renommé, syntaxe
// cassée…) remontait SYNCHRONEMENT hors du Promise.all et faisait PLANTER le
// script au lieu de le faire échouer. Un crash n'est pas un échec annoncé :
// mon falsificateur le lisait comme « reste vert ».
async function _sonderIcones(icons, presentsLocalement, fetchPlante) {
  const vm = require("vm");   // require local : le §9 le scope dans son bloc
  const win = { console: { log: () => {}, warn: () => {} }, navigator: { userAgent: "node" },
                location: { href: "http://x/" },
                document: { addEventListener: () => {}, documentElement: {},
                            querySelector: () => null, getElementById: () => null },
                localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
                addEventListener: () => {} };
  win.window = win;
  win._sondes = [];
  win.fetch = async function (u) {
    win._sondes.push(u);
    if (fetchPlante) throw new Error("reseau");
    return { status: presentsLocalement.indexOf(u) >= 0 ? 200 : 404 };
  };
  const ctx = vm.createContext(win);
  vm.runInContext("var window = this; var document = this.document; var localStorage = this.localStorage;" +
                  "var fetch = this.fetch;" + fs.readFileSync("js/config.js", "utf8"), ctx);
  const cfg = await win.resoudreIconesPlanServeur({ icons: Object.assign({}, icons) }, "data/toto");
  return { icons: cfg.icons, sondes: win._sondes };
}

Promise.all([
  _sonderIcones({ track: "icon/iconetrack.png", perso: "icon/moncustom.png",
                  def: "lib/leaflet/images/marker-icon.png" },
                ["data/toto/icon/moncustom.png"], false),
  _sonderIcones({ track: "icon/iconetrack.png" }, [], true)
]).then(function (r) {
  const a = r[0].icons, b = r[1].icons;
  t("🩸 icône de l'APP absente du dossier du plan → NON réécrite (la régression v1.86.2)",
    a.track === "icon/iconetrack.png");
  t("🎨 icône PERSO réellement présente → réécrite vers le dossier du plan",
    a.perso === "data/toto/icon/moncustom.png");
  // 🩸 Vérifier seulement « def n'a pas changé » ne prouvait RIEN : sondé, il
  // aurait pris un 404 et serait resté identique de toute façon. On compte les
  // SONDES : un chemin hors `icon/` ne doit même pas générer de requête.
  t("🎨 un chemin hors `icon/` n'est même pas SONDÉ (2 sondes, pas 3)",
    a.def === "lib/leaflet/images/marker-icon.png" && r[0].sondes.length === 2 &&
    r[0].sondes.every(function (u) { return u.indexOf("/icon/") >= 0; }));
  t("🛟 fail-safe : le réseau plante → tout reste à la racine", b.track === "icon/iconetrack.png");
}).catch(function (e) {
  t("§11 le sondeur s'exécute sans planter — " + (e && e.message), false);
}).then(function () {
  console.log(ko === 0 ? "\n🎉 tuilage : un plan V2 tuile toujours, et un plan serveur trouve ses tuiles"
                       : "\n⚠️ " + ko + " echec(s)");
  process.exit(ko === 0 ? 0 : 1);
});