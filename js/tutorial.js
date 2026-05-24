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
  // ⚠️ Pas de fetch d'images externes — tout est emoji / texte pour rester offline-first.
  // 8 cards (= compromis entre richesse du contenu et fatigue de lecture). Chaque
  // card couvre UN sujet en profondeur : présentation, chargement, annotation,
  // tracker, outils, multi-niveau, sauvegarde/partage, outils annexes.
  const CARDS = [
    // ─── 1/8 — Bienvenue ───
    {
      emoji: "🌟",
      titre: "Bienvenue sur MyKTAMap",
      texte:
        "<p>MyKTAMap est une application de <strong>cartographie souterraine</strong> conçue pour le terrain : " +
        "carrières, galeries cataphiles, sites souterrains et industriels. Pas besoin de GPS, on travaille sur " +
        "une <strong>image de plan</strong> (plan papier scanné, dessin, photo).</p>" +
        "<p>🛡️ <strong>100 % hors-ligne et privée</strong> :</p>" +
        "<ul>" +
          "<li>Aucun serveur, aucun backend, aucune base de données distante</li>" +
          "<li>Aucun cookie de tracking, aucune télémétrie, aucun analytics</li>" +
          "<li>Toutes tes annotations, sessions, plans et favoris restent <strong>localement</strong> dans ton navigateur</li>" +
          "<li>Tu peux vérifier toi-même via <strong>⚙️ Configuration → 🔒 Audit réseau</strong></li>" +
        "</ul>" +
        "<p>📜 <strong>Licence</strong> : CC BY-NC-SA 4.0 — usage non commercial, partage à l'identique. " +
        "Le code est public sur GitHub. Cette garantie s'applique <strong>UNIQUEMENT</strong> au domaine officiel " +
        "<code>myktamap.fr</code>.</p>" +
        "<p>Ce petit tour t'aide à découvrir l'app en quelques minutes. Tu peux le passer à tout moment et " +
        "le rejouer via <strong>📚 Aide → 🎓 (Re)voir le tutoriel</strong>.</p>"
    },
    // ─── 2/8 — Charger / créer un plan ───
    {
      emoji: "🗂️",
      titre: "Charger ou créer un plan",
      texte:
        "<p><strong>4 façons</strong> de démarrer depuis la page d'accueil :</p>" +
        "<ul>" +
          "<li><strong>📚 Mes plans</strong> : recharge un plan que tu as déjà importé ou créé (mémorisé localement)</li>" +
          "<li><strong>📦 Drop ZIP / KMZ / GPX</strong> : dépose simplement un fichier dans la zone dédiée. " +
            "Routage automatique selon l'extension</li>" +
          "<li><strong>🏗️ Générer un plan → Mode Simple</strong> : démarre un plan vide en 30 secondes " +
            "(image OU canvas vierge + nom + version + options M-LVL/V2 → ZIP prêt)</li>" +
          "<li><strong>🏗️ Générer un plan → Mode Avancé</strong> : contrôle total (calques data, tracking " +
            "config, icônes custom, géoréférencement GPS, légende plan-level personnalisée)</li>" +
        "</ul>" +
        "<p>📥 <strong>Import cross-format</strong> : un KMZ Google Earth ou un GPX TopoDroid/OsmAnd peut " +
        "être <strong>reconverti</strong> en plan MyKTAMap utilisable. Pour GPX (qui n'a pas d'image), " +
        "l'app génère un canvas vierge auto-calibré sur les bounds GPS du fichier.</p>" +
        "<p>🔄 <strong>Persistance</strong> : ton plan est mémorisé dans IndexedDB. Au prochain lancement, " +
        "tu le retrouves dans 📚 Mes plans sans avoir à le re-déposer.</p>"
    },
    // ─── 3/8 — Annoter ton plan ───
    {
      emoji: "✏️",
      titre: "Annoter ton plan",
      texte:
        "<p>4 catégories d'annotations dessinables depuis la <strong>sidebar droite</strong> :</p>" +
        "<ul>" +
          "<li>📍 <strong>Points</strong> : icônes typées (puits, salles, chatières, plaques, dangers…) " +
            "avec note multiligne, photos POI attachées, état (à inspecter / OK / dangereux)</li>" +
          "<li>🛣️ <strong>Tracés</strong> : Principal, Secondaire, Chemin, Itinéraire calculé, " +
            "Jonction interniveau (escalier/pente entre étages)</li>" +
          "<li>⬛ <strong>Zones</strong> : Eau (bleu), Remblais (gris), Effondrement (rouge), " +
            "⛔ Inaccessible (hachures — bloque le pathfinder)</li>" +
          "<li>🏛️ <strong>Structures</strong> : piliers (1ère/2ème masse), murs, fronts de taille " +
            "(1ère/2ème masse)</li>" +
        "</ul>" +
        "<p>💬 <strong>Note sur chaque élément</strong> : popup → bouton « Note » avec textarea " +
        "multiligne. Embarquée dans les exports KMZ/GPX/JSON.</p>" +
        "<p>🏷️ <strong>Légende personnalisable</strong> : tu peux <strong>renommer</strong> les types " +
        "(« Eau » → « Lac du fond »), <strong>masquer</strong> ceux que tu n'utilises pas, ou <strong>ajouter " +
        "tes propres types dessinables</strong>. Cascade 3 niveaux : session → plan → défaut.</p>" +
        "<p>↩️ <strong>Auto-save + Undo</strong> : tout est sauvegardé automatiquement (slot localStorage " +
        "par plan + 10 snapshots IDB en filet de sécurité). <strong>Ctrl+Z / Ctrl+Y</strong> pour annuler/" +
        "refaire jusqu'à 50 actions en arrière.</p>"
    },
    // ─── 4/8 — Tracker GPS expérimental ───
    {
      emoji: "🧭",
      titre: "Tracker de position (expérimental)",
      texte:
        "<p>Le mode <strong>🧭 Tracker</strong> (sidebar droite) utilise les capteurs de mouvement de ton " +
        "téléphone pour estimer ta position sur le plan en temps réel — sans GPS (= utile en souterrain).</p>" +
        "<ul>" +
          "<li><strong>▶️ Play</strong> : démarre la détection de pas (PDR). Le marker se déplace selon ton " +
            "orientation et les pas détectés</li>" +
          "<li><strong>📍 Recalage</strong> : clic sur la carte pour téléporter le marker à l'endroit où tu " +
            "es réellement (à utiliser tous les ~50 m pour corriger la dérive)</li>" +
          "<li><strong>🧭 Boussole</strong> : widget visuel qui montre ton orientation (vérification " +
            "visuelle du heading)</li>" +
          "<li><strong>🎬 Replay</strong> : visualise ta session de tracking après-coup (slider timeline + " +
            "play/pause + vitesse) + export CSV</li>" +
        "</ul>" +
        "<p><strong>⚠️ Important</strong> : le tracker est <strong>EXPÉRIMENTAL</strong>. Ne l'utilise pas " +
        "pour te localiser en situation réelle de secours. La dérive est inévitable (capteurs imprécis + " +
        "armatures métalliques qui faussent le magnétomètre). C'est un outil de debug / curiosité, pas un GPS.</p>" +
        "<p>🚨 <strong>Mode urgence</strong> : bouton dédié dans la sidebar quand tu es en situation tendue. " +
        "Affiche en plein écran ta position + itinéraire + niveau batterie en gros, masque tout le reste de " +
        "l'UI. Conserve ton autonomie batterie.</p>"
    },
    // ─── 5/8 — Trouver vite ───
    {
      emoji: "🔍",
      titre: "Trouver vite, retrouver vite",
      texte:
        "<p>Quand le plan est dense, ces outils te font gagner un temps précieux :</p>" +
        "<ul>" +
          "<li><strong>🔍 Recherche unifiée</strong> — Raccourci clavier <code>Ctrl+K</code> (Cmd+K sur " +
            "Mac). Cherche dans points + tracés + zones + structures avec filtres par catégorie / calque / " +
            "tag. Auto-complétion en live.</li>" +
          "<li><strong>⭐ Favoris</strong> — Marque un POI important (entrée carrière, RDV, lieu de " +
            "rendez-vous) via le bouton ⭐ dans sa popup. Apparaît dans le groupe <strong>⭐ Favoris</strong> " +
            "(sidebar gauche, juste après M-LVL) — clic = flash + popup du marker. " +
            "Exportable/importable en JSON pour partage cross-appareil.</li>" +
          "<li><strong>🗺️ Itinéraire</strong> — Calcule le plus court chemin entre N waypoints en suivant " +
            "le réseau de tracés. Préférences d'évitement (points / tags / zones inaccessibles).</li>" +
          "<li><strong>📐 Mesure de distance</strong> et <strong>⬛ Mesure de surface</strong> — Polyline " +
            "ou polygone, affichage live des m / km / m² / ha selon échelle du plan.</li>" +
          "<li><strong>📏 Distance totale</strong> — Surligne en magenta tous les tracés d'un type donné + " +
            "calcule la distance cumulée (filtrable par type).</li>" +
        "</ul>"
    },
    // ─── 6/8 — Multi-niveau ───
    {
      emoji: "🏗️",
      titre: "Multi-niveau (M-LVL) — pour les carrières à étages",
      texte:
        "<p>Si tu cartographies une carrière ou un site avec <strong>plusieurs étages empilés</strong>, " +
        "le mode multi-niveau est essentiel. Il s'active <strong>au moment de la création du plan</strong> " +
        "(générateur → case « 🏗️ Plan multi-niveau ») ou via l'édition manuelle du <code>plan-config.json</code>.</p>" +
        "<p>Une fois actif :</p>" +
        "<ul>" +
          "<li><strong>Bouton « Niveau actif »</strong> dans la sidebar gauche : pastille jaune avec le " +
            "numéro de niveau. Clic = ouvre la modale de gestion (niveau actif + niveaux visibles)</li>" +
          "<li><strong>Chaque annotation est taggée</strong> avec son niveau (point, tracé, zone, " +
            "structure). Tu dessines au niveau actif courant</li>" +
          "<li><strong>🪜 Jonctions interniveau</strong> : tracé spécial qui relie 2 points sur des " +
            "niveaux différents (escalier, pente, puits interne). Toujours visible quel que soit le filtre</li>" +
          "<li><strong>Filtre d'affichage</strong> : tu choisis quels niveaux sont visibles (multi-select). " +
            "Quick actions « Tous » / « Actif seul »</li>" +
          "<li><strong>Niveaux négatifs</strong> supportés (sous-sols : -1, -2…). Extensible via boutons " +
            "<code>−</code> et <code>+</code> dans la modale</li>" +
        "</ul>" +
        "<p>Pathfinder et exports respectent le filtre niveau. Le breakdown par niveau est disponible " +
        "dans <strong>📊 Statistiques du plan</strong>.</p>"
    },
    // ─── 7/8 — Sauver, partager, exporter ───
    {
      emoji: "💾",
      titre: "Sauver, partager, exporter",
      texte:
        "<p>Plusieurs formats d'export selon ton besoin (modale <strong>💾 Enregistrer session</strong>) :</p>" +
        "<ul>" +
          "<li><strong>📄 Session JSON</strong> (Full / Avancé) — Session brute réimportable dans MyKTAMap. " +
            "Granularité par calque et par type d'annotation. Avec ou sans photos POI.</li>" +
          "<li><strong>🌍 KMZ géolocalisé</strong> — Format standard pour Google Earth, OsmAnd, Avenza, " +
            "ArcGIS. Nécessite calibrage 2 points GPS. La <strong>légende personnalisée du plan voyage</strong> " +
            "avec le KMZ (réimportable dans MyKTAMap avec les renommages/customs).</li>" +
          "<li><strong>📤 GPX 1.1</strong> — Format universel pour TopoDroid, OsmAnd, Strava, Garmin, " +
            "Avenza. Roundtrip MyKTAMap complet (tags, niveaux M-LVL, descriptions, légende personnalisée).</li>" +
          "<li><strong>🖼️ PNG / JPG</strong> — Capture canvas du plan + annotations + légende. Mode rapide " +
            "(simple) ou avancé (filtres granulaires par calque, par tag, par niveau).</li>" +
          "<li><strong>📄 PDF imprimable</strong> — Avec ou sans légende, plusieurs formats (A4/A3/A2/A1/A0, " +
            "portrait/paysage).</li>" +
          "<li><strong>📊 Stats du plan en PDF</strong> — Fiche technique A4 avec totaux + breakdown par tag/type/" +
            "niveau (depuis 📊 Détails session → 📊 Voir les statistiques globales).</li>" +
        "</ul>" +
        "<p>🛡️ <strong>Filet de sécurité IDB</strong> : 10 snapshots auto par plan (toutes les 5 min + " +
        "avant action destructive). Consultables dans <strong>📊 Détails session → 📦 Backups récents</strong>. " +
        "Tu peux restaurer un snapshot à tout moment pour revenir en arrière.</p>"
    },
    // ─── 8/8 — Outils annexes pour aller plus loin ───
    {
      emoji: "📊",
      titre: "Outils annexes pour aller plus loin",
      texte:
        "<p>L'app a beaucoup d'outils annexes — voici ceux à connaître pour aller plus loin :</p>" +
        "<ul>" +
          "<li><strong>📚 Aide intégrée</strong> (sidebar gauche → ❓ Aide) : doc complète de chaque " +
            "fonction avec captures et raccourcis</li>" +
          "<li><strong>📖 Documentation</strong> (sidebar gauche → 📖) : page longue version « manuel »</li>" +
          "<li><strong>🗺️ Légende</strong> (sidebar gauche → 🗺️) : affichage des types couleur/icône + " +
            "bouton ✏️ Modifier pour personnaliser</li>" +
          "<li><strong>📊 Détails de la session</strong> (clic sur les compteurs du header) : stats + " +
            "📦 backups + ⭐ favoris export/import + 📊 stats globales du plan</li>" +
          "<li><strong>⚙️ Configuration</strong> (home loader) : 📊 Inspecteur mémoire (transparence " +
            "totale sur ce qui est stocké), 🔒 Audit réseau (journal live), mode performance, thème clair, " +
            "force update douce</li>" +
          "<li><strong>🐛 Logs détaillés</strong> (Configuration → toggle Debug + bouton 📋 Afficher) : " +
            "console verbose pour diagnostiquer un problème</li>" +
          "<li><strong>🔐 Code d'accès local</strong> (PIN / Face ID / Touch ID) : protection optionnelle " +
            "de l'app au démarrage. Idéal si tu prêtes ton téléphone</li>" +
          "<li><strong>📋 Rapport de crash</strong> (si l'app a été killed) : visible dans 📊 Inspecteur " +
            "mémoire → section Derniers crashs. Copiable pour debug par DM</li>" +
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
