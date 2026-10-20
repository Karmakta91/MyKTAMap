/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE CONFIG — Modale ⚙️ Réglages du plan + Perf ULTRA + Multi-niveau + Géoréf
// =========================
// Expose : window.afficherConfig / resetConfig, appliquerFiltreNiveau (re-filtre tous les modules
// level-aware), appliquerFiltreRuntime, ktaSetActiveLevel (source unique du niveau de travail),
// _initLevelFilterControl (pastille niveau), _ouvrirCreationJonction, _ktaAnnulerModesClicCarte.
// Dépend de (window.*) : PerfUltra, APP_CONFIG, PLAN_CONFIG, PlanRegistry, map, convertCoord, KmzExport.
// ⚠️ Chargé APRÈS interface.js + interfaceMaintenance.js (index.html).
// 🩸 Application immédiate : chaque champ s'enregistre à la modification, bornes vérifiées (_CFG_BORNES) ;
// le reset ne touche que CE plan.
// Garde-fous : check-reglages-immediats.js, check-portee-reglages.js, check-podometre-global.js.
// Doc : docs/architecture/ui.md, docs/architecture/multilevel-pathfinding.md.

// ── Perf ULTRA : section de la modale Réglages ──────────
// Interrupteur maître « ULTRA » (active les 6 leviers) + 6 interrupteurs fins ; binding dans
// _bindPerfUltraToggles après le rendu.
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
  // « Afficher tous les niveaux au lancement » (lu par main.js) : hors ULTRA, plan multi-niveau seulement.
  const rowNiveaux = (window.APP_CONFIG && window.APP_CONFIG.multiLevel === true)
    ? '<div style="border-top:1px solid var(--kta-bordure); margin:10px 0; padding-top:8px;"></div>' +
      row("cfg_perf_tousNiveaux", window.I18n.t("config.perfultra.tousNiveaux.label"), s.tousNiveaux, "")
    : "";
  // « Ne rendre que les éléments visibles » (viewportCull) n'a pas de case (décision produit) : piloté par le
  // preset ULTRA ; une valeur déjà enregistrée pour le plan est toujours relue.
  return `
    <div class="kta-aide-section">
      <p class="kta-perf-ultra-hint" style="margin:0 0 10px 0;">${window.I18n.t("config.perfultra.intro")}</p>
      ${row("cfg_perf_ultra", window.I18n.t("config.perfultra.ultra.label"), s.ultra,
            "")}
      <div style="border-top:1px solid var(--kta-bordure); margin:10px 0; padding-top:8px;"></div>
      ${row("cfg_perf_decim", window.I18n.t("config.perfultra.decim.label"), s.decim,
            "")}
      ${row("cfg_perf_animOff", window.I18n.t("config.perfultra.animOff.label"), s.animOff,
            "", true)}
      ${row("cfg_perf_noIntersect", window.I18n.t("config.perfultra.noIntersect.label"), s.noIntersect,
            "")}
      ${row("cfg_perf_noTooltips", window.I18n.t("config.perfultra.noTooltips.label"), s.noTooltips,
            "")}
      ${row("cfg_perf_slowSave", window.I18n.t("config.perfultra.slowSave.label"), s.slowSave,
            window.I18n.t("config.perfultra.slowSave.hint"))}
      ${row("cfg_perf_mobileZoomLimit", window.I18n.t("config.perfultra.mobileZoomLimit.label"), s.mobileZoomLimit,
            window.I18n.t("config.perfultra.mobileZoomLimit.hint"), true)}
      ${rowNiveaux}
    </div>`;
}

function _bindPerfUltraToggles() {
  if (!window.PerfUltra) return;
  const ultraEl = document.getElementById("cfg_perf_ultra");
  if (ultraEl) {
    ultraEl.addEventListener("change", function() {
      window.PerfUltra.setUltra(ultraEl.checked);
      // Re-rendu de la section pour refléter les états individuels.
      const m = document.getElementById("kta-cfg-modal");
      if (m) { _cfgFermer(); afficherConfig(); }
    });
  }
  const map = {
    "cfg_perf_decim":           "decim",
    "cfg_perf_animOff":         "animOff",
    "cfg_perf_noIntersect":     "noIntersect",
    "cfg_perf_noTooltips":      "noTooltips",
    "cfg_perf_slowSave":        "slowSave",
    "cfg_perf_mobileZoomLimit": "mobileZoomLimit",
    "cfg_perf_tousNiveaux":     "tousNiveaux"      // hors ULTRA (PerfUltra.set l'accepte)
  };
  Object.keys(map).forEach(function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", function() {
      window.PerfUltra.set(map[id], el.checked);
      // Maître ULTRA coché si tous les autres le sont.
      if (ultraEl) ultraEl.checked = window.PerfUltra.isUltra();
    });
  });
}

// Multi-niveau : pas de section ici (activation par le générateur).

// ── Géoréférencement GPS : section de la modale Réglages ──────────
// Persistance par window.KmzExport.setCalibration(planId, c), le même backend que la modale Export externe
// (sessionExporter.js) : un calage saisi ici y est prérempli.
// IDs préfixés `cfg_kmz_` : pas de collision avec les `kmz_A_x` de sessionExporter si les deux modales sont
// ouvertes.
function _renderCfgGeorefSection() {
  const planId = window._currentLoadedPlanId || "default";
  const saved  = (window.KmzExport && window.KmzExport.getCalibration)
                  ? window.KmzExport.getCalibration(planId) : null;
  const pA = (saved && saved.pointA) || { x: "", y: "", lat: "", lng: "" };
  const pB = (saved && saved.pointB) || { x: "", y: "", lat: "", lng: "" };
  const pC = (saved && saved.pointC) || { x: "", y: "", lat: "", lng: "" };   // optionnel

  return '' +
    '<div class="kta-aide-section">' +

      // Point A, avec aide à la saisie (comme Export externe) : 🔍 chercher un point (x/y depuis un POI) ou
      // 📍 cliquer sur la carte. Lat/lng restent saisis à la main (le plan n'a pas de GPS avant calibration).
      '<div class="kta-kmz-section" style="margin:8px 0;">' +
        '<div class="kta-kmz-section-titre">' + window.I18n.t("config.georef.pointA") + '</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planX") + '</label>' +
          '<input type="number" id="cfg_kmz_A_x"   value="' + pA.x   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planY") + '</label>' +
          '<input type="number" id="cfg_kmz_A_y"   value="' + pA.y   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.gpsLatLng") + '</label>' +
          // Champ combiné lat/lng (format Google Maps).
          '<input type="text" id="cfg_kmz_A_coords" value="' + ((typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(pA.lat, pA.lng) : (Number.isFinite(pA.lat) && Number.isFinite(pA.lng) ? pA.lat + ", " + pA.lng : "")) + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8580, 2.2945">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="cfg_kmz_A_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_A_search" type="button">' + window.I18n.t("config.georef.searchBtn") + '</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_A_click" type="button">' + window.I18n.t("config.georef.clickBtn") + '</button>' +
        '</div>' +
        '<div id="cfg_kmz_A_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      '<div class="kta-kmz-section" style="margin:8px 0;">' +
        '<div class="kta-kmz-section-titre">' + window.I18n.t("config.georef.pointB") + '</div>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planX") + '</label>' +
          '<input type="number" id="cfg_kmz_B_x"   value="' + pB.x   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planY") + '</label>' +
          '<input type="number" id="cfg_kmz_B_y"   value="' + pB.y   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.gpsLatLng") + '</label>' +
          // Champ combiné lat/lng (format Google Maps).
          '<input type="text" id="cfg_kmz_B_coords" value="' + ((typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(pB.lat, pB.lng) : (Number.isFinite(pB.lat) && Number.isFinite(pB.lng) ? pB.lat + ", " + pB.lng : "")) + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8520, 2.3050">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="cfg_kmz_B_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_B_search" type="button">' + window.I18n.t("config.georef.searchBtn") + '</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_B_click" type="button">' + window.I18n.t("config.georef.clickBtn") + '</button>' +
          // B estimé depuis A + échelle + Nord du plan (northOffsetDeg, 0 = nord en haut).
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_B_estimer" type="button" title="' + window.I18n.t("config.georef.estimerTitle") + '">🧭 ' + window.I18n.t("config.georef.estimerBtn") + '</button>' +
        '</div>' +
        '<div id="cfg_kmz_B_estime_badge" class="kta-planner-info" style="display:none; color:var(--kta-accent-texte); margin:4px 0 0;">≈ ' + window.I18n.t("config.georef.estimeBadge") + '</div>' +
        '<div id="cfg_kmz_B_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
      '</div>' +

      // Point C optionnel (affine anti-déformation).
      '<div class="kta-kmz-section" style="margin:8px 0;">' +
        '<div class="kta-kmz-section-titre">' + window.I18n.t("config.georef.pointC") + '</div>' +
        '<p style="font-size:11.5px; color:var(--kta-texte-3); margin:2px 0 6px; line-height:1.45;">' + window.I18n.t("config.georef.pointCHint") + '</p>' +
        '<div class="kta-kmz-pt-grille">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planX") + '</label>' +
          '<input type="number" id="cfg_kmz_C_x"   value="' + pC.x   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.planY") + '</label>' +
          '<input type="number" id="cfg_kmz_C_y"   value="' + pC.y   + '" class="kta-cfg-input kta-kmz-input" step="any">' +
          '<label class="kta-kmz-lbl">' + window.I18n.t("config.georef.gpsLatLng") + '</label>' +
          '<input type="text" id="cfg_kmz_C_coords" value="' + ((typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(pC.lat, pC.lng) : (Number.isFinite(pC.lat) && Number.isFinite(pC.lng) ? pC.lat + ", " + pC.lng : "")) + '" class="kta-cfg-input kta-kmz-input kta-gps-coords-input" inputmode="decimal" autocomplete="off" placeholder="48.8600, 2.2900">' +
        '</div>' +
        '<div class="kta-gps-coords-error" id="cfg_kmz_C_err" style="display:none;"></div>' +
        '<div class="kta-kmz-pt-actions">' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_C_search" type="button">' + window.I18n.t("config.georef.searchBtn") + '</button>' +
          '<button class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_kmz_C_click" type="button">' + window.I18n.t("config.georef.clickBtn") + '</button>' +
        '</div>' +
        '<div id="cfg_kmz_C_search_results" class="kta-kmz-search-results" style="display:none;"></div>' +
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
    const color = (type === "ok") ? "var(--kta-ok)" : (type === "err") ? "var(--kta-erreur)" : "var(--kta-texte-3)";
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

  // Validation live des champs GPS combinés cfg_kmz_*_coords (idempotent, cf. utils.js).
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

  // Estimer B depuis A + échelle + Nord. `_bEstime` mémorise les valeurs posées : au save, si les champs B sont
  // EXACTEMENT celles-là, `estimated:true` est persisté (badge d'honnêteté) ; la moindre retouche le fait tomber.
  let _bEstime = null;
  const _badgeEstime = document.getElementById("cfg_kmz_B_estime_badge");
  // Badge relu depuis la calibration sauvée. 🩸 RELUE ICI : `saved` vit dans _renderCfgGeorefSection (le
  // générateur de HTML) ; la référencer ici lèverait un ReferenceError qui tue TOUS les handlers suivants.
  const _calibSauvee = (window.KmzExport && window.KmzExport.getCalibration)
                         ? window.KmzExport.getCalibration(window._currentLoadedPlanId || "default") : null;
  if (_calibSauvee && _calibSauvee.pointB && _calibSauvee.pointB.estimated && _badgeEstime) {
    _badgeEstime.style.display = "";
  }
  const _btnEstimer = document.getElementById("cfg_kmz_B_estimer");
  if (_btnEstimer) _btnEstimer.addEventListener("click", async function() {
    const ax = parseFloat(document.getElementById("cfg_kmz_A_x").value);
    const ay = parseFloat(document.getElementById("cfg_kmz_A_y").value);
    const coordsA = _readCoordsCombo("cfg_kmz_A_coords", "cfg_kmz_A_err");
    const scale = window.APP_CONFIG && Number(window.APP_CONFIG.scale);
    // Refus explicites, pas de bornage silencieux (décision produit).
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !coordsA || coordsA.invalid || coordsA.lat == null) {
      _setStatus(window.I18n.t("config.georef.estimerErrA"), "err"); return;
    }
    if (!Number.isFinite(scale) || scale <= 0) {
      _setStatus(window.I18n.t("config.georef.estimerErrScale"), "err"); return;
    }
    const north = (typeof window.getPlanNorthOffset === "function") ? window.getPlanNorthOffset() : 0;
    const coin = window.ktaCoinLePlusLoin({ x: ax, y: ay },
                   window.APP_CONFIG.imageWidth, window.APP_CONFIG.imageHeight);
    const pointA = { x: ax, y: ay, lat: coordsA.lat, lng: coordsA.lng };
    const b = coin && window.ktaEstimerPointB(pointA, coin, scale, north);
    if (!b) { _setStatus(window.I18n.t("config.georef.estimerErrCalc"), "err"); return; }
    // Récap de confirmation : une estimation N'EST PAS une mesure, on le dit.
    const distM = Math.round(Math.hypot(b.x - ax, b.y - ay) / scale);
    if (!(await window.ktaConfirm(window.I18n.t("config.georef.estimerConfirm",
          { dist: distM, scale: scale, north: north })))) return;
    document.getElementById("cfg_kmz_B_x").value = b.x;
    document.getElementById("cfg_kmz_B_y").value = b.y;
    document.getElementById("cfg_kmz_B_coords").value =
      (typeof window.formatGpsCoords === "function") ? window.formatGpsCoords(b.lat, b.lng) : (b.lat + ", " + b.lng);
    _bEstime = { x: String(b.x), y: String(b.y) };
    if (_badgeEstime) _badgeEstime.style.display = "";
    _setStatus(window.I18n.t("config.georef.estimerOk"), "ok");
  });
  ["cfg_kmz_B_x", "cfg_kmz_B_y", "cfg_kmz_B_coords"].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", function() {
      _bEstime = null;
      if (_badgeEstime) _badgeEstime.style.display = "none";
    });
  });

  // Lit le champ combiné « lat, lng » : bordure rouge + message si invalide. Rend {lat, lng} ou null (vide ou
  // invalide) ; l'appelant distingue par `errKey`.
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
    // Format invalide → bordure rouge + message, le save est bloqué.
    const coordsA = _readCoordsCombo("cfg_kmz_A_coords", "cfg_kmz_A_err");
    const coordsB = _readCoordsCombo("cfg_kmz_B_coords", "cfg_kmz_B_err");
    const coordsC = _readCoordsCombo("cfg_kmz_C_coords", "cfg_kmz_C_err");
    if ((coordsA && coordsA.invalid) || (coordsB && coordsB.invalid) || (coordsC && coordsC.invalid)) {
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
    // B issu de l'estimation et non retouché → le drapeau suit la calibration.
    if (_bEstime &&
        String(document.getElementById("cfg_kmz_B_x").value) === _bEstime.x &&
        String(document.getElementById("cfg_kmz_B_y").value) === _bEstime.y) {
      c.pointB.estimated = true;
    }
    if (c.pointA.x == null || c.pointA.y == null || c.pointA.lat == null || c.pointA.lng == null ||
        c.pointB.x == null || c.pointB.y == null || c.pointB.lat == null || c.pointB.lng == null) {
      _setStatus(window.I18n.t("config.georef.errAllRequired"), "err");
      return;
    }
    // Point C optionnel mais tout ou rien (C partiel = oubli).
    const _pcx = _readVal("cfg_kmz_C_x"), _pcy = _readVal("cfg_kmz_C_y");
    const _pcRempli = _pcx != null || _pcy != null || (coordsC && coordsC.lat != null);
    if (_pcRempli) {
      if (_pcx == null || _pcy == null || !coordsC || coordsC.lat == null || coordsC.lng == null) {
        _setStatus(window.I18n.t("config.georef.errCIncomplete"), "err");
        return;
      }
      c.pointC = { x: _pcx, y: _pcy, lat: coordsC.lat, lng: coordsC.lng };
    }
    // La transformation lève si points colinéaires ou distance nulle ; un C colinéaire est toléré par le moteur
    // (repli 2 points) mais signalé franchement à la saisie.
    try {
      const _t = window.KmzExport.buildTransformCalib(c);
      if (c.pointC && _t.degenereC) {
        _setStatus(window.I18n.t("config.georef.errCColineaire"), "err");
        return;
      }
    } catch(e) {
      _setStatus(window.I18n.t("config.georef.errInvalidCalib", { msg: e.message }), "err");
      return;
    }
    const planId = window._currentLoadedPlanId || "default";
    window.KmzExport.setCalibration(planId, c);
    _setStatus(window.I18n.t("config.georef.okSaved"), "ok");
    if (window.OOMGuard && window.OOMGuard.showToast) {
      window.OOMGuard.showToast(window.I18n.t("config.georef.toastSaved"), "info");
    }
  });

  btnClear.addEventListener("click", function() {
    // « Effacer » : une calibration ENREGISTRÉE (deux points relevés en surface, qui ouvrent Vue OSM et exports
    // KMZ/GPX) n'est jamais supprimée sans confirmation ; sinon simple vidage des champs.
    const _planIdClear = window._currentLoadedPlanId || "default";
    let _persistee = false;
    try { _persistee = !!localStorage.getItem("myktamap_kmz_calib_" + _planIdClear); } catch(e) {}
    if (!_persistee) { _executerClear(); return; }   // rien d'enregistré : simple vidage des champs
    // Calibration enregistrée : jamais effacée sans confirmation (sans fenêtre → refus, pas d'effacement).
    if (typeof window.ktaConfirm !== "function") {
      console.warn("[InterfaceConfig] ktaConfirm indisponible : effacement du calibrage refusé");
      return;
    }
    window.ktaConfirm(window.I18n.t("config.georef.confirmClear")).then(function(ok) { if (ok) _executerClear(); });
  });
  function _executerClear() {
    ["A_x","A_y","A_coords","B_x","B_y","B_coords","C_x","C_y","C_coords"].forEach(function(k) {
      const el = document.getElementById("cfg_kmz_" + k);
      if (el) {
        el.value = "";
        el.classList.remove("kta-gps-invalid");
      }
    });
    ["cfg_kmz_A_err", "cfg_kmz_B_err", "cfg_kmz_C_err"].forEach(function(id) {
      const e = document.getElementById(id);
      if (e) { e.textContent = ""; e.style.display = "none"; }
    });
    // Efface aussi la version persistée (même préfixe que KMZ_CALIB_LS_PREFIX de js/kmzExport.js).
    try {
      const planId = window._currentLoadedPlanId || "default";
      localStorage.removeItem("myktamap_kmz_calib_" + planId);
    } catch(e) {}
    _setStatus(window.I18n.t("config.georef.cleared"), null);
  }

  // Boutons 🔍 Chercher / 📍 Cliquer carte, comme sessionExporter.js > _kmzOuvrirRecherche / _kmzActiverModeClic,
  // sur les IDs `cfg_kmz_*`.
  ["A", "B", "C"].forEach(function(letter) {
    const btnSearch = document.getElementById("cfg_kmz_" + letter + "_search");
    const btnClick  = document.getElementById("cfg_kmz_" + letter + "_click");
    if (btnSearch) btnSearch.addEventListener("click", function() { _cfgOuvrirRechercheGeoref(letter); });
    if (btnClick)  btnClick.addEventListener("click",  function() { _cfgActiverModeClicGeoref(letter); });
  });
}

// ── Recherche POI (géoréf des Réglages) ──────────
// Autocomplétion sur window.SearchPoints.findByQuery (js/searchPoints.js), comme le picker d'Enregistrer KMZ.
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

// ── Clic carte (géoréf des Réglages) ──────────
// Masque la modale, un `map.on("click")` remplit x/y du point cible puis restaure la modale
// (comme sessionExporter.js > _kmzActiverModeClic).
let _cfgGeorefClickActive  = false;
let _cfgGeorefClickHandler = null;

function _cfgActiverModeClicGeoref(letter) {
  if (!window.map) return;
  _cfgDesactiverModeClicGeoref();  // annule un mode précédent éventuel
  _cfgGeorefClickActive = true;
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
  const cfgModal = document.getElementById("kta-cfg-modal");
  if (cfgModal) cfgModal.style.display = "none";
  // Floater du mode (classes .kta-iti-floater de la mesure d'itinéraire).
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
  if (window.map && _cfgGeorefClickHandler) window.map.off("click", _cfgGeorefClickHandler);
  _cfgGeorefClickHandler = null;
  const fl = document.getElementById("kta-cfg-georef-click-floater");
  if (fl) fl.remove();
}

// ── Position initiale du tracker : pickers assistés ──────────
// Mêmes pickers que le géoréf, ciblant cfg_startX/Y (🔍 via un point, 📍 clic carte). Valeurs entières
// (parseInt au save). Bindés par _bindCfgTrackerStartHandlers() après le rendu.
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
          _cfgSignalerChangement(xEl, yEl);
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
    _cfgSignalerChangement(xEl, yEl);
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

// Annule TOUS les modes « cliquer sur la carte » (géoréf, départ tracker, itinéraire, floater résiduel) et
// retire la modale masquée par un picker. Appelé par afficherLoader() (retour accueil) : sinon floater ou modale
// restent par-dessus l'accueil avec un map.on("click") orphelin.
window._ktaAnnulerModesClicCarte = function() {
  try { _cfgDesactiverModeClicGeoref(); } catch(_) {}
  try { _cfgDesactiverModeClicStart(); } catch(_) {}
  try { if (typeof _desactiverModeClicCarte === "function") _desactiverModeClicCarte(); } catch(_) {}
  // Filet : tout floater pick résiduel (évitement, KMZ…).
  try { document.querySelectorAll(".kta-iti-floater").forEach(function(f) { f.remove(); }); } catch(_) {}
  // Modale masquée (display:none) par un picker : retirée.
  try { var m = document.getElementById("kta-cfg-modal"); if (m) m.remove(); } catch(_) {}
};

function _bindCfgTrackerStartHandlers() {
  const btnSearch = document.getElementById("cfg_start_search");
  const btnClick  = document.getElementById("cfg_start_click");
  if (btnSearch) btnSearch.addEventListener("click", _cfgOuvrirRechercheStart);
  if (btnClick)  btnClick.addEventListener("click",  _cfgActiverModeClicStart);
}

// ── Un seul écran, portée explicite, application immédiate ──────────
// 🩸 Chaque champ s'enregistre à la modification, bornes vérifiées champ par champ (rouge + toast hors bornes,
// rien n'est écrit) : pas de bouton Appliquer, croix / clic hors modale / Échap ne perdent rien. Chaque groupe
// porte sa portée et se replie ; les globaux de l'accueil se LISENT ici avec le chemin pour les changer ; le
// géoréf a sa sous-modale ; le reset ne touche que CE plan (jamais app_user_prefs). Wake lock et vocal
// non supportés restent affichés avec la raison.

// Titre de groupe : style dans css/style.css (.kta-cfg-group-titre), partagé avec la Configuration de l'accueil.
const _CFG_LS_GROUPES  = "myktamap_cfg_groupes_v1";

function _cfgGroupeDebut(cle, portee, premier) {
  const t = window.I18n.t;
  // « mixte » : la portée change d'une ligne à l'autre, chaque ligne la dit.
  const badge = portee === "plan"   ? '<span class="kta-cfg-scope kta-cfg-scope-plan">'   + t("config.scope.badgePlan")   + '</span>'
              : portee === "global" ? '<span class="kta-cfg-scope kta-cfg-scope-global">' + t("config.scope.badgeGlobal") + '</span>'
              : portee === "mixte"  ? '<span class="kta-cfg-scope kta-cfg-scope-mixte">'  + t("config.scope.badgeMixte")  + '</span>'
              : "";
  return '<div class="kta-cfg-group" data-cfg-group="' + cle + '">' +
         '<div class="kta-cfg-group-titre' + (premier ? " kta-cfg-group-titre-premier" : "") +
           '" role="button" tabindex="0" aria-expanded="true">' +
           '<span class="kta-cfg-group-libelle">' + t(cle) + '</span>' + badge +
           '<span class="kta-cfg-group-chevron" aria-hidden="true">▾</span>' +
         '</div>' +
         '<div class="kta-cfg-group-corps">';
}
function _cfgGroupeFin() { return '</div></div>'; }

// Partagé avec les Réglages de l'ACCUEIL (homeConfig.js, même balisage dans index.html) : `cleLs` sépare la
// mémoire des deux fenêtres, qui ont des rubriques de même nom.
function _bindCfgGroupes(modal, cleLs) {
  const LS     = cleLs || _CFG_LS_GROUPES;
  const lire   = function () {
    try { return JSON.parse(localStorage.getItem(LS) || "{}") || {}; } catch (e) { return {}; }
  };
  const etat   = lire();
  const etroit = !!(window.matchMedia && window.matchMedia("(max-width: 1023px)").matches);
  modal.querySelectorAll(".kta-cfg-group").forEach(function (g, i) {
    const cle   = g.getAttribute("data-cfg-group");
    const titre = g.querySelector(".kta-cfg-group-titre");
    if (!titre) return;
    // Rôle, focus et clavier posés ICI (le balisage statique de l'accueil n'en porte pas).
    titre.setAttribute("role", "button");
    titre.tabIndex = 0;
    // Défaut : tout ouvert (PC) ; écran étroit : tout replié sauf le premier groupe. Choix mémorisé.
    let replie = (typeof etat[cle] === "boolean") ? etat[cle] : (etroit && i > 0);
    const poser = function () {
      g.classList.toggle("kta-cfg-group-replie", replie);
      titre.setAttribute("aria-expanded", replie ? "false" : "true");
      titre.title = window.I18n.t(replie ? "config.groupes.deplier" : "config.groupes.replier");
    };
    poser();
    const basculer = function () {
      replie = !replie; poser();
      const e = lire(); e[cle] = replie;
      try { localStorage.setItem(LS, JSON.stringify(e)); } catch (err) {}
    };
    titre.addEventListener("click", basculer);
    titre.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); basculer(); }
    });
  });
}
window.ktaGroupesRepliables = _bindCfgGroupes;

// Réglages de l'ACCUEIL en lecture seule : leur valeur et le chemin pour les changer, jamais modifiables d'un plan.
function _renderCfgGlobauxLectureSeule() {
  const t = window.I18n.t;
  const c = window.APP_CONFIG || {};
  const on = t("config.globaux.on"), off = t("config.globaux.off");
  let langue = "", theme = "";
  try { langue = String(window.I18n.getLang ? window.I18n.getLang() : "").toUpperCase(); } catch (e) {}
  try { theme = (window.ThemeManager && typeof window.ThemeManager.isLight === "function" && window.ThemeManager.isLight()) ? t("theme.name.light") : t("theme.name.dark"); } catch (e) {}
  let carnet = "";
  try { carnet = (window.Journal && typeof window.Journal.isEnabled === "function") ? (window.Journal.isEnabled() ? on : off) : ""; } catch (e) {}
  const lignes = [
    [t("home.lang.label"), langue],
    [t("config.globaux.theme"), theme],
    [t("config.globaux.carnet"), carnet],
    [t("config.display.scaledMarkers.label"), c.scaledMarkers !== false ? on : off],
    [t("config.panneaux.label"), c.panneauxAncres === true ? on : off],
    [t("config.zoomBoutons.label"), c.zoomBoutons === true ? on : off],
    [t("config.snapdraw.label"), c.snapDraw === true ? (on + " · " + (Number.isFinite(c.snapDrawPx) ? c.snapDrawPx : 12) + " px") : off]
  ];
  return '<div class="kta-aide-section kta-cfg-globaux">' +
    '<div class="kta-aide-section-titre">' + t("config.globaux.titre") + '</div>' +
    '<dl class="kta-cfg-globaux-liste">' +
      lignes.map(function (l) { return '<dt>' + l[0] + '</dt><dd>' + l[1] + '</dd>'; }).join("") +
    '</dl>' +
    '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="cfg_globaux_home">' + t("config.globaux.btn") + '</button>' +
  '</div>';
}

// Géoréférencement : un lanceur dans le groupe, le formulaire dans SA sous-modale.
function _renderCfgGeorefLanceur() {
  const t = window.I18n.t;
  return '<div class="kta-aide-section" id="cfg_georef_lanceur">' +
    '<div class="kta-aide-section-titre">' + t("config.georef.titre") + '</div>' +
    '<div class="kta-cfg-georef-etat" id="cfg_georef_etat"></div>' +
    '<button type="button" class="kta-btn" id="cfg_georef_open" style="width:100%; margin-top:8px;">' + t("config.georef.openBtn") + '</button>' +
  '</div>';
}
function _cfgRafraichirEtatGeoref() {
  const el = document.getElementById("cfg_georef_etat");
  if (!el) return;
  const t = window.I18n.t;
  const pid = window._currentLoadedPlanId || "default";
  let cal = null;
  try { cal = (window.KmzExport && window.KmzExport.getCalibration) ? window.KmzExport.getCalibration(pid) : null; } catch (e) {}
  const ok = !!(cal && cal.pointA && cal.pointB);
  el.textContent = ok
    ? t(cal.pointC ? "config.georef.etatCalibreC" : "config.georef.etatCalibre") + (cal.pointB.estimated ? " · " + t("config.georef.etatBEstime") : "")
    : t("config.georef.etatNonCalibre");
  el.classList.toggle("kta-cfg-georef-etat-ok", ok);
}
function _ouvrirSousModaleGeoref() {
  const parent = document.getElementById("kta-cfg-modal");
  if (!parent || document.getElementById("kta-cfg-georef-modal")) return;
  const t = window.I18n.t;
  const sub = document.createElement("div");
  sub.id = "kta-cfg-georef-modal";
  sub.className = "kta-readme-modal-overlay kta-cfg-sub-overlay";
  sub.innerHTML =
    '<div class="kta-readme-modal-boite kta-cfg-sub-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">' + t("config.georef.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-cfg-georef-close" type="button" aria-label="' + t("config.actions.close") + '">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps kta-cfg-sub-corps">' + _renderCfgGeorefSection() + '</div>' +
    '</div>';
  // ENFANT de la modale Réglages : masquée avec elle pendant un clic carte, retirée avec elle au retour accueil.
  parent.appendChild(sub);
  _bindCfgGeorefHandlers();
  const fermer = function () { _cfgDesactiverModeClicGeoref(); sub.remove(); _cfgRafraichirEtatGeoref(); };
  sub._ktaFermer = fermer;
  document.getElementById("kta-cfg-georef-close").addEventListener("click", fermer);
  sub.addEventListener("click", function (e) { if (e.target === sub) fermer(); });
}
function _bindCfgGeorefLanceur() {
  const b = document.getElementById("cfg_georef_open");
  if (b) b.addEventListener("click", _ouvrirSousModaleGeoref);
  _cfgRafraichirEtatGeoref();
}

// ── Application immédiate ──
// Bornes = celles des champs (et de PODO_BORNES de config.js, qui refuse aussi). PUR : check-reglages-immediats.js
// l'EXÉCUTE.
const _CFG_BORNES = {
  cfg_scale:           { min: 0,   max: Infinity, strict: true },   // > 0, jamais de clamp
  cfg_startX:          { min: 0,   max: Infinity, entier: true },
  cfg_startY:          { min: 0,   max: Infinity, entier: true },
  cfg_stepLength:      { min: 0,   max: 1.5  },
  cfg_stepThreshold:   { min: 10,  max: 30   },
  cfg_stepCooldown:    { min: 300, max: 3000 },
  cfg_smartNavRadius:  { min: 1,   max: 50   },
  cfg_smartNavHeading: { min: 0,   max: 5    }
};
function _cfgValider(id, brut) {
  const b = _CFG_BORNES[id];
  if (!b) return { ok: false, v: NaN, min: NaN, max: NaN };
  const v = b.entier ? parseInt(brut, 10) : parseFloat(brut);
  const ok = Number.isFinite(v) && (b.strict ? v > b.min : v >= b.min) && v <= b.max;
  return { ok: ok, v: v, min: b.min, max: b.max };
}
window._ktaCfgValider = _cfgValider;

function _cfgToast(msg, type) {
  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") window.OOMGuard.showToast(msg, type || "info");
}
function _cfgMarquerChamp(el, ok, r) {
  if (!el) return;
  el.classList.toggle("kta-cfg-ko", !ok);
  el.classList.remove("kta-cfg-ok");
  if (ok) {
    void el.offsetWidth;   // relance l'animation « enregistré »
    el.classList.add("kta-cfg-ok");
    el.title = "";
    return;
  }
  const msg = window.I18n.t("config.champ.horsBornes", { min: r.min, max: (r.max === Infinity ? "∞" : r.max) });
  el.title = msg;
  _cfgToast(msg, "warn");
}
function _cfgSignalerChangement() {
  for (let i = 0; i < arguments.length; i++) {
    const el = arguments[i];
    if (el && typeof el.dispatchEvent === "function") el.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
// Les trois réglages de podomètre partent ENSEMBLE, depuis APP_CONFIG (validés un à un).
function _cfgAppliquerPodometre() {
  // GLOBAL : vaut pour tous les plans (décision produit).
  if (typeof window.setGlobalPodometre !== "function") return;
  window.setGlobalPodometre({
    stepLength:    APP_CONFIG.stepLength,
    stepThreshold: APP_CONFIG.stepThreshold,
    stepCooldown:  APP_CONFIG.stepCooldown
  });
}
// Départ X/Y : les deux champs se règlent l'un après l'autre → 600 ms de calme avant de replacer le suivi
// (UN reset, pas deux). Fermer la modale l'exécute.
let _cfgDepartTimer = null, _cfgDepartFn = null;
function _cfgAppliquerDepart() {
  clearTimeout(_cfgDepartTimer);
  _cfgDepartFn = function () {
    _cfgDepartFn = null;
    const rx = _cfgValider("cfg_startX", (document.getElementById("cfg_startX") || {}).value);
    const ry = _cfgValider("cfg_startY", (document.getElementById("cfg_startY") || {}).value);
    if (!rx.ok || !ry.ok) return;
    if (APP_CONFIG.startX === rx.v && APP_CONFIG.startY === ry.v) return;
    APP_CONFIG.startX = rx.v;
    APP_CONFIG.startY = ry.v;
    if (typeof window.setPlanTracking === "function") window.setPlanTracking(null, { startX: rx.v, startY: ry.v });
    // Le suivi n'est replacé QUE si le départ a changé.
    if (typeof window.resetTrackingPosition === "function") window.resetTrackingPosition();
    _cfgToast(window.I18n.t("config.tracker.departToast"), "info");
  };
  _cfgDepartTimer = setTimeout(function () { if (_cfgDepartFn) _cfgDepartFn(); }, 600);
}
function _cfgFlushDepart() {
  clearTimeout(_cfgDepartTimer);
  if (_cfgDepartFn) _cfgDepartFn();
}
function _bindReglagesImmediats() {
  const on = function (id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", function () { fn(el); });
  };
  on("cfg_scale", function (el) {
    const r = _cfgValider("cfg_scale", el.value); _cfgMarquerChamp(el, r.ok, r); if (!r.ok) return;
    APP_CONFIG.scale = r.v;
    if (typeof window.setPlanScale === "function") window.setPlanScale(null, r.v);
  });
  ["cfg_startX", "cfg_startY"].forEach(function (id) {
    on(id, function (el) { const r = _cfgValider(id, el.value); _cfgMarquerChamp(el, r.ok, r); if (r.ok) _cfgAppliquerDepart(); });
  });
  [["cfg_stepLength", "stepLength"], ["cfg_stepThreshold", "stepThreshold"], ["cfg_stepCooldown", "stepCooldown"]].forEach(function (p) {
    on(p[0], function (el) {
      const r = _cfgValider(p[0], el.value); _cfgMarquerChamp(el, r.ok, r); if (!r.ok) return;
      APP_CONFIG[p[1]] = r.v;
      _cfgAppliquerPodometre();
    });
  });
  on("cfg_smartNav", function (el) {
    if (typeof window.setPlanSmartNav === "function") window.setPlanSmartNav(null, { smartNav: !!el.checked });
    _cfgToast(window.I18n.t(el.checked ? "config.smartnav.toastOn" : "config.smartnav.toastOff"), "info");
  });
  [["cfg_smartNavRadius", "smartNavRadiusM"], ["cfg_smartNavHeading", "smartNavHeadingWeight"]].forEach(function (p) {
    on(p[0], function (el) {
      const r = _cfgValider(p[0], el.value); _cfgMarquerChamp(el, r.ok, r); if (!r.ok) return;
      const patch = {}; patch[p[1]] = r.v;
      if (typeof window.setPlanSmartNav === "function") window.setPlanSmartNav(null, patch);
    });
  });
  const home = document.getElementById("cfg_globaux_home");
  if (home) home.addEventListener("click", function () {
    _cfgFermer();
    if (typeof window._retourLoaderAvecConfirm === "function") window._retourLoaderAvecConfirm();
    else if (typeof window.afficherLoader === "function") window.afficherLoader();
  });
}

// 🏷️ ancre:fin-reglages-immediats
// ── Fermeture : croix, bouton Fermer, clic hors modale, Échap ──
let _cfgKeyHandler = null;
function _cfgFermer() {
  _cfgFlushDepart();
  if (_cfgKeyHandler) { document.removeEventListener("keydown", _cfgKeyHandler); _cfgKeyHandler = null; }
  const m = document.getElementById("kta-cfg-modal");
  if (m) m.remove();
}
function _cfgInstallerFermeture(modal) {
  if (_cfgKeyHandler) document.removeEventListener("keydown", _cfgKeyHandler);
  _cfgKeyHandler = function (e) {
    if (e.key !== "Escape") return;
    const m = document.getElementById("kta-cfg-modal");
    if (!m) { document.removeEventListener("keydown", _cfgKeyHandler); _cfgKeyHandler = null; return; }
    if (m.style.display === "none") return;                      // picker carte / Nord en cours
    const sub = document.getElementById("kta-cfg-georef-modal");
    if (sub) { e.preventDefault(); if (sub._ktaFermer) sub._ktaFermer(); else sub.remove(); return; }
    const dessus = document.querySelector(".kta-readme-modal-overlay:not(#kta-cfg-modal)");
    if (dessus && !m.contains(dessus)) return;
    e.preventDefault();
    _cfgFermer();
  };
  document.addEventListener("keydown", _cfgKeyHandler);
  const croix = document.getElementById("kta-cfg-close");
  if (croix) croix.addEventListener("click", _cfgFermer);
  const btn = document.getElementById("kta-cfg-fermer");
  if (btn) btn.addEventListener("click", _cfgFermer);
  // Écouteurs, pas de onclick inline (CSP sans 'unsafe-inline').
  const calib = document.getElementById("kta-cfg-calib-echelle");
  if (calib) calib.addEventListener("click", function () { if (typeof window.ouvrirCalibrageEchelle === "function") window.ouvrirCalibrageEchelle(); });
  const reset = document.getElementById("kta-cfg-reset");
  if (reset) reset.addEventListener("click", function () { if (typeof window.resetConfig === "function") window.resetConfig(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) _cfgFermer(); });
}

// ── Modale Réglages (plein écran) ──────────
function afficherConfig() {
  const existing = document.getElementById("kta-cfg-modal");
  if (existing) { _cfgFermer(); return; }

  const c = APP_CONFIG;

  // Métadonnées du preset perf actif (affichage en lecture seule).
  const _PRESET_LABELS = {
    "off":         { emoji: "💤", label: window.I18n.t("config.preset.off") },
    "auto":        { emoji: "🔄", label: window.I18n.t("config.preset.auto") },
    "quality":     { emoji: "🌟", label: window.I18n.t("config.preset.quality") },
    "balanced":    { emoji: "🎯", label: window.I18n.t("config.preset.balanced") },
    "performance": { emoji: "⚡", label: window.I18n.t("config.preset.performance") }
  };
  const presetMeta = _PRESET_LABELS[c.perfPreset] || _PRESET_LABELS.auto;


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

        <!-- ═══════════════════════════════════════════════════════════════
             🆕 Réorganisation ergonomique (groupes thématiques) — KARMA.
             Les blocs ci-dessous sont DÉPLACÉS, pas réécrits : tous les id,
             class, data-i18n et listeners (attachés par id plus bas dans la
             fonction) restent strictement identiques. Chaque groupe est
             précédé d'un en-tête .kta-cfg-group-titre.
             ═══════════════════════════════════════════════════════════════ -->

        <!-- ════════ 1. 🌍 APPLICATION ════════ -->
        ${_cfgGroupeDebut("config.group.application", "global", true)}

        <!-- Mode présentation : une ligne comme les autres, en tête du premier groupe (le seul ouvert d'office sur
             téléphone, où c'est le seul chemin vers ce mode). Sortie : F / Échap, ou le ✕ flottant de
             presentationMode.js. -->
        <div class="kta-aide-section">
          <button type="button" class="kta-perf-ultra-row kta-cfg-ligne-action" id="cfg_presentation_btn">
            <span class="kta-cfg-ligne-action-icone" aria-hidden="true">🎬</span>
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.presentation.btn")}</span>
              <span class="kta-perf-ultra-hint">${window.I18n.t("config.presentation.hint")}</span>
            </span>
            <span class="kta-cfg-ligne-action-chevron" aria-hidden="true">›</span>
          </button>
        </div>

        ${_renderCfgGlobauxLectureSeule()}

        <!-- 🌍 v1.85.4 (audit KARMA) — LE SÉLECTEUR DE LANGUE A QUITTÉ CET ÉCRAN.
             I18n.setLang() persiste dans la clé myktamap_app_lang : c'est un
             réglage GLOBAL, il n'a rien à faire dans la config d'UN plan. Pire,
             il ouvre une modale « redémarrer l'app » — le plus mauvais moment
             possible quand on est en cavité. Il reste atteignable à deux
             endroits, tous deux hors plan : la Configuration de l'accueil
             (#loaderAppLang) et l'écran de déverrouillage (unlockGate.js).
             ⚠️ Zéro backtick ici : ce commentaire vit dans un template literal. -->

        <!-- ════════ 2. 📐 PLAN : ÉCHELLE & GÉOLOCALISATION ════════ -->
        ${_cfgGroupeFin()}
        ${_cfgGroupeDebut("config.group.planCalib", "plan")}

        <!-- Bandeau cohérence échelle GPS — reste en tête de CE groupe -->
        ${(typeof window.renderBannerCoherenceEchelle === "function")
            ? window.renderBannerCoherenceEchelle(window._currentLoadedPlanId, { context: "settings" })
            : ""}

        <!-- 📐 Échelle (m/px) + 🎯 calibrage — EXTRAIT de l'ancienne section
             "Détection des pas". Le bouton 🎯 ouvre ouvrirCalibrageEchelle().
             L'input cfg_scale s'enregistre à la modification (v1.92.0). -->
        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("config.steps.scale")}</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <input class="kta-cfg-input" id="cfg_scale" type="number" step="0.1" value="${c.scale}" style="flex:1;">
            <button type="button" class="kta-btn kta-btn-ghost" id="kta-cfg-calib-echelle"
              style="padding:6px 10px; font-size:13px; white-space:nowrap;"
              title="${window.I18n.t("config.steps.scaleTitle")}">🎯</button>
          </div>
        </div>

        <!-- 🧭 v1.37.0 — Calibration Nord per-plan. EXTRAITE de l'ancienne
             section "Affichage". Utile quand le HAUT du plan n'est PAS le Nord
             vrai (photo aérienne avec cadrage arbitraire, plan cataphile sans
             rosace alignée). Cascade lecture : LS prefs-plan >
             APP_CONFIG.northOffsetDeg (mappé depuis plan-config.json) > 0.
             Setter notifie via event kta:northOffsetChange → re-render tracker
             à chaud. Convention : 0° = Nord = haut du plan, sens HORAIRE.
             UI : champ angle toujours visible (saisie directe) + bouton
             picker 2 clics Sud→Nord (WYSIWYG sur la map courante) + reset. -->
        <div class="kta-aide-section">
          <div id="cfg_north_block" class="kta-perf-ultra-row" style="margin-top:0; display:block; padding:8px; border:1px solid rgba(255,255,255,0.06); border-radius:8px; background:rgba(255,255,255,0.02);">
            <div class="kta-perf-ultra-text" style="margin-bottom:6px;">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.north.label")}</span>
              <span class="kta-perf-ultra-hint" style="display:block;">
                ${window.I18n.t("config.display.north.hint")}
              </span>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
              <input type="number" id="cfg_north_offset_input" min="0" max="359" step="1" value="0"
                     style="flex:0 0 90px; padding:6px 8px; border-radius:6px;
                            background:rgba(255,255,255,0.06); color:var(--kta-texte);
                            border:1px solid rgba(255,255,255,0.12); font-weight:600;">
              <span style="color:var(--kta-texte-3); font-size:12px;">°</span>
              <button type="button" id="cfg_north_picker_btn" class="kta-btn"
                      style="flex:1 1 auto; min-width:140px;">${window.I18n.t("config.display.north.calibrate")}</button>
              <button type="button" id="cfg_north_reset_btn" class="kta-btn"
                      style="flex:0 0 auto;" title="${window.I18n.t("config.display.north.resetTitle")}">${window.I18n.t("config.display.north.reset")}</button>
            </div>
            <div id="cfg_north_status" style="margin-top:4px; font-size:11.5px; color:var(--kta-texte-3); min-height:14px;"></div>
          </div>
        </div>

        <!-- 🌐 Géoréférencement GPS — DÉPLACÉ ici depuis la fin de la modale
             (rendu par _renderCfgGeorefSection, ids cfg_kmz_* inchangés). -->
        ${_renderCfgGeorefLanceur()}

        <!-- ════════ 3. 📍 NAVIGATION & TRACKER ════════ -->
        ${_cfgGroupeFin()}
        ${_cfgGroupeDebut("config.group.navTracker", "mixte")}   <!-- 👣 v1.96.0 : départ et nav = ce plan, détection des pas = tous les plans -->

        <!-- 🆕 v1.49.0 (Lot C) — prérequis échelle PX/M (demande KARMA) : position de
             départ, détection de pas et navigation intelligente dépendent tous de
             l'échelle m/px. Bleu (info/prérequis) ≠ ambre (réglages dangereux). -->
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

        <!-- Détection des pas — SANS l'échelle (extraite en groupe 2).
             Les params de pas restent ici : longueur / seuil / cooldown. -->
        <div class="kta-aide-section">
          <!-- 👣 v1.96.0 — portée GLOBALE, dite avec le MÊME badge que les groupes
               (KARMA : « il me semblait que Détection des pas était appliqué à
               tous les plans, or le groupe dit ce plan ») : le groupe passe en
               « selon la ligne », et cette section porte son badge 🌍. -->
          <div class="kta-aide-section-titre" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <span>${window.I18n.t("config.steps.titre")}</span>
            <span class="kta-cfg-scope kta-cfg-scope-global">${window.I18n.t("config.scope.badgeGlobal")}</span>
          </div>
          <!-- 🆕 v1.49.0 (Lot C) — avertissement réglages experts (demande KARMA) -->
          <div style="margin:0 0 10px; padding:8px 10px; background:rgba(255,180,80,0.1); border:1px solid rgba(255,180,80,0.3); border-radius:6px; font-size:12px; color:#ffd28a; line-height:1.45;">
            ${window.I18n.t("config.tracker.expertWarn")}
          </div>
          <div class="kta-cfg-grille">
            <label class="kta-cfg-label">${window.I18n.t("config.steps.stepLength")}</label>
            <input class="kta-cfg-input" id="cfg_stepLength" type="number" step="0.1" min="0" max="1.5" value="${c.stepLength}">
            <label class="kta-cfg-label">${window.I18n.t("config.steps.threshold")}</label>
            <input class="kta-cfg-input" id="cfg_stepThreshold" type="number" step="0.1" min="10" max="30" value="${c.stepThreshold}">
            <label class="kta-cfg-label">${window.I18n.t("config.steps.cooldown")}</label>
            <input class="kta-cfg-input" id="cfg_stepCooldown" type="number" min="300" max="3000" step="50" value="${c.stepCooldown}">
          </div>
        </div>

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("config.smartnav.titre")}</div>
          <label class="kta-perf-ultra-row" style="margin-top:0;">
            <input type="checkbox" id="cfg_smartNav" ${c.smartNav === true ? "checked" : ""}>
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.smartnav.label")}</span>
            </span>
          </label>
          <!-- 🆕 v1.49.0 (Lot C) — tolérances réglables du verrou sur tracé + avertissement -->
          <div style="margin:10px 0 8px; padding:8px 10px; background:rgba(255,180,80,0.1); border:1px solid rgba(255,180,80,0.3); border-radius:6px; font-size:12px; color:#ffd28a; line-height:1.45;">
            ${window.I18n.t("config.smartnav.warn")}
          </div>
          <div class="kta-cfg-row">
            <label class="kta-cfg-label">${window.I18n.t("config.smartnav.radiusLabel")}</label>
            <input class="kta-cfg-input" id="cfg_smartNavRadius" type="number" step="0.5" min="1" max="50" value="${Number.isFinite(c.smartNavRadiusM) ? c.smartNavRadiusM : 6}">
          </div>
          <div class="kta-cfg-row">
            <label class="kta-cfg-label">${window.I18n.t("config.smartnav.headingLabel")}</label>
            <input class="kta-cfg-input" id="cfg_smartNavHeading" type="number" step="0.05" min="0" max="5" value="${Number.isFinite(c.smartNavHeadingWeight) ? c.smartNavHeadingWeight : 0.7}">
          </div>

        </div>

        <!-- ════════ 4. 🎨 AFFICHAGE ════════ -->
        ${_cfgGroupeFin()}
        ${_cfgGroupeDebut("config.group.affichage", "mixte")}

          <!-- ⚠️ v1.85.3 (audit KARMA) — QUATRE RÉGLAGES ONT QUITTÉ CET ÉCRAN :
               taille des icônes au zoom, ancrage des panneaux, magnétisme au
               dessin et son rayon. Ils sont GLOBAUX — une seule valeur pour
               toute l'application — donc les modifier depuis un plan changeait
               le comportement de TOUS les autres, sans que rien ne le dise.
               Ils vivent désormais dans ⚙️ Configuration de l'ACCUEIL, où on
               les décide une fois. Ce qui reste ici ne concerne que CE plan. -->


        <div class="kta-aide-section">
          <!-- v1.9.2 to v1.36.2 : le toggle "Afficher les ronds aux
               intersections de tracés" REVIENT ici, mais cette fois en
               PER-PLAN (KARMA : enleve du home, met le dans la config du plan).
               La pref est stockée par plan dans myktamap_plan_prefs_PLANID,
               avec fallback sur la pref globale historique. Le handler appelle
               window.setPlanShowsIntersections() qui persiste + re-render. -->
          <!-- 🎨 07/10/2026 — Fond sous le plan, PAR PLAN (se voit sous un plan transparent). -->
          <div class="kta-cfg-label" style="margin-top:4px;">${window.I18n.t("config.fond.label")}</div>
          <select class="kta-cfg-input" id="cfg_fond_plan" style="margin-top:4px;">
            <option value="">${(typeof window.getPlanFondConseille === "function" && window.getPlanFondConseille())
              ? window.I18n.t("config.fond.defautConseil", { fond: window.I18n.t("config.fond." + window.getPlanFondConseille()) })
              : window.I18n.t("config.fond.defautTheme")}</option>
            <option value="noir">${window.I18n.t("config.fond.noir")}</option>
            <option value="blanc">${window.I18n.t("config.fond.blanc")}</option>
            <option value="gris">${window.I18n.t("config.fond.gris")}</option>
          </select>

          <label class="kta-perf-ultra-row" id="cfg_show_intersections_row" style="margin-top:8px;">
            <input type="checkbox" id="cfg_show_intersections">
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.intersections.label")}</span>
            </span>
          </label>

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

          <!-- 🆕 v1.21.1+ (KARMA) : toggle Wake Lock API — empêche l'écran de
               s'éteindre tant que l'app est ouverte. Utile cataphile pour ne
               pas avoir à débloquer son téléphone toutes les 30s en cavité.
               Compatibilité : Chrome 84+, Edge 84+, Safari iOS 16.4+ (PWA),
               PAS Firefox (Bug 1589554). Toggle masqué automatiquement si
               l'API n'est pas supportée. -->
          <label class="kta-perf-ultra-row" id="cfg_wake_lock_row" style="margin-top:8px; display:none;">
            <input type="checkbox" id="cfg_wake_lock">
            <span class="kta-perf-ultra-text">
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.wakelock.label")} <em>${window.I18n.t("config.scope.tousPlans")}</em></span>
              <span class="kta-perf-ultra-hint" id="cfg_wake_lock_hint"></span>
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
              <span class="kta-perf-ultra-label">${window.I18n.t("config.display.voice.label")} <em>${window.I18n.t("config.scope.tousPlans")}</em></span>
              <span class="kta-perf-ultra-hint" id="cfg_voice_hint"></span>
            </span>
          </label>
        </div>

        <!-- ════════ 5. 🚀 PERFORMANCE ════════ -->
        ${_cfgGroupeFin()}
        ${_cfgGroupeDebut("config.group.perf", "plan")}

        ${_renderPerfUltraSection()}

        <!-- ════════ 6. 🧩 FONCTIONNALITÉS OPTIONNELLES ════════ -->
        ${_cfgGroupeFin()}
        ${_cfgGroupeDebut("config.group.optionnels", "global")}
          <!-- 🧩 01/10/2026 (KARMA) — ex-« Options via capteur », élargi au
               Replay et à la Heatmap : tout est OFF par défaut, pour
               désencombrer l'app. Même état que l'accueil (app_user_prefs).
               🛰️ v1.85.2 (KARMA) — RUBRIQUE « Options via capteur ».
               La vibration vivait dans « Affichage », ce qu'elle n'est pas :
               elle dépend d'un CAPTEUR, comme la batterie. Les deux sont
               regroupées ici, et surtout : un capteur indisponible n'est plus
               MASQUÉ mais AFFICHÉ, désactivé, avec la raison. Cacher la ligne
               laissait croire que l'option n'existait pas — l'utilisateur ne
               pouvait pas savoir que c'est son système qui refuse. -->
          <div class="kta-aide-section" style="margin-top:16px;">
            <div class="kta-aide-section-titre">${window.I18n.t("config.optionnels.titre")}</div>

            <label class="kta-perf-ultra-row" id="cfg_replay_row">
              <input type="checkbox" id="cfg_replay" ${c.replayEnabled === true ? "checked" : ""}>
              <span class="kta-perf-ultra-text">
                <span class="kta-perf-ultra-label">${window.I18n.t("config.replay.label")} <em>${window.I18n.t("config.scope.tousPlans")}</em></span>
              </span>
            </label>

            <label class="kta-perf-ultra-row" id="cfg_heatmap_row" style="margin-top:8px;">
              <input type="checkbox" id="cfg_heatmap" ${c.heatmapEnabled === true ? "checked" : ""}>
              <span class="kta-perf-ultra-text">
                <span class="kta-perf-ultra-label">${window.I18n.t("config.heatmap.label")} <em>${window.I18n.t("config.scope.tousPlans")}</em></span>
              </span>
            </label>

            <label class="kta-perf-ultra-row" id="cfg_batterie_row" style="margin-top:8px;">
              <input type="checkbox" id="cfg_batterie" ${c.batterieEnabled === true ? "checked" : ""}>
              <span class="kta-perf-ultra-text">
                <span class="kta-perf-ultra-label">${window.I18n.t("config.batterie.label")} <em>${window.I18n.t("config.scope.tousPlans")}</em></span>
                <span class="kta-perf-ultra-hint" id="cfg_batterie_hint"></span>
              </span>
            </label>

            <label class="kta-perf-ultra-row" id="cfg_vibration_row" style="margin-top:8px;">
              <input type="checkbox" id="cfg_vibration" ${c.vibrationEnabled === true ? "checked" : ""}>
              <span class="kta-perf-ultra-text">
                <span class="kta-perf-ultra-label">${window.I18n.t("config.display.vibration.label")} <em>${window.I18n.t("config.scope.tousPlans")}</em></span>
                <span class="kta-perf-ultra-hint" id="cfg_vibration_hint"></span>
              </span>
            </label>
          </div>
        <!-- 🕵️ Dans les fonctionnalités optionnelles depuis le 07/10/2026 ; grisé sur une installation reliée. -->
        <!-- 🕵️ v1.31.8 F2 + 🆕 v1.31.9 : Mode incognito — bouton qui
             ouvre une NOUVELLE fenêtre dans le même origin avec ?incognito=1
             (activate) OU close la fenêtre courante si déjà incognito (quit).
             Pas un toggle sur la fenêtre courante : l'incognito doit démarrer
             DÈS le boot (sinon les modules ont déjà écrit). Ouvrir un nouvel
             onglet est sémantiquement clair (= comme un onglet privé navigateur). -->
        ${(window.IncognitoMode && !window.IncognitoMode.active && window.IncognitoMode.indisponible && window.IncognitoMode.indisponible()) ? `
        <div class="kta-aide-section">
          <button class="kta-cfg-incognito-btn kta-cfg-incognito-btn-indispo" type="button" id="cfg_incognito_btn" disabled>
            <span style="font-size:18px;">🕵️</span>
            <span><strong>${window.I18n.t("home.privacy.incognitoRelieLabel")}</strong></span>
          </button>
          <div class="kta-cfg-raison" style="margin-top:8px; padding:0 4px;">${window.I18n.t("home.privacy.incognitoRelieHint")}</div>
        </div>` : (window.IncognitoMode && window.IncognitoMode.active) ? `
        <div class="kta-aide-section">
          <button class="kta-cfg-incognito-btn kta-cfg-incognito-btn-quit" type="button" id="cfg_incognito_btn">
            <span style="font-size:18px;">✕</span>
            <span><strong>${window.I18n.t("config.incognito.quit.btn")}</strong></span>
          </button>
          <div class="kta-cfg-raison" style="margin-top:8px; padding:0 4px;">${window.I18n.t("home.privacy.incognitoQuitHint")}</div>
        </div>` : `
        <div class="kta-aide-section">
          <button class="kta-cfg-incognito-btn" type="button" id="cfg_incognito_btn">
            <span style="font-size:18px;">🕵️</span>
            <span><strong>${window.I18n.t("config.incognito.start.btn")}</strong></span>
          </button>
        </div>`}
        <!-- 🔒 CONFIDENTIALITÉ & SÉCURITÉ : groupe RETIRÉ des Réglages du plan le 12/10/2026 (capture KARMA : titre
             qui ne déroulait rien). Son seul contenu, l'interrupteur du carnet (📔 Q49, v1.92.0 L4), VIT DANS
             ⚙️ CONFIGURATION DE L'ACCUEIL ; il reste lisible ici dans « 🏠 Réglés depuis l'accueil ». -->

        <!-- ════════ 8. 🛠️ SYSTÈME & MAINTENANCE ════════ -->
        ${_cfgGroupeFin()}
        ${_cfgGroupeDebut("config.group.system", "plan")}

        <div class="kta-aide-section">
          <div class="kta-aide-section-titre">${window.I18n.t("config.debug.titre")}</div>
          <!-- 🛠️ v1.76.3 (décision KARMA 2:b) : le select debugMode et le
               bouton 📋 Afficher les logs ont été RETIRÉS d'ici — les logs
               se pilotent depuis le Mode Développeur du ⚙️ Configuration
               HOME (gate mdp). Le perfMode, lui, reste. -->

          <div style="display:flex; align-items:center; gap:12px; margin-top:12px;">
            <div style="flex:1;">
              <div style="font-size:13px; font-weight:600; color:var(--kta-texte);">${window.I18n.t("config.debug.perfMode")}</div>
              <div style="font-size:11px; color:var(--kta-texte-3); margin-top:2px;">${window.I18n.t("config.debug.perfModeHint")}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px; padding:10px 14px; background:rgba(255,255,255,0.04); border-radius:6px; border:1px solid var(--kta-bordure);">
              <span style="font-size:22px;">${presetMeta.emoji}</span>
              <span style="font-size:15px; font-weight:600; color:var(--kta-texte);">${presetMeta.label}</span>
            </div>
          </div>
        </div>

        <!--
          🆕 v1.7.3 (suite KARMA) : bouton 🗑️ Réinitialiser RETIRÉ de la modale ⚙️
          Réglages en mode carte. Le reset complet reste accessible UNIQUEMENT
          depuis la modale ⚙️ Configuration du loader (home). Raison : limiter
          les déclenchements accidentels une fois un plan chargé (l'user perd
          potentiellement sa session active + tous ses plans mémorisés en 2 clics).
          Pour reset depuis la map : passer par 🗂️ titre cliquable → home → ⚙️
          Configuration → 🆘 Dépannage → 💥 Tout réinitialiser.
        -->
        ${_cfgGroupeFin()}
        <div class="kta-cfg-actions-bar">
          <button class="kta-btn kta-btn-ghost" type="button" id="kta-cfg-reset">${window.I18n.t("config.actions.reset")}</button>
          <button class="kta-btn kta-btn-primary" type="button" id="kta-cfg-fermer">${window.I18n.t("config.actions.close")}</button>
        </div>

      </div>
    </div>
  `;

  document.documentElement.appendChild(modal);
  const _capteurRefuse = window.ktaCapteurRefuse || function () {};
  _cfgInstallerFermeture(modal);
  _bindCfgGroupes(modal);
  _bindReglagesImmediats();
  _bindCfgGeorefLanceur();

  if (typeof window.attacherBoutonCopierEchelleGps === "function") {
    window.attacherBoutonCopierEchelleGps(modal);
  }

  _bindPerfUltraToggles();

  // Handlers du géoréf posés à l'ouverture de sa sous-modale (KmzExport.setCalibration, relu par Export externe).

  _bindCfgTrackerStartHandlers();

  // « Activer le mode présentation » : sur mobile (pas de touche F), le seul chemin vers ce mode. Sortie : F/Échap
  // (PC) ou bouton flottant ✕ (presentationMode.js > activate()).
  const btnPresentation = document.getElementById("cfg_presentation_btn");
  if (btnPresentation) {
    btnPresentation.addEventListener("click", function() {
      // Fermer AVANT d'activer, sinon la modale reste par-dessus la carte.
      _cfgFermer();
      setTimeout(function() {
        if (window.PresentationMode && typeof window.PresentationMode.activate === "function") {
          window.PresentationMode.activate();
        } else {
          window.ktaAlerte(window.I18n.t("config.presentation.unavailable"), { type: "erreur" });
        }
      }, 50);
    });
  }

  // Bouton « Démarrer / Quitter le mode incognito » selon IncognitoMode.active : Démarrer ouvre une NOUVELLE
  // fenêtre ?incognito=1 ; Quitter tente window.close() puis navigue sans ?incognito=1.
  const btnIncognito = document.getElementById("cfg_incognito_btn");
  if (btnIncognito) {
    btnIncognito.addEventListener("click", function() {
      if (!window.IncognitoMode) {
        window.ktaAlerte(window.I18n.t("config.incognito.unavailable"), { type: "erreur" });
        return;
      }
      if (window.IncognitoMode.active) {
        // Confirmation avant de quitter (perte de données possible).
        window.ktaConfirm(window.I18n.t("config.incognito.confirmQuit")).then(function(ok) {
          if (ok) window.IncognitoMode.quit();
        });
      } else {
        // confirmAndLaunch() : modale de garde-fou (description, risques), annulable.
        window.IncognitoMode.confirmAndLaunch();
      }
    });
  }

  // « Garder l'écran allumé » (navigator.wakeLock : Chrome/Edge/Safari iOS 16.4+, pas Firefox), via
  // window.WakeLock.isEnabled() / setEnabled().
  const wlRow = document.getElementById("cfg_wake_lock_row");
  const wlCb  = document.getElementById("cfg_wake_lock");
  if (wlRow && wlCb) {
    if (window.WakeLock && window.WakeLock.isSupported()) {
      wlRow.style.display = "";  // révèle (default = none pour rétrocompat)
      wlCb.checked = window.WakeLock.isEnabled();
      wlCb.addEventListener("change", function() {
        // 🩸 ON ATTEND LE RÉSULTAT RÉEL avant d'annoncer « écran maintenu allumé » : un navigateur peut refuser
        // le verrou (iPhone en PWA).
        Promise.resolve(window.WakeLock.setEnabled(wlCb.checked)).then(function (ok) {
          if (!(window.OOMGuard && typeof window.OOMGuard.showToast === "function")) return;
          if (!wlCb.checked) {
            window.OOMGuard.showToast(window.I18n.t("config.display.wakelock.toastOff"), "info");
            return;
          }
          window.OOMGuard.showToast(
            ok ? window.I18n.t("config.display.wakelock.toastOn")
               : window.I18n.t("config.display.wakelock.toastKo"),
            ok ? "info" : "warn");
        });
      });
    } else {
      // 🩸 AFFICHÉ, désactivé, avec la raison (comme batterie et vibration) : masquer laisserait croire que
      // l'option n'existe pas.
      _capteurRefuse(wlRow, wlCb, document.getElementById("cfg_wake_lock_hint"), "config.capteurs.nonSupporte");
    }
  }

  // Fond conseillé et ronds aux intersections : réglages PAR PLAN (getPlanShowsIntersections, repli global → true ;
  // setPlanShowsIntersections persiste et re-rend).
  const fondSel = document.getElementById("cfg_fond_plan");
  if (fondSel) {
    fondSel.value = (typeof window.getPlanFondChoisi === "function") ? window.getPlanFondChoisi() : "";
    fondSel.addEventListener("change", function () {
      if (typeof window.setPlanFond === "function") window.setPlanFond(null, fondSel.value);
    });
  }
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

  // Calibration du Nord par plan : champ d'angle (blur → setPlanNorthOffset), « Calibrer (2 clics) » (picker
  // Sud → Nord sur la carte, puis réouverture pour montrer l'angle), « ↺ Reset » (resetPlanNorthOffset, cascade).
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
        status.textContent = window.I18n.t("config.north.statusDefault");
        status.style.color = "var(--kta-texte-3)";
      } else {
        status.textContent = window.I18n.t("config.north.statusCalibrated", { deg: cur.toFixed(1) });
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
          window.OOMGuard.showToast(window.I18n.t("config.display.north.pickerUnavailable"), "warn");
        }
        return;
      }
      // Comme le picker géoréf : la modale est CACHÉE (display:none) le temps du picker, puis remontrée. Sinon
      // elle (z >> carte) capte les clics et le picker semble ne rien faire.
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
        // _refreshStatus suit l'événement kta:northOffsetChange.
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast(window.I18n.t("config.display.north.calibratedToast", { deg: deg.toFixed(1) }), "info");
        }
      }).catch(function(e) {
        _showCfgBack();
        console.warn("[NorthPicker] échec :", e);
        if (window.OOMGuard && window.OOMGuard.showToast) {
          window.OOMGuard.showToast("⚠️ " + (e && e.message ? e.message : window.I18n.t("config.display.north.pickerError")), "warn");
        }
      });
    });

    window.addEventListener("kta:northOffsetChange", _refreshStatus);
  })();

  // Calibration des calques image : seulement dans le générateur avancé (pas de doublon ici). Les helpers
  // ImageLayerCalibration restent pour le runtime (map.js lit encore la cascade LS → plan-config.json).

  // Pas d'import de PDF Histoire ici : l'entrée unique est la modale Mode Histoire (onglet PDF) ; l'embarquement
  // durable passe par le générateur (`plan-config.json > plan.histoirePdf`).

  // Vibration haptique : navigator.vibrate (Android oui, iOS Safari non), APP_CONFIG.vibrationEnabled +
  // app_user_prefs.
  // Taille des icônes au zoom, ancrage des panneaux, magnétisme et son rayon se règlent dans la ⚙️ Configuration
  // de l'ACCUEIL : aucun câblage ici.

  // Capteurs refusés : option AFFICHÉE désactivée, avec la raison (masquée, l'utilisateur ne sait pas si elle
  // existe, s'il l'a ratée ou si son téléphone refuse). Rendu partagé avec l'accueil (utils.js).
  // ── Batterie ──
  const batRow = document.getElementById("cfg_batterie_row");
  const batCb  = document.getElementById("cfg_batterie");
  if (batRow && batCb) {
    if (typeof navigator.getBattery !== "function") {
      _capteurRefuse(batRow, batCb, document.getElementById("cfg_batterie_hint"));
    } else {
      batCb.checked = !!(window.APP_CONFIG && window.APP_CONFIG.batterieEnabled === true);
      batCb.addEventListener("change", function () {
        if (!window.APP_CONFIG) window.APP_CONFIG = {};
        window.APP_CONFIG.batterieEnabled = !!batCb.checked;
        if (typeof window.sauvegarderPrefsUtilisateur === "function") {
          window.sauvegarderPrefsUtilisateur();
        }
        // 🩸 Couper l'écoute demande un rechargement : getBattery() a posé ses écouteurs sur le BatteryManager,
        // impossibles à retirer proprement. On le DIT.
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(window.I18n.t(batCb.checked
            ? "config.batterie.toastOn" : "config.batterie.toastOff"), "info");
        }
      });
    }
  }

  // ── Replay / Heatmap ── effet immédiat : les tuiles du menu Tracker sont filtrées à chaque ouverture.
  if (typeof window.ktaBrancherOptionnel === "function") {
    window.ktaBrancherOptionnel(document.getElementById("cfg_replay"), "replayEnabled", "config.replay");
    window.ktaBrancherOptionnel(document.getElementById("cfg_heatmap"), "heatmapEnabled", "config.heatmap");
  }

  // ── Vibration haptique ──
  const vibRow = document.getElementById("cfg_vibration_row");
  const vibCb  = document.getElementById("cfg_vibration");
  if (vibRow && vibCb) {
    const dispo = !!(window.kta_vibrate && window.kta_vibrate.isSupported());
    if (!dispo) {
      _capteurRefuse(vibRow, vibCb, document.getElementById("cfg_vibration_hint"));
    } else {
      vibCb.checked = !!(window.APP_CONFIG && window.APP_CONFIG.vibrationEnabled === true);
      vibCb.addEventListener("change", function() {
        if (!window.APP_CONFIG) window.APP_CONFIG = {};
        window.APP_CONFIG.vibrationEnabled = !!vibCb.checked;
        if (typeof window.sauvegarderPrefsUtilisateur === "function") {
          window.sauvegarderPrefsUtilisateur();
        }
        if (vibCb.checked) { window.kta_vibrate.light(); }
      });
    }
  }
  // Commandes vocales (BETA) : Web Speech API (SpeechRecognition / webkitSpeechRecognition), window.VoiceCommand.
  // Rechargement requis : le bouton micro est injecté/retiré au démarrage du module.
  const voiceRow = document.getElementById("cfg_voice_row");
  const voiceCb  = document.getElementById("cfg_voice");
  if (voiceRow && voiceCb) {
    if (window.VoiceCommand && window.VoiceCommand.isSupported()) {
      voiceRow.style.display = "";
      voiceCb.checked = window.VoiceCommand.isEnabled();
      voiceCb.addEventListener("change", function() {
        window.VoiceCommand.setEnabled(voiceCb.checked);
        if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
          window.OOMGuard.showToast(
            voiceCb.checked
              ? window.I18n.t("config.display.voice.toastOn")
              : window.I18n.t("config.display.voice.toastOff"),
            "info"
          );
        }
      });
    } else {
      // 🩸 Comme les capteurs : affiché, désactivé, raison nommée.
      _capteurRefuse(voiceRow, voiceCb, document.getElementById("cfg_voice_hint"), "config.capteurs.nonSupporte");
    }
  }

}

// Pas de `appliquerConfig` : chaque champ s'enregistre à la modification (cf. `_bindReglagesImmediats`).

// « ↺ Valeurs par défaut » : confirmation chartée qui dit ce qui part (réglages du plan ET parcours du tracker :
// polyline, pas, timeline).
function resetConfig() {
  const _go = function() { _resetConfigExecuter(); };
  if (typeof window.ktaConfirm !== "function") {   // sans confirmation, pas de remise à zéro (repli sûr)
    console.warn("[InterfaceConfig] ktaConfirm indisponible : remise aux valeurs par défaut refusée");
    return;
  }
  window.ktaConfirm(window.I18n.t("config.confirm.reset"), {
    titre:   window.I18n.t("config.confirm.resetTitre"),
    okLabel: window.I18n.t("config.actions.reset")
  }).then(function(ok) { if (ok) _go(); });
}
function _resetConfigExecuter() {
  // 🩸 Le reset ne touche que CE plan : surcharges retirées (échelle, podomètre, départ, nav intelligente, ronds,
  // Nord), retour aux valeurs DU PLAN (plan-config). Jamais Object.assign(APP_CONFIG, DEFAULT_CONFIG) +
  // sauvegarderPrefsUtilisateur(), qui remettrait aussi les préférences GLOBALES à l'usine.
  const pid = window._currentLoadedPlanId || "default";
  const D   = window.DEFAULT_CONFIG || {};
  const tr  = (window.PLAN_CONFIG && window.PLAN_CONFIG.tracking) || {};
  const usine = function (k, min, max) {
    const v = Number(tr[k] != null ? tr[k] : D[k]);
    return (Number.isFinite(v) && (min == null || (v >= min && v <= max))) ? v : Number(D[k]);
  };
  if (typeof window.resetPlanNorthOffset === "function") window.resetPlanNorthOffset(null);
  try { localStorage.removeItem("myktamap_plan_prefs_" + pid); } catch (e) {}
  APP_CONFIG.scale         = usine("scale");
  // Le podomètre revient à l'USINE de l'app (le plan ne dit pas la foulée) et la pref globale est effacée.
  const U = window.KTA_TRACKING_USINE || {};
  APP_CONFIG.stepLength    = U.stepLength;
  APP_CONFIG.stepThreshold = U.stepThreshold;
  APP_CONFIG.stepCooldown  = U.stepCooldown;
  if (typeof window.setGlobalPodometre === "function") window.setGlobalPodometre({ stepLength: null, stepThreshold: null, stepCooldown: null });
  APP_CONFIG.startX        = usine("startX");
  APP_CONFIG.startY        = usine("startY");
  if (typeof window.appliquerSmartNavPerPlan === "function") window.appliquerSmartNavPerPlan();   // repli global
  if (window.resetTrackingPosition) window.resetTrackingPosition();
  _cfgFermer();
  if (window.fermerPanneau) window.fermerPanneau();
  _cfgToast(window.I18n.t("config.confirm.resetFait"), "info");
}

// ── Multi-niveau : modales et helpers ──────────
// _ouvrirSelecteurNiveau (pastille « Niv X » du groupe Tracés) gère deux dimensions : NIVEAU ACTIF (un seul,
// pour dessiner) et NIVEAUX VISIBLES (plusieurs, filtre d'affichage).
function _ouvrirSelecteurNiveau(btnPastille) {
  if (document.getElementById("kta-niv-modal")) return;

  const cur = APP_CONFIG.activeLevel || 0;
  const visibles = Array.isArray(APP_CONFIG.visibleLevels) ? APP_CONFIG.visibleLevels.slice() : [cur];
  const levels = Array.isArray(APP_CONFIG.availableLevels) && APP_CONFIG.availableLevels.length
    ? APP_CONFIG.availableLevels.slice()
    : [-2, -1, 0, 1, 2];
  // Tri croissant pour l'affichage horizontal -2 → +2 : availableLevels peut être dans n'importe quel ordre
  // (push/unshift des boutons +/-).
  levels.sort(function(a, b) { return a - b; });

  // Segmented (niveau actif) encadré de [-] et [+].
  let segmented = "";
  levels.forEach(function(lvl) {
    const active = (lvl === cur);
    segmented +=
      '<button type="button" class="kta-niv-seg-btn' + (active ? ' kta-actif' : '') +
      '" data-level="' + lvl + '">' + lvl + '</button>';
  });

  // Cases (niveaux visibles), même ordre croissant.
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

        '<div class="kta-niv-section">' +
          '<div class="kta-niv-section-titre">' + window.I18n.t("config.niveaux.active.titre") + '</div>' +
          '<div class="kta-niv-segmented">' +
            '<button type="button" class="kta-niv-seg-btn kta-niv-seg-add" id="kta-niv-sub" title="' + window.I18n.t("config.niveaux.addBelow") + '">−</button>' +
            segmented +
            '<button type="button" class="kta-niv-seg-btn kta-niv-seg-add" id="kta-niv-add" title="' + window.I18n.t("config.niveaux.addAbove") + '">+</button>' +
          '</div>' +
        '</div>' +

        '<div class="kta-niv-section">' +
          '<div class="kta-niv-section-titre">' + window.I18n.t("config.niveaux.visible.titre") + '</div>' +
          '<div class="kta-niv-vis-grid">' + checkboxes + '</div>' +
          '<div class="kta-niv-vis-actions">' +
            '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-niv-vis-all">' + window.I18n.t("config.niveaux.visible.all") + '</button>' +
            '<button type="button" class="kta-btn kta-btn-ghost kta-btn-small" id="kta-niv-vis-active">' + window.I18n.t("config.niveaux.visible.activeOnly") + '</button>' +
          '</div>' +
        '</div>' +

        '<p style="font-size:11.5px; color:var(--kta-texte-3); margin:6px 0 0 0; line-height:1.5;">' +
          window.I18n.t("config.niveaux.warn") +
        '</p>' +
        // Saisie des profondeurs : une profondeur EST une propriété du niveau, elle vit dans cet écran.
        '<button class="kta-btn kta-btn-ghost kta-btn-small" id="kta-niv-prof" type="button"' +
          ' style="margin-top:10px;">📉 ' + window.I18n.t("prof.btn.saisir") + '</button>' +
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
  const btnProf = document.getElementById("kta-niv-prof");
  if (btnProf) {
    btnProf.addEventListener("click", function () {
      _cleanup();
      if (window.ProfondeurNiveaux) window.ProfondeurNiveaux.ouvrirSaisie();
    });
  }

  // Segmented en nowrap (défilement horizontal) : le bouton actif est amené en vue à l'ouverture.
  setTimeout(function() {
    const activeBtn = overlay.querySelector(".kta-niv-seg-btn.kta-actif");
    if (activeBtn && typeof activeBtn.scrollIntoView === "function") {
      try {
        activeBtn.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
      } catch(e) {
        // Repli vieux Safari (pas de "instant").
        try { activeBtn.scrollIntoView({ block: "nearest", inline: "center" }); } catch(e2) {}
      }
    }
  }, 0);

  overlay.querySelectorAll(".kta-niv-seg-btn[data-level]").forEach(function(b) {
    b.addEventListener("click", function() {
      const lvl = parseInt(b.dataset.level, 10);
      if (!Number.isInteger(lvl)) return;
      _changerNiveauActif(lvl);
      _cleanup();
    });
  });

  // + : ajoute un niveau au-dessus du max.
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

  // − : ajoute un niveau sous le min.
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

  const allBtn = document.getElementById("kta-niv-vis-all");
  if (allBtn) {
    allBtn.addEventListener("click", function() {
      APP_CONFIG.visibleLevels = levels.slice();
      window.APP_CONFIG = APP_CONFIG;
      overlay.querySelectorAll(".kta-niv-vis-box input[type=checkbox]").forEach(function(cb) {
        cb.checked = true;
      });
      if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();
    });
  }
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

// Changement de niveau actif : délégué au helper unique (tout entier est valide, sous-sols compris).
function _changerNiveauActif(newLevel) {
  window.ktaSetActiveLevel(newLevel, { source: "modale-niveaux" });
}

// SOURCE DE VÉRITÉ UNIQUE du niveau de travail : tous les chemins (modale Niveaux, modale ≡ Filtres) passent
// ici. 🩸 Un callback optionnel gardé par `typeof === "function"` qui n'existe pas meurt en silence : la
// propagation passe par appliquerFiltreNiveau, jamais par un `window._onLevelChange` hypothétique.
// ⚠️ Changer le niveau de TRAVAIL n'écrase pas les niveaux AFFICHÉS (décision produit) : passer au -2 ne doit
// pas faire disparaître le -1 (exploration, bascule automatique en franchissant une jonction). Règle = UNION :
// le niveau de travail s'AJOUTE aux visibles (on voit toujours ce sur quoi on dessine), rien n'est retiré.
// Le mode focalisé est un geste explicite (« Actif seul », modales ≡ et Niveaux).
// @param {number} newLevel - entier (négatifs = sous-sols)
// @param {Object} [opts]   - { source?: string } pour le log
// @returns {boolean} true si appliqué
window.ktaSetActiveLevel = function(newLevel, opts) {
  if (!Number.isInteger(newLevel)) return false;
  opts = opts || {};
  if (!window.APP_CONFIG) return false;

  // Annule le tracé en cours (un tracé n'enjambe pas deux niveaux).
  if (typeof _fermerModeRoad === "function") {
    try { _fermerModeRoad(); } catch(e) {}
  }

  APP_CONFIG.activeLevel = newLevel;

  // UNION, pas remplacement (cf. ci-dessus).
  if (!Array.isArray(APP_CONFIG.visibleLevels)) APP_CONFIG.visibleLevels = [];
  if (APP_CONFIG.visibleLevels.indexOf(newLevel) === -1) {
    APP_CONFIG.visibleLevels = APP_CONFIG.visibleLevels.concat([newLevel]);
  }
  window.APP_CONFIG = APP_CONFIG;

  const pill = document.getElementById("kta-niv-pastille-icone");
  if (pill) pill.textContent = String(newLevel);

  // Propage à tous les modules level-aware ; resynchronise aussi la modale ≡ ouverte (FilterPanel.onLevelChange).
  if (typeof window.appliquerFiltreNiveau === "function") window.appliquerFiltreNiveau();

  console.log("[MultiNiveau] Niveau actif →", newLevel,
              "| Visibles :", APP_CONFIG.visibleLevels,
              opts.source ? "| src: " + opts.source : "");
  return true;
};

// Re-rend / re-filtre TOUS les modules level-aware après un changement de visibleLevels (chacun expose
// _applyLevelFilterTo*()).
window.appliquerFiltreNiveau = function() {
  // Présences / itinéraires d'une installation reliée : atténuation « hors niveau » recalculée.
  if (window.KtaPresences && typeof window.KtaPresences.redessiner === "function") {
    try { window.KtaPresences.redessiner(); } catch(e) {}
  }
  // Carte du Mode Secours (itinéraires des équipes) : même atténuation.
  if (window.SecoursMode && typeof window.SecoursMode.redessinerOverlay === "function") {
    try { window.SecoursMode.redessinerOverlay(); } catch(e) {}
  }
  // Roads + zones de session : re-rendu complet (filtre appliqué au build).
  if (typeof window.renderRoads === "function") {
    try { window.renderRoads(); } catch(e) {}
  }
  if (typeof window.renderZones === "function") {
    try { window.renderZones(); } catch(e) {}
  }
  // Structures de session.
  if (typeof window.renderStructures === "function") {
    try { window.renderStructures(); } catch(e) {}
  }
  // Points des calques DATA.
  if (typeof window._applyLevelFilterToDataPoints === "function") {
    try { window._applyLevelFilterToDataPoints(); } catch(e) {}
  }
  // Routes embarquées des calques DATA (json.roads[]).
  if (typeof window._applyLevelFilterToDataRoads === "function") {
    try { window._applyLevelFilterToDataRoads(); } catch(e) {}
  }
  // Zones embarquées des calques DATA (json.zones[]).
  if (typeof window._applyLevelFilterToDataZones === "function") {
    try { window._applyLevelFilterToDataZones(); } catch(e) {}
  }
  // Structures embarquées des calques DATA (json.structures[]).
  if (typeof window._applyLevelFilterToDataStructures === "function") {
    try { window._applyLevelFilterToDataStructures(); } catch(e) {}
  }
  // Points editor (session).
  if (typeof window._applyLevelFilterToEditorPoints === "function") {
    try { window._applyLevelFilterToEditorPoints(); } catch(e) {}
  }
  // Marqueur et polyline du tracker.
  if (typeof window._applyLevelFilterToTracker === "function") {
    try { window._applyLevelFilterToTracker(); } catch(e) {}
  }
  // Calques image à champ `level` : addLayer/removeLayer selon visibleLevels (la modale Niveaux prime sur la
  // case Leaflet).
  if (typeof window._applyLevelFilterToImageLayers === "function") {
    try { window._applyLevelFilterToImageLayers(); } catch(e) {}
  }
  // Le plan PRINCIPAL est le niveau 0 : masqué quand 0 est décoché (cf. tiling.js).
  if (typeof window._applyLevelFilterToBasePlan === "function") {
    try { window._applyLevelFilterToBasePlan(); } catch(e) {}
  }

  // Synchro avec FilterPanel : sa section multi-niveau se rafraîchit si la modale est ouverte.
  if (window.FilterPanel && typeof window.FilterPanel.onLevelChange === "function") {
    try { window.FilterPanel.onLevelChange(); } catch(e) {}
  }

  // Badges des liaisons inter-plan : ils respectent visibleLevels comme les marqueurs (sinon un badge flotte
  // sans son icône sur un niveau masqué).
  if (window.InterPlanLinks && typeof window.InterPlanLinks.refreshBadges === "function") {
    try { window.InterPlanLinks.refreshBadges(); } catch(e) {}
  }
};

// Re-rendu après changement des filtres runtime (tags, types…) : alias de appliquerFiltreNiveau, les modules
// appliquent aussi window._ktaRuntimeFilters dans la même passe.
window.appliquerFiltreRuntime = function() {
  if (typeof window.appliquerFiltreNiveau === "function") {
    window.appliquerFiltreNiveau();
  }
};

// Modale fromLevel/toLevel avant d'activer le tracé de jonction.
function _ouvrirCreationJonction(btnSub) {
  if (document.getElementById("kta-jct-modal")) return;

  const cur = APP_CONFIG.activeLevel || 0;
  const levels = Array.isArray(APP_CONFIG.availableLevels) && APP_CONFIG.availableLevels.length
    ? APP_CONFIG.availableLevels.slice()
    : [-2, -1, 0, 1, 2];
  levels.sort(function(a, b) { return a - b; });

  function _optionsHtml(selectedLevel) {
    return levels.map(function(l) {
      return '<option value="' + l + '"' + (l === selectedLevel ? ' selected' : '') + '>' +
             window.I18n.t("config.jonction.levelOption", { lvl: l }) + '</option>';
    }).join('');
  }

  // Défaut : du niveau actif vers celui juste au-dessus.
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
        '<div class="kta-jct-grille">' +
          '<label class="kta-cfg-label">' + window.I18n.t("config.jonction.fromLabel") + '</label>' +
          '<select class="kta-cfg-input" id="kta-jct-from">' + _optionsHtml(cur) + '</select>' +
          '<label class="kta-cfg-label">' + window.I18n.t("config.jonction.toLabel") + '</label>' +
          '<select class="kta-cfg-input" id="kta-jct-to">' + _optionsHtml(defaultTo) + '</select>' +
        '</div>' +
        '<p style="font-size:11.5px; color:var(--kta-texte-3); margin:12px 0 0 0; line-height:1.5;">' +
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
      window.ktaAlerte(window.I18n.t("config.jonction.errSameLevel"));
      return;
    }
    _cleanup();
    // Meta lue par road.js > mousedown au premier clic.
    window._jonctionPendingMeta = { fromLevel: fromLvl, toLevel: toLvl };
    _activerJonctionMode(btnSub, fromLvl, toLvl);
  });
}

// Mode tracé jonction (comme _activerRoute, type "jonction").
function _activerJonctionMode(btnCible, fromLvl, toLvl) {
  // _activerRoute vit dans initInterface (closure sur _groupes) : répliqué ici en scope module.
  // 🩸 _desactiverTousLesModes() d'abord : sinon un autre mode actif (point, mesure, zone…) reste en parallèle et
  // un clic carte déclenche des handlers contradictoires.
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


// ── Multi-niveau : pastille du niveau actif (contrôle Leaflet en haut à gauche) ──────────
// Bouton 30×30 sous le zoom (.leaflet-bar), chiffre du niveau actif ; clic → modale Niveaux. Le chiffre est
// rafraîchi via l'ID kta-niv-pastille-icone.
function _initLevelFilterControl() {
  if (!window.map) return;
  if (!window.APP_CONFIG || window.APP_CONFIG.multiLevel !== true) return;
  // Filet : un contrôle précédent est détruit (initInterface appelé deux fois).
  if (window._levelFilterControl) {
    try { window.map.removeControl(window._levelFilterControl); } catch(e) {}
    window._levelFilterControl = null;
  }

  const ctrl = L.control({ position: "topleft" });
  ctrl.onAdd = function() {
    const div = L.DomUtil.create("div", "leaflet-bar leaflet-control kta-level-control");
    const a   = L.DomUtil.create("a", "kta-level-btn", div);
    a.href      = "#";   // pas « javascript: » (CSP stricte) ; le clic fait L.DomEvent.stop
    a.setAttribute("role", "button");
    a.title     = window.I18n.t("config.niveaux.controlTitle");
    a.innerHTML = '<span class="kta-niv-pastille" id="kta-niv-pastille-icone">' +
                  (APP_CONFIG.activeLevel || 0) + '</span>';
  // Pas de propagation à la carte (clic-pan, molette).
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

// ── Exports window ──────────
window.afficherConfig  = afficherConfig;
window.resetConfig     = resetConfig;

// Helpers privés rendus publics : interface.js les appelle par window.X.
window._initLevelFilterControl = _initLevelFilterControl;
window._ouvrirCreationJonction  = _ouvrirCreationJonction;
