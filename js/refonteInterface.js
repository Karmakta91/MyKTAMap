/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.is-underground.fr
 * Licence : CC BY-NC-SA 4.0 — Usage commercial interdit sans accord ecrit prealable.
 *
 * MODULE : refonteInterface.js (introduit en branche Refonte_interface)
 * =========================================================================
 *
 * Refonte progressive de l'interface en mode carte (post-loader).
 * Active via toggle ⚙️ Réglages → 🎨 Affichage → "Interface refonte v1".
 * Persisté dans localStorage["myktamap_refonte_v1"].
 *
 * Approche : COUCHE ADDITIONNELLE (pas de duplication de code).
 *   - Si flag OFF → no-op total, l'app fonctionne comme aujourd'hui
 *   - Si flag ON  → ajoute la classe body.kta-refonte-v1 + crée le
 *                   header bar et la status bar en DOM. Le CSS scope
 *                   tous les changements visuels via cette classe.
 *
 * Architecture phase 1 (visuel pur, pas de changement fonctionnel) :
 *   - SIDEBAR GAUCHE (Leaflet topleft, ~36px) :
 *       ⊞ Layers (natif Leaflet)
 *       − / + Zoom (natif)
 *       🏗 Niveau (multi-niveau, déjà topleft)
 *       --- séparateur ---
 *       📚 Doc/Aide/Légende (déplacé de droite)
 *       ⚙ Paramètres (déplacé de droite)
 *       ⬇ Charger / Import (déplacé de droite)
 *       ⬆ Sauvegarde (déplacé de droite)
 *       🧹 Suppression (déplacé de droite)
 *   - SIDEBAR DROITE (Leaflet topright, ~36px) :
 *       🔍 Recherche (quick action)
 *       ✏️ Édition (quick action)
 *       📐 Mesure (quick action)
 *       --- séparateur ---
 *       🛣 Tracés (accordéon)
 *       ⬛ Zones (accordéon)
 *       🧭 Tracker (accordéon, contient la 🧭 Boussole en sous-action)
 *   - HEADER BAR sticky 40px top : 🗂 home / titre plan / compteurs
 *   - STATUS BAR sticky bottom : mesures live, collapsible
 *   - Groupe 🏗 Créer/modifier plan : retiré du mode carte (reste home)
 *
 * Le repositionnement gauche/droite des groupes est géré dans
 * interface.js via une option `position` passée à _creerGroupeAccordeon.
 * Cette option est lue uniquement si window._refonteInterfaceActive
 * est true (= flag ON). Sinon comportement v1.8.x strict.
 *
 * API exposée : window.RefonteInterface
 *   - isActive()           → boolean
 *   - setActive(boolean)   → set + reload
 *   - updateCompteurs()    → recalcule les compteurs du header
 *   - refreshStatusBar()   → re-render des mesures live du status bar
 *
 * Pour désactiver côté user : ⚙️ Réglages → 🎨 Affichage → décocher.
 * =========================================================================
 */

(function() {
  "use strict";

  // ============================================================
  // CONFIGURATION
  // ============================================================
  const LS_FLAG = "myktamap_refonte_v1";

  // ============================================================
  // LECTURE FLAG (au chargement du module)
  // ============================================================
  function _readFlag() {
    try {
      return localStorage.getItem(LS_FLAG) === "1";
    } catch(e) { return false; }
  }

  function _writeFlag(value) {
    try {
      if (value) localStorage.setItem(LS_FLAG, "1");
      else       localStorage.removeItem(LS_FLAG);
    } catch(e) {}
  }

  // Exposer l'état tôt pour que interface.js puisse le lire avant init
  window._refonteInterfaceActive = _readFlag();

  // Si flag OFF, on s'arrête là : aucun DOM créé, aucun CSS ajouté.
  if (!window._refonteInterfaceActive) {
    // On expose juste l'API pour pouvoir activer plus tard sans reload
    window.RefonteInterface = {
      isActive:        function() { return false; },
      setActive:       _setActive,
      updateCompteurs: function() {},
      refreshStatusBar:function() {}
    };
    return;
  }

  // ============================================================
  // FLAG ACTIF — on injecte la couche refonte
  // ============================================================

  // Marquer le body dès maintenant. Le CSS prend en compte cette classe
  // pour tout ce qui est repositionnement / style. Si on tarde (genre on
  // attend DOMContentLoaded), les éléments Leaflet sont déjà placés sans
  // la classe et le repaint visuel est sale.
  function _ensureBodyClass() {
    if (document.body) {
      document.body.classList.add("kta-refonte-v1");
    } else {
      // body pas encore parsé (script chargé avant le body) → on attend
      document.addEventListener("DOMContentLoaded", function() {
        document.body.classList.add("kta-refonte-v1");
      }, { once: true });
    }
  }
  _ensureBodyClass();

  // ============================================================
  // HEADER BAR (sticky top, 40px)
  // ============================================================
  // Créé à l'init de l'app (après lancerApplication). On reste safe :
  // on ne crée le header que quand window.map existe (= app initialisée).
  let _headerEl = null;

  function _creerHeaderBar() {
    if (_headerEl || !document.body) return;

    const header = document.createElement("div");
    header.id = "kta-refonte-header";
    header.className = "kta-refonte-header";
    header.innerHTML =
      '<button class="kta-refonte-header-btn kta-refonte-header-home" id="kta-refonte-home" title="Retour à l\'accueil / Changer de plan" aria-label="Retour à l\'accueil">' +
        '<img src="icon/mkm-full.png" alt="" class="kta-refonte-header-home-img" draggable="false">' +
      '</button>' +
      '<div class="kta-refonte-header-title-wrap">' +
        '<button class="kta-refonte-header-title" id="kta-refonte-title-btn" title="Changer de plan">' +
          '<strong id="kta-refonte-plan-name">—</strong>' +
          '<span id="kta-refonte-plan-version"></span>' +
          '<span class="kta-refonte-header-chevron">▾</span>' +
        '</button>' +
      '</div>' +
      '<button class="kta-refonte-header-btn kta-refonte-header-counters" id="kta-refonte-counters-btn" title="Résumé de la session" aria-label="Résumé">' +
        '<span class="kta-refonte-counter" id="kta-refonte-counter-points" title="Points">' +
          '<span class="kta-refonte-counter-icon">📍</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
        '<span class="kta-refonte-counter" id="kta-refonte-counter-roads" title="Tracés">' +
          '<span class="kta-refonte-counter-icon">🛣</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
        '<span class="kta-refonte-counter" id="kta-refonte-counter-zones" title="Zones">' +
          '<span class="kta-refonte-counter-icon">⬛</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
      '</button>';

    document.body.appendChild(header);
    _headerEl = header;

    // Click handlers
    const homeBtn = document.getElementById("kta-refonte-home");
    if (homeBtn) {
      homeBtn.addEventListener("click", function() {
        // Réutilise la logique de plan switcher / home existante.
        // afficherLoader = retour direct à la home si exposé.
        if (typeof window.afficherLoader === "function") {
          // Avant de fermer le plan courant, demander confirmation si
          // session avec modifs (déjà géré par le titre cliquable existant
          // via togglePlanSwitcher → on imite ce comportement).
          if (typeof window._sessionAModif === "function" && window._sessionAModif()) {
            if (typeof window.afficherModaleSessionAvecModif === "function") {
              window.afficherModaleSessionAvecModif();
              return;
            }
            if (!confirm("Tu as une session non sauvegardée. Continuer vers l'accueil ?")) return;
          }
          window.afficherLoader();
        }
      });
    }

    const titleBtn = document.getElementById("kta-refonte-title-btn");
    if (titleBtn) {
      titleBtn.addEventListener("click", function() {
        if (typeof window.togglePlanSwitcher === "function") {
          window.togglePlanSwitcher();
        }
      });
    }

    const countersBtn = document.getElementById("kta-refonte-counters-btn");
    if (countersBtn) {
      countersBtn.addEventListener("click", function() {
        // Pour l'instant : juste un re-update des compteurs (donne un
        // feedback visuel sans ouvrir de modale dédiée). En phase 3 on
        // pourra ouvrir un panneau "Résumé de la session" complet.
        updateCompteurs();
      });
    }

    // Update initial des compteurs + valeurs
    updateCompteurs();
  }

  // ============================================================
  // MISE À JOUR DU HEADER (nom plan + compteurs)
  // ============================================================
  function updateCompteurs() {
    if (!_headerEl) return;

    // Nom du plan + version (depuis APP_CONFIG / PLAN_CONFIG)
    const pc = window.PLAN_CONFIG;
    const nameEl = document.getElementById("kta-refonte-plan-name");
    const verEl  = document.getElementById("kta-refonte-plan-version");
    if (nameEl && pc && pc.plan) {
      nameEl.textContent = pc.plan.name || "Plan";
    }
    if (verEl && pc && pc.plan && pc.plan.version) {
      verEl.textContent = pc.plan.version;
    }

    // Compteurs : points session + roads + zones (les data layers ne
    // comptent pas — ce sont les annotations user qui nous intéressent)
    const nPoints = (window.getEditorPoints && window.getEditorPoints() || []).length;
    const nRoads  = (window.getRoads        && window.getRoads()        || []).length;
    const nZones  = (window.getZones        && window.getZones()        || []).length;

    _setCounterVal("kta-refonte-counter-points", nPoints);
    _setCounterVal("kta-refonte-counter-roads",  nRoads);
    _setCounterVal("kta-refonte-counter-zones",  nZones);
  }

  function _setCounterVal(parentId, val) {
    const parent = document.getElementById(parentId);
    if (!parent) return;
    const valEl = parent.querySelector(".kta-refonte-counter-val");
    if (valEl) valEl.textContent = val;
    // Classe dimmed si compteur à 0 (visuel moins agressif)
    parent.classList.toggle("kta-refonte-counter-empty", val === 0);
  }

  // ============================================================
  // STATUS BAR (sticky bottom, collapsible)
  // ============================================================
  let _statusBarEl    = null;
  let _statusBarOpen  = true;  // ouverte par défaut

  function _creerStatusBar() {
    if (_statusBarEl || !document.body) return;

    const bar = document.createElement("div");
    bar.id = "kta-refonte-statusbar";
    bar.className = "kta-refonte-statusbar";
    bar.innerHTML =
      '<div class="kta-refonte-statusbar-content" id="kta-refonte-statusbar-content">' +
        '<span class="kta-refonte-stat kta-refonte-stat-empty" id="kta-refonte-stat-mesure">' +
          '<span class="kta-refonte-stat-icon">📐</span><span class="kta-refonte-stat-val">—</span>' +
        '</span>' +
        '<span class="kta-refonte-stat kta-refonte-stat-empty" id="kta-refonte-stat-dist-totale">' +
          '<span class="kta-refonte-stat-icon">📏</span><span class="kta-refonte-stat-val">—</span>' +
        '</span>' +
        '<span class="kta-refonte-stat kta-refonte-stat-empty" id="kta-refonte-stat-iti">' +
          '<span class="kta-refonte-stat-icon">🗺️</span><span class="kta-refonte-stat-val">—</span>' +
        '</span>' +
        '<span class="kta-refonte-stat kta-refonte-stat-empty" id="kta-refonte-stat-tracker">' +
          '<span class="kta-refonte-stat-icon">🚶</span><span class="kta-refonte-stat-val">—</span>' +
        '</span>' +
      '</div>' +
      '<button class="kta-refonte-statusbar-toggle" id="kta-refonte-statusbar-toggle" title="Réduire / agrandir la barre" aria-label="Toggle status bar">▾</button>';

    document.body.appendChild(bar);
    _statusBarEl = bar;

    const toggleBtn = document.getElementById("kta-refonte-statusbar-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", _toggleStatusBar);
    }

    refreshStatusBar();
  }

  function _toggleStatusBar() {
    _statusBarOpen = !_statusBarOpen;
    if (_statusBarEl) {
      _statusBarEl.classList.toggle("kta-refonte-statusbar-collapsed", !_statusBarOpen);
    }
    const toggleBtn = document.getElementById("kta-refonte-statusbar-toggle");
    if (toggleBtn) {
      toggleBtn.textContent = _statusBarOpen ? "▾" : "▴";
      toggleBtn.title = _statusBarOpen ? "Réduire la barre" : "Agrandir la barre";
    }
  }

  // Refresh des valeurs live (mesure, distance totale, itinéraire, tracker)
  function refreshStatusBar() {
    if (!_statusBarEl) return;

    // ── 📐 Mesure simple ──
    const mesurePoints = (window.getMeasurePoints && window.getMeasurePoints()) || [];
    if (mesurePoints.length >= 2) {
      const distM = _calculerDistanceMesure(mesurePoints);
      _setStat("kta-refonte-stat-mesure", _formatDist(distM));
    } else {
      _setStat("kta-refonte-stat-mesure", null);
    }

    // ── 📏 Distance totale ──
    // 🆕 v1.8.1 (fix KARMA) : on utilise désormais l'API publique
    // window.getDistanceTotaleStatus() qui lit l'état du surlignage
    // magenta (_rdHighlightLayer), pas le DOM de la modale.
    // Avant : on lisait .kta-rd-total-value qui disparaissait à la
    // fermeture de la modale → la stat statusbar s'éteignait alors que
    // le surlignage restait actif. Maintenant : la stat persiste tant
    // que le surlignage est visible sur la carte.
    if (typeof window.getDistanceTotaleStatus === "function") {
      const dtStatus = window.getDistanceTotaleStatus();
      if (dtStatus) {
        _setStat("kta-refonte-stat-dist-totale", _formatDist(dtStatus.totalM));
      } else {
        _setStat("kta-refonte-stat-dist-totale", null);
      }
    } else {
      // Fallback ancien (au cas où l'API n'est pas exposée pour
      // quelque raison — rétrocompat soft)
      const rdMeta = document.querySelector("#kta-rd-modal .kta-rd-total-value");
      if (rdMeta && rdMeta.textContent) {
        _setStat("kta-refonte-stat-dist-totale", rdMeta.textContent.trim());
      } else {
        _setStat("kta-refonte-stat-dist-totale", null);
      }
    }

    // ── 🗺️ Itinéraire ──
    // Read direct depuis le L.control de l'itinéraire existant
    const itiCtrlText = document.querySelector(".kta-iti-distance");
    if (itiCtrlText && itiCtrlText.textContent) {
      _setStat("kta-refonte-stat-iti", itiCtrlText.textContent.trim().replace(/^🗺️\s*/, ""));
    } else {
      _setStat("kta-refonte-stat-iti", null);
    }

    // ── 🚶 Tracker (position si actif) ──
    if (window.getTrackingActif && window.getTrackingActif()) {
      const pos = window.getTrackingPosition && window.getTrackingPosition();
      if (pos) {
        _setStat("kta-refonte-stat-tracker", "Actif (" + Math.round(pos.x) + ", " + Math.round(pos.y) + ")");
      } else {
        _setStat("kta-refonte-stat-tracker", "Actif");
      }
    } else {
      _setStat("kta-refonte-stat-tracker", null);
    }
  }

  function _setStat(parentId, value) {
    const parent = document.getElementById(parentId);
    if (!parent) return;
    const valEl = parent.querySelector(".kta-refonte-stat-val");
    if (value === null || value === undefined || value === "") {
      if (valEl) valEl.textContent = "—";
      parent.classList.add("kta-refonte-stat-empty");
    } else {
      if (valEl) valEl.textContent = value;
      parent.classList.remove("kta-refonte-stat-empty");
    }
  }

  // Helpers
  function _calculerDistanceMesure(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i-1].x;
      const dy = points[i].y - points[i-1].y;
      total += Math.sqrt(dx*dx + dy*dy);
    }
    const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) || 1;
    return total / scale;
  }

  function _formatDist(distM) {
    if (typeof window.formatDistance === "function") {
      return window.formatDistance(distM, 1);
    }
    if (distM >= 1000) return (distM / 1000).toFixed(2) + " km";
    return distM.toFixed(1) + " m";
  }

  // ============================================================
  // POLLING LIGHT : refresh compteurs/status bar toutes les 2s
  // ============================================================
  // Pas d'event listeners spécifiques sur les setters de l'app — pour
  // rester décorrelé du code existant. 2s = fluide pour l'utilisateur
  // sans gaspiller le CPU (les calculs sont O(N) sur des arrays courts).
  let _pollTimer = null;
  function _startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(function() {
      try {
        updateCompteurs();
        refreshStatusBar();
      } catch(e) { /* silencieux pour pas spammer la console */ }
    }, 2000);
  }
  function _stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  // ============================================================
  // SETUP : à appeler par main.js après lancerApplication (ou via hook
  // détectant que window.map est dispo)
  // ============================================================
  function _setupQuandMapPrete() {
    // On attend que la carte soit prête (= un plan est chargé)
    if (window.map) {
      _creerHeaderBar();
      _creerStatusBar();
      _startPolling();
    } else {
      // Retry court — la carte sera prête dans qq centaines de ms
      setTimeout(_setupQuandMapPrete, 200);
    }
  }

  // Hook : main.js > lancerApplication appelle window._refonteInterfacePostInit
  // s'il existe, après que tout est prêt. On expose ce hook pour qu'il
  // soit appelé par main.js sans dépendance forte.
  window._refonteInterfacePostInit = function() {
    _setupQuandMapPrete();
  };

  // Et au cas où on est chargé après lancerApplication (cas rare mais
  // safe), on tente direct si window.map existe.
  document.addEventListener("DOMContentLoaded", function() {
    if (window.map) _setupQuandMapPrete();
  });

  // ============================================================
  // CLEANUP au plan switch (main.js > _libererRessourcesPlanPrecedent)
  // ============================================================
  // Hook exposé pour que main.js puisse appeler le cleanup en plan switch
  // (sinon le header/status bar reste affiché avec les vieilles valeurs
  // pendant le splash). À nettoyer dans le _libererRessourcesPlanPrecedent
  // si on veut être strict, mais en pratique le polling 2s rattrape vite.
  window._refonteInterfacePreUnload = function() {
    _stopPolling();
    if (_headerEl) {
      try { _headerEl.remove(); } catch(e) {}
      _headerEl = null;
    }
    if (_statusBarEl) {
      try { _statusBarEl.remove(); } catch(e) {}
      _statusBarEl = null;
    }
  };

  // ============================================================
  // API PUBLIQUE
  // ============================================================
  function _setActive(value) {
    _writeFlag(value);
    // Reload requis pour appliquer (la classe body + injection DOM doit
    // se faire au boot pour rester safe).
    if (confirm("L'interface refonte sera " + (value ? "ACTIVÉE" : "DÉSACTIVÉE") + " au prochain démarrage. Recharger maintenant ?")) {
      location.reload();
    }
  }

  window.RefonteInterface = {
    isActive:         function() { return window._refonteInterfaceActive === true; },
    setActive:        _setActive,
    updateCompteurs:  updateCompteurs,
    refreshStatusBar: refreshStatusBar
  };

  // Banner console
  console.info(
    "%c[Refonte UI v1]%c Interface refonte active. Toggle dans ⚙️ Réglages → 🎨 Affichage.",
    "background:#f4c542;color:#1a1f2e;font-weight:bold;padding:2px 6px;border-radius:3px;",
    "color:#f4c542;"
  );

})();
