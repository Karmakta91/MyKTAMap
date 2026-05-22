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
  // 🆕 v1.8.1-refonte-8 : INVERSION sémantique du flag (KARMA).
  // Avant : `myktamap_refonte_v1 = "1"` → nouvelle interface ON (opt-in)
  // Maintenant : nouvelle interface est le DÉFAUT. L'user peut cocher
  // "Utiliser l'ancienne interface (classique)" pour revenir à v1.8.x.
  //   - LS_LEGACY = "1"  → ancienne interface (legacy mode)
  //   - LS_LEGACY absent → nouvelle interface (refonte = défaut)
  const LS_LEGACY = "myktamap_legacy_interface";

  // Migration : si l'user avait déjà coché l'ancien flag opt-in
  // `myktamap_refonte_v1 = "1"`, il avait déjà la nouvelle interface
  // → maintenant c'est le défaut, on supprime le flag obsolète pour
  // garder le localStorage propre. Aucun changement d'expérience.
  try {
    if (localStorage.getItem("myktamap_refonte_v1") === "1") {
      localStorage.removeItem("myktamap_refonte_v1");
    }
  } catch(e) {}

  // ============================================================
  // LECTURE FLAG (au chargement du module)
  // ============================================================
  // Retourne TRUE si la nouvelle interface est active.
  // C'est TRUE par défaut sauf si l'user a explicitement coché "ancienne".
  function _readFlag() {
    try {
      return localStorage.getItem(LS_LEGACY) !== "1";
    } catch(e) { return true; }  // localStorage indispo → on prend le défaut (nouvelle)
  }

  // Set la nouvelle interface ON (value=true) ou OFF (value=false = legacy).
  function _writeFlag(value) {
    try {
      if (value) localStorage.removeItem(LS_LEGACY);     // remove = défaut = nouvelle
      else       localStorage.setItem(LS_LEGACY, "1");   // set = legacy = ancienne
    } catch(e) {}
  }

  // Exposer l'état tôt pour que interface.js puisse le lire avant init
  window._refonteInterfaceActive = _readFlag();

  // Si nouvelle interface OFF (= legacy actif), on s'arrête là : aucun
  // DOM créé, aucun CSS ajouté → l'app fonctionne en v1.8.x strict.
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
        // 🆕 v1.2 fix : utilise la même modale charte que "Mes plans" /
        // "Charger un plan" (afficherPopupChangerPlan) au lieu du
        // confirm() natif. Le helper _retourLoaderAvecConfirm gère :
        //   - Si session sans modifs → afficherLoader direct
        //   - Si session avec modifs → modale custom "Changer de plan"
        //     (style charte avec boutons "Rester ici" / "📚 Mes plans")
        // Exposé par interface.js depuis v1.8.1-refonte-4.
        if (typeof window._retourLoaderAvecConfirm === "function") {
          window._retourLoaderAvecConfirm();
        } else if (typeof window.afficherLoader === "function") {
          // Fallback safety net si l'helper n'est pas (encore) exposé
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
        // 🆕 Clic sur les compteurs → modale "📊 Détails de la session"
        // listant tous les éléments (points, tracés, zones, mesure,
        // itinéraire, tracker) avec leurs infos détaillées.
        updateCompteurs();  // refresh des valeurs avant ouverture
        // 🆕 v1.8.1-refonte-10 : check défensif. La fonction est déclarée
        // plus bas DANS LE MÊME IIFE → le hoisting JS doit la rendre
        // accessible ici. Si jamais un cas d'erreur apparaît (deploy
        // partiel via FTP, cache SW stale qui sert une moitié de fichier,
        // minifieur agressif qui casserait la déclaration, etc.), on
        // veut au moins un message console clair plutôt qu'un crash UI
        // silencieux.
        if (typeof _afficherModaleSessionDetail === "function") {
          _afficherModaleSessionDetail();
        } else {
          console.error(
            "[RefonteInterface] _afficherModaleSessionDetail introuvable. " +
            "Fichier déployé peut-être incomplet ? Tente un reset PWA " +
            "(⚙️ Réglages → Vider le cache) ou re-FTP de refonteInterface.js."
          );
        }
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
        // 🆕 v1.8.1-refonte-14 : la stat itinéraire est désormais cliquable —
        // au clic on rouvre la modale itinéraire (équivalent ancien comportement
        // du label .kta-iti-distance en bottom-left qui était cliquable et qu'on
        // a masqué en mode refonte). Cursor pointer + title via CSS.
        '<span class="kta-refonte-stat kta-refonte-stat-empty kta-refonte-stat-clickable" id="kta-refonte-stat-iti" title="Cliquer pour ouvrir le menu Itinéraire">' +
          '<span class="kta-refonte-stat-icon">🗺️</span><span class="kta-refonte-stat-val">—</span>' +
        '</span>' +
        // 🆕 v1.8.1-refonte-14 : tracker passé en icône BOUSSOLE 🧭 (au lieu
        // de 🚶 qui se confondait visuellement avec le 🚶 du badge "mode
        // marche" de la stat itinéraire). Affiche ON (vert) ou OFF (rouge)
        // selon que le tracking GPS est actif ou non. Feedback KARMA :
        // "on met une boussole avec un ON vert et un OFF rouge".
        '<span class="kta-refonte-stat kta-refonte-stat-tracker-off" id="kta-refonte-stat-tracker">' +
          '<span class="kta-refonte-stat-icon">🧭</span><span class="kta-refonte-stat-val">OFF</span>' +
        '</span>' +
      '</div>' +
      '<button class="kta-refonte-statusbar-toggle" id="kta-refonte-statusbar-toggle" title="Réduire / agrandir la barre" aria-label="Toggle status bar">▾</button>';

    document.body.appendChild(bar);
    _statusBarEl = bar;

    const toggleBtn = document.getElementById("kta-refonte-statusbar-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", _toggleStatusBar);
    }

    // 🆕 v1.8.1-refonte-14 : clic sur la stat ITI du footer → ouvre la modale
    // itinéraire (équivalent à l'ancien label `.kta-iti-distance` cliquable
    // en bottom-left qui faisait pareil avant la refonte). On ne déclenche
    // que si la stat n'est pas vide (= itinéraire actif), pour éviter
    // d'ouvrir la modale dans un état "rien à afficher" perturbant.
    const itiStat = document.getElementById("kta-refonte-stat-iti");
    if (itiStat) {
      itiStat.addEventListener("click", function() {
        // Si la stat affiche "—" (classe kta-refonte-stat-empty), on n'a pas
        // d'itinéraire actif → clic ignoré silencieusement (cursor: default
        // côté CSS pour qu'il n'y ait même pas de retour visuel cliquable).
        if (itiStat.classList.contains("kta-refonte-stat-empty")) return;
        if (typeof window.ouvrirItinerairModal === "function") {
          window.ouvrirItinerairModal();
        }
      });
    }

    refreshStatusBar();

    // 🆕 v1.8.1-refonte-10 : ResizeObserver sur le status bar pour synchroniser
    // la variable CSS `--kta-statusbar-h` avec la hauteur RÉELLE de la barre.
    // Cas qui nécessite ce calcul dynamique :
    //   - Petit écran + 4 stats actives (mesure + dist totale + iti + tracker)
    //     → le contenu wrap sur 2 lignes → la barre passe de 52px à ~70px.
    //   - Rotation portrait/landscape → la barre change de hauteur de base.
    //   - Collapse/expand par toggle ▾▴ → 20px ↔ 52+ px.
    //
    // Sans ce sync, le footer recouvre la carte et la boussole en bas-gauche
    // (bug remonté KARMA : "si toute les informations sont afficher en footer
    // on sort du cadre [...] agrandir le footer dynamiquement et passer
    // a la ligne toute la partie qui sort").
    //
    // Conséquences en cascade (gérées via la même variable CSS) :
    //   - #map { bottom: var(--kta-statusbar-h) } → carte se redimensionne
    //   - .kta-compass-widget { bottom: calc(var(--kta-statusbar-h) + 8px) }
    //   - .leaflet-top { max-height: ... - var(--kta-statusbar-h) ... }
    //   - .kta-readme-modal-overlay { padding-bottom: ... }
    _setupStatusBarResizeObserver();
  }

  // ResizeObserver helper — séparé pour pouvoir nettoyer/relancer si besoin.
  let _statusBarRO = null;
  function _setupStatusBarResizeObserver() {
    if (!_statusBarEl || _statusBarRO) return;

    // _syncH : lit la hauteur réelle (offsetHeight inclut padding+border,
    // donc safe-area-inset-bottom déjà compris vu que padding-bottom de
    // la barre vaut env(safe-area-inset-bottom)). Écrit dans la variable
    // CSS au niveau de :root pour cascade globale.
    function _syncH() {
      if (!_statusBarEl) return;
      const h = _statusBarEl.offsetHeight;
      if (h > 0) {
        document.documentElement.style.setProperty("--kta-statusbar-h", h + "px");
      }
      // Notifier Leaflet pour qu'il recalcule la taille de la carte
      // (sinon les tiles affichées hors-zone ne sont pas mises à jour
      // avant la prochaine interaction utilisateur). Debounce via rAF.
      if (window.map && typeof window.map.invalidateSize === "function") {
        requestAnimationFrame(function() {
          try { window.map.invalidateSize({ animate: false }); } catch(e) {}
        });
      }
    }

    if (typeof ResizeObserver !== "undefined") {
      _statusBarRO = new ResizeObserver(_syncH);
      _statusBarRO.observe(_statusBarEl);
    }

    // Synchro immédiate (et fallback si ResizeObserver pas dispo : on
    // appelle quand même au chargement + sur orientationchange/resize).
    _syncH();
    window.addEventListener("orientationchange", _onOrientationChange);
    // Pageshow event aussi : se déclenche quand l'user revient sur la
    // page après avoir été dans une autre app (background → foreground)
    // — moment où iOS peut avoir "oublié" la viewport correcte.
    window.addEventListener("pageshow", function(e) {
      // Persisted = page restaurée depuis le cache (bfcache iOS)
      if (e.persisted) _onOrientationChange();
    });

    // 🆕 v1.9.2-fix7 (insight clé KARMA : "si je passe en horizontal,
    // revient en vertical, le footer en trop disparait et s'affiche
    // comme on aurait voulu, et les tailles redeviennent correctes").
    //
    // Diagnostic : iOS PWA standalone + viewport-fit=cover NE CALCULE
    // PAS correctement la viewport au 1er paint. La rotation
    // utilisateur force iOS à recompute → tout devient correct.
    // Donc en simulant la rotation au load (scrollTo + meta viewport
    // rewrite, déjà implémentés dans _onOrientationChange), on
    // déclenche le recompute SANS que l'utilisateur ait à tourner.
    //
    // Pourquoi plusieurs retries : iOS peut être "pas prêt" pendant
    // les premières centaines de ms (Leaflet n'est pas chargé, le
    // statusbar a une hauteur transitoire, etc.). On rejoue à
    // plusieurs intervalles pour maximiser les chances qu'au moins
    // un appel tombe quand iOS est en état stable.
    setTimeout(_onOrientationChange, 200);
    setTimeout(_onOrientationChange, 800);
    setTimeout(_onOrientationChange, 1800);
  }

  // 🆕 v1.9.2 (approche fresh) — bug iOS PWA "status bar disparaît après
  // rotation landscape → portrait". Diagnostic : iOS Safari standalone
  // hide auto le status bar (heure, batterie) en landscape sur iPhone
  // pour donner du fullscreen, mais REFUSE de le restaurer au retour
  // portrait dans certains cas. Pas d'API JS pour forcer iOS à le
  // remontrer.
  //
  // 2 workarounds connus dans la communauté iOS PWA, qu'on empile pour
  // maximiser les chances :
  //   1. scrollTo (+1, 0) — simule une activité scroll, iOS revérifie
  //      la visibilité de son chrome (status bar, URL bar) à chaque scroll.
  //   2. Viewport meta rewrite — réécrire la valeur identique de la meta
  //      viewport force iOS à recalculer la viewport intégralement.
  //
  // ⚠️ On NE TOUCHE PAS à body.kta-refonte-v1 (avait empiré le bug en
  // commit dbfe2c0). On ne touche QUE le scroll + meta viewport, à 600ms
  // après rotation pour laisser iOS se stabiliser d'abord.
  function _onOrientationChange() {
    setTimeout(_syncH, 100);
    setTimeout(_syncH, 350);

    setTimeout(function() {
      try {
        // Workaround 1 : scrollTo trick — tiny scroll trigger
        const sx = window.scrollX || 0;
        const sy = window.scrollY || 0;
        window.scrollTo(sx, sy + 1);
        requestAnimationFrame(function() {
          window.scrollTo(sx, sy);
        });

        // Workaround 2 : viewport meta rewrite (force iOS à recalculer
        // l'attribution viewport sans changer la valeur effective)
        const meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
          const content = meta.getAttribute("content");
          if (content) {
            // setAttribute avec la même valeur déclenche un mutation
            // observable côté navigateur → iOS re-évalue
            meta.setAttribute("content", content);
          }
        }
      } catch(e) {
        console.warn("[RefonteInterface] orientation workaround failed:", e);
      }
    }, 600);
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

    // ── 🧭 Tracker (boussole GPS — ON vert / OFF rouge) ──
    // 🆕 v1.8.1-refonte-14 : ce stat utilise un toggle visuel binaire ON/OFF
    // au lieu du pattern "vide ↔ valeur". Toggle CSS via 2 classes :
    //   - kta-refonte-stat-tracker-on  → texte "ON" sur fond vert
    //   - kta-refonte-stat-tracker-off → texte "OFF" sur fond rouge
    // Pas de classe kta-refonte-stat-empty ici (jamais "—") : la boussole
    // est TOUJOURS visible, juste son état change. UX inspirée des
    // indicateurs LED hardware (visibilité immédiate de l'état du GPS).
    const trackerEl = document.getElementById("kta-refonte-stat-tracker");
    if (trackerEl) {
      const valEl = trackerEl.querySelector(".kta-refonte-stat-val");
      const trackerActif = !!(window.getTrackingActif && window.getTrackingActif());
      trackerEl.classList.toggle("kta-refonte-stat-tracker-on", trackerActif);
      trackerEl.classList.toggle("kta-refonte-stat-tracker-off", !trackerActif);
      // Pas de classe "empty" sur le tracker (toggle géré au-dessus) — on
      // la retire au cas où elle traînerait d'un état antérieur.
      trackerEl.classList.remove("kta-refonte-stat-empty");
      if (valEl) {
        valEl.textContent = trackerActif ? "ON" : "OFF";
      }
      trackerEl.title = trackerActif
        ? "Tracking GPS actif (cliquer pour gérer)"
        : "Tracking GPS désactivé";
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
  // MODALE "📊 DÉTAILS DE LA SESSION"
  // ============================================================
  // Ouverte au clic sur les compteurs du header refondu.
  // Liste tous les éléments de la session active avec leurs infos :
  //   - Points ajoutés (id, nom, tags, coord, level si multi-niveau)
  //   - Tracés (type, nb points, distance, level)
  //   - Zones (type, nb sommets, level)
  //   - Mesure simple (distance)
  //   - Itinéraire actif (waypoints, distance, temps estimé)
  //   - Tracker (statut, position, distance parcourue)
  //
  // Pattern .kta-readme-modal-overlay pour cohérence charte projet.
  function _afficherModaleSessionDetail() {
    // Cleanup éventuel d'une instance précédente
    const existing = document.getElementById("kta-refonte-session-modal");
    if (existing) { existing.remove(); return; }

    const points  = (window.getEditorPoints  && window.getEditorPoints()  || []);
    const roads   = (window.getRoads         && window.getRoads()         || []);
    const zones   = (window.getZones         && window.getZones()         || []);
    const mesure  = (window.getMeasurePoints && window.getMeasurePoints() || []);
    const scale   = (window.APP_CONFIG && window.APP_CONFIG.scale) || 1;
    const multiLevel = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel);

    // ─── HTML helpers ───
    function _esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
        return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
      });
    }
    function _distRoad(road) {
      if (!road || !Array.isArray(road.points) || road.points.length < 2) return 0;
      let total = 0;
      for (let i = 1; i < road.points.length; i++) {
        const dx = road.points[i].x - road.points[i-1].x;
        const dy = road.points[i].y - road.points[i-1].y;
        total += Math.sqrt(dx*dx + dy*dy);
      }
      return total / scale;
    }
    function _formatDist(distM) {
      if (typeof window.formatDistance === "function") return window.formatDistance(distM, 1);
      if (distM >= 1000) return (distM / 1000).toFixed(2) + " km";
      return distM.toFixed(1) + " m";
    }

    // ─── Construction du contenu ───
    let html = "";

    // 📍 Points
    html += '<div class="kta-refonte-session-section">';
    html += '<div class="kta-refonte-session-section-titre">📍 Points ajoutés <span class="kta-refonte-session-badge">' + points.length + '</span></div>';
    if (points.length === 0) {
      html += '<div class="kta-refonte-session-empty">Aucun point ajouté pour le moment. Utilise ✏️ Édition pour en ajouter.</div>';
    } else {
      html += '<ul class="kta-refonte-session-list">';
      points.forEach(function(p) {
        const tag    = Array.isArray(p.tags) && p.tags.length > 0 ? p.tags[0] : "—";
        const nom    = p.nom || p.id || "(sans nom)";
        const coord  = Math.round(p.x || 0) + ", " + Math.round(p.y || 0);
        const level  = multiLevel ? ' · 🏗 N' + (p.level || 0) : '';
        html += '<li>' +
          '<strong>' + _esc(nom) + '</strong>' +
          '<span class="kta-refonte-session-meta">' + _esc(tag) + ' · ' + coord + level + '</span>' +
        '</li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // 🛣 Tracés
    const roadsNonIti = roads.filter(function(r) { return r.type !== "itinerary"; });
    const itineraire  = roads.find(function(r) { return r.type === "itinerary"; });
    html += '<div class="kta-refonte-session-section">';
    html += '<div class="kta-refonte-session-section-titre">🛣 Tracés <span class="kta-refonte-session-badge">' + roadsNonIti.length + '</span></div>';
    if (roadsNonIti.length === 0) {
      html += '<div class="kta-refonte-session-empty">Aucun tracé. Utilise 🛣 Tracés pour dessiner.</div>';
    } else {
      // Group par type pour résumé
      const byType = {};
      roadsNonIti.forEach(function(r) {
        const t = r.type || "?";
        if (!byType[t]) byType[t] = { nb: 0, distM: 0 };
        byType[t].nb += 1;
        byType[t].distM += _distRoad(r);
      });
      html += '<ul class="kta-refonte-session-list">';
      Object.keys(byType).forEach(function(t) {
        const stats = byType[t];
        const tLabel = t === "principal" ? "Principal" :
                       t === "secondaire" ? "Secondaire" :
                       t === "chemin" ? "Chemin" :
                       t === "jonction" ? "Jonction interniveau" : t;
        html += '<li>' +
          '<strong>' + _esc(tLabel) + '</strong>' +
          '<span class="kta-refonte-session-meta">' +
            stats.nb + ' tracé' + (stats.nb > 1 ? 's' : '') + ' · ' + _formatDist(stats.distM) +
          '</span>' +
        '</li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // ⬛ Zones
    html += '<div class="kta-refonte-session-section">';
    html += '<div class="kta-refonte-session-section-titre">⬛ Zones <span class="kta-refonte-session-badge">' + zones.length + '</span></div>';
    if (zones.length === 0) {
      html += '<div class="kta-refonte-session-empty">Aucune zone tracée. Utilise ⬛ Zones pour en délimiter.</div>';
    } else {
      const zByType = {};
      zones.forEach(function(z) {
        const t = z.type || "?";
        zByType[t] = (zByType[t] || 0) + 1;
      });
      html += '<ul class="kta-refonte-session-list">';
      Object.keys(zByType).forEach(function(t) {
        const tLabel = t === "eau" ? "Eau 🟦" :
                       t === "remblais" ? "Remblais ⬛" :
                       t === "effondrement" ? "Effondrement 🟥" :
                       t === "inaccessible" ? "Inaccessible ⛔" : t;
        const nb = zByType[t];
        html += '<li>' +
          '<strong>' + _esc(tLabel) + '</strong>' +
          '<span class="kta-refonte-session-meta">' + nb + ' zone' + (nb > 1 ? 's' : '') + '</span>' +
        '</li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // 📐 Mesure simple + 🗺️ Itinéraire + 🚶 Tracker
    const tFoo = !!(window.getTrackingPosition && window.getTrackingPosition());
    if (mesure.length >= 2 || itineraire || tFoo) {
      html += '<div class="kta-refonte-session-section">';
      html += '<div class="kta-refonte-session-section-titre">📊 Autres mesures</div>';
      html += '<ul class="kta-refonte-session-list">';

      // Mesure simple
      if (mesure.length >= 2) {
        let total = 0;
        for (let i = 1; i < mesure.length; i++) {
          const dx = mesure[i].x - mesure[i-1].x;
          const dy = mesure[i].y - mesure[i-1].y;
          total += Math.sqrt(dx*dx + dy*dy);
        }
        html += '<li>' +
          '<strong>📐 Mesure simple</strong>' +
          '<span class="kta-refonte-session-meta">' + _formatDist(total / scale) + ' (' + mesure.length + ' points)</span>' +
        '</li>';
      }

      // Itinéraire
      if (itineraire) {
        const distIti = _distRoad(itineraire);
        const nbWp = Array.isArray(itineraire.waypoints) ? itineraire.waypoints.length : 0;
        html += '<li>' +
          '<strong>🗺️ Itinéraire actif</strong>' +
          '<span class="kta-refonte-session-meta">' +
            _formatDist(distIti) + (nbWp > 0 ? ' · ' + nbWp + ' waypoint' + (nbWp > 1 ? 's' : '') : '') +
          '</span>' +
        '</li>';
      }

      // Tracker
      if (tFoo) {
        const pos = window.getTrackingPosition();
        html += '<li>' +
          '<strong>🚶 Tracker</strong>' +
          '<span class="kta-refonte-session-meta">' +
            'Actif · (' + Math.round(pos.x) + ', ' + Math.round(pos.y) + ')' +
          '</span>' +
        '</li>';
      }

      html += '</ul>';
      html += '</div>';
    }

    // ─── Création de la modale ───
    const overlay = document.createElement("div");
    overlay.id = "kta-refonte-session-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-refonte-session-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📊 Détails de la session</span>' +
          '<button class="kta-panneau-close" id="kta-refonte-session-close" aria-label="Fermer">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-refonte-session-corps">' +
          html +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(overlay);

    function _close() {
      try { overlay.remove(); } catch(e) {}
      document.removeEventListener("keydown", _onKey);
    }
    function _onKey(e) {
      if (e.key === "Escape") _close();
    }
    document.addEventListener("keydown", _onKey);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) _close();
    });
    document.getElementById("kta-refonte-session-close").addEventListener("click", _close);
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

  // ============================================================
  // BOUTONS DE RÉDUCTION DES SIDEBARS (gauche / droite)
  // ============================================================
  // Itération KARMA (1:a 2:a) : chaque sidebar a un bouton ≡ EN HAUT.
  // Au clic, tous les autres controls de cette sidebar sont cachés
  // (seul le bouton ≡ reste visible pour rouvrir). Pas de persistance
  // (5:b) — au boot la sidebar est toujours déroulée.
  //
  // Implémentation : on crée un L.control en first-of-side via flex
  // order:-1 (CSS) pour qu'il apparaisse en haut visuellement, peu
  // importe son ordre dans le DOM (Leaflet ajoute les controls dans
  // l'ordre d'appel addTo, donc Layers et Zoom sont créés avant nous).
  // Icônes du bouton de réduction :
  //   ▾ = déplié (flèche vers le BAS, "tout est visible en dessous")
  //   ▸ = replié sidebar GAUCHE  (flèche vers l'intérieur de l'écran)
  //   ◂ = replié sidebar DROITE  (flèche vers l'intérieur de l'écran)
  // Cohérent avec la sémantique "la barre se ramasse vers le centre".
  // Changement v1.2 (feedback KARMA) : avant ≡ qui ressemblait trop à
  // l'icône des calques Leaflet (3 lignes horizontales).
  function _iconeCollapse(side, isCollapsed) {
    if (!isCollapsed) return "▾";
    return side === "left" ? "▸" : "◂";
  }

  function _creerBoutonReduction(position) {
    if (!window.map) return null;
    const side = position === "topleft" ? "left" : "right";
    const cls  = "kta-refonte-sidebar-" + side + "-collapsed";
    const ctrl = L.control({ position: position });
    ctrl.onAdd = function() {
      const div = L.DomUtil.create(
        "div",
        "leaflet-bar leaflet-control kta-refonte-collapse-bar kta-refonte-collapse-" + side
      );
      div.dataset.refonteSide = side;
      const a = L.DomUtil.create("a", "kta-refonte-collapse-btn", div);
      a.href  = "javascript:void(0)";
      a.title = "Réduire cette barre";
      a.setAttribute("aria-label", "Réduire la barre " + side);
      // État initial : déplié (5:b = pas de persistance, toujours
      // déroulée au boot) → icône ▾
      a.innerHTML = _iconeCollapse(side, false);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, "click", function(e) {
        L.DomEvent.stop(e);
        const isCollapsed = document.body.classList.toggle(cls);
        a.innerHTML = _iconeCollapse(side, isCollapsed);
        a.title = (isCollapsed ? "Agrandir" : "Réduire") + " cette barre";
        a.setAttribute("aria-pressed", isCollapsed ? "true" : "false");
        // Si on collapse alors qu'un groupe accordéon est ouvert dans
        // cette sidebar, on le ferme pour cohérence visuelle (sinon le
        // sous-menu se rouvrirait au décollapse sans raison).
        if (isCollapsed && typeof window._fermerGroupeOuvertSide === "function") {
          try { window._fermerGroupeOuvertSide(side); } catch(e) {}
        }
      });
      return div;
    };
    ctrl.addTo(window.map);
    return ctrl;
  }

  // Exposé pour interface.js (appelé au tout début de initInterface)
  window._refonteInterfaceCreerBoutonReductionLeft  = function() {
    return _creerBoutonReduction("topleft");
  };
  window._refonteInterfaceCreerBoutonReductionRight = function() {
    return _creerBoutonReduction("topright");
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
  // 🆕 v1.9.2-fix4 (KARMA "le modal qui apparaît doit respecter la
  // charte graphique") : remplacement du `confirm()` natif OS (modale
  // grise iOS/Android) par une modale custom .kta-readme-modal-boite
  // avec accent doré (changement d'interface = action UI).
  //
  // Bonus : le flag est désormais écrit UNIQUEMENT si user confirme.
  // Avant : _writeFlag(value) était appelé AVANT le confirm, donc si
  // user annulait, le flag était déjà modifié dans localStorage et
  // s'appliquait au prochain démarrage. Maintenant : flag écrit que
  // si user clique "Recharger maintenant".
  //
  // setActive retourne une Promise<boolean> : true = confirmé+reload,
  // false = annulé. Les callers (index.html, interface.js) attendent
  // la Promise pour revert le checkbox si annulation.
  function _setActive(value) {
    return _afficherConfirmInterfaceChange(value).then(function(confirmed) {
      if (confirmed) {
        _writeFlag(value);
        location.reload();
      }
      return confirmed;
    });
  }

  // Modale custom respectant la charte (.kta-readme-modal-boite +
  // accent doré #f4c542). Pattern Promise-based identique à la modale
  // "Forcer la mise à jour" du loader (cf. index.html). Fermable via
  // ✕ / backdrop / Échap / "Annuler" → résout false ; clic "Valider"
  // → résout true.
  //
  // 🆕 v1.9.2-fix5 (KARMA "le recharger maintenant n'a pas de sens,
  // ca rechargera de base ; on met valider ou annuler, et enlève la
  // phrase L'app doit être rechargée. Et on adapte le modal dans le
  // cas où on passe à l'ancienne interface") :
  //   - Boutons : "Annuler" / "Valider" (au lieu de "Plus tard" /
  //     "🔄 Recharger maintenant")
  //   - Retrait du paragraphe explicatif sur le reload
  //   - Texte adapté selon la direction (vers nouvelle vs vers
  //     ancienne) avec titre, label et description différenciés
  function _afficherConfirmInterfaceChange(valueIsNouvelle) {
    return new Promise(function(resolve) {
      // Cleanup éventuel d'une instance précédente
      const existing = document.getElementById("kta-refonte-interface-confirm");
      if (existing) existing.remove();

      // Texte différencié selon la direction du toggle
      const titre = valueIsNouvelle
        ? "🎨 Passer à la nouvelle interface ?"
        : "📜 Revenir à l'ancienne interface ?";
      const labelCible = valueIsNouvelle
        ? "la NOUVELLE interface (refonte)"
        : "l'ANCIENNE interface (classique v1.8.x)";
      const description = valueIsNouvelle
        ? 'Tu profiteras du header bar avec rose des vents et compteurs cliquables, des sidebars unifiées gauche/droite, et du status bar avec stats live (mesure, distance totale, itinéraire, tracker GPS).'
        : 'Tu retrouveras l\'interface classique : icônes empilées sans header bar ni status bar, comme avant la refonte v1.9.x. Les modes et les modales restent identiques.';

      const overlay = document.createElement("div");
      overlay.id = "kta-refonte-interface-confirm";
      overlay.className = "kta-readme-modal-overlay";
      overlay.style.display = "flex";

      // Accent doré charte (#f4c542) — action UI (interface), pas
      // destructive donc pas rouge, pas informative bleu non plus →
      // doré qui matche l'identité visuelle MyKTAMap.
      overlay.innerHTML =
        '<div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:92vh; border:1px solid rgba(244,197,66,0.4); box-shadow:0 0 32px rgba(244,197,66,0.18);">' +
          '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(244,197,66,0.25);">' +
            '<div class="kta-readme-modal-titre" style="color:#f4c542;">' + titre + '</div>' +
            '<button class="kta-panneau-close" type="button" id="kta-rint-close" aria-label="Fermer">✕</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps" style="color:#c8d0e0;">' +
            '<p style="margin:0 0 14px 0; line-height:1.55;">' +
              'Tu vas passer à <strong style="color:#f4c542;">' + labelCible + '</strong>.' +
            '</p>' +
            '<p style="margin:0 0 14px 0; line-height:1.55; font-size:13px; color:#8892a4;">' +
              description +
            '</p>' +
            '<div style="background:rgba(244,197,66,0.06); border:1px solid rgba(244,197,66,0.22); border-radius:8px; padding:10px 14px; margin-bottom:0;">' +
              '<div style="font-weight:600; color:#f4c542; margin-bottom:6px;">✅ Préservé</div>' +
              '<ul style="margin:0; padding-left:20px; line-height:1.6;">' +
                '<li>Tes plans mémorisés</li>' +
                '<li>Sessions auto-save en cours</li>' +
                '<li>Préférences (perf, debug, etc.)</li>' +
                '<li>Code d\'accès communautaire</li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
          '<div class="kta-readme-modal-footer" style="display:flex; gap:10px; justify-content:flex-end; border-top:1px solid rgba(255,255,255,0.06); padding:12px 18px; flex-shrink:0;">' +
            '<button class="kta-btn kta-btn-ghost" type="button" id="kta-rint-cancel">Annuler</button>' +
            '<button class="kta-btn kta-btn-primary" type="button" id="kta-rint-confirm" style="background:#f4c542; color:#0a0d18; border-color:#f4c542;">Valider</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      function _close(result) {
        const ov = document.getElementById("kta-refonte-interface-confirm");
        if (ov) ov.remove();
        document.removeEventListener("keydown", _onEsc);
        resolve(result);
      }
      function _onEsc(e) { if (e.key === "Escape") _close(false); }

      document.getElementById("kta-rint-close").addEventListener("click", function() { _close(false); });
      document.getElementById("kta-rint-cancel").addEventListener("click", function() { _close(false); });
      document.getElementById("kta-rint-confirm").addEventListener("click", function() { _close(true); });

      // Clic sur backdrop overlay (hors de la boîte) → ferme = annule
      overlay.addEventListener("click", function(e) {
        if (e.target === overlay) _close(false);
      });

      document.addEventListener("keydown", _onEsc);
    });
  }

  window.RefonteInterface = {
    isActive:         function() { return window._refonteInterfaceActive === true; },
    setActive:        _setActive,
    updateCompteurs:  updateCompteurs,
    refreshStatusBar: refreshStatusBar
  };

  // Banner console
  console.info(
    "%c[Refonte UI v1]%c Nouvelle interface active (défaut depuis v1.8.1-refonte-8). " +
    "Pour revenir à l'ancienne : ⚙️ Configuration (home) ou ⚙️ Réglages (map) → 🎨 Affichage.",
    "background:#f4c542;color:#1a1f2e;font-weight:bold;padding:2px 6px;border-radius:3px;",
    "color:#f4c542;"
  );

})();
