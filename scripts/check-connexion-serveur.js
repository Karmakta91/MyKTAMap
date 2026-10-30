#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-connexion-serveur.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Contrat (docs/architecture/community-server-line.md §3) : une instance
// déclare `index.json > config.serverConnection` ; l'app en tire un état
// (off · invalide · licence · configuree) affiché dans le pied de page.
// myktamap.fr n'a pas de backend : l'état y vaut « off ».
// 🩸 Ce que ce script attrape :
//   1. ConfAdmin et l'app qui ne valident pas pareil (les deux fonctions sont
//      EXÉCUTÉES sur la même table de cas) ;
//   2. « index injoignable » confondu avec « connexion coupée » : une instance
//      hors ligne est HS, pas OFF (décision produit), et garde sa mémoire ;
//   3. licence importée (source "local") qui suffirait à passer « configurée »
//      (règle E : seule la source "server" compte) ;
//   4. mémoire de l'instance partie dans l'export de profil ;
//   5. requête réseau hors du garde `requete()` du module.
// Le vrai js/ktaExtensions.js tourne dans un `vm` (faux localStorage) ; la
// fonction de ConfAdmin est extraite de confadmin.html + js/confadmin.js.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const MOD  = fs.readFileSync("js/ktaExtensions.js", "utf8");
// CSP stricte : le script de confadmin.html vit dans js/confadmin.js (page + script).
const CA   = fs.readFileSync("confadmin.html", "utf8") + "\n" + fs.readFileSync("js/confadmin.js", "utf8");
const MAIN = fs.readFileSync("js/main.js", "utf8");
const HOME = fs.readFileSync("js/homeLoader.js", "utf8");
const IDX  = fs.readFileSync("index.html", "utf8");
const SW   = fs.readFileSync("sw.js", "utf8");
const PROF = fs.readFileSync("js/profileExportImport.js", "utf8");

// ── 1. Le module, exécuté ────────────────────────────────────────────
const store = {};
const evenements = [];
let licence = { isPro: false, source: null };
const ecouteurs = {};
const win = {
  console: { log() {}, warn() {}, error() {} },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  document: {
    readyState: "complete",
    getElementById: () => null,
    addEventListener() {}
  },
  MyKTAMapProLicense: {
    isPro: () => licence.isPro,
    getSource: () => licence.source
  },
  CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
  addEventListener: (type, cb) => { (ecouteurs[type] = ecouteurs[type] || []).push(cb); },
  dispatchEvent: (e) => { evenements.push(e); return true; },
  Promise: Promise
};
win.window = win;
const ctx = vm.createContext(win);
vm.runInContext("var localStorage = window.localStorage, document = window.document, " +
                "CustomEvent = window.CustomEvent, console = window.console;", ctx);
let K = null;
try {
  vm.runInContext(MOD, ctx, { filename: "ktaExtensions.js" });
  K = win.KtaExtensions;
} catch (e) {
  t("js/ktaExtensions.js s'exécute — " + e.message, false);
}
t("window.KtaExtensions est exposé", !!K);
t("valider / etatDe / appliquerConfig / etat / peindre exposés",
  !!(K && ["valider", "etatDe", "appliquerConfig", "etat", "peindre"].every((f) => typeof K[f] === "function")));

// ── 2. ConfAdmin, extrait et exécuté ─────────────────────────────────
function extraireFonction(src, nom) {
  const debut = src.indexOf("function " + nom + "(");
  if (debut < 0) return null;
  const ouv = src.indexOf("{", debut);
  let prof = 0;
  for (let i = ouv; i < src.length; i++) {
    if (src[i] === "{") prof++;
    else if (src[i] === "}") { prof--; if (prof === 0) return src.slice(debut, i + 1); }
  }
  return null;
}
let validerCA = null;
{
  const code = extraireFonction(CA, "ktaValiderConnexion");
  t("confadmin.html contient ktaValiderConnexion", !!code);
  if (code) {
    const c2 = vm.createContext({});
    vm.runInContext(code, c2);
    validerCA = c2.ktaValiderConnexion;
  }
}

// ── 3. Table de cas : app et ConfAdmin concordent ────────────────────
const OK = { state: "on", api: "https://api.exemple.org", modules: ["pro/sync.js"] };
const CAS = [
  ["absent", undefined, "off"],
  ["null", null, "off"],
  ["state off", { state: "off" }, "off"],
  ["off, même avec des champs faux", { state: "off", api: "http://x" }, "off"],
  ["valide", OK, "on"],
  ["valide sans module", { state: "on", api: "https://api.exemple.org", modules: [] }, "on"],
  ["api avec chemin", { state: "on", api: "https://cloud.exemple.org/v2", modules: [] }, "on"],
  ["texte au lieu d'objet", "on", "invalide"],
  ["tableau au lieu d'objet", ["on"], "invalide"],
  ["state inconnu", { state: "yes", api: OK.api, modules: [] }, "invalide"],
  ["state absent", { api: OK.api, modules: [] }, "invalide"],
  ["api en http://", { state: "on", api: "http://api.exemple.org", modules: [] }, "invalide"],
  ["api même site « /api/ »", { state: "on", api: "/api/", modules: [] }, "on"],
  ["api même site « / »", { state: "on", api: "/", modules: [] }, "on"],
  ["api protocole-relatif « //x/api »", { state: "on", api: "//cdn.exemple.org/api", modules: [] }, "invalide"],
  ["api chemin sans « / » initial", { state: "on", api: "api/", modules: [] }, "invalide"],
  ["api chemin avec paramètre", { state: "on", api: "/api/?x=1", modules: [] }, "invalide"],
  ["api chemin avec espace", { state: "on", api: "/a pi/", modules: [] }, "invalide"],
  ["api absente", { state: "on", modules: [] }, "invalide"],
  ["api vide après https://", { state: "on", api: "https://", modules: [] }, "invalide"],
  ["modules absent", { state: "on", api: OK.api }, "invalide"],
  ["modules en texte", { state: "on", api: OK.api, modules: "pro/sync.js" }, "invalide"],
  ["module sur un autre domaine", { state: "on", api: OK.api, modules: ["https://cdn.x/m.js"] }, "invalide"],
  ["module protocole-relatif", { state: "on", api: OK.api, modules: ["//cdn.x/m.js"] }, "invalide"],
  ["module qui remonte", { state: "on", api: OK.api, modules: ["../m.js"] }, "invalide"],
  ["module caché dans un chemin", { state: "on", api: OK.api, modules: ["pro/../../m.js"] }, "invalide"],
  ["module absolu", { state: "on", api: OK.api, modules: ["/pro/m.js"] }, "invalide"],
  ["module sans .js", { state: "on", api: OK.api, modules: ["pro/m"] }, "invalide"],
  ["module non texte", { state: "on", api: OK.api, modules: [42] }, "invalide"],
  ["module versionné ?v=", { state: "on", api: OK.api, modules: ["pro/m.js?v=0.2.0"] }, "on"],
  ["module : autre paramètre que v", { state: "on", api: OK.api, modules: ["pro/m.js?x=1"] }, "invalide"],
  ["module : version vide", { state: "on", api: OK.api, modules: ["pro/m.js?v="] }, "invalide"],
  ["module : deux paramètres", { state: "on", api: OK.api, modules: ["pro/m.js?v=1&x=2"] }, "invalide"],
  ["module : version avec espace", { state: "on", api: OK.api, modules: ["pro/m.js?v=1 2"] }, "invalide"],
  ["module : version avant .js", { state: "on", api: OK.api, modules: ["pro/m?v=1.js"] }, "invalide"],
  ["transparence : page du même site", { state: "on", api: OK.api, modules: [], transparence: "pro/transparence.html" }, "on"],
  ["transparence : autre domaine", { state: "on", api: OK.api, modules: [], transparence: "https://x.org/t.html" }, "invalide"],
  ["transparence : remonte", { state: "on", api: OK.api, modules: [], transparence: "../t.html" }, "invalide"],
  ["transparence : pas une page .html", { state: "on", api: OK.api, modules: [], transparence: "pro/t.js" }, "invalide"],
  ["transparence : non texte", { state: "on", api: OK.api, modules: [], transparence: 42 }, "invalide"],
  ["32 modules", { state: "on", api: OK.api, modules: Array.from({ length: 32 }, (_, i) => "pro/m" + i + ".js") }, "on"],
  ["33 modules", { state: "on", api: OK.api, modules: Array.from({ length: 33 }, (_, i) => "pro/m" + i + ".js") }, "invalide"]
];
if (K && validerCA) {
  CAS.forEach(([nom, entree, attendu]) => {
    const a = K.valider(entree), b = validerCA(entree);
    t("cas « " + nom + " » → " + attendu, a.etat === attendu);
    t("   …et ConfAdmin rend exactement la même chose", JSON.stringify(a) === JSON.stringify(b));
  });
  const v = K.valider(OK);
  t("valider() ne garde que state/api/modules (+ transparence) : aucun champ inconnu ne passe",
    v.api === OK.api && v.modules.join() === "pro/sync.js" && Object.keys(K.valider(Object.assign({ autre: 1 }, OK))).join() === "etat,raison,api,modules");
  t("transparence gardée quand elle est valide",
    K.valider(Object.assign({ transparence: "pro/transparence.html" }, OK)).transparence === "pro/transparence.html");
}

// ── 4. Table de vérité des états (règle E) ───────────────────────────
if (K) {
  const on = K.valider(OK);
  t("off reste off, quelle que soit la licence", K.etatDe(K.valider(undefined), "server") === "off");
  t("invalide reste invalide, même avec licence serveur", K.etatDe(K.valider("on"), "server") === "invalide");
  t("« on » sans licence → licence", K.etatDe(on, null) === "licence");
  t("🩸 « on » + licence IMPORTÉE (local) → licence, pas configurée", K.etatDe(on, "local") === "licence");
  t("« on » + licence serveur → configuree", K.etatDe(on, "server") === "configuree");
}

// ── 5. Règle B : index injoignable ≠ connexion coupée ────────────────
if (K) {
  const memo = K.LS_MEMO;
  const raz = () => { Object.keys(store).forEach((k) => delete store[k]); evenements.length = 0; };

  raz(); licence = { isPro: false, source: null };
  K.appliquerConfig(null, false);
  t("premier démarrage, index injoignable, aucune mémoire → off", K.etat().etat === "off");

  raz(); licence = { isPro: true, source: "server" };
  K.appliquerConfig({ serverConnection: OK }, true);
  t("index répondu, « on » + licence serveur → configuree", K.etat().etat === "configuree");
  t("…la config est mémorisée", !!store[memo]);

  K.appliquerConfig(null, false);
  t("🩸 puis index injoignable → la mémoire rejoue « configuree » (HS, pas OFF)", K.etat().etat === "configuree");
  t("🩸 …et la mémoire n'est PAS effacée par la coupure", !!store[memo]);

  K.appliquerConfig({}, true);
  t("index répondu SANS le champ → off (le déployeur l'a retiré)", K.etat().etat === "off");
  t("…et la mémoire est effacée", !store[memo]);

  K.appliquerConfig({ serverConnection: OK }, true);
  K.appliquerConfig({ serverConnection: "on" }, true);
  t("index répondu avec un champ cassé → invalide", K.etat().etat === "invalide");
  t("…la mémoire d'une config valide précédente est effacée", !store[memo]);

  raz(); licence = { isPro: false, source: null };
  K.appliquerConfig({ serverConnection: OK }, true);
  t("« on » sans licence → licence", K.etat().etat === "licence");
  licence = { isPro: true, source: "server" };
  (ecouteurs["mktm:license-changed"] || []).forEach((cb) => cb());
  t("la licence serveur arrive APRÈS l'index → recalcul en configuree", K.etat().etat === "configuree");
  const dernier = evenements[evenements.length - 1];
  t("mktm:connexion-changed est émis avec le nouvel état",
    !!(dernier && dernier.type === "mktm:connexion-changed" && dernier.detail.etat === "configuree"));
}

// ── 6. Câblage ───────────────────────────────────────────────────────
t("main.js transmet la config quand l'index a répondu (true)",
  /_appliquerConnexionServeur\(window\.KIOSK_CONFIG, true\)/.test(MAIN));
t("🩸 main.js déclare l'index INJOIGNABLE (false) quand il n'a pas répondu (non-2xx = 404 synthétique du SW, cf ktaInstance)",
  /if \(!idx\) \{[\s\S]{0,700}_appliquerConnexionServeur\(null, false\)/.test(MAIN) &&
  /if \(!r\.ok\) return null;/.test(fs.readFileSync("js/ktaInstance.js", "utf8")));
t("🔌 l'état de connexion est connu AVANT la gate (v2.6.0)",
  /if \(_instanceBoot\) _appliquerConnexionServeur\(_instanceBoot\.config, _instanceBoot\.repondu\);/.test(MAIN));
t("main.js déclare l'index injoignable (false) sur une erreur réseau",
  /catch\(e\) \{\s*console\.warn\("\[Main\] lecture data\/index\.json :", e\);\s*_appliquerConnexionServeur\(null, false\);/.test(MAIN));
t("homeLoader repeint l'icône après avoir réécrit le bouton du pied de page replié",
  /footerToggle\.textContent = replie[\s\S]{0,600}KtaExtensions\.peindre\(\)/.test(HOME));
{
  const iPro = IDX.indexOf('<script src="js/proLicense.js">');
  const iExt = IDX.indexOf('<script src="js/ktaExtensions.js">');
  const iMain = IDX.indexOf('<script src="js/main.js"');
  t("index.html charge ktaExtensions APRÈS proLicense et AVANT main.js", iPro >= 0 && iExt > iPro && iMain > iExt);
}
t("la pastille et le bloc d'état existent dans index.html",
  /id="loaderCnxChip"/.test(IDX) && /id="loaderNetDocCnx"/.test(IDX));
t("le module est précaché (sw.js > ASSETS_TO_CACHE)", /"\.\/js\/ktaExtensions\.js"/.test(SW));
t("🩸 la mémoire de l'instance ne part PAS dans l'export de profil",
  PROF.indexOf("myktamap_server_connection_v1") < 0);
// 🔒 Le module porte le GARDE des requêtes d'extension : un seul fetch, dans
// requete() ; XMLHttpRequest seulement dans requete() aussi, APRÈS ses contrôles (envoi avec avancement,
// option progressionEnvoi) ; ni beacon, ni socket ; il ne contacte jamais le serveur
// de lui-même (en OFF, requete refuse avant envoi : check-extensions.js).
{
  const sansComm = MOD.replace(/\/\/.*$/gm, "");
  const nFetch = (sansComm.match(/\bfetch\s*\(/g) || []).length;
  const d = sansComm.indexOf("function requete(");
  let corps = "";
  if (d >= 0) { const o = sansComm.indexOf("{", d); let pr = 0;
    for (let k = o; k < sansComm.length; k++) { if (sansComm[k] === "{") pr++; else if (sansComm[k] === "}") { pr--; if (pr === 0) { corps = sansComm.slice(d, k + 1); break; } } } }
  t("🩸 un seul fetch dans le module, et il vit dans requete() (le garde)", nFetch === 1 && /\bfetch\s*\(/.test(corps));
  const nXhr = (sansComm.match(/XMLHttpRequest/g) || []).length;
  const xhrGarde = (corps.match(/XMLHttpRequest/g) || []).length;
  const iControle = corps.indexOf("origine refusée"), iXhr = corps.indexOf("new XMLHttpRequest");
  t("🩸 XMLHttpRequest seulement dans requete(), après le contrôle d'origine (envoi avec avancement)",
    nXhr === xhrGarde && (nXhr === 0 || (iControle > 0 && iXhr > iControle)));
  t("🩸 ni beacon, ni socket dans le module", !/sendBeacon|WebSocket|EventSource/.test(sansComm));
}
t("ConfAdmin refuse l'export tant que le champ est invalide",
  /\$\("caDownload"\)\.addEventListener\("click", function\(\) \{\s*if \(!_connexionSaisie\(\)\.valide\) return;/.test(CA) &&
  /\$\("caCopy"\)\.addEventListener\("click", function\(\) \{\s*if \(!_connexionSaisie\(\)\.valide\) return;/.test(CA));

// ── 6b. Écran d'accueil : ConfAdmin écrit ce que l'app relit (config.accueil) ──
// 🩸 Un texte que ConfAdmin publierait et que l'app rognerait ou ignorerait en silence : l'export est EXÉCUTÉ, puis
// relu par le vrai normaliserAccueil, et le texte montré dans chaque langue doit être celui saisi (rogné aux bornes).
{
  const code = extraireFonction(CA, "ktaAccueilExport");
  t("ConfAdmin contient ktaAccueilExport", !!code);
  let exp = null;
  if (code) { const c3 = vm.createContext({}); vm.runInContext(code, c3); exp = c3.ktaAccueilExport; }
  const montre = (n, l) => (n ? (n[l] || n.fr || n[Object.keys(n)[0]] || "") : "");
  const long = "x".repeat(500);
  const CAS_ACCUEIL = [
    ["tout vide", { titre: { fr: "", en: "", es: "" }, description: { fr: " ", en: "", es: "" } }],
    ["français seul", { titre: { fr: " Club ", en: "", es: "" }, description: { fr: "Ligne 1\nLigne 2", en: "", es: "" } }],
    ["trois langues", { titre: { fr: "Club", en: "Club EN", es: "Club ES" }, description: { fr: "Bonjour", en: "Hello", es: "" } }],
    ["anglais seul", { titre: { fr: "", en: "Only EN", es: "" }, description: { fr: "", en: "", es: "" } }],
    ["trop long", { titre: { fr: long, en: long, es: "" }, description: { fr: long, en: "", es: "" } }]
  ];
  const accord = !!(exp && K);
  const ecarts = [];
  if (accord) {
    CAS_ACCUEIL.forEach(([nom, v]) => {
      const sortie = exp(v);
      const relu = K.normaliserAccueil(sortie);
      ["titre", "description"].forEach((champ) => {
        const max = champ === "titre" ? 80 : 400;
        const saisi = {};
        ["fr", "en", "es"].forEach((l) => { const s = v[champ][l].trim().slice(0, max).trim(); if (s) saisi[l] = s; });
        const vide = !Object.keys(saisi).length;
        ["fr", "en", "es"].forEach((l) => {
          if (montre(relu[champ], l) !== (vide ? "" : montre(saisi, l))) ecarts.push(nom + " / " + champ + " / " + l);
        });
      });
      if (nom === "tout vide" && sortie !== null) ecarts.push("tout vide → " + JSON.stringify(sortie));
      if (nom === "français seul" && typeof (sortie || {}).titre !== "string") ecarts.push("une seule langue → chaîne");
      if (nom === "trois langues" && typeof (sortie || {}).titre !== "object") ecarts.push("plusieurs langues → objet");
      if (nom === "trop long" && !(sortie && sortie.titre.fr.length === 80 && sortie.description.length === 400)) {
        ecarts.push("bornes de l'export");
      }
    });
  }
  t("ConfAdmin → app : chaque langue montre le texte saisi, rogné aux bornes (80 / 400) — " +
    (ecarts.length ? "ÉCARTS " + ecarts.join(", ") : "5 cas"), accord && ecarts.length === 0);
  t("champs bornés comme l'app (maxlength 80 / 400, six champs)",
    (CA.match(/id="caAccueil(Titre|TitreEn|TitreEs)" class="kta-ca-champ" maxlength="80"/g) || []).length === 3 &&
    (CA.match(/id="caAccueil(Desc|DescEn|DescEs)" class="kta-ca-champ" rows="3" maxlength="400"/g) || []).length === 3);
  t("export dans config.accueil, index repris relu dans les champs",
    /out\.config\.accueil = accueil;/.test(CA) && /_poserAccueil\(c\.accueil\);/.test(CA));
  t("🩸 plus rien sous serverConnection.accueil (une seule clé pour le community et le pro)",
    !/garde\.accueil|sc\.accueil|serverConnection\.accueil/.test(CA + MOD));
  // reglages.json : ConfAdmin n'y écrit que ce que js/ktaInstance.js > filtrerReglages lit, et l'app le relit tel quel.
  const codeR = extraireFonction(CA, "ktaReglagesExport");
  const KI = fs.readFileSync("js/ktaInstance.js", "utf8");
  const codeF = extraireFonction(KI, "filtrerReglages");
  t("ConfAdmin contient ktaReglagesExport, ktaInstance filtrerReglages", !!codeR && !!codeF);
  if (codeR && codeF && exp) {
    const c4 = vm.createContext({});
    vm.runInContext(codeR + codeF + "; R = ktaReglagesExport; F = filtrerReglages;", c4);
    const plein = c4.R(exp(CAS_ACCUEIL[2][1]), "  Sous-titre  ");
    const vide = c4.R(null, " ");
    t("reglages.json exporté : accueil + subtitle seuls, relus à l'identique par l'app ; tout vide → {}",
      JSON.stringify(Object.keys(plein)) === '["accueil","subtitle"]' && plein.subtitle === "Sous-titre" &&
      JSON.stringify(c4.F(plein)) === JSON.stringify(plein) && JSON.stringify(vide) === "{}" && c4.F(vide) === null);
  }
  t("ConfAdmin : télécharger et reprendre un reglages.json",
    /a\.download = "reglages\.json";/.test(CA) && /id="caReglagesInput"/.test(CA) && /_poserAccueil\(d\.accueil\);/.test(CA));
}

// ── 7. Textes : un libellé et une explication par état, 3 langues ────
["fr", "en", "es"].forEach((l) => {
  const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
  const manquantes = [];
  (K ? K.ETATS : []).forEach((e) => {
    ["home.serveur.mot." + e, "home.serveur.etat." + e, "home.serveur.explication." + e].forEach((k) => { if (!D[k]) manquantes.push(k); });
  });
  ["home.serveur.infobulle", "home.serveur.blocTitre"].forEach((k) => { if (!D[k]) manquantes.push(k); });
  t("lang/" + l + ".json : textes de la pastille complets" + (manquantes.length ? " — MANQUE " + manquantes.join(", ") : ""),
    manquantes.length === 0);
});

console.log("");
if (ko) {
  console.log("⚠️ " + ko + " echec(s)");
  process.exit(1);
}
console.log("🎉 connexion serveur : l'app et ConfAdmin s'accordent, et myktamap.fr reste « off »");
