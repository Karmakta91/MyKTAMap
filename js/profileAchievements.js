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

  // Hauts faits "Spéciaux" (one-shot, fun). Dérivés du même objet
  // de métriques (+ hasTracked / maxLevels / maxTrackerH / score, calculés
  // inline). `completiste` reçoit un contexte { tieredUnlocked }.
  const TIERED_TOTAL = FAMILIES.length * 4;  // 32
  const SPECIALS = [
    { id: "toucheatout", emoji: "🎨", check: function(m)      { return (m.pois||0)>=1 && (m.roads||0)>=1 && (m.zones||0)>=1 && (m.structures||0)>=1; } },
    { id: "centurion",   emoji: "💯", check: function(m)      { return (Number(m.score)||0) >= 100; } },
    { id: "taupe",       emoji: "🦇", check: function(m)      { return !!m.hasTracked; } },
    { id: "multiniveau", emoji: "🧭", check: function(m)      { return (Number(m.maxLevels)||0) >= 2; } },
    { id: "marathon",    emoji: "🌃", check: function(m)      { return (Number(m.maxTrackerH)||0) >= 4; } },
    { id: "completiste", emoji: "🏆", check: function(m, ctx) { return !!ctx && ctx.tieredUnlocked >= TIERED_TOTAL; } }
  ];

  // garde `v !== key` mort depuis l'humanisation H1 (t() ne
  // retourne plus jamais la clé brute) → has() teste la présence réelle.
  function _t(key, fb) {
    if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(key)) {
      return window.I18n.t(key);
    }
    return fb;
  }

  function nom(familyId)  { return _t("feat." + familyId, familyId); }
  function nomSpecial(id) { return _t("feat.sp." + id, id); }

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
          group:      "family",
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
    // spéciaux one-shot. completiste lit le nb de tiered débloqués.
    const tieredUnlocked = out.filter(function(a) { return a.unlocked; }).length;
    const ctx = { tieredUnlocked: tieredUnlocked };
    SPECIALS.forEach(function(s) {
      let ok = false;
      try { ok = !!s.check(metrics || {}, ctx); } catch(e) {}
      out.push({
        id:       "special." + s.id,
        group:    "special",
        emoji:    s.emoji,
        unlocked: ok,
        pct:      ok ? 100 : 0,
        nom:      nomSpecial(s.id)
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
    if (ach.group === "special") return (ach.emoji ? ach.emoji + " " : "") + ach.nom;
    return ach.emoji + " " + ach.nom + " " + ach.tierRoman;
  }

  const TOTAL = TIERED_TOTAL + SPECIALS.length;  // 32 + 6 = 38

  window.ProfileAchievements = {
    FAMILIES:    FAMILIES,
    SPECIALS:    SPECIALS,
    TIER_ICONS:  TIER_ICONS,
    total:       TOTAL,
    list:        list,
    unlockedIds: unlockedIds,
    byId:        byId,
    nom:         nom,
    label:       label
  };

  console.log("[ProfileAchievements] Module chargé (" + TOTAL + " hauts faits, dont " + SPECIALS.length + " spéciaux)");
})();
