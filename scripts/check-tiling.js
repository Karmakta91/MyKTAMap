#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-tiling.js — garde-fou pré-commit BLOQUANT du tuilage (js/tiling.js, config.js, main.js…)
// =====================================================================
// Règle (décision produit) : un plan V2 tuile TOUJOURS ; l'image complète reste dans le ZIP pour le
// dézip manuel mais n'est pas affichée.
// 🩸 Pièges couverts :
//   - sur un plan V2 la branche tuiles passe avant les presets : un preset n'y change rien ;
//   - `auto` (le défaut) doit trancher sur la SURFACE (4096²), pas sur le poids : un JPEG de 100 Mpx
//     pèse ~15 Mo et ferait une texture géante (crash Safari iOS) ;
//   - un plan V2 servi en HTTP n'a rien dans RUNTIME_ASSETS : ses tuiles se résolvent en HTTP, sinon
//     carte blanche.
// Plusieurs contrôles CHARGENT le module dans un vm et l'exécutent : une assertion de chaîne ne voit
// pas une régression de logique. Doc : docs/TILING.md.
// =====================================================================
"use strict";

const fs = require("fs");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const TIL = fs.readFileSync("js/tiling.js", "utf8");
const IDX = fs.readFileSync("index.html", "utf8");

// 🩸 « Le mangeur de blocs » : retirer les commentaires LIGNE À LIGNE, jamais par regex
// `/\/\*[\s\S]*?\*\//`. Un `/*` hors commentaire (chaîne `image/*`, chemin `data/**`, regex) ferait
// avaler tout jusqu'au `*/` suivant (jusqu'à 88 % d'un fichier), et les assertions « X n'est PAS
// présent » deviendraient vraies par accident. Seules les lignes ENTIÈRES de commentaire partent.
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

// Extrait le bloc `if (preset === "off")` SITUÉ DANS la branche V2, par appariement d'accolades.
// 🩸 Une tranche « du test tiledV2 à l'appel du runtime » finit sur le `return` du dispatch : faux rouge.
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
  // Le détournement = un `imageOverlay` suivi d'un `return` dans ce bloc.
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
// 🩸 Une seule fonction TOP-LEVEL, partagée avec le pré-cache hors-ligne : deux copies divergeraient
// et donneraient un plan « téléchargé » mais troué.
t("🌐 la racine des tuiles serveur est une fonction PARTAGÉE",
  /function ktaRacineTuilesServeur\(pc\)/.test(CODE));
// Le runtime REÇOIT la racine sondée de chargerImage (chaîne complète : §16) ; ici, le repli.
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
  // 🩸 RACINE_SRV doit être la CONDITION du ternaire : sa simple présence laisse passer
  // `return null ? RACINE_SRV + … : null`.
  /return RACINE_SRV\s*[\r\n]\s*\? RACINE_SRV \+/.test(CODE) && /if \(!asset\) \{/.test(CODE));

// ───────── 4. le repli est une RÉCUPÉRATION, pas un mode ─────────
t("🩸 un repli baseImage existe quand aucune tuile n'est exploitable",
  /function _repliBaseImage\(/.test(CODE));
t("il ne se déclenche qu'une seule fois par chargement",
  /if \(state\.repliFait\) return;[\s\S]{0,80}state\.repliFait = true;/.test(CODE));
// Une tuile hors écran est RÉSOLUE mais différée : « aucune résolue » compte posées + différées,
// sinon un plan zoomé loin de tout déclenche le repli à tort.
t("déclencheur 1 : aucune tuile résolue (ni posée ni différée)",
  /const resolues = added \+ differees;[\s\S]{0,40}if \(resolues === 0 && missing > 0\)[\s\S]{0,60}_repliBaseImage/.test(CODE));
// 🩸 En mode serveur une URL HTTP « résout » toujours, même en 404 : sans ce second déclencheur,
// un déploiement raté donne une carte blanche muette.
t("🩸 déclencheur 2 : toutes les tuiles du premier rendu en ERREUR de chargement",
  /overlay\.on\("error"/.test(CODE) && CODE.indexOf("state.erreursPremier") >= 0);
t("le premier rendu est capturé AVANT la boucle (currentLevel est réaffecté après)",
  /const premierRendu = \(state\.currentLevel === null\);/.test(CODE));

// ───────── 5. LE SEUL POINT DE RÉGLAGE DU TUILAGE ─────────
// Pas de sélecteur au HOME : auto par défaut (décision produit). Le réglage vit dans la fiche Infos,
// mémorisé par plan, et seulement pour un plan non V2 (sur un V2 il ne changerait rien).
{
  const HL = fs.readFileSync("js/homeLoader.js", "utf8");
  t("🩸 plus aucun sélecteur de preset au HOME",
    (IDXC.match(/data-preset=/g) || []).length === 0);
  t("🖼️ le réglage vit dans ℹ️ Infos, et nulle part ailleurs",
    HL.indexOf('id="kta-plan-tiling-select"') >= 0);
  t("🩸 …et SEULEMENT pour un plan non tuilé V2 (sinon : un interrupteur débranché)",
    /if \(plan\.tiledV2 !== true\) \{/.test(HL));
  const opts = (HL.match(/<option value="([a-z]+)"/g) || []).map(function (x) { return x.split('"')[1]; });
  t("🖼️ il propose exactement Auto et Désactivé  [" + opts.join(", ") + "]",
    opts.length === 2 && opts[0] === "auto" && opts[1] === "off");
  t("🖼️ et il est MÉMORISÉ pour ce plan (l'ancien repartait à zéro à chaque démarrage)",
    /PlanRegistry\.setPerfPreset\(plan\.id, selTuilage\.value\)/.test(HL));
  // 🩸 Rétro-compat : un registre peut contenir « quality » ; le refuser invalide le preset stocké.
  ["js/main.js", "js/planRegistry.js"].forEach(function (f) {
    t("rétro-compat : " + f + " accepte toujours les 5 valeurs historiques",
      /"off", "auto", "quality", "balanced", "performance"/.test(fs.readFileSync(f, "utf8")));
  });
  t("rétro-compat : resoudrePerfPreset sait toujours traiter les presets explicites",
    CODE.indexOf("PERF_PRESETS[p]") >= 0);
}

// ───────── 6. le chemin des tuiles ZIP n'est écrit qu'une fois ─────────
t("le chemin d'une tuile ZIP a UN seul point de vérité (_cheminTuileZipExt)",
  /function _cheminTuileZipExt\(/.test(CODE) &&
  (CODE.match(/"data\/tiles\/z"/g) || []).length === 1);

// ───────── 7. « off » sur un gros plan V1 est annoncé ─────────
t("⚠️ « off » sur une image > 4096² avertit l'utilisateur",
  /preset === "off" && \(W \* H\) > TUILING_NECESSAIRE_PIXELS/.test(CODE));


// ───────── 9. DÉPLOIEMENT SERVEUR : ON EXÉCUTE, ON NE DEVINE PAS ─────────
// 🩸 Contrat : un ZIP dézippé tel quel dans `data/<plan>/` doit marcher. Le plan-config écrit les
// chemins du ZIP (`data/MonPlan.png`) ; rendus TELS QUELS ils se résolvent à la racine du site (404).
// On CHARGE config.js dans un vm et on APPELLE resolveServerPath.
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
      // Dézip brut du ZIP dans data/toto/
      ["data/MonPlan.png",       "data/toto", "data/toto/data/MonPlan.png", "🩸 dézip brut : le chemin du ZIP est préfixé"],
      ["data/tiles/z0/x0_y-1.jpg","data/toto", "data/toto/data/tiles/z0/x0_y-1.jpg", "🩸 les tuiles suivent le même chemin"],
      // RÉTRO-COMPAT : déploiement réécrit à la main (data/test)
      ["data/test/TestMAP.png",   "data/test", "data/test/TestMAP.png",      "🩸 déploiement déjà préfixé : INCHANGÉ"],
      ["data/test/puits.json",    "data/test", "data/test/puits.json",       "…y compris les calques de données"],
      // Ce qui ne doit jamais bouger
      ["icon/house.png",          "data/toto", "icon/house.png",             "icon/ reste à la racine (icônes de l'app)"],
      ["https://x/y.png",         "data/toto", "https://x/y.png",            "URL absolue intacte"],
      ["/racine.png",             "data/toto", "/racine.png",                "chemin absolu intact"],
      // 🩸 Un nom NU vient du dossier `data/` du ZIP (plans SIG déjà déployés sans préfixe).
      ["sig.json",               "data/toto", "data/toto/data/sig.json",   "🩸 nom NU (import SIG) : sous data/"],
      ["baseImage.png",           "data/toto", "data/toto/data/baseImage.png", "🩸 idem pour l image"],
      // 🩸 Borne de la règle : seuls les noms NUS passent par `data/` (sinon une condition `true` passe).
      ["sous/x.json",             "data/toto", "data/toto/sous/x.json",      "relatif AVEC dossier : pas de data/ injecte"],
    ];
    cas.forEach(function (c) {
      const got = f(c[0], c[1]);
      t(c[3] + "  [" + c[0] + " @ " + c[1] + " → " + got + "]", got === c[2]);
    });
  }
}


// ───────── 10. ICÔNES : ON SONDE, ON NE DEVINE PAS ─────────
// 🩸 Une icône `icon/…` d'un plan servi n'est réécrite vers le dossier du plan que si le serveur
// l'y trouve. Aucun catalogue ne liste toutes les icônes de l'app (`TAGS_BUILTIN` = tags de POI ;
// `icon/iconetrack.png` n'y est pas) : un critère fondé sur une liste envoie ces icônes en 404.
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


// ───────── 12. LA VERSION D'UN PLAN SERVEUR NE PING-PONG PAS ─────────
// 🩸 `index.json` et `plan-config.json` portent chacun un `version`, qui peuvent diverger ;
// `addOrUpdate` fait un Object.assign. Règle : le plan-config fait autorité (il est DANS le plan),
// l'index n'est qu'un indice avant le premier chargement, et un champ absent n'écrit jamais NULL.
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
  // ⚠️ Le désaccord de données n'est PAS une erreur (`index.json` est rempli à la main) : c'est le cas de preuve.
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


// ───────── 13. 🩸 LES DEUX FONCTIONS DE PRESET S'EXÉCUTENT ─────────
// main.js appelle setLoaderPerfPreset au changement de langue, homeLoader.js lit getLoaderPerfPreset
// à chaque chargement. On les EXÉCUTE : une variable hors portée (ReferenceError au premier appel)
// échappe à `node -c`. « auto » doit être constant, sinon on ne retombe plus sur le preset du plan.
{
  const vm3 = require("vm");
  const BOOT = fs.readFileSync("js/homeDemarrage.js", "utf8");
  const d = BOOT.indexOf("function getLoaderPerfPreset()");
  const f = BOOT.indexOf("window.setLoaderPerfPreset = setLoaderPerfPreset;", d);
  t("le bloc des deux fonctions est extractible de js/homeDemarrage.js", d >= 0 && f > d);
  if (d >= 0 && f > d) {
    const win = { console: { log: () => {}, warn: () => {} } };
    win.window = win;
    let erreur = null, vus = [];
    try {
      const ctx = vm3.createContext(win);
      // 🩸 Couper EXACTEMENT après l'ancre : une marge arbitraire emporte du code suivant (regex tronquée).
      const ANC = "window.setLoaderPerfPreset = setLoaderPerfPreset;";
      vm3.runInContext("var window = this;" + BOOT.slice(d, f + ANC.length), ctx);
      vus = [win.getLoaderPerfPreset(), win.getLoaderPerfPreset("off")];
      win.setLoaderPerfPreset("off");   // no-op : ne doit rien jeter
    } catch (e) { erreur = e; }
    t("🩸 les deux fonctions s'EXÉCUTENT sans ReferenceError" + (erreur ? " — " + erreur.message : ""),
      !erreur);
    t("🖼️ getLoaderPerfPreset vaut « auto », quoi qu'on lui passe  [" + vus.join(", ") + "]",
      vus.length === 2 && vus[0] === "auto" && vus[1] === "auto");
  }
}

// ───────── 14. LA COLONNE ACTIONS NE DOIT PAS DÉBORDER ─────────
// 🩸 Son min-content frôle le plancher de la grid : à 125 % de zoom, tout ajout la fait déborder
// sur le footer. Le filet (scroll interne) protège la PROCHAINE addition.
{
  const CSS = fs.readFileSync("css/style.css", "utf8");
  t("🩸 FILET : la colonne Actions peut scroller en interne (robuste à la PROCHAINE addition)",
    /\.loader-col-actions #panelZip \{[\s\S]{0,200}overflow-y: auto;/.test(CSS));
}

// ───────── 15. LES PLANS SERVEUR DISPARUS SONT ÉLAGUÉS ─────────
// 🩸 Sans élagage, un plan sorti de `index.json` reste au registre, dans « Mes plans » et dans
// l'export de profil. L'export n'a pas besoin de filtre : une entrée périmée importée ailleurs
// est élaguée au premier boot de l'autre instance.
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


// ───────── 16. LA RACINE DES TUILES EST SONDÉE, PAS DEVINÉE ─────────
// 🩸 Le générateur écrit TOUJOURS les tuiles dans `data/tiles` du ZIP, mais l'emplacement de l'IMAGE
// dépend du déploiement (souvent remontée d'un cran) : dériver la racine du `baseImage` marche sur
// certains plans et pas d'autres. On sonde une tuile témoin par candidat.
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
    // 🩸 Image remontée à la racine du plan, tuiles restées dans `data/` : 1er candidat = générateur.
    t("🩸 1er candidat = la mise en page du générateur  [" + l[0] + "]",
      l[0] === "data/mon-plan/data/tiles");
    t("🧱 le voisinage de l'image reste proposé en secours", l.indexOf("data/mon-plan/tiles") > 0);
    const l2 = cands({ _baseDir: "data/mon-plan", plan: { baseImage: "data/mon-plan/plan.png" },
                       tiling: { tilesDir: "autre/part/tiles" } });
    t("🧱 `tiling.tilesDir` gagne toujours", l2[0] === "autre/part/tiles");
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
// Un fichier écrit dans `data/` du ZIP doit être déclaré `data/…` dans le plan-config (image ET
// calques). 🩸 En import local `findMatchingFile` retrouve l'asset par son nom de base : l'oubli est
// invisible, seul le mode serveur (résolution stricte) le révèle en 404.
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
  t("✅ le Générateur préfixe déjà (référence)",
    sansCommentaires(fs.readFileSync("js/createConf.js", "utf8")).indexOf('file: "data/" + fileName') >= 0);
}


// ───────── 18. LA VUE OSM DU HOME SAIT LIRE UN PLAN SERVEUR ─────────
// 🩸 Un plan serveur n'a ni handle ni blob ZIP : sans chemin HTTP, le widget ne rend aucun calque
// (« ZIP non récupérable »). ⚠️ On EXÉCUTE le chargeur : zones mortes temporelles et
// ReferenceError ne se voient que comme ça.
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
      // 🩸 Borner au CORPS de `_loadPlanDataForPreview` : dans tout le fichier, on tombe sur la
      // DÉFINITION de `_getPlanZipFile`, plus haut (faux rouge).
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
  // Helpers du runtime stubés : on teste le chargeur, pas eux.
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

// ───────── 11. ON EXÉCUTE LE SONDEUR ─────────
// Icône de l'app absente du dossier du plan : NON réécrite ; icône perso présente : réécrite.
// 🩸 `async` obligatoire : un throw synchrone de `vm.runInContext` sortirait du Promise.all et
// ferait planter le script au lieu de l'annoncer en échec.
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

// ───────── 20. OPACITÉ DU PLAN SUR UN CALQUE ─────────
// 🩸 Opacité posée TUILE PAR TUILE = des tuiles superposées (vue d'ensemble + tuiles nettes, ou deux
// niveaux après une course de rendu) s'additionnent en rectangle plus sombre. L'opacité vit sur le calque.
function _opaciteCalque() {
  const OV = fs.readFileSync("js/osmView.js", "utf8"), HP = fs.readFileSync("js/osmHomePreview.js", "utf8");
  t("🫥 Vue OSM : tuiles dans un pane dédié qui porte l'opacité (sous les tracés)",
    /const paneTuiles = _osmMap\.createPane\(PANE_TUILES\);/.test(OV) && /paneTuiles\.style\.zIndex = "350"/.test(OV) &&
    /pane: PANE_TUILES/.test(OV) && /if \(pane\) \{ pane\.style\.opacity = String\(_opacity\); return; \}/.test(OV));
  t("🩸 Vue OSM : un rendu de niveau dépassé pendant l'extraction ne pose rien (jeton), jamais 2 overlays par tuile",
    /const jeton = \+\+_rendusLances;/.test(OV) && /if \(jeton !== _rendusLances \|\| z !== _currentLevel \|\| !_osmMap\) return;/.test(OV) &&
    /if \(_tilesByPath\[t\.path\]\) continue;/.test(OV));   // le CODE seul, sans le commentaire de fin de ligne
  t("🫥 accueil : vue d'ensemble ET tuiles nettes dans le même sous-calque opaque du plan, opacité sur le calque",
    /const pTuiles = _paneTuiles\(paneNom, opacite\);/.test(HP) && /opacity: pTuiles \? 1 : opacite/.test(HP) &&
    /const pT   = pn \? _paneTuiles\(pn\.nom, op\) : null;/.test(HP) && /opacity: pT \? 1 : op/.test(HP) &&
    /parent\.insertBefore\(pane, parent\.firstChild\);/.test(HP) && !/pane\.style\.zIndex = "-1";/.test(HP));
  // 🩸 Pas de z-index négatif (Safari iOS le repeint derrière le fond OSM pendant le glissé) : le
  // sous-calque reste sous les tracés par l'ordre du DOM (premier enfant du calque du plan).
  t("🫥 accueil : les 3 réglages d'opacité passent par le calque (sinon la tuile se re-multiplie)",
    (HP.match(/_opaciteTuilesPlan\(/g) || []).length === 4);
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
  // 🩸 « def inchangé » ne prouve rien (un 404 le laisse identique) : on compte les SONDES.
  t("🎨 un chemin hors `icon/` n'est même pas SONDÉ (2 sondes, pas 3)",
    a.def === "lib/leaflet/images/marker-icon.png" && r[0].sondes.length === 2 &&
    r[0].sondes.every(function (u) { return u.indexOf("/icon/") >= 0; }));
  t("🛟 fail-safe : le réseau plante → tout reste à la racine", b.track === "icon/iconetrack.png");
}).catch(function (e) {
  t("§11 le sondeur s'exécute sans planter — " + (e && e.message), false);
}).then(_osmServeur).then(_lruZip).then(_regionTuiles).then(_fondExportTuiles).then(_opaciteCalque).then(function () {
  console.log(ko === 0 ? "\n🎉 tuilage : un plan V2 tuile toujours, et un plan serveur trouve ses tuiles"
                       : "\n⚠️ " + ko + " echec(s)");
  process.exit(ko === 0 ? 0 : 1);
});
// ───────── 17 bis. LRU DES TUILES : UN PLAN ZIP LIBÈRE DE LA MÉMOIRE ─────────
// 🩸 Le générateur produit EXACTEMENT 4 niveaux (-3…0) : MAX_CACHED_LEVELS à 4 sur desktop
// n'évince jamais rien. On charge tiling.js dans un vm (faux ZIP paresseux comme main.js, fausse
// carte), on visite les 4 niveaux : le premier doit être libéré (URL révoquée ET fichier rendu).
function _lruZip() {
  const vm17 = require("vm");
  const W = 4096, H = 4096, TS = 512;
  const assets = {};
  // Tuiles des niveaux -3…0 pour un plan de 4096 px (grille = W·2^z / 512).
  for (let z = -3; z <= 0; z++) {
    const n = Math.ceil(W * Math.pow(2, z) / TS);
    for (let k = 1; k <= n; k++) {
      for (let c = 0; c < n; c++) {
        const p = "data/tiles/z" + z + "/x" + c + "_y" + (-k) + ".jpg";
        assets[p] = { file: { taille: 1 }, _zipPath: p, lazy: true, url: null };
      }
    }
  }
  let zoom = -3, crees = 0, revoquees = 0;
  const handlers = {};
  const map = {
    getZoom: () => zoom,
    on: (ev, fn) => ev.split(" ").forEach(e => { (handlers[e] = handlers[e] || []).push(fn); }),
    off: () => {}, whenReady: fn => fn(), hasLayer: () => false, removeLayer: () => {},
    getBounds: () => ({ pad: () => ({ intersects: () => true }) })
  };
  const L = {
    imageOverlay: () => ({ on() {}, addTo() { return this; }, remove() {}, getBounds: () => ({}) }),
    latLngBounds: b => b
  };
  const win = {
    console: { log() {}, warn() {}, error() {} }, L: L, map: map,
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0) desktop", deviceMemory: 16 },
    URL: { createObjectURL: () => "blob:" + (++crees), revokeObjectURL: () => { revoquees++; } },
    requestAnimationFrame: fn => fn(), RUNTIME_ASSETS: assets, _ktaBaseLayers: [],
    PLAN_CONFIG: { plan: {} },
    _extractLazyAsset: p => { assets[p].file = { taille: 1 }; return Promise.resolve(assets[p]); }
  };
  win.window = win;
  const ctx = vm17.createContext(win);
  vm17.runInContext("var window = this; var navigator = this.navigator; var URL = this.URL;" +
                    "var requestAnimationFrame = this.requestAnimationFrame;" +
                    fs.readFileSync("js/tiling.js", "utf8"), ctx);
  const attendre = () => new Promise(r => setTimeout(r, 20));
  const zoomer = z => { zoom = z; (handlers.zoomend || []).forEach(fn => { try { fn(); } catch (e) {} }); return attendre(); };
  const duNiveau = z => Object.keys(assets).filter(p => p.indexOf("/z" + z + "/") >= 0).map(p => assets[p]);
  vm17.runInContext("this.__rendu = _chargerImageV2OptionB('blob:base', [[0,0],[" + H + "," + W + "]], this.map," +
                    " { tileSize: " + TS + ", minNativeZoom: -3, maxNativeZoom: 0 }, null);", ctx);
  return attendre().then(() => zoomer(-2)).then(() => zoomer(-1)).then(() => zoomer(0)).then(function () {
    const z3 = duNiveau(-3), z0 = duNiveau(0);
    t("🧠 LRU desktop : après les 4 niveaux, le plus ancien (z=-3) est LIBÉRÉ (URL + fichier)",
      z3.length > 0 && z3.every(a => a.url === null && a.file === null));
    t("🧠 LRU desktop : le niveau courant (z=0) garde ses tuiles", z0.length > 0 && z0.every(a => a.url && a.file));
    t("🧠 des URL ont bien été révoquées (" + revoquees + ")", revoquees === z3.length);
  }).catch(function (e) {
    t("§17 le bac à sable du LRU s'exécute sans planter — " + (e && e.message), false);
  });
}

// ───────── 18 bis. RÉGION PEINTE DEPUIS LES TUILES (cartes PDF du Mode Secours) ─────────
// 🩸 Rendre le plan ENTIER sous 16 Mpx puis recadrer laisse ~20 % de la résolution sur un grand
// plan (noms illisibles) : `ktaDessinerRegionTuiles` ne peint que la région, depuis les tuiles.
// Bac à sable (plan 1300 × 1100, tuiles de bord partielles, drawImage enregistrés) : tuiles lues,
// position (rangée k = 1 en bas), niveau selon l'échelle, URL révoquées.
function _regionTuiles() {
  const vm18 = require("vm");
  const W = 1300, H = 1100, TS = 512;
  const assets = {};
  for (let z = -3; z <= 0; z++) {
    const sc = Math.pow(2, -z);
    const cols = Math.ceil(Math.ceil(W / sc) / TS), rows = Math.ceil(Math.ceil(H / sc) / TS);
    for (let k = 1; k <= rows; k++) for (let c = 0; c < cols; c++) {
      const chemin = "data/tiles/z" + z + "/x" + c + "_y" + (-k) + ".jpg";
      if (!(z === 0 && c === 1 && k === 3)) assets[chemin] = { file: { chemin: chemin }, url: null };   // 1 tuile absente
    }
  }
  const crees = [], revoquees = [];
  function FausseImage() { this.naturalWidth = TS; this.naturalHeight = TS; }
  Object.defineProperty(FausseImage.prototype, "src", { set: function (v) { this._src = v; const self = this; setTimeout(function () { self.onload && self.onload(); }, 0); }, get: function () { return this._src; } });
  const win = {
    console: { log() {}, warn() {}, error() {} },
    RUNTIME_ASSETS: assets, Image: FausseImage, Blob: function () {},
    URL: { createObjectURL: function (f) { const u = "blob:" + f.chemin; crees.push(u); return u; }, revokeObjectURL: function (u) { revoquees.push(u); } },
    fetch: function () { return Promise.reject(new Error("pas de réseau")); },
    navigator: {}, requestAnimationFrame: function (f) { return setTimeout(f, 0); },
    L: {}, map: null, setTimeout: setTimeout
  };
  win.window = win;
  const ctx = vm18.createContext(win);
  vm18.runInContext("var window = this; var navigator = this.navigator; var URL = this.URL; var Image = this.Image; var Blob = this.Blob;" +
                    fs.readFileSync("js/tiling.js", "utf8"), ctx);
  const pc = { plan: { tiledV2: true, imageWidth: W, imageHeight: H, baseImage: "blob:base" },
               tiling: { version: 2, tileSize: TS, format: "jpeg", minNativeZoom: -3, maxNativeZoom: 0 } };
  // drawImage à 9 arguments : la source est découpée (remplissage des tuiles de bord exclu).
  const ctxRec = () => { const d = []; return { d: d, drawImage: function (img, sx, sy, sw, sh, x, y, w, h) {
    if (x === undefined) { x = sx; y = sy; w = sw; h = sh; sx = 0; sy = 0; sw = img.naturalWidth; sh = img.naturalHeight; }
    d.push({ src: img._src, sx: sx, sy: sy, sw: sw, sh: sh, x: x, y: y, w: w, h: h }); } }; };
  const c1 = ctxRec();
  // Remplissage d'une tuile de bord : fractions attendues pour ce plan (1300 × 1100, tuiles 512).
  const r00 = win.ktaRemplissageTuile(W, H, TS, 1, 2, 3), r01 = win.ktaRemplissageTuile(W, H, TS, 1, 0, 1);
  t("🧩 tuile du coin haut-droit : 236 px de remplissage à droite (1300 − 1024 = 276 de contenu), 436 en haut ; tuile intérieure : aucun",
    Math.abs(r00.droite - 236 / 512) < 1e-9 && Math.abs(r00.haut - 436 / 512) < 1e-9 && r01.droite === 0 && r01.haut === 0, [r00, r01]);
  return win.ktaDessinerRegionTuiles(c1, pc, { x: 100, y: 50, w: 600, h: 400 }, 1).then(function (r) {
    const de = (col, k) => c1.d.find(e => e.src === "blob:data/tiles/z0/x" + col + "_y-" + k + ".jpg");
    t("🖨️ région à l'échelle 1 → tuiles pleine résolution (z0), seules celles qui la touchent (4, dont 1 absente)",
      r.ok === true && r.z === 0 && r.tuiles === 4 && r.manquantes === 1 && c1.d.length === 3);
    const a = de(0, 3), b = de(1, 2);
    // La rangée du haut (k = 3) n'a que 76 px de contenu, collés EN BAS de la tuile : le remplissage n'est pas lu.
    t("🖨️ rangée du HAUT (partielle, k=3) : seuls ses 76 px de contenu, posés au bord haut du plan (-100, -50)",
      !!a && a.sy === 436 && a.sh === 76 && a.x === -100 && a.y === -50 && a.w === 512 && a.h === 76, a);
    t("🖨️ tuile (col 1, k=2) posée à (412, 26) : rangée k=1 en BAS, origine = coin de la région", !!b && b.x === 412 && b.y === 26, b);
    t("🧠 chaque URL créée pour la région est révoquée (" + crees.length + ")", crees.length === 3 && revoquees.length === 3);
    const c2 = ctxRec();
    return win.ktaDessinerRegionTuiles(c2, pc, { x: 0, y: 0, w: 1300, h: 1100 }, 0.3).then(function (r2) {
      t("🖨️ échelle 0,3 → niveau z-1 (le moins détaillé qui suffit), tuiles intérieures réduites de moitié en taille",
        r2.z === -1 && c2.d.length > 0 && c2.d.every(e => /\/z-1\//.test(e.src) && e.w <= 512 * 2 * 0.3 + 1e-6) &&
        c2.d.some(e => Math.abs(e.w - 512 * 2 * 0.3) < 1e-6));
      // 🩸 Rien au-delà des bords : le remplissage noir des tuiles de bord déborderait à droite et en haut.
      t("🖨️ rien n'est dessiné au-delà des bords du plan (remplissage des tuiles de bord exclu)",
        c2.d.every(e => (e.x + e.w) / 0.3 <= 1300 + 1e-6 && e.y >= -1e-6 && (e.y + e.h) / 0.3 <= 1100 + 1e-6), c2.d.map(e => [e.x, e.y, e.w, e.h]));
      return win.ktaDessinerRegionTuiles(ctxRec(), { plan: { imageWidth: W, imageHeight: H } }, { x: 0, y: 0, w: 10, h: 10 }, 1);
    }).then(function (r3) {
      t("🖨️ plan non tuilé V2 → ok:false (l'export retombe sur l'image de base)", r3.ok === false);
    });
  }).then(function () {
    const EXP = fs.readFileSync("js/exporter.js", "utf8"), SM = fs.readFileSync("js/secoursMode.js", "utf8");
    t("🖨️ export : une région se dessine translatée, et la légende après restauration",
      /if \(region\) \{ ctx\.save\(\); ctx\.translate\(-region\.x \* scale, -region\.y \* scale\); \}/.test(EXP) &&
      /if \(region\) ctx\.restore\(\);\s*\n\s*if \(opts\.legende\)/.test(EXP) && /window\.ktaDessinerRegionTuiles\(ctx, config, region, scale(, \{ aligner: true \})?\)/.test(EXP));
    t("🖨️ Mode Secours : page d'équipe, carte des accès et mini-carte rendent leur SEULE région (plus de plan entier plafonné)",
      (SM.match(/await _rendreRegionPlan\(/g) || []).length === 3 && SM.indexOf("_echelleCanvasPlan") < 0);
  }).catch(function (e) {
    t("§18 le bac à sable de la région s'exécute sans planter — " + (e && e.message), false);
  });
}

// ───────── 19. EXPORT DU PLAN ENTIER : LE FOND VIENT DES TUILES DÉJÀ SUR L'APPAREIL ─────────
// Sans ça, l'export retélécharge l'image de base (des dizaines de Mo) alors que les tuiles sont là.
// `ktaTuilesSurAppareil` dit si TOUTES les tuiles du niveau utile sont présentes (archive, ou Cache
// Storage d'un plan serveur, sans réseau) ; le fond se compose alors sans plafond (z = 0 dès
// l'échelle 0,5) et calé sur le pixel (`aligner` : pas de filet entre tuiles).
function _fondExportTuiles() {
  const vm19 = require("vm");
  const W = 13000, H = 1100, TS = 512;   // 26 colonnes × 3 rangées = 78 tuiles à z0
  const charger = function (win) {
    win.window = win;
    const c = vm19.createContext(win);
    vm19.runInContext("var window = this; var navigator = this.navigator; var URL = this.URL; var Image = this.Image;" +
      " var Blob = this.Blob; var caches = this.caches;" + fs.readFileSync("js/tiling.js", "utf8"), c);
    return win;
  };
  function FausseImage() { this.naturalWidth = TS; this.naturalHeight = TS; }
  Object.defineProperty(FausseImage.prototype, "src", { set: function (v) { this._src = v; const s = this; setTimeout(function () { s.onload && s.onload(); }, 0); }, get: function () { return this._src; } });
  const base = function (extra) {
    return Object.assign({ console: { log() {}, warn() {}, error() {} }, Image: FausseImage, Blob: function () {},
      URL: { createObjectURL: function (f) { return "blob:" + f.chemin; }, revokeObjectURL: function () {} },
      fetch: function () { return Promise.reject(new Error("pas de réseau")); }, navigator: {},
      requestAnimationFrame: function (f) { return setTimeout(f, 0); }, L: {}, map: null, setTimeout: setTimeout }, extra);
  };
  const tiling = { version: 2, tileSize: TS, format: "jpeg", minNativeZoom: -3, maxNativeZoom: 0 };
  const plein = { x: 0, y: 0, w: W, h: H };
  // a) plan importé (ZIP) : tuiles dans RUNTIME_ASSETS
  const assets = {};
  for (let k = 1; k <= 3; k++) for (let c = 0; c < 26; c++) {
    const ch = "data/tiles/z0/x" + c + "_y-" + k + ".jpg";
    assets[ch] = { file: { chemin: ch }, url: null };
  }
  const pcZip = { plan: { tiledV2: true, imageWidth: W, imageHeight: H, baseImage: "blob:base" }, tiling: tiling };
  const wZip = charger(base({ RUNTIME_ASSETS: assets }));
  // b) plan serveur : tuiles dans le Cache Storage (faux caches.match), RUNTIME_ASSETS vide
  const enCache = new Set(), demandes = [];
  for (let k = 1; k <= 3; k++) for (let c = 0; c < 26; c++) enCache.add("srv/tiles/z0/x" + c + "_y-" + k + ".jpg");
  const wSrv = charger(base({ RUNTIME_ASSETS: {}, caches: { match: function (u) {
    demandes.push(u); return Promise.resolve(enCache.has(u) ? { ok: true } : undefined); } } }));
  const pcSrv = { plan: { tiledV2: true, imageWidth: W, imageHeight: H, baseImage: "srv/plan.jpg" },
                  tiling: Object.assign({ tilesDir: "srv/tiles" }, tiling) };
  const wSansCache = charger(base({ RUNTIME_ASSETS: {} }));
  const o = { plafond: Infinity, aligner: true };
  return wZip.ktaTuilesSurAppareil(pcZip, plein, 1, o).then(function (a) {
    t("🖼️ plan ZIP : toutes les tuiles z0 sont dans l'archive → fond depuis les tuiles", a === true);
    delete assets["data/tiles/z0/x25_y-3.jpg"];
    return wZip.ktaTuilesSurAppareil(pcZip, plein, 1, o);
  }).then(function (a) {
    t("🖼️ plan ZIP : UNE tuile absente → false (l'export garde l'image de base)", a === false);
    return wSrv.ktaTuilesSurAppareil(pcSrv, plein, 1, o);
  }).then(function (a) {
    t("🖼️ plan serveur : 78 tuiles trouvées dans le Cache Storage → true, sans réseau",
      a === true && demandes.length === 78 && demandes.every(function (u) { return u.indexOf("srv/tiles/z0/") === 0; }));
    enCache.delete("srv/tiles/z0/x3_y-2.jpg");
    return wSrv.ktaTuilesSurAppareil(pcSrv, plein, 1, o);
  }).then(function (a) {
    t("🖼️ plan serveur : une tuile hors cache → false (rien n'est téléchargé pour l'export)", a === false);
    return wSansCache.ktaTuilesSurAppareil(pcSrv, plein, 1, o);
  }).then(function (a) {
    t("🖼️ navigateur sans Cache Storage → false (comportement d'avant)", a === false);
    // Plafond : 78 tuiles < 600 → z0 de toute façon ; on force un plafond bas pour prouver qu'Infinity le lève.
    return Promise.all([
      wSrv.ktaDessinerRegionTuiles({ drawImage: function () {} }, pcSrv, plein, 1, { plafond: 10 }),
      wSrv.ktaDessinerRegionTuiles({ drawImage: function () {} }, pcSrv, plein, 1, { plafond: Infinity })
    ]);
  }).then(function (r) {
    t("🖼️ qualité : sans plafond, le plan entier reste au niveau z0 (un plafond bas le ferait descendre)",
      r[0].z < 0 && r[1].z === 0, [r[0].z, r[1].z]);
    const d = [];
    return wSrv.ktaDessinerRegionTuiles({ drawImage: function (img, sx, sy, sw, sh, x, y, w, h) {
      d.push({ x: x, y: y, w: w, h: h }); } }, pcSrv, plein, 0.3, o).then(function () { return d; });
  }).then(function (d) {
    const entiers = d.length > 0 && d.every(function (e) {
      return [e.x, e.y, e.w, e.h].every(function (v) { return Number.isInteger(v); });
    });
    // Contiguïté : sur une même rangée, chaque tuile commence au plus tard où finit la précédente.
    const rangs = {};
    d.forEach(function (e) { (rangs[e.y] = rangs[e.y] || []).push(e); });
    const jointif = Object.keys(rangs).every(function (y) {
      const l = rangs[y].sort(function (a, b) { return a.x - b.x; });
      return l.every(function (e, i) { return i === 0 || e.x <= l[i - 1].x + l[i - 1].w; });
    });
    t("🖼️ aligner : à l'échelle 0,3, tuiles posées sur des pixels entiers, sans filet entre voisines",
      entiers && jointif, d.slice(0, 3));
    const EXP = fs.readFileSync("js/exporter.js", "utf8");
    t("🖼️ export : plan entier tuilé V2 → ktaTuilesSurAppareil puis ktaDessinerRegionTuiles (plafond Infinity, aligner),"
      + " image de base sinon",
      /if \(!region && config\.plan && config\.plan\.tiledV2 && typeof window\.ktaTuilesSurAppareil === "function"/.test(EXP) &&
      /const _o = \{ plafond: Infinity, aligner: true \};/.test(EXP) &&
      /await window\.ktaTuilesSurAppareil\(config, _plein, scale, _o\)/.test(EXP) &&
      /fondFait = !!\(r && r\.ok && !r\.manquantes\);/.test(EXP) &&
      EXP.indexOf("await window.ktaTuilesSurAppareil(") < EXP.indexOf("const baseImg = await loadImage(config.plan.baseImage);"));
  }).catch(function (e) {
    t("§19 le bac à sable du fond d'export s'exécute sans planter — " + (e && e.message), false);
  });
}
