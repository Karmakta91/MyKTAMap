/*!
 * MyKTAMap — Hauts faits / succès du profil (v1.53.0)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// PROFILEACHIEVEMENTS.JS — Hauts faits (succès one-shot, depuis v1.53.0)
// =========================
// Catalogue de "hauts faits" à débloquer (≠ le rang continu de
// profileGamification.js). 8 familles × 4 paliers (🥉 I · 🥈 II · 🥇 III ·
// 👑 IV) = 32 succès. Un succès est débloqué quand sa métrique >= son seuil.
// Module PUR : prend des métriques { plans, plansGeoref, km, hours, pois,
// roads, zones, structures } et renvoie la liste + l'état. Le plumbing
// (persistance des débloqués, toast, rendu grille) vit dans index.html.
//
// API : window.ProfileAchievements = {
//   FAMILIES, TIER_ICONS, total,
//   list(metrics)        -> [{id, familyId, emoji, tier, tierIcon, tierRoman,
//                             metric, value, seuil, seuilLabel, unlocked, pct, nom}]
//   unlockedIds(metrics) -> [id, ...] (succès dont le seuil est atteint)
//   byId(id, metrics), nom(familyId), label(ach)
// };
// 100 % local, offline.
// =========================

(function() {
  "use strict";

  const TIER_ICONS = ["🥉", "🥈", "🥇", "👑"];  // I · II · III · IV (couronne = IV)
  const TIER_ROMAN = ["I", "II", "III", "IV"];

  // metric = clé de _collectGamifMetrics (index.html). unit = format d'affichage.
  const FAMILIES = [
    { id: "cartographe", emoji: "🗺️", metric: "plans",       unit: "plans", seuils: [1, 10, 20, 30] },
    { id: "geometre",    emoji: "🌐", metric: "plansGeoref", unit: "plans", seuils: [1, 5, 7, 15] },
    { id: "marcheur",    emoji: "📏", metric: "km",          unit: "km",    seuils: [10, 75, 150, 250] },
    { id: "ratcave",     emoji: "⏱️", metric: "hours",       unit: "h",     seuils: [1, 20, 50, 100] },
    { id: "pointilleux", emoji: "📍", metric: "pois",        unit: "",      seuils: [50, 500, 1000, 2000] },
    { id: "traceur",     emoji: "🛣️", metric: "roads",       unit: "",      seuils: [25, 200, 500, 1000] },
    { id: "zoneur",      emoji: "⬛", metric: "zones",       unit: "",      seuils: [10, 50, 100, 200] },
    { id: "batisseur",   emoji: "🏛️", metric: "structures",  unit: "",      seuils: [20, 150, 400, 600] }
  ];

  function _t(key, fb) {
    if (window.I18n && typeof window.I18n.t === "function") {
      const v = window.I18n.t(key);
      if (v && v !== key) return v;
    }
    return fb;
  }

  function nom(familyId) { return _t("feat." + familyId, familyId); }

  function _val(metrics, metric) {
    return Math.max(0, Number(metrics && metrics[metric]) || 0);
  }

  function _seuilLabel(fam, seuil) {
    if (fam.unit === "h")     return seuil + " h";
    if (fam.unit === "km")    return seuil + " km";
    if (fam.unit === "plans") return seuil + " " + _t("rank.unitPlans", "plans");
    return String(seuil);
  }

  function list(metrics) {
    const out = [];
    FAMILIES.forEach(function(f) {
      const val = _val(metrics, f.metric);
      f.seuils.forEach(function(seuil, i) {
        out.push({
          id:         f.id + ".t" + i,
          familyId:   f.id,
          emoji:      f.emoji,
          tier:       i + 1,
          tierIcon:   TIER_ICONS[i] || "🏆",
          tierRoman:  TIER_ROMAN[i] || String(i + 1),
          metric:     f.metric,
          value:      val,
          seuil:      seuil,
          seuilLabel: _seuilLabel(f, seuil),
          unlocked:   val >= seuil,
          pct:        Math.max(0, Math.min(1, seuil > 0 ? val / seuil : 1)) * 100,
          nom:        nom(f.id)
        });
      });
    });
    return out;
  }

  function unlockedIds(metrics) {
    return list(metrics).filter(function(a) { return a.unlocked; }).map(function(a) { return a.id; });
  }

  function byId(id, metrics) {
    const all = list(metrics);
    for (let i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; }
    return null;
  }

  function label(ach) {
    if (!ach) return "";
    return ach.emoji + " " + ach.nom + " " + ach.tierRoman;
  }

  window.ProfileAchievements = {
    FAMILIES:    FAMILIES,
    TIER_ICONS:  TIER_ICONS,
    total:       FAMILIES.length * 4,
    list:        list,
    unlockedIds: unlockedIds,
    byId:        byId,
    nom:         nom,
    label:       label
  };

  console.log("[ProfileAchievements] Module chargé (" + (FAMILIES.length * 4) + " hauts faits)");
})();
