/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// profileAchievements.js — hauts faits du profil (succès one-shot, ≠ rang de profileGamification.js) :
// 8 familles × 4 paliers (I à IV) + spéciaux. Module PUR : métriques { plans, plansGeoref, km, hours, pois,
// roads, zones, structures } → liste + état. Persistance des débloqués, toast et grille dans index.html.
// Expose : window.ProfileAchievements — FAMILIES, TIER_ICONS, total, list(metrics) → [{id, familyId, emoji,
//   tier, tierIcon, tierRoman, metric, value, seuil, seuilLabel, unlocked, pct, nom}], unlockedIds(metrics),
//   byId(id, metrics), nom(familyId), label(ach)

(function() {
  "use strict";

  const TIER_ICONS = ["🥉", "🥈", "🥇", "👑"];  // I · II · III · IV (couronne = IV)
  const TIER_ROMAN = ["I", "II", "III", "IV"];

  // metric = clé de _collectGamifMetrics (index.html) ; unit = format d'affichage ; ico = icône SVG de la notion
  // (js/ktaIcones.js). Les médailles des paliers (TIER_ICONS) restent des emoji : récompenses colorées.
  const FAMILIES = [
    { id: "cartographe", ico: "map",        metric: "plans",       unit: "plans", seuils: [1, 10, 20, 30] },
    { id: "geometre",    ico: "globe",      metric: "plansGeoref", unit: "plans", seuils: [1, 5, 7, 15] },
    { id: "marcheur",    ico: "ruler",      metric: "km",          unit: "km",    seuils: [10, 75, 150, 250] },
    { id: "ratcave",     ico: "timer",      metric: "hours",       unit: "h",     seuils: [1, 20, 50, 100] },
    { id: "pointilleux", ico: "map-pin",    metric: "pois",        unit: "",      seuils: [50, 500, 1000, 2000] },
    { id: "traceur",     ico: "m-galerie",  metric: "roads",       unit: "",      seuils: [25, 200, 500, 1000] },
    { id: "zoneur",      ico: "m-zone",     metric: "zones",       unit: "",      seuils: [10, 50, 100, 200] },
    { id: "batisseur",   ico: "m-pilier",   metric: "structures",  unit: "",      seuils: [20, 150, 400, 600] }
  ];

  // Spéciaux : mêmes métriques (+ hasTracked / maxLevels / maxTrackerH / score) ; `completiste` reçoit
  // { tieredUnlocked }.
  const TIERED_TOTAL = FAMILIES.length * 4;  // 32
  const SPECIALS = [
    { id: "toucheatout", ico: "layers",     check: function(m)      { return (m.pois||0)>=1 && (m.roads||0)>=1 && (m.zones||0)>=1 && (m.structures||0)>=1; } },
    { id: "centurion",   ico: "star",       check: function(m)      { return (Number(m.score)||0) >= 100; } },
    { id: "taupe",       ico: "navigation", check: function(m)      { return !!m.hasTracked; } },
    { id: "multiniveau", ico: "m-niveaux",  check: function(m)      { return (Number(m.maxLevels)||0) >= 2; } },
    { id: "marathon",    ico: "timer",      check: function(m)      { return (Number(m.maxTrackerH)||0) >= 4; } },
    { id: "completiste", ico: "trophy",     check: function(m, ctx) { return !!ctx && ctx.tieredUnlocked >= TIERED_TOTAL; } }
  ];

  // has() : t() ne rend jamais la clé brute
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
          ico:        f.ico,
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
    const tieredUnlocked = out.filter(function(a) { return a.unlocked; }).length;
    const ctx = { tieredUnlocked: tieredUnlocked };
    SPECIALS.forEach(function(s) {
      let ok = false;
      try { ok = !!s.check(metrics || {}, ctx); } catch(e) {}
      out.push({
        id:       "special." + s.id,
        group:    "special",
        ico:      s.ico,
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
    // Texte seul : l'icône SVG de la notion (ach.ico) est posée par l'appelant qui rend du HTML.
    if (ach.group === "special") return ach.nom;
    return ach.nom + " " + ach.tierRoman;
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
