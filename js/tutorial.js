/*!
 * MyKTAMap — Tutoriel premier-lancement
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
 *
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// TUTORIAL.JS — Onboarding cards séquentielles (depuis v1.21.0)
// =========================
// Affiché AUTOMATIQUEMENT au tout premier lancement (détecté via flag
// localStorage `myktamap_tutorial_seen_v1`). Réaffichable à tout moment
// depuis 📚 Aide > sous-action « 🎓 (Re)voir le tutoriel ».
//
// 5 cards séquentielles couvrant les fonctions essentielles que les nouveaux
// utilisateurs ratent souvent :
//   1. 🌟 Bienvenue + nature 100 % offline + zéro télémétrie
//   2. 🗂️ Chargement d'un plan (générateur OU drop ZIP/KMZ/GPX)
//   3. ✏️ Édition (points / tracés / zones)
//   4. 🔍 Recherche unifiée (Ctrl+K) + ⭐ Favoris
//   5. 📊 Inspecteur + Stats globales + Aide intégrée pour aller plus loin
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
  // ⚠️ Pas de fetch d'images externes — tout est emoji / texte pour rester offline-first
  const CARDS = [
    {
      emoji: "🌟",
      titre: "Bienvenue sur MyKTAMap",
      texte:
        "<p>MyKTAMap est une application de <strong>cartographie souterraine</strong> conçue pour le terrain : " +
        "carrières, galeries, sites sous-sol.</p>" +
        "<p>Elle fonctionne <strong>100 % hors-ligne</strong> une fois installée — pas de serveur, " +
        "pas de tracking, pas de cookie. Toutes tes données restent localement dans ton navigateur.</p>" +
        "<p>Ce petit tour t'aide à découvrir les fonctions essentielles en 30 secondes. " +
        "Tu peux passer ce tutoriel à tout moment et le rejouer plus tard via " +
        "<strong>📚 Aide → 🎓 (Re)voir le tutoriel</strong>.</p>"
    },
    {
      emoji: "🗂️",
      titre: "Charger ou créer un plan",
      texte:
        "<p>3 façons de démarrer depuis la page d'accueil :</p>" +
        "<ul>" +
          "<li><strong>📚 Mes plans</strong> : recharger un plan que tu as déjà importé / créé</li>" +
          "<li><strong>📦 Drop ZIP / KMZ / GPX</strong> : déposer un fichier dans la zone dédiée</li>" +
          "<li><strong>🏗️ Générer un plan</strong> : nouveau mode <strong>Simple</strong> qui démarre " +
            "un plan en 30 secondes (image OU canvas vierge + nom + version + V2/M-LVL → ZIP prêt)</li>" +
        "</ul>" +
        "<p>Tu peux aussi importer un KMZ ou GPX externe (Google Earth, TopoDroid, OsmAnd…) " +
        "qui sera reconverti en plan MyKTAMap utilisable.</p>"
    },
    {
      emoji: "✏️",
      titre: "Annoter ton plan",
      texte:
        "<p>3 catégories d'annotations dessinables avec la sidebar :</p>" +
        "<ul>" +
          "<li>📍 <strong>Points</strong> (icônes typées : puits, salles, chatières, etc.) " +
            "avec note + photos POI optionnelles</li>" +
          "<li>🛣️ <strong>Tracés</strong> (Principal / Secondaire / Chemin / Itinéraire / Jonction interniveau)</li>" +
          "<li>⬛ <strong>Zones</strong> (Eau / Remblais / Effondrement / Inaccessible)</li>" +
          "<li>🏛️ <strong>Structures</strong> (piliers / murs / fronts de taille)</li>" +
        "</ul>" +
        "<p>Tout est sauvegardé automatiquement (auto-save par plan + snapshots IDB) — tu ne perds rien " +
        "si tu fermes l'app. <strong>Ctrl+Z / Ctrl+Y</strong> pour annuler / refaire (jusqu'à 50 actions).</p>"
    },
    {
      emoji: "🔍",
      titre: "Trouver vite, retrouver vite",
      texte:
        "<p>Quand le plan est dense, ces outils te font gagner du temps :</p>" +
        "<ul>" +
          "<li><strong>🔍 Recherche unifiée</strong> (raccourci <code>Ctrl+K</code>) : cherche dans " +
            "points / tracés / zones / structures avec filtres par catégorie, calque, tag</li>" +
          "<li><strong>⭐ Favoris</strong> : marque un POI important (entrée carrière, RDV) via le bouton " +
            "dans sa popup → groupe ⭐ Favoris dans la sidebar gauche pour y revenir vite</li>" +
          "<li><strong>🗺️ Itinéraire</strong> : calcule le plus court chemin entre N waypoints en " +
            "suivant le réseau de tracés existants</li>" +
        "</ul>"
    },
    {
      emoji: "📊",
      titre: "Pour aller plus loin",
      texte:
        "<p>L'app a beaucoup d'outils annexes — quelques points clés à connaître :</p>" +
        "<ul>" +
          "<li><strong>📚 Aide intégrée</strong> (sidebar gauche) : doc complète de chaque fonction</li>" +
          "<li><strong>📊 Détails de la session</strong> (clic compteurs header) : stats session + " +
            "📦 backups récents + ⭐ favoris export/import + 📊 stats globales du plan</li>" +
          "<li><strong>⚙️ Configuration</strong> (home loader) : 📊 Inspecteur mémoire (transparence), " +
            "🔒 Audit réseau, mode performance, thème clair</li>" +
          "<li><strong>💾 Enregistrer session</strong> : exports Session JSON / KMZ / GPX / PNG / PDF</li>" +
        "</ul>" +
        "<p>Bonne exploration ! 🚀</p>",
      hint: "Tu peux rejouer ce tutoriel à tout moment via 📚 Aide → 🎓 (Re)voir le tutoriel."
    }
  ];

  let _currentIdx = 0;

  // ────────── HELPERS ──────────

  function isFirstLaunch() {
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
      +     '<span class="kta-readme-modal-titre">🎓 Tutoriel — Premier lancement</span>'
      +     '<button type="button" class="kta-panneau-close" id="kta-tutorial-close" aria-label="Fermer">✕</button>'
      +   '</div>'
      +   '<div class="kta-readme-modal-corps kta-tutorial-corps" id="kta-tutorial-corps">'
      +     '<!-- Card content dynamic -->'
      +   '</div>'
      +   '<div class="kta-tutorial-footer">'
      +     '<div class="kta-tutorial-progress" id="kta-tutorial-progress">'
      +       '<!-- Pastilles de progression dynamiques -->'
      +     '</div>'
      +     '<div class="kta-tutorial-actions">'
      +       '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-tutorial-skip">Passer le tutoriel</button>'
      +       '<button type="button" class="kta-btn kta-btn-ghost"   id="kta-tutorial-prev">◂ Précédent</button>'
      +       '<button type="button" class="kta-btn kta-btn-primary" id="kta-tutorial-next">Suivant ▸</button>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  function _renderCard(idx) {
    const card  = CARDS[idx];
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
      for (let i = 0; i < CARDS.length; i++) {
        const isActive  = (i === idx);
        const cls = "kta-tutorial-dot" + (isActive ? " kta-tutorial-dot-active" : "");
        dots += '<button type="button" class="' + cls + '" data-card-idx="' + i + '" aria-label="Aller à la carte ' + (i + 1) + '"></button>';
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
    if (prevBtn) prevBtn.style.visibility = (_currentIdx === 0) ? "hidden" : "visible";
    if (nextBtn) {
      const isLast = (_currentIdx === CARDS.length - 1);
      nextBtn.textContent = isLast ? "✓ Terminer" : "Suivant ▸";
    }
    if (skipBtn) {
      // Cacher "Passer" sur la dernière carte (= bouton Terminer suffit)
      const isLast = (_currentIdx === CARDS.length - 1);
      skipBtn.style.visibility = isLast ? "hidden" : "visible";
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
    if (_currentIdx < CARDS.length - 1) {
      _currentIdx++;
      _renderCard(_currentIdx);
      _updateNavButtons();
    } else {
      // Dernière carte → Terminer
      _finish();
    }
  }

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

  function ouvrir() {
    fermer();
    _currentIdx = 0;

    const overlay = document.createElement("div");
    overlay.id        = MODAL_ID;
    overlay.className = "kta-readme-modal-overlay";
    overlay.innerHTML = _buildModalHtml();
    document.documentElement.appendChild(overlay);

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
  }

  // ────────── EXPORT ──────────
  window.Tutorial = {
    ouvrir:         ouvrir,
    fermer:         fermer,
    isFirstLaunch:  isFirstLaunch,
    markAsSeen:     markAsSeen,
    // Pour Memory Inspector / debug
    _LS_KEY:        LS_KEY,
    _CARDS_COUNT:   CARDS.length
  };
})();
