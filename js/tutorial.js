/*!
 * MyKTAMap — Tutoriel premier-lancement
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// TUTORIAL.JS — Onboarding cards séquentielles (depuis v1.21.0, étendu v1.21.3)
// =========================
// Affiché AUTOMATIQUEMENT au tout premier lancement (détecté via flag
// localStorage `myktamap_tutorial_seen_v1`). Réaffichable à tout moment
// depuis le bouton 🎓 dans le header de la modale 📖 Documentation
// (cf. interface.js > afficherReadme — depuis v1.21.3 ; auparavant
// accessible via 📚 Aide > sous-action « 🎓 (Re)voir le tutoriel »).
//
// 🆕 v1.21.3 (KARMA "rajoute des diapo, pour décrire mieu chaque fonction") :
// passage de 8 cards à 22 cards focalisées. Chaque card couvre UN sujet précis
// au lieu d'empiler 4-6 features par diapo. Lecture plus digeste, nouveau
// utilisateur découvre la richesse de l'app sans submergement.
//
// 🆕 v1.25.3 (KARMA "rajoute le du coup aussi on onbarding si c'est pas fait") :
// ajout carte 13 "🚨 Mode Secours" → 22 → 23 cards. Insérée juste après les
// modes urgence (carte 12) pour bien différencier les 3 modes "urgence" :
// ⛑️ Je suis perdu (moi) / 🚨 Panique (moi) / 🚨 Mode Secours (équipe).
//
// 🆕 v1.40.32 (KARMA "on doit pouvoir enrichir le On Boarding avec la partie
// OSM et Histoire (peut être d'autres oublis)") : 23 → 25 cards.
// - Nouvelle carte 23 « 🌍 Vue OSM » (v1.39+) — plan projeté sur OpenStreetMap
// - Nouvelle carte 24 « 📖 Mode Histoire » (v1.34.19+) — note libre + PDF embed
// - Carte 12 (Modes urgence) enrichie avec 🚨 Sortie d'urgence (v1.35.0)
// - Carte 25 (ex-23 ⚙️ Config) enrichie avec 🎤 Commande vocale (v1.34.0) +
//   🪫 Vibration haptique (v1.34.26).
//
// Plan des 25 cartes :
//   1. 🌟 Bienvenue
//   2. 🛡️ Privacy & offline-first
//   3. 🗂️ Charger un plan existant
//   4. 🏗️ Créer un plan — Mode Simple
//   5. 🏗️ Créer un plan — Mode Avancé
//   6. 📍 Points POI + photos
//   7. 🛣️ Tracés (Principal / Secondaire / Chemin)
//   8. ⬛ Zones (+ inaccessible bloque pathfinder)
//   9. 🏛️ Structures (piliers / murs / fronts)
//   10. 🏷️ Légende personnalisable (cascade 3 niveaux)
//   11. 🧭 Tracker PDR + Replay
//   12. ⛑️🚨 Modes urgence (Perdu / Panique / Sortie d'urgence)   ← enrichi v1.40.32
//   13. 🚨 Mode Secours (coordination équipes)
//   14. 🔍 Recherche unifiée Ctrl+K
//   15. ⭐ Favoris
//   16. 🗺️ Itinéraire pathfinder + évitements
//   17. 📐 Mesures + 📏 Distance totale
//   18. 🏗️ Multi-niveau M-LVL
//   19. 📊 Stats globales + 🔥 Heatmap
//   20. 💾 Exports session JSON / KMZ / GPX
//   21. 🖼️ Exports images PNG / PDF
//   22. 🛡️ Sauvegardes auto + Undo Ctrl+Z
//   23. 🌍 Vue OSM (modale + widget HOME)                         ← v1.40.32
//   24. 📖 Mode Histoire (note libre + PDF embed)                 ← v1.40.32
//   25. ⚙️ Config & outils annexes (+ 🎤 Vocale, 🪫 Vibration)    ← enrichi v1.40.32
//
// API : window.Tutorial = { ouvrir, fermer, isFirstLaunch, markAsSeen }
//
// Auto-lancement : déclenché par main.js > _splashEnd → si isFirstLaunch
// retourne true, on appelle ouvrir() après ~600ms (le temps que les modales
// de splash queue soient flushées par OOMGuard, pour éviter le chevauchement).
// =========================

(function() {
  "use strict";

  const LS_KEY  = "myktamap_tutorial_seen_v1";
  const MODAL_ID = "kta-tutorial-modal";

  // Cartes : chaque entrée = { emoji, titre, texte (HTML autorisé), hint optionnel }
  // ⚠️ Pas de fetch d'images externes — tout est emoji / texte pour rester offline-first.
  // 🆕 v1.21.3 : passage 8 → 22 cards (KARMA "rajoute des diapo pour décrire mieu
  // chaque fonction"). Découpe granulaire : 1 sujet = 1 carte = lecture digeste.
  // 🆕 v1.25.3 : 22 → 23 cards (ajout carte 13 « 🚨 Mode Secours » après modes urgence).
  // 🆕 v1.69.0 : 25 → 26 cards (ajout carte 25 « 📔 Mon carnet », après Mode Histoire).
  // 🆕 v1.85.0 : 26 → 27 cards (ajout carte 6 « 🗺️ Convertir un relevé SIG »,
  //              après les deux cartes de création de plan).
  // ⚠️ Depuis v1.79.4, la parité des langues est garantie par les DICOS
  // (check-i18n : parité fr/en + es stricte) — plus de tableaux par langue ici.
  // ═══ 🌍 v1.79.4 — CONTENU MIGRÉ DANS LES DICOS lang/*.json (dette
  // D-tutorial soldée) : les textes des 26 cartes vivent dans les clés
  // tutorial.cardNN.titre/.texte/.hint et l'UI dans tutorial.ui.* —
  // traduits fr/en/es, sous le filet de check-i18n. Ici ne reste que la
  // STRUCTURE (emoji + présence d'un hint, au rang partagé toutes langues).
  // La langue suit le choix GLOBAL de l'app (I18n.getLang — sélecteur de
  // la gate depuis v1.79.4, ou ⚙️ Configuration) : le toggle interne
  // 🇫🇷/🇬🇧 et l'usage de la clé myktamap_readme_lang sont RETIRÉS du
  // tutoriel (la modale Documentation garde les siens, non touchée).
  // Ajouter une carte = 1 entrée ici + 2-3 clés ×3 dicos. Ajouter une
  // langue = traduire le dico, zéro code.
  const STRUCTURE = [
    { emoji: "🌟", hint: true },
    { emoji: "🛡️" },
    { emoji: "🗂️" },
    { emoji: "🏗️", hint: true },
    { emoji: "🎨" },
    // 🗺️ v1.85.0 — l’import SIG etait ABSENT des 26 cartes : zero occurrence
    // de « SIG », « GeoJSON » ou « QGIS ». Porte d’entree majeure des cinq
    // dernieres versions, invisible pour un nouvel utilisateur. Rangee en 6e,
    // apres les deux facons de CREER un plan — c’en est une troisieme.
    // ⚠️ Le rang FAIT la cle (`card{NN}`) : inserer ici a renumerote 06..26
    // en 07..27 dans les trois dicos.
    { emoji: "🗺️", hint: true },
    { emoji: "📍" },
    { emoji: "🛣️" },
    { emoji: "⬛" },
    { emoji: "🏛️" },
    { emoji: "🏷️" },
    { emoji: "🧭" },
    { emoji: "⛑️", hint: true },
    { emoji: "🚨", hint: true },
    { emoji: "🔍" },
    { emoji: "⭐" },
    { emoji: "🗺️" },
    { emoji: "📐" },
    { emoji: "🏗️", hint: true },
    { emoji: "📊" },
    { emoji: "💾" },
    { emoji: "🖼️" },
    { emoji: "🛡️" },
    { emoji: "🌍", hint: true },
    { emoji: "📖", hint: true },
    { emoji: "📔", hint: true },
    { emoji: "⚙️", hint: true },
  ];

  // Alias préfixant DÉTECTÉ par check-i18n : les appels _t("skip")… sont
  // vérifiés au canal bloquant (clé manquante = CI rouge).
  function _t(key) {
    return (window.I18n && window.I18n.t) ? window.I18n.t("tutorial.ui." + key) : key;
  }

  // Cartes construites AU RENDU depuis le dico (jamais au load — règle
  // i18n du repo). Le littéral "tutorial." + … est reconnu comme préfixe
  // dynamique par le scanner : toutes les clés cardNN.* restent couvertes.
  function _cards() {
    const t = function(suffixe) {
      return (window.I18n && window.I18n.t) ? window.I18n.t("tutorial." + suffixe) : suffixe;
    };
    return STRUCTURE.map(function(s, i) {
      const base = "card" + String(i + 1).padStart(2, "0");
      const c = { emoji: s.emoji, titre: t(base + ".titre"), texte: t(base + ".texte") };
      if (s.hint) c.hint = t(base + ".hint");
      return c;
    });
  }

  let _currentIdx = 0;

  // ────────── HELPERS ──────────

  function isFirstLaunch() {
    // 🕵️ v1.31.9-fix1 — Skip onboarding en mode incognito. Cohérent avec
    // le pattern "no traces" : pas d'auto-trigger du tutoriel (l'user peut
    // toujours l'ouvrir manuellement via le menu Aide s'il veut). Sans ce
    // guard, le shim Storage retourne null → isFirstLaunch retourne true →
    // tutoriel s'affiche à CHAQUE boot incognito → bruit UX.
    if (window.IncognitoMode && window.IncognitoMode.active) return false;
    try { return !localStorage.getItem(LS_KEY); } catch(e) { return false; }
  }

  function markAsSeen() {
    try { localStorage.setItem(LS_KEY, "1"); } catch(e) {}
  }

  function _escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function(c) {
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" })[c];
    });
  }

  // ────────── RENDER ──────────

  function _buildModalHtml() {
    return ''
      + '<div class="kta-readme-modal-boite kta-tutorial-boite">'
      +   '<div class="kta-readme-modal-header kta-tutorial-header">'
      +     '<span class="kta-readme-modal-titre" id="kta-tutorial-titre">' + _t("headerTitle") + '</span>'
      +     '<button type="button" class="kta-panneau-close" id="kta-tutorial-close" aria-label="' + _t("close") + '">✕</button>'
      +   '</div>'
      +   '<div class="kta-readme-modal-corps kta-tutorial-corps" id="kta-tutorial-corps">'
      +     '<!-- Card content dynamic -->'
      +   '</div>'
      +   '<div class="kta-tutorial-footer">'
      +     '<div class="kta-tutorial-progress" id="kta-tutorial-progress">'
      +       '<!-- Pastilles de progression dynamiques -->'
      +     '</div>'
      +     '<div class="kta-tutorial-actions">'
      +       '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-tutorial-skip">' + _t("skip") + '</button>'
      +       '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-tutorial-prev">' + _t("prev") + '</button>'
      +       '<button type="button" class="kta-btn kta-btn-primary" id="kta-tutorial-next">' + _t("next") + '</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  function _renderCard(idx) {
    const cards = _cards();
    const card  = cards[idx];
    const corps = document.getElementById("kta-tutorial-corps");
    if (!card || !corps) return;

    let html = '<div class="kta-tutorial-card">';
    html += '<div class="kta-tutorial-card-emoji" aria-hidden="true">' + card.emoji + '</div>';
    html += '<div class="kta-tutorial-card-titre">' + _escapeHtml(card.titre) + '</div>';
    // texte = HTML autorisé volontairement (cards hardcodées, contenu de confiance)
    html += '<div class="kta-tutorial-card-texte">' + card.texte + '</div>';
    if (card.hint) {
      html += '<div class="kta-tutorial-card-hint">' + _escapeHtml(card.hint) + '</div>';
    }
    html += '</div>';
    corps.innerHTML = html;

    // Progression : pastilles cliquables (navigation directe)
    const prog = document.getElementById("kta-tutorial-progress");
    if (prog) {
      let dots = "";
      for (let i = 0; i < cards.length; i++) {
        const isActive  = (i === idx);
        const cls = "kta-tutorial-dot" + (isActive ? " kta-tutorial-dot-active" : "");
        dots += '<button type="button" class="' + cls + '" data-card-idx="' + i + '" aria-label="' + _t("gotoCard") + (i + 1) + '"></button>';
      }
      prog.innerHTML = dots;
      // Bind nav directe (utile si l'user veut revenir vite à une carte)
      prog.querySelectorAll(".kta-tutorial-dot").forEach(function(b) {
        b.addEventListener("click", function() {
          const i = parseInt(b.dataset.cardIdx, 10);
          if (!isNaN(i)) { _currentIdx = i; _renderCard(_currentIdx); _updateNavButtons(); }
        });
      });
    }
  }

  function _updateNavButtons() {
    const prevBtn = document.getElementById("kta-tutorial-prev");
    const nextBtn = document.getElementById("kta-tutorial-next");
    const skipBtn = document.getElementById("kta-tutorial-skip");
    const lastIdx = _cards().length - 1;
    if (prevBtn) prevBtn.style.visibility = (_currentIdx === 0) ? "hidden" : "visible";
    if (nextBtn) {
      const isLast = (_currentIdx === lastIdx);
      nextBtn.textContent = isLast ? _t("finish") : _t("next");
    }
    if (skipBtn) {
      // Cacher "Passer" sur la dernière carte (= bouton Terminer suffit)
      skipBtn.style.visibility = (_currentIdx === lastIdx) ? "hidden" : "visible";
    }
  }

  function _onPrev() {
    if (_currentIdx > 0) {
      _currentIdx--;
      _renderCard(_currentIdx);
      _updateNavButtons();
    }
  }

  function _onNext() {
    if (_currentIdx < _cards().length - 1) {
      _currentIdx++;
      _renderCard(_currentIdx);
      _updateNavButtons();
    } else {
      // Dernière carte → Terminer
      _finish();
    }
  }

  // 🌍 v1.79.4 : _toggleLang supprimée — la langue du tutoriel suit le
  // choix global (gate / ⚙️ Config), plus de bascule interne.


  function _finish() {
    markAsSeen();
    fermer();
  }

  function _onKey(e) {
    if (e.key === "Escape" || e.key === "Esc") { fermer(); return; }
    if (e.key === "ArrowRight") { _onNext(); return; }
    if (e.key === "ArrowLeft")  { _onPrev(); return; }
    if (e.key === "Enter")      { _onNext(); return; }
  }

  // ────────── API PUBLIQUE ──────────

  // 🆕 v1.56.0 — Callback de fermeture (onClose) pour le séquenceur de premier
  // lancement (js/firstRunFlow.js). Appelé UNE FOIS à la fermeture du tutoriel
  // (✕ / Passer). Défini après le fermer() initial pour ne pas se déclencher à
  // tort à la ré-ouverture.
  let _tutorialOnClose = null;

  function ouvrir(onClose) {
    fermer();
    _tutorialOnClose = (typeof onClose === "function") ? onClose : null;
    _currentIdx = 0;
    // 🌍 v1.79.4 : plus de resync de langue locale — _cards()/_t() lisent
    // le dico I18n au rendu, la langue globale est toujours la bonne.

    const overlay = document.createElement("div");
    overlay.id        = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML = _buildModalHtml();
    document.documentElement.appendChild(overlay);

    // 🆕 v1.44.6 — Bind toggle langue

    document.getElementById("kta-tutorial-close").addEventListener("click", function() {
      // Fermeture explicite via ✕ = considère comme "skip" (marque seen pour ne pas re-popup)
      markAsSeen();
      fermer();
    });
    overlay.addEventListener("click", function(e) {
      // Pas de close sur backdrop (= éviter dismiss accidentel pendant la lecture)
      // L'user doit cliquer ✕ ou "Passer" explicitement.
    });
    document.addEventListener("keydown", _onKey);

    document.getElementById("kta-tutorial-prev").addEventListener("click", _onPrev);
    document.getElementById("kta-tutorial-next").addEventListener("click", _onNext);
    document.getElementById("kta-tutorial-skip").addEventListener("click", function() {
      markAsSeen();
      fermer();
    });

    _renderCard(_currentIdx);
    _updateNavButtons();
  }

  function fermer() {
    document.removeEventListener("keydown", _onKey);
    const ex = document.getElementById(MODAL_ID);
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
    // 🆕 v1.56.0 — notifie le séquenceur (une seule fois)
    const cb = _tutorialOnClose;
    _tutorialOnClose = null;
    if (cb) { try { cb(); } catch(e) { console.warn("[Tutorial] onClose :", e); } }
  }

  // ────────── EXPORT ──────────
  window.Tutorial = {
    ouvrir:         ouvrir,
    fermer:         fermer,
    isFirstLaunch:  isFirstLaunch,
    markAsSeen:     markAsSeen,
    // Pour Memory Inspector / debug
    _LS_KEY:        LS_KEY,
    _CARDS_COUNT:   STRUCTURE.length  // 🌍 v1.79.4 : une seule structure, langues dans les dicos
  };
})();
