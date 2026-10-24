/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// vuePlan.js — vue laissée sur un plan (centre, zoom, niveau), retrouvée à sa réouverture : par plan, sur
// l'appareil, sans limite de durée (décision produit). Suivi actif au départ : la vue se recentre sur la dernière
// position du tracker, et le suivi reste arrêté (le capteur n'a pas tourné entre-temps).
// Stockage : localStorage `myktamap_vue_v1_<planId>` = { v, x, y, zoom, niveau?, suivi, img, le } (coordonnées
//   plan, ~150 octets). Hors session : la session voyage (export, synchro d'une installation) et s'efface avec
//   « Effacer la session » ; la vue est propre à l'appareil. Écriture synchrone : tient au pagehide.
// Mémorisée : main.js > _libererRessourcesPlanPrecedent (fermeture, changement de plan), pagehide et passage en
//   arrière-plan. Appliquée : main.js > lancerApplication, après la restauration de session.
// 🩸 Rien n'est mémorisé avant que la vue du plan ait été appliquée (`_etat`) : un passage en arrière-plan pendant
//   le chargement écrirait le cadrage par défaut par-dessus la vue laissée.
// ⚠️ Vue ignorée si l'image du plan a changé (dimensions, fichier de base, version : `img`) ; centre borné à
//   l'image, zoom borné à la carte ; niveau hors des niveaux du plan → niveau par défaut.
// Expose : window.KtaVuePlan { memoriser, liberer, appliquer, lire, retirer, transferer, PREFIXE }
// Doc : docs/architecture/plans-loader.md (Fermer un plan) · Preuve : scripts/smoke/checkup-retour-accueil.js

(function () {
  "use strict";

  const PREFIXE = "myktamap_vue_v1_";
  // Niveau mémorisé encore inconnu à l'application (calque de données lu après coup) : seconde lecture.
  const DELAI_NIVEAU_MS = 1500;

  // Plan dont la vue est affichée et peut être mémorisée : { id, img, h } (posé par appliquer).
  let _etat = null;
  let _minuterieNiveau = null;

  function _log() { try { console.log.apply(console, ["[VuePlan]"].concat([].slice.call(arguments))); } catch (e) { /* rien */ } }

  function _carte() {
    return (window.L && window.map instanceof window.L.Map) ? window.map : null;
  }

  // Empreinte de l'image du plan chargé : une vue prise sur une autre image ne veut plus rien dire.
  function _signatureImage() {
    const p = window.PLAN_CONFIG && window.PLAN_CONFIG.plan;
    if (!p || !(p.imageWidth > 0) || !(p.imageHeight > 0)) return null;
    return [p.imageWidth, p.imageHeight, p.baseImage || "", p.version || ""].join("|");
  }

  function lire(planId) {
    if (!planId) return null;
    try {
      const o = JSON.parse(localStorage.getItem(PREFIXE + planId) || "null");
      if (!o || o.v !== 1 || !Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.zoom)) return null;
      return o;
    } catch (e) { return null; }
  }

  function retirer(planId) {
    if (!planId) return;
    try { localStorage.removeItem(PREFIXE + planId); } catch (e) { /* rien */ }
  }

  // Copie locale remplacée par sa version publiée (PlanRegistry.transferAssociatedData) : la vue suit l'id.
  function transferer(ancienId, nouveauId) {
    if (!ancienId || !nouveauId || ancienId === nouveauId) return false;
    try {
      const brut = localStorage.getItem(PREFIXE + ancienId);
      if (brut == null) return false;
      if (localStorage.getItem(PREFIXE + nouveauId) == null) localStorage.setItem(PREFIXE + nouveauId, brut);
      localStorage.removeItem(PREFIXE + ancienId);
      return true;
    } catch (e) { return false; }
  }

  // Écrit la vue du plan affiché. Suivi actif : la position du tracker (et son niveau) plutôt que le centre de
  // l'écran, qui peut avoir été déplacé à la main ou tourné (plan orienté).
  function memoriser() {
    const map = _carte();
    if (!_etat || !map) return false;
    try {
      const suivi = typeof window.getTrackingActif === "function" && window.getTrackingActif() === true;
      let x, y;
      if (suivi && typeof window.getTrackingPosition === "function") {
        const pos = window.getTrackingPosition();
        x = pos.x; y = pos.y;
      } else {
        const c = map.getCenter();
        x = c.lng; y = _etat.h - c.lat;
      }
      const zoom = map.getZoom();
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return false;
      const vue = { v: 1, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, zoom: zoom, suivi: suivi,
        img: _etat.img, le: Date.now() };
      const cfg = window.APP_CONFIG;
      if (cfg && cfg.multiLevel === true) {
        const n = (suivi && typeof window.getTrackerLevel === "function") ? window.getTrackerLevel() : cfg.activeLevel;
        if (Number.isInteger(n)) vue.niveau = n;
      }
      localStorage.setItem(PREFIXE + _etat.id, JSON.stringify(vue));
      return true;
    } catch (e) {
      console.warn("[VuePlan] mémorisation impossible :", e);
      return false;
    }
  }

  // Fermeture du plan : dernière mémorisation, puis plus rien jusqu'à la vue du plan suivant.
  function liberer() {
    memoriser();
    _etat = null;
    if (_minuterieNiveau !== null) { clearTimeout(_minuterieNiveau); _minuterieNiveau = null; }
  }

  function _niveauConnu(n) {
    const cfg = window.APP_CONFIG || {};
    if (Array.isArray(cfg.availableLevels) && cfg.availableLevels.indexOf(n) >= 0) return true;
    try {
      return typeof window.ktaNiveauxOccupes === "function" && window.ktaNiveauxOccupes().indexOf(n) >= 0;
    } catch (e) { return false; }
  }

  function _poserNiveau(n) {
    if (typeof window.ktaSetActiveLevel === "function") window.ktaSetActiveLevel(n, { source: "vue-retrouvee" });
  }

  // Après la restauration de session (le tracker y recentre déjà sur sa dernière position) : vue mémorisée du
  // plan, sinon cadrage initial inchangé. Rend la vue appliquée, ou null.
  function appliquer(planId) {
    const map = _carte();
    if (_minuterieNiveau !== null) { clearTimeout(_minuterieNiveau); _minuterieNiveau = null; }
    const img = _signatureImage();
    const h = window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.imageHeight;
    _etat = (map && planId && img) ? { id: planId, img: img, h: h } : null;
    if (!_etat) return null;
    const vue = lire(planId);
    if (!vue) return null;
    if (vue.img !== img) { _log("image du plan changée : vue mémorisée ignorée"); return null; }
    const w = window.PLAN_CONFIG.plan.imageWidth;
    const x = Math.min(Math.max(vue.x, 0), w);
    const y = Math.min(Math.max(vue.y, 0), h);
    const zoom = Math.min(Math.max(vue.zoom, map.getMinZoom()), map.getMaxZoom());
    const cfg = window.APP_CONFIG || {};
    if (cfg.multiLevel === true && Number.isInteger(vue.niveau) && vue.niveau !== cfg.activeLevel) {
      if (_niveauConnu(vue.niveau)) {
        _poserNiveau(vue.niveau);
      } else {
        // Niveau porté seulement par un calque de données encore en lecture : on revient voir une fois, sans
        // reprendre la main si l'utilisateur (ou un portail) a déjà changé de niveau.
        const depart = cfg.activeLevel;
        const id = planId;
        _minuterieNiveau = setTimeout(function () {
          _minuterieNiveau = null;
          const c = window.APP_CONFIG || {};
          if (!_etat || _etat.id !== id || c.activeLevel !== depart) return;
          if (_niveauConnu(vue.niveau)) _poserNiveau(vue.niveau);
          else _log("niveau mémorisé absent du plan : niveau par défaut");
        }, DELAI_NIVEAU_MS);
      }
    }
    const etat = _etat;
    const poser = function () {
      if (_etat !== etat || _carte() !== map) return;
      try { map.setView([h - y, x], zoom, { animate: false }); } catch (e) {
        console.warn("[VuePlan] vue mémorisée non appliquée :", e);
      }
    };
    // 🩸 Zoom animé en cours (initTracking cadre au zoom 0 depuis le fitBounds) : sa fin remet la carte sur SA
    // cible par-dessus un setView non animé. On pose donc la vue à la fin de l'animation.
    if (map._animatingZoom) map.once("zoomend", poser);
    else poser();
    _log("vue retrouvée" + (vue.suivi ? " (dernière position du suivi)" : ""), "zoom", zoom);
    return vue;
  }

  window.addEventListener("pagehide", memoriser);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") memoriser();
  });

  window.KtaVuePlan = {
    memoriser: memoriser,
    liberer: liberer,
    appliquer: appliquer,
    lire: lire,
    retirer: retirer,
    transferer: transferer,
    PREFIXE: PREFIXE
  };
})();
