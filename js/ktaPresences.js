// 📡 Présences sur le plan ouvert — affichage seulement (prise neutre).
// Une installation reliée (extension) fournit la position des AUTRES personnes qui ont
// choisi de partager la leur sur ce plan ; ce module les dessine : un repère avec le
// pseudo, l'ancienneté de la position, et la trace parcourue. Rien n'est lu ni envoyé
// ici. Sans extension, `afficher` n'est jamais appelé : aucun calque, aucun coût.
(function () {
  "use strict";
  var ANCIENNE_MS = 2 * 60 * 1000;   // au-delà : repère grisé (position plus mise à jour)
  var MAX_TRACE = 2000;
  var _calque = null;
  var _liste = [];
  var _minuteur = null;
  var _suivi = null;                 // id de la présence suivie (la carte se recentre à chaque mise à jour)
  var _tracesMasquees = {};          // id → true : trace non dessinée

  function _t(cle, vars) { return window.I18n ? window.I18n.t(cle, vars) : cle; }
  function _coord(x, y) {
    if (typeof window.convertCoord === "function") return window.convertCoord(x, y);
    var h = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
    return [h - y, x];
  }
  function _fini(n) { return typeof n === "number" && isFinite(n); }

  // Entrées non conformes écartées : l'extension n'est pas crue sur parole.
  function _nettoyer(liste) {
    if (!Array.isArray(liste)) return [];
    return liste.filter(function (p) {
      return p && typeof p.id === "string" && p.id && typeof p.pseudo === "string" && _fini(p.x) && _fini(p.y);
    }).slice(0, 200).map(function (p) {
      var trace = Array.isArray(p.trace) ? p.trace.filter(function (q) {
        return Array.isArray(q) && _fini(q[0]) && _fini(q[1]);
      }).slice(-MAX_TRACE) : [];
      return {
        id: p.id, pseudo: p.pseudo.trim().slice(0, 40) || "?", x: p.x, y: p.y,
        niveau: Number.isInteger(p.niveau) ? p.niveau : null,
        ts: _fini(p.ts) ? p.ts : Date.now(), trace: trace
      };
    });
  }

  function _age(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return _t("presence.age.instant");
    return _t("presence.age.min", { n: Math.round(s / 60) });
  }

  function _vider() {
    if (_calque && _calque._map) { try { _calque._map.removeLayer(_calque); } catch (e) { /* carte fermée */ } }
    _calque = null;
  }

  function _dessiner() {
    _vider();
    var map = window.map;
    if (!map || !_liste.length || typeof L === "undefined") return;
    _calque = L.layerGroup();
    _liste.forEach(function (p) {
      var ancienne = Date.now() - p.ts > ANCIENNE_MS;
      // Autre niveau que ceux affichés : repère atténué (la personne n'est pas « ici »).
      var horsNiveau = p.niveau !== null && typeof window.passeFiltreNiveau === "function" &&
        !window.passeFiltreNiveau({ level: p.niveau });
      if (p.trace.length > 1 && !_tracesMasquees[p.id]) {
        L.polyline(p.trace.map(function (q) { return _coord(q[0], q[1]); }), {
          color: "#8cb4ff", weight: 3, opacity: horsNiveau ? 0.2 : 0.55, dashArray: "6 6", interactive: false
        }).addTo(_calque);
      }
      var el = document.createElement("div");
      el.className = "kta-presence" + (ancienne ? " kta-presence-ancienne" : "") + (horsNiveau ? " kta-presence-hors-niveau" : "");
      var pastille = document.createElement("span");
      pastille.className = "kta-presence-pastille";
      pastille.textContent = p.pseudo.charAt(0).toUpperCase();
      var etiquette = document.createElement("span");
      etiquette.className = "kta-presence-etiquette";
      etiquette.textContent = p.pseudo + " · " + _age(p.ts) + (p.niveau !== null ? " · N" + p.niveau : "");
      el.appendChild(pastille);
      el.appendChild(etiquette);
      L.marker(_coord(p.x, p.y), {
        icon: L.divIcon({ className: "kta-presence-icone", html: el, iconSize: [26, 26], iconAnchor: [13, 13] }),
        keyboard: false, zIndexOffset: 500
      }).addTo(_calque);
    });
    _calque.addTo(map);
    if (_suivi) { var s = _trouver(_suivi); if (s) _allerA(s, false); }
  }

  function _trouver(id) { for (var i = 0; i < _liste.length; i++) if (_liste[i].id === id) return _liste[i]; return null; }
  // Recentre la carte sur une présence (niveau compris, en multi-niveau). zoomer : au moins le zoom 0.
  function _allerA(p, zoomer) {
    var map = window.map;
    if (!map) return;
    if (p.niveau !== null && window.APP_CONFIG && window.APP_CONFIG.multiLevel === true &&
        window.APP_CONFIG.activeLevel !== p.niveau && typeof window.ktaSetActiveLevel === "function") {
      try { window.ktaSetActiveLevel(p.niveau); } catch (e) { /* niveau absent */ }
    }
    var z = zoomer ? Math.max(map.getZoom(), 0) : map.getZoom();
    try { map.setView(_coord(p.x, p.y), z, { animate: !zoomer }); } catch (e) { /* carte fermée */ }
  }

  // liste : [{ id, pseudo, x, y, niveau?, ts?, trace?: [[x, y], …] }] ; [] efface.
  function afficher(liste) {
    _liste = _nettoyer(liste);
    _dessiner();
    clearInterval(_minuteur);
    // Ancienneté (« il y a 3 min ») tenue à jour même sans nouvelle position.
    _minuteur = _liste.length ? setInterval(_dessiner, 30000) : null;
    return _liste.length;
  }

  window.KtaPresences = {
    afficher: afficher,
    // Actions neutres pour un panneau d'extension (« 👥 Équipe ») : jamais déclenchées par l'app seule.
    centrer: function (id) { var p = _trouver(id); if (!p) return false; _allerA(p, true); return true; },
    suivre: function (id) { _suivi = (id && _trouver(id)) ? id : null; if (_suivi) _allerA(_trouver(_suivi), true); return _suivi; },
    suivi: function () { return _suivi; },
    masquerTrace: function (id, masquer) { if (masquer) _tracesMasquees[id] = true; else delete _tracesMasquees[id]; _dessiner(); return !!masquer; },
    traceMasquee: function (id) { return !!_tracesMasquees[id]; },
    nombre: function () { return _liste.length; },
    // Copie de ce qui est affiché (tests, diagnostic).
    liste: function () { return JSON.parse(JSON.stringify(_liste)); }
  };
})();
