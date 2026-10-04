#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// 🆔 check-uid.js — garde-fou pré-commit BLOQUANT (v2.1.0, chantier 1 lot A)
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
t("Générateur : chaque calque de données passe par _marquerUidCalque", /dataFolder\.file\(fileName, _marquerUidCalque\(await _lireFichier\(dlFile\)\)\)/.test(GEN));
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

console.log("");
if (ko) {
  console.log("⚠️ " + ko + " echec(s)");
  process.exit(1);
}
console.log("🎉 identifiants stables : uniques, jamais écrasés, posés partout où un objet naît ou change");
