/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

function convertCoord(x, y) {
  return [APP_CONFIG.imageHeight - y, x];
}

function choisirIcone(p) {
  // Map dynamique : essayer les tags d'abord
  if (p.tags && p.tags.length && window._iconMap) {
    for (const tag of p.tags) {
      if (window._iconMap[tag]) return window._iconMap[tag];
    }
  }

  // Fallback 1 : icône default du _iconMap
  if (window._iconMap && window._iconMap.default) return window._iconMap.default;

  // Fallback 2 : variable globale iconeDefault
  if (window.iconeDefault) return window.iconeDefault;

  // Fallback 3 : pin Leaflet natif
  console.warn("[choisirIcone] Aucune icône disponible — pin Leaflet natif");
  return new L.Icon.Default();
}

// Récupère l'URL réelle de l'icône à utiliser pour un point donné, avec cascade complète :
//   1. PLAN_CONFIG.icons[tag] (déclaré dans le plan-config)
//   2. _iconMap[tag].options.iconUrl  (fallback built-in défini dans map.js > TAGS_BUILTIN)
//   3. PLAN_CONFIG.icons.default
//   4. _iconMap.default.options.iconUrl
//   5. null (l'appelant fera son propre fallback ex: pin Leaflet)
//
// Utilisé par : recherche, export PNG, et tout endroit qui a besoin d'une URL et pas d'un L.icon
function getIconUrlForPoint(point) {
  const planIcons = (window.PLAN_CONFIG && window.PLAN_CONFIG.icons) || {};
  const map       = window._iconMap || {};

  function urlFromMapEntry(entry) {
    if (!entry) return null;
    // v174 : avec scaledMarkers ON (default), _iconMap[tag] est un L.divIcon
    // qui n'a PAS options.iconUrl. On stocke l'URL dans _kta_iconUrl pour ces
    // cas (cf map.js > creerIcones > _mkIcon). Fallback sur options.iconUrl
    // si on est en mode L.icon classique (scaledMarkers OFF).
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

// =========================
// 🔍 v1.7.1 : Double-clic sur un marker → zoom dessus
// =========================
// Initialement (commit cb846da) on utilisait l'event natif Leaflet `dblclick`.
// Bug remonté KARMA : ne se déclenche jamais en pratique. Cause probable :
// le handler `click` posé par `marker.bindPopup` "mange" les events et
// l'agrégation 2-clicks-en-dblclick n'a pas le temps de se déclencher.
// Sur mobile c'est encore pire (touch events synthétisent juste des `click`,
// pas de `dblclick` natif fiable).
//
// Nouveau pattern (v1.7.1 fix) : détection manuelle via 2 `click` consécutifs
// dans une fenêtre de 400ms sur le même marker. Marche en toutes conditions
// (popup actif, mobile touch, desktop souris).
//
// Comportement :
//   1er clic  → Leaflet ouvre le popup normalement (= comportement préservé)
//   2e clic en < 400ms sur le même marker → :
//     - closePopup (le popup vient peut-être de s'ouvrir au 2e clic via toggle Leaflet)
//     - flyTo smooth (0.6s) sur la position avec zoom +2 clampé au maxZoom
//   2e clic au-delà de 400ms → traité comme 1er clic d'une nouvelle séquence
//
// Compteur de timestamp PAR marker via closure (pas de variable globale qui
// se mélangerait si l'user clique sur marker A puis marker B rapidement).
//
// À appeler après bindPopup/addTo.
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

    // Ferme le popup s'il vient de s'ouvrir au 2e clic via le toggle Leaflet
    // (bindPopup gère click → openPopup → re-click → closePopup en toggle)
    try { marker.closePopup && marker.closePopup(); } catch(err) {}

    const ll = marker.getLatLng ? marker.getLatLng() : null;
    if (!ll) return;

    // Zoom +2 clampé au maxZoom (= 2 dans MyKTAMap, cf map.setMaxZoom(2))
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

// =========================
// FORMAT DE DISTANCE — m / km adaptatif
// =========================
// Reçoit une distance en mètres et retourne une string formatée :
// - < 1000 m → "X.X m" (decimalsM décimales, défaut 1)
// - ≥ 1000 m → "X.XX km" (toujours 2 décimales, soit ~10 m de précision)
// Utilisé par les 3 outils de mesure (📐 Mesure simple, 📏 Distance totale,
// 🗺️ Itinéraire) pour un affichage cohérent et lisible.
function formatDistance(distM, decimalsM) {
  if (typeof distM !== "number" || isNaN(distM)) return "—";
  if (distM >= 1000) {
    return (distM / 1000).toFixed(2) + " km";
  }
  const dec = (typeof decimalsM === "number") ? decimalsM : 1;
  return distM.toFixed(dec) + " m";
}
window.formatDistance = formatDistance;

// =========================
// FORMATAGE D'UNE SURFACE (m² ↔ ha) — depuis v1.11.2 (V2.2)
// =========================
// Reçoit une surface en m² et retourne une string formatée :
// - < 10 000 m²  → "X m²" (entier, sauf si < 100 m² → 1 décimale)
// - ≥ 10 000 m² → "X.XX ha" (hectares, toujours 2 décimales)
// Décision KARMA : PAS de bascule vers km² (= 1 000 000 m²) car les
// surfaces souterraines typiques (carrières, salles) sont entre 100 m²
// et quelques hectares. km² serait disproportionné et illisible.
// 1 ha = 10 000 m² (= 100 m × 100 m).
function formatSurface(areaM2, decimalsM2) {
  if (typeof areaM2 !== "number" || isNaN(areaM2) || areaM2 < 0) return "—";
  if (areaM2 >= 10000) {
    return (areaM2 / 10000).toFixed(2) + " ha";
  }
  // < 100 m² : 1 décimale (précision utile pour les petites surfaces)
  // ≥ 100 m² : entier (precision pixel-level inutile au-delà)
  if (areaM2 < 100) {
    const dec = (typeof decimalsM2 === "number") ? decimalsM2 : 1;
    return areaM2.toFixed(dec) + " m²";
  }
  return Math.round(areaM2) + " m²";
}
window.formatSurface = formatSurface;

// =========================
// AIRE D'UN POLYGONE — Shoelace formula (depuis v1.11.2 V2.2)
// =========================
// Calcule l'aire d'un polygone simple (non auto-intersectant) en pixels²
// via la formule des lacets (Gauss / shoelace). L'aire retournée est en
// valeur absolue (les polygones CCW vs CW donnent la même valeur).
//
// Pour convertir en m² : diviser par (APP_CONFIG.scale)² puisque scale
// est en px/m, donc 1 px² = (1/scale)² m².
//
// Fonctionne avec un array de {x, y} (≥ 3 points requis pour avoir une aire).
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

// Convertit une aire en pixels² vers m² via APP_CONFIG.scale (px/m).
// Si scale absent → retourne null (pas de conversion possible).
function polygonAreaM2(points) {
  const areaPx2 = polygonArea(points);
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) || null;
  if (!scale || scale <= 0) return null;
  return areaPx2 / (scale * scale);  // px² / (px/m)² = m²
}
window.polygonAreaM2 = polygonAreaM2;

// =========================
// 🆕 hotfix18 — Parser GPS pour barre de recherche unifiée
// =========================
// Détecte le format "lat, lng" (= copier-coller Google Maps natif).
// Valide la plage géographique pour éviter les faux positifs.
// Retourne {lat, lng} ou null si pas un format GPS.
//
// Exemples de matches :
//   "48.680831, 2.158843"   → {lat: 48.680831, lng: 2.158843}
//   "-33.5, 18.42"          → {lat: -33.5,    lng: 18.42}
//   "48.6, 2"               → {lat: 48.6,     lng: 2}
//
// Refusés :
//   "48.680831"             → null (pas de virgule)
//   "abc, 2.15"             → null (pas un nombre)
//   "200, 2.15"             → null (lat hors plage [-90, 90])
function parseGpsCoords(str) {
  if (typeof str !== "string") return null;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(str);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  // Validation plage géographique stricte (refuse les faux positifs genre
  // "48.68, 2.15" qui pourrait être un id de point arbitraire).
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: lat, lng: lng };
}
window.parseGpsCoords = parseGpsCoords;

// =========================
// 🆕 hotfix21 — formatGpsCoords : helper d'affichage pour les inputs combinés
// =========================
// Inverse de parseGpsCoords. Prend des lat/lng numériques (ou null/undefined)
// et retourne la chaîne "lat, lng" prête à être affichée dans un input.
// Retourne "" si l'un des deux n'est pas un nombre fini → permet le pré-fill
// silencieux d'anciennes confs partielles sans afficher "NaN, NaN".
//
// Exemples :
//   formatGpsCoords(48.680831, 2.158843)  → "48.680831, 2.158843"
//   formatGpsCoords(48, 2)                → "48, 2"
//   formatGpsCoords(null, 2.15)           → ""
//   formatGpsCoords("48.6", "2.1")        → ""  (Number.isFinite refuse les strings)
function formatGpsCoords(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  return lat + ", " + lng;
}
window.formatGpsCoords = formatGpsCoords;

// =========================
// 🆕 hotfix21 — attacherGpsValidationCombo : validation live d'un input combiné
// =========================
// Pour les inputs unifiés "lat, lng" (Settings plan, KMZ Export, KMZ paramétrage).
// Attache des listeners qui valident en temps réel le format saisi :
//   - Vide → état neutre (le caller décidera si c'est OK ou bloquant)
//   - Format valide → retire .kta-gps-invalid + clear errorEl
//   - Format invalide → ajoute .kta-gps-invalid + affiche message dans errorEl
//
// Le helper est idempotent (tag via dataset.gpsComboAttached) et retourne
// un objet { validate(), parse() } pour usage au submit :
//   - validate() : applique la classe d'erreur + message si invalide,
//                  retourne true/false (true si vide OU valide).
//   - parse()    : retourne {lat, lng} si valide, null sinon (sans toucher
//                  l'UI — pour les lectures silencieuses).
//
// Usage :
//   const v = attacherGpsValidationCombo(
//     document.getElementById("pl_geo_A_coords"),
//     { errorEl: document.getElementById("pl_geo_A_err") }
//   );
//   // ... au submit :
//   if (!v.validate()) { /* abort */ }
//   const coords = v.parse();
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
    // Validation à la saisie : on n'affiche l'erreur qu'au blur ou submit
    // pour ne pas harceler l'user pendant qu'il tape.
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

// =========================
// 🆕 v1.26.1 — Vérification cohérence échelle px/m ↔ géoréférencement GPS
// =========================
// Si un plan a À LA FOIS un calibrage GPS 2 points (via KmzExport.getCalibration)
// ET une échelle px/m saisie côté APP_CONFIG.scale, on peut DÉTECTER une
// incohérence entre les deux valeurs. C'est un signal diagnostic puissant :
//   - Échelle px/m est calibrée par un pas humain ou un mesurage IRL côté user
//   - Échelle GPS est déduite mathématiquement du géoréf (distance haversine
//     entre points GPS / distance plan en pixels)
// → Si les 2 divergent, soit le calibrage px/m est faux, soit le géoréf est
//   faux (mauvaises coords GPS, points mal placés, etc.).
//
// L'app NE CORRIGE PAS automatiquement (les deux sources sont valides
// indépendamment) — elle se contente d'AFFICHER un banner d'avertissement
// dans 2 emplacements stratégiques :
//   1. Modale ⚙️ Réglages (en haut, sous le titre)
//   2. Modale 💾 Enregistrer → 📡 Export externe KMZ/GPX (début onglet)
//
// 4 niveaux d'écart visuels :
//   < 5%   : silence (cohérent, rien affiché)
//   5-10%  : 🟡 warning jaune
//   10-15% : 🔴 alerte rouge
//   > 15%  : ⬛ critique noir (bordure rouge)
//
// Retour de calculerCoherenceEchelleGeoref :
//   { hasCalibration: false }                                            (rien à comparer)
//   { hasCalibration: true, scaleUser, scaleGps, deltaPercent, level }   (cas normal)
//   { hasCalibration: false, error }                                     (erreur calcul)
//
// level ∈ "ok" | "warn" | "alert" | "critical"
function calculerCoherenceEchelleGeoref(planId) {
  // Échelle user (px/m) : APP_CONFIG.scale
  const scaleUser = (window.APP_CONFIG && Number.isFinite(window.APP_CONFIG.scale))
                    ? window.APP_CONFIG.scale
                    : null;
  if (!Number.isFinite(scaleUser) || scaleUser <= 0) {
    return { hasCalibration: false };
  }

  // Calibrage GPS via KmzExport.getCalibration
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

  // Build transform pour récupérer metresParPixel (m/px)
  let transform;
  try {
    transform = window.KmzExport.buildTransform(
      { x: pA.x, y: pA.y },
      { x: pB.x, y: pB.y },
      { lat: pA.lat, lng: pA.lng },
      { lat: pB.lat, lng: pB.lng }
    );
  } catch(e) {
    return { hasCalibration: false, error: "Calcul transform impossible : " + (e && e.message ? e.message : String(e)) };
  }
  if (!transform || !Number.isFinite(transform.metresParPixel) || transform.metresParPixel <= 0) {
    return { hasCalibration: false, error: "Transform invalide (metresParPixel manquant ou nul)" };
  }

  // Comparaison : scaleUser (px/m) vs (1 / metresParPixel) (px/m)
  const scaleGps = 1 / transform.metresParPixel; // px/m
  const deltaPercent = Math.abs(scaleGps - scaleUser) / scaleUser * 100;

  // 🆕 v1.26.2-hotfix1 — Seuils RESSERRÉS (KARMA : « on n'est pas géologues »).
  // Pour de la nav cataphile, savoir qu'un trajet fait ~1 km avec une marge
  // raisonnable suffit. 10% = 100 m d'erreur sur 1 km = DÉJÀ énorme → critique.
  //   < 3%   silence  (< 30 m/km — tolérance normale du calibrage au pas humain)
  //   3-6%   warning  (30-60 m/km — léger décalage à surveiller)
  //   6-10%  alerte   (60-100 m/km — décalage significatif)
  //   > 10%  critique (> 100 m/km — un des deux calibrages est franchement faux)
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

// Helper : retourne le HTML d'un banner d'avertissement à insérer dans une
// modale. Retourne "" si rien à afficher (= pas de calibration OU level=ok).
// Le caller insère ce HTML brut puis appelle attacherBoutonCopierEchelleGps
// pour binder le clic sur le bouton "📋 Copier".
//
// opts = { context: "settings" | "export" } — pour adapter légèrement le ton
function renderBannerCoherenceEchelle(planId, opts) {
  const r = calculerCoherenceEchelleGeoref(planId);
  if (!r.hasCalibration) return "";        // pas de georef → rien
  if (r.level === "ok") return "";         // cohérent → rien (cf décision KARMA v1.26.1)

  opts = opts || {};
  const context = opts.context || "settings";

  // Format compact des deux valeurs (3 décimales = précision raisonnable)
  const userStr = r.scaleUser.toFixed(3);
  const gpsStr  = r.scaleGps.toFixed(3);
  const deltaStr = r.deltaPercent.toFixed(1);

  // Texte + icône par niveau
  const niveaux = {
    warn:     { icon: "🟡", titre: "Incohérence échelle modérée",          cls: "kta-scale-coherence-warn" },
    alert:    { icon: "🔴", titre: "Incohérence échelle élevée",           cls: "kta-scale-coherence-alert" },
    critical: { icon: "⬛", titre: "Incohérence échelle critique",         cls: "kta-scale-coherence-critical" }
  };
  const n = niveaux[r.level] || niveaux.warn;

  const intro = (context === "export")
    ? "L'export KMZ/GPX géolocalisé utilise le géoréférencement GPS. Si l'écart avec l'échelle calibrée est important, les distances rendues dans Google Earth / OsmAnd ne correspondront PAS aux mesures faites dans MyKTAMap."
    : "L'échelle (px/m) saisie dans cette modale ne correspond pas à l'échelle déduite du géoréférencement GPS. <strong>Une des deux valeurs est probablement fausse.</strong>";

  return '' +
    '<div class="kta-scale-coherence-banner ' + n.cls + '">' +
      '<div class="kta-scale-coherence-titre">' +
        '<span class="kta-scale-coherence-icon">' + n.icon + '</span>' +
        '<strong>' + n.titre + '</strong>' +
        ' · ' +
        '<span class="kta-scale-coherence-delta">+' + deltaStr + '% d\'écart</span>' +
      '</div>' +
      '<div class="kta-scale-coherence-corps">' +
        '<p>' + intro + '</p>' +
        '<table class="kta-scale-coherence-table">' +
          '<tr>' +
            '<td>📐 Échelle calibrée (saisie)</td>' +
            '<td><code>' + userStr + '</code> px/m</td>' +
          '</tr>' +
          '<tr>' +
            '<td>🌐 Échelle déduite du géoréf GPS</td>' +
            '<td><code>' + gpsStr + '</code> px/m ' +
              '<button class="kta-scale-coherence-copy-btn" data-action="copy-scale-gps" data-value="' + gpsStr + '" type="button" title="Copier la valeur GPS dans le presse-papier">📋 Copier</button>' +
            '</td>' +
          '</tr>' +
        '</table>' +
        '<p class="kta-scale-coherence-hint">' +
          '<strong>Aucune correction automatique appliquée.</strong> ' +
          'Vérifie soit le géoréférencement (2 points GPS bien placés ?), soit le calibrage d\'échelle (✏️ Réglages → 🎯 Calibrer l\'échelle). ' +
          'Si tu fais confiance au géoréf, tu peux copier la valeur GPS et la coller dans le champ Échelle.' +
        '</p>' +
      '</div>' +
    '</div>';
}
window.renderBannerCoherenceEchelle = renderBannerCoherenceEchelle;

// Helper : attache les listeners click sur les boutons "📋 Copier" rendus
// par renderBannerCoherenceEchelle. Idempotent (peut être appelé plusieurs
// fois sur le même container). À appeler APRÈS insertion du HTML dans le DOM.
function attacherBoutonCopierEchelleGps(container) {
  if (!container || !container.querySelectorAll) return;
  const btns = container.querySelectorAll('[data-action="copy-scale-gps"]');
  btns.forEach(function(btn) {
    if (btn.dataset.scaleGpsBound === "1") return; // idempotent
    btn.dataset.scaleGpsBound = "1";
    btn.addEventListener("click", function() {
      const val = btn.getAttribute("data-value") || "";
      if (!val) return;
      const txt = btn.textContent;
      const apply = function() {
        btn.textContent = "✓ Copié !";
        setTimeout(function() { btn.textContent = txt; }, 1500);
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(val).then(apply, function() {
            // Fallback execCommand si writeText refusé (HTTP non secure, etc.)
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

// =========================
// 📝 NOTE POPUP — helper commun (zones / roads / structures, v1.16.0 step 1)
// =========================
// Attache un popup Leaflet à un layer (polygon/polyline/circle) avec un
// textarea pour éditer la note (= champ description du modèle data).
// Mêmes classes CSS que les popups points (.kta-popup-point) pour
// hériter automatiquement des overrides thème clair/sombre déjà en
// place (cf. css/style.css > .leaflet-popup-content-wrapper).
//
// Signature :
//   attacherNotePopup(layer, getDescr, setDescr, titreType, opts)
//     - layer    : L.Polygon | L.Polyline | L.CircleMarker
//     - getDescr : () => string | undefined   (lecteur courant)
//     - setDescr : (newDesc: string) => void  (écrit dans le data model)
//                  En mode readonly : peut être null (jamais appelé).
//     - titreType: string (affiché dans le header du popup, ex "Zone Eau")
//     - opts     : { mode: "edit" | "readonly" }  (défaut "edit")
//
// Mode "edit" (session) : textarea + bouton 💾 Sauver. Le popup s'ouvre
// au clic même si la note est vide (= invitation à saisir). HistoryManager
// + SessionPersist.save sont déclenchés au save pour Ctrl+Z et persistance
// immédiate.
//
// Mode "readonly" (data layer) : juste affichage texte de la note (white-
// space:pre-wrap pour préserver les retours à la ligne). Pas de textarea,
// pas de bouton. À NE BINDER que si une note est présente — sinon le user
// clique pour rien sur un data layer qui était silencieux avant. C'est au
// caller de vérifier `description` avant d'appeler le helper en readonly.
// =========================
// HELPER : aucun mode édition actif ?
// =========================
// v1.16.0 step 1d (KARMA "je ne peux plus tracer aucune structure, et le
// popup s'ouvre au bout du trait pendant le tracé") :
//
// Pendant qu'un mode tracé/zone/structure est actif, les ghost polylines
// (transparentes épaisses pour ergonomie clic des notes) INTERCEPTENT les
// clics destinés à ajouter un point au tracé en cours (bubblingMouseEvents:
// false sur les ghosts → map.on("click"/"mousedown") jamais appelé).
//
// Solution : au moment du render (renderRoads, renderStructures,
// ajouterPointsDepuisJSON), on n'installe les ghosts + popups que si AUCUN
// mode édition n'est actif. Quand un mode s'active/désactive, le toggle
// re-render → ghosts dynamiquement (dé)installés.
//
// Pour structures.js + road.js : ON N'INSTALLE PAS NON PLUS le popup sur
// la structure / road EN COURS DE TRACÉ (s === currentStructure /
// road === currentRoad), même si le mode est désactivé (cas limite à la
// fermeture). La note s'éditera après validation finale du tracé.
window._aucunModeEditionActif = function() {
  return !window.modeRoad && !window.modeZone && !window.modeStructure;
};

// 🐛 v1.28.0 : true si un mode « clic carte » CONSOMMATEUR de clics est actif.
// Couvre le dessin (tracé / zone / structure), la mesure, le recalage tracker,
// et TOUS les pickers de position (itinéraire, géoréf, départ tracker,
// évitement, KMZ) — reconnaissables au floater commun `.kta-iti-floater`.
// Utilisé par le garde `popupopen` (map.js) pour NE PAS afficher de popup
// d'annotation (point / tracé / zone / structure) pendant ces modes : le clic
// doit être consommé par le mode actif, pas ouvrir une popup.
// NB : on EXCLUT volontairement window.modeEdition (ajout de point) — y ajouter
// un point peut ouvrir une popup de nommage légitime qu'il ne faut pas fermer.
window._modeClicCarteActif = function() {
  if (window.modeRoad || window.modeZone || window.modeStructure) return true;
  if (window.modeMesure || window.modeRecalage) return true;
  try {
    // Pickers à floater commun : géoréf / départ tracker / itinéraire / évitement / KMZ.
    if (document.querySelector(".kta-iti-floater")) return true;
    // 🆕 v1.28.0 (#2) : mode « clic carte » du Mode perdu (classe posée sur <body>).
    if (document.body && document.body.classList.contains("kta-lost-click-mode")) return true;
    // 🆕 v1.28.0 (#2) : sélection de position légende dans 📡 Export externe (banner dédié).
    if (document.getElementById("kta-export-pick-banner")) return true;
    // NB : le tracé de polygone du Mode Secours gère DÉJÀ son propre
    // stopPropagation + overlay plein écran → pas besoin de le couvrir ici.
  } catch(_) {}
  return false;
};

// Registre des ghost polylines installées sur le DATA LAYER (lectures
// seules KMZ). Un data layer est rendu UNE seule fois à l'import — on
// peut pas re-render comme renderRoads/Structures. Donc on garde la
// référence de chaque ghost ici, plus son layer parent, pour pouvoir
// la détacher/rattacher dynamiquement quand un mode d'édition s'active /
// se désactive.
window._kta_dataLayerNoteGhosts = window._kta_dataLayerNoteGhosts || [];

// Détache (mode actif) ou rattache (mode désactivé) tous les ghosts
// data layer. Appelé par toggleRoadMode / toggleStructureMode /
// toggleZoneMode après mise à jour des flags window.modeRoad / etc.
window._kta_syncDataLayerNoteGhosts = function() {
  const aucunMode = window._aucunModeEditionActif();
  window._kta_dataLayerNoteGhosts.forEach(function(entry) {
    if (!entry || !entry.ghost || !entry.parent) return;
    try {
      if (aucunMode) {
        // Pas de mode actif → ghost actif sur la map. addTo() est idempotent
        // (Leaflet le détache silencieusement avant de réattacher).
        entry.ghost.addTo(entry.parent);
      } else {
        // Mode actif → on retire le ghost pour que les clics passent au map.
        // .remove() est safe même si déjà détaché.
        entry.ghost.remove();
      }
    } catch(e) { /* layer parent détaché entre-temps → ignore */ }
  });
};

// Purge le registre (à appeler avant un nouveau load de data layer pour
// éviter d'accumuler des références mortes après changement de plan).
window._kta_resetDataLayerNoteGhosts = function() {
  window._kta_dataLayerNoteGhosts = [];
};

// Re-rend road + zones + structures + sync data layer ghosts. À appeler
// par chaque toggle (toggleRoadMode, toggleZoneMode, toggleStructureMode)
// quand le flag de mode change : un mode active désactive les ghosts /
// popups des 3 layers session ET du data layer, et vice versa.
window._kta_syncAllNoteUiForModeChange = function() {
  try { if (typeof window.renderRoads === "function") window.renderRoads(); } catch(e) {}
  try { if (typeof window.renderZones === "function") window.renderZones(); } catch(e) {}
  try { if (typeof window.renderStructures === "function") window.renderStructures(); } catch(e) {}
  if (typeof window._kta_syncDataLayerNoteGhosts === "function") {
    window._kta_syncDataLayerNoteGhosts();
  }
};

window.attacherNotePopup = function(layer, getDescr, setDescr, titreType, opts) {
  if (!layer || typeof layer.bindPopup !== "function") return;
  opts = opts || {};
  const mode = (opts.mode === "readonly") ? "readonly" : "edit";

  function _esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function _renderPopupHtml() {
    const current = getDescr() || "";
    if (mode === "readonly") {
      // Pas de textarea, juste le texte affiché. Si pas de note → message
      // explicite (en pratique on ne devrait pas arriver ici car le caller
      // vérifie en amont, mais robustesse pour les cas limites).
      const corps = current
        ? '<div class="kta-note-popup-readonly-text">' + _esc(current) + '</div>'
        : '<div class="kta-note-popup-readonly-empty"><em>(aucune note)</em></div>';
      return '<div class="kta-popup-point kta-note-popup kta-note-popup-readonly-mode">' +
               '<b>' + _esc(titreType) + '</b>' +
               '<div class="kta-note-popup-readonly-label">📖 Note (lecture seule)</div>' +
               corps +
             '</div>';
    }
    // Mode edit (session)
    return '<div class="kta-popup-point kta-note-popup">' +
             '<b>' + _esc(titreType) + '</b>' +
             '<div class="kta-note-popup-wrap">' +
               '<textarea class="kta-note-popup-textarea" rows="4" ' +
                 'placeholder="Note libre (multilignes possibles)…">' +
                 _esc(current) +
               '</textarea>' +
               '<div class="kta-popup-actions kta-note-popup-actions">' +
                 '<button class="kta-popup-btn kta-popup-btn-aller kta-note-popup-save" type="button">' +
                   '💾 Sauver la note' +
                 '</button>' +
               '</div>' +
               '<div class="kta-note-popup-status" style="display:none;"></div>' +
             '</div>' +
           '</div>';
  }

  layer.bindPopup(_renderPopupHtml(), window.KTA_POPUP_OPTS || { autoPan: true, closeButton: true });

  // À chaque ouverture (= y compris après re-render), on rebind le bouton save.
  // L'event popupopen est fiable car Leaflet le déclenche après l'injection DOM
  // de la popup, et content est rebuilt à chaque ouverture si on a forcé
  // setPopupContent avant.
  layer.on("popupopen", function(evt) {
    // Re-render le contenu pour avoir la valeur à jour (au cas où elle a
    // changé depuis le bind initial — peut arriver après undo/redo).
    const fresh = _renderPopupHtml();
    if (evt && evt.popup) evt.popup.setContent(fresh);
    // Mode readonly : rien à wirer, juste afficher le texte. Skip.
    if (mode === "readonly") return;
    // Recherche dans le DOM (popup vient juste d'être injectée).
    setTimeout(function() {
      const popupRoot = document.querySelector(".leaflet-popup-content .kta-note-popup");
      if (!popupRoot) return;
      const textarea = popupRoot.querySelector(".kta-note-popup-textarea");
      const saveBtn  = popupRoot.querySelector(".kta-note-popup-save");
      const statusEl = popupRoot.querySelector(".kta-note-popup-status");
      if (!textarea || !saveBtn) return;

      saveBtn.addEventListener("click", function() {
        const newDescr = textarea.value.trim();
        // Snapshot HistoryManager pour Ctrl+Z
        const _historyBefore = (window.HistoryManager && window.HistoryManager.captureState)
          ? window.HistoryManager.captureState() : null;
        try {
          setDescr(newDescr || undefined);
          if (statusEl) {
            statusEl.style.display = "block";
            statusEl.textContent = "✅ Note sauvegardée";
            statusEl.style.color = "#6ce28a";
          }
          if (window.HistoryManager && _historyBefore && window.HistoryManager.record) {
            window.HistoryManager.record(
              "Note " + titreType,
              _historyBefore
            );
          }
          // Force la sauvegarde session imminente (sinon attendre le polling 1.5s).
          if (window.SessionPersist && window.SessionPersist.save) {
            window.SessionPersist.save();
          }
          // Auto-close après 800 ms pour feedback rapide
          setTimeout(function() {
            if (layer && layer.closePopup) layer.closePopup();
          }, 800);
        } catch(e) {
          if (statusEl) {
            statusEl.style.display = "block";
            statusEl.textContent = "❌ Erreur : " + (e.message || e);
            statusEl.style.color = "#ff8080";
          }
        }
      });
    }, 0);
  });
};

// =========================
// HTML POPUP D'UN POINT — helper commun (editor + embedded)
// =========================
// Construit le HTML d'une popup Leaflet pour un point, avec 2 boutons :
//   🧭 Y aller — calcule l'itineraire depuis la position tracker vers ce point
//   ➕ Itinéraire — ajoute ce point comme waypoint de l'itineraire
// Wire-up via onclick inline (window.itineraireYAller / window.itineraireAjouterWaypoint
// dans interface.js). Echappement HTML/string strict pour eviter les injections
// si un point a un nom avec apostrophe ou guillemet.

// 🆕 v1.21.2 (KARMA "vue que on sait convertir coordonné px en georef, si
// georef fait, on rajoute, juste aprés descriptions les coordonée GPS du
// point") : helper qui calcule les coords GPS d'un point plan si le plan
// courant a un calibrage utilisable. Retourne null si pas de calib (= pas
// d'affichage GPS dans la popup, comportement legacy).
//
// Cache léger : on rebuild la transform à chaque appel mais ça reste O(1)
// (quelques cos/sin), et getCalibration lit localStorage 1×. Acceptable
// même avec 200+ markers (=200 popups). Si perf devient un souci on pourra
// mémoïser au niveau du module utils.js.
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
    if (typeof window.KmzExport.buildTransform !== "function") return null;
    if (typeof window.KmzExport.planToGps     !== "function") return null;
    const t = window.KmzExport.buildTransform(
      { x: A.x, y: A.y }, { x: B.x, y: B.y },
      { lat: A.lat, lng: A.lng }, { lat: B.lat, lng: B.lng }
    );
    return window.KmzExport.planToGps(t, x, y);
  } catch(e) {
    return null;  // calib dégénéré (2 points identiques, etc.)
  }
}

// Formatte une paire {lat, lng} en string "48.85661° N, 2.35222° E".
// Précision 5 décimales ≈ 1.1 m (suffisant pour usage cataphile, pas
// d'overprécision trompeuse vu que le calibrage 2-points a quelques
// mètres d'incertitude intrinsèque).
function _formatGps(ll) {
  if (!ll || typeof ll.lat !== "number" || typeof ll.lng !== "number") return "";
  const latStr = Math.abs(ll.lat).toFixed(5) + "° " + (ll.lat >= 0 ? "N" : "S");
  const lngStr = Math.abs(ll.lng).toFixed(5) + "° " + (ll.lng >= 0 ? "E" : "W");
  return latStr + ", " + lngStr;
}

// Copie une string dans le presse-papier — appelé par le bouton 📋 inline
// dans la popup. Toast feedback si OOMGuard dispo.
window.kta_copierGps = function(txt) {
  if (!txt) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function() {
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("📋 Copié : " + txt, "info");
      }
    }).catch(function() {});
  } else {
    // Fallback ancien : textarea + execCommand. Rare en 2026 mais conserve
    // un chemin si le contexte n'est pas https/localhost.
    try {
      const ta = document.createElement("textarea");
      ta.value = txt; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
      if (window.OOMGuard && window.OOMGuard.showToast) {
        window.OOMGuard.showToast("📋 Copié : " + txt, "info");
      }
    } catch(e) {}
  }
};

function buildPointPopupHtml(point, isEditorSession, layerInfo) {
  const nom  = String(point.nom || "(sans nom)");
  const desc = String(point.description || "");
  // Echappement HTML pour le contenu affiche
  const safeName = nom.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeDesc = desc.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Echappement string JS pour le 'nom' passe en argument inline (entre apostrophes)
  const jsName = nom.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " ");
  const id     = String(point.id || "");
  const jsId   = id.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " ");
  const x = Number(point.x) || 0;
  const y = Number(point.y) || 0;
  // 🆕 v1.16.0 step 3 — Favori : layerInfo passé par les callers
  // (editor.js → { layerId: "editor", layerLabel: "Mes ajouts" }, utils.js
  // ajouterPointsDepuisJSON → { layerId: <data layer id>, layerLabel: <label> }).
  // Si absent, on déduit du flag isEditorSession.
  const _layerId    = (layerInfo && layerInfo.layerId)    || (isEditorSession ? "editor" : "data");
  const _layerLabel = (layerInfo && layerInfo.layerLabel) || (isEditorSession ? "Mes ajouts" : "");
  const _firstTag   = (Array.isArray(point.tags) && point.tags[0]) || "default";
  // Échappement attribut pour les chaînes embarquées en data-* / args inline
  function _escAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
      .replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  const isFav = !!(window.Favoris && window.Favoris.isFav(point.id));

  // Bouton Supprimer : visible UNIQUEMENT pour les points de la session
  // utilisateur en cours (listePoints). Detection via le 2eme argument
  // isEditorSession passe explicitement par le caller :
  //   - editor.js > _ajouterMarker     → true  (point session, supprimable)
  //   - utils.js > ajouterPointsDepuisJSON → false (data layer, lecture seule)
  // ⚠️ NE PAS se baser sur point.source === "editor" : un point converti
  // session → data via Conversion garde "source: editor" dans le JSON, le
  // test serait trompeur → bouton affiche mais supprimerPointEditor ne
  // trouve rien dans listePoints → erreur silencieuse.
  // 🆕 v1.9.3-B1b : 2 lignes pour les points session :
  //   - ligne "édition" : ✏️ Modifier (ouvre la modale unifiée avec photos)
  //   - ligne "destruction" : 🗑️ Supprimer (rouge, séparée pour ne pas être
  //     confondue avec une action neutre)
  const showSessionActions = isEditorSession === true;
  const editRow = showSessionActions
    ? '<div class="kta-popup-actions">' +
        '<button class="kta-popup-btn kta-popup-btn-edit" type="button" ' +
          'onclick="window.modifierPointEditor(\'' + jsId + "'," + x + ',' + y + '); return false;" ' +
          'title="Modifier ce point (nom, type, description, photos)">' +
          '✏️ Modifier' +
        '</button>' +
      '</div>'
    : '';
  const deleteRow = showSessionActions
    ? '<div class="kta-popup-actions kta-popup-actions-danger">' +
        '<button class="kta-popup-btn kta-popup-btn-delete" type="button" ' +
          'onclick="window.supprimerPointEditor(\'' + jsId + "'," + x + ',' + y + '); return false;" ' +
          'title="Supprimer définitivement ce point de ta session">' +
          '🗑️ Supprimer ce point' +
        '</button>' +
      '</div>'
    : '';

  // 🆕 v1.9.3-B1d : slot photos hydraté en async via popupopen (cf.
  // window.attachPopupPhotos appelé depuis _ajouterMarker et
  // ajouterPointsDepuisJSON). Vide par défaut → caché en CSS via :empty
  // pour ne pas créer d'espace blanc si pas de photos.
  const photosSlot = '<div class="kta-popup-photos" data-pointid="' + jsId + '"></div>';

  // 🆕 v1.21.2 (KARMA "si georef fait, on rajoute, juste aprés descriptions
  // les coordonée GPS du point") : ligne coords GPS si le plan est calibré.
  // Affichée pour TOUS les points (session ET data layer — restriction
  // explicite par KARMA "dans le cadre des point uniquement. session, ou
  // datalayer"). Click sur l'icône 📋 → copie dans presse-papier.
  let gpsLineHtml = "";
  const _gpsLatLng = _planXyToGps(x, y);
  if (_gpsLatLng) {
    const gpsStr = _formatGps(_gpsLatLng);
    const gpsAttr = _escAttr(gpsStr);
    gpsLineHtml =
      '<div class="kta-popup-gps" title="Coordonnées GPS calculées via le calibrage du plan">' +
        '<span class="kta-popup-gps-icon">🌐</span>' +
        '<code class="kta-popup-gps-val">' + gpsStr + '</code>' +
        '<button class="kta-popup-gps-copy" type="button" ' +
          'onclick="window.kta_copierGps(\'' + gpsAttr.replace(/'/g, "\\'") + '\'); return false;" ' +
          'title="Copier les coordonnées GPS">📋</button>' +
      '</div>';
  }

  return '<div class="kta-popup-point">' +
           '<b>' + safeName + '</b>' +
           (safeDesc ? '<br><span class="kta-popup-desc">' + safeDesc + '</span>' : '') +
           gpsLineHtml +
           photosSlot +
           '<div class="kta-popup-actions">' +
             '<button class="kta-popup-btn kta-popup-btn-here" type="button" ' +
               'onclick="window.recalerTrackerSurPoint(' + x + ',' + y + '); return false;" ' +
               'title="Recale ta position tracker sur ce point (équivalent du mode recalage)">' +
               '📍 Je suis ici' +
             '</button>' +
             '<button class="kta-popup-btn kta-popup-btn-aller" type="button" ' +
               'onclick="window.itineraireYAller(' + x + ',' + y + ",'" + jsName + "'); return false;\" " +
               'title="Calcule un itinéraire depuis ta position tracker vers ce point">' +
               '🧭 Y aller' +
             '</button>' +
             '<button class="kta-popup-btn kta-popup-btn-add" type="button" ' +
               'onclick="window.itineraireAjouterWaypoint(' + x + ',' + y + ",'" + jsName + "'); return false;\" " +
               'title="Ajoute ce point comme waypoint d\'un itinéraire">' +
               '➕ Itinéraire' +
             '</button>' +
             // 🆕 v1.16.0 step 3 — Favori : toggle ajout/retrait des favoris.
             // Le label et la classe initiale dépendent de l'état actuel.
             // Au clic, window.toggleFavoriPoint mute l'état + rafraîchit le
             // libellé du bouton in-place (pas de re-render du popup entier).
             '<button class="kta-popup-btn kta-popup-btn-fav' + (isFav ? ' kta-fav-active' : '') + '" type="button" ' +
               'data-fav-pointid="' + _escAttr(jsId) + '" ' +
               'onclick="window.toggleFavoriPoint(\'' + jsId + '\',' + x + ',' + y + ",'" + jsName + "','" + _firstTag + "','" + _layerId + "','" + _escAttr(_layerLabel) + "'); return false;\" " +
               'title="' + (isFav ? "Retirer des favoris" : "Mettre en favori") + '">' +
               (isFav ? '⭐ Favori' : '☆ Favori') +
             '</button>' +
           '</div>' +
           editRow +
           deleteRow +
         '</div>';
}
window.buildPointPopupHtml = buildPointPopupHtml;

// 🆕 v1.16.0 step 3 — Favori : toggle handler global appelé depuis le
// bouton ⭐ inline dans la popup. Reçoit le snapshot complet (pas juste
// l'ID) pour pouvoir construire l'entrée favori sans relookup. Refresh
// in-place le libellé du bouton dans toutes les popups ouvertes pour
// CE pointId (cas où la même popup serait référencée à plusieurs
// endroits — rare mais robuste).
window.toggleFavoriPoint = function(pointId, x, y, nom, tag, layerId, layerLabel) {
  if (!window.Favoris) return;
  const snapshot = {
    pointId:    pointId,
    nom:        nom,
    x:          x,
    y:          y,
    tag:        tag        || "default",
    layerId:    layerId    || "editor",
    layerLabel: layerLabel || ""
  };
  const res = window.Favoris.toggle(snapshot);
  // Refresh le libellé du bouton ⭐ dans la popup ouverte (ou plusieurs si
  // ce pointId apparaît à plusieurs endroits — improbable mais robuste).
  const nowFav = window.Favoris.isFav(pointId);
  document.querySelectorAll('.kta-popup-btn-fav[data-fav-pointid]').forEach(function(btn) {
    if (btn.getAttribute("data-fav-pointid") === pointId) {
      btn.textContent = nowFav ? "⭐ Favori" : "☆ Favori";
      btn.classList.toggle("kta-fav-active", nowFav);
      btn.title = nowFav ? "Retirer des favoris" : "Mettre en favori";
    }
  });
  // Toast discret (réutilise OOMGuard ou alertCharte si dispo, sinon console)
  if (window.OOMGuard && typeof window.OOMGuard.showToast === "function") {
    window.OOMGuard.showToast(
      (nowFav ? "⭐ Ajouté aux favoris : " : "☆ Retiré des favoris : ") + (nom || pointId),
      "info"
    );
  }
};

// =========================
// 📸 attachPopupPhotos(marker, pointId) — v1.9.3-B1d
// =========================
// Hydrate les miniatures photos dans le slot `.kta-popup-photos` du popup
// d'un marker. Idempotent (flag _ktaPhotosAttached sur le marker pour
// ne pas re-attacher 2 fois).
//
// Au popupopen :
//   1. Cherche le slot .kta-popup-photos dans le popup ouvert
//   2. Lit le pointId depuis data-pointid (fallback paramètre fonction)
//   3. Query MyKTAMapPhotos.getPhotosForPoint(planId, pointId)
//   4. Si N > 0 → injecte les miniatures + click handler → viewer plein écran
//   5. Si 0 → slot reste vide (CSS .kta-popup-photos:empty masque)
//
// Cleanup objectURLs au popupclose (sinon memory leak si l'user ouvre/
// ferme des popups en boucle sur des plans riches).
function attachPopupPhotos(marker, pointId) {
  if (!marker || !pointId) return;
  if (marker._ktaPhotosAttached) return;  // idempotent
  marker._ktaPhotosAttached = true;

  const _objectUrls = new Set();
  let _lastLoadedForPointId = null;

  function _cleanupUrls() {
    _objectUrls.forEach(function(u) {
      try { URL.revokeObjectURL(u); } catch(e) {}
    });
    _objectUrls.clear();
  }

  marker.on("popupopen", function(ev) {
    if (!window.MyKTAMapPhotos) return;
    // Récupère l'élément du slot dans le DOM du popup ouvert
    const popupEl = ev.popup && ev.popup.getElement ? ev.popup.getElement() : null;
    if (!popupEl) return;
    const slot = popupEl.querySelector(".kta-popup-photos");
    if (!slot) return;
    const pid = slot.getAttribute("data-pointid") || pointId;
    if (!pid) return;

    // 🔧 v1.9.3-B1d-fix2 : on FORCE le re-fetch à chaque popupopen.
    // Avant on skip si déjà chargé, mais ça causait un piège : après un
    // popupclose qui révoque les blob URLs (anti memory leak), le DOM du
    // popup gardait des <img src="blob:..."> morts → image cassée au
    // re-open. Le re-fetch IDB est rapide (~10-50ms) → coût acceptable
    // pour la robustesse. Si optim nécessaire à terme : conditionner le
    // re-fetch à l'invalidation du cache des URLs.
    _lastLoadedForPointId = pid;
    // Reset le slot pour ne pas voir l'ancien HTML flasher si le re-fetch
    // est lent (rare mais possible sur quotas IDB chargés).
    slot.innerHTML = "";
    slot.dataset.loaded = "0";

    const planId = window._currentLoadedPlanId || "default";
    window.MyKTAMapPhotos.getPhotosForPoint(planId, pid).then(function(arr) {
      if (!arr || arr.length === 0) {
        slot.innerHTML = "";
        slot.dataset.loaded = "1";
        return;
      }
      // Génère les objectURLs ET le HTML des miniatures
      const photosWithUrl = arr.map(function(rec) {
        const url = URL.createObjectURL(rec.blob);
        _objectUrls.add(url);
        return {
          id:         rec.id,
          mime:       rec.mime,
          size:       rec.size,
          createdAt:  rec.createdAt,
          _objectUrl: url
        };
      });
      // Rendu : grille de miniatures 44×44.
      // 🔧 v1.9.3-B1d-fix2 → fix4 → fix6 (KARMA "j'ai toujours le fond bleu") :
      // Historique :
      //   - fix2 : passage de background-image inline sur <button> → <img>
      //     enfant dans <button>. Fond bleu toujours visible.
      //   - fix4 : ajout box-sizing/line-height/font-size sur le button +
      //     vertical-align top sur l'img. Fond bleu RÉDUIT mais pas éliminé.
      //   - fix6 : abandon complet du <button>, on utilise un <img>
      //     cliquable direct. Plus de styles user-agent <button> à gérer
      //     (border-inset, appearance, padding-inline natif, baseline...).
      //     L'img est nativement display:inline → on force display:block
      //     en CSS pour qu'elle remplisse exactement le cadre 44×44.
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
        img.title = "Voir photo " + (idx + 1) + " / " + photosWithUrl.length;
        // role + tabindex pour l'accessibilité (la mini reste cliquable
        // au clavier / focus-visible).
        img.setAttribute("role", "button");
        img.setAttribute("tabindex", "0");
        rowEl.appendChild(img);
      });
      slot.dataset.loaded = "1";

      // Click + keyboard handler sur chaque miniature → viewer plein écran.
      // 🔧 v1.9.3-B1d-fix6 : on est maintenant sur des <img role="button">
      // (pas un vrai <button>) → il faut gérer Enter et Space au clavier
      // nous-mêmes pour l'accessibilité.
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
  });

  marker.on("popupclose", function() {
    // On garde le HTML rendu (= re-open instantané sans flicker IDB) MAIS
    // on doit révoquer les objectURLs sinon ça leak. Petit compromis : on
    // garde les URLs jusqu'à la prochaine ouverture (où _lastLoadedForPointId
    // skip le re-fetch). Pour une stratégie 100% sans leak, on reset ici :
    _cleanupUrls();
    _lastLoadedForPointId = null;
    // Le slot HTML reste mais ses background-image url(blob:...) seront
    // invalides. C'est OK car au prochain popupopen on re-hydrate.
  });
}
window.attachPopupPhotos = attachPopupPhotos;

function normaliserPoints(json) {
  if (Array.isArray(json.data))          return json.data;
  if (Array.isArray(json.editorPoints))  return json.editorPoints;
  return [];
}

// smoothFactor 2.5 : Leaflet simplifie en interne via Douglas-Peucker.
// Reduit le nombre de points dessines au pan/zoom (gain perf significatif
// sur les plans avec beaucoup de routes embedded), perte visuelle quasi
// imperceptible aux niveaux de zoom usuels. Cf. ROAD_STYLES de road.js.
const ROAD_STYLES_DATA = {
  principal:  { color: "#00ff00", weight: 5, opacity: 1, smoothFactor: 2.5 },
  secondaire: { color: "#b000ff", weight: 5, opacity: 1, smoothFactor: 2.5 },
  chemin:     { color: "#ffff00", weight: 5, opacity: 1, smoothFactor: 2.5 },
  // 🪜 v1.7.1 fix : entrée jonction manquante → fallback blanc bug. Style
  // canonique cohérent avec road.js > ROAD_STYLES.jonction (magenta pointillé).
  jonction:   { color: "#ff4ecb", weight: 5, opacity: 1, dashArray: "10 6", smoothFactor: 2.0 }
};

// 🏗️ Multi-niveau (v148) : registres globaux de TOUS les objets Leaflet des
// data layers pour appliquer le filtre runtime sans refetch. Vides a chaque
// initDataFromConfig (reset cote main.js au plan switch).
//   _ktaDataMarkers   : markers (L.marker)        — setOpacity + pointer-events
//   _ktaDataPolylines : roads embarques (polyline) — setStyle({opacity})
//   _ktaDataPolygons  : zones embarques (polygon)  — setStyle({opacity, fillOpacity})
window._ktaDataMarkers   = window._ktaDataMarkers   || [];
window._ktaDataPolylines = window._ktaDataPolylines || [];
window._ktaDataPolygons  = window._ktaDataPolygons  || [];

// Helper commun : retourne true si le level passe le filtre courant.
// MultiLevel OFF → tout visible. ON → visible ssi level ∈ visibleLevels.
function _passeFiltreDataLevel(lvl) {
  const multi = !!(window.APP_CONFIG && window.APP_CONFIG.multiLevel === true);
  if (!multi) return true;
  const visibles = (window.APP_CONFIG && Array.isArray(window.APP_CONFIG.visibleLevels))
    ? window.APP_CONFIG.visibleLevels : [0];
  return visibles.indexOf(Number.isInteger(lvl) ? lvl : 0) >= 0;
}

// 🆕 v1.21.5 (KARMA "filtre par tag/type runtime") : helpers de check des
// filtres runtime FilterPanel. Tous retournent `true` si le filtre est
// désactivé (null) → rétrocompat absolue avec le code v1.21.4.
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

// === MARKERS data layers ===
function _filtreNiveauSurMarkerData(marker) {
  if (!marker) return;
  let visible = _passeFiltreDataLevel(marker._ktaLevel);
  // 🆕 v1.21.5 : combinaison filtre tag runtime
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

// === POLYLINES data layers (routes embarquees) ===
// On stocke l'opacite originale du tracé pour pouvoir la restaurer quand le
// filtre redevient visible (sinon on perdrait l'opacite si elle est < 1).
function _filtreNiveauSurPolylineData(entry) {
  if (!entry || !entry.polyline) return;
  let visible = _passeFiltreDataLevel(entry.level);
  // 🆕 v1.21.5 : combinaison filtre runtime type road
  if (visible && entry.type) {
    if (!_passeFiltreRuntimeType("roads", entry.type)) visible = false;
  }
  try {
    entry.polyline.setStyle({ opacity: visible ? entry.origOpacity : 0 });
  } catch(e) {}
}
window._applyLevelFilterToDataRoads = function() {
  if (!Array.isArray(window._ktaDataPolylines)) return;
  window._ktaDataPolylines.forEach(_filtreNiveauSurPolylineData);
};

// === POLYGONS data layers (zones embarquees) ===
// 🆕 v1.21.5 : `kindForRuntime` permet de différencier zone vs structure
// (le même format de polygon entry est utilisé pour les 2). Passé par les
// wrappers _applyLevelFilterToDataZones / _applyLevelFilterToDataStructures.
function _filtreNiveauSurPolygonData(entry, kindForRuntime) {
  if (!entry || !entry.polygon) return;
  let visible = _passeFiltreDataLevel(entry.level);
  // 🆕 v1.21.5 : combinaison filtre runtime type zone OU structure
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

// 🆕 v1.9.3-A1.a-fix5 : symétrique pour les structures data layer.
window._applyLevelFilterToDataStructures = function() {
  if (!Array.isArray(window._ktaDataStructurePolygons)) return;
  window._ktaDataStructurePolygons.forEach(function(e) { _filtreNiveauSurPolygonData(e, "structs"); });
};

// =========================
// 🌍 GETTERS PUBLICS — embedded points (data layers) — v1.20.0-fix1
// =========================
// Symetrique de window.getEditorPoints (editor.js) : expose les points
// embarques dans les data layers (puits.json, vehicule.json, etc.) sous
// forme reutilisable par les exports + stats globales + modale Detail
// session. Sans ce helper, statsGlobales.js ne comptait QUE les points
// de session (bug remonte KARMA 25/05/2026).
//
// Source : window._ktaDataMarkers (array de markers Leaflet, alimente
// par ajouterPointsDepuisJSON ligne ~901). Chaque marker contient :
//   - getLatLng() → coordonnees Leaflet
//   - _ktaLevel  → niveau M-LVL
//   - _ktaNom    → nom du point
//   - _ktaId     → id du point
//   - _ktaTags   → tableau de tags
//
// Conversion lat/lng Leaflet → x/y plan :
//   convertCoord(x, y) = [imageHeight - y, x]  (cf js/utils.js > convertCoord)
//   Donc inverse : x = lng, y = imageHeight - lat
//
// Renvoie [{x, y, nom, id, tags, level}, ...] — meme format que
// window.getEditorPoints() (points session) pour permettre concatenation
// directe sans transformation.
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
        level: (typeof m._ktaLevel === "number") ? m._ktaLevel : 0
      };
      // 🆕 v1.21.1 (audit fix #8) : expose description embedded
      if (m._ktaDescription) item.description = m._ktaDescription;
      out.push(item);
    } catch(e) {}
  });
  return out;
};

// =========================
// 🌍 GETTERS PUBLICS — embedded zones (data layers)
// =========================
// Symetrique de window.getAllEmbeddedRoads (road.js) : expose les zones
// embarquees dans les data layers (puits.json, etc.) sous forme reutilisable
// par les exports (notamment KMZ qui doit inclure TOUT le contenu visible
// du plan, pas uniquement la session).
// Renvoie [{type, points, level}, ...] — meme format que window.getZones()
// (zones session) pour permettre une concatenation directe sans transformation.
window.getAllEmbeddedZones = function() {
  if (!Array.isArray(window._ktaDataPolygons)) return [];
  return window._ktaDataPolygons
    .filter(function(e) {
      return e && e.type && Array.isArray(e.points) && e.points.length >= 3;
    })
    .map(function(e) {
      // 🆕 v1.21.1 (audit fix #8) : expose description embedded
      const out = { type: e.type, points: e.points, level: e.level || 0 };
      if (e.description) out.description = e.description;
      return out;
    });
};

// 🆕 v1.9.3-A1.a : équivalent pour structures embarquées (lecture seule
// via data layer). Utilisé en A1.b pour la collision pathfinder (les
// structures bloquent comme les zones inaccessibles) + KMZ export
// (embarquer le contenu data layer dans le .kmz).
window.getAllEmbeddedStructures = function() {
  if (!Array.isArray(window._ktaDataStructurePolygons)) return [];
  return window._ktaDataStructurePolygons
    .filter(function(e) {
      // 🆕 v1.21.1 (audit fix #6) : seuil min de points dépend du type.
      // Fronts (front-1/front-2) = polylines = min 2 points. Piliers/mur
      // (et types custom polygon) = polygones = min 3 points. Avant le
      // filtre >= 3 strict excluait les fronts → KMZ/GPX export sans les
      // fronts data layer (alors qu'ils étaient visibles à l'écran via
      // ajouterPointsDepuisJSON qui accepte minPts = 2 pour polylines).
      if (!e || !e.type || !Array.isArray(e.points)) return false;
      const isPolyline = (e.type === "front-1" || e.type === "front-2");
      const minPts = isPolyline ? 2 : 3;
      return e.points.length >= minPts;
    })
    .map(function(e) {
      // 🆕 v1.21.1 (audit fix #8) : expose description embedded
      const out = { type: e.type, points: e.points, level: e.level || 0 };
      if (e.description) out.description = e.description;
      return out;
    });
};

// 🐛 v1.21.3 (audit P0-6) : token de génération pour annuler les rAF en
// cours quand le plan switch. Avant : une boucle rAF self-recursive pouvait
// continuer à ajouter des markers DANS LE LAYER DU PLAN PRÉCÉDENT, ce qui
// retenait des refs vers un layerGroup orphelin (fuite mémoire + zombies).
// Maintenant : chaque appel snapshot le token courant, exit silencieux si
// le token a changé entre 2 batches. Le token est bumpé par
// `_libererRessourcesPlanPrecedent` dans main.js.
window._ktaDataLayerLoadToken = window._ktaDataLayerLoadToken || 0;

// 🚀 v1.30.0 (P5 viewport culling markers POI) — Étend le toggle ULTRA
// existant `viewportCull` (déjà actif sur les polylines via road.js)
// aux markers des data layers (puits, salles, etc.).
//
// Sur les plans denses (100+ POI multi-niveaux), tous les markers étaient
// ajoutés au DOM Leaflet en permanence, même hors viewport. Pénalité GPU
// constante au pan/zoom.
//
// Stratégie miroir de `road.js > _viewportCull` :
//   - 10% de padding autour des bounds pour éviter le pop-in au pan
//   - À la création : skip `marker.addTo(layer)` si hors viewport (flag
//     `marker._ktaVpHidden = true`), mais marker conservé dans
//     `_ktaDataMarkers` pour pouvoir être réintégré au moveend
//   - Au moveend/zoomend : `_refreshDataMarkersViewport()` parcourt
//     `_ktaDataMarkers` et ajuste add/remove selon bounds
//   - Toggle OFF → tout est réintégré (graceful degradation user)
//
// Skip explicite :
//   - Tracker icon → marker singleton dans son layer dédié, pas concerné
//   - Marker en cours de création (mode édition) → géré par editor.js
//
// ⚠️ Le helper est exposé via `window` pour que editor.js, lostMode.js,
//    et secoursMode.js puissent l'utiliser sur LEURS markers spécifiques.

/**
 * Retourne true si le marker (L.marker) est dans le viewport courant
 * de window.map, élargi de `padFraction` (défaut 0.1 = 10%).
 * Safe-by-default : retourne true si window.map est indisponible
 * (évite de cacher des markers par erreur au boot).
 */
function _markerInViewportPadded(marker, padFraction) {
  if (!window.map || !marker) return true;
  try {
    const pad = (padFraction != null) ? padFraction : 0.1;
    const b = window.map.getBounds().pad(pad);
    return b.contains(marker.getLatLng());
  } catch(e) { return true; }
}
window._markerInViewportPadded = _markerInViewportPadded;

/**
 * Re-render le set de markers data layer selon le viewport courant.
 * Appelé au moveend/zoomend via hook posé par `_bindMarkerViewportHook`.
 *  - Toggle OFF (viewportCull = false) : tous les markers cachés sont
 *    réintégrés (graceful degradation)
 *  - Toggle ON  : add/remove selon position dans viewport padded
 * Idempotent (rappels successifs sans changement = no-op).
 */
window._refreshDataMarkersViewport = function() {
  // 🚀 v1.30.0 (P5) — Chaîne vers le refresh des markers session éditeur.
  // editor.js expose `window._refreshEditorMarkersViewport` qui suit le
  // même pattern (toggle OFF = graceful reintegration). On chaîne ici pour
  // qu'un seul hook moveend/zoomend serve les 2 registres de markers,
  // évitant de poser 2 listeners séparés (économie compositing GPU).
  if (typeof window._refreshEditorMarkersViewport === "function") {
    window._refreshEditorMarkersViewport();
  }

  if (!Array.isArray(window._ktaDataMarkers) || window._ktaDataMarkers.length === 0) return;
  const _vpcOn = !!(window.PerfUltra && window.PerfUltra.get("viewportCull"));

  if (!_vpcOn) {
    // Toggle OFF → réintègre tous les markers cachés (user a peut-être
    // désactivé ULTRA en cours de session, on doit revenir à l'état normal).
    window._ktaDataMarkers.forEach(function(m) {
      if (m && m._ktaVpHidden && m._ktaLayer) {
        try { m.addTo(m._ktaLayer); } catch(e) {}
        m._ktaVpHidden = false;
      }
    });
    return;
  }

  // Toggle ON → check viewport pour chaque marker, ajuste add/remove.
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

/**
 * Pose le hook moveend/zoomend sur window.map pour appeler
 * `_refreshDataMarkersViewport` automatiquement. Idempotent via flag
 * `map._mkmMarkerHookBound` — un nouveau plan = nouvelle map = nouveau bind.
 * Retourne true si bound (ou déjà bound), false si window.map indispo.
 */
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
  const _loadToken = window._ktaDataLayerLoadToken;

  // 🚀 v1.30.0 (P5 viewport culling) : pose le hook moveend/zoomend sur
  // window.map si pas déjà fait pour cette map. Idempotent via flag
  // map._mkmMarkerHookBound. Au plan switch → nouvelle map → nouveau bind.
  // Sans ce hook, les markers cachés au boot ne réapparaîtraient jamais.
  if (typeof window._bindMarkerViewportHook === "function") {
    window._bindMarkerViewportHook();
  }

  // 🆕 v1.16.0 step 3 : reverse-lookup pour identifier le calque de
  // data layer auquel appartient ce JSON. Sert au bouton ⭐ Favori
  // pour stocker le bon layerId/layerLabel dans le snapshot. Pas de
  // dependency sur un nouveau paramètre — on retrouve via la map des
  // dataLayerGroups.
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

      // Ajout par batch de 50 pour éviter de freezer le thread UI
      const BATCH = 50;
      let index = 0;

      function ajouterBatch() {
        // 🐛 v1.21.3 (audit P0-6) : abort si on a switché de plan entre 2 batches.
        // Sinon les markers atterrissent dans le layerGroup du plan précédent
        // (déjà détruit ou en cours de destruction par _libererRessourcesPlanPrecedent).
        if (_loadToken !== window._ktaDataLayerLoadToken) return;
        const fin = Math.min(index + BATCH, points.length);
        for (let i = index; i < fin; i++) {
          const p = points[i];
          var marker = L.marker(convertCoord(p.x, p.y), { icon: choisirIcone(p) });
          // 🚀 PerfUltra noTooltips : skip le bindPopup sur les markers de
          // data layers (read-only). Les points de session éditeur restent
          // interactifs. Gain : event listener + popup HTML init en moins
          // par marker, multiplié par des milliers de points sur gros plans.
          // Compromis : user doit utiliser 🔍 Recherche pour interagir avec.
          const _skipPopup = !!(window.PerfUltra && window.PerfUltra.get("noTooltips"));
          if (!_skipPopup) {
            // Popup avec boutons "Y aller" / "Itinéraire" — helper commun.
            // 2e argument false → point d'un data layer (lecture seule), pas
            // de bouton "🗑️ Supprimer" affiche.
            // 🆕 v1.16.0 step 3 : 3e arg = layerInfo pour le bouton ⭐ Favori
            const popupHtml = (typeof window.buildPointPopupHtml === "function")
              ? window.buildPointPopupHtml(p, false, _layerInfo)
              : ("<b>" + (p.nom || "") + "</b><br>" + (p.description || ""));
            marker.bindPopup(popupHtml, window.KTA_POPUP_OPTS);
            // 📸 v1.9.3-B1d : hydrate les miniatures photos dans le popup à
            // l'ouverture. Pour les data layers, ça permet de voir les
            // photos quand l'user import un plan ZIP qui en contient
            // (workflow B1.d.γ à venir). Pour B1.d.α actuel, les data
            // layers n'ont pas de photos donc le slot reste invisible.
            if (typeof window.attachPopupPhotos === "function") {
              window.attachPopupPhotos(marker, String(p.id || ""));
            }
          }

          // 🏗️ Multi-niveau (v148) : si le point JSON contient un champ
          // `level`, on le stocke sur le marker pour le filtre runtime.
          // Absent (cas usuel sur plans v147) → traite comme level 0.
          marker._ktaLevel = Number.isInteger(p.level) ? p.level : 0;
          // 🌍 v169 (Karma_dev) : on stocke aussi nom + tags + id pour que
          // KmzExport puisse construire les Placemarks KML (label + style icone).
          // Sans ça, les data layers sortiraient anonymes dans le KMZ.
          marker._ktaNom  = p.nom || "";
          marker._ktaId   = p.id  || "";
          marker._ktaTags = Array.isArray(p.tags) ? p.tags : [];
          // 🆕 v1.21.1 (audit fix #8) : description embarquée pour KMZ/GPX export
          // (cohérent avec _ktaDataPolylines/Polygons/Structures).
          marker._ktaDescription = p.description || "";
          window._ktaDataMarkers.push(marker);
          _filtreNiveauSurMarkerData(marker);  // applique le filtre courant

          // 🔍 v174 : double-clic sur le marker → zoom flyTo dessus
          attachMarkerDblClickZoom(marker);

          // 🚀 v1.30.0 (P5 viewport culling) : skip le addTo si hors viewport
          // et toggle viewportCull actif. Le marker reste référencé dans
          // _ktaDataMarkers et sera réintégré au moveend/zoomend via
          // _refreshDataMarkersViewport(). Trace le layer cible pour
          // pouvoir réintégrer plus tard.
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

      // Routes embarquées en lecture seule dans le même layer.
      // 🏗️ v169 (Karma_dev) : tri Z-index ascending par level si multiLevel ON.
      // Cohérent avec le tri dans road.js > renderRoads — "galerie niveau N
      // toujours sous celles du niveau N+1". Au sein du même niveau :
      // chemin < secondaire < principal (Principal dessus). Si multiLevel OFF
      // → ordre d'origine du JSON conservé (v147 strict).
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
        // 🐛 v1.34.14 — Track si on a register au moins une road embedded.
        // À la fin du forEach, si oui, on trigger UN SEUL renderRoads (au lieu
        // de N renderRoads via registerEmbeddedRoad pour chaque road, ce qui
        // causait 150+ renderRoads en boucle au boot pour des plans avec
        // beaucoup de roads embarquées).
        let _ktaEmbeddedRoadRegistered = false;
        roadsToRender.forEach(function(road) {
          if (!road.points || road.points.length < 2) return;
          const style = ROAD_STYLES_DATA[road.type] || { color: "#ffffff", weight: 5, opacity: 1 };
          const latlngs = road.points.map(function(p) { return convertCoord(p.x, p.y); });
          // v1.16.0 step 1 — si une note (description) est embarquée dans le
          // data layer, on rend la polyline interactive pour binder un popup
          // readonly. Sinon : interactive:false (comportement d'avant — pas
          // d'intrusion au clic).
          // v1.16.0 step 1c — on garde la polyline visible non-interactive
          // (rendu inchangé) et on ajoute une ghost TRANSPARENTE épaisse
          // par-dessus uniquement si note présente. Ergonomie clic mobile.
          const hasNoteRO = !!(road.description && String(road.description).trim());
          const polyline = L.polyline(latlngs, Object.assign({}, style, { interactive: false })).addTo(layer);
          if (hasNoteRO && typeof window.attacherNotePopup === "function") {
            // 🐛 v1.16.0 step2-drawable-fix2 : titre popup résolu via LC
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
                principal:  "🟩 Tracé principal",
                secondaire: "🟪 Tracé secondaire",
                chemin:     "🟨 Chemin",
                jonction:   "🪜 Jonction interniveau",
                itinerary:  "🗺️ Itinéraire"
              };
              return LBL[t] || ("Tracé " + t);
            }
            const ghostRO = L.polyline(latlngs, {
              weight:              Math.max((style.weight || 3) + 14, 18),
              opacity:             0,
              interactive:         true,
              bubblingMouseEvents: false
            });
            // v1.16.0 step 1d : on n'attache le ghost à la map QUE si aucun
            // mode édition n'est actif maintenant. Sinon il sera attaché plus
            // tard par _kta_syncDataLayerNoteGhosts quand le mode s'arrête.
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
          // 🏗️ Multi-niveau (v148) : registre pour filtre runtime. Si le JSON
          // de la route contient un champ `level`, on l'utilise. Sinon = 0.
          // 🆕 v1.21.1 (audit fix #8) : stocke aussi type + points + description
          // pour que getAllEmbeddedRoads expose les méta complètes au KMZ/GPX
          // export. Avant : description perdue à l'export embedded data layers.
          const entry = {
            polyline:    polyline,
            type:        road.type,
            points:      road.points,
            level:       Number.isInteger(road.level) ? road.level : 0,
            description: road.description || undefined,
            origOpacity: style.opacity ?? 1
          };
          window._ktaDataPolylines.push(entry);
          _filtreNiveauSurPolylineData(entry);  // applique le filtre courant
          // Enregistrer dans road.js avec la référence au layerGroup du calque,
          // pour que les intersections se filtrent par visibilité (toggle calques).
          // 🐛 v1.34.14 — skipRender=true : on évite N renderRoads en boucle
          // pendant le batch. Un seul renderRoads est trigger à la fin de la
          // boucle (via _renderRoadsThrottled ou window.appliquerFiltreNiveau).
          if (typeof window.registerEmbeddedRoad === "function") {
            window.registerEmbeddedRoad(road, layer, true);
            _ktaEmbeddedRoadRegistered = true;
          }

          // 🪜 v1.7.1 fix : ronds magenta aux extrémités des jonctions embedded
          // (parité visuelle avec road.js > renderRoads pour les jonctions session).
          // Sans ces ronds, les jonctions interniveau converties en data layer
          // perdaient leur signalétique d'extrémité (where start/end visually).
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
              // On l'enregistre dans _ktaDataPolylines avec le même level que la
              // polyline parente pour que le filtre niveau s'applique aussi à
              // ces marqueurs (sinon ils restent visibles quand la jonction est
              // filtrée → incohérence visuelle).
              window._ktaDataPolylines.push({
                polyline:    cm,
                level:       entry.level,
                origOpacity: 1
              });
            });
          }
        });
        // 🐛 v1.34.14 — Render UNE FOIS à la fin du batch (au lieu de N fois
        // dans la boucle via registerEmbeddedRoad). Skip si pas de road
        // registered. Le check `window.roadInitialized` reste safe : si
        // road.js n'est pas encore prêt, on no-op (cohérent avec le check
        // dans registerEmbeddedRoad lui-même).
        if (_ktaEmbeddedRoadRegistered && window.map && window.roadInitialized &&
            typeof window.renderRoads === "function") {
          window.renderRoads();
        }
      }

      // 🆕 v1.9.3-A1.a : Structures embarquées (piliers + murs) en lecture
      // seule dans le même layer. Architecture STRICTEMENT calquée sur les
      // zones data layer ci-dessous — structure.json est un data layer
      // comme un autre (id "structure" dans plan-config.json), pas un
      // fichier hardcoded. Son nom est conventionnel.
      // Tri Z-index : mur (arrière) → pilier 1ère masse → pilier 2e masse
      // (avant), cohérent avec le rendu session dans structures.js.
      if (Array.isArray(json.structures) && json.structures.length > 0) {
        // Mêmes styles que dans structures.js > STRUCTURE_STYLES, dupliqués
        // ici pour le data layer (lecture seule, interactive: false).
        // Cohérent avec la duplication ZONE_STYLES ↔ ZONE_STYLES_DATA.
        const STRUCTURE_STYLES_DATA = {
          // 🟡 1ère masse : jaune (couleur charte MKM)
          "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.85, weight: 3, opacity: 1 },
          // 🟠 2e masse : orange
          "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.85, weight: 3, opacity: 1 },
          // 🔵 Mur : bleu foncé
          "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.85, weight: 3, opacity: 1 },
          // 🆕 v1.9.3-A1.b.2 : fronts de taille — POLYLINES épaisses sans
          // contour.
          // 🔧 v1.10.1-hotfix2 (KARMA "si orange = 2e masse, le front orange
          // = 2e masse") : couleurs alignées sur les piliers (front-1 jaune
          // comme pilier-1, front-2 orange comme pilier-2). Avant inversées.
          "front-1":  { color: "#f4c542", weight: 10, opacity: 1, isPolyline: true },
          "front-2":  { color: "#ff9933", weight: 10, opacity: 1, isPolyline: true }
        };
        // 🆕 v1.10.0-hotfix1 (KARMA "fronts au-dessus des piliers + logique
        // de niveau") : nouvel ordre Z mur < pilier-2 < pilier-1 < front-2 <
        // front-1 (fronts en avant-plan, plus visibles). En mode multi-niveau,
        // tri primaire par level ascendant (niveau bas en arrière) avant le
        // tri par type. Cohérent avec structures.js > renderStructures et
        // pattern roads (CLAUDE.md §31.5).
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
        // Registre dédié pour le filtre multi-niveau runtime (équivalent
        // _ktaDataPolygons pour zones). Créé paresseusement au 1er load.
        if (!Array.isArray(window._ktaDataStructurePolygons)) {
          window._ktaDataStructurePolygons = [];
        }
        structuresTriees.forEach(function(structure) {
          // 🆕 v1.9.3-A1.b.2 : min points dépend du type (2 pour polyline, 3 pour polygon)
          const isPolyline = !!STRUCTURE_STYLES_DATA[structure.type]?.isPolyline;
          const minPts = isPolyline ? 2 : 3;
          if (!structure.points || structure.points.length < minPts) return;
          const style = STRUCTURE_STYLES_DATA[structure.type] || STRUCTURE_STYLES_DATA["mur"];
          const latlngs = structure.points.map(function(p) { return convertCoord(p.x, p.y); });
          // v1.16.0 step 1 + 1c — note readonly conditionnelle + ghost
          // transparent épais pour les polylines (fronts) si note présente.
          const hasNoteROStruct = !!(structure.description && String(structure.description).trim());
          let leafletLayer;
          if (isPolyline) {
            // Front de taille : polyline épaisse visible non-interactive
            // (ghost en dessus si note pour ergonomie clic).
            leafletLayer = L.polyline(latlngs, {
              color:    style.color,
              weight:   style.weight,
              opacity:  style.opacity,
              lineCap:  "round",
              lineJoin: "round",
              interactive: false
            }).addTo(layer);
          } else {
            // Pilier / mur : polygone rempli (l'aire capte les clics directement)
            leafletLayer = L.polygon(latlngs, Object.assign({}, style, { interactive: hasNoteROStruct })).addTo(layer);
          }
          if (hasNoteROStruct && typeof window.attacherNotePopup === "function") {
            // 🐛 v1.16.0 step2-drawable-fix2 : titre popup résolu via LC
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
                "pilier-1": "🟡 Pilier 1ère masse",
                "pilier-2": "🟠 Pilier 2e masse",
                "mur":      "🔵 Mur",
                "front-1":  "🟨 Front de taille 1ère masse",
                "front-2":  "🟧 Front de taille 2e masse"
              };
              return LBL[t] || ("Structure " + t);
            }
            let cibleStructRO = leafletLayer;
            if (isPolyline) {
              // Ghost transparente épaisse pour ergonomie clic sur le front
              const ghostStructRO = L.polyline(latlngs, {
                weight:              Math.max((style.weight || 10) + 12, 22),
                opacity:             0,
                interactive:         true,
                bubblingMouseEvents: false
              });
              // v1.16.0 step 1d : attach conditionnel (cf roads ci-dessus)
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
          // Note : on garde le nom `polygon` dans l'entry pour rétrocompat
          // avec _filtreNiveauSurPolygonData qui lit entry.polygon. Le
          // polyline Leaflet supporte setStyle aussi → no breakage.
          const entry = {
            polygon:         leafletLayer,
            type:            structure.type,
            points:          structure.points,
            level:           Number.isInteger(structure.level) ? structure.level : 0,
            // 🆕 v1.21.1 (audit fix #8) : description embarquée pour KMZ/GPX export
            description:     structure.description || undefined,
            origOpacity:     style.opacity     ?? 1,
            origFillOpacity: style.fillOpacity ?? 0.85
          };
          window._ktaDataStructurePolygons.push(entry);
          _filtreNiveauSurPolygonData(entry);
        });
      }

      // Zones embarquées en lecture seule dans le même layer
      // Tri : eau (arrière) → remblais → effondrement (avant)
      if (Array.isArray(json.zones) && json.zones.length > 0) {
        const ZONE_STYLES_DATA = {
          eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7, weight: 3, opacity: 1 },
          remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7, weight: 3, opacity: 1 },
          effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7, weight: 3, opacity: 1 },
          // 🚫 v169 : zone inaccessible — pattern hachures rouge/noir 45° (id
          // SVG defini dans index.html). Force renderer SVG (canvas ignore).
          inaccessible: { color: "#5a0a0a", fillColor: "url(#kta-pattern-inaccessible)", fillOpacity: 1, weight: 3, opacity: 1 }
        };
        const zonesTriees = [...json.zones].sort(function(a, b) {
          const ordre = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
          return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
        });
        // v169 : singleton SVG renderer pour les zones inaccessibles data layer.
        // Cree une seule fois et reutilise pour tous les polygons inaccessibles
        // de tous les data layers.
        if (!window._inaccessibleDataRenderer) {
          window._inaccessibleDataRenderer = L.svg({ padding: 0.5 });
        }
        zonesTriees.forEach(function(zone) {
          if (!zone.points || zone.points.length < 3) return;
          const style = ZONE_STYLES_DATA[zone.type] || ZONE_STYLES_DATA.remblais;
          const latlngs = zone.points.map(function(p) { return convertCoord(p.x, p.y); });
          // v1.16.0 step 1 — note readonly conditionnelle (cf roads/structures ci-dessus)
          const hasNoteROZone = !!(zone.description && String(zone.description).trim());
          const polyOpts = (zone.type === "inaccessible")
            ? Object.assign({}, style, { interactive: hasNoteROZone, renderer: window._inaccessibleDataRenderer })
            : Object.assign({}, style, { interactive: hasNoteROZone });
          const polygon = L.polygon(latlngs, polyOpts).addTo(layer);
          if (hasNoteROZone && typeof window.attacherNotePopup === "function") {
            // 🐛 v1.16.0 step2-drawable-fix2 : titre popup résolu via LC
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
          // 🏗️ Multi-niveau (v148) : registre pour filtre runtime.
          // 🚫 v169 (Karma_dev) : on stocke aussi `type` et `points` (coords
          // plan x/y) pour que Pathfinder puisse identifier les zones
          // inaccessibles dans les data layers et les utiliser comme contrainte
          // dure (= polygon bloque les segments qui le traversent).
          const entry = {
            polygon:         polygon,
            type:            zone.type,
            points:          zone.points,
            level:           Number.isInteger(zone.level) ? zone.level : 0,
            // 🆕 v1.21.1 (audit fix #8) : description embarquée pour KMZ/GPX export
            description:     zone.description || undefined,
            origOpacity:     style.opacity     ?? 1,
            origFillOpacity: style.fillOpacity ?? 0.7
          };
          window._ktaDataPolygons.push(entry);
          _filtreNiveauSurPolygonData(entry);
        });
      }

      // 🏗️ v154 : auto-extension de availableLevels si le data layer contient
      // des items au-dela du range default. Les roads et zones sont deja
      // inscrites synchroniquement ; les markers le sont par batches async,
      // mais le 1er batch suffit dans 99% des cas (les niveaux extremes sont
      // rarement isoles en fin de JSON). Si vraiment necessaire, l'user peut
      // toujours etendre manuellement via les boutons +/- de la modale.
      if (typeof window._etendreAvailableLevelsSiBesoin === "function") {
        try { window._etendreAvailableLevelsSiBesoin(); } catch(e) {}
      }
    })
    .catch(function(err) {
      console.warn("[Data] Erreur chargement", url, err);
    });
}

async function telechargerPlan() {
  try {
    const config = window.PLAN_CONFIG;
    if (!config || !config.plan) {
      alert("Configuration du plan introuvable");
      return;
    }

    const width = config.plan.imageWidth;
    const height = config.plan.imageHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // fond blanc optionnel
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // ---------- helpers ----------
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

    // ---------- image principale ----------
    const baseImg = await loadImage(config.plan.baseImage);
    ctx.drawImage(baseImg, 0, 0, width, height);

    // ---------- overlays image visibles ----------
    if (config.imageLayers && Array.isArray(config.imageLayers)) {
      const sortedImageLayers = [...config.imageLayers].sort((a, b) => a.order - b.order);

      for (const layerConfig of sortedImageLayers) {
        // on essaye de retrouver l'overlay Leaflet visible
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

        // si visible dans la carte on le dessine
        if (leafletLayerVisible) {
          const overlayImg = await loadImage(layerConfig.file);
          ctx.drawImage(overlayImg, 0, 0, width, height);
        }
      }
    }

    // ---------- icônes ----------
    const iconCache = {};

    async function getIconForPoint(point) {
      // Cascade complète : plan-config.icons[tag] → _iconMap[tag] → default → null
      let iconPath = getIconUrlForPoint(point);

      // Filet de sécurité ultime : icône par défaut classique
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

      // Toutes les icônes sont en 50×50 avec ancrage centré
      drawMarkerImage(img, point.x, point.y, 50, 50, 25, 25);
    }

    // ---------- helpers polygones (pour zones) ----------
    function drawPolygon(points, style) {
      if (!points || points.length < 3) return;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, toCanvasY(points[0].y));
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, toCanvasY(points[i].y));
      }
      ctx.closePath();

      // Remplissage
      ctx.fillStyle   = style.fillColor || style.color || "#888888";
      ctx.globalAlpha = style.fillOpacity ?? 0.35;
      ctx.fill();

      // Bordure
      ctx.strokeStyle = style.color || "#888888";
      ctx.lineWidth   = style.weight || 2;
      ctx.globalAlpha = style.opacity ?? 0.6;
      ctx.lineJoin    = "round";
      ctx.stroke();

      ctx.restore();
    }

    // ---------- couches JSON visibles ----------
    // Pour chaque calque : data[] (markers) + roads[] + zones[] embarqués
    // (cohérent avec ajouterPointsDepuisJSON qui les affiche à l'écran)
    const ZONE_STYLES_EMBED = {
      eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      // v169 : zone inaccessible — rouge fonce uni pour l'export PNG (canvas
      // ne supporte pas le pattern SVG inline ; on perd l'effet hachures mais
      // la signification "zone interdite" reste claire visuellement)
      inaccessible: { color: "#5a0a0a", fillColor: "#7a0000", fillOpacity: 0.65, weight: 3, opacity: 1 }
    };
    const ROAD_STYLES_EMBED = {
      principal:   { color: "#00ff00", weight: 5, opacity: 1 },
      secondaire:  { color: "#b000ff", weight: 5, opacity: 1 },
      chemin:      { color: "#ffff00", weight: 5, opacity: 1 },
      // 🪜 v1.7.1 fix : entrée jonction manquante. Pas de dashArray dans canvas
      // export (ctx.setLineDash requis). Ronds magenta aux extrémités gérés
      // séparément ci-dessous comme pour les jonctions de session.
      jonction:    { color: "#ff4ecb", weight: 5, opacity: 1 }
    };

    // Collecte des routes (embedded + editable) pour dessiner les cercles d'intersection à la fin
    const allRoadsForIntersect = [];
    // Markers DIFFÉRÉS : collectés ici, dessinés APRÈS les routes + cercles
    // → respecte l'ordre ZONE → TRAIT → CERCLE → ICÔNE
    const deferredMarkers = []; // [{point, layerId}]

    // Compteurs diagnostic (activés si APP_CONFIG.debugMode)
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
            // 🏗️ Multi-niveau : WYSIWYG (filtre visibleLevels si actif)
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

          // Zones embarquées (arrière-plan) — triées eau → remblais → effondrement → inaccessible
          // 🏗️ Multi-niveau (v148) : WYSIWYG → filtre par visibleLevels si feature ON.
          if (Array.isArray(json.zones) && json.zones.length > 0) {
            const ordreZ = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
            [...json.zones].sort(function(a, b) {
              return (ordreZ[a.type] ?? 99) - (ordreZ[b.type] ?? 99);
            }).forEach(function(z) {
              if (typeof window.passeFiltreNiveau === "function" && !window.passeFiltreNiveau(z)) return;
              drawPolygon(z.points || [], ZONE_STYLES_EMBED[z.type] || ZONE_STYLES_EMBED.remblais);
              _diag.embZones++;
            });
          }

          // 🆕 v1.10.3-structures-embed-fix (KARMA "structures bien
          // incluses ?") : Structures embarquées (piliers + mur + fronts)
          // dans le mode export rapide. Trou découvert post-update v1.9.3 :
          // ajouterPointsDepuisJSON (runtime Leaflet) les affichait bien,
          // mais telechargerPlan ne les dessinait pas dans le canvas.
          // Tri Z + couleurs cohérents avec utils.js > ajouterPointsDepuisJSON
          // et exporter.js > _genererCanvasExport (mode avancé).
          if (Array.isArray(json.structures) && json.structures.length > 0) {
            const STRUCT_STYLES_EMBED = {
              "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.85, weight: 3, opacity: 1 },
              "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.85, weight: 3, opacity: 1 },
              "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.85, weight: 3, opacity: 1 },
              // Fronts = polylines épaisses, pas de fill, color cohérent avec piliers
              "front-1":  { color: "#f4c542", weight: 10, opacity: 1, isPolyline: true },
              "front-2":  { color: "#ff9933", weight: 10, opacity: 1, isPolyline: true }
            };
            // Tri Z hotfix v1.10.0-hotfix1 : mur < pilier-2 < pilier-1 < front-2 < front-1
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
              const style = STRUCT_STYLES_EMBED[s.type] || STRUCT_STYLES_EMBED["mur"];
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

          // Routes embarquées
          // 🏗️ v169 (Karma_dev) : tri Z-index ascending par level si multiLevel ON.
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
              drawPolyline(r.points, ROAD_STYLES_EMBED[r.type] || { color: "#ffffff", weight: 5, opacity: 1 });
              allRoadsForIntersect.push(r);
              _diag.embRoads++;
            });
          }

          // Markers DIFFÉRÉS (au lieu de drawPoint immédiat)
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

    // ---------- zones (avant les tracés pour qu'elles soient en arrière-plan) ----------
    // 🏗️ Multi-niveau : filtre par visibleLevels si actif (WYSIWYG export).
    const zones = (window.getZones ? window.getZones() : []).filter(function(z) {
      return typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau(z);
    });
    const ZONE_STYLES_EXPORT = {
      eau:          { color: "#0066aa", fillColor: "#3aa9e8", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      remblais:     { color: "#3a3a44", fillColor: "#5a5a68", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      effondrement: { color: "#cc0000", fillColor: "#ff3333", fillOpacity: 0.7,  weight: 3, opacity: 1 },
      // v169 : zone inaccessible — rouge fonce uni (canvas-only fallback, cf
      // commentaire dans ZONE_STYLES_EMBED ci-dessus pour le contexte hachures)
      inaccessible: { color: "#5a0a0a", fillColor: "#7a0000", fillOpacity: 0.65, weight: 3, opacity: 1 }
    };
    for (const zone of [...zones].sort(function(a, b) {
      const ordre = { eau: 0, remblais: 1, effondrement: 2, inaccessible: 3 };
      return (ordre[a.type] ?? 99) - (ordre[b.type] ?? 99);
    })) {
      const style = ZONE_STYLES_EXPORT[zone.type] || ZONE_STYLES_EXPORT.remblais;
      drawPolygon(zone.points || [], style);
    }

    // ---------- 🆕 v1.10.3-structures-session-fix (KARMA "structures bien
    // incluses ?") : structures SESSION (piliers + mur + fronts) dans le
    // mode export rapide. Trou identique au bloc embedded ci-dessus :
    // découvert post-update v1.9.3, telechargerPlan ne dessinait pas du
    // tout les structures (ni session ni embedded). Le rendu canvas se
    // place entre zones (en-dessous) et routes (au-dessus) — cohérent
    // avec le runtime Leaflet et l'export PNG avancé. ----------
    if (window.getStructures) {
      const structures = window.getStructures().filter(function(s) {
        return typeof window.passeFiltreNiveau !== "function" || window.passeFiltreNiveau(s);
      });
      if (structures.length > 0) {
        const STRUCT_STYLES_SESSION = {
          "pilier-1": { color: "#000000", fillColor: "#f4c542", fillOpacity: 0.85, weight: 3, opacity: 1 },
          "pilier-2": { color: "#000000", fillColor: "#ff9933", fillOpacity: 0.85, weight: 3, opacity: 1 },
          "mur":      { color: "#000000", fillColor: "#1e3a8a", fillOpacity: 0.85, weight: 3, opacity: 1 },
          "front-1":  { color: "#f4c542", weight: 10, opacity: 1, isPolyline: true },
          "front-2":  { color: "#ff9933", weight: 10, opacity: 1, isPolyline: true }
        };
        // Tri Z hotfix v1.10.0-hotfix1 : mur < pilier-2 < pilier-1 < front-2 < front-1
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
          const style = STRUCT_STYLES_SESSION[s.type] || STRUCT_STYLES_SESSION["mur"];
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

    // ---------- routes ----------
    // ⚠️ On EXCLUT le type "itinerary" : c'est un calcul Pathfinder dérivé du
    // réseau, pas une vraie route. Sans ce filtre, le fallback "white" plus bas
    // dessinait l'itinéraire en blanc PAR-DESSUS les routes colorées sous-jacentes,
    // ce qui les "effaçait" visuellement dans l'export.
    // 🏗️ Multi-niveau : filtre WYSIWYG (jonctions visibles si fromLevel/toLevel ∈ visibles).
    // 🏗️ v169 : tri Z-index ascending par level si multiLevel ON (cohérent
    // avec road.js > renderRoads). Niveau bas en arrière, haut au-dessus.
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
    const ROAD_STYLES = {
      principal:   { color: "#00ff00", weight: 5, opacity: 1 },
      secondaire:  { color: "#b000ff", weight: 5, opacity: 1 },
      chemin:      { color: "#ffff00", weight: 5, opacity: 1 },
      // Jonction : magenta cohérent avec on-map render. Pas de dashArray dans
      // canvas (ctx.setLineDash requis) → plein pour l'export. Endpoints
      // marqués par des ronds blanc+magenta plus bas.
      jonction:    { color: "#ff4ecb", weight: 5, opacity: 1 }
    };

    for (const road of roads) {
      drawPolyline(road.points || [], ROAD_STYLES[road.type] || { color: "white", weight: 5, opacity: 1 });
      // 🏗️ Multi-niveau : ronds aux extremites des jonctions (parite avec on-map)
      // Convention export rapide : x direct + toCanvasY pour y.
      if (road.type === "jonction" && road.points && road.points.length >= 2) {
        const endpts = [road.points[0], road.points[road.points.length - 1]];
        endpts.forEach(function(pt) {
          ctx.save();
          ctx.fillStyle   = "#ffffff";
          ctx.strokeStyle = ROAD_STYLES.jonction.color;
          ctx.lineWidth   = 3;
          ctx.beginPath();
          ctx.arc(pt.x, toCanvasY(pt.y), 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });
      }
      // Jonctions exclues du calcul d'intersection (pas de cercle de croisement
      // pour les bridges interniveau — cf. road.js logique de filtre).
      if (road.type === "jonction") continue;
      if (road.points && road.points.length >= 2) allRoadsForIntersect.push(road);
    }

    // ---------- cercles d'intersection (dessinés APRÈS toutes les routes, AVANT les icônes) ----------
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

    // ---------- markers DIFFÉRÉS (icônes) — dessinés EN DERNIER (au-dessus des traits + cercles)
    // → respecte l'ordre demandé : ZONE (en bas) → TRAIT → CERCLE → ICÔNE (en haut)
    // Chaque marker est try/catché individuellement : un icône qui rate à charger
    // ne doit PAS faire échouer l'ensemble de l'export (on perd un point, pas le plan).
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

    // ---------- mesure (distance + surface) ----------
    // 📐 Polyline distance (legacy)
    const measurePoints = window.getMeasurePoints ? window.getMeasurePoints() : [];
    drawPolyline(measurePoints, { color: "red", weight: 3, opacity: 1 });
    // ⬛ Polygone surface (v1.12.0-fix) — fill semi-transparent rouge, même
    // teinte que la polyline pour cohérence visuelle, avec stroke plein.
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

    // ---------- tracker (chemin parcouru + position courante) ----------
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

    // ---------- export ----------
    // Promesse autour de toBlob avec fallback JPEG si PNG échoue.
    //
    // POURQUOI le fallback : sur de gros plans (typiquement plans JPG en source —
    // souvent plus grands que les PNG car JPG compresse bien à l'upload),
    // l'encodage PNG du canvas final exige width × height × 4 bytes de RAM en
    // continu. Safari iOS / Chrome Android refusent au-delà de ~250-400 Mo
    // bruts (≈ 8000×8000 px) et retournent null silencieusement.
    //
    // JPEG est progressif (streamé bloc par bloc) et tolère des dimensions
    // bien plus grandes — on l'utilise comme fallback pour ne pas laisser
    // l'utilisateur avec une erreur cryptique alors qu'on peut produire un
    // fichier exploitable.
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
        throw new Error(
          "Export impossible : le plan est trop grand pour être encodé par le navigateur " +
          "(PNG et JPEG ont tous deux échoué). Essaye le 🎨 Mode avancé avec une " +
          "résolution réduite (½ ou ¼) pour contourner la limite mémoire."
        );
      }
    }

  } catch (err) {
    // Re-throw pour que l'appelant (modale Export) affiche l'erreur dans son zone
    // dédiée plutôt qu'un alert qui peut être masqué par la fermeture de la modale.
    console.error("[Export rapide] ERREUR :", err);
    throw err;
  }
}

window.telechargerPlan = telechargerPlan;

// =========================================================================
// 🆕 v1.31.6 — UX4 a11y : gestion globale Escape pour les modales
// =========================================================================
// Listener unique au document. Pattern :
//   1. Trouve l'overlay modal le PLUS HAUT (z-index max) parmi une liste
//      blanche d'overlays connus (modales fonctionnelles, PAS les gates).
//   2. Tente de cliquer son bouton de fermeture (sélecteurs charte).
//   3. Sinon dispatch un clic sur l'overlay lui-même (pattern "clic dehors"
//      déjà géré par de nombreuses modales).
//
// 10 modules concernés (cf ui.md §88.2) : batteryGuard, debug, editor,
// interfaceDistanceTotale, interfaceDocs, interfaceItineraire,
// interfaceLegende, interfaceMaintenance, legendCustomization, copyright.
//
// ⚠️ Liste blanche STRICTE : on EXCLUT les gates de sécurité (UnlockGate,
// PinLock) et le splash boot. Sinon Escape bypasserait une protection ou
// interromprait un boot critique.
//
// Pattern défensif : try/catch sur chaque opération. Un Escape qui plante
// NE doit JAMAIS casser l'application. C'est de l'a11y, pas du contrôle
// de flux métier.
// =========================================================================
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
    "[data-kta-close-modal]",     // marqueur explicite (futur)
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
        if (z > topZ) {
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

    // 1. Bouton close prioritaire
    var btn = _findCloseButton(overlay);
    if (btn) {
      try {
        btn.click();
        e.preventDefault();
        return;
      } catch (err) { /* fall-through */ }
    }

    // 2. Sinon clic dispatché sur l'overlay (pattern "clic dehors")
    try {
      var clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
      overlay.dispatchEvent(clickEvent);
      e.preventDefault();
    } catch (err) { /* swallow — a11y ne doit pas casser l'app */ }
  }

  document.addEventListener("keydown", _onKeydown);
})();
