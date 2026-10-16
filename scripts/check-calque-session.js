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
    Promise, JSON, Array, Object, String, Number,
    // Blob minimal : `_octets` lit `.size`, et `_telecharger` en construit un.
    // Le laisser `undefined` faisait echouer le telechargement DANS son
    // try/catch — le test passait a cote sans rien voir.
    Blob: function (parts) { this.size = (parts || []).join("").length; },
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
    I18n: { t: (k) => k },
    // `exporterCalque` télécharge : on capture au lieu d'écrire.
    URL: { createObjectURL: (b) => { ctx.__blob = b; return "blob:x"; }, revokeObjectURL() {} },
    document: { createElement: () => ({ click() { ctx.__telecharge = true; } }) }
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
   "rapatrier", "restituer", "exporterCalque", "appliquerVerrous", "getSessionState", "loadSessionState",
   "resynchroniser"]
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

  // ───────── 2 bis. L'EXPORT QUI FERME LA BOUCLE VERS LE ZIP ─────────
  {
    const m = monter(CALQUE);
    await m.CS.rapatrier("sig");
    m.etat.roads.push({ type: "principal", points: [{ x: 7, y: 7 }] });   // cree a la main
    m.etat.zones.length = 0;                                             // toutes supprimees
    const ex = m.CS.exporterCalque("sig");

    t("export : reussit", !!(ex && ex.ok));
    t("export : nomme d'apres l'ID du calque (le `file` resolu peut etre un blob:)",
      ex.nom === "sig.json");
    t("export : n'emporte QUE les objets marques", ex.total === 4);
    t("export : compte a part les objets crees a la main", ex.horsCalque === 1);
    t("export : le fichier est bien telecharge", m.ctx.__telecharge === true);

    const p = ex.stats;
    t("export : forme de data layer (data/roads/zones/structures)",
      Array.isArray(p.data) && Array.isArray(p.roads) && Array.isArray(p.zones) && Array.isArray(p.structures));
    // 🩸 REMPLACEMENT : un tableau VIDE doit etre ECRIT. L'omettre laisserait
    // les anciennes zones en place au rechargement — la suppression serait
    // silencieusement annulee.
    t("🩸 export : les zones supprimees sortent en tableau VIDE, pas omises",
      p.zones.length === 0 && "zones" in p);
    t("export : l'objet cree a la main n'y est pas", p.roads.length === 2);
    t("🧹 export : la marque interne `_srcCalque` est RETIREE",
      p.roads.concat(p.zones, p.structures, p.data).every(function (o) { return o._srcCalque === undefined; }));
    t("export : la session n'est pas alteree par l'export",
      m.CS.compterCopie("sig") === 4 && m.CS.estRapatrie("sig") === true);
  }
  {
    const m = monter(CALQUE);
    t("export sans rapatriement : refuse", m.CS.exporterCalque("sig").ok === false);
  }

  // ───────── 2 ter. 🩸 PLUSIEURS CALQUES EN MÊME TEMPS ─────────
  // Question KARMA (05/09) : « si je rapatrie plusieurs layers, ils se cumulent
  // en session ? » Oui — et chacun doit rester INDÉPENDANT. C'est `_srcCalque`
  // qui le permet : sans lui, restituer un calque emporterait le contenu de
  // l'autre, et l'export du premier embarquerait les objets du second.
  {
    const CALQUE_B = { roads: [{ type: "chemin", points: [{ x: 50, y: 60 }] }],
                       zones: [{ type: "eau", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] }] };
    // Deux calques declares, et un `fetch` qui rend celui qu'on demande.
    const m = monter(CALQUE);
    m.ctx.PLAN_CONFIG.dataLayers.push({ id: "puits", label: "Puits", file: "data/puits.json" });
    m.ctx.dataLayerGroups.puits = { __id: "puits" };
    m.surCarte.puits = true;
    m.ctx.fetch = (url) => Promise.resolve({
      json: () => Promise.resolve(String(url).indexOf("puits") >= 0 ? CALQUE_B : CALQUE)
    });

    await m.CS.rapatrier("sig");
    await m.CS.rapatrier("puits");
    t("multi : les DEUX calques sont rapatries",
      m.CS.estRapatrie("sig") && m.CS.estRapatrie("puits"));
    t("multi : les objets se CUMULENT en session", m.etat.roads.length === 3);
    t("multi : chaque calque garde son compte", m.CS.compterCopie("sig") === 5 && m.CS.compterCopie("puits") === 2);
    t("multi : les deux originaux sont masques", m.surCarte.sig === false && m.surCarte.puits === false);
    t("multi : l'etat porte les deux ids",
      JSON.stringify(m.CS.getSessionState()) === JSON.stringify({ rapatries: ["sig", "puits"] }));

    // 🩸 L'EXPORT NE MELANGE PAS : il ne sort QUE le calque demande.
    const exB = m.CS.exporterCalque("puits");
    t("🩸 multi : l'export d'un calque n'emporte QUE le sien", exB.total === 2);
    t("  -> et ne compte pas les objets de l'autre comme « crees a la main »", exB.horsCalque === 0);

    // 🩸 LA RESTITUTION EST CHIRURGICALE ENTRE CALQUES.
    const rr = m.CS.restituer("sig");
    t("🩸 multi : restituer « sig » ne retire QUE ses 5 objets", rr.retires === 5);
    t("  -> « puits » est intact en session", m.CS.compterCopie("puits") === 2);
    t("  -> et reste rapatrie", m.CS.estRapatrie("puits") === true);
    t("  -> son original reste masque", m.surCarte.puits === false);
    t("  -> tandis que « sig » revient sur la carte", m.surCarte.sig === true);
  }

  // ───────── 2 quater. 🩸 L'INTERACTION AVEC « CONVERTIR CET OBJET » ─────────
  // Question KARMA (05/09) : « je rapatrie, je CORRIGE des objets du calque,
  // puis je restitue — je perds quoi ? »
  //
  // Tout repose sur un detail de `convertirObjet.js` : il reconstruit l'objet
  // par `Object.assign({}, obj, { type })`, donc il REPART DE L'ORIGINAL et
  // conserve `_srcCalque`. Si un jour quelqu'un le reecrit en ne recopiant que
  // les champs connus (points / level / description), la marque sauterait —
  // et un objet converti SURVIVRAIT a la restitution pendant que son original
  // reviendrait du calque : LE DOUBLON QUE TOUTE CETTE CONCEPTION EXISTE POUR
  // EMPECHER. Ce controle est la pour ca.
  {
    const m = monter(CALQUE);
    m.ctx.HistoryManager = { captureState: () => null, pushState() {} };
    m.ctx.ktaResolveStyle = () => ({});
    vm.runInContext(fs.readFileSync("js/convertirObjet.js", "utf8"), m.ctx, { filename: "convertirObjet.js" });
    await m.CS.rapatrier("sig");

    const CV = m.ctx.KtaConvertir;
    if (!CV || typeof CV.convertir !== "function") {
      t("interaction : KtaConvertir expose `convertir`", false);
    } else {
      const front = m.etat.structures[0];
      t("depart : l'objet du calque porte la marque", front._srcCalque === "sig");
      const ok = CV.convertir("structures", front, "roads", "secondaire");
      t("interaction : la conversion structure -> trace reussit", ok === true);
      const converti = m.etat.roads.find(function (o) { return o.type === "secondaire" && o.points === front.points; })
                    || m.etat.roads[m.etat.roads.length - 1];
      t("🩸 interaction : l'objet CONVERTI GARDE `_srcCalque`",
        !!converti && converti._srcCalque === "sig");
      const rr = m.CS.restituer("sig");
      t("🩸 interaction : la restitution l'emporte donc AVEC les autres — pas de doublon",
        m.etat.roads.filter(function (o) { return o._srcCalque === "sig"; }).length === 0);
      t("  -> et le compte total retire est bien celui du calque", rr.retires === 5);
    }
  }

  // ───────── 2 quinquies. 🩸 ET LES POI (question KARMA, 05/09) ─────────
  // « Convertir » ne gere que les VECTEURS — un point n'a pas de geometrie a
  // ouvrir ou fermer, la question ne se pose pas pour lui. Un POI se corrige
  // par sa FICHE (tag, nom, description), et cette porte-la existait deja.
  //
  // Le risque est le meme que pour la conversion : si la sauvegarde de la
  // fiche RECONSTRUISAIT le point au lieu de le muter, `_srcCalque` sauterait
  // et le POI corrige survivrait a la restauration pendant que son original
  // reviendrait du calque — un doublon, exactement comme pour les vecteurs.
  // `editor.js` mute en place (`existingPoint.nom = …`). Controle STRUCTUREL :
  // le formulaire est trop lie au DOM pour tourner ici, on verifie la forme du
  // code, pas son execution — et on le dit.
  {
    const ED = fs.readFileSync("js/editor.js", "utf8");
    t("🩸 POI : la fiche MUTE le point, elle ne le reconstruit pas",
      /existingPoint\.nom\s*=/.test(ED) && /existingPoint\.tags\s*=/.test(ED));
    t("POI : « Convertir » ne pretend PAS gerer les points",
      fs.readFileSync("js/convertirObjet.js", "utf8").indexOf("editorPoints") < 0);

    // 🩸 LA SECONDE PORTE : le Tableau. Il relit les points, les fait editer en
    // masse, puis les REPOSE en session (`_remplacerSession`). S'il copiait par
    // liste blanche de champs au lieu de copier l'objet entier, il effacerait
    // `_srcCalque` sur TOUTE la table d'un coup — bien plus large que la fiche.
    const TAB = fs.readFileSync("js/tableEditor.js", "utf8");
    t("🩸 POI : le Tableau copie l'objet ENTIER (Object.assign), pas une liste de champs",
      /\.map\(function \(?p\)? \{ return Object\.assign\(\{\}, p\); \}\)/.test(TAB) ||
      /Object\.assign\(\{\}, p\)/.test(TAB));
    t("POI : le Tableau repose bien les points en session",
      TAB.indexOf("window.setEditorPoints(_data)") >= 0);
  }

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

  // ───────── 4 bis. 🩸 IMPORT D'UNE SESSION : la liste se DEDUIT des marques ─────────
  // Le fichier session emporte les objets marques, PAS `calquesSession`. Sans
  // recalage : doublon a l'ecran sur un autre appareil (calque d'origine
  // reaffiche par-dessus sa copie) et « Exporter » refuse (`pasRapatrie`).
  {
    const m = monter(CALQUE, { roads: [{ type: "a", points: [], _srcCalque: "sig" }] });
    const r = m.CS.resynchroniser();
    t("🩸 import autre appareil : le calque est remis en modification",
      m.CS.estRapatrie("sig") && JSON.stringify(r.rapatries) === "[\"sig\"]");
    t("🩸 import autre appareil : le calque d'origine est MASQUE (pas de doublon)", m.surCarte.sig === false);
  }
  {
    const m = monter(CALQUE);
    m.CS.loadSessionState({ rapatries: ["sig"] });
    m.surCarte.sig = false;                          // verrouille avant l'import...
    const r = m.CS.resynchroniser();                 // ... d'une session SANS sa copie
    t("🩸 import sans la copie : le calque est LIBERE et reaffiche (pas de calque vide)",
      r.liberes.indexOf("sig") >= 0 && m.surCarte.sig === true && !m.CS.estRapatrie("sig"));
  }
  {
    const m = monter(CALQUE, { zones: [{ type: "eau", points: [], _srcCalque: "autrePlan" }] });
    const r = m.CS.resynchroniser();
    t("import d'un autre plan : la marque inconnue est RETIREE (objet = creation a la main)",
      r.orphelins === 1 && m.etat.zones[0]._srcCalque === undefined && r.rapatries.length === 0);
  }
  {
    const m = monter(CALQUE);
    delete m.ctx.PLAN_CONFIG;
    t("resynchroniser sans plan : ne touche a rien", m.CS.resynchroniser() === null);
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
  const IE = fs.readFileSync("js/interfaceImportExport.js", "utf8");

  t("cablage : le script est charge par index.html", /src="js\/calqueSession\.js"/.test(IDX));
  t("cablage : le module est precache (sw.js)", SW.indexOf('"./js/calqueSession.js"') >= 0);
  t("cablage : la session COLLECTE l'etat", /calquesSession:\s*\(window\.CalqueSession/.test(SP));
  t("cablage : le payload l'ECRIT", /calquesSession:\s*state\.calquesSession/.test(SP));
  t("cablage : le restore le RELIT", /CalqueSession\.loadSessionState\(payload\.calquesSession\)/.test(SP));
  t("cablage : le restore applique les verrous APRES les objets",
    SP.indexOf("CalqueSession.appliquerVerrous") > SP.indexOf("CalqueSession.loadSessionState(payload"));
  t("🩸 cablage : l import de session RESYNCHRONISE les calques APRES les objets",
    IE.indexOf("CalqueSession.resynchroniser()") > IE.indexOf("window.setStructures(dataParsee.structures"));
  t("🩸 cablage : effacer la session RESTITUE les calques (piege 1)",
    // clear(opts) — `opts.snapshotFait` évite un double snapshot
    // quand la modale de restauration l'a déjà pris et attendu (audit Q44).
    /function clear\((?:opts)?\)[\s\S]{0,2000}CalqueSession\.listeRapatries[\s\S]{0,300}restituer\(/.test(SP));
  // 🩸 UN <button> N'EMET JAMAIS `change`. Les trois actions ont d'abord ete
  // posees dans le listener `change` du panneau, avec les cases a cocher :
  // elles y etaient MORTES SILENCIEUSEMENT — aucune erreur console, juste
  // rien au clic. C'est KARMA qui l'a vu a l'ecran, pas la relecture.
  // On verifie donc le TYPE D'EVENEMENT, pas seulement la presence de
  // l'attribut : c'est la difference entre « c'est ecrit » et « ca marche ».
  ["rapatrier", "restituer", "exporter"].forEach(function (act) {
    const i = FP.indexOf("[data-calque-" + act + "]");
    const avant = i < 0 ? "" : FP.slice(0, i);
    const dernier = avant.lastIndexOf("addEventListener(\"");
    const type = dernier < 0 ? "?" : avant.slice(dernier + 18).split("\"")[0];
    t("🩸 cablage : « " + act + " » est branche sur CLICK (lu : " + type + ")", type === "click");
  });

  t("cablage : le panneau de filtres porte les trois actions",
    /data-calque-rapatrier/.test(FP) && /data-calque-restituer/.test(FP) && /data-calque-exporter/.test(FP));
  t("cablage : l export dit OU deposer le fichier (sinon il est inutilisable)",
    /filter.calque.exporte"/.test(FP) && /filter.calque.exporteAvecReste/.test(FP));
  // 🩸 LE RETOUR PROPOSE D EXPORTER AVANT. Ce qu il detruit peut valoir des
  // heures de correction ; un `confirm` binaire ne laissait le choix qu entre
  // perdre et renoncer. Trois issues desormais, et le chemin sur est le
  // bouton principal.
  t("🩸 retour : l export est PROPOSE avant de restituer",
    FP.indexOf("filter.calque.exportAvantMsg") >= 0 && FP.indexOf("_exporterCalque(id)") >= 0);
  t("🩸 retour : trois issues (exporter / restituer quand meme / annuler)",
    FP.indexOf("filter.calque.exportAvantOui") >= 0 &&
    FP.indexOf("filter.calque.restituerOk") >= 0 &&
    FP.indexOf("filter.calque.restituerAnnuler") >= 0);
  t("retour : un calque sans objet ne pose aucune question",
    /n <= 0.{0,40}_restituerVraiment/.test(FP));
  t("cablage : le panneau annonce le POIDS avant de rapatrier",
    /CS\.peser\(id\)/.test(FP) && /occupationLocalStorage/.test(FP));
  t("cablage : le calque « editor » n'est pas rapatriable (il EST la session)",
    /id !== "editor"/.test(FP));

  console.log(ko === 0 ? "\n🎉 rapatriement de calque : tout passe"
                       : "\n⚠️ " + ko + " echec(s)");
  process.exit(ko === 0 ? 0 : 1);
})();
