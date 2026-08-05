// Harness "surface d'API" : CHARGE reellement les modules IIFE et verifie que
// chaque methode annoncee existe.
//
// Pourquoi : `node -c` ne valide QUE la syntaxe. Un `WALLPAPER_MAX_PX` supprime
// mais encore reference dans le bloc d'exports passe `node -c` sans broncher et
// casse au chargement dans le navigateur (ReferenceError). C'est exactement le
// bug remonte par KARMA le 01/08 -- et le meme patch rate avait aussi fait
// SAUTER setWallpaperCadrage des exports, sans aucun signal.
const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// `prealables` : fichiers à charger dans le MÊME contexte avant celui-ci.
// Nécessaire dès qu'un module en interroge un autre au chargement (ex.
// legendCustomization qui demande ses couleurs à styleResolver) — sans ça
// chaque appel de `charger` repart d'un contexte vierge et la dépendance
// est silencieusement absente.
function charger(fichier, nomGlobal, prealables) {
  const win = {
    console: { log(){}, warn(){}, error(){} },
    indexedDB: { open() { return { onupgradeneeded: null, onsuccess: null, onerror: null }; } },
    I18n: { t: k => k, has: () => false },
    document: { createElement: () => ({ getContext: () => ({ drawImage(){} }), toBlob(){} }) },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL(){} },
    Image: function(){},
    navigator: {}
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const PREAMBULE = "var window = this; var document = this.document; var indexedDB = this.indexedDB;";
  try {
    (prealables || []).forEach(function(p) {
      vm.runInContext(PREAMBULE + fs.readFileSync(p, "utf8"), ctx);
    });
    vm.runInContext(PREAMBULE + fs.readFileSync(fichier, "utf8"), ctx);
  } catch (e) {
    t(fichier + " se charge sans erreur", false);
    console.log("   ↳ " + e.name + " : " + e.message);
    return null;
  }
  t(fichier + " se charge sans erreur", true);
  // On rend aussi le `window` simule : certains modules exposent des fonctions
  // libres (window.ktaResolveStyle) plutot qu'un objet d'API.
  const api = win[nomGlobal];
  if (api && typeof api === "object") api.__win = win;
  return api;
}

// ───────── userProfile.js ─────────
const UP = charger("js/userProfile.js", "UserProfile");
if (UP) {
  const ATTENDU = [
    "init", "get", "getPhotoBlob", "getPhotoObjectUrl", "setSurnom", "setPhoto",
    "removePhoto", "clear", "onChange", "getInitial", "getAvatarColor",
    // 🖼️ v1.74.0 — fond d'ecran
    "setWallpaper", "removeWallpaper", "getWallpaperBlob", "getWallpaperObjectUrl",
    "setWallpaperVoile", "setWallpaperCadrage", "setWallpaperFit"
  ];
  ATTENDU.forEach(function(m) {
    t("UserProfile." + m + "() exposee", typeof UP[m] === "function");
  });
  ["PALETTE", "DB_NAME", "WALLPAPER_MAX_SHORT", "WALLPAPER_MAX_LONG"].forEach(function(c) {
    t("UserProfile." + c + " exposee", UP[c] !== undefined);
  });

  // L'etat par defaut doit porter les champs du fond d'ecran, sinon l'UI lit
  // `undefined` et les curseurs partent a la mauvaise valeur.
  const snap = UP.get();
  ["hasWallpaper", "wallVoile", "wallPosX", "wallPosY", "wallFit"].forEach(function(k) {
    t("get() expose " + k, Object.prototype.hasOwnProperty.call(snap, k));
  });
  t("voile par defaut = 55", snap.wallVoile === 55);
  t("cadrage par defaut centre", snap.wallPosX === 50 && snap.wallPosY === 50);
}

// ───────── styleResolver.js ─────────
// Expose des fonctions LIBRES sur window, pas un objet d'API.
const SR = charger("js/styleResolver.js", "ktaResolveStyle");
t("window.ktaResolveStyle() exposee",  typeof SR === "function");
["ktaStyleBuiltins", "ktaSwatchColor", "ktaTypeSwatchHtml"].forEach(function(f) {
  // Rechargement isole : on veut verifier CHAQUE nom, pas seulement le premier.
  const g = charger("js/styleResolver.js", f);
  t("window." + f + "() exposee", typeof g === "function");
});

// ───────── legendCustomization.js ─────────
// 🐛 Ajouté en v1.76.0 après un incident : la suppression de la table
// `DEFAULT_RENDERS` avait laissé `DEFAULT_RENDERS: DEFAULT_RENDERS` dans le
// bloc d'exports. `node -c` passe (la syntaxe est valide), mais le module
// mourait d'un ReferenceError au chargement navigateur — donc plus AUCUNE
// légende, plus aucun type custom. Même classe de bug que WALLPAPER_MAX_PX
// le 01/08. Ce guard ne couvrait alors que userProfile.js : il n'a rien vu.
const LC = charger("js/legendCustomization.js", "LegendCustomization", ["js/styleResolver.js"]);
if (LC) {
  const ATTENDU_LC = [
    "loadSessionState", "getSessionState", "isSessionStateEmpty", "loadPlanState",
    "getLabel", "getDefaultLabel", "isVisible", "getSource",
    "listEntries", "listCustomEntries", "findCustomEntry",
    "addCustomEntry", "removeCustomEntry", "ouvrirEditeur",
    // 🎨 v1.76.0 — override de couleur. `getColor` est appelee par
    // window.ktaResolveStyle : si elle disparait des exports, la carte perd
    // silencieusement les couleurs choisies par l'utilisateur.
    "getColor", "setColor", "hasColorOverride",
    // 🐛 v1.76.0 (F8) — decompte des objets utilisant un type, lu par la
    // confirmation de suppression de l'editeur.
    "countUsages"
  ];
  ATTENDU_LC.forEach(function(m) {
    t("LegendCustomization." + m + "() exposee", typeof LC[m] === "function");
  });
  ["SCHEMA_VERSION", "DEFAULT_LABELS", "CATEGORIES"].forEach(function(c) {
    t("LegendCustomization." + c + " exposee", LC[c] !== undefined);
  });

  // Le rendu par defaut d'une entree built-in doit etre DERIVE du style reel.
  // Si listEntries rend des couleurs vides, les pastilles de l'editeur de
  // legende deviennent grises sans que rien ne le signale.
  const traces = LC.listEntries("traces") || [];
  const principal = traces.filter(function(e) { return e.key === "principal"; })[0];
  t("listEntries(traces) rend le built-in principal", !!principal);
  t("pastille d'un trace = sa couleur de trait",
    !!principal && principal.lineColor === "#00ff00");
  const zones = LC.listEntries("zones") || [];
  const eau = zones.filter(function(e) { return e.key === "eau"; })[0];
  t("pastille d'une zone = fond + bordure",
    !!eau && eau.fillColor === "#3aa9e8" && eau.borderColor === "#0066aa");
  const structs = LC.listEntries("structures") || [];
  const front1 = structs.filter(function(e) { return e.key === "front-1"; })[0];
  t("pastille d'un front = un TRAIT, pas un polygone",
    !!front1 && front1.lineColor === "#f4c542" && !front1.fillColor);

  // Boucle complete de l'override : on choisit une couleur, la pastille de
  // l'editeur doit la refleter (elle passe par le resolveur), puis le retrait
  // doit rendre EXACTEMENT la couleur d'origine.
  t("pas d'override au depart", LC.hasColorOverride("traces", "principal") === false);
  LC.setColor("traces", "principal", "#abcdef");
  t("setColor est enregistre", LC.getColor("traces", "principal") === "#abcdef");
  t("hasColorOverride bascule", LC.hasColorOverride("traces", "principal") === true);
  const apres = (LC.listEntries("traces") || []).filter(function(e) { return e.key === "principal"; })[0];
  t("la pastille de l'editeur suit l'override", !!apres && apres.lineColor === "#abcdef");
  t("listEntries expose hasColor", !!apres && apres.hasColor === true);
  LC.setColor("traces", "principal", null);
  t("retrait de l'override = retour au canon",
    LC.getColor("traces", "principal") === null &&
    (LC.listEntries("traces") || []).filter(function(e) { return e.key === "principal"; })[0].lineColor === "#00ff00");

  // L'override doit VOYAGER avec la session, sinon il est perdu au reload.
  LC.setColor("zones", "eau", "#010203");
  const snap = LC.getSessionState();
  t("getSessionState embarque les couleurs", !!snap.colors && snap.colors["zones.eau"] === "#010203");
  LC.loadSessionState(null);
  t("loadSessionState(null) purge les couleurs", LC.getColor("zones", "eau") === null);
  LC.loadSessionState(snap);
  t("recharger la session restaure les couleurs", LC.getColor("zones", "eau") === "#010203");
  LC.loadSessionState(null);
}

console.log(ko === 0 ? "\n🎉 tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
