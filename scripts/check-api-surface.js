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
    "countUsages",
    // 🧹 v1.76.0 (F19/F23) — exporter.js DELEGUE sa dialog d'ajout a
    // ouvrirAddDialog (son clone de 209 lignes a ete supprime) : si ce nom
    // change, le bouton ➕ de la modale Export devient un no-op silencieux.
    // listOrphanTypes est lu par le bandeau ⚠️ de la Legende.
    "ouvrirAddDialog", "listOrphanTypes",
    // 🎨 v1.76.1 — bordure independante (lues par ktaResolveStyle).
    "getBorderColor", "setBorderColor"
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

  // F22 — `hidden` au format TABLEAU (forme qui a reellement circule, cf.
  // Array.isArray dans createConf) doit etre MIGRE en objet au chargement :
  // avant, tous les lookups rendaient undefined et les masquages etaient
  // perdus en silence.
  LC.loadSessionState({ hidden: ["traces.principal"], labels: {}, customEntries: [] });
  t("hidden en tableau : le masquage est bien applique", LC.isVisible("traces", "principal") === false);
  t("hidden en tableau : les autres types restent visibles", LC.isVisible("traces", "chemin") === true);
  const snapH = LC.getSessionState();
  t("hidden re-serialise en OBJET", !Array.isArray(snapH.hidden) && snapH.hidden["traces.principal"] === true);
  LC.loadSessionState(null);

  // F21 — collision d'id plan/session : UNE seule ligne, variante session.
  LC.__win.PLAN_CONFIG = { customLegend: { labels: {}, hidden: {}, customEntries: [
    { id: "cust-dup", category: "traces", geometry: "polyline", label: "Version PLAN", lineColor: "#111111" },
    { id: "cust-planonly", category: "traces", geometry: "polyline", label: "Plan seul", lineColor: "#222222" }
  ] } };
  LC.loadPlanState();
  LC.loadSessionState({ labels: {}, hidden: {}, customEntries: [
    { id: "cust-dup", category: "traces", geometry: "polyline", label: "Version SESSION", lineColor: "#333333" }
  ] });
  const lst = LC.listCustomEntries("traces");
  t("collision d'id : une seule ligne", lst.filter(function(e) { return e.id === "cust-dup"; }).length === 1);
  t("collision d'id : la variante SESSION gagne",
    lst.filter(function(e) { return e.id === "cust-dup"; })[0].label === "Version SESSION");
  t("l'entree plan sans collision reste listee", lst.some(function(e) { return e.id === "cust-planonly"; }));
  t("ordre historique conserve (plan d'abord)", lst[0].id === "cust-dup" && lst[1].id === "cust-planonly");
  LC.loadSessionState(null);
  // 🖊️ v1.82.0 — RENOMMER / RECOLORER une entrée PLAN-LEVEL. Symétrique du
  // tombstone ci-dessus, et resté en plan pendant tout ce temps :
  // `updateCustomEntry` ne cherchait que dans la session et sortait sur
  // `return false` sans rien dire. Les entrées d'un plan importé (un type par
  // niveau, fabriqués par l'import SIG) étaient donc listées mais inertes.
  // Vécu KARMA sur « +1 (historique) ».
  (function () {
    LC.loadSessionState(null);
    LC.__win.PLAN_CONFIG = { plan: { customLegend: { labels: {}, hidden: {}, customEntries: [
      { id: "cust-sig-structures-l-n1", category: "structures", geometry: "polyline",
        label: "Structure +1", lineColor: "#8cb4ff" }
    ] } } };
    LC.loadPlanState();
    const avant = LC.listCustomEntries("structures").find(function (e) { return e.id === "cust-sig-structures-l-n1"; });
    t("plan-level : l'entrée est listée, source « plan »", !!avant && avant.source === "plan");
    t("plan-level : renommer RETOURNE VRAI (le bug : c'était false)",
      LC.updateCustomEntry("cust-sig-structures-l-n1", { label: "Topo historique" }) === true);
    const apres = LC.listCustomEntries("structures").find(function (e) { return e.id === "cust-sig-structures-l-n1"; });
    t("plan-level : le nouveau nom est servi", !!apres && apres.label === "Topo historique");
    t("plan-level : l'entrée passe en source « session » (l'user l'a reprise)",
      !!apres && apres.source === "session");
    t("plan-level : une seule ligne, pas un doublon",
      LC.listCustomEntries("structures").filter(function (e) { return e.id === "cust-sig-structures-l-n1"; }).length === 1);
    t("plan-level : le résolveur sert le nom repris",
      (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).label === "Topo historique");
    t("plan-level : la géométrie déclarée survit à la promotion",
      (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).geometry === "polyline");
    t("plan-level : recolorer marche aussi (mêmes 3 couleurs, même chemin)",
      LC.updateCustomEntry("cust-sig-structures-l-n1", { lineColor: "#ff0000" }) === true
      && (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).lineColor === "#ff0000");
    t("plan-level : la modification voyage avec la session",
      (LC.getSessionState().customEntries || []).some(function (e) {
        return e.id === "cust-sig-structures-l-n1" && e.label === "Topo historique";
      }));
    LC.loadPlanState();   // recharger le plan ne doit pas ecraser la reprise
    t("plan-level : survit au rechargement du plan",
      (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).label === "Topo historique");
    LC.resetSession();
    t("plan-level : resetSession rend le nom d'origine du plan",
      (LC.findCustomEntry("cust-sig-structures-l-n1") || {}).label === "Structure +1");
    t("plan-level : un id inconnu du plan ET de la session reste refusé",
      LC.updateCustomEntry("cust-inexistant", { label: "x" }) === false);
    LC.__win.PLAN_CONFIG = null;
    LC.loadPlanState();
    LC.loadSessionState(null);
  })();

  LC.__win.PLAN_CONFIG = null;
  LC.loadPlanState();

  // 🐛 05/08 — LA CARTE DOIT SE REPEINDRE, pas seulement l'état changer.
  // Deux bugs successifs de la même famille : l'override livré sans
  // repeinture, puis le RESET livré sans repeinture (retour des couleurs
  // d'origine seulement au redémarrage). On vérifie donc que chaque mutation
  // qui change un rendu déclenche bien les render* : setColor, resetSession,
  // removeCustomEntry, updateCustomEntry.
  (function() {
    let repeints = 0;
    ["renderRoads", "renderZones", "renderStructures"].forEach(function(fn) {
      LC.__win[fn] = function() { repeints++; };
    });
    function _mutationRepeint(nom, mutation) {
      repeints = 0;
      mutation();
      t(nom + " repeint la carte", repeints >= 3);
    }
    _mutationRepeint("setColor", function() { LC.setColor("traces", "principal", "#0000aa"); });
    _mutationRepeint("resetSession (bug du restart)", function() { LC.resetSession(); });
    // C1 (audit 06/08) : l'AJOUT repeint aussi — c'etait la seule mutation
    // sans repeinture, source de l'intermittence « Lier colore, ➕ non ».
    _mutationRepeint("addCustomEntry (C1, l'oublie de la famille)", function() {
      LC.addCustomEntry({ category: "zones", label: "tmpC1", geometry: "polygon", fillColor: "#456789" });
    });
    // addCustomEntry retourne l'ID (string), pas l'entrée.
    const idTmp = LC.addCustomEntry({ category: "traces", label: "tmp", geometry: "polyline", lineColor: "#123123" });
    _mutationRepeint("updateCustomEntry", function() { LC.updateCustomEntry(idTmp, { lineColor: "#321321" }); });
    _mutationRepeint("removeCustomEntry", function() { LC.removeCustomEntry(idTmp); });
    ["renderRoads", "renderZones", "renderStructures"].forEach(function(fn) { delete LC.__win[fn]; });
    LC.loadSessionState(null);
  })();

  // 💣 Corruption du stockage (checkup destructif M3, 05/08) : la session en
  // localStorage, le plan-config et les calques importes sont des entrees NON
  // FIABLES. Une entree `null` dans customEntries plantait listCustomEntries
  // (TypeError) -> plus de legende NI de sidebar au boot. Ces cas verrouillent
  // la regle : _normalize assainit TOUT, aucun lecteur ne crash sur du pourri.
  t("customLegend = 42 ne casse rien", (function() {
    LC.loadSessionState(42);
    return LC.listCustomEntries("traces").length === 0 && LC.isVisible("traces", "principal");
  })());
  t("entree null/invalide filtree a l'entree", (function() {
    LC.loadSessionState({ labels: {}, hidden: {}, colors: {},
      customEntries: [ {}, { id: "cust-ok", category: "traces", geometry: "polyline", lineColor: "#123456" }, { category: "bidon" }, null ] });
    const l = LC.listCustomEntries("traces");
    return l.length === 1 && l[0].id === "cust-ok";
  })());
  t("labels null / colors tableau -> ignores sans crash", (function() {
    LC.loadSessionState({ labels: null, colors: [], hidden: {}, customEntries: [] });
    return LC.getLabel("traces", "principal") !== null && LC.getColor("traces", "principal") === null;
  })());
  LC.loadSessionState(null);

  // 🎨 v1.76.1 — bordure independante : persiste, voyage, se reset.
  LC.setBorderColor("zones", "eau", "#121212");
  t("setBorderColor est enregistre", LC.getBorderColor("zones", "eau") === "#121212");
  t("hasColorOverride vrai sur bordure seule", LC.hasColorOverride("zones", "eau") === true);
  const snapB = LC.getSessionState();
  t("getSessionState embarque les bordures", !!snapB.borders && snapB.borders["zones.eau"] === "#121212");
  LC.loadSessionState(snapB);
  t("recharger la session restaure les bordures", LC.getBorderColor("zones", "eau") === "#121212");
  LC.setBorderColor("zones", "eau", null);
  t("retrait de la bordure -> plus d'override", LC.hasColorOverride("zones", "eau") === false);
  LC.loadSessionState(null);

  // 🧷 v1.76.1 — LIAISON PAR ID TECHNIQUE (le mur « Bas » de KARMA) :
  // une entree peut porter l'id EXACT d'un type brut deja present dans les
  // donnees ; le resolveur la sert comme n'importe quel custom.
  const idBas = LC.addCustomEntry({ id: "Bas", category: "zones", geometry: "polygon", label: "Zone basse", fillColor: "#334455" });
  t("addCustomEntry accepte un id explicite", idBas === "Bas");
  t("le resolveur sert le type brut lie", (function() {
    const s = LC.__win.ktaResolveStyle("zones", "Bas");
    return !!s && s.fillColor === "#334455";
  })());
  // re-liaison (double-clic bandeau) : REMPLACE, n'empile pas
  LC.addCustomEntry({ id: "Bas", category: "zones", geometry: "polygon", label: "Zone basse v2", fillColor: "#556677" });
  const lstBas = LC.listCustomEntries("zones").filter(function(e) { return e.id === "Bas"; });
  t("id explicite re-ajoute : remplace, pas de doublon", lstBas.length === 1 && lstBas[0].label === "Zone basse v2");
  // orphelins : un type brut SANS entree est signale, AVEC entree non
  LC.__win.getZones = function() { return [ { type: "Bas" }, { type: "Perdu" }, { type: "eau" } ]; };
  const orph = LC.listOrphanTypes();
  t("type brut sans entree = orphelin signale", orph.some(function(o) { return o.type === "Perdu"; }));
  t("type brut AVEC entree liee = pas orphelin", !orph.some(function(o) { return o.type === "Bas"; }));
  t("type built-in jamais orphelin", !orph.some(function(o) { return o.type === "eau"; }));
  delete LC.__win.getZones;
  LC.loadSessionState(null);

  // C4 (audit 06/08) — LA LEGENDE PLAN-LEVEL ETAIT MORTE DEPUIS SON
  // INTRODUCTION : loadPlanState lisait PLAN_CONFIG.customLegend (racine),
  // tous les producteurs ecrivent plan.customLegend (sous-objet). Ces cas
  // verrouillent la lecture des DEUX formes.
  LC.__win.PLAN_CONFIG = { plan: { customLegend: { labels: { "traces.principal": "Nom plan" }, hidden: {}, customEntries: [
    { id: "cust-duplan", category: "zones", geometry: "polygon", label: "Du plan", fillColor: "#9a9a9a" }
  ] } } };
  LC.loadPlanState();
  t("C4 : plan.customLegend (sous-objet, forme REELLE des ZIP) est lu",
    LC.getLabel("traces", "principal") === "Nom plan" &&
    LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-duplan"; }));
  LC.__win.PLAN_CONFIG = { customLegend: { labels: { "traces.chemin": "Racine" }, hidden: {}, customEntries: [] } };
  LC.loadPlanState();
  t("C4 : la forme racine reste lue (retro-compat)", LC.getLabel("traces", "chemin") === "Racine");
  LC.__win.PLAN_CONFIG = null;
  LC.loadPlanState();

  // Annexe 6 (audit 06/08) — suspendPersist coupe l'ecriture SessionPersist
  // pendant le swap du Generateur (la legende du PLAN fuyait dans le slot de
  // SESSION du plan charge).
  (function() {
    let saves = 0;
    LC.__win.SessionPersist = { save: function() { saves++; } };
    LC.suspendPersist(true);
    LC.setColor("traces", "principal", "#0a0a0a");
    t("suspendPersist(true) : aucune ecriture session", saves === 0);
    LC.suspendPersist(false);
    LC.setColor("traces", "principal", null);
    t("suspendPersist(false) : la persistance repart", saves > 0);
    delete LC.__win.SessionPersist;
    LC.loadSessionState(null);
  })();

  // 🪦 v1.76.5 — TOMBSTONES : une entrée PLAN-LEVEL supprimée par
  // l'utilisateur ne doit PAS revenir du plan-config au prochain chargement
  // (vécu KARMA : « Bas » embarqué dans un ZIP régénéré, insupprimable).
  LC.__win.PLAN_CONFIG = { plan: { customLegend: { labels: {}, hidden: {}, customEntries: [
    { id: "cust-fantome", category: "zones", geometry: "polygon", label: "Fantôme", fillColor: "#808080" }
  ] } } };
  LC.loadPlanState();
  t("tombstone : l'entrée plan est listée avant suppression",
    LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-fantome"; }));
  t("tombstone : removeCustomEntry accepte une entrée PLAN", LC.removeCustomEntry("cust-fantome") === true);
  t("tombstone : l'entrée plan disparaît de la liste",
    !LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-fantome"; }));
  t("tombstone : findCustomEntry ne la sert plus (résolveur au repli)", LC.findCustomEntry("cust-fantome") === null);
  t("tombstone : persisté dans la session", (LC.getSessionState().removedPlan || []).indexOf("cust-fantome") >= 0);
  LC.loadPlanState();   // re-chargement du plan : elle ne revient PAS
  t("tombstone : survit au rechargement du plan",
    !LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-fantome"; }));
  LC.resetSession();
  t("tombstone : resetSession la fait revenir (voulu et documenté)",
    LC.listCustomEntries("zones").some(function(e) { return e.id === "cust-fantome"; }));
  LC.__win.PLAN_CONFIG = null;
  LC.loadPlanState();
  LC.loadSessionState(null);

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
