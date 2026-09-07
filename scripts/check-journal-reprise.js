#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔁 check-journal-reprise.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// La REPRISE d'une sortie interrompue et la FUSION manuelle (KARMA, sortie
// terrain du 06/09 : « j'ai plusieurs sorties détectées sur la même sortie
// car j'ai utilisé d'autres applis »).
//
// 🩸 CE QUI RÉGRESSE ICI, ET SANS BRUIT :
//
//   1. LE SIGNAL DE REPRISE. Ce n'est PAS un simple délai, c'est
//      `closedBy: "crash"` — posé par le balayage sur une sortie restée
//      `encours`, donc uniquement quand l'app a été tuée SOUS l'utilisateur.
//      Reprendre sur le délai seul recollerait une sortie qu'il a clôturée
//      exprès : son geste serait annulé sans un mot.
//
//   2. LA BASELINE RECONSTRUITE. Les compteurs d'une sortie sont des
//      DIFFÉRENCES (`compte - baseline`) recalculées à chaque instantané, pas
//      des accumulations. Reprendre avec une baseline neuve remettrait tout à
//      zéro — la reprise aurait l'air de marcher et ne garderait rien.
//
//   3. `wallMs` À LA FUSION. C'est la durée du début à la fin, TROUS COMPRIS,
//      pas une somme. La sommer donnerait une sortie plus courte que le temps
//      qu'elle a réellement duré.
//
//   4. L'ORDRE DE LA FUSION. Le résultat est écrit AVANT que les autres soient
//      supprimées. L'inverse perdrait tout si l'écriture échouait.
//
//   5. LE WAKE LOCK JAMAIS INITIALISÉ. `WakeLock.init()` n'était appelé nulle
//      part : la préférence n'était jamais relue, donc la case s'affichait
//      décochée à chaque lancement et le verrou n'était jamais repris. Sur PC
//      on ne recharge pas — le bug ne se voyait qu'en PWA iOS, où chaque
//      retour d'appli est un boot.
//
// Le code est CHARGÉ dans un `vm` (pas recopié).
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ───────── 1. la logique de reprise, éprouvée sur la vraie fonction ─────────
// `_candidateReprise` est interne : on l'extrait par son texte et on l'évalue
// avec un `list()` bouchonné. C'est la RÈGLE qu'on teste, celle qui décide.
{
  const SRC = fs.readFileSync("js/journal.js", "utf8");
  const i = SRC.indexOf("function _candidateReprise");
  const fn = i < 0 ? null : SRC.slice(i, SRC.indexOf("\n  }", i) + 4);
  t("la règle de reprise est extractible", fn !== null);

  const REPRISE_MS = 45 * 60 * 1000;
  let LISTE = [];
  const ctx = {
    console: { log() {}, warn() {} }, Promise, Date, Number, Array, Math, JSON,
    list: () => Promise.resolve(LISTE),
    _now: () => 1000000,
    REPRISE_MS: REPRISE_MS
  };
  vm.createContext(ctx);
  vm.runInContext(fn + "\nglobalThis.__c = _candidateReprise;", ctx, { filename: "extrait" });
  const cand = ctx.__c;

  const rec = (o) => Object.assign({
    id: "s1", planId: "P", status: "close", closedBy: "crash",
    endedAt: new Date(1000000 - 60000).toISOString()
  }, o);

  const attend = (nom, liste, ok) => {
    LISTE = liste;
    return cand("P").then((r) => t(nom, ok(r)));
  };

  Promise.resolve()
    .then(() => attend("🩸 reprise : une sortie tuée récemment est reprise",
      [rec({})], (r) => !!r && r.id === "s1"))
    .then(() => attend("🩸 reprise : une sortie CLÔTURÉE À LA MAIN n'est JAMAIS reprise",
      [rec({ closedBy: "manual" })], (r) => r === null))
    .then(() => attend("🩸 reprise : une clôture normale (changement de plan) non plus",
      [rec({ closedBy: "auto" })], (r) => r === null))
    .then(() => attend("reprise : au-delà du délai, on n'y touche plus",
      [rec({ endedAt: new Date(1000000 - REPRISE_MS - 1000).toISOString() })], (r) => r === null))
    .then(() => attend("reprise : une sortie d'un AUTRE plan est ignorée",
      [rec({ planId: "AUTRE" })], (r) => r === null))
    .then(() => attend("🩸 reprise : seule la PLUS RÉCENTE compte — une vieille tuée derrière une clôture manuelle ne remonte pas",
      [rec({ id: "recent", closedBy: "manual" }), rec({ id: "vieille" })], (r) => r === null))
    .then(() => attend("reprise : une sortie encore `encours` n'est pas reprise",
      [rec({ status: "encours" })], (r) => r === null))
    .then(() => attend("reprise : carnet vide → rien, sans planter", [], (r) => r === null))
    .then(suite);

  function suite() { partie2(); }
}

// ───────── 2. le câblage, que l'extraction ne voit pas ─────────
function partie2() {
  const J   = fs.readFileSync("js/journal.js", "utf8");
  const JUI = fs.readFileSync("js/journalUi.js", "utf8");
  const WL  = fs.readFileSync("js/wakeLock.js", "utf8");
  const MAIN = fs.readFileSync("js/main.js", "utf8");

  // 🩸 La course : la recherche est ASYNCHRONE, la création SYNCHRONE. Sans
  // garde sur l'id de la sortie neuve, soit la reprise n'arrive jamais (elle
  // voit `_cur` déjà posé), soit elle écrase une sortie déjà repartie.
  t("🩸 reprise : la substitution est gardée par l'id de la sortie neuve",
    /_cur\.id !== idNeuve/.test(J));
  // 🩸 Viser le SITE D'APPEL, pas la déclaration : un sabotage qui remplace
  // l'appel par `_counts()` laisse la fonction en place, et une assertion qui
  // se contente de la trouver reste verte (constaté à la falsification).
  t("🩸 reprise : la baseline d'origine est RECONSTRUITE, pas repartie de zéro",
    /_baseline = _baselineDepuisReprise\(rec\);/.test(J) &&
    /_trackerDistM\(\)\s*-\s*\(Number\(rec\.distM\)/.test(J));
  t("reprise : le compteur de reprises est incrémenté (traçabilité)",
    /_cur\.reprises = \(Number\(rec\.reprises\) \|\| 0\) \+ 1/.test(J));
  t("reprise : l'utilisateur est prévenu", /journal\.reprise\.toast/.test(J));

  // 🩸 La fusion écrit AVANT de supprimer. L'inverse perdrait tout sur échec.
  const iF = J.indexOf("function fusionner");
  const f = iF < 0 ? "" : J.slice(iF, iF + 4200);
  t("fusion : l'API est exposée", /fusionner:\s+fusionner/.test(J));
  t("🩸 fusion : le résultat est ÉCRIT avant que les autres soient supprimées",
    f.indexOf("_put(base)") >= 0 && f.indexOf("_put(base)") < f.indexOf("aJeter.map(remove)"));
  t("🩸 fusion : `wallMs` est début→fin, PAS une somme (trous compris)",
    /base\.wallMs = Math\.max\(0, fin - \(base\.startedAtMs/.test(f) &&
    !/somme\("wallMs"\)/.test(f));
  t("fusion : durées, distances et ajouts SONT sommés",
    /base\.activeMs\s+= somme\("activeMs"\)/.test(f) && /base\.distM\s+= somme\("distM"\)/.test(f));
  t("fusion : les notes ne sont pas perdues", /base\.note = liste\.map/.test(f));
  t("fusion : le tracé est recollé dans l'ordre du temps", /\.sort\(function \(a, b\) \{ return \(a && a\.t/.test(f));
  t("fusion : terrain domine sur bureau", /some\(function \(r\) \{ return r\.type === TYPE_TERRAIN/.test(f));
  t("fusion : la plus ancienne sert de socle et garde son id",
    /liste\[0\]/.test(f) && /sort\(function \(a, b\) \{ return \(a\.startedAtMs \|\| 0\) - \(b\.startedAtMs/.test(f));
  t("fusion : moins de 2 sorties → refus", /ids\.length < 2\) return Promise\.resolve\(null\)/.test(f));
  t("🩸 fusion : elle SUPPRIME, donc elle demande confirmation", /ktaConfirm\(_t\("jrn\.fusion\.confirm"/.test(JUI));
  t("fusion : le mode sélection existe dans le carnet", /_modeFusion/.test(JUI));

  // 🩸 LE WAKE LOCK. Le module vivait complet mais n'était jamais initialisé.
  t("🩸 wakeLock : `init()` est appelé au boot (il ne l'était NULLE PART)",
    /window\.WakeLock\.init\(\)/.test(MAIN));
  t("🩸 wakeLock : rattrapage au premier geste si l'acquisition du boot échoue",
    /_reprendreAuPremierGeste/.test(WL) && /pointerdown/.test(WL));
  t("wakeLock : le listener de rattrapage se retire après usage",
    /removeEventListener\("pointerdown", rattraper, true\)/.test(WL));

  ["journal.reprise.toast", "jrn.fusion.entrer", "jrn.fusion.compte", "jrn.fusion.valider",
   "jrn.fusion.annuler", "jrn.fusion.confirm", "jrn.fusion.ok", "jrn.fusion.ko"
  ].forEach(function (k) {
    ["fr", "en", "es"].forEach(function (l) {
      const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
      t("i18n " + l + " : " + k, typeof D[k] === "string" && D[k].length > 0);
    });
  });

  console.log(ko === 0 ? "\n🎉 reprise & fusion de sorties : tout passe" : "\n⚠️ " + ko + " echec(s)");
  process.exit(ko === 0 ? 0 : 1);
}
