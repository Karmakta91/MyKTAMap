/*!
 * MyKTAMap — Gamification du profil : rangs / badges (v1.52.0)
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// PROFILEGAMIFICATION.JS — Rangs de profil "PRO mais FUN" (depuis v1.52.0)
// =========================
// Calcul PUR (aucun DOM, aucun localStorage, aucun réseau) : prend des
// métriques { plans, hours, km } et renvoie le rang + le score + la
// progression. Le plumbing (lecture des compteurs, rendu de l'anneau/puce)
// vit dans index.html (réutilise _readTotalTimeMs / PlanRegistry / cache
// stats par plan). 100 % local, offline.
//
// RANGS — seuils STATIQUES à atteindre (choix KARMA : pas de score qui pilote
// le badge). On atteint un rang quand plans ET heures ET km >= ses 3 seuils
// (logique « maillon faible »). Les seuils sont monotones croissants sur les
// 3 axes → computeRank s'arrête au 1er palier non atteint.
//
// API : window.ProfileGamification = {
//   RANKS,                       // table ordonnée (ascendant)
//   computeRank({plans,hours,km}) -> rankObj
//   getScore({plans,hours,km})    -> number (BONUS d'affichage, n'influence PAS le rang)
//   getProgress({plans,hours,km}) -> { current, next|null, missing|null, pct }
//   nom(rank), label(rank)        // libellé localisé (+ emoji)
// };
// =========================

(function() {
  "use strict";

  const RANKS = [
    { id: "touriste",    emoji: "",   ring: "#6b7280", plans: 0,  hours: 0,  km: 0   },
    { id: "novice",      emoji: "🥉", ring: "#cd7f32", plans: 3,  hours: 5,  km: 10  },
    { id: "confirme",    emoji: "🥈", ring: "#9fb2c8", plans: 5,  hours: 10, km: 20  },
    { id: "expert",      emoji: "🥇", ring: "#f4c542", plans: 10, hours: 20, km: 75  },
    { id: "maitre",      emoji: "🏅", ring: "#ff8c42", plans: 15, hours: 40, km: 130 },
    { id: "grandmaitre", emoji: "👑", ring: "#b388ff", plans: 25, hours: 60, km: 200 }
  ];

  function _safe(m) {
    m = m || {};
    return {
      plans: Math.max(0, Number(m.plans) || 0),
      hours: Math.max(0, Number(m.hours) || 0),
      km:    Math.max(0, Number(m.km)    || 0)
    };
  }

  function computeRank(metrics) {
    const m = _safe(metrics);
    let r = RANKS[0];
    for (let i = 1; i < RANKS.length; i++) {
      const t = RANKS[i];
      if (m.plans >= t.plans && m.hours >= t.hours && m.km >= t.km) r = t;
      else break;  // seuils monotones → inutile d'aller plus haut
    }
    return r;
  }

  // Score = simple total (plans + heures + km). Purement décoratif (KARMA :
  // « on peut scorer en plus »), n'entre PAS dans le calcul du rang.
  function getScore(metrics) {
    const m = _safe(metrics);
    return Math.round(m.plans + m.hours + m.km);
  }

  function getProgress(metrics) {
    const m = _safe(metrics);
    const cur = computeRank(m);
    const idx = RANKS.indexOf(cur);
    if (idx >= RANKS.length - 1) {
      return { current: cur, next: null, missing: null, pct: 100 };
    }
    const next = RANKS[idx + 1];
    const missing = {
      plans: Math.max(0, next.plans - m.plans),
      hours: Math.max(0, next.hours - m.hours),
      km:    Math.max(0, next.km    - m.km)
    };
    // Progression = maillon le plus faible (ratio min sur les 3 seuils du next).
    const ratios = [];
    if (next.plans > 0) ratios.push(m.plans / next.plans);
    if (next.hours > 0) ratios.push(m.hours / next.hours);
    if (next.km    > 0) ratios.push(m.km    / next.km);
    let pct = ratios.length ? Math.min.apply(null, ratios) : 1;
    pct = Math.max(0, Math.min(1, pct)) * 100;
    return { current: cur, next: next, missing: missing, pct: pct };
  }

  function nom(rank) {
    const key = "rank." + ((rank && rank.id) || "touriste");
    if (window.I18n && typeof window.I18n.t === "function") {
      const v = window.I18n.t(key);
      if (v && v !== key) return v;
    }
    return (rank && rank.id) || "?";
  }

  function label(rank) {
    return (rank && rank.emoji ? rank.emoji + " " : "") + nom(rank);
  }

  window.ProfileGamification = {
    RANKS:       RANKS,
    computeRank: computeRank,
    getScore:    getScore,
    getProgress: getProgress,
    nom:         nom,
    label:       label
  };

  console.log("[ProfileGamification] Module chargé (6 rangs)");
})();
