/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// shortcutsCheatsheet.js — fiche des raccourcis clavier et gestes, ouverte par « ? » ou depuis le hub d'Aide.
// Sections repliables : Outils (window.KtaShortcuts.listMapping(), source shortcuts.js), Carte et Actions globales
// (tables CARTE / GLOBAL ci-dessous, chaque ligne relue dans le module qui traite la touche), Vue 3D
// (window.KtaVue3D.raccourcis(), source vue3d.js), Gestes tactiles sur un appareil tactile seulement.
// ⚠️ Vue 3D chargée à la demande (interface.js > ktaChargerVue3D) : sa section se remplit à l'ouverture de la fiche
//   si la vue est déjà chargée, sinon au dépliage (vue3d.js seul, jamais three.js). Ouverte par-dessus la vue, la
//   fiche montre la Vue 3D d'abord, dépliée.
// Jetons de touches : ev.code (« KeyZ »), ev.key (« Shift », « PageUp ») ou geste (« Molette ») ; nom lisible par
// langue dans cheatsheet.key.* (_touche).
// Expose : window.ShortcutsCheatsheet — ouvrir, fermer, toggle, isOpen, lignes() (ce que la fiche affiche, checkup).
// Garde-fou : scripts/smoke/checkup-raccourcis.js (chaque ligne jouée) · Doc : docs/architecture/ui.md § Raccourcis

(function() {
  "use strict";

  const OVERLAY_ID = "kta-cheatsheet-modal";
  let _escHandler = null;

  // Action ("group:edition" / "fn:legende") → clé i18n du libellé ; repli sur le label de listMapping().
  const ACTION_LABEL = {
    "group:edition":    "cheatsheet.tool.edition",
    "group:mesure":     "cheatsheet.tool.mesure",
    "group:zones":      "cheatsheet.tool.zones",
    "group:structures": "cheatsheet.tool.structures",
    "group:tracker":    "cheatsheet.tool.tracker",
    "group:traces":     "cheatsheet.tool.traces",
    "fn:legende":       "cheatsheet.tool.legende",
    "fn:boussole":      "cheatsheet.tool.boussole",
    "fn:recherche":     "cheatsheet.tool.recherche"
  };
  // Icône en image quand le vrai bouton n'en est pas une (libellé sans émoji) : la boussole = la rose de son widget
  // (compass.js), comme son bouton dans la vue 3D ; 🧭 reste au Tracker.
  const ACTION_ICONE = { "fn:boussole": "icon/compass.svg" };

  // Carte 2D : mapBearing.js > _rotMolette (Maj + molette, bouton nord), ajusterSommets.js (appui long, souris
  // comprise), Leaflet (molette, flèches et + / − quand la carte a le focus, Échap ferme la bulle), utils.js >
  // ktaDemanderPositionCarte (Échap annule le choix d'une position).
  const CARTE = [
    { id: "carte.tourner",  touches: [["Shift", "Molette"]], cle: "cheatsheet.carte.tourner" },
    { id: "carte.sommet",   touches: [["ClicLong", "Glisser"]], cle: "cheatsheet.carte.sommet" },
    { id: "carte.zoom",     touches: [["Molette"], ["+"], ["-"]], cle: "cheatsheet.carte.zoom" },
    { id: "carte.deplacer", touches: [["ArrowLeft"], ["ArrowUp"], ["ArrowRight"], ["ArrowDown"]],
      cle: "cheatsheet.carte.deplacer" },
    { id: "carte.echap",    touches: [["Escape"]], cle: "cheatsheet.carte.echap" }
  ];

  // Combinaisons globales : historyManager.js (Ctrl+Z / Ctrl+Y / Ctrl+Maj+Z, la mesure 📐 comprise outil armé),
  // searchPoints.js (Ctrl+K), presentationMode.js (F, Échap), shortcuts.js (?), modales (Échap).
  const GLOBAL = [
    { id: "global.annuler",      touches: [["Control", "KeyZ"]], cle: "cheatsheet.undo" },
    { id: "global.retablir",     touches: [["Control", "KeyY"], ["Control", "Shift", "KeyZ"]], cle: "cheatsheet.redo" },
    { id: "global.recherche",    touches: [["Control", "KeyK"]], cle: "cheatsheet.search" },
    { id: "global.presentation", touches: [["KeyF"]], cle: "cheatsheet.presentation" },
    { id: "global.aide",         touches: [["?"]], cle: "cheatsheet.thisHelp" },
    { id: "global.fermer",       touches: [["Escape"]], cle: "cheatsheet.close" }
  ];

  // Appareil tactile : la rotation à deux doigts (mapBearing.js), l'appui long sur un sommet, la vue 3D d'édition.
  const GESTES = [
    { id: "gestes.tourner", touches: [["DeuxDoigts"]], cle: "cheatsheet.gestes.tourner" },
    { id: "gestes.sommet",  touches: [["AppuiLong"]], cle: "cheatsheet.gestes.sommet" },
    { id: "gestes.v3d",     touches: [["DeuxDoigts"]], cle: "cheatsheet.gestes.v3d" }
  ];

  // Libellés des lignes de la vue 3D (id de KtaVue3D.raccourcis()).
  const V3D_LABEL = {
    avancer: "cheatsheet.v3d.avancer",
    reculer: "cheatsheet.v3d.reculer",
    gauche: "cheatsheet.v3d.gauche",
    droite: "cheatsheet.v3d.droite",
    tournerGauche: "cheatsheet.v3d.tournerGauche",
    tournerDroite: "cheatsheet.v3d.tournerDroite",
    courir: "cheatsheet.v3d.courir",
    vue: "cheatsheet.v3d.vue",
    zoomPlus: "cheatsheet.v3d.zoomPlus",
    zoomMoins: "cheatsheet.v3d.zoomMoins",
    zoomMolette: "cheatsheet.v3d.zoomMolette",
    inclinerPlus: "cheatsheet.v3d.inclinerPlus",
    inclinerMoins: "cheatsheet.v3d.inclinerMoins",
    inclinerMolette: "cheatsheet.v3d.inclinerMolette",
    panner: "cheatsheet.v3d.panner",
    cap: "cheatsheet.v3d.cap",
    tab: "cheatsheet.v3d.tab",
    echap: "cheatsheet.v3d.echap"
  };

  // Jeton → clé du nom lisible (« Maj » / « Shift » / « Mayús »).
  const TOUCHE_LABEL = {
    Shift: "cheatsheet.key.shift",
    Control: "cheatsheet.key.ctrl",
    Escape: "cheatsheet.key.esc",
    Tab: "cheatsheet.key.tab",
    PageUp: "cheatsheet.key.pageUp",
    PageDown: "cheatsheet.key.pageDown",
    Molette: "cheatsheet.key.molette",
    ClicDroit: "cheatsheet.key.clicDroit",
    ClicLong: "cheatsheet.key.clicLong",
    Glisser: "cheatsheet.key.glisser",
    AppuiLong: "cheatsheet.key.appuiLong",
    DeuxDoigts: "cheatsheet.key.deuxDoigts"
  };
  const FLECHES = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };

  // has() : t() ne rend jamais la clé brute
  function _t(key, fallback) {
    if (window.I18n && typeof window.I18n.has === "function" && window.I18n.has(key)) {
      return window.I18n.t(key);
    }
    return fallback;
  }

  function _esc(s) { return window.ktaEsc(s); }

  function _touche(tok) {
    if (TOUCHE_LABEL[tok]) return _t(TOUCHE_LABEL[tok], tok);
    if (FLECHES[tok]) return FLECHES[tok];
    const m = /^(?:Key|Digit)(\w)$/.exec(tok);
    return m ? m[1] : tok;
  }

  function isOpen() {
    return !!document.getElementById(OVERLAY_ID);
  }

  function fermer() {
    if (_escHandler) {
      document.removeEventListener("keydown", _escHandler, true);
      _escHandler = null;
    }
    const m = document.getElementById(OVERLAY_ID);
    if (m) m.remove();
  }

  function toggle() {
    if (isOpen()) fermer(); else ouvrir();
  }

  // Une ligne : combinaisons séparées par « / », touches d'une combinaison par « + ».
  function _row(ligne) {
    const kbds = ligne.touches.map(function(combi) {
      return combi.map(function(k) {
        return '<kbd class="kta-kbd">' + _esc(_touche(k)) + "</kbd>";
      }).join('<span class="kta-kbd-plus">+</span>');
    }).join('<span class="kta-kbd-ou">/</span>');
    return '<div class="kta-cheat-row" data-ligne="' + _esc(ligne.id) + '">' +
             '<span class="kta-cheat-keys">' + kbds + "</span>" +
             '<span class="kta-cheat-label">' +
               (ligne.icone ? '<img class="kta-cheat-icone" src="' + _esc(ligne.icone) +
                 '" alt="" draggable="false">' : "") +
               _esc(ligne.label) + "</span>" +
           "</div>";
  }

  function _statiques(table) {
    return table.map(function(l) { return { id: l.id, touches: l.touches, label: _t(l.cle, l.id) }; });
  }

  function _lignesOutils() {
    const list = (window.KtaShortcuts && typeof window.KtaShortcuts.listMapping === "function")
                   ? window.KtaShortcuts.listMapping() : [];
    return list.map(function(it) {
      return { id: "outil." + it.key, touches: [["Key" + it.key]],
               label: _t(ACTION_LABEL[it.action] || "", it.label) || it.label, icone: ACTION_ICONE[it.action] || null };
    });
  }

  // Vue 3D : null tant que vue3d.js n'est pas chargé.
  function _lignesV3D() {
    const K = window.KtaVue3D;
    if (!K || typeof K.raccourcis !== "function") return null;
    // ✏️ = vue d'édition seulement (même repère que le guide).
    return K.raccourcis().map(function(r) {
      const lib = _t(V3D_LABEL[r.id] || "", r.id);
      return { id: "v3d." + r.id, touches: r.touches, edition: r.edition, label: r.edition ? "✏️ " + lib : lib };
    });
  }

  function _vue3dOuverte() {
    const K = window.KtaVue3D;
    try { return !!(K && typeof K.etat === "function" && K.etat().ouvert); } catch (e) { return false; }
  }

  function _tactile() {
    return typeof window.ktaAppareilTactile === "function" && window.ktaAppareilTactile();
  }

  // Deux colonnes pour les lignes courtes (outils à une touche), une sinon : les libellés longs restent sur une ligne.
  function _grille(lignes, courtes) {
    return '<div class="kta-cheat-grille' + (courtes ? " kta-cheat-grille-2" : "") + '">' +
      lignes.map(_row).join("") + "</div>";
  }

  function _section(id, titre, contenu, ouverte) {
    return '<details class="kta-cheat-section" data-section="' + id + '"' + (ouverte ? " open" : "") + ">" +
             '<summary class="kta-cheat-sectitre">' + _esc(titre) + "</summary>" +
             '<div class="kta-cheat-section-corps">' + contenu + "</div>" +
           "</details>";
  }

  function _corpsV3D() {
    const l = _lignesV3D();
    if (!l) return '<p class="kta-cheat-note">' + _esc(_t("cheatsheet.v3d.chargement", "…")) + "</p>";
    return _grille(l) +
      '<p class="kta-cheat-note">' + _esc(_t("cheatsheet.v3d.note", "")) + "</p>";
  }

  // Ce que la fiche affiche, section par section (ordre et dépliage compris) : la fiche et le checkup lisent la même.
  function lignes() {
    const enVue = _vue3dOuverte(), tactile = _tactile();
    const s = [];
    if (tactile) s.push({ id: "gestes", titre: "cheatsheet.gestesTitre", lignes: _statiques(GESTES), ouverte: true });
    const v3d = { id: "vue3d", titre: "cheatsheet.v3dTitre", lignes: _lignesV3D(), ouverte: enVue && !tactile };
    if (enVue) s.push(v3d);
    s.push({ id: "outils", titre: "cheatsheet.toolsTitre", lignes: _lignesOutils(), ouverte: !enVue && !tactile });
    s.push({ id: "carte", titre: "cheatsheet.carteTitre", lignes: _statiques(CARTE), ouverte: !enVue && !tactile });
    s.push({ id: "global", titre: "cheatsheet.globalTitre", lignes: _statiques(GLOBAL), ouverte: !tactile });
    if (!enVue) s.push(v3d);
    return s;
  }

  // Dépliage de la Vue 3D pas encore chargée : vue3d.js chargé (sans three.js), puis la section remplie.
  function _surDepliage(ev) {
    const d = ev.target;
    if (!d || !d.dataset || d.dataset.section !== "vue3d" || !d.open || _lignesV3D()) return;
    if (typeof window.ktaChargerVue3D !== "function") return;
    window.ktaChargerVue3D().then(function(ok) {
      const corps = d.querySelector(".kta-cheat-section-corps");
      if (!corps || !d.isConnected) return;
      corps.innerHTML = ok ? _corpsV3D()
        : '<p class="kta-cheat-note">' + _esc(_t("vue3d.chargementImpossible", "")) + "</p>";
    });
  }

  function ouvrir() {
    if (isOpen()) return;

    const secs = lignes().map(function(s) {
      const contenu = s.id === "vue3d" ? _corpsV3D() : _grille(s.lignes, s.id === "outils");
      return _section(s.id, _t(s.titre, s.id), contenu, s.ouverte);
    }).join("");

    const modal = document.createElement("div");
    modal.id = OVERLAY_ID;
    modal.className = "kta-readme-modal-overlay kta-cheatsheet-overlay";
    modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-cheatsheet-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + _t("cheatsheet.titre", "⌨️ Raccourcis clavier") + "</span>" +
          '<button class="kta-panneau-close" id="kta-cheatsheet-close" type="button" aria-label="' +
            _esc(_t("ui.btn.close", "Fermer")) + '">✕</button>' +
        "</div>" +
        '<div class="kta-readme-modal-corps kta-cheatsheet-corps">' +
          secs +
          '<p class="kta-cheat-note">' +
            // Replay facultatif : pas de mode d'emploi d'un outil masqué.
            (window.APP_CONFIG && window.APP_CONFIG.replayEnabled === true
              ? _esc(_t("cheatsheet.replayHint", "")) + " "
              : "") +
            _esc(_t("cheatsheet.photoHint", "")) + " " +
            _esc(_t("cheatsheet.note", "Inactif quand tu tapes dans un champ texte.")) +
          "</p>" +
        "</div>" +
      "</div>";

    document.documentElement.appendChild(modal);

    const close = document.getElementById("kta-cheatsheet-close");
    if (close) close.addEventListener("click", fermer);
    modal.addEventListener("click", function(e) { if (e.target === modal) fermer(); });
    // toggle ne bouillonne pas : écouté en capture sur la modale.
    modal.addEventListener("toggle", _surDepliage, true);

    _escHandler = function(ev) {
      if (ev.key === "Escape") { ev.stopPropagation(); fermer(); }
    };
    document.addEventListener("keydown", _escHandler, true);
  }

  window.ShortcutsCheatsheet = {
    ouvrir: ouvrir,
    fermer: fermer,
    toggle: toggle,
    isOpen: isOpen,
    lignes: lignes
  };

  console.log("[ShortcutsCheatsheet] Module chargé (touche ?)");
})();
