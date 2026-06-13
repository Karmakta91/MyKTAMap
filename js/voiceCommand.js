/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 */

// =========================
// VOICE COMMAND — E1 v1.34.0
// =========================
//
// Commandes vocales push-to-talk pour piloter MyKTAMap à la voix.
// Idéal sous terre quand les mains sont prises (corde, sac, lampe).
//
// Stack :
// - Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
//   ✅ Chrome / Edge / Safari iOS 14.5+ / Chrome Android
//   ❌ Firefox (graceful degradation : pas de bouton mic)
// - Push-to-talk : bouton mic flottant. L'user appuie, parle, lâche.
// - Langue : FR (langue principale du projet)
// - Permission micro demandée à la 1ère utilisation par le navigateur.
//
// Activation : OPT-IN dans la modale Réglages → "🎤 Commandes vocales (BETA)".
// La permission micro est sensible → on ne l'active jamais auto.
//
// Commandes MVP (~17) :
//   📐 Navigation : zoom +/-, centrer, recherche
//   ✏️ Actions session : ajouter point, tracker on/off, urgence, secours
//   🌓 Réglages : thème clair/sombre
//   🛑 Méta : stop, fermer modale, aide
//
// API publique :
//   window.VoiceCommand = {
//     isSupported():      boolean,
//     isEnabled():        boolean,
//     setEnabled(b):      void,    // persiste + inject/remove bouton
//     startListening():   void,    // déclenche reconnaissance
//     stopListening():    void,
//     registerCommand(c): void,    // pour modules tiers
//     afficherAide():     void     // ouvre modale aide commandes
//   };

(function() {
  "use strict";

  const LS_KEY = "myktamap_voice_enabled_v1";

  // Detect SpeechRecognition (préfixe webkit pour Safari iOS)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Helper i18n défensif : appelé AU RENDU. Si window.I18n absent (chargement
  // partiel / offline cassé), retombe sur la clé brute (signal de dette visible,
  // jamais de crash). Interpolation via params {nom}.
  function _t(key, params) {
    if (window.I18n && typeof window.I18n.t === "function") {
      return window.I18n.t(key, params);
    }
    return key;
  }

  // Résout le libellé affiché d'une commande AU RENDU : `labelKey` (built-ins,
  // traduit via i18n) prioritaire, sinon `label` brut (modules tiers qui
  // enregistrent une string fixe via registerCommand).
  function _cmdLabel(cmd) {
    if (!cmd) return "";
    if (cmd.labelKey) return _t(cmd.labelKey);
    return cmd.label || "";
  }

  // ============================================================
  // MODULE STATE
  // ============================================================
  let _recognition = null;
  let _isListening = false;
  let _micButton   = null;
  let _liveOverlay = null;
  let _enabled     = false;

  // Restaure l'état activation depuis localStorage
  try {
    _enabled = localStorage.getItem(LS_KEY) === "1";
  } catch(e) { _enabled = false; }

  // ============================================================
  // 🔌 COMMAND REGISTRY
  // ============================================================
  // Chaque commande = { patterns: [string|regex], handler: fn(matches), label }
  // Les patterns sont matchés dans l'ordre, premier hit gagne.
  // Un pattern string match si le transcript LE CONTIENT (substring match).
  // Un pattern regex match si test() retourne true.
  const _commands = [];

  function registerCommand(cmd) {
    if (!cmd || !cmd.patterns || !cmd.handler) {
      console.warn("[VoiceCommand] registerCommand : missing patterns/handler");
      return;
    }
    _commands.push(cmd);
  }

  function _matchCommand(transcript) {
    const text = String(transcript || "").toLowerCase().trim();
    if (!text) return null;
    for (const cmd of _commands) {
      for (const p of cmd.patterns) {
        if (typeof p === "string") {
          if (text === p || text.indexOf(p) !== -1) {
            return { cmd: cmd, matches: [text] };
          }
        } else if (p instanceof RegExp) {
          const m = text.match(p);
          if (m) return { cmd: cmd, matches: m };
        }
      }
    }
    return null;
  }

  // ============================================================
  // 🎤 SPEECH RECOGNITION SETUP
  // ============================================================

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
      // Affiche le texte interim pendant qu'on parle, final quand fini
      _updateLive(finalT || interim, finalT ? "final" : "interim");
      if (finalT) _onFinalTranscript(finalT);
    };

    r.onerror = function(event) {
      console.warn("[VoiceCommand] onerror :", event.error);
      let msg = _t("voice.err.generic", { err: event.error });
      if (event.error === "no-speech") msg = _t("voice.err.noSpeech");
      else if (event.error === "not-allowed") msg = _t("voice.err.notAllowed");
      else if (event.error === "audio-capture") msg = _t("voice.err.audioCapture");
      _updateLive(msg, "error");
      setTimeout(_hideLiveOverlay, 2500);
      _setListening(false);
      // 🩹 v1.34.2 — libère la ref pour GC du MediaStream (cf bug iOS
      // indicateur micro persistant après stop dans stopListening).
      _recognition = null;
    };

    r.onend = function() {
      _setListening(false);
      // 🩹 v1.34.2 — libère la ref pour GC du MediaStream. À la prochaine
      // startListening(), une nouvelle instance est créée via _initRecognition().
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
    // 🩹 v1.34.2 — KARMA bug iPhone : "l'arret d'enrengistrement bug, il me
    // met icone violet 'arreté' mais en haut sur mon iphone c'est toujours
    // en écoute".
    // Cause : sur iOS Safari, `recognition.stop()` est trop "doux" — il
    // attend de retourner le SpeechRecognitionResult avec l'audio capté,
    // et l'indicateur micro iOS (point orange en haut) reste actif tant
    // que le MediaStream sous-jacent n'est pas libéré.
    // Fix : utiliser `.abort()` (kill immédiat sans tenter de result) +
    // forcer la libération de la référence _recognition à null pour que
    // le GC release le stream audio. À la prochaine activation, on crée
    // une nouvelle instance fraîche via _initRecognition().
    if (_recognition && _isListening) {
      try { _recognition.abort(); } catch(e) {
        // Fallback si .abort() pas dispo (très vieux browser)
        try { _recognition.stop(); } catch(e2) {}
      }
    }
    _setListening(false);
    // Libère la référence → GC release MediaStream → indicateur micro iOS off.
    // Une nouvelle instance sera créée à la prochaine startListening().
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
        // 🩹 v1.34.0-fix2 — Si le handler retourne une Promise (handler async),
        // on saute l'auto-hide 1.5s : c'est le handler qui gère son propre
        // cycle de vie de l'overlay (recherche → résultat → hide). Cas usage
        // typique : "aller à <POI>" qui fait un findByQuery + Pathfinder
        // async qui peuvent prendre plusieurs secondes.
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
    // 🩹 v1.34.3 — STOP EXPLICITE après chaque transcript final.
    // KARMA bug : "si je dis aller a drapeau, il me trouve l'itineraire,
    // mais reste en ecoute (j'ai la télé allumé, mais sous terre on peut
    // avoir des gens qui parle a coté) donc si recherche effectuer (point
    // trouvé, aide ouverte) on coupe le micro".
    // Pourquoi : malgré `recognition.continuous = false`, iOS Safari garde
    // le micro warm et peut continuer à capturer du bruit de fond avant
    // que onend ne fire. Push-to-talk strict : 1 click → 1 phrase → stop
    // immédiat. Évite la capture parasite TV / voix nearby.
    // Pour les handlers async : ils ont déjà été dispatché (handler() s'est
    // exécuté = Promise lancée), arrêter la recognition ne les affecte pas.
    stopListening();
  }

  // ============================================================
  // 🎨 UI — BOUTON MIC FLOTTANT
  // ============================================================

  function _injectMicButton() {
    if (_micButton || !SR) return;
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

  // ============================================================
  // 🎨 UI — OVERLAY TRANSCRIPTION LIVE
  // ============================================================

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

  // ============================================================
  // 🎨 UI — MODALE AIDE COMMANDES
  // ============================================================

  function _afficherAideModale() {
    if (document.getElementById("kta-voice-aide-modal")) return;
    // 🩹 v1.34.0-fix1 — KARMA bug : "si je dis aide, j'ai pas erreur
    // comme quoi il ne pige pas la commande mais ca s'ouvre pas".
    // Cause : l'overlay voice-live (top-center) reste affiché 1.5s
    // après "✅ Aide commandes", et il chevauche visuellement la
    // modale qui s'ouvre dessous. L'user voit l'overlay disparaître
    // mais ne réalise pas que la modale est ouverte.
    // Fix : on hide le voice-live IMMÉDIATEMENT avant d'ouvrir la
    // modale d'aide (les autres handlers gardent le 1.5s auto-dismiss).
    _hideLiveOverlay();

    const m = document.createElement("div");
    m.id        = "kta-voice-aide-modal";
    m.className = "kta-readme-modal-overlay";
    // 🩹 v1.34.0-fix1 — display: flex explicite pour garantir l'affichage
    // (certains résiduels CSS pourraient appliquer display:none par défaut).
    m.style.display = "flex";

    function _patternsToHtml(patterns) {
      return patterns.slice(0, 3).map(function(p) {
        if (typeof p === "string") return "« " + p + " »";
        if (p instanceof RegExp) {
          // Simplification regex pour user-readable
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
          '<p style="font-size:11.5px; color:#8892a4; font-style:italic; margin-top:14px; line-height:1.5;">' +
            _t("voice.aide.hint") +
          '</p>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(m);
    document.getElementById("kta-voice-aide-close").addEventListener("click", function() {
      m.remove();
    });
    m.addEventListener("click", function(e) { if (e.target === m) m.remove(); });
  }

  // ============================================================
  // 🔧 ENABLED STATE
  // ============================================================

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

  // ============================================================
  // 📋 BUILT-IN COMMANDS
  // ============================================================
  // Note : tous les handlers sont défensifs (typeof check) car les
  // modules cible peuvent ne pas être chargés en mode offline cassé.
  // Si le handler ne peut pas exécuter, il log un warn console mais ne
  // crash pas — l'user voit "Commande exécutée" mais rien ne se passe.

  // 🩹 v1.34.0-fix1 — KARMA : "rajoute des formulations en plus différente
  // telle que aide, ouvre aide ou tracker on, allume tracker...". Expansion
  // massive des patterns pour chaque commande, couvrant les formulations
  // naturelles FR + impératif + indicatif + variantes synonymiques.
  // Note : substring match (text.indexOf(p) !== -1), donc des patterns
  // courts ("aide") matchent dans phrases longues ("dis-moi aide stp").
  function _registerBuiltins() {
    // ─── 📐 Navigation ──────────────────────────────
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

    // ─── ✏️ Actions session ─────────────────────────
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

    // 🆕 v1.34.0-fix2 — KARMA : "il serait super si on pouvait dire par
    // exemple 'aller a puit 25' on fait dans le 'simple' depuis ma position".
    // Itinéraire simple depuis la position tracker actuelle vers le POI
    // matchant le nom prononcé. Utilise window.SearchPoints.findByQuery
    // (substring case-insensitive sur nom + id + tags) puis
    // window.itineraireYAller (qui gère pathfinder + Position tracker).
    //
    // Variations couvertes par le regex :
    //   - "aller à puits 25" / "aller a puit 25"
    //   - "va à PA12" / "va a pa12"
    //   - "emmène-moi à siphon" / "emmene moi a siphon"
    //   - "guide-moi vers chaufferette"
    //   - "naviguer vers <nom>"
    //   - "itinéraire vers <nom>" / "iti vers <nom>"
    //   - "go to <nom>"
    //
    // Le handler est ASYNC (renvoie Promise) → _onFinalTranscript skip
    // l'auto-hide 1.5s, le handler gère son cycle de vie de l'overlay.
    registerCommand({
      patterns: [
        /(?:aller\s+(?:à|a)|va\s+(?:à|a)|vas\s+(?:à|a)|emmène[-\s]?moi\s+(?:à|a)|emmene[-\s]?moi\s+(?:à|a)|guide[-\s]?moi\s+(?:vers|à|a)|naviguer\s+vers|navigue\s+vers|itin[ée]raire\s+(?:vers|jusqu[' ]à)|iti\s+vers|go\s+to|trace\s+moi\s+vers|trace\s+itin[ée]raire\s+vers)\s+(.+)/i
      ],
      labelKey: "voice.cmd.route",
      handler:  function(matches) {
        // Le handler retourne une Promise → _onFinalTranscript skip auto-hide
        return (async function() {
          const rawQuery = (matches && matches[1] ? matches[1] : "").trim();
          // Nettoie ponctuation finale ("aller à puits 25." → "puits 25")
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

          // Premier résultat = meilleur match selon le scoring SearchPoints.
          // Note : pour "puits 25" tape, l'user attend probablement le PA25 / Puits 25,
          // les autres puits arrivent ensuite. findByQuery cherche substring.
          const first = results[0].point || results[0];
          const nom = first.nom || first.id || query;
          const x = first.x, y = first.y;

          if (typeof x !== "number" || typeof y !== "number") {
            _updateLive(_t("voice.route.badCoords", { nom: nom }), "error");
            setTimeout(_hideLiveOverlay, 2500);
            return;
          }

          // Vérifie qu'on a une position tracker (sinon itineraireYAller affiche alert)
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
        "mode urgence", "lance urgence", "lance l'urgence", "lancer urgence",
        "lancer l'urgence", "active urgence", "active l'urgence",
        "activer urgence", "activer l'urgence", "déclencher urgence",
        "déclenche urgence", "déclenche l'urgence", "ouvrir urgence",
        "ouvre l'urgence", "urgence", "alarme", "alerte", "sos",
        "appelle à l'aide", "appel à l'aide"
      ],
      labelKey: "voice.cmd.emergency",
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
      handler:  function() {
        if (window.SecoursMode && typeof window.SecoursMode.ouvrir === "function") {
          window.SecoursMode.ouvrir();
        }
      }
    });

    // ─── 🌓 Réglages ────────────────────────────────
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

    // ─── 🛑 Méta ────────────────────────────────────
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

    // 🆕 v1.35.0 — Sortie d'urgence : trouve la sortie la plus proche
    // (puits/escalier/cavage ouvert ou tag "entrée") via pathfinder.
    // Patterns volontairement larges (urgence = user stressé).
    registerCommand({
      patterns: [
        "sortie", "sortie urgence", "sortie d'urgence", "trouve la sortie",
        "trouver la sortie", "ressortir", "je dois sortir", "comment sortir",
        "où est la sortie", "ou est la sortie", "sors", "sortir d'ici",
        "urgence", "au secours sortie", "issue", "issue de secours"
      ],
      labelKey: "voice.cmd.exit",
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

  // ============================================================
  // 🚀 INIT
  // ============================================================
  // Si activé via localStorage, injecte le bouton mic au DOMContentLoaded
  // (ou immédiatement si on est déjà dans `interactive`/`complete`).

  function _initUI() {
    if (_enabled && isSupported()) _injectMicButton();
  }
  if (document.readyState === "complete" || document.readyState === "interactive") {
    _initUI();
  } else {
    document.addEventListener("DOMContentLoaded", _initUI);
  }

  // ============================================================
  // 🔌 EXPORT API
  // ============================================================
  window.VoiceCommand = {
    isSupported:      isSupported,
    isEnabled:        isEnabled,
    setEnabled:       setEnabled,
    startListening:   startListening,
    stopListening:    stopListening,
    registerCommand:  registerCommand,
    afficherAide:     _afficherAideModale,
    // Debug / introspection
    _commands:        _commands
  };

  console.log("[VoiceCommand] Module chargé (E1 v1.34.0). Supporté :",
              isSupported(), "Activé :", _enabled, "Commandes :", _commands.length);
})();
