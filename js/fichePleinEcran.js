/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// FICHE-PLEIN-ÉCRAN — au téléphone, la fiche d'un point, tracé, zone ou structure s'ouvre en plein écran et défile
// =========================
// Réglage d'appareil (Configuration de l'accueil › Affichage) : tant qu'il n'a pas été touché, il suit l'appareil
// (`estTelephone` : tactile ET moins de 900 px de large, lu à chaque ouverture) ; un choix est gardé dans
// localStorage[LS_CLE] ("1" / "0"), jamais dans la session ni un export.
// ⚠️ contrat : la MÊME popup Leaflet que sur la carte, pas une copie. `L.Popup.prototype.getPane` rend l'hôte plein
//   écran pour une popup de fiche (option `ktaFiche` de `window.KTA_POPUP_OPTS`) ouverte sur la carte du plan :
//   Leaflet y pose son conteneur, construit le contenu, émet popupopen / popupclose ; les écouteurs des fiches
//   (`utils.js > attacherNotePopup`, `_ktaPopupAction` en capture sur document, photos) agissent tels quels.
// 🩸 `_adjustPan` coupé pour ces popups : la carte ne bouge pas derrière. Position et largeur posées par Leaflet
//   (transform, left, bottom, width) écrasées en CSS (`.kta-fiche-pe`).
// ⚠️ z-index : juste sous les modales (99998) — une fenêtre ouverte depuis la fiche (Modifier, photos, Convertir,
//   confirmation) passe dessus, quel que soit l'ordre du DOM.
// Fermer : bouton, Échap, ou tout `closePopup` (une action qui mène à la carte ferme sa fiche, comme la bulle).
// Expose window.KtaFichePleinEcran · Doc : docs/architecture/ui.md § Fiche plein écran
// =========================

(function () {
  "use strict";

  const LS_CLE = "myktamap_fiche_plein_ecran_v1";
  const LARGEUR_TELEPHONE = 900;   // px : en dessous, un appareil tactile est un téléphone (tablette en paysage : non)

  let _memoire = null;             // choix gardé en mémoire si le stockage est refusé
  let _ouverte = null;             // { popup, hote, onKey }

  function _t(cle) {
    return window.I18n && typeof window.I18n.t === "function" ? window.I18n.t(cle) : cle;
  }

  function estTelephone() {
    let tactile = false;
    try {
      tactile = (navigator.maxTouchPoints || 0) > 0 ||
        (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches);
    } catch (e) { tactile = false; }
    return tactile && (window.innerWidth || 0) < LARGEUR_TELEPHONE;
  }

  // Choix enregistré : true / false, ou null tant que l'utilisateur n'a pas touché la case.
  function choix() {
    let v = null;
    try { v = localStorage.getItem(LS_CLE); } catch (e) { v = _memoire; }
    if (v === null || v === undefined) v = _memoire;
    return v === "1" ? true : (v === "0" ? false : null);
  }

  function poser(actif) {
    const v = actif ? "1" : "0";
    _memoire = v;
    try { localStorage.setItem(LS_CLE, v); } catch (e) { /* gardé en mémoire pour la session */ }
    console.log("[FichePleinEcran] Fiches en plein écran :", actif ? "oui" : "non");
  }

  function actif() {
    const c = choix();
    return c === null ? estTelephone() : c;
  }

  function _estFiche(popup, map) {
    if (!popup || !popup.options || popup.options.ktaFiche !== true) return false;
    if (!map || map !== window.map) return false;
    // Mode « clic carte » (pose, choix d'un point) : la carte referme aussitôt la popup (map.js) — pas d'hôte.
    if (typeof window._modeClicCarteActif === "function" && window._modeClicCarteActif()) return false;
    return actif();
  }

  function _creerHote(popup) {
    const fond = document.createElement("div");
    fond.className = "kta-fiche-pe";
    fond.setAttribute("role", "dialog");
    fond.setAttribute("aria-modal", "true");
    fond.setAttribute("aria-label", _t("fichePe.titre"));
    const barre = document.createElement("div");
    barre.className = "kta-fiche-pe-barre";
    const fermer = document.createElement("button");
    fermer.type = "button";
    fermer.className = "kta-btn kta-fiche-pe-fermer";
    fermer.innerHTML = (typeof window.ktaIcone === "function" ? window.ktaIcone("x") + " " : "") +
      '<span class="kta-fiche-pe-fermer-txt"></span>';
    fermer.querySelector(".kta-fiche-pe-fermer-txt").textContent = _t("fichePe.fermer");
    fermer.addEventListener("click", function () { _fermerPopup(popup); });
    barre.appendChild(fermer);
    const corps = document.createElement("div");
    corps.className = "kta-fiche-pe-corps";
    fond.appendChild(barre);
    fond.appendChild(corps);
    document.body.appendChild(fond);
    return { fond: fond, corps: corps, fermer: fermer };
  }

  function _fermerPopup(popup) {
    try {
      if (popup && popup._map) popup._map.closePopup(popup);
    } catch (e) { console.warn("[FichePleinEcran] fermeture :", e && e.message); }
    _retirerHote(popup);
  }

  function _retirerHote(popup) {
    const o = _ouverte;
    if (!o || (popup && o.popup !== popup)) return;
    _ouverte = null;
    document.removeEventListener("keydown", o.onKey, true);
    if (o.fond.parentNode) o.fond.parentNode.removeChild(o.fond);
    o.popup._ktaHotePe = null;
  }

  function fermer() {
    if (_ouverte) _fermerPopup(_ouverte.popup);
  }

  function _installer() {
    const L = window.L;
    if (!L || !L.Popup || L.Popup.prototype._ktaPleinEcran) return;
    const P = L.Popup.prototype;
    P._ktaPleinEcran = true;

    const onAdd = P.onAdd, onRemove = P.onRemove, getPane = P.getPane, adjustPan = P._adjustPan;

    P.onAdd = function (map) {
      if (_ouverte && _ouverte.popup !== this) _retirerHote(_ouverte.popup);
      if (_estFiche(this, map)) {
        const h = _creerHote(this);
        const popup = this;
        const onKey = function (e) {
          if (e.key !== "Escape" || !_ouverte || _ouverte.popup !== popup) return;
          // Une fenêtre ouverte par-dessus la fiche (Modifier, confirmation) garde son Échap : seul un Échap venu
          // de la fiche, ou d'aucun champ, la ferme.
          const cible = e.target;
          if (cible && cible !== document.body && cible !== document.documentElement &&
            !_ouverte.fond.contains(cible)) return;
          e.preventDefault();
          e.stopPropagation();
          _fermerPopup(popup);
        };
        document.addEventListener("keydown", onKey, true);
        _ouverte = { popup: popup, fond: h.fond, onKey: onKey };
        this._ktaHotePe = h.corps;
      } else {
        this._ktaHotePe = null;
      }
      onAdd.call(this, map);
      if (this._ktaHotePe && _ouverte && _ouverte.popup === this) {
        try { _ouverte.fond.querySelector(".kta-fiche-pe-fermer").focus({ preventScroll: true }); }
        catch (e) { /* focus refusé : la fiche reste utilisable */ }
      }
    };

    P.onRemove = function (map) {
      const avait = !!this._ktaHotePe;
      onRemove.call(this, map);
      if (avait) _retirerHote(this);
    };

    P.getPane = function () {
      return this._ktaHotePe || getPane.apply(this, arguments);
    };

    P._adjustPan = function () {
      if (this._ktaHotePe) return;
      return adjustPan.apply(this, arguments);
    };
  }

  _installer();

  window.KtaFichePleinEcran = {
    LS_CLE: LS_CLE,
    LARGEUR_TELEPHONE: LARGEUR_TELEPHONE,
    estTelephone: estTelephone,
    choix: choix,
    poser: poser,
    actif: actif,
    fermer: fermer,
    ouverte: function () { return !!_ouverte; }
  };
})();
