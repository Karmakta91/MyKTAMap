// =====================================================================
// check-etat-visible.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Un état qui n'existe que dans une modale fermée n'existe pas pour
// l'utilisateur. Vérifie que chaque état est visible DEPUIS LA CARTE : pastille
// de filtres sur ≡, pas + distance dans le footer, étapes de l'itinéraire
// redessinées après rechargement, « enregistré il y a », toasts (tracker masqué
// par un niveau, verrou sur tracé suspendu), wake lock proposé au démarrage.
// 🩸 Ce qui régresse sans bruit : un `majBadge()` retiré d'un chemin, le
// redessin des étapes oublié en phase 2, un toast supprimé — l'app marche,
// l'utilisateur ne sait plus.
// Usage : node scripts/check-etat-visible.js [racine]
// 🏷️ REPÈRES DE DÉCOUPE : du CODE (nom de fonction, instruction) ou un
// marqueur explicite `// 🏷️ ancre:<nom>` posé dans la source, jamais un
// commentaire libre ni un tag de version (un nettoyage les retirerait).
// Repère introuvable = ÉCHEC, jamais une découpe jusqu'à la fin du fichier.
"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const lire = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
let echecs = 0;
function ok(m)  { console.log("✅ " + m); }
function ko(m)  { console.log("❌ " + m); echecs++; }
function verif(c, m) { (c ? ok : ko)(m); }
function bloc(src, debut, fin) {
  const i = src.indexOf(debut);
  const j = (i >= 0 && fin) ? src.indexOf(fin, i + debut.length) : -1;
  if (i < 0 || (fin && j < 0)) {
    ko("repère de découpe introuvable : « " + (i < 0 ? debut : fin).split("\n")[0] + " »");
    return "";
  }
  return src.slice(i, fin ? j : undefined);
}

// ── Filtres ──────────────────────────────────────────────────────────
{
  const s = lire("js/filterPanel.js");
  verif(/function majBadge\(\)/.test(s) && /function _nbFiltresActifs\(\)/.test(s) && /function _niveauxFiltres\(\)/.test(s), "filtres : pastille (majBadge / nbActifs / niveaux) définie");
  const notify = bloc(s, "function _notify() {", "function _scheduleApply");
  verif(notify.includes("majBadge()"), "🩸 chaque changement de filtre met la pastille à jour (_notify)");
  // ⚠️ La pastille est un POINT, sans chiffre : un compte de catégories filtrées
  // se lit à tort comme un compte d'objets masqués (décision produit).
  verif(/kta-filter-ctrl-actif/.test(s) && /setAttribute\("data-filtre-actif", "1"\)/.test(s),
        "pastille : classe + marqueur sur le bouton ≡");
  verif(!/setAttribute\("data-count"/.test(s), "🩸 le chiffre n'est pas revenu (il mesurait les catégories, pas les objets masqués)");
  verif(/filter\.badge\.actifs/.test(s) && /filter\.badge\.aucun/.test(s),
        "🩸 le compte reste lisible dans l'infobulle du bouton (rien n'est perdu, seul l'affichage change)");
  const status = bloc(s, "function _updateStatus() {", "function _onKey");
  verif(status.includes("_niveauxFiltres()") && status.includes("filter.status.levels"), "🩸 le statut compte les NIVEAUX (plus de « Aucun filtre actif » mensonger)");
  const reset = bloc(s, 'document.getElementById("kta-fp-reset-all")', "_refreshChipsState(overlay);");
  verif(reset.includes("visibleLevels = avail.slice()") && reset.includes("appliquerFiltreNiveau"), "🩸 « Tout afficher » remet aussi les niveaux");
  verif(/majBadge:\s*majBadge/.test(s), "FilterPanel.majBadge exposé");
  const css = lire("css/style.css");
  {
    const bloc = css.slice(css.indexOf(".kta-filter-ctrl a.kta-filter-ctrl-actif::after"), css.indexOf(".kta-filter-ctrl a.kta-filter-ctrl-actif::after") + 500);
    verif(/content: ""/.test(bloc) && /border-radius: 50%/.test(bloc) && !/attr\(data-count\)/.test(css),
          "CSS : la pastille est un point plein (le compteur ne revient pas)");
  }
}

// ── Restauration : toast filtres + étapes d'itinéraire ───────────────
{
  const s = lire("js/sessionPersist.js");
  const rf = bloc(s, "restored.runtimeFilters = _active.length;", "// 🏷️ ancre:verrous-calques-restaures");
  verif(rf.includes("session.toast.filtresRestaures") && rf.includes("FilterPanel.majBadge"), "🩸 filtres restaurés au rechargement → toast + pastille");
  const p2 = bloc(s, "window.setRoads(current.concat(phaseDifferee));", "}, 1500);");
  verif(p2.includes("itineraireRedessinerDepuisRoad"), "🩸 phase 2 : les étapes de l'itinéraire sont redessinées");
  verif(/function getLastSaveInfo\(\)/.test(s) && /getLastSaveInfo:\s*getLastSaveInfo/.test(s), "Q46 : SessionPersist.getLastSaveInfo exposé");
  verif(/_lastSaveTs = Date\.now\(\);/.test(s) && /_lastSaveKo = true;/.test(s), "Q46 : horodatage du dernier save, échec mémorisé");
  verif(/function _trModule\(/.test(s) && !/txt\.textContent = _t\(/.test(s), "🩸 B5 : le bandeau utilise un traducteur de portée MODULE (pas le _t local d'une autre fonction)");
}
{
  const s = lire("js/interfaceItineraire.js");
  const f = bloc(s, "window.itineraireRedessinerDepuisRoad = function", "};");
  verif(f.includes('r.type === "itinerary"') && f.includes("_itineraryWaypoints = road.waypoints.map") && f.includes("_ajouterWaypointVisuel(p, i + 1)"),
        "🩸 itineraireRedessinerDepuisRoad reconstruit les waypoints depuis la road et les redessine");
}

// ── Tracker masqué par niveau ────────────────────────────────────────
{
  const s = lire("js/tracking.js");
  const f = bloc(s, "function _appliquerFiltreNiveauSurTracker() {", "window._applyLevelFilterToTracker");
  verif(f.includes("tracker.toast.masqueNiveau") && f.includes("_trackerMasqueParNiveau"), "🩸 tracker masqué par un niveau → toast (une fois par bascule)");
}

// ── interface.js : verrou, wake lock, menu Tracker ───────────────────
{
  const s = lire("js/interface.js");
  const susp = bloc(s, "function _suspendreVerrou(ms) {", "function _reactiverVerrou()");
  verif(susp.includes("tracker.verrou.toastSuspendu") && susp.includes("tracker.verrou.toastSuspenduInfini"), "🩸 suspendre le verrou → toast (durée / jusqu'à réactivation)");
  const react = bloc(s, "function _reactiverVerrou() {", "function _confirmerReactivationVerrou");
  verif(react.includes("tracker.verrou.toastReactive"), "🩸 réactivation du verrou → toast");
  const init = bloc(s, "function initInterface() {", "// 🏷️ ancre:reset-modes-plan");
  verif(init.includes("_verrouSuspendu = false;") && init.includes("_verrouFinTs = 0;"), "🩸 la suspension du verrou est oubliée au chargement d'un plan");
  const warn = bloc(s, "function _afficherAvertissementTracker(onConfirm) {", "document.documentElement.appendChild(overlay);");
  verif(warn.includes('id="kta-tracker-warn-wake"') && warn.includes("WakeLock.isSupported()") && warn.includes("!window.WakeLock.isEnabled()"), "🩸 modale de démarrage : case « garder l'écran allumé » (si supporté, pas déjà actif)");
  const okBtn = bloc(s, 'document.getElementById("kta-tracker-warn-ok").addEventListener("click"', "try { onConfirm(); }");
  verif(okBtn.includes("WakeLock.setEnabled(true)"), "🩸 « J'ai compris » active le wake lock depuis le geste utilisateur");
  verif(/window\.ouvrirMenuTracker = function/.test(s), "Q11 : ouvrirMenuTracker exposé");
}

// ── refonteInterface.js : footer et Détails ──────────────────────────
{
  const s = lire("js/refonteInterface.js");
  verif(/id="kta-refonte-stat-tracker"/.test(s) && /kta-refonte-stat-tracker-off kta-refonte-stat-clickable/.test(s), "chip 🧭 du footer cliquable");
  verif(/trackerStat\.addEventListener\("click"/.test(s) && /window\.ouvrirMenuTracker\(\)/.test(s), "🩸 tap sur le chip 🧭 → menu Tracker");
  const rs = bloc(s, 'const trackerEl = document.getElementById("kta-refonte-stat-tracker");', "function _setStat");
  verif(rs.includes("getStepCount") && rs.includes("getTrackingDistanceTotaleM") && rs.includes("👣"), "🩸 le chip affiche pas + distance quand le suivi est actif");
  verif(rs.includes("FilterPanel.majBadge"), "🩸 le polling du footer rafraîchit la pastille de filtres (changements de niveau externes)");
  verif(/function _ligneDerniereSauvegarde\(\)/.test(s) && /html \+= _ligneDerniereSauvegarde\(\);/.test(s), "🩸 📊 Détails : ligne « enregistré il y a » en tête");
}

// ── i18n ─────────────────────────────────────────────────────────────
for (const lang of ["fr", "en", "es"]) {
  const d = JSON.parse(lire("lang/" + lang + ".json"));
  const manq = ["filter.status.levels", "session.toast.filtresRestaures", "ui.refonte.save_ok", "ui.refonte.save_ko", "ui.refonte.save_never",
    "tracker.toast.masqueNiveau", "tracker.verrou.toastSuspendu", "tracker.verrou.toastSuspenduInfini", "tracker.verrou.toastReactive",
    "ui.trackerWarn.wakeLock"].filter(k => typeof d[k] !== "string");
  verif(manq.length === 0, "🌍 " + lang + " : clés du lot présentes" + (manq.length ? " — " + manq.join(", ") : ""));
  verif(!/GPS/.test(d["ui.refonte.tracker_on_title"] || "GPS"), "🌍 " + lang + " : le voyant ne dit plus « Tracking GPS » (app sans GPS)");
}

console.log("");
if (echecs) { console.log("💥 état visible : " + echecs + " contrôle(s) en échec"); process.exit(1); }
console.log("🎉 état visible : ce que l'app sait, l'utilisateur le voit depuis la carte");
