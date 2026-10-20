// =====================================================================
// check-filets-donnees.js — BLOQUANT (pré-commit) : chaque action destructive garde son filet (snapshot
// attendu, confirmation chartée, entrée d'historique, verrou temporisé plutôt que définitif).
// 🩸 Ce qui régresse sans bruit :
//   1. un filet qui saute au refactor (import qui écrase avant le snapshot, « Effacer la session » en un
//      tap, suppression hors historique) : la perte de données arrive plus tard, sans lien visible ;
//   2. le verrou DÉFINITIF qui revient (`isLockedOut()` sur un compteur au lieu d'une échéance, écran qui
//      ne rappelle plus la gate) : l'app devient morte sous terre (jamais de verrou définitif, décision produit) ;
//   3. un `splice` dans toggleZoneMode / toggleStructureMode hors de la fonction de résolution.
// Usage : node scripts/check-filets-donnees.js [racine] (autre racine = falsifier sur une copie).
// ⚠️ Repères de découpe : du CODE ou un
// marqueur explicite `// 🏷️ ancre:<nom>` posé dans la source, jamais un
// commentaire libre (un nettoyage le retirerait). Repère introuvable = ÉCHEC.
"use strict";
const fs   = require("fs");
const path = require("path");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

let echecs = 0;
function ok(msg)  { console.log("✅ " + msg); }
function ko(msg)  { console.log("❌ " + msg); echecs++; }
function verif(cond, msg) { (cond ? ok : ko)(msg); }
function bloc(src, debut, fin) {
  const i = src.indexOf(debut);
  const j = (i >= 0 && fin) ? src.indexOf(fin, i + debut.length) : -1;
  if (i < 0 || (fin && j < 0)) {
    ko("repère de découpe introuvable : « " + (i < 0 ? debut : fin).split("\n")[0] + " »");
    return "";
  }
  return src.slice(i, fin ? j : undefined);
}

// ── B3 : import de session ──────
{
  const s = lire("js/interfaceImportExport.js");
  const iSnap = s.indexOf('snapshot("before-import-session")');
  const iSet  = s.indexOf("window.setEditorPoints(dataParsee.editorPoints");
  verif(iSnap > 0, "🩸 import de session : snapshot « before-import-session » présent");
  verif(iSnap > 0 && iSet > iSnap, "🩸 import de session : le snapshot est déclenché AVANT l'écrasement des points");
  verif(/_snapAvant\.then\(/.test(s), "🩸 import de session : l'écrasement attend la promesse du snapshot");
  verif(s.includes("impexp.session.toastSnapshot"), "import de session : toast « ancienne session dans Backups »");
}

// ── Q44 + B5 : sessionPersist ──────
{
  const s = lire("js/sessionPersist.js");
  const clearBtn = bloc(s, "modal.querySelector('[data-action=\"clear\"]')", "modal.addEventListener(\"click\"");
  // Confirmation = SEUL chemin vers go() (hors repli « helper absent ») : garde exacte ET appel conditionné
  // (une branche morte `if (false)` contenant le texte ne doit pas suffire). Deux formes : confirmation simple, et
  // choix « cet appareil / rendre à l'équipe » quand la restitution des calques se partage.
  verif(clearBtn.includes('if (typeof window.ktaConfirm === "function") {') &&
        /window\.ktaConfirm\(msg, \{[\s\S]*?\}\)\.then\(function\(ok\) \{ if \(ok\) go\(false\); \}\);/.test(clearBtn) &&
        /window\.ktaConfirm\(msg \+ [\s\S]*?\}\)\.then\(function\(choix\) \{ if \(choix\) go\(choix === "equipe"\); \}\);/
          .test(clearBtn),
        "🩸 « Effacer la session » passe par ktaConfirm (garde exacte + go() conditionné)");
  verif(clearBtn.includes('snapshot("before-clear-session")') && clearBtn.includes("snapshotFait: true"),
        "🩸 « Effacer la session » : snapshot attendu, puis clear({ snapshotFait })");
  verif(/function clear\(opts\)[\s\S]*?opts\.snapshotFait/.test(s), "clear(opts) respecte snapshotFait (pas de double snapshot)");
  verif(/function _compterEtatCourant\(/.test(s) && clearBtn.includes("session.confirm.clear"), "confirmation chiffrée (points / tracés / zones / structures)");
  verif(/function _afficherBandeauStockage\(/.test(s) && /function _masquerBandeauStockage\(/.test(s), "B5 : bandeau « sauvegarde impossible » défini");
  // Sessions en IndexedDB : réussite confirmée en asynchrone ; le bandeau tombe dans _ecritureReussie,
  // appelée par save() (localStorage) ET par l'écouteur de résultat IndexedDB.
  const reussie = bloc(s, "function _ecritureReussie() {", "}");
  const save = bloc(s, "S.ecrire(_currentPlanId, JSON.stringify(payload)", "return true;");
  const resultat = bloc(s, "window.KtaSessionStore.surResultat(function(r) {", "});");
  verif(reussie.includes("_masquerBandeauStockage()") && save.includes("_ecritureReussie()") &&
        /if \(r\.ok\) \{ _ecritureReussie\(\); return; \}/.test(resultat),
        "🩸 B5 : le bandeau tombe au premier save réussi (localStorage et IndexedDB)");
  verif(/if \(isQuota\) _afficherBandeauStockage\(\);/.test(s), "🩸 B5 : le bandeau s'affiche à CHAQUE échec de quota (pas seulement le premier)");
}

// ── Q23 : suppression d'un point ──────
{
  const s = lire("js/editor.js");
  const b = bloc(s, "window.supprimerPointEditor = function", "console.log(\"[Editor] Point supprimé");
  verif(b.includes('captureState("editorPoints")') && b.includes("HistoryManager.record("), "🩸 supprimer un point écrit dans l'historique");
  verif(b.includes("editor.toast.pointSupprime"), "supprimer un point : toast qui dit comment annuler");
}

// ── Q24 / Q25 : zones et structures ──────
{
  const z = lire("js/zones.js");
  verif(/function _resoudreZoneEnCours\(/.test(z), "zones : fonction de résolution de la zone en cours");
  const tz = bloc(z, "function toggleZoneMode(", "console.log(\"[Zones] Mode");
  verif(tz.length > 0 && !tz.includes("splice("), "🩸 toggleZoneMode ne détruit plus rien directement (aucun splice)");
  verif(tz.includes("_resoudreZoneEnCours()"), "toggleZoneMode passe par la résolution (fermer si ≥ 3, sinon abandon)");
  const rz = bloc(z, "function _resoudreZoneEnCours(", "function toggleZoneMode(");
  verif(rz.includes("points.length >= 3") && rz.includes("history.action.closeZone") && rz.includes("history.action.abandonZone"),
        "🩸 résolution zone : ≥ 3 sommets → fermée + historisée, sinon abandon historisé");
  const st = lire("js/structures.js");
  verif(/function _resoudreStructureEnCours\(/.test(st), "structures : fonction de résolution");
  const ts = bloc(st, "function toggleStructureMode(", "// 🏷️ ancre:fin-toggle-structure");
  verif(ts.length > 0 && !ts.includes("splice("), "🩸 toggleStructureMode ne détruit plus rien directement");
  const rs = bloc(st, "function _resoudreStructureEnCours(", "function toggleStructureMode(");
  verif(rs.includes("struct.undo.close") && rs.includes("struct.undo.abandon"), "résolution structure : validation ou abandon, les deux historisés");
  const itf = lire("js/interface.js");
  const okZ = bloc(itf, "const ok = window.fermerZoneEnCours();", "if (!ok) {");
  verif(okZ.includes("HistoryManager.record(") && okZ.includes("_fermerModeZone"), "🩸 bouton ✅ zone : historique + outil éteint (même chemin que le re-clic)");
  const okS = bloc(itf, "const ok = window.fermerStructureEnCours();", "if (!ok) {");
  verif(okS.includes("HistoryManager.record(") && okS.includes("_fermerModeStructure"), "🩸 bouton ✅ structure : historique + outil éteint");
}

// ── Q45 : snapshots ──────
{
  const s = lire("js/refonteInterface.js");
  const rm = bloc(s, 'listEl.querySelectorAll("[data-backup-remove]")', "}).catch(function(err) {");
  verif(rm.includes("ktaConfirm(") && rm.includes("ui.refonte.confirm_remove_snapshot"), "🩸 supprimer un snapshot demande confirmation");
  const backups = bloc(s, 'listEl.querySelectorAll("[data-backup-restore]")', "_renderBackupsSection();\n\n");
  verif(!/window\.confirm\(/.test(backups), "restaurer / tout vider : plus de confirm() natif dans la section backups");
}

// ── Q47 : export ──────
{
  const s = lire("js/sessionExporter.js");
  verif(/trackerLen === 0 && !hasNoteLibre/.test(s), "🩸 export Full : une sortie tracker-seule n'est pas « vide »");
  verif(s.includes("export.full.structures") && s.includes("export.full.tracker"), "export Full : le résumé affiche structures + points du suivi");
}

// ── B6 / Q58 / Q49 : Réglages ──────
{
  const s = lire("js/interfaceConfig.js");
  const reset = bloc(s, "function resetConfig() {", "function _resetConfigExecuter() {");
  verif(reset.includes("ktaConfirm(") && reset.includes("config.confirm.reset"), "🩸 Reset des Réglages demande confirmation (parcours du suivi effacé)");
  verif(/function _resetConfigExecuter\(\) \{[\s\S]*?resetTrackingPosition/.test(s), "Reset : l'exécution reste dans _resetConfigExecuter");
  verif(s.includes("config.georef.confirmClear") && /function _executerClear\(/.test(s), "🩸 effacer un géoréférencement persisté demande confirmation");
  // L'interrupteur du carnet (réglage global) vit dans la Configuration de l'ACCUEIL et y est câblé.
  const idx = lire("index.html");
  const home = lire("js/homeConfig.js");
  verif(idx.includes('id="loaderJournalCb"') && home.includes("window.Journal.setEnabled("),
        "🩸 réglage « carnet des sorties » présent à l'accueil et câblé sur Journal.setEnabled");
  verif(!s.includes('id="cfg_journal"'), "réglage carnet : plus de doublon dans les Réglages du plan");
  verif(s.includes("config.globaux.carnet"), "réglage carnet : son état reste LISIBLE depuis un plan (« Réglés depuis l'accueil »)");
}

// ── Q59 : générateur ──────
{
  const s = lire("js/createConf.js");
  verif(/const _fermerPlanner = function/.test(s) && s.includes('"kta-planner-close").addEventListener("click", _fermerPlanner)') && s.includes('"kta-planner-annuler").addEventListener("click", _fermerPlanner)'),
        "🩸 générateur : ✕ et Annuler passent par _fermerPlanner (confirmation si un champ a bougé)");
  verif(s.includes("gen.confirm.abandon") && /const _formTouche = function/.test(s), "générateur : détection « champ touché »");
  const apres = bloc(s, "const _fermerPlanner = function", "// 🏷️ ancre:fin-fermer-planner");
  verif(!apres.includes("if (e.target === modal) modal.remove()"), "🩸 générateur : le clic sur le fond ne ferme plus la modale");
}

// ── B4 : Tout réinitialiser ──────
{
  const s = lire("js/interfaceMaintenance.js");
  const items = ["cache", "maps", "session", "prefs", "photos", "journal", "backups", "profile", "secours"]
    .filter(k => !s.includes('maint.reset_item_' + k));
  verif(items.length === 0, "🩸 « Tout réinitialiser » liste les 9 postes" + (items.length ? " — manquants : " + items.join(", ") : ""));
  verif(s.includes("cache-export-profil") && s.includes("ProfileExportImport.ouvrirExportModale"), "« Tout réinitialiser » propose l'export de profil AVANT");
}

// ── M2 : verrou temporisé (PIN + gate) ──────
{
  const p = lire("js/pinLock.js");
  verif(/const LOCK_DELAYS_MS\s*=\s*\[/.test(p), "PIN : paliers LOCK_DELAYS_MS déclarés");
  const lo = bloc(p, "function isLockedOut() {", "function getLockRemainingMs");
  verif(lo.includes("lockUntil") && !/>=\s*MAX_ATTEMPTS/.test(lo), "🩸 PIN : isLockedOut = échéance dans le futur, plus un compteur");
  verif(lo.includes("lockStart") , "PIN : horloge reculée sous le début du verrou → toujours verrouillé");
  const fail = bloc(p, "// 🏷️ ancre:pin-tentative-ratee", "return false;");
  verif(fail.includes("state.lockUntil = state.lockStart + delai") && fail.includes("state.attempts  = 0"), "🩸 PIN : 5 échecs → échéance posée, palier +1, compteur remis à 0");
  verif((p.match(/_afficherLockoutUI\(onUnlock\)/g) || []).length >= 2, "🩸 PIN : l'écran de verrou reçoit le callback de déverrouillage (×2 appels)");
  const lock = bloc(p, "function _afficherLockoutUI(onUnlock) {", "// 🏷️ ancre:pin-fin-lockout-ui");
  verif(lock.includes("setInterval(") && lock.includes("_afficherGateUI(onUnlock)"), "🩸 PIN : compte à rebours + retour automatique au pavé à l'expiration");
  verif(!lock.includes("pin.lockout.solReinstall"), "PIN : l'écran de verrou ne prêche plus « réinstalle l'app »");
  const okPin = bloc(p, "if (candidate === state.hashedPin) {", "return true;");
  verif(okPin.includes("delete state.lockUntil") && okPin.includes("state.lockLevel = 0"), "PIN : un code juste remet palier et échéance à zéro");

  const g = lire("js/unlockGate.js");
  verif(/const LS_LOCK\s*=/.test(g) && /const LOCK_DELAYS_MS\s*=\s*\[/.test(g), "gate : LS_LOCK + paliers déclarés");
  const glo = bloc(g, "function isLockedOut() {", "// 🏷️ ancre:gate-fin-isLockedOut");
  verif(glo.includes(".until") && !/>=\s*MAX_ATTEMPTS/.test(glo), "🩸 gate : isLockedOut = échéance, plus un compteur");
  const gfail = bloc(g, "if (attempts >= MAX_ATTEMPTS) {", "} else {");
  verif(gfail.includes("_setLock({ until: now + delai") && gfail.includes("_setAttempts(0)"), "🩸 gate : 5 échecs → échéance posée, compteur remis à 0");
  const glock = bloc(g, "function _afficherLockout(overlay) {", "if (fb) {");
  verif(glock.includes("setInterval(") && glock.includes("_monterGate()"), "🩸 gate : compte à rebours + remontage de la gate à l'expiration");
  verif(/localStorage\.removeItem\(LS_LOCK\)/.test(g), "gate : un code juste efface le verrou");
}

// ── i18n ──────
for (const lang of ["fr", "en", "es"]) {
  const dico = JSON.parse(lire("lang/" + lang + ".json"));
  const manquantes = ["impexp.session.toastSnapshot", "editor.undo.deletePoint", "editor.toast.pointSupprime",
    "history.action.abandonZone", "zones.toast.fermee", "zones.toast.abandon", "struct.undo.abandon", "struct.toast.fermee",
    "struct.toast.abandon", "session.confirm.clear", "session.confirm.clearTitle", "session.toast.clearedSnap",
    "session.banner.storageFull", "session.banner.exportBtn", "ui.refonte.confirm_remove_snapshot", "export.full.structures",
    "export.full.tracker", "config.confirm.reset", "config.georef.confirmClear", "config.journal.label",
    "gen.confirm.abandon", "maint.reset_item_photos", "maint.reset_item_journal", "maint.reset_item_backups",
    "maint.reset_item_profile", "maint.reset_item_secours", "maint.btn_export_profile_first", "pin.err.lockoutTemp",
    "pin.lockout.attente", "pin.lockout.escalade", "gate.lockout.attente"]
    .filter(k => typeof dico[k] !== "string");
  verif(manquantes.length === 0, "🌍 " + lang + " : clés du lot présentes" + (manquantes.length ? " — manquantes : " + manquantes.join(", ") : ""));
}

console.log("");
if (echecs) {
  console.log("💥 filets de données : " + echecs + " contrôle(s) en échec");
  process.exit(1);
}
console.log("🎉 filets de données : chaque action destructive a son filet, et aucun verrou n'est définitif");
