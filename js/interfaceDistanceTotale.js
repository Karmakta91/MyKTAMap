/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE DISTANCE TOTALE — somme des longueurs des tracés + surlignage magenta
// =========================
// Somme des polylines du plan (session + calques embarqués), par type (built-in puis custom), filtrable par
// cases ; tronçons inclus surlignés en magenta avec halo (comme l'itinéraire, couleur distincte). Exclus :
// `itinerary` (calcul dérivé) et `jonction` (passage entre niveaux, pas une distance en galerie).
// Expose : ouvrirRoadsDistanceFloater() (bascule ; fermer GARDE le surlignage) · _rdEffacerHighlight()
//   (main.js, avant changement de plan) · getDistanceTotaleStatus() → null | { totalM, breakdown } (barre
//   d'état, même modale fermée) · _rdOnRoadsChanged() (road.js > renderRoads, overlayadd/remove).
// Dépend de : getRoads, getAllEmbeddedRoads, APP_CONFIG.scale, formatDistance, convertCoord, ktaResolveStyle.

const _RD_TYPES_BUILTIN = ["principal", "secondaire", "chemin"];

// Types calculés sur les tracés PRÉSENTS à chaque ouverture, built-in d'abord puis customs dans l'ordre de
// découverte : une liste figée aux built-in afficherait 0 m pour un plan tracé en types custom.
function _rdTypesPresents() {
  const session  = (window.getRoads            ? window.getRoads()            : []) || [];
  const embedded = (window.getAllEmbeddedRoads ? window.getAllEmbeddedRoads() : []) || [];
  const types = _RD_TYPES_BUILTIN.slice();
  session.concat(embedded).forEach(function(r) {
    if (r && typeof r.type === "string" && r.type.indexOf("cust-") === 0 &&
        types.indexOf(r.type) === -1) {
      types.push(r.type);
    }
  });
  return types;
}

// Libellé d'un type : custom → nom choisi dans la légende.
function _rdLabelType(type) {
  if (String(type).indexOf("cust-") === 0) {
    const LC = window.LegendCustomization;
    if (LC && typeof LC.findCustomEntry === "function") {
      try {
        const e = LC.findCustomEntry(type);
        if (e && e.label) return "✨ " + e.label;
      } catch(err) {}
    }
    return type;
  }
  return window.I18n.t("disttot.type." + type);
}
// Magenta = couleur de la jonction (cohérence voulue), résolu à l'APPEL : lu au load, il figerait la valeur
// avant un override de légende.
function _rdHighlightHex() {
  return (typeof window.ktaSwatchColor === "function" && window.ktaSwatchColor("traces", "jonction")) || "#ff4ecb";
}
function _rdSwatch(type) {
  return (typeof window.ktaSwatchColor === "function" && window.ktaSwatchColor("traces", type)) || "#888888";
}

let _rdFloater         = null;
let _rdHighlightLayer  = null;  // L.layerGroup contenant les polylines magenta
let _rdFiltres         = { principal: true, secondaire: true, chemin: true };

// Toutes les roads utiles (session + TOUTES les embarquées, masquées comprises). ⚠️ getAllEmbeddedRoads, pas
// getEmbeddedRoads (comme Pathfinder et la recherche) : masquer un calque ne doit pas fausser le total.
function _rdRoadsExploitables() {
  const session  = (window.getRoads             ? window.getRoads()             : []) || [];
  const embedded = (window.getAllEmbeddedRoads  ? window.getAllEmbeddedRoads()  : []) || [];
  return session.concat(embedded).filter(function(r) {
    if (!r || !Array.isArray(r.points) || r.points.length < 2) return false;
    // Built-in + tout custom ; exclus : itinerary, jonction.
    return _RD_TYPES_BUILTIN.indexOf(r.type) !== -1 ||
           String(r.type).indexOf("cust-") === 0;
  });
}

function _rdLongueurPx(road) {
  let total = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// Répartition par type des roads filtrées → { <type>: {nb, distM}, totalM }.
function _rdCalculerBreakdown() {
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
  const out = { totalM: 0 };
  _rdTypesPresents().forEach(function(t) { out[t] = { nb: 0, distM: 0 }; });
  _rdRoadsExploitables().forEach(function(r) {
    // Un type custom jamais vu (dessiné modale ouverte) est inclus par défaut : `undefined` ≠ false.
    if (_rdFiltres[r.type] === false) return;
    if (!out[r.type]) out[r.type] = { nb: 0, distM: 0 };
    const distM = _rdLongueurPx(r) / scale;
    out[r.type].nb    += 1;
    out[r.type].distM += distM;
    out.totalM        += distM;
  });
  return out;
}

// Surlignage magenta des tronçons inclus.
// 🩸 UNE SEULE L.polyline multi-segments ([[seg1], [seg2], …] → un seul <path>) : N éléments SVG avec
// `filter: drop-shadow` font exploser les couches de compositing GPU sur iOS dès une dizaine de routes.
function _rdRedessinerHighlight() {
  if (!window.map) return;
  // Ancienne couche (._map devient null après un changement de plan).
  if (_rdHighlightLayer && _rdHighlightLayer._map) {
    _rdHighlightLayer.clearLayers();
  } else {
    _rdHighlightLayer = L.layerGroup().addTo(window.map);
  }
  const multiSegments = [];
  _rdRoadsExploitables().forEach(function(r) {
    if (_rdFiltres[r.type] === false) return;   // custom inconnu = inclus
    multiSegments.push(r.points.map(function(p) { return convertCoord(p.x, p.y); }));
  });
  if (multiSegments.length === 0) return;  // rien à dessiner (toutes les cases décochées)
  L.polyline(multiSegments, {
    color:     _rdHighlightHex(),
    weight:    9,
    opacity:   0.85,
    renderer:  L.svg(),       // SVG forcé pour drop-shadow CSS
    className: "kta-rd-highlight-polyline",
    interactive: false
  }).addTo(_rdHighlightLayer);
}

// 🩸 Nom volontairement différent de `window._rdEffacerHighlight` : une function declaration top-level devient
// une propriété de window, l'export l'écraserait et les appels internes partiraient dans une récursion infinie.
function _rdInternalEffacerHighlight() {
  if (_rdHighlightLayer) {
    try { _rdHighlightLayer.clearLayers(); } catch(e) {}
    if (window.map && _rdHighlightLayer._map) {
      try { window.map.removeLayer(_rdHighlightLayer); } catch(e) {}
    }
    _rdHighlightLayer = null;
  }
}

// Compteurs et total du panneau, en direct.
function _rdRafraichirAffichage() {
  const b = _rdCalculerBreakdown();
  const setTxt = function(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  Object.keys(b).forEach(function(t) {
    if (t === "totalM") return;
    setTxt("kta-rd-cnt-" + t, b[t].nb + " — " + window.formatDistance(b[t].distM, 1));
  });
  setTxt("kta-rd-total", window.formatDistance(b.totalM, 1));
}

window.ouvrirRoadsDistanceFloater = function() {
  // Déjà ouverte → fermeture en GARDANT le surlignage (persiste jusqu'à ❌ Effacer).
  if (_rdFloater) {
    _rdFloater.remove();
    _rdFloater = null;
    return;
  }

  const roads = _rdRoadsExploitables();
  if (roads.length === 0) {
    window.ktaAlerte(window.I18n.t("disttot.noRoads"));
    return;
  }

  // Filtres conservés si un surlignage est actif (réouverture), sinon tout coché.
  if (!_rdHighlightLayer) {
    // « Tout coché » couvre aussi les types custom présents.
    _rdFiltres = {};
    _rdTypesPresents().forEach(function(t) { _rdFiltres[t] = true; });
  }

  const modal = document.createElement("div");
  modal.id = "kta-rd-modal";
  modal.className = "kta-readme-modal-overlay";
  modal.innerHTML =
    '<div class="kta-readme-modal-boite kta-rd-modal-boite">' +
      '<div class="kta-readme-modal-header">' +
        '<span class="kta-readme-modal-titre">' + window.I18n.t("disttot.modal.titre") + '</span>' +
        '<button class="kta-panneau-close" id="kta-rd-close" type="button">✕</button>' +
      '</div>' +
      '<div class="kta-readme-modal-corps">' +
        '<div class="kta-aide-section">' +
          '<p class="kta-rd-help">' +
            window.I18n.t("disttot.help") +
          '</p>' +
          // Lignes GÉNÉRÉES depuis les types présents. 🔒 L'id DOM garde le type brut, échappé : il vient des
          // données (session partagée, autre compte).
          _rdTypesPresents().map(function(type) {
            return '<label class="kta-rd-row">' +
              '<input type="checkbox" id="kta-rd-chk-' + window.ktaEsc(type) + '"' + (_rdFiltres[type] !== false ? ' checked' : '') + '>' +
              '<span class="kta-rd-swatch" style="background:' + _rdSwatch(type) + ';"></span>' +
              '<span class="kta-rd-label">' + window.ktaEsc(_rdLabelType(type)) + '</span>' +
              '<span class="kta-rd-count" id="kta-rd-cnt-' + window.ktaEsc(type) + '">—</span>' +
            '</label>';
          }).join('') +
          '<div class="kta-rd-total-wrap">' +
            '<span class="kta-rd-total-label">' + window.I18n.t("disttot.total") + '</span>' +
            '<span class="kta-rd-total-value" id="kta-rd-total">—</span>' +
          '</div>' +
        '</div>' +
        '<div class="kta-rd-actions">' +
          '<button id="kta-rd-erase" class="kta-btn kta-btn-danger" type="button">' + window.I18n.t("disttot.btn.erase") + '</button>' +
          '<button id="kta-rd-done"  class="kta-btn kta-btn-primary" type="button">' + window.I18n.t("disttot.btn.close") + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.documentElement.appendChild(modal);
  _rdFloater = modal;

  _rdTypesPresents().forEach(function(type) {
    const chk = document.getElementById("kta-rd-chk-" + type);
    if (!chk) return;
    chk.addEventListener("change", function() {
      _rdFiltres[type] = chk.checked;
      _rdRedessinerHighlight();
      _rdRafraichirAffichage();
    });
  });

  // Fermer (✕ / fond / ✓) GARDE le surlignage.
  function _rdFermerModale() {
    if (_rdFloater) { _rdFloater.remove(); _rdFloater = null; }
  }

  // ❌ Effacer le surlignage ET fermer.
  function _rdToutEffacer() {
    _rdInternalEffacerHighlight();
    if (_rdFloater) { _rdFloater.remove(); _rdFloater = null; }
  }

  document.getElementById("kta-rd-close").addEventListener("click", _rdFermerModale);
  document.getElementById("kta-rd-done").addEventListener("click",  _rdFermerModale);
  document.getElementById("kta-rd-erase").addEventListener("click", _rdToutEffacer);
  modal.addEventListener("click", function(e) { if (e.target === modal) _rdFermerModale(); });

  _rdRedessinerHighlight();
  _rdRafraichirAffichage();
};

// Nettoyage pour main.js (avant changement de plan) : délègue à _rdInternalEffacerHighlight (cf collision de noms).
window._rdEffacerHighlight = function() {
  if (_rdFloater) { _rdFloater.remove(); _rdFloater = null; }
  _rdInternalEffacerHighlight();
};

// État de la distance totale : null sans surlignage, sinon { totalM, breakdown }. Calculé en direct depuis
// _rdHighlightLayer (qui survit à la fermeture) : le DOM .kta-rd-total-value n'existe que modale ouverte.
window.getDistanceTotaleStatus = function() {
  if (!_rdHighlightLayer) return null;
  const b = _rdCalculerBreakdown();
  // Répartition dynamique (built-in toujours, customs présents) ; la barre d'état ne lit que totalM.
  const breakdown = {};
  Object.keys(b).forEach(function(t) {
    if (t !== "totalM") breakdown[t] = { nb: b[t].nb, distM: b[t].distM };
  });
  return { totalM: b.totalM, breakdown: breakdown };
};

// Ensemble des roads changé (road.js > renderRoads, overlayadd/remove) : panneau ouvert → surlignage et
// affichage rejoués, sinon rien.
window._rdOnRoadsChanged = function() {
  if (!_rdFloater) return;
  _rdRedessinerHighlight();
  _rdRafraichirAffichage();
};
