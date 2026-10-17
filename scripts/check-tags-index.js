#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-tags-index.js — BLOQUANT (pré-commit) : tags d'un plan serveur posés par `index.json` (et ConfAdmin),
// filtre par étiquette des stats du profil, noms des types personnalisés hors plan.
// ⚠️ Contrat : l'index PROPOSE, l'utilisateur DISPOSE (`tagsSrc` = "index" | "user").
// 🩸 `decouvrirPlansServeur` tourne à chaque boot : une écriture inconditionnelle écraserait en silence
//    les tags posés dans Infos (même ping-pong que `versionSrc`).
// 🩸 Vider ses tags est un CHOIX : sans trace du refus, l'index les repropose au boot suivant.
// On EXÉCUTE (registre dans un `vm`, bloc de décision extrait de `main.js`) : un grep ne voit ni TDZ, ni
// variable hors portée, ni condition inversée.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

const MAIN = fs.readFileSync("js/main.js", "utf8");
const REG  = fs.readFileSync("js/planRegistry.js", "utf8");
// Le script de confadmin.html vit dans js/confadmin.js (CSP stricte) : page + script.
const CA   = fs.readFileSync("confadmin.html", "utf8") + "\n" + fs.readFileSync("js/confadmin.js", "utf8");
const HOME = fs.readFileSync("js/homeLoader.js", "utf8");

// ── 1. Le registre, exécuté ──────
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

  neuf();
  PR.setTags(ID, ["secteur", "carriere"], "index");
  let p = PR.findById(ID);
  t("🏷️ l'index pose les tags", !!(p.tags && p.tags.join("|") === "secteur|carriere"));
  t("🏷️ …et laisse sa signature (tagsSrc=index)", p.tagsSrc === "index");

  PR.setTags(ID, ["a moi"]);
  p = PR.findById(ID);
  t("✍️ l'édition utilisateur écrase la proposition", p.tags.join("|") === "a moi");
  t("✍️ …et marque l'origine « user » (défaut sans 3ᵉ argument)", p.tagsSrc === "user");

  PR.setTags(ID, []);
  p = PR.findById(ID);
  t("🩸 vider retire bien les tags", !p.tags);
  t("🩸 …mais GARDE la trace du refus, sinon l'index les reproposerait au boot suivant",
    p.tagsSrc === "user");

  PR.setTags(ID, ["a"], "index");
  PR.setTags(ID, [], "index");
  p = PR.findById(ID);
  t("🏷️ l'index qui retire ses tags relâche aussi son origine", !p.tags && !p.tagsSrc);

  // normalisation : la seule de l'app
  neuf();
  PR.setTags(ID, ["  a  ", "A", "", null, "b"]);
  t("🧹 trim + dédup insensible à la casse + vides écartés",
    PR.findById(ID).tags.join("|") === "a|b");
  PR.setTags(ID, [new Array(60).join("x")]);
  t("🧹 24 caractères maximum par tag", PR.findById(ID).tags[0].length === 24);
  PR.setTags(ID, Array.from({ length: 30 }, (_, i) => "t" + i));
  t("🧹 12 tags maximum", PR.findById(ID).tags.length === 12);
}

// ── 2. Bloc de décision de main.js, extrait du VRAI fichier (une copie testerait le garde-fou) ──
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

// ── 3. ConfAdmin (générateur) ──────
{
  t("⚙️ ConfAdmin : la colonne Tags existe dans le tableau", CA.indexOf("<th>Tags</th>") >= 0);
  t("⚙️ ConfAdmin : un champ de saisie par plan", CA.indexOf('data-f="tags"') >= 0);
  t("⚙️ ConfAdmin : les tags sortent dans index.json", /if \(tg\.length\) e\.tags = tg;/.test(CA));
  t("⚙️ ConfAdmin : on peut REPRENDRE un index.json existant (sans redéposer les ZIPs)",
    CA.indexOf('id="caLoadIndex"') >= 0 && CA.indexOf('id="caIndexInput"') >= 0);
  t("🩸 ConfAdmin : reprendre un index ne perd pas ses liaisons",
    /else if \(_liaisonsReprises\) out\.liaisons = _liaisonsReprises;/.test(CA));

  // 🩸 ConfAdmin doit normaliser comme le moteur, sinon l'app rogne en silence des tags publiés : les DEUX
  // normalisations tournent sur les mêmes entrées.
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
      "secteur, carriere, Secteur"
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

// ── 4. La fonction a un consommateur (sinon fonction morte) ──────
t("🔎 les tags du plan s'affichent en chips sur sa ligne (HOME)",
  /Array\.isArray\(plan\.tags\) && plan\.tags\.length/.test(HOME));
t("🔎 les tags filtrent la liste des plans",
  /_plansTagFilter\.has\(tg\.toLowerCase\(\)\)/.test(HOME));
t("🔎 l'utilisateur peut toujours les éditer dans ℹ️ Infos",
  /PlanRegistry\.setTags\(plan\.id,/.test(HOME));

// ── 5. Filtre par étiquette des stats du profil (`homeProfile.js > _planRetenu`, exécutée) ──────
// 🩸 L'EXCLUSION L'EMPORTE sur l'inclusion : un plan inclus par une étiquette et exclu par une autre est
// écarté. Un `||` au lieu d'un `&&`, ou l'ordre inversé, et le filtre ment sans rien casser d'apparent.
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

    t("sans filtre, tout est retenu", jouer(["secteur"], {}) === true);
    t("inclure : seuls les plans qui portent l'étiquette",
      jouer(["secteur"], { secteur: "in" }) === true &&
      jouer(["paris"],   { secteur: "in" }) === false);
    t("exclure : les plans qui la portent sortent",
      jouer(["secteur"], { secteur: "out" }) === false &&
      jouer(["paris"],   { secteur: "out" }) === true);
    t("🩸 L'EXCLUSION L'EMPORTE sur l'inclusion (sinon « sors-moi l'atlas » ne marche pas)",
      jouer(["secteur", "brouillon"], { secteur: "in", brouillon: "out" }) === false);
    t("la casse est ignorée (« Secteur » et « secteur » sont la même étiquette)",
      jouer(["Secteur"], { secteur: "in" }) === true);
    t("un plan SANS étiquette a sa propre sentinelle, filtrable comme les autres",
      jouer([], {}) === true &&
      jouer([], { "\u0000sans-etiquette": "out" }) === false &&
      jouer([], { secteur: "in" }) === false);

    // 🩸 Si le filtre exclut tout, les chips doivent survivre : sinon aucun retour en arrière possible.
    t("🩸 filtre excluant tout : le bloc reste affiché (sinon aucun retour possible)",
      /const filtreActif = Object\.keys\(_filtreTags\)\.length > 0;/.test(HP) &&
      /activeSections\.length === 0 && !filtreActif\) return;/.test(HP));

    // Le filtre ne persiste rien : des plans manquants au retour passeraient pour une perte de données.
    t("🩸 le filtre ne persiste nulle part (aucune clé de stockage)",
      !/_filtreTags[\s\S]{0,200}localStorage/.test(HP));

    t("tous les camemberts suivent le filtre, pas seulement celui des étiquettes",
      /if \(_statsParPlan\.length\) breakdowns = _agregerFiltre\(\);/.test(HP));
    t("un clic re-rend le bloc entier", /_renderProfilePies\(breakdowns, labels\);/.test(HP));
    t("🩸 le clic est délégué au conteneur (les chips renaissent à chaque rendu)",
      /piesContainer\.addEventListener\("click"/.test(HP));
  }
}

// ── 6. Nom d'un type personnalisé sans ouvrir le plan ──────
// Un cache de stats ancien n'a pas de `labels` : un dictionnaire durable s'en charge, complété SUR DEMANDE.
// 🩸 Jamais lire tous les plan-config au chargement de la fenêtre : la recherche part d'un clic, et le
// bouton annonce combien de plans il va lire (pas de réseau dans le dos de l'utilisateur).
{
  const HP = fs.readFileSync("js/homeProfile.js", "utf8");

  t("🏷️ un dictionnaire de noms survit aux versions (clé dédiée)",
    /const LS_NOMS = "myktamap_legend_labels_v1";/.test(HP));
  t("il amorce l'agrégat", /const aggLabels = _nomsPersistes\(\);/.test(HP));
  t("le chargement d'un plan l'alimente", /_persisterNoms\(stats\.labels\);/.test(HP));
  t("🩸 …et il n'écrase jamais un nom déjà connu par une valeur vide",
    /Object\.keys\(map \|\| \{\}\)\.forEach\(function\(k\) \{ if \(map\[k\]\) cur\[k\] = map\[k\]; \}\);/.test(HP));

  // extracteur de noms, exécuté sur les deux formes d'une légende
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

    // Type créé (import SIG…) : dans `customEntries`, son nom est son identité.
    const r1 = jouer({ customEntries: [
      { id: "cust-sig-structures-l-nm1", category: "structures", label: "Niveau -1" }
    ] });
    t("🏷️ un type créé (customEntries) donne son nom",
      r1["structures.cust-sig-structures-l-nm1"] === "Niveau -1");

    // Un RENOMMAGE vit dans `labels`, clé déjà préfixée par la catégorie.
    const r2 = jouer({ labels: { "traces.cust-abc-1": "Ma galerie" } });
    t("🏷️ un renommage (labels) aussi", r2["traces.cust-abc-1"] === "Ma galerie");

    // 🩸 Un renommage de type BUILT-IN n'entre jamais dans un dictionnaire cross-plan : il s'imposerait à
    // tous les autres plans.
    const r3 = jouer({ labels: { "traces.principal": "Route de surface" } });
    t("🩸 un renommage de type BUILT-IN est ÉCARTÉ (sinon il pollue l'agrégat)",
      Object.keys(r3).length === 0);

    t("une légende absente ou vide ne casse rien",
      Object.keys(jouer(null) || {}).length === 0 &&
      Object.keys(jouer({}) || {}).length === 0);

    const r4 = jouer({ customEntries: [{ id: "cust-x" }, { label: "sans id" }, null] });
    t("une entrée incomplète est ignorée", Object.keys(r4).length === 0);
  }

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

  // voie gratuite : la session est déjà en localStorage
  t("les renommages de la session sont lus sans rien demander",
    /_nomsDepuisLegende\(\(JSON\.parse\(brut\) \|\| \{\}\)\.customLegend\)/.test(HP));
}

console.log(ko === 0 ? "\n🎉 tags par l'index : l'index propose, l'utilisateur dispose"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
