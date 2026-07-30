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
    { id: "grandmaitre", emoji: "⚜️", ring: "#b388ff", plans: 25, hours: 60, km: 200 },
    // 🥚 v1.54.0 Easter egg — rang SECRET au-dessus de Grand Maître, débloqué
    // UNIQUEMENT si le pseudo du profil = « Karma ». Seuils Infinity = jamais
    // atteignable par les métriques (cf override dans computeRank / _isKarma).
    { id: "legende",     emoji: "👑", ring: "#e0a51a", plans: Infinity, hours: Infinity, km: Infinity }
  ];

  function _safe(m) {
    m = m || {};
    return {
      plans: Math.max(0, Number(m.plans) || 0),
      hours: Math.max(0, Number(m.hours) || 0),
      km:    Math.max(0, Number(m.km)    || 0)
    };
  }

  // 🥚 Easter egg : pseudo "Karma" (insensible à la casse) → rang secret Légende.
  function _isKarma() {
    try {
      if (window.UserProfile && typeof window.UserProfile.get === "function") {
        const s = window.UserProfile.get();
        const n = (s && s.surnom ? String(s.surnom) : "").trim().toLowerCase();
        return n === "karma";
      }
    } catch(e) {}
    return false;
  }
  function _legende() {
    for (let i = 0; i < RANKS.length; i++) { if (RANKS[i].id === "legende") return RANKS[i]; }
    return null;
  }

  // Rang d'après les MÉTRIQUES seules (ignore l'Easter egg) — sert à afficher
  // le « vrai » rang mérité quand on est Légende via le pseudo Karma.
  function rankByMetrics(metrics) {
    const m = _safe(metrics);
    let r = RANKS[0];
    for (let i = 1; i < RANKS.length; i++) {
      const t = RANKS[i];
      if (m.plans >= t.plans && m.hours >= t.hours && m.km >= t.km) r = t;
      else break;  // seuils monotones (et stoppe avant legende = Infinity)
    }
    return r;
  }

  function computeRank(metrics) {
    if (_isKarma()) { const lg = _legende(); if (lg) return lg; }  // 🥚 override secret
    return rankByMetrics(metrics);
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
    const nxt = (idx >= 0 && idx < RANKS.length - 1) ? RANKS[idx + 1] : null;
    // Max atteint si dernier rang OU si le suivant est l'Easter egg "legende"
    // (seuils Infinity → pas un "next" normal). Si on EST Karma (cur=legende),
    // idx = dernier → next null également.
    if (!nxt || nxt.id === "legende") {
      return { current: cur, next: null, missing: null, pct: 100 };
    }
    const next = nxt;
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
    // 🐛 v1.68.1 : garde `v !== key` mort depuis l'humanisation H1 → has().
    if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(key)) {
      return window.I18n.t(key);
    }
    return (rank && rank.id) || "?";
  }

  function label(rank) {
    return (rank && rank.emoji ? rank.emoji + " " : "") + nom(rank);
  }

  window.ProfileGamification = {
    RANKS:         RANKS,
    computeRank:   computeRank,
    rankByMetrics: rankByMetrics,  // rang d'après les métriques seules (sans Easter egg)
    getScore:      getScore,
    getProgress:   getProgress,
    nom:           nom,
    label:         label
  };

  console.log("[ProfileGamification] Module chargé (6 rangs)");
})();
