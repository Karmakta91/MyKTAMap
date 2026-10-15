/*!
 * MyKTAMap — Tutoriel premier-lancement
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// TUTORIAL.JS — Onboarding : cartes séquentielles du premier lancement
// =========================
// Affiché AUTOMATIQUEMENT au tout premier lancement (flag localStorage
// `myktamap_tutorial_seen_v1`, séquencé par firstRunFlow.js), réaffichable
// depuis le bouton 🎓 de la modale 📖 Documentation.
//
// 🎯 RÔLE : faire démarrer, pas tout montrer. Une carte = un geste utile au
// premier jour, dans l'ordre du guide (Premiers pas → Urgence → Carte →
// Recherche → Tracker → Itinéraire → Annoter → Données → Réglages). Le
// détail vit dans le guide et l'Aide ❓ ; ce qui est désactivé par défaut,
// réservé aux créateurs de plans ou au Mode Secours n'a pas de carte.
// Refonte du 03/10/2026 (KARMA : « éviter l'indigestion ») : 27 → 11 cartes.
//
// API : window.Tutorial = { ouvrir, fermer, isFirstLaunch, markAsSeen }
// =========================

(function() {
  "use strict";

  const LS_KEY  = "myktamap_tutorial_seen_v1";
  const MODAL_ID = "kta-tutorial-modal";

  // Cartes : { cle, emoji, hint? }. Le texte vit dans les dicos :
  // tutorial.card.<cle>.titre / .texte (HTML autorisé) / .hint (si hint:true).
  // ⚠️ Les clés sont NOMMÉES, pas numérotées : jusqu'au 03/10/2026 le rang
  // faisait la clé (`card{NN}`), et insérer ou retirer une carte renumérotait
  // toutes les suivantes dans les trois dicos. Réordonner = déplacer une ligne.
  // Pas d'image : emoji et texte seulement, pour rester hors-ligne.
  const STRUCTURE = [
    { cle: "bienvenue",          emoji: "🌟", hint: true },
    { cle: "avant-de-descendre", emoji: "📱" },
    { cle: "charger",            emoji: "📦" },
    { cle: "urgence",            emoji: "🆘", hint: true },
    { cle: "interface",          emoji: "🗺️" },
    { cle: "chercher",           emoji: "🔍" },
    { cle: "suivre",             emoji: "🧭", hint: true },
    { cle: "itineraire",         emoji: "🪧" },
    { cle: "annoter",            emoji: "✏️" },
    { cle: "donnees",            emoji: "📔" },
    { cle: "reglages",           emoji: "⚙️" },
  ];

  // Alias préfixant DÉTECTÉ par check-i18n : les appels _t("skip")… sont
  // vérifiés au canal bloquant (clé manquante = CI rouge).
  function _t(key) {
    return (window.I18n && window.I18n.t) ? window.I18n.t("tutorial.ui." + key) : key;
  }

  // Cartes construites AU RENDU depuis le dico (jamais au load — règle
  // i18n du repo). Le littéral "tutorial." + … est reconnu comme préfixe
  // dynamique par le scanner : toutes les clés card.<cle>.* restent couvertes.
  function _cards() {
    const t = function(suffixe) {
      return (window.I18n && window.I18n.t) ? window.I18n.t("tutorial." + suffixe) : suffixe;
    };
    return STRUCTURE.map(function(s) {
      const base = "card." + s.cle;
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

  function _escapeHtml(s) { return window.ktaEsc(s); }

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
