/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// tutorial.js — cartes du premier lancement (`myktamap_tutorial_seen_v1`, séquencé par
// firstRunFlow.js), réouvrables depuis la Documentation.
// Rôle : faire démarrer, pas tout montrer (décision produit) : une carte = un geste utile au premier
// jour, dans l'ordre du guide ; le détail vit dans le guide et l'Aide. Ce qui est désactivé par
// défaut, réservé aux créateurs de plans ou au Mode Secours n'a pas de carte.
// Expose : window.Tutorial { ouvrir(onClose), fermer, isFirstLaunch, markAsSeen }
// Garde-fou : scripts/check-i18n.js

(function() {
  "use strict";

  const LS_KEY  = "myktamap_tutorial_seen_v1";
  const MODAL_ID = "kta-tutorial-modal";

  // Cartes { cle, emoji, hint? } ; texte dans les dicos : tutorial.card.<cle>.titre / .texte
  // (HTML autorisé) / .hint. ⚠️ Clés NOMMÉES, jamais numérotées : réordonner = déplacer une ligne,
  // sans renuméroter les trois dicos. Pas d'image (hors ligne).
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

  // Alias préfixant reconnu par check-i18n : les _t("…") sont vérifiés (clé manquante = rouge).
  function _t(key) {
    return (window.I18n && window.I18n.t) ? window.I18n.t("tutorial.ui." + key) : key;
  }

  // Construites AU RENDU, jamais au load. Le littéral "tutorial." + … est un préfixe dynamique
  // reconnu par check-i18n : les clés card.<cle>.* restent couvertes.
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

  // ── Outils ───────────────────────────────────────────

  function isFirstLaunch() {
    // 🩸 Incognito : jamais automatique — le Storage factice rend null et le tutoriel s'ouvrirait
    // à CHAQUE démarrage.
    if (window.IncognitoMode && window.IncognitoMode.active) return false;
    try { return !localStorage.getItem(LS_KEY); } catch(e) { return false; }
  }

  function markAsSeen() {
    try { localStorage.setItem(LS_KEY, "1"); } catch(e) {}
  }

  function _escapeHtml(s) { return window.ktaEsc(s); }

  // ── Rendu ────────────────────────────────────────────

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
    // 🔒 texte = HTML voulu : vient des dicos de l'app, contenu de confiance.
    html += '<div class="kta-tutorial-card-texte">' + card.texte + '</div>';
    if (card.hint) {
      html += '<div class="kta-tutorial-card-hint">' + _escapeHtml(card.hint) + '</div>';
    }
    html += '</div>';
    corps.innerHTML = html;

    // Pastilles de progression cliquables (accès direct à une carte).
    const prog = document.getElementById("kta-tutorial-progress");
    if (prog) {
      let dots = "";
      for (let i = 0; i < cards.length; i++) {
        const isActive  = (i === idx);
        const cls = "kta-tutorial-dot" + (isActive ? " kta-tutorial-dot-active" : "");
        dots += '<button type="button" class="' + cls + '" data-card-idx="' + i + '" aria-label="' + _t("gotoCard") + (i + 1) + '"></button>';
      }
      prog.innerHTML = dots;
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
      // Dernière carte : « Terminer » suffit.
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
      _finish();
    }
  }

  // Langue = choix global (gate / Config), pas de bascule propre au tutoriel.


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

  // ── API ──────────────────────────────────────────────
  // onClose (firstRunFlow.js) : appelé UNE FOIS à la fermeture. ⚠️ Posé APRÈS le fermer() initial
  // d'ouvrir(), sinon une réouverture le déclencherait à tort.
  let _tutorialOnClose = null;

  function ouvrir(onClose) {
    fermer();
    _tutorialOnClose = (typeof onClose === "function") ? onClose : null;
    _currentIdx = 0;

    const overlay = document.createElement("div");
    overlay.id        = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML = _buildModalHtml();
    document.documentElement.appendChild(overlay);


    document.getElementById("kta-tutorial-close").addEventListener("click", function() {
      // ✕ vaut « Passer » : marqué vu.
      markAsSeen();
      fermer();
    });
    overlay.addEventListener("click", function(e) {
      // Pas de fermeture au clic sur le fond (lecture) : ✕ ou « Passer » seulement.
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
    const cb = _tutorialOnClose;
    _tutorialOnClose = null;
    if (cb) { try { cb(); } catch(e) { console.warn("[Tutorial] onClose :", e); } }
  }

  window.Tutorial = {
    ouvrir:         ouvrir,
    fermer:         fermer,
    isFirstLaunch:  isFirstLaunch,
    markAsSeen:     markAsSeen,
    // Diagnostic :
    _LS_KEY:        LS_KEY,
    _CARDS_COUNT:   STRUCTURE.length
  };
})();
