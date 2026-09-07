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


// ───────── 10. 🎨 ICÔNES : APP vs PERSONNALISÉES ─────────
// 🩸 v1.86.2 — Le préfixe `icon/` est AMBIGU : il désigne les icônes livrées
// avec l'app (à la racine du site, ABSENTES du ZIP) ET celles ajoutées dans le
// générateur (présentes, elles, DANS le ZIP). Jusqu'ici `resolveServerPaths`
// ne parcourait pas `config.icons` du tout : les premières marchaient par
// ABSENCE de traitement, les secondes étaient condamnées.
// ⚠️ Le catalogue est LU DEPUIS `js/map.js` — jamais recopié ici (règle
// CLAUDE.md, vérifiée par check-icon-catalog.js dans les deux sens).
{
  const vm2 = require("vm");
  const msrc = fs.readFileSync("js/map.js", "utf8");
  const d = msrc.indexOf("const TAGS_BUILTIN = {");
  const f = msrc.indexOf("\n};", d);
  t("🏷️ le catalogue canonique est extractible de map.js", d >= 0 && f > d);
  let CAT = null;
  try { CAT = vm2.runInNewContext("(" + msrc.slice(d + "const TAGS_BUILTIN = ".length, f + 2) + ")"); } catch (e) {
    console.log("   ↳ " + e.message);
  }
  t("🏷️ il contient au moins 15 tags (pas de copie locale : lu à la source)",
    CAT && Object.keys(CAT).length >= 15);

  const mkWin = function (avecCatalogue) {
    const w = { location: { href: "http://x/", search: "" }, navigator: { userAgent: "node" },
                localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
                document: { addEventListener: () => {}, documentElement: {},
                            querySelector: () => null, getElementById: () => null },
                addEventListener: () => {}, console: console, indexedDB: null };
    w.window = w;
    if (avecCatalogue) w._ktaBuiltinIconUrls = CAT;
    const ctx = vm2.createContext(w);
    vm2.runInContext("var window = this; var document = this.document; var localStorage = this.localStorage;" +
                     fs.readFileSync("js/config.js", "utf8"), ctx);
    return w;
  };

  const w = mkWin(true);
  const g = w.resolveServerPath;
  const unBuiltin = CAT ? CAT[Object.keys(CAT)[0]] : "icon/house.png";
  [[unBuiltin,                            "data/toto", unBuiltin,                          "icône de l'APP : reste à la racine"],
   ["icon/moncustom.png",                 "data/toto", "data/toto/icon/moncustom.png",     "🩸 icône PERSO : préfixée (elle est dans le ZIP)"],
   ["lib/leaflet/images/marker-icon.png", "data/toto", "lib/leaflet/images/marker-icon.png","🩸 asset de l'app (lib/) : jamais préfixé"],
   ["css/style.css",                      "data/toto", "css/style.css",                    "…idem css/"]
  ].forEach(function (c) {
    const got = g(c[0], c[1]);
    t(c[3] + "  [" + c[0] + " → " + got + "]", got === c[2]);
  });

  // 🩸 FAIL-SAFE : catalogue indisponible (map.js pas encore chargé) → on ne
  // préfixe RIEN. Se tromper dans ce sens = comportement d'avant ; dans
  // l'autre = toutes les icônes de l'app cassées.
  const wSans = mkWin(false);
  t("🩸 sans catalogue, aucune icône n'est préfixée (fail-safe)",
    wSans.resolveServerPath("icon/moncustom.png", "data/toto") === "icon/moncustom.png");

  // Et le parcours doit exister : sans lui, rien de tout ça n'est appliqué.
  const cfg = { plan: { baseImage: "data/x.png" },
                icons: { salle: unBuiltin, perso: "icon/moncustom.png", default: "lib/leaflet/images/marker-icon.png" } };
  const out = w.resolveServerPaths(cfg, "data/toto");
  t("🩸 resolveServerPaths PARCOURT bien config.icons (il ne le faisait pas du tout)",
    out.icons.perso === "data/toto/icon/moncustom.png" &&
    out.icons.salle === unBuiltin &&
    out.icons.default === "lib/leaflet/images/marker-icon.png");
}

console.log(ko === 0 ? "\n🎉 tuilage : un plan V2 tuile toujours, et un plan serveur trouve ses tuiles"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
