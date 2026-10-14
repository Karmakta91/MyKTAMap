/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// 📡 Présences sur le plan ouvert — affichage seulement (prise neutre).
// Une installation reliée (extension) fournit la position des AUTRES personnes qui ont
// choisi de partager la leur sur ce plan ; ce module les dessine : un repère avec le
// pseudo, l'ancienneté de la position, et la trace parcourue. Rien n'est lu ni envoyé
// ici. Sans extension, `afficher` n'est jamais appelé : aucun calque, aucun coût.
// Même principe pour les ITINÉRAIRES que d'autres ont publiés (`afficherItineraires`) :
// calque distinct, pointillés jaunes, étapes ○ / ✓, lecture seule (rien n'est cliquable).
(function () {
  "use strict";
  var ANCIENNE_MS = 2 * 60 * 1000;   // au-delà : repère grisé (position plus mise à jour)
  var MAX_TRACE = 2000;
  var _calque = null;
  var _liste = [];
  var _minuteur = null;
  var _suivi = null;                 // id de la présence suivie (la carte se recentre à chaque mise à jour)
  var _tracesMasquees = {};          // id → true : trace non dessinée
  var MAX_ITI = 5000;
  var _calqueIti = null;
  var _itis = [];
  var _itisMasques = {};             // id → true : itinéraire non dessiné

  // 🎨 Qui est qui : une couleur par personne, tirée de son identifiant (même couleur sur tous les
  // appareils, sans serveur). Palette lisible sur fond sombre comme clair (contour sombre), et qui
  // évite le jaune d'accent (itinéraires), les rouges (urgence), les gris (position ancienne) et le
  // bleu de MON tracker (#8cb4ff) : on ne doit jamais confondre un autre avec soi.
  // 9 teintes choisies pour rester distinctes deux à deux (écart CIELAB ≥ 40, cf check-extensions.js).
  var PALETTE = ["#f5862e", "#2fd92f", "#86a32a", "#ff5cad", "#d933e6",
    "#5068f0", "#14b8a6", "#ffffff", "#8b5a2b"];
  // Empreinte FNV-1a 32 bits de l'identifiant → case de la palette (déterministe).
  function couleurDe(id) {
    var s = String(id === undefined || id === null ? "" : id), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return PALETTE[h % PALETTE.length];
  }

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
        ts: _fini(p.ts) ? p.ts : Date.now(), trace: trace,
        // Couleur facultative (ex. équipe d'une intervention Secours) : #rrggbb seulement.
        couleur: (typeof p.couleur === "string" && /^#[0-9a-f]{6}$/i.test(p.couleur)) ? p.couleur : null
      };
    });
  }

  function _age(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return _t("presence.age.instant");
    return _t("presence.age.min", { n: Math.round(s / 60) });
  }

  // Repère : la forme de l'icône de mon tracker (triangle et rond blanc), redessinée en SVG pour
  // prendre la couleur de la personne. Pas de cap transmis : le repère reste pointe en haut.
  var TAILLE = 40;
  var SVG_NS = "http://www.w3.org/2000/svg";
  function _repere(couleur) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "kta-presence-repere");
    svg.setAttribute("viewBox", "0 0 50 50");
    svg.setAttribute("width", String(TAILLE));
    svg.setAttribute("height", String(TAILLE));
    svg.setAttribute("aria-hidden", "true");
    var tri = document.createElementNS(SVG_NS, "path");
    tri.setAttribute("d", "M25 3 L42 39 L8 39 Z");
    tri.setAttribute("fill", couleur);
    tri.setAttribute("stroke", "#0a0d18");
    tri.setAttribute("stroke-width", "2.5");
    tri.setAttribute("stroke-linejoin", "round");
    var rond = document.createElementNS(SVG_NS, "circle");
    rond.setAttribute("cx", "25"); rond.setAttribute("cy", "31"); rond.setAttribute("r", "5.5");
    rond.setAttribute("fill", "#ffffff");
    rond.setAttribute("stroke", "#0a0d18");
    rond.setAttribute("stroke-width", "2");
    svg.appendChild(tri);
    svg.appendChild(rond);
    return svg;
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
      // Couleur fournie par l'extension (ex. équipe d'une intervention Secours) prioritaire, sinon la sienne.
      var couleur = p.couleur || couleurDe(p.id);
      if (p.trace.length > 1 && !_tracesMasquees[p.id]) {
        L.polyline(p.trace.map(function (q) { return _coord(q[0], q[1]); }), {
          color: couleur, weight: 3, opacity: horsNiveau ? 0.2 : 0.55, dashArray: "6 6", interactive: false
        }).addTo(_calque);
      }
      var el = document.createElement("div");
      el.className = "kta-presence" + (ancienne ? " kta-presence-ancienne" : "") + (horsNiveau ? " kta-presence-hors-niveau" : "");
      el.dataset.couleur = couleur;
      el.appendChild(_repere(couleur));
      var etiquette = document.createElement("span");
      etiquette.className = "kta-presence-etiquette";
      etiquette.textContent = p.pseudo + " · " + _age(p.ts) + (p.niveau !== null ? " · N" + p.niveau : "");
      el.appendChild(etiquette);
      L.marker(_coord(p.x, p.y), {
        icon: L.divIcon({ className: "kta-presence-icone", html: el, iconSize: [TAILLE, TAILLE],
          iconAnchor: [TAILLE / 2, TAILLE / 2] }),
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

  // ── Itinéraires publiés ──
  function _nettoyerItis(liste) {
    if (!Array.isArray(liste)) return [];
    return liste.filter(function (i) {
      return i && typeof i.id === "string" && i.id && typeof i.pseudo === "string" && Array.isArray(i.points);
    }).slice(0, 200).map(function (i) {
      var pts = i.points.filter(function (q) { return Array.isArray(q) && _fini(q[0]) && _fini(q[1]); }).slice(0, MAX_ITI)
        .map(function (q) { return [q[0], q[1], Number.isInteger(q[2]) ? q[2] : null]; });
      var etapes = (Array.isArray(i.etapes) ? i.etapes : []).filter(function (q) {
        return Array.isArray(q) && _fini(q[0]) && _fini(q[1]);
      }).slice(0, 100).map(function (q) { return [q[0], q[1], q[2] === true]; });
      return { id: i.id, pseudo: i.pseudo.trim().slice(0, 40) || "?", points: pts, etapes: etapes,
        ts: _fini(i.ts) ? i.ts : Date.now() };
    }).filter(function (i) { return i.points.length > 1; });
  }
  function _niveauVisible(n) {
    return n === null || typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau({ level: n });
  }
  function _viderItis() {
    if (_calqueIti && _calqueIti._map) { try { _calqueIti._map.removeLayer(_calqueIti); } catch (e) { /* carte fermée */ } }
    _calqueIti = null;
  }
  function _dessinerItis() {
    _viderItis();
    var map = window.map;
    if (!map || !_itis.length || typeof L === "undefined") return;
    _calqueIti = L.layerGroup();
    _itis.forEach(function (it) {
      if (_itisMasques[it.id]) return;
      // Découpé par niveau : un tronçon sur un niveau non affiché est atténué.
      var run = [], niv = it.points[0][2];
      var tracer = function () {
        if (run.length > 1) {
          L.polyline(run, { color: "#f4c542", weight: 4, opacity: _niveauVisible(niv) ? 0.75 : 0.2,
            dashArray: "10 7", interactive: false }).addTo(_calqueIti);
        }
      };
      it.points.forEach(function (q) {
        if (q[2] !== niv) { var dernier = run[run.length - 1]; tracer(); run = dernier ? [dernier] : []; niv = q[2]; }
        run.push(_coord(q[0], q[1]));
      });
      tracer();
      it.etapes.forEach(function (e) {
        L.circleMarker(_coord(e[0], e[1]), { radius: 6, color: "#f4c542", weight: 2, fillColor: e[2] ? "#5ad17a" : "#1a1f2e",
          fillOpacity: 0.9, interactive: false }).addTo(_calqueIti);
      });
      var fin = it.points[it.points.length - 1];
      var el = document.createElement("div");
      el.className = "kta-presence-iti-etiquette";
      el.textContent = "🧭 " + it.pseudo;
      L.marker(_coord(fin[0], fin[1]), {
        icon: L.divIcon({ className: "kta-presence-iti-icone", html: el, iconSize: null, iconAnchor: [0, 0] }),
        keyboard: false, interactive: false, zIndexOffset: 400
      }).addTo(_calqueIti);
    });
    _calqueIti.addTo(map);
  }
  function _trouverIti(id) { for (var i = 0; i < _itis.length; i++) if (_itis[i].id === id) return _itis[i]; return null; }
  // liste : [{ id, pseudo, points: [[x, y, niveau?], …], etapes?: [[x, y, faite], …], ts? }] ; [] efface.
  function afficherItineraires(liste) {
    _itis = _nettoyerItis(liste);
    _dessinerItis();
    return _itis.length;
  }
  function cadrerItineraire(id) {
    var it = _trouverIti(id), map = window.map;
    if (!it || !map || typeof L === "undefined") return false;
    delete _itisMasques[id];
    _dessinerItis();
    try { map.fitBounds(L.latLngBounds(it.points.map(function (q) { return _coord(q[0], q[1]); })), { padding: [30, 30] }); }
    catch (e) { return false; }
    return true;
  }

  // liste : [{ id, pseudo, x, y, niveau?, ts?, trace?: [[x, y], …], couleur?: "#rrggbb" }] ; [] efface.
  // Sans `couleur`, le repère et la trace prennent couleurDe(id).
  function afficher(liste) {
    _liste = _nettoyer(liste);
    _dessiner();
    clearInterval(_minuteur);
    // Ancienneté (« il y a 3 min ») tenue à jour même sans nouvelle position.
    _minuteur = _liste.length ? setInterval(_dessiner, 30000) : null;
    return _liste.length;
  }

  // Sortie du plan (changement de plan, retour à l'accueil) : tout ce qui appartenait à l'ancien plan
  // disparaît — présences, itinéraires, suivi, masquages, minuteur. Sans ça, l'équipe de l'ancien plan
  // était redessinée sur le nouveau à ses anciennes coordonnées (audit UI du 05/10/2026).
  function reinitialiser() {
    clearInterval(_minuteur); _minuteur = null;
    _liste = []; _itis = []; _suivi = null; _tracesMasquees = {}; _itisMasques = {};
    _vider(); _viderItis();
  }

  window.KtaPresences = {
    afficher: afficher,
    // Couleur d'une personne (identifiant de compte) : la même sur la carte et dans un panneau d'extension.
    couleurDe: couleurDe,
    palette: function () { return PALETTE.slice(); },
    reinitialiser: reinitialiser,
    redessiner: function () { _dessiner(); _dessinerItis(); },   // changement de niveau affiché
    // Actions neutres pour un panneau d'extension (« 👥 Équipe ») : jamais déclenchées par l'app seule.
    centrer: function (id) { var p = _trouver(id); if (!p) return false; _allerA(p, true); return true; },
    suivre: function (id) { _suivi = (id && _trouver(id)) ? id : null; if (_suivi) _allerA(_trouver(_suivi), true); return _suivi; },
    suivi: function () { return _suivi; },
    masquerTrace: function (id, masquer) { if (masquer) _tracesMasquees[id] = true; else delete _tracesMasquees[id]; _dessiner(); return !!masquer; },
    traceMasquee: function (id) { return !!_tracesMasquees[id]; },
    afficherItineraires: afficherItineraires,
    cadrerItineraire: cadrerItineraire,
    masquerItineraire: function (id, masquer) { if (masquer) _itisMasques[id] = true; else delete _itisMasques[id]; _dessinerItis(); return !!masquer; },
    itineraireMasque: function (id) { return !!_itisMasques[id]; },
    itineraires: function () { return JSON.parse(JSON.stringify(_itis)); },
    nombre: function () { return _liste.length; },
    // Copie de ce qui est affiché (tests, diagnostic).
    liste: function () { return JSON.parse(JSON.stringify(_liste)); }
  };
})();
