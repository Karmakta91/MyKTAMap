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
      <div class="kta-aide-section-titre">${window.I18n.t("config.perfultra.titre")}</div>
      <p style="font-size:11.5px; color:#8892a4; margin:0 0 10px 0; line-height:1.5;">
        ${window.I18n.t("config.perfultra.intro")}
      </p>
      ${row("cfg_perf_ultra", window.I18n.t("config.perfultra.ultra.label"), s.ultra,
            window.I18n.t("config.perfultra.ultra.hint"))}
      <div style="border-top:1px solid rgba(255,255,255,0.08); margin:10px 0; padding-top:8px;"></div>
      ${row("cfg_perf_decim", window.I18n.t("config.perfultra.decim.label"), s.decim,
            window.I18n.t("config.perfultra.decim.hint"))}
      ${row("cfg_perf_animOff", window.I18n.t("config.perfultra.animOff.label"), s.animOff,
            window.I18n.t("config.perfultra.animOff.hint"), true)}
      ${row("cfg_perf_noIntersect", window.I18n.t("config.perfultra.noIntersect.label"), s.noIntersect,
            window.I18n.t("config.perfultra.noIntersect.hint"))}
      ${row("cfg_perf_noTooltips", window.I18n.t("config.perfultra.noTooltips.label"), s.noTooltips,
            window.I18n.t("config.perfultra.noTooltips.hint"))}
      ${row("cfg_perf_slowSave", window.I18n.t("config.perfultra.slowSave.label"), s.slowSave,
            window.I18n.t("config.perfultra.slowSave.hint"))}
      ${row("cfg_perf_viewportCull", window.I18n.t("config.perfultra.viewportCull.label"), s.viewportCull,
            window.I18n.t("config.perfultra.viewportCull.hint"))}
      ${row("cfg_perf_mobileZoomLimit", window.I18n.t("config.perfultra.mobileZoomLimit.label"), s.mobileZoomLimit,
            window.I18n.t("config.perfultra.mobileZoomLimit.hint"), true)}
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
      <div class="kta-aide-section-titre">${window.I18n.t("config.mlvl.titre")}</div>
      <p style="font-size:11.5px; color:#8892a4; margin:0 0 10px 0; line-height:1.5;">
        ${window.I18n.t("config.mlvl.intro")}
      </p>
      <label class="kta-perf-ultra-row">
        <input type="checkbox" id="cfg_multiLevel" ${enabled ? "checked" : ""}>
        <span class="kta-perf-ultra-text">
          <span class="kta-perf-ultra-label">${window.I18n.t("config.mlvl.toggle.label")}</span>
          <span class="kta-perf-ultra-hint">${window.I18n.t("config.mlvl.toggle.hint")}</span>
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
      '<div class="kta-aide-section-titre">' + window.I18n.t("config.georef.titre") + '</div>' +
      '<p style="font-size:12px; color:#8892a4; margin:4px 0 12px; line-height:1.5;">' +
        window.I18n.t("config.georef.intro") +
      '</p>' +

      // ===== Point A =====
      // 🆕 v1.21.0-fix1 : ajout des 2 boutons d'aide à la saisie (parité
      // UX avec la modale 💾 Enregistrer > 📡 Export externe) :
      //   - 🔍 Chercher un point : autocomplete sur POI plan → fill x/y
      //   - 📍 Cliquer carte : mode pick → clic sur la carte fill x/y
      // Les coords GPS lat/lng restent saisies manuellement (l'app ne
      // connaît pas le GPS du plan tant que la calibration n'existe pas).
      '<div class="kta-kmz-section" style="margin:8px 0;">' +
        '<div class="kta-kmz-section-titre">' + window.I18n.t("config.georef.pointA") + '</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planX") + '</label>' +
          '<input type="number" id="cfg_kmz_A_x"   value="' + pA.x   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planY") + '</label>' +
          '<input type="number" id="cfg_kmz_A_y"   value="' + pA.y   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.gpsLatLng") + '</label>' +
          // 🆕 hotfix21 — Input combiné lat/lng (format Google Maps natif).
          '<input type="text" id="cfg_kmz_A_coords" value="' + ((typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(pA.lat, pA.lng) : (Number.isFinite(pA.lat) && Number.isFinite(pA.lng) ? pA.lat + ", " + pA.lng : "")) + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8580, 2.2945">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="cfg_kmz_A_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_A_search" type="button">' + window.I18n.t("config.georef.searchBtn") + '</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_A_click" type="button">' + window.I18n.t("config.georef.clickBtn") + '</button>' +
        '</div>' +
        '<div id="cfg_kmz_A_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      // ===== Point B =====
      '<div class="kta-kmz-section" style="margin:8px 0;">' +
        '<div class="kta-kmz-section-titre">' + window.I18n.t("config.georef.pointB") + '</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planX") + '</label>' +
          '<input type="number" id="cfg_kmz_B_x"   value="' + pB.x   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planY") + '</label>' +
          '<input type="number" id="cfg_kmz_B_y"   value="' + pB.y   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.gpsLatLng") + '</label>' +
          // 🆕 hotfix21 — Input combiné lat/lng (format Google Maps natif).
          '<input type="text" id="cfg_kmz_B_coords" value="' + ((typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(pB.lat, pB.lng) : (Number.isFinite(pB.lat) && Number.isFinite(pB.lng) ? pB.lat + ", " + pB.lng : "")) + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8520, 2.3050">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="cfg_kmz_B_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_B_search" type="button">' + window.I18n.t("config.georef.searchBtn") + '</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_B_click" type="button">' + window.I18n.t("config.georef.clickBtn") + '</button>' +
        '</div>' +
        '<div id="cfg_kmz_B_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      '<div id="cfg_kmz_status" style="font-size:12px; margin:8px 2px 4px; min-height:18px;"></div>' +

      '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<button class="kta-btn kta-btn-primary" type="button" id="cfg_kmz_save">' +
          window.I18n.t("config.georef.saveBtn") +
        '</button>' +
        '<button class="kta-btn kta-btn-ghost"   type="button" id="cfg_kmz_clear">' +
          window.I18n.t("config.georef.clearBtn") +
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
        errEl.textContent = window.I18n.t("config.georef.formatExpected");
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
      _setStatus(window.I18n.t("config.georef.errNoModule"), "err");
      return;
    }
    // 🆕 hotfix21 — Lecture lat/lng via input combiné. Format invalide
    // → border rouge + message + abort silencieux (la combo bloque le save).
    const coordsA = _readCoordsCombo("cfg_kmz_A_coords", "cfg_kmz_A_err");
    const coordsB = _readCoordsCombo("cfg_kmz_B_coords", "cfg_kmz_B_err");
    if ((coordsA && coordsA.invalid) || (coordsB && coordsB.invalid)) {
      _setStatus(window.I18n.t("config.georef.errInvalidGps"), "err");
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
      _setStatus(window.I18n.t("config.georef.errAllRequired"), "err");
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
      _setStatus(window.I18n.t("config.georef.errInvalidCalib", { msg: e.message }), "err");
      return;
    }
    // Persistance
    const planId = window._currentLoadedPlanId || "default";
    window.KmzExport.setCalibration(planId, c);
    _setStatus(window.I18n.t("config.georef.okSaved"), "ok");
    if (window.OOMGuard && window.OOMGuard.showToast) {
      window.OOMGuard.showToast(window.I18n.t("config.georef.toastSaved"), "info");
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
    _setStatus(window.I18n.t("config.georef.cleared"), null);
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
      'placeholder="' + window.I18n.t("config.georef.searchPlaceholder") + '" style="width:100%; margin-bottom:6px;">' +
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
        list.innerHTML = '<div class="kta-kmz-search-empty">' + window.I18n.t("config.georef.searchEmpty", { q: q }) + '</div>';
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
    '<span class="kta-iti-floater-msg">' + window.I18n.t("config.georef.clickFloater", { letter: letter }) + '</span>' +
    '<button class="kta-btn kta-btn-ghost" id="cfg_kmz_click_cancel" type="button">' + window.I18n.t("config.georef.cancel") + '</button>';
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
      'placeholder="' + window.I18n.t("config.tracker.searchPlaceholder") + '" style="width:100%; margin-bottom:6px;">' +
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
        list.innerHTML = '<div class="kta-kmz-search-empty">' + window.I18n.t("config.tracker.searchEmpty", { q: q }) + '</div>';
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
    '<span class="kta-iti-floater-msg">' + window.I18n.t("config.tracker.clickFloater") + '</span>' +
    '<button class="kta-btn kta-btn-ghost" id="cfg_start_click_cancel" type="button">' + window.I18n.t("config.tracker.cancel") + '</button>';
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
    "off":         { emoji: "💤", label: window.I18n.t("config.preset.off") },
    "auto":        { emoji: "🔄", label: window.I18n.t("config.preset.auto") },
    "quality":     { emoji: "🌟", label: window.I18n.t("config.preset.quality") },
    "balanced":    { emoji: "🎯", label: window.I18n.t("config.preset.balanced") },
    "performance": { emoji: "⚡", label: window.I18n.t("config.preset.performance") }
  };
  const presetMeta = _PRESET_LABELS[c.perfPreset] || _PRESET_LABELS.auto;

  // 🌍 v1.45.0 : sélecteur de langue GLOBALE de l'app (pilote I18n via la clé
  // myktamap_app_lang, découplée du toggle local doc/onboarding). Options
  // construites depuis I18n.available() → 1 seul endroit à éditer pour ajouter
  // une langue. Fallback FR si I18n indispo (très improbable, chargé au boot).
  const _curLang = (window.I18n && typeof window.I18n.getLang === "function") ? window.I18n.getLang() : "fr";
  const _langOptions = ((window.I18n && window.I18n.available) ? window.I18n.available() : [{ code: "fr", label: "Français", flag: "🇫🇷" }])
    .map(function(l) {
      return '<option value="' + l.code + '"' + (l.code === _curLang ? ' selected' : '') + '>' +
             (l.flag ? l.flag + ' ' : '') + l.label + '</option>';
    }).join("");

  const modal = document.createElement("div");
  modal.id = "kta-cfg-modal";
  modal.className = "kta-readme-modal-overlay";

  modal.innerHTML = `
    <div class="kta-readme-modal-boite kta-cfg-modal-boite">
      <div class="kta-readme-modal-header">
        <span class="kta-readme-modal-titre">${window.I18n.t("config.titre")}</span>
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
            <span><strong>${window.I18n.t("config.presentation.btn")}</strong></span>
          </button>
          <div style="font-size:11.5px; color:#8892a4; margin-top:8px; line-height:1.5; padding:0 4px; text-align:center;">
            ${window.I18n.t("config.presentation.desc")}
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
            <span><strong>${window.I18n.t("config.incognito.quit.btn")}</strong></span>
          </button>
          <div style="font-size:11.5px; color:#8892a4; margin-top:8px; line-height:1.5; padding:0 4px;">
            ${window.I18n.t("config.incognito.quit.desc")}
          </div>
        </div>` : `
        <div class="kta-aide-section">
          <button class="kta-cfg-incognito-btn" type="button" id="cfg_incognito_btn">
            <span style="font-size:18px;">🕵️</span>
            <span><strong>${window.I18n.t("config.incognito.start.btn")}</strong></span>
          </button>
          <div style="font-size:11.5px; color:#8892a4; margin-top:8px; line-height:1.5; padding:0 4px;">
            ${window.I18n.t("config.incognito.start.desc")}
          </div>
        </div>`}

        <!-- 🌍 v1.45.0 : sélecteur de langue GLOBALE de l'app (= LE point d'entrée
             du changement complet, ≠ toggle local doc/onboarding). Placé APRÈS
             l'incognito (choix KARMA) : le sélecteur est déjà accessible dès le
             HOME, ici c'est un accès secondaire. Le change handler appelle
             I18n.setLang() puis re-render la modale. -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("config.lang.titre")}</div>
          <select class="kta-cfg-input" id="cfg_app_lang" style="width:100%;">
            ${_langOptions}
          </select>
          <div style="font-size:11.5px; color:#8892a4; margin-top:8px; line-height:1.5; padding:0 4px;">
            ${window.I18n.t("config.lang.hint")}
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("config.tracker.titre")}</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">${window.I18n.t("config.tracker.posX")}</label>
            <input class="kta-cfg-input" id="cfg_startX" type="number" value="${c.startX}">
            <label class="kta-cfg-label">${window.I18n.t("config.tracker.posY")}</label>
            <input class="kta-cfg-input" id="cfg_startY" type="number" value="${c.startY}">
          </div>
          <!-- 🆕 Saisie assistée de la position de départ (parité UX géoréf) :
               🔍 via un point existant, 📍 au clic sur la carte. Évite la saisie
               manuelle des coordonnées (gros gain de temps). -->
          <div class="kta-kmz-pt-actions" style="margin-top:8px;">
            <button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_start_search" type="button">${window.I18n.t("config.tracker.searchBtn")}</button>
            <button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_start_click" type="button">${window.I18n.t("config.tracker.clickBtn")}</button>
          </div>
          <div id="cfg_start_search_results" class="kta-kmz-search-results" style="display:none;"></div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("config.steps.titre")}</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">${window.I18n.t("config.steps.scale")}</label>
            <div style="display:flex; gap:6px; align-items:center;">
              <input class="kta-cfg-input" id="cfg_scale" type="number" step="0.1" value="${c.scale}" style="flex:1;">
              <button type="button" class="kta-btn kta-btn-ghost"
                onclick="ouvrirCalibrageEchelle()"
                style="padding:6px 10px; font-size:13px; white-space:nowrap;"
                title="${window.I18n.t("config.steps.scaleTitle")}">🎯</button>
            </div>
            <label class="kta-cfg-label">${window.I18n.t("config.steps.stepLength")}</label>
            <input class="kta-cfg-input" id="cfg_stepLength" type="number" step="0.1" value="${c.stepLength}">
            <label class="kta-cfg-label">${window.I18n.t("config.steps.threshold")}</label>
            <input class="kta-cfg-input" id="cfg_stepThreshold" type="number" step="0.1" value="${c.stepThreshold}">
            <label class="kta-cfg-label">${window.I18n.t("config.steps.cooldown")}</label>
            <input class="kta-cfg-input" id="cfg_stepCooldown" type="number" value="${c.stepCooldown}">
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("config.smartnav.titre")}</div>
          <label class="kta-perf-ultra-row" style="margin-top:0;">
            <input type="checkbox" id="cfg_smartNav" ${c.smartNav === true ? "checked" : ""}>
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.smartnav.label")}</span>
              <span class="kta-perf-ultra-hint">
                ${window.I18n.t("config.smartnav.hint")}
              </span>
            </span>
          </label>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("config.display.titre")}</div>
          <label class="kta-perf-ultra-row kta-perf-ultra-row-danger" style="margin-top:0;">
            <input type="checkbox" id="cfg_scaledMarkers" ${c.scaledMarkers !== false ? "checked" : ""}>
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.scaledMarkers.label")}</span>
              <span class="kta-perf-ultra-hint">
                ${window.I18n.t("config.display.scaledMarkers.hint")}
              </span>
            </span>
          </label>
          <!-- v1.9.2 to v1.36.2 : le toggle "Afficher les ronds aux
               intersections de tracés" REVIENT ici, mais cette fois en
               PER-PLAN (KARMA : enleve du home, met le dans la config du plan).
               La pref est stockée par plan dans myktamap_plan_prefs_PLANID,
               avec fallback sur la pref globale historique. Le handler appelle
               window.setPlanShowsIntersections() qui persiste + re-render. -->
          <label class="kta-perf-ultra-row" id="cfg_show_intersections_row" style="margin-top:8px;">
            <input type="checkbox" id="cfg_show_intersections">
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.intersections.label")}</span>
              <span class="kta-perf-ultra-hint">
                ${window.I18n.t("config.display.intersections.hint")}
              </span>
            </span>
          </label>

          <!-- 🧭 v1.37.0 — Calibration Nord per-plan. Utile quand le HAUT du
               plan n'est PAS le Nord vrai (photo aérienne avec cadrage
               arbitraire, plan cataphile sans rosace alignée). Cascade
               lecture : LS prefs-plan > APP_CONFIG.northOffsetDeg (mappé
               depuis plan-config.json) > 0. Setter notifie via event
               kta:northOffsetChange → re-render tracker à chaud.
               Convention : 0° = Nord = haut du plan, sens HORAIRE.
               UI : champ angle toujours visible (saisie directe) + bouton
               picker 2 clics Sud→Nord (WYSIWYG sur la map courante) + reset. -->
          <div id="cfg_north_block" class="kta-perf-ultra-row" style="margin-top:10px; display:block; padding:8px; border:1px solid rgba(255,255,255,0.06); border-radius:8px; background:rgba(255,255,255,0.02);">
            <div class="kta-perf-ultra-text" style="margin-bottom:6px;">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.north.label")}</span>
              <span class="kta-perf-ultra-hint" style="display:block;">
                ${window.I18n.t("config.display.north.hint")}
              </span>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              <input type="number" id="cfg_north_offset_input" min="0" max="359" step="1" value="0"
                     style="flex:0 0 90px; padding:6px 8px; border-radius:6px;
                            background:rgba(255,255,255,0.06); color:#e8eaf0;
                            border:1px solid rgba(255,255,255,0.12); font-weight:600;">
              <span style="color:#8892a4; font-size:12px;">°</span>
              <button type="button" id="cfg_north_picker_btn" class="kta-btn"
                      style="flex:1 1 auto; min-width:140px;">${window.I18n.t("config.display.north.calibrate")}</button>
              <button type="button" id="cfg_north_reset_btn" class="kta-btn"
                      style="flex:0 0 auto;" title="${window.I18n.t("config.display.north.resetTitle")}">${window.I18n.t("config.display.north.reset")}</button>
            </div>
            <div id="cfg_north_status" style="margin-top:4px; font-size:11.5px; color:#8892a4; min-height:14px;"></div>
          </div>

          <!-- 🖼️ v1.38.2 — Section "Calibration calques image" RETIRÉE des Réglages
               map mode (feedback KARMA : "on le fait que depuis générateur").
               L'embarquement durable cross-utilisateurs se fait via le générateur avancé
               (plan-config.json > imageLayers[i].calibration). Pas de doublon UX.
               Les helpers ImageLayerCalibration restent en place côté runtime :
               la cascade LS (clés legacy v1.38.0) est encore lue pour rétrocompat
               douce des users qui auraient déjà calibré en session, mais aucune
               nouvelle saisie session n'est possible depuis l'app. -->


          <!-- 📖 v1.37.0 — Note : l'import PDF Histoire côté session reste
               accessible depuis la modale Mode Histoire (📖 du status bar,
               feature v1.34.20). Pas de doublon dans Réglages — l'embarquement
               durable cross-utilisateurs se fait depuis le générateur avancé
               (plan-config.json > plan.histoirePdf). -->

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
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.wakelock.label")}</span>
              <span class="kta-perf-ultra-hint">
                ${window.I18n.t("config.display.wakelock.hint")}
              </span>
            </span>
          </label>

          <!-- 🆕 v1.34.26 — Toggle vibration haptique. Visible UNIQUEMENT si
               navigator.vibrate supporté (Android oui, iOS Safari NON par
               choix d'Apple). Init en post-render via bindHandlers (auto-
               masqué si pas supporté). Pref persistée dans app_user_prefs
               (config.js l~104). Le helper window.kta_vibrate() check
               APP_CONFIG.vibrationEnabled avant de vibrer. -->
          <label class="kta-perf-ultra-row" id="cfg_vibration_row" style="margin-top:8px; display:none;">
            <input type="checkbox" id="cfg_vibration" ${c.vibrationEnabled !== false ? "checked" : ""}>
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.vibration.label")}</span>
              <span class="kta-perf-ultra-hint">
                ${window.I18n.t("config.display.vibration.hint")}
              </span>
            </span>
          </label>

          <!-- 🆕 v1.34.0 E1 : toggle commandes vocales. Visible UNIQUEMENT si
               Web Speech API supportée (SpeechRecognition / webkitSpeechRecognition).
               Permission micro demandée à la 1ère utilisation par le navigateur.
               Init en post-render via setTimeout dans bindHandlers (cf script
               plus bas). Pas de prérequis matériel exotique côté serveur. -->
          <label class="kta-perf-ultra-row" id="cfg_voice_row" style="margin-top:8px; display:none;">
            <input type="checkbox" id="cfg_voice">
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.voice.label")}</span>
              <span class="kta-perf-ultra-hint">
                ${window.I18n.t("config.display.voice.hint")}
              </span>
            </span>
          </label>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("config.debug.titre")}</div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">${window.I18n.t("config.debug.logs")}</label>
            <select class="kta-cfg-input" id="cfg_debugMode">
              <option value="true"  ${c.debugMode ? "selected" : ""}>${window.I18n.t("config.debug.yes")}</option>
              <option value="false" ${!c.debugMode ? "selected" : ""}>${window.I18n.t("config.debug.no")}</option>
            </select>
          </div>

          <div style="display:flex; align-items:center; gap:12px; margin-top:12px;">
            <div style="flex:1;">
              <div style="font-size:13px; font-weight:600; color:#e8eaf0;">${window.I18n.t("config.debug.perfMode")}</div>
              <div style="font-size:11px; color:#8892a4; margin-top:2px;">${window.I18n.t("config.debug.perfModeHint")}</div>
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

  // 🌍 v1.45.0 — Sélecteur de langue GLOBALE de l'app. Au change : on bascule
  // I18n (charge le dico cible + persiste myktamap_app_lang + notifie onChange)
  // PUIS on re-render la modale Réglages pour refléter la nouvelle langue en
  // live. Les textes sont figés dans l'innerHTML → un rebuild complet est le
  // moyen le plus sûr. Les saisies non appliquées repartent des valeurs
  // APP_CONFIG : acceptable (on choisit la langue avant d'éditer, en pratique).
  const selAppLang = document.getElementById("cfg_app_lang");
  if (selAppLang) {
    selAppLang.addEventListener("change", function() {
      const code = selAppLang.value;
      const done = (window.I18n && typeof window.I18n.setLang === "function")
        ? window.I18n.setLang(code)
        : Promise.resolve();
      Promise.resolve(done).then(function() {
        const m = document.getElementById("kta-cfg-modal");
        if (m) m.remove();   // retire la modale courante…
        afficherConfig();    // …puis rebuild fraîche dans la nouvelle langue
      });
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
        // 🆕 v1.31.10 : passe par confirmAndLaunch() qui affiche la
        // modale charte de garde-fou (description + risques + buttons).
        // L'user peut Annuler dans la modale → no launch.
        window.IncognitoMode.confirmAndLaunch();
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

  // 🆕 v1.36.2 : toggle "⚪ Afficher les ronds aux intersections (ce plan)".
  // L'option est PER-PLAN — déplacée de Configuration home suite feedback KARMA.
  // Lecture initiale via getPlanShowsIntersections() (fallback global → true).
  // Change handler : setPlanShowsIntersections() persiste LS per-plan + re-render.
  const showIntersectCb = document.getElementById("cfg_show_intersections");
  if (showIntersectCb) {
    try {
      const initialValue = (typeof window.getPlanShowsIntersections === "function")
        ? window.getPlanShowsIntersections()
        : true;
      showIntersectCb.checked = !!initialValue;
    } catch(e) { showIntersectCb.checked = true; }

    showIntersectCb.addEventListener("change", function() {
      if (typeof window.setPlanShowsIntersections === "function") {
        window.setPlanShowsIntersections(null, showIntersectCb.checked);
      }
    });
  }

  // 🧭 v1.37.0 — Calibration Nord per-plan.
  // Trois entrées d'action :
  //   1. Champ angle numérique (saisie directe, blur → setPlanNorthOffset)
  //   2. Bouton "📐 Calibrer (2 clics)" → ferme la modale et lance le picker
  //      Sud → Nord sur la map. Retour de promesse = angle calculé, on
  //      ré-ouvre la modale pour montrer la valeur (UX KARMA).
  //   3. Bouton "↺ Reset" → resetPlanNorthOffset() retombe sur cascade.
  // Update du status text à chaque action pour confirmation visuelle.
  (function _initNorthCalibration() {
    const block      = document.getElementById("cfg_north_block");
    const input      = document.getElementById("cfg_north_offset_input");
    const pickerBtn  = document.getElementById("cfg_north_picker_btn");
    const resetBtn   = document.getElementById("cfg_north_reset_btn");
    const status     = document.getElementById("cfg_north_status");
    if (!block || !input || !pickerBtn || !resetBtn) return;

    function _refreshStatus() {
      if (!status) return;
      let cur = 0;
      try {
        if (typeof window.getPlanNorthOffset === "function") {
          cur = window.getPlanNorthOffset();
        }
      } catch(e) {}
      input.value = Math.round(cur);
      if (cur === 0) {
        status.textContent = "ℹ️ Nord = haut du plan (configuration par défaut).";
        status.style.color = "#8892a4";
      } else {
        status.textContent = "✅ Nord calibré à " + cur.toFixed(1) + "° du haut du plan (sens horaire).";
        status.style.color = "#f4c542";
      }
    }
    _refreshStatus();

    input.addEventListener("change", function() {
      const v = parseFloat(input.value);
      if (!isFinite(v)) { _refreshStatus(); return; }
      if (typeof window.setPlanNorthOffset === "function") {
        window.setPlanNorthOffset(null, v);
      }
      _refreshStatus();
    });

    resetBtn.addEventListener("click", function() {
      if (typeof window.resetPlanNorthOffset === "function") {
        window.resetPlanNorthOffset(null);
      }
      _refreshStatus();
    });

    pickerBtn.addEventListener("click", function() {
      if (typeof window.openNorthCalibrationPicker !== "function") {
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast("⚠️ Picker Nord indisponible (module pas chargé).", "warn");
        }
        return;
      }
      // 🐛 v1.37.0 hotfix — Au lieu d'essayer de fermer la modale (pas de
      // fonction publique), on suit le pattern existant du picker géoref
      // (cf l~520) : on CACHE la modale Réglages via display:none le temps
      // du picker, puis on la remontre à la fin. Sinon la modale (z>>map)
      // capture les clics et le picker semble ne rien faire.
      const cfgModal = document.getElementById("kta-cfg-modal");
      const _showCfgBack = function() {
        if (cfgModal) cfgModal.style.display = "";
      };
      if (cfgModal) cfgModal.style.display = "none";
      window.openNorthCalibrationPicker().then(function(deg) {
        _showCfgBack();
        if (deg == null) return;  // annulé / pas assez de distance
        if (typeof window.setPlanNorthOffset === "function") {
          window.setPlanNorthOffset(null, deg);
        }
        // _refreshStatus sera appelé via l'event kta:northOffsetChange
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast("🧭 Nord calibré à " + deg.toFixed(1) + "°", "info");
        }
      }).catch(function(e) {
        _showCfgBack();
        console.warn("[NorthPicker] échec :", e);
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast("⚠️ " + (e && e.message ? e.message : "Picker indisponible"), "warn");
        }
      });
    });

    // Re-render à chaud quand un autre composant change le Nord
    window.addEventListener("kta:northOffsetChange", _refreshStatus);
  })();

  // 🖼️ v1.38.2 — Le picker calibration calques image VIVE désormais
  // EXCLUSIVEMENT dans le générateur avancé (feedback KARMA :
  // "on le fait que depuis générateur"). HTML cfg_imglayer_calib_block
  // + IIFE _initImageLayerCalibUI complètement retirés des Réglages map
  // mode pour éviter le doublon UX. Les helpers ImageLayerCalibration
  // restent dispos côté runtime (map.js lit toujours la cascade LS
  // legacy → plan-config.json pour rétrocompat des users v1.38.0).

  // 📖 v1.37.0 — Pas de bouton d'import PDF Histoire dans Réglages : le
  // mécanisme existant (modale Mode Histoire 📖 → onglet PDF → bouton import,
  // feature v1.34.20) reste l'entrée unique côté session. Éviter le doublon
  // UX. L'embarquement durable cross-utilisateurs se fait via le générateur
  // avancé (`plan-config.json > plan.histoirePdf`).

  // 🆕 v1.34.26 : toggle "📳 Vibration haptique".
  // Visible UNIQUEMENT si navigator.vibrate est supporté (Android oui,
  // iOS Safari NON par choix d'Apple). Sync UI ↔ APP_CONFIG.vibrationEnabled
  // + persistence app_user_prefs.
  const vibRow = document.getElementById("cfg_vibration_row");
  const vibCb  = document.getElementById("cfg_vibration");
  if (vibRow && vibCb && window.kta_vibrate && window.kta_vibrate.isSupported()) {
    vibRow.style.display = "";
    vibCb.checked = (window.APP_CONFIG && window.APP_CONFIG.vibrationEnabled !== false);
    vibCb.addEventListener("change", function() {
      if (!window.APP_CONFIG) window.APP_CONFIG = {};
      window.APP_CONFIG.vibrationEnabled = !!vibCb.checked;
      // Persiste dans app_user_prefs (lu au boot par config.js l~104)
      try {
        const saved = JSON.parse(localStorage.getItem("app_user_prefs") || "{}");
        saved.vibrationEnabled = !!vibCb.checked;
        localStorage.setItem("app_user_prefs", JSON.stringify(saved));
      } catch(e) {
        console.warn("[Vibration] save pref échec :", e);
      }
      // Si activé, petite vibration de confirmation pour que l'user sente
      // que ça marche.
      if (vibCb.checked) {
        window.kta_vibrate.light();
      }
      if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
        window.OOMGuard.showToast(
          vibCb.checked
            ? "📳 Vibration activée"
            : "🔇 Vibration désactivée",
          "info"
        );
      }
    });
  }
  // Si !isSupported() (iPhone Safari notamment) → row caché silencieusement,
  // pas de message frustrant à l'user.

  // 🆕 v1.34.0 E1 : toggle "🎤 Commandes vocales (BETA)".
  // Visible UNIQUEMENT si Web Speech API supportée (SpeechRecognition
  // ou webkitSpeechRecognition). Sync UI ↔ state via window.VoiceCommand.
  // Note : reload requis après changement (le bouton mic flottant est
  // injecté/retiré au boot du module selon localStorage).
  const voiceRow = document.getElementById("cfg_voice_row");
  const voiceCb  = document.getElementById("cfg_voice");
  if (voiceRow && voiceCb && window.VoiceCommand) {
    if (window.VoiceCommand.isSupported()) {
      voiceRow.style.display = "";
      voiceCb.checked = window.VoiceCommand.isEnabled();
      voiceCb.addEventListener("change", function() {
        window.VoiceCommand.setEnabled(voiceCb.checked);
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(
            voiceCb.checked
              ? "🎤 Commandes vocales activées. Bouton 🎤 visible en bas à droite."
              : "🎤 Commandes vocales désactivées.",
            "info"
          );
        }
      });
    }
    // Si !isSupported() → row caché silencieusement (cas Firefox).
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
        '<span class="kta-niv-vis-label">' + window.I18n.t("config.niveaux.levelShort", { lvl: lvl }) + '</span>' +
      '</label>';
  });

  const overlay = document.createElement("div");
  overlay.id = "kta-niv-modal";
  overlay.className = "kta-readme-modal-overlay";
  overlay.innerHTML =
    '<div class="kta-readme-modal-boite kta-niv-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">' + window.I18n.t("config.niveaux.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-niv-close" type="button" aria-label="' + window.I18n.t("config.niveaux.close") + '">&times;</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +

        // SECTION 1 : Niveau actif (single-select)
        '<div class="kta-niv-section">' +
          '<div class="kta-niv-section-titre">' + window.I18n.t("config.niveaux.active.titre") + '</div>' +
          '<p class="kta-niv-section-hint">' +
            window.I18n.t("config.niveaux.active.hint") +
          '</p>' +
          '<div class="kta-niv-segmented">' +
            '<button type="button" class="kta-niv-seg-btn kta-niv-seg-add" id="kta-niv-sub" title="' + window.I18n.t("config.niveaux.addBelow") + '">−</button>' +
            segmented +
            '<button type="button" class="kta-niv-seg-btn kta-niv-seg-add" id="kta-niv-add" title="' + window.I18n.t("config.niveaux.addAbove") + '">+</button>' +
          '</div>' +
        '</div>' +

        // SECTION 2 : Niveaux visibles (multi-select)
        '<div class="kta-niv-section">' +
          '<div class="kta-niv-section-titre">' + window.I18n.t("config.niveaux.visible.titre") + '</div>' +
          '<p class="kta-niv-section-hint">' +
            window.I18n.t("config.niveaux.visible.hint") +
          '</p>' +
          '<div class="kta-niv-vis-grid">' + checkboxes + '</div>' +
          '<div class="kta-niv-vis-actions">' +
            '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-niv-vis-all">' + window.I18n.t("config.niveaux.visible.all") + '</button>' +
            '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-niv-vis-active">' + window.I18n.t("config.niveaux.visible.activeOnly") + '</button>' +
          '</div>' +
        '</div>' +

        '<p style="font-size:11.5px; color:#8892a4; margin:6px 0 0 0; line-height:1.5;">' +
          window.I18n.t("config.niveaux.warn") +
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
             window.I18n.t("config.jonction.levelOption", { lvl: l }) + '</option>';
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
        '<span class="kta-readme-modal-titre">' + window.I18n.t("config.jonction.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-jct-close" type="button" aria-label="' + window.I18n.t("config.jonction.close") + '">&times;</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<p style="margin:0 0 12px 0; font-size:13px; color:#c8d0e0;">' +
          window.I18n.t("config.jonction.intro") +
        '</p>' +
        '<div class="kta-jct-grille">' +
          '<label class="kta-cfg-label">' + window.I18n.t("config.jonction.fromLabel") + '</label>' +
          '<select class="kta-cfg-input" id="kta-jct-from">' + _optionsHtml(cur) + '</select>' +
          '<label class="kta-cfg-label">' + window.I18n.t("config.jonction.toLabel") + '</label>' +
          '<select class="kta-cfg-input" id="kta-jct-to">' + _optionsHtml(defaultTo) + '</select>' +
        '</div>' +
        '<p style="font-size:11.5px; color:#8892a4; margin:12px 0 0 0; line-height:1.5;">' +
          window.I18n.t("config.jonction.hint") +
        '</p>' +
      '</div>' +
      '<div class="kta-tracker-warn-actions">' +
        '<button class="kta-btn kta-btn-ghost"   id="kta-jct-cancel" type="button">' + window.I18n.t("config.jonction.cancel") + '</button>' +
        '<button class="kta-btn kta-btn-primary" id="kta-jct-ok"     type="button">' + window.I18n.t("config.jonction.okBtn") + '</button>' +
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
      alert(window.I18n.t("config.jonction.errSameLevel"));
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
    a.title     = window.I18n.t("config.niveaux.controlTitle");
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
