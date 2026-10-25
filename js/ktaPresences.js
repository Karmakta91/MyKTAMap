/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// ktaPresences.js — présences et itinéraires publiés sur le plan ouvert, AFFICHAGE seulement (prise neutre).
// Une installation reliée fournit la position des AUTRES qui ont choisi de la partager : repère avec pseudo,
// ancienneté et trace. Itinéraires publiés (`afficherItineraires`) : calque distinct, pointillés jaunes,
// étapes ○ / ✓, lecture seule. Repères d'une extension (`afficherReperes`, ex. tâches ouvertes) : calques nommés,
// pastille à symbole et teinte de la charte posée près de l'objet. Rien n'est lu ni envoyé ici ; sans extension,
// aucun calque, aucun coût.
// Expose window.KtaPresences (afficher, afficherItineraires, afficherReperes, couleurDe, reinitialiser, actions).
// Garde-fou : scripts/check-extensions.js
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
  var _personnesMasquees = {};       // id → true : ni repère ni trace (« Masquer une personne »)
  var _reperes = {};                 // calque → { liste, groupe, clic }

  // Une couleur par personne, tirée de son identifiant (la même sur tous les appareils, sans serveur). Lisible
  // sur fond sombre et clair ; ⚠️ évite le jaune d'accent (itinéraires), les rouges (urgence), les gris
  // (position ancienne) et le bleu de MON tracker (#8cb4ff) : jamais confondre un autre avec soi.
  // 9 teintes distinctes deux à deux (écart CIELAB ≥ 40, vérifié par check-extensions.js).
  var PALETTE = ["#f5862e", "#2fd92f", "#86a32a", "#ff5cad", "#d933e6",
    "#5068f0", "#14b8a6", "#ffffff", "#8b5a2b"];
  // FNV-1a 32 bits de l'identifiant → case de la palette (déterministe).
  function couleurDe(id) {
    var s = String(id === undefined || id === null ? "" : id), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.codePointAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return PALETTE[h % PALETTE.length];
  }

  function _t(cle, vars) { return window.I18n ? window.I18n.t(cle, vars) : cle; }
  function _coord(x, y) {
    if (typeof window.convertCoord === "function") return window.convertCoord(x, y);
    var h = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
    return [h - y, x];
  }
  function _fini(n) { return typeof n === "number" && isFinite(n); }

  // 🔒 Entrées non conformes écartées : l'extension n'est pas crue sur parole.
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
        // Couleur facultative (ex. équipe Secours) : #rrggbb seulement.
        couleur: (typeof p.couleur === "string" && /^#[0-9a-f]{6}$/i.test(p.couleur)) ? p.couleur : null
      };
    });
  }

  function _age(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return _t("presence.age.instant");
    return _t("presence.age.min", { n: Math.round(s / 60) });
  }

  // Repère = forme de l'icône de mon tracker (triangle + rond blanc) en SVG, à la couleur de la personne. Pas
  // de cap transmis : pointe en haut.
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
      if (_personnesMasquees[p.id]) return;   // masquée depuis le panneau : réversible, oubliée au changement de plan
      var ancienne = Date.now() - p.ts > ANCIENNE_MS;
      // Autre niveau que ceux affichés : repère atténué.
      var horsNiveau = p.niveau !== null && typeof window.passeFiltreNiveau === "function" &&
        !window.passeFiltreNiveau({ level: p.niveau });
      // Couleur fournie par l'extension prioritaire, sinon la sienne.
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
  // Recentre sur une présence (niveau compris) ; zoomer : au moins le zoom 0.
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
      // Découpé par niveau : tronçon sur un niveau non affiché atténué.
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
  // Sans `couleur` : couleurDe(id).
  function afficher(liste) {
    _liste = _nettoyer(liste);
    _dessiner();
    clearInterval(_minuteur);
    // Ancienneté (« il y a 3 min ») tenue à jour sans nouvelle position.
    _minuteur = _liste.length ? setInterval(_dessiner, 30000) : null;
    return _liste.length;
  }

  // ── Repères d'une extension ──
  // ⚠️ Teinte = un nom de jeton de la charte (classe .kta-repere-<teinte>), jamais une couleur libre : le thème clair
  // et les contrastes restent ceux de l'app.
  var TEINTES = ["accent", "interaction", "ok", "avert", "erreur", "violet", "magenta", "neutre"];
  var MAX_REPERES = 500, MAX_CALQUES = 8;
  // 🔒 Entrées non conformes écartées ; textes coupés, posés en texte plus bas (jamais interprétés).
  function _nettoyerReperes(liste) {
    if (!Array.isArray(liste)) return [];
    return liste.filter(function (r) {
      return r && typeof r.id === "string" && r.id && r.id.length <= 80 && _fini(r.x) && _fini(r.y);
    }).slice(0, MAX_REPERES).map(function (r) {
      return {
        id: r.id, x: r.x, y: r.y,
        niveaux: Array.isArray(r.niveaux) ? r.niveaux.filter(function (n) { return Number.isInteger(n); }).slice(0, 8) : [],
        teinte: TEINTES.indexOf(r.teinte) >= 0 ? r.teinte : "neutre",
        symbole: typeof r.symbole === "string" ? Array.from(r.symbole.trim()).slice(0, 2).join("") : "",
        titre: typeof r.titre === "string" ? r.titre.trim().slice(0, 80) : "",
        nombre: Number.isInteger(r.nombre) && r.nombre > 1 ? Math.min(r.nombre, 99) : 0
      };
    });
  }
  function _viderReperes(nom) {
    var c = _reperes[nom];
    if (c && c.groupe && c.groupe._map) { try { c.groupe._map.removeLayer(c.groupe); } catch (e) { /* carte fermée */ } }
    if (c) c.groupe = null;
  }
  var TAILLE_REPERE = 30;
  function _dessinerReperes(nom) {
    _viderReperes(nom);
    var c = _reperes[nom], map = window.map;
    if (!c || !map || !c.liste.length || typeof L === "undefined") return;
    c.groupe = L.layerGroup();
    c.liste.forEach(function (r) {
      var horsNiveau = r.niveaux.length > 0 && !r.niveaux.some(_niveauVisible);
      var el = document.createElement("div");
      el.className = "kta-repere kta-repere-" + r.teinte + (horsNiveau ? " kta-repere-hors-niveau" : "");
      el.dataset.id = r.id;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", r.titre || r.symbole || r.id);
      el.title = r.titre;
      var sym = document.createElement("span");
      sym.className = "kta-repere-symbole";
      sym.textContent = r.symbole || "•";
      el.appendChild(sym);
      if (r.nombre) {
        var n = document.createElement("span");
        n.className = "kta-repere-nombre";
        n.textContent = String(r.nombre);
        el.appendChild(n);
      }
      // Ancré en haut à droite de l'objet : l'icône du point reste visible dessous.
      var m = L.marker(_coord(r.x, r.y), {
        icon: L.divIcon({ className: "kta-repere-icone", html: el, iconSize: [TAILLE_REPERE, TAILLE_REPERE],
          iconAnchor: [-4, TAILLE_REPERE + 4] }),
        keyboard: false, zIndexOffset: 600
      });
      if (typeof m.on === "function") {
        m.on("click", function () {
          if (typeof c.clic !== "function") return;
          try { c.clic(r.id); } catch (e) { console.warn("[Presences] repère :", e); }
        });
      }
      m.addTo(c.groupe);
    });
    c.groupe.addTo(map);
  }
  // nom : calque de l'extension (a-z, 0-9, _ -, 24 car.) ; liste : [{ id, x, y, niveaux?, teinte?, symbole?, titre?,
  // nombre? }] ; [] efface ce calque. clic(id) : appelé au toucher d'un repère (erreur ignorée).
  function afficherReperes(nom, liste, clic) {
    if (typeof nom !== "string" || !/^[a-z0-9_-]{1,24}$/.test(nom)) return 0;
    if (!_reperes[nom] && Object.keys(_reperes).length >= MAX_CALQUES) return 0;
    var c = _reperes[nom] || (_reperes[nom] = { liste: [], groupe: null, clic: null });
    c.liste = _nettoyerReperes(liste);
    c.clic = typeof clic === "function" ? clic : null;
    _dessinerReperes(nom);
    if (!c.liste.length) delete _reperes[nom];
    return c.liste.length;
  }

  // 🩸 Sortie du plan : tout ce qui appartenait à l'ancien plan disparaît (présences, itinéraires, repères, suivi,
  // masquages, minuteur), sinon l'équipe est redessinée sur le nouveau plan à ses anciennes coordonnées.
  function reinitialiser() {
    clearInterval(_minuteur); _minuteur = null;
    _liste = []; _itis = []; _suivi = null; _tracesMasquees = {}; _itisMasques = {};
    _personnesMasquees = {};
    _vider(); _viderItis();
    Object.keys(_reperes).forEach(_viderReperes);
    _reperes = {};
  }

  window.KtaPresences = {
    afficher: afficher,
    // Couleur d'une personne : la même sur la carte et dans un panneau d'extension.
    couleurDe: couleurDe,
    palette: function () { return PALETTE.slice(); },
    reinitialiser: reinitialiser,
    redessiner: function () { _dessiner(); _dessinerItis(); Object.keys(_reperes).forEach(_dessinerReperes); },   // niveau affiché
    // Actions neutres pour un panneau d'extension (« 👥 Équipe »), jamais déclenchées par l'app seule.
    centrer: function (id) { var p = _trouver(id); if (!p) return false; _allerA(p, true); return true; },
    suivre: function (id) { _suivi = (id && _trouver(id)) ? id : null; if (_suivi) _allerA(_trouver(_suivi), true); return _suivi; },
    suivi: function () { return _suivi; },
    masquerTrace: function (id, masquer) { if (masquer) _tracesMasquees[id] = true; else delete _tracesMasquees[id]; _dessiner(); return !!masquer; },
    traceMasquee: function (id) { return !!_tracesMasquees[id]; },
    // Masquer une personne : repère ET trace (son itinéraire a son propre réglage) ; on cesse de la suivre.
    masquerPersonne: function (id, masquer) {
      if (masquer) { _personnesMasquees[id] = true; if (_suivi === id) _suivi = null; } else delete _personnesMasquees[id];
      _dessiner();
      return !!masquer;
    },
    personneMasquee: function (id) { return !!_personnesMasquees[id]; },
    afficherItineraires: afficherItineraires,
    cadrerItineraire: cadrerItineraire,
    masquerItineraire: function (id, masquer) { if (masquer) _itisMasques[id] = true; else delete _itisMasques[id]; _dessinerItis(); return !!masquer; },
    itineraireMasque: function (id) { return !!_itisMasques[id]; },
    itineraires: function () { return JSON.parse(JSON.stringify(_itis)); },
    afficherReperes: afficherReperes,
    // Copie des repères d'un calque (tests, diagnostic).
    reperes: function (nom) { return _reperes[nom] ? JSON.parse(JSON.stringify(_reperes[nom].liste)) : []; },
    nombre: function () { return _liste.length; },
    // Copie de ce qui est affiché (tests, diagnostic).
    liste: function () { return JSON.parse(JSON.stringify(_liste)); }
  };
})();
