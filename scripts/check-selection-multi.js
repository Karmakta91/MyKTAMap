#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-selection-multi.js — BLOQUANT (pré-commit) : sélection multiple et conversion EN LOT
// (`js/selectionMulti.js`, `js/convertirObjet.js`, chargés dans un `vm`).
// 🩸 Ce qui régresse sans bruit :
//   1. La compatibilité porte sur l'OUVERTURE (ligne vs surface fermée), pas sur la famille : tracé et
//      front de taille se mélangent, c'est le cas utile (décision produit).
//   2. Un refus se DIT : un clic sans effet ni mot se lit comme un bug de la carte.
//   3. Un lot = un geste, UN instantané, UNE entrée d'historique, une écriture par famille (pas N
//      re-rendus ni N Ctrl+Z).
//   4. Les trois listes sont lues d'un bloc AVANT toute écriture, sinon une conversion intra-famille relit
//      une liste amputée et perd des objets.
//   5. Les objets déjà du bon type sont SAUTÉS, ni en échec ni cause de refus.
//   6. `itinerary` (trajet calculé) et `jonction` (niveaux reliés) ne sont ni sources ni cibles, même dans un
//      lot : convertis, l'un deviendrait une donnée du relevé, l'autre un tracé qui ne relie plus rien.
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ── Harnais : convertirObjet + selectionMulti, sans Leaflet ──────
function contexte() {
  const journal = { snap: 0, record: [], saves: 0, rendus: {} };
  let R = [], Z = [], S = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, JSON, Math, Array, Object, String, Number, Boolean, RegExp, Error,
    document: {
      createElement: () => ({ style: {}, className: "", id: "", innerHTML: "",
        querySelector: () => ({ addEventListener() {}, textContent: "", style: {}, disabled: false }),
        querySelectorAll: () => [], appendChild() {}, remove() {}, addEventListener() {} }),
      getElementById: () => null,
      body: { appendChild() {} },
      documentElement: { appendChild() {} }
    },
    I18n: { t: (k, p) => k + (p ? ":" + JSON.stringify(p) : "") },
    HistoryManager: {
      captureState: () => { journal.snap++; return { s: journal.snap }; },
      record: (label, avant) => { journal.record.push({ label, avant }); }
    },
    SessionPersist: { save: () => { journal.saves++; } },
    OOMGuard: { showToast: (m) => { journal.toast = m; } },
    APP_CONFIG: { imageHeight: 1000, multiLevel: false, visibleLevels: [0] },
    isStructurePolylineType: (ty) => (ty === "front-1" || ty === "front-2"),
    addEventListener() {}, removeEventListener() {}
  };
  ctx.window = ctx;
  ctx.getRoads      = () => R;  ctx.setRoads      = (v) => { R = v; journal.rendus.roads = (journal.rendus.roads || 0) + 1; };
  ctx.getZones      = () => Z;  ctx.setZones      = (v) => { Z = v; journal.rendus.zones = (journal.rendus.zones || 0) + 1; };
  ctx.getStructures = () => S;  ctx.setStructures = (v) => { S = v; journal.rendus.structures = (journal.rendus.structures || 0) + 1; };
  vm.createContext(ctx);
  ["js/styleResolver.js", "js/legendCustomization.js", "js/convertirObjet.js", "js/selectionMulti.js"]
    .forEach((f) => vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f }));
  return {
    ctx, journal,
    get R() { return R; }, set R(v) { R = v; },
    get Z() { return Z; }, set Z(v) { Z = v; },
    get S() { return S; }, set S(v) { S = v; }
  };
}

// 🩸 Accès SÛR au résultat : une régression qui rend `null` ferait planter le script au lieu d'un échec lisible.
const vise = (r) => (r && r.cible) ? r.cible : {};
const refuse = (r) => (r && r.refus) ? r.refus : {};

const carre = (x, y, c) => [{ x: x, y: y }, { x: x + c, y: y }, { x: x + c, y: y + c }, { x: x, y: y + c }];
const ligne = (x, y, l) => [{ x: x, y: y }, { x: x + l, y: y }];

// ── 1. Surface d'API ──────
{
  const h = contexte();
  ["convertirLot", "listerCiblesLot"].forEach((m) =>
    t("API : KtaConvertir." + m + "()", typeof h.ctx.KtaConvertir[m] === "function"));
  ["ouvrir", "fermer", "liste", "estActif"].forEach((m) =>
    t("API : SelectionMulti." + m + "()", typeof h.ctx.SelectionMulti[m] === "function"));
  t("API : le cœur de la visée est exposé au harnais",
    typeof h.ctx.SelectionMulti._choisir === "function");
  // Foyer canonique de la géométrie (pas de copie locale de `_pointInPolygon`).
  t("🧭 géométrie : `ktaPointInPolygon` est exposé", typeof h.ctx.ktaPointInPolygon === "function");
  t("🧭 géométrie : `ktaDistPointSegment` est exposé", typeof h.ctx.ktaDistPointSegment === "function");
  const poly = carre(0, 0, 10);
  t("géométrie : un point DEDANS est dedans", h.ctx.ktaPointInPolygon({ x: 5, y: 5 }, poly) === true);
  t("géométrie : un point DEHORS est dehors", h.ctx.ktaPointInPolygon({ x: 50, y: 5 }, poly) === false);
  t("géométrie : distance à un segment", h.ctx.ktaDistPointSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }) === 3);
}

// ── 2. Visée et règle de compatibilité ──────
{
  const h = contexte();
  const SM = h.ctx.SelectionMulti;
  const trace  = { type: "principal", points: ligne(0, 0, 100) };
  const front  = { type: "front-1",   points: ligne(0, 50, 100) };
  const zone   = { type: "eau",       points: carre(200, 200, 60) };
  const pilier = { type: "pilier-1",  points: carre(400, 400, 60) };
  const cands = [
    { famille: "roads", obj: trace }, { famille: "structures", obj: front },
    { famille: "zones", obj: zone },  { famille: "structures", obj: pilier }
  ];

  t("visée : on attrape le tracé en cliquant dessus",
    vise(SM._choisir(cands, 50, 0, true)).obj === trace);
  t("visée : on attrape une surface en cliquant DEDANS (pas que le contour)",
    vise(SM._choisir(cands, 230, 230, false)).obj === zone);
  t("visée : on attrape une surface en cliquant sur son CONTOUR",
    vise(SM._choisir(cands, 200, 201, false)).obj === zone);
  t("visée : loin de tout, rien n'est attrapé",
    SM._choisir(cands, 900, 900, true).cible === null);
  t("visée : le plus PROCHE gagne quand deux objets sont voisins",
    vise(SM._choisir(cands, 50, 45, true)).obj === front);

  t("🩸 règle : depuis une LIGNE, un FRONT de taille est accepté (l'autre famille !)",
    vise(SM._choisir(cands, 50, 50, true)).obj === front);
  const refus = SM._choisir(cands, 230, 230, true);
  t("🩸 règle : depuis une LIGNE, une surface fermée est REFUSÉE", refus.cible === null);
  t("🩸 refus : et l'objet fautif est RENDU, pour pouvoir dire pourquoi",
    refuse(refus).obj === zone);
  const refus2 = SM._choisir(cands, 50, 0, false);
  t("🩸 règle : depuis une SURFACE, une ligne est refusée symétriquement",
    refus2.cible === null && refuse(refus2).obj === trace);
  t("règle : depuis une SURFACE, un pilier (autre famille) est accepté",
    vise(SM._choisir(cands, 430, 430, false)).obj === pilier);
  t("sans référence d'ouverture, tout passe (1er clic)",
    vise(SM._choisir(cands, 230, 230, null)).obj === zone);
}

// ── 3. Le lot : un geste, un instantané, une entrée ──────
{
  const h = contexte();
  const CV = h.ctx.KtaConvertir;
  const f1 = { type: "front-1", level: -2, points: ligne(0, 0, 10), description: "note" };
  const f2 = { type: "front-1", level: -2, points: ligne(0, 10, 10) };
  const ch = { type: "chemin",  level: -2, points: ligne(0, 20, 10) };
  const dejaLa = { type: "principal", level: 0, points: ligne(0, 30, 10) };
  const temoin = { type: "eau", points: carre(0, 0, 5) };
  h.S = [f1, f2];
  h.R = [ch, dejaLa];
  h.Z = [temoin];

  const items = [
    { famille: "structures", obj: f1 }, { famille: "structures", obj: f2 },
    { famille: "roads", obj: ch },      { famille: "roads", obj: dejaLa }
  ];
  const bilan = CV.convertirLot(items, "roads", "principal");

  t("lot : 3 objets convertis", bilan.convertis === 3);
  t("🩸 lot : celui qui était DÉJÀ du bon type est SAUTÉ, pas en échec",
    bilan.sautes === 1 && bilan.echecs === 0);
  t("lot : les structures ont été vidées", h.S.length === 0);
  t("lot : les tracés portent tout le monde", h.R.length === 4);
  t("lot : tous du type demandé", h.R.every((r) => r.type === "principal"));
  t("lot : le NIVEAU de chacun est conservé",
    h.R.filter((r) => r.level === -2).length === 3);
  t("lot : la note d'un objet survit", h.R.some((r) => r.description === "note"));
  t("lot : la famille non concernée est intacte", h.Z.length === 1 && h.Z[0] === temoin);

  t("🩸 lot : UN SEUL instantané d'historique (sinon N Ctrl+Z pour annuler)",
    h.journal.snap === 1);
  t("🩸 lot : UNE SEULE entrée d'historique", h.journal.record.length === 1);
  t("🩸 lot : UNE SEULE écriture par famille touchée (sinon N re-rendus complets)",
    h.journal.rendus.roads === 1 && h.journal.rendus.structures === 1);
  t("lot : la famille non touchée n'est PAS réécrite", h.journal.rendus.zones === undefined);
  t("lot : la session est sauvegardée une fois", h.journal.saves === 1);
}

// ── 4. Lot : refus propres ──────
{
  const h = contexte();
  const CV = h.ctx.KtaConvertir;
  const a = { type: "front-1", points: ligne(0, 0, 10) };
  h.S = [a];

  t("lot : liste vide → rien, sans planter",
    CV.convertirLot([], "roads", "principal").convertis === 0);
  t("lot : arguments manquants → rien", CV.convertirLot(null, "roads", "principal").convertis === 0);
  const orphelin = CV.convertirLot([{ famille: "structures", obj: { type: "mur", points: [] } }], "roads", "chemin");
  t("lot : un objet absent de sa famille compte en ÉCHEC, pas en converti",
    orphelin.echecs === 1 && orphelin.convertis === 0);
  t("🩸 lot : zéro conversion → AUCUNE entrée d'historique (rien à annuler)",
    h.journal.record.length === 0);
  t("lot : zéro conversion → aucune écriture", h.journal.rendus.roads === undefined);

  // 🩸 Une jonction n'est jamais convertie, même glissée dans un lot : devenue tracé ordinaire, elle perdrait
  // fromLevel / toLevel et le passage d'itinéraire entre niveaux (la fiche ne propose pas Convertir pour elle).
  const jonc = { type: "jonction", fromLevel: 0, toLevel: -1, points: ligne(0, 0, 5) };
  const autre = { type: "chemin", points: ligne(0, 10, 5) };
  h.R = [jonc, autre];
  const bj = CV.convertirLot([{ famille: "roads", obj: jonc }, { famille: "roads", obj: autre }],
    "structures", "front-2");
  t("🩸 lot : la jonction est SAUTÉE (comptée à part), le reste converti",
    bj.convertis === 1 && bj.sautes === 1 && bj.echecs === 0);
  t("🩸 lot : la jonction reste une jonction avec ses niveaux",
    h.R.length === 1 && h.R[0].type === "jonction" && h.R[0].fromLevel === 0 && h.R[0].toLevel === -1);
  t("lot : fromLevel/toLevel absents de l'objet reclassé",
    h.S.some((s) => s.type === "front-2" && s.fromLevel === undefined && s.toLevel === undefined));
  const iti = { type: "itinerary", points: ligne(0, 20, 5) };
  h.R = h.R.concat([iti]);
  const bi = CV.convertirLot([{ famille: "roads", obj: iti }], "structures", "front-2");
  t("lot : `itinerary` non plus n'est jamais converti", bi.convertis === 0 && bi.sautes === 1);
}

// ── 5. Cibles d'un lot : UNION, pas intersection ──────
{
  const h = contexte();
  const CV = h.ctx.KtaConvertir;
  const items = [
    { famille: "structures", obj: { type: "front-1" } },
    { famille: "roads",      obj: { type: "principal" } }
  ];
  const cibles = CV.listerCiblesLot(items).map((c) => c.famille + ":" + c.type);
  // « principal », source du 2e, reste une cible légitime pour le 1er (une intersection l'effacerait).
  t("🩸 cibles du lot : UNION — « principal » reste proposé malgré la source",
    cibles.indexOf("roads:principal") >= 0);
  t("cibles du lot : « front-2 » y est aussi", cibles.indexOf("structures:front-2") >= 0);
  t("cibles du lot : aucun doublon", new Set(cibles).size === cibles.length);
  t("🩸 cibles du lot : AUCUNE surface fermée (la règle d'ouverture tient)",
    !cibles.some((c) => c.indexOf("zones:") === 0 || c === "structures:pilier-1"));
  t("cibles du lot : `itinerary` et `jonction` restent interdits",
    cibles.indexOf("roads:itinerary") < 0 && cibles.indexOf("roads:jonction") < 0);
}

// ── 6. `itinerary` n'est pas sélectionnable ──────
{
  const h = contexte();
  const SM = h.ctx.SelectionMulti;
  const iti = { type: "itinerary", points: ligne(0, 0, 100) };
  h.R = [iti];
  // règle interne à _candidats(), vérifiée sur la source
  const SRC = fs.readFileSync("js/selectionMulti.js", "utf8");
  t("🩸 `itinerary` est exclu de la sélection (c'est le trajet calculé)",
    /EXCLUS\s*=\s*\{[^}]*itinerary:\s*true/.test(SRC));
  t("🩸 `jonction` est exclue de la sélection (ses niveaux ne survivent pas à une conversion)",
    /EXCLUS\s*=\s*\{[^}]*jonction:\s*true/.test(SRC));
  t("sélection : les objets à moins de 2 points sont écartés",
    SRC.indexOf("obj.points.length < 2") >= 0);
}

// ── 7. Câblage, que l'extraction ne voit pas ──────
{
  const IDX = fs.readFileSync("index.html", "utf8");
  const SW  = fs.readFileSync("sw.js", "utf8");
  const CV  = fs.readFileSync("js/convertirObjet.js", "utf8");
  const SM  = fs.readFileSync("js/selectionMulti.js", "utf8");
  const FR  = JSON.parse(fs.readFileSync("lang/fr.json", "utf8"));

  t("câblage : selectionMulti.js est chargé par index.html", /src="js\/selectionMulti\.js"/.test(IDX));
  t("câblage : il est précaché", SW.indexOf('"./js/selectionMulti.js"') >= 0);
  t("🩸 câblage : chargé APRÈS convertirObjet.js (il l'interroge)",
    IDX.indexOf("js/convertirObjet.js") < IDX.indexOf("js/selectionMulti.js"));
  t("câblage : la modale de conversion ouvre le mode",
    /SelectionMulti\.ouvrir\(/.test(CV));
  t("câblage : et revient avec le lot", /ouvrir\(famille, obj, \{ lot: sel \}\)/.test(CV));
  t("câblage : le bouton d'entrée existe", /id="kta-convert-multi"/.test(CV));

  // 🩸 Classe du floater lue par _modeClicCarteActif() : sans elle, les popups d'annotation avalent le clic.
  t("🩸 câblage : le bandeau porte `kta-iti-floater`", /kta-iti-floater kta-selm-floater/.test(SM));
  // 🩸 Viser l'OBJET DE STYLE : un commentaire aux mêmes mots satisferait une recherche de chaîne.
  t("🩸 câblage : la surbrillance est NON interactive (sinon elle mange les clics)",
    /Object\.assign\(\{\}, SURBRILLANCE, \{ fill: false, interactive: false \}\)/.test(SM));
  t("🩸 câblage : le listener `click` est retiré à la fermeture",
    /map\.off\("click", _handler\)/.test(SM));
  t("câblage : le calque de surbrillance est retiré à la fermeture",
    /removeLayer\(_groupe\)/.test(SM));
  t("🎨 la surbrillance utilise l'accent d'interaction de la charte",
    SM.indexOf("#8cb4ff") >= 0);

  ["convert.selMulti", "convert.lotSource", "convert.lotBilan", "convert.histoireLot",
   "selm.compte", "selm.valider", "selm.annuler", "selm.tousDuType", "selm.ajoutes",
   "selm.aucunAjout", "selm.retire", "selm.rien", "selm.refusOuvert", "selm.refusFerme"
  ].forEach(function (k) {
    ["fr", "en", "es"].forEach(function (l) {
      const D = JSON.parse(fs.readFileSync("lang/" + l + ".json", "utf8"));
      t("i18n " + l + " : " + k, typeof D[k] === "string" && D[k].length > 0);
    });
  });
  t("le refus est EXPLIQUÉ, pas silencieux (les deux sens ont leur message)",
    /LIGNE/.test(FR["selm.refusOuvert"]) && /SURFACE/.test(FR["selm.refusFerme"]));
}

console.log(ko === 0 ? "\n🎉 sélection multiple + conversion en lot : tout passe" : "\n⚠️ " + ko + " echec(s)");
process.exit(ko === 0 ? 0 : 1);
