/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// refonteInterface.js — couche d'interface du mode carte : header (titre, compteurs, boutons Histoire / OSM /
// Sortie d'urgence, batterie), status bar (mesures, distance totale, itinéraire, tracker), modale « 📊 Détails
// de la session » (stats, Carnet, favoris, mémoire, snapshots), boutons de réduction des sidebars.
// Toujours active (body.kta-refonte-v1) : l'ancienne interface n'existe plus, le flag legacy est nettoyé.
// Expose : window.RefonteInterface (isActive, setActive, updateCompteurs, refreshStatusBar),
//   window.ktaOuvrirDetailsSession, hooks main.js / interface.js : _refonteInterfaceActive,
//   _refonteInterfacePostInit, _refonteInterfacePreUnload, _refonteInterfaceCreerBoutonReduction{Left,Right}
// 🩸 --kta-statusbar-h suit la hauteur RÉELLE de la status bar (ResizeObserver) : la carte, la boussole et les
//   sidebars s'y calent, sinon le footer recouvre la carte quand il passe sur 2 lignes.
// Garde-fous : scripts/check-etat-visible.js, scripts/check-filets-donnees.js · Doc : docs/architecture/ui.md

(function() {
  "use strict";

  // ── Configuration ──────────────
  // Nouvelle interface imposée : LS_LEGACY est seulement nettoyé.
  const LS_LEGACY = "myktamap_legacy_interface";

  // Ancien flag opt-in `myktamap_refonte_v1`, devenu sans objet : supprimé.
  try {
    if (localStorage.getItem("myktamap_refonte_v1") === "1") {
      localStorage.removeItem("myktamap_refonte_v1");
    }
  } catch(e) {}

  // Lecture du flag : nettoie un flag legacy resté (sinon un cache navigateur laisserait l'utilisateur
  // coincé sur l'ancienne version morte).
  function _readFlag() {
    try { localStorage.removeItem(LS_LEGACY); } catch(e) {}
    return true;
  }

  // Gardée pour les appelants existants ; ne fait plus rien d'autre que nettoyer.
  function _writeFlag(value) {
    try { localStorage.removeItem(LS_LEGACY); } catch(e) {}
  }

  // Exposé tôt : interface.js le lit avant init (toujours true).
  window._refonteInterfaceActive = _readFlag();


  // Classe posée tout de suite : si on attend DOMContentLoaded, les éléments Leaflet sont placés sans elle et le
  // repaint est sale.
  function _ensureBodyClass() {
    if (document.body) {
      document.body.classList.add("kta-refonte-v1");
    } else {
      document.addEventListener("DOMContentLoaded", function() {
        document.body.classList.add("kta-refonte-v1");
      }, { once: true });
    }
  }
  _ensureBodyClass();

  // ── Header bar (sticky top, 40px) ──────────────
  // Créé seulement quand window.map existe (app initialisée).
  let _headerEl = null;
  // ⚠️ Ce que le header pose HORS de lui (écouteurs de window, minuterie) : retiré par _refonteInterfacePreUnload.
  // Le header est reconstruit à chaque ouverture de plan ; sans ce retrait, chaque ouverture laissait trois écouteurs
  // et une minuterie de 2 s de plus, qui retenaient l'ancien header détaché.
  let _headerNettoyages = [];
  function _ecouterWindow(type, fn) {
    window.addEventListener(type, fn);
    _headerNettoyages.push(function() { window.removeEventListener(type, fn); });
  }

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
        // Chip résumé 📊 visible UNIQUEMENT en mobile portrait (@media max-width: 480px) ; ailleurs, les 5 chips
        // individuels + batterie.
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
        // Compteur structures (piliers + murs)
        '<span class="kta-refonte-counter" id="kta-refonte-counter-structures" title="' + window.I18n.t("ui.refonte.counter_structures_title") + '">' +
          '<span class="kta-refonte-counter-icon">🏛️</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
        // Compteur photos : lecture async IDB dans updateCompteurs, masqué à 0 comme les autres.
        '<span class="kta-refonte-counter" id="kta-refonte-counter-photos" title="' + window.I18n.t("ui.refonte.counter_photos_title") + '">' +
          '<span class="kta-refonte-counter-icon">📸</span><span class="kta-refonte-counter-val">0</span>' +
        '</span>' +
      '</button>' +
      // Chip batterie HORS du bouton compteurs (n'hérite pas de sa surbrillance). Masqué jusqu'à ce que
      // BatteryGuard confirme l'API ; couleur posée par _refreshBatteryUi.
      // Bouton 📖 Mode Histoire, à GAUCHE de la batterie, toujours visible (js/modeHistoire.js).
      '<span class="kta-refonte-counter kta-refonte-counter-histoire" id="kta-refonte-counter-histoire" title="' + window.I18n.t("ui.refonte.counter_histoire_title") + '" role="button" tabindex="0">' +
        '<span class="kta-refonte-counter-icon">📖</span>' +
      '</span>' +
      // Bouton 🌍 Vue OSM : visible seulement si le plan a un géoréf GPS valide ET que l'utilisateur a activé la
      // vue. 🌍 et non 🗺️, déjà pris par Légende et Itinéraire.
      '<span class="kta-refonte-counter kta-refonte-counter-osm" id="kta-refonte-counter-osm" title="' + window.I18n.t("ui.refonte.counter_osm_title") + '" role="button" tabindex="0" style="display:none;">' +
        '<span class="kta-refonte-counter-icon">🌍</span>' +
      '</span>' +
      // Bouton 🚨 Sortie d'urgence (js/sortieUrgence.js)
      '<span class="kta-refonte-counter kta-refonte-counter-sortie" id="kta-refonte-counter-sortie" title="' + window.I18n.t("ui.refonte.counter_sortie_title") + '" role="button" tabindex="0">' +
        '<span class="kta-refonte-counter-icon">🚨</span>' +
      '</span>' +
      '<span class="kta-refonte-counter kta-refonte-counter-battery kta-refonte-header-battery" id="kta-refonte-counter-battery" title="' + window.I18n.t("ui.refonte.counter_battery_title") + '" style="display:none;">' +
        '<span class="kta-refonte-counter-icon" id="kta-refonte-battery-emoji">🔋</span><span class="kta-refonte-counter-val" id="kta-refonte-battery-val">—</span>' +
      '</span>';

    document.body.appendChild(header);
    _headerEl = header;

    const homeBtn = document.getElementById("kta-refonte-home");
    if (homeBtn) {
      homeBtn.addEventListener("click", function() {
        // Même modale charte que « Mes plans » (interface.js > _retourLoaderAvecConfirm) : loader direct si la
        // session n'a pas de modif, sinon « Changer de plan ».
        if (typeof window._retourLoaderAvecConfirm === "function") {
          window._retourLoaderAvecConfirm();
        } else if (typeof window.afficherLoader === "function") {
          // Repli si le helper n'est pas (encore) exposé
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

    // Bouton 📖 Mode Histoire ; clavier Enter/Space (span role="button" tabindex="0").
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

    // Bouton 🌍 Vue OSM (js/osmView.js). 🩸 Polling permanent 2 s (isAvailable ≈ 0,3 ms) : aucun événement
    // « plan config prêt » n'est émis, et un chargement > 3 s ferait rater un timeout. Couvre aussi le
    // changement de plan et l'activation sans événement.
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
      _refreshOsmVisibility();
      _ecouterWindow("kta:osmOptInChange", _refreshOsmVisibility);
      const minuterieOsm = setInterval(_refreshOsmVisibility, 2000);
      _headerNettoyages.push(function() { clearInterval(minuterieOsm); });
    }

    // Bouton 🚨 Sortie d'urgence : recherche de la sortie la plus proche (pathfinder).
    const sortieBtn = document.getElementById("kta-refonte-counter-sortie");
    if (sortieBtn) {
      function _openSortie() {
        if (window.SortieUrgence && typeof window.SortieUrgence.declencher === "function") {
          window.SortieUrgence.declencher();
        } else {
          // Un tap qui ne fait RIEN sur le bouton le plus vital fait perdre du temps : on le dit toujours.
          console.warn("[Refonte] SortieUrgence indisponible");
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(window.I18n.t("ui.refonte.sortie_indispo"), "error");
          }
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
        // Clic sur les compteurs → modale « 📊 Détails de la session »
        updateCompteurs();  // refresh des valeurs avant ouverture
        // Garde défensive : la fonction est déclarée plus bas dans le même IIFE (hoisting), mais un déploiement
        // partiel ou un cache SW périmé doit donner un message console clair plutôt qu'un crash silencieux.
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

    updateCompteurs();

    // Débordement du titre recalculé au resize / orientationchange (sans attendre le polling 2 s).
    let _resizeDeb = null;
    _ecouterWindow("resize", function() {
      // Debounce 80ms — sinon dispatch ×30/s pendant un drag-resize PC
      clearTimeout(_resizeDeb);
      _resizeDeb = setTimeout(_ajusterDebordementTitre, 80);
    });
    _ecouterWindow("orientationchange", function() {
      // 350 ms après orientationchange : laisser iOS finir sa transition de viewport
      setTimeout(_ajusterDebordementTitre, 350);
    });
  }

  // ── Mise à jour du header (nom du plan + compteurs) ──────────────
  function updateCompteurs() {
    if (!_headerEl) return;

    const pc = window.PLAN_CONFIG;
    const nameEl = document.getElementById("kta-refonte-plan-name");
    const verEl  = document.getElementById("kta-refonte-plan-version");
    if (nameEl && pc && pc.plan) {
      nameEl.textContent = pc.plan.name || window.I18n.t("ui.refonte.label_plan_default");
    }
    if (verEl && pc && pc.plan && pc.plan.version) {
      verEl.textContent = pc.plan.version;
    }

    // Compteurs : annotations de session seulement (pas les data layers).
    const nPoints     = (window.getEditorPoints && window.getEditorPoints() || []).length;
    const nRoads      = (window.getRoads        && window.getRoads()        || []).length;
    const nZones      = (window.getZones        && window.getZones()        || []).length;
    const nStructures = (window.getStructures   && window.getStructures()   || []).length;

    _setCounterVal("kta-refonte-counter-points",     nPoints);
    _setCounterVal("kta-refonte-counter-roads",      nRoads);
    _setCounterVal("kta-refonte-counter-zones",      nZones);
    _setCounterVal("kta-refonte-counter-structures", nStructures);

    // Chip résumé 📊 (mobile portrait) : total hors photos ; « · » plutôt qu'un 0 trompeur.
    const _totalSession = nPoints + nRoads + nZones + nStructures;
    const _summaryEl = document.getElementById("kta-refonte-counter-summary-val");
    if (_summaryEl) {
      _summaryEl.textContent = _totalSession > 0 ? String(_totalSession) : "·";
    }

    // Photos : async IDB (index `by_plan`), posé quand prêt ; reste à 0 sans MyKTAMapPhotos.
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

    // Débordement du titre après rAF : sinon scrollWidth/clientWidth sont ceux du frame précédent.
    requestAnimationFrame(_ajusterDebordementTitre);
  }

  // Titre trop long : on réaffiche la version, on mesure, on la cache (display:none) si ça déborde ; le CSS
  // text-overflow:ellipsis tronque ensuite le nom, « … » dans la couleur du titre.
  function _ajusterDebordementTitre() {
    const titleEl   = document.querySelector(".kta-refonte-header-title");
    const versionEl = document.getElementById("kta-refonte-plan-version");
    if (!titleEl || !versionEl) return;

    versionEl.style.display = "";

    // +1 de tolérance pour les arrondis sub-pixel
    if (titleEl.scrollWidth > titleEl.clientWidth + 1) {
      versionEl.style.display = "none";
    }
  }

  function _setCounterVal(parentId, val) {
    const parent = document.getElementById(parentId);
    if (!parent) return;
    const valEl = parent.querySelector(".kta-refonte-counter-val");
    if (valEl) valEl.textContent = val;
    parent.classList.toggle("kta-refonte-counter-empty", val === 0);
  }

  // ── Status bar (sticky bottom, repliable) ──────────────
  let _statusBarEl    = null;
  let _statusBarOpen  = true;  // ouverte par défaut

  // Q46 : ligne « ✅ Enregistré il y a 3 s » / « ❌ dernière sauvegarde en échec ».
  function _relatif(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + " s";
    const m = Math.round(s / 60);
    if (m < 60) return m + " min";
    return Math.round(m / 60) + " h";
  }
  function _ligneDerniereSauvegarde() {
    if (!window.SessionPersist || typeof window.SessionPersist.getLastSaveInfo !== "function") return "";
    let info = null;
    try { info = window.SessionPersist.getLastSaveInfo(); } catch(e) { return ""; }
    if (!info) return "";
    let txt, cls;
    if (info.ko)       { txt = window.I18n.t("ui.refonte.save_ko");    cls = "kta-refonte-save-ko"; }
    else if (info.ts)  { txt = window.I18n.t("ui.refonte.save_ok", { t: _relatif(Date.now() - info.ts) }); cls = "kta-refonte-save-ok"; }
    else               { txt = window.I18n.t("ui.refonte.save_never"); cls = "kta-refonte-save-never"; }
    return '<div class="kta-refonte-save-line ' + cls + '">' + txt + '</div>';
  }

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
        // Stat itinéraire cliquable : rouvre la modale itinéraire.
        '<span class="kta-refonte-stat kta-refonte-stat-empty kta-refonte-stat-clickable" id="kta-refonte-stat-iti" title="' + window.I18n.t("ui.refonte.stat_iti_title") + '">' +
          '<span class="kta-refonte-stat-icon">🗺️</span><span class="kta-refonte-stat-val">—</span>' +
        '</span>' +
        // Tracker = boussole 🧭 (pas 🚶, confondu avec le badge marche de l'itinéraire), ON vert / OFF rouge.
        // Cliquable (menu Tracker) ; suivi actif → pas + distance en direct.
        '<span class="kta-refonte-stat kta-refonte-stat-tracker-off kta-refonte-stat-clickable" id="kta-refonte-stat-tracker">' +
          '<span class="kta-refonte-stat-icon">🧭</span><span class="kta-refonte-stat-val">OFF</span>' +
        '</span>' +
        // Compte à rebours « verrou sur tracé suspendu », caché par défaut, piloté par interface.js
        // (_afficherBadgeVerrou / _majBadgeVerrou / _reactiverVerrou). Clic → réactive le verrou.
        '<span class="kta-refonte-stat kta-refonte-stat-clickable" id="kta-refonte-stat-verrou" style="display:none; color:var(--kta-accent-texte);" title="' + window.I18n.t("tracker.verrou.statTitle") + '">' +
          '<span class="kta-refonte-stat-icon">🔓</span><span class="kta-refonte-stat-val">—</span>' +
        '</span>' +
        // Pas de batterie dans le footer : le chip du header suffit (le mode urgence a son propre bloc XL).
      '</div>' +
      '<button class="kta-refonte-statusbar-toggle" id="kta-refonte-statusbar-toggle" title="' + window.I18n.t("ui.refonte.statusbar_toggle_title") + '" aria-label="' + window.I18n.t("ui.refonte.statusbar_toggle_aria") + '">▾</button>';

    document.body.appendChild(bar);
    _statusBarEl = bar;

    const toggleBtn = document.getElementById("kta-refonte-statusbar-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", _toggleStatusBar);
    }

    // Clic sur la stat itinéraire → modale itinéraire, seulement si un itinéraire est actif.
    // Le chip 🧭 ouvre le menu Tracker.
    const trackerStat = document.getElementById("kta-refonte-stat-tracker");
    if (trackerStat) {
      trackerStat.addEventListener("click", function() {
        if (typeof window.ouvrirMenuTracker === "function") window.ouvrirMenuTracker();
      });
    }

    const itiStat = document.getElementById("kta-refonte-stat-iti");
    if (itiStat) {
      itiStat.addEventListener("click", function() {
        // Stat vide (« — ») : clic ignoré (cursor: default côté CSS)
        if (itiStat.classList.contains("kta-refonte-stat-empty")) return;
        if (typeof window.ouvrirItinerairModal === "function") {
          window.ouvrirItinerairModal();
        }
      });
    }

    refreshStatusBar();

    // ResizeObserver : `--kta-statusbar-h` = hauteur RÉELLE de la barre (2 lignes sur petit écran, rotation,
    // repli ▾▴). Sans ça, le footer recouvre la carte et la boussole. Consommateurs : #map { bottom },
    // .kta-compass-widget, .leaflet-top { max-height }, .kta-readme-modal-overlay { padding-bottom }.
    _setupStatusBarResizeObserver();
  }

  let _statusBarRO = null;
  let _rotationEcoutee = false;

  // 🩸 _syncH vit au scope du MODULE : _onOrientationChange l'appelle (locale, elle lèverait une ReferenceError
  // à la rotation). offsetHeight inclut le padding, donc env(safe-area-inset-bottom). Écrit sur :root.
  function _syncH() {
    if (!_statusBarEl) return;
    const h = _statusBarEl.offsetHeight;
    if (h > 0) {
      document.documentElement.style.setProperty("--kta-statusbar-h", h + "px");
    }
    // Prévenir Leaflet (rAF), sinon les tuiles hors zone attendent la prochaine interaction.
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

    // Synchro immédiate (et repli sans ResizeObserver : chargement + orientationchange/resize).
    _syncH();
    // Une seule fois pour la page : _onOrientationChange relit la barre COURANTE (_syncH > _statusBarEl).
    if (_rotationEcoutee) return;
    _rotationEcoutee = true;
    window.addEventListener("orientationchange", _onOrientationChange);
    // pageshow : retour depuis une autre app, où iOS peut avoir « oublié » la bonne viewport.
    window.addEventListener("pageshow", function(e) {
      // persisted = page restaurée depuis le bfcache
      if (e.persisted) _onOrientationChange();
    });
  }

  // iOS PWA : la status bar système, masquée en paysage, ne revient pas toujours en portrait (aucune API pour la
  // forcer). Deux contournements empilés, 600 ms après la rotation : scrollTo(+1, 0) et réécriture identique de
  // la meta viewport. ⚠️ Ne PAS toucher à body.kta-refonte-v1 (ça empire le bug).
  function _onOrientationChange() {
    setTimeout(_syncH, 100);
    setTimeout(_syncH, 350);

    setTimeout(function() {
      try {
        const sx = window.scrollX || 0;
        const sy = window.scrollY || 0;
        window.scrollTo(sx, sy + 1);
        requestAnimationFrame(function() {
          window.scrollTo(sx, sy);
        });

        // Contournement 2 : réécrire la meta viewport à l'identique (iOS recalcule)
        const meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
          const content = meta.getAttribute("content");
          if (content) {
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

  function refreshStatusBar() {
    if (!_statusBarEl) return;

    // ── Mesure (distance et/ou surface) ──
    // Une seule icône statique : distance seule → 📐 « 143 m » ; surface seule → ⬛ « 4433 m² » ; les deux →
    // 📐 « 143 m · ⬛ 4433 m² » (pas de 📐 en double).
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
      _setStat("kta-refonte-stat-mesure", valD + " · ♦️ " + valS);
    } else if (valS) {
      if (mesureIconEl) mesureIconEl.textContent = "♦️";
      _setStat("kta-refonte-stat-mesure", valS);
    } else if (valD) {
      if (mesureIconEl) mesureIconEl.textContent = "📐";
      _setStat("kta-refonte-stat-mesure", valD);
    } else {
      if (mesureIconEl) mesureIconEl.textContent = "📐";  // reset défaut quand vide
      _setStat("kta-refonte-stat-mesure", null);
    }

    // ── Distance totale ──
    // Lue par window.getDistanceTotaleStatus() (état du surlignage), pas dans le DOM de la modale : la stat
    // reste tant que le surlignage est visible, modale fermée.
    if (typeof window.getDistanceTotaleStatus === "function") {
      const dtStatus = window.getDistanceTotaleStatus();
      if (dtStatus) {
        _setStat("kta-refonte-stat-dist-totale", _formatDist(dtStatus.totalM));
      } else {
        _setStat("kta-refonte-stat-dist-totale", null);
      }
    } else {
      // Repli si l'API n'est pas exposée
      const rdMeta = document.querySelector("#kta-rd-modal .kta-rd-total-value");
      if (rdMeta && rdMeta.textContent) {
        _setStat("kta-refonte-stat-dist-totale", rdMeta.textContent.trim());
      } else {
        _setStat("kta-refonte-stat-dist-totale", null);
      }
    }

    // ── Itinéraire (lu sur le L.control existant) ──
    const itiCtrlText = document.querySelector(".kta-iti-distance");
    if (itiCtrlText && itiCtrlText.textContent) {
      _setStat("kta-refonte-stat-iti", itiCtrlText.textContent.trim().replace(/^🗺️\s*/, ""));
    } else {
      _setStat("kta-refonte-stat-iti", null);
    }

    // ── Tracker : toujours visible, ON vert / OFF rouge (classes -tracker-on / -tracker-off, jamais « — ») ──
    const trackerEl = document.getElementById("kta-refonte-stat-tracker");
    if (trackerEl) {
      const valEl = trackerEl.querySelector(".kta-refonte-stat-val");
      const trackerActif = !!(window.getTrackingActif && window.getTrackingActif());
      trackerEl.classList.toggle("kta-refonte-stat-tracker-on", trackerActif);
      trackerEl.classList.toggle("kta-refonte-stat-tracker-off", !trackerActif);
      // Retire une classe "empty" qui traînerait
      trackerEl.classList.remove("kta-refonte-stat-empty");
      if (valEl) {
        // « ON · 👣 128 · 96 m » : pas et distance en direct.
        let txt = trackerActif ? "ON" : "OFF";
        if (trackerActif) {
          try {
            const pas  = (typeof window.getStepCount === "function") ? (window.getStepCount() || 0) : 0;
            const dist = (typeof window.getTrackingDistanceTotaleM === "function") ? (window.getTrackingDistanceTotaleM() || 0) : 0;
            if (pas > 0 || dist > 0) {
              txt += " · 👣 " + pas + " · " + (window.formatDistance ? window.formatDistance(dist, 0) : Math.round(dist) + " m");
            }
          } catch(e) {}
        }
        valEl.textContent = txt;
      }
      trackerEl.title = trackerActif
        ? window.I18n.t("ui.refonte.tracker_on_title")
        : window.I18n.t("ui.refonte.tracker_off_title");
    }
    // La pastille du bouton ≡ suit aussi les changements de niveau faits ailleurs (sélecteur, jonction).
    if (window.FilterPanel && typeof window.FilterPanel.majBadge === "function") {
      try { window.FilterPanel.majBadge(); } catch(e) {}
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

  // ── UI batterie ──────────────
  // À chaque événement Battery API + un forceCheck() initial.
  function _refreshBatteryUi(state) {
    // Sans API (Safari iOS, Firefox) : le chip du header reste masqué (décision produit). C'est le SEUL
    // affichage batterie.
    if (!state || state.available === false) {
      const chip = document.getElementById("kta-refonte-counter-battery");
      if (chip) chip.style.display = "none";
      return;
    }

    const titleText =
      window.I18n.t("ui.refonte.battery_title", { label: state.label }) +
      (state.charging ? window.I18n.t("ui.refonte.battery_charging_suffix") : "");

    const chip = document.getElementById("kta-refonte-counter-battery");
    if (chip) {
      // removeProperty + "flex" explicite : style.display = "" ne bat pas toujours le display:none inline.
      chip.style.removeProperty("display");
      chip.style.display = "flex";
      const emojiEl = document.getElementById("kta-refonte-battery-emoji");
      const valEl   = document.getElementById("kta-refonte-battery-val");
      if (emojiEl) emojiEl.textContent = state.emoji;
      if (valEl)   valEl.textContent   = state.label;
      chip.style.color = state.color;
      chip.title = titleText;
    }
  }

  // Abonnement BatteryGuard, une seule fois (_batteryHooked) même si header / status bar sont recréés.
  let _batteryHooked = false;
  function _setupBatteryHook() {
    if (_batteryHooked) return;
    if (!window.BatteryGuard || typeof window.BatteryGuard.onChange !== "function") {
      setTimeout(_setupBatteryHook, 500);
      return;
    }
    _batteryHooked = true;
    window.BatteryGuard.onChange(_refreshBatteryUi);
    // Trois synchros directes (_peek → _refreshBatteryUi, pas forceCheck → notify) : l'init async de
    // BatteryGuard peut finir avant ou après l'accroche de l'écouteur.
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

  // ── Polling léger : compteurs / status bar toutes les 2 s ──────────────
  // Pas d'écoute des setters de l'app (découplage) ; 2 s suffit, calculs O(N) sur des tableaux courts.
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

  // ── Modale « 📊 Détails de la session » ──────────────
  // Ouverte au clic sur les compteurs : stats agrégées en tête (barres, Copier / Exporter TXT), puis points,
  // tracés, zones, mesures, itinéraire, tracker, Carnet, favoris, mémoire, snapshots.

  // Libellés via LegendCustomization (cascade session > plan > défaut) : un type renommé l'est aussi ici.
  // Entrées custom (cust-…) préfixées ✨. category : "icones" | "traces" | "zones" | "structures" ;
  // fallback : libellé de secours si LC absent ou type inconnu.
  function _lcLabel(category, type, fallback) {
    if (typeof type !== "string" || !type) return fallback || "?";
    if (type.indexOf("cust-") === 0) {
      if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
        try {
          const e = window.LegendCustomization.findCustomEntry(type);
          if (e && e.label) return "✨ " + e.label;
        } catch(err) {}
      }
      return fallback || type;
    }
    if (window.LegendCustomization && typeof window.LegendCustomization.getLabel === "function") {
      try {
        const lbl = window.LegendCustomization.getLabel(category, type);
        if (lbl) return lbl;
      } catch(err) {}
    }
    return fallback || type;
  }

  // ── Stats agrégées ──
  function _calculerStatsAggregees(points, roads, zones, structures, mesure, scale) {
    const stats = {
      points: { total: points.length, byTag: {} },
      roads:  { total: 0, distM: 0, byType: {} },
      zones:  { total: zones.length, areaM2: 0, byType: {} },
      structures: { total: structures.length, byType: {}, fronts_totalM: 0 },
      photos: { total: 0, sizeMo: 0 },   // hydraté async
      tracker:    { active: false, distM: 0 },
      // mesure = { distance (polyline), surface (polygone) }
      mesure:     { distance: { points: 0, distM: 0 }, surface: { points: 0, areaM2: 0 } },
      session:    { durationMs: 0 },
      // Multi-niveau (rempli plus bas si MLVL)
      byLevel: null
    };

    // Durée de session (window._sessionStartTs, posé par main.js > lancerApplication)
    if (typeof window._sessionStartTs === "number") {
      stats.session.durationMs = Date.now() - window._sessionStartTs;
    }

    // Points par tag (1er tag = catégorie principale)
    points.forEach(function(p) {
      const tag = (Array.isArray(p.tags) && p.tags.length > 0) ? p.tags[0] : "(sans tag)";
      stats.points.byTag[tag] = (stats.points.byTag[tag] || 0) + 1;
    });

    // Roads : distance + détail par type (sans "itinerary", calcul du Pathfinder)
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

    structures.forEach(function(s) {
      const t = s.type || "?";
      if (!stats.structures.byType[t]) stats.structures.byType[t] = { nb: 0, areaM2: 0, longM: 0 };
      stats.structures.byType[t].nb += 1;
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

    // Deux mesures indépendantes : `mesure` (polyline) + window.getMeasurePointsSurface() (polygone).
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

  function _formatDurationStats(ms) {
    if (typeof ms !== "number" || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    if (m < 60) return m + " min" + (s % 60 > 0 ? " " + (s % 60) + "s" : "");
    const h = Math.floor(m / 60);
    return h + "h" + (m % 60 > 0 ? " " + (m % 60) + "min" : "");
  }

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

  // HTML du bloc « 📊 Stats agrégées », en TÊTE de la modale
  function _genererStatsAggregeesHTML(stats, multiLevel) {
    let h = '<div class="kta-refonte-stats-aggr">';
    h += '<div class="kta-refonte-stats-aggr-titre">📊 ' + window.I18n.t("ui.refonte.stats_aggr_titre") + '</div>';

    h += '<div class="kta-refonte-stats-row">';
    h += '<span class="kta-refonte-stats-label">⏱️ ' + window.I18n.t("ui.refonte.stats_duration") + '</span>';
    h += '<span class="kta-refonte-stats-val">' + _formatDurationStats(stats.session.durationMs) + '</span>';
    h += '</div>';

    // Couleurs des barres via le styleResolver : les types custom prennent leur vraie couleur. ⚠️ Déclaré ICI,
    // avant les blocs tracés ET zones (`const` à portée de bloc).
    const _barColor = function(cat, t) {
      return (typeof window.ktaSwatchColor === "function" && window.ktaSwatchColor(cat, t)) || "#888";
    };

    if (stats.roads.total > 0) {
      h += '<div class="kta-refonte-stats-row">';
      h += '<span class="kta-refonte-stats-label">🛣 ' + window.I18n.t("ui.refonte.section_roads") + '</span>';
      h += '<span class="kta-refonte-stats-val"><strong>' + _fdistStats(stats.roads.distM) + '</strong> ' + window.I18n.t("ui.refonte.stats_on_n_roads", { n: stats.roads.total }) + '</span>';
      h += '</div>';
      const totalRoadDist = stats.roads.distM || 1;
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
        h += '<div class="kta-refonte-stats-bar"><div class="kta-refonte-stats-bar-fill" style="width:' + pct.toFixed(1) + '%; background:' + _barColor("traces", t) + ';"></div></div>';
        h += '<span class="kta-refonte-stats-bar-val">' + _fdistStats(s.distM) + '</span>';
        h += '</div>';
      });
    }

    if (stats.zones.total > 0) {
      h += '<div class="kta-refonte-stats-row" style="margin-top:8px;">';
      h += '<span class="kta-refonte-stats-label">⬛ ' + window.I18n.t("ui.refonte.section_zones") + '</span>';
      h += '<span class="kta-refonte-stats-val"><strong>' + _fsurfStats(stats.zones.areaM2) + '</strong> ' + window.I18n.t("ui.refonte.stats_on_n_zones", { n: stats.zones.total }) + '</span>';
      h += '</div>';
      const totalArea = stats.zones.areaM2 || 1;
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
        h += '<div class="kta-refonte-stats-bar"><div class="kta-refonte-stats-bar-fill" style="width:' + pct.toFixed(1) + '%; background:' + _barColor("zones", t) + ';"></div></div>';
        h += '<span class="kta-refonte-stats-bar-val">' + _fsurfStats(z.areaM2) + '</span>';
        h += '</div>';
      });
    }

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

    // Photos : hydraté async dans _afficherModaleSessionDetail
    h += '<div class="kta-refonte-stats-row" id="kta-stats-photos-row" style="margin-top:8px; display:none;">';
    h += '<span class="kta-refonte-stats-label">📸 ' + window.I18n.t("ui.refonte.section_photos") + '</span>';
    h += '<span class="kta-refonte-stats-val" id="kta-stats-photos-val">…</span>';
    h += '</div>';

    if (stats.tracker.active) {
      h += '<div class="kta-refonte-stats-row" style="margin-top:8px;">';
      h += '<span class="kta-refonte-stats-label">🚶 ' + window.I18n.t("ui.refonte.section_tracker") + '</span>';
      h += '<span class="kta-refonte-stats-val">' + window.I18n.t("ui.refonte.stats_tracker_active", { dist: _fdistStats(stats.tracker.distM) }) + '</span>';
      h += '</div>';
    }

    if (stats.mesure.distance.points >= 2) {
      h += '<div class="kta-refonte-stats-row">';
      h += '<span class="kta-refonte-stats-label">📐 ' + window.I18n.t("ui.refonte.stats_mesure_distance") + '</span>';
      h += '<span class="kta-refonte-stats-val">' + _fdistStats(stats.mesure.distance.distM) + ' (' + window.I18n.t("ui.refonte.stats_n_pts", { n: stats.mesure.distance.points }) + ')</span>';
      h += '</div>';
    }
    if (stats.mesure.surface.points >= 3) {
      const surfTxt = (typeof window.formatSurface === "function")
        ? window.formatSurface(stats.mesure.surface.areaM2, 1)
        : (stats.mesure.surface.areaM2.toFixed(1) + " m²");
      h += '<div class="kta-refonte-stats-row">';
      h += '<span class="kta-refonte-stats-label">♦️ ' + window.I18n.t("ui.refonte.stats_mesure_surface") + '</span>';
      h += '<span class="kta-refonte-stats-val">' + surfTxt + ' (' + window.I18n.t("ui.refonte.stats_n_pts", { n: stats.mesure.surface.points }) + ')</span>';
      h += '</div>';
    }

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

    h += '<div class="kta-refonte-stats-actions">';
    h += '<button class="kta-btn kta-btn-ghost" id="kta-stats-copier" type="button">📋 ' + window.I18n.t("ui.refonte.btn_copy") + '</button>';
    h += '<button class="kta-btn kta-btn-ghost" id="kta-stats-exporter" type="button">📤 ' + window.I18n.t("ui.refonte.btn_export_txt") + '</button>';
    h += '</div>';

    h += '</div>';  // .kta-refonte-stats-aggr
    return h;
  }

  // Résumé TXT/MD (boutons Copier + Exporter)
  function _genererStatsAggregeesTXT(stats, planName, multiLevel) {
    const lines = [];
    lines.push("# 📊 " + window.I18n.t("ui.refonte.export_titre"));
    if (planName) lines.push(window.I18n.t("ui.refonte.export_plan", { name: planName }));
    lines.push(window.I18n.t("ui.refonte.export_date", { date: new Date().toLocaleString(window.ktaLocale ? window.ktaLocale() : "fr-FR") }));
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
    if (stats.mesure.distance.points >= 2) {
      lines.push("## 📐 " + window.I18n.t("ui.refonte.export_mesure_distance_titre"));
      lines.push(window.I18n.t("ui.refonte.export_mesure_distance", { dist: _fdistStats(stats.mesure.distance.distM), n: stats.mesure.distance.points }));
      lines.push("");
    }
    if (stats.mesure.surface.points >= 3) {
      const surfTxt = (typeof window.formatSurface === "function")
        ? window.formatSurface(stats.mesure.surface.areaM2, 1)
        : (stats.mesure.surface.areaM2.toFixed(1) + " m²");
      lines.push("## ♦️ " + window.I18n.t("ui.refonte.export_mesure_surface_titre"));
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

  // Le quota IndexedDB se lit en asynchrone : la section s'affiche avec la dernière mesure connue, puis se
  // redessine en place avec une mesure fraîche.
  function _htmlMemoireSessions() {
    const st = window.KtaSessionStore;
    if (st && st.mode() === "idb" && typeof st.actualiserEstimation === "function") {
      st.actualiserEstimation().then(function () {
        const el = document.getElementById("kta-refonte-session-memoire");
        if (el) el.outerHTML = _htmlMemoireSessionsMesure();
      }).catch(function () { /* garde l'affichage */ });
    }
    return _htmlMemoireSessionsMesure();
  }

  function _htmlMemoireSessionsMesure() {
    const S = window.ktaStockageLocal;
    if (!S) return "";
    const m = S.mesurer();
    const pct = Math.min(100, Math.round(m.ratio * 100));
    const niveau = m.ratio >= 0.95 ? "plein" : (m.ratio >= S.SEUIL_ALERTE ? "presque" : "ok");
    const esc = window.ktaEsc;
    const plans = (window.PlanRegistry && window.PlanRegistry.getAll) ? window.PlanRegistry.getAll() : [];
    const nomDe = function (id) {
      const p = plans.find(function (x) { return x && x.id === id; });
      return p && p.name ? p.name : window.I18n.t("ui.refonte.memoire_plan_inconnu");
    };
    let h = '<div class="kta-refonte-session-section" id="kta-refonte-session-memoire">';
    h += '<div class="kta-refonte-session-section-titre">💾 ' + window.I18n.t("ui.refonte.section_memoire") +
         ' <span class="kta-refonte-session-badge kta-memoire-' + niveau + '">' + pct + ' %</span></div>';
    h += '<div class="kta-memoire-jauge"><div class="kta-memoire-barre kta-memoire-' + niveau +
         '" style="width:' + pct + '%"></div></div>';
    // IndexedDB (normal) : quota du site, part de l'espace libre de l'appareil. Repli localStorage : ~5 Mo.
    const idb = m.mode === "idb";
    const cleOccupe = idb ? (m.limite ? "ui.refonte.memoire_occupe_idb" : "ui.refonte.memoire_occupe_idb_sans") : "ui.refonte.memoire_occupe";
    h += '<div class="kta-memoire-legende">' + esc(window.I18n.t(cleOccupe,
         { occupe: S.mo(m.car), limite: m.limite ? S.mo(m.limite) : "", sessions: S.mo(m.carSessions || 0) })) + '</div>';
    if (niveau !== "ok") {
      h += '<div class="kta-memoire-conseil kta-tx-' + (niveau === "plein" ? "err" : "warn") + '">' +
           esc(window.I18n.t(idb ? "ui.refonte.memoire_conseil_idb" : "ui.refonte.memoire_conseil")) + '</div>';
    }
    const lourds = m.sessions.slice(0, 5);
    if (lourds.length) {
      h += '<ul class="kta-memoire-plans">';
      lourds.forEach(function (x) {
        const courant = x.planId === window._currentLoadedPlanId;
        h += '<li><span>' + (courant ? "📍 " : "") + esc(nomDe(x.planId)) + '</span><b>' + esc(S.mo(x.car)) + '</b></li>';
      });
      h += '</ul>';
    }
    h += '<div class="kta-memoire-legende">' + esc(window.I18n.t(idb ? "ui.refonte.memoire_autres_idb" : "ui.refonte.memoire_autres",
         { autres: S.mo(m.autres) })) + '</div>';
    return h + '</div>';
  }

  // Ouverture depuis l'alerte « mémoire des sessions » (sessionPersist.js) : ouvre, ne referme jamais.
  window.ktaOuvrirDetailsSession = function () {
    if (!document.getElementById("kta-refonte-session-modal")) _afficherModaleSessionDetail();
  };

  const SEUIL_REPLI_SESSION = 8;   // lignes au-delà desquelles une section de la modale arrive repliée

  function _afficherModaleSessionDetail() {
    const existing = document.getElementById("kta-refonte-session-modal");
    if (existing) { existing.remove(); return; }

    const points     = (window.getEditorPoints  && window.getEditorPoints()  || []);
    const roads      = (window.getRoads         && window.getRoads()         || []);
    const zones      = (window.getZones         && window.getZones()         || []);
    const structures = (window.getStructures    && window.getStructures()    || []);
    const mesure     = (window.getMeasurePoints && window.getMeasurePoints() || []);
    const scale   = (window.APP_CONFIG && window.APP_CONFIG.scale) || 1;
    const multiLevel = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel);

    function _esc(s) { return window.ktaEsc(s); }
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

    // Sections repliables : une liste longue (1000+ points) ne doit pas noyer le reste de la modale.
    // Ouverte d'office jusqu'à SEUIL_REPLI_SESSION lignes, repliée au-delà ; le badge garde le total.
    function _debutSection(titre, badge, nbLignes) {
      const ouvert = nbLignes <= SEUIL_REPLI_SESSION ? ' open' : '';
      return '<details class="kta-refonte-session-section kta-session-repli"' + ouvert + '>' +
        '<summary class="kta-refonte-session-section-titre">' + titre +
        ' <span class="kta-refonte-session-badge">' + badge + '</span></summary>';
    }
    function _nbTypes(arr) {
      const vus = {};
      arr.forEach(function (o) { vus[o.type || "?"] = 1; });
      return Object.keys(vus).length;
    }

    // ── Stats agrégées en tête ──
    const _stats = _calculerStatsAggregees(points, roads, zones, structures, mesure, scale);
    let html = _genererStatsAggregeesHTML(_stats, multiLevel);

    // Lien vers les Stats globales du plan (session + data layers ; cette modale = session seule)
    html += '<div class="kta-refonte-session-cta-stats-glob">' +
              '<button type="button" class="kta-btn kta-btn-primary" id="kta-refonte-session-open-stats-glob">' +
                '📊 ' + window.I18n.t("ui.refonte.modal_cta_stats_glob") +
              '</button>' +
            '</div>';

    // « Enregistré il y a N s » en tête.
    html += _ligneDerniereSauvegarde();

    html += _debutSection('📍 ' + window.I18n.t("ui.refonte.section_points_added"), points.length, points.length);
    if (points.length === 0) {
      html += '<div class="kta-refonte-session-empty">' + window.I18n.t("ui.refonte.empty_points") + '</div>';
    } else {
      html += '<ul class="kta-refonte-session-list">';
      points.forEach(function(p) {
        const rawTag = Array.isArray(p.tags) && p.tags.length > 0 ? p.tags[0] : "";
        // Libellé par LC (cascade) ; repli tag brut ; « — » sans tag.
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
    html += '</details>';

    const roadsNonIti = roads.filter(function(r) { return r.type !== "itinerary"; });
    const itineraire  = roads.find(function(r) { return r.type === "itinerary"; });
    html += _debutSection('🛣 ' + window.I18n.t("ui.refonte.section_roads"), roadsNonIti.length, _nbTypes(roadsNonIti));
    if (roadsNonIti.length === 0) {
      html += '<div class="kta-refonte-session-empty">' + window.I18n.t("ui.refonte.empty_roads") + '</div>';
    } else {
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
    html += '</details>';

    html += _debutSection('⬛ ' + window.I18n.t("ui.refonte.section_zones"), zones.length, _nbTypes(zones));
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
        // Libellé par LC ; emoji en suffixe (LC.getLabel rend le texte seul).
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
    html += '</details>';

    html += _debutSection('🏛️ ' + window.I18n.t("ui.refonte.section_structures"), structures.length,
                          _nbTypes(structures));
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
    html += '</details>';

    // Photos : « Chargement… » puis hydratation async (total, taille, détail par point)
    // Ouverte pendant le chargement ; _hydraterPhotosModaleSession la replie au-delà de SEUIL_REPLI_SESSION.
    html += '<details class="kta-refonte-session-section kta-session-repli" id="kta-refonte-session-photos-section" open>';
    html += '<summary class="kta-refonte-session-section-titre">📸 ' + window.I18n.t("ui.refonte.section_photos") + ' <span class="kta-refonte-session-badge" id="kta-refonte-session-photos-badge">…</span></summary>';
    html += '<div id="kta-refonte-session-photos-body" class="kta-refonte-session-empty">' + window.I18n.t("ui.refonte.loading") + '</div>';
    html += '</details>';

    const tFoo = !!(window.getTrackingPosition && window.getTrackingPosition());
    const mesureSurfDetail = (window.getMeasurePointsSurface && window.getMeasurePointsSurface()) || [];
    const hasMesureDist = mesure.length >= 2;
    const hasMesureSurf = mesureSurfDetail.length >= 3;
    if (hasMesureDist || hasMesureSurf || itineraire || tFoo) {
      html += '<div class="kta-refonte-session-section">';
      html += '<div class="kta-refonte-session-section-titre">📊 ' + window.I18n.t("ui.refonte.section_other_measures") + '</div>';
      html += '<ul class="kta-refonte-session-list">';

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

      if (hasMesureSurf) {
        const surfM2 = (typeof window.polygonAreaM2 === "function")
          ? (window.polygonAreaM2(mesureSurfDetail) || 0)
          : 0;
        const surfTxt = (typeof window.formatSurface === "function")
          ? window.formatSurface(surfM2, 1)
          : (surfM2 < 10000 ? Math.round(surfM2) + " m²" : (surfM2 / 10000).toFixed(2) + " ha");
        html += '<li>' +
          '<strong>♦️ ' + window.I18n.t("ui.refonte.item_mesure_surface") + '</strong>' +
          '<span class="kta-refonte-session-meta">' + surfTxt + ' (' + window.I18n.t("ui.refonte.label_n_vertices", { n: mesureSurfDetail.length }) + ')</span>' +
        '</li>';
      }

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

    // ── Le Carnet : sortie en cours ──
    // Clôture MANUELLE possible à tout moment (l'archivage auto se fait au teardown du plan) : la sortie est
    // gardée sans seuil et une nouvelle repart sur le même plan.
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
        // Nature annoncée EN DIRECT (sortie ou travail sur plan), pas découverte après coup.
        const terrain = (cur.type === "terrain");
        html += '<div style="font-size:12px; color:var(--kta-texte-3); margin-bottom:8px; line-height:1.5;">' +
                  (terrain
                    ? window.I18n.t("jrn.section.encours", {
                        duree: duree, dist: window.formatDistance(cur.distM || 0, 0), n: nbAj })
                    : window.I18n.t("jrn.section.encoursBureau", { duree: duree, n: nbAj }));
        // Part ESTIMÉE (« 📍 Je suis ici », réseau ou vol d'oiseau) annoncée à part, jamais noyée dans le total.
        if (terrain && (cur.distEstimeeM || 0) > 0) {
          html += ' <span style="color:var(--kta-interaction);">' +
                    window.I18n.t("jrn.section.dontEstime", {
                      dist: window.formatDistance(cur.distEstimeeM, 0) }) +
                  '</span>';
        }
        html += '</div>';
        // Correction du classement depuis l'écran plan : pose `typeManuel`, plus de recalcul auto.
        html += '<div style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">' +
                  '<span style="font-size:11px; color:var(--kta-texte-3);">' +
                    window.I18n.t("jrn.section.natureLabel") + '</span>' +
                  '<button type="button" class="kta-btn kta-btn-small ' +
                    (terrain ? 'kta-btn-primary' : 'kta-btn-ghost') + '" data-kta-jrn-type="terrain"' +
                    ' id="kta-refonte-session-carnet-type-terrain">🚶</button>' +
                  '<button type="button" class="kta-btn kta-btn-small ' +
                    (terrain ? 'kta-btn-ghost' : 'kta-btn-primary') + '" data-kta-jrn-type="bureau"' +
                    ' id="kta-refonte-session-carnet-type-bureau">🖥️</button>' +
                  (cur.typeManuel
                    ? '<span style="font-size:11px; color:var(--kta-texte-3);">' +
                        window.I18n.t("jrn.section.natureFigee") + '</span>'
                    : '') +
                '</div>';
      } else {
        // Sans sortie en cours, on DIT comment en ouvrir une (carnet décoché compris).
        html += '<div style="font-size:12px; color:var(--kta-texte-3); margin-bottom:8px; line-height:1.5;">' +
                  window.I18n.t("jrn.section.aucune") + ' ' +
                  window.I18n.t("jrn.section.aucuneHint") +
                '</div>';
      }
      // Affiner : distance ET tracé recalculés le long des galeries. Grisé (pas masqué) quand rien à affiner.
      const nbAAffiner = (typeof window.getTrackingTronconsAAffiner === "function")
        ? window.getTrackingTronconsAAffiner() : 0;
      html += '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
                // Démarrer seulement si rien n'est en cours (sinon 🏁 Clôturer) : pas de sorties empilées.
                (cur ? '' : '<button type="button" class="kta-btn kta-btn-primary kta-btn-small" id="kta-refonte-session-carnet-demarrer" ' +
                         'title="' + window.I18n.t("jrn.section.demarrerTitre") + '">' +
                         '📔 ' + window.I18n.t("jrn.section.demarrer") + '</button>') +
                (cur ? '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-refonte-session-carnet-cloture">' +
                         '🏁 ' + window.I18n.t("jrn.section.cloturer") + '</button>' : '') +
                (cur ? '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" ' +
                         'id="kta-refonte-session-carnet-affiner"' + (nbAAffiner > 0 ? '' : ' disabled') +
                         ' title="' + window.I18n.t(nbAAffiner > 0 ? "jrn.section.affinerTitre"
                                                                  : "jrn.section.affinerRien") + '">' +
                         '🧭 ' + window.I18n.t("jrn.section.affiner") +
                         (nbAAffiner > 0 ? ' (' + nbAAffiner + ')' : '') + '</button>' : '') +
                '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-refonte-session-carnet-ouvrir">' +
                  '📔 ' + window.I18n.t("jrn.section.ouvrir") + '</button>' +
              '</div>';
      html += '</div>';
    })();

    // ── Favoris : export / import JSON (plan courant ou tous ; import en fusion anti-doublon) ──
    html += '<div class="kta-refonte-session-section" id="kta-refonte-session-favoris-section">';
    html += '<div class="kta-refonte-session-section-titre">⭐ ' + window.I18n.t("ui.refonte.section_favoris") + ' <span class="kta-refonte-session-badge" id="kta-refonte-session-favoris-badge">…</span></div>';
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
    html += '<div id="kta-refonte-session-favoris-status" style="font-size:11.5px; color:var(--kta-texte-3); min-height:14px; font-style:italic;"></div>';
    html += '</div>';

    // ── Mémoire des sessions ──
    // IndexedDB (quota du site), repli localStorage (~5 Mo). Plein, plus rien ne se sauvegarde : jauge + plans
    // les plus lourds pour faire le ménage AVANT la panne.
    html += _htmlMemoireSessions();

    // ── Snapshots récents (10 en FIFO, IDB) ──
    // Hydratés async (SessionBackups.listAll) ; boutons « Snapshot maintenant » et « Tout vider ».
    html += '<div class="kta-refonte-session-section" id="kta-refonte-session-backups-section">';
    html += '<div class="kta-refonte-session-section-titre">📦 ' + window.I18n.t("ui.refonte.section_backups") + ' <span class="kta-refonte-session-badge" id="kta-refonte-session-backups-badge">…</span></div>';
    html += '<div style="font-size:12px; color:var(--kta-texte-3); margin-bottom:8px; line-height:1.5;">' +
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
              '<div style="font-size:12px; color:var(--kta-texte-3); font-style:italic;">' + window.I18n.t("ui.refonte.loading") + '</div>' +
            '</div>';
    html += '</div>';

    // ── Effacer la session : le MÊME parcours que la fenêtre « session restaurée » (SessionPersist.demanderEffacement :
    // choix d'un plan partagé, case des calques, snapshot).
    const _effacable = !!(window.SessionPersist && typeof window.SessionPersist.demanderEffacement === "function");
    if (_effacable) {
      html += '<div class="kta-refonte-session-section" id="kta-refonte-session-effacer-section">';
      html += '<div class="kta-refonte-session-section-titre">🗑️ ' + window.I18n.t("ui.refonte.section_effacer") + '</div>';
      html += '<div style="font-size:12px; color:var(--kta-texte-3); margin-bottom:8px; line-height:1.5;">' +
                window.I18n.t("ui.refonte.effacer_desc") +
              '</div>';
      // 🔒 Plan d'extension en lecture seule : tout vient du serveur, rien à effacer (bouton inactif qui le dit).
      const _roServeur = typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee(true);
      html += '<button type="button" class="kta-btn kta-btn-danger kta-btn-small" id="kta-refonte-session-effacer"' +
                (_roServeur ? ' disabled' : '') + '>' +
                window.I18n.t(_roServeur ? "session.partage.rienServeur" : "session.btn.clear") +
              '</button>';
      html += '</div>';
    }

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

    // La fenêtre reste ouverte pendant les confirmations (au-dessus d'elle) ; fermée une fois la session effacée,
    // ses chiffres seraient faux.
    const _btnEffacer = document.getElementById("kta-refonte-session-effacer");
    if (_btnEffacer) {
      _btnEffacer.addEventListener("click", function() {
        window.SessionPersist.demanderEffacement(_btnEffacer, _close);
      });
    }

    const _btnCarnetClot = document.getElementById("kta-refonte-session-carnet-cloture");
    if (_btnCarnetClot) {
      _btnCarnetClot.addEventListener("click", function() {
        if (window.JournalUi && typeof window.JournalUi.cloturerDepuisUi === "function") {
          _close();   // la fiche s'ouvre par-dessus : on ferme la modale Session d'abord
          window.JournalUi.cloturerDepuisUi();
        }
      });
    }
    // Démarrage manuel : le refus vient du module (source de vérité sur `_cur`), pas de l'état du bouton — une
    // sortie a pu démarrer depuis l'ouverture.
    const _btnCarnetDemarrer = document.getElementById("kta-refonte-session-carnet-demarrer");
    if (_btnCarnetDemarrer) {
      _btnCarnetDemarrer.addEventListener("click", function() {
        const t = window.I18n.t;
        const toast = function(msg, type) {
          if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type || "info");
        };
        if (!window.Journal || typeof window.Journal.demarrer !== "function") { toast(t("jrn.err.indispo"), "warn"); return; }
        const r = window.Journal.demarrer();
        if (!r || !r.ok) {
          toast(t(r && r.raison === "sansPlan" ? "jrn.err.sansPlan" : "jrn.err.dejaEnCours"), "warn");
          return;
        }
        toast(t("jrn.toast.demarree"), "info");
        // Fermer puis rouvrir : la modale est construite d'un bloc.
        _close();
        if (typeof _afficherModaleSessionDetail === "function") _afficherModaleSessionDetail();
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

    // « Affiner le tracé » : d'abord sans forcer ; au-delà du budget de sommets, retour immédiat
    // `skipped: "trop-gros"` et on demande si l'utilisateur accepte le gel (les gros plans en ont le plus besoin).
    const _btnAffiner = document.getElementById("kta-refonte-session-carnet-affiner");
    if (_btnAffiner) {
      _btnAffiner.addEventListener("click", function() {
        if (_btnAffiner.disabled) return;
        if (!window.Journal || typeof window.Journal.affinerEnCours !== "function") return;
        _btnAffiner.disabled = true;
        const _fini = function(bilan) {
          const t = window.I18n.t;
          if (bilan && bilan.runs > 0) {
            const av = window.formatDistance(bilan.avantM, 0);
            const ap = window.formatDistance(bilan.apresM, 0);
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(t("jrn.toast.affine", { avant: av, apres: ap }), "info");
            }
          } else if (window.OOMGuard && window.OOMGuard.showToast) {
            window.OOMGuard.showToast(t("jrn.toast.affineRien"), "warn");
          }
        };
        window.Journal.affinerEnCours().then(function(bilan) {
          if (bilan && bilan.skipped === "trop-gros") {
            const demander = window.ktaConfirm(window.I18n.t("jrn.affiner.confirmGros", { n: bilan.nbPts || "?" }),
                                               { titre: window.I18n.t("jrn.affiner.confirmTitre") });
            return demander.then(function(ok) {
              if (!ok) return null;
              return window.Journal.affinerEnCours({ force: true });
            });
          }
          return bilan;
        }).then(function(bilan) {
          _fini(bilan);
          _btnAffiner.disabled = false;
        }).catch(function() { _btnAffiner.disabled = false; });
      });
    }

    // Correction du classement : 🩸 les deux boutons sont repeints À LA MAIN — un re-render détruirait l'élément
    // sous le doigt de l'utilisateur.
    (function _wireTypeCarnet() {
      const btns = [
        document.getElementById("kta-refonte-session-carnet-type-terrain"),
        document.getElementById("kta-refonte-session-carnet-type-bureau")
      ].filter(Boolean);
      if (btns.length !== 2) return;
      btns.forEach(function(btn) {
        btn.addEventListener("click", function() {
          const type = btn.getAttribute("data-kta-jrn-type");
          const cur  = (window.Journal && typeof window.Journal.getCurrent === "function")
                         ? window.Journal.getCurrent() : null;
          if (!cur || typeof window.Journal.setType !== "function") return;
          window.Journal.setType(cur.id, type).then(function(ok) {
            if (!ok) return;
            btns.forEach(function(b) {
              const actif = (b.getAttribute("data-kta-jrn-type") === type);
              b.classList.toggle("kta-btn-primary", actif);
              b.classList.toggle("kta-btn-ghost", !actif);
            });
            if (window.OOMGuard && window.OOMGuard.showToast) {
              window.OOMGuard.showToast(
                window.I18n.t(type === "terrain" ? "jrn.toast.natureTerrain" : "jrn.toast.natureBureau"),
                "info");
            }
          });
        });
      });
    })();

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

    const _btnCopier = document.getElementById("kta-stats-copier");
    const _btnExport = document.getElementById("kta-stats-exporter");
    if (_btnCopier) {
      _btnCopier.addEventListener("click", function() {
        const planName = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "Plan";
        const txt = _genererStatsAggregeesTXT(_stats, planName, multiLevel);
        window.ktaCopierTexte(txt).then(function(ok) {
          if (!window.OOMGuard || !window.OOMGuard.showToast) return;
          if (ok) window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_copy_ok"), "info");
          else window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_copy_fail"), "warn");
        });
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

    // Section Snapshots : listAll IDB async, liste + boutons restaurer / supprimer.
    function _renderBackupsSection() {
      const listEl  = document.getElementById("kta-refonte-session-backups-list");
      const badgeEl = document.getElementById("kta-refonte-session-backups-badge");
      if (!listEl || !badgeEl) return;
      if (!window.SessionBackups || typeof window.SessionBackups.listAll !== "function") {
        listEl.innerHTML = '<div style="font-size:12px; color:var(--kta-texte-3); font-style:italic;">' + window.I18n.t("ui.refonte.backups_module_unavailable") + '</div>';
        badgeEl.textContent = "—";
        return;
      }
      window.SessionBackups.listAll().then(function(arrAll) {
        // Seuls les snapshots de CE plan (les autres restent en IDB).
        const currentPlanId = window._currentLoadedPlanId || null;
        // Même nom (SessionPersist.normNomPlan) = même plan : un plan réimporté ou renommé change d'identifiant
        // mais garde ses copies.
        const nomPlan = (window.PLAN_CONFIG && window.PLAN_CONFIG.plan && window.PLAN_CONFIG.plan.name) || "";
        const norm = (window.SessionPersist && window.SessionPersist.normNomPlan) || function (x) { return String(x || ""); };
        const autreVersion = function (b) {
          return !!(currentPlanId && b.planId && b.planId !== currentPlanId && nomPlan && b.planName &&
            norm(b.planName) === norm(nomPlan));
        };
        const arr = arrAll.filter(function(b) {
          if (autreVersion(b)) return true;
          // Snapshot sans planId (ancien, session vide) : affiché quand même.
          if (!b.planId) return true;
          if (!currentPlanId) return true;  // pas de plan chargé → tout afficher
          return b.planId === currentPlanId;
        });
        // Badge : compte de CE plan + total tous plans.
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
          listEl.innerHTML = '<div style="font-size:12px; color:var(--kta-texte-3); font-style:italic;">' + emptyMsg + '</div>';
          return;
        }
        function _esc(s) { return window.ktaEsc(s); }
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
        // .kta-backups-list annule le gabarit vertical de .kta-refonte-session-list : une ligne compacte par snapshot.
        let h = '<ul class="kta-refonte-session-list kta-backups-list">';
        arr.forEach(function(b) {
          // Pas de planName dans le meta : la liste est déjà filtrée sur le plan courant.
          h += '<li>' +
                 '<span class="kta-backup-info">' +
                   '<strong>' + _fmtDate(b.createdAt) + '</strong>' +
                   ' <span class="kta-refonte-session-meta">' +
                     _countContent(b.payload) +
                     ' · <em style="opacity:0.7;">' + _esc(b.reason || window.I18n.t("ui.refonte.label_backup_auto")) + '</em>' +
                     (autreVersion(b) ? ' · <span class="kta-tx-warn">📂 ' + _esc(window.I18n.t("ui.refonte.backup_autre_version")) + '</span>' : "") +
                   '</span>' +
                 '</span>' +
                 '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" ' +
                   (autreVersion(b) ? 'data-backup-autre="1" ' : "") +
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
        listEl.querySelectorAll("[data-backup-restore]").forEach(function(btn) {
          btn.addEventListener("click", function() {
            const id = Number(btn.getAttribute("data-backup-restore"));
            const autre = btn.getAttribute("data-backup-autre") === "1";
            window.ktaConfirm(window.I18n.t(autre ? "ui.refonte.confirm_restore_autre" : "ui.refonte.confirm_restore")).then(function(ok) {
            if (!ok) return;
            window.SessionBackups.restore(id, autre ? { versPlanId: currentPlanId, versPlanName: nomPlan } : null).then(function() {
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_restore_ok"), "info");
              }
              setTimeout(function() { location.reload(); }, 400);
            }).catch(function(err) {
              if (window.OOMGuard && window.OOMGuard.showToast) {
                window.OOMGuard.showToast(window.I18n.t("ui.refonte.alert_restore_fail", { err: (err && err.message ? err.message : err) }), "error");
              }
            });
            });
          });
        });
        listEl.querySelectorAll("[data-backup-remove]").forEach(function(btn) {
          btn.addEventListener("click", function() {
            const id = Number(btn.getAttribute("data-backup-remove"));
            // 🩸 Supprimer un snapshot demande confirmation : c'est le SEUL filet de la session.
            window.ktaConfirm(window.I18n.t("ui.refonte.confirm_remove_snapshot"), {
              okLabel: window.I18n.t("ui.refonte.btn_remove_snapshot_title")
            }).then(function(ok) {
              if (!ok) return;
              window.SessionBackups.remove(id).then(function() {
                _renderBackupsSection();  // refresh
              });
            });
          });
        });
      }).catch(function(err) {
        listEl.innerHTML = '<div style="font-size:12px; color:var(--kta-erreur);">' +
                            window.I18n.t("ui.refonte.backups_load_error", { err: (err && err.message ? err.message : String(err)) }) + '</div>';
      });
    }
    _renderBackupsSection();

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
        window.ktaConfirm(window.I18n.t("ui.refonte.confirm_clear_all")).then(function(ok) {
        if (!ok) return;
        window.SessionBackups.clearAll().then(function() {
          _renderBackupsSection();
          if (window.OOMGuard && window.OOMGuard.showToast) {
            window.OOMGuard.showToast(window.I18n.t("ui.refonte.toast_backups_cleared"), "info");
          }
        });
        });
      });
    }

    _hydrateFavorisBadge();
    const _btnFavExportCur = document.getElementById("kta-refonte-session-favoris-export-current");
    const _btnFavExportAll = document.getElementById("kta-refonte-session-favoris-export-all");
    const _btnFavImport    = document.getElementById("kta-refonte-session-favoris-import");
    const _favImportInput  = document.getElementById("kta-refonte-session-favoris-import-file");
    const _favStatus       = document.getElementById("kta-refonte-session-favoris-status");

    function _setFavStatus(msg, isOk) {
      if (!_favStatus) return;
      _favStatus.textContent = msg || "";
      _favStatus.style.color = isOk === true ? "var(--kta-ok)"
                              : isOk === false ? "var(--kta-erreur)"
                              : "var(--kta-texte-3)";
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

    // Badge Favoris (plan courant + total). Déclaration de fonction : appelée plus haut grâce au hoisting.
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

    // Ligne Photos du bloc Stats agrégées (IDB async, indépendante de la section détaillée)
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

    // Section Photos (IDB async) : badge + détail par point ; points sans photo non listés.
    _hydraterPhotosModaleSession(points);
  }

  // Section Photos de la modale : total, détail par point, taille.
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
      const byPoint = {};
      let totalSize = 0;
      arr.forEach(function(rec) {
        const pid = String(rec.pointId || "");
        if (!byPoint[pid]) byPoint[pid] = { count: 0, size: 0 };
        byPoint[pid].count += 1;
        byPoint[pid].size  += rec.size || (rec.blob && rec.blob.size) || 0;
        totalSize += rec.size || (rec.blob && rec.blob.size) || 0;
      });
      const nomByPid = {};
      (points || []).forEach(function(p) {
        const lib = p.nom || p.id || window.I18n.t("ui.refonte.label_no_name");
        nomByPid[String(p.id || "")] = lib;
        if (p.uid) nomByPid[String(p.uid)] = lib;   // photos rangées sous l'uid
      });
      const fmt = window._kta_formatBytes || function(n) {
        if (n < 1024) return n + " o";
        if (n < 1024 * 1024) return Math.round(n / 1024) + " Ko";
        return (n / (1024 * 1024)).toFixed(1) + " Mo";
      };
      let html = '<ul class="kta-refonte-session-list">';
      Object.keys(byPoint).forEach(function(pid) {
        const stats = byPoint[pid];
        const nom = nomByPid[pid] || window.I18n.t("ui.refonte.label_point_not_found", { id: pid });
        const safeName = window.ktaEsc(nom);
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
      const section = document.getElementById("kta-refonte-session-photos-section");
      if (section && Object.keys(byPoint).length > SEUIL_REPLI_SESSION) section.open = false;
    }).catch(function(e) {
      console.warn("[RefonteInterface] _hydraterPhotosModaleSession :", e);
      badge.textContent = "?";
      body.textContent = window.I18n.t("ui.refonte.photos_read_error");
    });
  }

  // ── Setup : appelé par main.js après lancerApplication ──────────────
  function _setupQuandMapPrete() {
    if (window.map) {
      _creerHeaderBar();
      _creerStatusBar();
      _startPolling();
      // Abonnement BatteryGuard une fois les chips créés (no-op sans BatteryGuard)
      _setupBatteryHook();
    } else {
      setTimeout(_setupQuandMapPrete, 200);
    }
  }

  // Hook appelé par main.js > lancerApplication (sans dépendance forte).
  window._refonteInterfacePostInit = function() {
    _setupQuandMapPrete();
  };

  // ── Boutons de réduction des sidebars ──────────────
  // Bouton EN HAUT de chaque sidebar (flex order:-1, Leaflet ayant déjà ajouté Layers et Zoom) : replie les
  // autres controls. Pas de persistance, dépliée au boot (décision produit). ▾ déplié ; ▸ / ◂ replié (vers le
  // centre de l'écran) — pas ≡, confondu avec l'icône des calques.
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
      a.href  = "#";   // pas « javascript: » (CSP stricte) ; le clic fait L.DomEvent.stop
      a.setAttribute("role", "button");
      a.title = window.I18n.t("ui.refonte.btn_sidebar_collapse");
      a.setAttribute("aria-label", window.I18n.t("ui.refonte.btn_sidebar_collapse_aria", { side: side }));
      a.innerHTML = _iconeCollapse(side, false);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, "click", function(e) {
        L.DomEvent.stop(e);
        const isCollapsed = document.body.classList.toggle(cls);
        a.innerHTML = _iconeCollapse(side, isCollapsed);
        a.title = isCollapsed ? window.I18n.t("ui.refonte.btn_sidebar_expand") : window.I18n.t("ui.refonte.btn_sidebar_collapse");
        a.setAttribute("aria-pressed", isCollapsed ? "true" : "false");
        // Replier ferme le groupe accordéon ouvert dans cette sidebar (sinon il se rouvre au dépliage).
        if (isCollapsed && typeof window._fermerGroupeOuvertSide === "function") {
          try { window._fermerGroupeOuvertSide(side); } catch(e) {}
        }
      });
      return div;
    };
    ctrl.addTo(window.map);
    return ctrl;
  }

  // Pour interface.js (début de initInterface)
  window._refonteInterfaceCreerBoutonReductionLeft  = function() {
    return _creerBoutonReduction("topleft");
  };
  window._refonteInterfaceCreerBoutonReductionRight = function() {
    return _creerBoutonReduction("topright");
  };

  // Chargé après lancerApplication : construction directe. 🩸 Attendre I18n.init() (mémoïsée) : window.map existe
  // avant tout plan, et header + status bar construits avant les dicos garderaient à vie des tooltips
  // « humanisés » (_creerHeaderBar ne se reconstruit jamais).
  document.addEventListener("DOMContentLoaded", function() {
    if (!window.map) return;
    const ready = (window.I18n && typeof window.I18n.init === "function")
      ? window.I18n.init() : Promise.resolve();
    ready.then(function() { _setupQuandMapPrete(); });
  });

  // ── Nettoyage au changement de plan (main.js > _libererRessourcesPlanPrecedent) ──────────────
  // Retire header et status bar (sinon vieilles valeurs pendant le splash).
  window._refonteInterfacePreUnload = function() {
    _stopPolling();
    _headerNettoyages.forEach(function(f) { try { f(); } catch(e) {} });
    _headerNettoyages = [];
    // 🩸 L'observateur garde la barre qu'il observe ; resté armé, il bloquait aussi celui de la barre suivante
    // (garde `_statusBarRO` de _setupStatusBarResizeObserver) : plus de --kta-statusbar-h juste après un plan.
    if (_statusBarRO) {
      try { _statusBarRO.disconnect(); } catch(e) {}
      _statusBarRO = null;
    }
    if (_headerEl) {
      try { _headerEl.remove(); } catch(e) {}
      _headerEl = null;
    }
    if (_statusBarEl) {
      try { _statusBarEl.remove(); } catch(e) {}
      _statusBarEl = null;
    }
  };

  // ── API publique ──────────────
  // setActive → Promise<boolean> (true = confirmé + reload) ; le flag n'est écrit qu'après confirmation.
  // Les appelants (index.html, interface.js) attendent la promesse pour rétablir la case si annulation.
  function _setActive(value) {
    return _afficherConfirmInterfaceChange(value).then(function(confirmed) {
      if (confirmed) {
        _writeFlag(value);
        location.reload();
      }
      return confirmed;
    });
  }

  // Modale charte (.kta-readme-modal-boite, accent doré), même schéma que « Forcer la mise à jour ». ✕ / fond /
  // Échap / Annuler → false ; Valider → true. Texte selon la direction du changement.
  function _afficherConfirmInterfaceChange(valueIsNouvelle) {
    return new Promise(function(resolve) {
      const existing = document.getElementById("kta-refonte-interface-confirm");
      if (existing) existing.remove();

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

      // Accent doré : action d'interface, ni destructive (rouge) ni informative (bleu).
      overlay.innerHTML =
        '<div class="kta-readme-modal-boite" style="max-width:480px; height:auto; max-height:92vh; border:1px solid rgba(244,197,66,0.4);">' +
          '<div class="kta-readme-modal-header" style="border-bottom-color:rgba(244,197,66,0.25);">' +
            '<div class="kta-readme-modal-titre" style="color:var(--kta-accent-texte);">' + titre + '</div>' +
            '<button class="kta-panneau-close" type="button" id="kta-rint-close" aria-label="' + window.I18n.t("ui.refonte.btn_close_aria") + '">✕</button>' +
          '</div>' +
          '<div class="kta-readme-modal-corps" style="color:var(--kta-texte-2);">' +
            '<p style="margin:0 0 14px 0; line-height:1.55;">' +
              window.I18n.t("ui.refonte.modal_switch_intro", { cible: '<strong style="color:var(--kta-accent-texte);">' + labelCible + '</strong>' }) +
            '</p>' +
            '<p style="margin:0 0 14px 0; line-height:1.55; font-size:13px; color:var(--kta-texte-3);">' +
              description +
            '</p>' +
            '<div style="background:rgba(244,197,66,0.06); border:1px solid rgba(244,197,66,0.22); border-radius:8px; padding:10px 14px; margin-bottom:0;">' +
              '<div style="font-weight:600; color:var(--kta-accent-texte); margin-bottom:6px;">✅ ' + window.I18n.t("ui.refonte.modal_switch_preserved_titre") + '</div>' +
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
            '<button class="kta-btn kta-btn-primary" type="button" id="kta-rint-confirm">' + window.I18n.t("ui.refonte.btn_validate") + '</button>' +
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


})();
