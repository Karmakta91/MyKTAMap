#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🆔 check-uid.js — garde-fou pré-commit BLOQUANT (v2.1.0 lot A, v2.2.0 lot B, v2.3.0 lot C1, v2.4.0 lot C2, v2.5.0 lot C3)
// =====================================================================
// Chaque objet de carte porte une identité stable : `uid` + `updatedAt` (ms).
// Décisions : docs/ETUDE_UID.md. Ce que ce script empêche :
//   1. Un uid en DOUBLE. Une copie JSON (tableur « Dupliquer ») recopierait
//      l'uid ; une migration de masse (des milliers d'objets dans la même ms)
//      peut tirer deux fois le même. Plus tard, la fusion « le plus récent
//      gagne » perdrait l'un des deux objets, en silence.
//   2. Un uid ÉCRASÉ. ensure ne doit jamais remplacer une identité existante.
//   3. Une modification OUBLIÉE : un site qui modifie sans `touch` laisse un
//      updatedAt périmé, et la synchro garderait la mauvaise version.
//   4. Une migration qui change le numéro de version de session : les
//      anciennes versions de l'app IGNORENT une session de version inconnue
//      (sessionPersist.getSaved) — un retour en arrière la ferait disparaître.
//   5. Une identité perdue à la lecture des calques, ou fuyant vers un format
//      étranger (KMZ / GPX).
//
// COMMENT : le vrai js/ktaUid.js tourne dans un `vm` (partie 1) ; le câblage
// des sites est vérifié sur le texte des fichiers réels (partie 2), là où
// exécuter le module complet (Leaflet, DOM) n'apporterait rien de plus.
// =====================================================================
"use strict";

const fs = require("fs");
const vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };
const lire = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

// ═════════ 1. LE MODULE, EXÉCUTÉ ═════════
const win = { console: { log() {}, warn() {}, error() {} } };
win.window = win;
const ctx = vm.createContext(win);
let K = null;
try {
  vm.runInContext(lire("js/ktaUid.js"), ctx, { filename: "ktaUid.js" });
  K = win.KtaUid;
} catch (e) {
  t("js/ktaUid.js s'exécute — " + e.message, false);
}
t("window.KtaUid est exposé", !!K);
const API = ["genUid", "touch", "ensure", "ensureAll", "cloneNeuf", "sansIdentite", "marquerCalqueTexte"];
t("API complète : " + API.join(", "), !!K && API.every((f) => typeof K[f] === "function"));

if (K) {
  // Format
  const RE = /^(pt|rd|zn|st)_[0-9a-z]+_[0-9a-z]{6}$/;
  t("genUid : format préfixe_date36_alea6", ["pt", "rd", "zn", "st"].every((p) => RE.test(K.genUid(p)) && K.genUid(p).indexOf(p + "_") === 0));
  t("genUid : famille inconnue → « pt » (jamais un préfixe arbitraire)", K.genUid("xx").indexOf("pt_") === 0);
  const lot = new Set();
  for (let i = 0; i < 5000; i++) lot.add(K.genUid("pt"));
  t("genUid : 5 000 tirages distincts", lot.size === 5000);

  // ensure : pose, n'écrase jamais
  const o1 = K.ensure({ nom: "a" }, "pt", 1000);
  t("ensure : pose un uid et le repli d'horodatage", RE.test(o1.uid) && o1.updatedAt === 1000);
  const o2 = K.ensure({ uid: "pt_garde_aaaaaa", updatedAt: 42 }, "pt", 1000);
  t("🩸 ensure : n'écrase JAMAIS un uid ni un updatedAt existants", o2.uid === "pt_garde_aaaaaa" && o2.updatedAt === 42);
  const o3 = K.ensure({}, "rd");
  t("ensure : sans repli → maintenant", Math.abs(o3.updatedAt - Date.now()) < 5000);

  // touch
  const p = { nom: "x", date_update: "2000-01-01", updatedAt: 1 };
  K.touch(p);
  t("touch (point) : updatedAt = maintenant", Math.abs(p.updatedAt - Date.now()) < 5000);
  t("touch (point) : date_update au format AAAA-MM-JJ du jour", /^\d{4}-\d{2}-\d{2}$/.test(p.date_update) && p.date_update !== "2000-01-01");
  const r = { type: "principal", points: [{ x: 1, y: 1 }], updatedAt: 1 };
  K.touch(r);
  t("touch (tracé) : updatedAt mis à jour, pas de date_update ajoutée", r.updatedAt > 1 && !("date_update" in r));
  const sansUid = {};
  K.touch(sansUid);
  t("touch ne crée jamais d'uid (rôle d'ensure)", !("uid" in sansUid));

  // ensureAll : doublons régénérés, existants gardés, repli appliqué
  const arr = [
    { uid: "pt_double_aaaaaa", updatedAt: 5 },
    { uid: "pt_double_aaaaaa", updatedAt: 6 },
    { nom: "ancien" },
    { uid: "pt_unique_bbbbbb" }
  ];
  const n = K.ensureAll(arr, "pt", 777);
  t("🩸 ensureAll : le SECOND d'un uid en double est régénéré", arr[0].uid === "pt_double_aaaaaa" && arr[1].uid !== "pt_double_aaaaaa" && RE.test(arr[1].uid));
  t("ensureAll : l'uid d'origine reste au premier", arr[0].updatedAt === 5);
  t("ensureAll : un objet ancien reçoit uid + repli (date de sauvegarde)", RE.test(arr[2].uid) && arr[2].updatedAt === 777);
  t("ensureAll : un uid sans updatedAt reçoit le repli", arr[3].uid === "pt_unique_bbbbbb" && arr[3].updatedAt === 777);
  t("ensureAll : rend le nombre d'objets corrigés (2)", n === 2);
  const vus = new Set();
  const a1 = [{ uid: "rd_x_cccccc" }], a2 = [{ uid: "rd_x_cccccc" }];
  K.ensureAll(a1, "rd", 1, vus); K.ensureAll(a2, "zn", 1, vus);
  t("ensureAll : Set partagé entre familles — doublon inter-familles régénéré", a1[0].uid !== a2[0].uid);
  // Migration de masse : 20 000 objets anciens d'un coup
  const masse = [];
  for (let i = 0; i < 20000; i++) masse.push({ points: [] });
  K.ensureAll(masse, "rd", 1);
  t("migration de masse : 20 000 objets, aucun uid en double", new Set(masse.map((o) => o.uid)).size === 20000);
  // Collision forcée : on rejoue un uid déjà vu en entrée
  const force = [];
  for (let i = 0; i < 50; i++) force.push({ uid: "st_meme_dddddd" });
  K.ensureAll(force, "st", 1);
  t("collision forcée : 50 objets au même uid → 50 uid distincts", new Set(force.map((o) => o.uid)).size === 50);

  // cloneNeuf (tableur « Dupliquer »)
  const orig = { uid: "pt_orig_eeeeee", updatedAt: 3, nom: "Salle", tags: ["salle"] };
  const copie = K.cloneNeuf(orig, "pt");
  t("🩸 cloneNeuf : la copie a un uid NEUF", copie.uid !== orig.uid && RE.test(copie.uid));
  t("cloneNeuf : l'original n'est pas touché", orig.uid === "pt_orig_eeeeee" && orig.updatedAt === 3);
  t("cloneNeuf : copie profonde (les tags ne sont pas partagés)", copie.tags !== orig.tags && copie.tags[0] === "salle");

  // sansIdentite
  const si = K.sansIdentite({ uid: "pt_a_aaaaaa", updatedAt: 1, nom: "n" });
  t("sansIdentite : retire uid et updatedAt, garde le reste", !("uid" in si) && !("updatedAt" in si) && si.nom === "n");

  // marquerCalqueTexte (Générateur)
  const calque = JSON.stringify({ type: "x", data: [{ nom: "a", x: 1, y: 2 }, { nom: "b", uid: "pt_garde_ffffff", x: 3, y: 4 }],
    roads: [{ type: "principal", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }] });
  const marque = JSON.parse(K.marquerCalqueTexte(calque));
  t("Générateur : les objets d'un calque reçoivent un uid", RE.test(marque.data[0].uid) && RE.test(marque.roads[0].uid));
  t("Générateur : un uid existant dans le calque est gardé", marque.data[1].uid === "pt_garde_ffffff");
  t("Générateur : la géométrie d'un tracé n'est pas prise pour une famille", Array.isArray(marque.roads[0].points) && !("uid" in marque.roads[0].points[0]));
  const sig = JSON.parse(K.marquerCalqueTexte(JSON.stringify({ points: [{ nom: "p", x: 1, y: 1 }], roads: [] })));
  t("Générateur : calque SIG (famille « points ») marqué", RE.test(sig.points[0].uid));
  t("Générateur : un fichier non JSON repart intact", K.marquerCalqueTexte("pas du json") === "pas du json");
  const dejaMarque = JSON.stringify({ data: [{ uid: "pt_a_aaaaaa", updatedAt: 1 }] });
  t("Générateur : un calque déjà complet repart à l'identique (texte inchangé)", K.marquerCalqueTexte(dejaMarque) === dejaMarque);
}

// ═════════ 2. CÂBLAGE DES SITES (fichiers réels) ═════════
const EDITOR = lire("js/editor.js"), ROAD = lire("js/road.js"), ZONES = lire("js/zones.js"),
  STRUCT = lire("js/structures.js"), SP = lire("js/sessionPersist.js"), TBL = lire("js/tableEditor.js"),
  CONV = lire("js/convertirObjet.js"), UTILS = lire("js/utils.js"), GEN = lire("js/createConf.js"),
  IDX = lire("index.html"), SW = lire("sw.js");

// Setters : le filet
t("setEditorPoints pose les uid (pt)", /window\.setEditorPoints\s*=\s*function\(points\) \{\s*listePoints = points \|\| \[\];[\s\S]{0,300}KtaUid\.ensureAll\(listePoints, "pt"\)/.test(EDITOR));
t("setRoads pose les uid (rd)", /window\.setRoads = function\(roads\) \{\s*roadsData = roads \|\| \[\];[\s\S]{0,200}KtaUid\.ensureAll\(roadsData, "rd"\)/.test(ROAD));
t("setZones pose les uid (zn)", /window\.setZones = function\(zones\) \{\s*zonesData = zones \|\| \[\];[\s\S]{0,200}KtaUid\.ensureAll\(zonesData, "zn"\)/.test(ZONES));
t("setStructures pose les uid (st)", /window\.setStructures = function\(structures\) \{\s*structuresData = structures \|\| \[\];[\s\S]{0,200}KtaUid\.ensureAll\(structuresData, "st"\)/.test(STRUCT));

// Migration à l'ouverture
const iMig = SP.indexOf("KtaUid.ensureAll(payload.editorPoints");
const iSet = SP.indexOf("window.setEditorPoints(payload.editorPoints)");
t("migration : posée dans _applyRestore AVANT setEditorPoints", iMig > 0 && iSet > iMig);
t("migration : repli updatedAt = date de dernière sauvegarde (savedAt)", /const repli = Date\.parse\(payload\.savedAt\) \|\| Date\.now\(\);/.test(SP));
t("migration : les 4 familles partagent un Set (doublons inter-familles)", /ensureAll\(payload\.roads, "rd", repli, vus\)/.test(SP) && /ensureAll\(payload\.structures, "st", repli, vus\)/.test(SP));
t("🩸 VERSION de session reste à 1 (une ancienne app ignorerait une version inconnue)", /const VERSION\s*=\s*1;/.test(SP));
const iDecoupe = SP.indexOf("const phaseDifferee");
t("migration AVANT le découpage en deux phases des tracés (itinéraire différé compris)", iDecoupe > iMig);

// Créations et modifications
t("éditeur : un point créé reçoit son uid (ensure + touch)", /KtaUid\.touch\(window\.KtaUid\.ensure\(point, "pt"\)\)/.test(EDITOR));
t("éditeur : une modification de point appelle touch", /if \(window\.KtaUid\) window\.KtaUid\.touch\(existingPoint\);/.test(EDITOR));
t("éditeur : un repositionnement appelle touch", /pt\.y = Math\.round\(ny \* 100\) \/ 100;\s*if \(window\.KtaUid\) window\.KtaUid\.touch\(pt\);/.test(EDITOR));
t("tracé : ensure à la création, touch à chaque sommet",
  /KtaUid\.ensure\(currentRoad, "rd"\)/.test(ROAD) && /currentRoad\.points\.push\(\{ x, y \}\);\s*if \(window\.KtaUid\) window\.KtaUid\.touch\(currentRoad\);/.test(ROAD));
t("zone : ensure à la création, touch à chaque sommet",
  /KtaUid\.ensure\(currentZone, "zn"\)/.test(ZONES) && /currentZone\.points\.push\(\{ x: x, y: y \}\);\s*if \(window\.KtaUid\) window\.KtaUid\.touch\(currentZone\);/.test(ZONES));
t("structure : ensure à la création, touch aux deux chemins de sommet",
  /KtaUid\.ensure\(currentStructure, "st"\)/.test(STRUCT) && (STRUCT.match(/currentStructure\.points\.push\(\{ x: x, y: y \}\);\s*if \(window\.KtaUid\) window\.KtaUid\.touch\(currentStructure\);/g) || []).length === 2);
t("retrait du dernier sommet : touch (tracé, zone, structure)",
  /last\.points\.pop\(\);\s*if \(window\.KtaUid\) window\.KtaUid\.touch\(last\);/.test(ROAD) &&
  /last\.points\.pop\(\);\s*if \(window\.KtaUid\) window\.KtaUid\.touch\(last\);/.test(ZONES) &&
  /last\.points\.pop\(\);\s*if \(window\.KtaUid\) window\.KtaUid\.touch\(last\);/.test(STRUCT));
t("note d'un objet (tracé, zone, structure) : touch",
  /_roadRef\.description = v; if \(window\.KtaUid\) window\.KtaUid\.touch\(_roadRef\);/.test(ROAD) &&
  /_zoneRef\.description = v; if \(window\.KtaUid\) window\.KtaUid\.touch\(_zoneRef\);/.test(ZONES) &&
  /_structRef\.description = v; if \(window\.KtaUid\) window\.KtaUid\.touch\(_structRef\);/.test(STRUCT));
t("conversion : l'uid suit et la conversion appelle touch (simple et par lot)",
  (CONV.match(/KtaUid\.touch\(neuf\)/g) || []).length === 2);

// Tableur
t("🩸 tableur « Dupliquer » : uid neuf (cloneNeuf), jamais une copie JSON brute", /window\.KtaUid \? window\.KtaUid\.cloneNeuf\(_data\[i\], _prefixeUid\(\)\)/.test(TBL));
t("tableur : uid et updatedAt ne deviennent jamais des colonnes modifiables", /set\.delete\("uid"\);\s*set\.delete\("updatedAt"\);/.test(TBL));
t("tableur : une ligne ajoutée reçoit son uid", /KtaUid\.touch\(window\.KtaUid\.ensure\(nouv, _prefixeUid\(\)\)\)/.test(TBL));
t("tableur : cellule et tags modifiés → touch (4 sites)", (TBL.match(/_toucher\(/g) || []).length >= 5);

// Calques : l'identité survit à la lecture
t("lecture des calques : uid du point gardé (marker → getAllEmbeddedPoints)",
  /if \(typeof p\.uid === "string" && p\.uid\) marker\._ktaUid = p\.uid;/.test(UTILS) && /if \(m\._ktaUid\) item\.uid = m\._ktaUid;/.test(UTILS));
t("lecture des calques : uid gardé pour zones et structures (registre + getters)",
  /uid:\s+\(typeof zone\.uid/.test(UTILS) && /uid:\s+\(typeof structure\.uid/.test(UTILS) && (UTILS.match(/if \(e\.uid\) out\.uid = e\.uid;/g) || []).length === 2);

// Générateurs
t("Générateur : chaque calque de données passe par _marquerUidCalque", /const _marque = _marquerUidCalque\(await _lireFichier\(dlFile\)\);\s*dataFolder\.file\(fileName, _marque\);/.test(GEN));
["js/kmzImport.js", "js/gpxImport.js", "js/sigImport.js"].forEach((f) => {
  t("Générateur d'import " + f + " : uid posés avant écriture", /KtaUid\.ensureAll\(/.test(lire(f)));
});

// Formats étrangers : jamais d'uid
["js/kmzExport.js", "js/gpxIO.js"].forEach((f) => {
  t("format étranger " + f + " : aucune mention d'uid (champs explicites)", !/\buid\b|updatedAt/.test(lire(f)));
});

// Chargement
const iCfg = IDX.indexOf('<script src="js/config.js"'), iUid = IDX.indexOf('<script src="js/ktaUid.js"'), iUt = IDX.indexOf('<script src="js/utils.js"');
t("index.html charge ktaUid après config.js et AVANT utils.js", iCfg > 0 && iUid > iCfg && iUt > iUid);
t("ktaUid est précaché (sw.js)", /"\.\/js\/ktaUid\.js"/.test(SW));

// ═════════ 3. LOT B — TRACES DE SUPPRESSION ET FUSION (v2.2.0) ═════════
{
  const store = { editorPoints: [], roads: [], zones: [], structures: [] };
  const w = {
    console: { log() {}, warn() {}, error() {} },
    document: { addEventListener() {}, activeElement: null },
    getEditorPoints: () => store.editorPoints, setEditorPoints: (a) => { store.editorPoints = a || []; },
    getRoads: () => store.roads, setRoads: (a) => { store.roads = a || []; }, resetRoads: () => { store.roads = []; },
    getZones: () => store.zones, setZones: (a) => { store.zones = a || []; }, resetZones: () => { store.zones = []; },
    getStructures: () => store.structures, setStructures: (a) => { store.structures = a || []; }, resetStructures: () => { store.structures = []; },
    getCurrentRoadIndex: () => -1, getCurrentZoneIndex: () => -1, getCurrentStructureIndex: () => -1,
    setCurrentRoadByIndex() {}, setCurrentZoneByIndex() {}, setCurrentStructureByIndex() {}
  };
  w.window = w;
  const c2 = vm.createContext(w);
  vm.runInContext("var document = window.document, console = window.console;", c2);
  let HM = null, KU = null;
  try {
    vm.runInContext(lire("js/ktaUid.js"), c2, { filename: "ktaUid.js" });
    vm.runInContext(lire("js/historyManager.js"), c2, { filename: "historyManager.js" });
    HM = w.HistoryManager; KU = w.KtaUid;
  } catch (e) { t("lot B : ktaUid + historyManager s'exécutent — " + e.message, false); }

  if (HM && KU) {
    const traces = () => KU.getTombstones().map((x) => x.uid);
    const raz = () => { store.editorPoints = []; store.roads = []; store.zones = []; store.structures = []; KU.setTombstones([]); HM.reset(); };

    // Suppression → trace
    raz();
    store.roads = [{ uid: "rd_a_aaaaaa", updatedAt: 10, type: "principal", points: [] }, { uid: "rd_b_bbbbbb", updatedAt: 10, type: "principal", points: [] }];
    let avant = HM.captureState("roads");
    store.roads = store.roads.filter((o) => o.uid !== "rd_a_aaaaaa");
    HM.record("suppr", avant, "roads");
    t("🩸 suppression enregistrée → trace de suppression", traces().indexOf("rd_a_aaaaaa") >= 0 && traces().length === 1);

    // Annulation → même uid, trace retirée, updatedAt = maintenant
    HM.undo();
    const revenu = store.roads.find((o) => o.uid === "rd_a_aaaaaa");
    t("annulation d'une suppression : l'objet revient avec le MÊME uid", !!revenu);
    t("annulation : sa trace de suppression est retirée", traces().indexOf("rd_a_aaaaaa") < 0);
    t("annulation : updatedAt = maintenant (sinon la synchro garderait la version annulée)", revenu && Math.abs(revenu.updatedAt - Date.now()) < 5000);

    // Rétablir → trace de nouveau
    HM.redo();
    t("rétablir la suppression : la trace revient", traces().indexOf("rd_a_aaaaaa") >= 0);

    // Annulation d'une modification → touch
    raz();
    store.zones = [{ uid: "zn_m_mmmmmm", updatedAt: 100, type: "eau", points: [] }];
    avant = HM.captureState("zones");
    store.zones[0].updatedAt = 200; store.zones[0].type = "remblais";
    HM.record("modif", avant, "zones");
    HM.undo();
    t("annulation d'une modification : updatedAt = maintenant, pas l'ancien 100", store.zones[0].type === "eau" && Math.abs(store.zones[0].updatedAt - Date.now()) < 5000);
    t("annulation d'une modification : aucune trace", traces().length === 0);

    // Conversion inter-familles (instantané complet) → pas de trace
    raz();
    store.roads = [{ uid: "rd_c_cccccc", updatedAt: 1, type: "principal", points: [] }];
    avant = HM.captureState();
    store.roads = []; store.zones = [{ uid: "rd_c_cccccc", updatedAt: 2, type: "eau", points: [] }];
    HM.record("conversion", avant);
    t("🩸 conversion d'un tracé en zone (même uid) : PAS de trace de suppression", traces().length === 0);

    // Itinéraire et objet rapatrié d'un calque → pas de trace
    raz();
    store.roads = [{ uid: "rd_i_iiiiii", updatedAt: 1, type: "itinerary", points: [] },
                   { uid: "rd_k_kkkkkk", updatedAt: 1, type: "principal", points: [], _srcCalque: "calque1" }];
    avant = HM.captureState("roads");
    store.roads = [];
    HM.record("effacer", avant, "roads");
    t("itinéraire calculé et objet rendu à son calque : aucune trace", traces().length === 0);

    // Purge à 90 jours
    KU.setTombstones([{ uid: "pt_v_vvvvvv", deletedAt: Date.now() - 91 * 864e5 }, { uid: "pt_r_rrrrrr", deletedAt: Date.now() - 10 * 864e5 }]);
    const np = KU.purge();
    t("purge : une trace de 91 jours part, une de 10 jours reste", np === 1 && traces().join() === "pt_r_rrrrrr");
    KU.setTombstones([{ uid: "", deletedAt: 1 }, { uid: "pt_ok_aaaaaa" }, null, { uid: "pt_ok_bbbbbb", deletedAt: 5 }]);
    t("setTombstones : entrées invalides ignorées", traces().join() === "pt_ok_bbbbbb");

    // Fusion par uid
    const F = KU.fusionnerCalques([
      { roads: [{ uid: "rd_f_ffffff", updatedAt: 100, type: "principal", label: "vieux" }],
        data: [{ uid: "pt_d_dddddd", updatedAt: 5, nom: "A" }, { uid: "pt_d_dddddd", updatedAt: 6, nom: "B" }, { nom: "sans uid" }],
        zones: [{ uid: "zn_x_xxxxxx", updatedAt: 50, type: "eau" }] },
      { roads: [{ uid: "rd_f_ffffff", updatedAt: 200, type: "principal", label: "récent" }],
        zones: [{ uid: "zn_y_yyyyyy", updatedAt: 80, type: "eau" }],
        tombstones: [{ uid: "zn_x_xxxxxx", deletedAt: 60 }, { uid: "zn_y_yyyyyy", deletedAt: 70 }] }
    ]);
    t("fusion : un même objet dans deux fichiers n'est pas doublé", F.roads.length === 1);
    t("fusion : la version la plus récente gagne", F.roads[0].label === "récent");
    t("🩸 fusion : deux objets d'un MÊME fichier au même uid restent DEUX objets (uid neuf au second)",
      F.data.filter((p) => p.uid).length === 2 && F.data[0].uid !== F.data[1].uid);
    t("fusion : un objet sans uid est gardé tel quel", F.data.some((p) => p.nom === "sans uid"));
    t("fusion : une suppression postérieure à la dernière modification l'emporte", !F.zones.some((z) => z.uid === "zn_x_xxxxxx"));
    t("fusion : une suppression ANTÉRIEURE à une modification ne l'efface pas", F.zones.some((z) => z.uid === "zn_y_yyyyyy"));
    const G = KU.fusionnerCalques([
      { roads: [{ uid: "rd_g_gggggg", updatedAt: 1, type: "principal" }] },
      { zones: [{ uid: "rd_g_gggggg", updatedAt: 9, type: "eau" }] }
    ]);
    t("fusion : un objet converti entre-temps suit sa version gagnante (une seule famille)", G.roads.length === 0 && G.zones.length === 1);
  }

  // Câblage persistance / exports / imports
  const SPB = lire("js/sessionPersist.js"), SEB = lire("js/sessionExporter.js"), IIE = lire("js/interfaceImportExport.js"),
    CCB = lire("js/createConf.js");
  t("persistance : les traces font partie de l'état sauvegardé", /tombstones: window\.KtaUid \? window\.KtaUid\.getTombstones\(\) : \[\]/.test(SPB) && /tombstones:\s+state\.tombstones \|\| \[\]/.test(SPB));
  t("🩸 persistance : des traces seules comptent comme contenu (sinon le slot partirait avec elles)", /\(state\.tombstones \|\| \[\]\)\.length === 0/.test(SPB));
  t("restauration : les traces du plan sont rechargées puis purgées", /window\.KtaUid\.setTombstones\(payload\.tombstones\);\s*const purgees = window\.KtaUid\.purge\(\);/.test(SPB));
  const iRaz = SPB.indexOf("if (window.KtaUid) window.KtaUid.setTombstones([]);\n\n    const saved = getSaved();");
  t("🩸 changement de plan : les traces du plan PRÉCÉDENT sont vidées avant restauration", iRaz > 0);
  t("« Effacer la session » vide les traces (décision Q1)", /function _viderEtatCourant\(\) \{[\s\S]{0,400}KtaUid\.setTombstones\(\[\]\)/.test(SPB));
  t("export complet : emporte les traces (décision Q2)", /tombstones: window\.KtaUid \? window\.KtaUid\.getTombstones\(\) : \[\]\n\s+\};/.test(SEB));
  t("export anonymisé : retire les traces", /delete session\.tombstones;/.test(SEB));
  t("fusion de sessions : par uid (KtaUid.fusionnerCalques)", /const f = window\.KtaUid\.fusionnerCalques\(jsons\);/.test(SEB));
  t("fusion du Générateur : même règle", /window\.KtaUid\.fusionnerCalques\(parsedArr\)/.test(CCB));
  t("import par remplacement : identités préparées et traces du fichier AVANT les setters (2 chemins)",
    (IIE.match(/_preparerIdentitesImport\((data|dataParsee)\);[^\n]*\n\s+if \(window\.setEditorPoints\)/g) || []).length === 2);
}

// ═════════ 4. LOT C1 — PHOTOS RATTACHÉES À L'UID (v2.3.0) ═════════
{
  const PH = lire("js/photos.js"), ED = lire("js/editor.js"), UT = lire("js/utils.js"),
    SE = lire("js/sessionExporter.js"), MA = lire("js/main.js"), RI = lire("js/refonteInterface.js");
  const fn = (src, nom) => {
    const d = src.indexOf("function " + nom + "(");
    if (d < 0) return "";
    const o = src.indexOf("{", d); let p = 0;
    for (let i = o; i < src.length; i++) { if (src[i] === "{") p++; else if (src[i] === "}") { p--; if (p === 0) return src.slice(d, i + 1); } }
    return "";
  };
  const migr = fn(PH, "migrerPhotosPlan"), setP = fn(PH, "setPhotoPointId"), ref = fn(PH, "getPhotosForPointRef");
  // 📸 10/10/2026 — setPhotoPointId, migrerPhotosPlan et rattacher partagent l'écriture _poserPointId
  // (une transaction pour plusieurs photos, fiche facultative) : c'est elle qu'on lit.
  const pose = fn(PH, "_poserPointId");
  t("photos : getPhotosForPointRef, setPhotoPointId, migrerPhotosPlan exposées",
    /getPhotosForPointRef:\s+getPhotosForPointRef/.test(PH) && /setPhotoPointId:\s+setPhotoPointId/.test(PH) && /migrerPhotosPlan:\s+migrerPhotosPlan/.test(PH));
  t("🩸 migration : ne SUPPRIME jamais une photo (aucun delete dans migrerPhotosPlan ni setPhotoPointId)",
    !!migr && !!setP && !!pose && !/delete/i.test(migr) && !/\.delete\(|deletePhoto/.test(setP) && !/\.delete\(|deletePhoto/.test(pose));
  t("🩸 migration : rattache seulement si UN SEUL point porte ce nom ET qu'il a un uid",
    /c\.length === 1 && typeof c\[0\]\.uid === "string" && c\[0\]\.uid/.test(migr));
  t("migration : une photo déjà rangée sous un uid connu n'est pas touchée", /if \(!cle \|\| uids\.has\(cle\)\) return;/.test(migr));
  t("double lecture : uid PUIS nom, sans doublon, marque _parNom", /rec\._parNom = !!uid;/.test(ref) && /if \(vus\.has\(rec\.id\)\) return;/.test(ref));
  t("setPhotoPointId : lecture et écriture dans les rappels de la même requête (transaction active)",
    /_poserPointId\(\[photoId\], pointId/.test(setP) && /g\.onsuccess = function\(\) \{[\s\S]*const put = store\.put\(rec\);/.test(pose));

  // Éditeur
  t("éditeur : en ajout, les photos sont rangées sous l'uid du FUTUR point", /_uidAjout = window\.KtaUid\.genUid\("pt"\);\s*_photoPointId = _uidAjout;/.test(ED));
  t("éditeur : ce même uid est posé sur le point créé", /if \(_uidAjout\) point\.uid = _uidAjout;/.test(ED));
  t("🩸 éditeur : l'annulation ne supprime QUE la clé d'un point en cours d'ajout (jamais un point existant)",
    /if \(!isEdit && window\.MyKTAMapPhotos &&\s*\(_photoPointId === _uidAjout \|\| _photoPointId\.indexOf\("_temp_"\) === 0\)\)/.test(ED));
  t("éditeur : en édition, double lecture (uid + nom)", /getPhotosForPointRef\(planId, \{ uid: existingPoint\.uid, id: existingPoint\.id \}\)/.test(ED));
  t("🩸 éditeur : rattachement nom → uid seulement s'il n'y a AUCUN homonyme (session + calques)",
    /if \(ancienNom && homonymes === 0\) \{\s*photoOps\.push\(window\.MyKTAMapPhotos\.renamePointId\(planId, ancienNom, existingPoint\.uid\)\);/.test(ED));
  t("éditeur : le popup d'un point de session reçoit son uid", /window\.attachPopupPhotos\(marker, String\(point\.id \|\| ""\), point\.uid\)/.test(ED));

  // Popup
  t("popup : double lecture quand le point a un uid", /getPhotosForPointRef\(planId, \{ uid: pointUid, id: pid \}\)/.test(UT));
  t("🩸 popup : « à rattacher » = rangée par nom ET nom porté par plusieurs points", /_aRattacher: !!\(rec\._parNom && _nomAmbigu\)/.test(UT) && /_ktaCompterPointsNommes\(pid\) > 1/.test(UT));
  t("popup : un bouton par photo la rattache à CE point (setPhotoPointId, rien supprimé)", /window\.MyKTAMapPhotos\.setPhotoPointId\(p\.id, pointUid\)/.test(UT));
  t("popup : points des calques — uid transmis", /window\.attachPopupPhotos\(marker, String\(p\.id \|\| ""\), p\.uid\)/.test(UT));

  // Exports et stats
  t("exports : les photos d'un point se collectent sous son uid ET son nom (2 sites)",
    (SE.match(/p\.uid \? \[String\(p\.uid\), String\(p\.id \|\| ""\)\] : \[String\(p\.id \|\| ""\)\]/g) || []).length === 2);
  t("export : rattachement photo → point par uid puis nom", /const parUid = pt\.uid \? \(parPoint\[String\(pt\.uid\)\] \|\| \[\]\) : \[\];/.test(SE));
  t("export anonymisé : les photos rangées sous l'uid suivent le code anonymisé", /if \(p\.uid\) idMap\[String\(p\.uid\)\] = code;/.test(SE));
  t("stats photos : un uid affiche le nom du point", /if \(p\.uid\) nomByPid\[String\(p\.uid\)\] = lib;/.test(RI));

  // Déclenchement
  t("migration planifiée après restauration de session ET après chaque calque",
    /window\._ktaPlanifierMigrationPhotos = function\(\)/.test(MA) && /SessionPersist\.onPlanLoaded[\s\S]{0,300}_ktaPlanifierMigrationPhotos\(\)/.test(MA) && /_ktaPlanifierMigrationPhotos === "function"\) window\._ktaPlanifierMigrationPhotos\(\);/.test(UT));
  t("🩸 migration : abandonnée si le plan a changé pendant l'attente", /if \(\(window\._currentLoadedPlanId \|\| null\) !== planId\) return;/.test(MA));

  ["fr", "en", "es"].forEach((l) => {
    const D = JSON.parse(lire("lang/" + l + ".json"));
    t("lang/" + l + " : textes « à rattacher »", ["titre", "btn", "fait", "echec"].every((k) => !!D["utils.popup.aRattacher." + k]));
  });
}

// ═════════ 5. LOT C2 — FAVORIS, LIAISONS, SECOURS PAR UID (v2.4.0) ═════════
{
  // Favoris : le vrai module, exécuté
  const fstore = {};
  const wf = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: (k) => (k in fstore ? fstore[k] : null), setItem: (k, v) => { fstore[k] = String(v); }, removeItem: (k) => { delete fstore[k]; } },
    dispatchEvent() {}, addEventListener() {}, CustomEvent: function () {}
  };
  wf.window = wf;
  const cf = vm.createContext(wf);
  vm.runInContext("var localStorage = window.localStorage, console = window.console;", cf);
  let FV = null;
  try { vm.runInContext(lire("js/favoris.js"), cf, { filename: "favoris.js" }); FV = wf.Favoris; }
  catch (e) { t("favoris.js s'exécute — " + e.message, false); }
  if (FV) {
    FV.loadPlan("plan_test");
    FV.add({ pointId: "Puits", pointUid: "pt_a_aaaaaa", x: 10, y: 10 });
    t("favori : rattaché à l'uid de son point (pointUid)", FV.getAll()[0].pointUid === "pt_a_aaaaaa");
    t("🩸 favori : l'HOMONYME (même nom, autre uid) n'est pas marqué favori", FV.isFav("Puits", "pt_b_bbbbbb") === false);
    t("favori : le bon point l'est", FV.isFav("Puits", "pt_a_aaaaaa") === true);
    t("favori : ajouter l'homonyme crée un second favori (pas un faux doublon)", FV.add({ pointId: "Puits", pointUid: "pt_b_bbbbbb", x: 50, y: 50 }) === true && FV.getAll().length === 2);
    FV.remove("Puits", "pt_b_bbbbbb");
    t("favori : retirer l'homonyme laisse le bon favori", FV.getAll().length === 1 && FV.getAll()[0].pointUid === "pt_a_aaaaaa");
    // Ancien favori sans pointUid : lecture par nom + migration
    FV.add({ pointId: "Salle", x: 5, y: 5 });
    t("favori ancien (sans pointUid) : encore reconnu par son nom", FV.isFav("Salle", "pt_s_ssssss") === true);
    const n1 = FV.migrerVersUid([{ id: "Salle", uid: "pt_s_ssssss", x: 5, y: 5, layerId: "editor" }]);
    t("migration : nom porté par un seul point → pointUid posé", n1 === 1 && FV.getAll().find((f) => f.pointId === "Salle").pointUid === "pt_s_ssssss");
    FV.add({ pointId: "Double", x: 100, y: 100, layerId: "editor" });
    const n2 = FV.migrerVersUid([{ id: "Double", uid: "pt_d1_aaaaaa", x: 100, y: 100, layerId: "editor" }, { id: "Double", uid: "pt_d2_bbbbbb", x: 300, y: 300, layerId: "editor" }]);
    t("migration : homonymes → départagés par la position", n2 === 1 && FV.getAll().find((f) => f.pointId === "Double").pointUid === "pt_d1_aaaaaa");
    FV.add({ pointId: "Triple", x: 1, y: 1 });
    const n3 = FV.migrerVersUid([{ id: "Triple", uid: "pt_t1_aaaaaa", x: 9, y: 9 }, { id: "Triple", uid: "pt_t2_bbbbbb", x: 20, y: 20 }]);
    t("🩸 migration : homonymes à d'autres positions → rien n'est deviné", n3 === 0 && !FV.getAll().find((f) => f.pointId === "Triple").pointUid);
  }

  // Liaisons : _coteDuPoint extraite du vrai fichier et exécutée
  const IPL = lire("js/interPlanLinks.js");
  const ex = (nom) => { const d = IPL.indexOf("function " + nom + "("); const o = IPL.indexOf("{", d); let p = 0;
    for (let i = o; i < IPL.length; i++) { if (IPL[i] === "{") p++; else if (IPL[i] === "}") { p--; if (p === 0) return IPL.slice(d, i + 1); } } return ""; };
  const cl = vm.createContext({});
  vm.runInContext([ex("_pointKey"), ex("_sideKey"), ex("_coteDuPoint")].join("\n"), cl);
  const cote = cl._coteDuPoint;
  t("liaisons : _coteDuPoint extraite et exécutable", typeof cote === "function");
  if (typeof cote === "function") {
    const sideU = { planId: "P", pointId: "Puits", pointUid: "pt_a_aaaaaa", x: 10, y: 10 };
    t("🩸 liaison : un côté rattaché à l'uid ne désigne PAS l'homonyme (supprimer l'un n'efface plus les liaisons de l'autre)",
      cote(sideU, "P", { id: "Puits", uid: "pt_b_bbbbbb", x: 99, y: 99 }) === false);
    t("liaison : il désigne bien son point", cote(sideU, "P", { id: "Puits", uid: "pt_a_aaaaaa", x: 10, y: 10 }) === true);
    t("liaison : un côté ancien (sans pointUid) se reconnaît encore par le nom", cote({ planId: "P", pointId: "Salle", x: 1, y: 1 }, "P", { id: "Salle", uid: "pt_s_ssssss" }) === true);
    t("liaison : jamais un côté d'un autre plan", cote(sideU, "Q", { id: "Puits", uid: "pt_a_aaaaaa" }) === false);
    t("liaison : point de calque sans id → repli par coordonnées (ancienne position au déplacement)",
      cote({ planId: "P", pointId: "", x: 5, y: 5 }, "P", { id: "", x: 50, y: 50 }, 5, 5) === true);
  }
  t("liaisons : lecture, popup, suppression et déplacement passent par _coteDuPoint",
    (IPL.match(/_coteDuPoint\(/g) || []).length >= 7);
  t("liaisons : un nouveau lien porte l'uid de ses deux côtés",
    /pointUid: pointUid \? String\(pointUid\) : undefined,/.test(IPL) && /pointUid: p\.uid \? String\(p\.uid\) : undefined,/.test(IPL));
  t("liaisons : migration exposée (côtés du plan courant seulement)", /migrerVersUid:\s+migrerVersUid/.test(IPL) && /side\.planId !== planId \|\| side\.pointUid/.test(IPL));

  // Secours
  const SEC = lire("js/secoursMode.js");
  t("Secours : _samePoint compare l'uid d'abord", /if \(a\.pointUid && b\.pointUid\) return a\.pointUid === b\.pointUid;/.test(SEC));
  t("Secours : la couverture compte les POI par uid d'abord", /w\.pointUid \|\| w\.pointId \|\|/.test(SEC));
  t("Secours : l'uid voyage dans les 7 sites qui fabriquent une étape", (SEC.match(/pointUid/g) || []).length >= 14);

  // Popup favori + migration planifiée
  const UTC = lire("js/utils.js"), MAC = lire("js/main.js");
  t("popup : l'étoile favori interroge l'uid du point", /window\.Favoris\.isFav\(point\.id, point\.uid\)/.test(UTC) && /data-fav-pointuid=/.test(UTC));
  t("migration planifiée : favoris et liaisons dans la même passe que les photos",
    /Favoris\.migrerVersUid\(pts\)/.test(MAC) && /InterPlanLinks\.migrerVersUid\(planId, pts\)/.test(MAC));
}

// ═════════ 6. LOT C3 — PHOTOS DES ZIP DE PLAN (v2.5.0) ═════════
{
  const GENC = lire("js/createConf.js"), MAIC = lire("js/main.js");
  const ex = (src, nom) => { const d = src.indexOf("function " + nom + "("); if (d < 0) return ""; const o = src.indexOf("{", d); let p = 0;
    for (let i = o; i < src.length; i++) { if (src[i] === "{") p++; else if (src[i] === "}") { p--; if (p === 0) return src.slice(d, i + 1); } } return ""; };
  const c3 = vm.createContext({ TextDecoder: TextDecoder });
  vm.runInContext(ex(GENC, "_clePhotoIndex") + "\n" + ex(GENC, "_collecterPointsCalque"), c3);
  const cle = c3._clePhotoIndex, coll = c3._collecterPointsCalque;
  t("Générateur : _clePhotoIndex et _collecterPointsCalque extraites et exécutables", typeof cle === "function" && typeof coll === "function");
  if (typeof cle === "function" && typeof coll === "function") {
    const acc = [];
    coll(JSON.stringify({ data: [{ id: "Salle", uid: "pt_s_ssssss" }, { id: "Puits", uid: "pt_p1_aaaaaa" }, { id: "Puits", uid: "pt_p2_bbbbbb" }],
                          roads: [{ type: "principal", points: [{ x: 1, y: 1 }], uid: "rd_x_xxxxxx" }] }), acc);
    t("Générateur : seuls les POINTS des calques sont collectés (pas la géométrie des tracés)", acc.length === 3);
    t("index photos : nom porté par UN point → son uid", cle("Salle", acc) === "pt_s_ssssss");
    t("🩸 index photos : nom ambigu → la clé reste le nom (jamais deviné)", cle("Puits", acc) === "Puits");
    t("index photos : clé déjà uid → inchangée", cle("pt_p2_bbbbbb", acc) === "pt_p2_bbbbbb");
    t("index photos : point inconnu → inchangé", cle("Ailleurs", acc) === "Ailleurs");
    const accSig = [];
    coll(new TextEncoder().encode(JSON.stringify({ points: [{ id: "Entrée", uid: "pt_e_eeeeee" }] })), accSig);
    t("Générateur : calque fourni en buffer (et famille SIG « points ») lu", accSig.length === 1 && cle("Entrée", accSig) === "pt_e_eeeeee");
  }
  t("Générateur : chaque calque marqué est collecté, et l'index passe par _clePhotoIndex",
    /_collecterPointsCalque\(_marque, _pointsGeneres\);/.test(GENC) && /pointId: _clePhotoIndex\(rec\.pointId, _pointsGeneres\)/.test(GENC));
  t("🩸 chargement d'un plan ZIP : PLUS d'effacement global des photos du plan",
    !/await window\.MyKTAMapPhotos\.deletePhotosForPlan\(planId\);/.test(MAIC));
  t("🩸 chargement : seules les photos d'origine « plan » absentes du nouvel index sont retirées",
    /rec\.meta && rec\.meta\.origine === "plan" && !_dansIndex\.has\(String\(rec\.id\)\)/.test(MAIC));
  t("chargement : une photo déjà présente n'est pas écrasée (son rattachement survit)",
    /if \(await window\.MyKTAMapPhotos\.getPhoto\(pid\)\) continue;/.test(MAIC));
  t("chargement : les photos restaurées depuis le ZIP portent l'origine « plan »", /meta:\s+\{ origine: "plan" \}/.test(MAIC));
}

console.log("");
if (ko) {
  console.log("⚠️ " + ko + " echec(s)");
  process.exit(1);
}
console.log("🎉 identifiants stables : uniques, jamais écrasés, posés partout ; suppressions tracées, fusion par uid");
