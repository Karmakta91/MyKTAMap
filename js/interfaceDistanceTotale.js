/*!
 * MyKTAMap (c) 2026 Flavien VIDAL (alias KARMA)
 * https://myktamap.fr — Licence CC BY-NC-SA 4.0
 * Usage commercial interdit sans accord ecrit prealable. Voir LICENSE.
 */

// =========================
// INTERFACE DISTANCE TOTALE — Panneau flottant + surlignage magenta
// =========================
// 🆕 v1.31.0 (P3 Lot 2 — découpe interface.js) : module extrait de
// js/interface.js (lignes 8551-8824 avant extraction) pour réduire le
// volume du fichier principal et améliorer la maintenabilité.
//
// Aucun changement de comportement runtime. Les 4 fonctions exposées
// sur `window` + les variables module-level sont strictement identiques
// à v1.30.1. Le scope reste par fichier (chaque <script src=> a son
// propre scope global implicite avec defer + let), donc _rdFloater etc.
// restent isolés de interface.js sans modification.
//
// 📋 API publique (window.*) :
//   - window.ouvrirRoadsDistanceFloater()
//        → Toggle ouverture/fermeture du panneau modale plein écran.
//          Calcule en temps réel la somme des longueurs des polylines
//          (Principal / Secondaire / Chemin) présentes sur le plan,
//          filtrées par checkboxes. Surligne en magenta les tronçons
//          inclus dans le calcul.
//   - window._rdEffacerHighlight()
//        → Cleanup pour main.js avant plan switch. Retire le layer
//          magenta + ferme la modale si ouverte.
//   - window.getDistanceTotaleStatus()
//        → Retourne null si pas de surlignage actif, sinon
//          { totalM, breakdown: { principal, secondaire, chemin } }.
//          Utilisé par le statusbar refonte v1 pour afficher la
//          distance totale même quand la modale est fermée.
//   - window._rdOnRoadsChanged()
//        → Hook appelé par road.js > renderRoads (et listeners
//          overlayadd/remove) quand l'ensemble des roads change. Si
//          le panneau est ouvert, on rejoue le highlight + affichage.
//          Sinon no-op.
//
// 🔌 Dépendances externes (toutes via window.* / Leaflet) :
//   - window.getRoads               [interface.js / main.js]
//   - window.getAllEmbeddedRoads    [main.js]
//   - window.APP_CONFIG.scale       [config.js]
//   - window.formatDistance         [utils.js]
//   - window.map                    [map.js]
//   - convertCoord                  [utils.js — fonction globale]
//   - Leaflet L.polyline / L.svg / L.layerGroup
//
// 📍 Ordre de chargement (cf index.html) :
//   - Doit charger APRÈS interface.js (par cohérence avec le wire-up
//     des hooks main.js > _libererRessourcesPlanPrecedent qui appelle
//     window._rdEffacerHighlight). En pratique : ordre cosmétique car
//     les fonctions sont appelées au runtime (clic user, plan switch),
//     bien après DOMContentLoaded.

// =========================
// DISTANCE TOTALE DES TRACÉS — panneau flottant + surlignage
// =========================
// Calcule la somme des longueurs des polylines (Principal / Secondaire / Chemin)
// présentes sur le plan (session getRoads + calques embarqués visibles getEmbeddedRoads).
// L'utilisateur filtre par type via 3 checkboxes ; le total est mis à jour live et
// les tronçons inclus sont surlignés en magenta avec un halo (même pattern que
// l'itinéraire cyan, mais couleur distincte pour ne pas confondre).
// Le type "itinerary" est exclu (c'est un calcul dérivé du réseau, pas une route
// indépendante).

const _RD_TYPES_BUILTIN = ["principal", "secondaire", "chemin"];

// 🐛 v1.76.0 (F14) — les types CUSTOM comptent aussi.
// La liste était figée aux 3 built-in : un plan tracé entièrement en types
// custom affichait 0 m — le panneau « Distance totale » niait l'existence du
// réseau. La liste des types est désormais calculée sur les tracés PRÉSENTS
// (session + calques), à chaque ouverture : built-in d'abord, puis les customs
// dans l'ordre de découverte. `itinerary` reste exclu (calcul dérivé du
// réseau, pas une route) et `jonction` aussi (bridge inter-niveaux, pas une
// distance parcourue en galerie).
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

// Libellé d'un type pour la modale : custom → nom choisi dans la légende.
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
// 🎨 v1.76.0 — le magenta de surlignage est celui de la jonction (cohérence
// voulue de longue date, elle était jusqu'ici recopiée à la main).
// Résolu à l'APPEL, pas au chargement : styleResolver.js est chargé avant ce
// module, mais lire une couleur au load figerait la valeur avant qu'un futur
// override de légende ne puisse s'appliquer.
function _rdHighlightHex() {
  return (typeof window.ktaSwatchColor === "function" && window.ktaSwatchColor("traces", "jonction")) || "#ff4ecb";
}
// Pastille de couleur d'un type de tracé, dans la modale Distance totale.
function _rdSwatch(type) {
  return (typeof window.ktaSwatchColor === "function" && window.ktaSwatchColor("traces", type)) || "#888888";
}

let _rdFloater         = null;
let _rdHighlightLayer  = null;  // L.layerGroup contenant les polylines magenta
let _rdFiltres         = { principal: true, secondaire: true, chemin: true };

// Collecte toutes les roads pertinentes (session + TOUTES embedded, masquees
// comprises), filtrees pour ne garder que les types principal/secondaire/chemin.
//
// ⚠️ On utilise getAllEmbeddedRoads (pas getEmbeddedRoads) — symetrie avec
// Pathfinder/Search qui prennent tout : le panneau "Distance totale" doit
// donner un chiffre fiable meme si l'utilisateur a masque un calque dans
// le controle des couches (cas typique : routes dessinees en dur sur le PNG
// du plan + calque routes masque pour gagner en perf de rendu — l'utilisateur
// veut quand meme connaitre la distance totale du reseau).
function _rdRoadsExploitables() {
  const session  = (window.getRoads             ? window.getRoads()             : []) || [];
  const embedded = (window.getAllEmbeddedRoads  ? window.getAllEmbeddedRoads()  : []) || [];
  return session.concat(embedded).filter(function(r) {
    if (!r || !Array.isArray(r.points) || r.points.length < 2) return false;
    // F14 : built-in exploitables + tout custom. Exclusions inchangées :
    // itinerary (dérivé) et jonction (bridge inter-niveaux).
    return _RD_TYPES_BUILTIN.indexOf(r.type) !== -1 ||
           String(r.type).indexOf("cust-") === 0;
  });
}

// Longueur d'une road en pixels (somme des distances euclidiennes entre
// points consécutifs).
function _rdLongueurPx(road) {
  let total = 0;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1];
    const b = road.points[i];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// Calcule un breakdown par type sur les roads filtrées par les checkboxes.
// Retourne { principal: {nb, distM}, secondaire: {...}, chemin: {...}, totalM }.
function _rdCalculerBreakdown() {
  const scale = (window.APP_CONFIG && window.APP_CONFIG.scale) ? window.APP_CONFIG.scale : 1;
  const out = { totalM: 0 };
  _rdTypesPresents().forEach(function(t) { out[t] = { nb: 0, distM: 0 }; });
  _rdRoadsExploitables().forEach(function(r) {
    // F14 : un type custom jamais vu (dessiné pendant que la modale est
    // ouverte) est inclus par défaut — `undefined` ≠ false.
    if (_rdFiltres[r.type] === false) return;
    if (!out[r.type]) out[r.type] = { nb: 0, distM: 0 };
    const distM = _rdLongueurPx(r) / scale;
    out[r.type].nb    += 1;
    out[r.type].distM += distM;
    out.totalM        += distM;
  });
  return out;
}

// Dessine (ou redessine) la polyline magenta surlignant les tronçons inclus.
// ⚠️ Perf critique : on utilise UNE SEULE L.polyline avec un array d'arrays
// (multi-segments dans 1 seul élément SVG path). Sans ça, on aurait N éléments
// SVG avec chacun un `filter: drop-shadow` GPU → crash garanti sur mobile dès
// une dizaine de routes (compositing layers explosent en mémoire iOS Safari).
// Leaflet supporte nativement le format [[seg1], [seg2], ...] pour rendre
// plusieurs sous-paths dans UN seul `<path>` SVG — coût ~constant peu importe
// le nombre de routes incluses.
function _rdRedessinerHighlight() {
  if (!window.map) return;
  // Cleanup ancien layer (gestion du cas plan switch : ._map devient null)
  if (_rdHighlightLayer && _rdHighlightLayer._map) {
    _rdHighlightLayer.clearLayers();
  } else {
    _rdHighlightLayer = L.layerGroup().addTo(window.map);
  }
  // Collecte de tous les segments inclus → array d'arrays de latlngs
  const multiSegments = [];
  _rdRoadsExploitables().forEach(function(r) {
    if (_rdFiltres[r.type] === false) return;   // F14 : custom inconnu = inclus
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

// ⚠️ Nom volontairement différent de `window._rdEffacerHighlight` (l'export
// global) — sans ça, function declarations top-level deviennent propriétés
// de window, et l'export plus bas écrasait celle-ci, causant une récursion
// infinie silencieuse (les appels internes à `_rdEffacerHighlight()` partaient
// dans le wrapper export qui se rappelait lui-même).
function _rdInternalEffacerHighlight() {
  if (_rdHighlightLayer) {
    try { _rdHighlightLayer.clearLayers(); } catch(e) {}
    if (window.map && _rdHighlightLayer._map) {
      try { window.map.removeLayer(_rdHighlightLayer); } catch(e) {}
    }
    _rdHighlightLayer = null;
  }
}

// Mise à jour des compteurs et du total dans le panneau flottant (live).
function _rdRafraichirAffichage() {
  const b = _rdCalculerBreakdown();
  const setTxt = function(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  // F14 : toutes les lignes présentes dans la modale, customs compris.
  Object.keys(b).forEach(function(t) {
    if (t === "totalM") return;
    setTxt("kta-rd-cnt-" + t, b[t].nb + " — " + window.formatDistance(b[t].distM, 1));
  });
  setTxt("kta-rd-total", window.formatDistance(b.totalM, 1));
}

window.ouvrirRoadsDistanceFloater = function() {
  // Toggle : si la modale est déjà ouverte, on la ferme (mais on GARDE le
  // surlignage actif, cohérent avec le choix initial "persiste jusqu'à clic
  // ❌ Effacer"). L'utilisateur peut ainsi voir la map avec les tronçons
  // surlignés, puis re-cliquer 📏 pour rouvrir la modale.
  if (_rdFloater) {
    _rdFloater.remove();
    _rdFloater = null;
    return;
  }

  const roads = _rdRoadsExploitables();
  if (roads.length === 0) {
    alert(window.I18n.t("disttot.noRoads"));
    return;
  }

  // Modale plein écran style charte (.kta-readme-modal-overlay) — on conserve
  // les filtres précédents si un highlight était déjà actif (réouverture après
  // fermeture sans avoir cliqué ❌ Effacer). Sinon reset à "tous cochés".
  if (!_rdHighlightLayer) {
    // F14 : « tous cochés » couvre AUSSI les types custom présents.
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
          // F14 : lignes GÉNÉRÉES depuis les types présents (built-in +
          // customs), au lieu de 3 lignes écrites à la main. L'id DOM garde le
          // type brut, échappé : un type vient des données (session partagée, autre compte) — 🔒 05/10/2026.
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

  // Wire-up des checkboxes : toggle filtre + redraw highlight + refresh affichage
  _rdTypesPresents().forEach(function(type) {
    const chk = document.getElementById("kta-rd-chk-" + type);
    if (!chk) return;
    chk.addEventListener("change", function() {
      _rdFiltres[type] = chk.checked;
      _rdRedessinerHighlight();
      _rdRafraichirAffichage();
    });
  });

  // Fermer la modale (✕ / clic backdrop / ✓ Fermer) — on GARDE le surlignage
  function _rdFermerModale() {
    if (_rdFloater) { _rdFloater.remove(); _rdFloater = null; }
  }

  // ❌ Effacer le surlignage ET fermer la modale
  function _rdToutEffacer() {
    _rdInternalEffacerHighlight();
    if (_rdFloater) { _rdFloater.remove(); _rdFloater = null; }
  }

  document.getElementById("kta-rd-close").addEventListener("click", _rdFermerModale);
  document.getElementById("kta-rd-done").addEventListener("click",  _rdFermerModale);
  document.getElementById("kta-rd-erase").addEventListener("click", _rdToutEffacer);
  modal.addEventListener("click", function(e) { if (e.target === modal) _rdFermerModale(); });

  // Premier rendu : highlight + breakdown
  _rdRedessinerHighlight();
  _rdRafraichirAffichage();
};

// Cleanup helper exposé pour main.js (libération avant plan switch).
// Appelle _rdInternalEffacerHighlight (le vrai cleanup) — voir le warning sur
// la collision de noms juste au-dessus de la fonction interne.
window._rdEffacerHighlight = function() {
  if (_rdFloater) { _rdFloater.remove(); _rdFloater = null; }
  _rdInternalEffacerHighlight();
};

// 🆕 API publique : état actuel de la "Distance totale des tracés".
// Retourne null si pas de surlignage actif (= rien à afficher).
// Sinon { totalM, breakdown: {principal,secondaire,chemin} }.
//
// Pourquoi exposer ça : le statusbar refonte v1 lisait avant directement
// le DOM .kta-rd-total-value, qui n'existe que QUAND LA MODALE EST OUVERTE.
// Fermer la modale (en gardant le surlignage magenta) cassait l'affichage
// dans le statusbar — bug remonté KARMA. Avec cette API, on calcule en
// live à partir de _rdHighlightLayer (qui survit à la fermeture modale).
window.getDistanceTotaleStatus = function() {
  // Pas de surlignage actif → aucune donnée à afficher
  if (!_rdHighlightLayer) return null;
  // Surlignage actif : recalcule en live depuis les roads + filtres courants
  const b = _rdCalculerBreakdown();
  // F14 : breakdown DYNAMIQUE — les 3 built-in y sont toujours, les types
  // custom présents s'y ajoutent. Le seul consommateur (statusbar refonte) ne
  // lit que totalM ; le breakdown est là pour l'inspection/debug.
  const breakdown = {};
  Object.keys(b).forEach(function(t) {
    if (t !== "totalM") breakdown[t] = { nb: b[t].nb, distM: b[t].distM };
  });
  return { totalM: b.totalM, breakdown: breakdown };
};

// Hook appelé par road.js > renderRoads (et par le listener overlayadd/remove)
// quand l'ensemble des roads change. Si le panneau est ouvert, on rejoue le
// surlignage et l'affichage. Sinon, no-op.
window._rdOnRoadsChanged = function() {
  if (!_rdFloater) return;
  _rdRedessinerHighlight();
  _rdRafraichirAffichage();
};
