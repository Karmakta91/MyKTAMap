/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// voiceCommand.js — commandes vocales push-to-talk (Web Speech API) : navigation, actions de session,
//   réglages, sortie d'urgence, itinéraire vers un POI nommé. Sans SpeechRecognition (Firefox) : pas de bouton.
// Expose : window.VoiceCommand (isSupported, isEnabled, setEnabled, startListening, stopListening,
//   registerCommand, afficherAide).
// 🔒 OPT-IN dans Réglages, jamais activé d'office : la permission micro est sensible.
// ⚠️ Français seulement (fr-FR, motifs FR) : le bouton 🎤 n'existe que si l'app est en français
//   (décision produit), réévalué à chaque changement de langue.
// 🩸 La reconnaissance passe par un service distant : hors ligne, elle échoue (erreur « network »).

(function() {
  "use strict";

  const LS_KEY = "myktamap_voice_enabled_v1";

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Appelé AU RENDU ; sans I18n, rend la clé brute (jamais de crash).
  function _t(key, params) {
    if (window.I18n && typeof window.I18n.t === "function") {
      return window.I18n.t(key, params);
    }
    return key;
  }

  // `labelKey` (i18n, commandes intégrées) prime sur `label` (chaîne fixe d'un module tiers).
  function _cmdLabel(cmd) {
    if (!cmd) return "";
    if (cmd.labelKey) return _t(cmd.labelKey);
    return cmd.label || "";
  }

  let _recognition = null;
  let _isListening = false;
  let _micButton   = null;
  let _liveOverlay = null;
  let _enabled     = false;

  try {
    _enabled = localStorage.getItem(LS_KEY) === "1";
  } catch(e) { _enabled = false; }

  // ── Registre des commandes ──────────────────────────────
  // Commande = { patterns: [string|regex], handler: fn(matches), label|labelKey, priority? }.
  // Une chaîne matche si le transcript la CONTIENT ; une regex, si test() réussit.
  const _commands = [];

  function registerCommand(cmd) {
    if (!cmd || !cmd.patterns || !cmd.handler) {
      console.warn("[VoiceCommand] registerCommand : missing patterns/handler");
      return;
    }
    _commands.push(cmd);
  }

  // 🩸 Le motif le plus LONG gagne (le plus spécifique), puis `priority`, puis l'ordre d'enregistrement.
  // Au premier motif trouvé, « où est la sortie » ouvrirait la RECHERCHE (« où est ») sans erreur visible.
  function _matchCommand(transcript) {
    const text = String(transcript || "").toLowerCase().trim();
    if (!text) return null;
    let best = null;
    _commands.forEach(function(cmd, order) {
      const prio = cmd.priority || 0;
      for (const p of cmd.patterns) {
        let matches = null, len = 0;
        if (typeof p === "string") {
          if (text === p || text.indexOf(p) !== -1) { matches = [text]; len = p.length; }
        } else if (p instanceof RegExp) {
          const m = text.match(p);
          if (m) { matches = m; len = (m[0] || "").length; }
        }
        if (!matches) continue;
        if (!best || len > best.len || (len === best.len && prio > best.prio)) {
          best = { cmd: cmd, matches: matches, len: len, prio: prio, order: order };
        }
      }
    });
    return best ? { cmd: best.cmd, matches: best.matches } : null;
  }

  // ── Reconnaissance ──────────────────────────────
  function _initRecognition() {
    if (!SR) return null;
    const r = new SR();
    r.lang = "fr-FR";
    r.continuous = false;       // une seule phrase puis stop (push-to-talk)
    r.interimResults = true;    // affiche transcription live pendant qu'on parle
    r.maxAlternatives = 1;

    r.onresult = function(event) {
      let interim = "";
      let finalT  = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalT  += res[0].transcript;
        else              interim += res[0].transcript;
      }
      _updateLive(finalT || interim, finalT ? "final" : "interim");
      if (finalT) _onFinalTranscript(finalT);
    };

    r.onerror = function(event) {
      console.warn("[VoiceCommand] onerror :", event.error);
      let msg = _t("voice.err.generic", { err: event.error });
      if (event.error === "no-speech") msg = _t("voice.err.noSpeech");
      else if (event.error === "not-allowed") msg = _t("voice.err.notAllowed");
      else if (event.error === "audio-capture") msg = _t("voice.err.audioCapture");
      // Service distant : sous terre, l'erreur est « network » → message « hors ligne ».
      else if (event.error === "network") msg = _t("voice.err.offline");
      _updateLive(msg, "error");
      setTimeout(_hideLiveOverlay, 2500);
      _setListening(false);
      _recognition = null;   // libère le MediaStream (cf stopListening)
    };

    r.onend = function() {
      _setListening(false);
      _recognition = null;
    };

    return r;
  }

  function startListening() {
    if (!_enabled) return;
    if (!SR) {
      console.warn("[VoiceCommand] SpeechRecognition non supporté");
      return;
    }
    // Hors ligne : le dire tout de suite plutôt qu'un échec « network » 2 s plus tard.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      _showLiveOverlay();
      _updateLive(_t("voice.err.offline"), "error");
      setTimeout(_hideLiveOverlay, 2500);
      return;
    }
    if (!_recognition) _recognition = _initRecognition();
    if (!_recognition || _isListening) return;
    _showLiveOverlay();
    _updateLive(_t("voice.live.listening"), "listening");
    try {
      _recognition.start();
      _setListening(true);
    } catch(e) {
      console.warn("[VoiceCommand] start KO :", e);
      _setListening(false);
    }
  }

  function stopListening() {
    // 🩸 iOS Safari : `stop()` attend un résultat et l'indicateur micro reste allumé tant que le
    // MediaStream vit. D'où `abort()` et _recognition = null ; une instance neuve est créée au prochain
    // startListening().
    if (_recognition && _isListening) {
      try { _recognition.abort(); } catch(e) {
        try { _recognition.stop(); } catch(e2) {}
      }
    }
    _setListening(false);
    _recognition = null;
  }

  function _setListening(b) {
    _isListening = !!b;
    if (_micButton) {
      _micButton.classList.toggle("kta-voice-mic-listening", _isListening);
      _micButton.setAttribute("aria-pressed", _isListening ? "true" : "false");
    }
  }

  function _onFinalTranscript(text) {
    const match = _matchCommand(text);
    if (match) {
      _updateLive("✅ " + (_cmdLabel(match.cmd) || text), "success");
      let isAsync = false;
      try {
        const ret = match.cmd.handler(match.matches);
        // ⚠️ Handler async (Promise) : pas de masquage auto à 1,5 s, il gère lui-même l'overlay.
        if (ret && typeof ret.then === "function") isAsync = true;
      } catch(e) {
        console.error("[VoiceCommand] handler error :", e);
        _updateLive(_t("voice.err.handler", { err: (e.message || e) }), "error");
        setTimeout(_hideLiveOverlay, 2500);
        stopListening();
        return;
      }
      if (!isAsync) setTimeout(_hideLiveOverlay, 1500);
    } else {
      _updateLive(_t("voice.live.unknown", { text: text }), "unknown");
      setTimeout(_hideLiveOverlay, 2500);
    }
    // 🩸 Arrêt EXPLICITE après chaque phrase finale : malgré `continuous = false`, iOS garde le micro
    // ouvert et capte les voix voisines. Un handler async déjà lancé n'en est pas affecté.
    stopListening();
  }

  // ── Bouton micro, overlay, aide ──────────────────────────────
  function _langueFr() {
    try {
      if (window.I18n && typeof window.I18n.getLang === "function") {
        return window.I18n.getLang() === "fr";
      }
    } catch(e) {}
    return true;
  }

  function _injectMicButton() {
    if (_micButton || !SR || !_langueFr()) return;
    const btn = document.createElement("button");
    btn.id        = "kta-voice-mic";
    btn.className = "kta-voice-mic";
    btn.type      = "button";
    btn.setAttribute("aria-label", _t("voice.mic.aria"));
    btn.setAttribute("aria-pressed", "false");
    btn.title     = _t("voice.mic.title");
    btn.innerHTML = "🎤";
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (_isListening) stopListening();
      else              startListening();
    });
    document.body.appendChild(btn);
    _micButton = btn;
  }

  function _removeMicButton() {
    if (_micButton) _micButton.remove();
    _micButton = null;
  }

  function _showLiveOverlay() {
    if (_liveOverlay) return;
    const o = document.createElement("div");
    o.id        = "kta-voice-live";
    o.className = "kta-voice-live";
    o.innerHTML =
      '<div class="kta-voice-live-icon">🎤</div>' +
      '<div class="kta-voice-live-text" id="kta-voice-live-text">' + _t("voice.live.listeningShort") + '</div>' +
      '<button class="kta-voice-live-close" type="button" id="kta-voice-live-close" aria-label="' + _t("voice.live.closeAria") + '">✕</button>';
    document.documentElement.appendChild(o);
    _liveOverlay = o;
    document.getElementById("kta-voice-live-close").addEventListener("click", function() {
      stopListening();
      _hideLiveOverlay();
    });
  }

  function _hideLiveOverlay() {
    if (_liveOverlay) _liveOverlay.remove();
    _liveOverlay = null;
  }

  function _updateLive(text, state) {
    if (!_liveOverlay) return;
    const t = document.getElementById("kta-voice-live-text");
    if (t) t.textContent = text;
    _liveOverlay.dataset.state = state || "";
  }

  function _afficherAideModale() {
    if (document.getElementById("kta-voice-aide-modal")) return;
    // 🩸 Overlay masqué TOUT DE SUITE : resté 1,5 s, il cache la modale et l'aide semble ne pas s'ouvrir.
    _hideLiveOverlay();

    const m = document.createElement("div");
    m.id        = "kta-voice-aide-modal";
    m.className = "kta-readme-modal-overlay";
    m.style.display = "flex";

    function _patternsToHtml(patterns) {
      return patterns.slice(0, 3).map(function(p) {
        if (typeof p === "string") return "« " + p + " »";
        if (p instanceof RegExp) {
          // Regex rendue lisible.
          const s = p.source
            .replace(/\\s\+/g, " <terme>")
            .replace(/\(\?:.*?\)/g, "")
            .replace(/[\^\$\(\)\?:|\\b]/g, "")
            .replace(/\\\./g, ".");
          return "« " + s + " »";
        }
        return "";
      }).join(" · ");
    }

    let listHtml = '<ul class="kta-voice-aide-list">';
    _commands.forEach(function(c) {
      listHtml += '<li>' +
                    '<strong>' + (_cmdLabel(c) || _t("voice.aide.noLabel")) + '</strong>' +
                    '<span class="kta-voice-aide-patterns">' + _patternsToHtml(c.patterns) + '</span>' +
                  '</li>';
    });
    listHtml += '</ul>';

    m.innerHTML =
      '<div class="kta-readme-modal-boite" style="max-width:560px;">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _t("voice.aide.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-voice-aide-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps">' +
          '<p style="font-size:13px; color:#c8d0e0; line-height:1.6; margin-top:0;">' +
            _t("voice.aide.intro") +
          '</p>' +
          listHtml +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(m);
    document.getElementById("kta-voice-aide-close").addEventListener("click", function() {
      m.remove();
    });
    m.addEventListener("click", function(e) { if (e.target === m) m.remove(); });
  }

  function isEnabled()   { return _enabled; }
  function isSupported() { return !!SR; }

  function setEnabled(b) {
    _enabled = !!b;
    try { localStorage.setItem(LS_KEY, _enabled ? "1" : "0"); } catch(e) {}
    if (_enabled) {
      _injectMicButton();
    } else {
      _removeMicButton();
      stopListening();
      _hideLiveOverlay();
    }
  }

  // ── Commandes intégrées ──────────────────────────────
  // Handlers défensifs (typeof) : un module absent → warn console, pas de crash. Motifs nombreux
  // (impératif, indicatif, synonymes) ; un motif court (« aide ») matche aussi dans une phrase longue.
  function _registerBuiltins() {
    // ─── Navigation ──────────────────────────────
    registerCommand({
      patterns: [
        "zoom plus", "zoom avant", "zoomer", "agrandir",
        "rapproche", "rapprocher", "plus près", "approcher",
        "augmente le zoom", "augmenter le zoom", "monte le zoom"
      ],
      labelKey: "voice.cmd.zoomIn",
      handler:  function() { if (window.map) window.map.zoomIn(); }
    });
    registerCommand({
      patterns: [
        "zoom moins", "zoom arrière", "dézoomer", "réduire le zoom",
        "diminuer", "diminue le zoom", "éloigne", "éloigner",
        "plus loin", "moins de zoom", "baisse le zoom", "baisser le zoom"
      ],
      labelKey: "voice.cmd.zoomOut",
      handler:  function() { if (window.map) window.map.zoomOut(); }
    });
    registerCommand({
      patterns: [
        "centrer", "vue d'ensemble", "tout voir", "vue globale",
        "recadrer", "ajuster vue", "ajuster la vue", "tout afficher",
        "vue large", "vue complète", "ramène la vue", "centre la carte",
        "centrer la carte"
      ],
      labelKey: "voice.cmd.center",
      handler:  function() {
        if (window.map && window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.convertCoord) {
          const W = window.PLAN_CONFIG.plan.imageWidth;
          const H = window.PLAN_CONFIG.plan.imageHeight;
          if (W && H) {
            const sw = window.convertCoord(0, 0);
            const ne = window.convertCoord(W, H);
            window.map.fitBounds([sw, ne]);
          }
        }
      }
    });
    registerCommand({
      patterns: [
        "recherche", "rechercher", "ouvre la recherche", "ouvrir recherche",
        "recherche unifiée", "trouver", "trouve", "cherche", "chercher",
        "où est", "où sont", "find", "ouvre la barre de recherche",
        "lance la recherche", "lancer la recherche"
      ],
      labelKey: "voice.cmd.search",
      handler:  function() {
        if (typeof window.ouvrirRecherche === "function") window.ouvrirRecherche();
      }
    });

    // ─── Actions de session ─────────────────────────
    registerCommand({
      patterns: [
        "ajouter point", "ajoute point", "ajoute un point", "nouveau point",
        "nouveau poi", "crée point", "crée un point", "créer point",
        "place point", "place un point", "marquer point", "marquer ici",
        "ajouter un point", "mets un point", "met un point", "pose un point"
      ],
      labelKey: "voice.cmd.addPoint",
      handler:  function() {
        if (typeof window.ajouterPointEditor === "function" && window.map) {
          const center = window.map.getCenter();
          if (window.PLAN_CONFIG && window.PLAN_CONFIG.plan) {
            const H = window.PLAN_CONFIG.plan.imageHeight;
            const x = center.lng;
            const y = H - center.lat;
            window.ajouterPointEditor({ x: x, y: y });
          }
        }
      }
    });

    // « aller à / va à / emmène-moi à / guide-moi vers / naviguer vers / itinéraire vers / go to <nom> » :
    // itinéraire depuis la position du tracker vers le premier POI de SearchPoints.findByQuery
    // (window.itineraireYAller). Handler ASYNC : il gère lui-même l'overlay.
    registerCommand({
      patterns: [
        /(?:aller\s+(?:à|a)|va\s+(?:à|a)|vas\s+(?:à|a)|emmène[-\s]?moi\s+(?:à|a)|emmene[-\s]?moi\s+(?:à|a)|guide[-\s]?moi\s+(?:vers|à|a)|naviguer\s+vers|navigue\s+vers|itin[ée]raire\s+(?:vers|jusqu[' ]à)|iti\s+vers|go\s+to|trace\s+moi\s+vers|trace\s+itin[ée]raire\s+vers)\s+(.+)/i
      ],
      labelKey: "voice.cmd.route",
      handler:  function(matches) {
        return (async function() {
          const rawQuery = (matches && matches[1] ? matches[1] : "").trim();
          // Ponctuation finale retirée.
          const query = rawQuery.replace(/[.?!,;:]+$/, "").trim();
          if (!query) {
            _updateLive(_t("voice.route.noDest"), "unknown");
            setTimeout(_hideLiveOverlay, 2000);
            return;
          }
          _updateLive(_t("voice.route.searching", { q: query }), "interim");

          if (!window.SearchPoints || typeof window.SearchPoints.findByQuery !== "function") {
            _updateLive(_t("voice.route.noSearchModule"), "error");
            setTimeout(_hideLiveOverlay, 2500);
            return;
          }

          let results;
          try {
            results = await window.SearchPoints.findByQuery(query);
          } catch(e) {
            console.warn("[VoiceCommand] findByQuery KO :", e);
            _updateLive(_t("voice.route.searchErr", { err: (e.message || e) }), "error");
            setTimeout(_hideLiveOverlay, 2500);
            return;
          }

          if (!results || results.length === 0) {
            _updateLive(_t("voice.route.notFound", { q: query }), "unknown");
            setTimeout(_hideLiveOverlay, 2500);
            return;
          }

          const first = results[0].point || results[0];
          const nom = first.nom || first.id || query;
          const x = first.x, y = first.y;

          if (typeof x !== "number" || typeof y !== "number") {
            _updateLive(_t("voice.route.badCoords", { nom: nom }), "error");
            setTimeout(_hideLiveOverlay, 2500);
            return;
          }

          // Sans position du tracker, itineraireYAller afficherait une alerte : refusé avant.
          const trackerPos = (typeof window.getTrackingPosition === "function")
                             ? window.getTrackingPosition()
                             : null;
          if (!trackerPos || typeof trackerPos.x !== "number") {
            _updateLive(_t("voice.route.noTracker"), "error");
            setTimeout(_hideLiveOverlay, 3500);
            return;
          }

          if (typeof window.itineraireYAller !== "function") {
            _updateLive(_t("voice.route.noRouteModule"), "error");
            setTimeout(_hideLiveOverlay, 2500);
            return;
          }

          const countTxt = _t(results.length > 1 ? "voice.route.resultCountMany"
                                                  : "voice.route.resultCountOne",
                              { n: results.length });
          _updateLive(_t("voice.route.going", { dest: nom, count: countTxt }), "success");
          try {
            window.itineraireYAller(x, y, nom);
          } catch(e) {
            console.error("[VoiceCommand] itineraireYAller KO :", e);
            _updateLive(_t("voice.route.calcErr", { err: (e.message || e) }), "error");
            setTimeout(_hideLiveOverlay, 2500);
            return;
          }
          setTimeout(_hideLiveOverlay, 2000);
        })();
      }
    });
    registerCommand({
      patterns: [
        "tracker démarrer", "démarrer tracker", "démarrer le tracker",
        "démarre tracker", "démarre le tracker", "tracker on", "tracker marche",
        "allume tracker", "allume le tracker", "allumer tracker", "allumer le tracker",
        "active tracker", "active le tracker", "activer tracker", "activer le tracker",
        "commencer suivi", "commence le suivi", "commence suivi", "démarre le suivi",
        "lance le tracker", "lance tracker", "lancer le tracker",
        "suivi on", "suivi marche", "active le suivi"
      ],
      labelKey: "voice.cmd.trackerStart",
      handler:  function() {
        if (typeof window.startTracking === "function") window.startTracking();
      }
    });
    registerCommand({
      patterns: [
        "tracker arrêter", "arrêter tracker", "arrêter le tracker",
        "arrête tracker", "arrête le tracker", "tracker off", "tracker pause",
        "éteins tracker", "éteins le tracker", "éteindre tracker", "éteindre le tracker",
        "désactive tracker", "désactive le tracker", "désactiver tracker",
        "stop tracker", "stop le tracker", "arrêter le suivi", "arrête le suivi",
        "stop suivi", "suivi off", "suivi stop", "couper tracker", "coupe tracker",
        "coupe le tracker"
      ],
      labelKey: "voice.cmd.trackerStop",
      handler:  function() {
        if (typeof window.stopTracking === "function") window.stopTracking();
      }
    });
    registerCommand({
      patterns: [
        "affichage xl", "affichage x l", "mode xl", "grand affichage",
        "mode urgence", "lance urgence", "lance l'urgence", "lancer urgence",
        "lancer l'urgence", "active urgence", "active l'urgence",
        "activer urgence", "activer l'urgence", "déclencher urgence",
        "déclenche urgence", "déclenche l'urgence", "ouvrir urgence",
        "ouvre l'urgence", "urgence", "alarme", "alerte", "sos",
        "appelle à l'aide", "appel à l'aide", "au secours", "à l'aide"
      ],
      labelKey: "voice.cmd.emergency",
      priority: 5,   // commande vitale : gagne les égalités de longueur
      handler:  function() {
        if (window.EmergencyMode && typeof window.EmergencyMode.activer === "function") {
          window.EmergencyMode.activer();
        }
      }
    });
    registerCommand({
      patterns: [
        "mode secours", "lance secours", "lancer secours", "lance le secours",
        "lancer le secours", "ouvrir secours", "ouvre secours", "ouvre le secours",
        "active secours", "activer secours", "active le secours", "activer le secours",
        "secours", "secourir"
      ],
      labelKey: "voice.cmd.rescue",
      priority: 5,
      handler:  function() {
        if (window.SecoursMode && typeof window.SecoursMode.ouvrir === "function") {
          window.SecoursMode.ouvrir();
        }
      }
    });

    // ─── Réglages ────────────────────────────────
    registerCommand({
      patterns: [
        "thème clair", "thème blanc", "mode clair", "mode blanc",
        "passe en clair", "passer en clair", "mode jour", "thème jour",
        "passe en thème clair", "active mode clair", "clair"
      ],
      labelKey: "voice.cmd.themeLight",
      handler:  function() {
        if (window.ThemeManager && typeof window.ThemeManager.setTheme === "function") {
          window.ThemeManager.setTheme("light");
        }
      }
    });
    registerCommand({
      patterns: [
        "thème sombre", "thème dark", "thème noir", "mode sombre",
        "mode dark", "mode noir", "passe en sombre", "passer en sombre",
        "mode nuit", "thème nuit", "passe en thème sombre",
        "active mode sombre", "sombre"
      ],
      labelKey: "voice.cmd.themeDark",
      handler:  function() {
        if (window.ThemeManager && typeof window.ThemeManager.setTheme === "function") {
          window.ThemeManager.setTheme("dark");
        }
      }
    });

    // ─── Méta ────────────────────────────────────
    registerCommand({
      patterns: [
        "aide", "ouvre aide", "ouvrir aide", "ouvre l'aide", "ouvrir l'aide",
        "affiche aide", "afficher aide", "affiche l'aide", "afficher l'aide",
        "montre aide", "montre l'aide", "montrer l'aide",
        "liste commandes", "liste les commandes", "quelles sont les commandes",
        "que puis-je dire", "que peut-on dire", "commandes disponibles",
        "show help", "help"
      ],
      labelKey: "voice.cmd.help",
      handler:  function() { _afficherAideModale(); }
    });
    registerCommand({
      patterns: [
        "stop", "arrête", "arrêter", "annule", "annuler", "annule tout",
        "tais-toi", "tais toi", "chut", "silence",
        "arrête l'écoute", "arrêter l'écoute", "stop écoute"
      ],
      labelKey: "voice.cmd.stop",
      handler:  function() { stopListening(); }
    });
    registerCommand({
      patterns: [
        "fermer modale", "fermer", "ferme", "ferme ça", "fermer popup",
        "ferme popup", "ferme la popup", "fermer fenêtre", "ferme la fenêtre",
        "ferme la modale", "fermer la modale", "fermer cette fenêtre",
        "annuler modale", "quitter modale", "quitte la modale"
      ],
      labelKey: "voice.cmd.close",
      handler:  function() {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      }
    });

    // Sortie la plus proche (pathfinder). Motifs volontairement larges : l'utilisateur est stressé.
    registerCommand({
      patterns: [
        "sortie", "la sortie", "sortie urgence", "sortie d'urgence",
        "sortie de secours", "trouve la sortie", "trouver la sortie",
        "cherche la sortie", "chercher la sortie", "ressortir", "sortir",
        "je dois sortir", "comment sortir", "où est la sortie",
        "ou est la sortie", "sors", "sortir d'ici", "au secours sortie",
        "issue", "issue de secours"
        // Pas de motif « urgence » seul : l'écran d'urgence XL le prend.
      ],
      labelKey: "voice.cmd.exit",
      priority: 10,   // LA commande vitale : gagne toute égalité
      handler:  function() {
        if (window.SortieUrgence && typeof window.SortieUrgence.declencher === "function") {
          window.SortieUrgence.declencher();
        } else {
          console.warn("[VoiceCommand] SortieUrgence indisponible");
        }
      }
    });
  }

  _registerBuiltins();

  // ── Démarrage ──────────────────────────────
  function _initUI() {
    if (_enabled && isSupported()) _injectMicButton();
  }

  function _surChangementLangue() {
    if (_langueFr()) {
      if (_enabled && isSupported()) _injectMicButton();
    } else {
      stopListening();
      _hideLiveOverlay();
      _removeMicButton();
    }
  }
  if (window.I18n && typeof window.I18n.onChange === "function") {
    window.I18n.onChange(_surChangementLangue);
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    _initUI();
  } else {
    document.addEventListener("DOMContentLoaded", _initUI);
  }

  window.VoiceCommand = {
    isSupported:      isSupported,
    isEnabled:        isEnabled,
    setEnabled:       setEnabled,
    startListening:   startListening,
    stopListening:    stopListening,
    registerCommand:  registerCommand,
    afficherAide:     _afficherAideModale,
    _commands:        _commands
  };

  console.log("[VoiceCommand] Module chargé (E1 v1.34.0). Supporté :",
              isSupported(), "Activé :", _enabled, "Commandes :", _commands.length);
})();
