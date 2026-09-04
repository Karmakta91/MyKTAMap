#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🔄 check-calque-session.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Éprouve le RAPATRIEMENT D'UN CALQUE DE DONNÉES DANS LA SESSION
// (`js/calqueSession.js`, demande KARMA du 04/09 : corriger un front de taille
// en tracé imposait huit étapes et un aller-retour par des fichiers).
//
// Le module charge dans un `vm` avec des bouchons — donc c'est le VRAI code
// qui est éprouvé, pas une reconstitution. S'il disparaît ou change de nom, le
// script échoue bruyamment au lieu de tester du vide.
//
// CE QU'IL VERROUILLE, et pourquoi chacun de ces points coûte cher :
//
//   1. LE MARQUAGE. Chaque objet rapatrié porte `_srcCalque`. Sans lui, le
//      retour ne sait plus quoi retirer et emporterait le travail de
//      l'utilisateur avec la copie.
//   2. LA COPIE EST DÉFENSIVE. Muter l'objet du calque contaminerait la source
//      relue au prochain chargement — une corruption invisible et définitive.
//   3. LE RETOUR EST CHIRURGICAL. Il retire ce qui porte la marque, et RIEN
//      d'autre : les objets créés à la main pendant la session restent.
//   4. 🩸 LE VERROU NE S'APPLIQUE QUE SI LA COPIE EST LÀ. C'est le piège
//      mortel : la sauvegarde saute sur quota (1,1 Mo, c'est exactement le
//      seuil sur un relevé SIG), on recharge, le verrou masque le calque et la
//      copie manque → plan vide, sans un mot. `appliquerVerrous` doit LIBÉRER
//      dans ce cas, pas masquer.
//   5. 🩸 EFFACER LA SESSION REND LE CALQUE. Le verrou vit dans la session ;
//      s'il survit à l'effacement de la copie, l'utilisateur voit son relevé
//      disparaître et croit le plan cassé. Vérifié à la source, dans
//      `sessionPersist.js > clear()`.
//   6. LE CÂBLAGE que l'extraction ne voit pas : script chargé, précaché,
//      hooks de session posés, interface branchée.
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

const SRC = fs.readFileSync("js/calqueSession.js", "utf8");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };

// ───────── bouchons : le minimum pour que le module vive ─────────
function monter(calque, sessionInitiale) {
  const etat = {
    editorPoints: (sessionInitiale && sessionInitiale.editorPoints) || [],
    roads:        (sessionInitiale && sessionInitiale.roads)        || [],
    zones:        (sessionInitiale && sessionInitiale.zones)        || [],
    structures:   (sessionInitiale && sessionInitiale.structures)   || []
  };
  const surCarte = { sig: true };
  const ctx = {
    console: { log() {}, warn() {} },
    Promise, JSON, Array, Object, String, Number, Blob: undefined,
    setTimeout,
    localStorage: {
      length: 2,
      key: (i) => ["myktamap_session_v1_p1", "autre"][i],
      getItem: (k) => (k === "myktamap_session_v1_p1" ? "x".repeat(500) : "y".repeat(100))
    },
    fetch: (url) => Promise.resolve({ json: () => Promise.resolve(calque) }),
    getEditorPoints: () => etat.editorPoints, setEditorPoints: (a) => { etat.editorPoints = a; },
    getRoads:        () => etat.roads,        setRoads:        (a) => { etat.roads = a; },
    getZones:        () => etat.zones,        setZones:        (a) => { etat.zones = a; },
    getStructures:   () => etat.structures,   setStructures:   (a) => { etat.structures = a; },
    PLAN_CONFIG: { dataLayers: [{ id: "sig", label: "Import SIG", file: "data/sig.json" }] },
    dataLayerGroups: { sig: { __id: "sig" } },
    map: {
      hasLayer: (g) => !!surCarte[g.__id],
      removeLayer: (g) => { surCarte[g.__id] = false; },
      addLayer: (g) => { surCarte[g.__id] = true; }
    },
    I18n: { t: (k) => k }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "calqueSession.js" });
  return { CS: ctx.CalqueSession, etat, surCarte, ctx };
}

const CALQUE = {
  roads:      [{ type: "secondaire", points: [{ x: 1, y: 2 }], level: -2 },
               { type: "principal",  points: [{ x: 3, y: 4 }], level: -2 }],
  zones:      [{ type: "eau", points: [{ x: 5, y: 6 }, { x: 7, y: 8 }, { x: 9, y: 1 }] }],
  structures: [{ type: "front-1", points: [{ x: 2, y: 2 }] }],
  data:       [{ x: 10, y: 20, tags: ["pa"] }]
};

// ───────── 1. surface d'API ─────────
{
  const { CS } = monter(CALQUE);
  ["estRapatrie", "listeRapatries", "compterCopie", "peser", "occupationLocalStorage",
   "rapatrier", "restituer", "appliquerVerrous", "getSessionState", "loadSessionState"]
    .forEach(function (m) {
      t("API : CalqueSession." + m + "()", typeof CS[m] === "function");
    });
  t("API : CLE_SOURCE exposee et vaut _srcCalque", CS.CLE_SOURCE === "_srcCalque");
}

// ───────── 2. rapatriement ─────────
(async function () {
  const { CS, etat, surCarte } = monter(CALQUE);
  const avantRoad = CALQUE.roads[0];

  t("avant : le calque n'est pas rapatrie", CS.estRapatrie("sig") === false);
  t("avant : le calque est sur la carte", surCarte.sig === true);

  const r = await CS.rapatrier("sig");
  t("rapatrier : reussit", !!(r && r.ok));
  t("rapatrier : compte les 5 objets des 4 familles", r.total === 5);
  t("  -> 2 roads, 1 zone, 1 structure, 1 point",
    r.stats.roads === 2 && r.stats.zones === 1 && r.stats.structures === 1 && r.stats.editorPoints === 1);
  t("rapatrier : les objets sont DANS la session",
    etat.roads.length === 2 && etat.zones.length === 1 && etat.structures.length === 1 && etat.editorPoints.length === 1);

  // 1. LE MARQUAGE
  const tous = etat.roads.concat(etat.zones, etat.structures, etat.editorPoints);
  t("marquage : les 5 objets portent `_srcCalque` = sig",
    tous.length === 5 && tous.every(function (o) { return o._srcCalque === "sig"; }));

  // 2. LA COPIE EST DÉFENSIVE
  etat.roads[0].type = "MODIFIE";
  etat.roads[0].points[0].x = 999;
  t("copie defensive : le calque source n'est pas mute (type)", avantRoad.type === "secondaire");
  t("copie defensive : ni sa geometrie (reference profonde)", avantRoad.points[0].x === 1);

  // LE VERROU
  t("verrou : le calque d'origine est masque", surCarte.sig === false);
  t("etat : estRapatrie devient vrai", CS.estRapatrie("sig") === true);
  t("etat : listeRapatries le contient", CS.listeRapatries().indexOf("sig") >= 0);
  t("etat : compterCopie voit les 5", CS.compterCopie("sig") === 5);
  t("etat : getSessionState porte l'id", JSON.stringify(CS.getSessionState()) === JSON.stringify({ rapatries: ["sig"] }));

  const r2 = await CS.rapatrier("sig");
  t("rapatrier deux fois : refuse (pas de doublon)", r2.ok === false && r2.code === "dejaRapatrie");
  const r3 = await CS.rapatrier("inconnu");
  t("rapatrier un calque inconnu : refuse", r3.ok === false && r3.code === "calqueInconnu");

  // ───────── 3. LE RETOUR EST CHIRURGICAL ─────────
  etat.roads.push({ type: "principal", points: [{ x: 0, y: 0 }] });   // cree a la main
  const rr = CS.restituer("sig");
  t("restituer : reussit", !!(rr && rr.ok));
  t("restituer : retire exactement les 5 rapatries", rr.retires === 5);
  t("restituer : l'objet cree a la main SURVIT",
    etat.roads.length === 1 && etat.roads[0]._srcCalque === undefined);
  t("restituer : le calque revient sur la carte", surCarte.sig === true);
  t("restituer : l'etat est vide", CS.estRapatrie("sig") === false && CS.getSessionState() === null);
  t("restituer sans rapatriement : refuse", CS.restituer("sig").ok === false);

  // ───────── 4. 🩸 LE VERROU SANS SA COPIE ─────────
  {
    const m = monter(CALQUE);
    m.CS.loadSessionState({ rapatries: ["sig"] });   // etat restaure...
    // ... mais AUCUN objet en session (la sauvegarde avait saute sur quota)
    const v = m.CS.appliquerVerrous();
    t("verrou orphelin : le calque N'EST PAS masque", m.surCarte.sig === true);
    t("verrou orphelin : il est LIBERE", v.liberes.indexOf("sig") >= 0 && v.verrouilles.length === 0);
    t("verrou orphelin : estRapatrie repasse a faux", m.CS.estRapatrie("sig") === false);
  }
  // ... et le cas nominal, lui, verrouille bien
  {
    const m = monter(CALQUE, { roads: [{ type: "a", points: [], _srcCalque: "sig" }] });
    m.CS.loadSessionState({ rapatries: ["sig"] });
    const v = m.CS.appliquerVerrous();
    t("verrou avec sa copie : le calque EST masque", m.surCarte.sig === false);
    t("verrou avec sa copie : rien n'est libere", v.liberes.length === 0);
  }

  // ───────── etat corrompu ─────────
  {
    const m = monter(CALQUE);
    m.CS.loadSessionState({ rapatries: ["sig", 42, null, ""] });
    t("etat corrompu : seules les chaines non vides sont gardees",
      JSON.stringify(m.CS.listeRapatries()) === JSON.stringify(["sig"]));
    m.CS.loadSessionState(null);
    t("loadSessionState(null) : etat vide", m.CS.listeRapatries().length === 0);
  }

  // ───────── 5 et 6. le cablage, que l'extraction ne voit pas ─────────
  const SP = fs.readFileSync("js/sessionPersist.js", "utf8");
  const FP = fs.readFileSync("js/filterPanel.js", "utf8");
  const IDX = fs.readFileSync("index.html", "utf8");
  const SW = fs.readFileSync("sw.js", "utf8");

  t("cablage : le script est charge par index.html", /src="js\/calqueSession\.js"/.test(IDX));
  t("cablage : le module est precache (sw.js)", SW.indexOf('"./js/calqueSession.js"') >= 0);
  t("cablage : la session COLLECTE l'etat", /calquesSession:\s*\(window\.CalqueSession/.test(SP));
  t("cablage : le payload l'ECRIT", /calquesSession:\s*state\.calquesSession/.test(SP));
  t("cablage : le restore le RELIT", /CalqueSession\.loadSessionState\(payload\.calquesSession\)/.test(SP));
  t("cablage : le restore applique les verrous APRES les objets",
    SP.indexOf("CalqueSession.appliquerVerrous") > SP.indexOf("CalqueSession.loadSessionState(payload"));
  t("🩸 cablage : effacer la session RESTITUE les calques (piege 1)",
    /function clear\(\)[\s\S]{0,2000}CalqueSession\.listeRapatries[\s\S]{0,300}restituer\(/.test(SP));
  t("cablage : le panneau de filtres porte les deux actions",
    /data-calque-rapatrier/.test(FP) && /data-calque-restituer/.test(FP));
  t("cablage : le panneau annonce le POIDS avant de rapatrier",
    /CS\.peser\(id\)/.test(FP) && /occupationLocalStorage/.test(FP));
  t("cablage : le calque « editor » n'est pas rapatriable (il EST la session)",
    /id !== "editor"/.test(FP));

  console.log(ko === 0 ? "\n🎉 rapatriement de calque : tout passe"
                       : "\n⚠️ " + ko + " echec(s)");
  process.exit(ko === 0 ? 0 : 1);
})();
