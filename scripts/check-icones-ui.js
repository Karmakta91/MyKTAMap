#!/usr/bin/env node
/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
/* eslint-disable no-console */
// =====================================================================
// check-icones-ui.js — garde-fou pré-commit BLOQUANT (rejoué en CI), à CLIQUET : icônes SVG de l'interface
// =====================================================================
// Les contrôles passés en SVG (js/ktaIcones.js) ne doivent pas revenir à l'emoji, et la doc doit montrer la
// même icône que le bouton. Contrôle :
//   1. js/interface.js : aucun emoji dans `iconePrincipale`, `icone:`, une icône dynamique, un reflet de mode
//      ou un `innerHTML = "…"` (seules les pastilles de TYPE, ligne avec `typeKey:`, gardent leur repli) ;
//      index.html : les boutons d'en-tête et de « Mes plans » migrés portent `data-kta-ico` et aucun emoji ;
//      les libellés migrés de l'accueil et de sa Configuration (CLES_INDEX) suivent une icône `data-kta-ico`,
//      ceux rendus par un module (APPELS_JS) ont leur ktaIcone() à côté, et leurs clés n'ont plus d'emoji ;
//      fenêtres d'outils de la carte (CLES_C2, CLES_C2_TEXTE) : même règle, et aucun reflet de mode en emoji ;
//   2. chaque nom passé à ktaIcone("…") ou à data-kta-ico="…" (js/*.js, index.html) existe dans le module ;
//   3. chaque règle de la table de doc (KtaIcones.DOC) pointe vers une icône existante ;
//   4. EXHAUSTIF : chaque occurrence d'un emoji migré dans docs/applications/README_USER{,.en,.es}.md et dans
//      les clés aide.* de lang/{fr,en,es}.json est soit substituée (DOC), soit listée « autre sens »
//      (AUTRE_SENS). Sinon : échec avec fichier:ligne et le texte voisin ;
//   5. CLIQUET : le nombre d'emplois rangés par une règle « tout le reste » est figé par emoji (PLAFOND_RESTE) ;
//   6. CLIQUET : les trois dicos entiers hors doc (toasts, alertes, titres…) : un emoji de bouton migré n'y reste
//      que dans le compte figé par emoji (PLAFOND_DICOS) ; un texte nouveau qui en cite un échoue.
// Usage : node scripts/check-icones-ui.js [--liste] [--plafond]   (--liste : comptes par emoji ; --plafond :
//   comptes à reporter dans PLAFOND_RESTE puis PLAFOND_DICOS)
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8");
const K = require(path.join(RACINE, "js", "ktaIcones.js"));
const LISTE = process.argv.indexOf("--liste") >= 0;

let ko = 0;
const t = (n, c, detail) => {
  if (!c) { ko++; console.log("❌ " + n + (detail ? "\n   " + detail : "")); }
  else if (LISTE) console.log("✅ " + n);
};
const EMO = /[\p{Extended_Pictographic}⬛⬜☑ℹ]/u;

// Emoji des contrôles passés en SVG : chacun doit avoir ses règles de doc (sinon ses occurrences échappent au
// point 4). Retirer un emoji d'ici = revenir à l'emoji dans l'interface.
const EMOJI_MIGRES = ["🧭", "✏️", "🛣️", "⬛", "🏛️", "📐", "🔍", "🔎", "⬇️", "⬆️", "⏪", "⏩", "⭐", "📚", "⚙️",
  "▶️", "⏹️", "🔃", "🪧", "📍", "🎯", "🔓", "🔒", "🗺️", "🎬", "🔥", "⛑️", "🔆", "🚑", "📡", "♦️", "📏", "⛏️",
  "❌", "✅", "🧹", "🪜", "➕", "🖼️", "🖨️", "🛰️", "💾", "🎨", "📊", "🔄", "🌍", "❓", "📖", "📥", "🚨", "☑", "ℹ️",
  "🧊", "📦", "🧰", "📔", "🌀", "📸", "🏗️", "🌐", "☁️", "📁", "🧩", "🛠️", "🔔", "🪟", "🧲", "☀️", "📱", "🔋", "📳",
  "🕵️", "🔐", "🚫", "📋", "📤", "🗑️", "🔧", "🛡️", "📄", "💥", "🐛", "🚀", "👣", "🎤", "🕹️", "🏷️", "🏠", "📉"];
const BOUTONS_INDEX = ["loaderSearchBtn", "loaderOfflineHdrBtn", "loaderAlertBtn", "loaderHelpBtn", "loaderConfigBtn",
  "loaderPlansFolderNew", "loaderPlansSelect"];
// Libellés migrés de l'accueil, de sa Configuration et des fenêtres ouvertes depuis là : la clé ne porte plus
// d'emoji (fr, en, es) et son élément, dans index.html, suit une icône `data-kta-ico`.
const CLES_INDEX = ["home.plans.title", "home.osm.title", "home.add.title", "home.tools.title", "home.add.journal",
  "home.add.editData", "home.add.linksMgr", "home.add.photos", "home.add.generate", "impmasse.btn.ouvrir",
  "home.plans.showServer", "home.loader.configTitle", "config.group.application", "config.group.affichage",
  "config.group.optionnels", "config.group.addons", "config.group.privacy", "config.group.system",
  "config.display.scaledMarkers.label", "config.aidectx.label", "config.notifs.label", "config.panneaux.label",
  "config.zoomBoutons.label", "config.snapdraw.label", "home.cfg.themeLight", "home.cfg.wakeLock", "config.replay.label",
  "config.heatmap.label", "config.batterie.label", "config.display.vibration.label", "config.journal.label",
  "config.memoriser.label", "home.cfg.pinTitle", "home.privacy.title", "home.privacy.netLogBtn",
  "home.privacy.netDocBtn", "home.privacy.osmToggle", "home.cfg.serverPlansTitle", "home.cfg.skipServerPlans",
  "devmode.title", "home.inspector.title", "home.inspector.memBtn", "home.cfg.depannage.btn", "home.netlog.title",
  "home.netlog.copyBtn", "home.netlog.exportBtn", "home.netlog.clearBtn", "home.netdoc.title",
  "home.netdoc.whitelistTitle", "home.netdoc.verifyTitle", "home.netdoc.scopeTitle", "home.netdoc.docTitle",
  "home.netdoc.openFull"];
// Libellés migrés rendus par un module : chaque appel cité doit avoir son icône à côté (ktaIcone ou `ico:`).
const APPELS_JS = {
  "js/homeConfig.js": ['_t("home.cfg.depannage.title")', '_t("home.cfg.forceUpdateBtn")', '_t("home.cfg.killSwBtn")',
    '_t("home.cfg.resetBtn")', '_t("pin.setup.changeBtn")', '_t("pin.setup.disableBtn")', '_t("pin.setup.enableBtn")'],
  "js/devMode.js": ['t("devmode.gate.titre")', 't("devmode.toggleLabel")', 't("home.debug.logsLabel")',
    't("home.debug.showLogs")', 't("devmode.confadmin")', 't("home.inspector.swBtn")'],
  "js/memInspector.js": ['_t("titre")', '_t("btn.refresh")', '_t("btn.copy")'],
  "js/interface.js": ['"export.lanceur.sectionImage"', '"export.lanceur.sectionSession"', '"export.lanceur.sectionPlan"',
    '"export.lanceur.sectionExterne"'],
  "js/interfaceConfig.js": ['t("config.replay.label")', 't("config.heatmap.label")', 't("config.batterie.label")',
    't("config.display.vibration.label")'],
  "js/homeLoader.js": ['t("home.plans.folders.moveTo")', 't("home.plans.folders.all"', '"home.mobile.plansAll"',
    '"home.plans.folders.lockedIndex")) + \'">\' +']
};
const CLES_JS = ["home.cfg.depannage.title", "home.cfg.forceUpdateBtn", "home.cfg.killSwBtn", "home.cfg.resetBtn",
  "devmode.toggleLabel", "home.debug.logsLabel", "home.debug.showLogs", "devmode.confadmin", "home.inspector.swBtn",
  "meminsp.titre", "meminsp.btn.refresh", "meminsp.btn.copy", "export.lanceur.sectionImage",
  "export.lanceur.sectionSession", "export.lanceur.sectionPlan", "export.lanceur.sectionExterne",
  "home.plans.folders.fromTags", "pin.setup.enableBtn", "pin.setup.changeBtn", "pin.setup.disableBtn"];
// Libellés migrés des fenêtres d'outils de la carte : chaque emploi de la clé dans son fichier a son icône SVG sur
// sa ligne ou la voisine (ktaIcone, `ico:`, une table d'icônes), et la clé n'a d'emoji dans aucune langue.
const CLES_C2 = {
  "js/batteryGuard.js": ["battery.critical.btnConfig"],
  "js/compass.js": ["compass.modal.title"],
  "js/editor.js": ["editor.photos.btnCamera", "editor.photos.btnGallery", "editor.section.infos",
    "editor.section.photos", "editor.section.position"],
  "js/emergencyMode.js": ["emergency.copier", "emergency.exitBtn", "emergency.header.titre", "emergency.label.cap",
    "emergency.label.gps", "emergency.recentrer"],
  "js/exporter.js": ["imgexport.annotations.titre", "imgexport.apercu.titre", "imgexport.btn.telecharger",
    "imgexport.calquesData.titre", "imgexport.calquesImage.titre", "imgexport.fond.image", "imgexport.fond.titre",
    "imgexport.format.titre", "imgexport.legende.custom.ajouter", "imgexport.legende.custom.reset",
    "imgexport.legende.custom.titre", "imgexport.legende.selectCarte", "imgexport.legende.titre",
    "imgexport.modal.titre", "imgexport.mode.avance.label", "imgexport.mode.rapide.label",
    "imgexport.niveaux.titre", "imgexport.rapide.contenu.titre"],
  "js/filterPanel.js": ["filter.action.hideAll", "filter.action.showAll", "filter.ajouts.titre",
    "filter.ajouts.valider", "filter.calque.exporter", "filter.calque.integrer", "filter.calque.rapatrier",
    "filter.calque.restituer", "filter.footer.resetAll", "filter.levels.activeOnlyBtn", "filter.levels.allBtn",
    "filter.majPlan", "filter.planDeBase"],
  "js/geotiffExport.js": ["geotiff.contenu.titre", "geotiff.modal.titre", "geotiff.proj.titre",
    "imgexport.btn.telecharger"],
  "js/heatmap.js": ["heatmap.btn.apply", "heatmap.btn.clear", "heatmap.modal.titre", "heatmap.section.data",
    "heatmap.section.levels", "heatmap.section.session", "heatmap.section.visual", "heatmap.src.dataPoints",
    "heatmap.src.dataRoads", "heatmap.src.dataStructures", "heatmap.src.dataZones", "heatmap.src.editor",
    "heatmap.src.roads", "heatmap.src.structures", "heatmap.src.tracker", "heatmap.src.zones"],
  "js/interface.js": ["ui.changePlan.myPlans", "ui.trackerWarn.wakeLock"],
  "js/interfaceConfig.js": ["config.debug.titre", "config.display.intersections.label",
    "config.display.north.calibrate", "config.display.north.label", "config.display.v3dPave.label",
    "config.display.voice.label", "config.display.wakelock.label", "config.fond.label", "config.georef.clearBtn",
    "config.georef.clickBtn", "config.georef.openBtn", "config.georef.saveBtn", "config.georef.searchBtn",
    "config.georef.titre", "config.globaux.btn", "config.globaux.titre", "config.jonction.titre", "config.zoneJonction.titre",
    "config.niveaux.active.titre", "config.niveaux.titre", "config.niveaux.visible.titre",
    "config.optionnels.titre", "config.perfultra.tousNiveaux.label", "config.perfultra.ultra.label",
    "config.scope.badgeGlobal", "config.scope.badgePlan", "config.smartnav.titre", "config.steps.titre",
    "config.titre", "config.tracker.clickBtn", "config.tracker.searchBtn", "config.tracker.titre"],
  "js/interfaceDistanceTotale.js": ["disttot.btn.erase", "disttot.modal.titre"],
  "js/interfaceItineraire.js": ["iti.action.titre", "iti.action.titreNav", "iti.avoid.clickMapActive",
    "iti.avoid.clickMapBtn", "iti.avoid.marginTitle", "iti.avoid.pointsTitle", "iti.avoid.reset",
    "iti.avoid.tagsTitle", "iti.avoid.title", "iti.avoid.zonesTitle", "iti.btn.clear", "iti.btn.discard",
    "iti.btn.erase", "iti.btn.modeClick", "iti.btn.modeClickActivate", "iti.btn.myPos", "iti.btn.save",
    "iti.corde.title", "iti.inacc.title", "iti.nav.end", "iti.nav.start", "iti.nav.tour", "iti.partage.btnOff",
    "iti.partage.btnOn", "iti.pause.titre", "iti.points.titre", "iti.speed.titre"],
  "js/interfaceLegende.js": ["legendui.edit.btn", "legendui.group.access", "legendui.group.custom",
    "legendui.group.levels", "legendui.group.others", "legendui.group.rescue", "legendui.group.signage",
    "legendui.group.wells", "legendui.modal.titre", "legendui.section.structures", "legendui.section.traces",
    "legendui.section.zones"],
  "js/interfaceMaintenance.js": ["maint.calib.sectionValues"],
  "js/itiGuidage.js": ["guid.feuille.titre"],
  "js/legendCustomization.js": ["legend.add.ok", "legend.add.title", "legend.editor.add", "legend.editor.done",
    "legend.editor.reset", "legend.editor.title"],
  "js/lostMode.js": ["lost.btn.calc", "lost.btn.clickMap", "lost.btn.confirm", "lost.btn.copyReport",
    "lost.btn.fermer", "lost.btn.recalc", "lost.btn.secours", "lost.btn.tracker", "lost.btn.wipe",
    "lost.modal.titre", "lost.results.indices.titre", "lost.results.refined.titre", "lost.results.zone.titre",
    "lost.section.indices", "lost.section.position", "lost.section.temps", "lost.section.vitesse",
    "lost.tips.attendre.titre", "lost.tips.calme.titre", "lost.tips.comm.titre", "lost.tips.lumiere.titre",
    "lost.tips.nepas.titre", "lost.tips.orient.titre", "lost.tips.summary"],
  "js/majPlan.js": ["maj.titre"],
  "js/northPicker.js": ["north.btn.cancel", "north.btn.validate", "north.titre"],
  "js/pdfExport.js": ["pdfexport.annotations.points", "pdfexport.annotations.roads",
    "pdfexport.annotations.structures", "pdfexport.annotations.titre", "pdfexport.annotations.zones",
    "pdfexport.btn.generer", "pdfexport.data.titre", "pdfexport.image.base", "pdfexport.image.titre",
    "pdfexport.legende.titre", "pdfexport.miseEnPage.header", "pdfexport.miseEnPage.titre",
    "pdfexport.modal.titre", "pdfexport.orientation.titre", "pdfexport.qualite.titre", "pdfexport.taille.titre"],
  "js/searchPoints.js": ["search.gps.noCalib.btn", "search.gps.noPoi.createBtn", "search.gps.poi.goBtn",
    "search.modal.titre", "search.row.assignTitle"],
  "js/secoursMode.js": ["secours.btn.ouvrir", "secours.couv.titre", "secours.create.titre",
    "secours.edit.contexteTitre", "secours.edit.equipesTitre", "secours.edit.exportTitre",
    "secours.list.btnImporter", "secours.list.btnNouveau", "secours.modal.titre", "secours.phases.btnAjouter",
    "secours.phases.sectionTitre"],
  "js/sessionExporter.js": ["export.adv.contentTitle", "export.adv.mesureDistance", "export.adv.mesureSurface",
    "export.adv.outputTitle", "export.adv.photosTitle", "export.adv.points", "export.adv.roads",
    "export.adv.structures", "export.adv.trackerGps", "export.adv.zones", "export.calib.apercuTitre",
    "export.calib.clickBtn", "export.calib.pointATitre", "export.calib.pointBTitre", "export.calib.searchBtn",
    "export.conv.d2sApercuTitle", "export.conv.d2sSourceTitle", "export.conv.granTitle", "export.conv.photosTitle",
    "export.conv.points", "export.conv.roads", "export.conv.s2dContentTitle", "export.conv.structures",
    "export.conv.zones", "export.extern.outputTitle", "export.full.anonymizeLabel", "export.full.photosLabel",
    "export.fusion.apercuTitle", "export.fusion.sourceTitle", "export.geojson.projTitre",
    "export.gpx.contentTitle", "export.gpx.itineraire", "export.gpx.legend", "export.gpx.pointsEmbedded",
    "export.gpx.pointsSession", "export.gpx.roadsSession", "export.kmz.contentTitle", "export.kmz.image",
    "export.kmz.itineraire", "export.kmz.jonctions", "export.kmz.legend", "export.kmz.niveauxTitre",
    "export.kmz.points", "export.kmz.roads", "export.kmz.structures", "export.kmz.zones"],
  "js/tableEditor.js": ["tabledit.modal.titre"],
  "js/trackerReplay.js": ["replay.export.btn", "replay.modal.titre"],
  "js/volumeExploite.js": ["volume.titre"]
};
// Clés des mêmes fenêtres sorties de l'emoji sans icône à côté : icône posée par l'appelant (titre de modale
// variable, catégories, sections), libellé sous un titre qui la porte déjà, `<option>`, texte d'état.
const CLES_C2_TEXTE = ["cheatsheet.tool.edition", "cheatsheet.tool.legende", "cheatsheet.tool.mesure",
  "cheatsheet.tool.recherche", "cheatsheet.tool.structures", "cheatsheet.tool.traces", "cheatsheet.tool.tracker",
  "cheatsheet.tool.zones", "config.compteTitre", "config.georef.pointA", "config.georef.pointB",
  "config.georef.pointC", "config.georef.precisionHistorique", "config.georef.precisionLocal",
  "config.globaux.carnet", "config.group.navTracker", "config.group.perf", "config.group.planCalib",
  "config.perfultra.animOff.label", "config.perfultra.decim.label", "config.perfultra.mobileZoomLimit.label",
  "config.perfultra.noIntersect.label", "config.perfultra.noTooltips.label", "config.perfultra.slowSave.label",
  "config.smartnav.label", "editor.modal.btnAdd", "editor.modal.btnSave", "editor.modal.titleAdd",
  "editor.modal.titleEdit", "export.gpx.formatLine", "export.gpx.roundtripLine", "export.solo.advanced",
  "export.solo.conversion", "export.solo.extern", "export.solo.full", "export.solo.geojson", "export.solo.gpx",
  "export.solo.kmz", "filter.section.dataLayers", "filter.section.imageLayers", "filter.section.levels",
  "filter.section.roadTypes", "filter.section.structTypes", "filter.section.tags", "filter.section.zoneTypes",
  "geotiff.fait", "geotiff.faitPlafonne", "heatmap.toast.info", "heatmap.toast.noData", "heatmap.toast.tooMany",
  "imgexport.ann.structures", "imgexport.format.resol.max", "imgexport.format.resol.maxIos",
  "imgexport.legende.contenu.structures", "iti.btn.compute", "iti.btn.recompute", "iti.modal.titreCalc",
  "iti.modal.titreNav", "iti.result.time", "legend.add.catIcones", "legend.add.catStructures",
  "legend.add.catTraces", "legend.add.catZones", "legend.cat.icones", "legend.cat.structures", "legend.cat.traces",
  "legend.cat.zones", "pdfexport.legende.position", "pdfexport.legende.style", "pdfexport.legende.taille",
  "pdfexport.orientation.paysage", "pdfexport.orientation.portrait", "search.gps.noCalib.toast",
  "search.gps.poi.dist", "search.kind.point", "search.kind.road", "search.kind.structure", "search.kind.zone",
  "stats.meta.multiNiveau", "stats.meta.v2Tuile", "tabledit.source.fusion", "ui.subaction.nouveauTypeTitre",
  "utils.scaleCoherence.rowCalibrated"];

// ── 0. auto-test du classement (chaque sabotage doit rougir) ─────────────────────────────
{
  const un = (txt) => K.classerDoc(txt)[0] || {};
  t("auto-test : « 🧭 Tracker » → navigation", un("menu 🧭 Tracker").icone === "navigation");
  t("auto-test : « 🧭 Boussole » → compass", un("la tuile 🧭 Boussole").icone === "compass");
  t("auto-test : la variante U+FE0F est la même occurrence", K.classerDoc("⚙️ Réglages ⚙ Réglages").length === 2);
  t("auto-test : un emoji non migré n'est pas compté", K.classerDoc("🦄 licorne").length === 0);
  const sub = K.substituerDoc("menu 🧭 Tracker", { jeton: true });
  t("auto-test : jeton puis SVG", /<svg class="kta-ico kta-ico-navigation kta-ico-doc"/.test(K.jetonsEnSvg(sub)) && !/🧭/.test(sub));
  t("auto-test : nom inconnu → chaîne vide", (() => {
    const w = console.warn; console.warn = () => {}; const r = K.icone("n-existe-pas"); console.warn = w; return r === "";
  })());
}

// ── 1. aucun emoji dans les contrôles migrés ─────────────────────────────
const SRC_INTERFACE = lire("js/interface.js");
{
  const motifs = [/(iconePrincipale|icone)\s*:\s*"([^"]*)"/, /innerHTML\s*=\s*"([^"]*)"/,
    /dynamicIcon\s*:\s*function[^\n]*"([^"]*)"/, /_setGroupeModeActif\([^)\n]*"([^"]*)"/];
  const fautes = [];
  SRC_INTERFACE.split(/\r?\n/).forEach((l, i) => {
    if (/typeKey\s*:/.test(l) || /_iconeType\(/.test(l)) return;   // pastille de type : repli emoji permis
    if (motifs.some((re) => { const m = re.exec(l); return m && EMO.test(m[m.length - 1]); })) {
      fautes.push("js/interface.js:" + (i + 1) + "  " + l.trim().slice(0, 100));
    }
  });
  t("1. interface.js : aucun emoji dans une icône de contrôle (cliquet 0)", fautes.length === 0, fautes.join("\n   "));

  const html = lire("index.html");
  BOUTONS_INDEX.forEach((id) => {
    const m = new RegExp("<button[^>]*id=\"" + id + "\"[^>]*>([^<]*)</button>").exec(html);
    t("1. index.html : #" + id + " trouvé", !!m);
    if (!m) return;
    t("1. index.html : #" + id + " porte data-kta-ico", /data-kta-ico="[^"]+"/.test(m[0]));
    t("1. index.html : #" + id + " sans emoji", !EMO.test(m[1]), m[1]);
  });

  // Libellés de l'accueil : icône juste avant l'élément traduit (160 caractères), clé sans emoji.
  const sansIcone = [];
  CLES_INDEX.forEach((cle) => {
    const re = new RegExp("data-i18n(?:-html)?=\"" + cle.replace(/\./g, "\\.") + "\"", "g");
    let m, n = 0;
    while ((m = re.exec(html)) !== null) {
      n++;
      if (!/data-kta-ico="[a-z0-9-]+"/.test(html.slice(Math.max(0, m.index - 160), m.index))) {
        sansIcone.push(cle + " (index.html:" + html.slice(0, m.index).split("\n").length + ")");
      }
    }
    if (!n) sansIcone.push(cle + " : élément introuvable dans index.html");
  });
  t("1. index.html : " + CLES_INDEX.length + " libellés migrés précédés de leur icône data-kta-ico",
    sansIcone.length === 0, sansIcone.join("\n   "));

  // Libellés rendus par un module : ktaIcone( sur la ligne de l'appel ou sa voisine ; `ico: "` sur la ligne même
  // pour les sections du lanceur (les lignes voisines portent celles des autres sections).
  const appelsNus = [];
  Object.keys(APPELS_JS).forEach((f) => {
    const lignes = lire(f).split(/\r?\n/);
    APPELS_JS[f].forEach((appel) => {
      const i = lignes.findIndex((l) => l.indexOf(appel) >= 0);
      if (i < 0) { appelsNus.push(f + " : « " + appel + " » introuvable"); return; }
      const ok = /\bico: "[a-z0-9-]+"/.test(lignes[i]) ||
        /ktaIcone\(/.test([lignes[i - 1] || "", lignes[i], lignes[i + 1] || ""].join("\n"));
      if (!ok) appelsNus.push(f + ":" + (i + 1) + " : « " + appel + " » sans icône");
    });
  });
  t("1. modules de l'accueil et lanceur d'export : libellés migrés rendus avec leur icône SVG",
    appelsNus.length === 0, appelsNus.join("\n   "));

  const emojiCle = [];
  ["fr", "en", "es"].forEach((l) => {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    CLES_INDEX.concat(CLES_JS).forEach((cle) => {
      if (d[cle] === undefined) emojiCle.push(l + " : " + cle + " absente");
      else if (EMO.test(String(d[cle]).replace(/<[^>]*>/g, ""))) emojiCle.push(l + " : " + cle + " = " + d[cle]);
    });
  });
  t("1. dicos : les " + (CLES_INDEX.length + CLES_JS.length) + " clés migrées n'ont plus d'emoji (fr, en, es)",
    emojiCle.length === 0, emojiCle.join("\n   "));

  // Fenêtres d'outils de la carte : chaque emploi d'une clé migrée a son icône à côté (ligne ou voisine).
  const c2Nus = [];
  Object.keys(CLES_C2).forEach((f) => {
    const lignes = lire(f).split(/\r?\n/);
    CLES_C2[f].forEach((cle) => {
      let n = 0;
      lignes.forEach((l, i) => {
        if (l.indexOf("\"" + cle + "\"") < 0) return;
        n++;
        if (/\{ titre: /.test(l)) return;   // titre d'une alerte (ktaAlerte, texte seul)
        const autour = [lignes[i - 1] || "", l, lignes[i + 1] || ""].join("\n");
        if (!/ktaIcone\(|\bico: "|_ICO|ICONE|categoryIcon/.test(autour)) c2Nus.push(f + ":" + (i + 1) + " : « " + cle + " » sans icône");
      });
      if (!n) c2Nus.push(f + " : « " + cle + " » introuvable");
    });
  });
  t("1. fenêtres d'outils de la carte : libellés migrés rendus avec leur icône SVG", c2Nus.length === 0, c2Nus.join("\n   "));
  const c2Emoji = [];
  const clesC2 = Object.keys(CLES_C2).reduce((a, f) => a.concat(CLES_C2[f]), []).concat(CLES_C2_TEXTE);
  ["fr", "en", "es"].forEach((l) => {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    clesC2.forEach((cle) => {
      if (d[cle] === undefined) c2Emoji.push(l + " : " + cle + " absente");
      else if (EMO.test(String(d[cle]).replace(/<[^>]*>/g, ""))) c2Emoji.push(l + " : " + cle + " = " + d[cle]);
    });
  });
  t("1. dicos : les " + clesC2.length + " clés migrées des fenêtres d'outils n'ont plus d'emoji (fr, en, es)",
    c2Emoji.length === 0, c2Emoji.join("\n   "));
  // Reflet d'un mode sur un bouton de groupe (_setGroupeModeActif) : SVG partout, interface.js comme ailleurs.
  const reflets = [];
  fs.readdirSync(path.join(RACINE, "js")).filter((f) => /\.js$/.test(f)).forEach((f) => {
    lire("js/" + f).split(/\r?\n/).forEach((l, i) => {
      const m = /_setGroupeModeActif\([^)\n]*"([^"]*)"/.exec(l);
      if (m && EMO.test(m[1])) reflets.push("js/" + f + ":" + (i + 1) + "  " + l.trim().slice(0, 100));
    });
  });
  t("1. reflet de mode sur un bouton de groupe : jamais un emoji (cliquet 0)", reflets.length === 0, reflets.join("\n   "));

  // Lignes de Mes plans : l'icône du type de plan est un SVG (plan du site, d'extension, sur l'appareil).
  const HOME = lire("js/homeLoader.js");
  t("1. homeLoader.js : icône de type de plan en SVG, sans emoji",
    /let icon = window\.ktaIcone\(plan\.type === "server" \? "cloud"/.test(HOME) && !/let icon = [^\n]*["'][^"'\n]*[\p{Extended_Pictographic}]/u.test(HOME));
}

// ── 2. noms connus ─────────────────────────────
{
  // Le module lui-même cite `data-kta-ico="nom"` dans son en-tête : hors balayage.
  const sources = fs.readdirSync(path.join(RACINE, "js")).filter((f) => /\.js$/.test(f) && f !== "ktaIcones.js")
    .map((f) => "js/" + f).concat(["index.html"]);
  const inconnus = [];
  let n = 0;
  sources.forEach((f) => {
    const s = lire(f);
    const re = /ktaIcone\(\s*["']([^"']+)["']|data-kta-ico=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      n++;
      const nom = m[1] || m[2];
      if (!K.existe(nom)) inconnus.push(f + " : « " + nom + " »");
    }
  });
  t("2. " + n + " appels nommés, tous connus du module", n > 0 && inconnus.length === 0, inconnus.join("\n   "));
}

// ── 3. table de doc saine ─────────────────────────────
{
  const mauvais = K.DOC.filter((r) => !r.e || !K.existe(r.i)).map((r) => r.e + " → " + r.i);
  t("3. chaque règle DOC pointe vers une icône existante", mauvais.length === 0, mauvais.join(", "));
  const sansSens = K.AUTRE_SENS.filter((r) => !r.e || !r.s).map((r) => r.e);
  t("3. chaque entrée AUTRE_SENS dit son sens", sansSens.length === 0, sansSens.join(", "));
  const cles = new Set(K.DOC.concat(K.AUTRE_SENS).map((r) => r.e.replace(/️/g, "")));
  const sansRegle = EMOJI_MIGRES.filter((e) => !cles.has(e.replace(/️/g, "")));
  t("3. chaque emoji migré a ses règles de doc", sansRegle.length === 0, sansRegle.join(" "));
}

// ── 4. doc exhaustive ─────────────────────────────
{
  const SOURCES = [];
  ["README_USER.md", "README_USER.en.md", "README_USER.es.md"].forEach((f) => {
    SOURCES.push({ fichier: "docs/applications/" + f, morceaux: [{ texte: lire("docs/applications/" + f), ligne: 1 }] });
  });
  ["fr", "en", "es"].forEach((l) => {
    const brut = lire("lang/" + l + ".json"), dico = JSON.parse(brut), lignes = brut.split(/\r?\n/);
    const morceaux = Object.keys(dico).filter((k) => /^aide\./.test(k)).map((k) => {
      const i = lignes.findIndex((x) => x.indexOf("\"" + k + "\"") >= 0);
      return { texte: String(dico[k]), ligne: i + 1, cle: k };
    });
    SOURCES.push({ fichier: "lang/" + l + ".json", morceaux: morceaux });
  });
  const comptes = {}, orphelins = [];
  SOURCES.forEach((src) => src.morceaux.forEach((mc) => {
    const langue = /\.(en|es)\./.test(src.fichier) ? RegExp.$1 : (/lang\/(\w+)/.test(src.fichier) ? RegExp.$1 : "fr");
    K.classerDoc(mc.texte).forEach((o) => {
      const c = comptes[o.emoji] ||
        (comptes[o.emoji] = { svg: 0, autre: 0, reste: 0, fr: [0, 0], en: [0, 0], es: [0, 0] });
      if (o.icone || o.sens) c[langue][o.icone ? 0 : 1]++;
      if (o.reste) c.reste++;
      if (o.icone) { c.svg++; return; }
      if (o.sens) { c.autre++; return; }
      const ligne = mc.cle ? mc.ligne : mc.texte.slice(0, o.debut).split("\n").length;
      const voisin = mc.texte.slice(Math.max(0, o.debut - 30), o.fin + 40).replace(/\s+/g, " ");
      orphelins.push(src.fichier + ":" + ligne + (mc.cle ? " (" + mc.cle + ")" : "") + "  …" + voisin + "…");
    });
  }));
  t("4. doc : chaque emoji migré est substitué ou listé « autre sens » (" + orphelins.length + " non classé(s))",
    orphelins.length === 0, orphelins.slice(0, 400).join("\n   "));
  // 5. CLIQUET « tout le reste » : la règle sans motif d'un emoji (AUTRE_SENS sans a ni b) range aussi une phrase
  // NOUVELLE qui citerait le bouton par un libellé inconnu — elle resterait en emoji, donc icône périmée. Son
  // compte (3 guides + aide.* des 3 langues) est figé : une hausse échoue tant que le nouvel emploi n'est pas
  // classé (règle DOC ciblée = SVG, ou AUTRE_SENS ciblé = autre sens voulu) ; une baisse se reporte ici.
  // Clés sans U+FE0F (forme rendue par classerDoc). Recalcul : node scripts/check-icones-ui.js --plafond
  const PLAFOND_RESTE = {
    "📖": 54, "🌐": 27, "🔒": 15, "📦": 59, "💾": 88, "💥": 6, "❌": 33, "🔄": 118, "📤": 77, "📸": 42, "🧊": 6,
    "🌍": 45, "🧭": 170, "🛡": 27, "🔐": 12, "📍": 186, "🚨": 99, "🔔": 3, "📋": 48, "ℹ": 27, "✅": 81, "📡": 12,
    "✏": 171, "🚀": 42, "📱": 9, "📥": 51, "▶": 48, "📚": 15, "🏗": 75, "➕": 69, "🚑": 30, "🎤": 11, "🪧": 39,
    "🗺": 132, "🎯": 120, "🔋": 9, "🗑": 138, "📊": 78, "⭐": 42, "⬇": 15, "📔": 33, "🎨": 39, "🖼": 39, "🏷": 33,
    "🚫": 21, "🔎": 27, "❓": 15, "🕹": 33, "📉": 24, "🪜": 39, "☀": 9, "🌀": 45, "📁": 21, "🛠": 9, "🔧": 3,
    "🏠": 3, "📄": 14
  };
  if (process.argv.indexOf("--plafond") >= 0) {
    console.log(JSON.stringify(Object.keys(comptes).filter((e) => comptes[e].reste)
      .reduce((o, e) => { o[e] = comptes[e].reste; return o; }, {})));
  }
  const ecartsReste = [];
  Object.keys(comptes).concat(Object.keys(PLAFOND_RESTE)).filter((e, i, a) => a.indexOf(e) === i).forEach((e) => {
    const n = comptes[e] ? comptes[e].reste : 0, p = PLAFOND_RESTE[e] || 0;
    if (n > p) ecartsReste.push(e + " : " + n + " emplois « tout le reste » pour " + p + " figés → classer le nouveau " +
      "(DOC ciblé ou AUTRE_SENS ciblé)");
    else if (n < p) ecartsReste.push(e + " : " + n + " < " + p + " figés → reporter " + n + " dans PLAFOND_RESTE");
  });
  t("5. doc : emplois « tout le reste » figés (cliquet, aucune phrase nouvelle rangée en silence)",
    ecartsReste.length === 0, ecartsReste.join("\n   "));
  if (LISTE) {
    // Les trois langues décrivent la même chose : un écart de SVG entre elles trahit un motif mal traduit.
    Object.keys(comptes).forEach((e) => {
      const c = comptes[e], ecart = c.fr[0] !== c.en[0] || c.fr[0] !== c.es[0];
      console.log("   " + e + "  SVG " + c.svg + " · autre sens " + c.autre + "   (fr/en/es SVG " + c.fr[0] + "/" +
        c.en[0] + "/" + c.es[0] + ", autre " + c.fr[1] + "/" + c.en[1] + "/" + c.es[1] + ")" + (ecart ? "  ≠" : ""));
    });
  }
}

// ── 6. textes hors doc : pas d'emoji d'un bouton passé en SVG ─────────────────────────────
// Toasts, encadrés, astuces, alertes, infobulles, titres : un emoji que classerDoc substituerait (icône d'un bouton
// migré) y montrerait l'ancien dessin ; le texte nomme le bouton sans icône (« Réglages → Géoréférencement GPS »).
// Balayage des trois dicos ENTIERS, hors aide.* (doc substituée au rendu, § 4) et hors CLES_SORTIE (texte écrit
// dans un fichier ou un rapport produit, nom donné à un objet créé). Un emploi rangé AUTRE_SENS (autre notion)
// passe. Ce qui reste (fenêtres et contrôles pas encore migrés) est figé par emoji, trois langues additionnées
// (PLAFOND_DICOS, cliquet) : toute hausse échoue, une baisse se reporte ici. Recalcul : --plafond.
{
  const CLES_SORTIE = /^(?:imgexport\.legSection\.|lost\.report\.|lost\.point\.nom$|secours\.txt\.)/;
  const PLAFOND_DICOS = {
    "🐛": 6, "🌐": 3, "🛣": 27, "⚙": 12, "⬛": 24, "📦": 6, "🕵": 6, "⛑": 24, "🔍": 12, "📐": 6, "🧭": 18, "🗺": 6,
    "📖": 9, "📚": 3, "🏗": 3, "🔆": 6, "🏛": 6, "⏪": 3, "📔": 3, "⬆": 3, "❓": 3, "📸": 3, "⏹": 6, "📏": 3,
    "🔥": 3, "🪜": 1
  };
  const parEmoji = {}, detail = {};
  ["fr", "en", "es"].forEach((l) => {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    Object.keys(d).forEach((cle) => {
      if (/^aide\./.test(cle) || /^_/.test(cle) || CLES_SORTIE.test(cle)) return;
      K.classerDoc(String(d[cle])).forEach((o) => {
        if (!o.icone) return;
        parEmoji[o.emoji] = (parEmoji[o.emoji] || 0) + 1;
        (detail[o.emoji] = detail[o.emoji] || []).push(l + " " + cle);
      });
    });
  });
  if (process.argv.indexOf("--plafond") >= 0) console.log(JSON.stringify(parEmoji));
  const ecarts = [];
  Object.keys(parEmoji).concat(Object.keys(PLAFOND_DICOS)).filter((e, i, a) => a.indexOf(e) === i).forEach((e) => {
    const n = parEmoji[e] || 0, p = PLAFOND_DICOS[e] || 0;
    if (n > p) ecarts.push(e + " : " + n + " emplois pour " + p + " figés → réécrire le texte sans l'icône (ou classer " +
      "AUTRE_SENS si c'est une autre notion) : " + detail[e].join(", "));
    else if (n < p) ecarts.push(e + " : " + n + " < " + p + " figés → reporter " + n + " dans PLAFOND_DICOS");
  });
  t("6. dicos hors doc : aucun emoji de bouton migré en plus du reste figé (cliquet)", ecarts.length === 0,
    ecarts.join("\n   "));
}

console.log(ko === 0 ? "🎉 icônes de l'interface : SVG partout où migré, doc alignée" : "⚠️ " + ko + " échec(s)");
process.exit(ko === 0 ? 0 : 1);
