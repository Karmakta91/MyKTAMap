#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔌 check-connexion-serveur.js — garde-fou pré-commit BLOQUANT (v2.0.0)
// =====================================================================
// LE CONTRAT (docs/architecture/community-server-line.md §3) : une instance
// déclare `index.json > config.serverConnection` ; l'app en tire un état
// (off · invalide · licence · configuree) affiché dans le pied de page.
// myktamap.fr n'a pas de backend et n'en aura jamais : l'état y vaut « off ».
//
// 🩸 CE QUI PEUT MAL TOURNER, ET QUE CE SCRIPT ATTRAPE :
//   1. ConfAdmin et l'app qui ne valident pas pareil : un index que l'outil
//      du déployeur juge bon, et que l'app refuse (ou l'inverse). On EXÉCUTE
//      les deux fonctions sur la même table de cas.
//   2. « Index injoignable » confondu avec « connexion coupée » : une instance
//      connectée ouverte hors ligne passerait pour désactivée (décision KARMA :
//      elle est HS, pas OFF), ou une coupure réseau effacerait la mémoire.
//   3. Une licence importée par l'utilisateur qui suffirait à passer en
//      « configurée » (règle E : seule la source "server" compte).
//   4. La mémoire de l'instance partie dans l'export de profil (c'est une
//      donnée de l'instance, pas de l'utilisateur).
//   5. Une requête réseau glissée dans le module : il ne doit RIEN contacter.
//
// COMMENT : le vrai js/ktaExtensions.js tourne dans un `vm` avec un faux
// localStorage ; la fonction de confadmin.html est extraite du vrai fichier.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const MOD  = fs.readFileSync("js/ktaExtensions.js", "utf8");
const CA   = fs.readFileSync("confadmin.html", "utf8");
const MAIN = fs.readFileSync("js/main.js", "utf8");
const HOME = fs.readFileSync("js/homeLoader.js", "utf8");
const IDX  = fs.readFileSync("index.html", "utf8");
const SW   = fs.readFileSync("sw.js", "utf8");
const PROF = fs.readFileSync("js/profileExportImport.js", "utf8");

// ═════════ 1. LE MODULE, EXÉCUTÉ ═════════
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

// ═════════ 2. CONFADMIN, EXTRAIT ET EXÉCUTÉ ═════════
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

// ═════════ 3. TABLE DE CAS : APP ET CONFADMIN CONCORDENT ═════════
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
  ["21 modules", { state: "on", api: OK.api, modules: Array.from({ length: 21 }, (_, i) => "pro/m" + i + ".js") }, "invalide"]
];
if (K && validerCA) {
  CAS.forEach(([nom, entree, attendu]) => {
    const a = K.valider(entree), b = validerCA(entree);
    t("cas « " + nom + " » → " + attendu, a.etat === attendu);
    t("   …et ConfAdmin rend exactement la même chose", JSON.stringify(a) === JSON.stringify(b));
  });
  const v = K.valider(OK);
  t("valider() ne garde que state/api/modules (aucun champ inconnu ne passe)",
    v.api === OK.api && v.modules.join() === "pro/sync.js");
}

// ═════════ 4. TABLE DE VÉRITÉ DES ÉTATS (règle E) ═════════
if (K) {
  const on = K.valider(OK);
  t("off reste off, quelle que soit la licence", K.etatDe(K.valider(undefined), "server") === "off");
  t("invalide reste invalide, même avec licence serveur", K.etatDe(K.valider("on"), "server") === "invalide");
  t("« on » sans licence → licence", K.etatDe(on, null) === "licence");
  t("🩸 « on » + licence IMPORTÉE (local) → licence, pas configurée", K.etatDe(on, "local") === "licence");
  t("« on » + licence serveur → configuree", K.etatDe(on, "server") === "configuree");
}

// ═════════ 5. RÈGLE B : INDEX INJOIGNABLE ≠ CONNEXION COUPÉE ═════════
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

// ═════════ 6. CÂBLAGE ═════════
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
// v2.7.0 (chantier 3) : le module porte le GARDE des requêtes d'extension.
// Règle : un seul fetch, dans requete() ; jamais de XHR/beacon/socket ; le
// module ne contacte JAMAIS le serveur de lui-même (seule une extension
// l'appelle), et en OFF requete refuse avant tout envoi (cf check-extensions).
{
  const sansComm = MOD.replace(/\/\/.*$/gm, "");
  const nFetch = (sansComm.match(/\bfetch\s*\(/g) || []).length;
  const d = sansComm.indexOf("function requete(");
  let corps = "";
  if (d >= 0) { const o = sansComm.indexOf("{", d); let pr = 0;
    for (let k = o; k < sansComm.length; k++) { if (sansComm[k] === "{") pr++; else if (sansComm[k] === "}") { pr--; if (pr === 0) { corps = sansComm.slice(d, k + 1); break; } } } }
  t("🩸 un seul fetch dans le module, et il vit dans requete() (le garde)", nFetch === 1 && /\bfetch\s*\(/.test(corps));
  t("🩸 ni XHR, ni beacon, ni socket dans le module", !/XMLHttpRequest|sendBeacon|WebSocket|EventSource/.test(sansComm));
}
t("ConfAdmin refuse l'export tant que le champ est invalide",
  /\$\("caDownload"\)\.addEventListener\("click", function\(\) \{\s*if \(!_connexionSaisie\(\)\.valide\) return;/.test(CA) &&
  /\$\("caCopy"\)\.addEventListener\("click", function\(\) \{\s*if \(!_connexionSaisie\(\)\.valide\) return;/.test(CA));

// ═════════ 7. TEXTES : un libellé et une explication par état, 3 langues ═════════
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
