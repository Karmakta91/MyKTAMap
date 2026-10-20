#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-calque-session.js — garde-fou pré-commit BLOQUANT du rapatriement d'un calque en session
// =====================================================================
// `js/calqueSession.js`, chargé dans un `vm` avec des bouchons (le VRAI code ; absent ou renommé,
// le script échoue bruyamment). Ce qu'il verrouille :
//   1. le marquage `_srcCalque` : sans lui, le retour ne sait plus quoi retirer ;
//   2. la copie défensive : muter l'objet du calque corromprait la source, invisiblement ;
//   3. le retour chirurgical : seuls les objets marqués partent, les créations à la main restent ;
//   4. 🩸 le verrou ne s'applique QUE si la copie est là : sauvegarde sautée sur quota + verrou qui
//      masque le calque = plan vide sans un mot. `appliquerVerrous` LIBÈRE dans ce cas ;
//   5. 🩸 effacer la session rend le calque (`sessionPersist.js > clear()`), sinon le relevé disparaît ; là où
//      la restitution se partage, « rendre aussi à l'équipe » la note avant le vidage et elle survit à clear() ;
//   5 bis. les ajouts intégrés (objets dessinés à la main rattachés au calque) : exportés, retirés à la
//      restitution qui le DIT, sans trace de suppression, annulables par ⏪, refusés en lecture seule ;
//   6. le câblage que l'extraction ne voit pas (script, précache, hooks de session, interface).
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
    // 🩸 Blob minimal obligatoire : `undefined`, le téléchargement échoue DANS son try/catch et le
    // test passe à côté sans rien voir.
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
   "resynchroniser", "restitutionPartagee", "libelle"]
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

  const tous = etat.roads.concat(etat.zones, etat.structures, etat.editorPoints);
  t("marquage : les 5 objets portent `_srcCalque` = sig",
    tous.length === 5 && tous.every(function (o) { return o._srcCalque === "sig"; }));

  t("🩸 synchro : les copies sont datees du rapatriement (updatedAt), sinon une synchro incrementale les ignore",
    tous.every(function (o) { return typeof o.updatedAt === "number" && Date.now() - o.updatedAt < 60000; }));
  t("la date du releve (date_update) n'est pas touchee", etat.editorPoints[0].date_update === undefined);

  etat.roads[0].type = "MODIFIE";
  etat.roads[0].points[0].x = 999;
  t("copie defensive : le calque source n'est pas mute (type)", avantRoad.type === "secondaire");
  t("copie defensive : ni sa geometrie (reference profonde)", avantRoad.points[0].x === 1);

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
    // 🔒 Le fichier EST le contenu du calque : refusé quand l'installation ne permet pas d'exporter tout le plan.
    const m = monter(CALQUE);
    await m.CS.rapatrier("sig");
    m.ctx.ktaExportPlanRefuse = function (opts) { return !(opts && opts.limitePermise); };
    const ex = m.CS.exporterCalque("sig");
    t("🔒 export du calque refuse par le goulot (sans limitePermise) : rien n'est telecharge",
      ex.ok === false && ex.code === "exportRefuse" && m.ctx.__telecharge !== true);
  }
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
    // 🩸 Un tableau VIDE est ÉCRIT : omis, les anciennes zones reviennent au rechargement.
    t("🩸 export : les zones supprimees sortent en tableau VIDE, pas omises",
      p.zones.length === 0 && "zones" in p);
    t("export : l'objet cree a la main n'y est pas", p.roads.length === 2);
    t("🧹 export : la marque interne `_srcCalque` est RETIREE",
      p.roads.concat(p.zones, p.structures, p.data).every(function (o) { return o._srcCalque === undefined; }));
    t("🧹 export : l'instant du rapatriement `_srcCalqueDepuis` aussi",
      p.roads.concat(p.zones, p.structures, p.data).every(function (o) { return o._srcCalqueDepuis === undefined; }));
    t("export : la session n'est pas alteree par l'export",
      m.CS.compterCopie("sig") === 4 && m.CS.estRapatrie("sig") === true);
  }
  {
    const m = monter(CALQUE);
    t("export sans rapatriement : refuse", m.CS.exporterCalque("sig").ok === false);
  }

  // ───────── 2 ter. 🩸 PLUSIEURS CALQUES EN MÊME TEMPS ─────────
  // Les calques se cumulent en session et restent INDÉPENDANTS grâce à `_srcCalque` : restitution et
  // export d'un calque n'emportent pas l'autre.
  {
    const CALQUE_B = { roads: [{ type: "chemin", points: [{ x: 50, y: 60 }] }],
                       zones: [{ type: "eau", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }] }] };
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

    const exB = m.CS.exporterCalque("puits");
    t("🩸 multi : l'export d'un calque n'emporte QUE le sien", exB.total === 2);
    t("  -> et ne compte pas les objets de l'autre comme « crees a la main »", exB.horsCalque === 0);

    const rr = m.CS.restituer("sig");
    t("🩸 multi : restituer « sig » ne retire QUE ses 5 objets", rr.retires === 5);
    t("  -> « puits » est intact en session", m.CS.compterCopie("puits") === 2);
    t("  -> et reste rapatrie", m.CS.estRapatrie("puits") === true);
    t("  -> son original reste masque", m.surCarte.puits === false);
    t("  -> tandis que « sig » revient sur la carte", m.surCarte.sig === true);
  }

  // ───────── 2 quater. 🩸 L'INTERACTION AVEC « CONVERTIR CET OBJET » ─────────
  // 🩸 `convertirObjet.js` reconstruit par `Object.assign({}, obj, { type })` et garde donc
  // `_srcCalque`. Une copie par liste de champs ferait sauter la marque : l'objet converti
  // survivrait à la restitution pendant que l'original revient du calque (doublon).
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

  // ───────── 2 quinquies. 🩸 ET LES POI ─────────
  // Un POI se corrige par sa FICHE (« Convertir » ne gère que les vecteurs). Même piège : une fiche
  // qui RECONSTRUIT le point perd `_srcCalque` (doublon). `editor.js` mute en place. Contrôle
  // STRUCTUREL (formulaire trop lié au DOM pour tourner ici).
  {
    const ED = fs.readFileSync("js/editor.js", "utf8");
    t("🩸 POI : la fiche MUTE le point, elle ne le reconstruit pas",
      /existingPoint\.nom\s*=/.test(ED) && /existingPoint\.tags\s*=/.test(ED));
    t("POI : « Convertir » ne pretend PAS gerer les points",
      fs.readFileSync("js/convertirObjet.js", "utf8").indexOf("editorPoints") < 0);

    // 🩸 Le Tableau repose tous les points en session : une copie par liste de champs effacerait
    // `_srcCalque` sur TOUTE la table d'un coup.
    const TAB = fs.readFileSync("js/tableEditor.js", "utf8");
    t("🩸 POI : le Tableau copie l'objet ENTIER (Object.assign), pas une liste de champs",
      /\.map\(function \(?p\)? \{ return Object\.assign\(\{\}, p\); \}\)/.test(TAB) ||
      /Object\.assign\(\{\}, p\)/.test(TAB));
    t("POI : le Tableau repose bien les points en session",
      TAB.indexOf("window.setEditorPoints(_data)") >= 0);
  }

  // ───────── 2 sexies. INTÉGRER DES AJOUTS (objets dessinés à la main) ─────────
  // Un objet sans marque rejoint un calque en modification : il doit se comporter en copie (exporté avec le
  // calque, retiré à sa restitution, aucune trace de suppression) et l'intégration s'annule par ⏪. Le VRAI
  // historyManager.js est chargé dans le même `vm`.
  {
    const AVEC_UID = {
      roads: [{ uid: "rd_cal00001", type: "principal", points: [{ x: 1, y: 1 }] }],
      data:  [{ uid: "pt_cal00001", x: 10, y: 20, tags: ["pa"] }]
    };
    const session = () => ({
      editorPoints: [{ uid: "pt_main0001", x: 5, y: 5, nom: "Ajout B", tags: ["pa"], updatedAt: 10 }],
      roads: [{ uid: "rd_main0001", type: "chemin", points: [{ x: 0, y: 0 }], updatedAt: 10 },
              { uid: "rd_iti00001", type: "itinerary", points: [{ x: 0, y: 0 }], updatedAt: 10 }],
      zones: [{ uid: "zn_main0001", type: "eau", points: [], updatedAt: 10 }]
    });
    const monterAjouts = async function (lecture) {
      const m = monter(AVEC_UID, session());
      m.traces = [];
      m.ctx.KtaUid = {
        touch: (o) => { o.updatedAt = Date.now(); return o; },
        estTransitoire: (o) => !!(o && o.type === "itinerary"),
        tombstone: (u) => { m.traces.push(u); }, untombstone() {}
      };
      m.ctx.document.addEventListener = function () {};
      m.ctx.ktaEditionRefusee = () => !!m.lecture;
      vm.runInContext(fs.readFileSync("js/historyManager.js", "utf8"), m.ctx, { filename: "historyManager.js" });
      await m.CS.rapatrier("sig");
      m.lecture = !!lecture;
      return m;
    };

    t("API : candidatsAjout / integrerAjouts / compterAjouts, CLE_AJOUT = _srcCalqueAjout",
      ["candidatsAjout", "integrerAjouts", "compterAjouts"].every((f) => typeof monter(CALQUE).CS[f] === "function") &&
      monter(CALQUE).CS.CLE_AJOUT === "_srcCalqueAjout");

    const m = await monterAjouts();
    const R0 = m.etat.roads.find((o) => o.uid === "rd_cal00001")._srcCalqueDepuis;
    const cand = m.CS.candidatsAjout();
    const uidsCand = [].concat(cand.editorPoints, cand.roads, cand.zones, cand.structures).map((o) => o.uid).sort();
    t("candidats : les objets SANS marque, sans l'itinéraire ni les copies du calque",
      JSON.stringify(uidsCand) === JSON.stringify(["pt_main0001", "rd_main0001", "zn_main0001"]));

    t("intégrer : refusé sur un calque qui n'est pas en modification",
      m.CS.integrerAjouts("puits", ["pt_main0001"]).code === "pasRapatrie");
    t("intégrer : rien de choisi → refus, rien de touché",
      m.CS.integrerAjouts("sig", []).code === "rienChoisi" && m.CS.compterAjouts("sig") === 0);

    m.lecture = true;
    const ro = m.CS.integrerAjouts("sig", ["pt_main0001"]);
    t("🔒 intégrer : refusé en lecture seule, aucune marque posée",
      ro.ok === false && ro.code === "lectureSeule" && m.etat.editorPoints[0]._srcCalque === undefined);
    m.lecture = false;

    const avantMaj = Date.now();
    const r = m.CS.integrerAjouts("sig", ["pt_main0001", "rd_main0001", "rd_iti00001", "rd_cal00001", "inconnu"]);
    const pt = m.etat.editorPoints.find((o) => o.uid === "pt_main0001");
    const rd = m.etat.roads.find((o) => o.uid === "rd_main0001");
    t("intégrer : seuls les candidats choisis (ni itinéraire, ni copie, ni uid inconnu)",
      r.ok === true && r.total === 2 && r.stats.editorPoints === 1 && r.stats.roads === 1);
    t("intégrer : marque du calque + marque d'ajout", pt._srcCalque === "sig" && rd._srcCalque === "sig" &&
      pt._srcCalqueAjout === true && rd._srcCalqueAjout === true);
    t("🩸 intégrer : date de rapatriement = celle des copies (une restitution reçue entre les deux le garde " +
      "en objet ordinaire au lieu de laisser le calque masqué pour lui)", pt._srcCalqueDepuis === R0);
    t("intégrer : objet daté pour la synchro (KtaUid.touch)", pt.updatedAt >= avantMaj && rd.updatedAt >= avantMaj);
    t("intégrer : l'itinéraire et la zone non choisie restent hors calque",
      m.etat.roads.find((o) => o.uid === "rd_iti00001")._srcCalque === undefined &&
      m.etat.zones[0]._srcCalque === undefined);
    t("intégrer : compterAjouts = 2, compterCopie compte copies + ajouts",
      m.CS.compterAjouts("sig") === 2 && m.CS.compterCopie("sig") === 4);
    t("un objet appartient à UN calque : déjà intégré, il n'est plus candidat",
      m.CS.integrerAjouts("sig", ["pt_main0001"]).code === "rienChoisi" &&
      m.CS.candidatsAjout().editorPoints.length === 0);
    t("intégrer : une entrée d'historique", m.ctx.HistoryManager.canUndo() === true);

    const ex = m.CS.exporterCalque("sig");
    t("export : les ajouts intégrés partent dans le fichier du calque",
      ex.ok && ex.total === 4 && ex.stats.data.some((o) => o.uid === "pt_main0001") &&
      ex.stats.roads.some((o) => o.uid === "rd_main0001"));
    t("export : le compte « hors calque » diminue d'autant (reste la zone ; l'itinéraire n'est pas compté)",
      ex.horsCalque === 2);
    t("🧹 export : la marque d'ajout est retirée du fichier",
      ex.stats.data.concat(ex.stats.roads).every((o) => o._srcCalqueAjout === undefined && o._srcCalque === undefined));

    // 🔒 Supprimer un objet intégré ne laisse PAS de trace : exporté, son uid est dans le fichier du calque.
    const avantSuppr = m.ctx.HistoryManager.captureState("editorPoints");
    m.etat.editorPoints = m.etat.editorPoints.filter((o) => o.uid !== "pt_main0001");
    m.ctx.HistoryManager.record("suppr", avantSuppr, "editorPoints");
    t("🔒 suppression d'un ajout intégré : aucune trace de suppression (elle viserait le fichier du calque)",
      m.traces.indexOf("pt_main0001") < 0);
    m.ctx.HistoryManager.undo();
    t("  -> ⏪ rend le point supprimé, toujours intégré", m.CS.compterAjouts("sig") === 2);

    m.ctx.HistoryManager.undo();
    const pt2 = m.etat.editorPoints.find((o) => o.uid === "pt_main0001");
    t("⏪ annule l'intégration : objets rendus sans marque", !!pt2 && pt2._srcCalque === undefined &&
      pt2._srcCalqueAjout === undefined && m.CS.compterAjouts("sig") === 0 && m.CS.compterCopie("sig") === 2);
    t("  -> et l'annulation est datée (la synchro l'envoie)", pt2.updatedAt >= avantMaj);
    t("  -> sans trace de suppression", m.traces.length === 0);

    m.lecture = true;
    t("🔒 ⏪ refusé en lecture seule (garde existante)", m.ctx.HistoryManager.redo() === false);
    m.lecture = false;

    // Restitution : les ajouts intégrés partent avec le calque (la fenêtre le dit, cf. câblage plus bas).
    const m2 = await monterAjouts();
    m2.CS.integrerAjouts("sig", ["pt_main0001"]);
    const rr = m2.CS.restituer("sig");
    t("🩸 restitution : l'ajout intégré est retiré avec les copies",
      rr.retires === 3 && !m2.etat.editorPoints.some((o) => o.uid === "pt_main0001"));
    t("restitution : les autres dessins (zone, tracé, itinéraire) restent",
      m2.etat.zones.length === 1 && m2.etat.roads.length === 2);

    // Restitution reçue d'un autre appareil, postérieure au rapatriement : l'ajout modifié après T est GARDÉ en
    // objet ordinaire (uid dérivé, jamais celui du fichier du calque), sans ses marques.
    const m3 = await monterAjouts();
    m3.CS.integrerAjouts("sig", ["pt_main0001"]);
    const T = m3.etat.roads.find((o) => o.uid === "rd_cal00001")._srcCalqueDepuis + 1;
    const pt3 = m3.etat.editorPoints.find((o) => o.uid === "pt_main0001");
    pt3.updatedAt = Math.max(pt3.updatedAt, T + 1);
    const ar = m3.CS.appliquerRestitutions([{ calque: "sig", avant: T }]);
    const garde = m3.etat.editorPoints.find((o) => /_r/.test(o.uid));
    t("restitution reçue : ajout modifié après T gardé, marques retirées, uid dérivé",
      ar.gardes === 1 && !!garde && garde._srcCalque === undefined && garde._srcCalqueAjout === undefined &&
      garde.uid !== "pt_main0001");

    // Import d'une session d'un autre plan : marque inconnue retirée, marque d'ajout aussi.
    const m4 = monter(CALQUE, { zones: [{ uid: "zn_x", type: "eau", points: [], _srcCalque: "autre",
      _srcCalqueAjout: true }] });
    m4.CS.resynchroniser();
    t("import d'un autre plan : la marque d'ajout tombe avec la marque inconnue",
      m4.etat.zones[0]._srcCalqueAjout === undefined && m4.etat.zones[0]._srcCalque === undefined);
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
    m.CS.loadSessionState({ rapatries: ["sig"] });   // état restauré, mais AUCUN objet (quota)
    const v = m.CS.appliquerVerrous();
    t("verrou orphelin : le calque N'EST PAS masque", m.surCarte.sig === true);
    t("verrou orphelin : il est LIBERE", v.liberes.indexOf("sig") >= 0 && v.verrouilles.length === 0);
    t("verrou orphelin : estRapatrie repasse a faux", m.CS.estRapatrie("sig") === false);
  }
  {
    const m = monter(CALQUE, { roads: [{ type: "a", points: [], _srcCalque: "sig" }] });
    m.CS.loadSessionState({ rapatries: ["sig"] });
    const v = m.CS.appliquerVerrous();
    t("verrou avec sa copie : le calque EST masque", m.surCarte.sig === false);
    t("verrou avec sa copie : rien n'est libere", v.liberes.length === 0);
  }

  // ───────── 4 bis. 🩸 IMPORT D'UNE SESSION : la liste se DEDUIT des marques ─────────
  // Le fichier session emporte les objets marqués, PAS `calquesSession` : sans resynchronisation,
  // doublon à l'écran sur un autre appareil et « Exporter » refusé (`pasRapatrie`).
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

  // ───────── 4 ter. 🩸 RESTITUTION PARTAGÉE (plan d'extension) ─────────
  // Jamais une trace de suppression (une trace sur l'uid d'une copie, exportée puis fusionnée, détruirait
  // l'objet du calque) : un enregistrement « calque restitué à T », local à la session de l'appareil.
  {
    const AVEC_UID = { roads: [{ uid: "rd_c1aaaaaa", type: "a", points: [] }, { uid: "rd_c1bbbbbb", type: "b", points: [] }] };
    const ext = function (m, lecture) {
      m.ctx._currentLoadedPlanId = "ext_p1";
      m.ctx.PlanRegistry = { findById: (id) => (id === "ext_p1" ? { id, type: "ext" } : null) };
      m.ctx.KtaExtensions = { lectureSeule: () => !!lecture };
    };
    const m = monter(AVEC_UID);
    await m.CS.rapatrier("sig");
    t("rapatrier : chaque copie porte l'instant du rapatriement (_srcCalqueDepuis)",
      m.CS.CLE_DEPUIS === "_srcCalqueDepuis" && m.etat.roads.every((o) => typeof o._srcCalqueDepuis === "number"));
    m.CS.restituer("sig");
    t("plan local : la restitution n'est PAS notée (rien à envoyer)",
      m.CS.restitutionsDepuis(0).length === 0 && m.CS.getSessionState() === null);

    const m2 = monter(AVEC_UID);
    ext(m2);
    await m2.CS.rapatrier("sig");
    const r2 = m2.CS.restituer("sig");
    const env = m2.CS.restitutionsDepuis(0);
    t("plan d'extension : restitution notée { calque, avant, uids } (uids = copies retirées)",
      r2.partagee === true && env.length === 1 && env[0].calque === "sig" &&
      JSON.stringify(env[0].uids.slice().sort()) === JSON.stringify(["rd_c1aaaaaa", "rd_c1bbbbbb"]));
    t("…seulement si postérieure au seuil", m2.CS.restitutionsDepuis(env[0].avant).length === 0);
    const st = m2.CS.getSessionState();
    t("…gardée dans l'état LOCAL de la session (relu au chargement)", !!st && st.restitutions.sig === env[0].avant &&
      (function () { const m3 = monter(AVEC_UID); m3.CS.loadSessionState(st); return m3.CS.restitutionsDepuis(0).length === 1; })());
    t("🔒 le fichier de session ne l'emporte pas (sessionExporter ne lit pas l'état du module)",
      fs.readFileSync("js/sessionExporter.js", "utf8").indexOf("CalqueSession") < 0);

    const m4 = monter(AVEC_UID);
    ext(m4, true);
    await m4.CS.rapatrier("sig");
    t("plan en lecture seule : restitution locale seulement", m4.CS.restituer("sig").partagee === false &&
      m4.CS.restitutionsDepuis(0).length === 0);
    const m5 = monter(AVEC_UID);
    ext(m5);
    await m5.CS.rapatrier("sig");
    t("« Effacer la session » (opts.local) : jamais notée", m5.CS.restituer("sig", { local: true }).partagee === false &&
      m5.CS.restitutionsDepuis(0).length === 0);
    t("plan d'extension modifiable : restitutionPartagee() vrai, plan local ou lecture seule : faux",
      m5.CS.restitutionPartagee() === true && m4.CS.restitutionPartagee() === false && m.CS.restitutionPartagee() === false);
    t("libelle : nom du calque, son id à défaut", m.CS.libelle("sig") === "Import SIG" && m.CS.libelle("inconnu") === "inconnu");
    // « Rendre aussi les calques à l'équipe » : restitution partagée, puis l'effacement relit l'état en gardant les
    // restitutions (forme exacte de sessionPersist.js > clear) — elle doit encore partir.
    const m8 = monter(AVEC_UID);
    ext(m8);
    await m8.CS.rapatrier("sig");
    m8.CS.restituer("sig");
    const st8 = m8.CS.getSessionState();
    m8.CS.loadSessionState(st8 ? { restitutions: st8.restitutions, aEnvoyer: st8.aEnvoyer } : null);
    t("🩸 rendre à l'équipe puis effacer : la restitution reste à envoyer (uids compris), plus aucun calque rapatrié",
      m8.CS.restitutionsDepuis(0).length === 1 && m8.CS.restitutionsDepuis(0)[0].uids.length === 2 &&
      m8.CS.listeRapatries().length === 0);

    // Réception : copies marquées de quatre provenances, un objet du calque non marqué, un autre calque.
    const marque = (uid, maj, R, L) => ({ uid, type: "a", points: [], updatedAt: maj, _srcCalque: L || "sig",
      _srcCalqueDepuis: R });
    const session = () => ({ roads: [
      marque("rd_avant0001", 150, 100),             // modifiée avant T → retirée
      marque("rd_apres0001", 300, 100),             // modifiée après T → gardée (uid dérivé)
      marque("rd_neuve0001", 400, 400),             // nouveau rapatriement après T → intacte
      { uid: "rd_sansR0001", type: "a", points: [], updatedAt: 300, _srcCalque: "sig" },   // provenance inconnue
      { uid: "rd_main00001", type: "a", points: [], updatedAt: 50 },                       // sans marque
      marque("rd_autre0001", 150, 100, "puits")      // autre calque
    ] });
    const m6 = monter(AVEC_UID, session());
    m6.ctx.PLAN_CONFIG.dataLayers.push({ id: "puits", file: "data/puits.json" });
    const a = m6.CS.appliquerRestitutions([{ calque: "sig", avant: 200 }]);
    const uids = m6.etat.roads.map((o) => o.uid);
    const garde = m6.etat.roads.find((o) => /_r/.test(o.uid) && o.updatedAt === 300 && o._srcCalque === undefined);
    t("🩸 reçue : copie modifiée avant T retirée", uids.indexOf("rd_avant0001") < 0 && a.retires === 1);
    t("🩸 reçue : copie modifiée après T GARDÉE, marque retirée, uid dérivé, date inchangée",
      a.gardes === 1 && !!garde && garde._srcCalqueDepuis === undefined && uids.indexOf("rd_apres0001") < 0);
    t("reçue : copie d'un rapatriement postérieur à T intacte", uids.indexOf("rd_neuve0001") >= 0);
    t("reçue : copie sans date de rapatriement, modifiée après T, intacte", uids.indexOf("rd_sansR0001") >= 0);
    t("🔒 reçue : objet sans marque intact", uids.indexOf("rd_main00001") >= 0);
    t("reçue : copie d'un AUTRE calque intacte", uids.indexOf("rd_autre0001") >= 0);
    const m7 = monter(AVEC_UID, session());
    m7.CS.appliquerRestitutions([{ calque: "sig", avant: 200 }]);
    t("uid dérivé identique sur un autre appareil (pas de doublon entre eux)",
      m7.etat.roads.some((o) => o.uid === garde.uid));
    m6.etat.roads.push(marque("rd_apres0001", 300, 100));
    const b = m6.CS.appliquerRestitutions([]);
    t("🩸 la même copie revenue (relecture complète) : reconvertie SANS doublon ni nouveau signalement",
      m6.etat.roads.filter((o) => o.uid === garde.uid).length === 1 && b.gardes === 0 &&
      !m6.etat.roads.some((o) => o.uid === "rd_apres0001"));
    const n = m6.etat.roads.length;
    const c = m6.CS.appliquerRestitutions([{ calque: "sig", avant: 150 }, { calque: 42, avant: 9 }, { calque: "x", avant: -1 }]);
    t("une restitution plus ancienne ou invalide ne change rien", !c.change && m6.etat.roads.length === n &&
      m6.CS.getSessionState().restitutions.sig === 200 && !("x" in m6.CS.getSessionState().restitutions));
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
    // clear(opts) : `opts.snapshotFait` évite un double snapshot (déjà pris par la modale de restauration).
    /function clear\((?:opts)?\)[\s\S]{0,2000}CalqueSession\.listeRapatries[\s\S]{0,300}restituer\(/.test(SP));
  t("🩸 cablage : effacer la session GARDE les restitutions (sinon « rendre à l'équipe » ne part jamais)",
    SP.indexOf("loadSessionState(st ? { restitutions: st.restitutions, aEnvoyer: st.aEnvoyer } : null)") > 0);
  {
    const i = SP.indexOf("data-action=\"clear\"]').addEventListener");
    const h = i < 0 ? "" : SP.slice(i, i + 4000);
    t("cablage : le choix « équipe / cet appareil » n'existe que si la restitution se partage",
      h.indexOf("CS.restitutionPartagee())\n        ? CS.listeRapatries() : [];") > 0 ||
      h.indexOf("CS.restitutionPartagee())\r\n        ? CS.listeRapatries() : [];") > 0);
    t("cablage : trois issues (cet appareil / rendre à l'équipe / annuler)",
      h.indexOf("autre:       { label: _t(\"session.btn.clearEquipe\"), valeur: \"equipe\" }") > 0 &&
      h.indexOf("okLabel:     _t(\"session.btn.clearIci\")") > 0 && h.indexOf("go(choix === \"equipe\")") > 0);
    t("🩸 cablage : la restitution partagée est notée AVANT le vidage (elle porte les uids des copies)",
      h.indexOf("CS.restituer(id)") > 0 && h.indexOf("CS.restituer(id)") < h.indexOf("_viderEtatCourant()"));
    t("🔒 cablage : les noms de calques sont échappés avant ktaConfirm (HTML)", h.indexOf("ktaEsc(CS.libelle(id))") > 0);
  }
  // 🩸 Un <button> n'émet JAMAIS `change` : branché sur le listener `change` des cases, il est mort
  // sans erreur. On vérifie le TYPE D'ÉVÉNEMENT, pas seulement l'attribut.
  ["rapatrier", "restituer", "exporter", "integrer"].forEach(function (act) {
    const i = FP.indexOf("[data-calque-" + act + "]");
    const avant = i < 0 ? "" : FP.slice(0, i);
    const dernier = avant.lastIndexOf("addEventListener(\"");
    const type = dernier < 0 ? "?" : avant.slice(dernier + 18).split("\"")[0];
    t("🩸 cablage : « " + act + " » est branche sur CLICK (lu : " + type + ")", type === "click");
  });

  t("cablage : « Intégrer des ajouts » seulement sur un calque en modification",
    /\(modifiable\s*\?\s*'<button[^;]*?data-calque-integrer=/.test(FP) && /modifiable\s*=\s*rapatrie &&/.test(FP));
  t("cablage : la fenêtre d'ajouts passe par CalqueSession.integrerAjouts, garde de lecture seule comprise",
    /function _ouvrirAjouts[\s\S]{0,800}ktaEditionRefusee\(\)/.test(FP) && /CS\.integrerAjouts\(id, uids\)/.test(FP));
  // 🔒 Lecture seule : « Intégrer » et « Exporter » ABSENTS de la ligne (même règle que les outils de dessin,
  // ktaEditionRefusee en silencieux), « Restituer » présent ; sans extension, rien ne change. Le VRAI rendu, extrait
  // du panneau et joué dans un vm.
  {
    const i = FP.indexOf("function _renderDataLayersSection()");
    const j = FP.indexOf("function refreshDataLayers()");
    const code = (i < 0 || j < i) ? "" : FP.slice(i, j);
    const rendre = function (refus) {
      const appels = [];
      const ctx = {
        PLAN_CONFIG: { dataLayers: [{ id: "sig", label: "Import SIG", file: "data/sig.json" }] },
        dataLayerGroups: { sig: {} },
        map: { hasLayer: () => true },
        I18n: { t: (k) => k },
        CalqueSession: { estRapatrie: () => true },
        _escAttr: String, _escHtml: String
      };
      if (refus !== undefined) ctx.ktaEditionRefusee = function (s) { appels.push(s); return refus; };
      ctx.window = ctx;
      vm.createContext(ctx);
      let html = "";
      try { html = vm.runInContext(code + "\n_renderDataLayersSection();", ctx); } catch (e) { html = ""; }
      return { html: String(html), appels: appels };
    };
    const sans = rendre(undefined), ecrit = rendre(false), ro = rendre(true);
    const a = (h, act) => h.indexOf("data-calque-" + act + "=") >= 0;
    t("🔒 boutons : rendu extrait du panneau", code.length > 0 && a(sans.html, "restituer"));
    t("🔒 boutons : sans extension, intégrer + exporter + restituer présents",
      a(sans.html, "integrer") && a(sans.html, "exporter") && a(sans.html, "restituer"));
    t("🔒 boutons : plan modifiable, intégrer + exporter + restituer présents",
      a(ecrit.html, "integrer") && a(ecrit.html, "exporter") && a(ecrit.html, "restituer"));
    t("🔒 boutons : lecture seule, intégrer et exporter ABSENTS, restituer présent",
      !a(ro.html, "integrer") && !a(ro.html, "exporter") && a(ro.html, "restituer"));
    t("🔒 boutons : la règle est lue en silencieux (pas de message au rendu)",
      ro.appels.length > 0 && ro.appels.every((s) => s === true));
    t("🔒 boutons : le panneau suit un droit qui change (événements de l'extension)",
      /"mktm:plans-extension-changes"[\s\S]{0,200}refreshDataLayers\(\)/.test(FP));
  }
  t("ajouts : rien n'est coché par défaut",
    /<input type="checkbox" data-ajout-uid="' \+ _escAttr\(o\.uid\) \+ '">/.test(FP));
  t("ajouts : filtre « Créé par » seulement avec la prise auteurObjet",
    /parAuteur && liste\.total/.test(FP) && /aPrise\("auteurObjet"\)/.test(FP));
  t("🩸 retour : la fenêtre de restitution DIT combien d'ajouts intégrés partent",
    /CS\.compterAjouts\(id\)/.test(FP) && /filter\.calque\.ajoutsRetires/.test(FP) &&
    (FP.match(/\+ ajouts, \{/g) || []).length === 2);
  t("cablage : le panneau de filtres porte les trois actions",
    /data-calque-rapatrier/.test(FP) && /data-calque-restituer/.test(FP) && /data-calque-exporter/.test(FP));
  t("cablage : l export dit OU deposer le fichier (sinon il est inutilisable)",
    /filter.calque.exporte"/.test(FP) && /filter.calque.exporteAvecReste/.test(FP));
  // 🩸 Le retour peut détruire des heures de correction : il PROPOSE d'exporter d'abord (trois
  // issues, le chemin sûr en bouton principal), pas un choix binaire perdre / renoncer.
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
