// =====================================================================
// 👁️ check-etat-visible.js — garde-fou pré-commit BLOQUANT
// =====================================================================
// Lot 4 « État visible » de l'audit ergonomie (13/09/2026). Le pattern T7 de
// l'audit : un état qui n'existe que dans une modale fermée n'existe pas pour
// l'utilisateur. Chaque item ci-dessous rend un état visible DEPUIS LA CARTE :
// pastille de filtres sur ≡, pas + distance dans le footer, étapes de
// l'itinéraire redessinées après un rechargement, « enregistré il y a »,
// toasts quand le tracker est masqué par un niveau ou quand le verrou sur
// tracé est suspendu, wake lock proposé au démarrage du suivi.
//
// CE QUI RÉGRESSE SANS BRUIT : un appel de `majBadge()` retiré d'un chemin,
// le redessin des étapes oublié dans la phase 2, un toast supprimé « parce
// qu'il gênait un test » — l'app marche toujours, l'utilisateur ne sait plus.
//
// Usage : node scripts/check-etat-visible.js [racine]
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
  const i = src.indexOf(debut); if (i < 0) return "";
  const j = fin ? src.indexOf(fin, i + debut.length) : -1;
  return src.slice(i, j < 0 ? undefined : j);
}

// ---------- Q34 / Q35 : filtres ----------
{
  const s = lire("js/filterPanel.js");
  verif(/function majBadge\(\)/.test(s) && /function _nbFiltresActifs\(\)/.test(s) && /function _niveauxFiltres\(\)/.test(s), "filtres : pastille (majBadge / nbActifs / niveaux) définie");
  const notify = bloc(s, "function _notify() {", "function _scheduleApply");
  verif(notify.includes("majBadge()"), "🩸 chaque changement de filtre met la pastille à jour (_notify)");
  // 🔵 14/09/2026 (KARMA) : le chiffre est devenu un POINT. Il comptait les
  // catégories filtrées, pas les objets masqués — il mesurait autre chose que
  // ce qu'on lisait. On vérifie la classe, le marqueur, et qu'AUCUN compte
  // n'est réécrit dans le DOM.
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
    // 🔵 La pastille est un POINT depuis le 14/09/2026 : plus de compteur à
    // vérifier, mais une forme ronde et un contenu vide.
    const bloc = css.slice(css.indexOf(".kta-filter-ctrl a.kta-filter-ctrl-actif::after"), css.indexOf(".kta-filter-ctrl a.kta-filter-ctrl-actif::after") + 500);
    verif(/content: ""/.test(bloc) && /border-radius: 50%/.test(bloc) && !/attr\(data-count\)/.test(css),
          "CSS : la pastille est un point plein (le compteur ne revient pas)");
  }
}

// ---------- restauration : toast filtres + étapes d'itinéraire ----------
{
  const s = lire("js/sessionPersist.js");
  const rf = bloc(s, "restored.runtimeFilters = _active.length;", "// 🔄 v1.85.0");
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

// ---------- Q16 : tracker masqué par niveau ----------
{
  const s = lire("js/tracking.js");
  const f = bloc(s, "function _appliquerFiltreNiveauSurTracker() {", "window._applyLevelFilterToTracker");
  verif(f.includes("tracker.toast.masqueNiveau") && f.includes("_trackerMasqueParNiveau"), "🩸 tracker masqué par un niveau → toast (une fois par bascule)");
}

// ---------- Q17 / Q9 / Q11 : interface.js ----------
{
  const s = lire("js/interface.js");
  const susp = bloc(s, "function _suspendreVerrou(ms) {", "function _reactiverVerrou()");
  verif(susp.includes("tracker.verrou.toastSuspendu") && susp.includes("tracker.verrou.toastSuspenduInfini"), "🩸 suspendre le verrou → toast (durée / jusqu'à réactivation)");
  const react = bloc(s, "function _reactiverVerrou() {", "function _confirmerReactivationVerrou");
  verif(react.includes("tracker.verrou.toastReactive"), "🩸 réactivation du verrou → toast");
  const init = bloc(s, "function initInterface() {", "// 🐛 v1.57.2");
  verif(init.includes("_verrouSuspendu = false;") && init.includes("_verrouFinTs = 0;"), "🩸 la suspension du verrou est oubliée au chargement d'un plan");
  const warn = bloc(s, "function _afficherAvertissementTracker(onConfirm) {", "document.documentElement.appendChild(overlay);");
  verif(warn.includes('id="kta-tracker-warn-wake"') && warn.includes("WakeLock.isSupported()") && warn.includes("!window.WakeLock.isEnabled()"), "🩸 modale de démarrage : case « garder l'écran allumé » (si supporté, pas déjà actif)");
  const okBtn = bloc(s, 'document.getElementById("kta-tracker-warn-ok").addEventListener("click"', "try { onConfirm(); }");
  verif(okBtn.includes("WakeLock.setEnabled(true)"), "🩸 « J'ai compris » active le wake lock depuis le geste utilisateur");
  verif(/window\.ouvrirMenuTracker = function/.test(s), "Q11 : ouvrirMenuTracker exposé");
}

// ---------- Q11 / Q46 / Q34 : refonteInterface.js ----------
{
  const s = lire("js/refonteInterface.js");
  verif(/id="kta-refonte-stat-tracker"/.test(s) && /kta-refonte-stat-tracker-off kta-refonte-stat-clickable/.test(s), "chip 🧭 du footer cliquable");
  verif(/trackerStat\.addEventListener\("click"/.test(s) && /window\.ouvrirMenuTracker\(\)/.test(s), "🩸 tap sur le chip 🧭 → menu Tracker");
  const rs = bloc(s, 'const trackerEl = document.getElementById("kta-refonte-stat-tracker");', "function _setStat");
  verif(rs.includes("getStepCount") && rs.includes("getTrackingDistanceTotaleM") && rs.includes("👣"), "🩸 le chip affiche pas + distance quand le suivi est actif");
  verif(rs.includes("FilterPanel.majBadge"), "🩸 le polling du footer rafraîchit la pastille de filtres (changements de niveau externes)");
  verif(/function _ligneDerniereSauvegarde\(\)/.test(s) && /html \+= _ligneDerniereSauvegarde\(\);/.test(s), "🩸 📊 Détails : ligne « enregistré il y a » en tête");
}

// ---------- i18n ----------
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
