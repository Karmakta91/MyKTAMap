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

console.log(ko === 0 ? "\n🎉 tags par l'index : l'index propose, l'utilisateur dispose"
                     : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
