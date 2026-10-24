#!/usr/bin/env node
/* eslint-disable no-console */
// =====================================================================
// check-maj-plan.js — BLOQUANT (pré-commit) : assistant « Mettre à jour le plan » (js/majPlan.js)
// =====================================================================
// Le VRAI code tourne dans un `vm` : regroupement des objets (une étiquette / un type = un groupe, un objet dans
// un seul calque), construction des fichiers (remplacement des tableaux VIDES compris, autres champs gardés,
// objets versés datés de l'assistant), retrait de session (CalqueSession.retirerIntegres : trace sous la date
// du fichier, objet retouché depuis gardé, copies marquées jamais touchées). Le câblage est lu sur les fichiers.
// 🔒 Ne doit jamais arriver : une trace de suppression qui détruirait un objet du fichier à une fusion de calques ;
// un objet versé dans deux calques ; l'assistant ouvert en lecture seule ou sans le droit d'exporter tout le plan.
// Doc : docs/architecture/plans-loader.md (§ Mettre à jour le plan).
// =====================================================================
"use strict";

const fs = require("fs"), vm = require("vm");

let ko = 0;
const t = (n, c) => { console.log((c ? "✅" : "❌") + " " + n); if (!c) ko++; };
const lire = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

// ── 1. majPlan.js : fonctions pures ──────
const ctxMP = { console: { log() {}, warn() {} }, I18n: { t: (k) => k }, ktaEsc: (s) => String(s) };
ctxMP.window = ctxMP;
vm.createContext(ctxMP);
vm.runInContext(lire("js/majPlan.js"), ctxMP, { filename: "majPlan.js" });
const I = ctxMP.MajPlan && ctxMP.MajPlan._interne;
t("API : MajPlan.ouvrir et _interne.{grouper, slug, construire}", !!I && typeof ctxMP.MajPlan.ouvrir === "function" &&
  ["grouper", "slug", "construire"].every((k) => typeof I[k] === "function"));

{
  const cand = {
    editorPoints: [{ uid: "pt_1", tags: ["pa", "info"] }, { uid: "pt_2", tags: ["pa"] }, { uid: "pt_3", tags: [] }],
    roads: [{ uid: "rd_1", type: "principal" }, { uid: "rd_2", type: "cust-x" }, { uid: "rd_3", type: "principal" }],
    zones: [{ uid: "zn_1", type: "eau" }], structures: []
  };
  const g = I.grouper(cand);
  const cle = g.map((x) => x.cle);
  t("groupes : points par PREMIÈRE étiquette, « sans étiquette » à part, tracés par type (custom compris)",
    JSON.stringify(cle) === JSON.stringify(["editorPoints|", "editorPoints|pa", "roads|cust-x", "roads|principal", "zones|eau"]));
  const total = g.reduce((s, x) => s + x.objets.length, 0);
  t("🩸 un objet n'est que dans UN groupe (point à deux étiquettes compris)", total === 7);
}
{
  const pris = new Set(["editor", "galeries"]);
  t("slug : minuscules sans accent, caractères sûrs", I.slug("Galeries Été 2", new Set()) === "galeries_ete_2");
  t("slug : unique (suffixe)", I.slug("Galeries", pris) === "galeries_2");
  t("slug : jamais « editor », jamais vide", I.slug("editor", new Set()) === "calque" && I.slug("!!!", new Set()) === "calque");
}
{
  const T = 1760000000000;
  const r = I.construire({
    T: T,
    calques: [{ id: "sig", label: "SIG", base: { type: "sig", version: 1, customLegend: { a: 1 }, editorPoints: [{ uid: "old" }],
                roads: [{ uid: "ancien" }], zones: [{ uid: "zz" }] },
                copies: { data: [{ uid: "pt_c" }], roads: [{ uid: "rd_c" }], zones: [], structures: [] } }],
    groupes: [
      { famille: "roads", objets: [{ uid: "rd_m", type: "principal", updatedAt: 5 }], cible: { id: "sig", label: "SIG" } },
      { famille: "editorPoints", objets: [{ uid: "pt_m", tags: ["pa"] }], cible: { id: "neuf", label: "Neuf", nouveau: true } },
      { famille: "zones", objets: [{ uid: "zn_m" }], cible: { id: "autre", label: "Autre", base: { zones: [{ uid: "z0" }] } } }
    ]
  });
  const sig = r.calques.find((c) => c.id === "sig"), neuf = r.calques.find((c) => c.id === "neuf");
  const autre = r.calques.find((c) => c.id === "autre");
  t("remplacement : les tableaux de la copie remplacent ceux du fichier, VIDES compris (zones supprimées)",
    sig && sig.payload.zones.length === 0 && sig.payload.data.length === 1 && sig.payload.data[0].uid === "pt_c");
  t("remplacement : les autres champs du fichier d'origine restent (type, légende…), `editorPoints` retiré",
    sig.payload.type === "sig" && sig.payload.customLegend && sig.payload.customLegend.a === 1 && !("editorPoints" in sig.payload));
  t("objets versés ajoutés APRÈS la copie, datés de l'assistant (updatedAt = T)",
    sig.payload.roads.length === 2 && sig.payload.roads[1].uid === "rd_m" && sig.payload.roads[1].updatedAt === T);
  t("nouveau calque : marqué nouveau, objets dedans", neuf && neuf.nouveau === true && neuf.payload.data.length === 1);
  t("calque existant non remplacé : ses objets d'origine restent, les versés s'ajoutent",
    autre && autre.payload.zones.length === 2 && autre.payload.zones[0].uid === "z0");
  t("uids versés listés (pour le retrait de session), copies exclues",
    JSON.stringify(r.uids.slice().sort()) === JSON.stringify(["pt_m", "rd_m", "zn_m"]));
}

// ── 2. CalqueSession.retirerIntegres ──────
{
  const etat = {
    editorPoints: [{ uid: "pt_m", updatedAt: 100 }, { uid: "pt_tard", updatedAt: 2000 }, { uid: "pt_autre", updatedAt: 1 }],
    roads: [{ uid: "rd_c", _srcCalque: "sig", updatedAt: 10 }], zones: [], structures: []
  };
  const traces = [];
  const ctx = {
    console: { log() {}, warn() {} }, Promise, JSON, Array, Object, String, Number, Set, Map, Date,
    getEditorPoints: () => etat.editorPoints, setEditorPoints: (a) => { etat.editorPoints = a; },
    getRoads: () => etat.roads, setRoads: (a) => { etat.roads = a; },
    getZones: () => etat.zones, setZones: (a) => { etat.zones = a; },
    getStructures: () => etat.structures, setStructures: (a) => { etat.structures = a; },
    KtaUid: { tombstone: (u, d) => traces.push({ u, d }) },
    I18n: { t: (k) => k }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(lire("js/calqueSession.js"), ctx, { filename: "calqueSession.js" });
  const CS = ctx.CalqueSession;
  const r = CS.retirerIntegres(["pt_m", "pt_tard", "rd_c"], 1000);
  t("retrait : l'objet versé quitte la session", r.ok && !etat.editorPoints.some((o) => o.uid === "pt_m"));
  t("🔒 trace posée à T - 1 : plus ancienne que l'objet du fichier (daté T), il gagne toute fusion",
    traces.length === 1 && traces[0].u === "pt_m" && traces[0].d === 999);
  t("objet retouché APRÈS la génération : gardé (sa retouche n'est pas dans le fichier), compté",
    r.gardes === 1 && etat.editorPoints.some((o) => o.uid === "pt_tard"));
  t("🩸 copie marquée d'un calque : jamais retirée ici (la restitution s'en charge)", etat.roads.length === 1);
  t("objet non choisi : intact", etat.editorPoints.some((o) => o.uid === "pt_autre"));
  t("date absente ou invalide : refus", CS.retirerIntegres(["pt_autre"], NaN).ok === false);
  ctx.ktaEditionRefusee = () => true;
  t("🔒 lecture seule : refus", CS.retirerIntegres(["pt_autre"], 5000).code === "lectureSeule");
  t("contenuCalque : exposé, refuse un calque qui n'est pas en modification", CS.contenuCalque("x").code === "pasRapatrie");
}

// ── 3. Câblage ──────
{
  const MP = lire("js/majPlan.js"), GEN = lire("js/createConf.js"), IDX = lire("index.html"), SW = lire("sw.js");
  const IF = lire("js/interface.js"), FP = lire("js/filterPanel.js"), SE = lire("js/sessionExporter.js");
  const MAIN = lire("js/main.js");
  t("chargé par index.html APRÈS createConf.js, précaché par sw.js",
    IDX.indexOf('src="js/majPlan.js"') > IDX.indexOf('src="js/createConf.js"') && SW.indexOf('"./js/majPlan.js"') >= 0);
  t("🔒 entrée refusée en lecture seule et sans export complet du plan (jamais limitePermise)",
    /function ouvrir\(\)[\s\S]{0,400}ktaEditionRefusee\(\)[\s\S]{0,200}ktaExportPlanRefuse\(\)/.test(MP) &&
    MP.indexOf("limitePermise") < 0);
  t("tuile dans ⬆️ Exporter (section Plan)", /titreCle: "export\.lanceur\.majPlan", section: "plan"[\s\S]{0,120}MajPlan\.ouvrir\(\)/.test(IF) &&
    /cle: "plan",\s+titreCle: "export\.lanceur\.sectionPlan"/.test(IF));
  t("raccourci en tête des calques (≡ Filtres), absent en lecture seule, branché au clic",
    /window\.MajPlan && CS && !lectureSeule[\s\S]{0,200}data-maj-plan/.test(FP) && /matches\('\[data-maj-plan\]'\)[\s\S]{0,120}MajPlan\.ouvrir\(\)/.test(FP));
  t("Générateur : ktaGenerateurMaj ouvre en mode Modifier sur le ZIP, puis applique les calques",
    /window\.ktaGenerateurMaj = async function/.test(GEN) && /_plannerMode = "modifier";\s+await _chargerZipModifier\(opts\.zip\)/.test(GEN) &&
    /if \(_plannerMaj\) _appliquerMaj\(\);/.test(GEN));
  t("Générateur : fichier de la ligne choisi à la main > fichier de l'assistant > fichier d'origine > <id>.json",
    /_getFile\(lid \+ "_file", null\) \|\| item\._ktaFichierMaj \|\|[\s\S]{0,120}item\.dataset\.ktaFichier[\s\S]{0,80}_getFile\(null, dlId \+ "\.json"\)/.test(GEN));
  t("Générateur : état de mise à jour remis à zéro à chaque ouverture", /_plannerMode       = "nouveau";\s+_plannerMaj        = null;/.test(GEN));
  t("légende des types versés : même sous-ensemble que la conversion", /window\.ktaLegendePourCalque = function\(payload\) \{ return _legendePourPayload/.test(SE) &&
    /ktaLegendePourCalque\(tout\)/.test(MP));
  t("plan local : remplacement sous le MÊME id (session, calage, photos restent attachés), retrait proposé AVANT",
    /if \(avant\) await _proposerNettoyage\(etat, false\);[\s\S]{0,200}chargerZipFichier\(fichier, [\s\S]{0,80}\{ planId: entree\.id, storeBlob: true/.test(MP));
  t("🩸 plan fermé par le Générateur : retrait APRÈS la réouverture (la session d'un plan fermé ne s'enregistre plus)",
    /function _planOuvert\(etat\) \{\s+return !etat\.planFerme/.test(MP) &&
    (MP.match(/if \(!avant && window\._currentLoadedPlanId === etat\.planId\) await _proposerNettoyage/g) || []).length === 2 &&
    /etat\.planFerme = !!\(infos && infos\.planFerme\)/.test(MP));
  t("tuilage V2 : plan affiché fermé APRÈS confirmation (refus = rien de généré), photos lues par l'id relevé avant",
    /const planIdPhotos = window\._currentLoadedPlanId \|\| null;[\s\S]{0,200}const planFerme = tilingV2On \? await _fermerPlanAvantTuilage\(\) : false;\s+if \(planFerme === null\) return;/.test(GEN) &&
    /getAllPhotosForPlan\(planIdPhotos\)/.test(GEN) &&
    /ktaConfirm\(window\.I18n\.t\("gen\.fermerPlan\.texte"\)[\s\S]{0,300}if \(!ok\) return null;/.test(GEN) &&
    /maj\.onZip\(blob, nomZip, \{ nom: name, version: version, planFerme: planFerme \}\)/.test(GEN));
  t("fermeture = retour à l'accueil, qui démonte la carte comme un changement de plan (session enregistrée)",
    /function ktaFermerPlanPourMemoire\(\) \{[\s\S]{0,400}window\.map instanceof window\.L\.Map[\s\S]{0,120}afficherLoader\(\);/.test(MAIN) &&
    /function afficherLoader\(\) \{[\s\S]{0,1200}window\.map instanceof window\.L\.Map\) \{\s+_libererRessourcesPlanPrecedent\("accueil"\);/.test(MAIN) &&
    /window\.ktaFermerPlanPourMemoire = ktaFermerPlanPourMemoire;/.test(MAIN));
  t("tuiles rangées sans recompression (STORE)", /const TUILE_ZIP_OPTS = \{ compression: "STORE" \};/.test(GEN) &&
    (GEN.match(/fmt\.ext, (?:_tuileUnieBuf|arrBuf), TUILE_ZIP_OPTS\)/g) || []).length === 2);
  t("remplacement raté : le ZIP part en téléchargement (rien de perdu)", /catch \(er\) \{[\s\S]{0,120}_telecharger\(blob, nomZip\)/.test(MP));
  t("assistant : « Publier la nouvelle version » seulement si versionAutorisee, envoi par la prise publierVersion",
    /X\.versionAutorisee\(etat\.planId\)/.test(MP) && /window\.KtaExtensions\.publierVersion\(\{ planId: etat\.planId/.test(MP));
  t("assistant : jamais publierPlan (un nouveau plan serait un doublon, pas une version)", MP.indexOf("publierPlan") < 0);
  t("Générateur en mise à jour : la suite revient à l'assistant AVANT le téléchargement et « Publier »",
    /if \(_plannerMaj && typeof _plannerMaj\.onZip === "function"\) \{[\s\S]{0,400}return;\s*\}[\s\S]*aPrise\("publierPlan"\)/.test(GEN));
  t("retrait : restitution des calques versés + retirerIntegres daté de l'assistant",
    /CS\.restituer\(id\)/.test(MP) && /CS\.retirerIntegres\(etat\.uids, etat\.T\)/.test(MP));
}

console.log("");
if (ko) { console.log("❌ check-maj-plan : " + ko + " problème(s)"); process.exit(1); }
console.log("🎉 mise à jour du plan : regroupement, fichiers, retrait de session et câblage tiennent");
