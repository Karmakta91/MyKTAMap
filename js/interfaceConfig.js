/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE CONFIG — Modale Réglages + Perf ULTRA + Multi-niveau + Géoref
// =========================
// 🆕 v1.31.0 (P3 Lot 9 — découpe interface.js, DERNIER LOT) : module
// extrait de js/interface.js (4 plages contiguës avant extraction)
// pour réduire le volume du fichier principal.
//
// Plages d'origine (post-Lots 1-7) :
//   689-1326  : PERF ULTRA + M-LVL section + GÉOREF (sections de la modale)
//   1327-1669 : CONFIG modale (afficherConfig + appliquerConfig + resetConfig)
//   1829-2228 : M-LVL modales et helpers (depuis v148)
//   4226-4264 : M-LVL Leaflet control top-left (pastille niveau actif)
//
// Aucun changement de comportement runtime. Les fonctions exposées via
// `window.*` sont strictement identiques à v1.30.1. 3 helpers
// supplémentaires sont désormais exposés via window.* car ils étaient
// appelés depuis interface.js par leur identifier local et doivent
// continuer à fonctionner post-extraction (cf patches dans interface.js).
//
// 📋 API publique :
//   - window.afficherConfig() / appliquerConfig() / resetConfig()
//   - window.appliquerFiltreNiveau()        Multi-niveau filtre
//   - window.appliquerFiltreRuntime()       Filtre runtime tags
//   - window._initLevelFilterControl()      Leaflet control niveau actif
//   - window._ouvrirCreationJonction()      Modale création jonction
//
// 🔌 Dépendances externes (toutes via window.*) :
//   - window.PerfUltra                      [perfUltra.js]
//   - window.APP_CONFIG                     [config.js]
//   - window.PLAN_CONFIG                    [config.js / plan-config]
//   - window.PlanRegistry                   [planRegistry.js]
//   - window.map / convertCoord            [map.js / utils.js]
//   - window.afficherToast                  [refonteInterface.js]
//   - localStorage["myktamap_*"]            [persistance prefs]
//
// 📍 Ordre de chargement (cf index.html) :
//   - Doit charger APRÈS interface.js + interfaceMaintenance.js
//     (le bloc EXPORT GLOBAL d'interface.js consomme les fonctions
//     de ce module via window.*, mais l'ordre est cosmétique car
//     posées au load avant DOMContentLoaded).

// =========================
// 🚀 PERF ULTRA — section de toggles dans la modale Réglages
// =========================
// Génère le HTML de la section "🚀 Mode Performance ULTRA" avec :
//   - Toggle master "🚀 ULTRA" (preset qui active les 6 ensemble)
//   - 6 toggles individuels pour ajustement fin par power users
// Le binding des change events se fait dans _bindPerfUltraToggles après render.
function _renderPerfUltraSection() {
  if (!window.PerfUltra) return "";
  const s = window.PerfUltra.getAll();
  function row(id, label, value, hint, danger) {
    return `
      <label class="kta-perf-ultra-row${danger ? " kta-perf-ultra-row-danger" : ""}">
        <input type="checkbox" id="${id}" ${value ? "checked" : ""}>
        <span class="kta-perf-ultra-text">
          <span class="kta-perf-ultra-label">${label}</span>
          ${hint ? `<span class="kta-perf-ultra-hint">${hint}</span>` : ""}
        </span>
      </label>`;
  }
  return `
    <div class="kta-aide-section">
      <div class="kta-aide-section-titre">🚀 Mode Performance ULTRA</div>
      <p style="font-size:11.5px; color:#8892a4; margin:0 0 10px 0; line-height:1.5;">
        Pour les gros plans / appareils faibles. Active <strong>🚀 ULTRA</strong> pour appliquer
        les optims d'un coup, ou ajuste individuellement chaque levier. Les changements
        s'appliquent à la volée — sauf les options marquées d'un <span style="color:#ffb380;">liseré orange</span>
        qui nécessitent un reload du plan pour prendre effet.
      </p>
      ${row("cfg_perf_ultra", "🚀 Mode ULTRA (active tout)", s.ultra,
            "Préset qui active les 7 toggles ci-dessous. Décocher = désactive tout.")}
      <div style="border-top:1px solid rgba(255,255,255,0.08); margin:10px 0; padding-top:8px;"></div>
      ${row("cfg_perf_decim", "🪜 Décimer les tracés au dézoom", s.decim,
            "Simplifie les polylines via Ramer-Douglas-Peucker. Tracés moins lisses au dézoom mais bien plus rapides.")}
      ${row("cfg_perf_animOff", "⚡ Désactiver animations zoom/pan", s.animOff,
            "Pan/zoom instantanés au lieu d'animés. <strong>Reload requis</strong> après changement.", true)}
      ${row("cfg_perf_noIntersect", "🎯 Désactiver cercles intersections (gros plans)", s.noIntersect,
            "Seuil abaissé à 50 routes (vs 200 normal). Pas de cercles aux carrefours au-delà.")}
      ${row("cfg_perf_noTooltips", "🚫 Désactiver popups sur calques données", s.noTooltips,
            "Plus de popup au clic sur les markers des calques de données. Les points session restent interactifs. Utilise 🔍 pour interagir.")}
      ${row("cfg_perf_slowSave", "🐢 Auto-save lent (30s)", s.slowSave,
            "Sauvegarde automatique toutes les 30s au lieu de 1.5s. Risque de perdre ~30s de modifs si crash.")}
      ${row("cfg_perf_viewportCull", "👁️ Ne rendre que les éléments visibles", s.viewportCull,
            "Saute les routes <strong>ET les markers POI</strong> hors viewport. Pop-in léger au pan mais énorme gain sur plans denses (100+ POI).")}
      ${row("cfg_perf_mobileZoomLimit", "🛡️ Limiter le dézoom sur mobile (anti-crash mémoire)", s.mobileZoomLimit,
            "<strong>Coché par défaut</strong>. Sur smartphone, plafonne le dézoom max pour éviter le crash OOM quand Leaflet tente de rendre l'image entière au minZoom. <strong>Décocher</strong> = autorise le même dézoom max que sur PC (utile pour vue d'ensemble), mais risque de crash sur gros plans. <strong>Reload requis</strong> après changement.", true)}
    </div>`;
}

// Binding des change events sur les toggles PerfUltra après render.
function _bindPerfUltraToggles() {
  if (!window.PerfUltra) return;
  const ultraEl = document.getElementById("cfg_perf_ultra");
  if (ultraEl) {
    ultraEl.addEventListener("change", function() {
      window.PerfUltra.setUltra(ultraEl.checked);
      // Re-render la section pour refléter les nouveaux états individuels
      const m = document.getElementById("kta-cfg-modal");
      if (m) { m.remove(); afficherConfig(); }
    });
  }
  const map = {
    "cfg_perf_decim":           "decim",
    "cfg_perf_animOff":         "animOff",
    "cfg_perf_noIntersect":     "noIntersect",
    "cfg_perf_noTooltips":      "noTooltips",
    "cfg_perf_slowSave":        "slowSave",
    "cfg_perf_viewportCull":    "viewportCull",
    "cfg_perf_mobileZoomLimit": "mobileZoomLimit"
  };
  Object.keys(map).forEach(function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", function() {
      window.PerfUltra.set(map[id], el.checked);
      // Sync visuel du master ULTRA (coché si tous les autres le sont)
      if (ultraEl) ultraEl.checked = window.PerfUltra.isUltra();
    });
  });
}

// =========================
// 🏗️ MULTI-NIVEAU — section toggle dans Réglages (depuis v148)
// =========================
// Toggle "opt-in" par plan : quand activé, l'UI affiche un selecteur de
// niveau dans le groupe Tracés + une sous-action 🪜 Jonction interniveau.
// Quand désactivé (defaut), aucun changement visible → retro-compat absolue
// avec les plans existants v147 et avant.
// Le toggle ecrit dans PlanRegistry[planId].multiLevel (pas dans
// localStorage global) → persistance par plan, comme perfPreset.
function _renderMultiLevelSection() {
  const planId = window._currentLoadedPlanId;
  // Si on est dans le contexte d'un plan charge → on lit la valeur. Sinon
  // (cas improbable, modale ouverte hors chargement) → false.
  const enabled = !!(planId && window.PlanRegistry && typeof window.PlanRegistry.getMultiLevel === "function"
    && window.PlanRegistry.getMultiLevel(planId));
  return `
    <div class="kta-aide-section">
      <div class="kta-aide-section-titre">🏗️ Mode multi-niveau (avancé)</div>
      <p style="font-size:11.5px; color:#8892a4; margin:0 0 10px 0; line-height:1.5;">
        Active la gestion des niveaux (étages) pour les carrières multi-étages.
        Ajoute un sélecteur de niveau dans le groupe <strong>🛣️ Tracés</strong> +
        une sous-action <strong>🪜 Jonction interniveau</strong>. Les roads existantes
        sans niveau explicite sont automatiquement considérées comme niveau 0.
        <br><strong style="color:#c8d0e0;">Désactivé par défaut</strong> — uniquement
        pour les plans qui le nécessitent (Glacière, Capucins, etc.).
      </p>
      <label class="kta-perf-ultra-row">
        <input type="checkbox" id="cfg_multiLevel" ${enabled ? "checked" : ""}>
        <span class="kta-perf-ultra-text">
          <span class="kta-perf-ultra-label">🏗️ Activer le mode multi-niveau pour ce plan</span>
          <span class="kta-perf-ultra-hint">Persisté par plan. Reload requis pour que les changements UI soient visibles dans la sidebar.</span>
        </span>
      </label>
    </div>`;
}

// Binding du toggle multi-niveau apres render. Sauvegarde dans PlanRegistry,
// applique au state runtime (APP_CONFIG.multiLevel) immediatement pour les
// rerenders ne necessitant pas de reload.
function _bindMultiLevelToggle() {
  const el = document.getElementById("cfg_multiLevel");
  if (!el) return;
  el.addEventListener("change", function() {
    const planId = window._currentLoadedPlanId;
    if (!planId || !window.PlanRegistry || typeof window.PlanRegistry.setMultiLevel !== "function") {
      console.warn("[Config] setMultiLevel indisponible (planId ou PlanRegistry manquant)");
      return;
    }
    const newVal = !!el.checked;
    window.PlanRegistry.setMultiLevel(planId, newVal);
    // Applique au runtime immédiatement → permet aux re-renders (renderRoads,
    // initInterface si re-appellé) de prendre le bon filtre. Le user verra le
    // selecteur de niveau apparaitre/disparaitre seulement apres reload car
    // initInterface() crée les sous-actions une seule fois au boot.
    APP_CONFIG.multiLevel = newVal;
    if (newVal) {
      APP_CONFIG.activeLevel   = 0;
      APP_CONFIG.visibleLevels = [0];
      document.body.classList.add("kta-multilevel-active");
    } else {
      document.body.classList.remove("kta-multilevel-active");
    }
    window.APP_CONFIG = APP_CONFIG;
    if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    console.log("[Config] multiLevel →", newVal, "(plan", planId + ")");
  });
}

// =========================
// 🌐 GÉORÉFÉRENCEMENT GPS — section de la modale ⚙️ Configuration
// =========================
// v1.14.19 (KARMA « rajoute la possibilité de faire le géo référencement
// depuis les paramètres en mode map, auto remplis ensuite si je retourne
// dans exporter »).
//
// Persistance via window.KmzExport.setCalibration(planId, c) — exactement
// le même backend que la modale 📡 Export externe (sessionExporter.js).
// Du coup, calibrage saisi ici → automatiquement pré-rempli quand l'user
// va dans Export externe.
//
// Convention d'IDs : préfixe `cfg_kmz_` pour ne pas entrer en collision
// avec les `kmz_A_x` etc. de sessionExporter (au cas où les 2 modales
// seraient ouvertes en même temps — improbable mais propre).
function _renderCfgGeorefSection() {
  // Pré-charge le calibrage actuel s'il existe
  const planId = window._currentLoadedPlanId || "default";
  const saved  = (window.KmzExport && window.KmzExport.getCalibration)
                  ? window.KmzExport.getCalibration(planId) : null;
  const pA = (saved && saved.pointA) || { x: "", y: "", lat: "", lng: "" };
  const pB = (saved && saved.pointB) || { x: "", y: "", lat: "", lng: "" };

  return '' +
    '<div class="kta-aide-section">' +
      '<div class="kta-aide-section-titre">🌐 Géoréférencement GPS</div>' +
      '<p style="font-size:12px; color:#8892a4; margin:4px 0 12px; line-height:1.5;">' +
        'Calibre le plan en saisissant <strong>2 points de référence</strong> ' +
        '(coordonnées x/y plan + lat/lng GPS WGS84). MyKTAMap calcule la ' +
        'transformation rotation+échelle+translation pour projeter toutes les ' +
        'annotations sur le globe. Le calibrage est <strong>persisté localement ' +
        'par plan</strong> et automatiquement pré-rempli quand tu ouvres ' +
        '<strong>📡 Export externe</strong> (KMZ / GPX) ou que tu importes un GPX.' +
      '</p>' +

      // ===== Point A =====
      // 🆕 v1.21.0-fix1 : ajout des 2 boutons d'aide à la saisie (parité
      // UX avec la modale 💾 Enregistrer > 📡 Export externe) :
      //   - 🔍 Chercher un point : autocomplete sur POI plan → fill x/y
      //   - 📍 Cliquer carte : mode pick → clic sur la carte fill x/y
      // Les coords GPS lat/lng restent saisies manuellement (l'app ne
      // connaît pas le GPS du plan tant que la calibration n'existe pas).
      '<div class="kta-kmz-section" style="margin:8px 0;">' +
        '<div class="kta-kmz-section-titre">📍 Point A</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">Plan x :</label>' +
          '<input type="number" id="cfg_kmz_A_x"   value="' + pA.x   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">Plan y :</label>' +
          '<input type="number" id="cfg_kmz_A_y"   value="' + pA.y   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">GPS (lat, lng) :</label>' +
          // 🆕 hotfix21 — Input combiné lat/lng (format Google Maps natif).
          '<input type="text" id="cfg_kmz_A_coords" value="' + ((typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(pA.lat, pA.lng) : (Number.isFinite(pA.lat) && Number.isFinite(pA.lng) ? pA.lat + ", " + pA.lng : "")) + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8580, 2.2945">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="cfg_kmz_A_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_A_search" type="button">🔍 Chercher un point</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_A_click" type="button">📍 Cliquer carte</button>' +
        '</div>' +
        '<div id="cfg_kmz_A_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      // ===== Point B =====
      '<div class="kta-kmz-section" style="margin:8px 0;">' +
        '<div class="kta-kmz-section-titre">📍 Point B</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">Plan x :</label>' +
          '<input type="number" id="cfg_kmz_B_x"   value="' + pB.x   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">Plan y :</label>' +
          '<input type="number" id="cfg_kmz_B_y"   value="' + pB.y   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">GPS (lat, lng) :</label>' +
          // 🆕 hotfix21 — Input combiné lat/lng (format Google Maps natif).
          '<input type="text" id="cfg_kmz_B_coords" value="' + ((typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(pB.lat, pB.lng) : (Number.isFinite(pB.lat) && Number.isFinite(pB.lng) ? pB.lat + ", " + pB.lng : "")) + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8520, 2.3050">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="cfg_kmz_B_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_B_search" type="button">🔍 Chercher un point</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_B_click" type="button">📍 Cliquer carte</button>' +
        '</div>' +
        '<div id="cfg_kmz_B_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      '<div id="cfg_kmz_status" style="font-size:12px; margin:8px 2px 4px; min-height:18px;"></div>' +

      '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<button class="kta-btn kta-btn-primary" type="button" id="cfg_kmz_save">' +
          '💾 Sauvegarder le calibrage' +
        '</button>' +
        '<button class="kta-btn kta-btn-ghost"   type="button" id="cfg_kmz_clear">' +
          '🗑️ Effacer' +
        '</button>' +
      '</div>' +
    '</div>';
}

function _bindCfgGeorefHandlers() {
  const btnSave   = document.getElementById("cfg_kmz_save");
  const btnClear  = document.getElementById("cfg_kmz_clear");
  const statusEl  = document.getElementById("cfg_kmz_status");
  if (!btnSave || !btnClear) return;  // section pas dans le DOM (sécurité)

  function _setStatus(msg, type) {
    if (!statusEl) return;
    const color = (type === "ok") ? "#6ce28a" : (type === "err") ? "#ff8080" : "#8892a4";
    statusEl.style.color = color;
    statusEl.textContent = msg || "";
  }

  function _readVal(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = el.value;
    if (v === "" || v == null) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  // 🆕 hotfix21 — Bind validation live des inputs GPS combinés cfg_kmz_*_coords.
  // Idempotent : ré-attaches sans risque si déjà bindé (cf. utils.js).
  if (typeof window.attacherGpsValidationCombo === "function") {
    window.attacherGpsValidationCombo(
      document.getElementById("cfg_kmz_A_coords"),
      { errorEl: document.getElementById("cfg_kmz_A_err") }
    );
    window.attacherGpsValidationCombo(
      document.getElementById("cfg_kmz_B_coords"),
      { errorEl: document.getElementById("cfg_kmz_B_err") }
    );
  }

  // 🆕 hotfix21 — Helper : lit l'input combiné "lat, lng", parse + applique
  // border rouge + message inline si format invalide. Retourne {lat, lng}
  // ou null (vide ou invalide). Le caller distingue via 2e param `errKey`.
  function _readCoordsCombo(id, errId) {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = String(el.value || "").trim();
    if (v === "") return null;
    const parsed = (typeof window.parseGpsCoords === "function")
                    ? window.parseGpsCoords(v) : null;
    if (!parsed) {
      el.classList.add("kta-gps-invalid");
      const errEl = errId ? document.getElementById(errId) : null;
      if (errEl) {
        errEl.textContent = "Format attendu : 48.6808, 2.1588";
        errEl.style.display = "";
      }
      return { invalid: true };
    }
    el.classList.remove("kta-gps-invalid");
    const errEl = errId ? document.getElementById(errId) : null;
    if (errEl) { errEl.textContent = ""; errEl.style.display = "none"; }
    return { lat: parsed.lat, lng: parsed.lng };
  }

  btnSave.addEventListener("click", function() {
    if (!window.KmzExport) {
      _setStatus("Module KmzExport indisponible.", "err");
      return;
    }
    // 🆕 hotfix21 — Lecture lat/lng via input combiné. Format invalide
    // → border rouge + message + abort silencieux (la combo bloque le save).
    const coordsA = _readCoordsCombo("cfg_kmz_A_coords", "cfg_kmz_A_err");
    const coordsB = _readCoordsCombo("cfg_kmz_B_coords", "cfg_kmz_B_err");
    if ((coordsA && coordsA.invalid) || (coordsB && coordsB.invalid)) {
      _setStatus("Coordonnées GPS invalides — corrige les champs en rouge.", "err");
      return;
    }
    const c = {
      pointA: { x: _readVal("cfg_kmz_A_x"), y: _readVal("cfg_kmz_A_y"),
                lat: coordsA ? coordsA.lat : null,
                lng: coordsA ? coordsA.lng : null },
      pointB: { x: _readVal("cfg_kmz_B_x"), y: _readVal("cfg_kmz_B_y"),
                lat: coordsB ? coordsB.lat : null,
                lng: coordsB ? coordsB.lng : null }
    };
    // Validation : tous les champs requis (x, y, lat, lng pour A et B)
    if (c.pointA.x == null || c.pointA.y == null || c.pointA.lat == null || c.pointA.lng == null ||
        c.pointB.x == null || c.pointB.y == null || c.pointB.lat == null || c.pointB.lng == null) {
      _setStatus("Tous les champs sont obligatoires (Plan x/y + GPS pour A et B).", "err");
      return;
    }
    // Validation transform (lève si points colinéaires ou distance nulle)
    try {
      window.KmzExport.buildTransform(
        { x: c.pointA.x, y: c.pointA.y },
        { x: c.pointB.x, y: c.pointB.y },
        { lat: c.pointA.lat, lng: c.pointA.lng },
        { lat: c.pointB.lat, lng: c.pointB.lng }
      );
    } catch(e) {
      _setStatus("Calibrage invalide : " + e.message, "err");
      return;
    }
    // Persistance
    const planId = window._currentLoadedPlanId || "default";
    window.KmzExport.setCalibration(planId, c);
    _setStatus("✅ Calibrage sauvegardé. Auto-rempli dans 📡 Export externe.", "ok");
    if (window.OOMGuard && window.OOMGuard.showToast) {
      window.OOMGuard.showToast("🌐 Calibrage GPS sauvegardé", "info");
    }
  });

  btnClear.addEventListener("click", function() {
    // 🆕 hotfix21 — Wipe x/y + coords combinés (au lieu des 4 inputs séparés).
    ["A_x","A_y","A_coords","B_x","B_y","B_coords"].forEach(function(k) {
      const el = document.getElementById("cfg_kmz_" + k);
      if (el) {
        el.value = "";
        el.classList.remove("kta-gps-invalid");
      }
    });
    // Cache aussi les éventuels messages d'erreur restants
    ["cfg_kmz_A_err", "cfg_kmz_B_err"].forEach(function(id) {
      const e = document.getElementById(id);
      if (e) { e.textContent = ""; e.style.display = "none"; }
    });
    // Efface aussi la version persistée (préfixe identique à
    // KMZ_CALIB_LS_PREFIX dans js/kmzExport.js).
    try {
      const planId = window._currentLoadedPlanId || "default";
      localStorage.removeItem("myktamap_kmz_calib_" + planId);
    } catch(e) {}
    _setStatus("Calibrage effacé.", null);
  });

  // 🆕 v1.21.0-fix1 : boutons 🔍 Chercher / 📍 Cliquer carte (parité UX
  // avec la modale 💾 Enregistrer > 📡 Export externe). Pattern identique
  // à sessionExporter.js > _kmzOuvrirRecherche / _kmzActiverModeClic mais
  // sur les IDs `cfg_kmz_*` (au lieu de `kmz_*`).
  ["A", "B"].forEach(function(letter) {
    const btnSearch = document.getElementById("cfg_kmz_" + letter + "_search");
    const btnClick  = document.getElementById("cfg_kmz_" + letter + "_click");
    if (btnSearch) btnSearch.addEventListener("click", function() { _cfgOuvrirRechercheGeoref(letter); });
    if (btnClick)  btnClick.addEventListener("click",  function() { _cfgActiverModeClicGeoref(letter); });
  });
}

// ───────── 🔍 RECHERCHE POI (Géoref Réglages — v1.21.0-fix1) ─────────
// Autocomplete inline qui réutilise window.SearchPoints.findByQuery
// (déjà chargé par js/searchPoints.js). Pattern identique au picker
// utilisé dans la modale Enregistrer KMZ.
function _cfgOuvrirRechercheGeoref(letter) {
  const res = document.getElementById("cfg_kmz_" + letter + "_search_results");
  if (!res) return;
  res.style.display = "block";
  res.innerHTML =
    '<input type="text" id="cfg_kmz_' + letter + '_search_q" class="kta-cfg-input" ' +
      'placeholder="Tape un nom / id / tag..." style="width:100%; margin-bottom:6px;">' +
    '<div id="cfg_kmz_' + letter + '_search_list"></div>';
  const input = document.getElementById("cfg_kmz_" + letter + "_search_q");
  const list  = document.getElementById("cfg_kmz_" + letter + "_search_list");
  if (!input || !list) return;
  input.focus();
  let debTimer = null;
  input.addEventListener("input", function() {
    const q = input.value.trim();
    if (debTimer) clearTimeout(debTimer);
    if (!q || !window.SearchPoints || typeof window.SearchPoints.findByQuery !== "function") {
      list.innerHTML = "";
      return;
    }
    debTimer = setTimeout(async function() {
      let results = [];
      try { results = await window.SearchPoints.findByQuery(q) || []; } catch(e) {}
      if (input.value.trim() !== q) return;
      if (results.length === 0) {
        list.innerHTML = '<div class="kta-kmz-search-empty">Aucun résultat pour « ' + q + ' »</div>';
        return;
      }
      list.innerHTML = results.slice(0, 10).map(function(it, i) {
        const p = it.point;
        const nom = p.nom || p.id || "(point)";
        const metaParts = [];
        if (p.id && p.id !== nom) metaParts.push(p.id);
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
          metaParts.push("x=" + p.x + ", y=" + p.y);
        }
        const meta = metaParts.length > 0
          ? '<span class="kta-kmz-search-meta">(' + metaParts.join(" · ") + ')</span>'
          : '';
        return '<div class="kta-kmz-search-item" data-idx="' + i + '">' +
                 '<strong>' + nom + '</strong>' + meta +
               '</div>';
      }).join("");
      list.querySelectorAll(".kta-kmz-search-item").forEach(function(row, i) {
        row.addEventListener("click", function() {
          const p = results[i].point;
          const xEl = document.getElementById("cfg_kmz_" + letter + "_x");
          const yEl = document.getElementById("cfg_kmz_" + letter + "_y");
          if (xEl) xEl.value = p.x;
          if (yEl) yEl.value = p.y;
          res.style.display = "none";
        });
      });
    }, 150);
  });
}

// ───────── 📍 MODE CLIC CARTE (Géoref Réglages — v1.21.0-fix1) ─────────
// Masque temporairement la modale ⚙️ Réglages, active un listener
// `map.on("click")` qui remplit x/y du Point cible et restaure la modale.
// Pattern identique à sessionExporter.js > _kmzActiverModeClic.
let _cfgGeorefClickActive  = false;
let _cfgGeorefClickHandler = null;
let _cfgGeorefClickTarget  = null;

function _cfgActiverModeClicGeoref(letter) {
  if (!window.map) return;
  _cfgDesactiverModeClicGeoref();  // annule un mode précédent éventuel
  _cfgGeorefClickActive = true;
  _cfgGeorefClickTarget = letter;
  _cfgGeorefClickHandler = function(e) {
    const x = e.latlng.lng;
    const y = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) ? (window.APP_CONFIG.imageHeight - e.latlng.lat) : e.latlng.lat;
    const xEl = document.getElementById("cfg_kmz_" + letter + "_x");
    const yEl = document.getElementById("cfg_kmz_" + letter + "_y");
    if (xEl) xEl.value = Math.round(x * 100) / 100;
    if (yEl) yEl.value = Math.round(y * 100) / 100;
    _cfgDesactiverModeClicGeoref();
    const cfgModal = document.getElementById("kta-cfg-modal");
    if (cfgModal) cfgModal.style.display = "";
  };
  window.map.on("click", _cfgGeorefClickHandler);
  // Cache la modale Réglages le temps du clic
  const cfgModal = document.getElementById("kta-cfg-modal");
  if (cfgModal) cfgModal.style.display = "none";
  // Floater visuel pour indiquer le mode (réutilise les classes existantes
  // .kta-iti-floater stylées par la mesure d'itinéraire — visuellement
  // cohérent avec le picker de la modale Enregistrer KMZ).
  const fl = document.createElement("div");
  fl.id = "kta-cfg-georef-click-floater";
  fl.className = "kta-iti-floater";
  fl.innerHTML =
    '<span class="kta-iti-floater-icon">📍</span>' +
    '<span class="kta-iti-floater-msg">Clique sur la carte pour saisir le Point ' + letter + '</span>' +
    '<button class="kta-btn kta-btn-ghost" id="cfg_kmz_click_cancel" type="button">Annuler</button>';
  document.body.appendChild(fl);
  const cancelBtn = document.getElementById("cfg_kmz_click_cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function() {
      _cfgDesactiverModeClicGeoref();
      const m = document.getElementById("kta-cfg-modal");
      if (m) m.style.display = "";
    });
  }
}

function _cfgDesactiverModeClicGeoref() {
  if (!_cfgGeorefClickActive) return;
  _cfgGeorefClickActive = false;
  _cfgGeorefClickTarget = null;
  if (window.map && _cfgGeorefClickHandler) window.map.off("click", _cfgGeorefClickHandler);
  _cfgGeorefClickHandler = null;
  const fl = document.getElementById("kta-cfg-georef-click-floater");
  if (fl) fl.remove();
}

// ───────── 🧭 POSITION INITIALE TRACKER — pickers assistés ─────────
// Parité UX stricte avec les pickers Géoréf ci-dessus, ciblant cfg_startX/Y :
//   - 🔍 Choisir via un point : autocomplete POI → remplit startX/Y
//   - 📍 Cliquer sur la carte : mode pick → clic plan → remplit startX/Y
// startX/Y sont des entiers (parseInt au save) → on arrondit à l'entier.
// Bindés par _bindCfgTrackerStartHandlers() après le rendu de la modale.
function _cfgOuvrirRechercheStart() {
  const res = document.getElementById("cfg_start_search_results");
  if (!res) return;
  res.style.display = "block";
  res.innerHTML =
    '<input type="text" id="cfg_start_search_q" class="kta-cfg-input" ' +
      'placeholder="Tape un nom / id / tag..." style="width:100%; margin-bottom:6px;">' +
    '<div id="cfg_start_search_list"></div>';
  const input = document.getElementById("cfg_start_search_q");
  const list  = document.getElementById("cfg_start_search_list");
  if (!input || !list) return;
  input.focus();
  let debTimer = null;
  input.addEventListener("input", function() {
    const q = input.value.trim();
    if (debTimer) clearTimeout(debTimer);
    if (!q || !window.SearchPoints || typeof window.SearchPoints.findByQuery !== "function") {
      list.innerHTML = "";
      return;
    }
    debTimer = setTimeout(async function() {
      let results = [];
      try { results = await window.SearchPoints.findByQuery(q) || []; } catch(e) {}
      if (input.value.trim() !== q) return;
      if (results.length === 0) {
        list.innerHTML = '<div class="kta-kmz-search-empty">Aucun résultat pour « ' + q + ' »</div>';
        return;
      }
      list.innerHTML = results.slice(0, 10).map(function(it, i) {
        const p = it.point;
        const nom = p.nom || p.id || "(point)";
        const metaParts = [];
        if (p.id && p.id !== nom) metaParts.push(p.id);
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) metaParts.push("x=" + p.x + ", y=" + p.y);
        const meta = metaParts.length > 0
          ? '<span class="kta-kmz-search-meta">(' + metaParts.join(" · ") + ')</span>'
          : '';
        return '<div class="kta-kmz-search-item" data-idx="' + i + '"><strong>' + nom + '</strong>' + meta + '</div>';
      }).join("");
      list.querySelectorAll(".kta-kmz-search-item").forEach(function(row, i) {
        row.addEventListener("click", function() {
          const p = results[i].point;
          const xEl = document.getElementById("cfg_startX");
          const yEl = document.getElementById("cfg_startY");
          if (xEl && Number.isFinite(p.x)) xEl.value = Math.round(p.x);
          if (yEl && Number.isFinite(p.y)) yEl.value = Math.round(p.y);
          res.style.display = "none";
        });
      });
    }, 150);
  });
}

let _cfgStartClickActive  = false;
let _cfgStartClickHandler = null;

function _cfgActiverModeClicStart() {
  if (!window.map) return;
  _cfgDesactiverModeClicStart();  // annule un mode précédent éventuel
  _cfgStartClickActive = true;
  _cfgStartClickHandler = function(e) {
    const x = e.latlng.lng;
    const y = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) ? (window.APP_CONFIG.imageHeight - e.latlng.lat) : e.latlng.lat;
    const xEl = document.getElementById("cfg_startX");
    const yEl = document.getElementById("cfg_startY");
    if (xEl) xEl.value = Math.round(x);
    if (yEl) yEl.value = Math.round(y);
    _cfgDesactiverModeClicStart();
    const cfgModal = document.getElementById("kta-cfg-modal");
    if (cfgModal) cfgModal.style.display = "";
  };
  window.map.on("click", _cfgStartClickHandler);
  const cfgModal = document.getElementById("kta-cfg-modal");
  if (cfgModal) cfgModal.style.display = "none";
  const fl = document.createElement("div");
  fl.id = "kta-cfg-start-click-floater";
  fl.className = "kta-iti-floater";
  fl.innerHTML =
    '<span class="kta-iti-floater-icon">🧭</span>' +
    '<span class="kta-iti-floater-msg">Clique sur la carte pour la position initiale du tracker</span>' +
    '<button class="kta-btn kta-btn-ghost" id="cfg_start_click_cancel" type="button">Annuler</button>';
  document.body.appendChild(fl);
  const cancelBtn = document.getElementById("cfg_start_click_cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function() {
      _cfgDesactiverModeClicStart();
      const m = document.getElementById("kta-cfg-modal");
      if (m) m.style.display = "";
    });
  }
}

function _cfgDesactiverModeClicStart() {
  if (!_cfgStartClickActive) return;
  _cfgStartClickActive = false;
  if (window.map && _cfgStartClickHandler) window.map.off("click", _cfgStartClickHandler);
  _cfgStartClickHandler = null;
  const fl = document.getElementById("kta-cfg-start-click-floater");
  if (fl) fl.remove();
}

// 🐛 v1.28.0 : annule TOUS les modes « cliquer sur la carte » en cours (géoréf,
// départ tracker, itinéraire, + tout floater pick résiduel) et retire la modale
// config si elle avait été masquée par un picker. Appelé par afficherLoader()
// (retour home) — sinon le floater et/ou la modale masquée restaient « ouverts »
// par-dessus l'accueil, avec un handler map.on("click") orphelin.
window._ktaAnnulerModesClicCarte = function() {
  try { _cfgDesactiverModeClicGeoref(); } catch(_) {}
  try { _cfgDesactiverModeClicStart(); } catch(_) {}
  try { if (typeof _desactiverModeClicCarte === "function") _desactiverModeClicCarte(); } catch(_) {}
  // Filet de sécurité : retire tout floater pick résiduel (évitement, KMZ…).
  try { document.querySelectorAll(".kta-iti-floater").forEach(function(f) { f.remove(); }); } catch(_) {}
  // La modale config a pu être masquée (display:none) par un picker → on la
  // retire pour ne pas la laisser fantôme au retour home.
  try { var m = document.getElementById("kta-cfg-modal"); if (m) m.remove(); } catch(_) {}
};

// Bind des 2 boutons de la section 🧭 Position initiale du tracker.
function _bindCfgTrackerStartHandlers() {
  const btnSearch = document.getElementById("cfg_start_search");
  const btnClick  = document.getElementById("cfg_start_click");
  if (btnSearch) btnSearch.addEventListener("click", _cfgOuvrirRechercheStart);
  if (btnClick)  btnClick.addEventListener("click",  _cfgActiverModeClicStart);
}

// =========================

// CONFIG — modale plein écran
// =========================
function afficherConfig() {
  const existing = document.getElementById("kta-cfg-modal");
  if (existing) { existing.remove(); return; }

  const c = APP_CONFIG;

  // Métadonnées du preset perf actif (pour l'affichage read-only)
  const _PRESET_LABELS = {
    "off":         { emoji: "💤", label: "Désactivé" },
    "auto":        { emoji: "🔄", label: "Auto" },
    "quality":     { emoji: "🌟", label: "Qualité" },
    "balanced":    { emoji: "🎯", label: "Équilibré" },
    "performance": { emoji: "⚡", label: "Performance" }
  };
  const presetMeta = _PRESET_LABELS[c.perfPreset] || _PRESET_LABELS.auto;

  const modal = document.createElement("div");
  modal.id = "kta-cfg-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-cfg-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">⚙️ Réglages</span>
        <button class="kta-panneau-close" id="kta-cfg-close">✕</button>
      </div>
      <div class="kta-readme-modal-corps kta-cfg-corps">

        ${(typeof window.renderBannerCoherenceEchelle === "function")
            ? window.renderBannerCoherenceEchelle(window._currentLoadedPlanId, { context: "settings" })
            : ""}

        <!-- 🆕 v1.21.0-fix3 (KARMA "met le mode présentation tout en haut") :
             Bouton "🎬 Activer le mode présentation" en TÊTE de la modale
             (mobile-friendly + accessible en 1 vue). Avant : enfoui dans la
             section 🔍 Affichage en bas. Plus pratique d'avoir cet accès
             rapide visible dès l'ouverture des Réglages. Pour SORTIR sur
             mobile : bouton flottant ✕ créé par presentationMode.js. -->
        <div class="kta-aide-section kta-cfg-presentation-section">
          <button class="kta-btn kta-btn-primary" type="button" id="cfg_presentation_btn"
                  style="width:100%; display:flex; align-items:center; justify-content:center; gap:10px; padding:12px 16px; font-size:14px;">
            <span style="font-size:20px;">🎬</span>
            <span><strong>Activer le mode présentation</strong></span>
          </button>
          <div style="font-size:11.5px; color:#8892a4; margin-top:8px; line-height:1.5; padding:0 4px; text-align:center;">
            Cache header + sidebars + footer pour libérer toute la surface pour la carte.
            Sortie : <kbd>F</kbd> ou <kbd>Échap</kbd> (PC), ou bouton flottant ✕ en haut-droite (mobile).
          </div>
        </div>

        <!-- 🕵️ v1.31.8 F2 + 🆕 v1.31.9 : Mode incognito — bouton qui
             ouvre une NOUVELLE fenêtre dans le même origin avec ?incognito=1
             (activate) OU close la fenêtre courante si déjà incognito (quit).
             Pas un toggle sur la fenêtre courante : l'incognito doit démarrer
             DÈS le boot (sinon les modules ont déjà écrit). Ouvrir un nouvel
             onglet est sémantiquement clair (= comme un onglet privé navigateur). -->
        ${(window.IncognitoMode && window.IncognitoMode.active) ? `
        <div class="kta-aide-section">
          <button class="kta-cfg-incognito-btn kta-cfg-incognito-btn-quit" type="button" id="cfg_incognito_btn">
            <span style="font-size:18px;">✕</span>
            <span><strong>Quitter le mode incognito</strong></span>
          </button>
          <div style="font-size:11.5px; color:#8892a4; margin-top:8px; line-height:1.5; padding:0 4px;">
            Ferme cette fenêtre incognito. <strong>Toutes les données accumulées</strong>
            (points, tracker, notes) <strong>seront perdues</strong>. Ta session principale
            reste intacte dans son onglet.
            <br><span style="color:#a78bfa;">Si le navigateur bloque la fermeture,
            l'onglet recharge automatiquement en mode normal.</span>
          </div>
        </div>` : `
        <div class="kta-aide-section">
          <button class="kta-cfg-incognito-btn" type="button" id="cfg_incognito_btn">
            <span style="font-size:18px;">🕵️</span>
            <span><strong>Démarrer en mode incognito</strong></span>
          </button>
          <div style="font-size:11.5px; color:#8892a4; margin-top:8px; line-height:1.5; padding:0 4px;">
            Ouvre une nouvelle fenêtre où <strong>aucune donnée n'est sauvegardée</strong> (ni
            photos, ni tracker, ni préférences). Idéal pour explorer un plan en démo
            publique, prêter ta session à un tiers ou tester sans polluer ton historique
            local. Bordure violette visible + badge dans le titre rappellent le contexte.
            <br><span style="color:#a78bfa;">Au reload : tout disparaît.</span>
          </div>
        </div>`}

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Position initiale du tracker</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Position X</label>
            <input class="kta-cfg-input" id="cfg_startX" type="number" value="${c.startX}">
            <label class="kta-cfg-label">Position Y</label>
            <input class="kta-cfg-input" id="cfg_startY" type="number" value="${c.startY}">
          </div>
          <!-- 🆕 Saisie assistée de la position de départ (parité UX géoréf) :
               🔍 via un point existant, 📍 au clic sur la carte. Évite la saisie
               manuelle des coordonnées (gros gain de temps). -->
          <div class="kta-kmz-pt-actions" style="margin-top:8px;">
            <button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_start_search" type="button">🔍 Choisir via un point</button>
            <button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_start_click" type="button">📍 Cliquer sur la carte</button>
          </div>
          <div id="cfg_start_search_results" class="kta-kmz-search-results" style="display:none;"></div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">👣 Détection des pas</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Échelle (px/m)</label>
            <div style="display:flex; gap:6px; align-items:center;">
              <input class="kta-cfg-input" id="cfg_scale" type="number" step="0.1" value="${c.scale}" style="flex:1;">
              <button type="button" class="kta-btn kta-btn-ghost"
                onclick="ouvrirCalibrageEchelle()"
                style="padding:6px 10px; font-size:13px; white-space:nowrap;"
                title="Calculer l'échelle à partir d'une mesure réelle">🎯</button>
            </div>
            <label class="kta-cfg-label">Taille d'un pas (m)</label>
            <input class="kta-cfg-input" id="cfg_stepLength" type="number" step="0.1" value="${c.stepLength}">
            <label class="kta-cfg-label">Seuil de détection</label>
            <input class="kta-cfg-input" id="cfg_stepThreshold" type="number" step="0.1" value="${c.stepThreshold}">
            <label class="kta-cfg-label">Cooldown (ms)</label>
            <input class="kta-cfg-input" id="cfg_stepCooldown" type="number" value="${c.stepCooldown}">
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🧭 Navigation intelligente</div>
          <label class="kta-perf-ultra-row" style="margin-top:0;">
            <input type="checkbox" id="cfg_smartNav" ${c.smartNav === true ? "checked" : ""}>
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">🧭 Caler la position sur les tracés</span>
              <span class="kta-perf-ultra-hint">
                Décoché par défaut. Quand le plan possède un <strong>réseau de tracés</strong>,
                la position estimée est <strong>recalée sur la galerie la plus proche</strong> pour
                compenser la dérive des capteurs (boussole / pas). Hors réseau, retour automatique
                au comportement actuel. Sans tracés sur le plan, l'option reste sans effet.
              </span>
            </span>
          </label>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🔍 Affichage</div>
          <label class="kta-perf-ultra-row kta-perf-ultra-row-danger" style="margin-top:0;">
            <input type="checkbox" id="cfg_scaledMarkers" ${c.scaledMarkers !== false ? "checked" : ""}>
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">📐 Adapter la taille des icônes au zoom</span>
              <span class="kta-perf-ultra-hint">
                Coché par défaut : les icônes des points rétrécissent quand tu dézoomes
                (taille relative au plan constante). <strong>Décocher</strong> = comportement Leaflet
                standard (icônes taille écran fixe, elles deviennent énormes au dézoom).
                <strong>Reload requis</strong> après changement.
              </span>
            </span>
          </label>
          <!-- 🆕 v1.9.2 : le toggle "⚪ Afficher les ronds aux intersections
               de tracés" était initialement aussi ici, retiré sur feedback
               KARMA "enleve du menu carte la possibilité activer ou non les
               rond, reste uniquement sur le home". L'option reste accessible
               UNIQUEMENT depuis ⚙️ Configuration du loader/home (cf. index.html
               > #loaderShowIntersectionsCb). Logique : c'est une pref d'affichage
               qui survit aux changements de plan, son toggle "à la racine" suffit. -->

          <!-- 🆕 v1.21.0-fix3 (KARMA) : bouton "🎬 Activer le mode présentation"
               DÉPLACÉ TOUT EN HAUT de la modale Réglages (avant la 1ère section)
               pour accès en 1 vue dès l'ouverture, mobile-friendly. -->

          <!-- 🆕 v1.21.1+ (KARMA) : toggle Wake Lock API — empêche l'écran de
               s'éteindre tant que l'app est ouverte. Utile cataphile pour ne
               pas avoir à débloquer son téléphone toutes les 30s en cavité.
               Compatibilité : Chrome 84+, Edge 84+, Safari iOS 16.4+ (PWA),
               PAS Firefox (Bug 1589554). Toggle masqué automatiquement si
               l'API n'est pas supportée. -->
          <label class="kta-perf-ultra-row" id="cfg_wake_lock_row" style="margin-top:8px; display:none;">
            <input type="checkbox" id="cfg_wake_lock">
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">🔆 Garder l'écran allumé (Wake Lock)</span>
              <span class="kta-perf-ultra-hint">
                Empêche la mise en veille de l'écran tant que l'app est ouverte.
                <strong>Idéal en cavité</strong> pour ne pas avoir à débloquer son téléphone
                toutes les 30s. Persistant entre sessions. Le wake lock est auto-relâché
                quand tu changes d'onglet/app, et ré-activé au retour si la case est cochée.
              </span>
            </span>
          </label>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">🛠️ Debug</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">Logs détaillés</label>
            <select class="kta-cfg-input" id="cfg_debugMode">
              <option value="true"  ${c.debugMode ? "selected" : ""}>Oui</option>
              <option value="false" ${!c.debugMode ? "selected" : ""}>Non</option>
            </select>
          </div>

          <div style="display:flex; align-items:center; gap:12px; margin-top:12px;">
            <div style="flex:1;">
              <div style="font-size:13px; font-weight:600; color:#e8eaf0;">Mode performance</div>
              <div style="font-size:11px; color:#8892a4; margin-top:2px;">Modifiable au chargement du plan</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(255,255,255,0.04); border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
              <span style="font-size:22px;">${presetMeta.emoji}</span>
              <span style="font-size:15px; font-weight:600; color:#e8eaf0;">${presetMeta.label}</span>
            </div>
          </div>
        </div>

        ${_renderPerfUltraSection()}

        ${_renderCfgGeorefSection()}

        <!--
          🆕 v1.7.3 (suite KARMA) : bouton 🗑️ Réinitialiser RETIRÉ de la modale ⚙️
          Réglages en mode carte. Le reset complet reste accessible UNIQUEMENT
          depuis la modale ⚙️ Configuration du loader (home). Raison : limiter
          les déclenchements accidentels une fois un plan chargé (l'user perd
          potentiellement sa session active + tous ses plans mémorisés en 2 clics).
          Pour reset depuis la map : passer par 🗂️ titre cliquable → home → ⚙️
          Configuration → 💥 Tout réinitialiser.
        -->
        <div class="kta-cfg-actions-bar">
          <button class="kta-btn kta-btn-ghost"   onclick="resetConfig()">Reset</button>
          <button class="kta-btn kta-btn-primary"  onclick="appliquerConfig()">Appliquer</button>
          <button class="kta-btn kta-btn-ghost"    onclick="afficherLogsDebug()">🐛 Logs</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);
  document.getElementById("kta-cfg-close").addEventListener("click", function () { modal.remove(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.remove(); });

  // 🆕 v1.26.1 — Bind bouton "📋 Copier" du banner cohérence échelle (si affiché)
  if (typeof window.attacherBoutonCopierEchelleGps === "function") {
    window.attacherBoutonCopierEchelleGps(modal);
  }

  // 🚀 PerfUltra : bind les change events sur les toggles de la section Perf Ultra
  _bindPerfUltraToggles();

  // 🌐 v1.14.19 (KARMA « rajoute la possibilité de faire le géo référencement
  // depuis les paramètres en mode map, auto remplis ensuite si je retourne
  // dans exporter ») : bind les handlers de la nouvelle section
  // 🌐 Géoréférencement GPS. Sauve via KmzExport.setCalibration(planId, c)
  // → pré-rempli automatiquement à l'ouverture de la modale 📡 Export externe
  // (sessionExporter > _renderCalibrageCommun lit KmzExport.getCalibration).
  _bindCfgGeorefHandlers();

  // 🧭 Position initiale du tracker : boutons 🔍 via un point / 📍 cliquer carte.
  _bindCfgTrackerStartHandlers();

  // 🎬 v1.21.0-fix2 (KARMA mobile-friendly) : bouton "Activer le mode
  // présentation" dans la section 🔍 Affichage. Sur mobile, la touche F
  // est inaccessible faute de clavier physique → ce bouton est le seul
  // chemin pour entrer dans le mode. Sortie : touche F/Échap (PC) ou
  // bouton flottant ✕ injecté par presentationMode.js > activate().
  const btnPresentation = document.getElementById("cfg_presentation_btn");
  if (btnPresentation) {
    btnPresentation.addEventListener("click", function() {
      // Ferme la modale Réglages AVANT d'activer le mode (sinon le mode
      // présentation laisse la modale ouverte par-dessus la carte).
      const cfgModal = document.getElementById("kta-cfg-modal");
      if (cfgModal) cfgModal.remove();
      // Active après un micro-délai pour laisser le DOM se nettoyer.
      setTimeout(function() {
        if (window.PresentationMode && typeof window.PresentationMode.activate === "function") {
          window.PresentationMode.activate();
        } else {
          alert("Module PresentationMode indisponible.");
        }
      }, 50);
    });
  }

  // 🕵️ v1.31.8 F2 + 🆕 v1.31.9 — Bouton dynamique "Démarrer / Quitter
  // le mode incognito" selon l'état IncognitoMode.active.
  //   • Pas incognito → "Démarrer" → IncognitoMode.launch() ouvre nouvelle
  //     fenêtre ?incognito=1 (ne mute pas la fenêtre courante).
  //   • Incognito → "Quitter" → IncognitoMode.quit() tente window.close()
  //     puis fallback navigate sans ?incognito=1.
  const btnIncognito = document.getElementById("cfg_incognito_btn");
  if (btnIncognito) {
    btnIncognito.addEventListener("click", function() {
      if (!window.IncognitoMode) {
        alert("Module IncognitoMode indisponible. Recharge la page.");
        return;
      }
      if (window.IncognitoMode.active) {
        // Confirm avant quit (perte de données potentielle)
        if (confirm("Quitter le mode incognito ?\n\nTous les points/notes/tracker accumulés dans cette fenêtre seront perdus.")) {
          window.IncognitoMode.quit();
        }
      } else {
        window.IncognitoMode.launch();
      }
    });
  }

  // 🆕 v1.21.1+ (KARMA Wake Lock) : toggle "Garder l'écran allumé".
  // Visible UNIQUEMENT si l'API navigator.wakeLock est supportée par le
  // browser (Chrome/Edge/Safari iOS 16.4+, PAS Firefox).
  // Sync UI ↔ state via window.WakeLock.isEnabled() + setEnabled().
  const wlRow = document.getElementById("cfg_wake_lock_row");
  const wlCb  = document.getElementById("cfg_wake_lock");
  if (wlRow && wlCb && window.WakeLock) {
    if (window.WakeLock.isSupported()) {
      wlRow.style.display = "";  // révèle (default = none pour rétrocompat)
      wlCb.checked = window.WakeLock.isEnabled();
      wlCb.addEventListener("change", function() {
        window.WakeLock.setEnabled(wlCb.checked);
        // Feedback toast (optionnel, discret)
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(
            wlCb.checked
              ? "🔆 Écran maintenu allumé tant que l'app est ouverte"
              : "🔅 Mise en veille écran ré-activée",
            "info"
          );
        }
      });
    } else {
      // API pas supportée → on garde le row caché (display:none par défaut
      // dans le HTML). Pas de message UI (ne pas frustrer l'user Firefox).
    }
  }

  // 🏗️ Multi-niveau : section UI retirée v1.7.3 (KARMA) — activation
  // uniquement via le générateur de plan désormais. Les fonctions
  // _renderMultiLevelSection et _bindMultiLevelToggle restent définies
  // dans le code pour rétro-compat (lecture) mais ne sont plus appelées.
  // La cascade APP_CONFIG.multiLevel ← PlanRegistry[id].multiLevel ← PLAN_CONFIG.plan.multiLevel
  // reste fonctionnelle (cf §26 CLAUDE.md) — un user qui avait toggle via
  // Réglages avant v1.7.3 garde son état persisté en PlanRegistry.
}

function appliquerConfig() {
  // 🐛 v1.28.0 : on mémorise la position initiale AVANT écrasement pour ne
  // réinitialiser la position du tracker QUE si startX/startY a réellement
  // changé (cf plus bas). Sinon un simple toggle (smartNav…) ou un changement
  // d'échelle replaçait le tracker au départ → perte de la position courante.
  const _oldStartX = APP_CONFIG.startX;
  const _oldStartY = APP_CONFIG.startY;

  APP_CONFIG.scale         = parseFloat(document.getElementById("cfg_scale").value);
  APP_CONFIG.stepLength    = parseFloat(document.getElementById("cfg_stepLength").value);
  // 🐛 v1.28.0 (#3) : ne pas écraser startX/startY avec NaN si le champ est
  // vidé (sinon le reset conditionnel placerait le tracker à NaN). On conserve
  // l'ancienne valeur si la saisie est invalide.
  const _sx = parseInt(document.getElementById("cfg_startX").value, 10);
  const _sy = parseInt(document.getElementById("cfg_startY").value, 10);
  if (Number.isFinite(_sx)) APP_CONFIG.startX = _sx;
  if (Number.isFinite(_sy)) APP_CONFIG.startY = _sy;
  APP_CONFIG.stepThreshold = parseFloat(document.getElementById("cfg_stepThreshold").value);
  APP_CONFIG.stepCooldown  = parseInt(document.getElementById("cfg_stepCooldown").value, 10);
  // ⚠️ Passer par setDebugMode() au lieu d'ecrire directement APP_CONFIG.debugMode :
  // ainsi le toast feedback (copyright.js > __MKM_showWarning__) se declenche
  // si l'utilisateur passe de OFF a ON via les Reglages.
  const newDebugMode = document.getElementById("cfg_debugMode").value === "true";
  if (typeof window.setDebugMode === "function") {
    window.setDebugMode(newDebugMode);
  } else {
    APP_CONFIG.debugMode = newDebugMode;
  }

  // 🔍 v174 : scaledMarkers (lu une fois à creerIcones + au hook zoom, reload requis)
  const cbScaled = document.getElementById("cfg_scaledMarkers");
  if (cbScaled) APP_CONFIG.scaledMarkers = !!cbScaled.checked;

  // 🧭 Nav Intelligente C2 : toggle smartNav (pref globale, défaut OFF). Lu à
  // chaud par tracking.js > avancer() — pas de reload requis.
  const cbSmartNav = document.getElementById("cfg_smartNav");
  if (cbSmartNav) APP_CONFIG.smartNav = !!cbSmartNav.checked;

  // 🆕 v1.9.2 : le handler de showRoadIntersections en mode carte a été retiré
  // (toggle exclusivement dans le ⚙️ Configuration du loader/home désormais).
  // La valeur reste lue depuis APP_CONFIG par road.js > renderRoads()
  // peu importe d'où elle a été modifiée.

  if (window.sauvegarderPrefsUtilisateur) sauvegarderPrefsUtilisateur();
  // 🐛 v1.28.0 : ne replacer le tracker au départ QUE si la position initiale
  // (startX/startY) a explicitement changé. Pour tout autre réglage (toggle
  // smartNav, échelle, seuil de pas…), on PRÉSERVE la position courante + le
  // tracé. (Avant : reset systématique → le tracker sautait à l'origine.)
  const _startChanged = (APP_CONFIG.startX !== _oldStartX) || (APP_CONFIG.startY !== _oldStartY);
  if (window.resetTrackingPosition && _startChanged) window.resetTrackingPosition();
  const modal = document.getElementById("kta-cfg-modal");
  if (modal) modal.remove();
  if (window.fermerPanneau) window.fermerPanneau();
}

function resetConfig() {
  Object.assign(APP_CONFIG, DEFAULT_CONFIG);
  if (window.sauvegarderPrefsUtilisateur) sauvegarderPrefsUtilisateur();
  if (window.resetTrackingPosition) window.resetTrackingPosition();
  const modal = document.getElementById("kta-cfg-modal");
  if (modal) modal.remove();
  if (window.fermerPanneau) window.fermerPanneau();
}

// =========================
// 🏗️ MULTI-NIVEAU — modales et helpers (depuis v148)
// =========================
// _ouvrirSelecteurNiveau : modal complète gérant 2 dimensions :
//   1. NIVEAU ACTIF (single-select) → utilisé pour DESSINER nouvelles roads/points/zones
//   2. NIVEAUX VISIBLES (multi-select) → filtre d'AFFICHAGE
// Apparaît au clic sur la pastille "Niv X" dans le groupe Tracés.
// Changer le niveau actif → coupe le mode road en cours ET reset le filtre
// visible à [newActive] (mode focalisé par défaut).
function _ouvrirSelecteurNiveau(btnPastille) {
  if (document.getElementById("kta-niv-modal")) return;

  const cur = APP_CONFIG.activeLevel || 0;
  const visibles = Array.isArray(APP_CONFIG.visibleLevels) ? APP_CONFIG.visibleLevels.slice() : [cur];
  const levels = Array.isArray(APP_CONFIG.availableLevels) && APP_CONFIG.availableLevels.length
    ? APP_CONFIG.availableLevels.slice()
    : [-2, -1, 0, 1, 2];
  // 🏗️ v154 : tri croissant pour affichage horizontal naturel -2 → +2 (gauche
  // a droite = negatif a positif, comme un axe numerique). availableLevels en
  // memoire peut etre dans n'importe quel ordre (apres push/unshift par les
  // boutons +/-), on trie systematiquement avant rendu.
  levels.sort(function(a, b) { return a - b; });

  // Segmented (niveau actif) : boutons radio visuels, encadres de [-] et [+]
  let segmented = "";
  levels.forEach(function(lvl) {
    const active = (lvl === cur);
    segmented +=
      '<button type="button" class="kta-niv-seg-btn' + (active ? ' kta-actif' : '') +
      '" data-level="' + lvl + '">' + lvl + '</button>';
  });

  // Checkboxes (niveaux visibles) - meme ordre croissant
  let checkboxes = "";
  levels.forEach(function(lvl) {
    const checked = (visibles.indexOf(lvl) >= 0);
    checkboxes +=
      '<label class="kta-niv-vis-box">' +
        '<input type="checkbox" data-level="' + lvl + '"' + (checked ? ' checked' : '') + '>' +
        '<span class="kta-niv-vis-label">Niv ' + lvl + '</span>' +
      '</label>';
  });

  const overlay = document.createElement("div");
  overlay.id = "kta-niv-modal";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-niv-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">🏗️ Niveaux</span>' +
        '<button class="kta-panneau-close" id="kta-niv-close" type="button" aria-label="Fermer">&times;</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +

        // SECTION 1 : Niveau actif (single-select)
        '<div class="kta-niv-section">' +
          '<div class="kta-niv-section-titre">🎯 Niveau actif (pour dessiner)</div>' +
          '<p class="kta-niv-section-hint">' +
            'Tous les nouveaux éléments (tracés, points, zones, tracker recalé) seront ' +
            'tagués avec ce niveau.' +
          '</p>' +
          '<div class="kta-niv-segmented">' +
            '<button type="button" class="kta-niv-seg-btn kta-niv-seg-add" id="kta-niv-sub" title="Ajouter un niveau en-dessous (min - 1)">−</button>' +
            segmented +
            '<button type="button" class="kta-niv-seg-btn kta-niv-seg-add" id="kta-niv-add" title="Ajouter un niveau au-dessus (max + 1)">+</button>' +
          '</div>' +
        '</div>' +

        // SECTION 2 : Niveaux visibles (multi-select)
        '<div class="kta-niv-section">' +
          '<div class="kta-niv-section-titre">👁️ Niveaux visibles (filtre)</div>' +
          '<p class="kta-niv-section-hint">' +
            'Coche les niveaux que tu veux afficher sur la carte. Les jonctions sont ' +
            'visibles si au moins un de leurs endpoints touche un niveau coché.' +
          '</p>' +
          '<div class="kta-niv-vis-grid">' + checkboxes + '</div>' +
          '<div class="kta-niv-vis-actions">' +
            '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-niv-vis-all">Tous</button>' +
            '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-niv-vis-active">Actif seul</button>' +
          '</div>' +
        '</div>' +

        '<p style="font-size:11.5px; color:#8892a4; margin:6px 0 0 0; line-height:1.5;">' +
          '⚠️ Changer le niveau actif <strong>annule</strong> tout tracé en cours et ' +
          'reset le filtre visibles à [actif].' +
        '</p>' +
      '</div>' +
    '</div>';

  document.documentElement.appendChild(overlay);

  function _cleanup() {
    if (overlay.parentNode) overlay.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) { if (e.key === "Escape") _cleanup(); }
  overlay.addEventListener("click", function(e) { if (e.target === overlay) _cleanup(); });
  document.addEventListener("keydown", _onKey);
  document.getElementById("kta-niv-close").addEventListener("click", _cleanup);

  // v155 : segmented en mode nowrap (scroll horizontal si trop de niveaux).
  // Scroll vers le bouton actif pour qu'il soit visible a l'ouverture.
  setTimeout(function() {
    const activeBtn = overlay.querySelector(".kta-niv-seg-btn.kta-actif");
    if (activeBtn && typeof activeBtn.scrollIntoView === "function") {
      try {
        activeBtn.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
      } catch(e) {
        // Fallback Safari (pas de "instant" sur vieille version)
        try { activeBtn.scrollIntoView({ block: "nearest", inline: "center" }); } catch(e2) {}
      }
    }
  }, 0);

  // Clic sur un niveau actif : applique + ferme
  overlay.querySelectorAll(".kta-niv-seg-btn[data-level]").forEach(function(b) {
    b.addEventListener("click", function() {
      const lvl = parseInt(b.dataset.level, 10);
      if (!Number.isInteger(lvl)) return;
      _changerNiveauActif(lvl);
      _cleanup();
    });
  });

  // Bouton + : ajoute un niveau au-dela du max existant (vers le haut)
  const addBtn = document.getElementById("kta-niv-add");
  if (addBtn) {
    addBtn.addEventListener("click", function() {
      const maxLvl = Math.max.apply(null, APP_CONFIG.availableLevels || [0]);
      APP_CONFIG.availableLevels = (APP_CONFIG.availableLevels || []).concat(maxLvl + 1);
      window.APP_CONFIG = APP_CONFIG;
      _cleanup();
      _ouvrirSelecteurNiveau(btnPastille);
    });
  }

  // 🏗️ v154 : Bouton − : ajoute un niveau en-dessous du min existant
  const subBtn = document.getElementById("kta-niv-sub");
  if (subBtn) {
    subBtn.addEventListener("click", function() {
      const minLvl = Math.min.apply(null, APP_CONFIG.availableLevels || [0]);
      APP_CONFIG.availableLevels = (APP_CONFIG.availableLevels || []).concat(minLvl - 1);
      window.APP_CONFIG = APP_CONFIG;
      _cleanup();
      _ouvrirSelecteurNiveau(btnPastille);
    });
  }

  // Checkboxes filtre visible : toggle a la volee → applique le filtre
  overlay.querySelectorAll(".kta-niv-vis-box input[type=checkbox]").forEach(function(cb) {
    cb.addEventListener("change", function() {
      const lvl = parseInt(cb.dataset.level, 10);
      if (!Number.isInteger(lvl)) return;
      let arr = Array.isArray(APP_CONFIG.visibleLevels) ? APP_CONFIG.visibleLevels.slice() : [];
      if (cb.checked) {
        if (arr.indexOf(lvl) < 0) arr.push(lvl);
      } else {
        arr = arr.filter(function(l) { return l !== lvl; });
      }
      APP_CONFIG.visibleLevels = arr;
      window.APP_CONFIG = APP_CONFIG;
      if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    });
  });

  // Quick action : "Tous" coche toutes les boites
  const allBtn = document.getElementById("kta-niv-vis-all");
  if (allBtn) {
    allBtn.addEventListener("click", function() {
      APP_CONFIG.visibleLevels = levels.slice();
      window.APP_CONFIG = APP_CONFIG;
      // Update DOM checkboxes
      overlay.querySelectorAll(".kta-niv-vis-box input[type=checkbox]").forEach(function(cb) {
        cb.checked = true;
      });
      if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    });
  }
  // Quick action : "Actif seul"
  const activeBtn = document.getElementById("kta-niv-vis-active");
  if (activeBtn) {
    activeBtn.addEventListener("click", function() {
      const lvl = APP_CONFIG.activeLevel || 0;
      APP_CONFIG.visibleLevels = [lvl];
      window.APP_CONFIG = APP_CONFIG;
      overlay.querySelectorAll(".kta-niv-vis-box input[type=checkbox]").forEach(function(cb) {
        cb.checked = parseInt(cb.dataset.level, 10) === lvl;
      });
      if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    });
  }
}

// Applique le changement de niveau actif : coupe le mode road en cours (Q5),
// reset le filtre visibles a [newActive] (mode focalise), met a jour la
// pastille, propage le filtre a tous les modules.
function _changerNiveauActif(newLevel) {
  // v155 fix : retire le check newLevel < 0 qui bloquait les niveaux negatifs
  // (reste de v148 quand availableLevels etait [0..3] strict). Depuis v154 on
  // supporte les sous-sols (-1, -2, …), donc tout entier est valide.
  if (!Number.isInteger(newLevel)) return;

  // Annule le tracé en cours
  if (typeof _fermerModeRoad === "function") _fermerModeRoad();

  APP_CONFIG.activeLevel   = newLevel;
  APP_CONFIG.visibleLevels = [newLevel];  // reset filtre au mode focalise
  window.APP_CONFIG = APP_CONFIG;

  // Mise à jour de la pastille dans la sidebar (chiffre seul, pas de prefixe)
  const pill = document.getElementById("kta-niv-pastille-icone");
  if (pill) pill.textContent = String(newLevel);

  // Propage le filtre a tous les modules level-aware
  if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();

  console.log("[MultiNiveau] Niveau actif →", newLevel, "| Visibles :", APP_CONFIG.visibleLevels);
}

// 🏗️ Multi-niveau : helper global qui re-render / re-filtre TOUS les modules
// level-aware. Appele apres tout changement de visibleLevels.
// Chaque module expose _applyLevelFilterTo*() qui itere ses markers et
// applique setOpacity selon le filtre courant.
window.appliquerFiltreNiveau = function() {
  // Roads + zones de session : re-render complet (filtre applique au build)
  if (typeof window.renderRoads === "function") {
    try { window.renderRoads(); } catch(e) {}
  }
  if (typeof window.renderZones === "function") {
    try { window.renderZones(); } catch(e) {}
  }
  // 🆕 v1.9.3-A1.a-fix5 : structures de session re-render aussi au
  // changement de niveau (sinon les piliers/murs restaient figés à
  // la visibilité du niveau initial).
  if (typeof window.renderStructures === "function") {
    try { window.renderStructures(); } catch(e) {}
  }
  // Markers / points des layers DATA (puits, cataphile, etc.)
  if (typeof window._applyLevelFilterToDataPoints === "function") {
    try { window._applyLevelFilterToDataPoints(); } catch(e) {}
  }
  // Routes embarquees dans les calques DATA (json.roads[])
  if (typeof window._applyLevelFilterToDataRoads === "function") {
    try { window._applyLevelFilterToDataRoads(); } catch(e) {}
  }
  // Zones embarquees dans les calques DATA (json.zones[])
  if (typeof window._applyLevelFilterToDataZones === "function") {
    try { window._applyLevelFilterToDataZones(); } catch(e) {}
  }
  // 🆕 v1.9.3-A1.a-fix5 : structures embarquées dans les calques DATA
  // (json.structures[]). Sans cet appel, les piliers/murs data layer
  // restaient figés à la visibilité du niveau initial au boot et ne
  // re-filtraient pas au changement de niveau.
  if (typeof window._applyLevelFilterToDataStructures === "function") {
    try { window._applyLevelFilterToDataStructures(); } catch(e) {}
  }
  // Points editor (session)
  if (typeof window._applyLevelFilterToEditorPoints === "function") {
    try { window._applyLevelFilterToEditorPoints(); } catch(e) {}
  }
  // Tracker marker + polyline parcouru
  if (typeof window._applyLevelFilterToTracker === "function") {
    try { window._applyLevelFilterToTracker(); } catch(e) {}
  }
  // 🏗️ v162 : Image layers (calques image du plan : legende, etc.) qui ont
  // un champ `level`. Force addLayer/removeLayer selon visibleLevels. Modale
  // Niveaux = authority (override le checkbox Leaflet).
  if (typeof window._applyLevelFilterToImageLayers === "function") {
    try { window._applyLevelFilterToImageLayers(); } catch(e) {}
  }

  // 🆕 v1.21.5 (KARMA "refonte filtre Leaflet") : sync M-LVL bidirectionnel.
  // Quand visibleLevels change (via modale Niveaux), notifie FilterPanel pour
  // qu'il rafraîchisse la section M-LVL si la modale est ouverte.
  if (window.FilterPanel && typeof window.FilterPanel.onLevelChange === "function") {
    try { window.FilterPanel.onLevelChange(); } catch(e) {}
  }
};

// 🆕 v1.21.5 (KARMA "refonte filtre Leaflet") : helper global qui cascade
// le re-render après changement des filtres runtime (tags, types, etc.).
// Alias de appliquerFiltreNiveau car les modules level-aware appliquent
// aussi window._ktaRuntimeFilters dans la même passe de rendu.
window.appliquerFiltreRuntime = function() {
  if (typeof window.appliquerFiltreNiveau === "function") {
    window.appliquerFiltreNiveau();
  }
};

// _ouvrirCreationJonction : modal pour saisir fromLevel/toLevel avant
// d'activer le mode tracé jonction.
function _ouvrirCreationJonction(btnSub) {
  if (document.getElementById("kta-jct-modal")) return;

  const cur = APP_CONFIG.activeLevel || 0;
  const levels = Array.isArray(APP_CONFIG.availableLevels) && APP_CONFIG.availableLevels.length
    ? APP_CONFIG.availableLevels.slice()
    : [-2, -1, 0, 1, 2];
  // v154 : tri croissant pour cohrence avec la modale Niveaux
  levels.sort(function(a, b) { return a - b; });

  // Options du select : tous les niveaux dispo
  function _optionsHtml(selectedLevel) {
    return levels.map(function(l) {
      return '<option value="' + l + '"' + (l === selectedLevel ? ' selected' : '') + '>' +
             'Niveau ' + l + '</option>';
    }).join('');
  }

  // Defaut : depuis le niveau actif vers le niveau juste au-dessus
  const defaultTo = (cur === 0 && levels.indexOf(1) >= 0) ? 1
                  : (cur + 1 <= Math.max.apply(null, levels) ? cur + 1
                  : Math.max.apply(null, levels));

  const overlay = document.createElement("div");
  overlay.id = "kta-jct-modal";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-jct-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">🪜 Nouvelle jonction interniveau</span>' +
        '<button class="kta-panneau-close" id="kta-jct-close" type="button" aria-label="Fermer">&times;</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="margin:0 0 12px 0; font-size:13px; color:#c8d0e0;">' +
          'Cette jonction (escalier, pente raide, puits interne) relie deux niveaux.' +
        '</p>' +
        '<div class="kta-jct-grille">' +
          '<label class="kta-cfg-label">Niveau de départ</label>' +
          '<select class="kta-cfg-input" id="kta-jct-from">' + _optionsHtml(cur) + '</select>' +
          '<label class="kta-cfg-label">Niveau d\'arrivée</label>' +
          '<select class="kta-cfg-input" id="kta-jct-to">' + _optionsHtml(defaultTo) + '</select>' +
        '</div>' +
        '<p style="font-size:11.5px; color:#8892a4; margin:12px 0 0 0; line-height:1.5;">' +
          'Après OK, clique sur la carte pour poser les points de la jonction (autant que tu veux). ' +
          'Le tracé sera magenta pointillé et restera toujours visible peu importe le niveau actif.' +
        '</p>' +
      '</div>' +
      '<div class="kta-tracker-warn-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-jct-cancel" type="button">Annuler</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-jct-ok"     type="button">OK — Tracer la jonction</button>' +
      '</div>' +
    '</div>';

  document.documentElement.appendChild(overlay);

  function _cleanup() {
    if (overlay.parentNode) overlay.remove();
    document.removeEventListener("keydown", _onKey);
  }
  function _onKey(e) { if (e.key === "Escape") _cleanup(); }
  overlay.addEventListener("click", function(e) { if (e.target === overlay) _cleanup(); });
  document.addEventListener("keydown", _onKey);
  document.getElementById("kta-jct-close").addEventListener("click", _cleanup);
  document.getElementById("kta-jct-cancel").addEventListener("click", _cleanup);

  document.getElementById("kta-jct-ok").addEventListener("click", function() {
    const fromLvl = parseInt(document.getElementById("kta-jct-from").value, 10);
    const toLvl   = parseInt(document.getElementById("kta-jct-to").value,   10);
    if (!Number.isInteger(fromLvl) || !Number.isInteger(toLvl)) return;
    if (fromLvl === toLvl) {
      alert("Les niveaux de départ et d'arrivée doivent être différents.");
      return;
    }
    _cleanup();
    // Stocke la meta pour que road.js > mousedown la lise au premier clic
    window._jonctionPendingMeta = { fromLevel: fromLvl, toLevel: toLvl };
    // Active le mode tracé "jonction"
    _activerJonctionMode(btnSub, fromLvl, toLvl);
  });
}

// Active le mode tracé jonction (utilise le même pattern que _activerRoute
// mais avec type "jonction" + icone reflet 🪜).
function _activerJonctionMode(btnCible, fromLvl, toLvl) {
  // Replique _activerRoute en inline : on est en scope module, alors que
  // _activerRoute est dans initInterface (closure sur _groupes etc.).
  //
  // ⚠️ Bug v148.test : sans _desactiverTousLesModes() ici, activer la jonction
  // alors qu'un autre mode est actif (✏️ point, 📐 mesure, ⬛ zone, etc.) laisse
  // les 2 modes actifs en parallele → clic carte declenche plusieurs handlers
  // contradictoires. Fix : on tue tout avant de demarrer la jonction.
  _desactiverTousLesModes();

  toggleRoadMode("jonction");  // sets window.modeRoad = "jonction"
  if (btnCible) btnCible.classList.add("kta-actif");
  const grp = _groupes["traces"];
  _modesActifs["road"] = {
    btnEl: btnCible,
    desactiverFn: function() {
      if (window.modeRoad) toggleRoadMode(window.modeRoad);
      if (grp) grp.subActions.forEach(function(b) { b.classList.remove("kta-actif"); });
      _setGroupeModeActif("traces", false);
      window._jonctionPendingMeta = null;
    }
  };
  _setGroupeModeActif("traces", true, "🪜");
  console.log("[MultiNiveau] Jonction mode activé :", fromLvl, "→", toLvl);
}


// =========================
// 🏗️ MULTI-NIVEAU — Leaflet control top-left (pastille niveau actif)
// =========================
// Bouton carré 30x30 sous les boutons de zoom, style coherent avec les autres
// controles Leaflet (.leaflet-bar). Au clic → ouvre la modale niveau (active +
// visibles). Affiche le chiffre du niveau actif dans une pastille jaune.
// Refresh automatique du chiffre via getElementById("kta-niv-pastille-icone")
// dans _changerNiveauActif (l'ID est dans le span).
function _initLevelFilterControl() {
  if (!window.map) return;
  if (!window.APP_CONFIG || window.APP_CONFIG.multiLevel !== true) return;
  // Pour eviter de dupliquer si initInterface est appele 2 fois (shouldn't
  // happen mais safety net) : on detruit le precedent control si present.
  if (window._levelFilterControl) {
    try { window.map.removeControl(window._levelFilterControl); } catch(e) {}
    window._levelFilterControl = null;
  }

  const ctrl = L.control({ position: "topleft" });
  ctrl.onAdd = function() {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control kta-level-control");
    const a   = L.DomUtil.create("a", "kta-level-btn", div);
    a.href      = "javascript:void(0)";
    a.title     = "Niveau actif — Cliquer pour changer / filtrer";
    a.innerHTML = '<span class="kta-niv-pastille" id="kta-niv-pastille-icone">' +
                  (APP_CONFIG.activeLevel || 0) + '</span>';
    // Empeche les events de propager a la carte (clic-pan + zoom-wheel)
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    L.DomEvent.on(a, "click", function(e) {
      L.DomEvent.stop(e);
      _ouvrirSelecteurNiveau(a);
    });
    return div;
  };
  ctrl.addTo(window.map);
  window._levelFilterControl = ctrl;
  console.log("[MultiNiveau] Level filter control créé (top-left)");
}

// ==========================================
// EXPORTS WINDOW (v1.31.0 P3 Lot 9)
// ==========================================
// 3 fonctions publiques classiques (étaient dans le bloc EXPORT
// GLOBAL de interface.js, lignes 3294-3296 avant ce lot) :
window.afficherConfig  = afficherConfig;
window.appliquerConfig = appliquerConfig;
window.resetConfig     = resetConfig;

// 2 helpers privés rendus publics (appelés depuis interface.js
// par leur identifier local — patches en window.X dans interface.js
// pour qu'ils continuent à fonctionner post-extraction) :
window._initLevelFilterControl = _initLevelFilterControl;
window._ouvrirCreationJonction  = _ouvrirCreationJonction;
