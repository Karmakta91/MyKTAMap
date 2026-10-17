/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 * Voir LICENSE a la racine du projet.
 */

// =========================
// CONFIG D'INSTANCE — js/ktaInstance.js
// =========================
// Lit `data/index.json` UNE SEULE FOIS par démarrage, AVANT les gates, et sert le résultat à tous : gate
// d'accès (`accessHash`), kiosque, connexion serveur, découverte des plans (une seule lecture : deux lectures
// pourraient diverger). Doc : docs/architecture/community-server-line.md §3.
// Règles :
//   - délai max 2 s : au-delà, ou hors ligne, on rejoue la DERNIÈRE config connue (règle B) — un réseau lent
//     sous terre ne fige pas le splash ;
//   - 🩸 « l'index a répondu » et « config rejouée » ne se confondent JAMAIS : `repondu` le dit ; une config
//     rejouée n'autorise ni ne révoque rien côté gate (revaliderInstance(…, false)) ;
//   - seule la section `config` est mémorisée (pas la liste des plans).
// Garde-fou : scripts/check-gate-instance.js

(function () {
  "use strict";

  const LS_MEMO = "myktamap_instance_config_v1";
  const DELAI_MS = 2000;
  // 🩸 Premier contact (aucune config mémorisée) : rien à rejouer, on attend la VRAIE réponse. Après « Tout
  // réinitialiser », le SW se réinstalle et l'index arrive après 2 s : avec le délai court, une instance
  // protégée afficherait la gate community libre. Le délai court ne vaut que s'il y a un repli.
  const DELAI_PREMIER_MS = 15000;
  let _promesse = null;
  let _etat = { charge: false, repondu: false, index: null, config: null, source: "aucune" };

  function _lireMemo() {
    try {
      const brut = localStorage.getItem(LS_MEMO);
      const c = brut ? JSON.parse(brut) : null;
      return (c && typeof c === "object" && !Array.isArray(c)) ? c : null;
    } catch (e) { return null; }
  }

  function _ecrireMemo(config) {
    try {
      if (config && typeof config === "object") localStorage.setItem(LS_MEMO, JSON.stringify(config));
      else localStorage.removeItem(LS_MEMO);
    } catch (e) { /* stockage indisponible : on fera sans mémoire */ }
  }

  function _lireIndex() {
    const ctrl = (typeof AbortController === "function") ? new AbortController() : null;
    const delai = _lireMemo() ? DELAI_MS : DELAI_PREMIER_MS;
    const minuterie = setTimeout(function () { if (ctrl) ctrl.abort(); }, delai);
    // `no-store` explicite : le cache HTTP peut servir un index périmé tant que le SW ne contrôle pas l'onglet.
    return fetch("data/index.json", { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        clearTimeout(minuterie);
        // 🩸 Hors ligne sans cache, le SW répond un 404 SYNTHÉTIQUE (sw.js), indiscernable d'un vrai : traité en
        // injoignable.
        if (!r.ok) return null;
        return r.json();
      })
      .catch(function () { clearTimeout(minuterie); return null; });
  }

  // Lecture unique pour tout le démarrage : chaque appel rend la même promesse.
  function charger() {
    if (_promesse) return _promesse;
    _promesse = _lireIndex().then(function (idx) {
      if (idx && typeof idx === "object") {
        const config = (idx.config && typeof idx.config === "object") ? idx.config : null;
        _ecrireMemo(config);
        _etat = { charge: true, repondu: true, index: idx, config: config, source: "index" };
      } else {
        const memo = _lireMemo();
        _etat = { charge: true, repondu: false, index: null, config: memo, source: memo ? "memoire" : "aucune" };
        console.log("[Instance] data/index.json injoignable (délai dépassé ou hors ligne) — " +
                    (memo ? "dernière config connue rejouée" : "aucune config connue"));
      }
      return _etat;
    });
    return _promesse;
  }

  window.KtaInstance = {
    charger: charger,
    etat: function () { return _etat; },
    LS_MEMO: LS_MEMO,
    DELAI_MS: DELAI_MS,
    DELAI_PREMIER_MS: DELAI_PREMIER_MS
  };
})();
