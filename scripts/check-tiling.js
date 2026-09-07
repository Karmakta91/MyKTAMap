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

// 🩸 STRIPPER LIGNE À LIGNE, JAMAIS INLINE — « le mangeur de blocs », 2e round.
// La version précédente faisait `.replace(/\/\*[\s\S]*?\*\//g, " ")`. Or un
// `/*` peut apparaître AILLEURS que dans un commentaire : dans une chaîne
// (`accept="image/*"`), dans un chemin cité (`data/**`), dans une regex. Le
// non-greedy avalait alors tout jusqu'au `*/` suivant — MESURÉ : de 28 % à
// 88 % du fichier détruit selon les cas (main.js : 98 986 → 12 170 octets).
// 🩸 Le danger n'était pas les faux rouges, qui se voient : c'étaient les
// assertions de la forme « X n'est PAS présent », vraies par accident dès que
// la zone avait été mangée. Le même piège est documenté dans README.md pour
// check-i18n (« le mangeur de blocs »), et je l'ai réintroduit ici.
// On ne retire donc QUE des lignes ENTIÈRES de commentaire : un `/*` au milieu
// d'une ligne de code est laissé tel quel, il ne peut plus rien avaler.
function sansCommentaires(src) {
  const nl = src.indexOf("\r\n") >= 0 ? "\r\n" : "\n";
  const out = [];
  let dansBloc = false, dansHtml = false;
  src.split(/\r?\n/).forEach(function (l) {
    const t = l.trim();
    if (dansBloc) { if (t.indexOf("*/") >= 0) dansBloc = false; out.push(""); return; }
    if (dansHtml) { if (t.indexOf("-->") >= 0) dansHtml = false; out.push(""); return; }
    if (t.indexOf("//") === 0) { out.push(""); return; }
    if (t.indexOf("/*") === 0) { if (t.indexOf("*/") < 0) dansBloc = true; out.push(""); return; }
    if (t.indexOf("<!--") === 0) { if (t.indexOf("-->") < 0) dansHtml = true; out.push(""); return; }
    out.push(l);
  });
  return out.join(nl);
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
// 🩸 v1.88.3 : le runtime NE calcule plus la racine — il la REÇOIT, sondée,
// de chargerImage. L'ancienne assertion visait `const RACINE_SRV =
// ktaRacineTuilesServeur(` et est devenue fausse par le refactor lui-même.
// Le §16 couvre désormais la chaîne complète ; ici on garde le repli.
t("🩸 le runtime garde un repli synchrone si la sonde n'a rien donné",
  /const RACINE_SRV = racineSrv \|\| ktaRacineTuilesServeur\(/.test(CODE));
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
      // 🩸 v1.88.4 : un nom NU vient du dossier `data/` du ZIP — c est la mise
      // en page de toute archive produite par l app. Rattrape les plans SIG
      // deja deployes, dont le plan-config omet le prefixe.
      ["sig.json",                "data/toto", "data/toto/data/sig.json",   "🩸 nom NU (import SIG) : sous data/"],
      ["baseImage.png",           "data/toto", "data/toto/data/baseImage.png", "🩸 idem pour l image"],
      // 🩸 Epingle la BORNE de la regle : seuls les noms NUS passent par
      // `data/`. Sans ce cas, remplacer la condition par `true` ne se voyait
      // pas -- aucun chemin relatif AVEC dossier n etait teste.
      ["sous/x.json",             "data/toto", "data/toto/sous/x.json",      "relatif AVEC dossier : pas de data/ injecte"],
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


// ───────── 12. 🔢 LA VERSION D'UN PLAN SERVEUR NE PING-PONG PLUS ─────────
// 🩸 VÉCU : `index.json` et `plan-config.json` portent tous deux un champ
// `version`, et ils DIVERGENT déjà dans ce repo — l'index dit « V1 », le
// plan-config du plan de test dit « V2 ». Or `addOrUpdate` fait un
// Object.assign : au boot on écrivait celle de l'index, au chargement celle du
// plan-config, au boot suivant on revenait à la première. La ligne « Version »
// de la fiche ℹ️ Infos changeait donc selon la dernière action.
// Pire : `entry.version || null` écrivait NULL quand l'index omet le champ —
// la version connue était EFFACÉE à chaque démarrage.
// Règle : le plan-config fait autorité (il est DANS le plan) ; l'index n'est
// qu'un indice utile avant le premier chargement.
{
  const MAIN = sansCommentaires(fs.readFileSync("js/main.js", "utf8"));
  t("🩸 la découverte n'écrit plus la version inconditionnellement",
    MAIN.indexOf("version: version,") < 0);
  t("🩸 …et jamais NULL (l'index qui omet le champ n'efface plus rien)",
    /if \(version && !\(_dejaLa && _dejaLa\.versionSrc === "plan"\)\)/.test(MAIN));
  t("🔢 l'origine de la version est tracée",
    MAIN.indexOf("versionSrc = \"index\"") >= 0 && MAIN.indexOf("versionSrc: window.PLAN_CONFIG.plan.version") >= 0);
  t("🔢 le plan-config fait autorité : une version d'origine « plan » n'est pas écrasée",
    MAIN.indexOf("_dejaLa.versionSrc === \"plan\"") >= 0);
  // ⚠️ Le désaccord de données lui-même n'est PAS une erreur : `index.json` est
  // rempli à la main par le déployeur. Ce qui était faux, c'est que l'app en
  // faisait une source d'autorité alternée.
  t("📄 le repo montre bien les deux sources qui divergent (le cas qui a servi de preuve)",
    (function () {
      try {
        const idx = JSON.parse(fs.readFileSync("data/index.json", "utf8"));
        const pc  = JSON.parse(fs.readFileSync("data/test/plan-config.json", "utf8"));
        const e   = (idx.plans || []).find(function (x) { return x && x.id === "test"; });
        return !!e && !!pc.plan && e.version !== pc.plan.version;
      } catch (err) { return false; }
    })());
}


// ───────── 13. 🩸 ON APPELLE setLoaderPerfPreset (ReferenceError = invisible pour node -c) ─────────
// VÉCU (v1.88.1) : en repliant le bloc de tuilage, j'ai ajouté à la fin de
// `setLoaderPerfPreset` un accès à `meta` — variable déclarée DANS le
// `if (descEl) { … }` juste au-dessus. Hors portée : ReferenceError au premier
// appel, donc tout le bloc perf du HOME cassé. `node -c` ne voit RIEN de ça,
// et aucune assertion de chaîne non plus. La seule façon de l'attraper est
// d'EXÉCUTER la fonction.
// On extrait le morceau de script inline dont elle dépend (`_PERF_VALID` …
// fin de la fonction), on le charge dans un vm avec des stubs DOM, et on
// l'appelle sur chaque preset proposé.
{
  const vm3 = require("vm");
  const d = IDX.indexOf("const _PERF_VALID");
  const iFn = IDX.indexOf("function setLoaderPerfPreset(", d);
  let fin = -1;
  if (iFn > 0) {
    let prof = 0;
    for (let k = IDX.indexOf("{", iFn); k < IDX.length; k++) {
      if (IDX[k] === "{") prof++;
      else if (IDX[k] === "}") { prof--; if (prof === 0) { fin = k + 1; break; } }
    }
  }
  t("le bloc setLoaderPerfPreset est extractible d'index.html", d >= 0 && iFn > d && fin > iFn);

  if (fin > iFn) {
    const faits = [];
    const elem = function (id) {
      return { id: id, textContent: "", style: {}, dataset: {}, classList: { toggle: function () {} },
               setAttribute: function () {}, forEach: function () {} };
    };
    const resume = elem("loaderPerfResume");
    const win = {
      console: { log: () => {}, warn: () => {} },
      PERF_AUTO_META: { label: "Auto", description: "d1" },
      PERF_OFF_META:  { label: "Désactivé", description: "d2" },
      PERF_PRESETS:   { balanced: { label: "Équilibré", description: "d3" } },
      I18n: { has: function () { return false; }, t: function (k) { return k; } },
      APP_CONFIG: { debugMode: false }
    };
    win.window = win;
    win.document = {
      getElementById: function (id) { return id === "loaderPerfResume" ? resume : elem(id); },
      querySelector:    function () { return null; },
      querySelectorAll: function () { return { forEach: function () {} }; }
    };
    let erreur = null;
    try {
      const ctx = vm3.createContext(win);
      vm3.runInContext("var window = this; var document = this.document;" +
                       "function updatePerfDebugLine(){}" +
                       IDX.slice(d, fin) +
                       ";this.__set = setLoaderPerfPreset;", ctx);
      ["auto", "off"].forEach(function (p) { win.__set(p); faits.push(resume.textContent); });
    } catch (e) { erreur = e; }

    t("🩸 setLoaderPerfPreset s'EXÉCUTE sans ReferenceError" + (erreur ? " — " + erreur.message : ""),
      !erreur);
    t("🖼️ le résumé du bloc replié porte la valeur courante  [" + faits.join(" / ") + "]",
      faits.length === 2 && faits[0] === "Auto" && faits[1] === "Désactivé");
  }
}

// ───────── 14. 🖼️ LE BLOC DE TUILAGE NE DOIT PLUS FAIRE DÉBORDER LA COLONNE ─────────
// 🩸 Posé déplié en v1.86.0, il ajoutait ~207 px à la colonne Actions — dont
// le min-content mesuré en v1.79.0 vaut ~510 px, sous un plancher de grid de
// 520 px. À 125 % de zoom (viewport 1229×691) la colonne débordait sur le
// footer : le bug « des % qui cassent le home », déjà clos en v1.60.x.
{
  const CSS = fs.readFileSync("css/style.css", "utf8");
  t("🖼️ le bloc est repliable (details/summary)",
    IDX.indexOf('<details class="kta-perf-details"') >= 0 &&
    IDX.indexOf('class="kta-perf-summary"') >= 0);
  t("🩸 …et REPLIÉ par défaut (pas d'attribut open)",
    /<details class="kta-perf-details" id="loaderPerfDetails">/.test(IDX));
  t("🖼️ la valeur courante reste lisible sans déplier",
    IDX.indexOf('id="loaderPerfResume"') >= 0);
  t("🩸 FILET : la colonne Actions peut scroller en interne (robuste à la PROCHAINE addition)",
    /\.loader-col-actions #panelZip \{[\s\S]{0,200}overflow-y: auto;/.test(CSS));
}


// ───────── 15. 🧹 LES PLANS SERVEUR DISPARUS SONT ÉLAGUÉS ─────────
// 🩸 VÉCU (KARMA) : « un plan serveur est embarqué dans l'export profil et
// affiché même s'il n'est plus présent côté serveur ; si je reset full, la
// liste remonte ». La découverte ne faisait QUE des `addOrUpdate` : rien ne
// retirait jamais une entrée. Un plan sorti de `index.json` restait donc dans
// le registre (localStorage), s'affichait dans « Mes plans », et partait dans
// l'export de profil — polluant l'instance d'en face.
// 🍖 Corriger la SOURCE suffit : l'export reste inchangé, car une entrée
// périmée importée ailleurs sera élaguée au premier boot de cette instance.
{
  const MAIN2 = sansCommentaires(fs.readFileSync("js/main.js", "utf8"));
  t("🧹 les ids vus dans l'index sont collectés", /const vus = \[\];/.test(MAIN2) && /vus\.push\(id\);/.test(MAIN2));
  t("🧹 les entrées absentes de l'index sont retirées du registre",
    /PlanRegistry\.remove\(p\.id\)/.test(MAIN2));
  t("🩸 …UNIQUEMENT les plans SERVEUR auto-découverts (un plan local n'est jamais touché)",
    /p\.type === "server" && p\.discovered === true/.test(MAIN2));
  t("🛟 l'élagage est APRÈS la boucle, donc après un fetch d'index réussi",
    MAIN2.indexOf("vus.push(id)") < MAIN2.indexOf("PlanRegistry.remove(p.id)"));
  t("🩸 les données associées ne sont PAS purgées (sessions, photos, géoréf)",
    (function () {
      const i = MAIN2.indexOf("const connus = new Set(vus)");
      const j = MAIN2.indexOf("catch", i);
      return i >= 0 && j > i && MAIN2.slice(i, j).indexOf("purgeAssociatedData") < 0;
    })());
  t("🔄 index.json est demandé en `no-store` (le SW ne contrôle pas toujours l'onglet)",
    /fetch\("data\/index\.json", \{ cache: "no-store" \}\)/.test(MAIN2));
}


// ───────── 16. 🧱 LA RACINE DES TUILES EST SONDÉE, PAS DEVINÉE ─────────
// 🩸 VÉCU (KARMA) : « il va chercher les tuiles ici
// dev.myktamap.fr/data/plan_jean_may_from_v2.zip-d/tiles/… hors le dossier
// tiles est dans un dossier data. Sur certains plans ça fonctionne bien. »
// La v1.86.0 dérivait la racine du dossier du `baseImage`. Or le générateur
// écrit TOUJOURS les tuiles dans `zip.folder("data").folder("tiles")`, tandis
// que l'emplacement de l'IMAGE, lui, dépend de la recette de déploiement :
// avant la v1.86.1 il fallait réécrire les chemins à la main, ce qui remontait
// souvent l'image d'un cran sans toucher aux tuiles. D'où « certains oui,
// d'autres non » — le ZIP est le même, le déploiement non.
{
  const vm6 = require("vm");
  const d = CODE.indexOf("function ktaCandidatsRacineTuiles");
  const f = CODE.indexOf("\n}", CODE.indexOf("return out;", d)) + 2;
  t("les candidats sont extractibles", d >= 0 && f > d);
  let cands = null;
  try { cands = vm6.runInNewContext("(" + CODE.slice(d, f) + ")"); } catch (e) { /* noop */ }
  t("🧱 la fonction des candidats s'exécute", typeof cands === "function");

  if (typeof cands === "function") {
    const pc = { _baseDir: "data/mon-plan",
                 plan: { baseImage: "data/mon-plan/plan.png" },
                 tiling: { maxNativeZoom: 0 } };
    const l = cands(pc);
    // 🩸 LE CAS KARMA : image remontée à la racine du plan, tuiles restées
    // dans `data/`. Le 1er candidat doit être celui du GÉNÉRATEUR.
    t("🩸 1er candidat = la mise en page du générateur  [" + l[0] + "]",
      l[0] === "data/mon-plan/data/tiles");
    t("🧱 le voisinage de l'image reste proposé en secours", l.indexOf("data/mon-plan/tiles") > 0);
    // Surcharge explicite : elle passe devant tout.
    const l2 = cands({ _baseDir: "data/mon-plan", plan: { baseImage: "data/mon-plan/plan.png" },
                       tiling: { tilesDir: "autre/part/tiles" } });
    t("🧱 `tiling.tilesDir` gagne toujours", l2[0] === "autre/part/tiles");
    // Plan LOCAL : rien à sonder, tout vient de RUNTIME_ASSETS.
    t("🩸 plan LOCAL (blob:) → aucun candidat",
      cands({ _baseDir: "x", plan: { baseImage: "blob:http://x/a" }, tiling: {} }).length === 0);
  }

  t("🧱 la racine est SONDÉE avant le rendu (une tuile témoin par candidat)",
    /async function ktaResoudreRacineTuiles/.test(CODE) &&
    CODE.indexOf("_urlTuileTemoin") >= 0 &&
    /const _racine = await ktaResoudreRacineTuiles\(pc\);/.test(CODE));
  t("🩸 le runtime V2 REÇOIT la racine, il ne la recalcule plus",
    /_chargerImageV2OptionB\(url, bounds, map, pc\.tiling, _racine\)/.test(CODE));
  t("🛟 aucune sonde n'aboutit → on retombe sur le 1er candidat (comportement d'avant)",
    /Aucune racine de tuiles ne répond/.test(TIL));
  t("🧱 le dossier du plan est connu du runtime (`_baseDir`)",
    sansCommentaires(fs.readFileSync("js/config.js", "utf8")).indexOf("config._baseDir = baseDir") >= 0);
}


// ───────── 17. 🩸 LES IMPORTATEURS DÉCLARENT LEURS FICHIERS AVEC `data/` ─────────
// VÉCU (KARMA, diagnostic console sur 18 plans servis) : ses plans issus d'un
// import SIG (`*_from_v2`) donnaient 404 sur l'image ET le calque, ceux du
// Générateur passaient. Cause : `sigImport`, `gpxImport` et `kmzImport`
// ÉCRIVAIENT le fichier dans `data/` du ZIP mais le DÉCLARAIENT sans préfixe
// dans le plan-config.
// 🩸 POURQUOI ÇA A SURVÉCU SI LONGTEMPS : en import LOCAL, `findMatchingFile`
// retrouve l'asset par son NOM DE BASE — l'incohérence était donc invisible.
// Seul le mode serveur, où la résolution est stricte, la révèle.
// ⚠️ `kmzImport` avait déjà corrigé ce motif pour ses CALQUES en v1.21.0-fix5,
// jamais pour son `baseImage` : la moitié d'une leçon.
{
  const PROD = [["js/sigImport.js", 2], ["js/gpxImport.js", 1], ["js/kmzImport.js", 1]];
  PROD.forEach(function (r) {
    const src = sansCommentaires(fs.readFileSync(r[0], "utf8"));
    const nus = (src.match(/baseImage:\s*"?baseImage\.png"?,|baseImage:\s*baseFilename,/g) || []);
    t("🩸 " + r[0] + " : plus de `baseImage` sans préfixe `data/`", nus.length === 0);
    t("🩸 " + r[0] + " : le fichier est ÉCRIT dans `data/` du ZIP",
      /zip\.file\("data\//.test(src));
  });
  t("🩸 sigImport déclare son calque en `data/sig.json`",
    sansCommentaires(fs.readFileSync("js/sigImport.js", "utf8")).indexOf('file: "data/sig.json"') >= 0);
  // Le Générateur, lui, a toujours été correct — on le VÉRIFIE, sinon une
  // régression future y passerait inaperçue.
  t("✅ le Générateur préfixe déjà (référence)",
    sansCommentaires(fs.readFileSync("js/createConf.js", "utf8")).indexOf('file: "data/" + fileName') >= 0);
}


// ───────── 18. 🌐 LA VUE OSM DU HOME SAIT LIRE UN PLAN SERVEUR ─────────
// 🩸 VÉCU (KARMA, console) : « [OsmHomePreview] ZIP non récupérable pour
// planId=server_plan_carmelet_v2 (FS handle absent + IDB blob purgé) ».
// `_loadPlanDataForPreview` passait EXCLUSIVEMENT par le ZIP
// (`PlanRegistry.getHandle()` / `getBlob()`) — qu'un plan serveur n'a ni l'un
// ni l'autre. Le widget ne rendait donc aucun calque. Ce n'était pas une
// régression : ce module n'avait AUCUN chemin HTTP.
// ⚠️ On EXÉCUTE le chargeur. Les trois fautes du jour (deux zones mortes
// temporelles, une ReferenceError) n'ont été attrapées que comme ça.
async function _osmServeur() {
  const vm7 = require("vm");
  const OHP = fs.readFileSync("js/osmHomePreview.js", "utf8");
  const OHPC = sansCommentaires(OHP);
  const d = OHP.indexOf("async function _loadPlanDataServeur(plan) {");
  let f = -1;
  if (d >= 0) {
    let prof = 0;
    for (let k = OHP.indexOf("{", d); k < OHP.length; k++) {
      if (OHP[k] === "{") prof++;
      else if (OHP[k] === "}") { prof--; if (prof === 0) { f = k + 1; break; } }
    }
  }
  t("🌐 le chargeur serveur est extractible", d >= 0 && f > d);
  t("🩸 il est BRANCHÉ sur le type de plan, AVANT la voie ZIP",
    (function () {
      // 🩸 Borner au CORPS de `_loadPlanDataForPreview` : chercher
      // `_getPlanZipFile(planId)` dans tout le fichier tombait sur sa
      // DÉFINITION, située plus haut — l'assertion rougissait sur du code sain.
      const i = OHPC.indexOf("async function _loadPlanDataForPreview(planId)");
      if (i < 0) return false;
      const j = OHPC.indexOf("const file = await _getPlanZipFile(planId);", i);
      if (j < 0) return false;
      const corps = OHPC.slice(i, j);
      return corps.indexOf("_plan.type === \"server\"") >= 0 &&
             corps.indexOf("await _loadPlanDataServeur(_plan)") >= 0;
    })());
  if (f <= d) return;

  const win = { console: { log: function () {}, warn: function () {} } };
  win.window = win;
  const sondes = [];
  win.fetch = async function (u) {
    sondes.push(String(u));
    if (String(u).indexOf("plan-config.json") >= 0) {
      return { ok: true, status: 200, json: async function () { return {
        plan: { baseImage: "img.png", tiledV2: true, imageWidth: 1024, imageHeight: 1024 },
        tiling: { tileSize: 512, minNativeZoom: -3, maxNativeZoom: 0 },
        dataLayers: [{ id: "sig", label: "SIG", file: "sig.json" }],
        icons: { salle: "icon/house.png", perso: "data/p/icon/x.png" }
      }; } };
    }
    return { ok: true, status: 200, json: async function () {
      return { data: [{ x: 1, y: 2 }], roads: [{ id: "r" }], zones: [] }; } };
  };
  // Mêmes helpers qu'au runtime : la résolution des chemins et la racine des
  // tuiles SONDÉE. Les stuber ici garantit qu'on teste le chargeur, pas eux.
  win.resolveServerPaths = function (c, dir) {
    if (c.plan && c.plan.baseImage) c.plan.baseImage = dir + "/data/" + c.plan.baseImage;
    (c.dataLayers || []).forEach(function (l) { if (l.file) l.file = dir + "/data/" + l.file; });
    return c;
  };
  win.ktaResoudreRacineTuiles = async function () { return "data/p/data/tiles"; };
  win.ktaTileExt = function () { return "jpg"; };

  let res = null, err = null;
  try {
    const ctx = vm7.createContext(win);
    vm7.runInContext("var window = this; var fetch = this.fetch; var console = this.console;" +
                     "function _chooseTileLevelForHome(){ return -2; }" +
                     OHP.slice(d, f) + ";this.__load = _loadPlanDataServeur;", ctx);
    res = await win.__load({ id: "p1", path: "data/p" });
  } catch (e) { err = e; }

  t("🩸 le chargeur serveur s'EXÉCUTE sans erreur" + (err ? " — " + err.message : ""), !err);
  if (!res) { t("🌐 il rend des données", false); return; }
  t("🌐 les calques sont lus en HTTP (plus de « ZIP non récupérable »)",
    res.dataLayers.length === 1 && res.dataLayers[0].points.length === 1 &&
    res.dataLayers[0].roads.length === 1);
  t("🌐 les chemins passent par la MÊME résolution qu'au chargement réel",
    sondes.indexOf("data/p/data/sig.json") >= 0);
  t("🧱 l'aperçu tuilé utilise la racine SONDÉE",
    !!res.tilesOverview && res.tilesOverview.tiles.length > 0 &&
    res.tilesOverview.tiles[0].url.indexOf("data/p/data/tiles/z-2/") === 0);
  t("🎨 les icônes sont reprises telles quelles (rien à extraire en HTTP)",
    res.iconUrls.salle === "icon/house.png" && res.iconUrls.perso === "data/p/icon/x.png");
  t("🛟 aucune blob URL créée côté serveur (rien à révoquer, donc rien à fuir)",
    OHP.slice(d, f).indexOf("createObjectURL") < 0);
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
}).then(_osmServeur).then(function () {
  console.log(ko === 0 ? "\n🎉 tuilage : un plan V2 tuile toujours, et un plan serveur trouve ses tuiles"
                       : "\n⚠️ " + ko + " echec(s)");
  process.exit(ko === 0 ? 0 : 1);
});