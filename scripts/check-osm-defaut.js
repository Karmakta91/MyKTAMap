#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🌍 check-osm-defaut.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LA DÉCISION (KARMA, 08/09/2026) : « active le mode OSM par défaut […] dans
// 99 % des cas ce mode est utilisé ».
//
// 🩸 CE QU'ON RETOURNE N'EST PAS UN RÉGLAGE ORDINAIRE. Le widget OSM du HOME
// monte une carte Leaflet dont le fond vient de `tile.openstreetmap.org`. Actif
// par défaut, l'accueil contacte donc un TIERS au chargement, sans clic. C'est
// la seule chose que l'app fait sortir du navigateur, et toute sa promesse
// tient à ce que ce soit dit — pas à ce que ce soit rare.
//
// D'OÙ LES TROIS INVARIANTS TENUS ICI :
//
//   1. UN REFUS EXPLICITE NE SE RÉÉCRASE JAMAIS. La clé est tri-état : "1"
//      accepté, "0" REFUSÉ, absent jamais touché. Seul l'absent bascule. Un
//      `!== "0"` mal écrit en `=== "1"` inversé, ou un `!!localStorage…`
//      paresseux, rallumerait OSM chez quelqu'un qui l'a coupé — c'est la
//      faute qu'on ne peut pas rattraper après un déploiement.
//   2. LES DEUX LECTEURS DISENT LA MÊME CHOSE. `isOptedIn` est dupliqué dans
//      osmView.js (modale) et osmHomePreview.js (widget HOME). Divergents, on
//      obtient un widget affiché sans bouton dans la modale, ou l'inverse.
//   3. LE DÉFAUT S'ANNONCE. Tant que la clé est absente, « actif parce que
//      jamais refusé » n'est pas « actif parce que choisi » : un bandeau le
//      dit, et le valider écrit "1" — l'implicite devient explicite.
//
// COMMENT ON CONTRÔLE : on EXÉCUTE les deux fonctions extraites des vrais
// fichiers sur les quatre états de la clé. Un `grep` verrait « le test est là »
// sans jamais voir qu'il est inversé.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const VUE  = fs.readFileSync("js/osmView.js", "utf8");
const HOME = fs.readFileSync("js/osmHomePreview.js", "utf8");
const IDX  = fs.readFileSync("index.html", "utf8");

// ═════════ 1. LES DEUX LECTEURS, EXÉCUTÉS SUR LES 4 ÉTATS ═════════
// 🩸 On extrait du VRAI fichier : une copie recopiée ici testerait le garde-fou.
// 🩸 Accepte une fonction AVEC paramètres : la première version cherchait
// `function <nom>() {` et rendait `null` en silence sur `(container)` — le
// contrôle se désactivait tout seul au lieu de rougir.
function extraire(src, nom) {
  const d = src.search(new RegExp("function\\s+" + nom + "\\s*\\([^)]*\\)\\s*\\{"));
  if (d < 0) return null;
  let prof = 0;
  for (let i = src.indexOf("{", d); i < src.length; i++) {
    if (src[i] === "{") prof++;
    else if (src[i] === "}") { prof--; if (prof === 0) return src.slice(d, i + 1); }
  }
  return null;
}

const LECTEURS = [
  ["js/osmView.js (modale)",         extraire(VUE,  "isOptedIn")],
  ["js/osmHomePreview.js (widget)",  extraire(HOME, "_isOptedIn")]
];

const ETATS = [
  ["\"1\" — activé explicitement", "1",  true],
  ["\"0\" — 🩸 REFUSÉ explicitement", "0", false],
  ["absent — jamais touché",      null, true],
  ["valeur inconnue (donnée corrompue)", "oui", true]
];

const resultats = {};
LECTEURS.forEach(function (l) {
  const [nom, code] = l;
  t("le lecteur est extractible : " + nom, !!code);
  if (!code) return;
  resultats[nom] = [];
  ETATS.forEach(function (e) {
    const sb = {
      LS_OPT_IN_KEY: "myktamap_osm_view_opt_in",
      localStorage: { getItem: function () { return e[1]; } }
    };
    let vu = null, err = null;
    try {
      vm.runInNewContext(code + "; resultat = " + code.slice(9, code.indexOf("(")) + "();", sb,
                         { filename: "osm.optin.js" });
      vu = sb.resultat;
    } catch (ex) { err = ex.message; }
    resultats[nom].push(vu);
    t("  " + nom + " · " + e[0] + " → " + (err ? "EXCEPTION " + err : vu),
      !err && vu === e[2]);
  });
});

// ═════════ 2. LES DEUX LECTEURS NE DOIVENT PAS DIVERGER ═════════
{
  const cles = Object.keys(resultats);
  t("🩸 les deux lecteurs répondent À L'IDENTIQUE sur les 4 états " +
    "(sinon : widget affiché sans bouton dans la modale, ou l'inverse)",
    cles.length === 2 && resultats[cles[0]].join(",") === resultats[cles[1]].join(","));
}

// ═════════ 3. UN REFUS RESTE UN REFUS, ET S'ÉCRIT ═════════
t("🩸 setOptedIn(false) écrit bien \"0\" — sans quoi un refus s'effacerait à la purge",
  /localStorage\.setItem\(LS_OPT_IN_KEY, value \? "1" : "0"\)/.test(VUE));
t("le changement est diffusé aux écrans déjà montés (kta:osmOptInChange)",
  /dispatchEvent\(new CustomEvent\("kta:osmOptInChange"/.test(VUE));

// ═════════ 4. LE DÉFAUT S'ANNONCE ═════════
// 🩸 EXÉCUTÉ, pas grepé. Une première version testait le motif
// `=== null;` à moins de 160 caractères du nom de la fonction : un
// `return true;` glissé juste avant le laissait intact, et le sabotage
// « le bandeau s'affiche même après un choix explicite » passait au VERT.
{
  const code = extraire(HOME, "_estActifParDefaut");
  t("le détecteur de défaut est extractible", !!code);
  const vus = [];
  if (code) {
    [["1", false], ["0", false], [null, true]].forEach(function (e) {
      const sb = { LS_OPT_IN_KEY: "k", localStorage: { getItem: function () { return e[0]; } } };
      let vu = null;
      try {
        vm.runInNewContext(code + "; resultat = _estActifParDefaut();", sb, { filename: "osm.defaut.js" });
        vu = sb.resultat;
      } catch (ex) { vu = "EXCEPTION " + ex.message; }
      vus.push(vu === e[1]);
      t("  bandeau · clé " + JSON.stringify(e[0]) + " → " + vu + " (attendu " + e[1] + ")", vu === e[1]);
    });
  }
  t("🩸 le bandeau ne s'affiche QUE tant que la clé est absente (jamais après un choix)",
    vus.length === 3 && vus.every(Boolean));
}
t("🩸 …et le valider écrit un accord EXPLICITE (setOptedIn(true))",
  /window\.OsmView\.setOptedIn\(true\)/.test(HOME));
t("le bandeau est posé au montage du widget", /_afficherBandeauDefaut\(container\);/.test(HOME));
t("🩸 son texte passe par textContent, jamais innerHTML (contenu de dictionnaire)",
  /\.kta-osm-defaut-txt"\)\.textContent = t\("osm_home\.defautOn\.corps"\)/.test(HOME));

// ═════════ 5. LES BLOQUANTS RESTENT PRIORITAIRES ═════════
// 🩸 L'incognito est une PROMESSE : un défaut ON ne doit pas passer devant.
// Il est testé APRÈS l'opt-in dans mount(), donc l'ordre relatif est ce qui
// compte.
{
  // 🩸 Chercher la garde dans TOUT le fichier trouvait sa DÉFINITION,
  // toujours placée avant `mount()` : l'assertion était vraie par
  // construction, quel que soit l'ordre réel des tests. On borne donc la
  // recherche au corps de mount(), après le test d'opt-in.
  const iOpt = HOME.indexOf("if (!_isOptedIn()) {");
  const corps = iOpt > 0 ? HOME.slice(iOpt) : "";
  t("le test d'opt-in est trouvable dans mount()", iOpt > 0);
  t("🔒 le mode incognito bloque toujours le widget, APRÈS l'opt-in",
    corps.indexOf("if (_isIncognitoOn()) {") > 0);
}

// ═════════ 5 bis. LA GARDE INCOGNITO, EXÉCUTÉE ═════════
// 🩸 le contrôle ci-dessus cherchait un TEXTE : il est resté vert
// pendant que `_isIncognitoOn()` appelait `IncognitoMode.isActive()`, une
// fonction qui n'existait pas. L'incognito ne coupait donc pas la Vue OSM.
// On charge le VRAI module incognito, on extrait la VRAIE garde des deux
// fichiers, et on l'exécute dans les deux états.
{
  const vm = require("vm");
  const INC = fs.readFileSync("js/incognitoMode.js", "utf8");
  const garde = function (src) {
    const i = src.indexOf("function _isIncognitoOn()");
    const j = src.indexOf("\n  }", i);
    return (i >= 0 && j > i) ? src.slice(i, j + 4) : "";
  };
  // Actif, le module détourne le stockage (document, Storage, indexedDB…) :
  // des bouchons qui acceptent tout suffisent, seul l'état rendu nous importe.
  const n_importe = function () {
    return new Proxy(function () {}, {
      get: function (c, k) { return k === Symbol.toPrimitive ? function () { return ""; } : n_importe(); },
      apply: function () { return n_importe(); }, construct: function () { return n_importe(); },
      set: function () { return true; }
    });
  };
  const bac = function (actif) {
    const win = { _kta_incognito: actif, location: { search: "" } };
    win.window = win;
    const sb = { window: win, URLSearchParams: URLSearchParams, console: { log: function () {}, warn: function () {}, info: function () {} },
                 document: n_importe(), Storage: n_importe(), localStorage: n_importe(), sessionStorage: n_importe(),
                 indexedDB: n_importe(), IDBObjectStore: n_importe(), IDBFactory: n_importe(), navigator: n_importe(),
                 setTimeout: function () {}, out: null };
    vm.runInNewContext(INC, sb, { filename: "incognitoMode.js" });
    return sb;
  };
  const jouer = function (src, actif) {
    const sb = bac(actif);
    vm.runInNewContext(garde(src) + "\nout = _isIncognitoOn();", sb, { filename: "garde.js" });
    return sb.out;
  };
  [["osmView.js (modale)", VUE], ["osmHomePreview.js (widget)", HOME]].forEach(function (f) {
    t("la garde incognito est extractible de " + f[0], garde(f[1]).length > 0);
    let ok = false;
    try { ok = jouer(f[1], true) === true && jouer(f[1], false) === false; } catch (e) {}
    t("🩸 " + f[0] + " : incognito actif → OSM coupée ; inactif → non", ok);
  });
  // Toute propriété d'IncognitoMode appelée dans js/ doit exister dans l'API.
  const api = {};
  Object.keys(bac(false).window.IncognitoMode || {}).forEach(function (k) { api[k] = true; });
  const manquantes = [];
  // Le module lui-même pose des membres privés (`_…`) en mode actif : hors champ.
  fs.readdirSync("js").filter(function (f) { return f.endsWith(".js") && f !== "incognitoMode.js"; }).forEach(function (f) {
    const re = /IncognitoMode\.([A-Za-z_]+)/g;
    let m;
    const src = fs.readFileSync("js/" + f, "utf8");
    while ((m = re.exec(src))) if (!api[m[1]]) manquantes.push(f + " → ." + m[1]);
  });
  t("🩸 toute propriété d'IncognitoMode utilisée dans js/ existe dans son API" +
    (manquantes.length ? " — absentes : " + manquantes.slice(0, 5).join(", ") : ""), manquantes.length === 0);
}

// ═════════ 6. CE QUE L'UTILISATEUR LIT DOIT ÊTRE VRAI ═════════
// 🩸 La case annonçait « default OFF » — faux désormais — et « quand la modale
// Vue OSM est ouverte », qui était DÉJÀ faux : le widget du HOME contacte le
// même serveur sans ouvrir aucune modale. Tolérable en opt-in, plus du tout
// en défaut ON.
{
  const fr = JSON.parse(fs.readFileSync("lang/fr.json", "utf8"));
  const lib = fr["home.privacy.osmToggle"] || "";
  t("📄 la case ne prétend plus être désactivée par défaut", lib.indexOf("default OFF") < 0);
  t("📄 …et dit qu'elle est active par défaut", /par défaut/i.test(lib));
  t("🩸 …et que c'est le WIDGET DE L'ACCUEIL aussi, pas seulement la modale",
    /accueil/i.test(lib));
  t("📄 le libellé de repli d'index.html dit la même chose",
    /Activée? par défaut/.test(IDX) && IDX.indexOf("default OFF") < 0);

  // L'audit réseau est la page où l'on promet de tout dire : le changement de
  // défaut doit y être, faute de quoi la promesse ne vaut plus rien.
  // 🩸 UNE PREMIÈRE VERSION DE CE TEST ÉTAIT VRAIE PAR ACCIDENT : elle exigeait
  // « défaut » + « tile.openstreetmap.org » + « v1.90.2 » quelque part dans le
  // fichier — trois mots qui s'y trouvaient déjà, séparément, pour d'autres
  // raisons. Elle passait au vert sur un audit qui ne disait RIEN du changement.
  // On exige donc la phrase qui engage, et elle seule.
  const PHRASE = "activée PAR DÉFAUT";
  ["docs/applications/NETWORK_AUDIT.md", "docs/applications/NETWORK_AUDIT.html"].forEach(function (f) {
    const D = fs.readFileSync(f, "utf8");
    t("🔒 " + f.split("/").pop() + " annonce noir sur blanc que la Vue OSM est active par défaut",
      D.indexOf(PHRASE) >= 0);
    t("🔒 " + f.split("/").pop() + " …et nomme le tiers contacté sans clic",
      D.indexOf("tile.openstreetmap.org") >= 0);
  });
}

// ═════════ 7. « AUCUN PLAN GÉORÉFÉRENCÉ » NE DOIT PAS MENTIR ═════════
// VÉCU (KARMA) : « (A compléter, pour le cas où un plan n'a pas été chargé
// une fois) ». Le géoréf embarqué dans un plan n'est écrit au registre qu'à sa
// PREMIÈRE OUVERTURE : un plan jamais ouvert peut être parfaitement calibré et
// rester invisible ici. L'app affirmait « aucun plan géoréférencé » quand la
// vraie phrase était « je n'ai pas encore regardé ».
//
// 🩸 ET LES CLÉS SONT CONSTRUITES DYNAMIQUEMENT (`"osm_home." + cle + …`) :
// `check-i18n` ne peut PAS les voir. Une faute de frappe sortirait un libellé
// humanisé en production sans que rien ne rougisse. On EXÉCUTE donc la
// fonction sur les trois scénarios et on confronte les clés demandées aux
// trois dictionnaires.
{
  const code = extraire(HOME, "_renderNoGeorefPlans");
  t("le rendu « aucun plan géoréférencé » est extractible", !!code);
  const DICOS = ["fr", "en", "es"].map(function (c) {
    return [c, JSON.parse(fs.readFileSync("lang/" + c + ".json", "utf8"))];
  });

  const SCENARIOS = [
    ["bibliothèque vide",                 [],                                              "osm_home.noplan.title"],
    ["des plans, aucun jamais ouvert",     [{ id: "a" }, { id: "b" }],                      "osm_home.jamaisouvert.title"],
    ["des plans ouverts, aucun calé",      [{ id: "a", lastOpened: 12 }, { id: "b" }],      "osm_home.nogeoref.title"]
  ];

  if (code) SCENARIOS.forEach(function (sc) {
    const demandees = [];
    const conteneur = { innerHTML: "" };
    const sb = {
      window: {
        PlanRegistry: { getAll: function () { return sc[1]; } },
        I18n: { t: function (k) { demandees.push(k); return "[" + k + "]"; } }
      }
    };
    let err = null;
    try {
      vm.runInNewContext(code + "; _renderNoGeorefPlans(conteneur);",
        Object.assign(sb, { conteneur: conteneur }), { filename: "osm.nogeoref.js" });
    } catch (e) { err = e.message; }

    t("🧪 " + sc[0] + " → le bon message" + (err ? " — EXCEPTION : " + err : ""),
      !err && demandees.indexOf(sc[2]) >= 0);

    // 🩸 Toutes les clés demandées doivent EXISTER, dans les trois langues.
    demandees.forEach(function (k) {
      const manquantes = DICOS.filter(function (d) { return typeof d[1][k] !== "string"; })
                              .map(function (d) { return d[0]; });
      t("  clé « " + k + " » présente dans fr/en/es" +
        (manquantes.length ? " — MANQUE : " + manquantes.join(", ") : ""),
        manquantes.length === 0);
    });
  });

  // 🩸 Le troisième cas doit AUSSI compter les plans jamais ouverts : leur
  // calibration est INCONNUE, pas absente — la nuance change ce que
  // l'utilisateur doit faire ensuite.
  t("🩸 le cas mixte annonce les plans jamais ouverts (calibration inconnue ≠ absente)",
    /osm_home\.nogeoref\.reste", \{ n: jamaisOuverts \}/.test(HOME));
}

// ═════════ 8. LE BANDEAU NE DÉPEND PAS D'UN AFFICHAGE RÉUSSI ═════════
// VÉCU (KARMA, une heure après la mise en place) : « le panneau que tu as
// rajouté ne s'affiche qu'une fois qu'il a fait un premier affichage — pas
// dans le cas “aucun plan géoréférencé” ».
// 🩸 Exact : il n'était posé que dans le dernier cas de `mount()`. Les
// chemins qui sortent AVANT (incognito, hors-ligne, aucun plan géoréférencé) écrivaient leur message et rentraient — le défaut n'était
// donc annoncé qu'à ceux qui voyaient déjà la carte. Or il est ACTIF dans tous
// ces états : il attend seulement que la condition tombe.
//
// UN SEUL chemin en est exempt, et c'est une décision : `_renderOptInNeeded`
// MASQUE la colonne entière — il n'y a nulle part où l'afficher, et rien à
// annoncer à quelqu'un qui a refusé.
{
  // 🩸 `function mount(` avec ou sans paramètre (v1.90.12 : mount(preferId)).
  const iM = HOME.search(/function mount\s*\([^)]*\)\s*\{/);
  let fin = iM, prof = 0;
  for (let i = HOME.indexOf("{", iM); i < HOME.length; i++) {
    if (HOME[i] === "{") prof++;
    else if (HOME[i] === "}") { prof--; if (prof === 0) { fin = i; break; } }
  }
  const corps = iM >= 0 ? HOME.slice(iM, fin) : "";
  t("le corps de mount() est délimitable", corps.length > 200);

  // Chaque `return;` du corps doit être précédé du bandeau — sauf celui du
  // refus, reconnaissable à `_renderOptInNeeded` juste au-dessus.
  const lignes = corps.split(/\r?\n/);
  const sorties = [];
  lignes.forEach(function (l, i) {
    if (!/^\s*return;\s*$/.test(l)) return;
    const avant = lignes.slice(Math.max(0, i - 3), i).join(" ");
    sorties.push({
      ligne: i,
      refus: avant.indexOf("_renderOptInNeeded") >= 0,
      bandeau: avant.indexOf("_afficherBandeauDefaut(container)") >= 0,
      apercu: (lignes[i - 1] || "").trim().slice(0, 46)
    });
  });

  t("🩸 mount() a bien plusieurs sorties anticipées à couvrir (" + sorties.length + ")",
    sorties.length >= 4);
  const orphelines = sorties.filter(function (s2) { return !s2.refus && !s2.bandeau; });
  t("🩸 CHAQUE sortie de mount() annonce le défaut" +
    (orphelines.length ? " — MANQUE après : " + orphelines.map(function (o) { return o.apercu; }).join(" · ") : ""),
    orphelines.length === 0);
  t("🩸 …sauf le refus explicite, où la colonne est masquée (rien à annoncer)",
    sorties.filter(function (s2) { return s2.refus; }).length === 1);

  // La sortie normale (fin de fonction, sans `return;`) compte aussi.
  t("le cas nominal l'annonce également",
    /_renderWidget\(container, plans, initialId\);\s*[\r\n]+\s*_afficherBandeauDefaut\(container\);/.test(corps));
}

// 🩸 …ET LE TEXTE DOIT RESTER VRAI DANS CES CINQ ÉTATS. « le fond ci-dessous
// est fourni par OpenStreetMap » devenait faux dès qu'aucune carte n'est
// affichée — donc dans quatre des cinq cas où le bandeau apparaît désormais.
{
  const fr = JSON.parse(fs.readFileSync("lang/fr.json", "utf8"));
  const txt = fr["osm_home.defautOn.corps"] || "";
  t("📄 le bandeau ne prétend pas qu'une carte est déjà affichée",
    txt.indexOf("ci-dessous") < 0);
  t("📄 …il dit ce qui se passera quand elle le sera", /quand la carte s'affiche/i.test(txt));
  t("📄 …et rappelle où couper", txt.indexOf("Configuration") >= 0);
}

console.log(ko === 0 ? "\n🎉 défaut OSM : un refus reste un refus, et le défaut s'annonce"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
