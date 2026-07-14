/*!
 * MyKTAMap — js/sortieUrgence.js (v1.35.0)
 * Mode Sortie d'urgence : identifie les POIs "sortie" (Puits/Escalier/Cavage
 * ouvert OU tag "entrée") et calcule l'itinéraire vers la plus proche depuis
 * la position tracker. Pathfinder = navigable réel (multi-niveau OK).
 *
 * (c) 2026 Flavien VIDAL (alias KARMA)
 * Licence : CC BY-NC-SA 4.0
 */

// =========================
// SORTIE URGENCE — v1.35.0
// =========================
// Cas d'usage : cataphile bloqué/blessé, batterie faible, doit ressortir VITE.
// Le user tape sur le bouton 🚨 (status bar) → l'app :
//   1. Liste les POIs candidats (tags = type-sortie OU "entrée")
//   2. Calcule la distance pathfinder depuis position tracker vers chaque
//   3. Trie par distance navigable réelle (vrai chemin, pas vol d'oiseau)
//   4. Affiche la plus proche + bouton "Tracer l'itinéraire"
//   5. Lien discret "Autres sorties" pour les alternatives
//
// Critère "sortie" (validé KARMA) :
//   - tag in {"Puits à échelon ouvert", "Escalier de service ouvert",
//             "Cavage ouvert"}
//   - OU tag = "entrée"
// Matching case-insensitive + trim accents pour robustesse user.
//
// Cas dégradés :
//   - Tracker inactif → demande clic carte (mode picker)
//   - Pas de POI candidat → toast "Aucune sortie identifiée sur ce plan"
//   - Pathfinder fail pour une sortie → fallback distance euclidienne pour
//     elle seule (warning silencieux, on prend ce qu'on a)
//
// Vibration : trouvée → medium ; aucune → error
//
// API publique :
//   window.SortieUrgence.declencher()        — entrée principale
//   window.SortieUrgence.declencherDepuis(x, y) — variante origine custom
//   window.SortieUrgence.isActive()          — modale ouverte ?
// =========================

(function() {
  "use strict";

  const SU = {};
  let _modal = null;
  let _isPicking = false;          // mode picker carte actif
  let _pickHandler = null;         // handler temporaire map.on("click")
  let _lastResultats = null;       // résultats sortés du dernier calcul (cache)

  // ========== CONSTANTES ==========
  // 🔧 v1.35.1 — Codes courts (pas libellés). KARMA a confirmé que les tags
  // dans les POIs sont des codes : cao / peo / eso (et leurs équivalents
  // fermés caf / pef / esf qu'on EXCLUT car non-traversables).
  //   cao = Cavage Ouvert
  //   peo = Puits à Échelon Ouvert
  //   eso = Escalier de Service Ouvert
  // Comparaison normalisée (lowercase + trim).
  const TYPES_SORTIE = [
    "cao",
    "peo",
    "eso"
  ];
  // Tag "entrée" : un POI tagé "entrée" est aussi une sortie (un cataphile
  // peut sortir par l'endroit d'où il est entré). Comparaison normalisée.
  // À CONFIRMER : si le tag est aussi un code court (genre "ent"), updater ici.
  const TAG_ENTREE = "entrée";

  // ========== HELPERS ==========
  function _norm(s) {
    return String(s || "").trim().toLowerCase();
  }

  // Test si un POI matche le critère sortie (tags ∩ TYPES_SORTIE ≠ ∅ OU
  // tags ⊇ {entrée}). Robuste à l'absence de tags.
  function _estUneSortie(point) {
    if (!point || !Array.isArray(point.tags) || point.tags.length === 0) return false;
    const tagsNorm = point.tags.map(_norm);
    if (tagsNorm.indexOf(TAG_ENTREE) >= 0) return true;
    return tagsNorm.some(function(t) { return TYPES_SORTIE.indexOf(t) >= 0; });
  }

  // Récupère tous les POIs du plan courant (session + data layers embarqués).
  function _tousLesPoints() {
    const out = [];
    if (typeof window.getEditorPoints === "function") {
      const sess = window.getEditorPoints();
      if (Array.isArray(sess)) sess.forEach(function(p) { out.push(p); });
    }
    if (typeof window.getAllEmbeddedPoints === "function") {
      const data = window.getAllEmbeddedPoints();
      if (Array.isArray(data)) data.forEach(function(p) { out.push(p); });
    }
    return out;
  }

  // Distance euclidienne au sol (ignore niveaux + murs — fallback uniquement).
  function _distEucl(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Format distance pour UI (réutilise window.formatDistance si dispo,
  // sinon fallback simple en pixels).
  // 🐛 v1.40.35 — KARMA bug "Cavage Oise : 4.63 km au lieu de 944,5 m" :
  // `distPx` est une somme de distances euclidiennes en **pixels plan**
  // (cf _calculerDistPathfinder ligne ~135) mais `window.formatDistance`
  // attend des **mètres** (cf utils.js ligne 131). On oubliait la conversion
  // `/ APP_CONFIG.scale` (pixels par mètre) — du coup la distance affichée
  // était multipliée par le ratio scale (~4.9 sur le plan Oise).
  // Cohérent avec lostMode.js et measure.js qui font cette conversion.
  function _formatDist(distPx) {
    const scale = (window.APP_CONFIG && typeof window.APP_CONFIG.scale === "number"
                   && window.APP_CONFIG.scale > 0)
                    ? window.APP_CONFIG.scale
                    : 1; // fallback si pas d'échelle (= distance brute en px)
    const distM = distPx / scale;
    if (typeof window.formatDistance === "function") {
      return window.formatDistance(distM, 0);
    }
    // Fallback maison si formatDistance pas chargé
    if (scale === 1) return Math.round(distPx) + " px";
    return distM < 1000
      ? distM.toFixed(0) + " m"
      : (distM / 1000).toFixed(2) + " km";
  }

  // ========== PATHFINDER WRAP ==========
  // Calcule la distance navigable réelle via window.Pathfinder.computeRoute.
  // Retourne Promise<{ distPx, path } | null>. Échec → null (la sortie
  // sera triée à la fin avec sa distance euclidienne en fallback).
  function _calculerDistPathfinder(origine, cible) {
    if (!window.Pathfinder || typeof window.Pathfinder.computeRoute !== "function") {
      return Promise.resolve(null);
    }
    const waypoints = [
      { x: origine.x, y: origine.y, source: "tracker",     label: "Position" },
      { x: cible.x,   y: cible.y,   source: "search",      label: cible.nom || "Sortie" }
    ];
    return window.Pathfinder.computeRoute(waypoints, {
      avoidPoints: [],
      avoidTags:   [],
      avoidRadius: 0
    }).then(function(res) {
      if (!res || !Array.isArray(res.path) || res.path.length < 2) return null;
      // Calcule la longueur cumulée du path (en px plan).
      let d = 0;
      for (let i = 1; i < res.path.length; i++) {
        d += _distEucl(res.path[i - 1], res.path[i]);
      }
      return { distPx: d, path: res.path };
    }).catch(function(err) {
      console.warn("[SortieUrgence] computeRoute échec pour", cible.nom, ":", err);
      return null;
    });
  }

  // ========== PIPELINE ==========
  // Trouve toutes les sorties, calcule leurs distances pathfinder, trie.
  // Retourne Promise<[{point, distPx, path, fallback}, ...]>.
  function _calculerToutesSorties(origine) {
    const points = _tousLesPoints();
    const sorties = points.filter(_estUneSortie);
    if (sorties.length === 0) return Promise.resolve([]);

    // On limite à 15 sorties les plus proches en euclidien d'abord pour
    // éviter de spam le pathfinder sur des cas extrêmes (plan avec 100+
    // entrées tagées). En pratique, un plan typique en a < 10.
    const presort = sorties.map(function(p) {
      return { point: p, dEucl: _distEucl(origine, p) };
    }).sort(function(a, b) { return a.dEucl - b.dEucl; }).slice(0, 15);

    return Promise.all(presort.map(function(item) {
      return _calculerDistPathfinder(origine, item.point).then(function(pf) {
        if (pf) {
          return { point: item.point, distPx: pf.distPx, path: pf.path, fallback: false };
        }
        // Fallback : distance euclidienne (sortie inaccessible par pathfinder,
        // on l'inclut quand même mais marquée fallback dans l'UI).
        return { point: item.point, distPx: item.dEucl, path: null, fallback: true };
      });
    })).then(function(resultats) {
      return resultats.sort(function(a, b) {
        // Les non-fallback d'abord (= vraiment atteignables), puis par dist.
        if (a.fallback !== b.fallback) return a.fallback ? 1 : -1;
        return a.distPx - b.distPx;
      });
    });
  }

  // ========== UI MODALE ==========
  function _ouvrirModale(html) {
    _fermerModale();
    _modal = document.createElement("div");
    _modal.id = "kta-sortie-urgence-modal";
    _modal.className = "kta-readme-modal-overlay kta-sortie-urgence-overlay";
    _modal.innerHTML =
      '<div class="kta-readme-modal-boite kta-sortie-urgence-boite">' +
        '<div class="kta-readme-modal-header">' +
          '<span class="kta-readme-modal-titre">' + window.I18n.t("sortie.modal.titre") + '</span>' +
          '<button class="kta-panneau-close" id="kta-sortie-close" type="button">✕</button>' +
        '</div>' +
        '<div class="kta-readme-modal-corps kta-sortie-urgence-corps">' + html + '</div>' +
      '</div>';
    document.documentElement.appendChild(_modal);
    document.getElementById("kta-sortie-close").addEventListener("click", _fermerModale);
    _modal.addEventListener("click", function(e) {
      if (e.target === _modal) _fermerModale();
    });
    document.addEventListener("keydown", _onKey);
  }

  function _fermerModale() {
    if (_modal && _modal.parentNode) _modal.parentNode.removeChild(_modal);
    _modal = null;
    document.removeEventListener("keydown", _onKey);
  }

  function _onKey(e) {
    if (e.key === "Escape" && _modal) _fermerModale();
  }

  function _rendreContenuPrincipal(resultats, origine) {
    if (!resultats || resultats.length === 0) {
      if (window.kta_vibrate) window.kta_vibrate.error();
      return (
        '<p class="kta-sortie-err">' +
          window.I18n.t("sortie.aucune.titre") +
        '</p>' +
        '<p style="font-size:12px; color:#8892a4;">' +
          window.I18n.t("sortie.aucune.detail") +
        '</p>'
      );
    }

    if (window.kta_vibrate) window.kta_vibrate.medium();

    const meilleure = resultats[0];
    const safeNom = String(meilleure.point.nom || window.I18n.t("sortie.item.sansNom"))
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const distTxt = _formatDist(meilleure.distPx);
    const fallbackBadge = meilleure.fallback
      ? ' <span class="kta-sortie-fallback" title="' + window.I18n.t("sortie.fallback.tooltip") + '">≈</span>'
      : '';
    const levelTxt = (typeof meilleure.point.level === "number" && meilleure.point.level !== 0)
      ? ' <span class="kta-sortie-niveau">' + window.I18n.t("sortie.item.niveau", { level: meilleure.point.level }) + '</span>'
      : '';

    // Cache pour le bouton "Tracer"
    _lastResultats = { resultats: resultats, origine: origine };

    let html =
      '<div class="kta-sortie-principal">' +
        '<div class="kta-sortie-icone">🚪</div>' +
        '<div class="kta-sortie-info">' +
          '<div class="kta-sortie-nom">' + safeNom + levelTxt + '</div>' +
          '<div class="kta-sortie-dist">' + distTxt + fallbackBadge + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="kta-sortie-actions">' +
        '<button type="button" class="kta-btn kta-btn-primary kta-sortie-btn-tracer" ' +
          'onclick="window.SortieUrgence._tracerMeilleure(); return false;">' +
          window.I18n.t("sortie.btn.tracer") +
        '</button>' +
      '</div>';

    if (resultats.length > 1) {
      html += (
        '<div class="kta-sortie-alternatives">' +
          '<button type="button" class="kta-sortie-alt-toggle" ' +
            'onclick="window.SortieUrgence._toggleAlternatives(); return false;">' +
            window.I18n.t("sortie.btn.voirAutres", {
              n: (resultats.length - 1),
              s: (resultats.length - 1 > 1 ? "s" : "")
            }) +
          '</button>' +
          '<ul class="kta-sortie-alt-liste" id="kta-sortie-alt-liste" style="display:none;">'
      );
      for (let i = 1; i < resultats.length; i++) {
        const r = resultats[i];
        const n = String(r.point.nom || window.I18n.t("sortie.item.sansNomCourt"))
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const d = _formatDist(r.distPx);
        const fb = r.fallback ? ' <span class="kta-sortie-fallback">≈</span>' : '';
        const lv = (typeof r.point.level === "number" && r.point.level !== 0)
          ? ' <span class="kta-sortie-niveau">' + window.I18n.t("sortie.item.niveauCourt", { level: r.point.level }) + '</span>'
          : '';
        html += (
          '<li>' +
            '<button type="button" class="kta-sortie-alt-item" data-idx="' + i + '" ' +
              'onclick="window.SortieUrgence._tracerIndex(' + i + '); return false;">' +
              '<strong>' + n + '</strong>' + lv + ' — ' + d + fb +
            '</button>' +
          '</li>'
        );
      }
      html += '</ul></div>';
    }

    return html;
  }

  // Déclenche le tracé de la meilleure (idx 0) → ferme la modale + délègue
  // à window.itineraireYAller.
  SU._tracerMeilleure = function() { SU._tracerIndex(0); };

  SU._tracerIndex = function(idx) {
    if (!_lastResultats || !_lastResultats.resultats) return;
    const r = _lastResultats.resultats[idx];
    if (!r || !r.point) return;
    _fermerModale();
    if (typeof window.itineraireYAller === "function") {
      window.itineraireYAller(r.point.x, r.point.y, r.point.nom || window.I18n.t("sortie.item.nomDefaut"));
    } else {
      alert(window.I18n.t("sortie.erreur.itineraireIndispo"));
    }
  };

  SU._toggleAlternatives = function() {
    const ul = document.getElementById("kta-sortie-alt-liste");
    if (!ul) return;
    ul.style.display = (ul.style.display === "none") ? "" : "none";
    const btn = ul.previousElementSibling;
    if (btn) btn.textContent = btn.textContent.replace(/^[▾▸]/, ul.style.display === "none" ? "▾" : "▸");
  };

  // ========== ENTRÉES ==========
  // Entrée principale : récupère position tracker, lance calcul, affiche.
  // Si pas de tracker actif → propose mode picker (clic carte).
  function declencher() {
    const pos = (typeof window.getTrackingPosition === "function")
      ? window.getTrackingPosition()
      : null;
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      _lancer(pos);
      return;
    }
    // Pas de tracker : propose le picker
    _ouvrirModale(
      '<p class="kta-sortie-err">' +
        window.I18n.t("sortie.noTracker.titre") +
      '</p>' +
      '<p style="font-size:13px; color:#c8d0e0; line-height:1.5;">' +
        window.I18n.t("sortie.noTracker.detail") +
      '</p>' +
      '<div class="kta-sortie-actions" style="flex-direction:column; gap:8px;">' +
        '<button type="button" class="kta-btn kta-btn-primary" ' +
          'onclick="window.SortieUrgence._modePickerCarte(); return false;">' +
          window.I18n.t("sortie.btn.cliquePosition") +
        '</button>' +
        '<button type="button" class="kta-btn kta-btn-ghost" ' +
          'onclick="window.SortieUrgence._fermer(); return false;">' +
          window.I18n.t("sortie.btn.annuler") +
        '</button>' +
      '</div>'
    );
  }

  // Variante : déclenche depuis une position arbitraire (utilisée par la
  // commande vocale qui pourrait passer un POI de référence à l'avenir).
  function declencherDepuis(x, y) {
    if (typeof x !== "number" || typeof y !== "number") {
      declencher();
      return;
    }
    _lancer({ x: x, y: y });
  }

  async function _lancer(origine) {
    _ouvrirModale(
      '<div class="kta-sortie-loader">' +
        '<div class="kta-sortie-spinner"></div>' +
        '<p>' + window.I18n.t("sortie.loader") + '</p>' +
      '</div>'
    );
    // 🌀 v1.55.1 : yield-to-paint AVANT le batch de Pathfinder.computeRoute
    // (jusqu'à 15 Dijkstra SYNC bloquants). Sans une frame peinte ici, le
    // spinner de la modale ne s'affiche pas et l'écran fige « sans rien
    // montrer » — même cause que l'overlay itinéraire (cf computeLoader.js).
    await new Promise(function(r) { requestAnimationFrame(function() { setTimeout(r, 0); }); });
    _calculerToutesSorties(origine).then(function(resultats) {
      // On peut être interrompu si l'user ferme la modale entre temps
      if (!_modal) return;
      const corps = _modal.querySelector(".kta-sortie-urgence-corps");
      if (corps) corps.innerHTML = _rendreContenuPrincipal(resultats, origine);
    });
  }

  SU._modePickerCarte = function() {
    _fermerModale();
    if (!window.map) {
      alert(window.I18n.t("sortie.erreur.carteIndispo"));
      return;
    }
    _isPicking = true;
    // Affiche un toast discret pour guider l'user
    if (typeof window._kta_showToast === "function") {
      window._kta_showToast(window.I18n.t("sortie.toast.pickPosition"), "info");
    }
    _pickHandler = function(e) {
      _isPicking = false;
      try { window.map.off("click", _pickHandler); } catch(err) {}
      _pickHandler = null;
      const ll = e.latlng;
      const imgH = (window.APP_CONFIG && window.APP_CONFIG.imageHeight) || 0;
      // convertCoord inverse : x=lng, y=imgH-lat
      const x = ll.lng;
      const y = imgH - ll.lat;
      _lancer({ x: x, y: y });
    };
    window.map.on("click", _pickHandler);
  };

  SU._fermer = function() { _fermerModale(); };

  // ========== EXPORT ==========
  SU.declencher       = declencher;
  SU.declencherDepuis = declencherDepuis;
  SU.isActive         = function() { return !!_modal; };

  window.SortieUrgence = SU;

  console.log("[SortieUrgence] Module chargé (v1.35.0 — sortie + pathfinder)");
})();
