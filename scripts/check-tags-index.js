#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🏷️ check-tags-index.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// LA DEMANDE (KARMA, 07/09/2026) : « rajoute la possibilité de rajouter des
// tags sur un plan serveur depuis l'index (et donc depuis le générateur de
// conf) (important pour filtrer facilement) ».
//
// LE CONTRAT RETENU : **L'INDEX PROPOSE, L'UTILISATEUR DISPOSE.**
//
// 🩸 CE QUI SE PASSE SI ON NE LE TIENT PAS. `decouvrirPlansServeur` tourne à
// CHAQUE démarrage. Une écriture inconditionnelle des tags de `index.json`
// écraserait ceux que l'utilisateur a posés dans ℹ️ Infos — à chaque boot,
// silencieusement. C'est EXACTEMENT le ping-pong corrigé en v1.88.0 sur
// `version` (`versionSrc`), et il ne se voit pas : rien ne casse, les tags
// « reviennent » simplement tout seuls.
//
// 🩸 ET LE SYMÉTRIQUE, PLUS SOURNOIS : vider ses tags est un CHOIX. Sans trace
// du refus, la découverte suivante reproposerait ceux de l'index. L'utilisateur
// effacerait, et ils repousseraient.
//
// COMMENT ON CONTRÔLE : on n'inspecte pas du texte, on EXÉCUTE. `planRegistry`
// tourne dans un `vm` avec un faux localStorage, et le bloc de décision de
// `main.js` est extrait du vrai fichier puis exécuté sur ses cinq cas. Un
// `grep` ne verrait ni une TDZ, ni une variable hors portée, ni une condition
// inversée — les trois erreurs qui ont réellement coûté des heures ici
// (SW v1.88.0, `meta` v1.88.1, `_lancerHorsLigneLigne` v1.90.0).
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const MAIN = fs.readFileSync("js/main.js", "utf8");
const REG  = fs.readFileSync("js/planRegistry.js", "utf8");
const CA   = fs.readFileSync("confadmin.html", "utf8");
const HOME = fs.readFileSync("js/homeLoader.js", "utf8");

// ═════════ 1. LE REGISTRE, EXÉCUTÉ ═════════
let PR = null;
{
  const store = {};
  const win = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    indexedDB: { open() { return { addEventListener() {}, onsuccess: null, onerror: null, onupgradeneeded: null }; } }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext("var localStorage = window.localStorage, indexedDB = window.indexedDB, console = window.console;", ctx);
  try {
    vm.runInContext(REG, ctx, { filename: "planRegistry.js" });
    PR = win.PlanRegistry;
  } catch (e) {
    t("js/planRegistry.js s'exécute (une TDZ serait attrapée ICI, pas en prod) — " + e.message, false);
  }
  t("le registre expose setTags", !!(PR && typeof PR.setTags === "function"));
}

if (PR) {
  const ID = "server_essai";
  const neuf = () => {
    PR.removeAll();
    PR.addOrUpdate({ id: ID, type: "server", path: "data/essai", name: "Essai" });
  };

  // — l'index pose ses tags, et son origine —
  neuf();
  PR.setTags(ID, ["gironde", "carriere"], "index");
  let p = PR.findById(ID);
  t("🏷️ l'index pose les tags", !!(p.tags && p.tags.join("|") === "gironde|carriere"));
  t("🏷️ …et laisse sa signature (tagsSrc=index)", p.tagsSrc === "index");

  // — l'utilisateur reprend la main —
  PR.setTags(ID, ["a moi"]);
  p = PR.findById(ID);
  t("✍️ l'édition utilisateur écrase la proposition", p.tags.join("|") === "a moi");
  t("✍️ …et marque l'origine « user » (défaut sans 3ᵉ argument)", p.tagsSrc === "user");

  // — 🩸 vider est un CHOIX, la trace du refus survit —
  PR.setTags(ID, []);
  p = PR.findById(ID);
  t("🩸 vider retire bien les tags", !p.tags);
  t("🩸 …mais GARDE la trace du refus, sinon l'index les reproposerait au boot suivant",
    p.tagsSrc === "user");

  // — l'index qui retire ses propres tags relâche sa signature —
  PR.setTags(ID, ["a"], "index");
  PR.setTags(ID, [], "index");
  p = PR.findById(ID);
  t("🏷️ l'index qui retire ses tags relâche aussi son origine", !p.tags && !p.tagsSrc);

  // — la normalisation, la seule de l'app —
  neuf();
  PR.setTags(ID, ["  a  ", "A", "", null, "b"]);
  t("🧹 trim + dédup insensible à la casse + vides écartés",
    PR.findById(ID).tags.join("|") === "a|b");
  PR.setTags(ID, [new Array(60).join("x")]);
  t("🧹 24 caractères maximum par tag", PR.findById(ID).tags[0].length === 24);
  PR.setTags(ID, Array.from({ length: 30 }, (_, i) => "t" + i));
  t("🧹 12 tags maximum", PR.findById(ID).tags.length === 12);
}

// ═════════ 2. LE BLOC DE DÉCISION DE main.js, EXÉCUTÉ ═════════
// 🩸 On l'extrait du VRAI fichier : une copie recopiée ici testerait le
// garde-fou, pas l'application.
{
  const dep = MAIN.indexOf("if (Array.isArray(entry && entry.tags)");
  t("le bloc de décision des tags est trouvable dans decouvrirPlansServeur", dep >= 0);
  let bloc = "";
  if (dep >= 0) {
    let fin = MAIN.indexOf("{", dep), prof = 0;
    for (let i = fin; i < MAIN.length; i++) {
      if (MAIN[i] === "{") prof++;
      else if (MAIN[i] === "}") { prof--; if (prof === 0) { fin = i + 1; break; } }
    }
    while (/^\s*else\b/.test(MAIN.slice(fin, fin + 12))) {
      let q = 0, dep2 = MAIN.indexOf("{", fin);
      for (let i = dep2; i < MAIN.length; i++) {
        if (MAIN[i] === "{") q++;
        else if (MAIN[i] === "}") { q--; if (q === 0) { fin = i + 1; break; } }
      }
    }
    bloc = MAIN.slice(dep, fin);
  }

  // Cinq scénarios joués sur un faux registre qui note ce qu'on lui demande.
  const scenarios = [
    ["index propose, plan vierge → APPLIQUÉ",
      { tags: ["a", "b"] }, null, ["a,b|index"]],
    ["🩸 index propose, tags ÉDITÉS À LA MAIN → ON N'Y TOUCHE PAS",
      { tags: ["a"] }, { tags: ["mien"], tagsSrc: "user" }, []],
    ["index propose, tags déjà venus de l'index → rafraîchis",
      { tags: ["c"] }, { tags: ["a"], tagsSrc: "index" }, ["c|index"]],
    ["index retire ses tags → ceux qu'il avait posés s'en vont",
      {}, { tags: ["a"], tagsSrc: "index" }, ["|index"]],
    ["🩸 index sans tags + tags utilisateur → intouchés",
      {}, { tags: ["mien"], tagsSrc: "user" }, []]
  ];

  scenarios.forEach(function (s) {
    const vus = [];
    const sandbox = {
      entry: s[1], _dejaLa: s[2], id: "server_x",
      window: { PlanRegistry: { setTags: function (i2, tg, org) { vus.push((tg || []).join(",") + "|" + (org || "")); } } }
    };
    let err = null;
    try { vm.runInNewContext(bloc, sandbox, { filename: "main.decision.js" }); }
    catch (e) { err = e.message; }
    t("🧪 " + s[0] + (err ? " — EXCEPTION : " + err : ""),
      !err && vus.join(" / ") === s[3].join(" / "));
  });
}

// ═════════ 3. CONFADMIN : LE GÉNÉRATEUR ═════════
{
  t("⚙️ ConfAdmin : la colonne Tags existe dans le tableau", CA.indexOf("<th>Tags</th>") >= 0);
  t("⚙️ ConfAdmin : un champ de saisie par plan", CA.indexOf('data-f="tags"') >= 0);
  t("⚙️ ConfAdmin : les tags sortent dans index.json", /if \(tg\.length\) e\.tags = tg;/.test(CA));
  t("⚙️ ConfAdmin : on peut REPRENDRE un index.json existant (sans redéposer les ZIPs)",
    CA.indexOf('id="caLoadIndex"') >= 0 && CA.indexOf('id="caIndexInput"') >= 0);
  t("🩸 ConfAdmin : reprendre un index ne perd pas ses liaisons",
    /else if \(_liaisonsReprises\) out\.liaisons = _liaisonsReprises;/.test(CA));

  // 🩸 LA DIVERGENCE QUI NE SE VOIT PAS : si ConfAdmin normalisait autrement que
  // le moteur, il publierait des tags que l'app rognerait en silence — l'auteur
  // du kiosque verrait un filtre annoncé qui ne remonte jamais. On exécute les
  // DEUX normalisations sur les mêmes entrées et on compare.
  const m = CA.match(/function _normTags\(v\) \{[\s\S]*?\n  \}/);
  t("⚙️ ConfAdmin : le normaliseur _normTags est trouvable", !!m);
  if (m && PR) {
    const sb = { String: String, resultat: null };
    vm.runInNewContext(m[0] + "; resultat = _normTags;", sb, { filename: "confadmin.normtags.js" });
    const ID = "server_cmp";
    const CAS = [
      "  a  , A , , b",
      new Array(60).join("x"),
      Array.from({ length: 30 }, (_, i) => "t" + i).join(","),
      "gironde, carriere, Gironde"
    ];
    let identiques = true, detail = "";
    CAS.forEach(function (c) {
      const a = sb.resultat(c);
      PR.removeAll();
      PR.addOrUpdate({ id: ID, type: "server", name: "x" });
      PR.setTags(ID, c.split(","));
      const b = PR.findById(ID).tags || [];
      if (a.join("|") !== b.join("|")) {
        identiques = false;
        detail += " [« " + c.slice(0, 18) + " » → ConfAdmin:" + a.join("|") + " ≠ app:" + b.join("|") + "]";
      }
    });
    t("🩸 ConfAdmin et le moteur normalisent À L'IDENTIQUE (sinon l'app rogne en silence)" + detail,
      identiques);
  }
}

// ═════════ 4. LA FONCTION A UN CONSOMMATEUR ═════════
// 🩸 Publier des tags que rien n'affiche ni ne filtre serait une fonction morte.
t("🔎 les tags du plan s'affichent en chips sur sa ligne (HOME)",
  /Array\.isArray\(plan\.tags\) && plan\.tags\.length/.test(HOME));
t("🔎 les tags filtrent la liste des plans",
  /_plansTagFilter\.has\(tg\.toLowerCase\(\)\)/.test(HOME));
t("🔎 l'utilisateur peut toujours les éditer dans ℹ️ Infos",
  /PlanRegistry\.setTags\(plan\.id,/.test(HOME));

// ═════════ 5. LE FILTRE PAR ÉTIQUETTE DES STATS DU PROFIL (v1.90.4) ═════════
// Demande KARMA : « rajoute un graph de ce genre via les tags des plans
// (possibilité de filtrer et exclure) ».
//
// 🩸 LA RÈGLE QUI SE TROMPE FACILEMENT : l'EXCLUSION L'EMPORTE sur
// l'inclusion. Un plan tagué « gironde » ET « brouillon », avec gironde inclus
// et brouillon exclu, doit être ÉCARTÉ. L'inverse ferait rentrer par une porte
// ce qu'on vient de fermer par l'autre — et c'est précisément le cas d'usage
// (« sors-moi l'atlas de mes stats »). Un `||` au lieu d'un `&&`, ou les deux
// tests dans le mauvais ordre, et le filtre ment sans rien casser d'apparent.
//
// On EXÉCUTE la fonction extraite du vrai fichier sur ses cas limites.
{
  const HP = fs.readFileSync("js/homeProfile.js", "utf8");
  const d = HP.indexOf("function _planRetenu(entree) {");
  let code = null;
  if (d >= 0) {
    let prof = 0;
    for (let i = HP.indexOf("{", d); i < HP.length; i++) {
      if (HP[i] === "{") prof++;
      else if (HP[i] === "}") { prof--; if (prof === 0) { code = HP.slice(d, i + 1); break; } }
    }
  }
  t("🏷️ la règle de rétention est extractible", !!code);

  if (code) {
    const SANS = "\u0000sans-etiquette";
    const jouer = (tags, filtre) => {
      const sb = { SANS_TAG: SANS, _filtreTags: filtre };
      vm.runInNewContext(code + "; resultat = _planRetenu({ tags: " + JSON.stringify(tags) + " });",
        sb, { filename: "homeProfile.filtre.js" });
      return sb.resultat;
    };

    t("sans filtre, tout est retenu", jouer(["gironde"], {}) === true);
    t("inclure : seuls les plans qui portent l'étiquette",
      jouer(["gironde"], { gironde: "in" }) === true &&
      jouer(["paris"],   { gironde: "in" }) === false);
    t("exclure : les plans qui la portent sortent",
      jouer(["gironde"], { gironde: "out" }) === false &&
      jouer(["paris"],   { gironde: "out" }) === true);
    t("🩸 L'EXCLUSION L'EMPORTE sur l'inclusion (sinon « sors-moi l'atlas » ne marche pas)",
      jouer(["gironde", "brouillon"], { gironde: "in", brouillon: "out" }) === false);
    t("la casse est ignorée (« Gironde » et « gironde » sont la même étiquette)",
      jouer(["Gironde"], { gironde: "in" }) === true);
    t("un plan SANS étiquette a sa propre sentinelle, filtrable comme les autres",
      jouer([], {}) === true &&
      jouer([], { "\u0000sans-etiquette": "out" }) === false &&
      jouer([], { gironde: "in" }) === false);

    // 🩸 L'IMPASSE : si le filtre exclut tout, les chips doivent SURVIVRE.
    // Sans elles, l'utilisateur n'a plus aucun moyen de revenir en arrière —
    // le même piège que le flag kiosque qui cachait son propre remède.
    t("🩸 filtre excluant tout : le bloc reste affiché (sinon aucun retour possible)",
      /const filtreActif = Object\.keys\(_filtreTags\)\.length > 0;/.test(HP) &&
      /activeSections\.length === 0 && !filtreActif\) return;/.test(HP));

    // Le filtre ne doit RIEN persister : au retour dans la modale, des plans
    // manquants sans explication passeraient pour une perte de données.
    t("🩸 le filtre ne persiste nulle part (aucune clé de stockage)",
      !/_filtreTags[\s\S]{0,200}localStorage/.test(HP));

    t("tous les camemberts suivent le filtre, pas seulement celui des étiquettes",
      /if \(_statsParPlan\.length\) breakdowns = _agregerFiltre\(\);/.test(HP));
    t("un clic re-rend le bloc entier", /_renderProfilePies\(breakdowns, labels\);/.test(HP));
    t("🩸 le clic est délégué au conteneur (les chips renaissent à chaque rendu)",
      /piesContainer\.addEventListener\("click"/.test(HP));
  }
}

// ═══ 6. RETROUVER LE NOM D'UN TYPE PERSONNALISÉ SANS OUVRIR LE PLAN (v1.90.5) ═══
// VÉCU (KARMA, capture) : « toujours un souci ». La v1.90.3 mémorisait le nom
// AU CHARGEMENT du plan — donc elle ne réparait rien pour les plans déjà
// ouverts AVANT elle : leur cache de stats date d'avant et n'a pas de `labels`.
// Le message disait vrai (« ouvre ces plans une fois ») mais imposait vingt
// ouvertures pour un affichage.
//
// 🩸 CE QU'ON NE PEUT PAS FAIRE : aller lire les vingt plan-config au
// chargement de la fenêtre. Vingt requêtes pour un widget que l'utilisateur
// n'a peut-être pas ouvert pour ça. La recherche est donc SUR DEMANDE, et le
// bouton annonce combien de plans il va lire — on ne déclenche pas du réseau
// dans le dos de quelqu'un.
{
  const HP = fs.readFileSync("js/homeProfile.js", "utf8");

  // — le dictionnaire DURABLE, indépendant du cache de stats —
  t("🏷️ un dictionnaire de noms survit aux versions (clé dédiée)",
    /const LS_NOMS = "myktamap_legend_labels_v1";/.test(HP));
  t("il amorce l'agrégat", /const aggLabels = _nomsPersistes\(\);/.test(HP));
  t("le chargement d'un plan l'alimente", /_persisterNoms\(stats\.labels\);/.test(HP));
  t("🩸 …et il n'écrase jamais un nom déjà connu par une valeur vide",
    /Object\.keys\(map \|\| \{\}\)\.forEach\(function\(k\) \{ if \(map\[k\]\) cur\[k\] = map\[k\]; \}\);/.test(HP));

  // — l'extracteur de noms, EXÉCUTÉ sur les deux formes d'une légende —
  const d = HP.indexOf("function _nomsDepuisLegende(cl) {");
  let code = null;
  if (d >= 0) {
    let prof = 0;
    for (let i = HP.indexOf("{", d); i < HP.length; i++) {
      if (HP[i] === "{") prof++;
      else if (HP[i] === "}") { prof--; if (prof === 0) { code = HP.slice(d, i + 1); break; } }
    }
  }
  t("l'extracteur de noms est extractible", !!code);

  if (code) {
    const jouer = (cl) => {
      const sb = { String: String, Array: Array, Object: Object };
      vm.runInNewContext(code + "; resultat = _nomsDepuisLegende(" + JSON.stringify(cl) + ");",
        sb, { filename: "homeProfile.noms.js" });
      return sb.resultat;
    };

    // Un type né d'un import SIG vit dans `customEntries` : son NOM est son
    // identité, il n'a pas de libellé par défaut derrière lui.
    const r1 = jouer({ customEntries: [
      { id: "cust-sig-structures-l-nm1", category: "structures", label: "Niveau -1" }
    ] });
    t("🏷️ un type créé (customEntries) donne son nom",
      r1["structures.cust-sig-structures-l-nm1"] === "Niveau -1");

    // Un RENOMMAGE vit dans `labels`, clé déjà préfixée par la catégorie.
    const r2 = jouer({ labels: { "traces.cust-abc-1": "Ma galerie" } });
    t("🏷️ un renommage (labels) aussi", r2["traces.cust-abc-1"] === "Ma galerie");

    // 🩸 LA RÈGLE v1.21.5-fix1 : un renommage de type BUILT-IN ne doit JAMAIS
    // entrer dans un dictionnaire cross-plan — il s'imposerait au total de
    // tous les autres plans.
    const r3 = jouer({ labels: { "traces.principal": "Route de surface" } });
    t("🩸 un renommage de type BUILT-IN est ÉCARTÉ (sinon il pollue l'agrégat)",
      Object.keys(r3).length === 0);

    t("une légende absente ou vide ne casse rien",
      Object.keys(jouer(null) || {}).length === 0 &&
      Object.keys(jouer({}) || {}).length === 0);

    // Une entrée incomplète ne doit pas produire une clé bancale.
    const r4 = jouer({ customEntries: [{ id: "cust-x" }, { label: "sans id" }, null] });
    t("une entrée incomplète est ignorée", Object.keys(r4).length === 0);
  }

  // — la recherche à la demande —
  t("🔎 la recherche existe et lit le plan-config",
    /async function _retrouverNoms\(btn\)/.test(HP) &&
    /fetch\(dir \+ "\/plan-config\.json", \{ cache: "no-store" \}\)/.test(HP));
  t("🩸 …et n'est JAMAIS automatique (déclenchée par un clic)",
    /closest\("\.kta-profile-pies-fix"\)/.test(HP) &&
    !/_retrouverNoms\(\)\s*;/.test(HP));
  t("🩸 elle lit le BLOB local, jamais le handle (pas une boîte de dialogue par plan)",
    /PlanRegistry\.getBlob\(e\.id\)/.test(HP) && !/ensureHandlePermission/.test(HP));
  t("elle rend la main au thread UI entre deux plans",
    /for \(const e of _statsParPlan\)[\s\S]{0,2200}await new Promise\(function\(r2\) \{ setTimeout\(r2, 0\); \}\);/.test(HP));
  t("le bouton annonce combien de plans il va lire",
    /home\.profile\.pies\.retrouverNoms/.test(HP) &&
    /"home\.profile\.pies\.retrouverNoms": "[^"]*\{n\}/.test(fs.readFileSync("lang/fr.json", "utf8")));
  t("🩸 un seul bouton pour tout le bloc, remis à zéro à chaque rendu",
    /let _boutonNomsPose = false;/.test(HP) && /if \(!_boutonNomsPose\)/.test(HP));

  // — la voie GRATUITE : la session est déjà en localStorage —
  t("les renommages de la session sont lus sans rien demander",
    /_nomsDepuisLegende\(\(JSON\.parse\(brut\) \|\| \{\}\)\.customLegend\)/.test(HP));
}

console.log(ko === 0 ? "\n🎉 tags par l'index : l'index propose, l'utilisateur dispose"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
