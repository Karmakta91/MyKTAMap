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
//      fenêtres d'outils de la carte (CLES_C2, CLES_C2_TEXTE) et reste de l'interface (CLES_C3, CLES_C3_TEXTE :
//      vue 3D, Mode Secours, barres du haut et du bas, fiches, Vue OSM, Générateur, Tableur, inspecteurs…) et fin de
//      la refonte (CLES_C4, CLES_C4_TEXTE : profil, sélection multiple, portes d'entrée, Aide IA…) : même règle, et
//      aucun reflet de mode en emoji ; boutons de la vue 3D, icônes des confirmations (kta-modal-icon), compteurs
//      des barres, cartes du tutoriel, lignes du profil et de son export, pied de page de l'accueil, ConfAdmin :
//      jamais un emoji ; 1 bis : fenêtres de la doc, aucune clé aide.* à emoji posée sans substitution, crédits du
//      pied de la Documentation en SVG ;
//   2. chaque nom passé à ktaIcone("…") ou à data-kta-ico="…" (js/*.js, index.html, confadmin.html) existe ;
//   3. chaque règle des tables de doc (KtaIcones.DOC, REPERES) pointe vers une icône existante ;
//   4. EXHAUSTIF : chaque emoji (tous, pas seulement ceux des boutons) de docs/applications/README_USER{,.en,.es}.md
//      et des clés aide.* et tutorial.card.* de lang/{fr,en,es}.json tombe sous une règle : bouton (DOC),
//      notion (REPERES) ou exception gardée en emoji (GARDE). Sinon : échec avec fichier:ligne et le texte voisin ;
//   5. CLIQUET : le nombre d'emoji laissés en emoji dans la doc (exceptions GARDE) est figé par emoji
//      (PLAFOND_RESTE) ;
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
  "🕵️", "🔐", "🚫", "📋", "📤", "🗑️", "🔧", "🛡️", "📄", "💥", "🐛", "🚀", "👣", "🎤", "🕹️", "🏷️", "🏠", "📉",
  "🔭", "🧱", "🌫️", "🔦", "📌", "📢", "🔊", "⏸️", "🚒", "👤", "👥", "🎓", "🤖", "🏆", "♻️", "📝", "👁️", "↗️",
  "⌨️", "🔁", "📅", "↕️"];
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
// Reste de l'interface (vue 3D, Mode Secours, barres, fiches de point, Vue OSM, Générateur, Tableur, Mes photos,
// import de plusieurs plans, logs, inspecteurs, incognito, sélecteur de plan) : même règle que CLES_C2 ; CLES_C3_TEXTE =
// clés sorties de l'emoji dont l'icône est posée par l'appelant ou un alias de préfixe (_t("titre")), ou absente
// (<option>, titre d'alerte, attribut title, libellé repris dans une phrase).
const CLES_C3 = {
  "js/createConf.js": ["gen.btn.choisir", "gen.btn.genererZip", "gen.calib.calibrerBtn", "gen.dataLayers.importBtn",
      "gen.dataLayers.importTitre", "gen.dataLayers.titre", "gen.fond.label", "gen.georef.pointA", "gen.georef.pointB",
      "gen.georef.pointC", "gen.georef.titre", "gen.gpx.fichierTitre", "gen.gpx.titre", "gen.gpx.tracksType",
      "gen.histoire.retirerBtn", "gen.histoire.titre", "gen.icons.iconeBtn", "gen.icons.svgLabel", "gen.icons.titre",
      "gen.images.titre", "gen.imgLayers.niveau", "gen.imgLayers.titre", "gen.imp.pointsTag",
      "gen.imp.telechargeRegenerer", "gen.kmz.fichierTitre", "gen.kmz.lineStringType", "gen.kmz.polygonType",
      "gen.kmz.titre", "gen.kmzIncompat.sigBtn", "gen.kmzIncompat.titre", "gen.kmzNoImg.titre", "gen.legende.editBtn",
      "gen.legende.resetBtn", "gen.legende.titre", "gen.modal.titre", "gen.mode.avance", "gen.mode.simple",
      "gen.photos.label", "gen.sig.titre", "gen.tracking.nord", "gen.tracking.recentrerBtn", "gen.tracking.titre",
      "gen.v2.label", "gen.v2err.queFaire", "gen.v2warn.mobileTitre", "gen.v2warn.pcTitre", "gen.v2warn.titre",
      "gen.vierge.genererBtn", "gen.wiz.passer", "gen.wiz.resumeTitre", "gen.wiz.toggleTout", "gen.wiz.toggleWiz",
      "gen.zip.exempleBtn", "gen.zip.titre"],
  "js/debug.js": ["debug.title"],
  "js/importMasse.js": ["impmasse.btn.choisir", "impmasse.btn.lancer", "impmasse.btn.lancerVide", "impmasse.btn.voir",
      "impmasse.dossier.titre", "impmasse.precharger.label", "impmasse.titre"],
  "js/incognitoMode.js": ["incognito.badge.label", "incognito.confirm.changes.title", "incognito.confirm.usecases.title",
      "incognito.confirm.warn.title"],
  "js/interface.js": ["ui.loadOther.loadBtn", "ui.switcher.currentLabel", "ui.switcher.modalTitle", "ui.switcher.recentTitle"],
  "js/interPlanLinks.js": ["ipl.popup.addBtn"],
  "js/interfaceDocs.js": ["aiia.titre"],
  "js/osmHomePreview.js": ["osm_home.gps.popupTitle", "osm_home.niveaux.titre", "osm_mode.filters.plans", "osm_mode.filters.tags",
      "osm_mode.multi.tagsTitre"],
  "js/osmView.js": ["osm.btn.centerPlan", "osm.btn.centerTracker", "osm.btn.mygps", "osm.cache.btn", "osm.gps.popup.title",
      "osm.legende.btn", "osm.levels.label", "osm.modal.title", "osm.opacity.label", "osm.secours.tooltip.entree",
      "osm.secours.tooltip.iti", "osm.secours.tooltip.sortie", "osm.secours.tooltip.zone", "osm.tags.label",
      "osm.toggle.iti", "osm.toggle.plan", "osm.toggle.poi", "osm.toggle.roads", "osm.toggle.secours",
      "osm.toggle.struct", "osm.toggle.tracker", "osm.toggle.zones"],
  "js/photosGalerie.js": ["photosgal.action.enregistrer", "photosgal.action.rattacher", "photosgal.action.recreer",
      "photosgal.action.supprimer", "photosgal.action.voir", "photosgal.avec.titre", "photosgal.ouvrirPlan",
      "photosgal.pick.carte", "photosgal.sans.titre", "photosgal.titre", "photosgal.verifier.titre"],
  "js/secoursMode.js": ["secours.assign.equipeLabel", "secours.assign.roleLabel", "secours.assign.titre", "secours.b10.perdu",
      "secours.b10.sortie", "secours.b10.xl", "secours.b9.chefLabel", "secours.b9.remontesTitre",
      "secours.balayage.label", "secours.bandeau.arreter", "secours.bandeau.briefing", "secours.bandeau.ctaBtn",
      "secours.bandeau.ctaTitre", "secours.bandeau.enPause", "secours.bandeau.lanceDepuis", "secours.bandeau.planTermine",
      "secours.bandeau.rapport", "secours.bandeau.relancer", "secours.bandeau.reprendreLive",
      "secours.bandeau.voirRapportHisto", "secours.bandeau.vueOsm", "secours.brancard.calculer", "secours.brancard.titre",
      "secours.briefing.couchesTitre", "secours.briefing.optIti", "secours.briefing.optPlan", "secours.briefing.optPoi",
      "secours.briefing.optRoad", "secours.briefing.optSecours", "secours.briefing.optStruct",
      "secours.briefing.optTracker", "secours.briefing.optZone", "secours.btn.annulerCroix", "secours.btn.demarrerPhase",
      "secours.btn.editer", "secours.btn.genererPdf", "secours.btn.ouvrirScenario", "secours.btn.terminerPlan",
      "secours.couv.btnMasquer", "secours.couv.btnSurligner", "secours.ctxImport.dernierePosition",
      "secours.ctxImport.recentrer", "secours.ctxImport.titre", "secours.ctxImport.zoneIncertitude",
      "secours.debrief.titre", "secours.duree.titre", "secours.edit.autoMlvlBtn", "secours.edit.btnAjouterEquipe",
      "secours.edit.exportKmz", "secours.edit.exportMkmsec", "secours.edit.exportPdf", "secours.edit.masquer",
      "secours.edit.voirCarte", "secours.entree.titre", "secours.floater.retourModale", "secours.groupe.btnCalcIti",
      "secours.groupe.btnDefZone", "secours.groupe.btnPoisZone", "secours.groupe.couleurLabel",
      "secours.groupe.gpsSurfaceLabel", "secours.groupe.membresLabel", "secours.groupe.niveauMlvl",
      "secours.groupe.statDistance", "secours.groupe.statDuree", "secours.groupe.statZone", "secours.heatmap.afficher",
      "secours.heatmap.masquer", "secours.heatmap.regler", "secours.heatmap.titre", "secours.import.chipParcours",
      "secours.import.chipZone", "secours.import.equipesIncluses", "secours.import.labelDateExport",
      "secours.import.labelFichier", "secours.import.labelPlanSource", "secours.import.labelVersionApp",
      "secours.import.membres", "secours.import.previewTitre", "secours.import.resKoTitre", "secours.import.resOkEquipes",
      "secours.import.resOkSource", "secours.lancer.equipeTitre", "secours.lancer.opTitre", "secours.lancer.secTitre",
      "secours.lancer.titre", "secours.launchNext.titre", "secours.list.metaEquipes", "secours.live.obsLabel",
      "secours.live.pause", "secours.live.photoBtn", "secours.live.recentrerBtn", "secours.live.reprendre",
      "secours.live.retourOperateur", "secours.live.retourSecouriste", "secours.live.saisieRapide",
      "secours.live.typeEntree", "secours.live.typeEtape", "secours.live.typeSortie", "secours.live.voirEdition",
      "secours.liveOp.carteGlobale", "secours.liveOp.importRapport", "secours.liveOp.rapportGlobal",
      "secours.liveOp.titre", "secours.liveSec.ajouterNote", "secours.liveSec.statutAssocie",
      "secours.liveSec.terminerMission", "secours.liveSec.titre", "secours.mc.titre", "secours.newequipe.levelLabel",
      "secours.newequipe.nomLabel", "secours.newequipe.titre", "secours.opCard.details", "secours.opCard.importeChip",
      "secours.opCard.prendreMain", "secours.opDetails.titre", "secours.overlay.dernierePosition",
      "secours.overlay.dernierePositionLabel", "secours.overlay.entree", "secours.overlay.itineraire",
      "secours.overlay.sortie", "secours.overlay.zoneIncertitude", "secours.parcours.btnAjouterEtape",
      "secours.parcours.titre", "secours.phaseModal.equipesLabel", "secours.phaseModal.nivChip",
      "secours.phaseModal.titreCreate", "secours.phaseModal.titreEdit", "secours.phases.statutDemarree",
      "secours.pick.cliquerCarte", "secours.pick.favorisTitre", "secours.pick.titre", "secours.poiZone.titre",
      "secours.rappel.btnEquipe", "secours.rappel.btnGeneral", "secours.rapport.apercuDuree",
      "secours.rapport.apercuEquipes", "secours.rapport.apercuEtapes", "secours.rapport.apercuNotes",
      "secours.rapport.inclurePhotos", "secours.rapport.titreDefault", "secours.rapport.titreEquipier",
      "secours.rapport.titreOperateur", "secours.rapport.titreSecouriste", "secours.rapportPreview.contenuTitre",
      "secours.rapportPreview.titre", "secours.rapportRes.warningsSummary", "secours.recalage.titre",
      "secours.retour.btnDepart", "secours.retour.btnRentree", "secours.role.entree", "secours.role.sortie",
      "secours.secouriste.importTitre", "secours.secteurs.btn", "secours.secteurs.titre", "secours.suivre.actif",
      "secours.suivre.btn", "secours.victime.evacuer", "secours.victime.preciser", "secours.victime.voir",
      "secours.zoneMode.polygoneTitre", "secours.zoneMode.roadsTitre", "secours.zoneMode.titre"],
  "js/tableEditor.js": ["tabledit.editor.dupliquer", "tabledit.editor.sauvegarder", "tabledit.editor.supprimer", "tabledit.editor.titre",
      "tabledit.editor.voirCarte", "tabledit.preview.banner", "tabledit.preview.retour", "tabledit.save.appliquer",
      "tabledit.save.telecharger", "tabledit.save.titre", "tabledit.sortie.continuer", "tabledit.sortie.quitter",
      "tabledit.sortie.sauver"],
  "js/utils.js": ["poi.addWaypointBtn", "poi.deleteBtn", "poi.favOff", "poi.favOn", "poi.goThereBtn", "poi.moveBtn"]
};
const CLES_C3_TEXTE = ["osm_mode.multi.addFolder", "docs.aiiaBtn", "gen.imp.apercu", "gen.imp.configTitre", "gen.imp.genererBtn", "gen.mlvl.label", "gen.sig.famLignes",
    "gen.sig.famPoints", "gen.sig.famZones", "home.add.load", "impmasse.dossier.nouveau", "iti.wp.jeSuisIci",
    "meminsp.cache.titre", "meminsp.crash.btn.clearAll", "meminsp.crash.btn.copy",
    "meminsp.crash.btn.view", "meminsp.crash.detail.titre", "meminsp.crash.titre", "meminsp.idb.titre",
    "meminsp.ls.titre", "meminsp.orph.titre", "meminsp.runtime.tag.dataLayers", "meminsp.runtime.tag.debugOn",
    "meminsp.runtime.tag.imageLayers", "meminsp.runtime.tag.itiActive", "meminsp.runtime.tag.legend",
    "meminsp.runtime.tag.measure", "meminsp.runtime.tag.mlvl", "meminsp.runtime.tag.perf", "meminsp.runtime.tag.tiled",
    "meminsp.runtime.tag.trackerOff", "meminsp.runtime.tag.trackerOn", "meminsp.runtime.titre", "meminsp.storage.titre",
    "osm_home.cache.btnTitle", "osm_home.legende.btnTitle", "osm_mode.multi.add",
    "photosgal.supprimer.ok", "poi.editBtn", "poiPrecis.augmenter", "poiPrecis.deplacer", "poiPrecis.refaire",
    "secours.groupe.zonePolygone", "secours.groupe.zoneTraces", "secours.live.stepEntree", "secours.live.stepSortie",
    "secours.rappel.confirmTitre", "secours.retour.rappeleeA", "secours.retour.rentreeA", "secours.roleBandeau.equipe",
    "secours.roleBandeau.operateur", "secours.roleBandeau.secouriste", "secours.roleLabel.equipe",
    "secours.roleLabel.operateur", "secours.roleLabel.secouriste", "swinsp.btn.refetch", "swinsp.dynamic.titre",
    "swinsp.failures.titre", "swinsp.missing.titre", "swinsp.present.titre", "swinsp.refetch.retry", "swinsp.titre",
    "swinsp.verdict.ko.titre", "swinsp.verdict.ok.titre", "tabledit.source.dedup",
    "tabledit.source.raccords", "tabledit.source.resol", "tutorial.ui.headerTitle", "ui.suppClic.parZone",
    "utils.tracePopup.itinerary", "utils.tracePopup.jonction"];
// Fin de la refonte (profil et hauts faits, export / import du profil, statistiques du profil, sélection
// multiple, itinéraire entre plans, recalage, portes d'entrée, Aide IA, Mode Histoire, maintenance, rapport de
// session…) : même règle que CLES_C2 ; CLES_C4_TEXTE = clés sorties de l'emoji dont l'icône est posée par
// l'appelant (paramètre, nœud inséré après coup) ou absente (case d'une confirmation, phrase).
const CLES_C4 = {
  "js/bienvenue.js": ["gate.docBtn"],
  "js/convertirObjet.js": ["convert.titre"],
  "js/createConf.js": ["gen.infos.titre"],
  "js/crossPlanSearch.js": ["xps.multihop.label"],
  "js/homeLoader.js": ["home.dup.btnBoth", "home.dup.btnUpdate"],
  "js/homeProfile.js": ["home.profile.barStatsHeader", "home.profile.exportBtn", "home.profile.importBtn",
      "home.profile.photoBtn", "home.profile.photoChange", "home.profile.photoRemove",
      "home.profile.pies.retrouverNoms", "home.profile.resetBtn", "home.profile.resetConfirm",
      "home.profile.resetTitle", "home.profile.saveName", "home.profile.statFeats", "home.profile.statPlans",
      "home.profile.statStorage", "home.profile.statTime", "home.profile.stats.extTitle",
      "home.profile.stats.lblPhotos", "home.profile.stats.lblPlans", "home.profile.stats.lblSessions",
      "home.profile.stats.lblSnapshots", "home.profile.stats.lblStorage", "home.profile.stats.plansHeaderEmpty",
      "home.profile.stats.plansHeaderLoading", "home.profile.statsFinal", "home.profile.statsProgress",
      "home.profile.title", "home.profile.wallBtn", "home.profile.wallRemove", "home.profile.wallTitle"],
  "js/imageLayerCalibrationPicker.js": ["imgcal.btn.cancel", "imgcal.btn.validate", "imgcal.titre"],
  "js/interfaceAlerts.js": ["alerts.selector.titre", "alerts.update.titre"],
  "js/interfaceDocs.js": ["aiia.btn.copy", "aiia.btn.copyCtx", "aiia.btn.download", "aiia.etat.label",
      "aiia.note.titre", "aiia.privacy.titre", "aiia.profil.titre", "aiia.prompt.titre"],
  "js/interfaceImportExport.js": ["impexp.session.dropLabel"],
  "js/interfaceItineraire.js": ["iti.wp.srcPortal"],
  "js/interfaceMaintenance.js": ["maint.btn_clear_now", "maint.btn_export_profile_first",
      "maint.calib.sectionResult", "maint.calib.title", "maint.section_consequence_reset",
      "maint.section_good_news", "maint.section_recommendation", "maint.section_recommendation_check"],
  "js/ktaExtensions.js": ["ext.lectureSeuleFenetre.titre"],
  "js/majPlan.js": ["maj.fin.titre"],
  "js/modeHistoire.js": ["histoire.md.link.label", "histoire.note.viewBtn", "histoire.pdf.openTab",
      "histoire.tab.note", "histoire.tab.pdf"],
  "js/pinLock.js": ["pin.gate.bioBtn", "pin.gate.docBtn"],
  "js/poiDanger.js": ["poiDanger.constat.label"],
  "js/poiJonction.js": ["poiJonction.titre"],
  "js/profileExportImport.js": ["profileio.mode_merge", "profileio.mode_replace"],
  "js/refonteInterface.js": ["session.btn.clear"],
  "js/selectionMulti.js": ["selm.niveau.bouton", "selm.supprimer", "selm.tousDuType", "selm.valider"],
  "js/selectionZone.js": ["selm.niveau.ok", "selm.suppr.ok"],
  "js/sessionExporter.js": ["export.conv.dirData2edLabel", "export.conv.dirEd2dataLabel"],
  "js/sessionPersist.js": ["session.banner.exportBtn", "session.btn.clear", "session.btn.clearIci"],
  "js/shortcutsCheatsheet.js": ["cheatsheet.titre"],
  "js/sortieUrgence.js": ["sortie.brancard.titre", "sortie.btn.tracer"],
  "js/unlockGate.js": ["gate.docBtn", "gate.unlockBtn"],
  "js/utils.js": ["utils.note.save", "utils.popup.aRattacher.btn", "utils.popup.aRattacher.titre",
      "utils.scaleCoherence.copyBtn"]
};
const CLES_C4_TEXTE = ["convert.fermesTitre", "convert.recollerTitre", "histoire.pdf.empty.titre", "home.plans.offline.btnCompleter", "home.plans.offline.btnRetirer",
  "home.plans.offline.btnTelecharger", "home.profile.compteTitre", "ipr.result.hint", "ipr.result.step1",
  "profileio.done_sec_perPlanLs", "selm.suppr.fam.editorPoints", "selm.suppr.fam.roads", "selm.suppr.fam.structures",
  "selm.suppr.fam.zones", "selm.zone.prendre", "selm.zone.retour", "session.btn.clearEquipe"];

// ── 0. auto-test du classement (chaque sabotage doit rougir) ─────────────────────────────
{
  const un = (txt) => K.classerDoc(txt)[0] || {};
  t("auto-test : « 🧭 Tracker » → navigation", un("menu 🧭 Tracker").icone === "navigation");
  t("auto-test : « 🧭 Boussole » → compass", un("la tuile 🧭 Boussole").icone === "compass");
  t("auto-test : la variante U+FE0F est la même occurrence", K.classerDoc("⚙️ Réglages ⚙ Réglages").length === 2);
  const licorne = K.classerDoc("🦄 licorne");
  t("auto-test : un emoji inconnu est relevé, non classé", licorne.length === 1 && !licorne[0].icone &&
    !licorne[0].notion && !licorne[0].garde);
  t("auto-test : un repère prend l'icône de sa notion (💡 → lightbulb)", un("💡 Astuces").notion === "lightbulb");
  t("auto-test : une pastille de couleur reste en emoji", !!un("🟦 Eau").garde &&
    K.substituerDoc("🟦 Eau") === "🟦 Eau");
  t("auto-test : séquence ZWJ et drapeau = une occurrence chacun", K.classerDoc("🕵️‍♀️ 🇫🇷").length === 2);
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

  // Fenêtres d'outils de la carte et reste de l'interface : chaque emploi d'une clé migrée a son icône à côté (ligne
  // ou voisine).
  const c2Nus = [];
  const parFichier = {};
  [CLES_C2, CLES_C3, CLES_C4].forEach((tab) => Object.keys(tab).forEach((f) => { parFichier[f] = (parFichier[f] || []).concat(tab[f]); }));
  Object.keys(parFichier).forEach((f) => {
    const lignes = lire(f).split(/\r?\n/);
    parFichier[f].forEach((cle) => {
      let n = 0;
      lignes.forEach((l, i) => {
        if (l.indexOf("\"" + cle + "\"") < 0) return;
        n++;
        if (/\{ titre: /.test(l)) return;   // titre d'une alerte (ktaAlerte, texte seul)
        const autour = [lignes[i - 1] || "", l, lignes[i + 1] || ""].join("\n");
        if (!/ktaIcone\(|\bico: "|_ICO|ICONE|categoryIcon|_icoFiche\(|_poserIcone\(/.test(autour)) c2Nus.push(f + ":" + (i + 1) + " : « " + cle + " » sans icône");
      });
      if (!n) c2Nus.push(f + " : « " + cle + " » introuvable");
    });
  });
  t("1. fenêtres de la carte, vue 3D, Secours, barres, Vue OSM, Générateur… : libellés migrés rendus avec leur icône SVG",
    c2Nus.length === 0, c2Nus.join("\n   "));
  const c2Emoji = [];
  const clesC2 = Object.keys(parFichier).reduce((a, f) => a.concat(parFichier[f]), []).concat(CLES_C2_TEXTE, CLES_C3_TEXTE,
    CLES_C4_TEXTE);
  ["fr", "en", "es"].forEach((l) => {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    clesC2.forEach((cle) => {
      if (d[cle] === undefined) c2Emoji.push(l + " : " + cle + " absente");
      else if (EMO.test(String(d[cle]).replace(/<[^>]*>/g, ""))) c2Emoji.push(l + " : " + cle + " = " + d[cle]);
    });
  });
  t("1. dicos : les " + clesC2.length + " clés migrées des fenêtres et du reste de l'interface n'ont plus d'emoji " +
    "(fr, en, es)",
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
  // Lot C3 : boutons de la vue 3D (_bouton : flèches et signes du pavé exceptés), icônes génériques des confirmations
  // (kta-modal-icon, tous les modules), compteurs et voyants des barres du haut et du bas, cartes du tutoriel.
  const c3Emoji = [];
  const fautif = (f, re) => lire(f).split(/\r?\n/).forEach((l, i) => {
    const m = re.exec(l);
    if (m && EMO.test(m[1].replace(/[◀▶]/g, ""))) c3Emoji.push(f + ":" + (i + 1) + "  " + l.trim().slice(0, 100));
  });
  fautif("js/vue3d.js", /_bouton\([^,\n]+,\s*"[^"]*",\s*"([^"]*)"/);
  fs.readdirSync(path.join(RACINE, "js")).filter((f) => /\.js$/.test(f)).forEach((f) => {
    fautif("js/" + f, /class="kta-modal-icon"[^>]*>([^<]*)</);
  });
  fautif("js/refonteInterface.js", /class="kta-refonte-(?:counter|stat)-icon"[^>]*>([^<]*)</);
  fautif("js/tutorial.js", /\{ cle: "[^"]+",\s*(?:ico|emoji): "([^"]*)"/);
  t("1. vue 3D, confirmations, barres du haut et du bas, tutoriel : jamais un emoji d'icône (cliquet 0)",
    c3Emoji.length === 0, c3Emoji.join("\n   "));
  // Fin de la refonte : pastilles du bandeau du profil, lignes de l'export / import du profil et du rapport de
  // session, onglets du recalage, familles des fenêtres de la sélection multiple, familles et spéciaux des hauts
  // faits. Les médailles des rangs et des paliers (profileGamification.js, TIER_ICONS) restent des emoji : récompenses.
  const c4Emoji = [];
  const fautif4 = (f, re) => lire(f).split(/\r?\n/).forEach((l, i) => {
    const m = re.exec(l);
    if (m && EMO.test(m[1])) c4Emoji.push(f + ":" + (i + 1) + "  " + l.trim().slice(0, 100));
  });
  fautif4("js/homeProfile.js", /^\s*icon:\s*"([^"]*)"/);
  fautif4("js/homeProfile.js", /\bico: "([^"]*)"/);
  fautif4("js/profileExportImport.js", /_render(?:SectionRow|ImportSection)\("[^"]+",\s*"([^"]*)"/);
  fautif4("js/sessionReport.js", /_checkboxRow\("[^"]+",\s*"([^"]*)/);
  fautif4("js/recalageScan.js", /onglet\("[a-z]+", "([^"]*)"/);
  fautif4("js/selectionZone.js", /ICO_FAMILLE = \{([^}]*)\}/);
  fautif4("js/profileAchievements.js", /\{ id: "[a-z]+",\s*(?:ico|emoji): "([^"]*)"/);
  t("1. hauts faits : familles et spéciaux portent un nom d'icône SVG (ico)",
    (lire("js/profileAchievements.js").match(/\{ id: "[a-z]+",\s*ico: "[a-z0-9-]+"/g) || []).length === 14);
  t("1. profil, export / import du profil, rapport de session, recalage, sélection : jamais un emoji d'icône " +
    "(cliquet 0)", c4Emoji.length === 0, c4Emoji.join("\n   "));

  // Pied de page de l'accueil, crédits du splash, ConfAdmin : icônes posées par data-kta-ico, aucun emoji (les
  // encadrés et les <option> de ConfAdmin gardent leur texte).
  const zones = [/<div id="splashLeafletCredit"[^>]*>([\s\S]*?)<\/div>/,
    /<div class="kta-loader-credits kta-loader-contact">([\s\S]*?)<\/div>/,
    /<div class="kta-loader-credits">([\s\S]*?)<\/div>/];
  zones.forEach((re, i) => {
    const m = re.exec(html);
    const corps = m ? m[1].replace(/<!--[\s\S]*?-->/g, "") : "";
    t("1. index.html : pied de page / crédits n° " + (i + 1) + " en SVG (data-kta-ico), sans emoji",
      !!m && /data-kta-ico="/.test(corps) && !EMO.test(corps), m ? corps.trim().slice(0, 120) : "introuvable");
  });
  const CA = lire("confadmin.html");
  const caFautes = [];
  CA.split(/\r?\n/).forEach((l, i) => {
    const m = /<(?:h1|h2|button|th|summary|strong)\b[^>]*>([^<]*)/.exec(l);
    if (m && EMO.test(m[1])) caFautes.push("confadmin.html:" + (i + 1) + "  " + l.trim().slice(0, 100));
  });
  t("1. confadmin.html : titres, boutons, colonnes et rubriques en SVG (data-kta-ico), js/ktaIcones.js chargé",
    caFautes.length === 0 && /<script src="js\/ktaIcones\.js"><\/script>/.test(CA), caFautes.join("\n   "));

  // Lignes de Mes plans : l'icône du type de plan est un SVG (plan du site, d'extension, sur l'appareil).
  const HOME = lire("js/homeLoader.js");
  t("1. homeLoader.js : icône de type de plan en SVG, sans emoji",
    /let icon = window\.ktaIcone\(plan\.type === "server" \? "cloud"/.test(HOME) && !/let icon = [^\n]*["'][^"'\n]*[\p{Extended_Pictographic}]/u.test(HOME));
}

// ── 1 bis. fenêtres de la doc : aucun texte d'aide.* posé brut, crédits du pied en SVG ─────────────────────────────
// Un libellé aide.* posé par textContent échapperait à la substitution (§ 4 le croirait rendu en SVG) : seules les
// clés sans emoji (fr, en, es) peuvent l'être. Le pied de la fenêtre Documentation recopie les crédits de l'accueil :
// mêmes icônes, posées par ktaIcone.
{
  const DOCS = lire("js/interfaceDocs.js");
  const dicos = ["fr", "en", "es"].map((l) => JSON.parse(lire("lang/" + l + ".json")));
  const bruts = [];
  DOCS.split(/\r?\n/).forEach((l, i) => {
    const m = /textContent\s*=.*?I18n\.t\("(aide\.[^"]+)"/.exec(l);
    if (m && dicos.some((d) => EMO.test(String(d[m[1]] || "")))) bruts.push("js/interfaceDocs.js:" + (i + 1) + " " + m[1]);
  });
  t("1 bis. Aide : aucune clé aide.* à emoji posée en textContent (substitution obligatoire)", bruts.length === 0,
    bruts.join("\n   "));
  const pied = /class="kta-readme-modal-footer">([\s\S]*?)<\/div>/.exec(DOCS);
  const corpsPied = pied ? pied[1].replace(/<!--[\s\S]*?-->/g, "") : "";
  t("1 bis. Documentation : crédits du pied de fenêtre en SVG (ktaIcone), sans emoji",
    !!pied && (corpsPied.match(/ktaIcone\("/g) || []).length === 7 && !EMO.test(corpsPied), corpsPied.trim().slice(0, 120));
}

// ── 2. noms connus ─────────────────────────────
{
  // Le module lui-même cite `data-kta-ico="nom"` dans son en-tête : hors balayage.
  const sources = fs.readdirSync(path.join(RACINE, "js")).filter((f) => /\.js$/.test(f) && f !== "ktaIcones.js")
    .map((f) => "js/" + f).concat(["index.html", "confadmin.html"]);
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
  const mauvais = K.DOC.concat(K.REPERES).filter((r) => !r.e || !K.existe(r.i)).map((r) => r.e + " → " + r.i);
  t("3. chaque règle DOC et REPERES pointe vers une icône existante", mauvais.length === 0, mauvais.join(", "));
  const gardeMuette = K.GARDE.filter((r) => !r.e || !r.s).map((r) => r.e);
  t("3. chaque exception GARDE dit sa raison", gardeMuette.length === 0, gardeMuette.join(", "));
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
    // Aide intégrée et cartes du tutoriel : substituées au rendu (interfaceDocs.js, tutorial.js > _renderCard).
    const morceaux = Object.keys(dico).filter((k) => /^aide\.|^tutorial\.card\./.test(k)).map((k) => {
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
        (comptes[o.emoji] = { svg: 0, notion: 0, reste: 0, fr: [0, 0, 0], en: [0, 0, 0], es: [0, 0, 0] });
      if (o.icone || o.notion || o.garde) c[langue][o.icone ? 0 : (o.notion ? 1 : 2)]++;
      if (o.icone) { c.svg++; return; }
      if (o.notion) { c.notion++; return; }
      if (o.garde) { c.reste++; return; }
      const ligne = mc.cle ? mc.ligne : mc.texte.slice(0, o.debut).split("\n").length;
      const voisin = mc.texte.slice(Math.max(0, o.debut - 30), o.fin + 40).replace(/\s+/g, " ");
      orphelins.push(src.fichier + ":" + ligne + (mc.cle ? " (" + mc.cle + ")" : "") + "  …" + voisin + "…");
    });
  }));
  t("4. doc : chaque emoji est substitué (bouton ou notion) ou gardé par une exception listée (" +
    orphelins.length + " non classé(s))", orphelins.length === 0, orphelins.slice(0, 400).join("\n   "));
  // 5. CLIQUET des exceptions : ce qui reste en emoji dans la doc (GARDE : pastilles de couleur des types et des
  // statuts du Secours, flèches du pavé, ↔ et ©, POI du catalogue, type Inaccessible) est figé par emoji, trois
  // guides et aide.* / tutorial.card.* des trois langues additionnés. Une hausse échoue : une phrase nouvelle qui
  // garderait son emoji doit être voulue (règle REPERES si c'est une notion, sinon plafond relevé ici en connaissance
  // de cause) ; une baisse se reporte ici. Clés sans U+FE0F (forme rendue par classerDoc).
  // Recalcul : node scripts/check-icones-ui.js --plafond
  const PLAFOND_RESTE = {
    "©": 3, "🚪": 6, "⚠": 12, "◀": 12, "▶": 12, "⛔": 54, "🟦": 15, "🟩": 6, "🟪": 6, "🟨": 12, "⬛": 9, "🟥": 6,
    "🟡": 9, "🟠": 12, "🔵": 9, "🟧": 6, "↔": 6, "🟢": 3, "🟣": 3, "⚪": 3
  };
  if (process.argv.indexOf("--plafond") >= 0) {
    console.log(JSON.stringify(Object.keys(comptes).filter((e) => comptes[e].reste)
      .reduce((o, e) => { o[e] = comptes[e].reste; return o; }, {})));
  }
  const ecartsReste = [];
  Object.keys(comptes).concat(Object.keys(PLAFOND_RESTE)).filter((e, i, a) => a.indexOf(e) === i).forEach((e) => {
    const n = comptes[e] ? comptes[e].reste : 0, p = PLAFOND_RESTE[e] || 0;
    if (n > p) ecartsReste.push(e + " : " + n + " emplois gardés en emoji pour " + p + " figés → donner une icône " +
      "au nouvel emploi (règle REPERES ciblée) ou relever le plafond si l'exception est voulue");
    else if (n < p) ecartsReste.push(e + " : " + n + " < " + p + " figés → reporter " + n + " dans PLAFOND_RESTE");
  });
  t("5. doc : emoji gardés en emoji figés (cliquet, aucune exception nouvelle en silence)",
    ecartsReste.length === 0, ecartsReste.join("\n   "));
  if (LISTE) {
    // Les trois langues décrivent la même chose : un écart de SVG entre elles trahit un motif mal traduit.
    Object.keys(comptes).forEach((e) => {
      const c = comptes[e], ecart = c.fr[0] !== c.en[0] || c.fr[0] !== c.es[0];
      console.log("   " + e + "  bouton " + c.svg + " · notion " + c.notion + " · emoji " + c.reste +
        "   (fr/en/es bouton " + c.fr[0] + "/" + c.en[0] + "/" + c.es[0] + ", notion " + c.fr[1] + "/" + c.en[1] +
        "/" + c.es[1] + ")" + (ecart ? "  ≠" : ""));
    });
  }
}

// ── 6. textes hors doc : pas d'emoji d'un bouton passé en SVG ─────────────────────────────
// Toasts, encadrés, astuces, alertes, infobulles, titres : un emoji que classerDoc substituerait (icône d'un bouton
// migré) y montrerait l'ancien dessin ; le texte nomme le bouton sans icône (« Réglages → Géoréférencement GPS »).
// Balayage des trois dicos ENTIERS, hors aide.* et tutorial.card.* (doc substituée au rendu, § 4) et hors CLES_SORTIE
// (texte écrit dans un fichier ou un rapport produit, nom donné à un objet créé). Un emploi rangé AUTRE_SENS (autre
// notion) passe. Ce qui reste est figé par emoji, trois langues additionnées (PLAFOND_DICOS, cliquet) : toute hausse
// échoue, une baisse se reporte ici. Recalcul : --plafond. Reste : ⛑ de lost.alert.confirmOk, qui cite le nom donné
// au point créé (« ⛑️ Position probable », lost.point.nom).
{
  const CLES_SORTIE = /^(?:imgexport\.legSection\.|lost\.report\.|lost\.point\.nom$|secours\.txt\.|secours\.lost\.notesIntro$)/;
  const PLAFOND_DICOS = {
    "⛑": 3
  };
  const parEmoji = {}, detail = {};
  ["fr", "en", "es"].forEach((l) => {
    const d = JSON.parse(lire("lang/" + l + ".json"));
    Object.keys(d).forEach((cle) => {
      if (/^aide\.|^tutorial\.card\./.test(cle) || /^_/.test(cle) || CLES_SORTIE.test(cle)) return;
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
