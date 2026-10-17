#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-journal-reprise.js — BLOQUANT (pré-commit) : reprise d'une sortie interrompue et fusion manuelle
// du carnet (`js/journal.js`, `js/journalUi.js`). Le code est CHARGÉ dans un `vm`, pas recopié.
// 🩸 Ce qui régresse sans bruit :
//   1. Le signal de reprise est `closedBy: "crash"` (balayage d'une sortie restée `encours`), pas un délai :
//      reprendre sur le délai seul recollerait une sortie clôturée exprès.
//   2. Les compteurs sont des différences (`compte - baseline`) : reprendre avec une baseline neuve remet
//      tout à zéro, la reprise a l'air de marcher et ne garde rien.
//   3. `wallMs` à la fusion = début→fin, trous compris ; une somme raccourcit la sortie.
//   4. La fusion écrit le résultat AVANT de supprimer les autres ; l'inverse perd tout sur échec.
//   5. Le wake lock doit relire sa préférence au boot (en PWA iOS chaque retour d'appli est un boot).
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ── 1. Règle de reprise : `_candidateReprise` extraite par son texte, `list()` bouchonné ──
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
    REPRISE_MS: REPRISE_MS,
    SUSPENSION_MS: 2 * 60 * 60 * 1000
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
    // suspension au changement de plan (décision produit)
    .then(() => attend("🔀 suspendue : une sortie suspendue il y a 1 h est reprise",
      [rec({ status: "suspendue", closedBy: null, endedAt: null,
             suspendueLe: new Date(1000000 - 3600000).toISOString() })], (r) => !!r && r.id === "s1"))
    .then(() => attend("🔀 suspendue : au-delà de 2 h, elle ne reprend plus",
      [rec({ status: "suspendue", closedBy: null, endedAt: null,
             suspendueLe: new Date(1000000 - 2 * 3600000 - 60000).toISOString() })], (r) => r === null))
    .then(() => attend("🔀 suspendue : 1 h 30 → reprise (le délai n'est PAS celui des crashs, 45 min)",
      [rec({ status: "suspendue", closedBy: null, endedAt: null,
             suspendueLe: new Date(1000000 - 90 * 60000).toISOString() })], (r) => !!r))
    .then(() => attend("🔀 suspendue : celle d'un AUTRE plan est ignorée",
      [rec({ planId: "AUTRE", status: "suspendue", closedBy: null,
             suspendueLe: new Date(1000000 - 60000).toISOString() })], (r) => r === null))
    .then(suite);

  function suite() {
    allerRetour(SRC).then(function () {
      partie1bis(SRC);
      partie1ter(SRC).then(partie2);
    });
  }
}

// ── 1 bis. Durée d'une sortie (`dureeMs`) ──────
// 🩸 La règle dépend du type. Terrain → temps réel `wallMs` (téléphone en poche, app tuée par iOS : ça
// compte). Bureau → temps d'usage `activeMs` (un plan ouvert toute la soirée ne vaut rien). Confondre les
// deux gonfle les totaux de travail sur plan.
function partie1bis(SRC) {
  const i = SRC.indexOf("function dureeMs");
  const fn = i < 0 ? null : SRC.slice(i, SRC.indexOf("\n  }", i) + 4);
  const ctx = { Number: Number, TYPE_TERRAIN: "terrain" };
  vm.createContext(ctx);
  vm.runInContext(fn + "\nglobalThis.__d = dureeMs;", ctx, { filename: "duree" });
  const d = ctx.__d;

  t("🩸 durée : une sortie TERRAIN compte du début à la fin, pas le temps d'app",
    d({ type: "terrain", wallMs: 10800000, activeMs: 720000 }) === 10800000);
  t("🩸 durée : une session BUREAU compte le temps d'USAGE, pas le temps réel",
    d({ type: "bureau", wallMs: 36000000, activeMs: 900000 }) === 900000);
  t("durée : terrain sans wallMs retombe sur l'actif plutôt que de rendre 0",
    d({ type: "terrain", wallMs: 0, activeMs: 600000 }) === 600000);
  t("durée : une donnée corrompue (wallMs négatif) ne rend jamais de négatif",
    d({ type: "terrain", wallMs: -5, activeMs: 300000 }) === 300000);
  t("durée : record vide → 0, sans planter", d(null) === 0 && d({}) === 0);
}

// ── 1 ter. Corriger une fin oubliée (`setFin`) ──────
// Sans correction, une sortie non clôturée finit au dernier instant où l'app vivait (iOS l'a tuée).
function partie1ter(SRC) {
  const i = SRC.indexOf("function setFin");
  const fn = i < 0 ? null : SRC.slice(i, SRC.indexOf("\n  }", i) + 4);
  t("la correction de fin est extractible", fn !== null);
  let ecrit = null;
  const REC = { id: "s1", startedAtMs: 1000, activeMs: 500, wallMs: 700 };
  const ctx = {
    console: { warn() {} }, Promise, Date, Number,
    get: () => Promise.resolve(REC),
    _put: (r) => { ecrit = r; return Promise.resolve(r); }
  };
  vm.createContext(ctx);
  vm.runInContext(fn + "\nglobalThis.__f = setFin;", ctx, { filename: "setFin" });
  const f = ctx.__f;

  return f("s1", 4000).then(function (r) {
    t("fin : la correction est acceptée", !!r);
    t("🩸 fin : `wallMs` est RECALCULÉ depuis le début", ecrit && ecrit.wallMs === 3000);
    t("🩸 fin : `activeMs` n'est PAS touché (c'est une mesure, pas une déclaration)",
      ecrit && ecrit.activeMs === 500);
    t("fin : la saisie manuelle est tracée", ecrit && ecrit.finManuelle === true);
    ecrit = null;
    return f("s1", 500);
  }).then(function (r) {
    t("🩸 fin : une fin AVANT le départ est refusée (jamais de durée négative)",
      r === null && ecrit === null);
    return f("s1", "pas une date");
  }).then(function (r) {
    t("fin : une saisie illisible est refusée", r === null && ecrit === null);
  });
}

// ── 2. Câblage, que l'extraction ne voit pas ──────
function partie2() {
  const J   = fs.readFileSync("js/journal.js", "utf8");
  const JUI = fs.readFileSync("js/journalUi.js", "utf8");
  const WL  = fs.readFileSync("js/wakeLock.js", "utf8");
  const MAIN = fs.readFileSync("js/main.js", "utf8");

  // 🩸 Recherche asynchrone, création synchrone : sans garde sur l'id de la sortie neuve, la reprise
  // n'arrive jamais (`_cur` déjà posé) ou écrase une sortie déjà repartie.
  t("🩸 reprise : la substitution est gardée par l'id de la sortie neuve",
    /_cur\.id !== idNeuve/.test(J));
  // 🩸 Viser le SITE D'APPEL : remplacer l'appel par `_counts()` laisse la fonction en place.
  t("🩸 reprise : la baseline d'origine est RECONSTRUITE, pas repartie de zéro",
    /_baseline = _baselineDepuisReprise\(rec\);/.test(J) &&
    /_trackerDistM\(\)\s*-\s*\(Number\(rec\.distM\)/.test(J));
  t("reprise : le compteur de reprises est incrémenté (traçabilité)",
    /_cur\.reprises = \(Number\(rec\.reprises\) \|\| 0\) \+ 1/.test(J));
  t("reprise : l'utilisateur est prévenu", /journal\.reprise\.toast/.test(J));

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

  // 🩸 La règle de durée vit dans `journal.js` seul : la refaire dans l'UI fait diverger détail et total.
  t("🩸 durée : l'UI APPELLE la règle, elle ne la refait pas",
    /window\.Journal\.dureeMs\(rec\)/.test(JUI) && !/rec\.wallMs\s*:\s*rec\.activeMs/.test(JUI));
  t("🩸 durée : les TOTAUX du carnet passent par la même règle",
    /ms \+= dureeMs\(r\)/.test(J) && /bureauMs \+= dureeMs\(r\)/.test(J));
  t("durée : la liste affiche la durée de SORTIE, plus `activeMs` brut",
    /_dur\(_dureeAffichee\(r\)\)/.test(JUI));
  t("durée : la fiche dit AUSSI le temps d'app (il dit ce que vaut la mesure)",
    /jrn\.metric\.dontActif/.test(JUI));
  t("fin : le bouton de correction existe dans la fiche", /id="kta-jrn-fin"/.test(JUI));

  // ── Position de sortie ──────
  // 🩸 Un tronçon est comblé quand l'ancre SUIVANTE arrive : sans ancre posée à la clôture, la marche
  // après le dernier repère n'est comptée que par le podomètre (rien téléphone en poche).
  const TRK = fs.readFileSync("js/tracking.js", "utf8");
  t("🩸 fin : la clôture DEMANDE la position de sortie avant de fermer",
    /_demanderPositionSortie\(\)\.then\(function \(\) \{[\s\S]{0,80}Journal\.cloturer\(\)/.test(JUI));
  // 🩸 Passer par « Je suis ici SUR UN POINT » : un clic carte libre (`src: "click"`) n'alimente jamais
  // la distance estimée (décision produit) et ajouterait 0 m en silence.
  t("🩸 fin : elle passe par `recalerTrackerSurPoint`, seul chemin qui compte",
    /window\.recalerTrackerSurPoint\(x, y, undefined\)/.test(JUI));
  t("🩸 tracking : seul `src: \"point\"` déclenche le comblement de tronçon",
    /_estimerSegmentDepuisAncre\(_ancre\)/.test(TRK) &&
    /src: "click"/.test(TRK));
  t("fin : la demande est FACULTATIVE (un bouton Passer existe)",
    /jrn\.finPos\.passer/.test(JUI));
  t("fin : le bandeau porte `kta-iti-floater` (sinon la popup avale le clic)",
    /_finPickFloater\.className = "kta-iti-floater"/.test(JUI));
  t("🩸 fin : le listener `click` est retiré à la fermeture du picker",
    /map\.off\("click", _finPickHandler\)/.test(JUI));

  // 🩸 Au-delà de 20 000 sommets l'affinage réseau est sauté (archivage auto invisible) ; une clôture
  // manuelle, elle, attend un résultat : pas de plafond.
  t("🩸 budget : la clôture manuelle affine SANS plafond (`force`)",
    /const optsAff = \(reason === "manual"\) \? \{ force: true \} : undefined;/.test(J) &&
    /_affinerDistances\(rec, baseDist, baseEst, optsAff\)/.test(J));
  t("budget : l'archivage automatique, lui, garde son plafond",
    /!opts\.force/.test(TRK));

  t("📊 qualité : réseau et vol d'oiseau ne s'affichent pas pareil",
    /jrn\.section\.dontReseau/.test(JUI) && /jrn\.section\.dontVol/.test(JUI));
  t("📊 qualité : le marqueur est `trackAffine` (présent seulement si l'affinage a tourné)",
    /rec\.trackAffine \? "jrn\.section\.dontReseau" : "jrn\.section\.dontVol"/.test(JUI));

  {
    const CSS = fs.readFileSync("css/style.css", "utf8");
    const i = CSS.indexOf(".kta-jrn-note {");
    const b = i < 0 ? "" : CSS.slice(i, CSS.indexOf("}", i));
    t("🐛 note : `box-sizing: border-box` (sans lui le champ déborde du cadre)",
      /box-sizing:\s*border-box/.test(b));
    const FRD = JSON.parse(fs.readFileSync("lang/fr.json", "utf8"));
    t("note : le remplissage est court (il suggère, il n'occupe pas)",
      (FRD["jrn.fiche.notePlaceholder"] || "").length <= 40);
  }

  ["jrn.section.dontReseau", "jrn.section.dontVol", "jrn.finPos.invite", "jrn.finPos.passer"]
    .forEach(function (k) {
      ["fr", "en", "es"].forEach(function (l) {
        const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
        t("i18n " + l + " : " + k, typeof D[k] === "string" && D[k].length > 0);
      });
    });
  t("fin : l'API est exposée", /setFin:\s+setFin/.test(J));
  t("fin : une fin saisie à la main est signalée dans la fiche", /jrn\.metric\.finCorrigee/.test(JUI));

  // ⚠️ Le module s'initialise déjà en fin de fichier ; l'appel du boot est un second filet. Le verrou
  // fantôme est couvert par `check-wakelock.js`.
  t("wakeLock : `init()` est aussi appelé depuis le boot de l'app",
    /window\.WakeLock\.init\(\)/.test(MAIN));
  t("🩸 wakeLock : rattrapage au premier geste si l'acquisition du boot échoue",
    /_reprendreAuPremierGeste/.test(WL) && /pointerdown/.test(WL));
  // 🩸 Le toast « écran maintenu allumé » ne doit sortir qu'une fois le verrou réellement posé.
  t("🩸 wakeLock : `setEnabled` REND le résultat réel de l'acquisition",
    /const ok = await _acquire\(\);[\s\S]{0,120}return ok;/.test(WL));
  t("🩸 wakeLock : ⚙️ Paramètres attend ce résultat avant d'annoncer quoi que ce soit",
    /Promise\.resolve\(window\.WakeLock\.setEnabled\(wlCb\.checked\)\)\.then/.test(
      fs.readFileSync("js/interfaceConfig.js", "utf8")));
  t("🩸 wakeLock : l'accueil aussi",
    /Promise\.resolve\(window\.WakeLock\.setEnabled\(loaderWlCb\.checked\)\)\.then/.test(
      fs.readFileSync("js/homeConfig.js", "utf8")));
  ["fr", "en", "es"].forEach(function (l) {
    const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
    t("i18n " + l + " : config.display.wakelock.toastKo",
      typeof D["config.display.wakelock.toastKo"] === "string");
  });

  t("wakeLock : le listener de rattrapage se retire après usage",
    /removeEventListener\("pointerdown", rattraper, true\)/.test(WL));

  ["jrn.metric.dontActif", "jrn.metric.finCorrigee", "jrn.fin.corriger", "jrn.fin.invite",
   "jrn.fin.ok", "jrn.fin.koFormat", "jrn.fin.koAvant",
   "journal.reprise.toast", "jrn.fusion.entrer", "jrn.fusion.compte", "jrn.fusion.valider",
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

// ── 3. A → B → A : le vrai journal.js sur un faux IndexedDB, horloge pilotée ──────
// Pendant une sortie, passer sur un autre plan puis revenir doit reprendre la MÊME sortie.
function allerRetour(SRC) {
  let NOW = Date.parse("2026-09-28T10:00:00Z");
  class FDate extends Date {
    constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
    static now() { return NOW; }
  }
  const store = new Map();
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const tard = (fn) => setTimeout(fn, 0);
  function req(val) { const r = {}; tard(() => { r.result = val; if (r.onsuccess) r.onsuccess(); }); return r; }
  const db = {
    objectStoreNames: { contains: () => true }, close() {},
    transaction() {
      const tx = {};
      const st = {
        put(r) { store.set(r.id, clone(r)); return req(undefined); },
        get(id) { return req(store.has(id) ? clone(store.get(id)) : undefined); },
        getAll() { return req([...store.values()].map(clone)); },
        delete(id) { store.delete(id); return req(undefined); }
      };
      tx.objectStore = () => st;
      tard(() => tard(() => { if (tx.oncomplete) tx.oncomplete(); }));
      return tx;
    }
  };
  const plans = { A: { dist: 0 }, B: { dist: 0 }, C: { dist: 0 } };
  let courant = "A", toasts = 0, questions = 0, relances = 0, suiviActif = false;
  const win = {
    getTrackingDistanceTotaleM: () => plans[courant].dist,
    getTrackingDistanceEstimeeM: () => 0,
    getTrackingValidations: () => 0,
    getTrackingTimeline: () => [],
    getEditorPoints: () => [], getRoads: () => [],
    OOMGuard: { showToast() { toasts++; } },
    getTrackingActif: () => suiviActif,
    // La fenêtre de relance : on « clique » OK.
    ktaConfirm: () => { questions++; return Promise.resolve(true); },
    ktaDemarrerSuivi: () => { relances++; },
    I18n: { t: (k) => k },
    addEventListener() {}
  };
  win.window = win;
  const ctx = vm.createContext(Object.assign(win, {
    console: { log() {}, warn() {} }, Date: FDate, Promise, JSON, Math, Number, Array, String, Object, Map,
    localStorage: { getItem: () => null, setItem() {} },
    indexedDB: { open() { const r = {}; tard(() => { r.result = db; if (r.onsuccess) r.onsuccess(); }); return r; } },
    document: { visibilityState: "visible", hidden: false, addEventListener() {} },
    setTimeout: (fn, ms) => (ms >= 1000 ? 0 : setTimeout(fn, ms)),   // pas de balayage à 4 s
    setInterval: () => 0, clearInterval() {}
  }));
  vm.runInContext("var window = this;" + SRC, ctx, { filename: "journal.js" });
  const J = ctx.Journal;
  const attendre = () => new Promise((r) => setTimeout(r, 40));
  function charger(p) {
    courant = p; win._currentLoadedPlanId = p; win.PLAN_CONFIG = { plan: { name: "Plan " + p } };
    J.onPlanLoaded(p, "Plan " + p);
  }
  let idA;
  return Promise.resolve()
    .then(() => { charger("A"); return attendre(); })
    .then(() => {
      idA = J.getCurrent().id;
      plans.A.dist = 30;                       // 30 m : SOUS le seuil de 50 m
      return J.onPlanUnload();
    })
    .then(attendre)
    .then(() => {
      const r = store.get(idA);
      t("🔀 A→B : la sortie A est SUSPENDUE (avant : clôturée, et même JETÉE à 30 m)",
        !!r && r.status === "suspendue" && !!r.suspendueLe);
      charger("B");
      return attendre();
    })
    .then(() => { NOW += 10 * 60000; return J.onPlanUnload(); })
    .then(attendre)
    .then(() => { charger("A"); return attendre(); })
    .then(attendre)
    .then(() => {
      const cur = J.getCurrent();
      t("🔀 B→A (10 min plus tard) : la MÊME sortie reprend", !!cur && cur.id === idA && cur.reprises === 1);
      // Sortie terrain reprise, suivi arrêté : la fenêtre de relance remplace le toast.
      t("▶️ reprise d'une sortie terrain, suivi arrêté : on propose de relancer le suivi", questions === 1 && toasts === 0);
      t("▶️ « Relancer » démarre le suivi par le chemin de la tuile (ktaDemarrerSuivi)", relances === 1);
      plans.A.dist = 80;
      t("🔀 reprise : les 30 m d'avant l'aller-retour comptent toujours (80 m au total)",
        Math.round(J.getCurrent().distM) === 80);
      return J.onPlanUnload();
    })
    .then(attendre)
    .then(() => { NOW += 2 * 3600000 + 60000; charger("C"); return attendre(); })
    .then(attendre)
    .then(() => {
      const r = store.get(idA);
      t("🔀 > 2 h : la sortie A (80 m) est finalisée et GARDÉE", !!r && r.status === "close" && r.closedBy === "auto");
      t("🔀 > 2 h : la session B, sous les seuils, est jetée", ![...store.values()].some((x) => x.planId === "B"));
      return J.onPlanUnload();
    })
    .then(attendre)
    .then(() => { charger("A"); return attendre(); })
    .then(attendre)
    .then(() => {
      t("🔀 > 2 h : revenir sur A ouvre une NOUVELLE sortie", !!J.getCurrent() && J.getCurrent().id !== idA);
      const S2 = SRC.replace(/\r\n/g, "\n");
      t("🔀 câblage : le changement de plan SUSPEND (plus de _finaliser dans onPlanUnload)",
        S2.includes("function onPlanUnload() {\n    if (!_cur) return Promise.resolve(null);\n    return _suspendre();"));
      t("🔀 câblage : l'expiration tourne au démarrage", S2.includes("_balayerEnCours(); _expirerSuspendues();"));
    });
}
