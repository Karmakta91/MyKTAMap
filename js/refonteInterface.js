/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * Site : https://myktamap.fr
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
  // v1.14.19 (KARMA « supprime la possibilité d'utiliser l'ancienne
  // interface ») : le flag legacy est désactivé. La nouvelle interface
  // est désormais imposée pour tout le monde. On nettoie aussi le
  // localStorage des anciens users qui auraient le flag legacy actif,
  // pour éviter qu'un cache navigateur ne les laisse coincés sur
  // l'ancienne version morte.
  function _readFlag() {
    try { localStorage.removeItem(LS_LEGACY); } catch(e) {}
    return true;
  }

  // Conservée pour compat des callers existants, mais ne fait plus rien
  // de fonctionnel — la valeur est toujours true.
  function _writeFlag(value) {
    try { localStorage.removeItem(LS_LEGACY); } catch(e) {}
  }

  // Exposer l'état tôt pour que interface.js puisse le lire avant init.
  // _readFlag() retourne toujours true depuis v1.14.19 (refonte imposée,
  // ancienne interface supprimée). Le bloc legacy "early return si OFF" a
  // été retiré au cleanup code mort v1.26.2 (inatteignable).
  window._refonteInterfaceActive = _readFlag();

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
      '<button class="kta-refonte-header-btn kta-refonte-header-home" id="kta-refonte-home" title="' + window.I18n.t("ui.refonte.btn_home_title") + '" aria-label="' + window.I18n.t("ui.refonte.btn_home_aria") + '">' +
        '<img src="icon/compass.svg" alt="" class="kta-refonte-header-home-img" draggable="false">' +
      '</button>' +
      '<div class="kta-refonte-header-title-wrap">' +
        '<button class="kta-refonte-header-title" id="kta-refonte-title-btn" title="' + window.I18n.t("ui.refonte.btn_switch_plan_title") + '">' +
          '<strong id="kta-refonte-plan-name">—</strong>' +
          '<span id="kta-refonte-plan-version"></span>' +
          '<span class="kta-refonte-header-chevron">▾</span>' +
        '</button>' +
      '</div>' +
      '<button class="kta-refonte-header-btn kta-refonte-header-counters" id="kta-refonte-counters-btn" title="' + window.I18n.t("ui.refonte.btn_summary_title") + '" aria-label="' + window.I18n.t("ui.refonte.btn_summary_aria") + '">' +
        // 🆕 v1.11.1 V2 (KARMA "trop d\'icônes sur mobile") : chip résumé
        // unique 📊 visible UNIQUEMENT en mobile portrait. Sur desktop +
        // tablette + mobile landscape, les 5 chips individuels (points,
        // tracés, zones, structures, photos) + 🪫 batterie restent
        // affichés. CSS @media (max-width: 480px) bascule l\'affichage.
        '<span class="kta-refonte-counter kta-refonte-counter-summary" id="kta-refonte-counter-summary" title="' + window.I18n.t("ui.refonte.counter_summary_title") + '">' +
          '<span class="kta-refonte-counter-icon">📊</span><span class="kta-refonte-counter-val" id="kta-refonte-counter-summary-val">·</span>' +
        '</span>' +
        '<span class="kta-refonte-counter" id="kta-refonte-counter-points" title="' + window.I18n.t("ui.refonte.counter_points_title") + '">' +
          '<span class="kta-refonte-counter-icon">📍</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
        '<span class="kta-refonte-counter" id="kta-refonte-counter-roads" title="' + window.I18n.t("ui.refonte.counter_roads_title") + '">' +
          '<span class="kta-refonte-counter-icon">🛣</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
        '<span class="kta-refonte-counter" id="kta-refonte-counter-zones" title="' + window.I18n.t("ui.refonte.counter_zones_title") + '">' +
          '<span class="kta-refonte-counter-icon">⬛</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
        // 🆕 v1.9.3-A1.a : 4e compteur pour les structures (piliers + murs).
        // Si trop chargé visuellement en landscape phone, on pourra masquer
        // ce compteur sur petits écrans via CSS plus tard.
        '<span class="kta-refonte-counter" id="kta-refonte-counter-structures" title="' + window.I18n.t("ui.refonte.counter_structures_title") + '">' +
          '<span class="kta-refonte-counter-icon">🏛️</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
        // 🆕 v1.9.3-B1d+ : 5e compteur pour les photos. Lecture async IDB
        // dans updateCompteurs. Masqué via kta-refonte-counter-empty si 0
        // (cohérent avec les autres compteurs à 0).
        '<span class="kta-refonte-counter" id="kta-refonte-counter-photos" title="' + window.I18n.t("ui.refonte.counter_photos_title") + '">' +
          '<span class="kta-refonte-counter-icon">📸</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
      '</button>' +
      // 🆕 v1.11.1-fix3 (KARMA "l'icône batterie est exclue de la surbrillance
      // de session") : chip batterie SORTI du bouton compteurs pour être un
      // sibling — il n'hérite plus du hover/focus surbrillance du groupe
      // compteurs de session. Masqué par défaut (display:none) jusqu'à ce
      // que BatteryGuard confirme que l'API est dispo (cf 8:a). La couleur
      // dynamique est appliquée via inline style depuis _refreshBatteryUi.
      // 🆕 v1.34.19 (positionné v1.34.21 — à GAUCHE de la batterie selon
      // demande KARMA) — Bouton 📖 Mode Histoire. Click ouvre la modale
      // 2 onglets (📝 Note libre + 📚 PDF embarqué/session). Toujours
      // visible (pas de gating sur API support comme la batterie).
      // Cf js/modeHistoire.js.
      '<span class="kta-refonte-counter kta-refonte-counter-histoire" id="kta-refonte-counter-histoire" title="' + window.I18n.t("ui.refonte.counter_histoire_title") + '" role="button" tabindex="0">' +
        '<span class="kta-refonte-counter-icon">📖</span>' +
      '</span>' +
      // 🆕 v1.39.0 — Bouton 🌍 Vue OSM. Visible UNIQUEMENT si le plan a un
      // georef GPS valide ET que l'user a opt-in dans Configuration home.
      // Cliquer ouvre la modale OSM (plan calibré projeté sur OpenStreetMap).
      // 🎨 v1.39.8 — Emoji change de 🗺️ vers 🌍 pour éviter le conflit visuel
      // avec les boutons Légende (sidebar gauche) et Itinéraire (groupe Iti)
      // qui utilisent déjà 🗺️. Le globe 🌍 colle bien à OSM (surface monde).
      '<span class="kta-refonte-counter kta-refonte-counter-osm" id="kta-refonte-counter-osm" title="' + window.I18n.t("ui.refonte.counter_osm_title") + '" role="button" tabindex="0" style="display:none;">' +
        '<span class="kta-refonte-counter-icon">🌍</span>' +
      '</span>' +
      // 🆕 v1.35.0 — Bouton 🚨 Mode Sortie d\'urgence. Click ouvre la modale
      // qui identifie la sortie la plus proche (pathfinder + tags
      // Puits/Escalier/Cavage ouvert ou tag "entrée"). Cf js/sortieUrgence.js.
      '<span class="kta-refonte-counter kta-refonte-counter-sortie" id="kta-refonte-counter-sortie" title="' + window.I18n.t("ui.refonte.counter_sortie_title") + '" role="button" tabindex="0">' +
        '<span class="kta-refonte-counter-icon">🚨</span>' +
      '</span>' +
      '<span class="kta-refonte-counter kta-refonte-counter-battery kta-refonte-header-battery" id="kta-refonte-counter-battery" title="' + window.I18n.t("ui.refonte.counter_battery_title") + '" style="display:none;">' +
        '<span class="kta-refonte-counter-icon" id="kta-refonte-battery-emoji">🔋</span><span class="kta-refonte-counter-val" id="kta-refonte-battery-val">—</span>' +
      '</span>';

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

    // 🆕 v1.34.19 — Bouton 📖 Mode Histoire : click ouvre la modale.
    // Support clavier (Enter/Space) pour accessibilité car le span a
    // role="button" tabindex="0".
    const histoireBtn = document.getElementById("kta-refonte-counter-histoire");
    if (histoireBtn) {
      function _openHistoire() {
        if (window.ModeHistoire && typeof window.ModeHistoire.open === "function") {
          window.ModeHistoire.open();
        } else {
          console.warn("[Refonte] ModeHistoire indisponible");
        }
      }
      histoireBtn.addEventListener("click", _openHistoire);
      histoireBtn.addEventListener("keydown", function(e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          _openHistoire();
        }
      });
    }

    // 🆕 v1.39.0 — Bouton 🗺️ Vue OSM : visible UNIQUEMENT si plan georef
    // ET user opt-in dans Configuration home. Click ouvre la modale (carte
    // EPSG:3857 + tile OSM + plan projeté). Cf js/osmView.js.
    // 🐛 v1.39.0-fix1 (KARMA "pas icone en haut") : remplace les 2 setTimeout
    // ponctuels par un polling permanent 2s (le check isAvailable est très
    // léger ~0.3ms). Cause racine : `kta:planConfigReady` que j'écoutais
    // n'est PAS dispatché par MyKTAMap (event fantôme). Sur mobile / gros
    // plan, le chargement peut prendre > 3s → mes timeouts ratent. Polling
    // permanent catch aussi le switch de plan + toggle opt-in sans event.
    const osmBtn = document.getElementById("kta-refonte-counter-osm");
    if (osmBtn) {
      function _refreshOsmVisibility() {
        const show = !!(window.OsmView && window.OsmView.isAvailable && window.OsmView.isAvailable());
        osmBtn.style.display = show ? "" : "none";
      }
      function _openOsm() {
        if (window.OsmView && typeof window.OsmView.open === "function") {
          window.OsmView.open();
        } else {
          console.warn("[Refonte] OsmView indisponible");
        }
      }
      osmBtn.addEventListener("click", _openOsm);
      osmBtn.addEventListener("keydown", function(e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          _openOsm();
        }
      });
      // Init + listeners + polling permanent (2s) qui catch tout
      _refreshOsmVisibility();
      window.addEventListener("kta:osmOptInChange", _refreshOsmVisibility);
      setInterval(_refreshOsmVisibility, 2000);
    }

    // 🆕 v1.35.0 — Bouton 🚨 Sortie d'urgence : click déclenche la recherche
    // de la sortie la plus proche via pathfinder.
    const sortieBtn = document.getElementById("kta-refonte-counter-sortie");
    if (sortieBtn) {
      function _openSortie() {
        if (window.SortieUrgence && typeof window.SortieUrgence.declencher === "function") {
          window.SortieUrgence.declencher();
        } else {
          console.warn("[Refonte] SortieUrgence indisponible");
        }
      }
      sortieBtn.addEventListener("click", _openSortie);
      sortieBtn.addEventListener("keydown", function(e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          _openSortie();
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

    // 🆕 v1.9.3-B1d-fix5 : resize/orientationchange listeners pour le
    // debordement du titre. Sans ça, l'user qui rotate ou resize la
    // fenêtre verrait la version stale (cachée alors qu'il y a la place,
    // ou visible alors qu'elle déborde) jusqu'au prochain polling 2s.
    let _resizeDeb = null;
    window.addEventListener("resize", function() {
      // Debounce 80ms — sinon dispatch ×30/s pendant un drag-resize PC
      clearTimeout(_resizeDeb);
      _resizeDeb = setTimeout(_ajusterDebordementTitre, 80);
    });
    window.addEventListener("orientationchange", function() {
      // 350ms après orientationchange : laisser iOS finir sa transition viewport
      setTimeout(_ajusterDebordementTitre, 350);
    });
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
      nameEl.textContent = pc.plan.name || window.I18n.t("ui.refonte.label_plan_default");
    }
    if (verEl && pc && pc.plan && pc.plan.version) {
      verEl.textContent = pc.plan.version;
    }

    // Compteurs : points session + roads + zones + structures (les data
    // layers ne comptent pas — ce sont les annotations user qui nous
    // intéressent).
    const nPoints     = (window.getEditorPoints && window.getEditorPoints() || []).length;
    const nRoads      = (window.getRoads        && window.getRoads()        || []).length;
    const nZones      = (window.getZones        && window.getZones()        || []).length;
    // 🆕 v1.9.3-A1.a
    const nStructures = (window.getStructures   && window.getStructures()   || []).length;

    _setCounterVal("kta-refonte-counter-points",     nPoints);
    _setCounterVal("kta-refonte-counter-roads",      nRoads);
    _setCounterVal("kta-refonte-counter-zones",      nZones);
    _setCounterVal("kta-refonte-counter-structures", nStructures);

    // 🆕 v1.11.1 (KARMA mobile compact) : chip résumé unique 📊 visible
    // en mobile portrait. Valeur = somme totale des éléments de session
    // (sans photos pour ne pas alourdir le calcul async — l'icône fait
    // déjà comprendre "regroupé"). Si total = 0 → on affiche "·"
    // (point médian) plutôt que "0" pour indiquer "rien à voir" sans
    // chiffre trompeur.
    const _totalSession = nPoints + nRoads + nZones + nStructures;
    const _summaryEl = document.getElementById("kta-refonte-counter-summary-val");
    if (_summaryEl) {
      _summaryEl.textContent = _totalSession > 0 ? String(_totalSession) : "·";
    }

    // 🆕 v1.9.3-B1d+ : compteur photos (async IDB). Lecture rapide via
    // index `by_plan`. Pas de await dans le sync updateCompteurs : on lance
    // et on swap quand prêt. Si MyKTAMapPhotos indispo → reste à 0.
    if (window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.countPhotosForPlan === "function") {
      const planId = window._currentLoadedPlanId || "default";
      window.MyKTAMapPhotos.countPhotosForPlan(planId).then(function(n) {
        _setCounterVal("kta-refonte-counter-photos", n || 0);
      }).catch(function() {
        _setCounterVal("kta-refonte-counter-photos", 0);
      });
    } else {
      _setCounterVal("kta-refonte-counter-photos", 0);
    }

    // 🆕 v1.9.3-B1d-fix5 : ajuste le débordement du titre après que le
    // nom/version aient été posés. Utilise rAF pour laisser le browser
    // peindre avant la mesure, sinon scrollWidth/clientWidth peuvent
    // retourner des valeurs stale (= du frame précédent).
    requestAnimationFrame(_ajusterDebordementTitre);
  }

  // 🆕 v1.9.3-B1d-fix5 : graceful degradation 2 niveaux quand le titre
  // déborde sur les compteurs. Étapes :
  //   1. Reset : on AFFICHE d'abord la version (cas user resize +
  //      → larger : on veut retrouver la version).
  //   2. Mesure : si titleEl.scrollWidth > clientWidth → on cache la
  //      version (display:none, pas visibility:hidden — elle ne doit
  //      pas occuper d'espace).
  //   3. Si toujours trop large après hide version → le CSS
  //      text-overflow:ellipsis sur #kta-refonte-plan-name s'occupe
  //      naturellement de tronquer le nom (couleur héritée #f4c542 →
  //      "..." dans la couleur du titre comme demandé par KARMA).
  function _ajusterDebordementTitre() {
    const titleEl   = document.querySelector(".kta-refonte-header-title");
    const versionEl = document.getElementById("kta-refonte-plan-version");
    if (!titleEl || !versionEl) return;

    // Étape 1 : reset (réafficher la version pour mesurer le besoin réel)
    versionEl.style.display = "";

    // Mesure brute. +1 de tolérance pour les arrondis sub-pixel des navigateurs.
    if (titleEl.scrollWidth > titleEl.clientWidth + 1) {
      // Étape 2 : on cache la version
      versionEl.style.display = "none";
      // Étape 3 implicite : le CSS ellipsis sur le span name tronque
      // automatiquement le nom si scrollWidth reste > clientWidth. Pas
      // d'action JS à prendre — le browser gère.
    }
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
        '<span class="kta-refonte-stat kta-refonte-stat-empty kta-refonte-stat-clickable" id="kta-refonte-stat-iti" title="' + window.I18n.t("ui.refonte.stat_iti_title") + '">' +
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
        // 🆕 v1.49.0 — Compte-à-rebours « verrou sur tracé suspendu » (à côté du
        // ON/OFF tracker, feedback KARMA). Caché par défaut ; piloté par
        // interface.js (_afficherBadgeVerrou/_majBadgeVerrou/_reactiverVerrou).
        // Cliquable → réactive le verrou immédiatement.
        '<span class="kta-refonte-stat kta-refonte-stat-clickable" id="kta-refonte-stat-verrou" style="display:none; color:#f4c542;" title="' + window.I18n.t("tracker.verrou.statTitle") + '">' +
          '<span class="kta-refonte-stat-icon">🔓</span><span class="kta-refonte-stat-val">—</span>' +
        '</span>' +
        // 🚫 v1.12.0-fix (KARMA "la batterie est affichée en bas et en top,
        // on l'affiche que en haut") : retiré du footer. La chip batterie
        // du header (kta-refonte-counter-battery, à côté des compteurs session)
        // reste l'unique point d'affichage permanent. Le mode urgence 🚨 a
        // aussi son propre bloc 🔋 ÉTAT (XL) — c'est intentionnel et OK
        // (contexte panique = on veut le voir en grand). Pas de redondance
        // dans la barre status.
      '</div>' +
      '<button class="kta-refonte-statusbar-toggle" id="kta-refonte-statusbar-toggle" title="' + window.I18n.t("ui.refonte.statusbar_toggle_title") + '" aria-label="' + window.I18n.t("ui.refonte.statusbar_toggle_aria") + '">▾</button>';

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

  // 🔧 v1.9.3-B1d-fix3 (KARMA "cant find variable _syncH ligne 429") :
  // Avant, `_syncH` était une fonction LOCALE à _setupStatusBarResizeObserver().
  // Elle n'était donc pas visible depuis _onOrientationChange() (function
  // statement au scope du module). Quand l'event orientationchange se
  // déclenchait, ReferenceError → status bar pas remise à jour après rotation.
  //
  // Solution : promouvoir _syncH au scope du module. _statusBarEl est déjà
  // au scope module, donc pas de capture de closure à gérer.
  //
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

  function _setupStatusBarResizeObserver() {
    if (!_statusBarEl || _statusBarRO) return;

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
      toggleBtn.title = _statusBarOpen ? window.I18n.t("ui.refonte.statusbar_collapse") : window.I18n.t("ui.refonte.statusbar_expand");
    }
  }

  // Refresh des valeurs live (mesure, distance totale, itinéraire, tracker)
  function refreshStatusBar() {
    if (!_statusBarEl) return;

    // ── 📐 Mesure (distance et/ou surface) ──
    // 🆕 v1.12.0-fix (KARMA "en footer, on peux afficher a la fois, une
    // mesure de surface, et une comme avant de distance") : les 2 mesures
    // coexistent maintenant. Le footer a une icône statique 📐 + un val.
    //
    // 🔧 v1.12.0-fix2 (KARMA "petit bug en footer on a deux équaire") : on
    // pilote l'icône statique pour ne pas avoir un doublon 📐 dans le val.
    //   - Distance seule → icône 📐, val = "143 m"
    //   - Surface seule  → icône ⬛, val = "4433 m²"
    //   - Les 2 ensemble → icône 📐, val = "143 m · ⬛ 4433 m²"
    //     (le ⬛ inline disambigue la surface, le 📐 statique = distance)
    const mesurePointsD = (window.getMeasurePoints        && window.getMeasurePoints())        || [];
    const mesurePointsS = (window.getMeasurePointsSurface && window.getMeasurePointsSurface()) || [];

    function _fmtSurfaceVal(pts) {
      if (pts.length < 3 || typeof window.polygonAreaM2 !== "function") return null;
      const m2 = window.polygonAreaM2(pts) || 0;
      return (typeof window.formatSurface === "function")
        ? window.formatSurface(m2, 1)
        : (m2 < 10000 ? Math.round(m2) + " m²" : (m2 / 10000).toFixed(2) + " ha");
    }
    function _fmtDistanceVal(pts) {
      if (pts.length < 2) return null;
      const distM = _calculerDistanceMesure(pts);
      return _formatDist(distM);
    }

    const valD = _fmtDistanceVal(mesurePointsD);
    const valS = _fmtSurfaceVal(mesurePointsS);
    const mesureEl = document.getElementById("kta-refonte-stat-mesure");
    const mesureIconEl = mesureEl ? mesureEl.querySelector(".kta-refonte-stat-icon") : null;
    if (valD && valS) {
      if (mesureIconEl) mesureIconEl.textContent = "📐";
      _setStat("kta-refonte-stat-mesure", valD + " · ⬛ " + valS);
    } else if (valS) {
      if (mesureIconEl) mesureIconEl.textContent = "⬛";
      _setStat("kta-refonte-stat-mesure", valS);
    } else if (valD) {
      if (mesureIconEl) mesureIconEl.textContent = "📐";
      _setStat("kta-refonte-stat-mesure", valD);
    } else {
      if (mesureIconEl) mesureIconEl.textContent = "📐";  // reset défaut quand vide
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
        ? window.I18n.t("ui.refonte.tracker_on_title")
        : window.I18n.t("ui.refonte.tracker_off_title");
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

  // ============================================================
  // 🆕 v1.11.1 V2 — UI BATTERIE (KARMA 2:d)
  // ============================================================
  // Appliqué à chaque event Battery API (level / charging change) +
  // un appel initial via forceCheck() au boot des panneaux.
  // Si l'API n'est pas dispo (Safari iOS) → les 2 éléments restent
  // masqués (display:none de leur HTML inline).
  function _refreshBatteryUi(state) {
    // 🆕 v1.11.1-fix3 (KARMA "enleve le fait de voir l'icône batterie si
    // l'API pas dispo, cas iOS") : retour au choix 8:a original (cacher
    // complètement). L'option B fallback `?` grisé a servi pour le debug
    // initial mais n'a pas d'intérêt en prod — sur Safari iOS / Firefox
    // l'user n'a rien à faire de ce chip.
    if (!state || state.available === false) {
      const chip = document.getElementById("kta-refonte-counter-battery");
      const stat = document.getElementById("kta-refonte-stat-battery");
      if (chip) chip.style.display = "none";
      if (stat) stat.style.display = "none";
      return;
    }

    const isUnavailable = false;  // arrivée ici = état dispo
    const titleText = isUnavailable
      ? window.I18n.t("ui.refonte.battery_unavailable_title")
      : window.I18n.t("ui.refonte.battery_title", { label: state.label }) +
        (state.charging ? window.I18n.t("ui.refonte.battery_charging_suffix") : "");

    // Header chip (à droite du compteur 📸)
    const chip = document.getElementById("kta-refonte-counter-battery");
    if (chip) {
      // 🔧 v1.11.1-fix2 : removeProperty + explicit "flex" pour bypass
      // l'inline style="display:none;" initial du HTML. style.display = ""
      // ne suffisait pas dans tous les browsers (race avec inline style).
      chip.style.removeProperty("display");
      chip.style.display = "flex";
      chip.classList.toggle("kta-refonte-counter-battery-unavailable", isUnavailable);
      const emojiEl = document.getElementById("kta-refonte-battery-emoji");
      const valEl   = document.getElementById("kta-refonte-battery-val");
      if (emojiEl) emojiEl.textContent = state.emoji;
      if (valEl)   valEl.textContent   = state.label;
      chip.style.color = state.color;
      chip.title = titleText;
    }
    // Status bar stat
    const stat = document.getElementById("kta-refonte-stat-battery");
    if (stat) {
      stat.style.removeProperty("display");
      stat.style.display = "flex";
      stat.classList.toggle("kta-refonte-stat-battery-unavailable", isUnavailable);
      const valEl  = document.getElementById("kta-refonte-stat-battery-val");
      const iconEl = document.getElementById("kta-refonte-stat-battery-icon");
      if (iconEl) iconEl.textContent = state.emoji;
      if (valEl)  valEl.textContent  = state.label;
      stat.style.color = state.color;
      stat.classList.remove("kta-refonte-stat-empty");
      stat.title = titleText;
    }
  }

  // Hook BatteryGuard onChange — posé une seule fois au boot UI refonte.
  // Garde idempotent via flag _batteryHooked pour éviter le double-binding
  // si _creerStatusBar/HeaderBar est re-appelée (cas rare au plan switch).
  let _batteryHooked = false;
  function _setupBatteryHook() {
    if (_batteryHooked) return;
    if (!window.BatteryGuard || typeof window.BatteryGuard.onChange !== "function") {
      // Retry défensif (rare : peut arriver si scripts chargés hors ordre)
      setTimeout(_setupBatteryHook, 500);
      return;
    }
    _batteryHooked = true;
    window.BatteryGuard.onChange(_refreshBatteryUi);
    // 🔧 v1.11.1-fix2 (KARMA "forceCheck manuel marche mais pas auto") :
    // 3 tentatives de sync initial pour bypass les races potentielles
    // entre l'init async de BatteryGuard et le moment où on accroche le
    // listener. À chaque tick, on appelle DIRECTEMENT _refreshBatteryUi
    // avec le state actuel via _peek() (pas via forceCheck → notify, qui
    // pourrait avoir un edge case si _listeners est inspecté à la mauvaise
    // microtask).
    try { window.BatteryGuard.forceCheck(); } catch (e) {}
    function _syncDirect() {
      try {
        const peek = window.BatteryGuard._peek && window.BatteryGuard._peek();
        if (peek && peek.state) _refreshBatteryUi(peek.state);
      } catch(e) {}
    }
    _syncDirect();              // immédiat
    setTimeout(_syncDirect, 100);  // après microtasks
    setTimeout(_syncDirect, 500);  // après la promise getBattery typique
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
  // 🆕 v1.11.2 V2.2 : bloc "📊 Stats agrégées" en TÊTE de la modale avec
  // résumé chiffré + barres CSS + boutons Copier/Exporter TXT.
  //
  // Pattern .kta-readme-modal-overlay pour cohérence charte projet.

  // ─── 🆕 v1.20.0-fix1+ : helper LegendCustomization pour respecter la cascade
  // session > plan > default partout dans la modale Détails session + bloc
  // stats agrégées. Si l'user renomme "Eau" → "Lac d'eau" via LC, la modale
  // doit l'afficher (avant ce helper, labels hardcoded → rename invisible).
  // Gère aussi les entrées custom (cust-XYZ) ajoutées par l'user : préfixées
  // par ✨ pour bien les distinguer des built-ins.
  // category : "icones" | "traces" | "zones" | "structures"
  // type     : "eau" | "principal" | "pilier-1" | "cust-mYzZ123" | etc.
  // fallback : label hardcoded de secours si LC absent OU type inconnu
  function _lcLabel(category, type, fallback) {
    if (typeof type !== "string" || !type) return fallback || "?";
    // Entrée custom (cust-XYZ) : préfixe ✨ pour la distinguer visuellement
    if (type.indexOf("cust-") === 0) {
      if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
        try {
          const e = window.LegendCustomization.findCustomEntry(type);
          if (e && e.label) return "✨ " + e.label;
        } catch(err) {}
      }
      return fallback || type;
    }
    // Built-in : cascade session > plan > default
    if (window.LegendCustomization && typeof window.LegendCustomization.getLabel === "function") {
      try {
        const lbl = window.LegendCustomization.getLabel(category, type);
        if (lbl) return lbl;
      } catch(err) {}
    }
    return fallback || type;
  }

  // ─── Helpers stats agrégées (v1.11.2 V2.2) ───
  function _calculerStatsAggregees(points, roads, zones, structures, mesure, scale) {
    const stats = {
      points: { total: points.length, byTag: {} },
      roads:  { total: 0, distM: 0, byType: {} },
      zones:  { total: zones.length, areaM2: 0, byType: {} },
      structures: { total: structures.length, byType: {}, fronts_totalM: 0 },
      photos: { total: 0, sizeMo: 0 },   // hydraté async
      tracker:    { active: false, distM: 0 },
      // 🔧 v1.12.0-fix : mesure = { distance (polyline), surface (polygone) }
      mesure:     { distance: { points: 0, distM: 0 }, surface: { points: 0, areaM2: 0 } },
      session:    { durationMs: 0 },
      // 🏗️ Multi-niveau breakdown (rempli plus bas si MLVL)
      byLevel: null
    };

    // Durée de session (depuis window._sessionStartTs set dans main.js > lancerApplication)
    if (typeof window._sessionStartTs === "number") {
      stats.session.durationMs = Date.now() - window._sessionStartTs;
    }

    // Points par tag (1er tag = catégorie principale)
    points.forEach(function(p) {
      const tag = (Array.isArray(p.tags) && p.tags.length > 0) ? p.tags[0] : "(sans tag)";
      stats.points.byTag[tag] = (stats.points.byTag[tag] || 0) + 1;
    });

    // Roads : distance + breakdown par type (skip "itinerary" — c'est un calcul Pathfinder)
    function _distRoadLocal(road) {
      if (!road || !Array.isArray(road.points) || road.points.length < 2) return 0;
      let t = 0;
      for (let i = 1; i < road.points.length; i++) {
        const dx = road.points[i].x - road.points[i-1].x;
        const dy = road.points[i].y - road.points[i-1].y;
        t += Math.sqrt(dx*dx + dy*dy);
      }
      return t / scale;
    }
    roads.forEach(function(r) {
      if (r.type === "itinerary") return;
      const d = _distRoadLocal(r);
      stats.roads.total += 1;
      stats.roads.distM += d;
      const t = r.type || "?";
      if (!stats.roads.byType[t]) stats.roads.byType[t] = { nb: 0, distM: 0 };
      stats.roads.byType[t].nb += 1;
      stats.roads.byType[t].distM += d;
    });

    // Zones : surface (shoelace) + breakdown par type
    zones.forEach(function(z) {
      const aM2 = (typeof window.polygonAreaM2 === "function")
        ? (window.polygonAreaM2(z.points) || 0)
        : 0;
      stats.zones.areaM2 += aM2;
      const t = z.type || "?";
      if (!stats.zones.byType[t]) stats.zones.byType[t] = { nb: 0, areaM2: 0 };
      stats.zones.byType[t].nb += 1;
      stats.zones.byType[t].areaM2 += aM2;
    });

    // Structures : piliers (polygones) + mur + fronts (polylines = longueur)
    structures.forEach(function(s) {
      const t = s.type || "?";
      if (!stats.structures.byType[t]) stats.structures.byType[t] = { nb: 0, areaM2: 0, longM: 0 };
      stats.structures.byType[t].nb += 1;
      // Polygon ? → aire. Polyline (front-1/2) ? → longueur.
      if (t === "front-1" || t === "front-2") {
        const d = _distRoadLocal(s);  // shape-similar : array .points
        stats.structures.byType[t].longM += d;
        stats.structures.fronts_totalM += d;
      } else {
        const aM2 = (typeof window.polygonAreaM2 === "function")
          ? (window.polygonAreaM2(s.points) || 0)
          : 0;
        stats.structures.byType[t].areaM2 += aM2;
      }
    });

    // 🔧 v1.12.0-fix : 2 mesures indépendantes (distance + surface).
    // L'ancien paramètre `mesure` = polyline distance (rétrocompat),
    // on lit en plus window.getMeasurePointsSurface() pour le polygone.
    if (mesure.length >= 2) {
      let m = 0;
      for (let i = 1; i < mesure.length; i++) {
        const dx = mesure[i].x - mesure[i-1].x;
        const dy = mesure[i].y - mesure[i-1].y;
        m += Math.sqrt(dx*dx + dy*dy);
      }
      stats.mesure.distance.points = mesure.length;
      stats.mesure.distance.distM  = m / scale;
    }
    const mesureSurf = (window.getMeasurePointsSurface && window.getMeasurePointsSurface()) || [];
    if (mesureSurf.length >= 3) {
      stats.mesure.surface.points = mesureSurf.length;
      stats.mesure.surface.areaM2 = (typeof window.polygonAreaM2 === "function")
        ? (window.polygonAreaM2(mesureSurf) || 0)
        : 0;
    }

    // Tracker : position + distance parcourue (si dispo via getTrackingPath)
    if (window.getTrackingPosition && window.getTrackingPosition()) {
      stats.tracker.active = true;
      if (typeof window.getTrackingPath === "function") {
        const path = window.getTrackingPath() || [];
        if (path.length >= 2) {
          let t = 0;
          for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i-1].x;
            const dy = path[i].y - path[i-1].y;
            t += Math.sqrt(dx*dx + dy*dy);
          }
          stats.tracker.distM = t / scale;
        }
      }
    }

    // 🏗️ Multi-niveau breakdown (si MLVL actif)
    if (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true) {
      const byLevel = {};
      function _ensure(lvl) {
        if (!byLevel[lvl]) byLevel[lvl] = { points: 0, roads: 0, zones: 0, structures: 0 };
        return byLevel[lvl];
      }
      points.forEach(function(p) { _ensure(p.level || 0).points += 1; });
      roads.forEach(function(r) {
        if (r.type === "itinerary") return;
        if (r.type === "jonction") {
          _ensure(r.fromLevel || 0).roads += 1;
          if ((r.toLevel || 0) !== (r.fromLevel || 0)) _ensure(r.toLevel || 0).roads += 1;
        } else {
          _ensure(r.level || 0).roads += 1;
        }
      });
      zones.forEach(function(z) { _ensure(z.level || 0).zones += 1; });
      structures.forEach(function(s) { _ensure(s.level || 0).structures += 1; });
      stats.byLevel = byLevel;
    }

    return stats;
  }

  // Helper : formate une durée en ms vers "Xh Ym" ou "Xm Ys"
  function _formatDurationStats(ms) {
    if (typeof ms !== "number" || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    if (m < 60) return m + " min" + (s % 60 > 0 ? " " + (s % 60) + "s" : "");
    const h = Math.floor(m / 60);
    return h + "h" + (m % 60 > 0 ? " " + (m % 60) + "min" : "");
  }

  // Format raccourci de distance / surface (avec fallback si helpers absents)
  function _fdistStats(distM) {
    if (typeof window.formatDistance === "function") return window.formatDistance(distM, 1);
    if (distM >= 1000) return (distM / 1000).toFixed(2) + " km";
    return distM.toFixed(1) + " m";
  }
  function _fsurfStats(areaM2) {
    if (typeof window.formatSurface === "function") return window.formatSurface(areaM2, 1);
    if (areaM2 >= 10000) return (areaM2 / 10000).toFixed(2) + " ha";
    return Math.round(areaM2) + " m²";
  }

  // Génère le HTML du bloc "📊 Stats agrégées" — placé en TÊTE de la modale
  function _genererStatsAggregeesHTML(stats, multiLevel) {
    let h = '<div class="kta-refonte-stats-aggr">';
    h += '<div class="kta-refonte-stats-aggr-titre">📊 ' + window.I18n.t("ui.refonte.stats_aggr_titre") + '</div>';

    // Durée
    h += '<div class="kta-refonte-stats-row">';
    h += '<span class="kta-refonte-stats-label">⏱️ ' + window.I18n.t("ui.refonte.stats_duration") + '</span>';
    h += '<span class="kta-refonte-stats-val">' + _formatDurationStats(stats.session.durationMs) + '</span>';
    h += '</div>';

    // 🛣 Tracés total + breakdown
    if (stats.roads.total > 0) {
      h += '<div class="kta-refonte-stats-row">';
      h += '<span class="kta-refonte-stats-label">🛣 ' + window.I18n.t("ui.refonte.section_roads") + '</span>';
      h += '<span class="kta-refonte-stats-val"><strong>' + _fdistStats(stats.roads.distM) + '</strong> ' + window.I18n.t("ui.refonte.stats_on_n_roads", { n: stats.roads.total }) + '</span>';
      h += '</div>';
      // Barres par type
      const totalRoadDist = stats.roads.distM || 1;
      const ROAD_COLORS = { principal: "#00ff00", secondaire: "#b000ff", chemin: "#ffff00", jonction: "#ff4ecb" };
      const ROAD_LABELS = {
        principal:  window.I18n.t("ui.refonte.label_road_principal"),
        secondaire: window.I18n.t("ui.refonte.label_road_secondaire"),
        chemin:     window.I18n.t("ui.refonte.label_road_chemin"),
        jonction:   window.I18n.t("ui.refonte.label_road_jonction")
      };
      Object.keys(stats.roads.byType).forEach(function(t) {
        const s = stats.roads.byType[t];
        const pct = (s.distM / totalRoadDist) * 100;
        h += '<div class="kta-refonte-stats-bar-row">';
        h += '<span class="kta-refonte-stats-bar-label">' + _lcLabel("traces", t, ROAD_LABELS[t]) + '</span>';
        h += '<div class="kta-refonte-stats-bar"><div class="kta-refonte-stats-bar-fill" style="width:' + pct.toFixed(1) + '%; background:' + (ROAD_COLORS[t] || "#888") + ';"></div></div>';
        h += '<span class="kta-refonte-stats-bar-val">' + _fdistStats(s.distM) + '</span>';
        h += '</div>';
      });
    }

    // ⬛ Zones total + breakdown
    if (stats.zones.total > 0) {
      h += '<div class="kta-refonte-stats-row" style="margin-top:8px;">';
      h += '<span class="kta-refonte-stats-label">⬛ ' + window.I18n.t("ui.refonte.section_zones") + '</span>';
      h += '<span class="kta-refonte-stats-val"><strong>' + _fsurfStats(stats.zones.areaM2) + '</strong> ' + window.I18n.t("ui.refonte.stats_on_n_zones", { n: stats.zones.total }) + '</span>';
      h += '</div>';
      const totalArea = stats.zones.areaM2 || 1;
      const ZONE_COLORS = { eau: "#3aa9e8", remblais: "#5a5a68", effondrement: "#ff3333", inaccessible: "#7a0000" };
      const ZONE_LABELS = {
        eau:          window.I18n.t("ui.refonte.label_zone_eau"),
        remblais:     window.I18n.t("ui.refonte.label_zone_remblais"),
        effondrement: window.I18n.t("ui.refonte.label_zone_effondrement"),
        inaccessible: window.I18n.t("ui.refonte.label_zone_inaccessible")
      };
      Object.keys(stats.zones.byType).forEach(function(t) {
        const z = stats.zones.byType[t];
        const pct = (z.areaM2 / totalArea) * 100;
        h += '<div class="kta-refonte-stats-bar-row">';
        h += '<span class="kta-refonte-stats-bar-label">' + _lcLabel("zones", t, ZONE_LABELS[t]) + '</span>';
        h += '<div class="kta-refonte-stats-bar"><div class="kta-refonte-stats-bar-fill" style="width:' + pct.toFixed(1) + '%; background:' + (ZONE_COLORS[t] || "#888") + ';"></div></div>';
        h += '<span class="kta-refonte-stats-bar-val">' + _fsurfStats(z.areaM2) + '</span>';
        h += '</div>';
      });
    }

    // 🏛️ Structures
    if (stats.structures.total > 0) {
      h += '<div class="kta-refonte-stats-row" style="margin-top:8px;">';
      h += '<span class="kta-refonte-stats-label">🏛️ ' + window.I18n.t("ui.refonte.section_structures") + '</span>';
      const fronts = stats.structures.fronts_totalM;
      const txt = window.I18n.t("ui.refonte.stats_n_structures", { n: stats.structures.total }) +
                  (fronts > 0 ? window.I18n.t("ui.refonte.stats_fronts_suffix", { dist: _fdistStats(fronts) }) : '');
      h += '<span class="kta-refonte-stats-val">' + txt + '</span>';
      h += '</div>';
      const STRUCT_LABELS = {
        "pilier-1": window.I18n.t("ui.refonte.label_struct_pilier1_short") + " 🟡",
        "pilier-2": window.I18n.t("ui.refonte.label_struct_pilier2_short") + " 🟠",
        "mur":      window.I18n.t("ui.refonte.label_struct_mur") + " 🔵",
        "front-1":  window.I18n.t("ui.refonte.label_struct_front1_short") + " 🟨",
        "front-2":  window.I18n.t("ui.refonte.label_struct_front2_short") + " 🟧"
      };
      Object.keys(stats.structures.byType).forEach(function(t) {
        const s = stats.structures.byType[t];
        const detail = (t === "front-1" || t === "front-2")
          ? _fdistStats(s.longM)
          : (s.areaM2 > 0 ? _fsurfStats(s.areaM2) : s.nb + ' u.');
        h += '<div class="kta-refonte-stats-bar-row">';
        h += '<span class="kta-refonte-stats-bar-label">' + _lcLabel("structures", t, STRUCT_LABELS[t]) + '</span>';
        h += '<span class="kta-refonte-stats-bar-val" style="margin-left:auto;"><strong>' + s.nb + '</strong> · ' + detail + '</span>';
        h += '</div>';
      });
    }

    // 📸 Photos (placeholder — hydraté async dans _afficherModaleSessionDetail)
    h += '<div class="kta-refonte-stats-row" id="kta-stats-photos-row" style="margin-top:8px; display:none;">';
    h += '<span class="kta-refonte-stats-label">📸 ' + window.I18n.t("ui.refonte.section_photos") + '</span>';
    h += '<span class="kta-refonte-stats-val" id="kta-stats-photos-val">…</span>';
    h += '</div>';

    // 🚶 Tracker
    if (stats.tracker.active) {
      h += '<div class="kta-refonte-stats-row" style="margin-top:8px;">';
      h += '<span class="kta-refonte-stats-label">🚶 ' + window.I18n.t("ui.refonte.section_tracker") + '</span>';
      h += '<span class="kta-refonte-stats-val">' + window.I18n.t("ui.refonte.stats_tracker_active", { dist: _fdistStats(stats.tracker.distM) }) + '</span>';
      h += '</div>';
    }

    // 📐 Mesure de distance (polyline)
    if (stats.mesure.distance.points >= 2) {
      h += '<div class="kta-refonte-stats-row">';
      h += '<span class="kta-refonte-stats-label">📐 ' + window.I18n.t("ui.refonte.stats_mesure_distance") + '</span>';
      h += '<span class="kta-refonte-stats-val">' + _fdistStats(stats.mesure.distance.distM) + ' (' + window.I18n.t("ui.refonte.stats_n_pts", { n: stats.mesure.distance.points }) + ')</span>';
      h += '</div>';
    }
    // ⬛ Mesure de surface (polygone) — 🆕 v1.12.0-fix : 2 mesures coexistantes
    if (stats.mesure.surface.points >= 3) {
      const surfTxt = (typeof window.formatSurface === "function")
        ? window.formatSurface(stats.mesure.surface.areaM2, 1)
        : (stats.mesure.surface.areaM2.toFixed(1) + " m²");
      h += '<div class="kta-refonte-stats-row">';
      h += '<span class="kta-refonte-stats-label">⬛ ' + window.I18n.t("ui.refonte.stats_mesure_surface") + '</span>';
      h += '<span class="kta-refonte-stats-val">' + surfTxt + ' (' + window.I18n.t("ui.refonte.stats_n_pts", { n: stats.mesure.surface.points }) + ')</span>';
      h += '</div>';
    }

    // 🏗️ Multi-niveau breakdown
    if (multiLevel && stats.byLevel) {
      h += '<div class="kta-refonte-stats-mlvl">';
      h += '<div class="kta-refonte-stats-mlvl-titre">🏗️ ' + window.I18n.t("ui.refonte.stats_mlvl_titre") + '</div>';
      const levels = Object.keys(stats.byLevel).map(Number).sort(function(a, b) { return a - b; });
      levels.forEach(function(lvl) {
        const b = stats.byLevel[lvl];
        const sum = b.points + b.roads + b.zones + b.structures;
        if (sum === 0) return;
        h += '<div class="kta-refonte-stats-mlvl-row">';
        h += '<span class="kta-refonte-stats-mlvl-lbl">' + window.I18n.t("ui.refonte.label_level_short", { n: lvl }) + '</span>';
        h += '<span class="kta-refonte-stats-mlvl-val">' +
          (b.points     > 0 ? '📍' + b.points + ' ' : '') +
          (b.roads      > 0 ? '🛣' + b.roads + ' ' : '') +
          (b.zones      > 0 ? '⬛' + b.zones + ' ' : '') +
          (b.structures > 0 ? '🏛️' + b.structures : '') +
        '</span>';
        h += '</div>';
      });
      h += '</div>';
    }

    // Boutons Copier + Exporter
    h += '<div class="kta-refonte-stats-actions">';
    h += '<button class="kta-btn kta-btn-ghost" id="kta-stats-copier" type="button">📋 ' + window.I18n.t("ui.refonte.btn_copy") + '</button>';
    h += '<button class="kta-btn kta-btn-ghost" id="kta-stats-exporter" type="button">📤 ' + window.I18n.t("ui.refonte.btn_export_txt") + '</button>';
    h += '</div>';

    h += '</div>';  // .kta-refonte-stats-aggr
    return h;
  }

  // Génère un résumé TXT/MD copiable (boutons Copier + Exporter)
  function _genererStatsAggregeesTXT(stats, planName, multiLevel) {
    const lines = [];
    lines.push("# 📊 " + window.I18n.t("ui.refonte.export_titre"));
    if (planName) lines.push(window.I18n.t("ui.refonte.export_plan", { name: planName }));
    lines.push(window.I18n.t("ui.refonte.export_date", { date: new Date().toLocaleString("fr-FR") }));
    lines.push(window.I18n.t("ui.refonte.export_duration", { duration: _formatDurationStats(stats.session.durationMs) }));
    lines.push("");
    if (stats.roads.total > 0) {
      lines.push("## 🛣 " + window.I18n.t("ui.refonte.section_roads"));
      lines.push(window.I18n.t("ui.refonte.export_total_roads", { dist: _fdistStats(stats.roads.distM), n: stats.roads.total }));
      Object.keys(stats.roads.byType).forEach(function(t) {
        const s = stats.roads.byType[t];
        lines.push("- " + t + " : " + s.nb + " × " + _fdistStats(s.distM));
      });
      lines.push("");
    }
    if (stats.zones.total > 0) {
      lines.push("## ⬛ " + window.I18n.t("ui.refonte.section_zones"));
      lines.push(window.I18n.t("ui.refonte.export_total_zones", { surf: _fsurfStats(stats.zones.areaM2), n: stats.zones.total }));
      Object.keys(stats.zones.byType).forEach(function(t) {
        const z = stats.zones.byType[t];
        lines.push("- " + t + " : " + z.nb + " × " + _fsurfStats(z.areaM2));
      });
      lines.push("");
    }
    if (stats.structures.total > 0) {
      lines.push("## 🏛️ " + window.I18n.t("ui.refonte.section_structures"));
      lines.push(window.I18n.t("ui.refonte.export_total_structures", { n: stats.structures.total }) +
                 (stats.structures.fronts_totalM > 0 ? window.I18n.t("ui.refonte.stats_fronts_suffix", { dist: _fdistStats(stats.structures.fronts_totalM) }) : ""));
      Object.keys(stats.structures.byType).forEach(function(t) {
        const s = stats.structures.byType[t];
        const det = (t === "front-1" || t === "front-2")
          ? _fdistStats(s.longM)
          : (s.areaM2 > 0 ? _fsurfStats(s.areaM2) : "");
        lines.push("- " + t + " : " + s.nb + (det ? " · " + det : ""));
      });
      lines.push("");
    }
    if (stats.points.total > 0) {
      lines.push("## 📍 " + window.I18n.t("ui.refonte.section_points"));
      lines.push(window.I18n.t("ui.refonte.export_total_simple", { n: stats.points.total }));
      Object.keys(stats.points.byTag).forEach(function(tag) {
        lines.push("- " + tag + " : " + stats.points.byTag[tag]);
      });
      lines.push("");
    }
    if (stats.tracker.active) {
      lines.push("## 🚶 " + window.I18n.t("ui.refonte.section_tracker"));
      lines.push(window.I18n.t("ui.refonte.stats_tracker_active", { dist: _fdistStats(stats.tracker.distM) }));
      lines.push("");
    }
    // 🆕 v1.12.0-fix : 2 mesures indépendantes — sortie séparée
    if (stats.mesure.distance.points >= 2) {
      lines.push("## 📐 " + window.I18n.t("ui.refonte.export_mesure_distance_titre"));
      lines.push(window.I18n.t("ui.refonte.export_mesure_distance", { dist: _fdistStats(stats.mesure.distance.distM), n: stats.mesure.distance.points }));
      lines.push("");
    }
    if (stats.mesure.surface.points >= 3) {
      const surfTxt = (typeof window.formatSurface === "function")
        ? window.formatSurface(stats.mesure.surface.areaM2, 1)
        : (stats.mesure.surface.areaM2.toFixed(1) + " m²");
      lines.push("## ⬛ " + window.I18n.t("ui.refonte.export_mesure_surface_titre"));
      lines.push(window.I18n.t("ui.refonte.export_mesure_surface", { surf: surfTxt, n: stats.mesure.surface.points }));
      lines.push("");
    }
    if (multiLevel && stats.byLevel) {
      lines.push("## 🏗️ " + window.I18n.t("ui.refonte.stats_mlvl_titre"));
      const levels = Object.keys(stats.byLevel).map(Number).sort(function(a, b) { return a - b; });
      levels.forEach(function(lvl) {
        const b = stats.byLevel[lvl];
        lines.push("- " + window.I18n.t("ui.refonte.export_mlvl_row", { n: lvl, points: b.points, roads: b.roads, zones: b.zones, structures: b.structures }));
      });
      lines.push("");
    }
    lines.push("---");
    lines.push(window.I18n.t("ui.refonte.export_footer"));
    return lines.join("\n");
  }

  function _afficherModaleSessionDetail() {
    // Cleanup éventuel d'une instance précédente
    const existing = document.getElementById("kta-refonte-session-modal");
    if (existing) { existing.remove(); return; }

    const points     = (window.getEditorPoints  && window.getEditorPoints()  || []);
    const roads      = (window.getRoads         && window.getRoads()         || []);
    const zones      = (window.getZones         && window.getZones()         || []);
    // 🆕 v1.9.3-A1.a : structures pour la modale détail session
    const structures = (window.getStructures    && window.getStructures()    || []);
    const mesure     = (window.getMeasurePoints && window.getMeasurePoints() || []);
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

    // ─── 🆕 v1.11.2 V2.2 : STATS AGRÉGÉES (KARMA 1:a+b+e+g+h+i · 2:a · 3:a · 4:b · 5:a · 6:a+c · 7:a · 8:a+c) ───
    // Bloc en TÊTE avec :
    //   - Durée de session (depuis lancerApplication, cf main.js)
    //   - Distance totale tracés + breakdown par type + barre CSS
    //   - Surface totale zones + breakdown + barre CSS
    //   - Structures (nb piliers 1/2 + mur + longueur fronts en m)
    //   - Photos (nb total + taille totale Mo via async)
    //   - Tracker (distance parcourue si actif)
    //   - Multi-niveau breakdown si MLVL
    //   - Boutons Copier + Exporter TXT
    const _stats = _calculerStatsAggregees(points, roads, zones, structures, mesure, scale);
    let html = _genererStatsAggregeesHTML(_stats, multiLevel);

    // 🆕 v1.20.0 — CTA vers la modale Stats globales du plan (qui couvre
    // session + data layers embedded, vs cette modale qui couvre session
    // uniquement). Pour bien différencier les 2 vues à l'user.
    html += '<div class="kta-refonte-session-cta-stats-glob">' +
              '<button type="button" class="kta-btn kta-btn-primary" id="kta-refonte-session-open-stats-glob">' +
                '📊 ' + window.I18n.t("ui.refonte.modal_cta_stats_glob") +
              '</button>' +
              '<div style="font-size:11.5px; color:#8892a4; margin-top:4px; text-align:center; font-style:italic;">' +
                window.I18n.t("ui.refonte.modal_cta_stats_glob_hint") +
              '</div>' +
            '</div>';

    // 📍 Points
    html += '<div class="kta-refonte-session-section">';
    html += '<div class="kta-refonte-session-section-titre">📍 ' + window.I18n.t("ui.refonte.section_points_added") + ' <span class="kta-refonte-session-badge">' + points.length + '</span></div>';
    if (points.length === 0) {
      html += '<div class="kta-refonte-session-empty">' + window.I18n.t("ui.refonte.empty_points") + '</div>';
    } else {
      html += '<ul class="kta-refonte-session-list">';
      points.forEach(function(p) {
        const rawTag = Array.isArray(p.tags) && p.tags.length > 0 ? p.tags[0] : "";
        // 🆕 v1.20.0-fix1+ : LC.getLabel("icones", tag) respecte cascade
        // session>plan>default. Si l'user a renommé "Puits A" → "Puits N",
        // affichage à jour ici aussi. Fallback = tag brut si LC indispo OU
        // si tag inconnu. Si pas de tag → "—" pour la lisibilité.
        const tag    = rawTag ? _lcLabel("icones", rawTag, rawTag) : "—";
        const nom    = p.nom || p.id || window.I18n.t("ui.refonte.label_no_name");
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
    html += '<div class="kta-refonte-session-section-titre">🛣 ' + window.I18n.t("ui.refonte.section_roads") + ' <span class="kta-refonte-session-badge">' + roadsNonIti.length + '</span></div>';
    if (roadsNonIti.length === 0) {
      html += '<div class="kta-refonte-session-empty">' + window.I18n.t("ui.refonte.empty_roads") + '</div>';
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
        // 🆕 v1.20.0-fix1+ : LC.getLabel("traces", t) respecte cascade session>plan>default
        const fallback = t === "principal" ? window.I18n.t("ui.refonte.label_road_principal") :
                         t === "secondaire" ? window.I18n.t("ui.refonte.label_road_secondaire") :
                         t === "chemin" ? window.I18n.t("ui.refonte.label_road_chemin") :
                         t === "jonction" ? window.I18n.t("ui.refonte.label_road_jonction_interniveau") : t;
        const tLabel = _lcLabel("traces", t, fallback);
        html += '<li>' +
          '<strong>' + _esc(tLabel) + '</strong>' +
          '<span class="kta-refonte-session-meta">' +
            window.I18n.t("ui.refonte.label_n_roads", { n: stats.nb }) + ' · ' + _formatDist(stats.distM) +
          '</span>' +
        '</li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // ⬛ Zones
    html += '<div class="kta-refonte-session-section">';
    html += '<div class="kta-refonte-session-section-titre">⬛ ' + window.I18n.t("ui.refonte.section_zones") + ' <span class="kta-refonte-session-badge">' + zones.length + '</span></div>';
    if (zones.length === 0) {
      html += '<div class="kta-refonte-session-empty">' + window.I18n.t("ui.refonte.empty_zones") + '</div>';
    } else {
      const zByType = {};
      zones.forEach(function(z) {
        const t = z.type || "?";
        zByType[t] = (zByType[t] || 0) + 1;
      });
      html += '<ul class="kta-refonte-session-list">';
      Object.keys(zByType).forEach(function(t) {
        // 🆕 v1.20.0-fix1+ : LC.getLabel("zones", t) respecte la cascade.
        // Emoji conservé en suffixe pour cohérence visuelle (LC.getLabel
        // ne renvoie que le label texte sans emoji décoratif).
        const fallbackTxt = t === "eau" ? window.I18n.t("ui.refonte.label_zone_eau") :
                            t === "remblais" ? window.I18n.t("ui.refonte.label_zone_remblais") :
                            t === "effondrement" ? window.I18n.t("ui.refonte.label_zone_effondrement") :
                            t === "inaccessible" ? window.I18n.t("ui.refonte.label_zone_inaccessible") : t;
        const emojiSuffix = t === "eau" ? " 🟦" :
                            t === "remblais" ? " ⬛" :
                            t === "effondrement" ? " 🟥" :
                            t === "inaccessible" ? " ⛔" : "";
        const tLabel = _lcLabel("zones", t, fallbackTxt) + emojiSuffix;
        const nb = zByType[t];
        html += '<li>' +
          '<strong>' + _esc(tLabel) + '</strong>' +
          '<span class="kta-refonte-session-meta">' + window.I18n.t("ui.refonte.label_n_zones", { n: nb }) + '</span>' +
        '</li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // 🏛️ Structures (v1.9.3-A1.a) — piliers + murs
    html += '<div class="kta-refonte-session-section">';
    html += '<div class="kta-refonte-session-section-titre">🏛️ ' + window.I18n.t("ui.refonte.section_structures") + ' <span class="kta-refonte-session-badge">' + structures.length + '</span></div>';
    if (structures.length === 0) {
      html += '<div class="kta-refonte-session-empty">' + window.I18n.t("ui.refonte.empty_structures") + '</div>';
    } else {
      const sByType = {};
      structures.forEach(function(s) {
        const t = s.type || "?";
        sByType[t] = (sByType[t] || 0) + 1;
      });
      html += '<ul class="kta-refonte-session-list">';
      Object.keys(sByType).forEach(function(t) {
        // 🆕 v1.20.0-fix1+ : LC.getLabel("structures", t) respecte cascade.
        // Emoji conservé en suffixe (LC.getLabel = label texte sans emoji).
        const fallbackTxt = t === "pilier-1" ? window.I18n.t("ui.refonte.label_struct_pilier1") :
                            t === "pilier-2" ? window.I18n.t("ui.refonte.label_struct_pilier2") :
                            t === "mur"      ? window.I18n.t("ui.refonte.label_struct_mur") :
                            t === "front-1"  ? window.I18n.t("ui.refonte.label_struct_front1") :
                            t === "front-2"  ? window.I18n.t("ui.refonte.label_struct_front2") : t;
        const emojiSuffix = t === "pilier-1" ? " 🟡" :
                            t === "pilier-2" ? " 🟠" :
                            t === "mur"      ? " 🔵" :
                            t === "front-1"  ? " 🟨" :
                            t === "front-2"  ? " 🟧" : "";
        const tLabel = _lcLabel("structures", t, fallbackTxt) + emojiSuffix;
        const nb = sByType[t];
        html += '<li>' +
          '<strong>' + _esc(tLabel) + '</strong>' +
          '<span class="kta-refonte-session-meta">' + window.I18n.t("ui.refonte.label_n_structures", { n: nb }) + '</span>' +
        '</li>';
      });
      html += '</ul>';
    }
    html += '</div>';

    // 📸 Photos (v1.9.3-B1d+) — section async hydratée après injection DOM
    // pour ne pas bloquer le render initial. Compteur "Chargement…" en
    // placeholder puis swap avec total / taille / breakdown par point.
    html += '<div class="kta-refonte-session-section" id="kta-refonte-session-photos-section">';
    html += '<div class="kta-refonte-session-section-titre">📸 ' + window.I18n.t("ui.refonte.section_photos") + ' <span class="kta-refonte-session-badge" id="kta-refonte-session-photos-badge">…</span></div>';
    html += '<div id="kta-refonte-session-photos-body" class="kta-refonte-session-empty">' + window.I18n.t("ui.refonte.loading") + '</div>';
    html += '</div>';

    // 📐 Mesure simple (distance) + ⬛ Mesure de surface + 🗺️ Itinéraire + 🚶 Tracker
    const tFoo = !!(window.getTrackingPosition && window.getTrackingPosition());
    // 🆕 v1.12.0-fix : récupère la mesure de surface séparément (les 2 mesures coexistent)
    const mesureSurfDetail = (window.getMeasurePointsSurface && window.getMeasurePointsSurface()) || [];
    const hasMesureDist = mesure.length >= 2;
    const hasMesureSurf = mesureSurfDetail.length >= 3;
    if (hasMesureDist || hasMesureSurf || itineraire || tFoo) {
      html += '<div class="kta-refonte-session-section">';
      html += '<div class="kta-refonte-session-section-titre">📊 ' + window.I18n.t("ui.refonte.section_other_measures") + '</div>';
      html += '<ul class="kta-refonte-session-list">';

      // 📐 Mesure simple (polyline distance)
      if (hasMesureDist) {
        let total = 0;
        for (let i = 1; i < mesure.length; i++) {
          const dx = mesure[i].x - mesure[i-1].x;
          const dy = mesure[i].y - mesure[i-1].y;
          total += Math.sqrt(dx*dx + dy*dy);
        }
        html += '<li>' +
          '<strong>📐 ' + window.I18n.t("ui.refonte.item_mesure_simple") + '</strong>' +
          '<span class="kta-refonte-session-meta">' + _formatDist(total / scale) + ' (' + window.I18n.t("ui.refonte.label_n_points", { n: mesure.length }) + ')</span>' +
        '</li>';
      }

      // ⬛ Mesure de surface (polygone, depuis v1.12.0)
      if (hasMesureSurf) {
        const surfM2 = (typeof window.polygonAreaM2 === "function")
          ? (window.polygonAreaM2(mesureSurfDetail) || 0)
          : 0;
        const surfTxt = (typeof window.formatSurface === "function")
          ? window.formatSurface(surfM2, 1)
          : (surfM2 < 10000 ? Math.round(surfM2) + " m²" : (surfM2 / 10000).toFixed(2) + " ha");
        html += '<li>' +
          '<strong>⬛ ' + window.I18n.t("ui.refonte.item_mesure_surface") + '</strong>' +
          '<span class="kta-refonte-session-meta">' + surfTxt + ' (' + window.I18n.t("ui.refonte.label_n_vertices", { n: mesureSurfDetail.length }) + ')</span>' +
        '</li>';
      }

      // Itinéraire
      if (itineraire) {
        const distIti = _distRoad(itineraire);
        const nbWp = Array.isArray(itineraire.waypoints) ? itineraire.waypoints.length : 0;
        html += '<li>' +
          '<strong>🗺️ ' + window.I18n.t("ui.refonte.item_iti_active") + '</strong>' +
          '<span class="kta-refonte-session-meta">' +
            _formatDist(distIti) + (nbWp > 0 ? ' · ' + window.I18n.t("ui.refonte.label_n_waypoints", { n: nbWp }) : '') +
          '</span>' +
        '</li>';
      }

      // Tracker
      if (tFoo) {
        const pos = window.getTrackingPosition();
        html += '<li>' +
          '<strong>🚶 ' + window.I18n.t("ui.refonte.section_tracker") + '</strong>' +
          '<span class="kta-refonte-session-meta">' +
            window.I18n.t("ui.refonte.item_tracker_pos", { x: Math.round(pos.x), y: Math.round(pos.y) }) +
          '</span>' +
        '</li>';
      }

      html += '</ul>';
      html += '</div>';
    }

    // ─── 📔 v1.69.0 : Le Carnet — sortie en cours ───
    //
    // Point d'entrée de la clôture MANUELLE (décision KARMA 1:c, hybride) :
    // l'archivage auto se déclenche au teardown du plan, mais l'user peut
    // « poser » une étape à tout moment — la sortie est alors gardée sans
    // condition de seuil, et une nouvelle repart aussitôt sur le même plan.
    (function _sectionCarnet() {
      const cur = (window.Journal && typeof window.Journal.getCurrent === "function")
                    ? window.Journal.getCurrent() : null;
      html += '<div class="kta-refonte-session-section" id="kta-refonte-session-carnet-section">';
      html += '<div class="kta-refonte-session-section-titre">📔 ' + window.I18n.t("jrn.section.titre") + '</div>';
      if (cur) {
        const a = cur.ajouts || {};
        const nbAj = (a.points || 0) + (a.roads || 0) + (a.zones || 0) + (a.structures || 0) + (a.photos || 0);
        const min = Math.floor((cur.activeMs || 0) / 60000);
        const duree = (min < 1 ? window.I18n.t("jrn.dur.lessMin") : (min + " min"));
        // 🚶/🖥️ v1.69.0 : la nature est annoncée EN DIRECT — sans ça l'user
        // découvrirait après coup que sa session a été classée « travail sur
        // plan » (aucun déplacement tracker) au lieu de « sortie ».
        const terrain = (cur.type === "terrain");
        html += '<div style="font-size:12px; color:#8892a4; margin-bottom:8px; line-height:1.5;">' +
                  (terrain
                    ? window.I18n.t("jrn.section.encours", {
                        duree: duree, dist: window.formatDistance(cur.distM || 0, 0), n: nbAj })
                    : window.I18n.t("jrn.section.encoursBureau", { duree: duree, n: nbAj })) +
                '</div>';
      } else {
        html += '<div style="font-size:12px; color:#8892a4; margin-bottom:8px; line-height:1.5;">' +
                  window.I18n.t("jrn.section.aucune") +
                '</div>';
      }
      html += '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
                (cur ? '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-refonte-session-carnet-cloture">' +
                         '🏁 ' + window.I18n.t("jrn.section.cloturer") + '</button>' : '') +
                '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-refonte-session-carnet-ouvrir">' +
                  '📔 ' + window.I18n.t("jrn.section.ouvrir") + '</button>' +
              '</div>';
      html += '</div>';
    })();

    // ─── 🆕 v1.20.0 : ⭐ Favoris — Export/Import JSON ───
    //
    // Section dédiée pour partager les favoris cross-appareil (avant v1.20.0
    // les favoris étaient strictement locaux par appareil, par design). Boutons
    // 📤 Exporter (plan courant OU tous les plans) et 📥 Importer (mode merge
    // anti-doublon par défaut). Compteur affiché : N favoris pour le plan
    // courant + total cross-plan.
    html += '<div class="kta-refonte-session-section" id="kta-refonte-session-favoris-section">';
    html += '<div class="kta-refonte-session-section-titre">⭐ ' + window.I18n.t("ui.refonte.section_favoris") + ' <span class="kta-refonte-session-badge" id="kta-refonte-session-favoris-badge">…</span></div>';
    html += '<div style="font-size:12px; color:#8892a4; margin-bottom:8px; line-height:1.5;">' +
              window.I18n.t("ui.refonte.favoris_desc") +
            '</div>';
    html += '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-refonte-session-favoris-export-current">' +
                '📤 ' + window.I18n.t("ui.refonte.btn_fav_export_current") +
              '</button>' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-refonte-session-favoris-export-all">' +
                '📤 ' + window.I18n.t("ui.refonte.btn_fav_export_all") +
              '</button>' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-refonte-session-favoris-import">' +
                '📥 ' + window.I18n.t("ui.refonte.btn_fav_import") +
              '</button>' +
              '<input type="file" id="kta-refonte-session-favoris-import-file" accept=".json,application/json" style="display:none;">' +
            '</div>';
    html += '<div id="kta-refonte-session-favoris-status" style="font-size:11.5px; color:#8892a4; min-height:14px; font-style:italic;"></div>';
    html += '</div>';

    // ─── 🆕 v1.16.0 step 4 : 📦 Backups récents (10 FIFO IDB) ───
    //
    // Section listée en bas de la modale. Hydratée async via
    // window.SessionBackups.listAll() après ouverture de la modale.
    // 2 boutons d'action en tête : 📦 Snapshot maintenant + 🗑️ Tout vider.
    html += '<div class="kta-refonte-session-section" id="kta-refonte-session-backups-section">';
    html += '<div class="kta-refonte-session-section-titre">📦 ' + window.I18n.t("ui.refonte.section_backups") + ' <span class="kta-refonte-session-badge" id="kta-refonte-session-backups-badge">…</span></div>';
    html += '<div style="font-size:12px; color:#8892a4; margin-bottom:8px; line-height:1.5;">' +
              window.I18n.t("ui.refonte.backups_desc") +
            '</div>';
    html += '<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-refonte-session-backups-snapshot">' +
                '📆 ' + window.I18n.t("ui.refonte.btn_snapshot_now") +
              '</button>' +
              '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-refonte-session-backups-clearall">' +
                '🗑️ ' + window.I18n.t("ui.refonte.btn_clear_all") +
              '</button>' +
            '</div>';
    html += '<div id="kta-refonte-session-backups-list">' +
              '<div style="font-size:12px; color:#8892a4; font-style:italic;">' + window.I18n.t("ui.refonte.loading") + '</div>' +
            '</div>';
    html += '</div>';

    // ─── Création de la modale ───
    const overlay = document.createElement("div");
    overlay.id = "kta-refonte-session-modal";
    overlay.className = "kta-readme-modal-overlay";
    overlay.style.display = "flex";
    overlay.innerHTML =
      '<div class="kta-readme-modal-boite kta-refonte-session-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">📊 ' + window.I18n.t("ui.refonte.modal_session_titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-refonte-session-close" aria-label="' + window.I18n.t("ui.refonte.btn_close_aria") + '">✕</button>' +
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

    // 📔 v1.69.0 — Wire-up des CTA du Carnet (clôture manuelle + ouverture).
    const _btnCarnetClot = document.getElementById("kta-refonte-session-carnet-cloture");
    if (_btnCarnetClot) {
      _btnCarnetClot.addEventListener("click", function() {
        if (window.JournalUi && typeof window.JournalUi.cloturerDepuisUi === "function") {
          _close();   // la fiche s'ouvre par-dessus : on ferme la modale Session d'abord
          window.JournalUi.cloturerDepuisUi();
        }
      });
    }
    const _btnCarnetOuvrir = document.getElementById("kta-refonte-session-carnet-ouvrir");
    if (_btnCarnetOuvrir) {
      _btnCarnetOuvrir.addEventListener("click", function() {
        if (window.JournalUi && typeof window.JournalUi.ouvrir === "function") {
          _close();
          window.JournalUi.ouvrir();
        }
      });
    }

    // 🆕 v1.20.0 — CTA Stats globales du plan (modale dédiée)
    const _btnStatsGlob = document.getElementById("kta-refonte-session-open-stats-glob");
    if (_btnStatsGlob) {
      _btnStatsGlob.addEventListener("click", function() {
        if (window.StatsGlobales && typeof window.StatsGlobales.ouvrir === "function") {
          window.StatsGlobales.ouvrir();
        } else {
          if (window.OOMGuard && window.OOMGuard.showToast) {
            window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_stats_glob_unavailable"), "warn");
          }
        }
      });
    }

    // 🆕 v1.11.2 V2.2 : wire-up boutons Copier + Exporter du bloc Stats agrégées
    const _btnCopier = document.getElementById("kta-stats-copier");
    const _btnExport = document.getElementById("kta-stats-exporter");
    if (_btnCopier) {
      _btnCopier.addEventListener("click", function() {
        const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "Plan";
        const txt = _genererStatsAggregeesTXT(_stats, planName, multiLevel);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function() {
            if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_copy_ok"), "info");
          }).catch(function() {
            if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_copy_fail"), "warn");
          });
        } else {
          if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_clipboard_unavailable"), "warn");
        }
      });
    }
    if (_btnExport) {
      _btnExport.addEventListener("click", function() {
        const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "Plan";
        const txt = _genererStatsAggregeesTXT(_stats, planName, multiLevel);
        const safePlan = String(planName).replace(/[^a-zA-Z0-9_-]/g, "_");
        const date = new Date();
        const dateStr = date.getFullYear() + "-" +
                        String(date.getMonth() + 1).padStart(2, "0") + "-" +
                        String(date.getDate()).padStart(2, "0");
        const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = safePlan + "_stats_" + dateStr + ".txt";
        link.click();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
        if (window.OOMGuard && window.OOMGuard.showToast) window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_export_ok"), "info");
      });
    }

    // 🆕 v1.16.0 step 4 : hydrate la section 📦 Backups récents — listAll
    // IDB async puis injecte la liste + wire les boutons restore / remove.
    function _renderBackupsSection() {
      const listEl  = document.getElementById("kta-refonte-session-backups-list");
      const badgeEl = document.getElementById("kta-refonte-session-backups-badge");
      if (!listEl || !badgeEl) return;
      if (!window.SessionBackups || typeof window.SessionBackups.listAll !== "function") {
        listEl.innerHTML = '<div style="font-size:12px; color:#8892a4; font-style:italic;">' + window.I18n.t("ui.refonte.backups_module_unavailable") + '</div>';
        badgeEl.textContent = "—";
        return;
      }
      window.SessionBackups.listAll().then(function(arrAll) {
        // 🐛 v1.16.0-fix (KARMA "dans la liste des snap, je dois voir que
        // la liste des snap de ce plan, pas les autres") : filtre sur
        // window._currentLoadedPlanId. Les snapshots d'autres plans restent
        // en IDB (utiles pour le retour à un autre plan) mais ne sont pas
        // affichés dans la liste de CE plan.
        const currentPlanId = window._currentLoadedPlanId || null;
        const arr = arrAll.filter(function(b) {
          // Si le snapshot n'a pas de planId (cas legacy ou session vide),
          // on l'affiche quand même — il pourrait correspondre. Sinon on
          // exige une correspondance stricte.
          if (!b.planId) return true;
          if (!currentPlanId) return true;  // pas de plan chargé → tout afficher
          return b.planId === currentPlanId;
        });
        // Badge : compteur de CE plan + en sous-info, total tous plans
        // confondus pour que l'user sache que des snapshots d'autres plans
        // existent ailleurs.
        const otherPlans = arrAll.length - arr.length;
        if (otherPlans > 0) {
          badgeEl.innerHTML = String(arr.length) +
            ' <span style="opacity:0.55; font-weight:400; font-size:0.85em;">' +
            window.I18n.t("ui.refonte.badge_other_plans", { n: otherPlans }) + '</span>';
        } else {
          badgeEl.textContent = String(arr.length);
        }
        if (arr.length === 0) {
          const emptyMsg = currentPlanId
            ? window.I18n.t("ui.refonte.backups_empty_plan")
            : window.I18n.t("ui.refonte.backups_empty");
          listEl.innerHTML = '<div style="font-size:12px; color:#8892a4; font-style:italic;">' + emptyMsg + '</div>';
          return;
        }
        function _esc(s) {
          return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
            return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
          });
        }
        function _fmtDate(ts) {
          const d = new Date(ts);
          const j = String(d.getDate()).padStart(2, "0");
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const a = d.getFullYear();
          const h = String(d.getHours()).padStart(2, "0");
          const mn = String(d.getMinutes()).padStart(2, "0");
          return j + "/" + m + "/" + a + " " + h + ":" + mn;
        }
        function _countContent(p) {
          if (!p) return window.I18n.t("ui.refonte.label_empty");
          const parts = [];
          if (p.editorPoints   && p.editorPoints.length)   parts.push(p.editorPoints.length + "📍");
          if (p.roads          && p.roads.length)          parts.push(p.roads.length + "🛣");
          if (p.zones          && p.zones.length)          parts.push(p.zones.length + "⬛");
          if (p.structures     && p.structures.length)     parts.push(p.structures.length + "🏛️");
          return parts.length ? parts.join(" ") : window.I18n.t("ui.refonte.label_empty");
        }
        // 🐛 v1.16.0-fix (KARMA "entre chaque snap, il y a bcp espace vide
        // inutile") : la classe .kta-refonte-session-list applique
        // padding:7px 0 + display:flex column + gap:2px sur chaque li,
        // pensé pour les listes verticales (points/tracés où strong est sur
        // une ligne et meta sur la ligne en dessous). Pour les backups on
        // veut une ligne unique compacte → on override avec une classe
        // dédiée .kta-backups-list qui annule ces règles et utilise un
        // layout horizontal serré (padding 4px, items en ligne).
        let h = '<ul class="kta-refonte-session-list kta-backups-list">';
        arr.forEach(function(b) {
          // 🐛 v1.16.0-fix : on n'affiche plus le planName dans le meta
          // puisque la liste est filtrée sur le plan courant (= tous les
          // snapshots affichés sont du même plan, l'info serait redondante).
          h += '<li>' +
                 '<span class="kta-backup-info">' +
                   '<strong>' + _fmtDate(b.createdAt) + '</strong>' +
                   ' <span class="kta-refonte-session-meta">' +
                     _countContent(b.payload) +
                     ' · <em style="opacity:0.7;">' + _esc(b.reason || window.I18n.t("ui.refonte.label_backup_auto")) + '</em>' +
                   '</span>' +
                 '</span>' +
                 '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" ' +
                   'data-backup-restore="' + b.id + '" title="' + window.I18n.t("ui.refonte.btn_restore_title") + '">' +
                   '↻ ' + window.I18n.t("ui.refonte.btn_restore") +
                 '</button>' +
                 '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" ' +
                   'data-backup-remove="' + b.id + '" title="' + window.I18n.t("ui.refonte.btn_remove_snapshot_title") + '">' +
                   '🗑️' +
                 '</button>' +
               '</li>';
        });
        h += '</ul>';
        listEl.innerHTML = h;
        // Wire les boutons restore / remove
        listEl.querySelectorAll("[data-backup-restore]").forEach(function(btn) {
          btn.addEventListener("click", function() {
            const id = Number(btn.getAttribute("data-backup-restore"));
            const ok = window.confirm(window.I18n.t("ui.refonte.confirm_restore"));
            if (!ok) return;
            window.SessionBackups.restore(id).then(function() {
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_restore_ok"), "info");
              }
              setTimeout(function() { location.reload(); }, 400);
            }).catch(function(err) {
              alert(window.I18n.t("ui.refonte.alert_restore_fail", { err: (err && err.message ? err.message : err) }));
            });
          });
        });
        listEl.querySelectorAll("[data-backup-remove]").forEach(function(btn) {
          btn.addEventListener("click", function() {
            const id = Number(btn.getAttribute("data-backup-remove"));
            window.SessionBackups.remove(id).then(function() {
              _renderBackupsSection();  // refresh
            });
          });
        });
      }).catch(function(err) {
        listEl.innerHTML = '<div style="font-size:12px; color:#ff8c8c;">' +
                            window.I18n.t("ui.refonte.backups_load_error", { err: (err && err.message ? err.message : String(err)) }) + '</div>';
      });
    }
    _renderBackupsSection();

    // Boutons d'action : 📆 Snapshot maintenant + 🗑️ Tout vider
    const _btnSnap = document.getElementById("kta-refonte-session-backups-snapshot");
    if (_btnSnap) {
      _btnSnap.addEventListener("click", function() {
        if (!window.SessionBackups) return;
        window.SessionBackups.snapshot("manual").then(function(entry) {
          if (entry) {
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_snapshot_created"), "info");
            }
            _renderBackupsSection();
          } else {
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_snapshot_skip"), "info");
            }
          }
        });
      });
    }
    const _btnClearBk = document.getElementById("kta-refonte-session-backups-clearall");
    if (_btnClearBk) {
      _btnClearBk.addEventListener("click", function() {
        const ok = window.confirm(window.I18n.t("ui.refonte.confirm_clear_all"));
        if (!ok) return;
        window.SessionBackups.clearAll().then(function() {
          _renderBackupsSection();
          if (window.OOMGuard && window.OOMGuard.showToast) {
            window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_backups_cleared"), "info");
          }
        });
      });
    }

    // 🆕 v1.20.0 — Section ⭐ Favoris : export/import JSON
    _hydrateFavorisBadge();
    const _btnFavExportCur = document.getElementById("kta-refonte-session-favoris-export-current");
    const _btnFavExportAll = document.getElementById("kta-refonte-session-favoris-export-all");
    const _btnFavImport    = document.getElementById("kta-refonte-session-favoris-import");
    const _favImportInput  = document.getElementById("kta-refonte-session-favoris-import-file");
    const _favStatus       = document.getElementById("kta-refonte-session-favoris-status");

    function _setFavStatus(msg, isOk) {
      if (!_favStatus) return;
      _favStatus.textContent = msg || "";
      _favStatus.style.color = isOk === true ? "#6ee28a"
                              : isOk === false ? "#ff8c8c"
                              : "#8892a4";
    }

    if (_btnFavExportCur) {
      _btnFavExportCur.addEventListener("click", function() {
        if (!window.Favoris || typeof window.Favoris.exportToFile !== "function") {
          _setFavStatus(window.I18n.t("ui.refonte.favoris_module_unavailable"), false); return;
        }
        const list = window.Favoris.getAll();
        if (!list || list.length === 0) {
          _setFavStatus(window.I18n.t("ui.refonte.favoris_none_current"), false); return;
        }
        try {
          window.Favoris.exportToFile({ scope: "current-plan" });
          _setFavStatus(window.I18n.t("ui.refonte.favoris_export_current_ok", { n: list.length }), true);
        } catch(e) {
          _setFavStatus(window.I18n.t("ui.refonte.favoris_export_fail", { err: (e.message || e) }), false);
        }
      });
    }
    if (_btnFavExportAll) {
      _btnFavExportAll.addEventListener("click", function() {
        if (!window.Favoris || typeof window.Favoris.exportToFile !== "function") {
          _setFavStatus(window.I18n.t("ui.refonte.favoris_module_unavailable"), false); return;
        }
        try {
          const payload = window.Favoris.exportToFile({ scope: "all" });
          const total = Object.keys(payload.byPlan).reduce(function(acc, pid) {
            return acc + (payload.byPlan[pid] || []).length;
          }, 0);
          const plans = Object.keys(payload.byPlan).length;
          if (total === 0) {
            _setFavStatus(window.I18n.t("ui.refonte.favoris_none_all"), false);
          } else {
            _setFavStatus(window.I18n.t("ui.refonte.favoris_export_all_ok", { total: total, plans: plans }), true);
          }
        } catch(e) {
          _setFavStatus(window.I18n.t("ui.refonte.favoris_export_fail", { err: (e.message || e) }), false);
        }
      });
    }
    if (_btnFavImport && _favImportInput) {
      _btnFavImport.addEventListener("click", function() { _favImportInput.click(); });
      _favImportInput.addEventListener("change", function(e) {
        const file = e.target.files && e.target.files[0];
        e.target.value = ""; // reset pour permettre re-sélection du même fichier
        if (!file) return;
        if (!window.Favoris || typeof window.Favoris.importFromFile !== "function") {
          _setFavStatus(window.I18n.t("ui.refonte.favoris_module_unavailable"), false); return;
        }
        _setFavStatus(window.I18n.t("ui.refonte.favoris_import_progress"), null);
        window.Favoris.importFromFile(file, { mode: "merge" }).then(function(res) {
          if (!res || !res.ok) {
            _setFavStatus(window.I18n.t("ui.refonte.favoris_import_fail", { err: (res && res.error || window.I18n.t("ui.refonte.label_unknown_reason")) }), false);
            return;
          }
          const parts = [];
          if (res.added > 0)    parts.push(window.I18n.t("ui.refonte.favoris_import_added", { n: res.added }));
          if (res.skipped > 0)  parts.push(window.I18n.t("ui.refonte.favoris_import_skipped", { n: res.skipped }));
          if (res.replaced > 0) parts.push(window.I18n.t("ui.refonte.favoris_import_replaced", { n: res.replaced }));
          if (parts.length === 0) parts.push(window.I18n.t("ui.refonte.favoris_import_nothing"));
          _setFavStatus(
            window.I18n.t("ui.refonte.favoris_import_ok", { plans: res.plansTouched.length, details: parts.join(" · ") }),
            true
          );
          _hydrateFavorisBadge();
        });
      });
    }

    // 🆕 v1.20.0 — Hydrate le badge ⭐ Favoris (compteur plan courant + total).
    // Fonction declaration (hoisted) : l'appel au début du bloc favoris
    // (`_hydrateFavorisBadge()` ligne plus haut) fonctionne grâce au hoisting.
    function _hydrateFavorisBadge() {
      const badge = document.getElementById("kta-refonte-session-favoris-badge");
      if (!badge) return;
      if (!window.Favoris) { badge.textContent = "?"; return; }
      const currentList = window.Favoris.getAll() || [];
      const currentN = currentList.length;
      let totalN = currentN;
      try {
        const payload = window.Favoris.exportToJson({ scope: "all" });
        const plans = Object.keys(payload.byPlan || {});
        totalN = plans.reduce(function(acc, pid) { return acc + (payload.byPlan[pid] || []).length; }, 0);
      } catch(e) {}
      if (totalN === 0) {
        badge.textContent = "0";
      } else if (currentN === totalN) {
        badge.textContent = currentN + "";
      } else {
        badge.textContent = currentN + " " + window.I18n.t("ui.refonte.badge_other_plans_paren", { n: (totalN - currentN) });
      }
    }

    // 🆕 v1.11.2 V2.2 : hydrate la ligne 📸 Photos du bloc Stats agrégées
    // (compteur + taille totale via IDB async, indépendant de la section
    // détaillée hydratée plus bas)
    if (window.MyKTAMapPhotos && typeof window.MyKTAMapPhotos.getAllPhotosForPlan === "function") {
      const planId = window._currentLoadedPlanId || "default";
      window.MyKTAMapPhotos.getAllPhotosForPlan(planId).then(function(arr) {
        const row = document.getElementById("kta-stats-photos-row");
        const val = document.getElementById("kta-stats-photos-val");
        if (!row || !val) return;
        const total = arr.length;
        if (total === 0) { row.style.display = "none"; return; }
        row.style.display = "";
        let totalSize = 0;
        arr.forEach(function(rec) { totalSize += rec.size || (rec.blob && rec.blob.size) || 0; });
        const fmtBytes = window._kta_formatBytes || function(n) {
          if (n < 1024) return n + " o";
          if (n < 1024 * 1024) return Math.round(n / 1024) + " Ko";
          return (n / (1024 * 1024)).toFixed(1) + " Mo";
        };
        val.innerHTML = window.I18n.t("ui.refonte.stats_photos_count", { n: total, size: fmtBytes(totalSize) });
      }).catch(function() { /* silent */ });
    }

    // 🆕 v1.9.3-B1d+ : hydrate la section 📸 Photos en async (lecture IDB).
    // Format affiché : badge "N" + breakdown par point ("Puits du chêne · 3 photos").
    // Points sans photo ne sont pas listés (sinon trop verbeux pour des plans riches).
    _hydraterPhotosModaleSession(points);
  }

  // Helper : hydrate la section 📸 Photos de la modale détail session avec
  // les données IDB. Compte total + breakdown par point + taille agrégée.
  function _hydraterPhotosModaleSession(points) {
    const badge = document.getElementById("kta-refonte-session-photos-badge");
    const body  = document.getElementById("kta-refonte-session-photos-body");
    if (!badge || !body) return;

    if (!window.MyKTAMapPhotos) {
      badge.textContent = "0";
      body.textContent = window.I18n.t("ui.refonte.photos_storage_unavailable");
      return;
    }

    const planId = window._currentLoadedPlanId || "default";
    window.MyKTAMapPhotos.getAllPhotosForPlan(planId).then(function(arr) {
      const total = arr.length;
      badge.textContent = total;
      if (total === 0) {
        body.textContent = window.I18n.t("ui.refonte.photos_empty");
        return;
      }
      // Group par pointId pour breakdown
      const byPoint = {};
      let totalSize = 0;
      arr.forEach(function(rec) {
        const pid = String(rec.pointId || "");
        if (!byPoint[pid]) byPoint[pid] = { count: 0, size: 0 };
        byPoint[pid].count += 1;
        byPoint[pid].size  += rec.size || (rec.blob && rec.blob.size) || 0;
        totalSize += rec.size || (rec.blob && rec.blob.size) || 0;
      });
      // Map pointId → nom (depuis listePoints en session)
      const nomByPid = {};
      (points || []).forEach(function(p) {
        nomByPid[String(p.id || "")] = p.nom || p.id || window.I18n.t("ui.refonte.label_no_name");
      });
      // Format taille via le helper sessionExporter (déjà exposé)
      const fmt = window._kta_formatBytes || function(n) {
        if (n < 1024) return n + " o";
        if (n < 1024 * 1024) return Math.round(n / 1024) + " Ko";
        return (n / (1024 * 1024)).toFixed(1) + " Mo";
      };
      let html = '<ul class="kta-refonte-session-list">';
      Object.keys(byPoint).forEach(function(pid) {
        const stats = byPoint[pid];
        const nom = nomByPid[pid] || window.I18n.t("ui.refonte.label_point_not_found", { id: pid });
        const safeName = String(nom).replace(/[&<>"']/g, function(c) {
          return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
        });
        html += '<li>' +
          '<strong>' + safeName + '</strong>' +
          '<span class="kta-refonte-session-meta">' +
            window.I18n.t("ui.refonte.label_n_photos", { n: stats.count }) + ' · ' + fmt(stats.size) +
          '</span>' +
        '</li>';
      });
      html += '</ul>';
      html += '<div class="kta-refonte-session-meta" style="margin-top:8px; text-align:right;">' + window.I18n.t("ui.refonte.label_total") + ' <strong>' + fmt(totalSize) + '</strong></div>';

      body.className = "";  // retire la classe "empty"
      body.innerHTML = html;
    }).catch(function(e) {
      console.warn("[RefonteInterface] _hydraterPhotosModaleSession :", e);
      badge.textContent = "?";
      body.textContent = window.I18n.t("ui.refonte.photos_read_error");
    });
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
      // 🆕 v1.11.1 V2 : abonnement BatteryGuard une fois les chips DOM
      // créés (header + status bar). No-op silencieux si BatteryGuard
      // n'est pas dispo (Safari iOS).
      _setupBatteryHook();
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
      a.title = window.I18n.t("ui.refonte.btn_sidebar_collapse");
      a.setAttribute("aria-label", window.I18n.t("ui.refonte.btn_sidebar_collapse_aria", { side: side }));
      // État initial : déplié (5:b = pas de persistance, toujours
      // déroulée au boot) → icône ▾
      a.innerHTML = _iconeCollapse(side, false);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, "click", function(e) {
        L.DomEvent.stop(e);
        const isCollapsed = document.body.classList.toggle(cls);
        a.innerHTML = _iconeCollapse(side, isCollapsed);
        a.title = isCollapsed ? window.I18n.t("ui.refonte.btn_sidebar_expand") : window.I18n.t("ui.refonte.btn_sidebar_collapse");
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
  // 🐛 v1.68.1 (audit clés manquantes) : window.map existe AVANT tout plan
  // (Leaflet init tôt) → ce fallback construisait header + statusbar au
  // DOMContentLoaded, AVANT la fin du fetch des dicos i18n. Résultat :
  // 22 tooltips gravés en « humanisé » (« Btn home title »…) à vie, car
  // _creerHeaderBar ne se reconstruit jamais (early return si _headerEl).
  // → On attend la barrière I18n.init() (mémoïsée, cf langManager) avant.
  document.addEventListener("DOMContentLoaded", function() {
    if (!window.map) return;
    const ready = (window.I18n && typeof window.I18n.init === "function")
      ? window.I18n.init() : Promise.resolve();
    ready.then(function() { _setupQuandMapPrete(); });
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
        ? "🎨 " + window.I18n.t("ui.refonte.modal_switch_titre_new")
        : "📜 " + window.I18n.t("ui.refonte.modal_switch_titre_old");
      const labelCible = valueIsNouvelle
        ? window.I18n.t("ui.refonte.modal_switch_label_new")
        : window.I18n.t("ui.refonte.modal_switch_label_old");
      const description = valueIsNouvelle
        ? window.I18n.t("ui.refonte.modal_switch_desc_new")
        : window.I18n.t("ui.refonte.modal_switch_desc_old");

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
            '<button class="kta-panneau-close" type="button" id="kta-rint-close" aria-label="' + window.I18n.t("ui.refonte.btn_close_aria") + '">✕</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps" style="color:#c8d0e0;">' +
            '<p style="margin:0 0 14px 0; line-height:1.55;">' +
              window.I18n.t("ui.refonte.modal_switch_intro", { cible: '<strong style="color:#f4c542;">' + labelCible + '</strong>' }) +
            '</p>' +
            '<p style="margin:0 0 14px 0; line-height:1.55; font-size:13px; color:#8892a4;">' +
              description +
            '</p>' +
            '<div style="background:rgba(244,197,66,0.06); border:1px solid rgba(244,197,66,0.22); border-radius:8px; padding:10px 14px; margin-bottom:0;">' +
              '<div style="font-weight:600; color:#f4c542; margin-bottom:6px;">✅ ' + window.I18n.t("ui.refonte.modal_switch_preserved_titre") + '</div>' +
              '<ul style="margin:0; padding-left:20px; line-height:1.6;">' +
                '<li>' + window.I18n.t("ui.refonte.modal_switch_preserved_plans") + '</li>' +
                '<li>' + window.I18n.t("ui.refonte.modal_switch_preserved_sessions") + '</li>' +
                '<li>' + window.I18n.t("ui.refonte.modal_switch_preserved_prefs") + '</li>' +
                '<li>' + window.I18n.t("ui.refonte.modal_switch_preserved_access") + '</li>' +
              '</ul>' +
            '</div>' +
          '</div>' +
          '<div class="kta-readme-modal-footer" style="display:flex; gap:10px; justify-content:flex-end; border-top:1px solid rgba(255,255,255,0.06); padding:12px 18px; flex-shrink:0;">' +
            '<button class="kta-btn kta-btn-ghost" type="button" id="kta-rint-cancel">' + window.I18n.t("ui.refonte.btn_cancel") + '</button>' +
            '<button class="kta-btn kta-btn-primary" type="button" id="kta-rint-confirm" style="background:#f4c542; color:#0a0d18; border-color:#f4c542;">' + window.I18n.t("ui.refonte.btn_validate") + '</button>' +
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

  // 🐛 v1.34.14 — Retrait demande KARMA du banner console "Refonte UI v1
  // Nouvelle interface active...". La refonte est active depuis v1.8.1, plus
  // besoin de le rappeler en console à chaque boot.

})();
