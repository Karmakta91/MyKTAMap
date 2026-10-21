/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */
// =====================================================================
// utils.js — boîte à outils partagée du moteur (globales, pas de module).
// =====================================================================
// Expose : convertCoord, icônes de point (choisirIcone, getIconUrlForPoint), formats (formatDistance,
// formatSurface, polygonArea[M2], GPS parse/format), fenêtres chartées (window.ktaConfirm, window.ktaAlerte),
// cohérence échelle ↔ géoréf, popups de note (attacherNotePopup) et de point (buildPointPopupHtml), sélecteur
// de niveau d'un objet de session (ktaNiveauxProposes, ktaOptionsNiveauHtml, ktaSignalerNiveauObjet),
// picker « Où es-tu ? », transparence des tuiles (ktaTileExt, ktaDetecterAlpha), rendu des data layers
// (ajouterPointsDepuisJSON) et garde des modes clic-carte (_modeClicCarteActif).
// Dépend de : APP_CONFIG / PLAN_CONFIG, Leaflet (window.map), window.I18n, window.ktaEsc (langManager.js).
// 🩸 Coordonnées : TOUJOURS convertCoord(x, y) = [imageHeight - y, x] ; l'inverse est (lat, lng) → (lng, h - lat).
// 🩸 « Un plan est-il affiché ? » = ktaPlanAffiche() : PLAN_CONFIG n'est pas remis à null au retour HOME.
// 🔒 ktaConfirm insère message/titre en HTML : toute donnée d'utilisateur s'échappe (ktaEsc) chez l'appelant.
// 🔒 Popups de point : aucune donnée dans un gestionnaire inline, actions par data-kta-act (CSP, XSS).
// Garde-fous : scripts/check-popups-natives.js, check-xss.js, check-uid.js · Doc : docs/architecture/ui.md.

function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}

function choisirIcone(p) {
  // tags du point d'abord, puis replis successifs
  if (p.tags && p.tags.length && window._iconMap) {
    for (const tag of p.tags) {
      if (window._iconMap[tag]) return window._iconMap[tag];
    }
  }

  if (window._iconMap && window._iconMap.default) return window._iconMap.default;

  if (window.iconeDefault) return window.iconeDefault;

  console.warn("[choisirIcone] Aucune icône disponible — pin Leaflet natif");
  return new L.Icon.Default();
}

// URL de l'icône d'un point : PLAN_CONFIG.icons[tag] → _iconMap[tag] (built-in, map.js > TAGS_BUILTIN) →
// icons.default → _iconMap.default → null (l'appelant se replie). Pour qui veut une URL, pas un L.icon.
function getIconUrlForPoint(point) {
  const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
  const map       = window._iconMap || {};

  function urlFromMapEntry(entry) {
    if (!entry) return null;
    // ⚠️ scaledMarkers actif : _iconMap[tag] est un L.divIcon sans options.iconUrl ; l'URL vit dans
    // _kta_iconUrl (map.js > creerIcones > _mkIcon).
    if (entry._kta_iconUrl) return entry._kta_iconUrl;
    if (entry.options && entry.options.iconUrl) return entry.options.iconUrl;
    return null;
  }

  if (point && Array.isArray(point.tags)) {
    for (const tag of point.tags) {
      if (planIcons[tag]) return planIcons[tag];
      const u = urlFromMapEntry(map[tag]);
      if (u) return u;
    }
  }

  if (planIcons.default) return planIcons.default;
  return urlFromMapEntry(map.default);
}
window.getIconUrlForPoint = getIconUrlForPoint;

// ── Double-clic sur un marker → zoom ──────────
// 🩸 Pas d'event Leaflet `dblclick` : le `click` de bindPopup le mange, et le tactile ne synthétise que des
// `click`. Détection manuelle : 2 clics sur le même marker en < 400 ms → closePopup + flyTo (zoom +2,
// borné au maxZoom). Horodatage par marker (closure). À appeler après bindPopup/addTo.
function attachMarkerDblClickZoom(marker) {
  if (!marker || typeof marker.on !== "function") return;

  let _lastClickTime = 0;
  const DBL_DELAY_MS = 400;

  marker.on("click", function() {
    const now = Date.now();
    const isDbl = (now - _lastClickTime) < DBL_DELAY_MS;
    _lastClickTime = isDbl ? 0 : now;  // reset après dblclick pour éviter triple-trigger

    if (!isDbl) return;  // 1er clic : Leaflet ouvre le popup normalement
    if (!window.map) return;

    // le 2e clic a pu rouvrir la popup (bindPopup bascule ouvert/fermé)
    try { marker.closePopup && marker.closePopup(); } catch(err) {}

    const ll = marker.getLatLng ? marker.getLatLng() : null;
    if (!ll) return;

    // zoom +2 borné au maxZoom (2)
    const curZ = window.map.getZoom();
    const targetZ = Math.min(
      window.map.getMaxZoom ? window.map.getMaxZoom() : 2,
      curZ + 2
    );

    if (typeof window.map.flyTo === "function") {
      window.map.flyTo(ll, targetZ, { duration: 0.6 });
    } else {
      window.map.setView(ll, targetZ);
    }
  });
}
window.attachMarkerDblClickZoom = attachMarkerDblClickZoom;

// ── Distances ──────────
// ⚠️ Mètres en entrée : < 1000 m → « X.X m » (decimalsM, défaut 1), sinon « X.XX km ». Source unique des
// outils de mesure.
function formatDistance(distM, decimalsM) {
  if (typeof distM !== "number" || isNaN(distM)) return "—";
  if (distM >= 1000) {
    return (distM / 1000).toFixed(2) + " km";
  }
  const dec = (typeof decimalsM === "number") ? decimalsM : 1;
  return distM.toFixed(dec) + " m";
}
window.formatDistance = formatDistance;

// ── Un plan est-il affiché ? (source de vérité unique) ──────────
// 🩸 `PLAN_CONFIG.plan` ne suffit pas : afficherLoader() (retour HOME) ne remet pas PLAN_CONFIG à null, il
// masque #map et pose body.kta-loader-active. Le marqueur fiable est cette classe (posée par afficherLoader,
// retirée par homeLoader) ; PLAN_CONFIG reste en complément pour le boot (classe pas encore posée).
function ktaPlanAffiche() {
  try {
    if (document.body && document.body.classList.contains("kta-loader-active")) return false;
    return !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan);
  } catch(e) {
    return !!(window.PLAN_CONFIG && window.PLAN_CONFIG.plan);
  }
}
window.ktaPlanAffiche = ktaPlanAffiche;

// ── Surfaces ──────────
// ⚠️ m² en entrée : < 10 000 m² → « X m² » (1 décimale sous 100 m²), sinon « X.XX ha ». Jamais de km²
// (décision produit : les surfaces souterraines vont de 100 m² à quelques hectares).
function formatSurface(areaM2, decimalsM2) {
  if (typeof areaM2 !== "number" || isNaN(areaM2) || areaM2 < 0) return "—";
  if (areaM2 >= 10000) {
    return (areaM2 / 10000).toFixed(2) + " ha";
  }
  if (areaM2 < 100) {
    const dec = (typeof decimalsM2 === "number") ? decimalsM2 : 1;
    return areaM2.toFixed(dec) + " m²";
  }
  return Math.round(areaM2) + " m²";
}
window.formatSurface = formatSurface;

// Aire d'un polygone simple en px² (formule des lacets, valeur absolue). ≥ 3 points {x, y}.
// En m² : diviser par scale² (scale en px/m).
function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += (a.x * b.y) - (b.x * a.y);
  }
  return Math.abs(sum) / 2;  // px²
}
window.polygonArea = polygonArea;

// px² → m² via APP_CONFIG.scale (px/m) ; null sans échelle.
function polygonAreaM2(points) {
  const areaPx2 = polygonArea(points);
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) || null;
  if (!scale || scale <= 0) return null;
  return areaPx2 / (scale * scale);  // px² / (px/m)² = m²
}
window.polygonAreaM2 = polygonAreaM2;

// ── GPS : saisie « lat, lng » (copier-coller Google Maps) ──────────
// ⚠️ Rend {lat, lng} ou null. Refusés : pas de virgule, non numérique, hors plage [-90, 90] / [-180, 180].
// Plage stricte : évite de prendre pour du GPS deux nombres quelconques séparés d'une virgule.
function parseGpsCoords(str) {
  if (typeof str !== "string") return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(str);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: lat, lng: lng };
}
window.parseGpsCoords = parseGpsCoords;

// Inverse de parseGpsCoords : "lat, lng" ou "" si l'un n'est pas un nombre fini (pas de « NaN, NaN » sur
// une conf partielle ; une chaîne numérique est refusée).
function formatGpsCoords(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return lat + ", " + lng;
}
window.formatGpsCoords = formatGpsCoords;

// Validation live d'un input « lat, lng ». Idempotent (dataset.gpsComboAttached). Rend { validate(), parse() } :
// validate() pose l'erreur et rend true si vide OU valide ; parse() rend {lat, lng} ou null sans toucher l'UI.
function attacherGpsValidationCombo(input, opts) {
  if (!input) return { validate: function() { return false; }, parse: function() { return null; } };
  opts = opts || {};
  const errorEl = opts.errorEl || null;

  function _setInvalid(msg) {
    input.classList.add("kta-gps-invalid");
    if (errorEl) {
      errorEl.textContent = msg || "Format attendu : 48.6808, 2.1588";
      errorEl.style.display = "";
    }
  }
  function _setValid() {
    input.classList.remove("kta-gps-invalid");
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }
  }
  function _check(showError) {
    const val = String(input.value || "").trim();
    if (val === "") {
      _setValid();
      return { ok: true, empty: true, lat: null, lng: null };
    }
    const parsed = parseGpsCoords(val);
    if (!parsed) {
      if (showError) _setInvalid();
      return { ok: false, empty: false, lat: null, lng: null };
    }
    _setValid();
    return { ok: true, empty: false, lat: parsed.lat, lng: parsed.lng };
  }

  if (input.dataset.gpsComboAttached !== "1") {
    input.dataset.gpsComboAttached = "1";
    // à la saisie, pas d'erreur affichée (seulement au blur ou au submit)
    input.addEventListener("input", function() { _check(false); });
    input.addEventListener("blur",  function() { _check(true); });
  }

  return {
    validate: function() {
      const r = _check(true);
      return r.ok;
    },
    parse: function() {
      const r = _check(false);
      if (!r.ok || r.empty) return null;
      return { lat: r.lat, lng: r.lng };
    }
  };
}
window.attacherGpsValidationCombo = attacherGpsValidationCombo;

// ── Cohérence échelle px/m ↔ géoréférencement ──────────
// Compare APP_CONFIG.scale (pas humain, mesure) et l'échelle déduite du calibrage GPS (KmzExport). Aucune
// correction automatique : les deux sources sont légitimes, on AFFICHE un bandeau (⚙️ Réglages, export KMZ/GPX).
// ⚠️ Rend { hasCalibration: false [, error] } ou { hasCalibration: true, scaleUser, scaleGps, deltaPercent,
// level } avec level ∈ "ok" | "warn" | "alert" | "critical".
function calculerCoherenceEchelleGeoref(planId) {
  const scaleUser = (window.APP_CONFIG && Number.isFinite(window.APP_CONFIG.scale))
                    ? window.APP_CONFIG.scale
                    : null;
  if (!Number.isFinite(scaleUser) || scaleUser <= 0) {
    return { hasCalibration: false };
  }

  if (!window.KmzExport || typeof window.KmzExport.getCalibration !== "function") {
    return { hasCalibration: false };
  }
  const effectivePlanId = planId || window._currentLoadedPlanId || "default";
  const saved = window.KmzExport.getCalibration(effectivePlanId);
  if (!saved || !saved.pointA || !saved.pointB) {
    return { hasCalibration: false };
  }
  const pA = saved.pointA, pB = saved.pointB;
  if (!Number.isFinite(pA.x) || !Number.isFinite(pA.y)
      || !Number.isFinite(pA.lat) || !Number.isFinite(pA.lng)
      || !Number.isFinite(pB.x) || !Number.isFinite(pB.y)
      || !Number.isFinite(pB.lat) || !Number.isFinite(pB.lng)) {
    return { hasCalibration: false };
  }

  let transform;
  try {
    transform = window.KmzExport.buildTransformCalib(saved);   // pointC optionnel propagé (affine)
  } catch(e) {
    return { hasCalibration: false, error: "Calcul transform impossible : " + (e && e.message ? e.message : String(e)) };
  }
  if (!transform || !Number.isFinite(transform.metresParPixel) || transform.metresParPixel <= 0) {
    return { hasCalibration: false, error: "Transform invalide (metresParPixel manquant ou nul)" };
  }

  const scaleGps = 1 / transform.metresParPixel; // px/m
  const deltaPercent = Math.abs(scaleGps - scaleUser) / scaleUser * 100;

  // Seuils serrés (décision produit : ~1 km avec une marge raisonnable suffit) :
  // < 3 % ok · 3-6 % warn · 6-10 % alert · > 10 % critical (> 100 m/km : un des calibrages est faux).
  let level;
  if (deltaPercent < 3)      level = "ok";
  else if (deltaPercent < 6) level = "warn";
  else if (deltaPercent < 10) level = "alert";
  else                        level = "critical";

  return {
    hasCalibration: true,
    scaleUser:      scaleUser,
    scaleGps:       scaleGps,
    deltaPercent:   deltaPercent,
    level:          level
  };
}
window.calculerCoherenceEchelleGeoref = calculerCoherenceEchelleGeoref;

// HTML du bandeau de cohérence ("" si pas de calibrage ou level ok). L'appelant l'insère puis appelle
// attacherBoutonCopierEchelleGps. opts.context = "settings" | "export".
function renderBannerCoherenceEchelle(planId, opts) {
  const r = calculerCoherenceEchelleGeoref(planId);
  if (!r.hasCalibration) return "";
  if (r.level === "ok") return "";

  opts = opts || {};
  const context = opts.context || "settings";

  const userStr = r.scaleUser.toFixed(3);
  const gpsStr  = r.scaleGps.toFixed(3);
  const deltaStr = r.deltaPercent.toFixed(1);

  const t = function(k, p) { return window.I18n ? window.I18n.t(k, p) : k; };

  const niveaux = {
    warn:     { icon: "🟡", titre: t("utils.scaleCoherence.titleWarn"),     cls: "kta-scale-coherence-warn" },
    alert:    { icon: "🔴", titre: t("utils.scaleCoherence.titleAlert"),    cls: "kta-scale-coherence-alert" },
    critical: { icon: "⬛", titre: t("utils.scaleCoherence.titleCritical"), cls: "kta-scale-coherence-critical" }
  };
  const n = niveaux[r.level] || niveaux.warn;

  const intro = (context === "export")
    ? t("utils.scaleCoherence.introExport")
    : t("utils.scaleCoherence.introSettings");

  return '' +
    '<div class="kta-scale-coherence-banner ' + n.cls + '">' +
      '<div class="kta-scale-coherence-titre">' +
        '<span class="kta-scale-coherence-icon">' + n.icon + '</span>' +
        '<strong>' + n.titre + '</strong>' +
        ' · ' +
        '<span class="kta-scale-coherence-delta">+' + deltaStr + t("utils.scaleCoherence.deltaSuffix") + '</span>' +
      '</div>' +
      '<div class="kta-scale-coherence-corps">' +
        '<p>' + intro + '</p>' +
        '<table class="kta-scale-coherence-table">' +
          '<tr>' +
            '<td>' + t("utils.scaleCoherence.rowCalibrated") + '</td>' +
            '<td><code>' + userStr + '</code> px/m</td>' +
          '</tr>' +
          '<tr>' +
            '<td>' + t("utils.scaleCoherence.rowGps") + '</td>' +
            '<td><code>' + gpsStr + '</code> px/m ' +
              '<button class="kta-scale-coherence-copy-btn" data-action="copy-scale-gps" data-value="' + gpsStr + '" type="button" title="' + t("utils.scaleCoherence.copyTitle") + '">' + t("utils.scaleCoherence.copyBtn") + '</button>' +
            '</td>' +
          '</tr>' +
        '</table>' +
        // quelle valeur croire — le géoréf bien fait gagne ; dit en une ligne.
        '<p class="kta-scale-coherence-hint">' + t("utils.scaleCoherence.hintCheck") + '</p>' +
      '</div>' +
    '</div>';
}
window.renderBannerCoherenceEchelle = renderBannerCoherenceEchelle;

// ── Capteurs refusés : rendu commun aux deux modales de réglages (plan et accueil) ──────────
// 🩸 Un capteur indisponible reste AFFICHÉ, désactivé, avec sa raison — jamais masqué : sinon l'utilisateur
// croit que l'option n'existe pas et ne sait pas que c'est son système qui refuse.
window.ktaEstIos = function() {
  try {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) ||
           (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  } catch (e) { return false; }
};

// Appareil tactile = pointeur principal grossier, quelle que soit l'orientation (un téléphone en paysage
// dépasse 768 px ; un PC tactile garde la souris). Consommateur : plancher de dézoom anti-crash (map.js).
window.ktaAppareilTactile = function() {
  try {
    return !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  } catch (e) { return false; }
};

// Capteur refusé : ligne grisée, case décochée, raison affichée. Partagé par la config HOME (homeConfig.js)
// et celle du plan (interfaceConfig.js) : un seul rendu pour les deux modales, deux copies finiraient par diverger.
window.ktaCapteurRefuse = function(row, cb, hintEl, cleRaison) {
  if (!row) return;
  row.style.display = "";
  row.style.opacity = "0.55";
  if (cb) { cb.checked = false; cb.disabled = true; }
  if (hintEl && window.I18n && window.I18n.t) {
    // Nommer iOS quand c'est lui : la personne sait que ni l'appli ni son téléphone ne sont en cause.
    // `cleRaison` : l'appelant nomme une autre cause (« non pris en charge par ce navigateur »).
    hintEl.textContent = window.I18n.t(cleRaison || (window.ktaEstIos()
      ? "config.capteurs.refuseIos" : "config.capteurs.refuse"));
  }
};

// Case d'une fonctionnalité optionnelle sans capteur (Replay, Heatmap), partagée par l'accueil et ⚙️ Réglages
// du plan, même état (APP_CONFIG + app_user_prefs). `prefixe` porte les clés `.toastOn/.toastOff`.
window.ktaBrancherOptionnel = function(cb, cle, prefixe) {
  if (!cb) return;
  cb.checked = !!(window.APP_CONFIG && window.APP_CONFIG[cle] === true);
  cb.addEventListener("change", function () {
    if (!window.APP_CONFIG) window.APP_CONFIG = {};
    window.APP_CONFIG[cle] = !!cb.checked;
    if (typeof window.sauvegarderPrefsUtilisateur === "function") window.sauvegarderPrefsUtilisateur();
    if (window.OOMGuard && typeof window.OOMGuard.showToast === "function" && window.I18n) {
      window.OOMGuard.showToast(window.I18n.t(prefixe + (cb.checked ? ".toastOn" : ".toastOff")), "info");
    }
  });
};

// ── window.ktaConfirm(message, opts) → Promise : fenêtre chartée (remplace confirm()/prompt()) ──────────
// ⚠️ CONTRAT HTML : `message`, `opts.titre`, `opts.okLabel` et `opts.cancelLabel` sont insérés TELS QUELS
// en HTML (innerHTML). Des appelants y passent du balisage voulu (<b>, <br>, classes .kta-tx-*). Toute
// donnée d'utilisateur ou de fichier (nom de plan, de dossier, de fichier, libellé de point…) DOIT être
// échappée par l'appelant (window.ktaEsc) avant d'entrer dans le message. Pour un texte brut à lire,
// préférer window.ktaAlerte (elle échappe). Les champs optionnels ci-dessous, eux, sont posés par le DOM
// (textContent / value) : on peut y mettre une donnée brute.
//   opts.titre / okLabel / cancelLabel : HTML (défauts i18n ui.confirm.*).
//   opts.sansAnnuler : un seul bouton (ktaAlerte) ; le clic sur le fond ne ferme PAS (message à lire).
//   opts.zIndex : appelant ouvert au-dessus de 100002 (éditeur de légende, 100050).
//   opts.caseACocher = {label, coche} · opts.nombre = {label, valeur, min, max} ·
//   opts.texte = {label, valeur, placeholder, maxLength} : la Promise rend un booléen, la saisie est relue
//   dans l'objet passé (coche / valeur) après coup.
//   opts.autre = {label, valeur} : 3e bouton (danger) ; la Promise rend alors `opts.autre.valeur`.
//   opts.choix = {options: [{valeur, titre, aide?}], valeur?} : boutons radio (titre et aide en textContent), le
//   premier coché si `valeur` n'en désigne aucun ; la Promise rend un booléen, le choix est relu dans opts.choix.valeur.
// Fermeture : OK → true · Annuler / Échap / clic sur le fond → false. Fenêtres EMPILÉES : seule celle du
// SOMMET réagit à Échap (pile du module, écouteur unique en capture sur window, qui passe avant les
// écouteurs « Échap » des modales posés sur document). Clic sur le fond ignoré 300 ms après l'ouverture
// (le 2e clic d'un double-clic sur le bouton d'ouverture l'annulerait). z-index 100002. Doc : ui.md.
const _ktaConfirmPile = [];   // fonctions « annuler » des fenêtres ouvertes, la dernière = le sommet
const _KTA_CONFIRM_GARDE_CLIC_MS = 300;
window.addEventListener("keydown", function(e) {
  if (e.key !== "Escape" || !_ktaConfirmPile.length) return;
  e.preventDefault();
  e.stopImmediatePropagation();   // la fenêtre (ou la modale) du dessous ne reçoit pas cet Échap
  _ktaConfirmPile[_ktaConfirmPile.length - 1]();
}, true);

window.ktaConfirm = function(message, opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    const t = function(k, fallback) {
      return (window.I18n && window.I18n.t) ? window.I18n.t(k) : fallback;
    };
    const ov = document.createElement("div");
    ov.className = "kta-readme-modal-overlay";
    // opts.zIndex : sinon un appelant au-dessus de 100002 couvrirait la fenêtre, invisible et inatteignable.
    ov.style.zIndex = String(opts.zIndex || 100002);
    ov.innerHTML = '' +
      '<div class="kta-readme-modal-boite" style="max-width:430px; height:auto; max-height:80vh;">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + (opts.titre || t("ui.confirm.title", "Confirmation")) + '</span>' +
        '</div>' +
        '<div class="kta-readme-modal-corps" style="font-size:13px;">' +
          '<p style="white-space:pre-line; line-height:1.55; margin:0 0 14px; color:var(--kta-texte-2);">' + message + '</p>' +
          (opts.choix ? '<div id="kta-confirm-choix" style="margin:0 0 14px;"></div>' : '') +
          (opts.caseACocher
            ? '<label style="display:flex; gap:8px; align-items:flex-start; margin:0 0 14px; color:var(--kta-texte);' +
                ' line-height:1.45; cursor:pointer;"><input type="checkbox" id="kta-confirm-case"' +
                (opts.caseACocher.coche ? ' checked' : '') + ' style="margin-top:2px;"> <span></span></label>'
            : '') +
          (opts.nombre
            ? '<label style="display:flex; gap:8px; align-items:center; margin:0 0 14px; color:var(--kta-texte);">' +
                '<span></span><input type="number" id="kta-confirm-nombre" inputmode="numeric" style="width:6em;"' +
                ' min="' + (Number.isFinite(opts.nombre.min) ? opts.nombre.min : 0) + '"' +
                (Number.isFinite(opts.nombre.max) ? ' max="' + opts.nombre.max + '"' : '') +
                ' value="' + (Number.isFinite(opts.nombre.valeur) ? opts.nombre.valeur : '') + '"></label>'
            : '') +
          // Label, valeur et placeholder posés par le DOM, jamais concaténés au HTML.
          (opts.texte
            ? '<label style="display:flex; flex-direction:column; gap:6px; margin:0 0 14px; color:var(--kta-texte);">' +
                '<span></span><input type="text" id="kta-confirm-texte" style="width:100%; box-sizing:border-box;">' +
              '</label>'
            : '') +
          '<div class="kta-conv-actions">' +
            // opts.autre : rend opts.autre.valeur, jamais un booléen (pas de confusion avec OK / Annuler).
            (opts.autre
              ? '<button class="kta-btn kta-btn-danger" id="kta-confirm-autre"></button>'
              : '') +
            (opts.sansAnnuler ? '' :
              '<button class="kta-btn kta-btn-ghost"   id="kta-confirm-non">' + (opts.cancelLabel || t("ui.confirm.cancel", "Annuler")) + '</button>') +
            '<button class="kta-btn kta-btn-primary" id="kta-confirm-oui">' + (opts.okLabel || t("ui.confirm.ok", "OK")) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.documentElement.appendChild(ov);
    // La Promise rend TOUJOURS un booléen : l'état de la case est relu dans opts.caseACocher.coche.
    // Libellé en textContent (il peut porter un nom de fichier).
    const caseEl = ov.querySelector("#kta-confirm-case");
    if (caseEl) caseEl.nextElementSibling.textContent = opts.caseACocher.label || "";
    const nombreEl = ov.querySelector("#kta-confirm-nombre");
    if (nombreEl) nombreEl.previousElementSibling.textContent = opts.nombre.label || "";
    const choixEl = ov.querySelector("#kta-confirm-choix");
    if (choixEl) {
      const liste = Array.isArray(opts.choix.options) ? opts.choix.options.filter(Boolean) : [];
      const coche = liste.some(function(o) { return o.valeur === opts.choix.valeur; }) ? opts.choix.valeur
        : (liste[0] && liste[0].valeur);
      liste.forEach(function(o) {
        const lab = document.createElement("label");
        lab.style.cssText = "display:flex; gap:8px; align-items:flex-start; margin:8px 0 0; cursor:pointer;" +
          " line-height:1.45; color:var(--kta-texte);";
        const r = document.createElement("input");
        r.type = "radio";
        r.name = "kta-confirm-choix";
        r.value = String(o.valeur);
        r.setAttribute("data-kta-confirm-choix", String(o.valeur));
        r.checked = o.valeur === coche;
        r.style.marginTop = "3px";
        const txt = document.createElement("span");
        const titre = document.createElement("strong");
        titre.textContent = o.titre || "";
        txt.appendChild(titre);
        if (o.aide) {
          const aide = document.createElement("span");
          aide.style.cssText = "display:block; color:var(--kta-texte-3);";
          aide.textContent = o.aide;
          txt.appendChild(aide);
        }
        lab.appendChild(r);
        lab.appendChild(txt);
        choixEl.appendChild(lab);
      });
    }
    const texteEl = ov.querySelector("#kta-confirm-texte");
    if (texteEl) {
      texteEl.previousElementSibling.textContent = opts.texte.label || "";
      texteEl.value = opts.texte.valeur == null ? "" : String(opts.texte.valeur);
      if (opts.texte.placeholder) texteEl.placeholder = String(opts.texte.placeholder);
      if (Number.isFinite(opts.texte.maxLength)) texteEl.maxLength = opts.texte.maxLength;
    }
    let resolu = false;
    const finir = function(val) {
      if (resolu) return;
      resolu = true;
      if (caseEl) opts.caseACocher.coche = !!(val && caseEl.checked);
      if (nombreEl && val) {
        const n = parseInt(nombreEl.value, 10);
        opts.nombre.valeur = Number.isFinite(n) ? n : null;
      }
      if (texteEl && val) opts.texte.valeur = texteEl.value;
      if (choixEl && val) {
        const r = choixEl.querySelector('input[name="kta-confirm-choix"]:checked');
        const o = r ? opts.choix.options.find(function(x) { return x && String(x.valeur) === r.value; }) : null;
        opts.choix.valeur = o ? o.valeur : null;
      }
      const i = _ktaConfirmPile.indexOf(annuler);
      if (i >= 0) _ktaConfirmPile.splice(i, 1);
      ov.remove();
      resolve(val);
    };
    // Échap n'agit que sur la fenêtre du sommet, sinon celle du dessous se fermerait aussi.
    const annuler = function() { finir(false); };
    _ktaConfirmPile.push(annuler);
    const ouvertA = Date.now();
    ov.querySelector("#kta-confirm-oui").addEventListener("click", function() { finir(true); });
    const nonEl = ov.querySelector("#kta-confirm-non");
    if (nonEl) nonEl.addEventListener("click", function() { finir(false); });
    const autreEl = ov.querySelector("#kta-confirm-autre");
    if (autreEl) {
      autreEl.textContent = opts.autre.label || "";
      autreEl.addEventListener("click", function() { finir(opts.autre.valeur); });
    }
    // Clic sur le fond = annuler, sauf fenêtre à un seul bouton (message à lire) et pendant la garde de 300 ms.
    ov.addEventListener("click", function(e) {
      if (e.target !== ov || opts.sansAnnuler) return;
      if (Date.now() - ouvertA < _KTA_CONFIRM_GARDE_CLIC_MS) return;
      finir(false);
    });
    // focus sur OK (ou le champ) : Entrée valide
    if (nombreEl) nombreEl.addEventListener("keydown", function(e) { if (e.key === "Enter") finir(true); });
    if (texteEl) texteEl.addEventListener("keydown", function(e) { if (e.key === "Enter") finir(true); });
    setTimeout(function() {
      try { (texteEl || nombreEl || ov.querySelector("#kta-confirm-oui")).focus(); } catch(e) {}
    }, 30);
  });
};

// window.ktaAlerte(message, opts) → Promise (résolue à la fermeture) : ktaConfirm à un seul bouton, remplace
// alert() (hors charte, bloquable par iOS en PWA, fige l'app). Message à LIRE POUR AGIR → ktaAlerte ; message
// qui CONFIRME → toast (OOMGuard.showToast). Le message est du TEXTE échappé (il porte souvent un nom de
// fichier) ; opts.html = true pour un message déjà sûr. DOM indisponible : repli sur alert() natif, un
// message critique n'est jamais perdu (scripts/check-popups-natives.js compte les popups natives).
window.ktaAlerte = function(message, opts) {
  opts = opts || {};
  const texte = message == null ? "" : String(message);
  try {
    if (!document.documentElement || typeof window.ktaConfirm !== "function") throw new Error("interface indisponible");
    const esc = window.ktaEsc;
    const t = function(k, repli) { return (window.I18n && window.I18n.t) ? window.I18n.t(k) : repli; };
    return window.ktaConfirm(opts.html ? texte : esc(texte), {
      sansAnnuler: true,
      zIndex: opts.zIndex,
      titre: opts.titre ? esc(String(opts.titre)) : t(opts.type === "erreur" ? "ui.alerte.titreErreur" : "ui.alerte.titre",
        opts.type === "erreur" ? "Erreur" : "Information"),
      okLabel: opts.okLabel || t("ui.confirm.ok", "OK")
    }).then(function() { return undefined; });
  } catch (e) {
    window.alert(texte);   // popup-native-ok : repli quand l'interface ne peut pas s'afficher
    return Promise.resolve();
  }
};

// Branche les boutons « 📋 Copier » du bandeau de cohérence. Idempotent ; à appeler après insertion du HTML.
function attacherBoutonCopierEchelleGps(container) {
  if (!container || !container.querySelectorAll) return;
  const btns = container.querySelectorAll('[data-action="copy-scale-gps"]');
  btns.forEach(function(btn) {
    if (btn.dataset.scaleGpsBound === "1") return;
    btn.dataset.scaleGpsBound = "1";
    btn.addEventListener("click", function() {
      const val = btn.getAttribute("data-value") || "";
      if (!val) return;
      const txt = btn.textContent;
      const apply = function() {
        btn.textContent = window.I18n.t("utils.copied");
        setTimeout(function() { btn.textContent = txt; }, 1500);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(val).then(apply, function() {
            // repli execCommand si writeText est refusé (contexte non sécurisé)
            const ta = document.createElement("textarea");
            ta.value = val;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); } catch(e) {}
            document.body.removeChild(ta);
            apply();
          });
        } else {
          const ta = document.createElement("textarea");
          ta.value = val;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); } catch(e) {}
          document.body.removeChild(ta);
          apply();
        }
      } catch(e) {
        console.warn("[ScaleCoherence] copy échec :", e);
      }
    });
  });
}
window.attacherBoutonCopierEchelleGps = attacherBoutonCopierEchelleGps;

// ── Popups de note (zones / tracés / structures) : window.attacherNotePopup, plus bas ──────────
// ⚠️ attacherNotePopup(layer, getDescr, setDescr, titreType, opts) ; opts.mode = "edit" (défaut) | "readonly".
// edit (session) : textarea + 💾, s'ouvre même note vide ; le save déclenche HistoryManager + SessionPersist.
// readonly (data layer) : texte seul, setDescr peut être null. À ne binder QUE si une note existe (c'est à
// l'appelant de tester `description`), sinon un clic sur un data layer muet ouvrirait une popup vide.
// Mêmes classes que les popups de point (.kta-popup-point) : thème clair/sombre hérité.
//
// 🩸 Pendant un mode tracé / zone / structure, les ghost polylines (épaisses, transparentes,
// bubblingMouseEvents: false) mangeraient les clics du tracé. Les rendus (renderRoads, renderStructures,
// ajouterPointsDepuisJSON) n'installent ghosts et popups que si AUCUN mode d'édition n'est actif ; chaque
// bascule de mode relance le rendu. L'objet EN COURS de tracé n'a jamais de popup (note après validation).
window._aucunModeEditionActif = function() {
  return !window.modeRoad && !window.modeZone && !window.modeStructure;
};

// true si un mode « clic carte » consommateur de clics est actif : dessin, mesure, recalage tracker, et tous
// les pickers de position (floater commun `.kta-iti-floater`). Lu par le garde `popupopen` (map.js) : le clic
// va au mode actif, pas à une popup d'annotation.
// ⚠️ window.modeEdition (ajout de point) est EXCLU : il ouvre une popup de nommage légitime.
window._modeClicCarteActif = function() {
  if (window.modeRoad || window.modeZone || window.modeStructure) return true;
  if (window.modeMesure || window.modeRecalage) return true;
  try {
    if (document.querySelector(".kta-iti-floater")) return true;
    // mode « clic carte » du Mode perdu
    if (document.body && document.body.classList.contains("kta-lost-click-mode")) return true;
    // sélection de la position de légende de l'export externe
    if (document.getElementById("kta-export-pick-banner")) return true;
    // le tracé de polygone du Mode Secours gère déjà son stopPropagation + overlay plein écran
  } catch(_) {}
  return false;
};

// ── « Où es-tu ? » : picker de position partagé (Sortie d'urgence, « Y aller ») ──────────
// Appelé seulement quand la position du tracker n'a jamais été confirmée (tracking.js >
// getTrackingPositionEtat). Un tap RECALE le tracker comme « 📍 Je suis ici » (hooks itinéraire / portail
// notifiés), puis rend la position à l'appelant.
// 🩸 Le floater porte `.kta-iti-floater` : _modeClicCarteActif() le reconnaît, aucune popup ne mange le tap,
// et map.js le ré-émet en capture — même sur un marqueur, le cas nominal (on vise un repère connu).
// 🩸 Les autres modes clic-carte tombent AVANT d'armer, sinon le même tap pose un sommet ou ouvre une fiche.
let _posPickHandler = null;
function _posPickOnKey(e) { if (e && e.key === "Escape") _posPickAnnuler(); }
function _posPickAnnuler() {
  if (window.map && _posPickHandler) { try { window.map.off("click", _posPickHandler); } catch(e) {} }
  _posPickHandler = null;
  const fl = document.getElementById("kta-pos-floater");
  if (fl) fl.remove();
  document.removeEventListener("keydown", _posPickOnKey);
}
window.ktaDemanderPositionCarte = function(onPick, opts) {
  opts = opts || {};
  if (!window.map || typeof onPick !== "function") return false;
  _posPickAnnuler();
  if (typeof window._desactiverTousLesModes === "function") {
    try { window._desactiverTousLesModes(); } catch(e) {}
  }
  window.modeEdition   = false;
  window.modeMesure    = false;
  window.modeRecalage  = false;
  window.modeRoad      = false;
  window.modeZone      = false;
  window.modeStructure = false;
  try { window.map.closePopup(); } catch(e) {}

  _posPickHandler = function(e) {
    if (!e || !e.latlng) return;
    // inverse de convertCoord(x, y) = [imageHeight - y, x]
    const x = e.latlng.lng;
    const y = (window.APP_CONFIG && window.APP_CONFIG.imageHeight)
                ? (window.APP_CONFIG.imageHeight - e.latlng.lat)
                : e.latlng.lat;
    _posPickAnnuler();
    if (opts.recaler !== false && typeof window.recalerTrackerSurPoint === "function") {
      try { window.recalerTrackerSurPoint(x, y); }
      catch(err) { console.warn("[Utils] picker position : recalage échoué :", err); }
    }
    try { onPick({ x: x, y: y }); }
    catch(err) { console.warn("[Utils] picker position : onPick échoué :", err); }
  };
  window.map.on("click", _posPickHandler);

  const fl = document.createElement("div");
  fl.id = "kta-pos-floater";
  fl.className = "kta-iti-floater kta-pos-floater";
  fl.innerHTML =
    '<span class="kta-iti-floater-icon"></span>' +
    '<span class="kta-iti-floater-msg"></span>' +
    '<button class="kta-btn kta-btn-ghost" id="kta-pos-cancel" type="button"></button>';
  fl.querySelector(".kta-iti-floater-icon").textContent = opts.icone || "📍";
  fl.querySelector(".kta-iti-floater-msg").textContent =
    opts.texte || window.I18n.t("pospick.floater");
  const btnAnn = fl.querySelector("#kta-pos-cancel");
  btnAnn.textContent = window.I18n.t("pospick.annuler");
  btnAnn.addEventListener("click", function() {
    _posPickAnnuler();
    if (typeof opts.onCancel === "function") { try { opts.onCancel(); } catch(e) {} }
  });
  document.body.appendChild(fl);
  document.addEventListener("keydown", _posPickOnKey);
  return true;
};
window.ktaDemanderPositionCarte.annuler = _posPickAnnuler;
window.ktaDemanderPositionCarte.estActif = function() { return !!_posPickHandler; };

// Ghosts installés sur le DATA LAYER (KMZ en lecture seule) : rendu une seule fois à l'import, il ne se
// re-rend pas comme renderRoads ; on garde chaque ghost et son parent pour le détacher / rattacher.
window._kta_dataLayerNoteGhosts = window._kta_dataLayerNoteGhosts || [];

// Détache (mode actif) ou rattache (aucun mode) les ghosts du data layer. Appelé par les toggles de mode.
window._kta_syncDataLayerNoteGhosts = function() {
  const aucunMode = window._aucunModeEditionActif();
  window._kta_dataLayerNoteGhosts.forEach(function(entry) {
    if (!entry || !entry.ghost || !entry.parent) return;
    try {
      if (aucunMode) {
        // addTo() est idempotent
        entry.ghost.addTo(entry.parent);
      } else {
        entry.ghost.remove();
      }
    } catch(e) { /* layer parent détaché entre-temps → ignore */ }
  });
};

// Purge avant un nouveau data layer (pas de références mortes au changement de plan).
window._kta_resetDataLayerNoteGhosts = function() {
  window._kta_dataLayerNoteGhosts = [];
};

// Re-rend tracés, zones, structures et ghosts du data layer à chaque bascule de mode d'édition.
window._kta_syncAllNoteUiForModeChange = function() {
  try { if (typeof window.renderRoads === "function") window.renderRoads(); } catch(e) {}
  try { if (typeof window.renderZones === "function") window.renderZones(); } catch(e) {}
  try { if (typeof window.renderStructures === "function") window.renderStructures(); } catch(e) {}
  if (typeof window._kta_syncDataLayerNoteGhosts === "function") {
    window._kta_syncDataLayerNoteGhosts();
  }
};

// ── Niveau d'un objet de session (fiche d'un tracé / zone / structure, formulaire d'un POI) ──────────
// ⚠️ ktaNiveauxProposes(actuel) → niveaux triés de availableLevels + `actuel`, ou null hors multi-niveau ET pendant
// un dessin (modeRoad / modeZone / modeStructure) : pas de liste dans ces deux cas (décision produit).
// 🩸 `actuel` est toujours dans la liste, même hors availableLevels : sinon le <select> afficherait un autre niveau
// que celui de l'objet et le moindre « change » le déplacerait en silence.
window.ktaNiveauxProposes = function(actuel) {
  const c = window.APP_CONFIG;
  if (!c || c.multiLevel !== true) return null;
  if (typeof window._aucunModeEditionActif === "function" && !window._aucunModeEditionActif()) return null;
  const lvl = Number.isInteger(actuel) ? actuel : 0;
  const base = (Array.isArray(c.availableLevels) && c.availableLevels.length) ? c.availableLevels : [0];
  const vus = {};
  const out = [];
  base.concat([lvl]).forEach(function(n) {
    if (!Number.isInteger(n) || vus[n]) return;
    vus[n] = true;
    out.push(n);
  });
  return out.sort(function(a, b) { return a - b; });
};

// Libellé signé d'un niveau (« -1 », « 0 », « +2 »), comme la fenêtre « Convertir ».
window.ktaFormatNiveau = function(n) {
  return (Number.isInteger(n) && n > 0) ? "+" + n : String(Number.isInteger(n) ? n : 0);
};

// <option> du sélecteur de niveau, `actuel` sélectionné ; "" si pas de liste (cf ktaNiveauxProposes).
window.ktaOptionsNiveauHtml = function(actuel) {
  const niveaux = window.ktaNiveauxProposes(actuel);
  if (!niveaux) return "";
  const lvl = Number.isInteger(actuel) ? actuel : 0;
  return niveaux.map(function(n) {
    return '<option value="' + n + '"' + (n === lvl ? " selected" : "") + '>' +
             window.ktaEsc(window.I18n.t("niveauObjet.option", { n: window.ktaFormatNiveau(n) })) +
           '</option>';
  }).join("");
};

// Toast après un changement de niveau. La vue ne bascule PAS sur le niveau cible (décision produit) : si le filtre
// le masque, l'objet disparaît de la carte, d'où un toast « warn » (toujours montré) plutôt qu'« info ».
window.ktaSignalerNiveauObjet = function(n) {
  if (!window.OOMGuard || typeof window.OOMGuard.showToast !== "function") return;
  const c = window.APP_CONFIG || {};
  const visibles = Array.isArray(c.visibleLevels) ? c.visibleLevels : [0];
  const masque = visibles.indexOf(n) < 0;
  window.OOMGuard.showToast(
    window.I18n.t(masque ? "niveauObjet.toastMasque" : "niveauObjet.toastDeplace",
      { n: window.ktaFormatNiveau(n) }),
    masque ? "warn" : "info");
};

window.attacherNotePopup = function(layer, getDescr, setDescr, titreType, opts) {
  if (!layer || typeof layer.bindPopup !== "function") return;
  opts = opts || {};
  const _modeDemande = (opts.mode === "readonly") ? "readonly" : "edit";
  // 🔒 Plan en lecture seule (installation reliée, droit « lire ») : la fiche d'un tracé / zone /
  // structure s'affiche en lecture (ni note modifiable, ni Convertir, ni 🗑️). Réévalué à chaque ouverture.
  let mode = _modeDemande;
  const _majMode = function() {
    mode = (_modeDemande === "edit" && typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee(true)) ? "readonly" : _modeDemande;
  };
  _majMode();

  function _esc(s) { return window.ktaEsc(s); }

  // Ligne « Niveau » sous 🔄 Convertir : objet de session seulement (`opts.convertir`), ni jonction (fromLevel /
  // toLevel, hors de cette liste) ni itinéraire ; "" hors multi-niveau ou pendant un dessin (ktaNiveauxProposes).
  function _niveauHtml() {
    const o = opts.convertir && opts.convertir.obj;
    if (!o || o.type === "jonction" || o.type === "itinerary") return "";
    if (typeof window.ktaOptionsNiveauHtml !== "function") return "";
    const options = window.ktaOptionsNiveauHtml(Number.isInteger(o.level) ? o.level : 0);
    if (!options) return "";
    return '<label class="kta-note-popup-niveau-ligne">' +
             '<span>' + _esc(window.I18n.t("niveauObjet.label")) + '</span>' +
             '<select class="kta-note-popup-niveau">' + options + '</select>' +
           '</label>';
  }

  function _renderPopupHtml() {
    const current = getDescr() || "";
    if (mode === "readonly") {
      // pas de textarea ; message explicite si pas de note (l'appelant filtre normalement en amont)
      const corps = current
        ? '<div class="kta-note-popup-readonly-text">' + _esc(current) + '</div>'
        : '<div class="kta-note-popup-readonly-empty"><em>' + _esc(window.I18n.t("utils.note.empty")) + '</em></div>';
      const _uidLu = opts.convertir && opts.convertir.obj && opts.convertir.obj.uid;   // « créé par », historique
      return '<div class="kta-popup-point kta-note-popup kta-note-popup-readonly-mode"' +
               (_uidLu ? ' data-kta-uid="' + _esc(_uidLu).replace(/"/g, "&quot;") + '"' : "") + '>' +
               '<b>' + _esc(titreType) + '</b>' +
               '<div class="kta-note-popup-readonly-label">📖 Note (lecture seule)</div>' +
               corps +
             '</div>';
    }
    const _uid = opts.convertir && opts.convertir.obj && opts.convertir.obj.uid;
    return '<div class="kta-popup-point kta-note-popup"' + (_uid ? ' data-kta-uid="' + _esc(_uid).replace(/"/g, "&quot;") + '"' : "") + '>' +
             '<b>' + _esc(titreType) + '</b>' +
             '<div class="kta-note-popup-wrap">' +
               '<textarea class="kta-note-popup-textarea" rows="4" ' +
                 'placeholder="' + _esc(window.I18n ? window.I18n.t("utils.note.placeholder") : "Note libre (multilignes possibles)…") + '">' +
                 _esc(current) +
               '</textarea>' +
               '<div class="kta-popup-actions kta-note-popup-actions">' +
                 '<button class="kta-popup-btn kta-popup-btn-aller kta-note-popup-save" type="button">' +
                   _esc(window.I18n ? window.I18n.t("utils.note.save") : "💾 Sauver la note") +
                 '</button>' +
                 // Reclasser l'objet : un vecteur SIG mal rangé (un front qui est une galerie) n'entre pas dans le graphe
                 // d'itinéraire, le Pathfinder ne lit que les tracés. La popup tient une référence directe sur l'objet.
                 (opts.convertir
                   ? '<button class="kta-popup-btn kta-note-popup-convertir" type="button">' +
                       '🔄 ' + window.I18n.t("convert.btn") +
                     '</button>'
                   : '') +
               '</div>' +
               _niveauHtml() +
               // Supprimer : ligne séparée, classe danger (comme la popup d'un point, une action destructrice ne se
               // pose pas à côté de « Sauver »). `opts.convertir` = { famille, obj } sert aux DEUX boutons.
               (opts.convertir
                 ? '<div class="kta-popup-actions kta-popup-actions-danger kta-note-popup-actions">' +
                     '<button class="kta-popup-btn kta-popup-btn-delete kta-note-popup-supprimer" type="button">' +
                       '🗑️ ' + window.I18n.t("convert.btnSuppr") +
                     '</button>' +
                   '</div>'
                 : '') +
               '<div class="kta-note-popup-status" style="display:none;"></div>' +
             '</div>' +
           '</div>';
  }

  layer.bindPopup(_renderPopupHtml(), window.KTA_POPUP_OPTS || { autoPan: true, closeButton: true });

  // popupopen : Leaflet le déclenche après l'injection DOM ; on rebranche le save à chaque ouverture.
  layer.on("popupopen", function(evt) {
    _majMode();
    // contenu re-rendu : la note a pu changer (undo/redo)
    const fresh = _renderPopupHtml();
    if (evt && evt.popup) evt.popup.setContent(fresh);
    if (mode === "readonly") return;
    setTimeout(function() {
      // 🩸 Cherché DANS la popup ouverte, jamais dans tout le document : la popup qu'on vient de quitter reste dans le
      // DOM le temps de son fondu (~200 ms) et passe AVANT dans l'ordre du document ; ses boutons recevraient les
      // écouteurs et ceux de la nouvelle fiche resteraient morts (clic d'un objet à l'autre).
      const racine = (evt && evt.popup && typeof evt.popup.getElement === "function" && evt.popup.getElement())
        || document;
      const popupRoot = racine.querySelector(".leaflet-popup-content .kta-note-popup");
      if (!popupRoot) return;
      const textarea = popupRoot.querySelector(".kta-note-popup-textarea");
      const saveBtn  = popupRoot.querySelector(".kta-note-popup-save");
      const convBtn  = popupRoot.querySelector(".kta-note-popup-convertir");
      if (convBtn && opts.convertir && window.KtaConvertir) {
        convBtn.addEventListener("click", function () {
          window.KtaConvertir.ouvrir(opts.convertir.famille, opts.convertir.obj);
        });
      }
      // 🗑️ Pas de confirmation (comme pour un point, Ctrl+Z rattrape) ; le toast le RAPPELLE.
      const supprBtn = popupRoot.querySelector(".kta-note-popup-supprimer");
      if (supprBtn && opts.convertir && window.KtaConvertir && window.KtaConvertir.supprimer) {
        supprBtn.addEventListener("click", function () {
          const ok = window.KtaConvertir.supprimer(opts.convertir.famille, opts.convertir.obj);
          // 🩸 Fermer la popup AVANT le rendu : le setteur re-rend toute la famille, le layer porteur est détruit
          // et une popup accrochée à un layer mort reste à l'écran.
          try { if (layer && layer.closePopup) layer.closePopup(); } catch(e) {}
          if (ok && window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
            window.OOMGuard.showToast(window.I18n.t("convert.toastSuppr"), "info");
          }
        });
      }
      // Niveau : appliqué au choix, comme un bouton de Convertir. 🩸 Popup fermée AVANT le setteur : il re-rend la
      // famille, le layer porteur est détruit et une popup accrochée à un layer mort resterait à l'écran.
      const nivSel = popupRoot.querySelector(".kta-note-popup-niveau");
      if (nivSel && opts.convertir && window.KtaConvertir && window.KtaConvertir.changerNiveau) {
        nivSel.addEventListener("change", function () {
          const n = Number.parseInt(nivSel.value, 10);
          try { if (layer && layer.closePopup) layer.closePopup(); } catch(e) {}
          if (window.KtaConvertir.changerNiveau(opts.convertir.famille, opts.convertir.obj, n)
              && typeof window.ktaSignalerNiveauObjet === "function") {
            window.ktaSignalerNiveauObjet(n);
          }
        });
      }
      const statusEl = popupRoot.querySelector(".kta-note-popup-status");
      if (!textarea || !saveBtn) return;

      saveBtn.addEventListener("click", function() {
        const newDescr = textarea.value.trim();
        const _historyBefore = (window.HistoryManager && window.HistoryManager.captureState)
          ? window.HistoryManager.captureState() : null;
        try {
          setDescr(newDescr || undefined);
          if (statusEl) {
            statusEl.style.display = "block";
            statusEl.textContent = window.I18n.t("utils.noteSaved");
            statusEl.style.color = "#6ce28a";
          }
          if (window.HistoryManager && _historyBefore && window.HistoryManager.record) {
            window.HistoryManager.record(
              window.I18n.t("history.action.note", { type: titreType }),
              _historyBefore
            );
          }
          // sauvegarde immédiate (sinon attente du polling de 1,5 s)
          if (window.SessionPersist && window.SessionPersist.save) {
            window.SessionPersist.save();
          }
          setTimeout(function() {
            if (layer && layer.closePopup) layer.closePopup();
          }, 800);
        } catch(e) {
          if (statusEl) {
            statusEl.style.display = "block";
            statusEl.textContent = window.I18n.t("utils.popup.errorPrefix") + (e.message || e);
            statusEl.style.color = "#ff8080";
          }
        }
      });
    }, 0);
  });
};

// ── Popup d'un point (éditeur + data layer) : buildPointPopupHtml, plus bas ──────────
// GPS d'un point du plan si le plan a un calibrage utilisable, sinon null (pas de ligne GPS). Transform
// recalculée à chaque appel : O(1), acceptable même avec des centaines de popups.
function _planXyToGps(x, y) {
  try {
    if (!window.KmzExport) return null;
    const planId = window._currentLoadedPlanId || "default";
    const calib = (typeof window.KmzExport.getCalibration === "function")
                  ? window.KmzExport.getCalibration(planId) : null;
    if (!calib || !calib.pointA || !calib.pointB) return null;
    const A = calib.pointA, B = calib.pointB;
    if (typeof A.x !== "number" || typeof A.y !== "number"
        || typeof B.x !== "number" || typeof B.y !== "number"
        || typeof A.lat !== "number" || typeof A.lng !== "number"
        || typeof B.lat !== "number" || typeof B.lng !== "number") return null;
    if (typeof window.KmzExport.buildTransformCalib !== "function") return null;
    if (typeof window.KmzExport.planToGps !== "function") return null;
    const t = window.KmzExport.buildTransformCalib(calib);   // pointC optionnel propagé (affine)
    return window.KmzExport.planToGps(t, x, y);
  } catch(e) {
    return null;  // calibrage dégénéré (2 points identiques…)
  }
}

// {lat, lng} → « 48.85661° N, 2.35222° E ». 5 décimales ≈ 1 m : pas plus, le calibrage 2 points a
// quelques mètres d'incertitude.
function _formatGps(ll) {
  if (!ll || typeof ll.lat !== "number" || typeof ll.lng !== "number") return "";
  const latStr = Math.abs(ll.lat).toFixed(5) + "° " + (ll.lat >= 0 ? "N" : "S");
  const lngStr = Math.abs(ll.lng).toFixed(5) + "° " + (ll.lng >= 0 ? "E" : "W");
  return latStr + ", " + lngStr;
}

// Copie dans le presse-papier (bouton 📋 de la popup).
window.kta_copierGps = function(txt) {
  if (!txt) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function() {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("utils.copiedPrefix", { txt: txt }), "info");
      }
    }).catch(function() {});
  } else {
    // repli textarea + execCommand hors contexte sécurisé
    try {
      const ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast(window.I18n.t("utils.copiedPrefix", { txt: txt }), "info");
      }
    } catch(e) {}
  }
};

// window.ktaEsc (échappement HTML unique) vit dans langManager.js, chargé 2e : les modules non différés
// s'exécutent avant ce fichier (defer) et s'en servent aussi.

// ── Transparence des plans (tuilage V2 générateur + V1 runtime) ──────────
// Une source PNG/WebP à alpha n'est pas aplatie : les tuiles gardent l'alpha, le fond (ou l'OSM) transparaît.
// Extension des tuiles V2 d'après `tiling.format` ; "jpeg" / absent / inconnu → "jpg" (anciens plans).
window.ktaTileExt = function(tilingManifest) {
  const f = tilingManifest && tilingManifest.format;
  if (f === "png")  return "png";
  if (f === "webp") return "webp";
  return "jpg";
};

// Meilleur format AVEC alpha encodable ici : WebP si canvas.toBlob sait l'encoder, sinon PNG (Safari
// rend un PNG ou null pour "image/webp"). Mémoïsé (window._ktaAlphaFmt).
window.ktaProbeAlphaTileFormat = function() {
  if (window._ktaAlphaFmt) return Promise.resolve(window._ktaAlphaFmt);
  return new Promise(function(resolve) {
    const done = function(fmt) { window._ktaAlphaFmt = fmt; resolve(fmt); };
    try {
      const c = document.createElement("canvas");
      c.width = 2; c.height = 2;
      c.toBlob(function(b) {
        done((b && b.type === "image/webp")
          ? { mime: "image/webp", ext: "webp", name: "webp" }
          : { mime: "image/png",  ext: "png",  name: "png"  });
      }, "image/webp", 0.9);
    } catch(e) {
      done({ mime: "image/png", ext: "png", name: "png" });
    }
  });
};

// Alpha réel d'une image ou d'un canvas. Un JPEG n'en porte jamais (mimeHint). Sinon scan échantillonné
// (≤ 256 px, pas de 4 px) : un pixel a < 250 suffit (pas 255 : l'anti-aliasing d'un export opaque laisse 254).
// Échec de lecture (CORS, OOM) → false (opaque).
window.ktaDetecterAlpha = function(source, mimeHint) {
  if (mimeHint && /jpe?g/i.test(String(mimeHint))) return false;
  try {
    const srcW = source.naturalWidth  || source.width  || 0;
    const srcH = source.naturalHeight || source.height || 0;
    if (!srcW || !srcH) return false;
    const scale = Math.min(1, 256 / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(source, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    c.width = 0; c.height = 0;
    for (let i = 3; i < data.length; i += 16) {   // stride 4 pixels
      if (data[i] < 250) return true;
    }
    return false;
  } catch(e) {
    console.warn("[Utils] ktaDetecterAlpha : lecture pixels impossible, fallback opaque —", e && e.message);
    return false;
  }
};

function buildPointPopupHtml(point, isEditorSession, layerInfo) {
  const nom  = String(point.nom || "(sans nom)");
  const desc = String(point.description || "");
  const safeName = window.ktaEsc(nom);
  const safeDesc = window.ktaEsc(desc);
  const id     = String(point.id || "");
  const x = Number(point.x) || 0;
  const y = Number(point.y) || 0;
  // 🔒 Aucune donnée du point dans un gestionnaire inline (un « " » dans le nom sortirait de l'attribut).
  // Chaque bouton porte data-kta-act + des data-* échappés ; un seul écouteur (_ktaPopupAction) agit.
  const _act = function(action) {
    return 'data-kta-act="' + action + '" data-kta-id="' + _escAttr(id) + '" data-kta-x="' + x + '" data-kta-y="' + y + '" ';
  };
  // Favori : layerInfo vient de l'appelant (editor.js → "editor", ajouterPointsDepuisJSON → id du data layer) ;
  // à défaut, déduit de isEditorSession.
  const _layerId    = (layerInfo && layerInfo.layerId)    || (isEditorSession ? "editor" : "data");
  const _layerLabel = (layerInfo && layerInfo.layerLabel) || (isEditorSession ? "Mes ajouts" : "");
  const _firstTag   = (Array.isArray(point.tags) && point.tags[0]) || "default";
  function _escAttr(s) { return window.ktaEsc(s); }
  const isFav = !!(window.Favoris && window.Favoris.isFav(point.id, point.uid));

  // Actions de session (✏️ Modifier, ligne séparée 🗑️ Supprimer) seulement si isEditorSession === true,
  // passé par l'appelant (editor.js → true, ajouterPointsDepuisJSON → false).
  // 🩸 Pas de test sur point.source === "editor" : un point converti session → data garde ce champ, le bouton
  // s'afficherait et supprimerPointEditor ne trouverait rien (échec muet).
  const showSessionActions = isEditorSession === true &&
    !(typeof window.ktaEditionRefusee === "function" && window.ktaEditionRefusee(true));   // droit « lire » : ni ✏️ ni 🗑️
  const editRow = showSessionActions
    ? '<div class="kta-popup-actions">' +
        '<button class="kta-popup-btn kta-popup-btn-edit" type="button" ' + _act("modifier") +
          'title="' + window.I18n.t("poi.editPoint") + '">' +
          window.I18n.t("poi.editBtn") +
        '</button>' +
        // Repositionner : arme le picker clic-carte d'editor.js ; classe générique (ce n'est pas l'édition).
        '<button class="kta-popup-btn" type="button" ' + _act("repositionner") +
          'title="' + window.I18n.t("poi.movePoint") + '">' +
          window.I18n.t("poi.moveBtn") +
        '</button>' +
      '</div>'
    : '';
  const deleteRow = showSessionActions
    ? '<div class="kta-popup-actions kta-popup-actions-danger">' +
        '<button class="kta-popup-btn kta-popup-btn-delete" type="button" ' + _act("supprimer") +
          'title="' + window.I18n.t("poi.deletePoint") + '">' +
          window.I18n.t("poi.deleteBtn") +
        '</button>' +
      '</div>'
    : '';

  // Photos hydratées en async au popupopen (window.attachPopupPhotos) ; vide → masqué en CSS (:empty).
  const photosSlot = '<div class="kta-popup-photos" data-pointid="' + _escAttr(id) + '"></div>';

  // Ligne GPS si le plan est calibré, pour tout point (session et data layer) ; 📋 copie.
  let gpsLineHtml = "";
  const _gpsLatLng = _planXyToGps(x, y);
  if (_gpsLatLng) {
    const gpsStr = _formatGps(_gpsLatLng);
    const gpsAttr = _escAttr(gpsStr);
    gpsLineHtml =
      '<div class="kta-popup-gps" title="' + window.I18n.t("poi.gpsComputed") + '">' +
        '<span class="kta-popup-gps-icon">🌐</span>' +
        '<code class="kta-popup-gps-val">' + window.ktaEsc(gpsStr) + '</code>' +
        '<button class="kta-popup-gps-copy" type="button" data-kta-act="gps" data-kta-gps="' + gpsAttr + '" ' +
          'title="' + window.I18n.t("poi.copyGps") + '">📋</button>' +
      '</div>';
  }

  // 🔊 Lecture de la description (VoiceTts) si elle existe et si Speech Synthesis est dispo. Jamais
  // d'auto-lecture. Texte passé en data-tts-text (robuste aux sauts de ligne et apostrophes).
  let ttsBtnHtml = "";
  if (safeDesc && window.VoiceTts && typeof window.VoiceTts.isSupported === "function" && window.VoiceTts.isSupported()) {
    ttsBtnHtml = '<button class="kta-popup-tts-btn" type="button" ' +
                   'data-tts-text="' + _escAttr(desc) + '" data-kta-act="tts" ' +
                   'title="' + window.I18n.t("poi.readNote") + '">' +
                   '🔊' +
                 '</button>';
  }

  // Liaisons inter-plan (registre localStorage + liens embarqués `point.interPlanLinks`) et « Lier à un
  // autre plan ». Tout point est liable (js/interPlanLinks.js).
  let iplSectionHtml = "";
  if (window.InterPlanLinks && typeof window.InterPlanLinks.buildPopupHtml === "function") {
    try { iplSectionHtml = window.InterPlanLinks.buildPopupHtml(point, _layerId); }
    catch(e) { console.warn("[Popup] section liaisons inter-plan :", e); }
  }

  // uid d'un point de session : une extension peut y accrocher ses actions.
  const _uidAttr = (isEditorSession === true && point.uid) ? ' data-kta-uid="' + _escAttr(point.uid) + '"' : "";
  return '<div class="kta-popup-point"' + _uidAttr + '>' +
           '<b>' + safeName + '</b>' +
           (safeDesc ? '<br><span class="kta-popup-desc">' + ttsBtnHtml + safeDesc + '</span>' : '') +
           gpsLineHtml +
           photosSlot +
           '<div class="kta-popup-actions">' +
             '<button class="kta-popup-btn kta-popup-btn-here" type="button" ' + _act("ici") +
               'title="' + window.I18n.t("poi.iAmHere") + '">' +
               window.I18n.t("iti.wp.jeSuisIci") +
             '</button>' +
             '<button class="kta-popup-btn kta-popup-btn-aller" type="button" ' + _act("aller") +
               'data-kta-nom="' + _escAttr(nom) + '" ' +
               'title="' + window.I18n.t("poi.goThere") + '">' +
               window.I18n.t("poi.goThereBtn") +
             '</button>' +
             '<button class="kta-popup-btn kta-popup-btn-add" type="button" ' + _act("etape") +
               'data-kta-nom="' + _escAttr(nom) + '" ' +
               'title="' + window.I18n.t("poi.addWaypoint") + '">' +
               window.I18n.t("poi.addWaypointBtn") +
             '</button>' +
             // Favori : window.toggleFavoriPoint met à jour le libellé en place (pas de re-rendu de la popup).
             '<button class="kta-popup-btn kta-popup-btn-fav' + (isFav ? ' kta-fav-active' : '') + '" type="button" ' +
               'data-fav-pointid="' + _escAttr(id) + '" ' +
               'data-fav-pointuid="' + _escAttr(point.uid || "") + '" ' + _act("favori") +
               'data-kta-nom="' + _escAttr(nom) + '" data-kta-tag="' + _escAttr(_firstTag) + '" ' +
               'data-kta-calque="' + _escAttr(_layerId) + '" data-kta-calque-label="' + _escAttr(_layerLabel) + '" ' +
               'title="' + (isFav ? window.I18n.t("poi.favRemoveTitle") : window.I18n.t("poi.favAddTitle")) + '">' +
               (isFav ? window.I18n.t("poi.favOn") : window.I18n.t("poi.favOff")) +
             '</button>' +
           '</div>' +
           iplSectionHtml +
           editRow +
           deleteRow +
         '</div>';
}
window.buildPointPopupHtml = buildPointPopupHtml;

// 🔒 Actions de la fiche (data-kta-act) : UN écouteur en CAPTURE — Leaflet arrête la propagation
// (disableClickPropagation), un écouteur en bulle ne verrait rien. Valeurs lues en data-* (jamais évaluées).
function _ktaPopupAction(e) {
  const b = e.target && e.target.closest && e.target.closest(".kta-popup-point [data-kta-act]");
  if (!b) return;
  e.preventDefault();
  const d = b.dataset, x = Number(d.ktaX) || 0, y = Number(d.ktaY) || 0, id = d.ktaId || "";
  const appel = function(nom) {
    const f = window[nom];
    if (typeof f !== "function") { console.warn("[Popup] action indisponible :", nom); return; }
    return f.apply(window, Array.prototype.slice.call(arguments, 1));
  };
  switch (d.ktaAct) {
    case "modifier":      return appel("modifierPointEditor", id, x, y);
    case "repositionner": return appel("repositionnerPointEditor", id, x, y);
    case "supprimer":     return appel("supprimerPointEditor", id, x, y);
    case "gps":           return appel("kta_copierGps", d.ktaGps || "");
    case "tts":           return appel("kta_lireNotePopup", b);
    case "ici":           return appel("recalerTrackerSurPoint", x, y);
    case "aller":         return appel("itineraireYAller", x, y, d.ktaNom || "");
    case "etape":         return appel("itineraireAjouterWaypoint", x, y, d.ktaNom || "");
    case "favori":        return appel("toggleFavoriPoint", id, x, y, d.ktaNom || "", d.ktaTag || "default",
                                       d.ktaCalque || "data", d.ktaCalqueLabel || "", d.favPointuid || "");
  }
  // Liaisons inter-plan (section de la fiche, js/interPlanLinks.js)
  const L = window.InterPlanLinks;
  if (!L) return;
  if (d.ktaAct === "ipl-go") return L.naviguerVers(d.ktaLien || "", d.ktaCote === "b" ? "b" : "a");
  if (d.ktaAct === "ipl-del") return L.supprimerDepuisPopup(d.ktaLien || "");
  if (d.ktaAct === "ipl-add") {
    return L.ouvrirCreation(id, x, y, d.ktaNom || "", d.ktaSource === "session" ? "session" : "data",
      parseInt(d.ktaNiveau, 10) || 0, d.ktaTag || "", d.ktaPointUid || "");
  }
}
document.addEventListener("click", _ktaPopupAction, true);

// Image introuvable → estompée (data-kta-echec). Remplace les onerror="…" inline, que la CSP bloque.
// L'événement « error » ne remonte pas : écoute en capture.
document.addEventListener("error", function(e) {
  const t = e.target;
  if (t && t.tagName === "IMG" && t.dataset && t.dataset.ktaEchec) t.style.opacity = t.dataset.ktaEchec;
}, true);

// ── Vibration (point d'entrée unique) ──────────
// N'agit que si APP_CONFIG.vibrationEnabled === true et si l'API existe (iOS Safari ne l'a pas, par choix
// d'Apple : pas de polyfill). pattern = durée en ms ou tableau [vib, pause, vib…]. Échec silencieux.
// Raccourcis : light 50 ms · medium 100 ms · double [100, 50, 100] · error [200, 100, 200, 100, 200].
window.kta_vibrate = function(pattern) {
  if (!window.APP_CONFIG || window.APP_CONFIG.vibrationEnabled !== true) return false;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(pattern);
  } catch(e) {
    if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
      console.warn("[Haptics] kta_vibrate échec :", e);
    }
    return false;
  }
};
window.kta_vibrate.light  = function() { return window.kta_vibrate(50); };
window.kta_vibrate.medium = function() { return window.kta_vibrate(100); };
window.kta_vibrate.double = function() { return window.kta_vibrate([100, 50, 100]); };
window.kta_vibrate.error  = function() { return window.kta_vibrate([200, 100, 200, 100, 200]); };

// Pour afficher ou non le réglage. La présence de la méthode ne prouve pas une vibration réelle (trackpad Mac).
window.kta_vibrate.isSupported = function() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
};
// 🩸 Classe « urgence » : les retours de SÉCURITÉ (sortie trouvée, aucune sortie, alerte serveur emergency)
// vibrent MÊME si la préférence de confort est OFF (son défaut) — décision produit. Seul le support
// matériel compte. Consommateurs : sortieUrgence.js, alertChecker.js.
window.kta_vibrate.urgence = function(pattern) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  try { return navigator.vibrate(pattern); } catch(e) { return false; }
};
window.kta_vibrate.urgence.medium = function() { return window.kta_vibrate.urgence(100); };
window.kta_vibrate.urgence.error  = function() { return window.kta_vibrate.urgence([200, 100, 200, 100, 200]); };

// Bouton 🔊 des popups de point : lecture / arrêt via window.VoiceTts, icône 🔊 ↔ ⏹️ pendant la lecture.
let _kta_currentTtsBtn = null;
window.kta_lireNotePopup = function(btn) {
  if (!btn || !window.VoiceTts) return;
  const text = btn.getAttribute("data-tts-text") || "";
  if (!text) return;

  // même bouton pendant la lecture → arrêt
  if (_kta_currentTtsBtn === btn && window.VoiceTts.isSpeaking()) {
    window.VoiceTts.cancel();
    btn.textContent = "🔊";
    btn.title = window.I18n.t("poi.readNote");
    _kta_currentTtsBtn = null;
    return;
  }

  // sinon : coupe la lecture d'un autre bouton, lance celle-ci
  if (_kta_currentTtsBtn && _kta_currentTtsBtn !== btn) {
    _kta_currentTtsBtn.textContent = "🔊";
    _kta_currentTtsBtn.title = window.I18n.t("poi.readNote");
  }
  _kta_currentTtsBtn = btn;
  btn.textContent = "⏹️";
  btn.title = window.I18n.t("poi.stopReading");
  window.VoiceTts.speak(text);
};

// Remet l'icône à 🔊 en fin de lecture ou sur erreur (sinon le bouton reste sur ⏹️).
if (window.VoiceTts && typeof window.VoiceTts.onStateChange === "function") {
  window.VoiceTts.onStateChange(function(state) {
    if (state === "ended" || state === "error" || state === "canceled") {
      if (_kta_currentTtsBtn) {
        _kta_currentTtsBtn.textContent = "🔊";
        _kta_currentTtsBtn.title = window.I18n.t("poi.readNote");
        _kta_currentTtsBtn = null;
      }
    }
  });
}

// Bouton ⭐ de la popup : reçoit tout le point (pas de relookup) et met à jour en place le libellé du bouton
// dans toutes les popups ouvertes de ce point.
window.toggleFavoriPoint = function(pointId, x, y, nom, tag, layerId, layerLabel, pointUid) {
  if (!window.Favoris) return;
  const snapshot = {
    pointId:    pointId,
    pointUid:   pointUid || undefined,
    nom:        nom,
    x:          x,
    y:          y,
    tag:        tag        || "default",
    layerId:    layerId    || "editor",
    layerLabel: layerLabel || ""
  };
  const res = window.Favoris.toggle(snapshot);
  const nowFav = window.Favoris.isFav(pointId, pointUid);
  document.querySelectorAll('.kta-popup-btn-fav[data-fav-pointid]').forEach(function(btn) {
    // le bouton de CE point (uid), pas celui d'un homonyme
    const bu = btn.getAttribute("data-fav-pointuid") || "";
    if (pointUid ? bu === pointUid : btn.getAttribute("data-fav-pointid") === pointId) {
      btn.textContent = nowFav ? window.I18n.t("poi.favOn") : window.I18n.t("poi.favOff");
      btn.classList.toggle("kta-fav-active", nowFav);
      btn.title = nowFav ? window.I18n.t("poi.favRemoveTitle") : window.I18n.t("poi.favAddTitle");
    }
  });
  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(
      window.I18n.t(nowFav ? "poi.favAddedToast" : "poi.favRemovedToast", { name: (nom || pointId) }),
      "info"
    );
  }
};

// ── Photos de la popup d'un point : attachPopupPhotos(marker, pointId) ──────────
// Au popupopen, remplit le slot `.kta-popup-photos` (miniatures → visionneuse) ; aucune photo → slot vide
// masqué en CSS. Idempotent (_ktaPhotosAttached). Les objectURLs sont révoquées au popupclose.
// ⚠️ _ktaAllPhotoUrls : registre GLOBAL de toutes les objectURLs de photos (popups, éditeur, Secours),
// vidé par _revokeAllPhotoObjectUrls() au changement de plan (main.js > _libererRessourcesPlanPrecedent) :
// sans lui, les blobs des popups jamais fermées restent épinglés jusqu'au rechargement (crash mémoire iOS).
window._ktaAllPhotoUrls = window._ktaAllPhotoUrls || new Set();
window._revokeAllPhotoObjectUrls = window._revokeAllPhotoObjectUrls || function() {
  if (window._ktaAllPhotoUrls.size === 0) return;
  const n = window._ktaAllPhotoUrls.size;
  window._ktaAllPhotoUrls.forEach(function(u) {
    try { URL.revokeObjectURL(u); } catch(e) {}
  });
  window._ktaAllPhotoUrls.clear();
  if (window.APP_CONFIG && window.APP_CONFIG.debugMode) {
    console.log("[Photos] _revokeAllPhotoObjectUrls : " + n + " ObjectURL globales libérées");
  }
};

// Combien de points du plan (session + calques) portent ce nom ? Une photo rangée sous un nom partagé est
// « à rattacher » : on ne devine jamais à quel point elle appartient (ETUDE_UID).
function _ktaCompterPointsNommes(nom) {
  const n = String(nom || "");
  if (!n) return 0;
  let c = 0;
  (window.getEditorPoints ? window.getEditorPoints() || [] : []).forEach(function(p) { if (p && String(p.id || "") === n) c++; });
  (typeof window.getAllEmbeddedPoints === "function" ? window.getAllEmbeddedPoints() : []).forEach(function(p) { if (p && String(p.id || "") === n) c++; });
  return c;
}
window._ktaCompterPointsNommes = _ktaCompterPointsNommes;

function attachPopupPhotos(marker, pointId, pointUid) {
  if (!marker || !pointId) return;
  if (marker._ktaPhotosAttached) return;
  marker._ktaPhotosAttached = true;

  const _objectUrls = new Set();
  let _lastLoadedForPointId = null;

  function _cleanupUrls() {
    _objectUrls.forEach(function(u) {
      try { URL.revokeObjectURL(u); } catch(e) {}
      // registre global : pas de double révocation si le changement de plan passe avant le popupclose
      if (window._ktaAllPhotoUrls) window._ktaAllPhotoUrls.delete(u);
    });
    _objectUrls.clear();
  }

  marker.on("popupopen", function _hydraterPhotos(ev) {
    if (!window.MyKTAMapPhotos) return;
    const popupEl = ev.popup && ev.popup.getElement ? ev.popup.getElement() : null;
    if (!popupEl) return;
    const slot = popupEl.querySelector(".kta-popup-photos");
    if (!slot) return;
    const pid = slot.getAttribute("data-pointid") || pointId;
    if (!pid) return;

    // 🩸 Relecture IDB à CHAQUE ouverture : le popupclose a révoqué les blob: URLs, le DOM garderait des
    // <img src="blob:…"> morts (image cassée). Coût ~10-50 ms.
    _lastLoadedForPointId = pid;
    // vide le slot : pas d'ancien contenu qui clignote si la relecture traîne
    slot.innerHTML = "";
    slot.dataset.loaded = "0";

    const planId = window._currentLoadedPlanId || "default";
    // double lecture : sous l'uid du point, puis sous son nom
    const _lecture = (pointUid && window.MyKTAMapPhotos.getPhotosForPointRef)
      ? window.MyKTAMapPhotos.getPhotosForPointRef(planId, { uid: pointUid, id: pid })
      : window.MyKTAMapPhotos.getPhotosForPoint(planId, pid);
    const _nomAmbigu = !!pointUid && _ktaCompterPointsNommes(pid) > 1;
    _lecture.then(function(arr) {
      if (!arr || arr.length === 0) {
        slot.innerHTML = "";
        slot.dataset.loaded = "1";
        return;
      }
      const photosWithUrl = arr.map(function(rec) {
        const url = URL.createObjectURL(rec.blob);
        _objectUrls.add(url);
        if (window._ktaAllPhotoUrls) window._ktaAllPhotoUrls.add(url);
        return {
          id:         rec.id,
          mime:       rec.mime,
          size:       rec.size,
          createdAt:  rec.createdAt,
          _objectUrl: url,
          _aRattacher: !!(rec._parNom && _nomAmbigu)
        };
      });
      // Miniatures 44×44 en <img> cliquable, pas en <button> : les styles user-agent du bouton laissaient un fond
      // bleu. L'img est forcée en display:block en CSS pour remplir le cadre.
      slot.innerHTML =
        '<div class="kta-popup-photos-row"></div>' +
        '<div class="kta-popup-photos-count">📸 ' + photosWithUrl.length + ' photo' + (photosWithUrl.length > 1 ? "s" : "") + '</div>';
      const rowEl = slot.querySelector(".kta-popup-photos-row");
      photosWithUrl.forEach(function(p, idx) {
        const img = document.createElement("img");
        img.className = "kta-popup-photo-mini";
        img.src = p._objectUrl;
        img.alt = "";
        img.loading = "lazy";
        img.draggable = false;
        img.dataset.idx = idx;
        img.title = window.I18n.t("utils.popup.viewPhoto", { n: (idx + 1), total: photosWithUrl.length });
        // role + tabindex : la miniature reste utilisable au clavier
        img.setAttribute("role", "button");
        img.setAttribute("tabindex", "0");
        if (p._aRattacher) img.classList.add("kta-popup-photo-arattacher");
        rowEl.appendChild(img);
      });
      slot.dataset.loaded = "1";

      // « À rattacher » : photos rangées sous le NOM du point, que plusieurs points portent. L'app ne choisit pas :
      // un bouton par photo la rattache à CE point. Rien n'est supprimé.
      const aRattacher = photosWithUrl.filter(function(p) { return p._aRattacher; });
      if (aRattacher.length && pointUid && window.MyKTAMapPhotos.setPhotoPointId) {
        const box = document.createElement("div");
        box.className = "kta-popup-photos-arattacher";
        const titre = document.createElement("div");
        titre.className = "kta-popup-photos-arattacher-titre";
        titre.textContent = window.I18n.t("utils.popup.aRattacher.titre", { n: aRattacher.length });
        box.appendChild(titre);
        aRattacher.forEach(function(p) {
          const idx = photosWithUrl.indexOf(p);
          const b = document.createElement("button");
          b.type = "button";
          b.className = "kta-popup-btn kta-popup-photos-arattacher-btn";
          b.textContent = window.I18n.t("utils.popup.aRattacher.btn", { n: idx + 1 });
          b.addEventListener("click", function(ev) {
            ev.stopPropagation();
            b.disabled = true;
            window.MyKTAMapPhotos.setPhotoPointId(p.id, pointUid).then(function(ok) {
              b.textContent = ok ? window.I18n.t("utils.popup.aRattacher.fait") : window.I18n.t("utils.popup.aRattacher.echec");
              const mini = rowEl.querySelector('.kta-popup-photo-mini[data-idx="' + idx + '"]');
              if (ok && mini) mini.classList.remove("kta-popup-photo-arattacher");
            });
          });
          box.appendChild(b);
        });
        slot.appendChild(box);
      }

      // Clic + clavier (Entrée, Espace : ce sont des <img role="button">) → visionneuse plein écran.
      slot.querySelectorAll(".kta-popup-photo-mini").forEach(function(el) {
        function _open(ev) {
          ev.stopPropagation();
          ev.preventDefault();
          if (!window.MyKTAMapPhotoViewer) {
            console.warn("[Popup photos] MyKTAMapPhotoViewer indispo");
            return;
          }
          const idx = parseInt(el.dataset.idx, 10) || 0;
          window.MyKTAMapPhotoViewer.open(photosWithUrl, idx);
        }
        el.addEventListener("click", _open);
        el.addEventListener("keydown", function(ev) {
          if (ev.key === "Enter" || ev.key === " ") _open(ev);
        });
      });
    }).catch(function(e) {
      console.warn("[Popup photos] getPhotosForPoint erreur :", e);
    });

    // Installation reliée (prise `photos`) : l'extension dépose les photos manquantes (8 s max) ; si elle en a
    // déposé et que la fiche est toujours ouverte, on la réhydrate UNE fois. Sans extension : rien.
    const K = window.KtaExtensions;
    if (!ev._ktaRelance && K && typeof K.aPrise === "function" && K.aPrise("photos")) {
      K.photosCompleterPoint(planId, pointUid || pid).then(function(n) {
        if (n > 0 && marker.isPopupOpen && marker.isPopupOpen()) _hydraterPhotos({ popup: ev.popup, _ktaRelance: true });
      });
    }
  });

  marker.on("popupclose", function() {
    // Révocation à la fermeture (sinon fuite) ; le HTML reste mais ses blob: sont morts, la prochaine
    // ouverture ré-hydrate.
    _cleanupUrls();
    _lastLoadedForPointId = null;
  });
}
window.attachPopupPhotos = attachPopupPhotos;

function normaliserPoints(json) {
  if (Array.isArray(json.data))          return json.data;
  if (Array.isArray(json.editorPoints))  return json.editorPoints;
  return [];
}

// ── Styles des data layers : aucune table ici, tout vient de js/styleResolver.js ──────────
// ⚠️ Passer par le résolveur fait lire LegendCustomization : un type custom d'un calque de données a la même
// couleur qu'en session (sinon blanc / gris / bleu de repli).
// Deux helpers car les cibles diffèrent : carte Leaflet (motif SVG de `inaccessible` peint tel quel) ;
// canvas d'export (pas de `url(#pattern)` → { flat: true }, aplat de repli du type).
// `repli` = type utilisé si `type` est introuvable ; `null` pour ne rien rendre.

function _ktaStyleMap(categorie, type, repli) {
  const R = window.ktaResolveStyle;
  if (typeof R !== "function") {
    console.error("[Utils] window.ktaResolveStyle absent — styles indisponibles.");
    return null;
  }
  return R(categorie, type) || (repli ? R(categorie, repli) : null);
}

function _ktaStyleCanvas(categorie, type, repli) {
  const R = window.ktaResolveStyle;
  if (typeof R !== "function") {
    console.error("[Utils] window.ktaResolveStyle absent — styles indisponibles.");
    return null;
  }
  return R(categorie, type, { flat: true }) ||
         (repli ? R(categorie, repli, { flat: true }) : null);
}

// Multi-niveau : registres de TOUS les objets Leaflet des data layers, pour filtrer sans relire. Vidés à
// chaque initDataFromConfig (main.js, au changement de plan).
//   _ktaDataMarkers (setOpacity + pointer-events) · _ktaDataPolylines (setStyle opacity) ·
//   _ktaDataPolygons (setStyle opacity + fillOpacity)
window._ktaDataMarkers   = window._ktaDataMarkers   || [];
window._ktaDataPolylines = window._ktaDataPolylines || [];
window._ktaDataPolygons  = window._ktaDataPolygons  || [];

// MultiLevel OFF → tout visible ; ON → visible ssi level ∈ visibleLevels.
function _passeFiltreDataLevel(lvl) {
  const multi = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  if (!multi) return true;
  const visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
    ? window.APP_CONFIG.visibleLevels : [0];
  return visibles.indexOf(Number.isInteger(lvl) ? lvl : 0) >= 0;
}

// Filtres runtime du FilterPanel (tag / type) : true quand le filtre est désactivé (null).
function _passeFiltreRuntimeTag(tag) {
  const f = window._ktaRuntimeFilters;
  if (!f || !f.tags) return true;
  return f.tags.has(tag || "default");
}
function _passeFiltreRuntimeType(category, type) {
  const f = window._ktaRuntimeFilters;
  if (!f) return true;
  const set = (category === "roads")  ? f.roadTypes
            : (category === "zones")  ? f.zoneTypes
            : (category === "structs") ? f.structTypes
            : null;
  if (!set) return true;
  return set.has(type);
}

// ── Markers des data layers ──────────
function _filtreNiveauSurMarkerData(marker) {
  if (!marker) return;
  let visible = _passeFiltreDataLevel(marker._ktaLevel);
  if (visible) {
    const tag = (Array.isArray(marker._ktaTags) && marker._ktaTags[0]) || "default";
    if (!_passeFiltreRuntimeTag(tag)) visible = false;
  }
  try { marker.setOpacity(visible ? 1 : 0); } catch(e) {}
  if (marker._icon) marker._icon.style.pointerEvents = visible ? "" : "none";
}
window._applyLevelFilterToDataPoints = function() {
  if (!Array.isArray(window._ktaDataMarkers)) return;
  window._ktaDataMarkers.forEach(_filtreNiveauSurMarkerData);
};

// ── Polylignes des data layers ──────────
// L'opacité d'origine est mémorisée pour être restaurée au réaffichage (elle peut être < 1).
function _filtreNiveauSurPolylineData(entry) {
  if (!entry || !entry.polyline) return;
  let visible = _passeFiltreDataLevel(entry.level);
  if (visible && entry.type) {
    if (!_passeFiltreRuntimeType("roads", entry.type)) visible = false;
  }
  try {
    // 🩸 fillOpacity coupé AUSSI : les ronds d'extrémité de jonction sont des circleMarker REMPLIS ; avec
    // `opacity: 0` seul, le disque blanc resterait visible sous filtre.
    entry.polyline.setStyle({
      opacity:     visible ? entry.origOpacity : 0,
      fillOpacity: visible ? (entry.origFillOpacity != null ? entry.origFillOpacity : 0) : 0
    });
  } catch(e) {}
}
window._applyLevelFilterToDataRoads = function() {
  if (!Array.isArray(window._ktaDataPolylines)) return;
  window._ktaDataPolylines.forEach(_filtreNiveauSurPolylineData);
};

// Repeint les objets des calques de données après un changement de couleur de légende (construits une
// fois au chargement, sinon la couleur n'arrive qu'au rechargement). Ne touche qu'aux couleurs et aux
// opacités d'ORIGINE : l'opacité affichée appartient au filtre multi-niveau, réappliqué juste après pour
// ne pas révéler un objet masqué. `inaccessible` : renderer SVG dédié, setStyle du motif fonctionne tel quel.
window._ktaRestyleDataLayers = function() {
  const R = window.ktaResolveStyle;
  if (typeof R !== "function") return;
  const parType = {};   // mémo par (cat|type)
  function _style(cat, type) {
    const k = cat + "|" + type;
    if (!(k in parType)) parType[k] = R(cat, type);
    return parType[k];
  }
  (window._ktaDataPolylines || []).forEach(function(e) {
    if (!e || !e.polyline || !e.type) return;
    const s = _style("traces", e.type);
    if (!s) return;
    try { e.polyline.setStyle({ color: s.color }); } catch(err) {}
  });
  (window._ktaDataPolygons || []).forEach(function(e) {
    if (!e || !e.polygon || !e.type) return;
    const s = _style("zones", e.type);
    if (!s) return;
    if (s.fillOpacity != null) e.origFillOpacity = s.fillOpacity;
    try { e.polygon.setStyle({ color: s.color, fillColor: s.fillColor }); } catch(err) {}
  });
  (window._ktaDataStructurePolygons || []).forEach(function(e) {
    if (!e || !e.polygon || !e.type) return;
    const s = _style("structures", e.type);
    if (!s) return;
    if (s.fillOpacity != null) e.origFillOpacity = s.fillOpacity;
    try { e.polygon.setStyle({ color: s.color, fillColor: s.fillColor || s.color }); } catch(err) {}
  });
  // les filtres niveau / type décident seuls des opacités
  if (typeof window._applyLevelFilterToDataRoads === "function") window._applyLevelFilterToDataRoads();
  if (typeof window._applyLevelFilterToDataZones === "function") window._applyLevelFilterToDataZones();
  if (typeof window._applyLevelFilterToDataStructures === "function") window._applyLevelFilterToDataStructures();
};

// ── Polygones des data layers (zones et structures, même format) ──────────
// `kindForRuntime` (zone | structure) vient des wrappers _applyLevelFilterToData{Zones,Structures}.
function _filtreNiveauSurPolygonData(entry, kindForRuntime) {
  if (!entry || !entry.polygon) return;
  let visible = _passeFiltreDataLevel(entry.level);
  if (visible && entry.type && kindForRuntime) {
    if (!_passeFiltreRuntimeType(kindForRuntime, entry.type)) visible = false;
  }
  try {
    entry.polygon.setStyle({
      opacity:     visible ? entry.origOpacity     : 0,
      fillOpacity: visible ? entry.origFillOpacity : 0
    });
  } catch(e) {}
}
window._applyLevelFilterToDataZones = function() {
  if (!Array.isArray(window._ktaDataPolygons)) return;
  window._ktaDataPolygons.forEach(function(e) { _filtreNiveauSurPolygonData(e, "zones"); });
};

window._applyLevelFilterToDataStructures = function() {
  if (!Array.isArray(window._ktaDataStructurePolygons)) return;
  window._ktaDataStructurePolygons.forEach(function(e) { _filtreNiveauSurPolygonData(e, "structs"); });
};

// ── Tout ce que porte le plan : session + calques de données ──────────
// 🩸 Compter la session seule rend « (0) » sur un plan importé (tout le relevé est dans un calque) et
// l'export PDF, qui désactive une case à compteur nul, n'exporte plus rien. Le compte juste se fait ici.
// Sert à COMPTER, pas à dessiner : les exports peignent calque par calque, selon les cases de leur modale.
window.ktaAnnotationsCompletes = function (famille) {
  const paires = {
    points:     ["getEditorPoints", "getAllEmbeddedPoints"],
    roads:      ["getRoads",        "getAllEmbeddedRoads"],
    zones:      ["getZones",        "getAllEmbeddedZones"],
    structures: ["getStructures",   "getAllEmbeddedStructures"]
  };
  const p = paires[famille];
  if (!p) return [];
  const lire = function (nom) {
    return (typeof window[nom] === "function" ? window[nom]() : []) || [];
  };
  return lire(p[0]).concat(lire(p[1]));
};

// ── Getters publics des data layers ──────────
// ⚠️ getAllEmbeddedPoints → [{x, y, nom, id, tags, level, layerId, description?, uid?, updatedAt?}], même
// format que window.getEditorPoints (concaténation directe). Lu sur _ktaDataMarkers (_ktaLevel, _ktaNom, _ktaId,
// _ktaTags…) ; x = lng, y = imageHeight - lat (inverse de convertCoord). Sans lui, stats et exports ne
// verraient que la session.
window.getAllEmbeddedPoints = function() {
  if (!Array.isArray(window._ktaDataMarkers)) return [];
  const imgH = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
  const out = [];
  window._ktaDataMarkers.forEach(function(m) {
    if (!m || typeof m.getLatLng !== "function") return;
    try {
      const ll = m.getLatLng();
      const item = {
        x:     ll.lng,
        y:     imgH - ll.lat,
        nom:   m._ktaNom  || "",
        id:    m._ktaId   || "",
        tags:  Array.isArray(m._ktaTags) ? m._ktaTags : [],
        level: (typeof m._ktaLevel === "number") ? m._ktaLevel : 0,
        layerId: m._ktaLayerId || null
      };
      if (m._ktaDescription) item.description = m._ktaDescription;
      if (m._ktaUid) item.uid = m._ktaUid;
      if (typeof m._ktaUpdatedAt === "number") item.updatedAt = m._ktaUpdatedAt;
      out.push(item);
    } catch(e) {}
  });
  return out;
};

// Zones embarquées → [{type, points, level, layerId, description?, uid?, updatedAt?}], même format que
// window.getZones() : les exports (KMZ en tête) incluent tout le contenu visible, pas seulement la session.
window.getAllEmbeddedZones = function() {
  if (!Array.isArray(window._ktaDataPolygons)) return [];
  return window._ktaDataPolygons
    .filter(function(e) {
      return e && e.type && Array.isArray(e.points) && e.points.length >= 3;
    })
    .map(function(e) {
      const out = { type: e.type, points: e.points, level: e.level || 0, layerId: e.layerId || null };
      if (e.description) out.description = e.description;
      if (e.uid) out.uid = e.uid;
      if (typeof e.updatedAt === "number") out.updatedAt = e.updatedAt;
      return out;
    });
};

// Structures embarquées (export KMZ/GPX, Vue OSM, exports image, Mode Secours).
// ⚠️ Le pathfinder n'utilise PAS les structures (ni arêtes ni obstacles) : seule contrainte dure, les zones
// `inaccessible`.
window.getAllEmbeddedStructures = function() {
  if (!Array.isArray(window._ktaDataStructurePolygons)) return [];
  return window._ktaDataStructurePolygons
    .filter(function(e) {
      // minimum de points selon la géométrie : polyligne (fronts) 2, polygone (piliers, mur) 3
      if (!e || !e.type || !Array.isArray(e.points)) return false;
      // 🩸 Géométrie lue dans la légende (structures.js > _isPolylineType) : un test littéral front-1/front-2
      // ferait tomber un type CUSTOM polyligne à 2 points, visible à l'écran mais absent de la Vue OSM et des
      // exports. Repli sur le test littéral si structures.js n'est pas chargé.
      const isPolyline = (typeof window.isStructurePolylineType === "function")
        ? window.isStructurePolylineType(e.type)
        : (e.type === "front-1" || e.type === "front-2");
      const minPts = isPolyline ? 2 : 3;
      return e.points.length >= minPts;
    })
    .map(function(e) {
      const out = { type: e.type, points: e.points, level: e.level || 0, layerId: e.layerId || null };
      if (e.description) out.description = e.description;
      if (e.uid) out.uid = e.uid;
      if (typeof e.updatedAt === "number") out.updatedAt = e.updatedAt;
      return out;
    });
};

// 🩸 Jeton de génération : bumpé par main.js > _libererRessourcesPlanPrecedent ; chaque boucle rAF de
// chargement le capture et sort s'il a changé, sinon elle ajoute des markers dans le layer du plan
// précédent (layerGroup orphelin retenu, fuite mémoire).
window._ktaDataLayerLoadToken = window._ktaDataLayerLoadToken || 0;

// ── Culling viewport des markers de data layers (réglage ULTRA `viewportCull`) ──────────
// Miroir de road.js > _viewportCull : marge de 10 % ; hors vue à la création → pas d'addTo, marker gardé
// dans _ktaDataMarkers (`_ktaVpHidden = true`) ; _refreshDataMarkersViewport() ajuste au moveend/zoomend ;
// réglage OFF → tout est réintégré. Hors périmètre : le tracker (layer dédié), le marker en création.
// ⚠️ Exposé sur window : editor.js, lostMode.js et secoursMode.js l'appliquent à LEURS markers.

// true si le marker est dans la vue de window.map élargie de `padFraction` (défaut 0.1).
// true aussi sans carte : on ne cache rien par erreur au boot.
function _markerInViewportPadded(marker, padFraction) {
  if (!window.map || !marker) return true;
  try {
    const pad = (padFraction != null) ? padFraction : 0.1;
    // 🩸 Sous rotation, getBounds() rend le rectangle NON tourné ; zoneVisible() rend l'empreinte réelle.
    const base = (window.MapBearing && window.MapBearing.zoneVisible
                  ? window.MapBearing.zoneVisible(0) : null) || window.map.getBounds();
    const b = base.pad(pad);
    return b.contains(marker.getLatLng());
  } catch(e) { return true; }
}
window._markerInViewportPadded = _markerInViewportPadded;

// Re-rend les markers de data layers selon la vue (crochet moveend/zoomend de _bindMarkerViewportHook).
// Réglage OFF : tous les markers cachés sont réintégrés ; ON : ajout / retrait selon la vue élargie.
// Idempotent.
window._refreshDataMarkersViewport = function() {
  // Un seul crochet moveend/zoomend sert aussi les markers de session (editor.js) et les tracés du plan.
  if (typeof window._refreshEditorMarkersViewport === "function") {
    window._refreshEditorMarkersViewport();
  }
  window._refreshDataPolylinesUltra();

  if (!Array.isArray(window._ktaDataMarkers) || window._ktaDataMarkers.length === 0) return;
  const _vpcOn = !!(window.PerfUltra && window.PerfUltra.get("viewportCull"));

  if (!_vpcOn) {
    // réglage coupé en cours de session : retour à l'état normal
    window._ktaDataMarkers.forEach(function(m) {
      if (m && m._ktaVpHidden && m._ktaLayer) {
        try { m.addTo(m._ktaLayer); } catch(e) {}
        m._ktaVpHidden = false;
      }
    });
    return;
  }

  window._ktaDataMarkers.forEach(function(m) {
    if (!m || !m._ktaLayer) return;
    const inside = _markerInViewportPadded(m, 0.1);
    if (inside && m._ktaVpHidden) {
      try { m.addTo(m._ktaLayer); } catch(e) {}
      m._ktaVpHidden = false;
    } else if (!inside && !m._ktaVpHidden) {
      try { m.remove(); } catch(e) {}
      m._ktaVpHidden = true;
    }
  });
};

// 🩸 Les tracés d'un plan sont créés ICI et n'entrent jamais dans `roadsData` (road.js) : viewportCull et
// decim doivent donc les traiter à part, sinon ils n'agissent pas sur le cas pour lequel ils existent.
// Règles calquées sur road.js :
//   • viewportCull : bbox (coords plan, calculée une fois) hors de l'écran élargi de 10 % → retirée de SON
//     calque (jamais de la carte : un calque décoché reste décoché). Le filtre niveau / type reste actif.
//   • decim : points simplifiés selon le zoom (ktaDecimerPointsTrace) ; `entry.points` reste intact
//     (exports, itinéraire, heatmap le lisent).
//   • réglage coupé → tout est réintégré, géométrie d'origine rendue.
function _bboxEntreeData(e) {
  if (e._ktaBb !== undefined) return e._ktaBb;
  let b = null;
  if (Array.isArray(e.points) && e.points.length) {
    b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    e.points.forEach(function(p) {
      if (p.x < b.minX) b.minX = p.x;
      if (p.x > b.maxX) b.maxX = p.x;
      if (p.y < b.minY) b.minY = p.y;
      if (p.y > b.maxY) b.maxY = p.y;
    });
  } else if (e.polyline && typeof e.polyline.getLatLng === "function") {
    // rond d'extrémité de jonction : un seul point
    const ll = e.polyline.getLatLng();
    const H = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
    b = { minX: ll.lng, maxX: ll.lng, minY: H - ll.lat, maxY: H - ll.lat };
  }
  e._ktaBb = b;
  return b;
}

function _boiteVueData() {
  if (!window.map) return null;
  try {
    const base = (window.MapBearing && window.MapBearing.zoneVisible
                  ? window.MapBearing.zoneVisible(0) : null) || window.map.getBounds();
    const sw = base.getSouthWest(), ne = base.getNorthEast();
    const H = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
    const padW = (ne.lng - sw.lng) * 0.1, padH = (ne.lat - sw.lat) * 0.1;
    return { minX: sw.lng - padW, maxX: ne.lng + padW, minY: H - (ne.lat + padH), maxY: H - (sw.lat - padH) };
  } catch(e) { return null; }
}

window._refreshDataPolylinesUltra = function() {
  const liste = window._ktaDataPolylines;
  if (!Array.isArray(liste) || liste.length === 0) return;
  const P = window.PerfUltra;
  const cullOn  = !!(P && P.get("viewportCull") && window.map);
  const decimOn = !!(P && P.get("decim") && typeof window.ktaDecimerPointsTrace === "function");
  const vue = cullOn ? _boiteVueData() : null;
  const eps = (decimOn && typeof window.ktaEpsilonDecimation === "function") ? window.ktaEpsilonDecimation() : 0;
  liste.forEach(function(e) {
    if (!e || !e.polyline || !e.groupe) return;
    // 1) décimation, seulement quand l'epsilon change (un par palier de zoom)
    if (Array.isArray(e.points) && e.points.length > 8 && typeof e.polyline.setLatLngs === "function") {
      const voulu = decimOn ? eps : 0;
      if ((e._ktaEps || 0) !== voulu) {
        const d = voulu > 0 ? window.ktaDecimerPointsTrace(e.points) : null;
        const pts = d ? d.points : e.points;
        try { e.polyline.setLatLngs(pts.map(function(p) { return convertCoord(p.x, p.y); })); } catch(err) {}
        e._ktaEps = d ? voulu : 0;
      }
    }
    // 2) hors écran
    let dedans = true;
    if (cullOn && vue) {
      const b = _bboxEntreeData(e);
      if (b) dedans = !(b.maxX < vue.minX || b.minX > vue.maxX || b.maxY < vue.minY || b.minY > vue.maxY);
    }
    if (dedans && e._ktaVpHidden) {
      try { e.groupe.addLayer(e.polyline); } catch(err) {}
      e._ktaVpHidden = false;
    } else if (!dedans && !e._ktaVpHidden) {
      try { e.groupe.removeLayer(e.polyline); } catch(err) {}
      e._ktaVpHidden = true;
    }
  });
};

// Un changement de réglage agit tout de suite. Abonnement unique (PerfUltra survit au changement de plan).
(function _brancherUltraSurTracesData() {
  let fait = false;
  function essayer() {
    if (fait) return;
    if (!window.PerfUltra || typeof window.PerfUltra.onChange !== "function") return;
    fait = true;
    window.PerfUltra.onChange(function(cles) {
      if (cles.some(function(k) { return k === "decim" || k === "viewportCull"; })) {
        window._refreshDataPolylinesUltra();
      }
    });
  }
  essayer();
  if (!fait) document.addEventListener("DOMContentLoaded", essayer);
})();

// Pose le crochet moveend/zoomend qui appelle _refreshDataMarkersViewport. Idempotent par carte
// (map._mkmMarkerHookBound) : nouveau plan = nouvelle carte = nouveau branchement. false sans carte.
window._bindMarkerViewportHook = function() {
  if (!window.map) return false;
  if (window.map._mkmMarkerHookBound) return true;
  try {
    window.map.on("moveend zoomend", window._refreshDataMarkersViewport);
    window.map._mkmMarkerHookBound = true;
    return true;
  } catch(e) { return false; }
};

function ajouterPointsDepuisJSON(url, layer) {
  // 🩸 La largeur des fronts dépend du zoom et un plan importé porte ses structures ICI : sans cet appel,
  // ses traits restent à 10 px à tout zoom. Idempotent.
  try { if (typeof window.brancherLargeurFronts === "function") window.brancherLargeurFronts(); } catch (e) {}
  const _loadToken = window._ktaDataLayerLoadToken;

  // Sans ce crochet, les markers cachés au boot ne réapparaîtraient jamais.
  if (typeof window._bindMarkerViewportHook === "function") {
    window._bindMarkerViewportHook();
  }

  // Retrouve le calque (dataLayerGroups) de ce JSON : layerId / layerLabel pour le bouton ⭐.
  function _resolveLayerInfo(targetLayer) {
    if (!window.dataLayerGroups) return null;
    for (const id in window.dataLayerGroups) {
      if (window.dataLayerGroups[id] === targetLayer) {
        let label = id;
        const cfg = window.PLAN_CONFIG && window.PLAN_CONFIG.dataLayers;
        if (Array.isArray(cfg)) {
          const lc = cfg.find(function(d) { return d.id === id; });
          if (lc && lc.label) label = lc.label;
        }
        return { layerId: id, layerLabel: label };
      }
    }
    return null;
  }
  const _layerInfo = _resolveLayerInfo(layer);

  fetch(url)
    .then(res => res.json())
    .then(json => {
      const points = normaliserPoints(json);

      // par lots de 50 : pas de gel du thread UI
      const BATCH = 50;
      let index = 0;

      function ajouterBatch() {
        // 🩸 changement de plan entre deux lots : abandon, sinon les markers atterrissent dans le layerGroup du
        // plan précédent
        if (_loadToken !== window._ktaDataLayerLoadToken) return;
        const fin = Math.min(index + BATCH, points.length);
        for (let i = index; i < fin; i++) {
          const p = points[i];
          var marker = L.marker(convertCoord(p.x, p.y), { icon: choisirIcone(p) });
          // PerfUltra noTooltips : pas de popup sur les markers de data layers (on passe par 🔍 Recherche) ;
          // les points de session restent interactifs.
          const _skipPopup = !!(window.PerfUltra && window.PerfUltra.get("noTooltips"));
          if (!_skipPopup) {
            // Popup en lecture seule (false = pas de 🗑️) avec layerInfo pour ⭐. LAZY : bindPopup reçoit une fonction,
            // appelée à l'ouverture — pas de ~10 I18n.t() × N markers au chargement.
            marker.bindPopup(function() {
              return (typeof window.buildPointPopupHtml === "function")
                ? window.buildPointPopupHtml(p, false, _layerInfo)
                : ("<b>" + (p.nom || "") + "</b><br>" + (p.description || ""));
            }, window.KTA_POPUP_OPTS);
            if (typeof window.attachPopupPhotos === "function") {
              window.attachPopupPhotos(marker, String(p.id || ""), p.uid);
            }
          }

          // multi-niveau : `level` absent → 0
          marker._ktaLevel = Number.isInteger(p.level) ? p.level : 0;
          // nom, tags, id : les placemarks KML (sinon points anonymes dans le KMZ)
          marker._ktaNom  = p.nom || "";
          marker._ktaId   = p.id  || "";
          marker._ktaTags = Array.isArray(p.tags) ? p.tags : [];
          // description embarquée (export KMZ/GPX)
          marker._ktaDescription = p.description || "";
          // 🩸 calque d'origine : sans lui, l'export ne rattache pas le point à sa case « calque »
          marker._ktaLayerId = _layerInfo ? _layerInfo.layerId : null;
          // uid posé par le Générateur sur les plans récents ; absent des anciens, on ne l'invente pas
          if (typeof p.uid === "string" && p.uid) marker._ktaUid = p.uid;
          if (typeof p.updatedAt === "number") marker._ktaUpdatedAt = p.updatedAt;
          window._ktaDataMarkers.push(marker);
          _filtreNiveauSurMarkerData(marker);

          attachMarkerDblClickZoom(marker);

          // viewport culling : pas d'addTo hors vue ; _ktaLayer garde le calque cible pour la réintégration
          marker._ktaLayer = layer;
          const _vpcMk = !!(window.PerfUltra && window.PerfUltra.get("viewportCull"));
          if (_vpcMk && !_markerInViewportPadded(marker, 0.1)) {
            marker._ktaVpHidden = true;
          } else {
            marker._ktaVpHidden = false;
            marker.addTo(layer);
          }
        }
        index = fin;
        if (index < points.length) {
          requestAnimationFrame(ajouterBatch);
        }
      }

      requestAnimationFrame(ajouterBatch);

      // Tracés embarqués en lecture seule. Multi-niveau ON : tri par level croissant (niveau N sous N+1), puis
      // chemin < secondaire < principal, comme road.js > renderRoads. OFF : ordre du JSON.
      if (Array.isArray(json.roads) && json.roads.length > 0) {
        const _mlOn = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
        let roadsToRender = json.roads;
        if (_mlOn) {
          const TYPE_ORDER = { chemin: 0, secondaire: 1, principal: 2 };
          roadsToRender = [...json.roads].sort(function(a, b) {
            const la = Number.isInteger(a.level) ? a.level : 0;
            const lb = Number.isInteger(b.level) ? b.level : 0;
            if (la !== lb) return la - lb;  // bas en-dessous, haut au-dessus
            return (TYPE_ORDER[a.type] != null ? TYPE_ORDER[a.type] : 99) -
                   (TYPE_ORDER[b.type] != null ? TYPE_ORDER[b.type] : 99);
          });
        }
        // un seul renderRoads en fin de boucle (pas un par registerEmbeddedRoad)
        let _ktaEmbeddedRoadRegistered = false;
        roadsToRender.forEach(function(road) {
          if (!road.points || road.points.length < 2) return;
          const style = _ktaStyleMap("traces", road.type) || { color: "#ffffff", weight: 5, opacity: 1 };
          const latlngs = road.points.map(function(p) { return convertCoord(p.x, p.y); });
          // Polyline visible non interactive ; si une note est embarquée, ghost TRANSPARENTE épaisse par-dessus
          // pour la popup en lecture seule (clic facile au doigt).
          const hasNoteRO = !!(road.description && String(road.description).trim());
          const polyline = L.polyline(latlngs, Object.assign({}, style, { interactive: false })).addTo(layer);
          if (hasNoteRO && typeof window.attacherNotePopup === "function") {
            const _roadEmojisRO = { principal: "🟩", secondaire: "🟪", chemin: "🟨", jonction: "🪜", itinerary: "🗺️" };
            function _roadROTitle(t) {
              if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
                if (String(t).startsWith("cust-")) {
                  const e = window.LegendCustomization.findCustomEntry(t);
                  if (e) return "✨ " + e.label;
                }
                if (_roadEmojisRO[t]) {
                  return _roadEmojisRO[t] + " " + window.LegendCustomization.getLabel("traces", t);
                }
              }
              const LBL = {
                principal:  window.I18n.t("utils.tracePopup.principal"),
                secondaire: window.I18n.t("utils.tracePopup.secondaire"),
                chemin:     window.I18n.t("utils.tracePopup.chemin"),
                jonction:   window.I18n.t("utils.tracePopup.jonction"),
                itinerary:  window.I18n.t("utils.tracePopup.itinerary")
              };
              return LBL[t] || window.I18n.t("utils.tracePopup.fallback", { type: t });
            }
            const ghostRO = L.polyline(latlngs, {
              weight:              Math.max((style.weight || 3) + 14, 18),
              opacity:             0,
              interactive:         true,
              bubblingMouseEvents: false
            });
            // ghost attaché seulement si aucun mode d'édition n'est actif (sinon par _kta_syncDataLayerNoteGhosts)
            if (window._aucunModeEditionActif()) {
              ghostRO.addTo(layer);
            }
            window._kta_dataLayerNoteGhosts.push({ ghost: ghostRO, parent: layer });
            window.attacherNotePopup(
              ghostRO,
              function() { return road.description; },
              null,
              _roadROTitle(road.type),
              { mode: "readonly" }
            );
          }
          // registre du filtre multi-niveau (level absent → 0) ; type, points et description pour
          // getAllEmbeddedRoads (export KMZ/GPX)
          const entry = {
            // 🩸 sans l'id du calque, l'export ne sait pas quel objet vient de quel calque (cases « calques »)
            layerId:      _layerInfo ? _layerInfo.layerId : null,
            polyline:    polyline,
            groupe:      layer,   // calque parent (réglages ULTRA)
            type:        road.type,
            points:      road.points,
            level:       Number.isInteger(road.level) ? road.level : 0,
            description: road.description || undefined,
            uid:         (typeof road.uid === "string" && road.uid) ? road.uid : undefined,
            updatedAt:   (typeof road.updatedAt === "number") ? road.updatedAt : undefined,
            origOpacity: style.opacity ?? 1
          };
          window._ktaDataPolylines.push(entry);
          _filtreNiveauSurPolylineData(entry);
          // Registre de road.js avec le layerGroup du calque (intersections filtrées par visibilité). skipRender :
          // un seul rendu en fin de lot.
          if (typeof window.registerEmbeddedRoad === "function") {
            window.registerEmbeddedRoad(road, layer, true);
            _ktaEmbeddedRoadRegistered = true;
          }

          // ronds magenta aux extrémités des jonctions (parité avec road.js > renderRoads)
          if (road.type === "jonction" && road.points.length >= 2) {
            const endpts = [road.points[0], road.points[road.points.length - 1]];
            endpts.forEach(function(pt) {
              const cm = L.circleMarker(convertCoord(pt.x, pt.y), {
                radius:      7,
                color:       "#ff4ecb",   // bord magenta cohérent avec polyline
                fillColor:   "#ffffff",   // intérieur blanc = contraste
                fillOpacity: 1,
                weight:      3,
                interactive: false
              }).addTo(layer);
              // même level que la polyline : le filtre niveau masque aussi les ronds
              window._ktaDataPolylines.push({
                polyline:        cm,
                groupe:          layer,
                // 🩸 `type` obligatoire : sans lui, le filtre runtime par type saute ces ronds (`if (entry.type)`)
                type:            road.type,
                level:           entry.level,
                origOpacity:     1,
                // 🩸 disque REMPLI : le masquage doit couper fillOpacity
                origFillOpacity: 1
              });
            });
          }
        });
        // un seul rendu en fin de lot ; no-op si road.js n'est pas prêt
        if (_ktaEmbeddedRoadRegistered && window.map && window.roadInitialized &&
            typeof window.renderRoads === "function") {
          window.renderRoads();
        }
        window._refreshDataPolylinesUltra();
      }

      // Structures embarquées en lecture seule (structure.json est un data layer comme un autre).
      if (Array.isArray(json.structures) && json.structures.length > 0) {
        // Styles du résolveur (mêmes valeurs qu'en session). Ordre Z : mur < pilier-2 < pilier-1 < front-2 <
        // front-1 (fronts devant) ; multi-niveau : level croissant d'abord, comme structures.js > renderStructures.
        const ordreStruct = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
        const _multiLevelOnSort = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
        const structuresTriees = [...json.structures].sort(function(a, b) {
          if (_multiLevelOnSort) {
            const la = Number.isInteger(a.level) ? a.level : 0;
            const lb = Number.isInteger(b.level) ? b.level : 0;
            if (la !== lb) return la - lb;
          }
          return (ordreStruct[a.type] ?? 99) - (ordreStruct[b.type] ?? 99);
        });
        // registre du filtre multi-niveau (équivalent de _ktaDataPolygons), créé au 1er chargement
        if (!Array.isArray(window._ktaDataStructurePolygons)) {
          window._ktaDataStructurePolygons = [];
        }
        structuresTriees.forEach(function(structure) {
          const style = _ktaStyleMap("structures", structure.type, "mur");
          const isPolyline = !!(style && style.isPolyline);
          const minPts = isPolyline ? 2 : 3;
          if (!structure.points || structure.points.length < minPts) return;
          const latlngs = structure.points.map(function(p) { return convertCoord(p.x, p.y); });
          // note en lecture seule ; ghost épais pour les fronts si note présente
          const hasNoteROStruct = !!(structure.description && String(structure.description).trim());
          let leafletLayer;
          if (isPolyline) {
            // front : polyline épaisse non interactive (ghost par-dessus si note)
            leafletLayer = L.polyline(latlngs, {
              color:    style.color,
              weight:   style.weight,
              opacity:  style.opacity,
              lineCap:  "round",
              lineJoin: "round",
              // 🩸 MÊME CLASSE que les structures de session : sans elle, la largeur reste figée à 10 px sur les plans
              // importés, ceux qui portent des milliers de fronts.
              interactive: false
            }).addTo(layer);
          } else {
            // pilier / mur : polygone rempli, l'aire capte les clics
            leafletLayer = L.polygon(latlngs, Object.assign({}, style, { interactive: hasNoteROStruct })).addTo(layer);
          }
          if (hasNoteROStruct && typeof window.attacherNotePopup === "function") {
            const _structEmojisRO = { "pilier-1": "🟡", "pilier-2": "🟠", "mur": "🔵", "front-1": "🟨", "front-2": "🟧" };
            function _structROTitle(t) {
              if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
                if (String(t).startsWith("cust-")) {
                  const e = window.LegendCustomization.findCustomEntry(t);
                  if (e) return "✨ " + e.label;
                }
                if (_structEmojisRO[t]) {
                  return _structEmojisRO[t] + " " + window.LegendCustomization.getLabel("structures", t);
                }
              }
              const LBL = {
                "pilier-1": window.I18n.t("struct.popup.pilier-1"),
                "pilier-2": window.I18n.t("struct.popup.pilier-2"),
                "mur":      window.I18n.t("struct.popup.mur"),
                "front-1":  window.I18n.t("struct.popup.front-1"),
                "front-2":  window.I18n.t("struct.popup.front-2")
              };
              return LBL[t] || window.I18n.t("struct.popup.fallback", { type: t });
            }
            let cibleStructRO = leafletLayer;
            if (isPolyline) {
              const ghostStructRO = L.polyline(latlngs, {
                weight:              Math.max((style.weight || 10) + 12, 22),
                opacity:             0,
                interactive:         true,
                bubblingMouseEvents: false
              });
              if (window._aucunModeEditionActif()) {
                ghostStructRO.addTo(layer);
              }
              window._kta_dataLayerNoteGhosts.push({ ghost: ghostStructRO, parent: layer });
              cibleStructRO = ghostStructRO;
            }
            window.attacherNotePopup(
              cibleStructRO,
              function() { return structure.description; },
              null,
              _structROTitle(structure.type),
              { mode: "readonly" }
            );
          }
          // clé `polygon` gardée pour _filtreNiveauSurPolygonData (une polyline supporte aussi setStyle)
          const entry = {
            polygon:         leafletLayer,
            // 🩸 calque d'origine (cf. tracés)
            layerId:         _layerInfo ? _layerInfo.layerId : null,
            type:            structure.type,
            points:          structure.points,
            level:           Number.isInteger(structure.level) ? structure.level : 0,
            description:     structure.description || undefined,
            uid:             (typeof structure.uid === "string" && structure.uid) ? structure.uid : undefined,
            updatedAt:       (typeof structure.updatedAt === "number") ? structure.updatedAt : undefined,
            origOpacity:     style.opacity     ?? 1,
            origFillOpacity: style.fillOpacity ?? 0.85
          };
          window._ktaDataStructurePolygons.push(entry);
          _filtreNiveauSurPolygonData(entry);
        });
      }

      // Zones embarquées en lecture seule. Ordre : eau (arrière) → remblais → effondrement (avant).
      if (Array.isArray(json.zones) && json.zones.length > 0) {
        // 🩸 `inaccessible` est peinte au motif SVG (hachures, index.html) : renderer SVG forcé, un renderer
        // canvas ignore url(#…).
        const zonesTriees = [...json.zones].sort(function(a, b) {
          const ordre = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
          return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
        });
        // renderer SVG unique pour toutes les zones inaccessibles des data layers
        if (!window._inaccessibleDataRenderer) {
          window._inaccessibleDataRenderer = L.svg({ padding: 0.5 });
        }
        zonesTriees.forEach(function(zone) {
          if (!zone.points || zone.points.length < 3) return;
          const style = _ktaStyleMap("zones", zone.type, "remblais");
          const latlngs = zone.points.map(function(p) { return convertCoord(p.x, p.y); });
          const hasNoteROZone = !!(zone.description && String(zone.description).trim());
          const polyOpts = (zone.type === "inaccessible")
            ? Object.assign({}, style, { interactive: hasNoteROZone, renderer: window._inaccessibleDataRenderer })
            : Object.assign({}, style, { interactive: hasNoteROZone });
          const polygon = L.polygon(latlngs, polyOpts).addTo(layer);
          if (hasNoteROZone && typeof window.attacherNotePopup === "function") {
            const _zoneEmojisRO = { eau: "💧", remblais: "⬛", effondrement: "🟥", inaccessible: "⛔" };
            function _zoneROTitle(t) {
              if (window.LegendCustomization && typeof window.LegendCustomization.findCustomEntry === "function") {
                if (String(t).startsWith("cust-")) {
                  const e = window.LegendCustomization.findCustomEntry(t);
                  if (e) return "✨ " + e.label;
                }
                if (_zoneEmojisRO[t]) {
                  return _zoneEmojisRO[t] + " " + window.LegendCustomization.getLabel("zones", t);
                }
              }
              const LBL = {
                eau:          "💧 Zone Eau",
                remblais:     "⬛ Zone Remblais",
                effondrement: "🟥 Zone Effondrement",
                inaccessible: "⛔ Zone Inaccessible"
              };
              return LBL[t] || ("Zone " + t);
            }
            window.attacherNotePopup(
              polygon,
              function() { return zone.description; },
              null,
              _zoneROTitle(zone.type),
              { mode: "readonly" }
            );
          }
          // registre du filtre multi-niveau ; `type` + `points` (coords plan) : le Pathfinder y lit les zones
          // inaccessibles, contrainte dure.
          const entry = {
            polygon:         polygon,
            // 🩸 calque d'origine (cf. tracés)
            layerId:         _layerInfo ? _layerInfo.layerId : null,
            type:            zone.type,
            points:          zone.points,
            level:           Number.isInteger(zone.level) ? zone.level : 0,
            description:     zone.description || undefined,
            uid:             (typeof zone.uid === "string" && zone.uid) ? zone.uid : undefined,
            updatedAt:       (typeof zone.updatedAt === "number") ? zone.updatedAt : undefined,
            origOpacity:     style.opacity     ?? 1,
            origFillOpacity: style.fillOpacity ?? 0.7
          };
          window._ktaDataPolygons.push(entry);
          _filtreNiveauSurPolygonData(entry);
        });
      }

      // étend availableLevels si le calque dépasse la plage par défaut (les markers arrivent par lots async :
      // le 1er lot suffit presque toujours ; sinon boutons +/- de la modale)
      if (typeof window._etendreAvailableLevelsSiBesoin === "function") {
        try { window._etendreAvailableLevelsSiBesoin(); } catch(e) {}
      }
      // un calque de plus compte pour l'ambiguïté des noms : migration des photos (re)planifiée
      if (typeof window._ktaPlanifierMigrationPhotos === "function") window._ktaPlanifierMigrationPhotos();
    })
    .catch(function(err) {
      console.warn("[Data] Erreur chargement", url, err);
    });
}

async function telechargerPlan() {
  try {
    const config = window.PLAN_CONFIG;
    if (!config || !config.plan) {
      window.ktaAlerte(window.I18n.t("utils.export.noPlanConfig"), { type: "erreur" });
      return;
    }

    const width = config.plan.imageWidth;
    const height = config.plan.imageHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Impossible de charger : " + src));
        img.src = src;
      });
    }

    function toCanvasY(y) {
      return y;
    }

    function drawMarkerImage(img, x, y, w, h, anchorX, anchorY) {
      ctx.drawImage(img, x - anchorX, toCanvasY(y) - anchorY, w, h);
    }

    function drawPolyline(points, style) {
      if (!points || points.length === 0) return;

      ctx.save();
      ctx.strokeStyle = style.color || "white";
      ctx.lineWidth = style.weight || 3;
      ctx.globalAlpha = style.opacity ?? 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.moveTo(points[0].x, toCanvasY(points[0].y));

      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, toCanvasY(points[i].y));
      }

      ctx.stroke();
      ctx.restore();
    }

    function isLayerVisible(layer) {
      return window.map && layer && window.map.hasLayer(layer);
    }

    const baseImg = await loadImage(config.plan.baseImage);
    ctx.drawImage(baseImg, 0, 0, width, height);

    if (config.imageLayers && Array.isArray(config.imageLayers)) {
      const sortedImageLayers = [...config.imageLayers].sort((a, b) => a.order - b.order);

      for (const layerConfig of sortedImageLayers) {
        // overlay Leaflet visible ?
        let leafletLayerVisible = false;

        if (window.map) {
          window.map.eachLayer(layer => {
            if (
              layer instanceof L.ImageOverlay &&
              layer._url === layerConfig.file &&
              window.map.hasLayer(layer)
            ) {
              leafletLayerVisible = true;
            }
          });
        }

        if (leafletLayerVisible) {
          const overlayImg = await loadImage(layerConfig.file);
          // overlay calibré (2 ancres) : on respecte sa transform pour que l'export reflète la carte ; sinon,
          // étiré sur le plan principal.
          const calibrated = (layerConfig.calibration && window.ImageLayerCalibration
                              && typeof window.ImageLayerCalibration.drawCalibratedImageLayer === "function")
            ? window.ImageLayerCalibration.drawCalibratedImageLayer(ctx, overlayImg, layerConfig.calibration, width, height)
            : false;
          if (!calibrated) {
            ctx.drawImage(overlayImg, 0, 0, width, height);
          }
        }
      }
    }

    // ── icônes ──
    const iconCache = {};

    async function getIconForPoint(point) {
      let iconPath = getIconUrlForPoint(point);

      // filet ultime : pin Leaflet classique
      if (!iconPath) iconPath = "lib/leaflet/images/marker-icon.png";

      if (!iconCache[iconPath]) {
        iconCache[iconPath] = await loadImage(iconPath);
      }

      return {
        img: iconCache[iconPath],
        path: iconPath
      };
    }

    async function drawPoint(point) {
      const { img } = await getIconForPoint(point);

      // icônes 50×50, ancrage centré
      drawMarkerImage(img, point.x, point.y, 50, 50, 25, 25);
    }

    // ── polygones (zones) ──
    function drawPolygon(points, style) {
      if (!points || points.length < 3) return;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, toCanvasY(points[0].y));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, toCanvasY(points[i].y));
      }
      ctx.closePath();

      ctx.fillStyle   = style.fillColor || style.color || "#888888";
      ctx.globalAlpha = style.fillOpacity ?? 0.35;
      ctx.fill();

      ctx.strokeStyle = style.color || "#888888";
      ctx.lineWidth   = style.weight || 2;
      ctx.globalAlpha = style.opacity ?? 0.6;
      ctx.lineJoin    = "round";
      ctx.stroke();

      ctx.restore();
    }

    // ── calques JSON visibles : data[] + roads[] + zones[] + structures[], comme ajouterPointsDepuisJSON ──
    // `inaccessible` sort en aplat ({ flat: true }) : le canvas ne sait pas peindre le motif SVG. Jonctions en
    // trait plein (pas de setLineDash), extrémités marquées par des ronds magenta.

    // routes (embarquées + session) collectées pour les cercles d'intersection, dessinés à la fin
    const allRoadsForIntersect = [];
    // markers DIFFÉRÉS : ordre ZONE → TRAIT → CERCLE → ICÔNE
    const deferredMarkers = []; // [{point, layerId}]

    // compteurs de diagnostic (APP_CONFIG.debugMode)
    const _diag = { layersVisited: 0, layersSkipped: 0, embZones: 0, embRoads: 0, embStructs: 0, embPoints: 0, fetchFails: 0 };
    const _debug = !!(window.APP_CONFIG && window.APP_CONFIG.debugMode);

    if (config.dataLayers && Array.isArray(config.dataLayers)) {
      for (const layerConfig of config.dataLayers) {
        const leafletLayer = window.dataLayerGroups?.[layerConfig.id];
        const visible = !!(leafletLayer && isLayerVisible(leafletLayer));
        if (_debug) console.log("[Export rapide] layer", layerConfig.id, "→ visible:", visible, "groupExist:", !!leafletLayer);
        if (!visible) { _diag.layersSkipped++; continue; }
        _diag.layersVisited++;

        if (layerConfig.id === "editor") {
          const editorPoints = window.getEditorPoints ? window.getEditorPoints() : [];
          for (const point of editorPoints) {
            // multi-niveau : WYSIWYG (filtre visibleLevels)
            if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(point)) continue;
            deferredMarkers.push(point);
          }
        } else {
          let json = null;
          try {
            const response = await fetch(layerConfig.file);
            json = await response.json();
          } catch (e) {
            _diag.fetchFails++;
            console.warn("[Export rapide] fetch échoué pour", layerConfig.id, "→", layerConfig.file, e);
            continue;
          }

          // zones embarquées (arrière-plan) : eau → remblais → effondrement → inaccessible ; filtre visibleLevels
          if (Array.isArray(json.zones) && json.zones.length > 0) {
            const ordreZ = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
            [...json.zones].sort(function(a, b) {
              return (ordreZ[a.type] ?? 99) - (ordreZ[b.type] ?? 99);
            }).forEach(function(z) {
              if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(z)) return;
              drawPolygon(z.points || [], _ktaStyleCanvas("zones", z.type, "remblais"));
              _diag.embZones++;
            });
          }

          // structures embarquées (piliers, mur, fronts) : ordre Z et couleurs comme ajouterPointsDepuisJSON et
          // exporter.js > _genererCanvasExport
          if (Array.isArray(json.structures) && json.structures.length > 0) {
            // ordre Z : mur < pilier-2 < pilier-1 < front-2 < front-1
            const ordreStruct = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
            const _mlOnStructEmb = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
            [...json.structures].sort(function(a, b) {
              if (_mlOnStructEmb) {
                const la = Number.isInteger(a.level) ? a.level : 0;
                const lb = Number.isInteger(b.level) ? b.level : 0;
                if (la !== lb) return la - lb;
              }
              return (ordreStruct[a.type] ?? 99) - (ordreStruct[b.type] ?? 99);
            }).forEach(function(s) {
              if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(s)) return;
              const style = _ktaStyleCanvas("structures", s.type, "mur");
              const isPolyline = !!style.isPolyline;
              const minPts = isPolyline ? 2 : 3;
              if (!s.points || s.points.length < minPts) return;
              if (isPolyline) {
                drawPolyline(s.points, style);
              } else {
                drawPolygon(s.points, style);
              }
              if (typeof _diag.embStructs !== "number") _diag.embStructs = 0;
              _diag.embStructs++;
            });
          }

          // routes embarquées ; multi-niveau ON : tri par level croissant
          if (Array.isArray(json.roads) && json.roads.length > 0) {
            const _mlOnExp = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
            let roadsR = json.roads;
            if (_mlOnExp) {
              const T_ORDER = { chemin: 0, secondaire: 1, principal: 2 };
              roadsR = [...json.roads].sort(function(a, b) {
                const la = Number.isInteger(a.level) ? a.level : 0;
                const lb = Number.isInteger(b.level) ? b.level : 0;
                if (la !== lb) return la - lb;
                return (T_ORDER[a.type] != null ? T_ORDER[a.type] : 99) -
                       (T_ORDER[b.type] != null ? T_ORDER[b.type] : 99);
              });
            }
            roadsR.forEach(function(r) {
              if (!r.points || r.points.length < 2) return;
              if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(r)) return;
              drawPolyline(r.points, _ktaStyleCanvas("traces", r.type) || { color: "#ffffff", weight: 5, opacity: 1 });
              allRoadsForIntersect.push(r);
              _diag.embRoads++;
            });
          }

          // markers différés
          const points = json.data || [];
          for (const point of points) {
            if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(point)) continue;
            deferredMarkers.push(point);
            _diag.embPoints++;
          }
        }
      }
    }
    if (_debug) console.log("[Export rapide] résumé layer loop :", _diag);

    // ── zones (avant les tracés : arrière-plan), filtre visibleLevels ──
    const zones = (window.getZones ? window.getZones() : []).filter(function(z) {
      return typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau(z);
    });
    for (const zone of [...zones].sort(function(a, b) {
      const ordre = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
      return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
    })) {
      drawPolygon(zone.points || [], _ktaStyleCanvas("zones", zone.type, "remblais"));
    }

    // ── structures de session, entre zones (dessous) et routes (dessus), comme la carte et l'export avancé ──
    if (window.getStructures) {
      const structures = window.getStructures().filter(function(s) {
        return typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau(s);
      });
      if (structures.length > 0) {
        // ordre Z : mur < pilier-2 < pilier-1 < front-2 < front-1
        const ordreStructS = { "mur": 0, "pilier-2": 1, "pilier-1": 2, "front-2": 3, "front-1": 4 };
        const _mlOnStructSess = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
        [...structures].sort(function(a, b) {
          if (_mlOnStructSess) {
            const la = Number.isInteger(a.level) ? a.level : 0;
            const lb = Number.isInteger(b.level) ? b.level : 0;
            if (la !== lb) return la - lb;
          }
          return (ordreStructS[a.type] ?? 99) - (ordreStructS[b.type] ?? 99);
        }).forEach(function(s) {
          const style = _ktaStyleCanvas("structures", s.type, "mur");
          const isPolyline = !!style.isPolyline;
          const minPts = isPolyline ? 2 : 3;
          if (!s.points || s.points.length < minPts) return;
          if (isPolyline) {
            drawPolyline(s.points, style);
          } else {
            drawPolygon(s.points, style);
          }
        });
      }
    }

    // ── routes ──
    // 🩸 Type "itinerary" EXCLU : c'est un calcul du Pathfinder, pas une route ; le repli "white" le peindrait
    // par-dessus les routes colorées et les effacerait. Multi-niveau : WYSIWYG (jonctions visibles si
    // fromLevel/toLevel visibles), tri par level croissant comme road.js > renderRoads.
    const roads = (window.getRoads ? window.getRoads() : [])
      .filter(function(r) { return r.type !== "itinerary"; })
      .filter(function(r) { return typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau(r); });
    const _mlOnExport = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
    if (_mlOnExport) {
      const TYPE_ORDER = { chemin: 0, secondaire: 1, principal: 2, jonction: 3 };
      roads.sort(function(a, b) {
        const la = (a.type === "jonction")
          ? Math.max(Number.isInteger(a.fromLevel) ? a.fromLevel : 0,
                     Number.isInteger(a.toLevel)   ? a.toLevel   : 0)
          : (Number.isInteger(a.level) ? a.level : 0);
        const lb = (b.type === "jonction")
          ? Math.max(Number.isInteger(b.fromLevel) ? b.fromLevel : 0,
                     Number.isInteger(b.toLevel)   ? b.toLevel   : 0)
          : (Number.isInteger(b.level) ? b.level : 0);
        if (la !== lb) return la - lb;
        return (TYPE_ORDER[a.type] != null ? TYPE_ORDER[a.type] : 99) -
               (TYPE_ORDER[b.type] != null ? TYPE_ORDER[b.type] : 99);
      });
    }
    // Jonction : magenta en TRAIT PLEIN (le pointillé exigerait setLineDash), extrémités en ronds blanc + magenta.
    const _colJonctionCanvas = (_ktaStyleCanvas("traces", "jonction") || {}).color;

    for (const road of roads) {
      drawPolyline(road.points || [], _ktaStyleCanvas("traces", road.type) || { color: "white", weight: 5, opacity: 1 });
      // ronds aux extrémités des jonctions ; export rapide : x direct + toCanvasY pour y
      if (road.type === "jonction" && road.points && road.points.length >= 2) {
        const endpts = [road.points[0], road.points[road.points.length - 1]];
        endpts.forEach(function(pt) {
          ctx.save();
          ctx.fillStyle   = "#ffffff";
          ctx.strokeStyle = _colJonctionCanvas;
          ctx.lineWidth   = 3;
          ctx.beginPath();
          ctx.arc(pt.x, toCanvasY(pt.y), 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      }
      // jonctions exclues des intersections (pas de cercle pour un passage interniveau, comme road.js)
      if (road.type === "jonction") continue;
      if (road.points && road.points.length >= 2) allRoadsForIntersect.push(road);
    }

    // ── cercles d'intersection : après les routes, avant les icônes ──
    if (typeof window.computeRoadIntersections === "function" && allRoadsForIntersect.length >= 2) {
      const radius = window.ROAD_INTERSECTION_RADIUS || 8;
      const intersections = window.computeRoadIntersections(allRoadsForIntersect);
      intersections.forEach(function(it) {
        ctx.save();
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(it.point.x, toCanvasY(it.point.y), radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // ── icônes en dernier (au-dessus des traits et cercles) ──
    // try/catch par marker : une icône qui ne charge pas coûte un point, pas l'export.
    let _markerFails = 0;
    for (const point of deferredMarkers) {
      try {
        await drawPoint(point);
      } catch (e) {
        _markerFails++;
        if (_debug) console.warn("[Export rapide] drawPoint échoué pour", point.id || point.nom, e);
      }
    }
    if (_markerFails > 0) console.warn("[Export rapide]", _markerFails, "icône(s) sur", deferredMarkers.length, "n'ont pas pu être dessinées");

    // ── mesure (distance + surface) ──
    const measurePoints = window.getMeasurePoints ? window.getMeasurePoints() : [];
    drawPolyline(measurePoints, { color: "red", weight: 3, opacity: 1 });
    // polygone de surface : remplissage rouge semi-transparent, même teinte que la polyline
    if (window.getMeasurePointsSurface) {
      const measureSurf = window.getMeasurePointsSurface() || [];
      if (measureSurf.length >= 3) {
        drawPolygon(measureSurf, {
          color:       "red",
          weight:      3,
          opacity:     1,
          fillColor:   "red",
          fillOpacity: 0.18
        });
      }
    }

    // ── tracker (chemin parcouru + position) ──
    if (window.getTrackingPath) {
      const trackerPath = window.getTrackingPath();
      if (trackerPath && trackerPath.length > 1) {
        drawPolyline(trackerPath, { color: "#3388ff", weight: 3, opacity: 1 });
      }
    }
    if (window.getTrackingPosition) {
      const trackerPos = window.getTrackingPosition();
      if (trackerPos && typeof trackerPos.x === "number" && typeof trackerPos.y === "number") {
        try {
          const trackerImg = await loadImage(config.icons.track);
          drawMarkerImage(trackerImg, trackerPos.x, trackerPos.y, 50, 50, 25, 25);
        } catch (e) {
          console.warn("[Export rapide] icône tracker non chargée :", e);
        }
      }
    }

    // ── export ──
    // 🩸 Repli JPEG si PNG échoue : l'encodage PNG demande width × height × 4 octets d'un bloc ; Safari iOS
    // et Chrome Android rendent null en silence au-delà de ~250-400 Mo bruts (≈ 8000×8000 px). Le JPEG
    // passe sur des dimensions bien plus grandes.
    function _exporter(mime, ext, quality) {
      return new Promise(function(resolve, reject) {
        canvas.toBlob(function(blob) {
          if (!blob) {
            reject(new Error("toBlob null pour " + mime));
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = (config.plan.name || "plan") + "_complet." + ext;
          link.click();
          setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
          resolve(mime);
        }, mime, quality);
      });
    }

    try {
      await _exporter("image/png", "png");
    } catch (errPng) {
      console.warn("[Export rapide] PNG a échoué — fallback JPEG :", errPng.message);
      try {
        await _exporter("image/jpeg", "jpg", 0.92);
        console.info("[Export rapide] fallback JPEG OK (plan trop grand pour PNG)");
      } catch (errJpg) {
        throw new Error(window.I18n.t("utils.export.tooLargeError"));
      }
    }

  } catch (err) {
    // relancée : la modale Export affiche l'erreur dans sa zone dédiée (pas d'alert masqué par la fermeture)
    console.error("[Export rapide] ERREUR :", err);
    throw err;
  }
}

window.telechargerPlan = telechargerPlan;

// ── Échap global pour les modales (a11y) ──────────
// Un écouteur sur document : overlay le plus haut (z-index max) d'une liste blanche → son bouton de
// fermeture, sinon un clic sur l'overlay (« clic dehors »). Doc : ui.md.
// 🔒 Liste blanche STRICTE : jamais les gates (UnlockGate, PinLock) ni le splash, sinon Échap
// contournerait une protection ou couperait un boot.
// Tout est sous try/catch : un Échap qui plante ne casse jamais l'app.
(function() {
  "use strict";

  var ESCAPABLE_OVERLAYS = [
    ".kta-readme-modal-overlay",  // modales charte communes (Doc, Aide, Aide IA, Inspecteur, Stats globales, Légende, Itinéraire, Calibrage, Maintenance, Update, Alertes, Mode Secours sub-modales, Export sessions, etc.)
    ".kta-cfg-modal-overlay",     // modale Réglages (config)
    ".kta-secours-modal-overlay", // modale Mode Secours principale
    ".kta-fp-overlay",            // modale Filtres ≡
    ".kta-emergency-overlay",     // Mode urgence / Lost Mode
    ".kta-toast"                  // toast actif (le close revient à le dismiss)
  ];

  var CLOSE_BUTTON_SELECTORS = [
    ".kta-readme-modal-close",    // X charte standard
    ".kta-panneau-close",         // X panneau variant
    ".kta-modal-close",           // X générique
    "[data-kta-close-modal]",     // marqueur explicite
    ".kta-toast-close",           // X toast
    ".kta-btn-close"              // X bouton générique
  ];

  function _findTopEscapableOverlay() {
    try {
      var overlays = document.querySelectorAll(ESCAPABLE_OVERLAYS.join(","));
      var top = null;
      var topZ = -1;
      for (var i = 0; i < overlays.length; i++) {
        var el = overlays[i];
        var cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        var z = parseInt(cs.zIndex, 10);
        if (isNaN(z)) z = 0;
        // 🩸 `>=` : à z-index ÉGAL, le DERNIER dans le DOM est peint au-dessus. Avec `>`, une fenêtre empilée sur
        // ⚙️ Configuration (même 99999) laissait Échap fermer la Configuration dessous.
        if (z >= topZ) {
          topZ = z;
          top = el;
        }
      }
      return top;
    } catch (e) {
      return null;
    }
  }

  function _findCloseButton(overlay) {
    try {
      for (var i = 0; i < CLOSE_BUTTON_SELECTORS.length; i++) {
        var btn = overlay.querySelector(CLOSE_BUTTON_SELECTORS[i]);
        if (btn) return btn;
      }
    } catch (e) {}
    return null;
  }

  function _onKeydown(e) {
    if (e.key !== "Escape" && e.key !== "Esc") return;

    var overlay = _findTopEscapableOverlay();
    if (!overlay) return;

    // 1. bouton de fermeture
    var btn = _findCloseButton(overlay);
    if (btn) {
      try {
        btn.click();
        e.preventDefault();
        return;
      } catch (err) { /* fall-through */ }
    }

    // 2. sinon clic sur l'overlay (« clic dehors »)
    try {
      var clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
      overlay.dispatchEvent(clickEvent);
      e.preventDefault();
    } catch (err) { /* swallow — a11y ne doit pas casser l'app */ }
  }

  document.addEventListener("keydown", _onKeydown);
})();

// ── window.ktaTextePdf(s) : texte affichable par la police standard des PDF ──────────
// jsPDF (Helvetica, WinAnsi) affiche tous les accents français et espagnols, « » ’ — … € ° : on les garde.
// 🩸 Hors police (flèches, coches, symboles, emojis) : charabia qui désorganise la ligne. Les plus courants
// sont convertis ; une LETTRE hors police garde sa base (« Łódź » → « Lódz ») par NFKD ; le reste est retiré.
// À passer sur tout texte libre envoyé à pdf.text(). Les libellés PDF des dicos sont contrôlés par
// scripts/check-pdf-texte.js (qui rejoue aussi des cas de ce filtre).
(function () {
  const EXTRA = "ŒœŠšŽžŸƒˆ˜–—‘’‚“”„†‡•…‰‹›€™";
  const EQUIV = { "→": "->", "⇒": "=>", "←": "<-", "⇐": "<=", "↔": "<->", "✓": "OK", "✔": "OK",
                  "✗": "X", "✘": "X", "≥": ">=", "≤": "<=", "≠": "!=", "⚠": "!" };
  // lettres SANS décomposition Unicode (barre, pas accent) : base à la main
  const BASE = { "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h", "ı": "i", "Ŧ": "T", "ŧ": "t" };
  const dansPolice = function (c) {
    const n = c.codePointAt(0);
    return (n >= 0x20 && n <= 0x7E) || n === 0x0A || n === 0x09 || (n >= 0xA0 && n <= 0xFF) || EXTRA.indexOf(c) >= 0;
  };
  window.ktaTextePdf = function (s) {
    let r = "";
    for (const c of String(s == null ? "" : s).normalize("NFC")) {
      if (dansPolice(c)) { r += c; continue; }
      if (EQUIV[c]) { r += EQUIV[c]; continue; }
      if (BASE[c]) { r += BASE[c]; continue; }
      // Repli : décomposer (ź → z + accent) et garder ce que la police affiche ; rien → caractère retiré.
      for (const d of c.normalize("NFKD")) if (dansPolice(d)) r += d;
    }
    return r;
  };
})();

// ── window.ktaCopierTexte(txt) → Promise<boolean> : presse-papier unique de l'app ──────────
// ⚠️ LES DEUX CHEMINS SONT NÉCESSAIRES : navigator.clipboard exige un contexte sécurisé ET un geste ; en
// HTTP local (instance de secours sur réseau isolé) il jette. execCommand("copy") est déprécié mais marche
// partout. Seul confadmin.js garde sa copie (page à part, sans utils.js).
window.ktaCopierTexte = function (txt) {
  const s = String(txt == null ? "" : txt);
  if (!s) return Promise.resolve(false);
  const repli = function () {
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "readonly");
      // hors flux ET hors écran : un textarea visible ferait sauter la vue sur mobile (le focus scrolle)
      ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, s.length);   // iOS ignore select() seul
      const ok = document.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  };
  // Le try ne garde que l'ACCÈS à navigator.clipboard (peut jeter en iframe) ; l'échec de l'écriture passe
  // par le .catch (repli). ⚠️ writeText appelé TOUT DE SUITE (exécuteur de Promise synchrone) : iOS l'exige
  // pendant le geste, un .then() le décalerait d'une microtâche.
  let presse = null;
  try { presse = navigator.clipboard; } catch (e) { presse = null; }
  if (presse && typeof presse.writeText === "function") {
    return new Promise(function (resoudre) { resoudre(presse.writeText(s)); })
      .then(function () { return true; })
      .catch(function () { return repli(); });
  }
  return Promise.resolve(repli());
};

// ── window.ktaStockageLocal : mémoire des sessions ──────────
// Les sessions vivent en IndexedDB (js/sessionStore.js) : la limite qui compte est le QUOTA du site
// (navigator.storage.estimate, plans, photos et caches compris). En repli localStorage (~5 Mo par site,
// plein = QuotaExceededError sans prévenir), on MESURE l'occupation face à une limite prudente.
//   mesurer() → { mode, car, limite, ratio, sessions: [{ planId, car }], autres, carSessions }
//     mode « idb » : car = usage du site, limite = quota (null si le navigateur ne le
//     donne pas : ratio 0), carSessions = total des sessions.
//     mode « ls »  : car = occupation du localStorage, limite = 5 000 000.
//   ecrire(cle, valeur) → bool : écriture localStorage protégée ; plein → événement
//     `mktm:stockage-plein` (une fois par page), jamais d'exception.
(function () {
  const LIMITE = 5000000;   // ~5 Mo : Chrome/Edge 5 Mi car., Firefox 5 Mio, Safari ~5 Mo — prudent
  const PREFIXE_SESSION = "myktamap_session_v1_";
  let _signale = false;

  function _mesurerIdb(st) {
    const sessions = st.ids().map(function (id) { return { planId: id, car: st.taille(id) }; });
    sessions.sort(function (a, b) { return b.car - a.car; });
    const carSessions = sessions.reduce(function (n, x) { return n + x.car; }, 0);
    const e = st.estimation();
    if (!e || !(e.quota > 0)) {
      return { mode: "idb", car: carSessions, limite: null, ratio: 0, sessions: sessions, autres: 0, carSessions: carSessions };
    }
    return { mode: "idb", car: e.usage, limite: e.quota, ratio: e.usage / e.quota, sessions: sessions,
      autres: Math.max(0, e.usage - carSessions), carSessions: carSessions };
  }

  function mesurer() {
    const st = window.KtaSessionStore;
    if (st && st.mode() === "idb") return _mesurerIdb(st);
    let car = 0, autres = 0, carSessions = 0;
    const sessions = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || "";
        const n = k.length + v.length;
        car += n;
        if (k.indexOf(PREFIXE_SESSION) === 0) { sessions.push({ planId: k.slice(PREFIXE_SESSION.length), car: n }); carSessions += n; }
        else autres += n;
      }
    } catch (e) { /* stockage inaccessible (navigation privée stricte) : mesure nulle */ }
    sessions.sort(function (a, b) { return b.car - a.car; });
    return { mode: "ls", car: car, limite: LIMITE, ratio: car / LIMITE, sessions: sessions, autres: autres, carSessions: carSessions };
  }

  function _plein(e) {
    return !!e && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      e.code === 22 || e.code === 1014 || /quota/i.test(e.message || ""));
  }

  function ecrire(cle, valeur) {
    try { localStorage.setItem(cle, valeur); return true; }
    catch (e) {
      if (_plein(e) && !_signale) {
        _signale = true;
        console.warn("[Stockage] localStorage plein : écriture de « " + cle + " » refusée");
        try { window.dispatchEvent(new CustomEvent("mktm:stockage-plein", { detail: { cle: cle } })); } catch (e2) { /* rien */ }
      }
      return false;
    }
  }

  // « 3,8 Mo » / « 1,2 Go » : 1 caractère ≈ 1 octet pour ces données (JSON en ASCII surtout).
  function mo(car) {
    const loc = window.ktaLocale ? window.ktaLocale() : "fr-FR";
    const go = car >= 1e9;
    return (car / (go ? 1e9 : 1e6)).toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + (go ? " Go" : " Mo");
  }

  window.ktaStockageLocal = { mesurer: mesurer, ecrire: ecrire, mo: mo, LIMITE: LIMITE, SEUIL_ALERTE: 0.8 };
})();
